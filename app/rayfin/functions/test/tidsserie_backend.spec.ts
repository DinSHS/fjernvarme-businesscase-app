// @vitest-environment node
//-----------------------------------------------------------------------
// KONTRAKT §6d på backendsiden: anmodningsformerne (upload/aktivering),
// frysningen i startBestilling og reglerne i function_app.ts / onelake.ts.
//-----------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Afvisning, bygFrossetInput, læsAnmodning, type Parameter, type ScenarieAendringRad, type ScenarieRad, type TidsserieRad } from "../src/logik";
import { tjekSti } from "../src/onelake";

const VÆRK: Parameter[] = [
    { sti: "meta.case_name", vaerdi_json: '"probe"' },
    { sti: "time.start", vaerdi_json: '"2026-01-05T00:00:00Z"' },
    { sti: "time.end", vaerdi_json: '"2026-01-11T23:00:00Z"' },
    { sti: "time.resolution", vaerdi_json: '"1h"' },
    { sti: "units.halmkedel.enabled", vaerdi_json: "true" },
];
const SCEN: ScenarieRad = { med_balancering: false };
const SHA = "a".repeat(64);
const ts = (o: Partial<TidsserieRad>): TidsserieRad => ({
    id: "11111111-1111-4111-8111-111111111111", rolle: "varmelast", navn: "Målt 2025", sha256: SHA, sti: `fjv/tidsserier/probe/${SHA}.csv`,
    oploesning: "1h", start: "2025-01-01T00:00:00.000Z", slut: "2026-12-31T23:00:00.000Z", aktiv: true, ...o,
});
const valg = (rolle: string, json: string): ScenarieAendringRad => ({ type: "set", sti: `_tidsserie.${rolle}`, vaerdi_json: json, raekkefoelge: 1 } as ScenarieAendringRad);
const frosset = (r: { rækker: { sti: string; vaerdi_json: string }[] }, rolle: string) => r.rækker.find((x) => x.sti === `_koersel.tidsserie.${rolle}`);

describe("læsAnmodning — upload og aktivering", () => {
    it("læser en tidsserie-upload, et værksark og en aktivering", () => {
        expect(læsAnmodning(JSON.stringify([{ handling: "upload_tidsserie", rolle: "varmelast", navn: "", filnavn: "maalt.csv", tidsstempel: "slut", tidszone: "Europe/Copenhagen", enhed: "kW", kolonne: "varme", sha256: SHA.toUpperCase() }])))
            .toEqual({ type: "upload_tidsserie", upload: { handling: "upload_tidsserie", rolle: "varmelast", navn: "maalt.csv", filnavn: "maalt.csv", tidsstempel: "slut", tidszone: "Europe/Copenhagen", enhed: "kW", kolonne: "varme", sha256: SHA } });
        expect(læsAnmodning(JSON.stringify([{ handling: "upload_vaerksark", filnavn: "ark.xlsx", sha256: SHA }]))).toEqual({
            type: "upload_vaerksark", upload: { handling: "upload_vaerksark", filnavn: "ark.xlsx", sha256: SHA, timeslut: null, basis_sha256: null },
        });
        // Runde 12: genupload som revision bærer basis-arkets sha256 (normaliseret til små bogstaver).
        expect(læsAnmodning(JSON.stringify([{ handling: "upload_vaerksark", filnavn: "a.xlsx", sha256: SHA, basis_sha256: SHA.toUpperCase() }]))).toEqual({
            type: "upload_vaerksark", upload: { handling: "upload_vaerksark", filnavn: "a.xlsx", sha256: SHA, timeslut: null, basis_sha256: SHA },
        });
        expect(() => læsAnmodning(JSON.stringify([{ handling: "upload_vaerksark", filnavn: "a.xlsx", sha256: SHA, basis_sha256: "abc" }]))).toThrow(/Basis-arkets sha256 er ugyldig/);
        expect(læsAnmodning(JSON.stringify([{ handling: "aktiver_tidsserie", tidsserie_id: "11111111-1111-4111-8111-111111111111", aktiv: true }])).type).toBe("aktiver_tidsserie");
    });
    it.each([
        ["ukendt rolle", { handling: "upload_tidsserie", rolle: "spotpris", filnavn: "a.csv", tidsstempel: "start", tidszone: "UTC", sha256: SHA }, /Ukendt rolle/],
        ["manglende sha256", { handling: "upload_tidsserie", rolle: "varmelast", filnavn: "a.csv", tidsstempel: "start", tidszone: "UTC" }, /sha256/],
        ["forkert tidsstempel", { handling: "upload_tidsserie", rolle: "varmelast", filnavn: "a.csv", tidsstempel: "midt", tidszone: "UTC", sha256: SHA }, /start" eller "slut/],
        ["aktiv der ikke er boolean", { handling: "aktiver_tidsserie", tidsserie_id: "11111111-1111-4111-8111-111111111111", aktiv: "ja" }, /true eller false/],
        ["en upload uden enhed (vælges aktivt, data_krav)", { handling: "upload_tidsserie", rolle: "varmelast", filnavn: "a.csv", tidsstempel: "start", tidszone: "UTC", sha256: SHA }, /Enheden mangler/],
        ["en upload uden tidszone", { handling: "upload_tidsserie", rolle: "varmelast", filnavn: "a.csv", tidsstempel: "start", enhed: "MW", sha256: SHA }, /Tidszonen mangler/],
        ["timeslut der ikke er boolean", { handling: "upload_vaerksark", filnavn: "a.xlsx", sha256: SHA, timeslut: "ja" }, /timeslut/],
    ])("afviser %s", (_n, a, tekst) => expect(() => læsAnmodning(JSON.stringify([a]))).toThrow(tekst));
});

describe("bygFrossetInput — tidsserier (KONTRAKT §6d)", () => {
    it("værkets aktive varmelast fryses som præcis {id, sha256} (arbejderens form, fv-fabric2 14:00)", () => {
        const r = bygFrossetInput(VÆRK, [], SCEN, {}, [ts({})]);
        expect(JSON.parse(frosset(r, "varmelast")!.vaerdi_json)).toEqual({ id: "11111111-1111-4111-8111-111111111111", sha256: SHA });
    });
    it("seriens egne huller (validering_json.huller) tæller med i dækningen", () => {
        // Perioden er 168 timer; serien dækker alt, men har et hul på 10 timer i vinduet -> 94 % < 95 %.
        const huller = JSON.stringify({ huller: [["2026-01-06T00:00:00Z", "2026-01-06T09:00:00Z", 10]], huller_fuld: true });
        expect(() => bygFrossetInput(VÆRK, [], SCEN, {}, [ts({ validering_json: huller })])).toThrow(/dækker kun 94 %/);
        const lille = JSON.stringify({ huller: [["2026-01-06T00:00:00Z", "2026-01-06T04:00:00Z", 5]], huller_fuld: true });
        expect(() => bygFrossetInput(VÆRK, [], SCEN, {}, [ts({ validering_json: lille })])).not.toThrow();
        // Et hul uden for vinduet tæller ikke.
        const udenfor = JSON.stringify({ huller: [["2025-03-01T00:00:00Z", "2025-03-05T00:00:00Z", 97]], huller_fuld: true });
        expect(() => bygFrossetInput(VÆRK, [], SCEN, {}, [ts({ validering_json: udenfor })])).not.toThrow();
    });
    it("en solprofil med ét hul i perioden afvises (modellen nulfylder ikke)", () => {
        const hul = JSON.stringify({ huller: [["2026-01-07T12:00:00Z", "2026-01-07T12:00:00Z", 1]], huller_fuld: true });
        expect(() => bygFrossetInput(VÆRK, [], SCEN, {}, [ts({ rolle: "solprofil", validering_json: hul })])).toThrow(/mangler 1 af periodens 168 timer/);
    });
    it('markøren "tidsserie:solprofil" kræver en aktiv eller valgt solprofil', () => {
        const medMarkør = [...VÆRK, { sti: "units.sol.production_profile_path", vaerdi_json: '"tidsserie:solprofil"' }];
        expect(() => bygFrossetInput(medMarkør, [], SCEN, {}, [])).toThrow(/bruger en solprofil-tidsserie, men ingen er aktiv eller valgt/);
        expect(frosset(bygFrossetInput(medMarkør, [], SCEN, {}, [ts({ rolle: "solprofil" })]), "solprofil")).toBeDefined();
    });
    it("en solprofil-tidsserie sammen med en ændring af production_profile_path afvises (dublet hos arbejderen)", () => {
        const værk = [...VÆRK, { sti: "units.sol.production_profile_path", vaerdi_json: '"data/sol.csv"' }];
        const æ = [valg("solprofil", '"11111111-1111-4111-8111-111111111111"'),
            { type: "set", sti: "units.sol.production_profile_path", vaerdi_json: '"data/anden.csv"', raekkefoelge: 0 } as ScenarieAendringRad];
        expect(() => bygFrossetInput(værk, æ, SCEN, {}, [ts({ rolle: "solprofil" })])).toThrow(/både en solprofil-tidsserie og ændrer/);
    });
    it("en inaktiv serie fryses ikke; uden tidsserier ændres inputtet ikke (eksisterende hashes holder)", () => {
        expect(frosset(bygFrossetInput(VÆRK, [], SCEN, {}, [ts({ aktiv: false })]), "varmelast")).toBeUndefined();
        expect(bygFrossetInput(VÆRK, [], SCEN, {}, []).hash).toBe(bygFrossetInput(VÆRK, [], SCEN).hash);
    });
    it("scenariets valg vinder over den aktive, og et valg er ikke en YAML-værdi", () => {
        const anden = ts({ id: "22222222-2222-4222-8222-222222222222", aktiv: false, sha256: "b".repeat(64) });
        const r = bygFrossetInput(VÆRK, [valg("varmelast", '"22222222-2222-4222-8222-222222222222"')], SCEN, {}, [ts({}), anden]);
        expect(JSON.parse(frosset(r, "varmelast")!.vaerdi_json).sha256).toBe("b".repeat(64));
        expect(r.rækker.some((x) => x.sti.startsWith("_tidsserie."))).toBe(false);
    });
    it('"syntetisk" fravælger værkets aktive varmelast', () => {
        expect(frosset(bygFrossetInput(VÆRK, [valg("varmelast", '"syntetisk"')], SCEN, {}, [ts({})]), "varmelast")).toBeUndefined();
    });
    it("repoets heat_csv bevares og slår den aktive tidsserie fra", () => {
        const r = bygFrossetInput(VÆRK, [], { ...SCEN, heat_csv: "billund_abvaerk_hourly.csv" }, {}, [ts({})]);
        expect(frosset(r, "varmelast")).toBeUndefined();
        expect(r.rækker.some((x) => x.sti === "_koersel.heat_csv")).toBe(true);
    });
    it("den frosne tidsserie indgår i hashen (en anden fil = et andet input)", () => {
        expect(bygFrossetInput(VÆRK, [], SCEN, {}, [ts({})]).hash).not.toBe(bygFrossetInput(VÆRK, [], SCEN, {}, [ts({ sha256: "c".repeat(64) })]).hash);
    });
    it("en aktiv solprofil fryses uafhængigt af varmelasten", () => {
        const r = bygFrossetInput(VÆRK, [], SCEN, {}, [ts({ rolle: "solprofil", id: "33333333-3333-4333-8333-333333333333" })]);
        expect(frosset(r, "solprofil")).toBeDefined();
        expect(frosset(r, "varmelast")).toBeUndefined();
    });
    it.each([
        ["valg af både tidsserie og heat_csv", [valg("varmelast", '"11111111-1111-4111-8111-111111111111"')], { heat_csv: "billund_abvaerk_hourly.csv" }, [ts({})], /vælg én/],
        ["et ukendt id", [valg("varmelast", '"99999999-9999-4999-8999-999999999999"')], {}, [ts({})], /findes ikke blandt værkets gyldige/],
        ["en serie med forkert rolle", [valg("varmelast", '"11111111-1111-4111-8111-111111111111"')], {}, [ts({ rolle: "solprofil" })], /er en solprofil, ikke en varmelast/],
        ["to aktive i samme rolle", [], {}, [ts({}), ts({ id: "22222222-2222-4222-8222-222222222222" })], /2 aktive varmelast/],
        ["en solprofil, der ikke dækker perioden", [], {}, [ts({ rolle: "solprofil", slut: "2026-01-08T23:00:00.000Z" })], /nulfylder ikke/],
        ["en varmelast, der dækker under 95 %", [], {}, [ts({ slut: "2026-01-09T23:00:00.000Z" })], /dækker kun 71 %/],
        ["en ukendt rolle", [valg("spotpris", '"x"')], {}, [], /Ukendt tidsserie-rolle/],
        ['"syntetisk" som solprofil', [valg("solprofil", '"syntetisk"')], {}, [], /kun for varmelast/],
    ])("afviser %s", (_n, æ, s, serier, tekst) => {
        expect(() => bygFrossetInput(VÆRK, æ as ScenarieAendringRad[], { ...SCEN, ...s }, {}, serier as TidsserieRad[])).toThrow(Afvisning);
        expect(() => bygFrossetInput(VÆRK, æ as ScenarieAendringRad[], { ...SCEN, ...s }, {}, serier as TidsserieRad[])).toThrow(tekst);
    });
    it("en varmelast med lige knap 95 % dækning accepteres", () => {
        // Perioden er 7 døgn = 168 timer; 160 timer dækket = 95,2 %.
        expect(() => bygFrossetInput(VÆRK, [], SCEN, {}, [ts({ start: "2026-01-05T08:00:00.000Z" })])).not.toThrow();
    });
});

describe("onelake.ts — kun appens egne stier", () => {
    it.each([
        "fjv/tidsserier/andeby/" + SHA + ".csv",
        "fjv/uploads/0b20eb7f-01e9-49fc-b0f5-95d307fc585d.xlsx",
        "fjv/df-data/392992c7fe35992e79fba8d1ba7b91967e8d1481/dmi/karup_2025.csv",
    ])("tillader %s", (s) => expect(() => tjekSti(s)).not.toThrow());
    it.each([
        "fjv/vaerker/andeby/kilde.yaml", "fjv/tidsserier/../koersler/x.csv", "fjv/tidsserier/Andeby/" + SHA + ".csv",
        "fjv/tidsserier/andeby/kort.csv", "/etc/passwd", "fjv/uploads/x.xlsx",
    ])("afviser %s", (s) => expect(() => tjekSti(s)).toThrow(/Ugyldig lakehouse-sti/));
});

describe("function_app.ts — §6d-regler i kilden", () => {
    const f = readFileSync(new URL("../src/function_app.ts", import.meta.url), "utf8");
    const del = (navn: string) => f.slice(f.indexOf(`'${navn}',`), f.indexOf("udf.func(", f.indexOf(`'${navn}',`) + 10));
    it("en upload er bundet til en anmodning i brugerens navn og til indholdets sha256", () => {
        expect(f).toMatch(/if \(sha256Hex\(indhold\) !== upload\.sha256\) throw new Afvisning/);
        expect(del("uploadTidsserie")).toMatch(/læsUploadAnmodning\(pool, anmodningId, 'upload_tidsserie', indholdBase64\)/);
        // Værksarkets forløb står i vaerksark.ts (K5-F4); bindingen til anmodningens sha256 er dér.
        expect(del("uploadVaerksark")).toMatch(/behandlVaerksark\(deps, anmodningId, indholdBase64, basisBase64 \?\? ''\)/);
        expect(readFileSync(new URL("../src/vaerksark.ts", import.meta.url), "utf8")).toMatch(/if \(sha256Hex\(indholdBase64\) !== upload\.sha256\) throw new Afvisning/);
    });
    it("den fælles tolker validerer de RÅ bytes med værkets enheder; stien er kode + hash af den normaliserede fils bytes", () => {
        expect(del("uploadTidsserie")).toMatch(/validerUpload\(rå, upload\.rolle, \{ tidszone: upload\.tidszone, tidsstempel: upload\.tidsstempel, enhed: upload\.enhed, kolonne: upload\.kolonne \}, vaerkTrae\(params\)\)/);
        expect(del("uploadTidsserie")).toMatch(/const sha = fil \? sha256Bytes\(fil\) : null;/);
        expect(del("uploadTidsserie")).toMatch(/`fjv\/tidsserier\/\$\{v\.kode\}\/\$\{sha\}\.csv`/);
        // Stien på rækken har `Files/` foran, som kontrakten og fv-fabric2's registrering (målt 15:41: uden præfiks fandt hentTidsserie
        // ikke deres filer og omvendt).
        expect(del("uploadTidsserie")).toMatch(/const sti = relativ \? `Files\/\$\{relativ\}` : null;/);
        expect(del("hentTidsserie")).toMatch(/t\.sti\.replace\(\/\^Files\\\/\/, ''\)/);
        expect(del("uploadTidsserie")).toMatch(/'csv', @status,\s*@val, 0, @af, SYSUTCDATETIME\(\)/);
    });
    it("hentDmiTemperatur læser kun motorens egen dataversion og kun kendte kolonner", () => {
        expect(del("hentDmiTemperatur")).toMatch(/SELECT data_commit FROM dbo\.Motors WHERE id = @m/);
        expect(del("hentDmiTemperatur")).toMatch(/if \(!DMI_KOLONNER\.includes\(kol\)\)/);
        expect(del("hentDmiTemperatur")).toMatch(/> 366\) return \{ ok: false, fejl: 'Højst 366 døgn pr\. kald\.' \}/);
    });
    it("hentTidsserie verificerer filens sha256 før den vises", () => {
        expect(del("hentTidsserie")).toMatch(/if \(sha256Hex\(tekst\) !== t\.sha256\)/);
    });
    it("aktivering låser rollens rækker og slår de andre fra i samme transaktion", () => {
        expect(f).toMatch(/FROM dbo\.Tidsseries WITH \(UPDLOCK, HOLDLOCK\) WHERE vaerk_id = @v AND rolle = @r/);
        expect(f).toMatch(/UPDATE dbo\.Tidsseries SET aktiv = 0 WHERE vaerk_id = @v AND rolle = @r AND id <> @t AND aktiv = 1/);
    });
    it("en upload kan ikke udføres gennem udfoerAendring (indholdet mangler dér)", () => {
        expect(f).toMatch(/anmodning\.type === 'upload_tidsserie' \|\| anmodning\.type === 'upload_vaerksark'\) \{\s*return \{ ok: false, status: 'ny'/);
    });
});
