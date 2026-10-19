//-----------------------------------------------------------------------
// Talformater til Information-siderne, i dansk format (som @/lib/format). Dér findes ikke en
// formatter med valgfrit antal decimaler, og en afvigelse på −0,0006 % må ikke vises som "−0,0 %".
//-----------------------------------------------------------------------

import { tal } from "@/lib/format";

const MINUS = "−";

/** Tal med præcis `d` decimaler, dansk skilletegn: 1234.5 -> "1.234,50". */
export function dec(v: number, d: number): string {
    return new Intl.NumberFormat("da-DK", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}

/** Fortegnsbærende kroner uden enhed: −28,67 -> "−29". */
export function signedKr(v: number): string {
    const r = Math.round(v);
    return (r > 0 ? "+" : r < 0 ? MINUS : "") + tal(Math.abs(r));
}

/**
 * Fortegnsbærende procent med så mange decimaler, at et lille tal stadig kan ses:
 * 0,0000612 (en brøk) -> "+0,0061 %"; −0,0123 -> "−1,23 %". Nul vises som "0,0 %".
 */
export function signedProcent(brøk: number): string {
    const p = brøk * 100;
    const a = Math.abs(p);
    if (a === 0) return "0,0 %";
    const d = a < 0.01 ? 4 : a < 0.1 ? 3 : 2;
    return (p > 0 ? "+" : MINUS) + dec(a, d) + " %";
}

/** Antal døgn fra `fra` til `til` (hele døgn, kan være negativt). */
export function dageMellem(fra: Date, til: Date): number {
    return Math.ceil((til.getTime() - fra.getTime()) / 86_400_000);
}

export function flertal(n: number, ental: string, flertalsform: string): string {
    return `${tal(n)} ${n === 1 ? ental : flertalsform}`;
}

/** Et solvergab som brøk -> "0,02 %" (op til 4 decimaler, uden afsluttende nuller). */
export function gabProcent(brøk: number): string {
    return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 4 }).format(brøk * 100) + " %";
}

/** "0,02 % og 1.000 kr." — begge gab gælder; solveren stopper ved det første, der nås. */
export function gabTekst(rel: number | null, abs: number | null): string {
    const dele = [rel === null ? null : gabProcent(rel), abs === null ? null : `${tal(abs)} kr.`].filter((x): x is string => x !== null);
    return dele.length ? dele.join(" og ") : "ikke oplyst";
}
