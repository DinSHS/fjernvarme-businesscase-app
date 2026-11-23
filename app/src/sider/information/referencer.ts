//-----------------------------------------------------------------------
// Referencetal: README's tabel (viden/referencetal.json, gruppen "readme") sammenholdt med de kørsler,
// der findes i databasen. Ren logik — ingen React — så den kan testes mod de rigtige tal.
//
// En kørsel er en MÅLING af et referencetal, når dens FROSNE input har referencens opsætning (periode,
// balancering, balanceringsmetode, varmelast og flag) og ingen scenarieændringer, værket er repo-casen uændret,
// modelversionen er en af referencens, df-data er kendt og ny nok — og kørslen er regnet med SAMME ELLER STRAMMERE
// solvergab end casens eget. Det er ÉN regel (`kvalificer`), og både Information › Referencetal og Analysers
// kørselsliste bruger den (kodegennemgangen af runde 15, fund 6). Ellers ville en kørsel af "Spor A uden tank"
// stå som Spor A-ankeret, og en forskel i objektiv ville se ud som en fejl i modellen i stedet for den
// forskel, den er. Gab og tidsgrænse er solverens indstillinger og indgår derfor ikke i "samme opsætning":
// en strammere kørsel er en lige så god (og ofte bedre) måling af det samme tal. HiGHS minimerer, så objektivet kan kun være for
// HØJT: en strammere kørsel ligger typisk op til tolerancen UNDER README-tallet, ikke over det.
//-----------------------------------------------------------------------

import type { FjvSchema } from "../../../rayfin/data/schema";
import { KOERSEL_PRAEFIKS, effektivtInput, type InputRække } from "@/lib/data/afflad";
import { tidsseriekilde, tidsseriekildeTekst } from "../analyser/beregn";
import { README_PINS } from "../analyser/sammensaetning.data";

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
    /** Den første af `modelCommits` (til visning); null = ikke oplyst. */
    modelCommit: string | null;
    /**
     * Modelversionerne, en kørsel skal være regnet ved for at være en måling af tallet: referencens egen liste
     * (referencetal.json → referencer[].regnet_ved.model_commits), ellers filens model_commit. null = ikke oplyst (alle tæller).
     * Runde 15: ved modelrepoets 939228a er README's Spor A-anker regnet igen efter spotrettelsen, mens de fire øvrige tal
     * er fra før. Med én fælles version ville en gammel kørsel ved eef950a blive dømt "uden for tolerancen" mod det nye tal.
     */
    modelCommits: readonly string[] | null;
    /**
     * sha256 af den solprofil (appens normaliserede form), referencens case selv regnes med (referencetal.json →
     * referencer[].solprofil_sha256; i dag de to Andeby-tal). Udeladt = casen har ingen solprofil (Billund-casene).
     * Efterprøvningen af rettelserne i runde 15, fund F: en solprofil-tidsserie, kørslen faktisk brugte, skal være
     * netop den, for at kørslen er en måling af tallet.
     */
    solprofilSha256?: string | null;
}

interface RåReference {
    id: string; navn: string; vindue: string;
    vaerk: { kode: string };
    scenarie: Partial<ReferenceScenarie>;
    case_gab?: { mip_rel_gap?: number | null; mip_abs_gap?: number | null } | null;
    forventet: { objektiv_dkk: number; tolerance_dkk?: number | null; opnaaet_gab_pct?: number | null };
    regnet_ved?: { model_commits?: unknown } | null;
    solprofil_sha256?: string | null;
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
        const egne = r.regnet_ved?.model_commits;
        if (egne !== undefined && (!Array.isArray(egne) || egne.length === 0 || !egne.every((c) => typeof c === "string" && /^[0-9a-f]{40}$/.test(c)))) {
            throw new Error(`Referencen ${r.id}: regnet_ved.model_commits skal være en liste af fulde commits.`);
        }
        const modelCommits = (egne as string[] | undefined) ?? (typeof rå.model_commit === "string" ? [rå.model_commit] : null);
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
            modelCommit: modelCommits?.[0] ?? null, modelCommits,
            solprofilSha256: typeof r.solprofil_sha256 === "string" ? r.solprofil_sha256 : null,
        };
    });
}

const ens = <T>(a: T | null | undefined, b: T | null | undefined) => (a ?? null) === (b ?? null);

/**
 * Har opsætningen referencens felter (periode, balancering, metode, varmelast, flag)? `s` er den FROSNE opsætning
 * (`frossenOpsaetning`), ikke det levende scenarie. Solverens gab og tidsgrænse sammenlignes ikke her, men i
 * `kørslensGab`; ændringer, værk, version og df-data i `kvalificer`.
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
 * Kørslens effektive gab: det frosne på rækken (`oensket_*_gap`), ellers det frosne inputs eget (`s` =
 * `frossenOpsaetning`), ellers casens (= README). Et gab, der ikke kan afgøres, regnes som casens — det er det,
 * kørslen faktisk bruger, når intet er sat.
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

// ================================================================= én kvalifikation pr. reference (frosne felter)

/** Det, README-genkendelsen behøver om værket (Vaerk-rækken). */
export interface VaerkKilde { kilde: string; repo_commit?: string | null }

/**
 * Scenariefelterne, som kørslen FAKTISK fik dem (det frosne input, Codex K5-F9) — ikke det levende
 * scenarie, som kan være rettet bagefter. Formen er `Scenarie`s, så `harReferencensOpsaetning` kan bruges uændret.
 * Kun rækker med kilde `scenarie`/`aendring` læses, så de er nok (værkets blade behøver ikke at være hentet).
 */
export function frossenOpsaetning(input: readonly InputRække[]): Scenarie {
    const e = effektivtInput(input);
    const flag = (n: string): unknown => { const j = e.flag.get(n); if (j === undefined) return null; try { return JSON.parse(j); } catch { return j; } };
    const str = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? v.join(" ") : null);
    const num = (sti: string) => { const r = input.find((x) => x.kilde !== "vaerk" && x.sti === sti); const v = r ? Number(JSON.parse(r.vaerdi_json)) : NaN; return Number.isFinite(v) ? v : null; };
    return {
        periode_start: str(flag("start")), periode_slut: str(flag("slut")), med_balancering: flag("med_balancering") === true,
        balancing_method: str(flag("balancing_method")), ekstra_flag: str(flag("ekstra_flag")), heat_csv: str(flag("heat_csv")),
        mip_rel_gap: num("solver.mip_rel_gap"), mip_abs_gap: num("solver.mip_abs_gap"), tidsgraense_s: num("solver.time_limit"),
    } as Scenarie;
}

/**
 * Om en kørsel er en MÅLING af et README-referencetal — den ene kvalifikation, både Information › Referencetal og
 * Analysers kørselsliste bruger (kodegennemgangen af runde 15, fund 6). Alt læses af det, der blev frosset for
 * kørslen: rækkens egne felter og det frosne input — aldrig af scenariet, som det ser ud nu.
 *
 * Før havde Information sin egen regel på det LEVENDE scenarie og dets nuværende antal ændringer, og den så hverken
 * på værket eller på df-data: en kørsel af en ændret Spor A-case i revision 2 blev dømt "uden for tolerancen" mod
 * README's 5.204.555 kr., og en kørsel med en ændring fremstod som ren, når ændringen siden var fjernet fra scenariet.
 */
export interface Kvalifikation {
    /** Kørslen er færdig og har et objektiv. Kun en sådan kan være en måling — samme krav i begge visninger. */
    faerdig: boolean;
    /** Det frosne input kendes, og opsætningen er referencens (periode, balancering, metode, varmelast, flag). */
    opsaetning: boolean;
    /** Kørslen har ingen frosne scenarieændringer (ingen rækker med kilde `aendring`). */
    uaendret: boolean;
    /** Samme eller strammere gab end casens eget (`gab.erTilladt`). */
    gab: KoerselGab;
    /** Regnet ved en af referencens modelversioner. */
    version: boolean;
    /** Værket er repo-casen uændret: kilde `repo`, revision 1, importeret ved en af referencens modelversioner. */
    vaerk: boolean;
    /** df-data-commit'en er kendt med målt dato, og datoen ligger efter README's datakrav. */
    data: boolean;
    /**
     * Kørslens EFFEKTIVE frosne varmelast og solprofil er referencens (efterprøvningen af rettelserne, fund F):
     * varmelasten er referencens fil — eller syntesen, når referencen ingen har — og ikke en af værkets tidsserier;
     * en solprofil-tidsserie, kørslen brugte, er referencens egen. `grundlagAfviger` siger i ord, hvad der ikke passer.
     */
    grundlag: boolean;
    grundlagAfviger: string[];
    /** Alt ovenfor: kørslen er en måling af README-tallet, og en afvigelse må regnes. */
    maaling: boolean;
}

/**
 * Bruger kørslen sin frosne solprofil-tidsserie? Arbejderen skriver det i kørslens manifest (`tidsserier.anvendt` /
 * `tidsserier.ubrugt`, fabric/fjv/koersel.py › tidsserie_brug): en aktiv solprofil fryses, også når ingen tændt enhed
 * bruger den — og da er modellen uændret. Siger manifestet intet (ældre kørsler), kendes det ikke (`null`).
 */
function solprofilBrugt(k: Koersel): boolean | null {
    try {
        const t = (k.manifest_json ? JSON.parse(k.manifest_json) as { tidsserier?: { anvendt?: Record<string, unknown>; ubrugt?: Record<string, unknown> } } : null)?.tidsserier;
        if (!t) return null;
        if (t.anvendt && "solprofil" in t.anvendt) return true;
        if (t.ubrugt && "solprofil" in t.ubrugt) return false;
        return null;
    } catch { return null; }
}

/**
 * Kørslens effektive frosne varmelast og solprofil mod referencens grundlag (fund F). Tom liste = grundlaget er
 * referencens. Før læste kvalifikationen kun scenariets `heat_csv`: en af værkets tidsserier gjort AKTIV fryses som
 * `_koersel.tidsserie.varmelast` uden at stå som en ændring (kilde `aendring`), og kørslen blev målt mod README-tallet
 * på en anden varmelast.
 */
function grundlagAfvigelser(r: Reference, k: Koersel, input: readonly InputRække[]): string[] {
    const ud: string[] = [];
    const varme = tidsseriekilde(input, "varmelast");
    const ref = r.scenarie?.heat_csv ?? null;
    const haves = tidsseriekildeTekst("varmelast", varme);
    if (varme.art === "serie") ud.push(`varmelasten er en af værkets tidsserier (${haves}), ikke ${ref ? `README's ${ref}` : "syntesen, som README regner med"}`);
    else if (varme.art === "fil" ? varme.fil !== ref : ref !== null) ud.push(`varmelasten er ${haves}, ikke ${ref ?? "syntesen, som README regner med"}`);
    const sol = tidsseriekilde(input, "solprofil");
    const egen = r.solprofilSha256?.toLowerCase() ?? null;
    if (sol.art === "serie") {
        const brugt = solprofilBrugt(k);
        // Referencens EGEN solprofil (samme sha256) er grundlaget, hvad enten manifestet siger "anvendt" eller intet.
        if (brugt !== false && sol.sha256 !== egen) {
            ud.push(`solprofilen er en af værkets tidsserier (${tidsseriekildeTekst("solprofil", sol)}), ${brugt === null ? "og kørslen siger ikke, om den blev brugt" : "som kørslen brugte"} — ikke ${egen ? "referencens egen solprofil" : "README's grundlag (casen har ingen solprofil)"}`);
        }
    }
    // Ingen frossen solprofil-tidsserie: enheden læser værkets egen profilsti, og at værket er repo-casen uændret,
    // er sit eget krav (`vaerk`). Sådan er alle kørsler fra før runde 15 frosset.
    return ud;
}

export function kvalificer(r: Reference, k: Koersel, input: readonly InputRække[], vaerk: VaerkKilde | undefined): Kvalifikation {
    // Hver bestilling fryser `_koersel.med_balancering` (logik.ts › bygFrossetInput). Uden den kendes det frosne input
    // ikke (ikke hentet, eller en kørsel uden input) — og så kan opsætningen ikke bekræftes.
    const kendt = input.some((x) => x.kilde !== "vaerk" && x.sti === `${KOERSEL_PRAEFIKS}med_balancering`);
    const frossen = frossenOpsaetning(input);
    const gab = kørslensGab(k, frossen, r);
    const pin = (navn: "model_commit" | "data_commit") => (k[navn] ?? (() => { try { const x = input.find((y) => y.sti === `${KOERSEL_PRAEFIKS}${navn}`); return x ? JSON.parse(x.vaerdi_json) as string : null; } catch { return null; } })())?.toLowerCase() ?? null;
    const versioner = r.modelCommits ?? [README_PINS.model_commit];
    const model = pin("model_commit"), data = pin("data_commit"), importeret = vaerk?.repo_commit?.toLowerCase();
    const dato = data ? README_PINS.df_data_kendt[data] : undefined;
    const grundlagAfviger = kendt ? grundlagAfvigelser(r, k, input) : [];
    const q = {
        faerdig: k.status === "faerdig" && typeof k.objektiv_dkk === "number",
        opsaetning: kendt && harReferencensOpsaetning(frossen, r),
        uaendret: !input.some((x) => x.kilde === "aendring"),
        gab,
        version: !!model && versioner.includes(model),
        vaerk: !!vaerk && vaerk.kilde === "repo" && !!importeret && versioner.includes(importeret) && k.vaerk_revision === 1,
        data: !!dato && dato >= README_PINS.df_data_fra,
        grundlag: kendt && grundlagAfviger.length === 0, grundlagAfviger,
    };
    return { ...q, maaling: q.faerdig && q.opsaetning && q.uaendret && gab.erTilladt && q.version && q.vaerk && q.data && q.grundlag };
}

/**
 * De tre krav ud over opsætning, ændringer og gab (Codex K5-F9): værket er repo-casen uændret, kørslen er regnet ved
 * en af REFERENCENS modelversioner (runde 15: Spor A-ankeret måles ved 90fb16e eller 939228a, de fire øvrige ved
 * eef950a), og df-data er kendt og ny nok. Uden `r` (eller uden oplyste versioner) gælder filens fælles version.
 */
export function readmePins(k: Koersel, input: readonly InputRække[], vaerk: VaerkKilde | undefined, r?: Pick<Reference, "modelCommits">): boolean {
    const q = kvalificer({ modelCommits: r?.modelCommits ?? null, scenarie: {}, caseGab: { rel: null, abs: null } } as unknown as Reference, k, input, vaerk);
    return q.version && q.vaerk && q.data;
}

/** En kørsel af referencens værk med referencens frosne opsætning og et tilladt gab — og hvad den ellers opfylder. */
export interface Kandidat { koersel: Koersel; gab: KoerselGab; kvalifikation: Kvalifikation }

const tidspunkt = (k: Koersel) => new Date(k.afsluttet ?? k.bestilt ?? 0).getTime();

/**
 * Hvilken modelversion tallene kan måles ved, til fodnoten: den fælles først, undtagelser ved referencens navn —
 * "eef950a; Spor A-anker: 90fb16e eller 939228a". undefined, når ingen version er oplyst.
 */
export function versionsTekst(refs: readonly Reference[]): string | undefined {
    const kort = (r: Reference) => (r.modelCommits ?? []).map((c) => c.slice(0, 7)).join(" eller ");
    const antal = new Map<string, number>();
    for (const r of refs) if (r.modelCommits) antal.set(kort(r), (antal.get(kort(r)) ?? 0) + 1);
    if (antal.size === 0) return undefined;
    const faelles = [...antal.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return [faelles, ...refs.filter((r) => r.modelCommits && kort(r) !== faelles).map((r) => `${r.navn}: ${kort(r)}`)].join("; ");
}

/**
 * Færdige kørsler af referencens værk med et objektiv — dem, hvis frosne input skal hentes, før de kan kvalificeres
 * (`byggRaekker`). Kun rækkens egne felter bruges her.
 */
export function kandidatKoersler(refs: readonly Reference[], vaerker: readonly Vaerk[], koersler: readonly Koersel[]): Koersel[] {
    const ider = new Set(vaerker.filter((v) => refs.some((r) => r.kode === v.kode)).map((v) => v.id));
    return koersler.filter((k) => ider.has(k.vaerk_id) && k.status === "faerdig" && typeof k.objektiv_dkk === "number");
}

/**
 * Kørslerne af referencens værk med referencens frosne opsætning og et tilladt gab, nyeste først, hver med sin
 * kvalifikation. `input` er det frosne input pr. kørsels-id (rækkerne med kilde `scenarie`/`aendring` er nok).
 */
export function kandidater(r: Reference, vaerker: readonly Vaerk[], koersler: readonly Koersel[], input: ReadonlyMap<string, readonly InputRække[]>): Kandidat[] {
    const vaerk = vaerker.find((v) => v.kode === r.kode);
    if (!vaerk) return [];
    return kandidatKoersler([r], [vaerk], koersler)
        .map((k): Kandidat => { const q = kvalificer(r, k, input.get(k.id) ?? [], vaerk); return { koersel: k, gab: q.gab, kvalifikation: q }; })
        .filter((x) => x.kvalifikation.opsaetning && x.gab.erTilladt)
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
    /** Ingen færdig kørsel med referencens frosne opsætning. */
    | "ikke-koert"
    /** Der findes kørsler med referencens opsætning, men alle har frosne scenarieændringer: ingen af dem er referencen. */
    | "aendret"
    /**
     * En uændret kørsel med referencens opsætning findes ved referencens modelversion, men GRUNDLAGET er ikke bekræftet
     * som README's: værket er ikke repo-casen uændret (rettet, kopieret eller importeret ved en anden version), eller
     * df-data er ukendt eller for gammel. Kørt, men ingen afvigelse — en forskel ville måle grundlaget, ikke modellen
     * (gennemgangens fund 6).
     */
    | "andet-grundlag"
    /** Kun uændrede kørsler ved en anden modelversion end referencetallenes: kørt, men kan ikke sammenlignes. */
    | "anden-version"
    | "indenfor"
    | "udenfor"
    /** En måling findes, men README angiver ingen tolerance at måle den mod. */
    | "uafgoerligt";

export interface RefRække {
    ref: Reference;
    kandidat?: Kandidat;
    vurdering?: Vurdering;
    tilstand: RefTilstand;
}

/** Hvad en kandidat mangler for at have README's grundlag, i klartekst (til "andet-grundlag"). */
export function grundlagTekst(q: Kvalifikation): string {
    const dele = [
        ...(q.vaerk ? [] : ["værket er ikke modelrepoets case uændret (rettet, kopieret eller importeret ved en anden modelversion)"]),
        ...(q.data ? [] : ["kørslens df-data er ikke en af de versioner, hvis dato er målt til at opfylde README's datakrav"]),
        ...q.grundlagAfviger,
    ];
    return dele.join("; ");
}

/**
 * Pr. reference: den nyeste kørsel, der er en MÅLING af tallet (`kvalificer`), med afvigelsen. Findes ingen, siger
 * tilstanden hvorfor, i denne orden: uændret ved referencens version, men grundlaget er ikke bekræftet > uændret ved
 * en anden modelversion > kun ændrede > ikke kørt. En ÆNDRET kørsel ved referencens version må ikke skjule en UÆNDRET
 * ved en anden (Codex-efterreview 14/11-2026). En afvigelse regnes kun for en måling.
 */
export function byggRaekker(refs: readonly Reference[], vaerker: readonly Vaerk[], koersler: readonly Koersel[],
    input: ReadonlyMap<string, readonly InputRække[]>): RefRække[] {
    return refs.map((ref) => {
        const alle = kandidater(ref, vaerker, koersler, input);
        const maaling = alle.find((x) => x.kvalifikation.maaling);
        if (maaling) {
            const vurdering = vurder(ref, maaling.koersel.objektiv_dkk as number);
            return { ref, kandidat: maaling, vurdering, tilstand: vurdering.indenfor === null ? "uafgoerligt" : vurdering.indenfor ? "indenfor" : "udenfor" } satisfies RefRække;
        }
        const rene = alle.filter((x) => x.kvalifikation.uaendret);
        // Ved referencens version, men ikke en måling: så er det værket eller df-data, der ikke er bekræftet.
        const vedVersionen = rene.find((x) => x.kvalifikation.version);
        if (vedVersionen) return { ref, kandidat: vedVersionen, tilstand: "andet-grundlag" } satisfies RefRække;
        // Ved en anden version kan tallene slet ikke sammenlignes — uanset grundlaget (en installation ved pinnen har
        // også værket importeret ved pinnen, og det er versionen, brugeren skal høre om).
        if (rene[0]) return { ref, kandidat: rene[0], tilstand: "anden-version" } satisfies RefRække;
        return { ref, kandidat: alle[0], tilstand: alle.length ? "aendret" : "ikke-koert" } satisfies RefRække;
    });
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
