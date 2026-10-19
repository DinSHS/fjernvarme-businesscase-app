//-----------------------------------------------------------------------
// Redigering af et værk: brugerens input -> typestreng vaerdi_json ->
// én liste af ændringer til `gemVaerksaendringer` (én anmodning, én
// transaktion, værkets revision). Ren logik.
//-----------------------------------------------------------------------

import { Inputfejl, kodVaerdi, værditype } from "@/lib/data/vaerdi";
import type { Parameterændring } from "@/lib/data/skriv";
import { MAKS } from "../../../rayfin/data/fjv.constants";
import { ENHEDSTYPER, type FeltPost, findFelt } from "./katalog";
import type { Blad } from "./gruppering";

/** Ét redigeret felt: det brugeren skrev, og hvad det kodes til (eller hvorfor ikke). */
export interface Kladde { tekst: string; json: string | null; fejl: string | null }
export type Udkast = ReadonlyMap<string, Kladde>;

/**
 * Koder input til et blad. Typen kommer fra den GAMLE værdi (kodVaerdi), så
 * 12.0 forbliver decimaltal. Er den gamle værdi tom (null), bruges
 * katalogets type, så "380" i et decimalfelt bliver 380.0 og ikke heltal.
 */
export function kodFelt(post: FeltPost | null, gammel: string | null, input: string): string {
    const tom = gammel === null || værditype(gammel) === "tom";
    if (tom) {
        if (input.trim() === "") return "null";
        if (post?.type === "number") return kodVaerdi("0.0", input);
        if (post?.type === "integer") return kodVaerdi("0", input);
        if (post?.type === "boolean") return kodVaerdi("true", input);
        if (post?.type === "string" || (post?.type === "enum" && typeof post.tilladte?.[0] !== "number")) return kodVaerdi('""', input);
        return kodVaerdi(null, input);
    }
    return kodVaerdi(gammel, input);
}

export function kladde(post: FeltPost | null, gammel: string | null, tekst: string): Kladde {
    try {
        return { tekst, json: kodFelt(post, gammel, tekst), fejl: null };
    } catch (e) {
        return { tekst, json: null, fejl: e instanceof Inputfejl ? e.message : String(e) };
    }
}

/** De felter i udkastet, der faktisk er ændret, som `ret`-handlinger. Inputfejl blokerer. */
export function ændringerFraUdkast(udkast: Udkast, nu: ReadonlyMap<string, string>): { ændringer: Parameterændring[]; fejl: { sti: string; besked: string }[] } {
    const ændringer: Parameterændring[] = [];
    const fejl: { sti: string; besked: string }[] = [];
    for (const [sti, k] of udkast) {
        if (k.fejl || k.json === null) { fejl.push({ sti, besked: k.fejl ?? "Værdien kan ikke læses." }); continue; }
        const gammel = nu.get(sti);
        if (gammel === undefined) { fejl.push({ sti, besked: "Feltet findes ikke længere i værket — genindlæs." }); continue; }
        if (k.json !== gammel) ændringer.push({ sti, handling: "ret", ny_json: k.json });
    }
    return { ændringer, fejl };
}

/** Værket som det ville se ud efter ændringerne (til validering før gem). */
export function anvend(nu: ReadonlyMap<string, string>, ændringer: readonly Parameterændring[]): Map<string, string> {
    const m = new Map(nu);
    for (const æ of ændringer) {
        if (æ.handling === "slet") m.delete(æ.sti);
        else m.set(æ.sti, æ.ny_json ?? "null");
    }
    return m;
}

/** Den tekst `gemVaerksaendringer` sender — samme form, så længden kan tjekkes før afsendelse. */
export function anmodningsLængde(ændringer: readonly Parameterændring[]): number {
    return JSON.stringify(ændringer.map((æ) => ({ sti: æ.sti, handling: æ.handling, ...(æ.handling === "slet" ? {} : { ny_json: æ.ny_json }) }))).length;
}
export const MAKS_ANMODNING = MAKS.json;

// ------------------------------------------------------------------ lister

/** En celle i en liste under redigering: brugerens tekst og den værdi, typen arves fra. */
export interface Celle { tekst: string; base: string }

/** Bygger listens JSON af cellerne; kaster Inputfejl med celleangivelse. */
export function listeJson(kolonner: readonly string[] | null, rækker: readonly (readonly Celle[])[]): string {
    const kod = (c: Celle, hvor: string) => {
        try { return kodVaerdi(c.base === "null" ? null : c.base, c.tekst); } catch (e) {
            throw new Inputfejl(`${hvor}: ${e instanceof Error ? e.message : String(e)}`);
        }
    };
    if (kolonner) {
        return `[${rækker.map((r, i) => `{${kolonner.map((n, j) => `${JSON.stringify(n)}:${kod(r[j], `række ${i + 1}, ${n}`)}`).join(",")}}`).join(",")}]`;
    }
    return `[${rækker.map((r, i) => kod(r[0], `element ${i + 1}`)).join(",")}]`;
}

// ------------------------------------------------------------------ ny enhed

export const NAVN_MOENSTER = /^[a-z0-9_]+$/;

/** Fejltekst for et nyt enheds-/lagernavn, eller null hvis det er i orden. */
export function tjekNavn(navn: string, optaget: { units: ReadonlySet<string>; storage: ReadonlySet<string> }): string | null {
    if (!navn) return "Giv enheden et navn.";
    if (!NAVN_MOENSTER.test(navn)) return "Navnet må kun indeholde små bogstaver, cifre og _ (fx vp_ny).";
    if (navn.length > 60) return "Navnet må højst være 60 tegn.";
    if (optaget.units.has(navn)) return `Der findes allerede en enhed ved navn ${navn}.`;
    if (optaget.storage.has(navn)) return `Der findes et lager ved navn ${navn} — til/fra i et scenarie kan ikke skelne dem.`;
    return null;
}

/**
 * `opret`-handlinger for en ny enhed: typens skabelon (enhedstyper.json) med
 * brugerens værdier for de felter, der er udfyldt. `værdier` er relative
 * stier (`p_max_heat`) -> input-tekst; de kodes efter skabelonens type.
 */
export function nyEnhed(type: string, navn: string, værdier: ReadonlyMap<string, string>): { ændringer: Parameterændring[]; fejl: { sti: string; besked: string }[] } {
    const t = ENHEDSTYPER[type];
    if (!t) return { ændringer: [], fejl: [{ sti: "type", besked: `Ukendt enhedstype ${type}.` }] };
    const ændringer: Parameterændring[] = [];
    const fejl: { sti: string; besked: string }[] = [];
    for (const s of t.skabelon) {
        const sti = `units.${navn}.${s.sti}`;
        const input = værdier.get(s.sti);
        if (input === undefined || s.sti === "type") { ændringer.push({ sti, handling: "opret", ny_json: s.vaerdi_json }); continue; }
        const k = kladde(findFelt(sti), s.vaerdi_json, input);
        if (k.fejl || k.json === null) fejl.push({ sti: s.sti, besked: k.fejl ?? "Kan ikke læses." });
        else ændringer.push({ sti, handling: "opret", ny_json: k.json });
    }
    return { ændringer, fejl };
}

// ------------------------------------------------------------------ fjern enhed

export interface Fjernelse {
    /** `slet` for enhedens blade og for balanceringslofter, der kun gælder den. */
    ændringer: Parameterændring[];
    /** Balanceringslofter, der slettes med (vises til brugeren). */
    medslettes: string[];
    /** Steder der nævner enheden ved navn og IKKE slettes automatisk (giver valideringsfejl). */
    nævnt: string[];
}

export function fjernObjekt(sektion: "units" | "storage", navn: string, blade: readonly Blad[]): Fjernelse {
    const pre = `${sektion}.${navn}.`;
    const egne = blade.filter((b) => b.sti.startsWith(pre)).map((b) => b.sti);
    const medslettes = sektion === "units"
        ? blade.map((b) => b.sti).filter((s) => s.startsWith(`balancing.ancillary_caps.per_unit_mw.${navn}`) && s.split(".").length === 4
            || s.startsWith(`balancing.ancillary_caps.per_unit_market_mw.${navn}.`))
        : [];
    const nævnt = sektion === "units"
        ? blade.filter((b) => (b.sti.endsWith(".reference_unit") && b.vaerdi_json === JSON.stringify(navn))
            || (/^ancillary_groups\.[^.]+\.units$/.test(b.sti) && b.vaerdi_json.includes(JSON.stringify(navn)))).map((b) => b.sti)
        : [];
    return { ændringer: [...egne, ...medslettes].map((sti) => ({ sti, handling: "slet" as const })), medslettes, nævnt };
}

/** Scenarier, der peger på enheden/lageret (til/fra på navnet eller en `set` under det). */
export function scenarieReferencer(
    sektion: "units" | "storage", navn: string,
    ændringer: readonly { scenarie_id: string; type: string; sti: string }[],
): Set<string> {
    const pre = `${sektion}.${navn}.`;
    return new Set(ændringer.filter((æ) => (æ.type === "set" ? æ.sti.startsWith(pre) : æ.sti === navn || æ.sti.startsWith(pre))).map((æ) => æ.scenarie_id));
}
