"""Arbejderens lokale lager (``lokal_lager``) og låsen: samme regler som ``fjv.db``/``fjv.lager_minne``."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import time
import unittest
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select

import hjaelp as H
from fjernvarme_app import lokal_lager as LL
from fjernvarme_app.laas import FilLaas, er_fri
from fjernvarme_app.motor import Motor
from fjernvarme_app.typer import nu

from fjv import arbejder as A, konstanter as K, koersel as KS, lager as L  # noqa: E402  (efter hjaelp: FJV_FILES er sat)
from fjv.rapport import Rapport  # noqa: E402


def rap():
    return Rapport("t", sti=str(Path(tempfile.mkdtemp()) / "r.json"))


def status(app, kid):
    k = app.db.t("Koersel")
    with app.db.laes() as cn:
        return dict(cn.execute(select(k).where(k.c.id == kid)).first()._mapping)


class TestLaas(unittest.TestCase):
    def test_eksklusiv_ogsaa_i_samme_proces_og_fri_naar_processen_doer(self):
        sti = H.ROD / f"laas_{time.time_ns()}.lock"
        a, b = FilLaas(sti), FilLaas(sti)
        self.assertTrue(a.tag())
        self.assertFalse(b.tag())
        self.assertFalse(er_fri(sti))
        kode = ("import sys,time; sys.path.insert(0, sys.argv[2]); from fjernvarme_app.laas import FilLaas;"
                "print(FilLaas(sys.argv[1]).tag(), flush=True)")
        r = subprocess.run([sys.executable, "-c", kode, str(sti), str(H.HER.parent)], capture_output=True, text=True)
        self.assertEqual(r.stdout.strip(), "False")
        a.frigiv()
        self.assertTrue(a.tabt.is_set())
        self.assertTrue(er_fri(sti))
        # En anden proces tager låsen og DØR uden at frigive: OS'et frigiver den.
        holder = ("import sys,time; sys.path.insert(0, sys.argv[2]); from fjernvarme_app.laas import FilLaas;"
                  "l = FilLaas(sys.argv[1]); print(l.tag(), flush=True); time.sleep(60)")
        p = subprocess.Popen([sys.executable, "-c", holder, str(sti), str(H.HER.parent)], stdout=subprocess.PIPE,
                             text=True)
        self.assertEqual(p.stdout.readline().strip(), "True")
        self.assertFalse(er_fri(sti))
        p.kill()
        p.wait()
        # Windows frigiver en død proces' lås asynkront (LockFileEx: "depends upon available system resources").
        t0 = time.time()
        while not er_fri(sti) and time.time() - t0 < 10:
            time.sleep(0.2)
        self.assertTrue(er_fri(sti), "låsen blev ikke fri inden for 10 s efter processens død")


class TestForm(unittest.TestCase):
    def test_lokale_lagre_har_hele_protokollen(self):
        app = H.ny_app()
        koe = LL.LokalKoe(app.db, H.ROD)
        for obj, prot in ((koe.laas(), L.Laas), (koe, L.KoeLager),
                          (LL.LokalKoerselLager(app.db, "k", "mig"), L.KoerselLager),
                          (LL.LokalImportLager(app.db), L.ImportLager)):
            with self.subTest(obj=type(obj).__name__):
                self.assertEqual(L.mangler(obj, prot), [])


def falsk_koer_en(udfald: dict):
    """Følger tilstandsmaskinen uden at køre modellen (som fabric/tests/test_lager.py)."""
    def koer(raekker, kid, lager, rap, *, forventet_hash=None, **_):
        if lager.er_annulleret():
            raise KS.Afbrudt("annulleret før start")
        lager.saet(fase="Kontrollerer input")
        lager.hjerteslag()
        u = udfald.get(kid, "faerdig")
        if u == "fejl":
            lager.skift("koerer", "fejl", fejlbesked="Modellen er uløselig", afsluttet="nu")
            return {"koersel_id": kid, "status": "fejl"}
        if u == "annuller":
            raise KS.Afbrudt("annulleret under kørslen")
        assert lager.skift("koerer", "indlaeser")
        lager.publicer([{"gruppe": "g", "objekt": None, "marked": None, "noegle": "n", "vaerdi": 1.5, "enhed": "DKK"}],
                       [{"maaned": "periode", "objekt": None, "noegle": "n", "vaerdi": 2}],
                       [{"tid": "2026-01-05T01:00:00Z", "varmelast_mw": 3.25, "spotpris": None, "t_ude": None,
                         "vaerdier_json": "{}"}], slutfelter={"objektiv_dkk": 42.0})
        return {"koersel_id": kid, "status": "faerdig", "objektiv_dkk": 42.0}
    return koer


class TestKoe(unittest.TestCase):
    def setUp(self):
        self.app = H.ny_app()
        self.koe = LL.LokalKoe(self.app.db, H.ROD / f"k{time.time_ns()}")
        self._ægte = KS.koer_en

    def tearDown(self):
        KS.koer_en = self._ægte

    def test_bestemt_foerst_derefter_fifo_efter_modtaget(self):
        t = nu()
        senest = H.koersel(self.app, modtaget=t)
        foerst = H.koersel(self.app, modtaget=t - timedelta(minutes=5))
        bestemt = H.koersel(self.app, modtaget=t + timedelta(minutes=5))
        KS.koer_en = falsk_koer_en({})
        tilstand = A.arbejd(self.koe, rap(), mig="lokal:test", koersel_id=bestemt)
        self.assertEqual([k["koersel_id"] for k in tilstand["koersler"]], [bestemt, foerst, senest])
        self.assertTrue(tilstand["ok"])
        for kid in (bestemt, foerst, senest):
            s = status(self.app, kid)
            self.assertEqual((s["status"], s["arbejder_id"], s["forsoeg"], float(s["objektiv_dkk"])),
                             ("faerdig", "lokal:test", 1, 42.0))
        tn = self.app.db.t("KoerselTime")
        with self.app.db.laes() as cn:
            r = cn.execute(select(tn).where(tn.c.koersel_id == senest)).first()
        self.assertEqual((r.tid.isoformat(), r.varmelast_mw), ("2026-01-05T01:00:00", 3.25))

    def test_optaget_laas_roerer_intet(self):
        kid = H.koersel(self.app)
        l = self.koe.laas()
        self.assertTrue(l.tag())
        try:
            tilstand = A.arbejd(self.koe, rap(), mig="lokal:anden")
        finally:
            l.frigiv()
        self.assertEqual(tilstand["laas"], "optaget")
        self.assertEqual(status(self.app, kid)["status"], "koe")

    def test_overtagelse_kraever_laasen_og_annullerede_tages_ikke(self):
        kid = H.koersel(self.app)
        l = self.koe.laas()
        with self.assertRaises(RuntimeError):
            self.koe.overtag_bestemt(kid, "mig", l)
        self.assertIsNone(self.koe.overtag_naeste("mig", l))
        H.koersel(self.app, annuller_anmodet=nu())
        self.assertTrue(l.tag())
        try:
            self.assertEqual(self.koe.overtag_naeste("mig", l), kid)
            self.assertIsNone(self.koe.overtag_naeste("mig", l))
            self.assertEqual(self.koe.grund(), "køen er tom")
        finally:
            l.frigiv()

    def test_frisk_fremmed_blokerer_og_gammel_ryddes(self):
        frisk = H.koersel(self.app, status="koerer", arbejder_id="nb:anden", hjerteslag=nu(), startet=nu())
        l = self.koe.laas()
        self.assertTrue(l.tag())
        try:
            self.koe.overtagelse_s = 300
            self.assertEqual([f["id"] for f in self.koe.friske_fremmede("mig")], [frisk])
            self.assertEqual(self.koe.ryd_doede("mig", l), [])
            gammel = H.koersel(self.app, status="indlaeser", arbejder_id="nb:anden",
                               hjerteslag=nu() - timedelta(minutes=10), startet=nu() - timedelta(minutes=20))
            self.assertEqual(self.koe.ryd_doede("mig", l), [gammel])
            self.assertEqual(status(self.app, gammel)["status"], "fejl")
            self.assertEqual(status(self.app, frisk)["status"], "koerer")
        finally:
            l.frigiv()

    def test_modelfejl_og_annullering(self):
        fejl = H.koersel(self.app, modtaget=nu() - timedelta(seconds=2))
        ann = H.koersel(self.app)
        KS.koer_en = falsk_koer_en({fejl: "fejl"})
        orig = LL.LokalKoe.koersel_lager

        def med_annullering(koe, kid, mig, laas):
            lg = orig(koe, kid, mig, laas)
            if kid == ann:
                k = self.app.db.t("Koersel")
                with self.app.db.skriv() as cn:
                    cn.execute(k.update().where(k.c.id == ann).values(annuller_anmodet=nu()))
            return lg
        self.koe.koersel_lager = lambda kid, mig, laas: med_annullering(self.koe, kid, mig, laas)
        tilstand = A.arbejd(self.koe, rap(), mig="lokal:t")
        self.assertEqual({k["koersel_id"]: k["status"] for k in tilstand["koersler"]},
                         {fejl: "fejl", ann: "annulleret"})
        self.assertEqual(status(self.app, ann)["status"], "annulleret")

    def test_publicering_kraever_ejerskab_og_er_alt_eller_intet(self):
        kid = H.koersel(self.app, status="indlaeser", arbejder_id="mig", hjerteslag=nu())
        fremmed = LL.LokalKoerselLager(self.app.db, kid, "ikke_mig")
        with self.assertRaises(KS.Afbrudt):
            fremmed.publicer([], [], [])
        lg = LL.LokalKoerselLager(self.app.db, kid, "mig")
        dub = [{"gruppe": "g", "objekt": None, "marked": None, "noegle": "n", "vaerdi": 1}] * 2
        with self.assertRaises(RuntimeError):            # naturlig nøgle to gange -> intet publiceres
            lg.publicer(dub, [], [])
        self.assertEqual(status(self.app, kid)["status"], "indlaeser")
        tn = self.app.db.t("KoerselNoegletal")
        with self.app.db.laes() as cn:
            self.assertEqual(cn.execute(select(tn).where(tn.c.koersel_id == kid)).fetchall(), [])
        self.assertEqual(lg.publicer(dub[:1], [], []), {"KoerselNoegletals": 1, "KoerselMaaneds": 0, "KoerselTimes": 0})
        self.assertEqual(status(self.app, kid)["status"], "faerdig")

    def test_tidsfelter_er_lagerets_egne_og_ukendte_felter_afvises(self):
        kid = H.koersel(self.app, status="koerer", arbejder_id="mig")
        lg = LL.LokalKoerselLager(self.app.db, kid, "mig")
        lg.saet(hjerteslag="1999-01-01T00:00:00Z", fase="x" * 500)
        s = status(self.app, kid)
        self.assertGreater(s["hjerteslag"].year, 2000)
        self.assertTrue(s["fase"].endswith("...") and len(s["fase"]) == 200)
        with self.assertRaises(ValueError):
            lg.saet(status="faerdig")


class TestMotor(unittest.TestCase):
    def test_afstem_markerer_doede_kun_naar_laasen_er_fri(self):
        app = H.ny_app()
        m = Motor(app.db, H.ROD / f"m{time.time_ns()}", app.db.url, start_processer=False)
        doed = H.koersel(app, status="koerer", arbejder_id="lokal:x", hjerteslag=nu() - timedelta(minutes=6))
        levende = H.koersel(app, status="koerer", arbejder_id="lokal:y", hjerteslag=nu())
        l = FilLaas(m.laas_sti)
        self.assertTrue(l.tag())
        try:
            self.assertIsNone(m.marker_doede())
        finally:
            l.frigiv()
        r = m.afstem()
        self.assertEqual(r["tjekket"], 1)
        self.assertEqual(status(app, doed)["status"], "fejl")
        self.assertIn("ingen arbejder holder solver-låsen", status(app, doed)["fejlbesked"])
        self.assertEqual(status(app, levende)["status"], "koerer")
        self.assertFalse(r["arbejder"]["startet"])

    def test_motor_pins_og_jobstart_uden_koe(self):
        app = H.ny_app()
        m = Motor(app.db, H.ROD / f"m{time.time_ns()}", app.db.url)
        # Runde 7c: serveren skriver sin egen motors pins ved opstart - ikke først, når arbejderen tager låsen.
        self.assertEqual(LL.motor_pins(app.db), {"model_commit": K.MODEL_COMMIT, "data_commit": K.DF_DATA_SHA,
                                                 "kilde": "Motor"})
        LL.skriv_motor_pins(app.db, "a" * 40, "b" * 40)
        self.assertEqual(LL.motor_pins(app.db), {"model_commit": "a" * 40, "data_commit": "b" * 40, "kilde": "Motor"})
        with self.assertRaises(ValueError):
            LL.skriv_motor_pins(app.db, "abc", "b" * 40)
        self.assertEqual(m.start_arbejder(), {"startet": False, "grund": "Køen er tom."})


if __name__ == "__main__":
    unittest.main()
