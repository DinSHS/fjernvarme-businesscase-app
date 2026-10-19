"""fjv.resultater, fjv.dansk_tid og koersel-hjælpere mod rigtigt F1-output.

Fixturen ``tests/data/f1_andeby/`` er wrapper-output fra
``andeby.yaml --data-source github --start 2026-01-05 --end 2026-01-16`` @ b49aeb0 /
df-data 392992c (objektiv 3424407.9575291085, samme tal i Fabric).
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

HER = Path(__file__).resolve().parent
sys.path.insert(0, str(HER.parent))
from fjv import resultater as R  # noqa: E402
from fjv.dansk_tid import lokal_maaned, parse_utc, til_dansk  # noqa: E402
from fjv.koersel import _solverlog, fejlbesked_fra_log  # noqa: E402

F1 = HER / "data" / "f1_andeby"


def utc(*a):
    return datetime(*a, tzinfo=timezone.utc)


class TestDanskTid(unittest.TestCase):
    def test_sommertid_graenser_2026(self):
        # 29. marts 2026 01:00 UTC skifter til +2; 25. oktober 2026 01:00 UTC tilbage til +1.
        self.assertEqual(til_dansk(utc(2026, 3, 29, 0, 59)).hour, 1)
        self.assertEqual(til_dansk(utc(2026, 3, 29, 1, 0)).hour, 3)
        self.assertEqual(til_dansk(utc(2026, 10, 25, 0, 59)).hour, 2)
        self.assertEqual(til_dansk(utc(2026, 10, 25, 1, 0)).hour, 2)

    def test_maaned_ved_nytaar_og_maanedsskifte(self):
        self.assertEqual(lokal_maaned(utc(2025, 12, 31, 22, 59)), "2025-12")
        self.assertEqual(lokal_maaned(utc(2025, 12, 31, 23, 0)), "2026-01")   # 00:00 dansk
        self.assertEqual(lokal_maaned(utc(2026, 6, 30, 21, 59)), "2026-06")
        self.assertEqual(lokal_maaned(utc(2026, 6, 30, 22, 0)), "2026-07")    # sommertid

    def test_parse_utc_med_og_uden_z(self):
        self.assertEqual(parse_utc("2026-01-05T01:00:00Z"), utc(2026, 1, 5, 1))
        self.assertEqual(parse_utc("2026-01-05T01:00:00"), utc(2026, 1, 5, 1))
        self.assertEqual(parse_utc("2026-01-05 01:00:00+00:00"), utc(2026, 1, 5, 1))


class TestHighs(unittest.TestCase):
    def test_f1_rapport(self):
        h = R.parse_highs((F1 / "log.txt").read_text(encoding="utf-8"))
        self.assertEqual(h["highs_version"], "1.15.1")
        self.assertEqual(h["status"], "Optimal")
        self.assertAlmostEqual(h["primal_bound"], 3424407.95753, places=4)
        self.assertEqual(h["gap_pct"], 0.0)
        self.assertEqual(h["antal_rapporter"], 1)

    def test_ikke_nul_gab(self):
        h = R.parse_highs((HER / "data" / "spora_solving_report.log").read_text(encoding="utf-8"))
        self.assertAlmostEqual(h["gap_pct"], 0.0491)
        self.assertAlmostEqual(h["dual_bound"], 4696081.66858)

    def test_uendeligt_gab_og_ingen_rapport(self):
        self.assertIsNone(R.parse_highs("Solving report\n  Gap               inf\n\n")["gap_pct"])
        self.assertEqual(R.parse_highs("ingen solver her")["antal_rapporter"], 0)

    def test_sidste_rapport_vinder(self):
        log = ("Solving report\n  Primal bound      1.0\n  Gap               5% (x)\n\n"
               "Solving report\n  Primal bound      2.0\n  Gap               0.1% (x)\n\n")
        h = R.parse_highs(log)
        self.assertEqual((h["primal_bound"], h["gap_pct"], h["antal_rapporter"]), (2.0, 0.1, 2))


class TestUdtraek(unittest.TestCase):
    def setUp(self):
        self.out = R.Output(F1)
        self.reg = R.register()

    def test_noegletal(self):
        nt = {(r["gruppe"], r["objekt"], r["marked"], r["noegle"]): r["vaerdi"]
              for r in R.noegletal(self.out, self.reg)}
        self.assertEqual(nt[("objektiv", None, None, "objektiv_dkk")], 3424407.9575291085)
        self.assertEqual(nt[("enhed", "halmkedel", None, "driftsintervaller")], 288.0)
        self.assertAlmostEqual(nt[("enhed", "halmkedel", None, "fuldlasttimer")], 3448.0 / 12.0)
        # null = ikke tilgængelig, ikke 0 (MILP uden balancering)
        self.assertIsNone(nt[("lager", None, None, "tank_arbitrage_dkk")])
        self.assertIsNone(nt[("balancering", None, "afrr", "netto_dkk")])
        self.assertEqual(nt[("uc", "halmkedel", None, "starter")], 0.0)

    def test_maaneder_matcher_modellens_egne_tal(self):
        md = {(r["maaned"], r["objekt"], r["noegle"]): r["vaerdi"]
              for r in R.maaneder(self.out, self.reg)}
        # Modellens _monthly.csv (afrundet): halmkedel 3.45, last 7.04, spot 812, t -1.6
        self.assertAlmostEqual(md[("2026-01", "halmkedel", "produktion_gwh")], 3.448, places=6)
        self.assertEqual(round(md[("periode", None, "varmebehov_gwh")], 2), 7.04)
        self.assertEqual(round(md[("periode", None, "spot_middel_dkk_mwh")]), 812)
        self.assertEqual(round(md[("periode", None, "udetemp_middel_c")], 1), -1.6)
        self.assertEqual(md[("periode", None, "antal_interval")], 288.0)   # N, ikke N-1

    def test_timer_er_n_minus_1_og_utc(self):
        tm = R.timer(self.out, self.reg)
        self.assertEqual(len(tm), 287)
        self.assertEqual(tm[0]["tid"], "2026-01-05T01:00:00Z")
        self.assertLess(max(len(t["vaerdier_json"]) for t in tm), 4000)
        self.assertNotIn("heat_load_mw", json.loads(tm[0]["vaerdier_json"]))

    def test_koersel_felter(self):
        h = R.parse_highs((F1 / "log.txt").read_text(encoding="utf-8"))
        k = R.koersel_felter(self.out, h)
        self.assertEqual((k["oploesning"], k["interval_min"], k["antal_interval_model"]),
                         ("1h", 60, 288))
        self.assertEqual(k["opnaaet_gap"], 0.0)
        self.assertLess(len(k["manifest_json"]), 4000)

    def test_primal_bound_der_ikke_passer_kasserer_gabet(self):
        k = R.koersel_felter(self.out, {"primal_bound": 1.0, "gap_pct": 0.0, "dual_bound": 1.0})
        self.assertIsNone(k["opnaaet_gap"])
        self.assertIsNone(k["best_bound"])

    def test_hul_i_serie_er_en_fejl(self):
        tmp = Path(tempfile.mkdtemp())
        for f in F1.iterdir():
            shutil.copy(f, tmp / f.name)
        p = next(tmp.glob("*_fjv_fuld.csv"))
        linjer = p.read_text(encoding="utf-8").splitlines()
        felter = linjer[5].split(",")
        felter[1] = ""                                  # in.heat_demand tom i ét interval
        linjer[5] = ",".join(felter)
        p.write_text("\n".join(linjer) + "\n", encoding="utf-8")
        with self.assertRaises(R.ResultatFejl):
            R.maaneder(R.Output(tmp), self.reg)


class TestLogHjaelp(unittest.TestCase):
    def test_fejlbesked(self):
        log = "noget\nTraceback (most recent call last):\n  ...\nsrc.data_loader.CoverageError: spot/DK1 mangler\n"
        self.assertIn("CoverageError: spot/DK1 mangler", fejlbesked_fra_log(log, 1))
        self.assertIn("nyere data-SHA", fejlbesked_fra_log(log, 1))
        self.assertTrue(fejlbesked_fra_log("FEJL i casen eller --set: x\n", 2).startswith("FEJL"))
        self.assertIn("kode 3", fejlbesked_fra_log("", 3))

    def test_solverlog_uddrag(self):
        s = _solverlog((F1 / "log.txt").read_text(encoding="utf-8"))
        self.assertTrue(s.startswith("Running HiGHS"))
        self.assertIn("Solving report", s)
        self.assertNotIn("=== KPI", s)


if __name__ == "__main__":
    unittest.main()
