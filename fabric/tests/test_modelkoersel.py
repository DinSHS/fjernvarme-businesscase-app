"""fjv.modelkoersel: modelrepoets egne kørselskommandoer for en case (runde 8). Kun stdlib, ingen modelrepo."""

import unittest

from fjv import modelkoersel as MK

CASE = """# ==========
# KØRES MED (vindue fra time:-blokken):
#   python run_case.py cases/x_spor.yaml \\
#       --data-source github --with-balancing \\
#       --heat-csv data/x_maalt.csv
# Nedarvet fra en anden case (tæller ikke):
#   python run_case.py cases/x_backtest.yaml --data-source github \\
#       --heat-csv data/x_gammel.csv
meta:
  case_name: x_spor   # python run_case.py cases/x_spor.yaml står også i en inline-kommentar
"""
README = """| case | vindue | objektiv | kommando |
|---|---|---:|---|
| X-anker | marts | **1.234.567** | `python run_case.py cases/x_anker.yaml --data-source github --with-balancing` |
| X spor | marts | **7.654** | `python run_case.py cases/x_spor.yaml --data-source github --with-balancing --heat-csv data/x_maalt.csv` |
"""


class TestModelkoersel(unittest.TestCase):
    def test_casens_egen_kommando_med_fortsaettelseslinjer(self):
        ks = MK.kommandoer("x_spor.yaml", CASE, README)
        self.assertEqual([k["kilde"] for k in ks], ["cases/x_spor.yaml:3-5", "README.md:4"])
        st = MK.standard(ks)
        self.assertEqual((st["med_balancering"], st["heat_csv"], st["kilde"]), (True, "x_maalt.csv", "cases/x_spor.yaml:3-5"))
        self.assertEqual(ks[1]["objektiv_dkk"], 7654)
        self.assertEqual(MK.varmelastfiler(ks), ["x_maalt.csv"])   # aldrig x_gammel.csv fra den anden case

    def test_kun_readme(self):
        ks = MK.kommandoer("x_anker.yaml", "meta:\n  case_name: x_anker\n", README)
        st = MK.standard(ks)
        self.assertEqual((st["kilde"], st["med_balancering"], st["heat_csv"], st["navn"], st["objektiv_dkk"]),
                         ("README.md:3", True, None, "X-anker", 1234567))

    def test_ingen_kommando_er_ingen_standard(self):
        ks = MK.kommandoer("x_ny.yaml", CASE, README)
        self.assertEqual(ks, [])
        self.assertIsNone(MK.standard(ks))
        self.assertEqual(MK.varmelastfiler(ks), [])

    def test_flag(self):
        k = MK.kommandoer("x.yaml", "#   python run_case.py cases/x.yaml --data-source github --start 2026-01-05 "
                                    "--end 2026-01-16 --balancing-method legacy --legacy-nettab\n")[0]
        self.assertEqual((k["med_balancering"], k["start"], k["slut"], k["balancing_method"], k["ekstra"]),
                         (False, "2026-01-05", "2026-01-16", "legacy", ["--legacy-nettab"]))

    # --- Codex K8 F5: streng tilstand (spejlet og gaten) ---------------------------------------------------
    TABEL = {"--data-source": 1, "--with-balancing": 0, "--heat-csv": 1, "--start": 1, "--end": 1,
             "--legacy-nettab": 0, "--balancing-method": 1, "--out-dir": 1}

    def test_streng_ukanonisk_fortolker_er_en_fejl(self):
        t = "#   python3 run_case.py cases/x.yaml --data-source github\n"
        self.assertEqual(len(MK.kommandoer("x.yaml", t)), 1)                     # motoren: lempelig
        with self.assertRaisesRegex(MK.KommandoFejl, r"cases/x\.yaml:1: kommandoen kan ikke fortolkes"):
            MK.kommandoer("x.yaml", t, streng=True, tabel=self.TABEL)

    def test_streng_ukendt_flag_og_manglende_vaerdi(self):
        with self.assertRaisesRegex(MK.KommandoFejl, r"ukendt flag --turbo"):
            MK.kommandoer("x.yaml", "#   python run_case.py cases/x.yaml --turbo\n", streng=True, tabel=self.TABEL)
        with self.assertRaisesRegex(MK.KommandoFejl, r"--heat-csv mangler sin værdi"):
            MK.kommandoer("x.yaml", "#   python run_case.py cases/x.yaml --heat-csv --with-balancing\n",
                          streng=True, tabel=self.TABEL)

    def test_alle_flag_gemmes_og_det_appen_ikke_oversaetter_er_ekstra(self):
        k = MK.kommandoer("x.yaml", "#   python run_case.py cases/x.yaml --data-source github --legacy-nettab --out-dir ud\n",
                          streng=True, tabel=self.TABEL)[0]
        self.assertEqual(k["flag"], [["--data-source", "github"], ["--legacy-nettab", None], ["--out-dir", "ud"]])
        self.assertEqual(k["ekstra"], ["--legacy-nettab"])                       # --out-dir har ingen betydning
        self.assertEqual(MK.ikke_oversat(k), ["--legacy-nettab"])

    def test_readme_naevner_filen_uden_kommando(self):
        r = "| fil | indhold |\n|---|---|\n| KOERSEL | alle flag til `run_case.py`, output |\n"
        self.assertEqual(MK.kommandoer("x.yaml", "", r, streng=True, tabel=self.TABEL), [])

    def test_flagtabel_fra_run_case(self):
        t = ("import argparse\np = argparse.ArgumentParser()\np.add_argument('case')\n"
             "p.add_argument('--with-balancing', action='store_true')\np.add_argument('--heat-csv', type=str)\n")
        self.assertEqual(MK.flagtabel(t), {"--with-balancing": 0, "--heat-csv": 1})


if __name__ == "__main__":
    unittest.main()
