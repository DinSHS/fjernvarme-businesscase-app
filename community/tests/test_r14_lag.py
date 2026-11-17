"""Runde 14 i den lokale udgave: appens egne faner i værksarket og revisionssporet (SQLite).

Importens regler er fælles (``fjv.arklag``, ``fjv.vaerksark`` — prøvet i ``fabric/tests/test_arklag.py``). Her prøves
det, der er den lokale udgaves eget: ``LokalImportLager`` skal skrive samme spor som Fabric-lageret —

* et nyt værk fra et ark med appens faner er revision 2: revision 1 er modelscriptets læsning (ét ``opret`` pr. blad),
  revision 2 fanernes ændringer med scriptets værdi som ``gammel_json``, så sporet viser, hvad der kom fra fanerne;
* hvert blad, fanerne har sat, bærer kilden som kommentar (``VaerkParameter.kommentar``);
* et ark uden fanerne giver et værk i revision 1 med præcis scriptets blade, som før.
"""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

import hjaelp as H  # noqa: F401  (sætter miljøet op før fjv importeres)
from fjernvarme_app import lokal_lager as LL
from fjernvarme_app.typer import nu, ny_uuid
from fjv import arklag as LAG
from fjv import vaerksark as VS
from fjv.flad import Parameter

# Samme lille xlsx-skriver som fabric-testene (kun standardbiblioteket).
_spec = importlib.util.spec_from_file_location("arkhjaelp", H.HER.parent.parent / "fabric" / "tests" / "arkhjaelp.py")
arkhjaelp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(arkhjaelp)

UPLOADER = "ingenioer@example.org"

SCRIPT = {
    "meta.case_name": '"lag_t"', "meta.titel": '"Lag T"',
    "units.kedel.enabled": "true", "units.kedel.type": '"gas_boiler"', "units.kedel.p_max_heat": "12.0",
    "units.kedel.uc_enabled": "true", "units.kedel.initial_status": "0", "units.kedel.co2_emissions_per_mwh_fuel": "0.2",
    "storage.tank.enabled": "true", "storage.tank.e_initial_mwh": "95.9", "storage.tank.self_discharge_per_hour": "0.0005",
    "solver.mip_rel_gap": "0.001",
}

START = {
    "A1": "Start og drift",
    "A4": "navn", "B4": "i drift", "C4": "tændt ved start", "D4": "CO2",
    "A5": "sti i modellen", "B5": "units.{enhed}.enabled", "C5": "units.{enhed}.initial_status",
    "D5": "units.{enhed}.co2_emissions_per_mwh_fuel",
    "A6": "kedel", "B6": "ja", "C6": "ja", "D6": 0.2,
}
BALANCE = {
    "A4": "felt", "B4": "værdi", "C4": "enhed", "D4": "forklaring", "E4": "sti i modellen",
    "A5": "Samlet prækvalifikation", "B5": 14, "E5": "balancing.ancillary_caps.total_mw",
}
OEVRIGE = {
    "A4": "sti", "B4": "værdi", "C4": "kun hvis modelscriptet giver",
    "A5": "solver.mip_rel_gap", "B5": "(findes ikke)", "C5": 0.001,
}


def konvertering(kode: str) -> VS.Konvertering:
    ps = [Parameter(s, j, s.split(".")[0], s.split(".")[1] if s.split(".")[0] in ("units", "storage") else None,
                    None, False, i) for i, (s, j) in enumerate(SCRIPT.items(), start=1)]
    return VS.Konvertering(kode, "Lag T", None, "meta: {}\n", ps)


class TestNytVaerkMedAppensFaner(unittest.TestCase):
    def setUp(self):
        self.app = H.ny_app()
        self.lager = LL.LokalImportLager(self.app.db)
        self.tmp = Path(tempfile.mkdtemp(prefix="fjv_r14_"))

    def tearDown(self):
        self.app.db.engine.dispose()

    def importer(self, kode: str, **faner) -> dict:
        iid = ny_uuid()
        with self.app.db.skriv() as cn:
            cn.execute(self.app.db.t("Vaerksarkimport").insert().values(
                id=iid, filnavn=f"{kode}.xlsx", sti=f"Files/fjv/uploads/{iid}.xlsx", status="koerer",
                uploadet_af=UPLOADER, uploadet=nu()))
        ark = arkhjaelp.skriv_xlsx(self.tmp / f"{kode}.xlsx", {"Anlaeg": {"A1": "x"}, **faner})
        k = konvertering(kode)
        VS.laeg_lag(k, ark)
        return self.lager.gem_vaerk({"id": iid, "filnavn": f"{kode}.xlsx", "uploadet_af": UPLOADER}, k, "0" * 40, "",
                                    files=str(self.app.files))

    def laes(self, vid: str):
        v, p, lg = self.app.db.t("Vaerk"), self.app.db.t("VaerkParameter"), self.app.db.t("Aendringslog")
        with self.app.db.laes() as cn:
            return (cn.execute(v.select().where(v.c.id == vid)).first(),
                    {r.sti: r for r in cn.execute(p.select().where(p.c.vaerk_id == vid)).fetchall()},
                    cn.execute(lg.select().where(lg.c.vaerk_id == vid)).fetchall())

    def test_revision_2_viser_hvad_der_kom_fra_appens_faner(self):
        res = self.importer("lag_a", **{LAG.START_OG_DRIFT: START, LAG.BALANCEMARKED: BALANCE, LAG.OEVRIGE: OEVRIGE})
        v, blade, log = self.laes(res["vaerk_id"])
        self.assertEqual((res["revision"], int(v.revision)), (2, 2))
        et = {r.sti: (r.handling, r.gammel_json, r.ny_json) for r in log if int(r.revision) == 1}
        to = {r.sti: (r.handling, r.gammel_json, r.ny_json) for r in log if int(r.revision) == 2}
        # Revision 1 er modelscriptets læsning, urørt; revision 2 er fanernes ændringer oven på den.
        self.assertEqual({s: n for s, (_h, _g, n) in et.items()}, SCRIPT)
        self.assertTrue(all(h == "opret" and g is None for h, g, _n in et.values()))
        self.assertEqual(to, {"units.kedel.initial_status": ("ret", "0", "1"),
                              "balancing.ancillary_caps.total_mw": ("opret", None, "14.0"),
                              "solver.mip_rel_gap": ("slet", "0.001", None)})
        self.assertTrue(all(r.aendret_af == UPLOADER for r in log))
        # Værket er det færdige: scriptets læsning + laget.
        self.assertEqual({s: r.vaerdi_json for s, r in blade.items()},
                         {**{s: j for s, j in SCRIPT.items() if s != "solver.mip_rel_gap"},
                          "units.kedel.initial_status": "1", "balancing.ancillary_caps.total_mw": "14.0"})
        # Kilden står på bladet.
        self.assertIn("Fra appens fane «Start og drift» i værksarket (celle C6), ikke fra modelscriptet, som gav 0",
                      blade["units.kedel.initial_status"].kommentar)
        self.assertIn("«Balancemarked»", blade["balancing.ancillary_caps.total_mw"].kommentar)
        self.assertIsNone(blade["units.kedel.p_max_heat"].kommentar)
        # En celle med scriptets egen værdi (CO2-faktor 0,2) er ikke en ændring og får ingen kommentar.
        self.assertIsNone(blade["units.kedel.co2_emissions_per_mwh_fuel"].kommentar)
        self.assertIn("som revision 2: revision 1 er modelscriptets læsning af arket, revision 2 appens egne faner", res["log"])

    def test_et_ark_uden_appens_faner_er_revision_1_som_foer(self):
        res = self.importer("lag_b")
        v, blade, log = self.laes(res["vaerk_id"])
        self.assertEqual((res["revision"], int(v.revision)), (1, 1))
        self.assertEqual({s: r.vaerdi_json for s, r in blade.items()}, SCRIPT)
        self.assertEqual({int(r.revision) for r in log}, {1})
        self.assertEqual(len(log), len(SCRIPT))
        self.assertNotIn("appens egne faner", res["log"])


if __name__ == "__main__":
    unittest.main()
