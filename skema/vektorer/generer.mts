//-----------------------------------------------------------------------
// Fælles testvektorer (brief 21 pkt. 4) — genereret ved at KØRE TypeScript-implementeringen.
//
// Hver vektor er (input, TS' faktiske output): et resultat, en `Afvisning` med dens præcise tekst, eller en
// programfejl. Python-porten (community/fjernvarme_app/logik) skal give det samme; tests/test_vektorer.py
// kører dem. Kildefilernes sha256 står i hver fil, så en ændring i TS uden ny generering opdages.
//
//   cd app && npx tsx ../skema/vektorer/generer.mts
//
// Skrevet af fv-port (oprindeligt i community/fjernvarme_app/logik/tests/vektorer/); flyttet hertil af fv-skema, så
// de fælles vektorer har ét hjem (brief 21 pkt. 4). fv-port retter gerne direkte i denne fil.
//
// Særlige værdier i JSON: {"$tal": "Infinity"|"-Infinity"|"NaN"|"-0"}, {"$bits": "<16 hex>"} (en double
// præcist), {"$b64": "…"} (bytes), {"$fil": "<sti fra produktroden>"} (bytes fra en fil), {"$fyld": n}
// (n bytes "a" — til størrelsesgrænser uden at lægge megabytes i vektoren).
//-----------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../../app/rayfin/functions/src/logik.ts';
import * as TS from '../../app/rayfin/functions/src/tidsserie.ts';
import * as Z from '../../app/rayfin/functions/src/zip.ts';
import * as V from '../../app/rayfin/functions/src/vaerksark.ts';
import * as F from '../../app/rayfin/functions/src/frysning.ts';

const HER = dirname(fileURLToPath(import.meta.url));
const ROD = resolve(HER, '../..');
// Hvor filerne skrives: her (standard) eller FJV_VEKTOR_UD (testen i skema/test/vektorer.test.mjs genererer til en tom mappe og sammenligner).
const UD = process.env.FJV_VEKTOR_UD ? resolve(process.env.FJV_VEKTOR_UD) : HER;
const KILDER = ['logik.ts', 'frysning.ts', 'sti.ts', 'tidsserie.ts', 'tidsserie-validering.ts', 'datakrav.data.ts', 'zip.ts', 'vaerksark.ts']
    .map((f) => `app/rayfin/functions/src/${f}`);
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const kildeHash = Object.fromEntries(KILDER.map((f) => [f, sha(readFileSync(resolve(ROD, f)))]));

// ------------------------------------------------------------------ kodning

function kod(v: unknown): unknown {
    if (typeof v === 'number') {
        if (Object.is(v, -0)) return { $tal: '-0' };
        if (!Number.isFinite(v)) return { $tal: String(v) };
        return v;
    }
    if (v instanceof Uint8Array) return { $b64: Buffer.from(v).toString('base64') };
    if (Array.isArray(v)) return v.map(kod);
    if (v && typeof v === 'object') {
        if (v instanceof Map) return { $map: [...v.entries()].map(([k, x]) => [k, kod(x)]) };
        return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, kod(x)]));
    }
    return v;
}
const bits = (x: number) => { const b = Buffer.alloc(8); b.writeDoubleBE(x); return { $bits: b.toString('hex') }; };
const fil = (sti: string) => new Uint8Array(readFileSync(resolve(ROD, sti)));

type Udfald = { ud: unknown } | { afvisning: string } | { fejl: string; fejltype: string };
function kør(f: () => unknown): Udfald {
    try {
        return { ud: f() };
    } catch (e) {
        if (e instanceof L.Afvisning) return { afvisning: e.message };
        if (e instanceof TS.ForLangRække) return { fejl: e.message, fejltype: 'ForLangRække', positioner: e.positioner } as Udfald;
        const x = e as Error;
        return { fejl: x.message, fejltype: x.name };
    }
}

const filer: Record<string, unknown[]> = {};
function tilføj(gruppe: string, navn: string, input: Record<string, unknown>, udfald: Udfald) {
    (filer[gruppe] ??= []).push({ navn, input: kod(input), ...(kod(udfald) as object) });
}

// PRNG (mulberry32), så genereringen er reproducerbar.
function prng(seed: number) {
    return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const tilfældig = prng(20261016);

// ------------------------------------------------------------------ tal: String(x) og somFloat

{
    const tal: number[] = [0, -0, 1, -1, 3600, 0.0002, -5, 1e-7, 1e-6, 1e-5, 1.5e-7, 1e20, 1e21, 1e22, 123456789012345680000,
        0.1 + 0.2, 5e-324, 2.2250738585072014e-308, 1.7976931348623157e308, 2 ** 53, 2 ** 53 + 2, 100, 0.5, 2.5, -2.5,
        123e-20, 1.0000000000000002, 4.35, 0.000001234, 999999999999999900000, 1e300, 12.0, 45, 47.5, 0.035, 9.95];
    for (let e = -30; e <= 30; e++) tal.push(10 ** e, 1.2345 * 10 ** e, -7 * 10 ** e);
    const b = Buffer.alloc(8);
    while (tal.length < 2000) {
        const r = tilfældig();
        if (r < 0.5) { // tilfældigt bitmønster (springes over: NaN)
            b.writeUInt32BE(Math.floor(tilfældig() * 2 ** 32), 0); b.writeUInt32BE(Math.floor(tilfældig() * 2 ** 32), 4);
            const x = b.readDoubleBE(0); if (!Number.isNaN(x)) tal.push(x);
        } else if (r < 0.8) tal.push(Number((tilfældig() * 10 ** Math.floor(tilfældig() * 12)).toFixed(Math.floor(tilfældig() * 8))));
        else tal.push((tilfældig() - 0.5) * 10 ** Math.floor(tilfældig() * 60 - 30));
    }
    tal.push(Infinity, -Infinity, NaN);
    for (const x of tal) tilføj('tal', '', { x: bits(x) }, { ud: { streng: String(x), somFloat: kør(() => L.somFloat(x)) } });
}

// ------------------------------------------------------------------ Date.parse og toISOString

{
    const tekster = ['2026-01-05', '2026-01-05T00:00:00Z', '2026-01-05T00:00:00', '2026-01-05 00:00:00', '2026-01-05t00:00:00z',
        '2026-01-05T00:00Z', '2026-01-05T00:00:00.5Z', '2026-01-05T00:00:00.123456Z', '2026-01-05T00:00:00+01:00', '2026-01-05T00:00:00+0100',
        '2026-01-05T00:00:00-00:00', '2026-01-05T23:59:59.999Z', '2026-1-5', '2026-01', '2026', '2026-02-29', '2024-02-29', '2026-02-30',
        '2026-02-31', '2026-02-32', '2026-13-01', '2026-00-10', '2026-01-00', '2026-04-31', '2026-02-30T00:00:00Z', ' 2026-01-05',
        '2026-01-05 ', '2026-01-05T24:00:00Z', '2026-01-05T24:00:01Z', '2026-01-05T25:00:00Z', '2026-01-05T23:60:00Z',
        '2026-01-05T23:00:60Z', '+002026-01-05T00:00:00Z', '-000001-01-01T00:00:00Z', '+275760-09-13T00:00:00Z',
        '+275760-09-13T00:00:00.001Z', '1970-01-01T00:00:00Z', '1900-01-01', '0000-01-01T00:00:00Z', '9999-12-31T23:59:59Z',
        '2026-01-05T00:00:00.000Z', '2026-01-05T00:00:00Zx', '2026-01-05T00', '2026-01-05T0:00:00Z', '2026-01-05T00:00:00+24:00',
        '2026-01-05T00:00:00+23:59', '2026-01-05Z', '20260105', '2026/01/05', '', 'x', '2026-03-29T01:00:00Z', '2026-10-25T00:59:59Z',
        '2026-01-05T00:00:00.000+00:00', '2026-01-05T12:00:00-05:30'];
    for (const s of tekster) {
        const t = Date.parse(s);
        tilføj('dato', s, { tekst: s }, { ud: Number.isNaN(t) ? null : t });
    }
    // Kendt afvigelse (V8's ældre parser) — står her, så den er synlig og målt.
    for (const s of ['January 5, 2026', '5 Jan 2026 00:00 GMT', 'Mon, 05 Jan 2026 00:00:00 GMT']) {
        const t = Date.parse(s);
        tilføj('dato_v8_legacy', s, { tekst: s }, { ud: Number.isNaN(t) ? null : t });
    }
    const ms = [0, 1, -1, 1767571200000, 253402300799999, 253402300800000, -62135596800000, -62135596800001, 8.64e15, -8.64e15, 951782400000];
    for (let i = 0; i < 300; i++) ms.push(Math.floor((tilfældig() - 0.5) * 2 * 8.64e15));
    for (const t of ms) tilføj('iso', String(t), { ms: t }, kør(() => new Date(t).toISOString()));
}

// ------------------------------------------------------------------ inputHash

{
    const MÅLT: L.InputRad[] = [
        { kilde: 'aendring', sti: 'prices.straw.value', vaerdi_json: '50.0' },
        { kilde: 'aendring', sti: 'units.elkedel.enabled', vaerdi_json: 'true' },
        { kilde: 'scenarie', sti: '_koersel.med_balancering', vaerdi_json: 'false' },
        { kilde: 'scenarie', sti: '_koersel.slut', vaerdi_json: '"2026-01-07"' },
        { kilde: 'scenarie', sti: '_koersel.start', vaerdi_json: '"2026-01-05"' },
        { kilde: 'scenarie', sti: 'solver.mip_rel_gap', vaerdi_json: '0.0002' },
        { kilde: 'scenarie', sti: 'solver.time_limit', vaerdi_json: '300.0' },
        { kilde: 'vaerk', sti: 'heat_load_params.baseline_profile_mw', vaerdi_json: '[4.4,4.5]' },
        { kilde: 'vaerk', sti: 'meta.case_name', vaerdi_json: '"probe"' },
        { kilde: 'vaerk', sti: 'prices.straw.value', vaerdi_json: '45.0' },
        { kilde: 'vaerk', sti: 'solver.time_limit', vaerdi_json: '600.0' },
        { kilde: 'vaerk', sti: 'time.end', vaerdi_json: '"2026-01-11T23:00:00Z"' },
        { kilde: 'vaerk', sti: 'time.resolution', vaerdi_json: '"1h"' },
        { kilde: 'vaerk', sti: 'time.start', vaerdi_json: '"2026-01-05T00:00:00Z"' },
        { kilde: 'vaerk', sti: 'units.elkedel.enabled', vaerdi_json: 'false' },
        { kilde: 'vaerk', sti: 'units.halmkedel.enabled', vaerdi_json: 'true' },
        { kilde: 'vaerk', sti: 'units.halmkedel.p_max_heat', vaerdi_json: '12.0' },
    ];
    const v = (sti: string, vaerdi_json: string, kilde: L.InputRad['kilde'] = 'vaerk'): L.InputRad => ({ kilde, sti, vaerdi_json });
    const sæt: [string, L.InputRad[]][] = [
        ['målt (169838dd…)', MÅLT],
        ['målt omvendt', [...MÅLT].reverse()],
        ['tom', []],
        ['12', [v('x', '12')]],
        ['12.0', [v('x', '12.0')]],
        ['æøå og citat', [v('meta.case_name', '"Ærø \\"værk\\""'), v('meta.note', '"å"')]],
        ['kontroltegn i en værdi', [v('a', '"linje1\\nlinje2"'), v('b', 'x\ny\tz\u0001\u001f\u007f ')]],
        // JS sorterer på UTF-16-kodeenheder: U+1F600 (D83D DE00) < U+E000; Python sorterer på kodepunkter (omvendt).
        ['astralt tegn mod U+E000', [v('a', '1'), v('a\u{1F600}', '2'), v('a￿', '3')]],
        ['astralt i værdien', [v('a', '"\u{1F600}"'), v('a', '""')]],
        ['samme sti, forskellig kilde', [v('s', '1', 'scenarie'), v('s', '1', 'aendring'), v('s', '1', 'vaerk')]],
        ['samme kilde og sti, forskellig værdi', [v('s', '2'), v('s', '10'), v('s', '1')]],
    ];
    for (let i = 0; i < 40; i++) {
        const rækker: L.InputRad[] = [];
        const n = 1 + Math.floor(tilfældig() * 30);
        const alfabet = ['a', 'b', '.', '_', 'Æ', 'ø', 'å', '1', '"', '\\', ' ', '\u{1F600}', '', '-'];
        const ord = () => Array.from({ length: 1 + Math.floor(tilfældig() * 6) }, () => alfabet[Math.floor(tilfældig() * alfabet.length)]).join('');
        for (let j = 0; j < n; j++) rækker.push(v(ord(), ord(), (['vaerk', 'aendring', 'scenarie'] as const)[Math.floor(tilfældig() * 3)]));
        sæt.push([`tilfældig ${i}`, rækker]);
    }
    for (const [navn, rækker] of sæt) tilføj('input_hash', navn, { raekker: rækker }, kør(() => L.inputHash(rækker)));
    for (const s of [{ id: 'AAAAAAAA-1111-4111-8111-111111111111', sha256: 'b'.repeat(64) }, { id: 'aaaaaaaa-1111-4111-8111-111111111111', sha256: 'B'.repeat(64) }])
        tilføj('frossen_tidsserie', s.id, { s }, kør(() => ({ sti: F.FROSNE_ROLLER.map((r) => F.frossenSti(r)), vaerdi: F.frossenTidsserie(s) })));
}

// ------------------------------------------------------------------ periodeDoegn og effektivAkse

{
    const S: L.ScenarieRad = { med_balancering: false };
    const m = (o: Record<string, unknown>) => new Map(Object.entries(o));
    const sæt: [string, L.ScenarieRad, Record<string, unknown>][] = [
        ['scenariedatoer inklusive', { ...S, periode_start: '2026-01-05', periode_slut: '2026-01-16' }, {}],
        ['samme dag', { ...S, periode_start: '2026-01-05', periode_slut: '2026-01-05' }, {}],
        ['skudår 366', { ...S, periode_start: '2024-01-01', periode_slut: '2024-12-31' }, {}],
        ['over sommertid', { ...S, periode_start: '2026-03-28', periode_slut: '2026-03-30' }, {}],
        ['29. feb ikke-skudår', { ...S, periode_start: '2025-02-29', periode_slut: '2025-03-01' }, {}],
        ['2026-02-30', { ...S, periode_start: '2026-02-30', periode_slut: '2026-03-01' }, {}],
        ['kun start', { ...S, periode_start: '2026-01-05' }, {}],
        ['kun slut', { ...S, periode_slut: '2026-01-05' }, {}],
        ['slut før start', { ...S, periode_start: '2026-02-01', periode_slut: '2026-01-01' }, {}],
        ['format med klokkeslæt', { ...S, periode_start: '2026-01-05T00:00', periode_slut: '2026-01-06' }, {}],
        ['tom tekst = ingen', { ...S, periode_start: '', periode_slut: '' }, { 'time.start': '2026-01-05T00:00:00Z', 'time.end': '2026-01-05T23:00:00Z' }],
        ['værk helår', S, { 'time.start': '2025-07-01T00:00:00Z', 'time.end': '2026-06-30T23:00:00Z', 'time.resolution': '1h' }],
        ['værk 15min-skridt', S, { 'time.start': '2026-01-05T00:00:00Z', 'time.end': '2026-01-05T23:45:00Z', 'time.resolution': '15min' }],
        ['værk ukendt opløsning', S, { 'time.start': '2026-01-05T00:00:00Z', 'time.end': '2026-01-05T23:00:00Z', 'time.resolution': '30min' }],
        ['værk brøkdel af døgn', S, { 'time.start': '2026-01-05T00:00:00Z', 'time.end': '2026-01-05T12:30:00Z' }],
        ['værk mangler start', S, { 'time.end': '2026-01-05T23:00:00Z' }],
        ['værk start som tal', S, { 'time.start': 5, 'time.end': '2026-01-05T23:00:00Z' }],
        ['værk ulæselig start', S, { 'time.start': 'i går', 'time.end': '2026-01-05T23:00:00Z' }],
        ['værk slut før start', S, { 'time.start': '2026-01-06T00:00:00Z', 'time.end': '2026-01-05T23:00:00Z' }],
        ['værk med mellemrum', S, { 'time.start': '2026-01-05 00:00:00', 'time.end': '2026-01-06 23:00:00' }],
        ['værk bare datoer', S, { 'time.start': '2026-01-05', 'time.end': '2026-01-07' }],
    ];
    for (const [navn, s, vaerdier] of sæt) tilføj('periode_doegn', navn, { scenarie: s, vaerdier }, kør(() => L.periodeDoegn(s, m(vaerdier))));
    const akser: [string, L.ScenarieRad, { start: string; slut: string }][] = [
        ['scenariedatoer', { ...S, periode_start: '2026-01-05', periode_slut: '2026-01-07' }, { start: 'x', slut: 'y' }],
        ['værk med Z', S, { start: '2026-01-05T12:00:00Z', slut: '2026-01-07T11:00:00Z' }],
        ['værk naivt', S, { start: '2026-01-05T12:00:00', slut: '2026-01-07T11:00:00' }],
        ['værk bar dato', S, { start: '2026-01-05', slut: '2026-01-07' }],
        ['værk +00:00', S, { start: '2026-01-05T00:00:00+00:00', slut: '2026-01-07T00:00:00-0000' }],
        ['værk +01:00 afvises', S, { start: '2026-01-05T00:00:00+01:00', slut: '2026-01-07T00:00:00Z' }],
        ['værk med små bogstaver', S, { start: '2026-01-05t00:00:00z', slut: '2026-01-07T00:00:00Z' }],
        ['værk med blanktegn', S, { start: ' 2026-01-05 ', slut: '2026-01-07T00:00:00Z' }],
    ];
    for (const [navn, s, p] of akser) tilføj('effektiv_akse', navn, { scenarie: s, periode: p }, kør(() => L.effektivAkse(s, p)));
}

// ------------------------------------------------------------------ bygFrossetInput

{
    const VÆRK: L.Parameter[] = [
        { sti: 'heat_load_params.baseline_profile_mw', vaerdi_json: '[4.4,4.5]' },
        { sti: 'meta.case_name', vaerdi_json: '"probe"' },
        { sti: 'prices.straw.value', vaerdi_json: '45.0' },
        { sti: 'solver.time_limit', vaerdi_json: '600.0' },
        { sti: 'time.end', vaerdi_json: '"2026-01-11T23:00:00Z"' },
        { sti: 'time.resolution', vaerdi_json: '"1h"' },
        { sti: 'time.start', vaerdi_json: '"2026-01-05T00:00:00Z"' },
        { sti: 'units.elkedel.enabled', vaerdi_json: 'false' },
        { sti: 'units.halmkedel.enabled', vaerdi_json: 'true' },
        { sti: 'units.halmkedel.p_max_heat', vaerdi_json: '12.0' },
    ];
    const S: L.ScenarieRad = { med_balancering: false };
    const PINS = { model_commit: 'b49aeb0af097be42938b80a0fea6acdd77162836', data_commit: '392992c7fe35992e79fba8d1ba7b91967e8d1481' };
    const SHA = 'a'.repeat(64);
    const ts = (o: Partial<L.TidsserieRad>): L.TidsserieRad => ({
        id: '11111111-1111-4111-8111-111111111111', rolle: 'varmelast', navn: 'Målt 2025', sha256: SHA, sti: `Files/fjv/tidsserier/probe/${SHA}.csv`,
        oploesning: '1h', start: '2025-01-01T00:00:00.000Z', slut: '2026-12-31T23:00:00.000Z', aktiv: true, ...o,
    });
    const sol = (o: Partial<L.TidsserieRad>) => ts({ id: '22222222-2222-4222-8222-222222222222', rolle: 'solprofil', navn: 'Sol', ...o });
    const set = (sti: string, vaerdi_json: string | null | undefined, raekkefoelge = 1) => ({ type: 'set', sti, vaerdi_json, raekkefoelge }) as L.ScenarieAendringRad;
    const til = (navn: string, raekkefoelge = 1, type: 'enable' | 'disable' = 'enable') => ({ type, sti: navn, raekkefoelge }) as L.ScenarieAendringRad;
    const med = (ekstra: L.Parameter[], uden: string[] = []) => [...VÆRK.filter((p) => !uden.includes(p.sti) && !ekstra.some((e) => e.sti === p.sti)), ...ekstra];
    const huller = (h: unknown, fuld = true) => JSON.stringify({ huller: h, huller_fuld: fuld });

    type C = { navn: string; params?: L.Parameter[]; aendringer?: L.ScenarieAendringRad[]; scenarie?: Partial<L.ScenarieRad>; pins?: L.Pins; tidsserier?: L.TidsserieRad[] };
    const c: C[] = [
        { navn: 'målt kørsel (17 rækker, 169838dd…)', aendringer: [set('prices.straw.value', '50.0'), til('elkedel', 2)], scenarie: { periode_start: '2026-01-05', periode_slut: '2026-01-07', tidsgraense_s: 300, mip_rel_gap: 0.0002 } },
        { navn: 'intet scenarie-indhold' },
        { navn: 'ændringerne sorteres på raekkefoelge', aendringer: [til('elkedel', 5), set('prices.straw.value', '50.0', 2), til('halmkedel', 3, 'disable')] },
        { navn: 'raekkefoelge mangler (null = 0)', aendringer: [set('prices.straw.value', '50.0', 2), { type: 'enable', sti: 'elkedel', raekkefoelge: null } as unknown as L.ScenarieAendringRad] },
        { navn: 'sti der ikke findes', aendringer: [set('prices.olie.value', '1.0')] },
        { navn: 'to ændringer på samme sti', aendringer: [set('prices.straw.value', '1.0'), set('prices.straw.value', '2.0', 2)] },
        { navn: 'set time.end', aendringer: [set('time.end', '"2028-01-01T23:00:00Z"')] },
        { navn: 'set solver.time_limit', aendringer: [set('solver.time_limit', '7200.0')] },
        { navn: 'set time.resolution', aendringer: [set('time.resolution', '"15min"')] },
        { navn: 'set timestamp (ikke time.)', params: med([{ sti: 'timestamp.x', vaerdi_json: '1' }]), aendringer: [set('timestamp.x', '2')] },
        { navn: 'enable og set på samme enabled-sti', aendringer: [set('units.elkedel.enabled', 'true'), til('elkedel', 2)] },
        { navn: 'ugyldig JSON i en ændring', aendringer: [set('prices.straw.value', '12,5')] },
        { navn: 'set uden værdi (null)', aendringer: [set('prices.straw.value', null)] },
        { navn: 'set med tom værdi', aendringer: [set('prices.straw.value', '')] },
        { navn: 'set med prototype-segment', aendringer: [set('units.__proto__.pr_interval', 'true')] },
        { navn: 'set med tomt segment', aendringer: [set('units..x', 'true')] },
        { navn: 'ukendt enhed', aendringer: [til('kulkedel', 1, 'disable')] },
        { navn: 'sti i stedet for enhedsnavn', aendringer: [til('units.halmkedel', 1, 'disable')] },
        { navn: 'tomt enhedsnavn', aendringer: [til('', 1, 'disable')] },
        { navn: 'navn både enhed og lager', params: med([{ sti: 'storage.halmkedel.volume_m3', vaerdi_json: '1.0' }]), aendringer: [til('halmkedel')] },
        { navn: 'lager slås fra', params: med([{ sti: 'storage.tank.enabled', vaerdi_json: 'true' }]), aendringer: [til('tank', 1, 'disable')] },
        { navn: 'ukendt ændringstype', aendringer: [{ type: 'flyt', sti: 'x', raekkefoelge: 1 } as unknown as L.ScenarieAendringRad] },
        { navn: 'ændringstype mangler', aendringer: [{ sti: 'x', raekkefoelge: 1 } as unknown as L.ScenarieAendringRad] },
        { navn: 'tidsgrænse 7200', scenarie: { tidsgraense_s: 7200 } },
        { navn: 'tidsgrænse 3600', scenarie: { tidsgraense_s: 3600 } },
        { navn: 'tidsgrænse 3600.5', scenarie: { tidsgraense_s: 3600.5 } },
        { navn: 'tidsgrænse 0', scenarie: { tidsgraense_s: 0 } },
        { navn: 'tidsgrænse -5', scenarie: { tidsgraense_s: -5 } },
        { navn: 'periode 367 døgn', scenarie: { periode_start: '2025-01-01', periode_slut: '2026-01-02' } },
        { navn: 'periode 366 døgn', scenarie: { periode_start: '2025-01-01', periode_slut: '2026-01-01' } },
        { navn: 'periode over 366 (spec)', scenarie: { periode_start: '2025-01-01', periode_slut: '2026-02-04' } },
        { navn: 'kun startdato', scenarie: { periode_start: '2025-01-01' } },
        { navn: 'slut før start', scenarie: { periode_start: '2026-02-01', periode_slut: '2026-01-01' } },
        { navn: 'ugyldig dato', scenarie: { periode_start: '2026-02-30', periode_slut: '2026-03-01' } },
        { navn: 'flag uden for hvidlisten', scenarie: { ekstra_flag: '--legacy-nettab --rm-rf' } },
        { navn: 'flag med blanktegn rundt om', scenarie: { ekstra_flag: '  --legacy-nettab\t' } },
        { navn: 'flag adskilt af NBSP', scenarie: { ekstra_flag: '--legacy-nettab --legacy-nettab' } },
        { navn: 'flag to gange', scenarie: { ekstra_flag: '--legacy-nettab --legacy-nettab' } },
        { navn: 'flag tom tekst', scenarie: { ekstra_flag: '' } },
        { navn: 'varmelastfil med sti', scenarie: { heat_csv: '../../etc/passwd.csv' } },
        { navn: 'varmelastfil med skråstreg', scenarie: { heat_csv: 'data/x.csv' } },
        { navn: 'varmelastfil .CSV', scenarie: { heat_csv: 'x.CSV' } },
        { navn: 'varmelastfil ok', scenarie: { heat_csv: 'Billund_abvaerk_hourly.csv' } },
        { navn: 'varmelastfil med linjeskift', scenarie: { heat_csv: 'x.csv\n' } },
        { navn: 'relativt gab 1', scenarie: { mip_rel_gap: 1 } },
        { navn: 'relativt gab 0', scenarie: { mip_rel_gap: 0 } },
        { navn: 'relativt gab -0.1', scenarie: { mip_rel_gap: -0.1 } },
        { navn: 'relativt gab 1e-7 (somFloat 1e-7)', scenarie: { mip_rel_gap: 1e-7 } },
        { navn: 'absolut gab -1', scenarie: { mip_abs_gap: -1 } },
        { navn: 'absolut gab 1e21 (1e+21)', scenarie: { mip_abs_gap: 1e21 } },
        { navn: 'absolut gab 1000', scenarie: { mip_abs_gap: 1000 } },
        { navn: 'flere scenariefelter', scenarie: { tidsgraense_s: 300, mip_abs_gap: 1000, ekstra_flag: '--legacy-nettab', balancing_method: 'legacy', med_balancering: true } },
        { navn: 'balanceringsmetode activation_value', scenarie: { balancing_method: 'activation_value' } },
        { navn: 'ukendt balanceringsmetode', scenarie: { balancing_method: 'xyz' } },
        { navn: '15min-værk', params: med([{ sti: 'time.resolution', vaerdi_json: '"15min"' }]) },
        { navn: 'værk uden opløsning (= 1h)', params: med([], ['time.resolution']) },
        { navn: 'værk med opløsning null (= 1h)', params: med([{ sti: 'time.resolution', vaerdi_json: 'null' }]) },
        { navn: 'værk med opløsning som tal', params: med([{ sti: 'time.resolution', vaerdi_json: '1' }]) },
        { navn: 'pins', pins: PINS },
        { navn: 'pins med andet data_commit', pins: { ...PINS, data_commit: '1'.repeat(40) } },
        { navn: 'pins kort model_commit (programfejl)', pins: { model_commit: 'b49aeb0' } },
        { navn: 'pins tom tekst springes over', pins: { model_commit: '', data_commit: PINS.data_commit } },
        { navn: 'værkets egen tidsgrænse 7200', params: med([{ sti: 'solver.time_limit', vaerdi_json: '7200.0' }]) },
        { navn: 'ingen tidsgrænse nogen steder (600)', params: med([], ['solver.time_limit']) },
        { navn: 'værkets gab bruges', params: med([{ sti: 'solver.mip_rel_gap', vaerdi_json: '0.001' }, { sti: 'solver.mip_abs_gap', vaerdi_json: '10' }]) },
        { navn: 'værkets gab som tekst ignoreres', params: med([{ sti: 'solver.mip_rel_gap', vaerdi_json: '"0.001"' }]) },
        { navn: 'værkets tidsgrænse 1e400 ignoreres', params: med([{ sti: 'solver.time_limit', vaerdi_json: '1e400' }]) },
        { navn: 'dobbelt parameter', params: [...VÆRK, VÆRK[0]] },
        { navn: 'ingen parametre', params: [] },
        { navn: 'ugyldig JSON i en værksparameter', params: med([{ sti: 'prices.straw.value', vaerdi_json: '45,0' }]) },
        { navn: 'NaN-literal i en værksparameter', params: med([{ sti: 'prices.straw.value', vaerdi_json: 'NaN' }]) },
        { navn: 'værk mangler time.start', params: med([], ['time.start']) },
        { navn: 'værk time.start på engelsk (V8-legacy)', params: med([{ sti: 'time.start', vaerdi_json: '"January 5, 2026"' }]) },
        { navn: 'værk time.start med mellemrum', params: med([{ sti: 'time.start', vaerdi_json: '"2026-01-05 00:00:00"' }]) },
        { navn: 'værk time.end før start', params: med([{ sti: 'time.end', vaerdi_json: '"2026-01-04T23:00:00Z"' }]) },
        { navn: 'værk helår 365 døgn', params: med([{ sti: 'time.start', vaerdi_json: '"2025-07-01T00:00:00Z"' }, { sti: 'time.end', vaerdi_json: '"2026-06-30T23:00:00Z"' }]) },
        { navn: 'værk 367 døgn', params: med([{ sti: 'time.start', vaerdi_json: '"2025-01-01T00:00:00Z"' }, { sti: 'time.end', vaerdi_json: '"2026-01-02T23:00:00Z"' }]) },
        { navn: 'værk 366,5 døgn (ceil i teksten)', params: med([{ sti: 'time.start', vaerdi_json: '"2025-01-01T00:00:00Z"' }, { sti: 'time.end', vaerdi_json: '"2026-01-02T11:00:00Z"' }]) },
        { navn: 'for lang værdi (UTF-16: emoji tæller 2)', params: med([{ sti: 'meta.case_name', vaerdi_json: '"x"' }]), aendringer: [set('meta.case_name', JSON.stringify('\u{1F600}'.repeat(2) + 'x'.repeat(3995)))] },
        { navn: 'værdi på præcis 4000', aendringer: [set('meta.case_name', JSON.stringify('x'.repeat(3998)))] },
        { navn: 'for lang enabled-sti', params: med([{ sti: `units.${'k'.repeat(400)}.enabled`, vaerdi_json: 'true' }]), aendringer: [til('k'.repeat(400), 1, 'disable')] },
        { navn: 'æøå i værdien', aendringer: [set('meta.case_name', '"Ærøskøbing"')] },
        // §6d tidsserier
        { navn: 'aktiv varmelast fryses', tidsserier: [ts({})] },
        { navn: 'inaktiv varmelast fryses ikke', tidsserier: [ts({ aktiv: false })] },
        { navn: 'to aktive varmelaster', tidsserier: [ts({}), ts({ id: '33333333-3333-4333-8333-333333333333' })] },
        { navn: 'valgt varmelast (store bogstaver)', aendringer: [set('_tidsserie.varmelast', '"11111111-1111-4111-8111-111111111111"'.toUpperCase())], tidsserier: [ts({ aktiv: false })] },
        { navn: 'valgt id findes ikke', aendringer: [set('_tidsserie.varmelast', '"99999999-1111-4111-8111-111111111111"')], tidsserier: [ts({})] },
        { navn: 'valgt id har anden rolle', aendringer: [set('_tidsserie.varmelast', '"22222222-2222-4222-8222-222222222222"')], tidsserier: [sol({})] },
        { navn: 'syntetisk varmelast trods aktiv', aendringer: [set('_tidsserie.varmelast', '"syntetisk"')], tidsserier: [ts({})] },
        { navn: 'syntetisk solprofil', aendringer: [set('_tidsserie.solprofil', '"syntetisk"')] },
        { navn: 'ukendt rolle', aendringer: [set('_tidsserie.spot', '"x"')] },
        { navn: 'varmelast valgt to gange', aendringer: [set('_tidsserie.varmelast', '"syntetisk"'), set('_tidsserie.varmelast', '"syntetisk"', 2)] },
        { navn: 'valg er et tal', aendringer: [set('_tidsserie.varmelast', '123')] },
        { navn: 'valg er tom tekst', aendringer: [set('_tidsserie.varmelast', '""')] },
        { navn: 'valg er ugyldig JSON', aendringer: [set('_tidsserie.varmelast', 'abc')] },
        { navn: 'valg uden værdi', aendringer: [set('_tidsserie.solprofil', null)] },
        { navn: 'valgt varmelast og heat_csv', aendringer: [set('_tidsserie.varmelast', '"11111111-1111-4111-8111-111111111111"')], scenarie: { heat_csv: 'x.csv' }, tidsserier: [ts({})] },
        { navn: 'heat_csv vinder over aktiv', scenarie: { heat_csv: 'x.csv' }, tidsserier: [ts({})] },
        { navn: 'syntetisk og heat_csv', aendringer: [set('_tidsserie.varmelast', '"syntetisk"')], scenarie: { heat_csv: 'x.csv' } },
        { navn: 'solprofil-markør uden serie', params: med([{ sti: 'units.sol.production_profile_path', vaerdi_json: '"tidsserie:solprofil"' }]) },
        { navn: 'solprofil-markør med aktiv serie', params: med([{ sti: 'units.sol.production_profile_path', vaerdi_json: '"tidsserie:solprofil"' }]), tidsserier: [sol({})] },
        { navn: 'solprofil valgt og profilsti ændret', params: med([{ sti: 'units.sol.production_profile_path', vaerdi_json: '"data/x.csv"' }]), aendringer: [set('units.sol.production_profile_path', '"data/y.csv"'), set('_tidsserie.solprofil', '"22222222-2222-4222-8222-222222222222"', 2)], tidsserier: [sol({})] },
        { navn: 'solprofil med hul', tidsserier: [sol({ validering_json: huller([['2026-01-06T00:00:00Z', '2026-01-06T00:00:00Z', 1]]) })] },
        { navn: 'solprofil der starter for sent', tidsserier: [sol({ start: '2026-01-06T00:00:00.000Z' })] },
        { navn: 'varmelast 94 % (hul på 10 timer)', tidsserier: [ts({ validering_json: huller([['2026-01-06T00:00:00Z', '2026-01-06T09:00:00Z', 10]]) })] },
        { navn: 'varmelast 97 % (hul på 5 timer)', tidsserier: [ts({ validering_json: huller([['2026-01-06T00:00:00Z', '2026-01-06T04:00:00Z', 5]]) })] },
        { navn: 'hul uden for vinduet', tidsserier: [ts({ validering_json: huller([['2025-03-01T00:00:00Z', '2025-03-05T00:00:00Z', 97]]) })] },
        { navn: 'hul der delvis overlapper', tidsserier: [ts({ validering_json: huller([['2026-01-11T20:00:00Z', '2026-01-12T20:00:00Z', 25]]) })] },
        { navn: 'huller_fuld false', tidsserier: [ts({ validering_json: huller([], false) })] },
        { navn: 'validering_json null-tekst', tidsserier: [ts({ validering_json: 'null' })] },
        { navn: 'validering_json ugyldig', tidsserier: [ts({ validering_json: '{x' })] },
        { navn: 'validering_json med huller som tal', tidsserier: [ts({ validering_json: '{"huller": 5}' })] },
        { navn: 'validering_json som liste', tidsserier: [ts({ validering_json: '[1]' })] },
        { navn: 'validering_json med et hul der er null', tidsserier: [ts({ validering_json: huller([['2026-01-06T00:00:00Z', '2026-01-06T09:00:00Z', 10], null]) })] },
        { navn: 'serie der dækker 1 time for lidt i slutningen', tidsserier: [ts({ slut: '2026-01-11T22:00:00.000Z' })] },
        { navn: 'serie helt uden for perioden', tidsserier: [ts({ start: '2024-01-01T00:00:00.000Z', slut: '2024-02-01T00:00:00.000Z' })] },
        { navn: 'K5-F5 værk og serie 48 timer', params: med([{ sti: 'time.start', vaerdi_json: '"2026-01-05T12:00:00Z"' }, { sti: 'time.end', vaerdi_json: '"2026-01-07T11:00:00Z"' }]), tidsserier: [ts({ start: '2026-01-05T12:00:00Z', slut: '2026-01-07T11:00:00Z' })] },
        { navn: 'K5-F5 scenariedatoer dækker 66 %', params: med([{ sti: 'time.start', vaerdi_json: '"2026-01-05T12:00:00Z"' }, { sti: 'time.end', vaerdi_json: '"2026-01-07T11:00:00Z"' }]), scenarie: { periode_start: '2026-01-05', periode_slut: '2026-01-07' }, tidsserier: [ts({ start: '2026-01-05T12:00:00Z', slut: '2026-01-07T11:00:00Z' })] },
        { navn: 'K5-F5 bare datoer i værket', params: med([{ sti: 'time.start', vaerdi_json: '"2026-01-05"' }, { sti: 'time.end', vaerdi_json: '"2026-01-07"' }]), tidsserier: [ts({ start: '2026-01-05T00:00:00Z', slut: '2026-01-07T00:00:00Z' })] },
        { navn: 'værkets tid i +01:00 med en serie', params: med([{ sti: 'time.start', vaerdi_json: '"2026-01-05T00:00:00+01:00"' }]), tidsserier: [ts({})] },
        { navn: 'værkets tid i +01:00 uden serie', params: med([{ sti: 'time.start', vaerdi_json: '"2026-01-05T00:00:00+01:00"' }]) },
        { navn: 'værkets tid naiv med en serie', params: med([{ sti: 'time.start', vaerdi_json: '"2026-01-05T00:00:00"' }]), tidsserier: [ts({})] },
        // Math.round(0.5) = 1 (JS), men round(0.5) = 0 i Python (bankers): en solprofil, der starter 00:30, mangler 1 time.
        { navn: 'solprofil der starter en halv time for sent (Math.round)', tidsserier: [sol({ start: '2026-01-05T00:30:00.000Z' })] },
        { navn: 'varmelast der slutter en halv time for tidligt (Math.round)', tidsserier: [ts({ slut: '2026-01-11T22:30:00.000Z' })] },
        { navn: 'hul på 2,5 time (Math.round)', tidsserier: [ts({ validering_json: huller([['2026-01-06T00:00:00Z', '2026-01-06T01:30:00Z', 3]]) })] },
        { navn: 'begge roller fryses', params: med([{ sti: 'units.sol.type', vaerdi_json: '"solar_thermal"' }]), tidsserier: [ts({}), sol({})] },
    ];
    for (const x of c) {
        const input = { params: x.params ?? VÆRK, aendringer: x.aendringer ?? [], scenarie: { ...S, ...x.scenarie }, pins: x.pins ?? {}, tidsserier: x.tidsserier ?? [] };
        tilføj('byg_frosset_input', x.navn, input, kør(() => L.bygFrossetInput(input.params, input.aendringer, input.scenarie as L.ScenarieRad, input.pins, input.tidsserier)));
    }
}

// ------------------------------------------------------------------ læsAnmodning

{
    const U = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const SHA = 'a'.repeat(64);
    const enhed = { sti: 'units.gaskedel.type', ny_json: '"boiler"' };
    const up = (o: Record<string, unknown>) => ({ handling: 'upload_tidsserie', rolle: 'varmelast', filnavn: 'a.csv', tidsstempel: 'start', tidszone: 'UTC', enhed: 'MW', sha256: SHA, ...o });
    const tekster: [string, string][] = [
        ['parameterliste', JSON.stringify([{ sti: 'prices.straw.value', handling: 'ret', ny_json: '47.5' }])],
        ['opret ret slet', JSON.stringify([{ sti: 'a.b', handling: 'opret', ny_json: '1' }, { sti: 'c', handling: 'ret', ny_json: '"x"' }, { sti: 'd', handling: 'slet' }])],
        ['slet med ny_json ignoreres', JSON.stringify([{ sti: 'd', handling: 'slet', ny_json: 'xxx' }])],
        ['kopi', '[{"handling":"kopier_vaerk","ny_kode":"ny_1","navn":"Ny"}]'],
        ['kopi med beskrivelse', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'ny_1', navn: '  Ny  ', beskrivelse: 'B' }])],
        ['kopi med beskrivelse som tal', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'ny_1', navn: 'Ny', beskrivelse: 5 }])],
        ['kopi med tom beskrivelse', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'ny_1', navn: 'Ny', beskrivelse: '' }])],
        ['kopi med for lang beskrivelse', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'ny_1', navn: 'Ny', beskrivelse: 'x'.repeat(4001) }])],
        ['kopi med kode som tal', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 5, navn: 'Ny' }])],
        ['kopi med kode med linjeskift', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'abc\n', navn: 'Ny' }])],
        ['kopi med reserveret kode', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'nyt', navn: 'Ny' }])],
        ['kopi med kode på 61 tegn', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'a'.repeat(61), navn: 'Ny' }])],
        ['kopi med kode på 60 tegn', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'a'.repeat(60), navn: 'Ny' }])],
        ['kopi med kode med versaler', '[{"handling":"kopier_vaerk","ny_kode":"Ny","navn":"x"}]'],
        ['kopi med kode æ', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'æ', navn: 'x' }])],
        ['kopi med kode med fuldbreddeciffer', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'a１', navn: 'x' }])],
        ['kopi uden navn', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'a' }])],
        ['kopi med navn af blanktegn', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'a', navn: '  ﻿ ' }])],
        ['kopi med navn på 201', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'a', navn: 'n'.repeat(201) }])],
        ['kopi med navn som liste', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'a', navn: [1, [2, null]] }])],
        ['kopi sammen med andet', JSON.stringify([{ handling: 'kopier_vaerk', ny_kode: 'a', navn: 'A' }, { sti: 'x', handling: 'slet' }])],
        ['tom liste', '[]'],
        ['ikke en liste', '{"handling":"kopier_vaerk"}'],
        ['ugyldig JSON', '[{'],
        ['NaN-literal', '[NaN]'],
        ['liste med 0', '[0]'],
        ['liste med null', '[null]'],
        ['liste med tomt objekt', '[{}]'],
        ['liste med tekst', '["x"]'],
        ['liste med liste', '[[]]'],
        ['ukendt handling', '[{"sti":"a","handling":"flyt"}]'],
        ['handling mangler', '[{"sti":"a"}]'],
        ['handling null', '[{"sti":"a","handling":null}]'],
        ['sti mangler', '[{"handling":"slet"}]'],
        ['sti som tal', '[{"sti":5,"handling":"slet"}]'],
        ['tom sti-del', '[{"sti":"a..b","handling":"slet"}]'],
        ['sti med indledende mellemrum', '[{"sti":"a. b","handling":"slet"}]'],
        ['sti med efterstillet mellemrum', '[{"sti":"a.b ","handling":"slet"}]'],
        ['sti med NBSP', JSON.stringify([{ sti: 'a. b', handling: 'slet' }])],
        ['sti med U+0085', JSON.stringify([{ sti: 'a.\u0085b', handling: 'slet' }])],
        ['sti med U+180E', JSON.stringify([{ sti: 'a.᠎b', handling: 'slet' }])],
        ['sti med linjeskift i segmentet', JSON.stringify([{ sti: 'a.b\nc', handling: 'slet' }])],
        ['sti på 400', JSON.stringify([{ sti: 's'.repeat(400), handling: 'slet' }])],
        ['sti på 401', JSON.stringify([{ sti: 's'.repeat(401), handling: 'slet' }])],
        ['sti på 399 + emoji (401 i UTF-16)', JSON.stringify([{ sti: 's'.repeat(399) + '\u{1F600}', handling: 'slet' }])],
        ['sti __proto__', JSON.stringify([{ sti: 'units.__proto__.pr_interval', handling: 'opret', ny_json: 'true' }])],
        ['sti constructor.prototype', JSON.stringify([{ sti: 'constructor.prototype.x', handling: 'opret', ny_json: 'true' }])],
        ['sti storage.tank.prototype', JSON.stringify([{ sti: 'storage.tank.prototype', handling: 'opret', ny_json: 'true' }])],
        ['dublet', '[{"sti":"a","handling":"slet"},{"sti":"a","handling":"slet"}]'],
        ['værdi der ikke er JSON', '[{"sti":"a","handling":"ret","ny_json":"12,5"}]'],
        ['værdi 1e400', '[{"sti":"a","handling":"ret","ny_json":"1e400"}]'],
        ['værdi med -1e400 inde i et objekt', JSON.stringify([{ sti: 'a', handling: 'ret', ny_json: '{"b":1e400,"1":-1e400}' }])],
        ['værdi med NaN-literal', '[{"sti":"a","handling":"ret","ny_json":"NaN"}]'],
        ['værdi som tal', '[{"sti":"a","handling":"ret","ny_json":12}]'],
        ['værdi tom', '[{"sti":"a","handling":"ret","ny_json":""}]'],
        ['værdi mangler', '[{"sti":"a","handling":"opret"}]'],
        ['værdi på 4001', JSON.stringify([{ sti: 'a', handling: 'ret', ny_json: JSON.stringify('x'.repeat(3999)) }])],
        ['værdi med kæmpeheltal', JSON.stringify([{ sti: 'a', handling: 'ret', ny_json: '1'.repeat(400) }])],
        ['værdi med heltal på 5000 cifre', JSON.stringify([{ sti: 'a', handling: 'ret', ny_json: '1'.repeat(5000) }])],
        ['opret_vaerk', JSON.stringify([{ handling: 'opret_vaerk', udkast: U.toUpperCase(), dele: 3, ny_kode: 'nyt_1', navn: ' Nyt ' }])],
        ['opret_vaerk med dele 3.0', '[{"handling":"opret_vaerk","udkast":"' + U + '","dele":3.0,"ny_kode":"a","navn":"A"}]'],
        ['opret_vaerk med dele 1.5', JSON.stringify([{ handling: 'opret_vaerk', udkast: U, dele: 1.5, ny_kode: 'a', navn: 'A' }])],
        ['opret_vaerk med dele som tekst', JSON.stringify([{ handling: 'opret_vaerk', udkast: U, dele: '2', ny_kode: 'a', navn: 'A' }])],
        ['udkast der ikke er et uuid', JSON.stringify([{ handling: 'opret_vaerk', udkast: '%', dele: 1, ny_kode: 'a', navn: 'A' }])],
        ['udkast mangler', JSON.stringify([{ handling: 'opret_vaerk', dele: 1, ny_kode: 'a', navn: 'A' }])],
        ['0 dele', JSON.stringify([{ handling: 'opret_vaerk', udkast: U, dele: 0, ny_kode: 'a', navn: 'A' }])],
        ['51 dele', JSON.stringify([{ handling: 'opret_vaerk', udkast: U, dele: 51, ny_kode: 'a', navn: 'A' }])],
        ['kode med bindestreg', JSON.stringify([{ handling: 'opret_vaerk', udkast: U, dele: 1, ny_kode: 'a-b', navn: 'A' }])],
        ['del', JSON.stringify([{ handling: 'opret_vaerk_del', udkast: U, nr: 2, af: 3, blade: [enhed] }])],
        ['del nr. over antal', JSON.stringify([{ handling: 'opret_vaerk_del', udkast: U, nr: 3, af: 2, blade: [enhed] }])],
        ['del uden blade', JSON.stringify([{ handling: 'opret_vaerk_del', udkast: U, nr: 1, af: 1, blade: [] }])],
        ['del med blade som objekt', JSON.stringify([{ handling: 'opret_vaerk_del', udkast: U, nr: 1, af: 1, blade: { a: 1 } }])],
        ['del med blade af alt muligt', JSON.stringify([{ handling: 'opret_vaerk_del', udkast: U, nr: 1, af: 1, blade: [1, null, 'x'] }])],
        ['oprettelse sammen med andet', JSON.stringify([{ handling: 'opret_vaerk', udkast: U, dele: 1, ny_kode: 'a', navn: 'A' }, { sti: 'x', handling: 'slet' }])],
        ['upload tidsserie', JSON.stringify([up({ navn: '', tidsstempel: 'slut', tidszone: 'Europe/Copenhagen', enhed: 'kW', kolonne: 'varme', sha256: SHA.toUpperCase(), filnavn: 'maalt.csv' })])],
        ['upload tidsserie med navn', JSON.stringify([up({ navn: '  Målt  ' })])],
        ['upload tidsserie med kolonne tom', JSON.stringify([up({ kolonne: '' })])],
        ['upload tidsserie med kolonne som tal', JSON.stringify([up({ kolonne: 3 })])],
        ['upload tidsserie kolonne for lang', JSON.stringify([up({ kolonne: 'k'.repeat(201) })])],
        ['upload tidsserie navn for langt', JSON.stringify([up({ navn: 'n'.repeat(201) })])],
        ['upload ukendt rolle', JSON.stringify([up({ rolle: 'spotpris' })])],
        ['upload rolle mangler', JSON.stringify([up({ rolle: undefined })])],
        ['upload manglende sha256', JSON.stringify([up({ sha256: undefined })])],
        ['upload kort sha256', JSON.stringify([up({ sha256: 'abc' })])],
        ['upload forkert tidsstempel', JSON.stringify([up({ tidsstempel: 'midt' })])],
        ['upload uden enhed', JSON.stringify([up({ enhed: undefined })])],
        ['upload enhed for lang', JSON.stringify([up({ enhed: 'e'.repeat(21) })])],
        ['upload uden tidszone', JSON.stringify([up({ tidszone: undefined })])],
        ['upload tidszone for lang', JSON.stringify([up({ tidszone: 'z'.repeat(41) })])],
        ['upload uden filnavn', JSON.stringify([up({ filnavn: '   ' })])],
        ['upload filnavn på 301', JSON.stringify([up({ filnavn: 'f'.repeat(301) })])],
        ['upload sammen med andet', JSON.stringify([up({}), up({})])],
        ['værksark', JSON.stringify([{ handling: 'upload_vaerksark', filnavn: 'ark.xlsx', sha256: SHA }])],
        ['værksark timeslut true', JSON.stringify([{ handling: 'upload_vaerksark', filnavn: 'ark.xlsx', sha256: SHA, timeslut: true }])],
        ['værksark timeslut null', JSON.stringify([{ handling: 'upload_vaerksark', filnavn: 'ark.xlsx', sha256: SHA, timeslut: null }])],
        ['værksark timeslut ja', JSON.stringify([{ handling: 'upload_vaerksark', filnavn: 'a.xlsx', sha256: SHA, timeslut: 'ja' }])],
        // Runde 12: genupload som revision bærer basis-arkets sha256.
        ['værksark revision', JSON.stringify([{ handling: 'upload_vaerksark', filnavn: 'ark.xlsx', sha256: SHA, basis_sha256: SHA.toUpperCase() }])],
        ['værksark revision basis null', JSON.stringify([{ handling: 'upload_vaerksark', filnavn: 'ark.xlsx', sha256: SHA, basis_sha256: null }])],
        ['værksark revision basis ugyldig', JSON.stringify([{ handling: 'upload_vaerksark', filnavn: 'ark.xlsx', sha256: SHA, basis_sha256: 'abc' }])],
        ['værksark revision basis tal', JSON.stringify([{ handling: 'upload_vaerksark', filnavn: 'ark.xlsx', sha256: SHA, basis_sha256: 12 }])],
        ['aktivering', JSON.stringify([{ handling: 'aktiver_tidsserie', tidsserie_id: '11111111-1111-4111-8111-111111111111'.toUpperCase(), aktiv: true }])],
        ['aktivering uden filnavn er ok', JSON.stringify([{ handling: 'aktiver_tidsserie', tidsserie_id: '11111111-1111-4111-8111-111111111111', aktiv: false }])],
        ['aktiv der ikke er boolean', JSON.stringify([{ handling: 'aktiver_tidsserie', tidsserie_id: '11111111-1111-4111-8111-111111111111', aktiv: 'ja' }])],
        ['aktivering med ugyldigt id', JSON.stringify([{ handling: 'aktiver_tidsserie', tidsserie_id: 'x', aktiv: true }])],
    ];
    for (const [navn, json] of tekster) tilføj('laes_anmodning', navn, { aendringer_json: json }, kør(() => L.læsAnmodning(json)));
}

// ------------------------------------------------------------------ planlægParametre

{
    const nu: [string, string][] = [['prices.straw.value', '45.0'], ['units.halmkedel.p_max_heat', '12.0'], ['units.halmkedel.enabled', 'true']];
    const a = (sti: string, handling: 'opret' | 'ret' | 'slet', ny_json: string | null = null): L.ParameterAendring => ({ sti, handling, ny_json });
    const sæt: [string, L.ParameterAendring[]][] = [
        ['ret/opret og uændret springes over', [a('prices.straw.value', 'ret', '47.5'), a('units.halmkedel.p_max_heat', 'ret', '12.0'), a('units.halmkedel.p_min_heat', 'opret', '2.0')]],
        ['opret af eksisterende', [a('prices.straw.value', 'opret', '1.0')]],
        ['ret af manglende', [a('prices.olie.value', 'ret', '1.0')]],
        ['slet af manglende', [a('prices.olie.value', 'slet')]],
        ['opret under et blad', [a('prices.straw.value.x', 'opret', '1.0')]],
        ['opret over et blad', [a('prices.straw', 'opret', '1.0')]],
        ['intet ændres', [a('prices.straw.value', 'ret', '45.0')]],
        ['slet og opret under det slettede', [a('prices.straw.value', 'slet'), a('prices.straw.value.x', 'opret', '1.0')]],
        ['opret og opret under det nye', [a('a.b', 'opret', '1'), a('a.b.c', 'opret', '1')]],
        ['opret under det nye i omvendt rækkefølge', [a('a.b.c', 'opret', '1'), a('a.b', 'opret', '1')]],
        ['opret med objekt (units)', [a('units.ny.type', 'opret', '"boiler"'), a('prices.gas.value', 'opret', '1.0'), a('storage.t.volume_m3', 'opret', '1.0'), a('meta.x.y', 'opret', '1')]],
        ['opret med to segmenter', [a('units.ny', 'opret', '{}')]],
        ['slet alt', [a('prices.straw.value', 'slet'), a('units.halmkedel.p_max_heat', 'slet'), a('units.halmkedel.enabled', 'slet')]],
        ['ret samme værdi med anden form', [a('prices.straw.value', 'ret', '45')]],
        ['opret "a.b-x" mellem "a.b" og "a.b.c"', [a('units.halmkedel-x', 'opret', '1')]],
    ];
    for (const [navn, æ] of sæt) tilføj('planlaeg_parametre', navn, { nuvaerende: nu, aendringer: æ }, kør(() => L.planlægParametre(new Map(nu), æ)));
}

// ------------------------------------------------------------------ samlNytVaerk og tjekModelkrav

{
    const K4 = JSON.parse(readFileSync(resolve(ROD, 'app/rayfin/functions/test/vektorer/k4_guide_vaerker.json'), 'utf8')) as { vaerker: Record<string, { sti: string; vaerdi_json: string }[]> };
    const U = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const blade = (b: { sti: string; vaerdi_json: string }[]): L.Blad[] => b.map((x) => ({ sti: x.sti, ny_json: x.vaerdi_json }));
    const del = (nr: number, af: number, bl: unknown[], udkast = U) => ({ handling: 'opret_vaerk_del', udkast, nr, af, blade: bl }) as L.OpretVaerkDel;
    const BASIS = blade(K4.vaerker.default);
    const delOp = (bl: L.Blad[], n: number) => Array.from({ length: n }, (_, i) => del(i + 1, n, bl.slice(Math.floor(i * bl.length / n), Math.floor((i + 1) * bl.length / n))));
    const sæt: [string, L.OpretVaerkDel[], number, string][] = [];
    for (const [navn, b] of Object.entries(K4.vaerker)) sæt.push([`K4 ${navn}`, [del(1, 1, blade(b))], 1, U]);
    const tre = delOp(BASIS, 3);
    sæt.push(['K4 default i tre dele, fundet i omvendt orden', [tre[2], tre[0], tre[1]], 3, U]);
    sæt.push(['del fra et andet udkast', [del(1, 1, BASIS, 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee')], 1, U]);
    sæt.push(['del siger forkert antal', [del(1, 2, BASIS)], 1, U]);
    sæt.push(['del to gange', [del(1, 2, BASIS), del(1, 2, BASIS)], 2, U]);
    sæt.push(['del mangler', [tre[0], tre[2]], 3, U]);
    sæt.push(['to dele mangler', [tre[1]], 3, U]);
    const mod = (navn: string, f: (b: L.Blad[]) => unknown[]) => sæt.push([navn, [del(1, 1, f(BASIS.map((x) => ({ ...x }))))], 1, U]);
    mod('ugyldig sti', (b) => [...b, { sti: 'a..b', ny_json: '1' }]);
    mod('sti mangler', (b) => [...b, { ny_json: '1' }]);
    mod('blad er null', (b) => [...b, null]);
    mod('prototype-segment', (b) => [...b, { sti: 'units.__proto__.pr_interval', ny_json: 'true' }]);
    mod('dublet', (b) => [...b, b[0]]);
    mod('mangler værdi', (b) => [...b, { sti: 'x.y' }]);
    mod('værdi som tal', (b) => [...b, { sti: 'x.y', ny_json: 5 }]);
    mod('værdi for lang', (b) => [...b, { sti: 'x.y', ny_json: JSON.stringify('x'.repeat(3999)) }]);
    mod('værdi ugyldig JSON', (b) => [...b, { sti: 'x.y', ny_json: '{' }]);
    mod('kommentar for lang', (b) => [...b, { sti: 'x.y', ny_json: '1', kommentar: 'k'.repeat(2001) }]);
    mod('kommentar som tal og bekraeft', (b) => [...b, { sti: 'x.y', ny_json: '1', kommentar: 7, bekraeft: true }, { sti: 'x.z', ny_json: '1', kommentar: '', bekraeft: 'true' }]);
    mod('blad over et andet', (b) => [...b, { sti: 'units.gaskedel', ny_json: '{}' }]);
    mod('blad under et andet', (b) => [...b, { sti: 'units.gaskedel.type.x', ny_json: '1' }]);
    mod('"a.b-x" mellem "a.b" og "a.b.c"', (b) => [...b, { sti: 'x.b', ny_json: '1' }, { sti: 'x.b-x', ny_json: '1' }, { sti: 'x.b.c', ny_json: '1' }]);
    mod('for mange blade', (b) => [...b, ...Array.from({ length: 2001 - b.length }, (_, i) => ({ sti: `ekstra.f${i}`, ny_json: '1' }))]);
    mod('præcis 2000 blade', (b) => [...b, ...Array.from({ length: 2000 - b.length }, (_, i) => ({ sti: `ekstra.f${i}`, ny_json: '1' }))]);
    for (const [navn, dele, antal, udkast] of sæt) tilføj('saml_nyt_vaerk', navn, { dele, antal, udkast }, kør(() => L.samlNytVaerk(dele, antal, udkast)));

    // tjekModelkrav direkte: mutationer af skabelonen (bladene som {sti, vaerdi_json}).
    const B = K4.vaerker.default;
    const krav: [string, { sti: string; vaerdi_json: string }[]][] = [];
    for (const [navn, b] of Object.entries(K4.vaerker)) krav.push([`K4 ${navn}`, b]);
    const uden = (navn: string, ...stier: string[]) => krav.push([navn, B.filter((x) => !stier.some((s) => x.sti === s || x.sti.startsWith(`${s}.`)))]);
    const sæt2 = (navn: string, o: Record<string, string>) => krav.push([navn, [...B.filter((x) => !(x.sti in o)), ...Object.entries(o).map(([sti, vaerdi_json]) => ({ sti, vaerdi_json }))]]);
    for (const s of ['meta.case_name', 'data.dmi_area', 'data.price_zone', 'time.resolution', 'electricity.spot_area', 'time.start', 'time.end',
        'heat_load_params.gaf_mw_per_k', 'prices.co2_eua.value', 'electricity.tariff_consumption_flat', 'electricity.tariff_production_flat', 'electricity.electricity_tax']) uden(`uden ${s}`, s);
    uden('uden enheder', 'units');
    uden('uden lager og storage-blok', 'storage');
    uden('uden tarifprofil', 'electricity.tariff_consumption');
    const enheder = [...new Set(B.filter((x) => x.sti.startsWith('units.')).map((x) => x.sti.split('.')[1]))];
    const u0 = enheder[0];
    for (const f of ['type', 'fuel', 'p_max_heat', 'p_min_heat', 'alpha', 'eta_fuel_to_heat']) uden(`uden units.${u0}.${f}`, `units.${u0}.${f}`);
    sæt2('time.start som tal', { 'time.start': '5' });
    sæt2('time.start uden dato', { 'time.start': '"i går"' });
    sæt2('time.end før start', { 'time.start': '"2026-02-01T00:00:00Z"', 'time.end': '"2026-01-01T00:00:00Z"' });
    sæt2('time.end samme dag', { 'time.start': '"2026-01-01T00:00:00Z"', 'time.end': '"2026-01-01T23:00:00Z"' });
    sæt2('meta.case_name blanktegn', { 'meta.case_name': '"  "' });
    sæt2('gaf negativ', { 'heat_load_params.gaf_mw_per_k': '-1' });
    sæt2('gaf som tekst', { 'heat_load_params.gaf_mw_per_k': '"1"' });
    sæt2('alle enheder slået fra', Object.fromEntries(enheder.map((n) => [`units.${n}.enabled`, 'false'])));
    sæt2('enhed slået fra med 0 (er stadig aktiv)', Object.fromEntries(enheder.map((n) => [`units.${n}.enabled`, '0'])));
    sæt2('pmin over pmax', { [`units.${u0}.p_min_heat`]: '99.0', [`units.${u0}.p_max_heat`]: '1.0' });
    sæt2('eta 0', { [`units.${u0}.eta_fuel_to_heat`]: '0' });
    sæt2('brændsel uden pris', { [`units.${u0}.fuel`]: '"kul"' });
    sæt2('brændsel uden pris men slået fra', { [`units.${u0}.fuel`]: '"kul"', [`units.${u0}.enabled`]: 'false', 'units.ekstra.type': '"boiler"', 'units.ekstra.fuel': '"electricity"', 'units.ekstra.p_max_heat': '1', 'units.ekstra.p_min_heat': '0', 'units.ekstra.alpha': '0' });
    sæt2('el som brændsel kræver ingen pris', { [`units.${u0}.fuel`]: '"electricity"' });
    sæt2('ikke-endeligt tal', { 'meta.x': '1e400', 'meta.y': '[1,-1e400]' });
    sæt2('ikke-endeligt i objekt (JS-nøgleorden)', { 'meta.x': '{"b":1e400,"1":-1e400}' });
    sæt2('lager med negativt volumen', { 'storage.t.volume_m3': '-1', 'storage.t.delta_t_k': '30', 'storage.t.e_initial_mwh': '0', 'storage.t.p_max_charge_mw': '1', 'storage.t.p_max_discharge_mw': '1', 'storage.t.self_discharge_per_hour': '0' });
    sæt2('lager uden felter', { 'storage.t.navn': '"x"' });
    sæt2('tom storage-blok', { storage: '{}' });
    const NT = 'electricity.tariff_consumption.net_tariff';
    const tarif = B.filter((x) => x.sti.startsWith(`${NT}.`));
    if (tarif.length) {
        const bånd = [...new Set(tarif.filter((x) => x.sti.startsWith(`${NT}.bands.`)).map((x) => x.sti.split('.')[4]))];
        uden('tarif uden bånd', `${NT}.bands`);
        uden('tarif uden sæsoner', `${NT}.seasons`);
        uden('tarif uden enhed', 'electricity.tariff_consumption.unit');
        const sæson = tarif.find((x) => x.sti.endsWith('.months'))!;
        sæt2('måneder som tekst', { [sæson.sti]: '"1-3"' });
        sæt2('måneder med 13', { [sæson.sti]: '[1,13]' });
        sæt2('måneder med 1.0 (heltal)', { [sæson.sti]: JSON.stringify(JSON.parse(sæson.vaerdi_json)).replace(/(\d+)/g, '$1.0') });
        sæt2('måneder med 1.5', { [sæson.sti]: '[1.5]' });
        sæt2('måned to gange', { [sæson.sti]: '[1,1,2,3,4,5,6,7,8,9,10,11,12]' });
        const time = tarif.find((x) => /\.(weekday|weekend)\.\d{2}-\d{2}$/.test(x.sti))!;
        uden('en time mangler', time.sti);
        sæt2('time peger på ukendt bånd', { [time.sti]: '"ukendt"' });
        sæt2('time peger på et tal', { [time.sti]: '5' });
        sæt2('timeinterval i forkert form', { [time.sti.replace(/\d{2}-\d{2}$/, '0-6')]: JSON.stringify(bånd[0]) });
        sæt2('timeinterval over 24', { [time.sti.replace(/\d{2}-\d{2}$/, '22-30')]: JSON.stringify(bånd[0]) });
        sæt2('bånd som tekst', { [`${NT}.bands.${bånd[0]}`]: '"x"' });
        sæt2('elafgift_net forskellig', { 'electricity.tariff_consumption.fixed_components.elafgift_net': '99.0' });
        sæt2('elafgift_net som tekst', { 'electricity.tariff_consumption.fixed_components.elafgift_net': '"4.0"' });
        sæt2('elafgift_net 4 mod 4.0', { 'electricity.tariff_consumption.fixed_components.elafgift_net': '4', 'electricity.electricity_tax': '4.0' });
    }
    krav.push(['mange fejl (og N mere)', B.filter((x) => !x.sti.startsWith('meta.') && !x.sti.startsWith('data.') && !x.sti.startsWith('time.') && !x.sti.startsWith('electricity.'))]);
    krav.push(['ugyldig JSON (programfejl)', [...B, { sti: 'x.y', vaerdi_json: '{' }]]);
    for (const [navn, b] of krav) tilføj('tjek_modelkrav', navn, { blade: b }, kør(() => { L.tjekModelkrav(b); return null; }));
}

// ------------------------------------------------------------------ gyldigSti og ikkeEndelig

{
    const stier = ['a', 'a.b', '', '.', 'a.', '.a', 'a..b', ' a', 'a ', 'a. b', 'a.b ', '\ta', 'a. b', 'a.\u0085b', 'a. b', 'a.﻿b',
        'a.᠎b', 'a.b\nc', '__proto__', 'a.constructor', 'prototype.a', 'a.__proto__x', 's'.repeat(400), 's'.repeat(401), 's'.repeat(399) + '\u{1F600}',
        'æ.ø.å', 'units.halmkedel-x.y', 'a/b', 'a\u0000b'];
    for (const s of stier) tilføj('gyldig_sti', JSON.stringify(s).slice(0, 60), { sti: s }, kør(() => L.gyldigSti(s)));
    const værdier = ['1', '1e400', '-1e400', '[1,[2,-1e400]]', '{"b":1e400,"1":-1e400}', '{"b":1e400,"a":-1e400}', '{"10":1e400,"9":-1e400}',
        '{"4294967295":1e400,"4294967294":-1e400}', '"Infinity"', 'null', 'true', '[]', '{}', '[{"x":[1,2,{"y":1e999}]}]'];
    for (const s of værdier) tilføj('ikke_endelig', s, { json: s }, kør(() => L.ikkeEndelig(JSON.parse(s))));
}

// ------------------------------------------------------------------ tidsserie.ts

{
    const træ: [string, { sti: string; vaerdi_json: string }[]][] = [
        ['enheder og lagre', [{ sti: 'units.sol.type', vaerdi_json: '"solar_thermal"' }, { sti: 'units.sol.p_max_heat', vaerdi_json: '5.0' }, { sti: 'storage.t.volume_m3', vaerdi_json: '100' }, { sti: 'prices.x.value', vaerdi_json: '1' }]],
        ['prototype-segmenter springes over', [{ sti: 'units.__proto__.pr_interval', vaerdi_json: 'true' }, { sti: 'units.constructor.x', vaerdi_json: '1' }, { sti: 'units.a.prototype', vaerdi_json: '1' }, { sti: 'units.b.c', vaerdi_json: '2' }]],
        ['ugyldig JSON springes over', [{ sti: 'units.a.x', vaerdi_json: '{' }, { sti: 'units.a.y', vaerdi_json: '1' }]],
        ['blad og derefter undersøgle', [{ sti: 'units.a', vaerdi_json: '5' }, { sti: 'units.a.b', vaerdi_json: '1' }]],
        ['liste overskrives af træ', [{ sti: 'units.a', vaerdi_json: '[1,2]' }, { sti: 'units.a.b', vaerdi_json: '1' }]],
        ['bare "units"', [{ sti: 'units', vaerdi_json: '{}' }, { sti: 'storage', vaerdi_json: '{}' }]],
        ['tal-nøgler (JS-rækkefølge)', [{ sti: 'units.b.x', vaerdi_json: '1' }, { sti: 'units.2.x', vaerdi_json: '1' }, { sti: 'units.1.x', vaerdi_json: '1' }]],
    ];
    for (const [navn, p] of træ) tilføj('vaerk_trae', navn, { params: p }, kør(() => JSON.parse(JSON.stringify(TS.vaerkTrae(p)))));

    const fund = (n: number, niveau = 'info', lgd = 30) => Array.from({ length: n }, (_, i) => ({ niveau, kode: `k${i}`, besked: `besked ${i} ` + 'x'.repeat(lgd) }));
    const val: [string, Record<string, unknown>][] = [
        ['lille', { version: 3, rolle: 'varmelast', fund: fund(2), fejl: [], advarsler: [], sum_mwh: 48, start: '2026-01-05T00:00:00Z' }],
        ['lange huller afkortes', { version: 3, rolle: 'varmelast', fund: fund(1), huller: Array.from({ length: 300 }, (_, i) => [`2026-01-${String(1 + (i % 28)).padStart(2, '0')}T00:00:00Z`, '2026-02-01T00:00:00Z', i]), huller_fuld: true }],
        ['mange info-fund fjernes', { version: 3, fund: [...fund(80, 'info', 60), ...fund(2, 'advarsel')], fejl: [], advarsler: ['a'] }],
        ['lange beskeder kortes', { version: 3, fund: fund(40, 'fejl', 300), fejl: fund(40, 'fejl', 300).map((f) => f.besked), advarsler: [] }],
        ['beskeder med æøå og emoji', { version: 3, fund: fund(30, 'advarsel', 200).map((f) => ({ ...f, besked: f.besked.replace(/x/g, '\u{1F600}') })), advarsler: [] }],
        ['umuligt (programfejl)', { version: 3, fund: fund(200, 'fejl', 300), stort: 'x'.repeat(5000) }],
        ['tal og floats', { version: 3, fund: [], a: 1.0, b: 0.1 + 0.2, c: 1e21, d: -0, e: [1.5, 2e-7], f: null, g: true }],
    ];
    for (const [navn, v] of val) tilføj('validering_json', navn, { v }, kør(() => TS.valideringJson(v as Parameters<typeof TS.valideringJson>[0])));

    const timer = (år: number, n: number, start = 0) => Array.from({ length: n }, (_, i) => `${new Date(Date.UTC(år, 0, 5) + (i + start) * 3_600_000).toISOString().slice(0, 19)}Z,${(i % 7) + 0.5}`);
    const tæt: [string, string, { fra?: number; til?: number } | undefined][] = [
        ['24 timer', ['time,mw', ...timer(2026, 24), ''].join('\n'), undefined],
        ['med hul', ['time,mw', ...timer(2026, 5), ...timer(2026, 5, 10), ''].join('\n'), undefined],
        ['vindue', ['time,mw', ...timer(2026, 48), ''].join('\n'), { fra: Date.UTC(2026, 0, 5, 10), til: Date.UTC(2026, 0, 5, 20) }],
        ['vindue uden data', ['time,mw', ...timer(2026, 4), ''].join('\n'), { fra: Date.UTC(2027, 0, 1) }],
        ['spredt over 120.000 timer', ['time,mw', ...timer(2026, 24), ...timer(2100, 24), ''].join('\n'), undefined],
        ['spredt med vindue', ['time,mw', ...timer(2026, 24), ...timer(2100, 24), ''].join('\n'), { fra: Date.UTC(2026, 0, 1), til: Date.UTC(2026, 11, 31) }],
        ['forkert overskrift', ['time,MW', ...timer(2026, 2)].join('\n'), undefined],
        ['blanktegn i enderne', ['', 'time,mw', ...timer(2026, 3), '', ''].join('\n'), undefined],
        ['værdier med decimaler', 'time,mw\n2026-01-05T00:00:00Z,19.74\n2026-01-05T01:00:00Z,0.1\n2026-01-05T02:00:00Z,1e-7\n', undefined],
    ];
    for (const [navn, tekst, vindue] of tæt) tilføj('taet_raekke', navn, { normaliseret: tekst, vindue: vindue ?? null }, kør(() => TS.tætRække(tekst, vindue)));

    const enc = (s: string) => new TextEncoder().encode(s);
    const kvarterer = (n: number) => enc('time,mw\n' + Array.from({ length: n }, (_, i) => `${new Date(Date.UTC(2026, 0, 5) + i * 900_000).toISOString().slice(0, 19)}Z,1`).join('\n') + '\n');
    const MW = { tidszone: 'UTC', tidsstempel: 'start', enhed: 'MW' };
    const solTræ = TS.vaerkTrae([{ sti: 'units.sol.type', vaerdi_json: '"solar_thermal"' }, { sti: 'units.sol.p_max_heat', vaerdi_json: '5.0' }, { sti: 'units.kedel.type', vaerdi_json: '"boiler"' }, { sti: 'units.kedel.p_max_heat', vaerdi_json: '10.0' }]);
    const up: [string, Uint8Array | { $fil: string } | { $fyld: number }, string, Record<string, unknown>, unknown][] = [
        ['192 kvarterer à 1 MW', kvarterer(192), 'varmelast', MW, null],
        ['enhed constructor', kvarterer(192), 'varmelast', { ...MW, enhed: 'constructor' }, null],
        ['enhed kW', kvarterer(96), 'varmelast', { ...MW, enhed: 'kW' }, null],
        ['enhed MWh pr. interval', kvarterer(96), 'varmelast', { ...MW, enhed: 'MWh' }, null],
        ['dansk tid og timens slut', enc('tid;varme\n05-01-2026 01:00;12,5\n05-01-2026 02:00;13,25\n05-01-2026 03:00;14\n'), 'varmelast', { tidszone: 'Europe/Copenhagen', tidsstempel: 'slut', enhed: 'MW' }, null],
        ['Windows-1252 med æøå', new Uint8Array([...enc('tid;v'), 0xe6, 0xf8, 0xe5, ...enc('rme\n2026-01-05 00:00;1,5\n2026-01-05 01:00;2,5\n')]), 'varmelast', MW, null],
        ['BOM og CRLF', enc('﻿time,mw\r\n2026-01-05T00:00:00Z,1\r\n2026-01-05T01:00:00Z,2\r\n'), 'varmelast', MW, null],
        ['negative værdier', enc('time,mw\n2026-01-05T00:00:00Z,-1\n2026-01-05T01:00:00Z,2\n'), 'varmelast', MW, null],
        ['dubletter', enc('time,mw\n2026-01-05T00:00:00Z,1\n2026-01-05T00:00:00Z,2\n2026-01-05T01:00:00Z,2\n'), 'varmelast', MW, null],
        ['huller', enc('time,mw\n2026-01-05T00:00:00Z,1\n2026-01-05T05:00:00Z,2\n2026-01-05T06:00:00Z,2\n'), 'varmelast', MW, null],
        ['flere kolonner uden valg', enc('time,a,b\n2026-01-05T00:00:00Z,1,2\n2026-01-05T01:00:00Z,1,2\n'), 'varmelast', MW, null],
        ['flere kolonner med valg', enc('time,a,b\n2026-01-05T00:00:00Z,1,2\n2026-01-05T01:00:00Z,1,2\n'), 'varmelast', { ...MW, kolonne: 'b' }, null],
        ['tom fil', enc(''), 'varmelast', MW, null],
        ['ukendt rolle', kvarterer(4), 'spotpris', MW, null],
        ['ukendt tidszone', kvarterer(4), 'varmelast', { ...MW, tidszone: 'CET' }, null],
        ['solprofil med værk', enc('time,mw\n' + Array.from({ length: 48 }, (_, i) => `${new Date(Date.UTC(2026, 5, 1) + i * 3_600_000).toISOString().slice(0, 19)}Z,${i % 24 > 5 && i % 24 < 20 ? 3 : 0}`).join('\n') + '\n'), 'solprofil', MW, solTræ],
        ['varmelast over kapacitet', enc('time,mw\n2026-01-05T00:00:00Z,50\n2026-01-05T01:00:00Z,60\n'), 'varmelast', MW, solTræ],
        ['for stor gennem appen', { $fyld: TS.MAKS_UPLOAD_BYTES + 1 }, 'varmelast', MW, null],
        ['repoets Billund-varmelast', { $fil: 'app/rayfin/functions/test/vektorer/billund_abvaerk_hourly.csv' }, 'varmelast', MW, null],
        ['repoets Andeby-solprofil', { $fil: 'app/rayfin/functions/test/vektorer/solar_andeby_dmi_karup.csv' }, 'solprofil', MW, null],
    ];
    for (const [navn, b, rolle, valg, vaerk] of up) {
        const bytes = b instanceof Uint8Array ? b : '$fil' in b ? fil(b.$fil) : new Uint8Array(b.$fyld).fill(0x61);
        const r = kør(() => {
            const x = TS.validerUpload(bytes, rolle as TS.Rolle, valg as { tidszone: string; tidsstempel: string; enhed: string }, vaerk as ReturnType<typeof TS.vaerkTrae> | null);
            return { status: x.status, normaliseret_sha256: x.normaliseret === null ? null : sha(x.normaliseret), validering: x.validering };
        });
        tilføj('valider_upload', navn, { bytes: b instanceof Uint8Array ? b : b, rolle, valg, vaerk: vaerk === null ? null : JSON.parse(JSON.stringify(vaerk)) }, r);
    }
}

{
    // Hele uploadTidsserie-kæden for validering_json: tolker (uden afkortning) -> valideringJson (TS' afkortning).
    // En serie med mange huller tvinger afkortning af hullisten — her er oraklets _komprimer og TS uenige (fv-port F1).
    const linjer = ['time,mw'];
    let t = Date.UTC(2025, 0, 1);
    for (let i = 0; i < 400; i++) {                    // 400 blokke: 2 timer data, så et hul på 1–9 timer
        for (let j = 0; j < 2; j++) { linjer.push(`${new Date(t).toISOString().slice(0, 19)}Z,${1 + (i % 5)}`); t += 3_600_000; }
        t += (1 + (i * 7) % 9) * 3_600_000;
    }
    const mange = new TextEncoder().encode(linjer.join('\n') + '\n');
    const MW = { tidszone: 'UTC', tidsstempel: 'start', enhed: 'MW' };
    for (const [navn, b] of [['400 huller', mange], ['192 kvarterer', new TextEncoder().encode('time,mw\n' + Array.from({ length: 192 }, (_, i) => `${new Date(Date.UTC(2026, 0, 5) + i * 900_000).toISOString().slice(0, 19)}Z,1`).join('\n') + '\n')]] as const) {
        tilføj('upload_validering_json', navn, { bytes: b, rolle: 'varmelast', valg: MW }, kør(() => TS.valideringJson(TS.validerUpload(b, 'varmelast', MW, null).validering as Parameters<typeof TS.valideringJson>[0])));
    }
}

{
    // fv-port F2: en afkortet hulliste (huller_fuld=false) giver `ukendt`, som bygFrossetInput ikke bruger.
    // Et år med 1000 enkelttimehuller dækker 88,6 % (< 95 %) — målt hvad TS' forhåndstjek siger.
    const linjer = ['time,mw'];
    const t0 = Date.UTC(2025, 0, 1);
    for (let h = 0; h < 8760; h++) if (h % 8 !== 3 || h >= 8000) linjer.push(`${new Date(t0 + h * 3_600_000).toISOString().slice(0, 19)}Z,5`);
    const b = new TextEncoder().encode(linjer.join('\n') + '\n');
    const r = TS.validerUpload(b, 'varmelast', { tidszone: 'UTC', tidsstempel: 'start', enhed: 'MW' }, null);
    const vj = TS.valideringJson(r.validering as Parameters<typeof TS.valideringJson>[0]);
    const v = r.validering as Record<string, unknown>;
    const params: L.Parameter[] = [
        { sti: 'time.start', vaerdi_json: '"2025-01-01T00:00:00Z"' }, { sti: 'time.end', vaerdi_json: '"2025-12-31T23:00:00Z"' },
        { sti: 'time.resolution', vaerdi_json: '"1h"' }, { sti: 'units.k.enabled', vaerdi_json: 'true' },
    ];
    const ts: L.TidsserieRad = { id: '11111111-1111-4111-8111-111111111111', rolle: 'varmelast', navn: '1000 huller', sha256: 'a'.repeat(64), sti: 'x',
        oploesning: '1h', start: String(v.start), slut: String(v.slut), aktiv: true, validering_json: vj };
    const input = { params, aendringer: [], scenarie: { med_balancering: false }, pins: {}, tidsserier: [ts] };
    tilføj('byg_frosset_input', 'F2: afkortet hulliste (88,6 % dækning)', input, kør(() => L.bygFrossetInput(params, [], { med_balancering: false }, {}, [ts])));
    console.log('F2:', JSON.stringify({ antal_huller: v.antal_huller, daekning: v.daekning, huller_i_json: (JSON.parse(vj).huller as unknown[]).length, huller_fuld: JSON.parse(vj).huller_fuld }));
}

// ------------------------------------------------------------------ zip.ts

function zipKatalog(medlemmer: { navn: string; komp: number; ud: number }[], o: { forfra?: Uint8Array; kommentar?: string; antal?: number; cdStart?: number; ødelæg?: boolean } = {}): Uint8Array {
    const dele: Buffer[] = [Buffer.from(o.forfra ?? Buffer.from('PK\x03\x04' + 'x'.repeat(26)))];
    const cdStart = dele[0].length;
    for (const m of medlemmer) {
        const navn = Buffer.from(m.navn, 'utf8');
        const h = Buffer.alloc(46);
        h.writeUInt32LE(o.ødelæg ? 0x12345678 : 0x02014b50, 0);
        h.writeUInt32LE(m.komp >>> 0, 20); h.writeUInt32LE(m.ud >>> 0, 24);
        h.writeUInt16LE(navn.length, 28); h.writeUInt16LE(0, 30); h.writeUInt16LE(0, 32);
        dele.push(h, navn);
    }
    const cd = Buffer.concat(dele.slice(1));
    const e = Buffer.alloc(22);
    const kom = Buffer.from(o.kommentar ?? '', 'utf8');
    e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(o.antal ?? medlemmer.length, 8); e.writeUInt16LE(o.antal ?? medlemmer.length, 10);
    e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(o.cdStart ?? cdStart, 16); e.writeUInt16LE(kom.length, 20);
    return new Uint8Array(Buffer.concat([dele[0], cd, e, kom]));
}
{
    const MiB = 1024 * 1024;
    const sæt: [string, Uint8Array | { $fil: string }][] = [
        ['skabelonen', { $fil: 'app/rayfin/functions/test/vektorer/skabelon_uaendret.xlsx' }],
        ['K5-bomben (8 MiB kommentar)', { $fil: 'app/rayfin/functions/test/vektorer/k5_komprimeret.xlsx' }],
        ['tre små dele', zipKatalog([{ navn: 'a.xml', komp: 100, ud: 1000 }, { navn: 'b.xml', komp: 10, ud: 20 }, { navn: 'æø.xml', komp: 1, ud: 1 }])],
        ['forhold over 100 for en stor del', zipKatalog([{ navn: 'xl/fyld.xml', komp: 10_000, ud: 2 * MiB }])],
        ['forhold over 100 men lille del', zipKatalog([{ navn: 'a', komp: 1, ud: MiB }])],
        ['forhold præcis 100', zipKatalog([{ navn: 'a', komp: 20_000, ud: 2_000_000 }])],
        ['komprimeret 0', zipKatalog([{ navn: 'a', komp: 0, ud: MiB + 1 }])],
        ['én del over 16 MiB', zipKatalog([{ navn: 'a', komp: 1 * MiB, ud: 16 * MiB + 1 }])],
        ['i alt over 32 MiB', zipKatalog([{ navn: 'a', komp: MiB, ud: 15 * MiB }, { navn: 'b', komp: MiB, ud: 15 * MiB }, { navn: 'c', komp: MiB, ud: 3 * MiB }])],
        ['201 dele', zipKatalog(Array.from({ length: 201 }, (_, i) => ({ navn: `d${i}`, komp: 1, ud: 1 })))],
        ['200 dele', zipKatalog(Array.from({ length: 200 }, (_, i) => ({ navn: `d${i}`, komp: 1, ud: 1 })))],
        ['ZIP64 i EOCD (antal)', zipKatalog([{ navn: 'a', komp: 1, ud: 1 }], { antal: 0xffff })],
        ['ZIP64 i medlem', zipKatalog([{ navn: 'a', komp: 0xffffffff, ud: 1 }])],
        ['ødelagt medlemssignatur', zipKatalog([{ navn: 'a', komp: 1, ud: 1 }], { ødelæg: true })],
        ['katalog efter EOCD', zipKatalog([{ navn: 'a', komp: 1, ud: 1 }], { cdStart: 5000 })],
        ['med kommentar', zipKatalog([{ navn: 'a', komp: 1, ud: 1 }], { kommentar: 'hej' })],
        ['ingen EOCD', new Uint8Array(Buffer.from('PK\x03\x04' + 'y'.repeat(100)))],
        ['for kort', new Uint8Array([0x50, 0x4b])],
        ['tom', new Uint8Array(0)],
        ['antal 0', zipKatalog([])],
    ];
    for (const [navn, b] of sæt) {
        const bytes = b instanceof Uint8Array ? b : fil(b.$fil);
        tilføj('tjek_zip', navn, { bytes: b }, kør(() => Z.tjekZip(bytes)));
    }
}

// ------------------------------------------------------------------ vaerksark.ts (forløb mod en optagende falsk database)

async function vaerksarkForløb() {
    const SKAB = fil('app/rayfin/functions/test/vektorer/skabelon_uaendret.xlsx');
    const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
    const A = '44444444-4444-4444-8444-444444444444';
    const anm = (o: Partial<V.AnmodningsRad>, indhold: string, filnavn = 'ark.xlsx', timeslut?: boolean | null, basis?: string) => ({
        id: A.toUpperCase(), status: 'ny', svar: null, anmodet_af: 'x@y.dk',
        aendringer_json: JSON.stringify([{ handling: 'upload_vaerksark', filnavn, sha256: sha(indhold), ...(timeslut === undefined ? {} : { timeslut }), ...(basis === undefined ? {} : { basis_sha256: sha(basis) }) }]), ...o,
    });
    type Sc = { navn: string; indhold: string; basis?: string; anmodning: V.AnmodningsRad | null; import?: V.ImportRad | null; importEfter?: V.ImportRad | null;
        opret?: 'oprettet' | 'allerede_behandlet'; reserver?: boolean; job?: V.Jobsvar | null; skrivKaster?: boolean; vaerk?: V.VaerkRad | null };
    const V_ID = '55555555-5555-4555-8555-555555555555';
    const rev = (o: Partial<V.AnmodningsRad>, basis: string) => anm({ vaerk_id: V_ID.toUpperCase(), forventet_revision: 3, ...o }, ok, 'andeby_rev3.xlsx', null, basis);
    const VAERK: V.VaerkRad = { id: V_ID, kode: 'andeby', revision: 3, arkiveret: false };
    const ok = b64(SKAB);
    // Store indhold gemmes som en opskrift, Python genskaber: {"$b64af": {"$fil": sti}} / {"$b64af": {"$nul": n}}.
    const BOMBE = 'app/rayfin/functions/test/vektorer/k5_komprimeret.xlsx';
    const STOR = new Map<string, unknown>([
        [ok, { $b64af: { $fil: 'app/rayfin/functions/test/vektorer/skabelon_uaendret.xlsx' } }],
        [b64(fil(BOMBE)), { $b64af: { $fil: BOMBE } }],
        [b64(new Uint8Array(2_500_001)), { $b64af: { $nul: 2_500_001 } }],
        [b64(new Uint8Array(2_500_500)), { $b64af: { $nul: 2_500_500 } }],
    ]);
    const sc: Sc[] = [
        { navn: 'anmodning findes ikke', indhold: ok, anmodning: null },
        { navn: 'anmodning afvist', indhold: ok, anmodning: anm({ status: 'afvist', svar: 'nej' }, ok) },
        { navn: 'anmodning afvist uden svar', indhold: ok, anmodning: anm({ status: 'afvist', svar: null }, ok) },
        { navn: 'forkert type', indhold: ok, anmodning: anm({ aendringer_json: JSON.stringify([{ sti: 'a', handling: 'slet' }]) }, ok) },
        { navn: 'ugyldig anmodning', indhold: ok, anmodning: anm({ aendringer_json: '[]' }, ok) },
        { navn: 'sha256 passer ikke', indhold: ok, anmodning: anm({}, 'andet') },
        { navn: 'ikke base64', indhold: 'ikke base64!', anmodning: anm({}, 'ikke base64!') },
        { navn: 'for stort', indhold: b64(new Uint8Array(2_500_001)), anmodning: anm({}, b64(new Uint8Array(2_500_001))) },
        { navn: 'for stort, 2500,5 kB (Math.round)', indhold: b64(new Uint8Array(2_500_500)), anmodning: anm({}, b64(new Uint8Array(2_500_500))) },
        { navn: 'ikke en xlsx', indhold: b64(new Uint8Array([1, 2, 3, 4, 5])), anmodning: anm({}, b64(new Uint8Array([1, 2, 3, 4, 5]))) },
        { navn: 'zip-bombe', indhold: b64(fil('app/rayfin/functions/test/vektorer/k5_komprimeret.xlsx')), anmodning: anm({}, b64(fil('app/rayfin/functions/test/vektorer/k5_komprimeret.xlsx'))) },
        { navn: 'ny, job startes', indhold: ok, anmodning: anm({}, ok, 'ark.xlsx', true), opret: 'oprettet', importEfter: { id: A, status: 'koe', fabric_job_id: null, log: null }, reserver: true, job: { ok: true, jobId: 'job-1', status: 202 } },
        { navn: 'ny, job uden id', indhold: ok, anmodning: anm({}, ok), opret: 'oprettet', importEfter: { id: A, status: 'koe', fabric_job_id: null, log: null }, reserver: true, job: { ok: true, status: 202 } },
        { navn: 'ny, jobstart fejler', indhold: ok, anmodning: anm({}, ok), opret: 'oprettet', importEfter: { id: A, status: 'koe', fabric_job_id: null, log: null }, reserver: true, job: { ok: false, status: 429, fejl: 'langsomt' } },
        { navn: 'ny, ingen importnotebook', indhold: ok, anmodning: anm({}, ok), opret: 'oprettet', importEfter: { id: A, status: 'koe', fabric_job_id: null, log: 'x' }, job: null },
        { navn: 'ny, reservation tabt', indhold: ok, anmodning: anm({}, ok), opret: 'oprettet', importEfter: { id: A, status: 'koe', fabric_job_id: 'reserveret:x', log: null }, reserver: false, job: { ok: true, jobId: 'j', status: 202 } },
        { navn: 'ny, en anden nåede det', indhold: ok, anmodning: anm({}, ok), opret: 'allerede_behandlet', importEfter: { id: A, status: 'koerer', fabric_job_id: 'j', log: null }, job: { ok: true, jobId: 'j', status: 202 } },
        { navn: 'udført, import i kø med job', indhold: ok, anmodning: anm({ status: 'udfoert', svar: 's' }, ok), importEfter: { id: A, status: 'koe', fabric_job_id: 'j', log: null }, reserver: false, job: { ok: true, jobId: 'j2', status: 202 } },
        { navn: 'udført, import i kø genoptages', indhold: ok, anmodning: anm({ status: 'udfoert', svar: 's' }, ok), importEfter: { id: A, status: 'koe', fabric_job_id: null, log: null }, reserver: true, job: { ok: true, jobId: 'j3', status: 202 } },
        { navn: 'udført, import færdig', indhold: ok, anmodning: anm({ status: 'udfoert', svar: 's' }, ok), importEfter: { id: A, status: 'faerdig', fabric_job_id: 'j', log: null }, job: { ok: true, status: 202 } },
        { navn: 'udført, import fejl', indhold: ok, anmodning: anm({ status: 'udfoert', svar: 's' }, ok), importEfter: { id: A, status: 'fejl', fabric_job_id: 'j', log: 'x' }, job: { ok: true, status: 202 } },
        { navn: 'udført, import ukendt status', indhold: ok, anmodning: anm({ status: 'udfoert', svar: 's' }, ok), importEfter: { id: A, status: 'mærkelig', fabric_job_id: 'j', log: null }, job: null },
        { navn: 'udført, ingen import', indhold: ok, anmodning: anm({ status: 'udfoert', svar: 's' }, ok), importEfter: null },
        { navn: 'ny status men ukendt (ingen import)', indhold: ok, anmodning: anm({ status: 'mærkelig', svar: null }, ok), importEfter: null },
        { navn: 'skrivning fejler (programfejl)', indhold: ok, anmodning: anm({}, ok), skrivKaster: true },
        // Runde 12: genupload som revision (basis = appens nye eksport af værkets revision).
        { navn: 'revision, samme revision, job startes', indhold: ok, basis: ok, anmodning: rev({}, ok), vaerk: VAERK, opret: 'oprettet', importEfter: { id: A, status: 'koe', fabric_job_id: null, log: null }, reserver: true, job: { ok: true, jobId: 'job-r', status: 202 } },
        { navn: 'revision, værket er ændret siden eksporten', indhold: ok, basis: ok, anmodning: rev({}, ok), vaerk: { ...VAERK, revision: 4 } },
        { navn: 'revision, værket findes ikke', indhold: ok, basis: ok, anmodning: rev({}, ok), vaerk: null },
        { navn: 'revision, værket er arkiveret', indhold: ok, basis: ok, anmodning: rev({}, ok), vaerk: { ...VAERK, arkiveret: true } },
        { navn: 'revision, basis passer ikke med sha256', indhold: ok, basis: b64(new Uint8Array([9, 9])), anmodning: rev({}, ok), vaerk: VAERK },
        { navn: 'revision, basis mangler', indhold: ok, anmodning: rev({}, ok), vaerk: VAERK },
        { navn: 'revision, basis er ikke en xlsx', indhold: ok, basis: b64(new Uint8Array([1, 2, 3, 4, 5])), anmodning: rev({}, b64(new Uint8Array([1, 2, 3, 4, 5]))), vaerk: VAERK },
        { navn: 'basis uden revision', indhold: ok, basis: ok, anmodning: anm({}, ok), vaerk: VAERK },
        { navn: 'revision, udført, import færdig', indhold: ok, basis: ok, anmodning: rev({ status: 'udfoert', svar: 's' }, ok), importEfter: { id: A, status: 'faerdig', fabric_job_id: 'j', log: null }, job: { ok: true, status: 202 } },
    ];
    for (const s of sc) {
        const spor: unknown[] = [];
        const deps: V.VaerksarkDeps = {
            læsAnmodning: async (id) => { spor.push(['laes_anmodning', id]); return s.anmodning ?? undefined; },
            læsImport: async (id) => { spor.push(['laes_import', id]); return s.importEfter ?? undefined; },
            læsVaerk: async (id) => { spor.push(['laes_vaerk', id]); return s.vaerk ?? undefined; },
            skrivFil: async (sti, bytes) => { spor.push(['skriv_fil', sti, bytes.byteLength, sha(bytes)]); if (s.skrivKaster) throw new Error('disk fuld'); },
            opretImport: async (a, upload, sti, log) => { spor.push(['opret_import', a.id, upload, sti, log]); return s.opret ?? 'oprettet'; },
            reserverJobstart: async (id) => { spor.push(['reserver_jobstart', id]); return s.reserver ?? false; },
            bindJob: async (id, jobId, log) => { spor.push(['bind_job', id, jobId, log]); },
            startJob: s.job === null || s.job === undefined ? null : async (id) => { spor.push(['start_job', id]); return s.job!; },
            afvisAnmodning: async (id, tekst) => { spor.push(['afvis_anmodning', id, tekst]); },
        };
        let ud: Udfald;
        try { ud = { ud: await V.behandlVaerksark(deps, A, s.indhold, s.basis ?? '') }; } catch (e) { ud = { fejl: (e as Error).message, fejltype: (e as Error).name }; }
        const { navn, ...input } = s;
        tilføj('behandl_vaerksark', navn, { ...input, anmodning_id: A, indhold: STOR.get(s.indhold) ?? s.indhold,
            ...(s.basis === undefined ? {} : { basis: STOR.get(s.basis) ?? s.basis }) }, { ...ud, spor } as Udfald);
    }
}

await vaerksarkForløb();

// ------------------------------------------------------------------ skriv

mkdirSync(UD, { recursive: true });
let i = 0;
for (const [gruppe, tilfaelde] of Object.entries(filer)) {
    const ud = { _om: `Genereret af skema/vektorer/generer.mts fra TS-implementeringen (${gruppe}). Ret aldrig i hånden — generér igen.`, kilder: kildeHash, tilfaelde };
    writeFileSync(resolve(UD, `${gruppe}.json`), JSON.stringify(ud, null, 1) + '\n', 'utf8');
    i += tilfaelde.length;
}
console.log(`${i} vektorer i ${Object.keys(filer).length} filer`);
