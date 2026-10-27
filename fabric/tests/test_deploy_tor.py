"""deploy.py: laeser installationen fra den lokale config/installation.json (aldrig fra koden), og kan koeres TOERT (--tor).

En toerkoersel udfoerer INTET: ingen `fab`, ingen upload, ingen import, intet jobstart - den skriver hver kommando, den ville have
koert. Beviset er at `fab` ikke engang findes paa PATH i testen.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

FABRIC = Path(__file__).resolve().parents[1]
DEPLOY = FABRIC / "deploy.py"

WS = "abcdef12-3456-4789-8abc-" + "def012345678"
LH = "12345abc-6789-4def-8012-" + "3456789abcde"
INST = {"workspace_navn": "Testens Workspace", "workspace_id": WS, "lakehouse_navn": "fjv_lakehouse", "lakehouse_id": LH,
        "sql_server": "testserver-" + "abcdefgh12345678.database.fabric.microsoft.com", "sql_database": "testdb-" + "ab12cd34",
        "notebooks": {"koer_scenarie": "", "importer_vaerksark": ""}}


class TestDeployTor(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.addCleanup(self._t.cleanup)
        self.cfg = Path(self._t.name) / "installation.json"
        self.cfg.write_text(json.dumps(INST), encoding="utf-8")

    def kor(self, *args, cfg=None, env_ekstra=None):
        env = {"FJV_INSTALLATION": str(cfg or self.cfg), "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""), "PATH": "",
               "PYTHONUTF8": "1"}
        env.update(env_ekstra or {})
        return subprocess.run([sys.executable, "-I", str(DEPLOY), *args], capture_output=True, text=True, encoding="utf-8",
                              errors="replace", timeout=300, env=env, cwd=self._t.name)

    def test_tor_kode_viser_hver_upload_og_koerer_ingen_fab(self):
        r = self.kor("--tor", "kode")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        moduler = sorted(p.name for p in (FABRIC / "fjv").iterdir() if p.suffix == ".py")
        for m in moduler:
            self.assertIn(f"Testens Workspace.Workspace/fjv_lakehouse.Lakehouse/Files/fjv/motor/fjv/{m}", r.stdout, m)
        self.assertIn("maaleregister.json", r.stdout)
        self.assertIn("TOER-KOERSEL", r.stdout)

    def test_tor_notebook_bygger_lokalt_og_viser_importen(self):
        r = self.kor("--tor", "notebook", "fjv_koer_scenarie")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("fab import Testens Workspace.Workspace/fjv_koer_scenarie.Notebook", r.stdout)

    def test_tor_koer_viser_jobbet_uden_at_starte_det(self):
        r = self.kor("--tor", "koer", "fjv_selvtest")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("fab job run Testens Workspace.Workspace/fjv_selvtest.Notebook", r.stdout)

    def test_db_skriver_bindingen_fra_installationen(self):
        r = self.kor("--tor", "db")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("Files/fjv/konfig/db.json", r.stdout)
        binding = json.loads(r.stdout.split("db.json-indhold: ", 1)[1].splitlines()[0])
        self.assertEqual(binding, {"server": INST["sql_server"] + ",1433", "database": INST["sql_database"]})

    def test_db_bevarer_en_eksplicit_port(self):
        self.cfg.write_text(json.dumps(dict(INST, sql_server=INST["sql_server"] + ",1444")), encoding="utf-8")
        r = self.kor("--tor", "db")
        self.assertIn(INST["sql_server"] + ",1444", r.stdout)
        self.assertNotIn(",1444,1433", r.stdout)

    def test_db_uden_sql_felter_stopper_med_en_forklaring(self):
        self.cfg.write_text(json.dumps({k: v for k, v in INST.items() if not k.startswith("sql_")}), encoding="utf-8")
        r = self.kor("--tor", "db")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("sql_server", r.stdout + r.stderr)

    def test_uden_installation_stopper_deploy_med_henvisning_til_fabric_md(self):
        r = self.kor("--tor", "kode", cfg=Path(self._t.name) / "findes-ikke.json")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("doc/FABRIC.md", r.stdout + r.stderr)

    def test_en_pladsholder_er_ikke_en_installation(self):
        self.cfg.write_text(json.dumps(dict(INST, workspace_id="<DIT-WORKSPACE-ID>")), encoding="utf-8")
        r = self.kor("--tor", "kode")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("workspace_id", r.stdout + r.stderr)

    def test_koden_indeholder_ingen_installationsvaerdier(self):
        # Koden er delt; værdierne er lokale. Ingen hardkodet workspace-navn i udrulningsværktøjerne.
        for navn in ("deploy.py", "byg.py", "fabric_miljoe.py"):
            t = (FABRIC / navn).read_text(encoding="utf-8")
            self.assertNotRegex(t, r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", navn)


if __name__ == "__main__":
    unittest.main()
