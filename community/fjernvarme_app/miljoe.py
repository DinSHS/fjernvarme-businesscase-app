"""Hvor ting ligger — i repoet (udvikling) og i en installeret pakke.

Regnemotoren ``fjv`` (``fabric/fjv/``) genbruges uændret. To layouts:

* **Repo:** ``<rod>/community/fjernvarme_app`` → motoren er ``<rod>/fabric/fjv``, viden er ``<rod>/viden``.
* **Pakke:** ``pakke.py`` lægger motoren i ``fjernvarme_app/_motor/fjv`` (+ ``_motor/maaleregister.json``)
  og fv-data's regler i ``fjernvarme_app/viden`` — præcis de relative placeringer, ``fjv`` selv slår op
  (``resultater.register`` og ``datakrav._find``), så motoren ikke skal kende til pakken.

``fjv.konstanter.FILES`` læses fra ``FJV_FILES`` VED IMPORT. ``forbered(datamappe)`` skal derfor kaldes,
før ``fjv`` importeres første gang; ``motor()`` håndhæver det.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

HER = Path(__file__).resolve().parent

#: Pakket layout (efter pakke.py) har forrang; ellers repoets.
_PAKKET = HER / "_motor"
_REPO = HER.parent.parent


def pakket() -> bool:
    return (_PAKKET / "fjv" / "koersel.py").is_file()


def motor_rod() -> Path:
    """Mappen der INDEHOLDER pakken ``fjv``."""
    if pakket():
        return _PAKKET
    rod = _REPO / "fabric"
    if (rod / "fjv" / "koersel.py").is_file():
        return rod
    raise RuntimeError("Regnemotoren (fjv) findes hverken i pakken eller i repoets fabric/. "
                       "Installér pakken igen eller kør fra en fuld kopi af repoet.")


def viden_rod() -> Path:
    for p in (HER / "viden", _REPO / "viden"):
        if (p / "data_krav.json").is_file():
            return p
    raise RuntimeError("viden/data_krav.json findes ikke (tidsseriereglerne).")


def ressource(navn: str) -> Path:
    """En fil der ligger i roden af repoet / pakkens ``_ressourcer`` (fx ``offentlig/kredit.json``)."""
    for p in (HER / "_ressourcer" / navn, _REPO / navn):
        if p.exists():
            return p
    raise FileNotFoundError(navn)


def web_rod() -> Path | None:
    """Den færdigbyggede frontend (``VITE_BACKEND=rest``), hvis den findes."""
    for p in (HER / "web", _REPO / "app" / "dist-rest"):
        if (p / "index.html").is_file():
            return p
    return None


_FORBEREDT: Path | None = None


def forbered(datamappe: Path) -> Path:
    """Sæt ``FJV_FILES`` til ``<datamappe>/Files`` og gør ``fjv`` importerbar. Idempotent.

    Skal ske før ``fjv`` importeres. Er den allerede importeret med en anden rod, er det en fejl
    (to roder i samme proces ville få kørsler til at skrive ét sted og læse et andet)."""
    global _FORBEREDT
    files = (Path(datamappe).resolve() / "Files")
    files.mkdir(parents=True, exist_ok=True)
    if "fjv.konstanter" in sys.modules:
        nu = sys.modules["fjv.konstanter"].FILES
        if Path(nu).resolve() != files:
            raise RuntimeError(f"fjv er allerede importeret med FILES={nu}, ikke {files}")
    os.environ["FJV_FILES"] = str(files)
    rod = str(motor_rod())
    if rod not in sys.path:
        sys.path.insert(0, rod)
    _FORBEREDT = files
    return files


def files() -> Path:
    if _FORBEREDT is None:
        raise RuntimeError("miljoe.forbered(datamappe) er ikke kaldt")
    return _FORBEREDT


def motor():
    """``fjv``-pakken (efter ``forbered``)."""
    if _FORBEREDT is None:
        raise RuntimeError("miljoe.forbered(datamappe) skal kaldes, før fjv importeres")
    import fjv  # noqa: F401  (importen ER pointen: efter forbered)
    return sys.modules["fjv"]
