// @vitest-environment node
//-----------------------------------------------------------------------
// Backendens del rundt om den fælles tolker (rayfin/functions/src/tidsserie.ts):
// validerUpload, vaerkTrae, validering_json-afkortning, tæt række og sha256.
// Selve reglerne testes på oraklets 62 vektorer i
// src/sider/konfiguration/tidsserie-validering.spec.ts (fv-tidsserie).
//-----------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAKS_UPLOAD_BYTES, sha256Bytes, sha256Hex, tætRække, vaerkTrae, validerUpload, valideringJson } from "../src/tidsserie";

const bytes = (n: string) => new Uint8Array(readFileSync(new URL(`./vektorer/${n}`, import.meta.url)));
const VALG = { tidszone: "UTC", tidsstempel: "start", enhed: "MW" } as const;
const koder = (v: { fund: { niveau: string; kode: string }[] }) => v.fund.map((f) => `${f.niveau}:${f.kode}`);

describe("validerUpload — den fælles tolker på modelrepoets egne filer", () => {
    it("Billund ab værk: gyldig, normaliseret til time,mw med kildens taltekst bevaret tegn for tegn", () => {
        const r = validerUpload(bytes("billund_abvaerk_hourly.csv"), "varmelast", VALG, null);
        expect(r.status).toBe("gyldig");
        const linjer = r.normaliseret!.split("\n");
        expect(linjer.slice(0, 4)).toEqual(["time,mw", "2025-02-28T12:00:00Z,19.74", "2025-02-28T13:00:00Z,18.2", "2025-02-28T14:00:00Z,16.766666666666666"]);
        expect(r.normaliseret!.endsWith("\n")).toBe(true);
        expect(r.validering).toMatchObject({ start: "2025-02-28T12:00:00Z", slut: "2026-06-24T06:00:00Z", antal_raekker: 11539, antal_huller: 0, enhed: "MW" });
    });
    it("Andebys solprofil er gyldig som solprofil", () => {
        expect(validerUpload(bytes("solar_andeby_dmi_karup.csv"), "solprofil", VALG, null).status).toBe("gyldig");
    });
    it("Windows-1252 (Excel-eksport) læses — fordi backend får de rå bytes, ikke browserens afkodede tekst", () => {
        const latin1 = new Uint8Array([...Buffer.from("tidspunkt;varme_mw\n", "latin1"), ...Buffer.from("2026-01-05 00:00;1,5\n2026-01-05 01:00;2\n".repeat(1), "latin1")]);
        const medÆ = new Uint8Array([...Buffer.from("tidspunkt;varme (", "latin1"), 0xe6, ...Buffer.from(")\n", "latin1"), ...latin1.slice(19)]);
        const r = validerUpload(medÆ, "varmelast", { ...VALG, kolonne: null }, null);
        expect(koder(r.validering)).toContain("info:kodning_cp1252");
    });
    it("over grænsen gennem appen (4 MB pr. kald i base64) afvises med koden for_stor", () => {
        const r = validerUpload(new Uint8Array(MAKS_UPLOAD_BYTES + 1), "varmelast", VALG, null);
        expect(r.status).toBe("afvist");
        expect(koder(r.validering)).toEqual(["fejl:for_stor"]);
    });
    it("sha256 af den normaliserede fils bytes er det samme som af teksten som UTF-8", () => {
        const n = validerUpload(bytes("billund_abvaerk_hourly.csv"), "varmelast", VALG, null).normaliseret!;
        expect(sha256Bytes(new TextEncoder().encode(n))).toBe(sha256Hex(n));
    });
});

describe("vaerkTrae", () => {
    it("bygger units/storage som træ af bladene og ignorerer resten", () => {
        expect(vaerkTrae([
            { sti: "units.sol.type", vaerdi_json: '"solar_thermal"' }, { sti: "units.sol.p_max_heat", vaerdi_json: "22" },
            { sti: "units.sol.ancillary.afrr_qualified", vaerdi_json: "false" }, { sti: "storage.tank.volume_m3", vaerdi_json: "4000" },
            { sti: "time.start", vaerdi_json: '"2026-01-05"' },
        ])).toEqual({ units: { sol: { type: "solar_thermal", p_max_heat: 22, ancillary: { afrr_qualified: false } } }, storage: { tank: { volume_m3: 4000 } } });
    });
});

describe("validering_json — afkortning efter data_krav.json", () => {
    const fund = (n: number, niveau: "fejl" | "advarsel" | "info", len = 300) => Array.from({ length: n }, (_, i) => ({ niveau, kode: "k", besked: "x".repeat(len) + i }));
    it("uændret, når den passer", () => {
        const v = { rolle: "varmelast", fund: fund(2, "advarsel", 10) };
        expect(JSON.parse(valideringJson(v))).toEqual(v);
    });
    it("først hullisten (huller_fuld=false)", () => {
        const v = { huller: Array.from({ length: 400 }, (_, i) => [`2026-01-0${i % 9 + 1}T00:00:00Z`, "2026-01-01T00:00:00Z", i]), fund: fund(1, "fejl", 10) };
        const j = JSON.parse(valideringJson(v));
        expect(j.huller_fuld).toBe(false);
        expect(j.huller.length).toBeLessThan(400);
        expect(j.fund).toHaveLength(1);
    });
    it("så info-fund, så beskeder til 160 tegn — og aldrig over 4000", () => {
        const s = valideringJson({ fund: [...fund(10, "info"), ...fund(12, "fejl")] });
        const j = JSON.parse(s);
        expect(s.length).toBeLessThanOrEqual(4000);
        expect(j.fund.every((f: { niveau: string }) => f.niveau !== "info")).toBe(true);
        expect(Math.max(...j.fund.map((f: { besked: string }) => f.besked.length))).toBeLessThanOrEqual(160);
    });
    it("passer det stadig ikke, er det en fejl (ikke en tavs afkortning)", () => {
        expect(() => valideringJson({ fund: fund(100, "fejl") })).toThrow(/efter afkortning/);
    });
});

describe("tætRække (hentTidsserie)", () => {
    it("start + 1h + værdier, null i huller", () => {
        expect(tætRække("time,mw\n2026-01-05T00:00:00Z,1\n2026-01-05T01:00:00Z,2\n2026-01-05T03:00:00Z,4\n"))
            .toEqual({ start: "2026-01-05T00:00:00Z", oploesning: "1h", enhed: "MW", vaerdier: [1, 2, null, 4] });
    });
    it("afviser en fil i en anden form (fx den gamle time,value_mw)", () => {
        expect(() => tætRække("time,value_mw\n2026-01-05T00:00:00Z,1\n")).toThrow(/Uventet overskrift/);
    });
});
