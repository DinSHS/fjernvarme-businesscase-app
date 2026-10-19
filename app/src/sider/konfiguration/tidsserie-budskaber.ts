//-----------------------------------------------------------------------
// Budskaber for fanen Tidsserier — én sætning regnet af data pr. kort.
// Ren logik (testet i tidsserie-budskaber.spec.ts).
//-----------------------------------------------------------------------

import type { Analyse, Sammenligning } from "./tidsserie-analyse";
import type { Rolle, TidsserieRække, VaerksarkimportRække } from "./tidsserie-kilde";
import { dkDel } from "./serie";
import { DATAKRAV } from "./datakrav.data";
import { dk, dkFri } from "./vis";

export const ROLLE_NAVN: Record<Rolle, string> = { varmelast: "Varmelast", solprofil: "Solprofil" };
export const KILDE_NAVN: Record<TidsserieRække["kilde"], string> = { csv: "CSV-upload", vaerksark: "Værksark", repo: "Modelrepo" };
export const STATUS_NAVN: Record<TidsserieRække["status"], string> = { validerer: "Validerer", gyldig: "Gyldig", afvist: "Afvist" };

const MÅNEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const MDR_KORT = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."];

/** "2026-02" → "februar 2026" (kort: "feb. 2026"). */
export function månedNavn(nøgle: string, kort = false): string {
    const [å, m] = nøgle.split("-").map(Number);
    return `${(kort ? MDR_KORT : MÅNEDER)[m - 1]} ${å}`;
}

/** Et UTC-tidspunkt som dansk dato og time: "12. jan. 2026 kl. 08". */
export function dkTid(ms: number, medTime = true): string {
    const d = dkDel(ms);
    return `${d.dag}. ${MDR_KORT[d.måned - 1]} ${d.år}${medTime ? ` kl. ${String(d.time).padStart(2, "0")}` : ""}`;
}

/** Energi med passende enhed: 81234 MWh → "81,2 GWh". */
export function energi(mwh: number): string {
    return Math.abs(mwh) >= 10_000 ? `${dk(mwh / 1000, 1)} GWh` : `${dk(mwh, 0)} MWh`;
}

/** Aktive, gyldige serier pr. rolle (en liste: læsevejen skal tåle, at reglen "højst én" er brudt). */
export function aktive(rækker: readonly TidsserieRække[]): Map<Rolle, TidsserieRække[]> {
    const m = new Map<Rolle, TidsserieRække[]>();
    for (const r of rækker) if (r.aktiv && r.status === "gyldig") m.set(r.rolle, [...(m.get(r.rolle) ?? []), r]);
    return m;
}

export function listeBudskab(rækker: readonly TidsserieRække[]): string {
    if (rækker.length === 0) return "Værket har ingen egne tidsserier — varmelasten regnes af varmelastmodellen.";
    const a = aktive(rækker);
    const gyldige = rækker.filter((r) => r.status === "gyldig").length;
    const afviste = rækker.filter((r) => r.status === "afvist").length;
    const del = (rolle: Rolle) => {
        const x = a.get(rolle) ?? [];
        if (x.length > 1) return `${x.length} aktive ${rolle === "varmelast" ? "varmelaster" : "solprofiler"} (højst én er tilladt)`;
        return x.length ? `${rolle} "${x[0].navn}" er aktiv` : `ingen aktiv ${rolle}`;
    };
    return `${rækker.length} ${rækker.length === 1 ? "tidsserie" : "tidsserier"} (${gyldige} ${gyldige === 1 ? "gyldig" : "gyldige"}${afviste ? `, ${afviste} afvist` : ""}): ${del("varmelast")}, ${del("solprofil")}.`;
}

export function dækningBudskab(a: Analyse): string {
    if (a.huller.length === 0) return `Ingen huller i ${dkFri(a.intervaller)} intervaller.`;
    const længst = a.huller.reduce((x, y) => (y.intervaller > x.intervaller ? y : x));
    const t = (n: number) => { const h = n * a.timerPrInterval; return `${dkFri(h)} ${h === 1 ? "time" : "timer"}`; };
    return `${a.huller.length} ${a.huller.length === 1 ? "hul" : "huller"} på i alt ${t(a.hulIntervaller)} (${dk((1 - a.dækning) * 100, 1)} %); det længste er ${t(længst.intervaller)} fra ${dkTid(længst.fraMs)}.`;
}

export function energiBudskab(a: Analyse, rolle: Rolle): string {
    const hele = a.år.filter((å) => å.intervaller === å.mulige);
    const hvad = rolle === "varmelast" ? "Varmeproduktion" : "Solvarme";
    if (hele.length) return `${hvad} ${hele.map((å) => `${å.nøgle}: ${energi(å.mwh)}`).join(", ")}.`;
    const døgn = Math.round((a.intervaller * a.timerPrInterval) / 24);
    return `${hvad} ${energi(a.mwh)} over ${dkFri(døgn)} døgn — ca. ${energi(a.mwhPrÅr ?? 0)} pr. år.`;
}

export function spidsBudskab(a: Analyse): string {
    if (a.maks === null || a.maksMs === null) return "Serien har ingen værdier.";
    return `Højst ${dk(a.maks, 1)} MW (${dkTid(a.maksMs)}); middel ${dk(a.middel, 1)} MW; benyttelsestid ${dkFri(Math.round(a.benyttelsestid ?? 0))} timer om året.`;
}

export function månedBudskab(a: Analyse): string {
    const hele = a.måneder.filter((m) => m.intervaller === m.mulige);
    if (hele.length === 0) return "Ingen hel måned i serien.";
    const maks = hele.reduce((x, y) => (y.mwh > x.mwh ? y : x));
    const min = hele.reduce((x, y) => (y.mwh < x.mwh ? y : x));
    return `Størst i ${månedNavn(maks.nøgle)} (${energi(maks.mwh)}), mindst i ${månedNavn(min.nøgle)} (${energi(min.mwh)}) — hele måneder.`;
}

export function varighedBudskab(punkter: readonly { andel: number; mw: number }[], maks: number | null, timer: number): string {
    if (!punkter.length || !maks) return "Serien har ingen værdier.";
    const over = punkter.filter((p) => p.mw >= maks / 2);
    const andel = over.length ? over[over.length - 1].andel : 0;
    return `Over halvdelen af spidsen (${dk(maks / 2, 1)} MW) i ${dk(andel * 100, 0)} % af tiden — ca. ${dkFri(Math.round(andel * timer))} timer.`;
}

export function døgnBudskab(profil: readonly (number | null)[], rolle: Rolle, nat?: { timer: number; mørke: number }): string {
    const v = profil.map((x, h) => ({ x, h })).filter((p): p is { x: number; h: number } => p.x !== null);
    if (!v.length) return "Ingen værdier.";
    const top = v.reduce((a, b) => (b.x > a.x ? b : a));
    const bund = v.reduce((a, b) => (b.x < a.x ? b : a));
    const kl = (h: number) => `kl. ${String(h).padStart(2, "0")}`;
    const grund = `Højest ${kl(top.h)} UTC (${dk(top.x, 1)} MW), lavest ${kl(bund.h)} UTC (${dk(bund.x, 1)} MW)`;
    if (rolle === "solprofil" && nat) {
        return nat.timer === 0
            ? `${grund}; ingen sol i mørke timer.`
            : `${grund}; ${dkFri(nat.timer)} mørke timer (kl. 22–04 dansk tid) har sol over 0 — tjek tidszonen.`;
    }
    return `${grund}.`;
}

export function sammenligningBudskab(s: Sammenligning): string {
    if (s.afvigelse === null) return "Varmelastmodellen giver 0 i de fælles timer.";
    const retning = s.afvigelse >= 0 ? "over" : "under";
    const måned = s.måneder.filter((m) => m.syntetisk_mwh > 0)
        .map((m) => ({ nøgle: m.nøgle, a: (m.målt_mwh - m.syntetisk_mwh) / m.syntetisk_mwh }))
        .reduce<{ nøgle: string; a: number } | null>((x, y) => (!x || Math.abs(y.a) > Math.abs(x.a) ? y : x), null);
    return `Den målte last er ${dk(Math.abs(s.afvigelse) * 100, 1)} % ${retning} varmelastmodellen over ${dkFri(s.timer)} fælles timer`
        + (måned ? `; størst afvigelse i ${månedNavn(måned.nøgle)} (${måned.a >= 0 ? "+" : "−"}${dk(Math.abs(måned.a) * 100, 0)} %).` : ".");
}

/** Backendens validering_json, tolerant læst: kendte tal + fejl- og advarselslister. */
export interface Valideringsvisning { fejl: string[]; advarsler: string[]; tal: [string, string][] }

/** Nøgletal fra validering_json, i visningsrækkefølge. Andre felter (rolle, ISO-tider, kildekolonner) vises ikke. */
const NØGLETAL: [string, string, (v: number, r: Record<string, unknown>) => string | null][] = [
    ["daekning", "Dækning", (v) => `${dk(v * 100, 1)} %`],
    ["antal_huller", "Huller", (v) => `${dkFri(v)} ${v === 1 ? "time" : "timer"}`],
    ["udfyldte_timer", "Udfyldte timer", (v, r) => (v > 0 ? `${dkFri(v)} (længste hul ${dkFri(Number(r.laengste_hul_timer ?? 0))} timer)` : null)],
    ["min", "Mindste værdi", (v) => `${dk(v, 1)} MW`],
    ["max", "Største værdi", (v) => `${dk(v, 1)} MW`],
    ["maks", "Største værdi", (v) => `${dk(v, 1)} MW`],
    ["middel", "Middel", (v) => `${dk(v, 1)} MW`],
    ["sum_mwh", "Energi i alt", (v) => energi(v)],
    ["aarssum_gwh", "Pr. år", (v) => energi(v * 1000)],
    ["aarssum_mwh", "Årssum", (v) => energi(v)],
    ["benyttelsestid_t", "Benyttelsestid", (v) => `${dkFri(v)} timer/år`],
    ["sol_tyngdepunkt_time_utc", "Solens tyngdepunkt", (v) => `kl. ${dk(v, 2)} UTC`],
];

function tekster(v: unknown): string[] {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) return [typeof v === "string" ? v : JSON.stringify(v)];
    return v.map((x) => (typeof x === "string" ? x : x && typeof x === "object" && "besked" in x ? String((x as { besked: unknown }).besked) : JSON.stringify(x)));
}

export function læsValidering(json: string | null | undefined): Valideringsvisning | null {
    if (!json) return null;
    let o: unknown;
    try { o = JSON.parse(json); } catch { return { fejl: [], advarsler: [], tal: [["Validering", json]] }; }
    if (!o || typeof o !== "object" || Array.isArray(o)) return { fejl: [], advarsler: [], tal: [["Validering", json]] };
    const r = o as Record<string, unknown>;
    const tal: [string, string][] = [];
    for (const [k, navn, vis] of NØGLETAL) {
        const v = r[k];
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        const tekst = vis(v, r);
        if (tekst !== null) tal.push([navn, tekst]);
    }
    if (Array.isArray(r.fund)) {
        const af = (niveau: string) => (r.fund as Record<string, unknown>[]).filter((f) => f && f.niveau === niveau).map((f) => String(f.besked ?? f.tekst ?? f.kode ?? ""));
        return { fejl: af("fejl"), advarsler: af("advarsel"), tal };
    }
    return { fejl: tekster(r.fejl), advarsler: [...tekster(r.advarsler), ...tekster(r.advarsel)], tal };
}

/** Værksark-kortets budskab ud fra den seneste import. */
export function vaerksarkBudskab(i: VaerksarkimportRække, vaerker: readonly { id: string; kode: string; navn: string }[]): string {
    const v = vaerker.find((x) => x.id === i.vaerk_id);
    switch (i.status) {
        case "faerdig": return `Seneste import (${i.filnavn}) er færdig${v ? `: værket ${v.navn} er oprettet` : ""}${i.tidsserie_id ? " med en tidsserie" : ""}.`;
        case "fejl": return `Seneste import (${i.filnavn}) fejlede — se loggen nedenfor.`;
        case "koerer": return `${i.filnavn} importeres nu.`;
        default: return `${i.filnavn} venter på at blive importeret.`;
    }
}

/**
 * data_krav-reglen maalt_mod_syntetisk (niveau advarsel, "visning"): energiforhold uden for grænserne eller
 * døgnkorrelation under minimum. Beskeden er data_krav's egen med tallene sat ind.
 */
export function maaltModSyntetiskFund(s: Sammenligning): { niveau: "advarsel"; kode: "maalt_mod_syntetisk"; besked: string } | null {
    const [lo, hi] = DATAKRAV.graenser.maalt_mod_syntetisk_forhold;
    const kmin = DATAKRAV.graenser.maalt_mod_syntetisk_korrelation_min;
    const ude = s.forhold !== null && (s.forhold < lo || s.forhold > hi);
    const lav = s.døgnkorrelation !== null && s.døgnkorrelation < kmin;
    if (!ude && !lav) return null;
    const besked = DATAKRAV.regler.maalt_mod_syntetisk.besked
        .replace("{forhold}", dk(s.forhold, 2)).replace("{korrelation}", dk(s.døgnkorrelation, 2));
    return { niveau: "advarsel", kode: "maalt_mod_syntetisk", besked };
}
