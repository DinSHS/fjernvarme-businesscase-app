// Budskaber og hjælpere for fanen Tidsserier.
import { describe, expect, it } from "vitest";
import { analyser, sammenlign } from "./tidsserie-analyse";
import {
    aktive, dkTid, dækningBudskab, døgnBudskab, energi, energiBudskab, listeBudskab, læsValidering, månedBudskab, månedNavn,
    sammenligningBudskab, spidsBudskab, vaerksarkBudskab, varighedBudskab,
} from "./tidsserie-budskaber";
import { afkod, brugerNu, MAKS_UPLOAD_BYTES, SOLPROFIL_MARKØR, tilBase64 } from "./tidsserie-logik";
import { MAKS_TIDSSERIE_BYTES } from "@/lib/data/skriv";
import type { TidsserieRække } from "./tidsserie-kilde";
import { akse, tidsmærker } from "./graf-akse";
import { visFelt } from "./vis";

const ms = (s: string) => Date.parse(s);
const række = (o: Partial<TidsserieRække>): TidsserieRække => ({
    id: "x", vaerk_id: "v", rolle: "varmelast", navn: "Målt 2025", filnavn: "maalt.csv", tidsstempel: "start", tidszone: "UTC",
    kilde: "csv", status: "gyldig", aktiv: false, uploadet_af: "a@b.dk", uploadet: "2026-10-16T12:00:00Z", ...o,
});

describe("liste og aktive", () => {
    it("tom liste siger, at varmelastmodellen bruges", () => {
        expect(listeBudskab([])).toMatch(/varmelastmodellen/);
    });
    it("én aktiv varmelast og en afvist", () => {
        const r = [række({ id: "1", aktiv: true }), række({ id: "2", status: "afvist", navn: "Forkert" })];
        expect(listeBudskab(r)).toBe('2 tidsserier (1 gyldig, 1 afvist): varmelast "Målt 2025" er aktiv, ingen aktiv solprofil.');
    });
    it("læsevejen tåler to aktive i samme rolle og siger det", () => {
        const r = [række({ id: "1", aktiv: true }), række({ id: "2", aktiv: true, navn: "B" })];
        expect(aktive(r).get("varmelast")).toHaveLength(2);
        expect(listeBudskab(r)).toMatch(/2 aktive varmelaster \(højst én er tilladt\)/);
    });
    it("en afvist serie tæller aldrig som aktiv", () => {
        expect(aktive([række({ aktiv: true, status: "afvist" })]).size).toBe(0);
    });
});

describe("hvad bruger værket nu", () => {
    it("solenhed med markøren, en repo-fil og en aktiv varmelast", () => {
        const blade = new Map([
            ["units.sol.production_profile_path", JSON.stringify(SOLPROFIL_MARKØR)],
            ["units.sol2.production_profile_path", '"data/solar_andeby_dmi_karup.csv"'],
            ["units.sol2.p_max_heat", "22.0"],
        ]);
        const b = brugerNu(blade, [række({ aktiv: true })]);
        expect(b.varme.map((r) => r.navn)).toEqual(["Målt 2025"]);
        expect(b.profiler).toEqual([{ enhed: "sol", sti: SOLPROFIL_MARKØR }, { enhed: "sol2", sti: "data/solar_andeby_dmi_karup.csv" }]);
    });
    it("markøren vises som tekst, ikke som en filsti", () => {
        expect(visFelt('"tidsserie:solprofil"')).toMatch(/Værkets solprofil/);
    });
});

describe("analyse-budskaber", () => {
    const s = { startMs: ms("2025-01-01T00:00:00Z"), opløsning: "1h" as const, værdier: Array.from({ length: 24 * 31 }, (_, i) => (i === 100 || i === 101 ? null : 10 + (i % 24))) };
    const a = analyser(s);
    it("dækning: huller med varighed og start i dansk tid", () => {
        expect(dækningBudskab(a)).toBe("1 hul på i alt 2 timer (0,3 %); det længste er 2 timer fra 5. jan. 2025 kl. 05.");
    });
    it("energi uden helt år", () => {
        expect(energiBudskab(a, "varmelast")).toMatch(/^Varmeproduktion 16,0 GWh over 31 døgn — ca\. 188,5 GWh pr\. år\.$/);
    });
    it("et helt dansk kalenderår uden huller nævnes ved navn", () => {
        const start = Date.parse("2024-12-31T23:00:00Z"), n = 8760;
        const år = analyser({ startMs: start, opløsning: "1h", værdier: new Array(n).fill(2) });
        expect(år.år.map((x) => [x.nøgle, x.intervaller, x.mulige])).toEqual([["2025", 8760, 8760]]);
        expect(energiBudskab(år, "varmelast")).toBe("Varmeproduktion 2025: 17,5 GWh.");
        expect(år.måneder.filter((m) => m.intervaller === m.mulige)).toHaveLength(12);
    });
    it("spidslast", () => {
        expect(spidsBudskab(a)).toMatch(/^Højst 33,0 MW \(2\. jan\. 2025 kl\. 00\); middel 21,5 MW; benyttelsestid 5\.712 timer om året\.$/);
    });
    it("måneder: kun hele danske kalendermåneder (serien slutter 1. feb. kl. 01 dansk tid)", () => {
        expect(månedBudskab(a)).toBe("Ingen hel måned i serien.");
    });
    it("varighed", () => {
        expect(varighedBudskab([{ andel: 0, mw: 10 }, { andel: 0.5, mw: 6 }, { andel: 1, mw: 1 }], 10, 100)).toBe("Over halvdelen af spidsen (5,0 MW) i 50 % af tiden — ca. 50 timer.");
    });
    it("døgnprofil for sol siger fra ved sol om natten", () => {
        expect(døgnBudskab([0, 1, ...new Array(22).fill(0)], "solprofil", { timer: 30, mørke: 200 })).toMatch(/30 mørke timer .* tjek tidszonen/);
        expect(døgnBudskab([0, 1, ...new Array(22).fill(0)], "solprofil", { timer: 0, mørke: 200 })).toMatch(/ingen sol i mørke timer/);
    });
    it("målt mod model: retning, procent og største måned", () => {
        const syn = new Array(24 * 31).fill(20);
        const r = sammenlign(s, s.startMs, syn)!;
        expect(sammenligningBudskab(r)).toMatch(/^Den målte last er 7,6 % over varmelastmodellen over 742 fælles timer; størst afvigelse i (januar|februar) 2025/);
    });
    it("formater", () => {
        expect(energi(81_234)).toBe("81,2 GWh");
        expect(energi(812)).toBe("812 MWh");
        expect(månedNavn("2026-02")).toBe("februar 2026");
        expect(dkTid(ms("2026-07-01T10:00:00Z"))).toBe("1. jul. 2026 kl. 12");
    });
});

describe("backendens validering_json læses tolerant", () => {
    it("kendte felter, fejl og advarsler som tekster eller objekter", () => {
        const v = læsValidering(JSON.stringify({ daekning: 0.995, aarssum_mwh: 81234, fejl: [{ besked: "negative værdier" }], advarsler: ["2 huller"] }))!;
        expect(v.fejl).toEqual(["negative værdier"]);
        expect(v.advarsler).toEqual(["2 huller"]);
        expect(v.tal).toEqual([["Dækning", "99,5 %"], ["Årssum", "81,2 GWh"]]);
        expect(læsValidering(JSON.stringify({ max: 41.983 }))!.tal).toEqual([["Største værdi", "42,0 MW"]]);
    });
    it("data_krav-formen: fund-listen afgør fejl og advarsler (info vises ikke som advarsel)", () => {
        const v = læsValidering(JSON.stringify({ version: 1, sum_mwh: 812, huller: [["a", "b", 2]], fund: [
            { niveau: "info", kode: "kvarter_aggregeret", besked: "midlet" }, { niveau: "advarsel", kode: "huller", besked: "2 timer mangler" }],
        fejl: [], advarsler: ["2 timer mangler"] }))!;
        expect(v).toEqual({ fejl: [], advarsler: ["2 timer mangler"], tal: [["Energi i alt", "812 MWh"]] });
        expect(læsValidering(JSON.stringify({ fund: [{ niveau: "fejl", kode: "negativ", tekst: "negativ værdi" }] }))!.fejl).toEqual(["negativ værdi"]);
    });
    it("kun nøgletallene, i fast rækkefølge og med enheder — ikke rolle, ISO-tider og kildekolonner", () => {
        const v = læsValidering(JSON.stringify({
            version: 1, rolle: "varmelast", tidszone: "UTC", tidskolonne: "timestamp", start: "2025-02-28T12:00:00Z", kilde_raekker: 11539,
            daekning: 1, antal_huller: 0, laengste_hul_timer: 0, udfyldte_timer: 0, min: 1.8, max: 41.983, max_tid: "2026-01-11T09:00:00Z",
            middel: 14.36, sum_mwh: 165700, aarssum_gwh: 125.79, benyttelsestid_t: 2996, fund: [],
        }))!;
        expect(v.tal).toEqual([
            ["Dækning", "100,0 %"], ["Huller", "0 timer"], ["Mindste værdi", "1,8 MW"], ["Største værdi", "42,0 MW"],
            ["Middel", "14,4 MW"], ["Energi i alt", "165,7 GWh"], ["Pr. år", "125,8 GWh"], ["Benyttelsestid", "2.996 timer/år"],
        ]);
        expect(læsValidering(JSON.stringify({ udfyldte_timer: 3, laengste_hul_timer: 2, sol_tyngdepunkt_time_utc: 10.95 }))!.tal)
            .toEqual([["Udfyldte timer", "3 (længste hul 2 timer)"], ["Solens tyngdepunkt", "kl. 10,95 UTC"]]);
    });
    it("ikke-JSON vises ordret", () => {
        expect(læsValidering("noget gik galt")!.tal).toEqual([["Validering", "noget gik galt"]]);
        expect(læsValidering(null)).toBeNull();
    });
});

describe("værksark", () => {
    const v = [{ id: "v1", kode: "skabelon", navn: "Skabelonværket" }];
    it("budskab pr. status", () => {
        const i = { id: "i", filnavn: "ark.xlsx", uploadet_af: "a", uploadet: "2026-10-16T12:00:00Z" };
        expect(vaerksarkBudskab({ ...i, status: "faerdig", vaerk_id: "v1", tidsserie_id: "t" }, v)).toBe("Seneste import (ark.xlsx) er færdig: værket Skabelonværket er oprettet med en tidsserie.");
        expect(vaerksarkBudskab({ ...i, status: "fejl" }, v)).toMatch(/fejlede/);
        expect(vaerksarkBudskab({ ...i, status: "koe" }, v)).toMatch(/venter/);
    });
    it("base64 i bidder giver det samme som btoa", () => {
        const u = new Uint8Array(100_000).map((_, i) => (i * 7) % 256);
        expect(tilBase64(u.buffer)).toBe(Buffer.from(u).toString("base64"));
    });
    it("afkodning: UTF-8, og ellers Windows-1252 (dansk Excel)", () => {
        expect(afkod(new TextEncoder().encode("tid;værdi").buffer as ArrayBuffer)).toEqual({ tekst: "tid;værdi", tegnsæt: "UTF-8" });
        expect(afkod(new Uint8Array([0x76, 0xe6, 0x72]).buffer)).toEqual({ tekst: "vær", tegnsæt: "Windows-1252" });
    });
});

describe("upload-grænse", () => {
    it("siden afviser aldrig mindre end backend: den strengeste af data_krav og Functions-kaldet", () => {
        expect(MAKS_UPLOAD_BYTES).toBeLessThanOrEqual(MAKS_TIDSSERIE_BYTES);
        expect(MAKS_UPLOAD_BYTES).toBeGreaterThan(1_200_000); // et helt år i kvarterer skal kunne sendes (§6d)
    });
});

describe("grafakser", () => {
    it("pæne trin", () => {
        expect(akse(51.04)).toEqual({ top: 60, trin: 20 });
        expect(akse(7.5)).toEqual({ top: 8, trin: 2 });
        expect(akse(0)).toEqual({ top: 1, trin: 0.25 });
    });
    it("månedsmærker står på dansk midnat den 1.", () => {
        const m = tidsmærker(ms("2025-02-28T12:00:00Z"), ms("2026-06-24T07:00:00Z"), 900);
        expect(m[0]).toEqual({ ms: ms("2025-02-28T23:00:00Z"), tekst: "mar. 2025" });
        expect(m.some((x) => x.ms === ms("2025-06-30T22:00:00Z"))).toBe(true); // 1. juli, sommertid
    });
    it("dagsmærker i en uge", () => {
        const m = tidsmærker(ms("2026-01-05T00:00:00Z"), ms("2026-01-12T00:00:00Z"), 900);
        expect(m.map((x) => x.tekst)).toEqual(["6/1", "7/1", "8/1", "9/1", "10/1", "11/1", "12/1"]);
    });
});
