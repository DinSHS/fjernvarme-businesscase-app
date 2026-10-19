import json
from pathlib import Path

from fjv import konstanter as K, runtime as R
from fjv.rapport import Rapport
from fjv import vaerksark as VS

RAP = Rapport("fjv_importer_vaerksark")
try:
    RAP["kodeaftryk"] = R.kodeaftryk(_MOTOR_LOKAL / "fjv")
    RAP["parametre"] = {"import_id": import_id, "timeslut": bool(timeslut)}
    from fjv import datakrav as DK
    RAP["regler"] = DK.kilder()
    konfig = json.loads((Path(K.FILES) / K.REL_KONFIG / "db.json").read_text(encoding="utf-8"))
    RAP["tilstand"] = VS.koer_notebook(konfig, RAP, import_id=import_id or "",
                                       timeslut=bool(timeslut))
    RAP["ok"] = RAP["tilstand"]["ok"]
except Exception as fejl:
    RAP.fejl(fejl)
finally:
    RAP.skriv()

print(json.dumps({k: RAP.data.get(k) for k in ("ok", "tilstand", "undtagelse", "advarsler")},
                 ensure_ascii=False, indent=1, default=str)[:5000])
if not RAP["ok"]:
    raise RuntimeError("fjv_importer_vaerksark fejlede - se Files/_run/fjv_importer_vaerksark.json")
