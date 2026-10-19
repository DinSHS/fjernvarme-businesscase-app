//-----------------------------------------------------------------------
// Guiden "Nyt værk fra bunden" (#/konfiguration/nyt): trin, trinvalidering
// og sammensætning af værkets blade. Ren logik, testet.
//
// Udgangspunktet er fv-eksperts minimale, gyldige skabelon (viden/
// nyt_vaerk_skabelon.json, brief 15 B): meta, data, time, solver,
// heat_load_params, prices, electricity og én gaskedel. Guiden ændrer kun
// det, brugeren vælger; alt andet er skabelonens (og dens [BEKRÆFT]).
// Værdierne er JSON-TEKST hele vejen (typestreng, KONTRAKT §3.2).
//-----------------------------------------------------------------------

import { MAKS } from "../../../rayfin/data/fjv.constants";
import { ENHEDSTYPER, findFelt } from "./katalog";
import { KWH_PR_M3_K, objektnavne } from "./gruppering";
import { kladde, nyEnhed, NAVN_MOENSTER, tjekNavn } from "./redigering";
import { validerVaerk, type Fund } from "./validering";

/** Et blad i skabelonen eller i det færdige værk. */
export interface NytBlad { sti: string; vaerdi_json: string; bekraeft: boolean; kommentar?: string | null }

/** Hvordan varmelasten skaleres fra et årligt varmebehov (fv-eksperts formel). */
export interface VarmelastFormel {
    /** Det årlige varmebehov (GWh), skabelonens heat_load_params svarer til. */
    reference_gwh: number;
    /** Stier, der skaleres lineært med gwh / reference_gwh (lister elementvis). */
    skaleres: readonly string[];
    /** Formlen i ord, til guiden. */
    tekst: string;
    /** Skabelonens forbehold for formlen (fx at den gælder karup-vejr). */
    forbehold?: string;
}

export interface NytVaerkSkabelon {
    blade: readonly NytBlad[];
    varmelast: VarmelastFormel;
    /** Valg for klima og priszone (fra kataloget). */
    dmi: readonly string[];
    zoner: readonly string[];
    kilde: string;
    /** Skabelonens regel pr. trin (guide_trin[].regel), vist som trinnets fodnote. */
    trinRegler?: Readonly<Record<string, string>>;
    /** Skabelonens gaskedel dimensioneres rund(gaskedelPrGwh × G) MW, når brugeren ikke selv sætter den. */
    gaskedelPrGwh?: number;
    /** Spidslasten er ca. spidslastPrGwh × G MW; de styrbare enheder skal tilsammen dække den. */
    spidslastPrGwh?: number;
    /** Skabelonens liste over obligatoriske felter (vises i "Gennemse"). */
    obligatoriske?: Readonly<Record<string, string | readonly string[]>>;
}

export const TRIN = [
    { id: "navn", navn: "Navn og kode" },
    { id: "klima", navn: "Klima og priszone" },
    { id: "varme", navn: "Varmebehov" },
    { id: "enheder", navn: "Enheder" },
    { id: "lager", navn: "Lager" },
    { id: "priser", navn: "Priser og tarif" },
    { id: "gennemse", navn: "Gennemse og opret" },
] as const;
export type TrinId = (typeof TRIN)[number]["id"];

export interface NyEnhedUdkast {
    type: string;
    navn: string;
    /** Brugerens egne indtastninger (relativ sti -> tekst). Kun de gør et felt "ikke skøn". */
    værdier: Map<string, string>;
    /** Skabelonens værdier for en enhed, den selv har med (relativ sti -> JSON + [BEKRÆFT]). */
    forvalg?: Map<string, { json: string; bekraeft: boolean }>;
}
export interface NytLagerUdkast { navn: string; volumen: string; deltaT: string; pLad: string; pAflad: string }

export interface Udkast {
    kode: string;
    navn: string;
    dmi: string;
    zone: string;
    varme: { kilde: "gwh" | "timedata"; gwh: string };
    enheder: NyEnhedUdkast[];
    lagre: NytLagerUdkast[];
    /** Brugerens input til skabelonens priser/tarif (sti -> tekst). */
    priser: Map<string, string>;
}

const læs = (blade: readonly NytBlad[], sti: string) => blade.find((b) => b.sti === sti)?.vaerdi_json;
const tekstAf = (json: string | undefined) => { try { return json ? String(JSON.parse(json)) : ""; } catch { return ""; } };

/** Startudkastet: skabelonens enheder og valg. */
export function startUdkast(s: NytVaerkSkabelon): Udkast {
    const navne = objektnavne(s.blade).units;
    return {
        kode: "", navn: "",
        dmi: tekstAf(læs(s.blade, "data.dmi_area")) || s.dmi[0],
        zone: tekstAf(læs(s.blade, "data.price_zone")) || s.zoner[0],
        varme: { kilde: "gwh", gwh: String(s.varmelast.reference_gwh).replace(".", ",") },
        enheder: [...navne].map((navn) => ({
            type: tekstAf(læs(s.blade, `units.${navn}.type`)), navn, værdier: new Map(),
            forvalg: new Map(s.blade.filter((b) => b.sti.startsWith(`units.${navn}.`)).map((b) => [b.sti.slice(`units.${navn}.`.length), { json: b.vaerdi_json, bekraeft: b.bekraeft }])),
        })),
        lagre: [],
        priser: new Map(),
    };
}

/** Enhedens værdi for et felt før brugerens indtastning: skabelonværkets forvalg, ellers enhedstypens skabelon (JSON). */
export function enhedsværdi(e: NyEnhedUdkast, rel: string): string | undefined {
    return e.forvalg?.get(rel)?.json ?? ENHEDSTYPER[e.type]?.skabelon.find((x) => x.sti === rel)?.vaerdi_json;
}

/** Et tal fra brugerens tekst (dansk komma), eller null. */
export function talAf(t: string): number | null {
    const s = t.trim().replace(/\s/g, "").replace(",", ".");
    return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : null;
}

/** Et decimaltal som JSON, der forbliver decimaltal (4 → "4.0"), afrundet til 6 decimaler. */
export function somDecimal(x: number): string {
    const s = String(Number(x.toFixed(6)));
    return /[.eE]/.test(s) ? s : `${s}.0`;
}

/** Priser og satser guiden spørger om: skabelonens prices.*.value, elsatserne og tarifbåndene + manglende brændsler. */
export function prisfelter(u: Udkast, s: NytVaerkSkabelon): string[] {
    const fra = s.blade.map((b) => b.sti).filter((x) => /^prices\.[^.]+\.value$/.test(x)
        || ["electricity.tariff_consumption_flat", "electricity.tariff_production_flat", "electricity.electricity_tax"].includes(x)
        || /^electricity\.tariff_consumption\.(net_tariff\.bands|fixed_components)\.[^.]+$/.test(x) && !x.endsWith(".elafgift_net"));
    return [...fra, ...manglendePriser(u, s)];
}

/** Koder, der ikke kan bruges, fordi de er ruter i området (#/konfiguration/nyt). */
export const RESERVEREDE_KODER: readonly string[] = ["nyt"];

/** Et kodeforslag af navnet: "Fjernvarme Vesterby" -> "fjernvarme_vesterby" (æ→ae, ø→oe, å→aa). */
export function foreslåKode(navn: string): string {
    return navn.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
        .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, MAKS.kode);
}

// ------------------------------------------------------------------ trinvalidering

export interface TrinKontekst { optagneKoder: ReadonlySet<string> }

/** Fejl der forhindrer at gå videre fra trinnet (tom liste = videre). */
export function tjekTrin(trin: TrinId, u: Udkast, s: NytVaerkSkabelon, ctx: TrinKontekst): string[] {
    const f: string[] = [];
    switch (trin) {
        case "navn":
            if (!u.navn.trim()) f.push("Giv værket et navn.");
            if (u.navn.length > MAKS.navn) f.push(`Navnet må højst være ${MAKS.navn} tegn.`);
            if (!u.kode) f.push("Giv værket en kode.");
            else if (!NAVN_MOENSTER.test(u.kode)) f.push("Koden må kun indeholde små bogstaver, cifre og _ (fx mit_vaerk).");
            else if (u.kode.length > MAKS.kode) f.push(`Koden må højst være ${MAKS.kode} tegn.`);
            else if (RESERVEREDE_KODER.includes(u.kode)) f.push(`Koden ${u.kode} er reserveret af appen — vælg en anden.`);
            else if (ctx.optagneKoder.has(u.kode)) f.push(`Koden ${u.kode} er i brug af et andet værk.`);
            break;
        case "klima":
            if (!s.dmi.includes(u.dmi)) f.push(`Vælg et klimaområde (${s.dmi.join(", ")}).`);
            if (!s.zoner.includes(u.zone)) f.push(`Vælg en priszone (${s.zoner.join(", ")}).`);
            break;
        case "varme": {
            const g = talAf(u.varme.gwh);
            if (g === null) f.push("Skriv det årlige varmebehov som et tal i GWh (fx 45 eller 12,5).");
            else if (g <= 0) f.push("Varmebehovet skal være større end 0 GWh.");
            else if (g > 5000) f.push("Over 5.000 GWh om året er ikke et fjernvarmeværk — tjek enheden (GWh, ikke MWh).");
            break;
        }
        case "enheder": {
            if (u.enheder.length === 0) f.push("Tilføj mindst én enhed — modellen kan ikke køre uden.");
            const k = kapacitet(u, s);
            // Gælder OGSÅ ved "jeg har timedata": værket kører på syntesen (heat_load_params), indtil et scenarie vælger en
            // fil, og guiden knytter ingen fil til værket eller til prøvekørslen (Codex K4-F2: 1 MW + timedata gav en
            // infeasible prøve). Et radiovalg er ikke dokumentation for en anden last.
            if (k.spidslast !== null && u.enheder.length && k.styrbar < k.spidslast) {
                f.push(`Enhederne yder ${String(Math.round(k.styrbar * 10) / 10).replace(".", ",")} MW, men spidslasten er ca. ${String(Math.round(k.spidslast * 10) / 10).replace(".", ",")} MW (${String(s.spidslastPrGwh).replace(".", ",")} MW pr. GWh/år) — tilføj eller forstør en enhed.`);
            }
            const set = new Set<string>();
            for (const e of u.enheder) {
                if (!ENHEDSTYPER[e.type]) f.push(`${e.navn || "(uden navn)"}: vælg en enhedstype.`);
                const n = tjekNavn(e.navn, { units: set, storage: new Set(u.lagre.map((l) => l.navn)) });
                if (n) f.push(n);
                set.add(e.navn);
                for (const [rel, tekst] of e.værdier) {
                    const k = kladde(findFelt(`units.${e.navn}.${rel}`), enhedsværdi(e, rel) ?? null, tekst);
                    if (k.fejl) f.push(`${e.navn}: ${findFelt(`units.x.${rel}`)?.etiket ?? rel}: ${k.fejl}`);
                }
            }
            break;
        }
        case "lager": {
            const set = new Set<string>();
            for (const l of u.lagre) {
                const n = tjekNavn(l.navn, { units: new Set(u.enheder.map((e) => e.navn)), storage: set });
                if (n) f.push(n.replace("enhed", "lager"));
                set.add(l.navn);
                for (const [felt, navn] of [["volumen", "Volumen"], ["deltaT", "ΔT"], ["pLad", "Ladeeffekt"], ["pAflad", "Afladeeffekt"]] as const) {
                    const x = talAf(l[felt]);
                    if (x === null || x <= 0) f.push(`${l.navn || "lager"}: ${navn} skal være et tal større end 0.`);
                }
            }
            break;
        }
        case "priser":
            for (const [sti, tekst] of u.priser) {
                const gammel = læs(s.blade, sti) ?? null;
                const k = kladde(findFelt(sti), gammel, tekst);
                if (k.fejl) f.push(`${findFelt(sti)?.etiket ?? sti}: ${k.fejl}`);
            }
            for (const sti of manglendePriser(u, s)) if (!u.priser.get(sti)?.trim()) f.push(`Sæt en pris for ${sti.split(".")[1]} — en af enhederne bruger det.`);
            break;
        case "gennemse": {
            // Alle tidligere trins regler gælder stadig her: et trin kan blive ugyldigt, efter man er gået forbi det
            // (fx et lavere varmebehov), og "Opret" spørger kun dette trin.
            for (const t of TRIN) if (t.id !== "gennemse") f.push(...tjekTrin(t.id, u, s, ctx));
            const r = bygVaerk(u, s);
            f.push(...r.fejl, ...r.fund.filter((x) => x.alvor === "fejl").map((x) => `${x.sti}: ${x.besked}`));
            break;
        }
    }
    return f;
}

/** Det første trin med fejl (guiden kan ikke springe forbi det). */
export function førsteFejltrin(u: Udkast, s: NytVaerkSkabelon, ctx: TrinKontekst): TrinId | null {
    for (const t of TRIN) if (t.id !== "gennemse" && tjekTrin(t.id, u, s, ctx).length) return t.id;
    return null;
}

/** Brændselspriser enhederne kræver, men skabelonen ikke har (stier `prices.<brændsel>.value`). */
export function manglendePriser(u: Udkast, s: NytVaerkSkabelon): string[] {
    const har = new Set(s.blade.map((b) => b.sti));
    const ud = new Set<string>();
    for (const e of u.enheder) {
        const fuel = e.værdier.get("fuel") ?? tekstAf(enhedsværdi(e, "fuel"));
        if (fuel && fuel !== "electricity" && fuel !== "solar" && !har.has(`prices.${fuel}.value`)) ud.add(`prices.${fuel}.value`);
    }
    return [...ud];
}

// ------------------------------------------------------------------ sammensætning

/** Skalerer skabelonens varmelast til `gwh` efter formlen (lister elementvis). Bladene bliver [BEKRÆFT]. */
export function skalerVarmelast(blade: readonly NytBlad[], formel: VarmelastFormel, gwh: number): NytBlad[] {
    const k = gwh / formel.reference_gwh;
    return blade.map((b) => {
        if (!formel.skaleres.includes(b.sti)) return b;
        const v = JSON.parse(b.vaerdi_json) as unknown;
        const ny = Array.isArray(v) ? `[${v.map((x) => (typeof x === "number" ? somDecimal(x * k) : JSON.stringify(x))).join(",")}]`
            : typeof v === "number" ? somDecimal(v * k) : b.vaerdi_json;
        return { ...b, vaerdi_json: ny, bekraeft: true, kommentar: `Skaleret fra skabelonen til ${String(gwh).replace(".", ",")} GWh/år (${formel.tekst}).` };
    });
}

export interface NytVaerk { blade: NytBlad[]; fejl: string[]; fund: Fund[] }

/**
 * Hele værket: skabelonen med brugerens kode/navn, klima, varmelast, enheder,
 * lagre og priser. `fund` er klientvalideringen af resultatet (0 fejl før oprettelse).
 */
export function bygVaerk(u: Udkast, s: NytVaerkSkabelon): NytVaerk {
    const fejl: string[] = [];
    const g = talAf(u.varme.gwh);
    // Skabelonens blade minus dens enheder (de kommer fra udkastet), med varmelasten skaleret. Den tomme
    // lagerblok `storage: {}` (obligatorisk, når der intet lager er) må IKKE stå sammen med et lager:
    // så ville `storage` både være et blad og forælder til `storage.<navn>.*`.
    let blade: NytBlad[] = s.blade.filter((b) => !b.sti.startsWith("units.") && !b.sti.startsWith("storage.")
        && !(b.sti === "storage" && u.lagre.length > 0));
    if (g !== null && g > 0) blade = skalerVarmelast(blade, s.varmelast, g);
    const sæt = (sti: string, json: string, bekraeft = false) => {
        const i = blade.findIndex((b) => b.sti === sti);
        if (i >= 0) blade[i] = { ...blade[i], vaerdi_json: json, bekraeft: blade[i].bekraeft && bekraeft };
        else blade.push({ sti, vaerdi_json: json, bekraeft });
    };
    sæt("meta.case_name", JSON.stringify(u.kode));
    if (blade.some((b) => b.sti === "meta.titel") || u.navn) sæt("meta.titel", JSON.stringify(u.navn));
    sæt("data.dmi_area", JSON.stringify(u.dmi));
    sæt("data.price_zone", JSON.stringify(u.zone));
    // Balancepriserne hentes for spot_area, spot for price_zone — de skal følges ad (validering.md §1).
    if (blade.some((b) => b.sti === "electricity.spot_area")) sæt("electricity.spot_area", JSON.stringify(u.zone));

    // Priser og tarif: brugerens værdier kodes efter skabelonens type; elafgift_net følger electricity_tax (paritet).
    for (const [sti, tekst] of u.priser) {
        if (!tekst.trim()) continue;
        const k = kladde(findFelt(sti), læs(s.blade, sti) ?? "0.0", tekst);
        if (k.fejl || k.json === null) { fejl.push(`${sti}: ${k.fejl}`); continue; }
        // En pris, brugeren selv har sat, er ikke længere et skøn.
        sæt(sti, k.json, false);
        if (sti === "electricity.electricity_tax" && blade.some((b) => b.sti === "electricity.tariff_consumption.fixed_components.elafgift_net")) {
            sæt("electricity.tariff_consumption.fixed_components.elafgift_net", k.json, false);
        }
    }

    // Enheder: enhedstypens skabelon (samme vej som "Ny enhed"), overskrevet af skabelonværkets forvalg
    // (fx fv-eksperts gaskedel) og til sidst af brugerens egne tal. Kun brugerens tal er ikke længere skøn.
    for (const e of u.enheder) {
        const r = nyEnhed(e.type, e.navn, e.værdier);
        fejl.push(...r.fejl.map((x) => `${e.navn}: ${x.sti}: ${x.besked}`));
        const pre = `units.${e.navn}.`;
        const fra = new Map(r.ændringer.map((æ) => [æ.sti.slice(pre.length), æ.ny_json!]));
        for (const [rel, f] of e.forvalg ?? []) if (!e.værdier.has(rel)) fra.set(rel, f.json);
        // Skabelonens gaskedel følger varmebehovet: rund(0,5 × G) MW (skalering.formel), medmindre brugeren selv har sat den.
        const auto = autoEffekt(e, u, s);
        if (auto !== null) fra.set("p_max_heat", somDecimal(auto));
        for (const [rel, json] of fra) {
            const bruger = e.værdier.has(rel);
            const fv = e.forvalg?.get(rel);
            const fast = rel === "type" || rel === "enabled";
            blade.push({ sti: `${pre}${rel}`, vaerdi_json: json, bekraeft: !bruger && !fast && (fv ? fv.bekraeft : true) });
        }
    }

    // Lagre: brugerens volumen, ΔT og effekter; startindhold halvfuldt; tab pr. time skønnet.
    for (const l of u.lagre) {
        const v = talAf(l.volumen), dt = talAf(l.deltaT), pl = talAf(l.pLad), pa = talAf(l.pAflad);
        if ([v, dt, pl, pa].some((x) => x === null)) { fejl.push(`${l.navn}: lagerets tal mangler.`); continue; }
        const kap = (v! * KWH_PR_M3_K * dt!) / 1000;
        const p = `storage.${l.navn}`;
        blade.push(
            { sti: `${p}.enabled`, vaerdi_json: "true", bekraeft: false },
            { sti: `${p}.volume_m3`, vaerdi_json: somDecimal(v!), bekraeft: false },
            { sti: `${p}.delta_t_k`, vaerdi_json: somDecimal(dt!), bekraeft: false },
            { sti: `${p}.e_max_mwh`, vaerdi_json: "null", bekraeft: false, kommentar: "Tom = regnes af volumen og ΔT." },
            { sti: `${p}.e_initial_mwh`, vaerdi_json: somDecimal(kap / 2), bekraeft: true, kommentar: "Halvfuldt ved periodens start (skøn)." },
            { sti: `${p}.p_max_charge_mw`, vaerdi_json: somDecimal(pl!), bekraeft: false },
            { sti: `${p}.p_max_discharge_mw`, vaerdi_json: somDecimal(pa!), bekraeft: false },
            { sti: `${p}.self_discharge_per_hour`, vaerdi_json: "0.0005", bekraeft: true, kommentar: "Tab pr. time som Andebys tanke (skøn)." },
            { sti: `${p}.cycle_binding`, vaerdi_json: "true", bekraeft: false },
        );
    }

    const fund = validerVaerk(new Map(blade.map((b) => [b.sti, b.vaerdi_json])));
    fejl.push(...manglendeObligatoriske(blade, s));
    return { blade, fejl, fund };
}

/**
 * Skabelonens obligatoriske felter (`obligatoriske_felter.altid`), der mangler eller er tomme. Backend tjekker kun
 * strukturen (fv-app 11:50), så guiden skal selv sikre dem. Punkter i fritekst ("storage (blokken, evt. tom)",
 * "units.<n> (mindst én aktiv)") er ikke stier og dækkes af klientvalideringen.
 */
export function manglendeObligatoriske(blade: readonly NytBlad[], s: NytVaerkSkabelon): string[] {
    const altid = s.obligatoriske?.altid;
    if (!Array.isArray(altid)) return [];
    const v = new Map(blade.map((b) => [b.sti, b.vaerdi_json]));
    return altid.filter((sti) => /^[a-z_]+(\.[a-z0-9_]+)+$/.test(sti))
        .filter((sti) => v.get(sti) === undefined || v.get(sti) === "null")
        .map((sti) => `${findFelt(sti)?.etiket ?? sti} (${sti}) er obligatorisk og mangler.`);
}

/** Gaskedlens dimensionering fra varmebehovet (kun skabelonens egen gaskedel, kun når brugeren ikke har sat effekten). */
export function autoEffekt(e: NyEnhedUdkast, u: Udkast, s: NytVaerkSkabelon): number | null {
    const g = talAf(u.varme.gwh);
    if (!s.gaskedelPrGwh || g === null || g <= 0 || !e.forvalg || e.type !== "gas_boiler" || e.værdier.has("p_max_heat")) return null;
    return Math.round(s.gaskedelPrGwh * g);
}

/** Enhedens effekt som guiden regner med: brugerens tal, skabelonens autodimensionering, ellers skabelonværdien. */
export function effektAf(e: NyEnhedUdkast, u: Udkast, s: NytVaerkSkabelon): number {
    const egen = talAf(e.værdier.get("p_max_heat") ?? "");
    if (egen !== null) return egen;
    const auto = autoEffekt(e, u, s);
    if (auto !== null) return auto;
    const j = enhedsværdi(e, "p_max_heat");
    return j ? Number(JSON.parse(j)) || 0 : 0;
}

/**
 * Kan enhederne dække spidslasten (ca. spidslastPrGwh × G MW, skabelonens guide_trin "enheder")?
 * Solvarme og andre profilbundne enheder tæller ikke — deres loft er profilen, ikke p_max_heat (fagligt review K4).
 */
export function kapacitet(u: Udkast, s: NytVaerkSkabelon): { styrbar: number; spidslast: number | null } {
    const g = talAf(u.varme.gwh);
    const styrbar = u.enheder.filter((e) => {
        const fuel = e.værdier.get("fuel") ?? tekstAf(enhedsværdi(e, "fuel"));
        return e.type !== "solar_thermal" && fuel !== "solar";
    }).reduce((x, e) => x + effektAf(e, u, s), 0);
    return { styrbar, spidslast: s.spidslastPrGwh && g !== null && g > 0 ? s.spidslastPrGwh * g : null };
}

/** Felter markeret [BEKRÆFT] i et værk — det, brugeren bør rette efter oprettelsen. */
export function bekræftListe(blade: readonly { sti: string; bekraeft?: boolean | null }[]): string[] {
    return blade.filter((b) => b.bekraeft).map((b) => b.sti);
}

/**
 * Prøvekørslens periode: 2 døgn (perioden er inklusiv: 5.–6. januar = 48 timer, målt af fv-app 07:44),
 * i skabelonens tidsvindue jul 2025–jun 2026 og uden kendte datahuller (fyn/vestkyst mangler 1. jan og 28. feb).
 */
export const PRØVEPERIODE = { start: "2026-01-05", slut: "2026-01-06" } as const;

/** Scenariet "Prøvekørsel (2 døgn)": uden balancering, gab 0,0002/100 kr. (skabelonens guide_trin "efter"). */
export function prøvekørselFelter(vaerkId: string) {
    return {
        vaerk_id: vaerkId, navn: "Prøvekørsel (2 døgn)",
        beskrivelse: "Oprettet af guiden 'Nyt værk': viser, at modellen accepterer værket. Ikke et resultat.",
        periode_start: PRØVEPERIODE.start, periode_slut: PRØVEPERIODE.slut, med_balancering: false,
        // Skabelonens trin "efter": gab 0,0002 / 100 kr. (stramt nok til at prøven kan sammenlignes senere).
        mip_rel_gap: 0.0002, mip_abs_gap: 100,
    };
}

/** Er feltet ændret efter værkets oprettelse? (Mere end 2 s senere — oprettelsen skriver alle blade i samme transaktion.) */
export function erRettet(aendret: Date | string | null | undefined, oprettet: Date | string): boolean {
    if (!aendret) return false;
    return new Date(aendret).getTime() - new Date(oprettet).getTime() > 2000;
}
