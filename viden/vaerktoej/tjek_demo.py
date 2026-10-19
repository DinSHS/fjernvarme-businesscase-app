"""Validerer viden/demo_scenarier.json mod værkerne og motorens egen byggevej.

For hver kørsel:
  1. værket flades fra modelrepoets casefil ved PIN med motorens fjv.flad.flad
     (samme blade som VaerkParameter efter import),
  2. ændringer + scenariefelter bygges til KoerselInput med
     fjv.byg_case.raekker_fra_vaerk (samme som notebookens manuelle vej og
     appens bygFrossetInput),
  3. fjv.byg_case.byg laver den effektive case.yaml og argv — her afvises
     ukendte stier, dubletter, ugyldig periode/gab og heat_csv uden for data/,
  4. modellens egen src.config.load_case indlæser case.yaml (al validering i
     __post_init__), og periode/CLI kontrolleres.
For hvert par: samme værk, periode, gab og heat_csv; med_balancering må kun
afvige, når knappen er balancemarkedets_vaerdi.

Kør med fv-fabric's venv (pinnede pakker):
    fjernvarme_fabric/fabric/_lokal/.venv/Scripts/python.exe viden/vaerktoej/tjek_demo.py
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

sys.path.insert(0, str(PRODUKT / "fabric"))
from fjv.byg_case import byg, raekker_fra_vaerk  # noqa: E402
from fjv.flad import flad  # noqa: E402

if subprocess.run(["git", "-C", str(REPO), "diff", "--quiet", PIN, "--", "src"]).returncode:
    raise SystemExit(f"src/ i {REPO} afviger fra {PIN[:7]}")
sys.path.insert(0, str(REPO))
from src.config import load_case  # noqa: E402


def git(*a: str) -> str:
    return subprocess.check_output(["git", "-C", str(REPO), *a], text=True, encoding="utf-8")


demo = json.loads((VIDEN / "demo_scenarier.json").read_text(encoding="utf-8"))
knapper = {k["id"] for k in json.loads((VIDEN / "knapper.json").read_text(encoding="utf-8"))["knapper"]}
fejl: list[str] = []

casefiler = {Path(f).stem.lower(): f for f in git("ls-tree", "--name-only", PIN, "cases/").splitlines()
             if f.endswith(".yaml") and not Path(f).name.startswith("heat_load_params")}
data_dir = Path(tempfile.mkdtemp())
for f in git("ls-tree", "--name-only", PIN, "data/").splitlines():
    (data_dir / Path(f).name).write_bytes(
        subprocess.check_output(["git", "-C", str(REPO), "show", f"{PIN}:{f}"]))

koersler = {k["id"]: k for k in demo["koersler"]}
if len(koersler) != len(demo["koersler"]):
    fejl.append("dublerede kørsels-id'er")
raekkefoelger = sorted(k["koer_raekkefoelge"] for k in demo["koersler"])
if raekkefoelger != list(range(1, len(raekkefoelger) + 1)):
    fejl.append(f"koer_raekkefoelge er ikke 1..n: {raekkefoelger}")

for k in demo["koersler"]:
    kid = k["id"]
    kode = k["vaerk_kode"]
    if kode not in casefiler:
        fejl.append(f"{kid}: ukendt værk {kode!r} (kendte: {sorted(casefiler)})")
        continue
    try:
        params = flad(git("show", f"{PIN}:{casefiler[kode]}"))
        raekker = raekker_fra_vaerk(params, k["aendringer"], k["scenarie"])
        plan = byg(raekker, heat_csv_rod=data_dir)
        fd, tmp = tempfile.mkstemp(suffix=".yaml")
        os.close(fd)
        Path(tmp).write_text(plan.case_yaml, encoding="utf-8")
        try:
            cfg = load_case(tmp)
        finally:
            os.remove(tmp)
        # Ændringerne skal faktisk være i den byggede case.
        for a in k["aendringer"]:
            if a["type"] == "set":
                v = plan.case
                for d in a["sti"].split("."):
                    v = v[d]
                if v != json.loads(a["vaerdi_json"]):
                    fejl.append(f"{kid}: {a['sti']} = {v!r} i case, forventet {a['vaerdi_json']}")
            else:
                sek = "units" if a["sti"] in plan.case.get("units", {}) else "storage"
                obj = (cfg.units if sek == "units" else cfg.storage)[a["sti"]]
                if obj.enabled != (a["type"] == "enable"):
                    fejl.append(f"{kid}: {a['sti']}.enabled er {obj.enabled} efter {a['type']}")
        sc = k["scenarie"]
        # KONTRAKT v2.2 §6c: kun 1h, og ingen set på time.*/solver.*.
        if cfg.time.resolution != "1h":
            fejl.append(f"{kid}: opløsning {cfg.time.resolution!r} - version 1 kører kun 1h")
        for a in k["aendringer"]:
            if a["type"] == "set" and a["sti"].startswith(("time.", "solver.")):
                fejl.append(f"{kid}: set på {a['sti']} afvises (KONTRAKT §6c)")
        if sc.get("mip_rel_gap") is not None and cfg.solver.mip_rel_gap != sc["mip_rel_gap"]:
            fejl.append(f"{kid}: mip_rel_gap {cfg.solver.mip_rel_gap} != {sc['mip_rel_gap']}")
        if sc.get("mip_abs_gap") is not None and cfg.solver.mip_abs_gap != sc["mip_abs_gap"]:
            fejl.append(f"{kid}: mip_abs_gap {cfg.solver.mip_abs_gap} != {sc['mip_abs_gap']}")
        if sc.get("tidsgraense_s") is not None and cfg.solver.time_limit != sc["tidsgraense_s"]:
            fejl.append(f"{kid}: time_limit {cfg.solver.time_limit} != {sc['tidsgraense_s']}")
        if ("--with-balancing" in plan.cli) != bool(sc["med_balancering"]):
            fejl.append(f"{kid}: --with-balancing i argv passer ikke med med_balancering")
        if sc.get("periode_start") and plan.cli[plan.cli.index("--start") + 1] != sc["periode_start"]:
            fejl.append(f"{kid}: --start i argv passer ikke")
        if sc.get("heat_csv") and f"data/{sc['heat_csv']}" not in " ".join(plan.cli).replace("\\", "/"):
            fejl.append(f"{kid}: heat_csv mangler i argv: {plan.cli}")
        print(f"  {kid} {kode:14s} OK  argv: {' '.join(plan.cli)}")
    except Exception as e:  # noqa: BLE001
        fejl.append(f"{kid}: {type(e).__name__}: {e}")

FELTER = ("periode_start", "periode_slut", "mip_rel_gap", "mip_abs_gap", "tidsgraense_s", "heat_csv",
          "balancing_method", "ekstra_flag")
for p in demo["par"]:
    r, s = koersler.get(p["reference"]), koersler.get(p["scenarie"])
    if r is None or s is None:
        fejl.append(f"{p['id']}: ukendt kørsel")
        continue
    if p.get("knap") not in knapper:
        fejl.append(f"{p['id']}: knappen {p.get('knap')!r} findes ikke i knapper.json")
    if r["vaerk_kode"] != s["vaerk_kode"]:
        fejl.append(f"{p['id']}: forskellige værker")
    for f in FELTER:
        if r["scenarie"].get(f) != s["scenarie"].get(f):
            fejl.append(f"{p['id']}: {f} afviger ({r['scenarie'].get(f)!r} / {s['scenarie'].get(f)!r})")
    if r["scenarie"]["med_balancering"] != s["scenarie"]["med_balancering"] \
            and p["knap"] != "balancemarkedets_vaerdi":
        fejl.append(f"{p['id']}: med_balancering afviger, men knappen er {p['knap']}")
    if p["knap"] == "balancemarkedets_vaerdi" and \
            r["scenarie"]["med_balancering"] == s["scenarie"]["med_balancering"]:
        fejl.append(f"{p['id']}: balanceknap uden forskel i med_balancering")
brugt = {p[x] for p in demo["par"] for x in ("reference", "scenarie")}
for kid in sorted(set(koersler) - brugt):
    fejl.append(f"{kid}: indgår i intet par")

print(f"\n{len(koersler)} kørsler, {len(demo['par'])} par, {len(fejl)} fejl")
for f in fejl:
    print("  FEJL", f)
sys.exit(1 if fejl else 0)
