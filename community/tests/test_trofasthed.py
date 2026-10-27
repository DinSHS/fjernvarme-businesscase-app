"""Runde 8 (fv-trofast): ``--demo`` holder repo-værker på casefilen ved den pinnede commit.

Før blev et eksisterende værk aldrig rørt, så en database fra en ældre modelversion beholdt de gamle værdier
(målt i Fabric 27/10: 7 værker importeret ved b49aeb0, mens appen kørte eef950a). Nu følger et uændret repo-værk
casefilen — med samme regler som Fabric's importør — og et værk rettet i appen røres ikke.
"""

from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path

from sqlalchemy import select

import hjaelp as H


def _kopi() -> Path:
    if not (H.MODELREPO / "cases" / "andeby.yaml").is_file():
        raise unittest.SkipTest(f"modelrepoet findes ikke ({H.MODELREPO}); sæt FJV_MODELREPO")
    m = Path(tempfile.mkdtemp(prefix="fjvm_"))
    shutil.copytree(H.MODELREPO / "cases", m / "cases")
    shutil.copytree(H.MODELREPO / "data", m / "data", ignore=shutil.ignore_patterns("df-data*", "raw"))
    shutil.copy(H.MODELREPO / "README.md", m / "README.md")
    return m


class TestDemoFoelgerModelrepoet(unittest.TestCase):
    def setUp(self):
        self.m = _kopi()
        self.app = H.ny_app()
        self.db = self.app.db

    def tearDown(self):
        shutil.rmtree(self.m, ignore_errors=True)

    def _vaerdi(self, kode: str, sti: str):
        v, p = self.db.t("Vaerk"), self.db.t("VaerkParameter")
        with self.db.laes() as cn:
            r = cn.execute(select(v.c.id, v.c.revision).where(v.c.kode == kode)).first()
            val = cn.execute(select(p.c.vaerdi_json).where((p.c.vaerk_id == r.id) & (p.c.sti == sti))).scalar()
        return val, r.revision

    def test_uaendret_vaerk_foelger_casen_og_rettet_vaerk_roeres_ikke(self):
        from fjernvarme_app import demo
        stille = lambda *_: None  # noqa: E731
        foerste = {r["kode"]: r["udfald"] for r in demo.importer_cases(self.db, self.m, rap=stille)}
        self.assertEqual(set(foerste.values()), {"oprettet"}, foerste)
        # Samme filer igen: intet ændres.
        igen = {r["kode"]: r["udfald"] for r in demo.importer_cases(self.db, self.m, rap=stille)}
        self.assertEqual(set(igen.values()), {"uaendret"}, igen)
        # Modelrepoet ændrer en antagelse (CO₂-prisen i Andeby): værket følger med, og ændringen logges.
        f = self.m / "cases" / "andeby.yaml"
        tekst = f.read_text(encoding="utf-8")
        self.assertIn("value: 600.0           # [BEKRÆFT] ~80 EUR/t", tekst)
        f.write_text(tekst.replace("value: 600.0           # [BEKRÆFT] ~80 EUR/t", "value: 650.0           # [BEKRÆFT] ~80 EUR/t"),
                     encoding="utf-8", newline="\n")
        r = {x["kode"]: x for x in demo.importer_cases(self.db, self.m, rap=stille)}
        self.assertEqual(r["andeby"]["udfald"], "opdateret")
        self.assertEqual(r["billund_sporb"]["udfald"], "uaendret")
        self.assertEqual(self._vaerdi("andeby", "prices.co2_eua.value"), ("650.0", 2))
        lg = self.db.t("Aendringslog")
        with self.db.laes() as cn:
            log = cn.execute(select(lg.c.sti, lg.c.handling, lg.c.gammel_json, lg.c.ny_json).where(lg.c.revision == 2)).fetchall()
        self.assertIn(("prices.co2_eua.value", "ret", "600.0", "650.0"), [tuple(x) for x in log])
        # Revision 2 tæller som rettet (Fabric's regel): en ny ændring i modelrepoet overskriver ikke.
        f.write_text(f.read_text(encoding="utf-8").replace("value: 650.0 ", "value: 700.0 "), encoding="utf-8", newline="\n")
        r = {x["kode"]: x for x in demo.importer_cases(self.db, self.m, rap=stille)}
        self.assertEqual(r["andeby"]["udfald"], "beskyttet")
        self.assertEqual(self._vaerdi("andeby", "prices.co2_eua.value"), ("650.0", 2))


if __name__ == "__main__":
    unittest.main()
