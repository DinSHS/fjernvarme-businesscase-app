//-----------------------------------------------------------------------
// "Hvad skal jeg sammenligne med?" (brief 14) — rene funktioner, testet i
// kandidater.spec.ts.
//
// Hver anden kørsel bliver en kandidat med scenariets navn, værk, periode,
// balancering, hvad der er ændret ift. værket i klartekst, og Δ i
// driftsomkostning mod den aktuelle kørsel. Direkte sammenlignelige (§6b)
// kommer først, med den naturlige reference øverst; resten står for sig med
// hvad der afviger.
//-----------------------------------------------------------------------

import { KOERSEL_PRAEFIKS, type InputRække } from "@/lib/data/afflad";
import { STATUS_TEKST } from "@/lib/data/koersel-status";
import { tal } from "@/lib/format";
import type { KoerselStatus } from "../../../rayfin/data/fjv.constants";
import {
    feltInfo, inputDiff, koerselsAendringer, METADATA_FLAG, modtaget, profil, sammenlignelighed, sammenlignelighedStatus, visJson,
    type Afvigelse, type Koersel, type Profil, type Scenarie,
} from "./beregn";
import { VISNINGSNAVNE } from "./anbefaling.data";

/** Én kørsel med det, kandidatlisten skal bruge. `input` behøver kun kørslens egne rækker (kilde aendring/scenarie). */
export interface KoerselInfo {
    k: Koersel;
    scenarie: Scenarie | null;
    vaerkNavn: string;
    input: readonly InputRække[];
}

export interface Kandidat {
    k: Koersel;
    navn: string;
    vaerkNavn: string;
    profil: Profil;
    medBalancering: boolean | null;
    /** Hvad kørslen har ændret ift. værket, i klartekst — tom = værket som det er. */
    aendringer: string[];
    /** §6b-dom mod den aktuelle kørsel. */
    status: "ja" | "nej" | "ukendt";
    /** Hvad der afviger (kort, med småt), tom når sammenlignelig. */
    afviger: string[];
    /** Den naturlige reference (scenariets reference, eller værket som det er med samme balancering). */
    naturlig: boolean;
    /** Samme frosne ændringer som den aktuelle kørsel — forskellen bør være solverstøj. */
    sammeInput: boolean;
    /** Kandidatens driftsomkostning − den aktuelle kørsels; null hvis et objektiv mangler. */
    delta: number | null;
    faerdig: boolean;
}

// ---------------------------------------------------------------- hvad er ændret

/** Felter der ikke er "ændringer" i et scenarie: periode og balancering har egne kolonner; solver og pins er metadata. */
function ikkeAendring(sti: string): boolean {
    return sti === `${KOERSEL_PRAEFIKS}start` || sti === `${KOERSEL_PRAEFIKS}slut` || sti === `${KOERSEL_PRAEFIKS}med_balancering`
        || sti.startsWith("solver.") || METADATA_FLAG.has(sti);
}

const enhedTekst = (e: string | null) => (e ? ` ${e.replace(/^DKK/, "kr.")}` : "");

/** Kodeværdier med et dansk visningsnavn (knapper.json → visningsnavne): "realized" → "kender aktiveringerne". */
const VISNING_PR_STI: Record<string, string> = {
    "balancing.activation.foresight": "foresight", "balancing.activation.settle": "settle", [`${KOERSEL_PRAEFIKS}balancing_method`]: "balancing_method",
};
function vaerdiTekst(sti: string, json: string): string {
    const liste = VISNING_PR_STI[sti];
    if (liste) { try { const v = JSON.parse(json) as unknown; if (typeof v === "string" && VISNINGSNAVNE[liste]?.[v]) return VISNINGSNAVNE[liste][v]; } catch { /* rå værdi */ } }
    return visJson(json);
}

/**
 * Kørslens ændringer ift. værket som korte klartekster: slåede-fra enheder og
 * lagre samlet ("Uden tank_hoej, tank_lav"), slåede-til ("Med elkedel_gl"), og
 * satte værdier med etiket og enhed ("Naturgaspris 727,2 kr./MWh brændsel").
 */
export function aendringsResume(input: readonly InputRække[]): string[] {
    const uden: string[] = [], med: string[] = [], andet: string[] = [];
    for (const x of koerselsAendringer(input)) {
        if (ikkeAendring(x.sti)) continue;
        const m = /^(units|storage)\.([^.]+)\.enabled$/.exec(x.sti);
        if (m && (x.ny_json === "false" || x.ny_json === "true")) { (x.ny_json === "false" ? uden : med).push(m[2]); continue; }
        if (x.sti === `${KOERSEL_PRAEFIKS}heat_csv`) { andet.push(`Målt varmelast (${visJson(x.ny_json)})`); continue; }
        const ts = /^_koersel\.tidsserie\.(varmelast|solprofil)$/.exec(x.sti);
        if (ts) {
            let sha = "ukendt";
            try { sha = (JSON.parse(x.ny_json) as { sha256?: string }).sha256?.slice(0, 12) ?? sha; } catch { /* vises som ukendt */ }
            andet.push(`${ts[1] === "varmelast" ? "Målt varmelast" : "Solprofil"} (tidsserie ${sha})`);
            continue;
        }
        if (x.sti === `${KOERSEL_PRAEFIKS}balancing_method`) { andet.push(`Balanceringsmetode: ${vaerdiTekst(x.sti, x.ny_json)}`); continue; }
        if (x.sti === `${KOERSEL_PRAEFIKS}ekstra_flag`) { andet.push(`Flag ${visJson(x.ny_json)}`); continue; }
        const f = feltInfo(x.sti);
        const vis = vaerdiTekst(x.sti, x.ny_json);
        andet.push(VISNING_PR_STI[x.sti] ? `${f.etiket}: ${vis}` : `${f.etiket}${f.objekt ? ` (${f.objekt})` : ""} ${vis}${enhedTekst(f.enhed)}`);
    }
    return [
        ...(uden.length ? [`Uden ${uden.sort().join(", ")}`] : []),
        ...(med.length ? [`Med ${med.sort().join(", ")}`] : []),
        ...andet,
    ];
}

/** "Værket som det er" når der ingen ændringer er. */
export function resumeTekst(aendringer: readonly string[]): string {
    return aendringer.length ? aendringer.join(" · ") : "Værket som det er";
}

// ---------------------------------------------------------------- Δ og afvigelser

/** "+44.220 kr. dyrere end denne" / "133.801 kr. billigere end denne" / "samme driftsomkostning som denne". */
export function deltaTekst(delta: number | null): string {
    if (delta === null) return "ingen driftsomkostning at sammenligne";
    const b = tal(Math.abs(delta));
    if (b === "0") return "samme driftsomkostning som denne";
    return delta > 0 ? `${b} kr. dyrere end denne` : `${b} kr. billigere end denne`;
}

const KORT: Record<string, string> = {
    vaerk_id: "andet værk", periode: "anden periode", oploesning: "anden opløsning", data_commit: "andet datagrundlag",
    model_commit: "anden modelversion", rel_gap: "andet ønsket relativt gab", abs_gap: "andet ønsket absolut gab",
};

/** Hvad der afviger, kort: "anden periode", "andet værk", "datagrundlag ukendt". */
export function afvigerTekst(af: readonly Afvigelse[]): string[] {
    return af.filter((x) => x.alvor !== "note").map((x) => (x.alvor === "ukendt" ? `${x.navn.toLowerCase()} ukendt` : KORT[x.felt] ?? x.navn.toLowerCase()));
}

// ---------------------------------------------------------------- rangering

/**
 * Rangering blandt de sammenlignelige (lavest først):
 *  0  scenariets egen reference (`reference_scenarie_id`)
 *  1  værket som det er, samme balancering — den naturlige reference
 *  2  værket som det er, anden balancering (fx balancemarkedets værdi)
 *  3  samme balancering
 *  4  resten
 *  5  samme frosne input som den aktuelle (en gentagelse: kontrol for solverstøj, ikke en reference)
 * Uafgjort: færrest forskelle i det frosne input, så nyeste først.
 */
export function rang(denne: KoerselInfo, c: Kandidat, refScenarie: string | null | undefined): number {
    if (refScenarie && c.k.scenarie_id === refScenarie) return 0;
    const sammeBal = c.medBalancering === profil(denne.k, denne.vaerkNavn, denne.scenarie, denne.input).med_balancering;
    if (c.aendringer.length === 0) return sammeBal ? 1 : 2;
    return sammeBal ? 3 : 4;
}

export function kandidater(denne: KoerselInfo, alle: readonly KoerselInfo[]): { anbefalet: Kandidat[]; andre: Kandidat[] } {
    const pDenne = profil(denne.k, denne.vaerkNavn, denne.scenarie, denne.input);
    const refScenarie = denne.scenarie?.reference_scenarie_id;
    const rå = alle.filter((x) => x.k.id !== denne.k.id).map((x): Kandidat & { _rang: number; _diff: number } => {
        const p = profil(x.k, x.vaerkNavn, x.scenarie, x.input);
        const af = sammenlignelighed(pDenne, p);
        const diff = inputDiff(denne.input, x.input).filter((d) => !METADATA_FLAG.has(d.sti)).length;
        const faerdig = x.k.status === "faerdig";
        // Codex K4-F7: "samme input" afgøres af HELE det frosne input (input_hash), ikke kun af kørslens egne
        // rækker. Uden hash på begge: kun ens egne rækker OG samme værksrevision.
        const hashes = !!denne.k.input_hash && !!x.k.input_hash;
        const sammeRevision = x.k.vaerk_revision === denne.k.vaerk_revision;
        const sammeInput = hashes ? denne.k.input_hash === x.k.input_hash : diff === 0 && sammeRevision;
        const revision = x.k.vaerk_id === denne.k.vaerk_id && !sammeRevision && x.k.vaerk_revision != null
            ? [`værksrevision r${x.k.vaerk_revision} (denne kørsel: r${denne.k.vaerk_revision})`] : [];
        const c: Kandidat = {
            k: x.k, navn: x.scenarie?.navn ?? "Kørsel uden scenarie", vaerkNavn: x.vaerkNavn, profil: p,
            medBalancering: p.med_balancering, aendringer: [...revision, ...aendringsResume(x.input)],
            status: faerdig ? sammenlignelighedStatus(af) : "nej",
            afviger: faerdig ? afvigerTekst(af) : [`ikke færdig (${STATUS_TEKST[x.k.status as KoerselStatus] ?? x.k.status})`],
            naturlig: false, sammeInput,
            delta: x.k.objektiv_dkk != null && denne.k.objektiv_dkk != null ? x.k.objektiv_dkk - denne.k.objektiv_dkk : null,
            faerdig,
        };
        return { ...c, _rang: c.sammeInput ? 5 : rang(denne, c, refScenarie), _diff: diff };
    });
    const orden = (a: { _rang: number; _diff: number; k: Koersel }, b: { _rang: number; _diff: number; k: Koersel }) =>
        a._rang - b._rang || a._diff - b._diff || modtaget(b.k).getTime() - modtaget(a.k).getTime();
    const anbefalet = rå.filter((c) => c.status === "ja").sort(orden);
    // Den naturlige reference: den øverste, hvis den er scenariets reference eller værket som det er med samme balancering.
    if (anbefalet[0] && anbefalet[0]._rang <= 1 && !anbefalet[0].sammeInput) anbefalet[0].naturlig = true;
    const andre = rå.filter((c) => c.status !== "ja").sort((a, b) =>
        Number(b.vaerkNavn === denne.vaerkNavn) - Number(a.vaerkNavn === denne.vaerkNavn) || Number(b.faerdig) - Number(a.faerdig) || orden(a, b));
    const ren = ({ _rang: _r, _diff: _d, ...c }: Kandidat & { _rang: number; _diff: number }): Kandidat => { void _r; void _d; return c; };
    return { anbefalet: anbefalet.map(ren), andre: andre.map(ren) };
}
