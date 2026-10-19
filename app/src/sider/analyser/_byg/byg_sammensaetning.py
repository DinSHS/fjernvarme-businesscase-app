"""Genererer src/sider/analyser/sammensaetning.data.ts fra fv-eksperts viden/ (brief 17).

Kørselslisten skal kunne fortælle, hvordan en analyse er sammensat, uden at
brugeren kender baggrunden. Det kræver tre ting fra viden/:

* demo_scenarier.json: demo-kørslerne (navn + værk) og parrenes spørgsmål,
  så en demo-kørsel får sit eget, konkrete spørgsmål.
* referencetal.json, gruppen "readme": README's referencetal, så en kørsel,
  der genskaber et af dem, kan mærkes "README-reference" med tallet.
* app_tekster/ordliste.md: ordlistens korte definitioner til kolonnernes
  forklaringer og "Sådan er en analyse sammensat".

Kør fra app/:  python src/sider/analyser/_byg/byg_sammensaetning.py
"""

import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")

HER = Path(__file__).resolve().parent
ANALYSER = HER.parent
VIDEN = ANALYSER.parents[3] / "viden"
UD = ANALYSER / "sammensaetning.data.ts"
UD_DATA = ANALYSER / "datagrundlag.data.ts"

# Ordlistens ord, som listen og forklaringen bruger (navnet som det står i fed i ordliste.md, før en evt. parentes).
ORD = [
    "Værk", "Scenarie", "Referencekørsel", "Differens / differensmetoden", "Gab (solvergab, MIP-gab)", "Objektiv",
    "Syntetisk varmelast", "Spor A", "Spor B", "Balancemarked", "aFRR", "mFRR", "Spotpris",
]


def laes(navn: str):
    return json.loads((VIDEN / navn).read_text(encoding="utf-8"))


def ordliste() -> dict:
    """`**Ord** — tekst` (evt. over flere linjer, til næste tomme linje) -> {ord: tekst}."""
    tekst = (VIDEN / "app_tekster" / "ordliste.md").read_text(encoding="utf-8").replace("\r\n", "\n")
    ud = {}
    for blok in re.split(r"\n\s*\n", tekst):
        m = re.match(r"^\*\*(.+?)\*\*\s+—\s+(.*)$", blok.strip(), re.S)
        if m:
            # Til en tooltip: uden kursiv-stjerner og uden kildehenvisningen (den står i ordlisten selv).
            t = " ".join(m.group(2).split()).replace("*", "")
            ud[m.group(1).strip()] = re.sub(r"\s*\(Kilde:[^)]*\)", "", t)
    mangler = [o for o in ORD if o not in ud]
    if mangler:
        raise SystemExit(f"ordliste.md mangler: {mangler}")
    return {o: ud[o] for o in ORD}


def main() -> None:
    demo = laes("demo_scenarier.json")
    ref = laes("referencetal.json")

    koersler = [
        {"id": k["id"], "navn": k["navn"], "vaerk_kode": k["vaerk_kode"]}
        for k in demo["koersler"]
    ]
    par = [
        {"id": p["id"], "reference": p["reference"], "scenarie": p["scenarie"], "spoergsmaal": p["spoergsmaal"], "knap": p.get("knap")}
        for p in demo["par"]
    ]
    readme = next(g for g in ref["grupper"] if g["id"] == "readme")
    # Kun README-gruppen, i den form information/referencer.ts's `laesReferencer` læser (én sandhed om reglen).
    readme_json = json.dumps({"grupper": [readme]}, ensure_ascii=False, separators=(",", ":"))
    ord_ = ordliste()
    # Codex K5-F9: README-mærket kræver også referencetallenes pins. Modellen er referencetal.json's
    # model_commit; df-data skal være "fra 5. oktober 2026 eller senere" (referencetal.json -> datakrav,
    # README.md:130-134 - prosa, derfor skrevet her) og må kun godtages, når commit'ens dato er målt
    # (data_krav.json -> maalt_daekning).
    dk = laes("data_krav.json")["maalt_daekning"]
    readme_pins = {"model_commit": ref["model_commit"], "df_data_fra": "2026-10-05",
                   "df_data_kendt": {dk["df_data_commit"]: dk["df_data_dato"]}}

    def ts(v) -> str:
        return json.dumps(v, ensure_ascii=False, indent=1)

    tekst = "\r\n".join([
        "//-----------------------------------------------------------------------",
        "// GENERERET af _byg/byg_sammensaetning.py fra viden/demo_scenarier.json,",
        "// viden/referencetal.json (gruppen readme) og viden/app_tekster/ordliste.md",
        "// (fv-ekspert). Ret ikke i hånden.",
        f"// Modelcommit: {demo['model_commit']} · {len(koersler)} demo-kørsler · {len(par)} par · {len(readme['referencer'])} README-referencer",
        "//-----------------------------------------------------------------------",
        "",
        "export const DEMO_KOERSLER: readonly { id: string; navn: string; vaerk_kode: string }[] = " + ts(koersler) + ";",
        "",
        "export const DEMO_PAR: readonly { id: string; reference: string; scenarie: string; spoergsmaal: string; knap: string | null }[] = " + ts(par) + ";",
        "",
        "/** referencetal.json med kun gruppen \"readme\" — læses med `laesReferencer` (information/referencer.ts). */",
        "export const README_REFERENCER_JSON = " + json.dumps(readme_json, ensure_ascii=False) + ";",
        "",
        "/** README-referencetallenes pins (Codex K5-F9): modelcommit, df-data fra-dato og målte df-data-commits med dato. */",
        "export const README_PINS: { model_commit: string; df_data_fra: string; df_data_kendt: Readonly<Record<string, string>> } = " + ts(readme_pins) + ";",
        "",
        "/** Ordlistens definitioner (app_tekster/ordliste.md) for de ord, listen forklarer. */",
        "export const ORDLISTE: Readonly<Record<string, string>> = " + ts(ord_) + ";",
        "",
    ])
    UD.write_bytes(tekst.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8"))
    print(f"skrev {UD.name}: {len(koersler)} demo-koersler, {len(par)} par, {len(readme['referencer'])} README-referencer, {len(ord_)} ord")


def datagrundlag() -> None:
    """datagrundlag.data.ts: fv-datas data_krav.json -> data_i_koersel (KONTRAKT §6d sidste punkt)."""
    d = laes("data_krav.json")
    dik = d["data_i_koersel"]
    felter = ("etiket", "vaerdi", "kilde", "fodnote", "altid", "kun_hvis", "ellers")
    linjer = [{k: v for k, v in x.items() if k in felter} for x in dik["linjer"]]
    kilder = [{"id": x["id"], "navn": x["navn"], "bruges": x["bruges"]} for x in d["datakilder"]]
    standard_temp = "temp_mean_past1h"
    m = re.search(r"\(standard ([a-z0-9_]+)\)", next(x["kilde"] for x in d["datakilder"] if x["id"] == "dmi"))
    if m:
        standard_temp = m.group(1)

    def ts(v) -> str:
        return json.dumps(v, ensure_ascii=False, indent=1)

    linje_type = "readonly { etiket: string; vaerdi: string; kilde?: string; fodnote?: string; altid?: boolean; kun_hvis?: string; ellers?: string }[]"
    dele = [
        "//-----------------------------------------------------------------------",
        "// GENERERET af _byg/byg_sammensaetning.py fra viden/data_krav.json (fv-data):",
        "// data_i_koersel og datakilder. Ret ikke i hånden.",
        f"// data_krav version {d['version']} · {d['dato']} · modelrepo {d['modelrepo_commit']}",
        "//-----------------------------------------------------------------------",
        "",
        '/** Linjerne i "Data i denne kørsel". `vaerdi` er en skabelon; alternativer er adskilt af " | ". */',
        f"export const DATA_LINJER: {linje_type} = " + ts(linjer) + ";",
        "",
        "export const DATAKILDER: readonly { id: string; navn: string; bruges: string }[] = " + ts(kilder) + ";",
        "",
        "/** DMI-kolonnen, når værket ikke sætter data.dmi_temp_shortname (datakilder -> dmi). */",
        f"export const STANDARD_TEMP = {json.dumps(standard_temp)};",
        "",
        f"export const TIDSSERIENS_NAVN = {json.dumps(dik.get('tidsseriens_navn', ''), ensure_ascii=False)};",
        "",
    ]
    tekst = "\n".join(dele)
    UD_DATA.write_bytes(tekst.replace("\n", "\r\n").encode("utf-8"))
    print(f"skrev {UD_DATA.name}: {len(linjer)} linjer, {len(kilder)} datakilder, standard temp {standard_temp}")


if __name__ == "__main__":
    main()
    datagrundlag()
