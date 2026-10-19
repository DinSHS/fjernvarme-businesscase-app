"""K5-rettelser i motoren (Codex K5: F3, F4, F5, F12 - Python-delen). Hver test fejler før.

* F3 - værksarkets udpakkede størrelse kontrolleres, før modelscriptet læser det, og
  scriptet køres med hukommelsesloft og tidsgrænse.
* F4 - en import, hvis jobstart fejlede, står i ``koe``; hvert importjob tømmer køen.
* F5 - kørslens periode er modellens egen akse (casens bare slutdato = midnat), bevist
  mod modellens ``make_time_index`` med en vektorfil, appen også tester mod.
* F12 - en frosset solprofil, som ingen aktiv enhed bruger, hentes og tjekkes ikke, og
  ``manifest_json.tidsserier`` siger, hvad der faktisk blev brugt.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

HER = Path(__file__).resolve().parent
sys.path.insert(0, str(HER.parent))
from fjv import koersel as KS  # noqa: E402
from fjv import konstanter as K  # noqa: E402
from fjv import runtime as R  # noqa: E402
from fjv import tidsserie as TS  # noqa: E402
from fjv import vaerksark as VS  # noqa: E402
from fjv.byg_case import InputFejl, _effektiv_tid, byg  # noqa: E402
from tests.test_tidsserier import CASE, MODELREPO, UUID1, raekker, ref, serie, timer  # noqa: E402

VEKTORER = json.loads((HER / "data" / "periode_vektorer.json").read_text(encoding="utf-8"))["vektorer"]
try:
    import pandas  # noqa: F401
    HAR_PANDAS = True
except ImportError:
    HAR_PANDAS = False


def zipfil(sti: Path, medlemmer: dict[str, bytes]) -> Path:
    with zipfile.ZipFile(sti, "w", zipfile.ZIP_DEFLATED) as z:
        for navn, data in medlemmer.items():
            z.writestr(navn, data)
    return sti


# ------------------------------------------------------------------ F3

class TestF3Ressourcer(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_normalt_ark_accepteres(self):
        # Som et udfyldt år: ~1 MB XML, kompressionsforhold ~7.
        import random
        rnd = random.Random(1)
        xml = "".join(f"<c r='B{i}'><v>{rnd.random() * 30:.3f}</v></c>" for i in range(40000)).encode()
        d = VS.tjek_zip(zipfil(self.tmp / "ok.xlsx", {"xl/worksheets/sheet2.xml": xml,
                                                      "[Content_Types].xml": b"<x/>"}))
        self.assertEqual(d["medlemmer"], 2)

    def test_kompressionsbombe_afvises(self):
        # K5's prøve: 8 MiB gentagen XML pakker til ~29 KB (forhold ~290).
        bombe = zipfil(self.tmp / "b.xlsx", {"xl/worksheets/sheet1.xml": b"<!--" + b"A" * (8 * 2 ** 20) + b"-->"})
        with self.assertRaises(VS.ArkFejl) as f:
            VS.tjek_zip(bombe)
        self.assertIn("pakker sig", str(f.exception))

    def test_for_stort_medlem_og_for_mange_dele(self):
        import os
        stor = zipfil(self.tmp / "s.xlsx", {"x.xml": os.urandom(17 * 2 ** 20)})
        with self.assertRaises(VS.ArkFejl):
            VS.tjek_zip(stor)
        mange = zipfil(self.tmp / "m.xlsx", {f"x{i}.xml": b"x" for i in range(VS.MAKS_MEDLEMMER + 1)})
        with self.assertRaises(VS.ArkFejl):
            VS.tjek_zip(mange)
        (self.tmp / "ikke.xlsx").write_bytes(b"PK\x03\x04 ikke en zip")
        with self.assertRaises(VS.ArkFejl):
            VS.tjek_zip(self.tmp / "ikke.xlsx")

    def test_bombe_naar_aldrig_scriptet(self):
        files = self.tmp / "Files"
        up = files / "fjv" / "uploads"
        up.mkdir(parents=True)
        zipfil(up / f"{UUID1}.xlsx", {"xl/worksheets/sheet1.xml": b"A" * (8 * 2 ** 20)})
        kaldt, fejl = [], []
        gl = {n: getattr(R, n) for n in ("sikr_model", "lokal_kodekopi", "byg_miljoe")}
        gl_script, gl_fejl = VS.koer_script, VS.saet_fejl
        try:
            R.sikr_model = lambda sha, files=None: kaldt.append("model") or (self.tmp, {})
            R.lokal_kodekopi = lambda *a, **k: self.tmp
            R.byg_miljoe = lambda *a, **k: "python"
            VS.koer_script = lambda *a, **k: kaldt.append("script") or (0, "")
            VS.saet_fejl = lambda db, i, besked: fejl.append(besked) or True
            from fjv.rapport import Rapport
            r = VS.importer_et(None, {"id": UUID1}, K.MODEL_COMMIT, False,
                               Rapport("t", sti=str(self.tmp / "r.json")), files=str(files))
        finally:
            for n, f in gl.items():
                setattr(R, n, f)
            VS.koer_script, VS.saet_fejl = gl_script, gl_fejl
        self.assertEqual(r["status"], "fejl")
        self.assertEqual(kaldt, [], "modelscriptet (og modelkoden) må ikke røres for en bombe")
        self.assertIn("pakker sig", fejl[0])

    def test_script_koeres_med_begraensning_og_tidsgraense(self):
        set_ = {}
        gl_run, gl_b = subprocess.run, VS.begraens_proces
        try:
            VS.begraens_proces = lambda: "LOFT"
            subprocess.run = lambda argv, **kw: set_.update(kw) or subprocess.CompletedProcess(argv, 0, "ok", "")
            VS.koer_script(self.tmp, "python", self.tmp / "a.xlsx", self.tmp / "ud", False)
        finally:
            subprocess.run, VS.begraens_proces = gl_run, gl_b
        self.assertEqual(set_["preexec_fn"], "LOFT")
        self.assertEqual(set_["timeout"], 900)

    def test_hukommelse_og_timeout_bliver_laesbare_fejl(self):
        gl = subprocess.run
        try:
            subprocess.run = lambda argv, **kw: subprocess.CompletedProcess(
                argv, 1, "", "Traceback ...\nMemoryError")
            with self.assertRaises(VS.ArkFejl) as f:
                VS.koer_script(self.tmp, "python", self.tmp / "a.xlsx", self.tmp / "ud", False)
            self.assertIn("hukommelse", str(f.exception))

            def langsom(argv, **kw):
                raise subprocess.TimeoutExpired(argv, kw["timeout"])
            subprocess.run = langsom
            with self.assertRaises(VS.ArkFejl):
                VS.koer_script(self.tmp, "python", self.tmp / "a.xlsx", self.tmp / "ud", False)
        finally:
            subprocess.run = gl

    @unittest.skipUnless(sys.platform.startswith("linux"), "RLIMIT_AS findes kun på Linux (Fabric)")
    def test_loftet_virker_paa_linux(self):
        r = subprocess.run([sys.executable, "-c", "import resource; print(resource.getrlimit(resource.RLIMIT_AS)[0])"],
                           capture_output=True, text=True, preexec_fn=VS.begraens_proces())
        self.assertEqual(int(r.stdout.strip()), VS.HUKOMMELSE_BYTES)
        self.assertEqual(VS.maal_loft()["maalt"], VS.HUKOMMELSE_BYTES)

    @unittest.skipIf(sys.platform.startswith("linux"), "uden for Linux")
    def test_maal_loft_uden_linux_siger_ikke_maalt(self):
        # Ikke-Linux: intet loft at måle - rapporten skal sige det, ikke påstå et tal.
        self.assertEqual(VS.maal_loft(), {"platform": sys.platform,
                                          "forventet": VS.HUKOMMELSE_BYTES, "maalt": None})


# ------------------------------------------------------------------ F4

class TestF4Koe(unittest.TestCase):
    def koer(self, koe: list[str], import_id: str):
        taget = []

        def tag(db, i):
            kand = [x for x in koe if (i is None or x == i)]
            if not kand:
                return None
            koe.remove(kand[0])
            taget.append(kand[0])
            return {"id": kand[0]}
        gl = (VS.tag_import, VS.importer_et, VS.ryd_doede_importer)
        import fjv.db as DB
        gl_db = (DB.Db, DB.motor_pins)
        try:
            VS.tag_import = tag
            VS.importer_et = lambda db, imp, sha, ts, rap, files=None: {"status": "faerdig"}
            VS.ryd_doede_importer = lambda db: 0
            DB.Db = lambda konfig: None
            DB.motor_pins = lambda db: {"model_commit": K.MODEL_COMMIT}
            from fjv.rapport import Rapport
            ud = VS.koer_notebook({}, Rapport("t", sti=str(Path(tempfile.mkdtemp()) / "r.json")),
                                  import_id=import_id)
        finally:
            VS.tag_import, VS.importer_et, VS.ryd_doede_importer = gl
            DB.Db, DB.motor_pins = gl_db
        return taget, ud

    def test_bestilt_import_foerst_derefter_strandede(self):
        taget, ud = self.koer(["strandet-1", "ny", "strandet-2"], "ny")
        self.assertEqual(taget, ["ny", "strandet-1", "strandet-2"])
        self.assertTrue(ud["ok"])

    def test_allerede_taget_import_toemmer_stadig_koeen(self):
        taget, _ = self.koer(["strandet-1"], "findes-ikke")
        self.assertEqual(taget, ["strandet-1"])


# ------------------------------------------------------------------ F5

class TestF5Periode(unittest.TestCase):
    def case(self, v):
        return {"time": {"start": v["time_start"], "end": v["time_end"], "resolution": "1h"}}

    def test_vektorerne(self):
        for v in VEKTORER:
            if v.get("afvises"):
                with self.assertRaises(InputFejl, msg=v["navn"]):
                    _effektiv_tid(self.case(v), v["start"], v["slut"])
                continue
            self.assertEqual(_effektiv_tid(self.case(v), v["start"], v["slut"]),
                             (v["foerste"], v["sidste"]), v["navn"])

    @unittest.skipUnless(HAR_PANDAS and MODELREPO.is_dir(), "kræver modelrepoet og pandas")
    def test_vektorerne_er_modellens_egen_akse(self):
        import pandas as pd
        sys.path.insert(0, str(MODELREPO))
        from run_case import _apply_time_override
        from src.config import load_case
        from src.data_loader import make_time_index
        andeby = load_case(MODELREPO / "cases" / "andeby.yaml")
        from datetime import datetime
        for v in VEKTORER:
            andeby.time.start = datetime.fromisoformat(v["time_start"].replace("Z", "+00:00"))
            andeby.time.end = datetime.fromisoformat(v["time_end"].replace("Z", "+00:00"))
            _apply_time_override(andeby, None, v["start"], v["slut"])
            if v.get("afvises"):
                with self.assertRaises(Exception, msg=v["navn"]):
                    make_time_index(andeby)
                continue
            idx = make_time_index(andeby)
            fmt = "%Y-%m-%dT%H:%M:%SZ"
            self.assertEqual((pd.Timestamp(idx[0]).strftime(fmt), pd.Timestamp(idx[-1]).strftime(fmt),
                              len(idx)), (v["foerste"], v["sidste"], v["timer"]), v["navn"])

    def test_bar_slutdato_i_vaerket_er_midnat(self):
        # Før K5: bar dato blev udvidet til hele døgnet - 23 timer, modellen ikke regner.
        self.assertEqual(_effektiv_tid({"time": {"start": "2026-01-05", "end": "2026-01-07"}}, None, None),
                         ("2026-01-05T00:00:00Z", "2026-01-07T00:00:00Z"))

    def test_serie_der_daekker_praecis_modellens_periode_godkendes(self):
        # K5's måling: værk og serie dækker 5. jan 12 UTC - 7. jan 11 UTC (48 timer).
        case = CASE.replace('"2026-01-05T00:00:00Z"', '"2026-01-05T12:00:00Z"') \
                   .replace('"2026-01-06T23:00:00Z"', '"2026-01-07"')
        plan = byg(raekker(case, tidsserier={"varmelast": ref()}))
        self.assertEqual(plan.periode, ("2026-01-05T12:00:00Z", "2026-01-07T00:00:00Z"))
        s = serie(timer(fra="2026-01-05", doegn=3))
        pkt = [(t, v) for t, v in TS.laes_normaliseret(s.data)
               if "2026-01-05T12:00:00Z" <= TS.tid_tekst(t) <= "2026-01-07T00:00:00Z"]
        from fjv import datakrav as DK
        fund = DK.tjek_koersel(TS.tid_tekst(pkt[0][0]), TS.tid_tekst(pkt[-1][0]), "varmelast",
                               *plan.periode, pkt, plan.case)
        self.assertEqual([f["kode"] for f in fund if f["niveau"] == "fejl"], [])

    def test_halve_timer_og_ulaeselig_tid_afvises(self):
        for start in ("2026-01-05T12:30:00Z", "i morgen"):
            with self.assertRaises(InputFejl):
                _effektiv_tid({"time": {"start": start, "end": "2026-01-07"}}, None, None)


# ------------------------------------------------------------------ F12

class TestF12UbrugtSolprofil(unittest.TestCase):
    MARKERET = CASE.replace('"data/solar_andeby_dmi_karup.csv"', f'"{TS.MARKOER_SOLPROFIL}"')

    def test_slaaet_fra_solenhed_goer_profilen_ubrugt(self):
        for case in (CASE, self.MARKERET):
            plan = byg(raekker(case, [{"type": "disable", "sti": "sol"}], tidsserier={"solprofil": ref()}))
            self.assertNotIn("solprofil", plan.tidsserier, "en ubrugt profil må ikke hentes/tjekkes")
            self.assertEqual(plan.ubrugte, {"solprofil": ref()})
            self.assertNotIn(TS.MARKOER_SOLPROFIL, plan.case_yaml)
        plan = byg(raekker(self.MARKERET, tidsserier={"solprofil": ref()}))
        self.assertEqual((plan.anvendt_af, plan.ubrugte), ({"solprofil": ["sol"]}, {}))

    def test_koer_en_henter_ikke_ubrugt_profil_og_publicerer_brugen(self):
        tmp = Path(tempfile.mkdtemp())
        gl = K.FILES
        K.FILES = str(tmp)                          # ingen tidsseriefiler i lakehouset
        kode = tmp / "kode"
        (kode / "data").mkdir(parents=True)
        (kode / "requirements.txt").write_text("x\n", encoding="utf-8")
        fixture = HER / "data" / "f1_andeby"

        def falsk_proces(argv, cwd, log, timeout_s, ved_linje=None, stop=None):
            ud = Path(argv[argv.index("--out-dir") + 1])
            for f in fixture.iterdir():
                if f.name != "log.txt":
                    shutil.copy(f, ud / f.name)
            shutil.copy(fixture / "log.txt", log)
            return 0

        erstat = {"sikr_model": lambda sha, files=None: (kode, {}),
                  "sikr_dfdata": lambda sha, files=None: (tmp / "df", {}),
                  "lokal_kodekopi": lambda kilde, maal, dfdata=None, git_init=False: kode,
                  "byg_miljoe": lambda req, venv, log: "python",
                  "pakkeversioner": lambda py, navne: {},
                  "maal_runtime": lambda: {"python": "3.12"},
                  "koer_proces": falsk_proces}
        gamle = {n: getattr(R, n) for n in erstat}

        class Optager(KS.IngenLager):
            slutfelter = None

            def publicer(self, nt, mn, tm, slutfelter=None):
                self.slutfelter = dict(slutfelter or {})
                return super().publicer(nt, mn, tm, slutfelter)
        try:
            for n, f in erstat.items():
                setattr(R, n, f)
            from fjv.rapport import Rapport
            lag = Optager()
            rk = raekker(self.MARKERET, [{"type": "disable", "sti": "sol"}],
                         tidsserier={"solprofil": ref("9" * 64)})
            res = KS.koer_en(rk, "k5f12", lag, Rapport("t", sti=str(tmp / "r.json")))
        finally:
            for n, f in gamle.items():
                setattr(R, n, f)
            K.FILES = gl
        self.assertEqual(res["status"], "faerdig", res.get("fejlbesked"))
        brug = json.loads(lag.slutfelter["manifest_json"])["tidsserier"]
        self.assertEqual(brug["anvendt"], {})
        self.assertEqual(brug["ubrugt"]["solprofil"]["sha256"], "9" * 64)
        self.assertLessEqual(len(lag.slutfelter["manifest_json"]), 4000)
        shutil.rmtree(tmp, ignore_errors=True)

    def test_brugt_profil_staar_som_anvendt(self):
        plan = byg(raekker(tidsserier={"solprofil": ref(), "varmelast": ref("b" * 64, UUID1)}))
        brug = KS.tidsserie_brug(plan)
        self.assertEqual(brug["anvendt"]["solprofil"]["enheder"], ["sol"])
        self.assertEqual(brug["anvendt"]["varmelast"]["sha256"], "b" * 64)
        self.assertEqual(brug["ubrugt"], {})


if __name__ == "__main__":
    unittest.main()
