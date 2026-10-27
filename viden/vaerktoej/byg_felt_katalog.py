"""Bygger viden/felt_katalog.json og viden/enhedstyper.json.

Kataloget er håndskrevet her (dansk tekst, regler, standardværdier), men hver
`kilde` slås op i modelrepoet ved den PINNEDE commit med et regulært udtryk,
så linjenummeret ikke er gættet. Findes udtrykket ikke, stopper scriptet.

Kør (fra hvor som helst):
    python byg_felt_katalog.py

Modelrepoet forventes som søster til produktmappen
(../fjernvarme-businesscase); miljøvariablen FJV_MODELREPO overskriver.
Kun standardbiblioteket; git skal være på PATH.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")

HER = Path(__file__).resolve().parent
VIDEN = HER.parent
PIN = "eef950a2ac7b3808a9456dcf48742ce08e52366a"
REPO = Path(os.environ.get("FJV_MODELREPO",
                           VIDEN.parent.parent / "fjernvarme-businesscase"))
COMMIT = PIN

_cache: dict[str, list[str]] = {}


def _linjer(fil: str) -> list[str]:
    if fil not in _cache:
        tekst = subprocess.check_output(
            ["git", "-C", str(REPO), "show", f"{COMMIT}:{fil}"],
            text=True, encoding="utf-8")
        _cache[fil] = tekst.splitlines()
    return _cache[fil]


def K(fil: str, monster: str, efter: str | None = None) -> str:
    """'fil:linje' for første linje der matcher `monster` (efter `efter`)."""
    linjer = _linjer(fil)
    start = 0
    if efter is not None:
        for i, l in enumerate(linjer):
            if re.search(efter, l):
                start = i
                break
        else:
            raise SystemExit(f"FEJL: ankeret {efter!r} findes ikke i {fil}")
    for i in range(start, len(linjer)):
        if re.search(monster, linjer[i]):
            return f"{fil}:{i + 1}"
    raise SystemExit(f"FEJL: {monster!r} findes ikke i {fil} (efter {efter!r})")


CFG = "src/config.py"
TAR = "src/tariff.py"
DL = "src/data_loader.py"
DLG = "src/data_loader_github.py"
NET = "src/nettab.py"
BAL = "src/balancing.py"
MOD = "src/model.py"
RUN = "run_case.py"
MAN = "src/manifest.py"

ENHEDER = {"navn": "enhed", "fra": "units"}
LAGRE = {"navn": "lager", "fra": "storage"}
MARKED = {"navn": "marked", "tilladte": ["afrr", "mfrr"]}

KATALOG: list[dict] = []


def F(sti, etiket, type_, forklaring, kilde, *, enhed=None, tilladte=None,
      min=None, max=None, min_eksklusiv=False, standard="__ingen__",
      paakraevet=False, gaelder_for=None, avanceret=False,
      laeses_af_koden=True, stjerne=None, regler=None, blad=True,
      eksempel="__ingen__"):
    d = {
        "sti": sti,
        "sektion": sti.split(".")[0],
        "etiket": etiket,
        "enhed": enhed,
        "type": type_,
        "tilladte": tilladte,
        "min": min,
        "max": max,
        "paakraevet": paakraevet,
        "gaelder_for": gaelder_for,
        "forklaring": forklaring,
        "kilde": kilde,
        "avanceret": avanceret,
        "laeses_af_koden": laeses_af_koden,
        "blad": blad,
        # Scenarie-'set' (KONTRAKT v2 §3.5): ethvert blad, der findes i værket,
        # også en liste (erstattes helt). CLI'ens --set (config.py
        # _apply_override) kan kun skalarer — relevant for manuel kørsel.
        # KONTRAKT v2.2 §6c: set på time.* og solver.* afvises i scenarier
        # (periode, gab og tidsgrænse har egne scenariefelter).
        "kan_saettes_i_scenarie": blad and not sti.startswith(("time.", "solver.")),
        "kan_saettes_med_cli_set": blad and type_ not in ("list", "object"),
    }
    if min_eksklusiv:
        d["min_eksklusiv"] = True
    if standard != "__ingen__":
        d["standard"] = standard
    if eksempel != "__ingen__":
        d["eksempel"] = eksempel
    if stjerne:
        d["stjerne"] = stjerne
    if regler:
        d["regler"] = regler
    KATALOG.append(d)


# =============================================================================
# meta
# =============================================================================
F("meta.case_name", "Casens navn (filnavnsstamme)", "string",
  "Bruges som første led i outputfilernes navn og som manifestets case_name. "
  "Skal være kort og uden mellemrum.",
  K(RUN, r'parts = \[cfg\.meta\["case_name"\]\]'), paakraevet=True,
  eksempel="andeby")
F("meta.titel", "Titel", "string",
  "Læsbar titel, som vises i manifestet. Mangler den, bruges case_name.",
  K(MAN, r'"titel": cfg\.meta\.get'), eksempel="Andeby — fiktivt referenceværk")
F("meta.description", "Beskrivelse", "string",
  "Fritekst om casen; skrives i manifestet som beskrivelse.",
  K(MAN, r'"beskrivelse": cfg\.meta\.get'))
F("meta.gruppe", "Gruppe", "string",
  "Valgfri gruppering af cases (fx 'andeby'); skrives i manifestet.",
  K(MAN, r'"gruppe": cfg\.meta\.get'), avanceret=True)
F("meta.rolle", "Rolle i gruppen", "string",
  "Valgfri rolle inden for en gruppe (fx reference/scenarie); skrives i manifestet.",
  K(MAN, r'"rolle_i_gruppe": cfg\.meta\.get'), avanceret=True)
for felt, etiket in (("timezone_internal", "Intern tidszone"),
                     ("timezone_reporting", "Rapporteringstidszone"),
                     ("discount_rate_real", "Real diskonteringsrente"),
                     ("tax_year", "Afgiftsår")):
    F(f"meta.{felt}", etiket, "number" if felt in ("discount_rate_real", "tax_year") else "string",
      "Ren dokumentation: feltet læses ikke af modellen. Modellen regner altid "
      "internt i UTC og slår tarif og budvindue op i dansk lokaltid.",
      K(CFG, r'meta=raw\["meta"\]'), laeses_af_koden=False, avanceret=True)

# =============================================================================
# data
# =============================================================================
F("data", "Eksterne datakilder", "object",
  "Påkrævet blok. Værket erklærer selv sit klimaområde og sin priszone; der er "
  "med vilje ingen standard, fordi en usynlig standard tidligere gav forkerte tal.",
  K(CFG, r'if "data" not in raw:'), paakraevet=True, blad=False)
F("data.dmi_area", "DMI-område (klima)", "enum",
  "Den DMI-station, hvis temperatur bruges til varmelast og varmepumpens COP. "
  "Vælg efter beliggenhed: vestkyst, karup (Midt- og Vestjylland), fyn, "
  "ringsted (Sjælland og øerne). Valget alene kan flytte objektivet op til ca. 4 %.",
  K(CFG, r'KENDTE_DMI_OMRAADER = '),
  tilladte=["fyn", "vestkyst", "karup", "ringsted"], paakraevet=True)
F("data.price_zone", "Priszone (spot)", "enum",
  "Elspot-prisområde: DK1 vest for Storebælt, DK2 øst for. Bør være det samme "
  "som electricity.spot_area, som styrer balancepriserne.",
  K(CFG, r'KENDTE_PRISZONER = '), tilladte=["DK1", "DK2"], paakraevet=True,
  regler=["Bør være lig electricity.spot_area (balancepriserne hentes for spot_area)."])
F("data.dmi_temp_shortname", "DMI-temperaturvariabel", "string",
  "Hvilken DMI-observation der bruges som udetemperatur. Lad standarden stå.",
  K(CFG, r'dmi_temp_shortname: str = '), standard="temp_mean_past1h", avanceret=True)
F("data.eur_dkk", "Valutakurs EUR→DKK", "number",
  "Kurs til omregning af spotpriser i EUR.",
  K(CFG, r'eur_dkk: float = '), enhed="DKK/EUR", min=0, min_eksklusiv=True,
  standard=7.45, avanceret=True)

# =============================================================================
# time
# =============================================================================
F("time.start", "Periodens start", "string",
  "Første time i kørslen, ISO-tid i UTC, fx 2025-07-01T00:00:00Z. Overskrives af "
  "scenariets periode, hvis den er sat.",
  K(CFG, r'start=datetime\.fromisoformat'), paakraevet=True,
  eksempel="2025-07-01T00:00:00Z",
  regler=["Skal være før time.end.",
          "Med balancering skal perioden ligge efter ca. april 2025 (PICASSO); "
          "imbalance- og mfrr_act-data begynder 4. marts 2025."])
F("time.end", "Periodens slut (sidste time)", "string",
  "Sidste time i kørslen, inklusive, ISO-tid i UTC, fx 2026-06-30T23:00:00Z.",
  K(CFG, r'end=datetime\.fromisoformat'), paakraevet=True,
  eksempel="2026-06-30T23:00:00Z")
F("time.resolution", "Tidsopløsning", "enum",
  "Modellens tidsskridt. Alle cases i repoet bruger 1h.",
  K(DL, r'freq = \{"1h": "h", "15min": "15min"\}'), tilladte=["1h", "15min"],
  paakraevet=True, avanceret=True,
  regler=["Appens version 1 kører kun 1h: ved 15min ganger modellens kroneled ikke med "
          "intervallets længde (KONTRAKT §6c, K2-F13)."])

# =============================================================================
# solver
# =============================================================================
F("solver", "Solvertolerance", "object",
  "Valgfri blok. Uden den gælder kodens standard (0,5 % / 5.000 kr. / 600 s), "
  "som er til absolutte tal, ikke til differenser.",
  K(CFG, r'solver_raw = raw\.get\("solver"'), blad=False)
F("solver.mip_rel_gap", "Relativt MIP-gab", "number",
  "Solveren stopper, når løsningen bevisligt ligger inden for denne brøkdel af "
  "det bedst mulige. 0,005 = 0,5 %. Til differenser mellem scenarier: 0,0002.",
  K(CFG, r'mip_rel_gap: float = '), enhed="brøk", min=0, max=1,
  standard=0.005, regler=["0 ≤ værdi < 1"])
F("solver.mip_abs_gap", "Absolut MIP-gab", "number",
  "Solveren stopper også, når afstanden til det bedst mulige er under dette beløb.",
  K(CFG, r'mip_abs_gap: float = '), enhed="DKK", min=0, standard=5000.0)
F("solver.time_limit", "Tidsgrænse", "number",
  "Maksimal løsetid. Rammes den, gemmes den bedste løsning med det opnåede gab.",
  K(CFG, r'time_limit: float = '), enhed="s", min=0, min_eksklusiv=True,
  standard=600.0)
F("solver.presolve", "HiGHS presolve", "string",
  "Sendes uændret til HiGHS. Lad standarden stå.",
  K(CFG, r'presolve: str = '), standard="on", avanceret=True)
F("solver.parallel", "HiGHS parallel", "string",
  "Sendes uændret til HiGHS. Lad standarden stå.",
  K(CFG, r'parallel: str = '), standard="on", avanceret=True)
F("solver.presolve_rule_off", "Fravalgte presolve-regler (bitmaske)", "integer",
  "Tom = automatisk: aggregator-reglen (4096) slås fra ved robust reservation, "
  "fordi den 15/10-2026 gav en forkert løsning. 0 = alle regler tilladt.",
  K(CFG, r'presolve_rule_off: Optional\[int\] = '), min=0, standard=None,
  avanceret=True)

# =============================================================================
# heat_load_params
# =============================================================================
F("heat_load_params", "Varmelast-syntese", "object",
  "Parametre til at syntetisere varmebehovet af DMI-temperaturen. Blokken skal "
  "findes ved kørsel med rigtige data, også når målt varmelast (heat-csv) "
  "bruges — så læses den, men ignoreres.",
  K(DL, r'def load_heat_load_params'), paakraevet=True, blad=False)
F("heat_load_params.gaf_mw_per_k", "Rumvarme-hældning (β_gaf)", "number",
  "Ekstra varmebehov pr. grad under t_ref (graddagsleddet), beregnet på et "
  "glidende gennemsnit af udetemperaturen.",
  K(DL, r'gaf_mw_per_k=float\(d\["gaf_mw_per_k"\]\)'), enhed="MW/K",
  paakraevet=True)
F("heat_load_params.t_ref", "Referencetemperatur for rumvarme", "number",
  "Udetemperatur, hvorunder der regnes rumvarme.",
  K(DL, r't_ref=float\(d\.get\("t_ref"'), enhed="°C", standard=15.0)
F("heat_load_params.thermal_inertia_hours", "Termisk inerti", "integer",
  "Tidskonstant for det glidende gennemsnit af udetemperaturen (bygningernes træghed).",
  K(DL, r'thermal_inertia_hours=int\(d\.get'), enhed="timer", standard=24)
F("heat_load_params.nettab_slope_mw_per_k", "Nettabs-hældning (β_net)", "number",
  "Hældningsmodellens nettab: ekstra MW pr. grad under t_net. 0 = intet "
  "temperaturafhængigt nettab-led. Ignoreres, hvis nettab-blokken findes.",
  K(DL, r'nettab_slope_mw_per_k=float\(d\.get'), enhed="MW/K", standard=0.0)
F("heat_load_params.t_net", "Referencetemperatur for nettab", "number",
  "Udetemperatur, hvorunder hældningsmodellens nettab-led regnes.",
  K(DL, r't_net=float\(d\.get\("t_net"'), enhed="°C", standard=12.0)
F("heat_load_params.baseline_profile_mw", "Grundlast pr. time på døgnet", "list",
  "24 tal: varmebehovet uden rumvarme (brugsvand og konstant nettab) for time 0–23 i UTC — modellens tidsakse, ikke dansk tid (time 0 = kl. 01 dansk vintertid, kl. 02 sommertid).",
  K(DL, r'd\.get\("baseline_profile_mw", \[6\.0\] \* 24\)'), enhed="MW",
  standard=[6.0] * 24, regler=["Præcis 24 tal."])
F("heat_load_params.weekly_dip", "Weekend-reduktion", "number",
  "Andel varmebehovet sænkes lørdag og søndag (0,02 = 2 %). Ugedagen bestemmes på UTC-aksen.",
  K(DL, r'weekly_dip=float\(d\.get\("weekly_dip"'), enhed="brøk", standard=0.02, avanceret=True)
for felt in ("_source", "_calibrated", "_fit_r2", "_fit_rmse", "_n_observations"):
    F(f"heat_load_params.{felt}", "Kalibreringsmetadata", "string" if felt in ("_source", "_calibrated") else "number",
      "Sporbarhed fra kalibreringsscriptet. Felter med '_' foran læses ikke af modellen.",
      K(DL, r"ignorer metadata-felter der begynder med '_'"),
      laeses_af_koden=False, avanceret=True)

# --- fysisk nettabsmodel (valgfri) ---
F("heat_load_params.nettab", "Fysisk nettabsmodel (to led)", "object",
  "Valgfri blok. Når den findes, erstatter den hældningsmodellen: nettab = "
  "a·(T_rør − T_jord) + c·last. Påvirker kun den syntetiske varmelast; med "
  "målt varmelast er nettabet allerede i målingen.",
  K(DL, r'nettab_cfg=d\.get\("nettab"\)'), blad=False, avanceret=True)
F("heat_load_params.nettab.aarligt_nettab_pct", "Årligt nettab, andel", "number",
  "Nettab som andel af årsproduktionen ab værk (0,146 = 14,6 %). Angiv denne "
  "eller aarligt_nettab_mwh.",
  K(NET, r"elif 'aarligt_nettab_pct' in cfg"), enhed="brøk", avanceret=True,
  regler=["Enten aarligt_nettab_pct eller aarligt_nettab_mwh skal være sat."])
F("heat_load_params.nettab.aarligt_nettab_mwh", "Årligt nettab, MWh", "number",
  "Nettab i MWh pr. år. Har forrang for aarligt_nettab_pct.",
  K(NET, r"if 'aarligt_nettab_mwh' in cfg"), enhed="MWh", avanceret=True)
for saeson, navn, t_ude in (("sommer", "Sommer", 16.0), ("vinter", "Vinter", 1.0)):
    F(f"heat_load_params.nettab.{saeson}.t_frem", f"{navn}: fremløbstemperatur", "number",
      f"Kundesidens fremløb i {saeson}perioden.",
      K(NET, rf"cfg\['{saeson}'\]\['t_frem'\]"), enhed="°C", avanceret=True,
      paakraevet=True)
    F(f"heat_load_params.nettab.{saeson}.t_retur", f"{navn}: returtemperatur", "number",
      f"Kundesidens retur i {saeson}perioden.",
      K(NET, rf"cfg\['{saeson}'\]\['t_retur'\]"), enhed="°C", avanceret=True,
      paakraevet=True)
    F(f"heat_load_params.nettab.{saeson}.t_ude", f"{navn}: ankertemperatur ude", "number",
      "Udetemperaturen, som sæsonens rørtemperatur hører til.",
      K(NET, rf"cfg\['{saeson}'\]\.get\('t_ude'"), enhed="°C", standard=t_ude,
      avanceret=True, regler=["sommer.t_ude skal være højere end vinter.t_ude."])
F("heat_load_params.nettab.konduktiv_andel", "Konduktiv andel af nettabet", "number",
  "Andel af nettabet, der er isolations- og jordtab; resten følger lasten.",
  K(NET, r"ka = float\(cfg\.get\('konduktiv_andel'"), enhed="brøk", min=0, max=1,
  min_eksklusiv=True, standard=0.75, avanceret=True,
  regler=["0 < værdi < 1"])
F("heat_load_params.nettab.t_jord_avg", "Jordtemperatur, årsmiddel", "number",
  "Middel af jordtemperaturen omkring rørene.",
  K(NET, r"t_jord_avg = float\(cfg\.get"), enhed="°C", standard=9.0, avanceret=True)
F("heat_load_params.nettab.t_jord_amp", "Jordtemperatur, amplitude", "number",
  "Sæsonudsving i jordtemperaturen (statisk kurve, koldest i februar).",
  K(NET, r"t_jord_amp = float\(cfg\.get"), enhed="K", standard=4.0, avanceret=True)
F("heat_load_params.nettab.t_jord_dynamic", "Dynamisk jordtemperatur", "boolean",
  "Lad jordtemperaturen følge et glidende gennemsnit af udetemperaturen i stedet "
  "for en fast sæsonkurve. Årets nettab er det samme; kun fordelingen ændres.",
  K(NET, r"if cfg\.get\('t_jord_dynamic'"), standard=False, avanceret=True)
F("heat_load_params.nettab.t_jord_ema_days", "Jordtemperatur, tidskonstant", "number",
  "Tidskonstant for det glidende gennemsnit (kun dynamisk).",
  K(NET, r"ema_days = float\(cfg\.get"), enhed="døgn", min=0, min_eksklusiv=True,
  standard=30.0, avanceret=True)
F("heat_load_params.nettab.t_jord_damping", "Jordtemperatur, dæmpning", "number",
  "Hvor meget af udetemperaturens afvigelse der slår igennem i jorden (kun dynamisk).",
  K(NET, r"damping = float\(cfg\.get"), min=0, max=1, standard=0.5, avanceret=True)
F("heat_load_params.nettab.t_jord_t_out_ref", "Klimanormal ude", "number",
  "Normal udetemperatur, som afvigelsen regnes fra (kun dynamisk).",
  K(NET, r"t_out_ref = float\(cfg\.get"), enhed="°C", standard=8.0, avanceret=True)

# =============================================================================
# prices
# =============================================================================
F("prices.*", "Pris", "object",
  "Én blok pr. brændsel med value (og unit som dokumentation). Brændselspriser "
  "er ekskl. moms pr. MWh brændsel. Kendte nøgler: natural_gas, straw, flis, "
  "wood_pellets, waste_heat, co2_eua.",
  K(CFG, r'p = raw\["prices"\]'), blad=False,
  stjerne=[{"navn": "brændsel", "tilladte": ["natural_gas", "straw", "flis",
                                            "wood_pellets", "waste_heat", "co2_eua"]}])
F("prices.co2_eua.value", "CO₂-kvotepris", "number",
  "Pris pr. ton CO₂. Ganges på enhedernes co2_emissions_per_mwh_fuel. Skriv 0, "
  "hvis gasprisen allerede indeholder CO₂-afgiften.",
  K(CFG, r'if "co2_eua" not in p:'), enhed="DKK/t CO₂", paakraevet=True,
  regler=["Skal findes (også som 0)."])
F("prices.natural_gas.value", "Naturgaspris", "number",
  "Pris pr. MWh gas ekskl. moms, gerne inkl. de afgifter, der gælder alle gasenheder.",
  K(CFG, r'natural_gas=p\["natural_gas"\]'), enhed="DKK/MWh brændsel",
  regler=["Påkrævet, hvis en aktiv enhed har fuel natural_gas."])
F("prices.straw.value", "Halmpris", "number",
  "Pris pr. MWh halm ekskl. moms.",
  K(CFG, r'straw = p\["straw"\]\["value"\]'), enhed="DKK/MWh brændsel",
  regler=["Påkrævet, hvis en aktiv enhed har fuel straw."])
F("prices.flis.value", "Flispris", "number",
  "Pris pr. MWh flis ekskl. moms. Mangler den, bruges halmprisen.",
  K(CFG, r'flis=p\["flis"\]\["value"\] if "flis" in p else straw'),
  enhed="DKK/MWh brændsel")
F("prices.wood_pellets.value", "Træpillepris", "number",
  "Pris pr. MWh træpiller ekskl. moms.",
  K(CFG, r'wood_pellets=p\["wood_pellets"\]'), enhed="DKK/MWh brændsel",
  regler=["Påkrævet, hvis en aktiv enhed har fuel wood_pellets."])
F("prices.waste_heat.value", "Pris på overskudsvarme", "number",
  "Pris pr. MWh overskudsvarme. Modellen deler den IKKE med virkningsgraden, så "
  "den virker som en pris pr. MWh leveret varme.",
  K(MOD, r'return xr\.full_like\(spot, cfg\.prices\.fuel_price\(unit\.fuel\) \+ om\)'),
  enhed="DKK/MWh", regler=["Påkrævet, hvis en aktiv enhed har fuel waste_heat."])
F("prices.*.unit", "Prisens enhed (tekst)", "string",
  "Ren dokumentation; læses ikke af modellen.",
  K(CFG, r'p = raw\["prices"\]'), laeses_af_koden=False, avanceret=True,
  stjerne=[{"navn": "brændsel"}])

# =============================================================================
# electricity
# =============================================================================
F("electricity.spot_area", "Elområde for balancepriser", "enum",
  "Prisområdet, aFRR- og mFRR-priserne hentes for. Hold det lig data.price_zone.",
  K(DLG, r'zone=cfg\.electricity\.spot_area'), tilladte=["DK1", "DK2"],
  paakraevet=True,
  regler=["Valideres ikke af config.py; bør være lig data.price_zone."])
F("electricity.tariff_consumption_flat", "Forbrugstarif, fast", "number",
  "Nettarif pr. MWh el, når der ikke er en tidsvarierende profil. Bruges også "
  "altid i aktiveringsværdien (sparet tarif ved aktivering), selv når profilen er sat.",
  K(CFG, r'tariff_consumption_flat=e\["tariff_consumption_flat"\]'),
  enhed="DKK/MWh el", paakraevet=True)
F("electricity.tariff_production_flat", "Produktionstarif", "number",
  "Tarif pr. MWh produceret el; trækkes fra kraftvarmens elsalg.",
  K(CFG, r'tariff_production_flat=e\["tariff_production_flat"\]'),
  enhed="DKK/MWh el", paakraevet=True)
F("electricity.electricity_tax", "Elafgift", "number",
  "Elafgift pr. MWh el til varmeproduktion (efter godtgørelse). Lægges til "
  "elprisen for alle el-forbrugende enheder.",
  K(CFG, r'electricity_tax=e\["electricity_tax"\]'), enhed="DKK/MWh el",
  paakraevet=True,
  regler=["Skal være lig tariff_consumption.fixed_components.elafgift_net, hvis den findes."])
F("electricity.tariff_consumption", "Tidsvarierende forbrugstarif", "object",
  "Valgfri båndprofil fra netselskabets prisblad: bånd, sæsoner og hverdag/weekend. "
  "Vinder over den faste tarif i driften. Opslag sker på dansk lokaltid.",
  K(CFG, r'tariff_consumption=parse_consumption_tariff'), blad=False)
F("electricity.tariff_consumption.unit", "Tarifprofilens enhed", "enum",
  "Skal være kr_per_mwh.", K(TAR, r'if self\.unit != "kr_per_mwh":'),
  tilladte=["kr_per_mwh"], paakraevet=True)
F("electricity.tariff_consumption.source", "Kilde til tarifprofilen", "string",
  "Fx netselskab og prisbladets dato. Vises i kørselsloggen.",
  K(TAR, r'source=raw\.get\("source"\)'))
F("electricity.tariff_consumption.fixed_components.*", "Fast tarifpost", "number",
  "Tidsuafhængige poster (fx energinet, dv), der lægges oven i båndet. Navnene er frie.",
  K(TAR, r'def fixed_sum'), enhed="DKK/MWh el",
  stjerne=[{"navn": "post"}])
F("electricity.tariff_consumption.fixed_components.elafgift_net", "Elafgift (dokumentation)", "number",
  "Står kun som dokumentation og tælles IKKE med i tariffen; modellen lægger "
  "electricity_tax til. Skal være samme tal som electricity_tax.",
  K(TAR, r'if navn == "elafgift_net":'), enhed="DKK/MWh el",
  regler=["Skal være lig electricity.electricity_tax, ellers afvises casen."])
F("electricity.tariff_consumption.extra_holidays", "Ekstra helligdage", "list",
  "Datoer (ÅÅÅÅ-MM-DD), der tarifmæssigt regnes som weekend ud over de "
  "indbyggede danske helligdage (store bededag er ikke med fra 2024).",
  K(TAR, r'extra_holidays=list\(raw\.get\("extra_holidays"'), standard=[],
  avanceret=True)
F("electricity.tariff_consumption.net_tariff.bands.*", "Tarifbånd", "number",
  "Nettarif pr. bånd, fx lav, hoej, spids. Navnene er frie og bruges i sæsonskemaerne.",
  K(TAR, r'bands=dict\(raw\.get\("net_tariff"'), enhed="DKK/MWh el",
  stjerne=[{"navn": "bånd"}])
F("electricity.tariff_consumption.net_tariff.seasons.*.months", "Sæsonens måneder", "list",
  "Månedsnumre 1–12. Alle 12 måneder skal stå i præcis én sæson.",
  K(TAR, r'def _check_months'), stjerne=[{"navn": "sæson"}],
  regler=["Hver måned 1–12 præcis én gang på tværs af sæsoner."])
for dagtype, navn in (("weekday", "hverdag"), ("weekend", "weekend og helligdag")):
    F(f"electricity.tariff_consumption.net_tariff.seasons.*.{dagtype}.*",
      f"Bånd for tidsinterval ({navn})", "enum",
      "Nøglen er et halvåbent timeinterval 'HH-HH' i lokal tid ('06-21' = time 6 "
      "til og med 20); værdien er et båndnavn fra bands.",
      K(TAR, r'def _check_hours'),
      stjerne=[{"navn": "sæson"}, {"navn": "interval", "format": "HH-HH"}],
      regler=["Værdien skal være et defineret bånd.",
              "Intervallerne skal dække time 0–23 præcis én gang."])

# =============================================================================
# units
# =============================================================================
F("units.*", "Produktionsenhed", "object",
  "Én blok pr. enhed. Navnet er frit (brug små bogstaver, tal og _). "
  "Påkrævede felter: type, p_max_heat, p_min_heat, alpha, fuel.",
  K(CFG, r'for name, u in raw\["units"\]\.items\(\):'), blad=False,
  stjerne=[ENHEDER],
  regler=["Ukendte felter afvises (enheden bygges med Unit(**felter)).",
          "Mindst én aktiv enhed, ellers er modellen tom."])
U = "units.*."
F(U + "type", "Enhedstype", "enum",
  "Varmepumpe, elkedel, biomassekedel, gaskedel, gasmotor, solvarme eller "
  "overskudsvarme. Typen er en etiket; økonomien styres af fuel og alpha. Kun "
  "heat_pump har en særregel (cop_curve).",
  K(CFG, r'type: str\s+# heat_pump'), stjerne=[ENHEDER], paakraevet=True,
  tilladte=["heat_pump", "electric_boiler", "biomass_boiler", "gas_boiler",
            "gas_engine_chp", "solar_thermal", "waste_heat"],
  regler=["Listen håndhæves af konverteringen (scripts/vaerksark_til_yaml.py), ikke af config.py."])
F(U + "enabled", "Med i modellen", "boolean",
  "false fjerner enheden helt fra modellen — samme virkning som at slå den fra i "
  "et scenarie. Sæt ikke kapaciteten til 0 i stedet.",
  K(CFG, r'enabled: bool = True\s+# false → enheden'), stjerne=[ENHEDER], standard=True)
F(U + "p_max_heat", "Maks. varmeeffekt", "number",
  "Enhedens største varmeproduktion. For varmepumpe med ydelsestabel et ekstra "
  "loft oven på tabellen; for solvarme nameplate (profilen binder).",
  K(CFG, r'p_max_heat: float\s+# MW varme'), enhed="MW varme",
  stjerne=[ENHEDER], paakraevet=True,
  regler=["p_min_heat ≤ p_max_heat"])
F(U + "p_min_heat", "Min. varmeeffekt (minimumslast)", "number",
  "Laveste last, når enheden er tændt. Virker kun, når uc_enabled er true.",
  K(CFG, r'p_min_heat: float\s+# MW varme'), enhed="MW varme",
  stjerne=[ENHEDER], paakraevet=True, regler=["p_min_heat ≤ p_max_heat"])
F(U + "alpha", "El/varme-forhold (α)", "number",
  "Elkedel: −1. Varmepumpe uden tabel: −1/COP. Gasmotor: el/varme (> 0), "
  "som giver elsalg. Kedler og sol: 0.",
  K(CFG, r'alpha: float\s+# el-til-varme ratio'), stjerne=[ENHEDER], paakraevet=True,
  regler=["Negativ for el-forbrugende enheder, positiv kun for kraftvarme."])
F(U + "fuel", "Brændsel", "enum",
  "Hvad enheden bruger: electricity, solar eller en nøgle under prices. Afgør "
  "marginalomkostningen og om enheden kan byde i balancemarkedet (kun electricity).",
  K(CFG, r'fuel: str\s+# nøgle i prices'), stjerne=[ENHEDER], paakraevet=True,
  tilladte=["electricity", "solar", "natural_gas", "straw", "flis",
            "wood_pellets", "waste_heat"],
  regler=["Andet end electricity/solar kræver eta_fuel_to_heat.",
          "Brændslets pris skal stå under prices."])
F(U + "eta_fuel_to_heat", "Virkningsgrad brændsel→varme", "number",
  "Varme pr. brændsel (0,96 = 96 %). Brændselsomkostningen pr. MWh varme er pris/η.",
  K(CFG, r'eta_fuel_to_heat: Optional\[float\] = None'), enhed="brøk",
  stjerne=[ENHEDER], min=0, min_eksklusiv=True,
  gaelder_for=["biomass_boiler", "gas_boiler", "gas_engine_chp", "waste_heat"],
  regler=["Påkrævet, når fuel ikke er electricity eller solar."])
F(U + "var_om", "Variabel D&V", "number",
  "Drifts- og vedligeholdelsesomkostning pr. MWh varme.",
  K(CFG, r'var_om: float = 0\.0'), enhed="DKK/MWh varme", stjerne=[ENHEDER],
  standard=0.0)
F(U + "start_cost", "Startomkostning", "number",
  "Omkostning pr. start. Virker kun, når uc_enabled er true.",
  K(CFG, r'start_cost: float = 0\.0'), enhed="DKK/start", stjerne=[ENHEDER],
  standard=0.0)
F(U + "min_uptime", "Min. driftstid", "integer",
  "Antal timer enheden skal køre efter en start. Virker kun med uc_enabled.",
  K(CFG, r'min_uptime: int = 1'), enhed="timer", stjerne=[ENHEDER], min=1,
  standard=1)
F(U + "min_downtime", "Min. stilstandstid", "integer",
  "Antal timer enheden skal stå efter et stop. Virker kun med uc_enabled.",
  K(CFG, r'min_downtime: int = 1'), enhed="timer", stjerne=[ENHEDER], min=1,
  standard=1)
F(U + "uc_enabled", "Start/stop-logik (unit commitment)", "boolean",
  "Slår minimumslast, min. drifts-/stilstandstid og startomkostning til. Gør "
  "modellen til en MILP og løsetiden længere.",
  K(CFG, r'uc_enabled: bool = False'), stjerne=[ENHEDER], standard=False)
F(U + "initial_status", "Tændt ved periodens start", "enum",
  "1 = tændt, 0 = slukket i første time. Betyder noget for enheder med "
  "minimumslast: tændte kedler uden tank kan gøre sommeren uløselig.",
  K(CFG, r'initial_status: int = 1'), stjerne=[ENHEDER], tilladte=[0, 1],
  standard=1)
F(U + "co2_emissions_per_mwh_fuel", "CO₂-udledning", "number",
  "Ton CO₂ pr. MWh brændsel. Naturgas ca. 0,2; biomasse 0 (regnes neutral).",
  K(CFG, r'co2_emissions_per_mwh_fuel: float = 0\.0'), enhed="t CO₂/MWh brændsel",
  stjerne=[ENHEDER], standard=0.0, min=0)
F(U + "production_profile_path", "Produktionsprofil (CSV)", "string",
  "Tidsserie, der binder produktionen time for time: loft = min(profil, "
  "p_max_heat). Bruges til solvarme. Stien er relativ til modelrepoets rod; "
  "CSV med kolonnerne time (UTC) og en værdi i MW. Skal dække hele perioden.",
  K(CFG, r'production_profile_path: Optional\[str\] = None'), stjerne=[ENHEDER],
  gaelder_for=["solar_thermal"], avanceret=True,
  regler=["Filen skal dække hver time i perioden; den nulfyldes ikke."])
F(U + "commissioned", "Idriftsættelsesår", "integer",
  "Ren dokumentation; læses ikke af modellen.",
  K(CFG, r'commissioned: Optional\[int\] = None'), stjerne=[ENHEDER],
  laeses_af_koden=False, avanceret=True)
F(U + "notes", "Noter", "string",
  "Fritekst; læses ikke af modellen.",
  K(CFG, r'notes: str = ""', efter=r"class Unit:"), stjerne=[ENHEDER],
  laeses_af_koden=False)

# --- COP-kurve ---
F(U + "cop_curve", "Varmepumpens ydelse", "object",
  "Valgfri for heat_pump. Overruler alpha. Anbefalet er type table med målte "
  "punkter; uden blokken bruges COP = −1/alpha konstant.",
  K(CFG, r'cop_curve: Optional\[COPCurve\] = None'), stjerne=[ENHEDER],
  gaelder_for=["heat_pump"], blad=False,
  regler=["Kun type heat_pump med fuel electricity."])
F(U + "cop_curve.type", "Ydelsesmodel", "enum",
  "table: målte punkter (udetemperatur, varme, el ved fuld last); varmeloftet "
  "følger temperaturen. linear: COP = a + b·T, klippet, med fast varmeloft "
  "(giver størst eloptag i frost — det omvendte af virkeligheden).",
  K(CFG, r'type: str = "linear"'), stjerne=[ENHEDER], tilladte=["linear", "table"],
  standard="linear", gaelder_for=["heat_pump"])
for felt, std, tekst in (("a", 2.2, "COP ved 0 °C"), ("b", 0.08, "COP-stigning pr. °C"),
                         ("cop_min", 1.8, "Laveste COP"), ("cop_max", 4.0, "Højeste COP")):
    F(U + f"cop_curve.{felt}", f"Lineær kurve: {tekst}", "number",
      "Kun for type linear: COP = clip(a + b·T_ude, cop_min, cop_max).",
      K(CFG, rf'^\s+{felt}: float = '), stjerne=[ENHEDER], standard=std,
      gaelder_for=["heat_pump"], avanceret=True,
      regler=["cop_min > 0 og cop_max > cop_min"] if felt.startswith("cop_") else None)
F(U + "cop_curve.points", "Ydelsestabel (målepunkter)", "list",
  "Liste af {t_ambient (°C), heat_mw, el_mw} ved fuld last, gerne omkring −10, 0 "
  "og +15 °C. Varme og el interpoleres hver for sig; uden for punkterne holdes "
  "yderværdien. Tabellens største eloptag er reservationsloftet i balancemarkedet.",
  K(CFG, r'points: Optional\[list\] = None'), stjerne=[ENHEDER],
  gaelder_for=["heat_pump"],
  eksempel=[{"t_ambient": -10.0, "heat_mw": 12.0, "el_mw": 5.0},
            {"t_ambient": 0.0, "heat_mw": 16.0, "el_mw": 5.5},
            {"t_ambient": 16.0, "heat_mw": 21.0, "el_mw": 6.2}],
  regler=["Mindst to punkter (kun type table).",
          "heat_mw > 0 og el_mw > 0.",
          "COP = heat_mw/el_mw skal ligge i 1–8 (ellers er tal byttet om eller i kW).",
          "Samme udetemperatur må ikke stå to gange."])

# --- balancemarked pr. enhed ---
F(U + "ancillary", "Balancemarked for enheden", "object",
  "Kvalifikation og lofter for enhedens bud. Kun enheder med fuel electricity "
  "byder, uanset flagene.", K(CFG, r'anc = Ancillary\(\*\*u\.get\("ancillary"'),
  stjerne=[ENHEDER], blad=False)
F(U + "ancillary.afrr_qualified", "Prækvalificeret til aFRR", "boolean",
  "Må enheden byde op-regulering i aFRR.", K(CFG, r'afrr_qualified: bool = False'),
  stjerne=[ENHEDER], standard=False, gaelder_for=["heat_pump", "electric_boiler"])
F(U + "ancillary.mfrr_qualified", "Prækvalificeret til mFRR", "boolean",
  "Må enheden byde op-regulering i mFRR.", K(CFG, r'mfrr_qualified: bool = False'),
  stjerne=[ENHEDER], standard=False, gaelder_for=["heat_pump", "electric_boiler"])
F(U + "ancillary.fcr_qualified", "Prækvalificeret til FCR", "boolean",
  "Læses, men bruges ikke: FCR er ikke med i modellen.",
  K(CFG, r'fcr_qualified: bool = False'), stjerne=[ENHEDER], standard=False,
  laeses_af_koden=False, avanceret=True)
for mk, MK in (("afrr", "aFRR"), ("mfrr", "mFRR")):
    F(U + f"ancillary.{mk}_max_bid_mw", f"Maks. {MK}-bud for enheden", "number",
      "Ældre pris-tager-beskyttelse pr. enhed. Ignoreres, når "
      "balancing.ancillary_caps eller shared_reserve_cap_mw er sat.",
      K(CFG, rf'{mk}_max_bid_mw: Optional\[float\] = None'), enhed="MW el",
      stjerne=[ENHEDER], avanceret=True)
F(U + "ancillary.available_from", "Byder fra dato", "string",
  "ISO-dato; før den reserverer enheden intet (fx efter indkøring). Varmedriften "
  "er urørt.", K(CFG, r'available_from: Optional\[str\] = None'),
  stjerne=[ENHEDER], eksempel="2026-03-01", avanceret=True)
F(U + "ancillary.bid_window.months", "Budvindue: måneder", "list",
  "Måneder (1–12, lokal tid), hvor enheden byder. Udeladt = alle. Fx byder mange "
  "værker ikke elkedlen om sommeren.",
  K(BAL, r'months = window\.get\("months"\)'), stjerne=[ENHEDER],
  eksempel=[10, 11, 12, 1, 2, 3])
F(U + "ancillary.bid_window.hours_local", "Budvindue: timer", "list",
  "Timer på døgnet (0–23, dansk lokaltid), hvor enheden byder. Udeladt = alle.",
  K(BAL, r'hours = window\.get\("hours_local"\)'), stjerne=[ENHEDER],
  avanceret=True)

# =============================================================================
# storage
# =============================================================================
F("storage.*", "Varmelager (tank)", "object",
  "Én blok pr. tank eller temperaturlag. Påkrævede felter: volume_m3, delta_t_k, "
  "e_initial_mwh, p_max_charge_mw, p_max_discharge_mw, self_discharge_per_hour.",
  K(CFG, r'for name, s in raw\["storage"\]\.items\(\):'), blad=False,
  stjerne=[LAGRE], regler=["Ukendte felter afvises (Storage(**felter))."])
S = "storage.*."
F(S + "enabled", "Med i modellen", "boolean",
  "false fjerner lageret helt — sådan regnes tankens værdi.",
  K(CFG, r'enabled: bool = True\s+# false → lageret'), stjerne=[LAGRE], standard=True)
F(S + "volume_m3", "Volumen", "number",
  "Tankens vandvolumen. Kapaciteten regnes af volumen og ΔT, hvis e_max_mwh er tom.",
  K(CFG, r'volume_m3: float'), enhed="m³", stjerne=[LAGRE], paakraevet=True,
  regler=["Ændres volumen, skal e_max_mwh være tom, ellers har ændringen ingen virkning."])
F(S + "delta_t_k", "Temperaturdifferens (ΔT)", "number",
  "Forskellen mellem lagerets top og bund. Kapacitet [MWh] = volumen × 1,163 "
  "kWh/(m³·K) × ΔT / 1000.",
  K(CFG, r'delta_t_k: float'), enhed="K", stjerne=[LAGRE], paakraevet=True)
F(S + "e_max_mwh", "Energikapacitet", "number",
  "Tom (null) = regnes af volumen og ΔT (anbefalet). Et tal her vinder over volumen.",
  K(CFG, r'e_max_mwh: Optional\[float\] = None'), enhed="MWh", stjerne=[LAGRE],
  standard=None, avanceret=True)
F(S + "e_initial_mwh", "Indhold ved start", "number",
  "Lagerets indhold i første time. Med cyklusbinding skal lageret ende her.",
  K(CFG, r'e_initial_mwh: float'), enhed="MWh", stjerne=[LAGRE], paakraevet=True,
  min=0, regler=["≥ 0. Er den større end kapaciteten, sættes den automatisk til halvfuld."])
F(S + "p_max_charge_mw", "Maks. ladeeffekt", "number",
  "Største effekt ind i lageret.", K(CFG, r'p_max_charge_mw: float'),
  enhed="MW", stjerne=[LAGRE], paakraevet=True)
F(S + "p_max_discharge_mw", "Maks. afladeeffekt", "number",
  "Største effekt ud af lageret.", K(CFG, r'p_max_discharge_mw: float'),
  enhed="MW", stjerne=[LAGRE], paakraevet=True)
F(S + "self_discharge_per_hour", "Varmetab pr. time", "number",
  "Andel af indholdet, der tabes pr. time (0,0005 = 0,05 %).",
  K(CFG, r'self_discharge_per_hour: float'), enhed="brøk/time", stjerne=[LAGRE],
  paakraevet=True)
F(S + "cycle_binding", "Slut som start", "boolean",
  "Lageret skal ende med samme indhold, som det startede med, så perioden ikke "
  "tærer på et lager, den ikke har betalt for.",
  K(CFG, r'cycle_binding: bool = True'), stjerne=[LAGRE], standard=True)
F(S + "notes", "Noter", "string", "Fritekst; læses ikke af modellen.",
  K(CFG, r'notes: str = ""', efter=r"class Storage:"), stjerne=[LAGRE],
  laeses_af_koden=False)

# =============================================================================
# grid / investment
# =============================================================================
F("grid.max_consumption_mw", "Nettilslutning, maks. eloptag", "number",
  "Loft over det samlede eloptag fra varmepumper og elkedler pr. time. Gælder "
  "også planen uden aktivering og begrænser derfor reservationen. Billund: 33 MW.",
  K(CFG, r'grid_max = grid_raw\.get\("max_consumption_mw"\)'), enhed="MW el",
  min=0, min_eksklusiv=True, avanceret=True,
  regler=["> 0, og casen skal have mindst én aktiv el-enhed."])
F("investment.enabled", "Investeringsmodul", "boolean",
  "Læses, men bruges ikke af modellen i dag. Investeringer regnes som differens "
  "mellem to kørsler.", K(CFG, r'investment_enabled=raw\.get\("investment"'),
  standard=False, laeses_af_koden=False, avanceret=True)

# =============================================================================
# ancillary_groups
# =============================================================================
F("ancillary_groups.*", "Budgruppe", "object",
  "Flere enheder med én fælles budgrænse pr. marked. Ignoreres, når "
  "balancing.ancillary_caps eller shared_reserve_cap_mw er sat.",
  K(CFG, r'for gname, g in raw\.get\("ancillary_groups"'), blad=False,
  stjerne=[{"navn": "gruppe"}], avanceret=True)
F("ancillary_groups.*.units", "Gruppens enheder", "list",
  "Enhedsnavne, der deler grænsen.", K(CFG, r'units: list\[str\]'),
  stjerne=[{"navn": "gruppe"}], avanceret=True, paakraevet=True,
  regler=["Hvert navn skal findes under units."])
for mk, MK in (("afrr", "aFRR"), ("mfrr", "mFRR")):
    F(f"ancillary_groups.*.{mk}_max_bid_mw", f"Gruppens maks. {MK}-bud", "number",
      f"Summen af gruppens {MK}-bud pr. time.",
      K(CFG, rf'{mk}_max_bid_mw: Optional\[float\] = None', efter=r"class AncillaryGroup"),
      enhed="MW el", stjerne=[{"navn": "gruppe"}], avanceret=True)

# =============================================================================
# balancing
# =============================================================================
F("balancing", "Balancemarked", "object",
  "Læses kun ved kørsel med balancering. Uden den er varmeprisen ren spot.",
  K(CFG, r'bal_raw = raw\.get\("balancing"'), blad=False,
  regler=["Kun nøglerne method, bid_strategy, ancillary_caps, reservation_gate, "
          "activation, availability, shared_reserve_cap_mw og robust_reservation er tilladt."])
B = "balancing."
F(B + "method", "Indtægtsmetode", "enum",
  "activation_value (anbefalet): aktiveringsværdien regnes kvarter for kvarter, "
  "så samvariation mellem pris og aktivering fanges. legacy: gennemsnit gange "
  "gennemsnit; undervurderer systematisk.",
  K(CFG, r'balancing_method = bal_raw\.get\("method"'),
  tilladte=["legacy", "activation_value"], standard="legacy",
  regler=["activation_value kræver bid_strategy."])
F(B + "robust_reservation", "Robust reservation", "boolean",
  "Driften skal også holde, hvis buddet ikke aktiveres: varmen fra reserverede "
  "enheder skal kunne afsættes i nettet eller tanken. Standard siden 15/10-2026.",
  K(CFG, r'robust_reservation = bool\('), standard=True)
F(B + "shared_reserve_cap_mw", "Fælles reserveloft (ældre)", "number",
  "Ældre form af det samlede loft. Brug ancillary_caps.total_mw i stedet.",
  K(CFG, r'shared_reserve_cap_mw=raw\.get\("balancing"'), enhed="MW el",
  avanceret=True)
F(B + "bid_strategy.up_markup_dkk_mwh", "Aktiveringsbud: tillæg til spot", "number",
  "Buddet på energi er spot + dette tillæg. Højere tillæg = sjældnere, men "
  "dyrere aktivering. Billund: 500.",
  K(CFG, r'up_markup_dkk_mwh: float$'), enhed="DKK/MWh", paakraevet=True,
  regler=["Påkrævet, når bid_strategy-blokken findes."])
F(B + "bid_strategy.up_markup_max_dkk_mwh", "Aktiveringsbud: øvre bånd", "number",
  "Dokumentation af et øvre bånd; bruges ikke i beregningen.",
  K(CFG, r'up_markup_max_dkk_mwh: Optional\[float\] = None'), enhed="DKK/MWh",
  laeses_af_koden=False, avanceret=True)
F(B + "bid_strategy.down_markdown_dkk_mwh", "Nedreguleringsbud: fradrag", "number",
  "Læses, men bruges ikke: modellen byder kun op-regulering.",
  K(CFG, r'down_markdown_dkk_mwh: Optional\[float\] = None'), enhed="DKK/MWh",
  laeses_af_koden=False, avanceret=True)
F(B + "bid_strategy.down_markdown_max_dkk_mwh", "Nedreguleringsbud: øvre bånd", "number",
  "Læses, men bruges ikke.",
  K(CFG, r'down_markdown_max_dkk_mwh: Optional\[float\] = None'), enhed="DKK/MWh",
  laeses_af_koden=False, avanceret=True)
F(B + "ancillary_caps.per_unit_mw.*", "Prækvalifikation pr. enhed", "number",
  "Største samlede bud (aFRR + mFRR) for enheden pr. time. Håndhæves altid.",
  K(CFG, r'per_unit_mw: dict = field'), enhed="MW el", stjerne=[ENHEDER], min=0,
  regler=["Enhedsnavnet skal findes under units."])
F(B + "ancillary_caps.per_unit_market_mw.*.*", "Bud pr. enhed pr. marked", "number",
  "Værkets egen fordeling af den prækvalificerede effekt mellem aFRR og mFRR.",
  K(CFG, r'per_unit_market_mw: dict = field'), enhed="MW el",
  stjerne=[ENHEDER, MARKED], min=0,
  regler=["Enhedsnavnet skal findes under units.", "Marked er afrr eller mfrr."])
F(B + "ancillary_caps.total_mw", "Samlet prækvalifikation", "number",
  "Største sum af alle bud på tværs af enheder og markeder pr. time.",
  K(CFG, r'total_mw: Optional\[float\] = None'), enhed="MW el", min=0)
F(B + "reservation_gate.enabled", "Kapacitetsprisgate til", "boolean",
  "Byd kun i timer, hvor kapacitetsprisen er over en tærskel (fast eller beregnet).",
  K(CFG, r'enabled: bool = False\s*$', efter=r"class ReservationGate:"), standard=False)
F(B + "reservation_gate.mode", "Gatens virkemåde", "enum",
  "bound: reservationen er højst blokken, når gaten er åben (Spor A, normativ). "
  "driven: reservationen ER blokken, når gaten er åben (fast melding).",
  K(CFG, r"mode: str = \"driven\"\s+# 'driven'"), tilladte=["driven", "bound"],
  standard="driven")
F(B + "reservation_gate.*.cm_threshold_dkk_mw_h", "Fast budpris på kapacitet", "number",
  "Tærskel på day-ahead kapacitetsprisen; gaten er åben, når prisen er mindst denne.",
  K(CFG, r'cm_threshold_dkk_mw_h: Optional\[float\] = None'), enhed="DKK/MW/h",
  stjerne=[MARKED],
  regler=["Sæt enten cm_threshold_dkk_mw_h eller opportunity_cost for markedet."])
F(B + "reservation_gate.*.block_mw", "Blokstørrelse", "number",
  "Den mængde, der reserveres (driven) eller højst reserveres (bound), når gaten er åben.",
  K(CFG, r'block_mw: float = 0\.0'), enhed="MW el", stjerne=[MARKED],
  paakraevet=True, min=0,
  regler=["Med driven må aFRR- og mFRR-blok tilsammen ikke overstige enhedernes "
          "samtidige eloptag, ellers bliver modellen uløselig."])
F(B + "reservation_gate.*.opportunity_cost.reference_unit", "Beregnet budpris: referenceenhed", "string",
  "Den el-enhed, alternativomkostningen regnes for: τ = spot + tarif + afgift + "
  "COP·var_om − COP·(alternativ varmepris).",
  K(BAL, r'ref_navn = mkt_cfg\.opportunity_cost\.get\("reference_unit"\)'),
  stjerne=[MARKED], regler=["Skal være et enhedsnavn under units."])
F(B + "reservation_gate.*.opportunity_cost.floor_dkk_mw_h", "Beregnet budpris: gulv", "number",
  "Laveste budpris uanset beregningen.",
  K(BAL, r'gulv = float\(mkt_cfg\.opportunity_cost\.get\("floor_dkk_mw_h"'),
  enhed="DKK/MW/h", stjerne=[MARKED], standard=0.0)
F(B + "activation.foresight", "Hvad modellen ved, når den byder", "enum",
  "realized: kender de faktiske aktiveringer (kun øvre grænse). profile: "
  "gennemsnit pr. måned og time. trailing30: de seneste 30 døgn. lag24/lag168: "
  "i går / sidste uge.",
  K(CFG, r'foresight: str = "realized"'), tilladte=["realized", "profile", "trailing30", "lag24", "lag168"],
  standard="realized",
  regler=["Andet end realized kræver method activation_value."])
F(B + "activation.settle", "Afregning", "enum",
  "forecast: tallet er prognosens. realized: løs på prognosen, lås "
  "reservationerne, og løs igen på det, der faktisk skete. Virker kun, når "
  "foresight ikke er realized.",
  K(CFG, r'settle: str = "forecast"'), tilladte=["forecast", "realized"],
  standard="forecast")
F(B + "activation.*.model", "Aktiveret andel", "enum",
  "clear: hele buddet aktiveres, når prisen clearer (overvurderer 4–5 gange uden "
  "loft). system_share: andel efter systemets aktivering × k. ramp: andelen "
  "vokser med prisens afstand til buddet.",
  K(CFG, r'model: str = "clear"'), stjerne=[MARKED],
  tilladte=["clear", "system_share", "ramp"], standard="clear",
  regler=["Andet end clear kræver method activation_value."])
F(B + "activation.*.k", "Skalering af systemandel (k)", "number",
  "Kun system_share. Billund/Andeby-kalibrering for aFRR: 4.",
  K(CFG, r'k: float = 1\.0'), stjerne=[MARKED], min=0, min_eksklusiv=True,
  standard=1.0)
F(B + "activation.*.ramp_dkk_mwh", "Rampebredde", "number",
  "Kun ramp: prisafstand over buddet, hvor hele buddet regnes aktiveret.",
  K(CFG, r'ramp_dkk_mwh: Optional\[float\] = None'), enhed="DKK/MWh",
  stjerne=[MARKED], min=0, min_eksklusiv=True, avanceret=True,
  regler=["Påkrævet og > 0 ved model ramp."])
F(B + "availability.enabled", "Månedsloft på reservationen til", "boolean",
  "Værkets faktiske reservation pr. måned som loft (Spor B). Kræver egne "
  "afregningsdata og kan ikke overføres til andre værker eller perioder.",
  K(CFG, r'enabled: bool = False\s*$', efter=r"class Availability:"), standard=False,
  avanceret=True)
F(B + "availability.mode", "Månedsloftets form", "enum",
  "hourly: loft i hver time. energy: loft på månedens MWh; modellen vælger selv timerne.",
  K(CFG, r'mode: str = "hourly"'), tilladte=["hourly", "energy"], standard="hourly",
  avanceret=True)
F(B + "availability.*.mw_by_month.*", "Månedsloft", "number",
  "Reserverede MW for måneden (nøgle ÅÅÅÅ-MM).",
  K(CFG, r'mw_by_month: dict = field'), enhed="MW el",
  stjerne=[MARKED, {"navn": "måned", "format": "ÅÅÅÅ-MM"}], min=0, avanceret=True,
  regler=["Hver måned i perioden skal have et loft, ellers stopper kørslen."])


# =============================================================================
# Enhedstyper
# =============================================================================
def enhedstyper() -> dict:
    faelles_valgfri = ["enabled", "var_om", "uc_enabled", "start_cost",
                       "min_uptime", "min_downtime", "initial_status",
                       "commissioned", "notes"]
    std = {
        "enabled": True, "var_om": 0.0, "start_cost": 0.0, "min_uptime": 1,
        "min_downtime": 1, "co2_emissions_per_mwh_fuel": 0.0, "uc_enabled": False,
        "initial_status": 1, "eta_fuel_to_heat": None, "cop_curve": None,
        "production_profile_path": None,
        "ancillary": {"afrr_qualified": False, "mfrr_qualified": False,
                      "fcr_qualified": False},
    }
    ingen_balance = {"afrr_qualified": False, "mfrr_qualified": False,
                     "fcr_qualified": False}
    typer = {
        "heat_pump": {
            "navn": "Varmepumpe",
            "beskrivelse": "El-forbrugende. COP fra en målt ydelsestabel (anbefalet) "
                           "eller en lineær kurve. Kan byde op-regulering i aFRR/mFRR.",
            "fuel": ["electricity"],
            "paakraevede": ["type", "p_max_heat", "p_min_heat", "alpha", "fuel"],
            "valgfri": faelles_valgfri + ["cop_curve", "ancillary"],
            "irrelevante": ["eta_fuel_to_heat", "co2_emissions_per_mwh_fuel",
                            "production_profile_path"],
            "kan_byde_balance": True,
            "skabelon": {
                "enabled": True, "type": "heat_pump", "p_max_heat": 4.0,
                "p_min_heat": 0.0, "alpha": -0.333, "fuel": "electricity",
                "var_om": 13.4, "start_cost": 0.0, "min_uptime": 1,
                "min_downtime": 1, "uc_enabled": False,
                "cop_curve": {"type": "table", "points": [
                    {"t_ambient": -10.0, "heat_mw": 3.0, "el_mw": 1.25},
                    {"t_ambient": 0.0, "heat_mw": 3.4, "el_mw": 1.17},
                    {"t_ambient": 16.0, "heat_mw": 4.0, "el_mw": 1.18}]},
                "ancillary": {"afrr_qualified": False, "mfrr_qualified": False,
                              "fcr_qualified": False},
            },
            "noter": [
                "alpha bruges kun uden cop_curve: COP = −1/alpha.",
                "Med type table er varmeloftet min(p_max_heat, tabellens varme ved T_ude).",
                "Skabelonens tal er pladsholdere; erstat med målte punkter.",
            ],
        },
        "electric_boiler": {
            "navn": "Elkedel",
            "beskrivelse": "El-forbrugende med COP 1 (alpha −1). Kan byde op-regulering.",
            "fuel": ["electricity"],
            "paakraevede": ["type", "p_max_heat", "p_min_heat", "alpha", "fuel"],
            "valgfri": faelles_valgfri + ["ancillary"],
            "irrelevante": ["eta_fuel_to_heat", "co2_emissions_per_mwh_fuel",
                            "cop_curve", "production_profile_path"],
            "kan_byde_balance": True,
            "skabelon": {
                "enabled": True, "type": "electric_boiler", "p_max_heat": 10.0,
                "p_min_heat": 0.0, "alpha": -1.0, "fuel": "electricity",
                "var_om": 6.7, "start_cost": 0.0, "min_uptime": 1,
                "min_downtime": 1, "uc_enabled": False,
                "ancillary": {"afrr_qualified": False, "mfrr_qualified": False,
                              "fcr_qualified": False},
            },
            "noter": ["alpha skal være −1 (1 MWh el giver 1 MWh varme)."],
        },
        "biomass_boiler": {
            "navn": "Biomassekedel",
            "beskrivelse": "Halm, flis eller træpiller. Typisk grundlast med "
                           "minimumslast og min. driftstid (unit commitment).",
            "fuel": ["straw", "flis", "wood_pellets"],
            "paakraevede": ["type", "p_max_heat", "p_min_heat", "alpha", "fuel",
                            "eta_fuel_to_heat"],
            "valgfri": faelles_valgfri + ["co2_emissions_per_mwh_fuel"],
            "irrelevante": ["cop_curve", "production_profile_path"],
            "kan_byde_balance": False,
            "skabelon": {
                "enabled": True, "type": "biomass_boiler", "p_max_heat": 10.0,
                "p_min_heat": 3.0, "alpha": 0.0, "fuel": "straw",
                "eta_fuel_to_heat": 0.95, "var_om": 30.0, "start_cost": 5000.0,
                "min_uptime": 4, "min_downtime": 6, "uc_enabled": True,
                "initial_status": 0, "ancillary": dict(ingen_balance),
            },
            "noter": [
                "Prisen for brændslet skal stå under prices.",
                "initial_status 1 uden tank kan gøre sommeren uløselig (rapport v4, afsnit 4.4).",
            ],
        },
        "gas_boiler": {
            "navn": "Gaskedel",
            "beskrivelse": "Naturgas, typisk spids og reserve.",
            "fuel": ["natural_gas"],
            "paakraevede": ["type", "p_max_heat", "p_min_heat", "alpha", "fuel",
                            "eta_fuel_to_heat"],
            "valgfri": faelles_valgfri + ["co2_emissions_per_mwh_fuel"],
            "irrelevante": ["cop_curve", "production_profile_path"],
            "kan_byde_balance": False,
            "skabelon": {
                "enabled": True, "type": "gas_boiler", "p_max_heat": 15.0,
                "p_min_heat": 0.0, "alpha": 0.0, "fuel": "natural_gas",
                "eta_fuel_to_heat": 0.95, "var_om": 30.0, "start_cost": 500.0,
                "min_uptime": 1, "min_downtime": 1, "uc_enabled": False,
                "co2_emissions_per_mwh_fuel": 0.2, "ancillary": dict(ingen_balance),
            },
            "noter": ["co2_emissions_per_mwh_fuel ca. 0,2 t/MWh for naturgas."],
        },
        "gas_engine_chp": {
            "navn": "Gasmotor (kraftvarme)",
            "beskrivelse": "Naturgas til el og varme. alpha = el/varme > 0 giver "
                           "elsalg til spot minus produktionstarif. Byder ikke i "
                           "balancemarkedet i modellen.",
            "fuel": ["natural_gas"],
            "paakraevede": ["type", "p_max_heat", "p_min_heat", "alpha", "fuel",
                            "eta_fuel_to_heat"],
            "valgfri": faelles_valgfri + ["co2_emissions_per_mwh_fuel"],
            "irrelevante": ["cop_curve", "production_profile_path"],
            "kan_byde_balance": False,
            "skabelon": {
                "enabled": True, "type": "gas_engine_chp", "p_max_heat": 5.0,
                "p_min_heat": 1.0, "alpha": 0.84, "fuel": "natural_gas",
                "eta_fuel_to_heat": 0.49, "var_om": 60.0, "start_cost": 2000.0,
                "min_uptime": 2, "min_downtime": 2, "uc_enabled": False,
                "initial_status": 0, "co2_emissions_per_mwh_fuel": 0.2,
                "ancillary": dict(ingen_balance),
            },
            "noter": [
                "eta_fuel_to_heat er varmevirkningsgraden alene; elvirkningsgraden ligger i alpha.",
                "Motorernes balanceindtægt er ikke med (README).",
            ],
        },
        "solar_thermal": {
            "navn": "Solvarme",
            "beskrivelse": "Gratis varme; produktionen bindes time for time af en "
                           "profil-CSV (production_profile_path).",
            "fuel": ["solar"],
            "paakraevede": ["type", "p_max_heat", "p_min_heat", "alpha", "fuel"],
            "valgfri": ["enabled", "var_om", "production_profile_path", "notes",
                        "commissioned"],
            "irrelevante": ["eta_fuel_to_heat", "co2_emissions_per_mwh_fuel",
                            "cop_curve", "uc_enabled", "start_cost"],
            "kan_byde_balance": False,
            "skabelon": {
                "enabled": True, "type": "solar_thermal", "p_max_heat": 10.0,
                "p_min_heat": 0.0, "alpha": 0.0, "fuel": "solar", "var_om": 0.0,
                "start_cost": 0.0, "uc_enabled": False,
                "production_profile_path": None, "ancillary": dict(ingen_balance),
            },
            "noter": [
                "Uden profil er loftet p_max_heat hele døgnet hele året — urealistisk; "
                "sæt en profil, der dækker perioden.",
                "Profilstien er relativ til modelrepoets rod (fx data/solar_andeby_dmi_karup.csv).",
            ],
        },
        "waste_heat": {
            "navn": "Overskudsvarme",
            "beskrivelse": "Købt overskudsvarme til en pris pr. MWh (prices.waste_heat).",
            "fuel": ["waste_heat"],
            "paakraevede": ["type", "p_max_heat", "p_min_heat", "alpha", "fuel",
                            "eta_fuel_to_heat"],
            "valgfri": faelles_valgfri,
            "irrelevante": ["cop_curve", "production_profile_path"],
            "kan_byde_balance": False,
            "skabelon": {
                "enabled": True, "type": "waste_heat", "p_max_heat": 3.0,
                "p_min_heat": 0.0, "alpha": 0.0, "fuel": "waste_heat",
                "eta_fuel_to_heat": 1.0, "var_om": 0.0, "start_cost": 0.0,
                "min_uptime": 1, "min_downtime": 1, "uc_enabled": False,
                "ancillary": dict(ingen_balance),
            },
            "noter": [
                "eta_fuel_to_heat er påkrævet af valideringen, men indgår ikke i "
                "omkostningen: prisen bruges direkte pr. MWh varme (model.py).",
            ],
        },
    }
    return {
        "_om": "Enhedstyper i fjernvarmemodellen @ eef950a. Typen er en etiket; "
               "økonomien styres af fuel og alpha. Standardværdier fra src/config.py "
               "(dataclass Unit).",
        "kilde": {
            "dataclass": K(CFG, r'^class Unit:'),
            "validering": K(CFG, r'def __post_init__\(self\):', efter=r'^class Unit:'),
            "typeliste": K("scripts/vaerksark_til_yaml.py", r'TYPER_UDEN_BRAENDSEL = '),
            "marginalomkostning": K(MOD, r'^def compute_marginal_cost'),
        },
        "standardvaerdier": std,
        "braendselsnavne": {"electricity": "El", "solar": "Sol", "natural_gas": "Naturgas", "straw": "Halm",
                            "flis": "Flis", "wood_pellets": "Træpiller", "waste_heat": "Overskudsvarme",
                            "co2_eua": "CO₂-kvoter"},
        "regler": [
            "p_min_heat ≤ p_max_heat (config.py).",
            "fuel ∉ {electricity, solar} kræver eta_fuel_to_heat.",
            "cop_curve kun for type heat_pump med fuel electricity.",
            "Med uc_enabled: initial_status ∈ {0,1}, min_uptime og min_downtime ≥ 1.",
            "Ukendte felter afvises (Unit(**felter)).",
            "Kun fuel electricity kan byde i balancemarkedet (BALANCEMARKED.md).",
        ],
        "typer": typer,
    }


def main() -> None:
    stier = [d["sti"] for d in KATALOG]
    dubletter = sorted({s for s in stier if stier.count(s) > 1})
    if dubletter:
        raise SystemExit(f"FEJL: dublerede stier i kataloget: {dubletter}")
    ud = {
        "_om": ("Felt-katalog for case-YAML i fjernvarmemodellen. Én post pr. "
                "sti-skabelon; '*' står for et frit navn (enhed, lager, bånd …), "
                "se 'stjerne'. 'kilde' er fil:linje ved model_commit. "
                "Genereres af viden/vaerktoej/byg_felt_katalog.py — ret dér, ikke her."),
        "model_commit": COMMIT,
        "antal": len(KATALOG),
        "felter": KATALOG,
    }
    (VIDEN / "felt_katalog.json").write_text(
        json.dumps(ud, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (VIDEN / "enhedstyper.json").write_text(
        json.dumps(enhedstyper(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"felt_katalog.json: {len(KATALOG)} poster "
          f"({sum(d['blad'] for d in KATALOG)} blade)")
    print("enhedstyper.json: skrevet")


if __name__ == "__main__":
    main()
