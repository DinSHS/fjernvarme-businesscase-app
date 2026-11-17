"""Runde 14b: timeresultater for brede værker (KoerselTimeDel, skemaversion 2).

Målt i Fabric: et værk med 17 enheder og balancemarked blev løst, men resultaterne kunne ikke gemmes
(``vaerdier_json er 4002 tegn … maks 4000``). Testene her binder skrivevejen: delene publiceres i samme
transaktion som resten, tælles som resten, og en Fabric-database fra før skemaversion 2 giver brugeren en
besked, der kan handles på - ikke en SQL-fejl og ikke en halv kørsel.
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HER = Path(__file__).resolve().parent
sys.path.insert(0, str(HER.parent))

from fjv import db as DB  # noqa: E402
from fjv import konstanter as K  # noqa: E402
from fjv import koersel as KS  # noqa: E402
from fjv import resultater as RES  # noqa: E402
from fjv import runtime as R  # noqa: E402
from tests.test_k2 import StubDb  # noqa: E402

F1 = HER / "data" / "f1_andeby"
BRED = HER / "data" / "bred_40el"
TID = "2026-01-05T01:00:00Z"


def svar_med(tabel_findes: bool, n_dele: int):
    def svar(sql, p):
        if "OBJECT_ID(N'dbo.KoerselTimeDels'" in sql:
            return {"rk": [(1234,)] if tabel_findes else [(None,)]}
        if "WITH (UPDLOCK, HOLDLOCK)" in sql:
            return {"rk": [("indlaeser", "nb:mig", None)]}
        if sql.startswith("SELECT COUNT(*) FROM dbo.KoerselTimeDels"):
            return {"rk": [(n_dele,)]}
        if sql.startswith("SELECT COUNT(*) FROM dbo.Koersel"):
            return {"rk": [(1,)]}
        if sql.startswith("SELECT COUNT(*) FROM (SELECT"):
            return {"rk": [(0,)]}
        if "SET status='faerdig'" in sql:
            return {"n": 1}
        return {}
    return svar


def args():
    nt = [{"gruppe": "g", "objekt": None, "marked": None, "noegle": "n", "vaerdi": 1.0, "enhed": None}]
    md = [{"maaned": "periode", "objekt": None, "noegle": "n", "vaerdi": 1.0}]
    tm = [{"tid": TID, "varmelast_mw": 1.0, "spotpris": None, "t_ude": None, "vaerdier_json": '{"a":1.0}'}]
    td = [{"tid": TID, "delnr": 1, "vaerdier_json": '{"b":-0.0}'}, {"tid": TID, "delnr": 2, "vaerdier_json": '{"c":null}'}]
    return nt, md, tm, td


class TestSqlLager(unittest.TestCase):
    def test_delene_indsaettes_og_taelles_i_samme_transaktion(self):
        db = StubDb(svar_med(True, 2))
        nt, md, tm, td = args()
        antal = DB.SqlLager(db, "abc", "nb:mig").publicer(nt, md, tm, timedele=td)
        self.assertEqual(antal["KoerselTimeDels"], 2)
        idx = [s for s, _ in db.log]
        i_slet = idx.index("DELETE FROM dbo.KoerselTimeDels WHERE koersel_id=?")
        i_ind = next(i for i, s in enumerate(idx) if s.startswith("INSERT INTO dbo.KoerselTimeDels"))
        i_faerdig = next(i for i, s in enumerate(idx) if "SET status='faerdig'" in s)
        self.assertLess(i_slet, i_ind)
        self.assertLess(i_ind, i_faerdig)
        self.assertLess(i_faerdig, idx.index("COMMIT"))
        self.assertIn("SELECT COUNT(*) FROM (SELECT 1 x FROM dbo.KoerselTimeDels WHERE koersel_id=? "
                      "GROUP BY tid, delnr HAVING COUNT(*) > 1) d", idx)
        # Teksten går uændret til databasen: -0.0 og null er modellens, ikke afrundet.
        bid = json.loads(next(p for s, p in db.log if s.startswith("INSERT INTO dbo.KoerselTimeDels"))[1])
        self.assertEqual(bid, [{"t": "2026-01-05T01:00:00", "d": 1, "j": '{"b":-0.0}'},
                               {"t": "2026-01-05T01:00:00", "d": 2, "j": '{"c":null}'}])

    def test_forkert_antal_dele_ruller_tilbage(self):
        db = StubDb(svar_med(True, 1))                  # databasen fik én, vi sendte to
        nt, md, tm, td = args()
        with self.assertRaisesRegex(RuntimeError, "KoerselTimeDels: 1 rækker"):
            DB.SqlLager(db, "abc", "nb:mig").publicer(nt, md, tm, timedele=td)
        self.assertIn("ROLLBACK", [s for s, _ in db.log])

    def test_database_uden_tabellen_skriver_intet_og_siger_hvad_man_kan_goere(self):
        db = StubDb(svar_med(False, 0))
        nt, md, tm, td = args()
        lag = DB.SqlLager(db, "abc", "nb:mig")
        self.assertFalse(lag.har_timedele)
        with self.assertRaises(RuntimeError) as f:
            lag.publicer(nt, md, tm, timedele=td)
        self.assertEqual(str(f.exception), RES.TIMEDELE_MANGLER)
        self.assertFalse([s for s, _ in db.log if s.startswith(("INSERT", "DELETE", "UPDATE"))])

    def test_smalt_vaerk_paa_database_uden_tabellen_er_som_foer(self):
        db = StubDb(svar_med(False, 0))
        nt, md, tm, _ = args()
        antal = DB.SqlLager(db, "abc", "nb:mig").publicer(nt, md, tm)
        self.assertNotIn("KoerselTimeDels", antal)
        self.assertFalse([s for s, _ in db.log if "KoerselTimeDels" in s and not s.startswith("SELECT OBJECT_ID")])


class TestKoerEn(unittest.TestCase):
    """Hele ``koer_en`` med modellens F1-output, men et bredt ``_hourly.csv`` (fixturen bred_40el)."""

    def koer(self, har_timedele: bool):
        tmp = Path(tempfile.mkdtemp())
        gl = K.FILES
        K.FILES = str(tmp)
        kode = tmp / "kode"
        (kode / "data").mkdir(parents=True)
        (kode / "requirements.txt").write_text("x\n", encoding="utf-8")
        stem = json.loads(next(F1.glob("*_fjv.json")).read_text(encoding="utf-8"))["stem"]

        def falsk_proces(argv, cwd, log, timeout_s, ved_linje=None, stop=None):
            ud = Path(argv[argv.index("--out-dir") + 1])
            for f in F1.iterdir():
                if f.name != "log.txt":
                    shutil.copy(f, ud / f.name)
            shutil.copy(next(BRED.glob("*_hourly.csv")), ud / f"{stem}_hourly.csv")
            shutil.copy(F1 / "log.txt", log)
            return 0

        erstat = {"sikr_model": lambda sha, files=None: (kode, {}),
                  "sikr_dfdata": lambda sha, files=None: (tmp / "df", {}),
                  "lokal_kodekopi": lambda kilde, maal, dfdata=None, git_init=False: kode,
                  "byg_miljoe": lambda req, venv, log: "python",
                  "pakkeversioner": lambda py, navne: {},
                  "maal_runtime": lambda: {"python": "3.12"},
                  "koer_proces": falsk_proces}
        gamle = {n: getattr(R, n) for n in erstat}

        class Lager(KS.IngenLager):
            slutfelter = None
            dele = None

            def publicer(self, nt, mn, tm, slutfelter=None, timedele=()):
                self.slutfelter, self.dele = dict(slutfelter or {}), list(timedele)
                return super().publicer(nt, mn, tm, slutfelter, timedele)

        lag = Lager()
        lag.har_timedele = har_timedele
        try:
            for n, f in erstat.items():
                setattr(R, n, f)
            from fjv.rapport import Rapport
            from tests.test_k5 import TestF12UbrugtSolprofil, raekker, ref
            # Samme input som K5-F12: solenheden slået fra, så ingen profil skal findes i lakehouset.
            rk = raekker(TestF12UbrugtSolprofil.MARKERET, [{"type": "disable", "sti": "sol"}],
                         tidsserier={"solprofil": ref("9" * 64)})
            res = KS.koer_en(rk, "r14b", lag, Rapport("t", sti=str(tmp / "r.json")))
        finally:
            for n, f in gamle.items():
                setattr(R, n, f)
            K.FILES = gl
            shutil.rmtree(tmp, ignore_errors=True)
        return res, lag

    def test_bredt_vaerk_publiceres_med_dele_og_manifestet_siger_hvor_mange(self):
        res, lag = self.koer(True)
        self.assertEqual(res["status"], "faerdig", res.get("fejlbesked"))
        self.assertGreater(len(lag.dele), 0)
        self.assertEqual(res["antal"]["timedele"], len(lag.dele))
        self.assertEqual(json.loads(lag.slutfelter["manifest_json"])["time_dele"], len(lag.dele))

    def test_database_uden_tabellen_giver_brugerens_besked(self):
        res, lag = self.koer(False)
        self.assertEqual(res["status"], "fejl")
        self.assertEqual(res["fejlbesked"], f"Resultaterne kunne ikke gemmes: {RES.TIMEDELE_MANGLER}")
        self.assertIsNone(lag.dele, "intet må publiceres")


class TestManifest(unittest.TestCase):
    def test_smal_koersel_har_ingen_time_dele_noegle(self):
        """Smalle kørsler får byte for byte samme manifest som før runde 14b."""
        out = RES.Output(F1)
        h = RES.parse_highs((F1 / "log.txt").read_text(encoding="utf-8"))
        self.assertEqual(RES.koersel_felter(out, h), RES.koersel_felter(out, h, time_dele=0))
        self.assertNotIn("time_dele", json.loads(RES.koersel_felter(out, h)["manifest_json"]))


if __name__ == "__main__":
    unittest.main()
