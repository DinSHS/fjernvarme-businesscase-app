"""JavaScript-semantik, som den betroede TS-logik tavst bygger på — gjort eksplicit i Python.

Porten af ``rayfin/functions/src/*.ts`` skal give de SAMME bytes (hash, gemt JSON) og de SAMME
afgørelser (afvist/godkendt, beskeder) som TypeScript. Hvor Python og JavaScript er uenige, står
JavaScripts adfærd her, og resten af ``logik`` bruger kun disse hjælpere:

=====================  ================================================================
``parse``              ``JSON.parse``: ALLE tal bliver ``float`` (JS har én taltype), og
                       ``NaN``/``Infinity`` afvises (Python accepterer dem som literaler).
``js_str``             ``Number.prototype.toString``: ``1e-7`` (ikke ``1e-07``), ``3600``
                       (ikke ``3600.0``), ``1e+21``. Indgår i ``somFloat`` -> hash.
``streng``             ``String(v)`` for JSON-værdier (``[1,2]`` -> ``"1,2"``).
``stringify``          ``JSON.stringify`` (heltalsfloats uden ``.0``, ikke-endelige -> ``null``,
                       enlige surrogater escapet, JS' nøglerækkefølge).
``laengde``/``skive``  ``.length``/``.slice`` i UTF-16-kodeenheder (som NVARCHAR(4000)).
``trim``/``split_ws``  JS' blanktegn (``\\s``), ikke Pythons ``str.isspace``.
``rund``               ``Math.round`` (halve op mod +uendelig; Pythons ``round`` er bankers).
``dato_parse``         ``Date.parse`` som V8 for ISO-agtige tekster (inkl. dag-overløb
                       ``2026-02-30`` -> 2. marts og ``24:00``); se ``dato_parse``.
``iso``                ``Date.prototype.toISOString``.
``tal``                ``Number(tekst)``.
=====================  ================================================================

Lokal tid: TS kører i en Function-runtime i UTC, og ``Date.parse`` læser et tidspunkt uden zone
som lokal tid. Her antages UTC — samme antagelse som runtime.
"""

from __future__ import annotations

import json
import math
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal

__all__ = [
    "parse", "js_str", "streng", "stringify", "laengde", "skive", "trim", "split_ws", "rund",
    "dato_parse", "iso", "tal", "er_tal", "er_endelig", "er_heltal", "streng_lig", "noegler",
    "BLANKE", "UTF16_NOEGLE", "UNDEFINED", "felt", "nullish", "maks", "mini",
]

# ------------------------------------------------------------------ JSON.parse


def _ingen_konstant(navn: str):
    raise ValueError(f"ugyldig JSON-literal {navn}")


def parse(s: str):
    """``JSON.parse(s)``. Kaster ``ValueError`` ved ugyldig JSON (som JS' SyntaxError).

    Tal bliver altid ``float``: ``12`` og ``12.0`` er det samme tal i JS, og et heltal med
    tusindvis af cifre giver ``inf``/en afrundet double i stedet for Pythons ``ValueError``.
    """
    if not isinstance(s, str):
        raise ValueError("ikke en tekst")
    try:
        return json.loads(s, parse_int=float, parse_constant=_ingen_konstant)
    except RecursionError as e:          # JS har et dybere loft; se rapporten (kendt afvigelse)
        raise ValueError("for dybt indlejret") from e


# ------------------------------------------------------------------ tal


def er_tal(v) -> bool:
    """``typeof v === 'number'``."""
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def er_endelig(v) -> bool:
    """``typeof v === 'number' && Number.isFinite(v)``."""
    return er_tal(v) and math.isfinite(v)


def er_heltal(v) -> bool:
    """``Number.isInteger(v)`` (``1.0`` er et heltal)."""
    return er_endelig(v) and float(v) == math.floor(v)


def js_str(x) -> str:
    """``String(x)`` for et tal — ECMAScript Number::toString (radix 10)."""
    x = float(x)
    if math.isnan(x):
        return "NaN"
    if math.isinf(x):
        return "Infinity" if x > 0 else "-Infinity"
    if x == 0:
        return "0"                                   # også -0
    fortegn = "-" if x < 0 else ""
    # repr giver den korteste decimal, der rundtripper — samme cifre som JS' algoritme.
    t = Decimal(repr(abs(x))).normalize().as_tuple()
    cifre = "".join(map(str, t.digits))
    k = len(cifre)
    n = t.exponent + k                               # værdien = 0.cifre * 10^n
    if k <= n <= 21:
        ud = cifre + "0" * (n - k)
    elif 0 < n <= 21:
        ud = cifre[:n] + "." + cifre[n:]
    elif -6 < n <= 0:
        ud = "0." + "0" * (-n) + cifre
    else:
        e = n - 1
        mant = cifre if k == 1 else cifre[0] + "." + cifre[1:]
        ud = f"{mant}e{'+' if e >= 0 else '-'}{abs(e)}"
    return fortegn + ud


def maks(*xs) -> float:
    """``Math.max``: NaN smitter (Pythons ``max(0, nan)`` giver 0)."""
    if any(math.isnan(x) for x in xs):
        return math.nan
    return float(max(xs))


def mini(*xs) -> float:
    """``Math.min``: NaN smitter."""
    if any(math.isnan(x) for x in xs):
        return math.nan
    return float(min(xs))


def rund(x: float) -> float:
    """``Math.round``: nærmeste heltal, halve mod +uendelig (-2.5 -> -2)."""
    if not math.isfinite(x):
        return x
    return float(math.floor(x + 0.5))


_TAL_DEC = re.compile(r"[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)")
_TAL_PRAEFIKS = re.compile(r"0([xXoObB])([0-9a-fA-F]+)")


def tal(s: str) -> float:
    """``Number(s)`` for en tekst: blanktegn trimmes, tom = 0, ``0x``/``0o``/``0b``, ``Infinity``,
    ellers NaN (Pythons ``float`` accepterer ``inf``, ``nan`` og ``1_000`` — det gør JS ikke)."""
    t = trim(s)
    if t == "":
        return 0.0
    if t in ("Infinity", "+Infinity"):
        return math.inf
    if t == "-Infinity":
        return -math.inf
    m = _TAL_PRAEFIKS.fullmatch(t)
    if m:
        base = {"x": 16, "o": 8, "b": 2}[m.group(1).lower()]
        try:
            return float(int(m.group(2), base))
        except ValueError:
            return math.nan
    if _TAL_DEC.fullmatch(t):
        return float(t)
    return math.nan


# ------------------------------------------------------------------ String() og ===


class _Undefined:
    """JS' ``undefined`` (en manglende egenskab) — forskellig fra ``null`` (``None``)."""

    def __repr__(self):
        return "undefined"

    def __bool__(self):
        return False


UNDEFINED = _Undefined()


def felt(o, noegle: str):
    """``o?.[noegle]`` på en parset JSON-værdi: ``UNDEFINED`` hvis ``o`` ikke er et objekt eller
    mangler nøglen (en tekst eller liste har ingen sådanne egenskaber)."""
    if isinstance(o, dict) and noegle in o:
        return o[noegle]
    return UNDEFINED


def nullish(v) -> bool:
    """``v == null`` (``null`` eller ``undefined``)."""
    return v is None or v is UNDEFINED


def streng(v) -> str:
    """``String(v)`` for en JSON-værdi; ``None`` er ``null``, ``UNDEFINED`` er ``undefined``."""
    if v is UNDEFINED:
        return "undefined"
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if er_tal(v):
        return js_str(v)
    if isinstance(v, str):
        return v
    if isinstance(v, list):
        return ",".join("" if e is None else streng(e) for e in v)
    return "[object Object]"


def streng_lig(a, b) -> bool:
    """``a === b`` for to SEPARAT parsede JSON-værdier: objekter/lister er aldrig ens."""
    if isinstance(a, (list, dict)) or isinstance(b, (list, dict)):
        return False
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if er_tal(a) and er_tal(b):
        return float(a) == float(b)                  # NaN != NaN som i JS
    return type(a) is type(b) and a == b


# ------------------------------------------------------------------ objekter

_INDEKS = re.compile(r"0|[1-9]\d*")


def noegler(d: dict) -> list:
    """Et objekts egne nøgler i JS' rækkefølge: array-indeks-nøgler stigende først, så resten i
    indsættelsesrækkefølge (``Object.keys``/``JSON.stringify``)."""
    tal_ = [k for k in d if isinstance(k, str) and _INDEKS.fullmatch(k) and int(k) < 2 ** 32 - 1]
    tal_.sort(key=int)
    saet = set(tal_)
    return tal_ + [k for k in d if k not in saet]


# ------------------------------------------------------------------ JSON.stringify

_ESC = {'"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t"}


def _citer(s: str) -> str:
    ud = ['"']
    for c in s:
        o = ord(c)
        if c in _ESC:
            ud.append(_ESC[c])
        elif o < 0x20 or 0xD800 <= o <= 0xDFFF:      # kontroltegn og ENLIGE surrogater (well-formed stringify)
            ud.append(f"\\u{o:04x}")
        else:
            ud.append(c)
    ud.append('"')
    return "".join(ud)


def stringify(v) -> str:
    """``JSON.stringify(v)`` for JSON-agtige værdier (dict, list, str, tal, bool, None)."""
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if er_tal(v):
        return js_str(v) if math.isfinite(v) else "null"
    if isinstance(v, str):
        return _citer(v)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(stringify(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ",".join(f"{_citer(str(k))}:{stringify(v[k])}" for k in noegler(v)) + "}"
    raise TypeError(f"kan ikke stringify'e {type(v).__name__}")


# ------------------------------------------------------------------ tekst i UTF-16


def _u16(s: str) -> bytes:
    return s.encode("utf-16-le", "surrogatepass")


def laengde(s: str) -> int:
    """``s.length``: antal UTF-16-kodeenheder (et tegn uden for BMP tæller 2)."""
    return len(_u16(s)) // 2


def skive(s: str, a: int, b: int | None = None) -> str:
    """``s.slice(a, b)`` i UTF-16-kodeenheder (kan, som i JS, efterlade en halv surrogat)."""
    n = laengde(s)

    def norm(i):
        if i is None:
            return n
        return max(0, n + i) if i < 0 else min(i, n)

    a2, b2 = norm(a), norm(b)
    if b2 <= a2:
        return ""
    stykke = _u16(s)[2 * a2: 2 * b2]
    return stykke.decode("utf-16-le", "surrogatepass")


def UTF16_NOEGLE(s: str) -> bytes:
    """Sorteringsnøgle = JS' strengsammenligning (UTF-16-kodeenheder, ikke kodepunkter)."""
    return s.encode("utf-16-be", "surrogatepass")


#: JS' WhiteSpace + LineTerminator (``\\s`` og ``String.prototype.trim``).
BLANKE = ("\t\n\v\f\r            "
          "      　﻿")
_WS = "[" + re.escape(BLANKE) + "]+"


def trim(s: str) -> str:
    return s.strip(BLANKE)


def split_ws(s: str) -> list[str]:
    """``s.split(/\\s+/)``."""
    return re.split(_WS, s)


# ------------------------------------------------------------------ Date

_EPOKE = datetime(1970, 1, 1, tzinfo=timezone.utc)
_MS_MAX = 8.64e15

# ES-datoformatet (YYYY[-MM[-DD]][THH:mm[:ss[.sss]]][Z|±HH:mm]) med V8's tolerancer: 't'/'z' med små
# bogstaver, mellemrum i stedet for T, en offset uden kolon, enkeltcifret måned/dag, foranstillede blanktegn.
_ISO = re.compile(
    r"\s*([+-][0-9]{6}|[0-9]{4})(?:([-/])([0-9]{1,2})(?:\2([0-9]{1,2}))?)?"
    r"(?:[Tt ]([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]+))?)?)?"
    r"\s*([Zz]|[+-][0-9]{2}:?[0-9]{2})?\s*", re.ASCII)


def dato_parse(s) -> float:
    """``Date.parse(s)`` i ms (``nan`` = Invalid Date), som V8 for ISO-agtige tekster.

    Som V8: dag/måned uden for kalenderen ruller over (``2026-02-30`` -> 2. marts), ``24:00`` er
    næste døgn, kun-dato er UTC, tidspunkt uden zone er lokal tid (= UTC her). V8's ældre parser
    accepterer desuden fx ``"January 5, 2026"``; det gør denne IKKE (nan) — en bevidst, dokumenteret
    afvigelse (rapporten): her afvises tidligere, hvad modellen alligevel ikke kan læse.
    """
    if not isinstance(s, str):
        return math.nan
    m = _ISO.fullmatch(s)
    if not m:
        return math.nan
    aar_t, _skille, mdr_t, dag_t, t_t, mi_t, se_t, fr_t, zone = m.groups()
    aar = int(aar_t)
    if aar_t.startswith("-") and aar == 0:
        return math.nan                               # -000000 er ugyldigt i ES
    mdr = int(mdr_t) if mdr_t else 1
    dag = int(dag_t) if dag_t else 1
    if not (1 <= mdr <= 12) or not (1 <= dag <= 31):
        return math.nan
    time = int(t_t) if t_t else 0
    minut = int(mi_t) if mi_t else 0
    sek = int(se_t) if se_t else 0
    ms = int((fr_t or "0")[:3].ljust(3, "0"))
    if time > 24 or minut > 59 or sek > 59 or (time == 24 and (minut or sek or ms)):
        return math.nan
    try:
        grund = datetime(aar if 1 <= aar <= 9999 else 2000, mdr, 1, tzinfo=timezone.utc)
    except ValueError:
        return math.nan
    forskyd_aar = 0
    if not 1 <= aar <= 9999:                          # datetime dækker ikke år uden for 1..9999
        forskyd_aar = aar - 2000
    t = grund + timedelta(days=dag - 1, hours=time, minutes=minut, seconds=sek, milliseconds=ms)
    ud = (t - _EPOKE) / timedelta(milliseconds=1)
    if forskyd_aar:
        ud += _aar_ms(2000, aar)
    if zone and zone not in ("Z", "z"):
        fortegn = 1 if zone[0] == "+" else -1
        z = zone[1:].replace(":", "")
        zt, zm = int(z[:2]), int(z[2:])
        if zt > 23 or zm > 59:
            return math.nan
        ud -= fortegn * (zt * 60 + zm) * 60_000
    if abs(ud) > _MS_MAX:
        return math.nan
    return float(ud)


def _aar_ms(fra: int, til: int) -> float:
    """ms fra 1. januar ``fra`` til 1. januar ``til`` (proleptisk gregoriansk)."""
    def dage(y):                                     # dage fra år 0 til 1. jan år y
        y -= 1
        return y * 365 + y // 4 - y // 100 + y // 400
    return (dage(til) - dage(fra)) * 86_400_000.0


def iso(ms: float) -> str:
    """``new Date(ms).toISOString()``; kaster ``ValueError`` som JS' RangeError ved Invalid Date."""
    if not isinstance(ms, (int, float)) or not math.isfinite(ms) or abs(ms) > _MS_MAX:
        raise ValueError("Invalid time value")
    ms = int(ms)
    dage, rest = divmod(ms, 86_400_000)
    # dage siden epoken -> proleptisk gregoriansk dato (virker for alle år, også uden for 1..9999)
    z = dage + 719468
    era = z // 146097
    doe = z - era * 146097
    yoe = (doe - doe // 1460 + doe // 36524 - doe // 146096) // 365
    y = yoe + era * 400
    doy = doe - (365 * yoe + yoe // 4 - yoe // 100)
    mp = (5 * doy + 2) // 153
    d = doy - (153 * mp + 2) // 5 + 1
    m = mp + 3 if mp < 10 else mp - 9
    y += 1 if m <= 2 else 0
    t, rest = divmod(rest, 3_600_000)
    mi, rest = divmod(rest, 60_000)
    s, msr = divmod(rest, 1000)
    aar = f"{y:04d}" if 0 <= y <= 9999 else (f"+{y:06d}" if y > 9999 else f"-{-y:06d}")
    return f"{aar}-{m:02d}-{d:02d}T{t:02d}:{mi:02d}:{s:02d}.{msr:03d}Z"
