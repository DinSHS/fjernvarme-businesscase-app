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
MODEL_COMMIT = "eef950a2ac7b3808a9456dcf48742ce08e52366a"

DF_DATA_REPO = "skj-1964/df-data"
#: HEAD pr. 2026-10-26 (push 2026-10-26 04:10 UTC). Målt med git ls-remote. Modellens README-tal (eef950a)
#: er regnet 19/10 med "df-data fra 5. oktober eller senere"; den præcise SHA står ikke nogen steder, så
#: pinnen er seneste (brief 30, punkt 6). Målt 2026-10-26: mellem 10be997 (5/10) og 106b9fc er 2025-filerne
#: uændrede, og 2026-filernes rækker til og med juni har samme værdier (kun id/created_at/updated_at skifter).
DF_DATA_SHA = "106b9fce9a2e3610090b1a542559024056449b88"

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
