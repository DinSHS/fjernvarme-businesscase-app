//-----------------------------------------------------------------------
// GENERERET af viden/vaerktoej/byg_modelspejl.py fra modelrepoet ved den pinnede commit.
// Ret ikke i hånden; tjek_trofasthed.py fejler, hvis filen ikke er det, modelrepoet giver.
//-----------------------------------------------------------------------

import type { Modelspejl } from "./modelspejl";

export const MODELSPEJL: Modelspejl = {
 "model_commit": "eef950a2ac7b3808a9456dcf48742ce08e52366a",
 "cases": {
  "andeby": {
   "fil": "cases/andeby.yaml",
   "standard": {
    "kilde": "cases/andeby.yaml:9",
    "kommando": "python run_case.py cases/andeby.yaml --data-source github",
    "med_balancering": false,
    "heat_csv": null,
    "start": null,
    "slut": null,
    "balancing_method": null,
    "data_source": "github",
    "ekstra": []
   },
   "kommandoer": [
    {
     "kilde": "cases/andeby.yaml:9",
     "kommando": "python run_case.py cases/andeby.yaml --data-source github",
     "med_balancering": false,
     "heat_csv": null,
     "start": null,
     "slut": null,
     "balancing_method": null,
     "data_source": "github",
     "ekstra": []
    },
    {
     "kilde": "cases/andeby.yaml:13-14",
     "kommando": "python run_case.py cases/andeby.yaml --data-source github --start 2026-01-05 --end 2026-01-16",
     "med_balancering": false,
     "heat_csv": null,
     "start": "2026-01-05",
     "slut": "2026-01-16",
     "balancing_method": null,
     "data_source": "github",
     "ekstra": []
    },
    {
     "kilde": "README.md:179",
     "kommando": "python run_case.py cases/andeby.yaml --data-source github --with-balancing",
     "med_balancering": true,
     "heat_csv": null,
     "start": null,
     "slut": null,
     "balancing_method": null,
     "data_source": "github",
     "ekstra": []
    },
    {
     "kilde": "README.md:180",
     "kommando": "python run_case.py cases/andeby.yaml --data-source github",
     "med_balancering": false,
     "heat_csv": null,
     "start": null,
     "slut": null,
     "balancing_method": null,
     "data_source": "github",
     "ekstra": []
    }
   ],
   "blade": {
    "meta.case_name": [
     "\"andeby\"",
     64
    ],
    "meta.description": [
     "\"Fiktivt referenceværk til regulerings-analyser. Halmkedel (12 MW) som grundlast; solvarme (profil-drevet loft via solar_thermal-enhedstypen); flåde skaleret til ~100 GWh. Afledt af billund_2025 (faktor 0,784 på heat_load-parametrene).\\n\"",
     65
    ],
    "meta.titel": [
     "\"Andeby — fiktivt referenceværk\"",
     70
    ],
    "meta.gruppe": [
     "\"andeby\"",
     71
    ],
    "meta.timezone_internal": [
     "\"UTC\"",
     72
    ],
    "meta.timezone_reporting": [
     "\"Europe/Copenhagen\"",
     73
    ],
    "meta.discount_rate_real": [
     "0.035",
     74
    ],
    "meta.tax_year": [
     "2025",
     80
    ],
    "data.dmi_area": [
     "\"karup\"",
     89
    ],
    "data.price_zone": [
     "\"DK1\"",
     90
    ],
    "time.start": [
     "\"2025-07-01T00:00:00Z\"",
     115
    ],
    "time.end": [
     "\"2026-06-30T23:00:00Z\"",
     116
    ],
    "time.resolution": [
     "\"1h\"",
     117
    ],
    "solver.mip_rel_gap": [
     "0.001",
     143
    ],
    "solver.mip_abs_gap": [
     "1000.0",
     144
    ],
    "solver.time_limit": [
     "3600.0",
     145
    ],
    "heat_load_params.gaf_mw_per_k": [
     "0.7653",
     153
    ],
    "heat_load_params.t_ref": [
     "15.0",
     154
    ],
    "heat_load_params.thermal_inertia_hours": [
     "24",
     155
    ],
    "heat_load_params.nettab_slope_mw_per_k": [
     "0.4768",
     156
    ],
    "heat_load_params.t_net": [
     "12.0",
     157
    ],
    "heat_load_params.baseline_profile_mw": [
     "[4.437,4.5,4.602,4.767,4.822,5.112,5.59,5.606,5.355,4.955,4.775,4.696,4.563,4.469,4.414,4.359,4.43,4.602,4.728,4.767,4.735,4.728,4.61,4.39]",
     158
    ],
    "heat_load_params.weekly_dip": [
     "0.02",
     163
    ],
    "heat_load_params._source": [
     "\"Billund dual-slope v2 × 0,784 (Andeby ~100 GWh) — aktiv ved syntese\"",
     164
    ],
    "prices.natural_gas.value": [
     "606.0",
     171
    ],
    "prices.natural_gas.unit": [
     "\"DKK/MWh_fuel\"",
     172
    ],
    "prices.straw.value": [
     "232.0",
     174
    ],
    "prices.straw.unit": [
     "\"DKK/MWh_fuel\"",
     175
    ],
    "prices.flis.value": [
     "232.0",
     177
    ],
    "prices.flis.unit": [
     "\"DKK/MWh_fuel\"",
     178
    ],
    "prices.waste_heat.value": [
     "50.0",
     180
    ],
    "prices.waste_heat.unit": [
     "\"DKK/MWh_fuel\"",
     181
    ],
    "prices.co2_eua.value": [
     "600.0",
     183
    ],
    "prices.co2_eua.unit": [
     "\"DKK/t\"",
     184
    ],
    "electricity.spot_area": [
     "\"DK1\"",
     190
    ],
    "electricity.tariff_consumption_flat": [
     "125.0",
     191
    ],
    "electricity.tariff_consumption.unit": [
     "\"kr_per_mwh\"",
     211
    ],
    "electricity.tariff_consumption.source": [
     "\"Fiktivt netselskab, A-høj-lignende. Erstat med dit eget prisblad.\"",
     212
    ],
    "electricity.tariff_consumption.fixed_components.energinet": [
     "115.0",
     214
    ],
    "electricity.tariff_consumption.fixed_components.dv": [
     "0.0",
     215
    ],
    "electricity.tariff_consumption.fixed_components.elafgift_net": [
     "4.0",
     216
    ],
    "electricity.tariff_consumption.net_tariff.bands.lav": [
     "7.4",
     219
    ],
    "electricity.tariff_consumption.net_tariff.bands.hoej": [
     "14.8",
     220
    ],
    "electricity.tariff_consumption.net_tariff.bands.spids": [
     "29.5",
     221
    ],
    "electricity.tariff_consumption.net_tariff.seasons.vinter.months": [
     "[10,11,12,1,2,3]",
     224
    ],
    "electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.00-06": [
     "\"lav\"",
     225
    ],
    "electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.06-21": [
     "\"spids\"",
     225
    ],
    "electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.21-24": [
     "\"hoej\"",
     225
    ],
    "electricity.tariff_consumption.net_tariff.seasons.vinter.weekend.00-06": [
     "\"lav\"",
     226
    ],
    "electricity.tariff_consumption.net_tariff.seasons.vinter.weekend.06-21": [
     "\"hoej\"",
     226
    ],
    "electricity.tariff_consumption.net_tariff.seasons.vinter.weekend.21-24": [
     "\"hoej\"",
     226
    ],
    "electricity.tariff_consumption.net_tariff.seasons.sommer.months": [
     "[4,5,6,7,8,9]",
     228
    ],
    "electricity.tariff_consumption.net_tariff.seasons.sommer.weekday.00-06": [
     "\"lav\"",
     229
    ],
    "electricity.tariff_consumption.net_tariff.seasons.sommer.weekday.06-24": [
     "\"hoej\"",
     229
    ],
    "electricity.tariff_consumption.net_tariff.seasons.sommer.weekend.00-06": [
     "\"lav\"",
     230
    ],
    "electricity.tariff_consumption.net_tariff.seasons.sommer.weekend.06-24": [
     "\"lav\"",
     230
    ],
    "electricity.tariff_production_flat": [
     "4.1",
     231
    ],
    "electricity.electricity_tax": [
     "4.0",
     232
    ],
    "units.vp_luft_vand.enabled": [
     "true",
     240
    ],
    "units.vp_luft_vand.type": [
     "\"heat_pump\"",
     241
    ],
    "units.vp_luft_vand.p_max_heat": [
     "4.462",
     244
    ],
    "units.vp_luft_vand.p_min_heat": [
     "0.0",
     245
    ],
    "units.vp_luft_vand.alpha": [
     "-0.3438",
     246
    ],
    "units.vp_luft_vand.fuel": [
     "\"electricity\"",
     247
    ],
    "units.vp_luft_vand.var_om": [
     "13.4",
     248
    ],
    "units.vp_luft_vand.start_cost": [
     "0.0",
     249
    ],
    "units.vp_luft_vand.min_uptime": [
     "1",
     250
    ],
    "units.vp_luft_vand.min_downtime": [
     "1",
     251
    ],
    "units.vp_luft_vand.uc_enabled": [
     "false",
     252
    ],
    "units.vp_luft_vand.cop_curve.type": [
     "\"table\"",
     259
    ],
    "units.vp_luft_vand.cop_curve.points": [
     "[{\"t_ambient\":-10.0,\"heat_mw\":2.55,\"el_mw\":1.062},{\"t_ambient\":0.0,\"heat_mw\":3.4,\"el_mw\":1.169},{\"t_ambient\":16.0,\"heat_mw\":4.462,\"el_mw\":1.317}]",
     260
    ],
    "units.vp_luft_vand.ancillary.afrr_qualified": [
     "true",
     265
    ],
    "units.vp_luft_vand.ancillary.mfrr_qualified": [
     "true",
     266
    ],
    "units.vp_luft_vand.ancillary.fcr_qualified": [
     "false",
     267
    ],
    "units.vp_luft_vand.commissioned": [
     "2025",
     268
    ],
    "units.elkedel_ny.enabled": [
     "true",
     272
    ],
    "units.elkedel_ny.type": [
     "\"electric_boiler\"",
     273
    ],
    "units.elkedel_ny.p_max_heat": [
     "4.0",
     274
    ],
    "units.elkedel_ny.p_min_heat": [
     "0.0",
     275
    ],
    "units.elkedel_ny.alpha": [
     "-1.0",
     276
    ],
    "units.elkedel_ny.fuel": [
     "\"electricity\"",
     277
    ],
    "units.elkedel_ny.var_om": [
     "13.4",
     278
    ],
    "units.elkedel_ny.start_cost": [
     "0.0",
     279
    ],
    "units.elkedel_ny.min_uptime": [
     "1",
     280
    ],
    "units.elkedel_ny.min_downtime": [
     "1",
     281
    ],
    "units.elkedel_ny.uc_enabled": [
     "false",
     282
    ],
    "units.elkedel_ny.ancillary.bid_window.months": [
     "[10,11,12,1,2,3]",
     289
    ],
    "units.elkedel_ny.ancillary.afrr_qualified": [
     "true",
     290
    ],
    "units.elkedel_ny.ancillary.mfrr_qualified": [
     "true",
     291
    ],
    "units.elkedel_ny.ancillary.fcr_qualified": [
     "false",
     292
    ],
    "units.elkedel_ny.commissioned": [
     "2025",
     293
    ],
    "units.elkedel_gl.enabled": [
     "false",
     297
    ],
    "units.elkedel_gl.type": [
     "\"electric_boiler\"",
     298
    ],
    "units.elkedel_gl.p_max_heat": [
     "12.0",
     299
    ],
    "units.elkedel_gl.p_min_heat": [
     "0.0",
     300
    ],
    "units.elkedel_gl.alpha": [
     "-1.0",
     301
    ],
    "units.elkedel_gl.fuel": [
     "\"electricity\"",
     302
    ],
    "units.elkedel_gl.var_om": [
     "6.71",
     303
    ],
    "units.elkedel_gl.start_cost": [
     "0.0",
     304
    ],
    "units.elkedel_gl.min_uptime": [
     "1",
     305
    ],
    "units.elkedel_gl.min_downtime": [
     "1",
     306
    ],
    "units.elkedel_gl.uc_enabled": [
     "false",
     307
    ],
    "units.elkedel_gl.ancillary.afrr_qualified": [
     "true",
     309
    ],
    "units.elkedel_gl.ancillary.mfrr_qualified": [
     "true",
     310
    ],
    "units.elkedel_gl.ancillary.fcr_qualified": [
     "false",
     311
    ],
    "units.elkedel_gl.commissioned": [
     "2021",
     312
    ],
    "units.fliskedel.enabled": [
     "false",
     316
    ],
    "units.fliskedel.type": [
     "\"biomass_boiler\"",
     317
    ],
    "units.fliskedel.p_max_heat": [
     "7.0",
     318
    ],
    "units.fliskedel.p_min_heat": [
     "2.0",
     319
    ],
    "units.fliskedel.alpha": [
     "0.0",
     320
    ],
    "units.fliskedel.fuel": [
     "\"flis\"",
     321
    ],
    "units.fliskedel.eta_fuel_to_heat": [
     "0.94",
     322
    ],
    "units.fliskedel.var_om": [
     "30.0",
     323
    ],
    "units.fliskedel.start_cost": [
     "5000.0",
     324
    ],
    "units.fliskedel.min_uptime": [
     "72",
     325
    ],
    "units.fliskedel.min_downtime": [
     "6",
     326
    ],
    "units.fliskedel.uc_enabled": [
     "true",
     327
    ],
    "units.fliskedel.initial_status": [
     "1",
     328
    ],
    "units.fliskedel.ancillary.afrr_qualified": [
     "false",
     329
    ],
    "units.fliskedel.ancillary.mfrr_qualified": [
     "false",
     329
    ],
    "units.fliskedel.ancillary.fcr_qualified": [
     "false",
     329
    ],
    "units.fliskedel.commissioned": [
     "2009",
     330
    ],
    "units.halmkedel.enabled": [
     "true",
     333
    ],
    "units.halmkedel.type": [
     "\"biomass_boiler\"",
     334
    ],
    "units.halmkedel.p_max_heat": [
     "12.0",
     335
    ],
    "units.halmkedel.p_min_heat": [
     "4.0",
     336
    ],
    "units.halmkedel.alpha": [
     "0.0",
     337
    ],
    "units.halmkedel.fuel": [
     "\"straw\"",
     338
    ],
    "units.halmkedel.eta_fuel_to_heat": [
     "0.96",
     339
    ],
    "units.halmkedel.var_om": [
     "30.0",
     340
    ],
    "units.halmkedel.start_cost": [
     "8000.0",
     341
    ],
    "units.halmkedel.min_uptime": [
     "4",
     342
    ],
    "units.halmkedel.min_downtime": [
     "6",
     343
    ],
    "units.halmkedel.uc_enabled": [
     "true",
     344
    ],
    "units.halmkedel.initial_status": [
     "1",
     345
    ],
    "units.halmkedel.ancillary.afrr_qualified": [
     "false",
     346
    ],
    "units.halmkedel.ancillary.mfrr_qualified": [
     "false",
     346
    ],
    "units.halmkedel.ancillary.fcr_qualified": [
     "false",
     346
    ],
    "units.halmkedel.commissioned": [
     "2015",
     347
    ],
    "units.gasmotor.enabled": [
     "true",
     350
    ],
    "units.gasmotor.type": [
     "\"gas_engine_chp\"",
     351
    ],
    "units.gasmotor.p_max_heat": [
     "10.5",
     352
    ],
    "units.gasmotor.p_min_heat": [
     "0.9",
     353
    ],
    "units.gasmotor.alpha": [
     "0.838",
     354
    ],
    "units.gasmotor.fuel": [
     "\"natural_gas\"",
     355
    ],
    "units.gasmotor.eta_fuel_to_heat": [
     "0.49",
     356
    ],
    "units.gasmotor.var_om": [
     "608.0",
     357
    ],
    "units.gasmotor.start_cost": [
     "2000.0",
     358
    ],
    "units.gasmotor.min_uptime": [
     "2",
     359
    ],
    "units.gasmotor.min_downtime": [
     "2",
     360
    ],
    "units.gasmotor.uc_enabled": [
     "false",
     361
    ],
    "units.gasmotor.initial_status": [
     "0",
     362
    ],
    "units.gasmotor.co2_emissions_per_mwh_fuel": [
     "0.2",
     363
    ],
    "units.gasmotor.ancillary.afrr_qualified": [
     "true",
     365
    ],
    "units.gasmotor.ancillary.mfrr_qualified": [
     "true",
     366
    ],
    "units.gasmotor.ancillary.fcr_qualified": [
     "false",
     367
    ],
    "units.gasmotor.ancillary.afrr_max_bid_mw": [
     "1.0",
     368
    ],
    "units.gasmotor.ancillary.mfrr_max_bid_mw": [
     "2.0",
     369
    ],
    "units.gasmotor.commissioned": [
     "2000",
     370
    ],
    "units.gaskedel_agg.enabled": [
     "true",
     373
    ],
    "units.gaskedel_agg.type": [
     "\"gas_boiler\"",
     374
    ],
    "units.gaskedel_agg.p_max_heat": [
     "20.0",
     375
    ],
    "units.gaskedel_agg.p_min_heat": [
     "0.0",
     376
    ],
    "units.gaskedel_agg.alpha": [
     "0.0",
     377
    ],
    "units.gaskedel_agg.fuel": [
     "\"natural_gas\"",
     378
    ],
    "units.gaskedel_agg.eta_fuel_to_heat": [
     "0.95",
     379
    ],
    "units.gaskedel_agg.var_om": [
     "89.0",
     380
    ],
    "units.gaskedel_agg.start_cost": [
     "500.0",
     381
    ],
    "units.gaskedel_agg.min_uptime": [
     "1",
     382
    ],
    "units.gaskedel_agg.min_downtime": [
     "1",
     383
    ],
    "units.gaskedel_agg.uc_enabled": [
     "false",
     384
    ],
    "units.gaskedel_agg.co2_emissions_per_mwh_fuel": [
     "0.2",
     385
    ],
    "units.gaskedel_agg.ancillary.afrr_qualified": [
     "false",
     386
    ],
    "units.gaskedel_agg.ancillary.mfrr_qualified": [
     "false",
     386
    ],
    "units.gaskedel_agg.ancillary.fcr_qualified": [
     "false",
     386
    ],
    "units.solvarme.enabled": [
     "true",
     390
    ],
    "units.solvarme.type": [
     "\"solar_thermal\"",
     391
    ],
    "units.solvarme.p_max_heat": [
     "22.0",
     392
    ],
    "units.solvarme.p_min_heat": [
     "0.0",
     393
    ],
    "units.solvarme.alpha": [
     "0.0",
     394
    ],
    "units.solvarme.fuel": [
     "\"solar\"",
     395
    ],
    "units.solvarme.var_om": [
     "0.0",
     396
    ],
    "units.solvarme.start_cost": [
     "0.0",
     397
    ],
    "units.solvarme.uc_enabled": [
     "false",
     398
    ],
    "units.solvarme.production_profile_path": [
     "\"data/solar_andeby_dmi_karup.csv\"",
     399
    ],
    "units.solvarme.ancillary.afrr_qualified": [
     "false",
     400
    ],
    "units.solvarme.ancillary.mfrr_qualified": [
     "false",
     400
    ],
    "units.solvarme.ancillary.fcr_qualified": [
     "false",
     400
    ],
    "units.solvarme.notes": [
     "\"Profil fra målt DMI-globalstråling (karup) og solfangerligning; se scripts/solprofil_fra_dmi.py.\"",
     401
    ],
    "storage.tank_lav.enabled": [
     "true",
     417
    ],
    "storage.tank_lav.volume_m3": [
     "7000",
     418
    ],
    "storage.tank_lav.delta_t_k": [
     "30.0",
     419
    ],
    "storage.tank_lav.e_max_mwh": [
     "null",
     420
    ],
    "storage.tank_lav.e_initial_mwh": [
     "122",
     421
    ],
    "storage.tank_lav.p_max_charge_mw": [
     "25.0",
     422
    ],
    "storage.tank_lav.p_max_discharge_mw": [
     "25.0",
     423
    ],
    "storage.tank_lav.self_discharge_per_hour": [
     "0.0005",
     424
    ],
    "storage.tank_lav.cycle_binding": [
     "true",
     425
    ],
    "storage.tank_lav.notes": [
     "\"Lavtemperaturlag (fiktivt).\"",
     426
    ],
    "storage.tank_hoej.enabled": [
     "true",
     429
    ],
    "storage.tank_hoej.volume_m3": [
     "3000",
     430
    ],
    "storage.tank_hoej.delta_t_k": [
     "55.0",
     431
    ],
    "storage.tank_hoej.e_max_mwh": [
     "null",
     432
    ],
    "storage.tank_hoej.e_initial_mwh": [
     "96",
     433
    ],
    "storage.tank_hoej.p_max_charge_mw": [
     "25.0",
     434
    ],
    "storage.tank_hoej.p_max_discharge_mw": [
     "25.0",
     435
    ],
    "storage.tank_hoej.self_discharge_per_hour": [
     "0.0005",
     436
    ],
    "storage.tank_hoej.cycle_binding": [
     "true",
     437
    ],
    "storage.tank_hoej.notes": [
     "\"Højtemperaturlag (fiktivt).\"",
     438
    ],
    "balancing.method": [
     "\"activation_value\"",
     460
    ],
    "balancing.bid_strategy.up_markup_dkk_mwh": [
     "500",
     462
    ],
    "balancing.bid_strategy.up_markup_max_dkk_mwh": [
     "2000",
     463
    ],
    "balancing.ancillary_caps.per_unit_mw.vp_luft_vand": [
     "6.0",
     468
    ],
    "balancing.ancillary_caps.per_unit_market_mw.vp_luft_vand.afrr": [
     "2.0",
     473
    ],
    "balancing.ancillary_caps.per_unit_market_mw.vp_luft_vand.mfrr": [
     "3.0",
     473
    ],
    "balancing.ancillary_caps.total_mw": [
     "14.0",
     474
    ],
    "balancing.robust_reservation": [
     "true",
     479
    ],
    "balancing.activation.foresight": [
     "\"profile\"",
     481
    ],
    "balancing.activation.settle": [
     "\"forecast\"",
     482
    ],
    "balancing.activation.afrr.model": [
     "\"system_share\"",
     483
    ],
    "balancing.activation.afrr.k": [
     "4.0",
     483
    ],
    "balancing.activation.mfrr.model": [
     "\"clear\"",
     484
    ],
    "balancing.reservation_gate.enabled": [
     "false",
     503
    ],
    "balancing.reservation_gate.mode": [
     "\"bound\"",
     504
    ],
    "balancing.reservation_gate.afrr.opportunity_cost.reference_unit": [
     "\"vp_luft_vand\"",
     506
    ],
    "balancing.reservation_gate.afrr.opportunity_cost.floor_dkk_mw_h": [
     "50",
     506
    ],
    "balancing.reservation_gate.afrr.block_mw": [
     "3.0",
     507
    ],
    "balancing.reservation_gate.mfrr.opportunity_cost.reference_unit": [
     "\"vp_luft_vand\"",
     509
    ],
    "balancing.reservation_gate.mfrr.opportunity_cost.floor_dkk_mw_h": [
     "50",
     509
    ],
    "balancing.reservation_gate.mfrr.block_mw": [
     "4.0",
     510
    ],
    "investment.enabled": [
     "false",
     516
    ]
   }
  },
  "billund_idag": {
   "fil": "cases/billund_idag.yaml",
   "standard": {
    "kilde": "cases/billund_idag.yaml:24-25",
    "kommando": "python run_case.py cases/billund_idag.yaml --data-source github --with-balancing --heat-csv data/billund_abvaerk_hourly_splejset_jun2026.csv",
    "med_balancering": true,
    "heat_csv": "billund_abvaerk_hourly_splejset_jun2026.csv",
    "start": null,
    "slut": null,
    "balancing_method": null,
    "data_source": "github",
    "ekstra": []
   },
   "kommandoer": [
    {
     "kilde": "cases/billund_idag.yaml:24-25",
     "kommando": "python run_case.py cases/billund_idag.yaml --data-source github --with-balancing --heat-csv data/billund_abvaerk_hourly_splejset_jun2026.csv",
     "med_balancering": true,
     "heat_csv": "billund_abvaerk_hourly_splejset_jun2026.csv",
     "start": null,
     "slut": null,
     "balancing_method": null,
     "data_source": "github",
     "ekstra": []
    },
    {
     "kilde": "cases/billund_idag.yaml:28-30",
     "kommando": "python run_case.py cases/billund_idag.yaml --data-source github --with-balancing --df-data-cache data/df-data-2026niveau --heat-csv data/billund_abvaerk_hourly_splejset_jun2026.csv",
     "med_balancering": true,
     "heat_csv": "billund_abvaerk_hourly_splejset_jun2026.csv",
     "start": null,
     "slut": null,
     "balancing_method": null,
     "data_source": "github",
     "ekstra": [
      "--df-data-cache data/df-data-2026niveau"
     ]
    }
   ],
   "blade": {
    "meta.case_name": [
     "\"billund_idag\"",
     70
    ],
    "meta.description": [
     "\"Scenarie, ikke valideret: Billunds anlaeg i dag (ny 30 MW elkedel med, varmepumpen byder hele aaret) paa det rullende aar juli 2025-juni 2026. Spor A (kapacitetsprisgate, oevre graense). Op-bud = spot + 500 DKK/MWh.\\n\"",
     71
    ],
    "meta.timezone_internal": [
     "\"UTC\"",
     75
    ],
    "meta.timezone_reporting": [
     "\"Europe/Copenhagen\"",
     76
    ],
    "meta.discount_rate_real": [
     "0.035",
     77
    ],
    "meta.tax_year": [
     "2026",
     78
    ],
    "data.dmi_area": [
     "\"karup\"",
     90
    ],
    "data.price_zone": [
     "\"DK1\"",
     91
    ],
    "time.start": [
     "\"2025-07-01T00:00:00Z\"",
     99
    ],
    "time.end": [
     "\"2026-06-30T23:00:00Z\"",
     100
    ],
    "time.resolution": [
     "\"1h\"",
     101
    ],
    "heat_load_params.gaf_mw_per_k": [
     "0.9761",
     107
    ],
    "heat_load_params.t_ref": [
     "15.0",
     108
    ],
    "heat_load_params.thermal_inertia_hours": [
     "24",
     109
    ],
    "heat_load_params.nettab_slope_mw_per_k": [
     "0.6081",
     110
    ],
    "heat_load_params.t_net": [
     "12.0",
     111
    ],
    "heat_load_params.baseline_profile_mw": [
     "[5.66,5.74,5.87,6.08,6.15,6.52,7.13,7.15,6.83,6.32,6.09,5.99,5.82,5.7,5.63,5.56,5.65,5.87,6.03,6.08,6.04,6.03,5.88,5.6]",
     112
    ],
    "heat_load_params.weekly_dip": [
     "0.02",
     117
    ],
    "heat_load_params._source": [
     "\"Kalibreret mod Billund ab værk — ignoreres ved --heat-csv\"",
     118
    ],
    "prices.natural_gas.value": [
     "550.0",
     125
    ],
    "prices.natural_gas.unit": [
     "\"DKK/MWh_fuel\"",
     126
    ],
    "prices.straw.value": [
     "204.6",
     128
    ],
    "prices.straw.unit": [
     "\"DKK/MWh_fuel\"",
     129
    ],
    "prices.flis.value": [
     "195.8",
     131
    ],
    "prices.flis.unit": [
     "\"DKK/MWh_fuel\"",
     132
    ],
    "prices.waste_heat.value": [
     "50.0",
     134
    ],
    "prices.waste_heat.unit": [
     "\"DKK/MWh_fuel\"",
     135
    ],
    "prices.co2_eua.value": [
     "0.0",
     137
    ],
    "prices.co2_eua.unit": [
     "\"DKK/MWh_gas\"",
     138
    ],
    "electricity.spot_area": [
     "\"DK1\"",
     144
    ],
    "electricity.tariff_consumption_flat": [
     "128.2",
     145
    ],
    "electricity.tariff_production_flat": [
     "4.1",
     146
    ],
    "electricity.electricity_tax": [
     "4.0",
     147
    ],
    "units.vp_luft_vand.enabled": [
     "true",
     155
    ],
    "units.vp_luft_vand.type": [
     "\"heat_pump\"",
     156
    ],
    "units.vp_luft_vand.p_max_heat": [
     "21.0",
     159
    ],
    "units.vp_luft_vand.p_min_heat": [
     "0.0",
     160
    ],
    "units.vp_luft_vand.alpha": [
     "-0.3438",
     161
    ],
    "units.vp_luft_vand.fuel": [
     "\"electricity\"",
     162
    ],
    "units.vp_luft_vand.var_om": [
     "13.4",
     163
    ],
    "units.vp_luft_vand.start_cost": [
     "0.0",
     164
    ],
    "units.vp_luft_vand.min_uptime": [
     "1",
     165
    ],
    "units.vp_luft_vand.min_downtime": [
     "1",
     166
    ],
    "units.vp_luft_vand.uc_enabled": [
     "false",
     167
    ],
    "units.vp_luft_vand.cop_curve.type": [
     "\"table\"",
     173
    ],
    "units.vp_luft_vand.cop_curve.points": [
     "[{\"t_ambient\":-10.0,\"heat_mw\":12.0,\"el_mw\":5.0},{\"t_ambient\":0.0,\"heat_mw\":16.0,\"el_mw\":5.5},{\"t_ambient\":16.0,\"heat_mw\":21.0,\"el_mw\":6.2}]",
     174
    ],
    "units.vp_luft_vand.ancillary.afrr_qualified": [
     "true",
     179
    ],
    "units.vp_luft_vand.ancillary.mfrr_qualified": [
     "true",
     180
    ],
    "units.vp_luft_vand.ancillary.fcr_qualified": [
     "false",
     181
    ],
    "units.vp_luft_vand.commissioned": [
     "2025",
     185
    ],
    "units.elkedel_ny.enabled": [
     "true",
     189
    ],
    "units.elkedel_ny.type": [
     "\"electric_boiler\"",
     190
    ],
    "units.elkedel_ny.p_max_heat": [
     "30.0",
     191
    ],
    "units.elkedel_ny.p_min_heat": [
     "0.0",
     192
    ],
    "units.elkedel_ny.alpha": [
     "-1.0",
     193
    ],
    "units.elkedel_ny.fuel": [
     "\"electricity\"",
     194
    ],
    "units.elkedel_ny.var_om": [
     "13.4",
     195
    ],
    "units.elkedel_ny.start_cost": [
     "0.0",
     196
    ],
    "units.elkedel_ny.min_uptime": [
     "1",
     197
    ],
    "units.elkedel_ny.min_downtime": [
     "1",
     198
    ],
    "units.elkedel_ny.uc_enabled": [
     "false",
     199
    ],
    "units.elkedel_ny.ancillary.afrr_qualified": [
     "true",
     201
    ],
    "units.elkedel_ny.ancillary.mfrr_qualified": [
     "true",
     202
    ],
    "units.elkedel_ny.ancillary.fcr_qualified": [
     "false",
     203
    ],
    "units.elkedel_ny.commissioned": [
     "2026",
     204
    ],
    "units.elkedel_ny.notes": [
     "\"I drift; prækvalificeret (Billund 15/10-2026). Samlet eloptag er begrænset til 33 MW af nettilslutningen (grid-blokken).\"",
     205
    ],
    "units.elkedel_gl.enabled": [
     "true",
     208
    ],
    "units.elkedel_gl.type": [
     "\"electric_boiler\"",
     209
    ],
    "units.elkedel_gl.p_max_heat": [
     "12.0",
     210
    ],
    "units.elkedel_gl.p_min_heat": [
     "0.0",
     211
    ],
    "units.elkedel_gl.alpha": [
     "-1.0",
     212
    ],
    "units.elkedel_gl.fuel": [
     "\"electricity\"",
     213
    ],
    "units.elkedel_gl.var_om": [
     "6.71",
     214
    ],
    "units.elkedel_gl.start_cost": [
     "0.0",
     215
    ],
    "units.elkedel_gl.min_uptime": [
     "1",
     216
    ],
    "units.elkedel_gl.min_downtime": [
     "1",
     217
    ],
    "units.elkedel_gl.uc_enabled": [
     "false",
     218
    ],
    "units.elkedel_gl.ancillary.afrr_qualified": [
     "true",
     220
    ],
    "units.elkedel_gl.ancillary.mfrr_qualified": [
     "true",
     221
    ],
    "units.elkedel_gl.ancillary.fcr_qualified": [
     "false",
     222
    ],
    "units.elkedel_gl.commissioned": [
     "2021",
     223
    ],
    "units.fliskedel.enabled": [
     "true",
     226
    ],
    "units.fliskedel.type": [
     "\"biomass_boiler\"",
     227
    ],
    "units.fliskedel.p_max_heat": [
     "7.0",
     228
    ],
    "units.fliskedel.p_min_heat": [
     "2.5",
     229
    ],
    "units.fliskedel.alpha": [
     "0.0",
     230
    ],
    "units.fliskedel.fuel": [
     "\"flis\"",
     231
    ],
    "units.fliskedel.eta_fuel_to_heat": [
     "0.94",
     232
    ],
    "units.fliskedel.var_om": [
     "30.0",
     233
    ],
    "units.fliskedel.start_cost": [
     "5000.0",
     234
    ],
    "units.fliskedel.min_uptime": [
     "168",
     235
    ],
    "units.fliskedel.min_downtime": [
     "6",
     236
    ],
    "units.fliskedel.uc_enabled": [
     "true",
     237
    ],
    "units.fliskedel.initial_status": [
     "0",
     238
    ],
    "units.fliskedel.ancillary.afrr_qualified": [
     "false",
     239
    ],
    "units.fliskedel.ancillary.mfrr_qualified": [
     "false",
     239
    ],
    "units.fliskedel.ancillary.fcr_qualified": [
     "false",
     239
    ],
    "units.fliskedel.commissioned": [
     "2009",
     240
    ],
    "units.halmkedel.enabled": [
     "true",
     243
    ],
    "units.halmkedel.type": [
     "\"biomass_boiler\"",
     244
    ],
    "units.halmkedel.p_max_heat": [
     "12.0",
     245
    ],
    "units.halmkedel.p_min_heat": [
     "4.0",
     246
    ],
    "units.halmkedel.alpha": [
     "0.0",
     247
    ],
    "units.halmkedel.fuel": [
     "\"straw\"",
     248
    ],
    "units.halmkedel.eta_fuel_to_heat": [
     "0.96",
     249
    ],
    "units.halmkedel.var_om": [
     "30.0",
     250
    ],
    "units.halmkedel.start_cost": [
     "8000.0",
     251
    ],
    "units.halmkedel.min_uptime": [
     "4",
     252
    ],
    "units.halmkedel.min_downtime": [
     "6",
     253
    ],
    "units.halmkedel.uc_enabled": [
     "true",
     254
    ],
    "units.halmkedel.initial_status": [
     "0",
     255
    ],
    "units.halmkedel.ancillary.afrr_qualified": [
     "false",
     256
    ],
    "units.halmkedel.ancillary.mfrr_qualified": [
     "false",
     256
    ],
    "units.halmkedel.ancillary.fcr_qualified": [
     "false",
     256
    ],
    "units.halmkedel.commissioned": [
     "2015",
     257
    ],
    "units.gasmotor.enabled": [
     "true",
     260
    ],
    "units.gasmotor.type": [
     "\"gas_engine_chp\"",
     261
    ],
    "units.gasmotor.p_max_heat": [
     "2.8",
     262
    ],
    "units.gasmotor.p_min_heat": [
     "0.9",
     263
    ],
    "units.gasmotor.alpha": [
     "0.72",
     264
    ],
    "units.gasmotor.fuel": [
     "\"natural_gas\"",
     265
    ],
    "units.gasmotor.eta_fuel_to_heat": [
     "0.49",
     266
    ],
    "units.gasmotor.var_om": [
     "608.0",
     267
    ],
    "units.gasmotor.start_cost": [
     "2000.0",
     268
    ],
    "units.gasmotor.min_uptime": [
     "2",
     269
    ],
    "units.gasmotor.min_downtime": [
     "2",
     270
    ],
    "units.gasmotor.uc_enabled": [
     "false",
     271
    ],
    "units.gasmotor.initial_status": [
     "0",
     272
    ],
    "units.gasmotor.co2_emissions_per_mwh_fuel": [
     "0.0",
     273
    ],
    "units.gasmotor.ancillary.afrr_qualified": [
     "true",
     275
    ],
    "units.gasmotor.ancillary.mfrr_qualified": [
     "true",
     276
    ],
    "units.gasmotor.ancillary.fcr_qualified": [
     "false",
     277
    ],
    "units.gasmotor.ancillary.afrr_max_bid_mw": [
     "1.0",
     278
    ],
    "units.gasmotor.ancillary.mfrr_max_bid_mw": [
     "2.0",
     279
    ],
    "units.gasmotor.commissioned": [
     "2000",
     280
    ],
    "units.gaskedel_agg.enabled": [
     "true",
     283
    ],
    "units.gaskedel_agg.type": [
     "\"gas_boiler\"",
     284
    ],
    "units.gaskedel_agg.p_max_heat": [
     "16.3",
     285
    ],
    "units.gaskedel_agg.p_min_heat": [
     "0.0",
     286
    ],
    "units.gaskedel_agg.alpha": [
     "0.0",
     287
    ],
    "units.gaskedel_agg.fuel": [
     "\"natural_gas\"",
     288
    ],
    "units.gaskedel_agg.eta_fuel_to_heat": [
     "0.95",
     289
    ],
    "units.gaskedel_agg.var_om": [
     "89.0",
     290
    ],
    "units.gaskedel_agg.start_cost": [
     "500.0",
     291
    ],
    "units.gaskedel_agg.min_uptime": [
     "1",
     292
    ],
    "units.gaskedel_agg.min_downtime": [
     "1",
     293
    ],
    "units.gaskedel_agg.uc_enabled": [
     "false",
     294
    ],
    "units.gaskedel_agg.co2_emissions_per_mwh_fuel": [
     "0.0",
     295
    ],
    "units.gaskedel_agg.ancillary.afrr_qualified": [
     "false",
     296
    ],
    "units.gaskedel_agg.ancillary.mfrr_qualified": [
     "false",
     296
    ],
    "units.gaskedel_agg.ancillary.fcr_qualified": [
     "false",
     296
    ],
    "units.overskudsvarme.enabled": [
     "false",
     299
    ],
    "units.overskudsvarme.type": [
     "\"waste_heat\"",
     300
    ],
    "units.overskudsvarme.p_max_heat": [
     "4.0",
     301
    ],
    "units.overskudsvarme.p_min_heat": [
     "4.0",
     302
    ],
    "units.overskudsvarme.alpha": [
     "0.0",
     303
    ],
    "units.overskudsvarme.fuel": [
     "\"waste_heat\"",
     304
    ],
    "units.overskudsvarme.eta_fuel_to_heat": [
     "1.0",
     305
    ],
    "units.overskudsvarme.var_om": [
     "5.0",
     306
    ],
    "units.overskudsvarme.start_cost": [
     "0.0",
     307
    ],
    "units.overskudsvarme.min_uptime": [
     "1",
     308
    ],
    "units.overskudsvarme.min_downtime": [
     "1",
     309
    ],
    "units.overskudsvarme.uc_enabled": [
     "false",
     310
    ],
    "units.overskudsvarme.ancillary.afrr_qualified": [
     "false",
     311
    ],
    "units.overskudsvarme.ancillary.mfrr_qualified": [
     "false",
     311
    ],
    "units.overskudsvarme.ancillary.fcr_qualified": [
     "false",
     311
    ],
    "units.overskudsvarme.commissioned": [
     "2026",
     312
    ],
    "storage.tank_eksisterende.enabled": [
     "true",
     319
    ],
    "storage.tank_eksisterende.volume_m3": [
     "14000",
     320
    ],
    "storage.tank_eksisterende.delta_t_k": [
     "40.0",
     321
    ],
    "storage.tank_eksisterende.e_max_mwh": [
     "null",
     322
    ],
    "storage.tank_eksisterende.e_initial_mwh": [
     "279",
     323
    ],
    "storage.tank_eksisterende.p_max_charge_mw": [
     "60.0",
     324
    ],
    "storage.tank_eksisterende.p_max_discharge_mw": [
     "60.0",
     325
    ],
    "storage.tank_eksisterende.self_discharge_per_hour": [
     "0.0",
     326
    ],
    "storage.tank_eksisterende.cycle_binding": [
     "true",
     327
    ],
    "storage.tank_eksisterende.notes": [
     "\"Volumen bekræftet 14.000 m3. [BEKRÆFT delta_t: VP vinter 80C=40K, elkedler/biomasse 95C=55K, VP sommer 70C=30K — sæt sæson-/kilde-afhængigt]\"",
     328
    ],
    "balancing.method": [
     "\"activation_value\"",
     349
    ],
    "balancing.bid_strategy.up_markup_dkk_mwh": [
     "500",
     351
    ],
    "balancing.bid_strategy.up_markup_max_dkk_mwh": [
     "2000",
     352
    ],
    "balancing.ancillary_caps.per_unit_mw.vp_luft_vand": [
     "5.52",
     355
    ],
    "balancing.ancillary_caps.total_mw": [
     "47.52",
     356
    ],
    "balancing.reservation_gate.enabled": [
     "true",
     362
    ],
    "balancing.reservation_gate.mode": [
     "\"bound\"",
     363
    ],
    "balancing.reservation_gate.afrr.cm_threshold_dkk_mw_h": [
     "75",
     364
    ],
    "balancing.reservation_gate.afrr.block_mw": [
     "7.65",
     364
    ],
    "balancing.reservation_gate.mfrr.cm_threshold_dkk_mw_h": [
     "300",
     365
    ],
    "balancing.reservation_gate.mfrr.block_mw": [
     "12.1",
     365
    ],
    "grid.max_consumption_mw": [
     "33.0",
     373
    ],
    "investment.enabled": [
     "false",
     379
    ],
    "solver.mip_rel_gap": [
     "0.001",
     382
    ],
    "solver.mip_abs_gap": [
     "1000.0",
     383
    ],
    "solver.time_limit": [
     "3600.0",
     384
    ]
   }
  },
  "billund_spora": {
   "fil": "cases/billund_sporA.yaml",
   "standard": {
    "kilde": "README.md:176",
    "kommando": "python run_case.py cases/billund_sporA.yaml --data-source github --with-balancing",
    "med_balancering": true,
    "heat_csv": null,
    "start": null,
    "slut": null,
    "balancing_method": null,
    "data_source": "github",
    "ekstra": []
   },
   "kommandoer": [
    {
     "kilde": "README.md:176",
     "kommando": "python run_case.py cases/billund_sporA.yaml --data-source github --with-balancing",
     "med_balancering": true,
     "heat_csv": null,
     "start": null,
     "slut": null,
     "balancing_method": null,
     "data_source": "github",
     "ekstra": []
    }
   ],
   "blade": {
    "meta.case_name": [
     "\"billund_sporA\"",
     45
    ],
    "meta.description": [
     "\"Backtest af activation_value-balancering mod realiseret drift jan–april 2026. elkedel_ny under inkøring (ikke i drift). Total reserve-loft 14 MW = Billunds faktiske prækvalificering. Op-bud = spot + 500 DKK/MWh. Sammenlignes mod realiseret balance-facit.\\n\"",
     46
    ],
    "meta.timezone_internal": [
     "\"UTC\"",
     51
    ],
    "meta.timezone_reporting": [
     "\"Europe/Copenhagen\"",
     52
    ],
    "meta.discount_rate_real": [
     "0.035",
     53
    ],
    "meta.tax_year": [
     "2026",
     54
    ],
    "data.dmi_area": [
     "\"fyn\"",
     63
    ],
    "data.price_zone": [
     "\"DK1\"",
     64
    ],
    "time.start": [
     "\"2026-03-02T00:00:00Z\"",
     72
    ],
    "time.end": [
     "\"2026-06-23T23:00:00Z\"",
     73
    ],
    "time.resolution": [
     "\"1h\"",
     74
    ],
    "heat_load_params.gaf_mw_per_k": [
     "0.9761",
     80
    ],
    "heat_load_params.t_ref": [
     "15.0",
     81
    ],
    "heat_load_params.thermal_inertia_hours": [
     "24",
     82
    ],
    "heat_load_params.nettab_slope_mw_per_k": [
     "0.6081",
     83
    ],
    "heat_load_params.t_net": [
     "12.0",
     84
    ],
    "heat_load_params.baseline_profile_mw": [
     "[5.66,5.74,5.87,6.08,6.15,6.52,7.13,7.15,6.83,6.32,6.09,5.99,5.82,5.7,5.63,5.56,5.65,5.87,6.03,6.08,6.04,6.03,5.88,5.6]",
     85
    ],
    "heat_load_params.weekly_dip": [
     "0.02",
     90
    ],
    "heat_load_params._source": [
     "\"Kalibreret mod Billund ab værk — ignoreres ved --heat-csv\"",
     91
    ],
    "prices.natural_gas.value": [
     "550.0",
     98
    ],
    "prices.natural_gas.unit": [
     "\"DKK/MWh_fuel\"",
     99
    ],
    "prices.straw.value": [
     "204.6",
     101
    ],
    "prices.straw.unit": [
     "\"DKK/MWh_fuel\"",
     102
    ],
    "prices.flis.value": [
     "195.8",
     104
    ],
    "prices.flis.unit": [
     "\"DKK/MWh_fuel\"",
     105
    ],
    "prices.waste_heat.value": [
     "50.0",
     107
    ],
    "prices.waste_heat.unit": [
     "\"DKK/MWh_fuel\"",
     108
    ],
    "prices.co2_eua.value": [
     "0.0",
     110
    ],
    "prices.co2_eua.unit": [
     "\"DKK/MWh_gas\"",
     111
    ],
    "electricity.spot_area": [
     "\"DK1\"",
     117
    ],
    "electricity.tariff_consumption_flat": [
     "128.2",
     118
    ],
    "electricity.tariff_production_flat": [
     "4.1",
     119
    ],
    "electricity.electricity_tax": [
     "4.0",
     120
    ],
    "units.vp_luft_vand.enabled": [
     "true",
     128
    ],
    "units.vp_luft_vand.type": [
     "\"heat_pump\"",
     129
    ],
    "units.vp_luft_vand.p_max_heat": [
     "21.0",
     132
    ],
    "units.vp_luft_vand.p_min_heat": [
     "0.0",
     133
    ],
    "units.vp_luft_vand.alpha": [
     "-0.3438",
     134
    ],
    "units.vp_luft_vand.fuel": [
     "\"electricity\"",
     135
    ],
    "units.vp_luft_vand.var_om": [
     "13.4",
     136
    ],
    "units.vp_luft_vand.start_cost": [
     "0.0",
     137
    ],
    "units.vp_luft_vand.min_uptime": [
     "1",
     138
    ],
    "units.vp_luft_vand.min_downtime": [
     "1",
     139
    ],
    "units.vp_luft_vand.uc_enabled": [
     "false",
     140
    ],
    "units.vp_luft_vand.cop_curve.type": [
     "\"table\"",
     146
    ],
    "units.vp_luft_vand.cop_curve.points": [
     "[{\"t_ambient\":-10.0,\"heat_mw\":12.0,\"el_mw\":5.0},{\"t_ambient\":0.0,\"heat_mw\":16.0,\"el_mw\":5.5},{\"t_ambient\":16.0,\"heat_mw\":21.0,\"el_mw\":6.2}]",
     147
    ],
    "units.vp_luft_vand.ancillary.afrr_qualified": [
     "true",
     152
    ],
    "units.vp_luft_vand.ancillary.mfrr_qualified": [
     "true",
     153
    ],
    "units.vp_luft_vand.ancillary.fcr_qualified": [
     "false",
     154
    ],
    "units.vp_luft_vand.ancillary.available_from": [
     "\"2026-03-01\"",
     158
    ],
    "units.vp_luft_vand.commissioned": [
     "2025",
     159
    ],
    "units.elkedel_ny.enabled": [
     "false",
     163
    ],
    "units.elkedel_ny.type": [
     "\"electric_boiler\"",
     164
    ],
    "units.elkedel_ny.p_max_heat": [
     "30.0",
     165
    ],
    "units.elkedel_ny.p_min_heat": [
     "0.0",
     166
    ],
    "units.elkedel_ny.alpha": [
     "-1.0",
     167
    ],
    "units.elkedel_ny.fuel": [
     "\"electricity\"",
     168
    ],
    "units.elkedel_ny.var_om": [
     "13.4",
     169
    ],
    "units.elkedel_ny.start_cost": [
     "0.0",
     170
    ],
    "units.elkedel_ny.min_uptime": [
     "1",
     171
    ],
    "units.elkedel_ny.min_downtime": [
     "1",
     172
    ],
    "units.elkedel_ny.uc_enabled": [
     "false",
     173
    ],
    "units.elkedel_ny.ancillary.afrr_qualified": [
     "true",
     175
    ],
    "units.elkedel_ny.ancillary.mfrr_qualified": [
     "true",
     176
    ],
    "units.elkedel_ny.ancillary.fcr_qualified": [
     "false",
     177
    ],
    "units.elkedel_ny.commissioned": [
     "2026",
     178
    ],
    "units.elkedel_ny.notes": [
     "\"Under inkøring jan–apr 2026 — ikke i drift. Reserve-loftet (14 MW) er Billunds prækvalificering og er uafhængigt af denne enheds enabled-flag.\"",
     179
    ],
    "units.elkedel_gl.enabled": [
     "true",
     182
    ],
    "units.elkedel_gl.type": [
     "\"electric_boiler\"",
     183
    ],
    "units.elkedel_gl.p_max_heat": [
     "12.0",
     184
    ],
    "units.elkedel_gl.p_min_heat": [
     "0.0",
     185
    ],
    "units.elkedel_gl.alpha": [
     "-1.0",
     186
    ],
    "units.elkedel_gl.fuel": [
     "\"electricity\"",
     187
    ],
    "units.elkedel_gl.var_om": [
     "6.71",
     188
    ],
    "units.elkedel_gl.start_cost": [
     "0.0",
     189
    ],
    "units.elkedel_gl.min_uptime": [
     "1",
     190
    ],
    "units.elkedel_gl.min_downtime": [
     "1",
     191
    ],
    "units.elkedel_gl.uc_enabled": [
     "false",
     192
    ],
    "units.elkedel_gl.ancillary.afrr_qualified": [
     "true",
     194
    ],
    "units.elkedel_gl.ancillary.mfrr_qualified": [
     "true",
     195
    ],
    "units.elkedel_gl.ancillary.fcr_qualified": [
     "false",
     196
    ],
    "units.elkedel_gl.commissioned": [
     "2021",
     197
    ],
    "units.fliskedel.enabled": [
     "true",
     200
    ],
    "units.fliskedel.type": [
     "\"biomass_boiler\"",
     201
    ],
    "units.fliskedel.p_max_heat": [
     "7.0",
     202
    ],
    "units.fliskedel.p_min_heat": [
     "2.5",
     203
    ],
    "units.fliskedel.alpha": [
     "0.0",
     204
    ],
    "units.fliskedel.fuel": [
     "\"flis\"",
     205
    ],
    "units.fliskedel.eta_fuel_to_heat": [
     "0.94",
     206
    ],
    "units.fliskedel.var_om": [
     "30.0",
     207
    ],
    "units.fliskedel.start_cost": [
     "5000.0",
     208
    ],
    "units.fliskedel.min_uptime": [
     "168",
     209
    ],
    "units.fliskedel.min_downtime": [
     "6",
     210
    ],
    "units.fliskedel.uc_enabled": [
     "true",
     211
    ],
    "units.fliskedel.initial_status": [
     "1",
     212
    ],
    "units.fliskedel.ancillary.afrr_qualified": [
     "false",
     213
    ],
    "units.fliskedel.ancillary.mfrr_qualified": [
     "false",
     213
    ],
    "units.fliskedel.ancillary.fcr_qualified": [
     "false",
     213
    ],
    "units.fliskedel.commissioned": [
     "2009",
     214
    ],
    "units.halmkedel.enabled": [
     "true",
     217
    ],
    "units.halmkedel.type": [
     "\"biomass_boiler\"",
     218
    ],
    "units.halmkedel.p_max_heat": [
     "12.0",
     219
    ],
    "units.halmkedel.p_min_heat": [
     "4.0",
     220
    ],
    "units.halmkedel.alpha": [
     "0.0",
     221
    ],
    "units.halmkedel.fuel": [
     "\"straw\"",
     222
    ],
    "units.halmkedel.eta_fuel_to_heat": [
     "0.96",
     223
    ],
    "units.halmkedel.var_om": [
     "30.0",
     224
    ],
    "units.halmkedel.start_cost": [
     "8000.0",
     225
    ],
    "units.halmkedel.min_uptime": [
     "4",
     226
    ],
    "units.halmkedel.min_downtime": [
     "6",
     227
    ],
    "units.halmkedel.uc_enabled": [
     "true",
     228
    ],
    "units.halmkedel.initial_status": [
     "1",
     229
    ],
    "units.halmkedel.ancillary.afrr_qualified": [
     "false",
     230
    ],
    "units.halmkedel.ancillary.mfrr_qualified": [
     "false",
     230
    ],
    "units.halmkedel.ancillary.fcr_qualified": [
     "false",
     230
    ],
    "units.halmkedel.commissioned": [
     "2015",
     231
    ],
    "units.gasmotor.enabled": [
     "true",
     234
    ],
    "units.gasmotor.type": [
     "\"gas_engine_chp\"",
     235
    ],
    "units.gasmotor.p_max_heat": [
     "2.8",
     236
    ],
    "units.gasmotor.p_min_heat": [
     "0.9",
     237
    ],
    "units.gasmotor.alpha": [
     "0.72",
     238
    ],
    "units.gasmotor.fuel": [
     "\"natural_gas\"",
     239
    ],
    "units.gasmotor.eta_fuel_to_heat": [
     "0.49",
     240
    ],
    "units.gasmotor.var_om": [
     "608.0",
     241
    ],
    "units.gasmotor.start_cost": [
     "2000.0",
     242
    ],
    "units.gasmotor.min_uptime": [
     "2",
     243
    ],
    "units.gasmotor.min_downtime": [
     "2",
     244
    ],
    "units.gasmotor.uc_enabled": [
     "false",
     245
    ],
    "units.gasmotor.initial_status": [
     "0",
     246
    ],
    "units.gasmotor.co2_emissions_per_mwh_fuel": [
     "0.0",
     247
    ],
    "units.gasmotor.ancillary.afrr_qualified": [
     "true",
     249
    ],
    "units.gasmotor.ancillary.mfrr_qualified": [
     "true",
     250
    ],
    "units.gasmotor.ancillary.fcr_qualified": [
     "false",
     251
    ],
    "units.gasmotor.ancillary.afrr_max_bid_mw": [
     "1.0",
     252
    ],
    "units.gasmotor.ancillary.mfrr_max_bid_mw": [
     "2.0",
     253
    ],
    "units.gasmotor.commissioned": [
     "2000",
     254
    ],
    "units.gaskedel_agg.enabled": [
     "true",
     257
    ],
    "units.gaskedel_agg.type": [
     "\"gas_boiler\"",
     258
    ],
    "units.gaskedel_agg.p_max_heat": [
     "16.3",
     259
    ],
    "units.gaskedel_agg.p_min_heat": [
     "0.0",
     260
    ],
    "units.gaskedel_agg.alpha": [
     "0.0",
     261
    ],
    "units.gaskedel_agg.fuel": [
     "\"natural_gas\"",
     262
    ],
    "units.gaskedel_agg.eta_fuel_to_heat": [
     "0.95",
     263
    ],
    "units.gaskedel_agg.var_om": [
     "89.0",
     264
    ],
    "units.gaskedel_agg.start_cost": [
     "500.0",
     265
    ],
    "units.gaskedel_agg.min_uptime": [
     "1",
     266
    ],
    "units.gaskedel_agg.min_downtime": [
     "1",
     267
    ],
    "units.gaskedel_agg.uc_enabled": [
     "false",
     268
    ],
    "units.gaskedel_agg.co2_emissions_per_mwh_fuel": [
     "0.0",
     269
    ],
    "units.gaskedel_agg.ancillary.afrr_qualified": [
     "false",
     270
    ],
    "units.gaskedel_agg.ancillary.mfrr_qualified": [
     "false",
     270
    ],
    "units.gaskedel_agg.ancillary.fcr_qualified": [
     "false",
     270
    ],
    "units.overskudsvarme.enabled": [
     "false",
     273
    ],
    "units.overskudsvarme.type": [
     "\"waste_heat\"",
     274
    ],
    "units.overskudsvarme.p_max_heat": [
     "4.0",
     275
    ],
    "units.overskudsvarme.p_min_heat": [
     "4.0",
     276
    ],
    "units.overskudsvarme.alpha": [
     "0.0",
     277
    ],
    "units.overskudsvarme.fuel": [
     "\"waste_heat\"",
     278
    ],
    "units.overskudsvarme.eta_fuel_to_heat": [
     "1.0",
     279
    ],
    "units.overskudsvarme.var_om": [
     "5.0",
     280
    ],
    "units.overskudsvarme.start_cost": [
     "0.0",
     281
    ],
    "units.overskudsvarme.min_uptime": [
     "1",
     282
    ],
    "units.overskudsvarme.min_downtime": [
     "1",
     283
    ],
    "units.overskudsvarme.uc_enabled": [
     "false",
     284
    ],
    "units.overskudsvarme.ancillary.afrr_qualified": [
     "false",
     285
    ],
    "units.overskudsvarme.ancillary.mfrr_qualified": [
     "false",
     285
    ],
    "units.overskudsvarme.ancillary.fcr_qualified": [
     "false",
     285
    ],
    "units.overskudsvarme.commissioned": [
     "2026",
     286
    ],
    "storage.tank_eksisterende.enabled": [
     "true",
     293
    ],
    "storage.tank_eksisterende.volume_m3": [
     "14000",
     294
    ],
    "storage.tank_eksisterende.delta_t_k": [
     "40.0",
     295
    ],
    "storage.tank_eksisterende.e_max_mwh": [
     "null",
     296
    ],
    "storage.tank_eksisterende.e_initial_mwh": [
     "279",
     297
    ],
    "storage.tank_eksisterende.p_max_charge_mw": [
     "60.0",
     298
    ],
    "storage.tank_eksisterende.p_max_discharge_mw": [
     "60.0",
     299
    ],
    "storage.tank_eksisterende.self_discharge_per_hour": [
     "0.0",
     300
    ],
    "storage.tank_eksisterende.cycle_binding": [
     "true",
     301
    ],
    "storage.tank_eksisterende.notes": [
     "\"Volumen bekræftet 14.000 m3. [BEKRÆFT delta_t: VP vinter 80C=40K, elkedler/biomasse 95C=55K, VP sommer 70C=30K — sæt sæson-/kilde-afhængigt]\"",
     302
    ],
    "balancing.method": [
     "\"activation_value\"",
     326
    ],
    "balancing.bid_strategy.up_markup_dkk_mwh": [
     "500",
     328
    ],
    "balancing.bid_strategy.up_markup_max_dkk_mwh": [
     "2000",
     329
    ],
    "balancing.ancillary_caps.per_unit_mw.vp_luft_vand": [
     "5.52",
     332
    ],
    "balancing.ancillary_caps.total_mw": [
     "17.52",
     333
    ],
    "balancing.reservation_gate.enabled": [
     "true",
     339
    ],
    "balancing.reservation_gate.mode": [
     "\"bound\"",
     340
    ],
    "balancing.reservation_gate.afrr.cm_threshold_dkk_mw_h": [
     "75",
     341
    ],
    "balancing.reservation_gate.afrr.block_mw": [
     "2.82",
     341
    ],
    "balancing.reservation_gate.mfrr.cm_threshold_dkk_mw_h": [
     "300",
     342
    ],
    "balancing.reservation_gate.mfrr.block_mw": [
     "4.46",
     342
    ],
    "investment.enabled": [
     "false",
     349
    ]
   }
  },
  "billund_spora_rullende": {
   "fil": "cases/billund_sporA_rullende.yaml",
   "standard": {
    "kilde": "README.md:178",
    "kommando": "python run_case.py cases/billund_sporA_rullende.yaml --data-source github --with-balancing --heat-csv data/billund_abvaerk_hourly_splejset_jun2026.csv",
    "med_balancering": true,
    "heat_csv": "billund_abvaerk_hourly_splejset_jun2026.csv",
    "start": null,
    "slut": null,
    "balancing_method": null,
    "data_source": "github",
    "ekstra": []
   },
   "kommandoer": [
    {
     "kilde": "README.md:178",
     "kommando": "python run_case.py cases/billund_sporA_rullende.yaml --data-source github --with-balancing --heat-csv data/billund_abvaerk_hourly_splejset_jun2026.csv",
     "med_balancering": true,
     "heat_csv": "billund_abvaerk_hourly_splejset_jun2026.csv",
     "start": null,
     "slut": null,
     "balancing_method": null,
     "data_source": "github",
     "ekstra": []
    }
   ],
   "blade": {
    "meta.case_name": [
     "\"billund_sporA_rullende\"",
     56
    ],
    "meta.description": [
     "\"Backtest af activation_value-balancering mod realiseret drift jan–april 2026. elkedel_ny under inkøring (ikke i drift). Total reserve-loft 14 MW = Billunds faktiske prækvalificering. Op-bud = spot + 500 DKK/MWh. Sammenlignes mod realiseret balance-facit.\\n\"",
     57
    ],
    "meta.timezone_internal": [
     "\"UTC\"",
     62
    ],
    "meta.timezone_reporting": [
     "\"Europe/Copenhagen\"",
     63
    ],
    "meta.discount_rate_real": [
     "0.035",
     64
    ],
    "meta.tax_year": [
     "2026",
     65
    ],
    "data.dmi_area": [
     "\"karup\"",
     77
    ],
    "data.price_zone": [
     "\"DK1\"",
     78
    ],
    "time.start": [
     "\"2025-07-01T00:00:00Z\"",
     86
    ],
    "time.end": [
     "\"2026-06-30T23:00:00Z\"",
     87
    ],
    "time.resolution": [
     "\"1h\"",
     88
    ],
    "heat_load_params.gaf_mw_per_k": [
     "0.9761",
     94
    ],
    "heat_load_params.t_ref": [
     "15.0",
     95
    ],
    "heat_load_params.thermal_inertia_hours": [
     "24",
     96
    ],
    "heat_load_params.nettab_slope_mw_per_k": [
     "0.6081",
     97
    ],
    "heat_load_params.t_net": [
     "12.0",
     98
    ],
    "heat_load_params.baseline_profile_mw": [
     "[5.66,5.74,5.87,6.08,6.15,6.52,7.13,7.15,6.83,6.32,6.09,5.99,5.82,5.7,5.63,5.56,5.65,5.87,6.03,6.08,6.04,6.03,5.88,5.6]",
     99
    ],
    "heat_load_params.weekly_dip": [
     "0.02",
     104
    ],
    "heat_load_params._source": [
     "\"Kalibreret mod Billund ab værk — ignoreres ved --heat-csv\"",
     105
    ],
    "prices.natural_gas.value": [
     "550.0",
     112
    ],
    "prices.natural_gas.unit": [
     "\"DKK/MWh_fuel\"",
     113
    ],
    "prices.straw.value": [
     "204.6",
     115
    ],
    "prices.straw.unit": [
     "\"DKK/MWh_fuel\"",
     116
    ],
    "prices.flis.value": [
     "195.8",
     118
    ],
    "prices.flis.unit": [
     "\"DKK/MWh_fuel\"",
     119
    ],
    "prices.waste_heat.value": [
     "50.0",
     121
    ],
    "prices.waste_heat.unit": [
     "\"DKK/MWh_fuel\"",
     122
    ],
    "prices.co2_eua.value": [
     "0.0",
     124
    ],
    "prices.co2_eua.unit": [
     "\"DKK/MWh_gas\"",
     125
    ],
    "electricity.spot_area": [
     "\"DK1\"",
     131
    ],
    "electricity.tariff_consumption_flat": [
     "128.2",
     132
    ],
    "electricity.tariff_production_flat": [
     "4.1",
     133
    ],
    "electricity.electricity_tax": [
     "4.0",
     134
    ],
    "units.vp_luft_vand.enabled": [
     "true",
     142
    ],
    "units.vp_luft_vand.type": [
     "\"heat_pump\"",
     143
    ],
    "units.vp_luft_vand.p_max_heat": [
     "21.0",
     146
    ],
    "units.vp_luft_vand.p_min_heat": [
     "0.0",
     147
    ],
    "units.vp_luft_vand.alpha": [
     "-0.3438",
     148
    ],
    "units.vp_luft_vand.fuel": [
     "\"electricity\"",
     149
    ],
    "units.vp_luft_vand.var_om": [
     "13.4",
     150
    ],
    "units.vp_luft_vand.start_cost": [
     "0.0",
     151
    ],
    "units.vp_luft_vand.min_uptime": [
     "1",
     152
    ],
    "units.vp_luft_vand.min_downtime": [
     "1",
     153
    ],
    "units.vp_luft_vand.uc_enabled": [
     "false",
     154
    ],
    "units.vp_luft_vand.cop_curve.type": [
     "\"table\"",
     160
    ],
    "units.vp_luft_vand.cop_curve.points": [
     "[{\"t_ambient\":-10.0,\"heat_mw\":12.0,\"el_mw\":5.0},{\"t_ambient\":0.0,\"heat_mw\":16.0,\"el_mw\":5.5},{\"t_ambient\":16.0,\"heat_mw\":21.0,\"el_mw\":6.2}]",
     161
    ],
    "units.vp_luft_vand.ancillary.afrr_qualified": [
     "true",
     166
    ],
    "units.vp_luft_vand.ancillary.mfrr_qualified": [
     "true",
     167
    ],
    "units.vp_luft_vand.ancillary.fcr_qualified": [
     "false",
     168
    ],
    "units.vp_luft_vand.ancillary.available_from": [
     "\"2026-03-01\"",
     172
    ],
    "units.vp_luft_vand.commissioned": [
     "2025",
     173
    ],
    "units.elkedel_ny.enabled": [
     "false",
     177
    ],
    "units.elkedel_ny.type": [
     "\"electric_boiler\"",
     178
    ],
    "units.elkedel_ny.p_max_heat": [
     "30.0",
     179
    ],
    "units.elkedel_ny.p_min_heat": [
     "0.0",
     180
    ],
    "units.elkedel_ny.alpha": [
     "-1.0",
     181
    ],
    "units.elkedel_ny.fuel": [
     "\"electricity\"",
     182
    ],
    "units.elkedel_ny.var_om": [
     "13.4",
     183
    ],
    "units.elkedel_ny.start_cost": [
     "0.0",
     184
    ],
    "units.elkedel_ny.min_uptime": [
     "1",
     185
    ],
    "units.elkedel_ny.min_downtime": [
     "1",
     186
    ],
    "units.elkedel_ny.uc_enabled": [
     "false",
     187
    ],
    "units.elkedel_ny.ancillary.afrr_qualified": [
     "true",
     189
    ],
    "units.elkedel_ny.ancillary.mfrr_qualified": [
     "true",
     190
    ],
    "units.elkedel_ny.ancillary.fcr_qualified": [
     "false",
     191
    ],
    "units.elkedel_ny.commissioned": [
     "2026",
     192
    ],
    "units.elkedel_ny.notes": [
     "\"Under inkøring jan–apr 2026 — ikke i drift. Reserve-loftet (14 MW) er Billunds prækvalificering og er uafhængigt af denne enheds enabled-flag.\"",
     193
    ],
    "units.elkedel_gl.enabled": [
     "true",
     196
    ],
    "units.elkedel_gl.type": [
     "\"electric_boiler\"",
     197
    ],
    "units.elkedel_gl.p_max_heat": [
     "12.0",
     198
    ],
    "units.elkedel_gl.p_min_heat": [
     "0.0",
     199
    ],
    "units.elkedel_gl.alpha": [
     "-1.0",
     200
    ],
    "units.elkedel_gl.fuel": [
     "\"electricity\"",
     201
    ],
    "units.elkedel_gl.var_om": [
     "6.71",
     202
    ],
    "units.elkedel_gl.start_cost": [
     "0.0",
     203
    ],
    "units.elkedel_gl.min_uptime": [
     "1",
     204
    ],
    "units.elkedel_gl.min_downtime": [
     "1",
     205
    ],
    "units.elkedel_gl.uc_enabled": [
     "false",
     206
    ],
    "units.elkedel_gl.ancillary.afrr_qualified": [
     "true",
     208
    ],
    "units.elkedel_gl.ancillary.mfrr_qualified": [
     "true",
     209
    ],
    "units.elkedel_gl.ancillary.fcr_qualified": [
     "false",
     210
    ],
    "units.elkedel_gl.commissioned": [
     "2021",
     211
    ],
    "units.fliskedel.enabled": [
     "true",
     214
    ],
    "units.fliskedel.type": [
     "\"biomass_boiler\"",
     215
    ],
    "units.fliskedel.p_max_heat": [
     "7.0",
     216
    ],
    "units.fliskedel.p_min_heat": [
     "2.5",
     217
    ],
    "units.fliskedel.alpha": [
     "0.0",
     218
    ],
    "units.fliskedel.fuel": [
     "\"flis\"",
     219
    ],
    "units.fliskedel.eta_fuel_to_heat": [
     "0.94",
     220
    ],
    "units.fliskedel.var_om": [
     "30.0",
     221
    ],
    "units.fliskedel.start_cost": [
     "5000.0",
     222
    ],
    "units.fliskedel.min_uptime": [
     "168",
     223
    ],
    "units.fliskedel.min_downtime": [
     "6",
     224
    ],
    "units.fliskedel.uc_enabled": [
     "true",
     225
    ],
    "units.fliskedel.initial_status": [
     "0",
     226
    ],
    "units.fliskedel.ancillary.afrr_qualified": [
     "false",
     227
    ],
    "units.fliskedel.ancillary.mfrr_qualified": [
     "false",
     227
    ],
    "units.fliskedel.ancillary.fcr_qualified": [
     "false",
     227
    ],
    "units.fliskedel.commissioned": [
     "2009",
     228
    ],
    "units.halmkedel.enabled": [
     "true",
     231
    ],
    "units.halmkedel.type": [
     "\"biomass_boiler\"",
     232
    ],
    "units.halmkedel.p_max_heat": [
     "12.0",
     233
    ],
    "units.halmkedel.p_min_heat": [
     "4.0",
     234
    ],
    "units.halmkedel.alpha": [
     "0.0",
     235
    ],
    "units.halmkedel.fuel": [
     "\"straw\"",
     236
    ],
    "units.halmkedel.eta_fuel_to_heat": [
     "0.96",
     237
    ],
    "units.halmkedel.var_om": [
     "30.0",
     238
    ],
    "units.halmkedel.start_cost": [
     "8000.0",
     239
    ],
    "units.halmkedel.min_uptime": [
     "4",
     240
    ],
    "units.halmkedel.min_downtime": [
     "6",
     241
    ],
    "units.halmkedel.uc_enabled": [
     "true",
     242
    ],
    "units.halmkedel.initial_status": [
     "0",
     243
    ],
    "units.halmkedel.ancillary.afrr_qualified": [
     "false",
     244
    ],
    "units.halmkedel.ancillary.mfrr_qualified": [
     "false",
     244
    ],
    "units.halmkedel.ancillary.fcr_qualified": [
     "false",
     244
    ],
    "units.halmkedel.commissioned": [
     "2015",
     245
    ],
    "units.gasmotor.enabled": [
     "true",
     248
    ],
    "units.gasmotor.type": [
     "\"gas_engine_chp\"",
     249
    ],
    "units.gasmotor.p_max_heat": [
     "2.8",
     250
    ],
    "units.gasmotor.p_min_heat": [
     "0.9",
     251
    ],
    "units.gasmotor.alpha": [
     "0.72",
     252
    ],
    "units.gasmotor.fuel": [
     "\"natural_gas\"",
     253
    ],
    "units.gasmotor.eta_fuel_to_heat": [
     "0.49",
     254
    ],
    "units.gasmotor.var_om": [
     "608.0",
     255
    ],
    "units.gasmotor.start_cost": [
     "2000.0",
     256
    ],
    "units.gasmotor.min_uptime": [
     "2",
     257
    ],
    "units.gasmotor.min_downtime": [
     "2",
     258
    ],
    "units.gasmotor.uc_enabled": [
     "false",
     259
    ],
    "units.gasmotor.initial_status": [
     "0",
     260
    ],
    "units.gasmotor.co2_emissions_per_mwh_fuel": [
     "0.0",
     261
    ],
    "units.gasmotor.ancillary.afrr_qualified": [
     "true",
     263
    ],
    "units.gasmotor.ancillary.mfrr_qualified": [
     "true",
     264
    ],
    "units.gasmotor.ancillary.fcr_qualified": [
     "false",
     265
    ],
    "units.gasmotor.ancillary.afrr_max_bid_mw": [
     "1.0",
     266
    ],
    "units.gasmotor.ancillary.mfrr_max_bid_mw": [
     "2.0",
     267
    ],
    "units.gasmotor.commissioned": [
     "2000",
     268
    ],
    "units.gaskedel_agg.enabled": [
     "true",
     271
    ],
    "units.gaskedel_agg.type": [
     "\"gas_boiler\"",
     272
    ],
    "units.gaskedel_agg.p_max_heat": [
     "16.3",
     273
    ],
    "units.gaskedel_agg.p_min_heat": [
     "0.0",
     274
    ],
    "units.gaskedel_agg.alpha": [
     "0.0",
     275
    ],
    "units.gaskedel_agg.fuel": [
     "\"natural_gas\"",
     276
    ],
    "units.gaskedel_agg.eta_fuel_to_heat": [
     "0.95",
     277
    ],
    "units.gaskedel_agg.var_om": [
     "89.0",
     278
    ],
    "units.gaskedel_agg.start_cost": [
     "500.0",
     279
    ],
    "units.gaskedel_agg.min_uptime": [
     "1",
     280
    ],
    "units.gaskedel_agg.min_downtime": [
     "1",
     281
    ],
    "units.gaskedel_agg.uc_enabled": [
     "false",
     282
    ],
    "units.gaskedel_agg.co2_emissions_per_mwh_fuel": [
     "0.0",
     283
    ],
    "units.gaskedel_agg.ancillary.afrr_qualified": [
     "false",
     284
    ],
    "units.gaskedel_agg.ancillary.mfrr_qualified": [
     "false",
     284
    ],
    "units.gaskedel_agg.ancillary.fcr_qualified": [
     "false",
     284
    ],
    "units.overskudsvarme.enabled": [
     "false",
     287
    ],
    "units.overskudsvarme.type": [
     "\"waste_heat\"",
     288
    ],
    "units.overskudsvarme.p_max_heat": [
     "4.0",
     289
    ],
    "units.overskudsvarme.p_min_heat": [
     "4.0",
     290
    ],
    "units.overskudsvarme.alpha": [
     "0.0",
     291
    ],
    "units.overskudsvarme.fuel": [
     "\"waste_heat\"",
     292
    ],
    "units.overskudsvarme.eta_fuel_to_heat": [
     "1.0",
     293
    ],
    "units.overskudsvarme.var_om": [
     "5.0",
     294
    ],
    "units.overskudsvarme.start_cost": [
     "0.0",
     295
    ],
    "units.overskudsvarme.min_uptime": [
     "1",
     296
    ],
    "units.overskudsvarme.min_downtime": [
     "1",
     297
    ],
    "units.overskudsvarme.uc_enabled": [
     "false",
     298
    ],
    "units.overskudsvarme.ancillary.afrr_qualified": [
     "false",
     299
    ],
    "units.overskudsvarme.ancillary.mfrr_qualified": [
     "false",
     299
    ],
    "units.overskudsvarme.ancillary.fcr_qualified": [
     "false",
     299
    ],
    "units.overskudsvarme.commissioned": [
     "2026",
     300
    ],
    "storage.tank_eksisterende.enabled": [
     "true",
     307
    ],
    "storage.tank_eksisterende.volume_m3": [
     "14000",
     308
    ],
    "storage.tank_eksisterende.delta_t_k": [
     "40.0",
     309
    ],
    "storage.tank_eksisterende.e_max_mwh": [
     "null",
     310
    ],
    "storage.tank_eksisterende.e_initial_mwh": [
     "279",
     311
    ],
    "storage.tank_eksisterende.p_max_charge_mw": [
     "60.0",
     312
    ],
    "storage.tank_eksisterende.p_max_discharge_mw": [
     "60.0",
     313
    ],
    "storage.tank_eksisterende.self_discharge_per_hour": [
     "0.0",
     314
    ],
    "storage.tank_eksisterende.cycle_binding": [
     "true",
     315
    ],
    "storage.tank_eksisterende.notes": [
     "\"Volumen bekræftet 14.000 m3. [BEKRÆFT delta_t: VP vinter 80C=40K, elkedler/biomasse 95C=55K, VP sommer 70C=30K — sæt sæson-/kilde-afhængigt]\"",
     316
    ],
    "balancing.method": [
     "\"activation_value\"",
     340
    ],
    "balancing.bid_strategy.up_markup_dkk_mwh": [
     "500",
     342
    ],
    "balancing.bid_strategy.up_markup_max_dkk_mwh": [
     "2000",
     343
    ],
    "balancing.ancillary_caps.per_unit_mw.vp_luft_vand": [
     "5.52",
     346
    ],
    "balancing.ancillary_caps.total_mw": [
     "17.52",
     347
    ],
    "balancing.reservation_gate.enabled": [
     "true",
     353
    ],
    "balancing.reservation_gate.mode": [
     "\"bound\"",
     354
    ],
    "balancing.reservation_gate.afrr.cm_threshold_dkk_mw_h": [
     "75",
     355
    ],
    "balancing.reservation_gate.afrr.block_mw": [
     "2.82",
     355
    ],
    "balancing.reservation_gate.mfrr.cm_threshold_dkk_mw_h": [
     "300",
     356
    ],
    "balancing.reservation_gate.mfrr.block_mw": [
     "4.46",
     356
    ],
    "investment.enabled": [
     "false",
     363
    ]
   }
  },
  "billund_spora_rullende_bud": {
   "fil": "cases/billund_sporA_rullende_bud.yaml",
   "standard": null,
   "kommandoer": [],
   "blade": {
    "meta.case_name": [
     "\"billund_sporA_rullende_bud\"",
     56
    ],
    "meta.description": [
     "\"Backtest af activation_value-balancering mod realiseret drift jan–april 2026. elkedel_ny under inkøring (ikke i drift). Total reserve-loft 14 MW = Billunds faktiske prækvalificering. Op-bud = spot + 500 DKK/MWh. Sammenlignes mod realiseret balance-facit.\\n\"",
     57
    ],
    "meta.timezone_internal": [
     "\"UTC\"",
     62
    ],
    "meta.timezone_reporting": [
     "\"Europe/Copenhagen\"",
     63
    ],
    "meta.discount_rate_real": [
     "0.035",
     64
    ],
    "meta.tax_year": [
     "2026",
     65
    ],
    "data.dmi_area": [
     "\"karup\"",
     77
    ],
    "data.price_zone": [
     "\"DK1\"",
     78
    ],
    "time.start": [
     "\"2025-07-01T00:00:00Z\"",
     86
    ],
    "time.end": [
     "\"2026-06-30T23:00:00Z\"",
     87
    ],
    "time.resolution": [
     "\"1h\"",
     88
    ],
    "heat_load_params.gaf_mw_per_k": [
     "0.9761",
     94
    ],
    "heat_load_params.t_ref": [
     "15.0",
     95
    ],
    "heat_load_params.thermal_inertia_hours": [
     "24",
     96
    ],
    "heat_load_params.nettab_slope_mw_per_k": [
     "0.6081",
     97
    ],
    "heat_load_params.t_net": [
     "12.0",
     98
    ],
    "heat_load_params.baseline_profile_mw": [
     "[5.66,5.74,5.87,6.08,6.15,6.52,7.13,7.15,6.83,6.32,6.09,5.99,5.82,5.7,5.63,5.56,5.65,5.87,6.03,6.08,6.04,6.03,5.88,5.6]",
     99
    ],
    "heat_load_params.weekly_dip": [
     "0.02",
     104
    ],
    "heat_load_params._source": [
     "\"Kalibreret mod Billund ab værk — ignoreres ved --heat-csv\"",
     105
    ],
    "prices.natural_gas.value": [
     "550.0",
     112
    ],
    "prices.natural_gas.unit": [
     "\"DKK/MWh_fuel\"",
     113
    ],
    "prices.straw.value": [
     "204.6",
     115
    ],
    "prices.straw.unit": [
     "\"DKK/MWh_fuel\"",
     116
    ],
    "prices.flis.value": [
     "195.8",
     118
    ],
    "prices.flis.unit": [
     "\"DKK/MWh_fuel\"",
     119
    ],
    "prices.waste_heat.value": [
     "50.0",
     121
    ],
    "prices.waste_heat.unit": [
     "\"DKK/MWh_fuel\"",
     122
    ],
    "prices.co2_eua.value": [
     "0.0",
     124
    ],
    "prices.co2_eua.unit": [
     "\"DKK/MWh_gas\"",
     125
    ],
    "electricity.spot_area": [
     "\"DK1\"",
     131
    ],
    "electricity.tariff_consumption_flat": [
     "128.2",
     132
    ],
    "electricity.tariff_production_flat": [
     "4.1",
     133
    ],
    "electricity.electricity_tax": [
     "4.0",
     134
    ],
    "units.vp_luft_vand.enabled": [
     "true",
     142
    ],
    "units.vp_luft_vand.type": [
     "\"heat_pump\"",
     143
    ],
    "units.vp_luft_vand.p_max_heat": [
     "21.0",
     146
    ],
    "units.vp_luft_vand.p_min_heat": [
     "0.0",
     147
    ],
    "units.vp_luft_vand.alpha": [
     "-0.3438",
     148
    ],
    "units.vp_luft_vand.fuel": [
     "\"electricity\"",
     149
    ],
    "units.vp_luft_vand.var_om": [
     "13.4",
     150
    ],
    "units.vp_luft_vand.start_cost": [
     "0.0",
     151
    ],
    "units.vp_luft_vand.min_uptime": [
     "1",
     152
    ],
    "units.vp_luft_vand.min_downtime": [
     "1",
     153
    ],
    "units.vp_luft_vand.uc_enabled": [
     "false",
     154
    ],
    "units.vp_luft_vand.cop_curve.type": [
     "\"table\"",
     160
    ],
    "units.vp_luft_vand.cop_curve.points": [
     "[{\"t_ambient\":-10.0,\"heat_mw\":12.0,\"el_mw\":5.0},{\"t_ambient\":0.0,\"heat_mw\":16.0,\"el_mw\":5.5},{\"t_ambient\":16.0,\"heat_mw\":21.0,\"el_mw\":6.2}]",
     161
    ],
    "units.vp_luft_vand.ancillary.afrr_qualified": [
     "true",
     166
    ],
    "units.vp_luft_vand.ancillary.mfrr_qualified": [
     "true",
     167
    ],
    "units.vp_luft_vand.ancillary.fcr_qualified": [
     "false",
     168
    ],
    "units.vp_luft_vand.ancillary.available_from": [
     "\"2026-03-01\"",
     172
    ],
    "units.vp_luft_vand.commissioned": [
     "2025",
     173
    ],
    "units.elkedel_ny.enabled": [
     "false",
     177
    ],
    "units.elkedel_ny.type": [
     "\"electric_boiler\"",
     178
    ],
    "units.elkedel_ny.p_max_heat": [
     "30.0",
     179
    ],
    "units.elkedel_ny.p_min_heat": [
     "0.0",
     180
    ],
    "units.elkedel_ny.alpha": [
     "-1.0",
     181
    ],
    "units.elkedel_ny.fuel": [
     "\"electricity\"",
     182
    ],
    "units.elkedel_ny.var_om": [
     "13.4",
     183
    ],
    "units.elkedel_ny.start_cost": [
     "0.0",
     184
    ],
    "units.elkedel_ny.min_uptime": [
     "1",
     185
    ],
    "units.elkedel_ny.min_downtime": [
     "1",
     186
    ],
    "units.elkedel_ny.uc_enabled": [
     "false",
     187
    ],
    "units.elkedel_ny.ancillary.afrr_qualified": [
     "true",
     189
    ],
    "units.elkedel_ny.ancillary.mfrr_qualified": [
     "true",
     190
    ],
    "units.elkedel_ny.ancillary.fcr_qualified": [
     "false",
     191
    ],
    "units.elkedel_ny.commissioned": [
     "2026",
     192
    ],
    "units.elkedel_ny.notes": [
     "\"Under inkøring jan–apr 2026 — ikke i drift. Reserve-loftet (14 MW) er Billunds prækvalificering og er uafhængigt af denne enheds enabled-flag.\"",
     193
    ],
    "units.elkedel_gl.enabled": [
     "true",
     196
    ],
    "units.elkedel_gl.type": [
     "\"electric_boiler\"",
     197
    ],
    "units.elkedel_gl.p_max_heat": [
     "12.0",
     198
    ],
    "units.elkedel_gl.p_min_heat": [
     "0.0",
     199
    ],
    "units.elkedel_gl.alpha": [
     "-1.0",
     200
    ],
    "units.elkedel_gl.fuel": [
     "\"electricity\"",
     201
    ],
    "units.elkedel_gl.var_om": [
     "6.71",
     202
    ],
    "units.elkedel_gl.start_cost": [
     "0.0",
     203
    ],
    "units.elkedel_gl.min_uptime": [
     "1",
     204
    ],
    "units.elkedel_gl.min_downtime": [
     "1",
     205
    ],
    "units.elkedel_gl.uc_enabled": [
     "false",
     206
    ],
    "units.elkedel_gl.ancillary.afrr_qualified": [
     "true",
     208
    ],
    "units.elkedel_gl.ancillary.mfrr_qualified": [
     "true",
     209
    ],
    "units.elkedel_gl.ancillary.fcr_qualified": [
     "false",
     210
    ],
    "units.elkedel_gl.commissioned": [
     "2021",
     211
    ],
    "units.fliskedel.enabled": [
     "true",
     214
    ],
    "units.fliskedel.type": [
     "\"biomass_boiler\"",
     215
    ],
    "units.fliskedel.p_max_heat": [
     "7.0",
     216
    ],
    "units.fliskedel.p_min_heat": [
     "2.5",
     217
    ],
    "units.fliskedel.alpha": [
     "0.0",
     218
    ],
    "units.fliskedel.fuel": [
     "\"flis\"",
     219
    ],
    "units.fliskedel.eta_fuel_to_heat": [
     "0.94",
     220
    ],
    "units.fliskedel.var_om": [
     "30.0",
     221
    ],
    "units.fliskedel.start_cost": [
     "5000.0",
     222
    ],
    "units.fliskedel.min_uptime": [
     "168",
     223
    ],
    "units.fliskedel.min_downtime": [
     "6",
     224
    ],
    "units.fliskedel.uc_enabled": [
     "true",
     225
    ],
    "units.fliskedel.initial_status": [
     "0",
     226
    ],
    "units.fliskedel.ancillary.afrr_qualified": [
     "false",
     227
    ],
    "units.fliskedel.ancillary.mfrr_qualified": [
     "false",
     227
    ],
    "units.fliskedel.ancillary.fcr_qualified": [
     "false",
     227
    ],
    "units.fliskedel.commissioned": [
     "2009",
     228
    ],
    "units.halmkedel.enabled": [
     "true",
     231
    ],
    "units.halmkedel.type": [
     "\"biomass_boiler\"",
     232
    ],
    "units.halmkedel.p_max_heat": [
     "12.0",
     233
    ],
    "units.halmkedel.p_min_heat": [
     "4.0",
     234
    ],
    "units.halmkedel.alpha": [
     "0.0",
     235
    ],
    "units.halmkedel.fuel": [
     "\"straw\"",
     236
    ],
    "units.halmkedel.eta_fuel_to_heat": [
     "0.96",
     237
    ],
    "units.halmkedel.var_om": [
     "30.0",
     238
    ],
    "units.halmkedel.start_cost": [
     "8000.0",
     239
    ],
    "units.halmkedel.min_uptime": [
     "4",
     240
    ],
    "units.halmkedel.min_downtime": [
     "6",
     241
    ],
    "units.halmkedel.uc_enabled": [
     "true",
     242
    ],
    "units.halmkedel.initial_status": [
     "0",
     243
    ],
    "units.halmkedel.ancillary.afrr_qualified": [
     "false",
     244
    ],
    "units.halmkedel.ancillary.mfrr_qualified": [
     "false",
     244
    ],
    "units.halmkedel.ancillary.fcr_qualified": [
     "false",
     244
    ],
    "units.halmkedel.commissioned": [
     "2015",
     245
    ],
    "units.gasmotor.enabled": [
     "true",
     248
    ],
    "units.gasmotor.type": [
     "\"gas_engine_chp\"",
     249
    ],
    "units.gasmotor.p_max_heat": [
     "2.8",
     250
    ],
    "units.gasmotor.p_min_heat": [
     "0.9",
     251
    ],
    "units.gasmotor.alpha": [
     "0.72",
     252
    ],
    "units.gasmotor.fuel": [
     "\"natural_gas\"",
     253
    ],
    "units.gasmotor.eta_fuel_to_heat": [
     "0.49",
     254
    ],
    "units.gasmotor.var_om": [
     "608.0",
     255
    ],
    "units.gasmotor.start_cost": [
     "2000.0",
     256
    ],
    "units.gasmotor.min_uptime": [
     "2",
     257
    ],
    "units.gasmotor.min_downtime": [
     "2",
     258
    ],
    "units.gasmotor.uc_enabled": [
     "false",
     259
    ],
    "units.gasmotor.initial_status": [
     "0",
     260
    ],
    "units.gasmotor.co2_emissions_per_mwh_fuel": [
     "0.0",
     261
    ],
    "units.gasmotor.ancillary.afrr_qualified": [
     "true",
     263
    ],
    "units.gasmotor.ancillary.mfrr_qualified": [
     "true",
     264
    ],
    "units.gasmotor.ancillary.fcr_qualified": [
     "false",
     265
    ],
    "units.gasmotor.ancillary.afrr_max_bid_mw": [
     "1.0",
     266
    ],
    "units.gasmotor.ancillary.mfrr_max_bid_mw": [
     "2.0",
     267
    ],
    "units.gasmotor.commissioned": [
     "2000",
     268
    ],
    "units.gaskedel_agg.enabled": [
     "true",
     271
    ],
    "units.gaskedel_agg.type": [
     "\"gas_boiler\"",
     272
    ],
    "units.gaskedel_agg.p_max_heat": [
     "16.3",
     273
    ],
    "units.gaskedel_agg.p_min_heat": [
     "0.0",
     274
    ],
    "units.gaskedel_agg.alpha": [
     "0.0",
     275
    ],
    "units.gaskedel_agg.fuel": [
     "\"natural_gas\"",
     276
    ],
    "units.gaskedel_agg.eta_fuel_to_heat": [
     "0.95",
     277
    ],
    "units.gaskedel_agg.var_om": [
     "89.0",
     278
    ],
    "units.gaskedel_agg.start_cost": [
     "500.0",
     279
    ],
    "units.gaskedel_agg.min_uptime": [
     "1",
     280
    ],
    "units.gaskedel_agg.min_downtime": [
     "1",
     281
    ],
    "units.gaskedel_agg.uc_enabled": [
     "false",
     282
    ],
    "units.gaskedel_agg.co2_emissions_per_mwh_fuel": [
     "0.0",
     283
    ],
    "units.gaskedel_agg.ancillary.afrr_qualified": [
     "false",
     284
    ],
    "units.gaskedel_agg.ancillary.mfrr_qualified": [
     "false",
     284
    ],
    "units.gaskedel_agg.ancillary.fcr_qualified": [
     "false",
     284
    ],
    "units.overskudsvarme.enabled": [
     "false",
     287
    ],
    "units.overskudsvarme.type": [
     "\"waste_heat\"",
     288
    ],
    "units.overskudsvarme.p_max_heat": [
     "4.0",
     289
    ],
    "units.overskudsvarme.p_min_heat": [
     "4.0",
     290
    ],
    "units.overskudsvarme.alpha": [
     "0.0",
     291
    ],
    "units.overskudsvarme.fuel": [
     "\"waste_heat\"",
     292
    ],
    "units.overskudsvarme.eta_fuel_to_heat": [
     "1.0",
     293
    ],
    "units.overskudsvarme.var_om": [
     "5.0",
     294
    ],
    "units.overskudsvarme.start_cost": [
     "0.0",
     295
    ],
    "units.overskudsvarme.min_uptime": [
     "1",
     296
    ],
    "units.overskudsvarme.min_downtime": [
     "1",
     297
    ],
    "units.overskudsvarme.uc_enabled": [
     "false",
     298
    ],
    "units.overskudsvarme.ancillary.afrr_qualified": [
     "false",
     299
    ],
    "units.overskudsvarme.ancillary.mfrr_qualified": [
     "false",
     299
    ],
    "units.overskudsvarme.ancillary.fcr_qualified": [
     "false",
     299
    ],
    "units.overskudsvarme.commissioned": [
     "2026",
     300
    ],
    "storage.tank_eksisterende.enabled": [
     "true",
     307
    ],
    "storage.tank_eksisterende.volume_m3": [
     "14000",
     308
    ],
    "storage.tank_eksisterende.delta_t_k": [
     "40.0",
     309
    ],
    "storage.tank_eksisterende.e_max_mwh": [
     "null",
     310
    ],
    "storage.tank_eksisterende.e_initial_mwh": [
     "279",
     311
    ],
    "storage.tank_eksisterende.p_max_charge_mw": [
     "60.0",
     312
    ],
    "storage.tank_eksisterende.p_max_discharge_mw": [
     "60.0",
     313
    ],
    "storage.tank_eksisterende.self_discharge_per_hour": [
     "0.0",
     314
    ],
    "storage.tank_eksisterende.cycle_binding": [
     "true",
     315
    ],
    "storage.tank_eksisterende.notes": [
     "\"Volumen bekræftet 14.000 m3. [BEKRÆFT delta_t: VP vinter 80C=40K, elkedler/biomasse 95C=55K, VP sommer 70C=30K — sæt sæson-/kilde-afhængigt]\"",
     316
    ],
    "balancing.method": [
     "\"activation_value\"",
     340
    ],
    "balancing.bid_strategy.up_markup_dkk_mwh": [
     "500",
     342
    ],
    "balancing.bid_strategy.up_markup_max_dkk_mwh": [
     "2000",
     343
    ],
    "balancing.ancillary_caps.per_unit_mw.vp_luft_vand": [
     "5.52",
     346
    ],
    "balancing.ancillary_caps.total_mw": [
     "17.52",
     347
    ],
    "balancing.reservation_gate.enabled": [
     "true",
     356
    ],
    "balancing.reservation_gate.mode": [
     "\"bound\"",
     357
    ],
    "balancing.reservation_gate.afrr.cm_threshold_dkk_mw_h": [
     "75",
     358
    ],
    "balancing.reservation_gate.afrr.block_mw": [
     "17.52",
     358
    ],
    "balancing.reservation_gate.mfrr.cm_threshold_dkk_mw_h": [
     "300",
     359
    ],
    "balancing.reservation_gate.mfrr.block_mw": [
     "17.52",
     359
    ],
    "balancing.robust_reservation": [
     "true",
     364
    ],
    "balancing.activation.foresight": [
     "\"profile\"",
     366
    ],
    "balancing.activation.settle": [
     "\"realized\"",
     367
    ],
    "balancing.activation.afrr.model": [
     "\"system_share\"",
     368
    ],
    "balancing.activation.afrr.k": [
     "4.0",
     368
    ],
    "balancing.activation.mfrr.model": [
     "\"clear\"",
     369
    ],
    "investment.enabled": [
     "false",
     376
    ]
   }
  },
  "billund_sporb": {
   "fil": "cases/billund_sporB.yaml",
   "standard": {
    "kilde": "cases/billund_sporB.yaml:17-19",
    "kommando": "python run_case.py cases/billund_sporB.yaml --data-source github --with-balancing --heat-csv data/billund_abvaerk_hourly_splejset_jun2026.csv",
    "med_balancering": true,
    "heat_csv": "billund_abvaerk_hourly_splejset_jun2026.csv",
    "start": null,
    "slut": null,
    "balancing_method": null,
    "data_source": "github",
    "ekstra": []
   },
   "kommandoer": [
    {
     "kilde": "cases/billund_sporB.yaml:17-19",
     "kommando": "python run_case.py cases/billund_sporB.yaml --data-source github --with-balancing --heat-csv data/billund_abvaerk_hourly_splejset_jun2026.csv",
     "med_balancering": true,
     "heat_csv": "billund_abvaerk_hourly_splejset_jun2026.csv",
     "start": null,
     "slut": null,
     "balancing_method": null,
     "data_source": "github",
     "ekstra": []
    },
    {
     "kilde": "README.md:177",
     "kommando": "python run_case.py cases/billund_sporB.yaml --data-source github --with-balancing --heat-csv data/billund_abvaerk_hourly_splejset_jun2026.csv",
     "med_balancering": true,
     "heat_csv": "billund_abvaerk_hourly_splejset_jun2026.csv",
     "start": null,
     "slut": null,
     "balancing_method": null,
     "data_source": "github",
     "ekstra": []
    }
   ],
   "blade": {
    "meta.case_name": [
     "\"billund_sporB\"",
     46
    ],
    "meta.description": [
     "\"Backtest af activation_value-balancering mod realiseret drift jan–april 2026. elkedel_ny under inkøring (ikke i drift). Total reserve-loft 14 MW = Billunds faktiske prækvalificering. Op-bud = spot + 500 DKK/MWh. Sammenlignes mod realiseret balance-facit.\\n\"",
     47
    ],
    "meta.timezone_internal": [
     "\"UTC\"",
     52
    ],
    "meta.timezone_reporting": [
     "\"Europe/Copenhagen\"",
     53
    ],
    "meta.discount_rate_real": [
     "0.035",
     54
    ],
    "meta.tax_year": [
     "2026",
     55
    ],
    "data.dmi_area": [
     "\"fyn\"",
     64
    ],
    "data.price_zone": [
     "\"DK1\"",
     65
    ],
    "time.start": [
     "\"2026-03-02T00:00:00Z\"",
     78
    ],
    "time.end": [
     "\"2026-06-30T23:00:00Z\"",
     79
    ],
    "time.resolution": [
     "\"1h\"",
     80
    ],
    "heat_load_params.gaf_mw_per_k": [
     "0.9761",
     86
    ],
    "heat_load_params.t_ref": [
     "15.0",
     87
    ],
    "heat_load_params.thermal_inertia_hours": [
     "24",
     88
    ],
    "heat_load_params.nettab_slope_mw_per_k": [
     "0.6081",
     89
    ],
    "heat_load_params.t_net": [
     "12.0",
     90
    ],
    "heat_load_params.baseline_profile_mw": [
     "[5.66,5.74,5.87,6.08,6.15,6.52,7.13,7.15,6.83,6.32,6.09,5.99,5.82,5.7,5.63,5.56,5.65,5.87,6.03,6.08,6.04,6.03,5.88,5.6]",
     91
    ],
    "heat_load_params.weekly_dip": [
     "0.02",
     96
    ],
    "heat_load_params._source": [
     "\"Kalibreret mod Billund ab værk — ignoreres ved --heat-csv\"",
     97
    ],
    "prices.natural_gas.value": [
     "550.0",
     104
    ],
    "prices.natural_gas.unit": [
     "\"DKK/MWh_fuel\"",
     105
    ],
    "prices.straw.value": [
     "204.6",
     107
    ],
    "prices.straw.unit": [
     "\"DKK/MWh_fuel\"",
     108
    ],
    "prices.flis.value": [
     "195.8",
     110
    ],
    "prices.flis.unit": [
     "\"DKK/MWh_fuel\"",
     111
    ],
    "prices.waste_heat.value": [
     "50.0",
     113
    ],
    "prices.waste_heat.unit": [
     "\"DKK/MWh_fuel\"",
     114
    ],
    "prices.co2_eua.value": [
     "0.0",
     116
    ],
    "prices.co2_eua.unit": [
     "\"DKK/MWh_gas\"",
     117
    ],
    "electricity.spot_area": [
     "\"DK1\"",
     123
    ],
    "electricity.tariff_consumption_flat": [
     "128.2",
     124
    ],
    "electricity.tariff_production_flat": [
     "4.1",
     125
    ],
    "electricity.electricity_tax": [
     "4.0",
     126
    ],
    "units.vp_luft_vand.enabled": [
     "true",
     134
    ],
    "units.vp_luft_vand.type": [
     "\"heat_pump\"",
     135
    ],
    "units.vp_luft_vand.p_max_heat": [
     "21.0",
     138
    ],
    "units.vp_luft_vand.p_min_heat": [
     "0.0",
     139
    ],
    "units.vp_luft_vand.alpha": [
     "-0.3438",
     140
    ],
    "units.vp_luft_vand.fuel": [
     "\"electricity\"",
     141
    ],
    "units.vp_luft_vand.var_om": [
     "13.4",
     142
    ],
    "units.vp_luft_vand.start_cost": [
     "0.0",
     143
    ],
    "units.vp_luft_vand.min_uptime": [
     "1",
     144
    ],
    "units.vp_luft_vand.min_downtime": [
     "1",
     145
    ],
    "units.vp_luft_vand.uc_enabled": [
     "false",
     146
    ],
    "units.vp_luft_vand.cop_curve.type": [
     "\"table\"",
     152
    ],
    "units.vp_luft_vand.cop_curve.points": [
     "[{\"t_ambient\":-10.0,\"heat_mw\":12.0,\"el_mw\":5.0},{\"t_ambient\":0.0,\"heat_mw\":16.0,\"el_mw\":5.5},{\"t_ambient\":16.0,\"heat_mw\":21.0,\"el_mw\":6.2}]",
     153
    ],
    "units.vp_luft_vand.ancillary.afrr_qualified": [
     "true",
     158
    ],
    "units.vp_luft_vand.ancillary.mfrr_qualified": [
     "true",
     159
    ],
    "units.vp_luft_vand.ancillary.fcr_qualified": [
     "false",
     160
    ],
    "units.vp_luft_vand.ancillary.available_from": [
     "\"2026-03-01\"",
     164
    ],
    "units.vp_luft_vand.commissioned": [
     "2025",
     165
    ],
    "units.elkedel_ny.enabled": [
     "false",
     169
    ],
    "units.elkedel_ny.type": [
     "\"electric_boiler\"",
     170
    ],
    "units.elkedel_ny.p_max_heat": [
     "30.0",
     171
    ],
    "units.elkedel_ny.p_min_heat": [
     "0.0",
     172
    ],
    "units.elkedel_ny.alpha": [
     "-1.0",
     173
    ],
    "units.elkedel_ny.fuel": [
     "\"electricity\"",
     174
    ],
    "units.elkedel_ny.var_om": [
     "13.4",
     175
    ],
    "units.elkedel_ny.start_cost": [
     "0.0",
     176
    ],
    "units.elkedel_ny.min_uptime": [
     "1",
     177
    ],
    "units.elkedel_ny.min_downtime": [
     "1",
     178
    ],
    "units.elkedel_ny.uc_enabled": [
     "false",
     179
    ],
    "units.elkedel_ny.ancillary.afrr_qualified": [
     "true",
     181
    ],
    "units.elkedel_ny.ancillary.mfrr_qualified": [
     "true",
     182
    ],
    "units.elkedel_ny.ancillary.fcr_qualified": [
     "false",
     183
    ],
    "units.elkedel_ny.commissioned": [
     "2026",
     184
    ],
    "units.elkedel_ny.notes": [
     "\"Under inkøring jan–apr 2026 — ikke i drift. Reserve-loftet (14 MW) er Billunds prækvalificering og er uafhængigt af denne enheds enabled-flag.\"",
     185
    ],
    "units.elkedel_gl.enabled": [
     "true",
     188
    ],
    "units.elkedel_gl.type": [
     "\"electric_boiler\"",
     189
    ],
    "units.elkedel_gl.p_max_heat": [
     "12.0",
     190
    ],
    "units.elkedel_gl.p_min_heat": [
     "0.0",
     191
    ],
    "units.elkedel_gl.alpha": [
     "-1.0",
     192
    ],
    "units.elkedel_gl.fuel": [
     "\"electricity\"",
     193
    ],
    "units.elkedel_gl.var_om": [
     "6.71",
     194
    ],
    "units.elkedel_gl.start_cost": [
     "0.0",
     195
    ],
    "units.elkedel_gl.min_uptime": [
     "1",
     196
    ],
    "units.elkedel_gl.min_downtime": [
     "1",
     197
    ],
    "units.elkedel_gl.uc_enabled": [
     "false",
     198
    ],
    "units.elkedel_gl.ancillary.afrr_qualified": [
     "true",
     200
    ],
    "units.elkedel_gl.ancillary.mfrr_qualified": [
     "true",
     201
    ],
    "units.elkedel_gl.ancillary.fcr_qualified": [
     "false",
     202
    ],
    "units.elkedel_gl.commissioned": [
     "2021",
     203
    ],
    "units.fliskedel.enabled": [
     "true",
     206
    ],
    "units.fliskedel.type": [
     "\"biomass_boiler\"",
     207
    ],
    "units.fliskedel.p_max_heat": [
     "7.0",
     208
    ],
    "units.fliskedel.p_min_heat": [
     "2.5",
     209
    ],
    "units.fliskedel.alpha": [
     "0.0",
     210
    ],
    "units.fliskedel.fuel": [
     "\"flis\"",
     211
    ],
    "units.fliskedel.eta_fuel_to_heat": [
     "0.94",
     212
    ],
    "units.fliskedel.var_om": [
     "30.0",
     213
    ],
    "units.fliskedel.start_cost": [
     "5000.0",
     214
    ],
    "units.fliskedel.min_uptime": [
     "168",
     215
    ],
    "units.fliskedel.min_downtime": [
     "6",
     216
    ],
    "units.fliskedel.uc_enabled": [
     "true",
     217
    ],
    "units.fliskedel.initial_status": [
     "1",
     218
    ],
    "units.fliskedel.ancillary.afrr_qualified": [
     "false",
     219
    ],
    "units.fliskedel.ancillary.mfrr_qualified": [
     "false",
     219
    ],
    "units.fliskedel.ancillary.fcr_qualified": [
     "false",
     219
    ],
    "units.fliskedel.commissioned": [
     "2009",
     220
    ],
    "units.halmkedel.enabled": [
     "true",
     223
    ],
    "units.halmkedel.type": [
     "\"biomass_boiler\"",
     224
    ],
    "units.halmkedel.p_max_heat": [
     "12.0",
     225
    ],
    "units.halmkedel.p_min_heat": [
     "4.0",
     226
    ],
    "units.halmkedel.alpha": [
     "0.0",
     227
    ],
    "units.halmkedel.fuel": [
     "\"straw\"",
     228
    ],
    "units.halmkedel.eta_fuel_to_heat": [
     "0.96",
     229
    ],
    "units.halmkedel.var_om": [
     "30.0",
     230
    ],
    "units.halmkedel.start_cost": [
     "8000.0",
     231
    ],
    "units.halmkedel.min_uptime": [
     "4",
     232
    ],
    "units.halmkedel.min_downtime": [
     "6",
     233
    ],
    "units.halmkedel.uc_enabled": [
     "true",
     234
    ],
    "units.halmkedel.initial_status": [
     "1",
     235
    ],
    "units.halmkedel.ancillary.afrr_qualified": [
     "false",
     236
    ],
    "units.halmkedel.ancillary.mfrr_qualified": [
     "false",
     236
    ],
    "units.halmkedel.ancillary.fcr_qualified": [
     "false",
     236
    ],
    "units.halmkedel.commissioned": [
     "2015",
     237
    ],
    "units.gasmotor.enabled": [
     "true",
     240
    ],
    "units.gasmotor.type": [
     "\"gas_engine_chp\"",
     241
    ],
    "units.gasmotor.p_max_heat": [
     "2.8",
     242
    ],
    "units.gasmotor.p_min_heat": [
     "0.9",
     243
    ],
    "units.gasmotor.alpha": [
     "0.72",
     244
    ],
    "units.gasmotor.fuel": [
     "\"natural_gas\"",
     245
    ],
    "units.gasmotor.eta_fuel_to_heat": [
     "0.49",
     246
    ],
    "units.gasmotor.var_om": [
     "608.0",
     247
    ],
    "units.gasmotor.start_cost": [
     "2000.0",
     248
    ],
    "units.gasmotor.min_uptime": [
     "2",
     249
    ],
    "units.gasmotor.min_downtime": [
     "2",
     250
    ],
    "units.gasmotor.uc_enabled": [
     "false",
     251
    ],
    "units.gasmotor.initial_status": [
     "0",
     252
    ],
    "units.gasmotor.co2_emissions_per_mwh_fuel": [
     "0.0",
     253
    ],
    "units.gasmotor.ancillary.afrr_qualified": [
     "true",
     255
    ],
    "units.gasmotor.ancillary.mfrr_qualified": [
     "true",
     256
    ],
    "units.gasmotor.ancillary.fcr_qualified": [
     "false",
     257
    ],
    "units.gasmotor.ancillary.afrr_max_bid_mw": [
     "1.0",
     258
    ],
    "units.gasmotor.ancillary.mfrr_max_bid_mw": [
     "2.0",
     259
    ],
    "units.gasmotor.commissioned": [
     "2000",
     260
    ],
    "units.gaskedel_agg.enabled": [
     "true",
     263
    ],
    "units.gaskedel_agg.type": [
     "\"gas_boiler\"",
     264
    ],
    "units.gaskedel_agg.p_max_heat": [
     "16.3",
     265
    ],
    "units.gaskedel_agg.p_min_heat": [
     "0.0",
     266
    ],
    "units.gaskedel_agg.alpha": [
     "0.0",
     267
    ],
    "units.gaskedel_agg.fuel": [
     "\"natural_gas\"",
     268
    ],
    "units.gaskedel_agg.eta_fuel_to_heat": [
     "0.95",
     269
    ],
    "units.gaskedel_agg.var_om": [
     "89.0",
     270
    ],
    "units.gaskedel_agg.start_cost": [
     "500.0",
     271
    ],
    "units.gaskedel_agg.min_uptime": [
     "1",
     272
    ],
    "units.gaskedel_agg.min_downtime": [
     "1",
     273
    ],
    "units.gaskedel_agg.uc_enabled": [
     "false",
     274
    ],
    "units.gaskedel_agg.co2_emissions_per_mwh_fuel": [
     "0.0",
     275
    ],
    "units.gaskedel_agg.ancillary.afrr_qualified": [
     "false",
     276
    ],
    "units.gaskedel_agg.ancillary.mfrr_qualified": [
     "false",
     276
    ],
    "units.gaskedel_agg.ancillary.fcr_qualified": [
     "false",
     276
    ],
    "units.overskudsvarme.enabled": [
     "false",
     279
    ],
    "units.overskudsvarme.type": [
     "\"waste_heat\"",
     280
    ],
    "units.overskudsvarme.p_max_heat": [
     "4.0",
     281
    ],
    "units.overskudsvarme.p_min_heat": [
     "4.0",
     282
    ],
    "units.overskudsvarme.alpha": [
     "0.0",
     283
    ],
    "units.overskudsvarme.fuel": [
     "\"waste_heat\"",
     284
    ],
    "units.overskudsvarme.eta_fuel_to_heat": [
     "1.0",
     285
    ],
    "units.overskudsvarme.var_om": [
     "5.0",
     286
    ],
    "units.overskudsvarme.start_cost": [
     "0.0",
     287
    ],
    "units.overskudsvarme.min_uptime": [
     "1",
     288
    ],
    "units.overskudsvarme.min_downtime": [
     "1",
     289
    ],
    "units.overskudsvarme.uc_enabled": [
     "false",
     290
    ],
    "units.overskudsvarme.ancillary.afrr_qualified": [
     "false",
     291
    ],
    "units.overskudsvarme.ancillary.mfrr_qualified": [
     "false",
     291
    ],
    "units.overskudsvarme.ancillary.fcr_qualified": [
     "false",
     291
    ],
    "units.overskudsvarme.commissioned": [
     "2026",
     292
    ],
    "storage.tank_eksisterende.enabled": [
     "true",
     299
    ],
    "storage.tank_eksisterende.volume_m3": [
     "14000",
     300
    ],
    "storage.tank_eksisterende.delta_t_k": [
     "40.0",
     301
    ],
    "storage.tank_eksisterende.e_max_mwh": [
     "null",
     302
    ],
    "storage.tank_eksisterende.e_initial_mwh": [
     "279",
     303
    ],
    "storage.tank_eksisterende.p_max_charge_mw": [
     "60.0",
     304
    ],
    "storage.tank_eksisterende.p_max_discharge_mw": [
     "60.0",
     305
    ],
    "storage.tank_eksisterende.self_discharge_per_hour": [
     "0.0",
     306
    ],
    "storage.tank_eksisterende.cycle_binding": [
     "true",
     307
    ],
    "storage.tank_eksisterende.notes": [
     "\"Volumen bekræftet 14.000 m3. [BEKRÆFT delta_t: VP vinter 80C=40K, elkedler/biomasse 95C=55K, VP sommer 70C=30K — sæt sæson-/kilde-afhængigt]\"",
     308
    ],
    "balancing.method": [
     "\"activation_value\"",
     332
    ],
    "balancing.bid_strategy.up_markup_dkk_mwh": [
     "500",
     334
    ],
    "balancing.bid_strategy.up_markup_max_dkk_mwh": [
     "2000",
     335
    ],
    "balancing.ancillary_caps.per_unit_mw.vp_luft_vand": [
     "5.52",
     338
    ],
    "balancing.ancillary_caps.total_mw": [
     "17.52",
     339
    ],
    "balancing.activation.foresight": [
     "\"profile\"",
     398
    ],
    "balancing.activation.afrr.model": [
     "\"system_share\"",
     399
    ],
    "balancing.activation.afrr.k": [
     "4.0",
     399
    ],
    "balancing.activation.mfrr.model": [
     "\"clear\"",
     400
    ],
    "balancing.availability.enabled": [
     "true",
     402
    ],
    "balancing.availability.mode": [
     "\"energy\"",
     403
    ],
    "balancing.availability.afrr.mw_by_month.2026-03": [
     "1.155",
     405
    ],
    "balancing.availability.afrr.mw_by_month.2026-04": [
     "1.186",
     405
    ],
    "balancing.availability.afrr.mw_by_month.2026-05": [
     "0.411",
     405
    ],
    "balancing.availability.afrr.mw_by_month.2026-06": [
     "0.0799",
     405
    ],
    "balancing.availability.mfrr.mw_by_month.2026-03": [
     "1.034",
     407
    ],
    "balancing.availability.mfrr.mw_by_month.2026-04": [
     "0.753",
     407
    ],
    "balancing.availability.mfrr.mw_by_month.2026-05": [
     "0.123",
     407
    ],
    "balancing.availability.mfrr.mw_by_month.2026-06": [
     "0.0563",
     407
    ],
    "balancing.reservation_gate.enabled": [
     "false",
     413
    ],
    "balancing.reservation_gate.mode": [
     "\"driven\"",
     414
    ],
    "balancing.reservation_gate.afrr.cm_threshold_dkk_mw_h": [
     "75",
     415
    ],
    "balancing.reservation_gate.afrr.block_mw": [
     "2.82",
     415
    ],
    "balancing.reservation_gate.mfrr.cm_threshold_dkk_mw_h": [
     "300",
     416
    ],
    "balancing.reservation_gate.mfrr.block_mw": [
     "4.46",
     416
    ],
    "investment.enabled": [
     "false",
     422
    ]
   }
  },
  "billund_sporb_rullende": {
   "fil": "cases/billund_sporB_rullende.yaml",
   "standard": null,
   "kommandoer": [],
   "blade": {
    "meta.case_name": [
     "\"billund_sporB_rullende\"",
     56
    ],
    "meta.description": [
     "\"Backtest af activation_value-balancering mod realiseret drift jan–april 2026. elkedel_ny under inkøring (ikke i drift). Total reserve-loft 14 MW = Billunds faktiske prækvalificering. Op-bud = spot + 500 DKK/MWh. Sammenlignes mod realiseret balance-facit.\\n\"",
     57
    ],
    "meta.timezone_internal": [
     "\"UTC\"",
     62
    ],
    "meta.timezone_reporting": [
     "\"Europe/Copenhagen\"",
     63
    ],
    "meta.discount_rate_real": [
     "0.035",
     64
    ],
    "meta.tax_year": [
     "2026",
     65
    ],
    "data.dmi_area": [
     "\"karup\"",
     77
    ],
    "data.price_zone": [
     "\"DK1\"",
     78
    ],
    "time.start": [
     "\"2025-07-01T00:00:00Z\"",
     86
    ],
    "time.end": [
     "\"2026-06-30T23:00:00Z\"",
     87
    ],
    "time.resolution": [
     "\"1h\"",
     88
    ],
    "heat_load_params.gaf_mw_per_k": [
     "0.9761",
     94
    ],
    "heat_load_params.t_ref": [
     "15.0",
     95
    ],
    "heat_load_params.thermal_inertia_hours": [
     "24",
     96
    ],
    "heat_load_params.nettab_slope_mw_per_k": [
     "0.6081",
     97
    ],
    "heat_load_params.t_net": [
     "12.0",
     98
    ],
    "heat_load_params.baseline_profile_mw": [
     "[5.66,5.74,5.87,6.08,6.15,6.52,7.13,7.15,6.83,6.32,6.09,5.99,5.82,5.7,5.63,5.56,5.65,5.87,6.03,6.08,6.04,6.03,5.88,5.6]",
     99
    ],
    "heat_load_params.weekly_dip": [
     "0.02",
     104
    ],
    "heat_load_params._source": [
     "\"Kalibreret mod Billund ab værk — ignoreres ved --heat-csv\"",
     105
    ],
    "prices.natural_gas.value": [
     "550.0",
     112
    ],
    "prices.natural_gas.unit": [
     "\"DKK/MWh_fuel\"",
     113
    ],
    "prices.straw.value": [
     "204.6",
     115
    ],
    "prices.straw.unit": [
     "\"DKK/MWh_fuel\"",
     116
    ],
    "prices.flis.value": [
     "195.8",
     118
    ],
    "prices.flis.unit": [
     "\"DKK/MWh_fuel\"",
     119
    ],
    "prices.waste_heat.value": [
     "50.0",
     121
    ],
    "prices.waste_heat.unit": [
     "\"DKK/MWh_fuel\"",
     122
    ],
    "prices.co2_eua.value": [
     "0.0",
     124
    ],
    "prices.co2_eua.unit": [
     "\"DKK/MWh_gas\"",
     125
    ],
    "electricity.spot_area": [
     "\"DK1\"",
     131
    ],
    "electricity.tariff_consumption_flat": [
     "128.2",
     132
    ],
    "electricity.tariff_production_flat": [
     "4.1",
     133
    ],
    "electricity.electricity_tax": [
     "4.0",
     134
    ],
    "units.vp_luft_vand.enabled": [
     "true",
     142
    ],
    "units.vp_luft_vand.type": [
     "\"heat_pump\"",
     143
    ],
    "units.vp_luft_vand.p_max_heat": [
     "21.0",
     146
    ],
    "units.vp_luft_vand.p_min_heat": [
     "0.0",
     147
    ],
    "units.vp_luft_vand.alpha": [
     "-0.3438",
     148
    ],
    "units.vp_luft_vand.fuel": [
     "\"electricity\"",
     149
    ],
    "units.vp_luft_vand.var_om": [
     "13.4",
     150
    ],
    "units.vp_luft_vand.start_cost": [
     "0.0",
     151
    ],
    "units.vp_luft_vand.min_uptime": [
     "1",
     152
    ],
    "units.vp_luft_vand.min_downtime": [
     "1",
     153
    ],
    "units.vp_luft_vand.uc_enabled": [
     "false",
     154
    ],
    "units.vp_luft_vand.cop_curve.type": [
     "\"table\"",
     160
    ],
    "units.vp_luft_vand.cop_curve.points": [
     "[{\"t_ambient\":-10.0,\"heat_mw\":12.0,\"el_mw\":5.0},{\"t_ambient\":0.0,\"heat_mw\":16.0,\"el_mw\":5.5},{\"t_ambient\":16.0,\"heat_mw\":21.0,\"el_mw\":6.2}]",
     161
    ],
    "units.vp_luft_vand.ancillary.afrr_qualified": [
     "true",
     166
    ],
    "units.vp_luft_vand.ancillary.mfrr_qualified": [
     "true",
     167
    ],
    "units.vp_luft_vand.ancillary.fcr_qualified": [
     "false",
     168
    ],
    "units.vp_luft_vand.ancillary.available_from": [
     "\"2026-03-01\"",
     172
    ],
    "units.vp_luft_vand.commissioned": [
     "2025",
     173
    ],
    "units.elkedel_ny.enabled": [
     "false",
     177
    ],
    "units.elkedel_ny.type": [
     "\"electric_boiler\"",
     178
    ],
    "units.elkedel_ny.p_max_heat": [
     "30.0",
     179
    ],
    "units.elkedel_ny.p_min_heat": [
     "0.0",
     180
    ],
    "units.elkedel_ny.alpha": [
     "-1.0",
     181
    ],
    "units.elkedel_ny.fuel": [
     "\"electricity\"",
     182
    ],
    "units.elkedel_ny.var_om": [
     "13.4",
     183
    ],
    "units.elkedel_ny.start_cost": [
     "0.0",
     184
    ],
    "units.elkedel_ny.min_uptime": [
     "1",
     185
    ],
    "units.elkedel_ny.min_downtime": [
     "1",
     186
    ],
    "units.elkedel_ny.uc_enabled": [
     "false",
     187
    ],
    "units.elkedel_ny.ancillary.afrr_qualified": [
     "true",
     189
    ],
    "units.elkedel_ny.ancillary.mfrr_qualified": [
     "true",
     190
    ],
    "units.elkedel_ny.ancillary.fcr_qualified": [
     "false",
     191
    ],
    "units.elkedel_ny.commissioned": [
     "2026",
     192
    ],
    "units.elkedel_ny.notes": [
     "\"Under inkøring jan–apr 2026 — ikke i drift. Reserve-loftet (14 MW) er Billunds prækvalificering og er uafhængigt af denne enheds enabled-flag.\"",
     193
    ],
    "units.elkedel_gl.enabled": [
     "true",
     196
    ],
    "units.elkedel_gl.type": [
     "\"electric_boiler\"",
     197
    ],
    "units.elkedel_gl.p_max_heat": [
     "12.0",
     198
    ],
    "units.elkedel_gl.p_min_heat": [
     "0.0",
     199
    ],
    "units.elkedel_gl.alpha": [
     "-1.0",
     200
    ],
    "units.elkedel_gl.fuel": [
     "\"electricity\"",
     201
    ],
    "units.elkedel_gl.var_om": [
     "6.71",
     202
    ],
    "units.elkedel_gl.start_cost": [
     "0.0",
     203
    ],
    "units.elkedel_gl.min_uptime": [
     "1",
     204
    ],
    "units.elkedel_gl.min_downtime": [
     "1",
     205
    ],
    "units.elkedel_gl.uc_enabled": [
     "false",
     206
    ],
    "units.elkedel_gl.ancillary.afrr_qualified": [
     "true",
     208
    ],
    "units.elkedel_gl.ancillary.mfrr_qualified": [
     "true",
     209
    ],
    "units.elkedel_gl.ancillary.fcr_qualified": [
     "false",
     210
    ],
    "units.elkedel_gl.commissioned": [
     "2021",
     211
    ],
    "units.fliskedel.enabled": [
     "true",
     214
    ],
    "units.fliskedel.type": [
     "\"biomass_boiler\"",
     215
    ],
    "units.fliskedel.p_max_heat": [
     "7.0",
     216
    ],
    "units.fliskedel.p_min_heat": [
     "2.5",
     217
    ],
    "units.fliskedel.alpha": [
     "0.0",
     218
    ],
    "units.fliskedel.fuel": [
     "\"flis\"",
     219
    ],
    "units.fliskedel.eta_fuel_to_heat": [
     "0.94",
     220
    ],
    "units.fliskedel.var_om": [
     "30.0",
     221
    ],
    "units.fliskedel.start_cost": [
     "5000.0",
     222
    ],
    "units.fliskedel.min_uptime": [
     "168",
     223
    ],
    "units.fliskedel.min_downtime": [
     "6",
     224
    ],
    "units.fliskedel.uc_enabled": [
     "true",
     225
    ],
    "units.fliskedel.initial_status": [
     "0",
     226
    ],
    "units.fliskedel.ancillary.afrr_qualified": [
     "false",
     227
    ],
    "units.fliskedel.ancillary.mfrr_qualified": [
     "false",
     227
    ],
    "units.fliskedel.ancillary.fcr_qualified": [
     "false",
     227
    ],
    "units.fliskedel.commissioned": [
     "2009",
     228
    ],
    "units.halmkedel.enabled": [
     "true",
     231
    ],
    "units.halmkedel.type": [
     "\"biomass_boiler\"",
     232
    ],
    "units.halmkedel.p_max_heat": [
     "12.0",
     233
    ],
    "units.halmkedel.p_min_heat": [
     "4.0",
     234
    ],
    "units.halmkedel.alpha": [
     "0.0",
     235
    ],
    "units.halmkedel.fuel": [
     "\"straw\"",
     236
    ],
    "units.halmkedel.eta_fuel_to_heat": [
     "0.96",
     237
    ],
    "units.halmkedel.var_om": [
     "30.0",
     238
    ],
    "units.halmkedel.start_cost": [
     "8000.0",
     239
    ],
    "units.halmkedel.min_uptime": [
     "4",
     240
    ],
    "units.halmkedel.min_downtime": [
     "6",
     241
    ],
    "units.halmkedel.uc_enabled": [
     "true",
     242
    ],
    "units.halmkedel.initial_status": [
     "0",
     243
    ],
    "units.halmkedel.ancillary.afrr_qualified": [
     "false",
     244
    ],
    "units.halmkedel.ancillary.mfrr_qualified": [
     "false",
     244
    ],
    "units.halmkedel.ancillary.fcr_qualified": [
     "false",
     244
    ],
    "units.halmkedel.commissioned": [
     "2015",
     245
    ],
    "units.gasmotor.enabled": [
     "true",
     248
    ],
    "units.gasmotor.type": [
     "\"gas_engine_chp\"",
     249
    ],
    "units.gasmotor.p_max_heat": [
     "2.8",
     250
    ],
    "units.gasmotor.p_min_heat": [
     "0.9",
     251
    ],
    "units.gasmotor.alpha": [
     "0.72",
     252
    ],
    "units.gasmotor.fuel": [
     "\"natural_gas\"",
     253
    ],
    "units.gasmotor.eta_fuel_to_heat": [
     "0.49",
     254
    ],
    "units.gasmotor.var_om": [
     "608.0",
     255
    ],
    "units.gasmotor.start_cost": [
     "2000.0",
     256
    ],
    "units.gasmotor.min_uptime": [
     "2",
     257
    ],
    "units.gasmotor.min_downtime": [
     "2",
     258
    ],
    "units.gasmotor.uc_enabled": [
     "false",
     259
    ],
    "units.gasmotor.initial_status": [
     "0",
     260
    ],
    "units.gasmotor.co2_emissions_per_mwh_fuel": [
     "0.0",
     261
    ],
    "units.gasmotor.ancillary.afrr_qualified": [
     "true",
     263
    ],
    "units.gasmotor.ancillary.mfrr_qualified": [
     "true",
     264
    ],
    "units.gasmotor.ancillary.fcr_qualified": [
     "false",
     265
    ],
    "units.gasmotor.ancillary.afrr_max_bid_mw": [
     "1.0",
     266
    ],
    "units.gasmotor.ancillary.mfrr_max_bid_mw": [
     "2.0",
     267
    ],
    "units.gasmotor.commissioned": [
     "2000",
     268
    ],
    "units.gaskedel_agg.enabled": [
     "true",
     271
    ],
    "units.gaskedel_agg.type": [
     "\"gas_boiler\"",
     272
    ],
    "units.gaskedel_agg.p_max_heat": [
     "16.3",
     273
    ],
    "units.gaskedel_agg.p_min_heat": [
     "0.0",
     274
    ],
    "units.gaskedel_agg.alpha": [
     "0.0",
     275
    ],
    "units.gaskedel_agg.fuel": [
     "\"natural_gas\"",
     276
    ],
    "units.gaskedel_agg.eta_fuel_to_heat": [
     "0.95",
     277
    ],
    "units.gaskedel_agg.var_om": [
     "89.0",
     278
    ],
    "units.gaskedel_agg.start_cost": [
     "500.0",
     279
    ],
    "units.gaskedel_agg.min_uptime": [
     "1",
     280
    ],
    "units.gaskedel_agg.min_downtime": [
     "1",
     281
    ],
    "units.gaskedel_agg.uc_enabled": [
     "false",
     282
    ],
    "units.gaskedel_agg.co2_emissions_per_mwh_fuel": [
     "0.0",
     283
    ],
    "units.gaskedel_agg.ancillary.afrr_qualified": [
     "false",
     284
    ],
    "units.gaskedel_agg.ancillary.mfrr_qualified": [
     "false",
     284
    ],
    "units.gaskedel_agg.ancillary.fcr_qualified": [
     "false",
     284
    ],
    "units.overskudsvarme.enabled": [
     "false",
     287
    ],
    "units.overskudsvarme.type": [
     "\"waste_heat\"",
     288
    ],
    "units.overskudsvarme.p_max_heat": [
     "4.0",
     289
    ],
    "units.overskudsvarme.p_min_heat": [
     "4.0",
     290
    ],
    "units.overskudsvarme.alpha": [
     "0.0",
     291
    ],
    "units.overskudsvarme.fuel": [
     "\"waste_heat\"",
     292
    ],
    "units.overskudsvarme.eta_fuel_to_heat": [
     "1.0",
     293
    ],
    "units.overskudsvarme.var_om": [
     "5.0",
     294
    ],
    "units.overskudsvarme.start_cost": [
     "0.0",
     295
    ],
    "units.overskudsvarme.min_uptime": [
     "1",
     296
    ],
    "units.overskudsvarme.min_downtime": [
     "1",
     297
    ],
    "units.overskudsvarme.uc_enabled": [
     "false",
     298
    ],
    "units.overskudsvarme.ancillary.afrr_qualified": [
     "false",
     299
    ],
    "units.overskudsvarme.ancillary.mfrr_qualified": [
     "false",
     299
    ],
    "units.overskudsvarme.ancillary.fcr_qualified": [
     "false",
     299
    ],
    "units.overskudsvarme.commissioned": [
     "2026",
     300
    ],
    "storage.tank_eksisterende.enabled": [
     "true",
     307
    ],
    "storage.tank_eksisterende.volume_m3": [
     "14000",
     308
    ],
    "storage.tank_eksisterende.delta_t_k": [
     "40.0",
     309
    ],
    "storage.tank_eksisterende.e_max_mwh": [
     "null",
     310
    ],
    "storage.tank_eksisterende.e_initial_mwh": [
     "279",
     311
    ],
    "storage.tank_eksisterende.p_max_charge_mw": [
     "60.0",
     312
    ],
    "storage.tank_eksisterende.p_max_discharge_mw": [
     "60.0",
     313
    ],
    "storage.tank_eksisterende.self_discharge_per_hour": [
     "0.0",
     314
    ],
    "storage.tank_eksisterende.cycle_binding": [
     "true",
     315
    ],
    "storage.tank_eksisterende.notes": [
     "\"Volumen bekræftet 14.000 m3. [BEKRÆFT delta_t: VP vinter 80C=40K, elkedler/biomasse 95C=55K, VP sommer 70C=30K — sæt sæson-/kilde-afhængigt]\"",
     316
    ],
    "balancing.method": [
     "\"activation_value\"",
     340
    ],
    "balancing.bid_strategy.up_markup_dkk_mwh": [
     "500",
     342
    ],
    "balancing.bid_strategy.up_markup_max_dkk_mwh": [
     "2000",
     343
    ],
    "balancing.ancillary_caps.per_unit_mw.vp_luft_vand": [
     "5.52",
     346
    ],
    "balancing.ancillary_caps.total_mw": [
     "17.52",
     347
    ],
    "balancing.reservation_gate.enabled": [
     "true",
     353
    ],
    "balancing.reservation_gate.mode": [
     "\"driven\"",
     354
    ],
    "balancing.reservation_gate.afrr.cm_threshold_dkk_mw_h": [
     "75",
     355
    ],
    "balancing.reservation_gate.afrr.block_mw": [
     "2.82",
     355
    ],
    "balancing.reservation_gate.mfrr.cm_threshold_dkk_mw_h": [
     "300",
     356
    ],
    "balancing.reservation_gate.mfrr.block_mw": [
     "4.46",
     356
    ],
    "investment.enabled": [
     "false",
     363
    ]
   }
  }
 }
};
