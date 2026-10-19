//-----------------------------------------------------------------------
// Fanen Tidsserier: konstanter og små rene hjælpere (testet).
//-----------------------------------------------------------------------

import { aktive } from "./tidsserie-budskaber";
import { DATAKRAV } from "./datakrav.data";
import { MAKS_TIDSSERIE_BYTES, MAKS_VAERKSARK_BYTES as SKRIV_MAKS_VAERKSARK } from "@/lib/data/skriv";
import type { TidsserieRække } from "./tidsserie-kilde";

/**
 * Største fil, der sendes: den strengeste af data_krav's max_bytes og appens Functions-grænse (et kald tager højst
 * 4 MB, og filen sendes som base64). Et helt år i kvarterer er ca. 1,2 MB.
 */
export const MAKS_UPLOAD_BYTES = Math.min(DATAKRAV.graenser.max_bytes, MAKS_TIDSSERIE_BYTES);
/** Markøren fv-fabric2 bruger for "værkets solprofil-tidsserie" i production_profile_path. */
export const SOLPROFIL_MARKØR = "tidsserie:solprofil";

/** Hvilke tidsserier en kørsel af værket bruger i dag, uden et scenarie, der vælger andet. */
export function brugerNu(blade: ReadonlyMap<string, string>, rækker: readonly TidsserieRække[]) {
    const a = aktive(rækker);
    const varme = a.get("varmelast") ?? [];
    const sol = a.get("solprofil") ?? [];
    const profiler: { enhed: string; sti: string }[] = [];
    for (const [sti, v] of blade) {
        const m = /^units\.([^.]+)\.production_profile_path$/.exec(sti);
        if (!m) continue;
        try { const p = JSON.parse(v) as unknown; if (typeof p === "string" && p) profiler.push({ enhed: m[1], sti: p }); } catch { /* ikke en sti */ }
    }
    return { varme, sol, profiler };
}

/** UTF-8, og ellers Windows-1252 (dansk Excel gemmer CSV sådan). */
export function afkod(bytes: ArrayBuffer): { tekst: string; tegnsæt: "UTF-8" | "Windows-1252" } {
    try { return { tekst: new TextDecoder("utf-8", { fatal: true }).decode(bytes), tegnsæt: "UTF-8" }; }
    catch { return { tekst: new TextDecoder("windows-1252").decode(bytes), tegnsæt: "Windows-1252" }; }
}


/** Bytes som base64 (i bidder, så store filer ikke sprænger argumentlisten til fromCharCode). */
export function tilBase64(bytes: ArrayBuffer): string {
    const u = new Uint8Array(bytes);
    let s = "";
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
}

/** Største værksark, der sendes = skrivevejens og Function'ens grænse (K5-F13); skabelonen er ca. 21 kB. */
export const MAKS_VAERKSARK_BYTES = SKRIV_MAKS_VAERKSARK;

export const IMPORT_STATUS: Record<string, { tekst: string; tone: "neutral" | "ok" | "advarsel" | "fejl" }> = {
    koe: { tekst: "I kø", tone: "neutral" },
    koerer: { tekst: "Importerer", tone: "advarsel" },
    faerdig: { tekst: "Færdig", tone: "ok" },
    fejl: { tekst: "Fejl", tone: "fejl" },
};

/**
 * Værkets units/storage som træ (feltnavn → JSON-værdi) — det oraklet kalder "værkets effektive case" og
 * bruger til de værksafhængige regler (over_kapacitet, sol_*).
 */
export function værkstræ(blade: ReadonlyMap<string, string>): { units: Record<string, Record<string, unknown>>; storage: Record<string, Record<string, unknown>> } {
    const træ = { units: {} as Record<string, Record<string, unknown>>, storage: {} as Record<string, Record<string, unknown>> };
    for (const [sti, json] of blade) {
        const m = /^(units|storage)\.([^.]+)\.([^.]+)$/.exec(sti);
        if (!m) continue;
        let v: unknown;
        try { v = JSON.parse(json); } catch { continue; }
        const del = træ[m[1] as "units" | "storage"];
        (del[m[2]] ??= {})[m[3]] = v;
    }
    return træ;
}

/** Sidens tjek af et valgt værksark — samme grænse og filtype som skrivehjælperen, så knappen aldrig lover for meget. */
export function vaerksarkFejl(fil: { name: string; size: number }): string | null {
    const mb = (b: number) => (b / 1_000_000).toLocaleString("da-DK", { maximumFractionDigits: 1 });
    if (!/\.xlsx$/i.test(fil.name)) return "Vælg det udfyldte værksark (.xlsx).";
    if (fil.size > MAKS_VAERKSARK_BYTES) return `Værksarket er for stort (${mb(fil.size)} MB; højst ${mb(MAKS_VAERKSARK_BYTES)} MB).`;
    return null;
}
