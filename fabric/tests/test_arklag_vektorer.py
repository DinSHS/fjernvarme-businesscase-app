"""En celle som ``vaerdi_json`` efter feltkataloget: arbejderens udgave mod de fælles vektorer (runde 14).

Eksporten (TypeScript, ``app/src/sider/konfiguration/eksport/lag.ts``) skriver appens faner og forudsiger, hvad
importen læser tilbage; importen (``fjv.feltkatalog``) læser dem. Vektorerne i ``skema/vektorer/arklag/celler.json``
er optaget fra TypeScript-udgaven og kræver her samme udfald — samme ``vaerdi_json`` eller samme danske afvisning —
så en celle aldrig kan betyde ét i eksportens forudsigelse og noget andet i det gemte værk.
"""
import json
import unittest
from pathlib import Path

from fjv import feltkatalog as FK

VEKTORER = Path(__file__).resolve().parents[2] / "skema" / "vektorer" / "arklag" / "celler.json"


def laes_celle(sti: str, celle) -> dict:
    """Som importen: typen fra kataloget, derefter feltets regler (en redigering i appen)."""
    try:
        j = FK.fra_celle(sti, celle)
    except FK.FeltFejl as e:
        return {"fejl": str(e)}
    grund = FK.tjek(sti, j)
    return {"fejl": grund} if grund else {"json": j}


class Vektorer(unittest.TestCase):
    def test_samme_udfald_som_eksportens_typescript(self):
        tilfaelde = json.loads(VEKTORER.read_text(encoding="utf-8"))["tilfaelde"]
        self.assertGreater(len(tilfaelde), 90)
        godtaget = afvist = 0
        for t in tilfaelde:
            with self.subTest(sti=t["sti"], celle=t["celle"]):
                self.assertEqual(laes_celle(t["sti"], t["celle"]), t["ud"])
            godtaget += "json" in t["ud"]
            afvist += "fejl" in t["ud"]
        self.assertGreater(godtaget, 50)
        self.assertGreater(afvist, 20)


if __name__ == "__main__":
    unittest.main()
