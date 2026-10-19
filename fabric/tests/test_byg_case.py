"""fjv.byg_case: frosset input -> case.yaml + argv (KONTRAKT v2 §5.2)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import yaml

HER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HER))
from fjv import konstanter as K  # noqa: E402
from fjv.byg_case import InputFejl, byg, input_hash, raekker_fra_vaerk  # noqa: E402
from fjv.flad import flad  # noqa: E402

KODE = HER / "_lokal" / "Files" / K.REL_KODE / K.MODEL_COMMIT

MINI = """\
time:
  start: "2026-01-05T00:00:00Z"
  end: "2026-01-11T23:00:00Z"
  resolution: "1h"
solver:
  mip_rel_gap: 0.005
heat_load_params:
  gaf_mw_per_k: 0.9
units:
  kedel:
    enabled: true
    p_max_heat: 10.0
  vp:
    p_max_heat: 4
storage:
  tank:
    enabled: true
    volume_m3: 1000
prices:
  straw:
    value: 232.0
"""


def raekker(tekst=MINI, aendringer=(), scenarie=None):
    return raekker_fra_vaerk(flad(tekst), aendringer, scenarie)


class TestByg(unittest.TestCase):
    def test_ingen_aendringer_giver_samme_case(self):
        plan = byg(raekker())
        self.assertEqual(plan.case, yaml.safe_load(MINI))
        self.assertEqual(plan.cli, ["--data-source", "github"])
        self.assertNotIn("--set", plan.cli)

    def test_set_enable_disable_materialiseres(self):
        plan = byg(raekker(aendringer=[
            {"type": "set", "sti": "prices.straw.value", "vaerdi_json": "300.0"},
            {"type": "set", "sti": "heat_load_params.gaf_mw_per_k", "vaerdi_json": "1.1"},
            {"type": "disable", "sti": "kedel"},
            {"type": "disable", "sti": "tank"},
            {"type": "enable", "sti": "vp"},       # vp har ingen enabled-nøgle
        ]))
        c = yaml.safe_load(plan.case_yaml)
        self.assertEqual(c["prices"]["straw"]["value"], 300.0)
        self.assertEqual(c["heat_load_params"]["gaf_mw_per_k"], 1.1)   # i FILEN
        self.assertIs(c["units"]["kedel"]["enabled"], False)
        self.assertIs(c["storage"]["tank"]["enabled"], False)
        self.assertIs(c["units"]["vp"]["enabled"], True)

    def test_scenariefelter(self):
        plan = byg(raekker(scenarie={
            "periode_start": "2026-01-05", "periode_slut": "2026-01-16",
            "med_balancering": True, "balancing_method": "legacy",
            "mip_rel_gap": 0.0002, "mip_abs_gap": 0, "tidsgraense_s": 900,
            "ekstra_flag": "--legacy-nettab"}))
        self.assertEqual(plan.case["solver"],
                         {"mip_rel_gap": 0.0002, "mip_abs_gap": 0.0, "time_limit": 900.0})
        self.assertEqual(plan.cli, ["--data-source", "github", "--start", "2026-01-05",
                                    "--end", "2026-01-16", "--with-balancing",
                                    "--balancing-method", "legacy", "--legacy-nettab"])

    def test_solverblok_oprettes_naar_den_mangler(self):
        uden = MINI.replace("solver:\n  mip_rel_gap: 0.005\n", "")
        plan = byg(raekker(uden, scenarie={"tidsgraense_s": 600}))
        self.assertEqual(plan.case["solver"], {"time_limit": 600.0})

    def test_afvisninger(self):
        for aendr, scen, ord_ in [
            ([{"type": "set", "sti": "prices.straw.nyt_felt", "vaerdi_json": "1"}], None, "findes ikke"),
            ([{"type": "set", "sti": "prices.straw.value", "vaerdi_json": "1"},
              {"type": "set", "sti": "prices.straw.value", "vaerdi_json": "2"}], None, "samme sti"),
            ([], {"periode_start": "2026-01-05"}, "både start og slut"),
            ([], {"periode_start": "2026-02-01", "periode_slut": "2026-01-01"}, "før start"),
            ([], {"periode_start": "2025-01-01", "periode_slut": "2026-01-02"}, "maks 366"),
            ([], {"periode_start": "5/1-2026", "periode_slut": "2026-01-16"}, "ISO-dato"),
            ([], {"tidsgraense_s": 7200}, "tidsgrænse"),
            ([], {"ekstra_flag": "--set x=1"}, "ikke tilladt"),
            ([], {"heat_csv": "../../etc/passwd.csv"}, "filnavn"),
            ([], {"balancing_method": "x"}, "ukendt balancing_method"),
            ([], {"balancing_method": "activation_value"}, "bid_strategy"),
            ([], {"mip_rel_gap": 2}, "[0, 1)"),
        ]:
            with self.subTest(ord_=ord_):
                with self.assertRaises(InputFejl) as cm:
                    byg(raekker(aendringer=aendr, scenarie=scen))
                self.assertIn(ord_, str(cm.exception))

    def test_ukendt_enhed_og_ukendt_scenariefelt(self):
        with self.assertRaises(InputFejl):
            raekker(aendringer=[{"type": "disable", "sti": "findes_ikke"}])
        for sti in ("_koersel.hack", "heat_load_params.gaf_mw_per_k", "scenarie.mip_rel_gap"):
            r = raekker() + [{"kilde": "scenarie", "sti": sti, "vaerdi_json": "1"}]
            with self.assertRaises(InputFejl):
                byg(r)

    def test_bool_er_ikke_et_tal(self):
        with self.assertRaises(InputFejl):
            byg(raekker() + [{"kilde": "scenarie", "sti": "solver.mip_rel_gap",
                              "vaerdi_json": "true"}])

    def test_set_paa_solver_og_time_afvises(self):
        # §6c: tid og solver har særlige scenariefelter; en almindelig set afvises
        # (K2-F7: ellers kunne set time.end omgå periodegrænsen).
        for sti, v in (("solver.mip_rel_gap", "0.01"), ("time.end", '"2028-01-01T23:00:00Z"'),
                       ("time.resolution", '"15min"')):
            with self.subTest(sti=sti):
                with self.assertRaises(InputFejl) as cm:
                    byg(raekker(aendringer=[{"type": "set", "sti": sti, "vaerdi_json": v}]))
                self.assertIn("scenariets egne felter", str(cm.exception))

    def test_form_som_appens_bygFrossetInput(self):
        r = raekker(aendringer=[{"type": "disable", "sti": "kedel"}],
                    scenarie={"periode_start": "2026-01-05", "periode_slut": "2026-01-16",
                              "tidsgraense_s": 300, "ekstra_flag": "--legacy-nettab"})
        s = {(x["kilde"], x["sti"]): x["vaerdi_json"] for x in r if x["kilde"] != "vaerk"}
        self.assertEqual(s, {
            ("aendring", "units.kedel.enabled"): "false",
            ("scenarie", "_koersel.start"): '"2026-01-05"',
            ("scenarie", "_koersel.slut"): '"2026-01-16"',
            ("scenarie", "_koersel.med_balancering"): "false",
            ("scenarie", "_koersel.ekstra_flag"): '["--legacy-nettab"]',
            ("scenarie", "solver.time_limit"): "300.0",
        })

    def test_tidsgraense_i_vaerket_over_loftet_afvises(self):
        with self.assertRaises(InputFejl):
            byg(raekker(MINI.replace("mip_rel_gap: 0.005", "time_limit: 99999.0")))


class TestKontrakt21(unittest.TestCase):
    """KONTRAKT §6b (v2.1)."""

    def test_disable_og_set_paa_samme_enabled_er_dublet(self):
        r = raekker(aendringer=[{"type": "disable", "sti": "kedel"},
                                {"type": "set", "sti": "units.kedel.enabled", "vaerdi_json": "true"}])
        with self.assertRaises(InputFejl) as cm:
            byg(r)
        self.assertIn("samme sti", str(cm.exception))

    def test_profilsti_hvidliste(self):
        for sti, ok in (("data/sol.csv", True), ("/etc/sol.csv", False), ("data/../x.csv", False),
                        ("C:/sol.csv", False), ("data/sub/sol.csv", False), ("sol.csv", False)):
            t = MINI.replace("storage:\n", "  sol:\n    p_max_heat: 1.0\n"
                                           f"    production_profile_path: \"{sti}\"\nstorage:\n")
            with self.subTest(sti=sti):
                if ok:
                    byg(raekker(t))
                else:
                    with self.assertRaises(InputFejl):
                        byg(raekker(t))

    def test_andebys_rigtige_profilfil_godkendes_mod_data_mappen(self):
        if not (KODE / "data").exists():
            self.skipTest("ingen lokal kode")
        tekst = (KODE / "cases" / "andeby.yaml").read_text(encoding="utf-8")
        byg(raekker(tekst), heat_csv_rod=KODE / "data")


class TestHash(unittest.TestCase):
    def test_uafhaengig_af_raekkefoelge_og_deterministisk(self):
        r = raekker(scenarie={"mip_rel_gap": 0.0002})
        self.assertEqual(input_hash(r), input_hash(list(reversed(r))))
        self.assertEqual(len(input_hash(r)), 64)

    def test_vaerdi_som_gemt_tekst(self):
        a = [{"kilde": "vaerk", "sti": "x", "vaerdi_json": "1.0"}]
        b = [{"kilde": "vaerk", "sti": "x", "vaerdi_json": "1"}]
        self.assertNotEqual(input_hash(a), input_hash(b))

    def test_testvektor(self):
        # Samme vektor står i GRAENSEFLADE.md; appens TS-implementering skal give den.
        r = [{"kilde": "vaerk", "sti": "prices.straw.value", "vaerdi_json": "232.0"},
             {"kilde": "scenarie", "sti": "scenarie.periode_start", "vaerdi_json": '"2026-01-05"'},
             {"kilde": "aendring", "sti": "units.halmkedel.enabled", "vaerdi_json": "false"},
             {"kilde": "vaerk", "sti": "meta.titel", "vaerdi_json": '"Andeby — fiktivt"'}]
        self.assertEqual(
            input_hash(r),
            "4703b28c6d526d2914988afc788ec7ee5bc61841373bda2d5665fc750f0a0ce6")


class TestRigtigeCases(unittest.TestCase):
    def test_alle_vaerker_bygger_uaendret(self):
        cases = KODE / "cases"
        if not cases.exists():
            self.skipTest("ingen lokal kode")
        for f in sorted(cases.iterdir()):
            if f.suffix != ".yaml" or f.name.startswith("heat_load_params"):
                continue
            with self.subTest(f=f.name):
                tekst = f.read_text(encoding="utf-8")
                plan = byg(raekker(tekst), heat_csv_rod=KODE / "data")
                self.assertEqual(json.dumps(yaml.safe_load(plan.case_yaml)),
                                 json.dumps(yaml.safe_load(tekst)))

    def test_heat_csv_hvidliste_mod_data_mappen(self):
        if not (KODE / "data").exists():
            self.skipTest("ingen lokal kode")
        plan = byg(raekker(scenarie={"heat_csv": "billund_abvaerk_hourly.csv"}),
                   heat_csv_rod=KODE / "data")
        self.assertIn("data/billund_abvaerk_hourly.csv", plan.cli)
        with self.assertRaises(InputFejl):
            byg(raekker(scenarie={"heat_csv": "findes_ikke.csv"}), heat_csv_rod=KODE / "data")


if __name__ == "__main__":
    unittest.main()
