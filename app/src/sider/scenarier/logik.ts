//-----------------------------------------------------------------------
// Scenariernes rene logik — ingen React, intet netværk; testet i __tests__/.
//
//   knapStatus      hvilke knapper et værk kan bruge, og hvad brugeren kan vælge
//   bygPar          knap + valg -> reference- og scenarie-forslag (felter + ændringer)
//   tjekÆndringer   dubletreglen og "set kun på eksisterende sti" (KONTRAKT §3.5, §6b)
//   tjekPeriode     periodevalidering (fejl afvises, advarsler vises)
//   forventetVarighed  ud fra referencetal.json/README
//   forventetFrosset   de ikke-værks-rækker startBestilling fryser — til genbrug af reference
//   sammenlignelighed  KONTRAKT §6b
//
// Reglerne spejler backendens (rayfin/functions/src/logik.ts) så brugeren får
// svaret før bestilling; backenden er stadig den, der afgør (AGENTS.md).
//-----------------------------------------------------------------------

import { kodVaerdi, visVaerdi, Inputfejl } from "@/lib/data/vaerdi";
import { GRAENSER, TILLADTE_FLAG } from "../../../rayfin/data/fjv.constants";
import type { Knap, KnapAendring, KnapSide, KnapValg } from "./viden";
import { ANBEFALET_GAB, VISNINGSNAVNE } from "./viden.data";
import { DEMO_KOERSLER, DEMO_PAR } from "../analyser/sammensaetning.data";
import { frosneSerier, frossetTidsserie, type TidsserieInfo } from "./varmelast";

/** Værkets blade som opslag sti -> vaerdi_json. */
export type Blade = ReadonlyMap<string, string>;

export interface Ændring { type: "set" | "enable" | "disable"; sti: string; vaerdi_json?: string | null }

/** De scenariefelter et forslag sætter (resten tages fra fælles valg). */
export interface Scenariefelter {
    periode_start: string | null;
    periode_slut: string | null;
    med_balancering: boolean;
    balancing_method: "legacy" | "activation_value" | null;
    mip_rel_gap: number | null;
    mip_abs_gap: number | null;
    tidsgraense_s: number | null;
    ekstra_flag: string | null;
    heat_csv: string | null;
}

/** Fra/til-navne i værket: enheder og lagre med deres nuværende `enabled`. */
export interface Objekt { navn: string; slags: "units" | "storage"; til: boolean }

/**
 * Alle enheder og lagre i værket, fundet ud fra ALLE deres stier (`units.<navn>.*`,
 * `storage.<navn>.*`) som backenden (rayfin/functions/src/logik.ts bygFrossetInput).
 * Mangler `enabled`, gælder modellens standard: til (src/config.py:513, :568) — K3-N5.
 */
export function objekter(blade: Blade): Objekt[] {
    const ud = new Map<string, Objekt>();
    for (const [sti, v] of blade) {
        const m = /^(units|storage)\.([^.]+)(?:\.(.+))?$/.exec(sti);
        if (!m) continue;
        const nøgle = `${m[1]}:${m[2]}`;
        const o = ud.get(nøgle) ?? { navn: m[2], slags: m[1] as Objekt["slags"], til: true };
        if (m[3] === "enabled") o.til = v.trim() === "true";
        ud.set(nøgle, o);
    }
    return [...ud.values()];
}

/** Er objektet til i værket (standard til, hvis `enabled` mangler)? undefined = findes ikke. */
export function erTil(navn: string, blade: Blade): boolean | undefined {
    return objekter(blade).find((o) => o.navn === navn)?.til;
}

/** Hvorfor et til/fra-navn ikke kan bruges — samme regler og tekster som backendens enabledSti. */
export function enabledFejl(navn: string, blade: Blade): string | undefined {
    if (!navn || navn.includes(".")) return `Til/fra skal pege på et enheds- eller lagernavn, ikke en sti ("${navn}").`;
    const slags = new Set(objekter(blade).filter((o) => o.navn === navn).map((o) => o.slags));
    if (slags.size === 2) return `"${navn}" findes både som enhed og som lager — angiv ændringen som en sti i stedet.`;
    if (slags.size === 0) return `Værket har ingen enhed eller lager ved navn "${navn}".`;
    return undefined;
}

/** `units.<navn>.enabled` / `storage.<navn>.enabled` for et til/fra-navn; undefined hvis ukendt eller tvetydigt. */
export function enabledSti(navn: string, blade: Blade): string | undefined {
    if (enabledFejl(navn, blade)) return undefined;
    return `${objekter(blade).find((o) => o.navn === navn)!.slags}.${navn}.enabled`;
}

// ------------------------------------------------------------------ knapper

export interface ValgMulighed { pladsholder: string; muligheder: string[]; etiket: string }

export interface KnapStatus { mulig: boolean; grund?: string; valg: ValgMulighed[] }

const VALG_ETIKET: Record<string, string> = {
    "<enhed>": "Enhed", "<lager>": "Lager", "<braendsel>": "Brændsel", "<omraade>": "DMI-område", "<fil>": "Varmelastfil",
};

/** Mulige værdier for et valg i et givet værk. `rodKode` = værkets oprindelige repo-kode (for filer). */
export function valgMuligheder(v: KnapValg, blade: Blade, rodKode: string): string[] {
    if (v.fra === "units" || v.fra === "storage") {
        const ønsket = v.filter?.includes("false") ? false : v.filter?.includes("true") ? true : undefined;
        return objekter(blade).filter((o) => o.slags === v.fra && (ønsket === undefined || o.til === ønsket)).map((o) => o.navn);
    }
    if (v.fra === "prices") return (v.tilladte ?? []).filter((t) => blade.has(`prices.${t}.value`));
    if (v.fra === "modelrepo data/") {
        // Målte varmelastfiler hører til ét værk: filens første led ("billund_…") skal være værkets.
        return (v.tilladte ?? []).filter((f) => rodKode.startsWith(f.split("_")[0]));
    }
    return [...(v.tilladte ?? [])];
}

/** Findes en sti-skabelon (med `<pladsholdere>`) i værket — evt. med pladsholderne bundet? */
function skabelonFindes(skabelon: string, blade: Blade, bundet: Record<string, string[]>): boolean {
    const pladsholdere = skabelon.match(/<[^>]+>/g) ?? [];
    // `…<navn>.enabled` findes altid for et eksisterende objekt: mangler bladet, er standarden til (K3-N5).
    const til = /^(units|storage)\.(<[^>]+>|[^.<>]+)\.enabled$/.exec(skabelon);
    if (til) {
        const navne = til[2].startsWith("<") ? bundet[til[2]] : [til[2]];
        return objekter(blade).some((o) => o.slags === til[1] && (!navne || navne.includes(o.navn)));
    }
    if (pladsholdere.length === 0) return blade.has(skabelon);
    const flugt = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let mønster = flugt(skabelon);
    for (const p of pladsholdere) {
        const navne = bundet[p];
        mønster = mønster.replace(flugt(p), navne ? `(?:${navne.map(flugt).join("|")})` : "[^.]+");
    }
    const re = new RegExp(`^${mønster}$`);
    for (const sti of blade.keys()) if (re.test(sti)) return true;
    return false;
}

/** Aktive lagre (til `gentag_for: alle_aktive_lagre`). */
function aktiveLagre(blade: Blade): string[] {
    return objekter(blade).filter((o) => o.slags === "storage" && o.til).map((o) => o.navn);
}

/**
 * Kan knappen bruges i værket? `kraever_stier` skal findes (KONTRAKT §3.5), og
 * hvert valg skal have mindst én mulighed. Bundne pladsholdere skal findes for
 * mindst ét af valgets navne.
 */
export function knapStatus(knap: Knap, blade: Blade, rodKode: string): KnapStatus {
    const valg = knap.valg.map((v) => ({
        pladsholder: v.pladsholder, etiket: VALG_ETIKET[v.pladsholder] ?? v.pladsholder.replace(/[<>]/g, ""),
        muligheder: valgMuligheder(v, blade, rodKode),
    }));
    const tom = valg.find((v) => v.muligheder.length === 0);
    if (tom) return { mulig: false, grund: `Værket har ingen mulige værdier for "${tom.etiket.toLowerCase()}".`, valg };
    const bundet: Record<string, string[]> = Object.fromEntries(valg.map((v) => [v.pladsholder, v.muligheder]));
    if (knap.scenarie.aendringer.some((a) => a.gentag_for === "alle_aktive_lagre")) bundet["<lager>"] = aktiveLagre(blade);
    for (const s of knap.kraever_stier) {
        if (!skabelonFindes(s, blade, bundet)) return { mulig: false, grund: `Værket mangler ${s}.`, valg };
    }
    return { mulig: true, valg };
}

/** Teksten brugeren ser for en utilgængelig knap: fv-eksperts fagtekst; den rå grund (stien) er detaljen til tooltip. */
export function utilgængeligTekst(knap: Knap, st: KnapStatus): { tekst: string; detalje?: string } {
    return { tekst: knap.utilgaengelig_tekst ?? st.grund ?? "Kan ikke bruges i dette værk.", detalje: st.grund };
}

const NAVNERUM: Record<string, string> = { "<braendsel>": "braendsel" };

/** Visningsnavn for en valgmulighed (`natural_gas` -> "Naturgas"); ukendte vises som de er. */
export function visningsnavn(pladsholder: string, værdi: string): string {
    const rum = NAVNERUM[pladsholder];
    return (rum && VISNINGSNAVNE[rum]?.[værdi]) || værdi;
}

// ------------------------------------------------------------------ par

export interface Forslag {
    felter: Pick<Scenariefelter, "med_balancering" | "balancing_method" | "ekstra_flag" | "heat_csv">;
    aendringer: Ændring[];
    note?: string;
}

/** Værdi-pladsholdere brugeren skal udfylde (fx `<ny pris>`), med værkets nuværende værdi som hjælp. */
export interface Værdifelt { pladsholder: string; sti: string; standard: string; vaerk_json: string | undefined }

const erVærdiPladsholder = (j: string | undefined) => !!j && /^"?<[^>]+>"?$/.test(j.trim()) && !j.includes("<omraade>") && !j.includes("<fil>");

/** "<samme sats>" deler værdi med den første værdi-pladsholder. */
function værdiNøgle(p: string, første: string | undefined): string {
    return /^<samme/.test(p) && første ? første : p;
}

function bind(s: string, valgt: Record<string, string>): string {
    return s.replace(/<[^>]+>/g, (p) => valgt[p] ?? p);
}

/** Udvider gentag_for og pladsholdere i stier. Ændringer på stier der ikke findes (kun_hvis_stien_findes) droppes. */
function udvid(a: KnapAendring, blade: Blade, valgt: Record<string, string>): KnapAendring[] {
    const navne = a.gentag_for === "alle_aktive_lagre" ? aktiveLagre(blade) : [undefined];
    const ud: KnapAendring[] = [];
    for (const n of navne) {
        const v = n ? { ...valgt, "<lager>": n } : valgt;
        const sti = bind(a.sti, v);
        if (a.kun_hvis_stien_findes && !blade.has(sti)) continue;
        ud.push({ ...a, sti });
    }
    return ud;
}

/** De værdifelter brugeren skal udfylde for en knap (efter valg er bundet). */
export function værdifelter(knap: Knap, blade: Blade, valgt: Record<string, string>): Værdifelt[] {
    const ud: Værdifelt[] = [];
    let første: string | undefined;
    for (const side of [knap.reference, knap.scenarie]) {
        for (const a of side.aendringer.flatMap((x) => udvid(x, blade, valgt))) {
            if (a.type !== "set" || a.vaerdi_json === undefined) continue;
            const literal = bind(a.vaerdi_json, valgt);
            if (erVærdiPladsholder(a.vaerdi_json)) {
                const p = a.vaerdi_json.replace(/"/g, "");
                const n = værdiNøgle(p, første);
                første ??= p;
                if (!ud.some((u) => u.pladsholder === n)) ud.push({ pladsholder: n, sti: a.sti, standard: "", vaerk_json: blade.get(a.sti) });
            } else if (knap.sweep && bind(knap.sweep.sti, valgt) === a.sti && side === knap.scenarie) {
                // Sweep-værdien (fx tankvolumen) kan brugeren rette; knappens tal er standarden.
                if (!ud.some((u) => u.pladsholder === a.sti)) ud.push({ pladsholder: a.sti, sti: a.sti, standard: visVaerdi(literal), vaerk_json: blade.get(a.sti) });
            }
        }
    }
    return ud;
}

/**
 * Bygger reference- og scenarieforslaget for en knap. `værdier` er brugerens
 * input til værdifelterne (nøgle = pladsholder). Værdier kodes med værkets
 * nuværende type (`kodVaerdi`), så 75.0 forbliver et decimaltal.
 * Kaster `Inputfejl` hvis et værdifelt mangler eller ikke kan læses.
 */
export function bygPar(
    knap: Knap, blade: Blade, valgt: Record<string, string>, værdier: Record<string, string>, medBalancering: boolean,
): { reference: Forslag; scenarie: Forslag } {
    let første: string | undefined;
    const side = (s: KnapSide): Forslag => {
        const aendringer: Ændring[] = [];
        for (const a of s.aendringer.flatMap((x) => udvid(x, blade, valgt))) {
            if (a.type !== "set") { aendringer.push({ type: a.type, sti: a.sti }); continue; }
            const gammel = blade.get(a.sti) ?? null;
            let input: string;
            if (erVærdiPladsholder(a.vaerdi_json)) {
                const p = a.vaerdi_json!.replace(/"/g, "");
                const n = værdiNøgle(p, første);
                første ??= p;
                input = værdier[n] ?? "";
                if (!input.trim()) throw new Inputfejl(`Udfyld feltet "${n.replace(/[<>]/g, "")}".`);
            } else if (værdier[a.sti] !== undefined && s === knap.scenarie) {
                input = værdier[a.sti];
            } else {
                // Knappens egen værdi (fx "realized", 4000, true) — vist som brugeren ville skrive den.
                input = visVaerdi(bind(a.vaerdi_json ?? "null", valgt));
            }
            aendringer.push({ type: "set", sti: a.sti, vaerdi_json: kodVaerdi(gammel, input) });
        }
        const heat = s.heat_csv === undefined ? null : s.heat_csv === null ? null : bind(s.heat_csv, valgt);
        return {
            felter: {
                med_balancering: s.med_balancering ?? medBalancering,
                balancing_method: s.balancing_method ?? null,
                ekstra_flag: s.ekstra_flag ?? null,
                heat_csv: heat,
            },
            aendringer,
            note: s.note,
        };
    };
    return { reference: side(knap.reference), scenarie: side(knap.scenarie) };
}

/** Bestemmer knappen selv balanceringen på begge sider? Ellers vælger brugeren den (fælles for begge). */
export function knapStyrerBalancering(knap: Knap): boolean {
    return knap.reference.med_balancering !== undefined && knap.scenarie.med_balancering !== undefined;
}

/** Bestemmer knappen varmelastfilen? Ellers vælger brugeren én fælles (eller ingen). */
export function knapStyrerVarmelast(knap: Knap): boolean {
    return knap.reference.heat_csv !== undefined || knap.scenarie.heat_csv !== undefined;
}

export const STRAMT_GAB = { mip_rel_gap: ANBEFALET_GAB.mip_rel_gap, mip_abs_gap: ANBEFALET_GAB.mip_abs_gap } as const;

// ------------------------------------------------------------------ ændringer

export interface Fund { niveau: "fejl" | "advarsel"; tekst: string; sti?: string }

/** Stier med egne scenariefelter (periode, gab, tidsgrænse) — `set` på dem afvises (KONTRAKT §6c). */
const FELTSTI = /^(time|solver)\./;

/**
 * Dubletreglen og stireglen (KONTRAKT §3.5, §6b):
 *  - to ændringer på samme sti afvises (ikke "sidste vinder");
 *  - `disable x` og `set units.x.enabled` er samme sti og afvises;
 *  - `set` kun på eksisterende sti; til/fra kun på et kendt enheds-/lagernavn;
 *  - `set` på time.* og solver.* afvises: periode, gab og tidsgrænse er scenariefelter (§6c).
 */
export function tjekÆndringer(ændringer: readonly Ændring[], blade: Blade): Fund[] {
    const fund: Fund[] = [];
    const set = new Map<string, string>();
    const brug = (sti: string, hvad: string) => {
        const før = set.get(sti);
        if (før) fund.push({ niveau: "fejl", sti, tekst: `${hvad} rammer samme sti som ${før} (${sti}). Fjern den ene.` });
        else set.set(sti, hvad);
    };
    for (const æ of ændringer) {
        if (æ.type === "set" && æ.sti.startsWith("_tidsserie.")) {
            // Valg af værkets tidsserie (§6d) — ikke en sti i værket; selve valget tjekkes af varmelast.ts tjekVarmelast.
            try { JSON.parse(æ.vaerdi_json ?? ""); } catch { fund.push({ niveau: "fejl", sti: æ.sti, tekst: `Valget af tidsserie (${æ.sti}) kan ikke læses.` }); }
            brug(æ.sti, "valget af tidsserie");
            continue;
        }
        if (æ.type === "set") {
            if (!blade.has(æ.sti)) {
                fund.push({ niveau: "fejl", sti: æ.sti, tekst: `"${æ.sti}" findes ikke i værket. Et scenarie kan kun ændre eksisterende værdier — nye enheder eller blokke er en værksændring.` });
                continue;
            }
            if (æ.vaerdi_json == null || æ.vaerdi_json === "") fund.push({ niveau: "fejl", sti: æ.sti, tekst: `"${æ.sti}" mangler en værdi.` });
            else {
                try { JSON.parse(æ.vaerdi_json); } catch { fund.push({ niveau: "fejl", sti: æ.sti, tekst: `Værdien for "${æ.sti}" kan ikke læses.` }); }
            }
            if (FELTSTI.test(æ.sti)) {
                fund.push({ niveau: "fejl", sti: æ.sti, tekst: `"${æ.sti}" sættes med scenariets egne felter (periode, gab, tidsgrænse) — ikke som en ændring.` });
            }
            brug(æ.sti, `ændringen af ${æ.sti}`);
        } else {
            const fejl = enabledFejl(æ.sti, blade);
            if (fejl) { fund.push({ niveau: "fejl", sti: æ.sti, tekst: fejl }); continue; }
            brug(enabledSti(æ.sti, blade)!, `"slå ${æ.sti} ${æ.type === "enable" ? "til" : "fra"}"`);
        }
    }
    // Ingen aktive produktionsenheder -> modellen er tom (validering.md §5, src/model.py:150).
    const til = new Map(objekter(blade).filter((o) => o.slags === "units").map((o) => [o.navn, o.til]));
    for (const æ of ændringer) {
        if (æ.type !== "set" && til.has(æ.sti)) til.set(æ.sti, æ.type === "enable");
        const m = /^units\.([^.]+)\.enabled$/.exec(æ.sti);
        if (æ.type === "set" && m && til.has(m[1])) til.set(m[1], æ.vaerdi_json?.trim() === "true");
    }
    if (til.size > 0 && ![...til.values()].some(Boolean)) {
        fund.push({ niveau: "fejl", tekst: "Ingen aktive produktionsenheder — modellen er tom. Lad mindst én enhed være slået til." });
    }
    return fund;
}

// ------------------------------------------------------------------ periode

const DATO = /^\d{4}-\d{2}-\d{2}$/;
const DAG = 86_400_000;

function datoMs(s: string): number | undefined {
    if (!DATO.test(s)) return undefined;
    const t = Date.parse(`${s}T00:00:00Z`);
    return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s ? undefined : t;
}

function jsonTekst(j: string | undefined): string | undefined {
    if (!j) return undefined;
    try { const v = JSON.parse(j); return typeof v === "string" ? v : undefined; } catch { return undefined; }
}

/** Værkets egen periode (time.start/time.end + ét interval), som backendens periodeDoegn. */
export function værksperiode(blade: Blade): { start: string; slut: string; doegn: number } | undefined {
    const a = jsonTekst(blade.get("time.start"));
    const b = jsonTekst(blade.get("time.end"));
    if (!a || !b) return undefined;
    const ta = Date.parse(a), tb = Date.parse(b);
    if (Number.isNaN(ta) || Number.isNaN(tb)) return undefined;
    const skridt = jsonTekst(blade.get("time.resolution")) === "15min" ? 900_000 : 3_600_000;
    return { start: a.slice(0, 10), slut: b.slice(0, 10), doegn: (tb - ta + skridt) / DAG };
}

export interface Periodesvar { fund: Fund[]; start?: string; slut?: string; doegn?: number }

/** Dækningsdatoer fra viden/validering.md §2 og knapper.json. */
export const DAEKNING = {
    balanceringFra: "2025-03-04",
    picasso: "2025-04-01",
    hulFynVestkyst: "2026-02-28",
    hulFyn: "2026-01-01",
    /** aFRR-data har et hul fra denne dato (cases/andeby.yaml:100-101, viden/app_tekster/information/09_datadaekning.md). */
    afrrHul: "2026-09-04",
} as const;

/**
 * Periodevalidering. Fejl = backenden afviser; advarsler = data kan mangle.
 * Datoerne er inklusive (som CLI'ens --end). Tom periode = værkets time-blok.
 */
export function tjekPeriode(
    start: string | null | undefined, slut: string | null | undefined, blade: Blade,
    o: { medBalancering: boolean; idag?: string },
): Periodesvar {
    const fund: Fund[] = [];
    const s = start?.trim() || null, e = slut?.trim() || null;
    let p: { start: string; slut: string; doegn: number } | undefined;
    if (s || e) {
        if (!s || !e) return { fund: [{ niveau: "fejl", tekst: "Udfyld både start- og slutdato (eller ingen af dem for værkets egen periode)." }] };
        const a = datoMs(s), b = datoMs(e);
        if (a === undefined) fund.push({ niveau: "fejl", tekst: `Startdatoen "${s}" er ikke en dato (ÅÅÅÅ-MM-DD).` });
        if (b === undefined) fund.push({ niveau: "fejl", tekst: `Slutdatoen "${e}" er ikke en dato (ÅÅÅÅ-MM-DD).` });
        if (a === undefined || b === undefined) return { fund };
        if (b < a) return { fund: [{ niveau: "fejl", tekst: `Slutdatoen (${e}) ligger før startdatoen (${s}).` }] };
        p = { start: s, slut: e, doegn: Math.round((b - a) / DAG) + 1 };
    } else {
        p = værksperiode(blade);
        if (!p) return { fund: [{ niveau: "fejl", tekst: "Værket har ingen gyldig time-blok, og scenariet har ingen periode." }] };
    }
    const opl = jsonTekst(blade.get("time.resolution")) ?? "1h";
    if (opl !== "1h") fund.push({ niveau: "fejl", tekst: `Værket regner i opløsningen ${opl}; appens version 1 kører kun 1h.` });
    if (p.doegn > GRAENSER.maksPeriodeDoegn) {
        fund.push({ niveau: "fejl", tekst: `Perioden er ${Math.ceil(p.doegn)} døgn; højst ${GRAENSER.maksPeriodeDoegn} døgn pr. kørsel.` });
    }
    const inden = (dato: string) => p!.start < dato;
    const over = (dato: string) => p!.start <= dato && dato <= p!.slut;
    if (o.medBalancering && inden(DAEKNING.balanceringFra)) {
        fund.push({ niveau: "advarsel", tekst: `Med balancering skal perioden ligge efter ${DAEKNING.balanceringFra.split("-").reverse().join("-")}: ubalance- og mFRR-data begynder dér, og kørslen stopper på dækningen.` });
    } else if (o.medBalancering && inden(DAEKNING.picasso)) {
        fund.push({ niveau: "advarsel", tekst: "Balancering før ca. april 2025 (PICASSO) giver et andet marked end i dag; brug en senere periode til businesscases." });
    }
    if (o.medBalancering && p.slut >= DAEKNING.afrrHul) {
        fund.push({ niveau: "advarsel", tekst: "aFRR-data har et hul fra 4. september 2026; en balancekørsel, der når den dato, stopper på dækningen." });
    }
    const dmi = jsonTekst(blade.get("data.dmi_area"));
    if ((dmi === "fyn" || dmi === "vestkyst") && over(DAEKNING.hulFynVestkyst)) {
        fund.push({ niveau: "advarsel", tekst: `DMI-området ${dmi} mangler timer 28. februar 2026; perioden stopper på dækningen.` });
    }
    if (dmi === "fyn" && over(DAEKNING.hulFyn)) {
        fund.push({ niveau: "advarsel", tekst: "DMI-området fyn mangler timer 1. januar 2026; perioden stopper på dækningen." });
    }
    const idag = o.idag ?? new Date().toISOString().slice(0, 10);
    if (p.slut >= idag) fund.push({ niveau: "advarsel", tekst: "Perioden slutter i dag eller senere; df-data dækker højst til den seneste opdatering (mandage)." });
    const profil = [...blade.keys()].some((k) => /^units\.[^.]+\.production_profile_path$/.test(k));
    if (profil) fund.push({ niveau: "advarsel", tekst: "Værket bruger en produktionsprofil (fx solvarme); profilen skal dække hele perioden, ellers stopper kørslen." });
    return { fund, ...p };
}

/** ISO-dato -> "05-01-2026" til et inputfelt (tom ved ingen dato). */
export function datoTilFelt(iso: string | null | undefined): string {
    const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/**
 * Dansk dato fra et inputfelt ("5-1-2026", "05.01.2026", "05/01/2026") -> ISO "2026-01-05".
 * Tom -> "". Kan den ikke læses, returneres teksten uændret, så periodetjekket melder den ugyldig.
 */
export function feltTilDato(s: string): string {
    const t = s.trim();
    if (!t) return "";
    const m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(t);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return t;
}

// ------------------------------------------------------------------ varighed

/**
 * Forventet regnetid i minutter [lav, høj], uden opstart (ca. 10 s i Fabric). Tal målt i Fabric
 * 2026-10-16 af fv-ekspert (2 vCPU, stramt gab) og fra README:
 *   12 døgn: ca. 10 s · Billund Spor B 4 mdr. uden balance 71 s, med 154 s · Andeby-år uden balance
 *   265 s · Andeby-år med balance ca. 1 time · Billund rullende år med balance ca. 4 min (README, 0,5 %).
 * Klassen er værkets oprindelige repo-kode (Andeby-familien er tungere: robust reservation, flere
 * enheder). Uden balance er lineær skalering rimelig; med balance vokser tiden hurtigere end lineært,
 * derfor det brede spænd (fv-ekspert 08:55).
 */
export function forventetVarighed(o: { rodKode: string; doegn: number; medBalancering: boolean; settleRealized?: boolean }): { lav: number; høj: number } {
    if (o.doegn <= 31) return { lav: 0, høj: 1 };
    const andeby = !o.rodKode.startsWith("billund");
    const år = andeby
        ? (o.medBalancering ? [45, 75] : [4, 6])
        : (o.medBalancering ? [4, 12] : [3, 6]);
    const f = (o.doegn / 365) * (o.medBalancering && o.settleRealized ? 2 : 1);
    return { lav: Math.max(1, Math.round(år[0] * f)), høj: Math.max(1, Math.round(år[1] * f)) };
}

export function varighedTekst(v: { lav: number; høj: number }): string {
    if (v.høj <= 1) return "under 1 minut";
    const t = (m: number) => (m >= 90 ? `${Math.round(m / 6) / 10} t`.replace(".", ",") : `${m} min`);
    return v.lav === v.høj ? `ca. ${t(v.høj)}` : `${t(v.lav)}–${t(v.høj)}`.replace(" min–", "–");
}

/** Effektiv tidsgrænse = scenarie ?? værk ?? modellens 600 s (som backenden). */
export function effektivTidsgraense(felt: number | null | undefined, blade: Blade): number {
    if (felt != null) return felt;
    const v = blade.get("solver.time_limit");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : 600;
}

// ------------------------------------------------------------------ frosset input (til genbrug af reference)

/** Kanonisk værdi til sammenligning (12 og 12.0 er ens her — kun til at sammenligne, aldrig til at gemme). */
function kanon(j: string): string {
    try { return JSON.stringify(JSON.parse(j)); } catch { return j; }
}

/**
 * De ikke-værks-rækker `startBestilling` vil fryse for et scenarie (KONTRAKT §3.7,
 * rayfin/functions/src/logik.ts bygFrossetInput), som sti -> kanonisk værdi.
 * To kørsler af samme værksrevision med samme kort er samme spørgsmål.
 */
export function forventetFrosset(ændringer: readonly Ændring[], felter: Scenariefelter, blade: Blade, serier?: readonly TidsserieInfo[]): Map<string, string> {
    return new Map(frossetRækker(ændringer, felter, blade, serier).map((r) => [r.sti, kanon(r.vaerdi_json)]));
}

/**
 * De ikke-værks-rækker, startBestilling vil fryse (`kilde` aendring/scenarie), med RÅ værdier —
 * samme form som KoerselInput, så fv-analyse's tekstgeneratorer kan bruges før kørsel.
 */
export function frossetRækker(ændringer: readonly Ændring[], felter: Scenariefelter, blade: Blade, serier?: readonly TidsserieInfo[]): InputRad[] {
    const ud: InputRad[] = [];
    for (const æ of ændringer) {
        if (æ.type === "set" && æ.sti.startsWith("_tidsserie.")) continue;   // fryses som _koersel.tidsserie.* nedenfor (§6d)
        if (æ.type === "set") ud.push({ kilde: "aendring", sti: æ.sti, vaerdi_json: æ.vaerdi_json ?? "null" });
        else { const s = enabledSti(æ.sti, blade); if (s) ud.push({ kilde: "aendring", sti: s, vaerdi_json: æ.type === "enable" ? "true" : "false" }); }
    }
    const P = "_koersel.";
    const sc = (sti: string, vaerdi_json: string) => ud.push({ kilde: "scenarie", sti, vaerdi_json });
    if (felter.periode_start && felter.periode_slut) {
        sc(`${P}start`, JSON.stringify(felter.periode_start));
        sc(`${P}slut`, JSON.stringify(felter.periode_slut));
    }
    sc(`${P}med_balancering`, felter.med_balancering ? "true" : "false");
    if (felter.balancing_method) sc(`${P}balancing_method`, JSON.stringify(felter.balancing_method));
    if (felter.heat_csv) sc(`${P}heat_csv`, JSON.stringify(felter.heat_csv));
    const flag = (felter.ekstra_flag ?? "").split(/\s+/).filter(Boolean);
    if (flag.length) sc(`${P}ekstra_flag`, JSON.stringify(flag));
    if (felter.mip_rel_gap != null) sc("solver.mip_rel_gap", String(felter.mip_rel_gap));
    if (felter.mip_abs_gap != null) sc("solver.mip_abs_gap", String(felter.mip_abs_gap));
    if (felter.tidsgraense_s != null) sc("solver.time_limit", String(felter.tidsgraense_s));
    // Tidsserierne, startBestilling fryser (begge roller), i dens form `{id, sha256}` (K5-F7; k5.spec.ts sammenligner
    // direkte med bygFrossetInput). Kendes serierne ikke, udelades de (så genbruges en reference bare ikke).
    if (serier) {
        for (const [rolle, serie] of frosneSerier(ændringer, felter.heat_csv, serier)) sc(`_koersel.tidsserie.${rolle}`, frossetTidsserie(serie));
    }
    return ud;
}

/** Hele det input, en kørsel af scenariet ville få (værkets blade + frosne ændringer), uden pins. */
export function forventetInput(ændringer: readonly Ændring[], felter: Scenariefelter, blade: Blade, serier?: readonly TidsserieInfo[]): InputRad[] {
    return [...[...blade].map(([sti, vaerdi_json]) => ({ kilde: "vaerk" as const, sti, vaerdi_json })), ...frossetRækker(ændringer, felter, blade, serier)];
}

export interface InputRad { kilde: "vaerk" | "aendring" | "scenarie"; sti: string; vaerdi_json: string }

/** Model- og data-SHA, som startBestilling fryser fra Motor (KONTRAKT §6c) — ikke en del af scenariets "kort". */
export const PINS = ["_koersel.model_commit", "_koersel.data_commit"] as const;

/** Den frosne inputs ikke-værks-rækker for en kørsel, samme form som forventetFrosset (uden pins). */
export function frosset(rækker: readonly { kilde: string; sti: string; vaerdi_json: string }[]): Map<string, string> {
    const ud = new Map<string, string>();
    for (const r of rækker) if (r.kilde !== "vaerk" && !(PINS as readonly string[]).includes(r.sti)) ud.set(r.sti, kanon(r.vaerdi_json));
    return ud;
}

/** De frosne pins (model, data) for en kørsel — fra input, ellers fra kørslens egne felter. */
export function pinsAf(
    rækker: readonly { sti: string; vaerdi_json: string }[], k: { model_commit?: string | null; data_commit?: string | null },
): { model?: string; data?: string } {
    const v = (sti: string) => jsonTekst(rækker.find((r) => r.sti === sti)?.vaerdi_json);
    return { model: v(PINS[0]) ?? k.model_commit ?? undefined, data: v(PINS[1]) ?? k.data_commit ?? undefined };
}

export type Pins = { model?: string | null; data?: string | null };

/**
 * Må en kandidat-reference genbruges for en ny kørsel med Motorens pins `nye`? Kun hvis BEGGE pins
 * kendes på begge sider og er ens (K3-N4): en manglende pin er ikke "ens", og ukendte Motor-pins
 * betyder ingen genbrug.
 */
export function pinsPasser(nye: Pins | undefined, kandidat: Pins): boolean {
    if (!nye?.model || !nye.data || !kandidat.model || !kandidat.data) return false;
    return nye.model === kandidat.model && nye.data === kandidat.data;
}

export function sammeKort(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
        if (!b.has(k)) return false;
        const x = b.get(k)!;
        if (x !== v && !(Number.isFinite(Number(x)) && Number(x) === Number(v))) return false;
    }
    return true;
}

// ------------------------------------------------------------------ sammenlignelighed (KONTRAKT §6b)

export interface KørselsNøgle {
    vaerk_id: string;
    oploesning?: string | null;
    data_commit?: string | null;
    model_commit?: string | null;
    oensket_rel_gap?: number | null;
    oensket_abs_gap?: number | null;
    manifest_json?: string | null;
}

export function manifestPeriode(m: string | null | undefined): string | undefined {
    if (!m) return undefined;
    try {
        const p = (JSON.parse(m) as { periode?: { start?: string; slut?: string } }).periode;
        return p?.start && p?.slut ? `${p.start}–${p.slut}` : undefined;
    } catch { return undefined; }
}

/** Hvad afviger mellem to kørsler (tom liste = direkte sammenlignelige). */
export function sammenlignelighed(a: KørselsNøgle, b: KørselsNøgle): string[] {
    const afv: string[] = [];
    if (a.vaerk_id !== b.vaerk_id) afv.push("værk");
    const pa = manifestPeriode(a.manifest_json), pb = manifestPeriode(b.manifest_json);
    if (!pa || !pb || pa !== pb) afv.push("periode");
    if ((a.oploesning ?? "") !== (b.oploesning ?? "")) afv.push("opløsning");
    if ((a.data_commit ?? "") !== (b.data_commit ?? "")) afv.push("df-data");
    if ((a.model_commit ?? "") !== (b.model_commit ?? "")) afv.push("modelversion");
    if (a.oensket_rel_gap !== b.oensket_rel_gap) afv.push("relativt gab");
    if (a.oensket_abs_gap !== b.oensket_abs_gap) afv.push("absolut gab");
    return afv;
}

// ------------------------------------------------------------------ scenarieparret (henvisning i beskrivelsen)

const REF = /\n?\[reference-scenarie: ([0-9a-f-]{36})\]\s*$/i;

/** Henvisningen til parrets reference gemmes som sidste linje i beskrivelsen (indtil Scenarie får et felt). */
export function medReference(beskrivelse: string, refId: string): string {
    return `${beskrivelse.replace(REF, "")}\n[reference-scenarie: ${refId}]`;
}

/**
 * Parrets reference: feltet `Scenarie.reference_scenarie_id` (deployet af fv-app), ellers den gamle
 * henvisningslinje i beskrivelsen (scenarier oprettet før feltet fandtes).
 */
export function referenceId(s: { reference_scenarie_id?: string | null; beskrivelse?: string | null }): string | undefined {
    return s.reference_scenarie_id || referenceAf(s.beskrivelse);
}

/**
 * Demo-parrets reference ud fra scenariets NAVN (viden/demo_scenarier.json › par). Demo-scenarierne i databasen er
 * oprettet af demo-indlæseren uden `reference_scenarie_id` (målt 2026-10-19: 0 af 14 aktive scenarier har feltet), så
 * uden dette faldt Oversigten tilbage til "en anden sammenlignelig kørsel" og pegede alle Andeby vinter-rækker på samme.
 */
export function demoReferenceNavn(navn: string | null | undefined): string | undefined {
    const d = DEMO_KOERSLER.find((x) => x.navn === (navn ?? "").trim());
    const p = d && DEMO_PAR.find((x) => x.scenarie === d.id);
    return p ? DEMO_KOERSLER.find((x) => x.id === p.reference)?.navn : undefined;
}

/**
 * Parrets reference-scenarie: feltet, den gamle henvisningslinje, ellers demo-parret (navnet slås op på samme værk;
 * et ikke-arkiveret, ellers det nyeste). `undefined` = scenariet indgår ikke i et par som scenarie.
 */
export function parretsReference(
    s: { id: string; vaerk_id: string; navn: string; reference_scenarie_id?: string | null; beskrivelse?: string | null },
    scenarier: readonly { id: string; vaerk_id: string; navn: string; arkiveret?: boolean | null; oprettet?: Date | string | null }[],
): string | undefined {
    const id = referenceId(s);
    if (id) return id;
    const refNavn = demoReferenceNavn(s.navn);
    if (!refNavn) return undefined;
    const kandidater = scenarier
        .filter((x) => x.vaerk_id === s.vaerk_id && x.id !== s.id && x.navn.trim() === refNavn)
        .sort((a, b) => Number(!!a.arkiveret) - Number(!!b.arkiveret) || tid(b.oprettet) - tid(a.oprettet));
    return kandidater[0]?.id;
}

const tid = (t: Date | string | null | undefined) => (t ? new Date(t).getTime() || 0 : 0);

export function referenceAf(beskrivelse: string | null | undefined): string | undefined {
    return beskrivelse ? REF.exec(beskrivelse)?.[1] : undefined;
}

export function visBeskrivelse(beskrivelse: string | null | undefined): string {
    return (beskrivelse ?? "").replace(REF, "").trim();
}

// ------------------------------------------------------------------ flag

export function tilladtFlag(f: string | null | undefined): boolean {
    return (f ?? "").split(/\s+/).filter(Boolean).every((x) => (TILLADTE_FLAG as readonly string[]).includes(x));
}
