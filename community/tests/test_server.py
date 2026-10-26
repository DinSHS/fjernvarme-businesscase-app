"""Serveren over HTTP (API.md), værkspakker og kreditten (brief 21 punkt 8)."""

from __future__ import annotations

import io
import json
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
import zipfile

import hjaelp as H
from fjernvarme_app import om, pakke_vaerk
from fjernvarme_app.data_api import Fejl
from fjernvarme_app.server import lav_server


class Server(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = H.ny_app(bruger="mig@lokal")
        cls.vid = H.vaerk(cls.app, "andeby_t")
        cls.s = lav_server(cls.app, "127.0.0.1", 0)
        cls.base = f"http://127.0.0.1:{cls.s.server_address[1]}"
        threading.Thread(target=cls.s.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.s.shutdown()
        cls.s.server_close()

    def kald(self, metode, sti, krop=None, raa: bytes | None = None):
        """Som en browser på siden: sessionscookien fra /api/session og den rigtige medietype (K6-F9)."""
        data = raa if raa is not None else (None if krop is None else json.dumps(krop).encode())
        if not hasattr(type(self), "_cookie"):
            with urllib.request.urlopen(self.base + "/api/session", timeout=30) as s:
                type(self)._cookie = (s.headers.get("Set-Cookie") or "").split(";")[0]
        h = {"Cookie": type(self)._cookie,
             "Content-Type": "application/zip" if raa is not None else "application/json"}
        r = urllib.request.Request(self.base + sti, data=data, method=metode, headers=h)
        try:
            with urllib.request.urlopen(r, timeout=30) as s:
                b = s.read()
                return s.status, (json.loads(b) if s.headers.get_content_type() == "application/json" else b)
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_session_og_om(self):
        self.assertEqual(self.kald("GET", "/api/session")[1]["bruger"], "mig@lokal")
        st, o = self.kald("GET", "/api/om")
        self.assertEqual(st, 200)
        self.assertIn("github.com/skj-1964/fjernvarme-businesscase", o["model"]["url"])
        self.assertEqual(o["model"]["licens"], "MIT")
        self.assertIn("MIT License", o["model"]["licenstekst"])
        self.assertIn("brugerflade til", o["saetning"])

    def test_laes_med_filter_og_sider(self):
        q = urllib.parse.urlencode({"filter": json.dumps({"kode": {"eq": "andeby_t"}}), "fields": "id,kode", "first": 1})
        st, s = self.kald("GET", f"/api/data/Vaerk?{q}")
        self.assertEqual((st, s["items"], s["hasNextPage"]), (200, [{"id": self.vid, "kode": "andeby_t"}], False))
        st, s = self.kald("GET", "/api/data/VaerkParameter?" + urllib.parse.urlencode(
            {"filter": json.dumps({"vaerk_id": {"eq": self.vid}}), "orderBy": json.dumps({"raekkefoelge": "asc"}), "first": 2}))
        self.assertTrue(s["hasNextPage"])
        self.assertEqual(self.kald("GET", f"/api/data/Vaerk/{self.vid}")[1]["kode"], "andeby_t")
        self.assertEqual(self.kald("GET", "/api/data/Vaerk?filter=%7Bnej")[1]["fejl"]["kode"], "ugyldig")
        self.assertEqual(self.kald("GET", "/api/data/Findesikke")[0], 404)

    def test_skriv_regler_over_http(self):
        r = {"vaerk_id": self.vid, "navn": "s", "med_balancering": False, "arkiveret": False,
             "oprettet_af": "anden@lokal", "oprettet": "2026-10-16T12:00:00Z"}
        st, f = self.kald("POST", "/api/data/Scenarie", r)
        self.assertEqual((st, f["fejl"]["kode"]), (403, "policy"))
        st, s = self.kald("POST", "/api/data/Scenarie", {**r, "oprettet_af": "mig@lokal"})
        self.assertEqual(st, 201)
        b = {"scenarie_id": s["id"], "klient_noegle": "n1", "bestilt_af": "mig@lokal", "bestilt": "2026-10-16T12:00:00Z"}
        self.assertEqual(self.kald("POST", "/api/data/Bestilling", b)[0], 201)
        self.assertEqual(self.kald("POST", "/api/data/Bestilling", b)[1]["fejl"]["kode"], "unik")
        self.assertEqual(self.kald("POST", "/api/data/Koersel", {})[1]["fejl"]["kode"], "ikke_tilladt")
        self.assertEqual(self.kald("DELETE", f"/api/data/Scenarie/{s['id']}")[1]["fejl"]["kode"], "ikke_tilladt")
        st, p = self.kald("PATCH", f"/api/data/Scenarie/{s['id']}", {"beskrivelse": "ny"})
        self.assertEqual((st, p["beskrivelse"]), (200, "ny"))

    def test_funktioner(self):
        self.assertEqual(self.kald("POST", "/api/fn/findesIkke", {})[0], 404)
        self.assertEqual(self.kald("POST", "/api/fn/startBestilling", {})[1]["fejl"]["kode"], "ugyldig")
        st, svar = self.kald("POST", "/api/fn/startBestilling", {"bestillingId": "nej"})
        self.assertEqual((st, svar["ok"]), (200, False))       # en afvisning er et 200-svar med ok: false (som TS)
        st, svar = self.kald("POST", "/api/fn/afstem", {})
        self.assertEqual((st, svar["tjekket"]), (200, 0))
        st, svar = self.kald("POST", "/api/fn/skemaInfo", {})
        self.assertIn("Koersels", {k["tabel"] for k in svar["kolonner"]})
        st, svar = self.kald("POST", "/api/fn/hentKildeYaml", {"vaerkId": self.vid})
        self.assertFalse(svar["ok"])

    def test_statisk_og_ingen_sti_udenfor(self):
        st, b = self.kald("GET", "/")
        self.assertEqual(st, 200)
        self.assertIn(b"skj-1964", b) if isinstance(b, bytes) and b"Frontenden er ikke bygget" in b else None
        st, f = self.kald("GET", "/../../hemmelig.txt")
        self.assertIn(st, (200, 404))                        # SPA-fallback eller 404 — aldrig filen
        self.assertNotIn(b"hemmelig", b if isinstance(b, bytes) else b"")

    def test_eksport_og_import_over_http(self):
        st, data = self.kald("GET", "/api/eksport/vaerk/andeby_t")
        self.assertEqual(st, 200)
        st, svar = self.kald("POST", "/api/import/vaerk?kode=andeby_t2", raa=data)
        self.assertEqual((st, svar.get("ok"), svar.get("parametre")), (200, True, 67), svar)
        st, f = self.kald("POST", "/api/import/vaerk?kode=andeby_t2", raa=data)
        self.assertEqual((st, f["fejl"]["kode"]), (409, "unik"))


class TestPakke(unittest.TestCase):
    def setUp(self):
        self.app = H.ny_app()
        H.vaerk(self.app, "pk")

    def pakke(self, ret):
        data, _ = pakke_vaerk.eksporter(self.app, "pk")
        z = zipfile.ZipFile(io.BytesIO(data))
        filer = {n: z.read(n) for n in z.namelist()}
        p = json.loads(filer["pakke.json"])
        ret(p, filer)
        filer["pakke.json"] = json.dumps(p).encode()
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as u:
            for n, b in filer.items():
                u.writestr(n, b)
        return buf.getvalue()

    def afvist(self, data, **kw):
        with self.assertRaises(Fejl) as e:
            pakke_vaerk.importer(self.app, data, "mig@lokal", **kw)
        return e.exception.besked

    def test_pakken_baerer_ingen_identiteter(self):
        data, navn = pakke_vaerk.eksporter(self.app, "pk")
        tekst = zipfile.ZipFile(io.BytesIO(data)).read("pakke.json").decode()
        self.assertEqual(navn, "pk.fjvpakke.zip")
        self.assertNotIn("@", tekst)
        self.assertNotIn("_id", tekst)

    def test_import_afviser_manipulation_foer_noget_skrives(self):
        def dublet(p, f):
            p["blade"].append(dict(p["blade"][0]))

        def for_lang(p, f):
            p["blade"][0]["vaerdi_json"] = '"' + "x" * 5000 + '"'

        def ugyldig_json(p, f):
            p["blade"][0]["vaerdi_json"] = "NaN"

        def format_(p, f):
            p["format_version"] = 99
        for ret, tekst in ((dublet, "står to gange"), (for_lang, "højst 4000"), (ugyldig_json, "JSON"), (format_, "format")):
            with self.subTest(ret=ret.__name__):
                self.assertIn(tekst.lower(), self.afvist(self.pakke(ret), ny_kode="ny").lower())
        self.assertIn("reserveret", self.afvist(self.pakke(lambda p, f: None), ny_kode="nyt"))
        self.assertIn("i brug", self.afvist(self.pakke(lambda p, f: None)))
        self.assertEqual(len(self.app.data.laes("Vaerk")["items"]), 1)

    def test_tidsserie_i_pakken_skal_passe_med_sin_sha256(self):
        app = self.app
        from fjv import datakrav as DK
        from fjernvarme_app import vaerksskriv as VS
        fil = H.MODELREPO / "data" / "billund_abvaerk_hourly.csv"
        if not fil.is_file():
            self.skipTest(f"modelrepoets datafil findes ikke ({fil}); sæt FJV_MODELREPO")
        res = DK.valider(fil.read_text(encoding="utf-8"), "varmelast", tidszone="UTC", tidsstempel="start", vaerk=None)
        self.assertEqual(res.status, "gyldig")
        vid = app.data.laes("Vaerk")["items"][0]["id"]
        with app.db.skriv() as cn:
            VS.indsaet_tidsserie(app.db, cn, vid, "pk", "varmelast", "Målt", "m.csv", res, "csv", True, "t")

        def byt(p, f):
            sha = p["tidsserier"][0]["sha256"]
            gammel = f[f"tidsserier/{sha}.csv"]
            f[f"tidsserier/{sha}.csv"] = gammel[:-2] + (b"8\n" if gammel[-2:-1] == b"9" else b"9\n")
        self.assertIn("sha256", self.afvist(self.pakke(byt), ny_kode="ny"))
        ok = pakke_vaerk.importer(app, self.pakke(lambda p, f: None), "mig@lokal", ny_kode="ny")
        self.assertEqual((ok["tidsserier"], ok["parametre"]), (1, 67))


class TestKredit(unittest.TestCase):
    """Punkt 8: README'ens første afsnit og om-endpointet peger på den oprindelige case."""

    def test_readme_foerste_afsnit(self):
        k = json.loads((H.HER.parent.parent / "offentlig/kredit.json").read_text(encoding="utf-8"))
        linjer = (H.HER.parent / "README.md").read_text(encoding="utf-8").splitlines()[:k["readme_foerste_afsnit_linjer"]]
        for x in k["readme_foerste_afsnit_skal_naevne"] + ["Billund Varme", "Dansk Fjernvarme", "brugerflade til",
                                                           "distribuerer ikke modellens kode", "pinnet commit"]:
            self.assertIn(x, " ".join(linjer).replace("\n", " "), x)

    def test_om_kreditlinje_og_ingen_antydning(self):
        import re
        k = json.loads((H.HER.parent.parent / "offentlig/kredit.json").read_text(encoding="utf-8"))
        o = om.om()
        for x in ("Bygger på", "skj-1964", "Billund Varme og Dansk Fjernvarme", "df-data"):
            self.assertIn(x, o["kreditlinje"])
        tekst = json.dumps(o, ensure_ascii=False) + (H.HER.parent / "README.md").read_text(encoding="utf-8")
        for m in k["ikke_antydning"]:
            for fund in re.finditer(m, tekst):
                omkring = tekst[max(0, fund.start() - 40):fund.end() + 40]
                self.assertTrue(any(u in omkring for u in k["ikke_antydning_undtagelser"]), omkring)


if __name__ == "__main__":
    unittest.main()
