"""Backendens del af værkets tidsserier (KONTRAKT §6d) — tro port af ``app/rayfin/functions/src/tidsserie.ts``.

Selve tolkningen/valideringen genimplementeres IKKE: TS' ``tidsserie-validering.ts`` er en port af fv-data's
orakel ``viden/vaerktoej/valider_tidsserie.py``, og her kaldes oraklet direkte (via ``fjv.datakrav``, samme
indlæser som motoren). Her står kun det, TS-filen selv gør rundt om tolkeren: appens filgrænse,
``validering_json``'s afkortning til 4000 tegn, værkstræet og den tætte række til ``hentTidsserie``.
"""

from __future__ import annotations

import base64
import copy
import hashlib
import math
import sys

from . import jsjson as J
from ._fjv import datakrav
from .regler import FARLIGE_SEGMENTER

__all__ = ["MAKS_UPLOAD_BYTES", "MAKS_VAERKSARK_BYTES", "MAKS_POSITIONER", "ForLangRaekke", "sha256_hex",
           "sha256_bytes", "vaerk_trae", "valider_upload", "validering_json", "taet_raekke", "base64_bytes"]

#: Største fil gennem en Function (4 MB pr. kald, base64 ×4/3). = MAKS_TIDSSERIE_BYTES i fjv.constants.ts.
MAKS_UPLOAD_BYTES = 2_900_000
#: Største værksark efter base64-afkodning. = MAKS_VAERKSARK_BYTES i fjv.constants.ts (K5-F13).
MAKS_VAERKSARK_BYTES = 2_500_000
#: Højst så mange positioner i en tæt række (= data_krav's max_raekker). K5-F2: tjekkes FØR allokering.
MAKS_POSITIONER = 120_000
_MAKS_JSON = 4000


def sha256_hex(tekst: str) -> str:
    """sha256 (hex) af en tekst som UTF-8 — samme som klientens ``sha256Hex``."""
    return hashlib.sha256(tekst.encode("utf-8", "surrogatepass")).hexdigest()


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(bytes(b)).hexdigest()


def base64_bytes(tekst: str) -> bytes:
    """``Buffer.from(tekst, 'base64')`` som Node: manglende padding tolereres, en overskydende enkelt
    tegn ignoreres. Kalderen har allerede tjekket alfabetet (``/^[A-Za-z0-9+/]+={0,2}$/``)."""
    s = tekst.rstrip("=")
    if len(s) % 4 == 1:
        s = s[:-1]
    return base64.b64decode(s + "=" * (-len(s) % 4))


def vaerk_trae(params) -> dict:
    """Værkets parametre (``[{sti, vaerdi_json}]``) som det træ, tolkerens værksafhængige regler læser
    (kun units og storage). Stier med et prototype-segment springes over (K5-F1)."""
    trae = {"units": {}, "storage": {}}
    for p in params:
        d = p["sti"].split(".")
        if d[0] not in ("units", "storage"):
            continue
        if any(x in FARLIGE_SEGMENTER for x in d):
            continue
        try:
            v = J.parse(p["vaerdi_json"])
        except ValueError:
            continue
        node = trae[d[0]]
        for i in range(1, len(d) - 1):
            n = node.get(d[i])
            if isinstance(n, dict):
                node = n
            else:
                node[d[i]] = {}
                node = node[d[i]]
        if len(d) > 1:
            node[d[-1]] = v
    return trae


def valider_upload(data: bytes, rolle: str, valg: dict, vaerk: dict | None) -> dict:
    """Validerer en upload (rå bytes) med fv-data's orakel. ``valg``: ``tidszone``, ``tidsstempel``, ``enhed``,
    evt. ``kolonne``. Returnerer ``{"status", "normaliseret", "punkter", "validering"}`` som TS."""
    data = bytes(data)
    if len(data) > MAKS_UPLOAD_BYTES:
        besked = (f"Filen er for stor ({len(data)} bytes; grænsen gennem appen er {MAKS_UPLOAD_BYTES} bytes). "
                  f"Send timeværdier i stedet for kvarterværdier, eller del filen op.")
        return {"status": "afvist", "normaliseret": None, "punkter": [],
                "validering": {"version": datakrav.krav()["version"], "rolle": rolle,
                               "fund": [{"niveau": "fejl", "kode": "for_stor", "besked": besked}],
                               "fejl": [besked], "advarsler": []}}
    kolonne = valg.get("kolonne")
    r = datakrav.orakel().valider(data, rolle, tidszone=valg.get("tidszone"), tidsstempel=valg.get("tidsstempel"),
                                  enhed=valg.get("enhed"), kolonne=kolonne or None, vaerk=vaerk, k=_krav_uden_afkortning())
    val = r.validering
    if val.get("huller_fuld") is True:              # oraklets _komprimer skriver den; TS' tolker gør ikke
        val = {k: v for k, v in val.items() if k != "huller_fuld"}
    return {"status": r.status, "normaliseret": None if r.data is None else r.data.decode("utf-8"),
            "punkter": list(r.punkter or []), "validering": val}


_KRAV_UDEN = None


def _krav_uden_afkortning() -> dict:
    """data_krav.json med oraklets egen afkortning slået fra. TS' tolker (``tidsserie-validering.ts``) giver
    oraklets felter UDEN afkortning, og ``validering_json`` (TS' regel) afkorter bagefter. Oraklets ``_komprimer``
    afkorter anderledes (beholder de største huller, skærer beskeder til 160 kodepunkter uden "…") — se rapporten
    fv-port.md, fund F1. Grænsen bruges kun i ``_komprimer``."""
    global _KRAV_UDEN
    if _KRAV_UDEN is None:
        k = copy.deepcopy(datakrav.krav())
        k["tidsserier"]["graenser"]["validering_json_max_tegn"] = sys.maxsize
        _KRAV_UDEN = k
    return _KRAV_UDEN


def validering_json(v: dict) -> str:
    """``validering_json`` (≤ 4000 UTF-16-tegn) efter data_krav.json › validering_json: afkort først hullisten
    (``huller_fuld=false``), så info-fund, så beskeder til 160 tegn. Passer det stadig ikke: fejl (højlydt)."""
    x = dict(v)

    def s() -> str:
        return J.stringify(x)

    if J.laengde(s()) <= _MAKS_JSON:
        return s()
    if isinstance(x.get("huller"), list):
        h = list(x["huller"])
        while h and J.laengde(s()) > _MAKS_JSON:
            h.pop()
            x = dict(x)
            x["huller"] = list(h)
            x["huller_fuld"] = False
        if J.laengde(s()) <= _MAKS_JSON:
            return s()
    x = dict(x)
    x["fund"] = [f for f in x["fund"] if f.get("niveau") != "info"]
    if J.laengde(s()) <= _MAKS_JSON:
        return s()

    def kort(t: str) -> str:
        return J.skive(t, 0, 159) + "…" if J.laengde(t) > 160 else t

    x = dict(x)
    x["fund"] = [{**f, "besked": kort(f["besked"])} for f in x["fund"]]
    if isinstance(x.get("fejl"), list):
        x["fejl"] = [kort(t) for t in x["fejl"]]
    if isinstance(x.get("advarsler"), list):
        x["advarsler"] = [kort(t) for t in x["advarsler"]]
    if J.laengde(s()) <= _MAKS_JSON:
        return s()
    raise ValueError(f"validering_json er {J.laengde(s())} tegn efter afkortning (højst {_MAKS_JSON}).")


class ForLangRaekke(Exception):
    """Serien spænder over for mange timer til én visning (K5-F2)."""

    def __init__(self, positioner: int):
        self.positioner = positioner
        super().__init__(f"Serien spænder over {J.js_str(positioner)} timer — for mange til én visning "
                         f"(højst {MAKS_POSITIONER}). Hent et vindue (fra/til).")


def taet_raekke(normaliseret: str, vindue: dict | None = None) -> dict:
    """Den normaliserede fil (``time,mw``, 1h, huller udeladt) som tæt række, ``None`` i huller.
    ``vindue`` = ``{"fra": ms, "til": ms}`` (UTC, begge med). Et ikke-tal i filen giver NaN som i TS —
    serialisér med ``jsjson.stringify`` (NaN -> null), ikke ``json.dumps``."""
    ms = 3_600_000
    linjer = J.trim(normaliseret).split("\n")
    if linjer[0] != "time,mw":
        raise ValueError(f'Uventet overskrift i den normaliserede fil: "{linjer[0]}"')
    vindue = vindue or {}
    fra = vindue.get("fra")
    til = vindue.get("til")
    fra = -math.inf if J.nullish(fra) else fra
    til = math.inf if J.nullish(til) else til
    raekker = []
    for l in linjer[1:]:
        dele = l.split(",")
        t = J.dato_parse(dele[0])
        v = J.tal(dele[1]) if len(dele) > 1 else math.nan
        if t >= fra and t <= til:
            raekker.append((t, v))
    if not raekker:
        return {"start": "", "oploesning": "1h", "enhed": "MW", "vaerdier": []}
    t0 = raekker[0][0]
    n = int(J.rund((raekker[-1][0] - t0) / ms)) + 1
    if not n <= MAKS_POSITIONER:
        raise ForLangRaekke(n)
    vaerdier: list = [None] * max(n, 0)
    for t, v in raekker:
        i = int(J.rund((t - t0) / ms))
        if i < 0:
            continue                                  # JS: en negativ "indeks" er en egenskab, ikke et element
        if i >= len(vaerdier):
            vaerdier.extend([None] * (i + 1 - len(vaerdier)))
        vaerdier[i] = v
    return {"start": J.iso(t0).replace(".000Z", "Z"), "oploesning": "1h", "enhed": "MW", "vaerdier": vaerdier}
