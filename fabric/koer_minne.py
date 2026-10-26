#!/usr/bin/env python3
"""Den ægte arbejder uden Fabric: bestil et repo-værk i ``lager_minne`` og kør køen.

    python koer_minne.py andeby 2026-01-05 2026-01-06       # forventet 867.031,23 kr. ved eef950a (844.727,28 ved b49aeb0)

Samme kæde som i Fabric - frosset input, ``input_hash``, ``arbejder.arbejd`` under låsen,
``koersel.koer_en``, publicering - men lageret er hukommelsen (``fjv/lager_minne.py``), og
filerne ligger i ``_lokal/Files``. Det er eksemplet på, hvordan community-udgaven kobler sin
egen ``LokalLager`` på: byt ``MinneKoe`` ud med jeres, resten er uændret.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
HER = Path(__file__).resolve().parent
os.environ.setdefault("FJV_FILES", str(HER / "_lokal" / "Files"))   # FØR import af fjv
if os.name == "nt":                                # Windows' 260-tegnsgrænse (se README)
    import tempfile
    os.makedirs("C:/fjvt", exist_ok=True)
    tempfile.tempdir = "C:/fjvt"
py = HER / "_lokal" / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
if py.exists():
    os.environ.setdefault("FJV_PYTHON", str(py))
sys.path.insert(0, str(HER))

from fjv import konstanter as K  # noqa: E402
from fjv import lager_minne as M  # noqa: E402
from fjv import runtime as R  # noqa: E402
from fjv.arbejder import arbejd  # noqa: E402
from fjv.byg_case import input_hash, raekker_fra_vaerk  # noqa: E402
from fjv.flad import flad  # noqa: E402
from fjv.rapport import Rapport  # noqa: E402


def main(kode: str, start: str, slut: str) -> int:
    mappe, _ = R.sikr_model(K.MODEL_COMMIT)
    fil = next(f for f in sorted((mappe / "cases").iterdir())
               if f.suffix == ".yaml" and f.stem.lower() == kode.lower())
    scen = {"periode_start": start, "periode_slut": slut,
            "model_commit": K.MODEL_COMMIT, "data_commit": K.DF_DATA_SHA}
    raekker = raekker_fra_vaerk(flad(fil.read_text(encoding="utf-8")), [], scen)
    db = M.MinneDb()
    kid = db.bestil(raekker=raekker, input_hash=input_hash(raekker))
    rap = Rapport("koer_minne", sti=str(Path(K.FILES) / K.REL_RUN / "koer_minne.json"))
    t = arbejd(M.MinneKoe(db), rap, mig="lokal:koer_minne")
    r = db.koersler[kid]
    print(json.dumps({"koersel_id": kid, "status": r["status"], "objektiv_dkk": r.get("objektiv_dkk"),
                      "opnaaet_gap": r.get("opnaaet_gap"), "fejlbesked": r.get("fejlbesked"),
                      "resultatraekker": {k: len(v) for k, v in db.resultater.get(kid, {}).items()},
                      "arbejder": {k: t.get(k) for k in ("laas", "koe_stop", "ok")}},
                     ensure_ascii=False, indent=1, default=str))
    return 0 if r["status"] == "faerdig" else 1


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:4]))
