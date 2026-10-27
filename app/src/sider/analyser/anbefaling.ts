//-----------------------------------------------------------------------
// Anbefaling og historie for et reference/scenarie-par (brief 15, A og A2).
//
// Reglerne er fv-eksperts viden/anbefalingsregler.json (teksterne genereres ind
// i anbefaling.data.ts); her står de som kode: hvilken knap parret er, den
// 9-trins beslutningsrækkefølge, forbeholdene og de 2–3 sætninger, der
// fortæller scenariet. Rene funktioner — testet i anbefaling.spec.ts.
//
// Roller: "scenariet" er den kørsel, der BÆRER ændringen ift. værket; den
// anden er referencen. Sammenligner brugeren omvendt (a = scenariet), byttes
// rollerne her, så anbefalingen altid handler om "gennemfør ændringen?".
//-----------------------------------------------------------------------

import { effektivtInput, KOERSEL_PRAEFIKS, type InputRække } from "@/lib/data/afflad";
import { tal } from "@/lib/format";
import {
    absolutGab, feltInfo, inputDiff, kendtDelta, METADATA_FLAG, modtaget, sammeVaerdi, produktionsvarians, sammenlignelighed, sammenlignelighedStatus, spor, visJson,
    type InputForskel, type Koersel, type Profil, type Samlet,
} from "./beregn";
import { FORBEHOLD_REGLER, INVESTERING, KATEGORIER, KNAPPER, SKALERING_TEKST, T0_DEFEKTE_MODEL_COMMITS, TRIN, VISNINGSNAVNE } from "./anbefaling.data";
import { dec, periodeTekst } from "./fmt";
import { aendringsResume } from "./kandidater";

export interface Side {
    k: Koersel;
    navn: string;
    vaerkNavn: string;
    /** Fuldt frosset input (værkets blade + kørslens egne rækker). */
    input: readonly InputRække[];
    samlet: Samlet;
    profil: Profil;
    /** Navne på de tidsserier, kørslen har frosset (brief 18) — kun til tekst; identiteten er id + sha256. */
    tidsserienavne?: ReadonlyMap<string, string>;
}

export type Kategori = "anbefalet" | "fraraades" | "kan_ikke_afgoeres" | "undersoeg_naermere" | "foelsomhed";

// ================================================================= afrunding (historie.afrunding)

/**
 * < 10.000: nærmeste 100 kr.; < 1 mio.: nærmeste 1.000 kr.; ≥ 1 mio.: én decimal og "mio. kr.". Uden fortegn.
 * Codex K9 F4: er det afrundede beløb ikke beløbet i hele kroner, står "ca." foran ("ca. 200 kr." for 170,18 kr.), så
 * fortællingen ikke ser uenig ud med overskriftens præcise "170 kr."; et beløb, der afrundes til 0, er "under 100 kr.".
 * `ca = false`, hvor teksten selv siger "ca." (skaleringen), og til nultjekket (`krNul`).
 */
export function krRund(v: number, ca = true): string {
    const a = Math.abs(v);
    const r = a >= 1_000_000 ? Math.round(a / 100_000) * 100_000 : a >= 10_000 ? Math.round(a / 1000) * 1000 : Math.round(a / 100) * 100;
    const tekst = a >= 1_000_000 ? `${dec(a / 1_000_000, 1)} mio. kr.` : `${tal(r)} kr.`;
    if (!ca || r === Math.round(a)) return tekst;
    return r === 0 ? "under 100 kr." : `ca. ${tekst}`;
}

/** Bliver beløbet 0 kr. efter kr.-reglen? */
export const krNul = (v: number) => krRund(v, false) === "0 kr.";

/** Beløbet til en skabelon, der selv skriver "kr." efter pladsholderen ("{delta} kr. dyrere"). */
const krUdenEnhed = (v: number) => krRund(v).replace(/ kr\.$/, "");

/** < 100 MWh: hele MWh; < 1.000 MWh: nærmeste 10 MWh; ≥ 1.000 MWh: GWh med én decimal. Uden fortegn. */
export function energiRund(mwh: number): string {
    const a = Math.abs(mwh);
    if (a >= 1000) return `${dec(a / 1000, 1)} GWh`;
    if (a >= 100) return `${tal(Math.round(a / 10) * 10)} MWh`;
    return `${tal(a)} MWh`;
}

/** Én decimal under 10 %, ellers hele procent. Uden fortegn. */
export function procentRund(p: number): string {
    const a = Math.abs(p);
    return a < 10 ? `${dec(a, 1)} %` : `${tal(a)} %`;
}

const stort = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lille = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
function liste(xs: readonly string[]): string {
    if (xs.length <= 1) return xs[0] ?? "";
    return `${xs.slice(0, -1).join(", ")} og ${xs[xs.length - 1]}`;
}
function udfyld(t: string, v: Record<string, string | number>): string {
    return t.replace(/\{([^}]+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
}
const json = (j: string | undefined): unknown => { if (j === undefined) return undefined; try { return JSON.parse(j); } catch { return j; } };

// ================================================================= hvilken knap er parret?

/** Enhedstypens bestemte form ("varmepumpen") og ubestemte ("varmepumpe"). */
const TYPENAVN: Record<string, [string, string]> = {
    heat_pump: ["varmepumpen", "varmepumpe"], electric_boiler: ["elkedlen", "elkedel"], biomass_boiler: ["biomassekedlen", "biomassekedel"],
    gas_boiler: ["gaskedlen", "gaskedel"], gas_engine_chp: ["gasmotoren", "gasmotor"], solar_thermal: ["solvarmen", "solvarme"],
    waste_heat: ["overskudsvarmen", "overskudsvarme"],
};

const BRÆNDSLER = /^prices\.(natural_gas|straw|flis|wood_pellets|waste_heat)\.value$/;
const ELAFGIFT = "electricity.electricity_tax", ELAFGIFT_NET = "electricity.tariff_consumption.fixed_components.elafgift_net";

/**
 * Matcher et ORDNET par (reference → scenarie) mod knappernes skabeloner
 * (knapper.json → reference/scenarie), inklusive ledsagefelter (Codex K4-F3):
 * elafgiftens dokumentationspost `elafgift_net` er samme ændring som
 * `electricity_tax`, og "ingen tank" er tankstørrelsesknappens reference.
 * Uvedkommende ekstra ændringer giver null. Én pris ad gangen: to
 * brændselspriser er ikke en isoleret følsomhed (K4-F4).
 */
export function matchSkabelon(diff: readonly InputForskel[]): string | null {
    if (diff.length === 0) return null;
    const stier = diff.map((d) => d.sti);
    const kun = (ok: (s: string) => boolean) => stier.every(ok);
    const én = (sti: string | RegExp) => diff.length === 1 && (typeof sti === "string" ? stier[0] === sti : sti.test(stier[0]));
    const P = KOERSEL_PRAEFIKS;
    const bal = diff.find((d) => d.sti === `${P}med_balancering`);
    if (bal) return kun((s) => s === `${P}med_balancering` || s === `${P}balancing_method`) && json(bal.a) !== true && json(bal.b) === true ? "balancemarkedets_vaerdi" : null;
    if (én(`${P}balancing_method`)) return "indtaegtsmetode";
    // Målt varmelast i begge understøttede former (Codex K5-F8): repoets fil (`heat_csv`) og en frosset tidsserie
    // (`tidsserie.varmelast`) — fra syntesen, mellem to tidsserier eller mellem fil og tidsserie.
    if (kun((s) => s === `${P}heat_csv` || s === `${P}tidsserie.varmelast`)) return "maalt_varmelast";
    if (én(`${P}ekstra_flag`)) return "nettabsmodel";
    const lager = /^storage\.([^.]+)\.(enabled|volume_m3)$/;
    if (kun((s) => lager.test(s))) {
        const objekter = new Set(stier.map((s) => lager.exec(s)![1]));
        const vol = diff.filter((d) => d.sti.endsWith(".volume_m3")), en = diff.filter((d) => d.sti.endsWith(".enabled"));
        if (vol.length === 0 && en.every((d) => json(d.a) !== false && json(d.b) === false)) return "tankens_vaerdi";
        if (vol.length === 1 && objekter.size === 1 && en.every((d) => json(d.a) === false && json(d.b) !== false)) return "tankstoerrelse";
        return null;
    }
    if (én(/^units\.[^.]+\.enabled$/)) { const b = json(diff[0].b); return b === true ? "ny_enhed" : b === false ? "enhedens_vaerdi" : null; }
    if (én("prices.co2_eua.value")) return "co2_pris";
    if (én(BRÆNDSLER)) return "braendselspris";
    if (stier.includes(ELAFGIFT) && kun((s) => s === ELAFGIFT || s === ELAFGIFT_NET)) {
        const t = diff.find((d) => d.sti === ELAFGIFT)!, net = diff.find((d) => d.sti === ELAFGIFT_NET);
        return !net || sammeVaerdi(net.b, t.b) ? "elafgift" : null;
    }
    if (én("balancing.ancillary_caps.total_mw")) return "praekvalifikation";
    if (kun((s) => s === "balancing.activation.foresight" || s === "balancing.activation.settle")) return "budstrategi_viden";
    const gate = diff.find((d) => d.sti === "balancing.reservation_gate.enabled");
    if (gate && json(gate.b) === true && kun((s) => s === "balancing.reservation_gate.enabled" || s === "balancing.activation.foresight" || s === "balancing.activation.settle")) return "beregnet_budpris";
    if (én("balancing.robust_reservation")) return "robust_reservation";
    if (én("data.dmi_area")) return "klimaomraade";
    return null;
}

/** Felter §6b allerede afgør (periode, gab) og frosne pins hører ikke til "hvad er ændret". */
function relevant(d: InputForskel): boolean {
    return !METADATA_FLAG.has(d.sti) && !d.sti.startsWith("solver.")
        && d.sti !== `${KOERSEL_PRAEFIKS}start` && d.sti !== `${KOERSEL_PRAEFIKS}slut`;
}

/** Bærer kørslen ændringen på stien (har den selv en række for den / har balancemarkedet slået til)? */
function bærer(s: Side, sti: string): boolean {
    const r = s.input.find((x) => x.kilde !== "vaerk" && x.sti === sti);
    if (!r) return false;
    if (sti === `${KOERSEL_PRAEFIKS}med_balancering`) return r.vaerdi_json === "true";
    return true;
}

export interface Par {
    ref: Side;
    scen: Side;
    /** Rollerne er byttet ift. brugerens a/b (a bar ændringen). */
    byttet: boolean;
    diff: InputForskel[];
    knap: string | null;
    /** Flere ændringer, der ikke tilsammen er én knaps skabelon (trin 2). */
    flere: boolean;
    /** Én ændring, der ikke svarer til nogen knap — ingen regel, ingen anbefaling (K4-F4). */
    ukendt: boolean;
}

/**
 * Ordner et par: scenariet er den kørsel, der bærer ændringen. Δ = scenarie − reference.
 * Retningen afgøres først af, hvem der bærer ændringerne; matcher knappens skabelon
 * kun i den modsatte retning (fx tankstørrelse: "ingen tank" er referencen), byttes.
 */
export function ordnPar(a: Side, b: Side): Par {
    const ab = inputDiff(a.input, b.input).filter(relevant), ba = inputDiff(b.input, a.input).filter(relevant);
    let byttet = ab.length > 0 && ab.every((d) => bærer(a, d.sti) && !bærer(b, d.sti));
    let knap = matchSkabelon(byttet ? ba : ab);
    if (knap === null) {
        const alt = matchSkabelon(byttet ? ab : ba);
        if (alt !== null) { byttet = !byttet; knap = alt; }
    }
    const [ref, scen] = byttet ? [b, a] : [a, b];
    const diff = byttet ? ba : ab;
    return { ref, scen, byttet, diff, knap, flere: knap === null && diff.length > 1, ukendt: knap === null && diff.length === 1 };
}

// ================================================================= vurdering

export interface Forbehold { id: string; virkning: string; tekst: string }

export interface Vurdering {
    kategori: Kategori;
    maerke: string;
    tone: "ok" | "fejl" | "neutral" | "advarsel";
    /** Én sætning regnet af data (knappens formulering). */
    saetning: string;
    begrundelse: string;
    forbehold: Forbehold[];
    noter: Forbehold[];
    naesteSkridt: string[];
    /** Investeringsforbeholdet for knapper, der er investeringer. */
    investering: string | null;
    skalering: string | null;
    delta: number | null;
    tolerance: number | null;
    vaesentlighed: number | null;
    /** |Δ| / T rundet ned; null hvis T er 0 eller ukendt. */
    n: number | null;
    doegn: number | null;
    knap: string | null;
}

const DØGN = 86_400_000;
/** Periodens længde i døgn fra den præcise periode (inkl. sidste interval). */
export function doegn(p: Profil): number | null {
    if (!p.periode_fra || !p.periode_til) return null;
    const min = p.oploesning === "15min" ? 15 : 60;
    return Math.round(((Date.parse(p.periode_til) - Date.parse(p.periode_fra)) / DØGN + min / 1440) * 100) / 100;
}

function sæson(p: Profil): string | null {
    if (!p.periode_fra || !p.periode_til) return null;
    const fra = new Date(p.periode_fra), til = new Date(p.periode_til);
    const mdr: number[] = [];
    for (let d = new Date(Date.UTC(fra.getUTCFullYear(), fra.getUTCMonth(), 1)); d <= til; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) mdr.push(d.getUTCMonth() + 1);
    if (mdr.length > 6) return null;
    if (mdr.every((m) => m >= 10 || m <= 3)) return "vinteren (oktober–marts)";
    if (mdr.every((m) => m >= 4 && m <= 9)) return "sommeren (april–september)";
    return null;
}

function blad(s: Side, sti: string): unknown {
    const e = effektivtInput(s.input);
    const r = e.blade.get(sti);
    if (r) return json(r.vaerdi_json);
    if (sti.startsWith(KOERSEL_PRAEFIKS)) return json(e.flag.get(sti.slice(KOERSEL_PRAEFIKS.length)));
    return undefined;
}

const harBalance = (s: Side) => s.samlet.balance !== null;
const gabTekstKort = (k: Koersel) => `${k.oensket_rel_gap != null ? `${dec(k.oensket_rel_gap * 100, 3)} %` : "?"} / ${k.oensket_abs_gap != null ? `${tal(k.oensket_abs_gap)} kr.` : "?"}`;

/** Forventet fortegn for knappens Δ (scenarie − reference); null = intet krav. */
function forventetFortegn(p: Par): "≥0" | "≤0" | null {
    switch (p.knap) {
        case "tankens_vaerdi": case "enhedens_vaerdi": return "≥0";
        case "balancemarkedets_vaerdi": case "ny_enhed": case "praekvalifikation": case "robust_reservation": return "≤0";
        case "braendselspris": case "co2_pris": case "elafgift": {
            const d = p.diff[0];
            const a = Number(json(d?.a)), b = Number(json(d?.b));
            return Number.isFinite(a) && Number.isFinite(b) ? (b >= a ? "≥0" : "≤0") : null;
        }
        default: return null;
    }
}

/** Forbehold og noter for parret (anbefalingsregler.json → forbehold). */
export function forbehold(p: Par, bekraeft: ReadonlySet<string>): Forbehold[] {
    const ud: Forbehold[] = [];
    const tilføj = (id: string, v: Record<string, string | number> = {}) => {
        const r = FORBEHOLD_REGLER[id];
        if (r) ud.push({ id, virkning: r.virkning, tekst: udfyld(r.tekst, v) });
    };
    const d = doegn(p.scen.profil);
    const knap = p.knap ? KNAPPER[p.knap]?.anbefaling as { kraever_helaar?: boolean } | undefined : undefined;
    if (d !== null && d < 14) tilføj("faa_doegn", { doegn: tal(d) });
    if (d !== null && knap?.kraever_helaar && d < 365) tilføj("kort_periode_beslutning", { doegn: tal(d) });
    const s = sæson(p.scen.profil);
    if (s) tilføj("en_saeson", { saeson: s });
    const medBal = [p.ref, p.scen].filter(harBalance);
    if (medBal.some((x) => spor(x.input) === "A")) tilføj("spor_a");
    if (medBal.some((x) => { const f = blad(x, "balancing.activation.foresight"); return f === undefined || f === "realized"; })) tilføj("kender_aktiveringerne");
    const objekter = new Set(p.diff.map((x) => /^(units|storage)\.([^.]+)\.enabled$/.exec(x.sti)).filter((m): m is RegExpExecArray => !!m).map((m) => `${m[1]}.${m[2]}.`));
    const bek = [...bekraeft].filter((sti) => p.diff.some((x) => x.sti === sti) || [...objekter].some((o) => sti.startsWith(o))).sort();
    if (bek.length) tilføj("bekraeft", { antal: bek.length, felter: bek.slice(0, 4).join(", ") + (bek.length > 4 ? " …" : "") });
    const løst = [p.ref.k, p.scen.k].find((k) => (k.oensket_rel_gap ?? 0) > 0.0002 || (k.oensket_abs_gap ?? 0) > 1000);
    if (løst) tilføj("gab_loest", { gab: gabTekstKort(løst) });
    for (const [rolle, x] of [["Referencen", p.ref], ["Scenariet", p.scen]] as const) {
        if ((x.k.solve_status ?? "").toLowerCase() !== "optimal") tilføj("ikke_optimal", { rolle, gab: x.k.opnaaet_gap != null ? `${dec(x.k.opnaaet_gap * 100, 3)} %` : "ukendt" });
    }
    const profil = p.diff.map((x) => /^units\.([^.]+)\./.exec(x.sti)?.[1]).find((u) => u && (() => { const v = blad(p.scen, `units.${u}.production_profile_path`) ?? blad(p.ref, `units.${u}.production_profile_path`); return typeof v === "string" && v !== ""; })());
    if (profil) tilføj("profilbunden", { enhed: profil });
    // Tankens første time var ubundet før modelrettelsen 19/10-2026; kun kørsler regnet ved de versioner bærer forbeholdet.
    const defekt = [p.ref.k, p.scen.k].map((k) => k.model_commit ?? "").find((c) => T0_DEFEKTE_MODEL_COMMITS.includes(c));
    if (defekt && d !== null && d < 90 && p.diff.some((x) => x.sti.startsWith("storage."))) tilføj("t0_lager", { doegn: tal(d), commit: defekt.slice(0, 7) });
    const titel = `${blad(p.ref, "meta.titel") ?? ""} ${blad(p.ref, "meta.description") ?? ""}`;
    if (/fiktiv/i.test(titel)) tilføj("fiktivt_vaerk");
    if (medBal.some((x) => spor(x.input) === "B")) tilføj("spor_b_kalibrering");
    return ud;
}

/** Knappens sætning med pladsholdere udfyldt. */
function knapSaetning(p: Par, delta: number, skaleret: string): string {
    const anb = (p.knap ? KNAPPER[p.knap]?.anbefaling : undefined) as Record<string, unknown> | undefined;
    const abs = krRund(delta);
    const d0 = p.diff[0];
    const unit = d0 ? /^units\.([^.]+)\./.exec(d0.sti)?.[1] : undefined;
    const type = unit ? (blad(p.ref, `units.${unit}.type`) as string | undefined) : undefined;
    const [bestemt, ubestemt] = type && TYPENAVN[type] ? TYPENAVN[type] : ["enheden", "enhed"];
    const a = Number(json(d0?.a)), b = Number(json(d0?.b));
    const brændsel = d0 ? /^prices\.([^.]+)\./.exec(d0.sti)?.[1] : undefined;
    const v: Record<string, string> = {
        abs, skaleret,
        enhed: p.knap === "ny_enhed" ? `${ubestemt} ${unit ?? ""}`.trim() : `${bestemt} ${unit ?? ""}`.trim(),
        vaerdi: Number.isFinite(b) ? `${tal(b)} m³` : "",
        brændsel: brændsel ? (VISNINGSNAVNE.braendsel?.[brændsel] ?? brændsel) : "",
        pct: Number.isFinite(a) && Number.isFinite(b) && a !== 0 ? procentRund(((b - a) / a) * 100) : "",
        pr_enhed: Number.isFinite(a) && Number.isFinite(b) && b !== a ? tal(Math.abs(delta / (b - a))) : "",
        a: d0 ? visJson(d0.a) : "", b: d0 ? visJson(d0.b) : "",
    };
    let t: string | undefined;
    if (anb?.type === "beslutning") t = (delta < 0 ? anb.hvis_billigere : anb.hvis_dyrere) as string | undefined;
    else if (anb) t = anb.tekst as string | undefined;
    if (!t) t = `Scenariet gør driften {abs} ${delta < 0 ? "billigere" : "dyrere"} i perioden{skaleret}.`;
    // Pris- og omkostningsretning hver for sig (Codex K4-F5): skabelonen har "dyrere" fast for begge.
    const omk = delta < 0 ? "billigere" : "dyrere";
    if (Number.isFinite(a) && Number.isFinite(b)) t = t.replace("{pct} dyrere", `{pct} ${b >= a ? "dyrere" : "billigere"}`);
    t = t.replace("{abs} dyrere/billigere", `{abs} ${omk}`).replace("dyrere/billigere", omk).replace("gør driften {abs} dyrere", `gør driften {abs} ${omk}`);
    return stort(udfyld(t, v));
}

/**
 * Neutral hovedsætning (Codex K4-F6): når kategorien er "Kan ikke afgøres" (eller
 * en følsomhed inden for tolerancen), beskrives den målte forskel uden "behold",
 * "gennemfør" eller en påstået besparelse. Nul har ingen retning.
 */
export function neutralSaetning(delta: number, indenTolerance: boolean): string {
    if (krNul(delta)) return delta === 0
        ? "Scenariet og referencen har samme driftsomkostning i perioden."
        : "Scenariet og referencen har samme driftsomkostning i perioden (forskellen er under 100 kr.).";
    const målt = `Den målte forskel er ${krRund(delta)} ${delta < 0 ? "billigere" : "dyrere"} for scenariet i perioden`;
    return indenTolerance ? `${målt}, men den kan ikke skelnes fra nul.` : `${målt}; tallet bærer ingen anbefaling — se begrundelsen.`;
}

/**
 * Den 9-trins beslutningsrækkefølge (anbefalingsregler.json). `bekraeft` er de
 * værksstier, der er markeret [BEKRÆFT] (VaerkParameter.bekraeft).
 */
export function vurder(p: Par, bekraeft: ReadonlySet<string> = new Set()): Vurdering {
    const { ref, scen } = p;
    const anb = (p.knap ? KNAPPER[p.knap]?.anbefaling : undefined) as Record<string, unknown> | undefined;
    const type = (anb?.type as string | undefined) ?? "beslutning";
    const fb = forbehold(p, bekraeft);
    // Det afgørende forbehold først: nedgrader_begge (trin 6) før nedgrader (trin 8).
    const nedgrader = [...fb.filter((f) => f.virkning === "nedgrader_begge"), ...fb.filter((f) => f.virkning === "nedgrader")];
    const noter = fb.filter((f) => f.virkning === "note");
    const næste = ((anb?.naeste_skridt as string[] | undefined) ?? []).length ? (anb!.naeste_skridt as string[]) : ["Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab"];
    const d = doegn(scen.profil);
    const delta = ref.k.objektiv_dkk != null && scen.k.objektiv_dkk != null ? scen.k.objektiv_dkk - ref.k.objektiv_dkk : null;
    const ga = absolutGab(ref.k).kr, gb = absolutGab(scen.k).kr;
    const T = ga === null || gb === null ? null : ga + gb;
    const V = ref.k.objektiv_dkk != null ? Math.max(1000, 0.001 * Math.abs(ref.k.objektiv_dkk)) : null;
    const n = delta !== null && T !== null && T > 0 ? Math.floor(Math.abs(delta) / T) : null;
    const aarligt = delta !== null && d !== null && d >= 7 && d < 365 ? (delta * 365) / d : null;
    const skaleret = aarligt !== null ? ` (skaleret til et år ca. ${krRund(aarligt, false)})` : "";
    const investering = p.knap && INVESTERING.knapper.includes(p.knap) ? INVESTERING.tekst : null;
    const indenTol = delta !== null && T !== null && (Math.abs(delta) <= 2 * T || (V !== null && Math.abs(delta) <= V));
    const svar = (kategori: Kategori, begrundelse: string, saetning?: string): Vurdering => ({
        kategori, maerke: KATEGORIER[kategori]?.maerke ?? kategori, tone: (KATEGORIER[kategori]?.tone ?? "neutral") as Vurdering["tone"],
        saetning: saetning ?? (delta === null ? "Mindst én af kørslerne har ingen driftsomkostning."
            : kategori === "kan_ikke_afgoeres" || (kategori === "foelsomhed" && indenTol) ? neutralSaetning(delta, indenTol)
                : knapSaetning(p, delta, skaleret)),
        begrundelse, forbehold: nedgrader, noter, naesteSkridt: næste, investering,
        skalering: aarligt !== null ? udfyld(SKALERING_TEKST, { aarligt: krRund(aarligt, false) }) : null,
        delta, tolerance: T, vaesentlighed: V, n, doegn: d, knap: p.knap,
    });

    // 1. Ikke færdige eller ikke sammenlignelige
    const af = sammenlignelighed(ref.profil, scen.profil);
    if (ref.k.status !== "faerdig" || scen.k.status !== "faerdig") return svar("kan_ikke_afgoeres", "Begge kørsler skal være færdige.");
    if (sammenlignelighedStatus(af) !== "ja") {
        const felter = af.filter((x) => x.alvor !== "note").map((x) => lille(x.navn));
        return svar("kan_ikke_afgoeres", udfyld(TRIN["1"], { felter: liste(felter) }));
    }
    if (delta === null) return svar("kan_ikke_afgoeres", "Mindst én af kørslerne har ingen driftsomkostning.");
    // 2. Flere ændringer på én gang (eller ingen)
    if (p.diff.length === 0) return svar("kan_ikke_afgoeres", "De to kørsler har samme frosne input; forskellen er solverstøj.");
    if (p.flere) return svar("kan_ikke_afgoeres", udfyld(TRIN["2"], { antal: p.diff.length }));
    if (p.ukendt) {
        const f0 = feltInfo(p.diff[0].sti);
        return svar("kan_ikke_afgoeres", `Ændringen (${lille(f0.etiket)}${f0.objekt ? ` for ${f0.objekt}` : ""}) svarer ikke til en af knapperne, så appen kan ikke afgøre, om den er et tiltag eller en antagelse, og giver ingen anbefaling.`);
    }
    // 3. Tolerance ukendt
    if (T === null) return svar("kan_ikke_afgoeres", TRIN["3"]);
    // 4. Fortegnet kan ikke passe
    const f = forventetFortegn(p);
    if ((f === "≥0" && delta < -T) || (f === "≤0" && delta > T)) {
        const forklaring = `${KNAPPER[p.knap!]?.spoergsmaal ?? "knappen"} forventer ${(anb?.forventet_fortegn as string) ?? f}, men scenariet er ${krRund(delta)} ${delta < 0 ? "billigere" : "dyrere"}`;
        return svar("kan_ikke_afgoeres", udfyld(TRIN["4"], { forklaring }));
    }
    // Følsomheder og metoder får ingen beslutningskategori (anbefalingsregler.json → ikke_beslutning).
    if (type === "foelsomhed" || type === "metode") {
        const inden = Math.abs(delta) <= 2 * T || (V !== null && Math.abs(delta) <= V);
        return svar("foelsomhed", inden ? udfyld(TRIN["5"], { delta: krRund(delta), T: krRund(T), V: krRund(V ?? 0) }) : "En følsomhed eller et metodevalg — ikke noget værket selv beslutter.");
    }
    // 5. Inden for tolerance eller under væsentlighed
    if (Math.abs(delta) <= 2 * T || (V !== null && Math.abs(delta) <= V)) {
        return svar("kan_ikke_afgoeres", udfyld(TRIN["5"], { delta: krRund(delta), T: krRund(T), V: krRund(V ?? 0) }));
    }
    const nTekst = n === null ? "begge kørsler er løst til optimum" : n > 100 ? "mere end 100" : String(n);
    // 6. Forbehold, der nedgraderer begge retninger
    const begge = nedgrader.filter((x) => x.virkning === "nedgrader_begge");
    if (begge.length) return svar("undersoeg_naermere", begge.map((x) => x.tekst).join(" "));
    // 7. Dyrere
    if (delta > 0) return svar("fraraades", udfyld(TRIN["7"], { delta: krUdenEnhed(delta), n: nTekst }));
    // 8. Billigere med forbehold
    if (nedgrader.length) return svar("undersoeg_naermere", udfyld(TRIN["8"], { delta: krUdenEnhed(delta), forbehold: nedgrader.map((x) => x.tekst).join(" ") }));
    // 9. Anbefalet
    return svar("anbefalet", udfyld(TRIN["9"], { delta: krUdenEnhed(delta), n: nTekst }));
}

// ================================================================= historie (A2)

/** Sætning 1: hvad scenariet ændrer, i fagsprog. */
export function aendringsfraser(p: Par): string[] {
    const ud: string[] = [];
    const lagreFra: string[] = [];
    for (const d of p.diff) {
        const b = json(d.b), a = json(d.a);
        let m = /^units\.([^.]+)\.enabled$/.exec(d.sti);
        if (m) {
            const type = blad(p.ref, `units.${m[1]}.type`) as string | undefined;
            ud.push(`slår ${type && TYPENAVN[type] ? TYPENAVN[type][0] : "enheden"} ${m[1]} ${b === true ? "til" : "fra"}`);
            continue;
        }
        m = /^storage\.([^.]+)\.enabled$/.exec(d.sti);
        if (m && b === false) { lagreFra.push(m[1]); continue; }
        if (m) { ud.push(`slår lageret ${m[1]} til`); continue; }
        m = /^storage\.([^.]+)\.volume_m3$/.exec(d.sti);
        if (m) { ud.push(`ændrer ${m[1]} fra ${visJson(d.a)} til ${visJson(d.b)} m³`); continue; }
        const op = (x: unknown, y: unknown) => (Number(y) >= Number(x) ? "hæver" : "sænker");
        m = /^prices\.([^.]+)\.value$/.exec(d.sti);
        if (m && m[1] === "co2_eua") { ud.push(`${op(a, b)} CO₂-kvoteprisen fra ${visJson(d.a)} til ${visJson(d.b)} kr./t`); continue; }
        if (m) {
            const navn = lille(VISNINGSNAVNE.braendsel?.[m[1]] ?? m[1]);
            const pct = Number(a) ? `${Number(b) >= Number(a) ? "+" : "−"}${procentRund(((Number(b) - Number(a)) / Number(a)) * 100)}` : "";
            ud.push(`${op(a, b)} ${navn}prisen fra ${visJson(d.a)} til ${visJson(d.b)} kr./MWh${pct ? ` (${pct})` : ""}`);
            continue;
        }
        if (d.sti === "electricity.electricity_tax") { ud.push(`${op(a, b)} elafgiften fra ${visJson(d.a)} til ${visJson(d.b)} kr./MWh`); continue; }
        if (d.sti === `${KOERSEL_PRAEFIKS}med_balancering`) { ud.push(`slår balancemarkedet (aFRR og mFRR) ${b === true ? "til" : "fra"}`); continue; }
        if (d.sti === `${KOERSEL_PRAEFIKS}balancing_method`) { ud.push(`regner balanceindtægten med ${VISNINGSNAVNE.balancing_method?.[String(b)] ?? String(b)}`); continue; }
        if (d.sti === "balancing.activation.foresight") { ud.push(`lader modellen byde med ${VISNINGSNAVNE.foresight?.[String(b)] ?? String(b)}`); continue; }
        if (d.sti === "balancing.reservation_gate.enabled" && b === true) { ud.push("byder kun, når kapacitetsprisen er over budprisen"); continue; }
        if (d.sti === "balancing.ancillary_caps.total_mw") { ud.push(`${op(a, b)} den samlede prækvalifikation fra ${visJson(d.a)} til ${visJson(d.b)} MW`); continue; }
        if (d.sti === "data.dmi_area") { ud.push(`bruger vejret fra ${visJson(d.b)} i stedet for ${visJson(d.a)}`); continue; }
        if (d.sti === `${KOERSEL_PRAEFIKS}heat_csv`) { ud.push(`bruger målt varmelast (${visJson(d.b)}) i stedet for syntesen`); continue; }
        if (d.sti === `${KOERSEL_PRAEFIKS}tidsserie.varmelast`) {
            const navne = p.scen.tidsserienavne ?? p.ref.tidsserienavne;
            const serie = (j: string | undefined) => {
                const v = json(j) as { id?: string; sha256?: string } | undefined;
                const navn = v?.id ? navne?.get(v.id) : undefined;
                return `${navn ? `'${navn}'` : "tidsserie"} (sha256 ${v?.sha256?.slice(0, 12) ?? "ukendt"})`;
            };
            if (d.a === undefined) ud.push(`bruger den målte varmelast ${serie(d.b)} i stedet for syntesen`);
            else if (d.b === undefined) ud.push(`bruger syntesen i stedet for den målte varmelast ${serie(d.a)}`);
            else ud.push(`bruger den målte varmelast ${serie(d.b)} i stedet for ${serie(d.a)}`);
            continue;
        }
        const fi = feltInfo(d.sti);
        const enhed = fi.enhed ? ` ${fi.enhed.replace(/^DKK/, "kr.")}` : "";
        ud.push(`ændrer ${lille(fi.etiket)}${fi.objekt ? ` for ${fi.objekt}` : ""} fra ${visJson(d.a)} til ${visJson(d.b)}${enhed}`);
    }
    if (lagreFra.length) {
        const alle = [...effektivtInput(p.ref.input).blade.entries()].filter(([s, x]) => /^storage\.[^.]+\.enabled$/.test(s) && x.vaerdi_json === "true").length;
        ud.unshift(lagreFra.length === alle ? (alle === 1 ? "slår tanken fra" : alle === 2 ? "slår begge tanke fra" : `slår alle ${alle} lagre fra`)
            : lagreFra.length === 1 ? `slår lageret ${lagreFra[0]} fra` : `slår lagrene ${liste(lagreFra)} fra`);
    }
    return ud;
}

/** Sætning 2: de vigtigste konsekvenser (højst to) + omkostningen til sidst. */
export function konsekvenser(p: Par, delta: number): string[] {
    const { ref, scen } = p;
    const ud: string[] = [];
    const behov = ref.samlet.varmebehov_mwh ?? 0;
    const v = produktionsvarians(ref.samlet.enheder, scen.samlet.enheder).filter(kendtDelta);   // ukendt Δ siges ikke (Codex K9 F1)
    const op = [...v].sort((x, y) => y.delta - x.delta)[0], ned = [...v].sort((x, y) => x.delta - y.delta)[0];
    let flytVæsentlig = false;
    if (op && ned && op.delta > 0 && ned.delta < 0) {
        const E = Math.min(op.delta, -ned.delta);
        if (E >= Math.max(10, 0.01 * behov)) { ud.push(`flytter ${energiRund(E)} fra ${ned.navn} til ${op.navn}`); flytVæsentlig = true; }
    } else {
        const en = op && op.delta > 0 ? op : ned && ned.delta < 0 ? ned : null;
        if (en && Math.abs(en.delta) >= Math.max(10, 0.01 * behov)) { ud.push(`${en.delta > 0 ? "øger" : "sænker"} ${en.navn}s produktion med ${energiRund(en.delta)}`); flytVæsentlig = true; }
    }
    const ba = ref.samlet.balance, bb = scen.samlet.balance;
    if ((ba || bb) && ud.length < 2) {
        const dn = (bb?.i_alt.netto ?? 0) - (ba?.i_alt.netto ?? 0);
        if (Math.abs(dn) >= Math.max(10_000, 0.05 * Math.abs(delta))) {
            const da = (bb?.afrr.netto ?? 0) - (ba?.afrr.netto ?? 0), dm = (bb?.mfrr.netto ?? 0) - (ba?.mfrr.netto ?? 0);
            const marked = Math.sign(da) === Math.sign(dn) && Math.sign(dm) === Math.sign(dn)
                ? `aFRR ${krRund(da)}, mFRR ${krRund(dm)}`
                : `aFRR ${da >= 0 ? "op" : "ned"} ${krRund(da)}, mFRR ${dm >= 0 ? "op" : "ned"} ${krRund(dm)}`;
            ud.push(`${dn > 0 ? "øger" : "sænker"} balanceindtægten (netto) med ${krRund(dn)} (${marked})`);
        }
    }
    const ca = ref.samlet.co2_ton, cb = scen.samlet.co2_ton;
    if (ud.length < 2 && ca != null && cb != null && Math.abs(cb - ca) >= Math.max(1, 0.01 * Math.abs(ca))) {
        ud.push(`${cb > ca ? "øger" : "sænker"} CO₂-udledningen med ${tal(Math.abs(cb - ca))} t`);
    }
    const ea = ref.samlet.el_forbrug_mwh, eb = scen.samlet.el_forbrug_mwh;
    if (ud.length < 2 && !flytVæsentlig && ea != null && eb != null && Math.abs(eb - ea) >= Math.max(10, 0.05 * Math.abs(ea))) {
        ud.push(`${eb > ea ? "øger" : "sænker"} elforbruget med ${energiRund(eb - ea)}`);
    }
    const periode = periodeTekst(scen.profil.periode_start, scen.profil.periode_slut);
    ud.push(krNul(delta)
        ? `ændrer ikke driftsomkostningen i perioden (${periode})${delta === 0 ? "" : " — forskellen er under 100 kr."}`
        : `gør driften ${krRund(delta)} ${delta < 0 ? "billigere" : "dyrere"} i perioden (${periode})`);
    return ud;
}

/** De 2–3 sætninger, der fortæller scenariet (A2). */
export function historie(p: Par, v: Vurdering): string {
    const fraser = aendringsfraser(p);
    const vis = fraser.length > 3 ? [...fraser.slice(0, 3), `og ${fraser.length - 3} andre ændringer`] : fraser;
    // Ledstilling: "I dette scenarie slår VI tankene fra …" — subjektet efter første verbum.
    const medVi = (s: string) => s.replace(/^(\S+)/, "$1 vi");
    const s1 = fraser.length
        ? `I dette scenarie ${medVi(fraser.length > 3 ? `${vis.slice(0, 3).join(", ")} ${vis[3]}` : liste(vis))} — ellers som ${p.ref.navn}.`
        : `Scenariet har samme input som ${p.ref.navn}.`;
    if (v.delta === null) return s1;
    const s2 = `Det ${liste(konsekvenser(p, v.delta))}.`;
    const nT = v.tolerance === 0 ? "Begge kørsler er løst til optimum" : v.n !== null && v.n > 100 ? "Forskellen er mere end 100 gange solverens tolerance" : v.n !== null && v.n >= 2 ? `Forskellen er ${v.n} gange solverens tolerance` : null;
    const første = v.naesteSkridt[0] ? lille(v.naesteSkridt[0]) : "";
    let s3: string;
    switch (v.kategori) {
        case "anbefalet": s3 = `${nT ?? "Forskellen er reel"} — den er reel. Anbefaling: gennemfør${første ? `, og ${første}` : ""}.`; break;
        case "fraraades": s3 = `${nT ?? "Forskellen er reel"} — den er reel. ${v.saetning}`; break;
        case "undersoeg_naermere": s3 = `${nT ?? "Forskellen er tydelig"}, men ${lille(v.forbehold[0]?.tekst ?? v.begrundelse).replace(/\.$/, "")}. Næste skridt: ${første}.`; break;
        case "foelsomhed": s3 = `${nT ? `${nT}. ` : ""}Det er en følsomhed, ikke en beslutning værket træffer.`; break;
        default: s3 = v.begrundelse;
    }
    return [s1, s2, s3].map((x) => x.trim()).join(" ").replace(/\.\./g, ".");
}

// ================================================================= alle par (#/analyser/anbefalinger)

/**
 * Reference/scenarie-par for anbefalingssiden: for hvert scenarie den seneste
 * færdige kørsel (b), parret med en direkte sammenlignelig kørsel (a), hvor b
 * BÆRER forskellen, og forskellen er én knap. Foretrukket reference:
 * scenariets `reference_scenarie_id`, så den med færrest egne ændringer
 * (værket som det er), så den nyeste. Scenarier uden en sådan reference (fx
 * referencerne selv) får intet par.
 */
export function findPar(sider: readonly Side[], referenceScenarie: (scenarieId: string) => string | null | undefined = () => null): Par[] {
    const seneste = new Map<string, Side>();
    for (const s of sider.filter((x) => x.k.status === "faerdig")) {
        const før = seneste.get(s.k.scenarie_id);
        if (!før || modtaget(s.k).getTime() > modtaget(før.k).getTime()) seneste.set(s.k.scenarie_id, s);
    }
    const kørsler = [...seneste.values()];
    const egne = (s: Side) => aendringsResume(s.input.filter((x) => x.kilde !== "vaerk")).length;
    const ud: Par[] = [];
    for (const b of kørsler) {
        const ref = referenceScenarie(b.k.scenarie_id);
        const kandidater = kørsler
            .filter((a) => a.k.id !== b.k.id && sammenlignelighedStatus(sammenlignelighed(a.profil, b.profil)) === "ja")
            .map((a) => ({ a, p: ordnPar(a, b) }))
            .filter(({ p }) => !p.byttet && p.diff.length > 0 && !p.flere)
            .sort((x, y) => Number(y.a.k.scenarie_id === ref) - Number(x.a.k.scenarie_id === ref)
                || egne(x.a) - egne(y.a) || modtaget(y.a.k).getTime() - modtaget(x.a.k).getTime());
        if (kandidater[0]) ud.push(kandidater[0].p);
    }
    return ud;
}

const KATEGORI_ORDEN: Record<Kategori, number> = { anbefalet: 0, undersoeg_naermere: 1, fraraades: 2, foelsomhed: 3, kan_ikke_afgoeres: 4 };

/** Sortering "efter værdi": kategori (anbefalet først), så største besparelse først. */
export function sorterAnbefalinger<T extends { v: Vurdering }>(xs: readonly T[]): T[] {
    return [...xs].sort((x, y) => KATEGORI_ORDEN[x.v.kategori] - KATEGORI_ORDEN[y.v.kategori] || (x.v.delta ?? 0) - (y.v.delta ?? 0));
}

