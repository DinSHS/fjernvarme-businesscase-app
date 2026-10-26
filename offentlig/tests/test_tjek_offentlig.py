"""Tests for tjek_offentlig.py (stdlib unittest, intet netvaerk).

Koeres fra produktmappen:
    python -I -m unittest discover -s offentlig/tests -t . -p "test_*.py"

Hver krav-regel har en NEGATIV kontrol: et fuldstaendigt udgangspunkt (`lav_produkt`) bestaar, og en enkelt
aendring - en manglende fil, et ord, en SHA - faar netop den regel til at fejle. En regel, der aldrig kan fejle,
er ikke en regel.
"""
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROD = Path(__file__).resolve().parents[2]
if str(ROD) not in sys.path:
    sys.path.insert(0, str(ROD))

import tjek_offentlig as T  # noqa: E402

KREDIT = json.loads((ROD / "offentlig" / "kredit.json").read_text(encoding="utf-8"))
REGLER = json.loads((ROD / "offentlig" / "regler.json").read_text(encoding="utf-8"))

MODEL_SHA = "b" * 40
DATA_SHA = "d" * 40
# Testens egne "forbudte" vaerdier bygges, saa filen selv kan eksporteres uden at ramme den rigtige forbudsliste.
TEST_WS = "abcdef12-3456-4789-8abc-" + "def012345678"  # delt, saa filen selv ikke indeholder et helt "rigtigt" id
SLUG = "dansk" + "-fjernvarme"
SLUG_FIL = "dansk" + "_fjernvarme"
WINSTI = "C:" + "\\Users" + "\\bob\\x.txt"

FORBUD = {
    "litteraler": [
        {"vaerdi": "hemmeligfirma", "regel": "organisation", "forklaring": "test"},
        {"vaerdi": "KUN-ADVARSEL", "regel": "intern-reference", "forklaring": "test", "niveau": "advarsel"},
    ],
    "regex": [
        {"moenster": r"[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s\"']+", "regel": "intern-sti", "forklaring": "test"},
        {"moenster": r"(?i)\b(?:dansk|billund|din)[-_](?:fjernvarme|forsyning)\b", "regel": "tema", "forklaring": "test"},
        {"moenster": r"@(?:[A-Za-z0-9-]+\.)*hemmeligfirma\.example\.com", "regel": "e-mail", "forklaring": "test"},
    ],
    "guids": [{"vaerdi": TEST_WS, "regel": "workspace-id", "forklaring": "test"}],
    "tilladte_emails": ["a@b.dk"],
    "tilladte_email_domaener": ["example.com"],
    "forbudte_filnavne": [
        {"moenster": "**/.env.*", "regel": "deploy-tilstand"},
        {"moenster": "**/*.log", "regel": "log"},
        {"moenster": "**/*dansk*fjernvarme*", "regel": "tema"},
    ],
}


def skriv(rod: Path, rel: str, tekst: str | bytes) -> None:
    p = rod / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(tekst if isinstance(tekst, bytes) else tekst.encode("utf-8"))


def credits_tekst(model_sha=MODEL_SHA, data_sha=DATA_SHA) -> str:
    return "# Kredit\n\n" + "\n".join(f"- {s}" for s in KREDIT["credits_skal_indeholde"]) + \
        f"\n\nModel `{model_sha}`\nData `{data_sha}`\n\nIngen godkendelse eller tilslutning.\n"


def lav_produkt(rod: Path) -> Path:
    """Et minimalt produkt, der opfylder ALLE krav."""
    for rel in (KREDIT["model"]["licensfil"], KREDIT["data"]["licensfil"]):
        skriv(rod, rel, (ROD / rel).read_bytes())
    skriv(rod, "offentlig/kredit.json", (ROD / "offentlig" / "kredit.json").read_bytes())
    skriv(rod, "CREDITS.md", credits_tekst())
    skriv(rod, "NOTICE", "Se CREDITS.md\n")
    skriv(rod, "LICENSE", "MIT License\n\nCopyright (c) 2026 Eksempel A/S\n")
    skriv(rod, "README.md", "# Appen\n\nEn brugerflade til [modellen](https://github.com/skj-1964/fjernvarme-businesscase).\n\n## Mere\n")
    skriv(rod, "fabric/fjv/konstanter.py", f'MODEL_COMMIT = "{MODEL_SHA}"\nDF_DATA_SHA = "{DATA_SHA}"\n')
    skriv(rod, "app/LICENSE", "Copyright (c) Microsoft Corporation.\n\nMIT License\n")
    skriv(rod, "app/src/sider/dokumentation/kredit.ts",
          'export const L = "Bygger på fjernvarme-businesscase af skj-1964 (MIT), udviklet med Billund Varme og Dansk Fjernvarme · data fra df-data · Om og kredit";\n')
    skriv(rod, "app/src/sider/dokumentation/kredit.spec.ts", "// test\n")
    # K6-F3: en realistisk monteringskaede - skallen bruger Sidefod, som bruger Kreditlinje, som bruger kredit.ts.
    skriv(rod, "app/src/App.tsx", 'import { Sidefod } from "@/components/layout";\nexport default function App() { return <div><Sidefod /></div>; }\n')
    skriv(rod, "app/src/components/layout/index.tsx", 'export { Sidefod } from "./Sidefod";\n')
    skriv(rod, "app/src/components/layout/Sidefod.tsx",
          'import { Kreditlinje } from "../../sider/dokumentation/Kreditlinje";\n'
          'export function Sidefod() { return <div data-layout="kreditlinje"><Kreditlinje /></div>; }\n')
    skriv(rod, "app/src/sider/dokumentation/Kreditlinje.tsx",
          'import { L } from "./kredit";\nexport function Kreditlinje() { return <footer>{L}</footer>; }\n')
    skriv(rod, "app/src/sider/dokumentation/indhold/kreditter/df-data_README_licens.md", "Data er CC BY 4.0.\n")
    skriv(rod, "app/src/sider/dokumentation/indhold/repo/licens.txt", "Permission is hereby granted, free of charge\n")
    return rod


def krav(rod: Path, filer=None):
    filer = filer if filer is not None else T.alle_filer(rod)
    return [f for f in T.tjek_krav(rod, set(filer), KREDIT) if f.niveau == "fejl"]


class Taeppe(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.addCleanup(self._t.cleanup)
        self.rod = Path(self._t.name) / "produkt"
        self.rod.mkdir()


class TestGlob(unittest.TestCase):
    def test_stjerne_krydser_ikke_mapper_men_dobbeltstjerne_goer(self):
        self.assertTrue(T.glob_match("app/*.log", "app/x.log"))
        self.assertFalse(T.glob_match("app/*.log", "app/sub/x.log"))
        self.assertTrue(T.glob_match("**/*.log", "x.log"))
        self.assertTrue(T.glob_match("**/*.log", "a/b/x.log"))
        self.assertTrue(T.glob_match("app/.env*", "app/.env.local"))
        self.assertTrue(T.glob_match("offentlig/skabeloner/**", "offentlig/skabeloner/konfig.ts"))
        self.assertFalse(T.glob_match("offentlig/skabeloner/**", "offentlig/kredit.json"))

    def test_klammer_er_literale(self):
        # `[dev]` er en tegnklasse i fnmatch/glob; her skal den vaere tegn for tegn (husets glob-fælde).
        self.assertTrue(T.glob_match("a/[dev]/x", "a/[dev]/x"))
        self.assertFalse(T.glob_match("a/[dev]/x", "a/d/x"))


class TestFilsaet(Taeppe):
    def test_udelader_mapper_filer_og_erstatningskilder(self):
        for rel in ("app/src/a.ts", "app/node_modules/x/y.js", "app/dist/a.js", "fabric/_lokal/venv/x.py",
                    "app/.env.local", "app/rayfin/.deployments.json", "app/rayfin_up_A1.log",
                    "offentlig/forbud.privat.json", "offentlig/skabeloner/konfig.ts", "README.public.md"):
            skriv(self.rod, rel, "x")
        off, priv = T.filsaet(self.rod, REGLER)
        self.assertEqual(off, ["app/src/a.ts"])
        grunde = dict(priv)
        for rel in ("app/node_modules/", "app/dist/", "fabric/_lokal/", "app/.env.local",
                    "app/rayfin/.deployments.json", "app/rayfin_up_A1.log", "offentlig/forbud.privat.json"):
            self.assertIn(rel, grunde, rel)
            self.assertTrue(grunde[rel])  # altid med en grund

    def test_mappenavn_matcher_kun_hele_stisegmenter(self):
        skriv(self.rod, "app/src/distance.ts", "x")  # 'dist' er IKKE segmentet 'distance.ts'
        skriv(self.rod, "app/src/dist_tabel/a.ts", "x")
        off, _ = T.filsaet(self.rod, REGLER)
        self.assertEqual(sorted(off), ["app/src/dist_tabel/a.ts", "app/src/distance.ts"])


class TestScan(Taeppe):
    def scan(self, rel, tekst, forbud=FORBUD, hoestet=frozenset()):
        skriv(self.rod, rel, tekst)
        return T.scan(self.rod, [rel], forbud, hoestet)

    def test_ren_fil_giver_intet(self):
        self.assertEqual(self.scan("a.ts", "const x = 1; // alm. kode, a@b.dk\n"), [])

    def test_litteral_uanset_versaler_med_fil_og_linje(self):
        f = self.scan("a.ts", "linje1\nVi bruger HemmeligFirma her\n")
        self.assertEqual([(x.niveau, x.regel, x.fil, x.linje) for x in f], [("fejl", "organisation", "a.ts", 2)])

    def test_overlappende_fund_meldes_kun_een_gang(self):
        f = self.scan("a.md", "kontakt pia@hemmeligfirma.example.com om hemmeligfirma")
        self.assertEqual([(x.regel, x.linje) for x in f], [("e-mail", 1), ("organisation", 1)])

    def test_advarselsniveau_er_ikke_en_fejl(self):
        f = self.scan("a.ts", "se KUN-ADVARSEL\n")
        self.assertEqual([x.niveau for x in f], ["advarsel"])

    def test_regex_sti_tema_og_email(self):
        self.assertEqual([x.regel for x in self.scan("a.md", "fil " + WINSTI)], ["intern-sti"])
        self.assertEqual([x.regel for x in self.scan("b.md", "tema: " + SLUG)], ["tema"])
        self.assertEqual([x.regel for x in self.scan("c.md", "mail pia@sub.hemmeligfirma.example.com")], ["e-mail"])  # een gang: e-mailen, ikke ogsaa organisationen

    def test_forbudt_guid_men_ikke_syntetisk_guid(self):
        f = self.scan("a.ts", f'const W = "{TEST_WS.upper()}";\n')
        self.assertEqual([x.regel for x in f], ["workspace-id"])
        self.assertEqual(self.scan("b.ts", 'const s = "11111111-1111-4111-8111-111111111111";\n'), [])

    def test_fund_viser_aldrig_hele_id_et(self):
        f = self.scan("a.ts", f'W = "{TEST_WS}"\n')
        self.assertNotIn(TEST_WS[-12:], f[0].tekst)
        self.assertIn(TEST_WS[:8], f[0].tekst)

    def test_hoestet_guid_fra_deploytilstand(self):
        ny = "0f1e2d3c-a1b2-4c3d-8e4f-" + "123456789abd"  # ingen gentaget cifferfoelge -> ikke 'syntetisk'
        self.assertEqual([x.regel for x in self.scan("a.ts", f"x = '{ny}'\n", hoestet=frozenset({ny}))], ["deploy-tilstand"])
        self.assertEqual([x.niveau for x in self.scan("b.ts", f"x = '{ny}'\n")], ["advarsel"])  # uden hoest: ukendt ikke-syntetisk

    def test_ukendt_email_er_advarsel_tilladt_er_stille(self):
        self.assertEqual([x.niveau for x in self.scan("a.md", "kontakt ukendt@andet.test")], ["advarsel"])
        self.assertEqual(self.scan("b.md", "kontakt x@example.com og a@b.dk"), [])

    def test_filnavne_checkes_ogsaa_naar_indholdet_er_binaert(self):
        skriv(self.rod, "app/.env.local", b"\x00\x01\x02")
        tema = "tema/" + SLUG_FIL + ".json"
        skriv(self.rod, tema, b"\x00\xff")
        f = T.scan(self.rod, ["app/.env.local", tema], FORBUD, frozenset())
        self.assertEqual(sorted(x.regel for x in f), ["deploy-tilstand", "tema"])

    def test_lange_tegnraekker_er_lineaere(self):
        # Regression: et ledende [A-Za-z0-9._%+-]+@ var kvadratisk paa base64/minificeret JS og lod gaten tage minutter.
        import time
        t0 = time.monotonic()
        f = self.scan("blob.js", "a" * 2_000_000 + "\n" + "ab.c-d" * 300_000 + "@x\n")
        self.assertEqual(f, [])
        self.assertLess(time.monotonic() - t0, 10)

    def test_email_midt_i_en_lang_linje_findes_og_faar_rigtig_linje(self):
        f = self.scan("a.md", "x\n" + "q" * 500 + " ukendt@andet.test " + "q" * 500 + "\n")
        self.assertEqual([(x.regel, x.linje) for x in f], [("e-mail-ukendt", 2)])

    def test_ukendt_binaer_fil_er_en_fejl_men_en_tilladt_type_springes_over(self):
        # K6-F2: tidligere en stille skip. Nu: uden for tilladelseslisten er "ikke scannet" en FEJL.
        skriv(self.rod, "x.bin", b"\x00hemmeligfirma\x00")
        self.assertEqual([f.regel for f in T.scan(self.rod, ["x.bin"], FORBUD, frozenset())], ["ikke-scannet"])
        self.assertEqual(T.scan(self.rod, ["x.bin"], FORBUD, frozenset(), binaere=["**/*.bin"]), [])


class TestHoest(Taeppe):
    def test_id_fra_deploytilstand_samles(self):
        skriv(self.rod, "app/.env.local", "A=0f0f0f0f-aaaa-4bbb-8ccc-123456789abc\nURL=https://x/ws/1a1a1a1a-bbbb-4ccc-8ddd-0123456789ab/y\n")
        skriv(self.rod, "app/rayfin/.env", "nope")
        g = T.hoest_guids(self.rod, REGLER)
        self.assertEqual(g, {"0f0f0f0f-aaaa-4bbb-8ccc-123456789abc", "1a1a1a1a-bbbb-4ccc-8ddd-0123456789ab"})

    def test_manglende_tilstandsfiler_er_ikke_en_fejl(self):
        self.assertEqual(T.hoest_guids(self.rod, REGLER), set())


class TestKrav(Taeppe):
    def setUp(self):
        super().setUp()
        lav_produkt(self.rod)

    def raab(self, fejl):
        return " | ".join(f.regel + ": " + f.tekst for f in fejl)

    def test_udgangspunktet_opfylder_alle_krav(self):
        self.assertEqual(krav(self.rod), [], self.raab(krav(self.rod)))

    def fejler(self, regel):
        fejl = krav(self.rod)
        self.assertIn(regel, {f.regel for f in fejl}, self.raab(fejl))
        return fejl

    def test_credits_mangler(self):
        (self.rod / "CREDITS.md").unlink()
        self.fejler("krav-credits")

    def test_credits_mangler_et_paakraevet_ord(self):
        for ord_ in ("Energinet", "api.sysapp.dk", "Billund Varme", "CC BY 4.0", "distribuerer ikke modellens kode",
                     "pinnet commit", "brugerflade til"):
            with self.subTest(ord=ord_):
                skriv(self.rod, "CREDITS.md", credits_tekst().replace(ord_, "XXXX"))
                fejl = self.fejler("krav-credits")
                self.assertTrue(any(ord_ in f.tekst for f in fejl), ord_)

    def test_et_udtryk_over_to_linjer_eller_med_fed_skrift_taeller(self):
        # Maalt paa den rigtige CREDITS.md: "en pinnet" + linjeskift + "commit" brod kravet, selvom ordene var der.
        skriv(self.rod, "CREDITS.md", credits_tekst().replace("pinnet commit", "**pinnet**" + chr(10) + "commit"))
        self.assertEqual(krav(self.rod), [])

    def test_notice_mangler(self):
        (self.rod / "NOTICE").unlink()
        self.fejler("krav-notice")

    def test_licenstekst_mangler_eller_er_aendret(self):
        (self.rod / "LICENSES/fjernvarme-businesscase_LICENSE.txt").unlink()
        self.fejler("krav-licenstekst")
        lav_produkt(self.rod)
        p = self.rod / "LICENSES/df-data_LICENSE.txt"
        p.write_bytes(p.read_bytes().replace(b"Steen", b"Stine"))
        self.fejler("krav-licenstekst")

    def test_linjeskift_i_licenstekst_er_ligegyldigt(self):
        p = self.rod / "LICENSES/fjernvarme-businesscase_LICENSE.txt"
        p.write_bytes(p.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
        self.assertEqual(krav(self.rod), [])

    def test_egen_licens_mangler_eller_har_pladsholder(self):
        skriv(self.rod, "LICENSE", "MIT\n\nCopyright (c) 2026 [RETTIGHEDSHAVER - ÅBENT PRODUKTEJERVALG]\n")
        self.fejler("krav-licens")
        (self.rod / "LICENSE").unlink()
        self.fejler("krav-licens")

    def test_readme_foerste_afsnit_skal_pege_paa_den_oprindelige_case(self):
        skriv(self.rod, "README.md", "# Appen\n\nHer er en app.\n")
        self.fejler("krav-readme")
        (self.rod / "README.md").unlink()
        self.fejler("krav-readme")

    def test_readme_linket_for_langt_nede_taeller_ikke(self):
        skriv(self.rod, "README.md", "# Appen\n" + "\nfyld\n" * 30 + "[m](https://github.com/skj-1964/fjernvarme-businesscase)\n")
        self.fejler("krav-readme")

    def test_pin_i_credits_skal_vaere_lig_konstanter(self):
        skriv(self.rod, "fabric/fjv/konstanter.py", f'MODEL_COMMIT = "{"c" * 40}"\nDF_DATA_SHA = "{DATA_SHA}"\n')
        fejl = self.fejler("krav-pin")
        self.assertTrue(any("MODEL_COMMIT" in f.tekst for f in fejl))
        lav_produkt(self.rod)
        skriv(self.rod, "fabric/fjv/konstanter.py", f'MODEL_COMMIT = "{MODEL_SHA}"\nDF_DATA_SHA = "{"e" * 40}"\n')
        fejl = self.fejler("krav-pin")
        self.assertTrue(any("DF_DATA_SHA" in f.tekst for f in fejl))

    def test_konstanter_uden_pin_er_en_fejl_ikke_en_stille_succes(self):
        skriv(self.rod, "fabric/fjv/konstanter.py", "# ingen pins\n")
        self.fejler("krav-pin")

    def test_appens_pin_skal_vaere_lig_konstanter(self):
        skriv(self.rod, "app/src/sider/dokumentation/kilde.ts", f'commit: "{"f" * 40}", // MODELREPO\n')
        # kilde.ts uden de to kendte nøgler tjekkes ikke; med MODELREPO/DATAREPO-blokke skal SHA'erne passe
        skriv(self.rod, "app/src/sider/dokumentation/kilde.ts",
              f'export const MODELREPO = {{ commit: "{"f" * 40}" }}\nexport const DATAREPO = {{ commit: "{DATA_SHA}" }}\n')
        self.fejler("krav-pin")

    def test_kreditlinje_mangler_i_appen(self):
        skriv(self.rod, "app/src/sider/dokumentation/kredit.ts", "export const L = 'Bygger på noget andet';\n")
        self.fejler("krav-kreditlinje")

    def test_kreditlinje_kun_i_spec_taeller_ikke(self):
        d = self.rod / "app/src/sider/dokumentation"
        (d / "kredit.spec.ts").unlink()
        (d / "kredit.ts").rename(d / "kredit.spec.ts")
        self.fejler("krav-kreditlinje")

    def test_sidefoden_mangler_hook(self):
        skriv(self.rod, "app/src/components/layout/Sidefod.tsx", "export const Sidefod = () => <footer />;\n")
        self.fejler("krav-kreditlinje")

    def test_hook_uden_for_skallen_taeller_ikke(self):
        (self.rod / "app/src/components/layout/Sidefod.tsx").unlink()
        skriv(self.rod, "app/src/sider/x/index.tsx", 'export const A = () => <p data-layout="kreditlinje" />;\n')
        self.fejler("krav-kreditlinje")

    def test_om_og_kredit_mangler(self):
        skriv(self.rod, "app/src/sider/dokumentation/kredit.ts",
              'export const L = "Bygger på fjernvarme-businesscase af skj-1964 (MIT), udviklet med Billund Varme og Dansk Fjernvarme · data fra df-data";\n')
        self.fejler("krav-kreditlinje")

    def test_licenstekster_skal_bundtes_i_appen(self):
        (self.rod / "app/src/sider/dokumentation/indhold/repo/licens.txt").unlink()
        self.fejler("krav-app-licens")
        lav_produkt(self.rod)
        (self.rod / "app/src/sider/dokumentation/indhold/kreditter/df-data_README_licens.md").unlink()
        self.fejler("krav-app-licens")

    def test_tredjepartslicens_bevares(self):
        skriv(self.rod, "app/LICENSE", "MIT License\n")
        self.fejler("krav-tredjepart")
        (self.rod / "app/LICENSE").unlink()
        self.fejler("krav-tredjepart")

    def test_antydning_af_godkendelse_afvises(self):
        for tekst in ("Appen er godkendt af Dansk Fjernvarme.", "Den officielle app til Dansk Fjernvarme",
                      "Official app for fjernvarme-businesscase", "Udviklet i samarbejde med Billund Fjernvarme", "Udviklet i samarbejde med Billund Varme"):
            with self.subTest(tekst=tekst):
                skriv(self.rod, "app/src/sider/x/om.tsx", f"<p>{tekst}</p>\n")
                self.fejler("krav-antydning")
                (self.rod / "app/src/sider/x/om.tsx").unlink()

    def test_ingen_godkendelse_undtagelse_og_citatet_fra_modellen_er_ok(self):
        skriv(self.rod, "app/src/sider/x/om.tsx",
              "<p>Ingen godkendelse: appen er ikke godkendt af Dansk Fjernvarme.</p>\n"
              "<p>udviklet sammen med **Billund Varme** og **Dansk Fjernvarme**</p>\n")
        self.assertEqual(krav(self.rod), [])

    def test_krav_ignorerer_filer_uden_for_det_offentlige_saet(self):
        # CREDITS.md findes paa disken, men er ikke med i saettet -> kravet fejler (mangler i eksporten)
        filer = set(T.alle_filer(self.rod)) - {"CREDITS.md"}
        self.assertIn("krav-credits", {f.regel for f in T.tjek_krav(self.rod, filer, KREDIT) if f.niveau == "fejl"})


class TestKoer(Taeppe):
    def test_arbejdstrae_rapporterer_offentlige_fund_og_privat_saet(self):
        lav_produkt(self.rod)
        skriv(self.rod, "app/.env.local", f"A={TEST_WS}\n")
        skriv(self.rod, "app/src/x.ts", f"// {TEST_WS}\n")
        res = T.koer(self.rod, mappe=None, regler=dict(REGLER, erstat=[]), forbud=FORBUD, kredit=KREDIT)
        self.assertIn("app/.env.local", [p for p, _ in res.privat])
        fejl = [f for f in res.funde if f.niveau == "fejl"]
        self.assertEqual([(f.fil, f.regel) for f in fejl], [("app/src/x.ts", "workspace-id")])

    def test_eksportmappe_scanner_alt_uden_regler(self):
        lav_produkt(self.rod)
        skriv(self.rod, "app/.env.local", "x")
        res = T.koer(self.rod, mappe=self.rod, regler=REGLER, forbud=FORBUD, kredit=KREDIT)
        self.assertIn(("app/.env.local", "deploy-tilstand"), [(f.fil, f.regel) for f in res.funde])
        self.assertEqual(res.privat, [])

    def test_exitkode_og_ascii_uddata(self):
        lav_produkt(self.rod)
        fp = Path(self._t.name) / "forbud.json"
        fp.write_text(json.dumps(FORBUD), encoding="utf-8")
        import contextlib
        import io
        argv = [str(self.rod), "--forbud", str(fp), "--stille"]
        with contextlib.redirect_stdout(io.StringIO()) as ud:
            self.assertEqual(T.main(argv), 0)
            skriv(self.rod, "app/src/x.ts", "hemmeligfirma\n")
            self.assertEqual(T.main(argv), 1)
        self.assertIn("RESULTAT: FEJL", ud.getvalue())
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(T.main([str(self.rod), "--forbud", str(self.rod / "findes-ikke.json")]), 2)  # uden liste: brugsfejl


class TestKunKrav(Taeppe):
    """Fabric-udgaven: kreditten er et krav i BEGGE udgaver, men forbudslisten er kun for den offentlige."""

    def koer(self):
        import contextlib
        import io
        with contextlib.redirect_stdout(io.StringIO()):
            return T.main([str(self.rod), "--kun-krav", "--stille"])

    def test_et_komplet_trae_bestaar_uden_forbudsliste(self):
        lav_produkt(self.rod)
        skriv(self.rod, "app/.env.local", "privat tilstand er tilladt i Fabric-udgaven")
        self.assertEqual(self.koer(), 0)

    def test_manglende_kredit_fejler_ogsaa_i_fabric_udgaven(self):
        lav_produkt(self.rod)
        (self.rod / "CREDITS.md").unlink()
        self.assertEqual(self.koer(), 1)


class TestSomScript(unittest.TestCase):
    """Scripts koeres som scripts - under `python -I` (isoleret: hverken cwd eller scriptmappe paa stien)."""

    def koer(self, *args):
        import subprocess
        return subprocess.run([sys.executable, "-I", *args], capture_output=True, text=True, timeout=120,
                              encoding="utf-8", errors="replace")

    def test_begge_scripts_starter_isoleret(self):
        for navn in ("tjek_offentlig.py",):
            r = self.koer(str(ROD / navn), "--help")
            self.assertEqual(r.returncode, 0, f"{navn}: {r.stderr[-400:]}")
            self.assertIn("usage", r.stdout.lower())



class TestHusregler(unittest.TestCase):
    def test_kildefilerne_kan_skrives_paa_en_cp1252_konsol(self):
        # Husets fælde: en pil i en print-streng dør af UnicodeEncodeError - i en fejlbesked, af alle steder.
        for navn in ("tjek_offentlig.py",):
            tekst = (ROD / navn).read_text(encoding="utf-8")
            try:
                tekst.encode("cp1252")
            except UnicodeEncodeError as e:
                self.fail(f"{navn}: tegn uden for cp1252 ved position {e.start}: {tekst[e.start]!r}")

    def test_scripts_er_ren_stdlib_og_importerer_ikke_hinanden_cirkulært(self):
        for navn in ("tjek_offentlig.py",):
            tekst = (ROD / navn).read_text(encoding="utf-8")
            for m in re.finditer(r"^\s*(?:import|from)\s+([A-Za-z_][\w.]*)", tekst, re.M):
                rod = m.group(1).split(".")[0]
                self.assertIn(rod, sys.stdlib_module_names | {"tjek_offentlig"}, f"{navn} importerer {rod}")


if __name__ == "__main__":
    unittest.main()
