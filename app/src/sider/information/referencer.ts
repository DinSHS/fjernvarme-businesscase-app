//-----------------------------------------------------------------------
// Referencetal: README's tabel (viden/referencetal.json, gruppen "readme") sammenholdt med de kørsler,
// der findes i databasen. Ren logik — ingen React — så den kan testes mod de rigtige tal.
//
// En kørsel regnes som "samme reference", når den har samme VÆRK og et scenarie med samme periode,
// balancering, balanceringsmetode, varmelast og flag — og scenariet har ingen ændringer — og kørslen er
// regnet med SAMME ELLER STRAMMERE solvergab end casens eget. Ellers ville en kørsel af "Spor A uden tank"
// stå som Spor A-ankeret, og en forskel i objektiv ville se ud som en fejl i modellen i stedet for den
// forskel, den er. Gab og tidsgrænse er solverens indstillinger og indgår derfor ikke i "samme opsætning":
// en strammere kørsel er en lige så god (og ofte bedre) måling af det samme tal. HiGHS minimerer, så objektivet kan kun være for
// HØJT: en strammere kørsel ligger typisk op til tolerancen UNDER README-tallet, ikke over det.
//-----------------------------------------------------------------------

import type { FjvSchema } from "../../../rayfin/data/schema";

type Koersel = FjvSchema["Koersel"];
type Scenarie = FjvSchema["Scenarie"];
type Vaerk = FjvSchema["Vaerk"];

export interface ReferenceScenarie {
    periode_start: string | null;
    periode_slut: string | null;
    med_balancering: boolean;
    balancing_method: string | null;
    mip_rel_gap: number | null;
    mip_abs_gap: number | null;
    tidsgraense_s: number | null;
    ekstra_flag: string | null;
    heat_csv: string | null;
}

export interface Reference {
    id: string;
    navn: string;
    vindue: string;
    kode: string;
    scenarie: ReferenceScenarie;
    objektiv: number;
    /** Casens eget solvergab (fra referencetal.json → case_gab); null = ikke oplyst. */
    caseGab: { rel: number | null; abs: number | null };
    /** Absolut tolerance i kr. fra kilden (README) — null, når kilden angiver et procentgab i stedet. */
    toleranceKr: number | null;
    /** Opnået gab i procent, når README ikke angiver en kronetolerance (Andeby helår med balancering). */
    gabPct: number | null;
    loesetid: string | null;
    noter: string[];
    kilde: string;
    /** Modelversionen, tallene er regnet ved (referencetal.json → model_commit); kun kørsler ved den er en måling af dem. */
    modelCommit: string | null;
}

interface RåReference {
    id: string; navn: string; vindue: string;
    vaerk: { kode: string };
    scenarie: Partial<ReferenceScenarie>;
    case_gab?: { mip_rel_gap?: number | null; mip_abs_gap?: number | null } | null;
    forventet: { objektiv_dkk: number; tolerance_dkk?: number | null; opnaaet_gab_pct?: number | null };
    loesetid?: string; noter?: string[]; kilde?: string;
}

/** README-gruppen af referencetal. Kaster en læsbar fejl, hvis filen ikke har den form. */
export function laesReferencer(json: string): Reference[] {
    const rå = JSON.parse(json) as { model_commit?: string; grupper?: { id: string; referencer?: RåReference[] }[] };
    const gruppe = rå.grupper?.find((g) => g.id === "readme");
    if (!gruppe?.referencer?.length) throw new Error("referencetal.json har ingen gruppe «readme» med referencer.");
    return gruppe.referencer.map((r) => {
        if (typeof r.forventet?.objektiv_dkk !== "number") throw new Error(`Referencen ${r.id} mangler et forventet objektiv.`);
        const s = r.scenarie ?? {};
        return {
            id: r.id, navn: r.navn, vindue: r.vindue, kode: r.vaerk.kode,
            scenarie: {
                periode_start: s.periode_start ?? null, periode_slut: s.periode_slut ?? null,
                med_balancering: s.med_balancering ?? false, balancing_method: s.balancing_method ?? null,
                mip_rel_gap: s.mip_rel_gap ?? null, mip_abs_gap: s.mip_abs_gap ?? null, tidsgraense_s: s.tidsgraense_s ?? null,
                ekstra_flag: s.ekstra_flag ?? null, heat_csv: s.heat_csv ?? null,
            },
            objektiv: r.forventet.objektiv_dkk,
            caseGab: { rel: r.case_gab?.mip_rel_gap ?? null, abs: r.case_gab?.mip_abs_gap ?? null },
            toleranceKr: r.forventet.tolerance_dkk ?? null,
            gabPct: r.forventet.opnaaet_gab_pct ?? null,
            loesetid: r.loesetid ?? null, noter: r.noter ?? [], kilde: r.kilde ?? "",
            modelCommit: typeof rå.model_commit === "string" ? rå.model_commit : null,
        };
    });
}

const ens = <T>(a: T | null | undefined, b: T | null | undefined) => (a ?? null) === (b ?? null);

/**
 * Har scenariet referencens opsætning (periode, balancering, metode, varmelast, flag)? Solverens gab og tidsgrænse
 * sammenlignes ikke her, men i `kørslensGab`. Ændringer kontrolleres separat (`byggRaekker`).
 */
export function harReferencensOpsaetning(s: Scenarie, r: Reference): boolean {
    const x = r.scenarie;
    return ens(s.periode_start, x.periode_start) && ens(s.periode_slut, x.periode_slut)
        && s.med_balancering === x.med_balancering && ens(s.balancing_method, x.balancing_method)
        && ens(s.ekstra_flag, x.ekstra_flag) && ens(s.heat_csv, x.heat_csv);
}

export interface KoerselGab {
    /** Det gab kørslen blev regnet med (ønsket), brøk resp. kr.; null = ikke oplyst. */
    rel: number | null;
    abs: number | null;
    /** Det opnåede relative gab (brøk), når solveren har rapporteret det. */
    opnaaet: number | null;
    /** Samme eller strammere end casens eget — kun da er kørslen en måling af README-tallet. */
    erTilladt: boolean;
    /** Strengere end casen på mindst ét af de to gab. */
    erStrammere: boolean;
}

const EPS = 1e-12;
const num = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Kørslens effektive gab: det frosne (`oensket_*_gap`), ellers scenariets eget, ellers casens (= README). Et
 * gab, der ikke kan afgøres, regnes som casens — det er det, kørslen faktisk bruger, når intet er sat.
 */
export function kørslensGab(k: Koersel, s: Scenarie, r: Reference): KoerselGab {
    const rel = num(k.oensket_rel_gap) ?? num(s.mip_rel_gap) ?? r.caseGab.rel;
    const abs = num(k.oensket_abs_gap) ?? num(s.mip_abs_gap) ?? r.caseGab.abs;
    const { rel: cr, abs: ca } = r.caseGab;
    const relOk = rel === null || cr === null || rel <= cr + EPS;
    const absOk = abs === null || ca === null || abs <= ca + EPS;
    const relStram = rel !== null && cr !== null && rel < cr - EPS;
    const absStram = abs !== null && ca !== null && abs < ca - EPS;
    return { rel, abs, opnaaet: num(k.opnaaet_gap), erTilladt: relOk && absOk, erStrammere: relOk && absOk && (relStram || absStram) };
}

export interface Kandidat { koersel: Koersel; scenarie: Scenarie; gab: KoerselGab }

const tidspunkt = (k: Koersel) => new Date(k.afsluttet ?? k.bestilt ?? 0).getTime();

/**
 * Færdige kørsler af referencens værk ved referencetallenes modelversion, med referencens opsætning og samme eller
 * strammere gab, nyeste først. En kørsel ved en anden modelversion er ikke en måling af tallet: efter rettelserne
 * 19/10-2026 (eef950a) ligger fx Spor A-ankeret 371.000 kr. højere end ved b49aeb0, uden at nogen af dem er forkert.
 */
export function kandidater(r: Reference, vaerker: readonly Vaerk[], scenarier: readonly Scenarie[], koersler: readonly Koersel[]): Kandidat[] {
    const vaerk = vaerker.find((v) => v.kode === r.kode);
    if (!vaerk) return [];
    const scen = new Map(scenarier.map((s) => [s.id, s]));
    return koersler
        .filter((k) => k.vaerk_id === vaerk.id && k.status === "faerdig" && typeof k.objektiv_dkk === "number"
            && (r.modelCommit === null || k.model_commit === r.modelCommit))
        .flatMap((k): Kandidat[] => {
            const s = scen.get(k.scenarie_id);
            if (!s || !harReferencensOpsaetning(s, r)) return [];
            const gab = kørslensGab(k, s, r);
            return gab.erTilladt ? [{ koersel: k, scenarie: s, gab }] : [];
        })
        .sort((a, b) => tidspunkt(b.koersel) - tidspunkt(a.koersel));
}

export interface Vurdering {
    /** Fabric − README, kr. */
    diff: number;
    /** Som brøk af README-tallet. */
    brøk: number;
    /** Den tilladte afstand i kr., eller null når kilden ikke angiver nogen. */
    tolerance: number | null;
    /** Inden for tolerancen? null = ikke afgørbart. */
    indenfor: boolean | null;
}

/** Tolerancen er det, README selv tillader: kronebeløbet, ellers det opnåede gab af objektivet. */
export function toleranceFor(r: Reference): number | null {
    if (r.toleranceKr !== null) return r.toleranceKr;
    if (r.gabPct !== null) return Math.round((r.objektiv * r.gabPct) / 100);
    return null;
}

export function vurder(r: Reference, fabric: number): Vurdering {
    const diff = fabric - r.objektiv;
    const tolerance = toleranceFor(r);
    return { diff, brøk: r.objektiv === 0 ? 0 : diff / r.objektiv, tolerance, indenfor: tolerance === null ? null : Math.abs(diff) <= tolerance };
}

export type RefTilstand =
    /** Ingen færdig kørsel med referencens opsætning. */
    | "ikke-koert"
    /** Der findes kørsler af værket med samme felter, men alle er scenarier med ændringer: ingen af dem er referencen. */
    | "aendret"
    | "indenfor"
    | "udenfor"
    /** En ren kørsel findes, men README angiver ingen tolerance at måle den mod. */
    | "uafgoerligt";

export interface RefRække {
    ref: Reference;
    kandidat?: Kandidat;
    vurdering?: Vurdering;
    tilstand: RefTilstand;
}

/**
 * Pr. reference: den nyeste kandidat uden scenarie-ændringer. `aendringer` er antal ændringer pr. scenarie-id
 * (et scenarie uden række i kortet regnes som uden ændringer — kortet skal derfor være bygget af ALLE kandidaters id'er).
 */
export function byggRaekker(refs: readonly Reference[], vaerker: readonly Vaerk[], scenarier: readonly Scenarie[], koersler: readonly Koersel[],
    aendringer: ReadonlyMap<string, number>): RefRække[] {
    return refs.map((ref) => {
        const alle = kandidater(ref, vaerker, scenarier, koersler);
        const ren = alle.find((k) => (aendringer.get(k.scenarie.id) ?? 0) === 0);
        if (!ren) return { ref, kandidat: alle[0], tilstand: alle.length ? "aendret" : "ikke-koert" } satisfies RefRække;
        const vurdering = vurder(ref, ren.koersel.objektiv_dkk as number);
        return { ref, kandidat: ren, vurdering, tilstand: vurdering.indenfor === null ? "uafgoerligt" : vurdering.indenfor ? "indenfor" : "udenfor" } satisfies RefRække;
    });
}

/** Scenarie-id'er, der skal tjekkes for ændringer, før en kandidat må kaldes en ren reference. */
export function kandidatScenarier(refs: readonly Reference[], vaerker: readonly Vaerk[], scenarier: readonly Scenarie[], koersler: readonly Koersel[]): string[] {
    return [...new Set(refs.flatMap((r) => kandidater(r, vaerker, scenarier, koersler).map((k) => k.scenarie.id)))];
}

//-- Spor B mod Billunds afregning (rapport v4 tabel 5.1) ----------------------

export interface SporBRække { post: string; realiseret: number; model: number; forhold_pct: number }
/** Den gældende validering efter modelrettelserne 19/10-2026 (README); kun totaler — opdelingen pr. produkt er rapportens. */
export interface SporBGaeldende { i_alt_pct: number; afrr_pct: number; mfrr_pct: number; kilde: string }
export interface SporB { navn: string; kilde: string; raekker: SporBRække[]; forbehold?: string; note?: string; gaeldende?: SporBGaeldende }

/**
 * Med `gaeldende`: "Modellen ramte 120 % … (aFRR 109 %, mFRR 129 %)" fra README; tabellen er så historisk.
 * Uden: "Modellen ramte 121 % af Billunds balanceindtægt; størst afvigelse: mFRR, kapacitet (139 %)." — regnet af tabellen.
 */
export function sporBBudskab(s: SporB): string {
    const g = s.gaeldende;
    if (g) return `Modellen ramte ${g.i_alt_pct} % af Billunds realiserede balanceindtægt (aFRR ${g.afrr_pct} %, mFRR ${g.mfrr_pct} %) efter rettelserne 19. oktober 2026.`;
    const i_alt = s.raekker.find((r) => r.post === "I alt") ?? s.raekker[s.raekker.length - 1];
    const resten = s.raekker.filter((r) => r !== i_alt);
    const størst = resten.reduce<SporBRække | undefined>((m, r) => (!m || Math.abs(r.forhold_pct - 100) > Math.abs(m.forhold_pct - 100) ? r : m), undefined);
    return `Modellen ramte ${i_alt?.forhold_pct ?? "–"} % af Billunds realiserede balanceindtægt${størst ? `; størst afvigelse: ${størst.post} (${størst.forhold_pct} %)` : ""}.`;
}
