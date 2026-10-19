"""Bygger ../viden.data.ts af fv-eksperts viden/knapper.json og viden/felt_katalog.json,
og testdata ../__tests__/vaerker.testdata.ts af harnessens fixtures (de 7 importerede værker).

Kør fra hvor som helst:  python3 src/sider/scenarier/_byg/byg_viden.py

Hvorfor en genereret .ts og ikke et JSON-import: tsconfig har ikke resolveJsonModule, og
viden/ ligger uden for app/ (bundlen må ikke afhænge af en mappe uden for projektet).
Kopien committes, så `npm run build` ikke har brug for viden/.

Kun standardbiblioteket. Ret aldrig de genererede filer i hånden — ret viden/ og kør igen.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")

HER = Path(__file__).resolve().parent
OMRAADE = HER.parent                                   # app/src/sider/scenarier
APP = HER.parents[3]                                   # app/
VIDEN = APP.parent / "viden"
FIXTURES = APP / "skaermbilleder" / "harness" / "fixtures.json"

FELT_NOEGLER = ("sti", "sektion", "etiket", "enhed", "type", "tilladte", "min", "max",
                "forklaring", "avanceret", "kan_saettes_i_scenarie")


def ts_json(v: object) -> str:
    return json.dumps(v, ensure_ascii=False, indent=1)


def skriv(sti: Path, tekst: str) -> None:
    sti.parent.mkdir(parents=True, exist_ok=True)
    # LF og UTF-8 som resten af src/.
    sti.write_bytes(tekst.replace("\r\n", "\n").encode("utf-8"))
    print(f"skrev {sti.relative_to(APP)} ({len(tekst)} tegn)")


def byg_viden() -> None:
    knapper = json.loads((VIDEN / "knapper.json").read_text(encoding="utf-8"))
    katalog = json.loads((VIDEN / "felt_katalog.json").read_text(encoding="utf-8"))
    felter = [{k: f.get(k) for k in FELT_NOEGLER} for f in katalog["felter"]]
    hoved = (
        "//-----------------------------------------------------------------------\n"
        "// GENERERET af _byg/byg_viden.py fra viden/knapper.json og viden/felt_katalog.json\n"
        "// (fv-ekspert). Ret ikke i hånden.\n"
        f"// Modelcommit: {knapper['model_commit']} · {len(knapper['knapper'])} knapper · {len(felter)} felter\n"
        "//-----------------------------------------------------------------------\n\n"
        'import type { Feltpost, Knap, FastVindue, Regel } from "./viden";\n\n'
    )
    visningsnavne = {k: v for k, v in knapper.get("visningsnavne", {}).items() if k != "kilde"}
    krop = (
        f"export const MODEL_COMMIT = {json.dumps(knapper['model_commit'])};\n\n"
        f"export const FAELLES_REGLER: readonly Regel[] = {ts_json(knapper['faelles_regler'])};\n\n"
        f"export const ANBEFALET_GAB = {ts_json(knapper['anbefalet_differens'])} as const;\n\n"
        f"export const VISNINGSNAVNE: Record<string, Record<string, string>> = {ts_json(visningsnavne)};\n\n"
        f"export const FASTE_VINDUER: readonly FastVindue[] = {ts_json(knapper['faste_vinduer'])};\n\n"
        f"export const KNAPPER: readonly Knap[] = {ts_json(knapper['knapper'])} as unknown as readonly Knap[];\n\n"
        f"export const FELTER: readonly Feltpost[] = {ts_json(felter)};\n"
    )
    skriv(OMRAADE / "viden.data.ts", hoved + krop)


def byg_testdata() -> None:
    if not FIXTURES.exists():
        print(f"springer testdata over: {FIXTURES} findes ikke")
        return
    d = json.loads(FIXTURES.read_text(encoding="utf-8"))
    kode = {v["id"]: v["kode"] for v in d["Vaerk"]}
    vaerker: dict[str, dict[str, str]] = {k: {} for k in sorted(kode.values())}
    for p in sorted(d["VaerkParameter"], key=lambda p: p["raekkefoelge"]):
        vaerker[kode[p["vaerk_id"]]][p["sti"]] = p["vaerdi_json"]
    tekst = (
        "//-----------------------------------------------------------------------\n"
        "// GENERERET af _byg/byg_viden.py fra harnessens fixtures.json (et øjebliksbillede\n"
        f"// af den rigtige database, hentet {d.get('hentet')}). Værkernes blade pr. kode.\n"
        "// Værksdata — kun i dette (private) repo.\n"
        "//-----------------------------------------------------------------------\n\n"
        f"export const VAERKER: Record<string, Record<string, string>> = {ts_json(vaerker)};\n"
    )
    skriv(OMRAADE / "__tests__" / "vaerker.testdata.ts", tekst)


if __name__ == "__main__":
    byg_viden()
    byg_testdata()
