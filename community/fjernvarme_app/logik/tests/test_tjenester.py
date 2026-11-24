"""De betroede forløb (``tjenester``) mod en ``BetroetLager`` — som ``function_app.ts`` opfører sig.

Standard: ``lager_minne.MinneLager``. En anden implementering (fv-server's SQLAlchemy-lager) køres med
``FJV_BETROET_LAGER=modul:fabrik``, hvor ``fabrik()`` returnerer et lager, der ud over protokollen har
``indsaet(tabel, raekke)``, ``opdater(tabel, id, **felter)``, ``raekker(tabel, **filter)`` og ``en(tabel, id)``
(seed og eftersyn, Rayfins tabelnavne). ``en``/``raekker`` må gerne give KOPIER — testene ændrer aldrig en læst
række direkte (det skjulte hukommelsesudgaven, indtil testene kørte mod SQLite 2026-10-16). Hvor det kan lade sig gøre, sammenlignes med TS' egne tal fra vektorerne (hash, validering_json).
"""

from __future__ import annotations

import base64
import hashlib
import importlib
import json
import os
import sys
import unittest

sys.stdout.reconfigure(errors="replace")

from fjernvarme_app.logik import tjenester as S  # noqa: E402
from fjernvarme_app.logik.lager import Transaktion, UnikBrud  # noqa: E402
from fjernvarme_app.logik.lager_minne import MinneFiler, MinneLager  # noqa: E402
from fjernvarme_app.logik.tests.test_vektorer import ROD, laes  # noqa: E402

PINS = {"model_commit": "b49aeb0af097be42938b80a0fea6acdd77162836", "data_commit": "392992c7fe35992e79fba8d1ba7b91967e8d1481"}
MOTOR_ID = "00000000-0000-4000-8000-00000000f001"
AF = "a@eksempel.dk"
U = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
NIL = "00000000-0000-0000-0000-000000000000"


def _fabrik():
    navn = os.environ.get("FJV_BETROET_LAGER")
    if not navn:
        return MinneLager()
    modul, _, f = navn.partition(":")
    return getattr(importlib.import_module(modul), f)()


def _ts_vektor(gruppe: str, navn: str) -> dict:
    return next(t for t in laes(gruppe)["tilfaelde"] if t["navn"] == navn)


class Grund(unittest.TestCase):
    """Et værk (generer.mts' VÆRK), Motor med pins, et scenarie og hjælpere til bestilling/anmodning."""

    def setUp(self):
        self.l = _fabrik()
        self.filer = MinneFiler()
        self.starter = []
        if self.l.raekker("Motors", id=MOTOR_ID):        # serveren skriver selv sine pins ved opstart (runde 7c)
            self.l.opdater("Motors", MOTOR_ID, **PINS)
        else:
            self.l.indsaet("Motors", {"id": MOTOR_ID, **PINS})
        vaerk =_ts_vektor("byg_frosset_input", "pins")["input"]["params"]
        self.v = self.l.indsaet("Vaerks", {"kode": "probe", "navn": "Probe", "kilde": "repo", "revision": 1, "arkiveret": False})
        for i, p in enumerate(vaerk, 1):
            d = p["sti"].split(".")
            self.l.indsaet("VaerkParameters", {"vaerk_id": self.v["id"], "sti": p["sti"], "vaerdi_json": p["vaerdi_json"],
                                               "sektion": d[0], "objekt": None, "kommentar": None, "bekraeft": False,
                                               "raekkefoelge": i})
        self.s = self.scenarie()

    def opdater(self, tabel, id, **felter):
        self.l.opdater(tabel, id, **felter)

    def arbejder(self):
        self.starter.append(1)
        return {"startet": True, "grund": "Beregningsjob startet."}

    def scenarie(self, **felter):
        return self.l.indsaet("Scenaries", {"vaerk_id": self.v["id"], "navn": "s", "arkiveret": False,
                                            "med_balancering": False, "oprettet_af": AF, **felter})

    def bestil(self, scenarie=None, af=AF):
        b = self.l.indsaet("Bestillings", {"scenarie_id": (scenarie or self.s)["id"], "bestilt_af": af,
                                           "klient_noegle": self.l.ny_id()})
        # ``af`` er også kalderen: sådan kalder serveren (funktioner.kald sender sessionens bruger videre).
        return b["id"], S.start_bestilling(self.l, b["id"], self.arbejder, af)

    def anmod(self, aendringer, vaerk_id=None, revision=1, af=AF):
        a = self.l.indsaet("Aendringsanmodnings", {"vaerk_id": vaerk_id or self.v["id"], "forventet_revision": revision,
                                                   "aendringer_json": json.dumps(aendringer, ensure_ascii=False),
                                                   "anmodet_af": af, "status": "ny", "svar": None})
        return a["id"]


class TestProtokol(Grund):
    def test_minne_opfylder_protokollen(self):
        with self.l.transaktion() as tx:
            self.assertIsInstance(tx, Transaktion)


class TestStartBestilling(Grund):
    def test_hash_er_ts_hash(self):
        """Samme værk + pins som vektoren "pins" -> præcis TS' hash og rækker."""
        _, svar = self.bestil()
        self.assertTrue(svar["ok"], svar)
        self.assertEqual((svar["status"], svar["ny"]), ("koe", True))
        k = self.l.en("Koersels", svar["koersel_id"])
        ts = _ts_vektor("byg_frosset_input", "pins")["ud"]
        self.assertEqual(k["input_hash"], ts["hash"])
        inp = sorted((r["kilde"], r["sti"], r["vaerdi_json"]) for r in self.l.raekker("KoerselInputs", koersel_id=k["id"]))
        self.assertEqual(inp, sorted((r["kilde"], r["sti"], r["vaerdi_json"]) for r in ts["rækker"]))
        self.assertEqual((k["fase"], k["kilde"], k["forsoeg"], k["vaerk_revision"]), ("I kø", "app", 0, 1))
        self.assertEqual((k["oensket_rel_gap"], k["oensket_abs_gap"]), (0.005, 5000))
        self.assertEqual((k["model_commit"], k["data_commit"]), (PINS["model_commit"], PINS["data_commit"]))
        self.assertIsNotNone(k["modtaget"])
        self.assertEqual(self.starter, [1])

    def test_idempotent(self):
        bid, a = self.bestil()
        b = S.start_bestilling(self.l, bid, self.arbejder)
        self.assertEqual((b["koersel_id"], b["ny"]), (a["koersel_id"], False))
        self.assertEqual(len(self.l.raekker("Koersels")), 1)
        self.assertEqual(len(self.starter), 2)                      # TS starter også arbejderen ved gentagelse

    def test_kvote_tre_i_koe(self):
        for _ in range(3):
            self.assertTrue(self.bestil()[1]["ok"])
        _, svar = self.bestil()
        self.assertEqual(svar, {"ok": False, "ryddet": True, "afvist": "Du har allerede 3 kørsler i kø; højst 3 ad gangen. "
                                                       "Vent til en er færdig, eller annullér en."})
        self.assertEqual(len(self.l.raekker("Koersels")), 3)

    def test_kvote_taeller_kun_koe_og_kun_brugeren(self):
        for _ in range(3):
            self.bestil()
        for k in self.l.raekker("Koersels"):
            self.opdater("Koersels", k["id"], status="koerer")
        self.assertTrue(self.bestil()[1]["ok"])
        self.assertTrue(self.bestil(af="b@eksempel.dk")[1]["ok"])

    def test_afvisninger(self):
        self.assertEqual(S.start_bestilling(self.l, "x", self.arbejder), {"ok": False, "afvist": "Ugyldigt bestillings-id."})
        self.assertEqual(S.start_bestilling(self.l, U, self.arbejder), {"ok": False, "afvist": "Bestillingen findes ikke.", "ryddet": True})
        self.assertEqual(self.bestil(self.scenarie(arkiveret=True))[1]["afvist"], "Scenariet er arkiveret.")
        self.opdater("Vaerks", self.v["id"], arkiveret=True)
        self.assertEqual(self.bestil()[1]["afvist"], "Værket er arkiveret.")
        self.assertEqual(self.starter, [])

    def test_motor_uden_pins(self):
        self.opdater("Motors", MOTOR_ID, data_commit=None)
        self.assertEqual(self.bestil()[1]["afvist"],
                         "Regnemotoren har endnu ikke registreret sin model- og dataversion. Prøv igen om lidt.")

    def test_regelbrud_ruller_tilbage(self):
        s = self.scenarie()
        self.l.indsaet("ScenarieAendrings", {"scenarie_id": s["id"], "type": "set", "sti": "prices.olie.value",
                                             "vaerdi_json": "1.0", "raekkefoelge": 1})
        _, svar = self.bestil(s)
        self.assertIn("som ikke findes i værket", svar["afvist"])
        self.assertEqual((self.l.raekker("Koersels"), self.l.raekker("KoerselInputs")), ([], []))

    # Runde 15, fund 3.2 (den uafhængige test 18. november 2026): en afvist bestilling efterlod sin Bestilling-række.
    # Klienten må kun oprette og læse den (skema.json), så kun den betroede logik kan fjerne den. Rækken var ikke
    # kun rod: klientnøglen er unik, så et genforsøg med samme nøgle ("Prøv igen") ramte den gamle række.
    def test_afvist_bestilling_efterlader_ingen_raekke(self):
        s = self.scenarie()
        ae = self.l.indsaet("ScenarieAendrings", {"scenarie_id": s["id"], "type": "set", "sti": "prices.olie.value",
                                                  "vaerdi_json": "1.0", "raekkefoelge": 1})
        b = self.l.indsaet("Bestillings", {"scenarie_id": s["id"], "bestilt_af": AF, "klient_noegle": "samme-noegle"})
        svar = S.start_bestilling(self.l, b["id"], self.arbejder, AF)
        self.assertIn("som ikke findes i værket", svar["afvist"])
        self.assertIs(svar.get("ryddet"), True)
        self.assertEqual(self.l.raekker("Bestillings"), [])
        self.assertEqual(self.l.raekker("Koersels"), [])
        # Scenariet er brugerens og bliver stående (det kan være et, hun har redigeret længe): kun bestillingen fjernes.
        self.assertEqual(len(self.l.raekker("Scenaries", id=s["id"])), 1)
        # Genforsøg med SAMME klientnøgle, nu med en gyldig ændring: bestillingen kan oprettes og køres.
        self.opdater("ScenarieAendrings", ae["id"], sti="prices.straw.value")
        b2 = self.l.indsaet("Bestillings", {"scenarie_id": s["id"], "bestilt_af": AF, "klient_noegle": "samme-noegle"})
        self.assertTrue(S.start_bestilling(self.l, b2["id"], self.arbejder, AF)["ok"])
        self.assertEqual(len(self.l.raekker("Bestillings")), 1)

    def test_kvoteafvisning_fjerner_bestillingen(self):
        for _ in range(3):
            self.assertTrue(self.bestil()[1]["ok"])
        bid, svar = self.bestil()
        self.assertFalse(svar["ok"])
        self.assertEqual(len(self.l.raekker("Bestillings")), 3)             # de tre, der blev til kørsler
        self.assertEqual(self.l.raekker("Bestillings", id=bid), [])

    # ---- Kodegennemgangen af runde 15, fund 1–3: slettevejen gjort sikker -------------------------------------------

    def _afvist_bestilling(self, af=AF):
        s = self.scenarie()
        self.l.indsaet("ScenarieAendrings", {"scenarie_id": s["id"], "type": "set", "sti": "prices.olie.value",
                                             "vaerdi_json": "1.0", "raekkefoelge": 1})
        return self.l.indsaet("Bestillings", {"scenarie_id": s["id"], "bestilt_af": af, "klient_noegle": self.l.ny_id()})["id"]

    def _med_spion(self):
        """Lagerets transaktioner, med en liste over (transaktionsnummer, verbum) i den rækkefølge forløbet kaldte dem."""
        import contextlib
        kald, o, nr = [], self.l.transaktion, [0]

        class Spion:
            def __init__(self, tx, n):
                self._tx, self._n = tx, n

            def __getattr__(self, navn):
                v = getattr(self._tx, navn)
                if not callable(v):
                    return v

                def f(*a, **k):
                    kald.append((self._n, navn))
                    return v(*a, **k)
                return f

        @contextlib.contextmanager
        def tx():
            nr[0] += 1
            n = nr[0]
            with o() as t:
                yield Spion(t, n)
        self.l.transaktion = tx
        self.addCleanup(lambda: setattr(self.l, "transaktion", o))
        return kald

    def test_fund1_laasen_tages_foer_bestillingen_laeses_og_oprydningen_sker_i_samme_transaktion(self):
        bid = self._afvist_bestilling()
        kald = self._med_spion()
        svar = S.start_bestilling(self.l, bid, self.arbejder, AF)
        self.assertIs(svar.get("ryddet"), True)
        verber = [v for _, v in kald]
        # Låsen er det FØRSTE, transaktionen gør — før bestillingen og kørslen læses. (Anden rettelsesrunde, fund C:
        # bestillingen læses før kørslen, fordi ejeren tjekkes, før noget om kørslen slås op.)
        self.assertEqual(verber[:3], ["laas_bestilling", "bestilling", "koersel_for_bestilling"])
        # Før rettelsen: afvisningen i transaktion 2 (rullet tilbage), oprydningen i transaktion 3 — uden lås imellem.
        self.assertEqual({n for n, v in kald if v in ("laas_bestilling", "bestilling", "slet_bestilling")}, {1})
        self.assertEqual(len({n for n, _ in kald}), 1, kald)

    def test_fund1_et_gentaget_kald_ser_koerslen_under_laasen(self):
        bid, svar = self.bestil()
        kald = self._med_spion()
        igen = S.start_bestilling(self.l, bid, self.arbejder, AF)
        self.assertEqual((igen["ok"], igen["koersel_id"], igen["ny"]), (True, svar["koersel_id"], False))
        # Kørslen findes: reglerne spørges ikke igen (kvoten kunne ellers afvise en bestilling, der allerede kører).
        self.assertEqual([v for _, v in kald], ["laas_bestilling", "bestilling", "koersel_for_bestilling"])

    def test_fund2_kun_ejeren_kan_udloese_sletning(self):
        for kalder in (None, "kollega@lokal", AF.upper()):
            bid = self._afvist_bestilling()
            svar = S.start_bestilling(self.l, bid, self.arbejder, kalder)
            self.assertEqual(set(svar), {"ok", "afvist"}, kalder)                   # afvist — men hverken ryddet eller teknisk
            # Anden rettelsesrunde, fund C: en KENDT anden kalder når ikke til reglerne; en ukendt (None, portens
            # spejl af Fabric, hvor identiteten ikke findes) får reglernes afvisning som før.
            if kalder is None:
                self.assertIn("som ikke findes i værket", svar["afvist"])
            else:
                self.assertEqual(svar["afvist"], S.IKKE_EJER)
            self.assertEqual(len(self.l.raekker("Bestillings", id=bid)), 1, kalder)
        # Ejeren selv: samme bestilling ryddes.
        self.assertIs(S.start_bestilling(self.l, bid, self.arbejder, AF).get("ryddet"), True)
        self.assertEqual(self.l.raekker("Bestillings", id=bid), [])

    def test_fundC_kun_ejeren_kan_faa_bestillingen_behandlet(self):
        """Efterprøvningen af rettelserne, fund C: en kendt kalder, der ikke er ejeren, afvises FØR kørslen slås op
        og FØR noget fryses — ingen kvotelås, ingen læsning af scenarie og værk, ingen kørsel."""
        b = self.l.indsaet("Bestillings", {"scenarie_id": self.s["id"], "bestilt_af": AF, "klient_noegle": "c1"})["id"]
        kald = self._med_spion()
        svar = S.start_bestilling(self.l, b, self.arbejder, "kollega@lokal")
        # Før rettelsen: {"ok": True, "ny": True, ...} — kørslen blev oprettet i ejerens navn.
        self.assertEqual(svar, {"ok": False, "afvist": S.IKKE_EJER})
        self.assertEqual([v for _, v in kald], ["laas_bestilling", "bestilling"])
        self.assertEqual(self.l.raekker("Koersels"), [])
        self.assertEqual(self.starter, [])                                       # arbejderen startes ikke i en andens navn
        self.assertEqual(len(self.l.raekker("Bestillings", id=b)), 1)

    def test_fundC_en_anden_faar_ikke_den_eksisterende_koersel(self):
        bid, svar = self.bestil()
        self.assertTrue(svar["ok"])
        self.starter.clear()
        self.assertEqual(S.start_bestilling(self.l, bid, self.arbejder, "kollega@lokal"), {"ok": False, "afvist": S.IKKE_EJER})
        self.assertEqual(self.starter, [])

    def test_fundC_ukendt_kalder_er_portens_spejl_af_fabric(self):
        """``kalder=None`` betyder "identiteten findes ikke" (Fabric: tokenet bærer ingen e-mail). Dér kan ejeren ikke
        tjekkes, og bestillingen behandles som før — men ryddes aldrig. Den lokale udgaves binding
        (``betroet_lager.Tjenester``) giver aldrig None videre (community/tests/test_r15_bestilling.py)."""
        b = self.l.indsaet("Bestillings", {"scenarie_id": self.s["id"], "bestilt_af": AF, "klient_noegle": "c2"})["id"]
        svar = S.start_bestilling(self.l, b, self.arbejder)
        self.assertEqual((svar["ok"], svar["ny"]), (True, True))

    def test_fund2_lageret_sletter_kun_ejerens_raekke(self):
        """Også lagerets eget udsagn er bundet til ejeren (to værn, ikke ét)."""
        bid = self._afvist_bestilling()
        with self.l.transaktion() as tx:
            self.assertEqual(tx.slet_bestilling(bid, "kollega@lokal"), 0)
        self.assertEqual(len(self.l.raekker("Bestillings", id=bid)), 1)
        with self.l.transaktion() as tx:
            self.assertEqual(tx.slet_bestilling(bid, AF), 1)

    def test_fund3_svaret_skelner_mellem_ryddet_afvisning_og_teknisk_fejl(self):
        # (1) endelig afvisning, ryddet
        for _ in range(3):
            self.assertTrue(self.bestil()[1]["ok"])
        bid, svar = self.bestil()
        self.assertEqual(svar, {"ok": False, "ryddet": True, "afvist": "Du har allerede 3 kørsler i kø; højst 3 ad gangen. "
                                "Vent til en er færdig, eller annullér en."})
        # (2) endelig afvisning, men bestillingen står (ukendt kalder): intet "ryddet" — klienten må ikke arkivere
        b2 = self.l.indsaet("Bestillings", {"scenarie_id": self.s["id"], "bestilt_af": AF, "klient_noegle": "k2"})["id"]
        svar2 = S.start_bestilling(self.l, b2, self.arbejder)
        self.assertEqual(set(svar2), {"ok", "afvist"})
        self.assertEqual(len(self.l.raekker("Bestillings", id=b2)), 1)
        # (3) en køplads frigives: SAMME bestilling kan nu behandles igen (det er det, "Prøv igen" gør)
        self.opdater("Koersels", self.l.raekker("Koersels")[0]["id"], status="faerdig")
        self.assertTrue(S.start_bestilling(self.l, b2, self.arbejder, AF)["ok"])

    def test_fund3_fejler_oprydningen_er_afvisningen_stadig_svaret_men_ikke_ryddet(self):
        bid = self._afvist_bestilling()
        o = self.l.transaktion

        import contextlib

        @contextlib.contextmanager
        def tx():
            with o() as t:
                t.slet_bestilling = lambda *a: (_ for _ in ()).throw(RuntimeError("forbindelsen døde"))
                yield t
        self.l.transaktion = tx
        svar = S.start_bestilling(self.l, bid, self.arbejder, AF)
        self.l.transaktion = o
        self.assertEqual(set(svar), {"ok", "afvist"})
        self.assertIn("som ikke findes i værket", svar["afvist"])
        self.assertEqual(len(self.l.raekker("Bestillings", id=bid)), 1)

    def test_godkendt_bestilling_bliver_staaende(self):
        bid, svar = self.bestil()
        self.assertTrue(svar["ok"])
        self.assertEqual(len(self.l.raekker("Bestillings", id=bid)), 1)
        # Et gentaget kald (idempotent) rører den heller ikke.
        S.start_bestilling(self.l, bid, self.arbejder)
        self.assertEqual(len(self.l.raekker("Bestillings", id=bid)), 1)

    def test_scenariets_decimaler(self):
        from decimal import Decimal
        # Decimal er hvad en SQL-decimal kan komme ud som; sqlite kan ikke binde den, så dér seedes float.
        d = Decimal if isinstance(self.l, MinneLager) else float
        _, svar = self.bestil(self.scenarie(mip_rel_gap=d("0.0002"), tidsgraense_s=d("300")))
        # Samme sti kan stå med kilde vaerk OG scenarie (600.0 og 300.0); rækkefølgen fra en database er vilkårlig.
        inp = {r["sti"]: r["vaerdi_json"] for r in self.l.raekker("KoerselInputs", koersel_id=svar["koersel_id"])
               if r["kilde"] == "scenarie"}
        self.assertEqual((inp["solver.mip_rel_gap"], inp["solver.time_limit"]), ("0.0002", "300.0"))

    def test_kapløb_om_samme_bestilling(self):
        """Den anden taber på den unikke bestilling_id og svarer med den første kørsel (som TS)."""
        if not isinstance(self.l, MinneLager):
            self.skipTest("simuleret kapløb kræver hukommelsesudgaven")
        bid = self.l.indsaet("Bestillings", {"scenarie_id": self.s["id"], "bestilt_af": AF, "klient_noegle": "k"})["id"]
        l = self.l
        oprindelig = MinneLager.transaktion

        class Konkurrent:
            def __init__(self, tx):
                self.tx = tx

            def __getattr__(self, n):
                return getattr(self.tx, n)

            def indsaet_koersel(self, raekke):
                raise UnikBrud("bestilling_id")

        import contextlib

        @contextlib.contextmanager
        def tx_med_konkurrent(self_):
            try:
                with oprindelig(self_) as tx:
                    yield Konkurrent(tx)
            except UnikBrud:                         # konkurrentens række er committet; vores er rullet tilbage
                l.t["Koersels"]["andet"] = {"id": "ANDET", "bestilling_id": bid, "status": "koe"}
                raise

        try:
            MinneLager.transaktion = tx_med_konkurrent
            svar = S.start_bestilling(l, bid, self.arbejder)
        finally:
            MinneLager.transaktion = oprindelig
        self.assertEqual(svar, {"ok": True, "koersel_id": "andet", "status": "koe", "ny": False})

    def test_teknisk_fejl(self):
        self.l.indsaet("Bestillings", {"id": U, "scenarie_id": self.s["id"], "bestilt_af": AF, "klient_noegle": "k"})
        o = self.l.transaktion

        import contextlib

        @contextlib.contextmanager
        def tx():
            with o() as t:
                t.motor = lambda: (_ for _ in ()).throw(RuntimeError("forbindelsen døde"))
                yield t
        self.l.transaktion = tx
        svar = S.start_bestilling(self.l, U, self.arbejder)
        self.assertEqual(svar, {"ok": False, "afvist": "Teknisk fejl i startBestilling: forbindelsen døde", "teknisk": True})
        # En teknisk fejl er ikke en afvisning: bestillingen bliver stående og kan forsøges igen (fund 3.2 fjerner kun afviste).
        self.l.transaktion = o
        self.assertEqual(len(self.l.raekker("Bestillings", id=U)), 1)


class TestUdfoerAendring(Grund):
    def test_ret_opret_slet(self):
        a = self.anmod([{"sti": "prices.straw.value", "handling": "ret", "ny_json": "47.5"},
                        {"sti": "units.halmkedel.p_min_heat", "handling": "opret", "ny_json": "2.0"},
                        {"sti": "heat_load_params.baseline_profile_mw", "handling": "slet"}])
        svar = S.udfoer_aendring(self.l, a)
        self.assertEqual(svar, {"ok": True, "status": "udfoert", "svar": '3 ændring(er) gemt i "probe" (revision 1 → 2).',
                                "vaerk_id": self.v["id"].lower(), "revision": 2})
        p = {r["sti"]: r for r in self.l.raekker("VaerkParameters", vaerk_id=self.v["id"])}
        self.assertEqual(p["prices.straw.value"]["vaerdi_json"], "47.5")
        self.assertEqual(p["units.halmkedel.p_min_heat"]["raekkefoelge"], 11)    # max(1..10) + 1
        self.assertEqual(p["units.halmkedel.p_min_heat"]["objekt"], "halmkedel")
        self.assertNotIn("heat_load_params.baseline_profile_mw", p)
        log = self.l.raekker("Aendringslogs", vaerk_id=self.v["id"])
        self.assertEqual(sorted((x["handling"], x["revision"], x["aendret_af"]) for x in log),
                         [("opret", 2, AF), ("ret", 2, AF), ("slet", 2, AF)])
        self.assertEqual(self.l.en("Vaerks", self.v["id"])["revision"], 2)
        self.assertEqual(self.l.en("Aendringsanmodnings", a)["status"], "udfoert")
        # Allerede behandlet -> samme svar, intet nyt.
        self.assertEqual(S.udfoer_aendring(self.l, a)["svar"], svar["svar"])

    def test_balancemarkedsblok_tilfoejes_og_fjernes(self):
        """Runde 14c, målt: den betroede logik opretter en hel balancing-blok, som værket ikke har, i ÉN revision
        (``opret`` på stier under en ny sektion), og fjerner den igen med ``slet``. Det, der manglede, var en handling
        i Konfiguration — ikke en regel her. Forhindrer, at planen begynder at afvise nye sektioner."""
        blok = [("balancing.method", '"activation_value"'), ("balancing.bid_strategy.up_markup_dkk_mwh", "500"),
                ("balancing.ancillary_caps.per_unit_mw.halmkedel", "6.0"), ("balancing.ancillary_caps.total_mw", "14.0")]
        p0 = {r["sti"] for r in self.l.raekker("VaerkParameters", vaerk_id=self.v["id"])}
        self.assertFalse(any(s.startswith("balancing.") for s in p0))
        svar = S.udfoer_aendring(self.l, self.anmod([{"sti": s, "handling": "opret", "ny_json": v} for s, v in blok]))
        self.assertEqual((svar["status"], svar["revision"]), ("udfoert", 2))
        p = {r["sti"]: r for r in self.l.raekker("VaerkParameters", vaerk_id=self.v["id"])}
        self.assertEqual({s: p[s]["vaerdi_json"] for s, _ in blok}, dict(blok))
        self.assertEqual({p[s]["sektion"] for s, _ in blok}, {"balancing"})
        svar = S.udfoer_aendring(self.l, self.anmod([{"sti": s, "handling": "slet"} for s, _ in blok], revision=2))
        self.assertEqual((svar["status"], svar["revision"]), ("udfoert", 3))
        self.assertEqual({r["sti"] for r in self.l.raekker("VaerkParameters", vaerk_id=self.v["id"])}, p0)

    def test_revisionskonflikt(self):
        a = self.anmod([{"sti": "prices.straw.value", "handling": "ret", "ny_json": "47.5"}], revision=0)
        svar = S.udfoer_aendring(self.l, a)
        tekst = ("Værket er ændret, siden du begyndte at redigere (revision 0 → 1). Genindlæs værket og læg dine "
                 "ændringer ind igen.")
        self.assertEqual(svar, {"ok": False, "status": "afvist", "svar": tekst})
        self.assertEqual(self.l.en("Aendringsanmodnings", a)["svar"], tekst)
        self.assertEqual(self.l.en("Vaerks", self.v["id"])["revision"], 1)

    def test_afvisninger_i_planen(self):
        for aendr, tekst in [
            ([{"sti": "prices.straw.value", "handling": "ret", "ny_json": "45.0"}], "Anmodningen ændrer ingenting."),
            ([{"sti": "prices.straw.value.x", "handling": "opret", "ny_json": "1"}], "allerede er en værdi"),
            ([{"sti": "a", "handling": "flyt"}], 'ukendt handling "flyt"'),
        ]:
            svar = S.udfoer_aendring(self.l, self.anmod(aendr))
            self.assertEqual(svar["status"], "afvist")
            self.assertIn(tekst, svar["svar"])
        self.opdater("Vaerks", self.v["id"], arkiveret=True)
        self.assertEqual(S.udfoer_aendring(self.l, self.anmod([{"sti": "prices.straw.value", "handling": "slet"}]))["svar"],
                         "Værket er arkiveret og kan ikke ændres.")

    def test_kopi(self):
        a = self.anmod([{"handling": "kopier_vaerk", "ny_kode": "probe_2", "navn": "Probe 2"}])
        svar = S.udfoer_aendring(self.l, a)
        self.assertEqual(svar["svar"], 'Værket "probe_2" er oprettet som kopi af "probe" (revision 1) med 10 parametre.')
        ny = self.l.en("Vaerks", svar["vaerk_id"])
        self.assertEqual((ny["kode"], ny["kilde"], ny["revision"], ny["kopieret_fra_id"]), ("probe_2", "app", 1, self.v["id"]))
        self.assertEqual(len(self.l.raekker("Aendringslogs", vaerk_id=ny["id"])), 10)
        svar = S.udfoer_aendring(self.l, self.anmod([{"handling": "kopier_vaerk", "ny_kode": "probe_2", "navn": "X"}]))
        self.assertEqual(svar["svar"], 'Koden "probe_2" er allerede i brug.')

    def _dele(self, blade, n, af=AF, udkast=U):
        stk = [blade[i * len(blade) // n:(i + 1) * len(blade) // n] for i in range(n)]
        return [self.anmod([{"handling": "opret_vaerk_del", "udkast": udkast, "nr": i + 1, "af": n,
                             "blade": [{"sti": b["sti"], "ny_json": b["vaerdi_json"]} for b in st]}], vaerk_id=NIL, revision=0, af=af)
                for i, st in enumerate(stk)]

    def test_opret_vaerk_fra_dele(self):
        k4 = json.loads((ROD / "app/rayfin/functions/test/vektorer/k4_guide_vaerker.json").read_text(encoding="utf-8"))["vaerker"]["default"]
        dele = self._dele(k4, 2)
        # En del alene udføres aldrig.
        self.assertEqual(S.udfoer_aendring(self.l, dele[0])["status"], "ny")
        # En fremmed brugers del med samme udkast tæller ikke med.
        self._dele(k4[:5], 1, af="b@eksempel.dk")
        slut = self.anmod([{"handling": "opret_vaerk", "udkast": U, "dele": 2, "ny_kode": "nyt_vaerk", "navn": "Nyt"}],
                          vaerk_id=NIL, revision=0)
        svar = S.udfoer_aendring(self.l, slut)
        self.assertTrue(svar["ok"], svar)
        self.assertRegex(svar["svar"], r'^Værket "nyt_vaerk" er oprettet fra bunden med \d+ parametre \(0 skal bekræftes\)\.$')
        self.assertEqual(len(self.l.raekker("VaerkParameters", vaerk_id=svar["vaerk_id"])), len(k4))
        for d in dele:
            r = self.l.en("Aendringsanmodnings", d)
            self.assertEqual(r["status"], "udfoert")
            self.assertTrue(r["svar"].startswith("Del "))

    def test_opret_vaerk_med_manglende_del_afviser_delene(self):
        k4 = json.loads((ROD / "app/rayfin/functions/test/vektorer/k4_guide_vaerker.json").read_text(encoding="utf-8"))["vaerker"]["default"]
        dele = self._dele(k4, 3)
        self.opdater("Aendringsanmodnings", dele[1], status="afvist")           # del 2 er væk
        slut = self.anmod([{"handling": "opret_vaerk", "udkast": U, "dele": 3, "ny_kode": "nyt_vaerk", "navn": "Nyt"}],
                          vaerk_id=NIL, revision=0)
        svar = S.udfoer_aendring(self.l, slut)
        self.assertEqual(svar["svar"], "Del 2 af 3 mangler — send oprettelsen igen fra begyndelsen.")
        for d in (dele[0], dele[2]):
            self.assertEqual(self.l.en("Aendringsanmodnings", d)["svar"],
                             "Oprettelsen blev afvist: Del 2 af 3 mangler — send oprettelsen igen fra begyndelsen.")
        self.assertFalse(self.l.raekker("Vaerks", kode="nyt_vaerk"))

    def test_aktiver_tidsserie(self):
        a1 = self.l.indsaet("Tidsseries", {"vaerk_id": self.v["id"], "rolle": "varmelast", "navn": "A", "status": "gyldig", "aktiv": True})
        a2 = self.l.indsaet("Tidsseries", {"vaerk_id": self.v["id"], "rolle": "varmelast", "navn": "B", "status": "gyldig", "aktiv": False})
        dar = self.l.indsaet("Tidsseries", {"vaerk_id": self.v["id"], "rolle": "varmelast", "navn": "C", "status": "afvist", "aktiv": False})
        fremmed = self.l.indsaet("Tidsseries", {"vaerk_id": U, "rolle": "varmelast", "navn": "D", "status": "gyldig", "aktiv": False})
        akt = lambda t, aktiv=True: S.udfoer_aendring(self.l, self.anmod([{"handling": "aktiver_tidsserie", "tidsserie_id": t["id"], "aktiv": aktiv}]))
        self.assertEqual(akt(fremmed)["svar"], "Tidsserien hører til et andet værk.")
        self.assertEqual(akt(dar)["svar"], '"C" er afvist og kan ikke gøres aktiv.')
        self.assertEqual(akt(a2)["svar"], '"B" er nu værkets aktive varmelast.')
        self.assertEqual((self.l.en("Tidsseries", a1["id"])["aktiv"], self.l.en("Tidsseries", a2["id"])["aktiv"]), (False, True))
        self.assertEqual(akt(a2, False)["svar"], '"B" er ikke længere aktiv.')

    def test_upload_anmodning_udfoeres_ikke_her(self):
        a = self.anmod([{"handling": "upload_vaerksark", "filnavn": "a.xlsx", "sha256": "a" * 64}])
        self.assertEqual(S.udfoer_aendring(self.l, a)["status"], "ny")
        self.assertEqual(self.l.en("Aendringsanmodnings", a)["status"], "ny")

    def test_teknisk_fejl_lader_anmodningen_staa(self):
        a = self.anmod([{"sti": "prices.straw.value", "handling": "ret", "ny_json": "47.5"}])
        o = self.l.transaktion
        import contextlib

        @contextlib.contextmanager
        def tx():
            with o() as t:
                t.saet_revision = lambda *x: (_ for _ in ()).throw(RuntimeError("timeout"))
                yield t
        self.l.transaktion = tx
        svar = S.udfoer_aendring(self.l, a)
        self.l.transaktion = o
        self.assertEqual(svar, {"ok": False, "status": "ny", "svar": "Teknisk fejl i udfoerAendring: timeout Intet er ændret; prøv igen."})
        self.assertEqual(self.l.en("Aendringsanmodnings", a)["status"], "ny")
        self.assertEqual(self.l.raekker("VaerkParameters", vaerk_id=self.v["id"], sti="prices.straw.value")[0]["vaerdi_json"], "45.0")


class TestAnnullerKoersel(Grund):
    def test_alle_veje(self):
        k = lambda status, **x: self.l.indsaet("Koersels", {"status": status, "bestilling_id": self.l.ny_id(), **x})["id"]
        self.assertEqual(S.annuller_koersel(self.l, "x")["besked"], "Ugyldigt kørsels-id.")
        self.assertEqual(S.annuller_koersel(self.l, U)["besked"], "Kørslen findes ikke.")
        i = k("koe")
        self.assertEqual(S.annuller_koersel(self.l, i), {"ok": True, "status": "annulleret", "besked": "Kørslen er annulleret."})
        self.assertEqual(self.l.en("Koersels", i)["fase"], "Annulleret før start")
        j = k("koerer")
        self.assertEqual(S.annuller_koersel(self.l, j)["besked"],
                         "Annullering er anmodet. Arbejderen stopper solveren og markerer kørslen annulleret.")
        self.assertIsNotNone(self.l.en("Koersels", j)["annuller_anmodet"])
        self.assertEqual(S.annuller_koersel(self.l, j)["besked"], "Annullering er allerede anmodet; arbejderen stopper kørslen.")
        self.assertEqual(S.annuller_koersel(self.l, k("faerdig"))["besked"], "Kørslen er allerede faerdig og kan ikke annulleres.")


class TestTidsserier(Grund):
    CSV = "time,mw\n" + "".join(f"2026-01-05T{h:02d}:00:00Z,{1 + h % 3}\n" for h in range(24)) + \
          "".join(f"2026-01-06T{h:02d}:00:00Z,{1 + h % 3}\n" for h in range(24))

    def upload(self, data: bytes, **felter):
        b64 = base64.b64encode(data).decode()
        a = self.anmod([{"handling": "upload_tidsserie", "rolle": "varmelast", "navn": "Målt", "filnavn": "m.csv",
                         "tidsstempel": "start", "tidszone": "UTC", "enhed": "MW",
                         "sha256": hashlib.sha256(b64.encode()).hexdigest(), **felter}])
        return a, S.upload_tidsserie(self.l, self.filer, a, b64)

    def test_upload_og_hent(self):
        a, svar = self.upload(self.CSV.encode())
        self.assertEqual((svar["ok"], svar["status"]), (True, "gyldig"), svar)
        # Oraklet advarer om en kort serie (2 døgn) — svaret tæller den, som TS.
        self.assertEqual(svar["svar"], '"Målt" er gyldig: 48 timer, 2026-01-05–2026-01-06; 1 advarsel(er).')
        t = self.l.en("Tidsseries", svar["tidsserie_id"])
        self.assertEqual((t["status"], t["aktiv"], t["kilde"], t["oploesning"], t["antal_raekker"]), ("gyldig", False, "csv", "1h", 48))
        rel = t["sti"][len("Files/"):]
        self.assertEqual(rel, f"fjv/tidsserier/probe/{t['sha256']}.csv")
        self.assertEqual(hashlib.sha256(self.filer.filer[rel]).hexdigest(), t["sha256"])
        self.assertEqual(self.l.en("Aendringsanmodnings", a)["status"], "udfoert")
        h = S.hent_tidsserie(self.l, self.filer, t["id"])
        self.assertEqual((h["ok"], h["start"], len(h["vaerdier"])), (True, "2026-01-05T00:00:00Z", 48))
        self.assertEqual(S.hent_tidsserie(self.l, self.filer, t["id"], "2026-01-06T00:00:00Z", "")["vaerdier"][:3], [1, 2, 3])
        self.filer.filer[rel] += b"2026-01-07T00:00:00Z,9\n"
        self.assertEqual(S.hent_tidsserie(self.l, self.filer, t["id"])["fejl"],
                         "Tidsseriens fil passer ikke med sin sha256 — den er ændret efter upload.")

    def test_validering_json_er_ts(self):
        """Den gemte validering_json for TS-vektorens fil er byte for byte TS' (fv-port F1)."""
        v = _ts_vektor("upload_validering_json", "192 kvarterer")
        _, svar = self.upload(v["input"]["bytes"])
        self.assertEqual(svar["validering_json"], v["ud"])

    def test_afvist_fil(self):
        a, svar = self.upload(b"time,mw\n2026-01-05T00:00:00Z,-1\n")
        self.assertEqual(svar["status"], "afvist")
        self.assertTrue(svar["svar"].startswith('"Målt" er afvist: '))
        self.assertEqual(self.l.en("Tidsseries", svar["tidsserie_id"])["status"], "afvist")
        self.assertEqual(self.l.en("Aendringsanmodnings", a)["status"], "afvist")
        self.assertEqual(self.filer.filer, {})

    def test_sha_passer_ikke_lader_anmodningen_staa(self):
        """Som TS: fejl i læsningen af upload-anmodningen markerer den ikke afvist."""
        a = self.anmod([{"handling": "upload_tidsserie", "rolle": "varmelast", "filnavn": "m.csv", "tidsstempel": "start",
                         "tidszone": "UTC", "enhed": "MW", "sha256": "b" * 64}])
        svar = S.upload_tidsserie(self.l, self.filer, a, base64.b64encode(b"x").decode())
        self.assertEqual(svar["svar"], "Filens indhold passer ikke med anmodningens sha256 — upload filen igen.")
        self.assertEqual(self.l.en("Aendringsanmodnings", a)["status"], "ny")

    def test_arkiveret_vaerk_afviser_anmodningen(self):
        self.opdater("Vaerks", self.v["id"], arkiveret=True)
        a, svar = self.upload(self.CSV.encode())
        self.assertEqual(svar["svar"], "Værket er arkiveret.")
        self.assertEqual(self.l.en("Aendringsanmodnings", a)["status"], "afvist")


class TestVaerksark(Grund):
    def test_upload_og_genoptag(self):
        data = (ROD / "app/rayfin/functions/test/vektorer/skabelon_uaendret.xlsx").read_bytes()
        b64 = base64.b64encode(data).decode()
        a = self.anmod([{"handling": "upload_vaerksark", "filnavn": "ark.xlsx", "sha256": hashlib.sha256(b64.encode()).hexdigest()}])
        jobs = []

        def start(i):
            jobs.append(i)
            return {"ok": False, "status": 503, "fejl": "optaget"} if len(jobs) == 1 else {"ok": True, "status": 202, "jobId": "j"}
        svar = S.upload_vaerksark(self.l, self.filer, start, a, b64)
        self.assertEqual(svar["status"], "koe")
        self.assertIn("kunne ikke startes (HTTP 503)", svar["svar"])
        imp = self.l.en("Vaerksarkimports", a)
        self.assertEqual((imp["status"], imp["sti"]), ("koe", f"Files/fjv/uploads/{a.lower()}.xlsx"))
        self.assertEqual(self.filer.filer[f"fjv/uploads/{a.lower()}.xlsx"], data)
        # Samme fil igen genoptager jobstarten (reservationen blev frigivet).
        svar = S.upload_vaerksark(self.l, self.filer, start, a, b64)
        self.assertEqual((svar["ok"], svar["svar"]), (True, "Værksarket importeres nu."))
        self.assertEqual(self.l.en("Vaerksarkimports", a)["fabric_job_id"], "j")
        self.assertEqual(S.upload_vaerksark(self.l, self.filer, start, a, b64)["svar"], "Værksarket importeres.")
        self.assertEqual(len(self.l.raekker("Vaerksarkimports")), 1)


class TestLaesefunktioner(Grund):
    def test_dmi(self):
        dc = PINS["data_commit"]
        self.filer.skriv_fil(f"fjv/df-data/{dc}/dmi/karup_2026.csv",
                             b"hour_utc,temp_mean_past1h\n2026-01-05 00:00:00,1.5\n2026-01-05 01:00:00,\n2026-01-07 00:00:00,3\n")
        r = S.hent_dmi_temperatur(self.l, self.filer, "karup", "2026-01-05", "2026-01-06")
        self.assertEqual(r, {"ok": True, "data_commit": dc, "kolonne": "temp_mean_past1h",
                             "tider": ["2026-01-05 00:00:00", "2026-01-05 01:00:00"], "vaerdier": [1.5, None]})
        self.assertEqual(S.hent_dmi_temperatur(self.l, self.filer, "Karup", "2026-01-05", "2026-01-06")["fejl"], "Ugyldigt DMI-område.")
        self.assertEqual(S.hent_dmi_temperatur(self.l, self.filer, "karup", "2025-01-01", "2026-01-03")["fejl"], "Højst 366 døgn pr. kald.")

    def test_kilde_yaml(self):
        self.assertEqual(S.hent_kilde_yaml(self.l, self.filer, self.v["id"])["fejl"],
                         "Der findes ingen kildefil for værket (fx et værk oprettet som kopi i appen).")
        self.filer.skriv_fil("fjv/vaerker/probe/kilde.yaml", "a: 1 # æ\n".encode())
        self.assertEqual(S.hent_kilde_yaml(self.l, self.filer, self.v["id"]), {"ok": True, "kode": "probe", "tekst": "a: 1 # æ\n", "bytes": 9})

    def test_afstem(self):
        self.assertEqual(S.afstem(lambda: None, lambda: {"startet": False, "grund": "x"}),
                         {"tjekket": 0, "aendret": [], "arbejder": {"startet": False, "grund": "x"}})
        self.assertEqual(S.afstem(lambda: [{"id": "AB", "status": "koerer"}], lambda: {})["aendret"],
                         ["ab: fejl (koerer uden levende arbejder)"])


if __name__ == "__main__":
    unittest.main()
