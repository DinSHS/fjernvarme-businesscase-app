"""Trofasthedstesten (runde 8, fv-trofast): følger appen modelrepoets data og antagelser ved den pinnede commit?

Modelrepoet er sandheden. Testen fejler, hvis en modelopdatering ændrer en antagelse, appen bruger — i stedet for at
lade den glide igennem:

  [1] pins       viden/modelspejl.json, konstanter.py og hver viden/*.json's model_commit er den samme commit.
  [2] spejl      modelspejl.json, app/src/lib/modelspejl.data.ts og skalering.vektorer.json er præcis, hvad modelrepoet
                 giver ved commit'en (cases som blade, kørselskommandoer læst STRENGT, kodens standarder, solver, vinduer,
                 requirements, HELE skaleringsreglen med kildetekst, og orakelvektorer fra modellens egne linjer).
  [3] ordre      for HVER case i cases/*.yaml: appens bestillingsvej (flad -> raekker_fra_vaerk -> byg) med
                 modelrepoets egen kommando for casen giver casen typestrengt uændret og PRÆCIS kommandoens flag; og
                 standardkommandoen har intet, appens standardkørsel ikke sætter (K8 F5).
  [4] katalog    feltkatalogets standardværdier = kodens (navn, værdi, fil, ±15 linjer).
  [5] typer      enhedstypernes standardværdier = src/config.py's.
  [6] reference  referencetal.json's README-gruppe = README's tabel (kommando, objektiv, flag) og casens gab.
  [7] vinduer    knapper.json's faste vinduer = README's vinter-/sommervindue og Andebys tidsblok.
  [8] nyt værk   skabelonens Andeby-blade = cases/andeby.yaml; varmelasten = modelrepoets skalering.
  [9] pakker     PINNEDE_PAKKER og community/pyproject.toml (TOML; [model] skal findes) dækker requirements.txt.
 [10] tidsserier repoets varmelastfiler pr. case = filerne i modelrepoets kommandoer for casen.
 [11] kilder     ingen kildehenvisning til en fil, der ikke findes ("udviklingsrapport").

Kør:  python viden/vaerktoej/tjek_trofasthed.py      (exit 1 ved første kategori med fejl; alle meldes)
Kræver PyYAML og modelrepoet ved commit'en (søstermappe ../fjernvarme-businesscase, FJV_MODELREPO eller
FJV_MODELMAPPE). Uden modelrepoet fejler [2], [3] og [10] — medmindre FJV_TROFAST_UDEN_MODELREPO=1, som springer
dem eksplicit over (og siger det).
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
HER = Path(__file__).resolve().parent
VIDEN = HER.parent
ROD = VIDEN.parent
sys.path.insert(0, str(HER))
sys.path.insert(0, str(ROD / "fabric"))

import yaml  # noqa: E402

import byg_modelspejl as BM  # noqa: E402
from fjv import konstanter as K  # noqa: E402
from fjv import modelkoersel as MK  # noqa: E402
from fjv import tidsserie_db as TDB  # noqa: E402
from fjv.byg_case import byg, raekker_fra_vaerk  # noqa: E402
from fjv.flad import flad, ligner_strengt  # noqa: E402

fejl: dict[str, list[str]] = {}
sprunget: list[str] = []


def meld(kat: str, tekst: str) -> None:
    fejl.setdefault(kat, []).append(tekst)


def ens(a, b) -> bool:
    if isinstance(a, bool) or isinstance(b, bool) or a is None or b is None:
        return a is b or a == b and type(a) is type(b)
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return float(a) == float(b)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(ens(x, y) for x, y in zip(a, b))
    return a == b


SPEJL = json.loads((VIDEN / "modelspejl.json").read_text(encoding="utf-8"))
CASES = SPEJL["cases"]
kilde = BM.Kilde.find()
uden = os.environ.get("FJV_TROFAST_UDEN_MODELREPO") == "1"
if kilde is None and not uden:
    meld("modelrepo", f"modelrepoet ved {K.MODEL_COMMIT[:7]} findes ikke (søstermappe, FJV_MODELREPO eller "
                      "FJV_MODELMAPPE) - [2], [3] og [10] kan ikke tjekkes")
elif kilde is None:
    sprunget.append("[2] spejl, [3] ordre, [10] tidsserier (FJV_TROFAST_UDEN_MODELREPO=1)")

# --- [1] pins ---------------------------------------------------------------------------------------------
if SPEJL["model_commit"] != K.MODEL_COMMIT:
    meld("pins", f"modelspejl.json er bygget ved {SPEJL['model_commit'][:7]}, appen er pinnet på {K.MODEL_COMMIT[:7]} "
                 "- kør byg_modelspejl.py og gennemgå forskellene")
if SPEJL["data_commit"] != K.DF_DATA_SHA:
    meld("pins", f"modelspejl.json har df-data {SPEJL['data_commit'][:7]}, konstanter.py {K.DF_DATA_SHA[:7]}")
for p in sorted(VIDEN.glob("*.json")):
    d = json.loads(p.read_text(encoding="utf-8"))
    if isinstance(d, dict) and "model_commit" in d and d["model_commit"] != K.MODEL_COMMIT:
        meld("pins", f"viden/{p.name}: model_commit {str(d['model_commit'])[:7]} ≠ {K.MODEL_COMMIT[:7]}")
print(f"[1] pins: {K.MODEL_COMMIT[:7]} / df-data {K.DF_DATA_SHA[:7]}, {len(fejl.get('pins', []))} fejl")

# --- [2] spejlet er modelrepoet -----------------------------------------------------------------------------
tekster: dict[str, str] = {}
if kilde is not None:
    try:
        ny = BM.byg(kilde)
    except SystemExit as e:          # BM.RegelFejl: reglen eller en kommando kan ikke længere læses (K8 F4/F5)
        meld("spejl", f"modelspejlet kan ikke bygges fra modelrepoet ({kilde.beskriv()}): {e}")
        ny = None
    if ny is not None and BM.tekst_af(ny) != (VIDEN / "modelspejl.json").read_text(encoding="utf-8"):
        aendret = sorted(k for k in set(ny) | set(SPEJL) if ny.get(k) != SPEJL.get(k))
        cases = sorted(k for k in set(ny["cases"]) | set(CASES) if ny["cases"].get(k) != CASES.get(k))
        meld("spejl", f"modelspejl.json er ikke, hvad modelrepoet giver ({kilde.beskriv()}): {', '.join(aendret)}"
                      + (f"; cases: {', '.join(cases)}" if cases else "") + " - kør byg_modelspejl.py og gennemgå")
    if ny is not None and BM.ts_af(ny) != (BM.UD_TS.read_text(encoding="utf-8") if BM.UD_TS.exists() else ""):
        meld("spejl", "app/src/lib/modelspejl.data.ts er ikke genereret fra modelspejlet - kør byg_modelspejl.py")
    try:
        if BM.vektorer_af(kilde) != (BM.UD_VEK.read_text(encoding="utf-8") if BM.UD_VEK.exists() else ""):
            meld("spejl", "skalering.vektorer.json er ikke modelrepoets egne skaleringslinjer udført for G - kør byg_modelspejl.py")
    except SystemExit as e:
        meld("spejl", f"varmelast_skalering: {e}")
    for kode, c in CASES.items():
        tekster[kode] = kilde.tekst(c["fil"])
    print(f"[2] spejl: {len(CASES)} cases, {sum(len(c['blade']) for c in CASES.values())} blade mod {kilde.beskriv()}, "
          f"{len(fejl.get('spejl', []))} fejl")

# --- [3] appens bestillingsvej giver modelrepoets kørsel ------------------------------------------------------
for kode, tekst in tekster.items():
    c = CASES[kode]
    st = c["standard"]
    # K8 F5: hele kommandoens betydning. (a) Appens STANDARDKØRSEL sætter kun balancemarked og varmelast — alt
    # andet i modelrepoets standardkommando ville blive tabt og er en fejl. (b) Bestillingsvejen med alt det, appen
    # kan udtrykke, skal give præcis kommandoens flag (uden betydningsløse som --out-dir).
    for x in MK.ikke_oversat(st):
        meld("ordre", f"{c['fil']}: modelrepoets standardkommando ({st['kilde']}) har {x}, som appens standardkørsel "
                      "ikke sætter - tabt flag")
    scen = {"med_balancering": bool(st and st["med_balancering"]), "heat_csv": (st or {}).get("heat_csv")}
    if st:
        if st.get("start") or st.get("slut"):
            scen.update(periode_start=st.get("start"), periode_slut=st.get("slut"))
        if st.get("balancing_method"):
            scen["balancing_method"] = st["balancing_method"]
        if any(x == "--legacy-nettab" for x in st.get("ekstra") or []):
            scen["ekstra_flag"] = "--legacy-nettab"
    try:
        plan = byg(raekker_fra_vaerk(flad(tekst), [], scen))
    except Exception as e:  # noqa: BLE001
        meld("ordre", f"{c['fil']}: appens bestilling kan ikke bygges: {type(e).__name__}: {e}")
        continue
    forskel = ligner_strengt(yaml.safe_load(tekst), plan.case)
    if forskel:
        meld("ordre", f"{c['fil']}: casen ændres på vejen gennem appen: {forskel}")
    if ("--with-balancing" in plan.cli) != scen["med_balancering"]:
        meld("ordre", f"{c['fil']}: --with-balancing {('mangler' if scen['med_balancering'] else 'står')} i appens argv")
    heat = plan.cli[plan.cli.index("--heat-csv") + 1] if "--heat-csv" in plan.cli else None
    if heat != (f"data/{scen['heat_csv']}" if scen["heat_csv"] else None):
        meld("ordre", f"{c['fil']}: --heat-csv {heat} ≠ modelrepoets {scen['heat_csv']}")
    if st:
        tab = SPEJL.get("run_case_flag") or {}
        par = lambda argv: sorted(tuple(x) for x in MK._flag(argv, "app", tab)["flag"] if x[0] not in MK.UDEN_BETYDNING)  # noqa: E731
        forventet = sorted(tuple(x) for x in st["flag"] if x[0] not in MK.UDEN_BETYDNING)
        faktisk = par(plan.cli)
        if forventet != faktisk:
            meld("ordre", f"{c['fil']}: appens argv {faktisk} ≠ modelrepoets kommando {forventet} ({st['kilde']})")
if tekster:
    print(f"[3] ordre: {len(tekster)} cases gennem flad -> raekker_fra_vaerk -> byg med modelrepoets kommando, "
          f"{len(fejl.get('ordre', []))} fejl")

# --- [4] feltkatalogets standarder ---------------------------------------------------------------------------
STD = SPEJL["standarder"]
katalog = json.loads((VIDEN / "felt_katalog.json").read_text(encoding="utf-8"))
n4 = 0
for f in katalog["felter"]:
    if "standard" not in f:
        continue
    n4 += 1
    fil, linje = f["kilde"].rsplit(":", 1)
    navn = f["sti"].split(".")[-1]
    kandidater = [s for s in STD if s["navn"] == navn and s["kilde"].split(":")[0] == fil]
    if not any(ens(s["vaerdi"], f["standard"]) and abs(int(s["kilde"].split(":")[1]) - int(linje)) <= 15 for s in kandidater):
        meld("katalog", f"{f['sti']}: standard {f['standard']!r} (kilde {f['kilde']}) - koden har "
                        + (", ".join(f"{s['vaerdi']!r} ({s['kilde']})" for s in kandidater) or "ingen standard med det navn i filen"))
print(f"[4] katalog: {n4} standardværdier, {len(fejl.get('katalog', []))} fejl")

# --- [5] enhedstypernes standarder ---------------------------------------------------------------------------
typer = json.loads((VIDEN / "enhedstyper.json").read_text(encoding="utf-8"))
n5 = 0
for navn, v in typer["standardvaerdier"].items():
    if isinstance(v, dict):
        continue
    n5 += 1
    if not any(s["navn"] == navn and s["kilde"].startswith("src/config.py:") and ens(s["vaerdi"], v) for s in STD):
        meld("typer", f"enhedstyper.standardvaerdier.{navn} = {v!r} er ikke en standard i src/config.py")
print(f"[5] typer: {n5} standardværdier, {len(fejl.get('typer', []))} fejl")

# --- [6] referencetal = README ----------------------------------------------------------------------------
ref = json.loads((VIDEN / "referencetal.json").read_text(encoding="utf-8"))
readme_kmd = {k["kommando"]: (kode, k) for kode, c in CASES.items() for k in c["kommandoer"] if k["kilde"].startswith("README.md")}
n6 = 0
for g in ref["grupper"]:
    if g["id"] != "readme":
        continue
    for r in g["referencer"]:
        n6 += 1
        hit = readme_kmd.get(r["kommando"])
        if not hit:
            meld("reference", f"{r['id']}: kommandoen står ikke i README's tabel: {r['kommando']}")
            continue
        kode, k = hit
        if r["vaerk"]["kode"] != kode:
            meld("reference", f"{r['id']}: værk {r['vaerk']['kode']} ≠ {kode}")
        if r["forventet"]["objektiv_dkk"] != k.get("objektiv_dkk"):
            meld("reference", f"{r['id']}: objektiv {r['forventet']['objektiv_dkk']} ≠ README's {k.get('objektiv_dkk')} ({k['kilde']})")
        if r["scenarie"]["med_balancering"] != k["med_balancering"] or (r["scenarie"]["heat_csv"] or None) != k["heat_csv"]:
            meld("reference", f"{r['id']}: scenariets balancering/varmelast passer ikke med {k['kilde']}")
        b = CASES[kode]["blade"]
        for felt, sti, std in (("mip_rel_gap", "solver.mip_rel_gap", "mip_rel_gap"), ("mip_abs_gap", "solver.mip_abs_gap", "mip_abs_gap"),
                               ("time_limit_s", "solver.time_limit", "time_limit")):
            forventet = json.loads(b[sti][0]) if sti in b else SPEJL["solver"][std]["vaerdi"]
            if not ens(float(r["case_gab"][felt]), float(forventet)):
                meld("reference", f"{r['id']}: case_gab.{felt} {r['case_gab'][felt]} ≠ {forventet} ({'casen' if sti in b else 'koden'})")
print(f"[6] reference: {n6} README-referencer, {len(fejl.get('reference', []))} fejl")

# --- [7] faste vinduer ----------------------------------------------------------------------------------------
knapper = json.loads((VIDEN / "knapper.json").read_text(encoding="utf-8"))
V = SPEJL["vinduer"]
ab = CASES["andeby"]["blade"]
forventede = {"Vinter": (V["vintervinduet"]["start"], V["vintervinduet"]["slut"]),
              "Sommer": (V["sommervinduet"]["start"], V["sommervinduet"]["slut"]),
              "Rullende": (json.loads(ab["time.start"][0])[:10], json.loads(ab["time.end"][0])[:10])}
for v in knapper["faste_vinduer"]:
    nøgle = next((k for k in forventede if v["navn"].startswith(k)), None)
    if nøgle is None:
        meld("vinduer", f"{v['navn']}: intet tilsvarende vindue i modelrepoet")
    elif (v["periode_start"], v["periode_slut"]) != forventede[nøgle]:
        meld("vinduer", f"{v['navn']}: {v['periode_start']}..{v['periode_slut']} ≠ modelrepoets {forventede[nøgle]}")
print(f"[7] vinduer: {len(knapper['faste_vinduer'])} vinduer, {len(fejl.get('vinduer', []))} fejl")

# --- [8] nyt værk ---------------------------------------------------------------------------------------------
nyt = json.loads((VIDEN / "nyt_vaerk_skabelon.json").read_text(encoding="utf-8"))
S = SPEJL["varmelast_skalering"]
pr_linje: dict[int, list] = {}
for _sti, (_v, _ln) in ab.items():
    pr_linje.setdefault(_ln, []).append((_sti, _v))
sk = nyt["skalering"]
for felt in ("divisor_gwh", "afrunding", "profil_afrunding", "betingelse", "ellers", "decimaler"):
    if felt not in sk or not ens(sk[felt], S[felt]):
        meld("nyt", f"skalering.{felt} {sk[felt]} ≠ modelrepoets {S[felt]} ({S['kilde']})")
for sti, v in sk["grundtal"].items():
    if not ens(v, S[sti.split(".")[-1]]):
        meld("nyt", f"skalering.grundtal.{sti} ≠ modelrepoets ({S['kilde_grundtal']})")
G = float(nyt["standard_varmebehov_gwh"])
# Hele reglen fra spejlet (K8 F4): betingelse, else-værdi, divisor og decimaler pr. nøgle.
_b = S["betingelse"]
f = round(G / S["divisor_gwh"], S["afrunding"]) if (G > _b["graense"] if _b["op"] == ">" else G >= _b["graense"]) else S["ellers"]
_d = S["decimaler"]
skaleret = {"heat_load_params.gaf_mw_per_k": round(S["gaf_mw_per_k"] * f, _d["heat_load_params.gaf_mw_per_k"]),
            "heat_load_params.nettab_slope_mw_per_k": round(S["nettab_slope_mw_per_k"] * f, _d["heat_load_params.nettab_slope_mw_per_k"]),
            "heat_load_params.baseline_profile_mw": [round(x * f, _d["heat_load_params.baseline_profile_mw"]) for x in S["baseline_profile_mw"]]}
for _k, _v in S["faste"].items():          # de uskalerede tal: guiden og værksarket skal give det samme
    _b2 = next((b for b in nyt["blade"] if b["sti"] == f"heat_load_params.{_k}"), None)
    if _b2 is None or not ens(json.loads(_b2["vaerdi_json"]), _v):
        meld("nyt", f"heat_load_params.{_k}: skabelonen har {_b2 and _b2['vaerdi_json']}, værksarkets regel {_v} ({S['kilde_grundtal']})")
n8 = 0
for b in nyt["blade"]:
    k = b.get("kilde") or ""
    v = json.loads(b["vaerdi_json"])
    if b["sti"] in skaleret:
        n8 += 1
        if not ens(v, skaleret[b["sti"]]):
            meld("nyt", f"{b['sti']} = {v} ≠ modelrepoets skalering for {G:g} GWh: {skaleret[b['sti']]}")
    m = re.match(r"Andeby, cases/andeby\.yaml:(\d+) @ (\w+)$", k)
    if m:
        n8 += 1
        # En inline-mapping ({00-06: lav, 06-21: spids}) har flere blade på samme linje: match også nøglen.
        paa = pr_linje.get(int(m.group(1)), [])
        sti_a, v_a = next(((x, y) for x, y in paa if x.split(".")[-1] == b["sti"].split(".")[-1]), (None, None))
        if v_a is None or not ens(v, json.loads(v_a)) or m.group(2) != K.MODEL_COMMIT[:7]:
            meld("nyt", f"{b['sti']} = {v!r} (kilde {k}) - Andeby har {v_a} på {sti_a}")
    elif not (k.startswith("egen antagelse") or b["sti"] in skaleret or k == ""):
        meld("nyt", f"{b['sti']}: ukendt kildeform {k!r}")
print(f"[8] nyt værk: {n8} blade fra modelrepoet, {sum(1 for b in nyt['blade'] if (b.get('kilde') or '').startswith('egen antagelse'))} "
      f"egne antagelser, {len(fejl.get('nyt', []))} fejl")

# --- [9] pakker -------------------------------------------------------------------------------------------------
krav = SPEJL["krav"]
for navn, ver in K.PINNEDE_PAKKER.items():
    if krav.get(navn.lower()) != f"=={ver}":
        meld("pakker", f"PINNEDE_PAKKER[{navn}] = {ver}, requirements.txt: {krav.get(navn.lower())}")
# K8 F7: pyproject.toml læses strukturelt; sektionen SKAL findes, og modelrepoets krav skal være dækket — enten i
# [model] eller (de dokumenterede undtagelser) i hovedafhængighederne / bevidst udeladt. "Intet at kontrollere" er en fejl.
import tomllib  # noqa: E402
UNDTAGELSER = {"pytest": "kun modelrepoets egne tests; appen kører dem ikke",
               "pyyaml": "står i hovedafhængighederne (dependencies)",
               "openpyxl": "står i hovedafhængighederne (dependencies)"}
try:
    _proj = tomllib.loads((ROD / "community" / "pyproject.toml").read_text(encoding="utf-8"))["project"]
except Exception as e:  # noqa: BLE001
    _proj = {}
    meld("pakker", f"community/pyproject.toml kan ikke læses: {type(e).__name__}: {e}")
def _krav_af(liste):
    ud = {}
    for linje in liste or []:
        m = re.match(r"([A-Za-z0-9_.\-]+)\s*(.*)$", linje)
        ud[m.group(1).lower()] = m.group(2).strip()
    return ud
_model = (_proj.get("optional-dependencies") or {}).get("model")
if not _model:
    meld("pakker", "community/pyproject.toml: [project.optional-dependencies] model mangler eller er tom - intet at kontrollere er en fejl")
_m, _hoved = _krav_af(_model), _krav_af(_proj.get("dependencies"))
for navn, spec in krav.items():
    if navn in _m:
        if _m[navn] != spec:
            meld("pakker", f"community [model] {navn}{_m[navn]} ≠ requirements.txt {navn}{spec}")
    elif navn in UNDTAGELSER:
        if UNDTAGELSER[navn].startswith("står i hoved") and _hoved.get(navn) != spec:
            meld("pakker", f"community dependencies {navn}{_hoved.get(navn)} ≠ requirements.txt {navn}{spec}")
    elif _model:
        meld("pakker", f"community [model] mangler {navn}{spec} fra requirements.txt")
for navn in _m:
    if navn not in krav:
        meld("pakker", f"community [model] har {navn}, som requirements.txt ikke har")
print(f"[9] pakker: {len(K.PINNEDE_PAKKER)} pins + community [model], {len(fejl.get('pakker', []))} fejl")

# --- [10] repoets tidsserier pr. case -----------------------------------------------------------------------
readme = kilde.tekst("README.md") if kilde else None
for kode, tekst in tekster.items():
    c = CASES[kode]
    filer = [x["fil"] for x in TDB.repo_tidsserier(tekst, flad(tekst), c["fil"].split("/")[-1], readme) if x["rolle"] == "varmelast"]
    forventet = MK.varmelastfiler(c["kommandoer"])
    if filer != forventet:
        meld("tidsserier", f"{c['fil']}: registrerer varmelast {filer}, modelrepoets kommandoer bruger {forventet}")
if tekster:
    print(f"[10] tidsserier: {len(tekster)} cases, {len(fejl.get('tidsserier', []))} fejl")

# --- [11] kilder, der ikke findes --------------------------------------------------------------------------------
n11 = 0
for p in list(VIDEN.rglob("*.json")) + list(VIDEN.rglob("*.md")) + list((ROD / "app" / "src").rglob("*.ts*")):
    if "__tests__" in p.parts or ".spec." in p.name or "node_modules" in p.parts or p.name == HER.name:
        continue
    n11 += 1
    if "udviklingsrapport" in p.read_text(encoding="utf-8", errors="replace"):
        meld("kilder", f"{p.relative_to(ROD).as_posix()}: henviser til 'udviklingsrapport', som ikke findes - skriv "
                       "'egen måling (dato, modelversion)' eller en fil i et af repoerne")
print(f"[11] kilder: {n11} filer, {len(fejl.get('kilder', []))} fejl")

# --------------------------------------------------------------------------------------------------------------
for s in sprunget:
    print(f"SPRUNGET (eksplicit): {s}")
if fejl:
    for kat, liste in fejl.items():
        for t in liste:
            print(f"FEJL [{kat}] {t}")
    print(f"TROFASTHED FEJLER: {sum(len(v) for v in fejl.values())} fejl i {', '.join(fejl)}")
    sys.exit(1)
print("TROFASTHED OK" + (" (delvis)" if sprunget else ""))
