"""Rundtur og afvisninger for fjv.flad (KONTRAKT v2 §3.2).

Kører mod modelrepoets ``cases/*.yaml`` i den udpakkede zip @ MODEL_COMMIT
(``_lokal/Files/fjv/kode/<sha>/cases``) eller ``FJV_CASES``. Mangler den, springes
rundturstestene over med én besked — kantproberne kører altid.
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

import yaml

HER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HER))
from fjv import konstanter as K  # noqa: E402
from fjv.flad import FladFejl, afflad, flad, ligner_strengt  # noqa: E402

CASES = Path(os.environ.get("FJV_CASES") or
             HER / "_lokal" / "Files" / K.REL_KODE / K.MODEL_COMMIT / "cases")


def _filer():
    return sorted(p for p in CASES.iterdir() if p.suffix == ".yaml") if CASES.exists() else []


class TestRundtur(unittest.TestCase):
    def setUp(self):
        if not _filer():
            self.skipTest(f"ingen cases i {CASES}")

    def test_alle_cases_rundtur_typestrengt(self):
        for f in _filer():
            with self.subTest(fil=f.name):
                tekst = f.read_text(encoding="utf-8")
                params = flad(tekst)
                self.assertTrue(params)
                forskel = ligner_strengt(afflad(params), yaml.safe_load(tekst))
                self.assertIsNone(forskel, f"{f.name}: {forskel}")

    def test_rundtur_via_json_som_databasen_ser_den(self):
        # Rækker der har været gennem DB-laget er dicts, ikke dataclasses.
        f = CASES / "andeby.yaml"
        tekst = f.read_text(encoding="utf-8")
        rækker = [json.loads(json.dumps(p.dict(), ensure_ascii=False)) for p in flad(tekst)]
        self.assertIsNone(ligner_strengt(afflad(rækker), yaml.safe_load(tekst)))

    def test_andeby_konkrete_blade(self):
        p = {x.sti: x for x in flad((CASES / "andeby.yaml").read_text(encoding="utf-8"))}
        # int forbliver int, float forbliver float
        self.assertEqual(p["heat_load_params.thermal_inertia_hours"].vaerdi_json, "24")
        self.assertEqual(p["heat_load_params.t_ref"].vaerdi_json, "15.0")
        # null bevares (afledes af modellen bagefter)
        self.assertEqual(p["storage.tank_lav.e_max_mwh"].vaerdi_json, "null")
        # lister af dicts er ét blad
        pts = json.loads(p["units.vp_luft_vand.cop_curve.points"].vaerdi_json)
        self.assertEqual(len(pts), 3)
        self.assertIsInstance(pts[0]["t_ambient"], float)
        # punktkommentarer med indeks
        self.assertIn("[1] COP 2.91", p["units.vp_luft_vand.cop_curve.points"].kommentar)
        # objekt og sektion
        self.assertEqual(p["units.halmkedel.p_max_heat"].objekt, "halmkedel")
        self.assertEqual(p["units.halmkedel.p_max_heat"].sektion, "units")
        self.assertIsNone(p["time.start"].objekt)
        # bekræft: inline på bladet
        self.assertTrue(p["prices.co2_eua.value"].bekraeft)
        # bekræft: arvet fra sektionsoverskriften "PRISER OG AFGIFTER [BEKRÆFT ..."
        self.assertTrue(p["prices.straw.value"].bekraeft)
        # en inline-markør på ét blad smitter ikke resten af sektionen
        self.assertTrue(p["units.gasmotor.alpha"].bekraeft)
        self.assertFalse(p["units.halmkedel.p_max_heat"].bekraeft)
        self.assertEqual(sum(v.bekraeft for k, v in p.items() if k.startswith("units.")), 3)
        # ... men ikke fra filens forklarende hoved (adskilt af tom linje)
        self.assertFalse(p["meta.case_name"].bekraeft)
        # kommentarblok over bladet
        self.assertIn("to afgiftsår", p["meta.tax_year"].kommentar)
        self.assertTrue(p["meta.tax_year"].bekraeft)
        # rækkefølge = linjenummer, stigende i filens orden
        self.assertLess(p["meta.case_name"].raekkefoelge, p["time.start"].raekkefoelge)
        # en blokskalar (description: >) er ét blad uden kommentarlinjer
        self.assertIsNone(p["meta.description"].kommentar)

    def test_billund_parentesmarkoer(self):
        p = {x.sti: x for x in flad((CASES / "billund_sporA.yaml").read_text(encoding="utf-8"))}
        self.assertTrue(any(v.bekraeft for k, v in p.items() if k.startswith("prices.")))

    def test_mw_by_month_noegler_med_bindestreg(self):
        p = {x.sti for x in flad((CASES / "billund_sporB.yaml").read_text(encoding="utf-8"))}
        self.assertTrue(any(".mw_by_month." in s for s in p))


class TestKanter(unittest.TestCase):
    def rt(self, tekst):
        return ligner_strengt(afflad(flad(tekst)), yaml.safe_load(tekst))

    def test_tom_dict_er_et_blad(self):
        params = flad("a: {}\nb:\n  c: 1\n")
        self.assertEqual([(p.sti, p.vaerdi_json) for p in params], [("a", "{}"), ("b.c", "1")])
        self.assertIsNone(self.rt("a: {}\nb:\n  c: 1\n"))

    def test_typer_bevares(self):
        t = 'a: "001"\nb: null\nc: [1, 1.0, {x: "2"}, true]\nd: 1.0e-6\ne: -0.0\n'
        self.assertIsNone(self.rt(t))

    def test_anker_udfoldes(self):
        t = "a: &x {p: 1, q: [1, 2]}\nb: *x\n"
        params = flad(t)
        self.assertEqual(sorted(p.sti for p in params), ["a.p", "a.q", "b.p", "b.q"])
        self.assertIsNone(self.rt(t))

    def test_afvisninger(self):
        for tekst, ord_ in [
            ("a.b: 1\n", "'.'"),
            ("a: 1\na: 2\n", "to gange"),
            ("1: x\n", "streng"),
            ("a: 2026-01-05\n", "dato"),
            ("a: .nan\n", "endelig"),
            ("a: .inf\n", "endelig"),
            ("x: &a {p: 1}\ny:\n  <<: *a\n  q: 2\n", "merge"),
            ("a: !!binary aGVq\n", "JSON"),
            ("- 1\n- 2\n", "mapping"),
        ]:
            with self.subTest(tekst=tekst):
                with self.assertRaises(FladFejl) as cm:
                    flad(tekst)
                self.assertIn(ord_, str(cm.exception))

    def test_cyklisk_alias_afvises(self):
        with self.assertRaises(FladFejl):
            flad("a: &x [1, *x]\n")

    def test_for_lang_vaerdi_afvises(self):
        with self.assertRaises(FladFejl) as cm:
            flad("a: " + json.dumps("x" * 4100) + "\n")
        self.assertIn("4000", str(cm.exception))

    def test_ligner_strengt_skelner_int_float_bool(self):
        self.assertIsNotNone(ligner_strengt({"a": 1}, {"a": 1.0}))
        self.assertIsNotNone(ligner_strengt({"a": 1}, {"a": True}))
        self.assertIsNone(ligner_strengt({"a": [1, {"b": None}]}, {"a": [1, {"b": None}]}))

    def test_afflad_konflikt(self):
        with self.assertRaises(FladFejl):
            afflad([{"sti": "a", "vaerdi_json": "1"}, {"sti": "a.b", "vaerdi_json": "2"}])
        with self.assertRaises(FladFejl):
            afflad([{"sti": "a", "vaerdi_json": "1"}, {"sti": "a", "vaerdi_json": "2"}])

    def test_inline_kommentar_i_streng_er_ikke_kommentar(self):
        p = flad('a: "x # ikke kommentar"  # rigtig\n')
        self.assertEqual(p[0].kommentar, "rigtig")
        self.assertEqual(json.loads(p[0].vaerdi_json), "x # ikke kommentar")


if __name__ == "__main__":
    unittest.main()
