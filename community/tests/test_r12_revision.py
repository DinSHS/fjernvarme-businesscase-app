"""Runde 12 i den lokale udgave: genupload af et eksporteret værksark som ny revision.

* ``uploadVaerksark`` med basis (funktionskaldet som fra browseren): begge ark gemmes, importen bindes til værket, og
  et værk, der er ændret siden eksporten, afvises med det samme — intet gemmes.
* ``LokalImportLager.gem_revision`` (SQLite): samme regler som Fabric (``fjv.vaerksark.gem_revision``) — kun
  forskellen gemmes, i uploaderens navn, med revisionslog; konflikt ruller alt tilbage.
"""

from __future__ import annotations

import base64
import hashlib
import json
import unittest
from pathlib import Path

import hjaelp as H  # noqa: F401  (sætter miljøet op før fjv importeres)
from fjernvarme_app import funktioner as F
from fjernvarme_app import lokal_lager as LL
from fjernvarme_app.typer import nu, ny_uuid
from fjv import vaerksark as VS

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


class TestGemRevision(unittest.TestCase):
    def setUp(self):
        self.app = H.ny_app()
        self.vid = H.vaerk(self.app, "rev_g")
        self.lager = LL.LokalImportLager(self.app.db)
        self.iid = ny_uuid()
        with self.app.db.skriv() as cn:
            cn.execute(self.app.db.t("Vaerksarkimport").insert().values(
                id=self.iid, filnavn="rev_g_rev1.xlsx", sti=f"Files/fjv/uploads/{self.iid}.xlsx", status="koerer",
                uploadet_af="bruger@lokal", uploadet=nu()))
        p = self.app.db.t("VaerkParameter")
        with self.app.db.laes() as cn:
            self.blade = {r.sti: r.vaerdi_json for r in cn.execute(p.select().where(p.c.vaerk_id == self.vid)).fetchall()}
        self.sti = next(s for s in self.blade if s.startswith("units.") and s.endswith(".var_om"))
        self.imp = {"id": self.iid, "filnavn": "rev_g_rev1.xlsx", "uploadet_af": "bruger@lokal"}

    def rev(self, forventet=1):
        return {"vaerk_id": self.vid, "forventet_revision": forventet, "basis_sha256": "a" * 64}

    def tilstand(self):
        v, lg, p = self.app.db.t("Vaerk"), self.app.db.t("Aendringslog"), self.app.db.t("VaerkParameter")
        with self.app.db.laes() as cn:
            vr = cn.execute(v.select().where(v.c.id == self.vid)).first()
            log = cn.execute(lg.select().where(lg.c.vaerk_id == self.vid).where(lg.c.revision > 1)).fetchall()
            val = cn.execute(p.select().where(p.c.vaerk_id == self.vid).where(p.c.sti == self.sti)).first().vaerdi_json
        return vr.revision, vr.aendret_af, log, val

    def test_aendringen_gemmes_som_revision_2_i_uploaderens_navn(self):
        res = self.lager.gem_revision(self.imp, self.rev(), [{"sti": self.sti, "handling": "ret", "gammel_json": self.blade[self.sti], "ny_json": "99.5"}], {}, "log")
        rev, af, log, val = self.tilstand()
        self.assertEqual((res["revision"], rev, af, val), (2, 2, "bruger@lokal", "99.5"))
        self.assertEqual([(x.sti, x.handling, x.ny_json, x.anmodning_id) for x in log], [(self.sti, "ret", "99.5", self.iid)])

    def test_ingen_aendringer_intet_gemt(self):
        res = self.lager.gem_revision(self.imp, self.rev(), [], {}, "log")
        self.assertIsNone(res["revision"])
        self.assertEqual(self.tilstand()[0], 1)
        self.assertTrue(res["log"].startswith("Ingen ændringer"))

    def test_konflikt_ruller_alt_tilbage(self):
        with self.assertRaisesRegex(VS.ArkFejl, "revision 0 -> 1"):
            self.lager.gem_revision(self.imp, self.rev(0), [{"sti": self.sti, "handling": "ret", "gammel_json": "1", "ny_json": "99.5"}], {}, "log")
        rev, _, log, val = self.tilstand()
        self.assertEqual((rev, log, val), (1, [], self.blade[self.sti]))


if __name__ == "__main__":
    unittest.main()
