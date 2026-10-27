//-----------------------------------------------------------------------
// Varmelast i et scenarie (brief 18, KONTRAKT §6d). Ét valg blandt:
//   aktiv      FØLG værkets aktive tidsserie (standard) — den eneste, der ikke gemmes; ingen aktiv = syntetisk
//   syntetisk  modellens syntese — ALTID gemt som `_tidsserie.varmelast = "syntetisk"` (K5-F6)
//   tidsserie  en bestemt af værkets gyldige serier — ALTID gemt som `_tidsserie.varmelast = "<id>"`,
//              også hvis den tilfældigvis er den aktive (K5-F6)
//   repo       repoets hvidlistede fil (Scenarie.heat_csv) — vinder over den aktive serie
//
// Reglerne spejler startBestilling (rayfin/functions/src/logik.ts, §6d): prioritet = scenariets valg
// -> heat_csv -> værkets aktive -> syntetisk; den valgte fryses som `_koersel.tidsserie.varmelast` =
// {id, sha256} for BÅDE varmelast og solprofil (K5-F7, testet direkte mod bygFrossetInput i k5.spec.ts);
// under 95 % dækning af perioden afvises; to aktive serier afvises.
// Rene funktioner, testet i __tests__/varmelast.spec.ts.
//-----------------------------------------------------------------------

import type { Modelkoersel } from "@/lib/modelspejl";
import { KNAPPER } from "./viden.data";
import { datoTilFelt, værksperiode, type Blade, type Fund, type Ændring } from "./logik";

/** Det, scenarierne bruger af en `Tidsserie` (KONTRAKT §6d). */
export interface TidsserieInfo {
    id: string;
    rolle: string;
    navn: string;
    /** Valgfri i entiteten (sættes, når filen er skrevet); en gyldig serie har den. */
    sha256?: string | null;
    sti?: string | null;
    status: string;
    aktiv: boolean;
    start?: string | Date | null;
    slut?: string | Date | null;
    antal_huller?: number | null;
    oploesning?: string | null;
}

export type Varmelastvalg = { type: "aktiv" } | { type: "syntetisk" } | { type: "tidsserie"; id: string } | { type: "repo"; fil: string };

export const TIDSSERIE_STI = "_tidsserie.varmelast";
export const FROSSET_TIDSSERIE_STI = "_koersel.tidsserie.varmelast";
const SYNTETISK = "syntetisk";

/** Repoets hvidlistede varmelastfiler (knapper.json → maalt_varmelast). */
export const REPO_FILER: readonly string[] = KNAPPER.find((k) => k.id === "maalt_varmelast")?.valg[0]?.tilladte ?? [];

const varmelastSerier = (serier: readonly TidsserieInfo[]) => serier.filter((s) => s.rolle === "varmelast");
export const aktivSerie = (serier: readonly TidsserieInfo[]) => varmelastSerier(serier).find((s) => s.aktiv && s.status === "gyldig");

function iso(v: string | Date | null | undefined): string | undefined {
    if (!v) return undefined;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function serieperiode(s: TidsserieInfo): string {
    const a = iso(s.start), b = iso(s.slut);
    return a && b ? `${datoTilFelt(a.slice(0, 10))} – ${datoTilFelt(b.slice(0, 10))}` : "ukendt periode";
}

export interface Varmelastmulighed { valg: Varmelastvalg; nøgle: string; etiket: string }

export function valgNøgle(v: Varmelastvalg): string {
    return v.type === "tidsserie" ? `tidsserie:${v.id}` : v.type === "repo" ? `repo:${v.fil}` : v.type;
}

/** Valgmulighederne, i rækkefølge: aktiv (hvis der er en), syntetisk, andre gyldige serier, repoets filer for værket. */
export function varmelastMuligheder(serier: readonly TidsserieInfo[], rodKode: string): Varmelastmulighed[] {
    const ud: Varmelastmulighed[] = [];
    const aktiv = aktivSerie(serier);
    const add = (valg: Varmelastvalg, etiket: string) => ud.push({ valg, nøgle: valgNøgle(valg), etiket });
    add({ type: "aktiv" }, aktiv
        ? `Værkets aktive tidsserie: ${aktiv.navn} (${serieperiode(aktiv)})`
        : "Følg værkets aktive tidsserie (ingen aktiv nu — regnes syntetisk)");
    add({ type: "syntetisk" }, "Syntetisk (af værkets varmelastparametre og vejret)");
    for (const s of varmelastSerier(serier)) {
        if (s.status !== "gyldig") continue;
        add({ type: "tidsserie", id: s.id }, `Tidsserie: ${s.navn} (${serieperiode(s)})`);
    }
    for (const f of REPO_FILER) if (rodKode.startsWith(f.split("_")[0])) add({ type: "repo", fil: f }, `Repoets fil: ${f}`);
    return ud;
}

/**
 * Scenariets nuværende valg ud fra dets ændringer og heat_csv. Afhænger IKKE af, hvilke serier der er aktive
 * (K5-F6): et gemt id er et bestemt valg, ingen ændring er "følg den aktive". `serier` bevares i signaturen.
 */
export function læsVarmelast(ændringer: readonly Ændring[], heat_csv: string | null | undefined, serier: readonly TidsserieInfo[]): Varmelastvalg {
    void serier;
    if (heat_csv) return { type: "repo", fil: heat_csv };
    const æ = ændringer.find((x) => x.type === "set" && x.sti === TIDSSERIE_STI);
    let v: unknown;
    try { v = æ?.vaerdi_json ? JSON.parse(æ.vaerdi_json) : undefined; } catch { v = undefined; }
    if (v === SYNTETISK) return { type: "syntetisk" };
    if (typeof v === "string" && v) return { type: "tidsserie", id: v };
    return { type: "aktiv" };
}

/**
 * Valget -> den ene ændring på `_tidsserie.varmelast` (eller ingen) og Scenarie.heat_csv.
 * Kun "følg værkets aktive" gemmes ikke; et eksplicit valg gemmes altid, så det ikke skifter
 * betydning, når en serie senere (de)aktiveres (K5-F6).
 */
export function kodVarmelast(valg: Varmelastvalg, serier: readonly TidsserieInfo[]): { aendring?: Ændring; heat_csv: string | null } {
    void serier;
    const sæt = (v: string): Ændring => ({ type: "set", sti: TIDSSERIE_STI, vaerdi_json: JSON.stringify(v) });
    switch (valg.type) {
        case "aktiv": return { heat_csv: null };
        case "syntetisk": return { aendring: sæt(SYNTETISK), heat_csv: null };
        case "tidsserie": return { aendring: sæt(valg.id), heat_csv: null };
        // heat_csv vinder over den aktive serie i startBestilling; en tidsserie-ID SAMMEN med heat_csv afvises.
        case "repo": return { heat_csv: valg.fil };
    }
}

/** Den form, startBestilling fryser en tidsserie i: `_koersel.tidsserie.<rolle> = {id, sha256}` (K5-F7). */
export function frossetTidsserie(s: Pick<TidsserieInfo, "id" | "sha256">): string {
    return JSON.stringify({ id: s.id.toLowerCase(), sha256: s.sha256 ?? undefined });
}

/**
 * Seriene startBestilling fryser for et scenarie, pr. rolle (varmelast og solprofil), med samme prioritet:
 * scenariets valg `_tidsserie.<rolle>` -> (varmelast) heat_csv -> værkets aktive gyldige -> ingen.
 */
export function frosneSerier(ændringer: readonly Ændring[], heat_csv: string | null | undefined, serier: readonly TidsserieInfo[]): Map<string, TidsserieInfo> {
    const ud = new Map<string, TidsserieInfo>();
    const gyldige = serier.filter((s) => s.status === "gyldig");
    for (const rolle of ["varmelast", "solprofil"]) {
        const æ = ændringer.find((x) => x.type === "set" && x.sti === `_tidsserie.${rolle}`);
        let v: unknown;
        try { v = æ?.vaerdi_json ? JSON.parse(æ.vaerdi_json) : undefined; } catch { v = undefined; }
        let s: TidsserieInfo | undefined;
        if (v === SYNTETISK) s = undefined;
        else if (typeof v === "string" && v) s = gyldige.find((x) => x.id.toLowerCase() === v.toLowerCase());
        else if (!(rolle === "varmelast" && heat_csv)) s = gyldige.find((x) => x.rolle === rolle && x.aktiv);
        if (s) ud.set(rolle, s);
    }
    return ud;
}

/** Den serie, en kørsel med valget vil få frosset (undefined = syntetisk eller repo-fil). */
export function valgtSerie(valg: Varmelastvalg, serier: readonly TidsserieInfo[]): TidsserieInfo | undefined {
    if (valg.type === "aktiv") return aktivSerie(serier);
    if (valg.type === "tidsserie") return serier.find((s) => s.id === valg.id);
    return undefined;
}

const TIME = 3_600_000;
/** startBestilling afviser en varmelast, der dækker under denne andel af perioden (MIN_DAEKNING_VARMELAST). */
export const MIN_DAEKNING_VARMELAST = 0.95;

/**
 * Gyldighed og dækning. Scenariets datoer er inklusive hele døgn: serien skal dække fra
 * startdatoens første time til slutdatoens sidste time (timens start, UTC — som serierne er
 * normaliseret, §6d). Tom periode = værkets egen. Dækning og huller er advarsler; en afvist eller
 * forsvundet serie er en fejl.
 */
export function tjekVarmelast(valg: Varmelastvalg, serier: readonly TidsserieInfo[], periode: { start: string | null; slut: string | null }, blade?: Blade): Fund[] {
    if (valg.type === "syntetisk" || valg.type === "repo") return [];
    const s = valgtSerie(valg, serier);
    // "Følg værkets aktive" uden en aktiv serie er bare syntetisk — ingen fejl (K5-F6).
    if (!s && valg.type === "aktiv") return [];
    if (!s) return [{ niveau: "fejl", tekst: "Den valgte tidsserie findes ikke længere i værket — vælg en anden." }];
    if (s.rolle !== "varmelast") return [{ niveau: "fejl", tekst: `"${s.navn}" er ikke en varmelast-serie (${s.rolle}).` }];
    if (s.status !== "gyldig") return [{ niveau: "fejl", tekst: `Tidsserien "${s.navn}" er ikke gyldig (status: ${s.status}) og kan ikke bruges.` }];
    const fund: Fund[] = [];
    if (valg.type === "aktiv") {
        const aktive = varmelastSerier(serier).filter((x) => x.aktiv && x.status === "gyldig");
        if (aktive.length > 1) fund.push({ niveau: "fejl", tekst: `Værket har ${aktive.length} aktive varmelast-serier — gør kun én aktiv under Konfiguration → Tidsserier, eller vælg en bestemt serie her.` });
    }
    let start = periode.start, slut = periode.slut;
    if ((!start || !slut) && blade) { const v = værksperiode(blade); start = v?.start ?? null; slut = v?.slut ?? null; }
    const a = iso(s.start), b = iso(s.slut);
    if (start && slut && a && b) {
        // Som startBestilling: andelen af periodens timer (hele døgn, timens start i UTC), serien dækker.
        const fra = Date.parse(`${start}T00:00:00Z`), til = Date.parse(`${slut}T23:00:00Z`);
        const dækning = Math.max(0, Math.min(til, Date.parse(b)) - Math.max(fra, Date.parse(a)) + TIME) / (til - fra + TIME);
        if (dækning < 1) {
            const tekst = `Tidsserien "${s.navn}" dækker ${serieperiode(s)} — ${Math.floor(dækning * 100)} % af scenariets periode ${datoTilFelt(start)} – ${datoTilFelt(slut)}.`;
            fund.push(dækning < MIN_DAEKNING_VARMELAST
                ? { niveau: "fejl", tekst: `${tekst} Bestillingen afvises under ${MIN_DAEKNING_VARMELAST * 100} %; vælg en periode inden for serien eller en anden varmelast.` }
                : { niveau: "advarsel", tekst: `${tekst} De manglende timer mangler også i kørslen.` });
        }
    }
    if (s.antal_huller) fund.push({ niveau: "advarsel", tekst: `Tidsserien "${s.navn}" har ${s.antal_huller} huller; se valideringen under Konfiguration → Tidsserier.` });
    return fund;
}

/** Omvendt af valgNøgle (til <select>-værdier). */
export function valgFraNøgle(n: string): Varmelastvalg {
    if (n.startsWith("tidsserie:")) return { type: "tidsserie", id: n.slice("tidsserie:".length) };
    if (n.startsWith("repo:")) return { type: "repo", fil: n.slice("repo:".length) };
    return n === "aktiv" ? { type: "aktiv" } : { type: "syntetisk" };
}

type Side = { felter: { heat_csv: string | null }; aendringer: Ændring[] };

/**
 * Sætter varmelasten på begge sider af et knap-par: hver side får sit valg kodet (heat_csv og evt.
 * `_tidsserie.varmelast`). Knappens egen heat_csv erstattes. For "målt varmelast" er referencen
 * altid syntetisk — ellers ville en aktiv serie stille og roligt gøre referencen målt også.
 */
export function anvendVarmelast<P extends { reference: Side; scenarie: Side }>(par: P, refValg: Varmelastvalg, scenValg: Varmelastvalg, serier: readonly TidsserieInfo[]): P {
    for (const [side, valg] of [[par.reference, refValg], [par.scenarie, scenValg]] as const) {
        const k = kodVarmelast(valg, serier);
        side.felter.heat_csv = k.heat_csv;
        side.aendringer = [...side.aendringer.filter((a) => a.sti !== TIDSSERIE_STI), ...(k.aendring ? [k.aendring] : [])];
    }
    return par;
}

/** De målte varmelaster, knappen "målt varmelast" kan vælge imellem: gyldige serier (aktiv først) og repoets filer. */
export function maalteMuligheder(serier: readonly TidsserieInfo[], rodKode: string): Varmelastmulighed[] {
    const harAktiv = !!aktivSerie(serier);
    return varmelastMuligheder(serier, rodKode).filter((x) => x.valg.type !== "syntetisk" && (x.valg.type !== "aktiv" || harAktiv)
        && !(x.valg.type === "tidsserie" && x.valg.id === aktivSerie(serier)?.id));
}

/** "Målt varmelast" kan bruges, når værket har en gyldig varmelast-serie eller en repo-fil, der passer. */
export function maaltVarmelastMulig(knap: { id: string }, serier: readonly TidsserieInfo[], rodKode: string): boolean {
    return knap.id === "maalt_varmelast" && maalteMuligheder(serier, rodKode).length > 0;
}

/** Valget i ord til forhåndsvisning og tabeller: "syntetisk", "tidsserien Billund målt 2025–26", "repo-filen …". */
export function varmelastTekst(valg: Varmelastvalg, serier: readonly TidsserieInfo[]): string {
    if (valg.type === "syntetisk") return "syntetisk";
    if (valg.type === "aktiv" && !aktivSerie(serier)) return "syntetisk (ingen aktiv tidsserie)";
    if (valg.type === "repo") return `repo-filen ${valg.fil}`;
    const s = valgtSerie(valg, serier);
    return s ? `tidsserien ${s.navn}` : "ukendt tidsserie";
}

/**
 * Standardvarmelasten for et nyt par: værkets aktive tidsserie, hvis det har en (et bevidst valg på værket); ellers
 * modelrepoets målte fil for casen (fx Spor B: billund_abvaerk_hourly_splejset_jun2026.csv, README.md:177), hvis den
 * er en mulighed; ellers "følg værkets aktive" (= syntetisk).
 */
export function standardVarmelastvalg(mk: Modelkoersel | undefined, serier: readonly TidsserieInfo[],
    muligheder: readonly { nøgle: string }[]): Varmelastvalg {
    if (aktivSerie(serier) || !mk?.heat_csv) return { type: "aktiv" };
    const repo: Varmelastvalg = { type: "repo", fil: mk.heat_csv };
    return muligheder.some((m) => m.nøgle === valgNøgle(repo)) ? repo : { type: "aktiv" };
}
