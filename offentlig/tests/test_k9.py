"""Codex K9 (rapporter/K9_codex.md): F2 (README's Node-krav) og F3 (installationens række-id'er).

F1 og F4 er testet i appen (app/src/sider/analyser/k9_ukendt.spec.tsx og k9_beloeb.spec.ts).
"""
import json
import re
import unittest
from pathlib import Path

ROD = Path(__file__).resolve().parents[2]
GUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)


class TestF2NodeKrav(unittest.TestCase):
    """README og FABRIC.md lover præcis den Node, lockfilens Vite kræver — ikke bredere."""

    def test_vites_krav_staar_ordret(self):
        lock = json.loads((ROD / "app" / "package-lock.json").read_text(encoding="utf-8"))
        krav = lock["packages"]["node_modules/vite"]["engines"]["node"]
        self.assertEqual(krav, "^20.19.0 || >=22.12.0", "Vites krav er ændret: ret README og doc/FABRIC.md med")
        self.assertIn(f"`{krav}`", (ROD / "README.md").read_text(encoding="utf-8"))
        self.assertIn(f"`{krav.replace('|', chr(92) + '|')}`", (ROD / "doc" / "FABRIC.md").read_text(encoding="utf-8"))

    def test_ingen_bredere_loefter(self):
        for fil in ("README.md", "doc/FABRIC.md"):
            tekst = (ROD / fil).read_text(encoding="utf-8")
            self.assertNotRegex(tekst, r"Node\.js \*\*20 eller nyere\*\*|Node\.js \| ≥ 20", fil)


class TestF3IngenRaekkeId(unittest.TestCase):
    """Demomålingerne og skærmbilledværktøjerne bærer ingen installations række-id'er."""

    FILER = (
        "viden/demo_scenarier.json",
        "app/src/sider/scenarier/_byg/skaerm.mjs",
        "app/src/sider/konfiguration/_byg/skaermbilleder.mjs",
        "app/skaermbilleder/fixturevalg.mjs",
    )

    def test_ingen_guid(self):
        for fil in self.FILER:
            self.assertEqual(GUID.findall((ROD / fil).read_text(encoding="utf-8")), [], fil)

    def test_demomaalingerne_staar_under_demokode(self):
        demo = json.loads((ROD / "viden" / "demo_scenarier.json").read_text(encoding="utf-8"))
        koder = {k["id"] for k in demo["koersler"]}
        for afsnit in ("koersel_status", "koersel_status_b49aeb0"):
            for felt, vaerdi in demo[afsnit].items():
                if isinstance(vaerdi, dict):
                    self.assertLessEqual(set(vaerdi), koder, f"{afsnit}.{felt}")
        self.assertNotIn("koersels_id", demo["koersel_status_b49aeb0"])


if __name__ == "__main__":
    unittest.main()
