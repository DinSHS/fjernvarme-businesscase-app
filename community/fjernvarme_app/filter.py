"""Rayfin/DAB-filtre og -sortering -> SQLAlchemy, og sideinddelt læsning.

Grammatikken er den, appens hooks allerede sender (``src/lib/data/hooks.ts``), så ``rest``-adapteren kan
give filteret videre uændret::

    {"vaerk_id": {"eq": "…"}}
    {"and": [{"koersel_id": {"eq": "…"}}, {"tid": {"gte": "2026-01-05T00:00:00.000Z"}}, {"tid": {"lt": …}}]}
    {"or": [{"sektion": {"eq": "units"}}, {"sektion": {"eq": "storage"}}]}

Operatorer: ``eq neq gt gte lt lte in nin isNull contains notContains startsWith endsWith``.
Værdier bindes gennem kolonnens type, så en ISO-tekst mod en tidskolonne og ``true`` mod en boolean virker
ens i de tre dialekter. Et ukendt felt eller en ukendt operator er en fejl (``Ugyldig``), ikke et tomt filter:
et filter, der tavst ignoreres, læser HELE tabellen.

Sider: ``first`` (standard 100, højst 100.000 — DAB's tal) og en uigennemsigtig ``after``-markør. Markøren
er en forskydning; rækkefølgen gøres entydig med ``id`` som sidste nøgle.
"""

from __future__ import annotations

import base64
import json
from decimal import Decimal
from datetime import datetime

from sqlalchemy import and_, asc, desc, false, or_, select, true
from sqlalchemy import Table

from .typer import iso

STANDARD_SIDE = 100
MAKS_SIDE = 100_000
_DYBDE = 32


class Ugyldig(ValueError):
    """Forespørgslen kan ikke udføres som skrevet (dansk tekst til brugeren)."""


def _kolonne(t: Table, navn: str):
    if navn not in t.c:
        raise Ugyldig(f"{t.name} har intet felt {navn!r}")
    return t.c[navn]


def _udtryk(t: Table, f, dybde: int = 0):
    if dybde > _DYBDE:
        raise Ugyldig("filteret er for dybt indlejret")
    if not isinstance(f, dict):
        raise Ugyldig("et filter skal være et objekt")
    dele = []
    for k, v in f.items():
        if k in ("and", "or"):
            if not isinstance(v, list):
                raise Ugyldig(f"{k} skal være en liste")
            under = [_udtryk(t, x, dybde + 1) for x in v]
            if not under:
                dele.append(true() if k == "and" else false())
            else:
                dele.append(and_(*under) if k == "and" else or_(*under))
            continue
        if k == "not":
            dele.append(~_udtryk(t, v, dybde + 1))
            continue
        c = _kolonne(t, k)
        if not isinstance(v, dict) or not v:
            raise Ugyldig(f"feltet {k} skal have en operator, fx {{\"eq\": …}}")
        for op, x in v.items():
            dele.append(_operator(c, op, x))
    return and_(*dele) if len(dele) != 1 else dele[0]


def _operator(c, op: str, x):
    if op == "eq":
        return c.is_(None) if x is None else c == x
    if op == "neq":
        return c.is_not(None) if x is None else or_(c != x, c.is_(None))
    if op in ("gt", "gte", "lt", "lte"):
        if x is None:
            raise Ugyldig(f"{op} kræver en værdi")
        return {"gt": c > x, "gte": c >= x, "lt": c < x, "lte": c <= x}[op]
    if op in ("in", "nin"):
        if not isinstance(x, list):
            raise Ugyldig(f"{op} kræver en liste")
        u = c.in_(x)
        return u if op == "in" else ~u
    if op == "isNull":
        return c.is_(None) if x else c.is_not(None)
    if op in ("contains", "notContains", "startsWith", "endsWith"):
        if not isinstance(x, str):
            raise Ugyldig(f"{op} kræver en tekst")
        m = {"contains": c.contains(x, autoescape=True), "notContains": ~c.contains(x, autoescape=True),
             "startsWith": c.startswith(x, autoescape=True), "endsWith": c.endswith(x, autoescape=True)}
        return m[op]
    raise Ugyldig(f"ukendt operator {op!r}")


def hvor(t: Table, filter_):
    """Filteret som et WHERE-udtryk (``None`` = intet filter)."""
    if filter_ in (None, {}, ""):
        return None
    return _udtryk(t, filter_)


def sortering(t: Table, orden) -> list:
    """``{"felt": "asc"|"desc", …}`` (rækkefølgen bevares) eller en liste af sådanne; ``id`` sidst."""
    ud, set_ = [], set()
    if orden:
        par = []
        if isinstance(orden, dict):
            par = list(orden.items())
        elif isinstance(orden, list):
            for o in orden:
                if not isinstance(o, dict):
                    raise Ugyldig("orderBy skal være et objekt eller en liste af objekter")
                par += list(o.items())
        else:
            raise Ugyldig("orderBy skal være et objekt")
        for navn, retning in par:
            r = str(retning).lower()
            if r not in ("asc", "desc"):
                raise Ugyldig(f"sorteringen af {navn} skal være asc eller desc")
            c = _kolonne(t, navn)
            ud.append(asc(c) if r == "asc" else desc(c))
            set_.add(navn)
    if "id" in t.c and "id" not in set_:
        ud.append(asc(t.c.id))
    return ud


def markoer(forskydning: int) -> str:
    return base64.urlsafe_b64encode(json.dumps({"o": forskydning}).encode()).decode().rstrip("=")


def fra_markoer(m: str | None) -> int:
    if not m:
        return 0
    try:
        o = json.loads(base64.urlsafe_b64decode(m + "=" * (-len(m) % 4)))["o"]
        if isinstance(o, int) and o >= 0:
            return o
    except Exception:
        pass
    raise Ugyldig("ugyldig after-markør")


def json_vaerdi(v):
    if isinstance(v, datetime):
        return iso(v)
    if isinstance(v, Decimal):
        f = float(v)
        return int(f) if f.is_integer() and abs(f) < 2 ** 53 else f
    return v


def raekke(r, felter=None) -> dict:
    m = r._mapping
    return {k: json_vaerdi(m[k]) for k in (felter or m.keys())}


def side(cn, t: Table, *, filter_=None, orden=None, first=None, after=None, felter=None) -> dict:
    """Én side: ``{items, hasNextPage, endCursor}``."""
    n = STANDARD_SIDE if first in (None, "") else int(first)
    if n < 1 or n > MAKS_SIDE:
        raise Ugyldig(f"first skal være 1–{MAKS_SIDE}")
    if felter:
        for f in felter:
            _kolonne(t, f)
    o = fra_markoer(after)
    q = select(*(t.c[f] for f in felter)) if felter else select(t)
    w = hvor(t, filter_)
    if w is not None:
        q = q.where(w)
    q = q.order_by(*sortering(t, orden)).offset(o).limit(n + 1)
    rk = cn.execute(q).fetchall()
    mere = len(rk) > n
    rk = rk[:n]
    return {"items": [raekke(r) for r in rk], "hasNextPage": mere,
            "endCursor": markoer(o + len(rk)) if rk else (after or None)}
