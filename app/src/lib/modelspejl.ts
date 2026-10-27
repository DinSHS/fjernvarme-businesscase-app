//-----------------------------------------------------------------------
// Modelrepoets antagelser ved den pinnede commit, som appen bruger dem (runde 8, fv-trofast).
// Data: modelspejl.data.ts (GENERERET af viden/vaerktoej/byg_modelspejl.py fra cases/*.yaml og
// README.md ved model_commit). Princip: modelrepoet er sandheden; hvor appen afviger, siger den det.
//-----------------------------------------------------------------------

import { MODELSPEJL } from "./modelspejl.data";

/** Én kørselskommando, modelrepoet selv angiver for en case (casens hoved eller README's referencetabel). */
export interface Modelkoersel {
    /** fil:linje i modelrepoet, fx "README.md:177" eller "cases/billund_sporB.yaml:17-19". */
    kilde: string;
    kommando: string;
    med_balancering: boolean;
    /** Målt varmelast: filnavn i modelrepoets data/ (null = syntetisk). */
    heat_csv: string | null;
    start: string | null;
    slut: string | null;
    balancing_method: string | null;
    /** --data-source-værdien (modelrepoet: altid github). */
    data_source?: string | null;
    /** Fortolkede flag, appens standardkørsel IKKE oversætter (K8 F5). Skal være tomt for en standardkommando. */
    ekstra?: string[];
}

export interface Spejlcase {
    fil: string;
    /** Casens egen første kommando, ellers README's første; null = modelrepoet angiver ingen. */
    standard: Modelkoersel | null;
    kommandoer: Modelkoersel[];
    /** sti -> [vaerdi_json, linje i casefilen]. */
    blade: Record<string, [string, number]>;
}

export interface Modelspejl { model_commit: string; cases: Record<string, Spejlcase> }

export const SPEJL_COMMIT = MODELSPEJL.model_commit;
const kort = (sha: string | null | undefined) => (sha ?? "").slice(0, 7);

/** Repo-casen et værk stammer fra (rodkoden: værket selv eller den repo-case, det er kopieret fra). */
export function spejlcase(rodKode: string | undefined): Spejlcase | undefined {
    return rodKode ? MODELSPEJL.cases[rodKode] : undefined;
}

/** Modelrepoets standardkørsel for casen — undefined = modelrepoet angiver ingen (appens valg er en egen antagelse). */
export function modelKoersel(rodKode: string | undefined): Modelkoersel | undefined {
    return spejlcase(rodKode)?.standard ?? undefined;
}

/** "README.md:177 @ eef950a" */
export function kildeMedCommit(kilde: string): string {
    return `${kilde} @ ${kort(SPEJL_COMMIT)}`;
}

/** Tekst om, hvor standarden for balancemarked og varmelast kommer fra. */
export function koerselskilde(rodKode: string | undefined): string {
    const c = spejlcase(rodKode);
    if (!c) return "Egen antagelse: værket findes ikke i modelrepoet, så appen kører uden balancemarked og med værkets egen varmelast, indtil du vælger andet.";
    if (!c.standard) return `Egen antagelse: modelrepoet angiver ingen kørsel af ${c.fil} (${kort(SPEJL_COMMIT)}), så appen kører uden balancemarked og med syntetisk varmelast, indtil du vælger andet.`;
    return `Som modelrepoet kører ${c.fil}: ${c.standard.med_balancering ? "med" : "uden"} balancemarked, ${c.standard.heat_csv ? `målt varmelast ${c.standard.heat_csv}` : "syntetisk varmelast"} (${kildeMedCommit(c.standard.kilde)}).`;
}

/** Kilde til et blad i en repo-case: "cases/andeby.yaml:181 @ eef950a" (undefined, hvis stien ikke står i casen). */
export function bladkilde(rodKode: string | undefined, sti: string): string | undefined {
    const c = spejlcase(rodKode);
    const b = c?.blade[sti];
    return c && b ? `${c.fil}:${b[1]} @ ${kort(SPEJL_COMMIT)}` : undefined;
}

export interface Afdrift {
    /** Værkets importcommit (Vaerk.repo_commit) er ikke den pinnede. */
    gammelCommit: boolean;
    /** Blade, hvor værkets værdi ikke er casens ved den pinnede commit. */
    afviger: { sti: string; vaerk: string; model: string; linje: number }[];
    /** Blade, der står i casen, men ikke i værket. */
    mangler: string[];
    /** Blade i værket, der ikke står i casen. */
    ekstra: string[];
}

/**
 * Afdrift mellem et værk fra modelrepoet og casefilen ved den pinnede commit, for `kilde = "repo"` — UANSET revision
 * (K8 F3: et rettet værk sammenlignes også; at det beskyttes mod genimport er et andet spørgsmål).
 * undefined = intet at sammenligne (ikke et repoværk, eller casen findes ikke i spejlet).
 */
export function afdrift(vaerk: { kode: string; kilde: string; revision: number; repo_commit?: string | null },
    blade: ReadonlyMap<string, string> | undefined): Afdrift | undefined {
    if (vaerk.kilde !== "repo" || !blade) return undefined;
    const c = MODELSPEJL.cases[vaerk.kode];
    if (!c) return undefined;
    const gammelCommit = !!vaerk.repo_commit && !SPEJL_COMMIT.startsWith(vaerk.repo_commit) && !vaerk.repo_commit.startsWith(SPEJL_COMMIT);
    const afviger: Afdrift["afviger"] = [];
    const mangler: string[] = [];
    for (const [sti, [v, linje]] of Object.entries(c.blade)) {
        const b = blade.get(sti);
        if (b === undefined) mangler.push(sti);
        else if (b !== v) afviger.push({ sti, vaerk: b, model: v, linje });
    }
    const ekstra = [...blade.keys()].filter((s) => !(s in c.blade));
    return { gammelCommit, afviger, mangler, ekstra };
}

/** Afviger værdierne? (En ældre importcommit med samme værdier er information, ikke afdrift.) */
export const harAfdrift = (a: Afdrift | undefined) => !!a && (a.afviger.length > 0 || a.mangler.length > 0 || a.ekstra.length > 0);
