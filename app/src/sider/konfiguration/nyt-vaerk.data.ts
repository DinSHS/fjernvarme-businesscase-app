//-----------------------------------------------------------------------
// GENERERET af _byg/byg_katalog.py fra viden/nyt_vaerk_skabelon.json
// (fv-ekspert). Ret ikke i hånden. 67 blade, model eef950a.
//-----------------------------------------------------------------------

import type { NytVaerkSkabelon } from "./nyt-vaerk";

export const NYT_VAERK_SKABELON: NytVaerkSkabelon | null = {
 "blade": [
  {
   "sti": "meta.case_name",
   "vaerdi_json": "\"nyt_vaerk\"",
   "bekraeft": false,
   "kommentar": "Værkets kode; bruges i outputfilernes navn.",
   "kilde": null
  },
  {
   "sti": "meta.titel",
   "vaerdi_json": "\"Nyt værk\"",
   "bekraeft": false,
   "kommentar": null,
   "kilde": null
  },
  {
   "sti": "meta.description",
   "vaerdi_json": "\"Oprettet fra skabelon: én gaskedel, intet lager, 50 GWh/år.\"",
   "bekraeft": false,
   "kommentar": null,
   "kilde": null
  },
  {
   "sti": "meta.timezone_internal",
   "vaerdi_json": "\"UTC\"",
   "bekraeft": false,
   "kommentar": "Dokumentation; læses ikke af modellen. Kilde: Andeby, cases/andeby.yaml:72 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:72 @ eef950a"
  },
  {
   "sti": "meta.timezone_reporting",
   "vaerdi_json": "\"Europe/Copenhagen\"",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:73 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:73 @ eef950a"
  },
  {
   "sti": "meta.discount_rate_real",
   "vaerdi_json": "0.035",
   "bekraeft": true,
   "kommentar": "Real kalkulationsrente til annuitet; læses ikke af modellen. Kilde: Andeby, cases/andeby.yaml:74 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:74 @ eef950a"
  },
  {
   "sti": "data.dmi_area",
   "vaerdi_json": "\"karup\"",
   "bekraeft": true,
   "kommentar": "Vælg efter beliggenhed: vestkyst, karup, fyn, ringsted. Kilde: Andeby, cases/andeby.yaml:89 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:89 @ eef950a"
  },
  {
   "sti": "data.price_zone",
   "vaerdi_json": "\"DK1\"",
   "bekraeft": true,
   "kommentar": "DK1 vest for Storebælt, DK2 øst for. Kilde: Andeby, cases/andeby.yaml:90 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:90 @ eef950a"
  },
  {
   "sti": "electricity.spot_area",
   "vaerdi_json": "\"DK1\"",
   "bekraeft": true,
   "kommentar": "Skal være lig data.price_zone. Kilde: Andeby, cases/andeby.yaml:190 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:190 @ eef950a"
  },
  {
   "sti": "time.start",
   "vaerdi_json": "\"2025-07-01T00:00:00Z\"",
   "bekraeft": false,
   "kommentar": "Rullende år; dækket af df-data. Kilde: Andeby, cases/andeby.yaml:115 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:115 @ eef950a"
  },
  {
   "sti": "time.end",
   "vaerdi_json": "\"2026-06-30T23:00:00Z\"",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:116 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:116 @ eef950a"
  },
  {
   "sti": "time.resolution",
   "vaerdi_json": "\"1h\"",
   "bekraeft": false,
   "kommentar": "Version 1 kører kun 1h (KONTRAKT §6c). Kilde: Andeby, cases/andeby.yaml:117 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:117 @ eef950a"
  },
  {
   "sti": "solver.mip_rel_gap",
   "vaerdi_json": "0.001",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:143 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:143 @ eef950a"
  },
  {
   "sti": "solver.mip_abs_gap",
   "vaerdi_json": "1000.0",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:144 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:144 @ eef950a"
  },
  {
   "sti": "solver.time_limit",
   "vaerdi_json": "3600.0",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:145 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:145 @ eef950a"
  },
  {
   "sti": "heat_load_params.gaf_mw_per_k",
   "vaerdi_json": "0.3826",
   "bekraeft": true,
   "kommentar": "Andeby × f, f = round(50/100, 4) = 0.5. Kilde: scripts/vaerksark_til_yaml.py:1581 @ eef950a (modelrepoets skalering af Andeby til et årsbehov).",
   "kilde": "scripts/vaerksark_til_yaml.py:1581 @ eef950a (modelrepoets skalering af Andeby til et årsbehov)"
  },
  {
   "sti": "heat_load_params.t_ref",
   "vaerdi_json": "15.0",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:154 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:154 @ eef950a"
  },
  {
   "sti": "heat_load_params.thermal_inertia_hours",
   "vaerdi_json": "24",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:155 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:155 @ eef950a"
  },
  {
   "sti": "heat_load_params.nettab_slope_mw_per_k",
   "vaerdi_json": "0.2384",
   "bekraeft": true,
   "kommentar": "Andeby × f, f = round(50/100, 4) = 0.5. Kilde: scripts/vaerksark_til_yaml.py:1581 @ eef950a (modelrepoets skalering af Andeby til et årsbehov).",
   "kilde": "scripts/vaerksark_til_yaml.py:1581 @ eef950a (modelrepoets skalering af Andeby til et årsbehov)"
  },
  {
   "sti": "heat_load_params.t_net",
   "vaerdi_json": "12.0",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:157 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:157 @ eef950a"
  },
  {
   "sti": "heat_load_params.baseline_profile_mw",
   "vaerdi_json": "[2.219,2.25,2.301,2.384,2.411,2.556,2.795,2.803,2.678,2.478,2.388,2.348,2.281,2.235,2.207,2.179,2.215,2.301,2.364,2.384,2.368,2.364,2.305,2.195]",
   "bekraeft": true,
   "kommentar": "Andeby × f, f = round(50/100, 4) = 0.5. Kilde: scripts/vaerksark_til_yaml.py:1581 @ eef950a (modelrepoets skalering af Andeby til et årsbehov).",
   "kilde": "scripts/vaerksark_til_yaml.py:1581 @ eef950a (modelrepoets skalering af Andeby til et årsbehov)"
  },
  {
   "sti": "heat_load_params.weekly_dip",
   "vaerdi_json": "0.02",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:163 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:163 @ eef950a"
  },
  {
   "sti": "heat_load_params._source",
   "vaerdi_json": "\"Skabelon: Andeby × round(50/100, 4) (modelrepoets skalering, scripts/vaerksark_til_yaml.py:1581)\"",
   "bekraeft": false,
   "kommentar": null,
   "kilde": null
  },
  {
   "sti": "units.gaskedel.enabled",
   "vaerdi_json": "true",
   "bekraeft": false,
   "kommentar": null,
   "kilde": null
  },
  {
   "sti": "units.gaskedel.type",
   "vaerdi_json": "\"gas_boiler\"",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:374 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:374 @ eef950a"
  },
  {
   "sti": "units.gaskedel.p_max_heat",
   "vaerdi_json": "25.0",
   "bekraeft": true,
   "kommentar": "Skal dække spidslasten (ca. 20.0 MW ved 50 GWh, f = 0.5). Kilde: egen antagelse: round(50 × f) MW; spidslasten ca. 40.02 × f MW (egen måling: Andeby 40,02 MW med f = 1, D11 ved eef950a).",
   "kilde": "egen antagelse: round(50 × f) MW; spidslasten ca. 40.02 × f MW (egen måling: Andeby 40,02 MW med f = 1, D11 ved eef950a)"
  },
  {
   "sti": "units.gaskedel.p_min_heat",
   "vaerdi_json": "0.0",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:376 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:376 @ eef950a"
  },
  {
   "sti": "units.gaskedel.alpha",
   "vaerdi_json": "0.0",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:377 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:377 @ eef950a"
  },
  {
   "sti": "units.gaskedel.fuel",
   "vaerdi_json": "\"natural_gas\"",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:378 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:378 @ eef950a"
  },
  {
   "sti": "units.gaskedel.eta_fuel_to_heat",
   "vaerdi_json": "0.95",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:379 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:379 @ eef950a"
  },
  {
   "sti": "units.gaskedel.var_om",
   "vaerdi_json": "89.0",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:380 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:380 @ eef950a"
  },
  {
   "sti": "units.gaskedel.start_cost",
   "vaerdi_json": "500.0",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:381 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:381 @ eef950a"
  },
  {
   "sti": "units.gaskedel.min_uptime",
   "vaerdi_json": "1",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:382 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:382 @ eef950a"
  },
  {
   "sti": "units.gaskedel.min_downtime",
   "vaerdi_json": "1",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:383 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:383 @ eef950a"
  },
  {
   "sti": "units.gaskedel.uc_enabled",
   "vaerdi_json": "false",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:384 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:384 @ eef950a"
  },
  {
   "sti": "units.gaskedel.co2_emissions_per_mwh_fuel",
   "vaerdi_json": "0.2",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:385 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:385 @ eef950a"
  },
  {
   "sti": "units.gaskedel.ancillary.afrr_qualified",
   "vaerdi_json": "false",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:386 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:386 @ eef950a"
  },
  {
   "sti": "units.gaskedel.ancillary.mfrr_qualified",
   "vaerdi_json": "false",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:386 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:386 @ eef950a"
  },
  {
   "sti": "units.gaskedel.ancillary.fcr_qualified",
   "vaerdi_json": "false",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:386 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:386 @ eef950a"
  },
  {
   "sti": "storage",
   "vaerdi_json": "{}",
   "bekraeft": false,
   "kommentar": "Intet lager. Blokken skal findes (config.py læser raw['storage']).",
   "kilde": null
  },
  {
   "sti": "prices.natural_gas.value",
   "vaerdi_json": "606.0",
   "bekraeft": true,
   "kommentar": "Ekskl. moms pr. MWh brændsel. Kilde: Andeby, cases/andeby.yaml:171 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:171 @ eef950a"
  },
  {
   "sti": "prices.natural_gas.unit",
   "vaerdi_json": "\"DKK/MWh_fuel\"",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:172 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:172 @ eef950a"
  },
  {
   "sti": "prices.co2_eua.value",
   "vaerdi_json": "600.0",
   "bekraeft": true,
   "kommentar": "Kr. pr. ton CO₂; 0 hvis gasprisen indeholder CO₂-afgiften. Kilde: Andeby, cases/andeby.yaml:183 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:183 @ eef950a"
  },
  {
   "sti": "prices.co2_eua.unit",
   "vaerdi_json": "\"DKK/t\"",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:184 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:184 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption_flat",
   "vaerdi_json": "125.0",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:191 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:191 @ eef950a"
  },
  {
   "sti": "electricity.tariff_production_flat",
   "vaerdi_json": "4.1",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:231 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:231 @ eef950a"
  },
  {
   "sti": "electricity.electricity_tax",
   "vaerdi_json": "4.0",
   "bekraeft": true,
   "kommentar": "Skal være lig fixed_components.elafgift_net. Kilde: Andeby, cases/andeby.yaml:232 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:232 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.unit",
   "vaerdi_json": "\"kr_per_mwh\"",
   "bekraeft": false,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:211 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:211 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.source",
   "vaerdi_json": "\"Andebys bånd (fiktivt netselskab) — erstat med jeres prisblad\"",
   "bekraeft": false,
   "kommentar": null,
   "kilde": null
  },
  {
   "sti": "electricity.tariff_consumption.fixed_components.dv",
   "vaerdi_json": "0.0",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:215 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:215 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.fixed_components.elafgift_net",
   "vaerdi_json": "4.0",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:216 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:216 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.fixed_components.energinet",
   "vaerdi_json": "115.0",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:214 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:214 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.bands.lav",
   "vaerdi_json": "7.4",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:219 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:219 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.bands.hoej",
   "vaerdi_json": "14.8",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:220 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:220 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.bands.spids",
   "vaerdi_json": "29.5",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:221 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:221 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.months",
   "vaerdi_json": "[10,11,12,1,2,3]",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:224 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:224 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.00-06",
   "vaerdi_json": "\"lav\"",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:225 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:225 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.06-21",
   "vaerdi_json": "\"spids\"",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:225 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:225 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.21-24",
   "vaerdi_json": "\"hoej\"",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:225 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:225 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.weekend.00-06",
   "vaerdi_json": "\"lav\"",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:226 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:226 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.weekend.06-21",
   "vaerdi_json": "\"hoej\"",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:226 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:226 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.vinter.weekend.21-24",
   "vaerdi_json": "\"hoej\"",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:226 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:226 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.sommer.months",
   "vaerdi_json": "[4,5,6,7,8,9]",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:228 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:228 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.sommer.weekday.00-06",
   "vaerdi_json": "\"lav\"",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:229 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:229 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.sommer.weekday.06-24",
   "vaerdi_json": "\"hoej\"",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:229 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:229 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.sommer.weekend.00-06",
   "vaerdi_json": "\"lav\"",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:230 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:230 @ eef950a"
  },
  {
   "sti": "electricity.tariff_consumption.net_tariff.seasons.sommer.weekend.06-24",
   "vaerdi_json": "\"lav\"",
   "bekraeft": true,
   "kommentar": "Kilde: Andeby, cases/andeby.yaml:230 @ eef950a.",
   "kilde": "Andeby, cases/andeby.yaml:230 @ eef950a"
  }
 ],
 "varmelast": {
  "reference_gwh": 50.0,
  "skaleres": [
   "heat_load_params.gaf_mw_per_k",
   "heat_load_params.nettab_slope_mw_per_k",
   "heat_load_params.baseline_profile_mw"
  ],
  "divisor_gwh": 100.0,
  "afrunding": 4,
  "betingelse": {
   "op": ">",
   "graense": 1.0
  },
  "ellers": 1.0,
  "grundtal": {
   "heat_load_params.gaf_mw_per_k": 0.7653,
   "heat_load_params.nettab_slope_mw_per_k": 0.4768,
   "heat_load_params.baseline_profile_mw": [
    4.437,
    4.5,
    4.602,
    4.767,
    4.822,
    5.112,
    5.59,
    5.606,
    5.355,
    4.955,
    4.775,
    4.696,
    4.563,
    4.469,
    4.414,
    4.359,
    4.43,
    4.602,
    4.728,
    4.767,
    4.735,
    4.728,
    4.61,
    4.39
   ]
  },
  "decimaler": {
   "heat_load_params.gaf_mw_per_k": 4,
   "heat_load_params.nettab_slope_mw_per_k": 4,
   "heat_load_params.baseline_profile_mw": 3
  },
  "kilde": "scripts/vaerksark_til_yaml.py:1581 @ eef950a (grundtal scripts/vaerksark_til_yaml.py:1582-1598)",
  "tekst": "f = round(G / 100, 4) når G > 1, ellers f = 1; gaf_mw_per_k = round(0.7653 × f, 4), nettab_slope_mw_per_k = round(0.4768 × f, 4), baseline_profile_mw = Andebys 24 værdier × f, 3 decimaler; uændret: t_ref, thermal_inertia_hours, t_net og weekly_dip som Andeby",
  "forbehold": "Har værket målt varmelast, er den bedre end syntesen (doc/VARMELAST_OG_NETTAB.md)."
 },
 "egneAntagelser": [
  "Standardårsbehov 50 GWh (et mellemstort værk; brugeren skriver sit eget).",
  "Gaskedlens størrelse round(50 × f) MW, så den dækker spidslasten (ca. 40.02 × f MW; f er modelrepoets faktor, G/100 over 1 GWh og 1 derunder).",
  "Kun én gaskedel og intet lager: det mindste værk, modellen kan løse."
 ],
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
 "kilde": "viden/nyt_vaerk_skabelon.json @ eef950a",
 "trinRegler": {
  "navn": "kode: små bogstaver, tal og _ (KONTRAKT §3.1); unik.",
  "klima": "spot_area sættes lig price_zone automatisk.",
  "varmebehov": "Årligt varmebehov ab værk i GWh → parametrene med modelrepoets skalering (som værksarket). 'Jeg har timedata': kun filer i modelrepoets data/ i denne version; heat_load_params skal stadig findes (run_case.py:377).",
  "enheder": "Mindst én aktiv enhed; tilsammen skal de kunne dække spidslasten (ca. 40,02 MW × f). Tilføj fra enhedstyper.json; skabelonens gaskedel kan beholdes som spids/reserve.",
  "lager": "Tom = intet lager. Et lager har volumen, ΔT, startindhold og lade-/afladeeffekt.",
  "priser": "Forudfyldt med Andebys tal og markeret [BEKRÆFT]. Pris skal findes for hvert brændsel, en aktiv enhed bruger; elafgift = elafgift_net.",
  "gennemse": "Kør klientvalideringen (validering.md) på hele bladlisten; vis antal [BEKRÆFT].",
  "efter": "Liste over [BEKRÆFT]-felter + 'Bestil en prøvekørsel (2 døgn)': 5.–6. januar 2026 uden balancemarked, gab 0,0002/100 kr."
 },
 "gaskedelVedF1": 50.0,
 "spidslastVedF1": 40.02,
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
