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


if __name__ == "__main__":
    unittest.main()
