"""Genupload af et eksporteret værksark som ny revision af samme værk (runde 12, KONTRAKT §6d).

Appen eksporterer et værk til modelrepoets ``vaerksdata_skabelon.xlsx``. Skabelonen kan ikke bære alt i et værk
(balancemarked, nettilslutning, slåede-fra enheder, kalibrerede varmelastparametre …), og modelscriptet
``scripts/vaerksark_til_yaml.py`` sætter selv nogle felter (startfyldning, CO2-faktor …). Ved genupload må
INTET af det ændre værket. Derfor sammenlignes scriptets læsning af to ark:

* **basis**  = en ny eksport af værkets nuværende revision (lavet af appen ved uploaden; samme indhold som det,
  brugeren hentede — sha256 i den skjulte markering ``_app`` binder dem), og
* **arket**  = brugerens redigerede ark,

begge kørt gennem scriptet uændret. Kun det, der er forskelligt mellem de to, er brugerens ændring; det lægges
på værkets nuværende blade. Felter, arket ikke kan bære, er ens i begge og røres derfor aldrig.

**Regnearkets præcision (målt i runde 12).** Et regneark gemmer et tal med højst 15 betydende cifre (Excel; openpyxl
skriver 16). En målt værdi som ``4.6000000000000005`` (Billunds splejsede serie) kommer derfor tilbage som en anden
double, selv om brugeren ikke rørte cellen — målt: 1.927 af 8.760 timer "ændret" af en ren D&V-rettelse. Forskelle
afgøres derfor med regnearkets præcision (15 betydende cifre); en rigtig rettelse ændrer langt mere end det.

Konverteringens egne artefakter (casens meta, tidsvinduet, solver, de skalerede varmelastparametre, noter og
filstier) beskriver konverteringen, ikke brugerens ark, og anvendes aldrig. Tidsserier sammenlignes time for
time; kun ændrede timer lægges på værkets gemte serie, så timer uden for arkets periode bevares.

Skrivningen følger KONTRAKT §3.3b som ``udfoerAendring``: gyldige stier, JSON inden for 4000 tegn, endelige tal,
intet blad over/under et andet, ``forventet_revision`` = værkets revision i samme transaktion.

**Bindingen til værket (Codex K11 F4).** Klientens basis og hash beviser kun, at filerne er dem, anmodningen nævner —
ikke at de stammer fra målværkets revision. Derfor bærer markeringen (``_app``, format 2) et **grundlag**: sha256 af
værkets blade og aktive seriers sha256, som eksporten så dem. Importen beregner grundlaget fra databasen i samme
transaktion, der skriver, og kræver (1) samme værk, revision og grundlag i arket og basis, (2) grundlag = værkets
nuværende, og (3) at modelscriptets læsning af basis er værket — bortset fra eksportens erklærede afvigelser (de felter,
skabelonen ikke kan bære). Et ark fra værk A kan dermed ikke gemmes på værk B, og en basis, der ikke er værkets
eksport, afvises i stedet for at blive grundlaget for en "ændring".

**Objektnavne (K11 F1).** Scriptets ``slug()`` normaliserer enheds- og lagernavne (``halm__kedel`` -> ``halm_kedel``).
Scriptets navne føres tilbage til værkets egne objekter; to objekter med samme slug, eller et nyt objekt i arket, hvis
slug er et eksisterende objekts, er tvetydigt og afvises.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
import zipfile
from pathlib import Path

FORMAT = "fjv-vaerksark-eksport/2"
SERIEROLLER = ("solprofil", "varmelast")

MAKS_STI = 400
MAKS_JSON = 4000
OBJEKT_SEKTIONER = ("units", "storage", "prices")
_STI_DEL = re.compile(r"^[^.\s][^.]*$")
_FARLIGE = {"__proto__", "constructor", "prototype"}

#: Konverteringens artefakter: de beskriver konverteringen, ikke brugerens ark, og anvendes aldrig.
ARTEFAKT_SEKTIONER = ("meta", "time", "solver", "heat_load_params")
ARTEFAKT_STIER = ("prices.natural_gas.note", "electricity.tariff_consumption.source")
ARTEFAKT_HALER = (".notes", ".production_profile_path")


class RevisionsFejl(ValueError):
    """Revisionen kan ikke gemmes. Beskeden er til brugeren."""


def _p15(v):
    """Værdien med regnearkets præcision: floats til 15 betydende cifre (rekursivt)."""
    if isinstance(v, float):
        return float(f"{v:.15g}") if math.isfinite(v) else v
    if isinstance(v, list):
        return [_p15(x) for x in v]
    if isinstance(v, dict):
        return {k: _p15(x) for k, x in v.items()}
    return v


def samme_vaerdi(a: str | None, b: str | None) -> bool:
    """To vaerdi_json er ens med regnearkets præcision (og ens type: tal, tekst, bool, null)."""
    if a == b:
        return True
    if a is None or b is None:
        return False
    try:
        x, y = json.loads(a), json.loads(b)
    except ValueError:
        return False
    return type(x) is type(y) and _p15(x) == _p15(y)


def samme_tal(a: str, b: str) -> bool:
    return a == b or float(f"{float(a):.15g}") == float(f"{float(b):.15g}")


def er_artefakt(sti: str) -> bool:
    return (sti.split(".")[0] in ARTEFAKT_SEKTIONER or sti in ARTEFAKT_STIER
            or (sti.split(".")[0] in ("units", "storage") and sti.endswith(ARTEFAKT_HALER)))


def gyldig_sti(sti: str) -> bool:
    """Som appens ``gyldigSti`` (logik.ts)."""
    return bool(sti) and len(sti) <= MAKS_STI and all(_STI_DEL.match(d) and d not in _FARLIGE for d in sti.split("."))


def _objekter(blade: dict, sektion: str) -> set[str]:
    return {s.split(".")[1] for s in blade if s.startswith(f"{sektion}.") and len(s.split(".")) > 2}


def forskelle(basis: dict, arket: dict) -> list[dict]:
    """Brugerens ændringer: hvad scriptet læser anderledes i arket end i basis (begge ``sti -> vaerdi_json``).

    En enhed/et lager/et brændsel, der er væk i arket, bliver én ``slet_objekt`` (hele objektet, også de felter,
    arket aldrig bar). Et nyt objekt får alle scriptets felter som ``opret``."""
    ud: list[dict] = []
    vaek = set()
    for sek in OBJEKT_SEKTIONER:
        for o in sorted(_objekter(basis, sek) - _objekter(arket, sek)):
            vaek.add(f"{sek}.{o}")
            ud.append({"sti": f"{sek}.{o}", "handling": "slet_objekt", "gammel_json": None, "ny_json": None})
    for sti in sorted(set(basis) | set(arket)):
        if er_artefakt(sti) or any(sti.startswith(f"{v}.") for v in vaek):
            continue
        g, n = basis.get(sti), arket.get(sti)
        if samme_vaerdi(g, n):
            continue
        ud.append({"sti": sti, "handling": "slet" if n is None else ("opret" if g is None else "ret"),
                   "gammel_json": g, "ny_json": n})
    return ud


def _endelig(v) -> bool:
    if isinstance(v, float):
        return math.isfinite(v)
    if isinstance(v, list):
        return all(_endelig(x) for x in v)
    if isinstance(v, dict):
        return all(_endelig(x) for x in v.values())
    return True


def planlaeg(nuvaerende: dict, aendringer: list[dict]) -> dict:
    """Brugerens ændringer lagt på værkets NUVÆRENDE blade -> ``{opret, ret, slet}`` som ``planlaegParametre``.

    ``ret``/``opret`` sætter stien til arkets værdi (opret, hvis værket ikke har den); ``slet`` fjerner den, hvis
    den findes; ``slet_objekt`` fjerner alle værkets blade under objektet. Validering som en anmodning i appen."""
    plan = {"opret": [], "ret": [], "slet": []}
    slettes: set[str] = set()
    for a in aendringer:
        if a["handling"] == "slet_objekt":
            slettes |= {s for s in nuvaerende if s.startswith(f"{a['sti']}.")}
    saet: dict[str, str] = {}
    for a in aendringer:
        sti = a["sti"]
        if a["handling"] == "slet_objekt":
            continue
        if not gyldig_sti(sti):
            raise RevisionsFejl(f"Arket giver en ugyldig sti {sti!r}.")
        if a["handling"] == "slet":
            if sti in nuvaerende:
                slettes.add(sti)
            continue
        ny = a["ny_json"]
        if len(ny) > MAKS_JSON:
            raise RevisionsFejl(f"{sti}: værdien er for lang (højst {MAKS_JSON} tegn).")
        try:
            v = json.loads(ny)
        except ValueError as e:
            raise RevisionsFejl(f"{sti}: værdien er ikke gyldig JSON.") from e
        if not _endelig(v):
            raise RevisionsFejl(f"{sti}: værdien er ikke et endeligt tal.")
        saet[sti] = ny
    for sti in sorted(slettes):
        plan["slet"].append({"sti": sti, "gammel_json": nuvaerende[sti]})
    efter = (set(nuvaerende) - slettes)
    for sti, ny in saet.items():
        if sti in nuvaerende and sti not in slettes:
            if nuvaerende[sti] != ny:
                plan["ret"].append({"sti": sti, "gammel_json": nuvaerende[sti], "ny_json": ny})
        else:
            d = sti.split(".")
            plan["opret"].append({"sti": sti, "ny_json": ny, "sektion": d[0],
                                  "objekt": d[1] if d[0] in OBJEKT_SEKTIONER and len(d) > 2 else None})
            efter.add(sti)
    # Intet blad over eller under et andet (ellers kan YAML'en ikke genskabes) — som samlNytVaerk/planlaegParametre.
    for sti in efter:
        d = sti.split(".")
        for i in range(1, len(d)):
            if ".".join(d[:i]) in efter:
                raise RevisionsFejl(f"{'.'.join(d[:i])!r} kan ikke være en værdi, fordi {sti!r} ligger under den.")
    return plan


def anvend(nuvaerende: dict, plan: dict) -> dict:
    """Bladene efter planen (til test og til at bygge værket efter revisionen)."""
    ud = dict(nuvaerende)
    for r in plan["slet"]:
        ud.pop(r["sti"], None)
    for r in plan["ret"]:
        ud[r["sti"]] = r["ny_json"]
    for r in plan["opret"]:
        ud[r["sti"]] = r["ny_json"]
    return ud


# ------------------------------------------------------------------ binding og navne (K11 F1, F4)

def slug(navn: str) -> str:
    """``slug()`` i scripts/vaerksark_til_yaml.py:101-108 tegn for tegn (NFKD FØR æøå erstattes, så ``å`` -> ``a``
    og et stort Æ/Ø falder bort). Rundturs-beviset holder den op mod scriptets egen funktion."""
    s = unicodedata.normalize("NFKD", str(navn))
    s = s.replace("æ", "ae").replace("ø", "oe").replace("å", "aa")
    s = s.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def grundlag(blade: dict, serier: dict) -> str:
    """sha256 af værkets tilstand, som eksporten så den: bladene (sti, vaerdi_json) sorteret + de aktive seriers sha256.
    Samme definition som ``grundlag()`` i app/src/sider/konfiguration/eksport/eksporter.ts."""
    obj = {"b": sorted([s, v] for s, v in blade.items()), "s": [[r, serier.get(r)] for r in SERIEROLLER]}
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()


_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_NS_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def _xml_tekst(s: str) -> str:
    """OOXML's ``_xHHHH_``-kodning tilbage til tegn (``_x005F_`` er et bogstaveligt ``_``)."""
    return re.sub(r"_x([0-9A-Fa-f]{4})_", lambda m: chr(int(m.group(1), 16)), s)


def laes_markering(sti: Path) -> dict | None:
    """Den skjulte markering ``_app`` i et uploadet ark (kun standardbiblioteket: zip + XML), eller None."""
    import xml.etree.ElementTree as ET
    try:
        with zipfile.ZipFile(sti) as z:
            wb = ET.fromstring(z.read("xl/workbook.xml"))
            ark = next((s for s in wb.iter(f"{_NS}sheet") if s.get("name") == "_app"), None)
            if ark is None:
                return None
            rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
            mål = next(r.get("Target") for r in rels if r.get("Id") == ark.get(f"{_NS_R}id"))
            delte: list[str] = []
            if "xl/sharedStrings.xml" in z.namelist():
                delte = ["".join(t.text or "" for t in si.iter(f"{_NS}t"))
                         for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{_NS}si")]
            data = ET.fromstring(z.read("xl/" + mål.lstrip("/").removeprefix("xl/")))
    except (KeyError, StopIteration, zipfile.BadZipFile, ET.ParseError, OSError):
        return None
    celler: dict[str, str] = {}
    for c in data.iter(f"{_NS}c"):
        t, v = c.get("t"), c.find(f"{_NS}v")
        if t == "inlineStr":
            tekst = "".join(x.text or "" for x in c.iter(f"{_NS}t"))
        elif t == "s" and v is not None:
            tekst = delte[int(v.text)]
        else:
            tekst = v.text if v is not None else ""
        celler[c.get("r")] = _xml_tekst(tekst or "")
    kv = {celler.get(f"A{r}", ""): celler.get(f"B{r}", "") for r in range(1, 41)}
    try:
        m = {"format": kv.get("format", ""), "vaerk_id": kv.get("vaerk_id", "").lower(),
             "revision": int(float(kv.get("revision", "nan"))), "sha256": kv.get("sha256", "").lower(),
             "grundlag": kv.get("grundlag", "").lower(), "afvigelser": json.loads(kv.get("afvigelser") or "[]")}
    except (ValueError, TypeError):
        return None
    return m if isinstance(m["afvigelser"], list) else None


def tjek_markeringer(ark: dict | None, basis: dict | None, vaerk_id: str, revision: int) -> dict:
    """Arket og basis skal bære samme markering (format 2), for netop dette værk og denne revision."""
    if not ark or not basis:
        raise RevisionsFejl("arket eller basis mangler appens markering (det skjulte ark _app) - eksportér værket igen")
    for m in (ark, basis):
        if m["format"] != FORMAT or len(m["grundlag"]) != 64:
            raise RevisionsFejl("arket er eksporteret af en anden udgave af appen - eksportér værket igen")
    felter = ("vaerk_id", "revision", "sha256", "grundlag", "afvigelser")
    if any(ark[f] != basis[f] for f in felter):
        raise RevisionsFejl("arket og basis stammer ikke fra samme eksport - upload arket igen")
    if ark["vaerk_id"] != vaerk_id.lower():
        raise RevisionsFejl("arket er eksporteret fra et andet værk end det, uploaden gælder - intet er gemt")
    if ark["revision"] != int(revision):
        raise RevisionsFejl(f"arket er fra revision {ark['revision']}, men uploaden gælder revision {revision} - "
                            "intet er gemt")
    return ark


def objektkort(nuvaerende: dict, basis: dict, arket: dict) -> dict:
    """{(sektion, scriptnavn): værkets objektnavn} for enheder og lagre. Tvetydighed afvises (K11 F1).

    Et objekt i basis skal svare til præcis ét af værkets objekter med samme slug. Et NYT objekt i arket (ikke i
    basis) må ikke have et eksisterende objekts slug — det ville overskrive et objekt, arket ikke bar (fx slået fra)."""
    kort: dict = {}
    for sek in ("units", "storage"):
        egne = _objekter(nuvaerende, sek)
        i_basis = _objekter(basis, sek)
        for s in sorted(i_basis | _objekter(arket, sek)):
            kandidater = sorted(o for o in egne if slug(o) == s)
            if s in i_basis:
                if len(kandidater) != 1:
                    raise RevisionsFejl(
                        f"{sek}.{s} i arket kan ikke føres entydigt tilbage til værket (kandidater: "
                        f"{', '.join(kandidater) or 'ingen'}); modelscriptet giver flere objekter samme navn - "
                        "omdøb dem i appen, og eksportér igen")
                kort[(sek, s)] = kandidater[0]
            elif kandidater:
                raise RevisionsFejl(
                    f"den nye {'enhed' if sek == 'units' else 'tank'} {s!r} i arket har samme navn som værkets "
                    f"{', '.join(kandidater)}, som ikke står i arket - giv den et andet navn")
            else:
                kort[(sek, s)] = s
    return kort


def oversaet(blade: dict, kort: dict) -> dict:
    """Bladene med scriptets objektnavne skiftet til værkets (``objektkort``)."""
    ud = {}
    for sti, v in blade.items():
        d = sti.split(".")
        if d[0] in ("units", "storage") and len(d) > 2 and (d[0], d[1]) in kort:
            d[1] = kort[(d[0], d[1])]
        ud[".".join(d)] = v
    return ud


def tjek_basis(nuvaerende: dict, basis: dict, afvigelser: list) -> list[str]:
    """Stier, hvor modelscriptets læsning af basis ikke er værket, og som eksporten ikke har erklæret (K11 F4).
    Tom liste = basis er værkets eksport."""
    tilladt = set(afvigelser)
    return [s for s in sorted(set(nuvaerende) | set(basis))
            if not er_artefakt(s) and s not in tilladt and not samme_vaerdi(nuvaerende.get(s), basis.get(s))]


#: Ændringer i arket, som scriptet omsætter til konverteringens egne felter — og som derfor ikke gemmes (K11 F5).
IKKE_GEMT = {
    "heat_load_params": "varmelastens syntese-parametre (heat_load_params), som modelscriptet regner ud fra "
                        "årsproduktionen i Timedata!B3 eller timedata, gemmes ikke ved genupload",
    "meta": "værkets navn (Priser, 'værkets navn') ændrer ikke værkets navn eller kode ved genupload",
}


def ikke_gemt(basis: dict, arket: dict, serier: tuple | list | set = ()) -> list[str]:
    """Det, scriptet læser forskelligt i arket, men som aldrig gemmes — siges højt i importens log (K11 F5).

    Ændres varmelastens timer, regner scriptet også syntese-parametrene om; det er en følge af serieændringen, som
    gemmes, og siges derfor ikke som en ignoreret ændring."""
    sektioner = {s.split(".")[0] for s in set(basis) | set(arket)
                 if (s.startswith("heat_load_params.") or s == "meta.titel") and not samme_vaerdi(basis.get(s), arket.get(s))}
    if "varmelast" in serier:
        sektioner.discard("heat_load_params")
    return [IKKE_GEMT[s] for s in sorted(sektioner)]


# ------------------------------------------------------------------ tidsserier

def punkter(normaliseret: bytes | None) -> dict:
    """Normaliseret fil (``time,mw``) -> {tid: værditekst}. Tom ved None."""
    if not normaliseret:
        return {}
    rk = normaliseret.decode("utf-8").strip().split("\n")[1:]
    return dict(r.split(",", 1) for r in rk if r)


def serieaendringer(basis: dict, arket: dict) -> dict:
    """Timer, der er ændret/tilføjet/fjernet i arkets serie i forhold til basis (scriptets output begge)."""
    return {"ret": {t: v for t, v in arket.items() if t in basis and not samme_tal(basis[t], v)},
            "opret": {t: v for t, v in arket.items() if t not in basis},
            "slet": sorted(t for t in basis if t not in arket)}


def flet_serie(gemt: dict, aendr: dict) -> str:
    """Værkets gemte serie med arkets ændrede timer -> CSV-tekst (``time,mw``) til normalisering."""
    ud = dict(gemt)
    for t in aendr["slet"]:
        ud.pop(t, None)
    ud.update(aendr["ret"])
    ud.update(aendr["opret"])
    return "time,mw\n" + "".join(f"{t},{ud[t]}\n" for t in sorted(ud))


def har_aendringer(aendr: dict) -> bool:
    return bool(aendr["ret"] or aendr["opret"] or aendr["slet"])


def opsummer(aendr: dict, basis: dict, arket: dict) -> str:
    sb = sum(float(v) for v in basis.values()) / 1000
    sa = sum(float(v) for v in arket.values()) / 1000
    return (f"{len(aendr['ret'])} timer ændret, {len(aendr['opret'])} tilføjet, {len(aendr['slet'])} fjernet; "
            f"sum i arket {sb:.3f} -> {sa:.3f} GWh")


__all__ = ["RevisionsFejl", "er_artefakt", "forskelle", "planlaeg", "anvend", "punkter", "serieaendringer",
           "flet_serie", "har_aendringer", "opsummer"]
