//-----------------------------------------------------------------------
// Tabellernes farvevalg (runde 9, app/IBCS.md §8): Ingen · Retning · Heatmap.
// Ren logik uden React — farven pr. celle, skalaens trin og det gemte valg.
//
//   Ingen    = den hidtidige visning (Δ i virkningsfarve, niveauer uden farve)
//   Retning  = kun tekstfarve efter fortegn (neutral: blå op, orange ned;
//              med polaritet: temaets god/dårlig)
//   Heatmap  = baggrund med intensitet ∝ |værdi| i fem trin + den tekstfarve,
//              tema-kernen har målt til ≥ 4,5:1 på netop den baggrund
//
// Farverne er temaets CSS-variabler (--fjv-heat-<rampe>-<trin>[-tekst]),
// regnet i src/styles/tema-kerne.ts (heatRamper) og målt af kontrastscriptet.
//-----------------------------------------------------------------------

import { roundsToZero, type NumberScale } from "@/ibcs";
import { HEAT_TRIN, type HeatRampe } from "@/styles/tema-kerne";

export type Visning = "ingen" | "retning" | "heatmap";
/** Δ-tabeller har alle tre valg; niveau-tabeller (ingen fortegn) kun Ingen og Heatmap. */
export type Tabelslags = "delta" | "niveau";

export const VALG: Record<Tabelslags, readonly Visning[]> = { delta: ["ingen", "retning", "heatmap"], niveau: ["ingen", "heatmap"] };

// ---------------------------------------------------------------- valget, pr. bruger (localStorage) og fælles for siden

const NOEGLE: Record<Tabelslags, string> = { delta: "fjv.tabelfarve.delta.v1", niveau: "fjv.tabelfarve.niveau.v1" };
const husket: Partial<Record<Tabelslags, Visning>> = {};
const lyttere = new Set<() => void>();

function gyldig(slags: Tabelslags, v: unknown): v is Visning {
    return typeof v === "string" && (VALG[slags] as readonly string[]).includes(v);
}

/** Det gemte valg; "ingen", når intet er gemt, lageret er blokeret, eller værdien er ukendt. */
export function laesVisning(slags: Tabelslags): Visning {
    if (husket[slags]) return husket[slags]!;
    let v: unknown = null;
    try { v = globalThis.localStorage?.getItem(NOEGLE[slags]); } catch { /* blokeret lager: siden virker uden */ }
    husket[slags] = gyldig(slags, v) ? v : "ingen";
    return husket[slags]!;
}

/** Sætter valget for alle tabeller af samme slags (også på andre sider) og husker det, hvis lageret tillader det. */
export function saetVisning(slags: Tabelslags, v: Visning): void {
    if (!gyldig(slags, v)) return;
    husket[slags] = v;
    try { globalThis.localStorage?.setItem(NOEGLE[slags], v); } catch { /* blokeret lager: valget gælder til siden lukkes */ }
    lyttere.forEach((f) => f());
}

export function abonner(f: () => void): () => void {
    lyttere.add(f);
    return () => { lyttere.delete(f); };
}

/** Kun til test: glem det huskede, så næste læsning går til lageret igen. */
export function glemVisning(): void {
    for (const k of Object.keys(husket) as Tabelslags[]) delete husket[k];
}

// ---------------------------------------------------------------- farven pr. celle

/** Fem trin: (0; 1/5] → 1 … (4/5; 1] → 5 af tabellens (eller skalagruppens) største |værdi|. 0 = ingen farve. */
export function trin(v: number, maks: number): number {
    if (!Number.isFinite(v) || v === 0 || !(maks > 0)) return 0;
    return Math.min(HEAT_TRIN, Math.max(1, Math.ceil((Math.abs(v) / maks) * HEAT_TRIN - 1e-9)));
}

/**
 * Hvilken rampe en værdi hører til. Niveauer: sekventiel. Δ med polaritet 0 (neutral, IBCS.md §2): op/ned efter
 * fortegnet — blå og orange, ikke god/dårlig. Med polaritet: god/dårlig efter fortegn × polaritet.
 */
export function rampe(v: number, art: Art): HeatRampe {
    if (art.slags === "niveau") return "niveau";
    const p = art.polaritet ?? 0;
    if (p === 0) return v > 0 ? "op" : "ned";
    return Math.sign(v) * p > 0 ? "god" : "daarlig";
}

export type Art = { slags: "niveau" } | { slags: "delta"; polaritet?: number };

/** Cellens farver som CSS-værdier (temaets variabler). Tom = ingen farve: cellen vises som før. */
export interface Farvning {
    baggrund?: string;
    tekst?: string;
    /** `<rampe>-<trin>` til data-heat (lint, tests, skærmbilleder). */
    heat?: string;
}

/**
 * Farven for én celle. `maks` er skalaens 100 % (tabellens eller skalagruppens største |værdi|). `skala` er cellens
 * VISTE afrunding (faktor og decimaler, samme som tallet formateres med) og er påkrævet: en celle, der vises som 0
 * (0, 0,00, 0,0 % …), får aldrig farve — i niveau- og Δ-tabeller (IBCS.md §2 og §8). Tomme celler: ingen farve.
 */
export function farvning(visning: Visning, v: number | null | undefined, art: Art, maks: number, skala: Pick<NumberScale, "factor" | "decimals">): Farvning {
    if (visning === "ingen" || v == null || !Number.isFinite(v) || roundsToZero(v, skala)) return {};
    const r = rampe(v, art);
    if (visning === "retning") {
        // Niveauer har intet fortegn; med polaritet bærer DeltaTal allerede god/dårlig (samme som Ingen).
        if (art.slags === "niveau" || r === "god" || r === "daarlig") return {};
        return { tekst: `var(--fjv-heat-${r})` };
    }
    const t = trin(v, maks);
    if (t === 0) return {};
    return { baggrund: `var(--fjv-heat-${r}-${t})`, tekst: `var(--fjv-heat-${r}-${t}-tekst)`, heat: `${r}-${t}` };
}

/** Skalaens 100 %: største |værdi| blandt tallene (0, når der ingen er). */
export function skalaMaks(tal: Iterable<number | null | undefined>): number {
    let m = 0;
    for (const v of tal) if (v != null && Number.isFinite(v)) m = Math.max(m, Math.abs(v));
    return m;
}

/**
 * Fodnotens forklaring (legenden integreret i tabellens fodnote, IBCS UN 3.3). `skalaer` er skalaernes 100 % med navn
 * og formateret tekst, fx [["månederne", 2261, "2.261 MWh"], ["hele perioden", 9277, "9.277 MWh"]]; en skala uden
 * farvede celler (100 % = 0) nævnes ikke, og er ingen celler farvet, er der ingen forklaring. "Kraftigere", ikke
 * "mørkere": i mørk tilstand er det stærkeste trin det lyseste. Tom tekst for "ingen".
 */
export function forklaring(visning: Visning, art: Art, skalaer?: readonly (readonly [string, number, string])[]): string {
    if (visning === "ingen") return "";
    const p = art.slags === "delta" ? art.polaritet ?? 0 : null;
    const farver = p === null ? "" : p === 0 ? "Blå = mere end referencen, orange = mindre" : "Grøn = bedre end referencen, rød = dårligere";
    if (visning === "retning") return p === null || p !== 0 ? "" : `${farver}.`;
    const maks = (skalaer ?? []).filter(([, v]) => v > 0);
    if (skalaer && maks.length === 0) return "";
    // Trinene står i teksten (review fund 10): 5 trin à 20 % af skalaens kraftigste værdi.
    const trinTekst = `${HEAT_TRIN} trin à ${100 / HEAT_TRIN} %`;
    const skala = maks.length === 0 ? ` (${trinTekst})` : maks.length === 1 && !maks[0][0]
        ? ` (${trinTekst}; kraftigst = ${maks[0][2]})`
        : ` (${trinTekst}; kraftigst: ${maks.map(([n, , v]) => `${n} ${v}`).join(", ")}${maks.length > 1 ? " — hver har sin egen skala" : ""})`;
    return `${farver ? `${farver}; jo` : "Jo"} kraftigere farve, jo større${skala}.`;
}
