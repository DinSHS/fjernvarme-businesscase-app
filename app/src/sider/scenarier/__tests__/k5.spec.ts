//-----------------------------------------------------------------------
// Codex K5 (udviklingsrapport), F6 og F7 — skrevet FØR rettelsen.
//-----------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { bygFrossetInput, type TidsserieRad } from "../../../../rayfin/functions/src/logik";
import { forventetFrosset, frosset, sammeKort, type Blade, type Scenariefelter, type Ændring } from "../logik";
import { kodVarmelast, læsVarmelast, tjekVarmelast, varmelastMuligheder, type TidsserieInfo } from "../varmelast";
import { VAERKER } from "./vaerker.testdata";

const blade: Blade = new Map(Object.entries(VAERKER.billund_sporb));

const AKTIV = {
    id: "11111111-1111-4111-8111-111111111111", rolle: "varmelast" as const, navn: "Billund målt 2025–26", sha256: "a".repeat(64),
    sti: "Files/fjv/tidsserier/billund_sporb/a.csv", oploesning: "1h", start: "2025-07-01T00:00:00Z", slut: "2026-06-30T23:00:00Z",
    status: "gyldig", aktiv: true,
};
const ANDEN = { ...AKTIV, id: "22222222-2222-4222-8222-222222222222", navn: "Billund anden", sha256: "b".repeat(64), aktiv: false };
const SOL = { ...AKTIV, id: "44444444-4444-4444-8444-444444444444", rolle: "solprofil" as const, navn: "Sol", sha256: "d".repeat(64) };

describe("K5-F6: et eksplicit valg gemmes altid — kun 'værkets aktive' udelades", () => {
    it("syntetisk uden aktiv serie gemmes stadig som \"syntetisk\"", () => {
        expect(kodVarmelast({ type: "syntetisk" }, []).aendring?.vaerdi_json).toBe('"syntetisk"');
    });
    it("…og forbliver syntetisk, når en serie senere aktiveres", () => {
        const gemt = kodVarmelast({ type: "syntetisk" }, []);
        expect(læsVarmelast(gemt.aendring ? [gemt.aendring] : [], gemt.heat_csv, [AKTIV])).toEqual({ type: "syntetisk" });
    });
    it("et eksplicit serie-id gemmes, også når serien tilfældigvis er den aktive", () => {
        const gemt = kodVarmelast({ type: "tidsserie", id: AKTIV.id }, [AKTIV, ANDEN]);
        expect(gemt.aendring?.vaerdi_json).toBe(JSON.stringify(AKTIV.id));
        // Bliver en anden serie aktiv, holder scenariet fast i sit valg.
        expect(læsVarmelast([gemt.aendring!], null, [{ ...AKTIV, aktiv: false }, { ...ANDEN, aktiv: true }])).toEqual({ type: "tidsserie", id: AKTIV.id });
    });
    it("'værkets aktive' gemmer ingen ændring og følger den aktive", () => {
        expect(kodVarmelast({ type: "aktiv" }, [AKTIV])).toEqual({ heat_csv: null });
        expect(læsVarmelast([], null, [])).toEqual({ type: "aktiv" });
    });
    it("'følg værkets aktive' kan vælges, også før værket har en aktiv serie, og er ikke en fejl", () => {
        const mul = varmelastMuligheder([], "andeby").map((x) => x.valg.type);
        expect(mul).toEqual(["aktiv", "syntetisk"]);
        expect(tjekVarmelast({ type: "aktiv" }, [], { start: "2026-01-05", slut: "2026-01-16" })).toEqual([]);
    });
});

describe("K5-F7: klientens forventede frysning = backendens bygFrossetInput", () => {
    const felter: Scenariefelter = {
        periode_start: "2026-01-05", periode_slut: "2026-01-16", med_balancering: false, balancing_method: null,
        mip_rel_gap: 0.0002, mip_abs_gap: 100, tidsgraense_s: null, ekstra_flag: null, heat_csv: null,
    };
    const params = [...blade].map(([sti, vaerdi_json]) => ({ sti, vaerdi_json }));
    const rad = (s: TidsserieInfo & { sti: string; oploesning: string; start: string; slut: string }): TidsserieRad =>
        ({ id: s.id, rolle: s.rolle as TidsserieRad["rolle"], navn: s.navn, sha256: s.sha256!, sti: s.sti, oploesning: s.oploesning, start: s.start, slut: s.slut, aktiv: s.aktiv });

    function sammenlign(ændringer: Ændring[], f: Scenariefelter, serier: (typeof AKTIV | typeof SOL)[]) {
        const backend = bygFrossetInput(params, ændringer.map((æ, i) => ({ type: æ.type, sti: æ.sti, vaerdi_json: æ.vaerdi_json ?? null, raekkefoelge: i + 1 })),
            f, {}, serier.map(rad));
        const klient = forventetFrosset(ændringer, f, blade, serier);
        const faktisk = frosset(backend.rækker);
        return { klient, faktisk, ens: sammeKort(klient, faktisk) };
    }

    it("aktiv varmelast + aktiv solprofil (standarden): samme kort, begge roller fryses som {id, sha256}", () => {
        const r = sammenlign([], felter, [AKTIV, SOL]);
        expect(r.faktisk.get("_koersel.tidsserie.varmelast")).toBe(JSON.stringify({ id: AKTIV.id, sha256: AKTIV.sha256 }));
        expect(r.faktisk.get("_koersel.tidsserie.solprofil")).toBe(JSON.stringify({ id: SOL.id, sha256: SOL.sha256 }));
        expect([...r.klient.entries()].sort()).toEqual([...r.faktisk.entries()].sort());
        expect(r.ens).toBe(true);
    });
    it("eksplicit anden varmelast-serie", () => {
        expect(sammenlign([{ type: "set", sti: "_tidsserie.varmelast", vaerdi_json: JSON.stringify(ANDEN.id) }], felter, [AKTIV, { ...ANDEN, aktiv: false }, SOL]).ens).toBe(true);
    });
    it("eksplicit syntetisk varmelast (solprofilen fryses stadig)", () => {
        const r = sammenlign([{ type: "set", sti: "_tidsserie.varmelast", vaerdi_json: '"syntetisk"' }], felter, [AKTIV, SOL]);
        expect(r.faktisk.has("_koersel.tidsserie.varmelast")).toBe(false);
        expect(r.ens).toBe(true);
    });
    it("repoets fil (heat_csv) slår den aktive varmelast fra", () => {
        expect(sammenlign([], { ...felter, heat_csv: "billund_abvaerk_hourly_splejset_jun2026.csv" }, [AKTIV, SOL]).ens).toBe(true);
    });
    it("kun en solprofil, ingen målt varmelast (Codex' eksempel)", () => {
        expect(sammenlign([{ type: "disable", sti: "tank_eksisterende" }], felter, [SOL]).ens).toBe(true);
    });
});
