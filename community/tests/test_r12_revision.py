"""Runde 12 i den lokale udgave: genupload af et eksporteret værksark som ny revision.

* ``uploadVaerksark`` med basis (funktionskaldet som fra browseren): begge ark gemmes, importen bindes til værket, og
  et værk, der er ændret siden eksporten, afvises med det samme — intet gemmes.
* ``LokalImportLager.gem_revision`` (SQLite): samme regler som Fabric (``fjv.vaerksark.gem_revision``) — kun
  forskellen gemmes, i uploaderens navn, med revisionslog; konflikt ruller alt tilbage.
* Runde 12b (Codex K11): bindingen til værket (grundlag + basis = værkets eksport), objektnavne, som scriptet
  normaliserer, og en tidsserierettelse som revision — Codex' modprøver mod SQLite som tests.
"""

from __future__ import annotations

import base64
import hashlib
import json
import unittest
from datetime import datetime, timedelta
from pathlib import Path

import hjaelp as H  # noqa: F401  (sætter miljøet op før fjv importeres)
from fjernvarme_app import funktioner as F
from fjernvarme_app import lokal_lager as LL
from fjernvarme_app.typer import nu, ny_uuid
from fjv import revision as REV
from fjv import vaerksark as VS
from fjv.tidsserie_db import gem_tidsseriefil

SKABELON = H.HER.parent.parent / "app" / "src" / "sider" / "konfiguration" / "eksport" / "vaerksdata_skabelon.xlsx"


def sha(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


class TestUploadSomRevision(unittest.TestCase):
    def setUp(self):
        self.app = H.ny_app()
        self.vid = H.vaerk(self.app, "rev_t")
        self.ark = base64.b64encode(SKABELON.read_bytes()).decode()
        self.basis = base64.b64encode(SKABELON.read_bytes() + b"").decode()

    def anmod(self, revision: int) -> str:
        aid = ny_uuid()
        with self.app.db.skriv() as cn:
            cn.execute(self.app.db.t("Aendringsanmodning").insert().values(
                id=aid, vaerk_id=self.vid, forventet_revision=revision, anmodet_af="test@lokal", anmodet=nu(), status="ny",
                aendringer_json=json.dumps([{"handling": "upload_vaerksark", "filnavn": "rev_t_rev1.xlsx", "timeslut": None,
                                             "sha256": sha(self.ark), "basis_sha256": sha(self.basis)}])))
        return aid

    def test_begge_ark_gemmes_og_importen_bindes_til_vaerket(self):
        aid = self.anmod(1)
        svar = F.kald(self.app, "uploadVaerksark", {"anmodningId": aid, "indholdBase64": self.ark, "basisBase64": self.basis}, "test@lokal")
        # Testappen starter ingen importproces (start_processer=False): arket er gemt og venter i kø.
        self.assertEqual((svar["status"], svar["import_id"]), ("koe", aid), svar)
        up = Path(self.app.files) / "fjv" / "uploads"
        self.assertTrue((up / f"{aid}.xlsx").is_file())
        self.assertTrue((up / f"{aid}_basis.xlsx").is_file())
        i = self.app.db.t("Vaerksarkimport")
        with self.app.db.laes() as cn:
            r = cn.execute(i.select().where(i.c.id == aid)).first()
        self.assertEqual(str(r.vaerk_id).lower(), self.vid.lower())
        self.assertEqual(LL.LokalImportLager(self.app.db).revision_for(aid),
                         {"vaerk_id": self.vid.lower(), "forventet_revision": 1, "basis_sha256": sha(self.basis)})

    def test_vaerket_er_aendret_siden_eksporten_afvises_straks(self):
        aid = self.anmod(0)
        svar = F.kald(self.app, "uploadVaerksark", {"anmodningId": aid, "indholdBase64": self.ark, "basisBase64": self.basis}, "test@lokal")
        self.assertEqual(svar["status"], "afvist")
        self.assertIn("ændret, siden arket blev eksporteret (revision 0 → 1)", svar["svar"])
        self.assertFalse((Path(self.app.files) / "fjv" / "uploads" / f"{aid}.xlsx").exists())


UPLOADER = "bruger@example.org"


class TestGemRevision(unittest.TestCase):
    def setUp(self):
        self.app = H.ny_app()
        self.vid = H.vaerk(self.app, "rev_g")
        self.lager = LL.LokalImportLager(self.app.db)
        self.iid = self.ny_import()
        p = self.app.db.t("VaerkParameter")
        with self.app.db.laes() as cn:
            self.blade = {r.sti: r.vaerdi_json for r in cn.execute(p.select().where(p.c.vaerk_id == self.vid)).fetchall()}
        self.sti = next(s for s in self.blade if s.startswith("units.") and s.endswith(".var_om"))
        self.imp = {"id": self.iid, "filnavn": "rev_g_rev1.xlsx", "uploadet_af": UPLOADER}

    def tearDown(self):
        self.app.db.engine.dispose()

    def ny_import(self) -> str:
        iid = ny_uuid()
        with self.app.db.skriv() as cn:
            cn.execute(self.app.db.t("Vaerksarkimport").insert().values(
                id=iid, filnavn="rev_g_rev1.xlsx", sti=f"Files/fjv/uploads/{iid}.xlsx", status="koerer",
                uploadet_af=UPLOADER, uploadet=nu()))
        return iid

    def aktive(self) -> dict:
        ts = self.app.db.t("Tidsserie")
        with self.app.db.laes() as cn:
            return {r.rolle: r.sha256 for r in cn.execute(ts.select().where(ts.c.vaerk_id == self.vid)
                                                          .where(ts.c.aktiv.is_(True)).where(ts.c.status == "gyldig")).fetchall()}

    def rev(self, forventet=1, grundlag=None, blade=None):
        """Anmodningens binding + markeringen, som appens eksport af værket ville skrive den (basis = værket)."""
        return {"vaerk_id": self.vid, "forventet_revision": forventet, "basis_sha256": "a" * 64,
                "markering": {"grundlag": grundlag or REV.grundlag(blade or self.blade, self.aktive()), "afvigelser": []}}

    def laes(self, ret: dict | None = None, basis: dict | None = None) -> dict:
        b = dict(self.blade if basis is None else basis)
        return {"basis": b, "arket": {**b, **(ret or {})}}

    def tilstand(self, sti=None):
        v, lg, p = self.app.db.t("Vaerk"), self.app.db.t("Aendringslog"), self.app.db.t("VaerkParameter")
        with self.app.db.laes() as cn:
            vr = cn.execute(v.select().where(v.c.id == self.vid)).first()
            log = cn.execute(lg.select().where(lg.c.vaerk_id == self.vid).where(lg.c.revision > 1)).fetchall()
            val = cn.execute(p.select().where(p.c.vaerk_id == self.vid).where(p.c.sti == (sti or self.sti))).first()
        return vr.revision, vr.aendret_af, log, val.vaerdi_json if val else None

    def test_aendringen_gemmes_som_revision_2_i_uploaderens_navn(self):
        res = self.lager.gem_revision(self.imp, self.rev(), self.laes({self.sti: "99.5"}), {}, "log")
        rev, af, log, val = self.tilstand()
        self.assertEqual((res["revision"], rev, af, val), (2, 2, UPLOADER, "99.5"))
        self.assertEqual([(x.sti, x.handling, x.ny_json, x.anmodning_id) for x in log], [(self.sti, "ret", "99.5", self.iid)])

    def test_ingen_aendringer_intet_gemt(self):
        res = self.lager.gem_revision(self.imp, self.rev(), self.laes(), {}, "log")
        self.assertIsNone(res["revision"])
        self.assertEqual(self.tilstand()[0], 1)
        self.assertTrue(res["log"].startswith("Ingen ændringer"))

    def test_konflikt_ruller_alt_tilbage(self):
        with self.assertRaisesRegex(VS.ArkFejl, "revision 0 -> 1"):
            self.lager.gem_revision(self.imp, self.rev(0), self.laes({self.sti: "99.5"}), {}, "log")
        rev, _, log, val = self.tilstand()
        self.assertEqual((rev, log, val), (1, [], self.blade[self.sti]))

    def test_k11_f4_ark_og_basis_fra_et_andet_vaerk_afvises(self):
        """Codex' modprøve (SQLite): ark og basis fra værk A, mål B med B's revision. Før: B's værdi blev overskrevet.
        Nu: grundlaget er A's -> intet gemt."""
        a_blade = {**self.blade, self.sti: repr(float(self.blade[self.sti]) + 47.2)}     # værk A: anden D&V
        with self.assertRaisesRegex(VS.ArkFejl, "ikke længere det, arket blev eksporteret fra"):
            self.lager.gem_revision(self.imp, self.rev(blade=a_blade), self.laes({self.sti: "32.5"}, basis=a_blade), {}, "log")
        self.assertEqual(self.tilstand()[2:], ([], self.blade[self.sti]))

    def test_k11_f4_det_rettede_ark_som_basis_afvises(self):
        """Codex' modprøve: det rettede ark sendt OGSÅ som basis. Før: 'Ingen ændringer'. Nu: afvist."""
        forfalsket = {**self.blade, self.sti: "99.5"}
        with self.assertRaisesRegex(VS.ArkFejl, "basis er ikke værkets eksport af revision 1"):
            self.lager.gem_revision(self.imp, self.rev(), self.laes(basis=forfalsket), {}, "log")
        self.assertEqual(self.tilstand()[0], 1)

    def test_k11_f2_to_serierettelser_fra_samme_revision_den_anden_afvises(self):
        """Codex' modprøve (49 timers syntetisk varmelast): to importer retter samme time ud fra revision 1. Før blev
        begge gemt, revisionen stod på 1, og ingen log. Nu: revision 2 med log i uploaderens navn; den anden afvises."""
        data = ("time,mw\n" + "".join((datetime(2025, 6, 30, 23) + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M:%SZ") + ",1.0\n"
                                      for i in range(49))).encode()
        sha_ = hashlib.sha256(data).hexdigest()
        tid = ny_uuid()
        with self.app.db.skriv() as cn:
            cn.execute(self.app.db.t("Tidsserie").insert().values(
                id=tid, vaerk_id=self.vid, rolle="varmelast", navn="syntetisk", filnavn="syntetisk.csv",
                sti=gem_tidsseriefil("rev_g", data, sha_, self.app.files), sha256=sha_, kilde="csv", status="gyldig", aktiv=True,
                uploadet_af="test@example.org", uploadet=nu(), oploesning="1h", tidsstempel="start", tidszone="UTC"))
        serie = lambda v: {"varmelast": {"aendringer": {"ret": {"2025-07-01T00:00:00Z": v}, "opret": {}, "slet": []},  # noqa: E731
                                         "opsummering": "1 time", "tidsstempel": "start"}}
        rev1 = self.rev()
        i2 = self.ny_import()
        res = self.lager.gem_revision(self.imp, rev1, self.laes(), serie("2.0"), "log", files=self.app.files)
        self.assertEqual(res["revision"], 2)
        with self.assertRaisesRegex(VS.ArkFejl, "revision 1 -> 2"):
            self.lager.gem_revision({**self.imp, "id": i2, "uploadet_af": "anden@example.org"}, rev1, self.laes(), serie("3.0"), "log", files=self.app.files)
        rev, af, log, _ = self.tilstand()
        self.assertEqual((rev, af), (2, UPLOADER))
        self.assertEqual([(x.sti, x.handling, json.loads(x.gammel_json)["tidsserie_id"], x.aendret_af, x.anmodning_id) for x in log],
                         [("tidsserie.varmelast", "ret", tid, UPLOADER, self.iid)])
        ts = self.app.db.t("Tidsserie")
        with self.app.db.laes() as cn:
            aktiv = cn.execute(ts.select().where(ts.c.vaerk_id == self.vid).where(ts.c.aktiv.is_(True))).first()
        self.assertEqual(VS.laes_gemt_serie(self.app.files, aktiv.sti)["2025-07-01T00:00:00Z"], "2.0")

    def test_k11_f1_scriptets_navn_fores_tilbage_til_vaerkets_objekt(self):
        """Codex' modprøve: halm__kedel. Før: et nyt, halvt objekt halm_kedel med 32.5 ved siden af den rigtige kedel."""
        self.app.db.engine.dispose()
        self.app = H.ny_app()
        blade = [("units.halm__kedel.type", '"biomass_boiler"'), ("units.halm__kedel.var_om", "30.0"), ("units.vp.var_om", "13.4")]
        self.vid = H.vaerk(self.app, "navne_test", blade=blade)
        self.lager = LL.LokalImportLager(self.app.db)
        self.iid = self.ny_import()
        self.blade = dict(blade)
        basis = {s.replace("units.halm__kedel.", "units.halm_kedel."): v for s, v in blade}
        res = self.lager.gem_revision({**self.imp, "id": self.iid}, self.rev(), self.laes({"units.halm_kedel.var_om": "32.5"}, basis=basis), {}, "log")
        rev, _, log, val = self.tilstand("units.halm__kedel.var_om")
        self.assertEqual((res["revision"], rev, val), (2, 2, "32.5"))
        self.assertIsNone(self.tilstand("units.halm_kedel.var_om")[3])
        self.assertEqual([x.sti for x in log], ["units.halm__kedel.var_om"])


if __name__ == "__main__":
    unittest.main()
