"""Genererer datakrav.data.ts (udsnit af viden/data_krav.json, fv-data) og
orakel-vektorer.json (viden/vaerktoej/valider_tidsserie.py kørt på fv-data's
fixtures, modelrepoets fire datafiler og nogle ekstra tilfælde).

Browserens forhåndstjek (tidsserie-validering.ts) skal give SAMME status,
SAMME fund (kode, niveau, besked) og SAMME normaliserede fil (sha256) som
oraklet — tidsserie-validering.spec.ts kræver det. Kør igen, når fv-data
ændrer data_krav.json eller oraklet; testen fejler, hvis datafilen er gammel.

Kør (fra app/):
  ../fabric/_lokal/.venv/Scripts/python.exe src/sider/konfiguration/_byg/byg_datakrav.py
"""
from __future__ import annotations

import base64
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
sys.dont_write_bytecode = True

HER = Path(__file__).resolve().parent
OMRAADE = HER.parent
PRODUKT = HER.parents[4]
VIDEN = PRODUKT / "viden"
REPO = PRODUKT.parent / "fjernvarme-businesscase"
PIN = "eef950a2ac7b3808a9456dcf48742ce08e52366a"
sys.path.insert(0, str(VIDEN / "vaerktoej"))
import valider_tidsserie as V  # noqa: E402

KRAV_TEKST = (VIDEN / "data_krav.json").read_text(encoding="utf-8")
K = json.loads(KRAV_TEKST)


def datafil() -> None:
    t = K["tidsserier"]
    ud = {
        "version": K["version"],
        "sha256_data_krav": hashlib.sha256((VIDEN / "data_krav.json").read_bytes()).hexdigest(),
        "graenser": t["graenser"] | {"kalibrering": None},
        "tidskolonne_navne": t["inputformat"]["tidskolonne_navne"],
        "vaerdikolonne_navne": t["inputformat"]["vaerdikolonne_navne"],
        "tomme_vaerdier": t["inputformat"]["tomme_vaerdier"],
        "enheder": t["inputformat"]["enheder"],
        "regler": {r["kode"]: {"niveau": r["niveau"], "hvornaar": r["hvornaar"], "besked": r["besked"]}
                   for r in t["regler"]},
    }
    del ud["graenser"]["kalibrering"]
    tekst = ("//-----------------------------------------------------------------------\n"
             "// GENERERET af _byg/byg_datakrav.py fra viden/data_krav.json (fv-data).\n"
             "// Ret ikke i hånden — ret data_krav.json og kør generatoren igen.\n"
             "//-----------------------------------------------------------------------\n\n"
             "export const DATAKRAV = " + json.dumps(ud, ensure_ascii=False, indent=1) + " as const;\n")
    # fv-app 15:00: dataene ligger hos Functions (én tolker for browser og backend); OMRAADE/datakrav.data.ts re-eksporterer.
    (OMRAADE.parent.parent.parent / "rayfin" / "functions" / "src" / "datakrav.data.ts").write_text(tekst, encoding="utf-8", newline="\n")
    print(f"datakrav.data.ts: {len(ud['regler'])} regler, data_krav version {ud['version']}")


def fixtures() -> list:
    """fv-data's FIX-liste, hentet ordret ud af tjek_data_krav.py (uden at køre resten af porten)."""
    kilde = (VIDEN / "vaerktoej" / "tjek_data_krav.py").read_text(encoding="utf-8")
    a = kilde.index("def serie(")
    b = kilde.index("# Regler, der ikke har en upload-fixture")
    ns = {"V": V, "K": K, "datetime": datetime, "timedelta": timedelta, "timezone": timezone, "UTC": timezone.utc}
    exec(compile(kilde[a:b], "tjek_data_krav.py[FIX]", "exec"), ns)
    return ns["FIX"]


def repo_fil(sti: str) -> bytes:
    return subprocess.run(["git", "-C", str(REPO), "show", f"{PIN}:{sti}"], capture_output=True, check=True).stdout


def ekstra() -> list:
    """Tilfælde ud over fixtures: dansk tid over begge skift, timens slut over vintertid, dansk format."""
    def s(start, n, fmt, f, trin=timedelta(hours=1), hoved="tidspunkt;varme_mw", skil=";"):
        t0 = datetime.fromisoformat(start)
        return hoved + "\n" + "".join(f"{(t0 + i * trin).strftime(fmt)}{skil}{f(i)}\n" for i in range(n))
    vinter = "tidspunkt;varme_mw\n" + "".join(
        f"{d} {h:02d}:00;{12 + i % 5},5\n" for i, (d, h) in enumerate(
            [("25-10-2026", h) for h in range(0, 3)] + [("25-10-2026", 2)] + [("25-10-2026", h) for h in range(3, 24)]
            + [(f"{dd:02d}-10-2026", h) for dd in (26, 27) for h in range(24)]))
    return [
        ("ekstra_vintertid_dansk", "varmelast", vinter, {"tidszone": "Europe/Copenhagen"}),
        ("ekstra_vintertid_dansk_slut", "varmelast", vinter, {"tidszone": "Europe/Copenhagen", "tidsstempel": "slut"}),
        ("ekstra_sommertid_dansk", "varmelast", s("2026-03-28 00:00", 24 * 3, "%d-%m-%Y %H:%M", lambda i: f"{10 + i % 3},25"), {"tidszone": "Europe/Copenhagen"}),
        ("ekstra_tusindtal", "varmelast", s("2026-01-01 00:00", 72, "%d.%m.%Y %H:%M", lambda i: f"1.{200 + i:03d},5"), {"enhed": "kW"}),
        ("ekstra_kvarter_kwh", "varmelast", s("2026-01-01 00:00", 4 * 72, "%Y-%m-%dT%H:%M:%SZ", lambda i: f"{2500 + i}", trin=timedelta(minutes=15), hoved="time,kwh", skil=","), {"enhed": "kWh"}),
        ("ekstra_kolonnevalg", "varmelast", s("2026-01-01 00:00", 72, "%Y-%m-%d %H:%M", lambda i: f"{i},{20 + i % 4}", hoved="timestamp,nr,heat_mw_abvaerk", skil=","), {"kolonne": "heat_mw_abvaerk"}),
    ]


def vektorer() -> None:
    sager = []
    for kode, rolle, tekst, kw in fixtures():
        sager.append((f"fix_{kode}", rolle, tekst, kw))
    for sti, rolle in (("data/billund_abvaerk_hourly.csv", "varmelast"),
                       ("data/billund_abvaerk_hourly_splejset_jun2026.csv", "varmelast"),
                       ("data/solar_andeby_dmi_karup.csv", "solprofil"),
                       ("data/synthetic_solar_andeby.csv", "solprofil")):
        sager.append((f"repo_{Path(sti).stem}", rolle, repo_fil(sti), {}))
    sager += ekstra()
    ud = []
    for navn, rolle, tekst, kw in sager:
        r = V.valider(tekst, rolle, k=K, **kw)
        stor = len(tekst) > 400_000
        raa = tekst if isinstance(tekst, bytes) else tekst.encode("utf-8")
        sag = {
            "navn": navn, "rolle": rolle, "valg": {k: v for k, v in kw.items()},
            "status": r.status, "fund": r.validering.get("fund", []),
            "sha256": r.sha256,
            "normaliseret": None if r.data is None or len(r.data) > 30_000 else r.data.decode("utf-8"),
            "validering": {k: r.validering.get(k) for k in ("start", "slut", "antal_raekker", "forventet_raekker", "antal_huller",
                                                          "udfyldte_timer", "laengste_hul_timer", "daekning", "min", "max", "max_tid",
                                                          "middel", "sum_mwh", "kilde_oploesning", "tidskolonne", "vaerdikolonne",
                                                          "kilde_raekker", "benyttelsestid_t", "sol_tyngdepunkt_time_utc")},
        }
        if stor and navn == "fix_for_stor":
            sag["generer"] = {"start": "2020-01-01", "n": 120_001, "vaerdi": "1"}   # for stor til at gemme; testen bygger den selv
        elif isinstance(tekst, bytes):
            sag["base64"] = base64.b64encode(tekst).decode("ascii")
        else:
            sag["tekst"] = tekst
        ud.append(sag)
    sti = OMRAADE / "orakel-vektorer.json"
    sti.write_text(json.dumps({"kilde": "viden/vaerktoej/valider_tidsserie.py + tjek_data_krav.py FIX",
                               "sha256_data_krav": hashlib.sha256((VIDEN / "data_krav.json").read_bytes()).hexdigest(),
                               "sager": ud}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    gyldige = sum(1 for s in ud if s["status"] == "gyldig")
    print(f"orakel-vektorer.json: {len(ud)} sager ({gyldige} gyldige), {sti.stat().st_size // 1024} kB")


if __name__ == "__main__":
    datafil()
    vektorer()
