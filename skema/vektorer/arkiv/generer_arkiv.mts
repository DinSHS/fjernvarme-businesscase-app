//-----------------------------------------------------------------------
// Arkivets fælles testvektorer (runde 13) — genereret ved at KØRE TypeScript (app/rayfin/functions/src/arkiv.ts).
// Python-porten (community/fjernvarme_app/logik/arkiv.py) skal give det samme: community/tests/test_arkiv.py.
// skema/test/arkiv_vektorer.test.mjs fejler, hvis TS ændres uden ny generering.
//
//   cd app && npx tsx ../skema/vektorer/arkiv/generer_arkiv.mts
//
// Egen mappe og egen generator (ikke generer.mts), så arkivet kan merges uden at røre de andre vektorgrupper.
// Kodning som generer.mts: {"$tal": "NaN"|"Infinity"|"-0"}, {"$map": [[k, v], …]}.
//-----------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as A from '../../../app/rayfin/functions/src/arkiv.ts';
import * as H from '../../../app/rayfin/functions/test/arkiv-hukommelse.ts';

const HER = dirname(fileURLToPath(import.meta.url));
const ROD = resolve(HER, '../../..');
const UD = process.env.FJV_VEKTOR_UD ? resolve(process.env.FJV_VEKTOR_UD) : HER;
const KILDER = ['app/rayfin/functions/src/arkiv.ts', 'app/rayfin/functions/src/skema.data.ts', 'app/rayfin/functions/test/arkiv-hukommelse.ts'];
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const kildeHash = Object.fromEntries(KILDER.map((f) => [f, sha(readFileSync(resolve(ROD, f)))]));

function kod(v: unknown): unknown {
    if (typeof v === 'number') {
        if (Object.is(v, -0)) return { $tal: '-0' };
        if (!Number.isFinite(v)) return { $tal: String(v) };
        return v;
    }
    if (Array.isArray(v)) return v.map(kod);
    if (v instanceof Map) return { $map: [...v.entries()].map(([k, x]) => [k, kod(x)]) };
    if (v instanceof Set) return [...v].map(kod);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, kod(x)]));
    return v;
}

type Udfald = { ud: unknown } | { afvisning: string } | { fejl: string; fejltype: string };
async function kør(f: () => unknown): Promise<Udfald> {
    try {
        return { ud: await f() };
    } catch (e) {
        if (e instanceof A.ArkivAfvisning) return { afvisning: e.message };
        return { fejl: e instanceof Error ? e.message : String(e), fejltype: e instanceof Error ? e.name : typeof e };
    }
}

const filer: Record<string, unknown[]> = {};
async function tilføj(gruppe: string, navn: string, input: Record<string, unknown>, f: () => unknown) {
    (filer[gruppe] ??= []).push({ navn, input: kod(input), ...(kod(await kør(f)) as object) });
}

const kol = (tabel: A.ImportTabel, navn: string) => A.kolonner(tabel).find((k) => k.navn === navn)!;
const ARKIV = 'c'.repeat(64);

// ------------------------------------------------------------------ kanonisk

const typer: [string, A.Kolonne][] = [
    ['uuid', { navn: 'id', type: 'uuid', nullable: false }], ['tekst', { navn: 'navn', type: 'text', nullable: true }],
    ['heltal', { navn: 'forsoeg', type: 'int', nullable: false }], ['decimal', { navn: 'vaerdi', type: 'decimal', nullable: true }],
    ['bool', { navn: 'arkiveret', type: 'boolean', nullable: false }], ['tid', { navn: 'tid', type: 'datetime', nullable: false }],
];
const værdier: unknown[] = [null, 'AAAAAAAA-0000-4000-8000-000000000001', 'tekst', '', ' 12.5 ', '1e3', 'abc', 0, -0, 1, 2.5, 1e21, 0.1 + 0.2, true, false,
    '2026-10-25T01:30:00.000Z', '2026-10-25T01:30:00', '2026-10-25T03:30:00+02:00', '2026-10-25T01:30:00.1234Z', '2026-10-25', 'ikke en dato', [1], { a: 1 }];
for (const [t, k] of typer) for (const [i, v] of værdier.entries()) await tilføj('arkiv_kanonisk', `${t} #${i}`, { kolonne: k, v }, () => A.kanonisk(k, v));

// ------------------------------------------------------------------ validering

const fejlTilfælde: [A.ImportTabel, string, unknown][] = [
    ['Koersel', 'status', 'faerdig'], ['Koersel', 'status', 'FAERDIG'], ['Koersel', 'status', null], ['Koersel', 'fase', null],
    ['Scenarie', 'navn', 'x'.repeat(200)], ['Scenarie', 'navn', 'x'.repeat(201)], ['Scenarie', 'navn', '😀'.repeat(100)], ['Scenarie', 'navn', '😀'.repeat(101)],
    ['Scenarie', 'navn', ' '], ['Scenarie', 'navn', 'a '], ['Scenarie', 'navn', 5], ['Scenarie', 'periode_start', '2026-01-05'], ['Scenarie', 'periode_start', '5-1-2026'],
    ['KoerselTime', 'vaerdier_json', '{"a":1}'], ['KoerselTime', 'vaerdier_json', '{NaN}'], ['KoerselTime', 'vaerdier_json', '{"a":NaN}'],
    ['KoerselTime', 'tid', '2026-01-01T00:00:00.000Z'], ['KoerselTime', 'tid', '2026-01-01T00:00:00Z'], ['KoerselTime', 'tid', '2026-02-30T00:00:00.000Z'],
    ['Koersel', 'forsoeg', 1], ['Koersel', 'forsoeg', 1.5], ['Koersel', 'forsoeg', 2 ** 31], ['Koersel', 'forsoeg', -(2 ** 31)],
    ['Koersel', 'objektiv_dkk', 1e23], ['Koersel', 'objektiv_dkk', 1e24], ['Koersel', 'objektiv_dkk', 867031.23], ['Koersel', 'objektiv_dkk', '867031.23'],
    ['Koersel', 'er_milp', true], ['Koersel', 'er_milp', 1], ['Koersel', 'id', 'AAAAAAAA-0000-4000-8000-000000000001'], ['Koersel', 'id', 'aaaaaaaa-0000-4000-8000-000000000001'],
    ['Koersel', 'input_hash', 'a'.repeat(64)], ['Koersel', 'input_hash', 'A'.repeat(64)], ['Koersel', 'model_commit', 'e'.repeat(40)], ['Koersel', 'model_commit', 'e'.repeat(39)],
    ['KoerselMaaned', 'maaned', '2026-13'], ['KoerselMaaned', 'maaned', 'periode'],
];
for (const [i, [t, n, v]] of fejlTilfælde.entries()) await tilføj('arkiv_fejl_i_vaerdi', `${t}.${n} #${i}`, { tabel: t, kolonne: n, v }, () => A.fejlIVærdi(kol(t, n), v as A.Kanonisk));

// ------------------------------------------------------------------ tabellens sha

const shaTilfælde: A.Kanonisk[][][] = [
    [], [['a', 1, null]], [['b', 1, null], ['a', 2.5, 'x']], [['a', 0.1 + 0.2, 1e21, 1e-7, -5, 123.456, true, false]],
    [['～'], ['😀'], ['æ'], ['Z'], ['"\\\n\u0001']], [['a', 'b'], ['a', 'b']],
];
for (const [i, r] of shaTilfælde.entries()) await tilføj('arkiv_tabel_sha', `#${i}`, { raekker: r }, () => A.tabelSha(r));

// ------------------------------------------------------------------ anmodning

const god = { arkiv: ARKIV, sha256: 'd'.repeat(64), tabel: 'KoerselTime', nr: 1, af: 2, koersel_ider: [], filnavn: 'x.xlsx' };
const anm = (o: Record<string, unknown>) => JSON.stringify([{ handling: 'importer_arkiv', ...god, ...o }]);
const anmodninger: [string, string][] = [
    ['gyldig', anm({})], ['ugyldig JSON', '[{'], ['ikke en liste', '{}'], ['to handlinger', `[${anm({}).slice(1, -1)},${anm({}).slice(1, -1)}]`],
    ['anden handling', JSON.stringify([{ handling: 'upload_vaerksark' }])], ['arkiv-sha', anm({ arkiv: 'x' })], ['del-sha', anm({ sha256: 'A'.repeat(64) })],
    ['ukendt tabel', anm({ tabel: 'Vaerk' })], ['tabel mangler', JSON.stringify([{ handling: 'importer_arkiv', arkiv: ARKIV, sha256: ARKIV }])],
    ['nr > af', anm({ nr: 3, af: 2 })], ['nr 0', anm({ nr: 0 })], ['nr 1.5', anm({ nr: 1.5 })], ['ider ikke uuid', anm({ koersel_ider: ['x'] })],
    ['Koersel uden ider', anm({ tabel: 'Koersel' })], ['ider uden Koersel', anm({ koersel_ider: [H.ID.koersel] })],
    ['Koersel med ider', anm({ tabel: 'Koersel', koersel_ider: [H.ID.koersel] })],
    ['61 ider', anm({ tabel: 'Koersel', koersel_ider: Array.from({ length: 61 }, (_, i) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`) })],
    ['langt filnavn', anm({ filnavn: 'x'.repeat(301) })], ['uden filnavn', JSON.stringify([{ handling: 'importer_arkiv', arkiv: ARKIV, sha256: ARKIV, tabel: 'Bestilling', nr: 1, af: 1, koersel_ider: [] }])],
];
for (const [n, t] of anmodninger) await tilføj('arkiv_laes_import_anmodning', n, { tekst: t }, () => A.læsImportAnmodning(t));

// ------------------------------------------------------------------ del

const db = H.eksempelDb(3);
const scen = H.rækkerFra(db, 'Scenarie');
const koer = H.rækkerFra(db, 'Koersel');
const forventet = { [H.ID.koersel]: { KoerselInput: 5, KoerselNoegletal: 2, KoerselMaaned: 2, KoerselTime: 3 } };
const del = (o: Record<string, unknown>) => JSON.stringify({ format: 'fjv-arkiv-del', version: 1, arkiv: ARKIV, tabel: 'Scenarie', kolonner: A.kolonnenavne('Scenarie'), raekker: scen, ...o });
const dele: [string, string][] = [
    ['gyldig', del({})], ['ugyldig JSON', '{'], ['format', del({ format: 'x' })], ['version 2', del({ version: 2 })], ['arkiv', del({ arkiv: 'x' })],
    ['tabel', del({ tabel: 'Motor' })], ['kolonner', del({ kolonner: A.kolonnenavne('Scenarie').slice(1) })], ['ingen rækker', del({ raekker: [] })],
    ['objekt i celle', del({ raekker: [[...scen[0].slice(0, -1), { a: 1 }]] })], ['for langt navn', del({ raekker: [scen[0].map((v, i) => (i === 2 ? 'x'.repeat(201) : v))] })],
    ['dublet', del({ raekker: [scen[0], scen[0]] })],
    ['Koersel uden forventet', del({ tabel: 'Koersel', kolonner: A.kolonnenavne('Koersel'), raekker: koer })],
    ['Koersel forventet mangler barn', del({ tabel: 'Koersel', kolonner: A.kolonnenavne('Koersel'), raekker: koer, forventet: { [H.ID.koersel]: { KoerselInput: 5 } } })],
    ['Koersel gyldig', del({ tabel: 'Koersel', kolonner: A.kolonnenavne('Koersel'), raekker: koer, forventet })],
];
for (const [n, t] of dele) await tilføj('arkiv_laes_del', n, { tekst: t }, () => A.læsDel(t));

// ------------------------------------------------------------------ værkets revisioner

const blade = [...db.VaerkParameter.values()].map((r) => ({ sti: String(r.sti), vaerdi_json: String(r.vaerdi_json) }));
const log = [...db.Aendringslog.values()] as unknown as A.LogRad[];
await tilføj('arkiv_vaerk_revisioner', 'eksempel', { revision: 3, blade, log }, () => A.vaerkRevisioner(3, blade, log));
const opretSlet: A.LogRad[] = [
    { revision: 2, sti: 'units.ny.p_max', handling: 'opret', gammel_json: null, ny_json: '1.0' },
    { revision: 3, sti: 'prices.straw.value', handling: 'slet', gammel_json: '250.0', ny_json: null },
];
const blade3 = [{ sti: 'units.halmkedel.p_max', vaerdi_json: '5.0' }, { sti: 'units.ny.p_max', vaerdi_json: '1.0' }];
await tilføj('arkiv_vaerk_revisioner', 'opret og slet', { revision: 3, blade: blade3, log: opretSlet }, () => A.vaerkRevisioner(3, blade3, opretSlet));
await tilføj('arkiv_vaerk_revisioner', 'uden log', { revision: 2, blade: blade3, log: [] }, () => A.vaerkRevisioner(2, blade3, []));

// ------------------------------------------------------------------ kørslens tjek

const input = [...db.KoerselInput.values()].map((r) => ({ kilde: String(r.kilde), sti: String(r.sti), vaerdi_json: String(r.vaerdi_json) }));
const revisioner = A.vaerkRevisioner(3, blade, log);
const basis = {
    koersel: koer[0], antal: forventet[H.ID.koersel], forventet: forventet[H.ID.koersel], input,
    bestilling: { scenarie_id: H.ID.scenarie }, scenarie: { vaerk_id: H.ID.vaerk }, vaerk: { id: H.ID.vaerk }, revisioner, tidsserier: new Set([H.TIDSSERIE_SHA]),
};
const kv = (navn: string, v: A.Kanonisk) => koer[0].map((x, i) => (A.kolonnenavne('Koersel')[i] === navn ? v : x));
const tjek: [string, Partial<typeof basis>][] = [
    ['gyldig', {}], ['i kø', { koersel: kv('status', 'koe') }], ['fejlet', { koersel: kv('status', 'fejl') }],
    ['mangler timer', { antal: { ...forventet[H.ID.koersel], KoerselTime: 2 } }], ['input rettet', { input: input.map((r, i) => (i === 0 ? { ...r, vaerdi_json: '1.0' } : r)) }],
    ['ingen bestilling', { bestilling: null as never }], ['bestilling andet scenarie', { bestilling: { scenarie_id: H.ID.reference } }],
    ['intet scenarie', { scenarie: null as never }], ['scenarie andet værk', { scenarie: { vaerk_id: H.ID.tidsserie } }], ['intet værk', { vaerk: null as never }],
    ['forkert revision', { koersel: kv('vaerk_revision', 3) }], ['ingen revisioner', { revisioner: new Map() }], ['ingen tidsserie', { tidsserier: new Set() }],
    ['tidsserie uden sha', { input: input.map((r) => (r.sti.startsWith('_koersel.tidsserie.') ? { ...r, vaerdi_json: '{"id":"x"}' } : r)) }],
];
for (const [n, o] of tjek) {
    const x = { ...basis, ...o };
    await tilføj('arkiv_tjek_koersel', n, x as unknown as Record<string, unknown>, () => { A.tjekKoersel(x as unknown as A.KoerselTjek); return null; });
}

// ------------------------------------------------------------------ forløbet (importerDel) trin for trin

/** Et forløb: start-db, en række (tabel, rækker, forventet?, ødelæg?) der sendes som dele; udfaldet er hvert svar + tabellernes sha bagefter. */
async function forløb(navn: string, start: H.Tabeller, trin: { tabel: A.ImportTabel; raekker: A.Kanonisk[][]; forventet?: Record<string, A.Børnetal>; sha?: string; anmodningVaerk?: string }[]) {
    const mål = H.kopiDb(start);
    const lager = H.hukommelsesLager(mål);
    const startTabeller = Object.fromEntries(Object.entries(start).map(([t, m]) => [t, [...m.values()]]));
    const sendt: unknown[] = [];
    const svar: unknown[] = [];
    for (const [i, t] of trin.entries()) {
        const tekst = A.delTekst({ arkiv: ARKIV, tabel: t.tabel, raekker: t.raekker, forventet: t.forventet });
        const aj = A.importAnmodningJson({ arkiv: ARKIV, sha256: t.sha ?? A.sha256Tekst(tekst), tabel: t.tabel, nr: 1, af: 1,
            koersel_ider: t.tabel === 'Koersel' ? t.raekker.map((r) => r[0] as string) : [], filnavn: 'v.xlsx' });
        const id = `f0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
        mål.Aendringsanmodning.set(id, { id, vaerk_id: t.anmodningVaerk ?? A.NIL_UUID, forventet_revision: 0, aendringer_json: aj, anmodet_af: 'v@example.org', anmodet: '2026-10-28T09:00:00.000Z', status: 'ny', svar: null });
        sendt.push({ anmodning_id: id, aendringer_json: aj, tekst, vaerk_id: t.anmodningVaerk ?? A.NIL_UUID });
        svar.push(await A.importerDel(lager, id, tekst));
    }
    const shas = Object.fromEntries(A.IMPORT_TABELLER.map((t) => [t, A.tabelSha(H.rækkerFra(mål, t))]));
    const status = [...mål.Aendringsanmodning.values()].map((a) => [a.id, a.status, a.svar]);
    (filer.arkiv_importer_del ??= []).push({ navn, input: kod({ start: startTabeller, trin: sendt }), ud: kod({ svar, shas, anmodninger: status }) });
}

function målMedVaerk(kilde: H.Tabeller): H.Tabeller {
    const m = H.tomDb();
    for (const t of ['Vaerk', 'VaerkParameter', 'Aendringslog', 'Tidsserie'] as const) m[t] = new Map([...kilde[t]].map(([k, v]) => [k, { ...v }]));
    return m;
}
const k = H.eksempelDb(4);
const alle = (t: A.ImportTabel) => H.rækkerFra(k, t);
const fv = { [H.ID.koersel]: { KoerselInput: 5, KoerselNoegletal: 2, KoerselMaaned: 2, KoerselTime: 4 } };
const fuld = (A.IMPORT_TABELLER).map((t) => ({ tabel: t, raekker: alle(t), forventet: t === 'Koersel' ? fv : undefined }));
await forløb('fuld import og så igen', målMedVaerk(k), [...fuld, ...fuld]);
await forløb('uden værk', H.tomDb(), fuld.slice(0, 1));
await forløb('konflikt på scenarie', (() => { const m = målMedVaerk(k); m.Scenarie.set(H.ID.scenarie, { ...k.Scenarie.get(H.ID.scenarie)!, navn: 'Rettet' }); return m; })(), fuld.slice(0, 1));
await forløb('kørsel før timerne', målMedVaerk(k), [fuld[0], fuld[1], fuld[2], fuld[3], fuld[4], fuld[5], fuld[7]]);
await forløb('rækker til en kørsel, der findes', målMedVaerk(k), [...fuld, { tabel: 'KoerselTime', raekker: [alle('KoerselTime')[0].map((v, i) => (i === 0 ? '77777777-1111-4111-8111-111111111111' : v))] }]);
await forløb('sha passer ikke', målMedVaerk(k), [{ ...fuld[0], sha: '0'.repeat(64) }]);
await forløb('anmodning med værk', målMedVaerk(k), [{ ...fuld[0], anmodningVaerk: H.ID.vaerk }]);
await forløb('værkets historik mangler', (() => { const m = målMedVaerk(k); m.Aendringslog.clear(); return m; })(), fuld);
await forløb('referencen i delen efter scenariet', målMedVaerk(k), [{ tabel: 'Scenarie', raekker: [...alle('Scenarie')].reverse() }]);

// ------------------------------------------------------------------ skriv

mkdirSync(UD, { recursive: true });
for (const [gruppe, tilfaelde] of Object.entries(filer)) {
    const tekst = JSON.stringify({ _om: `Arkivets vektorer (runde 13), genereret af skema/vektorer/arkiv/generer_arkiv.mts ved at køre TS.`, kilder: kildeHash, tilfaelde }, null, 1);
    writeFileSync(resolve(UD, `${gruppe}.json`), `${tekst}\n`);
}
console.log(Object.entries(filer).map(([g, t]) => `${g}: ${t.length}`).join('\n'));
