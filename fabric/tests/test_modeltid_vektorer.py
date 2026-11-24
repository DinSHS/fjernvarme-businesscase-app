"""Arbejderens tidsgrammatik som fælles vektorer (tredje rettelsesrunde i runde 15, P3-1).

Arbejderen læser værkets ``time.start``/``time.end`` med ``datetime.fromisoformat`` (``byg_case._modeltid``; modellen
bruger samme parser i ``src/config.py``). Analysers sammenligning udleder kørslens effektive periode af det frosne
input i browseren (``app/src/sider/analyser/beregn.ts › effektivPeriode``) og havde sin egen grammatik: ``+00`` blev
afvist, og 30. februar blev til 2. marts. ``skema/vektorer/modeltid/former.json`` er MÅLT her - hver form, og hvad
arbejderen svarer - og browserens spec (``scenarier/__tests__/r15c_tidsgrammatik.spec.ts``) kræver samme udfald.

Skriv vektorerne igen efter en ændring af formerne eller af ``_modeltid``::

    FJV_SKRIV_VEKTORER=1 python -m unittest tests.test_modeltid_vektorer
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

HER = Path(__file__).resolve().parent
sys.path.insert(0, str(HER.parent))
from fjv.byg_case import InputFejl, _effektiv_tid  # noqa: E402

VEKTORER = HER.parents[1] / "skema" / "vektorer" / "modeltid" / "former.json"


def maal(tid: str) -> str | None:
    """Tidspunktet, som arbejderen læser det (ISO UTC), eller ``None``, når arbejderen afviser formen. Samme tekst
    som start og slut: én time, så kun grammatikken afgør svaret - ikke periodens længde."""
    try:
        return _effektiv_tid({"time": {"start": tid, "end": tid, "resolution": "1h"}}, None, None)[0]
    except InputFejl:
        return None


class Vektorer(unittest.TestCase):
    def test_arbejderen_svarer_som_vektorerne(self):
        fil = json.loads(VEKTORER.read_text(encoding="utf-8"))
        if os.environ.get("FJV_SKRIV_VEKTORER") == "1":
            for t in fil["tilfaelde"]:
                t["ud"] = maal(t["tid"])
            VEKTORER.write_text(json.dumps(fil, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
        tilfaelde = fil["tilfaelde"]
        self.assertGreaterEqual(len(tilfaelde), 30)
        for t in tilfaelde:
            with self.subTest(tid=t["tid"]):
                self.assertEqual(maal(t["tid"]), t["ud"])
        # De omstridte former fra efterprøvningen skal stå her - ellers binder filen ikke det, den er til for.
        ud = {t["tid"]: t["ud"] for t in tilfaelde}
        self.assertEqual(ud["2026-01-05T00:00:00+00"], "2026-01-05T00:00:00Z")
        self.assertIsNone(ud["2026-02-30T00:00:00Z"])
        self.assertIsNone(ud["2026-02-30"])


if __name__ == "__main__":
    unittest.main()
