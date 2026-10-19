"""Arbejder-processen: ``python -m fjernvarme_app arbejder`` (kø) / ``arbejder --import <id>`` (værksark).

Den lokale pendant til notebookene ``fjv_koer_scenarie`` og ``fjv_importer_vaerksark``: samme motor
(``fjv.arbejder.arbejd``, ``fjv.vaerksark.koer_importer``), samme rapport i ``Files/_run/<navn>.json``,
men lageret er ``lokal_lager`` og låsen en fillås. Processen dør med sin egen fejl, aldrig med serverens.
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path


def model_python(eksplicit: str | None) -> str | None:
    """Hvilken Python der kører ``run_case.py``.

    ``--model-python``/``FJV_PYTHON`` vinder. Ellers: har denne Python allerede modellens pins
    (``pip install fjernvarme-app[model]``), bruges den. Ellers ``None`` — så bygger motoren selv et
    venv med modelrepoets ``requirements.txt`` (``fjv.runtime.byg_miljoe``, kræver net første gang)."""
    if eksplicit:
        return eksplicit
    if os.environ.get("FJV_PYTHON"):
        return os.environ["FJV_PYTHON"]
    try:
        from importlib.metadata import version
        from fjv import konstanter as K
        if all(version(n) == v for n, v in K.PINNEDE_PAKKER.items()):
            import sys
            return sys.executable
    except Exception:
        pass
    return None


def koer(app, import_id: str | None = None) -> dict:
    """Ét job mod ``app`` (en ``server.App``). Returnerer jobbets tilstand."""
    from fjv import arbejder as A, vaerksark as VS
    from fjv.rapport import Rapport

    from . import lokal_lager as LL

    py = model_python(app.model_python)
    if py:
        os.environ["FJV_PYTHON"] = py
    if import_id is not None:
        rap = Rapport("fjv_importer_vaerksark")
        try:
            rap["tilstand"] = VS.koer_importer(LL.LokalImportLager(app.db), rap, import_id=import_id or "")
            rap["ok"] = rap["tilstand"].get("ok", False)
        except Exception as e:
            rap.fejl(e)
        finally:
            rap.skriv()
        return rap.data
    mig = f"lokal:{os.getpid()}:{uuid.uuid4().hex[:8]}"
    rap = Rapport("fjv_koer_scenarie")
    try:
        rap["tilstand"] = A.arbejd(LL.LokalKoe(app.db, app.datamappe), rap, mig=mig)
        rap["ok"] = rap["tilstand"].get("ok", False)
    except Exception as e:
        rap.fejl(e)
    finally:
        rap.skriv()
        try:
            p = Path(app.files) / "_run" / "arbejdere" / f"{mig.replace(':', '_')}.json"
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(rap.data, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
        except Exception as e:
            print("kunne ikke skrive arbejderens egen rapport:", e)
    return rap.data
