//-----------------------------------------------------------------------
// Analyse af én tidsserie (MW pr. interval): dækning og huller, energi pr.
// måned og år, varighedskurve, nedsampling til en graf, og målt mod
// syntetisk varmelast. Måneder og år er DANSKE (Europe/Copenhagen), som
// kørslernes måneder (KONTRAKT §3.9). Energi = MW × intervallets længde.
// Ren logik.
//-----------------------------------------------------------------------

import { SKRIDT_MS, dkDel, dkMidnat, type Serie } from "./serie";

export interface Hul { fraMs: number; tilMs: number; intervaller: number }
/** `mulige` = intervaller i hele den danske kalendermåned/-år; `intervaller` = dem med en værdi i serien. */
export interface Periodesum { nøgle: string; mwh: number; intervaller: number; mulige: number }

export interface Analyse {
    intervaller: number;
    medVærdi: number;
    huller: Hul[];
    hulIntervaller: number;
    dækning: number;
    min: number | null;
    maks: number | null;
    maksMs: number | null;
    middel: number | null;
    mwh: number;
    negative: number;
    nuller: number;
    måneder: Periodesum[];
    år: Periodesum[];
    /** Årsækvivalent benyttelsestid: middel / maks × 8.760 timer (data_krav's benyttelsestid_t). */
    benyttelsestid: number | null;
    /** Årsækvivalent energi: middel × 8.760 (MWh). */
    mwhPrÅr: number | null;
    timerPrInterval: number;
}

export function slutMs(s: Serie): number { return s.startMs + s.værdier.length * SKRIDT_MS[s.opløsning]; }

const nøgleMåned = (ms: number) => { const d = dkDel(ms); return `${d.år}-${String(d.måned).padStart(2, "0")}`; };

export function analyser(s: Serie): Analyse {
    const step = SKRIDT_MS[s.opløsning], h = step / 3_600_000;
    let min: number | null = null, maks: number | null = null, maksMs: number | null = null, sum = 0, n = 0, neg = 0, nul = 0;
    const huller: Hul[] = [];
    const mdr = new Map<string, Periodesum>(), år = new Map<string, Periodesum>();
    let hulStart: number | null = null;
    s.værdier.forEach((v, i) => {
        const ms = s.startMs + i * step;
        const mk = nøgleMåned(ms), åk = mk.slice(0, 4);
        const [y, mo] = [Number(mk.slice(0, 4)), Number(mk.slice(5, 7))];
        const m = mdr.get(mk) ?? { nøgle: mk, mwh: 0, intervaller: 0, mulige: (dkMidnat(y, mo + 1, 1) - dkMidnat(y, mo, 1)) / step };
        const å = år.get(åk) ?? { nøgle: åk, mwh: 0, intervaller: 0, mulige: (dkMidnat(y + 1, 1, 1) - dkMidnat(y, 1, 1)) / step };
        if (v === null) {
            if (hulStart === null) hulStart = i;
        } else {
            if (hulStart !== null) { huller.push({ fraMs: s.startMs + hulStart * step, tilMs: ms, intervaller: i - hulStart }); hulStart = null; }
            n++; sum += v;
            if (v < 0) neg++;
            if (v === 0) nul++;
            if (min === null || v < min) min = v;
            if (maks === null || v > maks) { maks = v; maksMs = ms; }
            m.mwh += v * h; m.intervaller++; å.mwh += v * h; å.intervaller++;
        }
        mdr.set(mk, m); år.set(åk, å);
    });
    const hulIntervaller = huller.reduce((a, x) => a + x.intervaller, 0);
    const mwh = sum * h;
    return {
        intervaller: s.værdier.length, medVærdi: n, huller, hulIntervaller,
        dækning: s.værdier.length ? n / s.værdier.length : 0,
        min, maks, maksMs, middel: n ? sum / n : null, mwh, negative: neg, nuller: nul,
        måneder: [...mdr.values()], år: [...år.values()],
        benyttelsestid: maks && maks > 0 && n ? ((sum / n) / maks) * 8760 : null,
        mwhPrÅr: n ? (sum / n) * 8760 : null,
        timerPrInterval: h,
    };
}

/**
 * Varighedskurve: værdierne sorteret faldende og nedsamplet til højst `punkter` punkter
 * (hvert punkt = værdien ved den andel af tiden; første = maks, sidste = min).
 */
export function varighedskurve(s: Serie, punkter = 200): { andel: number; mw: number }[] {
    const v = s.værdier.filter((x): x is number => x !== null).sort((a, b) => b - a);
    if (v.length === 0) return [];
    const k = Math.min(punkter, v.length);
    return Array.from({ length: k }, (_, i) => {
        const j = k === 1 ? 0 : Math.round((i / (k - 1)) * (v.length - 1));
        return { andel: v.length === 1 ? 0 : j / (v.length - 1), mw: v[j] };
    });
}

export interface Spand { fraMs: number; tilMs: number; min: number | null; maks: number | null; middel: number | null }

/** Nedsampling af [fraMs, tilMs) til højst `spande` spande med min/maks/middel (huller tælles ikke med). */
export function nedsampl(s: Serie, fraMs: number, tilMs: number, spande = 400): Spand[] {
    const step = SKRIDT_MS[s.opløsning];
    const i0 = Math.max(0, Math.floor((fraMs - s.startMs) / step));
    const i1 = Math.min(s.værdier.length, Math.ceil((tilMs - s.startMs) / step));
    if (i1 <= i0) return [];
    const pr = Math.max(1, Math.ceil((i1 - i0) / spande));
    const ud: Spand[] = [];
    for (let a = i0; a < i1; a += pr) {
        const b = Math.min(i1, a + pr);
        let mi: number | null = null, ma: number | null = null, su = 0, c = 0;
        for (let i = a; i < b; i++) {
            const v = s.værdier[i];
            if (v === null) continue;
            if (mi === null || v < mi) mi = v;
            if (ma === null || v > ma) ma = v;
            su += v; c++;
        }
        ud.push({ fraMs: s.startMs + a * step, tilMs: s.startMs + b * step, min: mi, maks: ma, middel: c ? su / c : null });
    }
    return ud;
}

/** Serien som timeværdier (middel af kvartererne; en time med et manglende kvarter er et hul). */
export function tilTimer(s: Serie): Serie {
    if (s.opløsning === "1h") return s;
    const pr = 4;
    const forskyd = ((s.startMs % 3_600_000) + 3_600_000) % 3_600_000 / SKRIDT_MS["15min"];
    const start = s.startMs - forskyd * SKRIDT_MS["15min"];
    const alle = [...new Array(forskyd).fill(null), ...s.værdier];
    const ud: (number | null)[] = [];
    for (let i = 0; i < alle.length; i += pr) {
        const del = alle.slice(i, i + pr);
        ud.push(del.length === pr && del.every((x) => x !== null) ? (del as number[]).reduce((a, b) => a + b, 0) / pr : null);
    }
    return { startMs: start, opløsning: "1h", værdier: ud };
}

export interface Sammenligning {
    timer: number;
    målt_mwh: number;
    syntetisk_mwh: number;
    /** (målt − syntetisk) / syntetisk */
    afvigelse: number | null;
    middelfejl_mw: number;
    rmse_mw: number;
    korrelation: number | null;
    /** målt / syntetisk energi over de fælles timer (data_krav: maalt_mod_syntetisk). */
    forhold: number | null;
    /** Korrelation af døgnmiddel over danske døgn med mindst 20 fælles timer, og antallet af døgn. */
    døgnkorrelation: number | null;
    døgn: number;
    målt_maks: number;
    syntetisk_maks: number;
    måneder: { nøgle: string; målt_mwh: number; syntetisk_mwh: number; timer: number }[];
}

/**
 * Målt mod syntetisk over de timer, begge har en værdi. `syntetisk[i]` gælder timen `synStartMs + i·1h`.
 * Kun timer, der findes i begge, tæller — også i månedssummerne — så de to søjler er sammenlignelige.
 */
export function sammenlign(målt: Serie, synStartMs: number, syntetisk: readonly number[]): Sammenligning | null {
    const m = tilTimer(målt);
    let n = 0, sm = 0, ss = 0, se = 0, se2 = 0, smm = 0, sss = 0, sms = 0, mm = -Infinity, ms = -Infinity;
    const mdr = new Map<string, { nøgle: string; målt_mwh: number; syntetisk_mwh: number; timer: number }>();
    const døgn = new Map<string, [number, number, number]>();
    m.værdier.forEach((v, i) => {
        if (v === null) return;
        const t = m.startMs + i * 3_600_000;
        const j = (t - synStartMs) / 3_600_000;
        if (j < 0 || j >= syntetisk.length) return;
        const y = syntetisk[j];
        n++; sm += v; ss += y; se += v - y; se2 += (v - y) ** 2; smm += v * v; sss += y * y; sms += v * y;
        if (v > mm) mm = v;
        if (y > ms) ms = y;
        const k = nøgleMåned(t);
        const x = mdr.get(k) ?? { nøgle: k, målt_mwh: 0, syntetisk_mwh: 0, timer: 0 };
        x.målt_mwh += v; x.syntetisk_mwh += y; x.timer++;
        mdr.set(k, x);
        const d = dkDel(t), dk = `${d.år}-${d.måned}-${d.dag}`;
        const z = døgn.get(dk) ?? [0, 0, 0];
        z[0] += v; z[1] += y; z[2]++;
        døgn.set(dk, z);
    });
    if (n === 0) return null;
    const kov = sms / n - (sm / n) * (ss / n);
    const vm = smm / n - (sm / n) ** 2, vs = sss / n - (ss / n) ** 2;
    return {
        timer: n, målt_mwh: sm, syntetisk_mwh: ss,
        afvigelse: ss !== 0 ? (sm - ss) / ss : null,
        middelfejl_mw: se / n, rmse_mw: Math.sqrt(se2 / n),
        korrelation: vm > 0 && vs > 0 ? kov / Math.sqrt(vm * vs) : null,
        forhold: ss !== 0 ? sm / ss : null,
        ...døgnkorrelation([...døgn.values()].filter((z) => z[2] >= 20).map((z) => [z[0] / z[2], z[1] / z[2]] as [number, number])),
        målt_maks: mm, syntetisk_maks: ms,
        måneder: [...mdr.values()],
    };
}

/** Middel pr. time på døgnet (UTC, som varmelastmodellens grundprofil), af timeværdierne. */
export function døgnprofil(s: Serie): (number | null)[] {
    const t = tilTimer(s);
    const sum = new Array<number>(24).fill(0), n = new Array<number>(24).fill(0);
    t.værdier.forEach((v, i) => {
        if (v === null) return;
        const h = new Date(t.startMs + i * 3_600_000).getUTCHours();
        sum[h] += v; n[h]++;
    });
    return sum.map((x, h) => (n[h] ? x / n[h] : null));
}

/** Timer med en værdi over 0 i de mørke timer (dansk tid 22–04) — plausibilitet for en solprofil. */
export function natteværdier(s: Serie): { timer: number; mørke: number } {
    const t = tilTimer(s);
    let timer = 0, mørke = 0;
    t.værdier.forEach((v, i) => {
        if (v === null) return;
        const h = dkDel(t.startMs + i * 3_600_000).time;
        if (h >= 22 || h < 4) { mørke++; if (v > 0) timer++; }
    });
    return { timer, mørke };
}

function døgnkorrelation(par: readonly [number, number][]): { døgnkorrelation: number | null; døgn: number } {
    const n = par.length;
    if (n < 2) return { døgnkorrelation: null, døgn: n };
    const mx = par.reduce((a, p) => a + p[0], 0) / n, my = par.reduce((a, p) => a + p[1], 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (const [x, y] of par) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
    return { døgnkorrelation: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null, døgn: n };
}
