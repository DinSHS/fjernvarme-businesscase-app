"""Udvidede resultater (fase 2): el og balancering pr. enhed/marked + registerets etiketter.

Fixturen ``tests/data/andeby_bal/`` er wrapper-output fra
``andeby.yaml --data-source github --with-balancing --start 2026-01-05 --end 2026-01-16``
@ b49aeb0 / df-data 392992c (objektiv 3000362.9747427036, samme tal i Fabric).
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

HER = Path(__file__).resolve().parent
sys.path.insert(0, str(HER.parent))
from fjv import resultater as R  # noqa: E402

BAL = HER / "data" / "andeby_bal"
F1 = HER / "data" / "f1_andeby"
ETIKETTER = HER.parent.parent / "viden" / "resultat_etiketter.json"


def nt_dict(out):
    return {(r["gruppe"], r["objekt"], r["marked"], r["noegle"]): r["vaerdi"]
            for r in R.noegletal(out, R.register())}


class TestBalancering(unittest.TestCase):
    def setUp(self):
        self.out = R.Output(BAL)
        self.nt = nt_dict(self.out)
        self.man = self.out.manifest()["noegletal"]["balanceindtaegt_dkk"]

    def test_wrapperens_kontrol_er_nul(self):
        k = self.out.info["kontrol"]
        self.assertTrue(k["el"])
        for u, d in k["el"].items():
            self.assertLess(d["afvigelse"], 1e-6, u)
        self.assertTrue(k["balancering"])
        self.assertLess(max(k["balancering"].values()), 1e-6)

    def test_pr_marked_summerer_til_manifestets_netto_og_brutto(self):
        for mk in ("afrr", "mfrr"):
            kap = self.nt[("balancering", None, mk, "kapacitetsindtaegt_dkk")]
            net = self.nt[("balancering", None, mk, "aktivering_netto_dkk")]
            mod = self.nt[("balancering", None, mk, "forbrugsmodregning_dkk")]
            brutto_akt = self.nt[("balancering", None, mk, "aktivering_brutto_dkk")]
            self.assertAlmostEqual(round(kap + net), self.man[mk], delta=1)
            self.assertAlmostEqual(round(kap + net + mod), self.man["brutto"][mk], delta=1)
            self.assertAlmostEqual(net + mod, brutto_akt, places=4)

    def test_i_alt_paa_tvaers_af_markeder(self):
        for n in ("kapacitetsindtaegt_dkk", "aktivering_netto_dkk", "aktivering_brutto_dkk"):
            alt = self.nt[("balancering", None, None, n)]
            self.assertAlmostEqual(alt, self.nt[("balancering", None, "afrr", n)]
                                   + self.nt[("balancering", None, "mfrr", n)], places=6)
        # netto i alt = manifestets i_alt (kapacitet + netto aktivering over begge markeder)
        self.assertAlmostEqual(round(self.nt[("balancering", None, None, "kapacitetsindtaegt_dkk")]
                                     + self.nt[("balancering", None, None, "aktivering_netto_dkk")]),
                               self.man["i_alt"], delta=1)

    def test_pr_enhed_matcher_modellens_eget_sammendrag(self):
        summ = self.out.info["reserver"]
        for label, units in summ.items():
            mk = label.lower()
            for u, st in units.items():
                self.assertAlmostEqual(self.nt[("balancering", u, mk, "kapacitetsindtaegt_dkk")],
                                       st["capacity_revenue_dkk"], places=6)
                self.assertAlmostEqual(self.nt[("balancering", u, mk, "reserveret_mwh")],
                                       st["mwh_bid_year"], places=6)        # 1 h: Δt = 1
                self.assertAlmostEqual(self.nt[("balancering", u, mk, "budtimer")],
                                       st["hours_bidding"], places=6)
                self.assertAlmostEqual(self.nt[("balancering", u, mk, "reserveret_middel_mw")],
                                       st["mean_bid_mw"], places=9)
                self.assertAlmostEqual(self.nt[("balancering", u, mk, "aktiveret_mwh")],
                                       st["expected_activated_mwh"], places=6)

    def test_maaned_periode_er_lig_noegletal(self):
        md = {(r["maaned"], r["objekt"], r["noegle"]): r["vaerdi"]
              for r in R.maaneder(self.out, R.register())}
        self.assertAlmostEqual(md[("periode", "elkedel_ny", "afrr_kapacitetsindtaegt_dkk")],
                               self.nt[("balancering", "elkedel_ny", "afrr", "kapacitetsindtaegt_dkk")])
        self.assertAlmostEqual(md[("periode", "vp_luft_vand", "el_spot_dkk")],
                               self.nt[("el", "vp_luft_vand", None, "spot_dkk")])
        self.assertIn(("2026-01", "elkedel_ny", "mfrr_aktivering_brutto_dkk"), md)


class TestEl(unittest.TestCase):
    def test_el_led_og_i_alt(self):
        out = R.Output(F1)
        nt = nt_dict(out)
        enheder = ("vp_luft_vand", "elkedel_ny")
        for u in enheder:
            s, t, a = (nt[("el", u, None, k)] for k in ("spot_dkk", "tarif_dkk", "afgift_dkk"))
            self.assertAlmostEqual(s + t + a, nt[("el", u, None, "omkostning_dkk")], places=4)
            self.assertGreater(nt[("el", u, None, "forbrug_mwh")], 0)
        self.assertAlmostEqual(nt[("el", None, None, "forbrug_mwh")],
                               sum(nt[("el", u, None, "forbrug_mwh")] for u in enheder), places=6)
        # Kraftvarme: gasmotoren har elproduktion, ikke elforbrug
        self.assertIn(("el", "gasmotor", None, "produktion_mwh"), nt)
        self.assertNotIn(("el", "gasmotor", None, "forbrug_mwh"), nt)
        # Uden --with-balancing findes ingen balanceringsrækker pr. enhed
        self.assertFalse([k for k in nt if k[0] == "balancering" and k[1] is not None])


class TestRegister(unittest.TestCase):
    def test_alle_poster_har_etiket_og_kendt_kilde(self):
        reg = R.register()
        for post in reg["noegletal"] + reg["maaned"]:
            with self.subTest(n=post["noegle"]):
                self.assertTrue(post.get("etiket"))
                self.assertEqual(post.get("etiket_kilde"), "fv-ekspert")
        for post in reg["noegletal"]:
            self.assertIn(post["kilde"], reg["kilder"])

    def test_fv_ekspert_etiketter_er_ordret_ens(self):
        if not ETIKETTER.exists():
            self.skipTest(f"{ETIKETTER} findes ikke")
        e = json.loads(ETIKETTER.read_text(encoding="utf-8"))
        opslag = {}
        for sek in ("manifest_noegletal", "kpi_csv", "maaned"):
            for x in e[sek]:
                opslag[f"{sek}:{x.get('noegle') or x.get('kolonne')}"] = x
        for k, x in e.get("maaleregister_noegler", {}).items():
            if not k.startswith("_"):
                opslag[f"maaleregister_noegler:{k}"] = x
        reg = R.register()
        for post in reg["noegletal"] + reg["maaned"]:
            self.assertEqual(post.get("etiket_kilde"), "fv-ekspert", post["noegle"])
            if post.get("etiket_kilde") != "fv-ekspert":
                continue
            with self.subTest(ref=post["etiket_ref"]):
                ref = opslag[post["etiket_ref"]]
                self.assertEqual(post["etiket"], ref["etiket"])
                if "forklaring" in post and ref.get("forklaring"):
                    self.assertEqual(post["forklaring"], ref["forklaring"])


if __name__ == "__main__":
    unittest.main()
