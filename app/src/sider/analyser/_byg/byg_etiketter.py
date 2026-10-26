"""Genererer src/sider/analyser/etiketter.data.ts fra fv-eksperts viden/.

Analysesiderne har kun brug for et lille udsnit af fagkataloget: feltets etiket
og enhed (til "hvad blev kørt" og input-diff), enhedstypernes danske navne og
de faste forbehold ved visning af resultater. Et eget, lille udsnit holder
Analyser-bundtet fri af Konfigurations 110 KB katalog.

Kør fra app/:  python src/sider/analyser/_byg/byg_etiketter.py
"""

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")

HER = Path(__file__).resolve().parent
ANALYSER = HER.parent
VIDEN = ANALYSER.parents[3] / "viden"
UD = ANALYSER / "etiketter.data.ts"
UD_ANBEFALING = ANALYSER / "anbefaling.data.ts"


def laes(navn: str):
    return json.loads((VIDEN / navn).read_text(encoding="utf-8"))


def main() -> None:
    katalog = laes("felt_katalog.json")
    typer = laes("enhedstyper.json")
    resultat = laes("resultat_etiketter.json")

    felter = [
        {"sti": f["sti"], "etiket": f["etiket"], "enhed": f.get("enhed")}
        for f in katalog["felter"]
    ]
    enhedstyper = {k: v["navn"] for k, v in typer["typer"].items()}
    noegletal = {
        n["noegle"]: {"etiket": n["etiket"], "forklaring": n.get("forklaring", "")}
        for n in resultat["manifest_noegletal"]
    }
    forbehold = [{"hvornaar": f["hvornaar"], "tekst": f["tekst"]} for f in resultat["faste_forbehold_ved_visning"]]
    register = {
        k: {"etiket": v["etiket"], "enhed": v.get("enhed"), "forklaring": v.get("forklaring", "")}
        for k, v in resultat.get("maaleregister_noegler", {}).items()
        if isinstance(v, dict) and "etiket" in v
    }

    def ts(v) -> str:
        return json.dumps(v, ensure_ascii=False, indent=1)

    tekst = "\r\n".join([
        "//-----------------------------------------------------------------------",
        "// GENERERET af _byg/byg_etiketter.py fra viden/felt_katalog.json,",
        "// viden/enhedstyper.json og viden/resultat_etiketter.json (fv-ekspert).",
        "// Ret ikke i hånden.",
        f"// Modelcommit: {katalog['model_commit']} · {len(felter)} felter · {len(enhedstyper)} enhedstyper",
        "//-----------------------------------------------------------------------",
        "",
        f"export const MODEL_COMMIT_KATALOG = {json.dumps(katalog['model_commit'])};",
        "",
        "export const FELTER: readonly { sti: string; etiket: string; enhed: string | null }[] = " + ts(felter) + ";",
        "",
        "export const ENHEDSTYPER: Readonly<Record<string, string>> = " + ts(enhedstyper) + ";",
        "",
        "export const NOEGLETAL_TEKST: Readonly<Record<string, { etiket: string; forklaring: string }>> = " + ts(noegletal) + ";",
        "",
        "export const FORBEHOLD: readonly { hvornaar: string; tekst: string }[] = " + ts(forbehold) + ";",
        "",
        "/** Forbrugsmodregningens definition pr. modelversion (spotprisen regnet som sparet før 19/10-2026; Codex K7-F2). */",
        "export const FORBRUGSMODREGNING_VERSIONER: Readonly<{ spot_regnet_som_sparet: readonly string[]; neutral_etiket: string; forklaring_med_spot: string; forklaring_blandet: string }> = "
        + ts({k: v for k, v in resultat["forbrugsmodregning_versioner"].items() if not k.startswith("_") and k != "kilde"}) + ";",
        "",
        "/** fv-eksperts etiketter for måleregistrets nøgler: `noegletal:<gruppe>.<noegle>` / `maaned:<noegle>`. */",
        "export const REGISTER: Readonly<Record<string, { etiket: string; enhed: string | null; forklaring: string }>> = " + ts(register) + ";",
        "",
    ])
    UD.write_bytes(tekst.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8"))
    print(f"skrev {UD.name}: {len(felter)} felter, {len(enhedstyper)} typer, {len(noegletal)} noegletal, {len(forbehold)} forbehold, {len(register)} registernoegler")


def anbefaling() -> None:
    """anbefaling.data.ts: fv-eksperts tekster til anbefalinger og historie (brief 15 A/A2).
    Reglerne (beslutningsrækkefølge, margin, forbehold-betingelser) er kode i anbefaling.ts;
    her kommer kun teksterne og de faste tal, så fagteksten ikke opfindes i appen."""
    regler = laes("anbefalingsregler.json")
    knapper = laes("knapper.json")

    def ts(v) -> str:
        return json.dumps(v, ensure_ascii=False, indent=1)

    kategorier = {k["id"]: {"maerke": k["maerke"], "tone": k["tone"], "betydning": k["betydning"]} for k in regler["kategorier"]}
    kategorier["foelsomhed"] = {"maerke": regler["ikke_beslutning"]["maerke"], "tone": regler["ikke_beslutning"]["tone"],
                                "betydning": regler["ikke_beslutning"]["betydning"]}
    forbehold = {f["id"]: {"virkning": f["virkning"], "tekst": f["tekst"], "kilde": f.get("kilde", "")} for f in regler["forbehold"]}
    trin = {str(t["trin"]): t["begrundelse"] for t in regler["beslutningsraekkefoelge"]}
    knap = {k["id"]: {"spoergsmaal": k["spoergsmaal"], "anbefaling": k.get("anbefaling", {})} for k in knapper["knapper"]}
    tekst = "\r\n".join([
        "//-----------------------------------------------------------------------",
        "// GENERERET af _byg/byg_etiketter.py fra viden/anbefalingsregler.json og",
        "// viden/knapper.json (fv-ekspert). Ret ikke i hånden.",
        f"// Modelcommit: {regler['model_commit']} · {len(knap)} knapper · {len(forbehold)} forbehold",
        "//-----------------------------------------------------------------------",
        "",
        "export const KATEGORIER: Readonly<Record<string, { maerke: string; tone: string; betydning: string }>> = " + ts(kategorier) + ";",
        "",
        "export const FORBEHOLD_REGLER: Readonly<Record<string, { virkning: string; tekst: string; kilde: string }>> = " + ts(forbehold) + ";",
        "",
        "/** Modelversioner, hvor tankens første time var ubundet (forbeholdet t0_lager gælder kun kørsler herfra). */",
        "export const T0_DEFEKTE_MODEL_COMMITS: readonly string[] = " + ts(regler["t0_defekte_model_commits"]) + ";",
        "",
        "/** Begrundelser pr. trin i beslutningsrækkefølgen (pladsholdere i {}). */",
        "export const TRIN: Readonly<Record<string, string>> = " + ts(trin) + ";",
        "",
        "export const SKALERING_TEKST = " + json.dumps(regler["skalering"]["tekst"], ensure_ascii=False) + ";",
        "",
        "export const INVESTERING = " + ts({"tekst": regler["investering"]["tekst"], "knapper": regler["investering"]["gaelder_for_knapper"],
                                           "annuitet": regler["investering"]["annuitet"]["formel"], "forklaring": regler["investering"]["annuitet"]["forklaring"]}) + ";",
        "",
        "export const KNAPPER: Readonly<Record<string, { spoergsmaal: string; anbefaling: Record<string, unknown> }>> = " + ts(knap) + ";",
        "",
        "export const VISNINGSNAVNE: Readonly<Record<string, Readonly<Record<string, string>>>> = " + ts({k: v for k, v in knapper["visningsnavne"].items() if isinstance(v, dict)}) + ";",
        "",
        "export const FASTE_VINDUER: readonly { navn: string; periode_start: string; periode_slut: string }[] = "
        + ts([{"navn": v["navn"], "periode_start": v["periode_start"], "periode_slut": v["periode_slut"]} for v in knapper["faste_vinduer"]]) + ";",
        "",
    ])
    UD_ANBEFALING.write_bytes(tekst.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8"))
    print(f"skrev {UD_ANBEFALING.name}: {len(knap)} knapper, {len(forbehold)} forbehold, {len(trin)} trin")


if __name__ == "__main__":
    main()
    anbefaling()
