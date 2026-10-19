"""Repo-gaten (scripts/tjek.py): intet organisationsspecifikt maa kunne committes ved en fejl.

Repoet er KILDEN. Det, der er specifikt for en installation (workspace-, lakehouse-, database-, notebook-id'er, servernavne,
redirect-adresser, organisationsnavne), staar i lokale, git-ignorerede filer: `config/installation.json` og (valgfrit)
`config/forbud.lokal.json`. Gaten henter forbudslisten fra tre steder: den generiske liste i repoet
(`offentlig/forbud.generisk.json`), den lokale liste, og VAERDIERNE i den lokale installation - saa et nyt id aldrig kan glippe.
"""
import json
import subprocess
import sys
import unittest
from pathlib import Path

from offentlig.tests.test_tjek_offentlig import KREDIT, REGLER, ROD, Taeppe, lav_produkt, skriv
import tjek_offentlig as T

GIT = subprocess.run(["git", "--version"], capture_output=True).returncode == 0
WS = "abcdef12-3456-4789-8abc-" + "def012345678"
LH = "12345abc-6789-4def-8012-" + "3456789abcde"
SERVER = "a1b2c3d4e5f6a7b8c9d0e1f2g3-h4i5j6k7l8m9n0o1p2q3r4s5t6"   # kun som tekst; aldrig et rigtigt servernavn
HOST = SERVER + ".database." + "fabric.microsoft.com"
GENERISK = ROD / "offentlig" / "forbud.generisk.json"


def git(rod, *a, check=True, indata=None):
    r = subprocess.run(["git", "-C", str(rod), *a], capture_output=True, text=True, encoding="utf-8", errors="replace",
                       input=indata, timeout=60)
    if check and r.returncode != 0:
        raise AssertionError(f"git {a}: {r.stderr}")
    return r.stdout.strip()


EKSEMPEL = {"workspace_navn": "<DIT-WORKSPACE-NAVN>", "workspace_id": "<DIT-WORKSPACE-ID>", "lakehouse_navn": "fjv_lakehouse",
            "lakehouse_id": "<DIT-LAKEHOUSE-ID>", "sql_server": "<DIN-SQL-SERVER>.database.fabric.microsoft.com",
            "sql_database": "<DIN-SQL-DATABASE>", "notebooks": {"koer_scenarie": "<ID>"}}
INSTALLATION = {"workspace_navn": "Mit Workspace Navn", "workspace_id": WS, "lakehouse_navn": "fjv_lakehouse", "lakehouse_id": LH,
                "sql_server": HOST, "sql_database": "min-database-" + "7777abcd", "notebooks": {"koer_scenarie": "f0f0aaaa-1111-4222-8333-" + "444455556666"}}


class Repo(Taeppe):
    """Et lille repo med generisk liste, eksempel-konfiguration og en lokal installation (git-ignoreret)."""

    def setUp(self):
        super().setUp()
        lav_produkt(self.rod)
        skriv(self.rod, "offentlig/regler.json", json.dumps(dict(REGLER, respekter_gitignore=True)))
        skriv(self.rod, "offentlig/forbud.generisk.json", GENERISK.read_bytes())
        skriv(self.rod, ".gitignore", "config/installation.json\nconfig/forbud.lokal.json\n")
        skriv(self.rod, "config/installation.eksempel.json", json.dumps(EKSEMPEL))
        skriv(self.rod, "config/installation.json", json.dumps(INSTALLATION))
        skriv(self.rod, "app/src/a.ts", "export const a = 1;\n")
        if GIT:
            git(self.rod, "init", "-q", "-b", "main")

    def gaten(self, **kw):
        return T.koer_repo(self.rod, REGLER, KREDIT, **kw)

    def fejl(self, **kw):
        return [(f.regel, f.fil) for f in self.gaten(**kw).funde if f.niveau == "fejl"]


class TestVaerdierFraInstallationen(Repo):
    def test_vaerdierne_samles_men_ikke_pladsholdere_og_ikke_offentlige_standarder(self):
        v = T.installation_vaerdier(self.rod)
        self.assertEqual({WS, LH, HOST, "Mit Workspace Navn", "min-database-7777abcd", "f0f0aaaa-1111-4222-8333-444455556666"}, set(v))
        self.assertNotIn("fjv_lakehouse", v)   # ens med eksemplet = offentlig

    def test_ingen_installation_giver_ingen_vaerdier(self):
        (self.rod / "config/installation.json").unlink()
        self.assertEqual(T.installation_vaerdier(self.rod), set())

    def test_en_skadet_installationsfil_er_en_brugsfejl_ikke_en_stille_ingenting(self):
        (self.rod / "config/installation.json").write_text("{ikke json", encoding="utf-8")
        with self.assertRaises(T.BrugsFejl):
            T.installation_vaerdier(self.rod)

    def test_korte_vaerdier_ignoreres(self):
        skriv(self.rod, "config/installation.json", json.dumps(dict(INSTALLATION, lakehouse_navn="x", tom="")))
        self.assertNotIn("x", T.installation_vaerdier(self.rod))


class TestForbudAfRepo(Repo):
    def test_et_rent_repo_bestaar(self):
        self.assertEqual(self.fejl(), [])

    def test_en_installationsvaerdi_i_en_sporet_fil_er_en_fejl(self):
        skriv(self.rod, "fabric/x.py", f'WORKSPACE = "{WS}"\n')
        self.assertEqual(self.fejl(), [("installation", "fabric/x.py")])
        skriv(self.rod, "fabric/x.py", "# Mit Workspace Navn\n")
        self.assertEqual(self.fejl(), [("installation", "fabric/x.py")])      # ogsaa et navn, uanset store/smaa bogstaver

    def test_selve_den_lokale_konfiguration_scannes_ikke(self):
        # git-ignoreret = ikke kildekode; den MAA indeholde vaerdierne
        self.assertEqual(self.fejl(), [])

    def test_eksempelfilen_med_pladsholdere_er_i_orden(self):
        self.assertIn("config/installation.eksempel.json", self.gaten().offentlige)

    def test_lokal_forbudsliste_tilfoejer_navne(self):
        skriv(self.rod, "config/forbud.lokal.json", json.dumps({"litteraler": [{"vaerdi": "hemmeligfirma", "regel": "organisation", "forklaring": "lokal"}]}))
        skriv(self.rod, "app/src/b.ts", "// hos hemmeligfirma\n")
        self.assertEqual(self.fejl(), [("organisation", "app/src/b.ts")])

    def test_generisk_liste_afviser_servernavne_stier_og_hosts(self):
        skriv(self.rod, "a.md", f"server {HOST}\n")
        skriv(self.rod, "b.md", "sti " + "C:" + "\\Users" + "\\bob\\x\n")
        skriv(self.rod, "c.md", "app https://" + "min-app-b46947b23b-westeurope." + "webapp.fabricapps.net/\n")
        skriv(self.rod, "d.md", "kilde " + "oa" + "/fjv" + "/briefs/K.md\n")
        skriv(self.rod, "e.md", "mail x@" + "firma.onmicrosoft" + ".com\n")
        self.assertEqual(sorted(f for _, f in self.fejl()), ["a.md", "b.md", "c.md", "d.md", "e.md"])

    def test_pladsholdere_og_example_er_tilladt(self):
        skriv(self.rod, "a.md", "server <DIN-SQL-SERVER>.database.fabric.microsoft.com og https://<din-app>.webapp.fabricapps.net\n"
                                "mail pia@example.com\n")
        self.assertEqual(self.fejl(), [])

    def test_generisk_liste_afviser_lokale_filer_og_temaer(self):
        for rel in ("app/src/styles/temaer/privat/x.json", "app/rayfin/.deployments.json", "config/installation.json"):
            with self.subTest(rel=rel):
                self.assertTrue(any(T.glob_match(m["moenster"], rel, True)
                                    for m in json.loads(GENERISK.read_text(encoding="utf-8"))["forbudte_filnavne"]), rel)

    def test_generisk_liste_indeholder_ingen_rigtige_id_er_og_ingen_organisationsnavne(self):
        t = GENERISK.read_text(encoding="utf-8")
        self.assertEqual([g for g in T.GUID_RX.findall(t) if not T.er_syntetisk(g)], [])
        for ord_ in ("din" + "forsyning", "esbjerg" + "forsyning", "vandcenter" + "syd", "Dansk Fjern" + "varme tema"):
            self.assertNotIn(ord_.lower(), t.lower())
        T.oversaet_forbud(json.loads(t))   # alle moenstre kompilerer

    def test_krav_gaelder_stadig_i_repoet(self):
        (self.rod / "CREDITS.md").unlink()
        self.assertIn("krav-credits", {r for r, _ in self.fejl()})


@unittest.skipUnless(GIT, "git findes ikke")
class TestFilsaetFraGit(Repo):
    def test_kun_det_git_kender_scannes(self):
        skriv(self.rod, "ignoreret.txt", f"{WS}\n")
        skriv(self.rod, ".gitignore", "config/installation.json\nignoreret.txt\n")
        skriv(self.rod, "ny.txt", "ren\n")
        g = self.gaten()
        self.assertNotIn("ignoreret.txt", g.offentlige)
        self.assertIn("ny.txt", g.offentlige)
        self.assertEqual(self.fejl(), [])


@unittest.skipUnless(GIT, "git findes ikke")
class TestStaged(Repo):
    def stage(self, rel, tekst):
        skriv(self.rod, rel, tekst)
        git(self.rod, "add", rel)

    def test_staged_laeser_indekset_ikke_arbejdsmappen(self):
        self.stage("fabric/x.py", f'WS = "{WS}"\n')
        skriv(self.rod, "fabric/x.py", "# renset efter staging\n")      # arbejdsmappen er ren, indekset ikke
        self.assertEqual(self.fejl(staged=True), [("installation", "fabric/x.py")])

    def test_staged_ignorerer_det_der_ikke_er_staget(self):
        skriv(self.rod, "fabric/y.py", f'WS = "{WS}"\n')               # ustaget
        self.stage("app/src/ok.ts", "export const ok = 1;\n")
        self.assertEqual(self.fejl(staged=True), [])
        self.assertEqual(self.fejl(), [("installation", "fabric/y.py")])  # fuld gate ser den

    def test_slettede_staged_filer_goer_ikke_fejl(self):
        self.stage("fabric/z.py", "x = 1\n")
        git(self.rod, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "x")
        git(self.rod, "rm", "-q", "fabric/z.py")
        self.assertEqual(self.fejl(staged=True), [])

    def koer_main(self):
        import contextlib
        import io
        with contextlib.redirect_stdout(io.StringIO()) as ud:
            kode = T.main(["--repo", "--staged", "--rod", str(self.rod)])
        return kode, ud.getvalue()

    def test_hookens_uddata_er_stille_om_advarsler_men_viser_fejl_med_fil_og_linje(self):
        # Pre-commit koeres ved hvert commit: advarsler (fx ukendte GUID'er i tests) er stoej dér; fejl skal ses.
        self.stage("app/src/g.ts", "// " + "0b20eb7f-1c2d-4e3f-8a4b-" + "5c6d7e8f9a0b\n")
        kode, ud = self.koer_main()
        self.assertEqual(kode, 0, ud)
        self.assertNotIn("ADVARSLER", ud)
        self.assertIn("RESULTAT: OK", ud)
        self.stage("fabric/x.py", f'WS = "{WS}"\n')
        kode, ud = self.koer_main()
        self.assertEqual(kode, 1)
        self.assertIn("fabric/x.py:1", ud)
        self.assertNotIn(WS[-12:], ud)
        self.assertNotIn("ADVARSLER", ud)

    def test_den_fulde_gate_viser_stadig_advarslerne(self):
        import contextlib
        import io
        skriv(self.rod, "app/src/g.ts", "// " + "0b20eb7f-1c2d-4e3f-8a4b-" + "5c6d7e8f9a0b\n")
        with contextlib.redirect_stdout(io.StringIO()) as ud:
            T.main(["--repo", "--rod", str(self.rod)])
        self.assertIn("ADVARSLER", ud.getvalue())

    def test_staged_uden_git_er_en_brugsfejl(self):
        import shutil
        shutil.rmtree(self.rod / ".git")
        with self.assertRaises(T.BrugsFejl):
            self.gaten(staged=True)

    def test_kreditkravene_koeres_ikke_paa_hvert_commit_men_i_det_fulde_tjek(self):
        (self.rod / "CREDITS.md").unlink()
        self.stage("app/src/c.ts", "export const c = 1;\n")
        self.assertEqual(self.fejl(staged=True), [])
        self.assertIn("krav-credits", {r for r, _ in self.fejl()})


@unittest.skipUnless(GIT, "git findes ikke")
class TestSkipWorktree(Repo):
    """`scripts/installation.py paafoer` skriver installationens vaerdier ind i konfig.ts/rayfin.yml LOKALT (skip-worktree). Den fulde gate
    skal da vurdere det, der kan committes (indekset), ikke den lokale paafoersel - ellers er gaten roed hos enhver, der har deployet."""
    FIL = "app/rayfin/functions/src/konfig.ts"

    def setUp(self):
        super().setUp()
        skriv(self.rod, self.FIL, 'export const WORKSPACE_ID = "";')
        git(self.rod, "add", "-A")
        git(self.rod, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "start")
        skriv(self.rod, self.FIL, f'export const WORKSPACE_ID = "{WS}";')   # den lokale paafoersel

    def test_uden_skip_worktree_er_den_lokale_aendring_en_fejl(self):
        self.assertEqual(self.fejl(), [("installation", self.FIL)])

    def test_med_skip_worktree_vurderes_det_committede(self):
        git(self.rod, "update-index", "--skip-worktree", self.FIL)
        self.assertEqual(self.fejl(), [])

    def test_en_skip_worktree_fil_med_en_vaerdi_i_INDEKSET_er_stadig_en_fejl(self):
        git(self.rod, "update-index", "--skip-worktree", self.FIL)
        git(self.rod, "update-index", "--no-skip-worktree", self.FIL)
        git(self.rod, "add", self.FIL)                       # nu ligger vaerdien i indekset (kan committes)
        git(self.rod, "update-index", "--skip-worktree", self.FIL)
        self.assertEqual(self.fejl(), [("installation", self.FIL)])


class TestWheelMedRepoetsLister(Repo):
    def hjul(self, ekstra=None):
        import zipfile
        p = Path(self._t.name) / "fjernvarme_app-1.whl"
        with zipfile.ZipFile(p, "w") as z:
            for k in (KREDIT["model"]["licensfil"], KREDIT["data"]["licensfil"]):
                z.writestr("fjernvarme_app/_ressourcer/" + k, (ROD / k).read_bytes())
            z.writestr("fjernvarme_app/_ressourcer/CREDITS.md", chr(10).join(KREDIT["credits_skal_indeholde"]))
            for n, tekst in (ekstra or {}).items():
                z.writestr(n, tekst)
        return p

    def koer(self, p):
        import contextlib
        import io
        with contextlib.redirect_stdout(io.StringIO()) as ud:
            kode = T.main(["--wheel", str(p), "--rod", str(self.rod)])   # ingen --forbud: repoets egne lister
        return kode, ud.getvalue()

    def test_et_rent_hjul_bestaar_uden_en_privat_forbudsliste(self):
        kode, ud = self.koer(self.hjul())
        self.assertEqual(kode, 0, ud)

    def test_en_installationsvaerdi_i_hjulet_er_en_fejl(self):
        kode, ud = self.koer(self.hjul({"fjernvarme_app/_motor/x.py": f'W = "{WS}"'}))
        self.assertEqual(kode, 1)
        self.assertIn("x.py", ud)
        self.assertNotIn(WS[-12:], ud)

    def test_et_generisk_forbud_i_hjulet_er_en_fejl(self):
        kode, ud = self.koer(self.hjul({"fjernvarme_app/web/a.js": "https://" + "min-app-b46947b23b." + "webapp.fabricapps.net/"}))
        self.assertEqual(kode, 1, ud)


class TestScripts(Taeppe):
    def test_hooken_findes_er_lf_og_koerer_den_staged_gate(self):
        b = (ROD / "scripts/hooks/pre-commit").read_bytes()
        self.assertNotIn(b"\r\n", b)
        t = b.decode("utf-8")
        self.assertTrue(t.startswith("#!"))
        self.assertIn("scripts/tjek.py", t)
        self.assertIn("--staged", t)

    def test_tjek_py_er_en_tynd_indgang_til_gaten(self):
        t = (ROD / "scripts/tjek.py").read_text(encoding="utf-8")
        self.assertIn("tjek_offentlig", t)
        self.assertIn("--repo", t)

    @unittest.skipUnless(GIT, "git findes ikke")
    def test_hook_installeres_med_core_hookspath(self):
        lav_produkt(self.rod)
        skriv(self.rod, "scripts/hooks/pre-commit", (ROD / "scripts/hooks/pre-commit").read_bytes())
        git(self.rod, "init", "-q", "-b", "main")
        r = subprocess.run([sys.executable, "-I", str(ROD / "scripts/tjek.py"), "--installer-hook", "--rod", str(self.rod)],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(git(self.rod, "config", "core.hooksPath"), "scripts/hooks")

    @unittest.skipUnless(GIT, "git findes ikke")
    def test_hook_installeres_ikke_uden_en_hook_fil_eller_uden_git(self):
        r = subprocess.run([sys.executable, "-I", str(ROD / "scripts/tjek.py"), "--installer-hook", "--rod", str(self.rod)],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)

    @unittest.skipUnless(GIT, "git findes ikke")
    def test_hooken_stopper_et_commit_med_en_installationsvaerdi_og_slipper_et_rent(self):
        # Ende til ende: rigtig git, rigtig hook (sh), staged indhold. Springes over, hvis sh ikke findes.
        import shutil
        if not shutil.which("sh"):
            self.skipTest("sh findes ikke")
        lav_produkt(self.rod)
        for rel in ("scripts/hooks/pre-commit", "scripts/tjek.py", "tjek_offentlig.py", "offentlig/forbud.generisk.json"):
            skriv(self.rod, rel, (ROD / rel).read_bytes())
        skriv(self.rod, "offentlig/regler.json", json.dumps(REGLER))
        skriv(self.rod, "config/installation.eksempel.json", json.dumps(EKSEMPEL))
        skriv(self.rod, "config/installation.json", json.dumps(INSTALLATION))
        skriv(self.rod, ".gitignore", "config/installation.json\n")
        git(self.rod, "init", "-q", "-b", "main")
        git(self.rod, "config", "core.hooksPath", "scripts/hooks")
        git(self.rod, "config", "user.name", "t")
        git(self.rod, "config", "user.email", "t@example.com")
        skriv(self.rod, "fabric/x.py", f'WS = "{WS}"\n')
        git(self.rod, "add", "fabric/x.py")
        r = subprocess.run(["git", "-C", str(self.rod), "commit", "-q", "-m", "laek"], capture_output=True, text=True, encoding="utf-8", errors="replace")
        self.assertNotEqual(r.returncode, 0, "hooken skulle have stoppet commit'et")
        self.assertEqual(git(self.rod, "rev-list", "--all", "--count", check=False) or "0", "0")
        skriv(self.rod, "fabric/x.py", "x = 1\n")
        git(self.rod, "add", "fabric/x.py")
        r = subprocess.run(["git", "-C", str(self.rod), "commit", "-q", "-m", "rent"], capture_output=True, text=True, encoding="utf-8", errors="replace")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
