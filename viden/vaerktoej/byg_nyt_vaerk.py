"""Bygger viden/nyt_vaerk_skabelon.json: et minimalt gyldigt værk som blade (guiden "Nyt værk fra bunden").

Runde 8 (fv-trofast): skabelonen tager sine tal fra modelrepoet ved den pinnede commit, via
``viden/modelspejl.json`` (genereret af ``byg_modelspejl.py``), og hvert blad bærer sin kilde:

* Varmelasten skaleres med **modelrepoets egen regel** for et årsbehov G (GWh), den samme som værksarket
  bruger: ``f = round(G / 100, 4)`` × Andebys grundtal, gaf/nettab afrundet til 4 og døgnprofilen til
  3 decimaler (``scripts/vaerksark_til_yaml.py:1581-1592``). Før runde 8 brugte guiden G/105,52 (en egen
  måling), som gav 5,2 % anden last end arket for samme G.
* Priser, tarif, klima, tidsblok, solver og gaskedlens egenskaber er **Andebys** (``cases/andeby.yaml``).
* Kun to ting er appens egne antagelser og mærket sådan: standardårsbehovet (50 GWh) og gaskedlens
  størrelse ``round(0,5 × G)`` MW (spidslasten er ca. 0,40 × G MW med modellens skalering).

Kør:  python byg_nyt_vaerk.py            (standard G = 50 GWh)
Kun standardbiblioteket.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
VIDEN = Path(__file__).resolve().parent.parent

SPEJL = json.loads((VIDEN / "modelspejl.json").read_text(encoding="utf-8"))
PIN7 = SPEJL["model_commit"][:7]
ANDEBY = SPEJL["cases"]["andeby"]
SKAL = SPEJL["varmelast_skalering"]
G_STANDARD = 50.0                   # egen antagelse: et mellemstort værk
#: Andebys spidslast med f = 1 (egen måling D11, karup-vejr jul 2025–jun 2026, eef950a). Den syntetiske last er
#: Andebys × f, så spidslasten er ca. 40,02 × f MW — med den FAKTISK genererede f (K8 F2: ved G ≤ 1 er f = 1).
SPIDS_VED_F1 = 40.02
GASKEDEL_VED_F1 = 50.0              # egen antagelse: kedlen = round(50 × f) MW, ca. 25 % luft over spidslasten


def andeby(sti: str):
    """(værdi, kilde) for et blad i Andeby ved den pinnede commit."""
    v, linje = ANDEBY["blade"][sti]
    return json.loads(v), f"{ANDEBY['fil']}:{linje} @ {PIN7}"


def faktor(g_gwh: float) -> float:
    """Modelrepoets faktor (scripts/vaerksark_til_yaml.py), hele reglen fra spejlet: round(G / divisor, afrunding),
    når betingelsen holder (i dag G > 1), ellers else-værdien (i dag 1,0)."""
    b = SKAL["betingelse"]
    holder = g_gwh > b["graense"] if b["op"] == ">" else g_gwh >= b["graense"]
    return round(g_gwh / SKAL["divisor_gwh"], SKAL["afrunding"]) if holder else SKAL["ellers"]


def varmelast(g_gwh: float) -> dict:
    f, d = faktor(g_gwh), SKAL["decimaler"]
    return {
        "gaf_mw_per_k": round(SKAL["gaf_mw_per_k"] * f, d["heat_load_params.gaf_mw_per_k"]),
        "nettab_slope_mw_per_k": round(SKAL["nettab_slope_mw_per_k"] * f, d["heat_load_params.nettab_slope_mw_per_k"]),
        "baseline_profile_mw": [round(x * f, d["heat_load_params.baseline_profile_mw"]) for x in SKAL["baseline_profile_mw"]],
    }


def blade(g_gwh: float = G_STANDARD, kode: str = "nyt_vaerk", navn: str = "Nyt værk") -> list[dict]:
    """Bladliste (sti, vaerdi, bekraeft, obligatorisk, trin, kommentar, kilde) for et værk på G GWh/år."""
    B: list[dict] = []
    skal_kilde = f"{SKAL['kilde']} @ {PIN7} (modelrepoets skalering af Andeby til et årsbehov)"

    def b(sti, v, trin, bekraeft=False, obligatorisk=True, kommentar=None, kilde=None):
        tekst = " ".join(x for x in (kommentar, f"Kilde: {kilde}." if kilde else None) if x) or None
        B.append({"sti": sti, "vaerdi_json": json.dumps(v, ensure_ascii=False, separators=(",", ":")),
                  "bekraeft": bekraeft, "obligatorisk": obligatorisk, "trin": trin, "kommentar": tekst,
                  "kilde": kilde})

    def a(sti, trin, andeby_sti=None, **kw):
        v, k = andeby(andeby_sti or sti)
        b(sti, v, trin, kilde=f"Andeby, {k}", **kw)

    # 1 navn
    b("meta.case_name", kode, "navn", kommentar="Værkets kode; bruges i outputfilernes navn.")
    b("meta.titel", navn, "navn", obligatorisk=False)
    b("meta.description", f"Oprettet fra skabelon: én gaskedel, intet lager, {g_gwh:g} GWh/år.", "navn", obligatorisk=False)
    a("meta.timezone_internal", "navn", obligatorisk=False, kommentar="Dokumentation; læses ikke af modellen.")
    a("meta.timezone_reporting", "navn", obligatorisk=False)
    a("meta.discount_rate_real", "navn", bekraeft=True, obligatorisk=False,
      kommentar="Real kalkulationsrente til annuitet; læses ikke af modellen.")
    # 2 klima og priszone
    a("data.dmi_area", "klima", bekraeft=True, kommentar="Vælg efter beliggenhed: vestkyst, karup, fyn, ringsted.")
    a("data.price_zone", "klima", bekraeft=True, kommentar="DK1 vest for Storebælt, DK2 øst for.")
    a("electricity.spot_area", "klima", bekraeft=True, kommentar="Skal være lig data.price_zone.")
    # tid og solver (faste)
    a("time.start", "tid", kommentar="Rullende år; dækket af df-data.")
    a("time.end", "tid")
    a("time.resolution", "tid", kommentar="Version 1 kører kun 1h (KONTRAKT §6c).")
    a("solver.mip_rel_gap", "tid", obligatorisk=False)
    a("solver.mip_abs_gap", "tid", obligatorisk=False)
    a("solver.time_limit", "tid", obligatorisk=False)
    # 3 varmebehov: modelrepoets skalering (som værksarket); de uskalerede parametre er Andebys
    hl = varmelast(g_gwh)
    for k in ("gaf_mw_per_k", "t_ref", "thermal_inertia_hours", "nettab_slope_mw_per_k", "t_net", "baseline_profile_mw", "weekly_dip"):
        sti = f"heat_load_params.{k}"
        if k in hl:
            b(sti, hl[k], "varmebehov", bekraeft=True, obligatorisk=(k == "gaf_mw_per_k"),
              kommentar=f"Andeby × f, f = round({g_gwh:g}/{SKAL['divisor_gwh']:g}, {SKAL['afrunding']}) = {faktor(g_gwh):g}.",
              kilde=skal_kilde)
        else:
            a(sti, "varmebehov", obligatorisk=False)
    b("heat_load_params._source", f"Skabelon: Andeby × round({g_gwh:g}/{SKAL['divisor_gwh']:g}, {SKAL['afrunding']}) "
      f"(modelrepoets skalering, {SKAL['kilde']})", "varmebehov", obligatorisk=False)
    # 4 enheder: én gaskedel med Andebys gaskedels egenskaber; kun størrelsen er appens antagelse
    u, ua = "units.gaskedel.", "units.gaskedel_agg."
    b(u + "enabled", True, "enheder")
    a(u + "type", "enheder", ua + "type")
    f = faktor(g_gwh)
    b(u + "p_max_heat", float(max(1, round(GASKEDEL_VED_F1 * f))), "enheder", bekraeft=True,
      kommentar=f"Skal dække spidslasten (ca. {SPIDS_VED_F1 * f:.1f} MW ved {g_gwh:g} GWh, f = {f:g}).",
      kilde=f"egen antagelse: round({GASKEDEL_VED_F1:g} × f) MW; spidslasten ca. {SPIDS_VED_F1:g} × f MW "
            f"(egen måling: Andeby 40,02 MW med f = 1, D11 ved {PIN7})")
    for k in ("p_min_heat", "alpha", "fuel", "eta_fuel_to_heat", "var_om", "start_cost", "min_uptime",
              "min_downtime", "uc_enabled", "co2_emissions_per_mwh_fuel"):
        a(u + k, "enheder", ua + k, bekraeft=k in ("eta_fuel_to_heat", "var_om"),
          obligatorisk=k in ("p_min_heat", "alpha", "fuel", "eta_fuel_to_heat"))
    for k in ("afrr_qualified", "mfrr_qualified", "fcr_qualified"):
        a(u + f"ancillary.{k}", "enheder", ua + f"ancillary.{k}", obligatorisk=False)
    # 5 lager: intet (tom blok er et blad, KONTRAKT §3.2)
    b("storage", {}, "lager", kommentar="Intet lager. Blokken skal findes (config.py læser raw['storage']).")
    # 6 priser og tarif: Andebys
    a("prices.natural_gas.value", "priser", bekraeft=True, kommentar="Ekskl. moms pr. MWh brændsel.")
    a("prices.natural_gas.unit", "priser", obligatorisk=False)
    a("prices.co2_eua.value", "priser", bekraeft=True, kommentar="Kr. pr. ton CO₂; 0 hvis gasprisen indeholder CO₂-afgiften.")
    a("prices.co2_eua.unit", "priser", obligatorisk=False)
    a("electricity.tariff_consumption_flat", "priser", bekraeft=True)
    a("electricity.tariff_production_flat", "priser", bekraeft=True)
    a("electricity.electricity_tax", "priser", bekraeft=True, kommentar="Skal være lig fixed_components.elafgift_net.")
    T = "electricity.tariff_consumption."
    a(T + "unit", "priser")
    b(T + "source", "Andebys bånd (fiktivt netselskab) — erstat med jeres prisblad", "priser", obligatorisk=False)
    for sti in sorted(s for s in ANDEBY["blade"] if s.startswith(T + "fixed_components.")):
        a(sti, "priser", bekraeft=True, obligatorisk=False)
    for sti in [s for s in ANDEBY["blade"] if s.startswith(T + "net_tariff.")]:
        a(sti, "priser", bekraeft=True, obligatorisk=sti.startswith(T + "net_tariff.bands."))
    return B


def main() -> None:
    bl = blade()
    ud = {
        "_om": ("Minimalt gyldigt værk som blade (KONTRAKT §3.2): én gaskedel, intet lager, varmelast skaleret fra et årligt "
                "varmebehov med modelrepoets egen regel. Genereres af viden/vaerktoej/byg_nyt_vaerk.py fra viden/modelspejl.json; "
                "valideret af vaerktoej/tjek_nyt_vaerk.py (afflad -> modellens load_case -> 2-døgns kørsel) og "
                "tjek_trofasthed.py. 'kilde' pr. blad: modelrepoet (fil:linje @ commit) eller 'egen antagelse'. "
                "bekraeft = skønnet værdi, som skal rettes."),
        "model_commit": SPEJL["model_commit"],
        "standard_varmebehov_gwh": G_STANDARD,
        "skalering": {
            "divisor_gwh": SKAL["divisor_gwh"],
            "afrunding": SKAL["afrunding"],
            "profil_afrunding": SKAL["profil_afrunding"],
            "betingelse": SKAL["betingelse"],
            "ellers": SKAL["ellers"],
            "grundtal": {
                "heat_load_params.gaf_mw_per_k": SKAL["gaf_mw_per_k"],
                "heat_load_params.nettab_slope_mw_per_k": SKAL["nettab_slope_mw_per_k"],
                "heat_load_params.baseline_profile_mw": SKAL["baseline_profile_mw"],
            },
            "decimaler": SKAL["decimaler"],
            "kilde": f"{SKAL['kilde']} @ {PIN7} (grundtal {SKAL['kilde_grundtal']})",
            "formel": {
                "faktor": (f"f = round(G / {SKAL['divisor_gwh']:g}, {SKAL['afrunding']}) når G {SKAL['betingelse']['op']} "
                           f"{SKAL['betingelse']['graense']:g}, ellers f = {SKAL['ellers']:g}"),
                "heat_load_params.gaf_mw_per_k": f"round({SKAL['gaf_mw_per_k']} × f, 4)",
                "heat_load_params.nettab_slope_mw_per_k": f"round({SKAL['nettab_slope_mw_per_k']} × f, 4)",
                "heat_load_params.baseline_profile_mw": f"Andebys 24 værdier × f, {SKAL['profil_afrunding']} decimaler",
                "uændret": "t_ref, thermal_inertia_hours, t_net og weekly_dip som Andeby",
                "units.gaskedel.p_max_heat": (f"rund({GASKEDEL_VED_F1:g} × f) MW "
                                              f"(spidslast ≈ {str(SPIDS_VED_F1).replace('.', ',')} × f MW) — egen antagelse"),
            },
            "hvorfor": ("Samme regel som modelrepoets værksark (scripts/vaerksark_til_yaml.py), så samme årsbehov giver samme "
                        "varmelast, uanset om værket kommer fra arket eller guiden. Reglen hviler på 'Andebys ~100 GWh'; Andebys "
                        "parametre giver 105,52 GWh på karup-vejret jul 2025–jun 2026 (egen måling, D11) — den syntetiske last "
                        "bliver altså ca. 5,5 % over G. Det er modelrepoets valg, og appen følger det."),
            "forbehold": "Har værket målt varmelast, er den bedre end syntesen (doc/VARMELAST_OG_NETTAB.md).",
        },
        "egne_antagelser": [
            f"Standardårsbehov {G_STANDARD:g} GWh (et mellemstort værk; brugeren skriver sit eget).",
            f"Gaskedlens størrelse round({GASKEDEL_VED_F1:g} × f) MW, så den dækker spidslasten (ca. {SPIDS_VED_F1:g} × f MW; "
            "f er modelrepoets faktor, G/100 over 1 GWh og 1 derunder).",
            "Kun én gaskedel og intet lager: det mindste værk, modellen kan løse.",
        ],
        "guide_trin": [
            {"id": "navn", "titel": "Navn og kode", "felter": ["meta.case_name", "meta.titel"], "regel": "kode: små bogstaver, tal og _ (KONTRAKT §3.1); unik."},
            {"id": "klima", "titel": "Klima og priszone", "felter": ["data.dmi_area", "data.price_zone", "electricity.spot_area"], "regel": "spot_area sættes lig price_zone automatisk."},
            {"id": "varmebehov", "titel": "Varmebehov", "felter": ["heat_load_params.*"], "regel": "Årligt varmebehov ab værk i GWh → parametrene med modelrepoets skalering (som værksarket). 'Jeg har timedata': kun filer i modelrepoets data/ i denne version; heat_load_params skal stadig findes (run_case.py:377)."},
            {"id": "enheder", "titel": "Enheder", "felter": ["units.*"], "regel": f"Mindst én aktiv enhed; tilsammen skal de kunne dække spidslasten (ca. {str(SPIDS_VED_F1).replace('.', ',')} MW × f). Tilføj fra enhedstyper.json; skabelonens gaskedel kan beholdes som spids/reserve."},
            {"id": "lager", "titel": "Lager (valgfrit)", "felter": ["storage.*"], "regel": "Tom = intet lager. Et lager har volumen, ΔT, startindhold og lade-/afladeeffekt."},
            {"id": "priser", "titel": "Priser og tarif", "felter": ["prices.*", "electricity.*"], "regel": "Forudfyldt med Andebys tal og markeret [BEKRÆFT]. Pris skal findes for hvert brændsel, en aktiv enhed bruger; elafgift = elafgift_net."},
            {"id": "gennemse", "titel": "Gennemse og opret", "felter": [], "regel": "Kør klientvalideringen (validering.md) på hele bladlisten; vis antal [BEKRÆFT]."},
            {"id": "efter", "titel": "Efter oprettelse", "felter": [], "regel": "Liste over [BEKRÆFT]-felter + 'Bestil en prøvekørsel (2 døgn)': 5.–6. januar 2026 uden balancemarked, gab 0,0002/100 kr."}
        ],
        "obligatoriske_felter": {
            "_om": "Uden disse afviser modellen værket (validering.md). 'enabled' og ancillary er ikke strengt påkrævet (standarder), men skrives altid, så til/fra virker i scenarier (K3-N5).",
            "altid": ["meta.case_name", "data.dmi_area", "data.price_zone", "time.start", "time.end", "time.resolution",
                      "heat_load_params.gaf_mw_per_k", "prices.co2_eua.value", "electricity.spot_area",
                      "electricity.tariff_consumption_flat", "electricity.tariff_production_flat", "electricity.electricity_tax",
                      "storage (blokken, evt. tom)", "units.<n> (mindst én aktiv)"],
            "pr_enhed": ["type", "p_max_heat", "p_min_heat", "alpha", "fuel", "eta_fuel_to_heat (når fuel ikke er electricity/solar)"],
            "pr_lager": ["volume_m3", "delta_t_k", "e_initial_mwh", "p_max_charge_mw", "p_max_discharge_mw", "self_discharge_per_hour"],
            "pr_braendsel_i_brug": ["prices.<brændsel>.value"],
            "hvis_tarifprofil": ["electricity.tariff_consumption.unit", "…net_tariff.bands.*", "…net_tariff.seasons.*.months/weekday/weekend (alle 12 måneder, alle 24 timer)", "…fixed_components.elafgift_net = electricity_tax"],
            "kilde": "src/config.py:906-1165; src/tariff.py:110-161; src/data_loader.py:805-809"
        },
        "blade": bl,
    }
    (VIDEN / "nyt_vaerk_skabelon.json").write_text(json.dumps(ud, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"nyt_vaerk_skabelon.json: {len(bl)} blade, {sum(x['bekraeft'] for x in bl)} [BEKRÆFT], "
          f"{sum(x['obligatorisk'] for x in bl)} obligatoriske, "
          f"{sum(1 for x in bl if (x['kilde'] or '').startswith('egen antagelse'))} egne antagelser")


if __name__ == "__main__":
    main()
