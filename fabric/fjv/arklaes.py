"""Et .xlsx læst som celleværdier — kun standardbiblioteket (zip + XML), runde 14.

Importen kører i arbejderens eget Python, som ikke nødvendigvis har openpyxl (det har kun modelscriptets venv).
Appens egne faner i værksarket (``fjv.arklag``) og kontrollen af rækker, modelscriptet ville springe over, læses
derfor her. Læseren giver præcis det, et regneark viser: tal som ``float``/``int``, tekst som ``str``, sand/falsk
som ``bool``; en formel giver sit gemte resultat (som pandas/openpyxl med ``data_only``). Tomme celler udelades.

``celler[(række, kolonne)]`` er 1-baseret som regnearket (``(4, 1)`` = A4).

**Grænser (Codex' review af runde 14, fund 1).** Læsningen sker i arbejderprocessen, uden for modelscriptets
underproces med dens tidsgrænse og hukommelsesloft. Den har derfor sine egne grænser, og arbejdet følger antallet
af celler, aldrig et tal afsenderen vælger:

* en cellereference uden for et regnearks grænser (række 1.048.576, kolonne XFD) afvises — en fil på 749 bytes med
  ``A999999999999`` fik ellers kontrollen af tavse rækker til at gennemløbe en billion rækkenumre;
* hver fane, læseren åbner, må højst fylde ``MAKS_FANE_BYTES`` udpakket og have ``MAKS_CELLER`` celler, og de delte
  strenge højst ``MAKS_STRENGE``; XML'en læses som en strøm (``iterparse``), så hukommelsen følger grænsen;
* XML med ``<!DOCTYPE`` eller ``<!ENTITY`` afvises (et regneark har ingen; entiteter kan folde sig ud).

**En formel uden gemt resultat (fund 2)** er ikke en tom celle: den læses som ``FORMEL_UDEN_RESULTAT``, så den, der
bruger cellen, kan afvise den med ark og celle i stedet for at behandle den som bevidst tømt.
"""

from __future__ import annotations

import io
import re
import zipfile
from pathlib import Path

_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_NS_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_REF = re.compile(r"^([A-Z]{1,3})(\d{1,7})$")

#: Et regnearks grænser (Excel): række 1.048.576, kolonne XFD.
MAKS_RAEKKE = 1_048_576
MAKS_KOLONNE = 16_384
#: Ressourcegrænser for de faner, læseren åbner (appens tre faner, Anlaeg og Varmepumpe har få hundrede celler).
MAKS_FANE_BYTES = 8 * 2 ** 20
MAKS_CELLER = 50_000
MAKS_STRENGE = 500_000
MAKS_STRENGE_BYTES = 16 * 2 ** 20


class LaeseFejl(ValueError):
    """Filen kan ikke læses som et regneark. Beskeden er til brugeren."""


class _FormelUdenResultat:
    """Cellen har en formel, men filen har intet gemt resultat (gemt af et program, der ikke regner formler)."""

    def __repr__(self) -> str:
        return "<formel uden gemt resultat>"


FORMEL_UDEN_RESULTAT = _FormelUdenResultat()


def kolonne_nr(bogstaver: str) -> int:
    n = 0
    for c in bogstaver:
        n = n * 26 + (ord(c) - 64)
    return n


def kolonne_bogstav(nr: int) -> str:
    s = ""
    while nr > 0:
        nr, r = divmod(nr - 1, 26)
        s = chr(65 + r) + s
    return s


def ref(raekke: int, kolonne: int) -> str:
    """``(5, 4)`` -> ``"D5"`` (til fejlbeskeder: ark, celle og grund)."""
    return f"{kolonne_bogstav(kolonne)}{raekke}"


def _xml_tekst(s: str) -> str:
    """OOXML's ``_xHHHH_``-kodning tilbage til tegn (``_x005F_`` er et bogstaveligt ``_``) — som Excel og
    ``fjv.revision.laes_markering`` læser den."""
    return re.sub(r"_x([0-9A-Fa-f]{4})_", lambda m: chr(int(m.group(1), 16)), s)


def _tal(tekst: str):
    """``<v>`` som tal: heltal, når teksten er et heltal (som openpyxl), ellers float."""
    t = tekst.strip()
    if re.fullmatch(r"-?\d+", t):
        return int(t)
    return float(t)


def _del(z: zipfile.ZipFile, navn: str, maks: int, hvad: str) -> bytes:
    """Et medlem af zip'en, kun hvis det oplyste OG det faktisk udpakkede er inden for grænsen, og uden DOCTYPE."""
    info = z.getinfo(navn)
    if info.file_size > maks:
        raise LaeseFejl(f"{hvad} fylder {info.file_size / 2 ** 20:.1f} MiB udpakket (højst {maks // 2 ** 20} MiB) - "
                        "den indeholder mere end et værksark")
    with z.open(info) as f:
        data = f.read(maks + 1)                     # et katalog, der lyver om størrelsen, stopper her
    if len(data) > maks:
        raise LaeseFejl(f"{hvad} fylder mere end {maks // 2 ** 20} MiB udpakket - den indeholder mere end et værksark")
    if b"<!DOCTYPE" in data[:4096] or b"<!ENTITY" in data:
        raise LaeseFejl(f"{hvad} har en DOCTYPE eller entiteter i sin XML - det har et regneark ikke")
    return data


def _delte_strenge(z: zipfile.ZipFile) -> list[str]:
    import xml.etree.ElementTree as ET
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    ud: list[str] = []
    for _h, e in ET.iterparse(io.BytesIO(_del(z, "xl/sharedStrings.xml", MAKS_STRENGE_BYTES, "arkets tekster"))):
        if e.tag != f"{_NS}si":
            continue
        # Fonetiske tilføjelser (<rPh>) er ikke cellens tekst (som openpyxl).
        fonetisk = {id(t) for rph in e.iter(f"{_NS}rPh") for t in rph.iter(f"{_NS}t")}
        ud.append("".join(t.text or "" for t in e.iter(f"{_NS}t") if id(t) not in fonetisk))
        if len(ud) > MAKS_STRENGE:
            raise LaeseFejl(f"arket har flere end {MAKS_STRENGE} tekster - det indeholder mere end et værksark")
        e.clear()
    return ud


def _laes_fane(data: bytes, navn: str, delte: list[str]) -> dict:
    import xml.etree.ElementTree as ET
    celler: dict = {}
    n = 0
    for _h, c in ET.iterparse(io.BytesIO(data)):
        if c.tag == f"{_NS}row":
            c.clear()                                # rækken er læst; hold kun cellekortet i hukommelsen
            continue
        if c.tag != f"{_NS}c":
            continue
        n += 1
        if n > MAKS_CELLER:
            raise LaeseFejl(f"fanen {navn} har flere end {MAKS_CELLER} celler - den indeholder mere end et værksark")
        r = c.get("r") or ""
        m = _REF.match(r)
        if not m or not 1 <= int(m.group(2)) <= MAKS_RAEKKE or not 1 <= kolonne_nr(m.group(1)) <= MAKS_KOLONNE:
            raise LaeseFejl(f"cellen {r[:24]!r} i fanen {navn} ligger uden for et regnearks grænser "
                            f"(række {MAKS_RAEKKE}, kolonne {kolonne_bogstav(MAKS_KOLONNE)})")
        t, v, formel = c.get("t"), c.find(f"{_NS}v"), c.find(f"{_NS}f") is not None
        if t == "inlineStr":
            vaerdi = _xml_tekst("".join(x.text or "" for x in c.iter(f"{_NS}t")))
        elif t == "s":
            vaerdi = _xml_tekst(delte[int(v.text)]) if v is not None and v.text is not None else None
        elif t in ("str", "e"):
            vaerdi = _xml_tekst(v.text or "") if v is not None else None
        elif t == "b":
            # Et tomt <v/> er intet resultat, ikke "nej" (Codex' andet review: en boolsk formel uden gemt resultat
            # slog en enhed fra). Først om der er et resultat, så dets type.
            vaerdi = v.text.strip() == "1" if v is not None and (v.text or "").strip() else None
        else:
            vaerdi = _tal(v.text) if v is not None and (v.text or "").strip() else None
        if vaerdi is None or vaerdi == "":
            if not formel:
                continue
            vaerdi = FORMEL_UDEN_RESULTAT            # ikke en tom celle (Codex fund 2)
        celler[(int(m.group(2)), kolonne_nr(m.group(1)))] = vaerdi
    return celler


def laes_ark(sti: Path, kun: tuple | None = None) -> dict:
    """``{arknavn: {(række, kolonne): værdi}}`` for arbejdsbogens ark (``kun`` = disse arknavne).

    Rejser ``LaeseFejl``, hvis filen ikke er en xlsx, der kan læses inden for grænserne (se modulets hoved)."""
    import xml.etree.ElementTree as ET
    ud: dict = {}
    try:
        with zipfile.ZipFile(sti) as z:
            wb = ET.fromstring(_del(z, "xl/workbook.xml", 2 ** 20, "arbejdsbogens oversigt"))
            rels = {r.get("Id"): r.get("Target")
                    for r in ET.fromstring(_del(z, "xl/_rels/workbook.xml.rels", 2 ** 20, "arbejdsbogens oversigt"))}
            delte = None
            for s in wb.iter(f"{_NS}sheet"):
                navn = s.get("name")
                if kun is not None and navn not in kun:
                    continue
                maal = rels.get(s.get(f"{_NS_R}id"))
                if not maal:
                    continue
                if delte is None:
                    delte = _delte_strenge(z)
                data = _del(z, "xl/" + maal.lstrip("/").removeprefix("xl/"), MAKS_FANE_BYTES, f"fanen {navn}")
                ud[navn] = _laes_fane(data, navn, delte)
    except LaeseFejl:
        raise
    except (KeyError, IndexError, ValueError, zipfile.BadZipFile, ET.ParseError, OSError) as e:
        raise LaeseFejl(f"arket kan ikke læses som et regneark ({type(e).__name__}: {e})") from e
    return ud


def norm(v) -> str:
    """Etiket til sammenligning som modelscriptets ``_norm``: små bogstaver, ét mellemrum, ingen kanter."""
    return " ".join(v.split()).lower() if isinstance(v, str) else ""


def raekker(celler: dict) -> list[int]:
    """De rækker, arket faktisk har celler i, stigende. Løkker over et ark går over DISSE — aldrig over alle
    rækkenumre op til den sidste celle (et sparsomt ark kan have én celle i række 1.048.576)."""
    return sorted({r for (r, _k) in celler})


def find_raekke(celler: dict, start: str, *, praefiks: bool = False, efter: int = 0) -> int | None:
    """Som ``find_raekke`` i scripts/vaerksark_til_yaml.py:121-137: første række, hvis celle i kolonne A er
    ``start`` (eller begynder med den), efter række ``efter``."""
    for r in sorted({rk for (rk, k) in celler if k == 1}):
        if r <= efter:
            continue
        t = norm(celler.get((r, 1)))
        if t and (t == start or (praefiks and t.startswith(start))):
            return r
    return None


def maks_raekke(celler: dict) -> int:
    return max((r for (r, _k) in celler), default=0)
