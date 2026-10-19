//-----------------------------------------------------------------------
// GENERERET af _byg/byg_katalog.py fra viden/nyt_vaerk_skabelon.json
// (fv-ekspert). Ret ikke i hånden. 67 blade, model b49aeb0.
//-----------------------------------------------------------------------

import type { NytVaerkSkabelon } from "./nyt-vaerk";

export const NYT_VAERK_SKABELON: NytVaerkSkabelon | null = {
 "blade": [
  {
   "sti": "meta.case_name",
   "vaerdi_json": "\"nyt_vaerk\"",
   "bekraeft": false,
   "kommentar": "Værkets kode; bruges i outputfilernes navn."
  },
  {
   "sti": "meta.titel",
   "vaerdi_json": "\"Nyt værk\"",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "meta.description",
   "vaerdi_json": "\"Oprettet fra skabelon: én gaskedel, intet lager, 50 GWh/år.\"",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "meta.timezone_internal",
   "vaerdi_json": "\"UTC\"",
   "bekraeft": false,
   "kommentar": "Dokumentation; læses ikke af modellen."
  },
  {
   "sti": "meta.timezone_reporting",
   "vaerdi_json": "\"Europe/Copenhagen\"",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "meta.discount_rate_real",
   "vaerdi_json": "0.035",
   "bekraeft": true,
   "kommentar": "Real kalkulationsrente til annuitet; læses ikke af modellen (som Andeby)."
  },
  {
   "sti": "data.dmi_area",
   "vaerdi_json": "\"karup\"",
   "bekraeft": true,
   "kommentar": "Vælg efter beliggenhed: vestkyst, karup, fyn, ringsted."
  },
  {
   "sti": "data.price_zone",
   "vaerdi_json": "\"DK1\"",
   "bekraeft": true,
   "kommentar": "DK1 vest for Storebælt, DK2 øst for."
  },
  {
   "sti": "electricity.spot_area",
   "vaerdi_json": "\"DK1\"",
   "bekraeft": true,
   "kommentar": "Skal være lig data.price_zone."
  },
  {
   "sti": "time.start",
   "vaerdi_json": "\"2025-07-01T00:00:00Z\"",
   "bekraeft": false,
   "kommentar": "Rullende år; dækket af df-data."
  },
  {
   "sti": "time.end",
   "vaerdi_json": "\"2026-06-30T23:00:00Z\"",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "time.resolution",
   "vaerdi_json": "\"1h\"",
   "bekraeft": false,
   "kommentar": "Version 1 kører kun 1h (KONTRAKT §6c)."
  },
  {
   "sti": "solver.mip_rel_gap",
   "vaerdi_json": "0.001",
   "bekraeft": false,
   "kommentar": "Som Andeby."
  },
  {
   "sti": "solver.mip_abs_gap",
   "vaerdi_json": "1000.0",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "solver.time_limit",
   "vaerdi_json": "3600.0",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "heat_load_params.gaf_mw_per_k",
   "vaerdi_json": "0.3626",
   "bekraeft": true,
   "kommentar": "Skaleret fra Andeby × 50/105.52"
  },
  {
   "sti": "heat_load_params.t_ref",
   "vaerdi_json": "15.0",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "heat_load_params.thermal_inertia_hours",
   "vaerdi_json": "24",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "heat_load_params.nettab_slope_mw_per_k",
   "vaerdi_json": "0.2259",
   "bekraeft": true,
   "kommentar": "Skaleret fra Andeby × 50/105.52"
  },
  {
   "sti": "heat_load_params.t_net",
   "vaerdi_json": "12.0",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "heat_load_params.baseline_profile_mw",
   "vaerdi_json": "[2.102,2.132,2.181,2.259,2.285,2.422,2.649,2.656,2.537,2.348,2.263,2.225,2.162,2.118,2.092,2.065,2.099,2.181,2.24,2.259,2.244,2.24,2.184,2.08]",
   "bekraeft": true,
   "kommentar": "Skaleret fra Andeby × 50/105.52"
  },
  {
   "sti": "heat_load_params.weekly_dip",
   "vaerdi_json": "0.02",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "heat_load_params._source",
   "vaerdi_json": "\"Skabelon: Andeby × 50/105.52 GWh\"",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.enabled",
   "vaerdi_json": "true",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.type",
   "vaerdi_json": "\"gas_boiler\"",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.p_max_heat",
   "vaerdi_json": "25.0",
   "bekraeft": true,
   "kommentar": "Skal dække spidslasten (ca. 19.0 MW ved 50 GWh); 0,5 MW pr. GWh giver luft."
  },
  {
   "sti": "units.gaskedel.p_min_heat",
   "vaerdi_json": "0.0",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.alpha",
   "vaerdi_json": "0.0",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.fuel",
   "vaerdi_json": "\"natural_gas\"",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.eta_fuel_to_heat",
   "vaerdi_json": "0.95",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.var_om",
   "vaerdi_json": "30.0",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.start_cost",
   "vaerdi_json": "0.0",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.min_uptime",
   "vaerdi_json": "1",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.min_downtime",
   "vaerdi_json": "1",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.uc_enabled",
   "vaerdi_json": "false",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.co2_emissions_per_mwh_fuel",
   "vaerdi_json": "0.2",
   "bekraeft": false,
   "kommentar": "Naturgas ca. 0,2 t CO₂/MWh brændsel."
  },
  {
   "sti": "units.gaskedel.ancillary.afrr_qualified",
   "vaerdi_json": "false",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.ancillary.mfrr_qualified",
   "vaerdi_json": "false",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "units.gaskedel.ancillary.fcr_qualified",
   "vaerdi_json": "false",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "storage",
   "vaerdi_json": "{}",
   "bekraeft": false,
   "kommentar": "Intet lager. Blokken skal findes (config.py læser raw['storage'])."
  },
  {
   "sti": "prices.natural_gas.value",
   "vaerdi_json": "606.0",
   "bekraeft": true,
   "kommentar": "Andebys gaspris; ekskl. moms pr. MWh brændsel."
  },
  {
   "sti": "prices.natural_gas.unit",
   "vaerdi_json": "\"DKK/MWh_fuel\"",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "prices.co2_eua.value",
   "vaerdi_json": "600.0",
   "bekraeft": true,
   "kommentar": "Kr. pr. ton CO₂; 0 hvis gasprisen indeholder CO₂-afgiften."
  },
  {
   "sti": "prices.co2_eua.unit",
   "vaerdi_json": "\"DKK/t_CO2\"",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption_flat",
   "vaerdi_json": "125.0",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_production_flat",
   "vaerdi_json": "4.1",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.electricity_tax",
   "vaerdi_json": "4.0",
   "bekraeft": true,
   "kommentar": "Skal være lig fixed_components.elafgift_net."
  },
  {
   "sti": "electricity.tariff_consumption.unit",
   "vaerdi_json": "\"kr_per_mwh\"",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.source",
   "vaerdi_json": "\"Andebys bånd (fiktivt netselskab) — erstat med jeres prisblad\"",
   "bekraeft": false,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.fixed_components.energinet",
   "vaerdi_json": "115.0",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.fixed_components.dv",
   "vaerdi_json": "0.0",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.fixed_components.elafgift_net",
   "vaerdi_json": "4.0",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.bands.lav",
   "vaerdi_json": "7.4",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.bands.hoej",
   "vaerdi_json": "14.8",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.bands.spids",
   "vaerdi_json": "29.5",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.months",
   "vaerdi_json": "[10,11,12,1,2,3]",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.00-06",
   "vaerdi_json": "\"lav\"",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.06-21",
   "vaerdi_json": "\"spids\"",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.21-24",
   "vaerdi_json": "\"hoej\"",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.weekend.00-06",
   "vaerdi_json": "\"lav\"",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.weekend.06-21",
   "vaerdi_json": "\"hoej\"",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.weekend.21-24",
   "vaerdi_json": "\"hoej\"",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.sommer.months",
   "vaerdi_json": "[4,5,6,7,8,9]",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.sommer.weekday.00-06",
   "vaerdi_json": "\"lav\"",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.sommer.weekday.06-24",
   "vaerdi_json": "\"hoej\"",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.sommer.weekend.00-06",
   "vaerdi_json": "\"lav\"",
   "bekraeft": true,
   "kommentar": null
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.sommer.weekend.06-24",
   "vaerdi_json": "\"lav\"",
   "bekraeft": true,
   "kommentar": null
  }
 ],
 "varmelast": {
  "reference_gwh": 50.0,
  "skaleres": [
   "heat_load_params.gaf_mw_per_k",
   "heat_load_params.nettab_slope_mw_per_k",
   "heat_load_params.baseline_profile_mw"
  ],
  "tekst": "f = G / 105,52; gaf_mw_per_k = 0,7653 × f, nettab_slope_mw_per_k = 0,4768 × f, baseline_profile_mw = Andebys 24 værdier × f (cases/andeby.yaml:158-162); uændret: t_ref 15, thermal_inertia_hours 24, t_net 12, weekly_dip 0,02",
  "forbehold": "Faktoren gælder karup-vejret i det rullende år. Et andet DMI-område giver nogle procent andet årsbehov (README.md:193-195); har værket målt varmelast, er den bedre."
 },
 "dmi": [
  "fyn",
  "vestkyst",
  "karup",
  "ringsted"
 ],
 "zoner": [
  "DK1",
  "DK2"
 ],
 "kilde": "viden/nyt_vaerk_skabelon.json @ b49aeb0",
 "trinRegler": {
  "navn": "kode: små bogstaver, tal og _ (KONTRAKT §3.1); unik.",
  "klima": "spot_area sættes lig price_zone automatisk.",
  "varmebehov": "Årligt varmebehov ab værk i GWh → parametrene efter formlen. 'Jeg har timedata': kun filer i modelrepoets data/ i denne version; heat_load_params skal stadig findes (run_case.py:377).",
  "enheder": "Mindst én aktiv enhed; tilsammen skal de kunne dække spidslasten (ca. 0,38 MW pr. GWh/år). Tilføj fra enhedstyper.json; skabelonens gaskedel kan beholdes som spids/reserve.",
  "lager": "Tom = intet lager. Et lager har volumen, ΔT, startindhold og lade-/afladeeffekt.",
  "priser": "Forudfyldt med Andebys tal og markeret [BEKRÆFT]. Pris skal findes for hvert brændsel, en aktiv enhed bruger; elafgift = elafgift_net.",
  "gennemse": "Kør klientvalideringen (validering.md) på hele bladlisten; vis antal [BEKRÆFT].",
  "efter": "Liste over [BEKRÆFT]-felter + 'Bestil en prøvekørsel (2 døgn)': 5.–6. januar 2026 uden balancemarked, gab 0,0002/100 kr."
 },
 "gaskedelPrGwh": 0.5,
 "spidslastPrGwh": 0.38,
 "obligatoriske": {
  "_om": "Uden disse afviser modellen værket (validering.md). 'enabled' og ancillary er ikke strengt påkrævet (standarder), men skrives altid, så til/fra virker i scenarier (K3-N5).",
  "altid": [
   "meta.case_name",
   "data.dmi_area",
   "data.price_zone",
   "time.start",
   "time.end",
   "time.resolution",
   "heat_load_params.gaf_mw_per_k",
   "prices.co2_eua.value",
   "electricity.spot_area",
   "electricity.tariff_consumption_flat",
   "electricity.tariff_production_flat",
   "electricity.electricity_tax",
   "storage (blokken, evt. tom)",
   "units.<n> (mindst én aktiv)"
  ],
  "pr_enhed": [
   "type",
   "p_max_heat",
   "p_min_heat",
   "alpha",
   "fuel",
   "eta_fuel_to_heat (når fuel ikke er electricity/solar)"
  ],
  "pr_lager": [
   "volume_m3",
   "delta_t_k",
   "e_initial_mwh",
   "p_max_charge_mw",
   "p_max_discharge_mw",
   "self_discharge_per_hour"
  ],
  "pr_braendsel_i_brug": [
   "prices.<brændsel>.value"
  ],
  "hvis_tarifprofil": [
   "electricity.tariff_consumption.unit",
   "…net_tariff.bands.*",
   "…net_tariff.seasons.*.months/weekday/weekend (alle 12 måneder, alle 24 timer)",
   "…fixed_components.elafgift_net = electricity_tax"
  ],
  "kilde": "src/config.py:906-1165; src/tariff.py:110-161; src/data_loader.py:805-809"
 }
};
