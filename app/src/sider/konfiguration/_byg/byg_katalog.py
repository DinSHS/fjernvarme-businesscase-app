"""Bygger ../katalog.data.ts af fv-eksperts viden/felt_katalog.json og viden/enhedstyper.json.

Kør fra hvor som helst:  python3 src/sider/konfiguration/_byg/byg_katalog.py

Hvorfor Python og ikke et JSON-import i TypeScript:
  enhedstypernes skabeloner skal blive til blade med *typestreng* vaerdi_json
  (KONTRAKT §3.2: 4.0 er ikke 4). JavaScripts JSON.parse gør 4.0 til 4, så
  skabelonen ville oprette heltal, hvor modellen har decimaltal. Pythons json
  bevarer forskellen, og kodningen er den samme som fv-fabric's flad.py
  (kompakt, ensure_ascii=False).

Kun standardbiblioteket. Ret aldrig katalog.data.ts i hånden — ret viden/ og kør igen.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")

HER = Path(__file__).resolve().parent
VIDEN = HER.parents[4] / "viden"          # app/src/sider/konfiguration/_byg -> <repoets rod>/viden
UD = HER.parent / "katalog.data.ts"


def kod(v: object) -> str:
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))


def flad(prefiks: str, v: object, ud: list[tuple[str, str]]) -> None:
    """Som flad.py: dicts rekurseres, skalarer og lister er blade, en tom dict er bladet {}."""
    if isinstance(v, dict) and v:
        for k, u in v.items():
            flad(f"{prefiks}.{k}" if prefiks else k, u, ud)
    else:
        ud.append((prefiks, kod(v)))


def main() -> None:
    katalog = json.loads((VIDEN / "felt_katalog.json").read_text(encoding="utf-8"))
    typer = json.loads((VIDEN / "enhedstyper.json").read_text(encoding="utf-8"))

    felter = katalog["felter"]
    enhedstyper = {}
    for kode, t in typer["typer"].items():
        blade: list[tuple[str, str]] = []
        flad("", t["skabelon"], blade)
        enhedstyper[kode] = {
            "navn": t["navn"],
            "beskrivelse": t["beskrivelse"],
            "fuel": t["fuel"],
            "paakraevede": t["paakraevede"],
            "valgfri": t["valgfri"],
            "irrelevante": t["irrelevante"],
            "kan_byde_balance": t["kan_byde_balance"],
            "noter": t.get("noter", []),
            "skabelon": [{"sti": s, "vaerdi_json": j} for s, j in blade],
        }

    tekst = (
        "//-----------------------------------------------------------------------\n"
        "// GENERERET af _byg/byg_katalog.py fra viden/felt_katalog.json og\n"
        "// viden/enhedstyper.json (fv-ekspert). Ret ikke i hånden.\n"
        f"// Modelcommit: {katalog['model_commit']} · {len(felter)} felter · {len(enhedstyper)} enhedstyper\n"
        "//-----------------------------------------------------------------------\n\n"
        'import type { FeltPost, Enhedstype } from "./katalog";\n\n'
        f"export const MODEL_COMMIT = {kod(katalog['model_commit'])};\n\n"
        f"export const FELTER: readonly FeltPost[] = {json.dumps(felter, ensure_ascii=False, indent=1)};\n\n"
        f"export const ENHEDSTYPER: Readonly<Record<string, Enhedstype>> = {json.dumps(enhedstyper, ensure_ascii=False, indent=1)};\n\n"
        f"export const BRAENDSELSNAVNE: Readonly<Record<string, string>> = {json.dumps(typer['braendselsnavne'], ensure_ascii=False)};\n\n"
        f"export const ENHED_STANDARD_REGLER: readonly string[] = {json.dumps(typer['regler'], ensure_ascii=False)};\n"
    )
    # CRLF/LF: filen skrives med LF som resten af src/.
    UD.write_bytes(tekst.encode("utf-8"))
    print(f"skrevet {UD.name}: {len(felter)} felter, {len(enhedstyper)} enhedstyper")
    byg_nyt_vaerk(katalog)


def tal_i(tekst: str, mønster: str, hvad: str) -> float:
    """Et tal fra skabelonens formeltekst ("rund(0,5 × G)") — fejler højlydt, hvis teksten ændres."""
    m = re.search(mønster, tekst)
    if not m:
        raise SystemExit(f"nyt_vaerk_skabelon.json: kan ikke finde {hvad} i {tekst!r} — ret mønsteret i byg_katalog.py")
    return float(m.group(1).replace(",", "."))


def byg_nyt_vaerk(katalog: dict) -> None:
    """viden/nyt_vaerk_skabelon.json -> ../nyt-vaerk.data.ts (guiden "Nyt værk fra bunden", brief 15 B)."""
    kilde = VIDEN / "nyt_vaerk_skabelon.json"
    ud = HER.parent / "nyt-vaerk.data.ts"
    if not kilde.exists():
        print(f"springer {ud.name} over: {kilde.name} findes ikke endnu")
        return
    s = json.loads(kilde.read_text(encoding="utf-8"))
    formel = s["skalering"]["formel"]
    skaleres = [k for k in formel if k.startswith("heat_load_params.")]
    if not skaleres:
        raise SystemExit("nyt_vaerk_skabelon.json: skalering.formel nævner ingen heat_load_params-stier")
    tilladte = {f["sti"]: f["tilladte"] for f in katalog["felter"] if f["sti"] in ("data.dmi_area", "data.price_zone")}
    regler = {t["id"]: t["regel"] for t in s["guide_trin"]}
    data = {
        "blade": [{"sti": b["sti"], "vaerdi_json": b["vaerdi_json"], "bekraeft": bool(b["bekraeft"]), "kommentar": b.get("kommentar")} for b in s["blade"]],
        "varmelast": {
            # Bladene står ved standard_varmebehov_gwh; skaleret lineært er det = Andebys tal × G / g_andeby_gwh.
            "reference_gwh": s["standard_varmebehov_gwh"],
            "skaleres": skaleres,
            "tekst": f"{formel['faktor']}; {', '.join(f'{k.split('.')[-1]} = {formel[k]}' for k in skaleres)}; uændret: {formel.get('uændret', '')}",
            "forbehold": s["skalering"].get("forbehold", ""),
        },
        "dmi": tilladte["data.dmi_area"],
        "zoner": tilladte["data.price_zone"],
        "kilde": f"viden/nyt_vaerk_skabelon.json @ {s['model_commit'][:7]}",
        "trinRegler": regler,
        # Tallene står i skabelonens tekst; de udtrækkes her, så guiden altid følger fv-eksperts skabelon.
        "gaskedelPrGwh": tal_i(formel["units.gaskedel.p_max_heat"], r"rund\(\s*([\d,\.]+)\s*×\s*G\)", "gaskedlens MW pr. GWh"),
        "spidslastPrGwh": tal_i(formel["units.gaskedel.p_max_heat"], r"spidslast\s*≈\s*([\d,\.]+)\s*×\s*G", "spidslast pr. GWh"),
        "obligatoriske": s["obligatoriske_felter"],
    }
    tekst = (
        "//-----------------------------------------------------------------------\n"
        "// GENERERET af _byg/byg_katalog.py fra viden/nyt_vaerk_skabelon.json\n"
        f"// (fv-ekspert). Ret ikke i hånden. {len(data['blade'])} blade, model {s['model_commit'][:7]}.\n"
        "//-----------------------------------------------------------------------\n\n"
        'import type { NytVaerkSkabelon } from "./nyt-vaerk";\n\n'
        f"export const NYT_VAERK_SKABELON: NytVaerkSkabelon | null = {json.dumps(data, ensure_ascii=False, indent=1)};\n"
    )
    ud.write_bytes(tekst.encode("utf-8"))
    print(f"skrevet {ud.name}: {len(data['blade'])} blade, skalerer {len(skaleres)} stier, gaskedel {data['gaskedelPrGwh']} MW/GWh, spidslast {data['spidslastPrGwh']} MW/GWh")


if __name__ == "__main__":
    main()
