"""Arkivets genimport i den lokale udgave (runde 13): Python-porten mod TS' vektorer og over HTTP.

* ``skema/vektorer/arkiv/*.json`` er genereret ved at køre ``arkiv.ts`` (``generer_arkiv.mts``). Porten
  (``fjernvarme_app/logik/arkiv.py``) skal give PRÆCIS samme udfald og samme danske tekster.
* ``arkiv_importer_del``: hele forløbet trin for trin mod en rigtig sqlite-database (``betroet_lager``) —
  samme svar pr. del, samme anmodningsstatus og samme sha256 pr. tabel bagefter som TS mod sin hukommelses-db.
* Til sidst over HTTP: ``POST /api/fn/importerArkiv`` med en anmodning oprettet i brugerens eget navn.

    cd community && python -m unittest discover -s tests -t tests
"""

from __future__ import annotations

import json
import math
import sys
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
        def f(i):
            d = A.laes_del(i["tekst"])
            if d["forventet"] is None:
                del d["forventet"]
            return d
        self.kør("arkiv_laes_del", f)

    def test_vaerk_revisioner(self):
        self.kør("arkiv_vaerk_revisioner", lambda i: A.vaerk_revisioner(i["revision"], i["blade"], i["log"]))

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
        self.assertEqual(svar["oprettet"], 2)
        with self.assertRaises(D.Fejl):
            F.kald(app, "importerArkiv", {"anmodningId": a["id"]}, "importoer@example.org")


if __name__ == "__main__":
    unittest.main()
