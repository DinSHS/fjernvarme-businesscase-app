//-----------------------------------------------------------------------
// Advarsel om starttilstanden (runde 14c). Modelrepoets værksark-script
// sætter initial_status: 0 på hver enhed med unit commitment
// (scripts/vaerksark_til_yaml.py: `if u["uc_enabled"]: u["initial_status"] = 0`),
// så et værk fra arket starter med alle styrbare enheder slukket.
//
// Målt 2026-11-17 ved 90fb16e / df-data 106b9fc:
//  - lead, et værk med 17 enheder fra værksarket: uden tank, eller med tanken
//    slået fra, uløselig i både januar og juni; med
//    `units.<elkedel>.initial_status: 1` løser den;
//  - runde 14c, Andeby fra værksarket (appens eksport → modelrepoets script,
//    lokal udgave): 5.–6. januar 2026 med tankene slået fra er uløselig
//    (infeasible), med `units.halmkedel.initial_status: 1` løser den
//    (869.828,49 kr.); 8.–9. juni løser begge (78.990,36 / 69.638,60 kr.).
// Advarslen siger derfor "kan blive uløselig", ikke "er". Modellen regner, som
// den skal — det er værkets starttilstand, der ikke kan lade sig gøre uden et
// lager at tage de første timer fra. Ren logik.
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
/** Feltets danske navn fra kataloget ("Tændt ved periodens start") — brugeren ser ikke YAML-navnet (brugertest r14 F18). */
export const START_ETIKET = findFelt("units.x.initial_status")?.etiket ?? "initial_status";

/** Advarsel, når værket har enheder med unit commitment, og ingen af de tændte står til tændt ved start; ellers null. */
export function startAdvarsel(nu: ReadonlyMap<string, string>): StartAdvarsel | null {
    const navne = [...new Set([...nu.keys()].filter((s) => s.startsWith("units.")).map((s) => s.split(".")[1]))];
    const uc = navne.filter((n) => nu.get(`units.${n}.uc_enabled`) === "true" && nu.get(`units.${n}.enabled`) !== "false");
    if (uc.length === 0) return null;
    if (uc.some((n) => (nu.get(`units.${n}.initial_status`) ?? STANDARD) !== "0")) return null;
    const stier = uc.map((n) => `units.${n}.initial_status`);
    return {
        enheder: uc, stier,
        tekst: `Ingen enhed med start/stop-logik er tændt ved start: «${START_ETIKET}» står til 0 (slukket) på ${uc.join(", ")}. `
            + "En kørsel uden tank, eller med tanken slået fra, kan da blive uløselig — målt på værker fra værksarket i januar 2026 (på det ene også i juni). "
            + "Sæt den til 1 (tændt) på den enhed, der kører, når perioden begynder (Enheder › vælg enheden › Redigér).",
    };
}
