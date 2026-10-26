"""Bygger viden/nyt_vaerk_skabelon.json: et minimalt gyldigt værk som blade.

Ét gaskedel-værk uden lager, med varmelast skaleret fra et årligt varmebehov G
(GWh). Varmelastsyntesen er lineær i grundprofil, rumvarme- og nettabshældning
(src/data_loader.py:632-661), så parametrene skaleres eksakt fra Andebys:

    faktor = G / G_ANDEBY,  G_ANDEBY = 105,52 GWh (målt, karup, jul 2025–jun 2026)

Gaskedlens effekt skal dække spidslasten: Andeby 40,02 MW ved 105,52 GWh
(0,379 MW pr. GWh) -> p_max = rund(0,5 × G) MW giver ca. 30 % luft.

Kør:  python byg_nyt_vaerk.py            (standard G = 50 GWh)
Kun standardbiblioteket.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
VIDEN = Path(__file__).resolve().parent.parent

G_ANDEBY = 105.52          # GWh, målt på D11 (fv-ekspert.md)
SPIDS_PR_GWH = 40.02 / G_ANDEBY
ANDEBY = {
    "gaf_mw_per_k": 0.7653,
    "nettab_slope_mw_per_k": 0.4768,
    "baseline_profile_mw": [4.437, 4.500, 4.602, 4.767, 4.822, 5.112, 5.590, 5.606, 5.355, 4.955, 4.775, 4.696,
                            4.563, 4.469, 4.414, 4.359, 4.430, 4.602, 4.728, 4.767, 4.735, 4.728, 4.610, 4.390],
}
G_STANDARD = 50.0


def varmelast(g_gwh: float) -> dict:
    f = g_gwh / G_ANDEBY
    return {
        "gaf_mw_per_k": round(ANDEBY["gaf_mw_per_k"] * f, 4),
        "t_ref": 15.0,
        "thermal_inertia_hours": 24,
        "nettab_slope_mw_per_k": round(ANDEBY["nettab_slope_mw_per_k"] * f, 4),
        "t_net": 12.0,
        "baseline_profile_mw": [round(x * f, 3) for x in ANDEBY["baseline_profile_mw"]],
        "weekly_dip": 0.02,
    }


def gaskedel_effekt(g_gwh: float) -> float:
    return float(max(1, round(0.5 * g_gwh)))


def blade(g_gwh: float = G_STANDARD, kode: str = "nyt_vaerk", navn: str = "Nyt værk") -> list[dict]:
    """Bladliste (sti, vaerdi, bekraeft, obligatorisk, trin, kommentar) for et værk på G GWh/år."""
    hl = varmelast(g_gwh)
    B: list[dict] = []

    def b(sti, v, trin, bekraeft=False, obligatorisk=True, kommentar=None):
        B.append({"sti": sti, "vaerdi_json": json.dumps(v, ensure_ascii=False, separators=(",", ":")),
                  "bekraeft": bekraeft, "obligatorisk": obligatorisk, "trin": trin, "kommentar": kommentar})

    # 1 navn
    b("meta.case_name", kode, "navn", kommentar="Værkets kode; bruges i outputfilernes navn.")
    b("meta.titel", navn, "navn", obligatorisk=False)
    b("meta.description", f"Oprettet fra skabelon: én gaskedel, intet lager, {g_gwh:g} GWh/år.", "navn", obligatorisk=False)
    b("meta.timezone_internal", "UTC", "navn", obligatorisk=False, kommentar="Dokumentation; læses ikke af modellen.")
    b("meta.timezone_reporting", "Europe/Copenhagen", "navn", obligatorisk=False)
    b("meta.discount_rate_real", 0.035, "navn", bekraeft=True, obligatorisk=False,
      kommentar="Real kalkulationsrente til annuitet; læses ikke af modellen (som Andeby).")
    # 2 klima og priszone
    b("data.dmi_area", "karup", "klima", bekraeft=True, kommentar="Vælg efter beliggenhed: vestkyst, karup, fyn, ringsted.")
    b("data.price_zone", "DK1", "klima", bekraeft=True, kommentar="DK1 vest for Storebælt, DK2 øst for.")
    b("electricity.spot_area", "DK1", "klima", bekraeft=True, kommentar="Skal være lig data.price_zone.")
    # tid og solver (faste)
    b("time.start", "2025-07-01T00:00:00Z", "tid", kommentar="Rullende år; dækket af df-data.")
    b("time.end", "2026-06-30T23:00:00Z", "tid")
    b("time.resolution", "1h", "tid", kommentar="Version 1 kører kun 1h (KONTRAKT §6c).")
    b("solver.mip_rel_gap", 0.001, "tid", obligatorisk=False, kommentar="Som Andeby.")
    b("solver.mip_abs_gap", 1000.0, "tid", obligatorisk=False)
    b("solver.time_limit", 3600.0, "tid", obligatorisk=False)
    # 3 varmebehov
    for k, v in hl.items():
        b(f"heat_load_params.{k}", v, "varmebehov", bekraeft=k in ("gaf_mw_per_k", "nettab_slope_mw_per_k", "baseline_profile_mw"),
          obligatorisk=(k == "gaf_mw_per_k"),
          kommentar=(f"Skaleret fra Andeby × {g_gwh:g}/{G_ANDEBY}" if k in ("gaf_mw_per_k", "nettab_slope_mw_per_k", "baseline_profile_mw") else None))
    b("heat_load_params._source", f"Skabelon: Andeby × {g_gwh:g}/{G_ANDEBY} GWh", "varmebehov", obligatorisk=False)
    # 4 enheder: én gaskedel
    u = "units.gaskedel."
    b(u + "enabled", True, "enheder")
    b(u + "type", "gas_boiler", "enheder")
    b(u + "p_max_heat", gaskedel_effekt(g_gwh), "enheder", bekraeft=True,
      kommentar=f"Skal dække spidslasten (ca. {SPIDS_PR_GWH * g_gwh:.1f} MW ved {g_gwh:g} GWh); 0,5 MW pr. GWh giver luft.")
    b(u + "p_min_heat", 0.0, "enheder")
    b(u + "alpha", 0.0, "enheder")
    b(u + "fuel", "natural_gas", "enheder")
    b(u + "eta_fuel_to_heat", 0.95, "enheder", bekraeft=True)
    b(u + "var_om", 30.0, "enheder", bekraeft=True, obligatorisk=False)
    b(u + "start_cost", 0.0, "enheder", obligatorisk=False)
    b(u + "min_uptime", 1, "enheder", obligatorisk=False)
    b(u + "min_downtime", 1, "enheder", obligatorisk=False)
    b(u + "uc_enabled", False, "enheder", obligatorisk=False)
    b(u + "co2_emissions_per_mwh_fuel", 0.2, "enheder", obligatorisk=False, kommentar="Naturgas ca. 0,2 t CO₂/MWh brændsel.")
    b(u + "ancillary.afrr_qualified", False, "enheder", obligatorisk=False)
    b(u + "ancillary.mfrr_qualified", False, "enheder", obligatorisk=False)
    b(u + "ancillary.fcr_qualified", False, "enheder", obligatorisk=False)
    # 5 lager: intet (tom blok er et blad, KONTRAKT §3.2)
    b("storage", {}, "lager", kommentar="Intet lager. Blokken skal findes (config.py læser raw['storage']).")
    # 6 priser og tarif
    b("prices.natural_gas.value", 606.0, "priser", bekraeft=True, kommentar="Andebys gaspris; ekskl. moms pr. MWh brændsel.")
    b("prices.natural_gas.unit", "DKK/MWh_fuel", "priser", obligatorisk=False)
    b("prices.co2_eua.value", 600.0, "priser", bekraeft=True, kommentar="Kr. pr. ton CO₂; 0 hvis gasprisen indeholder CO₂-afgiften.")
    b("prices.co2_eua.unit", "DKK/t_CO2", "priser", obligatorisk=False)
    b("electricity.tariff_consumption_flat", 125.0, "priser", bekraeft=True)
    b("electricity.tariff_production_flat", 4.1, "priser", bekraeft=True)
    b("electricity.electricity_tax", 4.0, "priser", bekraeft=True, kommentar="Skal være lig fixed_components.elafgift_net.")
    T = "electricity.tariff_consumption."
    b(T + "unit", "kr_per_mwh", "priser")
    b(T + "source", "Andebys bånd (fiktivt netselskab) — erstat med jeres prisblad", "priser", obligatorisk=False)
    for k, v in (("energinet", 115.0), ("dv", 0.0), ("elafgift_net", 4.0)):
        b(T + f"fixed_components.{k}", v, "priser", bekraeft=True, obligatorisk=False)
    for k, v in (("lav", 7.4), ("hoej", 14.8), ("spids", 29.5)):
        b(T + f"net_tariff.bands.{k}", v, "priser", bekraeft=True)
    S = T + "net_tariff.seasons."
    b(S + "vinter.months", [10, 11, 12, 1, 2, 3], "priser", bekraeft=True)
    for k, v in (("00-06", "lav"), ("06-21", "spids"), ("21-24", "hoej")):
        b(S + f"vinter.weekday.{k}", v, "priser", bekraeft=True)
    for k, v in (("00-06", "lav"), ("06-21", "hoej"), ("21-24", "hoej")):
        b(S + f"vinter.weekend.{k}", v, "priser", bekraeft=True)
    b(S + "sommer.months", [4, 5, 6, 7, 8, 9], "priser", bekraeft=True)
    for k, v in (("00-06", "lav"), ("06-24", "hoej")):
        b(S + f"sommer.weekday.{k}", v, "priser", bekraeft=True)
    for k, v in (("00-06", "lav"), ("06-24", "lav")):
        b(S + f"sommer.weekend.{k}", v, "priser", bekraeft=True)
    return B


def main() -> None:
    bl = blade()
    ud = {
        "_om": ("Minimalt gyldigt værk som blade (KONTRAKT §3.2): én gaskedel, intet lager, varmelast skaleret fra et årligt "
                "varmebehov. Genereres af viden/vaerktoej/byg_nyt_vaerk.py; valideret af vaerktoej/tjek_nyt_vaerk.py "
                "(afflad -> modellens load_case -> 2-døgns kørsel). bekraeft = skønnet værdi, som skal rettes."),
        "model_commit": "eef950a2ac7b3808a9456dcf48742ce08e52366a",
        "standard_varmebehov_gwh": G_STANDARD,
        "skalering": {
            "g_andeby_gwh": G_ANDEBY,
            "kilde": "Målt: Andebys heat_load_params giver 105,52 GWh på jul 2025–jun 2026 med karup-vejr, spidslast 40,02 MW ved −18,25 °C (D11, udviklingsrapport). Rapport v4 §9 siger 'ca. 105 GWh'.",
            "formel": {
                "faktor": "f = G / 105,52",
                "heat_load_params.gaf_mw_per_k": "0,7653 × f",
                "heat_load_params.nettab_slope_mw_per_k": "0,4768 × f",
                "heat_load_params.baseline_profile_mw": "Andebys 24 værdier × f (cases/andeby.yaml:158-162)",
                "uændret": "t_ref 15, thermal_inertia_hours 24, t_net 12, weekly_dip 0,02",
                "units.gaskedel.p_max_heat": "rund(0,5 × G) MW (spidslast ≈ 0,38 × G MW)"
            },
            "hvorfor_eksakt": "Syntesen er grundprofil + gaf × max(0, t_ref − glidende T) + nettab × max(0, t_net − T), og weekend-faktoren ganges på; alle tre led er lineære i de skalerede parametre, så årsenergien skalerer med f for samme vejr (src/data_loader.py:632-661; src/data_loader.py:712-729).",
            "forbehold": "Faktoren gælder karup-vejret i det rullende år. Et andet DMI-område giver nogle procent andet årsbehov (README.md:235-237); har værket målt varmelast, er den bedre."
        },
        "guide_trin": [
            {"id": "navn", "titel": "Navn og kode", "felter": ["meta.case_name", "meta.titel"], "regel": "kode: små bogstaver, tal og _ (KONTRAKT §3.1); unik."},
            {"id": "klima", "titel": "Klima og priszone", "felter": ["data.dmi_area", "data.price_zone", "electricity.spot_area"], "regel": "spot_area sættes lig price_zone automatisk."},
            {"id": "varmebehov", "titel": "Varmebehov", "felter": ["heat_load_params.*"], "regel": "Årligt varmebehov ab værk i GWh → parametrene efter formlen. 'Jeg har timedata': kun filer i modelrepoets data/ i denne version; heat_load_params skal stadig findes (run_case.py:377)."},
            {"id": "enheder", "titel": "Enheder", "felter": ["units.*"], "regel": "Mindst én aktiv enhed; tilsammen skal de kunne dække spidslasten (ca. 0,38 MW pr. GWh/år). Tilføj fra enhedstyper.json; skabelonens gaskedel kan beholdes som spids/reserve."},
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
    (VIDEN / "nyt_vaerk_skabelon.json").write_text(json.dumps(ud, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"nyt_vaerk_skabelon.json: {len(bl)} blade, {sum(x['bekraeft'] for x in bl)} [BEKRÆFT], "
          f"{sum(x['obligatorisk'] for x in bl)} obligatoriske")


if __name__ == "__main__":
    main()
