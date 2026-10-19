//-----------------------------------------------------------------------
// Afflad: blade (sti, vaerdi_json) -> det indlejrede case-dict (KONTRAKT §3.2).
//
// TS-spejl af notebookens afflad, til VISNING (værkstræ, effektiv case for en
// kørsel). Værdierne parses med JSON.parse, så 12.0 og 12 bliver ens her —
// brug det aldrig til at gemme. Sandheden er bladene og notebookens Python.
//-----------------------------------------------------------------------

import { læsVaerdi } from "./vaerdi";

export interface Blad { sti: string; vaerdi_json: string }

export type Træ = { [nøgle: string]: Træ | unknown };

/** Kaster ved en sti, der både er et blad og en forælder (kan ikke genskabes som YAML). */
export function afflad(blade: readonly Blad[]): Træ {
    const rod: Træ = {};
    const blade_sti = new Set<string>();
    for (const b of blade) {
        const dele = b.sti.split(".");
        if (dele.some((d) => d === "")) throw new Error(`Ugyldig sti "${b.sti}".`);
        let node: Træ = rod;
        for (let i = 0; i < dele.length - 1; i++) {
            const forælder = dele.slice(0, i + 1).join(".");
            if (blade_sti.has(forælder)) throw new Error(`"${b.sti}" ligger under bladet "${forælder}".`);
            const næste = node[dele[i]];
            if (næste === undefined) node[dele[i]] = {};
            node = node[dele[i]] as Træ;
        }
        const sidste = dele[dele.length - 1];
        if (sidste in node) throw new Error(`"${b.sti}" findes to gange eller er også en forælder.`);
        node[sidste] = læsVaerdi(b.vaerdi_json);
        blade_sti.add(b.sti);
    }
    return rod;
}

export interface InputRække { kilde: "vaerk" | "aendring" | "scenarie"; sti: string; vaerdi_json: string }

/** Præfikset for scenariefelter, der er CLI-flag (rayfin/functions/src/logik.ts KOERSEL_PRAEFIKS). */
export const KOERSEL_PRAEFIKS = "_koersel.";

/**
 * Den effektive case for en kørsel: værkets blade, overskrevet af ændringer og
 * scenariefelter (samme prioritet som notebooken). `_koersel.*` holdes ude af
 * casen og returneres som `flag`.
 */
export function effektivtInput(rækker: readonly InputRække[]): {
    blade: Map<string, { vaerdi_json: string; kilde: InputRække["kilde"]; vaerk_json?: string }>;
    flag: Map<string, string>;
} {
    const blade = new Map<string, { vaerdi_json: string; kilde: InputRække["kilde"]; vaerk_json?: string }>();
    const flag = new Map<string, string>();
    for (const r of rækker) if (r.kilde === "vaerk") blade.set(r.sti, { vaerdi_json: r.vaerdi_json, kilde: "vaerk" });
    for (const r of rækker) {
        if (r.kilde === "vaerk") continue;
        if (r.sti.startsWith(KOERSEL_PRAEFIKS)) { flag.set(r.sti.slice(KOERSEL_PRAEFIKS.length), r.vaerdi_json); continue; }
        const før = blade.get(r.sti);
        blade.set(r.sti, { vaerdi_json: r.vaerdi_json, kilde: r.kilde, vaerk_json: før?.vaerdi_json });
    }
    return { blade, flag };
}
