"""Python-siden af vektorerne UDTRUKKET af TS-testene (skema/vektorer/fra_ts_testene/, se udtraek.mjs).

Kører Python-porten (community/fjernvarme_app/logik) på præcis de kald, de håndskrevne TS-tests laver —
Codex' modprøver, målte hashes, K4/K5-tilfældene — og kræver TS' udfald, inkl. de danske afvisningstekster.
Kaldsformen pr. gruppe genbruges fra fv-port's test_vektorer.py (KALD), så den findes ét sted.

    python -m unittest discover -s skema/test        (springes over, hvis community/ ikke findes)
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

HER = Path(__file__).resolve().parent
ROD = HER.parents[1]
MAPPE = ROD / "skema" / "vektorer" / "fra_ts_testene"
COMMUNITY = ROD / "community"

try:
    sys.path.insert(0, str(COMMUNITY))
    from fjernvarme_app.logik.tests import test_vektorer as TV  # noqa: E402
    GRUND = None
except ImportError as e:  # den offentlige eksport kan mangle community/ — sig det højt
    TV, GRUND = None, f"community/fjernvarme_app/logik findes ikke ({e}); Python-porten er IKKE testet mod TS-testene"


@unittest.skipIf(TV is None, GRUND or "")
class TsTestenesTilfaelde(unittest.TestCase):
    maxDiff = None

    def grupper(self):
        return sorted(MAPPE.glob("*.json"))

    def test_der_er_vektorer(self):
        self.assertGreaterEqual(len(self.grupper()), 10, "kør: cd app && node ../skema/vektorer/udtraek.mjs")

    def test_hver_gruppe_kan_kaldes_i_python(self):
        for f in self.grupper():
            self.assertTrue(f.stem in TV.KALD or f.stem == "tal", f"{f.stem}: ingen Python-kaldsform i test_vektorer.KALD")

    def test_python_giver_ts_udfaldet(self):
        fejl, i_alt = [], 0
        for f in self.grupper():
            d = json.loads(f.read_text(encoding="utf-8"), object_hook=TV._dekod)
            for t in d["tilfaelde"]:
                i_alt += 1
                if (f.stem, t["navn"]) in TV.KENDTE_AFVIGELSER:
                    continue
                if f.stem == "tal":
                    x = t["input"]["x"]
                    if TV.J.js_str(x) != t["ud"]["streng"]:
                        fejl.append(f"[tal] String({x!r}): TS {t['ud']['streng']!r}, Python {TV.J.js_str(x)!r}")
                    forskel = TV.samme(t["ud"]["somFloat"], TV.koer(lambda: TV.R.som_float(x)))
                else:
                    forskel = TV.samme(t, TV.koer(lambda: TV.KALD[f.stem](t["input"])))
                if forskel:
                    fejl.append(f"[{f.stem}] {t['navn']}\n    {forskel}")
        self.assertFalse(fejl, f"{len(fejl)} af {i_alt} tilfælde fra TS-testene afviger:\n" + "\n".join(fejl[:20]))


if __name__ == "__main__":
    unittest.main()
