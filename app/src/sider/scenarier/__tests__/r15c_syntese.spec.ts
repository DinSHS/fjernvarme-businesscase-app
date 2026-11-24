// Tredje rettelsesrunde i runde 15, P2-3: "Appens *Målt varmelast* mister resultatet for værkets egne tidsserier."
//
// *Målt varmelast* bygger en syntetisk reference og et målt scenarie. Vælges en af værkets egne serier, fik parret
// *kan ikke afgøres* og mistede ΔRef: referencens udtrykkelige "syntetisk" frøs ingen række, så det frosne input ikke
// kunne bevise, at syntesen var VALGT. Appvejen fryser nu valget som `_koersel.tidsserie.varmelast = "syntetisk"`
// (den række, den manuelle vej og arbejderen allerede kender), klienten forudsiger den, og dommen læser den som et
// bevisligt valg. Ældre kørsler uden rækken forbliver *ukendt*.
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import type { Koersel } from "../../../../rayfin/data/Koersel";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import { bygFrossetInput, type TidsserieRad } from "../../../../rayfin/functions/src/logik";
import { profil, sammenlignelighedsDom, tidsserieafvigelse, tidsseriekilde } from "../../analyser/beregn";
import { forventetFrosset, frosset, frossetRækker, sammeKort, type Blade, type Scenariefelter, type Ændring } from "../logik";
import { modReference } from "../koersel-logik";
import type { TidsserieInfo } from "../varmelast";
import { VAERKER } from "./vaerker.testdata";

const blade: Blade = new Map(Object.entries(VAERKER.billund_sporb));
const params = [...blade].map(([sti, vaerdi_json]) => ({ sti, vaerdi_json }));
const felter: Scenariefelter = {
    periode_start: "2026-01-05", periode_slut: "2026-01-16", med_balancering: false, balancing_method: null,
    mip_rel_gap: 0.0002, mip_abs_gap: 100, tidsgraense_s: null, ekstra_flag: null, heat_csv: null,
};
const AKTIV = {
    id: "11111111-1111-4111-8111-111111111111", rolle: "varmelast" as const, navn: "Billund målt 2025–26", sha256: "a".repeat(64),
    sti: "Files/fjv/tidsserier/billund_sporb/a.csv", oploesning: "1h", start: "2025-07-01T00:00:00Z", slut: "2026-06-30T23:00:00Z",
    status: "gyldig", aktiv: true,
};
type Serie = typeof AKTIV;
const rad = (s: Serie): TidsserieRad => ({ id: s.id, rolle: s.rolle, navn: s.navn, sha256: s.sha256, sti: s.sti, oploesning: s.oploesning, start: s.start, slut: s.slut, aktiv: s.aktiv });
const SYNTESE: Ændring = { type: "set", sti: "_tidsserie.varmelast", vaerdi_json: '"syntetisk"' };
const PINS = { model_commit: "939228aa048563c8498382a79d207c8b03fbda57", data_commit: "106b9fce9a2e3610090b1a542559024056449b88" };
const backend = (ændringer: Ændring[], f: Scenariefelter, serier: Serie[]) =>
    bygFrossetInput(params, ændringer.map((æ, i) => ({ type: æ.type, sti: æ.sti, vaerdi_json: æ.vaerdi_json ?? null, raekkefoelge: i + 1 })), f, PINS, serier.map(rad));

describe("P2-3 · klientens forudsigelse følger backenden", () => {
    it('udtrykkeligt "syntetisk": begge har rækken `_koersel.tidsserie.varmelast = "syntetisk"`', () => {
        const faktisk = frosset(backend([SYNTESE], felter, [AKTIV]).rækker);
        const klient = forventetFrosset([SYNTESE], felter, blade, [AKTIV] as TidsserieInfo[]);
        expect(faktisk.get("_koersel.tidsserie.varmelast")).toBe('"syntetisk"');       // før: ingen række
        expect(klient.get("_koersel.tidsserie.varmelast")).toBe('"syntetisk"');
        expect(sammeKort(klient, faktisk)).toBe(true);
    });
    it("valget forudsiges også, når værkets tidsserier ikke er hentet (det afhænger ikke af dem)", () => {
        expect(frossetRækker([SYNTESE], felter, blade).find((r) => r.sti === "_koersel.tidsserie.varmelast")).toEqual({ kilde: "scenarie", sti: "_koersel.tidsserie.varmelast", vaerdi_json: '"syntetisk"' });
    });
    it('med en af repoets filer forudsiges "syntetisk" ikke — som backenden', () => {
        const f = { ...felter, heat_csv: "billund_abvaerk_hourly_splejset_jun2026.csv" };
        const faktisk = frosset(backend([SYNTESE], f, [AKTIV]).rækker), klient = forventetFrosset([SYNTESE], f, blade, [AKTIV] as TidsserieInfo[]);
        expect(klient.has("_koersel.tidsserie.varmelast")).toBe(false);
        expect(sammeKort(klient, faktisk)).toBe(true);
    });
    it("en ældre referencekørsel UDEN rækken er ikke samme kort som det nye valg: den genbruges ikke, og en ny reference får beviset", () => {
        const gammel = frosset(backend([SYNTESE], felter, [AKTIV]).rækker);
        gammel.delete("_koersel.tidsserie.varmelast");                 // som frosset før denne rettelse
        expect(sammeKort(forventetFrosset([SYNTESE], felter, blade, [AKTIV] as TidsserieInfo[]), gammel)).toBe(false);
    });
});

describe("P2-3 · dommen: frosset \"syntetisk\" over for en serie er et bevisligt valg", () => {
    const ref = { id: "s1", vaerk_id: "v1", navn: "Målt varmelast · reference", arkiveret: false, oprettet: new Date(Date.UTC(2026, 10, 23, 8)), med_balancering: false } as Scenarie;
    const scen = { ...ref, id: "s2", navn: "Målt varmelast · scenarie", reference_scenarie_id: "s1", oprettet: new Date(Date.UTC(2026, 10, 23, 9)) } as Scenarie;
    let n = 0;
    const koersel = (s: Scenarie): Koersel => {
        n++;
        return {
            id: `k${n}`, scenarie_id: s.id, vaerk_id: s.vaerk_id, vaerk_revision: 1, status: "faerdig", objektiv_dkk: 1_000_000 + n, best_bound: 1_000_000, solve_status: "optimal",
            oploesning: "1h", data_commit: PINS.data_commit, model_commit: PINS.model_commit, oensket_rel_gap: 0.0002, oensket_abs_gap: 100,
            manifest_json: JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-16", oploesning: "1h" } }),
            bestilt: new Date(Date.UTC(2026, 10, 23, 10, n)), afsluttet: new Date(Date.UTC(2026, 10, 23, 11, n)), bestilt_af: "a@b.dk",
        } as Koersel;
    };
    const dømt = (ri: InputRække[], ki: InputRække[]) => {
        const r = koersel(ref), k = koersel(scen);
        return { analyser: sammenlignelighedsDom(profil(r, "Billund", ref, ri), profil(k, "Billund", scen, ki)), side: modReference(r, k, { reference: ri, k: ki }) };
    };
    const VALGT: Ændring = { type: "set", sti: "_tidsserie.varmelast", vaerdi_json: JSON.stringify(AKTIV.id) };

    it("*Målt varmelast* med værkets aktive serie: syntetisk reference mod målt scenarie kan sammenlignes — med ΔRef", () => {
        const ri = backend([SYNTESE], felter, [AKTIV]).rækker as InputRække[];
        const ki = backend([], felter, [AKTIV]).rækker as InputRække[];              // "følg værkets aktive"
        const d = dømt(ri, ki);
        // Før rettelsen: "ukendt" begge steder (Varmelastens oprindelse) — og ingen diff.
        expect([d.analyser.status, d.side.dom?.status]).toEqual(["ja", "ja"]);
        expect(d.side.diff).toBeDefined();
    });
    it("…og med en anden af værkets gyldige serier, valgt i scenariet", () => {
        const anden = { ...AKTIV, id: "22222222-2222-4222-8222-222222222222", sha256: "b".repeat(64), aktiv: false };
        const ri = backend([SYNTESE], felter, [AKTIV, anden]).rækker as InputRække[];
        const ki = backend([{ ...VALGT, vaerdi_json: JSON.stringify(anden.id) }], felter, [AKTIV, anden]).rækker as InputRække[];
        expect(dømt(ri, ki).analyser.status).toBe("ja");
    });
    it("også i den omvendte rolle (målt reference, syntetisk scenarie)", () => {
        const ri = backend([VALGT], felter, [AKTIV]).rækker as InputRække[];
        const ki = backend([SYNTESE], felter, [AKTIV]).rækker as InputRække[];
        expect(dømt(ri, ki).analyser.status).toBe("ja");
    });
    it("en ældre kørsel uden beviset forbliver ukendt: ingen række kan være et valg eller et værk uden aktiv serie", () => {
        const ri = (backend([SYNTESE], felter, [AKTIV]).rækker as InputRække[]).filter((r) => r.sti !== "_koersel.tidsserie.varmelast");
        const ki = backend([], felter, [AKTIV]).rækker as InputRække[];
        const d = dømt(ri, ki);
        expect([d.analyser.status, d.side.dom?.status]).toEqual(["ukendt", "ukendt"]);
    });
    it("to forskellige serier uden bevis for et valg er stadig ukendt (uændret)", () => {
        const anden = { ...AKTIV, id: "22222222-2222-4222-8222-222222222222", sha256: "b".repeat(64), aktiv: false };
        const ri = backend([], felter, [AKTIV]).rækker as InputRække[];
        const ki = backend([{ ...VALGT, vaerdi_json: JSON.stringify(anden.id) }], felter, [AKTIV, anden]).rækker as InputRække[];
        expect(dømt(ri, ki).analyser.status).toBe("ukendt");
    });
});

describe("P2-3 · kilden læses, som arbejderen bruger den", () => {
    const ind = (sti: string, v: unknown): InputRække => ({ kilde: "scenarie", sti, vaerdi_json: JSON.stringify(v) });
    it('frosset "syntetisk" er syntesen, valgt udtrykkeligt', () => {
        expect(tidsseriekilde([ind("_koersel.tidsserie.varmelast", "syntetisk")], "varmelast")).toEqual({ art: "standard", valg: "udtrykkeligt" });
    });
    it('"syntetisk" SAMMEN med en repo-fil (kun mulig ad den manuelle vej): arbejderen bruger filen — kilden er filen', () => {
        // Før rettelsen: { art: "standard" } — syntesen, selv om kørslen regnede på filen (byg_case.byg: heat_csv vinder).
        const k = tidsseriekilde([ind("_koersel.tidsserie.varmelast", "syntetisk"), ind("_koersel.heat_csv", "billund_abvaerk_hourly.csv")], "varmelast");
        expect(k).toEqual({ art: "fil", fil: "billund_abvaerk_hourly.csv", valg: "udtrykkeligt" });
    });
    it("syntese mod serie spærrer ikke; syntese mod syntese er samme kilde", () => {
        const syn = tidsseriekilde([ind("_koersel.tidsserie.varmelast", "syntetisk")], "varmelast");
        const serie = tidsseriekilde([ind("_koersel.tidsserie.varmelast", { id: AKTIV.id, sha256: AKTIV.sha256 })], "varmelast");
        expect(tidsserieafvigelse("varmelast", syn, serie)).toBeNull();
        expect(tidsserieafvigelse("varmelast", serie, syn)).toBeNull();
        expect(tidsserieafvigelse("varmelast", syn, tidsseriekilde([], "varmelast"))).toBeNull();
    });
});
