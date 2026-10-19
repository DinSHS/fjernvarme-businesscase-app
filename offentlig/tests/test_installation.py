"""scripts/installation.py: paafoer installationens vaerdier paa de to filer, Rayfin-bygget kraever, og fjern dem igen.

`konfig.ts` (Rayfin Functions' faste koordinater) og `rayfin.yml` (redirect-adresser) er SPORET i repoet med tomme vaerdier/pladsholdere.
`paafoer` skriver installationens vaerdier ind LOKALT og saetter git `skip-worktree`, saa de aldrig kan committes ved en fejl;
`fjern` ruller tilbage. Gaten (scripts/tjek.py) er bagstopperen, hvis nogen alligevel gaar uden om det.
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROD = Path(__file__).resolve().parents[2]
SCRIPT = ROD / "scripts" / "installation.py"
GIT = subprocess.run(["git", "--version"], capture_output=True).returncode == 0

WS = "abcdef12-3456-4789-8abc-" + "def012345678"
LH = "12345abc-6789-4def-8012-" + "3456789abcde"
INST = {"workspace_navn": "Testens Workspace", "workspace_id": WS, "lakehouse_navn": "fjv_lakehouse", "lakehouse_id": LH,
        "sql_server": "testserver-" + "abcdefgh12345678.database.fabric.microsoft.com", "sql_database": "testdb-" + "ab12cd34",
        "notebooks": {"koer_scenarie": "f0f0aaaa-1111-4222-8333-" + "444455556666", "importer_vaerksark": "f1f1aaaa-1111-4222-8333-" + "444455556666"},
        "app": {"redirect_uris": ["https://" + "min-test-app-b46947b23b." + "webapp.fabricapps.net"]}}
KONFIG = "app/rayfin/functions/src/konfig.ts"
YML = "app/rayfin/rayfin.yml"


def git(rod, *a, check=True):
    r = subprocess.run(["git", "-C", str(rod), *a], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
    if check and r.returncode != 0:
        raise AssertionError(f"git {a}: {r.stderr}")
    return r.stdout.strip()


class Installation(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.addCleanup(self._t.cleanup)
        self.rod = Path(self._t.name) / "repo"
        for rel in (KONFIG, YML, "config/installation.eksempel.json", "scripts/installation.py"):
            d = self.rod / rel
            d.parent.mkdir(parents=True, exist_ok=True)
            d.write_bytes((ROD / rel).read_bytes().replace(b"\r\n", b"\n"))
        (self.rod / ".gitignore").write_text("config/installation.json\n", encoding="utf-8")
        self.cfg = self.rod / "config" / "installation.json"
        self.cfg.write_text(json.dumps(INST), encoding="utf-8")
        if GIT:
            git(self.rod, "init", "-q", "-b", "main")
            git(self.rod, "add", "-A")
            git(self.rod, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "start")

    def kor(self, *args):
        return subprocess.run([sys.executable, "-I", str(self.rod / "scripts" / "installation.py"), *args], capture_output=True,
                              text=True, encoding="utf-8", errors="replace", timeout=120, cwd=self._t.name)

    def konfig(self):
        return (self.rod / KONFIG).read_text(encoding="utf-8")

    def test_eksemplet_er_et_gyldigt_skelet_uden_rigtige_vaerdier(self):
        e = json.loads((ROD / "config/installation.eksempel.json").read_text(encoding="utf-8"))
        for nogle in ("workspace_navn", "workspace_id", "lakehouse_navn", "lakehouse_id", "sql_server", "sql_database", "notebooks", "app"):
            self.assertIn(nogle, e)
        import re
        self.assertEqual(re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", json.dumps(e), re.I), [])

    def test_paafoer_skriver_vaerdierne_ind_og_roerer_intet_andet(self):
        foer = self.konfig()
        r = self.kor("paafoer")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        k = self.konfig()
        self.assertIn(f'export const WORKSPACE_ID = "{WS}";', k)
        self.assertIn(f'export const LAKEHOUSE_ID = "{LH}";', k)
        self.assertIn(f'export const SQL_SERVER = "{INST["sql_server"]}";', k)
        self.assertIn(f'export const SQL_DATABASE = "{INST["sql_database"]}";', k)
        self.assertIn(f'export const ARBEJDER_NOTEBOOK_ID = "{INST["notebooks"]["koer_scenarie"]}";', k)
        self.assertIn(f'export const IMPORTER_NOTEBOOK_ID = "{INST["notebooks"]["importer_vaerksark"]}";', k)
        # det faste og de kommentarer er uaendrede
        self.assertIn('export const MOTOR_ID = "00000000-0000-4000-8000-00000000f001";', k)
        self.assertIn('export const FABRIC_API = "https://api.fabric.microsoft.com/v1";', k)
        self.assertEqual(foer.count("\n"), k.count("\n"))
        yml = (self.rod / YML).read_text(encoding="utf-8")
        self.assertIn(INST["app"]["redirect_uris"][0], yml)
        self.assertIn("http://localhost:5173", yml)

    def test_paafoer_er_idempotent(self):
        self.kor("paafoer")
        a = (self.konfig(), (self.rod / YML).read_text(encoding="utf-8"))
        r = self.kor("paafoer")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(a, (self.konfig(), (self.rod / YML).read_text(encoding="utf-8")))

    @unittest.skipUnless(GIT, "git findes ikke")
    def test_de_paafoerte_filer_staar_ikke_som_aendrede_i_git(self):
        self.kor("paafoer")
        self.assertEqual(git(self.rod, "status", "--porcelain"), "")
        self.assertIn("S ", git(self.rod, "ls-files", "-v", KONFIG))   # skip-worktree-flag

    @unittest.skipUnless(GIT, "git findes ikke")
    def test_fjern_ruller_tilbage_til_det_committede(self):
        foer = self.konfig()
        yml = (self.rod / YML).read_text(encoding="utf-8")
        self.kor("paafoer")
        r = self.kor("fjern")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.konfig(), foer)
        self.assertEqual((self.rod / YML).read_text(encoding="utf-8"), yml)
        self.assertNotIn(WS, self.konfig())
        self.assertIn("H ", git(self.rod, "ls-files", "-v", KONFIG))

    def test_uden_installation_stopper_paafoer_med_henvisning(self):
        self.cfg.unlink()
        r = self.kor("paafoer")
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn("FABRIC.md", r.stdout + r.stderr)
        self.assertNotIn(WS, self.konfig())

    def test_paafoer_kraever_felterne_til_functions(self):
        self.cfg.write_text(json.dumps({k: v for k, v in INST.items() if k != "sql_database"}), encoding="utf-8")
        r = self.kor("paafoer")
        self.assertEqual(r.returncode, 2)
        self.assertIn("sql_database", r.stdout + r.stderr)
        self.assertNotIn(WS, self.konfig())   # alt eller intet: der skrives ikke halvt

    def test_en_pladsholder_i_et_paakraevet_felt_afvises(self):
        self.cfg.write_text(json.dumps(dict(INST, sql_server="<DIN-SQL-SERVER>.database.fabric.microsoft.com")), encoding="utf-8")
        r = self.kor("paafoer")
        self.assertEqual(r.returncode, 2)
        self.assertIn("sql_server", r.stdout + r.stderr)

    def test_vis_maskerer_id_er(self):
        r = self.kor("vis")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn(WS, r.stdout)
        self.assertIn(WS[:8], r.stdout)
        self.assertIn("Testens Workspace", r.stdout)

    def test_rayfin_up_tor_viser_kommandoen_med_workspace_fra_installationen(self):
        r = self.kor("rayfin-up", "--tor")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn(f"npx rayfin up --workspace-id {WS}", r.stdout)
        self.assertIn("TOER", r.stdout)

    def test_rayfin_db_apply_tor(self):
        r = self.kor("rayfin-db-apply", "--tor")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("npx rayfin up db apply", r.stdout)

    def test_ukendt_kommando_er_en_brugsfejl(self):
        self.assertEqual(self.kor("noget-andet").returncode, 2)


if __name__ == "__main__":
    unittest.main()
