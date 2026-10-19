#!/usr/bin/env python3
"""Port for fv-data's leverance (viden/data_krav.json, data_krav.md, app_tekster/information/data.md).

    python viden/vaerktoej/tjek_data_krav.py            # [1]-[6], stdlib + git
    python viden/vaerktoej/tjek_data_krav.py --model    # + [7] modellens egne læsere (kræver pandas/xarray:
                                                        #   fabric/_lokal/.venv)
    python viden/vaerktoej/tjek_data_krav.py --vaerksark  # + [8] værksark-kontrakten (kører scriptet, ~1 min)

  [1] data_krav.json parser, regelkoder unikke, alle felter til stede, alle koder i valider_tidsserie.py findes
  [2] Repoets egne fire datafiler validerer GYLDIGT med præcis de forventede fund
  [3] Hver regel med en fixture udløses af den og kun af de forventede fejl (en mutation pr. regel)
  [4] tal_tekst-testvektorerne + normaliseret fil = fabric/fjv/tidsserie.py's bytes for repofilerne
  [5] Alle fil:linje-henvisninger i data_krav.json/.md og data.md findes ved b49aeb0
  [6] tjek_koersel: dækning ved bestilling (huller, uden for serien, kapacitet)
  [7] modellens apply_heat_csv_override / _attach_unit_profiles læser den normaliserede fil
      BIT-identisk med originalen
  [8] vaerksark_til_yaml.py på skabelonvarianter giver de exitkoder, data_krav.json siger
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
sys.dont_write_bytecode = True
HER = Path(__file__).resolve().parent
VIDEN = HER.parent
PRODUKT = VIDEN.parent
REPO = Path(os.environ.get("FJV_MODELREPO", PRODUKT.parent / "fjernvarme-businesscase"))
PIN = "b49aeb0af097be42938b80a0fea6acdd77162836"
sys.path.insert(0, str(HER))
import valider_tidsserie as V  # noqa: E402

fejl: list[str] = []


def meld(t: str) -> None:
    fejl.append(t)
    print("  FEJL:", t)


def git(*a: str) -> str:
    return subprocess.run(["git", "-C", str(REPO), *a], capture_output=True, text=True,
                          encoding="utf-8", check=True).stdout


def repo_fil(sti: str) -> bytes:
    return subprocess.run(["git", "-C", str(REPO), "show", f"{PIN}:{sti}"],
                          capture_output=True, check=True).stdout


K = json.loads((VIDEN / "data_krav.json").read_text(encoding="utf-8"))
REGLER = {r["kode"]: r for r in K["tidsserier"]["regler"]}

# ------------------------------------------------------------------ [1]
for felt in ("datakilder", "datasaet_pr_indstilling", "maalt_daekning", "tidsserier", "vaerksark", "data_i_koersel"):
    if felt not in K:
        meld(f"[1] data_krav.json mangler {felt}")
for r in K["tidsserier"]["regler"]:
    for f in ("kode", "niveau", "hvornaar", "roller", "hvad", "besked", "hvorfor"):
        if f not in r:
            meld(f"[1] regel {r.get('kode')} mangler {f}")
    if r["niveau"] not in ("fejl", "advarsel", "info"):
        meld(f"[1] {r['kode']}: niveau {r['niveau']}")
kilde_v = (HER / "valider_tidsserie.py").read_text(encoding="utf-8")
brugte = set(re.findall(r'\bf(?:und)?\("([a-z_0-9]+)"', kilde_v))
for kode in sorted(brugte - set(REGLER)):
    meld(f"[1] valider_tidsserie.py bruger koden {kode}, som ikke står i data_krav.json")
print(f"[1] data_krav.json: {len(REGLER)} regler, {len(brugte)} brugt af oraklet")
# [1b] Niveauer, der er BESLUTNINGER (data_krav.md §2) - porten skal opdage, hvis de ændres
# uden at nogen har besluttet det. Konsistens alene kan ikke se det (oraklet følger JSON'en).
LAAST = {"dubletter": "fejl", "negativ": "fejl", "skaev_tid": "fejl", "urimelig_stor": "fejl",
         "sol_huller": "fejl", "huller": "advarsel", "over_kapacitet": "advarsel",
         "koersel_over_kapacitet": "fejl", "koersel_varmelast_daekning": "fejl",
         "koersel_varmelast_huller": "advarsel", "koersel_sol_daekning": "fejl",
         "timeslut_mistanke": "advarsel", "ligner_dansk_tid": "advarsel", "sol_nat": "advarsel"}
for kode, niv in LAAST.items():
    if REGLER.get(kode, {}).get("niveau") != niv:
        meld(f"[1b] {kode} skal være {niv} (beslutning i data_krav.md), er {REGLER.get(kode, {}).get('niveau')}")
G = K["tidsserier"]["graenser"]
if G["model_max_hulandel"] != 0.05:
    meld("[1b] model_max_hulandel skal være modellens 0,05 (src/data_loader.py:929)")
print(f"[1b] {len(LAAST)} besluttede niveauer + modellens 5 %-grænse")

# ------------------------------------------------------------------ [2] repofilerne
FORVENTET = {
    "data/billund_abvaerk_hourly.csv": ("varmelast", set()),
    # kolonnen kilde er tekst (maalt/dmi_syntese), så der er kun én talkolonne
    "data/billund_abvaerk_hourly_splejset_jun2026.csv": ("varmelast", set()),
    "data/solar_andeby_dmi_karup.csv": ("solprofil", set()),
    # Den syntetiske profil er forskudt ~1 time og har nattesol - begge fund er SANDE (data_krav.md).
    "data/synthetic_solar_andeby.csv": ("solprofil", {"sol_nat", "sol_tidsforskudt"}),
}
resultater = {}
for sti, (rolle, forv) in FORVENTET.items():
    r = V.valider(repo_fil(sti), rolle, k=K)
    resultater[sti] = r
    koder = set(V.Fund(K).koder()) | {f["kode"] for f in r.validering.get("fund", [])}
    if r.status != "gyldig":
        meld(f"[2] {sti}: {r.status} {r.validering.get('fejl')}")
    if koder != forv:
        meld(f"[2] {sti}: fund {sorted(koder)}, forventet {sorted(forv)}")
    print(f"[2] {sti}: {r.status}, {r.validering.get('antal_raekker')} rækker, sha256 {str(r.sha256)[:12]}, fund {sorted(koder)}")

# ------------------------------------------------------------------ [3] fixtures
UTC = timezone.utc


def serie(start: str, n: int, f, *, trin=timedelta(hours=1), fmt="%Y-%m-%d %H:%M:%S",
          hoved="timestamp,heat_mw_abvaerk", skille=",", spring=(), ekstra=()) -> str:
    t0 = datetime.fromisoformat(start)
    linjer = [hoved] if hoved else []
    for i in range(n):
        if i in spring:
            continue
        t = t0 + i * trin
        linjer.append(f"{t.strftime(fmt)}{skille}{f(i, t)}")
    linjer += list(ekstra)
    return "\n".join(linjer) + "\n"


def last(i, t):        # plausibel varmelast: døgnprofil og vinter
    return f"{12 + 4 * ((t.hour - 3) % 24 < 12) + (i % 7) * 0.1:.2f}"


def last_aar(i, t):    # helår med sæson: benyttelsestid ca. 4.900 timer
    import math
    v = 4 + 15 * (1 + math.cos(2 * math.pi * (t.timetuple().tm_yday - 20) / 365)) + ((t.hour - 3) % 24 < 12)
    return f"{v:.3f}"


def sol(i, t):
    h = t.hour
    return f"{max(0.0, 8 - abs(h - 11) * 1.5):.2f}"


AAR = 8760
VAERK = {"units": {"kedel": {"type": "gas_boiler", "p_max_heat": 15.0},
                   "sol": {"type": "solar_thermal", "p_max_heat": 10.0}},
         "storage": {"tank": {"p_max_discharge_mw": 2.0}}}
VAERK_2SOL = {"units": {"a": {"type": "solar_thermal", "p_max_heat": 5}, "b": {"type": "solar_thermal", "p_max_heat": 5}}}
VAERK_0SOL = {"units": {"kedel": {"type": "gas_boiler", "p_max_heat": 15.0}}}

FIX = [
    # (kode, rolle, tekst/bytes, kwargs) - tekst skal udløse koden
    ("rolle_ukendt", "el", serie("2026-01-01", 72, last), {}),
    ("tidszone_ukendt", "varmelast", serie("2026-01-01", 72, last), {"tidszone": "CET"}),
    ("tidsstempel_ukendt", "varmelast", serie("2026-01-01", 72, last), {"tidsstempel": "midt"}),
    ("enhed_ukendt", "varmelast", serie("2026-01-01", 72, last), {"enhed": "GJ"}),
    ("for_stor", "varmelast", serie("2020-01-01", 120_001, lambda i, t: "1", hoved=None), {}),
    ("kodning_cp1252", "varmelast", ("tidsstempel;varmeæ\n" + serie("2026-01-01", 72, lambda i, t: "12,5", hoved=None, skille=";")).encode("cp1252"), {}),
    ("tom", "varmelast", "timestamp,mw\n", {}),
    ("excel_serietal", "varmelast", "tid;mw\n" + "".join(f"{46023 + i / 24:.6f};12,5\n".replace(".", ",", 1) for i in range(72)), {}),
    ("ingen_tid", "varmelast", "a,b\nx,1\ny,2\n", {}),
    ("kolonne_findes_ikke", "varmelast", serie("2026-01-01", 72, last), {"kolonne": "mw2"}),
    ("ingen_vaerdi", "varmelast", serie("2026-01-01", 72, lambda i, t: "x", hoved="time,navn"), {}),
    ("flere_kolonner", "varmelast", serie("2026-01-01", 72, lambda i, t: f"{last(i, t)},3", hoved="time,mw,andet"), {}),
    ("hour_dk_som_utc", "varmelast", serie("2026-01-01", 72, last, hoved="hour_dk,mw"), {}),
    ("ugyldig_tid", "varmelast", serie("2026-01-01", 72, last, ekstra=["31-02-2026 00:00,5"]), {}),
    ("amerikansk_dato", "varmelast", serie("2026-01-01", 24 * 20, last, fmt="%m/%d/%Y %H:%M"), {}),
    ("ugyldigt_tal", "varmelast", serie("2026-01-01", 72, lambda i, t: "???" if i == 5 else last(i, t)), {}),
    ("ikke_endelig", "varmelast", serie("2026-01-01", 72, lambda i, t: "inf" if i == 5 else last(i, t)), {}),
    ("blandet_zone", "varmelast", serie("2026-01-01", 72, last, fmt="%Y-%m-%dT%H:%M:%S") .replace("T00:00:00,", "T00:00:00Z,"), {}),
    ("zone_i_fil", "varmelast", serie("2026-01-01", 72, last, fmt="%Y-%m-%dT%H:%M:%SZ"), {"tidszone": "Europe/Copenhagen"}),
    # 29. marts 2026: eksporten skriver kl. 02 i stedet for kl. 03 (i=27 er kl. 03 og udelades)
    ("dst_time_findes_ikke", "varmelast", serie("2026-03-28", 96, last, spring={27}), {"tidszone": "Europe/Copenhagen"}),
    ("alle_tomme", "varmelast", serie("2026-01-01", 4 * 72, last, trin=timedelta(minutes=15), spring=set(range(0, 4 * 72, 4))), {}),
    ("oploesning", "varmelast", serie("2026-01-01", 72, last, trin=timedelta(minutes=30)), {}),
    ("timeslut_mistanke", "varmelast", serie("2026-01-01 01:00", 31 * 24, last), {}),
    ("timestart_mistanke", "varmelast", serie("2026-01-01 00:00", 31 * 24, last), {"tidsstempel": "slut"}),
    # dansk tid uden forårets kl. 02 (29. marts 2026), erklæret som UTC
    ("ligner_dansk_tid", "varmelast", serie("2026-03-27", 96, last, spring={50}), {}),
    ("dst_dobbelttime_en_gang", "varmelast", serie("2025-10-24", 120, last), {"tidszone": "Europe/Copenhagen"}),
    ("skaev_tid", "varmelast", serie("2026-01-01", 72, last, ekstra=["2026-01-05 10:30:00,5"]), {}),
    ("dubletter", "varmelast", serie("2026-01-01", 72, last, ekstra=["2026-01-01 05:00:00,99"]), {}),
    ("kvarter_aggregeret", "varmelast", serie("2026-01-01", 4 * 72, last, trin=timedelta(minutes=15)), {}),
    ("delvise_timer", "varmelast", serie("2026-01-01", 4 * 72, last, trin=timedelta(minutes=15), spring={9}), {}),
    ("enhed_omregnet", "varmelast", serie("2026-01-01", 72, lambda i, t: "12000"), {"enhed": "kW"}),
    ("negativ", "varmelast", serie("2026-01-01", 72, lambda i, t: "-1" if i == 3 else last(i, t)), {}),
    ("alle_nul", "varmelast", serie("2026-01-01", 72, lambda i, t: "0"), {}),
    ("urimelig_stor", "varmelast", serie("2026-01-01", 72, lambda i, t: "12000"), {}),
    ("for_kort", "varmelast", serie("2026-01-01", 30, last), {}),
    ("kort_serie", "varmelast", serie("2026-01-01", 72, last), {}),
    ("huller", "varmelast", serie("2026-01-01", 72, last, spring={10, 11}), {}),
    ("langt_hul", "varmelast", serie("2026-01-01", 24 * 10, last, spring=set(range(30, 90))), {}),
    ("sol_huller", "solprofil", serie("2026-06-01", 24 * 10, sol, hoved="time,power_mw", spring=set(range(30, 50))), {}),
    ("sol_huller_udfyldt", "solprofil", serie("2026-06-01", 24 * 10, sol, hoved="time,power_mw", spring={35, 36}), {}),
    ("nul_straek", "varmelast", serie("2026-01-01", 24 * 5, lambda i, t: "0" if 20 <= i < 50 else last(i, t)), {}),
    ("fastfrosset", "varmelast", serie("2026-01-01", 24 * 5, lambda i, t: "13.37" if 20 <= i < 50 else last(i, t)), {}),
    ("spids", "varmelast", serie("2026-01-01", 24 * 5, lambda i, t: "90" if i == 60 else last(i, t)), {}),
    ("benyttelsestid", "varmelast", serie("2025-07-01", AAR, lambda i, t: "200" if i == 100 else last(i, t)), {}),
    ("sol_nat", "solprofil", serie("2026-06-01", 24 * 10, lambda i, t: "3" if t.hour == 0 else sol(i, t), hoved="time,power_mw"), {}),
    ("sol_tidsforskudt", "solprofil", serie("2026-06-01", 24 * 10, lambda i, t: sol(i, t - timedelta(hours=2)), hoved="time,power_mw"), {}),
    ("over_kapacitet", "varmelast", serie("2026-01-01", 72, lambda i, t: "40" if i == 7 else last(i, t)), {"vaerk": VAERK}),
    ("sol_ingen_enhed", "solprofil", serie("2026-06-01", 24 * 10, sol, hoved="time,power_mw"), {"vaerk": VAERK_0SOL}),
    ("sol_flere_enheder", "solprofil", serie("2026-06-01", 24 * 10, sol, hoved="time,power_mw"), {"vaerk": VAERK_2SOL}),
    ("sol_over_pmax", "solprofil", serie("2026-06-01", 24 * 10, lambda i, t: f"{float(sol(i, t)) * 2:.2f}", hoved="time,power_mw"), {"vaerk": VAERK}),
    ("sol_andel", "solprofil", serie("2026-06-01", 24 * 10, lambda i, t: f"{float(sol(i, t)) / 8:.4f}", hoved="time,power_mw"), {"vaerk": VAERK}),
    ("sol_benyttelsestid", "solprofil", serie("2025-01-01", AAR, sol, hoved="time,power_mw"), {"vaerk": VAERK}),
]
# Regler, der ikke har en upload-fixture, og hvorfor:
UDEN_FIXTURE = {
    "koersel_tidsserie_ikke_gyldig": "[6]", "koersel_varmelast_daekning": "[6]", "koersel_varmelast_huller": "[6]",
    "koersel_sol_daekning": "[6]", "koersel_huller_afkortet": "[6]", "koersel_over_kapacitet": "[6]",
    "koersel_sol_flere_enheder": "arbejderen (fabric/fjv/byg_case.py)", "koersel_df_data": "UI (maalt_daekning)",
    "maalt_mod_syntetisk": "fanen Tidsserier (kræver DMI)",
}
daekket = {f[0] for f in FIX} | set(UDEN_FIXTURE)
for kode in sorted(set(REGLER) - daekket):
    meld(f"[3] reglen {kode} har hverken fixture eller begrundelse")
n_ok = 0
for kode, rolle, tekst, kw in FIX:
    r = V.valider(tekst, rolle, k=K, **kw)
    koder = {f["kode"] for f in r.validering.get("fund", [])}
    if kode not in koder:
        meld(f"[3] {kode}: udløses ikke af sin fixture (fik {sorted(koder)}, status {r.status})")
        continue
    niv = REGLER[kode]["niveau"]
    if niv == "fejl" and r.status != "afvist":
        meld(f"[3] {kode}: er fejl, men serien blev {r.status}")
    elif niv != "fejl" and r.status != "gyldig":
        meld(f"[3] {kode}: er {niv}, men serien blev afvist: {r.validering.get('fejl')}")
    else:
        n_ok += 1
    # Fejl må kun komme fra den regel, fixturen tester (ingen følgefejl, der skjuler den).
    andre_fejl = {f["kode"] for f in r.validering.get("fund", []) if f["niveau"] == "fejl"} - {kode}
    if andre_fejl:
        meld(f"[3] {kode}: fixturen giver også fejlene {sorted(andre_fejl)}")
    besked = next(f["besked"] for f in r.validering["fund"] if f["kode"] == kode)
    if "{" in besked:
        meld(f"[3] {kode}: besked med uudfyldt pladsholder: {besked[:100]}")
# Rene fixtures må ikke give fund ud over de forventede.
VAERK_STOR = {"units": {"kedel": {"type": "gas_boiler", "p_max_heat": 40.0}}}
rene = [("varmelast", serie("2025-07-01", AAR, last_aar), {"vaerk": VAERK_STOR}, set()),
        ("solprofil", resultater["data/solar_andeby_dmi_karup.csv"].data, {"vaerk": {"units": {"sol": {"type": "solar_thermal", "p_max_heat": 22.0}}}}, set())]
for rolle, tekst, kw, forv in rene:
    r = V.valider(tekst, rolle, k=K, **kw)
    koder = {f["kode"] for f in r.validering.get("fund", [])}
    if r.status != "gyldig" or koder != forv:
        meld(f"[3] ren {rolle}: {r.status} {sorted(koder)}")
# Idempotens: den normaliserede fil, valideret igen, giver samme bytes.
for sti, r in resultater.items():
    r2 = V.valider(r.data, FORVENTET[sti][0], k=K)
    if r2.data != r.data:
        meld(f"[3] {sti}: normaliseringen er ikke idempotent")
print(f"[3] Fixtures: {n_ok}/{len(FIX)} udløser deres regel med rigtig status; "
      f"{len(UDEN_FIXTURE)} regler dækket andetsteds; rene serier og idempotens tjekket")

# ------------------------------------------------------------------ [4] tal_tekst og motorens normalisering
for x, forv in K["tidsserier"]["normaliseret_fil"]["tal_tekst_testvektorer"]:
    if V.tal_tekst(x) != forv:
        meld(f"[4] tal_tekst({x!r}) = {V.tal_tekst(x)!r}, forventet {forv!r}")
node = subprocess.run(["node", "-e", "const v=JSON.parse(process.argv[1]);console.log(JSON.stringify(v.map(x=>String(x===0?0:x))))",
                       json.dumps([x for x, _ in K["tidsserier"]["normaliseret_fil"]["tal_tekst_testvektorer"]])],
                      capture_output=True, text=True) if os.name else None
if node is not None and node.returncode == 0:
    js = json.loads(node.stdout)
    for (x, forv), j in zip(K["tidsserier"]["normaliseret_fil"]["tal_tekst_testvektorer"], js):
        if j != forv:
            meld(f"[4] JS String({x!r}) = {j!r}, forventet {forv!r}")
    print(f"[4] tal_tekst: {len(js)} vektorer ens i Python og JS (node)")
else:
    print("[4] tal_tekst: node ikke fundet - kun Python tjekket")
motor = PRODUKT / "fabric" / "fjv" / "tidsserie.py"
if motor.exists():
    import importlib.util
    spec = importlib.util.spec_from_file_location("fjv_tidsserie", motor)
    M = importlib.util.module_from_spec(spec)
    sys.modules["fjv_tidsserie"] = M
    spec.loader.exec_module(M)
    # Motorens strenge læser (arbejderens sidste værn) skal tage imod oraklets fil og give
    # præcis oraklets punkter. Har motoren stadig sin egen normaliser, skal bytes være ens.
    for sti, r in resultater.items():
        try:
            pkt = M.laes_normaliseret(r.data)
        except Exception as e:                            # noqa: BLE001
            meld(f"[4] {sti}: motorens laes_normaliseret afviser oraklets fil: {e}")
            continue
        if [(t, v) for t, v in pkt] != [(t, v) for t, v in r.punkter]:
            meld(f"[4] {sti}: motoren læser andre punkter end oraklet skrev")
        if hasattr(M, "normaliser") and hasattr(M, "laes_kilde_csv"):
            mr = M.normaliser(M.laes_kilde_csv(repo_fil(sti).decode("utf-8")), FORVENTET[sti][0])
            if mr.data != r.data:
                meld(f"[4] {sti}: oraklets bytes != motorens normaliser")
    print(f"[4] Normaliseret fil: motorens laes_normaliseret tager oraklets fil for {len(resultater)} repofiler "
          f"og læser de samme punkter")
else:
    print("[4] fabric/fjv/tidsserie.py findes ikke - motor-sammenligning sprunget over")

# ------------------------------------------------------------------ [5] henvisninger
HENV = re.compile(r"([\w./-]+\.(?:md|py|yaml|csv))\s?:(\d+)(?:-(\d+))?")
repo_filer = set(git("ls-tree", "-r", "--name-only", PIN).splitlines())
laengde: dict = {}
n = 0
for p in [VIDEN / "data_krav.json", VIDEN / "data_krav.md", VIDEN / "app_tekster" / "information" / "data.md"]:
    if not p.exists():
        meld(f"[5] {p.relative_to(VIDEN)} findes ikke")
        continue
    for m in HENV.finditer(p.read_text(encoding="utf-8")):
        fil, a, b = m.group(1), int(m.group(2)), int(m.group(3) or m.group(2))
        n += 1
        if fil not in repo_filer:
            meld(f"[5] {p.name}: {m.group(0)} - findes ikke i {PIN[:7]}")
            continue
        if fil not in laengde:
            laengde[fil] = len(repo_fil(fil).decode("utf-8", errors="replace").splitlines())
        if not 1 <= a <= b <= laengde[fil]:
            meld(f"[5] {p.name}: {m.group(0)} - uden for 1..{laengde[fil]}")
print(f"[5] Henvisninger: {n} fil:linje, {sum('[5]' in f for f in fejl)} brudte")

# ------------------------------------------------------------------ [6] ved bestilling
b = resultater["data/billund_abvaerk_hourly.csv"]
s = resultater["data/solar_andeby_dmi_karup.csv"]
TILF = [
    ("inden for serien", "varmelast", b, "2026-01-05T00:00:00Z", "2026-01-16T23:00:00Z", {}, set()),
    # Filen slutter 24. juni 06:00: til 25. juni mangler 41 af 2.784 timer (1,5 %) - til 30. juni 161 (5,5 %),
    # derfor slutter README's Spor A-anker 23. juni (README.md:144).
    ("lidt ud over seriens slut", "varmelast", b, "2026-03-02T00:00:00Z", "2026-06-25T23:00:00Z", {}, {"koersel_varmelast_huller"}),
    ("Spor B-perioden med den usplejsede fil", "varmelast", b, "2026-03-02T00:00:00Z", "2026-06-30T23:00:00Z", {}, {"koersel_varmelast_daekning"}),
    ("langt ud over slut", "varmelast", b, "2026-06-01T00:00:00Z", "2026-07-31T23:00:00Z", {}, {"koersel_varmelast_daekning"}),
    ("sol inden for", "solprofil", s, "2026-01-05T00:00:00Z", "2026-01-16T23:00:00Z", {}, set()),
    ("sol efter 3. oktober 2026", "solprofil", s, "2026-10-01T00:00:00Z", "2026-10-06T23:00:00Z", {}, {"koersel_sol_daekning"}),
    ("ikke gyldig", "varmelast", b, "2026-01-05T00:00:00Z", "2026-01-06T23:00:00Z", {"status": "afvist"}, {"koersel_tidsserie_ikke_gyldig"}),
    ("over kapacitet", "varmelast", b, "2026-01-05T00:00:00Z", "2026-01-16T23:00:00Z", {"vaerk": VAERK, "punkter": b.punkter}, {"koersel_over_kapacitet"}),
]
for navn, rolle, r, a_, b_, kw, forv in TILF:
    for eksakt in (False, True):
        kw2 = dict(kw)
        if eksakt and "punkter" not in kw2:
            kw2["punkter"] = r.punkter
        koder = {f["kode"] for f in V.tjek_koersel(r.validering, rolle, a_, b_, k=K, **kw2)}
        if koder != forv:
            meld(f"[6] {navn} ({'punkter' if eksakt else 'validering_json'}): {sorted(koder)}, forventet {sorted(forv)}")
# Huller midt i: validering_json-vejen skal give samme antal som den eksakte.
hul = V.valider(serie("2026-01-01", 24 * 20, last, spring=set(range(100, 130))), "varmelast", k=K)
for a_, b_ in [("2026-01-04T00:00:00Z", "2026-01-07T23:00:00Z"), ("2026-01-01T00:00:00Z", "2026-01-20T23:00:00Z")]:
    x = V.tjek_koersel(hul.validering, "varmelast", a_, b_, k=K)
    y = V.tjek_koersel(hul.validering, "varmelast", a_, b_, k=K, punkter=hul.punkter)
    if [f["besked"] for f in x] != [f["besked"] for f in y]:
        meld(f"[6] huller {a_}: validering_json {x} != eksakt {y}")
print(f"[6] Bestilling: {len(TILF)} tilfælde x 2 veje + hul-ækvivalens")

# ------------------------------------------------------------------ [7] modellens læsere
if "--model" in sys.argv:
    import numpy as np
    import pandas as pd
    import xarray as xr
    sys.path.insert(0, str(REPO))
    from src.data_loader import apply_heat_csv_override  # noqa: E402
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        for sti in ("data/billund_abvaerk_hourly.csv", "data/billund_abvaerk_hourly_splejset_jun2026.csv"):
            org = td / "org.csv"; org.write_bytes(repo_fil(sti))
            nor = td / "nor.csv"; nor.write_bytes(resultater[sti].data)
            for a_, b_ in [("2025-03-02", "2026-06-30 23:00"), ("2026-01-05", "2026-01-16 23:00")]:
                idx = pd.date_range(a_, b_, freq="h")
                ds = xr.Dataset({"heat_demand": ("time", np.zeros(len(idx)))}, coords={"time": idx})
                try:
                    x = apply_heat_csv_override(ds, org)["heat_demand"].values
                    y = apply_heat_csv_override(ds, nor, column="mw")["heat_demand"].values
                except ValueError as e:
                    x = y = None
                    if "2025-03-02" in a_ and "splejset" in sti:
                        meld(f"[7] {sti}: {e}")
                if x is not None and not np.array_equal(x, y):
                    meld(f"[7] {sti} {a_}: heat_demand afviger (maks {np.nanmax(np.abs(x - y))})")
        # Solprofil: profil-læserens egne linjer (src/data_loader.py:988-990)
        for sti in ("data/solar_andeby_dmi_karup.csv",):
            def laes(p):
                df = pd.read_csv(p, parse_dates=["time"])
                df["time"] = pd.to_datetime(df["time"], utc=True).dt.tz_convert(None)
                return df.set_index("time").sort_index().iloc[:, 0]
            org = td / "org.csv"; org.write_bytes(repo_fil(sti))
            nor = td / "nor.csv"; nor.write_bytes(resultater[sti].data)
            x, y = laes(org), laes(nor)
            if not (x.index.equals(y.index) and np.array_equal(x.values, y.values)):
                meld(f"[7] {sti}: profilen afviger")
    print(f"[7] Modellens læsere: normaliseret = original, bit for bit ({sum('[7]' in f for f in fejl)} afvigelser)")

# ------------------------------------------------------------------ [8] værksark
if "--vaerksark" in sys.argv:
    py = sys.executable
    try:
        import openpyxl  # noqa: F401
    except ImportError:
        meld("[8] openpyxl mangler - kør med fabric/_lokal/.venv")
    else:
        sys.path.insert(0, str(HER))
        from vaerksark_varianter import lav_varianter  # noqa: E402
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            skab = td / "vaerksdata_skabelon.xlsx"
            skab.write_bytes(repo_fil("doc/vaerksdata_skabelon.xlsx"))
            varianter = lav_varianter(skab, td / "in", repo_fil("data/billund_abvaerk_hourly_splejset_jun2026.csv"))
            for navn, (fil, flag, forv_exit, forv_tekst) in varianter.items():
                r = subprocess.run([py, "scripts/vaerksark_til_yaml.py", str(fil), "--cases-dir", str(td / navn / "c"),
                                    "--data-dir", str(td / navn / "d"), *flag],
                                   cwd=REPO, capture_output=True, text=True, encoding="utf-8",
                                   env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1"})
                ud = r.stdout + r.stderr
                if r.returncode != forv_exit or (forv_tekst and forv_tekst not in ud):
                    meld(f"[8] {navn}: exit {r.returncode} (forventet {forv_exit}), '{forv_tekst}' {'fundet' if forv_tekst in ud else 'IKKE fundet'}")
            print(f"[8] Værksark: {len(varianter)} varianter kørt gennem scripts/vaerksark_til_yaml.py")

print()
if fejl:
    print(f"GATE RØD: {len(fejl)} fejl.")
    sys.exit(1)
print("GATE GRØN: 0 fejl.")
