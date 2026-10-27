//-----------------------------------------------------------------------
// Analysernes regnelogik — rene funktioner, testet i beregn.spec.ts.
//
// Reglerne der bærer siderne (KONTRAKT §3.8–3.10, §6b; måleregisteret):
//  * Totaler for en periode læses af `periode`-rækken — summér ALDRIG viste
//    månedsceller (de er afledte; summen er ikke kanonisk).
//  * Fuldlasttimer = MWh / nominel MW. Modellens "fuldlasttimer" er antal
//    driftsintervaller og bruges ikke.
//  * Et objektiv har en usikkerhed: det absolutte gab. To kørsler kan kun
//    skelnes, når |Δ| er større end summen af de to gab.
//  * To kørsler er direkte sammenlignelige, når værk, periode, opløsning,
//    data-/modelcommit og ønsket gab er ens.
//-----------------------------------------------------------------------

import type { FjvSchema } from "../../../rayfin/data/schema";
import { KOERSEL_PRAEFIKS, effektivtInput, type InputRække } from "@/lib/data/afflad";
import { tal } from "@/lib/format";
import { ENHEDSTYPER, FELTER, FORBRUGSMODREGNING_VERSIONER, REGISTER } from "./etiketter.data";
import { dec, gabPct, periodeTekst } from "./fmt";

export type Koersel = FjvSchema["Koersel"];
export type Noegletal = FjvSchema["KoerselNoegletal"];
export type Maaned = FjvSchema["KoerselMaaned"];
export type Time = FjvSchema["KoerselTime"];
export type Scenarie = FjvSchema["Scenarie"];

const tom = (v: unknown): v is null | undefined => v === null || v === undefined;

// ================================================================= nøgletal

export interface EnhedTal {
    navn: string;
    p_max_mw: number | null;
    produktion_mwh: number | null;
    andel_pct: number | null;
    kapacitetsfaktor_pct: number | null;
    driftsintervaller: number | null;
    driftstimer: number | null;
    /** Beregnet her: produktion_mwh / p_max_mw (null når p_max er 0 eller mangler). */
    fuldlasttimer: number | null;
}

export interface LagerTal {
    navn: string;
    opladet_mwh: number | null;
    afladet_mwh: number | null;
    niveau_start_mwh: number | null;
    niveau_slut_mwh: number | null;
    niveau_max_mwh: number | null;
}

/**
 * Balancebeløb for ét marked (eller i alt) for HELE perioden. Netto/brutto fra
 * manifestet; produkterne (kapacitet, aktivering netto/brutto, sparet elkøb) fra
 * måleregister v3 (`objekt = null` = summen over enheder, regnet af notebooken på
 * uafrundede tal). Kørsler publiceret før v3 har produkterne = null.
 */
export interface MarkedBeløb {
    netto: number | null;
    brutto: number | null;
    kapacitet: number | null;
    aktivering_netto: number | null;
    sparet_elkoeb: number | null;
    aktivering_brutto: number | null;
}
export interface Balance {
    afrr: MarkedBeløb; mfrr: MarkedBeløb; i_alt: MarkedBeløb;
    /** Har kørslen fordelingen på kapacitet og aktivering for hele perioden (register v3)? */
    harProdukter: boolean;
}

export interface Samlet {
    objektiv_dkk: number | null;
    varmebehov_mwh: number | null;
    produktion_mwh: number | null;
    nettab_mwh: number | null;
    nettab_pct: number | null;
    co2_ton: number | null;
    /** Samlet elforbrug (MWh el), registerets i_alt-række for el.forbrug_mwh. */
    el_forbrug_mwh: number | null;
    /** El-poster i alt (i_alt-rækken, kr.) til omkostningsvandfaldet (app/docs/ibcs/analyser-sammenlign v1). Valgfri: ældre kørsler/fixtures. */
    el_omkostning_dkk?: number | null;
    el_salg_dkk?: number | null;
    el_produktionstarif_dkk?: number | null;
    /** null = ikke tilgængelig (MILP har ingen skyggepriser) — ALDRIG 0. */
    tank_arbitrage_dkk: number | null;
    enheder: EnhedTal[];
    lagre: LagerTal[];
    /** null når kørslen ikke har balancetal (kørt uden balancemarked). */
    balance: Balance | null;
}

/** Fuldlasttimer = MWh / nominel MW. */
export function fuldlasttimer(produktion_mwh: number | null | undefined, p_max_mw: number | null | undefined): number | null {
    if (tom(produktion_mwh) || tom(p_max_mw) || p_max_mw <= 0) return null;
    return produktion_mwh / p_max_mw;
}

/** Samler nøgletalsrækkerne (KoerselNoegletal) til en læsbar struktur. */
export function samlNoegletal(rækker: readonly Noegletal[]): Samlet {
    const v = (gruppe: string, noegle: string, objekt: string | null = null, marked: string | null = null): number | null => {
        const r = rækker.find((x) => x.gruppe === gruppe && x.noegle === noegle
            && (x.objekt ?? null) === objekt && (x.marked ?? null) === marked);
        return r && !tom(r.vaerdi) ? r.vaerdi : null;
    };
    const objekter = (gruppe: string) => [...new Set(rækker.filter((x) => x.gruppe === gruppe && x.objekt).map((x) => x.objekt!))];

    const enheder = objekter("enhed").map((navn): EnhedTal => {
        const produktion = v("enhed", "produktion_mwh", navn);
        const pmax = v("enhed", "p_max_mw", navn);
        return {
            navn, p_max_mw: pmax, produktion_mwh: produktion,
            andel_pct: v("enhed", "andel_pct", navn),
            kapacitetsfaktor_pct: v("enhed", "kapacitetsfaktor_pct", navn),
            driftsintervaller: v("enhed", "driftsintervaller", navn),
            driftstimer: v("enhed", "driftstimer", navn),
            fuldlasttimer: fuldlasttimer(produktion, pmax),
        };
    }).sort((a, b) => (b.produktion_mwh ?? 0) - (a.produktion_mwh ?? 0) || a.navn.localeCompare(b.navn));

    const lagre = objekter("lager").map((navn): LagerTal => ({
        navn,
        opladet_mwh: v("lager", "opladet_mwh", navn),
        afladet_mwh: v("lager", "afladet_mwh", navn),
        niveau_start_mwh: v("lager", "niveau_start_mwh", navn),
        niveau_slut_mwh: v("lager", "niveau_slut_mwh", navn),
        niveau_max_mwh: v("lager", "niveau_max_mwh", navn),
    })).sort((a, b) => a.navn.localeCompare(b.navn));

    const beløb = (marked: string): MarkedBeløb => ({
        netto: v("balancering", "netto_dkk", null, marked), brutto: v("balancering", "brutto_dkk", null, marked),
        kapacitet: v("balancering", "kapacitetsindtaegt_dkk", null, marked),
        aktivering_netto: v("balancering", "aktivering_netto_dkk", null, marked),
        sparet_elkoeb: v("balancering", "forbrugsmodregning_dkk", null, marked),
        aktivering_brutto: v("balancering", "aktivering_brutto_dkk", null, marked),
    });
    const afrr = beløb("afrr"), mfrr = beløb("mfrr");
    // "I alt" over markeder: netto/brutto fra manifestet; produkterne er aFRR + mFRR af de uafrundede
    // databaseværdier (registeret har ingen række på tværs af markeder). Mangler ét marked, er summen null.
    const sum = (x: number | null, y: number | null) => (x === null || y === null ? null : x + y);
    const i_alt: MarkedBeløb = {
        netto: v("balancering", "netto_dkk", null, null), brutto: v("balancering", "brutto_dkk", null, null),
        kapacitet: sum(afrr.kapacitet, mfrr.kapacitet), aktivering_netto: sum(afrr.aktivering_netto, mfrr.aktivering_netto),
        sparet_elkoeb: sum(afrr.sparet_elkoeb, mfrr.sparet_elkoeb), aktivering_brutto: sum(afrr.aktivering_brutto, mfrr.aktivering_brutto),
    };
    const harProdukter = [afrr, mfrr].some((b) => b.kapacitet !== null || b.aktivering_netto !== null);
    const balance: Balance = { afrr, mfrr, i_alt, harProdukter };
    const harBalance = [afrr, mfrr, i_alt].some((b) => b.netto !== null || b.brutto !== null) || harProdukter;

    return {
        objektiv_dkk: v("objektiv", "objektiv_dkk"),
        varmebehov_mwh: v("varme", "varmeefterspoergsel_mwh"),
        produktion_mwh: v("varme", "samlet_produktion_mwh"),
        nettab_mwh: v("varme", "nettab_mwh"),
        nettab_pct: v("varme", "nettab_pct"),
        co2_ton: v("miljoe", "co2_ton"),
        el_forbrug_mwh: v("el", "forbrug_mwh"),
        el_omkostning_dkk: v("el", "omkostning_dkk"),
        el_salg_dkk: v("el", "salg_dkk"),
        el_produktionstarif_dkk: v("el", "produktionstarif_dkk"),
        tank_arbitrage_dkk: v("lager", "tank_arbitrage_dkk"),
        enheder, lagre,
        balance: harBalance ? balance : null,
    };
}

export interface BalanceKolonne {
    felt: keyof MarkedBeløb;
    etiket: string;
    forklaring: string;
    /** Kolonnens definition afhænger af modelversionen, og kørslerne har forskellige: intet Δ (Codex K7-F2). */
    uensDefinition?: boolean;
}

/** Kolonnerne i balancetabellen, i den rækkefølge brutto opstår: kapacitet + aktivering netto (= netto) + sparet elkøb (= brutto). */
export const BALANCE_KOLONNER: readonly BalanceKolonne[] = [
    { felt: "kapacitet", ...reg("kapacitetsindtaegt_dkk", "Kapacitetsindtægt") },
    { felt: "aktivering_netto", ...reg("aktivering_netto_dkk", "Aktiveringsindtægt, netto") },
    { felt: "sparet_elkoeb", ...reg("forbrugsmodregning_dkk", "Sparet tarif og afgift ved aktivering") },
    { felt: "aktivering_brutto", ...reg("aktivering_brutto_dkk", "Aktiveringsindtægt, brutto") },
    { felt: "netto", etiket: "Netto i alt", forklaring: "Kapacitet + aktivering netto." },
    { felt: "brutto", etiket: "Brutto i alt", forklaring: "Netto + sparet elkøb; ved activation_value det beløb, objektivet regner med. Ved legacy er modellens brutto = netto, selv om objektivet også regner den sparede tarif og afgift med (src/balancing.py:353-358, :1132-1140)." },
];
/**
 * Balancekolonnerne for de viste kørsler (Codex K7-F2). Forbrugsmodregningen (brutto − netto) betød før
 * modelrettelsen 19/10-2026 sparet spot + tarif + elafgift, fra eef950a kun tarif + elafgift. Etiket og forklaring
 * vælges derfor efter kørslernes FROSNE model_commit — aldrig den nye definition på en gammel kørsel:
 *  - alle ved en nyere version: kolonnerne som i dag,
 *  - alle ved en version med spot: neutral etiket og den gamle definition,
 *  - blandet eller ukendt version: neutral etiket, begge definitioner, og intet Δ for de poster, der indeholder modregningen.
 */
export function balanceKolonner(modelCommits: readonly (string | null | undefined)[]): readonly BalanceKolonne[] {
    const V = FORBRUGSMODREGNING_VERSIONER;
    const medSpot = modelCommits.filter((c): c is string => !!c && V.spot_regnet_som_sparet.includes(c));
    const nye = modelCommits.filter((c) => !!c && !V.spot_regnet_som_sparet.includes(c));
    if (nye.length === modelCommits.length) return BALANCE_KOLONNER;
    const alleGamle = medSpot.length === modelCommits.length;
    const forklaring = alleGamle ? V.forklaring_med_spot.replace("{commit}", medSpot[0].slice(0, 7)) : V.forklaring_blandet;
    const uens = !alleGamle && modelCommits.length > 1;
    return BALANCE_KOLONNER.map((k) => {
        if (k.felt === "sparet_elkoeb") return { ...k, etiket: V.neutral_etiket, forklaring, uensDefinition: uens };
        if (k.felt === "aktivering_brutto" || k.felt === "brutto") return { ...k, forklaring: `${k.forklaring} Indeholder forbrugsmodregningen.`, uensDefinition: uens };
        return k;
    });
}

function reg(noegle: string, standard: string): { etiket: string; forklaring: string } {
    const r = REGISTER[`noegletal:balancering.${noegle}`];
    return { etiket: r?.etiket ?? standard, forklaring: r?.forklaring ?? "" };
}

export interface BalanceDeltaRaekke { marked: "aFRR" | "mFRR" | "I alt"; felt: keyof MarkedBeløb; etiket: string; a: number | null; b: number | null; delta: number | null }

/**
 * Balancetal for to kørsler, række for række (marked × kolonne). Δ findes kun,
 * når BEGGE sider har tallet: mangler balancemarkedet i den ene kørsel, er Δ "–"
 * — ellers står hele indtægten i Δ-kolonnen og læses som værdien (review A2).
 * Kolonner uden tal i nogen af kørslerne udelades.
 */
export function balanceDelta(ba: Balance | null, bb: Balance | null, kolonner: readonly BalanceKolonne[] = BALANCE_KOLONNER): BalanceDeltaRaekke[] {
    const ud: BalanceDeltaRaekke[] = [];
    for (const [m, navn] of [["afrr", "aFRR"], ["mfrr", "mFRR"], ["i_alt", "I alt"]] as const) {
        for (const k of kolonner) {
            const a = ba?.[m][k.felt] ?? null, b = bb?.[m][k.felt] ?? null;
            if (a === null && b === null) continue;
            ud.push({ marked: navn, felt: k.felt, etiket: k.etiket, a, b, delta: a !== null && b !== null && !k.uensDefinition ? b - a : null });
        }
    }
    return ud;
}

/**
 * Balancemarkedets VÆRDI, når præcis én af to kørsler har balancemarked: den
 * sparede driftsomkostning = objektiv(uden) − objektiv(med). Ellers null.
 */
export interface BalanceSide { k: Koersel; samlet: Samlet; input: readonly InputRække[]; profil: Profil }

/**
 * Input, der må afvige, når forskellen stadig er "balancemarkedets værdi":
 * balanceringsvalget og dets tilhørende felter (kun brugt af kørslen med balance).
 * Frosne commits står ikke her — de afgøres af sammenligneligheden.
 */
function erBalanceFelt(sti: string): boolean {
    return sti === `${KOERSEL_PRAEFIKS}med_balancering` || sti === `${KOERSEL_PRAEFIKS}balancing_method`
        || sti.startsWith("balancing.") || METADATA_FLAG.has(sti);
}

/**
 * Når præcis én af to kørsler har balancemarked (Codex K3-N3): er balanceringen
 * den ENESTE forskel (sammenlignelige efter §6b og intet andet input ændret), er
 * objektiv(uden) − objektiv(med) balancemarkedets værdi ("vaerdi"). Ellers er det
 * en samlet omkostningsforskel med flere ændringer ("blandet"), og `grunde`
 * navngiver dem (felter fra sammenligneligheden og input-stier). null hvis begge
 * eller ingen har balance, eller et objektiv mangler.
 */
export function balanceForskel(a: BalanceSide, b: BalanceSide):
    { type: "vaerdi"; vaerdi: number; med: "a" | "b" } | { type: "blandet"; vaerdi: number; med: "a" | "b"; grunde: string[] } | null {
    const ha = a.samlet.balance !== null, hb = b.samlet.balance !== null;
    if (ha === hb || tom(a.k.objektiv_dkk) || tom(b.k.objektiv_dkk)) return null;
    const med = hb ? "b" : "a";
    const vaerdi = hb ? a.k.objektiv_dkk - b.k.objektiv_dkk : b.k.objektiv_dkk - a.k.objektiv_dkk;
    const grunde = [
        ...sammenlignelighed(a.profil, b.profil).filter((x) => x.alvor !== "note").map((x) => x.navn),
        ...inputDiff(a.input, b.input).map((x) => x.sti).filter((s) => !erBalanceFelt(s)),
    ];
    return grunde.length === 0 ? { type: "vaerdi", vaerdi, med } : { type: "blandet", vaerdi, med, grunde };
}

/** Balancemarkedets værdi — KUN når balanceringen er den eneste forskel. */
export function balancemarkedetsVaerdi(a: BalanceSide, b: BalanceSide): { vaerdi: number; med: "a" | "b" } | null {
    const f = balanceForskel(a, b);
    return f?.type === "vaerdi" ? { vaerdi: f.vaerdi, med: f.med } : null;
}

/** Enheder med en produktionsprofil (fx solvarme): deres loft er profilen, ikke nominel effekt. */
export function profilbundne(input: readonly InputRække[]): Set<string> {
    const ud = new Set<string>();
    for (const [sti, x] of effektivtInput(input).blade) {
        const m = /^units\.([^.]+)\.production_profile_path$/.exec(sti);
        if (m && x.vaerdi_json !== "null" && x.vaerdi_json !== "\"\"") ud.add(m[1]);
    }
    return ud;
}

// ================================================================= gab og tolerance

export type GabKilde = "best_bound" | "opnaaet" | "oensket_loft" | "ukendt";
export interface Gab { kr: number | null; rel: number | null; kilde: GabKilde }

/**
 * Objektivets absolutte usikkerhed i kr. Rækkefølge: |objektiv − best bound|;
 * ellers opnået relativt gab × |objektiv|; ellers — kun ved status optimal — det
 * ønskede gab som loft (solveren stopper ved det første af rel/abs, så det
 * opnåede er højst det største af de to). Ellers ukendt.
 */
export function absolutGab(k: Pick<Koersel, "objektiv_dkk" | "best_bound" | "opnaaet_gap" | "oensket_rel_gap" | "oensket_abs_gap" | "solve_status">): Gab {
    const obj = k.objektiv_dkk;
    if (tom(obj)) return { kr: null, rel: null, kilde: "ukendt" };
    const rel = (kr: number) => (obj !== 0 ? kr / Math.abs(obj) : null);
    if (!tom(k.best_bound)) { const kr = Math.abs(obj - k.best_bound); return { kr, rel: rel(kr), kilde: "best_bound" }; }
    if (!tom(k.opnaaet_gap)) { const kr = Math.abs(k.opnaaet_gap * obj); return { kr, rel: k.opnaaet_gap, kilde: "opnaaet" }; }
    if (erOptimal(k.solve_status) && (!tom(k.oensket_rel_gap) || !tom(k.oensket_abs_gap))) {
        const kr = Math.max(tom(k.oensket_rel_gap) ? 0 : k.oensket_rel_gap * Math.abs(obj), tom(k.oensket_abs_gap) ? 0 : k.oensket_abs_gap);
        return { kr, rel: rel(kr), kilde: "oensket_loft" };
    }
    return { kr: null, rel: null, kilde: "ukendt" };
}

export function erOptimal(s: string | null | undefined): boolean {
    return !!s && s.toLowerCase() === "optimal";
}

/** Løsningsstatus i ord. */
export function loesningTekst(s: string | null | undefined): string {
    if (!s) return "ukendt løsningsstatus";
    const l = s.toLowerCase();
    if (l === "optimal") return "optimal inden for det ønskede gab";
    if (l.includes("time")) return "stoppet ved tidsgrænsen";
    if (l.includes("infeas")) return "uløselig";
    return s;
}

/**
 * Usikkerheden er ENSIDET: ved minimering ligger det sande optimum mellem best
 * bound og objektivet, så objektivet kan kun være for højt. "højst 2.355 kr.
 * over det bedst mulige (0,050 %)" — eller forklaringen på, hvorfor det ikke kendes.
 */
export function gabTekst(g: Gab): string {
    if (g.kr === null) return "ukendt (solverens log kunne ikke læses)";
    const rel = g.rel === null ? "" : ` (${gabPct(g.rel)})`;
    const loft = g.kilde === "oensket_loft" ? "; loft ud fra det ønskede gab" : "";
    return `højst ${tal(g.kr)} kr. over det bedst mulige${rel}${loft}`;
}

export interface Difference {
    /** b − a i kr. */
    delta: number;
    /** Summen af de to absolutte gab; null hvis et af dem er ukendt. */
    tolerance: number | null;
    /** |Δ| < tolerance: kan ikke skelnes fra nul. */
    indenForTolerance: boolean;
    /**
     * Hvor det sande Δ ligger: [Δ − gab(scenarie); Δ + gab(reference)]. Begge
     * objektiver kan kun være for høje, så scenariets gab trækker Δ ned og
     * referencens skubber det op. null hvis et gab er ukendt.
     */
    interval: [number, number] | null;
    retning: "dyrere" | "billigere" | "ens";
}

/** Δ objektiv (b − a) og toleransereglen fra KONTRAKT §6b. */
export function difference(a: Koersel, b: Koersel): Difference | null {
    if (tom(a.objektiv_dkk) || tom(b.objektiv_dkk)) return null;
    const delta = b.objektiv_dkk - a.objektiv_dkk;
    const ga = absolutGab(a).kr, gb = absolutGab(b).kr;
    const tolerance = ga === null || gb === null ? null : ga + gb;
    return {
        delta, tolerance,
        interval: ga === null || gb === null ? null : [delta - gb, delta + ga],
        indenForTolerance: tolerance !== null && Math.abs(delta) < tolerance,
        retning: delta > 0 ? "dyrere" : delta < 0 ? "billigere" : "ens",
    };
}

/** "Scenariet koster 123.456 kr. mere end referencen" (+ toleranceforbehold). */
/**
 * Hvordan |Δ| forholder sig til tolerancen (Codex K3-N8). Kontraktens regel er
 * streng (`|Δ| < tolerance` = inden for); nul og præcis lighed får egne klasser,
 * så teksten aldrig kalder en nul-forskel "større end tolerancen".
 */
export function toleranceKlasse(d: Difference): "nul" | "inden" | "lig" | "stoerre" | "ukendt" {
    if (d.delta === 0) return "nul";
    if (d.tolerance === null) return "ukendt";
    if (d.indenForTolerance) return "inden";
    if (Math.abs(Math.abs(d.delta) - d.tolerance) < 1e-6) return "lig";
    return "stoerre";
}

export function differenceTekst(d: Difference): string {
    const beløb = `${tal(Math.abs(d.delta))} kr.`;
    const kl = toleranceKlasse(d);
    const kerne = kl === "nul" || tal(Math.abs(d.delta)) === "0"
        ? "Scenariet og referencen koster det samme"
        : d.retning === "dyrere" ? `Scenariet koster ${beløb} mere end referencen` : `Scenariet koster ${beløb} mindre end referencen`;
    const tol = d.tolerance === null ? "" : `${tal(d.tolerance)} kr.`;
    switch (kl) {
        case "nul":
            if (d.tolerance === null) return `${kerne}; solverens tolerance kendes ikke for begge kørsler.`;
            return d.tolerance === 0
                ? `${kerne} — begge er løst uden gab, så forskellen er nul.`
                : `${kerne} — forskellen er nul, inden for solverens tolerance (summen af gabene, ${tol}).`;
        case "ukendt": return `${kerne}; solverens tolerance kendes ikke for begge kørsler.`;
        case "inden": return `${kerne} — inden for solverens tolerance (summen af gabene, ${tol}), så forskellen kan ikke skelnes fra nul.`;
        case "lig": return `${kerne}; forskellen er præcis lig med solverens tolerance (summen af gabene, ${tol}) — efter reglen |Δ| < tolerance regnes den ikke som inden for, men den ligger på grænsen.`;
        default: return `${kerne}; forskellen er større end solverens tolerance (summen af gabene, ${tol}).`;
    }
}

/** "Det sande Δ ligger mellem −424.100 og −424.045 kr." (null hvis et gab er ukendt). */
export function intervalTekst(d: Difference): string | null {
    if (!d.interval) return null;
    const f = (x: number) => `${x < 0 ? "−" : ""}${tal(Math.abs(x))}`;
    const [lo, hi] = d.interval;
    return f(lo) === f(hi) ? `Det sande Δ er ${f(lo)} kr.` : `Det sande Δ ligger mellem ${f(lo)} og ${f(hi)} kr.`;
}

// ================================================================= sammenlignelighed

export interface Profil {
    vaerk_id: string;
    vaerk_navn: string;
    vaerk_revision: number | null;
    /** Datoer til visning (YYYY-MM-DD). */
    periode_start: string | null;
    periode_slut: string | null;
    /**
     * Præcis periode til SAMMENLIGNING (KONTRAKT §6b, Codex K3-N2): første og sidste
     * intervals start som ISO-UTC. En ren dato er inklusiv hele døgnet: start = kl. 00,
     * slut = døgnets sidste interval (1h → kl. 23). Kilde: frosset `_koersel.start/slut`,
     * ellers `time.start/end`, ellers manifest, ellers scenarie.
     */
    periode_fra: string | null;
    periode_til: string | null;
    oploesning: string | null;
    data_commit: string | null;
    model_commit: string | null;
    rel_gap: number | null;
    abs_gap: number | null;
    med_balancering: boolean | null;
    miljoe: string | null;
}

export interface Afvigelse {
    felt: keyof Profil | "periode";
    navn: string;
    a: string;
    b: string;
    /**
     * advarsel = bryder direkte sammenlignelighed (§6b); ukendt = et nødvendigt felt
     * mangler på mindst én side, så det kan ikke afgøres; note = værd at vide.
     */
    alvor: "advarsel" | "ukendt" | "note";
}

/** Samlet dom: "ja" = direkte sammenlignelige; "nej" = noget afviger; "ukendt" = kan ikke afgøres. */
export function sammenlignelighedStatus(af: readonly Afvigelse[]): "ja" | "nej" | "ukendt" {
    if (af.some((x) => x.alvor === "advarsel")) return "nej";
    if (af.some((x) => x.alvor === "ukendt")) return "ukendt";
    return "ja";
}

const INTERVAL_MIN: Record<string, number> = { "1h": 60, "15min": 15 };

/**
 * Et tidspunkt som ISO-UTC til sammenligning. En ren dato er døgnets første
 * interval (`slut = false`) eller sidste interval (`slut = true`, inklusiv slutdato).
 * Uden zone læses tiden som UTC (modellens akse). Ugyldig tekst returneres uændret.
 */
export function normTid(v: string | null | undefined, slut: boolean, oploesning: string | null): string | null {
    if (!v) return null;
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const min = INTERVAL_MIN[oploesning ?? "1h"] ?? 60;
        const t = Date.parse(`${s}T00:00:00Z`) + (slut ? 86_400_000 - min * 60_000 : 0);
        return Number.isFinite(t) ? new Date(t).toISOString() : s;
    }
    const t = Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`);
    return Number.isFinite(t) ? new Date(t).toISOString() : s;
}

function manifestPeriode(k: Koersel): { start: string | null; slut: string | null; oploesning: string | null } {
    try {
        const m = k.manifest_json ? JSON.parse(k.manifest_json) as { periode?: { start?: string; slut?: string; oploesning?: string } } : null;
        return { start: m?.periode?.start ?? null, slut: m?.periode?.slut ?? null, oploesning: m?.periode?.oploesning ?? null };
    } catch { return { start: null, slut: null, oploesning: null }; }
}

function miljoeNoegle(json: string | null | undefined): string | null {
    if (!json) return null;
    try {
        const m = JSON.parse(json) as { python?: string; pakker?: Record<string, string> };
        const pk = m.pakker ? Object.entries(m.pakker).sort(([x], [y]) => x.localeCompare(y)).map(([n, v]) => `${n} ${v}`).join(", ") : "";
        return `Python ${m.python ?? "?"}${pk ? `; ${pk}` : ""}`;
    } catch { return json; }
}

/** En kørsels sammenligningsprofil. Perioden tages af manifestet, ellers af scenariet. */
export function profil(k: Koersel, vaerkNavn: string, scenarie?: Scenarie | null, input?: readonly InputRække[]): Profil {
    const mp = manifestPeriode(k);
    let medBal: boolean | null = scenarie ? scenarie.med_balancering : null;
    if (input) {
        const r = input.find((x) => x.sti === `${KOERSEL_PRAEFIKS}med_balancering`);
        if (r) medBal = r.vaerdi_json === "true";
    }
    const oploesning = k.oploesning ?? mp.oploesning ?? null;
    // Præcis periode: det frosne input vinder (det er det, notebooken kørte), så manifest og scenarie.
    const e = input ? effektivtInput(input) : null;
    const str = (j: string | undefined) => { if (j === undefined) return null; try { const v = JSON.parse(j) as unknown; return typeof v === "string" ? v : null; } catch { return null; } };
    const fra = str(e?.flag.get("start")) ?? str(e?.blade.get("time.start")?.vaerdi_json) ?? mp.start ?? scenarie?.periode_start ?? null;
    const til = str(e?.flag.get("slut")) ?? str(e?.blade.get("time.end")?.vaerdi_json) ?? mp.slut ?? scenarie?.periode_slut ?? null;
    return {
        vaerk_id: k.vaerk_id, vaerk_navn: vaerkNavn, vaerk_revision: k.vaerk_revision ?? null,
        periode_start: mp.start ?? scenarie?.periode_start ?? fra?.slice(0, 10) ?? null,
        periode_slut: mp.slut ?? scenarie?.periode_slut ?? til?.slice(0, 10) ?? null,
        periode_fra: normTid(fra, false, oploesning), periode_til: normTid(til, true, oploesning),
        oploesning,
        data_commit: k.data_commit ?? frossetFlag(input, "data_commit"), model_commit: k.model_commit ?? frossetFlag(input, "model_commit"),
        rel_gap: k.oensket_rel_gap ?? null, abs_gap: k.oensket_abs_gap ?? null,
        med_balancering: medBal,
        miljoe: miljoeNoegle(k.miljoe_json),
    };
}

const kort = (sha: string) => sha.slice(0, 7);
function vis<T>(v: T | null | undefined, f: (x: T) => string = String): string {
    return tom(v) ? "ukendt" : f(v);
}

/**
 * KONTRAKT §6b: direkte sammenlignelige, når værk, periode, opløsning,
 * data_commit, model_commit, mip_rel_gap og mip_abs_gap er ens. Tom liste
 * af advarsler = direkte sammenlignelige. Noter (værksrevision, balancering,
 * miljø) bryder ikke reglen, men skal kunne ses.
 */
export function sammenlignelighed(a: Profil, b: Profil): Afvigelse[] {
    const ud: Afvigelse[] = [];
    // Noter: sammenlign den viste tekst (ingen af dem afgør sammenligneligheden).
    const tjek = (felt: Afvigelse["felt"], navn: string, va: string, vb: string, alvor: Afvigelse["alvor"] = "advarsel") => {
        if (va !== vb) ud.push({ felt, navn, a: va, b: vb, alvor });
    };
    /**
     * Nødvendige felter (Codex K3-N2): afgøres på de RÅ værdier; formatering kun til
     * forklaringen bagefter. Mangler værdien på mindst én side (også begge), kan det
     * ikke afgøres. Er de rå værdier forskellige, men den korte visning ens, vises
     * de fulde værdier, så forskellen kan ses.
     */
    const nødvendig = <T,>(felt: Afvigelse["felt"], navn: string, ra: T | null, rb: T | null, kort: (x: T) => string, fuld: (x: T) => string) => {
        if (ra === null || rb === null) { ud.push({ felt, navn, a: ra === null ? "ukendt" : kort(ra), b: rb === null ? "ukendt" : kort(rb), alvor: "ukendt" }); return; }
        if (ra === rb) return;
        const [ka, kb] = [kort(ra), kort(rb)];
        ud.push({ felt, navn, a: ka === kb ? fuld(ra) : ka, b: ka === kb ? fuld(rb) : kb, alvor: "advarsel" });
    };
    const id = (x: string) => x;
    const sha = (x: string | null) => (x ? x.trim().toLowerCase() : null);
    const fuldtTal = (x: number) => String(x).replace(".", ",");
    if (a.vaerk_id !== b.vaerk_id) ud.push({ felt: "vaerk_id", navn: "Værk", a: a.vaerk_navn, b: b.vaerk_navn, alvor: "advarsel" });
    const periode = (p: Profil) => (p.periode_fra && p.periode_til ? `${p.periode_fra}|${p.periode_til}` : null);
    const pv = (p: Profil) => periodeTekst(p.periode_start, p.periode_slut);
    const pf = (p: Profil) => `${(p.periode_fra ?? "?").replace(":00.000Z", " UTC").replace("T", " ")}–${(p.periode_til ?? "?").replace(":00.000Z", " UTC").replace("T", " ")}`;
    {
        const ra = periode(a), rb = periode(b);
        if (ra === null || rb === null) ud.push({ felt: "periode", navn: "Periode", a: ra === null ? "ukendt" : pv(a), b: rb === null ? "ukendt" : pv(b), alvor: "ukendt" });
        else if (ra !== rb) ud.push({ felt: "periode", navn: "Periode", a: pv(a) === pv(b) ? pf(a) : pv(a), b: pv(a) === pv(b) ? pf(b) : pv(b), alvor: "advarsel" });
    }
    nødvendig("oploesning", "Opløsning", a.oploesning, b.oploesning, id, id);
    nødvendig("data_commit", "Datagrundlag (df-data)", sha(a.data_commit), sha(b.data_commit), kort, id);
    nødvendig("model_commit", "Modelversion", sha(a.model_commit), sha(b.model_commit), kort, id);
    nødvendig("rel_gap", "Ønsket relativt gab", a.rel_gap, b.rel_gap, gabPct, (x) => `${fuldtTal(x * 100)} %`);
    nødvendig("abs_gap", "Ønsket absolut gab", a.abs_gap, b.abs_gap, (x) => `${tal(x)} kr.`, (x) => `${fuldtTal(x)} kr.`);
    if (a.vaerk_id === b.vaerk_id) tjek("vaerk_revision", "Værkets revision", vis(a.vaerk_revision, (x: number) => `r${x}`), vis(b.vaerk_revision, (x: number) => `r${x}`), "note");
    tjek("med_balancering", "Balancemarked", vis(a.med_balancering, (x: boolean) => (x ? "med" : "uden")), vis(b.med_balancering, (x: boolean) => (x ? "med" : "uden")), "note");
    tjek("miljoe", "Beregningsmiljø", vis(a.miljoe), vis(b.miljoe), "note");
    return ud;
}

// ================================================================= måneder

export interface Maanedstabel {
    /** YYYY-MM i Europe/Copenhagen, sorteret. Uden `periode`. */
    maaneder: string[];
    vaerdi(maaned: string, objekt: string | null, noegle: string): number | null;
    /** Hele kørslen — fra `periode`-rækken, aldrig en sum af måneder. */
    periode(objekt: string | null, noegle: string): number | null;
    /** Objekter der har en given nøgle (fx alle enheder med produktion_gwh). */
    objekter(noegle: string): string[];
}

export function maanedstabel(rækker: readonly Maaned[]): Maanedstabel {
    const nøgle = (m: string, o: string | null | undefined, n: string) => `${m}|${o ?? ""}|${n}`;
    const kort = new Map<string, number | null>();
    const maaneder = new Set<string>();
    const obj = new Map<string, Set<string>>();
    for (const r of rækker) {
        kort.set(nøgle(r.maaned, r.objekt, r.noegle), tom(r.vaerdi) ? null : r.vaerdi);
        if (r.maaned !== "periode") maaneder.add(r.maaned);
        if (r.objekt) { if (!obj.has(r.noegle)) obj.set(r.noegle, new Set()); obj.get(r.noegle)!.add(r.objekt); }
    }
    return {
        maaneder: [...maaneder].sort(),
        vaerdi: (m, o, n) => kort.get(nøgle(m, o, n)) ?? null,
        periode: (o, n) => kort.get(nøgle("periode", o, n)) ?? null,
        objekter: (n) => [...(obj.get(n) ?? [])].sort(),
    };
}

// ================================================================= intervaldispatch

export interface DispatchPunkt {
    tid: Date;
    last: number;
    spot: number | null;
    tUde: number | null;
    /** MW varme pr. enhed (p_<enhed>_mw). */
    prod: Record<string, number>;
    /** MWh i hvert lager (<lager>_level_mwh). */
    lager: Record<string, number>;
    /**
     * Netto over alle lagre i intervallet: fra lager = max(0, Σ(afladning − ladning)),
     * til lager = max(0, Σ(ladning − afladning)). Et lag, der lader et andet, er en
     * flytning mellem lagre — ikke forsyning (modellen kobler ikke enhed til lager).
     */
    aflad: number;
    lad: number;
}

/** Parser KoerselTime-rækker til punkter. vaerdier_json's NaN er allerede null. */
export function dispatchPunkter(rækker: readonly Time[]): DispatchPunkt[] {
    return [...rækker].sort((x, y) => x.tid.getTime() - y.tid.getTime()).map((r) => {
        let v: Record<string, number | null> = {};
        try { v = JSON.parse(r.vaerdier_json) as Record<string, number | null>; } catch { /* tom række */ }
        const prod: Record<string, number> = {};
        const lager: Record<string, number> = {};
        let netto = 0;
        for (const [k, x] of Object.entries(v)) {
            if (typeof x !== "number") continue;
            let m = /^p_(.+)_mw$/.exec(k);
            if (m) { prod[m[1]] = Math.max(0, x); continue; }
            m = /^(.+)_level_mwh$/.exec(k);
            if (m) { lager[m[1]] = x; continue; }
            if (/^.+_discharge_mw$/.test(k)) netto += Math.max(0, x);
            else if (/^.+_charge_mw$/.test(k)) netto -= Math.max(0, x);
        }
        return { tid: r.tid, last: r.varmelast_mw, spot: r.spotpris ?? null, tUde: r.t_ude ?? null, prod, lager, aflad: Math.max(0, netto), lad: Math.max(0, -netto) };
    });
}

export interface ProduktSplit { kapacitet: number; aktivering_netto: number; aktivering_brutto: number }

/**
 * Balanceindtægt pr. marked og produkt i et vindue af intervaldata (sum over
 * enheder og intervaller). Kun for det viste vindue — og intervaldata mangler
 * første interval, så det er aldrig periodens total.
 */
export function balanceIVindue(rækker: readonly Time[]): { afrr: ProduktSplit; mfrr: ProduktSplit } | null {
    const nul = (): ProduktSplit => ({ kapacitet: 0, aktivering_netto: 0, aktivering_brutto: 0 });
    const ud = { afrr: nul(), mfrr: nul() };
    let fundet = false;
    for (const r of rækker) {
        let v: Record<string, number | null> = {};
        try { v = JSON.parse(r.vaerdier_json) as Record<string, number | null>; } catch { continue; }
        for (const [k, x] of Object.entries(v)) {
            const m = /^r_(afrr|mfrr)_.+_(cap_revenue|act_revenue|act_gross)_dkk$/.exec(k);
            if (!m || typeof x !== "number") continue;
            fundet = true;
            const s = ud[m[1] as "afrr" | "mfrr"];
            if (m[2] === "cap_revenue") s.kapacitet += x;
            else if (m[2] === "act_revenue") s.aktivering_netto += x;
            else s.aktivering_brutto += x;
        }
    }
    return fundet ? ud : null;
}

export interface Vindue { fra: Date; til: Date; etiket: string }

/**
 * Valgbare vinduer i en periode: 7-døgns-blokke fra periodens start (modellens
 * akse er UTC, så blokken starter kl. 00 UTC), sidste blok afkortet ved
 * periodens slut (inklusive slutdøgnet). Er hele perioden ≤ maks døgn, kommer
 * "Hele perioden" først.
 */
export function vinduer(start: string | null, slut: string | null, maksDoegn = 31): Vindue[] {
    if (!start || !slut) return [];
    const s = Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
    const e = Date.parse(`${slut.slice(0, 10)}T00:00:00Z`) + 86_400_000;
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return [];
    const ud: Vindue[] = [];
    const DØGN = 86_400_000;
    if ((e - s) / DØGN <= maksDoegn) ud.push({ fra: new Date(s), til: new Date(e), etiket: "Hele perioden" });
    for (let t = s, i = 1; t < e; t += 7 * DØGN, i++) {
        const til = Math.min(e, t + 7 * DØGN);
        const a = new Date(t).toISOString().slice(0, 10), b = new Date(til - DØGN).toISOString().slice(0, 10);
        ud.push({ fra: new Date(t), til: new Date(til), etiket: `Uge ${i}: ${periodeTekst(a, b)}` });
    }
    return ud;
}

// ================================================================= input og klartekst

const MØNSTRE = FELTER.filter((f) => f.sti.includes("*")).map((f) => ({
    re: new RegExp(`^${f.sti.split(".").map((d) => (d === "*" ? "([^.]+)" : d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("\\.")}$`),
    f,
}));
const DIREKTE = new Map(FELTER.filter((f) => !f.sti.includes("*")).map((f) => [f.sti, f]));

/** Etiket, enhed og objekt (fx enhedens navn) for en sti, fra fagkataloget. */
export function feltInfo(sti: string): { etiket: string; enhed: string | null; objekt: string | null } {
    const d = DIREKTE.get(sti);
    if (d) return { etiket: d.etiket, enhed: d.enhed, objekt: null };
    for (const { re, f } of MØNSTRE) {
        const m = re.exec(sti);
        if (m) return { etiket: f.etiket, enhed: f.enhed, objekt: m.slice(1).join(" · ") };
    }
    return { etiket: sti, enhed: null, objekt: null };
}

/** Enhedens type på dansk ud fra det frosne input ("Elkedel"), ellers null. */
export function enhedstype(input: readonly InputRække[], enhed: string): string | null {
    const r = input.find((x) => x.sti === `units.${enhed}.type` && x.kilde === "vaerk");
    if (!r) return null;
    try { const t = JSON.parse(r.vaerdi_json) as string; return ENHEDSTYPER[t] ?? t; } catch { return null; }
}

/** En JSON-værdi som kort tekst til visning (dansk talformat, ja/nej). */
export function visJson(json: string | null | undefined): string {
    if (json === null || json === undefined) return "–";
    let v: unknown;
    try { v = JSON.parse(json); } catch { return json; }
    if (v === null) return "tom";
    if (typeof v === "boolean") return v ? "ja" : "nej";
    if (typeof v === "number") return Number.isInteger(v) ? tal(v) : dec(v, Math.min(6, Math.max(1, (String(v).split(".")[1] ?? "").length)));
    if (typeof v === "string") return v;
    const s = JSON.stringify(v);
    return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

/** Normaliseret sammenligning af to JSON-værdier (12 og 12.0 er ens til visning). */
export function sammeVaerdi(a: string | undefined, b: string | undefined): boolean {
    if (a === b) return true;
    if (a === undefined || b === undefined) return false;
    try { return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b)); } catch { return false; }
}

export interface InputForskel { sti: string; a: string | undefined; b: string | undefined }

/** Forskellen mellem to kørslers effektive input (casen + `_koersel.*`-flag), sorteret på sti. */
export function inputDiff(a: readonly InputRække[], b: readonly InputRække[]): InputForskel[] {
    const fladt = (r: readonly InputRække[]) => {
        const e = effektivtInput(r);
        const m = new Map<string, string>();
        for (const [sti, x] of e.blade) m.set(sti, x.vaerdi_json);
        for (const [sti, x] of e.flag) m.set(`${KOERSEL_PRAEFIKS}${sti}`, x);
        return m;
    };
    const ma = fladt(a), mb = fladt(b);
    const stier = [...new Set([...ma.keys(), ...mb.keys()])].sort();
    return stier.filter((s) => !sammeVaerdi(ma.get(s), mb.get(s))).map((sti) => ({ sti, a: ma.get(sti), b: mb.get(sti) }));
}

/**
 * `_koersel.*`-felter der er kørslens metadata, ikke et spørgsmål: de frosne
 * model-/data-SHA'er fra `Motor` (KONTRAKT §6c). De står i input-diff'en, men
 * ikke i "hvad kørslen svarer på".
 */
export const METADATA_FLAG = new Set([`${KOERSEL_PRAEFIKS}model_commit`, `${KOERSEL_PRAEFIKS}data_commit`]);

/** Frosset flag-værdi (JSON-streng) fra inputtet, fx `_koersel.model_commit`. */
export function frossetFlag(input: readonly InputRække[] | undefined, navn: string): string | null {
    const r = input?.find((x) => x.sti === `${KOERSEL_PRAEFIKS}${navn}`);
    if (!r) return null;
    try { const v = JSON.parse(r.vaerdi_json) as unknown; return typeof v === "string" ? v : null; } catch { return null; }
}

export interface Aendring { sti: string; kilde: "aendring" | "scenarie"; vaerk_json?: string; ny_json: string }

/** Det, kørslen ændrede i forhold til værket (kilde aendring/scenarie). */
export function koerselsAendringer(input: readonly InputRække[]): Aendring[] {
    const e = effektivtInput(input);
    const ud: Aendring[] = [];
    for (const [sti, x] of e.blade) if (x.kilde !== "vaerk") ud.push({ sti, kilde: x.kilde, vaerk_json: x.vaerk_json, ny_json: x.vaerdi_json });
    for (const [sti, x] of e.flag) ud.push({ sti: `${KOERSEL_PRAEFIKS}${sti}`, kilde: "scenarie", ny_json: x });
    return ud.sort((p, q) => p.sti.localeCompare(q.sti));
}

/** Én ændring i klartekst: "Lager tank_lav slået fra", "Halmpris: 205 → 256 kr./MWh". */
export function aendringTekst(sti: string, før: string | undefined, efter: string | undefined): string {
    const ny = efter === undefined ? undefined : (() => { try { return JSON.parse(efter) as unknown; } catch { return efter; } })();
    const m = /^(units|storage)\.([^.]+)\.enabled$/.exec(sti);
    if (m && typeof ny === "boolean") return `${m[1] === "units" ? "Enheden" : "Lageret"} ${m[2]} er slået ${ny ? "til" : "fra"}`;
    if (sti === `${KOERSEL_PRAEFIKS}med_balancering`) return ny ? "Med balancemarked (aFRR og mFRR)" : "Uden balancemarked";
    if (sti === `${KOERSEL_PRAEFIKS}balancing_method`) return `Balanceringsmetode: ${String(ny)}`;
    if (sti === `${KOERSEL_PRAEFIKS}heat_csv`) return `Målt varmelast fra ${String(ny)}`;
    if (sti === `${KOERSEL_PRAEFIKS}ekstra_flag`) return `Ekstra flag: ${Array.isArray(ny) ? ny.join(" ") : String(ny)}`;
    if (sti === `${KOERSEL_PRAEFIKS}model_commit`) return `Modelversion (frosset): ${String(ny).slice(0, 7)}`;
    if (sti === `${KOERSEL_PRAEFIKS}data_commit`) return `Datagrundlag (frosset): ${String(ny).slice(0, 7)}`;
    if (sti === `${KOERSEL_PRAEFIKS}start`) return `Periodens start: ${String(ny)}`;
    if (sti === `${KOERSEL_PRAEFIKS}slut`) return `Periodens slut: ${String(ny)}`;
    // En frosset tidsserie (`{"id": …, "sha256": …}`) er en reference, ikke en værdi: vis rollen og fingeraftrykket,
    // aldrig den rå JSON (review fv-ibcs #20). Navnet står i kortet "Data i denne kørsel".
    const tsPraefiks = `${KOERSEL_PRAEFIKS}tidsserie.`;
    const ts = sti.startsWith(tsPraefiks) ? sti.slice(tsPraefiks.length) : null;
    if (ts) {
        const rolle = ts.charAt(0).toUpperCase() + ts.slice(1);
        const sha = ny && typeof ny === "object" && "sha256" in ny ? String((ny as { sha256: unknown }).sha256).slice(0, 12) : null;
        return efter === undefined ? `${rolle}: ingen frosset tidsserie` : `${rolle}: frosset tidsserie${sha ? ` (sha256 ${sha})` : ""}`;
    }
    const info = feltInfo(sti);
    const enhed = info.enhed ? ` ${info.enhed}` : "";
    const hvad = `${info.etiket}${info.objekt ? ` (${info.objekt})` : ""}`;
    if (efter === undefined) return `${hvad}: fjernet`;
    if (før === undefined) return `${hvad}: ${visJson(efter)}${enhed}`;
    return `${hvad}: ${visJson(før)} → ${visJson(efter)}${enhed}`;
}

/**
 * Hvad kørslen svarer på, i klartekst: værkets ændringer først, periode og
 * balancemarked samlet til én linje hver. Tomt værk = "Værket som det er".
 */
export function spoergsmaal(input: readonly InputRække[]): string[] {
    const ænd = koerselsAendringer(input);
    const linjer: string[] = [];
    const start = ænd.find((x) => x.sti === `${KOERSEL_PRAEFIKS}start`);
    const slut = ænd.find((x) => x.sti === `${KOERSEL_PRAEFIKS}slut`);
    const indhold = ænd.filter((x) => x.sti !== `${KOERSEL_PRAEFIKS}start` && x.sti !== `${KOERSEL_PRAEFIKS}slut`
        && !x.sti.startsWith("solver.") && x.sti !== `${KOERSEL_PRAEFIKS}med_balancering` && !METADATA_FLAG.has(x.sti));
    for (const x of indhold) linjer.push(aendringTekst(x.sti, x.vaerk_json, x.ny_json));
    if (linjer.length === 0) linjer.push("Værket som det er — ingen ændringer");
    const bal = ænd.find((x) => x.sti === `${KOERSEL_PRAEFIKS}med_balancering`);
    if (bal) linjer.push(aendringTekst(bal.sti, undefined, bal.ny_json));
    if (start && slut) {
        const p = (j: string) => { try { return JSON.parse(j) as string; } catch { return j; } };
        linjer.push(`Periode ${periodeTekst(p(start.ny_json), p(slut.ny_json))}`);
    }
    return linjer;
}

/**
 * Spor B (beskrivende), når reservationen er bundet af værkets egen: et månedsloft
 * (`balancing.availability.enabled`) ELLER en reservationsgate i `mode: driven`
 * (doc/BALANCEMARKED.md:137-140). Ellers Spor A — fri reservation, en øvre grænse.
 * (fv-eksperts review A3: Andeby og Billund Spor A/rullende/idag/rullende_bud er A;
 * Billund Spor B og Spor B rullende er B.)
 */
export function spor(input: readonly InputRække[]): "A" | "B" {
    const e = effektivtInput(input);
    const json = (sti: string) => { const r = e.blade.get(sti); if (!r) return undefined; try { return JSON.parse(r.vaerdi_json) as unknown; } catch { return undefined; } };
    if (json("balancing.availability.enabled") === true) return "B";
    if (json("balancing.reservation_gate.enabled") === true && json("balancing.reservation_gate.mode") === "driven") return "B";
    return "A";
}

/** Enheder og lagre, værket har (aktive eller ej), fra det frosne input. */
export function vaerketsObjekter(input: readonly InputRække[]): { enheder: string[]; lagre: string[] } {
    const enheder = new Set<string>(), lagre = new Set<string>();
    for (const r of input) {
        let m = /^units\.([^.]+)\./.exec(r.sti);
        if (m) enheder.add(m[1]);
        m = /^storage\.([^.]+)\./.exec(r.sti);
        if (m) lagre.add(m[1]);
    }
    return { enheder: [...enheder].sort(), lagre: [...lagre].sort() };
}

// ================================================================= farver

/**
 * Kategorisk farveplads (1–8) pr. enhed: alfabetisk over HELE sættet af
 * enheder (begge kørsler ved en sammenligning), så en enhed beholder sin farve
 * uanset hvilke der producerer. Over 8 → 0 = "øvrige" (neutral), aldrig en
 * cyklet farve.
 */
export function farvepladser(navne: Iterable<string>): Map<string, number> {
    const sorteret = [...new Set(navne)].sort((a, b) => a.localeCompare(b));
    return new Map(sorteret.map((n, i) => [n, i < 8 ? i + 1 : 0]));
}

/** Sidens/kortets budskab om enhedsfordelingen: "halmkedel leverer 48 % af varmen". */
export function stoersteEnhed(enheder: readonly EnhedTal[]): EnhedTal | null {
    return enheder.filter((e) => (e.produktion_mwh ?? 0) > 0)[0] ?? null;
}

// ================================================================= sammenligning af produktion

/**
 * ΔRef% som brøk: (Scen − Ref) / Ref med den fortegnsbærende reference — aldrig |Ref|. N/A (null), når et tal mangler
 * eller Ref ≤ 0 (app/IBCS.md §2; IBCS UN 4.1). ÉN regel for kort, detaljer, grafer og tabeller (Codex K7 F4).
 */
export function relativAfvigelse(ref: number | null | undefined, scen: number | null | undefined): number | null {
    if (ref == null || scen == null || !Number.isFinite(ref) || !Number.isFinite(scen) || !(ref > 0)) return null;
    return (scen - ref) / ref;
}

export interface EnhedVarians { navn: string; a: number; b: number; delta: number; relativ: number | null }

/** Produktion pr. enhed a vs b (MWh). Enheder der kun findes i én kørsel tæller som 0 i den anden. */
export function produktionsvarians(a: readonly EnhedTal[], b: readonly EnhedTal[]): EnhedVarians[] {
    const ma = new Map(a.map((e) => [e.navn, e.produktion_mwh ?? 0]));
    const mb = new Map(b.map((e) => [e.navn, e.produktion_mwh ?? 0]));
    const navne = [...new Set([...ma.keys(), ...mb.keys()])];
    return navne.map((navn) => {
        const va = ma.get(navn) ?? 0, vb = mb.get(navn) ?? 0;
        return { navn, a: va, b: vb, delta: vb - va, relativ: relativAfvigelse(va, vb) };
    }).sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b) || x.navn.localeCompare(y.navn));
}

/**
 * Sammenligningens budskab: "I scenariet overtager gaskedlen 1,2 GWh (mest fra
 * halmkedlen), og driften bliver 89.000 kr. dyrere".
 */
export function sammenligningsBudskab(varians: readonly EnhedVarians[], d: Difference | null, energiTekst: (mwh: number) => string): string {
    const op = [...varians].sort((x, y) => y.delta - x.delta)[0];
    const ned = [...varians].sort((x, y) => x.delta - y.delta)[0];
    const dele: string[] = [];
    if (op && ned && op.delta > 0.5 && ned.delta < -0.5) dele.push(`I scenariet overtager ${op.navn} ${energiTekst(op.delta)} (mest fra ${ned.navn})`);
    else if (op && op.delta > 0.5) dele.push(`I scenariet producerer ${op.navn} ${energiTekst(op.delta)} mere`);
    else if (ned && ned.delta < -0.5) dele.push(`I scenariet producerer ${ned.navn} ${energiTekst(-ned.delta)} mindre`);
    else dele.push("Enhedsfordelingen er den samme");
    if (d) {
        if (d.indenForTolerance || d.retning === "ens") dele.push("og forskellen i driftsomkostning kan ikke skelnes fra nul");
        else dele.push(`og driften bliver ${tal(Math.abs(d.delta))} kr. ${d.retning}`);
    }
    return `${dele.join(", ")}.`;
}

// ================================================================= kørselslisten

/** Kørslens varighed i sekunder (startet → afsluttet), null hvis ikke afsluttet. */
export function koerselsVarighed(k: Pick<Koersel, "startet" | "afsluttet">): number | null {
    if (!k.startet || !k.afsluttet) return null;
    return (new Date(k.afsluttet).getTime() - new Date(k.startet).getTime()) / 1000;
}

/**
 * Køens tid (KONTRAKT §6c): `modtaget` er serverens tidsstempel og køens
 * sorteringsnøgle; klientens `bestilt` er kun diagnostik. Ældre rækker (og
 * typer fra før v2.2) har kun `bestilt`.
 */
export function modtaget(k: Pick<Koersel, "bestilt">): Date {
    const m = (k as { modtaget?: Date | string | null }).modtaget;
    return new Date(m ?? k.bestilt);
}

/** Referencen (a) er den først modtagne af de to valgte. */
export function sammenligningsRaekkefoelge(valgt: readonly Koersel[]): [string, string] | null {
    if (valgt.length !== 2) return null;
    const [x, y] = [...valgt].sort((p, q) => modtaget(p).getTime() - modtaget(q).getTime());
    return [x.id, y.id];
}

/**
 * Kørslens balanceringsmetode, som modellen bruger den: scenariets `_koersel.balancing_method` (CLI-flaget slår casen),
 * ellers værkets `balancing.method`, ellers kodens standard "legacy" (src/config.py:993 @ eef950a). Runde 8 (V9).
 */
export function balanceMetode(input: readonly { sti: string; vaerdi_json: string }[]): string {
    const læs = (sti: string) => {
        const r = [...input].reverse().find((x) => x.sti === sti);
        try { const v = r ? JSON.parse(r.vaerdi_json) : undefined; return typeof v === "string" && v ? v : undefined; } catch { return undefined; }
    };
    return læs(`${KOERSEL_PRAEFIKS}balancing_method`) ?? læs("balancing.method") ?? "legacy";
}
