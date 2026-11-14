//-----------------------------------------------------------------------
// Arkivet (runde 13): tabsfri eksport og genimport af scenarier og kørsler.
//
// Et arkiv er en BACKUP og migreringsvejen (testinstallation -> produktion; `rayfin up` mod et nyt
// workspace giver en tom database), ikke et redigeringsformat. Derfor:
//   * rækkerne gemmes med deres id'er og databasens værdier uændret (kanonisk form nedenfor), og hver tabel
//     har en sha256 i arkivets manifest, så et rettet eller beskadiget ark opdages før noget skrives;
//   * genimporten er idempotent på id: samme id og samme indhold springes over, samme id med andet indhold
//     er en konflikt, der vises og aldrig overskrives;
//   * et scenarie skrives i SAMME del (transaktion) som sine ændringer, så det aldrig findes halvt (K10-F1);
//   * en kørsel skrives SIDST (efter alle dens input-, nøgletals-, måneds- og timerækker), og Function'en
//     tjekker antal OG indhold (sha256 pr. undertabel) og input_hash under en lås pr. kørsel, før den skriver
//     kørslen — en afbrudt import er derfor usynlig og kan genoptages uden dubletter eller blandede arkiver
//     (K10-F2, F3). En eksisterende kørsel er kun "findes", hvis dens rækker også passer;
//   * tal arkiveres med dobbelt præcision — det, appen læser (normaliser.ts laver Number(v), før arkivet ser
//     værdien), og det, regnemotoren skriver. En decimal-TEKST, der når `kanonisk`, og som et JS-tal ikke kan bære,
//     afvises; decimaler skrives som ren decimaltekst uden eksponent (K10-F5, K10b-N2).
//
// Ren logik uden node:-import: browseren (eksport, forhåndsvisning) og Function `importerArkiv` bruger
// PRÆCIS denne fil. Python-porten er community/fjernvarme_app/logik/arkiv.py, bundet af
// skema/vektorer/arkiv_*.json.
//-----------------------------------------------------------------------

import { SKEMA_TABELLER, SKEMAVERSION } from './skema.data.js';

export { SKEMAVERSION };

export class ArkivAfvisning extends Error {
    constructor(besked: string) {
        super(besked);
        this.name = 'ArkivAfvisning';
    }
}

export const ARKIV_FORMAT = 'fjv-arkiv';
/** 2: sha256 pr. række i tabellens hash og entydigt kodede afledte kolonner (runde 13b). */
export const ARKIV_FORMATVERSION = 2;
export const DEL_FORMAT = 'fjv-arkiv-del';
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** De tabeller, et arkiv genimporterer — i den rækkefølge, de skrives (en kørsel til sidst, efter sine rækker). */
export const IMPORT_TABELLER = [
    'Scenarie', 'ScenarieAendring', 'Bestilling', 'KoerselInput', 'KoerselNoegletal', 'KoerselMaaned', 'KoerselTime', 'Koersel',
] as const;
export type ImportTabel = (typeof IMPORT_TABELLER)[number];

/** En kørsels rækker i de fire undertabeller. */
export const KOERSEL_BOERN = ['KoerselInput', 'KoerselNoegletal', 'KoerselMaaned', 'KoerselTime'] as const;
export type KoerselBarn = (typeof KOERSEL_BOERN)[number];

/** Kun færdige kørsler kan arkiveres: en importeret kørsel i `koe` ville blive kørt igen af arbejderen. */
export const AFSLUTTEDE_STATUS = ['faerdig', 'fejl', 'annulleret'] as const;

export type Kolonnetype = 'uuid' | 'text' | 'set' | 'int' | 'decimal' | 'boolean' | 'datetime';

export interface Kolonne {
    navn: string; type: Kolonnetype; nullable: boolean;
    max?: number; min?: number; vaerdier?: readonly string[]; moenster?: string; precision?: number; scale?: number;
}

export function kolonner(tabel: ImportTabel | 'Aendringslog'): readonly Kolonne[] {
    return SKEMA_TABELLER[tabel].kolonner as unknown as readonly Kolonne[];
}

export function kolonnenavne(tabel: ImportTabel | 'Aendringslog'): string[] {
    return kolonner(tabel).map((k) => k.navn);
}

export const erImportTabel = (t: string): t is ImportTabel => (IMPORT_TABELLER as readonly string[]).includes(t);

/** De tabeller, en del kan skrive. ScenarieAendring rejser med sit scenarie (Scenarie-delens `aendringer`, K10-F1). */
export const DEL_TABELLER = ['Scenarie', 'Bestilling', 'KoerselInput', 'KoerselNoegletal', 'KoerselMaaned', 'KoerselTime', 'Koersel'] as const;
export type DelTabel = (typeof DEL_TABELLER)[number];
export const erDelTabel = (t: string): t is DelTabel => (DEL_TABELLER as readonly string[]).includes(t);

// ------------------------------------------------------------------ sha256 (ren JS: browser og Node)

const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** sha256 (hex) af bytes. Synkron og uden crypto-API, så den er ens i browseren, i Function og i testene. */
export function sha256Bytes(data: Uint8Array): string {
    const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const n = data.length;
    const blokke = Math.ceil((n + 9) / 64);
    const w = new Uint32Array(64);
    const sidste = new Uint8Array(128);
    const halenFra = Math.floor(n / 64) * 64;
    sidste.set(data.subarray(halenFra));
    sidste[n - halenFra] = 0x80;
    const halelængde = blokke * 64 - halenFra;
    const bits = n * 8;
    const dv = new DataView(sidste.buffer);
    dv.setUint32(halelængde - 8, Math.floor(bits / 0x100000000));
    dv.setUint32(halelængde - 4, bits >>> 0);
    for (let b = 0; b < blokke; b++) {
        const fra = b * 64;
        const kilde = fra < halenFra ? data : sidste;
        const o = fra < halenFra ? fra : fra - halenFra;
        for (let i = 0; i < 16; i++) {
            const j = o + i * 4;
            w[i] = ((kilde[j] << 24) | (kilde[j + 1] << 16) | (kilde[j + 2] << 8) | kilde[j + 3]) >>> 0;
        }
        for (let i = 16; i < 64; i++) {
            const a = w[i - 15], c = w[i - 2];
            const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
            const s1 = ((c >>> 17) | (c << 15)) ^ ((c >>> 19) | (c << 13)) ^ (c >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [a, bb, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
            const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            const t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
            hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
        }
        h[0] += a; h[1] += bb; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
}

export const sha256Tekst = (s: string): string => sha256Bytes(new TextEncoder().encode(s));

// ------------------------------------------------------------------ kanonisk form

/** En celle, som arkivet gemmer den: tekst, tal, sand/falsk eller tom. Tid er ISO-tekst i UTC med millisekunder. */
export type Kanonisk = string | number | boolean | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** De ISO-former, en tid må have som tekst. Date.parse alene tager imod for meget (" 12.5 " er en dato i V8). */
const ISO_TID = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?)?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * En databaseværdi (som Rayfin-klienten efter `normaliser`, mssql eller community-serveren giver den) i arkivets
 * form. Tid: en Date eller en ISO-streng -> `YYYY-MM-DDTHH:MM:SS.sssZ` (UTC; mangler zonen, er det UTC — aldrig
 * lokal tid). uuid: små bogstaver (mssql svarer med STORE). Tal: et endeligt tal. Kaster ved en værdi, der ikke
 * passer til typen — en eksport må hellere stoppe end gemme noget, genimporten ikke kan genskabe.
 */
export function kanonisk(k: Kolonne, v: unknown): Kanonisk {
    if (v === null || v === undefined) return null;
    switch (k.type) {
        case 'uuid':
            if (typeof v !== 'string') throw new ArkivAfvisning(`${k.navn}: forventede et uuid, fik ${typeof v}.`);
            return v.toLowerCase();
        case 'text':
        case 'set':
            if (typeof v === 'string') return v;
            throw new ArkivAfvisning(`${k.navn}: forventede tekst, fik ${typeof v}.`);
        case 'int':
        case 'decimal': {
            const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
            if (!Number.isFinite(n)) throw new ArkivAfvisning(`${k.navn}: forventede et tal, fik ${String(v)}.`);
            // En decimal som tekst (fx en database, der svarer med tekst) må ikke afrundes tavst (K10-F5).
            if (typeof v === 'string' && !decimalBevares(v, n)) {
                throw new ArkivAfvisning(`${k.navn}: ${v.trim()} har flere cifre, end arkivet kan bevare (dobbelt præcision, ca. 15–17 betydende cifre).`);
            }
            return Object.is(n, -0) ? 0 : n;
        }
        case 'boolean':
            if (typeof v === 'boolean') return v;
            if (v === 0 || v === 1) return v === 1;
            throw new ArkivAfvisning(`${k.navn}: forventede sand/falsk, fik ${String(v)}.`);
        case 'datetime': {
            const t = v instanceof Date ? v.getTime() : typeof v === 'string' && ISO_TID.test(v)
                ? Date.parse(/Z|[+-]\d{2}:\d{2}$/.test(v) ? v : v.length === 10 ? `${v}T00:00:00Z` : `${v}Z`) : NaN;
            if (!Number.isFinite(t)) throw new ArkivAfvisning(`${k.navn}: forventede et tidspunkt, fik ${String(v)}.`);
            return new Date(t).toISOString();
        }
    }
}

/** Et decimaltal som (fortegn, cifre uden foranstillede/efterstillede nuller, eksponent): "1.50" og "15e-1" er ens. */
function decimalNormal(s: string): string | null {
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s.trim());
    if (!m || (m[2] === '' && (m[3] ?? '') === '')) return null;
    const alle = `${m[2]}${m[3] ?? ''}`;
    const uden = alle.replace(/^0+/, '');
    const eks = Number(m[4] ?? 0) + m[2].length - (alle.length - uden.length);
    const cifre = uden.replace(/0+$/, '');
    return cifre === '' ? '0' : `${m[1] === '-' ? '-' : ''}${cifre}e${eks}`;
}

/** Bærer JS-tallet `n` præcis de cifre, teksten `s` har? (`String(n)` er den korteste form, der giver `n` igen.) */
export function decimalBevares(s: string, n: number): boolean {
    const a = decimalNormal(s);
    return a !== null && a === decimalNormal(String(n));
}

/**
 * Et JS-tal som ren decimaltekst — JS' korteste cifre (`String(n)`), men uden eksponent: `1e-7` -> `0.0000001`,
 * `1e+21` -> `1000000000000000000000`. Det er den tekst, Function'en CAST'er til DECIMAL; SQL Servers tekst->decimal
 * tager ikke eksponentnotation (K10b-N2). Cifrene flyttes kun — ingen omvej via et nyt float.
 */
export function decimalTekst(n: number): string {
    if (!Number.isFinite(n)) throw new ArkivAfvisning(`${String(n)} er ikke et endeligt tal.`);
    const s = String(Object.is(n, -0) ? 0 : n);
    const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(s);
    if (!m) throw new ArkivAfvisning(`Uventet talform: ${s}.`);
    if (!m[4]) return s;
    const [, fortegn, heltal, brøk = ''] = m;
    const cifre = heltal + brøk;
    const punkt = heltal.length + Number(m[4]);
    if (punkt <= 0) return `${fortegn}0.${'0'.repeat(-punkt)}${cifre}`;
    if (punkt >= cifre.length) return `${fortegn}${cifre}${'0'.repeat(punkt - cifre.length)}`;
    return `${fortegn}${cifre.slice(0, punkt)}.${cifre.slice(punkt)}`;
}

/** Rækken som kanoniske værdier i skemaets kolonnerækkefølge. */
export function kanoniskRække(tabel: ImportTabel | 'Aendringslog', r: Record<string, unknown>): Kanonisk[] {
    return kolonner(tabel).map((k) => kanonisk(k, r[k.navn]));
}

/** Rækkens tekst i tabellens sha: kompakt JSON af værdierne (tal i JS' korteste form). */
export const rækkeTekst = (r: readonly Kanonisk[]): string => JSON.stringify(r);

/** Rækkens sha256 (af dens JSON-linje). */
export const rækkeSha = (r: readonly Kanonisk[]): string => sha256Tekst(rækkeTekst(r));

/**
 * Tabellens sha256: rækkernes sha256 sorteret og adskilt af "\n" — uafhængig af den rækkefølge, databasen eller arket
 * giver rækkerne i, og den kan regnes side for side (en kørsel har op til 35.040 timer; serveren holder kun 64 tegn pr.
 * række i hukommelsen). Python-porten skriver tallene som JS (logik/jsjson.py), så de to giver samme hash.
 */
export class TabelHash {
    private shas: string[] = [];
    tilføj(r: readonly Kanonisk[]): void { this.shas.push(rækkeSha(r)); }
    get antal(): number { return this.shas.length; }
    sha256(): string { return sha256Tekst([...this.shas].sort().join('\n')); }
}

export function tabelSha(rækker: readonly (readonly Kanonisk[])[]): string {
    const h = new TabelHash();
    for (const r of rækker) h.tilføj(r);
    return h.sha256();
}

/** Arkivets samlede sha256: tabellernes sha'er i fast rækkefølge (navn:sha pr. linje). */
export function arkivSha(tabelshas: Readonly<Record<string, string>>): string {
    return sha256Tekst(Object.keys(tabelshas).sort().map((t) => `${t}:${tabelshas[t]}`).join('\n'));
}

// ------------------------------------------------------------------ validering mod skemaet

const utf16Længde = (s: string) => s.length;
/** `min` tæller ikke afsluttende mellemrum (mssql LEN; SKEMA.md). */
const lenUdenHalemellemrum = (s: string) => s.replace(/ +$/, '').length;
const INT_MIN = -2147483648, INT_MAX = 2147483647;

/** Én værdi mod sin kolonne. Svarer med en dansk fejltekst eller null. */
export function fejlIVærdi(k: Kolonne, v: Kanonisk): string | null {
    if (v === null) return k.nullable ? null : `${k.navn} må ikke være tom.`;
    switch (k.type) {
        case 'uuid':
            return typeof v === 'string' && UUID.test(v) ? null : `${k.navn} er ikke et uuid med små bogstaver.`;
        case 'text':
        case 'set': {
            if (typeof v !== 'string') return `${k.navn} skal være tekst.`;
            if (k.max !== undefined && utf16Længde(v) > k.max) return `${k.navn} er for lang (${utf16Længde(v)} > ${k.max} tegn).`;
            if (k.min !== undefined && lenUdenHalemellemrum(v) < k.min) return `${k.navn} er for kort.`;
            if (k.vaerdier && !k.vaerdier.includes(v)) return `${k.navn} har en ukendt værdi "${v}".`;
            if (k.moenster && !new RegExp(k.moenster).test(v)) return `${k.navn} har ikke den forventede form.`;
            if (k.navn.endsWith('_json')) {
                try { JSON.parse(v); } catch { return `${k.navn} er ikke gyldig JSON.`; }
            }
            return null;
        }
        case 'int':
            return typeof v === 'number' && Number.isInteger(v) && v >= INT_MIN && v <= INT_MAX ? null : `${k.navn} skal være et heltal.`;
        case 'decimal': {
            if (typeof v !== 'number' || !Number.isFinite(v)) return `${k.navn} skal være et tal.`;
            const loft = 10 ** ((k.precision ?? 38) - (k.scale ?? 0));
            return Math.abs(v) < loft ? null : `${k.navn} er for stort til kolonnen.`;
        }
        case 'boolean':
            return typeof v === 'boolean' ? null : `${k.navn} skal være sand eller falsk.`;
        case 'datetime':
            return typeof v === 'string' && ISO_MS.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v
                ? null : `${k.navn} er ikke et tidspunkt i UTC (ÅÅÅÅ-MM-DDTtt:mm:ss.sssZ).`;
    }
}

/** Fejlene i en række (tom liste = gyldig). */
export function fejlIRække(tabel: ImportTabel, r: readonly Kanonisk[]): string[] {
    const ks = kolonner(tabel);
    if (r.length !== ks.length) return [`${tabel}: rækken har ${r.length} værdier, skemaet ${ks.length}.`];
    return ks.map((k, i) => fejlIVærdi(k, r[i])).filter((x): x is string => x !== null);
}

// ------------------------------------------------------------------ sammenligning (idempotens på id)

export type Udfald = 'ny' | 'ens' | 'konflikt';

/** Kolonnerne, hvor to kanoniske rækker er forskellige. */
export function forskelle(tabel: ImportTabel, a: readonly Kanonisk[], b: readonly Kanonisk[]): string[] {
    return kolonnenavne(tabel).filter((_, i) => a[i] !== b[i]);
}

/** Arkivets række mod databasens (rå værdier; undefined = findes ikke). */
export function sammenlign(tabel: ImportTabel, arkiv: readonly Kanonisk[], db: Record<string, unknown> | undefined): { udfald: Udfald; kolonner: string[] } {
    if (!db) return { udfald: 'ny', kolonner: [] };
    const f = forskelle(tabel, arkiv, kanoniskRække(tabel, db));
    return { udfald: f.length ? 'konflikt' : 'ens', kolonner: f };
}

// ------------------------------------------------------------------ værkets revisioner

export interface InputRad { kilde: string; sti: string; vaerdi_json: string }

/**
 * sha256 over et frosset input — SAMME definition som logik.ts `inputHash` (og arbejderens): tupler
 * [kilde, sti, vaerdi_json] sorteret, kompakt JSON. Gentaget her uden node:crypto, så browseren kan bruge den;
 * arkiv.spec.ts kræver, at de to er ens.
 */
export function inputHashRen(rækker: readonly InputRad[]): string {
    const t = rækker.map((r) => [r.kilde, r.sti, r.vaerdi_json] as const);
    t.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
    return sha256Tekst(JSON.stringify(t));
}

/** Værkets parametre som ét fingeraftryk: inputHash over bladene som kilde=vaerk (det, en kørsel fryser). */
export const vaerkSha = (blade: readonly { sti: string; vaerdi_json: string }[]): string =>
    inputHashRen(blade.map((b) => ({ kilde: 'vaerk', sti: b.sti, vaerdi_json: b.vaerdi_json })));

export interface LogRad { revision: number; sti: string; handling: string; gammel_json: string | null; ny_json: string | null }

/**
 * Værkets tilstand ved hver revision, rekonstrueret baglæns fra de nuværende blade og Aendringslog:
 * revision R er bladene nu; R-1 er R med revision R's logrækker fortrudt (opret -> fjern, ret/slet -> gammel værdi).
 * Svarer med sha -> de revisioner, der havde netop de parametre. Mangler en revisions log (fx en import), er dens
 * rekonstruktion forkert — det kan kun give en afvisning for meget, aldrig en forkert godkendelse af indhold, for
 * sammenligningen er på selve parametrene.
 */
export function vaerkRevisioner(revision: number, blade: readonly { sti: string; vaerdi_json: string }[], log: readonly LogRad[]): Map<string, number[]> {
    const tilstand = new Map(blade.map((b) => [b.sti, b.vaerdi_json] as const));
    const prRevision = new Map<number, LogRad[]>();
    for (const l of log) prRevision.set(l.revision, [...(prRevision.get(l.revision) ?? []), l]);
    const ud = new Map<string, number[]>();
    const noter = (rev: number) => {
        const sha = vaerkSha([...tilstand].map(([sti, vaerdi_json]) => ({ sti, vaerdi_json })));
        ud.set(sha, [...(ud.get(sha) ?? []), rev]);
    };
    for (let rev = revision; rev >= 1; rev--) {
        noter(rev);
        for (const l of prRevision.get(rev) ?? []) {
            if (l.handling === 'opret') tilstand.delete(l.sti);
            else if (l.gammel_json !== null) tilstand.set(l.sti, l.gammel_json);
        }
    }
    return ud;
}

/** Tidsserierne, en kørsel er frosset med (`_koersel.tidsserie.<rolle>` = {id, sha256}). */
export function frosneTidsserier(input: readonly InputRad[]): { rolle: string; id: string; sha256: string }[] {
    const ud: { rolle: string; id: string; sha256: string }[] = [];
    for (const r of input) {
        if (!r.sti.startsWith('_koersel.tidsserie.')) continue;
        let v: { id?: unknown; sha256?: unknown };
        try { v = JSON.parse(r.vaerdi_json); } catch { throw new ArkivAfvisning(`${r.sti} er ikke gyldig JSON.`); }
        if (typeof v?.sha256 !== 'string' || typeof v?.id !== 'string') throw new ArkivAfvisning(`${r.sti} mangler id eller sha256.`);
        ud.push({ rolle: r.sti.slice('_koersel.tidsserie.'.length), id: v.id, sha256: v.sha256 });
    }
    return ud;
}

// ------------------------------------------------------------------ anmodning og del (skrivevejen)

/**
 * `Aendringsanmodning.aendringer_json` for én del af en import (vaerk_id = nil-uuid'et):
 *   [{"handling":"importer_arkiv","arkiv":"<sha>","sha256":"<delens sha>","tabel":"KoerselTime","nr":3,"af":12,
 *     "koersel_ider":[…],"filnavn":"…"}]
 * Klienten opretter den i eget navn (DAB-policy: anmodet_af = brugeren) — identiteten; `sha256` binder netop
 * denne del til anmodningen (samme mønster som upload_tidsserie). `koersel_ider` er kørslerne i en Koersel-del,
 * og er det, appen viser "importeret fra arkiv" ud fra (ingen skemaændring).
 */
export interface ImportAnmodning {
    handling: 'importer_arkiv'; arkiv: string; sha256: string; tabel: DelTabel; nr: number; af: number;
    koersel_ider: string[]; filnavn: string;
}

export const IMPORT_PRAEFIKS = '[{"handling":"importer_arkiv"';
export const MAKS_KOERSLER_PR_DEL = 60;

const SHA = /^[0-9a-f]{64}$/;

export function importAnmodningJson(a: Omit<ImportAnmodning, 'handling'>): string {
    const s = JSON.stringify([{ handling: 'importer_arkiv', arkiv: a.arkiv, sha256: a.sha256, tabel: a.tabel, nr: a.nr, af: a.af, koersel_ider: a.koersel_ider, filnavn: a.filnavn }]);
    if (s.length > 4000) throw new ArkivAfvisning('Anmodningen er for lang (højst 4000 tegn) — for mange kørsler i én del.');
    return s;
}

export function læsImportAnmodning(tekst: string): ImportAnmodning {
    let v: unknown;
    try { v = JSON.parse(tekst); } catch { throw new ArkivAfvisning('Anmodningen er ikke gyldig JSON.'); }
    if (!Array.isArray(v) || v.length !== 1) throw new ArkivAfvisning('En arkivimport skal være den eneste handling i anmodningen.');
    const a = v[0] as Record<string, unknown>;
    if (a?.handling !== 'importer_arkiv') throw new ArkivAfvisning('Anmodningen er ikke en arkivimport.');
    if (typeof a.arkiv !== 'string' || !SHA.test(a.arkiv)) throw new ArkivAfvisning('Arkivets sha256 mangler eller er ugyldig.');
    if (typeof a.sha256 !== 'string' || !SHA.test(a.sha256)) throw new ArkivAfvisning('Delens sha256 mangler eller er ugyldig.');
    if (a.tabel === 'ScenarieAendring') throw new ArkivAfvisning('Scenariets ændringer sendes sammen med scenariet (samme del).');
    if (typeof a.tabel !== 'string' || !erDelTabel(a.tabel)) throw new ArkivAfvisning(`Ukendt tabel "${String(a.tabel)}".`);
    const heltal = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 1;
    if (!heltal(a.nr) || !heltal(a.af) || (a.nr as number) > (a.af as number)) throw new ArkivAfvisning('Delens nummer er ugyldigt.');
    if (!Array.isArray(a.koersel_ider) || !a.koersel_ider.every((x) => typeof x === 'string' && UUID.test(x))) {
        throw new ArkivAfvisning('koersel_ider skal være en liste af uuid\'er.');
    }
    if ((a.tabel === 'Koersel') !== (a.koersel_ider.length > 0)) throw new ArkivAfvisning('koersel_ider skal netop angives for en Koersel-del.');
    if (a.koersel_ider.length > MAKS_KOERSLER_PR_DEL) throw new ArkivAfvisning(`Højst ${MAKS_KOERSLER_PR_DEL} kørsler pr. del.`);
    const filnavn = typeof a.filnavn === 'string' ? a.filnavn : '';
    if (filnavn.length > 300) throw new ArkivAfvisning('Filnavnet er for langt.');
    return {
        handling: 'importer_arkiv', arkiv: a.arkiv, sha256: a.sha256, tabel: a.tabel, nr: a.nr as number, af: a.af as number,
        koersel_ider: a.koersel_ider as string[], filnavn,
    };
}

/** Antal rækker pr. undertabel. */
export type Børnetal = Record<KoerselBarn, number>;
/** En kørsels rækker, som de skal være i databasen, før kørslen skrives: antal og sha256 pr. undertabel (K10-F2). */
export interface Børnetilstand { antal: Børnetal; sha256: Record<KoerselBarn, string> }

/**
 * Én del (Function-kaldets andet argument, kompakt JSON):
 *   {"format":"fjv-arkiv-del","version":2,"arkiv":"<sha>","tabel":"…","kolonner":[…],"raekker":[[…],…],
 *    "aendringer":[[…]],                                              (kun Scenarie: scenariernes ændringer)
 *    "forventet":{"<koersel_id>":{"antal":{…},"sha256":{…}}}}         (kun Koersel)
 */
export interface Del {
    format: typeof DEL_FORMAT; version: 2; arkiv: string; tabel: DelTabel; kolonner: string[]; raekker: Kanonisk[][];
    aendringer?: Kanonisk[][];
    forventet?: Record<string, Børnetilstand>;
}

/**
 * Højst så mange UTF-8-bytes i hele Function-kaldets krop ({anmodningId, del} som JSON — delen er en JSON-TEKST, så
 * dens anførselstegn escapes igen). Et kald tager højst 4 MB (målt; tidsserie.ts); resten er margen (K10-F7).
 */
export const MAKS_KALD_BYTES = 3_000_000;

const utf8 = (s: string) => new TextEncoder().encode(s).byteLength;

/** UTF-8-størrelsen af kaldets krop, som klienten sender den. */
export function kaldBytes(delTekst: string): number {
    return utf8(JSON.stringify({ anmodningId: NIL_UUID, del: delTekst }));
}

function læsRækker(tabel: ImportTabel, v: unknown, hvad: string): Kanonisk[][] {
    if (!Array.isArray(v)) throw new ArkivAfvisning(`${hvad} skal være en liste.`);
    const ider = new Set<string>();
    for (const r of v as unknown[]) {
        if (!Array.isArray(r) || !r.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x))) {
            throw new ArkivAfvisning(`${tabel}: en række har ugyldige værdier.`);
        }
        const fejl = fejlIRække(tabel, r as Kanonisk[]);
        if (fejl.length) throw new ArkivAfvisning(`${tabel} ${String(r[0])}: ${fejl.join(' ')}`);
        if (ider.has(r[0] as string)) throw new ArkivAfvisning(`${tabel} ${String(r[0])} står to gange i delen.`);
        ider.add(r[0] as string);
    }
    return v as Kanonisk[][];
}

export function læsDel(tekst: string): Del {
    let v: Record<string, unknown>;
    try { v = JSON.parse(tekst); } catch { throw new ArkivAfvisning('Delen er ikke gyldig JSON.'); }
    if (v?.format !== DEL_FORMAT || v.version !== 2) throw new ArkivAfvisning('Delen har ikke arkivets format.');
    if (typeof v.arkiv !== 'string' || !SHA.test(v.arkiv)) throw new ArkivAfvisning('Delen mangler arkivets sha256.');
    if (v.tabel === 'ScenarieAendring') throw new ArkivAfvisning('Scenariets ændringer sendes sammen med scenariet (samme del).');
    if (typeof v.tabel !== 'string' || !erDelTabel(v.tabel)) throw new ArkivAfvisning(`Ukendt tabel "${String(v.tabel)}".`);
    const tabel = v.tabel;
    const forventede = kolonnenavne(tabel);
    if (!Array.isArray(v.kolonner) || v.kolonner.length !== forventede.length || v.kolonner.some((k, i) => k !== forventede[i])) {
        throw new ArkivAfvisning(`${tabel}: kolonnerne passer ikke med skemaet (arkivet er fra en anden skemaversion?).`);
    }
    const raekker = læsRækker(tabel, v.raekker, 'raekker');
    if (raekker.length === 0) throw new ArkivAfvisning('Delen har ingen rækker.');
    const ider = new Set(raekker.map((r) => r[0] as string));
    const ud: Del = { format: DEL_FORMAT, version: 2, arkiv: v.arkiv, tabel, kolonner: forventede, raekker };
    if (tabel === 'Scenarie') {
        const ændr = læsRækker('ScenarieAendring', v.aendringer ?? null, 'En Scenarie-dels aendringer');
        const si = kolonnenavne('ScenarieAendring').indexOf('scenarie_id');
        for (const a of ændr) {
            if (!ider.has(a[si] as string)) throw new ArkivAfvisning(`ScenarieAendring ${String(a[0])} hører ikke til et scenarie i delen.`);
        }
        ud.aendringer = ændr;
    } else if (v.aendringer !== undefined) {
        throw new ArkivAfvisning('Kun en Scenarie-del kan have aendringer.');
    }
    if (tabel === 'Koersel') {
        const f = v.forventet as Record<string, { antal?: Record<string, unknown>; sha256?: Record<string, unknown> }> | undefined;
        if (!f || typeof f !== 'object') throw new ArkivAfvisning('En Koersel-del skal angive kørslernes forventede rækker (antal og sha256).');
        ud.forventet = {};
        for (const id of ider) {
            const x = f[id];
            if (!x || !KOERSEL_BOERN.every((b) => Number.isInteger(x.antal?.[b]) && (x.antal![b] as number) >= 0 && typeof x.sha256?.[b] === 'string' && SHA.test(x.sha256[b] as string))) {
                throw new ArkivAfvisning(`Kørsel ${id}: de forventede rækker (antal og sha256 pr. undertabel) mangler.`);
            }
            ud.forventet[id] = {
                antal: Object.fromEntries(KOERSEL_BOERN.map((b) => [b, x.antal![b] as number])) as Børnetal,
                sha256: Object.fromEntries(KOERSEL_BOERN.map((b) => [b, x.sha256![b] as string])) as Record<KoerselBarn, string>,
            };
        }
    }
    return ud;
}

/** Delens tekst (præcis det, anmodningens sha256 regnes over). */
export function delTekst(d: { arkiv: string; tabel: DelTabel; raekker: Kanonisk[][]; aendringer?: Kanonisk[][]; forventet?: Record<string, Børnetilstand> }): string {
    const o: Record<string, unknown> = { format: DEL_FORMAT, version: 2, arkiv: d.arkiv, tabel: d.tabel, kolonner: kolonnenavne(d.tabel), raekker: d.raekker };
    if (d.tabel === 'Scenarie') o.aendringer = d.aendringer ?? [];
    if (d.forventet) o.forventet = d.forventet;
    return JSON.stringify(o);
}

/** Et stykke af en del: rækkerne (og for Scenarie deres ændringer). */
export interface Delstykke { raekker: Kanonisk[][]; aendringer?: Kanonisk[][] }

/** En rækkes bidrag til kaldets krop: dens JSON-linje, escapet igen som en del af del-teksten, plus komma. */
const rækkeBytes = (r: readonly Kanonisk[]) => utf8(JSON.stringify(rækkeTekst(r))) - 1;
/** Fast pladsreserve til delens hoved (kolonner, arkiv, format) og forventet for op til 60 kørsler. */
const HOVED_BYTES = 64_000;

/**
 * Deler rækker op i dele, så HELE kaldet (UTF-8, med den dobbelte escaping) holder sig under `maksBytes`. En Scenarie-
 * del tager hvert scenarie med alle dets ændringer (de skrives i samme transaktion, K10-F1); en Koersel-del højst
 * MAKS_KOERSLER_PR_DEL kørsler. En enhed, der alene er for stor, kan ikke sendes — det siges højt.
 */
export function delOp(rækker: readonly Kanonisk[][], tabel: DelTabel, maksBytes = MAKS_KALD_BYTES, aendringer: readonly Kanonisk[][] = []): Delstykke[] {
    const si = kolonnenavne('ScenarieAendring').indexOf('scenarie_id');
    const enheder = rækker.map((r) => {
        const ænd = tabel === 'Scenarie' ? aendringer.filter((a) => a[si] === r[0]) : [];
        return { r, ænd, bytes: rækkeBytes(r) + ænd.reduce((s, a) => s + rækkeBytes(a), 0) };
    });
    const loft = tabel === 'Koersel' ? MAKS_KOERSLER_PR_DEL : Infinity;
    const ud: Delstykke[] = [];
    let nu: typeof enheder = [];
    let bytes = 0;
    const luk = () => {
        if (nu.length) ud.push(tabel === 'Scenarie' ? { raekker: nu.map((e) => e.r), aendringer: nu.flatMap((e) => e.ænd) } : { raekker: nu.map((e) => e.r) });
        nu = [];
        bytes = 0;
    };
    for (const e of enheder) {
        if (e.bytes + HOVED_BYTES > maksBytes) throw new ArkivAfvisning(`${tabel} ${String(e.r[0])}: rækken er for stor til ét kald (${e.bytes} bytes).`);
        if (nu.length && (bytes + e.bytes + HOVED_BYTES > maksBytes || nu.length >= loft)) luk();
        nu.push(e);
        bytes += e.bytes;
    }
    luk();
    return ud;
}

// ------------------------------------------------------------------ kørslens tjek før den skrives

export interface KoerselTjek {
    /** Kørslens kanoniske række. */
    koersel: readonly Kanonisk[];
    /** Kørslens rækker i databasen nu: antal og sha256 pr. undertabel. */
    nu: Børnetilstand;
    forventet: Børnetilstand;
    /** Kørslens KoerselInput i databasen. */
    input: readonly InputRad[];
    bestilling: { scenarie_id: string } | null;
    scenarie: { vaerk_id: string } | null;
    vaerk: { id: string } | null;
    /** sha -> revisioner af værket (vaerkRevisioner). */
    revisioner: ReadonlyMap<string, readonly number[]>;
    /** Værkets gyldige tidsserier som "<rolle>:<sha256>" (K10-F6: rollen skal også passe). */
    tidsserier: ReadonlySet<string>;
}

const felt = (r: readonly Kanonisk[], navn: string): Kanonisk => r[kolonnenavne('Koersel').indexOf(navn)];

/** Afviger kørslens rækker i databasen fra arkivets? Svarer med en dansk tekst eller null. */
export function børneforskel(id: string, nu: Børnetilstand, forventet: Børnetilstand): string | null {
    for (const b of KOERSEL_BOERN) {
        if (nu.antal[b] !== forventet.antal[b]) {
            return `Kørsel ${id}: ${b} har ${nu.antal[b]} rækker i databasen, arkivet ${forventet.antal[b]} — importen er ufuldstændig; kør den igen.`;
        }
    }
    for (const b of KOERSEL_BOERN) {
        if (nu.sha256[b] !== forventet.sha256[b]) {
            return `Kørsel ${id}: ${b} i databasen har andet indhold end arkivets (rækker fra et andet arkiv eller ændret efter importen). Intet er skrevet.`;
        }
    }
    return null;
}

/** Kaster ArkivAfvisning, hvis kørslen ikke kan skrives som historisk kørsel. Samme tjek i forhåndsvisningen. */
export function tjekKoersel(x: KoerselTjek): void {
    const id = String(felt(x.koersel, 'id'));
    const status = String(felt(x.koersel, 'status'));
    if (!(AFSLUTTEDE_STATUS as readonly string[]).includes(status)) {
        throw new ArkivAfvisning(`Kørsel ${id} har status "${status}"; kun færdige, fejlede og annullerede kørsler kan genimporteres.`);
    }
    const f = børneforskel(id, x.nu, x.forventet);
    if (f) throw new ArkivAfvisning(f);
    if (inputHashRen(x.input) !== felt(x.koersel, 'input_hash')) {
        throw new ArkivAfvisning(`Kørsel ${id}: det frosne input passer ikke med input_hash — arkivet er rettet eller beskadiget.`);
    }
    if (!x.bestilling) throw new ArkivAfvisning(`Kørsel ${id}: bestillingen findes ikke.`);
    if (x.bestilling.scenarie_id !== felt(x.koersel, 'scenarie_id')) throw new ArkivAfvisning(`Kørsel ${id}: bestillingen hører til et andet scenarie.`);
    if (!x.scenarie) throw new ArkivAfvisning(`Kørsel ${id}: scenariet findes ikke.`);
    if (x.scenarie.vaerk_id !== felt(x.koersel, 'vaerk_id')) throw new ArkivAfvisning(`Kørsel ${id}: scenariet hører til et andet værk.`);
    if (!x.vaerk) throw new ArkivAfvisning(`Kørsel ${id}: værket findes ikke. Upload værksarket først.`);
    const sha = vaerkSha(x.input.filter((r) => r.kilde === 'vaerk'));
    const rev = Number(felt(x.koersel, 'vaerk_revision'));
    if (!(x.revisioner.get(sha) ?? []).includes(rev)) {
        throw new ArkivAfvisning(`Kørsel ${id} bygger på en værksrevision (parametre ${sha.slice(0, 12)}…), som værket her ikke har haft som revision ${rev}. Upload værksarket for den revision først.`);
    }
    for (const t of frosneTidsserier(x.input)) {
        if (!x.tidsserier.has(`${t.rolle}:${t.sha256}`)) {
            throw new ArkivAfvisning(`Kørsel ${id} bygger på tidsserien (${t.rolle}) med sha256 ${t.sha256.slice(0, 12)}…, som ikke findes her som ${t.rolle}. Upload den først.`);
        }
    }
}

// ------------------------------------------------------------------ forløbet i Function'en (og Python-porten)

/** Svaret fra arkivTal: rækketal fra databasen selv, til eksportens fuldstændighedstjek (K10-F4). */
export interface Arkivtal {
    ok: boolean;
    fejl?: string;
    scenarier?: Record<string, { ScenarieAendring: number; Bestilling: number; Koersel: number }>;
    koersler?: Record<string, Børnetal>;
    vaerker?: Record<string, { Aendringslog: number; Tidsserie: number }>;
}

/** Svaret fra importerArkiv. */
export interface Importsvar { ok: boolean; status: string; svar: string; oprettet?: number; fandtes?: number }

export interface Anmodningsrad { id: string; vaerk_id: string; aendringer_json: string; anmodet_af: string; status: string; svar: string | null }

/** Databasen set fra forløbet. Function'en giver SQL (mssql), Python-porten SQLAlchemy, testene en kopi i hukommelsen. */
export interface ArkivLager {
    læsAnmodning(id: string): Promise<Anmodningsrad | null>;
    afvisAnmodning(id: string, tekst: string): Promise<void>;
    iTransaktion<T>(fn: (tx: ArkivTx) => Promise<T>): Promise<T>;
}

/** Sidestørrelse, når en kørsels rækker hashes på serveren. */
export const BØRNESIDE = 2000;

export interface ArkivTx {
    /** Anmodningens status, låst for resten af transaktionen. */
    låsAnmodning(id: string): Promise<{ status: string; svar: string | null }>;
    /**
     * Eksklusiv lås pr. kørsels-id for resten af transaktionen (mssql: sp_getapplock), taget i den givne
     * (sorterede) rækkefølge, FØR noget om kørslen læses. Både børneskrivning og afslutning tager den (K10-F3).
     */
    låsKørsler(ider: readonly string[]): Promise<void>;
    /** Rækkerne med disse id'er (rå databaseværdier). */
    hent(tabel: ImportTabel | 'Vaerk' | 'Tidsserie', ider: readonly string[]): Promise<Record<string, unknown>[]>;
    indsæt(tabel: ImportTabel, rækker: readonly (readonly Kanonisk[])[]): Promise<void>;
    /** En side af kørslens rækker i en undertabel, i fast orden (rå databaseværdier). */
    børneside(koerselId: string, tabel: KoerselBarn, fra: number, antal: number): Promise<Record<string, unknown>[]>;
    input(koerselId: string): Promise<InputRad[]>;
    vaerkHistorik(vaerkId: string): Promise<{ revision: number; blade: { sti: string; vaerdi_json: string }[]; log: LogRad[] }>;
    /** Værkets gyldige tidsserier. */
    tidsserier(vaerkId: string): Promise<{ rolle: string; sha256: string }[]>;
    udfoer(anmodningId: string, svar: string): Promise<void>;
}

const NAVN: Record<DelTabel, string> = {
    Scenarie: 'scenarier', Bestilling: 'bestillinger', Koersel: 'kørsler',
    KoerselInput: 'inputrækker', KoerselNoegletal: 'nøgletal', KoerselMaaned: 'månedsrækker', KoerselTime: 'timerækker',
};

/** Kørslens rækker i databasen: antal og sha256 pr. undertabel, side for side. */
export async function børnetilstand(tx: ArkivTx, koerselId: string): Promise<Børnetilstand> {
    const antal = {} as Børnetal;
    const sha256 = {} as Record<KoerselBarn, string>;
    for (const b of KOERSEL_BOERN) {
        const h = new TabelHash();
        for (let fra = 0; ; fra += BØRNESIDE) {
            const side = await tx.børneside(koerselId, b, fra, BØRNESIDE);
            for (const r of side) h.tilføj(kanoniskRække(b, r));
            if (side.length < BØRNESIDE) break;
        }
        antal[b] = h.antal;
        sha256[b] = h.sha256();
    }
    return { antal, sha256 };
}

/** Arkivets egne rækker for en kørsel: antal og sha256 pr. undertabel (det, `forventet` sendes med). */
export function børnetilstandAf(rækker: Record<KoerselBarn, readonly (readonly Kanonisk[])[]>): Børnetilstand {
    return {
        antal: Object.fromEntries(KOERSEL_BOERN.map((b) => [b, rækker[b].length])) as Børnetal,
        sha256: Object.fromEntries(KOERSEL_BOERN.map((b) => [b, tabelSha(rækker[b])])) as Record<KoerselBarn, string>,
    };
}

/**
 * importerArkiv(anmodningId, del): skriver én del i ÉN transaktion. Idempotent: en anmodning, der allerede er
 * behandlet, svarer med sit gemte svar; rækker, der findes med samme indhold, springes over; en række med samme
 * id og andet indhold afviser HELE delen (intet overskrives). Et scenarie skrives med alle sine ændringer.
 * Undertabellernes rækker kan kun tilføjes, så længe kørslen selv ikke findes; kørslen skrives først, når dens
 * rækker har arkivets antal og indhold og passer med input_hash — alt under en lås pr. kørsel.
 */
export async function importerDel(lager: ArkivLager, anmodningId: string, tekst: string): Promise<Importsvar> {
    if (!UUID.test(anmodningId)) return { ok: false, status: 'afvist', svar: 'Ugyldigt anmodnings-id.' };
    const a = await lager.læsAnmodning(anmodningId);
    if (!a) return { ok: false, status: 'afvist', svar: 'Anmodningen findes ikke.' };
    if (a.status !== 'ny') return { ok: a.status === 'udfoert', status: a.status, svar: a.svar ?? '' };
    try {
        const imp = læsImportAnmodning(a.aendringer_json);
        if (a.vaerk_id.toLowerCase() !== NIL_UUID) throw new ArkivAfvisning('En arkivimport skal have nil-uuid\'et som vaerk_id.');
        if (typeof tekst !== 'string' || sha256Tekst(tekst) !== imp.sha256) throw new ArkivAfvisning('Delens indhold passer ikke med anmodningens sha256 — send delen igen.');
        const del = læsDel(tekst);
        if (del.tabel !== imp.tabel || del.arkiv !== imp.arkiv) throw new ArkivAfvisning('Delen passer ikke med anmodningen (tabel eller arkiv).');
        if (del.tabel === 'Koersel') {
            const i = new Set(del.raekker.map((r) => r[0] as string));
            if (i.size !== imp.koersel_ider.length || imp.koersel_ider.some((x) => !i.has(x))) throw new ArkivAfvisning('Delens kørsler passer ikke med anmodningens koersel_ider.');
        }
        return await lager.iTransaktion(async (tx) => {
            const igen = await tx.låsAnmodning(anmodningId);
            if (igen.status !== 'ny') return { ok: igen.status === 'udfoert', status: igen.status, svar: igen.svar ?? '' };
            const svar = await skrivDel(tx, del);
            const tekstSvar = `${svar.oprettet} ${NAVN[del.tabel]} oprettet, ${svar.fandtes} fandtes allerede (del ${imp.nr} af ${imp.af}).`;
            await tx.udfoer(anmodningId, tekstSvar);
            return { ok: true, status: 'udfoert', svar: tekstSvar, oprettet: svar.oprettet, fandtes: svar.fandtes };
        });
    } catch (e) {
        if (!(e instanceof ArkivAfvisning)) throw e;
        await lager.afvisAnmodning(anmodningId, e.message);
        return { ok: false, status: 'afvist', svar: e.message };
    }
}

const kol = (tabel: ImportTabel, r: readonly Kanonisk[], navn: string): Kanonisk => r[kolonnenavne(tabel).indexOf(navn)];

/** Rækkernes udfald mod databasen: de nye — og en afvisning, hvis en findes med andet indhold. */
async function nyeRækker(tx: ArkivTx, tabel: ImportTabel, rækker: readonly Kanonisk[][]): Promise<Kanonisk[][]> {
    if (!rækker.length) return [];
    const eksisterende = new Map((await tx.hent(tabel, rækker.map((r) => r[0] as string))).map((r) => [String(r.id).toLowerCase(), r] as const));
    const nye: Kanonisk[][] = [];
    const konflikter: string[] = [];
    for (const r of rækker) {
        const s = sammenlign(tabel, r, eksisterende.get(r[0] as string));
        if (s.udfald === 'konflikt') konflikter.push(`${String(r[0])} (${s.kolonner.join(', ')})`);
        else if (s.udfald === 'ny') nye.push(r);
    }
    if (konflikter.length) {
        const navn = tabel === 'ScenarieAendring' ? 'scenarieændringer' : NAVN[tabel as DelTabel];
        throw new ArkivAfvisning(`Konflikt: ${konflikter.length} ${navn} findes allerede med andet indhold, fx ${konflikter.slice(0, 3).join('; ')}. Intet er overskrevet.`);
    }
    return nye;
}

async function skrivDel(tx: ArkivTx, del: Del): Promise<{ oprettet: number; fandtes: number }> {
    const { tabel } = del;
    // K10-F3: låsen pr. kørsel tages FØR noget læses — af børnedele og afslutningen ens, i fast (sorteret) orden.
    if (tabel === 'Koersel') await tx.låsKørsler([...new Set(del.raekker.map((r) => r[0] as string))].sort());
    else if ((KOERSEL_BOERN as readonly string[]).includes(tabel)) {
        await tx.låsKørsler([...new Set(del.raekker.map((r) => kol(tabel, r, 'koersel_id') as string))].sort());
    }
    const nye = await nyeRækker(tx, tabel, del.raekker);
    const fandtes = del.raekker.length - nye.length;
    if (tabel === 'Scenarie') {
        // Et nyt scenarie skrives med ALLE sine ændringer i samme transaktion (K10-F1); et eksisterende (levende)
        // scenaries ændringer røres ikke.
        const nyeIder = new Set(nye.map((r) => r[0] as string));
        const ænd = await nyeRækker(tx, 'ScenarieAendring', (del.aendringer ?? []).filter((a) => nyeIder.has(kol('ScenarieAendring', a, 'scenarie_id') as string)));
        if (nye.length) {
            await tjekNye(tx, del, nye);
            await tjekTidsserievalg(tx, nye, ænd);
            await tx.indsæt('Scenarie', nye);
        }
        if (ænd.length) await tx.indsæt('ScenarieAendring', ænd);
        return { oprettet: nye.length + ænd.length, fandtes };
    }
    if (tabel === 'Koersel') {
        // En kørsel, der findes med samme række, er kun "findes", hvis dens rækker også passer (K10-F2).
        const nyeIder = new Set(nye.map((r) => r[0] as string));
        for (const r of del.raekker) {
            if (nyeIder.has(r[0] as string)) continue;
            const f = børneforskel(String(r[0]), await børnetilstand(tx, String(r[0])), del.forventet![r[0] as string]);
            if (f) throw new ArkivAfvisning(`Konflikt: ${f}`);
        }
    }
    if (nye.length) {
        await tjekNye(tx, del, nye);
        await tx.indsæt(tabel, nye);
    }
    return { oprettet: nye.length, fandtes };
}

/**
 * Et scenaries valg af tidsserie (`_tidsserie.<rolle>` = id) skal pege på en gyldig serie i NETOP den rolle på
 * scenariets værk (K10-F6) — ellers afvises scenariet her i stedet for ved næste bestilling. "syntetisk" er intet id.
 */
async function tjekTidsserievalg(tx: ArkivTx, scenarier: readonly Kanonisk[][], ændringer: readonly Kanonisk[][]): Promise<void> {
    const værk = new Map(scenarier.map((r) => [r[0] as string, kol('Scenarie', r, 'vaerk_id') as string]));
    for (const a of ændringer) {
        const sti = String(kol('ScenarieAendring', a, 'sti'));
        const vj = kol('ScenarieAendring', a, 'vaerdi_json');
        if (!sti.startsWith('_tidsserie.') || typeof vj !== 'string') continue;
        let valgt: unknown;
        try { valgt = JSON.parse(vj); } catch { continue; }
        if (typeof valgt !== 'string' || !UUID.test(valgt)) continue;
        const rolle = sti.slice('_tidsserie.'.length);
        const serie = (await tx.hent('Tidsserie', [valgt]))[0];
        const sid = String(kol('ScenarieAendring', a, 'scenarie_id'));
        if (!serie || String(serie.vaerk_id).toLowerCase() !== værk.get(sid) || serie.rolle !== rolle || serie.status !== 'gyldig') {
            throw new ArkivAfvisning(`Scenarie ${sid}: den valgte tidsserie (${rolle}) findes ikke her som gyldig ${rolle} på værket. Upload den først.`);
        }
    }
}

async function findes(tx: ArkivTx, tabel: ImportTabel | 'Vaerk', ider: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
    const u = [...new Set(ider)];
    return new Map((u.length ? await tx.hent(tabel, u) : []).map((r) => [String(r.id).toLowerCase(), r] as const));
}

async function tjekNye(tx: ArkivTx, del: Del, nye: readonly Kanonisk[][]): Promise<void> {
    const { tabel } = del;
    const ref = (navn: string) => nye.map((r) => kol(tabel, r, navn)).filter((x): x is string => typeof x === 'string');
    if (tabel === 'Scenarie') {
        const v = await findes(tx, 'Vaerk', ref('vaerk_id'));
        const s = await findes(tx, 'Scenarie', ref('reference_scenarie_id'));
        // Rækkefølgen inden for delen er ligegyldig: alt skrives i samme transaktion (og der er ingen FOREIGN KEY).
        const iDelen = new Set(del.raekker.map((r) => r[0] as string));
        for (const r of nye) {
            if (!v.has(kol(tabel, r, 'vaerk_id') as string)) throw new ArkivAfvisning(`Scenarie ${String(r[0])}: værket findes ikke her. Upload værksarket først.`);
            const reference = kol(tabel, r, 'reference_scenarie_id');
            if (reference !== null && !s.has(reference as string) && !iDelen.has(reference as string)) {
                throw new ArkivAfvisning(`Scenarie ${String(r[0])}: referencescenariet ${String(reference)} findes ikke (importér det først).`);
            }
        }
        return;
    }
    if (tabel === 'Bestilling') {
        const s = await findes(tx, 'Scenarie', ref('scenarie_id'));
        for (const r of nye) if (!s.has(kol(tabel, r, 'scenarie_id') as string)) throw new ArkivAfvisning(`${tabel} ${String(r[0])}: scenariet findes ikke.`);
        return;
    }
    if (tabel !== 'Koersel') {
        const k = await findes(tx, 'Koersel', ref('koersel_id'));
        if (k.size) throw new ArkivAfvisning(`Kørsel ${[...k.keys()][0]} findes allerede; der kan ikke tilføjes rækker til en kørsel.`);
        return;
    }
    const bestillinger = await findes(tx, 'Bestilling', ref('bestilling_id'));
    const scenarier = await findes(tx, 'Scenarie', ref('scenarie_id'));
    const vaerker = await findes(tx, 'Vaerk', ref('vaerk_id'));
    const historik = new Map<string, Map<string, number[]>>();
    const serier = new Map<string, Set<string>>();
    for (const r of nye) {
        const id = r[0] as string;
        const vaerkId = kol('Koersel', r, 'vaerk_id') as string;
        const vaerk = vaerker.get(vaerkId);
        if (vaerk && !historik.has(vaerkId)) {
            const h = await tx.vaerkHistorik(vaerkId);
            historik.set(vaerkId, vaerkRevisioner(h.revision, h.blade, h.log));
            serier.set(vaerkId, new Set((await tx.tidsserier(vaerkId)).map((t) => `${t.rolle}:${t.sha256}`)));
        }
        const b = bestillinger.get(kol('Koersel', r, 'bestilling_id') as string);
        const s = scenarier.get(kol('Koersel', r, 'scenarie_id') as string);
        tjekKoersel({
            koersel: r,
            nu: await børnetilstand(tx, id),
            forventet: del.forventet![id],
            input: await tx.input(id),
            bestilling: b ? { scenarie_id: String(b.scenarie_id).toLowerCase() } : null,
            scenarie: s ? { vaerk_id: String(s.vaerk_id).toLowerCase() } : null,
            vaerk: vaerk ? { id: vaerkId } : null,
            revisioner: historik.get(vaerkId) ?? new Map(),
            tidsserier: serier.get(vaerkId) ?? new Set(),
        });
    }
}
