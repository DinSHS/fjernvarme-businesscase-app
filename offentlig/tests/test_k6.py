"""Codex K6 (rapporter/K6_codex.md): F1 (private oplysninger i eksporten), F2 (gatens huller), F3 (sidefoden).

Hver test er skrevet FOER rettelsen og fejlede da; se fv-offentlig.md, afsnittet "K6 rettet".
"""
import contextlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

from offentlig.tests.test_tjek_offentlig import (  # noqa: F401
    FORBUD, KREDIT, REGLER, ROD, SLUG, TEST_WS, Taeppe, krav, lav_produkt, skriv,
)
import tjek_offentlig as T

UTF16 = "utf-16"
OA = "oa" + "/fjv"  # bygget af dele, saa denne fil ikke selv rammer reglen om interne stier


class ScanTaeppe(Taeppe):
    def scan(self, rel, indhold, **kw):
        skriv(self.rod, rel, indhold)
        return T.scan(self.rod, [rel], FORBUD, frozenset(), **kw)

    @staticmethod
    def regler_af(fund, niveau="fejl"):
        return [(f.regel, f.fil) for f in fund if f.niveau == niveau]


class TestF2Kodning(ScanTaeppe):
    """F2: samme forbudte ord skal give samme fejl uanset tekstkodning."""

    ORD = "her staar hemmeligfirma midt i\n"

    def test_utf8_er_baseline(self):
        self.assertEqual(self.regler_af(self.scan("a.txt", self.ORD)), [("organisation", "a.txt")])

    def test_utf16_med_bom(self):
        self.assertEqual(self.regler_af(self.scan("a.txt", self.ORD.encode(UTF16))), [("organisation", "a.txt")])

    def test_utf16_be_og_le_uden_bom(self):
        for kod in ("utf-16-le", "utf-16-be"):
            with self.subTest(kod=kod):
                self.assertEqual(self.regler_af(self.scan("a.txt", self.ORD.encode(kod))), [("organisation", "a.txt")])

    def test_utf8_med_bom(self):
        self.assertEqual(self.regler_af(self.scan("a.txt", b"\xef\xbb\xbf" + self.ORD.encode("utf-8"))), [("organisation", "a.txt")])

    def test_ukendt_binaer_fil_er_en_fejl_ikke_en_stille_skip(self):
        fund = self.scan("data.dat", b"\x00\x01hemmeligfirma\x00\xff\x00" * 20)
        self.assertEqual(self.regler_af(fund), [("ikke-scannet", "data.dat")])

    def test_kendt_binaer_type_fra_tilladelseslisten_springes_over(self):
        fund = self.scan("logo.png", b"\x89PNG\x00\x00hemmeligfirma", binaere=["**/*.png", "*.png"])
        self.assertEqual(self.regler_af(fund), [])

    def test_for_stor_fil_er_en_fejl_ikke_en_advarsel(self):
        gammel = T.MAKS_BYTES
        T.MAKS_BYTES = 1000
        try:
            fund = self.scan("stor.txt", "hemmeligfirma " + "x" * 3000)
        finally:
            T.MAKS_BYTES = gammel
        self.assertEqual(self.regler_af(fund), [("for-stor", "stor.txt")])

    def test_standardgraensen_er_mindst_64_mb(self):
        self.assertGreaterEqual(T.MAKS_BYTES, 64_000_000)

    def test_zip_medlemmer_scannes(self):
        p = self.rod / "pakke.zip"
        with zipfile.ZipFile(p, "w") as z:
            z.writestr("ark/delt.xml", "<c>hemmeligfirma</c>")
            z.writestr("ren.txt", "intet")
        fund = T.scan(self.rod, ["pakke.zip"], FORBUD, frozenset())
        self.assertEqual(self.regler_af(fund), [("organisation", "pakke.zip::ark/delt.xml")])

    def test_zip_medlemsnavne_matcher_filnavneregler(self):
        p = self.rod / "pakke.zip"
        with zipfile.ZipFile(p, "w") as z:
            z.writestr("app/.env.local", "x")
        fund = T.scan(self.rod, ["pakke.zip"], FORBUD, frozenset())
        self.assertEqual(self.regler_af(fund), [("deploy-tilstand", "pakke.zip::app/.env.local")])

    def test_zip_i_zip_scannes_et_niveau_ned_og_dybere_er_en_fejl(self):
        indre = io.BytesIO()
        with zipfile.ZipFile(indre, "w") as z:
            z.writestr("a.txt", "hemmeligfirma")
        ydre = self.rod / "y.zip"
        with zipfile.ZipFile(ydre, "w") as z:
            z.writestr("indre.zip", indre.getvalue())
        self.assertEqual(self.regler_af(T.scan(self.rod, ["y.zip"], FORBUD, frozenset())), [("organisation", "y.zip::indre.zip::a.txt")])

    def test_defekt_zip_er_en_fejl(self):
        skriv(self.rod, "daarlig.zip", b"PK\x03\x04 ikke en zip")
        self.assertEqual(self.regler_af(T.scan(self.rod, ["daarlig.zip"], FORBUD, frozenset())), [("ikke-scannet", "daarlig.zip")])


class TestF2Undertrykkelse(ScanTaeppe):
    """F2: et markoer i indholdet maa ALDRIG kunne undertrykke et fund (K6-proben: en JSON-vaerdi med markoeren)."""

    def test_markoer_i_json_undertrykker_intet(self):
        fund = self.scan("data.json", '{"x": "hemmeligfirma", "y": "tjek_offentlig:ignorer"}\n')
        self.assertEqual(self.regler_af(fund), [("organisation", "data.json")])

    def test_markoer_i_en_kommentar_i_en_spec_undertrykker_heller_intet(self):
        fund = self.scan("a.spec.ts", "// tjek_offentlig:ignorer\nconst x = 'hemmeligfirma';\n")
        self.assertEqual(self.regler_af(fund), [("organisation", "a.spec.ts")])

    UNDTAGELSER = [{"fil": "**/*.spec.ts", "regler": ["organisation"], "grund": "testen asserterer fravaer"}]

    def test_undtagelse_kun_for_den_listede_fil_og_regel(self):
        fund = self.scan("a.spec.ts", "const x = 'hemmeligfirma'; const m = 'p@hemmeligfirma.example.com';\n", undtagelser=self.UNDTAGELSER)
        self.assertEqual(self.regler_af(fund), [("e-mail", "a.spec.ts")])  # organisation undtaget, e-mail-reglen ikke
        self.assertEqual([f.regel for f in fund if f.niveau == "advarsel"], ["undtaget"])

    def test_undtagelse_goelder_ikke_en_anden_fil(self):
        fund = self.scan("a.ts", "const x = 'hemmeligfirma';\n", undtagelser=self.UNDTAGELSER)
        self.assertEqual(self.regler_af(fund), [("organisation", "a.ts")])

    def test_undtagelse_gaelder_ogsaa_en_filnavnsregel_men_kun_for_den_listede_sti(self):
        # Fundet ved den rigtige eksport: testdata, der hedder *.log, blev ramt af `**/*.log` ("log").
        u = [{"fil": "data/*.log", "regler": ["log"], "grund": "en fixture, ikke en koerselslog"}]
        skriv(self.rod, "data/x.log", "ren")
        skriv(self.rod, "andet/y.log", "ren")
        fund = T.scan(self.rod, ["data/x.log", "andet/y.log"], FORBUD, frozenset(), undtagelser=u)
        self.assertEqual(self.regler_af(fund), [("log", "andet/y.log")])
        self.assertEqual([(f.regel, f.fil) for f in fund if f.niveau == "advarsel"], [("undtaget", "data/x.log")])
        self.assertEqual(self.regler_af(T.scan(self.rod, ["data/x.log"], FORBUD, frozenset())), [("log", "data/x.log")])

    def test_undtagelsen_meldes_altid_som_advarsel_med_antal(self):
        fund = self.scan("a.spec.ts", "hemmeligfirma\nhemmeligfirma\n", undtagelser=self.UNDTAGELSER)
        adv = [f for f in fund if f.regel == "undtaget"]
        self.assertEqual(len(adv), 1)
        self.assertIn("2", adv[0].tekst)

    def test_den_rigtige_undtagelsesliste_er_smal_og_hver_post_har_en_grund(self):
        for u in REGLER.get("undtagelser", []):
            self.assertTrue(u.get("grund"), u)
            self.assertTrue(u["regler"], u)
            self.assertNotIn("**/*", u["fil"].replace("**/*.spec", ""), "undtagelser maa ikke vaere generelle: " + u["fil"])


class TestF1Omskriv(Taeppe):
    """F1: det, der ikke kan fjernes ved kilden uden at roere andres filer, omskrives mekanisk - synligt og talt."""

    FORBUD1 = dict(FORBUD,
                   guids=[{"vaerdi": TEST_WS, "regel": "workspace-id", "forklaring": "t", "erstat": "<workspace-id>"}],
                   litteraler=FORBUD["litteraler"] + [{"vaerdi": "dit-workspace-navn", "regel": "workspace", "forklaring": "t", "erstat": "<dit workspace>"}],
                   regex=FORBUD["regex"] + [{"moenster": r"@hemmeligfirma\.dk", "regel": "e-mail", "forklaring": "t", "erstat": "@example.com"}])
    REGLER1 = dict(REGLER, erstat=[], undtagelser=[], respekter_gitignore=False,
                   omskriv_filer=["app/package.json", "app/docs/**"],
                   omskriv=[{"filer": ["viden/**"], "moenster": r"oa[\\/]+fjv[\\/]+rapporter[\\/]+[\w.-]+", "med": "udviklingsrapport",
                             "grund": "kildeangivelse uden offentligt mal"}])

    def lav(self):
        lav_produkt(self.rod)
        skriv(self.rod, "app/package.json", f'{{"s": "rayfin up --workspace-id {TEST_WS}"}}\n')
        skriv(self.rod, "app/docs/db.md", "login: pia@hemmeligfirma.dk i dit-workspace-navn\n")
        skriv(self.rod, "viden/k.json", '{"kilde": "' + OA + '/rapporter/fv-ekspert.md (D11)"}\n')
        skriv(self.rod, "andet/x.md", f"ikke i omskriv_filer: {TEST_WS}\n")

    def test_omskrivning_goer_det_private_til_pladsholdere(self):
        self.lav()
        om = T.byg_omskriv(self.REGLER1, self.FORBUD1, frozenset())
        b, tael = om("app/package.json", (self.rod / "app/package.json").read_bytes())
        self.assertIn(b"<workspace-id>", b)
        self.assertNotIn(TEST_WS.encode(), b)
        self.assertEqual(sum(tael.values()), 1)
        b, _ = om("app/docs/db.md", (self.rod / "app/docs/db.md").read_bytes())
        self.assertEqual(b, b"login: pia@example.com i <dit workspace>\n")
        b, tael = om("viden/k.json", (self.rod / "viden/k.json").read_bytes())
        self.assertEqual(b, b'{"kilde": "udviklingsrapport (D11)"}\n')

    def test_filer_uden_for_listerne_roeres_ikke(self):
        self.lav()
        om = T.byg_omskriv(self.REGLER1, self.FORBUD1, frozenset())
        raa = (self.rod / "andet/x.md").read_bytes()
        self.assertEqual(om("andet/x.md", raa)[0], raa)

    def test_binaer_og_ikke_utf8_roeres_ikke(self):
        om = T.byg_omskriv(self.REGLER1, self.FORBUD1, frozenset())
        raa = b"\xff\xfe\x00\x01" + TEST_WS.encode()
        self.assertEqual(om("app/docs/b.bin", raa)[0], raa)

    def test_gaten_scanner_det_omskrevne_og_meddeler_omskrivningerne(self):
        self.lav()
        res = T.koer(self.rod, None, self.REGLER1, self.FORBUD1, KREDIT)
        fejl = [(f.regel, f.fil) for f in res.funde if f.niveau == "fejl"]
        self.assertEqual(fejl, [("workspace-id", "andet/x.md")])  # kun den ikke-omskrevne fil
        om = [f for f in res.funde if f.regel == "omskrevet"]
        self.assertEqual(sorted(f.fil for f in om), ["app/docs/db.md", "app/package.json", "viden/k.json"])
        self.assertTrue(all(f.niveau == "advarsel" for f in om))

    def test_den_rigtige_regelfil_omskriver_oa_stier_men_ikke_noget_vilkaarligt(self):
        om = T.byg_omskriv(REGLER, FORBUD, frozenset())
        raa = ("Kilde: " + OA + "/rapporter/fv-ekspert.md og " + OA.replace("/", chr(92)) + chr(92) + "briefs" + chr(92) + "K.md").encode("utf-8")
        b, _ = om("viden/x.json", raa)
        self.assertNotIn(OA.encode(), b)
        self.assertNotIn(OA.replace("/", chr(92)).encode(), b)
        self.assertIn(b"udviklingsrapport", b)


def _git(rod, *a):
    return subprocess.run(["git", "-C", str(rod), *a], capture_output=True, text=True, timeout=60)


@unittest.skipUnless(subprocess.run(["git", "--version"], capture_output=True).returncode == 0, "git findes ikke")
class TestF1Gitignore(Taeppe):
    """F1: eksporten er baseret paa det git kender som kildekode - alt gitignoreret (build, logs, tilstand) er privat."""

    def test_gitignorerede_filer_er_private(self):
        skriv(self.rod, ".gitignore", "dist-x/\n*.log\nhemmelig.txt\n")
        skriv(self.rod, "src/a.ts", "x")
        skriv(self.rod, "dist-x/b.js", "x")
        skriv(self.rod, "kor.log", "x")
        skriv(self.rod, "hemmelig.txt", "x")
        skriv(self.rod, "ny_ikke_tilfoejet.ts", "x")  # untracked men ikke ignoreret = kildekode
        _git(self.rod, "init", "-q")
        off, priv = T.filsaet(self.rod, dict(REGLER, udeladt_mapper=[], udeladt_filer=[], respekter_gitignore=True))
        self.assertEqual(sorted(off), [".gitignore", "ny_ikke_tilfoejet.ts", "src/a.ts"])
        self.assertEqual(sorted(p for p, _ in priv), ["dist-x/b.js", "hemmelig.txt", "kor.log"])
        self.assertTrue(all("gitignore" in g for _, g in priv))

    def test_uden_git_mappe_er_adfaerden_uaendret(self):
        skriv(self.rod, "src/a.ts", "x")
        off, _ = T.filsaet(self.rod, dict(REGLER, udeladt_mapper=[], udeladt_filer=[], respekter_gitignore=True))
        self.assertEqual(off, ["src/a.ts"])

    def test_dist_rest_og_deploymetadata_er_udeladt_af_regelfilen(self):
        for rel in ("app/dist-rest/index.html", "app/dist-community/a.js", "app/rayfin/functions/deploymetadata.json",
                    "fabric/fabric_miljoe.py", "app/AGENTS.md", "app/README.md"):
            skriv(self.rod, rel, "x")
        off, priv = T.filsaet(self.rod, REGLER)
        self.assertEqual(off, [], priv)


class TestF1Wheel(Taeppe):
    def hjul(self, medlemmer, navn="fjernvarme_app-9.whl"):
        p = Path(self._t.name) / navn
        with zipfile.ZipFile(p, "w") as z:
            for n, t in medlemmer.items():
                z.writestr(n, t)
        return p

    def licenser(self):
        return {f"fjernvarme_app/_ressourcer/{k}": (ROD / k).read_bytes() for k in
                (KREDIT["model"]["licensfil"], KREDIT["data"]["licensfil"], *[t["licensfil"] for t in KREDIT.get("tredjepart_licenser", [])])}

    def koer(self, hjul):
        fp = Path(self._t.name) / "forbud.json"
        fp.write_text(json.dumps(FORBUD), encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()) as ud:
            kode = T.main(["--wheel", str(hjul), "--forbud", str(fp)])
        return kode, ud.getvalue()

    def godt_hjul(self, **ekstra):
        m = dict(self.licenser())
        m["fjernvarme_app/_ressourcer/CREDITS.md"] = "\n".join(KREDIT["credits_skal_indeholde"]) + f"\n{'b' * 40} {'d' * 40}"
        m["fjernvarme_app/_motor/fjv/konstanter.py"] = 'MODEL_COMMIT = "' + "b" * 40 + '"\nDF_DATA_SHA = "' + "d" * 40 + '"\nWORKSPACE_ID = ""\n'
        m.update(ekstra)
        return self.hjul(m)

    def test_manglende_eller_tom_wheel_sti_er_brugsfejl_ikke_en_stille_anden_tilstand(self):
        # Fundet ved et rigtigt koersel: $W var tom (wheel-bygningen fejlede), og --wheel "" koerte arbejdstraeet i stedet.
        fp = Path(self._t.name) / "forbud.json"
        fp.write_text(json.dumps(FORBUD), encoding="utf-8")
        for sti in ("", str(Path(self._t.name) / "findes-ikke.whl")):
            with self.subTest(sti=sti), contextlib.redirect_stderr(io.StringIO()) as fejl:
                self.assertEqual(T.main(["--wheel", sti, "--forbud", str(fp)]), 2)
                self.assertIn("kan ikke laese", fejl.getvalue())

    def test_et_rent_hjul_bestaar(self):
        kode, ud = self.koer(self.godt_hjul())
        self.assertEqual(kode, 0, ud)

    def test_privat_id_i_hjulet_er_en_fejl_med_medlemsnavn(self):
        h = self.godt_hjul(**{"fjernvarme_app/_motor/fjv/konstanter.py": f'WORKSPACE_ID = "{TEST_WS}"\n'})
        kode, ud = self.koer(h)
        self.assertEqual(kode, 1)
        self.assertIn("konstanter.py", ud)
        self.assertNotIn(TEST_WS[-12:], ud)

    def test_hjul_uden_licenstekst_eller_credits_er_en_fejl(self):
        m = {k: v for k, v in self.licenser().items() if "df-data" not in k}
        kode, ud = self.koer(self.hjul(m))
        self.assertEqual(kode, 1)
        self.assertIn("krav-wheel", ud)

    def test_hjul_uden_ibcs_licensen_er_en_fejl(self):
        # K7-F1: frontenden i wheel'en indeholder IBCS-grafernes kode; uden deres MIT-tekst må hjulet ikke gå igennem.
        m = {k: v for k, v in self.licenser().items() if "ibcs" not in k}
        self.assertEqual(len(m), len(self.licenser()) - 1)
        kode, ud = self.koer(self.hjul(m))
        self.assertEqual(kode, 1)
        self.assertIn("ibcs-web-charts_LICENSE.txt", ud)
        kode, ud = self.koer(self.godt_hjul(**{"fjernvarme_app/_ressourcer/LICENSES/ibcs-web-charts_LICENSE.txt": b"MIT"}))
        self.assertEqual(kode, 1)
        self.assertIn("krav-wheel", ud)

    def test_hjulets_licenstekst_skal_vaere_ordret(self):
        h = self.godt_hjul(**{"fjernvarme_app/_ressourcer/" + KREDIT["data"]["licensfil"]: b"MIT, men aendret"})
        kode, ud = self.koer(h)
        self.assertEqual(kode, 1)
        self.assertIn("krav-wheel", ud)


class TestF3Sidefod(Taeppe):
    """F3: kreditgaten skal opdage, at den SYNLIGE sidefod er fjernet fra skallen, ikke kun at teksten findes et sted."""

    def setUp(self):
        super().setUp()
        lav_produkt(self.rod)
        self.app = self.rod / "app/src/App.tsx"

    def fejl(self):
        return [f for f in krav(self.rod) if f.regel == "krav-kreditlinje"]

    def test_udgangspunktet_med_monteret_sidefod_bestaar(self):
        self.assertEqual(self.fejl(), [])

    def test_kaldet_fjernet_men_import_og_filer_tilbage(self):
        # Praecis K6's mutation: komponenterne og teksten ligger som ubrugte filer.
        skriv(self.rod, "app/src/App.tsx", 'import { Sidefod } from "@/components/layout";\nexport default function App() { return <div />; }\n')
        self.assertTrue(self.fejl())
        self.assertIn("monteret", self.fejl()[0].tekst)

    def test_kaldet_udkommenteret(self):
        for tekst in ('{/* <Sidefod /> */}', '// <Sidefod />', '/* <Sidefod /> */'):
            with self.subTest(tekst=tekst):
                skriv(self.rod, "app/src/App.tsx",
                      f'import {{ Sidefod }} from "@/components/layout";\nexport default function App() {{ return <div>\n{tekst}\n</div>; }}\n')
                self.assertTrue(self.fejl())

    def test_sidefoden_monteret_i_en_komponent_skallen_ikke_bruger(self):
        skriv(self.rod, "app/src/App.tsx", 'export default function App() { return <div />; }\n')
        skriv(self.rod, "app/src/andet/Orphan.tsx", 'import { Sidefod } from "@/components/layout";\nexport const O = () => <Sidefod />;\n')
        self.assertTrue(self.fejl())

    def test_kreditkomponenten_fjernet_fra_sidefoden(self):
        skriv(self.rod, "app/src/components/layout/Sidefod.tsx",
              'import { Kreditlinje } from "../../sider/dokumentation/Kreditlinje";\nexport function Sidefod() { return <div data-layout="kreditlinje" />; }\n')
        self.assertTrue(self.fejl())

    def test_skallen_mangler_helt(self):
        self.app.unlink()
        self.assertTrue(self.fejl())

    def test_alias_og_relative_importer_og_reeksport_loeses(self):
        skriv(self.rod, "app/src/App.tsx", 'import { Sidefod } from "./components/layout/Sidefod";\nexport default () => <Sidefod />;\n')
        self.assertEqual(self.fejl(), [])
        skriv(self.rod, "app/src/App.tsx", 'import Sidefod2 from "@/components/layout/Sidefod";\nexport default () => <Sidefod2 />;\n')
        skriv(self.rod, "app/src/components/layout/Sidefod.tsx",
              'import { Kreditlinje } from "../../sider/dokumentation/Kreditlinje";\nconst Sidefod = () => <div data-layout="kreditlinje"><Kreditlinje /></div>;\nexport default Sidefod;\n')
        self.assertEqual(self.fejl(), [])


class TestBrudteImporter(Taeppe):
    """Fundet ved at BYGGE fra den rene eksport: `tsc -b` fejlede, fordi 4 specs importerede en udeladt (privat) fixture.
    Eksportens filsaet skal vaere lukket under import: ingen kodefil maa pege paa en fil, der ikke er med."""

    def setUp(self):
        super().setUp()
        lav_produkt(self.rod)

    def fejl(self):
        return [f for f in krav(self.rod) if f.regel == "krav-import"]

    def test_udgangspunktet_har_ingen_brudte_importer(self):
        self.assertEqual(self.fejl(), [])

    def test_import_af_en_fil_der_ikke_er_med(self):
        skriv(self.rod, "app/src/a.spec.ts", 'import fx from "../skaermbilleder/harness/fixtures.json";\nexport default fx;\n')
        f = self.fejl()
        self.assertEqual([(x.fil, x.regel) for x in f], [("app/src/a.spec.ts", "krav-import")])
        self.assertIn("fixtures.json", f[0].tekst)

    def test_import_af_en_fil_der_er_med_bestaar_ogsaa_json_css_og_query(self):
        skriv(self.rod, "app/skaermbilleder/harness/fixtures.json", "{}")
        skriv(self.rod, "app/src/a.css", "a{}")
        skriv(self.rod, "app/src/b.ts", "export const b = 1;\n")
        skriv(self.rod, "app/src/a.spec.ts",
              'import fx from "../skaermbilleder/harness/fixtures.json";\nimport "./a.css";\nimport raa from "./b.ts?raw";\n'
              'import { b } from "@/b";\nimport react from "react";\nexport default [fx, raa, b, react];\n')
        self.assertEqual(self.fejl(), [])

    def test_alias_og_reeksport_og_doven_import_tjekkes(self):
        for tekst in ('import { x } from "@/findes-ikke";\nexport const y = x;\n', 'export * from "./findes-ikke";\n',
                      'export const L = () => import("./findes-ikke");\n'):
            with self.subTest(tekst=tekst[:30]):
                skriv(self.rod, "app/src/c.ts", tekst)
                self.assertEqual([x.fil for x in self.fejl()], ["app/src/c.ts"])

    def test_kommenteret_import_og_pakkeimport_ignoreres(self):
        skriv(self.rod, "app/src/c.ts", '// import x from "./findes-ikke";\n/* import y from "../ogsaa-ikke" */\nimport z from "node-pakke";\nexport default z;\n')
        self.assertEqual(self.fejl(), [])

    def test_ogsaa_scripts_og_harness_uden_for_src_tjekkes(self):
        skriv(self.rod, "app/skaermbilleder/harness/main.tsx", 'import fx from "./fixtures.json";\nexport default fx;\n')
        self.assertEqual([x.fil for x in self.fejl()], ["app/skaermbilleder/harness/main.tsx"])


class TestKonstanterOffentlig(unittest.TestCase):
    """F1: fabric/fjv/konstanter.py er KERNE (pins, community genbruger den) og maa ikke baere et workspace."""

    def test_installationsbindingen_er_i_en_privat_fil_som_regelfilen_udelader(self):
        # fv-fabric3 flyttede workspace-/lakehouse-id fra konstanter.py til fabric/fabric_miljoe.py (K6-F1).
        self.assertTrue(any(T.glob_match(m["moenster"], "fabric/fabric_miljoe.py") for m in REGLER["udeladt_filer"]))

    def test_konstanter_py_er_kerne_og_baerer_ingen_guid(self):
        t = (ROD / "fabric/fjv/konstanter.py").read_text(encoding="utf-8")
        # Kun syntetiske id'er, der er ens i enhver installation (fx MOTOR_ID, raekken i dbo.Motors; runde 7c), er tilladt.
        self.assertEqual([g for g in T.GUID_RX.findall(t) if not T.er_syntetisk(g)], [],
                         "konstanter.py maa ikke baere en installations id'er (den er kerne og bundles i wheel'en)")
        self.assertIn("MODEL_COMMIT", t)   # pins er stadig kerne
        self.assertIn("DF_DATA_SHA", t)

    def test_motorpakken_fjv_er_fri_for_guids_bortset_fra_syntetiske(self):
        for p in sorted((ROD / "fabric/fjv").glob("*.py")):
            ægte = [g for g in T.GUID_RX.findall(p.read_text(encoding="utf-8")) if not T.er_syntetisk(g)]
            self.assertEqual(ægte, [], f"{p.name} bundles i wheel'en og maa ikke baere et rigtigt id")


if __name__ == "__main__":
    unittest.main()
