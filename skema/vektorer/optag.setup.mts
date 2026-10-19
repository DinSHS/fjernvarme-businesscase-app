//-----------------------------------------------------------------------
// Optager hvert kald, TS-testene (app/rayfin/functions/test/*.spec.ts) laver til den betroede logiks rene
// funktioner — input og TS' faktiske udfald — så de håndskrevne testtilfælde også binder Python-porten.
// Bruges kun af skema/vektorer/udtraek.mjs (vitest-setupfil med globals; ingen import fra 'vitest', fordi
// filen ligger uden for app/node_modules). Modulerne erstattes af sig selv med indpakkede funktioner;
// kald INDE i et modul går uden om indpakningen, så kun testens egne kald optages.
//-----------------------------------------------------------------------

declare const vi: { mock: (sti: string, f: (orig: () => Promise<Record<string, unknown>>) => unknown) => void };
declare const afterAll: (f: () => unknown) => void;
declare const expect: { getState: () => { currentTestName?: string; testPath?: string } };

type Optagelse = { modul: string; funktion: string; test: string; fil: string; args: unknown[]; udfald: Record<string, unknown> };
const g = globalThis as unknown as { __fjvOptag?: Optagelse[]; __fjvIndpak?: (m: string, o: Record<string, unknown>) => Promise<Record<string, unknown>> };
g.__fjvOptag ??= [];

// Samme kodning som generer.mts (kod), plus filgenkendelse i udtraek.mjs.
g.__fjvIndpak = async (modul, orig) => {
    // Undtagelsesklasserne kendes på konstruktørens navn: at importere det andet (også indpakkede) modul her
    // ville låse to fabrikker, der venter på hinanden.
    const klasse = (e: unknown) => (e && typeof e === 'object' ? (e as object).constructor?.name : undefined);
    // `forfædre` = kun objekterne på vejen ned til v. Et objekt, der bruges TO gange (fx samme blad i to dele —
    // præcis det, en dublet-test gør), er ikke en kreds og skal kodes begge gange.
    const kod = (v: unknown, forfædre: object[] = []): unknown => {
        if (typeof v === 'number') {
            if (Object.is(v, -0)) return { $tal: '-0' };
            if (!Number.isFinite(v)) return { $tal: String(v) };
            return v;
        }
        if (v instanceof Uint8Array) return { $bytes: Buffer.from(v).toString('base64') };
        if (v && typeof v === 'object') {
            if (forfædre.includes(v)) throw new Error('kredsløb i et optaget argument');
            const f = [...forfædre, v];
            if (Array.isArray(v)) return v.map((x) => kod(x, f));
            if (v instanceof Map) return { $map: [...v.entries()].map(([k, x]) => [k, kod(x, f)]) };
            return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, kod(x, f)]));
        }
        return v;
    };
    const ud: Record<string, unknown> = {};
    for (const [navn, f] of Object.entries(orig)) {
        // Kun almindelige funktioner (ikke klasser som Afvisning/ForLangRække, så instanceof stadig virker).
        if (typeof f !== 'function' || /^[A-Z]/.test(navn) || /^class\b/.test(Function.prototype.toString.call(f))) { ud[navn] = f; continue; }
        ud[navn] = function (this: unknown, ...args: unknown[]) {
            const s = expect.getState();
            const rec: Optagelse = { modul, funktion: navn, test: s.currentTestName ?? '', fil: (s.testPath ?? '').replace(/\\/g, '/').split('/').pop() ?? '', args: kod(args) as unknown[], udfald: {} };
            g.__fjvOptag!.push(rec);
            try {
                const r = (f as (...a: unknown[]) => unknown).apply(this, args);
                if (r && typeof (r as Promise<unknown>).then === 'function') { rec.udfald = { asynkron: true }; return r; }
                rec.udfald = { ud: kod(r) };
                return r;
            } catch (e) {
                if (klasse(e) === 'Afvisning') rec.udfald = { afvisning: (e as Error).message };
                else if (klasse(e) === 'ForLangRække') rec.udfald = { fejl: e.message, fejltype: 'ForLangRække', positioner: (e as unknown as { positioner: number }).positioner };
                else rec.udfald = { fejl: (e as Error).message, fejltype: (e as Error).name };
                throw e;
            }
        };
    }
    return ud;
};

vi.mock('../../app/rayfin/functions/src/logik.ts', async (orig) => (globalThis as typeof g).__fjvIndpak!('logik', await orig()));
vi.mock('../../app/rayfin/functions/src/tidsserie.ts', async (orig) => (globalThis as typeof g).__fjvIndpak!('tidsserie', await orig()));
vi.mock('../../app/rayfin/functions/src/zip.ts', async (orig) => (globalThis as typeof g).__fjvIndpak!('zip', await orig()));
vi.mock('../../app/rayfin/functions/src/frysning.ts', async (orig) => (globalThis as typeof g).__fjvIndpak!('frysning', await orig()));

afterAll(async () => {
    const { appendFileSync } = await import('node:fs');
    const ud = process.env.FJV_OPTAG;
    if (!ud) throw new Error('FJV_OPTAG mangler (kør via skema/vektorer/udtraek.mjs)');
    for (const r of g.__fjvOptag!.splice(0)) appendFileSync(ud, JSON.stringify(r) + '\n', 'utf8');
});
