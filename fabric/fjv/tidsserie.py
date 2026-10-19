"""Værkets egne tidsserier (KONTRAKT v2.3 §6d): filkontrakten, som arbejderen læser.

Én uforanderlig fil pr. serie: ``Files/fjv/tidsserier/<vaerk_kode>/<sha256>.csv`` i
**normaliseret form** — den eneste form, arbejderen giver til modellen::

    time,mw
    2025-02-28T12:00:00Z,19.74

* ``time`` er intervallets **start** i UTC (``YYYY-MM-DDTHH:MM:SSZ``), stigende, uden
  dubletter, på hele timer (kun 1h i version 1).
* **Huller udelades.** En tom værdi ville modellens varmelast-læser interpolere som et
  hul, men profil-læseren (``production_profile_path``) ville lægge NaN i
  produktionsloftet; en udeladt række får den til at stoppe højlydt.
* ``mw`` er et endeligt tal ≥ 0 uden fortegn og eksponent. Er kildens tekst en ren
  decimal, bevares den **tegn for tegn**; ellers korteste form, der giver samme double.
  Grunden er målt: modellen læser med pandas' hurtige parser, som ikke lover samme
  double for ``1.234560`` og ``1.23456``. Modellens egne læsere giver bitvis samme
  serie fra den normaliserede fil som fra repoets (``tests/test_tidsserier.py``).
* ``sha256`` er over filens bytes. Samme hash = samme fil.

**At lave** filen (tolkning, tidszoner, enheder, regler) gør fv-data's orakel
(``fjv.datakrav`` → ``viden/vaerktoej/valider_tidsserie.py``), som appens upload også
følger. Dette modul ejer kun det, arbejderen skal stole på: formen, hashen og hvor
filen ligger.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath

ROLLER = ("varmelast", "solprofil")
OVERSKRIFT = "time,mw"
#: Markør i ``units.<sol>.production_profile_path`` for et værk, hvis solprofil er en
#: tidsserie (værksark-import): "brug den frosne solprofil".
MARKOER_SOLPROFIL = "tidsserie:solprofil"
#: Navn på kopien i kørslens lokale kodekopi (``data/``), afledt af hashen.
_LOKAL = "_fjv_ts_{}.csv"
_NORM_LINJE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00:00Z,([0-9]+(?:\.[0-9]+)?)$")
_SHA = re.compile(r"^[0-9a-f]{64}$")
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
TIME = timedelta(hours=1)


class TidsserieFejl(ValueError):
    """Filen kan ikke bruges. Beskeden er til brugeren."""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def lokalt_navn(sha: str) -> str:
    """Filnavn i kørslens ``data/`` (deterministisk, så ``byg_case`` kender det på forhånd)."""
    if not _SHA.match(sha or ""):
        raise TidsserieFejl(f"sha256 skal være 64 små hex-tegn, fik {sha!r}")
    return _LOKAL.format(sha[:16])


def lakehouse_rel(vaerk_kode: str, sha: str) -> str:
    """``fjv/tidsserier/<kode>/<sha>.csv`` (relativt til Files)."""
    return str(PurePosixPath("fjv", "tidsserier", vaerk_kode, f"{sha}.csv"))


def er_frossen_ref(v) -> bool:
    return (isinstance(v, dict) and set(v) == {"id", "sha256"}
            and isinstance(v["id"], str) and bool(_UUID.match(v["id"].lower()))
            and isinstance(v["sha256"], str) and bool(_SHA.match(v["sha256"])))


def tid_tekst(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def laes_normaliseret(data: bytes) -> list[tuple[datetime, float]]:
    """Kontrollér den normaliserede form strengt og returnér punkterne (UTC, MW).

    Arbejderens sidste værn, før filen gives til modellen: hashen beviser, at det er
    den bestilte fil; denne kontrol, at den har den form, modellen forventer."""
    try:
        tekst = data.decode("utf-8")
    except UnicodeDecodeError as fejl:
        raise TidsserieFejl("tidsseriefilen er ikke UTF-8") from fejl
    if not tekst.endswith("\n"):
        raise TidsserieFejl("tidsseriefilen er ikke afsluttet med linjeskift (afkortet?)")
    linjer = tekst[:-1].split("\n")
    if linjer[0] != OVERSKRIFT:
        raise TidsserieFejl(f"tidsseriefilen skal begynde med {OVERSKRIFT!r}, fik {linjer[0][:60]!r}")
    if len(linjer) < 2:
        raise TidsserieFejl("tidsseriefilen har ingen rækker")
    ud: list[tuple[datetime, float]] = []
    for nr, l in enumerate(linjer[1:], start=2):
        m = _NORM_LINJE.match(l)
        if not m:
            raise TidsserieFejl(f"tidsseriefilen linje {nr} har ikke formen tid,mw på hele timer: {l[:80]!r}")
        t = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4)),
                     tzinfo=timezone.utc)
        if ud and t <= ud[-1][0]:
            raise TidsserieFejl(f"tidsseriefilen linje {nr}: tidsstemplerne stiger ikke ({l[:20]})")
        ud.append((t, float(m.group(5))))
    return ud


def find_fil(files: str | Path, sha: str, sti: str | None = None) -> Path | None:
    """Filen i lakehouset: den registrerede sti (``Files/...``) eller en søgning efter
    ``<sha>.csv`` under ``fjv/tidsserier/`` (indholdsadresseret, så ethvert fund er det
    samme indhold — og hashen kontrolleres alligevel af kalderen)."""
    files = Path(files)
    if sti:
        rel = sti[len("Files/"):] if sti.startswith("Files/") else sti
        p = files / rel
        if p.is_file():
            return p
    rod = files / "fjv" / "tidsserier"
    if rod.is_dir():
        for mappe in sorted(rod.iterdir()):
            p = mappe / f"{sha}.csv"
            if p.is_file():
                return p
    return None
