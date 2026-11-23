"""Modprøver for trofasthedsgaten (Codex K8 F4, F5, F7) — skrevet FØR rettelsen.

Gaten (tjek_trofasthed.py) køres i en KOPI af appens relevante filer mod en KOPI af modelrepoet ved den pinnede
commit (``git archive``), hvor én antagelse ad gangen ændres. Hver ændring, appen kopierer eller er afhængig af, skal
gøre gaten rød — med og uden genbygning af spejlet, hvor det er relevant. De rigtige repoer røres ikke.

Kør:  python viden/vaerktoej/test_trofasthed.py        (kræver PyYAML og modelrepoet; ellers springes over)
"""
from __future__ import annotations

import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

HER = Path(__file__).resolve().parent
ROD = HER.parent.parent
sys.path.insert(0, str(HER))
sys.path.insert(0, str(ROD / "fabric"))

import byg_modelspejl as BM  # noqa: E402

KOPI = [("viden", "viden"), ("fabric/fjv", "fabric/fjv"), ("community/pyproject.toml", "community/pyproject.toml"),
        ("app/src/lib", "app/src/lib"), ("app/src/sider", "app/src/sider")]


class Modproever(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        kilde = BM.Kilde.find()
        if kilde is None or kilde.repo is None:
            raise unittest.SkipTest("modelrepoet (git) findes ikke - sæt FJV_MODELREPO")
        cls.tmp = Path(tempfile.mkdtemp(prefix="fjvtro_"))
        cls.app, cls.model = cls.tmp / "app", cls.tmp / "model"
        for fra, til in KOPI:
            src, dst = ROD / fra, cls.app / til
            dst.parent.mkdir(parents=True, exist_ok=True)
            if src.is_dir():
                shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", "node_modules", "*.spec.*", "__tests__"))
            else:
                shutil.copy(src, dst)
        raa = subprocess.check_output(["git", "-C", str(kilde.repo), "archive", "--format=zip", BM.PIN,
                                       "README.md", "requirements.txt", "run_case.py", "cases", "src", "scripts",
                                       "vaerksdata_skabelon.xlsx", "doc/BUDSTRATEGI.md"])   # runde 14c: spejlets budstrategi
        with zipfile.ZipFile(io.BytesIO(raa)) as z:
            z.extractall(cls.model)
        cls.miljoe = {**os.environ, "PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1", "FJV_MODELMAPPE": str(cls.model)}
        cls.miljoe.pop("FJV_TROFAST_UDEN_MODELREPO", None)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def _koer(self, script: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, f"viden/vaerktoej/{script}"], cwd=self.app, env=self.miljoe,
                              capture_output=True, text=True, encoding="utf-8", errors="replace")

    def gate(self) -> subprocess.CompletedProcess:
        return self._koer("tjek_trofasthed.py")

    def genbyg(self) -> subprocess.CompletedProcess:
        return self._koer("byg_modelspejl.py")

    def _gem(self, *filer: Path) -> dict:
        return {f: (f.read_bytes() if f.exists() else None) for f in filer}

    def _gendan(self, gemt: dict) -> None:
        for f, b in gemt.items():
            if b is None:
                f.unlink(missing_ok=True)
            else:
                f.write_bytes(b)

    def _ret(self, fil: Path, a: str, b: str, antal: int | None = 1) -> None:
        t = fil.read_text(encoding="utf-8")
        self.assertGreaterEqual(t.count(a), 1, f"{a!r} i {fil.name}")
        fil.write_text(t.replace(a, b) if antal is None else t.replace(a, b, antal), encoding="utf-8", newline="\n")

    def _spejlfiler(self):
        return (self.app / "viden" / "modelspejl.json", self.app / "app" / "src" / "lib" / "modelspejl.data.ts",
                self.app / "app" / "src" / "sider" / "konfiguration" / "skalering.vektorer.json")

    def assertRoed(self, r: subprocess.CompletedProcess, moenster: str) -> None:
        self.assertNotEqual(r.returncode, 0, r.stdout[-3000:])
        self.assertRegex(r.stdout, moenster)

    # ---------------------------------------------------------------------------------------------------------

    def test_0_uaendret_kopi_er_groen(self):
        r = self.gate()
        self.assertEqual(r.returncode, 0, r.stdout[-3000:] + r.stderr[-2000:])

    def test_R12_aendret_vaerksark_i_modelrepoet_er_roedt(self):
        """Runde 12: eksporten udfylder modelrepoets værksark; en ny skabelon i modelrepoet skal gøre spejlet rødt."""
        p = self.model / "vaerksdata_skabelon.xlsx"
        g = self._gem(p)
        try:
            p.write_bytes(p.read_bytes() + b" ")
            self.assertRoed(self.gate(), r"FEJL \[spejl\].*vaerksdata_skabelon\.xlsx")
        finally:
            self._gendan(g)

    def test_R14c_aendret_budstrategi_blok_er_roed(self):
        """Runde 14c: "Tilføj balancemarked" bygger blokken af BUDSTRATEGI.md's færdige blokke; et andet tal i
        modelrepoets blok skal gøre spejlet rødt, og et afsnit med en anden form skal stoppe genbygningen."""
        p = self.model / "doc" / "BUDSTRATEGI.md"
        g = self._gem(p)
        try:
            self._ret(p, "up_markup_dkk_mwh: 500  ", "up_markup_dkk_mwh: 300  ")
            self.assertRoed(self.gate(), r"FEJL \[spejl\].*modelspejl\.json.*budstrategi")
            self._gendan(g)
            self._ret(p, "Færdige YAML-blokke", "YAML-blokke")
            r = self.genbyg()
            self.assertNotEqual(r.returncode, 0, r.stdout[-2000:])
            self.assertIn("har ændret form", r.stdout + r.stderr)
        finally:
            self._gendan(g)

    def test_R15_ny_enhedstype_i_modelscriptet_er_roed_foer_og_efter_genbygning(self):
        """Runde 15: ved 939228a fik modellen oil_boiler, og gaten var grøn med en app, der ikke kendte typen. En ny
        type i scriptets tabel skal gøre spejlet rødt — og, når spejlet er bygget igen, typelisten ([5])."""
        p = self.model / "scripts" / "vaerksark_til_yaml.py"
        g = self._gem(p, *self._spejlfiler())
        try:
            self._ret(p, '"oil_boiler": "fuel_oil",', '"oil_boiler": "fuel_oil",\n    "wood_gasifier": "wood_gas",')
            self.assertRoed(self.gate(), r"FEJL \[spejl\].*vaerksark_typer")
            r = self.genbyg()
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertRoed(self.gate(), r"FEJL \[typer\] enhedstypen wood_gasifier står i modelscriptet")
        finally:
            self._gendan(g)

    def test_R15_aendret_co2_faktor_i_modelscriptet_er_roed_efter_genbygning(self):
        """Enhedstypens skabelon bærer scriptets CO2-faktor (0,266 t/MWh fyringsolie); et andet tal i scriptet skal ses."""
        p = self.model / "scripts" / "vaerksark_til_yaml.py"
        g = self._gem(p, *self._spejlfiler())
        try:
            self._ret(p, '"oil_boiler": 0.266', '"oil_boiler": 0.28')
            r = self.genbyg()
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertRoed(self.gate(), r"FEJL \[typer\].*oil_boiler.*co2_emissions_per_mwh_fuel.*0\.28")
        finally:
            self._gendan(g)

    def test_R15_typetabel_med_anden_form_stopper_genbygningen(self):
        p = self.model / "scripts" / "vaerksark_til_yaml.py"
        g = self._gem(p, *self._spejlfiler())
        try:
            self._ret(p, "GYLDIGE_TYPER = set(BRAENDSEL_PR_TYPE)", "BRAENDSEL_PR_TYPE = dict(BRAENDSEL_PR_TYPE)\nGYLDIGE_TYPER = set(BRAENDSEL_PR_TYPE)")
            r = self.genbyg()
            self.assertNotEqual(r.returncode, 0, r.stdout)
            self.assertRegex(r.stdout + r.stderr, r"BRAENDSEL_PR_TYPE")
        finally:
            self._gendan(g)

    def test_F4_skaleringsgraense_uden_genbygning(self):
        p = self.model / "scripts" / "vaerksark_til_yaml.py"
        g = self._gem(p)
        try:
            self._ret(p, "if aarsvolumen > 1 else 1.0", "if aarsvolumen > 10 else 1.0")
            self.assertRoed(self.gate(), r"FEJL \[spejl\].*varmelast_skalering")
        finally:
            self._gendan(g)

    def test_F4_skaleringens_else_uden_genbygning(self):
        p = self.model / "scripts" / "vaerksark_til_yaml.py"
        g = self._gem(p)
        try:
            self._ret(p, "if aarsvolumen > 1 else 1.0", "if aarsvolumen > 1 else 0.5")
            self.assertRoed(self.gate(), r"FEJL \[spejl\].*varmelast_skalering")
        finally:
            self._gendan(g)

    def test_F4_profilens_decimaler_uden_genbygning(self):
        p = self.model / "scripts" / "vaerksark_til_yaml.py"
        g = self._gem(p)
        try:
            self._ret(p, "[round(v * f, 3) for v in andeby_profil]", "[round(v * f, 2) for v in andeby_profil]")
            self.assertRoed(self.gate(), r"FEJL \[spejl\].*varmelast_skalering")
        finally:
            self._gendan(g)

    def test_F4_ukendt_regelform_stopper_genbygningen(self):
        p = self.model / "scripts" / "vaerksark_til_yaml.py"
        g = self._gem(p, *self._spejlfiler())
        try:
            self._ret(p, "if aarsvolumen > 1 else 1.0", "if aarsvolumen > 1 and aarsvolumen < 9999 else 1.0")
            r = self.genbyg()
            self.assertNotEqual(r.returncode, 0, r.stdout)
            self.assertRegex(r.stdout + r.stderr, r"skalering")
        finally:
            self._gendan(g)

    def test_F5_python3_i_casekommandoen_er_roed_foer_og_efter_genbygning(self):
        p = self.model / "cases" / "andeby.yaml"
        g = self._gem(p, *self._spejlfiler())
        try:
            self._ret(p, "python run_case.py cases/andeby.yaml", "python3 run_case.py cases/andeby.yaml", None)
            self.assertNotEqual(self.gate().returncode, 0)
            r = self.genbyg()
            if r.returncode == 0:              # genbygningen må gerne nægte; gør den ikke, skal gaten være rød
                self.assertRoed(self.gate(), r"FEJL \[(spejl|ordre|kommando)\].*andeby")
            else:
                self.assertRegex(r.stdout + r.stderr, r"andeby.*(fortolke|kommando)")
        finally:
            self._gendan(g)

    def test_F5_legacy_nettab_i_standardkommandoen_er_roed_efter_genbygning(self):
        p = self.model / "cases" / "andeby.yaml"
        g = self._gem(p, *self._spejlfiler())
        try:
            nål = "python run_case.py cases/andeby.yaml"
            self._ret(p, nål, nål + " --legacy-nettab", 1)
            r = self.genbyg()
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertRoed(self.gate(), r"FEJL \[ordre\].*andeby.*--legacy-nettab")
        finally:
            self._gendan(g)

    def test_F5_ukendt_flag_stopper_genbygningen(self):
        p = self.model / "cases" / "andeby.yaml"
        g = self._gem(p, *self._spejlfiler())
        try:
            nål = "python run_case.py cases/andeby.yaml"
            self._ret(p, nål, nål + " --turbo", 1)
            r = self.genbyg()
            self.assertNotEqual(r.returncode, 0, r.stdout)
            self.assertRegex(r.stdout + r.stderr, r"--turbo")
        finally:
            self._gendan(g)

    def test_F7_manglende_model_sektion_er_roed(self):
        p = self.app / "community" / "pyproject.toml"
        g = self._gem(p)
        try:
            t, n = re.subn(r"^model = \[.*?^\]\s*\n", "", p.read_text(encoding="utf-8"), flags=re.S | re.M)
            self.assertEqual(n, 1)
            p.write_text(t, encoding="utf-8", newline="\n")
            self.assertRoed(self.gate(), r"FEJL \[pakker\].*model")
        finally:
            self._gendan(g)

    def test_P1_gammel_model_commit_uden_maerke_er_roed(self):
        # En viden-fil, der LÆSER modelrepoet ved pinnen (her knapper.json), skal have pinnen.
        p = self.app / "viden" / "knapper.json"
        g = self._gem(p)
        try:
            self._ret(p, f'"model_commit": "{BM.PIN}"', '"model_commit": "eef950a2ac7b3808a9456dcf48742ce08e52366a"')
            self.assertRoed(self.gate(), r"FEJL \[pins\].*knapper\.json")
        finally:
            self._gendan(g)

    def test_P2_regnet_ved_skal_vaere_en_forfader_til_pinnen(self):
        # referencetal.json: model_commit er den version, tallene er REGNET ved (referencer.ts, README_PINS) og
        # må være ældre end pinnen — men kun en commit i pinnens historie, ikke et vilkårligt SHA.
        p = self.app / "viden" / "referencetal.json"
        g = self._gem(p)
        try:
            t = p.read_text(encoding="utf-8")
            t2 = re.sub(r'"model_commit": "[0-9a-f]{40}"', '"model_commit": "' + "0" * 40 + '"', t, count=1)
            self.assertNotEqual(t, t2)
            p.write_text(t2, encoding="utf-8", newline="\n")
            self.assertRoed(self.gate(), r"FEJL \[pins\].*referencetal\.json")
        finally:
            self._gendan(g)

    def test_F7_tom_model_sektion_er_roed(self):
        p = self.app / "community" / "pyproject.toml"
        g = self._gem(p)
        try:
            t, n = re.subn(r"^model = \[.*?^\]", "model = []", p.read_text(encoding="utf-8"), flags=re.S | re.M)
            self.assertEqual(n, 1)
            p.write_text(t, encoding="utf-8", newline="\n")
            self.assertRoed(self.gate(), r"FEJL \[pakker\]")
        finally:
            self._gendan(g)


class Lagersum(unittest.TestCase):
    """Modprøver for sammenligningen på summen over lagre (runde 15, iagttagelse 3.7; ``lagersum.py``).

    To timefiler med samme samlede lager, men en anden fordeling mellem tankene, er ens; ændres summen, en enheds
    produktion eller noget andet, er de det ikke. Syntetiske filer i modellens egen form — kræver ikke modelrepoet."""

    HOVED = ("timestamp,heat_load_mw,p_halmkedel_mw,tank_hoej_level_mwh,tank_hoej_level_pct,tank_hoej_charge_mw,"
             "tank_hoej_discharge_mw,tank_hoej_net_mw,tank_lav_level_mwh,tank_lav_level_pct,tank_lav_charge_mw,"
             "tank_lav_discharge_mw,tank_lav_net_mw")

    @staticmethod
    def fil(raekker):
        return "\n".join([Lagersum.HOVED, *(",".join(str(x) for x in r) for r in raekker)]) + "\n"

    def setUp(self):
        import lagersum
        self.L = lagersum
        # Samme sum (209,5 MWh; netto −4,344 MW), fordelt forskelligt — som de to optimale løsninger, testen målte.
        self.a = self.fil([["2026-01-05T01:00:00", 19.8, 12.0, 91.5, 47.7, 20.656, 0.0, 20.656, 118.0, 48.3, 0.0, 25.0, -25.0],
                           ["2026-01-05T02:00:00", 19.9, 12.0, 100.0, 52.1, 8.5, 0.0, 8.5, 120.0, 49.1, 2.0, 0.0, 2.0]])
        self.b = self.fil([["2026-01-05T01:00:00", 19.8, 12.0, 159.5, 83.1, 0.0, 4.344, -4.344, 50.0, 20.5, 0.0, 0.0, 0.0],
                           ["2026-01-05T02:00:00", 19.9, 12.0, 170.0, 88.6, 10.5, 0.0, 10.5, 50.0, 20.5, 0.0, 0.0, 0.0]])

    def test_samme_sum_anden_fordeling_er_ens(self):
        r = self.L.sammenlign(self.a, self.b)
        self.assertEqual((r["byte_ens"], r["ens_paa_sum"], r["forskelle"]), (False, True, []))
        self.assertEqual(r["lagre"], ["tank_hoej", "tank_lav"])
        self.assertAlmostEqual(r["maks_pr_lager_mwh"], 70.0)

    def test_byte_ens_er_ens(self):
        r = self.L.sammenlign(self.a, self.a)
        self.assertEqual((r["byte_ens"], r["ens_paa_sum"]), (True, True))

    def test_aendret_samlet_lager_er_en_forskel(self):
        b = self.b.replace("159.5", "159.6")                     # summen 209,6 mod 209,5 MWh
        r = self.L.sammenlign(self.a, b)
        self.assertFalse(r["ens_paa_sum"])
        self.assertRegex(r["forskelle"][0], r"linje 2: samlet lagerindhold")

    def test_aendret_nettoeffekt_er_en_forskel(self):
        b = self.b.replace("-4.344", "-4.300")                   # nettoen −4,300 mod −4,344 MW
        r = self.L.sammenlign(self.a, b)
        self.assertFalse(r["ens_paa_sum"])
        self.assertRegex(r["forskelle"][0], r"samlet nettoeffekt")

    def test_aendret_produktion_er_en_forskel_selv_med_samme_lagersum(self):
        b = self.b.replace("19.9,12.0", "19.9,11.9")             # halmkedlen 11,9 mod 12,0 MW i time 2
        r = self.L.sammenlign(self.a, b)
        self.assertFalse(r["ens_paa_sum"])
        self.assertRegex(r["forskelle"][0], r"linje 3, p_halmkedel_mw: 12.0 mod 11.9 \(ikke en lagerkolonne\)")

    def test_en_manglende_raekke_er_en_forskel(self):
        r = self.L.sammenlign(self.a, self.b.rsplit("\n", 2)[0] + "\n")
        self.assertFalse(r["ens_paa_sum"])
        self.assertRegex(r["forskelle"][0], r"antal rækker: 2 mod 1")

    def test_et_lager_kraever_byte_lighed(self):
        et = "timestamp,p_x_mw,tank_level_mwh,tank_net_mw\n2026-01-05T01:00:00,1.0,{},0.0\n"
        r = self.L.sammenlign(et.format("50.0"), et.format("50.0000001"))
        self.assertFalse(r["ens_paa_sum"])
        self.assertRegex(r["forskelle"][0], r"færre end to lagre")


if __name__ == "__main__":
    unittest.main(verbosity=2)
