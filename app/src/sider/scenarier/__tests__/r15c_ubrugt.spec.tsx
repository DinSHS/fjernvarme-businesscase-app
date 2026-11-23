// Tredje rettelsesrunde i runde 15, P2-4: "Ubrugte solprofiler kan gøre et gyldigt par ukendt."
//
// (1) To kørsler med samme værk og revision, pins, gab og periode kan have hver sin frosne solprofil-hash, selv om
//     ingen af dem BRUGER en solprofil: værkets aktive profilfil er skiftet imellem (uden en værksrevision), og værket
//     har ingen aktiv solvarmeenhed. Arbejderen skriver da serien under `manifest_json.tidsserier.ubrugt`
//     (fabric/fjv/koersel.py › tidsserie_brug). Dommen sagde "kan ikke afgøres" om et par, hvor forskellen ikke indgik
//     i nogen af de to beregninger.
// (2) En ældre Andeby-kørsel læser casens egen profilfil (`data/solar_andeby_dmi_karup.csv`), en nyere har SAMME fil
//     frosset som tidsserie i appens normaliserede form. Dommen sammenlignede "værkets egen profil" med en seriehash.
//
// Leads afgørelse: en solprofil (og varmelast), som manifestet dokumenterer som ubrugt på BEGGE sider, indgår ikke i
// dommen. Den pinnede repo-profil og dens kendte normaliserede hash er samme kilde, når frossen sti og version
// beviser det (viden/referencetal.json › solprofil_sti, solprofil_model_commits).
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { iKortProfil, kortProfilFilter } from "@/lib/data/frossen-profil";
import type { Koersel } from "../../../../rayfin/data/Koersel";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import { profil, sammenlignelighedsDom, tidsseriekildeTekst } from "../../analyser/beregn";
import { kendtRepoProfil } from "../../analyser/repoprofiler";
import { Sammenlignelighed } from "../../analyser/sammenlign";
import type { Pakke } from "../../analyser/data";
import { modReference } from "../koersel-logik";
import { findReference } from "../oversigt-logik";

afterEach(cleanup);

const ind = (kilde: InputRække["kilde"], sti: string, v: unknown): InputRække => ({ kilde, sti, vaerdi_json: JSON.stringify(v) });
const MODEL = "939228aa048563c8498382a79d207c8b03fbda57", DATA = "106b9fce9a2e3610090b1a542559024056449b88";
const fælles = (model = MODEL): InputRække[] => [
    ind("vaerk", "time.start", "2025-07-01T00:00:00Z"), ind("vaerk", "time.end", "2026-06-30T23:00:00Z"), ind("vaerk", "time.resolution", "1h"),
    ind("scenarie", "_koersel.start", "2026-01-05"), ind("scenarie", "_koersel.slut", "2026-01-06"),
    ind("scenarie", "_koersel.model_commit", model), ind("scenarie", "_koersel.data_commit", DATA),
];
const sol = (id: string, sha: string) => ind("scenarie", "_koersel.tidsserie.solprofil", { id, sha256: sha });
const SHA_A = "a".repeat(64), SHA_B = "b".repeat(64);
/** Hashen af Andebys solprofil i appens normaliserede form (viden/referencetal.json › solprofil_sha256). */
const ANDEBY_SOL = "35706793bf4dd9c81d88c2b045e39ef9866c17ccfb86e0703067fb42a9e93f29";
const STI = "data/solar_andeby_dmi_karup.csv";

const ref = { id: "s1", vaerk_id: "v1", navn: "Reference", arkiveret: false, oprettet: new Date(Date.UTC(2026, 10, 18, 8)), med_balancering: false } as Scenarie;
const scen = { ...ref, id: "s2", navn: "Scenarie", reference_scenarie_id: "s1", oprettet: new Date(Date.UTC(2026, 10, 18, 9)) } as Scenarie;
let n = 0;
type Brug = { anvendt?: Record<string, { id: string; sha256: string }>; ubrugt?: Record<string, { id: string; sha256: string; grund?: string }> };
function koersel(s: Scenarie, tidsserier?: Brug, model = MODEL): Koersel {
    n++;
    return {
        id: `k${n}`, scenarie_id: s.id, vaerk_id: s.vaerk_id, vaerk_revision: 1, status: "faerdig", objektiv_dkk: 866_000 + n, best_bound: 866_000, solve_status: "optimal",
        oploesning: "1h", data_commit: DATA, model_commit: model, oensket_rel_gap: 0.0002, oensket_abs_gap: 100,
        manifest_json: JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-06", oploesning: "1h" }, ...(tidsserier ? { tidsserier } : {}) }),
        bestilt: new Date(Date.UTC(2026, 10, 18, 10, n)), afsluttet: new Date(Date.UTC(2026, 10, 18, 11, n)), bestilt_af: "a@b.dk",
    } as Koersel;
}
const ubrugt = (rolle: string, id: string, sha: string): Brug => ({ anvendt: {}, ubrugt: { [rolle]: { id, sha256: sha, grund: "ingen aktiv enhed bruger den" } } });
const anvendt = (rolle: string, id: string, sha: string): Brug => ({ anvendt: { [rolle]: { id, sha256: sha } }, ubrugt: {} });

/** Samme par dømt alle tre steder: Analyser, scenariets side og oversigten. */
function dømt(r: Koersel, ri: InputRække[], k: Koersel, ki: InputRække[]) {
    const analyser = sammenlignelighedsDom(profil(r, "Andeby", ref, ri), profil(k, "Andeby", scen, ki));
    const side = modReference(r, k, { reference: ri, k: ki });
    const oversigt = findReference(scen, [ref, scen], [k, r], new Map([[r.id, ri], [k.id, ki]]));
    return { analyser, side, status: [analyser.status, side.dom?.status, oversigt?.art === "par" ? oversigt.dom : undefined] };
}

describe("P2-4 (1) · en tidsserie, begge kørsler dokumenterer som ubrugt, indgår ikke i dommen", () => {
    it("efterprøvningens tilfælde: hver sin frosne solprofil, begge under manifestets `ubrugt` → JA alle tre steder", () => {
        const d = dømt(koersel(ref, ubrugt("solprofil", "x1", SHA_A)), [...fælles(), sol("x1", SHA_A)], koersel(scen, ubrugt("solprofil", "x2", SHA_B)), [...fælles(), sol("x2", SHA_B)]);
        // Før rettelsen: "ukendt" alle tre steder (Solprofilens oprindelse) — og ingen ΔRef.
        expect(d.status).toEqual(["ja", "ja", "ja"]);
        expect(d.side.diff).toBeDefined();
        expect(d.analyser.afvigelser.find((x) => x.felt === "solprofil")).toBeUndefined();
    });
    it("kun den ene side er dokumenteret ubrugt: den anden kan have regnet på sin → stadig ukendt", () => {
        const d = dømt(koersel(ref, ubrugt("solprofil", "x1", SHA_A)), [...fælles(), sol("x1", SHA_A)], koersel(scen, anvendt("solprofil", "x2", SHA_B)), [...fælles(), sol("x2", SHA_B)]);
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
    });
    it("uden manifestets registrering (ældre kørsler) er intet dokumenteret → stadig ukendt", () => {
        const d = dømt(koersel(ref), [...fælles(), sol("x1", SHA_A)], koersel(scen), [...fælles(), sol("x2", SHA_B)]);
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
    });
    it("manifestet skal tale om netop den frosne serie: en anden sha256 under `ubrugt` dokumenterer intet", () => {
        const d = dømt(koersel(ref, ubrugt("solprofil", "x1", "c".repeat(64))), [...fælles(), sol("x1", SHA_A)], koersel(scen, ubrugt("solprofil", "x2", SHA_B)), [...fælles(), sol("x2", SHA_B)]);
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
    });
    it("det samme gælder en varmelast, begge dokumenterer som ubrugt", () => {
        const varme = (id: string, sha: string) => ind("scenarie", "_koersel.tidsserie.varmelast", { id, sha256: sha });
        const d = dømt(koersel(ref, ubrugt("varmelast", "x1", SHA_A)), [...fælles(), varme("x1", SHA_A)], koersel(scen, ubrugt("varmelast", "x2", SHA_B)), [...fælles(), varme("x2", SHA_B)]);
        expect(d.status).toEqual(["ja", "ja", "ja"]);
    });
    it("tabellen siger, at serien ikke bruges, og teksten kalder det ikke et scenarievalg", () => {
        const r = koersel(ref, ubrugt("solprofil", "x1", SHA_A)), k = koersel(scen, ubrugt("solprofil", "x2", SHA_B));
        const pa = profil(r, "Andeby", ref, [...fælles(), sol("x1", SHA_A)]), pb = profil(k, "Andeby", scen, [...fælles(), sol("x2", SHA_B)]);
        expect(tidsseriekildeTekst("solprofil", pa.solprofil)).toBe("tidsserie aaaaaaaaaaaa (bruges ikke)");
        const { container } = render(<Sammenlignelighed a={{ k: r, profil: pa } as unknown as Pakke} b={{ k, profil: pb } as unknown as Pakke} />);
        const tekst = container.textContent ?? "";
        expect(tekst).toContain("Direkte sammenlignelige");
        expect(tekst).toContain("(bruges ikke)");
        // Før (hvis dommen var blevet "ja" på anden vis): "Solprofilen er forskellig, men valgt i scenariet".
        expect(tekst).not.toMatch(/valgt i scenariet/);
        expect(tekst).toMatch(/Solprofilen er forskellig, men ingen af kørslerne bruger den/);
    });
});

describe("P2-4 (2) · den pinnede repo-profil og dens kendte normaliserede hash er samme kilde", () => {
    const repo = ind("vaerk", "units.solvarme.production_profile_path", STI);
    it("den kendte hash for Andebys profil ved de tre målte modelversioner — og kun dér", () => {
        expect(kendtRepoProfil(STI, MODEL)).toBe(ANDEBY_SOL);
        expect(kendtRepoProfil(STI, "eef950a2ac7b3808a9456dcf48742ce08e52366a")).toBe(ANDEBY_SOL);
        expect(kendtRepoProfil(STI, "90fb16eb1e2d5aa8e619b5a951b93760fa803985")).toBe(ANDEBY_SOL);
        expect(kendtRepoProfil(STI, "0".repeat(40))).toBeNull();                          // en version, hvor filen ikke er målt
        expect(kendtRepoProfil(STI, null)).toBeNull();
        expect(kendtRepoProfil("data/en_anden.csv", MODEL)).toBeNull();
    });
    it("ældre kørsel på casens egen profilfil mod en nyere med SAMME fil frosset som tidsserie → JA alle tre steder", () => {
        const d = dømt(koersel(ref), [...fælles(), repo], koersel(scen, anvendt("solprofil", "x2", ANDEBY_SOL)), [...fælles(), repo, sol("x2", ANDEBY_SOL)]);
        // Før rettelsen: "ukendt" — "værkets egen profil" over for "tidsserie 35706793bf4d".
        expect(d.status).toEqual(["ja", "ja", "ja"]);
        expect(d.analyser.afvigelser.find((x) => x.felt === "solprofil")).toBeUndefined();
    });
    it("en ANDEN seriehash er ikke samme kilde → stadig ukendt", () => {
        const d = dømt(koersel(ref), [...fælles(), repo], koersel(scen, anvendt("solprofil", "x2", SHA_B)), [...fælles(), repo, sol("x2", SHA_B)]);
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
    });
    it("uden den frosne sti er der intet bevis → stadig ukendt", () => {
        const d = dømt(koersel(ref), fælles(), koersel(scen, anvendt("solprofil", "x2", ANDEBY_SOL)), [...fælles(), sol("x2", ANDEBY_SOL)]);
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
    });
    it("ved en modelversion, hvor filen ikke er målt, er der intet bevis", () => {
        const anden = "1".repeat(40);
        const d = dømt(koersel(ref, undefined, anden), [...fælles(anden), repo], koersel(scen, anvendt("solprofil", "x2", ANDEBY_SOL), anden), [...fælles(anden), repo, sol("x2", ANDEBY_SOL)]);
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
    });
    it("to enheder med hver sin profilfil: det frosne input beviser ikke én kilde", () => {
        const to = [repo, ind("vaerk", "units.sol2.production_profile_path", "data/en_anden.csv")];
        const d = dømt(koersel(ref), [...fælles(), ...to], koersel(scen, anvendt("solprofil", "x2", ANDEBY_SOL)), [...fælles(), ...to, sol("x2", ANDEBY_SOL)]);
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
    });
    it("tabellen viser stien, og teksten kalder det ikke et scenarievalg", () => {
        const r = koersel(ref), k = koersel(scen, anvendt("solprofil", "x2", ANDEBY_SOL));
        const pa = profil(r, "Andeby", ref, [...fælles(), repo]), pb = profil(k, "Andeby", scen, [...fælles(), repo, sol("x2", ANDEBY_SOL)]);
        expect(tidsseriekildeTekst("solprofil", pa.solprofil)).toBe(`værkets egen profil (${STI})`);
        const { container } = render(<Sammenlignelighed a={{ k: r, profil: pa } as unknown as Pakke} b={{ k, profil: pb } as unknown as Pakke} />);
        const tekst = container.textContent ?? "";
        expect(tekst).toContain("Direkte sammenlignelige");
        expect(tekst).not.toMatch(/valgt i scenariet/);
        expect(tekst).toMatch(/samme fil/);
    });
});

describe("P2-4 · den korte frosne profil bærer det, beviset kræver (oversigten og kandidatlisten)", () => {
    it("filteret henter enhedernes profilsti ud over tidsblokken", () => {
        const f = JSON.stringify(kortProfilFilter(["k1"]));
        expect(f).toContain('{"sti":{"endsWith":".production_profile_path"}}');
        expect(iKortProfil({ kilde: "vaerk", sti: "units.solvarme.production_profile_path" })).toBe(true);
        expect(iKortProfil({ kilde: "vaerk", sti: "units.solvarme.p_max" })).toBe(false);
        expect(iKortProfil({ kilde: "vaerk", sti: "time.start" })).toBe(true);
    });
});
