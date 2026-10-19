//-----------------------------------------------------------------------
// Laver Rayfin-klientens "sniffede" værdier om til de typer, kolonnerne har.
// Baggrund i felter.ts. Alle læsninger går gennem `normaliser()`.
//-----------------------------------------------------------------------

import type { Feltsæt, Entitet } from "./felter";

/** En tekstkolonne, som klienten har gjort til boolean eller Date, tilbage til strengen databasen har. */
export function somTekst(v: unknown): unknown {
    if (typeof v === "boolean") return v ? "true" : "false";
    if (v instanceof Date) {
        // Klienten laver kun ISO-formede strenge om: "2026-01-05" -> UTC-midnat. En ren dato
        // genskabes præcist; et tidspunkt genskabes som ISO med Z.
        const iso = v.toISOString();
        return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
    }
    return v;
}

/** En datokolonne som Date. DAB sender ISO med Z; mangler zonen, læses den som UTC — aldrig lokal tid. */
export function somDato(v: unknown): Date | null {
    if (v == null || v === "") return null;
    if (v instanceof Date) return v;
    if (typeof v === "string") {
        const s = /[zZ]|[+-]\d{2}:\d{2}$/.test(v) ? v : `${v}Z`;
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}

/** En talkolonne som tal (DAB sender tal; en streng accepteres for en sikkerheds skyld). */
export function somTal(v: unknown): number | null {
    if (v == null || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

export function normaliser<E extends Entitet, T>(række: Record<string, unknown>, felter: Feltsæt<E>): T {
    const ud: Record<string, unknown> = { ...række };
    for (const f of felter.tekst) if (f in ud) ud[f] = somTekst(ud[f]);
    for (const f of felter.dato) if (f in ud) ud[f] = somDato(ud[f]);
    for (const f of felter.tal) if (f in ud) ud[f] = somTal(ud[f]);
    for (const f of ["id", "vaerk_id", "scenarie_id", "koersel_id", "bestilling_id", "kopieret_fra_id", "anmodning_id", "reference_scenarie_id"]) {
        if (typeof ud[f] === "string") ud[f] = (ud[f] as string).toLowerCase();
    }
    return ud as T;
}
