"""Gate for viden/: JSON parser, katalog dækker alle cases, kilder holder, tal har kilde.

Kør med en Python, der har PyYAML (fx modelrepoets .venv):
    <modelrepo>/.venv/Scripts/python.exe tjek_viden.py

Tjek:
  1. Alle *.json i viden/ parser.
  2. Fuldstændighed: hver blad-sti i hver cases/*.yaml ved den pinnede commit
     (flad efter KONTRAKT §3.2: dicts rekurseres, skalarer og lister er blade)
     matcher en blad-post i felt_katalog.json. heat_load_params_*.yaml tjekkes
     også, med wrapper-nøglen omdøbt til heat_load_params.
     Samtidig: ingen nøgle må indeholde '.', og tomme dicts meldes.
  3. Kilde-tjek: linjen, en katalogpost peger på, indeholder postens sidste
     navngivne nøgle (eller et ord fra en kendt undtagelsesliste).
  4. Stjerne-tjek: hvor en stjerne har 'tilladte', er de faktiske navne i
     casene blandt dem.
  5. Tal-tjek: hvert afsnit i METODE.md og app_tekster/**/*.md med et tal
     har mindst én kildehenvisning.
Afslutter med kode 1 ved første kategori med fejl (men melder alle).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

import yaml

sys.stdout.reconfigure(errors="replace")

HER = Path(__file__).resolve().parent
VIDEN = HER.parent
REPO = Path(os.environ.get("FJV_MODELREPO",
                           VIDEN.parent.parent / "fjernvarme-businesscase"))
PIN = "eef950a2ac7b3808a9456dcf48742ce08e52366a"

fejl: dict[str, list[str]] = {}


def meld(kat: str, tekst: str) -> None:
    fejl.setdefault(kat, []).append(tekst)


def git(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(REPO), *args], text=True,
                                   encoding="utf-8")


# --- 1. JSON ----------------------------------------------------------------
jsonfiler = sorted(p for p in VIDEN.rglob("*.json"))
data = {}
for p in jsonfiler:
    try:
        data[p.name] = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        meld("json", f"{p.relative_to(VIDEN)}: {e}")
print(f"[1] JSON: {len(jsonfiler)} filer, {len(fejl.get('json', []))} fejl")

katalog = data["felt_katalog.json"]["felter"]
blade = [d for d in katalog if d["blad"]]
moenstre = [(d["sti"].split("."), d) for d in blade]


def match(sti: list[str]) -> dict | None:
    for m, d in moenstre:
        if len(m) == len(sti) and all(a == "*" or a == b for a, b in zip(m, sti)):
            return d
    return None


# --- 2. Fuldstændighed ------------------------------------------------------
def flad(d: dict, pre: tuple = ()):
    for k, v in d.items():
        k = str(k)
        if "." in k:
            meld("noegle_med_punktum", f"{'.'.join(pre + (k,))}")
        p = pre + (k,)
        if isinstance(v, dict) and v:
            yield from flad(v, p)
        else:
            if isinstance(v, dict):
                meld("tom_dict", ".".join(p))
            yield p, v


case_filer = [l for l in git("ls-tree", "--name-only", PIN, "cases/").splitlines()
              if l.endswith(".yaml")]
antal_blade = 0
ukat: dict[str, set[str]] = {}
faktiske_stjerner: list[tuple[dict, list[str]]] = []
for f in case_filer:
    raw = yaml.safe_load(git("show", f"{PIN}:{f}"))
    navn = Path(f).name
    if navn.startswith("heat_load_params"):
        (wrapper,) = [k for k in raw if str(k).startswith("heat_load_params")]
        raw = {"heat_load_params": raw[wrapper]}
    for sti, _v in flad(raw):
        antal_blade += 1
        d = match(list(sti))
        if d is None:
            ukat.setdefault(".".join(sti), set()).add(navn)
        else:
            faktiske_stjerner.append((d, list(sti)))
for s, filer in sorted(ukat.items()):
    meld("ukatalogiseret", f"{s}  ({', '.join(sorted(filer))})")
print(f"[2] Fuldstændighed: {len(case_filer)} case-filer, {antal_blade} blade, "
      f"{len(ukat)} ukatalogiserede stier")

# --- 3. Kilde-tjek ----------------------------------------------------------
# Hvor kilden er en blok- eller funktionslinje, står feltnavnet ikke på linjen.
UNDTAGELSER = {
    "meta.timezone_internal", "meta.timezone_reporting",
    "meta.discount_rate_real", "meta.tax_year",       # raw["meta"] læses samlet
    "time.resolution",                                 # make_time_index
    "data", "solver", "heat_load_params", "prices.*", "prices.*.unit",
    "balancing", "units.*", "storage.*", "ancillary_groups.*",
    "heat_load_params.nettab", "electricity.tariff_consumption",
    "heat_load_params._source", "heat_load_params._calibrated",
    "heat_load_params._fit_r2", "heat_load_params._fit_rmse",
    "heat_load_params._n_observations",
    "prices.waste_heat.value", "prices.co2_eua.value",
    "data.dmi_area", "data.price_zone",
    "heat_load_params.baseline_profile_mw",
    "electricity.tariff_consumption.fixed_components.*",
    "electricity.tariff_consumption.fixed_components.elafgift_net",
    "electricity.tariff_consumption.net_tariff.seasons.*.months",
    "electricity.tariff_consumption.net_tariff.seasons.*.weekday.*",
    "electricity.tariff_consumption.net_tariff.seasons.*.weekend.*",
    "units.*.ancillary", "units.*.cop_curve.type",
    "balancing.activation.foresight", "balancing.activation.*.model",
    "balancing.reservation_gate.mode",
    "units.*.type", "units.*.fuel",
}
cache: dict[str, list[str]] = {}
for d in katalog:
    fil, _, linje = d["kilde"].rpartition(":")
    if fil not in cache:
        cache[fil] = git("show", f"{PIN}:{fil}").splitlines()
    try:
        tekst = cache[fil][int(linje) - 1]
    except (IndexError, ValueError):
        meld("kilde", f"{d['sti']}: {d['kilde']} findes ikke")
        continue
    if d["sti"] in UNDTAGELSER:
        continue
    navne = [s for s in d["sti"].split(".") if s != "*"]
    sidste = navne[-1]
    if sidste not in tekst:
        meld("kilde", f"{d['sti']}: '{sidste}' står ikke på {d['kilde']}: {tekst.strip()[:90]}")
print(f"[3] Kilde-tjek: {len(katalog)} poster, {len(fejl.get('kilde', []))} fejl")

# --- 3b. Modsat retning: alle felter config.py/tariff.py kender ------------
# Feltnavne i hver @dataclass i config.py (og ConsumptionTariff/TariffSeason i
# tariff.py) skal findes som et segment i en katalog-sti. CaseConfig-felter
# hedder noget andet i YAML; de oversættes her.
CASECONFIG_YAML = {
    "meta": "meta", "time": "time", "prices": "prices", "electricity": "electricity",
    "units": "units", "storage": "storage", "ancillary_groups": "ancillary_groups",
    "investment_enabled": "investment", "shared_reserve_cap_mw": "shared_reserve_cap_mw",
    "balancing_method": "method", "bid_strategy": "bid_strategy",
    "ancillary_caps": "ancillary_caps", "reservation_gate": "reservation_gate",
    "activation": "activation", "availability": "availability",
    "robust_reservation": "robust_reservation", "solver": "solver",
    "grid_max_consumption_mw": "max_consumption_mw", "data": "data",
}
IKKE_YAML = {"name"}  # navnet er nøglen, ikke et felt
TARIF_YAML = {"bands": "bands", "seasons": "seasons", "fixed_components": "fixed_components",
              "extra_holidays": "extra_holidays", "source": "source", "unit": "unit",
              "months": "months", "weekday": "weekday", "weekend": "weekend"}
segmenter = {s for d in katalog for s in d["sti"].split(".")}
segmenter |= {v for d in katalog for st in d.get("stjerne") or []
              for v in st.get("tilladte") or []}
# Elektricitet: tariff_consumption_flat m.fl. står som segmenter direkte.
antal_felter = 0
for fil, oversaet in (("src/config.py", None), ("src/tariff.py", TARIF_YAML)):
    linjer = git("show", f"{PIN}:{fil}").splitlines()
    klasse = None
    for i, l in enumerate(linjer):
        m = re.match(r"^class (\w+)", l)
        if m:
            klasse = m.group(1) if i > 0 and linjer[i - 1].startswith("@dataclass") else None
            continue
        if l and not l[0].isspace() and not l.startswith(("#", "@")):
            klasse = None   # topniveau-kode afslutter klassen
            continue
        if klasse is None:
            continue
        m = re.match(r"^    (\w+): ", l)
        if not m or m.group(1).isupper() or m.group(1).startswith("_"):
            continue
        felt = m.group(1)
        if felt in IKKE_YAML:
            continue
        antal_felter += 1
        if klasse == "CaseConfig":
            yamlnavn = CASECONFIG_YAML.get(felt)
        elif oversaet is not None:
            yamlnavn = oversaet.get(felt, felt)
        else:
            yamlnavn = felt
        if yamlnavn not in segmenter:
            meld("felt_uden_katalog", f"{fil}: {klasse}.{felt} (YAML '{yamlnavn}')")
print(f"[3b] Modsat retning: {antal_felter} dataclass-felter i config.py/tariff.py, "
      f"{len(fejl.get('felt_uden_katalog', []))} uden katalogpost")
if antal_felter < 50:
    meld("felt_uden_katalog", f"kun {antal_felter} felter fundet - parseren er i stykker")

# --- 4. Stjerne-tjek --------------------------------------------------------
for d, sti in faktiske_stjerner:
    stjerner = d.get("stjerne") or []
    pos = [i for i, s in enumerate(d["sti"].split(".")) if s == "*"]
    for i, st in zip(pos, stjerner):
        if st.get("tilladte") and sti[i] not in st["tilladte"]:
            meld("stjerne", f"{'.'.join(sti)}: '{sti[i]}' ikke i {st['tilladte']}")
print(f"[4] Stjerne-tjek: {len(fejl.get('stjerne', []))} fejl")

# --- 5. Tal har kilde -------------------------------------------------------
KILDE = re.compile(
    r"(\b[\w./-]+\.(md|py|yaml|csv|json)(:\d+(-\d+)?)?\b)"
    r"|(rapport v4 §\s?\d)|(rapport v4, (afsnit|tabel|bilag) )"
    r"|(KONTRAKT §\d)"
    # Runde 8: en erklæret egen måling (dato og modelversion) er en kilde — den står ikke i modelrepoet, og det siges.
    r"|(egen måling \()")
TAL = re.compile(r"\d")


def afsnit(tekst: str):
    """Blokke adskilt af tomme linjer. Returnerer (type, tekst), type er
    'tabel' (hele tabellen), 'citat' (linjer med >) eller 'tekst'.
    Kodeblokke og overskrifter springes over."""
    i_kode = False
    blok: list[str] = []
    ud: list[tuple[str, str]] = []

    def luk():
        if blok:
            f = blok[0].lstrip()
            typ = "tabel" if f.startswith("|") else "citat" if f.startswith(">") else "tekst"
            ud.append((typ, "\n".join(blok)))
            blok.clear()

    for linje in tekst.splitlines() + [""]:
        if linje.strip().startswith("```"):
            i_kode = not i_kode
            luk()
            continue
        if i_kode:
            continue
        er_tabel = linje.lstrip().startswith("|")
        if blok and er_tabel != blok[0].lstrip().startswith("|"):
            luk()
        if not linje.strip() or linje.lstrip().startswith("#"):
            luk()
            continue
        blok.append(linje)
    return ud


def renset(a: str) -> str:
    a = re.sub(r"`[^`]*`", "", a)                 # inline-kode (stier, flag)
    a = re.sub(r"\]\([^)]*\)", "]", a)            # link-mål
    a = KILDE.sub("", a)
    a = re.sub(r"^\s*\d+\.\s", "", a, flags=re.M)  # nummererede lister
    a = re.sub(r"§\s?\d+(\.\d+)*", "", a)          # interne henvisninger
    a = re.sub(r"(afsnit|kapitel|tabel|bilag|figur) \d+(\.\d+)*", "", a, flags=re.I)
    a = re.sub(r"[A-Za-zÆØÅæøå]+\d+[A-Za-z\d]*", "", a)  # navne som DK1, CO2, F64
    return a


md_filer = [VIDEN / "METODE.md"] + sorted((VIDEN / "app_tekster").rglob("*.md"))
for p in md_filer:
    if not p.exists():
        meld("tal_uden_kilde", f"{p.relative_to(VIDEN)} findes ikke")
        continue
    blokke = afsnit(p.read_text(encoding="utf-8"))
    for i, (typ, a) in enumerate(blokke):
        if not TAL.search(renset(a)) or KILDE.search(a):
            continue
        # En tabel eller et citat er dækket af kilden i afsnittet lige før/efter
        # (tabellens billedtekst).
        if typ in ("tabel", "citat"):
            naboer = [blokke[j][1] for j in (i - 1, i + 1) if 0 <= j < len(blokke)]
            if any(KILDE.search(n) for n in naboer):
                continue
        meld("tal_uden_kilde", f"{p.relative_to(VIDEN)}: {a.strip()[:110]}")
print(f"[5] Tal-tjek: {len(md_filer)} md-filer, "
      f"{len(fejl.get('tal_uden_kilde', []))} afsnit med tal uden kilde")

# --- 6. Henvisninger findes ------------------------------------------------
# Hver 'fil:linje' eller 'fil:a-b' i viden/ (md og json) skal pege på en fil i
# modelrepoet ved PIN, og linjerne skal findes.
HENV = re.compile(r"([\w./-]+\.(?:md|py|yaml|csv))\s?:(\d+)(?:-(\d+))?")
repo_filer = set(git("ls-tree", "-r", "--name-only", PIN).splitlines())
laengde: dict[str, int] = {}
antal_henv = 0
for p in sorted(VIDEN.rglob("*")):
    if p.suffix not in (".md", ".json") or "vaerktoej" in p.parts:
        continue
    for m in HENV.finditer(p.read_text(encoding="utf-8")):
        fil, a, b = m.group(1), int(m.group(2)), int(m.group(3) or m.group(2))
        antal_henv += 1
        if fil not in repo_filer:
            meld("henvisning", f"{p.relative_to(VIDEN)}: {m.group(0)} - filen findes ikke i {PIN[:7]}")
            continue
        if fil not in laengde:
            laengde[fil] = len(git("show", f"{PIN}:{fil}").splitlines())
        if not (1 <= a <= b <= laengde[fil]):
            meld("henvisning", f"{p.relative_to(VIDEN)}: {m.group(0)} - uden for 1..{laengde[fil]}")
print(f"[6] Henvisninger: {antal_henv} fil:linje-henvisninger, "
      f"{len(fejl.get('henvisning', []))} brudte")

# --- 7. Enhedsskabelonerne validerer i modellens egen load_case -------------
# Kræver at modelrepoets src/ i arbejdsmappen er identisk med PIN.
if subprocess.run(["git", "-C", str(REPO), "diff", "--quiet", PIN, "--", "src"]).returncode:
    meld("skabelon", f"src/ i {REPO} afviger fra {PIN[:7]}; kan ikke validere skabeloner")
else:
    import tempfile
    sys.path.insert(0, str(REPO))
    sys.dont_write_bytecode = True
    from src.config import load_case  # noqa: E402
    raw = yaml.safe_load(git("show", f"{PIN}:cases/andeby.yaml"))
    raw["prices"]["wood_pellets"] = {"value": 300.0, "unit": "DKK/MWh_fuel"}
    typer = data["enhedstyper.json"]["typer"]
    for typ, d in typer.items():
        raw["units"][f"ny_{typ}"] = dict(d["skabelon"])
        if d["skabelon"].get("type") != typ:
            meld("skabelon", f"{typ}: skabelonens type er {d['skabelon'].get('type')!r}")
    fd, tmp = tempfile.mkstemp(suffix=".yaml")
    os.close(fd)
    Path(tmp).write_text(yaml.safe_dump(raw, allow_unicode=True), encoding="utf-8")
    try:
        cfg = load_case(tmp)
        for n, u in cfg.units.items():
            if u.fuel not in ("electricity", "solar"):
                cfg.prices.fuel_price(u.fuel)
    except Exception as e:  # noqa: BLE001
        meld("skabelon", f"load_case afviste skabelonerne: {type(e).__name__}: {e}")
    finally:
        os.remove(tmp)
print(f"[7] Enhedsskabeloner: {len(data['enhedstyper.json']['typer'])} typer, "
      f"{len(fejl.get('skabelon', []))} fejl")

# --- Resultat ---------------------------------------------------------------
if fejl:
    print("\nFEJL:")
    for kat, linjer in fejl.items():
        print(f"  [{kat}] {len(linjer)}")
        for l in linjer[:60]:
            print(f"     - {l}")
    sys.exit(1)
print("\nGATE GRØN: 0 fejl i alle syv tjek.")
