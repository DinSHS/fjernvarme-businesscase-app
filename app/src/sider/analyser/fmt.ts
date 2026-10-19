//-----------------------------------------------------------------------
// Talformater kun Analyser bruger (decimaler, energi, fortegn). Heltal og kr.
// kommer fra @/lib/format; her er det, der mangler dér. Alt er da-DK.
//-----------------------------------------------------------------------

import { tal } from "@/lib/format";

const cache = new Map<number, Intl.NumberFormat>();
function nf(d: number): Intl.NumberFormat {
    let f = cache.get(d);
    if (!f) {
        f = new Intl.NumberFormat("da-DK", { minimumFractionDigits: d, maximumFractionDigits: d });
        cache.set(d, f);
    }
    return f;
}

/** Fast antal decimaler, fx dec(1234.5, 1) → "1.234,5". */
export function dec(v: number, d: number): string {
    return nf(d).format(v);
}

/** "–" for et tal der ikke findes (null = ikke tilgængelig, aldrig 0). */
export function ellers(v: number | null | undefined, f: (x: number) => string): string {
    return v == null || Number.isNaN(v) ? "–" : f(v);
}

/** Energi i MWh med enhed; ≥ 10.000 MWh vises som GWh. */
export function energi(mwh: number): string {
    return Math.abs(mwh) >= 10_000 ? `${dec(mwh / 1000, 1)} GWh` : `${tal(mwh)} MWh`;
}

/** Fortegn med ægte minus: +1.234 / −1.234 / 0. */
export function medFortegn(v: number, f: (x: number) => string = tal): string {
    const s = f(Math.abs(v));
    if (s === f(0)) return s;
    return (v > 0 ? "+" : "−") + s;
}

/** Procentpoint/procent fra en procentværdi (ikke brøk): 48.1 → "48,1 %". */
export function pctVaerdi(v: number, d = 1): string {
    return `${dec(v, d)} %`;
}

/** Relativt gab (brøk) som procent med op til 3 decimaler: 0.000501 → "0,050 %". */
export function gabPct(v: number): string {
    return `${dec(v * 100, v * 100 < 0.1 ? 3 : 2)} %`;
}

/** Varighed i sekunder: 64 → "1 min 4 s"; 3725 → "1 t 2 min". */
export function varighed(sek: number): string {
    if (sek < 10) return `${dec(Math.max(0, sek), 1)} s`;
    const s = Math.round(sek);
    if (s < 60) return `${s} s`;
    const t = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (t > 0) return `${t} t ${m} min`;
    return `${m} min ${s % 60} s`;
}

const MÅNEDER = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."];
const MÅNEDER_LANG = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

/** "2026-01" → "jan. 2026" (læst af strengen, ingen tidszone). */
export function maanedKort(m: string): string {
    const r = /^(\d{4})-(\d{2})$/.exec(m);
    return r ? `${MÅNEDER[Number(r[2]) - 1]} ${r[1]}` : m;
}

/** "2026-01" → "januar 2026". */
export function maanedLang(m: string): string {
    const r = /^(\d{4})-(\d{2})$/.exec(m);
    return r ? `${MÅNEDER_LANG[Number(r[2]) - 1]} ${r[1]}` : m;
}

/** ISO-dato "2026-01-05" → "5. jan. 2026" (læst af strengen). */
export function datoKort(iso: string | null | undefined): string {
    const r = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
    return r ? `${Number(r[3])}. ${MÅNEDER[Number(r[2]) - 1]} ${r[1]}` : "–";
}

/** Periode "5. jan.–16. jan. 2026" (samme år samles). */
export function periodeTekst(start: string | null | undefined, slut: string | null | undefined): string {
    if (!start || !slut) return "værkets egen periode";
    const a = datoKort(start), b = datoKort(slut);
    if (start.slice(0, 4) === slut.slice(0, 4)) return `${a.replace(/ \d{4}$/, "")}–${b}`;
    return `${a}–${b}`;
}

// ---------------------------------------------------------------- dansk tid

const DK = "Europe/Copenhagen";
const dkTime = new Intl.DateTimeFormat("da-DK", { timeZone: DK, day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dkDag = new Intl.DateTimeFormat("da-DK", { timeZone: DK, weekday: "short", day: "numeric", month: "numeric" });

/** Intervallets start i dansk tid, fx "5.1.2026 02.00". */
export function dkTidspunkt(d: Date): string {
    return dkTime.format(d);
}

/** Akse-etiket for et døgn i dansk tid, fx "man. 5.1.". */
export function dkDagEtiket(d: Date): string {
    return dkDag.format(d);
}
