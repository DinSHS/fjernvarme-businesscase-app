"""Byg community-pakken (wheel) — motor, skema, viden, kredit og frontend lægges IND i ``fjernvarme_app``.

    python community/pakke.py [--ud <mappe>] [--uden-web]

Hvorfor et byggescript og ikke bare ``pip install community/``: kernen genbruges direkte fra repoet (brief 21
punkt 3) — regnemotoren ``fabric/fjv``, skemaet ``skema/``, fv-data's regler ``viden/`` og kreditfaktaene
``offentlig/kredit.json`` + ``LICENSES/`` ligger uden for ``community/``. Her kopieres de til en byggemappe i præcis
det layout, ``miljoe.py`` slår op, og wheel'en bygges derfra. Intet i repoet ændres.

Frontenden er ``app/dist-rest`` (fv-app: ``npm run build:community``); findes den ikke, bygges pakken uden (API'et
virker, forsiden siger det).

Modellens kode er IKKE med: den hentes på den pinnede commit ved første kørsel (CREDITS.md).
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

HER = Path(__file__).resolve().parent
ROD = HER.parent
IGNORER = shutil.ignore_patterns("__pycache__", "*.pyc", "_lokal", ".pytest_cache")

#: (kilde i repoet, mål i pakken) — det layout miljoe.py, skema.py og fjv selv slår op.
KOPIER = [
    ("fabric/fjv", "fjernvarme_app/_motor/fjv"),
    ("fabric/maaleregister.json", "fjernvarme_app/_motor/maaleregister.json"),
    ("viden/data_krav.json", "fjernvarme_app/viden/data_krav.json"),
    ("viden/vaerktoej/valider_tidsserie.py", "fjernvarme_app/viden/vaerktoej/valider_tidsserie.py"),
    ("skema/skema.json", "fjernvarme_app/_ressourcer/skema/skema.json"),
    ("skema/fjv_skema.py", "fjernvarme_app/_ressourcer/skema/fjv_skema.py"),
    ("skema/ddl", "fjernvarme_app/_ressourcer/skema/ddl"),
    ("offentlig/kredit.json", "fjernvarme_app/_ressourcer/offentlig/kredit.json"),
    ("LICENSES", "fjernvarme_app/_ressourcer/LICENSES"),
]
#: Valgfrie (fv-offentlig ejer dem); kommer med, når de findes — også i wheel'ens rod-metadata.
VALGFRI = ["CREDITS.md", "NOTICE", "LICENSE"]
#: Motorens filer, der kun er til Fabric eller test, og som ikke hører hjemme i en lokal installation.
UDELAD_I_MOTOR = {"lager_minne.py"}


def byg(ud: Path, med_web: bool = True) -> Path:
    stage = HER / "_byg" / "pakke"
    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True)
    shutil.copytree(HER / "fjernvarme_app", stage / "fjernvarme_app",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "tests", "_motor", "_ressourcer", "web"))
    for f in ("pyproject.toml", "README.md", "API.md"):
        shutil.copyfile(HER / f, stage / f)
    for kilde, maal in KOPIER:
        k, m = ROD / kilde, stage / maal
        if not k.exists():
            raise SystemExit(f"mangler i repoet: {kilde}")
        m.parent.mkdir(parents=True, exist_ok=True)
        if k.is_dir():
            shutil.copytree(k, m, ignore=IGNORER)
        else:
            shutil.copyfile(k, m)
    for navn in UDELAD_I_MOTOR:
        (stage / "fjernvarme_app/_motor/fjv" / navn).unlink(missing_ok=True)
    for f in VALGFRI:
        if (ROD / f).is_file():
            shutil.copyfile(ROD / f, stage / f)
            shutil.copyfile(ROD / f, stage / "fjernvarme_app/_ressourcer" / f)
    web = ROD / "app" / "dist-rest"
    if med_web and (web / "index.html").is_file():
        shutil.copytree(web, stage / "fjernvarme_app/web")
        print(f"frontend: {web}")
    else:
        print("frontend: IKKE med (app/dist-rest findes ikke - kør npm run build:community i app/)")
    ud.mkdir(parents=True, exist_ok=True)
    r = subprocess.run([sys.executable, "-m", "pip", "wheel", "--no-deps", "--no-build-isolation", "-w", str(ud),
                        str(stage)], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit("pip wheel fejlede:\n" + r.stdout[-3000:] + r.stderr[-3000:])
    hjul = sorted(ud.glob("fjernvarme_app-*.whl"), key=lambda p: p.stat().st_mtime)[-1]
    print(f"bygget: {hjul} ({hjul.stat().st_size // 1024} kB)")
    return hjul


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    a = argparse.ArgumentParser()
    a.add_argument("--ud", default=str(HER / "_byg" / "dist"))
    a.add_argument("--uden-web", action="store_true")
    x = a.parse_args()
    byg(Path(x.ud), med_web=not x.uden_web)
