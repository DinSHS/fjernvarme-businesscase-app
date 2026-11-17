"""Feltkataloget (``viden/felt_katalog.json``) som opslag og typekontrol i arbejderen — runde 14.

Appens egne faner i værksarket (``fjv.arklag``) bærer værdier, modelscriptet ikke læser. Hver værdi valideres som
en redigering i appen: stien skal være kendt af feltkataloget, og værdien skal have feltets type og ligge inden for
dets grænser. Reglerne er de samme som appens ``tjekFelt`` (app/src/sider/konfiguration/validering.ts) og
``findFelt`` (katalog.ts); de fælles vektorer i ``skema/vektorer/arklag.json`` binder de to.

Kataloget følger motoren som ``data_krav.json`` gør: i repoet ligger det i ``viden/``, i Fabric og i den lokale
pakke ved siden af (``fabric/deploy.py``, ``community/pakke.py``).

``fra_celle`` gør en regnearkscelle til ``vaerdi_json`` efter feltets type — et regneark skelner ikke mellem 12 og
12.0, så typen kommer fra kataloget (heltal for ``integer``, decimaltal for ``number``), ikke fra cellen.
"""

from __future__ import annotations

import json
import math
import re
from datetime import date, timedelta
from pathlib import Path

HER = Path(__file__).resolve().parent
_KATALOG = None
_SKABELONER = None
_CACHE: dict = {}

#: Mærket for "feltet sættes ikke" i appens faner (en tom celle betyder "appen rører ikke feltet").
FINDES_IKKE = "(findes ikke)"
_KODE_I_PARENTES = re.compile(r"\(([^()]+)\)\s*$")
#: Excels grænse for tekst i en celle og KONTRAKT §3.2's grænse for en værdi.
MAKS_JSON = 4000
_ISO_DATO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SAND = {"ja": True, "nej": False, "true": True, "false": False, "sand": True, "falsk": False}


class FeltFejl(ValueError):
    """Cellen kan ikke blive til feltets værdi. Beskeden er grunden (uden ark og celle)."""


def _find(navn: str) -> Path:
    for m in (HER, HER.parent.parent / "viden"):
        p = m / navn
        if p.is_file():
            return p
    raise FileNotFoundError(f"{navn} findes hverken i motorpakken eller i viden/ — appens faner i værksarket kan "
                            "ikke valideres uden feltkataloget")


def felter() -> list:
    global _KATALOG, _SKABELONER
    if _KATALOG is None:
        _KATALOG = json.loads(_find("felt_katalog.json").read_text(encoding="utf-8"))["felter"]
        _SKABELONER = [(p, p["sti"].split("."), p["sti"].split(".").count("*")) for p in _KATALOG]
    return _KATALOG


def find(sti: str) -> dict | None:
    """Feltposten for en konkret sti — som ``findFelt``: ved flere mulige vinder den mest konkrete (færrest ``*``),
    og ved lige mange et blad frem for en blok."""
    if sti in _CACHE:
        return _CACHE[sti]
    felter()
    dele = sti.split(".")
    bedst = None
    for post, m, stjerner in _SKABELONER:
        if len(m) != len(dele) or not all(a == "*" or a == b for a, b in zip(m, dele)):
            continue
        if bedst is None or stjerner < bedst[1] or (stjerner == bedst[1] and post["blad"] and not bedst[0]["blad"]):
            bedst = (post, stjerner)
    _CACHE[sti] = bedst[0] if bedst else None
    return _CACHE[sti]


def _er_tal(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _dk(x) -> str:
    """Et tal som appen skriver det i en besked (``String(x).replace(".", ",")``)."""
    if isinstance(x, float) and x.is_integer() and abs(x) < 1e21:
        x = int(x)
    return str(x).replace(".", ",")


def _js(x) -> str:
    """JavaScripts ``String(x)`` for en JSON-værdi (1.0 -> "1", true -> "true")."""
    if isinstance(x, bool):
        return "true" if x else "false"
    if isinstance(x, float) and x.is_integer() and abs(x) < 1e21:
        return str(int(x))
    return str(x)


def tjek(sti: str, vaerdi_json: str, post: dict | None = None) -> str | None:
    """Grunden til, at værdien ikke kan stå i feltet — eller None. Samme regler og rækkefølge som ``tjekFelt``."""
    post = post if post is not None else find(sti)
    if not post:
        return None
    try:
        v = json.loads(vaerdi_json, parse_constant=_ingen_konstant)
    except ValueError:
        return "Værdien er ikke gyldig JSON."
    navn = post["etiket"]
    if v is None:
        return f"{navn}: påkrævet og må ikke være tom (null)." if post.get("paakraevet") else None
    t = post["type"]
    if t == "object":
        return None
    if t == "number" and not _er_tal(v):
        return f"{navn}: skal være et tal."
    if t == "integer" and (not _er_tal(v) or not re.fullmatch(r"-?\d+", vaerdi_json.strip())):
        return f"{navn}: skal være et helt tal."
    if t == "boolean" and not isinstance(v, bool):
        return f"{navn}: skal være ja eller nej."
    if t == "string" and not isinstance(v, str):
        return f"{navn}: skal være tekst."
    if t == "list" and not isinstance(v, list):
        return f"{navn}: skal være en liste."
    if t == "enum" and post.get("tilladte") and not any(_strengt_lig(x, v) for x in post["tilladte"]):
        return f'{navn}: "{_js(v)}" er ikke tilladt. Tilladte: {", ".join(_js(x) for x in post["tilladte"])}.'
    if _er_tal(v):
        mi, ma = post.get("min"), post.get("max")
        if mi is not None and (v <= mi if post.get("min_eksklusiv") else v < mi):
            return f"{navn}: skal være {'>' if post.get('min_eksklusiv') else '≥'} {_dk(mi)}."
        if ma is not None and v > ma:
            return f"{navn}: må højst være {_dk(ma)}."
    return None


def _ingen_konstant(navn):
    raise ValueError(navn)


def _strengt_lig(a, b) -> bool:
    """JavaScripts ``===`` for JSON-værdier: tal efter værdi (1 === 1.0), ellers samme type og værdi."""
    if _er_tal(a) and _er_tal(b):
        return a == b
    return type(a) is type(b) and a == b


def til_json(v) -> str:
    """Som ``fjv.flad.til_json``: kompakt, ``ensure_ascii=False``."""
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def _heltalsliste(tilladte) -> bool:
    return bool(tilladte) and all(_er_tal(x) and float(x).is_integer() for x in tilladte)


def fra_celle(sti: str, celle, post: dict | None = None) -> str:
    """En celles værdi (tal, tekst, sand/falsk) som ``vaerdi_json`` for feltet ``sti``. Rejser ``FeltFejl``.

    * ``boolean``: ja/nej (også sand/falsk, true/false);
    * ``integer``: et helt tal; ``number``: et tal, gemt som decimaltal (12 -> 12.0);
    * ``enum``: en af de tilladte værdier; er de tilladte 0 og 1, også ja/nej;
    * ``string``: cellens tekst uændret (et tal i en datocelle bliver ÅÅÅÅ-MM-DD, når feltet er en dato);
    * ``list``: JSON-tekst (``[10,11,12]``) eller værdier med komma imellem (``10, 11, 12``);
    * teksten ``null`` = feltet står tomt i værket (ikke for tekstfelter)."""
    post = post if post is not None else find(sti)
    if not post or not post.get("blad"):
        raise FeltFejl("stien findes ikke i feltkataloget (et felt, modellen ikke kender)")
    t = post["type"]
    navn = post["etiket"]
    if isinstance(celle, str) and celle.strip().lower() == "null" and t != "string":
        return "null"
    if isinstance(celle, float) and not math.isfinite(celle):
        raise FeltFejl(f"{navn}: tallet er ikke endeligt")
    if t == "boolean":
        if isinstance(celle, bool):
            return til_json(celle)
        if isinstance(celle, str) and celle.strip().lower() in _SAND:
            return til_json(_SAND[celle.strip().lower()])
        raise FeltFejl(f"{navn}: skriv ja eller nej (cellen indeholder {_vis(celle)})")
    if t == "integer":
        if _er_tal(celle) and float(celle).is_integer():
            return til_json(int(celle))
        raise FeltFejl(f"{navn}: skal være et helt tal (cellen indeholder {_vis(celle)})")
    if t == "number":
        if _er_tal(celle):
            return til_json(float(celle))
        raise FeltFejl(f"{navn}: skal være et tal (cellen indeholder {_vis(celle)})")
    if t == "enum":
        tilladte = post.get("tilladte") or []
        if _heltalsliste(tilladte):
            if isinstance(celle, str) and celle.strip().lower() in _SAND and {0, 1} >= {int(x) for x in tilladte}:
                return til_json(1 if _SAND[celle.strip().lower()] else 0)
            if _er_tal(celle) and float(celle).is_integer():
                return til_json(int(celle))
            raise FeltFejl(f"{navn}: skriv ja eller nej (cellen indeholder {_vis(celle)})")
        if isinstance(celle, str):
            # En dansk etiket med koden i parentes ("i går (lag24)"): koden gælder (brugertesten F11).
            m = _KODE_I_PARENTES.search(celle)
            if m and m.group(1).strip() in tilladte:
                return til_json(m.group(1).strip())
            return til_json(celle.strip())
        raise FeltFejl(f"{navn}: vælg en af {', '.join(str(x) for x in tilladte)} (cellen indeholder {_vis(celle)})")
    if t == "string":
        if isinstance(celle, str):
            return til_json(celle)
        if _er_tal(celle) and _ISO_DATO.match(str(post.get("eksempel") or "")) and 20000 <= celle <= 80000 \
                and float(celle).is_integer():
            # Excel gør en indtastet dato til et serietal (1900-systemet); feltet er en dato som tekst.
            return til_json((date(1899, 12, 30) + timedelta(days=int(celle))).isoformat())
        raise FeltFejl(f"{navn}: skal være tekst (cellen indeholder {_vis(celle)}; skriv en apostrof foran, "
                       "hvis Excel gør teksten til et tal eller en dato)")
    if t == "list":
        if _er_tal(celle):
            return til_json([int(celle) if float(celle).is_integer() else float(celle)])
        if isinstance(celle, str):
            for tekst in (celle, f"[{celle}]"):
                try:
                    v = json.loads(tekst, parse_constant=_ingen_konstant)
                except ValueError:
                    continue
                if isinstance(v, list):
                    return til_json(v)
        raise FeltFejl(f"{navn}: skal være en liste, fx [10,11,12] eller 10, 11, 12 (cellen indeholder {_vis(celle)})")
    if t == "object":
        if isinstance(celle, str) and celle.replace(" ", "") == "{}":
            return "{}"
        raise FeltFejl(f"{navn}: er en blok og kan kun stå som en tom blok ({{}})")
    raise FeltFejl(f"{navn}: feltets type ({t}) kan ikke stå i en celle")


def laes_celle(sti: str, celle) -> dict:
    """Hvad en celle i appens faner betyder — fælles regel med eksportens ``læsCelle`` (lag.ts), bundet af
    ``skema/vektorer/arklag/celler.json``: ``{"tom": True}`` = appen rører ikke feltet; ``{"fjern": True}`` =
    ``(findes ikke)``, feltet sættes ikke; ``{"json": …}`` = værdien efter feltets type og regler; ``{"fejl": …}``."""
    if celle is None or (isinstance(celle, str) and not celle.strip()):
        return {"tom": True}
    if isinstance(celle, str) and celle.strip().lower() == FINDES_IKKE:
        return {"fjern": True}
    try:
        j = fra_celle(sti, celle)
    except FeltFejl as e:
        return {"fejl": str(e)}
    grund = tjek(sti, j)
    return {"fejl": grund} if grund else {"json": j}


def _vis(celle) -> str:
    if isinstance(celle, bool):
        return "sand" if celle else "falsk"
    if isinstance(celle, str):
        return f'teksten "{celle[:40]}"'
    return f"tallet {_dk(celle)}"
