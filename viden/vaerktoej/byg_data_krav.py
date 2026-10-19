#!/usr/bin/env python3
"""Bygger viden/data_krav.json (ejer: fv-data, KONTRAKT v2.3 §6d).

Kilden er denne fil; JSON'en genereres, så regler, tærskler og beskeder har ét
sted, og så valider_tidsserie.py (oraklet) og appens uploadTidsserie læser de
samme tal. Kør:

    python viden/vaerktoej/byg_data_krav.py

Kildehenvisninger ``fil:linje`` peger på modelrepoet @ b49aeb0 og kontrolleres af
tjek_viden.py [6] og tjek_data_krav.py. Målte tal er målt 2026-10-16 (se
rapporter/fv-data.md for kommandoerne).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
HER = Path(__file__).resolve().parent
UD = HER.parent / "data_krav.json"

PIN = "b49aeb0af097be42938b80a0fea6acdd77162836"
DF_DATA = "392992c7fe35992e79fba8d1ba7b91967e8d1481"

# ---------------------------------------------------------------- datakilder

DATAKILDER = [
    {
        "id": "spot",
        "navn": "Elspotpris",
        "kilde": "df-data spot/{data.price_zone}_{år}.csv, kolonne spot_price_dkk (DKK/MWh), tid hour_utc",
        "bruges": "altid",
        "styres_af": ["data.price_zone"],
        "opløsning": "1h til 2025-09-30 22:00 UTC, derefter 15 min",
        "min_obs_pr_time": 1,
        "bemaerkning": (
            "En timekørsel tager spotprisen for timens FØRSTE kvarter, ikke timens gennemsnit: "
            "spot_raw.reindex(idx) vælger stemplet hh:00 (src/data_loader_github.py:659). Målt på DK1 "
            "1. oktober 2025 - 11. oktober 2026: gennemsnitlig numerisk forskel 79 kr./MWh pr. time, "
            "gennemsnitlig skævhed +6,8 kr./MWh (første kvarter er dyrere). Ubalance- og mFRR-data "
            "midles derimod over timen (src/data_loader_github.py:467). Gælder alle kørsler efter "
            "1. oktober 2025 i version 1."),
        "kode": ["src/data_loader_github.py:289-320", "src/data_loader_github.py:648-659"],
    },
    {
        "id": "dmi",
        "navn": "Udetemperatur (DMI)",
        "kilde": "df-data dmi/{data.dmi_area}_{år}.csv, kolonne {data.dmi_temp_shortname} (standard temp_mean_past1h), tid hour_utc",
        "bruges": "altid - også med målt varmelast: temperaturen bruges af varmepumpens COP-tabel og vises i resultatet",
        "styres_af": ["data.dmi_area", "data.dmi_temp_shortname"],
        "tilladte_omraader": ["fyn", "vestkyst", "karup", "ringsted"],
        "opløsning": "1h",
        "min_obs_pr_time": 1,
        "bemaerkning": (
            "Dækningsvagten tæller RÆKKER, ikke værdier: en række med tom temperatur passerer og "
            "udfyldes ved tidsinterpolation (src/data_loader_github.py:655-658). Målt ved df-data "
            "392992c: fyn 4, karup 14, ringsted 1, vestkyst 9 tomme timer i alt 2023-2026 (bl.a. "
            "2026-01-01 00:00 i alle fire)."),
        "kode": ["src/data_loader_github.py:323-345", "src/data_loader_github.py:644-647",
                 "src/model.py:177-193", "src/config.py:655-696"],
    },
    {
        "id": "afrr",
        "navn": "aFRR-kapacitet (pris og indkøbt MW)",
        "kilde": "df-data afrr/{electricity.spot_area}_{år}.csv, TimeUTC",
        "bruges": "kun med balancemarked (--with-balancing)",
        "styres_af": ["electricity.spot_area"],
        "opløsning": "1h",
        "min_obs_pr_time": 1,
        "bemaerkning": "Findes kun for DK1 (DK2 har intet aFRR-marked): balancering med spot_area DK2 stopper med FileNotFoundError.",
        "kode": ["src/data_loader_github.py:425-440", "src/data_loader_github.py:699-705"],
    },
    {
        "id": "imbalance",
        "navn": "Ubalancepris og aFRR-aktiveringspriser",
        "kilde": "df-data imbalance/{electricity.spot_area}_{år}.csv, TimeUTC",
        "bruges": "kun med balancemarked",
        "styres_af": ["electricity.spot_area"],
        "opløsning": "15 min (midles til time; alle fire kvarterer kræves)",
        "min_obs_pr_time": 4,
        "kode": ["src/data_loader_github.py:442-471", "src/data_loader_github.py:76-83"],
    },
    {
        "id": "mfrr_cap",
        "navn": "mFRR-kapacitet",
        "kilde": "df-data mfrr_cap/{electricity.spot_area}_{år}.csv, TimeUTC",
        "bruges": "kun med balancemarked",
        "styres_af": ["electricity.spot_area"],
        "opløsning": "1h",
        "min_obs_pr_time": 1,
        "kode": ["src/data_loader_github.py:473-483"],
    },
    {
        "id": "mfrr_act",
        "navn": "mFRR-aktiveret volumen",
        "kilde": "df-data mfrr_act/{electricity.spot_area}_{år}.csv, TimeUTC",
        "bruges": "kun med balancemarked",
        "styres_af": ["electricity.spot_area"],
        "opløsning": "15 min (midles til time; alle fire kvarterer kræves)",
        "min_obs_pr_time": 4,
        "kode": ["src/data_loader_github.py:485-497"],
    },
    {
        "id": "varmelast_syntetisk",
        "navn": "Syntetisk varmelast",
        "kilde": "værkets heat_load_params (grundprofil, rumvarme, nettab) + DMI-temperaturen",
        "bruges": "når ingen målt varmelast er valgt",
        "styres_af": ["heat_load_params.*", "data.dmi_area"],
        "bemaerkning": (
            "heat_load_params kræves ALTID - også med målt varmelast, hvor den indlæses og ignoreres "
            "(run_case.py:377). Grundprofilens 24 timer er UTC-timer (src/data_loader.py:726-730)."),
        "kode": ["src/data_loader.py:702-778", "src/data_loader_github.py:661"],
    },
    {
        "id": "varmelast_maalt",
        "navn": "Målt varmelast ab værk",
        "kilde": "en Tidsserie med rolle varmelast (eller en hvidlistet fil i modelrepoets data/)",
        "bruges": "når scenariet vælger den; erstatter syntesen helt",
        "styres_af": ["_koersel.tidsserie.varmelast", "_koersel.heat_csv"],
        "bemaerkning": (
            "Læses af apply_heat_csv_override: tidsstempel reindekseres EKSAKT til modellens akse, "
            "huller på højst 5 % af kørslens timer interpoleres lineært, over 5 % stopper kørslen; "
            "negative værdier stopper kørslen; dubletter: første værdi vinder uden besked "
            "(src/data_loader.py:911-939). Nettabet er indeholdt i målingen ab værk; "
            "nettabsmodellen bruges ikke."),
        "kode": ["src/data_loader.py:835-961", "src/data_loader_github.py:710-713", "run_case.py:183-194"],
    },
    {
        "id": "solprofil",
        "navn": "Solvarmeprofil",
        "kilde": "units.<sol>.production_profile_path: en Tidsserie med rolle solprofil eller en fil i modelrepoets data/",
        "bruges": "for hver aktiv enhed med production_profile_path",
        "styres_af": ["units.*.production_profile_path", "_koersel.tidsserie.solprofil"],
        "bemaerkning": (
            "Loftet er min(profil(t), p_max_heat) hver time (src/model.py:155-172). Profilen skal "
            "dække HVER time i kørslen - én manglende time stopper kørslen; den nulfyldes og "
            "interpoleres ikke (src/data_loader.py:997-1010). En relativ sti opløses mod "
            "kørslens arbejdsmappe (src/data_loader.py:985-987)."),
        "kode": ["src/data_loader.py:968-1014", "src/model.py:155-172"],
    },
    {
        "id": "vaerksparametre",
        "navn": "Værkets parametre",
        "kilde": "VaerkParameter ved den frosne revision (enheder, lagre, priser, el og tarif, balancering, tid, solver)",
        "bruges": "altid",
        "bemaerkning": "Brændsels- og CO2-priser, elafgift og tarif er faste tal pr. værk - ingen tidsserier.",
        "kode": ["src/config.py:655-696"],
    },
]

DATASAET_PR_INDSTILLING = {
    "altid": ["spot/{data.price_zone}", "dmi/{data.dmi_area}", "værkets parametre"],
    "med_balancering": ["afrr/{electricity.spot_area}", "imbalance/{electricity.spot_area}",
                        "mfrr_cap/{electricity.spot_area}", "mfrr_act/{electricity.spot_area}"],
    "varmelast": {
        "syntetisk": "heat_load_params.* + dmi/{data.dmi_area}",
        "tidsserie": "Tidsserie (rolle varmelast): navn + sha256",
        "repo_fil": "_koersel.heat_csv: fil i modelrepoets data/ (hvidliste)",
    },
    "solprofil": {
        "tidsserie": "Tidsserie (rolle solprofil): navn + sha256",
        "repo_fil": "units.<sol>.production_profile_path i modelrepoets data/",
        "ingen": "værket har ingen aktiv solar_thermal-enhed",
    },
    "bemaerkning": (
        "data.price_zone styrer spotprisen, electricity.spot_area balancepriserne; modellen tjekker "
        "ikke, at de er ens (src/data_loader_github.py:699-705). Vis begge, når de afviger. "
        "data.eur_dkk bruges ikke på df-data-vejen (spot læses i DKK)."),
}

MAALT_DAEKNING = {
    "df_data_commit": DF_DATA,
    "df_data_dato": "2026-10-12",
    "maalt": "2026-10-16 med modellens egen regel (min. observationer pr. time pr. datasæt)",
    "datasaet": {
        "spot/DK1": {"fra_utc": "2022-12-31T23:00:00Z", "til_utc": "2026-10-11T23:00:00Z", "huller": []},
        "spot/DK2": {"fra_utc": "2022-12-31T23:00:00Z", "til_utc": "2026-10-11T23:00:00Z", "huller": []},
        "dmi/fyn": {"fra_utc": "2022-12-31T23:00:00Z", "til_utc": "2026-10-11T23:00:00Z", "huller": [], "tomme_temperaturer": 4},
        "dmi/karup": {"fra_utc": "2022-12-31T23:00:00Z", "til_utc": "2026-10-11T23:00:00Z", "huller": [], "tomme_temperaturer": 14},
        "dmi/ringsted": {"fra_utc": "2022-12-31T00:00:00Z", "til_utc": "2026-10-11T23:00:00Z", "huller": [], "tomme_temperaturer": 1},
        "dmi/vestkyst": {"fra_utc": "2022-12-31T23:00:00Z", "til_utc": "2026-10-11T23:00:00Z", "huller": [], "tomme_temperaturer": 9},
        "afrr/DK1": {"fra_utc": "2024-10-01T22:00:00Z", "til_utc": "2026-10-11T23:00:00Z", "huller": []},
        "mfrr_cap/DK1": {"fra_utc": "2023-06-20T22:00:00Z", "til_utc": "2026-10-11T23:00:00Z",
                         "huller": [["2023-06-22T22:00:00Z", "2023-06-23T21:00:00Z", 24]]},
        "mfrr_cap/DK2": {"fra_utc": "2023-06-20T22:00:00Z", "til_utc": "2026-10-11T23:00:00Z",
                         "huller": [["2023-06-22T22:00:00Z", "2023-06-23T21:00:00Z", 24]]},
        "imbalance/DK1": {"fra_utc": "2025-03-04T12:00:00Z", "til_utc": "2026-10-11T23:00:00Z", "huller": []},
        "imbalance/DK2": {"fra_utc": "2025-03-04T12:00:00Z", "til_utc": "2026-10-11T23:00:00Z", "huller": []},
        "mfrr_act/DK1": {"fra_utc": "2025-03-03T23:00:00Z", "til_utc": "2026-10-11T23:00:00Z", "huller": []},
        "mfrr_act/DK2": {"fra_utc": "2025-03-03T23:00:00Z", "til_utc": "2026-10-11T23:00:00Z", "huller": []},
    },
    "afledt": {
        "tidligste_start_med_balancering_utc": "2025-03-04T12:00:00Z",
        "tidligste_hele_danske_doegn_med_balancering": "2025-03-05",
        "seneste_slut_utc": "2026-10-11T23:00:00Z",
        "bemaerkning": (
            "Slutdatoen flytter sig hver mandag, når df-data opdateres. Hullerne i fyn/vestkyst "
            "(28. februar 2026) og i aFRR fra 4. september 2026, som casens kommentarer nævner "
            "(cases/andeby.yaml:89), findes IKKE ved 392992c - de er fyldt siden. Huller afhænger "
            "altid af kørslens frosne data_commit; arbejderens dækningsvagt har det sidste ord."),
    },
    "repo_filer": {
        "data/billund_abvaerk_hourly.csv": {"rolle": "varmelast", "fra_utc": "2025-02-28T12:00:00Z", "til_utc": "2026-06-24T06:00:00Z",
                                            "timer": 11539, "huller": 0, "max_mw": 41.98, "sum_mwh": 165695.1,
                                            "bruges_af": ["billund_sporA (README-anker, til 23. juni)"]},
        "data/billund_abvaerk_hourly_splejset_jun2026.csv": {"rolle": "varmelast", "fra_utc": "2025-02-28T12:00:00Z", "til_utc": "2026-06-30T23:00:00Z",
                                                             "timer": 11700, "huller": 0, "max_mw": 41.98, "sum_mwh": 166669.9,
                                                             "bemaerkning": "161 timer (24.-30. juni 2026) er DMI-syntese, kolonnen kilde = dmi_syntese",
                                                             "bruges_af": ["billund_sporB", "billund_sporA_rullende", "billund_sporB_rullende"]},
        "data/solar_andeby_dmi_karup.csv": {"rolle": "solprofil", "fra_utc": "2025-01-01T00:00:00Z", "til_utc": "2026-10-03T23:00:00Z",
                                            "timer": 15384, "huller": 0, "max_mw": 19.11, "sum_mwh_2025": 12743,
                                            "bruges_af": ["andeby (units.solvarme)"],
                                            "bemaerkning": "Andeby kan ikke køres efter 3. oktober 2026 (cases/andeby.yaml:52-60)."},
        "data/synthetic_solar_andeby.csv": {"rolle": "solprofil", "fra_utc": "2025-01-01T00:00:00Z", "til_utc": "2026-12-31T23:00:00Z",
                                            "timer": 17520, "bruges_af": [],
                                            "bemaerkning": "Bruges ikke af nogen case; erstattet (cases/andeby.yaml:52-60)."},
    },
}

# ---------------------------------------------------------------- tidsserier

INPUTFORMAT = {
    "kodning": "UTF-8 (BOM tilladt). Er filen ikke gyldig UTF-8, læses den som Windows-1252 (info kodning_cp1252).",
    "skilletegn": "Findes på første linje: tabulator, ellers semikolon, ellers komma.",
    "decimal": "Punktum. Ved semikolon eller tabulator som skilletegn også komma (12,5); punktum foran tre cifre er da tusindtal (1.234,5).",
    "overskrift": "Valgfri. Linjer, der begynder med #, og tomme linjer springes over.",
    "tidskolonne_navne": ["timestamp", "time", "datetime", "hour_utc", "hour_dk", "tid", "tidspunkt", "tidsstempel", "dato", "date"],
    "vaerdikolonne_navne": ["heat_mw_abvaerk", "mw", "power_mw", "varme_mw", "varme", "vaerdi", "value"],
    "kolonnevalg": "Tidskolonnen: første kolonne med et kendt navn, hvor mindst 90 % af de første 50 felter er tidsstempler; ellers første sådan kolonne. Værdikolonnen: den angivne; ellers første med et kendt navn; ellers første talkolonne.",
    "tomme_vaerdier": ["", "nan", "na", "n/a", "null", "none", "-", "–"],
    "tidsformater": [
        "ISO 8601: YYYY-MM-DD HH:MM[:SS], også med T, med Z eller ±HH:MM (zonen i filen har forrang)",
        "Dansk: DD-MM-YYYY HH:MM, også med . eller / mellem dag, måned og år (dagen står først)",
        "Kl. 24:00 læses som næste dags 00:00",
    ],
    "tidszoner": {
        "UTC": "Naive stempler er UTC (modellens egen standard, run_case.py:190-194).",
        "Europe/Copenhagen": (
            "Dansk lokaltid med sommertid. Efterårets dobbelttime: første forekomst er sommertid, anden "
            "vintertid; forårets manglende time findes ikke (et stempel i den flyttes frem til 03:00). "
            "Regnes efter EU's regel (sidste søndag i marts/oktober kl. 01 UTC), ikke slået op."),
        "valg": "Brugeren skal vælge aktivt (ingen forvalgt værdi i UI). Har stemplerne selv en zone, bruges den.",
    },
    "tidsstempel": {
        "start": "Stemplet er intervallets start (01:00 = kl. 01-02). Modellens form.",
        "slut": "Stemplet er intervallets slut (01:00 = kl. 00-01). Flyttes ét interval tilbage EFTER omregning til UTC, så efterårets dobbelttime ikke bliver to ens timer (scripts/vaerksark_til_yaml.py:361-367).",
    },
    "oploesning": {
        "tilladte": ["1h", "15min"],
        "bestemmes_af": "den hyppigste afstand mellem på hinanden følgende stempler",
        "15min": "Midles til timer, når alle fire kvarterer findes; en time med 1-3 kvarterer er et hul (samme regel som modellen bruger for 15-min-markedsdata, src/data_loader_github.py:62-83).",
        "gemmes_som": "1h - version 1 regner kun i timer, og modellens læser vælger ellers kun hh:00-kvarteret uden at midle (src/data_loader.py:923-925).",
    },
    "enheder": {
        "MW": {"faktor_til_mw": 1.0, "visning": "MW (middeleffekt i intervallet)"},
        "kW": {"faktor_til_mw": 0.001, "visning": "kW"},
        "MWh": {"faktor_til_mw": 1.0, "pr_interval": True, "visning": "MWh pr. interval"},
        "kWh": {"faktor_til_mw": 0.001, "pr_interval": True, "visning": "kWh pr. interval"},
    },
}

NORMALISERET_FIL = {
    "sti": "Files/fjv/tidsserier/<vaerk_kode>/<sha256>.csv",
    "form": "time,mw",
    "regler": [
        "UTF-8 uden BOM, \\n-linjeskift, sidste linje afsluttet med \\n, overskriften præcis 'time,mw'",
        "time = intervallets START i UTC som YYYY-MM-DDTHH:MM:SSZ, stigende, ingen dubletter, hele timer",
        "Huller UDELADES (ingen række). Aldrig en tom værdi og aldrig 0 for en manglende time",
        "mw = endeligt tal >= 0 i MW. Er kildens tekst en ren decimal ([0-9]+(.[0-9]+)?), skrives den tegn for tegn; ellers korteste decimalform uden eksponent og uden '.0' (tal_tekst)",
        "sha256 = sha256 over filens bytes; samme hash = samme fil",
        "En solprofil har ingen huller i filen: de udfyldes ved upload (højst 5 %, se sol_huller_udfyldt), ellers afvises den",
    ],
    "laeses_af_modellen_som": {
        "varmelast": "--heat-csv <fil> --heat-csv-column mw (stemplerne har Z, så --heat-csv-tz er uden betydning)",
        "solprofil": "units.<sol>.production_profile_path = <fil> (profil-læseren tager kolonnen time og første værdikolonne)",
    },
    "hvorfor_teksten_bevares": (
        "Modellen læser med pandas' hurtige talparser, som ikke lover samme double for '1.234560' og "
        "'1.23456'. Samme tekst giver bevisligt samme tal i modellen (fv-fabric2, fabric/fjv/tidsserie.py)."),
    "tal_tekst_testvektorer": [
        [0.0, "0"], [5.0, "5"], [19.74, "19.74"], [16.766666666666666, "16.766666666666666"],
        [5e-05, "0.00005"], [1.5e-06, "0.0000015"], [1234567.0, "1234567"], [0.1 + 0.2, "0.30000000000000004"],
        [41.98333333333333, "41.98333333333333"], [-0.0, "0"],
    ],
    "kilde": "fabric/fjv/tidsserie.py (fv-fabric2) - formen er motorens; denne fil er normen for valideringen",
}

GRAENSER = {
    "max_bytes": 8_000_000,
    "max_raekker": 120_000,
    "krav_mindst": "Et helt år i 15 min (35.040 rækker, ca. 1,2 MB) skal kunne uploades (KONTRAKT §6d).",
    "min_timer": 48,
    "kort_serie_doegn": 28,
    "helaar_doegn": 300,
    "urimelig_stor_mw": 5000,
    "langt_hul_timer": 48,
    "model_max_hulandel": 0.05,
    "sol_max_hulandel": 0.05,
    "nul_straek_timer": 24,
    "fastfrosset_timer": 24,
    "spids_vindue_timer": 49,
    "spids_faktor": 3.0,
    "benyttelsestid_varmelast_t": [1500, 6000],
    "benyttelsestid_sol_t": [250, 1200],
    "sol_nat_andel": 0.002,
    "sol_nat_spids_andel": 0.05,
    "sol_tyngdepunkt_utc": [10.2, 11.5],
    "sol_andel_min_pmax": 2.0,
    "validering_json_max_tegn": 4000,
    "maalt_mod_syntetisk_forhold": [0.85, 1.15],
    "maalt_mod_syntetisk_korrelation_min": 0.85,
    "kalibrering": {
        "spids": "Billund (begge filer): største værdi / median af ±24 timer = 2,0; ingen falske fund ved 3,0",
        "fastfrosset": "Billund: længste stræk af ens værdier = 3 timer",
        "benyttelsestid_varmelast": "Billund 2.996 / 2.972 timer; Andeby (syntese, 105,52 GWh, 40,02 MW) 2.637 timer",
        "benyttelsestid_sol": "Andeby DMI-profil 579 timer (2025) mod 22 MW; syntetisk profil 545 timer",
        "sol_tyngdepunkt": "Produktionsvægtet starttime (UTC): Andeby DMI-profil 10,95; flyttet +1 time 11,95; den syntetiske profil 11,99 (se fund i data_krav.md). Fysik: solens middag i Danmark 11,0-11,5 UTC = starttime 10,5-11,0",
        "sol_nat": "Andeby DMI-profil 0 MWh om natten; syntetisk profil 43,6 MWh = 0,18 % og nattens største time 0,54 MW = 6,5 % af spidsen",
        "maalt_mod_syntetisk": "Billund målt mod Billund-casenes egen syntese, 1. juli 2025 - 30. juni 2026: forhold 0,99-1,03, døgnkorrelation 0,97-0,98",
    },
}

# niveau: fejl = afvist / kørslen bestilles ikke; advarsel = gyldig, men se efter; info = kun til orientering.
# hvornaar: upload | bestilling.   roller: hvilke roller reglen gælder.
R = []


def regel(kode, niveau, hvornaar, roller, hvad, besked, hvorfor, kilde=None, kraever_vaerk=False):
    R.append({"kode": kode, "niveau": niveau, "hvornaar": hvornaar, "roller": roller,
              "hvad": hvad, "besked": besked, "hvorfor": hvorfor,
              "kilde": kilde or [], "kraever_vaerk": kraever_vaerk})


B, V, S = ["varmelast", "solprofil"], ["varmelast"], ["solprofil"]

# --- valg og fil
regel("rolle_ukendt", "fejl", "upload", B, "rollen er ikke varmelast eller solprofil",
      "Rollen '{rolle}' kendes ikke. Vælg varmelast eller solprofil.", "To roller i version 1 (KONTRAKT §6d).")
regel("tidszone_ukendt", "fejl", "upload", B, "tidszonen er ikke UTC eller Europe/Copenhagen",
      "Tidszonen '{tidszone}' kendes ikke. Vælg UTC eller dansk lokaltid.",
      "En forkert tidszone flytter hele serien en eller to timer i forhold til elprisen uden at se forkert ud (doc/EGET_VAERK.md:20-22).")
regel("tidsstempel_ukendt", "fejl", "upload", B, "tidsstempel er ikke start eller slut",
      "Angiv om tidsstemplet er timens start eller timens slut.", "Gættes ikke.")
regel("enhed_ukendt", "fejl", "upload", B, "enheden er ikke MW, kW, MWh eller kWh (pr. interval)",
      "Enheden '{enhed}' kendes ikke. Vælg MW, kW, MWh pr. interval eller kWh pr. interval.",
      "Modellen regner i MW; en forkert enhed giver en faktor 1000 forkert businesscase.")
regel("for_stor", "fejl", "upload", B, "filen har flere bytes eller rækker end grænsen",
      "Filen er for stor ({hvad}; grænsen er {graense}). Del den op, eller send timeværdier i stedet for kvarterværdier.",
      "Function-kaldets størrelse og lagerets grænse.")
regel("kodning_cp1252", "info", "upload", B, "filen er ikke UTF-8 og læses som Windows-1252",
      "Filen er ikke UTF-8; den er læst som Windows-1252 (typisk for Excel-eksport).", "Tal og tidsstempler er ASCII; kun overskrifter berøres.")
regel("tom", "fejl", "upload", B, "ingen datarækker", "Filen har ingen datarækker.", "")
regel("excel_serietal", "fejl", "upload", B, "tidskolonnen er Excel-serietal (fx 45839,5) i stedet for datoer",
      "Tidskolonnen indeholder tal som 45839,5 (Excels interne datoer). Formatér kolonnen som dato og tid i Excel, og gem igen.",
      "Et serietal kan ikke tolkes uden at kende arkets datosystem.")
regel("ingen_tid", "fejl", "upload", B, "ingen kolonne med tidsstempler",
      "Filen har ingen kolonne med tidsstempler (fx timestamp eller tidsstempel i formen 2025-07-01 00:00).", "")
regel("kolonne_findes_ikke", "fejl", "upload", B, "den valgte værdikolonne findes ikke",
      "Kolonnen '{kolonne}' findes ikke. Filen har: {kolonner}.", "")
regel("ingen_vaerdi", "fejl", "upload", B, "ingen kolonne med tal ved siden af tidsstemplet",
      "Filen har ingen kolonne med tal ved siden af tidsstemplet.", "")
regel("flere_kolonner", "info", "upload", B, "flere talkolonner; den foretrukne bruges",
      "Filen har {antal} talkolonner; '{kolonne}' bruges. Vælg en anden, hvis det er forkert.", "")
regel("hour_dk_som_utc", "advarsel", "upload", B, "tidskolonnen hedder hour_dk, men tidszonen er UTC",
      "Tidskolonnen hedder hour_dk (dansk tid), men tidszonen er sat til UTC. Er stemplerne dansk tid, så vælg dansk lokaltid.",
      "Modellen finder også en hour_dk-kolonne, men læser den som UTC, medmindre --heat-csv-tz sættes (src/data_loader.py:878-909).",
      ["src/data_loader.py:878-909"])

# --- tid og tal
regel("ugyldig_tid", "fejl", "upload", B, "et tidsstempel kan ikke læses",
      "{antal} rækker har et tidsstempel, der ikke kan læses (linje {linjer}).", "Ingen rækker smides tavst væk.")
regel("amerikansk_dato", "fejl", "upload", B, "datoer med / har et andet felt over 12 (måned/dag/år)",
      "{antal} datoer ligner amerikansk form måned/dag/år (linje {linjer}). Skriv dem som dag-måned-år eller ÅÅÅÅ-MM-DD.",
      "Med / læses dagen først; et andet felt over 12 viser, at filen er skrevet omvendt - og så er de øvrige datoer også byttet om.")
regel("ugyldigt_tal", "fejl", "upload", B, "en værdi er tekst og ikke et tal",
      "{antal} rækker har en værdi, der ikke er et tal (linje {linjer}). Lad cellen stå tom for en manglende time, eller skriv tallet.",
      "Tekst i talkolonnen må ikke blive til et tavst hul (scripts/vaerksark_til_yaml.py:294-306).", ["scripts/vaerksark_til_yaml.py:294-306"])
regel("ikke_endelig", "fejl", "upload", B, "en værdi er uendelig",
      "{antal} værdier er uendelige (linje {linjer}).", "")
regel("blandet_zone", "fejl", "upload", B, "nogle stempler har tidszone, andre ikke",
      "Nogle tidsstempler har en tidszone, og andre ikke. Brug samme form i hele filen.", "")
regel("zone_i_fil", "info", "upload", B, "stemplerne har selv en zone; valget af tidszone bruges ikke",
      "Tidsstemplerne har selv en tidszone; dit valg af tidszone bruges ikke.", "")
regel("dst_time_findes_ikke", "advarsel", "upload", B, "dansk tid: et stempel ligger i forårets manglende time",
      "{antal} tidsstempler ligger i en time, der ikke findes ved skift til sommertid (linje {linjer}). De er flyttet frem til kl. 03.",
      "Som modellens --heat-csv-tz (nonexistent='shift_forward', src/data_loader.py:904-909). Støder de sammen med kl. 03, afvises filen som dublet.",
      ["src/data_loader.py:904-909"])
regel("alle_tomme", "fejl", "upload", B, "alle værdier er tomme", "Filen har tidsstempler, men ingen værdier.", "")
regel("oploesning", "fejl", "upload", B, "opløsningen er hverken 1 time eller 15 minutter",
      "Opløsningen er {minutter} minutter. Kun timeværdier og kvarterværdier understøttes.",
      "Modellen kender kun 1h og 15min (src/data_loader.py:59-63); version 1 regner i timer.", ["src/data_loader.py:59-63"])
regel("timeslut_mistanke", "advarsel", "upload", B,
      "valgt 'timens start', men serien begynder kl. 01 den 1. og slutter kl. 00 den 1.",
      "Serien begynder kl. 01:00 og slutter kl. 00:00 den første i en måned - stemplerne ligner timens SLUT. Vælg 'timens slut', hvis det er tilfældet.",
      "Samme mønster, som værksark-konverteringen bruger (scripts/vaerksark_til_yaml.py:394-401).", ["scripts/vaerksark_til_yaml.py:394-401"])
regel("timestart_mistanke", "advarsel", "upload", B,
      "valgt 'timens slut', men serien begynder kl. 00 den 1. og slutter kl. 23 den sidste",
      "Serien begynder kl. 00:00 den første og slutter kl. 23 den sidste i en måned - stemplerne ligner timens START.",
      "Spejlet af timeslut_mistanke (scripts/vaerksark_til_yaml.py:402-405).", ["scripts/vaerksark_til_yaml.py:402-405"])
regel("ligner_dansk_tid", "advarsel", "upload", B,
      "valgt UTC, men efterårets kl. 02 står to gange eller forårets kl. 02 mangler",
      "Stemplerne ligner dansk lokaltid: {hvor}. Vælg dansk lokaltid, hvis filen er et SRO-udtræk i dansk tid.",
      "I UTC findes ingen dobbelttimer (scripts/vaerksark_til_yaml.py:314-322).", ["scripts/vaerksark_til_yaml.py:314-322"])
regel("dst_dobbelttime_en_gang", "advarsel", "upload", B, "dansk tid: efterårets kl. 02 står kun én gang",
      "Efterårets dobbelttime ({dato} kl. 02) står kun én gang. Den er læst som sommertid; én time i året kan ligge forkert.",
      "Et år skåret til 8.760 timer mangler dobbelttimen (scripts/vaerksark_til_yaml.py:350-357).", ["scripts/vaerksark_til_yaml.py:350-357"])
regel("skaev_tid", "fejl", "upload", B, "et stempel ligger ikke på et helt interval",
      "{antal} tidsstempler ligger ikke på et helt {enhed} (linje {linjer}).",
      "Modellen reindekserer på EKSAKT tidsstempel; et skævt stempel bliver et tavst hul (src/data_loader.py:923-925).", ["src/data_loader.py:923-925"])
regel("dubletter", "fejl", "upload", B, "samme interval står mere end én gang (efter omregning til UTC)",
      "{antal} tidsstempler står mere end én gang (linje {linjer}). Ret udtrækket - vi vælger ikke selv, hvilken værdi der gælder.",
      "Modellen beholder tavst den første (src/data_loader.py:911-913). To værdier for samme time er en fejl i udtrækket. Efterårets dobbelttime i dansk tid er ikke en dublet.",
      ["src/data_loader.py:911-913"])
regel("kvarter_aggregeret", "info", "upload", B, "kvarterværdier er midlet til timer",
      "Kvarterværdierne er midlet til timeværdier (version 1 regner i timer). Originalen gemmes ikke.",
      "Modellens læser ville ellers kun bruge kvarteret kl. hh:00 (src/data_loader.py:923-925).")
regel("delvise_timer", "advarsel", "upload", B, "15 min: timer med færre end fire kvarterer",
      "{antal} timer har færre end fire kvarterværdier og er regnet som huller.",
      "Et gennemsnit af et ufuldstændigt grundlag ses ikke bagefter (src/data_loader_github.py:72-75).", ["src/data_loader_github.py:72-75"])
regel("enhed_omregnet", "info", "upload", B, "værdierne er omregnet til MW",
      "Værdierne er omregnet fra {enhed} til MW.", "")

# --- værdier
regel("negativ", "fejl", "upload", B, "en værdi er negativ",
      "{antal} værdier er negative (første {foerste}: {vaerdi}). Varmeproduktion kan ikke være under nul; frostsikring i solfeltet er ikke produktion - skriv 0 eller lad cellen stå tom.",
      "Modellen stopper på negativ varmelast (src/data_loader.py:915-921); en negativ solprofil giver et negativt loft.", ["src/data_loader.py:915-921"])
regel("alle_nul", "fejl", "upload", B, "alle værdier er 0", "Alle værdier er 0.",
      "Et værk uden varmebehov eller en solprofil uden sol er ikke en måling.")
regel("urimelig_stor", "fejl", "upload", B, "største værdi over 5.000 MW",
      "Største værdi er {maks} MW (grænsen er {graense} MW). Står tallene i kW eller kWh? Vælg den rigtige enhed.",
      "Ligner næsten altid kW skrevet som MW.")
regel("for_kort", "fejl", "upload", B, "under 48 timer med værdi",
      "Serien har kun {antal} timer med værdi; der skal mindst {graense} til (en prøvekørsel er 2 døgn).",
      "Det korteste, appen bestiller, er 2 døgn (viden/nyt_vaerk_skabelon.json).")
regel("kort_serie", "advarsel", "upload", B, "serien spænder under 28 døgn",
      "Serien dækker kun {doegn} døgn. Den kan bruges til kørsler inden for de døgn, men ikke til et årstal.",
      "Værksarket kræver fire uger (scripts/vaerksark_til_yaml.py:309).", ["scripts/vaerksark_til_yaml.py:309"])
regel("huller", "advarsel", "upload", V, "timer mangler mellem første og sidste time",
      "{antal} timer mangler ({andel}), længste hul {laengste} timer. En kørsel stopper, hvis mere end 5 % af dens timer mangler; under det udfylder modellen hullerne med en ret linje.",
      "Modellen interpolerer lineært op til 5 % af kørslens timer og stopper derover (src/data_loader.py:926-939).", ["src/data_loader.py:926-939"])
regel("langt_hul", "advarsel", "upload", V, "længste hul over 48 timer",
      "Et hul på {laengste} timer bliver en ret linje hen over vejrskift, hvis en kørsel rammer det. Vælg en periode uden om hullet, eller brug syntetisk varmelast for den.",
      "scripts/vaerksark_til_yaml.py:479-481", ["scripts/vaerksark_til_yaml.py:479-481"])
regel("sol_huller", "fejl", "upload", S, "solprofil: over 5 % af timerne mangler",
      "Solprofilen mangler {antal} timer ({andel}). Over 5 % udfyldes ikke, og en kørsel kan ikke bruge en profil med huller.",
      "Profil-læseren stopper på en eneste manglende time (src/data_loader.py:997-1010); værksarket udfylder højst 5 % (scripts/vaerksark_til_yaml.py:1043-1049).",
      ["src/data_loader.py:997-1010", "scripts/vaerksark_til_yaml.py:1043-1049"])
regel("sol_huller_udfyldt", "advarsel", "upload", S, "solprofil: huller på højst 5 % er udfyldt",
      "{antal} manglende timer i solprofilen er udfyldt (længste hul {laengste} timer): 0, når solen er nede, ellers en ret linje.",
      "Samme som værksarket (scripts/vaerksark_til_yaml.py:1043-1049); den normaliserede solprofil har derfor ingen huller.", ["scripts/vaerksark_til_yaml.py:1043-1049"])
regel("nul_straek", "advarsel", "upload", V, "24 timer eller flere i træk med 0",
      "{timer} timer i træk med 0 fra {fra}. Et fjernvarmeværk har altid nettab - er det en udfaldsperiode, så lad cellerne stå tomme i stedet.",
      "Nul er en gyldig måling og bliver ikke interpoleret (doc/EGET_VAERK.md:26-27).", ["doc/EGET_VAERK.md:26-27"])
regel("fastfrosset", "advarsel", "upload", V, "24 timer eller flere i træk med præcis samme værdi",
      "{timer} timer i træk med præcis {vaerdi} MW fra {fra}. Det ligner en måler, der har stået stille.",
      "Billund har højst 3 ens timer i træk (målt).")
regel("spids", "advarsel", "upload", V, "en time over 3 gange medianen af ±24 timer",
      "{antal} timer ligger over {faktor} gange niveauet omkring dem (første {foerste}: {vaerdi} MW). Tjek for enkeltspidser i udtrækket.",
      "Billund: højst 2,0 gange (målt).")
regel("benyttelsestid", "advarsel", "upload", V, "helår: gennemsnit/maks x 8.760 uden for 1.500-6.000 timer",
      "Benyttelsestiden er {timer} timer (gennemsnit / største time x 8.760); normalt {lo}-{hi}. Tjek for enkeltspidser, forkert enhed eller en serie, der kun dækker en del af værket.",
      "Billund 2.996, Andeby 2.637 timer (målt).")
regel("sol_nat", "advarsel", "upload", S, "solprofil: produktion, mens solen er mere end 6 grader under horisonten",
      "Solprofilen har produktion om natten: {timer} timer, i alt {mwh} MWh. Er det frostsikring eller en måler, der tæller begge veje, er det ikke produktion - eller er tidszonen forkert?",
      "Samme regel som værksarket: nat over 0,2 % af årets sol eller over 5 % af spidsen (scripts/vaerksark_til_yaml.py:1063-1071; solen: 922-932).",
      ["scripts/vaerksark_til_yaml.py:1063-1071", "scripts/vaerksark_til_yaml.py:922-932"])
regel("sol_tidsforskudt", "advarsel", "upload", S, "solprofil: produktionens tyngdepunkt uden for 10,2-11,5 UTC",
      "Solprofilens tyngdepunkt ligger kl. {tyngde} UTC (timens start); for Danmark ventes {lo}-{hi}. Serien er sandsynligvis forskudt en time - tjek tidszone og timens start/slut.",
      "Solens middag i Danmark er 11,0-11,5 UTC. Målt: Andebys DMI-profil 10,95; flyttet en time 11,95.")

# --- værk
regel("over_kapacitet", "advarsel", "upload", V, "en time over værkets samlede varmekapacitet",
      "{antal} timer ligger over værkets samlede kapacitet {kap} MW (aktive enheders maks varme + lagrenes afladeeffekt), første {foerste}: {vaerdi} MW. En kørsel, der rammer de timer, kan ikke løses.",
      "Modellen har intet slæk i varmebalancen; over kapaciteten er timen uløselig (src/model.py:155-200).",
      ["src/model.py:155-200"], kraever_vaerk=True)
regel("sol_ingen_enhed", "advarsel", "upload", S, "værket har ingen aktiv solvarmeenhed",
      "Værket har ingen aktiv solvarmeenhed (solar_thermal); profilen bruges ikke, før en sådan findes.", "", kraever_vaerk=True)
regel("sol_flere_enheder", "advarsel", "upload", S, "værket har flere aktive solvarmeenheder",
      "Værket har flere aktive solvarmeenheder ({navne}). En solprofil kan kun bruges, når der er præcis én.",
      "Samme krav som værksarket (scripts/vaerksark_til_yaml.py:1556-1562).", ["scripts/vaerksark_til_yaml.py:1556-1562"], kraever_vaerk=True)
regel("sol_over_pmax", "advarsel", "upload", S, "solprofilens største værdi over enhedens maks varme",
      "Solprofilen når {maks} MW, men {navn} har maks varme {pmax} MW. Modellen klipper profilen ved {pmax} MW.",
      "Loftet er min(profil, p_max_heat) (src/model.py:170-172).", ["src/model.py:170-172"], kraever_vaerk=True)
regel("sol_andel", "advarsel", "upload", S, "solprofilen ligger mellem 0 og 1, mens enheden er på flere MW",
      "Solprofilen går højst til 1, men enheden er på {pmax} MW. Det ligner en andel (0-1) og ikke MW; profilen skal være varmeeffekt i MW.",
      "Profilen er et loft i MW, ikke en kapacitetsfaktor (src/config.py:507-510).", ["src/config.py:507-510"], kraever_vaerk=True)
regel("sol_benyttelsestid", "advarsel", "upload", S, "helår: årsproduktion / maks varme uden for 250-1.200 timer",
      "Solprofilen svarer til {timer} fuldlasttimer om året mod {pmax} MW; normalt {lo}-{hi}. Står profilen i en anden enhed, eller er maks varme forkert?",
      "Andeby 579 timer (målt).", kraever_vaerk=True)

# --- ved bestilling (startBestilling og arbejderen; effektiv konfiguration)
regel("koersel_tidsserie_ikke_gyldig", "fejl", "bestilling", B, "den valgte tidsserie er ikke gyldig",
      "Den valgte tidsserie har status '{status}' og kan ikke bruges.", "")
regel("koersel_varmelast_daekning", "fejl", "bestilling", V, "over 5 % af kørslens timer mangler i varmelasten",
      "Varmelasten mangler {mangler} af kørslens {vindue} timer ({andel}). Modellen stopper over 5 %. Serien dækker {serie}.",
      "src/data_loader.py:926-935", ["src/data_loader.py:926-935"])
regel("koersel_varmelast_huller", "advarsel", "bestilling", V, "1-5 % af kørslens timer mangler i varmelasten",
      "{mangler} af kørslens {vindue} timer mangler i varmelasten; modellen udfylder dem med en ret linje.",
      "src/data_loader.py:936-939", ["src/data_loader.py:936-939"])
regel("koersel_sol_daekning", "fejl", "bestilling", S, "solprofilen dækker ikke hver time i kørslen",
      "Solprofilen mangler {mangler} af kørslens {vindue} timer. Den skal dække hver time; serien dækker {serie}.",
      "src/data_loader.py:997-1010", ["src/data_loader.py:997-1010"])
regel("koersel_huller_afkortet", "info", "bestilling", B, "hullisten i validering_json er afkortet",
      "Tidsseriens hulliste er afkortet; dækningen kontrolleres endeligt i regnemotoren.", "4000-tegnsgrænsen (KONTRAKT §3.0).")
regel("koersel_over_kapacitet", "fejl", "bestilling", V, "en time i kørslen over værkets effektive kapacitet",
      "{antal} timer i kørslen ligger over værkets kapacitet {kap} MW (første {foerste}: {vaerdi} MW). Kørslen kan ikke løses - tilføj kapacitet, eller vælg en anden periode.",
      "Nødvendig betingelse for at varmebalancen kan opfyldes (src/model.py:155-200).", ["src/model.py:155-200"], kraever_vaerk=True)
regel("koersel_sol_flere_enheder", "fejl", "bestilling", S, "flere aktive solvarmeenheder uden markør",
      "Solprofilen kan ikke placeres: værket har flere aktive solvarmeenheder, og ingen er markeret til tidsserien.",
      "Tvetydigt; arbejderen afviser det også (fabric/fjv/byg_case.py).", kraever_vaerk=True)
regel("koersel_df_data", "advarsel", "bestilling", B, "perioden ligger uden for den målte df-data-dækning",
      "Perioden ligger uden for markeds- eller vejrdata ({datasaet} dækker {fra} - {til}). Kørslen stopper sandsynligvis med en dækningsfejl.",
      "Arbejderens dækningsvagt har det sidste ord; tallene her er målt ved en bestemt df-data-version (src/data_loader.py:83-197).",
      ["src/data_loader.py:83-197"])
regel("maalt_mod_syntetisk", "advarsel", "visning", V, "målt/syntetisk energi uden for 0,85-1,15 eller døgnkorrelation under 0,85",
      "Den målte varmelast er {forhold} gange værkets syntetiske (døgnkorrelation {korrelation}). Måler serien an forbruger (uden nettab), dækker den hele værket, og passer heat_load_params og DMI-området?",
      "Billund: 0,99-1,03 og 0,97-0,98 (målt). Kræver DMI-temperatur, så den regnes, hvor den findes (fanen Tidsserier eller motoren).")

VALIDERING_JSON = {
    "beskrivelse": "Tidsserie.validering_json - kompakt JSON, højst 4000 tegn. Afkortning: hullisten først (huller_fuld=false), så info-fund, så beskeder til 160 tegn; ellers fejl højlydt.",
    "felter": {
        "version": "data_krav-versionen, valideringen er lavet efter",
        "rolle": "varmelast | solprofil",
        "tidszone, tidsstempel, enhed_kilde": "brugerens valg",
        "enhed": "altid MW (den normaliserede fil)",
        "tidskolonne, vaerdikolonne, kilde_raekker": "hvad der blev læst",
        "kilde_oploesning": "1h | 15min (filen er altid 1h)",
        "start, slut": "første og sidste interval (start, UTC, ISO med Z) - også på Tidsserie.start/slut",
        "oploesning": "1h",
        "antal_raekker": "rækker i den normaliserede fil",
        "forventet_raekker": "timer fra start til slut, begge med",
        "antal_huller": "manglende timer (solprofil: 0 efter udfyldning)",
        "udfyldte_timer": "solprofil: udfyldte timer",
        "laengste_hul_timer": "længste hul før udfyldning",
        "daekning": "1 - antal_huller / forventet_raekker",
        "min, max, max_tid, middel": "MW",
        "sum_mwh": "MWh i alt (1h-intervaller)",
        "aarssum_gwh": "middel x 8760 / 1000 (årsækvivalent)",
        "benyttelsestid_t": "middel / max x 8760",
        "sol_tyngdepunkt_time_utc": "solprofil: produktionsvægtet starttime",
        "huller": "varmelast: [[fra, til, antal], ...] (UTC, første og sidste manglende time); grundlaget for dækningstjekket ved bestilling",
        "huller_fuld": "false, hvis hullisten er afkortet",
        "fund": "[{niveau, kode, besked}] - koderne i 'regler'",
        "fejl, advarsler": "beskederne som tekstlister (bagudkompatibelt med fabric/fjv/tidsserie.py)",
    },
}

MAALT_MOD_SYNTETISK = {
    "formaal": "Fanen Tidsserier: viser den målte varmelast ved siden af den, værkets heat_load_params ville give.",
    "syntese": "Q(t) = grundprofil(UTC-time) + gaf x max(0, t_ref - EMA_span(T_ude)) x weekend + nettab_slope x max(0, t_net - T_ude); EMA er pandas ewm(span=thermal_inertia_hours, adjust=False); weekend = 1 - weekly_dip lørdag-søndag (UTC). Ingen af de 7 repo-værker har en nettab:-blok.",
    "temperatur": "df-data dmi/<dmi_area> kolonne temp_mean_past1h, interpoleret i tid til modellens akse og ffill/bfill i enderne (src/data_loader_github.py:655-658).",
    "sammenlign": "energiforhold (målt/syntetisk) og korrelation af døgnmiddel over de timer, begge har",
    "kilde": ["src/data_loader.py:702-778"],
}

# ---------------------------------------------------------------- værksark

VAERKSARK = {
    "script": "scripts/vaerksark_til_yaml.py (uændret, modelrepoet @ b49aeb0)",
    "kald": "python scripts/vaerksark_til_yaml.py <ark.xlsx> --cases-dir <ud>/cases --data-dir <ud>/data [--timeslut] [--overskriv]",
    "flag": {
        "--timeslut": "stemplerne i Timedata (og Solvarme) er timens slut; flyttes en time tilbage efter UTC-omregning",
        "--cases-dir / --data-dir": "hvor casefil og CSV'er skrives (standard deltagere/cases og deltagere/data, relativt til cwd)",
        "--overskriv": "erstat filer, der findes; uden flaget stopper scriptet (exit 1) på en eksisterende fil",
        "--tillad-offentlig": "slår læk-vagten fra - bruges IKKE i appen (se laek_vagt)",
    },
    "exitkoder": {"0": "case skrevet", "1": "arket kan ikke bruges (ArkFejl, besked på stderr) eller fil findes", "2": "arket findes ikke"},
    "ark": {
        "Timedata": {
            "B2": "tidszone: 'UTC' eller 'dansk lokaltid' (også utc, z, gmt, dansk tid, lokaltid, europe/copenhagen, cet, cest); alt andet stopper",
            "B3": "årsproduktion ab værk i GWh (0,5 < x < 5000, ellers stop); valgfri, men eneste grundlag hvis timeserien er tom",
            "A6:B": "tidsstempel og MW fra række 6 (overskrift tidsstempel/varme_mw i række 5); tomme celler = huller, aldrig 0",
            "periode": "fast 1. juli 2025 00:00 - 30. juni 2026 23:00 i arkets tidszone; et stempel uden for perioden stopper",
            "mindst": "672 timer (fire uger), ellers stop - skabelonens 8 eksempelrækker stopper derfor",
        },
        "Anlaeg": {
            "enheder": "blok under overskriften 'navn' (række 4): navn, type, maks varme, min varme, varme virkningsgrad, COP ved 0 °C, elvirkningsgrad, D&V, startomkostning, min driftstid, min stoptid, kan byde (ja/nej), solvarme årsproduktion (GWh); valgfri kolonne N brændsel (halm/træpiller/flis)",
            "typer": ["heat_pump", "electric_boiler", "biomass_boiler", "gas_boiler", "gas_engine_chp", "solar_thermal", "waste_heat"],
            "tanke": "blok under overskriften 'tank': navn, volumen (m3), maks fyldning (MWh), lade- og afladeeffekt (MW); mindst én tank kræves",
            "formler": "skal have en beregnet værdi (gemt i Excel), ellers stop",
        },
        "Varmepumpe": "målepunkter fra række 6: navn (som i Anlaeg), udetemperatur, varme MW, el MW; mindst to pr. pumpe; COP 1,5-6",
        "Priser": "læses på etiketterne i kolonne A: brændsler (naturgas, halm, træpiller, flis, overskudsvarme, CO2), valgfri blok gasafgifter, elafgift, Energinet, netselskabets D&V, indfødningstarif, tarifbånd lav/høj/spids vinter og sommer, nærmeste DMI-område, priszone, værkets navn",
        "Solvarme": "valgfrit ark opbygget som Timedata (B2 tidszone, B3 årsproduktion, overskrift 'tidsstempel'); erstatter den syntetiske solprofil",
    },
    "output": {
        "<cases-dir>/<slug>.yaml": "hele casen: meta, data (dmi_area, price_zone), time (= timeseriens første og sidste time, eller 2025-07-01-2026-06-30), solver (0,001 / 1.000 kr. / 3.600 s), heat_load_params (Andeby skaleret med årsvolumen/100), prices, electricity (tarifprofil), units, storage",
        "<data-dir>/<slug>_abvaerk_hourly.csv": "kun hvis Timedata har værdier: timestamp,heat_mw_abvaerk i UTC, timens start, huller udeladt",
        "<data-dir>/<slug>_<enhed>_profil.csv": "syntetisk solprofil (time,power_mw) for HELE kalenderår fra start- til slutåret",
        "<data-dir>/<slug>_<enhed>_maalt.csv": "målt solprofil fra arket Solvarme, rundet ud til hele døgn, huller udfyldt",
        "slug": "værkets navn (Priser B30) i små bogstaver, æ/ø/å -> ae/oe/aa, andet -> _ (fx 'Andeby Fjernvarme' -> andeby_fjernvarme)",
    },
    "laek_vagt": "Scriptet nægter at læse arket eller skrive, hvis stien ligger i et git-repo og ikke er git-ignoreret (scripts/vaerksark_til_yaml.py:1467-1508). I Fabric: læg arket og output uden for ethvert git-repo (fx Files/fjv/uploads/ og en tmp-mappe) - så gælder vagten ikke, og --tillad-offentlig skal aldrig bruges. Uden git installeret behandles stien som 'uden for repo'.",
    "til_appen": [
        "production_profile_path i casen er den sti, scriptet skrev (absolut, hvis --data-dir er absolut). Importen skal gemme profilen som Tidsserie (rolle solprofil, kilde vaerksark) og sætte stien til markøren 'tidsserie:solprofil' (fv-fabric2).",
        "Timedata-CSV'en bliver Tidsserie (rolle varmelast, kilde vaerksark); casen nævner den kun i kommentaren øverst - --heat-csv er et kørselsflag.",
        "Den syntetiske solprofil dækker kun kalenderårene fra time.start til time.end (her 2025-2026); en kørsel uden for dem stopper.",
        "Den målte varmelast dækker kun 1. juli 2025 - 30. juni 2026; vil man køre andre perioder, skal værket køre med syntetisk varmelast (heat_load_params er skaleret til årsvolumenet, men IKKE kalibreret på værkets data).",
        "Advarsler skrives på stdout, fejl på stderr; Vaerksarkimport.log skal have begge (højst 4000 tegn; afkort midten, ikke fejlen).",
        "Slug'en kan være længere end Vaerk.kode (60 tegn) og kan ramme en reserveret værkskode; afvis med besked, ret ikke tavst.",
    ],
    "maalt_2026_10_16": {
        "skabelon": "doc/vaerksdata_skabelon.xlsx som den er: exit 1 - 'Timedata har kun 8 timer' (eksempelrækkerne). Skabelonen kan ikke importeres uændret.",
        "varianter": [
            {"variant": "Timedata tømt, B3 = 50 GWh", "exit": 0, "filer": ["case", "syntetisk solprofil 17.520 timer (2025-2026)"], "koersel_2_doegn": "5.-6. januar 2026 uden balance, gab 0,0002/100 kr.: optimal, varmebehov 740 MWh, objektiv 160.190 kr."},
            {"variant": "Timedata = Billund målt 1. juli 2025 - 30. juni 2026 (UTC), B3 = 133,5", "exit": 0, "filer": ["case", "varmelast 8.760 timer", "syntetisk solprofil"], "koersel_2_doegn": "samme vindue med --heat-csv: optimal, varmebehov 1.521 MWh, objektiv 650.779 kr."},
            {"variant": "samme, stemplet som timens slut, uden --timeslut", "exit": 1, "besked": "stemplerne er timens SLUT. Kør igen med --timeslut"},
            {"variant": "samme, stemplet som timens slut, med --timeslut", "exit": 0},
            {"variant": "UTC-serien omregnet til dansk tid og erklæret dansk lokaltid", "exit": 1, "besked": "2 stempler uden for perioden (2026-07-01 00:00 og 01:00) - perioden gælder i arkets egen tidszone; rådet nævner fejlagtigt '1900'"},
            {"variant": "dansk tid erklæret som UTC", "exit": 1, "besked": "1 tidsstempel går igen (2025-10-26 02:00) ... eller også er dataene faktisk i dansk tid"},
            {"variant": "B3 i MWh (133.500)", "exit": 1, "besked": "skal stå i GWh"},
            {"variant": "B3 20 % over timeserien", "exit": 0, "besked": "advarsel -17 %; timeserien bruges"},
            {"variant": "hul på 30 døgn (8,2 %)", "exit": 0, "besked": "advarsel; kørsler i hullet stopper i modellen (over 5 %)"},
            {"variant": "hul på 3 døgn (0,8 %)", "exit": 0, "besked": "advarsel om hul over 48 timer"},
        ],
    },
}

DATA_I_KOERSEL = {
    "formaal": "KONTRAKT §6d sidste punkt: hver kørsel viser sit fulde datagrundlag. Alt kommer fra Koersel + KoerselInput (frosset), ikke fra levende tabeller.",
    "linjer": [
        {"etiket": "Markeds- og vejrdata", "vaerdi": "df-data @ {data_commit[:7]}", "kilde": "Koersel.data_commit (fuld SHA; vis 7 tegn, fuld i tooltip)"},
        {"etiket": "Model", "vaerdi": "fjernvarme-businesscase @ {model_commit[:7]}", "kilde": "Koersel.model_commit"},
        {"etiket": "Værk", "vaerdi": "{vaerk.navn}, revision {vaerk_revision}", "kilde": "Koersel.vaerk_revision"},
        {"etiket": "Periode", "vaerdi": "{start} - {slut} (dansk tid), {antal_interval_model} timer", "kilde": "_koersel.start/_koersel.slut, Koersel.antal_interval_model"},
        {"etiket": "Spotpris", "vaerdi": "spot {data.price_zone}", "altid": True, "fodnote": "Efter 1. oktober 2025: timens første kvarter (se datakilder.spot)"},
        {"etiket": "Udetemperatur", "vaerdi": "DMI {data.dmi_area} ({data.dmi_temp_shortname})", "altid": True},
        {"etiket": "Balancemarked", "vaerdi": "aFRR, mFRR-kapacitet, mFRR-aktivering og ubalancepris for {electricity.spot_area}", "kun_hvis": "_koersel.med_balancering = true", "ellers": "ikke med"},
        {"etiket": "Varmelast", "vaerdi": "syntetisk (heat_load_params, DMI {data.dmi_area}) | tidsserie '{navn}' (sha256 {sha256[:12]}) | repo-fil {heat_csv}", "kilde": "_koersel.tidsserie.varmelast / _koersel.heat_csv"},
        {"etiket": "Solprofil", "vaerdi": "tidsserie '{navn}' (sha256 {sha256[:12]}) | repo-fil {units.<sol>.production_profile_path} | ingen solvarme", "kilde": "_koersel.tidsserie.solprofil / units.*.production_profile_path"},
        {"etiket": "Priszone afviger", "vaerdi": "spot {data.price_zone}, balance {electricity.spot_area}", "kun_hvis": "data.price_zone != electricity.spot_area"},
    ],
    "tidsseriens_navn": "Tidsserie.navn og sha256 slås op på id fra det frosne input; vis det frosne sha256, også hvis rækken siden er ændret eller slettet.",
}

SVAR = [
    {"til": "fv-tidsserie", "spoergsmaal": "Skal klienten køre reglerne som forhåndstjek, eller kun vise backendens validering_json?",
     "svar": "Begge, som du planlægger: forhåndstjek i browseren med de samme koder og tærskler (læs data_krav.json), men backendens validering_json er det, der står på tidsserien og afgør status. Vis klientens fund som 'forhåndstjek' og erstat dem med backendens, når svaret kommer. Brug koderne herfra, også hvor dine i dag hedder det samme (tom, ingen_tid, ugyldig_tid, ugyldigt_tal, blandet_zone, zone_i_fil, oploesning, skaev_tid, flere_kolonner) - og bemærk: 'dubletter' er en FEJL, ikke en advarsel."},
]

KRAV = {
    "_om": ("Fagansvar for data (fv-data). Hvilke data modellen bruger, formatkrav og valideringsregler for "
            "værkets egne tidsserier, værksarkets kontrakt og hvad en kørsel skal vise om sit datagrundlag. "
            "Genereres af viden/vaerktoej/byg_data_krav.py; oraklet er viden/vaerktoej/valider_tidsserie.py; "
            "porten er viden/vaerktoej/tjek_data_krav.py. Læs data_krav.md for begrundelserne."),
    "version": 1,
    "dato": "2026-10-16",
    "modelrepo_commit": PIN,
    "principper": [
        "FEJL, når modellen ville stoppe, regne noget sikkert forkert, eller vi skulle gætte (tidszone, dubletter, enhed). ADVARSEL, når data kan være rigtige, men er usædvanlige - modellen kører, og brugeren bør kigge. INFO er kun orientering.",
        "Intet fyldes eller rettes tavst: hver omregning, udfyldning og afkortning har sit eget fund.",
        "Upload-regler ser kun på serien (og værket, hvis kendt). Bestillingsregler ser på kørslens periode og den EFFEKTIVE konfiguration efter scenariets ændringer - samme princip som §6c.",
        "Markeds- og vejrdata uploades aldrig af brugere (KONTRAKT §6d); kun værkets egne tidsserier.",
    ],
    "datakilder": DATAKILDER,
    "datasaet_pr_indstilling": DATASAET_PR_INDSTILLING,
    "maalt_daekning": MAALT_DAEKNING,
    "tidsserier": {
        "roller": {
            "varmelast": {
                "navn": "Målt varmelast ab værk",
                "betydning": "Samlet varmeproduktion ab værk i MW (middel over timen), inklusive nettab. Ikke an forbruger.",
                "erstatter": "den syntetiske varmelast i hele kørslen",
                "huller_i_modellen": "højst 5 % af kørslens timer interpoleres lineært; over 5 % stopper kørslen",
            },
            "solprofil": {
                "navn": "Solvarmeprofil",
                "betydning": "Solvarmeanlæggets mulige varmeproduktion i MW time for time (et loft, ikke en kapacitetsfaktor). Frostsikring er ikke produktion.",
                "erstatter": "production_profile_path på værkets ene aktive solar_thermal-enhed",
                "huller_i_modellen": "ingen tilladt - hver time i kørslen skal findes",
            },
        },
        "inputformat": INPUTFORMAT,
        "normaliseret_fil": NORMALISERET_FIL,
        "graenser": GRAENSER,
        "regler": R,
        "validering_json": VALIDERING_JSON,
        "maalt_mod_syntetisk": MAALT_MOD_SYNTETISK,
    },
    "vaerksark": VAERKSARK,
    "data_i_koersel": DATA_I_KOERSEL,
    "svar_til_andre": SVAR,
}


def main() -> int:
    koder = [r["kode"] for r in R]
    if len(koder) != len(set(koder)):
        raise SystemExit("dublerede regelkoder")
    UD.write_text(json.dumps(KRAV, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    # Regeltabellen i data_krav.md genereres herfra, så de to ikke kan komme ud af trit.
    md = HER.parent / "data_krav.md"
    a, b = "<!-- REGLER START -->", "<!-- REGLER SLUT -->"
    tekst = md.read_text(encoding="utf-8") if md.exists() else ""
    if a in tekst and b in tekst:
        linjer = [a, "", "## 7. Alle regler (genereret af vaerktoej/byg_data_krav.py)", "",
                  "| Kode | Niveau | Hvornår | Roller | Tjek |", "|---|---|---|---|---|"]
        for r in R:
            linjer.append(f"| `{r['kode']}` | {r['niveau']} | {r['hvornaar']} | {', '.join(r['roller'])} | "
                          f"{r['hvad']}{' (kræver værk)' if r['kraever_vaerk'] else ''} |")
        linjer += ["", "Kilde: viden/data_krav.json", "", b]
        ny = tekst[:tekst.index(a)] + "\n".join(linjer) + tekst[tekst.index(b) + len(b):]
        md.write_text(ny, encoding="utf-8", newline="\n")
    print(f"Skrevet {UD.name}: {len(R)} regler "
          f"({sum(r['niveau'] == 'fejl' for r in R)} fejl, {sum(r['niveau'] == 'advarsel' for r in R)} advarsler, "
          f"{sum(r['niveau'] == 'info' for r in R)} info), {len(DATAKILDER)} datakilder")
    return 0


if __name__ == "__main__":
    sys.exit(main())
