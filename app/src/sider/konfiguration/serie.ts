//-----------------------------------------------------------------------
// En tidsserie som regelmæssig række + danske kalenderhjælpere. Tolkning og
// validering af en uploadet fil ligger i tidsserie-validering.ts (oraklets
// port); her er kun formen, analysen og graferne regner på. Ren logik.
//-----------------------------------------------------------------------

import { dkForskydning, type Punkt } from "./tidsserie-validering";
import { DATAKRAV } from "./datakrav.data";

export { dkForskydning };
export type Opløsning = "1h" | "15min";
export const SKRIDT_MS: Record<Opløsning, number> = { "1h": 3_600_000, "15min": 900_000 };

/** En regelmæssig serie: værdi nr. i gælder intervallet, der starter `startMs + i·skridt` (UTC); null = hul. */
export interface Serie { startMs: number; opløsning: Opløsning; værdier: (number | null)[] }

/** Dansk kalenderdel (år, måned 1–12, dag, time) for et UTC-tidspunkt. */
export function dkDel(ms: number): { år: number; måned: number; dag: number; time: number } {
    const d = new Date(ms + dkForskydning(ms) * 3_600_000);
    return { år: d.getUTCFullYear(), måned: d.getUTCMonth() + 1, dag: d.getUTCDate(), time: d.getUTCHours() };
}

/** Dansk midnat for en dansk kalenderdato som UTC-ms (dag/måned må løbe over, som i Date.UTC). */
export function dkMidnat(år: number, måned: number, dag: number): number {
    const naiv = Date.UTC(år, måned - 1, dag);
    // Skiftet sker kl. 01 UTC (02/03 dansk tid), så midnat ligger aldrig i en tvetydig time.
    return naiv - dkForskydning(naiv - 3_600_000) * 3_600_000;
}

/**
 * Højst så mange timer (positioner inkl. huller) lægges ud i browseren (Codex K5-F2). En sammenhængende serie,
 * der overholder data_krav's max_raekker, passer altid; grænsen rammer kun spænd, som huller har pustet op
 * (48 timer i 2026 + 48 timer i år 9999 er en gyldig upload med 69,9 mio. forventede timer).
 */
export const MAKS_POSITIONER = DATAKRAV.graenser.max_raekker;

/** Forklaringen, når et spænd er for langt til at blive lagt ud. */
export function forLangTekst(positioner: number, medVærdi?: number): string {
    const år = positioner / 8766;
    return `Serien spænder over ${positioner.toLocaleString("da-DK")} timer (${år.toLocaleString("da-DK", { maximumFractionDigits: 1 })} år)`
        + `${medVærdi !== undefined ? `, men kun ${medVærdi.toLocaleString("da-DK")} har en værdi` : ""} — huller gør den for lang til at blive vist`
        + ` (højst ${MAKS_POSITIONER.toLocaleString("da-DK")} timer). Del filen op, eller fjern de fjerne enkeltrækker.`;
}

/** Normaliserede timepunkter (stigende, huller udeladt) → regelmæssig timeserie med null i hullerne. */
export function fraPunkter(p: readonly Punkt[]): Serie | null {
    if (!p.length) return null;
    const start = p[0].t;
    const n = (p[p.length - 1].t - start) / 3_600_000 + 1;
    // Tjekkes FØR allokering: ellers er det netop allokeringen, der lammer browseren.
    if (n > MAKS_POSITIONER) throw new RangeError(forLangTekst(n, p.length));
    const værdier: (number | null)[] = new Array(n).fill(null);
    for (const x of p) værdier[(x.t - start) / 3_600_000] = x.v;
    return { startMs: start, opløsning: "1h", værdier };
}

/** Den normaliserede fil (time,mw) som serie — samme form, hentTidsserie giver. */
export function fraNormaliseret(tekst: string): Serie | null {
    const p: Punkt[] = [];
    for (const linje of tekst.split("\n").slice(1)) {
        if (!linje) continue;
        const [t, v] = linje.split(",");
        p.push({ t: Date.parse(t), v: Number(v) });
    }
    return fraPunkter(p);
}
