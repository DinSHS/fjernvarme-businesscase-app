"""Mål, hvor mange tegn én time fylder i KoerselTime, som funktion af antal enheder (runde 14b).

Et syntetisk værk: modelrepoets ``cases/andeby.yaml`` + N ekstra enheder med neutrale navne (``varmepumpe_01``,
``elkedel_02`` …), klonet fra Andebys egne enhedstyper og med en tredjedel af kildens ``p_max_heat``. Det køres med
``run_case.py`` ved pinnen, og modellens ``_hourly.csv`` måles med appens egen opdeling (``fjv.resultater``):

  objekt_max   den bredeste time som ét JSON-objekt (formatet før runde 14b; grænsen var 4000 tegn)
  liste_max    samme time som en liste af tal uden kolonnenavne - den mindste kodning, der stadig er uafrundet
  raekker_max  rækker, appen gemmer for den bredeste time (KoerselTime + KoerselTimeDel)

    python viden/vaerktoej/maal_timebredde.py --model <modelrepo ved pinnen> --df-data <df-data-klon> \\
        --ud C:\\fjvm [--balancering] [--stress] [--kun-el] --start 2026-01-05 --slut 2026-01-07 34

``--stress``: alle enheder uden budvindue og et samlet budloft på 1000 MW (det værst tænkelige, ikke et værk).
``--kun-el``: de ekstra enheder er kun varmepumper og elkedler (alle prækvalificeret til aFRR og mFRR).
Python med modellens pakker (``FJV_MODELPYTHON``). Windows: kort ``--ud``; modellens filnavne er lange.
Målingerne fra 17. november 2026 (90fb16e / 106b9fc) står i ``noter/maaling_timebredde_r14b.md``.
"""
from __future__ import annotations

import argparse
import copy
import csv
import json
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
ROD = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROD / "fabric"))
from fjv import resultater as RS  # noqa: E402

import yaml  # noqa: E402  (modellens pakker)

#: Neutralt navn -> Andebys enhed, der klones.
SKABELON = {"varmepumpe": "vp_luft_vand", "elkedel": "elkedel_ny", "gaskedel": "gaskedel_agg",
            "halmkedel": "halmkedel", "gasmotor": "gasmotor"}


def byg_case(model: Path, n: int, stress: bool, kun_el: bool) -> dict:
    c = yaml.safe_load((model / "cases" / "andeby.yaml").read_text(encoding="utf-8"))
    typer = ["varmepumpe", "elkedel"] if kun_el else list(SKABELON)
    for i in range(n):
        t = typer[i % len(typer)]
        u = copy.deepcopy(c["units"][SKABELON[t]])
        u["enabled"] = True
        u["p_max_heat"] = round(float(u["p_max_heat"]) / 3, 3)
        u["p_min_heat"] = min(float(u.get("p_min_heat", 0)), u["p_max_heat"] / 2)
        if stress:
            u.setdefault("ancillary", {}).pop("bid_window", None)
        c["units"][f"{t}_{i + 1:02d}"] = u
    if stress:
        c["balancing"]["ancillary_caps"]["total_mw"] = 1000.0
    c["meta"]["case_name"] = f"syn{n}"
    return c


def maal(hourly: Path) -> dict:
    out = type("Ud", (), {"fil": lambda self, endelse: hourly})()
    reg = RS.register()
    tm, td = RS.timer(out, reg)
    with open(hourly, encoding="utf-8", newline="") as f:
        r = csv.reader(f)
        hoved = next(r)
        raekker = list(r)
    faste = {"timestamp", *reg["tid"]["kolonner"].values()}
    obj, liste = [], []
    for raekke in raekker:
        d = {h: RS.tal(v) for h, v in zip(hoved, raekke) if h not in faste}
        obj.append(len(json.dumps(d, separators=(",", ":"), allow_nan=False)))
        liste.append(len(json.dumps(list(d.values()), separators=(",", ":"), allow_nan=False)))
    pr_time: dict[str, int] = {}
    for d in td:
        pr_time[d["tid"]] = pr_time.get(d["tid"], 0) + 1
    return {"kolonner": len(hoved), "timer": len(raekker), "objekt_max": max(obj), "liste_max": max(liste),
            "raekker_max": 1 + max(pr_time.values(), default=0), "timedele": len(td)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("n", type=int, help="antal ekstra enheder ud over Andebys seks")
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--df-data", type=Path, required=True)
    ap.add_argument("--ud", type=Path, required=True)
    ap.add_argument("--start", default="2026-01-05")
    ap.add_argument("--slut", default="2026-01-07")
    ap.add_argument("--balancering", action="store_true")
    ap.add_argument("--stress", action="store_true")
    ap.add_argument("--kun-el", action="store_true")
    a = ap.parse_args()
    navn = f"n{a.n}_{'b' if a.balancering else 'u'}{'s' if a.stress else ''}{'e' if a.kun_el else ''}_{a.start}"
    ud = a.ud / navn
    ud.mkdir(parents=True, exist_ok=True)
    case = ud / "case.yaml"
    case.write_text(yaml.safe_dump(byg_case(a.model, a.n, a.stress, a.kun_el), allow_unicode=True, sort_keys=False),
                    encoding="utf-8")
    argv = [sys.executable, "run_case.py", str(case), "--data-source", "github", "--start", a.start, "--end", a.slut,
            "--df-data-cache", str(a.df_data), "--out-dir", str(ud), "--mip-gap", "0.01"]
    if a.balancering:
        argv.append("--with-balancing")
    t0 = time.time()
    p = subprocess.run(argv, cwd=a.model, capture_output=True, text=True, encoding="utf-8", errors="replace")
    (ud / "log.txt").write_text(p.stdout + "\n--- stderr\n" + p.stderr, encoding="utf-8")
    fil = sorted(ud.rglob("*_hourly.csv"))
    if p.returncode or not fil:
        print(json.dumps({"navn": navn, "fejl": p.returncode, "hale": p.stderr[-800:]}, ensure_ascii=False))
        return 1
    print(json.dumps({"navn": navn, "enheder": 6 + a.n, "balancering": a.balancering, "stress": a.stress,
                      "kun_el": a.kun_el, "sek": round(time.time() - t0), **maal(fil[0])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
