"""Modellens minimumskrav i arbejderen (``fjv.modelkrav``, runde 14) mod de fælles vektorer.

Vektorerne (``skema/vektorer/tjek_modelkrav.json``) er optaget fra TypeScript-udgaven (``tjekModelkrav``) og
binder allerede Python-udgaven i ``community/``. Arbejderens udgave er den tredje; den skal give samme udfald og
samme besked for hvert tilfælde — ellers ville et værk fra værksarket kunne afvises af importen og godtages af
appen (eller omvendt).
"""
import json
import unittest
from pathlib import Path

from fjv import modelkrav as MK

VEKTORER = Path(__file__).resolve().parents[2] / "skema" / "vektorer" / "tjek_modelkrav.json"


class Vektorer(unittest.TestCase):
    def test_samme_udfald_og_besked_som_appens_tjek(self):
        tilfaelde = json.loads(VEKTORER.read_text(encoding="utf-8"))["tilfaelde"]
        self.assertGreater(len(tilfaelde), 50)
        godtaget = afvist = 0
        for t in tilfaelde:
            with self.subTest(t["navn"]):
                if "fejl" in t:
                    # En programfejl i TS (fx ugyldig JSON): arbejderen må heller ikke godtage værket.
                    with self.assertRaises(Exception):
                        MK.tjek(t["input"]["blade"])
                    continue
                if "afvisning" in t:
                    with self.assertRaises(MK.ModelkravFejl) as c:
                        MK.tjek(t["input"]["blade"])
                    self.assertEqual(str(c.exception), t["afvisning"])
                    afvist += 1
                else:
                    MK.tjek(t["input"]["blade"])
                    godtaget += 1
        self.assertGreater(godtaget, 10)
        self.assertGreater(afvist, 10)

    def test_dict_og_liste_giver_det_samme(self):
        blade = json.loads(VEKTORER.read_text(encoding="utf-8"))["tilfaelde"][0]["input"]["blade"]
        self.assertEqual(MK.fejl(blade), MK.fejl({b["sti"]: b["vaerdi_json"] for b in blade}))


if __name__ == "__main__":
    unittest.main()
