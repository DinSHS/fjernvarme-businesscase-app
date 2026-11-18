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
    """Importens regel (``FK.laes_celle``): tom, (findes ikke), værdien eller grunden."""
    return FK.laes_celle(sti, celle)


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
        # Runde 14, rettelser: tom og (findes ikke) betyder hver sin ting, og danske etiketter læses på koden.
        self.assertTrue(any("tom" in t["ud"] for t in tilfaelde))
        self.assertTrue(any("fjern" in t["ud"] for t in tilfaelde))
        self.assertTrue(any(isinstance(t["celle"], str) and t["celle"].endswith(")") and "json" in t["ud"] for t in tilfaelde))


FANER = VEKTORER.with_name("faner.json")


class Faneform(unittest.TestCase):
    """Codex' andet review: en række, der ligner en overskrift, men ikke er en blok, afvises ens i browseren
    (``ukendteOverskrifter``) og i importen (``fjv.arklag.ukendte_overskrifter``). Vektorerne indeholder Andebys
    rigtige eksport (ingen må afvises) og de former, der skal (bl.a. Øvrige felter fra før rettelserne)."""

    def test_samme_ukendte_overskrifter_som_browseren(self):
        from fjv import arklaes as AL
        from fjv import arklag as LAG
        tilfaelde = json.loads(FANER.read_text(encoding="utf-8"))["tilfaelde"]
        for t in tilfaelde:
            c = {}
            for ref, v in t["celler"].items():
                kol = ref.rstrip("0123456789")
                c[(int(ref[len(kol):]), AL.kolonne_nr(kol))] = v
            with self.subTest(navn=t["navn"], fane=t["fane"]):
                ud = [{"ref": AL.ref(r, k), "ældre": a} for r, k, a in LAG.ukendte_overskrifter(t["fane"], c)]
                self.assertEqual(ud, t["ud"])
        eksport = [t for t in tilfaelde if t["navn"] == "Andebys eksport"]
        self.assertEqual({t["fane"] for t in eksport}, set(LAG.FANER))
        self.assertTrue(all(t["ud"] == [] for t in eksport))
        self.assertTrue(any(u["ældre"] for t in tilfaelde for u in t["ud"]))


if __name__ == "__main__":
    unittest.main()
