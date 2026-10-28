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
"""

from __future__ import annotations

import json
import math
import re

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
