"""K2-rettelser i motoren (KONTRAKT §6c). Hver test fejler på koden før rettelsen.

SQL-forløbene køres mod en instrumenteret forbindelsesstub, der logger hver
sætning og svarer efter et script. Den beviser kaldgrænser og rækkefølge
(hvad der committes sammen, hvad der aldrig udføres) — ikke SQL Servers
isolation under konkurrence; det testes live i Fabric (se rapporten).
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import threading
import unittest
from pathlib import Path

HER = Path(__file__).resolve().parent
sys.path.insert(0, str(HER.parent))
from fjv import db as DB  # noqa: E402
from fjv import konstanter as K  # noqa: E402
from fjv import resultater as R  # noqa: E402
from fjv.byg_case import InputFejl, byg, raekker_fra_vaerk  # noqa: E402
from fjv.flad import FladFejl, flad  # noqa: E402
from fjv.koersel import Afbrudt, _Hjerte  # noqa: E402

KODE = HER.parent / "_lokal" / "Files" / K.REL_KODE / K.MODEL_COMMIT


# ------------------------------------------------------------------ stub

class Cur:
    def __init__(self, cn):
        self.cn, self.rowcount, self._rk, self.description = cn, -1, [], None

    def execute(self, sql, *params):
        self.cn.log.append((" ".join(sql.split()), params))
        svar = self.cn.svar(sql, params) or {}
        self._rk = list(svar.get("rk", []))
        self.rowcount = svar.get("n", len(self._rk))
        kol = svar.get("kol")
        self.description = [(k,) for k in kol] if kol else None
        return self

    def fetchone(self):
        return self._rk.pop(0) if self._rk else None

    def fetchall(self):
        ud, self._rk = self._rk, []
        return ud


class Cn:
    def __init__(self, svar, log):
        self.svar, self.log, self.autocommit, self.timeout = svar, log, False, 0
        self.lukket = False

    def cursor(self):
        return Cur(self)

    def commit(self):
        self.log.append(("COMMIT", ()))

    def rollback(self):
        self.log.append(("ROLLBACK", ()))

    def close(self):
        self.lukket = True


class StubDb(DB.Db):
    def __init__(self, svar):
        self.log: list = []
        self._svar = svar

    def forbind(self, autocommit=False, forsoeg=1):
        cn = Cn(self._svar, self.log)
        cn.autocommit = autocommit
        return cn


def sql_i(log, ord_):
    return [s for s, _ in log if ord_ in s]


# ------------------------------------------------------------------ F2: global lås

class TestF2Laas(unittest.TestCase):
    def test_optaget_laas_rorer_ingen_raekker(self):
        def svar(sql, p):
            if "sp_getapplock" in sql:
                return {"rk": [(-1,)]}             # timeout 0: optaget
            if "COL_LENGTH" in sql:
                return {"rk": [(None,)]}
            return {}
        db = StubDb(svar)
        from fjv.rapport import Rapport
        rap = Rapport("t", sti=str(Path(tempfile.mkdtemp()) / "r.json"))
        orig = DB.Db
        try:
            DB.Db = lambda konfig: db              # koer_notebook bygger selv sin Db
            t = DB.koer_notebook({}, rap, koersel_id="abc")
        finally:
            DB.Db = orig
        self.assertEqual(t["laas"], "optaget")
        self.assertFalse(sql_i(db.log, "UPDATE dbo.Koersels"), "ingen række må røres")
        self.assertFalse(sql_i(db.log, "UPDATE n SET"))

    def test_overtagelse_kraever_laasen(self):
        db = StubDb(lambda s, p: {})
        laas = DB.SolverLaas(db)                   # aldrig taget
        with self.assertRaises(RuntimeError):
            DB.overtag_bestemt(db, "abc", "nb:mig", laas)
        self.assertIsNone(DB.overtag_naeste(db, "nb:mig", laas))
        self.assertEqual(DB.ryd_doede(db, "nb:mig", laas), [])
        self.assertFalse(sql_i(db.log, "UPDATE"))

    def test_laasen_er_session_ejet_med_timeout_0(self):
        db = StubDb(lambda s, p: {"rk": [(0,)]} if "sp_getapplock" in s else {})
        laas = DB.SolverLaas(db)
        self.assertTrue(laas.tag())
        s = sql_i(db.log, "sp_getapplock")[0]
        self.assertIn("@LockOwner='Session'", s)
        self.assertIn("@LockTimeout=0", s)
        self.assertEqual(db.log[-1][1], ("fjv_solver",))

    def test_ryd_doede_rammer_alle_andre_end_mig(self):
        db = StubDb(lambda s, p: {"rk": [("Exclusive",)]} if "APPLOCK_MODE" in s
                    else ({"rk": [(0,)]} if "sp_getapplock" in s else {"rk": [], "kol": ["id"]}))
        laas = DB.SolverLaas(db)
        laas.tag()
        DB.ryd_doede(db, "nb:mig", laas)
        s = sql_i(db.log, "SET status='fejl'")[0]
        self.assertIn("ISNULL(arbejder_id, '') <> ?", s)
        # K3-N1 skærpede reglen: låsen fri er ikke alene bevis på død; hjerteslaget skal
        # også være ældre end overtagelsesperioden (se test_k3.py).
        self.assertIn("COALESCE(hjerteslag, startet) < DATEADD(second, -?", s)


# ------------------------------------------------------------------ F4: ejerskabstab

class TestF4Ejerskab(unittest.TestCase):
    def lager(self, status, arbejder="nb:mig", anmodet=None):
        db = StubDb(lambda s, p: {"rk": [(status, anmodet, arbejder)]}
                    if "SELECT status" in s else {})
        return DB.SqlLager(db, "abc", "nb:mig")

    def test_fejl_med_samme_arbejder_er_stop(self):
        lag = self.lager("fejl")
        self.assertTrue(lag.er_annulleret())
        self.assertTrue(lag.tabt)
        self.assertFalse(lag.annulleret)       # ikke en annullering: ingen 'annulleret'-skrivning

    def test_anden_arbejder_er_stop(self):
        self.assertTrue(self.lager("koerer", arbejder="nb:andet").er_annulleret())

    def test_annuller_anmodet_er_annullering(self):
        lag = self.lager("koerer", anmodet="2026-10-16")
        self.assertTrue(lag.er_annulleret())
        self.assertTrue(lag.annulleret)
        self.assertFalse(lag.tabt)

    def test_egen_koerer_er_ikke_stop(self):
        self.assertFalse(self.lager("koerer").er_annulleret())

    def test_hjertetraaden_dræber_solveren_ved_tab(self):
        lag = self.lager("fejl")
        h = _Hjerte(lag, interval_s=0.01)
        h.start()
        self.assertTrue(h.stop_proces.wait(2.0), "solveren skulle stoppes")
        h.stop.set()


# ------------------------------------------------------------------ F6: faerdig i transaktionen

class TestF6Publicering(unittest.TestCase):
    def kør(self, faerdig_n):
        def svar(sql, p):
            if "WITH (UPDLOCK, HOLDLOCK)" in sql:
                return {"rk": [("indlaeser", "nb:mig", None)]}
            if sql.startswith("SELECT COUNT(*) FROM dbo.KoerselNoegletals"):
                return {"rk": [(1,)]}
            if sql.startswith("SELECT COUNT(*) FROM dbo.KoerselMaaneds"):
                return {"rk": [(1,)]}
            if sql.startswith("SELECT COUNT(*) FROM dbo.KoerselTimes"):
                return {"rk": [(1,)]}
            if sql.startswith("SELECT COUNT(*) FROM (SELECT"):
                return {"rk": [(0,)]}
            if "SET status='faerdig'" in sql:
                return {"n": faerdig_n}
            return {}
        db = StubDb(svar)
        lag = DB.SqlLager(db, "abc", "nb:mig")
        nt = [{"gruppe": "g", "objekt": None, "marked": None, "noegle": "n", "vaerdi": 1.0, "enhed": None}]
        md = [{"maaned": "periode", "objekt": None, "noegle": "n", "vaerdi": 1.0}]
        tm = [{"tid": "2026-01-05T01:00:00Z", "varmelast_mw": 1.0, "spotpris": None, "t_ude": None,
               "vaerdier_json": "{}"}]
        return db, lag, (nt, md, tm)

    def test_faerdig_committes_sammen_med_resultaterne(self):
        db, lag, args = self.kør(1)
        lag.publicer(*args)
        idx = [s for s, _ in db.log]
        i_faerdig = next(i for i, s in enumerate(idx) if "SET status='faerdig'" in s)
        i_commit = idx.index("COMMIT")
        i_insert = max(i for i, s in enumerate(idx) if s.startswith("INSERT INTO dbo.KoerselTimes"))
        self.assertLess(i_insert, i_faerdig)
        self.assertLess(i_faerdig, i_commit)
        self.assertEqual(idx.count("COMMIT"), 1)
        self.assertTrue(lag.faerdig_i_publicering)

    def test_mistet_raekke_ruller_alt_tilbage(self):
        db, lag, args = self.kør(0)
        with self.assertRaises(Afbrudt):
            lag.publicer(*args)
        idx = [s for s, _ in db.log]
        self.assertNotIn("COMMIT", idx)
        self.assertIn("ROLLBACK", idx)


class TestF8FrosneSHA(unittest.TestCase):
    def test_manglende_frosne_sha_er_fejl_foer_noget_hentes(self):
        from fjv.koersel import IngenLager, koer_en
        from fjv.rapport import Rapport
        tmp = Path(tempfile.mkdtemp())
        gammel = K.FILES
        K.FILES = str(tmp)
        try:
            tekst = ('time:\n  start: "2026-01-05T00:00:00Z"\n  end: "2026-01-06T23:00:00Z"\n'
                     '  resolution: "1h"\nprices:\n  straw:\n    value: 232.0\n')
            r = raekker_fra_vaerk(flad(tekst))               # ingen model_/data_commit
            res = koer_en(r, "t-sha", IngenLager(), Rapport("t", sti=str(tmp / "r.json")))
            self.assertEqual(res["status"], "fejl")
            self.assertIn("frosne model- og data-SHA", res["fejlbesked"])
            self.assertFalse((tmp / K.REL_KODE).exists(), "intet må være hentet")
        finally:
            K.FILES = gammel
            shutil.rmtree(tmp, ignore_errors=True)


class TestGenpublicering(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.gammel = K.FILES
        K.FILES = str(self.tmp)
        mappe = self.tmp / K.REL_KOERSLER / "abc"
        shutil.copytree(HER / "data" / "f1_andeby", mappe)

    def tearDown(self):
        K.FILES = self.gammel
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_kun_faerdige_og_intet_slettes_ellers(self):
        db = StubDb(lambda s, p: {"rk": [("koerer",)]} if "SELECT status" in s else {})
        with self.assertRaises(RuntimeError):
            DB.genpubliser(db, "abc")
        idx = [s for s, _ in db.log]
        self.assertFalse([s for s in idx if s.startswith("DELETE")])
        self.assertIn("ROLLBACK", idx)

    def test_faerdig_erstattes_i_en_transaktion(self):
        def svar(s, p):
            if "SELECT status" in s:
                return {"rk": [("faerdig",)]}
            if s.startswith("SELECT COUNT(*) FROM dbo.KoerselNoegletals"):
                return {"rk": [(len(R.noegletal(R.Output(HER / "data" / "f1_andeby"), R.register())),)]}
            if s.startswith("SELECT COUNT(*) FROM dbo.KoerselMaaneds"):
                return {"rk": [(len(R.maaneder(R.Output(HER / "data" / "f1_andeby"), R.register())),)]}
            if s.startswith("SELECT COUNT(*) FROM dbo.KoerselTimes"):
                return {"rk": [(287,)]}
            return {}
        db = StubDb(svar)
        DB.genpubliser(db, "abc")
        idx = [s for s, _ in db.log]
        self.assertEqual(idx.count("COMMIT"), 1)
        self.assertLess(max(i for i, s in enumerate(idx) if s.startswith("DELETE")),
                        min(i for i, s in enumerate(idx) if s.startswith("INSERT")))
        self.assertFalse([s for s in idx if "SET status" in s], "status må ikke røres")


# ------------------------------------------------------------------ F7 / F13: effektiv validering

class TestF7EffektivKonfiguration(unittest.TestCase):
    def raekker(self, time_blok, scenarie=None):
        tekst = ("time:\n" + "".join(f"  {k}: \"{v}\"\n" for k, v in time_blok.items())
                 + "prices:\n  straw:\n    value: 232.0\n")
        return raekker_fra_vaerk(flad(tekst), (), scenarie)

    def test_vaerkets_lange_tidsblok_afvises(self):
        r = self.raekker({"start": "2026-01-01T00:00:00Z", "end": "2028-01-01T23:00:00Z",
                          "resolution": "1h"})
        with self.assertRaises(InputFejl) as cm:
            byg(r)
        self.assertIn("731", str(cm.exception))

    def test_15min_afvises_med_forklaring(self):
        r = self.raekker({"start": "2026-01-05T00:00:00Z", "end": "2026-01-06T23:45:00Z",
                          "resolution": "15min"})
        with self.assertRaises(InputFejl) as cm:
            byg(r)
        self.assertIn("kun 1h", str(cm.exception))

    def test_scenariets_korte_periode_redder_en_lang_vaerksblok(self):
        r = self.raekker({"start": "2026-01-01T00:00:00Z", "end": "2028-01-01T23:00:00Z",
                          "resolution": "1h"},
                         {"periode_start": "2026-01-05", "periode_slut": "2026-01-16"})
        byg(r)

    def test_andeby_helaar_er_365_doegn_og_godkendes(self):
        if not KODE.exists():
            self.skipTest("ingen lokal kode")
        byg(raekker_fra_vaerk(flad((KODE / "cases" / "andeby.yaml").read_text(encoding="utf-8"))))


# ------------------------------------------------------------------ F11: YAML-nodegraf

class TestF11ListeMappings(unittest.TestCase):
    def test_dublet_i_mapping_i_liste_afvises(self):
        with self.assertRaises(FladFejl) as cm:
            flad("a:\n  points: [{x: 1, x: 2}]\n")
        self.assertIn("to gange", str(cm.exception))

    def test_punktum_i_mapping_i_liste_afvises(self):
        with self.assertRaises(FladFejl):
            flad('a:\n  points: [{"a.b": 1}]\n')

    def test_merge_i_liste_afvises(self):
        with self.assertRaises(FladFejl):
            flad("x: &p {a: 1}\ny: [{<<: *p, b: 2}]\n")

    def test_lovlige_lister_af_dicts_består(self):
        p = flad("a:\n  points: [{x: 1, y: 2.0}, {x: 3, y: 4.0}]\n")
        self.assertEqual(json.loads(p[0].vaerdi_json), [{"x": 1, "y": 2.0}, {"x": 3, "y": 4.0}])


# ------------------------------------------------------------------ F12: forkastet solverrapport

class TestF12Solverrapport(unittest.TestCase):
    def test_alle_maalinger_forkastes_og_begrundelsen_gemmes(self):
        out = R.Output(HER / "data" / "f1_andeby")
        k = R.koersel_felter(out, {"primal_bound": 1.0, "gap_pct": 0.0, "dual_bound": 1.0,
                                   "loesetid_s": 42.0, "highs_version": "1.15.1"})
        self.assertIsNone(k["opnaaet_gap"])
        self.assertIsNone(k["best_bound"])
        self.assertIsNone(k["loesetid_s"], "løsningstiden kommer fra samme forkastede rapport")
        h = json.loads(k["manifest_json"])["highs"]
        self.assertIs(h["match"], False)
        self.assertIn("matcher ikke", h["begrundelse"])

    def test_matchende_rapport_beholdes(self):
        out = R.Output(HER / "data" / "f1_andeby")
        log = (HER / "data" / "f1_andeby" / "log.txt").read_text(encoding="utf-8")
        k = R.koersel_felter(out, R.parse_highs(log))
        self.assertIsNotNone(k["loesetid_s"])
        self.assertIs(json.loads(k["manifest_json"])["highs"]["match"], True)


# ------------------------------------------------------------------ F14: kildefil kun ved accept

class TestF14Kildefil(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.gammel = K.FILES
        K.FILES = str(self.tmp)

    def tearDown(self):
        K.FILES = self.gammel
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_beskyttet_vaerk_faar_ikke_ny_kildevisning(self):
        from fjv.importer import importer_et
        fil = self.tmp / "andeby.yaml"
        fil.write_text("meta:\n  case_name: x\nprices:\n  straw:\n    value: 300.0\n", encoding="utf-8")
        kol = ["sti", "vaerdi_json", "kommentar", "bekraeft", "raekkefoelge", "sektion", "objekt"]

        def svar(sql, p):
            if "SUSER_SNAME" in sql:
                return {"rk": [("test@x",)]}
            if "FROM dbo.Vaerks" in sql:
                return {"rk": [("id1", "app", 2)]}         # rettet i appen
            if "FROM dbo.VaerkParameters" in sql:
                return {"kol": kol, "rk": [("prices.straw.value", "232.0", None, False, 5, "prices", "straw")]}
            return {}
        u = importer_et(StubDb(svar), fil, K.MODEL_COMMIT, overskriv=False)
        self.assertEqual(u["udfald"], "beskyttet")
        self.assertFalse((self.tmp / "fjv" / "vaerker" / "andeby" / "kilde.yaml").exists())

    def test_accepteret_import_gemmer_versioneret_kilde(self):
        from fjv.importer import gem_kildefil
        navn = gem_kildefil("andeby", "a: 1\n")
        mappe = self.tmp / "fjv" / "vaerker" / "andeby"
        self.assertTrue((mappe / navn).exists())
        self.assertTrue(navn.startswith("kilde_"))
        self.assertEqual((mappe / "kilde.yaml").read_text(encoding="utf-8"), "a: 1\n")
        gem_kildefil("andeby", "a: 2\n", kun_hvis_mangler=True)
        self.assertEqual((mappe / "kilde.yaml").read_text(encoding="utf-8"), "a: 1\n")


if __name__ == "__main__":
    unittest.main()
