//-----------------------------------------------------------------------
// Tabellernes farvevalg (runde 9, app/IBCS.md §8): Ingen · Retning · Heatmap.
// Ren logik uden React — farven pr. celle, skalaens trin og det gemte valg.
//
//   Ingen    = den hidtidige visning (Δ i virkningsfarve, niveauer uden farve)
//   Retning  = kun tekstfarve efter fortegn
//   Heatmap  = baggrund med intensitet ∝ |værdi| i fem trin + den tekstfarve,
//              tema-kernen har målt til ≥ 4,5:1 på netop den baggrund
//
// Farvesættet (runde 10, IBCS.md AF7) bestemmer Δ-farverne i Retning og Heatmap:
//   Rød/grøn (standard) · Blå/rød (farveblind-sikker) · Neutral (IBCS: blå/orange
//   for neutrale tabeller, temaets god/dårlig for tabeller med polaritet).
// Med polaritet er grøn/blå altid GODT og rød DÅRLIGT (en omkostning, der stiger,
// er rød); uden polaritet er grøn/blå MERE end referencen og rød MINDRE.
// Niveau-tabeller følger intet farvesæt.
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

/** Kun til test: glem det huskede (visning og farvesæt), så næste læsning går til lageret igen. */
export function glemVisning(): void {
    for (const k of Object.keys(husket) as Tabelslags[]) delete husket[k];
    saetHusket = undefined;
}

// ---------------------------------------------------------------- farvesættet, pr. bruger og fælles for alle Δ-tabeller

export type Farvesaet = "roedgroen" | "blaaroed" | "neutral";
export const FARVESAET: readonly Farvesaet[] = ["roedgroen", "blaaroed", "neutral"];
/** Brugerens ønske 2026-10-27: rød/grøn som standard; Neutral er IBCS-varianten (AF7). */
export const STANDARD_FARVESAET: Farvesaet = "roedgroen";
const SAET_NOEGLE = "fjv.tabelfarve.farvesaet.v1";
let saetHusket: Farvesaet | undefined;

/** Det gemte farvesæt; standarden, når intet er gemt, lageret er blokeret, eller værdien er ukendt. */
export function laesFarvesaet(): Farvesaet {
    if (saetHusket) return saetHusket;
    let v: unknown = null;
    try { v = globalThis.localStorage?.getItem(SAET_NOEGLE); } catch { /* blokeret lager: siden virker uden */ }
    saetHusket = (FARVESAET as readonly unknown[]).includes(v) ? (v as Farvesaet) : STANDARD_FARVESAET;
    return saetHusket;
}

/** Sætter farvesættet for alle Δ-tabeller på alle sider og husker det, hvis lageret tillader det. */
export function saetFarvesaet(s: Farvesaet): void {
    if (!FARVESAET.includes(s)) return;
    saetHusket = s;
    try { globalThis.localStorage?.setItem(SAET_NOEGLE, s); } catch { /* blokeret lager: valget gælder til siden lukkes */ }
    lyttere.forEach((f) => f());
}

// ---------------------------------------------------------------- farven pr. celle

/** Fem trin: (0; 1/5] → 1 … (4/5; 1] → 5 af tabellens (eller skalagruppens) største |værdi|. 0 = ingen farve. */
export function trin(v: number, maks: number): number {
    if (!Number.isFinite(v) || v === 0 || !(maks > 0)) return 0;
    return Math.min(HEAT_TRIN, Math.max(1, Math.ceil((Math.abs(v) / maks) * HEAT_TRIN - 1e-9)));
}

/**
 * Hvilken rampe en værdi hører til. Niveauer: sekventiel. Δ: "plus" er MERE end referencen (polaritet 0) eller GODT
 * (fortegn × polaritet > 0). Rød/grøn: plus grøn, ellers rød. Blå/rød: plus blå, ellers rød. Neutral (IBCS.md §2):
 * polaritet 0 → op/ned (blå/orange), ellers temaets god/dårlig.
 */
export function rampe(v: number, art: Art): HeatRampe {
    if (art.slags === "niveau") return "niveau";
    const p = art.polaritet ?? 0;
    const plus = p === 0 ? v > 0 : Math.sign(v) * p > 0;
    switch (art.saet ?? "neutral") {
        case "roedgroen": return plus ? "groen" : "roed";
        case "blaaroed": return plus ? "blaa" : "roed";
        default: return p === 0 ? (plus ? "op" : "ned") : plus ? "god" : "daarlig";
    }
}

/** Uden `saet` er Δ-farverne Neutral (IBCS-varianten); appen sender brugerens farvesæt med (useFarvesaet). */
export type Art = { slags: "niveau" } | { slags: "delta"; polaritet?: number; saet?: Farvesaet };

/**
 * Sætter farvevalget tekstfarven i ikke-nul-celler? Så skal tallet arve den (DeltaTal `arv`). Retning i en tabel med
 * polaritet og farvesættet Neutral gør det ikke: dér bærer tallet allerede sin IBCS-virkningsfarve, som under Ingen.
 */
export function farverTeksten(visning: Visning, art: Art): boolean {
    if (visning === "heatmap") return true;
    if (visning === "ingen" || art.slags === "niveau") return false;
    return (art.polaritet ?? 0) === 0 || (art.saet ?? "neutral") !== "neutral";
}

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
        // Niveauer har intet fortegn; med polaritet og farvesættet Neutral bærer DeltaTal allerede god/dårlig (som Ingen).
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
 * Legendens farver pr. farvesæt: [uden polaritet, med polaritet]. Uden polaritet siger teksten ærligt, at farven er
 * retning, ikke godt eller dårligt (brief 40).
 */
const RETNING_IKKE_VIRKNING = " — farven siger retning, ikke godt eller dårligt";
export const FARVENAVNE: Record<Farvesaet, readonly [string, string]> = {
    roedgroen: [`Grøn = mere end referencen, rød = mindre${RETNING_IKKE_VIRKNING}`, "Grøn = bedre end referencen, rød = dårligere"],
    blaaroed: [`Blå = mere end referencen, rød = mindre${RETNING_IKKE_VIRKNING}`, "Blå = bedre end referencen, rød = dårligere"],
    neutral: ["Blå = mere end referencen, orange = mindre", "Grøn = bedre end referencen, rød = dårligere"],
};

/**
 * Fodnotens forklaring (legenden integreret i tabellens fodnote, IBCS UN 3.3). `skalaer` er skalaernes 100 % med navn
 * og formateret tekst, fx [["månederne", 2261, "2.261 MWh"], ["hele perioden", 9277, "9.277 MWh"]]; en skala uden
 * farvede celler (100 % = 0) nævnes ikke, og er ingen celler farvet, er der ingen forklaring. "Kraftigere", ikke
 * "mørkere": i mørk tilstand er det stærkeste trin det lyseste. Tom tekst for "ingen".
 */
export function forklaring(visning: Visning, art: Art, skalaer?: readonly (readonly [string, number, string])[]): string {
    if (visning === "ingen") return "";
    const p = art.slags === "delta" ? art.polaritet ?? 0 : null;
    const saet = art.slags === "delta" ? art.saet ?? "neutral" : "neutral";
    const farver = p === null ? "" : FARVENAVNE[saet][p === 0 ? 0 : 1];
    if (visning === "retning") return p === null || !farverTeksten(visning, art) ? "" : `${farver}.`;
    const maks = (skalaer ?? []).filter(([, v]) => v > 0);
    if (skalaer && maks.length === 0) return "";
    // Trinene står i teksten (review fund 10): 5 trin à 20 % af skalaens kraftigste værdi.
    const trinTekst = `${HEAT_TRIN} trin à ${100 / HEAT_TRIN} %`;
    const skala = maks.length === 0 ? ` (${trinTekst})` : maks.length === 1 && !maks[0][0]
        ? ` (${trinTekst}; kraftigst = ${maks[0][2]})`
        : ` (${trinTekst}; kraftigst: ${maks.map(([n, , v]) => `${n} ${v}`).join(", ")}${maks.length > 1 ? " — hver har sin egen skala" : ""})`;
    return `${farver ? `${farver}; jo` : "Jo"} kraftigere farve, jo større${skala}.`;
}
