"""Codex K6 — fv-server's fund F4, F5, F6, F7, F8, F9, F11. Hver test fejlede før rettelsen (rapporter/fv-server.md › K6)."""

from __future__ import annotations

import io
import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
import zipfile

from sqlalchemy import select, text

import hjaelp as H
from fjernvarme_app import pakke_vaerk, valider_db
from fjernvarme_app.data_api import Fejl
from fjernvarme_app.server import lav_server
from fjernvarme_app.typer import nu, ny_uuid


def _res(rolle: str):
    from fjv import datakrav as DK
    fil = H.MODELREPO / "data" / "solar_andeby_dmi_karup.csv"
    if not fil.is_file():
        raise unittest.SkipTest(f"modelrepoets datafil findes ikke ({fil}); sæt FJV_MODELREPO")
    r = DK.valider(fil.read_text(encoding="utf-8"), rolle, tidszone="UTC", tidsstempel="start", vaerk=None)
    assert r.status == "gyldig", (rolle, [f["besked"] for f in r.validering["fund"] if f["niveau"] == "fejl"])
    return r


def _scenarie(app, vid, navn, **kw) -> str:
    sid = ny_uuid()
    with app.db.skriv() as cn:
        cn.execute(app.db.t("Scenarie").insert().values(id=sid, vaerk_id=vid, navn=navn, med_balancering=False,
                                                         arkiveret=False, oprettet_af="t@lokal", oprettet=nu(), **kw))
    return sid


def _aendring(app, sid, sti, vaerdi_json, typ="set", nr=1):
    with app.db.skriv() as cn:
        cn.execute(app.db.t("ScenarieAendring").insert().values(id=ny_uuid(), scenarie_id=sid, type=typ, sti=sti,
                                                                 vaerdi_json=vaerdi_json, raekkefoelge=nr))


def _rows(app, entitet, **hvor):
    t = app.db.t(entitet)
    q = select(t)
    for k, v in hvor.items():
        q = q.where(t.c[k] == v)
    with app.db.laes() as cn:
        return [dict(r._mapping) for r in cn.execute(q).fetchall()]


def _ret_pakke(data: bytes, ret) -> bytes:
    z = zipfile.ZipFile(io.BytesIO(data))
    filer = {n: z.read(n) for n in z.namelist()}
    p = json.loads(filer["pakke.json"])
    ret(p)
    filer["pakke.json"] = json.dumps(p).encode()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as u:
        for n, b in filer.items():
            u.writestr(n, b)
    return buf.getvalue()


class TestF4F5F6Pakke(unittest.TestCase):
    def setUp(self):
        from fjernvarme_app import vaerksskriv as VS
        self.app = H.ny_app()
        self.vid = H.vaerk(self.app, "kilde")
        with self.app.db.skriv() as cn:
            self.ts_v, _ = VS.indsaet_tidsserie(self.app.db, cn, self.vid, "kilde", "varmelast", "V", "f.csv",
                                                _res("varmelast"), "csv", False, "t")
            self.ts_s, _ = VS.indsaet_tidsserie(self.app.db, cn, self.vid, "kilde", "solprofil", "S", "f.csv",
                                                _res("solprofil"), "csv", False, "t")

    def test_F4_samme_fil_i_to_roller_beholder_rollen(self):
        a, b = _rows(self.app, "Tidsserie", id=self.ts_v)[0], _rows(self.app, "Tidsserie", id=self.ts_s)[0]
        self.assertEqual(a["sha256"], b["sha256"])                     # forudsætningen: identiske bytes
        sid = _scenarie(self.app, self.vid, "S")
        _aendring(self.app, sid, "_tidsserie.varmelast", json.dumps(self.ts_v), nr=1)
        _aendring(self.app, sid, "_tidsserie.solprofil", json.dumps(self.ts_s), nr=2)
        data, _ = pakke_vaerk.eksporter(self.app, "kilde")
        ny = pakke_vaerk.importer(self.app, data, "t@lokal", ny_kode="ny")
        nsid = _rows(self.app, "Scenarie", vaerk_id=ny["vaerk_id"])[0]["id"]
        for a in _rows(self.app, "ScenarieAendring", scenarie_id=nsid):
            tid = json.loads(a["vaerdi_json"])
            ts = _rows(self.app, "Tidsserie", id=tid)[0]
            self.assertEqual((ts["rolle"], ts["vaerk_id"]), (a["sti"].split(".")[1], ny["vaerk_id"]), a["sti"])

    def test_F4_uopløselig_reference_afvises(self):
        sid = _scenarie(self.app, self.vid, "S")
        _aendring(self.app, sid, "_tidsserie.varmelast", json.dumps(self.ts_v))
        data, _ = pakke_vaerk.eksporter(self.app, "kilde")

        def fjern_serier(p):
            p["tidsserier"] = []
        with self.assertRaises(Fejl) as e:
            pakke_vaerk.importer(self.app, _ret_pakke(data, fjern_serier), "t@lokal", ny_kode="ny")
        self.assertIn("tidsserie", e.exception.besked)
        self.assertEqual(len(_rows(self.app, "Vaerk")), 1)

    def test_F5_scenariereferencen_overlever(self):
        ref = _scenarie(self.app, self.vid, "Reference")
        _scenarie(self.app, self.vid, "Scenarie", reference_scenarie_id=ref)
        data, _ = pakke_vaerk.eksporter(self.app, "kilde")
        ny = pakke_vaerk.importer(self.app, data, "t@lokal", ny_kode="ny")
        sc = {s["navn"]: s for s in _rows(self.app, "Scenarie", vaerk_id=ny["vaerk_id"])}
        self.assertEqual(sc["Scenarie"]["reference_scenarie_id"], sc["Reference"]["id"])
        self.assertIsNone(sc["Reference"]["reference_scenarie_id"])

    def test_F5_alle_scenariekolonner_er_med_eller_bevidst_udeladt(self):
        kol = {k.navn for k in self.app.skema.tabeller["Scenarie"].kolonner}
        self.assertEqual(kol - set(pakke_vaerk.SCENARIE_FELTER) - set(pakke_vaerk.SCENARIE_UDELADT), set())

    def test_F6_ugyldige_aendringer_afvises_og_intet_skrives(self):
        sid = _scenarie(self.app, self.vid, "S")
        _aendring(self.app, sid, "units.sol.p_max_heat", "1.0")
        data, _ = pakke_vaerk.eksporter(self.app, "kilde")
        for navn, ret in (("ikke-json", lambda a: a.update(vaerdi_json="not-json")),
                          ("type", lambda a: a.update(type="slet")),
                          ("sti", lambda a: a.update(sti="")),
                          ("set uden værdi", lambda a: a.update(vaerdi_json=None))):
            with self.subTest(navn):
                def r(p, ret=ret):
                    ret(p["scenarier"][0]["aendringer"][0])
                with self.assertRaises(Fejl):
                    pakke_vaerk.importer(self.app, _ret_pakke(data, r), "t@lokal", ny_kode="ny")
                self.assertEqual(len(_rows(self.app, "Vaerk")), 1)

        def dublet(p):
            p["scenarier"][0]["aendringer"].append(dict(p["scenarier"][0]["aendringer"][0]))
        with self.assertRaises(Fejl):
            pakke_vaerk.importer(self.app, _ret_pakke(data, dublet), "t@lokal", ny_kode="ny")
        # En vellykket import efterlades ren for valider-db.
        pakke_vaerk.importer(self.app, data, "t@lokal", ny_kode="ny")
        self.assertEqual([f for f in valider_db.valider(self.app) if f["niveau"] == "fejl"], [])


class TestF7Laase(unittest.TestCase):
    """Låsene kompileret for hver dialekt (ingen server her): mssql skal have UPDLOCK+HOLDLOCK, postgresql FOR UPDATE
    — og aldrig FOR UPDATE på en aggregatforespørgsel."""

    def kompiler(self, q, dialekt):
        from sqlalchemy.dialects import mssql, postgresql, sqlite
        from fjernvarme_app.database import laas_for
        d = {"mssql": mssql.dialect(), "postgresql": postgresql.dialect(), "sqlite": sqlite.dialect()}[dialekt]
        return str(laas_for(q, dialekt).compile(dialect=d)).upper()

    def test_laast_aggregat_afvises(self):
        from sqlalchemy import func
        from fjernvarme_app.database import laas_for
        app = H.ny_app()
        v = app.db.t("Vaerk")
        for d in ("sqlite", "postgresql", "mssql"):
            with self.subTest(d), self.assertRaises(ValueError):
                laas_for(select(func.count()).select_from(v), d)
        self.assertIn("WITH (UPDLOCK, HOLDLOCK)", self.kompiler(select(v.c.id).where(v.c.kode == "x"), "mssql"))

    def test_alle_laaste_forespoergsler_i_de_betroede_forloeb(self):
        """Kør fv-port's forløb + importen mod sqlite og opsaml HVER låst forespørgsel; kompilér den for pg og mssql."""
        from fjernvarme_app import database as D
        set_: list = []
        orig = D.Database.laas_raekke

        def fang(self, q):
            set_.append(q)
            return orig(self, q)
        D.Database.laas_raekke = fang
        import os
        gammel = os.environ.get("FJV_BETROET_LAGER")
        os.environ["FJV_BETROET_LAGER"] = "sql_fabrik:fabrik"
        try:
            from fjernvarme_app.logik.tests import test_tjenester as TT
            res = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(
                unittest.defaultTestLoader.loadTestsFromModule(TT))
            self.assertTrue(res.wasSuccessful(), [str(f[1])[-600:] for f in res.failures + res.errors][:3])
            # I denne proces: værksark-, demo- og pakkevejen.
            app = H.ny_app()
            H.vaerk(app, "lp")
            data, _ = pakke_vaerk.eksporter(app, "lp")
            pakke_vaerk.importer(app, data, "t@lokal", ny_kode="lp2")
            from fjernvarme_app import lokal_lager as LL
            LL.LokalImportLager(app.db).tag_import(None)
            koe = LL.LokalKoe(app.db, H.ROD / "lp")
            l = koe.laas()
            l.tag()
            try:
                koe.overtag_naeste("mig", l)
            finally:
                l.frigiv()
        finally:
            D.Database.laas_raekke = orig
            if gammel is None:
                os.environ.pop("FJV_BETROET_LAGER", None)
            else:
                os.environ["FJV_BETROET_LAGER"] = gammel
        self.assertGreater(len(set_), 10, "forløbene låste for få forespørgsler — opsamlingen virker ikke")
        sql = [{d: self.kompiler(q, d) for d in ("mssql", "postgresql")} for q in set_]
        print(f"\nF7: {len(sql)} låste forespørgsler kompileret, {len({s['postgresql'] for s in sql})} forskellige",
              file=sys.stderr)
        for s in sql:
            with self.subTest(s["postgresql"][:80]):
                self.assertIn("WITH (UPDLOCK, HOLDLOCK)", s["mssql"])
                self.assertIn("FOR UPDATE", s["postgresql"])
                self.assertNotIn("COUNT(", s["postgresql"])


class TestF8Kalender(unittest.TestCase):
    def test_umulige_datoer_findes(self):
        for v in ("2026-99-99T25:61:61.000Z", "2026-02-30T00:00:00.000Z", "2025-02-29T12:00:00.000Z",
                  "2026-01-01T24:00:00.000Z"):
            with self.subTest(v):
                app = H.ny_app()
                H.vaerk(app)
                with app.db.skriv() as cn:
                    cn.execute(text('UPDATE "Vaerks" SET oprettet = :v'), {"v": v})
                koder = {f["kode"] for f in valider_db.valider(app) if f["niveau"] == "fejl"}
                self.assertIn("tid_kalender", koder)
        app = H.ny_app()
        H.vaerk(app)
        with app.db.skriv() as cn:
            cn.execute(text('UPDATE "Vaerks" SET oprettet = :v'), {"v": "2024-02-29T23:59:59.999Z"})   # skuddag findes
        self.assertEqual([f for f in valider_db.valider(app) if f["niveau"] == "fejl"], [])


class TestF9Oprindelse(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = H.ny_app(bruger="mig@lokal")
        cls.vid = H.vaerk(cls.app, "f9")
        cls.s = lav_server(cls.app, "127.0.0.1", 0)
        cls.port = cls.s.server_address[1]
        threading.Thread(target=cls.s.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.s.shutdown()
        cls.s.server_close()

    def kald(self, metode, sti, krop=None, hoveder=None, cookie=True):
        h = {"Content-Type": "application/json"}
        if cookie:
            h["Cookie"] = self.cookie()
        h.update(hoveder or {})
        r = urllib.request.Request(f"http://127.0.0.1:{self.port}{sti}", method=metode, headers=h,
                                   data=None if krop is None else json.dumps(krop).encode())
        try:
            with urllib.request.urlopen(r, timeout=20) as s:
                return s.status, json.loads(s.read() or b"null")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"null")

    def cookie(self) -> str:
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/api/session", timeout=20) as s:
            c = s.headers.get("Set-Cookie") or ""
        return c.split(";")[0]

    def raekke(self):
        return {"vaerk_id": self.vid, "navn": "x", "med_balancering": False, "arkiveret": False,
                "oprettet_af": "mig@lokal", "oprettet": "2026-10-16T12:00:00Z"}

    def test_fremmed_vaert_oprindelse_medietype_og_manglende_cookie_afvises(self):
        foer = len(_rows(self.app, "Scenarie"))
        for navn, hoveder, cookie in (
                ("Host", {"Host": "example.org"}, True),
                ("Origin", {"Origin": "https://example.org"}, True),
                ("Sec-Fetch-Site", {"Sec-Fetch-Site": "cross-site"}, True),
                ("Content-Type", {"Content-Type": "text/plain"}, True),
                ("cookie", {}, False)):
            with self.subTest(navn):
                st, svar = self.kald("POST", "/api/data/Scenarie", self.raekke(), hoveder, cookie)
                self.assertEqual(st, 403, svar)
        self.assertEqual(self.kald("GET", "/api/data/Vaerk", hoveder={"Host": "example.org"})[0], 403)  # rebinding
        self.assertEqual(len(_rows(self.app, "Scenarie")), foer)      # intet blev skrevet

    def test_egen_oprindelse_virker(self):
        st, _ = self.kald("POST", "/api/data/Scenarie", self.raekke(),
                          {"Origin": f"http://localhost:{self.port}", "Host": f"localhost:{self.port}",
                           "Sec-Fetch-Site": "same-origin"})
        self.assertEqual(st, 201)
        st, _ = self.kald("POST", "/api/fn/afstem", {}, {"Host": f"localhost:{self.port}"})
        self.assertEqual(st, 200)

    def test_delete_uden_krop_som_adapteren_men_ikke_uden_cookie(self):
        sid = _scenarie(self.app, self.vid, "d")
        nr = ny_uuid()
        with self.app.db.skriv() as cn:
            cn.execute(self.app.db.t("ScenarieAendring").insert().values(id=nr, scenarie_id=sid, type="disable",
                                                                          sti="kedel", raekkefoelge=1))
        r = urllib.request.Request(f"http://127.0.0.1:{self.port}/api/data/ScenarieAendring/{nr}", method="DELETE")
        with self.assertRaises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(r, timeout=20)
        self.assertEqual(e.exception.code, 403)
        r.add_header("Cookie", self.cookie())
        with urllib.request.urlopen(r, timeout=20) as s:
            self.assertEqual(s.status, 200)


class TestF11Advarsel(unittest.TestCase):
    def test_ikke_loopback_giver_advarsel_og_den_faktiske_adresse(self):
        from fjernvarme_app import cli
        for vaert, advar in (("0.0.0.0", True), ("192.168.1.5", True), ("127.0.0.1", False), ("::1", False),
                             ("localhost", False)):
            with self.subTest(vaert):
                linjer = cli.opstartslinjer(vaert, 8000, "/data", "mig@lokal", None)
                tekst = "\n".join(linjer)
                self.assertIn(f"{vaert}:8000" if ":" not in vaert else f"[{vaert}]:8000", tekst)
                self.assertEqual("ADVARSEL" in tekst, advar, tekst)
        tekst = "\n".join(cli.opstartslinjer("0.0.0.0", 8000, "/data", "mig@lokal", "X-Forwarded-Email"))
        self.assertIn("X-Forwarded-Email", tekst)


if __name__ == "__main__":
    unittest.main()
