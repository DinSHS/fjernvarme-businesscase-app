// Analyse af tidsserier. De rigtige filuddrag (modelrepoets data/) og pandas' tal for dem skrives af
// _byg/csv_vektorer.py; tolkningen selv er oraklets (tidsserie-validering.spec.ts).
import { describe, expect, it } from "vitest";
import vektorer from "./csv-vektorer.json";
import { valider } from "./tidsserie-validering";
import { dkDel, dkForskydning, dkMidnat, fraNormaliseret, fraPunkter, type Serie } from "./serie";
import { analyser, nedsampl, sammenlign, tilTimer, varighedskurve } from "./tidsserie-analyse";

const serieAf = (tekst: string, rolle: "varmelast" | "solprofil"): Serie => {
    const r = valider(tekst, rolle, { tidszone: "UTC", tidsstempel: "start", enhed: "MW" });
    expect(r.status).toBe("gyldig");
    return fraPunkter(r.punkter)!;
};
const iso = (ms: number) => new Date(ms).toISOString().replace(".000", "");
const ms = (s: string) => Date.parse(s);

interface Ref { raekker: number; start: string; slut: string; sum_mwh: number; maks: number; min: number; maaneder: Record<string, number> }
const V = vektorer as unknown as Record<"billund" | "sol", { tekst: string; ref: Ref }>;

describe("rigtige filer fra modelrepoet = pandas", () => {
    for (const k of ["billund", "sol"] as const) {
        it(`${k}: rækker, periode, energi, maks og danske måneder`, () => {
            const s = serieAf(V[k].tekst, k === "sol" ? "solprofil" : "varmelast");
            const a = analyser(s);
            const r = V[k].ref;
            expect(a.medVærdi).toBe(r.raekker);
            expect(a.huller).toEqual([]);
            expect(iso(s.startMs)).toBe(r.start);
            expect(iso(s.startMs + (s.værdier.length - 1) * 3_600_000)).toBe(r.slut);
            expect(a.mwh).toBeCloseTo(r.sum_mwh, 6);
            expect(a.maks).toBe(r.maks);
            expect(a.min).toBe(r.min);
            expect(Object.fromEntries(a.måneder.map((m) => [m.nøgle, m.mwh]))).toEqual(
                Object.fromEntries(Object.entries(r.maaneder).map(([m, v]) => [m, expect.closeTo(v, 6)])));
        });
    }
});

describe("dansk tid", () => {
    it("EU's sommertidsregel: skiftet sidste søndag i marts og oktober kl. 01 UTC", () => {
        expect(dkForskydning(ms("2026-03-29T00:59:59Z"))).toBe(1);
        expect(dkForskydning(ms("2026-03-29T01:00:00Z"))).toBe(2);
        expect(dkForskydning(ms("2026-10-25T00:59:59Z"))).toBe(2);
        expect(dkForskydning(ms("2026-10-25T01:00:00Z"))).toBe(1);
    });
    it("dansk midnat og kalenderdel", () => {
        expect(iso(dkMidnat(2026, 7, 1))).toBe("2026-06-30T22:00:00Z");
        expect(iso(dkMidnat(2026, 13, 1))).toBe("2026-12-31T23:00:00Z");
        expect(dkDel(ms("2026-12-31T23:30:00Z"))).toEqual({ år: 2027, måned: 1, dag: 1, time: 0 });
    });
    it("normaliserede punkter → serie med huller som null", () => {
        const s = fraNormaliseret("time,mw\n2026-01-01T00:00:00Z,1\n2026-01-01T03:00:00Z,4\n")!;
        expect(s.værdier).toEqual([1, null, null, 4]);
    });
});

describe("analyse", () => {
    const s = { startMs: ms("2026-01-31T22:00:00Z"), opløsning: "1h" as const, værdier: [1, 2, null, 4] };
    it("måneder er danske: 31. januar kl. 23 UTC er februar i Danmark", () => {
        expect(analyser(s).måneder.map((m) => [m.nøgle, m.mwh])).toEqual([["2026-01", 1], ["2026-02", 6]]);
    });
    it("varighedskurve: faldende fra maks til min", () => {
        const v = varighedskurve(s);
        expect(v.map((p) => p.mw)).toEqual([4, 2, 1]);
        expect(v[0].andel).toBe(0);
        expect(v[2].andel).toBe(1);
    });
    it("nedsampling holder min/maks og springer huller over", () => {
        const sp = nedsampl(s, s.startMs, s.startMs + 4 * 3_600_000, 2);
        expect(sp.map((x) => [x.min, x.maks])).toEqual([[1, 2], [4, 4]]);
    });
    it("kvarterer som timer: middel af fire, en time med et manglende kvarter er et hul", () => {
        const k = { startMs: ms("2026-01-01T00:00:00Z"), opløsning: "15min" as const, værdier: [4, 8, 4, 8, 1, null, 1, 1] };
        expect(tilTimer(k).værdier).toEqual([6, null]);
        expect(analyser(k).mwh).toBe(6.75); // (4+8+4+8+1+1+1) × 0,25 t
    });
    it("benyttelsestid er årsækvivalent: middel / maks × 8.760 (data_krav's benyttelsestid_t)", () => {
        expect(analyser(s).benyttelsestid).toBeCloseTo((7 / 3 / 4) * 8760, 9);
    });
    it("målt mod syntetisk tæller kun fælles timer", () => {
        const syn = [2, 2, 2, 2, 2];
        const r = sammenlign(s, s.startMs + 3_600_000, syn)!;
        expect(r.timer).toBe(2);
        expect(r.målt_mwh).toBe(6);
        expect(r.syntetisk_mwh).toBe(4);
        expect(r.afvigelse).toBe(0.5);
        expect(r.måneder).toEqual([{ nøgle: "2026-02", målt_mwh: 6, syntetisk_mwh: 4, timer: 2 }]);
    });
});
