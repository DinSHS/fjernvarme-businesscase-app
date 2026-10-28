//-----------------------------------------------------------------------
// Ren forretningslogik for de betroede funktioner — ingen SQL, intet netværk.
//
// Holdes adskilt fra function_app.ts, så den kan unittestes fra appens
// vitest-suite (src/lib/__tests__/functions-logik.spec.ts) uden Fabric.
//
// To regler gennemsyrer filen:
//  1. JSON-værdier fra databasen RE-SERIALISERES ALDRIG i JavaScript.
//     `JSON.parse("12.0")` giver 12, og `JSON.stringify(12)` giver "12" — så
//     en float bliver tavst til en int, og modellens type-strenge rundtur
//     (KONTRAKT §3.2) brydes. Strenge valideres med JSON.parse og gemmes råt.
//  2. En afvisning er en `Afvisning` med en dansk forklaring til brugeren;
//     alt andet er en programfejl.
//-----------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { frossenSti, frossenTidsserie } from './frysning.js';
import { FARLIGE_SEGMENTER } from './sti.js';

/** Fejl der skal vises for brugeren — ikke en programfejl. */
export class Afvisning extends Error {
    constructor(besked: string) {
        super(besked);
        this.name = 'Afvisning';
    }
}

export interface Parameter { sti: string; vaerdi_json: string }

export interface ScenarieAendringRad {
    type: 'set' | 'enable' | 'disable';
    sti: string;
    vaerdi_json?: string | null;
    raekkefoelge: number;
}

export interface ScenarieRad {
    periode_start?: string | null;
    periode_slut?: string | null;
    med_balancering: boolean;
    balancing_method?: string | null;
    mip_rel_gap?: number | null;
    mip_abs_gap?: number | null;
    tidsgraense_s?: number | null;
    ekstra_flag?: string | null;
    heat_csv?: string | null;
}

export interface InputRad { kilde: 'vaerk' | 'aendring' | 'scenarie'; sti: string; vaerdi_json: string }

export const GRAENSER = { ventendePrBruger: 3, maksPeriodeDoegn: 366, maksTidsgraenseS: 3600 } as const;
export const TILLADTE_FLAG: readonly string[] = ['--legacy-nettab'];
export const MAKS_STI = 400;
export const MAKS_JSON = 4000;

/** Modellens standarder (src/config.py SolverConfig) når hverken værk eller scenarie sætter dem. */
export const MODEL_STANDARD = { mip_rel_gap: 0.005, mip_abs_gap: 5000, time_limit: 600 } as const;

/**
 * Præfiks for scenariets særlige felter, der IKKE er case-YAML men CLI-flag
 * (KONTRAKT §5.2 pkt. 3). Notebooken oversætter dem; alt andet i KoerselInput
 * er stier i case-dict'et.
 */
export const KOERSEL_PRAEFIKS = '_koersel.';

/** Et scenaries valg af tidsserie (KONTRAKT §6d): ScenarieAendring `set` på `_tidsserie.<rolle>` = id eller "syntetisk". */
export const TIDSSERIE_VALG_PRAEFIKS = '_tidsserie.';

/** En af værkets GYLDIGE tidsserier, som startBestilling læser (Tidsseries, status = 'gyldig'). */
export interface TidsserieRad {
    id: string; rolle: 'varmelast' | 'solprofil'; navn: string; sha256: string; sti: string; oploesning: string;
    start: string; slut: string; aktiv: boolean;
    /** validering_json — bruges til seriens interne huller (`huller` = [[fra, til, antal], …], UTC) ved dækningstjekket. */
    validering_json?: string | null;
}

/** Et tidsstempel som modellen læser det (byg_case._modeltid): naivt = UTC, en bar dato = midnat. */
function modeltid(s: string): number {
    const x = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return Date.parse(`${x}T00:00:00Z`);
    const zone = /(Z|[+-]\d{2}:?\d{2})$/i.exec(x)?.[1];
    // Modellen opgiver selv en anden zone end UTC ("Inferred time zone not equal to passed time zone") — afvis før kørslen.
    if (zone && !/^(Z|[+-]00:?00)$/i.test(zone)) throw new Afvisning(`Værkets tid skal være i UTC (Z), fik "${x}".`);
    return Date.parse(zone ? x : `${x}Z`);
}

/** Kørslens første og sidste time (UTC ms, begge med) — den akse, modellen faktisk regner på (K5-F5). */
export function effektivAkse(scenarie: ScenarieRad, periode: { start: string; slut: string }): { fra: number; til: number } {
    if (scenarie.periode_start && scenarie.periode_slut) {
        return { fra: Date.parse(`${scenarie.periode_start.slice(0, 10)}T00:00:00Z`), til: Date.parse(`${scenarie.periode_slut.slice(0, 10)}T23:00:00Z`) };
    }
    return { fra: modeltid(periode.start), til: modeltid(periode.slut) };
}

/** Markøren i `units.<sol>.production_profile_path` for et værk, hvis solprofil er en tidsserie (fv-fabric2, §6d). */
export const SOLPROFIL_MARKOER = 'tidsserie:solprofil';

/** Timer i [fra, til] (UTC ms, timens start), som serien ikke dækker: uden for start–slut plus dens egne huller. */
function manglendeTimer(ts: TidsserieRad, fra: number, til: number): { mangler: number; ukendt: boolean } {
    const T = 3_600_000;
    const tsFra = Date.parse(ts.start), tsTil = Date.parse(ts.slut);
    const vinduet = (til - fra) / T + 1;
    if (tsFra > til || tsTil < fra) return { mangler: vinduet, ukendt: false };
    // Timer i vinduet før seriens første og efter dens sidste time.
    let mangler = Math.max(0, (tsFra - fra) / T) + Math.max(0, (til - tsTil) / T);
    let ukendt = false;
    try {
        const v = ts.validering_json ? JSON.parse(ts.validering_json) as { huller?: [string, string, number][]; huller_fuld?: boolean } : {};
        for (const h of v.huller ?? []) {
            const a = Math.max(fra, Date.parse(h[0])), b = Math.min(til, Date.parse(h[1]));
            if (b >= a) mangler += (b - a) / T + 1;
        }
        if (v.huller_fuld === false) ukendt = true;
    } catch { ukendt = true; }
    return { mangler: Math.round(mangler), ukendt };
}

/** Varmelast: modellen afviser > 5 % manglende timer i vinduet, så en tidsserie skal dække mindst 95 % af perioden. */
export const MIN_DAEKNING_VARMELAST = 0.95;

// ------------------------------------------------------------------ JSON

/** Validerer at `s` er gyldig JSON og returnerer den parsede værdi (kun til aflæsning). */
export function læsJson(s: string, hvor: string): unknown {
    try {
        return JSON.parse(s);
    } catch {
        throw new Afvisning(`${hvor}: værdien er ikke gyldig JSON (${s.slice(0, 80)}).`);
    }
}

/**
 * Koder et tal som JSON-float, så modellens float-felter forbliver floats:
 * 3600 -> "3600.0", 0.0002 -> "0.0002". Python `json.loads("3600.0")` giver float.
 */
export function somFloat(x: number): string {
    if (!Number.isFinite(x)) throw new Afvisning(`Tallet ${x} kan ikke gemmes (NaN/uendelig).`);
    const s = String(x);
    return /[.eE]/.test(s) ? s : `${s}.0`;
}

/** Kompakt JSON af en streng/bool/liste vi selv har bygget (ikke data fra databasen). */
function kompakt(v: unknown): string {
    return JSON.stringify(v);
}

// ------------------------------------------------------------------ hash

/**
 * sha256 (hex) over det frosne input. DEFINITION (skal være identisk i
 * notebooken, som verificerer den):
 *
 *   rækker = sorteret liste af [kilde, sti, vaerdi_json] (alle strenge),
 *            sorteret leksikografisk på (kilde, sti, vaerdi_json);
 *   tekst  = json.dumps(rækker, ensure_ascii=False, separators=(",", ":"))
 *   hash   = sha256(tekst.encode("utf-8")).hexdigest()
 *
 * JS' JSON.stringify og Pythons json.dumps(ensure_ascii=False) escaper det
 * samme for strenge i BMP. Sortering: JS sammenligner UTF-16-kodeenheder,
 * Python kodepunkter — ens for alt uden for astrale tegn, som stier og
 * værdier her ikke har.
 */
export function inputHash(rækker: readonly InputRad[]): string {
    const tupler = rækker.map((r) => [r.kilde, r.sti, r.vaerdi_json] as const);
    tupler.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
    return createHash('sha256').update(JSON.stringify(tupler), 'utf8').digest('hex');
}

// ------------------------------------------------------------------ periode

const DATO = /^\d{4}-\d{2}-\d{2}$/;

function parseDato(s: string, hvor: string): number {
    if (!DATO.test(s)) throw new Afvisning(`${hvor} skal være en dato på formen ÅÅÅÅ-MM-DD (fik "${s}").`);
    const t = Date.parse(`${s}T00:00:00Z`);
    if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) throw new Afvisning(`${hvor}: "${s}" er ikke en gyldig dato.`);
    return t;
}

function parseTidsstempel(v: unknown, hvor: string): number {
    if (typeof v !== 'string') throw new Afvisning(`${hvor} mangler eller er ikke en tekst.`);
    const t = Date.parse(v);
    if (Number.isNaN(t)) throw new Afvisning(`${hvor}: "${v}" kan ikke læses som tidspunkt.`);
    return t;
}

const OPLØSNING_MS: Record<string, number> = { '1h': 3_600_000, '15min': 900_000 };

/**
 * Antal døgn kørslen dækker. Scenariets datoer er inklusive (CLI `--end`
 * udvides til dagens sidste skridt); værkets `time.end` er det sidste
 * intervals start, så ét interval lægges til.
 */
export function periodeDoegn(scenarie: ScenarieRad, vaerdier: ReadonlyMap<string, unknown>): { start: string; slut: string; doegn: number } {
    const s = scenarie.periode_start || null;
    const e = scenarie.periode_slut || null;
    if (s || e) {
        if (!s || !e) throw new Afvisning('Periode: både start- og slutdato skal udfyldes (eller ingen af dem).');
        const a = parseDato(s, 'Periodens start');
        const b = parseDato(e, 'Periodens slut');
        if (b < a) throw new Afvisning(`Periodens slut (${e}) ligger før start (${s}).`);
        return { start: s, slut: e, doegn: Math.round((b - a) / 86_400_000) + 1 };
    }
    const a = parseTidsstempel(vaerdier.get('time.start'), 'Værkets time.start');
    const b = parseTidsstempel(vaerdier.get('time.end'), 'Værkets time.end');
    const opl = vaerdier.get('time.resolution');
    const skridt = typeof opl === 'string' && OPLØSNING_MS[opl] ? OPLØSNING_MS[opl] : 3_600_000;
    if (b < a) throw new Afvisning('Værkets time.end ligger før time.start.');
    return {
        start: String(vaerdier.get('time.start')),
        slut: String(vaerdier.get('time.end')),
        doegn: (b - a + skridt) / 86_400_000,
    };
}

// ------------------------------------------------------------------ frysning

function tal(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Enheds-/lagernavnet en enable/disable peger på -> stien til dens `enabled`. */
function enabledSti(navn: string, objekter: { units: Set<string>; storage: Set<string> }): string {
    if (!navn || navn.includes('.')) throw new Afvisning(`Til/fra skal pege på et enheds- eller lagernavn, ikke en sti ("${navn}").`);
    const iUnits = objekter.units.has(navn);
    const iStorage = objekter.storage.has(navn);
    if (iUnits && iStorage) throw new Afvisning(`"${navn}" findes både som enhed og som lager — angiv ændringen som en sti i stedet.`);
    if (!iUnits && !iStorage) throw new Afvisning(`Værket har ingen enhed eller lager ved navn "${navn}".`);
    return `${iUnits ? 'units' : 'storage'}.${navn}.enabled`;
}

export interface FrossetInput {
    rækker: InputRad[];
    hash: string;
    effektiv: {
        start: string; slut: string; doegn: number;
        tidsgraense_s: number; mip_rel_gap: number; mip_abs_gap: number;
    };
}

/**
 * Bygger KoerselInput for én bestilling (KONTRAKT §3.7) og håndhæver
 * grænserne fra §3.0 og reglerne fra §3.5. Kaster `Afvisning` ved brud.
 *
 * Prioritet: værkssnapshot -> scenariets ændringer -> scenariets særlige
 * felter (KONTRAKT §5.2). En ændring på en sti, som et særligt felt også
 * sætter (fx `solver.time_limit` både som `set` og i tidsgraense_s), afvises
 * som dublet frem for at lade én tavst vinde.
 */
export interface Pins { model_commit?: string | null; data_commit?: string | null }

const SHA = /^[0-9a-f]{40}$/;

export function bygFrossetInput(
    params: readonly Parameter[],
    aendringer: readonly ScenarieAendringRad[],
    scenarie: ScenarieRad,
    pins: Pins = {},
    tidsserier: readonly TidsserieRad[] = [],
): FrossetInput {
    if (params.length === 0) throw new Afvisning('Værket har ingen parametre — er det importeret?');

    const stier = new Set<string>();
    const vaerdier = new Map<string, unknown>();
    const objekter = { units: new Set<string>(), storage: new Set<string>() };
    for (const p of params) {
        if (stier.has(p.sti)) throw new Afvisning(`Værket har parameteren "${p.sti}" to gange — ret værket før det køres.`);
        stier.add(p.sti);
        vaerdier.set(p.sti, læsJson(p.vaerdi_json, `Værksparameter ${p.sti}`));
        const [sek, obj] = p.sti.split('.');
        if (obj && (sek === 'units' || sek === 'storage')) objekter[sek].add(obj);
    }

    const rækker: InputRad[] = params.map((p) => ({ kilde: 'vaerk', sti: p.sti, vaerdi_json: p.vaerdi_json }));
    const sat = new Set<string>();
    const sæt = (kilde: InputRad['kilde'], sti: string, vaerdi_json: string, hvorfra: string) => {
        if (sat.has(sti)) throw new Afvisning(`To ændringer rammer samme sti "${sti}" (${hvorfra}). Fjern den ene.`);
        if (sti.length > MAKS_STI) throw new Afvisning(`Stien er for lang (${sti.length} > ${MAKS_STI} tegn).`);
        if (vaerdi_json.length > MAKS_JSON) throw new Afvisning(`Værdien på ${sti} er for lang (${vaerdi_json.length} > ${MAKS_JSON} tegn).`);
        sat.add(sti);
        rækker.push({ kilde, sti, vaerdi_json });
    };

    const tsValg = new Map<'varmelast' | 'solprofil', string>();
    for (const a of [...aendringer].sort((x, y) => x.raekkefoelge - y.raekkefoelge)) {
        if (a.type === 'set' && a.sti.startsWith(TIDSSERIE_VALG_PRAEFIKS)) {
            // KONTRAKT §6d: et valg af tidsserie, ikke en YAML-værdi — den fryses nedenfor som _koersel.tidsserie.<rolle>.
            const rolle = a.sti.slice(TIDSSERIE_VALG_PRAEFIKS.length);
            if (rolle !== 'varmelast' && rolle !== 'solprofil') throw new Afvisning(`Ukendt tidsserie-rolle "${rolle}" (varmelast eller solprofil).`);
            if (tsValg.has(rolle)) throw new Afvisning(`Scenariet vælger ${rolle} to gange — fjern den ene.`);
            const valg = læsJson(a.vaerdi_json ?? '', `Valget af ${rolle}`);
            if (typeof valg !== 'string' || !valg) throw new Afvisning(`Valget af ${rolle} skal være en tidsseries id${rolle === 'varmelast' ? ' eller "syntetisk"' : ''}.`);
            tsValg.set(rolle, valg.toLowerCase());
            continue;
        }
        if (a.type === 'set') {
            // KONTRAKT §6c / K2-F7: tid og solver har egne scenariefelter (periode, gab, tidsgrænse). En `set`
            // på dem ville kunne gå uden om grænserne — og to veje til samme værdi er to sandheder.
            if (/^(time|solver)\./.test(a.sti)) {
                throw new Afvisning(
                    `"${a.sti}" kan ikke ændres som en værdi i et scenarie — brug scenariets felter for periode, ` +
                    `gab og tidsgrænse.`,
                );
            }
            if (!gyldigSti(a.sti)) throw new Afvisning(`Ændringen peger på en ugyldig sti "${a.sti}".`);
            if (!stier.has(a.sti)) {
                throw new Afvisning(
                    `Ændringen peger på "${a.sti}", som ikke findes i værket. Et scenarie kan kun ændre eksisterende ` +
                    `værdier — nye enheder eller blokke er en værksændring.`,
                );
            }
            if (a.vaerdi_json == null || a.vaerdi_json === '') throw new Afvisning(`Ændringen af "${a.sti}" mangler en værdi.`);
            // K2-F7: grænserne nedenfor skal regnes på den EFFEKTIVE konfiguration — en `set` af
            // time.end eller solver.time_limit må ikke kunne gå uden om dem.
            vaerdier.set(a.sti, læsJson(a.vaerdi_json, `Ændringen af ${a.sti}`));
            sæt('aendring', a.sti, a.vaerdi_json, 'scenariets ændringer');
        } else if (a.type === 'enable' || a.type === 'disable') {
            const sti = enabledSti(a.sti, objekter);
            vaerdier.set(sti, a.type === 'enable');
            sæt('aendring', sti, a.type === 'enable' ? 'true' : 'false', `slå ${a.sti} ${a.type === 'enable' ? 'til' : 'fra'}`);
        } else {
            throw new Afvisning(`Ukendt ændringstype "${String((a as { type: unknown }).type)}".`);
        }
    }

    // Særlige felter. Effektive værdier = scenarie ?? værk ?? modellens standard.
    // KONTRAKT §6c / K2-F13: kun 1h i version 1 — modellens kr.-led ved 15min summeres uden Δt (uafklaret).
    const opløsning = vaerdier.get('time.resolution') ?? '1h';
    if (opløsning !== '1h') {
        throw new Afvisning(
            `Værket regner med opløsningen "${String(opløsning)}". Appen kører i denne version kun 1h, fordi ` +
            `modellens økonomi ved 15 minutter endnu ikke er valideret (kendt begrænsning).`,
        );
    }
    const periode = periodeDoegn(scenarie, vaerdier);
    if (periode.doegn > GRAENSER.maksPeriodeDoegn) {
        throw new Afvisning(`Perioden er ${Math.ceil(periode.doegn)} døgn; højst ${GRAENSER.maksPeriodeDoegn} døgn pr. kørsel.`);
    }
    if (scenarie.periode_start && scenarie.periode_slut) {
        sæt('scenarie', `${KOERSEL_PRAEFIKS}start`, kompakt(scenarie.periode_start), 'periode');
        sæt('scenarie', `${KOERSEL_PRAEFIKS}slut`, kompakt(scenarie.periode_slut), 'periode');
    }
    sæt('scenarie', `${KOERSEL_PRAEFIKS}med_balancering`, scenarie.med_balancering ? 'true' : 'false', 'balancering');
    if (scenarie.balancing_method) {
        if (!['legacy', 'activation_value'].includes(scenarie.balancing_method)) throw new Afvisning(`Ukendt balanceringsmetode "${scenarie.balancing_method}".`);
        sæt('scenarie', `${KOERSEL_PRAEFIKS}balancing_method`, kompakt(scenarie.balancing_method), 'balanceringsmetode');
    }
    if (scenarie.heat_csv) {
        if (!/^[A-Za-z0-9_.-]+\.csv$/.test(scenarie.heat_csv) || scenarie.heat_csv.includes('..')) {
            throw new Afvisning(`Varmelastfilen skal være et filnavn i modelrepoets data/-mappe (fik "${scenarie.heat_csv}").`);
        }
        sæt('scenarie', `${KOERSEL_PRAEFIKS}heat_csv`, kompakt(scenarie.heat_csv), 'varmelastfil');
    }
    const flag = (scenarie.ekstra_flag ?? '').split(/\s+/).filter(Boolean);
    for (const f of flag) if (!TILLADTE_FLAG.includes(f)) throw new Afvisning(`Flaget "${f}" er ikke tilladt. Tilladt: ${TILLADTE_FLAG.join(', ')}.`);
    if (new Set(flag).size !== flag.length) throw new Afvisning('Et ekstra flag er angivet to gange.');
    if (flag.length) sæt('scenarie', `${KOERSEL_PRAEFIKS}ekstra_flag`, kompakt(flag), 'ekstra flag');

    // KONTRAKT §6d: værkets egne tidsserier. Prioritet pr. rolle: scenariets valg (`_tidsserie.<rolle>`) ->
    // varmelast fra repoets hvidliste (heat_csv) -> værkets aktive -> ingen (syntetisk varmelast / værkets egen
    // solprofilsti). Den valgte fryses med id, sha256 og sti; arbejderen verificerer sha256 før brug.
    for (const rolle of ['varmelast', 'solprofil'] as const) {
        const valg = tsValg.get(rolle);
        if (rolle === 'varmelast' && valg && valg !== 'syntetisk' && scenarie.heat_csv) {
            throw new Afvisning('Scenariet vælger både en af værkets tidsserier og en af repoets varmelastfiler — vælg én.');
        }
        if (valg === 'syntetisk') {
            if (rolle !== 'varmelast') throw new Afvisning('"syntetisk" findes kun for varmelast.');
            continue;
        }
        let ts: TidsserieRad | undefined;
        if (rolle === 'solprofil' && valg && [...sat].some((s) => /^units\.[^.]+\.production_profile_path$/.test(s))) {
            throw new Afvisning('Scenariet vælger både en solprofil-tidsserie og ændrer en enheds production_profile_path — vælg én.');
        }
        if (valg) {
            ts = tidsserier.find((x) => x.id.toLowerCase() === valg);
            if (!ts) throw new Afvisning(`Den valgte ${rolle} findes ikke blandt værkets gyldige tidsserier (afvist, slettet eller fra et andet værk?).`);
            if (ts.rolle !== rolle) throw new Afvisning(`"${ts.navn}" er en ${ts.rolle}, ikke en ${rolle}.`);
        } else if (!(rolle === 'varmelast' && scenarie.heat_csv)) {
            const aktive = tidsserier.filter((x) => x.rolle === rolle && x.aktiv);
            if (aktive.length > 1) throw new Afvisning(`Værket har ${aktive.length} aktive ${rolle}-tidsserier — gør én af dem aktiv igen, før der køres.`);
            ts = aktive[0];
        }
        if (!ts) {
            // Et værk importeret fra et værksark har markøren i stedet for en filsti (fv-fabric2) — så SKAL der være en.
            if (rolle === 'solprofil' && [...vaerdier.entries()].some(([s, x]) => /^units\.[^.]+\.production_profile_path$/.test(s) && x === SOLPROFIL_MARKOER)) {
                throw new Afvisning('Værket bruger en solprofil-tidsserie, men ingen er aktiv eller valgt — gør en af værkets solprofiler aktiv.');
            }
            continue;
        }
        // Dækning af kørslens EFFEKTIVE akse (K5-F5, samme regel som fv-fabric2's byg_case._effektiv_tid): med
        // scenariets rene datoer hele døgn (00:00–23:00 UTC); uden dem værkets time-blok PRÆCIS — naivt = UTC, en bar
        // dato = midnat. Inkl. seriens egne huller (validering_json.huller). Arbejderen tjekker igen på de eksakte punkter.
        const { fra, til } = effektivAkse(scenarie, periode);
        const timer = (til - fra) / 3_600_000 + 1;
        const { mangler } = manglendeTimer(ts, fra, til);
        const daekning = 1 - mangler / timer;
        if (rolle === 'solprofil' && mangler > 0) {
            throw new Afvisning(`Solprofilen "${ts.navn}" mangler ${mangler} af periodens ${timer} timer (${ts.start.slice(0, 10)}–${ts.slut.slice(0, 10)}); modellen nulfylder ikke en solprofil.`);
        }
        if (rolle === 'varmelast' && daekning < MIN_DAEKNING_VARMELAST) {
            throw new Afvisning(`Varmelasten "${ts.navn}" dækker kun ${Math.floor(daekning * 100)} % af perioden (${ts.start.slice(0, 10)}–${ts.slut.slice(0, 10)}); modellen kræver mindst ${MIN_DAEKNING_VARMELAST * 100} %.`);
        }
        // Formen er arbejderens (fv-fabric2 14:00): præcis {id, sha256}; stien slås op, hashen er det beskyttede.
        sæt('scenarie', frossenSti(rolle), frossenTidsserie(ts), `${rolle}-tidsserie`);
    }

    // K2-F8: model- og data-revision fryses i det hashbeskyttede input, når de er kendt ved bestilling
    // (Files/fjv/pins.json). Arbejderen skal bruge netop dem.
    for (const [navn, sha] of [['model_commit', pins.model_commit], ['data_commit', pins.data_commit]] as const) {
        if (!sha) continue;
        if (!SHA.test(sha)) throw new Error(`Ugyldig ${navn} i pins: ${sha}`);
        sæt('scenarie', `${KOERSEL_PRAEFIKS}${navn}`, kompakt(sha), navn);
    }

    const vaerkRel = tal(vaerdier.get('solver.mip_rel_gap'));
    const vaerkAbs = tal(vaerdier.get('solver.mip_abs_gap'));
    const vaerkTid = tal(vaerdier.get('solver.time_limit'));
    if (scenarie.mip_rel_gap != null) {
        if (!(scenarie.mip_rel_gap >= 0 && scenarie.mip_rel_gap < 1)) throw new Afvisning('Relativt MIP-gab skal ligge i [0; 1).');
        sæt('scenarie', 'solver.mip_rel_gap', somFloat(scenarie.mip_rel_gap), 'relativt gab');
    }
    if (scenarie.mip_abs_gap != null) {
        if (!(scenarie.mip_abs_gap >= 0)) throw new Afvisning('Absolut MIP-gab skal være ≥ 0.');
        sæt('scenarie', 'solver.mip_abs_gap', somFloat(scenarie.mip_abs_gap), 'absolut gab');
    }
    if (scenarie.tidsgraense_s != null) {
        if (!(scenarie.tidsgraense_s > 0)) throw new Afvisning('Tidsgrænsen skal være større end 0 sekunder.');
        sæt('scenarie', 'solver.time_limit', somFloat(scenarie.tidsgraense_s), 'tidsgrænse');
    }
    const relGap = scenarie.mip_rel_gap ?? vaerkRel ?? MODEL_STANDARD.mip_rel_gap;
    const absGap = scenarie.mip_abs_gap ?? vaerkAbs ?? MODEL_STANDARD.mip_abs_gap;
    const tid = scenarie.tidsgraense_s ?? vaerkTid ?? MODEL_STANDARD.time_limit;
    if (tid > GRAENSER.maksTidsgraenseS) {
        throw new Afvisning(
            `Solverens tidsgrænse er ${tid} s; højst ${GRAENSER.maksTidsgraenseS} s pr. kørsel. ` +
            `Sæt en lavere tidsgrænse i scenariet.`,
        );
    }

    return {
        rækker,
        hash: inputHash(rækker),
        effektiv: { start: periode.start, slut: periode.slut, doegn: periode.doegn, tidsgraense_s: tid, mip_rel_gap: relGap, mip_abs_gap: absGap },
    };
}

// ------------------------------------------------------------------ værksændringer

export interface ParameterAendring { sti: string; handling: 'opret' | 'ret' | 'slet'; ny_json?: string | null }
export interface KopierVaerk { handling: 'kopier_vaerk'; ny_kode: string; navn: string; beskrivelse?: string | null }

/** Ét blad i et nyt værk. `ny_json` er JSON-kodet (som VaerkParameter.vaerdi_json). */
export interface Blad { sti: string; ny_json: string; bekraeft?: boolean; kommentar?: string | null }
/**
 * Nyt værk fra bunden (brief 15 B). En bladliste overstiger let 4000 tegn (et rigtigt værk er 15–19 KB), så den
 * sendes som `af` DELE (`opret_vaerk_del`, hver sin anmodning) med samme `udkast`-id, og til sidst ÉN afsluttende
 * `opret_vaerk`, der udfører det hele i én transaktion. En del udføres aldrig alene.
 */
export interface OpretVaerkDel { handling: 'opret_vaerk_del'; udkast: string; nr: number; af: number; blade: Blad[] }
export interface OpretVaerk { handling: 'opret_vaerk'; udkast: string; dele: number; ny_kode: string; navn: string; beskrivelse?: string | null }

export type Anmodning =
    | { type: 'parametre'; aendringer: ParameterAendring[] }
    | { type: 'kopi'; kopi: KopierVaerk }
    | { type: 'opret'; opret: OpretVaerk }
    | { type: 'opret_del'; del: OpretVaerkDel }
    | { type: 'upload_tidsserie'; upload: UploadTidsserie }
    | { type: 'upload_vaerksark'; upload: UploadVaerksark }
    | { type: 'aktiver_tidsserie'; aktiver: AktiverTidsserie };

/**
 * KONTRAKT §6d. En upload bindes til en anmodning, fordi kalderens token ingen e-mail har: DAB's create-policy
 * har verificeret `anmodet_af`, og `sha256` (af filens indhold, som tekst/base64) binder netop dette indhold til
 * anmodningen — samme princip som `bestilt_af` på Bestilling. Udføres KUN af uploadTidsserie/uploadVaerksark.
 */
export interface UploadTidsserie {
    handling: 'upload_tidsserie'; rolle: 'varmelast' | 'solprofil'; navn: string; filnavn: string; tidsstempel: 'start' | 'slut'; tidszone: string;
    /** MW, kW, MWh eller kWh (pr. interval) — brugeren vælger aktivt (data_krav.json). */
    enhed: string;
    /** Værdikolonnen, når filen har flere talkolonner (ellers tolkerens valg). */
    kolonne: string | null;
    /** sha256 af base64-teksten, der sendes (filens rå bytes, så tolkeren selv kan genkende Windows-1252). */
    sha256: string;
}
export interface UploadVaerksark {
    handling: 'upload_vaerksark'; filnavn: string; sha256: string; /** Står arkets tidsstempler for timens slut? (--timeslut) */ timeslut: boolean | null;
    /**
     * Runde 12: genupload af et ark, appen har eksporteret = ny revision af anmodningens `vaerk_id` (med
     * `forventet_revision` = arkets revision). sha256 af base64-teksten af BASIS-arket — appens nye eksport af værkets
     * revision, som importen sammenligner arket med. null = et nyt værk (som før).
     */
    basis_sha256: string | null;
}
/** Gør en gyldig tidsserie aktiv (højst én pr. værk + rolle) eller inaktiv. vaerk_id = værket. */
export interface AktiverTidsserie { handling: 'aktiver_tidsserie'; tidsserie_id: string; aktiv: boolean }

/** Højst så mange dele og blade i ét nyt værk (et rigtigt værk har ~230 blade). */
export const MAKS_DELE = 50;
export const MAKS_BLADE = 2000;
const UUID_MØNSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Værkskoder, appen selv bruger i ruten `#/konfiguration/<kode>` (K4-F9): et værk med koden `nyt` ville altid
 * åbne oprettelsesguiden. SKAL være lig RESERVEREDE_KODER i rayfin/data/fjv.constants.ts (test håndhæver det).
 */
export const RESERVEREDE_KODER: readonly string[] = ['nyt'];

function læsKodeOgNavn(o: Record<string, unknown>): { kode: string; navn: string; beskrivelse: string | null } {
    const kode = String(o.ny_kode ?? '');
    const navn = String(o.navn ?? '').trim();
    if (!KODE_MOENSTER.test(kode) || kode.length > 60) throw new Afvisning(`Koden "${kode}" skal bestå af små bogstaver, cifre og _ (højst 60 tegn).`);
    if (RESERVEREDE_KODER.includes(kode)) throw new Afvisning(`Koden "${kode}" er reserveret af appen — vælg en anden.`);
    if (!navn || navn.length > 200) throw new Afvisning('Det nye værk skal have et navn (højst 200 tegn).');
    const beskrivelse = o.beskrivelse == null ? null : String(o.beskrivelse);
    if (beskrivelse && beskrivelse.length > 4000) throw new Afvisning('Beskrivelsen er for lang (højst 4000 tegn).');
    return { kode, navn, beskrivelse };
}

function læsHeltal(x: unknown, navn: string, min: number, maks: number): number {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < min || x > maks) throw new Afvisning(`${navn} skal være et helt tal mellem ${min} og ${maks}.`);
    return x;
}

function læsUdkast(x: unknown): string {
    const s = String(x ?? '');
    if (!UUID_MØNSTER.test(s)) throw new Afvisning('Udkastets id er ikke et gyldigt uuid.');
    return s.toLowerCase();
}

export const KODE_MOENSTER = /^[a-z0-9_]+$/;
const STI_DEL = /^[^.\s][^.]*$/;

export { FARLIGE_SEGMENTER } from './sti.js';

/** En gyldig værkssti: ikke tom, ≤ MAKS_STI, ingen tomme segmenter og ingen prototype-segmenter. */
export function gyldigSti(sti: string): boolean {
    return !!sti && sti.length <= MAKS_STI && sti.split('.').every((d) => STI_DEL.test(d) && !FARLIGE_SEGMENTER.has(d));
}

/** Fortolker og validerer `Aendringsanmodning.aendringer_json` (formerne står i entitetens filhoved). */
export function læsAnmodning(aendringer_json: string): Anmodning {
    const v = læsJson(aendringer_json, 'Ændringsanmodningen');
    if (!Array.isArray(v) || v.length === 0) throw new Afvisning('Ændringsanmodningen skal være en ikke-tom liste.');
    const første = v[0] as Record<string, unknown>;
    if (første && første.handling === 'kopier_vaerk') {
        if (v.length !== 1) throw new Afvisning('En kopi af et værk skal være den eneste handling i anmodningen.');
        const { kode, navn, beskrivelse } = læsKodeOgNavn(første);
        return { type: 'kopi', kopi: { handling: 'kopier_vaerk', ny_kode: kode, navn, beskrivelse } };
    }
    if (første && (første.handling === 'upload_tidsserie' || første.handling === 'upload_vaerksark' || første.handling === 'aktiver_tidsserie')) {
        if (v.length !== 1) throw new Afvisning('En upload eller aktivering skal være den eneste handling i anmodningen.');
        const filnavn = String(første.filnavn ?? '').trim();
        const sha = String(første.sha256 ?? '').toLowerCase();
        if (første.handling === 'aktiver_tidsserie') {
            const id = String(første.tidsserie_id ?? '').toLowerCase();
            if (!UUID_MØNSTER.test(id)) throw new Afvisning('Tidsseriens id er ikke et gyldigt uuid.');
            if (typeof første.aktiv !== 'boolean') throw new Afvisning('"aktiv" skal være true eller false.');
            return { type: 'aktiver_tidsserie', aktiver: { handling: 'aktiver_tidsserie', tidsserie_id: id, aktiv: første.aktiv } };
        }
        if (!filnavn || filnavn.length > 300) throw new Afvisning('Filnavnet mangler eller er for langt (højst 300 tegn).');
        if (!/^[0-9a-f]{64}$/.test(sha)) throw new Afvisning('Filens sha256 mangler eller er ugyldig.');
        if (første.handling === 'upload_vaerksark') {
            if (første.timeslut != null && typeof første.timeslut !== 'boolean') throw new Afvisning('"timeslut" skal være true, false eller udeladt.');
            const basis = første.basis_sha256 == null ? null : String(første.basis_sha256).toLowerCase();
            if (basis !== null && !/^[0-9a-f]{64}$/.test(basis)) throw new Afvisning('Basis-arkets sha256 er ugyldig.');
            return { type: 'upload_vaerksark', upload: { handling: 'upload_vaerksark', filnavn, sha256: sha, timeslut: (første.timeslut as boolean | undefined) ?? null, basis_sha256: basis } };
        }
        const rolle = første.rolle;
        if (rolle !== 'varmelast' && rolle !== 'solprofil') throw new Afvisning(`Ukendt rolle "${String(rolle)}" (varmelast eller solprofil).`);
        const tidsstempel = første.tidsstempel;
        if (tidsstempel !== 'start' && tidsstempel !== 'slut') throw new Afvisning('Tidsstemplet skal være "start" eller "slut" på timen.');
        const navn = String(første.navn ?? '').trim() || filnavn;
        if (navn.length > 200) throw new Afvisning('Navnet er for langt (højst 200 tegn).');
        const tidszone = String(første.tidszone ?? '');
        if (!tidszone || tidszone.length > 40) throw new Afvisning('Tidszonen mangler — vælg UTC eller dansk lokaltid.');
        const enhed = String(første.enhed ?? '');
        if (!enhed || enhed.length > 20) throw new Afvisning('Enheden mangler — vælg MW, kW, MWh eller kWh pr. interval.');
        const kolonne = første.kolonne == null || første.kolonne === '' ? null : String(første.kolonne);
        if (kolonne && kolonne.length > 200) throw new Afvisning('Kolonnenavnet er for langt.');
        return { type: 'upload_tidsserie', upload: { handling: 'upload_tidsserie', rolle, navn, filnavn, tidsstempel, tidszone, enhed, kolonne, sha256: sha } };
    }
    if (første && (første.handling === 'opret_vaerk' || første.handling === 'opret_vaerk_del')) {
        if (v.length !== 1) throw new Afvisning('Oprettelse af et værk skal være den eneste handling i anmodningen.');
        const udkast = læsUdkast(første.udkast);
        if (første.handling === 'opret_vaerk') {
            const { kode, navn, beskrivelse } = læsKodeOgNavn(første);
            const dele = læsHeltal(første.dele, 'Antal dele', 1, MAKS_DELE);
            return { type: 'opret', opret: { handling: 'opret_vaerk', udkast, dele, ny_kode: kode, navn, beskrivelse } };
        }
        const af = læsHeltal(første.af, 'Antal dele', 1, MAKS_DELE);
        const nr = læsHeltal(første.nr, 'Delens nummer', 1, af);
        if (!Array.isArray(første.blade) || første.blade.length === 0) throw new Afvisning(`Del ${nr} af ${af} har ingen blade.`);
        return { type: 'opret_del', del: { handling: 'opret_vaerk_del', udkast, nr, af, blade: første.blade as Blad[] } };
    }
    const ud: ParameterAendring[] = [];
    const set = new Set<string>();
    for (const [i, r] of v.entries()) {
        const a = r as Record<string, unknown>;
        const sti = String(a?.sti ?? '');
        const handling = a?.handling;
        if (handling !== 'opret' && handling !== 'ret' && handling !== 'slet') throw new Afvisning(`Ændring ${i + 1}: ukendt handling "${String(handling)}".`);
        if (!gyldigSti(sti)) throw new Afvisning(`Ændring ${i + 1}: ugyldig sti "${sti}".`);
        if (set.has(sti)) throw new Afvisning(`Stien "${sti}" ændres to gange i samme anmodning.`);
        set.add(sti);
        let ny_json: string | null = null;
        if (handling !== 'slet') {
            if (typeof a.ny_json !== 'string' || !a.ny_json) throw new Afvisning(`Ændring af ${sti}: mangler ny værdi.`);
            if (a.ny_json.length > MAKS_JSON) throw new Afvisning(`Ændring af ${sti}: værdien er for lang (højst ${MAKS_JSON} tegn).`);
            const f = ikkeEndelig(læsJson(a.ny_json, `Ændring af ${sti}`));
            if (f !== null) throw new Afvisning(`Ændring af ${sti}: ${f} er ikke et endeligt tal.`);
            ny_json = a.ny_json;
        }
        ud.push({ sti, handling, ny_json });
    }
    return { type: 'parametre', aendringer: ud };
}

export interface Plan {
    opret: { sti: string; ny_json: string; sektion: string; objekt: string | null }[];
    ret: { sti: string; gammel_json: string; ny_json: string }[];
    slet: { sti: string; gammel_json: string }[];
}

/**
 * Sammenholder parameterændringer med værkets nuværende blade. `opret` må
 * ikke ramme et eksisterende blad, og et nyt blad må hverken ligge UNDER et
 * eksisterende blad (`a.b` er en værdi -> `a.b.c` kan ikke oprettes) eller
 * OVER et (`a` kan ikke blive et blad, når `a.b` findes) — ellers kan YAML'en
 * ikke genskabes.
 */
export function planlægParametre(nuværende: ReadonlyMap<string, string>, aendringer: readonly ParameterAendring[]): Plan {
    const plan: Plan = { opret: [], ret: [], slet: [] };
    const efterSlet = new Set([...nuværende.keys()].filter((s) => !aendringer.some((a) => a.handling === 'slet' && a.sti === s)));
    for (const a of aendringer) {
        const gammel = nuværende.get(a.sti);
        if (a.handling === 'opret') {
            if (gammel !== undefined) throw new Afvisning(`"${a.sti}" findes allerede — brug ret i stedet for opret.`);
            for (const s of efterSlet) {
                if (a.sti.startsWith(`${s}.`)) throw new Afvisning(`"${a.sti}" kan ikke oprettes, fordi "${s}" allerede er en værdi.`);
                if (s.startsWith(`${a.sti}.`)) throw new Afvisning(`"${a.sti}" kan ikke blive en værdi, fordi "${s}" ligger under den.`);
            }
            const [sektion, objekt] = a.sti.split('.');
            const harObjekt = ['units', 'storage', 'prices'].includes(sektion) && a.sti.split('.').length > 2;
            plan.opret.push({ sti: a.sti, ny_json: a.ny_json!, sektion, objekt: harObjekt ? objekt : null });
            efterSlet.add(a.sti);
        } else if (gammel === undefined) {
            throw new Afvisning(`"${a.sti}" findes ikke i værket (måske slettet af en anden).`);
        } else if (a.handling === 'ret') {
            if (gammel !== a.ny_json) plan.ret.push({ sti: a.sti, gammel_json: gammel, ny_json: a.ny_json! });
        } else {
            plan.slet.push({ sti: a.sti, gammel_json: gammel });
        }
    }
    if (plan.opret.length + plan.ret.length + plan.slet.length === 0) throw new Afvisning('Anmodningen ændrer ingenting.');
    return plan;
}

// ------------------------------------------------------------------ nyt værk fra bunden

export interface NytBlad { sti: string; vaerdi_json: string; sektion: string; objekt: string | null; bekraeft: boolean; kommentar: string | null; raekkefoelge: number }

/**
 * Samler et nyt værks dele til én bladliste og validerer den. `dele` er de fundne `opret_vaerk_del`-anmodninger
 * med samme udkast; de skal være præcis nr. 1..`antal`, hver med `af = antal`. Bladene beholder delenes
 * rækkefølge (= `raekkefoelge`, så YAML'en genskabes i brugerens orden).
 *
 * Validering (strukturel; modellens egne krav prøves først ved en kørsel): gyldig sti, ingen dublet, gyldig JSON
 * inden for 4000 tegn, intet blad over eller under et andet (`a.b` og `a.b.c` kan ikke begge være værdier — ellers
 * kan YAML'en ikke genskabes), og mindst én enhed under `units.`.
 */
export function samlNytVaerk(dele: readonly OpretVaerkDel[], antal: number, udkast: string): NytBlad[] {
    const fremmed = dele.find((d) => d.udkast !== udkast);
    if (fremmed) throw new Afvisning('En del hører til et andet udkast.');
    const forkertAntal = dele.find((d) => d.af !== antal);
    if (forkertAntal) throw new Afvisning(`Del ${forkertAntal.nr} siger ${forkertAntal.af} dele, men oprettelsen siger ${antal}.`);
    const pr = new Map<number, OpretVaerkDel>();
    for (const d of dele) {
        if (pr.has(d.nr)) throw new Afvisning(`Del ${d.nr} findes to gange — send oprettelsen igen fra begyndelsen.`);
        pr.set(d.nr, d);
    }
    const mangler = Array.from({ length: antal }, (_, i) => i + 1).filter((n) => !pr.has(n));
    if (mangler.length) throw new Afvisning(`Del ${mangler.join(', ')} af ${antal} mangler — send oprettelsen igen fra begyndelsen.`);

    const ud: NytBlad[] = [];
    const set = new Set<string>();
    for (let n = 1; n <= antal; n++) {
        for (const r of pr.get(n)!.blade) {
            const b = r as unknown as Record<string, unknown>;
            const sti = String(b?.sti ?? '');
            if (!gyldigSti(sti)) throw new Afvisning(`Ugyldig sti "${sti}".`);
            if (set.has(sti)) throw new Afvisning(`Stien "${sti}" står to gange.`);
            set.add(sti);
            if (typeof b.ny_json !== 'string' || !b.ny_json) throw new Afvisning(`${sti}: mangler værdi.`);
            if (b.ny_json.length > MAKS_JSON) throw new Afvisning(`${sti}: værdien er for lang (højst ${MAKS_JSON} tegn).`);
            læsJson(b.ny_json, sti);
            const kommentar = b.kommentar == null || b.kommentar === '' ? null : String(b.kommentar);
            if (kommentar && kommentar.length > 2000) throw new Afvisning(`${sti}: kommentaren er for lang (højst 2000 tegn).`);
            const dele = sti.split('.');
            const harObjekt = ['units', 'storage', 'prices'].includes(dele[0]) && dele.length > 2;
            ud.push({ sti, vaerdi_json: b.ny_json, sektion: dele[0], objekt: harObjekt ? dele[1] : null, bekraeft: b.bekraeft === true, kommentar, raekkefoelge: ud.length + 1 });
            if (ud.length > MAKS_BLADE) throw new Afvisning(`Værket har for mange blade (højst ${MAKS_BLADE}).`);
        }
    }
    // Et blad over/under et andet: tjek hvert blads egne præfikser (ikke naboer efter sortering — "-" sorterer før
    // ".", så "a.b-x" kan ligge mellem "a.b" og "a.b.c").
    for (const sti of set) {
        const d = sti.split('.');
        for (let i = 1; i < d.length; i++) {
            const over = d.slice(0, i).join('.');
            if (set.has(over)) throw new Afvisning(`"${over}" kan ikke være en værdi, fordi "${sti}" ligger under den.`);
        }
    }
    tjekModelkrav(ud);
    return ud;
}

// ------------------------------------------------------------------ modelkrav (K4-F1)

/** Første ikke-endelige tal i en JSON-værdi (rekursivt), eller null. `JSON.parse("1e400")` giver Infinity. */
export function ikkeEndelig(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? null : v;
    if (Array.isArray(v)) { for (const x of v) { const f = ikkeEndelig(x); if (f !== null) return f; } return null; }
    if (v && typeof v === 'object') { for (const x of Object.values(v)) { const f = ikkeEndelig(x); if (f !== null) return f; } }
    return null;
}

const BRÆNDSEL_UDEN_PRIS = new Set(['electricity', 'solar']);
const DATO_START = /^\d{4}-\d{2}-\d{2}/;

/**
 * Modellens minimumskrav til et værk (K4-F1), så et nyt værk ikke kan gemmes som "færdigt" og først fejle ved
 * kørsel. Kilden er fv-eksperts `viden/nyt_vaerk_skabelon.json` › `obligatoriske_felter` (modelrepo
 * src/config.py:906-1165, src/tariff.py:110-161). Kontrollen er bevidst et MINIMUM: den afviser hvad modellen med
 * sikkerhed ikke kan indlæse eller regne på (manglende/forkert-typede felter, ikke-endelige tal, en tarifprofil
 * der ikke dækker året); om tallene er fornuftige, afgør prøvekørslen. Alle 16 af guidens varianter, som Codex
 * K4 fik igennem modellens `load_case`, passerer (test/vektorer/k4_guide_vaerker.json).
 */
export function tjekModelkrav(blade: readonly { sti: string; vaerdi_json: string }[]): void {
    const v = new Map<string, unknown>(blade.map((b) => [b.sti, JSON.parse(b.vaerdi_json) as unknown]));
    const fejl: string[] = [];
    for (const [sti, x] of v) {
        const f = ikkeEndelig(x);
        if (f !== null) fejl.push(`${sti} er ikke et endeligt tal (${f})`);
    }
    const tal = (sti: string, min = -Infinity) => {
        const x = v.get(sti);
        if (typeof x !== 'number' || !Number.isFinite(x)) fejl.push(`${sti} mangler eller er ikke et tal`);
        else if (x < min) fejl.push(`${sti} må ikke være under ${min}`);
    };
    const tekst = (sti: string) => {
        const x = v.get(sti);
        if (typeof x !== 'string' || !x.trim()) fejl.push(`${sti} mangler eller er ikke en tekst`);
    };

    // Altid.
    for (const s of ['meta.case_name', 'data.dmi_area', 'data.price_zone', 'time.resolution', 'electricity.spot_area']) tekst(s);
    for (const s of ['time.start', 'time.end']) {
        const x = v.get(s);
        if (typeof x !== 'string' || !DATO_START.test(x)) fejl.push(`${s} mangler eller er ikke en dato (ÅÅÅÅ-MM-DD)`);
    }
    const start = v.get('time.start'), slut = v.get('time.end');
    if (typeof start === 'string' && typeof slut === 'string' && DATO_START.test(start) && DATO_START.test(slut) && start.slice(0, 10) >= slut.slice(0, 10)) {
        fejl.push('time.end skal ligge efter time.start');
    }
    tal('heat_load_params.gaf_mw_per_k', 0);
    for (const s of ['prices.co2_eua.value', 'electricity.tariff_consumption_flat', 'electricity.tariff_production_flat', 'electricity.electricity_tax']) tal(s);

    // Enheder: mindst én aktiv; pr. enhed type, effekter, alpha, brændsel (+ virkningsgrad og pris, når brændslet købes).
    const enheder = [...new Set(blade.filter((b) => b.sti.startsWith('units.')).map((b) => b.sti.split('.')[1]))];
    const aktive = enheder.filter((n) => v.get(`units.${n}.enabled`) !== false);
    if (aktive.length === 0) fejl.push('værket skal have mindst én aktiv enhed (units.<navn>)');
    for (const n of enheder) {
        const u = `units.${n}`;
        tekst(`${u}.type`); tekst(`${u}.fuel`);
        tal(`${u}.p_max_heat`, 0); tal(`${u}.p_min_heat`, 0); tal(`${u}.alpha`);
        const pmax = v.get(`${u}.p_max_heat`), pmin = v.get(`${u}.p_min_heat`);
        if (typeof pmax === 'number' && typeof pmin === 'number' && pmin > pmax) fejl.push(`${u}.p_min_heat er større end p_max_heat`);
        const fuel = v.get(`${u}.fuel`);
        if (typeof fuel === 'string' && fuel && !BRÆNDSEL_UDEN_PRIS.has(fuel)) {
            tal(`${u}.eta_fuel_to_heat`);
            const eta = v.get(`${u}.eta_fuel_to_heat`);
            if (typeof eta === 'number' && eta <= 0) fejl.push(`${u}.eta_fuel_to_heat skal være større end 0`);
            if (v.get(`${u}.enabled`) !== false) tal(`prices.${fuel}.value`);
        }
    }

    // Lager: blokken skal findes (evt. tom: bladet `storage` = {}); hvert lager med sine felter.
    const lagre = [...new Set(blade.filter((b) => b.sti.startsWith('storage.')).map((b) => b.sti.split('.')[1]))];
    if (!v.has('storage') && lagre.length === 0) fejl.push('storage mangler (et værk uden lager har en tom storage-blok)');
    for (const n of lagre) {
        for (const f of ['volume_m3', 'delta_t_k', 'e_initial_mwh', 'p_max_charge_mw', 'p_max_discharge_mw']) tal(`storage.${n}.${f}`, 0);
        tal(`storage.${n}.self_discharge_per_hour`, 0);
    }

    // Tarifprofil: kun hvis der er en; da skal den dække alle 12 måneder og alle 24 timer i hver sæson.
    const NT = 'electricity.tariff_consumption.net_tariff';
    if (blade.some((b) => b.sti.startsWith(`${NT}.`))) {
        tekst('electricity.tariff_consumption.unit');
        const bånd = new Set(blade.filter((b) => b.sti.startsWith(`${NT}.bands.`)).map((b) => b.sti.split('.')[4]));
        if (bånd.size === 0) fejl.push(`${NT}.bands mangler`);
        for (const b of bånd) tal(`${NT}.bands.${b}`);
        const sæsoner = [...new Set(blade.filter((b) => b.sti.startsWith(`${NT}.seasons.`)).map((b) => b.sti.split('.')[4]))];
        if (sæsoner.length === 0) fejl.push(`${NT}.seasons mangler`);
        const måneder: number[] = [];
        for (const s of sæsoner) {
            const m = v.get(`${NT}.seasons.${s}.months`);
            if (!Array.isArray(m) || !m.every((x) => Number.isInteger(x) && x >= 1 && x <= 12)) fejl.push(`${NT}.seasons.${s}.months skal være en liste af måneder 1-12`);
            else måneder.push(...(m as number[]));
            for (const dag of ['weekday', 'weekend']) {
                const før = `${NT}.seasons.${s}.${dag}.`;
                const timer = new Array<number>(24).fill(0);
                for (const b of blade.filter((x) => x.sti.startsWith(før))) {
                    const r = /^(\d{2})-(\d{2})$/.exec(b.sti.slice(før.length));
                    if (!r) { fejl.push(`${b.sti}: timeintervallet skal skrives TT-TT`); continue; }
                    for (let t = Number(r[1]); t < Number(r[2]) && t < 24; t++) timer[t]++;
                    const navn = v.get(b.sti);
                    if (typeof navn !== 'string' || !bånd.has(navn)) fejl.push(`${b.sti} peger på et bånd, der ikke findes (${JSON.stringify(navn)})`);
                }
                const huller = timer.flatMap((n, t) => (n === 1 ? [] : [t]));
                if (huller.length) fejl.push(`${før.slice(0, -1)} dækker ikke hver time præcis én gang (time ${huller.join(', ')})`);
            }
        }
        const dubletter = måneder.filter((m, i) => måneder.indexOf(m) !== i);
        const mangler = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !måneder.includes(m));
        if (sæsoner.length && (dubletter.length || mangler.length)) fejl.push(`sæsonerne skal dække hver måned præcis én gang (mangler ${mangler.join(', ') || '-'}, dobbelt ${[...new Set(dubletter)].join(', ') || '-'})`);
        const net = v.get('electricity.tariff_consumption.fixed_components.elafgift_net');
        if (net !== undefined && net !== v.get('electricity.electricity_tax')) fejl.push('fixed_components.elafgift_net skal være lig electricity.electricity_tax');
    }

    if (fejl.length) {
        const vis = fejl.slice(0, 8);
        throw new Afvisning(`Værket kan ikke bruges af modellen: ${vis.join('; ')}${fejl.length > vis.length ? ` (og ${fejl.length - vis.length} mere)` : ''}.`);
    }
}
