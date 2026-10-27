//-----------------------------------------------------------------------
// Temasystemets kerne — ren logik, ingen DOM og ingen import.meta, så den
// også køres af scripts/kontrast.ts direkte i Node. Formatet er beskrevet i
// app/TEMAER.md; kør `node scripts/kontrast.ts` efter enhver farveændring.
//
// Et tema = én JSON-fil med `lys` og `moerk`. Mangler en nøgle i en modus,
// arves den fra basistemaet ("nordisk") i samme modus — så et installations-
// tema kan nøjes med de farver, der adskiller det.
//
// Tokens skrives ind på de CSS-variabler, appen ALLEREDE bruger (--dash-*,
// --color-*, --fjv-serie-*), så ingen side skal ændres for at få et tema.
//-----------------------------------------------------------------------

import { afstand, bland, erHex, kontrast, luminans, oklch } from "./farve.ts";

export type Modus = "lys" | "moerk";
export const MODI: readonly Modus[] = ["lys", "moerk"];
export const BASISTEMA = "nordisk";

/** Enkeltfarver pr. modus. */
export const FARVER = [
    "baggrund", "flade", "flade_haevet", "flade_hover", "flade_valgt",
    "tekst", "tekst_2", "tekst_3",
    "streg", "streg_felt", "gitter",
    "primaer", "primaer_tekst", "accent", "accent_2", "fokus",
    "pos", "neg", "advarsel",
    "serie_oevrige", "ac", "py", "pl", "delta_pos", "delta_neg", "delta_neutral",
    "heatmap_op", "heatmap_ned", "heatmap_groen", "heatmap_roed", "heatmap_blaa",
] as const;
export type Farve = (typeof FARVER)[number];

/** Farverækker pr. modus og deres længder (signatur: 1–4). */
export const RAEKKER = { serie: 8, sekventiel: 5, divergerende: 5, signatur: 4 } as const;
export type Raekke = keyof typeof RAEKKER;

export type ModusTokens = Record<Farve, string> & Record<Raekke, string[]> & { skygge_kort: string };

export interface Kilde { rolle: string; farve: string; kilde: string; dato: string; metode?: string }

export interface Tema {
    id: string;
    navn: string;
    beskrivelse: string;
    /** Højeste tal blandt de installerede temaer bliver standard. */
    standard: number;
    uofficielt: boolean;
    /** Teksten under navnet i vælgeren, når temaet er uofficielt (står i temafilen, ikke i koden: brief 22). */
    maerke?: string;
    kilder: Kilde[];
    skrift?: { base?: string; tal?: string };
    form?: { radius_kort?: number; radius_felt?: number };
    lys: ModusTokens;
    moerk: ModusTokens;
}

/** Et tema som det står i filen: alt pr. modus er valgfrit (arves). */
export type TemaFil = Omit<Tema, "lys" | "moerk" | "standard" | "uofficielt" | "kilder"> & {
    standard?: number; uofficielt?: boolean; kilder?: Kilde[];
    lys?: Partial<ModusTokens>; moerk?: Partial<ModusTokens>;
};


// ---------------------------------------------------------------------------
// Struktur
// ---------------------------------------------------------------------------

const ID = /^[a-z0-9_-]{2,40}$/;
const SKRIFT = /^[\w\s'",.()-]{1,300}$/; // ingen ; { } < — værdien skrives ind i et <style>
const SKYGGE = /^(none|[\w\s#(),.%-]{1,200})$/;

/** Tjekker en temafil. Returnerer fejl som læsbare sætninger (tom liste = gyldig). */
export function validerFil(raa: unknown, filnavn = "temaet"): string[] {
    const f: string[] = [];
    if (typeof raa !== "object" || raa === null || Array.isArray(raa)) return [`${filnavn}: skal være et JSON-objekt`];
    const t = raa as Record<string, unknown>;
    if (typeof t.id !== "string" || !ID.test(t.id)) f.push(`${filnavn}: "id" skal være 2–40 tegn a-z, 0-9, _ eller -`);
    if (typeof t.navn !== "string" || !t.navn.trim()) f.push(`${filnavn}: "navn" mangler`);
    if (typeof t.beskrivelse !== "string") f.push(`${filnavn}: "beskrivelse" mangler`);
    if (t.standard !== undefined && typeof t.standard !== "number") f.push(`${filnavn}: "standard" skal være et tal`);
    if (t.uofficielt !== undefined && typeof t.uofficielt !== "boolean") f.push(`${filnavn}: "uofficielt" skal være true/false`);
    // Et tema efter en organisations profil uden dens godkendelse: kilde for hver farve + en synlig mærketekst.
    if (t.uofficielt === true && !(Array.isArray(t.kilder) && t.kilder.length)) {
        f.push(`${filnavn}: med "uofficielt" skal temaet angive "kilder" (rolle, farve, kilde, dato) for hver farve`);
    }
    if (t.uofficielt === true && !(typeof t.maerke === "string" && t.maerke.trim().length >= 20)) {
        f.push(`${filnavn}: med "uofficielt" skal temaet have en "maerke"-tekst, der siger, at organisationen ikke har godkendt det`);
    }
    if (t.maerke !== undefined && typeof t.maerke !== "string") f.push(`${filnavn}: "maerke" skal være tekst`);
    if (Array.isArray(t.kilder)) {
        t.kilder.forEach((k, i) => {
            const kk = k as Partial<Kilde>;
            if (!kk || typeof kk.rolle !== "string" || !erHex(kk.farve) || typeof kk.kilde !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(kk.dato ?? "")) {
                f.push(`${filnavn}: kilder[${i}] skal have rolle, farve (#rrggbb), kilde og dato (ÅÅÅÅ-MM-DD)`);
            }
        });
    }
    const s = t.skrift as Record<string, unknown> | undefined;
    if (s !== undefined) {
        for (const k of ["base", "tal"]) if (s[k] !== undefined && !(typeof s[k] === "string" && SKRIFT.test(s[k] as string))) f.push(`${filnavn}: skrift.${k} er ikke en gyldig font-family`);
    }
    const fo = t.form as Record<string, unknown> | undefined;
    if (fo !== undefined) {
        for (const k of ["radius_kort", "radius_felt"]) {
            const v = fo[k];
            if (v !== undefined && !(typeof v === "number" && v >= 0 && v <= 24)) f.push(`${filnavn}: form.${k} skal være 0–24 (px)`);
        }
    }
    for (const m of MODI) {
        const mt = t[m] as Record<string, unknown> | undefined;
        if (mt === undefined) continue;
        if (typeof mt !== "object" || mt === null) { f.push(`${filnavn}: "${m}" skal være et objekt`); continue; }
        for (const [k, v] of Object.entries(mt)) {
            if ((FARVER as readonly string[]).includes(k)) {
                if (!erHex(v)) f.push(`${filnavn}: ${m}.${k} skal være #rrggbb (fik ${JSON.stringify(v)})`);
            } else if (k in RAEKKER) {
                const n = RAEKKER[k as Raekke];
                const ok = Array.isArray(v) && v.every(erHex) && (k === "signatur" ? v.length >= 1 && v.length <= n : v.length === n);
                if (!ok) f.push(`${filnavn}: ${m}.${k} skal være ${k === "signatur" ? "1–4" : n} farver #rrggbb`);
            } else if (k === "skygge_kort") {
                if (typeof v !== "string" || !SKYGGE.test(v)) f.push(`${filnavn}: ${m}.skygge_kort er ikke en gyldig box-shadow`);
            } else {
                f.push(`${filnavn}: ukendt nøgle ${m}.${k}`);
            }
        }
    }
    return f;
}

/** Fylder huller fra basistemaet. Basistemaet selv skal være komplet. */
export function loes(fil: TemaFil, basis: Tema | undefined): Tema {
    const modus = (m: Modus): ModusTokens => {
        const egen = fil[m] ?? {};
        if (!basis) return egen as ModusTokens;
        return { ...basis[m], ...egen } as ModusTokens;
    };
    return {
        id: fil.id, navn: fil.navn, beskrivelse: fil.beskrivelse,
        standard: fil.standard ?? 0, uofficielt: fil.uofficielt ?? false, maerke: fil.maerke, kilder: fil.kilder ?? [],
        skrift: fil.skrift, form: fil.form,
        lys: modus("lys"), moerk: modus("moerk"),
    };
}

/** Mangler i et løst tema (basistemaet skal være komplet; et arvende tema bliver det automatisk). */
export function mangler(t: Tema): string[] {
    const f: string[] = [];
    for (const m of MODI) {
        for (const k of FARVER) if (!erHex(t[m][k])) f.push(`${t.id}: ${m}.${k} mangler`);
        for (const k of Object.keys(RAEKKER) as Raekke[]) if (!Array.isArray(t[m][k])) f.push(`${t.id}: ${m}.${k} mangler`);
        if (typeof t[m].skygge_kort !== "string") f.push(`${t.id}: ${m}.skygge_kort mangler`);
    }
    return f;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

/** Token → de CSS-variabler, appen læser. Én token kan fodre flere ældre navne. */
export const CSS_VARIABLER: Record<Farve, readonly string[]> = {
    baggrund: ["--color-background"],
    flade: ["--color-card", "--color-popover"],
    flade_haevet: ["--dash-elevated", "--color-secondary", "--color-muted"],
    flade_hover: ["--color-hover"],
    flade_valgt: ["--color-accent"],
    tekst: ["--color-foreground", "--color-card-foreground", "--color-popover-foreground",
        "--color-secondary-foreground", "--color-accent-foreground", "--dash-ink"],
    tekst_2: ["--dash-ink-2", "--color-muted-foreground"],
    tekst_3: ["--dash-ink-3"],
    streg: ["--dash-hairline", "--color-border"],
    streg_felt: ["--color-input", "--fjv-streg-felt"],
    gitter: ["--dash-grid"],
    primaer: ["--color-primary", "--dash-navy", "--color-brand"],
    primaer_tekst: ["--color-primary-foreground", "--color-destructive-foreground"],
    accent: ["--dash-series", "--color-brand-foreground"],
    accent_2: ["--dash-series-2"],
    fokus: ["--color-ring", "--fjv-fokus"],
    pos: ["--dash-pos"],
    neg: ["--dash-neg", "--color-destructive"],
    advarsel: ["--dash-amber"],
    serie_oevrige: ["--fjv-serie-0"],
    ac: ["--fjv-ac"],
    py: ["--fjv-py"],
    pl: ["--fjv-pl"],
    delta_pos: ["--fjv-delta-pos"],
    delta_neg: ["--fjv-delta-neg"],
    delta_neutral: ["--fjv-delta-neutral"],
    heatmap_op: ["--fjv-heat-op"],
    heatmap_ned: ["--fjv-heat-ned"],
    heatmap_groen: ["--fjv-heat-groen"],
    heatmap_roed: ["--fjv-heat-roed"],
    heatmap_blaa: ["--fjv-heat-blaa"],
};

/** Signaturstriben øverst: farverne i forholdet 4-1-1 (to farver: 4-2, én farve: hel). */
export function signaturGradient(f: readonly string[]): string {
    if (f.length === 1) return f[0];
    const vaegt = f.length === 2 ? [4, 2] : f.length === 3 ? [4, 1, 1] : [3, 1, 1, 1];
    const sum = vaegt.reduce((a, b) => a + b, 0);
    let fra = 0;
    const stop = f.map((c, i) => {
        const til = fra + (vaegt[i] / sum) * 100;
        const s = `${c} ${fra.toFixed(1)}% ${til.toFixed(1)}%`;
        fra = til;
        return s;
    });
    return `linear-gradient(90deg, ${stop.join(", ")})`;
}

// ---------------------------------------------------------------------------
// Afledte farver: de flader, skærmen faktisk viser, når to tokens blandes
// (Codex K6 F10). De beregnes HER og skrives som tokens, så layout.css aldrig
// blander bag tekst med color-mix — og scriptet måler præcis de samme hex.
// ---------------------------------------------------------------------------

/** Blandingsandele (forgrundens andel). Ændres de, ændres både CSS og måling. */
export const ANDEL = { maerke: 0.08, fejl: 0.07, fejl_kant: 0.4, knap_hover: 0.86, knap_aktiv: 0.76, graf_flade: 0.85 } as const;

export interface Afledte {
    maerke_ok_bg: string; maerke_advarsel_bg: string; maerke_fejl_bg: string;
    fejl_bg: string; fejl_kant: string; knap_hover: string; knap_aktiv: string;
}

export function afledte(v: ModusTokens): Afledte {
    // Hover og tryk blander knappen VÆK fra dens tekst (mod sort under lys tekst, mod hvid under mørk), så kontrasten
    // kun kan stige. Den første udgave blandede mod `tekst`, som i mørk modus er lys: 3,5–4,4:1 under hvid knaptekst.
    const vaek = luminans(v.primaer_tekst) > 0.5 ? "#000000" : "#ffffff";
    return {
        maerke_ok_bg: bland(v.pos, v.flade, ANDEL.maerke),
        maerke_advarsel_bg: bland(v.advarsel, v.flade, ANDEL.maerke),
        maerke_fejl_bg: bland(v.neg, v.flade, ANDEL.maerke),
        fejl_bg: bland(v.neg, v.flade, ANDEL.fejl),
        fejl_kant: bland(v.neg, v.flade, ANDEL.fejl_kant),
        knap_hover: bland(v.primaer, vaek, ANDEL.knap_hover),
        knap_aktiv: bland(v.primaer, vaek, ANDEL.knap_aktiv),
    };
}

const AFLEDTE_VARIABLER: Record<keyof Afledte, string> = {
    maerke_ok_bg: "--fjv-maerke-ok-bg", maerke_advarsel_bg: "--fjv-maerke-advarsel-bg", maerke_fejl_bg: "--fjv-maerke-fejl-bg",
    fejl_bg: "--fjv-fejl-bg", fejl_kant: "--fjv-fejl-kant", knap_hover: "--fjv-knap-hover", knap_aktiv: "--fjv-knap-aktiv",
};

// ---------------------------------------------------------------------------
// Tabellernes heatmap (runde 9, app/IBCS.md §8): fem trin pr. rampe, baggrund + den tekstfarve, der holder AA på
// netop den baggrund. Ramperne regnes her og skrives som tokens (--fjv-heat-op-3, --fjv-heat-op-3-tekst …), så
// skærmen og kontrastscriptet bruger samme hex — ingen color-mix bag tekst.
// ---------------------------------------------------------------------------

/**
 * Rampernes navne: neutral op/ned (divergerende) og virkning god/dårlig (IBCS-polaritet) er farvesættet Neutral;
 * grøn, rød og blå er farvesættene Rød/grøn og Blå/rød (runde 10, IBCS.md AF7); niveau (sekventiel) følger intet sæt.
 */
export const HEAT_RAMPER = ["op", "ned", "god", "daarlig", "groen", "roed", "blaa", "niveau"] as const;
export type HeatRampe = (typeof HEAT_RAMPER)[number];
/**
 * Polens andel over fladen pr. trin (trin 5 = polen selv = Retning-farven). Valgt så lysheden (OKLab L) falder i næsten
 * lige store skridt, og trin 1 står med ≥ 1,35:1 mod fladen (ikke til at forveksle med en ufarvet celle). Første udgave
 * (0,14 … 0,70 → 1) havde sit største spring mellem trin 4 og 5 (IBCS-review runde 9, fund 4–5).
 */
export const HEAT_ANDEL = [0.22, 0.4, 0.58, 0.78, 1] as const;
export const HEAT_TRIN = HEAT_ANDEL.length;

export interface HeatCelle { bg: string; tekst: string }

/**
 * Den første af `tekst`, `flade`, sort og hvid, der står med ≥ 4,5:1 på baggrunden. Sort eller hvid består altid
 * (mindst 4,58:1 mod enhver farve), så en celle aldrig kan få en ulæselig tekst — uanset tema.
 */
export function laesbarTekst(bg: string, v: Pick<ModusTokens, "tekst" | "flade">): string {
    const kand = [v.tekst, v.flade, "#000000", "#ffffff"];
    return kand.find((c) => kontrast(c, bg) >= TEKST) ?? kand.sort((a, b) => kontrast(b, bg) - kontrast(a, bg))[0];
}

/**
 * Alle fem ramper blandes af én pol over fladen, så intensiteten er monoton pr. konstruktion. Niveau-polen er temaets
 * stærkeste `sekventiel`-trin; selve `sekventiel`-trinene bruges ikke, fordi et tema kan have en mættet mellemtone og
 * en bleg yderpol (DIN mørk: trin 3 #0163d1 så kraftigere ud end trin 5 #b8d8fb — review fund 6).
 */
export function heatRamper(v: ModusTokens): Record<HeatRampe, HeatCelle[]> {
    const pol: Record<HeatRampe, string> = {
        op: v.heatmap_op, ned: v.heatmap_ned, god: v.delta_pos, daarlig: v.delta_neg,
        groen: v.heatmap_groen, roed: v.heatmap_roed, blaa: v.heatmap_blaa, niveau: v.sekventiel[4],
    };
    const ud = {} as Record<HeatRampe, HeatCelle[]>;
    for (const r of HEAT_RAMPER) ud[r] = HEAT_ANDEL.map((a) => { const bg = bland(pol[r], v.flade, a); return { bg, tekst: laesbarTekst(bg, v) }; });
    return ud;
}

/** Erklæringerne for ét tema i én modus (uden selektor). */
export function cssErklaeringer(t: Tema, m: Modus): string[] {
    const v = t[m];
    const ud: string[] = [`color-scheme: ${m === "moerk" ? "dark" : "light"}`];
    for (const k of FARVER) for (const navn of CSS_VARIABLER[k]) ud.push(`${navn}: ${v[k]}`);
    const a = afledte(v);
    for (const k of Object.keys(AFLEDTE_VARIABLER) as (keyof Afledte)[]) ud.push(`${AFLEDTE_VARIABLER[k]}: ${a[k]}`);
    v.serie.forEach((c, i) => ud.push(`--fjv-serie-${i + 1}: ${c}`));
    v.sekventiel.forEach((c, i) => ud.push(`--fjv-sek-${i + 1}: ${c}`));
    v.divergerende.forEach((c, i) => ud.push(`--fjv-div-${i + 1}: ${c}`));
    for (const [r, trin] of Object.entries(heatRamper(v))) {
        trin.forEach((c, i) => ud.push(`--fjv-heat-${r}-${i + 1}: ${c.bg}`, `--fjv-heat-${r}-${i + 1}-tekst: ${c.tekst}`));
    }
    ud.push(`--fjv-signatur: ${signaturGradient(v.signatur)}`);
    ud.push(`--fjv-skygge-kort: ${v.skygge_kort}`);
    if (t.skrift?.base) ud.push(`--font-base: ${t.skrift.base}`, `--font-heading: ${t.skrift.base}`);
    if (t.skrift?.tal) ud.push(`--font-numeric: ${t.skrift.tal}`);
    if (t.form?.radius_kort !== undefined) ud.push(`--r-kort: ${t.form.radius_kort}px`);
    if (t.form?.radius_felt !== undefined) ud.push(`--r-felt: ${t.form.radius_felt}px`);
    return ud;
}

export function css(t: Tema, m: Modus, selektor = ":root"): string {
    return `${selektor} {\n  ${cssErklaeringer(t, m).join(";\n  ")};\n}`;
}

// ---------------------------------------------------------------------------
// Kontrast og farveblindhed — målt, ikke vurderet
// ---------------------------------------------------------------------------

/** WCAG AA: tekst 4,5:1; grafiske elementer og UI-komponenters afgrænsning 3:1. */
export const TEKST = 4.5, GRAFIK = 3;
/** dataviz-metoden: ΔE (OKLab ×100) mellem NABOSERIER under protan/deutan; mål ≥ 8, gulv ≥ 6. Normalt syn ≥ 15. */
export const CVD_MAAL = 8, CVD_GULV = 6, NORMAL_GULV = 15;

type Flade = "baggrund" | "flade" | "flade_haevet" | "flade_hover" | "flade_valgt" | "primaer";

/** Kontrastkravene: [forgrund, baggrunde, minimum, hvorfor]. */
export const KONTRASTKRAV: readonly (readonly [Farve | `serie.${number}` | `divergerende.${number}` | `sekventiel.${number}`, readonly Flade[], number, string])[] = [
    ["tekst", ["baggrund", "flade", "flade_haevet", "flade_hover", "flade_valgt"], TEKST, "brødtekst"],
    ["tekst_2", ["baggrund", "flade", "flade_haevet", "flade_hover", "flade_valgt"], TEKST, "sekundær tekst"],
    ["tekst_3", ["baggrund", "flade", "flade_haevet"], TEKST, "fodnoter, tabelhoveder, mærker"],
    ["accent", ["baggrund", "flade", "flade_haevet"], TEKST, "links"],
    ["primaer_tekst", ["primaer"], TEKST, "tekst på knap og aktiv fane"],
    ["pos", ["flade", "flade_haevet"], TEKST, "statustekst (ok)"],
    ["neg", ["flade", "flade_haevet"], TEKST, "statustekst (fejl)"],
    ["advarsel", ["flade", "flade_haevet"], TEKST, "statustekst (advarsel)"],
    ["primaer", ["baggrund", "flade"], GRAFIK, "knap og aktiv fane som flade"],
    ["streg_felt", ["flade"], GRAFIK, "formularfeltets kant (WCAG 1.4.11)"],
    ["fokus", ["baggrund", "flade", "flade_haevet"], GRAFIK, "fokusring"],
    ["accent", ["flade"], GRAFIK, "enkeltserie i graf"],
    ["serie_oevrige", ["flade"], GRAFIK, "\"øvrige\" i graf"],
    ["ac", ["flade"], GRAFIK, "IBCS faktisk (AC)"],
    ["py", ["flade"], GRAFIK, "IBCS forrige år (PY)"],
    ["pl", ["flade"], GRAFIK, "IBCS plan (PL), omrids"],
    // IBCS-virkning (app/IBCS.md §2): delta_pos = god, delta_neg = dårlig, delta_neutral = neutral. Som mærker ≥ 3:1;
    // som farvede tal i tabeller og kort ≥ 4,5:1 (ibcs-notation §3 "tinted variance numbers").
    ["delta_pos", ["flade"], TEKST, "IBCS god virkning (mærke og tal)"],
    ["delta_neg", ["flade"], TEKST, "IBCS dårlig virkning (mærke og tal)"],
    ["delta_neutral", ["flade"], TEKST, "IBCS neutral virkning (mærke og tal)"],
    // Tabellernes farvevalg (IBCS.md §8): Retning farver tallet med polen, Heatmap har polen som mørkeste celle.
    ["heatmap_op", ["flade"], TEKST, "tabelfarve: mere end referencen (tal og mørkeste celle)"],
    ["heatmap_ned", ["flade"], TEKST, "tabelfarve: mindre end referencen (tal og mørkeste celle)"],
    ["heatmap_groen", ["flade"], TEKST, "tabelfarve Rød/grøn og Blå/rød: grøn (tal og mørkeste celle)"],
    ["heatmap_roed", ["flade"], TEKST, "tabelfarve Rød/grøn og Blå/rød: rød (tal og mørkeste celle)"],
    ["heatmap_blaa", ["flade"], TEKST, "tabelfarve Blå/rød: blå (tal og mørkeste celle)"],
    ...Array.from({ length: 8 }, (_, i) => [`serie.${i}`, ["flade"], GRAFIK, `kategorisk serie ${i + 1}`] as const),
    ["divergerende.0", ["flade"], GRAFIK, "divergerende yderpunkt"],
    ["divergerende.4", ["flade"], GRAFIK, "divergerende yderpunkt"],
    ["sekventiel.4", ["flade"], GRAFIK, "sekventiel mørkeste trin"],
];

/**
 * De SAMMENSATTE par, skærmen viser (F10): tekst på en afledt flade, eller tekst med opacity.
 * [forgrund, baggrund, minimum, hvad] — begge som funktioner af modusens tokens og afledte farver.
 * Undtaget (WCAG 1.4.3 "incidental"): deaktiverede kontroller (opacity 0,45–0,75 på :disabled og
 * analysernes data-deaktiveret="true").
 */
type Vaelg = (v: ModusTokens, a: Afledte) => string;
export const KOMPOSITKRAV: readonly (readonly [string, Vaelg, string, Vaelg, number, string])[] = [
    ["pos", (v) => v.pos, "maerke_ok_bg", (_, a) => a.maerke_ok_bg, TEKST, "statusmærke ok"],
    ["advarsel", (v) => v.advarsel, "maerke_advarsel_bg", (_, a) => a.maerke_advarsel_bg, TEKST, "statusmærke advarsel"],
    ["neg", (v) => v.neg, "maerke_fejl_bg", (_, a) => a.maerke_fejl_bg, TEKST, "statusmærke fejl"],
    ["tekst", (v) => v.tekst, "fejl_bg", (_, a) => a.fejl_bg, TEKST, "fejlboksens forklaring"],
    ["neg", (v) => v.neg, "fejl_bg", (_, a) => a.fejl_bg, TEKST, "fejlboksens overskrift"],
    ["primaer_tekst", (v) => v.primaer_tekst, "knap_hover", (_, a) => a.knap_hover, TEKST, "knap under musen"],
    ["primaer_tekst", (v) => v.primaer_tekst, "knap_aktiv", (_, a) => a.knap_aktiv, TEKST, "knap trykket ned"],
];
// Opacity på indhold er forbudt i stedet for målt (tema.spec.ts, "dæmper ikke indhold med opacity"): den laver par,
// intet token beskriver. Analysernes røgtest-kort brugte opacity 0,8 (tekst_3 3,6:1) og er nu stiplet i stedet.

export interface Fund { tema: string; modus: Modus; regel: string; detalje: string; maalt: number; krav: number; niveau: "brud" | "advarsel" }

function hent(v: ModusTokens, noegle: string): string {
    const [k, i] = noegle.split(".");
    return i === undefined ? (v as unknown as Record<string, string>)[k] : (v as unknown as Record<string, string[]>)[k][Number(i)];
}

/** Måler et løst tema i begge modi. Returnerer alle målinger under kravet (brud) og i advarselsbåndet. */
export function maal(t: Tema): Fund[] {
    const ud: Fund[] = [];
    for (const m of MODI) {
        const v = t[m];
        const fund = (regel: string, detalje: string, maalt: number, krav: number, niveau: Fund["niveau"] = "brud") =>
            ud.push({ tema: t.id, modus: m, regel, detalje, maalt: Math.round(maalt * 100) / 100, krav, niveau });

        for (const [fg, bage, min, hvorfor] of KONTRASTKRAV) {
            for (const bg of bage) {
                const k = kontrast(hent(v, fg), hent(v, bg));
                if (k < min) fund("kontrast", `${fg} på ${bg} (${hvorfor})`, k, min);
            }
        }
        const af = afledte(v);
        for (const [fgNavn, fg, bgNavn, bg, min, hvorfor] of KOMPOSITKRAV) {
            const k = kontrast(fg(v, af), bg(v, af));
            if (k < min) fund("kontrast", `${fgNavn} på ${bgNavn} (${hvorfor})`, k, min);
        }
        // Analysernes lagdelte flader (grafer.tsx: opacity 0,85): seriefarven, som den faktisk står på kortet.
        [...v.serie, v.serie_oevrige].forEach((c, i) => {
            const k = kontrast(bland(c, v.flade, ANDEL.graf_flade), v.flade);
            if (k < GRAFIK) fund("kontrast", `${i < 8 ? `serie.${i}` : "serie_oevrige"} som flade ved ${ANDEL.graf_flade * 100} % (lagdelt graf)`, k, GRAFIK);
        });
        // Kategoriske serier: ALLE par (F10) — enhedsfarve() giver hver enhed i et værk sin plads, og alle
        // enheder står i de samme grafer, så ethvert par kan stå side om side. "Øvrige" står i samme graf.
        const farver = [...v.serie.map((c, i) => [`serie ${i + 1}`, c] as const), ["øvrige", v.serie_oevrige] as const];
        for (let i = 0; i < farver.length; i++) {
            for (let j = i + 1; j < farver.length; j++) {
                const [na, a] = farver[i], [nb, b] = farver[j];
                const par = na === "øvrige" || nb === "øvrige" ? `øvrige/${na === "øvrige" ? nb : na}` : `serie ${i + 1}/${j + 1}`;
                const cvd = Math.min(afstand(a, b, "protan"), afstand(a, b, "deutan"));
                if (cvd < CVD_GULV) fund("farveblind", `${par} under protan/deutan`, cvd, CVD_GULV);
                else if (cvd < CVD_MAAL) fund("farveblind", `${par} under protan/deutan (gulv nået, mål ikke — kræver etiket)`, cvd, CVD_MAAL, "advarsel");
                const n = afstand(a, b);
                if (n < NORMAL_GULV) fund("normalt syn", par, n, NORMAL_GULV);
            }
        }
        // Par der bærer modsat betydning skal kunne skelnes af farveblinde (fortegn/ikon er sekundær kodning → gulvet).
        for (const [a, b, hvad] of [["delta_pos", "delta_neg", "IBCS god/dårlig"], ["delta_pos", "delta_neutral", "IBCS god/neutral"],
            ["delta_neg", "delta_neutral", "IBCS dårlig/neutral"], ["pos", "neg", "status ok/fejl"]] as const) {
            const cvd = Math.min(afstand(v[a], v[b], "protan"), afstand(v[a], v[b], "deutan"));
            if (cvd < CVD_GULV) fund("farveblind", `${hvad} under protan/deutan`, cvd, CVD_GULV);
        }
        if (afstand(v.ac, v.py) < NORMAL_GULV) fund("normalt syn", "AC mod PY", afstand(v.ac, v.py), NORMAL_GULV);
        // Sekventiel: monoton lyshed (lys → mørk i lys modus, mørk → lys i mørk modus er IKKE kravet: altid svag → stærk mod fladen).
        const kontrastTrin = v.sekventiel.map((c) => kontrast(c, v.flade));
        for (let i = 0; i + 1 < kontrastTrin.length; i++) {
            if (!(kontrastTrin[i + 1] > kontrastTrin[i])) fund("sekventiel", `trin ${i + 1}→${i + 2} bliver ikke stærkere mod fladen`, kontrastTrin[i + 1], kontrastTrin[i]);
        }
        // Divergerende: midten neutral (lav kroma), armene stiger mod yderpunkterne.
        const midt = oklch(v.divergerende[2]).C;
        if (midt > 0.04) fund("divergerende", "midtpunktet skal være neutralt (OKLCH C ≤ 0,04)", midt, 0.04);
        const d = v.divergerende.map((c) => kontrast(c, v.flade));
        if (!(d[0] > d[1] && d[4] > d[3])) fund("divergerende", "armene skal blive stærkere mod yderpunkterne", Math.min(d[0] - d[1], d[4] - d[3]), 0);
        // Heatmap (IBCS.md §8): hver celles tekst ≥ 4,5:1 på sin egen baggrund, trinene stærkere og stærkere mod fladen,
        // og op/ned (blå/orange) kan skelnes af farveblinde — fortegnet i tallet er den anden kodning.
        for (const [r, trin] of Object.entries(heatRamper(v))) {
            trin.forEach((c, i) => {
                const k = kontrast(c.tekst, c.bg);
                if (k < TEKST) fund("kontrast", `heatmap ${r} trin ${i + 1}: tekst ${c.tekst} på ${c.bg}`, k, TEKST);
            });
            const mod = trin.map((c) => kontrast(c.bg, v.flade));
            for (let i = 0; i + 1 < mod.length; i++) {
                if (!(mod[i + 1] > mod[i])) fund("heatmap", `${r}: trin ${i + 1}→${i + 2} bliver ikke stærkere mod fladen`, mod[i + 1], mod[i]);
            }
        }
        const opNed = Math.min(afstand(v.heatmap_op, v.heatmap_ned, "protan"), afstand(v.heatmap_op, v.heatmap_ned, "deutan"));
        if (opNed < CVD_GULV) fund("farveblind", "heatmap op/ned under protan/deutan", opNed, CVD_GULV);
        // Blå/rød er det farveblind-sikre sæt: blå og rød skal kunne skelnes under protan/deutan. Rød/grøn kan det per
        // definition ikke (derfor findes Blå/rød); der skal de blot kunne skelnes med normalt syn.
        const blaaRoed = Math.min(afstand(v.heatmap_blaa, v.heatmap_roed, "protan"), afstand(v.heatmap_blaa, v.heatmap_roed, "deutan"));
        if (blaaRoed < CVD_GULV) fund("farveblind", "heatmap blå/rød under protan/deutan", blaaRoed, CVD_GULV);
        if (afstand(v.heatmap_groen, v.heatmap_roed) < NORMAL_GULV) fund("normalt syn", "heatmap grøn mod rød", afstand(v.heatmap_groen, v.heatmap_roed), NORMAL_GULV);
    }
    return ud;
}
