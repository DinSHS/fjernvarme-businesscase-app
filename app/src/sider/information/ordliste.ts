//-----------------------------------------------------------------------
// Ordlisten (viden/ordliste.md) som poster: "**Ord (alias, alias)** — forklaring."
// Hver post får ét anker pr. navn (se ordliste-anker.ts) og kan søges på ord og forklaring.
//-----------------------------------------------------------------------

import { inlineTekst, ordAnker, type Blok, type Inline } from "../dokumentation/markdown/parse";

export interface Ordpost {
    /** Det fulde mærkat som skrevet: "Gab (solvergab, MIP-gab)". */
    ord: string;
    /** Alle navne posten kendes under: ["Gab", "solvergab", "MIP-gab"]. */
    navne: string[];
    ankre: string[];
    forklaring: Inline[];
    /** Ren tekst til søgning (små bogstaver). */
    soegetekst: string;
}

const STREG = /^\s*[—–-]\s+/;

/** "Gab (solvergab, MIP-gab)" -> ["Gab", "solvergab", "MIP-gab"]; "Differens / differensmetoden" -> begge; "A, B, C" -> tre. */
export function navneAf(ord: string): string[] {
    const ud: string[] = [];
    const tilføj = (s: string) => { const t = s.trim(); if (t && !ud.includes(t)) ud.push(t); };
    const parentes = [...ord.matchAll(/\(([^)]*)\)/g)].flatMap((m) => m[1].split(","));
    const uden = ord.replace(/\([^)]*\)/g, " ");
    for (const del of uden.split(/\s+\/\s+|,\s*/)) tilføj(del);
    parentes.forEach(tilføj);
    return ud;
}

/** Posterne i ordlistens rækkefølge. Afsnit, der ikke er "**ord** — …", springes over. */
export function ordposter(blokke: readonly Blok[]): Ordpost[] {
    const ud: Ordpost[] = [];
    for (const b of blokke) {
        if (b.t !== "afsnit" || b.b[0]?.t !== "fed") continue;
        const [fed, ...rest] = b.b;
        const første = rest[0];
        if (første?.t !== "tekst" || !STREG.test(første.v)) continue;
        const forklaring: Inline[] = [{ t: "tekst", v: første.v.replace(STREG, "") }, ...rest.slice(1)];
        const ord = inlineTekst(fed.t === "fed" ? fed.b : []);
        const navne = navneAf(ord);
        const ankre = [...new Set(navne.map(ordAnker).filter(Boolean))];
        ud.push({ ord, navne, ankre, forklaring, soegetekst: `${ord} ${inlineTekst(forklaring)}`.toLowerCase() });
    }
    return ud;
}

/** Alle ord i søgningen skal findes i posten (OG). Tom søgning = alt. */
export function filtrer(poster: readonly Ordpost[], soeg: string): Ordpost[] {
    const ord = soeg.toLowerCase().split(/\s+/).filter(Boolean);
    return ord.length === 0 ? [...poster] : poster.filter((p) => ord.every((o) => p.soegetekst.includes(o)));
}

/** Post for et anker (til markering), eller undefined. */
export function postForAnker(poster: readonly Ordpost[], anker: string | undefined): Ordpost | undefined {
    return anker ? poster.find((p) => p.ankre.includes(anker)) : undefined;
}

/**
 * Gør en kursiv henvisning ("Se også *kapacitet*") til et link, når kursiven er et kendt fagord. Andre kursiver
 * (oversættelser som *Frequency Containment Reserve*) bliver stående.
 */
export function linkKursiveHenvisninger(forklaring: readonly Inline[], poster: readonly Ordpost[], selv: Ordpost): Inline[] {
    return forklaring.map((n): Inline => {
        if (n.t !== "kursiv") return n;
        const anker = ordAnker(inlineTekst(n.b));
        const mål = postForAnker(poster, anker);
        return mål && mål !== selv ? { t: "link", href: `#/information/ordliste#${anker}`, b: n.b } : n;
    });
}
