//-----------------------------------------------------------------------
// GENERERET af _byg/byg_katalog.py fra viden/felt_katalog.json og
// viden/enhedstyper.json (fv-ekspert). Ret ikke i hånden.
// Modelcommit: eef950a2ac7b3808a9456dcf48742ce08e52366a · 151 felter · 7 enhedstyper
//-----------------------------------------------------------------------

import type { FeltPost, Enhedstype } from "./katalog";

export const MODEL_COMMIT = "eef950a2ac7b3808a9456dcf48742ce08e52366a";

export const FELTER: readonly FeltPost[] = [
 {
  "sti": "meta.case_name",
  "sektion": "meta",
  "etiket": "Casens navn (filnavnsstamme)",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Bruges som første led i outputfilernes navn og som manifestets case_name. Skal være kort og uden mellemrum.",
  "kilde": "run_case.py:306",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "eksempel": "andeby"
 },
 {
  "sti": "meta.titel",
  "sektion": "meta",
  "etiket": "Titel",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Læsbar titel, som vises i manifestet. Mangler den, bruges case_name.",
  "kilde": "src/manifest.py:183",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "eksempel": "Andeby — fiktivt referenceværk"
 },
 {
  "sti": "meta.description",
  "sektion": "meta",
  "etiket": "Beskrivelse",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Fritekst om casen; skrives i manifestet som beskrivelse.",
  "kilde": "src/manifest.py:184",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "meta.gruppe",
  "sektion": "meta",
  "etiket": "Gruppe",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Valgfri gruppering af cases (fx 'andeby'); skrives i manifestet.",
  "kilde": "src/manifest.py:185",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "meta.rolle",
  "sektion": "meta",
  "etiket": "Rolle i gruppen",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Valgfri rolle inden for en gruppe (fx reference/scenarie); skrives i manifestet.",
  "kilde": "src/manifest.py:186",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "meta.timezone_internal",
  "sektion": "meta",
  "etiket": "Intern tidszone",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Ren dokumentation: feltet læses ikke af modellen. Modellen regner altid internt i UTC og slår tarif og budvindue op i dansk lokaltid.",
  "kilde": "src/config.py:1146",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "meta.timezone_reporting",
  "sektion": "meta",
  "etiket": "Rapporteringstidszone",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Ren dokumentation: feltet læses ikke af modellen. Modellen regner altid internt i UTC og slår tarif og budvindue op i dansk lokaltid.",
  "kilde": "src/config.py:1146",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "meta.discount_rate_real",
  "sektion": "meta",
  "etiket": "Real diskonteringsrente",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Ren dokumentation: feltet læses ikke af modellen. Modellen regner altid internt i UTC og slår tarif og budvindue op i dansk lokaltid.",
  "kilde": "src/config.py:1146",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "meta.tax_year",
  "sektion": "meta",
  "etiket": "Afgiftsår",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Ren dokumentation: feltet læses ikke af modellen. Modellen regner altid internt i UTC og slår tarif og budvindue op i dansk lokaltid.",
  "kilde": "src/config.py:1146",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "data",
  "sektion": "data",
  "etiket": "Eksterne datakilder",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Påkrævet blok. Værket erklærer selv sit klimaområde og sin priszone; der er med vilje ingen standard, fordi en usynlig standard tidligere gav forkerte tal.",
  "kilde": "src/config.py:1099",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": false,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": false
 },
 {
  "sti": "data.dmi_area",
  "sektion": "data",
  "etiket": "DMI-område (klima)",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "fyn",
   "vestkyst",
   "karup",
   "ringsted"
  ],
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Den DMI-station, hvis temperatur bruges til varmelast og varmepumpens COP. Vælg efter beliggenhed: vestkyst, karup (Midt- og Vestjylland), fyn, ringsted (Sjælland og øerne). Valget alene kan flytte objektivet op til ca. 4 %.",
  "kilde": "src/config.py:655",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "data.price_zone",
  "sektion": "data",
  "etiket": "Priszone (spot)",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "DK1",
   "DK2"
  ],
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Elspot-prisområde: DK1 vest for Storebælt, DK2 øst for. Bør være det samme som electricity.spot_area, som styrer balancepriserne.",
  "kilde": "src/config.py:658",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "regler": [
   "Bør være lig electricity.spot_area (balancepriserne hentes for spot_area)."
  ]
 },
 {
  "sti": "data.dmi_temp_shortname",
  "sektion": "data",
  "etiket": "DMI-temperaturvariabel",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Hvilken DMI-observation der bruges som udetemperatur. Lad standarden stå.",
  "kilde": "src/config.py:678",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": "temp_mean_past1h"
 },
 {
  "sti": "data.eur_dkk",
  "sektion": "data",
  "etiket": "Valutakurs EUR→DKK",
  "enhed": "DKK/EUR",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Kurs til omregning af spotpriser i EUR.",
  "kilde": "src/config.py:679",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "min_eksklusiv": true,
  "standard": 7.45
 },
 {
  "sti": "time.start",
  "sektion": "time",
  "etiket": "Periodens start",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Første time i kørslen, ISO-tid i UTC, fx 2025-07-01T00:00:00Z. Overskrives af scenariets periode, hvis den er sat.",
  "kilde": "src/config.py:923",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": true,
  "eksempel": "2025-07-01T00:00:00Z",
  "regler": [
   "Skal være før time.end.",
   "Med balancering skal perioden ligge efter ca. april 2025 (PICASSO); imbalance- og mfrr_act-data begynder 4. marts 2025."
  ]
 },
 {
  "sti": "time.end",
  "sektion": "time",
  "etiket": "Periodens slut (sidste time)",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Sidste time i kørslen, inklusive, ISO-tid i UTC, fx 2026-06-30T23:00:00Z.",
  "kilde": "src/config.py:924",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": true,
  "eksempel": "2026-06-30T23:00:00Z"
 },
 {
  "sti": "time.resolution",
  "sektion": "time",
  "etiket": "Tidsopløsning",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "1h",
   "15min"
  ],
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Modellens tidsskridt. Alle cases i repoet bruger 1h.",
  "kilde": "src/data_loader.py:61",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": true,
  "regler": [
   "Appens version 1 kører kun 1h: ved 15min ganger modellens kroneled ikke med intervallets længde (KONTRAKT §6c, K2-F13)."
  ]
 },
 {
  "sti": "solver",
  "sektion": "solver",
  "etiket": "Solvertolerance",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Valgfri blok. Uden den gælder kodens standard (0,5 % / 5.000 kr. / 600 s), som er til absolutte tal, ikke til differenser.",
  "kilde": "src/config.py:1125",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": false,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": false
 },
 {
  "sti": "solver.mip_rel_gap",
  "sektion": "solver",
  "etiket": "Relativt MIP-gab",
  "enhed": "brøk",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": 1,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Solveren stopper, når løsningen bevisligt ligger inden for denne brøkdel af det bedst mulige. 0,005 = 0,5 %. Til differenser mellem scenarier: 0,0002.",
  "kilde": "src/config.py:713",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": true,
  "standard": 0.005,
  "regler": [
   "0 ≤ værdi < 1"
  ]
 },
 {
  "sti": "solver.mip_abs_gap",
  "sektion": "solver",
  "etiket": "Absolut MIP-gab",
  "enhed": "DKK",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Solveren stopper også, når afstanden til det bedst mulige er under dette beløb.",
  "kilde": "src/config.py:714",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": true,
  "standard": 5000.0
 },
 {
  "sti": "solver.time_limit",
  "sektion": "solver",
  "etiket": "Tidsgrænse",
  "enhed": "s",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Maksimal løsetid. Rammes den, gemmes den bedste løsning med det opnåede gab.",
  "kilde": "src/config.py:715",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": true,
  "min_eksklusiv": true,
  "standard": 600.0
 },
 {
  "sti": "solver.presolve",
  "sektion": "solver",
  "etiket": "HiGHS presolve",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Sendes uændret til HiGHS. Lad standarden stå.",
  "kilde": "src/config.py:716",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": true,
  "standard": "on"
 },
 {
  "sti": "solver.parallel",
  "sektion": "solver",
  "etiket": "HiGHS parallel",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Sendes uændret til HiGHS. Lad standarden stå.",
  "kilde": "src/config.py:717",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": true,
  "standard": "on"
 },
 {
  "sti": "solver.presolve_rule_off",
  "sektion": "solver",
  "etiket": "Fravalgte presolve-regler (bitmaske)",
  "enhed": null,
  "type": "integer",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Tom = automatisk: aggregator-reglen (4096) slås fra ved robust reservation, fordi den 15/10-2026 gav en forkert løsning. 0 = alle regler tilladt.",
  "kilde": "src/config.py:722",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": true,
  "standard": null
 },
 {
  "sti": "heat_load_params",
  "sektion": "heat_load_params",
  "etiket": "Varmelast-syntese",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Parametre til at syntetisere varmebehovet af DMI-temperaturen. Blokken skal findes ved kørsel med rigtige data, også når målt varmelast (heat-csv) bruges — så læses den, men ignoreres.",
  "kilde": "src/data_loader.py:781",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": false,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": false
 },
 {
  "sti": "heat_load_params.gaf_mw_per_k",
  "sektion": "heat_load_params",
  "etiket": "Rumvarme-hældning (β_gaf)",
  "enhed": "MW/K",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Ekstra varmebehov pr. grad under t_ref (graddagsleddet), beregnet på et glidende gennemsnit af udetemperaturen.",
  "kilde": "src/data_loader.py:676",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "heat_load_params.t_ref",
  "sektion": "heat_load_params",
  "etiket": "Referencetemperatur for rumvarme",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Udetemperatur, hvorunder der regnes rumvarme.",
  "kilde": "src/data_loader.py:677",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 15.0
 },
 {
  "sti": "heat_load_params.thermal_inertia_hours",
  "sektion": "heat_load_params",
  "etiket": "Termisk inerti",
  "enhed": "timer",
  "type": "integer",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Tidskonstant for det glidende gennemsnit af udetemperaturen (bygningernes træghed).",
  "kilde": "src/data_loader.py:678",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 24
 },
 {
  "sti": "heat_load_params.nettab_slope_mw_per_k",
  "sektion": "heat_load_params",
  "etiket": "Nettabs-hældning (β_net)",
  "enhed": "MW/K",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Hældningsmodellens nettab: ekstra MW pr. grad under t_net. 0 = intet temperaturafhængigt nettab-led. Ignoreres, hvis nettab-blokken findes.",
  "kilde": "src/data_loader.py:679",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 0.0
 },
 {
  "sti": "heat_load_params.t_net",
  "sektion": "heat_load_params",
  "etiket": "Referencetemperatur for nettab",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Udetemperatur, hvorunder hældningsmodellens nettab-led regnes.",
  "kilde": "src/data_loader.py:680",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 12.0
 },
 {
  "sti": "heat_load_params.baseline_profile_mw",
  "sektion": "heat_load_params",
  "etiket": "Grundlast pr. time på døgnet",
  "enhed": "MW",
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "24 tal: varmebehovet uden rumvarme (brugsvand og konstant nettab) for time 0–23 i UTC — modellens tidsakse, ikke dansk tid (time 0 = kl. 01 dansk vintertid, kl. 02 sommertid).",
  "kilde": "src/data_loader.py:666",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": false,
  "standard": [
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0,
   6.0
  ],
  "regler": [
   "Præcis 24 tal."
  ]
 },
 {
  "sti": "heat_load_params.weekly_dip",
  "sektion": "heat_load_params",
  "etiket": "Weekend-reduktion",
  "enhed": "brøk",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Andel varmebehovet sænkes lørdag og søndag (0,02 = 2 %). Ugedagen bestemmes på UTC-aksen.",
  "kilde": "src/data_loader.py:721",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 0.02
 },
 {
  "sti": "heat_load_params._source",
  "sektion": "heat_load_params",
  "etiket": "Kalibreringsmetadata",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Sporbarhed fra kalibreringsscriptet. Felter med '_' foran læses ikke af modellen.",
  "kilde": "src/data_loader.py:674",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "heat_load_params._calibrated",
  "sektion": "heat_load_params",
  "etiket": "Kalibreringsmetadata",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Sporbarhed fra kalibreringsscriptet. Felter med '_' foran læses ikke af modellen.",
  "kilde": "src/data_loader.py:674",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "heat_load_params._fit_r2",
  "sektion": "heat_load_params",
  "etiket": "Kalibreringsmetadata",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Sporbarhed fra kalibreringsscriptet. Felter med '_' foran læses ikke af modellen.",
  "kilde": "src/data_loader.py:674",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "heat_load_params._fit_rmse",
  "sektion": "heat_load_params",
  "etiket": "Kalibreringsmetadata",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Sporbarhed fra kalibreringsscriptet. Felter med '_' foran læses ikke af modellen.",
  "kilde": "src/data_loader.py:674",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "heat_load_params._n_observations",
  "sektion": "heat_load_params",
  "etiket": "Kalibreringsmetadata",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Sporbarhed fra kalibreringsscriptet. Felter med '_' foran læses ikke af modellen.",
  "kilde": "src/data_loader.py:674",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "heat_load_params.nettab",
  "sektion": "heat_load_params",
  "etiket": "Fysisk nettabsmodel (to led)",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Valgfri blok. Når den findes, erstatter den hældningsmodellen: nettab = a·(T_rør − T_jord) + c·last. Påvirker kun den syntetiske varmelast; med målt varmelast er nettabet allerede i målingen.",
  "kilde": "src/data_loader.py:685",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": false,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": false
 },
 {
  "sti": "heat_load_params.nettab.aarligt_nettab_pct",
  "sektion": "heat_load_params",
  "etiket": "Årligt nettab, andel",
  "enhed": "brøk",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Nettab som andel af årsproduktionen ab værk (0,146 = 14,6 %). Angiv denne eller aarligt_nettab_mwh.",
  "kilde": "src/nettab.py:119",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "regler": [
   "Enten aarligt_nettab_pct eller aarligt_nettab_mwh skal være sat."
  ]
 },
 {
  "sti": "heat_load_params.nettab.aarligt_nettab_mwh",
  "sektion": "heat_load_params",
  "etiket": "Årligt nettab, MWh",
  "enhed": "MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Nettab i MWh pr. år. Har forrang for aarligt_nettab_pct.",
  "kilde": "src/nettab.py:117",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "heat_load_params.nettab.sommer.t_frem",
  "sektion": "heat_load_params",
  "etiket": "Sommer: fremløbstemperatur",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Kundesidens fremløb i sommerperioden.",
  "kilde": "src/nettab.py:128",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "heat_load_params.nettab.sommer.t_retur",
  "sektion": "heat_load_params",
  "etiket": "Sommer: returtemperatur",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Kundesidens retur i sommerperioden.",
  "kilde": "src/nettab.py:128",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "heat_load_params.nettab.sommer.t_ude",
  "sektion": "heat_load_params",
  "etiket": "Sommer: ankertemperatur ude",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Udetemperaturen, som sæsonens rørtemperatur hører til.",
  "kilde": "src/nettab.py:130",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 16.0,
  "regler": [
   "sommer.t_ude skal være højere end vinter.t_ude."
  ]
 },
 {
  "sti": "heat_load_params.nettab.vinter.t_frem",
  "sektion": "heat_load_params",
  "etiket": "Vinter: fremløbstemperatur",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Kundesidens fremløb i vinterperioden.",
  "kilde": "src/nettab.py:129",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "heat_load_params.nettab.vinter.t_retur",
  "sektion": "heat_load_params",
  "etiket": "Vinter: returtemperatur",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Kundesidens retur i vinterperioden.",
  "kilde": "src/nettab.py:129",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "heat_load_params.nettab.vinter.t_ude",
  "sektion": "heat_load_params",
  "etiket": "Vinter: ankertemperatur ude",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Udetemperaturen, som sæsonens rørtemperatur hører til.",
  "kilde": "src/nettab.py:131",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 1.0,
  "regler": [
   "sommer.t_ude skal være højere end vinter.t_ude."
  ]
 },
 {
  "sti": "heat_load_params.nettab.konduktiv_andel",
  "sektion": "heat_load_params",
  "etiket": "Konduktiv andel af nettabet",
  "enhed": "brøk",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": 1,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Andel af nettabet, der er isolations- og jordtab; resten følger lasten.",
  "kilde": "src/nettab.py:156",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "min_eksklusiv": true,
  "standard": 0.75,
  "regler": [
   "0 < værdi < 1"
  ]
 },
 {
  "sti": "heat_load_params.nettab.t_jord_avg",
  "sektion": "heat_load_params",
  "etiket": "Jordtemperatur, årsmiddel",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Middel af jordtemperaturen omkring rørene.",
  "kilde": "src/nettab.py:64",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 9.0
 },
 {
  "sti": "heat_load_params.nettab.t_jord_amp",
  "sektion": "heat_load_params",
  "etiket": "Jordtemperatur, amplitude",
  "enhed": "K",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Sæsonudsving i jordtemperaturen (statisk kurve, koldest i februar).",
  "kilde": "src/nettab.py:87",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 4.0
 },
 {
  "sti": "heat_load_params.nettab.t_jord_dynamic",
  "sektion": "heat_load_params",
  "etiket": "Dynamisk jordtemperatur",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Lad jordtemperaturen følge et glidende gennemsnit af udetemperaturen i stedet for en fast sæsonkurve. Årets nettab er det samme; kun fordelingen ændres.",
  "kilde": "src/nettab.py:66",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": false
 },
 {
  "sti": "heat_load_params.nettab.t_jord_ema_days",
  "sektion": "heat_load_params",
  "etiket": "Jordtemperatur, tidskonstant",
  "enhed": "døgn",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Tidskonstant for det glidende gennemsnit (kun dynamisk).",
  "kilde": "src/nettab.py:67",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "min_eksklusiv": true,
  "standard": 30.0
 },
 {
  "sti": "heat_load_params.nettab.t_jord_damping",
  "sektion": "heat_load_params",
  "etiket": "Jordtemperatur, dæmpning",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": 1,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Hvor meget af udetemperaturens afvigelse der slår igennem i jorden (kun dynamisk).",
  "kilde": "src/nettab.py:68",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 0.5
 },
 {
  "sti": "heat_load_params.nettab.t_jord_t_out_ref",
  "sektion": "heat_load_params",
  "etiket": "Klimanormal ude",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Normal udetemperatur, som afvigelsen regnes fra (kun dynamisk).",
  "kilde": "src/nettab.py:69",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 8.0
 },
 {
  "sti": "prices.*",
  "sektion": "prices",
  "etiket": "Pris",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Én blok pr. brændsel med value (og unit som dokumentation). Brændselspriser er ekskl. moms pr. MWh brændsel. Kendte nøgler: natural_gas, straw, flis, wood_pellets, waste_heat, co2_eua.",
  "kilde": "src/config.py:929",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": false,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": false,
  "stjerne": [
   {
    "navn": "brændsel",
    "tilladte": [
     "natural_gas",
     "straw",
     "flis",
     "wood_pellets",
     "waste_heat",
     "co2_eua"
    ]
   }
  ]
 },
 {
  "sti": "prices.co2_eua.value",
  "sektion": "prices",
  "etiket": "CO₂-kvotepris",
  "enhed": "DKK/t CO₂",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Pris pr. ton CO₂. Ganges på enhedernes co2_emissions_per_mwh_fuel. Skriv 0, hvis gasprisen allerede indeholder CO₂-afgiften.",
  "kilde": "src/config.py:930",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "regler": [
   "Skal findes (også som 0)."
  ]
 },
 {
  "sti": "prices.natural_gas.value",
  "sektion": "prices",
  "etiket": "Naturgaspris",
  "enhed": "DKK/MWh brændsel",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Pris pr. MWh gas ekskl. moms, gerne inkl. de afgifter, der gælder alle gasenheder.",
  "kilde": "src/config.py:937",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "regler": [
   "Påkrævet, hvis en aktiv enhed har fuel natural_gas."
  ]
 },
 {
  "sti": "prices.straw.value",
  "sektion": "prices",
  "etiket": "Halmpris",
  "enhed": "DKK/MWh brændsel",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Pris pr. MWh halm ekskl. moms.",
  "kilde": "src/config.py:934",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "regler": [
   "Påkrævet, hvis en aktiv enhed har fuel straw."
  ]
 },
 {
  "sti": "prices.flis.value",
  "sektion": "prices",
  "etiket": "Flispris",
  "enhed": "DKK/MWh brændsel",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Pris pr. MWh flis ekskl. moms. Mangler den, bruges halmprisen.",
  "kilde": "src/config.py:941",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "prices.wood_pellets.value",
  "sektion": "prices",
  "etiket": "Træpillepris",
  "enhed": "DKK/MWh brændsel",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Pris pr. MWh træpiller ekskl. moms.",
  "kilde": "src/config.py:942",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "regler": [
   "Påkrævet, hvis en aktiv enhed har fuel wood_pellets."
  ]
 },
 {
  "sti": "prices.waste_heat.value",
  "sektion": "prices",
  "etiket": "Pris på overskudsvarme",
  "enhed": "DKK/MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Pris pr. MWh overskudsvarme. Modellen deler den IKKE med virkningsgraden, så den virker som en pris pr. MWh leveret varme.",
  "kilde": "src/model.py:89",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "regler": [
   "Påkrævet, hvis en aktiv enhed har fuel waste_heat."
  ]
 },
 {
  "sti": "prices.*.unit",
  "sektion": "prices",
  "etiket": "Prisens enhed (tekst)",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Ren dokumentation; læses ikke af modellen.",
  "kilde": "src/config.py:929",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "brændsel"
   }
  ]
 },
 {
  "sti": "electricity.spot_area",
  "sektion": "electricity",
  "etiket": "Elområde for balancepriser",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "DK1",
   "DK2"
  ],
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Prisområdet, aFRR- og mFRR-priserne hentes for. Hold det lig data.price_zone.",
  "kilde": "src/data_loader_github.py:701",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "regler": [
   "Valideres ikke af config.py; bør være lig data.price_zone."
  ]
 },
 {
  "sti": "electricity.tariff_consumption_flat",
  "sektion": "electricity",
  "etiket": "Forbrugstarif, fast",
  "enhed": "DKK/MWh el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Nettarif pr. MWh el, når der ikke er en tidsvarierende profil. Bruges også altid i aktiveringsværdien (sparet tarif ved aktivering), selv når profilen er sat.",
  "kilde": "src/config.py:949",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "electricity.tariff_production_flat",
  "sektion": "electricity",
  "etiket": "Produktionstarif",
  "enhed": "DKK/MWh el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Tarif pr. MWh produceret el; trækkes fra kraftvarmens elsalg.",
  "kilde": "src/config.py:950",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "electricity.electricity_tax",
  "sektion": "electricity",
  "etiket": "Elafgift",
  "enhed": "DKK/MWh el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Elafgift pr. MWh el til varmeproduktion (efter godtgørelse). Lægges til elprisen for alle el-forbrugende enheder.",
  "kilde": "src/config.py:951",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "regler": [
   "Skal være lig tariff_consumption.fixed_components.elafgift_net, hvis den findes."
  ]
 },
 {
  "sti": "electricity.tariff_consumption",
  "sektion": "electricity",
  "etiket": "Tidsvarierende forbrugstarif",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Valgfri båndprofil fra netselskabets prisblad: bånd, sæsoner og hverdag/weekend. Vinder over den faste tarif i driften. Opslag sker på dansk lokaltid.",
  "kilde": "src/config.py:952",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": false,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": false
 },
 {
  "sti": "electricity.tariff_consumption.unit",
  "sektion": "electricity",
  "etiket": "Tarifprofilens enhed",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "kr_per_mwh"
  ],
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Skal være kr_per_mwh.",
  "kilde": "src/tariff.py:111",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "electricity.tariff_consumption.source",
  "sektion": "electricity",
  "etiket": "Kilde til tarifprofilen",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Fx netselskab og prisbladets dato. Vises i kørselsloggen.",
  "kilde": "src/tariff.py:241",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "electricity.tariff_consumption.fixed_components.*",
  "sektion": "electricity",
  "etiket": "Fast tarifpost",
  "enhed": "DKK/MWh el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Tidsuafhængige poster (fx energinet, dv), der lægges oven i båndet. Navnene er frie.",
  "kilde": "src/tariff.py:165",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "post"
   }
  ]
 },
 {
  "sti": "electricity.tariff_consumption.fixed_components.elafgift_net",
  "sektion": "electricity",
  "etiket": "Elafgift (dokumentation)",
  "enhed": "DKK/MWh el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Står kun som dokumentation og tælles IKKE med i tariffen; modellen lægger electricity_tax til. Skal være samme tal som electricity_tax.",
  "kilde": "src/tariff.py:173",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "regler": [
   "Skal være lig electricity.electricity_tax, ellers afvises casen."
  ]
 },
 {
  "sti": "electricity.tariff_consumption.extra_holidays",
  "sektion": "electricity",
  "etiket": "Ekstra helligdage",
  "enhed": null,
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Datoer (ÅÅÅÅ-MM-DD), der tarifmæssigt regnes som weekend ud over de indbyggede danske helligdage (store bededag er ikke med fra 2024).",
  "kilde": "src/tariff.py:240",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": false,
  "standard": []
 },
 {
  "sti": "electricity.tariff_consumption.net_tariff.bands.*",
  "sektion": "electricity",
  "etiket": "Tarifbånd",
  "enhed": "DKK/MWh el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Nettarif pr. bånd, fx lav, hoej, spids. Navnene er frie og bruges i sæsonskemaerne.",
  "kilde": "src/tariff.py:237",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "bånd"
   }
  ]
 },
 {
  "sti": "electricity.tariff_consumption.net_tariff.seasons.*.months",
  "sektion": "electricity",
  "etiket": "Sæsonens måneder",
  "enhed": null,
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Månedsnumre 1–12. Alle 12 måneder skal stå i præcis én sæson.",
  "kilde": "src/tariff.py:121",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": false,
  "stjerne": [
   {
    "navn": "sæson"
   }
  ],
  "regler": [
   "Hver måned 1–12 præcis én gang på tværs af sæsoner."
  ]
 },
 {
  "sti": "electricity.tariff_consumption.net_tariff.seasons.*.weekday.*",
  "sektion": "electricity",
  "etiket": "Bånd for tidsinterval (hverdag)",
  "enhed": null,
  "type": "enum",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Nøglen er et halvåbent timeinterval 'HH-HH' i lokal tid ('06-21' = time 6 til og med 20); værdien er et båndnavn fra bands.",
  "kilde": "src/tariff.py:138",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "sæson"
   },
   {
    "navn": "interval",
    "format": "HH-HH"
   }
  ],
  "regler": [
   "Værdien skal være et defineret bånd.",
   "Intervallerne skal dække time 0–23 præcis én gang."
  ]
 },
 {
  "sti": "electricity.tariff_consumption.net_tariff.seasons.*.weekend.*",
  "sektion": "electricity",
  "etiket": "Bånd for tidsinterval (weekend og helligdag)",
  "enhed": null,
  "type": "enum",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Nøglen er et halvåbent timeinterval 'HH-HH' i lokal tid ('06-21' = time 6 til og med 20); værdien er et båndnavn fra bands.",
  "kilde": "src/tariff.py:138",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "sæson"
   },
   {
    "navn": "interval",
    "format": "HH-HH"
   }
  ],
  "regler": [
   "Værdien skal være et defineret bånd.",
   "Intervallerne skal dække time 0–23 præcis én gang."
  ]
 },
 {
  "sti": "units.*",
  "sektion": "units",
  "etiket": "Produktionsenhed",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Én blok pr. enhed. Navnet er frit (brug små bogstaver, tal og _). Påkrævede felter: type, p_max_heat, p_min_heat, alpha, fuel.",
  "kilde": "src/config.py:957",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": false,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": false,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ],
  "regler": [
   "Ukendte felter afvises (enheden bygges med Unit(**felter)).",
   "Mindst én aktiv enhed, ellers er modellen tom."
  ]
 },
 {
  "sti": "units.*.type",
  "sektion": "units",
  "etiket": "Enhedstype",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "heat_pump",
   "electric_boiler",
   "biomass_boiler",
   "gas_boiler",
   "gas_engine_chp",
   "solar_thermal",
   "waste_heat"
  ],
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Varmepumpe, elkedel, biomassekedel, gaskedel, gasmotor, solvarme eller overskudsvarme. Typen er en etiket; økonomien styres af fuel og alpha. Kun heat_pump har en særregel (cop_curve).",
  "kilde": "src/config.py:494",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ],
  "regler": [
   "Listen håndhæves af konverteringen (scripts/vaerksark_til_yaml.py), ikke af config.py."
  ]
 },
 {
  "sti": "units.*.enabled",
  "sektion": "units",
  "etiket": "Med i modellen",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "false fjerner enheden helt fra modellen — samme virkning som at slå den fra i et scenarie. Sæt ikke kapaciteten til 0 i stedet.",
  "kilde": "src/config.py:513",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.p_max_heat",
  "sektion": "units",
  "etiket": "Maks. varmeeffekt",
  "enhed": "MW varme",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Enhedens største varmeproduktion. For varmepumpe med ydelsestabel et ekstra loft oven på tabellen; for solvarme nameplate (profilen binder).",
  "kilde": "src/config.py:495",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ],
  "regler": [
   "p_min_heat ≤ p_max_heat"
  ]
 },
 {
  "sti": "units.*.p_min_heat",
  "sektion": "units",
  "etiket": "Min. varmeeffekt (minimumslast)",
  "enhed": "MW varme",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Laveste last, når enheden er tændt. Virker kun, når uc_enabled er true.",
  "kilde": "src/config.py:496",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ],
  "regler": [
   "p_min_heat ≤ p_max_heat"
  ]
 },
 {
  "sti": "units.*.alpha",
  "sektion": "units",
  "etiket": "El/varme-forhold (α)",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Elkedel: −1. Varmepumpe uden tabel: −1/COP. Gasmotor: el/varme (> 0), som giver elsalg. Kedler og sol: 0.",
  "kilde": "src/config.py:497",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ],
  "regler": [
   "Negativ for el-forbrugende enheder, positiv kun for kraftvarme."
  ]
 },
 {
  "sti": "units.*.fuel",
  "sektion": "units",
  "etiket": "Brændsel",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "electricity",
   "solar",
   "natural_gas",
   "straw",
   "flis",
   "wood_pellets",
   "waste_heat"
  ],
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Hvad enheden bruger: electricity, solar eller en nøgle under prices. Afgør marginalomkostningen og om enheden kan byde i balancemarkedet (kun electricity).",
  "kilde": "src/config.py:498",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ],
  "regler": [
   "Andet end electricity/solar kræver eta_fuel_to_heat.",
   "Brændslets pris skal stå under prices."
  ]
 },
 {
  "sti": "units.*.eta_fuel_to_heat",
  "sektion": "units",
  "etiket": "Virkningsgrad brændsel→varme",
  "enhed": "brøk",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": [
   "biomass_boiler",
   "gas_boiler",
   "gas_engine_chp",
   "waste_heat"
  ],
  "forklaring": "Varme pr. brændsel (0,96 = 96 %). Brændselsomkostningen pr. MWh varme er pris/η.",
  "kilde": "src/config.py:499",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "min_eksklusiv": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ],
  "regler": [
   "Påkrævet, når fuel ikke er electricity eller solar."
  ]
 },
 {
  "sti": "units.*.var_om",
  "sektion": "units",
  "etiket": "Variabel D&V",
  "enhed": "DKK/MWh varme",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Drifts- og vedligeholdelsesomkostning pr. MWh varme.",
  "kilde": "src/config.py:500",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 0.0,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.start_cost",
  "sektion": "units",
  "etiket": "Startomkostning",
  "enhed": "DKK/start",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Omkostning pr. start. Virker kun, når uc_enabled er true.",
  "kilde": "src/config.py:501",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 0.0,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.min_uptime",
  "sektion": "units",
  "etiket": "Min. driftstid",
  "enhed": "timer",
  "type": "integer",
  "tilladte": null,
  "min": 1,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Antal timer enheden skal køre efter en start. Virker kun med uc_enabled.",
  "kilde": "src/config.py:502",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 1,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.min_downtime",
  "sektion": "units",
  "etiket": "Min. stilstandstid",
  "enhed": "timer",
  "type": "integer",
  "tilladte": null,
  "min": 1,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Antal timer enheden skal stå efter et stop. Virker kun med uc_enabled.",
  "kilde": "src/config.py:503",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 1,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.uc_enabled",
  "sektion": "units",
  "etiket": "Start/stop-logik (unit commitment)",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Slår minimumslast, min. drifts-/stilstandstid og startomkostning til. Gør modellen til en MILP og løsetiden længere.",
  "kilde": "src/config.py:519",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": false,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.initial_status",
  "sektion": "units",
  "etiket": "Tændt ved periodens start",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   0,
   1
  ],
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "1 = tændt, 0 = slukket i første time. Betyder noget for enheder med minimumslast: tændte kedler uden tank kan gøre sommeren uløselig.",
  "kilde": "src/config.py:520",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 1,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.co2_emissions_per_mwh_fuel",
  "sektion": "units",
  "etiket": "CO₂-udledning",
  "enhed": "t CO₂/MWh brændsel",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Ton CO₂ pr. MWh brændsel. Naturgas ca. 0,2; biomasse 0 (regnes neutral).",
  "kilde": "src/config.py:504",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 0.0,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.production_profile_path",
  "sektion": "units",
  "etiket": "Produktionsprofil (CSV)",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": [
   "solar_thermal"
  ],
  "forklaring": "Tidsserie, der binder produktionen time for time: loft = min(profil, p_max_heat). Bruges til solvarme. Stien er relativ til modelrepoets rod; CSV med kolonnerne time (UTC) og en værdi i MW. Skal dække hele perioden.",
  "kilde": "src/config.py:510",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ],
  "regler": [
   "Filen skal dække hver time i perioden; den nulfyldes ikke."
  ]
 },
 {
  "sti": "units.*.commissioned",
  "sektion": "units",
  "etiket": "Idriftsættelsesår",
  "enhed": null,
  "type": "integer",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Ren dokumentation; læses ikke af modellen.",
  "kilde": "src/config.py:511",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.notes",
  "sektion": "units",
  "etiket": "Noter",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Fritekst; læses ikke af modellen.",
  "kilde": "src/config.py:512",
  "avanceret": false,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.cop_curve",
  "sektion": "units",
  "etiket": "Varmepumpens ydelse",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": [
   "heat_pump"
  ],
  "forklaring": "Valgfri for heat_pump. Overruler alpha. Anbefalet er type table med målte punkter; uden blokken bruges COP = −1/alpha konstant.",
  "kilde": "src/config.py:506",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": false,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": false,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ],
  "regler": [
   "Kun type heat_pump med fuel electricity."
  ]
 },
 {
  "sti": "units.*.cop_curve.type",
  "sektion": "units",
  "etiket": "Ydelsesmodel",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "linear",
   "table"
  ],
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": [
   "heat_pump"
  ],
  "forklaring": "table: målte punkter (udetemperatur, varme, el ved fuld last); varmeloftet følger temperaturen. linear: COP = a + b·T, klippet, med fast varmeloft (giver størst eloptag i frost — det omvendte af virkeligheden).",
  "kilde": "src/config.py:387",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": "linear",
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.cop_curve.a",
  "sektion": "units",
  "etiket": "Lineær kurve: COP ved 0 °C",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": [
   "heat_pump"
  ],
  "forklaring": "Kun for type linear: COP = clip(a + b·T_ude, cop_min, cop_max).",
  "kilde": "src/config.py:388",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 2.2,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.cop_curve.b",
  "sektion": "units",
  "etiket": "Lineær kurve: COP-stigning pr. °C",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": [
   "heat_pump"
  ],
  "forklaring": "Kun for type linear: COP = clip(a + b·T_ude, cop_min, cop_max).",
  "kilde": "src/config.py:389",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 0.08,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.cop_curve.cop_min",
  "sektion": "units",
  "etiket": "Lineær kurve: Laveste COP",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": [
   "heat_pump"
  ],
  "forklaring": "Kun for type linear: COP = clip(a + b·T_ude, cop_min, cop_max).",
  "kilde": "src/config.py:390",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 1.8,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ],
  "regler": [
   "cop_min > 0 og cop_max > cop_min"
  ]
 },
 {
  "sti": "units.*.cop_curve.cop_max",
  "sektion": "units",
  "etiket": "Lineær kurve: Højeste COP",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": [
   "heat_pump"
  ],
  "forklaring": "Kun for type linear: COP = clip(a + b·T_ude, cop_min, cop_max).",
  "kilde": "src/config.py:391",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 4.0,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ],
  "regler": [
   "cop_min > 0 og cop_max > cop_min"
  ]
 },
 {
  "sti": "units.*.cop_curve.points",
  "sektion": "units",
  "etiket": "Ydelsestabel (målepunkter)",
  "enhed": null,
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": [
   "heat_pump"
  ],
  "forklaring": "Liste af {t_ambient (°C), heat_mw, el_mw} ved fuld last, gerne omkring −10, 0 og +15 °C. Varme og el interpoleres hver for sig; uden for punkterne holdes yderværdien. Tabellens største eloptag er reservationsloftet i balancemarkedet.",
  "kilde": "src/config.py:392",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": false,
  "eksempel": [
   {
    "t_ambient": -10.0,
    "heat_mw": 12.0,
    "el_mw": 5.0
   },
   {
    "t_ambient": 0.0,
    "heat_mw": 16.0,
    "el_mw": 5.5
   },
   {
    "t_ambient": 16.0,
    "heat_mw": 21.0,
    "el_mw": 6.2
   }
  ],
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ],
  "regler": [
   "Mindst to punkter (kun type table).",
   "heat_mw > 0 og el_mw > 0.",
   "COP = heat_mw/el_mw skal ligge i 1–8 (ellers er tal byttet om eller i kW).",
   "Samme udetemperatur må ikke stå to gange."
  ]
 },
 {
  "sti": "units.*.ancillary",
  "sektion": "units",
  "etiket": "Balancemarked for enheden",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Kvalifikation og lofter for enhedens bud. Kun enheder med fuel electricity byder, uanset flagene.",
  "kilde": "src/config.py:958",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": false,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": false,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.ancillary.afrr_qualified",
  "sektion": "units",
  "etiket": "Prækvalificeret til aFRR",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": [
   "heat_pump",
   "electric_boiler"
  ],
  "forklaring": "Må enheden byde op-regulering i aFRR.",
  "kilde": "src/config.py:33",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": false,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.ancillary.mfrr_qualified",
  "sektion": "units",
  "etiket": "Prækvalificeret til mFRR",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": [
   "heat_pump",
   "electric_boiler"
  ],
  "forklaring": "Må enheden byde op-regulering i mFRR.",
  "kilde": "src/config.py:34",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": false,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.ancillary.fcr_qualified",
  "sektion": "units",
  "etiket": "Prækvalificeret til FCR",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Læses, men bruges ikke: FCR er ikke med i modellen.",
  "kilde": "src/config.py:35",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": false,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.ancillary.afrr_max_bid_mw",
  "sektion": "units",
  "etiket": "Maks. aFRR-bud for enheden",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Ældre pris-tager-beskyttelse pr. enhed. Ignoreres, når balancing.ancillary_caps eller shared_reserve_cap_mw er sat.",
  "kilde": "src/config.py:44",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.ancillary.mfrr_max_bid_mw",
  "sektion": "units",
  "etiket": "Maks. mFRR-bud for enheden",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Ældre pris-tager-beskyttelse pr. enhed. Ignoreres, når balancing.ancillary_caps eller shared_reserve_cap_mw er sat.",
  "kilde": "src/config.py:45",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.ancillary.available_from",
  "sektion": "units",
  "etiket": "Byder fra dato",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "ISO-dato; før den reserverer enheden intet (fx efter indkøring). Varmedriften er urørt.",
  "kilde": "src/config.py:53",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "eksempel": "2026-03-01",
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.ancillary.bid_window.months",
  "sektion": "units",
  "etiket": "Budvindue: måneder",
  "enhed": null,
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Måneder (1–12, lokal tid), hvor enheden byder. Udeladt = alle. Fx byder mange værker ikke elkedlen om sommeren.",
  "kilde": "src/balancing.py:502",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": false,
  "eksempel": [
   10,
   11,
   12,
   1,
   2,
   3
  ],
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "units.*.ancillary.bid_window.hours_local",
  "sektion": "units",
  "etiket": "Budvindue: timer",
  "enhed": null,
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Timer på døgnet (0–23, dansk lokaltid), hvor enheden byder. Udeladt = alle.",
  "kilde": "src/balancing.py:505",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": false,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ]
 },
 {
  "sti": "storage.*",
  "sektion": "storage",
  "etiket": "Varmelager (tank)",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Én blok pr. tank eller temperaturlag. Påkrævede felter: volume_m3, delta_t_k, e_initial_mwh, p_max_charge_mw, p_max_discharge_mw, self_discharge_per_hour.",
  "kilde": "src/config.py:966",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": false,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": false,
  "stjerne": [
   {
    "navn": "lager",
    "fra": "storage"
   }
  ],
  "regler": [
   "Ukendte felter afvises (Storage(**felter))."
  ]
 },
 {
  "sti": "storage.*.enabled",
  "sektion": "storage",
  "etiket": "Med i modellen",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "false fjerner lageret helt — sådan regnes tankens værdi.",
  "kilde": "src/config.py:568",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": true,
  "stjerne": [
   {
    "navn": "lager",
    "fra": "storage"
   }
  ]
 },
 {
  "sti": "storage.*.volume_m3",
  "sektion": "storage",
  "etiket": "Volumen",
  "enhed": "m³",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Tankens vandvolumen. Kapaciteten regnes af volumen og ΔT, hvis e_max_mwh er tom.",
  "kilde": "src/config.py:559",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "lager",
    "fra": "storage"
   }
  ],
  "regler": [
   "Ændres volumen, skal e_max_mwh være tom, ellers har ændringen ingen virkning."
  ]
 },
 {
  "sti": "storage.*.delta_t_k",
  "sektion": "storage",
  "etiket": "Temperaturdifferens (ΔT)",
  "enhed": "K",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Forskellen mellem lagerets top og bund. Kapacitet [MWh] = volumen × 1,163 kWh/(m³·K) × ΔT / 1000.",
  "kilde": "src/config.py:560",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "lager",
    "fra": "storage"
   }
  ]
 },
 {
  "sti": "storage.*.e_max_mwh",
  "sektion": "storage",
  "etiket": "Energikapacitet",
  "enhed": "MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Tom (null) = regnes af volumen og ΔT (anbefalet). Et tal her vinder over volumen.",
  "kilde": "src/config.py:566",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": null,
  "stjerne": [
   {
    "navn": "lager",
    "fra": "storage"
   }
  ]
 },
 {
  "sti": "storage.*.e_initial_mwh",
  "sektion": "storage",
  "etiket": "Indhold ved start",
  "enhed": "MWh",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Lagerets indhold i første time. Med cyklusbinding skal lageret ende her.",
  "kilde": "src/config.py:561",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "lager",
    "fra": "storage"
   }
  ],
  "regler": [
   "≥ 0. Er den større end kapaciteten, sættes den automatisk til halvfuld."
  ]
 },
 {
  "sti": "storage.*.p_max_charge_mw",
  "sektion": "storage",
  "etiket": "Maks. ladeeffekt",
  "enhed": "MW",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Største effekt ind i lageret.",
  "kilde": "src/config.py:562",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "lager",
    "fra": "storage"
   }
  ]
 },
 {
  "sti": "storage.*.p_max_discharge_mw",
  "sektion": "storage",
  "etiket": "Maks. afladeeffekt",
  "enhed": "MW",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Største effekt ud af lageret.",
  "kilde": "src/config.py:563",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "lager",
    "fra": "storage"
   }
  ]
 },
 {
  "sti": "storage.*.self_discharge_per_hour",
  "sektion": "storage",
  "etiket": "Varmetab pr. time",
  "enhed": "brøk/time",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Andel af indholdet, der tabes pr. time (0,0005 = 0,05 %).",
  "kilde": "src/config.py:564",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "lager",
    "fra": "storage"
   }
  ]
 },
 {
  "sti": "storage.*.cycle_binding",
  "sektion": "storage",
  "etiket": "Slut som start",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Lageret skal ende med samme indhold, som det startede med, så perioden ikke tærer på et lager, den ikke har betalt for.",
  "kilde": "src/config.py:565",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": true,
  "stjerne": [
   {
    "navn": "lager",
    "fra": "storage"
   }
  ]
 },
 {
  "sti": "storage.*.notes",
  "sektion": "storage",
  "etiket": "Noter",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Fritekst; læses ikke af modellen.",
  "kilde": "src/config.py:567",
  "avanceret": false,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "lager",
    "fra": "storage"
   }
  ]
 },
 {
  "sti": "grid.max_consumption_mw",
  "sektion": "grid",
  "etiket": "Nettilslutning, maks. eloptag",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Loft over det samlede eloptag fra varmepumper og elkedler pr. time. Gælder også planen uden aktivering og begrænser derfor reservationen. Billund: 33 MW.",
  "kilde": "src/config.py:1139",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "min_eksklusiv": true,
  "regler": [
   "> 0, og casen skal have mindst én aktiv el-enhed."
  ]
 },
 {
  "sti": "investment.enabled",
  "sektion": "investment",
  "etiket": "Investeringsmodul",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Læses, men bruges ikke af modellen i dag. Investeringer regnes som differens mellem to kørsler.",
  "kilde": "src/config.py:1153",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": false
 },
 {
  "sti": "ancillary_groups.*",
  "sektion": "ancillary_groups",
  "etiket": "Budgruppe",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Flere enheder med én fælles budgrænse pr. marked. Ignoreres, når balancing.ancillary_caps eller shared_reserve_cap_mw er sat.",
  "kilde": "src/config.py:972",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": false,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": false,
  "stjerne": [
   {
    "navn": "gruppe"
   }
  ]
 },
 {
  "sti": "ancillary_groups.*.units",
  "sektion": "ancillary_groups",
  "etiket": "Gruppens enheder",
  "enhed": null,
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Enhedsnavne, der deler grænsen.",
  "kilde": "src/config.py:84",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": false,
  "stjerne": [
   {
    "navn": "gruppe"
   }
  ],
  "regler": [
   "Hvert navn skal findes under units."
  ]
 },
 {
  "sti": "ancillary_groups.*.afrr_max_bid_mw",
  "sektion": "ancillary_groups",
  "etiket": "Gruppens maks. aFRR-bud",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Summen af gruppens aFRR-bud pr. time.",
  "kilde": "src/config.py:85",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "gruppe"
   }
  ]
 },
 {
  "sti": "ancillary_groups.*.mfrr_max_bid_mw",
  "sektion": "ancillary_groups",
  "etiket": "Gruppens maks. mFRR-bud",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Summen af gruppens mFRR-bud pr. time.",
  "kilde": "src/config.py:86",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "gruppe"
   }
  ]
 },
 {
  "sti": "balancing",
  "sektion": "balancing",
  "etiket": "Balancemarked",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Læses kun ved kørsel med balancering. Uden den er varmeprisen ren spot.",
  "kilde": "src/config.py:983",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": false,
  "kan_saettes_i_scenarie": false,
  "kan_saettes_med_cli_set": false,
  "regler": [
   "Kun nøglerne method, bid_strategy, ancillary_caps, reservation_gate, activation, availability, shared_reserve_cap_mw og robust_reservation er tilladt."
  ]
 },
 {
  "sti": "balancing.method",
  "sektion": "balancing",
  "etiket": "Indtægtsmetode",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "legacy",
   "activation_value"
  ],
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "activation_value (anbefalet): aktiveringsværdien regnes kvarter for kvarter, så samvariation mellem pris og aktivering fanges. legacy: gennemsnit gange gennemsnit; undervurderer systematisk.",
  "kilde": "src/config.py:993",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": "legacy",
  "regler": [
   "activation_value kræver bid_strategy."
  ]
 },
 {
  "sti": "balancing.robust_reservation",
  "sektion": "balancing",
  "etiket": "Robust reservation",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Driften skal også holde, hvis buddet ikke aktiveres: varmen fra reserverede enheder skal kunne afsættes i nettet eller tanken. Standard siden 15/10-2026.",
  "kilde": "src/config.py:992",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": true
 },
 {
  "sti": "balancing.shared_reserve_cap_mw",
  "sektion": "balancing",
  "etiket": "Fælles reserveloft (ældre)",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Ældre form af det samlede loft. Brug ancillary_caps.total_mw i stedet.",
  "kilde": "src/config.py:1154",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "balancing.bid_strategy.up_markup_dkk_mwh",
  "sektion": "balancing",
  "etiket": "Aktiveringsbud: tillæg til spot",
  "enhed": "DKK/MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Buddet på energi er spot + dette tillæg. Højere tillæg = sjældnere, men dyrere aktivering. Billund: 500.",
  "kilde": "src/config.py:101",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "regler": [
   "Påkrævet, når bid_strategy-blokken findes."
  ]
 },
 {
  "sti": "balancing.bid_strategy.up_markup_max_dkk_mwh",
  "sektion": "balancing",
  "etiket": "Aktiveringsbud: øvre bånd",
  "enhed": "DKK/MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Dokumentation af et øvre bånd; bruges ikke i beregningen.",
  "kilde": "src/config.py:102",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "balancing.bid_strategy.down_markdown_dkk_mwh",
  "sektion": "balancing",
  "etiket": "Nedreguleringsbud: fradrag",
  "enhed": "DKK/MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Læses, men bruges ikke: modellen byder kun op-regulering.",
  "kilde": "src/config.py:103",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "balancing.bid_strategy.down_markdown_max_dkk_mwh",
  "sektion": "balancing",
  "etiket": "Nedreguleringsbud: øvre bånd",
  "enhed": "DKK/MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Læses, men bruges ikke.",
  "kilde": "src/config.py:104",
  "avanceret": true,
  "laeses_af_koden": false,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "balancing.ancillary_caps.per_unit_mw.*",
  "sektion": "balancing",
  "etiket": "Prækvalifikation pr. enhed",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Største samlede bud (aFRR + mFRR) for enheden pr. time. Håndhæves altid.",
  "kilde": "src/config.py:128",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   }
  ],
  "regler": [
   "Enhedsnavnet skal findes under units."
  ]
 },
 {
  "sti": "balancing.ancillary_caps.per_unit_market_mw.*.*",
  "sektion": "balancing",
  "etiket": "Bud pr. enhed pr. marked",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Værkets egen fordeling af den prækvalificerede effekt mellem aFRR og mFRR.",
  "kilde": "src/config.py:129",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "enhed",
    "fra": "units"
   },
   {
    "navn": "marked",
    "tilladte": [
     "afrr",
     "mfrr"
    ]
   }
  ],
  "regler": [
   "Enhedsnavnet skal findes under units.",
   "Marked er afrr eller mfrr."
  ]
 },
 {
  "sti": "balancing.ancillary_caps.total_mw",
  "sektion": "balancing",
  "etiket": "Samlet prækvalifikation",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Største sum af alle bud på tværs af enheder og markeder pr. time.",
  "kilde": "src/config.py:130",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true
 },
 {
  "sti": "balancing.reservation_gate.enabled",
  "sektion": "balancing",
  "etiket": "Kapacitetsprisgate til",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Byd kun i timer, hvor kapacitetsprisen er over en tærskel (fast eller beregnet).",
  "kilde": "src/config.py:326",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": false
 },
 {
  "sti": "balancing.reservation_gate.mode",
  "sektion": "balancing",
  "etiket": "Gatens virkemåde",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "driven",
   "bound"
  ],
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "bound: reservationen er højst blokken, når gaten er åben (Spor A, normativ). driven: reservationen ER blokken, når gaten er åben (fast melding).",
  "kilde": "src/config.py:327",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": "driven"
 },
 {
  "sti": "balancing.reservation_gate.*.cm_threshold_dkk_mw_h",
  "sektion": "balancing",
  "etiket": "Fast budpris på kapacitet",
  "enhed": "DKK/MW/h",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Tærskel på day-ahead kapacitetsprisen; gaten er åben, når prisen er mindst denne.",
  "kilde": "src/config.py:156",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "marked",
    "tilladte": [
     "afrr",
     "mfrr"
    ]
   }
  ],
  "regler": [
   "Sæt enten cm_threshold_dkk_mw_h eller opportunity_cost for markedet."
  ]
 },
 {
  "sti": "balancing.reservation_gate.*.block_mw",
  "sektion": "balancing",
  "etiket": "Blokstørrelse",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": true,
  "gaelder_for": null,
  "forklaring": "Den mængde, der reserveres (driven) eller højst reserveres (bound), når gaten er åben.",
  "kilde": "src/config.py:162",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "marked",
    "tilladte": [
     "afrr",
     "mfrr"
    ]
   }
  ],
  "regler": [
   "Med driven må aFRR- og mFRR-blok tilsammen ikke overstige enhedernes samtidige eloptag, ellers bliver modellen uløselig."
  ]
 },
 {
  "sti": "balancing.reservation_gate.*.opportunity_cost.reference_unit",
  "sektion": "balancing",
  "etiket": "Beregnet budpris: referenceenhed",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Den el-enhed, alternativomkostningen regnes for: τ = spot + tarif + afgift + COP·var_om − COP·(alternativ varmepris).",
  "kilde": "src/balancing.py:709",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "marked",
    "tilladte": [
     "afrr",
     "mfrr"
    ]
   }
  ],
  "regler": [
   "Skal være et enhedsnavn under units."
  ]
 },
 {
  "sti": "balancing.reservation_gate.*.opportunity_cost.floor_dkk_mw_h",
  "sektion": "balancing",
  "etiket": "Beregnet budpris: gulv",
  "enhed": "DKK/MW/h",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Laveste budpris uanset beregningen.",
  "kilde": "src/balancing.py:724",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": 0.0,
  "stjerne": [
   {
    "navn": "marked",
    "tilladte": [
     "afrr",
     "mfrr"
    ]
   }
  ]
 },
 {
  "sti": "balancing.activation.foresight",
  "sektion": "balancing",
  "etiket": "Hvad modellen ved, når den byder",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "realized",
   "profile",
   "trailing30",
   "lag24",
   "lag168"
  ],
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "realized: kender de faktiske aktiveringer (kun øvre grænse). profile: gennemsnit pr. måned og time. trailing30: de seneste 30 døgn. lag24/lag168: i går / sidste uge.",
  "kilde": "src/config.py:238",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": "realized",
  "regler": [
   "Andet end realized kræver method activation_value."
  ]
 },
 {
  "sti": "balancing.activation.settle",
  "sektion": "balancing",
  "etiket": "Afregning",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "forecast",
   "realized"
  ],
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "forecast: tallet er prognosens. realized: løs på prognosen, lås reservationerne, og løs igen på det, der faktisk skete. Virker kun, når foresight ikke er realized.",
  "kilde": "src/config.py:236",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": "forecast"
 },
 {
  "sti": "balancing.activation.*.model",
  "sektion": "balancing",
  "etiket": "Aktiveret andel",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "clear",
   "system_share",
   "ramp"
  ],
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "clear: hele buddet aktiveres, når prisen clearer (overvurderer 4–5 gange uden loft). system_share: andel efter systemets aktivering × k. ramp: andelen vokser med prisens afstand til buddet.",
  "kilde": "src/config.py:197",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": "clear",
  "stjerne": [
   {
    "navn": "marked",
    "tilladte": [
     "afrr",
     "mfrr"
    ]
   }
  ],
  "regler": [
   "Andet end clear kræver method activation_value."
  ]
 },
 {
  "sti": "balancing.activation.*.k",
  "sektion": "balancing",
  "etiket": "Skalering af systemandel (k)",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Kun system_share. Billund/Andeby-kalibrering for aFRR: 4.",
  "kilde": "src/config.py:194",
  "avanceret": false,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "min_eksklusiv": true,
  "standard": 1.0,
  "stjerne": [
   {
    "navn": "marked",
    "tilladte": [
     "afrr",
     "mfrr"
    ]
   }
  ]
 },
 {
  "sti": "balancing.activation.*.ramp_dkk_mwh",
  "sektion": "balancing",
  "etiket": "Rampebredde",
  "enhed": "DKK/MWh",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Kun ramp: prisafstand over buddet, hvor hele buddet regnes aktiveret.",
  "kilde": "src/config.py:195",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "min_eksklusiv": true,
  "stjerne": [
   {
    "navn": "marked",
    "tilladte": [
     "afrr",
     "mfrr"
    ]
   }
  ],
  "regler": [
   "Påkrævet og > 0 ved model ramp."
  ]
 },
 {
  "sti": "balancing.availability.enabled",
  "sektion": "balancing",
  "etiket": "Månedsloft på reservationen til",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Værkets faktiske reservation pr. måned som loft (Spor B). Kræver egne afregningsdata og kan ikke overføres til andre værker eller perioder.",
  "kilde": "src/config.py:289",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": false
 },
 {
  "sti": "balancing.availability.mode",
  "sektion": "balancing",
  "etiket": "Månedsloftets form",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "hourly",
   "energy"
  ],
  "min": null,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "hourly: loft i hver time. energy: loft på månedens MWh; modellen vælger selv timerne.",
  "kilde": "src/config.py:290",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "standard": "hourly"
 },
 {
  "sti": "balancing.availability.*.mw_by_month.*",
  "sektion": "balancing",
  "etiket": "Månedsloft",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "paakraevet": false,
  "gaelder_for": null,
  "forklaring": "Reserverede MW for måneden (nøgle ÅÅÅÅ-MM).",
  "kilde": "src/config.py:258",
  "avanceret": true,
  "laeses_af_koden": true,
  "blad": true,
  "kan_saettes_i_scenarie": true,
  "kan_saettes_med_cli_set": true,
  "stjerne": [
   {
    "navn": "marked",
    "tilladte": [
     "afrr",
     "mfrr"
    ]
   },
   {
    "navn": "måned",
    "format": "ÅÅÅÅ-MM"
   }
  ],
  "regler": [
   "Hver måned i perioden skal have et loft, ellers stopper kørslen."
  ]
 }
];

export const ENHEDSTYPER: Readonly<Record<string, Enhedstype>> = {
 "heat_pump": {
  "navn": "Varmepumpe",
  "beskrivelse": "El-forbrugende. COP fra en målt ydelsestabel (anbefalet) eller en lineær kurve. Kan byde op-regulering i aFRR/mFRR.",
  "fuel": [
   "electricity"
  ],
  "paakraevede": [
   "type",
   "p_max_heat",
   "p_min_heat",
   "alpha",
   "fuel"
  ],
  "valgfri": [
   "enabled",
   "var_om",
   "uc_enabled",
   "start_cost",
   "min_uptime",
   "min_downtime",
   "initial_status",
   "commissioned",
   "notes",
   "cop_curve",
   "ancillary"
  ],
  "irrelevante": [
   "eta_fuel_to_heat",
   "co2_emissions_per_mwh_fuel",
   "production_profile_path"
  ],
  "kan_byde_balance": true,
  "noter": [
   "alpha bruges kun uden cop_curve: COP = −1/alpha.",
   "Med type table er varmeloftet min(p_max_heat, tabellens varme ved T_ude).",
   "Skabelonens tal er pladsholdere; erstat med målte punkter."
  ],
  "skabelon": [
   {
    "sti": "enabled",
    "vaerdi_json": "true"
   },
   {
    "sti": "type",
    "vaerdi_json": "\"heat_pump\""
   },
   {
    "sti": "p_max_heat",
    "vaerdi_json": "4.0"
   },
   {
    "sti": "p_min_heat",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "alpha",
    "vaerdi_json": "-0.333"
   },
   {
    "sti": "fuel",
    "vaerdi_json": "\"electricity\""
   },
   {
    "sti": "var_om",
    "vaerdi_json": "13.4"
   },
   {
    "sti": "start_cost",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "min_uptime",
    "vaerdi_json": "1"
   },
   {
    "sti": "min_downtime",
    "vaerdi_json": "1"
   },
   {
    "sti": "uc_enabled",
    "vaerdi_json": "false"
   },
   {
    "sti": "cop_curve.type",
    "vaerdi_json": "\"table\""
   },
   {
    "sti": "cop_curve.points",
    "vaerdi_json": "[{\"t_ambient\":-10.0,\"heat_mw\":3.0,\"el_mw\":1.25},{\"t_ambient\":0.0,\"heat_mw\":3.4,\"el_mw\":1.17},{\"t_ambient\":16.0,\"heat_mw\":4.0,\"el_mw\":1.18}]"
   },
   {
    "sti": "ancillary.afrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.mfrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.fcr_qualified",
    "vaerdi_json": "false"
   }
  ]
 },
 "electric_boiler": {
  "navn": "Elkedel",
  "beskrivelse": "El-forbrugende med COP 1 (alpha −1). Kan byde op-regulering.",
  "fuel": [
   "electricity"
  ],
  "paakraevede": [
   "type",
   "p_max_heat",
   "p_min_heat",
   "alpha",
   "fuel"
  ],
  "valgfri": [
   "enabled",
   "var_om",
   "uc_enabled",
   "start_cost",
   "min_uptime",
   "min_downtime",
   "initial_status",
   "commissioned",
   "notes",
   "ancillary"
  ],
  "irrelevante": [
   "eta_fuel_to_heat",
   "co2_emissions_per_mwh_fuel",
   "cop_curve",
   "production_profile_path"
  ],
  "kan_byde_balance": true,
  "noter": [
   "alpha skal være −1 (1 MWh el giver 1 MWh varme)."
  ],
  "skabelon": [
   {
    "sti": "enabled",
    "vaerdi_json": "true"
   },
   {
    "sti": "type",
    "vaerdi_json": "\"electric_boiler\""
   },
   {
    "sti": "p_max_heat",
    "vaerdi_json": "10.0"
   },
   {
    "sti": "p_min_heat",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "alpha",
    "vaerdi_json": "-1.0"
   },
   {
    "sti": "fuel",
    "vaerdi_json": "\"electricity\""
   },
   {
    "sti": "var_om",
    "vaerdi_json": "6.7"
   },
   {
    "sti": "start_cost",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "min_uptime",
    "vaerdi_json": "1"
   },
   {
    "sti": "min_downtime",
    "vaerdi_json": "1"
   },
   {
    "sti": "uc_enabled",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.afrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.mfrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.fcr_qualified",
    "vaerdi_json": "false"
   }
  ]
 },
 "biomass_boiler": {
  "navn": "Biomassekedel",
  "beskrivelse": "Halm, flis eller træpiller. Typisk grundlast med minimumslast og min. driftstid (unit commitment).",
  "fuel": [
   "straw",
   "flis",
   "wood_pellets"
  ],
  "paakraevede": [
   "type",
   "p_max_heat",
   "p_min_heat",
   "alpha",
   "fuel",
   "eta_fuel_to_heat"
  ],
  "valgfri": [
   "enabled",
   "var_om",
   "uc_enabled",
   "start_cost",
   "min_uptime",
   "min_downtime",
   "initial_status",
   "commissioned",
   "notes",
   "co2_emissions_per_mwh_fuel"
  ],
  "irrelevante": [
   "cop_curve",
   "production_profile_path"
  ],
  "kan_byde_balance": false,
  "noter": [
   "Prisen for brændslet skal stå under prices.",
   "initial_status 1 uden tank kan gøre sommeren uløselig (rapport v4, afsnit 4.4)."
  ],
  "skabelon": [
   {
    "sti": "enabled",
    "vaerdi_json": "true"
   },
   {
    "sti": "type",
    "vaerdi_json": "\"biomass_boiler\""
   },
   {
    "sti": "p_max_heat",
    "vaerdi_json": "10.0"
   },
   {
    "sti": "p_min_heat",
    "vaerdi_json": "3.0"
   },
   {
    "sti": "alpha",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "fuel",
    "vaerdi_json": "\"straw\""
   },
   {
    "sti": "eta_fuel_to_heat",
    "vaerdi_json": "0.95"
   },
   {
    "sti": "var_om",
    "vaerdi_json": "30.0"
   },
   {
    "sti": "start_cost",
    "vaerdi_json": "5000.0"
   },
   {
    "sti": "min_uptime",
    "vaerdi_json": "4"
   },
   {
    "sti": "min_downtime",
    "vaerdi_json": "6"
   },
   {
    "sti": "uc_enabled",
    "vaerdi_json": "true"
   },
   {
    "sti": "initial_status",
    "vaerdi_json": "0"
   },
   {
    "sti": "ancillary.afrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.mfrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.fcr_qualified",
    "vaerdi_json": "false"
   }
  ]
 },
 "gas_boiler": {
  "navn": "Gaskedel",
  "beskrivelse": "Naturgas, typisk spids og reserve.",
  "fuel": [
   "natural_gas"
  ],
  "paakraevede": [
   "type",
   "p_max_heat",
   "p_min_heat",
   "alpha",
   "fuel",
   "eta_fuel_to_heat"
  ],
  "valgfri": [
   "enabled",
   "var_om",
   "uc_enabled",
   "start_cost",
   "min_uptime",
   "min_downtime",
   "initial_status",
   "commissioned",
   "notes",
   "co2_emissions_per_mwh_fuel"
  ],
  "irrelevante": [
   "cop_curve",
   "production_profile_path"
  ],
  "kan_byde_balance": false,
  "noter": [
   "co2_emissions_per_mwh_fuel ca. 0,2 t/MWh for naturgas."
  ],
  "skabelon": [
   {
    "sti": "enabled",
    "vaerdi_json": "true"
   },
   {
    "sti": "type",
    "vaerdi_json": "\"gas_boiler\""
   },
   {
    "sti": "p_max_heat",
    "vaerdi_json": "15.0"
   },
   {
    "sti": "p_min_heat",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "alpha",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "fuel",
    "vaerdi_json": "\"natural_gas\""
   },
   {
    "sti": "eta_fuel_to_heat",
    "vaerdi_json": "0.95"
   },
   {
    "sti": "var_om",
    "vaerdi_json": "30.0"
   },
   {
    "sti": "start_cost",
    "vaerdi_json": "500.0"
   },
   {
    "sti": "min_uptime",
    "vaerdi_json": "1"
   },
   {
    "sti": "min_downtime",
    "vaerdi_json": "1"
   },
   {
    "sti": "uc_enabled",
    "vaerdi_json": "false"
   },
   {
    "sti": "co2_emissions_per_mwh_fuel",
    "vaerdi_json": "0.2"
   },
   {
    "sti": "ancillary.afrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.mfrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.fcr_qualified",
    "vaerdi_json": "false"
   }
  ]
 },
 "gas_engine_chp": {
  "navn": "Gasmotor (kraftvarme)",
  "beskrivelse": "Naturgas til el og varme. alpha = el/varme > 0 giver elsalg til spot minus produktionstarif. Byder ikke i balancemarkedet i modellen.",
  "fuel": [
   "natural_gas"
  ],
  "paakraevede": [
   "type",
   "p_max_heat",
   "p_min_heat",
   "alpha",
   "fuel",
   "eta_fuel_to_heat"
  ],
  "valgfri": [
   "enabled",
   "var_om",
   "uc_enabled",
   "start_cost",
   "min_uptime",
   "min_downtime",
   "initial_status",
   "commissioned",
   "notes",
   "co2_emissions_per_mwh_fuel"
  ],
  "irrelevante": [
   "cop_curve",
   "production_profile_path"
  ],
  "kan_byde_balance": false,
  "noter": [
   "eta_fuel_to_heat er varmevirkningsgraden alene; elvirkningsgraden ligger i alpha.",
   "Motorernes balanceindtægt er ikke med (README)."
  ],
  "skabelon": [
   {
    "sti": "enabled",
    "vaerdi_json": "true"
   },
   {
    "sti": "type",
    "vaerdi_json": "\"gas_engine_chp\""
   },
   {
    "sti": "p_max_heat",
    "vaerdi_json": "5.0"
   },
   {
    "sti": "p_min_heat",
    "vaerdi_json": "1.0"
   },
   {
    "sti": "alpha",
    "vaerdi_json": "0.84"
   },
   {
    "sti": "fuel",
    "vaerdi_json": "\"natural_gas\""
   },
   {
    "sti": "eta_fuel_to_heat",
    "vaerdi_json": "0.49"
   },
   {
    "sti": "var_om",
    "vaerdi_json": "60.0"
   },
   {
    "sti": "start_cost",
    "vaerdi_json": "2000.0"
   },
   {
    "sti": "min_uptime",
    "vaerdi_json": "2"
   },
   {
    "sti": "min_downtime",
    "vaerdi_json": "2"
   },
   {
    "sti": "uc_enabled",
    "vaerdi_json": "false"
   },
   {
    "sti": "initial_status",
    "vaerdi_json": "0"
   },
   {
    "sti": "co2_emissions_per_mwh_fuel",
    "vaerdi_json": "0.2"
   },
   {
    "sti": "ancillary.afrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.mfrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.fcr_qualified",
    "vaerdi_json": "false"
   }
  ]
 },
 "solar_thermal": {
  "navn": "Solvarme",
  "beskrivelse": "Gratis varme; produktionen bindes time for time af en profil-CSV (production_profile_path).",
  "fuel": [
   "solar"
  ],
  "paakraevede": [
   "type",
   "p_max_heat",
   "p_min_heat",
   "alpha",
   "fuel"
  ],
  "valgfri": [
   "enabled",
   "var_om",
   "production_profile_path",
   "notes",
   "commissioned"
  ],
  "irrelevante": [
   "eta_fuel_to_heat",
   "co2_emissions_per_mwh_fuel",
   "cop_curve",
   "uc_enabled",
   "start_cost"
  ],
  "kan_byde_balance": false,
  "noter": [
   "Uden profil er loftet p_max_heat hele døgnet hele året — urealistisk; sæt en profil, der dækker perioden.",
   "Profilstien er relativ til modelrepoets rod (fx data/solar_andeby_dmi_karup.csv)."
  ],
  "skabelon": [
   {
    "sti": "enabled",
    "vaerdi_json": "true"
   },
   {
    "sti": "type",
    "vaerdi_json": "\"solar_thermal\""
   },
   {
    "sti": "p_max_heat",
    "vaerdi_json": "10.0"
   },
   {
    "sti": "p_min_heat",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "alpha",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "fuel",
    "vaerdi_json": "\"solar\""
   },
   {
    "sti": "var_om",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "start_cost",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "uc_enabled",
    "vaerdi_json": "false"
   },
   {
    "sti": "production_profile_path",
    "vaerdi_json": "null"
   },
   {
    "sti": "ancillary.afrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.mfrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.fcr_qualified",
    "vaerdi_json": "false"
   }
  ]
 },
 "waste_heat": {
  "navn": "Overskudsvarme",
  "beskrivelse": "Købt overskudsvarme til en pris pr. MWh (prices.waste_heat).",
  "fuel": [
   "waste_heat"
  ],
  "paakraevede": [
   "type",
   "p_max_heat",
   "p_min_heat",
   "alpha",
   "fuel",
   "eta_fuel_to_heat"
  ],
  "valgfri": [
   "enabled",
   "var_om",
   "uc_enabled",
   "start_cost",
   "min_uptime",
   "min_downtime",
   "initial_status",
   "commissioned",
   "notes"
  ],
  "irrelevante": [
   "cop_curve",
   "production_profile_path"
  ],
  "kan_byde_balance": false,
  "noter": [
   "eta_fuel_to_heat er påkrævet af valideringen, men indgår ikke i omkostningen: prisen bruges direkte pr. MWh varme (model.py)."
  ],
  "skabelon": [
   {
    "sti": "enabled",
    "vaerdi_json": "true"
   },
   {
    "sti": "type",
    "vaerdi_json": "\"waste_heat\""
   },
   {
    "sti": "p_max_heat",
    "vaerdi_json": "3.0"
   },
   {
    "sti": "p_min_heat",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "alpha",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "fuel",
    "vaerdi_json": "\"waste_heat\""
   },
   {
    "sti": "eta_fuel_to_heat",
    "vaerdi_json": "1.0"
   },
   {
    "sti": "var_om",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "start_cost",
    "vaerdi_json": "0.0"
   },
   {
    "sti": "min_uptime",
    "vaerdi_json": "1"
   },
   {
    "sti": "min_downtime",
    "vaerdi_json": "1"
   },
   {
    "sti": "uc_enabled",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.afrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.mfrr_qualified",
    "vaerdi_json": "false"
   },
   {
    "sti": "ancillary.fcr_qualified",
    "vaerdi_json": "false"
   }
  ]
 }
};

export const BRAENDSELSNAVNE: Readonly<Record<string, string>> = {"electricity": "El", "solar": "Sol", "natural_gas": "Naturgas", "straw": "Halm", "flis": "Flis", "wood_pellets": "Træpiller", "waste_heat": "Overskudsvarme", "co2_eua": "CO₂-kvoter"};

export const ENHED_STANDARD_REGLER: readonly string[] = ["p_min_heat ≤ p_max_heat (config.py).", "fuel ∉ {electricity, solar} kræver eta_fuel_to_heat.", "cop_curve kun for type heat_pump med fuel electricity.", "Med uc_enabled: initial_status ∈ {0,1}, min_uptime og min_downtime ≥ 1.", "Ukendte felter afvises (Unit(**felter)).", "Kun fuel electricity kan byde i balancemarkedet (BALANCEMARKED.md)."];
