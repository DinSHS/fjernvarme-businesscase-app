//-----------------------------------------------------------------------
// "Tilføj balancemarked" (runde 14c): en balancing-blok til et værk, der
// ingen har — typisk et værk fra værksarket, hvis modelscript ikke skriver
// blokken (scripts/vaerksark_til_yaml.py, "TJEK DISSE PUNKTER" 1). Ren logik.
//
// Værdierne opfindes ikke: blokken bygges af modelrepoets egne blade ved
// pinnen — Andebys blok (modelspejlets cases/andeby.yaml) eller
// BUDSTRATEGI.md's færdige blokke (fælles del + én profil, modelspejlets
// `budstrategi`) — med fil:linje pr. felt. Kun det, der er værkets eget,
// spørges der om: hvilke enheder er prækvalificeret, deres lofter, og den
// enhed, budtærsklen regnes for. Enhedsnavnene er værkets (BUDSTRATEGI.md
// "Enhedsnavnene skal være værkets egne"); kildens navne (Andebys
// vp_luft_vand) står kun som eksempel ved felterne. Blokken gemmes som ÉN
// revision med `opret` (og `ret`/`opret` af prækvalifikationen på enhederne)
// og fjernes igen med `slet` af alle balancing-blade.
//-----------------------------------------------------------------------

import type { Parameterændring } from "@/lib/data/skriv";
import { visVaerdi } from "@/lib/data/vaerdi";
import { BUDSTRATEGI, kildeMedCommit, spejlcase, type Budblok } from "@/lib/modelspejl";
import { VISNINGSNAVNE } from "@/sider/analyser/anbefaling.data";
import { findFelt } from "./katalog";
import { kladde } from "./redigering";

const LOFT = "balancing.ancillary_caps.per_unit_mw.";
const MARKED = "balancing.ancillary_caps.per_unit_market_mw.";
const REFERENCE = /^balancing\.reservation_gate\.[^.]+\.opportunity_cost\.reference_unit$/;
const TOTAL = "balancing.ancillary_caps.total_mw";
const KVALIFIKATION = ["afrr_qualified", "mfrr_qualified"] as const;

export type UdgangspunktId = "andeby" | "profil1" | "profil2" | "profil3" | "profil4";

export interface Udgangspunkt {
    id: UdgangspunktId;
    navn: string;
    /** Linjerne i modelrepoet, blokken er bygget af: "doc/BUDSTRATEGI.md:224-239, 256-262 @ 90fb16e". */
    kilde: string;
    /** Blokkens kendetegn, læst af dens egne blade (foresight, settle, budtærskel …). */
    resume: string;
}

interface Skabelonblad { sti: string; vaerdi_json: string; fil: string; linje: number; kommentar: string | null }

// ------------------------------------------------------------------ modelrepoets blokke

const fællesBlok = (): Budblok => {
    const b = BUDSTRATEGI.blokke.find((x) => !x.fortsaetter_balancing && Object.keys(x.blade).some((s) => s.startsWith("balancing.")));
    if (!b) throw new Error("Modelspejlet har ingen fælles balancing-blok fra BUDSTRATEGI.md — kør byg_modelspejl.py.");
    return b;
};
const profilBlok = (n: number): Budblok | undefined => BUDSTRATEGI.blokke.find((x) => x.titel.startsWith(`Profil ${n} `));

const fraBlok = (b: Budblok): Skabelonblad[] =>
    Object.entries(b.blade).map(([sti, [vaerdi_json, linje, kommentar]]) => ({ sti, vaerdi_json, fil: BUDSTRATEGI.fil, linje, kommentar }));

function andebyBlade(): Skabelonblad[] {
    const c = spejlcase("andeby");
    if (!c) throw new Error("Modelspejlet har ikke Andeby — kør byg_modelspejl.py.");
    return Object.entries(c.blade).filter(([s]) => s.startsWith("balancing."))
        .map(([sti, [vaerdi_json, linje]]) => ({ sti, vaerdi_json, fil: c.fil, linje, kommentar: null }))
        .sort((a, b) => a.linje - b.linje);
}

const PROFILER = [1, 2, 3, 4] as const;

function skabelon(id: UdgangspunktId): Skabelonblad[] {
    if (id === "andeby") return andebyBlade();
    const p = profilBlok(Number(id.slice(6)));
    if (!p) throw new Error(`Modelspejlet har ikke BUDSTRATEGI.md's ${id} — kør byg_modelspejl.py.`);
    return [...fraBlok(fællesBlok()), ...fraBlok(p)];
}

const interval = (l: readonly [number, number]) => (l[0] === l[1] ? `${l[0]}` : `${l[0]}-${l[1]}`);

/** BUDSTRATEGI.md § 3.2's ord for budstørrelsen (mode). */
const MODE: Record<string, string> = { bound: "op til en blok", driven: "fast blok, altid" };

/** Blokkens kendetegn i driftsfolkenes ord (brugertest r14 F11): de danske visningsnavne fra viden/knapper.json. */
function resume(blade: readonly Skabelonblad[]): string {
    const v = new Map(blade.map((b) => [b.sti, visVaerdi(b.vaerdi_json)]));
    const navn = (felt: string, sti: string) => { const x = v.get(sti); return x ? VISNINGSNAVNE[felt]?.[x] ?? x : "–"; };
    const dele = [`byder ud fra ${navn("foresight", "balancing.activation.foresight")}`, `afregning: ${navn("settle", "balancing.activation.settle")}`];
    if (v.get("balancing.reservation_gate.enabled") !== "Ja") dele.push("ingen budpris på kapacitet (byder, når det betaler sig)");
    else {
        dele.push(`budpris på kapacitet, ${MODE[v.get("balancing.reservation_gate.mode") ?? ""] ?? v.get("balancing.reservation_gate.mode") ?? "–"}`);
        for (const m of ["afrr", "mfrr"]) {
            const pris = v.get(`balancing.reservation_gate.${m}.cm_threshold_dkk_mw_h`);
            const ref = v.get(`balancing.reservation_gate.${m}.opportunity_cost.reference_unit`);
            const blok = v.get(`balancing.reservation_gate.${m}.block_mw`);
            dele.push(`${m === "afrr" ? "aFRR" : "mFRR"} ${pris ? `${pris} kr./MW/h` : ref ? "beregnet pris" : ""}${blok ? `, blok ${blok} MW` : ""}`);
        }
    }
    return dele.join(" · ");
}

export function udgangspunkter(): Udgangspunkt[] {
    const a = andebyBlade();
    const fælles = fællesBlok();
    const ud: Udgangspunkt[] = [{
        id: "andeby", navn: "Som Andeby (modelrepoets referenceværk)",
        kilde: kildeMedCommit(`${spejlcase("andeby")!.fil}:${interval([a[0].linje, a[a.length - 1].linje])}`), resume: resume(a),
    }];
    for (const n of PROFILER) {
        const p = profilBlok(n);
        if (!p) continue;
        ud.push({
            id: `profil${n}` as UdgangspunktId, navn: `Bud${p.titel.charAt(0).toLowerCase()}${p.titel.slice(1)} (BUDSTRATEGI.md)`,
            kilde: kildeMedCommit(`${BUDSTRATEGI.fil}:${interval(fælles.linjer)}, ${interval(p.linjer)}`), resume: resume(skabelon(`profil${n}` as UdgangspunktId)),
        });
    }
    return ud;
}

/** BUDSTRATEGI.md's øvrige blokke, og hvorfor de ikke tilbydes her. */
export const BALANCE_IKKE_TILBUDT: readonly { navn: string; kilde: string; grund: string }[] = BUDSTRATEGI.blokke
    .filter((b) => b !== fællesBlok() && !PROFILER.some((n) => b === profilBlok(n)))
    .map((b) => ({
        navn: b.titel, kilde: kildeMedCommit(`${BUDSTRATEGI.fil}:${interval(b.linjer)}`),
        grund: b.titel.startsWith("Profil 5")
            ? "Et teoretisk loft, ikke en forventning: blokken kræver desuden, at foresight sættes til realized (en kommentar i kilden, ikke et felt). Kør det som et scenarie, hvis I vil se loftet."
            : !b.fortsaetter_balancing && !Object.keys(b.blade).some((s) => s.startsWith("balancing."))
                ? "Felter på en enhed, ikke en del af balancing-blokken. Tilføj dem på enheden (Enheder › vælg enheden › Tilføj et felt)."
                : "Ikke en del af den fælles blok eller en profil.",
    }));

// ------------------------------------------------------------------ værkets enheder

export interface BalanceEnhed { navn: string; type: string | null; til: boolean; kvalificeret: boolean; kanByde: boolean }

const KAN_BYDE = findFelt("units.x.ancillary.afrr_qualified")?.gaelder_for ?? null;

/** Værkets enheder i værkets rækkefølge; `kanByde` efter katalogets gaelder_for for ancillary.afrr_qualified (el-enhederne). */
export function balanceEnheder(nu: ReadonlyMap<string, string>): BalanceEnhed[] {
    const navne = [...new Set([...nu.keys()].filter((s) => s.startsWith("units.")).map((s) => s.split(".")[1]))];
    return navne.map((navn) => {
        const type = nu.has(`units.${navn}.type`) ? (JSON.parse(nu.get(`units.${navn}.type`)!) as string) : null;
        return {
            navn, type,
            til: nu.get(`units.${navn}.enabled`) !== "false",
            kvalificeret: KVALIFIKATION.some((k) => nu.get(`units.${navn}.ancillary.${k}`) === "true"),
            kanByde: !!type && (KAN_BYDE === null || KAN_BYDE.includes(type)),
        };
    });
}

/** Forvalgt: de el-enheder, værket allerede har prækvalificeret (værksarkets kolonne "balance"). */
export function forvalgteEnheder(nu: ReadonlyMap<string, string>): string[] {
    return balanceEnheder(nu).filter((e) => e.kanByde && e.kvalificeret).map((e) => e.navn);
}

export function harBalancemarked(nu: ReadonlyMap<string, string>): boolean {
    for (const s of nu.keys()) if (s.startsWith("balancing.")) return true;
    return false;
}

// ------------------------------------------------------------------ planen

export interface BalanceValg {
    udgangspunkt: UdgangspunktId;
    /** De prækvalificerede enheder (værkets navne). */
    enheder: readonly string[];
    /** Enhed -> brugerens tekst for per_unit_mw (MW el). */
    loft: Readonly<Record<string, string>>;
    /** Enhed -> marked -> tekst for per_unit_market_mw; tom = intet loft pr. marked. Kun hvis udgangspunktet har dem. */
    markedsloft?: Readonly<Record<string, Readonly<Record<string, string | undefined>>>>;
    /** Enheden, budtærsklen regnes for (opportunity_cost.reference_unit), hvis udgangspunktet har den. */
    reference?: string | null;
    /** Rettede eksempelværdier: sti -> tekst (kodes med kildens type). */
    vaerdier?: Readonly<Record<string, string>>;
}

export type Blokslags = "blok" | "loft" | "markedsloft" | "reference" | "kvalifikation";

export interface Blokfelt {
    sti: string;
    /** Den værdi, der gemmes (null: brugerens værdi mangler eller kan ikke læses). */
    vaerdi_json: string | null;
    /** Feltets linje i modelrepoet: "doc/BUDSTRATEGI.md:231 @ 90fb16e". */
    kilde: string;
    /** YAML-kommentaren ved linjen i kilden. */
    kommentar: string | null;
    slags: Blokslags;
    /** Hvad brugeren skal tage stilling til (null: kildens værdi bruges). */
    tagStilling: string | null;
    /** Et tal fra kilden, der er et eksempel ("Tallene er eksempler og skal erstattes med værkets egne"). */
    eksempel: boolean;
    handling: "opret" | "ret" | "uændret";
    gammel: string | null;
}

export interface BalancePlan {
    felter: Blokfelt[];
    ændringer: Parameterændring[];
    fejl: { sti: string; besked: string }[];
    advarsler: string[];
}

const kilde = (b: Skabelonblad) => kildeMedCommit(`${b.fil}:${b.linje}`);
const MARKEDSNAVN: Record<string, string> = { afrr: "aFRR", mfrr: "mFRR" };

/** Kildens eksempel for et per-enhed-felt: "vp_luft_vand 6,0 MW". */
function eksempel(sk: readonly Skabelonblad[], præfiks: string, hale = ""): string {
    return sk.filter((b) => b.sti.startsWith(præfiks) && b.sti.endsWith(hale))
        .map((b) => `${b.sti.slice(præfiks.length).split(".")[0]} ${visVaerdi(b.vaerdi_json)} MW`).join(", ");
}

export function planlægBalancemarked(nu: ReadonlyMap<string, string>, valg: BalanceValg): BalancePlan {
    const fejl: BalancePlan["fejl"] = [];
    const advarsler: string[] = [];
    if (harBalancemarked(nu)) {
        return { felter: [], ændringer: [], advarsler, fejl: [{ sti: "balancing", besked: "Værket har allerede en balancing-blok — ret den under Balancering, eller fjern den først." }] };
    }
    const sk = skabelon(valg.udgangspunkt);
    const enheder = balanceEnheder(nu);
    const pr = new Map(enheder.map((e) => [e.navn, e]));
    const valgte = [...new Set(valg.enheder)];
    if (valgte.length === 0) fejl.push({ sti: "enheder", besked: "Vælg mindst én prækvalificeret enhed." });
    for (const n of valgte) {
        const e = pr.get(n);
        if (!e) fejl.push({ sti: `units.${n}`, besked: `Enheden ${n} findes ikke i værket.` });
        else if (!e.kanByde) fejl.push({ sti: `units.${n}`, besked: `${n} kan ikke byde i balancemarkedet — kun el-enheder (${(KAN_BYDE ?? []).join(", ")}) byder.` });
        else if (!e.til) advarsler.push(`${n} er slået fra (enabled: false) og byder ikke, før den slås til.`);
    }
    const bydende = valgte.filter((n) => pr.get(n)?.kanByde);
    for (const e of enheder) {
        if (e.kanByde && e.kvalificeret && !bydende.includes(e.navn)) {
            advarsler.push(`${e.navn} er prækvalificeret i værket (ancillary), men ikke valgt: uden et loft pr. enhed kan den byde op til værkets samlede loft.`);
        }
    }

    const felter: Blokfelt[] = [];
    const felt = (f: Omit<Blokfelt, "handling" | "gammel">) => {
        const gammel = nu.get(f.sti) ?? null;
        felter.push({ ...f, gammel, handling: gammel === null ? "opret" : gammel === f.vaerdi_json ? "uændret" : "ret" });
    };
    const kod = (sti: string, base: string, tekst: string, hvad: string): string | null => {
        const k = kladde(findFelt(sti), base, tekst);
        if (k.fejl || k.json === null) { fejl.push({ sti, besked: `${hvad}: ${k.fejl ?? "kan ikke læses."}` }); return null; }
        return k.json;
    };

    const refBlade = sk.filter((b) => REFERENCE.test(b.sti));
    if (refBlade.length && !(valg.reference && bydende.includes(valg.reference))) {
        fejl.push({ sti: refBlade[0].sti, besked: valg.reference
            ? `${valg.reference} er ikke en af de valgte el-enheder — budtærsklen regnes for en enhed, der byder.`
            : "Vælg den enhed, budtærsklen regnes for (opportunity_cost.reference_unit)." });
    }
    const markeder = [...new Set(sk.filter((b) => b.sti.startsWith(MARKED)).map((b) => b.sti.split(".").pop()!))];
    let loftLagt = false, markedLagt = false;
    for (const b of sk) {
        if (b.sti.startsWith(LOFT)) {
            if (loftLagt) continue;
            loftLagt = true;
            const eks = eksempel(sk, LOFT);
            for (const n of bydende) {
                const sti = `${LOFT}${n}`;
                const tekst = valg.loft[n]?.trim();
                const v = tekst ? kod(sti, b.vaerdi_json, tekst, `Loftet for ${n}`) : null;
                if (!tekst) fejl.push({ sti, besked: `Skriv loftet for ${n} (MW el, prækvalificeret).` });
                felt({ sti, vaerdi_json: v, kilde: kilde(b), kommentar: b.kommentar, slags: "loft", eksempel: false,
                    tagStilling: `Hvor meget eloptag ${n} er prækvalificeret til, samlet over aFRR og mFRR (MW el). Eksempel i kilden: ${eks}.` });
            }
            continue;
        }
        if (b.sti.startsWith(MARKED)) {
            if (markedLagt) continue;
            markedLagt = true;
            for (const n of bydende) {
                for (const m of markeder) {
                    const sti = `${MARKED}${n}.${m}`;
                    const tekst = valg.markedsloft?.[n]?.[m]?.trim();
                    if (!tekst) continue;
                    felt({ sti, vaerdi_json: kod(sti, b.vaerdi_json, tekst, `${MARKEDSNAVN[m] ?? m}-loftet for ${n}`), kilde: kilde(b), kommentar: b.kommentar,
                        slags: "markedsloft", eksempel: false,
                        tagStilling: `Værkets egen fordeling af ${n} på ${MARKEDSNAVN[m] ?? m} (MW el); tomt = intet loft pr. marked. Eksempel i kilden: ${eksempel(sk, MARKED, `.${m}`)}.` });
                }
            }
            continue;
        }
        if (REFERENCE.test(b.sti)) {
            const ok = !!valg.reference && bydende.includes(valg.reference);
            felt({ sti: b.sti, vaerdi_json: ok ? JSON.stringify(valg.reference) : null, kilde: kilde(b), kommentar: b.kommentar, slags: "reference", eksempel: false,
                tagStilling: `Den elforbrugende enhed, budtærsklen regnes for (kilden: ${visVaerdi(b.vaerdi_json)}).` });
            continue;
        }
        const tekst = valg.vaerdier?.[b.sti];
        const post = findFelt(b.sti);
        felt({
            sti: b.sti, vaerdi_json: tekst === undefined ? b.vaerdi_json : kod(b.sti, b.vaerdi_json, tekst, post?.etiket ?? b.sti),
            kilde: kilde(b), kommentar: b.kommentar, slags: "blok",
            eksempel: post?.type === "number",
            tagStilling: b.sti === TOTAL ? "Værkets samlede prækvalificerede kapacitet (MW el) — kildens tal er et eksempel." : null,
        });
    }
    // BUDSTRATEGI.md: "sætte afrr_qualified: true / mfrr_qualified: true på de enheder, der er prækvalificeret".
    const kvalKilde = kildeMedCommit(`${BUDSTRATEGI.fil}:${BUDSTRATEGI.kvalificering_linje}`);
    for (const n of bydende) {
        for (const k of KVALIFIKATION) {
            felt({ sti: `units.${n}.ancillary.${k}`, vaerdi_json: "true", kilde: kvalKilde, kommentar: null, slags: "kvalifikation", eksempel: false, tagStilling: null });
        }
    }
    const ændringer: Parameterændring[] = felter
        .filter((f) => f.handling !== "uændret" && f.vaerdi_json !== null)
        .map((f) => ({ sti: f.sti, handling: f.handling as "opret" | "ret", ny_json: f.vaerdi_json }));
    return { felter, ændringer: fejl.length ? [] : ændringer, fejl, advarsler };
}

// ------------------------------------------------------------------ fjern

/** `slet` for hvert balancing-blad. Prækvalifikationen på enhederne står urørt (den er enhedernes egne felter). */
export function fjernBalancemarked(nu: ReadonlyMap<string, string>): { ændringer: Parameterændring[]; stier: string[] } {
    const stier = [...nu.keys()].filter((s) => s.startsWith("balancing."));
    return { stier, ændringer: stier.map((sti) => ({ sti, handling: "slet" as const })) };
}
