"""Appens eget lag i værksarket (runde 14): fanerne Start og drift, Balancemarked og Øvrige felter.

Baggrunden er målt: et rigtigt værk (17 enheder, én tank) blev lagt ind via værksarket, og tre ting gik galt —
otte enheder med navn, men uden type, forsvandt uden besked; alle enheder stod til slukket ved start, så kørslen
uden tank var uløselig; og balancemarkedet kunne ikke stå i arket. Testene her forhindrer, at

* et felt i appens faner går tabt, læses med forkert type eller tavst skjuler en celle i modelrepoets faner;
* en ukendt sti, et ukendt enhedsnavn eller en værdi af forkert type gemmes (hele importen afvises med ark og celle);
* en række, modelscriptet springer over, forsvinder uden besked;
* revisionssporet skjuler, at en værdi kom fra appens fane og ikke fra modelscriptet.
"""
import json
import re
import tempfile
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fjv import arklaes as AL
from fjv import arklag as LAG
from fjv import feltkatalog as FK
from fjv import lager_minne as LM
from fjv import revision as REV
from fjv import vaerksark as VS
from fjv.flad import Parameter

from .arkhjaelp import skriv_xlsx

#: Tarifskemaets felter, som modelscriptet altid skriver (her kun dem, testene bruger).
SKEMA = {
    "electricity.tariff_consumption.unit": '"kr_per_mwh"',
    "electricity.tariff_consumption.fixed_components.energinet": "128.2",
    "electricity.tariff_consumption.fixed_components.dv": "0.0",
    "electricity.tariff_consumption.net_tariff.bands.lav": "0.0",
    "electricity.tariff_consumption.net_tariff.bands.hoej": "0.0",
}

SCRIPT = {
    "meta.case_name": '"testvaerk"', "meta.titel": '"Testværk"', "meta.tax_year": "2025",
    "data.dmi_area": '"karup"', "data.price_zone": '"DK1"',
    "time.start": '"2025-07-01T00:00:00Z"', "time.end": '"2026-06-30T23:00:00Z"', "time.resolution": '"1h"',
    "solver.mip_rel_gap": "0.001", "solver.mip_abs_gap": "1000.0", "solver.time_limit": "3600.0",
    "heat_load_params.gaf_mw_per_k": "0.7653", "heat_load_params.t_ref": "15.0",
    "prices.natural_gas.value": "606.0", "prices.natural_gas.unit": '"DKK/MWh_fuel"',
    "prices.co2_eua.value": "670.0", "prices.co2_eua.unit": '"DKK/t_CO2"',
    "electricity.spot_area": '"DK1"', "electricity.tariff_consumption_flat": "129.8",
    "electricity.tariff_production_flat": "9.0", "electricity.electricity_tax": "4.0",
    "units.gaskedel.enabled": "true", "units.gaskedel.type": '"gas_boiler"', "units.gaskedel.p_max_heat": "12.0",
    "units.gaskedel.p_min_heat": "2.0", "units.gaskedel.alpha": "0.0", "units.gaskedel.fuel": '"natural_gas"',
    "units.gaskedel.eta_fuel_to_heat": "0.95", "units.gaskedel.var_om": "15.0", "units.gaskedel.start_cost": "500.0",
    "units.gaskedel.min_uptime": "1", "units.gaskedel.min_downtime": "1",
    "units.gaskedel.co2_emissions_per_mwh_fuel": "0.2", "units.gaskedel.uc_enabled": "true",
    "units.gaskedel.initial_status": "0", "units.gaskedel.ancillary.afrr_qualified": "false",
    "units.el_kedel.enabled": "true", "units.el_kedel.type": '"electric_boiler"', "units.el_kedel.p_max_heat": "4.0",
    "units.el_kedel.p_min_heat": "1.0", "units.el_kedel.alpha": "-1.0101", "units.el_kedel.fuel": '"electricity"',
    "units.el_kedel.uc_enabled": "true", "units.el_kedel.initial_status": "0",
    "units.el_kedel.ancillary.afrr_qualified": "true",
    "storage.tank.enabled": "true", "storage.tank.volume_m3": "5000", "storage.tank.delta_t_k": "33.0",
    "storage.tank.e_max_mwh": "191.9", "storage.tank.e_initial_mwh": "95.9", "storage.tank.p_max_charge_mw": "25.0",
    "storage.tank.p_max_discharge_mw": "25.0", "storage.tank.self_discharge_per_hour": "0.0005",
    "storage.tank.cycle_binding": "true",
}

START = {
    "A1": "Start og drift",
    "A4": "navn", "B4": "type", "C4": "i drift", "D4": "tændt ved start", "E4": "start/stop-logik",
    "F4": "CO2-udledning (t CO2/MWh brændsel)", "G4": "idriftsat (år)", "H4": "noter",
    "A5": "sti i modellen", "C5": "units.{enhed}.enabled", "D5": "units.{enhed}.initial_status",
    "E5": "units.{enhed}.uc_enabled", "F5": "units.{enhed}.co2_emissions_per_mwh_fuel",
    "G5": "units.{enhed}.commissioned", "H5": "units.{enhed}.notes",
    "A6": "gaskedel", "B6": "gas_boiler", "C6": "ja", "D6": "nej", "E6": "ja", "F6": 0.204, "G6": 2015,
    "A7": "el_kedel", "B7": "electric_boiler", "C7": "ja", "D7": "ja", "E7": "ja", "H7": "Prækvalificeret 2025.",
    "A9": "tank", "B9": "i drift", "C9": "indhold ved start (MWh)", "D9": "varmetab pr. time", "E9": "slut som start",
    "A10": "sti i modellen", "B10": "storage.{tank}.enabled", "C10": "storage.{tank}.e_initial_mwh",
    "D10": "storage.{tank}.self_discharge_per_hour", "E10": "storage.{tank}.cycle_binding",
    "A11": "tank", "B11": "ja", "C11": 96, "D11": 0, "E11": "nej",
}

BALANCE = {
    "A1": "Balancemarked",
    "A4": "felt", "B4": "værdi", "C4": "enhed", "D4": "forklaring", "E4": "sti i modellen",
    "A5": "Indtægtsmetode", "B5": "activation_value", "E5": "balancing.method",
    "A6": "Samlet prækvalifikation", "B6": 14, "C6": "MW el", "E6": "balancing.ancillary_caps.total_mw",
    "A7": "Robust reservation", "E7": "balancing.robust_reservation",
    "A9": "felt", "B9": "aFRR", "C9": "mFRR", "D9": "enhed", "E9": "forklaring", "F9": "sti i modellen",
    "A10": "Blokstørrelse", "B10": 3, "C10": 4, "F10": "balancing.reservation_gate.{marked}.block_mw",
    "A11": "Referenceenhed", "B11": "el_kedel", "F11": "balancing.reservation_gate.{marked}.opportunity_cost.reference_unit",
    "A13": "navn", "B13": "prækvalifikation (MW el)", "C13": "maks aFRR-bud", "D13": "byder fra",
    "A14": "sti i modellen", "B14": "balancing.ancillary_caps.per_unit_mw.{enhed}",
    "C14": "units.{enhed}.ancillary.afrr_max_bid_mw", "D14": "units.{enhed}.ancillary.available_from",
    "A15": "el_kedel", "B15": 6, "C15": 1.5, "D15": "2026-03-01",
    "A17": "måned", "B17": "aFRR (MW el)", "C17": "mFRR (MW el)",
    "A18": "sti i modellen", "B18": "balancing.availability.afrr.mw_by_month.{måned}",
    "C18": "balancing.availability.mfrr.mw_by_month.{måned}",
    "A19": "2026-03", "B19": 1.155, "C19": 1.034,
}

def oevrige(*raekker) -> dict:
    """Fanen Øvrige felter i sin form: felt | værdi | kun hvis modelscriptet giver | … | sti i modellen (kolonne F)."""
    d = {"A1": "Øvrige felter", "A4": "felt", "B4": "værdi", "C4": LAG.KUN_HVIS, "D4": "enhed", "E4": "forklaring",
         "F4": LAG.STI_OVERSKRIFT}
    for r, (sti, v, b) in enumerate(raekker, start=5):
        d[f"A{r}"], d[f"F{r}"] = sti.split(".")[-1], sti
        if v is not None:
            d[f"B{r}"] = v
        if b is not None:
            d[f"C{r}"] = b
    return d


OEVRIGE = oevrige(("grid.max_consumption_mw", 33, None), ("electricity.tariff_consumption_flat", 125, 129.8),
                  ("storage.tank.e_max_mwh", "null", 191.9), ("solver.mip_rel_gap", "(findes ikke)", 0.001),
                  ("investment.enabled", "nej", None), ("meta.tax_year", 2026, 2025))


class Ark(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="fjv_arklag_"))

    def ark(self, **faner) -> Path:
        navne = {"start": LAG.START_OG_DRIFT, "balance": LAG.BALANCEMARKED, "oevrige": LAG.OEVRIGE}
        return skriv_xlsx(self.tmp / f"{uuid.uuid4().hex}.xlsx",
                          {"Anlaeg": {"A1": "x"}, **{navne.get(k, k): v for k, v in faner.items()}})

    def lag(self, script=None, former=None, **faner) -> LAG.Lag:
        return LAG.anvend(dict(script or SCRIPT), LAG.laes(self.ark(**faner)), former)

    def afvist(self, tekst: str, script=None, **faner) -> str:
        with self.assertRaises(LAG.LagFejl) as c:
            self.lag(script, **faner)
        self.assertIn(tekst, str(c.exception))
        return str(c.exception)


class Laesning(Ark):
    def test_laeseren_giver_det_regnearket_viser(self):
        sti = skriv_xlsx(self.tmp / "a.xlsx", {"Et ark": {"A1": "tekst", "B2": 12, "C3": 0.5, "D4": True, "E5": " "}})
        c = AL.laes_ark(sti)["Et ark"]
        self.assertEqual(c[(1, 1)], "tekst")
        self.assertEqual((c[(2, 2)], c[(3, 3)], c[(4, 4)]), (12, 0.5, True))
        inline = AL.laes_ark(skriv_xlsx(self.tmp / "b.xlsx", {"Et ark": {"A1": "æøå & <b>"}}, inline=True))["Et ark"]
        self.assertEqual(inline[(1, 1)], "æøå & <b>")

    def test_et_ark_uden_appens_faner_giver_et_tomt_lag(self):
        l = LAG.laes(self.ark())
        self.assertEqual((l.faner, l.tildelinger), ([], []))

    def test_start_og_drift_saetter_enhedernes_og_tankens_felter(self):
        lag = self.lag(start=START)
        b = lag.blade
        self.assertEqual(b["units.gaskedel.initial_status"], "0")
        self.assertEqual(b["units.el_kedel.initial_status"], "1")              # ja -> 1 (heltal, som modellen kræver)
        self.assertEqual(b["units.gaskedel.co2_emissions_per_mwh_fuel"], "0.204")
        self.assertEqual(b["units.gaskedel.commissioned"], "2015")              # integer i kataloget: ikke 2015.0
        self.assertEqual(b["units.el_kedel.notes"], '"Prækvalificeret 2025."')
        self.assertEqual(b["storage.tank.e_initial_mwh"], "96.0")               # number i kataloget: decimaltal
        self.assertEqual(b["storage.tank.self_discharge_per_hour"], "0.0")
        self.assertEqual(b["storage.tank.cycle_binding"], "false")
        self.assertEqual(lag.kilder["units.el_kedel.initial_status"], "Start og drift!D7")
        # Felter, fanen ikke har en kolonne for, er scriptets.
        self.assertEqual(b["units.gaskedel.p_max_heat"], "12.0")

    def test_en_tom_celle_betyder_at_appen_ikke_roerer_feltet(self):
        # Brugertesten F2: en tom celle gav før modellens standard (CO2 0 for en gaskedel, tændt ved start), mens en
        # manglende række gav scriptets værdi (0,2, slukket). Nu betyder tom ét: appen rører ikke feltet — præcis som
        # hvis rækken ikke fandtes.
        lag = self.lag(start={**START, "F6": None, "D7": None})
        self.assertEqual(lag.blade["units.gaskedel.co2_emissions_per_mwh_fuel"], "0.2")     # scriptets
        self.assertEqual(lag.blade["units.el_kedel.initial_status"], "0")                   # scriptets
        self.assertNotIn("units.el_kedel.initial_status", lag.kilder)
        uden_raekke = self.lag(start={k: v for k, v in START.items() if not re.fullmatch(r"[A-H]7", k)})
        self.assertEqual(lag.blade["units.el_kedel.initial_status"], uden_raekke.blade["units.el_kedel.initial_status"])

    def test_findes_ikke_betyder_at_feltet_ikke_saettes(self):
        # Tømmes et felt med vilje, skrives (findes ikke): feltet fjernes, og det står i lagets ændringer (aldrig tavst).
        lag = self.lag(start={**START, "F6": "(findes ikke)", "D7": "(Findes ikke)"})
        self.assertNotIn("units.gaskedel.co2_emissions_per_mwh_fuel", lag.blade)
        self.assertNotIn("units.el_kedel.initial_status", lag.blade)
        self.assertIn(("units.el_kedel.initial_status", "slet", "0", None), lag.aendringer)
        self.assertEqual(lag.fjernet["units.el_kedel.initial_status"], "Start og drift!D7")

    def test_balancemarked_feltblok_markeder_enheder_og_maaneder(self):
        b = self.lag(balance=BALANCE).blade
        self.assertEqual(b["balancing.method"], '"activation_value"')
        self.assertEqual(b["balancing.ancillary_caps.total_mw"], "14.0")
        self.assertNotIn("balancing.robust_reservation", b)                     # tom celle: feltet sættes ikke
        self.assertEqual(b["balancing.reservation_gate.afrr.block_mw"], "3.0")
        self.assertEqual(b["balancing.reservation_gate.mfrr.block_mw"], "4.0")
        self.assertEqual(b["balancing.reservation_gate.afrr.opportunity_cost.reference_unit"], '"el_kedel"')
        self.assertNotIn("balancing.reservation_gate.mfrr.opportunity_cost.reference_unit", b)
        self.assertEqual(b["balancing.ancillary_caps.per_unit_mw.el_kedel"], "6.0")
        self.assertEqual(b["units.el_kedel.ancillary.afrr_max_bid_mw"], "1.5")
        self.assertEqual(b["units.el_kedel.ancillary.available_from"], '"2026-03-01"')
        self.assertEqual(b["balancing.availability.afrr.mw_by_month.2026-03"], "1.155")
        self.assertEqual(b["balancing.availability.mfrr.mw_by_month.2026-03"], "1.034")

    def test_en_tom_fane_er_intet_balancemarked(self):
        tom = {k: v for k, v in BALANCE.items() if not (k[0] in "BCD" and int(k[1:]) in (5, 6, 10, 11, 15, 19))}
        lag = self.lag(balance=tom)
        self.assertFalse([s for s in lag.blade if s.startswith("balancing.")])
        self.assertEqual(lag.aendringer, [])

    def test_excel_goer_maaned_og_dato_til_serietal(self):
        # "2026-03" og "2026-03-01" bliver datoer i Excel (serietal 46082); importen læser dem som måned og dato.
        bal = {**BALANCE, "A19": 46082, "D15": 46082}
        b = self.lag(balance=bal).blade
        self.assertEqual(b["balancing.availability.afrr.mw_by_month.2026-03"], "1.155")
        self.assertEqual(b["units.el_kedel.ancillary.available_from"], '"2026-03-01"')


class OevrigeFelter(Ark):
    def test_raekkerne_saetter_fjerner_og_er_betingede(self):
        lag = self.lag(oevrige=OEVRIGE)
        b = lag.blade
        self.assertEqual(b["grid.max_consumption_mw"], "33.0")
        self.assertEqual(b["electricity.tariff_consumption_flat"], "125.0")
        self.assertEqual(b["storage.tank.e_max_mwh"], "null")
        self.assertNotIn("solver.mip_rel_gap", b)
        self.assertEqual(b["investment.enabled"], "false")
        # tax_year er et tal (number) i kataloget og bliver et decimaltal; værkets egen skrivemåde (2026) kommer
        # tilbage med markeringens former (se Skrivemaader).
        self.assertEqual(b["meta.tax_year"], "2026.0")
        self.assertEqual(lag.noter, [])
        self.assertEqual(lag.antal, {"Øvrige felter": 6})

    def test_en_betinget_raekke_viger_for_en_rettelse_i_modelrepoets_faner(self):
        # Brugeren har rettet tankens maks fyldning i Anlaeg (191,9 -> 250): rækken "e_max_mwh = null" var skrevet
        # til 191,9 og må ikke skjule rettelsen. Rettelsen vinder, og loggen siger, at rækken ikke blev brugt.
        script = {**SCRIPT, "storage.tank.e_max_mwh": "250.0"}
        lag = self.lag(script, oevrige=OEVRIGE)
        self.assertEqual(lag.blade["storage.tank.e_max_mwh"], "250.0")
        self.assertNotIn("storage.tank.e_max_mwh", lag.kilder)
        self.assertEqual(len(lag.noter), 1)
        self.assertIn("Øvrige felter!B7 (storage.tank.e_max_mwh) er ikke brugt", lag.noter[0])
        self.assertIn("250.0", lag.noter[0])
        # De øvrige rækker gælder stadig.
        self.assertEqual(lag.blade["electricity.tariff_consumption_flat"], "125.0")

    def test_fjernes_et_tarifskema_og_er_et_felt_rettet_gaelder_ingen_af_fjernelserne(self):
        # Et værk med flad eltarif: rækkerne fjerner skemaet, modelscriptet altid laver. Udfylder brugeren et
        # skema i Priser, må der ikke stå et halvt skema tilbage (modellen ville afvise det).
        fjern = {"electricity.tariff_consumption.unit": "kr_per_mwh",
                 "electricity.tariff_consumption.fixed_components.energinet": 128.2,
                 "electricity.tariff_consumption.fixed_components.dv": 0,
                 "electricity.tariff_consumption.net_tariff.bands.lav": 0,
                 "electricity.tariff_consumption.net_tariff.bands.hoej": 0}
        rk = oevrige(*[(sti, "(findes ikke)", v) for sti, v in fjern.items()])
        self.assertEqual(set(fjern), set(SKEMA))
        uroert = self.lag({**SCRIPT, **SKEMA}, oevrige=rk)
        self.assertFalse([s for s in uroert.blade if s.startswith("electricity.tariff_consumption.")])
        rettet = self.lag({**SCRIPT, **SKEMA, "electricity.tariff_consumption.net_tariff.bands.hoej": "55.0"}, oevrige=rk)
        self.assertEqual({s for s in rettet.blade if s.startswith("electricity.tariff_consumption.")}, set(fjern))
        self.assertEqual(len(rettet.noter), len(fjern))

    def test_en_ukendt_sti_afviser_med_ark_og_celle(self):
        besked = self.afvist("Øvrige felter!B5", oevrige={**OEVRIGE, "F5": "units.gaskedel.findes_ikke"})
        self.assertIn("findes ikke i feltkataloget", besked)
        self.assertIn("Intet er gemt", besked)

    def test_en_vaerdi_af_forkert_type_afviser_med_ark_og_celle(self):
        self.assertIn("skal være et tal", self.afvist("Øvrige felter!B5", oevrige={**OEVRIGE, "B5": "meget"}))
        self.assertIn("ja eller nej", self.afvist("Start og drift!C6", start={**START, "C6": "måske"}))
        self.assertIn("helt tal", self.afvist("Start og drift!G6", start={**START, "G6": 2015.5}))
        self.assertIn("ikke tilladt", self.afvist("Balancemarked!B5", balance={**BALANCE, "B5": "gætværk"}))
        self.assertIn("≥ 0", self.afvist("Balancemarked!B6", balance={**BALANCE, "B6": -1}))

    def test_en_raekke_uden_vaerdi_roerer_ikke_feltet(self):
        lag = self.lag(oevrige={**OEVRIGE, "B5": None})
        self.assertNotIn("grid.max_consumption_mw", lag.blade)

    def test_en_vaerdi_uden_sti_afvises(self):
        # En række i Øvrige felter med en værdi, men uden sti, ville ellers forsvinde uden besked.
        self.assertIn("ingen sti", self.afvist("Øvrige felter!B11", oevrige={**OEVRIGE, "B11": 7}))

    def test_en_tabelraekke_uden_navn_afvises(self):
        self.assertIn("intet navn", self.afvist("Start og drift!C8", start={**START, "C8": "ja"}))

    def test_danske_etiketter_laeses_paa_koden(self):
        b = self.lag(balance={**BALANCE, "B5": "aktiveringsværdi kvarter for kvarter – anbefalet (activation_value)"}).blade
        self.assertEqual(b["balancing.method"], '"activation_value"')
        self.assertIn("ikke tilladt", self.afvist("Balancemarked!B5", balance={**BALANCE, "B5": "aktiveringsværdi"}))

    def test_samme_sti_to_gange_afvises(self):
        self.afvist("står to gange", oevrige={**OEVRIGE, "F11": "grid.max_consumption_mw", "B11": 20})


class Navne(Ark):
    def test_et_ukendt_enhedsnavn_afviser_hele_importen(self):
        besked = self.afvist("Start og drift!A7", start={**START, "A7": "elkedel_ny"})
        self.assertIn("står ikke i arket Anlaeg", besked)
        self.afvist("Balancemarked!A15", balance={**BALANCE, "A15": "findes_ikke"})
        self.afvist("Start og drift!A11", start={**START, "A11": "tank_2"})

    def test_referenceenheden_skal_findes(self):
        besked = self.afvist("Balancemarked!B11", balance={**BALANCE, "B11": "vp_luft_vand"})
        self.assertIn("findes ikke i værket", besked)

    def test_navne_normaliseres_som_modelscriptet(self):
        # Arket bærer værkets navn (el__kedel); modelscriptet læser el_kedel. Laget står i scriptets navnerum,
        # og ved en revision føres navnene tilbage med objektkortet — også i balancemarkedets stier og værdier.
        start = {**START, "A7": "el__kedel"}
        bal = {**BALANCE, "A15": "el__kedel", "B11": "el__kedel"}
        lag = self.lag(start=start, balance=bal)
        self.assertEqual(lag.blade["units.el_kedel.initial_status"], "1")
        self.assertEqual(lag.blade["balancing.ancillary_caps.per_unit_mw.el_kedel"], "6.0")
        self.assertEqual(lag.blade["balancing.reservation_gate.afrr.opportunity_cost.reference_unit"], '"el_kedel"')
        kort = {("units", "el_kedel"): "el__kedel", ("units", "gaskedel"): "gaskedel", ("storage", "tank"): "tank"}
        v = REV.oversaet(lag.blade, kort)
        self.assertEqual(v["units.el__kedel.initial_status"], "1")
        self.assertEqual(v["balancing.ancillary_caps.per_unit_mw.el__kedel"], "6.0")
        self.assertEqual(v["balancing.reservation_gate.afrr.opportunity_cost.reference_unit"], '"el__kedel"')

    def test_samme_enhed_to_gange_afvises(self):
        self.afvist("står to gange", start={**START, "A8": "gaskedel", "C8": "ja"})

    def test_en_enhed_uden_raekke_beholder_scriptets_vaerdier_og_det_siges(self):
        start = {k: v for k, v in START.items() if not k.endswith("7") or k in ("A7x",)}
        lag = self.lag(start=start)
        self.assertEqual(lag.blade["units.el_kedel.initial_status"], "0")
        self.assertTrue(any("el_kedel" in n and "modelscriptets værdier" in n for n in lag.noter), lag.noter)


class Skrivemaader(Ark):
    def test_et_heltal_i_vaerket_kommer_ikke_tilbage_som_decimaltal(self):
        # Værket har e_initial_mwh = 96 (heltal); et regneark kender ikke forskellen på 96 og 96.0. Markeringens
        # skrivemåder fører værkets egen form tilbage — kun når tallet er det samme.
        lag = self.lag(former={"storage.tank.e_initial_mwh": "96", "units.gaskedel.p_max_heat": "12",
                               "units.gaskedel.var_om": "99"}, start=START)
        self.assertEqual(lag.blade["storage.tank.e_initial_mwh"], "96")
        self.assertEqual(lag.blade["units.gaskedel.p_max_heat"], "12")
        self.assertEqual(lag.blade["units.gaskedel.var_om"], "15.0")            # et andet tal: skrivemåden gælder ikke
        # Skrivemåden er ikke en ændring af laget: p_max_heat kom fra scriptet og står ikke i ændringerne.
        self.assertNotIn("units.gaskedel.p_max_heat", {a[0] for a in lag.aendringer})
        self.assertEqual(lag.script["units.gaskedel.p_max_heat"], "12")


class Hoejlydt(Ark):
    ANLAEG = {
        "A4": "navn", "B4": "type", "C4": "maks varme (MW)",
        "A5": "gaskedel", "B5": "gas_boiler", "C5": 12,
        "A6": "elkedel", "B6": "electric_boiler", "C6": 4,
        "A26": "Lovlige værdier i kolonne 'type'",
        "A51": "tank", "B51": "volumen (m³)", "C51": "maks fyldning (MWh)",
        "A52": "tank", "B52": 5000, "C52": 191.9,
        "A59": "Maks fyldning er den varmemængde, tanken rummer.",
    }

    def tjek(self, anlaeg, varmepumpe=None):
        ark = {"Anlaeg": anlaeg}
        if varmepumpe:
            ark["Varmepumpe"] = varmepumpe
        LAG.tjek_tavse_raekker(skriv_xlsx(self.tmp / f"{uuid.uuid4().hex}.xlsx", ark))

    def afvist_raekke(self, tekst, anlaeg, varmepumpe=None):
        with self.assertRaises(LAG.TavsRaekke) as c:
            self.tjek(anlaeg, varmepumpe)
        self.assertIn(tekst, str(c.exception))
        self.assertIn("Intet er gemt", str(c.exception))

    def test_et_udfyldt_ark_godtages(self):
        self.tjek(self.ANLAEG)

    def test_en_enhed_med_navn_uden_type_afviser_med_raekkenummer(self):
        # Målt: otte af 17 enheder havde navn, men ingen type; scriptets dropna (linje 606) sprang dem over.
        self.afvist_raekke("Anlaeg række 7: enheden 'halmkedel' har et navn, men ingen type",
                           {**self.ANLAEG, "A7": "halmkedel", "C7": 12})

    def test_en_type_uden_navn_og_tal_uden_navn_afviser(self):
        self.afvist_raekke("Anlaeg række 8: der står en type (gas_boiler), men intet navn", {**self.ANLAEG, "B8": "gas_boiler"})
        self.afvist_raekke("Anlaeg række 9: der står tal i rækken (C9)", {**self.ANLAEG, "C9": 5})

    def test_en_tank_uden_volumen_og_en_syvende_tank_afviser(self):
        self.afvist_raekke("Anlaeg række 53: tanken 'tank_2' har et navn, men intet volumen", {**self.ANLAEG, "A53": "tank_2", "C53": 100})
        self.afvist_raekke("Anlaeg række 58: tanken 'tank_7'", {**self.ANLAEG, "A58": "tank_7", "B58": 3000, "C58": 100})

    def test_et_maalepunkt_under_varmepumpens_tabel_afviser(self):
        vp = {"A5": "navn", "B5": "udetemperatur", "A6": "vp", "B6": -7, "C6": 3, "D6": 1.2, "A25": "Tjek COP: …",
              "A27": "vp", "B27": 7, "C27": 4, "D27": 1.2}
        self.afvist_raekke("Varmepumpe række 27", self.ANLAEG, vp)

    def test_flere_fund_naevnes_samlet(self):
        with self.assertRaises(LAG.TavsRaekke) as c:
            self.tjek({**self.ANLAEG, "A7": "a", "A8": "b"})
        self.assertIn("række 7", str(c.exception))
        self.assertIn("række 8", str(c.exception))


class FoersteTime(unittest.TestCase):
    def test_advarsel_naar_alle_styrbare_enheder_er_slukket_ved_start(self):
        # Målt: scriptet sætter initial_status 0 på hver enhed med unit commitment; uden tank var kørslen uløselig.
        adv = LAG.foerste_time_advarsel(SCRIPT, har_lag=True)
        self.assertIn("første time uden tank", adv)
        self.assertIn("el_kedel, gaskedel", adv)
        self.assertIn("fanen Start og drift", adv)
        self.assertIn("Konfiguration", LAG.foerste_time_advarsel(SCRIPT, har_lag=False))

    def test_ingen_advarsel_naar_en_enhed_kan_levere(self):
        self.assertIsNone(LAG.foerste_time_advarsel({**SCRIPT, "units.el_kedel.initial_status": "1"}, True))
        # Uden unit commitment kan enheden levere fra første time (modellens standard for uc_enabled er nej).
        self.assertIsNone(LAG.foerste_time_advarsel({**SCRIPT, "units.el_kedel.uc_enabled": "false"}, True))
        # En slået-fra enhed tæller ikke; solvarme er vejrbestemt og kan ikke dække.
        self.assertIsNotNone(LAG.foerste_time_advarsel(
            {**SCRIPT, "units.sol.type": '"solar_thermal"', "units.sol.uc_enabled": "false",
             "units.reserve.enabled": "false", "units.reserve.type": '"gas_boiler"'}, True))


def params(blade: dict) -> list:
    return [Parameter(s, j, s.split(".")[0], s.split(".")[1] if s.split(".")[0] in ("units", "storage", "prices") else None,
                      None, False, i) for i, (s, j) in enumerate(blade.items(), start=1)]


class Import(Ark):
    """Laget i importen: nyt værk (revisionssporet) og revision (kun brugerens ændringer)."""

    def k(self, blade=None):
        return VS.Konvertering("testvaerk", "Testværk", None, "meta: {}\n", params(blade or SCRIPT))

    def test_et_ark_uden_appens_faner_importeres_som_foer(self):
        k = self.k()
        VS.laeg_lag(k, self.ark())
        self.assertIsNone(k.lag)
        self.assertEqual({p.sti: p.vaerdi_json for p in k.params}, SCRIPT)
        self.assertEqual(VS.revisionsspor(k)[0], 1)

    def test_revisionssporet_viser_at_vaerdien_kom_fra_appens_fane(self):
        k = self.k()
        VS.laeg_lag(k, self.ark(start=START, balance=BALANCE, oevrige=OEVRIGE))
        rev, spor = VS.revisionsspor(k)
        self.assertEqual(rev, 2)
        self.assertEqual([r for r, _ in spor], [1, 2])
        # Revision 1 er modelscriptets læsning, urørt.
        self.assertEqual({s: n for s, _h, _g, n in spor[0][1]}, SCRIPT)
        self.assertTrue(all(h == "opret" and g is None for _s, h, g, _n in spor[0][1]))
        # Revision 2 er lagets ændringer oven på den: gammel = scriptets værdi.
        to = {s: (h, g, n) for s, h, g, n in spor[1][1]}
        self.assertEqual(to["units.el_kedel.initial_status"], ("ret", "0", "1"))
        self.assertEqual(to["balancing.method"], ("opret", None, '"activation_value"'))
        self.assertEqual(to["solver.mip_rel_gap"], ("slet", "0.001", None))
        # Bladet bærer kilden som kommentar.
        p = {x.sti: x for x in k.params}
        self.assertIn("«Start og drift»", p["units.el_kedel.initial_status"].kommentar)
        self.assertIn("celle D7", p["units.el_kedel.initial_status"].kommentar)
        self.assertIn("ikke fra modelscriptet, som gav 0", p["units.el_kedel.initial_status"].kommentar)
        self.assertIsNone(p["units.gaskedel.p_max_heat"].kommentar)
        self.assertEqual(p["balancing.method"].sektion, "balancing")
        self.assertEqual(p["units.el_kedel.ancillary.afrr_max_bid_mw"].objekt, "el_kedel")

    def test_lageret_gemmer_revision_2_og_loggen_siger_det(self):
        db = LM.MinneDb()
        lager = LM.MinneImportLager(db)
        iid = str(uuid.uuid4())
        db.importer[iid] = {"id": iid, "status": "koerer", "uploadet": datetime.now(timezone.utc)}
        k = self.k()
        VS.laeg_lag(k, self.ark(start=START, balance=BALANCE))
        VS.afslut_nyt_vaerk(k)
        res = lager.gem_vaerk({"id": iid, "uploadet_af": "ingenioer@example.org"}, k, "0" * 40, "",
                              files=str(self.tmp))
        v = db.vaerker[res["vaerk_id"]]
        self.assertEqual((res["revision"], v["revision"]), (2, 2))
        self.assertEqual({x["revision"] for x in v["log"]}, {1, 2})
        self.assertIn("revision 1 er modelscriptets læsning af arket, revision 2 appens egne faner", res["log"])
        self.assertIn("Appens egne faner (læses af appen, ikke af modelscriptet): Start og drift", res["log"])

    def test_laget_maa_ikke_give_et_vaerk_modellen_ikke_kan_bruge(self):
        # Tankens indhold ved start ryddet: modellen kræver det. Afvises som et nyt værk i appen ville blive.
        k = self.k()
        VS.laeg_lag(k, self.ark(start={**START, "C11": "(findes ikke)"}))
        with self.assertRaises(VS.ArkFejl) as c:
            VS.afslut_nyt_vaerk(k)
        self.assertIn("storage.tank.e_initial_mwh mangler", str(c.exception))

    def test_advarslen_om_foerste_time_staar_foerst_ogsaa_uden_appens_faner(self):
        k = self.k()
        VS.laeg_lag(k, self.ark())
        VS.afslut_nyt_vaerk(k)
        self.assertIn("første time uden tank", k.advarsler[0])
        k2 = self.k()
        VS.laeg_lag(k2, self.ark(start=START))                                  # el_kedel tændt ved start
        VS.afslut_nyt_vaerk(k2)
        self.assertFalse([a for a in k2.advarsler if "første time" in a])

    def revision(self, vaerk: dict, basis_faner: dict, ark_faner: dict, script_ark=None):
        kb, ka = self.k(), self.k(script_ark)
        VS.laeg_lag(kb, self.ark(**basis_faner))
        VS.laeg_lag(ka, self.ark(**ark_faner))
        laesning = VS.laesning_af(kb, ka)
        v = {"id": "v", "kode": "testvaerk", "navn": "Testværk", "revision": 1, "arkiveret": False}
        m = {"grundlag": REV.grundlag(vaerk, {}), "afvigelser": ["meta.case_name"]}
        return VS.forbered_revision(v, {"forventet_revision": 1, "markering": m}, vaerk, {}, laesning, {}, None)

    def test_revision_gemmer_kun_den_celle_brugeren_har_rettet(self):
        faner = {"start": START, "balance": BALANCE, "oevrige": OEVRIGE}
        vaerk = blade_af(self, faner)
        uden = self.revision(vaerk, faner, faner)
        self.assertIsNone(uden["ny_rev"])
        f = self.revision(vaerk, faner, {**faner, "start": {**START, "D6": "ja"}})
        self.assertEqual([(x["sti"], x["gammel_json"], x["ny_json"]) for x in f["plan"]["ret"]],
                         [("units.gaskedel.initial_status", "0", "1")])
        self.assertEqual((f["plan"]["opret"], f["plan"]["slet"]), ([], []))
        self.assertIn("units.gaskedel.initial_status: 0 -> 1  [appens fane Start og drift!D6]", f["log"])

    def test_revision_gemmer_et_felt_i_konverteringens_sektioner_naar_det_staar_i_appens_fane(self):
        # meta.tax_year er konverteringens eget felt og gemmes aldrig, når værdien er scriptets — men rækken i
        # Øvrige felter er brugerens eget tal.
        faner = {"oevrige": OEVRIGE}
        vaerk = blade_af(self, faner)
        f = self.revision(vaerk, faner, {"oevrige": {**OEVRIGE, "B10": 2027}})
        self.assertEqual([(x["sti"], x["ny_json"]) for x in f["plan"]["ret"]], [("meta.tax_year", "2027.0")])

    def test_en_basis_der_ikke_er_vaerkets_eksport_afvises_ogsaa_paa_lagets_felter_i_konverteringens_sektioner(self):
        # Codex' review, fund 3: værket har solver.mip_rel_gap = 0.002 (fra Øvrige felter); arket siger 0.003, og en
        # forfalsket basis siger også 0.003. Før blev feltet sprunget over i tjek_basis (en "artefakt"), forskellen
        # basis -> ark var nul, og importen sagde "ingen ændringer" — værket blev stående på 0.002.
        faner = {"oevrige": {**OEVRIGE, "B8": 0.002}}
        vaerk = blade_af(self, faner)
        self.assertEqual(vaerk["solver.mip_rel_gap"], "0.002")
        falsk = {"oevrige": {**OEVRIGE, "B8": 0.003}}
        with self.assertRaises(VS.ArkFejl) as c:
            self.revision(vaerk, falsk, falsk)
        self.assertIn("basis er ikke værkets eksport", str(c.exception))
        self.assertIn("solver.mip_rel_gap", str(c.exception))
        # Den ægte basis og samme ark: ændringen gemmes.
        f = self.revision(vaerk, faner, falsk)
        self.assertEqual([(x["sti"], x["ny_json"]) for x in f["plan"]["ret"]], [("solver.mip_rel_gap", "0.003")])
        # Scriptets egne konverteringsartefakter (felter, laget ikke bestemmer) sammenlignes stadig ikke.
        # (Værket har en anden periode end den, scriptet skriver; feltet står ikke i appens faner her.)
        self.assertIsNone(self.revision({**vaerk, "time.start": '"2026-03-02T00:00:00Z"'}, faner, faner)["ny_rev"])

    def test_revision_afviser_nye_brud_paa_modelkravene(self):
        faner = {"start": START}
        vaerk = blade_af(self, faner)
        with self.assertRaises(VS.ArkFejl) as c:
            self.revision(vaerk, faner, {"start": {**START, "C11": "(findes ikke)"}})
        self.assertIn("storage.tank.e_initial_mwh mangler", str(c.exception))
        self.assertIn("Intet er gemt", str(c.exception))


def blade_af(test: Ark, faner: dict) -> dict:
    """Værket, som en eksport med netop de faner svarer til (scriptets læsning + laget)."""
    k = VS.Konvertering("testvaerk", "Testværk", None, "meta: {}\n", params(SCRIPT))
    VS.laeg_lag(k, test.ark(**faner))
    return {p.sti: p.vaerdi_json for p in k.params}


class Markering(Ark):
    def app(self, format_, former=None):
        rk = {"A1": "format", "B1": format_, "A2": "vaerk_id", "B2": "11111111-2222-4333-8444-555555555555",
              "A3": "revision", "B3": 3, "A4": "sha256", "B4": "1" * 64, "A5": "grundlag", "B5": "2" * 64,
              "A6": "afvigelser", "B6": "[]"}
        if former is not None:
            rk.update({"A7": "former", "B7": json.dumps(former)})
        return skriv_xlsx(self.tmp / f"{uuid.uuid4().hex}.xlsx", {"Anlaeg": {"A1": "x"}, "_app": rk},
                          inline=True, skjulte=("_app",))

    def test_markeringen_baerer_skrivemaader(self):
        m = REV.laes_markering(self.app(REV.FORMAT, {"storage.tank.e_initial_mwh": "96"}))
        self.assertEqual(m["format"], "fjv-vaerksark-eksport/3")
        self.assertEqual(m["former"], {"storage.tank.e_initial_mwh": "96"})
        self.assertEqual(REV.laes_markering(self.app(REV.FORMAT))["former"], {})

    def test_et_ark_i_format_2_afvises_som_revision_med_en_klar_besked(self):
        gl = REV.laes_markering(self.app(REV.FORMAT_FOER))
        ny = REV.laes_markering(self.app(REV.FORMAT))
        with self.assertRaises(REV.RevisionsFejl) as c:
            REV.tjek_markeringer(gl, ny, gl["vaerk_id"], 3)
        self.assertIn("ældre udgave af appen (format 2", str(c.exception))
        self.assertIn("eksportér værket igen", str(c.exception))

    def test_et_ark_i_format_2_uden_appens_faner_kan_stadig_blive_et_nyt_vaerk(self):
        k = VS.Konvertering("testvaerk", "Testværk", None, "meta: {}\n", params(SCRIPT))
        VS.laeg_lag(k, self.app(REV.FORMAT_FOER))
        self.assertIsNone(k.lag)
        self.assertEqual({p.sti: p.vaerdi_json for p in k.params}, SCRIPT)


class Katalog(unittest.TestCase):
    def test_den_mest_konkrete_post_vinder(self):
        self.assertEqual(FK.find("prices.co2_eua.value")["sti"], "prices.co2_eua.value")
        self.assertEqual(FK.find("electricity.tariff_consumption.fixed_components.elafgift_net")["sti"],
                         "electricity.tariff_consumption.fixed_components.elafgift_net")
        self.assertEqual(FK.find("electricity.tariff_consumption.fixed_components.energinet")["sti"],
                         "electricity.tariff_consumption.fixed_components.*")
        # Et brændsel, kataloget ikke kender (fx fyringsolie), har ingen pris-post: stien er ukendt.
        self.assertIsNone(FK.find("prices.fyringsolie.value"))
        self.assertIsNone(FK.find("units.x.findes_ikke"))

    def test_typen_kommer_fra_kataloget_ikke_fra_cellen(self):
        self.assertEqual(FK.fra_celle("units.x.p_max_heat", 12), "12.0")
        self.assertEqual(FK.fra_celle("units.x.min_uptime", 3.0), "3")
        self.assertEqual(FK.fra_celle("units.x.initial_status", "ja"), "1")
        self.assertEqual(FK.fra_celle("units.x.initial_status", 0), "0")
        self.assertEqual(FK.fra_celle("units.x.enabled", "Nej"), "false")
        self.assertEqual(FK.fra_celle("units.x.notes", "ja"), '"ja"')
        self.assertEqual(FK.fra_celle("units.x.ancillary.bid_window.months", "10, 11, 12"), "[10,11,12]")
        self.assertEqual(FK.fra_celle("units.x.ancillary.bid_window.months", "[10,11,12,1,2,3]"), "[10,11,12,1,2,3]")
        self.assertEqual(FK.fra_celle("storage.x.e_max_mwh", "null"), "null")
        with self.assertRaises(FK.FeltFejl):
            FK.fra_celle("units.x.p_max_heat", "12,5")


if __name__ == "__main__":
    unittest.main()


class Laeseren(Ark):
    """Codex' review af runde 14, fund 1 og 2: læseren må ikke kunne fastholdes af et lille ark, og en formel uden
    gemt resultat må aldrig læses som en tom celle."""

    def test_en_celle_uden_for_regnearkets_graenser_afvises(self):
        # Fund 1: Anlaeg!A999999999999 fik kontrollen af tavse rækker til at gennemløbe en billion rækker.
        for ref in ("A999999999999", "A1048577", "XFE1"):
            sti = skriv_xlsx(self.tmp / f"{ref}.xlsx", {"Anlaeg": {"A4": "navn", ref: "Lovlige værdier"}})
            with self.assertRaises(AL.LaeseFejl) as c:
                AL.laes_ark(sti)
            self.assertIn(ref, str(c.exception))
            self.assertIn("uden for et regnearks grænser", str(c.exception))
            with self.assertRaises(LAG.TavsRaekke):                      # importen afviser arket, den hænger ikke
                LAG.tjek_tavse_raekker(sti)
        self.assertEqual(AL.laes_ark(skriv_xlsx(self.tmp / "ok.xlsx", {"A": {"XFD1048576": 1}}))["A"], {(1048576, 16384): 1})

    def test_et_sparsomt_ark_gennemloebes_paa_de_raekker_der_findes(self):
        # Sidste lovlige række: arbejdet skal følge antallet af celler, ikke rækkenummeret.
        opslag = {"n": 0}

        class Taeller(dict):
            def get(self, *a):
                opslag["n"] += 1
                return dict.get(self, *a)

        # Codex' eksempel: "navn" i række 4 og "Lovlige værdier" i regnearkets sidste række.
        ark = {"Anlaeg": Taeller({(4, 1): "navn", (5, 1): "kedel", (5, 2): "gas_boiler", (1048576, 1): "Lovlige værdier"}),
               "Varmepumpe": Taeller({(5, 1): "navn", (1048000, 1): "x"}),
               LAG.START_OG_DRIFT: Taeller({(4, 1): "navn", (5, 1): LAG.STI_OVERSKRIFT, (1048576, 1): "x"})}
        gammel = AL.laes_ark
        AL.laes_ark = lambda sti, kun=None, **kw: {k: v for k, v in ark.items() if kun is None or k in kun}
        try:
            LAG.tjek_tavse_raekker(self.tmp / "findes_ikke.xlsx")
            LAG.laes(self.tmp / "findes_ikke.xlsx")
        finally:
            AL.laes_ark = gammel
        self.assertLess(opslag["n"], 2000, "læseren gennemløber rækkenumre, ikke celler")

    def test_laesningen_har_en_ressourcegraense(self):
        mange = {f"A{r}": r for r in range(1, AL.MAKS_CELLER + 3)}
        with self.assertRaises(AL.LaeseFejl) as c:
            AL.laes_ark(skriv_xlsx(self.tmp / "mange.xlsx", {LAG.OEVRIGE: mange}), kun=LAG.FANER)
        self.assertIn("flere end", str(c.exception))
        self.assertIn(LAG.OEVRIGE, str(c.exception))
        # Uden for de faner, appen selv læser, gælder grænsen ikke (Timedata har 8.760 rækker og læses af scriptet).
        self.assertEqual(AL.laes_ark(skriv_xlsx(self.tmp / "td.xlsx", {"Timedata": mange}), kun=LAG.FANER), {})

    def test_xml_med_entiteter_afvises(self):
        import zipfile
        sti = skriv_xlsx(self.tmp / "ent.xlsx", {LAG.OEVRIGE: {"A1": "x"}})
        with zipfile.ZipFile(sti) as z:
            dele = {n: z.read(n) for n in z.namelist()}
        dele["xl/worksheets/sheet1.xml"] = (b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaaaaaaaa">]>'
                                             + dele["xl/worksheets/sheet1.xml"].split(b"?>", 1)[1])
        with zipfile.ZipFile(sti, "w") as z:
            for n, b in dele.items():
                z.writestr(n, b)
        with self.assertRaises(AL.LaeseFejl) as c:
            AL.laes_ark(sti)
        self.assertIn("DOCTYPE", str(c.exception))

    def test_en_formel_uden_gemt_resultat_afvises_med_ark_og_celle(self):
        # Fund 2: gasmotorens CO2-faktor som =0.2, gemt uden genberegning, blev læst som en tom celle.
        besked = self.afvist("Start og drift!F6", start={**START, "F6": ("=0.2", None)})
        self.assertIn("formel uden et gemt resultat", besked)
        self.assertIn("Åbn arket i Excel og gem det igen", besked)
        # Også i en nøglecelle (navnet) og i Øvrige felter.
        self.afvist("Start og drift!A7", start={**START, "A7": ('="el_"&"kedel"', None)})
        self.afvist("Øvrige felter!B5", oevrige={**OEVRIGE, "B5": ("=30+3", None)})

    def test_en_formel_med_gemt_resultat_laeses_som_resultatet(self):
        lag = self.lag(start={**START, "F6": ("=0.1+0.104", 0.204)})
        self.assertEqual(lag.blade["units.gaskedel.co2_emissions_per_mwh_fuel"], "0.204")
