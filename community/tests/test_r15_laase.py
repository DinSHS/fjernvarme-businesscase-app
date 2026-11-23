"""Runde 15, anden rettelsesrunde — låsene i den lokale udgave (fund I og fund A).

**Fund I (P3).** ``laas_bestilling`` og ``arkiv_laas_koersler`` læste ``sp_getapplock``'s returværdi; kvotelåsen
(``laas_kvote``) kaldte proceduren uden at læse den. ``sp_getapplock`` melder en lås, den IKKE fik, i sin returværdi
(-1 = timeout, -2 = annulleret, -3 = deadlock-offer, -999 = fejl) — ikke som en SQL-fejl. Ved en timeout gik
bestillingen derfor videre til optællingen af køen uden brugerens kvotelås, og to bestillinger fra samme bruger kunne
begge tælle "2 i kø" og begge blive til en kørsel.

Efter rettelsen er der ét tjek (``betroet_lager.applock``), som alle tre låse bruger: kun 0 (tildelt) og 1 (tildelt
efter ventetid) er en lås; alt andet — også et manglende eller uforståeligt svar — er en fejl, der ruller transaktionen
tilbage.

SQL Server kan ikke køres her. Testene bruger en optagende forbindelse (som ``test_arkiv.ApplockN1``): de beviser
udsagnet og hvad returværdien fører til, ikke selve ventetiden. En timeout mellem to rigtige forbindelser er ikke
afprøvet (rapporten for anden rettelsesrunde).

Kør: ``cd community && python -m unittest discover -s tests -t tests`` (kræver sqlalchemy).
"""

from __future__ import annotations

import unittest

import hjaelp as H  # noqa: F401 — sætter datamappen op, før appen importeres
from fjernvarme_app.betroet_lager import SqlTransaktion

B = "aaaaaaaa-0000-4000-8000-000000000001"


class _Svar:
    def __init__(self, rc):
        self.rc = rc

    def scalar(self):
        return self.rc


class _Cn:
    """En forbindelse, der optager hvert udsagn og svarer med en fast returværdi."""

    def __init__(self, rc):
        self.rc, self.sql, self.params = rc, [], []

    def execute(self, q, params=None):
        self.sql.append(str(q))
        self.params.append(params)
        return _Svar(self.rc)


class _Db:
    dialekt = "mssql"


def tx(rc):
    cn = _Cn(rc)
    return SqlTransaktion(_Db(), cn), cn


#: (navn, kald) for hver af de tre applåse i den lokale udgave.
LAASE = (
    ("kvote", lambda t: t.laas_kvote("a@lokal")),
    ("bestilling", lambda t: t.laas_bestilling(B)),
    ("arkiv", lambda t: t.arkiv_laas_koersler([B])),
)


class FundIReturvaerdi(unittest.TestCase):
    def test_en_laas_der_ikke_blev_givet_er_en_fejl_for_alle_tre_laase(self):
        """Før rettelsen: kvotelåsen kastede ikke for nogen af dem (udsagnet læste slet ikke returværdien)."""
        for navn, kald in LAASE:
            for rc in (-1, -2, -3, -999, None, "x", 2, 0.5, True):
                t, cn = tx(rc)
                with self.assertRaises(RuntimeError, msg=f"{navn}: rc={rc!r}") as e:
                    kald(t)
                self.assertIn("sp_getapplock", str(e.exception))
                self.assertEqual(len(cn.sql), 1, navn)

    def test_udsagnet_laeser_returvaerdien(self):
        for navn, kald in LAASE:
            t, cn = tx(0)
            kald(t)
            self.assertIn("EXEC @rc = sp_getapplock", cn.sql[0], navn)
            self.assertIn("SELECT @rc", cn.sql[0], navn)
            self.assertIn("@LockOwner = 'Transaction'", cn.sql[0], navn)
            self.assertIn("@LockMode = 'Exclusive'", cn.sql[0], navn)

    def test_tildelt_og_tildelt_efter_ventetid_gaar_videre(self):
        for navn, kald in LAASE:
            for rc in (0, 1):
                t, _ = tx(rc)
                kald(t)                                    # kaster ikke

    def test_ressourcerne_er_hver_sit_rum(self):
        """Tre rum, så en bestillings lås aldrig kan forveksles med en kørsels eller en brugers."""
        ud = []
        for _, kald in LAASE:
            t, cn = tx(0)
            kald(t)
            ud.append(cn.params[0]["k"])
        self.assertEqual(ud, ["fjv_kvote:a@lokal", "fjv_bestilling:" + B, "fjv_arkiv:" + B])


# ====================================================================== fund A

import contextlib  # noqa: E402
import threading  # noqa: E402
import time  # noqa: E402

import test_arkiv as TA  # noqa: E402
from fjernvarme_app.logik import arkiv as A  # noqa: E402
from fjernvarme_app.logik import jsjson as J  # noqa: E402
from fjernvarme_app.logik import tjenester as S  # noqa: E402


class _BestillingsTx(TA._ModelTx):
    """``test_arkiv._ModelTx`` (READ COMMITTED, rigtige ventende låse) med de verber, oprydningen af en afvist
    bestilling bruger (``tjenester.start_bestilling`` frem til afvisningen)."""

    def __init__(self, l):
        super().__init__(l)
        self.slettet: list[tuple[str, str]] = []

    def laas_bestilling(self, id):
        self.l.log.append(("laas_bestilling", id))
        super().laas_bestilling(id)                      # modellens rigtige, ventende lås

    def arkiv_hent(self, tabel, ider):
        self.l.log.append(("arkiv_hent", tabel))
        return super().arkiv_hent(tabel, ider)

    def koersel_for_bestilling(self, bestilling_id):
        return next(({"id": k["id"], "status": k["status"]} for k in self._alle("Koersel")
                     if k["bestilling_id"] == bestilling_id), None)

    def bestilling(self, id):
        b = self.l.db.get("Bestilling", {}).get(id)
        return dict(b) if b else None

    def laas_kvote(self, email):
        pass

    def scenarie(self, id, laas):
        s = self.l.db.get("Scenarie", {}).get(id)
        return dict(s) if s else None

    def slet_bestilling(self, id, bestilt_af):
        b = self.l.db.get("Bestilling", {}).get(id)
        if not b or b["bestilt_af"] != bestilt_af or self.koersel_for_bestilling(id):
            return 0
        self.slettet.append(("Bestilling", id))
        return 1


class BestillingsLager(TA.ModelLager):
    def __init__(self, db, laas=True, foer_indsaet=None):
        super().__init__(db, laas, foer_indsaet)
        self.log: list[tuple[str, str]] = []

    @contextlib.contextmanager
    def transaktion(self):
        tx = _BestillingsTx(self)
        try:
            yield tx
            for tabel, id, raekke in tx.skrevet:
                self.db.setdefault(tabel, {})[id] = raekke
            for tabel, id in tx.slettet:
                self.db.get(tabel, {}).pop(id, None)
        finally:
            for l in tx.holdt:
                l.release()

    def ny_id(self):
        return "99999999-9999-4999-8999-999999999999"

    def med(self, foer_indsaet):
        """Samme database, samme låse og samme log, men med en pause-krog (importens forbindelse)."""
        l = BestillingsLager(self.db, self.laas, foer_indsaet)
        l.laase, l.register, l.log = self.laase, self.register, self.log
        return l


class FundAArkivimportModOprydning(unittest.TestCase):
    """Efterprøvningen af runde 15, fund A (P1): arkivimporten læste den importerede Bestilling med en almindelig
    SELECT og indsatte derefter den historiske kørsel. Imellem de to kunne ejeren få samme bestilling afvist (fx fordi
    det importerede scenarie er arkiveret); oprydningen så ingen kørsel, slettede rækken og committede — og importen
    indsatte kørslen ud fra den række, den allerede havde læst. Resultat: en Koersel uden sin Bestilling.

    sqlite kan IKKE genskabe det: ``BEGIN IMMEDIATE`` lader kun én skriver ad gangen køre, fra første udsagn til
    commit. Kapløbet er SQL Servers og PostgreSQLs (READ COMMITTED). Derfor en model med netop den isolation
    (``test_arkiv.ModelLager``): læsninger ser det committede, skrivninger committes til sidst, og applåsene er
    rigtige, ventende låse. Importen holder pause lige før sin indsættelse, og imens kører oprydningen i en anden
    tråd gennem den rigtige ``tjenester.start_bestilling``."""

    def kør(self, laas: bool):
        t = next(x for x in TA.laes("arkiv_importer_del") if x["navn"] == "fuld import og så igen")
        db = {tabel: {r["id"]: dict(r) for r in raekker} for tabel, raekker in t["input"]["start"].items()}
        db.setdefault("Aendringsanmodning", {})
        trin = t["input"]["trin"]
        grund = BestillingsLager(db, laas)
        for s in trin[:8]:
            db["Aendringsanmodning"][s["anmodning_id"]] = {
                "id": s["anmodning_id"], "vaerk_id": s["vaerk_id"], "forventet_revision": 0,
                "aendringer_json": s["aendringer_json"], "anmodet_af": "v@example.org",
                "anmodet": "2026-10-28T09:00:00.000Z", "status": "ny", "svar": None}
        for s in trin[:7]:                    # scenarier, bestilling og kørslens fem undertabeller
            self.assertTrue(A.importer_del(grund, s["anmodning_id"], s["tekst"])["ok"])
        koersel = J.parse(trin[7]["tekst"])
        self.assertEqual(koersel["tabel"], "Koersel")
        kid = koersel["raekker"][0][0]
        bid = koersel["raekker"][0][A.kolonnenavne("Koersel").index("bestilling_id")]
        ejer = db["Bestilling"][bid]["bestilt_af"]
        # Det importerede scenarie arkiveres: ejerens behandling af bestillingen bliver en endelig afvisning.
        db["Scenarie"][db["Bestilling"][bid]["scenarie_id"]]["arkiveret"] = True
        grund.log.clear()

        i_pause, fortsaet = threading.Event(), threading.Event()

        def hold(tabel):
            if tabel == "Koersel":
                i_pause.set()
                fortsaet.wait(5)
        svar = {}
        imp = threading.Thread(target=lambda: svar.__setitem__(
            "import", A.importer_del(grund.med(hold), trin[7]["anmodning_id"], trin[7]["tekst"])))
        imp.start()
        self.assertTrue(i_pause.wait(5), "importen nåede aldrig til sin indsættelse")
        ryd = threading.Thread(target=lambda: svar.__setitem__(
            "oprydning", S.start_bestilling(grund, bid, lambda: {"startet": False, "grund": "test"}, ejer)))
        ryd.start()
        time.sleep(0.3)                       # oprydningen får chancen for at køre forbi importen
        fortsaet.set()
        imp.join(10)
        ryd.join(10)
        return svar, db, kid, bid, grund.log

    def test_med_laasen_venter_oprydningen_og_finder_koerslen(self):
        svar, db, kid, bid, _ = self.kør(laas=True)
        self.assertTrue(svar["import"]["ok"], svar["import"])
        self.assertIn(kid, db["Koersel"])
        # Før rettelsen: oprydningen kørte forbi og slettede rækken — en kørsel uden sin Bestilling.
        self.assertIn(bid, db["Bestilling"], "kørslen blev importeret, men dens Bestilling er slettet")
        self.assertEqual((svar["oprydning"]["ok"], svar["oprydning"].get("koersel_id"), svar["oprydning"].get("ny")),
                         (True, kid, False), svar["oprydning"])

    def test_kontrolproeve_uden_laase_genskaber_fejlen(self):
        """Samme forløb med låsene slået fra i modellen: det er kapløbet, ikke testen, der giver forskellen."""
        svar, db, kid, bid, _ = self.kør(laas=False)
        self.assertTrue(svar["import"]["ok"])
        self.assertIs(svar["oprydning"].get("ryddet"), True)
        self.assertIn(kid, db["Koersel"])
        self.assertNotIn(bid, db.get("Bestilling", {}))

    def test_bestillingen_laeses_foerst_under_sin_laas(self):
        """Rækkefølgen af udsagn i importens afsluttende transaktion: bestillingens lås før NOGEN læsning af
        Bestilling — så den række, kørslen valideres mod, er den, der står, når kørslen indsættes."""
        _, _, _, bid, log = self.kør(laas=True)
        self.assertIn(("laas_bestilling", bid), log, "importen tog aldrig bestillingens lås")
        laas = log.index(("laas_bestilling", bid))
        self.assertLess(laas, log.index(("arkiv_hent", "Bestilling")), log)
        self.assertLess(laas, log.index(("arkiv_hent", "Koersel")), log)

    def test_flere_bestillinger_laases_i_fast_sorteret_orden(self):
        """To importer med de samme bestillinger i hver sin rækkefølge må ikke kunne låse hinanden fast."""
        ks = A.kolonnenavne("Koersel")

        class Stop(Exception):
            pass

        class Tx:
            def __init__(self):
                self.kald = []

            def arkiv_laas_koersler(self, ider):
                self.kald.append(("arkiv_laas_koersler", list(ider)))

            def laas_bestilling(self, id):
                self.kald.append(("laas_bestilling", id))

            def arkiv_hent(self, tabel, ider):
                raise Stop

        def raekke(kid, bid):
            r = [None] * len(ks)
            r[0], r[ks.index("bestilling_id")] = kid, bid
            return r

        b = ["cccccccc-0000-4000-8000-00000000000c", "aaaaaaaa-0000-4000-8000-00000000000a", "bbbbbbbb-0000-4000-8000-00000000000b"]
        k = ["11111111-0000-4000-8000-000000000003", "11111111-0000-4000-8000-000000000001", "11111111-0000-4000-8000-000000000002"]
        tx = Tx()
        with self.assertRaises(Stop):
            A._skriv_del(tx, {"tabel": "Koersel", "raekker": [raekke(k[i], b[i]) for i in range(3)]})
        self.assertEqual(tx.kald, [("arkiv_laas_koersler", sorted(k))] + [("laas_bestilling", x) for x in sorted(b)])

    def test_kun_koerselsdelen_tager_bestillingens_laas(self):
        """De øvrige dele skriver ikke en række, der peger på en Bestilling, og tager ikke låsen."""
        kald: list = []

        class Stop(Exception):
            pass

        class Tx:
            def arkiv_laas_koersler(self, ider):
                pass

            def laas_bestilling(self, id):
                kald.append(id)

            def arkiv_hent(self, tabel, ider):
                raise Stop

        for tabel in ("Scenarie", "Bestilling", "KoerselInput"):
            r = ["aaaaaaaa-0000-4000-8000-00000000000a"] * len(A.kolonnenavne(tabel))
            with self.assertRaises(Stop):
                A._skriv_del(Tx(), {"tabel": tabel, "raekker": [r], "aendringer": []})
        self.assertEqual(kald, [])


if __name__ == "__main__":
    unittest.main()
