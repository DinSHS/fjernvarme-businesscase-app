"""K3-rettelser N1 og N9 i motoren. Hver test fejler på koden før rettelsen.

Samme instrumenterede forbindelsesstub som test_k2 (kaldgrænser og rækkefølge,
ikke SQL Servers isolation). Underprocessens død med forælderen kan kun prøves på
Linux; på dev-maskinen (Windows) springes den over og prøves live i Fabric.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

HER = Path(__file__).resolve().parent
sys.path.insert(0, str(HER.parent))
from fjv import db as DB  # noqa: E402
from fjv import koersel as KS  # noqa: E402
from fjv import konstanter as K  # noqa: E402
from fjv import runtime as R  # noqa: E402
from fjv.byg_case import raekker_fra_vaerk  # noqa: E402
from fjv.flad import flad  # noqa: E402
from tests.test_k2 import StubDb, sql_i  # noqa: E402


class LaasStub(StubDb):
    """Låsens forbindelse: APPLOCK_MODE svarer 'Exclusive' n gange, derefter fejl (tabt session)."""

    def __init__(self, ok_gange: int):
        self.tilbage = ok_gange

        def svar(sql, p):
            if "sp_getapplock" in sql:
                return {"rk": [(0,)]}
            if "APPLOCK_MODE" in sql:
                if self.tilbage <= 0:
                    raise RuntimeError("08S01 Communication link failure")
                self.tilbage -= 1
                return {"rk": [("Exclusive",)]}
            return {}
        super().__init__(svar)


# ------------------------------------------------------------------ N1b: straks-stop

class TestN1StraksStop(unittest.TestCase):
    def test_vagten_stopper_solveren_foer_naeste_hjerteslag(self):
        laas = DB.SolverLaas(LaasStub(ok_gange=2))
        self.assertTrue(laas.tag())
        lager = DB.SqlLager(StubDb(lambda s, p: {"rk": [("koerer", None, "nb:mig")]}),
                            "abc", "nb:mig", laas)
        hjerte = KS._Hjerte(lager, interval_s=60)          # næste hjerteslag om 60 s
        laas.ved_tab(hjerte.stop_proces.set)
        t0 = time.time()
        laas.start_vagt(interval_s=0.05)
        self.assertTrue(hjerte.stop_proces.wait(2.0), "solveren skulle stoppes af vagten")
        self.assertLess(time.time() - t0, 2.0)
        self.assertTrue(lager.tabt, "tabt lås-forbindelse er tabt ejerskab")
        self.assertTrue(lager.stop)

    def test_fejl_paa_laasens_forbindelse_markeres_straks(self):
        laas = DB.SolverLaas(LaasStub(ok_gange=0))
        laas.tag()
        kaldt = threading.Event()
        laas.ved_tab(kaldt.set)
        with self.assertRaises(RuntimeError):
            laas.udfoer("SELECT APPLOCK_MODE('public', ?, 'Session')", "fjv_solver", hent=True)
        self.assertTrue(kaldt.is_set())
        self.assertFalse(laas.holdt())

    def test_villet_frigivelse_er_ikke_et_tab(self):
        laas = DB.SolverLaas(LaasStub(ok_gange=10))
        laas.tag()
        kaldt = threading.Event()
        laas.ved_tab(kaldt.set)
        laas.frigiv()
        self.assertFalse(kaldt.is_set())


# ------------------------------------------------------------------ N1a: overtagelsesperiode

class TestN1Overtagelse(unittest.TestCase):
    def test_periode_daekker_maksimal_stopforsinkelse(self):
        maks = 60 + DB.SolverLaas.VAGT_S + DB.SolverLaas.TIMEOUT_S + 2
        self.assertGreater(DB.OVERTAGELSE_S, maks)

    def test_ryd_doede_kraever_gammelt_hjerteslag(self):
        laas = DB.SolverLaas(LaasStub(ok_gange=10))
        laas.tag()
        db = StubDb(lambda s, p: {"rk": [], "kol": ["id"]})
        DB.ryd_doede(db, "nb:mig", laas)
        s, p = next((s, p) for s, p in db.log if "SET status='fejl'" in s)
        self.assertIn("< DATEADD(second, -?, SYSUTCDATETIME())", s)
        self.assertIn(DB.OVERTAGELSE_S, p)

    def test_frisk_fremmed_koersel_blokerer_start(self):
        laas = DB.SolverLaas(LaasStub(ok_gange=100))
        laas.tag()

        def svar(sql, p):
            if "DATEDIFF" in sql:                      # friske_fremmede
                return {"kol": ["id", "arbejder_id", "alder_s"],
                        "rk": [("GAMMEL-1", "nb:gammel", 20)]}
            return {}
        db = StubDb(svar)
        self.assertFalse(DB.vent_overtagelse(db, "nb:mig", laas, pause_s=0.01, maks_s=0.05))
        self.assertFalse(sql_i(db.log, "UPDATE"), "intet må ryddes eller startes")

    def test_ingen_friske_giver_fri_bane(self):
        laas = DB.SolverLaas(LaasStub(ok_gange=100))
        laas.tag()
        db = StubDb(lambda s, p: {"kol": ["id", "arbejder_id", "alder_s"], "rk": []})
        self.assertTrue(DB.vent_overtagelse(db, "nb:mig", laas, pause_s=0.01, maks_s=0.05))

    def test_arbejderen_starter_intet_ved_frisk_fremmed(self):
        def svar(sql, p):
            if "sp_getapplock" in sql:
                return {"rk": [(0,)]}
            if "APPLOCK_MODE" in sql:
                return {"rk": [("Exclusive",)]}
            if "COL_LENGTH" in sql:
                return {"rk": [(None,)]}
            if "DATEDIFF" in sql:
                return {"kol": ["id", "arbejder_id", "alder_s"],
                        "rk": [("GAMMEL-1", "nb:gammel", 20)]}
            return {}
        db = StubDb(svar)
        from fjv.rapport import Rapport
        rap = Rapport("t", sti=str(Path(tempfile.mkdtemp()) / "r.json"))
        gammel_vent, gammel_db = DB.vent_overtagelse, DB.Db
        try:
            DB.vent_overtagelse = lambda *a, **k: gammel_vent(*a, pause_s=0.01, maks_s=0.05)
            DB.Db = lambda konfig: db
            t = DB.koer_notebook({}, rap)
        finally:
            DB.vent_overtagelse, DB.Db = gammel_vent, gammel_db
        self.assertIn("friskt hjerteslag", t["koe_stop"])
        self.assertFalse(sql_i(db.log, "SET status='fejl'"))
        self.assertFalse(sql_i(db.log, "UPDATE n SET"))


# ------------------------------------------------------------------ N1c: barnet dør med forælderen

class TestN1Underproces(unittest.TestCase):
    def test_preexec_kun_paa_linux(self):
        f = R.doed_med_foraelder()
        if sys.platform.startswith("linux"):
            self.assertTrue(callable(f))
        else:
            self.assertIsNone(f)

    @unittest.skipUnless(sys.platform.startswith("linux"), "PR_SET_PDEATHSIG findes kun på Linux")
    def test_barn_doer_naar_foraelder_doer(self):
        tmp = Path(tempfile.mkdtemp())
        pidfil = tmp / "barn.pid"
        foraelder = (
            "import subprocess, sys, os, time\n"
            f"sys.path.insert(0, {str(HER.parent)!r})\n"
            "from fjv.runtime import doed_med_foraelder\n"
            "p = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'],"
            " preexec_fn=doed_med_foraelder())\n"
            f"open({str(pidfil)!r}, 'w').write(str(p.pid))\n"
            "time.sleep(0.3)\n"
            "os._exit(3)\n")
        subprocess.run([sys.executable, "-c", foraelder], timeout=30)
        pid = int(pidfil.read_text())
        time.sleep(0.5)
        import os
        try:
            os.kill(pid, 0)
            levende = Path(f"/proc/{pid}/stat").read_text().split()[2] != "Z"
        except ProcessLookupError:
            levende = False
        self.assertFalse(levende, "solver-barnet lever videre efter forælderens død")
        shutil.rmtree(tmp, ignore_errors=True)


# ------------------------------------------------------------------ N9: slutmetadata i transaktionen

class TestN9Slutmetadata(unittest.TestCase):
    def test_publicer_skriver_slutfelter_i_faerdig_updaten(self):
        from tests.test_k2 import TestF6Publicering
        db, lag, args = TestF6Publicering().kør(1)
        lag.publicer(*args, slutfelter={"objektiv_dkk": 3424407.9575, "loesetid_s": 0.4})
        idx = [s for s, _ in db.log]
        i = next(i for i, s in enumerate(idx) if "SET status='faerdig'" in s)
        self.assertIn("objektiv_dkk=?", idx[i])
        self.assertIn(3424407.9575, db.log[i][1])
        self.assertLess(i, idx.index("COMMIT"))

    def test_koer_en_skriver_ikke_slutmetadata_uden_for_publiceringen(self):
        tmp = Path(tempfile.mkdtemp())
        gammel_files = K.FILES
        K.FILES = str(tmp)
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
            def __init__(self):
                super().__init__()
                self.saet_kald = []
                self.slutfelter = None
                self.faerdig_i_publicering = True

            def saet(self, **felter):
                self.saet_kald.append(dict(felter))
                super().saet(**felter)

            def publicer(self, nt, mn, tm, slutfelter=None):
                self.slutfelter = dict(slutfelter or {})
                self.status = "faerdig"
                return {"ok": True}

        try:
            for n, f in erstat.items():
                setattr(R, n, f)
            tekst = ('time:\n  start: "2026-01-05T00:00:00Z"\n  end: "2026-01-16T23:00:00Z"\n'
                     '  resolution: "1h"\nprices:\n  straw:\n    value: 232.0\n')
            r = raekker_fra_vaerk(flad(tekst), (), {"model_commit": K.MODEL_COMMIT,
                                                    "data_commit": K.DF_DATA_SHA})
            from fjv.rapport import Rapport
            lag = Optager()
            res = KS.koer_en(r, "n9", lag, Rapport("t", sti=str(tmp / "r.json")), hjerte_s=60)
        finally:
            for n, f in gamle.items():
                setattr(R, n, f)
            K.FILES = gammel_files
        self.assertEqual(res["status"], "faerdig", res.get("fejlbesked"))
        self.assertEqual(lag.slutfelter["objektiv_dkk"], 3424407.9575291085)
        for kald in lag.saet_kald:
            self.assertNotIn("objektiv_dkk", kald, "slutmetadata skrevet uden for publiceringen")
            self.assertNotIn("manifest_json", kald)
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
