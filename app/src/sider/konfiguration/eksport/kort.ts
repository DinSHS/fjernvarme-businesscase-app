//-----------------------------------------------------------------------
// Værk -> værksark (runde 12): hvilke celler i modelrepoets skabelon
// (vaerksdata_skabelon.xlsx ved pinnen) et værks blade bliver til, og
// PRÆCIS hvad modelrepoets scripts/vaerksark_til_yaml.py — kørt uændret af
// importen — læser tilbage. Forudsigelsen er en tro gengivelse af scriptets
// regler (laes_priser, laes_enheder, laes_tanke, laes_varmepumper,
// laes_timedata, main); gaten kører det rigtige script på hver eksport og
// kræver, at forudsigelsen og scriptet er enige felt for felt
// (viden/vaerktoej/tjek_eksport_rundtur.py).
//
// Forskellen mellem værket og forudsigelsen er "ikke med i arket": felter,
// skabelonen ikke kan udtrykke, eller som scriptet sætter til sin egen
// standard. De vises, før arket hentes. Ved genupload som revision røres de
// ikke (kun det, brugeren ændrer i arket, gemmes); ved upload som nyt værk
// får værket scriptets værdi. Aldrig tavst tab.
//-----------------------------------------------------------------------

import { pyRound } from "@/lib/pyround";
import { f, fladPy, i, type PyVærdi } from "./pyjson";
import { slug } from "./slug";
import { synligTekst, ulovligtXmlTegn } from "./xlsx";

// ------------------------------------------------------------------ modelscriptets konstanter (ved pinnen)

/** scripts/vaerksark_til_yaml.py:73-95 */
const TYPER_UDEN_BRAENDSEL = new Set(["heat_pump", "electric_boiler", "solar_thermal"]);
const BRAENDSEL_PR_TYPE: Record<string, string | null> = {
    heat_pump: "electricity", electric_boiler: "electricity", biomass_boiler: null, gas_boiler: "natural_gas",
    gas_engine_chp: "natural_gas", solar_thermal: "solar", waste_heat: "waste_heat",
};
const BIOMASSE_DANSK: Record<string, string> = { straw: "halm", wood_pellets: "træpiller", flis: "flis" };
/** src/config.py KENDTE_DMI_OMRAADER = skabelonens dropdown (Priser!B28). */
export const DMI_OMRAADER = ["fyn", "vestkyst", "karup", "ringsted"] as const;
/** Andebys døgnprofil, som scriptet skalerer (main, vaerksark_til_yaml.py:1582-1585). */
const ANDEBY_PROFIL = [4.437, 4.500, 4.602, 4.767, 4.822, 5.112, 5.590, 5.606, 5.355, 4.955, 4.775, 4.696,
    4.563, 4.469, 4.414, 4.359, 4.430, 4.602, 4.728, 4.767, 4.735, 4.728, 4.610, 4.390];
/** Perioden, Timedata skal ligge i (laes_timedata: UTC, timens start). */
export const PERIODE_START = Date.UTC(2025, 6, 1, 0);
export const PERIODE_SLUT = Date.UTC(2026, 5, 30, 23);
const TIME = 3_600_000;
/** Skabelonens plads (rækker med dropdown/indtastningsfelter). */
export const PLADS = { enheder: { fra: 5, til: 23 }, tanke: { fra: 52, til: 57 }, vp: { fra: 6, til: 23 }, timedata: 6 } as const;

export { slug };

// ------------------------------------------------------------------ input og uddata

export interface Serie { startMs: number; oploesning: "1h" | "15min"; værdier: readonly (number | null)[] }
export interface Tidsseriekilde { id: string; navn?: string; sha256?: string | null; serie: Serie }

export interface Eksportkilde {
    vaerk: { id: string; kode: string; navn: string; revision: number };
    blade: readonly { sti: string; vaerdi_json: string; raekkefoelge?: number }[];
    /** Værkets AKTIVE tidsserier (det, en kørsel bruger). */
    varmelast: Tidsseriekilde | null;
    solprofil: Tidsseriekilde | null;
}

export type Celle = { ark: string; ref: string; v: number | string | null; stil?: number | null; formel?: string };

/** Én post i listen "ikke med i arket": værkets værdi, og hvad modelscriptet giver ved upload som nyt værk. */
export interface Tab { sti: string; værk: string | null; script: string | null; grund?: string }

export interface Eksportplan {
    celler: Celle[];
    /** Strukturelle ændringer af skabelonen. */
    træpillerRække: boolean;
    braendselKolonne: boolean;
    solvarmeArk: boolean;
    /** Det, appens import (scriptet + markøren) gemmer som blade ved upload som nyt værk. */
    forventet: Map<string, string>;
    ikkeMed: Tab[];
    /** Stierne på `ikkeMed`, der ikke er konverteringsartefakter — markeringens `afvigelser` (K11 F4). */
    afvigelser: string[];
    /** Tidsserier: hvad der er med, og hvad der falder uden for arket. */
    serier: { rolle: "varmelast" | "solprofil"; med: number; udenfor: number; grund?: string }[];
    /** Timer, modelscriptet selv udfylder i solprofilen ved upload som nyt værk (K11 F6), med den værdi, det skriver. */
    udfyldes: { rolle: "solprofil"; ms: number; v: number; hvordan: "nat" | "interpolation" }[];
    /** Timer, modelscriptets %.6f afrunder i solprofilen ved upload som nyt værk (antal og største afrunding i MW). */
    afrundes: { rolle: "solprofil"; n: number; maks: number }[];
    /** Grunde til, at eksporten ikke kan laves (tom = kan). */
    nægter: string[];
    /** Advarsler, der ikke er tab (fx et skøn i en celle). */
    noter: string[];
}

// ------------------------------------------------------------------ hjælpere

type Json = unknown;
const tal = (x: Json): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const tekst = (x: Json): string | null => (typeof x === "string" ? x : null);

class Blade {
    readonly v = new Map<string, Json>();
    readonly rå = new Map<string, string>();
    readonly orden: string[] = [];
    constructor(blade: Eksportkilde["blade"]) {
        const sorteret = [...blade].sort((a, b) => (a.raekkefoelge ?? 0) - (b.raekkefoelge ?? 0));
        for (const b of sorteret) {
            this.rå.set(b.sti, b.vaerdi_json);
            this.orden.push(b.sti);
            try { this.v.set(b.sti, JSON.parse(b.vaerdi_json)); } catch { this.v.set(b.sti, undefined); }
        }
    }
    get(sti: string): Json { return this.v.get(sti); }
    objekter(sektion: string): string[] {
        const set = new Set<string>();
        for (const s of this.orden) if (s.startsWith(`${sektion}.`) && s.split(".").length > 2) set.add(s.split(".")[1]);
        return [...set];
    }
}

const aktiv = (b: Blade, o: string) => b.get(`${o}.enabled`) !== false;

// ------------------------------------------------------------------ planen

export function planlæg(k: Eksportkilde): Eksportplan {
    const b = new Blade(k.blade);
    const celler: Celle[] = [];
    const nægter: string[] = [];
    const noter: string[] = [];
    const grunde = new Map<string, string>();         // sti-præfiks -> hvorfor ikke med
    const sæt = (ark: string, ref: string, v: number | string | null, stil?: number | null) => celler.push({ ark, ref, v, ...(stil !== undefined ? { stil } : {}) });

    // ---------------------------------------------------------------- Priser
    const priser: Record<string, { value: number; unit: string }> = {};
    const prisCelle = (nøgle: string, ref: string) => {
        const v = tal(b.get(`prices.${nøgle}.value`));
        sæt("Priser", ref, v);
        if (v !== null) priser[nøgle] = { value: v, unit: nøgle === "co2_eua" ? "DKK/t_CO2" : "DKK/MWh_fuel" };
    };
    const harPiller = tal(b.get("prices.wood_pellets.value")) !== null;
    // Træpiller har ingen række i skabelonen: en række indsættes i brændselsblokken (scriptet læser blokken til
    // første tomme celle i A og kender 'træpiller'). Rækkerne under flyttes én ned.
    const o = harPiller ? 1 : 0;
    prisCelle("natural_gas", "B6"); prisCelle("straw", "B7"); prisCelle("flis", "B8"); prisCelle("waste_heat", "B9"); prisCelle("co2_eua", "B10");
    if (harPiller) {
        sæt("Priser", "A11", "træpiller", 22); sæt("Priser", "C11", "kr/MWh", 22); sæt("Priser", "D11", "Pr. MWh brændsel (eksporteret af appen).", 24);
        prisCelle("wood_pellets", "B11");
    }
    for (const p of b.objekter("prices")) {
        if (!["natural_gas", "straw", "flis", "waste_heat", "co2_eua", "wood_pellets"].includes(p)) grunde.set(`prices.${p}`, "brændslet har ingen række i skabelonens prisblok");
    }
    const rk = (r: number) => r + o;

    const elafgift = tal(b.get("electricity.electricity_tax"));
    const TC = "electricity.tariff_consumption";
    const harProfil = k.blade.some((x) => x.sti.startsWith(`${TC}.`));
    const flad = tal(b.get("electricity.tariff_consumption_flat"));
    let energinet = tal(b.get(`${TC}.fixed_components.energinet`));
    let dv = tal(b.get(`${TC}.fixed_components.dv`));
    const bånd = (n: string) => tal(b.get(`${TC}.net_tariff.bands.${n}`));
    const sæson = (s: string, d: string, t: string) => tekst(b.get(`${TC}.net_tariff.seasons.${s}.${d}.${t}`));
    let lavV: number | null, højV: number | null, spidsV: number | null, lavS: number | null, højS: number | null;
    if (harProfil) {
        // Skabelonens tarifskema er N1's inddeling med én sats pr. bånd og sæson (laes_priser:1312-1376).
        lavV = bånd(sæson("vinter", "weekday", "00-06") ?? "lav");
        højV = bånd(sæson("vinter", "weekday", "21-24") ?? "hoej");
        const spidsNavn = sæson("vinter", "weekday", "06-21");
        spidsV = spidsNavn && spidsNavn !== (sæson("vinter", "weekday", "21-24") ?? "hoej") ? bånd(spidsNavn) : null;
        lavS = bånd(sæson("sommer", "weekday", "00-06") ?? "lav");
        højS = bånd(sæson("sommer", "weekday", "06-24") ?? "hoej");
    } else {
        // En flad tarif uden skema: arket har altid et skema. Energinet = den flade sats og alle bånd 0 giver samme
        // tariff_consumption_flat i scriptet, men et skema er et andet input — derfor står det på listen.
        energinet = flad; dv = 0; lavV = 0; højV = 0; spidsV = null; lavS = 0; højS = 0;
        grunde.set(TC, "værket har en flad eltarif; arket har altid et tarifskema");
    }
    sæt("Priser", `B${rk(14)}`, elafgift);
    sæt("Priser", `B${rk(15)}`, energinet);
    sæt("Priser", `B${rk(16)}`, dv);
    sæt("Priser", `B${rk(17)}`, tal(b.get("electricity.tariff_production_flat")));
    sæt("Priser", `B${rk(22)}`, lavV); sæt("Priser", `C${rk(22)}`, lavS);
    sæt("Priser", `B${rk(23)}`, højV); sæt("Priser", `C${rk(23)}`, højS);
    sæt("Priser", `B${rk(24)}`, spidsV); sæt("Priser", `C${rk(24)}`, null);
    const dmi = tekst(b.get("data.dmi_area"));
    const zone = tekst(b.get("data.price_zone"));
    sæt("Priser", `B${rk(28)}`, dmi);
    sæt("Priser", `B${rk(29)}`, zone);
    sæt("Priser", `B${rk(30)}`, k.vaerk.navn);
    if (elafgift === null) nægter.push("Værket har ingen elafgift (electricity.electricity_tax) — arket kræver den.");
    if (energinet === null) nægter.push("Værket har ingen Energinet-tarif (tariff_consumption.fixed_components.energinet) — arket kræver den.");
    if ((lavV === null && lavS === null) || (højV === null && højS === null)) nægter.push("Tarifskemaet mangler lavlast eller højlast — arket kræver begge.");
    if (!dmi || !(DMI_OMRAADER as readonly string[]).includes(dmi.toLowerCase())) nægter.push(`DMI-området "${dmi ?? ""}" findes ikke i skabelonen (${DMI_OMRAADER.join(", ")}).`);
    if (!zone || !["DK1", "DK2"].includes(zone.toUpperCase())) nægter.push(`Priszonen "${zone ?? ""}" er hverken DK1 eller DK2.`);
    if (!slug(k.vaerk.navn)) nægter.push("Værkets navn giver en tom kode i modelscriptet.");

    // ---------------------------------------------------------------- Anlaeg: enheder
    const enheder = b.objekter("units");
    const medtagne: string[] = [];
    const udeladte: { navn: string; grund: string }[] = [];
    for (const n of enheder) {
        const u = `units.${n}`;
        const type = tekst(b.get(`${u}.type`)) ?? "";
        if (!aktiv(b, u)) { udeladte.push({ navn: n, grund: "slået fra — arket har ingen kolonne for det, og modelscriptet ville slå den til" }); continue; }
        if (!(type in BRAENDSEL_PR_TYPE)) { udeladte.push({ navn: n, grund: `typen "${type}" kan ikke stå i skabelonen` }); continue; }
        medtagne.push(n);
    }
    for (const x of udeladte) grunde.set(`units.${x.navn}`, x.grund);
    if (medtagne.length === 0) nægter.push("Værket har ingen aktiv enhed, arket kan udtrykke.");
    if (medtagne.length > PLADS.enheder.til - PLADS.enheder.fra + 1) nægter.push(`Værket har ${medtagne.length} aktive enheder; skabelonen har plads til ${PLADS.enheder.til - PLADS.enheder.fra + 1}.`);
    const biomasse = medtagne.some((n) => b.get(`units.${n}.type`) === "biomass_boiler");
    const vpPunkter: { navn: string; t: number; q: number; e: number }[] = [];
    const solenheder = medtagne.filter((n) => b.get(`units.${n}.type`) === "solar_thermal");

    // Solprofilen (målt -> arket Solvarme) og varmelasten (Timedata) — brug og vindue afgøres her.
    const vl = timeserie(k.varmelast, "varmelast");
    const vindue = vl.punkter.length ? { start: vl.punkter[0][0], slut: vl.punkter[vl.punkter.length - 1][0] } : { start: PERIODE_START, slut: PERIODE_SLUT };
    const solVindue = { start: Date.UTC(new Date(vindue.start).getUTCFullYear(), new Date(vindue.start).getUTCMonth(), new Date(vindue.start).getUTCDate()), slut: 0 };
    solVindue.slut = Date.UTC(new Date(vindue.slut).getUTCFullYear(), new Date(vindue.slut).getUTCMonth(), new Date(vindue.slut).getUTCDate(), 23);
    const sol = solenheder.length === 1 && k.solprofil ? solserie(k.solprofil, solVindue) : null;
    if (k.solprofil && solenheder.length !== 1) noter.push(`Solprofilen kommer ikke med: arket Solvarme kræver præcis én aktiv solvarmeenhed (værket har ${solenheder.length}).`);
    // K11 F6: huller og ender i solprofilen udfylder modelscriptet selv (skriv_maalt_solprofil) — sagt før download.
    const udfyldes: Eksportplan["udfyldes"] = [];
    const afrundes: Eksportplan["afrundes"] = [];
    if (sol?.nægt) nægter.push(sol.nægt);
    else if (sol) {
        udfyldes.push(...sol.udfyldt.map((u) => ({ rolle: "solprofil" as const, ...u })));
        const nat = sol.udfyldt.filter((u) => u.hvordan === "nat"), ip = sol.udfyldt.filter((u) => u.hvordan === "interpolation");
        if (nat.length) noter.push(`Solprofilen mangler ${nat.length} timer i enden af kørselsvinduet (${tidsrum(nat.map((u) => u.ms))}). Solen er nede i dem alle, og modelscriptet sætter dem til 0 MW.`);
        if (ip.length) noter.push(`Solprofilen har ${ip.length} ${ip.length === 1 ? "tom time" : "tomme timer"} inde i serien. Uploades arket som et nyt værk, udfylder modelscriptet ${ip.length === 1 ? "den" : "dem"} lineært: ${ip.slice(0, 12).map((u) => `${tidspunkt(u.ms)} → ${mw6(u.v)} MW`).join("; ")}${ip.length > 12 ? ` og ${ip.length - 12} timer mere (se listen)` : ""}. Ved genupload som revision forbliver timerne tomme i værkets serie.`);
        if (sol.afrundet) afrundes.push({ rolle: "solprofil", ...sol.afrundet });
        if (sol.afrundet) noter.push(`Modelscriptet skriver solprofilen med 6 decimaler: ${sol.afrundet.n} ${sol.afrundet.n === 1 ? "time afrundes" : "timer afrundes"} ved upload som nyt værk (højst ${sol.afrundet.maks.toExponential(1)} MW).`);
    }
    if (vl.huller.length) noter.push(`Varmelasten har ${vl.huller.length} ${vl.huller.length === 1 ? "tom time" : "tomme timer"} i perioden (${tidsrum(vl.huller)}). ${vl.huller.length === 1 ? "Den står tom i arket, og modelscriptet beholder den som et hul — modellen udfylder den" : "De står tomme i arket, og modelscriptet beholder dem som huller — modellen udfylder dem"} først ved kørslen (lineært, højst 5 % af vinduet), som for værkets egen serie.`);

    const rækkeAf = new Map<string, number>();
    medtagne.forEach((n, idx) => {
        const r = PLADS.enheder.fra + idx;
        rækkeAf.set(n, r);
        const u = `units.${n}`;
        const type = tekst(b.get(`${u}.type`))!;
        const kurve = tekst(b.get(`${u}.cop_curve.type`));
        const alpha = tal(b.get(`${u}.alpha`));
        const eta = tal(b.get(`${u}.eta_fuel_to_heat`));
        sæt("Anlaeg", `A${r}`, n, 10);
        sæt("Anlaeg", `B${r}`, type, 10);
        sæt("Anlaeg", `C${r}`, tal(b.get(`${u}.p_max_heat`)), 10);
        sæt("Anlaeg", `D${r}`, tal(b.get(`${u}.p_min_heat`)), 10);
        // E: varmevirkningsgrad; for en elkedel afledt af alpha (scriptet: alpha = -1/η).
        sæt("Anlaeg", `E${r}`, type === "electric_boiler" ? (alpha !== null && alpha !== 0 ? -1 / alpha : null) : TYPER_UDEN_BRAENDSEL.has(type) ? null : eta, 10);
        // F: COP ved 0 °C — kun for en varmepumpe uden målepunkter (lineær kurve, eller kun alpha).
        let cop: number | null = null;
        if (type === "heat_pump" && kurve !== "table") cop = tal(b.get(`${u}.cop_curve.a`)) ?? (alpha !== null && alpha < 0 ? -1 / alpha : null);
        sæt("Anlaeg", `F${r}`, cop, 10);
        // G: elvirkningsgrad for en gasmotor (scriptet: alpha = η_el/η_varme).
        sæt("Anlaeg", `G${r}`, type === "gas_engine_chp" && alpha !== null && eta !== null ? alpha * eta : null, 10);
        sæt("Anlaeg", `H${r}`, tal(b.get(`${u}.var_om`)), 10);
        sæt("Anlaeg", `I${r}`, tal(b.get(`${u}.start_cost`)), 10);
        sæt("Anlaeg", `J${r}`, tal(b.get(`${u}.min_uptime`)), 10);
        sæt("Anlaeg", `K${r}`, tal(b.get(`${u}.min_downtime`)), 10);
        sæt("Anlaeg", `L${r}`, b.get(`${u}.ancillary.afrr_qualified`) === true ? "ja" : "nej", 10);
        sæt("Anlaeg", `M${r}`, type === "solar_thermal" ? solGwh(sol, k, n) : null, 10);
        if (biomasse) {
            const fuel = tekst(b.get(`${u}.fuel`));
            sæt("Anlaeg", `N${r}`, type === "biomass_boiler" ? (fuel && BIOMASSE_DANSK[fuel]) || fuel : null, 10);
        }
        if (type === "heat_pump" && kurve === "table") {
            const pkt = b.get(`${u}.cop_curve.points`);
            if (Array.isArray(pkt)) for (const p of pkt) vpPunkter.push({ navn: n, t: Number(p?.t_ambient), q: Number(p?.heat_mw), e: Number(p?.el_mw) });
        }
    });
    // Ubrugte eksempelrækker tømmes og får indtastningsstilen (gul), som skabelonens tomme rækker.
    for (let r = PLADS.enheder.fra + medtagne.length; r <= PLADS.enheder.til; r++) {
        for (const c of "ABCDEFGHIJKLM") sæt("Anlaeg", `${c}${r}`, null, 10);
        if (biomasse) sæt("Anlaeg", `N${r}`, null, 10);
    }
    if (biomasse) sæt("Anlaeg", "N4", "brændsel", 12);

    // ---------------------------------------------------------------- Anlaeg: tanke
    const tanke = b.objekter("storage").filter((n) => {
        if (aktiv(b, `storage.${n}`)) return true;
        grunde.set(`storage.${n}`, "slået fra — arket har ingen kolonne for det, og modelscriptet ville slå den til");
        return false;
    });
    if (tanke.length === 0) nægter.push("Værket har ingen aktiv akkumuleringstank — modelscriptet kræver mindst én.");
    if (tanke.length > PLADS.tanke.til - PLADS.tanke.fra + 1) nægter.push(`Værket har ${tanke.length} tanke; skabelonen har plads til ${PLADS.tanke.til - PLADS.tanke.fra + 1}.`);
    tanke.forEach((n, idx) => {
        const r = PLADS.tanke.fra + idx;
        const s = `storage.${n}`;
        const vol = tal(b.get(`${s}.volume_m3`));
        const dt = tal(b.get(`${s}.delta_t_k`));
        const emax = tal(b.get(`${s}.e_max_mwh`)) ?? (vol !== null && dt !== null ? vol * 1.163 * dt / 1000 : null);
        sæt("Anlaeg", `A${r}`, n, 10); sæt("Anlaeg", `B${r}`, vol, 10); sæt("Anlaeg", `C${r}`, emax, 10);
        sæt("Anlaeg", `D${r}`, tal(b.get(`${s}.p_max_charge_mw`)), 10); sæt("Anlaeg", `E${r}`, tal(b.get(`${s}.p_max_discharge_mw`)), 10);
    });
    for (let r = PLADS.tanke.fra + tanke.length; r <= PLADS.tanke.til; r++) for (const c of "ABCDE") sæt("Anlaeg", `${c}${r}`, null, 10);

    // ---------------------------------------------------------------- objektnavne (Codex K11 F1)
    // Modelscriptets slug() normaliserer navnene (halm__kedel -> halm_kedel). Ved genupload fører importen scriptets
    // navn tilbage til værkets objekt (fjv.revision.objektkort); det kræver, at navnet er entydigt blandt ALLE
    // værkets objekter i sektionen — også dem, der ikke kommer med i arket. Ellers nægter eksporten.
    const navnekort = new Map<string, string>();            // "units.<scriptnavn>" -> værkets navn
    let kollision = false;
    for (const [sek, med, flertal, ental] of [["units", medtagne, "Enhederne", "enheden"], ["storage", tanke, "Tankene", "tanken"]] as const) {
        const alle = b.objekter(sek);
        const set = new Set<string>();
        for (const n of med) {
            const s = slug(n);
            const samme = alle.filter((x) => slug(x) === s);
            if (samme.length > 1) {
                kollision = true;
                if (!set.has(s)) nægter.push(`${flertal} ${samme.map((x) => `"${x}"`).join(" og ")} hedder alle "${s}" i modelscriptet, som normaliserer navne — omdøb dem i appen, så de er forskellige efter normaliseringen.`);
                set.add(s);
                continue;
            }
            navnekort.set(`${sek}.${s}`, n);
            if (s && s !== n) noter.push(`Navnet "${n}" hedder "${s}" i arket (modelscriptet normaliserer navne). En genupload af arket fører det tilbage til "${n}"; uploades arket som et nyt værk, hedder ${ental} "${s}".`);
        }
    }
    /** En sti i scriptets navne -> samme sti i værkets navne. */
    const tilVærk = (sti: string) => {
        const d = sti.split(".");
        if ((d[0] === "units" || d[0] === "storage") && d.length > 2) d[1] = navnekort.get(`${d[0]}.${d[1]}`) ?? d[1];
        return d.join(".");
    };

    // ---------------------------------------------------------------- Varmepumpe
    if (vpPunkter.length > PLADS.vp.til - PLADS.vp.fra + 1) nægter.push(`Varmepumperne har ${vpPunkter.length} målepunkter; skabelonen har plads til ${PLADS.vp.til - PLADS.vp.fra + 1}.`);
    vpPunkter.forEach((p, idx) => {
        const r = PLADS.vp.fra + idx;
        sæt("Varmepumpe", `A${r}`, p.navn, 10); sæt("Varmepumpe", `B${r}`, p.t, 10);
        sæt("Varmepumpe", `C${r}`, p.q, 16); sæt("Varmepumpe", `D${r}`, p.e, 16);
        celler.push({ ark: "Varmepumpe", ref: `E${r}`, v: p.e > 0 ? p.q / p.e : "", formel: `IF(AND(ISNUMBER(C${r}),ISNUMBER(D${r}),D${r}>0),C${r}/D${r},"")` });
    });
    for (let r = PLADS.vp.fra + vpPunkter.length; r <= PLADS.vp.til; r++) {
        sæt("Varmepumpe", `A${r}`, null, 10); sæt("Varmepumpe", `B${r}`, null, 10); sæt("Varmepumpe", `C${r}`, null, 16); sæt("Varmepumpe", `D${r}`, null, 16);
        celler.push({ ark: "Varmepumpe", ref: `E${r}`, v: "", formel: `IF(AND(ISNUMBER(C${r}),ISNUMBER(D${r}),D${r}>0),C${r}/D${r},"")` });
    }

    // ---------------------------------------------------------------- Timedata (+ Solvarme)
    sæt("Timedata", "B2", "UTC");
    const b3 = vl.punkter.length ? null : årsproduktionTilSyntese(b);
    sæt("Timedata", "B3", b3);
    sæt("Timedata", "C6", null);                       // "EKSEMPELRÆKKER — slet dem": rækkerne er ikke længere eksempler
    if (vl.punkter.length) {
        vl.punkter.forEach(([ms, v], idx) => { sæt("Timedata", `A${PLADS.timedata + idx}`, ms, 15); sæt("Timedata", `B${PLADS.timedata + idx}`, v, 16); });
    }
    for (let r = PLADS.timedata + vl.punkter.length; r <= 43; r++) { sæt("Timedata", `A${r}`, null, 15); sæt("Timedata", `B${r}`, null, 16); }
    if (!vl.punkter.length && b3 === null) nægter.push("Værket har hverken en aktiv varmelast eller varmelastparametre, arket kan bære (Timedata!B3).");
    const serier: Eksportplan["serier"] = [];
    if (k.varmelast) serier.push({ rolle: "varmelast", med: vl.punkter.filter((p) => p[1] !== null).length, udenfor: vl.udenfor, grund: vl.grund });
    if (sol) {
        sæt("Solvarme", "A1", "Solvarme ab værk — målte timeværdier (eksporteret af appen)", 1);
        sæt("Solvarme", "A2", "tidszone:", 4); sæt("Solvarme", "B2", "UTC", 10);
        sæt("Solvarme", "A3", "årsproduktion ab værk:", 4); sæt("Solvarme", "B3", null, 11);
        sæt("Solvarme", "A4", "Opbygget som Timedata (scripts/vaerksark_til_yaml.py, arket 'Solvarme'). Tidsstempel = timens start i UTC, MW i kolonne B.", 2);
        sæt("Solvarme", "A5", "tidsstempel", 12); sæt("Solvarme", "B5", "varme_mw", 12);
        sol.punkter.forEach(([ms, v], idx) => { sæt("Solvarme", `A${6 + idx}`, ms, 15); sæt("Solvarme", `B${6 + idx}`, v, 16); });
    }
    if (k.solprofil) serier.push({ rolle: "solprofil", med: sol ? sol.punkter.filter((p) => p[1] !== null).length : 0, udenfor: sol ? sol.udenfor : k.solprofil.serie.værdier.filter((v) => v !== null).length, grund: sol?.grund ?? (solenheder.length !== 1 ? "arket Solvarme kræver præcis én aktiv solvarmeenhed" : undefined) });

    // ---------------------------------------------------------------- forudsigelsen og listen
    let forventet = new Map<string, string>();
    try {
        if (!kollision) forventet = forudsig({ b, k, medtagne, tanke, vpPunkter, priser, elafgift, energinet, dv, prod: tal(b.get("electricity.tariff_production_flat")),
            bånd: { lavV, højV, spidsV, lavS, højS }, dmi, zone, vl, b3, sol, nægter });
    } catch (e) {
        nægter.push(e instanceof Error ? e.message : String(e));
    }
    // K11 F7: et tegn, XML 1.0 ikke kan bære (kontroltegn), eller en bogstavelig _xHHHH_-sekvens (som Excel læser
    // som et kodet tegn, men modelscriptets openpyxl læser bogstaveligt) kan ikke rundture — feltfejl, ikke en fil,
    // der ikke kan åbnes.
    for (const c of celler) {
        if (typeof c.v !== "string") continue;
        const fejl = ulovligTekst(c.v);
        if (fejl) nægter.push(`${c.ark}!${c.ref} ("${synlig(c.v)}") ${fejl} Ret navnet eller teksten i appen.`);
    }
    // "Ikke med i arket" i værkets egne navne (scriptets navne føres tilbage som ved genupload).
    const ikkeMed: Tab[] = [];
    if (!nægter.length) {
        const iVærk = new Map([...forventet].map(([s, v]) => [tilVærk(s), v] as const));
        const alle = new Set([...b.rå.keys(), ...iVærk.keys()]);
        for (const sti of [...alle].sort()) {
            const vv = b.rå.get(sti) ?? null, sv = iVærk.get(sti) ?? null;
            if (vv === sv) continue;
            const grund = [...grunde.entries()].find(([p]) => sti === p || sti.startsWith(`${p}.`))?.[1];
            ikkeMed.push({ sti, værk: vv, script: sv, ...(grund ? { grund } : {}) });
        }
    }
    // K11 F4: de stier, hvor modelscriptets læsning af arket ikke er værket. Importen kræver, at basis afviger fra
    // værket præcis her og ingen andre steder (fjv.revision.tjek_basis). Artefakter sammenlignes aldrig.
    const afvigelser = ikkeMed.map((t) => t.sti).filter((s) => !erArtefakt(s));
    return { celler, træpillerRække: harPiller, braendselKolonne: biomasse, solvarmeArk: !!sol, forventet, ikkeMed, afvigelser, serier, udfyldes, afrundes, nægter, noter };
}

// ------------------------------------------------------------------ tekst, XML og artefakter

/** Konverteringens egne felter (fjv.revision.ARTEFAKT_*): gemmes aldrig ved genupload og sammenlignes ikke. */
const ARTEFAKT_SEKTIONER = new Set(["meta", "time", "solver", "heat_load_params"]);
const ARTEFAKT_STIER = new Set(["prices.natural_gas.note", "electricity.tariff_consumption.source"]);
export function erArtefakt(sti: string): boolean {
    const d = sti.split(".");
    return ARTEFAKT_SEKTIONER.has(d[0]) || ARTEFAKT_STIER.has(sti)
        || ((d[0] === "units" || d[0] === "storage") && (sti.endsWith(".notes") || sti.endsWith(".production_profile_path")));
}

const KODET_TEGN = /_x[0-9A-Fa-f]{4}_/;

/** Hvorfor teksten ikke kan stå i et regneark, der rundtures — eller null. */
export function ulovligTekst(s: string): string | null {
    const c = ulovligtXmlTegn(s);
    if (c !== null) return `indeholder tegnet U+${c.toString(16).toUpperCase().padStart(4, "0")}, som et regneark (XML 1.0) ikke kan gemme.`;
    const k = KODET_TEGN.exec(s);
    if (k) return `indeholder "${k[0]}", som Excel læser som et kodet tegn, men modelscriptet læser bogstaveligt — teksten ville ikke komme uændret tilbage.`;
    return null;
}

const synlig = (s: string) => synligTekst(s).slice(0, 80);

// ------------------------------------------------------------------ tidsserier

type Punkter = [number, number | null][];

/** Varmelasten som arkets timer: kun 1. juli 2025 – 30. juni 2026 (UTC, timens start); huller som tomme celler. */
function timeserie(t: Tidsseriekilde | null, rolle: string): { punkter: Punkter; udenfor: number; grund?: string; huller: number[] } {
    const r = timeserieRå(t, rolle);
    return { ...r, huller: r.punkter.filter((p) => p[1] === null).map((p) => p[0]) };
}

function timeserieRå(t: Tidsseriekilde | null, rolle: string): { punkter: Punkter; udenfor: number; grund?: string } {
    if (!t) return { punkter: [], udenfor: 0 };
    if (t.serie.oploesning !== "1h") return { punkter: [], udenfor: t.serie.værdier.length, grund: `${rolle}en er i kvarterer; arket tager timeværdier` };
    const alle: Punkter = t.serie.værdier.map((v, idx) => [t.serie.startMs + idx * TIME, v]);
    const inde = alle.filter(([ms]) => ms >= PERIODE_START && ms <= PERIODE_SLUT);
    const udenfor = alle.filter(([ms, v]) => (ms < PERIODE_START || ms > PERIODE_SLUT) && v !== null).length;
    // Kanterne: arket starter ved første og slutter ved sidste time med en værdi.
    let a = 0, z = inde.length - 1;
    while (a <= z && inde[a][1] === null) a++;
    while (z >= a && inde[z][1] === null) z--;
    const punkter = a <= z ? inde.slice(a, z + 1) : [];
    const med = punkter.filter((p) => p[1] !== null);
    if (med.length > 0 && med.length < 24 * 28) return { punkter: [], udenfor: udenfor + med.length, grund: `${rolle}en har kun ${med.length} timer i perioden; modelscriptet kræver mindst ${24 * 28}` };
    if (med.some((p) => (p[1] as number) < 0)) return { punkter: [], udenfor: udenfor + med.length, grund: `${rolle}en har negative værdier, som modelscriptet afviser` };
    return { punkter, udenfor, ...(udenfor ? { grund: `${udenfor} timer ligger uden for 1. juli 2025 – 30. juni 2026, som arket dækker` } : {}) };
}

interface Solplan {
    punkter: Punkter;
    udenfor: number;
    grund?: string;
    /** Profilen, som modelscriptet skriver den: hele kørselsvinduet, ender nulfyldt, huller interpoleret. */
    fyldt: number[];
    udfyldt: { ms: number; v: number; hvordan: "nat" | "interpolation" }[];
    /** Antal timer, scriptets %.6f ændrer, og den største ændring. */
    afrundet?: { n: number; maks: number };
    /** Scriptets grund til at stoppe (dagtimer i enderne, over 5 % huller). */
    nægt?: string;
}

/**
 * Solprofilen i kørselsvinduet [første dag kl. 00, sidste dag kl. 23] og modelscriptets udfyldning af den
 * (skriv_maalt_solprofil): tomme ender sættes til 0, hvis solen er nede i dem alle (ellers stopper scriptet);
 * huller inde i serien interpoleres lineært (pandas interpolate(limit_area="inside") = numpy.interp), højst 5 %.
 */
function solserie(t: Tidsseriekilde, v: { start: number; slut: number }): Solplan | null {
    if (t.serie.oploesning !== "1h") return null;
    const alle: Punkter = t.serie.værdier.map((x, idx) => [t.serie.startMs + idx * TIME, x]);
    const inde = alle.filter(([ms]) => ms >= v.start && ms <= v.slut);
    if (!inde.some((p) => p[1] !== null)) return null;
    if (inde.some((p) => p[1] !== null && (p[1] as number) < 0)) return null;
    const udenfor = alle.filter(([ms, x]) => (ms < v.start || ms > v.slut) && x !== null).length;
    const kendt = new Map(inde.filter((p) => p[1] !== null).map((p) => [p[0], p[1] as number] as const));
    const idx: number[] = [];
    for (let ms = v.start; ms <= v.slut; ms += TIME) idx.push(ms);
    const s: (number | null)[] = idx.map((ms) => kendt.get(ms) ?? null);
    const a = s.findIndex((x) => x !== null);
    let z = s.length - 1;
    while (s[z] === null) z--;
    const udfyldt: Solplan["udfyldt"] = [];
    let nægt: string | undefined;
    const ender = idx.map((_, j) => j < a || j > z);
    if (ender.some(Boolean)) {
        if (idx.some((ms, j) => ender[j] && !solenErNede(ms))) {
            nægt = `Solprofilen dækker ikke kørselsvinduet: der mangler ${a} timer i starten og ${s.length - 1 - z} i slutningen (serien går fra ${tidspunkt(idx[a])} til ${tidspunkt(idx[z])}), og nogle af dem er dagtimer. Modelscriptet nulfylder ikke solprofilen og ville afvise arket.`;
        } else {
            idx.forEach((ms, j) => { if (ender[j]) { s[j] = 0; udfyldt.push({ ms, v: 0, hvordan: "nat" }); } });
        }
    }
    const huller = s.filter((x) => x === null).length;
    if (!nægt && huller > 0.05 * idx.length) {
        nægt = `Solprofilen mangler ${huller} timer inde i serien (${(huller / idx.length * 100).toFixed(1)} %). Modelscriptet udfylder højst 5 % og ville afvise arket.`;
    }
    if (!nægt && huller) {
        // numpy.interp mellem nærmeste kendte naboer: slope * (x - x0) + y0.
        let forrige = -1;
        for (let j = 0; j < s.length; j++) {
            if (s[j] !== null) { forrige = j; continue; }
            let næste = j + 1;
            while (s[næste] === null) næste++;
            const y0 = s[forrige] as number, y1 = s[næste] as number;
            const slope = (y1 - y0) / (næste - forrige);
            for (let x = j; x < næste; x++) {
                s[x] = slope * (x - forrige) + y0;
                udfyldt.push({ ms: idx[x], v: s[x] as number, hvordan: "interpolation" });
            }
            j = næste - 1;
        }
    }
    const fyldt = s.map((x) => x ?? 0);
    // Afrundingen af de GEMTE timer (de udfyldte står allerede i `udfyldt` med den værdi, scriptet skriver).
    let n = 0, maks = 0;
    for (const x of kendt.values()) { const d = Math.abs(Number(x.toFixed(6)) - x); if (d > 0) { n++; maks = Math.max(maks, d); } }
    udfyldt.sort((p, q) => p.ms - q.ms);
    return {
        punkter: inde, udenfor, fyldt, udfyldt, ...(n ? { afrundet: { n, maks } } : {}), ...(nægt ? { nægt } : {}),
        ...(udenfor ? { grund: `${udenfor} timer ligger uden for kørselsvinduet, som modelscriptet læser fra arket Solvarme` } : {}),
    };
}

/** _solen_er_nede (vaerksark_til_yaml.py:922): solen mere end 6° under horisonten midt i timen, 56° N, 10,5° Ø. */
export function solenErNede(ms: number): boolean {
    const d = new Date(ms);
    const doy = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
    const soltid = d.getUTCHours() + 0.5 + 10.5 / 15.0;
    const rad = (g: number) => g * (Math.PI / 180);   // numpy.deg2rad/math.radians: x * (pi/180)
    const decl = rad(23.45 * Math.sin(rad(360.0 / 365.0 * (doy - 81))));
    const lat = rad(56.0);
    const sinH = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(rad(15.0 * (soltid - 12.0)));
    return sinH < Math.sin(rad(-6.0));
}

const tidspunkt = (ms: number) => {
    const d = new Date(ms), p = (x: number) => String(x).padStart(2, "0");
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:00 UTC`;
};
const tidsrum = (ms: number[]) => (ms.length === 1 ? tidspunkt(ms[0]) : `${tidspunkt(Math.min(...ms))} – ${tidspunkt(Math.max(...ms))}`);
/** Værdien, som scriptet skriver den (%.6f), med dansk komma. */
export const mw6 = (v: number) => v.toFixed(6).replace(".", ",");

function solGwh(sol: { punkter: Punkter } | null, k: Eksportkilde, n: string): number | null {
    void n;
    if (!sol) return null;
    const sum = sol.punkter.reduce((s, p) => s + (p[1] ?? 0), 0) / 1000;
    void k;
    return pyRound(sum, 3);
}

/**
 * Timedata!B3 for et værk uden målt varmelast: den årsproduktion, der får scriptet til at skalere Andebys
 * kalibrering med værkets egen faktor (f = gaf / 0,7653; main:1581). Er værkets varmelastparametre ikke
 * Andeby × f, står de på listen; B3 er da det nærmeste.
 */
function årsproduktionTilSyntese(b: Blade): number | null {
    const gaf = tal(b.get("heat_load_params.gaf_mw_per_k"));
    if (gaf === null || gaf <= 0) return null;
    const fak = pyRound(gaf / 0.7653, 4);
    const gwh = pyRound(fak * 100, 2);
    return gwh > 0.5 && gwh < 5000 ? gwh : null;
}

// ------------------------------------------------------------------ forudsigelsen

interface Forudsig {
    b: Blade; k: Eksportkilde; medtagne: string[]; tanke: string[]; vpPunkter: { navn: string; t: number; q: number; e: number }[];
    priser: Record<string, { value: number; unit: string }>; elafgift: number | null; energinet: number | null; dv: number | null; prod: number | null;
    bånd: { lavV: number | null; højV: number | null; spidsV: number | null; lavS: number | null; højS: number | null };
    dmi: string | null; zone: string | null; vl: { punkter: Punkter }; b3: number | null; sol: { punkter: Punkter; fyldt: number[] } | null; nægter: string[];
}

const hele = (v: number | null) => (v ? Math.max(1, Math.ceil(v)) : 1);

/** Det, scriptet + importens markør giver som blade. Kaster med scriptets grund, hvis scriptet ville stoppe. */
function forudsig(x: Forudsig): Map<string, string> {
    const { b } = x;
    // --- priser (laes_priser)
    const prices: { [k: string]: PyVærdi } = {};
    for (const [nøgle, p] of Object.entries(x.priser)) prices[nøgle] = { value: f(p.value), unit: p.unit };
    const { lavV, højV, spidsV, lavS, højS } = x.bånd;
    const vinter: Record<string, number> = {}, sommer: Record<string, number> = {};
    if (lavV !== null) vinter.lav = lavV; if (højV !== null) vinter.hoej = højV; if (spidsV !== null) vinter.spids = spidsV;
    if (lavS !== null) sommer.lav = lavS; if (højS !== null) sommer.hoej = højS;
    for (const bb of ["lav", "hoej"]) {
        if (!(bb in vinter) && !(bb in sommer)) throw new Error("Priser: lavlast og højlast skal begge udfyldes i tarifskemaet.");
        if (!(bb in vinter)) vinter[bb] = sommer[bb];
        if (!(bb in sommer)) sommer[bb] = vinter[bb];
    }
    const bands: { [k: string]: PyVærdi } = {};
    for (const [n, v] of Object.entries(vinter)) bands[n] = f(v);
    const sommerNavn: Record<string, string> = {};
    for (const bb of ["lav", "hoej"]) {
        if (sommer[bb] === vinter[bb]) sommerNavn[bb] = bb;
        else { sommerNavn[bb] = `${bb}_sommer`; bands[sommerNavn[bb]] = f(sommer[bb]); }
    }
    const vinterSpids = "spids" in vinter ? "spids" : "hoej";
    const energinet = x.energinet!, dv = x.dv ?? 0, afgift = x.elafgift!;
    const electricity: { [k: string]: PyVærdi } = {
        spot_area: x.zone!.toUpperCase(),
        tariff_consumption_flat: f(pyRound(energinet + dv + ((bands.hoej as { v: number } | undefined)?.v ?? 0), 1)),
        tariff_consumption: {
            unit: "kr_per_mwh",
            source: "Deltagerens eget prisblad, indtastet i vaerksdata_skabelon.xlsx",
            fixed_components: { energinet: f(energinet), dv: f(dv), elafgift_net: f(afgift) },
            net_tariff: {
                bands,
                seasons: {
                    vinter: {
                        months: [i(10), i(11), i(12), i(1), i(2), i(3)],
                        weekday: { "00-06": "lav", "06-21": vinterSpids, "21-24": "hoej" },
                        weekend: { "00-06": "lav", "06-21": "hoej", "21-24": "hoej" },
                    },
                    sommer: {
                        months: [i(4), i(5), i(6), i(7), i(8), i(9)],
                        weekday: { "00-06": sommerNavn.lav, "06-24": sommerNavn.hoej },
                        weekend: { "00-06": sommerNavn.lav, "06-24": sommerNavn.lav },
                    },
                },
            },
        },
        tariff_production_flat: f(x.prod ?? 0),
        electricity_tax: f(afgift),
    };

    // --- varmepumpernes målepunkter (laes_varmepumper + _vp_kurve)
    const vp = new Map<string, { t: number; q: number; e: number }[]>();
    for (const p of x.vpPunkter) {
        if (!(p.t >= -30 && p.t <= 40)) throw new Error(`Varmepumpen ${p.navn}: udetemperaturen ${p.t} °C ligger uden for skabelonens -30–40 °C.`);
        if (!(p.q > 0 && p.e > 0)) throw new Error(`Varmepumpen ${p.navn}: varme og el skal være større end nul.`);
        const cop = p.q / p.e;
        if (!(cop >= 1.5 && cop <= 6.0)) throw new Error(`Varmepumpen ${p.navn}: COP ${cop.toFixed(2)} ligger uden for modelscriptets 1,5–6.`);
        vp.set(slug(p.navn), [...(vp.get(slug(p.navn)) ?? []), p]);
    }
    for (const [n, pkt] of vp) {
        if (pkt.length < 2) throw new Error(`Varmepumpen ${n} har kun ét målepunkt; modelscriptet kræver mindst to.`);
        if (new Set(pkt.map((p) => p.t)).size !== pkt.length) throw new Error(`Varmepumpen ${n} har samme udetemperatur to gange.`);
        pkt.sort((a, c) => a.t - c.t);
    }

    // --- enheder (laes_enheder)
    const units: { [k: string]: PyVærdi } = {};
    const forUnits: { [k: string]: { [k: string]: PyVærdi } } = {};
    for (const n of x.medtagne) {
        const u = `units.${n}`;
        const navn = slug(n);
        if (!navn) throw new Error(`Enhedsnavnet "${n}" giver en tom kode i modelscriptet.`);
        if (navn in forUnits) throw new Error(`Enhedsnavnet "${n}" står to gange efter modelscriptets normalisering (${navn}).`);
        const type = tekst(b.get(`${u}.type`))!;
        const pmax = tal(b.get(`${u}.p_max_heat`));
        if (pmax === null && type !== "heat_pump") throw new Error(`Enheden ${n} har ingen maks varme — arket kræver den.`);
        const pmin = tal(b.get(`${u}.p_min_heat`)) || 0;
        const o: { [k: string]: PyVærdi } = {
            enabled: true, type,
            p_max_heat: pmax === null ? null : f(pmax),
            p_min_heat: f(pmin),
            var_om: f(tal(b.get(`${u}.var_om`)) || 0),
            start_cost: f(tal(b.get(`${u}.start_cost`)) || 0),
            min_uptime: i(hele(tal(b.get(`${u}.min_uptime`)))),
            min_downtime: i(hele(tal(b.get(`${u}.min_downtime`)))),
        };
        const punkter = vp.get(navn);
        vp.delete(navn);
        let kurve: PyVærdi | null = null, cop0 = 0;
        if (type === "heat_pump" && punkter) {
            const ren = punkter.map((p) => ({ t_ambient: pyRound(p.t, 3), heat_mw: pyRound(p.q, 3), el_mw: pyRound(p.e, 3) }));
            const q0 = interp(0, ren.map((p) => p.t_ambient), ren.map((p) => p.heat_mw));
            const e0 = interp(0, ren.map((p) => p.t_ambient), ren.map((p) => p.el_mw));
            kurve = { type: "table", points: ren.map((p) => ({ t_ambient: f(p.t_ambient), heat_mw: f(p.heat_mw), el_mw: f(p.el_mw) })) };
            cop0 = q0 / e0;
            if (pmax === null) o.p_max_heat = f(Math.max(...ren.map((p) => p.heat_mw)));
        } else if (type === "heat_pump" && pmax === null) {
            throw new Error(`Varmepumpen ${n} har hverken maks varme eller målepunkter.`);
        }
        const pmaxUd = (o.p_max_heat as { v: number } | null)?.v ?? 0;
        if (pmin > pmaxUd) throw new Error(`Enheden ${n}: min varme er større end maks varme.`);
        if (!TYPER_UDEN_BRAENDSEL.has(type)) {
            const eta = tal(b.get(`${u}.eta_fuel_to_heat`));
            if (eta === null || !(eta > 0 && eta <= 1.2)) throw new Error(`Enheden ${n}: virkningsgraden ${eta ?? "mangler"} — modelscriptet kræver en brøkdel over 0 og højst 1,2.`);
            o.eta_fuel_to_heat = f(eta);
        }
        if (type === "biomass_boiler") {
            const fuel = tekst(b.get(`${u}.fuel`)) ?? "";
            if (!(fuel in BIOMASSE_DANSK)) throw new Error(`Biomassekedlen ${n} fyrer med "${fuel}"; skabelonen kender halm, træpiller og flis.`);
            if (!x.priser[fuel]?.value) throw new Error(`Biomassekedlen ${n} fyrer med ${BIOMASSE_DANSK[fuel]}, men værket har ingen pris for det.`);
            o.fuel = fuel;
        } else {
            o.fuel = BRAENDSEL_PR_TYPE[type];
        }
        if ((type === "gas_boiler" || type === "gas_engine_chp") && !("co2_eua" in x.priser)) throw new Error(`Gasenheden ${n} kræver en CO2-pris på arket Priser.`);
        if (type === "waste_heat" && !x.priser.waste_heat?.value) throw new Error(`Overskudsvarmen ${n} kræver en pris for overskudsvarme.`);
        if (type === "solar_thermal") {
            const gwh = x.sol ? pyRound(x.sol.punkter.reduce((s, p) => s + (p[1] ?? 0), 0) / 1000, 3) : null;
            if (gwh === null || !(gwh > 0 && gwh < 500)) throw new Error(`Solvarmeenheden ${n} kræver en årsproduktion i arket; værket har ingen aktiv solprofil at tage den fra.`);
        }
        const alpha = tal(b.get(`${u}.alpha`));
        const eta = tal(b.get(`${u}.eta_fuel_to_heat`));
        if (type === "heat_pump" && kurve) {
            o.cop_curve = kurve;
            o.alpha = f(pyRound(-1 / cop0, 4));
        } else if (type === "heat_pump") {
            const cop = tal(b.get(`${u}.cop_curve.a`)) ?? (alpha !== null && alpha < 0 ? -1 / alpha : null);
            if (cop === null || !(cop >= 1.5 && cop <= 6.0)) throw new Error(`Varmepumpen ${n}: COP ved 0 °C (${cop ?? "mangler"}) ligger uden for modelscriptets 1,5–6.`);
            o.cop_curve = { type: "linear", a: f(pyRound(cop, 3)), b: f(0.08), cop_min: f(1.8), cop_max: f(4.0) };
            o.alpha = f(pyRound(-1 / cop, 4));
        } else if (type === "electric_boiler") {
            const ek = alpha !== null && alpha !== 0 ? -1 / alpha : 0.99;
            if (!(ek >= 0.80 && ek <= 1.0)) throw new Error(`Elkedlen ${n}: virkningsgraden ${ek.toFixed(3)} (afledt af alpha ${alpha}) ligger uden for modelscriptets 0,80–1,0.`);
            o.alpha = f(pyRound(-1 / ek, 4));
        } else if (type === "gas_engine_chp") {
            const etaEl = alpha !== null && eta !== null ? alpha * eta : null;
            if (etaEl === null || !(etaEl > 0 && etaEl < 0.60)) throw new Error(`Gasmotoren ${n}: elvirkningsgraden ${etaEl ?? "mangler"} ligger uden for modelscriptets 0–0,60.`);
            const samlet = etaEl + (eta as number);
            if (!(samlet >= 0.70 && samlet <= 1.05)) throw new Error(`Gasmotoren ${n}: el- og varmevirkningsgrad giver tilsammen ${samlet.toFixed(2)}; modelscriptet kræver 0,70–1,05.`);
            o.alpha = f(pyRound(etaEl / (eta as number), 4));
        } else {
            o.alpha = f(0);
        }
        if (type === "gas_boiler" || type === "gas_engine_chp") o.co2_emissions_per_mwh_fuel = f(0.2);
        const uc = type !== "solar_thermal" && (pmin > 0 || (o.min_uptime as { v: number }).v > 1);
        o.uc_enabled = uc;
        if (uc) o.initial_status = i(0);
        const byder = b.get(`${u}.ancillary.afrr_qualified`) === true;
        o.ancillary = { afrr_qualified: byder, mfrr_qualified: byder, fcr_qualified: false };
        if (type === "solar_thermal") {
            // Importen (fjv.vaerksark.konverter_output) erstatter profilstien med markøren; noten er scriptets egen.
            o.notes = x.sol ? `p_max_heat er værkets tal for største soleffekt. Profilen er værkets egne timeværdier fra arket Solvarme (${solNote(x.sol)}) — ikke syntese.` : "";
            o.production_profile_path = "tidsserie:solprofil";
        }
        forUnits[navn] = o;
    }
    if (vp.size) throw new Error(`Arket Varmepumpe har målepunkter for ${[...vp.keys()].join(", ")}, men ingen aktiv varmepumpe med det navn.`);
    Object.assign(units, forUnits);

    // --- tanke (laes_tanke)
    const storage: { [k: string]: PyVærdi } = {};
    for (const n of x.tanke) {
        const s = `storage.${n}`;
        const vol = tal(b.get(`${s}.volume_m3`));
        const dt0 = tal(b.get(`${s}.delta_t_k`));
        const emax = tal(b.get(`${s}.e_max_mwh`)) ?? (vol !== null && dt0 !== null ? vol * 1.163 * dt0 / 1000 : null);
        if (vol === null || emax === null) throw new Error(`Tanken ${n} mangler volumen eller maks fyldning.`);
        if (!(emax > 0.5 && emax < 5000)) throw new Error(`Tanken ${n}: maks fyldning ${emax} MWh ligger uden for modelscriptets 0,5–5.000.`);
        const dt = emax * 1000 / (1.163 * vol);
        if (!(dt >= 10 && dt <= 80)) throw new Error(`Tanken ${n}: volumen og fyldning svarer til ${dt.toFixed(0)} K; modelscriptet kræver 10–80 K.`);
        storage[slug(n)] = {
            enabled: true, volume_m3: i(Math.trunc(vol)), delta_t_k: f(pyRound(dt, 2)), e_max_mwh: f(pyRound(emax, 1)), e_initial_mwh: f(pyRound(emax * 0.5, 1)),
            p_max_charge_mw: f(tal(b.get(`${s}.p_max_charge_mw`)) || 25.0), p_max_discharge_mw: f(tal(b.get(`${s}.p_max_discharge_mw`)) || 25.0),
            self_discharge_per_hour: f(0.0005), cycle_binding: true,
        };
    }

    // --- tid, varmelastparametre, meta (laes_timedata + main)
    const vl = x.vl.punkter.filter((p) => p[1] !== null) as [number, number][];
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 13) + ":00:00Z";
    const start = vl.length ? iso(vl[0][0]) : "2025-07-01T00:00:00Z";
    const slut = vl.length ? iso(vl[vl.length - 1][0]) : "2026-06-30T23:00:00Z";
    let aarsvolumen: number;
    if (vl.length) {
        const vinduetimer = (PERIODE_SLUT - PERIODE_START) / TIME + 1;
        aarsvolumen = (vl.reduce((s, p) => s + p[1], 0) / 1000) * (vinduetimer / Math.max(vl.length, 1));
    } else {
        if (x.b3 === null || !(x.b3 > 0.5 && x.b3 < 5000)) throw new Error("Timedata er tom, og årsproduktionen (B3) kan ikke udledes af værket.");
        aarsvolumen = x.b3;
    }
    const fak = aarsvolumen > 1 ? pyRound(aarsvolumen / 100, 4) : 1.0;
    const heat_load_params: { [k: string]: PyVærdi } = {
        gaf_mw_per_k: f(pyRound(0.7653 * fak, 4)), t_ref: f(15), thermal_inertia_hours: i(24),
        nettab_slope_mw_per_k: f(pyRound(0.4768 * fak, 4)), t_net: f(12),
        baseline_profile_mw: ANDEBY_PROFIL.map((v) => f(pyRound(v * fak, 3))), weekly_dip: f(0.02),
        _source: `Andeby-kalibrering skaleret med ${pyFloatKort(fak)} til ${aarsvolumen.toFixed(1)} GWh/år. BEMÆRK: en skaleret døgnprofil, ikke en kalibrering på jeres egne data. Bruges kun ved kørsel uden --heat-csv. Vil I have rigtige parametre, så kør scripts/calibrate_heat_load.py.`,
    };
    const vaerk = x.k.vaerk.navn.trim();
    const s = slug(vaerk);
    if (!("co2_eua" in prices)) prices.co2_eua = { value: f(0), unit: "DKK/t_CO2" };
    const caseDict: { [k: string]: PyVærdi } = {
        meta: {
            case_name: s, titel: vaerk,
            description: `${vaerk} — bygget fra deltagerens egen dataskabelon (ark.xlsx) på kurset AI til driftsoptimering i fjernvarmen. Varmelasten er målte timeværdier, ikke syntese.`,
            gruppe: s, timezone_internal: "UTC", timezone_reporting: "Europe/Copenhagen", discount_rate_real: f(0.035), tax_year: i(Number(start.slice(0, 4))),
        },
        data: { dmi_area: x.dmi!.toLowerCase(), price_zone: x.zone!.toUpperCase() },
        time: { start, end: slut, resolution: "1h" },
        solver: { mip_rel_gap: f(0.001), mip_abs_gap: f(1000), time_limit: f(3600) },
        heat_load_params, prices, electricity, units, storage,
    };
    return fladPy(caseDict);
}

/** str(float) i Python til tekster (fx "1.0", "1.2755"). */
function pyFloatKort(x: number): string {
    const s = String(x);
    return /[.e]/.test(s) ? s : `${s}.0`;
}

/** Tallene i scriptets note — regnet på profilen EFTER dets udfyldning (K11 F6). */
function solNote(sol: { fyldt: number[] }): string {
    const gwh = sol.fyldt.reduce((s, x) => s + x, 0) / 1000;
    return `${gwh.toFixed(2)} GWh, spids ${Math.max(...sol.fyldt).toFixed(1)} MW`;
}

/** numpy.interp (ts stigende; udenfor = endepunktet). */
function interp(x: number, ts: number[], ys: number[]): number {
    if (x <= ts[0]) return ys[0];
    if (x >= ts[ts.length - 1]) return ys[ys.length - 1];
    for (let j = 1; j < ts.length; j++) {
        if (x <= ts[j]) return ys[j - 1] + (x - ts[j - 1]) * (ys[j] - ys[j - 1]) / (ts[j] - ts[j - 1]);
    }
    return ys[ys.length - 1];
}
