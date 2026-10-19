"""Beviser at viden/nyt_vaerk_skabelon.json er et gyldigt værk.

1. Bladene (for flere varmebehov G) affladdes med motorens fjv.flad.afflad.
2. Rundtur: case -> yaml.safe_dump -> fjv.flad.flad giver de samme blade (type-strengt).
3. Kørselsinput bygges som en rigtig bestilling (fjv.byg_case.raekker_fra_vaerk + byg) med et
   2-døgns vindue, og modellens egen src.config.load_case indlæser case.yaml: 0 fejl.
4. Med --koer: run_case.py på et 2-døgns vindue (5.–6. jan 2026) med fv-fabric's df-data;
   kontrollerer status optimal, at gaskedlen dækker varmebehovet, og at årsbehovet passer.

Kør med fv-fabric's venv:
    fjernvarme_fabric/fabric/_lokal/.venv/Scripts/python.exe viden/vaerktoej/tjek_nyt_vaerk.py [--koer]
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
sys.dont_write_bytecode = True
HER = Path(__file__).resolve().parent
VIDEN = HER.parent
PRODUKT = VIDEN.parent
REPO = Path(os.environ.get("FJV_MODELREPO", PRODUKT.parent / "fjernvarme-businesscase"))
PIN = "b49aeb0af097be42938b80a0fea6acdd77162836"
sys.path.insert(0, str(HER))
sys.path.insert(0, str(PRODUKT / "fabric"))
import yaml  # noqa: E402
from byg_nyt_vaerk import blade, G_ANDEBY  # noqa: E402
from fjv.byg_case import byg, raekker_fra_vaerk  # noqa: E402
from fjv.flad import afflad, flad, ligner_strengt  # noqa: E402

if subprocess.run(["git", "-C", str(REPO), "diff", "--quiet", PIN, "--", "src", "run_case.py"]).returncode:
    raise SystemExit(f"modelrepoet afviger fra {PIN[:7]}")
sys.path.insert(0, str(REPO))
from src.config import load_case  # noqa: E402

fejl: list[str] = []
skabelon = json.loads((VIDEN / "nyt_vaerk_skabelon.json").read_text(encoding="utf-8"))
if [b["sti"] for b in skabelon["blade"]] != [b["sti"] for b in blade()]:
    fejl.append("nyt_vaerk_skabelon.json er ikke bygget af den nuværende byg_nyt_vaerk.py")

for g in (10.0, 50.0, 105.52, 300.0):
    bl = blade(g)
    params = [{"sti": b["sti"], "vaerdi_json": b["vaerdi_json"]} for b in bl]
    stier = [b["sti"] for b in bl]
    if len(set(stier)) != len(stier):
        fejl.append(f"G={g}: dublerede stier")
    case = afflad(params)
    # Rundtur gennem YAML og motorens flader
    rundtur = {p.sti: p.vaerdi_json for p in flad(yaml.safe_dump(case, allow_unicode=True, sort_keys=False))}
    for b in params:
        if b["sti"] not in rundtur or ligner_strengt(json.loads(rundtur[b["sti"]]), json.loads(b["vaerdi_json"])):
            fejl.append(f"G={g}: rundtur afviger for {b['sti']}")
    # Som en rigtig bestilling: 2-døgns vindue, stramt gab
    raekker = raekker_fra_vaerk(params, [], {"periode_start": "2026-01-05", "periode_slut": "2026-01-06",
                                             "med_balancering": False, "mip_rel_gap": 0.0002, "mip_abs_gap": 100.0})
    plan = byg(raekker, heat_csv_rod=REPO / "data")
    fd, tmp = tempfile.mkstemp(suffix=".yaml")
    os.close(fd)
    Path(tmp).write_text(plan.case_yaml, encoding="utf-8")
    try:
        cfg = load_case(tmp)
        assert cfg.time.resolution == "1h"
        assert [n for n, u in cfg.units.items() if u.enabled] == ["gaskedel"]
        assert cfg.storage == {}
        cfg.prices.fuel_price("natural_gas")
        print(f"  G={g:>6g} GWh: {len(bl)} blade, load_case OK, gaskedel {cfg.units['gaskedel'].p_max_heat:g} MW, "
              f"gaf {plan.case['heat_load_params']['gaf_mw_per_k']}, argv {' '.join(plan.cli)}")
    except Exception as e:  # noqa: BLE001
        fejl.append(f"G={g}: {type(e).__name__}: {e}")
    finally:
        os.remove(tmp)

if "--koer" in sys.argv:
    df = PRODUKT / "fabric" / "_lokal" / "df-data"
    dfsha = next((p for p in df.iterdir() if (p / ".git").exists()), None) if df.exists() else None
    if dfsha is None:
        fejl.append("ingen df-data i fabric/_lokal/df-data")
    else:
        bl = blade(50.0)
        params = [{"sti": b["sti"], "vaerdi_json": b["vaerdi_json"]} for b in bl]
        plan = byg(raekker_fra_vaerk(params, [], {"periode_start": "2026-01-05", "periode_slut": "2026-01-06",
                                                  "med_balancering": False, "mip_rel_gap": 0.0002, "mip_abs_gap": 100.0}),
                   heat_csv_rod=REPO / "data")
        ud = Path(tempfile.mkdtemp(prefix="nyt_vaerk_"))
        casefil = ud / "case.yaml"
        casefil.write_text(plan.case_yaml, encoding="utf-8")
        argv = [sys.executable, "-B", "run_case.py", str(casefil), *plan.cli, "--df-data-cache", str(dfsha), "--out-dir", str(ud)]
        r = subprocess.run(argv, cwd=REPO, capture_output=True, text=True, encoding="utf-8",
                           env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        log = r.stdout + r.stderr
        (ud / "log.txt").write_text(log, encoding="utf-8")
        man = next(ud.glob("*_manifest.json"), None)
        if r.returncode != 0 or man is None:
            fejl.append(f"run_case fejlede (exit {r.returncode}); log: {ud / 'log.txt'}")
        else:
            m = json.loads(man.read_text(encoding="utf-8"))
            n = m["noegletal"]
            if m["sporbarhed"]["solve_status"] != "optimal":
                fejl.append(f"status {m['sporbarhed']['solve_status']}")
            if abs(n["samlet_produktion_mwh"] - n["varmeefterspoergsel_mwh"]) > 0.01:
                fejl.append("produktion ≠ varmebehov")
            print(f"  Kørsel G=50, 5.–6. jan 2026: status {m['sporbarhed']['solve_status']}, objektiv "
                  f"{n['objektiv_dkk']:,.0f} kr., varmebehov {n['varmeefterspoergsel_mwh']:,.1f} MWh, "
                  f"gaskedel {m['enheder'][0]['produktion_mwh']:,.1f} MWh, CO2 {n['co2_ton']} t, uddata {ud}")

print(f"\n{len(fejl)} fejl")
for f in fejl:
    print("  FEJL", f)
sys.exit(1 if fejl else 0)
