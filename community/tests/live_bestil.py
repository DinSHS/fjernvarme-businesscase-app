"""Live-bevis over HTTP — samme kald som knappen "Bestil kørsel" (``skriv.ts`` › ``bestilKoersel``) gennem REST-API'et.

    python tests/live_bestil.py http://localhost:8000 andeby 2026-01-05 2026-01-06 [--balancering]

Scenarie (klient-create i eget navn) -> Bestilling (klient-create, unik klient_noegle) -> ``startBestilling`` ->
følg kørslen (højst hvert 20. s som §6, her hvert 5. s fordi det er en test) -> skriv resultatet ud.
Kun standardbiblioteket; afslutter med kode 0 når kørslen er ``faerdig``.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
import uuid


#: Som browseren: sessionscookien (SameSite=Strict, sat af /api/session) følger med skrivningerne (K6-F9).
_AABNER = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(__import__("http.cookiejar").cookiejar.CookieJar()))


def kald(base, metode, sti, krop=None):
    data = None if krop is None else json.dumps(krop).encode("utf-8")
    if metode != "GET" and not getattr(kald, "_session", False):
        _AABNER.open(base + "/api/session", timeout=60).read()
        kald._session = True
    r = urllib.request.Request(base + sti, data=data, method=metode, headers={"Content-Type": "application/json"})
    try:
        with _AABNER.open(r, timeout=180) as s:
            return json.loads(s.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode("utf-8"))


def laes_alle(base, entitet, filter_):
    ud, efter = [], None
    while True:
        q = {"filter": json.dumps(filter_), "first": "1000"}
        if efter:
            q["after"] = efter
        s = kald(base, "GET", f"/api/data/{entitet}?" + urllib.parse.urlencode(q))
        ud += s["items"]
        if not s["hasNextPage"]:
            return ud
        efter = s["endCursor"]


def main(argv):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    base, kode, start, slut = argv[1:5]
    bal = "--balancering" in argv
    bruger = kald(base, "GET", "/api/session")["bruger"]
    v = laes_alle(base, "Vaerk", {"kode": {"eq": kode}})[0]
    nu = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    s = kald(base, "POST", "/api/data/Scenarie", {
        "vaerk_id": v["id"], "navn": f"Live {kode} {start}-{slut}", "periode_start": start, "periode_slut": slut,
        "med_balancering": bal, "arkiveret": False, "oprettet_af": bruger, "oprettet": nu})
    noegle = str(uuid.uuid4())
    b = kald(base, "POST", "/api/data/Bestilling", {"scenarie_id": s["id"], "klient_noegle": noegle,
                                                   "bestilt_af": bruger, "bestilt": nu})
    dub = kald(base, "POST", "/api/data/Bestilling", {"scenarie_id": s["id"], "klient_noegle": noegle,
                                                     "bestilt_af": bruger, "bestilt": nu})
    print("dobbeltklik:", dub.get("fejl", {}).get("kode"))
    t0 = time.time()
    svar = kald(base, "POST", "/api/fn/startBestilling", {"bestillingId": b["id"]})
    print("startBestilling:", json.dumps(svar, ensure_ascii=False))
    igen = kald(base, "POST", "/api/fn/startBestilling", {"bestillingId": b["id"]})
    print("igen (idempotent):", igen.get("koersel_id") == svar.get("koersel_id"), igen.get("ny"))
    if not svar.get("ok"):
        return 1
    kid, sidst = svar["koersel_id"], None
    while True:
        k = kald(base, "GET", f"/api/data/Koersel/{kid}")
        if (k["status"], k.get("fase")) != sidst:
            sidst = (k["status"], k.get("fase"))
            print(f"{time.time() - t0:6.0f} s  {k['status']:10} {k.get('fase') or ''}")
        if k["status"] in ("faerdig", "fejl", "annulleret"):
            break
        time.sleep(5)
    felter = ("status", "objektiv_dkk", "solve_status", "opnaaet_gap", "antal_interval_model", "antal_interval_csv",
              "model_commit", "data_commit", "fejlbesked")
    print(json.dumps({f: k.get(f) for f in felter}, ensure_ascii=False, indent=1))
    for e in ("KoerselNoegletal", "KoerselMaaned", "KoerselTime", "KoerselInput"):
        print(e, len(laes_alle(base, e, {"koersel_id": {"eq": kid}})))
    return 0 if k["status"] == "faerdig" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
