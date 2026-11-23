"""Tredje rettelsesrunde i runde 15, P2-3 — det udtrykkelige syntesevalg fryses som ``"syntetisk"``.

Appvejen (``logik.byg_frosset_input``, porten af ``bygFrossetInput``) frøs før ingen række for et scenarie, der
udtrykkeligt valgte modellens syntese. Den fryser nu ``_koersel.tidsserie.varmelast = "syntetisk"`` — præcis den række,
den manuelle vej (``fjv.byg_case.raekker_fra_vaerk``) altid har skrevet. Testene her binder de tre led, de fælles
vektorer ikke dækker:

* arbejderen (``fjv.byg_case.byg``) accepterer rækken fra appvejen og læser den som "ingen tidsserie";
* hashen, den betroede logik gemmer, er den, arbejderen regner af de samme rækker (ellers afviser den kørslen);
* arkivets tjek (``logik.arkiv.frosne_tidsserier``) kræver ingen tidsserie for rækken.

Kør: ``cd community && python -m unittest discover -s tests -t tests`` (kræver sqlalchemy).
"""

from __future__ import annotations

import unittest

import hjaelp as H
from fjernvarme_app.logik import arkiv as A
from fjernvarme_app.logik import regler as R
from fjv import byg_case as BC

SHA = "a" * 64
SERIE = {"id": "11111111-1111-4111-8111-111111111111", "rolle": "varmelast", "navn": "Målt", "sha256": SHA,
         "sti": f"fjv/tidsserier/testvaerk/{SHA}.csv", "oploesning": "1h", "start": "2020-01-01T00:00:00.000Z",
         "slut": "2030-12-31T23:00:00.000Z", "aktiv": True}
SYNTESE = {"type": "set", "sti": "_tidsserie.varmelast", "vaerdi_json": '"syntetisk"', "raekkefoelge": 1}
PINS = {"model_commit": "939228aa048563c8498382a79d207c8b03fbda57", "data_commit": "106b9fce9a2e3610090b1a542559024056449b88"}
STI = "_koersel.tidsserie.varmelast"


def _params():
    return [{"sti": s, "vaerdi_json": v} for s, v in H.guide_blade()]


def _scenarie(**o):
    return {"periode_start": "2026-01-05", "periode_slut": "2026-01-06", "med_balancering": False, **o}


def _frosset(raekker):
    return next((r for r in raekker if r["sti"] == STI), None)


class Appvejen(unittest.TestCase):
    def test_valget_fryses_med_den_manuelle_vejs_raekke(self):
        f = R.byg_frosset_input(_params(), [SYNTESE], _scenarie(), PINS, [SERIE])
        self.assertEqual(_frosset(f["raekker"]), {"kilde": "scenarie", "sti": STI, "vaerdi_json": '"syntetisk"'})
        manuel = BC.raekker_fra_vaerk(_params(), [], {**_scenarie(), **PINS, "tidsserier": {"varmelast": "syntetisk"}})
        self.assertEqual(_frosset(manuel), _frosset(f["raekker"]))

    def test_arbejderen_accepterer_raekken_og_bruger_ingen_tidsserie(self):
        f = R.byg_frosset_input(_params(), [SYNTESE], _scenarie(), PINS, [SERIE])
        plan = BC.byg(f["raekker"])
        self.assertEqual(plan.tidsserier, {})
        self.assertNotIn("--heat-csv", plan.cli)
        # Arbejderen afviser en kørsel, hvis hash ikke er den, den selv regner af rækkerne.
        self.assertEqual(BC.input_hash(f["raekker"]), f["hash"])

    def test_uden_valg_fryses_den_aktive_serie_som_foer(self):
        f = R.byg_frosset_input(_params(), [], _scenarie(), PINS, [SERIE])
        self.assertEqual(_frosset(f["raekker"])["vaerdi_json"], '{"id":"11111111-1111-4111-8111-111111111111","sha256":"' + SHA + '"}')
        self.assertEqual(BC.byg(f["raekker"]).tidsserier, {"varmelast": {"id": SERIE["id"], "sha256": SHA}})

    def test_sammen_med_en_repo_fil_fryses_valget_ikke(self):
        f = R.byg_frosset_input(_params(), [SYNTESE], _scenarie(heat_csv="billund_abvaerk_hourly.csv"), PINS, [SERIE])
        self.assertIsNone(_frosset(f["raekker"]))
        self.assertIn("--heat-csv", BC.byg(f["raekker"]).cli)


class Arkivet(unittest.TestCase):
    def test_syntetisk_og_null_er_ingen_tidsserie(self):
        rad = lambda rolle, v: {"kilde": "scenarie", "sti": f"_koersel.tidsserie.{rolle}", "vaerdi_json": v}  # noqa: E731
        self.assertEqual(A.frosne_tidsserier([rad("varmelast", '"syntetisk"'), rad("solprofil", "null")]), [])
        for forkert in (rad("solprofil", '"syntetisk"'), rad("varmelast", '"maalt"'), rad("varmelast", '{"id":"x"}'), rad("varmelast", "12")):
            with self.assertRaises(A.ArkivAfvisning):
                A.frosne_tidsserier([forkert])


if __name__ == "__main__":
    unittest.main()
