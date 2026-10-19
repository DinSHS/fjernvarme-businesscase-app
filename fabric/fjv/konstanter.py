"""Pinnede versioner og stier (KONTRAKT §2 og §4).

Begge SHA'er er fulde 40-tegns commits, aldrig en gren: en kørsel skal kunne
genudledes om to år, og ``main`` peger til den tid et andet sted hen. df-data
opdateres om mandagen; skift ``DF_DATA_SHA`` bevidst (og notér det), eller giv
en anden SHA ved kørslen — aldrig "seneste" implicit.
"""

from __future__ import annotations

import os
from pathlib import PurePosixPath

MODEL_REPO = "skj-1964/fjernvarme-businesscase"
MODEL_COMMIT = "b49aeb0af097be42938b80a0fea6acdd77162836"

DF_DATA_REPO = "skj-1964/df-data"
#: HEAD pr. 2026-10-16 (seneste push 2026-10-12). Målt med git ls-remote.
DF_DATA_SHA = "392992c7fe35992e79fba8d1ba7b91967e8d1481"

#: Pakkeversioner der SKAL matche modelrepoets requirements.txt-pins. Resten
#: (xarray, pandas, numpy …) er ">="-krav, og hvad runtime faktisk fik, står i
#: kørselsrapporten — det er en måling, ikke en antagelse.
PINNEDE_PAKKER = {"linopy": "0.10.0", "highspy": "1.15.1"}

#: Ingen installationsbinding her (K6-F1): workspace og lakehouse står i den private
#: ``fabric/fabric_miljoe.py``, som kun udrulningen bruger. Pakken er den samme overalt.

#: Lakehousets Files-rod. I Fabric er det FUSE-mountet; lokalt peger
#: ``FJV_FILES`` på en mappe der spejler layoutet, så samme kode kører begge steder.
FILES = os.environ.get("FJV_FILES") or "/lakehouse/default/Files"

#: Stier relativt til FILES (KONTRAKT §4). Skrevet som POSIX, fordi de også
#: gemmes i databasen (``Koersel.output_sti``) og læses af appen.
REL_KODE = "fjv/kode"            # fjv/kode/<model_commit>/
REL_DFDATA = "fjv/df-data"       # fjv/df-data/<data_sha>/
REL_VARMEDATA = "fjv/varmedata"  # fjv/varmedata/<fil>.csv
REL_KOERSLER = "fjv/koersler"    # fjv/koersler/<koersel_id>/
REL_MOTOR = "fjv/motor"          # denne pakke (fjv/motor/fjv/*.py)
REL_KONFIG = "fjv/konfig"        # fjv/konfig/db.json (miljøbinding, ikke i itemet)
REL_RUN = "_run"                 # _run/<notebook>.json

#: Markørfil der skrives SIDST ved udpakning. Uden den er en mappe en halvt
#: udpakket zip fra en afbrudt kørsel, ikke en kopi af repoet.
KOMPLET_MARKOER = ".fjv_komplet.json"


def lh_sti(*dele: str) -> str:
    """Relativ lakehouse-sti (POSIX) til lagring i databasen: ``Files/fjv/...``."""
    return str(PurePosixPath("Files", *dele))
