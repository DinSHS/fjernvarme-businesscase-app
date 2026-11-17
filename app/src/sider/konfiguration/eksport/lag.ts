//-----------------------------------------------------------------------
// Appens eget lag i værksarket (runde 14): fanerne "Læs først", "Start og
// drift", "Balancemarked" og "Øvrige felter".
//
// Modelrepoets skabelon og scripts/vaerksark_til_yaml.py bærer kun en del
// af et værk. Målt på katalogets 7 værker stod 71–106 felter på listen
// "ikke med i arket". Fanerne her er APPENS EGNE: modelscriptet læser dem
// ikke; appens import (fabric/fjv/arklag.py) læser dem og lægger værdierne
// oven på scriptets læsning. Denne fil er eksportens side: hvilke celler
// fanerne får, og PRÆCIS hvad importen læser tilbage — gaten kører
// importen på hver eksport og kræver, at de er enige
// (viden/vaerktoej/tjek_eksport_rundtur.py).
//
// Fanernes form er en fælles kontrakt med importen (rettet efter
// brugertesten i runde 14):
//   * en BLOK findes på sin overskrift — en feltblok har "felt" i kolonne
//     A og en kolonne "sti i modellen"; en tabel har lige under sin
//     overskrift en række med "sti i modellen" i A og en stiskabelon pr.
//     kolonne ({enhed}, {tank}, {måned}). En blok slutter, hvor den næste
//     begynder. Forklaringerne står ØVERST i fanen, før første blok.
//   * værdikolonnen i en feltblok hedder "værdi" — eller markedernes navne
//     (aFRR, mFRR), og stien har da {marked}. En kolonne "kun hvis
//     modelscriptet giver" gør rækken betinget: den gælder kun, så længe
//     scriptet læser netop den værdi af modelrepoets faner, så laget aldrig
//     tavst skjuler en celle, brugeren har rettet dér.
//   * TOM celle = appen rører ikke feltet: værket får præcis det, scriptet
//     læser (som hvis rækken ikke fandtes). "(findes ikke)" = feltet sættes
//     ikke, og modellen bruger sin standard. Eksporten skriver ALTID alle
//     celler (værdien eller "(findes ikke)"), så rundturen er eksakt.
//   * løkkerne går over de rækker, arket HAR celler i (Codex' review, fund
//     1) — aldrig over alle rækkenumre til den sidste celle.
//
// Typen kommer fra feltkataloget, ikke fra cellen (et regneark kender
// ikke forskel på 12 og 12.0). En lukket liste vises med danske etiketter
// og koden i parentes ("i går (lag24)"); importen læser koden i parentesen
// eller koden alene. Har værket et heltal, hvor kataloget siger tal (fx 96),
// bærer markeringen (_app) værkets egen skrivemåde ("former").
//-----------------------------------------------------------------------

import { findFelt, katalogOrden, type FeltPost } from "../katalog";
import { tjekFelt } from "../validering";
import type { Celle, Tab } from "./kort";
import { pyFloatTekst } from "./pyjson";
import { slug } from "./slug";
import { ref, ulovligtXmlTegn, type Celleværdi } from "./xlsx";

export const LAES_FOERST = "Læs først";
export const START_OG_DRIFT = "Start og drift";
export const BALANCEMARKED = "Balancemarked";
export const OEVRIGE = "Øvrige felter";
/** De faner, importen læser (Læs først er kun til brugeren). */
export const LAGFANER = [START_OG_DRIFT, BALANCEMARKED, OEVRIGE] as const;
/** Alle appens faner i arket, i rækkefølge. */
export const APPENS_FANER = [LAES_FOERST, ...LAGFANER] as const;
export const FINDES_IKKE = "(findes ikke)";
export const STI_OVERSKRIFT = "sti i modellen";
export const KUN_HVIS = "kun hvis modelscriptet giver";
const MAKS_CELLETEKST = 32_767;
const MARKEDER = [["afrr", "aFRR"], ["mfrr", "mFRR"]] as const;
/** Excels grænse for en liste skrevet direkte i en datavalidering (inkl. kommaer). */
const MAKS_LISTE = 255;

/**
 * Skabelonens stilarter (xl/styles.xml ved pinnen) — samme farvekoder som modelrepoets faner. Brugertesten (F17):
 * grå betyder "eksempel, slet den" i modelrepoets faner; appens kopier fra Anlaeg står derfor med kant uden farve
 * ("kopi"), og appens kontrolværdier og stier i kursiv grå ("kontrol").
 */
const STIL = { titel: 1, vejledning: 25, afsnit: 3, etiket: 4, tekst: 5, gul: 10, overskrift: 12, kopi: 22, kontrol: 24, forklaring: 26 } as const;

// ------------------------------------------------------------------ celle <-> vaerdi_json (som fjv.feltkatalog)

const tal = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const STI_DEL = /^[^.\s][^.]*$/;
const FARLIGE = new Set(["__proto__", "constructor", "prototype"]);
const gyldigSti = (sti: string) => !!sti && sti.length <= 400 && sti.split(".").every((d) => STI_DEL.test(d) && !FARLIGE.has(d));
const SAND: Record<string, boolean> = { ja: true, nej: false, true: true, false: false, sand: true, falsk: false };
const heltalsliste = (t: FeltPost["tilladte"]) => !!t?.length && t.every((x) => typeof x === "number" && Number.isInteger(x));
const KODET_TEGN = /_x[0-9A-Fa-f]{4}_/;
const KODE_I_PARENTES = /\(([^()]+)\)\s*$/;

/**
 * Danske etiketter for de lukkede lister i appens faner (brugertesten F11). Koden står i parentes efter etiketten,
 * og importen læser den dér; en etiket er derfor appens egen tekst og ændrer ingen værdi. Ingen kommaer (Excels
 * listeskilletegn).
 */
const ETIKETTER: Record<string, Record<string, string>> = {
    "balancing.method": { legacy: "gennemsnit gange gennemsnit – ældre", activation_value: "aktiveringsværdi kvarter for kvarter – anbefalet" },
    "balancing.activation.foresight": { realized: "kender fremtiden – kun øvre grænse", profile: "månedsprofil", trailing30: "sidste 30 døgn", lag24: "i går", lag168: "sidste uge" },
    "balancing.activation.settle": { forecast: "efter prognosen", realized: "efter det der skete" },
    "balancing.activation.*.model": { clear: "hele buddet når prisen clearer", system_share: "andel af systemets aktivering gange k", ramp: "stigende med prisafstanden" },
    "balancing.reservation_gate.mode": { driven: "reservér hele blokken", bound: "reservér højst blokken" },
    "balancing.availability.mode": { hourly: "loft i hver time", energy: "loft på månedens MWh" },
};
const etiketFor = (p: FeltPost, kode: string) => ETIKETTER[p.sti]?.[kode];

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
        case "enum": {
            if (heltalsliste(post.tilladte)) {
                if (!tal(v) || !Number.isInteger(v)) return { grund: "værdien er ikke et helt tal" };
                const kunNulEn = post.tilladte!.every((x) => x === 0 || x === 1);
                return { celle: kunNulEn ? (v === 1 ? "ja" : "nej") : v, json: String(v) };
            }
            if (typeof v !== "string" || tekstFejl(v)) return { grund: "værdien kan ikke stå som tekst i en celle" };
            const e = etiketFor(post, v);
            return { celle: e ? `${e} (${v})` : v, json: JSON.stringify(v) };
        }
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
 * skema/vektorer/arklag/celler.json binder dem). Kaster med grunden.
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
        case "enum": {
            if (heltalsliste(post.tilladte)) {
                if (lille in SAND && post.tilladte!.every((x) => x === 0 || x === 1)) return SAND[lille] ? "1" : "0";
                if (typeof celle === "number" && Number.isInteger(celle)) return String(celle);
                throw new Error(`${navn}: skriv ja eller nej (cellen indeholder ${vis})`);
            }
            if (typeof celle !== "string") throw new Error(`${navn}: vælg en af ${(post.tilladte ?? []).join(", ")} (cellen indeholder ${vis})`);
            // En dansk etiket med koden i parentes ("i går (lag24)"): koden gælder.
            const m = KODE_I_PARENTES.exec(celle);
            if (m && (post.tilladte ?? []).includes(m[1].trim())) return JSON.stringify(m[1].trim());
            return JSON.stringify(celle.trim());
        }
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

/** Hvad en celle i appens faner betyder — fælles regel med fjv.feltkatalog.laes_celle (vektorerne binder dem). */
export type Cellebetydning = { tom: true } | { fjern: true } | { json: string } | { fejl: string };

/**
 * Tom celle = appen rører ikke feltet; "(findes ikke)" = feltet fjernes; ellers værdien efter feltets type og regler
 * (som en redigering i appen). Brugertesten F2: "intet skrevet" betød før tre forskellige ting.
 */
export function læsCelle(sti: string, celle: number | string | boolean | null | undefined): Cellebetydning {
    if (celle === null || celle === undefined || (typeof celle === "string" && !celle.trim())) return { tom: true };
    if (typeof celle === "string" && celle.trim().toLowerCase() === FINDES_IKKE) return { fjern: true };
    try {
        const json = jsonFraCelle(sti, celle);
        const fund = tjekFelt(sti, json);
        return fund ? { fejl: fund.besked } : { json };
    } catch (e) { return { fejl: e instanceof Error ? e.message : String(e) }; }
}

// ------------------------------------------------------------------ fanernes felter

/** Værkets egne felter øverst i Start og drift (brugertesten F5: de lå i Øvrige felter). */
const VAERKSFELTER = ["grid.max_consumption_mw", "time.start", "time.end"] as const;
/** Kolonnerne pr. enhed i Start og drift (kolonne C…H; B er en kopi af typen fra Anlaeg). */
const ENHEDSFELTER: readonly [number, string][] = [[3, "enabled"], [4, "initial_status"], [5, "uc_enabled"], [6, "co2_emissions_per_mwh_fuel"], [7, "commissioned"], [8, "notes"]];
/** Kolonnerne pr. tank (B…E og noter i H, under enhedernes noter). */
const TANKFELTER: readonly [number, string][] = [[2, "enabled"], [3, "e_initial_mwh"], [4, "self_discharge_per_hour"], [5, "cycle_binding"], [8, "notes"]];
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
/**
 * Kolonnerne pr. enhed i Balancemarked (B…I). De ældre budlofter står sidst (brugertesten F9); budvinduets måneder
 * i kolonne E, som er bred, fordi feltblokkenes forklaring står dér.
 */
const BUDFELTER: readonly [number, string][] = [
    [2, "balancing.ancillary_caps.per_unit_mw.{enhed}"], [3, "balancing.ancillary_caps.per_unit_market_mw.{enhed}.afrr"],
    [4, "balancing.ancillary_caps.per_unit_market_mw.{enhed}.mfrr"], [5, "units.{enhed}.ancillary.bid_window.months"],
    [6, "units.{enhed}.ancillary.available_from"], [7, "units.{enhed}.ancillary.bid_window.hours_local"],
    [8, "units.{enhed}.ancillary.afrr_max_bid_mw"], [9, "units.{enhed}.ancillary.mfrr_max_bid_mw"],
];
const MAANEDSFELT = "balancing.availability.{marked}.mw_by_month.{måned}";

/**
 * Felter, der aldrig bæres af laget — de vises fortsat på listen "ikke med i arket", med grunden.
 * Målt på katalogets værker er der kun ét: solprofilens sti.
 */
export function undtaget(sti: string): string | null {
    if (sti.endsWith(".production_profile_path")) {
        return "solprofilen følger med som timeværdier (arket Solvarme) og bliver det nye værks aktive solprofil; feltet peger på den";
    }
    return null;
}

/** Feltets post med en konkret sti i stedet for pladsholderne (til etiket, enhed, forklaring og dropdown). */
const postFor = (skabelon: string) => findFelt(skabelon.replace("{enhed}", "x").replace("{tank}", "x").replace("{marked}", "afrr").replace("{måned}", "2026-01"));

/** Enheder, der skal stå anderledes i en overskrift end i feltkataloget (brugertesten F27). */
const ENHED: Record<string, string> = { "storage.*.self_discharge_per_hour": "andel pr. time" };
const enhedAf = (p: FeltPost | null) => (p ? (ENHED[p.sti] ?? p.enhed) : null);
const overskrift = (p: FeltPost | null, reserve: string) => (p ? `${p.etiket}${enhedAf(p) ? ` (${enhedAf(p)})` : ""}` : reserve);

/**
 * Forklaringer i driftsfolkenes ord for felterne i appens faner (brugertesten F11, F18). Indholdet er feltkatalogets
 * (`viden/felt_katalog.json`) — skrevet om uden YAML-ord, engelske koder, "Spor A/B", "MILP" og filnavne.
 */
const FORKLARING: Record<string, string> = {
    "grid.max_consumption_mw": "Loft over det samlede eloptag fra varmepumper og elkedler pr. time. Gælder også planen uden aktivering og begrænser derfor, hvor meget værket kan byde ind i balancemarkedet.",
    "time.start": "Første time i værkets modelperiode, i UTC. En kørsel bruger scenariets periode, når den er sat.",
    "time.end": "Sidste time i værkets modelperiode (med), i UTC.",
    "units.*.enabled": "Ja: enheden er med i beregningen. Nej: enheden er slået fra, som når den slås fra i et scenarie. Sæt ikke maks varme til 0 i stedet.",
    "units.*.initial_status": "Ja: enheden kører i periodens første time. Nej: den er slukket. Står alle enheder med start/stop-logik på nej, og er der ingen tank, kan værket ikke dække første time.",
    "units.*.uc_enabled": "Ja: modellen bruger minimumslast (min varme), min. driftstid, min. stoptid og startomkostning fra Anlaeg. Nej: de tal i Anlaeg bruges IKKE — appen advarer ved upload, når de er udfyldt. Ja gør beregningen langsommere.",
    "units.*.co2_emissions_per_mwh_fuel": "Ton CO₂ pr. MWh brændsel. Naturgas ca. 0,2; biomasse 0 (regnes CO₂-neutral). Ganges med CO₂-prisen i Priser.",
    "units.*.commissioned": "Kun til orientering; bruges ikke i beregningen.",
    "units.*.notes": "Fritekst; bruges ikke i beregningen. En note med [BEKRÆFT …] er et åbent spørgsmål fra værkets kildefil, ikke en bekræftet værdi.",
    "storage.*.enabled": "Ja: tanken er med. Nej: tanken er slået fra — sådan regner man, hvad tanken er værd.",
    "storage.*.e_initial_mwh": "Tankens indhold i første time. Med 'slut som start' skal tanken også ende her.",
    "storage.*.self_discharge_per_hour": "Andel af indholdet, der tabes pr. time: 0,0005 = 0,05 % pr. time.",
    "storage.*.cycle_binding": "Ja: tanken skal ende med samme indhold, som den startede med, så perioden ikke bruger varme, den ikke har betalt for.",
    "storage.*.notes": "Fritekst; bruges ikke i beregningen. En note med [BEKRÆFT …] er et åbent spørgsmål fra værkets kildefil, ikke en bekræftet værdi.",
    "storage.*.e_max_mwh": "Tankens kapacitet. null: modellen regner den af volumen og temperaturforskel. Et tal her vinder over volumen.",
    "balancing.method": "Aktiveringsværdi kvarter for kvarter (anbefalet) fanger, at pris og aktivering hænger sammen. Gennemsnit gange gennemsnit (ældre) undervurderer systematisk.",
    "balancing.robust_reservation": "Ja: driften skal også holde, hvis buddet ikke aktiveres — varmen fra en reserveret enhed skal kunne bruges i nettet eller tanken.",
    "balancing.shared_reserve_cap_mw": "Ældre form af det samlede loft. Brug 'Samlet prækvalifikation' i stedet.",
    "balancing.ancillary_caps.total_mw": "Største sum af alle bud på tværs af enheder og markeder pr. time.",
    "balancing.bid_strategy.up_markup_dkk_mwh": "Buddet på energi er spotprisen plus dette tillæg. Højere tillæg: sjældnere, men dyrere aktivering. Modellens eksempelværker bruger 500.",
    "balancing.bid_strategy.up_markup_max_dkk_mwh": "Kun til orientering; bruges ikke i beregningen.",
    "balancing.bid_strategy.down_markdown_dkk_mwh": "Bruges ikke: modellen byder kun op-regulering.",
    "balancing.bid_strategy.down_markdown_max_dkk_mwh": "Bruges ikke: modellen byder kun op-regulering.",
    "balancing.activation.foresight": "Hvad modellen ved om aktiveringerne, når den byder. 'Kender fremtiden' giver kun en øvre grænse for indtjeningen; 'månedsprofil', 'sidste 30 døgn', 'i går' og 'sidste uge' er realistiske.",
    "balancing.activation.settle": "'Efter prognosen': indtjeningen er prognosens. 'Efter det der skete': modellen byder på prognosen og afregnes bagefter på de faktiske aktiveringer. Virker kun, når modellen ikke kender fremtiden.",
    "balancing.reservation_gate.enabled": "Ja: byd kun kapacitet i timer, hvor kapacitetsprisen er over en tærskel — den faste eller den beregnede budpris nedenfor.",
    "balancing.reservation_gate.mode": "'Reservér højst blokken': modellen må reservere op til blokken, når kapacitetsprisen er høj nok. 'Reservér hele blokken': reservationen ER blokken.",
    "balancing.availability.enabled": "Ja: værkets faktiske reservation pr. måned er loft over buddet (tabellen nederst). Kræver værkets egne afregningsdata og kan ikke overføres til andre værker eller perioder.",
    "balancing.availability.mode": "'Loft i hver time' eller 'loft på månedens MWh' (modellen vælger selv timerne).",
    "balancing.reservation_gate.*.block_mw": "Den effekt, der reserveres (eller højst reserveres), når kapacitetsprisen er høj nok.",
    "balancing.reservation_gate.*.cm_threshold_dkk_mw_h": "Fast budpris: kapacitet bydes kun, når kapacitetsprisen dagen før er mindst denne.",
    "balancing.reservation_gate.*.opportunity_cost.reference_unit": "Beregnet budpris: den elenhed (varmepumpe eller elkedel), hvis alternative omkostning bestemmer budprisen. Skriv enhedens navn som i Anlaeg.",
    "balancing.reservation_gate.*.opportunity_cost.floor_dkk_mw_h": "Beregnet budpris: laveste budpris uanset beregningen.",
    "balancing.activation.*.model": "Hvor stor en del af buddet modellen regner som aktiveret. 'Hele buddet' overvurderer 4–5 gange uden loft; 'andel af systemets aktivering' bruger systemets egen aktivering gange k; 'stigende med prisafstanden' lader andelen vokse med afstanden mellem pris og bud.",
    "balancing.activation.*.k": "Kun ved 'andel af systemets aktivering': skalering af andelen. Modellens kalibrering for aFRR på eksempelværkerne: 4.",
    "balancing.activation.*.ramp_dkk_mwh": "Kun ved 'stigende med prisafstanden': den prisafstand over buddet, hvor hele buddet regnes aktiveret.",
    "balancing.ancillary_caps.per_unit_mw.*": "Største samlede bud (aFRR + mFRR) for enheden pr. time. Gælder altid.",
    "balancing.ancillary_caps.per_unit_market_mw.*.*": "Værkets egen fordeling af enhedens prækvalificerede effekt på markedet.",
    "units.*.ancillary.afrr_max_bid_mw": "Ældre felt: loft over enhedens aFRR-bud. Bruges ikke, når 'Samlet prækvalifikation' eller 'Fælles reserveloft' er udfyldt.",
    "units.*.ancillary.mfrr_max_bid_mw": "Ældre felt: loft over enhedens mFRR-bud. Bruges ikke, når 'Samlet prækvalifikation' eller 'Fælles reserveloft' er udfyldt.",
    "units.*.ancillary.available_from": "Dato (ÅÅÅÅ-MM-DD), hvorfra enheden byder; før den reserverer enheden intet, fx under indkøring. Excel må gerne gøre det til en dato.",
    "units.*.ancillary.bid_window.months": "Måneder (1–12), hvor enheden byder, fx 10, 11, 12, 1, 2, 3. (findes ikke) = alle måneder.",
    "units.*.ancillary.bid_window.hours_local": "Timer på døgnet (0–23, dansk tid), hvor enheden byder. (findes ikke) = alle timer.",
    "balancing.availability.*.mw_by_month.*": "Reserverede MW i måneden. Måneden skrives ÅÅÅÅ-MM; Excel må gerne gøre den til en dato.",
    "meta.case_name": "Værkets kode, som modellen bruger i sine filnavne. Kort og uden mellemrum.",
    "meta.titel": "Værkets navn, som det vises i resultaterne.",
    "meta.description": "Fritekst om værket.",
    "meta.gruppe": "Valgfri gruppering af værker.",
    "meta.tax_year": "Kun til orientering; bruges ikke i beregningen.",
    "time.resolution": "Modellens tidsskridt. Appen regner altid i hele timer (1h).",
};

/** Feltkatalogets forklaring uden YAML-ord og fagudtryk — til felter uden egen tekst (Øvrige felter). */
function rens(t: string): string {
    return t.replace(/\btrue\b/g, "ja").replace(/\bfalse\b/g, "nej").replace(/ ?\(null\)/g, "").replace(/\bnull\b/g, "tom")
        .replace(/\buc_enabled\b/g, "start/stop-logik").replace(/ ?\(Spor [AB][^)]*\)/g, "").replace(/ Gør modellen til en MILP[^.]*\./g, "")
        .replace(/--heat-csv/g, "en målt varmelast");
}

const forklaringFor = (p: FeltPost | null) => (p ? (FORKLARING[p.sti] ?? rens(p.forklaring)) : "");

/**
 * Hvad modelscriptet selv skriver i feltet — det, en TOM celle giver (brugertesten F2, lead's beslutning 1). Læst i
 * scripts/vaerksark_til_yaml.py ved pinnen: enabled (:623), uc_enabled (:853-854), initial_status (:855-856),
 * co2 (:846-847), tankens felter (:908-916), tidsvinduet (:1616); balancemarkedet skriver scriptet aldrig (:1685).
 */
const SCRIPT_TOM: Record<string, string> = {
    "units.*.enabled": "ja",
    "units.*.initial_status": "nej for enheder med start/stop-logik; ellers intet, og modellen bruger ja",
    "units.*.uc_enabled": "ja, når enheden har min varme over 0 eller min. driftstid over 1 time (ikke solvarme); ellers nej",
    "units.*.co2_emissions_per_mwh_fuel": "0,2 for gaskedler og gasmotorer; for andre intet, og modellen bruger 0",
    "storage.*.enabled": "ja",
    "storage.*.e_initial_mwh": "halvdelen af maks fyldning i Anlaeg",
    "storage.*.self_discharge_per_hour": "0,0005",
    "storage.*.cycle_binding": "ja",
    "time.start": "første time i Timedata (uden timedata: 1. juli 2025 kl. 00 UTC)",
    "time.end": "sidste time i Timedata (uden timedata: 30. juni 2026 kl. 23 UTC)",
};

function standardVis(p: FeltPost | null): string {
    if (!p || p.standard === undefined || p.standard === null) return "intet";
    const s = p.standard;
    if (typeof s === "boolean") return s ? "ja" : "nej";
    if (heltalsliste(p.tilladte) && p.tilladte!.every((x) => x === 0 || x === 1)) return s === 1 ? "ja" : "nej";
    if (typeof s === "string" && etiketFor(p, s)) return etiketFor(p, s)!;
    return String(s).replace(".", ",");
}

/** Den fulde tekst ved et felt: forklaringen + hvad tom og (findes ikke) betyder, med de konkrete værdier. */
function feltTekst(p: FeltPost | null): string {
    if (!p) return "";
    const script = SCRIPT_TOM[p.sti] ?? (p.sti.startsWith("balancing") || p.sti.startsWith("units.*.ancillary") ? "intet (modellens script skriver aldrig et balancemarked)" : "intet");
    return `${forklaringFor(p)} Tom celle: værket får modellens scripts værdi — ${script}. ${FINDES_IKKE}: feltet sættes ikke; modellens standard: ${standardVis(p)}.`;
}

/** Dropdownens værdier for et felt: ja/nej eller den lukkede liste (danske etiketter), og (findes ikke) — eller null. */
function valg(p: FeltPost | null): string[] | null {
    if (!p) return null;
    let l: string[] | null = null;
    if (p.type === "boolean") l = ["ja", "nej"];
    else if (p.type === "enum" && p.tilladte?.length) {
        if (heltalsliste(p.tilladte)) l = p.tilladte.every((x) => x === 0 || x === 1) ? ["ja", "nej"] : p.tilladte.map(String);
        else {
            l = p.tilladte.map((x) => { const e = etiketFor(p, String(x)); return e ? `${e} (${String(x)})` : String(x); });
            if (`"${[...l, FINDES_IKKE].join(",")}"`.length > MAKS_LISTE) l = p.tilladte.map(String);
        }
    }
    return l ? [...l, FINDES_IKKE] : null;
}

/** Rækkehøjde (punkter) til en ombrudt tekst i en kolonne af `bredde` tegn. */
function højdeFor(tekst: string, bredde: number): number {
    const linjer = tekst.split("\n").reduce((s, l) => s + Math.max(1, Math.ceil(l.length / Math.max(8, bredde * 1.1))), 0);
    return Math.max(15, Math.round((12.75 * linjer + 3) * 4) / 4);
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
    /** Fanen skal stå først i arket og være den, der åbnes (Læs først). */
    først?: boolean;
}

/** Hvor modelrepoets celler står for netop dette værk (til Læs først). */
export interface Henvisning {
    enhedRække: ReadonlyMap<string, number>;
    tankRække: ReadonlyMap<string, number>;
    /** Rækkeforskydning i Priser (træpiller får en række). */
    priserForskyd: number;
    solvarmeArk: boolean;
}

export interface Lagkilde {
    /** Værket (navn, kode, revision) — null for den tomme skabelon. */
    vaerk: { navn: string; kode: string; revision: number } | null;
    /** Værkets blade (sti -> vaerdi_json) og deres rækkefølge. */
    værk: ReadonlyMap<string, string>;
    /** Modelscriptets læsning af arkets øvrige faner, i værkets egne navne. */
    script: ReadonlyMap<string, string>;
    /** Enhederne og tankene i Anlaeg, i arkets rækkefølge (værkets navne). */
    enheder: readonly { navn: string; type: string }[];
    tanke: readonly string[];
    henvisning?: Henvisning;
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
    /** Steder, hvor en værdi i modelrepoets faner ikke er den, modellen bruger (Læs først). */
    afvigelser: { hvor: string; hvad: string; celle: string }[];
}

class Fane {
    readonly celler: Celle[] = [];
    readonly flet: string[] = [];
    readonly valideringer: Validering[] = [];
    readonly højder = new Map<number, number>();
    r = 1;
    constructor(readonly navn: string, readonly kolonner: number[]) {}
    get bredde() { return this.kolonner.length; }
    sæt(kol: number, v: Celleværdi, stil: number, række = this.r) { this.celler.push({ ark: this.navn, ref: ref(kol, række), v, stil }); }
    højde(række: number, ht: number) { this.højder.set(række, Math.max(this.højder.get(række) ?? 15, ht)); }
    /** En tekst flettet fra kolonne `fra` til fanens sidste kolonne, med en højde der passer til teksten. */
    tekst(v: string, stil: number, fra = 1) {
        this.sæt(fra, v, stil);
        if (fra < this.bredde) this.flet.push(`${ref(fra, this.r)}:${ref(this.bredde, this.r)}`);
        this.højde(this.r, højdeFor(v, this.kolonner.slice(fra - 1).reduce((s, b) => s + b, 0)));
        this.r++;
    }
    /** En ombrudt tekst i én celle; rækken gøres høj nok. */
    ombrudt(kol: number, v: string, stil: number, række = this.r) {
        this.sæt(kol, v, stil, række);
        this.højde(række, højdeFor(v, this.kolonner[kol - 1] ?? 20));
    }
    liste(kol: number, fra: number, til: number, p: FeltPost | null) {
        const l = valg(p);
        if (l && til >= fra) this.valideringer.push({ sqref: `${ref(kol, fra)}:${ref(kol, til)}`, liste: l, titel: p!.etiket.slice(0, 30) });
    }
    form(frysRækker: number, først = false): Faneform {
        return { navn: this.navn, kolonner: this.kolonner, frysRækker, flet: this.flet, valideringer: this.valideringer, højder: [...this.højder.entries()], ...(først ? { først } : {}) };
    }
}

/** Fanens første linje (brugertesten F36). */
const EGEN_FANE = "Denne fane er appens egen: den læses af appen, når arket uploades i appen. Kører man modellens script direkte på arket, bruges den ikke.";

const dk = (x: number) => String(x).replace(".", ",");
const jsonTal = (j: string | undefined) => { try { const v: unknown = JSON.parse(j ?? "x"); return tal(v) ? v : null; } catch { return null; } };

/** Planen for appens fire faner og det, importen læser tilbage. */
export function planlægLag(k: Lagkilde): Lagplan {
    const slut = new Map(k.script);
    const grunde = new Map<string, string>();
    const refAf = new Map<string, string>();
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

    /**
     * En celle i en feltblok eller tabel: værkets værdi, eller "(findes ikke)", når værket ikke har feltet — aldrig
     * tom (tom betyder "appen rører ikke feltet"). Kan værdien ikke stå i en celle, står cellen tom, og feltet får
     * scriptets værdi og kommer på listen "ikke med i arket" med grunden.
     */
    const felt = (f: Fane, kol: number, sti: string, stil: number = STIL.gul) => {
        const vv = k.værk.get(sti);
        refAf.set(sti, `${f.navn}!${ref(kol, f.r)}`);
        // Den tomme skabelon har intet værk: cellerne står tomme (appen rører ikke felterne), så et ark, der kun er
        // udfyldt i modelrepoets faner, giver præcis scriptets case.
        if (!k.vaerk) { f.sæt(kol, null, stil); return; }
        if (vv === undefined) {
            f.sæt(kol, FINDES_IKKE, stil);
            slut.delete(sti);
            antal[f.navn]++;
            return;
        }
        const c = celleFor(sti, vv);
        const grund = "grund" in c ? c.grund : peger(sti, vv);
        if ("celle" in c && !grund) {
            f.sæt(kol, c.celle, stil);
            slut.set(sti, c.json);
            antal[f.navn]++;
            return;
        }
        grunde.set(sti, grund!);
        f.sæt(kol, null, stil);
    };

    /** Øverst i hver fane: titel, værkets identitet (brugertesten F3) og fanens vejledning. */
    const top = (f: Fane, titel: string, vejledning: string) => {
        f.tekst(titel, STIL.titel);
        f.tekst(k.vaerk ? `Værk: ${k.vaerk.navn} (kode ${k.vaerk.kode}), revision ${k.vaerk.revision}. Uploades arket i appen, gemmes ændringerne på netop dette værk — se fanen Læs først.`
            : "Tom skabelon: arket hører ikke til noget værk endnu. Uploades det i appen, bliver det et nyt værk.", STIL.etiket);
        f.tekst(`${EGEN_FANE} ${vejledning}`, STIL.vejledning);
        f.r++;
    };

    /** "Hvad felterne betyder" øverst: én linje pr. felt med den fulde forklaring (før første blok, importen læser den ikke). */
    const forklar = (f: Fane, titel: string, skabeloner: readonly string[]) => {
        f.sæt(1, titel, STIL.afsnit); f.r++;
        const set = new Set<string>();
        for (const s of skabeloner) {
            const p = postFor(s);
            if (!p || set.has(p.sti)) continue;
            set.add(p.sti);
            f.sæt(1, overskrift(p, s), STIL.etiket);
            f.tekst(feltTekst(p), STIL.tekst, 2);
        }
        f.r++;
    };

    /** En feltblok: felt | værdi(er) | [kun hvis] | enhed | forklaring | sti. Kolonnerne gives pr. fane. */
    interface Blokkolonner { værdi: readonly (readonly [number, string, string | null])[]; kunHvis?: number; enhed: number; forklaring: number; sti: number }
    const feltblok = (f: Fane, felter: readonly string[], kol: Blokkolonner) => {
        f.sæt(1, "felt", STIL.overskrift);
        for (const [c, h] of kol.værdi) f.sæt(c, h, STIL.overskrift);
        if (kol.kunHvis) f.sæt(kol.kunHvis, KUN_HVIS, STIL.overskrift);
        f.sæt(kol.enhed, "enhed", STIL.overskrift); f.sæt(kol.forklaring, "forklaring", STIL.overskrift); f.sæt(kol.sti, STI_OVERSKRIFT, STIL.overskrift);
        f.højde(f.r, 33.75);
        f.r++;
        for (const skabelon of felter) {
            const p = postFor(skabelon);
            f.sæt(1, p?.etiket ?? skabelon, STIL.etiket);
            for (const [c, , marked] of kol.værdi) {
                const sti = marked ? skabelon.replace("{marked}", marked) : skabelon;
                felt(f, c, sti, p && !p.laeses_af_koden ? STIL.kopi : STIL.gul);
                f.liste(c, f.r, f.r, p);
                if (kol.kunHvis) {
                    const sv = k.script.get(sti);
                    const b = sv === undefined ? null : celleFor(sti, sv);
                    f.sæt(kol.kunHvis, b && "celle" in b ? b.celle : null, STIL.kontrol);
                }
            }
            f.sæt(kol.enhed, enhedAf(p), STIL.kontrol);
            f.ombrudt(kol.forklaring, feltTekst(p), STIL.forklaring);
            f.sæt(kol.sti, skabelon, STIL.kontrol);
            f.r++;
        }
        f.r++;
    };

    /**
     * En tabel: overskriftsrækken (A = fanens egen overskrift), rækken "sti i modellen" med stiskabelonerne og én
     * række pr. navn. `kopi` er en kolonne, der kopierer noget fra Anlaeg (typen) — appen læser den ikke.
     */
    const tabel = (f: Fane, overskriftA: string, pladsholder: string, navne: readonly { navn: string; kopi?: string }[], felter: readonly (readonly [number, string])[], plads: number, kopi?: string) => {
        const hoved = f.r, teknik = f.r + 1, første = f.r + 2;
        f.sæt(1, overskriftA, STIL.overskrift, hoved);
        f.sæt(1, STI_OVERSKRIFT, STIL.kontrol, teknik);
        if (kopi) { f.sæt(2, kopi, STIL.overskrift, hoved); f.sæt(2, null, STIL.kontrol, teknik); }
        for (const [c, s] of felter) {
            const p = postFor(s);
            const marked = MARKEDER.find(([m]) => s.endsWith(`.${m}`))?.[1];
            const ældre = /max_bid_mw$/.test(s) ? "Ældre: " : "";
            f.sæt(c, `${ældre}${marked ? `${marked}-` : ""}${overskrift(p, s)}`, STIL.overskrift, hoved);
            f.sæt(c, s, STIL.kontrol, teknik);
        }
        f.højde(hoved, 45);
        const rækker = Math.max(plads, navne.length);
        for (let j = 0; j < rækker; j++) {
            f.r = første + j;
            const n = navne[j];
            f.sæt(1, n ? n.navn : null, n ? STIL.kopi : STIL.gul);
            if (kopi) f.sæt(2, n?.kopi ?? null, n ? STIL.kopi : STIL.gul);
            for (const [c, s] of felter) {
                if (n) felt(f, c, s.replace(pladsholder, n.navn));
                else f.sæt(c, null, STIL.gul);
            }
        }
        for (const [c, s] of felter) f.liste(c, første, første + rækker - 1, postFor(s));
        f.r = første + rækker + 1;
    };

    // ---------------------------------------------------------------- Start og drift
    // A navn/felt | B type/værdi | C kun hvis/i drift | D enhed/tændt | E start/stop | F CO₂ | G år | H noter/forklaring | I sti
    const sd = new Fane(START_OG_DRIFT, [30, 22, 18, 16, 18, 18, 14, 62, 36]);
    top(sd, "Start og drift — appens egne felter", "Gul = du udfylder. Hvid med kant = kopieret fra Anlaeg (ret navn og type dér). Kursiv grå = appens kontrolværdier; ret dem ikke. Hver række: navnet præcis som i Anlaeg. En tom celle betyder, at appen ikke rører feltet; (findes ikke) betyder, at feltet ikke sættes. Hvad det giver, står ved hvert felt herunder.");
    const enhedSkabeloner = ENHEDSFELTER.map(([, x]) => `units.{enhed}.${x}`);
    const tankSkabeloner = TANKFELTER.map(([, x]) => `storage.{tank}.${x}`);
    forklar(sd, "Hvad felterne betyder", [...enhedSkabeloner, ...tankSkabeloner]);
    sd.sæt(1, "Værket", STIL.afsnit); sd.r++;
    feltblok(sd, VAERKSFELTER, { værdi: [[2, "værdi", null]], kunHvis: 3, enhed: 4, forklaring: 8, sti: 9 });
    tabel(sd, "Enheder: navn som i Anlaeg", "{enhed}", k.enheder.map((e) => ({ navn: e.navn, kopi: e.type })),
        ENHEDSFELTER.map(([c, x]) => [c, `units.{enhed}.${x}`] as const), 19, "type (kopi fra Anlaeg)");
    tabel(sd, "Tanke: navn som i Anlaeg", "{tank}", k.tanke.map((n) => ({ navn: n })), TANKFELTER.map(([c, x]) => [c, `storage.{tank}.${x}`] as const), 6);

    // ---------------------------------------------------------------- Balancemarked
    // A felt/navn | B værdi·aFRR | C mFRR | D enhed | E forklaring (bred) | F sti | G–I tabellens øvrige kolonner
    const bm = new Fane(BALANCEMARKED, [34, 26, 26, 14, 60, 30, 18, 20, 20]);
    top(bm, "Balancemarked — appens egne felter", "Her står, HVORDAN værket byder. OM der regnes med balancemarked, vælger du på scenariet (Scenarier › med balancemarked). Modellens script skriver aldrig et balancemarked; står hele fanen på (findes ikke), har værket intet. Om en enhed kan byde, står i Anlaeg (kolonnen 'kan byde i balancemarked'). Gul = du udfylder; kursiv grå = appens kontrolværdier.");
    forklar(bm, "Hvad felterne pr. enhed og pr. måned betyder", [...BUDFELTER.map(([, s]) => s), MAANEDSFELT]);
    bm.sæt(1, "Metode, bud og lofter", STIL.afsnit); bm.r++;
    const blokBm = { enhed: 4, forklaring: 5, sti: 6 };
    feltblok(bm, BALANCEFELTER, { værdi: [[2, "værdi", null]], ...blokBm });
    bm.sæt(1, "Pr. marked — fast budpris (tærskel) eller beregnet budpris (referenceenhed og gulv)", STIL.afsnit); bm.r++;
    feltblok(bm, MARKEDSFELTER, { værdi: MARKEDER.map(([m, navn], j) => [2 + j, navn, m] as const), ...blokBm });
    tabel(bm, "Pr. enhed: navn som i Anlaeg", "{enhed}", k.enheder.map((e) => ({ navn: e.navn })), BUDFELTER, Math.max(k.enheder.length + 2, k.vaerk ? 0 : 19));
    {
        const måneder = [...new Set([...k.værk.keys()].map((s) => /^balancing\.availability\.(afrr|mfrr)\.mw_by_month\.(\d{4}-\d{2})$/.exec(s)?.[2]).filter((x): x is string => !!x))].sort();
        const hoved = bm.r, teknik = bm.r + 1, første = bm.r + 2;
        const p = postFor(MAANEDSFELT);
        bm.sæt(1, "Månedsloft: måned (ÅÅÅÅ-MM)", STIL.overskrift, hoved); bm.sæt(1, STI_OVERSKRIFT, STIL.kontrol, teknik);
        MARKEDER.forEach(([m, navn], j) => {
            bm.sæt(2 + j, `${navn}: ${overskrift(p, "månedsloft")}`, STIL.overskrift, hoved);
            bm.sæt(2 + j, MAANEDSFELT.replace("{marked}", m), STIL.kontrol, teknik);
        });
        bm.højde(hoved, 33.75);
        // Plads til et helt år (brugertesten F14).
        const rækker = Math.max(12, måneder.length + 2);
        for (let j = 0; j < rækker; j++) {
            bm.r = første + j;
            const md = måneder[j];
            bm.sæt(1, md ?? null, STIL.gul);
            MARKEDER.forEach(([m], i) => {
                const sti = MAANEDSFELT.replace("{marked}", m).replace("{måned}", md ?? "");
                // En måned, værket ikke har et loft for i markedet, er intet felt: (findes ikke) fjerner intet.
                if (md) felt(bm, 2 + i, sti); else bm.sæt(2 + i, null, STIL.gul);
            });
        }
        bm.r = første + rækker;
    }

    // ---------------------------------------------------------------- Øvrige felter
    // A felt | B værdi | C kun hvis | D enhed | E forklaring | F sti i modellen (til højre, brugertesten F8–F13)
    const ov = new Fane(OEVRIGE, [44, 28, 28, 16, 70, 50]);
    top(ov, "Øvrige felter — appens egne felter", `Her står hvert felt i værket, som hverken modellens faner eller appens andre faner bærer. Gul = du udfylder. ${FINDES_IKKE} = værket har ikke feltet (modellens script ville ellers skrive det). Står der noget i kolonnen '${KUN_HVIS}', gælder rækken kun, så længe modellens script læser netop den værdi af modellens faner: retter du fx tankens maks fyldning i Anlaeg, vinder din rettelse, og importens log siger, at rækken ikke blev brugt. En tom værdi betyder, at appen ikke rører feltet. En ny række: skriv værdien og feltets sti i kolonnen '${STI_OVERSKRIFT}' (stien står under hvert felt i appen). ja/nej for til/fra, lister som [10,11,12], null for et felt, der står tomt i værket.`);
    ov.sæt(1, "felt", STIL.overskrift); ov.sæt(2, "værdi", STIL.overskrift); ov.sæt(3, KUN_HVIS, STIL.overskrift);
    ov.sæt(4, "enhed", STIL.overskrift); ov.sæt(5, "forklaring", STIL.overskrift); ov.sæt(6, STI_OVERSKRIFT, STIL.overskrift);
    ov.højde(ov.r, 33.75);
    const ovHoved = ov.r;
    ov.r++;
    const former: Record<string, string> = {};
    const rest = [...new Set([...k.værk.keys(), ...slut.keys()])]
        .filter((sti) => k.værk.get(sti) !== slut.get(sti))
        .sort((a, b) => (afsnitOrden(a) - afsnitOrden(b)) || (katalogOrden(a) - katalogOrden(b)) || (a < b ? -1 : a > b ? 1 : 0));
    let afsnit = "";
    for (const sti of rest) {
        const vv = k.værk.get(sti), sv = slut.get(sti), script = k.script.get(sti);
        if (vv !== undefined && sv !== undefined && sammeTal(vv, sv)) continue;           // kun skrivemåden: former (nedenfor)
        const u = undtaget(sti) ?? holdtUde(sti);
        if (u) { grunde.set(sti, u); continue; }
        if (grunde.has(sti)) continue;                                                     // en celle i en anden fane kunne ikke bære det
        const værdi = vv === undefined ? { celle: FINDES_IKKE as Celleværdi, json: null as string | null } : celleFor(sti, vv);
        // Et felt, værket IKKE har, kan kun fjernes, hvis stien er kendt (importen afviser en ukendt sti).
        const kendt = !!findFelt(sti)?.blad && gyldigSti(sti);
        const betingelse = script === undefined ? null : celleFor(sti, script);
        const grund = !kendt ? "feltet findes ikke i feltkataloget, så importen kan ikke validere det"
            : "grund" in værdi ? værdi.grund
                : betingelse && "grund" in betingelse ? `modelscriptets værdi kan ikke stå i en celle (${betingelse.grund})`
                    : vv !== undefined ? peger(sti, vv) : null;
        if (grund || "grund" in værdi) { grunde.set(sti, grund ?? "værdien kan ikke stå i en celle"); continue; }
        const nyt = afsnitAf(sti);
        if (nyt !== afsnit) { afsnit = nyt; ov.sæt(1, nyt, STIL.afsnit); ov.r++; }
        const p = findFelt(sti);
        const d = sti.split(".");
        const objekt = ["units", "storage", "prices"].includes(d[0]) && d.length > 2 ? ` · ${d[1]}` : "";
        ov.sæt(1, `${p?.etiket ?? sti}${objekt}`, STIL.etiket);
        ov.sæt(2, værdi.celle, p && !p.laeses_af_koden ? STIL.kopi : STIL.gul);
        ov.sæt(3, betingelse && "celle" in betingelse ? betingelse.celle : null, STIL.kontrol);
        ov.sæt(4, enhedAf(p), STIL.kontrol);
        ov.ombrudt(5, forklaringFor(p), STIL.forklaring);
        ov.sæt(6, sti, STIL.kontrol);
        refAf.set(sti, `${OEVRIGE}!B${ov.r}`);
        ov.r++;
        antal[OEVRIGE]++;
        if (værdi.json === null) slut.delete(sti); else slut.set(sti, værdi.json);
    }
    // Plads til nye rækker (gule), så en ny række ikke kræver formatering.
    for (let j = 0; j < 10; j++) { ov.sæt(1, null, STIL.gul); ov.sæt(2, null, STIL.gul); ov.sæt(6, null, STIL.gul); ov.r++; }

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

    // ---------------------------------------------------------------- Læs først
    const afvigelser = findAfvigelser(k, slut, refAf);
    const lf = læsFørst(k, afvigelser);
    return {
        celler: [...lf.celler, ...sd.celler, ...bm.celler, ...ov.celler],
        faner: [lf.form(0, true), sd.form(2), bm.form(2), ov.form(ovHoved)],
        endelig: slut, former, ikkeMed, antal, afvigelser,
    };
}

/** Afsnittene i Øvrige felter (brugertesten F30, F33): den sjældne del sidst. */
const AFSNIT: [RegExp, string][] = [
    [/^electricity\./, "Eltarif — gælder i stedet for tarifskemaet i Priser (se Læs først)"],
    [/^(units|storage)\./, "Enheder og tanke"],
    [/^prices\./, "Priser"],
    [/^(grid|investment|ancillary_groups|data)\./, "Øvrigt om værket"],
    [/^meta\./, "Værkets navn og beskrivelse"],
    [/^heat_load_params\./, "Kun til syntetisk varmelast — bruges ikke, når værket har en målt varmelast"],
    [/^(solver|time)\./, "Avanceret: beregningens indstillinger"],
];
const afsnitAf = (sti: string) => AFSNIT.find(([m]) => m.test(sti))?.[1] ?? "Øvrigt";
const afsnitOrden = (sti: string) => { const i = AFSNIT.findIndex(([m]) => m.test(sti)); return i < 0 ? AFSNIT.length : i; };

/** Kolonnerne i Anlaeg for de felter, en ændring i appens faner kan gøre forskellig fra det, Anlaeg viser. */
const ANLAEG_KOL: Record<string, [string, string]> = {
    p_max_heat: ["C", "maks varme"], p_min_heat: ["D", "min varme"], eta_fuel_to_heat: ["E", "varme virkningsgrad"], var_om: ["H", "D&V"],
    start_cost: ["I", "startomkostning"], min_uptime: ["J", "min driftstid"], min_downtime: ["K", "min stoptid"],
};
const TANK_KOL: Record<string, [string, string]> = {
    volume_m3: ["B", "volumen"], e_max_mwh: ["C", "maks fyldning"], p_max_charge_mw: ["D", "maks ladeeffekt"], p_max_discharge_mw: ["E", "maks afladeeffekt"],
};

/**
 * Hvor en værdi i modelrepoets faner IKKE er den, modellen bruger (lead's beslutning 4: én sandhed) — med cellen, der
 * gælder. Regnet af forskellen mellem scriptets læsning og det færdige værk, så listen passer til netop dette værk.
 */
function findAfvigelser(k: Lagkilde, slut: ReadonlyMap<string, string>, refAf: ReadonlyMap<string, string>): Lagplan["afvigelser"] {
    const ud: Lagplan["afvigelser"] = [];
    const h = k.henvisning;
    const vis = (j: string | undefined) => (j === undefined ? "intet" : j === "null" ? "tom (regnes)" : j.replace(/^"|"$/g, "").replace(".", ","));
    const forskel = (sti: string) => k.script.get(sti) !== slut.get(sti) && !(k.script.get(sti) && slut.get(sti) && sammeTal(k.script.get(sti)!, slut.get(sti)!));
    if (h) {
        for (const [n, r] of h.enhedRække) {
            for (const [felt, [kol, navn]] of Object.entries(ANLAEG_KOL)) {
                const sti = `units.${n}.${felt}`;
                if (forskel(sti)) ud.push({ hvor: `Anlaeg ${kol}${r} (${navn}, ${n})`, hvad: `Modellen bruger ${vis(slut.get(sti))}, ikke ${vis(k.script.get(sti))}.`, celle: refAf.get(sti) ?? OEVRIGE });
            }
            // Start/stop-logik nej: startomkostning, driftstider og minimumslast i Anlaeg bruges ikke (brugertesten F1).
            if (slut.get(`units.${n}.uc_enabled`) !== "true" && slut.get(`units.${n}.enabled`) !== "false") {
                const brugtIkke = [["start_cost", 0, "startomkostning"], ["min_uptime", 1, "min driftstid"], ["min_downtime", 1, "min stoptid"], ["p_min_heat", 0, "min varme"]]
                    .filter(([f, grænse]) => (jsonTal(slut.get(`units.${n}.${f}`)) ?? 0) > (grænse as number)).map(([, , navn]) => navn as string);
                if (brugtIkke.length) ud.push({ hvor: `Anlaeg række ${r} (${n}): ${brugtIkke.join(", ")}`, hvad: "Bruges ikke, fordi start/stop-logik står på nej. Sæt den til ja, hvis tallene skal gælde.", celle: refAf.get(`units.${n}.uc_enabled`) ?? START_OG_DRIFT });
            }
        }
        for (const [n, r] of h.tankRække) {
            for (const [felt, [kol, navn]] of Object.entries(TANK_KOL)) {
                const sti = `storage.${n}.${felt}`;
                if (!forskel(sti)) continue;
                const hvad = felt === "e_max_mwh" && slut.get(sti) === "null"
                    ? `Modellen regner tankens kapacitet af volumen og temperaturforskel (${vis(slut.get(`storage.${n}.delta_t_k`))} K) og bruger ikke MWh-tallet.`
                    : `Modellen bruger ${vis(slut.get(sti))}, ikke ${vis(k.script.get(sti))}.`;
                ud.push({ hvor: `Anlaeg ${kol}${r} (${navn}, ${n})`, hvad, celle: refAf.get(sti) ?? OEVRIGE });
            }
        }
        const tarif = [...new Set([...k.script.keys(), ...slut.keys()])].filter((s) => (s === "electricity.tariff_consumption_flat" || s.startsWith("electricity.tariff_consumption.")) && forskel(s)).sort();
        if (tarif.length) {
            const flad = slut.get("electricity.tariff_consumption_flat");
            const profil = [...slut.keys()].some((s) => s.startsWith("electricity.tariff_consumption.net_tariff."));
            const hvad = profil
                ? `Modellen bruger en fast tarif på ${vis(flad)} kr/MWh i aktiveringsværdien, ikke summen af Energinet og højlast i Priser.`
                : `Værket har ingen tarifprofil: modellen bruger en fast tarif på ${vis(flad)} kr/MWh hele året, ikke skemaet i Priser.`;
            const celler = tarif.map((s) => refAf.get(s)).filter((x): x is string => !!x);
            ud.push({ hvor: `Priser, eltarif (række ${14 + h.priserForskyd}–${24 + h.priserForskyd})`, hvad: `${hvad} Retter du tariffen i Priser, gælder Priser, og importens log siger det.`, celle: celler.length > 1 ? `${celler[0]} – ${celler[celler.length - 1].split("!")[1]}` : celler[0] ?? OEVRIGE });
        }
        if (h.solvarmeArk) ud.push({ hvor: "Anlaeg M (solvarmens årsproduktion)", hvad: "Bruges ikke: arket Solvarme har timeværdierne, og de gælder. En rettelse i Anlaeg gemmes ikke.", celle: "Solvarme" });
    }
    for (const s of ["time.start", "time.end"]) {
        if (forskel(s)) ud.push({ hvor: "Timedata og Vejledning (1. juli 2025 – 30. juni 2026)", hvad: `Værkets modelperiode er ${vis(slut.get("time.start"))} – ${vis(slut.get("time.end"))}.`, celle: refAf.get(s) ?? START_OG_DRIFT });
        if (forskel(s)) break;
    }
    for (const [sti, j] of slut) {
        if (/^(units|storage)\.[^.]+\.notes$/.test(sti) && /\[BEKRÆFT|\[TBC/i.test(j)) {
            ud.push({ hvor: `Noter for ${sti.split(".")[1]}`, hvad: "Noten er et åbent spørgsmål fra værkets kildefil ([BEKRÆFT …]), ikke en bekræftet værdi.", celle: refAf.get(sti) ?? START_OG_DRIFT });
        }
    }
    return ud;
}

/** Fanen Læs først (lead's beslutning 4; brugertesten F3, F16, F17, F20). */
function læsFørst(k: Lagkilde, afvigelser: Lagplan["afvigelser"]): Fane {
    const f = new Fane(LAES_FOERST, [36, 96, 30]);
    f.tekst("Læs først — værksark fra appen", STIL.titel);
    if (k.vaerk) {
        f.tekst(`Dette ark hører til værket ${k.vaerk.navn} (kode ${k.vaerk.kode}), revision ${k.vaerk.revision}. Uploader du det i appen, gemmes dine ændringer som revision ${k.vaerk.revision + 1} af netop dette værk. Vil du i stedet lave et NYT værk ud fra arket, så giv det et nyt navn i Priser (værkets navn) og vælg "Opret som nyt værk" ved upload — eller kopiér værket i appen først og eksportér kopien.`, STIL.etiket);
    } else {
        f.tekst("Tom skabelon med appens faner. Udfyld modellens faner (Vejledning, Timedata, Anlaeg, Varmepumpe, Priser) som beskrevet i Vejledning, og appens faner efter behov. Upload arket i appen under Konfiguration › Upload værksark; det bliver et nyt værk.", STIL.etiket);
    }
    f.r++;
    const punkt = (titel: string, tekst: string) => { f.sæt(1, titel, STIL.etiket); f.tekst(tekst, STIL.tekst, 2); };
    punkt("Fanerne", "Vejledning, Timedata, Anlaeg, Varmepumpe, Priser og Solvarme er modellens egne faner. Læs først, Start og drift, Balancemarked og Øvrige felter er appens: appen læser dem, når arket uploades i appen. Kører man modellens script direkte på arket, bruges de ikke.");
    punkt("Farverne i appens faner", "Gul = du udfylder. Hvid med kant = kopieret fra Anlaeg; ret det dér. Kursiv grå = appens kontrolværdier og stier; ret dem ikke. (I modellens faner betyder grå en eksempelrække.)");
    punkt("Tom celle og (findes ikke)", `En tom celle i appens faner betyder: appen rører ikke feltet, og værket får det, modellens script læser af modellens faner. ${FINDES_IKKE} betyder: feltet sættes ikke, og modellen bruger sin egen standard. Ved hvert felt står, hvad de to giver. Appen skriver altid en værdi eller ${FINDES_IKKE} i alle celler, når den eksporterer.`);
    punkt("Det skjulte ark _app", "Slet det ikke. Det fortæller appen, hvilket værk og hvilken revision arket kom fra.");
    punkt("Gemmes ikke ved genupload", "Årsproduktionen i Timedata B3 (den bruges kun, når der ingen timedata er), værkets navn i Priser (omdøb værket i appen), solvarmens årsproduktion i Anlaeg, når arket Solvarme har timerne, og COP ved 0 °C for en varmepumpe med målepunkter.");
    punkt("Tidsstempler", "Timedata og Solvarme fra appen er stemplet med timens start i UTC.");
    punkt("Afvist, fordi værket er ændret", "Har en kollega gemt en ændring, siden du eksporterede, afvises arket, og intet gemmes. Eksportér igen, og flyt dine rettelser over i det nye ark — eller ret dem i appen.");
    f.r++;
    f.sæt(1, "Her bruger modellen IKKE det, der står i modellens faner", STIL.afsnit); f.r++;
    f.sæt(1, "hvor", STIL.overskrift); f.sæt(2, "hvad der gælder i stedet", STIL.overskrift); f.sæt(3, "cellen, der gælder", STIL.overskrift); f.r++;
    if (!afvigelser.length) { f.sæt(1, "—", STIL.tekst); f.sæt(2, k.vaerk ? "Ingen: for dette værk er modellens faner det, modellen bruger." : "Tom skabelon: listen udfyldes, når et værk eksporteres.", STIL.tekst); f.r++; }
    for (const a of afvigelser) {
        f.ombrudt(1, a.hvor, STIL.tekst);
        f.ombrudt(2, a.hvad, STIL.tekst);
        f.sæt(3, a.celle, STIL.kontrol);
        f.r++;
    }
    return f;
}

// ------------------------------------------------------------------ læsning (til visningen af et uploadet ark)

type V = number | string;
const norm = (v: V | undefined) => (typeof v === "string" ? v.split(/\s+/).join(" ").trim().toLowerCase() : "");
const UDEN_VAERDI = new Set(["", "felt", "enhed", "forklaring", "standard", STI_OVERSKRIFT]);

export interface Lagcelle { sti: string; v: V | undefined; hvor: string; betingelse?: V }

/** Kolonnenummer for en cellereference (A -> 1). */
function kolNr(bogstaver: string): number { let n = 0; for (const ch of bogstaver) n = n * 26 + ch.charCodeAt(0) - 64; return n; }

/**
 * Appens faner i et uploadet ark som (sti -> celle) — samme form som importen læser (fjv.arklag.laes), men uden
 * validering: det er til visningen af, hvad brugeren har ændret, før noget sendes. Stierne står i arkets navne.
 * Løkkerne går over de rækker og kolonner, arket HAR celler i (Codex' review, fund 1).
 */
export function læsLag(ark: ReadonlyMap<string, ReadonlyMap<string, V>>): Map<string, Lagcelle> {
    const ud = new Map<string, Lagcelle>();
    for (const navn of LAGFANER) {
        const c = ark.get(navn);
        if (!c) continue;
        const pr = new Map<number, Map<number, V>>();
        for (const [key, v] of c) {
            const m = /^([A-Z]+)(\d+)$/.exec(key);
            if (!m) continue;
            const r = Number(m[2]);
            if (!pr.has(r)) pr.set(r, new Map());
            pr.get(r)!.set(kolNr(m[1]), v);
        }
        const rækker = [...pr.keys()].sort((a, b) => a - b);
        const celle = (r: number, kol: number) => pr.get(r)?.get(kol);
        const kolMed = (r: number, tekst: string, præfiks = false) => {
            for (const [kol, v] of pr.get(r) ?? []) { const t = norm(v); if (t && (t === tekst || (præfiks && t.startsWith(tekst)))) return kol; }
            return 0;
        };
        const erFeltblok = (r: number) => norm(celle(r, 1)) === "felt" && kolMed(r, STI_OVERSKRIFT) > 0;
        const erTabel = (r: number) => norm(celle(r + 1, 1)) === STI_OVERSKRIFT;
        const starter = rækker.filter((r) => erFeltblok(r) || erTabel(r));
        const sæt = (sti: string, r: number, kol: number, betingelse?: V) => ud.set(sti, { sti, v: celle(r, kol), hvor: `${navn}!${ref(kol, r)}`, ...(betingelse !== undefined ? { betingelse } : {}) });
        starter.forEach((h, i) => {
            const slut = starter[i + 1] ?? Infinity;
            if (erFeltblok(h)) {
                const p = kolMed(h, STI_OVERSKRIFT), kb = kolMed(h, "kun hvis", true);
                const kolonner: [number, string][] = [...(pr.get(h) ?? [])].filter(([kol, v]) => kol !== p && kol !== kb && !UDEN_VAERDI.has(norm(v))).map(([kol, v]) => [kol, norm(v)] as [number, string]);
                for (const r of rækker) {
                    if (r <= h || r >= slut) continue;
                    const skabelon = celle(r, p);
                    if (typeof skabelon !== "string" || !skabelon.trim()) continue;
                    for (const [kol, hd] of kolonner) {
                        const sti = hd === "værdi" ? skabelon.trim() : skabelon.trim().replace("{marked}", hd);
                        sæt(sti, r, kol, kb ? celle(r, kb) : undefined);
                    }
                }
            } else {
                const t = h + 1;
                const kolonner: [number, string][] = [...(pr.get(t) ?? [])].filter(([kol, s]) => kol > 1 && typeof s === "string" && s.trim()).map(([kol, s]) => [kol, String(s).trim()] as [number, string]);
                for (const r of rækker) {
                    if (r <= t || r >= slut) continue;
                    const nøgle = celle(r, 1);
                    if (nøgle === undefined || !String(nøgle).trim()) continue;
                    for (const [kol, s] of kolonner) {
                        if (s.includes("{måned}") && celle(r, kol) === undefined) continue;
                        sæt(s.replace(/\{enhed\}|\{tank\}|\{måned\}/, String(nøgle).trim()), r, kol);
                    }
                }
            }
        });
    }
    return ud;
}

export { slug };
