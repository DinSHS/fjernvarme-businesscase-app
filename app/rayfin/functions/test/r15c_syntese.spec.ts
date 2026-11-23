// @vitest-environment node
//-----------------------------------------------------------------------
// Tredje rettelsesrunde i runde 15, P2-3: appens udtrykkelige syntesevalg fryses som `"syntetisk"`.
//
// *Målt varmelast* bygger en syntetisk reference og et målt scenarie. Scenariets `_tidsserie.varmelast = "syntetisk"`
// frøs INGEN række, så en kørsel, der bevidst valgte syntesen, ikke kunne skelnes fra en, hvor værket bare ingen
// aktiv serie havde. Over for en af værkets egne tidsserier blev dommen derfor "kan ikke afgøres" — uden ΔRef.
//
// Den manuelle vej (fjv.db.oploes_tidsserier) fryser allerede valget som `_koersel.tidsserie.varmelast = "syntetisk"`,
// og arbejderen læser den række som "ingen tidsserie" (fabric/fjv/byg_case.py › byg). Appvejen gør nu det samme:
// ingen ændring af rækkeskema eller arbejderens format. Kaldene her optages til de fælles vektorer og binder
// Python-porten (community/fjernvarme_app/logik/regler.py).
//-----------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { ArkivAfvisning, frosneTidsserier } from "../src/arkiv";
import { FROSSET_SYNTETISK } from "../src/frysning";
import { bygFrossetInput, type Parameter, type ScenarieAendringRad, type ScenarieRad, type TidsserieRad } from "../src/logik";

const VÆRK: Parameter[] = [
    { sti: "meta.case_name", vaerdi_json: '"probe"' },
    { sti: "time.start", vaerdi_json: '"2026-01-05T00:00:00Z"' },
    { sti: "time.end", vaerdi_json: '"2026-01-11T23:00:00Z"' },
    { sti: "time.resolution", vaerdi_json: '"1h"' },
    { sti: "units.halmkedel.enabled", vaerdi_json: "true" },
];
const SCEN: ScenarieRad = { med_balancering: false };
const SHA = "a".repeat(64);
const ts = (o: Partial<TidsserieRad> = {}): TidsserieRad => ({
    id: "11111111-1111-4111-8111-111111111111", rolle: "varmelast", navn: "Målt 2025", sha256: SHA, sti: `fjv/tidsserier/probe/${SHA}.csv`,
    oploesning: "1h", start: "2025-01-01T00:00:00.000Z", slut: "2026-12-31T23:00:00.000Z", aktiv: true, ...o,
});
const SYNTESE: ScenarieAendringRad = { type: "set", sti: "_tidsserie.varmelast", vaerdi_json: '"syntetisk"', raekkefoelge: 1 } as ScenarieAendringRad;
const frosset = (r: { rækker: { kilde: string; sti: string; vaerdi_json: string }[] }) => r.rækker.find((x) => x.sti === "_koersel.tidsserie.varmelast");

describe("P2-3 · bygFrossetInput fryser det udtrykkelige syntesevalg", () => {
    it('"syntetisk" trods en aktiv serie: rækken er den, den manuelle vej allerede skriver', () => {
        // Før rettelsen: ingen række (undefined).
        expect(frosset(bygFrossetInput(VÆRK, [SYNTESE], SCEN, {}, [ts()]))).toEqual({ kilde: "scenarie", sti: "_koersel.tidsserie.varmelast", vaerdi_json: '"syntetisk"' });
        expect(FROSSET_SYNTETISK).toBe('"syntetisk"');
    });
    it('"syntetisk" uden nogen tidsserier på værket fryses også — valget er scenariets, ikke værkets', () => {
        expect(frosset(bygFrossetInput(VÆRK, [SYNTESE], SCEN, {}, []))?.vaerdi_json).toBe('"syntetisk"');
    });
    it("uden et valg og uden en aktiv serie fryses ingen række (som før) — og de to input har hver sin hash", () => {
        const arvet = bygFrossetInput(VÆRK, [], SCEN, {}, []);
        expect(frosset(arvet)).toBeUndefined();
        expect(bygFrossetInput(VÆRK, [SYNTESE], SCEN, {}, []).hash).not.toBe(arvet.hash);
    });
    it('sammen med en af repoets varmelastfiler fryses "syntetisk" IKKE: arbejderen bruger filen, og filen er beviset', () => {
        const r = bygFrossetInput(VÆRK, [SYNTESE], { ...SCEN, heat_csv: "billund_abvaerk_hourly.csv" }, {}, [ts()]);
        expect(frosset(r)).toBeUndefined();
        expect(r.rækker.some((x) => x.sti === "_koersel.heat_csv")).toBe(true);
    });
    it("solprofilen fryses stadig ved siden af", () => {
        const r = bygFrossetInput(VÆRK, [SYNTESE], SCEN, {}, [ts(), ts({ rolle: "solprofil", id: "33333333-3333-4333-8333-333333333333", sha256: "d".repeat(64) })]);
        expect(r.rækker.filter((x) => x.sti.startsWith("_koersel.tidsserie.")).map((x) => x.sti).sort()).toEqual(["_koersel.tidsserie.solprofil", "_koersel.tidsserie.varmelast"]);
    });
});

describe("P2-3 · arkivets tjek accepterer rækken fra appvejen (som arbejderen gør)", () => {
    const rad = (rolle: string, v: unknown) => ({ kilde: "scenarie" as const, sti: `_koersel.tidsserie.${rolle}`, vaerdi_json: JSON.stringify(v) });
    it('"syntetisk" for varmelasten er ingen tidsserie at slå op', () => {
        // Før rettelsen: ArkivAfvisning "_koersel.tidsserie.varmelast mangler id eller sha256." — også for den manuelle vejs kørsler.
        expect(frosneTidsserier([rad("varmelast", "syntetisk")])).toEqual([]);
        expect(frosneTidsserier([rad("varmelast", "syntetisk"), rad("solprofil", { id: "x", sha256: SHA })])).toEqual([{ rolle: "solprofil", id: "x", sha256: SHA }]);
    });
    it("null er heller ingen tidsserie (arbejderen læser den som udeladt)", () => {
        expect(frosneTidsserier([rad("varmelast", null)])).toEqual([]);
    });
    it('alt andet afvises stadig: "syntetisk" som solprofil, en anden tekst, et objekt uden sha256', () => {
        for (const r of [rad("solprofil", "syntetisk"), rad("varmelast", "maalt"), rad("varmelast", { id: "x" }), rad("varmelast", 12)]) {
            expect(() => frosneTidsserier([r])).toThrow(ArkivAfvisning);
        }
    });
});
