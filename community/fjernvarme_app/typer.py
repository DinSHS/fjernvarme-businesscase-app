"""Portable kolonnetyper — samme bytes i sqlite, postgresql og mssql (rapporter/fv-server.md › fysiske typer).

* ``Uuid36``: sqlite ``CHAR(36)`` med små bogstaver og bindestreger; postgresql ``uuid``; mssql
  ``uniqueidentifier``. Python-siden er altid en ``str`` med små bogstaver (mssql returnerer STORE).
* ``UtcTid``: millisekunder, UTC, uden tidszone. sqlite ``CHAR(24)`` = ``YYYY-MM-DDTHH:MM:SS.fffZ``
  (fast bredde, så tekstsortering er tidssortering, og ``tid >= ?`` virker); postgresql
  ``timestamp(3)``; mssql ``datetime2(3)``. Millisekunder, fordi ``Motor.sidste_jobstart`` bruges
  som nøgle i betingede UPDATEs (huset betalte for 100 ns mod JS' ms én gang).
"""

from __future__ import annotations

import re
import uuid as _uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import CHAR, DateTime, Integer, Numeric
from sqlalchemy.types import TypeDecorator

_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def er_uuid(v) -> bool:
    return isinstance(v, str) and bool(_UUID.match(v))


def ny_uuid() -> str:
    return str(_uuid.uuid4())


class Uuid36(TypeDecorator):
    impl = CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import UUID
            return dialect.type_descriptor(UUID(as_uuid=False))
        if dialect.name == "mssql":
            from sqlalchemy.dialects.mssql import UNIQUEIDENTIFIER
            return dialect.type_descriptor(UNIQUEIDENTIFIER(as_uuid=False))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        s = str(value)
        if not _UUID.match(s):
            raise ValueError(f"ikke et uuid: {s[:60]!r}")
        return s.lower()

    def process_result_value(self, value, dialect):
        return None if value is None else str(value).lower()


_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?"
                  r"(Z|[+-]\d{2}:?\d{2})?$")


def til_utc(v) -> datetime | None:
    """datetime/ISO-tekst -> naiv UTC-datetime med millisekunder. Tekst uden zone læses som UTC."""
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        d = v
        if d.tzinfo is not None:
            d = d.astimezone(timezone.utc).replace(tzinfo=None)
    elif isinstance(v, str):
        m = _ISO.match(v.strip())
        if not m:
            raise ValueError(f"ikke et ISO-tidspunkt: {v[:60]!r}")
        y, mo, da, hh, mi, ss, fr, zone = m.groups()
        d = datetime(int(y), int(mo), int(da), int(hh or 0), int(mi or 0), int(ss or 0),
                     int((fr or "0").ljust(6, "0")[:6]))
        if zone and zone != "Z":
            tegn = 1 if zone[0] == "+" else -1
            z = zone[1:].replace(":", "")
            d -= tegn * timedelta(hours=int(z[:2]), minutes=int(z[2:]))
    else:
        raise ValueError(f"ikke et tidspunkt: {type(v).__name__}")
    return d.replace(microsecond=(d.microsecond // 1000) * 1000)


def iso(d: datetime | None) -> str | None:
    """Naiv UTC -> ``YYYY-MM-DDTHH:MM:SS.fffZ`` (samme form som JS' ``toISOString``)."""
    if d is None:
        return None
    if d.tzinfo is not None:
        d = d.astimezone(timezone.utc).replace(tzinfo=None)
    return d.strftime("%Y-%m-%dT%H:%M:%S.") + f"{d.microsecond // 1000:03d}Z"


def nu() -> datetime:
    """Lagerets egen tid: UTC, millisekunder."""
    return til_utc(datetime.now(timezone.utc))


class Decimaltal(TypeDecorator):
    """``NUMERIC(p,s)``, der tager imod ``Decimal``/int/float og giver ``float`` tilbage.

    sqlite-driveren kan ikke binde ``Decimal`` (målt: "type 'decimal.Decimal' is not supported"), og forløbene giver
    decimaler videre, som databasen gav dem (mssql/postgresql leverer ``Decimal``)."""
    impl = Numeric
    cache_ok = True

    def __init__(self, precision: int, scale: int):
        super().__init__(precision, scale, asdecimal=False)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, bool):
            raise ValueError("et decimaltal kan ikke være true/false")
        return float(value) if dialect.name == "sqlite" else value


class Heltal(TypeDecorator):
    """``INTEGER``, der også tager imod en hel ``Decimal``/float (som mssql kan levere) — men aldrig en brøk."""
    impl = Integer
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, bool):
            raise ValueError("et heltal kan ikke være true/false")
        if int(value) != value:
            raise ValueError(f"{value!r} er ikke et heltal")
        return int(value)


class UtcTid(TypeDecorator):
    impl = CHAR(24)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import TIMESTAMP
            return dialect.type_descriptor(TIMESTAMP(precision=3))
        if dialect.name == "mssql":
            from sqlalchemy.dialects.mssql import DATETIME2
            return dialect.type_descriptor(DATETIME2(precision=3))
        if dialect.name == "sqlite":
            return dialect.type_descriptor(CHAR(24))
        return dialect.type_descriptor(DateTime())

    def process_bind_param(self, value, dialect):
        d = til_utc(value)
        if d is None:
            return None
        return iso(d) if dialect.name == "sqlite" else d

    def process_result_value(self, value, dialect):
        return til_utc(value)
