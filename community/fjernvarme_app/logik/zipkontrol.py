"""Forhåndstjek af et uploadet værksark (.xlsx = ZIP) FØR det gemmes — tro port af ``zip.ts`` (K5-F3).

Læser kun ZIP'ens centrale katalog (pakker intet ud) og afviser for mange dele, for stor samlet eller enkelt
udpakket størrelse, et urimeligt komprimeringsforhold og ZIP64. Samme tal som motorens ``fjv/vaerksark.py``,
men motoren bruger ``zipfile`` på den gemte fil; dette er Functionens tjek på de rå bytes og skal give
præcis TS' svar (vektorerne ``tjek_zip.json``).
"""

from __future__ import annotations

import struct

__all__ = ["ZIP_GRAENSER", "tjek_zip"]

ZIP_GRAENSER = {
    "medlemmer": 200,
    "udpakket_i_alt": 32 * 1024 * 1024,
    "stoerste_medlem": 16 * 1024 * 1024,
    #: Forhold udpakket/komprimeret for et medlem over ``forhold_fra`` bytes.
    "forhold": 100,
    "forhold_fra": 1024 * 1024,
}

_BESKADIGET = "Filen er ikke et gyldigt Excel-ark (ZIP-kataloget er beskadiget)."


def _u16(b: bytes, i: int) -> int:
    return struct.unpack_from("<H", b, i)[0]


def _u32(b: bytes, i: int) -> int:
    return struct.unpack_from("<I", b, i)[0]


def tjek_zip(b: bytes) -> dict:
    """``{"ok": True, "medlemmer", "udpakket", "stoerste"}`` eller ``{"ok": False, "fejl": "<dansk>"}``."""
    b = bytes(b)
    G = ZIP_GRAENSER
    eocd = -1
    i = len(b) - 22
    stop = max(0, len(b) - 22 - 65_535)
    while i >= stop:
        if _u32(b, i) == 0x06054B50:
            eocd = i
            break
        i -= 1
    if eocd < 0:
        return {"ok": False, "fejl": "Filen er ikke et gyldigt Excel-ark (ZIP-kataloget mangler)."}
    antal = _u16(b, eocd + 10)
    cd_stoerrelse = _u32(b, eocd + 12)
    cd_start = _u32(b, eocd + 16)
    if antal == 0xFFFF or cd_start == 0xFFFFFFFF or cd_stoerrelse == 0xFFFFFFFF:
        return {"ok": False, "fejl": "Excel-arket bruger ZIP64 — det understøttes ikke (et værksark er langt under 4 GB)."}
    if antal > G["medlemmer"]:
        return {"ok": False, "fejl": f"Excel-arket har {antal} dele (højst {G['medlemmer']}); det ligner ikke et værksark."}
    if cd_start + cd_stoerrelse > eocd:
        return {"ok": False, "fejl": _BESKADIGET}
    p, udpakket, stoerste = cd_start, 0, 0
    for _ in range(antal):
        if p + 46 > eocd or _u32(b, p) != 0x02014B50:
            return {"ok": False, "fejl": _BESKADIGET}
        komp, ud = _u32(b, p + 20), _u32(b, p + 24)
        navn_lgd, ekstra_lgd, komm_lgd = _u16(b, p + 28), _u16(b, p + 30), _u16(b, p + 32)
        if komp == 0xFFFFFFFF or ud == 0xFFFFFFFF:
            return {"ok": False, "fejl": "Excel-arket bruger ZIP64 — det understøttes ikke."}
        if ud > G["forhold_fra"] and ud > G["forhold"] * max(1, komp):
            navn = b[p + 46: p + 46 + navn_lgd].decode("utf-8", "replace")
            return {"ok": False, "fejl": f'Delen "{navn}" pakker ud til {ud} bytes fra {komp} (forhold over '
                                         f'{G["forhold"]}:1) — arket afvises af sikkerhedshensyn.'}
        udpakket += ud
        stoerste = max(stoerste, ud)
        p += 46 + navn_lgd + ekstra_lgd + komm_lgd
    if stoerste > G["stoerste_medlem"]:
        return {"ok": False, "fejl": f"En del af Excel-arket er {stoerste} bytes udpakket (højst {G['stoerste_medlem']})."}
    if udpakket > G["udpakket_i_alt"]:
        return {"ok": False, "fejl": f"Excel-arket er {udpakket} bytes udpakket (højst {G['udpakket_i_alt']})."}
    return {"ok": True, "medlemmer": antal, "udpakket": udpakket, "stoerste": stoerste}

