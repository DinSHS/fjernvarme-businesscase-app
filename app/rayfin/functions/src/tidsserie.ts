//-----------------------------------------------------------------------
// Backendens del af værkets tidsserier (KONTRAKT §6d), RUNDT OM den fælles
// tolker `tidsserie-validering.ts` (fv-tidsserie's tro port af fv-data's orakel
// viden/vaerktoej/valider_tidsserie.py). Her står kun det, tolkeren ikke gør:
//   - afkortning af validering_json til 4000 tegn efter data_krav.json's regel,
//   - værkets units/storage som træ (de værksafhængige regler),
//   - den tætte række til hentTidsserie og sha256 (node:crypto — derfor ikke i tolkeren,
//     som også køres i browseren).
// Den normaliserede fil er tolkerens: `time,mw`, timens start i UTC, 1h, huller udeladt.
//-----------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { DATAKRAV } from './datakrav.data.js';
import { FARLIGE_SEGMENTER } from './sti.js';
import { valider, type Fund, type Valideringsresultat } from './tidsserie-validering.js';

export type { Fund, Valideringsresultat };
export type Rolle = 'varmelast' | 'solprofil';

/** sha256 (hex) af en tekst som UTF-8 — samme som klientens `sha256Hex` (crypto.subtle). */
export function sha256Hex(tekst: string): string {
    return createHash('sha256').update(tekst, 'utf8').digest('hex');
}
/** sha256 (hex) af bytes — Tidsserie.sha256 er over den normaliserede fils bytes. */
export function sha256Bytes(b: Uint8Array): string {
    return createHash('sha256').update(b).digest('hex');
}

/**
 * Største uploadede fil (bytes) gennem en Function: et kald tager højst 4 MB i alt (Fabric user data functions),
 * og filen sendes som base64 (×4/3). data_krav.json's `max_bytes` (8 MB) kan derfor ikke nås ad denne vej.
 */
export const MAKS_UPLOAD_BYTES = 2_900_000;
/** Største værksark (efter base64-afkodning). SKAL være lig MAKS_VAERKSARK_BYTES i rayfin/data/fjv.constants.ts (K5-F13). */
export const MAKS_VAERKSARK_BYTES = 2_500_000;

/**
 * Værkets parametre (sti -> JSON) som det træ, tolkerens værksafhængige regler læser (kun units og storage).
 * K5-F1: objekterne har INGEN prototype, og en sti med et prototype-segment springes over — et træ bygget af
 * brugerskrevne stier må aldrig kunne skrive på Object.prototype.
 */
export function vaerkTrae(params: readonly { sti: string; vaerdi_json: string }[]): { units: Record<string, unknown>; storage: Record<string, unknown> } {
    const tomt = (): Record<string, unknown> => Object.create(null) as Record<string, unknown>;
    const træ: { units: Record<string, unknown>; storage: Record<string, unknown> } = { units: tomt(), storage: tomt() };
    for (const p of params) {
        const d = p.sti.split('.');
        if (d[0] !== 'units' && d[0] !== 'storage') continue;
        if (d.some((x) => FARLIGE_SEGMENTER.has(x))) continue;
        let v: unknown;
        try { v = JSON.parse(p.vaerdi_json); } catch { continue; }
        let node = træ[d[0]] as Record<string, unknown>;
        for (let i = 1; i < d.length - 1; i++) {
            const n = node[d[i]];
            node = (n && typeof n === 'object' && !Array.isArray(n) && Object.hasOwn(node, d[i]) ? n : (node[d[i]] = tomt())) as Record<string, unknown>;
        }
        if (d.length > 1) node[d[d.length - 1]] = v;
    }
    return træ;
}

/** Validerer en upload (rå bytes) med den fælles tolker. */
export function validerUpload(
    bytes: Uint8Array, rolle: Rolle,
    valg: { tidszone: string; tidsstempel: string; enhed: string; kolonne?: string | null },
    vaerk: ReturnType<typeof vaerkTrae> | null,
): Valideringsresultat {
    if (bytes.byteLength > MAKS_UPLOAD_BYTES) {
        const besked = `Filen er for stor (${bytes.byteLength} bytes; grænsen gennem appen er ${MAKS_UPLOAD_BYTES} bytes). Send timeværdier i stedet for kvarterværdier, eller del filen op.`;
        return {
            status: 'afvist', normaliseret: null, punkter: [],
            validering: { version: DATAKRAV.version, rolle, fund: [{ niveau: 'fejl', kode: 'for_stor', besked }], fejl: [besked], advarsler: [] },
        };
    }
    return valider(bytes, rolle, { ...valg, vaerk });
}

const MAKS_JSON = 4000;

/**
 * validering_json (≤ 4000 tegn) efter data_krav.json › validering_json: afkort først hullisten (huller_fuld=false),
 * så info-fund, så beskeder til 160 tegn. Passer det stadig ikke, er det en fejl (højlydt, ikke tavs afkortning).
 */
export function valideringJson(v: Record<string, unknown> & { fund: Fund[] }): string {
    let x: Record<string, unknown> & { fund: Fund[] } = { ...v };
    const s = () => JSON.stringify(x);
    if (s().length <= MAKS_JSON) return s();
    if (Array.isArray(x.huller)) {
        const h = [...(x.huller as unknown[])];
        while (h.length && s().length > MAKS_JSON) { h.pop(); x = { ...x, huller: [...h], huller_fuld: false }; }
        if (s().length <= MAKS_JSON) return s();
    }
    x = { ...x, fund: x.fund.filter((f) => f.niveau !== 'info') };
    if (s().length <= MAKS_JSON) return s();
    const kort = (t: string) => (t.length > 160 ? t.slice(0, 159) + '…' : t);
    x = {
        ...x, fund: x.fund.map((f) => ({ ...f, besked: kort(f.besked) })),
        ...(Array.isArray(x.fejl) ? { fejl: (x.fejl as string[]).map(kort) } : {}),
        ...(Array.isArray(x.advarsler) ? { advarsler: (x.advarsler as string[]).map(kort) } : {}),
    };
    if (s().length <= MAKS_JSON) return s();
    throw new Error(`validering_json er ${s().length} tegn efter afkortning (højst ${MAKS_JSON}).`);
}

/**
 * Højst så mange positioner i en tæt række (= data_krav's max_raekker, ca. 13,7 år i timer). K5-F2: en gyldig fil
 * med få rækker kan spænde over årtusinder (24 timer i 2026 + 24 timer i år 9999 = 70 mio. positioner), så
 * størrelsen skal tjekkes FØR allokering — en filgrænse beskytter ikke mod det.
 */
export const MAKS_POSITIONER = 120_000;

export class ForLangRække extends Error {
    constructor(public readonly positioner: number) {
        super(`Serien spænder over ${positioner} timer — for mange til én visning (højst ${MAKS_POSITIONER}). Hent et vindue (fra/til).`);
    }
}

/**
 * Den normaliserede fil (time,mw, 1h, huller udeladt) som tæt række, null i huller — til hentTidsserie.
 * `vindue` (UTC ms, begge med) begrænser til et udsnit. Kaster ForLangRække, før noget stort allokeres.
 */
export function tætRække(normaliseret: string, vindue?: { fra?: number; til?: number }): { start: string; oploesning: '1h'; enhed: 'MW'; vaerdier: (number | null)[] } {
    const ms = 3_600_000;
    const linjer = normaliseret.trim().split('\n');
    if (linjer[0] !== 'time,mw') throw new Error(`Uventet overskrift i den normaliserede fil: "${linjer[0]}"`);
    const fra = vindue?.fra ?? -Infinity, til = vindue?.til ?? Infinity;
    const rækker = linjer.slice(1).map((l) => { const [t, v] = l.split(','); return [Date.parse(t), Number(v)] as const; })
        .filter(([t]) => t >= fra && t <= til);
    if (rækker.length === 0) return { start: '', oploesning: '1h', enhed: 'MW', vaerdier: [] };
    const t0 = rækker[0][0];
    const n = Math.round((rækker[rækker.length - 1][0] - t0) / ms) + 1;
    if (!(n <= MAKS_POSITIONER)) throw new ForLangRække(n);
    const vaerdier: (number | null)[] = new Array(n).fill(null);
    for (const [t, v] of rækker) vaerdier[Math.round((t - t0) / ms)] = v;
    return { start: new Date(t0).toISOString().replace('.000Z', 'Z'), oploesning: '1h', enhed: 'MW', vaerdier };
}
