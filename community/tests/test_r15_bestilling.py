"""Runde 15, rettelser efter kodegennemgangen — slettevejen for afviste bestillinger (fund 1 og 2), lokal udgave.

Runde 15's fund 3.2 lod den betroede logik slette en AFVIST bestilling. Gennemgangen fandt to huller i den vej:

* **Fund 1 (P1).** Afvisningen blev afgjort i én transaktion, som blev rullet tilbage, og oprydningen kørte bagefter i
  en ny. Imellem de to kunne et andet kald behandle SAMME bestilling. Her genskabt med to forbindelser til samme
  sqlite-fil: kald A rammer køkvoten og afvises; en køplads frigives; kald B (en anden forbindelse) behandler
  bestillingen og opretter kørslen; A svarer alligevel "afvist". Klienten bag A arkiverer så sit scenarie, mens dets
  kørsel står i kø. (På SQL Server, hvor læsningen ikke holder en lås, kan samme hul give en kørsel UDEN sin
  Bestilling-række; sqlite's ``BEGIN IMMEDIATE`` forhindrer netop den udgave, så den kan ikke genskabes her.)
  Efter rettelsen tages én lås pr. bestilling som det første i transaktionen, og afvisning og oprydning sker i den
  samme transaktion: enten bliver bestillingen til en kørsel, eller også er den væk — aldrig begge dele.
* **Fund 2 (P2).** Bestillings-id'et kommer fra kalderen, og ``funktioner.kald`` sendte ikke sessionens bruger videre.
  En anden bruger kunne derfor få en kollegas afviste bestilling (og dens klientnøgle) slettet. Efter rettelsen kan
  kun bestillingens ejer udløse en behandling, der sletter.

Kør: ``cd community && python -m unittest discover -s tests -t tests`` (kræver sqlalchemy).
"""

from __future__ import annotations

import contextlib
import threading
import unittest

import hjaelp as H  # noqa: F401 — sætter datamappen op, før appen importeres
import sql_fabrik
from fjernvarme_app import betroet_lager as BL
from fjernvarme_app import cli, funktioner
from fjernvarme_app.logik import tjenester as S

AF = "a@lokal"
ANDEN = "kollega@lokal"
PINS = {"model_commit": "b49aeb0af097be42938b80a0fea6acdd77162836", "data_commit": "392992c7fe35992e79fba8d1ba7b91967e8d1481"}


class Grund(unittest.TestCase):
    def setUp(self):
        self.l = sql_fabrik.fabrik()                      # forbindelse A: appens egen database (en sqlite-fil)
        self.app = self.l.app
        # Forbindelse B: en ANDEN app (egen engine, egen forbindelse) på samme databasefil — som en anden serverproces.
        self.app2 = cli.byg_app(str(H.ROD), self.app.db.url, bruger=AF, start_processer=False)
        motor = self.l.raekker("Motors")
        if motor:
            self.l.opdater("Motors", motor[0]["id"], **PINS)
        else:
            self.l.indsaet("Motors", dict(PINS))
        self.vid = H.vaerk(self.app, "r15vaerk")
        self.sid = self.scenarie()

    def tearDown(self):
        for app in (self.app, self.app2):
            app.db.engine.dispose()

    def scenarie(self) -> str:
        return self.l.indsaet("Scenaries", {"vaerk_id": self.vid, "navn": "s", "arkiveret": False,
                                            "med_balancering": False, "oprettet_af": AF})["id"]

    def bestilling(self, scenarie_id=None, af=AF) -> str:
        return self.l.indsaet("Bestillings", {"scenarie_id": scenarie_id or self.sid, "bestilt_af": af,
                                              "klient_noegle": self.l.ny_id()})["id"]

    def start(self, bid, bruger=AF, app=None) -> dict:
        """Den vej, serveren selv går: ``POST /api/fn/startBestilling`` med sessionens bruger."""
        return funktioner.kald(app or self.app, "startBestilling", {"bestillingId": bid}, bruger)

    def fyld_koeen(self) -> list[str]:
        ud = []
        for _ in range(3):
            svar = self.start(self.bestilling())
            self.assertTrue(svar["ok"], svar)
            ud.append(svar["koersel_id"])
        return ud


class Fund1Kaploeb(Grund):
    def test_afvist_svar_og_koersel_kan_ikke_begge_blive_til(self):
        """A afvises på kvoten; før A er færdig, frigives en køplads, og B behandler samme bestilling."""
        koe = self.fyld_koeen()
        bid = self.bestilling()
        svar_b: list[dict] = []
        oprindelig = BL.SqlBetroetLager.transaktion
        test = self

        @contextlib.contextmanager
        def med_konkurrent(lager):
            """A's transaktioner, uændrede — men lige efter den, der talte køen (hovedtransaktionen), kommer B til."""
            talte = []
            try:
                with oprindelig(lager) as tx:
                    if lager.db is test.app.db and not svar_b:
                        ægte = tx.antal_i_koe

                        def antal_i_koe(af):
                            talte.append(1)
                            return ægte(af)
                        tx.antal_i_koe = antal_i_koe
                    yield tx
            finally:
                if talte and not svar_b:
                    test.l.opdater("Koersels", koe[0], status="faerdig")          # en køplads frigives
                    svar_b.append(test.start(bid, app=test.app2))                # B: anden forbindelse, samme bestilling

        BL.SqlBetroetLager.transaktion = med_konkurrent
        try:
            svar_a = self.start(bid)
        finally:
            BL.SqlBetroetLager.transaktion = oprindelig

        self.assertEqual(len(svar_b), 1, "konkurrenten kom aldrig til — testen er ikke længere et kapløb")
        self.assertFalse(svar_a["ok"])
        self.assertIn("kørsler i kø", svar_a["afvist"])
        koersler = self.l.raekker("Koersels", bestilling_id=bid)
        bestillinger = self.l.raekker("Bestillings", id=bid)
        # Før rettelsen: A svarede "afvist", og B havde oprettet kørslen (1 række) — klienten bag A arkiverer så et
        # scenarie, hvis kørsel står i kø.
        self.assertEqual(koersler, [], "A svarede afvist, men bestillingen blev alligevel til en kørsel")
        # Afvisningen og oprydningen er ét: bestillingen er væk, og begge kald siger det samme.
        self.assertEqual(bestillinger, [])
        self.assertIs(svar_a.get("ryddet"), True)
        self.assertEqual((svar_b[0]["ok"], svar_b[0]["afvist"], svar_b[0].get("ryddet")), (False, "Bestillingen findes ikke.", True))

    def test_to_traade_to_forbindelser(self):
        """Rigtig samtidighed: to tråde med hver sin forbindelse behandler samme bestilling, mens en køplads frigives.
        Uanset hvem der vinder: en kørsel har altid sin Bestilling, og "ryddet" betyder, at der ingen kørsel er."""
        lagre = [BL.SqlBetroetLager(self.app.db), BL.SqlBetroetLager(self.app2.db)]
        koe = self.fyld_koeen()
        for runde in range(8):
            bid = self.bestilling()
            svar: list[dict] = [{}, {}]
            klar = threading.Barrier(3)

            def kald(i, bid=bid, svar=svar, klar=klar):
                klar.wait()
                svar[i] = S.start_bestilling(lagre[i], bid, lambda: {"startet": False, "grund": "test"}, AF)

            def frigiv(klar=klar, koe=koe):
                klar.wait()
                self.l.opdater("Koersels", koe[0], status="faerdig")

            traade = [threading.Thread(target=kald, args=(0,)), threading.Thread(target=kald, args=(1,)),
                      threading.Thread(target=frigiv)]
            for t in traade:
                t.start()
            for t in traade:
                t.join(120)
            koersler = self.l.raekker("Koersels", bestilling_id=bid)
            bestillinger = self.l.raekker("Bestillings", id=bid)
            self.assertLessEqual(len(koersler), 1, (runde, svar))
            if koersler:
                self.assertEqual(len(bestillinger), 1, f"runde {runde}: en kørsel uden sin Bestilling: {svar}")
                self.assertTrue(all(s["ok"] and s["koersel_id"] == koersler[0]["id"] for s in svar), (runde, svar))
                koe = [koersler[0]["id"]]                  # den nye står i kø; næste runde frigiver den
                self.l.opdater("Koersels", koersler[0]["id"], status="koe")
            else:
                self.assertEqual(bestillinger, [], (runde, svar))
                self.assertTrue(all(not s["ok"] and s.get("ryddet") is True for s in svar), (runde, svar))
            # Køen fyldes op til tre igen, så næste runde også begynder på kvoten.
            mangler = 3 - len(self.l.raekker("Koersels", status="koe"))
            for _ in range(mangler):
                ny = S.start_bestilling(lagre[0], self.bestilling(), lambda: {"startet": False, "grund": "test"}, AF)
                self.assertTrue(ny["ok"], ny)
            koe = [k["id"] for k in self.l.raekker("Koersels", status="koe")]


class Fund2Ejer(Grund):
    def afvist_bestilling(self) -> str:
        """En bestilling, backenden afviser: scenariet ændrer et blad, der ikke findes i værket."""
        sid = self.scenarie()
        self.l.indsaet("ScenarieAendrings", {"scenarie_id": sid, "type": "set", "sti": "prices.findes_ikke.value",
                                             "vaerdi_json": "1.0", "raekkefoelge": 1})
        return self.bestilling(sid)

    def test_en_anden_bruger_kan_ikke_faa_bestillingen_slettet(self):
        bid = self.afvist_bestilling()
        svar = self.start(bid, bruger=ANDEN)
        self.assertFalse(svar["ok"])
        self.assertIn("som ikke findes i værket", svar["afvist"])
        # Før rettelsen: [] — kollegaens kald slettede rækken og dens klientnøgle.
        self.assertEqual(len(self.l.raekker("Bestillings", id=bid)), 1)
        self.assertIsNot(svar.get("ryddet"), True)

    def test_ejeren_faar_den_ryddet(self):
        bid = self.afvist_bestilling()
        svar = self.start(bid, bruger=AF)
        self.assertFalse(svar["ok"])
        self.assertEqual(self.l.raekker("Bestillings", id=bid), [])
        self.assertIs(svar.get("ryddet"), True)

    def test_en_anden_bruger_kan_stadig_ikke_slette_efter_ejerens_eget_forsoeg(self):
        """Rækkefølgen er ligegyldig: kollegaens kald efter ejerens (som ryddede) finder intet at slette."""
        bid = self.afvist_bestilling()
        self.start(bid, bruger=AF)
        svar = self.start(bid, bruger=ANDEN)
        self.assertEqual((svar["ok"], svar["afvist"]), (False, "Bestillingen findes ikke."))


if __name__ == "__main__":
    unittest.main()
