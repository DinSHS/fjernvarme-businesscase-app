"""De fælles testvektorer (brief 21 pkt. 4): Python-porten skal give PRÆCIS TS' udfald.

Vektorerne er genereret ved at køre TypeScript-implementeringen (``skema/vektorer/generer.mts``, ét hjem for
begge udgaver — fv-skema ejer mappen; generér med ``cd app && npx tsx ../skema/vektorer/generer.mts``). For hvert tilfælde:
samme resultat (tal sammenlignes som tal, NaN = NaN), eller en ``Afvisning`` med den IDENTISKE danske tekst,
eller en programfejl (ikke-``Afvisning``) hvor TS havde en.

Kendte, bevidste afvigelser står i ``KENDTE_AFVIGELSER`` med begrundelse — en ny afvigelse er en fejl.
Der er ÉN mappe og ingen tavs reserve: to kopier drev fra hinanden 2026-10-16 (en test læste den gamle).

    cd community && python -m unittest discover -s fjernvarme_app/logik/tests -t .
"""

from __future__ import annotations

import base64
import hashlib
import json
import math
import struct
import sys
import unittest
from pathlib import Path

sys.stdout.reconfigure(errors="replace")

from fjernvarme_app.logik import jsjson as J  # noqa: E402
from fjernvarme_app.logik import regler as R  # noqa: E402
from fjernvarme_app.logik import tidsserie as T  # noqa: E402
from fjernvarme_app.logik import vaerksark as V  # noqa: E402
from fjernvarme_app.logik import zipkontrol as Z  # noqa: E402

HER = Path(__file__).resolve().parent
ROD = HER.parents[3]
VEKTORER = ROD / "skema" / "vektorer"

#: (gruppe, navn) -> begrundelse. Python-udfaldet for disse er testet SÆRSKILT nedenfor.
KENDTE_AFVIGELSER = {
    ("byg_frosset_input", "værk time.start på engelsk (V8-legacy)"):
        "V8's ældre Date.parse læser 'January 5, 2026'; porten afviser (som modellens egen læser ville). "
        "Afvisningen kommer FØR kørslen i stedet for i arbejderen.",
}


def _dekod(o: dict):
    if len(o) == 1:
        (k, v), = o.items()
        if k == "$tal":
            return {"Infinity": math.inf, "-Infinity": -math.inf, "NaN": math.nan, "-0": -0.0}[v]
        if k == "$bits":
            return struct.unpack(">d", bytes.fromhex(v))[0]
        if k in ("$b64", "$bytes"):
            return base64.b64decode(v)
        if k == "$fil":
            return (ROD / v).read_bytes()
        if k == "$fyld":
            return b"a" * v
        if k == "$nul":
            return bytes(v)
        if k == "$b64af":
            return base64.b64encode(v).decode("ascii")
        if k == "$map":
            return {a: b for a, b in v}
    return o


def laes(gruppe: str) -> dict:
    p = VEKTORER / f"{gruppe}.json"
    if not p.is_file():
        raise FileNotFoundError(f"{p} mangler - generér: cd app && npx tsx ../skema/vektorer/generer.mts")
    return json.loads(p.read_text(encoding="utf-8"), object_hook=_dekod)


def lig(a, b) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if J.er_tal(a) and J.er_tal(b):
        return (math.isnan(a) and math.isnan(b)) or float(a) == float(b)
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(lig(a[k], b[k]) for k in a)
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(lig(x, y) for x, y in zip(a, b))
    return type(a) is type(b) and a == b


def koer(f):
    """Python-udfaldet i vektorens form."""
    try:
        return {"ud": f()}
    except R.Afvisning as e:
        return {"afvisning": str(e)}
    except T.ForLangRaekke as e:
        return {"fejl": str(e), "fejltype": "ForLangRække", "positioner": e.positioner}
    except Exception as e:                                 # noqa: BLE001 — en programfejl er et udfald
        return {"fejl": str(e), "fejltype": type(e).__name__}


def samme(ts: dict, py: dict) -> str | None:
    """None = samme udfald; ellers en forklaring."""
    if "afvisning" in ts:
        if py.get("afvisning") == ts["afvisning"]:
            return None
        return f"TS afviste {ts['afvisning']!r}, Python gav {py!r}"
    if "fejl" in ts:
        if "fejl" not in py:
            return f"TS: programfejl {ts['fejltype']}: {ts['fejl']!r}; Python gav {py!r}"
        if ts.get("fejltype") == "ForLangRække" and (py.get("fejltype") != "ForLangRække" or py["positioner"] != ts["positioner"]
                                                    or py["fejl"] != ts["fejl"]):
            return f"ForLangRække: TS {ts!r}, Python {py!r}"
        return None
    if "ud" not in py:
        return f"TS gav {str(ts['ud'])[:300]}, Python {py!r}"
    if not lig(ts["ud"], py["ud"]):
        return f"forskelligt resultat:\n  TS     {str(ts['ud'])[:600]}\n  Python {str(py['ud'])[:600]}"
    return None


# ------------------------------------------------------------------ hvordan hver gruppe kaldes


def _frosset(i):
    r = R.byg_frosset_input(i["params"], i["aendringer"], i["scenarie"], i["pins"], i["tidsserier"])
    return {"rækker": r["raekker"], "hash": r["hash"], "effektiv": r["effektiv"]}


def _upload(i):
    r = T.valider_upload(i["bytes"], i["rolle"], i["valg"], i["vaerk"])
    n = r["normaliseret"]
    return {"status": r["status"], "normaliseret_sha256": None if n is None else hashlib.sha256(n.encode("utf-8")).hexdigest(),
            "validering": r["validering"]}


KALD = {
    "input_hash": lambda i: R.input_hash(i["raekker"]),
    "frossen_tidsserie": lambda i: {"sti": [R.frossen_sti(r) for r in R.FROSNE_ROLLER], "vaerdi": R.frossen_tidsserie(i["s"])},
    "periode_doegn": lambda i: R.periode_doegn(i["scenarie"], i["vaerdier"]),
    "effektiv_akse": lambda i: R.effektiv_akse(i["scenarie"], i["periode"]),
    "byg_frosset_input": _frosset,
    "laes_anmodning": lambda i: R.laes_anmodning(i["aendringer_json"]),
    "planlaeg_parametre": lambda i: R.planlaeg_parametre(dict(i["nuvaerende"]), i["aendringer"]),
    "saml_nyt_vaerk": lambda i: R.saml_nyt_vaerk(i["dele"], i["antal"], i["udkast"]),
    "tjek_modelkrav": lambda i: R.tjek_modelkrav(i["blade"]),
    "gyldig_sti": lambda i: R.gyldig_sti(i["sti"]),
    "ikke_endelig": lambda i: R.ikke_endelig(J.parse(i["json"])),
    "vaerk_trae": lambda i: T.vaerk_trae(i["params"]),
    "validering_json": lambda i: T.validering_json(i["v"]),
    "taet_raekke": lambda i: T.taet_raekke(i["normaliseret"], i["vindue"]),
    "valider_upload": _upload,
    "tjek_zip": lambda i: Z.tjek_zip(i["bytes"]),
    "iso": lambda i: J.iso(i["ms"]),
    "upload_validering_json": lambda i: T.validering_json(T.valider_upload(i["bytes"], i["rolle"], i["valg"], None)["validering"]),
}


class OptagendeDeps:
    """Samme falske database som generer.mts' — optager kaldssporet i samme form."""

    def __init__(self, s: dict):
        self.s, self.spor = s, []
        job = s.get("job")
        self.start_job = None if job is None else self._start

    def laes_anmodning(self, id):
        self.spor.append(["laes_anmodning", id])
        return self.s.get("anmodning")

    def laes_import(self, id):
        self.spor.append(["laes_import", id])
        return self.s.get("importEfter")

    def skriv_fil(self, sti, data):
        self.spor.append(["skriv_fil", sti, len(data), hashlib.sha256(data).hexdigest()])
        if self.s.get("skrivKaster"):
            raise OSError("disk fuld")

    def opret_import(self, a, upload, sti, log):
        self.spor.append(["opret_import", a["id"], upload, sti, log])
        return self.s.get("opret") or "oprettet"

    def reserver_jobstart(self, id):
        self.spor.append(["reserver_jobstart", id])
        return bool(self.s.get("reserver"))

    def bind_job(self, id, job_id, log):
        self.spor.append(["bind_job", id, job_id, log])

    def _start(self, id):
        self.spor.append(["start_job", id])
        return self.s["job"]

    def afvis_anmodning(self, id, tekst):
        self.spor.append(["afvis_anmodning", id, tekst])


class TestVektorer(unittest.TestCase):
    maxDiff = None

    def _gruppe(self, gruppe: str, kald):
        data = laes(gruppe)
        fejl = []
        for t in data["tilfaelde"]:
            if (gruppe, t["navn"]) in KENDTE_AFVIGELSER:
                continue
            forskel = samme(t, koer(lambda: kald(t["input"])))
            if forskel:
                fejl.append(f"[{t['navn']}] {forskel}")
        self.assertFalse(fejl, f"{len(fejl)} af {len(data['tilfaelde'])} {gruppe}-vektorer afviger:\n" + "\n".join(fejl[:15]))
        return len(data["tilfaelde"])

    def test_grupper(self):
        for gruppe, kald in KALD.items():
            with self.subTest(gruppe=gruppe):
                self._gruppe(gruppe, kald)

    def test_tal(self):
        fejl = []
        for t in laes("tal")["tilfaelde"]:
            x = t["input"]["x"]
            ts = t["ud"]
            if J.js_str(x) != ts["streng"]:
                fejl.append(f"String({x!r}): TS {ts['streng']!r}, Python {J.js_str(x)!r}")
            f = samme(ts["somFloat"], koer(lambda: R.som_float(x)))
            if f:
                fejl.append(f"somFloat({x!r}): {f}")
        self.assertFalse(fejl, "\n".join(fejl[:20]))

    def test_dato(self):
        fejl = []
        for t in laes("dato")["tilfaelde"]:
            p = J.dato_parse(t["input"]["tekst"])
            py = None if math.isnan(p) else p
            if not lig(py, t["ud"]):
                fejl.append(f"Date.parse({t['input']['tekst']!r}): TS {t['ud']!r}, Python {py!r}")
        self.assertFalse(fejl, "\n".join(fejl))

    def test_behandl_vaerksark(self):
        fejl = []
        for t in laes("behandl_vaerksark")["tilfaelde"]:
            i = t["input"]
            d = OptagendeDeps(i)
            py = koer(lambda: V.behandl_vaerksark(d, i["anmodning_id"], i["indhold"]))
            f = samme(t, py)
            if f:
                fejl.append(f"[{t['navn']}] {f}")
            elif not lig(t["spor"], d.spor):
                fejl.append(f"[{t['navn']}] kaldsspor:\n  TS     {t['spor']}\n  Python {d.spor}")
        self.assertFalse(fejl, "\n".join(fejl))

    def test_fra_ts_testene(self):
        """De håndskrevne TS-tests' egne kald (fv-skema's optagelse, ``fra_ts_testene/``) — binder også Python.
        En gruppe, porten ikke kender, er en fejl: så kan en ny optaget funktion ikke springes tavst over."""
        mappe = VEKTORER / "fra_ts_testene"
        if not mappe.is_dir():
            self.skipTest("fv-skema's optagelse findes ikke (endnu)")
        fejl, antal = [], 0
        for p in sorted(mappe.iterdir()):
            if p.suffix != ".json":
                continue
            gruppe = p.stem
            data = json.loads(p.read_text(encoding="utf-8"), object_hook=_dekod)
            for t in data["tilfaelde"]:
                antal += 1
                if gruppe == "tal":
                    x = t["input"]["x"]
                    f = None if J.js_str(x) == t["ud"]["streng"] else f"String: {J.js_str(x)!r}"
                    f = f or samme(t["ud"]["somFloat"], koer(lambda: R.som_float(x)))
                elif gruppe in KALD:
                    f = samme(t, koer(lambda: KALD[gruppe](t["input"])))
                else:
                    f = f"ukendt gruppe {gruppe!r} — porten kalder den ikke"
                if f:
                    fejl.append(f"[{gruppe}: {t['navn']}] {f}")
        self.assertGreater(antal, 0)
        self.assertFalse(fejl, f"{len(fejl)} af {antal} optagne TS-testkald afviger:\n" + "\n".join(fejl[:15]))

    # ---------------------------------------------------------- de kendte afvigelser, målt

    def test_kendt_afvigelse_v8_legacy_datoer(self):
        """V8's ældre parser læser engelske datoer; porten gør ikke. TS' svar står i vektoren, så afvigelsen er synlig."""
        for t in laes("dato_v8_legacy")["tilfaelde"]:
            self.assertIsNotNone(t["ud"], "V8 læser ikke længere teksten — fjern afvigelsen")
            self.assertTrue(math.isnan(J.dato_parse(t["input"]["tekst"])))

    def test_kendt_afvigelse_engelsk_time_start(self):
        t = next(x for x in laes("byg_frosset_input")["tilfaelde"] if x["navn"] == "værk time.start på engelsk (V8-legacy)")
        self.assertIn("ud", t, "TS afviser nu selv — fjern afvigelsen")
        py = koer(lambda: _frosset(t["input"]))
        self.assertEqual(py.get("afvisning"), 'Værkets time.start: "January 5, 2026" kan ikke læses som tidspunkt.')

    def test_vektorerne_er_fra_den_nuvaerende_ts(self):
        """Ændres TS-logikken uden at vektorerne genereres igen, er bindingen brudt — generér (se generer.mts)."""
        kilder = laes("input_hash")["kilder"]
        forskel = [f for f, h in kilder.items() if hashlib.sha256((ROD / f).read_bytes()).hexdigest() != h]
        self.assertFalse(forskel, f"TS-kilder ændret siden vektorerne blev genereret: {forskel}. "
                                  f"Kør: cd app && npx tsx ../skema/vektorer/generer.mts")


if __name__ == "__main__":
    unittest.main()
