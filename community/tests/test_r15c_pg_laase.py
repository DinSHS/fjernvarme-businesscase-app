"""Tredje rettelsesrunde i runde 15, P3-6 — PostgreSQL: ét advisory-låserum pr. låsetype, og flere låse i nøgleorden.

Den lokale udgave har tre transaktionsejede låse: brugerens kvote, bestillingen og arkivets kørselslås. På SQL Server
er de ``sp_getapplock`` med hele ressourcenavnet (``fjv_kvote:…``, ``fjv_bestilling:…``, ``fjv_arkiv:…``). På
PostgreSQL blev alle tre taget som ``pg_advisory_xact_lock(hashtext(navn))``: ÉN 32-bit nøgle i ÉT fælles rum.
Præfikset adskiller ikke rummene efter hashing. Efterprøvningens (statisk fundne) cyklus:

* importen holder kørselslåsen for K og venter på bestillingens lås B (kørsel -> bestilling);
* behandlingen af B holder B og venter på ejerens kvotelås (bestilling -> kvote);
* rammer kvotens nøgle samme 32 bit som K's, er de to SAMME lås: en baglås.

Efter rettelsen: ``pg_advisory_xact_lock(rum, nøgle)`` med et fast rum pr. type — en kollision på tværs af typer er
ikke længere samme lås — og hvor flere låse af samme type tages på én gang, tages de FAKTISKE nøgler sorteret og uden
dubletter, så en kollision inden for typen heller ikke kan vende rækkefølgen mellem to transaktioner.

PostgreSQL kan ikke køres her. Testene bruger en optagende forbindelse (som ``test_r15_laase.py``): de beviser
udsagnene, rummene og rækkefølgen — ikke ventetiden mellem to rigtige forbindelser.

Kør: ``cd community && python -m unittest discover -s tests -t tests`` (kræver sqlalchemy).
"""

from __future__ import annotations

import unittest
from unittest import mock

import hjaelp as H  # noqa: F401 — sætter datamappen op, før appen importeres
from fjernvarme_app import betroet_lager as BL
from fjernvarme_app.logik import arkiv as A

K1 = "11111111-0000-4000-8000-000000000001"
B1 = "aaaaaaaa-0000-4000-8000-00000000000a"


class _Cn:
    """En forbindelse, der optager hvert udsagn og dets parametre."""

    def __init__(self):
        self.sql, self.params = [], []

    def execute(self, q, params=None):
        self.sql.append(str(q))
        self.params.append(dict(params or {}))


class _Db:
    dialekt = "postgresql"


def tx():
    cn = _Cn()
    return BL.SqlTransaktion(_Db(), cn), cn


def laase(cn) -> list[tuple]:
    """De advisory-låse, forbindelsen har taget, som (rum, nøgle) — ``None``, hvor udsagnet ikke bærer dem."""
    return [(p.get("rum"), p.get("noegle")) for q, p in zip(cn.sql, cn.params) if "pg_advisory_xact_lock" in q]


def fast_noegle(tabel: dict):
    """En nøglefunktion med KENDTE kollisioner: navnet efter ``rum:`` slås op i tabellen."""
    return lambda navn: tabel[navn.split(":", 1)[1]]


class Laaserum(unittest.TestCase):
    def test_hver_laasetype_har_sit_eget_rum(self):
        rum = {}
        for navn, kald in (("kvote", lambda t: t.laas_kvote("a@lokal")), ("bestilling", lambda t: t.laas_bestilling(B1)),
                           ("arkiv", lambda t: t.arkiv_laas_koersler([K1]))):
            t, cn = tx()
            kald(t)
            self.assertEqual(len(cn.sql), 1, navn)
            # To-nøgle-formen: rummet er første nøgle. Før: pg_advisory_xact_lock(hashtext(:k)) — én nøgle, ét rum.
            self.assertIn("pg_advisory_xact_lock(CAST(:rum AS integer), CAST(:noegle AS integer))", cn.sql[0], navn)
            self.assertNotIn("hashtext", cn.sql[0], navn)
            rum[navn] = laase(cn)[0][0]
        self.assertEqual(len(set(rum.values())), 3, rum)
        self.assertTrue(all(isinstance(r, int) and not isinstance(r, bool) for r in rum.values()), rum)

    def test_efterproevningens_tilfaelde_en_kollision_paa_tvaers_af_typer_er_ikke_samme_laas(self):
        """Kvotens og kørslens 32-bit nøgle er ENS (tvunget her). Før var det samme lås; nu skiller rummet dem."""
        with mock.patch.object(BL, "pg_noegle32", lambda navn: 42, create=True):
            taget = []
            for kald in (lambda t: t.arkiv_laas_koersler([K1]), lambda t: t.laas_bestilling(B1), lambda t: t.laas_kvote("a@lokal")):
                t, cn = tx()
                kald(t)
                taget += laase(cn)
        self.assertEqual([n for _, n in taget], [42, 42, 42])
        self.assertEqual(len(set(taget)), 3, taget)                     # før: tre gange samme lås

    def test_noeglen_er_et_int4_og_afhaenger_af_navnet(self):
        self.assertTrue(hasattr(BL, "pg_noegle32"))
        n = [BL.pg_noegle32(f"fjv_arkiv:{i:08d}-0000-4000-8000-000000000001") for i in range(2000)]
        self.assertTrue(all(isinstance(x, int) and -2**31 <= x < 2**31 for x in n))
        self.assertGreater(len(set(n)), 1990)                           # spredt, ikke en konstant
        self.assertTrue(any(x < 0 for x in n) and any(x > 0 for x in n))   # hele int4, med fortegn
        self.assertEqual(BL.pg_noegle32("fjv_kvote:a@lokal"), BL.pg_noegle32("fjv_kvote:a@lokal"))   # stabil mellem kald

    def test_laasen_tages_paa_det_normaliserede_navn(self):
        t1, c1 = tx()
        t1.arkiv_laas_koersler([K1.upper()])
        t2, c2 = tx()
        t2.arkiv_laas_koersler([K1])
        self.assertEqual(laase(c1), laase(c2))


class Flerlaasning(unittest.TestCase):
    #: a < b < c < d som id'er — men a og d deler nøgle 2, b og c deler nøgle 1.
    IDER = {"a": "aaaaaaaa-0000-4000-8000-000000000001", "b": "bbbbbbbb-0000-4000-8000-000000000002",
            "c": "cccccccc-0000-4000-8000-000000000003", "d": "dddddddd-0000-4000-8000-000000000004"}

    def orden(self, kald, ider) -> list[int]:
        I = self.IDER
        with mock.patch.object(BL, "pg_noegle32", fast_noegle({I["a"]: 2, I["d"]: 2, I["b"]: 1, I["c"]: 1}), create=True):
            t, cn = tx()
            getattr(t, kald)([I[x] for x in ider])
        self.assertTrue(all(r is not None for r, _ in laase(cn)), cn.sql)
        return [n for _, n in laase(cn)]

    def test_en_kollision_inden_for_typen_kan_ikke_vende_raekkefoelgen(self):
        """To importer med {a, c} og {b, d}. Sorteret på ID tog den første nøglerne 2, 1 og den anden 1, 2: en
        baglås. Sorteret på de FAKTISKE nøgler tager begge 1 før 2."""
        for kald in ("arkiv_laas_koersler", "laas_bestillinger"):
            self.assertEqual(self.orden(kald, "ac"), [1, 2], kald)      # før (på id): [2, 1]
            self.assertEqual(self.orden(kald, "bd"), [1, 2], kald)
            self.assertEqual(self.orden(kald, "dcba"), [1, 2], kald)    # uanset rækkefølgen, de gives i

    def test_samme_noegle_tages_kun_en_gang(self):
        for kald in ("arkiv_laas_koersler", "laas_bestillinger"):
            self.assertEqual(self.orden(kald, "ad"), [2], kald)         # to id'er, én faktisk lås
            self.assertEqual(self.orden(kald, "aa"), [2], kald)

    def test_importens_koerselsdel_giver_alle_bestillinger_til_een_flerlaasning(self):
        """``arkiv._skriv_del`` tog bestillingernes låse én ad gangen, sorteret på id. Nu får lageret dem samlet og
        kan ordne dem på de faktiske nøgler."""
        ks = A.kolonnenavne("Koersel")
        kald: list = []

        class Stop(Exception):
            pass

        class Tx:
            def arkiv_laas_koersler(self, ider):
                kald.append(("arkiv_laas_koersler", list(ider)))

            def laas_bestillinger(self, ider):
                kald.append(("laas_bestillinger", list(ider)))

            def arkiv_hent(self, tabel, ider):
                raise Stop

        def raekke(kid, bid):
            r = [None] * len(ks)
            r[0], r[ks.index("bestilling_id")] = kid, bid
            return r

        I = self.IDER
        with self.assertRaises(Stop):
            A._skriv_del(Tx(), {"tabel": "Koersel", "raekker": [raekke(K1, I["c"]), raekke(K1[:-1] + "2", I["a"])]})
        self.assertEqual(kald, [("arkiv_laas_koersler", [K1, K1[:-1] + "2"]), ("laas_bestillinger", [I["a"], I["c"]])])


class SqlServerUaendret(unittest.TestCase):
    def test_applock_bruger_stadig_hele_ressourcenavnet_i_den_givne_orden(self):
        class Svar:
            def scalar(self):
                return 0

        class Cn(_Cn):
            def execute(self, q, params=None):
                super().execute(q, params)
                return Svar()

        class Db:
            dialekt = "mssql"

        cn = Cn()
        t = BL.SqlTransaktion(Db(), cn)
        t.laas_bestillinger([B1, K1])
        self.assertEqual([p["k"] for p in cn.params], ["fjv_bestilling:" + B1, "fjv_bestilling:" + K1])
        self.assertTrue(all("sp_getapplock" in q for q in cn.sql))


if __name__ == "__main__":
    unittest.main()
