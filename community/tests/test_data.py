"""Typer, filtre, data-API'ets DAB-regler, oprettelse med fv-skemas DDL og valider-db."""

from __future__ import annotations

import unittest
from datetime import datetime, timezone

from sqlalchemy import text

import hjaelp as H
from fjernvarme_app import valider_db
from fjernvarme_app.data_api import Fejl
from fjernvarme_app.typer import iso, til_utc


class TestTyper(unittest.TestCase):
    def test_tid_er_ms_utc_og_fast_bredde(self):
        self.assertEqual(iso(til_utc("2026-01-05T12:00:00.123456+02:00")), "2026-01-05T10:00:00.123Z")
        self.assertEqual(iso(til_utc("2026-01-05")), "2026-01-05T00:00:00.000Z")
        self.assertEqual(iso(til_utc(datetime(2026, 3, 29, 1, 30, tzinfo=timezone.utc))), "2026-03-29T01:30:00.000Z")
        self.assertEqual(len(iso(til_utc("2026-01-05T01:02:03Z"))), 24)
        with self.assertRaises(ValueError):
            til_utc("5. januar")

    def test_uuid_gemmes_med_smaa_bogstaver(self):
        app = H.ny_app()
        vid = H.vaerk(app)
        with app.db.laes() as cn:
            raa = cn.execute(text('SELECT id FROM "Vaerks"')).scalar()
        self.assertEqual(raa, vid.lower())
        r = app.data.laes_en("Vaerk", vid.upper())
        self.assertEqual(r["id"], vid)


class TestFilter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = H.ny_app()
        cls.v1 = H.vaerk(cls.app, "aaa")
        cls.v2 = H.vaerk(cls.app, "bbb")

    def laes(self, **kw):
        return self.app.data.laes("Vaerk", **kw)["items"]

    def test_eq_and_or_not(self):
        self.assertEqual([r["kode"] for r in self.laes(filter_={"kode": {"eq": "aaa"}})], ["aaa"])
        self.assertEqual(len(self.laes(filter_={"or": [{"kode": {"eq": "aaa"}}, {"kode": {"eq": "bbb"}}]})), 2)
        self.assertEqual(len(self.laes(filter_={"and": [{"kode": {"eq": "aaa"}}, {"kode": {"eq": "bbb"}}]})), 0)
        self.assertEqual([r["kode"] for r in self.laes(filter_={"not": {"kode": {"eq": "aaa"}}})], ["bbb"])
        self.assertEqual(len(self.laes(filter_={"beskrivelse": {"eq": None}})), 2)
        self.assertEqual(len(self.laes(filter_={"kode": {"in": ["aaa", "zzz"]}})), 1)
        self.assertEqual(len(self.laes(filter_={"kode": {"startsWith": "b"}})), 1)

    def test_sortering_og_sider(self):
        self.assertEqual([r["kode"] for r in self.laes(orden={"kode": "desc"})], ["bbb", "aaa"])
        s = self.app.data.laes("Vaerk", orden={"kode": "asc"}, first=1)
        self.assertTrue(s["hasNextPage"])
        s2 = self.app.data.laes("Vaerk", orden={"kode": "asc"}, first=1, after=s["endCursor"])
        self.assertEqual([s["items"][0]["kode"], s2["items"][0]["kode"]], ["aaa", "bbb"])
        self.assertFalse(s2["hasNextPage"])

    def test_tid_filtreres_som_tid(self):
        self.assertEqual(len(self.laes(filter_={"oprettet": {"gte": "2000-01-01T00:00:00Z"}})), 2)
        self.assertEqual(len(self.laes(filter_={"oprettet": {"lt": "2000-01-01"}})), 0)

    def test_ugyldigt_filter_er_en_fejl_ikke_et_tomt_filter(self):
        for f in ({"findes_ikke": {"eq": 1}}, {"kode": {"ligner": "a"}}, {"kode": "aaa"}, {"id": {"eq": "nej"}},
                  {"and": {"kode": {"eq": "a"}}}):
            with self.subTest(f=f), self.assertRaises(Fejl) as e:
                self.laes(filter_=f)
            self.assertEqual(e.exception.status, 400)
        with self.assertRaises(Fejl):
            self.app.data.laes("Vaerk", first=0)
        with self.assertRaises(Fejl):
            self.app.data.laes("_skema")


class TestDataRegler(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = H.ny_app(bruger="mig@lokal")
        cls.vid = H.vaerk(cls.app)

    def scen(self, **kw):
        r = {"vaerk_id": self.vid, "navn": "s", "med_balancering": False, "arkiveret": False,
             "oprettet_af": "mig@lokal", "oprettet": "2026-10-16T12:00:00Z", **kw}
        return self.app.data.opret("Scenarie", r, "mig@lokal")

    def fejlkode(self, f, *a, **kw):
        with self.assertRaises(Fejl) as e:
            f(*a, **kw)
        return e.exception.kode

    def test_policy_og_kraev(self):
        self.assertEqual(self.fejlkode(self.scen, oprettet_af="anden@lokal"), "policy")
        a = {"vaerk_id": self.vid, "forventet_revision": 1, "aendringer_json": "[]", "anmodet_af": "mig@lokal",
             "anmodet": "2026-10-16T12:00:00Z", "status": "udfoert"}
        self.assertEqual(self.fejlkode(self.app.data.opret, "Aendringsanmodning", a, "mig@lokal"), "policy")
        a["status"] = "ny"
        self.assertEqual(self.app.data.opret("Aendringsanmodning", a, "mig@lokal")["status"], "ny")

    def test_betroede_tabeller_kan_ikke_skrives(self):
        for e in ("Vaerk", "VaerkParameter", "Koersel", "KoerselInput", "Motor", "Tidsserie", "Aendringslog"):
            with self.subTest(e=e):
                self.assertEqual(self.fejlkode(self.app.data.opret, e, {}, "mig@lokal"), "ikke_tilladt")
        self.assertEqual(self.fejlkode(self.app.data.opdater, "Vaerk", self.vid, {"navn": "x"}, "mig@lokal"),
                         "ikke_tilladt")

    def test_update_undtagne_felter_og_ingen_sletning(self):
        s = self.scen()
        self.assertEqual(self.fejlkode(self.app.data.opdater, "Scenarie", s["id"], {"oprettet_af": "x"}, "mig@lokal"),
                         "ikke_tilladt")
        self.assertEqual(self.app.data.opdater("Scenarie", s["id"], {"navn": "ny"}, "mig@lokal")["navn"], "ny")
        self.assertEqual(self.fejlkode(self.app.data.slet, "Scenarie", s["id"], "mig@lokal"), "ikke_tilladt")

    def test_validering_foer_databasen(self):
        self.assertEqual(self.fejlkode(self.scen, navn="x" * 201), "ugyldig")
        self.assertEqual(self.fejlkode(self.scen, navn="𝄞" * 101), "ugyldig")       # 202 UTF-16-enheder
        self.assertEqual(self.fejlkode(self.scen, balancing_method="ny"), "ugyldig")
        self.assertEqual(self.fejlkode(self.scen, periode_start="5. jan"), "ugyldig")
        self.assertEqual(self.fejlkode(self.scen, mip_rel_gap=float("nan")), "ugyldig")
        self.assertEqual(self.fejlkode(self.scen, tidsgraense_s=1.5), "ugyldig")
        self.assertEqual(self.fejlkode(self.scen, med_balancering="true"), "ugyldig")
        self.assertEqual(self.fejlkode(self.scen, ukendt=1), "ugyldig")
        r = {"vaerk_id": self.vid, "med_balancering": False, "arkiveret": False, "oprettet_af": "mig@lokal",
             "oprettet": "2026-10-16T12:00:00Z"}
        self.assertEqual(self.fejlkode(self.app.data.opret, "Scenarie", r, "mig@lokal"), "ugyldig")   # navn mangler

    def test_unik_noegle(self):
        s = self.scen()
        b = {"scenarie_id": s["id"], "klient_noegle": "samme", "bestilt_af": "mig@lokal", "bestilt": "2026-10-16T12:00:00Z"}
        self.app.data.opret("Bestilling", b, "mig@lokal")
        self.assertEqual(self.fejlkode(self.app.data.opret, "Bestilling", b, "mig@lokal"), "unik")

    def test_scenarieaendring_crud(self):
        s = self.scen()
        a = self.app.data.opret("ScenarieAendring", {"scenarie_id": s["id"], "type": "set", "sti": "a.b",
                                                     "vaerdi_json": "1", "raekkefoelge": 1}, "mig@lokal")
        self.assertEqual(self.app.data.opdater("ScenarieAendring", a["id"], {"vaerdi_json": "2"}, "mig@lokal")["vaerdi_json"], "2")
        self.assertEqual(self.app.data.slet("ScenarieAendring", a["id"], "mig@lokal"), {"id": a["id"]})
        self.assertEqual(self.fejlkode(self.app.data.laes_en, "ScenarieAendring", a["id"]), "findes_ikke")


class TestSkemaOgValiderDb(unittest.TestCase):
    def test_database_oprettes_med_fv_skemas_ddl(self):
        app = H.ny_app()
        self.assertEqual(app.db.gemt_version(), app.skema.version)
        with app.db.laes() as cn:
            ddl = " ".join(r[0] for r in cn.execute(text("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL")))
        self.assertIn("UX_Tidsseries_hoejst_en_aktiv", ddl)
        self.assertIn("CK_Vaerks_kilde", ddl)
        self.assertFalse(app.db.opret(), "en eksisterende database røres ikke")

    def test_valider_db_ren_og_beskidt(self):
        app = H.ny_app()
        vid = H.vaerk(app)
        H.koersel(app, vaerk_id=vid)
        self.assertEqual([f for f in valider_db.valider(app) if f["niveau"] == "fejl"], [])
        # Skrevet udefra med SQL forbi serveren. DDL'ens CHECK'er afviser selv forkert tidsform og store
        # bogstaver i sqlite; hvad de IKKE kan se (referencer, gyldig JSON), skal valider-db finde.
        with self.assertRaises(Exception):
            with app.db.skriv() as cn:
                cn.execute(text('UPDATE "Vaerks" SET aendret = \'2026-01-05 12:00:00\''))
        with app.db.skriv() as cn:
            cn.execute(text('INSERT INTO "VaerkParameters" (id, vaerk_id, sti, vaerdi_json, sektion, bekraeft, '
                            'raekkefoelge, aendret_af, aendret) VALUES (\'11111111-1111-4111-8111-111111111111\', '
                            '\'22222222-2222-4222-8222-222222222222\', \'a.b\', \'NaN\', \'a\', 0, 1, \'x\', '
                            '\'2026-01-05T12:00:00.000Z\')'))
        koder = {f["kode"] for f in valider_db.valider(app) if f["niveau"] == "fejl"}
        self.assertLessEqual({"reference", "json"}, koder)


if __name__ == "__main__":
    unittest.main()
