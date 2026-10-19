import json
from pathlib import Path

from fjv import konstanter as K, runtime as R
from fjv.db import Db
from fjv.importer import importer_et, vaerksfiler
from fjv.rapport import Rapport

RAP = Rapport("fjv_importer_vaerker")
try:
    RAP["kodeaftryk"] = R.kodeaftryk(_MOTOR_LOKAL / "fjv")
    konfig = json.loads((Path(K.FILES) / K.REL_KONFIG / "db.json").read_text(encoding="utf-8"))
    sha = (model_commit or K.MODEL_COMMIT).strip()
    kode, info = R.sikr_model(sha)
    RAP.trin("modelkode", info)
    db = Db(konfig)
    udfald = []
    for f in vaerksfiler(kode):
        u = importer_et(db, f, sha, bool(overskriv))
        udfald.append(u)
        RAP.trin(f.name, u)
    RAP["vaerker"] = udfald
    # §6d: repoets egne datafiler (Billunds målte varmelast, Andebys solprofil) som Tidsserie.
    from fjv.db import _har_kolonne
    from fjv.tidsserie_db import registrer_repo_tidsserier
    if _har_kolonne(db, "Tidsseries", "sha256"):
        from fjv import datakrav as DK
        RAP["regler"] = DK.kilder()
        ts = []
        for f in vaerksfiler(kode):
            try:
                ts += registrer_repo_tidsserier(db, kode, f)
            except Exception as e:          # én fil må ikke vælte resten; rapporten siger det
                ts.append({"fil": f.name, "udfald": "fejl", "besked": f"{type(e).__name__}: {e}"})
        RAP["tidsserier"] = ts
        RAP.trin("tidsserier", [{k: t.get(k) for k in ("kode", "fil", "rolle", "udfald", "status")}
                                for t in ts])
        if any(t.get("udfald") == "fejl" for t in ts):
            udfald.append({"udfald": "fejl", "besked": "registrering af repo-tidsserier fejlede"})
    else:
        RAP.advar("tabellen Tidsseries findes ikke endnu - repoets tidsserier er ikke registreret")
    # §6c: Motor-rækken bærer de pins, bestillinger fryser i deres input.
    from fjv.db import skriv_motor_pins
    RAP["motor_pins"] = skriv_motor_pins(db, sha, K.DF_DATA_SHA)
    RAP["ok"] = not any(u["udfald"] == "fejl" for u in udfald)
except Exception as fejl:
    RAP.fejl(fejl)
finally:
    RAP.skriv()

print(json.dumps({k: RAP.data.get(k) for k in ("ok", "vaerker", "undtagelse")},
                 ensure_ascii=False, indent=1, default=str)[:5000])
if not RAP["ok"]:
    raise RuntimeError("fjv_importer_vaerker fejlede - se Files/_run/fjv_importer_vaerker.json")
