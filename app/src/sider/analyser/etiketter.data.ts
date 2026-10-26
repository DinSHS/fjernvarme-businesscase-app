//-----------------------------------------------------------------------
// GENERERET af _byg/byg_etiketter.py fra viden/felt_katalog.json,
// viden/enhedstyper.json og viden/resultat_etiketter.json (fv-ekspert).
// Ret ikke i hånden.
// Modelcommit: eef950a2ac7b3808a9456dcf48742ce08e52366a · 151 felter · 7 enhedstyper
//-----------------------------------------------------------------------

export const MODEL_COMMIT_KATALOG = "eef950a2ac7b3808a9456dcf48742ce08e52366a";

export const FELTER: readonly { sti: string; etiket: string; enhed: string | null }[] = [
 {
  "sti": "meta.case_name",
  "etiket": "Casens navn (filnavnsstamme)",
  "enhed": null
 },
 {
  "sti": "meta.titel",
  "etiket": "Titel",
  "enhed": null
 },
 {
  "sti": "meta.description",
  "etiket": "Beskrivelse",
  "enhed": null
 },
 {
  "sti": "meta.gruppe",
  "etiket": "Gruppe",
  "enhed": null
 },
 {
  "sti": "meta.rolle",
  "etiket": "Rolle i gruppen",
  "enhed": null
 },
 {
  "sti": "meta.timezone_internal",
  "etiket": "Intern tidszone",
  "enhed": null
 },
 {
  "sti": "meta.timezone_reporting",
  "etiket": "Rapporteringstidszone",
  "enhed": null
 },
 {
  "sti": "meta.discount_rate_real",
  "etiket": "Real diskonteringsrente",
  "enhed": null
 },
 {
  "sti": "meta.tax_year",
  "etiket": "Afgiftsår",
  "enhed": null
 },
 {
  "sti": "data",
  "etiket": "Eksterne datakilder",
  "enhed": null
 },
 {
  "sti": "data.dmi_area",
  "etiket": "DMI-område (klima)",
  "enhed": null
 },
 {
  "sti": "data.price_zone",
  "etiket": "Priszone (spot)",
  "enhed": null
 },
 {
  "sti": "data.dmi_temp_shortname",
  "etiket": "DMI-temperaturvariabel",
  "enhed": null
 },
 {
  "sti": "data.eur_dkk",
  "etiket": "Valutakurs EUR→DKK",
  "enhed": "DKK/EUR"
 },
 {
  "sti": "time.start",
  "etiket": "Periodens start",
  "enhed": null
 },
 {
  "sti": "time.end",
  "etiket": "Periodens slut (sidste time)",
  "enhed": null
 },
 {
  "sti": "time.resolution",
  "etiket": "Tidsopløsning",
  "enhed": null
 },
 {
  "sti": "solver",
  "etiket": "Solvertolerance",
  "enhed": null
 },
 {
  "sti": "solver.mip_rel_gap",
  "etiket": "Relativt MIP-gab",
  "enhed": "brøk"
 },
 {
  "sti": "solver.mip_abs_gap",
  "etiket": "Absolut MIP-gab",
  "enhed": "DKK"
 },
 {
  "sti": "solver.time_limit",
  "etiket": "Tidsgrænse",
  "enhed": "s"
 },
 {
  "sti": "solver.presolve",
  "etiket": "HiGHS presolve",
  "enhed": null
 },
 {
  "sti": "solver.parallel",
  "etiket": "HiGHS parallel",
  "enhed": null
 },
 {
  "sti": "solver.presolve_rule_off",
  "etiket": "Fravalgte presolve-regler (bitmaske)",
  "enhed": null
 },
 {
  "sti": "heat_load_params",
  "etiket": "Varmelast-syntese",
  "enhed": null
 },
 {
  "sti": "heat_load_params.gaf_mw_per_k",
  "etiket": "Rumvarme-hældning (β_gaf)",
  "enhed": "MW/K"
 },
 {
  "sti": "heat_load_params.t_ref",
  "etiket": "Referencetemperatur for rumvarme",
  "enhed": "°C"
 },
 {
  "sti": "heat_load_params.thermal_inertia_hours",
  "etiket": "Termisk inerti",
  "enhed": "timer"
 },
 {
  "sti": "heat_load_params.nettab_slope_mw_per_k",
  "etiket": "Nettabs-hældning (β_net)",
  "enhed": "MW/K"
 },
 {
  "sti": "heat_load_params.t_net",
  "etiket": "Referencetemperatur for nettab",
  "enhed": "°C"
 },
 {
  "sti": "heat_load_params.baseline_profile_mw",
  "etiket": "Grundlast pr. time på døgnet",
  "enhed": "MW"
 },
 {
  "sti": "heat_load_params.weekly_dip",
  "etiket": "Weekend-reduktion",
  "enhed": "brøk"
 },
 {
  "sti": "heat_load_params._source",
  "etiket": "Kalibreringsmetadata",
  "enhed": null
 },
 {
  "sti": "heat_load_params._calibrated",
  "etiket": "Kalibreringsmetadata",
  "enhed": null
 },
 {
  "sti": "heat_load_params._fit_r2",
  "etiket": "Kalibreringsmetadata",
  "enhed": null
 },
 {
  "sti": "heat_load_params._fit_rmse",
  "etiket": "Kalibreringsmetadata",
  "enhed": null
 },
 {
  "sti": "heat_load_params._n_observations",
  "etiket": "Kalibreringsmetadata",
  "enhed": null
 },
 {
  "sti": "heat_load_params.nettab",
  "etiket": "Fysisk nettabsmodel (to led)",
  "enhed": null
 },
 {
  "sti": "heat_load_params.nettab.aarligt_nettab_pct",
  "etiket": "Årligt nettab, andel",
  "enhed": "brøk"
 },
 {
  "sti": "heat_load_params.nettab.aarligt_nettab_mwh",
  "etiket": "Årligt nettab, MWh",
  "enhed": "MWh"
 },
 {
  "sti": "heat_load_params.nettab.sommer.t_frem",
  "etiket": "Sommer: fremløbstemperatur",
  "enhed": "°C"
 },
 {
  "sti": "heat_load_params.nettab.sommer.t_retur",
  "etiket": "Sommer: returtemperatur",
  "enhed": "°C"
 },
 {
  "sti": "heat_load_params.nettab.sommer.t_ude",
  "etiket": "Sommer: ankertemperatur ude",
  "enhed": "°C"
 },
 {
  "sti": "heat_load_params.nettab.vinter.t_frem",
  "etiket": "Vinter: fremløbstemperatur",
  "enhed": "°C"
 },
 {
  "sti": "heat_load_params.nettab.vinter.t_retur",
  "etiket": "Vinter: returtemperatur",
  "enhed": "°C"
 },
 {
  "sti": "heat_load_params.nettab.vinter.t_ude",
  "etiket": "Vinter: ankertemperatur ude",
  "enhed": "°C"
 },
 {
  "sti": "heat_load_params.nettab.konduktiv_andel",
  "etiket": "Konduktiv andel af nettabet",
  "enhed": "brøk"
 },
 {
  "sti": "heat_load_params.nettab.t_jord_avg",
  "etiket": "Jordtemperatur, årsmiddel",
  "enhed": "°C"
 },
 {
  "sti": "heat_load_params.nettab.t_jord_amp",
  "etiket": "Jordtemperatur, amplitude",
  "enhed": "K"
 },
 {
  "sti": "heat_load_params.nettab.t_jord_dynamic",
  "etiket": "Dynamisk jordtemperatur",
  "enhed": null
 },
 {
  "sti": "heat_load_params.nettab.t_jord_ema_days",
  "etiket": "Jordtemperatur, tidskonstant",
  "enhed": "døgn"
 },
 {
  "sti": "heat_load_params.nettab.t_jord_damping",
  "etiket": "Jordtemperatur, dæmpning",
  "enhed": null
 },
 {
  "sti": "heat_load_params.nettab.t_jord_t_out_ref",
  "etiket": "Klimanormal ude",
  "enhed": "°C"
 },
 {
  "sti": "prices.*",
  "etiket": "Pris",
  "enhed": null
 },
 {
  "sti": "prices.co2_eua.value",
  "etiket": "CO₂-kvotepris",
  "enhed": "DKK/t CO₂"
 },
 {
  "sti": "prices.natural_gas.value",
  "etiket": "Naturgaspris",
  "enhed": "DKK/MWh brændsel"
 },
 {
  "sti": "prices.straw.value",
  "etiket": "Halmpris",
  "enhed": "DKK/MWh brændsel"
 },
 {
  "sti": "prices.flis.value",
  "etiket": "Flispris",
  "enhed": "DKK/MWh brændsel"
 },
 {
  "sti": "prices.wood_pellets.value",
  "etiket": "Træpillepris",
  "enhed": "DKK/MWh brændsel"
 },
 {
  "sti": "prices.waste_heat.value",
  "etiket": "Pris på overskudsvarme",
  "enhed": "DKK/MWh"
 },
 {
  "sti": "prices.*.unit",
  "etiket": "Prisens enhed (tekst)",
  "enhed": null
 },
 {
  "sti": "electricity.spot_area",
  "etiket": "Elområde for balancepriser",
  "enhed": null
 },
 {
  "sti": "electricity.tariff_consumption_flat",
  "etiket": "Forbrugstarif, fast",
  "enhed": "DKK/MWh el"
 },
 {
  "sti": "electricity.tariff_production_flat",
  "etiket": "Produktionstarif",
  "enhed": "DKK/MWh el"
 },
 {
  "sti": "electricity.electricity_tax",
  "etiket": "Elafgift",
  "enhed": "DKK/MWh el"
 },
 {
  "sti": "electricity.tariff_consumption",
  "etiket": "Tidsvarierende forbrugstarif",
  "enhed": null
 },
 {
  "sti": "electricity.tariff_consumption.unit",
  "etiket": "Tarifprofilens enhed",
  "enhed": null
 },
 {
  "sti": "electricity.tariff_consumption.source",
  "etiket": "Kilde til tarifprofilen",
  "enhed": null
 },
 {
  "sti": "electricity.tariff_consumption.fixed_components.*",
  "etiket": "Fast tarifpost",
  "enhed": "DKK/MWh el"
 },
 {
  "sti": "electricity.tariff_consumption.fixed_components.elafgift_net",
  "etiket": "Elafgift (dokumentation)",
  "enhed": "DKK/MWh el"
 },
 {
  "sti": "electricity.tariff_consumption.extra_holidays",
  "etiket": "Ekstra helligdage",
  "enhed": null
 },
 {
  "sti": "electricity.tariff_consumption.net_tariff.bands.*",
  "etiket": "Tarifbånd",
  "enhed": "DKK/MWh el"
 },
 {
  "sti": "electricity.tariff_consumption.net_tariff.seasons.*.months",
  "etiket": "Sæsonens måneder",
  "enhed": null
 },
 {
  "sti": "electricity.tariff_consumption.net_tariff.seasons.*.weekday.*",
  "etiket": "Bånd for tidsinterval (hverdag)",
  "enhed": null
 },
 {
  "sti": "electricity.tariff_consumption.net_tariff.seasons.*.weekend.*",
  "etiket": "Bånd for tidsinterval (weekend og helligdag)",
  "enhed": null
 },
 {
  "sti": "units.*",
  "etiket": "Produktionsenhed",
  "enhed": null
 },
 {
  "sti": "units.*.type",
  "etiket": "Enhedstype",
  "enhed": null
 },
 {
  "sti": "units.*.enabled",
  "etiket": "Med i modellen",
  "enhed": null
 },
 {
  "sti": "units.*.p_max_heat",
  "etiket": "Maks. varmeeffekt",
  "enhed": "MW varme"
 },
 {
  "sti": "units.*.p_min_heat",
  "etiket": "Min. varmeeffekt (minimumslast)",
  "enhed": "MW varme"
 },
 {
  "sti": "units.*.alpha",
  "etiket": "El/varme-forhold (α)",
  "enhed": null
 },
 {
  "sti": "units.*.fuel",
  "etiket": "Brændsel",
  "enhed": null
 },
 {
  "sti": "units.*.eta_fuel_to_heat",
  "etiket": "Virkningsgrad brændsel→varme",
  "enhed": "brøk"
 },
 {
  "sti": "units.*.var_om",
  "etiket": "Variabel D&V",
  "enhed": "DKK/MWh varme"
 },
 {
  "sti": "units.*.start_cost",
  "etiket": "Startomkostning",
  "enhed": "DKK/start"
 },
 {
  "sti": "units.*.min_uptime",
  "etiket": "Min. driftstid",
  "enhed": "timer"
 },
 {
  "sti": "units.*.min_downtime",
  "etiket": "Min. stilstandstid",
  "enhed": "timer"
 },
 {
  "sti": "units.*.uc_enabled",
  "etiket": "Start/stop-logik (unit commitment)",
  "enhed": null
 },
 {
  "sti": "units.*.initial_status",
  "etiket": "Tændt ved periodens start",
  "enhed": null
 },
 {
  "sti": "units.*.co2_emissions_per_mwh_fuel",
  "etiket": "CO₂-udledning",
  "enhed": "t CO₂/MWh brændsel"
 },
 {
  "sti": "units.*.production_profile_path",
  "etiket": "Produktionsprofil (CSV)",
  "enhed": null
 },
 {
  "sti": "units.*.commissioned",
  "etiket": "Idriftsættelsesår",
  "enhed": null
 },
 {
  "sti": "units.*.notes",
  "etiket": "Noter",
  "enhed": null
 },
 {
  "sti": "units.*.cop_curve",
  "etiket": "Varmepumpens ydelse",
  "enhed": null
 },
 {
  "sti": "units.*.cop_curve.type",
  "etiket": "Ydelsesmodel",
  "enhed": null
 },
 {
  "sti": "units.*.cop_curve.a",
  "etiket": "Lineær kurve: COP ved 0 °C",
  "enhed": null
 },
 {
  "sti": "units.*.cop_curve.b",
  "etiket": "Lineær kurve: COP-stigning pr. °C",
  "enhed": null
 },
 {
  "sti": "units.*.cop_curve.cop_min",
  "etiket": "Lineær kurve: Laveste COP",
  "enhed": null
 },
 {
  "sti": "units.*.cop_curve.cop_max",
  "etiket": "Lineær kurve: Højeste COP",
  "enhed": null
 },
 {
  "sti": "units.*.cop_curve.points",
  "etiket": "Ydelsestabel (målepunkter)",
  "enhed": null
 },
 {
  "sti": "units.*.ancillary",
  "etiket": "Balancemarked for enheden",
  "enhed": null
 },
 {
  "sti": "units.*.ancillary.afrr_qualified",
  "etiket": "Prækvalificeret til aFRR",
  "enhed": null
 },
 {
  "sti": "units.*.ancillary.mfrr_qualified",
  "etiket": "Prækvalificeret til mFRR",
  "enhed": null
 },
 {
  "sti": "units.*.ancillary.fcr_qualified",
  "etiket": "Prækvalificeret til FCR",
  "enhed": null
 },
 {
  "sti": "units.*.ancillary.afrr_max_bid_mw",
  "etiket": "Maks. aFRR-bud for enheden",
  "enhed": "MW el"
 },
 {
  "sti": "units.*.ancillary.mfrr_max_bid_mw",
  "etiket": "Maks. mFRR-bud for enheden",
  "enhed": "MW el"
 },
 {
  "sti": "units.*.ancillary.available_from",
  "etiket": "Byder fra dato",
  "enhed": null
 },
 {
  "sti": "units.*.ancillary.bid_window.months",
  "etiket": "Budvindue: måneder",
  "enhed": null
 },
 {
  "sti": "units.*.ancillary.bid_window.hours_local",
  "etiket": "Budvindue: timer",
  "enhed": null
 },
 {
  "sti": "storage.*",
  "etiket": "Varmelager (tank)",
  "enhed": null
 },
 {
  "sti": "storage.*.enabled",
  "etiket": "Med i modellen",
  "enhed": null
 },
 {
  "sti": "storage.*.volume_m3",
  "etiket": "Volumen",
  "enhed": "m³"
 },
 {
  "sti": "storage.*.delta_t_k",
  "etiket": "Temperaturdifferens (ΔT)",
  "enhed": "K"
 },
 {
  "sti": "storage.*.e_max_mwh",
  "etiket": "Energikapacitet",
  "enhed": "MWh"
 },
 {
  "sti": "storage.*.e_initial_mwh",
  "etiket": "Indhold ved start",
  "enhed": "MWh"
 },
 {
  "sti": "storage.*.p_max_charge_mw",
  "etiket": "Maks. ladeeffekt",
  "enhed": "MW"
 },
 {
  "sti": "storage.*.p_max_discharge_mw",
  "etiket": "Maks. afladeeffekt",
  "enhed": "MW"
 },
 {
  "sti": "storage.*.self_discharge_per_hour",
  "etiket": "Varmetab pr. time",
  "enhed": "brøk/time"
 },
 {
  "sti": "storage.*.cycle_binding",
  "etiket": "Slut som start",
  "enhed": null
 },
 {
  "sti": "storage.*.notes",
  "etiket": "Noter",
  "enhed": null
 },
 {
  "sti": "grid.max_consumption_mw",
  "etiket": "Nettilslutning, maks. eloptag",
  "enhed": "MW el"
 },
 {
  "sti": "investment.enabled",
  "etiket": "Investeringsmodul",
  "enhed": null
 },
 {
  "sti": "ancillary_groups.*",
  "etiket": "Budgruppe",
  "enhed": null
 },
 {
  "sti": "ancillary_groups.*.units",
  "etiket": "Gruppens enheder",
  "enhed": null
 },
 {
  "sti": "ancillary_groups.*.afrr_max_bid_mw",
  "etiket": "Gruppens maks. aFRR-bud",
  "enhed": "MW el"
 },
 {
  "sti": "ancillary_groups.*.mfrr_max_bid_mw",
  "etiket": "Gruppens maks. mFRR-bud",
  "enhed": "MW el"
 },
 {
  "sti": "balancing",
  "etiket": "Balancemarked",
  "enhed": null
 },
 {
  "sti": "balancing.method",
  "etiket": "Indtægtsmetode",
  "enhed": null
 },
 {
  "sti": "balancing.robust_reservation",
  "etiket": "Robust reservation",
  "enhed": null
 },
 {
  "sti": "balancing.shared_reserve_cap_mw",
  "etiket": "Fælles reserveloft (ældre)",
  "enhed": "MW el"
 },
 {
  "sti": "balancing.bid_strategy.up_markup_dkk_mwh",
  "etiket": "Aktiveringsbud: tillæg til spot",
  "enhed": "DKK/MWh"
 },
 {
  "sti": "balancing.bid_strategy.up_markup_max_dkk_mwh",
  "etiket": "Aktiveringsbud: øvre bånd",
  "enhed": "DKK/MWh"
 },
 {
  "sti": "balancing.bid_strategy.down_markdown_dkk_mwh",
  "etiket": "Nedreguleringsbud: fradrag",
  "enhed": "DKK/MWh"
 },
 {
  "sti": "balancing.bid_strategy.down_markdown_max_dkk_mwh",
  "etiket": "Nedreguleringsbud: øvre bånd",
  "enhed": "DKK/MWh"
 },
 {
  "sti": "balancing.ancillary_caps.per_unit_mw.*",
  "etiket": "Prækvalifikation pr. enhed",
  "enhed": "MW el"
 },
 {
  "sti": "balancing.ancillary_caps.per_unit_market_mw.*.*",
  "etiket": "Bud pr. enhed pr. marked",
  "enhed": "MW el"
 },
 {
  "sti": "balancing.ancillary_caps.total_mw",
  "etiket": "Samlet prækvalifikation",
  "enhed": "MW el"
 },
 {
  "sti": "balancing.reservation_gate.enabled",
  "etiket": "Kapacitetsprisgate til",
  "enhed": null
 },
 {
  "sti": "balancing.reservation_gate.mode",
  "etiket": "Gatens virkemåde",
  "enhed": null
 },
 {
  "sti": "balancing.reservation_gate.*.cm_threshold_dkk_mw_h",
  "etiket": "Fast budpris på kapacitet",
  "enhed": "DKK/MW/h"
 },
 {
  "sti": "balancing.reservation_gate.*.block_mw",
  "etiket": "Blokstørrelse",
  "enhed": "MW el"
 },
 {
  "sti": "balancing.reservation_gate.*.opportunity_cost.reference_unit",
  "etiket": "Beregnet budpris: referenceenhed",
  "enhed": null
 },
 {
  "sti": "balancing.reservation_gate.*.opportunity_cost.floor_dkk_mw_h",
  "etiket": "Beregnet budpris: gulv",
  "enhed": "DKK/MW/h"
 },
 {
  "sti": "balancing.activation.foresight",
  "etiket": "Hvad modellen ved, når den byder",
  "enhed": null
 },
 {
  "sti": "balancing.activation.settle",
  "etiket": "Afregning",
  "enhed": null
 },
 {
  "sti": "balancing.activation.*.model",
  "etiket": "Aktiveret andel",
  "enhed": null
 },
 {
  "sti": "balancing.activation.*.k",
  "etiket": "Skalering af systemandel (k)",
  "enhed": null
 },
 {
  "sti": "balancing.activation.*.ramp_dkk_mwh",
  "etiket": "Rampebredde",
  "enhed": "DKK/MWh"
 },
 {
  "sti": "balancing.availability.enabled",
  "etiket": "Månedsloft på reservationen til",
  "enhed": null
 },
 {
  "sti": "balancing.availability.mode",
  "etiket": "Månedsloftets form",
  "enhed": null
 },
 {
  "sti": "balancing.availability.*.mw_by_month.*",
  "etiket": "Månedsloft",
  "enhed": "MW el"
 }
];

export const ENHEDSTYPER: Readonly<Record<string, string>> = {
 "heat_pump": "Varmepumpe",
 "electric_boiler": "Elkedel",
 "biomass_boiler": "Biomassekedel",
 "gas_boiler": "Gaskedel",
 "gas_engine_chp": "Gasmotor (kraftvarme)",
 "solar_thermal": "Solvarme",
 "waste_heat": "Overskudsvarme"
};

export const NOEGLETAL_TEKST: Readonly<Record<string, { etiket: string; forklaring: string }>> = {
 "objektiv_dkk": {
  "etiket": "Samlet driftsomkostning (objektiv)",
  "forklaring": "Det tal, optimeringen minimerer: brændsel, el, tariffer, afgifter, D&V og starter minus elsalg og balanceindtægt (brutto) for hele perioden. Afrundet til hele kr. i manifestet; brug det præcise tal fra løsningen til differenser."
 },
 "varmeefterspoergsel_mwh": {
  "etiket": "Varmebehov",
  "forklaring": "Summen af varmebehovet over alle intervaller i perioden."
 },
 "samlet_produktion_mwh": {
  "etiket": "Samlet varmeproduktion",
  "forklaring": "Summen af alle enheders produktion. Kan afvige lidt fra varmebehovet på grund af tankens varmetab og den forventede aktivering."
 },
 "nettab_mwh": {
  "etiket": "Nettab",
  "forklaring": "Syntesens nettabsled. Tom ved målt varmelast, hvor nettabet allerede er i målingen."
 },
 "nettab_pct": {
  "etiket": "Nettab i procent af varmebehov",
  "forklaring": "Nettab delt med varmebehov. Tom ved målt varmelast."
 },
 "balanceindtaegt_dkk.i_alt": {
  "etiket": "Balanceindtægt, netto, i alt",
  "forklaring": "Kapacitet + netto aktiveringsbetaling (kun aktiveringsprisen) for aFRR og mFRR. Ikke det samme som balancemarkedets værdi: den findes kun som differens i samlet omkostning mellem en kørsel med og uden balancering."
 },
 "balanceindtaegt_dkk.afrr": {
  "etiket": "Balanceindtægt aFRR, netto",
  "forklaring": "aFRR-kapacitet + netto aFRR-aktivering."
 },
 "balanceindtaegt_dkk.mfrr": {
  "etiket": "Balanceindtægt mFRR, netto",
  "forklaring": "mFRR-kapacitet + netto mFRR-aktivering."
 },
 "balanceindtaegt_dkk.brutto.i_alt": {
  "etiket": "Balanceindtægt, brutto, i alt",
  "forklaring": "Som netto plus den sparede tarif og elafgift ved aktivering. Spotprisen er ikke med: strømmen er købt dagen før og betales alligevel (rettet i modellen 19/10-2026, modelversion eef950a). Det er dette beløb, der indgår i objektivet. Vis aldrig netto og brutto i samme sum."
 },
 "balanceindtaegt_dkk.brutto.afrr": {
  "etiket": "Balanceindtægt aFRR, brutto",
  "forklaring": "aFRR netto + sparet tarif og elafgift ved aFRR-aktivering."
 },
 "balanceindtaegt_dkk.brutto.mfrr": {
  "etiket": "Balanceindtægt mFRR, brutto",
  "forklaring": "mFRR netto + sparet tarif og elafgift ved mFRR-aktivering."
 },
 "tank_arbitrage_dkk": {
  "etiket": "Tankens arbitrageværdi (skyggepris)",
  "forklaring": "Kun ved ren LP. Ved MILP (alle repoets værker) findes skyggepriser ikke, og feltet er tomt — ikke nul. Tankens værdi regnes i stedet som differens med og uden tank."
 },
 "co2_ton": {
  "etiket": "CO₂-udledning",
  "forklaring": "Brændsel × udledningsfaktor for enheder med co2_emissions_per_mwh_fuel > 0. Biomasse regnes CO₂-neutral."
 }
};

export const FORBEHOLD: readonly { hvornaar: string; tekst: string }[] = [
 {
  "hvornaar": "altid ved balancetal",
  "tekst": "Balancetal vises pr. marked (aFRR/mFRR) og pr. produkt (kapacitet/aktivering). Spor A er en øvre grænse."
 },
 {
  "hvornaar": "ved sammenligning med og uden tank",
  "tekst": "Kun kørsler regnet før modelversion eef950a (19/10-2026): i første interval var tankens balance ubundet, så kørslen med tank fik gratis varme dér — på et kort vindue en stor del af forskellen (Andeby 5.–16. jan 2026: ca. 22.300 kr. af 44.220 kr.). Fra eef950a gælder lagerbalancen også i første time; sammenlign kun kørsler regnet ved samme modelversion."
 },
 {
  "hvornaar": "ved MILP og skyggepriser",
  "tekst": "Skyggepriser og tankens arbitrageværdi findes ikke ved MILP; de vises som 'ikke tilgængelig', ikke som 0."
 },
 {
  "hvornaar": "ved Andeby med balancering",
  "tekst": "Andebys balancetal er et potentiale ved fuld tilgængelighed, ikke hvad et værk vil tjene."
 }
];

/** fv-eksperts etiketter for måleregistrets nøgler: `noegletal:<gruppe>.<noegle>` / `maaned:<noegle>`. */
export const REGISTER: Readonly<Record<string, { etiket: string; enhed: string | null; forklaring: string }>> = {
 "noegletal:enhed.driftstimer": {
  "etiket": "Driftstimer",
  "enhed": "timer",
  "forklaring": "Timer, hvor enheden producerer noget. Driftsintervaller × intervallets længde. Ikke det samme som fuldlasttimer."
 },
 "noegletal:el.forbrug_mwh": {
  "etiket": "Elforbrug",
  "enhed": "MWh el",
  "forklaring": "El, som varmepumper og elkedler bruger til den planlagte varmeproduktion — før forventet aktivering. Varme / COP time for time."
 },
 "noegletal:el.spot_dkk": {
  "etiket": "Elomkostning: spot",
  "enhed": "kr.",
  "forklaring": "Elforbruget × spotprisen time for time."
 },
 "noegletal:el.tarif_dkk": {
  "etiket": "Elomkostning: nettarif",
  "enhed": "kr.",
  "forklaring": "Elforbruget × forbrugstariffen (båndprofilen, hvis værket har en, ellers den faste sats), uden elafgift."
 },
 "noegletal:el.afgift_dkk": {
  "etiket": "Elomkostning: elafgift",
  "enhed": "kr.",
  "forklaring": "Elforbruget × elafgiften."
 },
 "noegletal:el.omkostning_dkk": {
  "etiket": "Elomkostning i alt",
  "enhed": "kr.",
  "forklaring": "Spot + nettarif + elafgift for enhedens elforbrug. Den sparede tarif og elafgift ved aktivering er ikke trukket fra her; den ligger i balanceindtægten (brutto)."
 },
 "noegletal:el.produktion_mwh": {
  "etiket": "Elproduktion (kraftvarme)",
  "enhed": "MWh el",
  "forklaring": "El fra gasmotoren, regnet som α × varmeproduktion (α = el/varme)."
 },
 "noegletal:el.salg_dkk": {
  "etiket": "Elsalg (spot)",
  "enhed": "kr.",
  "forklaring": "Elproduktionen × spotprisen. Indtægt; trækkes fra i objektivet."
 },
 "noegletal:el.produktionstarif_dkk": {
  "etiket": "Produktionstarif",
  "enhed": "kr.",
  "forklaring": "Tarif for at levere el til nettet: elproduktionen × produktionstariffen. Trækkes fra elsalget."
 },
 "noegletal:balancering.reserveret_mwh": {
  "etiket": "Reserveret kapacitet (MW-timer)",
  "enhed": "MW·h",
  "forklaring": "Summen over perioden af den budte effekt pr. time. Et mål for, hvor meget der er stillet til rådighed — ikke energi. Den forventet aktiverede energi står for sig."
 },
 "noegletal:balancering.reserveret_middel_mw": {
  "etiket": "Gennemsnitligt bud",
  "enhed": "MW el",
  "forklaring": "Gennemsnitlig budt effekt over hele perioden, også timer uden bud."
 },
 "noegletal:balancering.reserveret_max_mw": {
  "etiket": "Største bud",
  "enhed": "MW el",
  "forklaring": "Den største budte effekt i ét interval."
 },
 "noegletal:balancering.budtimer": {
  "etiket": "Timer med bud",
  "enhed": "timer",
  "forklaring": "Timer, hvor enheden har budt i markedet (over 0,01 MW)."
 },
 "noegletal:balancering.kapacitetsindtaegt_dkk": {
  "etiket": "Kapacitetsindtægt",
  "enhed": "kr.",
  "forklaring": "Betaling for at stå til rådighed: budt effekt × kapacitetsprisen, time for time."
 },
 "noegletal:balancering.aktivering_netto_dkk": {
  "etiket": "Aktiveringsindtægt, netto",
  "enhed": "kr.",
  "forklaring": "Kun aktiveringsprisen for den forventet aktiverede energi."
 },
 "noegletal:balancering.aktivering_brutto_dkk": {
  "etiket": "Aktiveringsindtægt, brutto",
  "enhed": "kr.",
  "forklaring": "Netto + den sparede tarif og elafgift ved aktivering (ikke spotprisen). Det er brutto, objektivet regner med. Findes kun ved metoden activation_value."
 },
 "noegletal:balancering.forbrugsmodregning_dkk": {
  "etiket": "Sparet tarif og afgift ved aktivering",
  "enhed": "kr.",
  "forklaring": "Den tarif og elafgift, enheden ikke betaler, når den aktiveres = brutto − netto. Spotprisen er ikke med: strømmen er købt dagen før og betales alligevel (rettet i modellen 19/10-2026). Regnet med den FASTE tarif (tariff_consumption_flat), også når værket har en båndprofil — derfor ikke direkte sammenlignelig med 'Elomkostning: nettarif'."
 },
 "noegletal:balancering.aktiveret_mwh": {
  "etiket": "Forventet aktiveret energi",
  "enhed": "MWh el",
  "forklaring": "El, som modellen forventer aktiveret (ikke købt). En forventning efter den valgte aktiveringsmodel, ikke en realiseret mængde."
 },
 "noegletal:lager.opladet_mwh": {
  "etiket": "Opladet varme",
  "enhed": "MWh",
  "forklaring": "Varme lagt i tanken over perioden."
 },
 "noegletal:lager.afladet_mwh": {
  "etiket": "Afladet varme",
  "enhed": "MWh",
  "forklaring": "Varme hentet fra tanken over perioden. Forskellen til opladet varme er tankens varmetab og forskellen mellem indholdet ved start og slut. (I kørsler regnet før modelversion eef950a også første intervals ubundne afladning.)"
 },
 "noegletal:lager.niveau_start_mwh": {
  "etiket": "Tankens indhold ved start",
  "enhed": "MWh",
  "forklaring": "Indholdet efter periodens første interval: værkets startindhold (e_initial_mwh) minus varmetab plus første intervals op- og afladning. I kørsler regnet før modelversion eef950a var det låst til startindholdet, og tanken kunne få gratis varme i første interval."
 },
 "noegletal:lager.niveau_slut_mwh": {
  "etiket": "Tankens indhold ved slut",
  "enhed": "MWh",
  "forklaring": "Indholdet i periodens sidste interval. Med 'slut som start' (cycle_binding) er det lig startindholdet."
 },
 "noegletal:lager.niveau_max_mwh": {
  "etiket": "Tankens højeste indhold",
  "enhed": "MWh",
  "forklaring": "Det største indhold i ét interval. Sammenlign med kapaciteten for at se, om tanken bliver fyldt."
 },
 "noegletal:uc.starter": {
  "etiket": "Antal starter",
  "enhed": "antal",
  "forklaring": "Hvor mange gange en enhed med start/stop-logik (unit commitment) starter i perioden."
 },
 "noegletal:uc.timer_i_drift": {
  "etiket": "Timer tændt",
  "enhed": "timer",
  "forklaring": "Timer, hvor enheden med start/stop-logik er tændt, uanset hvor meget den producerer."
 },
 "maaned:nettab_gwh": {
  "etiket": "Nettab",
  "enhed": "GWh",
  "forklaring": "Syntesens nettabsled. Tom ved målt varmelast, hvor nettabet allerede er i målingen."
 },
 "maaned:opladet_mwh": {
  "etiket": "Opladet varme",
  "enhed": "MWh",
  "forklaring": "Varme lagt i tanken i måneden."
 },
 "maaned:afladet_mwh": {
  "etiket": "Afladet varme",
  "enhed": "MWh",
  "forklaring": "Varme hentet fra tanken i måneden."
 },
 "maaned:el_forbrug_mwh": {
  "etiket": "Elforbrug",
  "enhed": "MWh el",
  "forklaring": "El til varmeproduktion i måneden, før forventet aktivering."
 },
 "maaned:el_spot_dkk": {
  "etiket": "Elomkostning: spot",
  "enhed": "kr.",
  "forklaring": "Elforbrug × spotpris i måneden."
 },
 "maaned:el_tarif_dkk": {
  "etiket": "Elomkostning: nettarif",
  "enhed": "kr.",
  "forklaring": "Elforbrug × forbrugstarif i måneden, uden elafgift."
 },
 "maaned:el_afgift_dkk": {
  "etiket": "Elomkostning: elafgift",
  "enhed": "kr.",
  "forklaring": "Elforbrug × elafgift i måneden."
 },
 "maaned:el_produktion_mwh": {
  "etiket": "Elproduktion (kraftvarme)",
  "enhed": "MWh el",
  "forklaring": "El fra gasmotoren i måneden."
 },
 "maaned:el_salg_dkk": {
  "etiket": "Elsalg (spot)",
  "enhed": "kr.",
  "forklaring": "Elproduktion × spotpris i måneden."
 },
 "maaned:<marked>_reserveret_mwh": {
  "etiket": "Reserveret kapacitet (MW-timer)",
  "enhed": "MW·h",
  "forklaring": "Budt effekt summeret over månedens timer. Ikke energi."
 },
 "maaned:<marked>_kapacitetsindtaegt_dkk": {
  "etiket": "Kapacitetsindtægt",
  "enhed": "kr.",
  "forklaring": "Budt effekt × kapacitetspris i måneden."
 },
 "maaned:<marked>_aktivering_netto_dkk": {
  "etiket": "Aktiveringsindtægt, netto",
  "enhed": "kr.",
  "forklaring": "Kun aktiveringsprisen, i måneden."
 },
 "maaned:<marked>_aktivering_brutto_dkk": {
  "etiket": "Aktiveringsindtægt, brutto",
  "enhed": "kr.",
  "forklaring": "Netto + sparet tarif og elafgift (fast tarif) ved aktivering, i måneden. Lægges aldrig sammen med netto."
 },
 "maaned:<marked>_aktiveret_mwh": {
  "etiket": "Forventet aktiveret energi",
  "enhed": "MWh el",
  "forklaring": "Forventet aktiveret el i måneden."
 },
 "maaned:antal_interval": {
  "etiket": "Intervaller i måneden",
  "enhed": "antal",
  "forklaring": "Antal tidsintervaller i måneden i kørslen. Gør delmåneder synlige: 96 timeintervaller er 4 døgn, ikke en hel måned."
 }
};
