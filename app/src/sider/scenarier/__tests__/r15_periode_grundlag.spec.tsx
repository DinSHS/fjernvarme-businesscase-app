// Efterprøvningen af rettelserne i runde 15, fund D (P2): "Periode og datagrundlag kan stadig få en fejlagtig grøn dom."
//
// (1) PERIODEN. Modellen har to regler (fabric/fjv/byg_case.py › _effektiv_tid): scenariets slutdato er hele døgnet
//     (kl. 23), men værkets egen `time.end` som bar dato er MIDNAT. Sammenligningen udvidede begge til kl. 23 — et værk
//     med `time.end: 2026-01-06` og et scenarie med slutdato 6. januar fik "samme periode" (25 mod 48 timer). Omvendt
//     var `2026-01-06` og `2026-01-06T00:00:00Z` i værkets tidsblok "forskellige", selv om det er samme time.
//     Manifestet kan ikke afgøre det: modellen skriver perioden som rene datoer (src/manifest.py › _date10).
//     Leads afgørelse: første kilde er den effektive periode udledt af det FROSNE input med byg_case's regel;
//     manifestet bruges kun, hvor det bærer tidspunkter, og ellers som kontrol; kan perioden ikke udledes, er dommen
//     ukendt — samme udledning i Scenarier og Analyser.
// (2) DATAGRUNDLAGET. Gøres en anden varmelast aktiv på værket mellem to kørsler, skifter den frosne seriehash uden
//     at værksrevisionen gør det. To sådanne kørsler fik grønt mærke og ΔRef.
// (3) Scenarier dømte på rækken alene og sagde "ukendt", når fx modelpinnen kun stod i de frosne input.
// (4) Oversigtens fodtekst kaldte værksrevisionen et krav, også når den kun er en note.
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { kortProfilFilter, PROFIL_VAERKSSTIER } from "@/lib/data/frossen-profil";
import type { Koersel } from "../../../../rayfin/data/Koersel";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import { effektivPeriode, profil, sammenlignelighedsDom, tidsserieafvigelse, tidsseriekilde, type Tidsseriekilde } from "../../analyser/beregn";
import { modReference } from "../koersel-logik";
import { findReference } from "../oversigt-logik";
import { OVERSIGT_FOD, ReferenceCelle } from "../Oversigt";

afterEach(cleanup);

const ind = (kilde: InputRække["kilde"], sti: string, v: unknown): InputRække => ({ kilde, sti, vaerdi_json: JSON.stringify(v) });
/** Værkets frosne tidsblok (kilde `vaerk`) — det eneste af værkets blade, perioden afhænger af. */
const tid = (start: string, slut: string): InputRække[] => [ind("vaerk", "time.start", start), ind("vaerk", "time.end", slut), ind("vaerk", "time.resolution", "1h")];
/** Scenariets frosne datoer (`_koersel.start/slut`). */
const datoer = (start: string, slut: string): InputRække[] => [ind("scenarie", "_koersel.start", start), ind("scenarie", "_koersel.slut", slut)];
const pins = [ind("scenarie", "_koersel.model_commit", "939228aa048563c8498382a79d207c8b03fbda57"), ind("scenarie", "_koersel.data_commit", "106b9fce9a2e3610090b1a542559024056449b88")];
const serie = (rolle: string, id: string, sha: string) => ind("scenarie", `_koersel.tidsserie.${rolle}`, { id, sha256: sha.repeat(64) });

const ref = { id: "s1", vaerk_id: "v1", navn: "Reference", arkiveret: false, oprettet: new Date(Date.UTC(2026, 10, 18, 8)), med_balancering: false } as Scenarie;
const scen = { ...ref, id: "s2", navn: "Scenarie", reference_scenarie_id: "s1", oprettet: new Date(Date.UTC(2026, 10, 18, 9)) } as Scenarie;
let n = 0;
/** Manifestet, som arbejderen gemmer det: modellens RENE datoer. */
const manifest = (start: string, slut: string) => JSON.stringify({ periode: { start, slut, oploesning: "1h" } });
function koersel(s: Scenarie, objektiv_dkk: number, manifest_json: string | null, over: Partial<Koersel> = {}): Koersel {
    n++;
    return {
        id: `k${n}`, scenarie_id: s.id, vaerk_id: s.vaerk_id, vaerk_revision: 1, status: "faerdig", objektiv_dkk, best_bound: objektiv_dkk, solve_status: "optimal",
        oploesning: "1h", data_commit: "106b9fce9a2e3610090b1a542559024056449b88", model_commit: "939228aa048563c8498382a79d207c8b03fbda57",
        oensket_rel_gap: 0.0002, oensket_abs_gap: 100, manifest_json,
        bestilt: new Date(Date.UTC(2026, 10, 18, 10, n)), afsluttet: new Date(Date.UTC(2026, 10, 18, 11, n)), bestilt_af: "a@b.dk", ...over,
    } as Koersel;
}
const M56 = manifest("2026-01-05", "2026-01-06");

/** Samme par dømt begge steder: Analyser (profil + dom), scenariets side (modReference) og oversigten (findReference). */
function dømt(r: Koersel, ri: InputRække[] | undefined, k: Koersel, ki: InputRække[] | undefined) {
    const analyser = sammenlignelighedsDom(profil(r, "Andeby", ref, ri), profil(k, "Andeby", scen, ki));
    const side = modReference(r, k, { reference: ri, k: ki });
    const frosset = new Map<string, InputRække[]>([...(ri ? [[r.id, ri] as const] : []), ...(ki ? [[k.id, ki] as const] : [])]);
    const oversigt = findReference(scen, [ref, scen], [k, r], frosset);
    return { analyser, side, oversigt, status: [analyser.status, side.dom?.status, oversigt?.art === "par" ? oversigt.dom : undefined] };
}

describe("fund D(1): den effektive periode udledes af det frosne input med byg_case's regel", () => {
    it("scenariets datoer er hele døgn: 5. januar kl. 00 til 6. januar kl. 23 UTC", () => {
        expect(effektivPeriode([...tid("2025-07-01T00:00:00Z", "2026-06-30T23:00:00Z"), ...datoer("2026-01-05", "2026-01-06")]))
            .toEqual({ fra: "2026-01-05T00:00:00.000Z", til: "2026-01-06T23:00:00.000Z" });
    });
    it("værkets tidsblok bruges PRÆCIS: en bar dato er midnat — ikke hele døgnet", () => {
        expect(effektivPeriode(tid("2026-01-05", "2026-01-06"))).toEqual({ fra: "2026-01-05T00:00:00.000Z", til: "2026-01-06T00:00:00.000Z" });
        expect(effektivPeriode(tid("2026-01-05T00:00:00", "2026-01-06T23:00:00Z"))).toEqual({ fra: "2026-01-05T00:00:00.000Z", til: "2026-01-06T23:00:00.000Z" });
    });
    it("kan den ikke udledes, er svaret null — ikke et gæt", () => {
        expect(effektivPeriode([])).toBeNull();                                                  // intet frosset
        expect(effektivPeriode(datoer("2026-01-05", "2026-01-06").slice(0, 1))).toBeNull();       // kun en start
        expect(effektivPeriode(tid("2026-01-05T00:00:00+01:00", "2026-01-06T00:00:00Z"))).toBeNull();   // modellen afviser en anden zone
        expect(effektivPeriode(tid("2026-01-05T00:30:00Z", "2026-01-06T00:00:00Z"))).toBeNull();        // ikke en hel time
        expect(effektivPeriode([...tid("2026-01-05", "2026-01-06").slice(0, 2), ind("vaerk", "time.resolution", "15min")])).toBeNull();
    });
    it("samme akse som den betroede logik: de fælles vektorer (skema/vektorer/effektiv_akse.json)", () => {
        const fil = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../skema/vektorer/effektiv_akse.json");
        const v = JSON.parse(readFileSync(fil, "utf8")) as { tilfaelde: { navn: string; input: { scenarie: { periode_start?: string; periode_slut?: string }; periode: { start: string; slut: string } }; ud?: { fra: number; til: number }; afvisning?: string }[] };
        expect(v.tilfaelde.length).toBeGreaterThanOrEqual(8);
        for (const t of v.tilfaelde) {
            const s = t.input.scenarie;
            const input = s.periode_start && s.periode_slut ? datoer(s.periode_start, s.periode_slut) : tid(t.input.periode.start, t.input.periode.slut);
            const p = effektivPeriode(input);
            if (t.ud) expect(p && { fra: Date.parse(p.fra), til: Date.parse(p.til) }, t.navn).toEqual(t.ud);
            else expect(p, t.navn).toBeNull();
        }
    });

    it("efterprøvningens tilfælde 1: værkets time.end = 2026-01-06 (kl. 00) mod scenariets slutdato 6. januar (kl. 23) → NEJ begge steder", () => {
        const værk = tid("2026-01-05", "2026-01-06");
        const d = dømt(koersel(ref, 866_567.72, M56), [...værk, ...pins], koersel(scen, 843_051.76, M56), [...værk, ...datoer("2026-01-05", "2026-01-06"), ...pins]);
        // Før rettelsen: "ja" i Analyser (begge udvidet til kl. 23) — og de to manifester er ens, for de bærer kun datoer.
        expect(d.status).toEqual(["nej", "nej", "nej"]);
        expect(d.analyser.afvigelser.find((x) => x.felt === "periode")).toMatchObject({ alvor: "advarsel", a: "2026-01-05 00:00 UTC–2026-01-06 00:00 UTC", b: "2026-01-05 00:00 UTC–2026-01-06 23:00 UTC" });
        expect(d.side.diff).toBeNull();
        expect(d.oversigt && "delta" in d.oversigt ? d.oversigt.delta : undefined).toBeUndefined();
    });
    it("efterprøvningens tilfælde 2: time.end som bar dato mod samme tidspunkt skrevet med kl. 00.00 → JA begge steder", () => {
        const d = dømt(koersel(ref, 866_567.72, M56), [...tid("2026-01-05", "2026-01-06"), ...pins], koersel(scen, 843_051.76, M56), [...tid("2026-01-05T00:00:00Z", "2026-01-06T00:00:00Z"), ...pins]);
        expect(d.status).toEqual(["ja", "ja", "ja"]);                  // før: "nej" i Analyser
        expect(d.side.diff?.delta).toBeCloseTo(-23_515.96, 2);
    });
    it("uden frosset input kan perioden ikke udledes af manifestets rene datoer: UKENDT begge steder — aldrig grønt", () => {
        const d = dømt(koersel(ref, 866_567.72, M56), undefined, koersel(scen, 843_051.76, M56), undefined);
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
        expect(d.side.ukendt).toContain("periode");
        expect(d.side.diff).toBeNull();
    });
    it("manifestet er kontrollen: siger dets datoer noget andet end det frosne input, kendes perioden ikke", () => {
        const input = [...tid("2025-07-01T00:00:00Z", "2026-06-30T23:00:00Z"), ...datoer("2026-01-05", "2026-01-06"), ...pins];
        const d = dømt(koersel(ref, 866_567.72, M56), input, koersel(scen, 843_051.76, manifest("2026-01-05", "2026-01-16")), input);
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
    });
    it("et manifest, der selv bærer tidspunkter, bruges, hvor det frosne input mangler", () => {
        const m = manifest("2026-01-05T00:00:00Z", "2026-01-06T23:00:00Z");
        const p = profil(koersel(ref, 1, m), "Andeby", ref);
        expect([p.periode_fra, p.periode_til]).toEqual(["2026-01-05T00:00:00.000Z", "2026-01-06T23:00:00.000Z"]);
    });
    it("perioden læses aldrig af scenariets levende felter", () => {
        const levende = { ...scen, periode_start: "2026-01-05", periode_slut: "2026-01-06" } as Scenarie;
        const p = profil(koersel(scen, 1, null), "Andeby", levende);
        expect([p.periode_fra, p.periode_til]).toEqual([null, null]);
    });
});

describe("fund D(2): den effektive frosne varmelast og solprofil holdes op mod hinanden", () => {
    const fælles = [...tid("2025-07-01T00:00:00Z", "2026-06-30T23:00:00Z"), ...datoer("2026-01-05", "2026-01-06"), ...pins];
    const A = serie("varmelast", "11111111-1111-4111-8111-111111111111", "a"), B = serie("varmelast", "22222222-2222-4222-8222-222222222222", "b");
    const par = (ri: InputRække[], ki: InputRække[]) => dømt(koersel(ref, 866_567.72, M56), [...fælles, ...ri], koersel(scen, 843_051.76, M56), [...fælles, ...ki]);

    it("efterprøvningens tilfælde: to Andeby-kørsler 5.–6. januar 2026, samme pins, gab og revision — men hver sin frosne varmelast", () => {
        const d = par([A], [B]);
        // Før rettelsen: "ja" alle tre steder, grønt mærke og ΔRef −23.516 kr.
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
        expect(d.side.diff).toBeNull();
        expect(d.analyser.tekst).toContain("De to kørsler har ikke samme varmelast (tidsserie aaaaaaaaaaaa mod tidsserie bbbbbbbbbbbb)");
        expect(d.analyser.tekst).toContain("om den er valgt i scenariet eller arvet fra værket");
        expect(d.analyser.tekst).not.toMatch(/varmelastens oprindelse kendes ikke for begge/);
    });
    it("en serie mod ingen (syntesen), uden bevis for et valg: også ukendt", () => {
        expect(par([A], []).status).toEqual(["ukendt", "ukendt", "ukendt"]);
    });
    it("samme serie (samme sha256) i begge er ingen afvigelse — heller ikke med et andet id (et importeret arkiv)", () => {
        expect(par([A], [A]).status).toEqual(["ja", "ja", "ja"]);
        expect(par([A], [serie("varmelast", "99999999-9999-4999-8999-999999999999", "a")]).status).toEqual(["ja", "ja", "ja"]);
    });
    it("et UDTRYKKELIGT scenarievalg er parrets ændring og spærrer ikke: en af modelrepoets varmelastfiler", () => {
        expect(par([], [ind("scenarie", "_koersel.heat_csv", "billund_2025.csv")]).status).toEqual(["ja", "ja", "ja"]);
        expect(par([ind("scenarie", "_koersel.heat_csv", "billund_2025.csv")], [A]).status).toEqual(["ja", "ja", "ja"]);
    });
    it("et udtrykkeligt 'syntetisk' (frosset af den manuelle vej) spærrer heller ikke", () => {
        expect(par([ind("scenarie", "_koersel.tidsserie.varmelast", "syntetisk")], [A]).status).toEqual(["ja", "ja", "ja"]);
    });
    it("solprofilen efter samme regel", () => {
        const S1 = serie("solprofil", "33333333-3333-4333-8333-333333333333", "c"), S2 = serie("solprofil", "44444444-4444-4444-8444-444444444444", "d");
        expect(par([S1], [S1]).status).toEqual(["ja", "ja", "ja"]);
        const d = par([S1], [S2]);
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
        expect(d.analyser.tekst).toContain("ikke samme solprofil");
    });
    it("hvad det frosne input beviser om valgets oprindelse", () => {
        expect(tidsseriekilde([A], "varmelast")).toMatchObject({ art: "serie", valg: "ukendt" });              // valgt ELLER værkets aktive
        expect(tidsseriekilde([], "varmelast")).toEqual({ art: "standard", valg: "ukendt" });                  // "syntetisk" i appen ELLER ingen aktiv
        expect(tidsseriekilde([ind("scenarie", "_koersel.heat_csv", "x.csv")], "varmelast")).toEqual({ art: "fil", fil: "x.csv", valg: "udtrykkeligt" });
        expect(tidsseriekilde([], "solprofil")).toEqual({ art: "standard", valg: "arvet" });                   // kan ikke vælges fra i et scenarie
    });
    it("reglen selv: bevisligt arvet på begge sider er et ændret grundlag → NEJ med den grund", () => {
        const arvet = (sha: string): Tidsseriekilde => ({ art: "serie", id: null, sha256: sha.repeat(64), valg: "arvet" });
        const a = tidsserieafvigelse("varmelast", arvet("a"), arvet("b"));
        expect(a).toMatchObject({ alvor: "advarsel", navn: "Værkets varmelast" });
        expect(a?.grund).toContain("grundlaget er ændret mellem kørslerne");
        expect(tidsserieafvigelse("varmelast", arvet("a"), arvet("a"))).toBeNull();
        expect(tidsserieafvigelse("varmelast", arvet("a"), { art: "standard", valg: "udtrykkeligt" })).toBeNull();
        expect(tidsserieafvigelse("varmelast", null, arvet("a"))).toMatchObject({ alvor: "ukendt" });
    });
});

describe("fund D(3): Scenarier bruger de frosne input, hvor de findes", () => {
    const input = [...tid("2025-07-01T00:00:00Z", "2026-06-30T23:00:00Z"), ...datoer("2026-01-05", "2026-01-06"), ...pins];
    const UDEN_PIN = { model_commit: null } as unknown as Partial<Koersel>;

    it("modelpinnen mangler på rækken, men står i begge frosne input: JA begge steder (før: ukendt i Scenarier, ja i Analyser)", () => {
        const d = dømt(koersel(ref, 866_567.72, M56, UDEN_PIN), input, koersel(scen, 843_051.76, M56, UDEN_PIN), input);
        expect(d.status).toEqual(["ja", "ja", "ja"]);
        expect(d.side.diff?.delta).toBeCloseTo(-23_515.96, 2);
        expect(d.oversigt).toMatchObject({ art: "par", direkte: true });
    });
    it("uden de frosne input ved hånden er svaret ukendt — med felterne nævnt i cellen", () => {
        const r = koersel(ref, 866_567.72, M56, UDEN_PIN), k = koersel(scen, 843_051.76, M56, UDEN_PIN);
        const o = findReference(scen, [ref, scen], [k, r]);
        expect(o).toMatchObject({ art: "par", dom: "ukendt" });
        const { container } = render(<ReferenceCelle r={o} />);
        expect(container.textContent).toContain("kan ikke afgøres");
        expect(container.textContent).toContain("modelversion");
    });
    it("den korte frosne profil henter kørslens egne rækker OG værkets tidsblok — ikke hele værket", () => {
        expect([...PROFIL_VAERKSSTIER]).toEqual(["time.start", "time.end", "time.resolution"]);
        const f = JSON.stringify(kortProfilFilter(["k1", "k2"]));
        for (const s of ["time.start", "time.end", "time.resolution", "aendring", "scenarie", "k1", "k2"]) expect(f).toContain(`"${s}"`);
    });
});

describe("fund D(4): oversigtens fodtekst kalder ikke en note for et krav", () => {
    it("revisionen er kun et krav, når den kendes for begge", () => {
        // Før: "Direkte sammenlignelig = samme værk og værksrevision, periode, …" — men en ukendt revision er kun en note.
        expect(OVERSIGT_FOD).not.toMatch(/samme værk og værksrevision/);
        expect(OVERSIGT_FOD).toMatch(/En kendt forskel i værksrevision bryder også; kendes revisionen ikke for begge, er det kun en note/);
        expect(OVERSIGT_FOD).toMatch(/varmelast og solprofil/);
    });
});
