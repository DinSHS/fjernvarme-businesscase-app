"""Live-bevis for uploads over HTTP — samme kald som ``skriv.ts`` › ``uploadTidsserie``/``aktiverTidsserie``/``uploadVaerksark``.

    python tests/live_upload.py http://localhost:8000 <vaerk_kode> <fil.csv> <ark.xlsx>

CSV: anmodning ``upload_tidsserie`` i eget navn med base64-tekstens sha256 -> ``uploadTidsserie`` -> aktivér -> deaktivér.
Værksark: anmodning ``upload_vaerksark`` -> ``uploadVaerksark`` -> følg ``Vaerksarkimport`` til ``faerdig``/``fejl``.
"""

from __future__ import annotations

import base64
import hashlib
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from live_bestil import kald, laes_alle  # noqa: E402

NIL = "00000000-0000-0000-0000-000000000000"


def anmod(base, bruger, vaerk_id, handling: dict) -> str:
    nu = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    a = kald(base, "POST", "/api/data/Aendringsanmodning", {
        "vaerk_id": vaerk_id, "forventet_revision": 0, "anmodet_af": bruger, "anmodet": nu, "status": "ny",
        "aendringer_json": json.dumps([handling], ensure_ascii=False)})
    return a["id"]


def main(argv):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    base, kode, csv, ark = argv[1], argv[2], Path(argv[3]), Path(argv[4])
    bruger = kald(base, "GET", "/api/session")["bruger"]
    v = laes_alle(base, "Vaerk", {"kode": {"eq": kode}})[0]

    b64 = base64.b64encode(csv.read_bytes()).decode()
    aid = anmod(base, bruger, v["id"], {"handling": "upload_tidsserie", "rolle": "varmelast", "navn": "Live CSV",
                                        "filnavn": csv.name, "tidsstempel": "start", "tidszone": "UTC", "enhed": "MW",
                                        "kolonne": None, "sha256": hashlib.sha256(b64.encode()).hexdigest()})
    u = kald(base, "POST", "/api/fn/uploadTidsserie", {"anmodningId": aid, "indholdBase64": b64})
    print("uploadTidsserie:", u.get("ok"), u.get("status"), u.get("svar"))
    falsk = anmod(base, bruger, v["id"], {"handling": "upload_tidsserie", "rolle": "varmelast", "navn": "x",
                                          "filnavn": "x.csv", "tidsstempel": "start", "tidszone": "UTC", "enhed": "MW",
                                          "kolonne": None, "sha256": "0" * 64})
    print("forkert sha256:", kald(base, "POST", "/api/fn/uploadTidsserie", {"anmodningId": falsk, "indholdBase64": b64}).get("svar"))
    if u.get("ok"):
        tid = u["tidsserie_id"]
        t = kald(base, "GET", f"/api/data/Tidsserie/{tid}")
        print("række:", {k: t[k] for k in ("status", "sha256", "antal_raekker", "start", "slut", "aktiv", "sti")})
        d = kald(base, "POST", "/api/fn/hentTidsserie", {"tidsserieId": tid, "fra": "", "til": ""})
        print("hentTidsserie:", d.get("ok"), d.get("start"), len(d.get("vaerdier") or []))
        for aktiv in (True, False):
            a = anmod(base, bruger, v["id"], {"handling": "aktiver_tidsserie", "tidsserie_id": tid, "aktiv": aktiv})
            print(f"aktiver({aktiv}):", kald(base, "POST", "/api/fn/udfoerAendring", {"anmodningId": a}).get("svar"))

    b64 = base64.b64encode(ark.read_bytes()).decode()
    aid = anmod(base, bruger, NIL, {"handling": "upload_vaerksark", "filnavn": ark.name, "timeslut": None,
                                    "sha256": hashlib.sha256(b64.encode()).hexdigest()})
    t0 = time.time()
    u = kald(base, "POST", "/api/fn/uploadVaerksark", {"anmodningId": aid, "indholdBase64": b64})
    print("uploadVaerksark:", json.dumps(u, ensure_ascii=False))
    igen = kald(base, "POST", "/api/fn/uploadVaerksark", {"anmodningId": aid, "indholdBase64": b64})
    print("igen (samme import):", igen.get("import_id") == u.get("import_id"), igen.get("status"))
    imp = u.get("import_id")
    while imp:
        i = kald(base, "GET", f"/api/data/Vaerksarkimport/{imp}")
        if i["status"] in ("faerdig", "fejl"):
            print(f"{time.time() - t0:.0f} s  import {i['status']}: vaerk_id={i.get('vaerk_id')}")
            print("   ", (i.get("log") or "")[:600].replace("\n", "\n    "))
            return 0 if i["status"] == "faerdig" else 1
        time.sleep(5)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
