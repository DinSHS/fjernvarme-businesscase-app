"""Arkivets genimport i den lokale udgave (runde 13): Python-porten mod TS' vektorer og over HTTP.

* ``skema/vektorer/arkiv/*.json`` er genereret ved at køre ``arkiv.ts`` (``generer_arkiv.mts``). Porten
  (``fjernvarme_app/logik/arkiv.py``) skal give PRÆCIS samme udfald og samme danske tekster.
* ``arkiv_importer_del``: hele forløbet trin for trin mod en rigtig sqlite-database (``betroet_lager``) —
  samme svar pr. del, samme anmodningsstatus og samme sha256 pr. tabel bagefter som TS mod sin hukommelses-db.
* Til sidst over HTTP: ``POST /api/fn/importerArkiv`` med en anmodning oprettet i brugerens eget navn.

    cd community && python -m unittest discover -s tests -t tests
"""

from __future__ import annotations

import contextlib
import json
import math
import sys
import threading
import time
import unittest

import hjaelp as H  # noqa: E402  (sætter sys.path og datamappen)

from fjernvarme_app.betroet_lager import SqlBetroetLager  # noqa: E402
from fjernvarme_app.logik import arkiv as A  # noqa: E402
from fjernvarme_app.logik import jsjson as J  # noqa: E402

sys.stdout.reconfigure(errors="replace")

MAPPE = H.HER.parent.parent / "skema" / "vektorer" / "arkiv"


def _dekod(o: dict):
    if len(o) == 1:
        (k, v), = o.items()
        if k == "$tal":
            return {"Infinity": math.inf, "-Infinity": -math.inf, "NaN": math.nan, "-0": -0.0}[v]
        if k == "$map":
            return {a: b for a, b in v}
    return o


def laes(gruppe: str) -> list[dict]:
    return json.loads((MAPPE / f"{gruppe}.json").read_text(encoding="utf-8"), object_hook=_dekod)["tilfaelde"]


def lig(a, b) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if J.er_tal(a) and J.er_tal(b):
        return (math.isnan(a) and math.isnan(b)) or float(a) == float(b)
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(lig(a[k], b[k]) for k in a)
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(lig(x, y) for x, y in zip(a, b))
    return a == b


class Vektorer(unittest.TestCase):
    def kør(self, gruppe: str, f):
        tilfaelde = laes(gruppe)
        self.assertTrue(tilfaelde, gruppe)
        for t in tilfaelde:
            with self.subTest(gruppe=gruppe, navn=t["navn"]):
                try:
                    ud = {"ud": f(t["input"])}
                except A.ArkivAfvisning as e:
                    ud = {"afvisning": str(e)}
                if "fejl" in t:
                    self.fail(f"TS gav en programfejl ({t['fejl']}); vektoren dækker ikke en afvisning")
                if "afvisning" in t:
                    self.assertEqual(ud.get("afvisning"), t["afvisning"])
                else:
                    self.assertNotIn("afvisning", ud, ud.get("afvisning"))
                    self.assertTrue(lig(ud["ud"], t["ud"]), f"{ud['ud']!r} != {t['ud']!r}")

    def test_kanonisk(self):
        self.kør("arkiv_kanonisk", lambda i: A.kanonisk(i["kolonne"], i["v"]))

    def test_fejl_i_vaerdi(self):
        def f(i):
            k = next(k for k in A.kolonner(i["tabel"]) if k["navn"] == i["kolonne"])
            return A.fejl_i_vaerdi(k, i["v"])
        self.kør("arkiv_fejl_i_vaerdi", f)

    def test_tabel_sha(self):
        self.kør("arkiv_tabel_sha", lambda i: A.tabel_sha(i["raekker"]))

    def test_laes_import_anmodning(self):
        self.kør("arkiv_laes_import_anmodning", lambda i: A.laes_import_anmodning(i["tekst"]))

    def test_laes_del(self):
        self.kør("arkiv_laes_del", lambda i: A.laes_del(i["tekst"]))

    def test_vaerk_revisioner(self):
        self.kør("arkiv_vaerk_revisioner", lambda i: A.vaerk_revisioner(i["revision"], i["blade"], i["log"]))

    def test_decimal_tekst(self):
        self.kør("arkiv_decimal_tekst", lambda i: A.decimal_tekst(i["n"]))

    def test_tjek_koersel(self):
        def f(i):
            A.tjek_koersel({**i, "revisioner": i["revisioner"], "tidsserier": set(i["tidsserier"])})
            return None
        self.kør("arkiv_tjek_koersel", f)


class Forloeb(unittest.TestCase):
    """``arkiv_importer_del``: TS' forløb mod hukommelsen = portens forløb mod sqlite, del for del."""

    def test_forloebene(self):
        for t in laes("arkiv_importer_del"):
            with self.subTest(navn=t["navn"]):
                app = H.ny_app()
                with app.db.skriv() as cn:
                    for tabel, raekker in t["input"]["start"].items():
                        if raekker:
                            cn.execute(app.db.t(tabel).insert(), raekker)
                lager = SqlBetroetLager(app.db)
                svar = []
                for s in t["input"]["trin"]:
                    with app.db.skriv() as cn:
                        cn.execute(app.db.t("Aendringsanmodning").insert().values(
                            id=s["anmodning_id"], vaerk_id=s["vaerk_id"], forventet_revision=0, aendringer_json=s["aendringer_json"],
                            anmodet_af="v@example.org", anmodet="2026-10-28T09:00:00.000Z", status="ny", svar=None))
                    svar.append(A.importer_del(lager, s["anmodning_id"], s["tekst"]))
                self.assertTrue(lig(svar, t["ud"]["svar"]), f"\n{svar}\n!=\n{t['ud']['svar']}")
                with app.db.laes() as cn:
                    for tabel in A.IMPORT_TABELLER:
                        r = [dict(x._mapping) for x in cn.execute(app.db.t(tabel).select()).fetchall()]
                        self.assertEqual(A.tabel_sha([A.kanonisk_raekke(tabel, x) for x in r]), t["ud"]["shas"][tabel], tabel)
                    a = {x.id: (x.status, x.svar) for x in cn.execute(app.db.t("Aendringsanmodning").select()).fetchall()}
                for id, status, svartekst in t["ud"]["anmodninger"]:
                    self.assertEqual(a[id], (status, svartekst), id)


class ApplockN1(unittest.TestCase):
    """K10b-N1: community-MSSQL skal læse sp_getapplock's returkode og kaste ved < 0 (rollback), som Fabric-TS."""

    class _Svar:
        def __init__(self, rc):
            self.rc = rc

        def scalar(self):
            return self.rc

    class _Cn:
        def __init__(self, rc):
            self.rc, self.sql = rc, []

        def execute(self, q, params=None):
            self.sql.append(str(q))
            return ApplockN1._Svar(self.rc)

    class _Db:
        dialekt = "mssql"

    def tx(self, rc):
        from fjernvarme_app.betroet_lager import SqlTransaktion
        cn = self._Cn(rc)
        return SqlTransaktion(self._Db(), cn), cn

    def test_negativ_returkode_kaster(self):
        for rc in (-1, -2, -3, -999, None):
            tx, cn = self.tx(rc)
            with self.assertRaises(RuntimeError, msg=f"rc={rc}"):
                tx.arkiv_laas_koersler(["aaaaaaaa-0000-4000-8000-000000000001"])
            self.assertIn("EXEC @rc = sp_getapplock", cn.sql[0])
            self.assertIn("SELECT @rc", cn.sql[0])

    def test_tildelt_laas_gaar_videre_i_fast_orden(self):
        tx, cn = self.tx(0)
        tx.arkiv_laas_koersler(["aaaaaaaa-0000-4000-8000-000000000001", "bbbbbbbb-0000-4000-8000-000000000002"])
        self.assertEqual(len(cn.sql), 2)
        tx1, _ = self.tx(1)                                # 1 = tildelt efter ventetid
        tx1.arkiv_laas_koersler(["aaaaaaaa-0000-4000-8000-000000000001"])


class ModelLager:
    """READ COMMITTED som SQL Server: læsninger ser det committede, skrivninger committes til sidst, og
    ``arkiv_laas_koersler`` er en rigtig, ventende lås pr. kørsels-id (som sp_getapplock), holdt til transaktionen
    slutter. sqlite's BEGIN IMMEDIATE og den lokale funktionsmutex ville serialisere alt og skjule K10-F3; her flettes
    to transaktioner i hver sin tråd."""

    def __init__(self, db: dict, laas: bool = True, foer_indsaet=None):
        self.db, self.laas, self.foer_indsaet = db, laas, foer_indsaet
        self.laase: dict[str, threading.Lock] = {}
        self.register = threading.Lock()

    @contextlib.contextmanager
    def transaktion(self):
        tx = _ModelTx(self)
        try:
            yield tx
            for tabel, id, raekke in tx.skrevet:
                self.db.setdefault(tabel, {})[id] = raekke
        finally:
            for l in tx.holdt:
                l.release()


class _ModelTx:
    def __init__(self, l: ModelLager):
        self.l, self.skrevet, self.holdt = l, [], []

    def _alle(self, tabel):
        return list(self.l.db.get(tabel, {}).values())

    def anmodning(self, id, laas):
        a = self.l.db["Aendringsanmodning"].get(id)
        return dict(a) if a else None

    def saet_anmodning(self, id, status, svar):
        a = self.l.db["Aendringsanmodning"][id]
        if a["status"] == "ny":
            self.skrevet.append(("Aendringsanmodning", id, {**a, "status": status, "svar": svar}))

    def arkiv_laas_koersler(self, ider):
        if not self.l.laas:
            return
        for id in ider:
            with self.l.register:
                laas = self.l.laase.setdefault(id, threading.Lock())
            laas.acquire()
            self.holdt.append(laas)

    def arkiv_hent(self, tabel, ider):
        return [dict(self.l.db.get(tabel, {})[i]) for i in ider if i in self.l.db.get(tabel, {})]

    def arkiv_indsaet(self, tabel, raekker, kolonner):
        if self.l.foer_indsaet:
            self.l.foer_indsaet(tabel)
        for r in raekker:
            self.skrevet.append((tabel, r["id"], dict(r)))

    def arkiv_boerneside(self, koersel_id, tabel, fra, antal):
        r = sorted((x for x in self._alle(tabel) if x["koersel_id"] == koersel_id), key=lambda x: x["id"])
        return [dict(x) for x in r[fra:fra + antal]]

    def arkiv_input(self, koersel_id):
        return [{"kilde": x["kilde"], "sti": x["sti"], "vaerdi_json": x["vaerdi_json"]} for x in self._alle("KoerselInput") if x["koersel_id"] == koersel_id]

    def arkiv_vaerk_historik(self, vaerk_id):
        v = self.l.db["Vaerk"][vaerk_id]
        return {"revision": v["revision"], "blade": [x for x in self._alle("VaerkParameter") if x["vaerk_id"] == vaerk_id],
                "log": [x for x in self._alle("Aendringslog") if x["vaerk_id"] == vaerk_id]}

    def arkiv_tidsserier(self, vaerk_id):
        return [{"rolle": x["rolle"], "sha256": x["sha256"]} for x in self._alle("Tidsserie") if x["vaerk_id"] == vaerk_id and x["status"] == "gyldig"]


class SammenfletningF3(unittest.TestCase):
    """K10-F3 eksplicit: B (en ekstra timerække) holder pause midt i sin transaktion, imens afslutter A kørslen."""

    def kør(self, laas: bool):
        t = next(x for x in laes("arkiv_importer_del") if x["navn"] == "fuld import og så igen")
        db = {tabel: {r["id"]: dict(r) for r in raekker} for tabel, raekker in t["input"]["start"].items()}
        db.setdefault("Aendringsanmodning", {})
        trin = t["input"]["trin"]

        def anmod(s, id):
            db["Aendringsanmodning"][id] = {"id": id, "vaerk_id": s["vaerk_id"], "forventet_revision": 0, "aendringer_json": s["aendringer_json"],
                                            "anmodet_af": "v@example.org", "anmodet": "2026-10-28T09:00:00.000Z", "status": "ny", "svar": None}
        grund = ModelLager(db, laas)
        for s in trin[:6]:                    # scenarier, bestilling og kørslens fire undertabeller
            anmod(s, s["anmodning_id"])
            self.assertTrue(A.importer_del(grund, s["anmodning_id"], s["tekst"])["ok"])
        # B: én timerække mere til samme kørsel (gyldig, eget id og eget tidspunkt).
        ks = A.kolonnenavne("KoerselTime")
        foerste = next(iter(db["KoerselTime"].values()))
        ekstra = [foerste[k] for k in ks]
        ekstra[0] = "aaaaaaaa-2222-4222-8222-222222222222"
        ekstra[ks.index("tid")] = "2026-03-31T01:00:00.000Z"
        arkiv = J.parse(trin[0]["tekst"])["arkiv"]
        tekst_b = J.stringify({"format": "fjv-arkiv-del", "version": 2, "arkiv": arkiv, "tabel": "KoerselTime", "kolonner": ks, "raekker": [ekstra]})
        anm_b = J.stringify([{"handling": "importer_arkiv", "arkiv": arkiv, "sha256": A.sha256_tekst(tekst_b), "tabel": "KoerselTime",
                              "nr": 1, "af": 1, "koersel_ider": [], "filnavn": "b"}])
        id_b, id_a = "f0000000-0000-4000-8000-0000000000b1", trin[6]["anmodning_id"]
        anmod({"vaerk_id": A.NIL_UUID, "aendringer_json": anm_b}, id_b)
        anmod(trin[6], id_a)
        i_pause, fortsaet = threading.Event(), threading.Event()

        def hold(tabel):
            if tabel == "KoerselTime":
                i_pause.set()
                fortsaet.wait(5)
        svar = {}
        b = threading.Thread(target=lambda: svar.__setitem__("b", A.importer_del(_med(grund, hold), id_b, tekst_b)))
        b.start()
        self.assertTrue(i_pause.wait(5))
        a = threading.Thread(target=lambda: svar.__setitem__("a", A.importer_del(grund, id_a, trin[6]["tekst"])))
        a.start()
        time.sleep(0.3)                       # A får chancen for at køre forbi B
        fortsaet.set()
        b.join(10)
        a.join(10)
        return svar, db

    def test_med_laas_venter_afslutningen_og_ser_den_ekstra_raekke(self):
        svar, db = self.kør(laas=True)
        self.assertTrue(svar["b"]["ok"], svar["b"])
        self.assertFalse(svar["a"]["ok"], svar["a"])
        self.assertIn("KoerselTime har 5 rækker i databasen, arkivet 4", svar["a"]["svar"])
        self.assertNotIn("55555555-5555-4555-8555-555555555555", db.get("Koersel", {}))

    def test_kontrolproeve_uden_laas_genskaber_fejlen(self):
        svar, db = self.kør(laas=False)
        self.assertTrue(svar["a"]["ok"] and svar["b"]["ok"])
        self.assertIn("55555555-5555-4555-8555-555555555555", db["Koersel"])
        self.assertEqual(len(db["KoerselTime"]), 5)


def _med(lager: ModelLager, foer_indsaet) -> ModelLager:
    """Samme database og samme låse, men med en pause-krog (B's forbindelse)."""
    l = ModelLager(lager.db, lager.laas, foer_indsaet)
    l.laase, l.register = lager.laase, lager.register
    return l


class OverHttp(unittest.TestCase):
    """REST-vejen: anmodning i eget navn (data-API'ets policy) og så ``/api/fn/importerArkiv``."""

    def test_importer_arkiv_som_funktion(self):
        from fjernvarme_app import funktioner as F
        t = next(x for x in laes("arkiv_importer_del") if x["navn"] == "fuld import og så igen")
        app = H.ny_app(bruger="importoer@example.org")
        with app.db.skriv() as cn:
            for tabel, raekker in t["input"]["start"].items():
                if raekker:
                    cn.execute(app.db.t(tabel).insert(), raekker)
        første = t["input"]["trin"][0]
        from fjernvarme_app import data_api as D
        a = app.data.opret("Aendringsanmodning", {
            "vaerk_id": A.NIL_UUID, "forventet_revision": 0, "aendringer_json": første["aendringer_json"],
            "anmodet_af": "importoer@example.org", "anmodet": "2026-10-28T09:00:00.000Z", "status": "ny"}, "importoer@example.org")
        svar = F.kald(app, "importerArkiv", {"anmodningId": a["id"], "del": første["tekst"]}, "importoer@example.org")
        self.assertEqual(svar["status"], "udfoert", svar)
        self.assertEqual(svar["oprettet"], 4)          # 2 scenarier + deres 2 ændringer i samme del (K10-F1)
        with self.assertRaises(D.Fejl):
            F.kald(app, "importerArkiv", {"anmodningId": a["id"]}, "importoer@example.org")


if __name__ == "__main__":
    unittest.main()
