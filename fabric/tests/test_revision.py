"""Runde 12: genupload af et eksporteret værksark som ny revision (``fjv.revision`` + lagrenes ``gem_revision``).

Modelscriptet selv køres af rundturs-beviset (viden/vaerktoej/tjek_eksport_rundtur.py); her prøves reglerne for,
hvad der gemmes: kun forskellen mellem scriptets læsning af basis og af arket, konverteringens artefakter aldrig,
optimistisk samtidighed (``forventet_revision``), ingen ændringer = intet gemt, og en tidsserie, der beholder sine timer
uden for arket. Fabric-lagerets SQL prøves mod en optagende forbindelse (samme sætninger som ``udfoerAendring``).

Runde 12b (Codex K11): bindingen til værket (markering format 2, grundlag, basis = værkets eksport), scriptets
objektnavne ført tilbage til værkets (``halm__kedel``), en tidsserierettelse som revision, og felter, der ikke gemmes.
Modprøverne fra reviewet står her som tests, der var røde på 6c820b2.
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


#: De stier, Andeby-eksporten ikke kan bære (planens ``afvigelser``): scriptets læsning af basis mangler dem.
AFVIG = ["balancing.method", "units.halm.commissioned", "units.vp.ancillary.bid_window.months"]
#: Modelscriptets læsning af en eksport af ``TestPlanlaeg.VAERK`` (artefakter med, afvigelserne ikke).
BASIS_LAEST = {**{k: v for k, v in TestPlanlaeg.VAERK.items() if k not in AFVIG},
               "meta.case_name": '"andeby"', "units.halm.notes": '"script"', "heat_load_params.gaf_mw_per_k": "0.7653"}
UPLOADER = "bruger@example.org"


def laesning(basis: dict | None = None, **ret) -> dict:
    """Scriptets læsning af basis og af arket (= basis + ``ret``)."""
    b = dict(BASIS_LAEST if basis is None else basis)
    return {"basis": b, "arket": {**b, **ret}}


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
        self.ny_import(IID)

    def tearDown(self):
        self.tmp.cleanup()

    def ny_import(self, iid: str, hvem: str = UPLOADER):
        self.db.anmodninger[iid] = {"vaerk_id": VID.upper(), "forventet_revision": 3,
                                    "aendringer_json": json.dumps([{"handling": "upload_vaerksark", "filnavn": "a.xlsx", "sha256": "0" * 64, "basis_sha256": "A" * 64}])}
        self.imp = {"id": iid, "filnavn": "andeby_rev3.xlsx", "uploadet_af": hvem}
        self.db.importer[iid] = {**self.imp, "status": "koerer", "uploadet": datetime.now(timezone.utc)}
        return self.imp

    def grundlag(self) -> str:
        """Værkets grundlag, som eksporten så det (blade + aktive seriers sha256)."""
        nuv = {b["sti"]: b["vaerdi_json"] for b in self.db.vaerker[VID]["parametre"]}
        return REV.grundlag(nuv, {t["rolle"]: t["sha256"] for t in self.db.tidsserier.values() if t["aktiv"]})

    def rev(self, iid: str = IID, grundlag: str | None = None, afvigelser: list | None = None):
        r = self.lager.revision_for(iid)
        self.assertEqual(r, {"vaerk_id": VID, "forventet_revision": 3, "basis_sha256": "a" * 64})
        return {**r, "markering": {"grundlag": grundlag or self.grundlag(), "afvigelser": AFVIG if afvigelser is None else afvigelser}}

    def test_ingen_aendringer_intet_gemt(self):
        res = self.lager.gem_revision(self.imp, self.rev(), laesning(), {}, "log", files=self.files)
        self.assertIsNone(res["revision"])
        self.assertEqual(self.db.vaerker[VID]["revision"], 3)
        self.assertNotIn("log", self.db.vaerker[VID])
        self.assertTrue(self.db.importer[IID]["log"].startswith("Ingen ændringer"))
        self.assertEqual(self.db.importer[IID]["status"], "faerdig")

    def test_aendring_bliver_revision_4_med_log_i_uploaderens_navn(self):
        res = self.lager.gem_revision(self.imp, self.rev(), laesning(**{"units.halm.var_om": "32.5"}), {}, "log", files=self.files)
        v = self.db.vaerker[VID]
        self.assertEqual((res["revision"], v["revision"], v["aendret_af"]), (4, 4, UPLOADER))
        self.assertEqual(v["log"], [{"revision": 4, "sti": "units.halm.var_om", "handling": "ret", "gammel_json": "30.0", "ny_json": "32.5",
                                     "aendret_af": UPLOADER, "anmodning_id": IID}])
        self.assertEqual({b["sti"]: b["vaerdi_json"] for b in v["parametre"]}["units.halm.var_om"], "32.5")
        self.assertEqual(self.db.importer[IID]["vaerk_id"], VID)

    def test_vaerket_er_aendret_siden_eksporten_afvises_og_intet_gemmes(self):
        self.db.vaerker[VID]["revision"] = 4
        with self.assertRaisesRegex(VS.ArkFejl, r"ændret, siden arket blev eksporteret \(revision 3 -> 4\)"):
            self.lager.gem_revision(self.imp, self.rev(), laesning(**{"units.halm.var_om": "32.5"}), {}, "log", files=self.files)
        self.assertEqual(self.db.vaerker[VID]["revision"], 4)
        self.assertNotIn("log", self.db.vaerker[VID])

    def test_arkiveret_og_slettet_vaerk_afvises(self):
        self.db.vaerker[VID]["arkiveret"] = True
        with self.assertRaisesRegex(VS.ArkFejl, "arkiveret"):
            self.lager.gem_revision(self.imp, self.rev(), laesning(), {}, "log", files=self.files)
        del self.db.vaerker[VID]
        with self.assertRaisesRegex(VS.ArkFejl, "findes ikke længere"):
            self.lager.gem_revision(self.imp, {**self.lager.revision_for(IID), "markering": {}}, laesning(), {}, "log", files=self.files)

    def test_tidsserien_er_en_revision_med_ny_aktiv_version_og_timerne_uden_for_arket(self):
        # K11 F2: før forventede testen det modsatte (revision None). En serierettelse er en ændring af det, en kørsel
        # bruger, og skal derfor have samme samtidighedskontrol og spor som en parameter: revision + 1 og en
        # Aendringslog-række i uploaderens navn.
        ae = {"ret": {"2025-07-02T12:00:00Z": "7.25"}, "opret": {}, "slet": []}
        gammel_sha = self.db.tidsserier["ts-1"]["sha256"]
        res = self.lager.gem_revision(self.imp, self.rev(), laesning(), {"solprofil": {"aendringer": ae, "opsummering": "1 time", "tidsstempel": "start"}}, "log", files=self.files)
        v = self.db.vaerker[VID]
        self.assertEqual((res["revision"], v["revision"], v["aendret_af"]), (4, 4, UPLOADER))
        aktive = [t for t in self.db.tidsserier.values() if t["aktiv"]]
        self.assertEqual(len(aktive), 1)
        ny = aktive[0]
        self.assertEqual((ny["kilde"], ny["rolle"], ny["uploadet_af"]), ("vaerksark", "solprofil", UPLOADER))
        self.assertFalse(self.db.tidsserier["ts-1"]["aktiv"])
        self.assertEqual(v["log"], [{"revision": 4, "sti": "tidsserie.solprofil", "handling": "ret",
                                     "gammel_json": json.dumps({"tidsserie_id": "ts-1", "sha256": gammel_sha}),
                                     "ny_json": json.dumps({"tidsserie_id": ny["id"], "sha256": ny["sha256"]}),
                                     "aendret_af": UPLOADER, "anmodning_id": IID}])
        punkter = REV.punkter((Path(self.files) / ny["sti"][len("Files/"):]).read_bytes())
        self.assertEqual(punkter["2025-07-02T12:00:00Z"], "7.25")
        self.assertIn("2025-06-30T00:00:00Z", punkter)           # før arkets periode: bevaret
        self.assertEqual(len(punkter), 24 * 40)
        self.assertIn("Solprofil: 1 time - ny version er aktiv.", self.db.importer[IID]["log"])
        self.assertIn("revision 3 -> 4", self.db.importer[IID]["log"])

    def test_k11_f2_to_serierettelser_fra_samme_revision_den_anden_afvises(self):
        """Codex' modprøve: to importer retter samme time ud fra revision 3. Før blev begge gemt (revisionen stod
        stille); nu bliver den første revision 4, og den anden afvises med intet gemt."""
        serie = lambda v: {"solprofil": {"aendringer": {"ret": {"2025-07-02T12:00:00Z": v}, "opret": {}, "slet": []},  # noqa: E731
                                         "opsummering": "1 time", "tidsstempel": "start"}}
        rev1, rev2 = self.rev(), None
        self.ny_import("cccccccc-0000-4000-8000-0000000000bb", "anden@example.org")
        rev2 = self.rev("cccccccc-0000-4000-8000-0000000000bb", grundlag=rev1["markering"]["grundlag"])
        self.lager.gem_revision({"id": IID, "filnavn": "a.xlsx", "uploadet_af": UPLOADER}, rev1, laesning(), serie("2.0"), "log", files=self.files)
        efter_første = {k: dict(t) for k, t in self.db.tidsserier.items()}
        with self.assertRaisesRegex(VS.ArkFejl, r"revision 3 -> 4"):
            self.lager.gem_revision(self.imp, rev2, laesning(), serie("3.0"), "log", files=self.files)
        self.assertEqual(self.db.tidsserier, efter_første)
        self.assertEqual(self.db.vaerker[VID]["aendret_af"], UPLOADER)

    def test_k11_f4_ark_fra_et_andet_vaerk_afvises(self):
        """Grundlaget i markeringen er et andet værks (eller værket er ændret uden ny revision): intet gemmes."""
        andet = REV.grundlag({"units.halm.var_om": "77.7"}, {})
        with self.assertRaisesRegex(VS.ArkFejl, "ikke længere det, arket blev eksporteret fra"):
            self.lager.gem_revision(self.imp, self.rev(grundlag=andet), laesning(**{"units.halm.var_om": "32.5"}), {}, "log", files=self.files)
        self.assertEqual(self.db.vaerker[VID]["revision"], 3)
        self.assertNotIn("log", self.db.vaerker[VID])

    def test_k11_f4_en_basis_der_ikke_er_vaerkets_eksport_afvises(self):
        """Codex' modprøve: det rettede ark sendt OGSÅ som basis. Før: 'ingen ændringer'. Nu: basis afviger fra værket
        uden for de erklærede afvigelser -> afvist."""
        forfalsket = {**BASIS_LAEST, "units.halm.var_om": "99.5"}
        with self.assertRaisesRegex(VS.ArkFejl, r"basis er ikke værkets eksport af revision 3 \(1 felt\(er\) afviger, fx units\.halm\.var_om\)"):
            self.lager.gem_revision(self.imp, self.rev(), laesning(forfalsket), {}, "log", files=self.files)
        # En afvigelse, eksporten ikke har erklæret, er også en forfalskning — selv om den ligger i et felt, arket ikke bærer.
        with self.assertRaisesRegex(VS.ArkFejl, "basis er ikke værkets eksport"):
            self.lager.gem_revision(self.imp, self.rev(afvigelser=AFVIG[:2]), laesning(), {}, "log", files=self.files)
        self.assertEqual(self.db.vaerker[VID]["revision"], 3)

    def test_k11_f1_scriptets_navn_fores_tilbage_til_vaerkets_objekt(self):
        """Codex' modprøve: enheden hedder halm__kedel; scriptet læser halm_kedel. D&V-rettelsen skal ramme
        halm__kedel — ikke oprette et nyt, halvt objekt halm_kedel."""
        v = self.db.vaerker[VID]
        v["parametre"] = [{**b, "sti": b["sti"].replace("units.halm.", "units.halm__kedel.")} for b in v["parametre"]]
        basis = {k.replace("units.halm.", "units.halm_kedel."): x for k, x in BASIS_LAEST.items()}
        afvig = [a.replace("units.halm.", "units.halm__kedel.") for a in AFVIG]
        res = self.lager.gem_revision(self.imp, self.rev(afvigelser=afvig), laesning(basis, **{"units.halm_kedel.var_om": "32.5"}), {}, "log", files=self.files)
        efter = {b["sti"]: b["vaerdi_json"] for b in v["parametre"]}
        self.assertEqual(res["revision"], 4)
        self.assertEqual(efter["units.halm__kedel.var_om"], "32.5")
        self.assertFalse(any(s.startswith("units.halm_kedel.") for s in efter))
        self.assertEqual([x["sti"] for x in v["log"]], ["units.halm__kedel.var_om"])

    def test_k11_f5_kun_syntesegrundlaget_aendret_siges_hoejt(self):
        """Årsproduktionen i Timedata!B3 ændrer kun heat_load_params (et artefakt): intet gemmes, og loggen siger hvorfor."""
        res = self.lager.gem_revision(self.imp, self.rev(), laesning(**{"heat_load_params.gaf_mw_per_k": "0.9184"}), {}, "log", files=self.files)
        self.assertIsNone(res["revision"])
        self.assertEqual(res["ikke_gemt"], [REV.IKKE_GEMT["heat_load_params"]])
        log = self.db.importer[IID]["log"]
        self.assertTrue(log.startswith("Ingen ændringer, der kan gemmes"))
        self.assertIn("Ikke gemt: varmelastens syntese-parametre", log)


class TestK11Binding(unittest.TestCase):
    """``fjv.revision``: markeringen i arket (``_app``, format 2), objektnavne og basis-kontrollen."""

    MARK = {"format": REV.FORMAT, "vaerk_id": VID, "revision": 3, "sha256": "1" * 64, "grundlag": "2" * 64, "afvigelser": ["balancing.method"]}

    @staticmethod
    def xlsx(sti: Path, raekker: list[tuple[str, str]], delte: bool = False) -> Path:
        """Et minimalt regneark med det skjulte ark _app (inline- eller delte strenge, som Excel gemmer dem)."""
        import zipfile
        from xml.sax.saxutils import escape
        ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        strenge = [x for r in raekker for x in r]
        if delte:
            celle = lambda ref, v: f'<c r="{ref}" t="s"><v>{strenge.index(v)}</v></c>'  # noqa: E731
        else:
            celle = lambda ref, v: f'<c r="{ref}" t="inlineStr"><is><t>{escape(v)}</t></is></c>'  # noqa: E731
        rk = "".join(f'<row r="{i}">{celle(f"A{i}", a)}{celle(f"B{i}", b)}</row>' for i, (a, b) in enumerate(raekker, 1))
        with zipfile.ZipFile(sti, "w") as z:
            z.writestr("xl/workbook.xml", f'<workbook {ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                       '<sheets><sheet name="Priser" sheetId="1" r:id="rId1"/><sheet name="_app" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>')
            z.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                       '<Relationship Id="rId1" Type="w" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="w" Target="/xl/worksheets/sheet2.xml"/></Relationships>')
            z.writestr("xl/worksheets/sheet1.xml", f"<worksheet {ns}><sheetData/></worksheet>")
            z.writestr("xl/worksheets/sheet2.xml", f"<worksheet {ns}><sheetData>{rk}</sheetData></worksheet>")
            if delte:
                z.writestr("xl/sharedStrings.xml", f"<sst {ns}>" + "".join(f"<si><t>{escape(x)}</t></si>" for x in strenge) + "</sst>")
        return sti

    def raekker(self, **ret):
        m = {**self.MARK, **ret}
        return [("format", m["format"]), ("vaerk_id", m["vaerk_id"].upper()), ("vaerk_kode", "andeby"), ("revision", str(m["revision"])),
                ("sha256", m["sha256"]), ("grundlag", m["grundlag"]), ("afvigelser", json.dumps(m["afvigelser"]))]

    def test_markeringen_laeses_med_inline_og_delte_strenge(self):
        with tempfile.TemporaryDirectory() as d:
            for delte in (False, True):
                m = REV.laes_markering(self.xlsx(Path(d) / f"a{delte}.xlsx", self.raekker(), delte))
                self.assertEqual(m, {k: self.MARK[k] for k in ("format", "vaerk_id", "revision", "sha256", "grundlag", "afvigelser")})
            self.assertIsNone(REV.laes_markering(self.xlsx(Path(d) / "x.xlsx", self.raekker(revision="tre"))))
            (Path(d) / "ikke.xlsx").write_bytes(b"ikke en zip")
            self.assertIsNone(REV.laes_markering(Path(d) / "ikke.xlsx"))

    def test_markeringerne_skal_passe_sammen_og_med_anmodningen(self):
        m = dict(self.MARK)
        self.assertEqual(REV.tjek_markeringer(m, dict(m), VID.upper(), 3), m)
        for ark, basis, vid, rev, tekst in (
                (None, m, VID, 3, "mangler appens markering"),
                ({**m, "format": "fjv-vaerksark-eksport/1"}, m, VID, 3, "anden udgave af appen"),
                (m, {**m, "afvigelser": []}, VID, 3, "ikke fra samme eksport"),
                (m, m, "bbbbbbbb-2222-4222-8222-222222222222", 3, "et andet værk"),     # Codex' F4: ark fra A, mål B
                (m, m, VID, 4, "fra revision 3, men uploaden gælder revision 4")):
            with self.subTest(tekst=tekst), self.assertRaisesRegex(REV.RevisionsFejl, tekst):
                REV.tjek_markeringer(ark, basis, vid, rev)

    def test_grundlaget_er_samme_hash_som_appens_eksport(self):
        """Vektoren deles med app/src/sider/konfiguration/eksport/k11.spec.ts (grundlagstekst + sha256)."""
        blade = {"units.b.p_max_heat": "1.0", "prices.straw.unit": '"DKK/MWh_æøå"', "data.dmi_area": '"karup"',
                 "units.a.cop_curve.points": '[{"t_ambient":-10.0}]'}
        self.assertEqual(REV.grundlag(blade, {"solprofil": "ab" * 32}), "460fcaa85e634f44ccde1ef2699626f0f7d41f26e7b407e66783e64fc8338c24")
        self.assertEqual(REV.grundlag(blade, {"solprofil": "ab" * 32, "varmelast": "cd" * 32}),
                         "e5467d410bed30a40d8e36651175aae2658ae6bd65e0fb17d652a6ab1d3dfa03")

    def test_objektkort_entydigt_eller_afvist(self):
        nuv = {"units.halm__kedel.var_om": "30.0", "units.vp.var_om": "1.0", "storage.tank.volume_m3": "1"}
        basis = {"units.halm_kedel.var_om": "30.0", "units.vp.var_om": "1.0", "storage.tank.volume_m3": "1"}
        kort = REV.objektkort(nuv, basis, basis)
        self.assertEqual(kort[("units", "halm_kedel")], "halm__kedel")
        self.assertEqual(REV.oversaet({"units.halm_kedel.var_om": "32.5", "prices.x": "1"}, kort),
                         {"units.halm__kedel.var_om": "32.5", "prices.x": "1"})
        # To af værkets objekter har samme slug (det ene slået fra og ikke i arket): tvetydigt.
        with self.assertRaisesRegex(REV.RevisionsFejl, r"units\.halm_kedel i arket kan ikke føres entydigt tilbage .*halm__kedel, halm_kedel"):
            REV.objektkort({**nuv, "units.halm_kedel.enabled": "false"}, basis, basis)
        # En ny enhed i arket med et eksisterende objekts slug ville overskrive et objekt, arket ikke bar.
        with self.assertRaisesRegex(REV.RevisionsFejl, "den nye enhed 'gas' i arket har samme navn som værkets _gas_"):
            REV.objektkort({**nuv, "units._gas_.enabled": "false"}, basis, {**basis, "units.gas.var_om": "5.0"})
        self.assertEqual(REV.slug("__Café__"), "cafe")

    def test_tjek_basis_kun_erklaerede_afvigelser_og_aldrig_artefakter(self):
        nuv = {"units.a.var_om": "30.0", "balancing.method": '"x"'}
        basis = {"units.a.var_om": "30.0", "units.a.notes": '"script"', "meta.titel": '"A"'}
        self.assertEqual(REV.tjek_basis(nuv, basis, ["balancing.method"]), [])
        self.assertEqual(REV.tjek_basis(nuv, basis, []), ["balancing.method"])
        self.assertEqual(REV.tjek_basis(nuv, {**basis, "units.a.var_om": "30.000000000000004"}, ["balancing.method"]), [])
        self.assertEqual(REV.tjek_basis(nuv, {**basis, "units.a.var_om": "99.5"}, ["balancing.method"]), ["units.a.var_om"])


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
    NUV = {"units.halm.var_om": "30.0", "balancing.method": '"x"'}
    LAES = {"basis": {"units.halm.var_om": "30.0", "meta.titel": '"Andeby"'}, "arket": {"units.halm.var_om": "32.5", "meta.titel": '"Andeby"'}}

    def db(self, revision=3):
        return _Db([
            ("SELECT status FROM dbo.Vaerksarkimports", ([("koerer",)], 1)),
            ("SELECT CAST(id AS nvarchar(36)), kode, navn, revision, arkiveret FROM dbo.Vaerks", ([(VID.upper(), "andeby", "Andeby", revision, 0)], 1)),
            ("SELECT sti, vaerdi_json, raekkefoelge FROM dbo.VaerkParameters", ([("units.halm.var_om", "30.0", 1), ("balancing.method", '"x"', 2)], 2)),
            ("SELECT rolle, sti, sha256, CAST(id AS nvarchar(36)) FROM dbo.Tidsseries", ([], 0)),
        ])

    def rev(self, grundlag: str | None = None):
        return {"vaerk_id": VID, "forventet_revision": 3, "basis_sha256": "a" * 64,
                "markering": {"grundlag": grundlag or REV.grundlag(self.NUV, {}), "afvigelser": ["balancing.method"]}}

    def test_samme_saetninger_som_udfoerAendring_i_een_transaktion(self):
        d = self.db()
        res = VS.gem_revision(d, {"id": IID, "filnavn": "a.xlsx", "uploadet_af": UPLOADER}, self.rev(), self.LAES, {}, "log")
        sql = [s for s, _ in d.log]
        self.assertEqual(res["revision"], 4)
        self.assertTrue(any(s.startswith("UPDATE dbo.VaerkParameters SET vaerdi_json=?") for s in sql))
        log = next(p for s, p in d.log if s.startswith("INSERT INTO dbo.Aendringslogs"))
        self.assertEqual(log, (VID, 4, "units.halm.var_om", "ret", "30.0", "32.5", UPLOADER, IID))
        self.assertIn(("UPDATE dbo.Vaerks SET revision=?, aendret_af=?, aendret=SYSUTCDATETIME() WHERE id=? AND revision=?", (4, UPLOADER, VID, 3)), d.log)
        self.assertTrue(sql[-1].startswith("UPDATE dbo.Vaerksarkimports SET status='faerdig'"))
        self.assertEqual((d.commits, d.rollbacks), (1, 0))

    def test_konflikt_ruller_tilbage(self):
        d = self.db(revision=5)
        with self.assertRaisesRegex(VS.ArkFejl, "revision 3 -> 5"):
            VS.gem_revision(d, {"id": IID, "filnavn": "a.xlsx", "uploadet_af": UPLOADER}, self.rev(), self.LAES, {}, "log")
        self.assertEqual((d.commits, d.rollbacks), (0, 1))
        self.assertFalse(any(s.startswith(("UPDATE dbo.VaerkParameters", "INSERT INTO dbo.Aendringslogs")) for s, _ in d.log))

    def test_k11_f4_grundlaget_kontrolleres_i_transaktionen(self):
        """Fabric-SQL'en: grundlaget regnes fra de LÅSTE rækker; et andet værks grundlag ruller tilbage, intet skrives."""
        d = self.db()
        with self.assertRaisesRegex(VS.ArkFejl, "ikke længere det, arket blev eksporteret fra"):
            VS.gem_revision(d, {"id": IID, "filnavn": "a.xlsx", "uploadet_af": UPLOADER},
                            self.rev(REV.grundlag({"units.halm.var_om": "77.7"}, {})), self.LAES, {}, "log")
        self.assertEqual((d.commits, d.rollbacks), (0, 1))
        self.assertTrue(any("WITH (UPDLOCK, HOLDLOCK)" in s and s.startswith("SELECT rolle, sti, sha256") for s, _ in d.log))
        self.assertFalse(any(s.startswith(("UPDATE dbo.VaerkParameters", "INSERT INTO dbo.Aendringslogs", "UPDATE dbo.Vaerks ")) for s, _ in d.log))


class TestLaesRevision(unittest.TestCase):
    def test_kun_upload_vaerksark_med_basis_er_en_revision(self):
        self.assertEqual(VS.laes_revision(json.dumps([{"handling": "upload_vaerksark", "basis_sha256": "AB" * 32}])), "ab" * 32)
        for x in (json.dumps([{"handling": "upload_vaerksark"}]), json.dumps([{"handling": "upload_vaerksark", "basis_sha256": "x"}]), "[]", "ikke json", None):
            self.assertIsNone(VS.laes_revision(x))
        self.assertEqual(VS.basis_sti("Files/fjv/uploads/x.xlsx"), "Files/fjv/uploads/x_basis.xlsx")


if __name__ == "__main__":
    unittest.main()
