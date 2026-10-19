// @vitest-environment node
//-----------------------------------------------------------------------
// De betroede funktioners rene logik (rayfin/functions/src/logik.ts).
// Køres af appens vitest (vitest.config.ts inkluderer rayfin/functions/test).
//-----------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
    Afvisning, bygFrossetInput, inputHash, læsAnmodning, periodeDoegn, planlægParametre, somFloat,
    type InputRad, type Parameter, type ScenarieRad,
} from "../src/logik";

// Målt 2026-10-16 på en rigtig kørsel (f7289288-…): Functionens hash, og den
// samme værdi regnet af scripts/tjek_hash.py i Python. Ændres hash-definitionen,
// skal notebooken ændres samtidig — derfor er vektoren låst her.
const MÅLTE_RÆKKER: InputRad[] = [
    { kilde: "aendring", sti: "prices.straw.value", vaerdi_json: "50.0" },
    { kilde: "aendring", sti: "units.elkedel.enabled", vaerdi_json: "true" },
    { kilde: "scenarie", sti: "_koersel.med_balancering", vaerdi_json: "false" },
    { kilde: "scenarie", sti: "_koersel.slut", vaerdi_json: "\"2026-01-07\"" },
    { kilde: "scenarie", sti: "_koersel.start", vaerdi_json: "\"2026-01-05\"" },
    { kilde: "scenarie", sti: "solver.mip_rel_gap", vaerdi_json: "0.0002" },
    { kilde: "scenarie", sti: "solver.time_limit", vaerdi_json: "300.0" },
    { kilde: "vaerk", sti: "heat_load_params.baseline_profile_mw", vaerdi_json: "[4.4,4.5]" },
    { kilde: "vaerk", sti: "meta.case_name", vaerdi_json: "\"probe\"" },
    { kilde: "vaerk", sti: "prices.straw.value", vaerdi_json: "45.0" },
    { kilde: "vaerk", sti: "solver.time_limit", vaerdi_json: "600.0" },
    { kilde: "vaerk", sti: "time.end", vaerdi_json: "\"2026-01-11T23:00:00Z\"" },
    { kilde: "vaerk", sti: "time.resolution", vaerdi_json: "\"1h\"" },
    { kilde: "vaerk", sti: "time.start", vaerdi_json: "\"2026-01-05T00:00:00Z\"" },
    { kilde: "vaerk", sti: "units.elkedel.enabled", vaerdi_json: "false" },
    { kilde: "vaerk", sti: "units.halmkedel.enabled", vaerdi_json: "true" },
    { kilde: "vaerk", sti: "units.halmkedel.p_max_heat", vaerdi_json: "12.0" },
];
const MÅLT_HASH = "169838dd844ee523800416924a0752dc230fbca2c9646e95a8732211adb899cd";

const VÆRK: Parameter[] = MÅLTE_RÆKKER.filter((r) => r.kilde === "vaerk").map(({ sti, vaerdi_json }) => ({ sti, vaerdi_json }));
const SCEN: ScenarieRad = { med_balancering: false };

describe("inputHash", () => {
    it("rammer den målte hash (samme som Pythons referenceimplementering)", () => {
        expect(inputHash(MÅLTE_RÆKKER)).toBe(MÅLT_HASH);
    });
    it("er uafhængig af rækkefølgen", () => {
        expect(inputHash([...MÅLTE_RÆKKER].reverse())).toBe(MÅLT_HASH);
    });
    it("skelner 12 fra 12.0", () => {
        const a = inputHash([{ kilde: "vaerk", sti: "x", vaerdi_json: "12" }]);
        const b = inputHash([{ kilde: "vaerk", sti: "x", vaerdi_json: "12.0" }]);
        expect(a).not.toBe(b);
    });
});

describe("bygFrossetInput", () => {
    it("genskaber de målte 17 rækker og deres hash fra værk + scenarie", () => {
        const f = bygFrossetInput(VÆRK,
            [{ type: "set", sti: "prices.straw.value", vaerdi_json: "50.0", raekkefoelge: 1 }, { type: "enable", sti: "elkedel", raekkefoelge: 2 }],
            { med_balancering: false, periode_start: "2026-01-05", periode_slut: "2026-01-07", tidsgraense_s: 300, mip_rel_gap: 0.0002 });
        expect(f.rækker).toHaveLength(17);
        expect(f.hash).toBe(MÅLT_HASH);
        expect(f.effektiv).toMatchObject({ doegn: 3, tidsgraense_s: 300, mip_rel_gap: 0.0002, mip_abs_gap: 5000 });
    });

    const afvises = (navn: string, æ: Parameters<typeof bygFrossetInput>[1], s: Partial<ScenarieRad>, tekst: RegExp) =>
        it(`afviser ${navn}`, () => {
            expect(() => bygFrossetInput(VÆRK, æ, { ...SCEN, ...s })).toThrow(Afvisning);
            expect(() => bygFrossetInput(VÆRK, æ, { ...SCEN, ...s })).toThrow(tekst);
        });

    afvises("en sti der ikke findes", [{ type: "set", sti: "prices.olie.value", vaerdi_json: "1.0", raekkefoelge: 1 }], {}, /ikke findes/);
    afvises("to ændringer på samme sti", [
        { type: "set", sti: "prices.straw.value", vaerdi_json: "1.0", raekkefoelge: 1 },
        { type: "set", sti: "prices.straw.value", vaerdi_json: "2.0", raekkefoelge: 2 },
    ], {}, /samme sti/);
    // K2-F7 (KONTRAKT §6c): tid og solver ændres kun via scenariets egne felter. Fejlede før: en `set time.end` blev
    // accepteret og rapporteret som 2 døgn, mens den materialiserede periode var 731 døgn (Codex' probe).
    afvises("set på time.end (ville omgå periodegrænsen)", [{ type: "set", sti: "time.end", vaerdi_json: "\"2028-01-01T23:00:00Z\"", raekkefoelge: 1 }], {}, /scenariets felter/);
    afvises("set på solver.time_limit (ville omgå tidsgrænsen)", [{ type: "set", sti: "solver.time_limit", vaerdi_json: "7200.0", raekkefoelge: 1 }], {}, /scenariets felter/);
    afvises("set på time.resolution", [{ type: "set", sti: "time.resolution", vaerdi_json: "\"15min\"", raekkefoelge: 1 }], {}, /scenariets felter/);
    afvises("enable og set på samme enabled-sti", [
        { type: "set", sti: "units.elkedel.enabled", vaerdi_json: "true", raekkefoelge: 1 },
        { type: "enable", sti: "elkedel", raekkefoelge: 2 },
    ], {}, /samme sti/);
    afvises("ugyldig JSON i en ændring", [{ type: "set", sti: "prices.straw.value", vaerdi_json: "12,5", raekkefoelge: 1 }], {}, /gyldig JSON/);
    afvises("en ukendt enhed", [{ type: "disable", sti: "kulkedel", raekkefoelge: 1 }], {}, /ingen enhed/);
    afvises("en sti i stedet for et enhedsnavn", [{ type: "disable", sti: "units.halmkedel", raekkefoelge: 1 }], {}, /ikke en sti/);
    afvises("tidsgrænse over 3600 s", [], { tidsgraense_s: 7200 }, /3600/);
    afvises("periode over 366 døgn", [], { periode_start: "2025-01-01", periode_slut: "2026-02-04" }, /366/);
    afvises("kun startdato", [], { periode_start: "2025-01-01" }, /både/);
    afvises("slut før start", [], { periode_start: "2026-02-01", periode_slut: "2026-01-01" }, /før/);
    afvises("en ugyldig dato", [], { periode_start: "2026-02-30", periode_slut: "2026-03-01" }, /gyldig dato/);
    afvises("et flag uden for hvidlisten", [], { ekstra_flag: "--legacy-nettab --rm-rf" }, /ikke tilladt/);
    afvises("en varmelastfil med sti", [], { heat_csv: "../../etc/passwd.csv" }, /filnavn/);
    afvises("et relativt gab ≥ 1", [], { mip_rel_gap: 1 }, /\[0; 1\)/);

    it("K2-F13: afviser et værk med 15min-opløsning (kun 1h i version 1)", () => {
        const v = VÆRK.map((p) => (p.sti === "time.resolution" ? { ...p, vaerdi_json: '"15min"' } : p));
        expect(() => bygFrossetInput(v, [], SCEN)).toThrow(/kun 1h/);
    });
    it("K2-F8: fryser model- og data-revision i inputtet, så de indgår i hashen", () => {
        const pins = { model_commit: "b49aeb0af097be42938b80a0fea6acdd77162836", data_commit: "392992c7fe35992e79fba8d1ba7b91967e8d1481" };
        const uden = bygFrossetInput(VÆRK, [], SCEN);
        const med = bygFrossetInput(VÆRK, [], SCEN, pins);
        const m = new Map(med.rækker.filter((r) => r.kilde === "scenarie").map((r) => [r.sti, r.vaerdi_json]));
        expect(m.get("_koersel.model_commit")).toBe(`"${pins.model_commit}"`);
        expect(m.get("_koersel.data_commit")).toBe(`"${pins.data_commit}"`);
        expect(med.hash).not.toBe(uden.hash);
        expect(bygFrossetInput(VÆRK, [], SCEN, { ...pins, data_commit: "1".repeat(40) }).hash).not.toBe(med.hash);
        expect(() => bygFrossetInput(VÆRK, [], SCEN, { model_commit: "b49aeb0" })).toThrow(/Ugyldig model_commit/);
    });
    it("afviser værkets egen tidsgrænse over 3600 s, når scenariet ikke sætter en", () => {
        const v = VÆRK.map((p) => (p.sti === "solver.time_limit" ? { ...p, vaerdi_json: "7200.0" } : p));
        expect(() => bygFrossetInput(v, [], SCEN)).toThrow(/7200/);
    });
    it("bruger modellens standard (600 s), når hverken værk eller scenarie har en tidsgrænse", () => {
        const v = VÆRK.filter((p) => p.sti !== "solver.time_limit");
        expect(bygFrossetInput(v, [], SCEN).effektiv.tidsgraense_s).toBe(600);
    });
    it("koder solverfelter som float og flag som liste", () => {
        const f = bygFrossetInput(VÆRK, [], { ...SCEN, tidsgraense_s: 300, mip_abs_gap: 1000, ekstra_flag: "--legacy-nettab", balancing_method: "legacy", med_balancering: true });
        const m = new Map(f.rækker.filter((r) => r.kilde === "scenarie").map((r) => [r.sti, r.vaerdi_json]));
        expect(m.get("solver.time_limit")).toBe("300.0");
        expect(m.get("solver.mip_abs_gap")).toBe("1000.0");
        expect(m.get("_koersel.ekstra_flag")).toBe('["--legacy-nettab"]');
        expect(m.get("_koersel.balancing_method")).toBe('"legacy"');
        expect(m.get("_koersel.med_balancering")).toBe("true");
    });
    it("afviser et værk med en dobbelt parameter", () => {
        expect(() => bygFrossetInput([...VÆRK, VÆRK[0]], [], SCEN)).toThrow(/to gange/);
    });
});

describe("periodeDoegn", () => {
    it("tæller scenariets datoer inklusive", () => {
        expect(periodeDoegn({ ...SCEN, periode_start: "2026-01-05", periode_slut: "2026-01-16" }, new Map()).doegn).toBe(12);
    });
    it("lægger ét interval til værkets time.end (Andeby helår = 365 døgn)", () => {
        const v = new Map<string, unknown>([["time.start", "2025-07-01T00:00:00Z"], ["time.end", "2026-06-30T23:00:00Z"], ["time.resolution", "1h"]]);
        expect(periodeDoegn(SCEN, v).doegn).toBe(365);
    });
});

describe("somFloat", () => {
    it.each([[3600, "3600.0"], [0.0002, "0.0002"], [-5, "-5.0"], [1e-7, "1e-7"]])("%s -> %s", (x, s) => expect(somFloat(x)).toBe(s));
});

describe("læsAnmodning og planlægParametre", () => {
    const nu = new Map([["prices.straw.value", "45.0"], ["units.halmkedel.p_max_heat", "12.0"]]);
    it("læser en parameterliste", () => {
        expect(læsAnmodning(JSON.stringify([{ sti: "prices.straw.value", handling: "ret", ny_json: "47.5" }]))).toEqual({
            type: "parametre", aendringer: [{ sti: "prices.straw.value", handling: "ret", ny_json: "47.5" }],
        });
    });
    it("læser en kopi", () => {
        expect(læsAnmodning('[{"handling":"kopier_vaerk","ny_kode":"ny_1","navn":"Ny"}]').type).toBe("kopi");
    });
    it.each([
        ["tom liste", "[]", /ikke-tom/],
        ["ukendt handling", '[{"sti":"a","handling":"flyt"}]', /ukendt handling/],
        ["tom sti-del", '[{"sti":"a..b","handling":"slet"}]', /ugyldig sti/],
        ["dublet", '[{"sti":"a","handling":"slet"},{"sti":"a","handling":"slet"}]', /to gange/],
        ["kode med versaler", '[{"handling":"kopier_vaerk","ny_kode":"Ny","navn":"x"}]', /små bogstaver/],
        ["værdi der ikke er JSON", '[{"sti":"a","handling":"ret","ny_json":"12,5"}]', /gyldig JSON/],
    ])("afviser %s", (_n, json, tekst) => expect(() => læsAnmodning(json)).toThrow(tekst));

    it("planlægger ret/opret/slet og springer en uændret værdi over", () => {
        const p = planlægParametre(nu, [
            { sti: "prices.straw.value", handling: "ret", ny_json: "47.5" },
            { sti: "units.halmkedel.p_max_heat", handling: "ret", ny_json: "12.0" },
            { sti: "units.halmkedel.p_min_heat", handling: "opret", ny_json: "2.0" },
        ]);
        expect(p.ret).toEqual([{ sti: "prices.straw.value", gammel_json: "45.0", ny_json: "47.5" }]);
        expect(p.opret).toEqual([{ sti: "units.halmkedel.p_min_heat", ny_json: "2.0", sektion: "units", objekt: "halmkedel" }]);
    });
    it.each([
        ["opret af eksisterende", { sti: "prices.straw.value", handling: "opret" as const, ny_json: "1.0" }, /findes allerede/],
        ["ret af manglende", { sti: "prices.olie.value", handling: "ret" as const, ny_json: "1.0" }, /findes ikke/],
        ["opret under et blad", { sti: "prices.straw.value.x", handling: "opret" as const, ny_json: "1.0" }, /allerede er en værdi/],
        ["opret over et blad", { sti: "prices.straw", handling: "opret" as const, ny_json: "1.0" }, /ligger under/],
    ])("afviser %s", (_n, æ, tekst) => expect(() => planlægParametre(nu, [æ])).toThrow(tekst));
    it("afviser en anmodning der ikke ændrer noget", () => {
        expect(() => planlægParametre(nu, [{ sti: "prices.straw.value", handling: "ret", ny_json: "45.0" }])).toThrow(/ingenting/);
    });
});
