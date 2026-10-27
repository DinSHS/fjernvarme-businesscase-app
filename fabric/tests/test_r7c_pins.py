"""Runde 7c, rettelse 1: pins efter en motoropgradering (rapporter/fv-model.md, deploy runde 7).

Målt 2026-10-27: første bestilling efter opgraderingen til eef950a frøs ``dbo.Motors``' gamle pins (b49aeb0 / 392992c),
fordi arbejderen først skriver rækken, når den har taget låsen - efter at bestillingen var oprettet. Kørslen regnede den
gamle model og blev vist som den nye. To forsvar:

* ``deploy.py kode``/``db``/``pins`` skriver rækken, så snart motorkoden ligger i lakehouset (læst tilbage, fejl = exit 1).
* Arbejderen afviser (``fejl``, tydelig besked) en kørsel, hvis frosne pins ikke er den motor, der kører den - begge
  bestillingsveje, for kørslen ender hos den samme arbejder. Kun en df-data-SHA, operatøren eksplicit valgte til netop
  den kørsel (notebookens ``data_commit``), er tilladt.
"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HER = Path(__file__).resolve().parent
FABRIC = HER.parent
sys.path.insert(0, str(FABRIC))
from fjv import arbejder as A  # noqa: E402
from fjv import db as DB  # noqa: E402
from fjv import konstanter as K  # noqa: E402
from fjv import koersel as KS  # noqa: E402
from fjv import lager_minne as M  # noqa: E402
from fjv import runtime as R  # noqa: E402
from fjv.byg_case import raekker_fra_vaerk  # noqa: E402
from fjv.flad import flad  # noqa: E402
from fjv.rapport import Rapport  # noqa: E402

GAMMEL_MODEL = "b49aeb0af097be42938b80a0fea6acdd77162836"   # motoren før runde 7
GAMMEL_DATA = "392992c7fe35992e79fba8d1ba7b91967e8d1481"
VAERK = ('time:\n  start: "2026-01-05T00:00:00Z"\n  end: "2026-01-06T23:00:00Z"\n'
         '  resolution: "1h"\nprices:\n  straw:\n    value: 232.0\n')


def rap(tmp: Path) -> Rapport:
    return Rapport("t", sti=str(tmp / "r.json"))


class TestPinAfvigelse(unittest.TestCase):
    def test_motorens_egne_pins_er_ok(self):
        self.assertIsNone(KS.pin_afvigelse(K.MODEL_COMMIT, K.DF_DATA_SHA))

    def test_gammel_model_afvises_med_begge_versioner_i_beskeden(self):
        b = KS.pin_afvigelse(GAMMEL_MODEL, K.DF_DATA_SHA)
        self.assertIn("b49aeb0", b)
        self.assertIn(K.MODEL_COMMIT[:7], b)
        self.assertIn("Bestil den igen", b)

    def test_gammel_df_data_afvises(self):
        self.assertIn("392992c", KS.pin_afvigelse(K.MODEL_COMMIT, GAMMEL_DATA))

    def test_eksplicit_valgt_df_data_er_tilladt_men_ikke_en_anden_model(self):
        self.assertIsNone(KS.pin_afvigelse(K.MODEL_COMMIT, GAMMEL_DATA, GAMMEL_DATA))
        self.assertIsNotNone(KS.pin_afvigelse(GAMMEL_MODEL, GAMMEL_DATA, GAMMEL_DATA))
        self.assertIsNotNone(KS.pin_afvigelse(K.MODEL_COMMIT, GAMMEL_DATA, "f" * 40))


class TestKoerEnAfviserForkertePins(unittest.TestCase):
    """Den rigtige ``koer_en``: afvisningen sker FØR modelkoden hentes - intet regnes, intet publiceres."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.hentet: list = []
        self.gl = (R.sikr_model, K.FILES)
        K.FILES = str(self.tmp / "Files")

        def sikr_model(sha, files=None):
            self.hentet.append(sha)
            raise RuntimeError("STOP efter pin-kontrollen (testen henter ingen modelkode)")
        R.sikr_model = sikr_model

    def tearDown(self):
        R.sikr_model, K.FILES = self.gl

    def koer(self, model, data, tilladt=None):
        r = raekker_fra_vaerk(flad(VAERK), (), {"model_commit": model, "data_commit": data})
        try:
            return KS.koer_en(r, "r7c", KS.IngenLager(), rap(self.tmp), hjerte_s=60, tilladt_data_commit=tilladt)
        except RuntimeError as e:
            return {"status": "hentet", "fejlbesked": str(e)}

    def test_bestilling_med_den_forrige_motors_pins_bliver_fejl_uden_at_regne(self):
        res = self.koer(GAMMEL_MODEL, GAMMEL_DATA)
        self.assertEqual(res["status"], "fejl")
        self.assertIn("afvist", res["fejlbesked"])
        self.assertIn("b49aeb0", res["fejlbesked"])
        self.assertIn("392992c", res["fejlbesked"])
        self.assertEqual(self.hentet, [], "modelkoden må ikke hentes for en afvist kørsel")

    def test_motorens_pins_passerer_kontrollen(self):
        res = self.koer(K.MODEL_COMMIT, K.DF_DATA_SHA)
        self.assertEqual(self.hentet, [K.MODEL_COMMIT])
        self.assertNotIn("afvist", res.get("fejlbesked") or "")

    def test_eksplicit_df_data_passerer_kontrollen(self):
        self.koer(K.MODEL_COMMIT, GAMMEL_DATA, tilladt=GAMMEL_DATA)
        self.assertEqual(self.hentet, [K.MODEL_COMMIT])


class TestArbejderGiverKunEgneKoerslerDataValget(unittest.TestCase):
    def test_tilladt_data_gaelder_kun_den_navngivne_koersel(self):
        db = M.MinneDb()
        for kid in ("a", "b"):
            db.bestil(kid)
        set_ = {}

        def falsk(raekker, kid, lager, rap, *, forventet_hash=None, tilladt_data_commit=None, **_):
            set_[kid] = tilladt_data_commit
            lager.skift("koerer", "faerdig", afsluttet="nu")
            return {"koersel_id": kid, "status": "faerdig"}
        gl = KS.koer_en
        KS.koer_en = falsk
        try:
            A.arbejd(M.MinneKoe(db), rap(Path(tempfile.mkdtemp())), mig="nb:mig", tilladt_data={"a": GAMMEL_DATA})
        finally:
            KS.koer_en = gl
        self.assertEqual(set_, {"a": GAMMEL_DATA, "b": None})


INST = {"workspace_navn": "Testens Workspace", "workspace_id": "abcdef12-3456-4789-8abc-" + "def012345678",
        "lakehouse_navn": "fjv_lakehouse", "lakehouse_id": "12345abc-6789-4def-8012-" + "3456789abcde",
        "sql_server": "testserver-" + "abcdefgh12345678.database.fabric.microsoft.com", "sql_database": "testdb-" + "ab12cd34",
        "notebooks": {"koer_scenarie": "", "importer_vaerksark": ""}}


class TestDeployPins(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.addCleanup(self._t.cleanup)
        self.cfg = Path(self._t.name) / "installation.json"
        self.cfg.write_text(json.dumps(INST), encoding="utf-8")

    def test_tor_kode_skriver_pins_efter_den_sidste_upload(self):
        env = {"FJV_INSTALLATION": str(self.cfg), "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""), "PATH": "", "PYTHONUTF8": "1"}
        r = subprocess.run([sys.executable, "-I", str(FABRIC / "deploy.py"), "--tor", "kode"], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=300, env=env, cwd=self._t.name)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        linjer = r.stdout.splitlines()
        pins = [i for i, x in enumerate(linjer) if "dbo.Motors" in x]
        self.assertEqual(len(pins), 1, r.stdout)
        self.assertIn(f"model {K.MODEL_COMMIT}, df-data {K.DF_DATA_SHA}", linjer[pins[0]])
        uploads = [i for i, x in enumerate(linjer) if "Files/fjv/motor/fjv/" in x]
        self.assertTrue(uploads and pins[0] > max(uploads), "pins skal skrives EFTER motorkoden (se kmd_kode)")

    def deploy(self, inst=None):
        cfg = self.cfg
        if inst is not None:
            cfg = Path(self._t.name) / "anden.json"
            cfg.write_text(json.dumps(inst), encoding="utf-8")
        gl = os.environ.get("FJV_INSTALLATION")
        os.environ["FJV_INSTALLATION"] = str(cfg)
        try:
            for m in ("fabric_miljoe", "deploy_r7c"):
                sys.modules.pop(m, None)
            spec = importlib.util.spec_from_file_location("deploy_r7c", FABRIC / "deploy.py")
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
        finally:
            if gl is None:
                os.environ.pop("FJV_INSTALLATION", None)
            else:
                os.environ["FJV_INSTALLATION"] = gl
        return mod

    def med_sqlcmd(self, stdout: str, rc: int = 0, inst=None, **kw):
        import azsql
        kald = []

        def falsk(server, database, sql, **k):
            kald.append((server, database, sql))
            return subprocess.CompletedProcess([], rc, stdout, "fejltekst" if rc else "")
        gl = azsql.koer_sqlcmd
        azsql.koer_sqlcmd = falsk
        try:
            return self.deploy(inst).kmd_pins(**kw), kald
        finally:
            azsql.koer_sqlcmd = gl

    def test_sql_skriver_laeser_tilbage_og_taaler_manglende_tabel(self):
        sql = self.deploy().motor_pins_sql(K.MODEL_COMMIT, K.DF_DATA_SHA)
        self.assertIn(f"model_commit='{K.MODEL_COMMIT}'", sql)
        self.assertIn(f"data_commit='{K.DF_DATA_SHA}'", sql)
        self.assertEqual(DB.MOTOR_ID, K.MOTOR_ID)
        self.assertIn(K.MOTOR_ID, sql)
        self.assertIn("FJV_PINS|ingen-tabel", sql)
        self.assertTrue(sql.rstrip().endswith(f"WHERE id='{K.MOTOR_ID}';"), "sidste sætning læser rækken tilbage")

    def test_sql_kun_fulde_hex_shaer(self):
        d = self.deploy()
        for daarlig in ("abc", "g" * 40, "a" * 39, "'; DROP TABLE x; --" + "a" * 21):
            with self.assertRaises(ValueError):
                d.motor_pins_sql(daarlig, K.DF_DATA_SHA)

    def test_laest_tilbage_ens_er_ok(self):
        rc, kald = self.med_sqlcmd(f"FJV_PINS|{K.MODEL_COMMIT}|{K.DF_DATA_SHA}\n")
        self.assertEqual(rc, 0)
        self.assertEqual(kald[0][0], INST["sql_server"] + ",1433")

    def test_laest_tilbage_anderledes_er_en_fejl(self):
        self.assertEqual(self.med_sqlcmd(f"FJV_PINS|{GAMMEL_MODEL}|{GAMMEL_DATA}\n")[0], 1)

    def test_sqlcmd_fejl_er_en_fejl(self):
        self.assertEqual(self.med_sqlcmd("", rc=1)[0], 1)

    def test_ingen_tabel_endnu_springes_over(self):
        self.assertEqual(self.med_sqlcmd("FJV_PINS|ingen-tabel\n")[0], 0)

    def test_foerste_installation_uden_database_springes_over_uden_sqlcmd(self):
        inst = dict(INST, sql_server="<din-server>", sql_database="")
        rc, kald = self.med_sqlcmd("", inst=inst, foerste_installation_ok=True)
        self.assertEqual((rc, kald), (0, []))


if __name__ == "__main__":
    unittest.main()
