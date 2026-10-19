//-----------------------------------------------------------------------
// "Hvordan er analyserne sammensat?" (brief 17) — rene funktioner, testet i
// sammensaetning.spec.ts på de rigtige fixtures (D01–D12, F5, røgtests).
//
// En kørsel = værk + scenariets ændringer + periode + indstillinger. Hver række
// i kørselslisten får det i klartekst: hvilket spørgsmål den besvarer, hvad
// den ændrer ift. værket, dens rolle (reference / scenarie / gentagelse /
// enkeltkørsel), hvor den kommer fra (README-reference, demo, app, notebook,
// røgtest), periodens længde, markeder og varmelast — og som scenarie Δ mod
// sin reference og anbefalingens kategori.
//
// Parrene er anbefalingernes (`findPar` → `ordnPar` → `vurder`), så listen og
// #/analyser/anbefalinger aldrig er uenige. Grupperne er "familier": alle
// kørsler forbundet af par (fx Andeby vinter: reference → scenarier → kørslen
// med balancemarked, der selv er reference for to scenarier), i træets
// rækkefølge. Røgtests parres ikke og står for sig.
//-----------------------------------------------------------------------

import { effektivtInput, KOERSEL_PRAEFIKS, type InputRække } from "@/lib/data/afflad";
import { tal } from "@/lib/format";
import { harReferencensOpsaetning, kørslensGab, laesReferencer, type Reference } from "../information/referencer";
import { KOERSEL_STATUSSER } from "../../../rayfin/data/fjv.constants";
import { aendringsfraser, doegn, findPar, vurder, type Kategori, type Par, type Side, type Vurdering } from "./anbefaling";
import { KNAPPER } from "./anbefaling.data";
import { modtaget, spor, type Koersel, type Scenarie } from "./beregn";
import { varmelastKilde, type Tidsserienavne } from "./datagrundlag";
import { periodeTekst } from "./fmt";
import { aendringsResume } from "./kandidater";
import { DEMO_KOERSLER, DEMO_PAR, README_PINS, README_REFERENCER_JSON } from "./sammensaetning.data";

// ================================================================= oprindelse

export type OprindelseType = "readme" | "demo" | "app" | "notebook" | "roegtest";

export const OPRINDELSE_ETIKET: Readonly<Record<OprindelseType, string>> = {
    readme: "README-reference", demo: "Demo", app: "Bestilt i appen", notebook: "Kørt i notebook", roegtest: "Røgtest",
};

export interface Oprindelse {
    type: OprindelseType;
    etiket: string;
    /** Kort uddybning: README-tallet, demo-id'et eller hvorfor det er en røgtest. */
    detalje: string | null;
    /** Demo-id (D01 …) når scenariet er en af demo-kørslerne — også for en README-reference. */
    demoId: string | null;
    readme: Reference | null;
}

let _refs: Reference[] | null = null;
/** README's referencetal (viden/referencetal.json → readme), læst med fv-doku's regel. */
export function readmeReferencer(): Reference[] {
    return (_refs ??= laesReferencer(README_REFERENCER_JSON));
}

/** Demo-id ud fra scenariets navn og værk (demo_scenarier.json). Navnet — ikke kørsels-id'et — så også en fejlet/gentaget demo-kørsel genkendes. */
export function demoId(navn: string | null | undefined, vaerkKode: string): string | null {
    if (!navn) return null;
    return DEMO_KOERSLER.find((d) => d.navn === navn && d.vaerk_kode === vaerkKode)?.id ?? null;
}

/**
 * De kendte TEKNISKE testkørsler — snævert, efter præfiks (Codex K5-F10): et brugernavn som "Pristest
 * naturgas" eller "Test af ny tank" er en analyse. `probe-`/`probe_`/`probe ` er scripts/probe.mjs'
 * præfiks (app/AGENTS.md), `Test K<n>` Codex-reviewenes egne testkørsler.
 */
const TESTNAVN = /^(probe[-_ ]|test k\d+\b)/i;
/** Kontrolkørsler fra opsætningen (fv-fabrics trin F1–F5), der ikke genskaber et README-tal. */
const KONTROLNAVN = /^F\d+\s/;

/** Det, README-genkendelsen behøver om værket (Vaerk-rækken). */
export interface VaerkKilde { kilde: string; repo_commit?: string | null }

/**
 * Scenariefelterne, som kørslen FAKTISK fik dem (det frosne input, Codex K5-F9) — ikke det levende
 * scenarie, som kan være rettet bagefter. Formen er `Scenarie`s, så fv-doku's regel kan bruges uændret.
 */
export function frossenOpsaetning(input: readonly InputRække[]): Scenarie {
    const e = effektivtInput(input);
    const flag = (n: string): unknown => { const j = e.flag.get(n); if (j === undefined) return null; try { return JSON.parse(j); } catch { return j; } };
    const str = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? v.join(" ") : null);
    const num = (sti: string) => { const r = input.find((x) => x.kilde !== "vaerk" && x.sti === sti); const v = r ? Number(JSON.parse(r.vaerdi_json)) : NaN; return Number.isFinite(v) ? v : null; };
    return {
        periode_start: str(flag("start")), periode_slut: str(flag("slut")), med_balancering: flag("med_balancering") === true,
        balancing_method: str(flag("balancing_method")), ekstra_flag: str(flag("ekstra_flag")), heat_csv: str(flag("heat_csv")),
        mip_rel_gap: num("solver.mip_rel_gap"), mip_abs_gap: num("solver.mip_abs_gap"), tidsgraense_s: num("solver.time_limit"),
    } as Scenarie;
}

/**
 * README-mærket kræver mere end ens scenariefelter (Codex K5-F9): værket skal være repo-casen uændret
 * (kilde `repo`, revision 1, importeret ved referencetallenes modelcommit), kørslen skal have samme
 * modelcommit og en df-data-commit, hvis dato er målt og ligger efter README's datakrav.
 */
export function readmePins(k: Koersel, input: readonly InputRække[], vaerk: VaerkKilde | undefined): boolean {
    const pin = (navn: "model_commit" | "data_commit") => (k[navn] ?? (() => { try { const r = input.find((x) => x.sti === `${KOERSEL_PRAEFIKS}${navn}`); return r ? JSON.parse(r.vaerdi_json) as string : null; } catch { return null; } })())?.toLowerCase() ?? null;
    const data = pin("data_commit");
    const dato = data ? README_PINS.df_data_kendt[data] : undefined;
    return !!vaerk && vaerk.kilde === "repo" && vaerk.repo_commit?.toLowerCase() === README_PINS.model_commit && k.vaerk_revision === 1
        && pin("model_commit") === README_PINS.model_commit && !!dato && dato >= README_PINS.df_data_fra;
}

/**
 * Hvor kørslen kommer fra, i den rækkefølge reglerne vinder:
 * 1. En kendt teknisk testkørsel (probe-, Test K<n>) → Røgtest.
 * 2. Samme værk og FROSNE opsætning som et README-referencetal, ingen ændringer, samme eller strammere gab
 *    (information/referencer.ts' regel) og verificerede pins (`readmePins`) → README-reference med tallet.
 * 3. En af demo-kørslerne (demo_scenarier.json) → Demo.
 * 4. En kontrolkørsel fra opsætningen (F1–F5) → Røgtest.
 * 5. Ellers kørselsvejen: app eller notebook.
 * `vaerk` mangler → README kan ikke verificeres og gives ikke.
 */
export function oprindelse(k: Koersel, scenarie: Scenarie | null, vaerkKode: string, input: readonly InputRække[], vaerk?: VaerkKilde): Oprindelse {
    const navn = scenarie?.navn ?? "";
    const demo = demoId(navn, vaerkKode);
    const svar = (type: OprindelseType, detalje: string | null, readme: Reference | null = null): Oprindelse =>
        ({ type, etiket: OPRINDELSE_ETIKET[type], detalje, demoId: demo, readme });
    if (TESTNAVN.test(navn)) return svar("roegtest", "test af kørselsvejen — ikke en analyse");
    // En kontrolkørsel, der ikke blev færdig (fx F3's annulleringstest af Spor A-opsætningen), genskaber intet tal.
    if (KONTROLNAVN.test(navn) && k.status !== "faerdig") return svar("roegtest", "kontrolkørsel fra opsætningen — ikke en analyse");
    const ændret = input.some((r) => r.kilde === "aendring");
    if (!ændret && readmePins(k, input, vaerk)) {
        const frossen = frossenOpsaetning(input);
        const r = readmeReferencer().find((x) => x.kode === vaerkKode && harReferencensOpsaetning(frossen, x) && kørslensGab(k, frossen, x).erTilladt);
        if (r) return svar("readme", `README ${tal(r.objektiv)} kr.${demo ? ` · ${demo}` : ""}`, r);
    }
    if (demo) return svar("demo", demo);
    if (KONTROLNAVN.test(navn)) return svar("roegtest", "kontrolkørsel fra opsætningen — ikke en analyse");
    return k.kilde === "app" ? svar("app", null) : svar("notebook", null);
}

// ================================================================= indstillinger i klartekst

/** "12 døgn", "121 døgn", "helår" — periodens længde af den præcise periode. */
export function periodeLaengde(s: Side): string | null {
    const d = doegn(s.profil);
    if (d === null) return null;
    if (d >= 364) return "helår";
    return `${Math.round(d)} døgn`;
}

export interface Markeder { tekst: string; spor: "A" | "B" | null; medBal: boolean | null }

/** "Kun spot" / "Spot + aFRR/mFRR" med Spor A/B (læst af det frosne input). */
export function markeder(s: Side): Markeder {
    const medBal = s.profil.med_balancering;
    if (medBal === null) return { tekst: "–", spor: null, medBal };
    if (!medBal) return { tekst: "Kun spot", spor: null, medBal };
    return { tekst: "Spot + aFRR/mFRR", spor: spor(s.input), medBal };
}

export interface Varmelast { maalt: boolean; tekst: string; /** Tidsseriens navn eller repo-filen. */ navn: string | null; sha256: string | null }

/**
 * Målt eller syntetisk, med navnet (brief 18): en frosset tidsserie (`_koersel.tidsserie.varmelast`, navnet
 * slået op på id) vinder over repo-filen (`_koersel.heat_csv`). KUN det frosne input afgør det (Codex K5-F9):
 * intet frosset filvalg betyder syntetisk — det levende scenaries heat_csv kan være rettet efter kørslen.
 */
export function varmelast(s: Side, navne: Tidsserienavne = new Map()): Varmelast {
    return varmelastKilde(s.input, frossenOpsaetning(s.input).heat_csv ?? null, navne);
}

/**
 * Kørslens egne ændringer ift. værket (kandidatlistens resume, uden varmelasten,
 * der har sin egen kolonne). Balancemarked og periode er indstillinger, ikke ændringer.
 */
export function vaerksaendringer(input: readonly InputRække[]): string[] {
    return aendringsResume(input.filter((r) => r.kilde !== "vaerk")).filter((x) => !x.startsWith("Målt varmelast"));
}

const stort = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "44.220 kr. dyrere" / "133.801 kr. billigere" / "samme driftsomkostning" (scenarie − reference). */
export function deltaOrd(delta: number | null): string | null {
    if (delta === null) return null;
    const b = tal(Math.abs(delta));
    if (b === "0") return "samme driftsomkostning";
    return `${b} kr. ${delta > 0 ? "dyrere" : "billigere"}`;
}

// ================================================================= rækker og grupper

export type RolleType = "reference" | "scenarie" | "gentagelse" | "enkelt";

export interface Rolle {
    type: RolleType;
    tekst: string;
    /** Referencens navn (scenarie) — eller den primære kørsel (gentagelse). */
    mod: string | null;
    /** Kørsels-id for `mod`. */
    modId: string | null;
    /** Antal scenarier, kørslen selv er reference for. */
    referenceFor: number;
}

export interface ListeRaekke {
    side: Side;
    k: Koersel;
    scenarie: Scenarie | null;
    vaerkKode: string;
    /** Spørgsmålet, kørslen besvarer (demo-parrets eller knappens), null for en ren reference. */
    spoergsmaal: string | null;
    aendringer: string;
    rolle: Rolle;
    oprindelse: Oprindelse;
    periode: { laengde: string | null; datoer: string; doegn: number | null };
    markeder: Markeder;
    varmelast: Varmelast;
    /** Scenarie − reference (kun for scenarier i et par). */
    delta: number | null;
    vurdering: Vurdering | null;
    /** Gruppens nøgle og rækkens plads i gruppens træ (0 = roden). */
    gruppe: string;
    plads: number;
    dybde: number;
}

export type GruppeType = "par" | "uden_par" | "roegtest";

export interface Gruppe {
    noegle: string;
    type: GruppeType;
    titel: string;
    undertitel: string;
    raekker: ListeRaekke[];
}

export interface ListeGrundlag {
    sider: readonly Side[];
    scenarier: ReadonlyMap<string, Scenarie>;
    koder: ReadonlyMap<string, string>;
    bekraeft: ReadonlyMap<string, ReadonlySet<string>>;
    /** Tidsseriernes navne pr. id (brief 18); mangler et navn, vises det frosne sha256. */
    tidsserienavne?: Tidsserienavne;
    /** Værkernes kilde og repo-commit pr. id (Codex K5-F9: README-mærket verificeres mod dem). */
    vaerker?: ReadonlyMap<string, VaerkKilde>;
}

const id = (s: Side) => s.k.id;

/**
 * Kørsler, der må danne reference/scenarie-par: ikke røgtests, og ikke kørsler af et ARKIVERET
 * scenarie (fv-app 12:05: arkivering skal fjerne et testpar, ellers parres fx 12 arkiverede
 * testkørsler med hinanden). Bruges af både kørselslisten og #/analyser/anbefalinger.
 */
export function parbare(sider: readonly Side[], scenarier: ReadonlyMap<string, Scenarie>, koder: ReadonlyMap<string, string>,
    vaerker?: ReadonlyMap<string, VaerkKilde>): Side[] {
    return sider.filter((s) => {
        const sc = scenarier.get(s.k.scenarie_id) ?? null;
        return !sc?.arkiveret && oprindelse(s.k, sc, koder.get(s.k.vaerk_id) ?? "", s.input, vaerker?.get(s.k.vaerk_id)).type !== "roegtest";
    });
}
const nyest = (a: Side, b: Side) => modtaget(b.k).getTime() - modtaget(a.k).getTime();
const ældst = (a: Side, b: Side) => -nyest(a, b);

/** Demo-parrets spørgsmål, hvis reference og scenarie er et demo-par; ellers knappens. */
function parSpoergsmaal(p: Par, demoRef: string | null, demoScen: string | null): string | null {
    const demo = DEMO_PAR.find((x) => x.reference === demoRef && x.scenarie === demoScen);
    if (demo) return demo.spoergsmaal;
    if (p.knap) return KNAPPER[p.knap]?.spoergsmaal ?? null;
    if (p.flere) return "Flere ændringer på én gang";
    return null;
}

/**
 * Alle kørsler som listerækker med sammensætning, rolle og gruppe.
 * `visRoegtest = false` udelader røgtests helt (standard i listen).
 */
export function listeRaekker(g: ListeGrundlag, visRoegtest = false): ListeRaekke[] {
    const kode = (s: Side) => g.koder.get(s.k.vaerk_id) ?? "";
    const scen = (s: Side) => g.scenarier.get(s.k.scenarie_id) ?? null;
    const opr = new Map(g.sider.map((s) => [id(s), oprindelse(s.k, scen(s), kode(s), s.input, g.vaerker?.get(s.k.vaerk_id))]));
    const ægte = g.sider.filter((s) => opr.get(id(s))!.type !== "roegtest");

    // Parrene — præcis anbefalingssidens (uden røgtests og arkiverede scenarier).
    const par = findPar(parbare(g.sider, g.scenarier, g.koder, g.vaerker), (sid) => g.scenarier.get(sid)?.reference_scenarie_id ?? null);
    const somScen = new Map(par.map((p) => [id(p.scen), p]));
    const somRef = new Map<string, Par[]>();
    for (const p of par) somRef.set(id(p.ref), [...(somRef.get(id(p.ref)) ?? []), p]);

    // "Samme scenarie" = samme værk og samme scenarienavn: et scenarie, der er arkiveret og oprettet igen (fx et
    // fejlet helårsforsøg), er stadig samme spørgsmål. Primær kørsel: den parrede, ellers den nyeste færdige, ellers
    // den nyeste. De andre er gentagelser af den.
    const sNøgle = (s: Side) => `${s.k.vaerk_id}|${scen(s)?.navn ?? s.k.scenarie_id}`;
    const prScenarie = new Map<string, Side[]>();
    for (const s of ægte) prScenarie.set(sNøgle(s), [...(prScenarie.get(sNøgle(s)) ?? []), s]);
    const primærPrNøgle = new Map<string, Side>();
    for (const [n, xs] of prScenarie) {
        const sorteret = [...xs].sort(nyest);
        primærPrNøgle.set(n, xs.find((x) => somScen.has(id(x)) || somRef.has(id(x))) ?? sorteret.find((x) => x.k.status === "faerdig") ?? sorteret[0]);
    }
    const primær = new Map<string, Side>();
    for (const s of ægte) primær.set(s.k.scenarie_id, primærPrNøgle.get(sNøgle(s))!);

    // Scenarier uden par, der er oprettet med en reference (reference_scenarie_id), hænges på referencens primære kørsel.
    const forældre = new Map<string, Side>();
    for (const p of par) forældre.set(id(p.scen), p.ref);
    for (const s of primærPrNøgle.values()) {
        if (forældre.has(id(s)) || somRef.has(id(s))) continue;
        const ref = scen(s)?.reference_scenarie_id;
        const r = ref ? primær.get(ref) : undefined;
        if (r && r !== s) forældre.set(id(s), r);
    }

    // Familier: træer af forælder → børn, i bestillingsrækkefølge.
    const børn = new Map<string, Side[]>();
    for (const [barn, far] of forældre) {
        const s = ægte.find((x) => id(x) === barn)!;
        børn.set(id(far), [...(børn.get(id(far)) ?? []), s]);
    }
    for (const xs of børn.values()) xs.sort(ældst);
    const plads = new Map<string, { gruppe: string; plads: number; dybde: number }>();
    const rødder = [...primærPrNøgle.values()].filter((s) => !forældre.has(id(s)) && børn.has(id(s))).sort(ældst);
    for (const rod of rødder) {
        let i = 0;
        const besøg = (s: Side, dybde: number) => {
            if (plads.has(id(s))) return;
            plads.set(id(s), { gruppe: id(rod), plads: i++, dybde });
            for (const gentagelse of (prScenarie.get(sNøgle(s)) ?? []).filter((x) => x !== s).sort(ældst)) {
                plads.set(id(gentagelse), { gruppe: id(rod), plads: i++, dybde });
            }
            for (const b of børn.get(id(s)) ?? []) besøg(b, dybde + 1);
        };
        besøg(rod, 0);
    }

    const ud: ListeRaekke[] = [];
    for (const s of g.sider) {
        const o = opr.get(id(s))!;
        if (o.type === "roegtest" && !visRoegtest) continue;
        const sc = scen(s);
        const p = somScen.get(id(s)) ?? null;
        const prim = o.type === "roegtest" ? s : primær.get(s.k.scenarie_id) ?? s;
        const erGentagelse = prim !== s;
        const egenP = erGentagelse ? somScen.get(id(prim)) ?? null : p;
        const refFor = somRef.get(id(prim))?.length ?? 0;
        const far = forældre.get(id(prim)) ?? null;
        const farNavn = far ? scen(far)?.navn ?? far.navn : null;

        let rolle: Rolle;
        if (erGentagelse) rolle = { type: "gentagelse", tekst: "Gentagelse af samme scenarie", mod: prim.navn, modId: id(prim), referenceFor: 0 };
        else if (far) rolle = {
            type: "scenarie", mod: farNavn, modId: id(far), referenceFor: refFor,
            tekst: `Scenarie mod «${farNavn}»${p ? "" : " (ikke parret endnu)"}${refFor ? ` · selv reference for ${refFor}` : ""}`,
        };
        else if (refFor) rolle = { type: "reference", tekst: `Reference for ${refFor} ${refFor === 1 ? "scenarie" : "scenarier"}`, mod: null, modId: null, referenceFor: refFor };
        else rolle = { type: "enkelt", tekst: sc?.arkiveret ? "Enkeltkørsel (scenariet er arkiveret)" : "Enkeltkørsel", mod: null, modId: null, referenceFor: 0 };

        const egne = vaerksaendringer(s.input);
        let aendringer: string;
        if (egne.length) aendringer = egne.join(" · ");
        // Markedet står i sin egen kolonne; her kun hvad scenariet slår til/fra ("slår balancemarkedet til").
        else if (egenP && egenP.diff.length) aendringer = `Ingen i værket — ${aendringsfraser(egenP).map((x) => x.replace(" (aFRR og mFRR)", "")).join(", ")}`;
        else aendringer = rolle.type === "reference" || o.type === "readme" ? "Ingen — reference" : "Ingen — værket som det er";

        const demoRef = egenP ? opr.get(id(egenP.ref))?.demoId ?? null : null;
        const spoergsmaal = egenP ? parSpoergsmaal(egenP, demoRef, o.demoId)
            : o.readme ? `Genskaber README-tallet for ${o.readme.navn}` : null;
        const vurdering = p ? vurder(p, g.bekraeft.get(s.k.vaerk_id) ?? new Set()) : null;
        const pl = o.type === "roegtest" ? null : plads.get(id(s));
        ud.push({
            side: s, k: s.k, scenarie: sc, vaerkKode: kode(s), spoergsmaal: spoergsmaal ? stort(spoergsmaal) : null, aendringer, rolle, oprindelse: o,
            periode: { laengde: periodeLaengde(s), datoer: periodeTekst(s.profil.periode_start, s.profil.periode_slut), doegn: doegn(s.profil) },
            markeder: markeder(s), varmelast: varmelast(s, g.tidsserienavne),
            delta: vurdering?.delta ?? null, vurdering,
            gruppe: o.type === "roegtest" ? "roegtest" : pl?.gruppe ?? "uden_par",
            plads: pl?.plads ?? 0, dybde: pl?.dybde ?? 0,
        });
    }
    return ud;
}

const STATUS_ORDEN = new Map<string, number>(KOERSEL_STATUSSER.map((s, i) => [s, i]));
const KATEGORI_ORDEN: Record<Kategori, number> = { anbefalet: 0, undersoeg_naermere: 1, fraraades: 2, foelsomhed: 3, kan_ikke_afgoeres: 4 };
const ROLLE_ORDEN: Record<RolleType, number> = { reference: 0, scenarie: 1, gentagelse: 2, enkelt: 3 };
const OPRINDELSE_ORDEN: Record<OprindelseType, number> = { readme: 0, demo: 1, app: 2, notebook: 3, roegtest: 4 };

/** Grupper i standardrækkefølge: familier efter seneste aktivitet, så kørsler uden par, røgtests sidst. */
export function grupper(rækker: readonly ListeRaekke[]): Gruppe[] {
    const pr = new Map<string, ListeRaekke[]>();
    for (const r of rækker) pr.set(r.gruppe, [...(pr.get(r.gruppe) ?? []), r]);
    const ud: Gruppe[] = [];
    for (const [noegle, xs] of pr) {
        if (noegle === "uden_par") {
            const sorteret = [...xs].sort((a, b) => (a.scenarie?.navn ?? "").localeCompare(b.scenarie?.navn ?? "", "da") || modtaget(b.k).getTime() - modtaget(a.k).getTime());
            ud.push({ noegle, type: "uden_par", titel: "Kørsler uden sammenligningspar", undertitel: `${xs.length} ${xs.length === 1 ? "kørsel" : "kørsler"} uden en sammenlignelig reference eller et scenarie`, raekker: sorteret });
            continue;
        }
        if (noegle === "roegtest") {
            ud.push({ noegle, type: "roegtest", titel: "Røgtests og testkørsler", undertitel: `${xs.length} kørsler, der tester kørselsvejen — ikke analyser`, raekker: [...xs].sort((a, b) => modtaget(b.k).getTime() - modtaget(a.k).getTime()) });
            continue;
        }
        const træ = [...xs].sort((a, b) => a.plads - b.plads);
        const rod = træ[0];
        const scenarier = træ.filter((x) => x.rolle.type === "scenarie").length;
        const spørgsmål = new Set(træ.map((x) => x.spoergsmaal).filter((x) => x && x !== rod.spoergsmaal)).size;
        ud.push({
            noegle, type: "par", titel: rod.scenarie?.navn ?? rod.side.navn,
            undertitel: [rod.side.vaerkNavn, rod.periode.laengde ? `${rod.periode.datoer} (${rod.periode.laengde})` : rod.periode.datoer,
                `${scenarier} ${scenarier === 1 ? "scenarie" : "scenarier"}`, spørgsmål ? `${spørgsmål} ${spørgsmål === 1 ? "spørgsmål" : "spørgsmål"}` : ""].filter(Boolean).join(" · "),
            raekker: træ,
        });
    }
    const senest = (g: Gruppe) => Math.max(...g.raekker.map((r) => modtaget(r.k).getTime()));
    const sidst: Record<GruppeType, number> = { par: 0, uden_par: 1, roegtest: 2 };
    return ud.sort((a, b) => sidst[a.type] - sidst[b.type] || senest(b) - senest(a));
}

// ================================================================= sortering

export type SortNoegle = readonly (string | number | null)[];

/** Sorteringsnøgler pr. kolonne-id. "spoergsmaal" samler en families kørsler i træets rækkefølge (reference, scenarier, gentagelser). */
export function sortNoegle(kolonne: string, r: ListeRaekke, gruppeTitel: (r: ListeRaekke) => string): SortNoegle {
    const t = modtaget(r.k).getTime();
    switch (kolonne) {
        case "spoergsmaal": return r.gruppe === "uden_par" || r.gruppe === "roegtest"
            ? [r.gruppe === "roegtest" ? 2 : 1, r.scenarie?.navn ?? "", t]
            : [0, gruppeTitel(r), r.gruppe, r.plads];
        case "aendringer": return [r.aendringer];
        case "rolle": return [ROLLE_ORDEN[r.rolle.type], r.rolle.tekst];
        case "oprindelse": return [OPRINDELSE_ORDEN[r.oprindelse.type], r.oprindelse.detalje ?? ""];
        case "periode": return [r.periode.doegn, r.periode.datoer];
        case "markeder": return [r.markeder.medBal === null ? null : r.markeder.medBal ? 1 : 0, r.markeder.spor ?? ""];
        case "varmelast": return [r.varmelast.maalt ? 1 : 0, r.varmelast.navn ?? ""];
        case "objektiv": return [r.k.objektiv_dkk ?? null];
        case "delta": return [r.delta];
        case "anbefaling": return [r.vurdering ? KATEGORI_ORDEN[r.vurdering.kategori] : null, r.delta];
        case "status": return [STATUS_ORDEN.get(r.k.status) ?? 99];
        case "vaerk": return [r.side.vaerkNavn];
        case "modtaget": return [t];
        case "gab": return [r.k.opnaaet_gap ?? null];
        case "varighed": return [r.k.startet && r.k.afsluttet ? new Date(r.k.afsluttet).getTime() - new Date(r.k.startet).getTime() : null];
        case "bestilt_af": return [r.k.bestilt_af ?? ""];
        default: return [t];
    }
}

/** Sammenligner to nøgler; manglende værdier (null) står altid sidst, uanset retning. */
export function sammenlignNoegler(a: SortNoegle, b: SortNoegle, retning: 1 | -1): number {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] ?? null, y = b[i] ?? null;
        if (x === y) continue;
        if (x === null) return 1;
        if (y === null) return -1;
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "da");
        if (c !== 0) return c * retning;
    }
    return 0;
}

export interface Sortering { kolonne: string; retning: 1 | -1 }

/** Sorterer rækker; uafgjort → nyeste først (stabilt). */
export function sorter(rækker: readonly ListeRaekke[], s: Sortering, gruppeTitel: (r: ListeRaekke) => string): ListeRaekke[] {
    return [...rækker].sort((a, b) => sammenlignNoegler(sortNoegle(s.kolonne, a, gruppeTitel), sortNoegle(s.kolonne, b, gruppeTitel), s.retning)
        || modtaget(b.k).getTime() - modtaget(a.k).getTime());
}

/**
 * Grupperet visning med en sortering: rækkerne sorteres inden for hver gruppe,
 * og grupperne efter deres første række — kørsler uden par og røgtests står
 * stadig sidst. Uden sortering: standardrækkefølgen (træet).
 */
export function sorterGrupper(gs: readonly Gruppe[], s: Sortering | null): Gruppe[] {
    if (!s) return [...gs];
    const titel = titelOpslag(gs);
    const sorteret = gs.map((g) => ({ ...g, raekker: sorter(g.raekker, s, titel) }));
    const sidst: Record<GruppeType, number> = { par: 0, uden_par: 1, roegtest: 2 };
    return sorteret.sort((a, b) => sidst[a.type] - sidst[b.type]
        || sammenlignNoegler(sortNoegle(s.kolonne, a.raekker[0], titel), sortNoegle(s.kolonne, b.raekker[0], titel), s.retning));
}

/** Gruppens titel (rodens scenarie) som opslag pr. række — bruges af "spoergsmaal"-nøglen. */
export function titelOpslag(gs: readonly Gruppe[]): (r: ListeRaekke) => string {
    const m = new Map(gs.map((g) => [g.noegle, g.titel]));
    return (r) => m.get(r.gruppe) ?? "";
}

// ================================================================= filtre

export interface Filtre { vaerkId: string; oprindelse: string; markeder: string; status: string }

export function filtrer(rækker: readonly ListeRaekke[], f: Filtre): ListeRaekke[] {
    return rækker.filter((r) => (!f.vaerkId || r.k.vaerk_id === f.vaerkId)
        && (!f.oprindelse || r.oprindelse.type === f.oprindelse)
        && (!f.markeder || (f.markeder === "spot" ? r.markeder.medBal === false : f.markeder === "A" || f.markeder === "B" ? r.markeder.spor === f.markeder : true))
        && (!f.status || r.k.status === f.status));
}

/** Bruges af forklaringen: ét konkret eksempel (helst demo-par P1, ellers det første par). */
export function eksempel(rækker: readonly ListeRaekke[]): { ref: ListeRaekke; scen: ListeRaekke } | null {
    const scenarier = rækker.filter((r) => r.rolle.type === "scenarie" && r.vurdering);
    const p1 = DEMO_PAR.find((p) => p.id === "P1");
    const valgt = scenarier.find((r) => r.oprindelse.demoId === p1?.scenarie) ?? scenarier[0];
    if (!valgt) return null;
    const ref = rækker.find((r) => r.k.id === valgt.rolle.modId);
    return ref ? { ref, scen: valgt } : null;
}

