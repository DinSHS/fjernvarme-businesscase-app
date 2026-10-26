"""pakke.py stopper, før wheel'en bygges, hvis en licenstekst mangler i ressourcerne (Codex K7-F1).

Model-, data- og tredjepartslicenserne (IBCS-graferne, hvis kode ligger i frontenden) står i offentlig/kredit.json.
Det færdige wheel kontrolleres af tjek_offentlig.py --wheel; dette er den tidlige vagt i selve byggeskriptet.
"""
from __future__ import annotations

import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

ROD = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("pakke", ROD / "community" / "pakke.py")
pakke = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pakke)
KREDIT = json.loads((ROD / "offentlig" / "kredit.json").read_text(encoding="utf-8"))


class TestLicenserIPakken(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.stage = Path(self._t.name)
        shutil.copytree(ROD / "LICENSES", self.stage / "fjernvarme_app/_ressourcer/LICENSES")

    def tearDown(self):
        self._t.cleanup()

    def test_ibcs_licensen_er_et_krav(self):
        self.assertIn("LICENSES/ibcs-web-charts_LICENSE.txt", [t["licensfil"] for t in KREDIT["tredjepart_licenser"]])

    def test_alle_licenser_til_stede_er_ok(self):
        pakke.tjek_licenser(self.stage)

    def test_manglende_ibcs_licens_stopper_bygningen(self):
        (self.stage / "fjernvarme_app/_ressourcer/LICENSES/ibcs-web-charts_LICENSE.txt").unlink()
        with self.assertRaises(SystemExit) as e:
            pakke.tjek_licenser(self.stage)
        self.assertIn("ibcs-web-charts_LICENSE.txt", str(e.exception))

    def test_manglende_modellicens_stopper_ogsaa(self):
        (self.stage / "fjernvarme_app/_ressourcer" / KREDIT["model"]["licensfil"]).unlink()
        with self.assertRaises(SystemExit):
            pakke.tjek_licenser(self.stage)


if __name__ == "__main__":
    unittest.main()
