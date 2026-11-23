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
//  * To kørsler er direkte sammenlignelige, når værk, værksrevision, periode,
//    opløsning, data-/modelcommit og ønsket gab er ens. Kun et sådant par må
//    vises som et resultat (sammenlignelighedsDom; runde 15).
//-----------------------------------------------------------------------

import type { FjvSchema } from "../../../rayfin/data/schema";
import { KOERSEL_PRAEFIKS, effektivtInput, type InputRække } from "@/lib/data/afflad";
import { tal } from "@/lib/format";
import { VISNINGSNAVNE } from "./anbefaling.data";
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
 * Et gab eller en tolerance i kr. — uden at runde et lille gab ned til "0 kr." (runde 15, fund 3.4 fra den uafhængige
 * test 18. november 2026: to kørsler med gab på få øre gav "solverens tolerance (0 kr.)", som læses som "løst uden
 * gab"). Præcis 0 er "0 kr."; over 0 og under 1 kr. er "< 1 kr."; ellers beløbet i hele kroner.
 */
export function toleranceKr(kr: number): string {
    if (kr > 0 && kr < 1) return "< 1 kr.";
    return `${tal(kr)} kr.`;
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
    // Fund 3.4: et gab under en krone er ikke "højst 0 kr.".
    const hvor = g.kr > 0 && g.kr < 1 ? "under 1 kr." : `højst ${tal(g.kr)} kr.`;
    return `${hvor} over det bedst mulige${rel}${loft}`;
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
    const tol = d.tolerance === null ? "" : toleranceKr(d.tolerance);
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
     * Præcis periode til SAMMENLIGNING (KONTRAKT §6b, Codex K3-N2): første og sidste intervals start som ISO-UTC —
     * kørslens EFFEKTIVE akse, udledt af det frosne input med modellens egen regel (`effektivPeriode`; samme regel som
     * `fabric/fjv/byg_case.py › _effektiv_tid`). Kan den ikke udledes af det frosne, er den `null`, og dommen er
     * ukendt. ALDRIG scenariets levende felter: de kan være rettet, efter at kørslen blev bestilt.
     */
    periode_fra: string | null;
    periode_til: string | null;
    /**
     * Kørslens effektive varmelast og solprofil, som de står i det frosne input (efterprøvningen af rettelserne i
     * runde 15, fund D). `null` = det frosne input kendes ikke her.
     */
    varmelast: Tidsseriekilde | null;
    solprofil: Tidsseriekilde | null;
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
    /** En hel sætning, når "X afviger" / "X kendes ikke for begge" ikke siger, hvad der er galt. */
    grund?: string;
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

const TIME_MS = 3_600_000;

/**
 * Et tidsstempel, som modellen læser det (`fabric/fjv/byg_case.py › _modeltid`, og den betroede logiks `modeltid` i
 * `rayfin/functions/src/logik.ts`): naivt = UTC, en bar dato = MIDNAT — ikke hele døgnet. En anden zone end UTC og et
 * tidspunkt uden for hele timer afviser modellen; her er svaret da `null` (perioden kan ikke udledes).
 */
function modeltid(s: string): number | null {
    const x = s.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(x)) { const t = Date.parse(`${x}T00:00:00Z`); return Number.isFinite(t) ? t : null; }
    const zone = /(Z|[+-]\d{2}:?\d{2})$/i.exec(x)?.[1];
    if (zone && !/^(Z|[+-]00:?00)$/i.test(zone)) return null;
    const t = Date.parse(zone ? x : `${x}Z`);
    return Number.isFinite(t) && t % TIME_MS === 0 ? t : null;
}

/**
 * Kørslens EFFEKTIVE periode — første og sidste time, begge med — udledt af det frosne input med præcis den regel,
 * arbejderen bygger casen med (`fabric/fjv/byg_case.py › _effektiv_tid`; den betroede logiks `effektivAkse`, bundet af
 * `skema/vektorer/effektiv_akse.json`, som `scenarier/__tests__/r15_periode_grundlag.spec.tsx` også holder denne
 * funktion op mod):
 *
 *  * med scenariets frosne datoer (`_koersel.start/slut`): fra startdatoens kl. 00 til slutdatoens kl. 23 UTC
 *    (`run_case._apply_time_override` udvider en bar slutdato til døgnets sidste skridt);
 *  * uden dem: værkets frosne `time.start`/`time.end` PRÆCIS, som de står — en bar dato er midnat, og intet udvides.
 *
 * De to regler er forskellige (efterprøvningen af rettelserne i runde 15, fund D): et værk med `time.end: 2026-01-06`
 * slutter kl. 00, et scenarie med slutdato 6. januar kl. 23. Før udvidede sammenligningen BEGGE til kl. 23 og sagde,
 * at de to perioder var ens. Kun timeopløsning (version 1); alt andet giver `null`: perioden kan ikke udledes af det
 * frosne, og dommen over et par er da ukendt.
 */
export function effektivPeriode(input: readonly InputRække[]): { fra: string; til: string } | null {
    const e = effektivtInput(input);
    const str = (j: string | undefined) => { if (j === undefined) return null; try { const v = JSON.parse(j) as unknown; return typeof v === "string" ? v : null; } catch { return null; } };
    const opl = e.blade.get("time.resolution");
    if (opl && str(opl.vaerdi_json) !== "1h") return null;
    const iso = (fra: number | null, til: number | null) => (fra === null || til === null || til < fra ? null : { fra: new Date(fra).toISOString(), til: new Date(til).toISOString() });
    if (e.flag.has("start") || e.flag.has("slut")) {
        const ps = str(e.flag.get("start")), pe = str(e.flag.get("slut"));
        // Kun rene datoer: arbejderen afviser alt andet (`byg_case._dato`), så en kørsel med et tidspunkt her findes ikke.
        const DATO = /^\d{4}-\d{2}-\d{2}$/;
        if (!ps || !pe || !DATO.test(ps) || !DATO.test(pe)) return null;
        const fra = Date.parse(`${ps}T00:00:00Z`), til = Date.parse(`${pe}T23:00:00Z`);
        return iso(Number.isFinite(fra) ? fra : null, Number.isFinite(til) ? til : null);
    }
    const ts = str(e.blade.get("time.start")?.vaerdi_json), te = str(e.blade.get("time.end")?.vaerdi_json);
    if (ts === null || te === null) return null;
    return iso(modeltid(ts), modeltid(te));
}

/**
 * Hvor en kørsels varmelast eller solprofil kommer fra, læst af det FROSNE input (fund D). `valg` siger, om det frosne
 * BEVISER, at scenariet har valgt kilden udtrykkeligt, eller at den er arvet fra værket:
 *
 *  * en af modelrepoets varmelastfiler (`_koersel.heat_csv`) er et scenariefelt — altid et udtrykkeligt valg;
 *  * `_koersel.tidsserie.varmelast = "syntetisk"` (den manuelle vej, `fjv.db.oploes_tidsserier`) er udtrykkeligt;
 *  * en frossen serie `{id, sha256}` fryses ENS, hvad enten scenariet valgte den, eller den var værkets aktive —
 *    oprindelsen er ukendt;
 *  * ingen række for varmelasten er enten et udtrykkeligt "syntetisk" bestilt i appen (som ikke fryser en række)
 *    eller et værk uden aktiv serie — ukendt;
 *  * ingen række for solprofilen er værkets egen profilsti: den kan ikke vælges fra i et scenarie — arvet.
 */
export type Serievalg = "udtrykkeligt" | "arvet" | "ukendt";
export type Tidsseriekilde =
    | { art: "serie"; id: string | null; sha256: string | null; valg: Serievalg }
    | { art: "fil"; fil: string; valg: "udtrykkeligt" }
    /** Varmelast: syntesen. Solprofil: værkets egen profilsti. */
    | { art: "standard"; valg: Serievalg };

export function tidsseriekilde(input: readonly InputRække[], rolle: "varmelast" | "solprofil"): Tidsseriekilde {
    const e = effektivtInput(input);
    const læs = (j: string | undefined): unknown => { if (j === undefined) return undefined; try { return JSON.parse(j) as unknown; } catch { return undefined; } };
    const har = e.flag.has(`tidsserie.${rolle}`);
    const v = læs(e.flag.get(`tidsserie.${rolle}`));
    if (v && typeof v === "object") {
        const o = v as { id?: unknown; sha256?: unknown };
        return { art: "serie", id: typeof o.id === "string" ? o.id.toLowerCase() : null, sha256: typeof o.sha256 === "string" ? o.sha256.toLowerCase() : null, valg: "ukendt" };
    }
    if (rolle === "varmelast") {
        if (har && (v === "syntetisk" || v === null)) return { art: "standard", valg: "udtrykkeligt" };
        const fil = læs(e.flag.get("heat_csv"));
        if (typeof fil === "string" && fil) return { art: "fil", fil, valg: "udtrykkeligt" };
        return { art: "standard", valg: "ukendt" };
    }
    return { art: "standard", valg: "arvet" };
}

const serieNøgle = (k: Tidsseriekilde): string => (k.art === "serie" ? `serie:${k.sha256 ?? `id:${k.id ?? "?"}`}` : k.art === "fil" ? `fil:${k.fil}` : "standard");
const serieTekst = (k: Tidsseriekilde, standard: string): string => (k.art === "serie" ? `tidsserie ${k.sha256 ? k.sha256.slice(0, 12) : "uden sha256"}` : k.art === "fil" ? k.fil : standard);

/**
 * Dommen over to kørslers varmelast eller solprofil (fund D, leads afgørelse):
 *
 *  * samme kilde (samme sha256, samme fil, begge standarden): ingen afvigelse;
 *  * forskellig, og mindst én af kørslerne har BEVISLIGT valgt sin udtrykkeligt: det er parrets ændring — den spærrer
 *    ikke (og står i inputforskellen og i *Scenariet fortalt*);
 *  * forskellig, og begge er bevisligt arvet fra værket: værkets grundlag er ændret mellem de to kørsler (en anden
 *    serie er gjort aktiv — uden at værksrevisionen skifter) → ikke direkte sammenlignelige;
 *  * ellers kan det ikke afgøres af det frosne → ukendt.
 *
 * Det frosne input beviser i dag aldrig "arvet" for en frossen serie (se `Tidsseriekilde`), så grenen "grundlaget er
 * ændret" nås først, når frysningen bærer valgets oprindelse; indtil da ender et skift af værkets aktive serie som
 * ukendt — aldrig som et grønt resultat, som før.
 */
export function tidsserieafvigelse(felt: "varmelast" | "solprofil", a: Tidsseriekilde | null | undefined, b: Tidsseriekilde | null | undefined): Afvigelse | null {
    const [navn, standard] = felt === "varmelast" ? ["Varmelast", "syntesen"] : ["Solprofil", "værkets egen profil"];
    if (!a || !b) return { felt, navn, a: a ? serieTekst(a, standard) : "ukendt", b: b ? serieTekst(b, standard) : "ukendt", alvor: "ukendt" };
    if (serieNøgle(a) === serieNøgle(b)) return null;
    if (a.valg === "udtrykkeligt" || b.valg === "udtrykkeligt") return null;
    const [ta, tb] = [serieTekst(a, standard), serieTekst(b, standard)];
    const lille = navn.toLowerCase();
    if (a.valg === "arvet" && b.valg === "arvet") {
        return { felt, navn: `Værkets ${lille}`, a: ta, b: tb, alvor: "advarsel",
            grund: `Værkets ${lille} er ikke den samme i de to kørsler (${ta} mod ${tb}), og ingen af dem har valgt den i scenariet: grundlaget er ændret mellem kørslerne.` };
    }
    return { felt, navn: `${navn}ens oprindelse`, a: ta, b: tb, alvor: "ukendt",
        grund: `De to kørsler har ikke samme ${lille} (${ta} mod ${tb}), og det frosne input viser ikke, om den er valgt i scenariet eller arvet fra værket.` };
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

/**
 * Hvor kørslens modelkode og df-data kom fra (runde 15, fund 3.6 fra den uafhængige test 18. november 2026).
 * Arbejderen henter begge som zip fra GitHub ved den pinnede commit og gemmer zippens sha256 i kørslens miljø
 * (`model_zip_sha256`, `data_zip_sha256`; fabric/fjv/runtime.py › sikr_repo, koersel.py). Står feltet der som `null`,
 * er mappen lagt i cachen på anden vis (testen brugte `git archive`): kørslen kan være helt rigtig, men appen har
 * ikke selv hentet koden og kan ikke stå inde for, at den er pinnens. En kørsel UDEN felterne (ældre motor, eller
 * intet miljø) har aldrig målt det — dér siges intet.
 */
export function kodeOprindelse(miljoe_json: string | null | undefined): { model: string | null; data: string | null; advarsler: string[] } {
    let m: Record<string, unknown> = {};
    try { const v = miljoe_json ? JSON.parse(miljoe_json) as unknown : null; if (v && typeof v === "object") m = v as Record<string, unknown>; } catch { /* intet miljø at læse */ }
    const sha = (k: string) => (typeof m[k] === "string" && m[k] ? m[k] as string : null);
    const tom = (k: string) => k in m && !sha(k);
    const advarsler: string[] = [];
    if (tom("model_zip_sha256")) advarsler.push("Modelkoden blev ikke hentet som zip fra GitHub af regnemotoren (kørslen har intet zip-fingeraftryk): mappen med koden er lagt i cachen på anden vis, så appen kan ikke selv stå inde for, at den er den pinnede commit.");
    if (tom("data_zip_sha256")) advarsler.push("df-data blev ikke hentet som zip fra GitHub af regnemotoren (kørslen har intet zip-fingeraftryk): appen kan ikke selv stå inde for, at datagrundlaget er den pinnede commit.");
    return { model: sha("model_zip_sha256"), data: sha("data_zip_sha256"), advarsler };
}

/**
 * En kørsels FROSNE sammenligningsprofil — den ene profil, både Analyser og Scenarier dømmer et par på
 * (kodegennemgangen af runde 15, fund 4; før havde Scenarier sin egen regel, og de to områder kunne sige grønt og
 * "kan ikke afgøres" om samme par). De felter, der afgør dommen (værk og revision, periode, opløsning, df-data,
 * modelversion, ønsket gab), læses KUN af det, der blev frosset eller målt for kørslen: rækkens egne felter,
 * manifestet og det frosne input. Scenariets levende felter bruges kun til VISNING af en periode for en kørsel, der
 * endnu intet manifest har (`periode_start`/`periode_slut`), og til noten om balancemarked.
 *
 * `input` må være kørslens KORTE frosne profil (`@/lib/data/frossen-profil`: kørslens egne rækker og værkets
 * tidsblok) — det er alt, profilen læser. Uden input kendes hverken den præcise periode eller varmelast og solprofil,
 * og en dom over profilen er da ukendt (efterprøvningen af rettelserne, fund D).
 */
export function profil(k: Koersel, vaerkNavn: string, scenarie?: Scenarie | null, input?: readonly InputRække[]): Profil {
    const mp = manifestPeriode(k);
    let medBal: boolean | null = scenarie ? scenarie.med_balancering : null;
    if (input) {
        const r = input.find((x) => x.sti === `${KOERSEL_PRAEFIKS}med_balancering`);
        if (r) medBal = r.vaerdi_json === "true";
    }
    const oploesning = k.oploesning ?? mp.oploesning ?? null;
    // Præcis periode (fund D, leads afgørelse): første kilde er den effektive periode udledt af det FROSNE input.
    // Manifestet bruges kun, hvor det selv bærer tidspunkter — modellen skriver rene datoer (src/manifest.py ›
    // _date10), og en dato siger ikke, om kørslen sluttede kl. 00 eller kl. 23 — og ellers som KONTROL: siger dets
    // datoer noget andet end det frosne input, kendes perioden ikke.
    const udledt = input ? effektivPeriode(input) : null;
    const tidspunkt = (v: string | null) => (v && !/^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? modeltid(v) : null);
    const [mf, mt] = [tidspunkt(mp.start), tidspunkt(mp.slut)];
    const maalt = mf !== null && mt !== null ? { fra: new Date(mf).toISOString(), til: new Date(mt).toISOString() } : null;
    let periode = udledt ?? maalt;
    if (udledt && maalt && (udledt.fra !== maalt.fra || udledt.til !== maalt.til)) periode = null;
    if (udledt && !maalt && mp.start && mp.slut && (mp.start.trim().slice(0, 10) !== udledt.fra.slice(0, 10) || mp.slut.trim().slice(0, 10) !== udledt.til.slice(0, 10))) periode = null;
    return {
        vaerk_id: k.vaerk_id, vaerk_navn: vaerkNavn, vaerk_revision: k.vaerk_revision ?? null,
        periode_start: mp.start?.slice(0, 10) ?? scenarie?.periode_start ?? udledt?.fra.slice(0, 10) ?? null,
        periode_slut: mp.slut?.slice(0, 10) ?? scenarie?.periode_slut ?? udledt?.til.slice(0, 10) ?? null,
        periode_fra: periode?.fra ?? null, periode_til: periode?.til ?? null,
        varmelast: input ? tidsseriekilde(input, "varmelast") : null, solprofil: input ? tidsseriekilde(input, "solprofil") : null,
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
 * data_commit, model_commit, mip_rel_gap og mip_abs_gap er ens — og, fra
 * runde 15, værkets revision (egen antagelse: §6b nævner den ikke). Tom liste
 * af advarsler = direkte sammenlignelige. Noter (balancering, miljø, en
 * ukendt revision) bryder ikke reglen, men skal kunne ses.
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
    // Fund D: samme effektive varmelast og solprofil — eller et bevisligt scenarievalg (tidsserieafvigelse).
    for (const felt of ["varmelast", "solprofil"] as const) {
        const af = tidsserieafvigelse(felt, a[felt], b[felt]);
        if (af) ud.push(af);
    }
    // Runde 15 (mail 1, den uafhængige test 18. november 2026): to kørsler ved hver sin værksrevision har hver sit værk
    // under sig — værket er rettet imellem dem — så differensen blander værksrettelsen med scenariets ændring. Kendes
    // begge revisioner, og er de forskellige, er parret IKKE direkte sammenligneligt (før: en note, og parret blev vist
    // som "Sammenlignelige" med grønt mærke). Kendes en af dem ikke (ældre kørsler), er det fortsat en note.
    if (a.vaerk_id === b.vaerk_id) {
        const rv = (x: number) => `r${x}`;
        if (!tom(a.vaerk_revision) && !tom(b.vaerk_revision) && a.vaerk_revision !== b.vaerk_revision) {
            ud.push({ felt: "vaerk_revision", navn: "Værkets revision", a: rv(a.vaerk_revision), b: rv(b.vaerk_revision), alvor: "advarsel" });
        } else tjek("vaerk_revision", "Værkets revision", vis(a.vaerk_revision, rv), vis(b.vaerk_revision, rv), "note");
    }
    tjek("med_balancering", "Balancemarked", vis(a.med_balancering, (x: boolean) => (x ? "med" : "uden")), vis(b.med_balancering, (x: boolean) => (x ? "med" : "uden")), "note");
    tjek("miljoe", "Beregningsmiljø", vis(a.miljoe), vis(b.miljoe), "note");
    return ud;
}

/** "a", "a og b", "a, b og c". */
function opremsning(xs: readonly string[]): string {
    return xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} og ${xs[xs.length - 1]}`;
}

/**
 * Dommen over et par, som HVERT sted, der viser en differens, skal spørge (runde 15, mail 1): kun et par med
 * `status: "ja"` må vises som et godt eller dårligt resultat — med virkningsfarve, et grønt mærke eller ordene
 * "billigere"/"dyrere end referencen". Ellers er `tekst` grunden i klartekst, og tallet er to kørsler side om side.
 */
export interface Dom { status: "ja" | "nej" | "ukendt"; tekst: string | null; afvigelser: Afvigelse[] }

export function sammenlignelighedsDom(a: Profil, b: Profil): Dom {
    const afvigelser = sammenlignelighed(a, b);
    const status = sammenlignelighedStatus(afvigelser);
    // En afvigelse med sin egen `grund` (fund D: varmelast og solprofil) siges som en hel sætning; resten opremses.
    const med = (alvor: Afvigelse["alvor"]) => afvigelser.filter((x) => x.alvor === alvor);
    const navne = (alvor: Afvigelse["alvor"]) => med(alvor).filter((x) => !x.grund).map((x) => x.navn.toLowerCase());
    const grunde = (alvor: Afvigelse["alvor"]) => med(alvor).flatMap((x) => (x.grund ? [x.grund] : []));
    const saml = (indledning: string, alvor: "advarsel" | "ukendt", hale: string) =>
        [navne(alvor).length ? `${indledning}: ${opremsning(navne(alvor))} ${hale}.` : `${indledning}.`, ...grunde(alvor)].join(" ");
    const tekst = status === "ja" ? null
        : status === "nej" ? saml("Kørslerne kan ikke sammenlignes direkte", "advarsel", "afviger")
            : saml("Det kan ikke afgøres, om kørslerne kan sammenlignes", "ukendt", "kendes ikke for begge");
    return { status, tekst, afvigelser };
}

/**
 * Dommen over to KØRSLER til Scenarier: rækkens felter, manifestet og — når de er hentet — kørslernes frosne input
 * (hele, eller den korte profil fra `@/lib/data/frossen-profil`). Samme profil og samme dom som Analyser.
 *
 * Efterprøvningen af rettelserne i runde 15, fund D: første runde lod Scenarier dømme på rækken alene, med
 * begrundelsen at den da kun kunne vide MINDRE. Det holdt ikke — perioden blev læst af manifestets rene datoer og
 * kunne give "ja", hvor de frosne input sagde "nej". Uden frosset input kan perioden nu slet ikke udledes, og dommen
 * er ukendt; med det er den Analysers.
 */
export function koerselsDom(a: Koersel, b: Koersel, inputA?: readonly InputRække[], inputB?: readonly InputRække[]): Dom {
    return sammenlignelighedsDom(profil(a, "", null, inputA), profil(b, "", null, inputB));
}

/** Navnene (med småt) på de felter, en dom afviser på (`advarsel`) eller ikke kender (`ukendt`). */
export function domNavne(dom: Dom, alvor: "advarsel" | "ukendt"): string[] {
    return dom.afvigelser.filter((x) => x.alvor === alvor).map((x) => x.navn.toLowerCase());
}

/** Sætningen, der står i stedet for et resultat, når parret ikke er direkte sammenligneligt. */
export const IKKE_ET_RESULTAT = "Forskellen i driftsomkostning er derfor ikke scenariets virkning.";

/**
 * Samme sætning efter dommen (kodegennemgangen af runde 15, fund 4): en UKENDT dom afviser ikke parret — den siger
 * kun, at forskellen ikke kan læses som en virkning, så længe grundlaget ikke kendes.
 */
export function ikkeEtResultat(dom: Dom): string {
    return dom.status === "ukendt" ? "Forskellen i driftsomkostning kan derfor ikke læses som scenariets virkning." : IKKE_ET_RESULTAT;
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

// ================================================================= tidsgrænsen: forslag om en længere

/** Stoppede solveren på tidsgrænsen? HiGHS' status er "time_limit"; alt med "time" tæller (som `loesningTekst`). */
export function stoppetPaaTid(s: string | null | undefined): boolean {
    return !!s && s.toLowerCase().includes("time");
}

/** Modellens tidsgrænse, når hverken værket eller scenariet sætter en (src/config.py › SolverConfig.time_limit). */
export const MODELLENS_TIDSGRAENSE_S = 600;

/**
 * Hvornår er usikkerheden "en væsentlig del" af differensen? EGEN ANTAGELSE (doc/TROFASTHED.md §5): når den er mindst
 * 10 % af |ΔRef|. Testrapportens målte tilfælde (Billund Spor B: 3.926 kr. af ca. 2,18 mio. kr. = 0,2 %) ligger langt
 * under, og dér holdt konklusionen; ved 10 % kan forskellens størrelse flytte sig mærkbart, selv om fortegnet holder.
 */
export const TIDSGRAENSE_VAESENTLIG_ANDEL = 0.1;

export interface TidsgraenseForslag {
    /** De kørsler, der stoppede på tidsgrænsen. */
    roller: ("referencen" | "scenariet")[];
    /** Summen af deres usikkerhed (højst så meget for højt); null hvis en af dem ikke kendes. */
    usikkerhed_kr: number | null;
    /** usikkerhed / |ΔRef|; null når usikkerheden er ukendt, Infinity når ΔRef er 0. */
    andel: number | null;
    tekst: string;
}

/**
 * Forslaget fra den uafhængige test 18. november 2026 (testrapportens afsnit 2a): stoppede en af et pars kørsler på
 * tidsgrænsen, og er usikkerheden en væsentlig del af ΔRef, så foreslå en ny kørsel med længere tidsgrænse. `graenser`
 * er de to kørslers tidsgrænse i sekunder [reference, scenarie] (null = ukendt), `maks` appens loft. Er usikkerheden
 * ukendt, foreslås det altid: forskellen kan da slet ikke vurderes. Null = intet at foreslå.
 */
export function tidsgraenseForslag(ref: Koersel, scen: Koersel, o: { graenser: readonly [number | null, number | null]; maks: number }): TidsgraenseForslag | null {
    if (tom(ref.objektiv_dkk) || tom(scen.objektiv_dkk)) return null;
    const ramt = ([["referencen", ref, o.graenser[0]], ["scenariet", scen, o.graenser[1]]] as const).filter(([, k]) => stoppetPaaTid(k.solve_status));
    if (ramt.length === 0) return null;
    const gab = ramt.map(([, k]) => absolutGab(k).kr);
    const usikkerhed_kr = gab.some((g) => g === null) ? null : gab.reduce<number>((a, g) => a + (g ?? 0), 0);
    const delta = Math.abs(scen.objektiv_dkk - ref.objektiv_dkk);
    const andel = usikkerhed_kr === null ? null : delta > 0 ? usikkerhed_kr / delta : Infinity;
    if (andel !== null && andel < TIDSGRAENSE_VAESENTLIG_ANDEL) return null;
    const roller = ramt.map(([r]) => r);
    const hvem = opremsning(roller);
    const grund = usikkerhed_kr === null ? "usikkerheden kendes ikke, så forskellen kan ikke vurderes"
        : !Number.isFinite(andel) ? `usikkerheden (højst ${tal(usikkerhed_kr)} kr.) er større end forskellen`
            : `usikkerheden (højst ${tal(usikkerhed_kr)} kr.) er ${tal((andel ?? 0) * 100)} % af forskellen på ${tal(delta)} kr.`;
    const kendte = ramt.map(([, , g]) => g).filter((g): g is number => g !== null);
    if (kendte.length === ramt.length && kendte.every((g) => g >= o.maks)) {
        return { roller, usikkerhed_kr, andel, tekst: `${hvem.charAt(0).toUpperCase()}${hvem.slice(1)} stoppede på tidsgrænsen, som allerede er appens højeste (${tal(o.maks)} s), og ${grund}. Del perioden i kortere vinduer, eller læs forskellen med den usikkerhed.` };
    }
    const nu = kendte.length ? `nu ${opremsning([...new Set(kendte)].map((g) => `${tal(g)} s`))}; ` : "";
    return { roller, usikkerhed_kr, andel, tekst: `Kør ${hvem} igen med en længere tidsgrænse (${nu}appen tillader op til ${tal(o.maks)} s): ${hvem} stoppede på tidsgrænsen, og ${grund}.` };
}

// ================================================================= CO₂: er udledningen opgjort?

/**
 * Brændsler, hvis forbrænding udleder fossil CO₂. Modelrepoets fossile brændsler ved 939228a er `natural_gas` og
 * `fuel_oil` (oliekedlen, v0.11.0; modelspejlets `vaerksark_typer`). De øvrige navne står her, så et nyt brændsel ikke
 * stille bliver regnet som CO₂-frit (egen antagelse — modellen har ingen liste over, hvad der er fossilt).
 */
const FOSSILT_BRAENDSEL = /^(natural_gas|fuel_oil|naturgas|gas|oil|gas_oil|gasoil|olie|fyringsolie|diesel|lpg|coal|kul)$/i;
/** Enhedstyper, der brænder fossilt, også hvis `fuel` mangler: modelrepoets gaskedel, gasmotor og oliekedel (`oil_boiler`). */
const FOSSIL_TYPE = /^(gas_boiler|gas_engine_chp|oil_boiler)$/;
/** Brændslets navn, som resten af appen skriver det (knapper.json → visningsnavne: "Naturgas", "Fyringsolie"), med småt. */
const braendselsnavn = (fuel: string): string => VISNINGSNAVNE.braendsel?.[fuel]?.toLowerCase() ?? fuel;

export interface Co2Opgoerelse {
    /**
     * `opgjort`: modellens `co2_ton` dækker alle fossile enheder, der producerede. `ikke_opgjort`: mindst én fossil enhed
     * med emissionsfaktor 0 PRODUCEREDE — tallet mangler dens udledning. `ukendt`: det kan ikke afgøres, fordi input
     * eller resultatdata mangler (kodegennemgangen af runde 15, fund 8).
     */
    status: "opgjort" | "ikke_opgjort" | "ukendt";
    /** Kun sand ved status `opgjort`: kun da må modellens tal vises som udledningen. */
    opgjort: boolean;
    /** De enheder, grunden handler om (producerede med faktor 0, eller kan ikke afgøres), sorteret. */
    enheder: string[];
    /** Grunden i klartekst (null når opgjort). */
    grund: string | null;
}

/** Ordet, visningerne skriver i stedet for et CO₂-tal: "ikke opgjort" eller "ukendt" ("" når opgjort). */
export function co2Etiket(o: Co2Opgoerelse): string {
    return o.status === "ikke_opgjort" ? "ikke opgjort" : o.status === "ukendt" ? "ukendt" : "";
}

/**
 * Er kørslens CO₂-udledning opgjort? (Runde 15, fund 4E fra den uafhængige test 18. november 2026.)
 *
 * Modellens `co2_ton` er Σ varme / eta_fuel_to_heat × `co2_emissions_per_mwh_fuel` over enhederne og springer en
 * enhed med faktoren 0 over (src/manifest.py:130-147; standarden er 0,0, src/config.py:504). Billund-casene har 0,0
 * på gasenhederne, fordi CO₂-omkostningen ligger i gasprisen — rigtigt for økonomien, men så er `co2_ton` 0 for et
 * værk, der brænder naturgas. Appen viste "CO₂-udledning 0 t".
 *
 * Appens regel (EGEN ANTAGELSE, doc/TROFASTHED.md §5), for hver tændt enhed med fossilt brændsel og emissionsfaktor ≤ 0:
 *
 *  - den PRODUCEREDE (produktion > 0, eller mindst ét driftsinterval) → udledningen er IKKE OPGJORT;
 *  - DOKUMENTERET nul (produktion 0 og 0 driftsintervaller) → den rører ikke opgørelsen;
 *  - tallene mangler (ingen nøgletal for enheden, eller 0,0 MWh uden antallet af driftsintervaller) → UKENDT.
 *
 * Driftsintervallerne er med, fordi modellen afrunder enhedens produktion til 0,1 MWh, før nøgletallet gemmes
 * (src/reporting.py:79, `round(prod, 1)`), men tæller intervallerne på den uafrundede (`> 1e-6`, :75): en oliekedel med
 * 0,04 MWh og én driftstime står med 0,0 MWh. Før (kodegennemgangen af runde 15, fund 8) blev det afrundede nul og en
 * helt manglende enhedsrække begge læst som "producerede ikke", så advarslen udeblev.
 *
 * Kendes kørslens frosne input slet ikke (ingen `units.*`-blade), kan det ikke ses, om en fossil enhed har faktoren 0
 * — også det er UKENDT. Biomasse med faktor 0 er modellens egen regel (neutral) og rører ikke opgørelsen.
 * Appen retter ikke tallet og gætter ingen faktor — den siger, at tallet mangler eller ikke kan afgøres, og hvorfor.
 */
export function co2Opgoerelse(input: readonly InputRække[], samlet: Pick<Samlet, "enheder">): Co2Opgoerelse {
    const e = effektivtInput(input).blade;
    const læs = (sti: string): unknown => { const r = e.get(sti); if (!r) return undefined; try { return JSON.parse(r.vaerdi_json) as unknown; } catch { return undefined; } };
    const tal_ = new Map(samlet.enheder.map((x) => [x.navn, x]));
    const navne = new Set<string>();
    for (const sti of e.keys()) { const m = /^units\.([^.]+)\./.exec(sti); if (m) navne.add(m[1]); }
    if (navne.size === 0) {
        return {
            status: "ukendt", opgjort: false, enheder: [],
            grund: "Kan ikke afgøres: kørslens frosne input kendes ikke, så det kan ikke ses, om en enhed på fossilt brændsel har emissionsfaktoren 0. "
                + "Modellens tal kan mangle dens udledning.",
        };
    }
    const ramt: { navn: string; braendsel: string }[] = [];
    const uafgjort: { navn: string; hvorfor: "ingen_tal" | "afrundet" }[] = [];
    for (const navn of [...navne].sort()) {
        if (læs(`units.${navn}.enabled`) === false) continue;
        const fuel = læs(`units.${navn}.fuel`), type = læs(`units.${navn}.type`);
        const fossil = (typeof fuel === "string" && FOSSILT_BRAENDSEL.test(fuel)) || (typeof type === "string" && FOSSIL_TYPE.test(type));
        if (!fossil) continue;
        const faktor = læs(`units.${navn}.co2_emissions_per_mwh_fuel`);
        if (typeof faktor === "number" && faktor > 0) continue;
        const x = tal_.get(navn);
        const mwh = x?.produktion_mwh, intervaller = x?.driftsintervaller ?? x?.driftstimer;
        const koerte = (mwh != null && mwh > 0) || (intervaller != null && intervaller > 0);
        if (koerte) { ramt.push({ navn, braendsel: typeof fuel === "string" ? braendselsnavn(fuel) : "fossilt brændsel" }); continue; }
        // Dokumenteret nul kræver BEGGE tal: 0,0 MWh alene er afrundet og kan dække over op til 0,05 MWh.
        if (mwh != null && intervaller != null) continue;
        uafgjort.push({ navn, hvorfor: mwh == null ? "ingen_tal" : "afrundet" });
    }
    if (ramt.length > 0) {
        const enheder = ramt.map((x) => x.navn);
        const braendsler = opremsning([...new Set(ramt.map((x) => x.braendsel))]);
        return {
            status: "ikke_opgjort", opgjort: false, enheder,
            grund: `Ikke opgjort: emissionsfaktoren (co2_emissions_per_mwh_fuel) er 0 for ${opremsning(enheder)}, som producerede varme på ${braendsler}. `
                + "Modellen regner da ingen udledning for dem — typisk fordi CO₂-omkostningen ligger i brændselsprisen. Økonomien er uændret; kun udledningen mangler.",
        };
    }
    if (uafgjort.length > 0) {
        const uden = uafgjort.filter((x) => x.hvorfor === "ingen_tal").map((x) => x.navn), afr = uafgjort.filter((x) => x.hvorfor === "afrundet").map((x) => x.navn);
        const dele = [
            ...(uden.length ? [`resultaterne har ingen nøgletal for ${opremsning(uden)}`] : []),
            ...(afr.length ? [`produktionen er afrundet til 0,0 MWh, og antallet af driftsintervaller mangler for ${opremsning(afr)}`] : []),
        ];
        return {
            status: "ukendt", opgjort: false, enheder: uafgjort.map((x) => x.navn),
            grund: `Kan ikke afgøres: emissionsfaktoren (co2_emissions_per_mwh_fuel) er 0 for ${opremsning(uafgjort.map((x) => x.navn))} på fossilt brændsel, og ${dele.join("; ")}. `
                + "Har enheden produceret, mangler dens udledning i modellens tal.",
        };
    }
    return { status: "opgjort", opgjort: true, enheder: [], grund: null };
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

/** `null` = ukendt: enheden findes i kørslen, men dens produktion mangler (Codex K9 F1). */
export interface EnhedVarians { navn: string; a: number | null; b: number | null; delta: number | null; relativ: number | null }

/** Typevagt: varianser med kendt Δ (til budskaber og fremhævning). */
export const kendtDelta = (v: EnhedVarians): v is EnhedVarians & { delta: number } => v.delta != null;

/** Rækkefølge: scenariets produktion, så referencens, største først; ukendt sidst. */
export const varianseOrden = (x: EnhedVarians, y: EnhedVarians) =>
    (y.b ?? -Infinity) - (x.b ?? -Infinity) || (y.a ?? -Infinity) - (x.a ?? -Infinity) || x.navn.localeCompare(y.navn);

/**
 * Produktion pr. enhed a vs b (MWh). Enheder der kun findes i én kørsel tæller som 0 i den anden. En enhed, kørslen
 * har, men uden produktionstal er ukendt (null) — aldrig 0 — og så er Δ og Δ% også ukendte (Codex K9 F1).
 */
export function produktionsvarians(a: readonly EnhedTal[], b: readonly EnhedTal[]): EnhedVarians[] {
    const ma = new Map(a.map((e) => [e.navn, e.produktion_mwh])), mb = new Map(b.map((e) => [e.navn, e.produktion_mwh]));
    const navne = [...new Set([...ma.keys(), ...mb.keys()])];
    const maks = (v: EnhedVarians) => Math.max(v.a ?? 0, v.b ?? 0);
    return navne.map((navn) => {
        const va = ma.has(navn) ? ma.get(navn)! : 0, vb = mb.has(navn) ? mb.get(navn)! : 0;
        return { navn, a: va, b: vb, delta: va == null || vb == null ? null : vb - va, relativ: relativAfvigelse(va, vb) };
    }).sort((x, y) => maks(y) - maks(x) || x.navn.localeCompare(y.navn));
}

/**
 * Sammenligningens budskab: "I scenariet overtager gaskedlen 1,2 GWh (mest fra
 * halmkedlen), og driften bliver 89.000 kr. dyrere".
 */
export function sammenligningsBudskab(varians: readonly EnhedVarians[], d: Difference | null, energiTekst: (mwh: number) => string): string {
    const kendt = varians.filter(kendtDelta);
    const op = [...kendt].sort((x, y) => y.delta - x.delta)[0];
    const ned = [...kendt].sort((x, y) => x.delta - y.delta)[0];
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
