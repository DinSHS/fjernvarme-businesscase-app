//-----------------------------------------------------------------------
// Advarsel om starttilstanden (runde 14c). Modelrepoets værksark-script
// sætter initial_status: 0 på hver enhed med unit commitment
// (scripts/vaerksark_til_yaml.py: `if u["uc_enabled"]: u["initial_status"] = 0`),
// så et værk fra arket starter med alle styrbare enheder slukket.
//
// Målt (lead, 17 enheder fra værksarket, 2026-11-17): uden tank, eller med
// tanken slået fra, er kørslen uløselig i både januar og juni; med
// `units.<elkedel>.initial_status: 1` løser den. Modellen regner, som den
// skal — det er værkets starttilstand, der ikke kan lade sig gøre uden et
// lager at tage den første time fra. Ren logik.
//-----------------------------------------------------------------------

import { findFelt } from "./katalog";

export interface StartAdvarsel {
    /** Enhederne med unit commitment, der alle står til slukket ved start. */
    enheder: string[];
    /** Felterne, der rettes (et af dem til 1). */
    stier: string[];
    tekst: string;
}

/** Modellens standard for initial_status, når feltet ikke står i casen (kataloget: src/config.py, `initial_status: int = 1`). */
const STANDARD = String(findFelt("units.x.initial_status")?.standard ?? 1);

/** Advarsel, når værket har enheder med unit commitment, og ingen af de tændte står til tændt ved start; ellers null. */
export function startAdvarsel(nu: ReadonlyMap<string, string>): StartAdvarsel | null {
    const navne = [...new Set([...nu.keys()].filter((s) => s.startsWith("units.")).map((s) => s.split(".")[1]))];
    const uc = navne.filter((n) => nu.get(`units.${n}.uc_enabled`) === "true" && nu.get(`units.${n}.enabled`) !== "false");
    if (uc.length === 0) return null;
    if (uc.some((n) => (nu.get(`units.${n}.initial_status`) ?? STANDARD) !== "0")) return null;
    const stier = uc.map((n) => `units.${n}.initial_status`);
    return {
        enheder: uc, stier,
        tekst: `Ingen enhed med unit commitment er tændt ved start: initial_status er 0 på ${uc.join(", ")}. `
            + "Målt på et værk fra værksarket: en kørsel uden tank, eller med tanken slået fra, kan da ikke løses (januar og juni 2026). "
            + "Sæt initial_status til 1 på den enhed, der kører, når perioden begynder (Enheder › vælg enheden › Redigér).",
    };
}
