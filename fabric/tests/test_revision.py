"""Runde 12: genupload af et eksporteret værksark som ny revision (``fjv.revision`` + lagrenes ``gem_revision``).

Modelscriptet selv køres af rundturs-beviset (viden/vaerktoej/tjek_eksport_rundtur.py); her prøves reglerne for,
hvad der gemmes: kun forskellen mellem scriptets læsning af basis og af arket, konverteringens artefakter aldrig,
optimistisk samtidighed (``forventet_revision``), ingen ændringer = intet gemt, og en tidsserie, der beholder sine timer
uden for arket. Fabric-lagerets SQL prøves mod en optagende forbindelse (samme sætninger som ``udfoerAendring``).
"""

from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fjv import lager_minne as LM
from fjv import revision as REV
from fjv import vaerksark as VS
from fjv.tidsserie_db import gem_tidsseriefil

VID = "6e84c3a2-0000-4000-8000-000000000001"
IID = "cccccccc-0000-4000-8000-0000000000aa"
BASIS = {"units.halm.var_om": "30.0", "units.halm.type": '"biomass_boiler"', "units.halm.notes": '"script"',
         "units.vp.var_om": "13.4", "prices.straw.value": "232.0", "prices.straw.unit": '"DKK/MWh_fuel"',
         "heat_load_params.gaf_mw_per_k": "0.7653", "meta.case_name": '"a"', "time.start": '"2025-07-01T00:00:00Z"'}


class TestForskelle(unittest.TestCase):
    def test_ingen_forskel_ingen_aendringer(self):
        self.assertEqual(REV.forskelle(BASIS, dict(BASIS)), [])

    def test_kun_det_aendrede_og_aldrig_artefakter(self):
        ark = {**BASIS, "units.halm.var_om": "32.5", "units.halm.notes": '"ny note"', "heat_load_params.gaf_mw_per_k": "0.8",
               "meta.case_name": '"b"', "time.start": '"2025-08-01T00:00:00Z"'}
        self.assertEqual(REV.forskelle(BASIS, ark), [
            {"sti": "units.halm.var_om", "handling": "ret", "gammel_json": "30.0", "ny_json": "32.5"}])

    def test_fjernet_objekt_er_et_helt_objekt_og_nyt_objekt_faar_alle_felter(self):
        ark = {k: v for k, v in BASIS.items() if not k.startswith("units.vp.")} | {"units.ny.type": '"gas_boiler"', "units.ny.var_om": "5.0"}
        a = REV.forskelle(BASIS, ark)
        self.assertIn({"sti": "units.vp", "handling": "slet_objekt", "gammel_json": None, "ny_json": None}, a)
        self.assertIn({"sti": "units.ny.type", "handling": "opret", "gammel_json": None, "ny_json": '"gas_boiler"'}, a)
        self.assertNotIn("units.vp.var_om", [x["sti"] for x in a])


class TestRegnearketsPraecision(unittest.TestCase):
    """Målt i runde 12: Excel gemmer 15 betydende cifre (openpyxl 16), så 4.6000000000000005 kommer tilbage som
    4.600000000000001 — det er ikke en ændring. En rigtig rettelse er det stadig."""

    def test_blade(self):
        b = {"units.a.var_om": "0.30000000000000004", "units.a.cop_curve.points": '[{"heat_mw":4.6000000000000005}]'}
        a = {"units.a.var_om": "0.3", "units.a.cop_curve.points": '[{"heat_mw":4.600000000000001}]'}
        self.assertEqual(REV.forskelle(b, a), [])
        self.assertEqual(len(REV.forskelle(b, {**a, "units.a.var_om": "0.31"})), 1)
        self.assertFalse(REV.samme_vaerdi("1", '"1"'))          # typen tæller stadig

    def test_serie(self):
        self.assertEqual(REV.serieaendringer({"t": "4.6000000000000005"}, {"t": "4.600000000000001"}), {"ret": {}, "opret": {}, "slet": []})
        self.assertEqual(REV.serieaendringer({"t": "4.6000000000000005"}, {"t": "4.61"})["ret"], {"t": "4.61"})


class TestPlanlaeg(unittest.TestCase):
    VAERK = {"units.halm.var_om": "30.0", "units.halm.commissioned": "2015", "units.vp.var_om": "13.4", "units.vp.ancillary.bid_window.months": "[1,2]",
             "balancing.method": '"activation_value"'}

    def test_lagt_paa_vaerkets_nuvaerende_blade(self):
        p = REV.planlaeg(self.VAERK, [{"sti": "units.halm.var_om", "handling": "ret", "gammel_json": "30.0", "ny_json": "32.5"},
                                      {"sti": "units.vp", "handling": "slet_objekt", "gammel_json": None, "ny_json": None},
                                      {"sti": "units.ny.var_om", "handling": "opret", "gammel_json": None, "ny_json": "5.0"}])
        self.assertEqual(p["ret"], [{"sti": "units.halm.var_om", "gammel_json": "30.0", "ny_json": "32.5"}])
        # Hele enheden fjernes - også det, arket aldrig bar (bid_window).
        self.assertEqual(sorted(x["sti"] for x in p["slet"]), ["units.vp.ancillary.bid_window.months", "units.vp.var_om"])
        self.assertEqual(p["opret"], [{"sti": "units.ny.var_om", "ny_json": "5.0", "sektion": "units", "objekt": "ny"}])
        efter = REV.anvend(self.VAERK, p)
        self.assertEqual(efter["balancing.method"], '"activation_value"')      # arket bærer ikke balancemarkedet: urørt
        self.assertEqual(efter["units.halm.commissioned"], "2015")

    def test_ugyldig_sti_json_og_blad_under_blad_afvises_som_i_appen(self):
        for a, tekst in ((("units..x", "1.0"), "ugyldig sti"), (("units.halm.var_om", "NaN"), "endeligt tal"),
                         (("units.halm.var_om.x", "1.0"), "kan ikke være en værdi")):
            with self.subTest(a=a), self.assertRaisesRegex(REV.RevisionsFejl, tekst):
                REV.planlaeg(self.VAERK, [{"sti": a[0], "handling": "opret", "gammel_json": None, "ny_json": a[1]}])


def _t(ms_iso: str, h: int) -> str:
    return (datetime.fromisoformat(ms_iso) + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")


class TestSerier(unittest.TestCase):
    def test_kun_de_aendrede_timer_og_timerne_uden_for_arket_bevares(self):
        gemt = {_t("2025-06-30T00:00:00", h): "1.0" for h in range(48)}          # 24 timer FØR arkets periode + 24 i
        basis = {t: v for t, v in gemt.items() if t >= "2025-07-01"}
        ark = {**basis, "2025-07-01T05:00:00Z": "9.5"}
        ark.pop("2025-07-01T06:00:00Z")
        ae = REV.serieaendringer(basis, ark)
        self.assertEqual(ae, {"ret": {"2025-07-01T05:00:00Z": "9.5"}, "opret": {}, "slet": ["2025-07-01T06:00:00Z"]})
        ny = REV.flet_serie(gemt, ae).strip().split("\n")
        self.assertEqual(len(ny), 1 + 47)
        self.assertIn("2025-06-30T00:00:00Z,1.0", ny)                               # uden for arket: bevaret
        self.assertIn("2025-07-01T05:00:00Z,9.5", ny)
        self.assertEqual(REV.serieaendringer(basis, {**basis, "2025-07-01T05:00:00Z": "1"}), {"ret": {}, "opret": {}, "slet": []})


class TestMinneRevision(unittest.TestCase):
    """``gem_revision`` i hukommelseslageret (samme regler som Fabric og den lokale udgave)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.files = self.tmp.name
        self.db = LM.MinneDb()
        self.lager = LM.MinneImportLager(self.db)
        self.db.vaerker[VID] = {"id": VID, "kode": "andeby", "navn": "Andeby", "revision": 3, "arkiveret": False,
                                "parametre": [{"sti": s, "vaerdi_json": v} for s, v in TestPlanlaeg.VAERK.items()]}
        data = ("time,mw\n" + "".join(f"{_t('2025-06-30T00:00:00', h)},{1 + h % 3}\n" for h in range(24 * 40))).encode()
        import hashlib
        sha = hashlib.sha256(data).hexdigest()
        self.db.tidsserier["ts-1"] = {"id": "ts-1", "vaerk_id": VID, "rolle": "solprofil", "sti": gem_tidsseriefil("andeby", data, sha, self.files),
                                      "sha256": sha, "kilde": "repo", "status": "gyldig", "aktiv": True}
        self.db.anmodninger[IID] = {"vaerk_id": VID.upper(), "forventet_revision": 3,
                                    "aendringer_json": json.dumps([{"handling": "upload_vaerksark", "filnavn": "a.xlsx", "sha256": "0" * 64, "basis_sha256": "A" * 64}])}
        self.imp = {"id": IID, "filnavn": "andeby_rev3.xlsx", "uploadet_af": "bruger@example.dk"}
        self.db.importer[IID] = {**self.imp, "status": "koerer", "uploadet": datetime.now(timezone.utc)}

    def tearDown(self):
        self.tmp.cleanup()

    def rev(self):
        r = self.lager.revision_for(IID)
        self.assertEqual(r, {"vaerk_id": VID, "forventet_revision": 3, "basis_sha256": "a" * 64})
        return r

    def test_ingen_aendringer_intet_gemt(self):
        res = self.lager.gem_revision(self.imp, self.rev(), [], {}, "log", files=self.files)
        self.assertIsNone(res["revision"])
        self.assertEqual(self.db.vaerker[VID]["revision"], 3)
        self.assertNotIn("log", self.db.vaerker[VID])
        self.assertTrue(self.db.importer[IID]["log"].startswith("Ingen ændringer"))
        self.assertEqual(self.db.importer[IID]["status"], "faerdig")

    def test_aendring_bliver_revision_4_med_log_i_uploaderens_navn(self):
        res = self.lager.gem_revision(self.imp, self.rev(), [{"sti": "units.halm.var_om", "handling": "ret", "gammel_json": "30.0", "ny_json": "32.5"}], {}, "log", files=self.files)
        v = self.db.vaerker[VID]
        self.assertEqual((res["revision"], v["revision"], v["aendret_af"]), (4, 4, "bruger@example.dk"))
        self.assertEqual(v["log"], [{"revision": 4, "sti": "units.halm.var_om", "handling": "ret", "gammel_json": "30.0", "ny_json": "32.5",
                                     "aendret_af": "bruger@example.dk", "anmodning_id": IID}])
        self.assertEqual({b["sti"]: b["vaerdi_json"] for b in v["parametre"]}["units.halm.var_om"], "32.5")
        self.assertEqual(self.db.importer[IID]["vaerk_id"], VID)

    def test_vaerket_er_aendret_siden_eksporten_afvises_og_intet_gemmes(self):
        self.db.vaerker[VID]["revision"] = 4
        with self.assertRaisesRegex(VS.ArkFejl, r"ændret, siden arket blev eksporteret \(revision 3 -> 4\)"):
            self.lager.gem_revision(self.imp, self.rev(), [{"sti": "units.halm.var_om", "handling": "ret", "gammel_json": "30.0", "ny_json": "32.5"}], {}, "log", files=self.files)
        self.assertEqual(self.db.vaerker[VID]["revision"], 4)
        self.assertNotIn("log", self.db.vaerker[VID])

    def test_arkiveret_og_slettet_vaerk_afvises(self):
        self.db.vaerker[VID]["arkiveret"] = True
        with self.assertRaisesRegex(VS.ArkFejl, "arkiveret"):
            self.lager.gem_revision(self.imp, self.rev(), [], {}, "log", files=self.files)
        del self.db.vaerker[VID]
        with self.assertRaisesRegex(VS.ArkFejl, "findes ikke længere"):
            self.lager.gem_revision(self.imp, self.rev(), [], {}, "log", files=self.files)

    def test_tidsserien_faar_en_ny_aktiv_version_med_timerne_uden_for_arket(self):
        ae = {"ret": {"2025-07-02T12:00:00Z": "7.25"}, "opret": {}, "slet": []}
        res = self.lager.gem_revision(self.imp, self.rev(), [], {"solprofil": {"aendringer": ae, "opsummering": "1 time", "tidsstempel": "start"}}, "log", files=self.files)
        self.assertIsNone(res["revision"])                       # en serie er ikke et blad: revisionen øges ikke
        aktive = [t for t in self.db.tidsserier.values() if t["aktiv"]]
        self.assertEqual(len(aktive), 1)
        ny = aktive[0]
        self.assertEqual((ny["kilde"], ny["rolle"]), ("vaerksark", "solprofil"))
        self.assertFalse(self.db.tidsserier["ts-1"]["aktiv"])
        punkter = REV.punkter((Path(self.files) / ny["sti"][len("Files/"):]).read_bytes())
        self.assertEqual(punkter["2025-07-02T12:00:00Z"], "7.25")
        self.assertIn("2025-06-30T00:00:00Z", punkter)           # før arkets periode: bevaret
        self.assertEqual(len(punkter), 24 * 40)
        self.assertIn("Solprofil: 1 time - ny version er aktiv.", self.db.importer[IID]["log"])


class _Cur:
    """Optagende pyodbc-markør: svar efter SQL'ens begyndelse."""

    def __init__(self, cn):
        self.cn, self.rowcount, self._rk = cn, -1, []

    def execute(self, sql, *p):
        s = " ".join(sql.split())
        self.cn.log.append((s, p))
        for start, svar in self.cn.svar:
            if s.startswith(start):
                rk, n = svar(p) if callable(svar) else svar
                self._rk, self.rowcount = list(rk), n
                return self
        self._rk, self.rowcount = [], 1
        return self

    def fetchone(self):
        return self._rk.pop(0) if self._rk else None

    def fetchall(self):
        ud, self._rk = self._rk, []
        return ud


class _Db:
    def __init__(self, svar):
        self.svar, self.log, self.commits, self.rollbacks = svar, [], 0, 0

    def forbind(self, autocommit=False):
        db = self

        class Cn:
            def cursor(self):
                return _Cur(db)

            def commit(self):
                db.commits += 1

            def rollback(self):
                db.rollbacks += 1

            def close(self):
                pass
        Cn.log, Cn.svar = self.log, self.svar
        return Cn()


class TestSqlRevision(unittest.TestCase):
    def db(self, revision=3):
        return _Db([
            ("SELECT status FROM dbo.Vaerksarkimports", ([("koerer",)], 1)),
            ("SELECT CAST(id AS nvarchar(36)), kode, navn, revision, arkiveret FROM dbo.Vaerks", ([(VID.upper(), "andeby", "Andeby", revision, 0)], 1)),
            ("SELECT sti, vaerdi_json, raekkefoelge FROM dbo.VaerkParameters", ([("units.halm.var_om", "30.0", 1), ("balancing.method", '"x"', 2)], 2)),
            ("SELECT rolle, sti FROM dbo.Tidsseries", ([], 0)),
        ])

    def test_samme_saetninger_som_udfoerAendring_i_een_transaktion(self):
        d = self.db()
        res = VS.gem_revision(d, {"id": IID, "filnavn": "a.xlsx", "uploadet_af": "b@example.dk"},
                              {"vaerk_id": VID, "forventet_revision": 3, "basis_sha256": "a" * 64},
                              [{"sti": "units.halm.var_om", "handling": "ret", "gammel_json": "30.0", "ny_json": "32.5"}], {}, "log")
        sql = [s for s, _ in d.log]
        self.assertEqual(res["revision"], 4)
        self.assertTrue(any(s.startswith("UPDATE dbo.VaerkParameters SET vaerdi_json=?") for s in sql))
        log = next(p for s, p in d.log if s.startswith("INSERT INTO dbo.Aendringslogs"))
        self.assertEqual(log, (VID, 4, "units.halm.var_om", "ret", "30.0", "32.5", "b@example.dk", IID))
        self.assertIn(("UPDATE dbo.Vaerks SET revision=?, aendret_af=?, aendret=SYSUTCDATETIME() WHERE id=? AND revision=?", (4, "b@example.dk", VID, 3)), d.log)
        self.assertTrue(sql[-1].startswith("UPDATE dbo.Vaerksarkimports SET status='faerdig'"))
        self.assertEqual((d.commits, d.rollbacks), (1, 0))

    def test_konflikt_ruller_tilbage(self):
        d = self.db(revision=5)
        with self.assertRaisesRegex(VS.ArkFejl, "revision 3 -> 5"):
            VS.gem_revision(d, {"id": IID, "filnavn": "a.xlsx", "uploadet_af": "b@example.dk"},
                            {"vaerk_id": VID, "forventet_revision": 3, "basis_sha256": "a" * 64},
                            [{"sti": "units.halm.var_om", "handling": "ret", "gammel_json": "30.0", "ny_json": "32.5"}], {}, "log")
        self.assertEqual((d.commits, d.rollbacks), (0, 1))
        self.assertFalse(any(s.startswith(("UPDATE dbo.VaerkParameters", "INSERT INTO dbo.Aendringslogs")) for s, _ in d.log))


class TestLaesRevision(unittest.TestCase):
    def test_kun_upload_vaerksark_med_basis_er_en_revision(self):
        self.assertEqual(VS.laes_revision(json.dumps([{"handling": "upload_vaerksark", "basis_sha256": "AB" * 32}])), "ab" * 32)
        for x in (json.dumps([{"handling": "upload_vaerksark"}]), json.dumps([{"handling": "upload_vaerksark", "basis_sha256": "x"}]), "[]", "ikke json", None):
            self.assertIsNone(VS.laes_revision(x))
        self.assertEqual(VS.basis_sti("Files/fjv/uploads/x.xlsx"), "Files/fjv/uploads/x_basis.xlsx")


if __name__ == "__main__":
    unittest.main()
