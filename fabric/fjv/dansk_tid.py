"""UTC -> Europe/Copenhagen uden tz-database.

``zoneinfo`` virker ikke på dev-maskinen (Windows har ingen tzdata), og en
afhængighed af værtens tz-database ville give lokal og Fabric forskellige svar
den dag de to databaser er uenige. EU-reglen er aritmetisk: sommertid fra sidste
søndag i marts 01:00 UTC til sidste søndag i oktober 01:00 UTC (+2), ellers +1.
Samme valg som ``Backend/energi/faelles/dansk_tid.py`` i BI-repoet.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def _sidste_soendag(aar: int, maaned: int) -> datetime:
    d = datetime(aar, maaned + 1, 1, tzinfo=timezone.utc) - timedelta(days=1)
    return d - timedelta(days=(d.weekday() + 1) % 7)


def er_sommertid(t_utc: datetime) -> bool:
    start = _sidste_soendag(t_utc.year, 3).replace(hour=1)
    slut = _sidste_soendag(t_utc.year, 10).replace(hour=1)
    return start <= t_utc < slut


def til_dansk(t_utc: datetime) -> datetime:
    """Naiv dansk vægurstid for et UTC-tidspunkt."""
    if t_utc.tzinfo is None:
        t_utc = t_utc.replace(tzinfo=timezone.utc)
    t_utc = t_utc.astimezone(timezone.utc)
    return (t_utc + timedelta(hours=2 if er_sommertid(t_utc) else 1)).replace(tzinfo=None)


def parse_utc(s: str) -> datetime:
    """``2026-01-05T00:00:00Z`` (eller uden Z — modellens akse er UTC, tz-naiv)."""
    s = s.strip().replace(" ", "T")
    if s.endswith("Z"):
        s = s[:-1]
    if "+" in s[10:]:
        s = s[:10] + s[10:].split("+")[0]
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def lokal_maaned(t_utc: datetime) -> str:
    return til_dansk(t_utc).strftime("%Y-%m")
