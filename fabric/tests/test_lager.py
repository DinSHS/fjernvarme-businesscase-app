"""Lager-grænsefladen (brief 21): samme arbejder mod Fabric og lokalt, uden adfærdsændring i Fabric.

* **Form** - hver implementering (Fabric og hukommelse) har alle protokollens medlemmer.
* **Fabric uændret** - ``tests/spor.py`` kører de to Fabric-indgange mod en SQL-stub; sporet
  (hver sætning, parametre, rapportens trin og resultatet) skal være byte-identisk med
  ``tests/data/sql_spor.json``, der er genereret fra koden FØR grænsefladen (3d144d5).
* **Samme regler lokalt** - ``arbejder.arbejd`` og ``vaerksark.koer_importer`` køres mod
  ``lager_minne`` (den kørbare specifikation, community-udgavens lager skal opføre sig ens).
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

HER = Path(__file__).resolve().parent
sys.path.insert(0, str(HER.parent))
from fjv import arbejder as A  # noqa: E402
from fjv import db as DB  # noqa: E402
from fjv import koersel as KS  # noqa: E402
from fjv import lager as L  # noqa: E402
from fjv import lager_minne as M  # noqa: E402
from fjv import vaerksark as VS  # noqa: E402
from fjv.rapport import Rapport  # noqa: E402

T0 = datetime(2026, 1, 5, 12, tzinfo=timezone.utc)


def rap() -> Rapport:
    return Rapport("t", sti=str(Path(tempfile.mkdtemp()) / "r.json"))


class TestForm(unittest.TestCase):
    def test_fabric_og_hukommelse_har_hele_formen(self):
        db = M.MinneDb()
        for obj, prot in ((DB.SolverLaas(None), L.Laas), (M.MinneLaas(db), L.Laas),
                          (DB.SqlLager(None, "k", "mig"), L.KoerselLager),
                          (M.MinneKoerselLager(db, "k", "mig"), L.KoerselLager),
                          (DB.SqlKoe(None), L.KoeLager), (M.MinneKoe(db), L.KoeLager),
                          (VS.SqlImportLager(None), L.ImportLager), (M.MinneImportLager(db), L.ImportLager)):
            with self.subTest(obj=type(obj).__name__):
                self.assertEqual(L.mangler(obj, prot), [])

    def test_mangler_finder_et_hul(self):
        class Halv:
            def tag(self):
                return True
        self.assertIn("frigiv", L.mangler(Halv(), L.Laas))


class TestFabricUaendret(unittest.TestCase):
    def test_sql_sporet_er_som_foer_graensefladen(self):
        r = subprocess.run([sys.executable, "-I", str(HER / "spor.py"), str(HER.parent)],
                           capture_output=True, timeout=300)
        self.assertEqual(r.returncode, 0, r.stderr.decode("utf-8", "replace")[-2000:])
        ny = r.stdout.replace(b"\r\n", b"\n")
        facit = (HER / "data" / "sql_spor.json").read_bytes().replace(b"\r\n", b"\n")
        if ny != facit:
            import difflib
            diff = "\n".join(list(difflib.unified_diff(facit.decode().splitlines(), ny.decode().splitlines(),
                                                       "før (3d144d5)", "nu", lineterm="", n=2))[:60])
            self.fail("Fabric-sporet har ændret sig:\n" + diff)


# ------------------------------------------------------------------ arbejderen mod hukommelsen

def falsk_koer_en(udfald: dict):
    """En koer_en, der følger tilstandsmaskinen men ikke kører modellen."""
    def koer(raekker, kid, lager, rap, *, forventet_hash=None, **_):
        if lager.er_annulleret():
            raise KS.Afbrudt("annulleret før start")
        lager.saet(fase="Kontrollerer input")
        lager.hjerteslag()
        u = udfald.get(kid, "faerdig")
        if u == "fejl":
            lager.skift("koerer", "fejl", fejlbesked="Modellen er uløselig", afsluttet="nu")
            return {"koersel_id": kid, "status": "fejl"}
        if u == "annulleret":
            lager.db.koersler[kid]["annuller_anmodet"] = lager.db.nu()
            if lager.er_annulleret():
                raise KS.Afbrudt("annulleret under kørslen")
        if u == "mist_laas":
            lager.laas.mist()
            raise KS.Afbrudt("låsen tabt")
        lager.skift("koerer", "indlaeser")
        lager.publicer([{"gruppe": "g", "objekt": None, "marked": None, "noegle": "n", "vaerdi": 1.0}],
                       [], [], slutfelter={"objektiv_dkk": 1.0})
        return {"koersel_id": kid, "status": "faerdig", "objektiv_dkk": 1.0}
    return koer


class TestArbejderMinne(unittest.TestCase):
    def setUp(self):
        self.db = M.MinneDb()
        self.db.tid = T0
        self.gl = KS.koer_en

    def tearDown(self):
        KS.koer_en = self.gl

    def bestil(self, kid, min_efter=0, **f):
        self.db.tid = T0 + timedelta(minutes=min_efter)
        self.db.bestil(kid, **f)
        self.db.tid = T0 + timedelta(hours=1)

    def koer(self, udfald=None, **kw):
        KS.koer_en = falsk_koer_en(udfald or {})
        return A.arbejd(M.MinneKoe(self.db), rap(), mig="nb:mig", **kw)

    def test_bestemt_foerst_derefter_fifo_efter_modtaget(self):
        self.bestil("c", 2)
        self.bestil("a", 0)
        self.bestil("b", 1)
        t = self.koer(koersel_id="B")
        self.assertEqual([k["koersel_id"] for k in t["koersler"]], ["b", "a", "c"])
        self.assertEqual(t["koe_stop"], "køen er tom")
        self.assertTrue(t["ok"])
        self.assertTrue(all(self.db.koersler[x]["status"] == "faerdig" for x in "abc"))
        self.assertIsNone(self.db.laas_ejer, "låsen skal være frigivet")
        self.assertEqual(self.db.koersler["a"]["forsoeg"], 1)

    def test_optaget_laas_roerer_intet(self):
        self.bestil("a")
        M.MinneLaas(self.db).tag()                 # en anden arbejder
        t = self.koer()
        self.assertEqual(t["laas"], "optaget")
        self.assertEqual(self.db.koersler["a"]["status"], "koe")

    def test_frisk_fremmed_blokerer_og_gammel_ryddes(self):
        self.bestil("a")
        self.bestil("frisk", hjerteslag=T0 + timedelta(minutes=59), status="koerer", arbejder_id="nb:anden")
        t = self.koer()
        self.assertIn("friskt hjerteslag", t["koe_stop"])
        self.assertEqual(self.db.koersler["a"]["status"], "koe")
        self.db.koersler["frisk"]["hjerteslag"] = T0             # nu død (> OVERTAGELSE_S)
        t = self.koer()
        self.assertEqual(t["ryddet_doede"], ["frisk"])
        self.assertEqual(self.db.koersler["frisk"]["status"], "fejl")
        self.assertEqual(self.db.koersler["a"]["status"], "faerdig")

    def test_modelfejl_annullering_og_tabt_laas(self):
        for k in "abc":
            self.bestil(k, ord(k))
        t = self.koer({"a": "fejl", "b": "annulleret", "c": "mist_laas"})
        status = {k["koersel_id"]: k["status"] for k in t["koersler"]}
        self.assertEqual(status, {"a": "fejl", "b": "annulleret", "c": "afbrudt"})
        self.assertEqual(self.db.koersler["b"]["status"], "annulleret")
        self.assertEqual(self.db.koersler["c"]["status"], "koerer", "tabt lås: intet skrives")
        self.assertEqual(t["koe_stop"], "låsen tabt")

    def test_publicering_kraever_ejerskab(self):
        self.bestil("a")
        kl = M.MinneKoerselLager(self.db, "a", "nb:mig")
        self.assertFalse(kl.skift("koerer", "indlaeser"), "ikke overtaget endnu")
        self.db.koersler["a"].update(status="indlaeser", arbejder_id="nb:anden")
        with self.assertRaises(KS.Afbrudt):
            kl.publicer([], [], [])
        with self.assertRaises(ValueError):
            kl.saet(ukendt_felt=1)

    def test_rigtig_koer_en_med_ugyldigt_input_bliver_fejl(self):
        # Den ægte tilstandsmaskine (koer_en) mod hukommelseslageret - ingen model behøves.
        self.bestil("a", raekker=[{"kilde": "vaerk", "sti": "time.resolution", "vaerdi_json": '"15min"'}])
        self.db.koersler["a"]["input_hash"] = None
        t = A.arbejd(M.MinneKoe(self.db), rap(), mig="nb:mig")
        self.assertEqual(t["koersler"][0]["status"], "fejl")
        self.assertIn("Ugyldigt input", self.db.koersler["a"]["fejlbesked"])


class TestImportMinne(unittest.TestCase):
    def test_bestilt_import_derefter_strandede_og_doede_ryddes(self):
        db = M.MinneDb()
        db.tid = T0
        for i, (iid, status) in enumerate((("strandet", "koe"), ("ny", "koe"), ("doed", "koerer"))):
            db.importer[iid] = {"id": iid, "status": status, "filnavn": f"{iid}.xlsx",
                                "sti": f"Files/fjv/uploads/{iid}.xlsx", "uploadet": T0 + timedelta(minutes=i)}
        db.tid = T0 + timedelta(hours=3)
        ud = VS.koer_importer(M.MinneImportLager(db), rap(), import_id="NY")
        self.assertEqual([i["id"] for i in ud["importer"]], ["ny", "strandet"])
        self.assertTrue(all(i["status"] == "fejl" for i in ud["importer"]), "filerne findes ikke")
        self.assertIn("findes ikke", db.importer["ny"]["log"])
        self.assertEqual(db.importer["doed"]["status"], "fejl")
        self.assertTrue(ud["ok"])


if __name__ == "__main__":
    unittest.main()
