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
                                       "README.md", "requirements.txt", "run_case.py", "cases", "src", "scripts"])
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
