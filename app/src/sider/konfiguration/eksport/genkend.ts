//-----------------------------------------------------------------------
// Genupload af et eksporteret ark (runde 12): hvad brugeren har ændret.
//
// Arket og basis (appens nye eksport af værkets revision) læses som
// modelscriptet læser dem — enheder og tanke på navnet, prisposter på
// etiketten i kolonne A, timer på tidsstemplet — så en flyttet eller
// indsat række ikke ligner en ændring. Forskellen vises før bekræftelse
// med appens etiketter. Det er en VISNING: den gemte revision er det,
// modelscriptet selv læser forskelligt i de to ark (fjv.revision).
//
// Codex K11 F5: felter, modelscriptet kun bruger til konverteringens egne
// felter (eller slet ikke), gemmes aldrig ved genupload — fx årsproduktionen
// i Timedata!B3, der kun skalerer den syntetiske varmelast (heat_load_params).
// De markeres "gemmes ikke" før bekræftelse, og består ændringen kun af dem,
// tilbydes ingen revision. Importen siger det samme (fjv.revision.IKKE_GEMT).
//-----------------------------------------------------------------------

import { findFelt } from "../katalog";
import { fraExcelSerie, læsCeller } from "./xlsx";
import { læsMarkering, type Markering } from "./eksporter";

type V = number | string;
type Celler = Map<string, V>;

export interface Arkmodel {
    enheder: Map<string, Map<string, V>>;
    tanke: Map<string, Map<string, V>>;
    vp: Map<string, V>;                         // "navn @ temp" -> "varme / el"
    poster: Map<string, V>;                      // Priser: etiket (+ " · sommer") -> værdi
    timedata: Map<number, number>;
    solvarme: Map<number, number>;
    felter: Map<string, V>;                      // enkeltceller (tidszone, årsproduktion)
}

/**
 * Regnearkets præcision: Excel gemmer højst 15 betydende cifre, så en målt værdi som 4.6000000000000005 kommer
 * tilbage som en anden double, selv om cellen ikke er rørt. Forskelle afgøres med 15 cifre (som fjv.revision).
 */
const p15 = (v: V | undefined) => (typeof v === "number" ? Number(v.toPrecision(15)) : v);
const lig = (a: V | undefined, b: V | undefined) => a === b || p15(a) === p15(b);

const norm = (v: V | undefined) => (typeof v === "string" ? v.split(/\s+/).join(" ").trim().toLowerCase() : "");

/** Kolonnerne i Anlaeg (række 4) -> den værkssti, cellen bærer (til appens etiket). */
const ENHED_KOL: Record<string, { sti?: string; navn: string }> = {
    B: { sti: "units.*.type", navn: "type" }, C: { sti: "units.*.p_max_heat", navn: "maks varme (MW)" },
    D: { sti: "units.*.p_min_heat", navn: "min varme (MW)" }, E: { sti: "units.*.eta_fuel_to_heat", navn: "varme virkningsgrad" },
    F: { navn: "COP ved 0 °C" }, G: { navn: "elvirkningsgrad" }, H: { sti: "units.*.var_om", navn: "D&V (kr/MWh)" },
    I: { sti: "units.*.start_cost", navn: "startomkostning (kr)" }, J: { sti: "units.*.min_uptime", navn: "min driftstid (t)" },
    K: { sti: "units.*.min_downtime", navn: "min stoptid (t)" }, L: { navn: "kan byde i balancemarked" },
    M: { navn: "solvarme: årsproduktion (GWh)" }, N: { sti: "units.*.fuel", navn: "brændsel" },
};
const TANK_KOL: Record<string, { sti?: string; navn: string }> = {
    B: { sti: "storage.*.volume_m3", navn: "volumen (m³)" }, C: { sti: "storage.*.e_max_mwh", navn: "maks fyldning (MWh)" },
    D: { sti: "storage.*.p_max_charge_mw", navn: "maks ladeeffekt (MW)" }, E: { sti: "storage.*.p_max_discharge_mw", navn: "maks afladeeffekt (MW)" },
};

const etiket = (k: { sti?: string; navn: string }) => (k.sti ? findFelt(k.sti)?.etiket : undefined) ?? k.navn;

function rækkeMed(c: Celler, tekst: string, efter = 0, praefiks = false): number | null {
    for (let r = efter + 1; r <= 400; r++) {
        const v = norm(c.get(`A${r}`));
        if (v && (v === tekst || (praefiks && v.startsWith(tekst)))) return r;
    }
    return null;
}

function tidsserie(c: Celler | undefined, fra: number): Map<number, number> {
    const ud = new Map<number, number>();
    if (!c) return ud;
    let maks = 0;
    for (const k of c.keys()) { const m = /^[AB](\d+)$/.exec(k); if (m) maks = Math.max(maks, Number(m[1])); }
    for (let r = fra; r <= maks; r++) {
        const t = c.get(`A${r}`), v = c.get(`B${r}`);
        if (typeof t === "number" && typeof v === "number") ud.set(fraExcelSerie(t), v);
    }
    return ud;
}

/** Arket som modelscriptet læser det (ikke valideret — det gør scriptet ved importen). */
const AARSPRODUKTION = "Timedata: årsproduktion (GWh)";

export function læsArkmodel(ark: Map<string, Celler>): Arkmodel {
    const m: Arkmodel = { enheder: new Map(), tanke: new Map(), vp: new Map(), poster: new Map(), timedata: new Map(), solvarme: new Map(), felter: new Map() };
    const an = ark.get("Anlaeg") ?? new Map();
    const hr = rækkeMed(an, "navn");
    if (hr) {
        const slut = rækkeMed(an, "lovlige værdier", hr, true) ?? hr + 20;
        for (let r = hr + 1; r < slut; r++) {
            const navn = an.get(`A${r}`), type = an.get(`B${r}`);
            if (navn === undefined || type === undefined) continue;
            const felter = new Map<string, V>();
            for (const k of Object.keys(ENHED_KOL)) { const v = an.get(`${k}${r}`); if (v !== undefined) felter.set(k, v); }
            m.enheder.set(String(navn), felter);
        }
    }
    const th = rækkeMed(an, "tank");
    if (th) {
        for (let r = th + 1; r <= th + 6; r++) {
            const navn = an.get(`A${r}`);
            if (navn === undefined || an.get(`B${r}`) === undefined) continue;
            const felter = new Map<string, V>();
            for (const k of Object.keys(TANK_KOL)) { const v = an.get(`${k}${r}`); if (v !== undefined) felter.set(k, v); }
            m.tanke.set(String(navn), felter);
        }
    }
    const vp = ark.get("Varmepumpe") ?? new Map();
    for (let r = 6; r <= 24; r++) {
        const n = vp.get(`A${r}`), t = vp.get(`B${r}`);
        if (n === undefined || t === undefined) continue;
        m.vp.set(`${n} ved ${p15(t)} °C`, `${p15(vp.get(`C${r}`)) ?? "–"} MW varme / ${p15(vp.get(`D${r}`)) ?? "–"} MW el`);
    }
    const pr = ark.get("Priser") ?? new Map();
    for (let r = 1; r <= 200; r++) {
        const a = pr.get(`A${r}`);
        if (typeof a !== "string" || !a.trim()) continue;
        const b = pr.get(`B${r}`), c = pr.get(`C${r}`);
        if (b !== undefined && !/^(pris|kr\/mwh|vinter|værdi)/i.test(String(b))) m.poster.set(a.trim(), b);
        if (typeof c === "number") m.poster.set(`${a.trim()} · sommer`, c);
    }
    const td = ark.get("Timedata") ?? new Map();
    for (const [ref, navn] of [["B2", "Timedata: tidszone"], ["B3", AARSPRODUKTION]] as const) {
        const v = td.get(ref);
        if (v !== undefined) m.felter.set(navn, v);
    }
    m.timedata = tidsserie(td, 6);
    const sv = ark.get("Solvarme");
    if (sv) {
        const hr2 = rækkeMed(sv, "tidsstempel") ?? 5;
        m.solvarme = tidsserie(sv, hr2 + 1);
        const tz = sv.get("B2");
        if (tz !== undefined) m.felter.set("Solvarme: tidszone", tz);
    }
    return m;
}

export interface Ændring { hvor: string; felt: string; før: string; nu: string; /** Sat, når ændringen ikke gemmes ved genupload (K11 F5). */ gemmesIkke?: string }
export interface Serieændring { rolle: "varmelast" | "solprofil"; ændret: number; tilføjet: number; fjernet: number; sumFør: number; sumNu: number }
/** `tom` = intet ændret; `gemmes` = antal ændringer, en revision ville gemme (felter, der gemmes, + serier). */
export interface Forskel { felter: Ændring[]; serier: Serieændring[]; tom: boolean; gemmes: number }

/** Hvorfor et felt i arket ikke gemmes ved genupload — samme semantik som importen (fjv.revision.IKKE_GEMT). */
export const GEMMES_IKKE = {
    aarsproduktion: "Årsproduktionen i Timedata!B3 bruger modelscriptet kun til at skalere den syntetiske varmelast (heat_load_params), og den gemmes ikke ved genupload. Ret værkets varmelast i appen, eller upload en målt varmelast under Tidsserier.",
    navn: "Værkets navn ændres ikke ved genupload — omdøb værket i appen.",
    solGwh: "Solvarmens årsproduktion i Anlaeg bruges ikke af modelscriptet, når arket Solvarme har timeværdierne. Ret timerne i arket Solvarme i stedet.",
    cop: "COP ved 0 °C bruges ikke af modelscriptet, når varmepumpen har målepunkter i arket Varmepumpe. Ret målepunkterne i stedet.",
} as const;

const vis = (v: V | undefined) => (v === undefined ? "–" : typeof v === "number" ? v.toLocaleString("da-DK", { maximumFractionDigits: 6 }) : v);

function sammenlignFelter(hvor: string, a: Map<string, V> | undefined, b: Map<string, V> | undefined, kol: Record<string, { sti?: string; navn: string }>, ud: Ændring[],
    gemmesIkke: (kolonne: string) => string | undefined = () => undefined) {
    if (!a && b) { ud.push({ hvor, felt: "enhed/tank", før: "–", nu: "tilføjet" }); return; }
    if (a && !b) { ud.push({ hvor, felt: "enhed/tank", før: "findes", nu: "fjernet" }); return; }
    for (const k of Object.keys(kol)) {
        const x = a!.get(k), y = b!.get(k);
        const g = gemmesIkke(k);
        if (!lig(x, y)) ud.push({ hvor, felt: etiket(kol[k]), før: vis(x), nu: vis(y), ...(g ? { gemmesIkke: g } : {}) });
    }
}

function serie(rolle: Serieændring["rolle"], a: Map<number, number>, b: Map<number, number>): Serieændring | null {
    let ændret = 0, tilføjet = 0, fjernet = 0;
    for (const [t, v] of b) { const x = a.get(t); if (x === undefined) tilføjet++; else if (!lig(x, v)) ændret++; }
    for (const t of a.keys()) if (!b.has(t)) fjernet++;
    if (!ændret && !tilføjet && !fjernet) return null;
    const sum = (m: Map<number, number>) => [...m.values()].reduce((s, v) => s + v, 0) / 1000;
    return { rolle, ændret, tilføjet, fjernet, sumFør: sum(a), sumNu: sum(b) };
}

/** Brugerens ændringer: arket mod basis. */
export function sammenlign(basis: Arkmodel, ark: Arkmodel): Forskel {
    const felter: Ændring[] = [];
    const harSolark = basis.solvarme.size > 0 || ark.solvarme.size > 0;
    const vpNavne = new Set([...ark.vp.keys()].map((k) => k.slice(0, k.lastIndexOf(" ved "))));
    for (const n of new Set([...basis.enheder.keys(), ...ark.enheder.keys()])) {
        sammenlignFelter(`Enhed ${n}`, basis.enheder.get(n), ark.enheder.get(n), ENHED_KOL, felter,
            (k) => (k === "M" && harSolark ? GEMMES_IKKE.solGwh : k === "F" && vpNavne.has(n) ? GEMMES_IKKE.cop : undefined));
    }
    for (const n of new Set([...basis.tanke.keys(), ...ark.tanke.keys()])) sammenlignFelter(`Tank ${n}`, basis.tanke.get(n), ark.tanke.get(n), TANK_KOL, felter);
    for (const n of new Set([...basis.vp.keys(), ...ark.vp.keys()])) {
        const x = basis.vp.get(n), y = ark.vp.get(n);
        if (x !== y) felter.push({ hvor: "Varmepumpe", felt: n, før: vis(x), nu: vis(y) });
    }
    for (const n of new Set([...basis.poster.keys(), ...ark.poster.keys()])) {
        const x = basis.poster.get(n), y = ark.poster.get(n);
        if (!lig(x, y)) felter.push({ hvor: "Priser", felt: n, før: vis(x), nu: vis(y), ...(norm(n) === "værkets navn" ? { gemmesIkke: GEMMES_IKKE.navn } : {}) });
    }
    for (const n of new Set([...basis.felter.keys(), ...ark.felter.keys()])) {
        const x = basis.felter.get(n), y = ark.felter.get(n);
        if (!lig(x, y)) felter.push({ hvor: "Timedata", felt: n, før: vis(x), nu: vis(y), ...(n === AARSPRODUKTION ? { gemmesIkke: GEMMES_IKKE.aarsproduktion } : {}) });
    }
    const serier = [serie("varmelast", basis.timedata, ark.timedata), serie("solprofil", basis.solvarme, ark.solvarme)].filter((x): x is Serieændring => !!x);
    const gemmes = felter.filter((x) => !x.gemmesIkke).length + serier.length;
    return { felter, serier, tom: felter.length === 0 && serier.length === 0, gemmes };
}

export interface Genkendt { markering: Markering | null; model: Arkmodel; celler: Map<string, Celler> }

/** Et uploadet ark: markeringen (`_app`) og arket som model. */
export function genkend(bytes: Uint8Array): Genkendt {
    const celler = læsCeller(bytes);
    return { markering: læsMarkering(celler), model: læsArkmodel(celler), celler };
}

