//-----------------------------------------------------------------------
// Appens eget lag i værksarket (runde 14): fanerne "Start og drift",
// "Balancemarked" og "Øvrige felter".
//
// Modelrepoets skabelon og scripts/vaerksark_til_yaml.py bærer kun en del
// af et værk. Målt på katalogets 7 værker stod 71–106 felter på listen
// "ikke med i arket": hele balancemarkedet, tændt ved start, tankenes
// startfyldning og varmetab, idriftsættelsesår, CO2-faktor, unit
// commitment, den flade eltarif, nettilslutning, investering …
//
// Fanerne her er APPENS EGNE. Modelscriptet læser dem ikke (det åbner
// sine ark ved navn); appens import (fabric/fjv/arklag.py) læser dem og
// lægger værdierne oven på scriptets læsning. Denne fil er eksportens
// side: hvilke celler fanerne får, og PRÆCIS hvad importen læser tilbage
// — gaten kører importen på hver eksport og kræver, at de er enige
// (viden/vaerktoej/tjek_eksport_rundtur.py).
//
// Fanernes form er en fælles kontrakt med importen:
//   * feltblok: overskrift "felt" i kolonne A og en kolonne "sti i
//     modellen"; værdikolonnen hedder "værdi" — eller markedernes navne
//     (aFRR, mFRR), og stien har da {marked};
//   * tabel: overskrift "navn" / "tank" / "måned" i A, og lige under den
//     en række med "sti i modellen" og en stiskabelon pr. kolonne
//     ({enhed}, {tank}, {måned});
//   * Øvrige felter: overskrift "sti" | "værdi" | "kun hvis modelscriptet
//     giver"; teksten "(findes ikke)" fjerner feltet.
// I en feltblok og en tabel betyder en tom celle, at feltet ikke sættes.
// En række i Øvrige felter med en betingelse gælder kun, så længe
// modelscriptet læser netop den værdi af de øvrige faner — så laget
// aldrig tavst skjuler en celle, brugeren har rettet i modelrepoets faner.
//
// Typen kommer fra feltkataloget, ikke fra cellen (et regneark kender
// ikke forskel på 12 og 12.0): "number" læses som decimaltal, "integer"
// som heltal. Har værket et heltal, hvor kataloget siger tal (fx 96),
// bærer markeringen (_app) værkets egen skrivemåde ("former").
//-----------------------------------------------------------------------

import { findFelt, katalogOrden, type FeltPost } from "../katalog";
import { tjekFelt } from "../validering";
import type { Celle, Tab } from "./kort";
import { pyFloatTekst } from "./pyjson";
import { slug } from "./slug";
import { ref, ulovligtXmlTegn, type Celleværdi } from "./xlsx";

export const START_OG_DRIFT = "Start og drift";
export const BALANCEMARKED = "Balancemarked";
export const OEVRIGE = "Øvrige felter";
export const LAGFANER = [START_OG_DRIFT, BALANCEMARKED, OEVRIGE] as const;
export const FINDES_IKKE = "(findes ikke)";
export const STI_OVERSKRIFT = "sti i modellen";
const MAKS_CELLETEKST = 32_767;
const MARKEDER = [["afrr", "aFRR"], ["mfrr", "mFRR"]] as const;

/** Skabelonens stilarter (xl/styles.xml ved pinnen): samme farvekoder som modelrepoets faner. */
const STIL = { titel: 1, vejledning: 25, afsnit: 3, etiket: 4, tekst: 5, gul: 10, overskrift: 12, graa: 17, kode: 24, forklaring: 26, kant: 22 } as const;

// ------------------------------------------------------------------ celle <-> vaerdi_json (som fjv.feltkatalog)

const tal = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const STI_DEL = /^[^.\s][^.]*$/;
const FARLIGE = new Set(["__proto__", "constructor", "prototype"]);
const gyldigSti = (sti: string) => !!sti && sti.length <= 400 && sti.split(".").every((d) => STI_DEL.test(d) && !FARLIGE.has(d));
const SAND: Record<string, boolean> = { ja: true, nej: false, true: true, false: false, sand: true, falsk: false };
const heltalsliste = (t: FeltPost["tilladte"]) => !!t?.length && t.every((x) => typeof x === "number" && Number.isInteger(x));
const KODET_TEGN = /_x[0-9A-Fa-f]{4}_/;

/** To vaerdi_json er samme tal (kun skrivemåden er forskellig: 12 og 12.0). */
export function sammeTal(a: string, b: string): boolean {
    if (a === b) return false;
    let x: unknown, y: unknown;
    try { x = JSON.parse(a); y = JSON.parse(b); } catch { return false; }
    return tal(x) && tal(y) && Number(x.toPrecision(15)) === Number(y.toPrecision(15));
}

/** Hvorfor en tekst ikke kan stå i en celle og komme uændret tilbage — eller null. */
function tekstFejl(s: string): string | null {
    if (!s.trim()) return "en tom tekst kan ikke stå i en celle";
    if (s.length > MAKS_CELLETEKST) return "teksten er for lang til en celle";
    if (ulovligtXmlTegn(s) !== null || s.includes("\r")) return "teksten har et tegn, et regneark ikke kan gemme";
    if (KODET_TEGN.test(s)) return "teksten har en _xHHHH_-sekvens, som Excel læser som et kodet tegn";
    if (s.trim().toLowerCase() === FINDES_IKKE) return `teksten er ${FINDES_IKKE}, som fanen bruger til at fjerne et felt`;
    return null;
}

/**
 * Cellen, et blad står i, og det vaerdi_json importen læser tilbage (fjv.feltkatalog.fra_celle) — eller grunden
 * til, at bladet ikke kan stå i appens faner. `json` kan afvige fra bladets i skrivemåden (96 -> 96.0).
 */
export function celleFor(sti: string, vaerdiJson: string): { celle: Celleværdi; json: string } | { grund: string } {
    const post = findFelt(sti);
    if (!gyldigSti(sti) || !post || !post.blad) return { grund: "feltet findes ikke i feltkataloget, så importen kan ikke validere det" };
    const fund = tjekFelt(sti, vaerdiJson, post);
    if (fund) return { grund: `feltets regler afviser værdien (${fund.besked})` };
    let v: unknown;
    try { v = JSON.parse(vaerdiJson); } catch { return { grund: "værdien er ikke gyldig JSON" }; }
    if (v === null) return post.type === "string" ? { grund: "et tomt tekstfelt (null) kan ikke stå i en celle" } : { celle: "null", json: "null" };
    switch (post.type) {
        case "boolean":
            return typeof v === "boolean" ? { celle: v ? "ja" : "nej", json: v ? "true" : "false" } : { grund: "værdien er ikke ja/nej" };
        case "integer":
            return tal(v) ? { celle: v, json: String(v) } : { grund: "værdien er ikke et helt tal" };
        case "number":
            return tal(v) ? { celle: v, json: pyFloatTekst(v) } : { grund: "værdien er ikke et tal" };
        case "enum":
            if (heltalsliste(post.tilladte)) {
                if (!tal(v) || !Number.isInteger(v)) return { grund: "værdien er ikke et helt tal" };
                const kunNulEn = post.tilladte!.every((x) => x === 0 || x === 1);
                return { celle: kunNulEn ? (v === 1 ? "ja" : "nej") : v, json: String(v) };
            }
            if (typeof v !== "string" || v !== v.trim() || tekstFejl(v)) return { grund: "værdien kan ikke stå som tekst i en celle" };
            return { celle: v, json: JSON.stringify(v) };
        case "string": {
            if (typeof v !== "string") return { grund: "værdien er ikke tekst" };
            const fejl = tekstFejl(v);
            if (fejl) return { grund: fejl };
            // Kun den form, Python skriver (json.dumps, ensure_ascii=False), kommer tegn for tegn tilbage.
            return JSON.stringify(v) === vaerdiJson ? { celle: v, json: vaerdiJson } : { grund: "tekstens JSON-form er ikke den, importen skriver" };
        }
        case "list": {
            if (!Array.isArray(v)) return { grund: "værdien er ikke en liste" };
            const fejl = tekstFejl(vaerdiJson);
            return fejl ? { grund: fejl } : { celle: vaerdiJson, json: vaerdiJson };
        }
        case "object":
            return vaerdiJson === "{}" ? { celle: "{}", json: "{}" } : { grund: "en blok kan kun stå som en tom blok" };
    }
    return { grund: `feltets type (${post.type as string}) kan ikke stå i en celle` };
}

/** Kompakt JSON uden mellemrum uden for strenge (tallenes skrivemåde bevares). */
function kompakt(tekst: string): string {
    let ud = "", iStreng = false;
    for (let j = 0; j < tekst.length; j++) {
        const c = tekst[j];
        if (iStreng) { ud += c; if (c === "\\") ud += tekst[++j] ?? ""; else if (c === '"') iStreng = false; continue; }
        if (c === '"') { iStreng = true; ud += c; } else if (!/\s/.test(c)) ud += c;
    }
    return ud;
}

/**
 * En celle som vaerdi_json for feltet — TypeScript-udgaven af fjv.feltkatalog.fra_celle (vektorerne i
 * skema/vektorer/arklag/celler.json binder dem). Kaster med grunden. Bruges, når et uploadet ark vises før
 * bekræftelse; det gemte afgør importen.
 */
export function jsonFraCelle(sti: string, celle: number | string | boolean): string {
    const post = findFelt(sti);
    if (!post || !post.blad) throw new Error("stien findes ikke i feltkataloget (et felt, modellen ikke kender)");
    const navn = post.etiket, t = post.type;
    const vis = typeof celle === "string" ? `teksten "${celle.slice(0, 40)}"` : typeof celle === "boolean" ? (celle ? "sand" : "falsk") : `tallet ${String(celle).replace(".", ",")}`;
    const lille = typeof celle === "string" ? celle.trim().toLowerCase() : "";
    if (lille === "null" && t !== "string") return "null";
    if (typeof celle === "number" && !Number.isFinite(celle)) throw new Error(`${navn}: tallet er ikke endeligt`);
    switch (t) {
        case "boolean":
            if (typeof celle === "boolean") return celle ? "true" : "false";
            if (lille in SAND) return SAND[lille] ? "true" : "false";
            throw new Error(`${navn}: skriv ja eller nej (cellen indeholder ${vis})`);
        case "integer":
            if (typeof celle === "number" && Number.isInteger(celle)) return String(celle);
            throw new Error(`${navn}: skal være et helt tal (cellen indeholder ${vis})`);
        case "number":
            if (typeof celle === "number") return pyFloatTekst(celle);
            throw new Error(`${navn}: skal være et tal (cellen indeholder ${vis})`);
        case "enum":
            if (heltalsliste(post.tilladte)) {
                if (lille in SAND && post.tilladte!.every((x) => x === 0 || x === 1)) return SAND[lille] ? "1" : "0";
                if (typeof celle === "number" && Number.isInteger(celle)) return String(celle);
                throw new Error(`${navn}: skriv ja eller nej (cellen indeholder ${vis})`);
            }
            if (typeof celle === "string") return JSON.stringify(celle.trim());
            throw new Error(`${navn}: vælg en af ${(post.tilladte ?? []).join(", ")} (cellen indeholder ${vis})`);
        case "string":
            if (typeof celle === "string") return JSON.stringify(celle);
            if (typeof celle === "number" && /^\d{4}-\d{2}-\d{2}$/.test(String(post.eksempel ?? "")) && celle >= 20000 && celle <= 80000 && Number.isInteger(celle)) {
                return JSON.stringify(new Date(Date.UTC(1899, 11, 30) + celle * 86_400_000).toISOString().slice(0, 10));
            }
            throw new Error(`${navn}: skal være tekst (cellen indeholder ${vis}; skriv en apostrof foran, hvis Excel gør teksten til et tal eller en dato)`);
        case "list":
            if (typeof celle === "number") return `[${Number.isInteger(celle) ? String(celle) : pyFloatTekst(celle)}]`;
            if (typeof celle === "string") {
                for (const tekst of [celle, `[${celle}]`]) {
                    try { if (Array.isArray(JSON.parse(tekst))) return kompakt(tekst); } catch { /* prøv næste form */ }
                }
            }
            throw new Error(`${navn}: skal være en liste, fx [10,11,12] eller 10, 11, 12 (cellen indeholder ${vis})`);
        case "object":
            if (typeof celle === "string" && celle.replace(/ /g, "") === "{}") return "{}";
            throw new Error(`${navn}: er en blok og kan kun stå som en tom blok ({})`);
    }
    throw new Error(`${navn}: feltets type (${t as string}) kan ikke stå i en celle`);
}

// ------------------------------------------------------------------ fanernes felter

/** Kolonnerne pr. enhed i Start og drift — de felter pr. enhed, skabelonen ikke har (målt, se filens hoved). */
const ENHEDSFELTER = ["enabled", "initial_status", "uc_enabled", "co2_emissions_per_mwh_fuel", "commissioned", "notes"] as const;
/** Kolonnerne pr. tank. */
const TANKFELTER = ["enabled", "e_initial_mwh", "self_discharge_per_hour", "cycle_binding", "notes"] as const;
/** Balancemarkedets felter én gang pr. værk. */
const BALANCEFELTER = [
    "balancing.method", "balancing.robust_reservation", "balancing.ancillary_caps.total_mw", "balancing.shared_reserve_cap_mw",
    "balancing.bid_strategy.up_markup_dkk_mwh", "balancing.bid_strategy.up_markup_max_dkk_mwh",
    "balancing.bid_strategy.down_markdown_dkk_mwh", "balancing.bid_strategy.down_markdown_max_dkk_mwh",
    "balancing.activation.foresight", "balancing.activation.settle",
    "balancing.reservation_gate.enabled", "balancing.reservation_gate.mode",
    "balancing.availability.enabled", "balancing.availability.mode",
] as const;
/** Felterne pr. marked (aFRR, mFRR). */
const MARKEDSFELTER = [
    "balancing.reservation_gate.{marked}.block_mw", "balancing.reservation_gate.{marked}.cm_threshold_dkk_mw_h",
    "balancing.reservation_gate.{marked}.opportunity_cost.reference_unit", "balancing.reservation_gate.{marked}.opportunity_cost.floor_dkk_mw_h",
    "balancing.activation.{marked}.model", "balancing.activation.{marked}.k", "balancing.activation.{marked}.ramp_dkk_mwh",
] as const;
/** Kolonnerne pr. enhed i Balancemarked: lofter og enhedens egne ancillary-felter (ud over "kan byde" i Anlaeg). */
const BUDFELTER = [
    "balancing.ancillary_caps.per_unit_mw.{enhed}", "balancing.ancillary_caps.per_unit_market_mw.{enhed}.afrr",
    "balancing.ancillary_caps.per_unit_market_mw.{enhed}.mfrr", "units.{enhed}.ancillary.afrr_max_bid_mw",
    "units.{enhed}.ancillary.mfrr_max_bid_mw", "units.{enhed}.ancillary.available_from",
    "units.{enhed}.ancillary.bid_window.months", "units.{enhed}.ancillary.bid_window.hours_local",
] as const;
const MAANEDSFELT = "balancing.availability.{marked}.mw_by_month.{måned}";

/**
 * Felter, der aldrig bæres af laget — de vises fortsat på listen "ikke med i arket", med grunden.
 * Målt på katalogets værker er der kun ét: solprofilens sti. (Casens navn, titel og gruppe bæres som betingede
 * rækker i Øvrige felter: de gælder, så længe 'værkets navn' på arket Priser er uændret — som når et værk kopieres
 * i appen — og viger for et nyt navn.)
 */
export function undtaget(sti: string): string | null {
    if (sti.endsWith(".production_profile_path")) {
        return "solprofilen følger med som timeværdier (arket Solvarme) og bliver det nye værks aktive solprofil; feltet peger på den";
    }
    return null;
}

/** Feltets post med en konkret sti i stedet for pladsholderne (til etiket, enhed, forklaring og dropdown). */
const postFor = (skabelon: string) => findFelt(skabelon.replace("{enhed}", "x").replace("{tank}", "x").replace("{marked}", "afrr").replace("{måned}", "2026-01"));

const overskrift = (p: FeltPost | null, reserve: string) => (p ? `${p.etiket}${p.enhed ? ` (${p.enhed})` : ""}` : reserve);

function standardtekst(p: FeltPost | null): string {
    if (!p || p.standard === undefined || p.standard === null) return "";
    const s = p.standard;
    const vis = typeof s === "boolean" ? (s ? "ja" : "nej") : heltalsliste(p.tilladte) && p.tilladte!.every((x) => x === 0 || x === 1) ? (s === 1 ? "ja" : "nej") : String(s).replace(".", ",");
    return ` Tom celle = modellens standard: ${vis}.`;
}

/** Dropdownens værdier for et felt (ja/nej eller den lukkede liste) — eller null. */
function valg(p: FeltPost | null): string[] | null {
    if (!p) return null;
    if (p.type === "boolean") return ["ja", "nej"];
    if (p.type === "enum" && p.tilladte?.length) {
        if (heltalsliste(p.tilladte)) return p.tilladte.every((x) => x === 0 || x === 1) ? ["ja", "nej"] : p.tilladte.map(String);
        return p.tilladte.map(String);
    }
    return null;
}

// ------------------------------------------------------------------ planen

export interface Validering { sqref: string; liste: string[]; titel: string }
export interface Faneform {
    navn: string;
    kolonner: number[];
    frysRækker: number;
    flet: string[];
    valideringer: Validering[];
    højder: [number, number][];
}

export interface Lagkilde {
    /** Værkets blade (sti -> vaerdi_json) og deres rækkefølge. */
    værk: ReadonlyMap<string, string>;
    /** Modelscriptets læsning af arkets øvrige faner, i værkets egne navne. */
    script: ReadonlyMap<string, string>;
    /** Enhederne og tankene i Anlaeg, i arkets rækkefølge (værkets navne). */
    enheder: readonly { navn: string; type: string }[];
    tanke: readonly string[];
}

export interface Lagplan {
    celler: Celle[];
    faner: Faneform[];
    /** Det, importen gemmer ved upload som nyt værk (i værkets egne navne): scriptets læsning + laget + formerne. */
    endelig: Map<string, string>;
    /** Skrivemåder til markeringen: sti -> værkets vaerdi_json, hvor kun tallets form er forskellig. */
    former: Record<string, string>;
    /** Det, der stadig ikke er med — undtagelserne og det, en celle ikke kan bære. */
    ikkeMed: Tab[];
    /** Antal felter pr. fane (til eksportkortet). */
    antal: Record<string, number>;
}

class Fane {
    readonly celler: Celle[] = [];
    readonly flet: string[] = [];
    readonly valideringer: Validering[] = [];
    readonly højder: [number, number][] = [];
    r = 1;
    constructor(readonly navn: string, readonly kolonner: number[], readonly bredde: number) {}
    sæt(kol: number, v: Celleværdi, stil: number, række = this.r) { this.celler.push({ ark: this.navn, ref: ref(kol, række), v, stil }); }
    /** Én tekst over hele fanens bredde (flettet), med en højde der passer til teksten. */
    tekst(v: string, stil: number, linjer = 1) {
        this.sæt(1, v, stil);
        this.flet.push(`A${this.r}:${ref(this.bredde, this.r)}`);
        if (linjer > 1) this.højder.push([this.r, 13.5 * linjer + 3]);
        this.r++;
    }
    liste(kol: number, fra: number, til: number, p: FeltPost | null) {
        const l = valg(p);
        if (l && til >= fra) this.valideringer.push({ sqref: `${ref(kol, fra)}:${ref(kol, til)}`, liste: l, titel: p!.etiket.slice(0, 30) });
    }
    form(frysRækker: number): Faneform {
        return { navn: this.navn, kolonner: this.kolonner, frysRækker, flet: this.flet, valideringer: this.valideringer, højder: this.højder };
    }
}

const EGEN_FANE = "Denne fane er appens egen. Modelrepoets script (scripts/vaerksark_til_yaml.py) læser den ikke: appen læser den ved upload og lægger værdierne oven på det, scriptet læser af de øvrige faner.";

/** Planen for appens tre faner og det, importen læser tilbage. */
export function planlægLag(k: Lagkilde): Lagplan {
    const slut = new Map(k.script);
    const grunde = new Map<string, string>();
    const antal: Record<string, number> = { [START_OG_DRIFT]: 0, [BALANCEMARKED]: 0, [OEVRIGE]: 0 };
    // En enhed eller tank, der IKKE står i Anlaeg, bæres af Øvrige felter — men kun hel. Kan ét af dens felter ikke
    // stå i en celle (fx en type, feltkataloget ikke kender), ville resten give et værk, modellen ikke kan indlæse,
    // og importen ville afvise hele arket. Da holdes objektet ude og står på listen med grunden.
    const iArk: Record<string, Set<string>> = { units: new Set(k.enheder.map((e) => e.navn)), storage: new Set(k.tanke) };
    const udenfor = new Map<string, string>();
    for (const [sti, vv] of k.værk) {
        const d = sti.split(".");
        if ((d[0] !== "units" && d[0] !== "storage") || d.length < 3 || iArk[d[0]].has(d[1]) || udenfor.has(`${d[0]}.${d[1]}`)) continue;
        const c = celleFor(sti, vv);
        if ("grund" in c) udenfor.set(`${d[0]}.${d[1]}`, `${d[0] === "units" ? "enheden" : "tanken"} ${d[1]} kan ikke stå i arket, fordi ${d.slice(2).join(".")} ikke kan: ${c.grund}`);
    }
    const holdtUde = (sti: string) => { const d = sti.split("."); return d.length > 2 ? udenfor.get(`${d[0]}.${d[1]}`) : undefined; };
    const alleEnheder = new Set([...k.værk.keys()].filter((s) => s.startsWith("units.") && s.split(".").length > 2 && !udenfor.has(`units.${s.split(".")[1]}`)).map((s) => s.split(".")[1]));

    /** En peger på en enhed (referenceenhed, per_unit) skal ramme en enhed i værket — ellers afviser importen arket. */
    const peger = (sti: string, json: string): string | null => {
        const d = sti.split(".");
        const mangler = (n: unknown) => typeof n === "string" && !alleEnheder.has(n);
        if (d[0] === "balancing" && d[1] === "ancillary_caps" && (d[2] === "per_unit_mw" || d[2] === "per_unit_market_mw") && d.length >= 4 && mangler(d[3])) return `enheden ${d[3]} findes ikke i værket`;
        try {
            const v: unknown = JSON.parse(json);
            if (d[0] === "balancing" && d.slice(-2).join(".") === "opportunity_cost.reference_unit" && mangler(v)) return `referenceenheden ${String(v)} findes ikke i værket`;
            if (d[0] === "ancillary_groups" && d.length === 3 && d[2] === "units" && Array.isArray(v) && v.some(mangler)) return "budgruppen nævner en enhed, der ikke findes i værket";
        } catch { /* tjekFelt har sagt det */ }
        return null;
    };

    /** En celle i en feltblok eller tabel: værkets værdi, eller tom (= feltet sættes ikke). */
    const felt = (f: Fane, kol: number, sti: string, stil: number = STIL.gul) => {
        const vv = k.værk.get(sti);
        const c = vv === undefined ? null : celleFor(sti, vv);
        const grund = c && "grund" in c ? c.grund : vv !== undefined ? peger(sti, vv) : null;
        if (c && "celle" in c && !grund) {
            f.sæt(kol, c.celle, stil);
            slut.set(sti, c.json);
            antal[f.navn]++;
            return;
        }
        if (grund) grunde.set(sti, grund);
        f.sæt(kol, null, stil);
        slut.delete(sti);
    };

    // ---------------------------------------------------------------- Start og drift
    const sd = new Fane(START_OG_DRIFT, [24, 18, 12, 16, 22, 22, 16, 60], 8);
    sd.tekst("Start og drift — appens egne felter", STIL.titel);
    sd.tekst(`${EGEN_FANE} Gul = udfyld. Én række pr. enhed og pr. tank, med navnet præcis som i Anlaeg. En tom celle betyder, at feltet ikke sættes, og at modellen bruger sin standard (står under tabellen). En enhed uden række her får modelscriptets egne værdier: slukket ved start, CO₂-faktor 0,2 for gas, start/stop-logik efter minimumslasten.`, STIL.vejledning, 4);
    sd.r++;
    const tabel = (f: Fane, nøgle: string, pladsholder: string, navne: readonly { navn: string; ekstra?: string }[], felter: readonly string[], plads: number, ekstraOverskrift?: string) => {
        const hoved = f.r, teknik = f.r + 1, første = f.r + 2;
        const forskyd = ekstraOverskrift ? 1 : 0;
        f.sæt(1, nøgle, STIL.overskrift, hoved);
        f.sæt(1, STI_OVERSKRIFT, STIL.kode, teknik);
        if (ekstraOverskrift) { f.sæt(2, ekstraOverskrift, STIL.overskrift, hoved); f.sæt(2, null, STIL.kode, teknik); }
        const poster = felter.map((x) => postFor(x));
        felter.forEach((skabelon, j) => {
            // To kolonner for samme felt pr. marked (…{enhed}.afrr og .mfrr) får markedets navn foran.
            const marked = MARKEDER.find(([m]) => skabelon.endsWith(`.${m}`))?.[1];
            f.sæt(2 + forskyd + j, `${marked ? `${marked}: ` : ""}${overskrift(poster[j], skabelon)}`, STIL.overskrift, hoved);
            f.sæt(2 + forskyd + j, skabelon, STIL.kode, teknik);
        });
        f.højder.push([hoved, 33.75]);
        const rækker = Math.max(plads, navne.length);
        for (let j = 0; j < rækker; j++) {
            f.r = første + j;
            const n = navne[j];
            f.sæt(1, n ? n.navn : null, n ? STIL.graa : STIL.gul);
            if (ekstraOverskrift) f.sæt(2, n?.ekstra ?? null, n ? STIL.graa : STIL.gul);
            felter.forEach((skabelon, i) => {
                if (n) felt(f, 2 + forskyd + i, skabelon.replace(pladsholder, n.navn));
                else f.sæt(2 + forskyd + i, null, STIL.gul);
            });
        }
        felter.forEach((_, j) => f.liste(2 + forskyd + j, første, første + rækker - 1, poster[j]));
        f.r = første + rækker + 1;
        return poster;
    };
    const forklar = (f: Fane, titel: string, felter: readonly string[], poster: readonly (FeltPost | null)[], kolTekst: number) => {
        f.sæt(1, titel, STIL.afsnit);
        f.r++;
        const set = new Set<string>();
        felter.forEach((skabelon, j) => {
            const p = poster[j];
            if (set.has(p?.etiket ?? skabelon)) return;                     // samme felt pr. marked forklares én gang
            set.add(p?.etiket ?? skabelon);
            f.sæt(1, p?.etiket ?? skabelon, STIL.etiket);
            f.sæt(kolTekst, `${p?.forklaring ?? ""}${standardtekst(p)}`.trim(), STIL.tekst);
            f.flet.push(`${ref(kolTekst, f.r)}:${ref(f.bredde, f.r)}`);
            f.højder.push([f.r, 30]);
            f.r++;
        });
        f.r++;
    };
    const enhedSkabeloner = ENHEDSFELTER.map((x) => `units.{enhed}.${x}`);
    const ep = tabel(sd, "navn", "{enhed}", k.enheder.map((e) => ({ navn: e.navn, ekstra: e.type })), enhedSkabeloner, 19, "type (fra Anlaeg)");
    forklar(sd, "Hvad felterne betyder (enheder)", enhedSkabeloner, ep, 3);
    const tankSkabeloner = TANKFELTER.map((x) => `storage.{tank}.${x}`);
    const tp = tabel(sd, "tank", "{tank}", k.tanke.map((n) => ({ navn: n })), tankSkabeloner, 6);
    forklar(sd, "Hvad felterne betyder (tanke)", tankSkabeloner, tp, 3);

    // ---------------------------------------------------------------- Balancemarked
    const bm = new Fane(BALANCEMARKED, [36, 22, 22, 18, 46, 46, 18, 24, 24], 9);
    bm.tekst("Balancemarked — appens egne felter", STIL.titel);
    bm.tekst(`${EGEN_FANE} Modelscriptet skriver altid en case uden balancemarked; her står værkets egen balancing-blok og enhedernes budfelter. Gul = udfyld. En tom celle betyder, at feltet ikke sættes; en helt tom fane er et værk uden balancemarked. Om en enhed kan byde, står stadig i Anlaeg (kolonnen 'kan byde i balancemarked'). Metoden står i modelrepoets doc/BUDSTRATEGI.md.`, STIL.vejledning, 4);
    bm.r++;
    bm.sæt(1, "Metode, bud og lofter", STIL.afsnit); bm.r++;
    const feltblok = (f: Fane, felter: readonly string[], markeder: boolean) => {
        const kolEnhed = markeder ? 4 : 3, kolForklaring = kolEnhed + 1, kolSti = kolEnhed + 2;
        f.sæt(1, "felt", STIL.overskrift);
        if (markeder) MARKEDER.forEach(([, navn], j) => f.sæt(2 + j, navn, STIL.overskrift)); else f.sæt(2, "værdi", STIL.overskrift);
        f.sæt(kolEnhed, "enhed", STIL.overskrift); f.sæt(kolForklaring, "forklaring", STIL.overskrift); f.sæt(kolSti, STI_OVERSKRIFT, STIL.overskrift);
        f.r++;
        for (const skabelon of felter) {
            const p = postFor(skabelon);
            f.sæt(1, p?.etiket ?? skabelon, STIL.etiket);
            if (markeder) {
                MARKEDER.forEach(([m], j) => {
                    felt(f, 2 + j, skabelon.replace("{marked}", m));
                    f.liste(2 + j, f.r, f.r, p);
                });
            } else {
                felt(f, 2, skabelon);
                f.liste(2, f.r, f.r, p);
            }
            f.sæt(kolEnhed, p?.enhed ?? null, STIL.kode);
            f.sæt(kolForklaring, `${p?.forklaring ?? ""}${standardtekst(p)}`.trim(), STIL.forklaring);
            f.sæt(kolSti, skabelon, STIL.kode);
            f.højder.push([f.r, 30]);
            f.r++;
        }
        f.r++;
    };
    feltblok(bm, BALANCEFELTER, false);
    bm.sæt(1, "Pr. marked", STIL.afsnit); bm.r++;
    feltblok(bm, MARKEDSFELTER, true);
    bm.sæt(1, "Pr. enhed — lofter og enhedens egne budfelter", STIL.afsnit); bm.r++;
    const bp = tabel(bm, "navn", "{enhed}", k.enheder.map((e) => ({ navn: e.navn })), BUDFELTER, k.enheder.length + 2);
    forklar(bm, "Hvad felterne betyder (pr. enhed)", BUDFELTER, bp, 2);
    bm.sæt(1, "Månedsloft på reservationen (balancing.availability)", STIL.afsnit); bm.r++;
    {
        const måneder = [...new Set([...k.værk.keys()].map((s) => /^balancing\.availability\.(afrr|mfrr)\.mw_by_month\.(\d{4}-\d{2})$/.exec(s)?.[2]).filter((x): x is string => !!x))].sort();
        const hoved = bm.r, teknik = bm.r + 1, første = bm.r + 2;
        const p = postFor(MAANEDSFELT);
        bm.sæt(1, "måned", STIL.overskrift, hoved); bm.sæt(1, STI_OVERSKRIFT, STIL.kode, teknik);
        MARKEDER.forEach(([m, navn], j) => {
            bm.sæt(2 + j, `${navn}: ${overskrift(p, "månedsloft")}`, STIL.overskrift, hoved);
            bm.sæt(2 + j, MAANEDSFELT.replace("{marked}", m), STIL.kode, teknik);
        });
        bm.højder.push([hoved, 33.75]);
        const rækker = måneder.length + 6;
        for (let j = 0; j < rækker; j++) {
            bm.r = første + j;
            const md = måneder[j];
            bm.sæt(1, md ?? null, STIL.gul);
            MARKEDER.forEach(([m], i) => {
                const sti = MAANEDSFELT.replace("{marked}", m).replace("{måned}", md ?? "");
                // En måned uden værdi i cellen er ikke et felt (importen springer den over) — den fjerner intet.
                if (md && k.værk.has(sti)) felt(bm, 2 + i, sti); else bm.sæt(2 + i, null, STIL.gul);
            });
        }
        bm.r = første + rækker;
        bm.sæt(1, `Måneden skrives ÅÅÅÅ-MM (fx 2026-03). ${p?.forklaring ?? ""}`.trim(), STIL.tekst);
        bm.flet.push(`A${bm.r}:${ref(bm.bredde, bm.r)}`);
        bm.højder.push([bm.r, 30]);
    }

    // ---------------------------------------------------------------- Øvrige felter
    const ov = new Fane(OEVRIGE, [56, 28, 28, 36, 70], 5);
    ov.tekst("Øvrige felter — appens egne felter", STIL.titel);
    ov.tekst(`${EGEN_FANE} Her står hvert felt i værket, som hverken modelrepoets faner eller de to andre af appens faner bærer: sti, værdi og forklaring fra feltkataloget. Gul = ret her. Teksten ${FINDES_IKKE} som værdi betyder, at værket ikke har feltet (modelscriptet ville ellers skrive det). Står der noget i kolonnen 'kun hvis modelscriptet giver', gælder rækken kun, så længe modelscriptet læser netop den værdi af de øvrige faner — retter du fx tankens maks fyldning i Anlaeg, vinder din rettelse, og importens log siger, at rækken ikke blev brugt. En ny række: skriv feltets sti (den står under hvert felt i appen), værdien, og lad den tredje kolonne stå tom. ja/nej for til/fra, lister som [10,11,12], null for et felt, der står tomt i værket.`, STIL.vejledning, 6);
    ov.r++;
    ["sti", "værdi", "kun hvis modelscriptet giver", "felt", "forklaring"].forEach((t, j) => ov.sæt(1 + j, t, STIL.overskrift));
    ov.højder.push([ov.r, 33.75]);
    const ovHoved = ov.r;
    ov.r++;
    const former: Record<string, string> = {};
    const rest = [...new Set([...k.værk.keys(), ...slut.keys()])]
        .filter((sti) => k.værk.get(sti) !== slut.get(sti))
        .sort((a, b) => (katalogOrden(a) - katalogOrden(b)) || (a < b ? -1 : a > b ? 1 : 0));
    for (const sti of rest) {
        const vv = k.værk.get(sti), sv = slut.get(sti), script = k.script.get(sti);
        if (vv !== undefined && sv !== undefined && sammeTal(vv, sv)) continue;           // kun skrivemåden: former (nedenfor)
        const u = undtaget(sti) ?? holdtUde(sti);
        if (u) { grunde.set(sti, u); continue; }
        if (grunde.has(sti)) continue;                                                     // en celle i en af de andre faner kunne ikke bære det
        const værdi = vv === undefined ? { celle: FINDES_IKKE as Celleværdi, json: null as string | null } : celleFor(sti, vv);
        // Et felt, værket IKKE har, kan kun fjernes, hvis stien er kendt (importen afviser en ukendt sti).
        const kendt = !!findFelt(sti)?.blad && gyldigSti(sti);
        const betingelse = script === undefined ? null : celleFor(sti, script);
        const grund = !kendt ? "feltet findes ikke i feltkataloget, så importen kan ikke validere det"
            : "grund" in værdi ? værdi.grund
                : betingelse && "grund" in betingelse ? `modelscriptets værdi kan ikke stå i en celle (${betingelse.grund})`
                    : vv !== undefined ? peger(sti, vv) : null;
        if (grund || "grund" in værdi) { grunde.set(sti, grund ?? "værdien kan ikke stå i en celle"); continue; }
        const p = findFelt(sti);
        ov.sæt(1, sti, STIL.kant);
        ov.sæt(2, værdi.celle, STIL.gul);
        ov.sæt(3, betingelse && "celle" in betingelse ? betingelse.celle : null, STIL.graa);
        ov.sæt(4, overskrift(p, ""), STIL.kode);
        ov.sæt(5, p?.forklaring ?? "", STIL.forklaring);
        ov.r++;
        antal[OEVRIGE]++;
        if (værdi.json === null) slut.delete(sti); else slut.set(sti, værdi.json);
    }
    // Plads til nye rækker (gule), så en ny række ikke kræver formatering.
    for (let j = 0; j < 10; j++) { ov.sæt(1, null, STIL.gul); ov.sæt(2, null, STIL.gul); ov.sæt(3, null, STIL.graa); ov.r++; }

    // ---------------------------------------------------------------- skrivemåder og det, der ikke er med
    for (const [sti, vv] of k.værk) {
        const sv = slut.get(sti);
        if (sv !== undefined && sammeTal(vv, sv)) { former[sti] = vv; slut.set(sti, vv); }
    }
    const ikkeMed: Tab[] = [];
    for (const sti of [...new Set([...k.værk.keys(), ...slut.keys()])].sort()) {
        const vv = k.værk.get(sti) ?? null, sv = slut.get(sti) ?? null;
        if (vv === sv) continue;
        const grund = grunde.get(sti);
        ikkeMed.push({ sti, værk: vv, script: sv, ...(grund ? { grund } : {}) });
    }
    return {
        celler: [...sd.celler, ...bm.celler, ...ov.celler],
        faner: [sd.form(5), bm.form(2), ov.form(ovHoved)],
        endelig: slut, former, ikkeMed, antal,
    };
}

// ------------------------------------------------------------------ læsning (til visningen af et uploadet ark)

type V = number | string;
const norm = (v: V | undefined) => (typeof v === "string" ? v.split(/\s+/).join(" ").trim().toLowerCase() : "");
const UDEN_VAERDI = new Set(["", "felt", "enhed", "forklaring", "standard", STI_OVERSKRIFT]);

export interface Lagcelle { sti: string; v: V | undefined; hvor: string; betingelse?: V }

/**
 * Appens faner i et uploadet ark som (sti -> celle) — samme form som importen læser (fjv.arklag.laes), men uden
 * validering: det er til visningen af, hvad brugeren har ændret, før noget sendes. Stierne står i arkets navne.
 */
export function læsLag(ark: ReadonlyMap<string, ReadonlyMap<string, V>>): Map<string, Lagcelle> {
    const ud = new Map<string, Lagcelle>();
    for (const navn of LAGFANER) {
        const c = ark.get(navn);
        if (!c) continue;
        let sidste = 0, bredde = 0;
        for (const key of c.keys()) {
            const m = /^([A-Z]+)(\d+)$/.exec(key);
            if (!m) continue;
            sidste = Math.max(sidste, Number(m[2]));
            let kol = 0;
            for (const ch of m[1]) kol = kol * 26 + ch.charCodeAt(0) - 64;
            bredde = Math.max(bredde, kol);
        }
        const celle = (r: number, kol: number) => c.get(ref(kol, r));
        const kolMed = (r: number, tekst: string, præfiks = false) => {
            for (let kol = 1; kol <= bredde; kol++) { const t = norm(celle(r, kol)); if (t && (t === tekst || (præfiks && t.startsWith(tekst)))) return kol; }
            return 0;
        };
        const sæt = (sti: string, r: number, kol: number, betingelse?: V) => ud.set(sti, { sti, v: celle(r, kol), hvor: `${navn}!${ref(kol, r)}`, ...(betingelse !== undefined ? { betingelse } : {}) });
        let r = 1;
        while (r <= sidste) {
            const a = norm(celle(r, 1));
            const p = a === "felt" ? kolMed(r, STI_OVERSKRIFT) : 0;
            if (p) {
                const kolonner: [number, string][] = [];
                for (let kol = 2; kol < p; kol++) { const h = norm(celle(r, kol)); if (!UDEN_VAERDI.has(h)) kolonner.push([kol, h]); }
                for (r++; r <= sidste; r++) {
                    const skabelon = celle(r, p);
                    if (typeof skabelon !== "string" || !skabelon.trim()) break;
                    for (const [kol, h] of kolonner) sæt(h === "værdi" ? skabelon.trim() : skabelon.trim().replace("{marked}", h), r, kol);
                }
            } else if (["navn", "tank", "måned"].includes(a) && norm(celle(r + 1, 1)) === STI_OVERSKRIFT) {
                const t = r + 1;
                const kolonner: [number, string][] = [];
                for (let kol = 2; kol <= bredde; kol++) { const s = celle(t, kol); if (typeof s === "string" && s.trim()) kolonner.push([kol, s.trim()]); }
                for (r = t + 1; r <= sidste; r++) {
                    const nøgle = celle(r, 1);
                    if (nøgle === undefined || !String(nøgle).trim()) break;
                    for (const [kol, s] of kolonner) {
                        if (s.includes("{måned}") && celle(r, kol) === undefined) continue;
                        sæt(s.replace(/\{enhed\}|\{tank\}|\{måned\}/, String(nøgle).trim()), r, kol);
                    }
                }
            } else if (a === "sti" && navn === OEVRIGE && kolMed(r, "værdi")) {
                const kv = kolMed(r, "værdi"), kb = kolMed(r, "kun hvis", true);
                for (r++; r <= sidste; r++) {
                    const sti = celle(r, 1);
                    if (typeof sti === "string" && sti.trim()) sæt(sti.trim(), r, kv, kb ? celle(r, kb) : undefined);
                }
            } else r++;
        }
    }
    return ud;
}

export { slug };
