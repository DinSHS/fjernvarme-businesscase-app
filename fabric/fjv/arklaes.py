"""Et .xlsx læst som celleværdier — kun standardbiblioteket (zip + XML), runde 14.

Importen kører i arbejderens eget Python, som ikke nødvendigvis har openpyxl (det har kun modelscriptets venv).
Appens egne faner i værksarket (``fjv.arklag``) og kontrollen af rækker, modelscriptet ville springe over, læses
derfor her. Læseren giver præcis det, et regneark viser: tal som ``float``/``int``, tekst som ``str``, sand/falsk
som ``bool``; en formel giver sin gemte værdi (som pandas/openpyxl med ``data_only``). Tomme celler udelades.

``celler[(række, kolonne)]`` er 1-baseret som regnearket (``(4, 1)`` = A4).
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path

_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_NS_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_REF = re.compile(r"^([A-Z]{1,3})(\d+)$")


class LaeseFejl(ValueError):
    """Filen kan ikke læses som et regneark."""


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


def laes_ark(sti: Path, kun: tuple | None = None) -> dict:
    """``{arknavn: {(række, kolonne): værdi}}`` for arbejdsbogens ark (``kun`` = disse arknavne).

    Rejser ``LaeseFejl``, hvis filen ikke er en xlsx, der kan læses."""
    import xml.etree.ElementTree as ET
    ud: dict = {}
    try:
        with zipfile.ZipFile(sti) as z:
            wb = ET.fromstring(z.read("xl/workbook.xml"))
            rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
            delte: list[str] = []
            if "xl/sharedStrings.xml" in z.namelist():
                delte = ["".join(t.text or "" for t in si.iter(f"{_NS}t") if _ikke_fonetisk(si, t))
                         for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{_NS}si")]
            for s in wb.iter(f"{_NS}sheet"):
                navn = s.get("name")
                if kun is not None and navn not in kun:
                    continue
                maal = rels.get(s.get(f"{_NS_R}id"))
                if not maal:
                    continue
                data = ET.fromstring(z.read("xl/" + maal.lstrip("/").removeprefix("xl/")))
                celler: dict = {}
                for c in data.iter(f"{_NS}c"):
                    m = _REF.match(c.get("r") or "")
                    if not m:
                        continue
                    t, v = c.get("t"), c.find(f"{_NS}v")
                    if t == "inlineStr":
                        vaerdi = _xml_tekst("".join(x.text or "" for x in c.iter(f"{_NS}t")))
                    elif t == "s":
                        vaerdi = _xml_tekst(delte[int(v.text)]) if v is not None and v.text is not None else None
                    elif t in ("str", "e"):
                        vaerdi = _xml_tekst(v.text or "") if v is not None else None
                    elif t == "b":
                        vaerdi = (v.text or "").strip() == "1" if v is not None else None
                    else:
                        vaerdi = _tal(v.text) if v is not None and (v.text or "").strip() else None
                    if vaerdi is None or vaerdi == "":
                        continue
                    celler[(int(m.group(2)), kolonne_nr(m.group(1)))] = vaerdi
                ud[navn] = celler
    except (KeyError, IndexError, ValueError, zipfile.BadZipFile, ET.ParseError, OSError) as e:
        raise LaeseFejl(f"arket kan ikke læses som et regneark ({type(e).__name__}: {e})") from e
    return ud


def _ikke_fonetisk(si, t) -> bool:
    """Fonetiske tilføjelser (``<rPh>``) er ikke cellens tekst (som openpyxl)."""
    for rph in si.iter(f"{_NS}rPh"):
        if t in list(rph.iter(f"{_NS}t")):
            return False
    return True


def norm(v) -> str:
    """Etiket til sammenligning som modelscriptets ``_norm``: små bogstaver, ét mellemrum, ingen kanter."""
    return " ".join(v.split()).lower() if isinstance(v, str) else ""


def find_raekke(celler: dict, start: str, *, praefiks: bool = False, efter: int = 0) -> int | None:
    """Som ``find_raekke`` i scripts/vaerksark_til_yaml.py:111-127: første række, hvis celle i kolonne A er
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
