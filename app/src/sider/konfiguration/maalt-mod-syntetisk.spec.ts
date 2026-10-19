// Målt mod syntetisk varmelast (data_krav-reglen maalt_mod_syntetisk, "visning"): energiforhold og døgnkorrelation,
// og helårstesten på Billunds egen målte fil mod den varmelast, modellen selv ville syntetisere (fv-data målte
// forhold 0,99–1,03 og døgnkorrelation 0,97–0,98 for 1. juli 2025 – 30. juni 2026).
import { describe, expect, it } from "vitest";
import syntese from "./syntese-vektorer.json";
import orakel from "./orakel-vektorer.json";
import { sammenlign } from "./tidsserie-analyse";
import { maaltModSyntetiskFund } from "./tidsserie-budskaber";
import { syntetiser, temperaturPåAkse, type SyntesParametre } from "./syntetisk-varmelast";
import { valider } from "./tidsserie-validering";
import { fraPunkter, type Serie } from "./serie";
import { sammenligningsvindue } from "./useSyntese";

const DAG = 86_400_000;
const ms = (s: string) => Date.parse(s);

describe("døgnkorrelation og forhold", () => {
    // 10 døgn: målt = 1,2 × syntese (perfekt korreleret døgnmønster med varierende niveau).
    const start = ms("2026-01-04T23:00:00Z"); // dansk midnat 5. januar
    const syn = Array.from({ length: 240 }, (_, i) => 10 + Math.floor(i / 24) + (i % 24) / 24);
    const målt: Serie = { startMs: start, opløsning: "1h", værdier: syn.map((x) => x * 1.2) };
    it("forhold = målt / syntetisk energi, døgnkorrelation over danske døgn", () => {
        const r = sammenlign(målt, start, syn)!;
        expect(r.forhold).toBeCloseTo(1.2, 12);
        expect(r.døgn).toBe(10);
        expect(r.døgnkorrelation).toBeCloseTo(1, 12);
    });
    it("forhold uden for 0,85–1,15 giver data_krav's advarsel med tallene", () => {
        const f = maaltModSyntetiskFund(sammenlign(målt, start, syn)!)!;
        expect(f.kode).toBe("maalt_mod_syntetisk");
        expect(f.niveau).toBe("advarsel");
        expect(f.besked).toMatch(/^Den målte varmelast er 1,20 gange værkets syntetiske \(døgnkorrelation 1,00\)\./);
    });
    it("inden for grænserne og godt korreleret: intet fund", () => {
        expect(maaltModSyntetiskFund(sammenlign({ ...målt, værdier: syn }, start, syn)!)).toBeNull();
    });
    it("lav døgnkorrelation giver advarslen, selv når energien passer", () => {
        const rystet = syn.map((x, i) => (Math.floor(i / 24) % 2 ? x * 1.4 : x * 0.6));
        const r = sammenlign({ ...målt, værdier: rystet }, start, syn)!;
        expect(r.døgnkorrelation!).toBeLessThan(0.85);
        expect(maaltModSyntetiskFund(r)?.kode).toBe("maalt_mod_syntetisk");
    });
    it("et døgn med under 20 fælles timer tæller ikke med i døgnkorrelationen", () => {
        const r = sammenlign({ ...målt, værdier: målt.værdier.map((v, i) => (i >= 24 && i < 30 ? null : v)) }, start, syn)!;
        expect(r.døgn).toBe(9);
        expect(DAG).toBe(86_400_000);
    });
});

describe("helår: Billunds målte varmelast mod modellens egen syntese", () => {
    const V = syntese as unknown as { dmi_aar: Record<string, { tider: string[]; vaerdier: (number | null)[] }>; tilfaelde: { navn: string; params: SyntesParametre }[] };
    const repo = (orakel as unknown as { sager: { navn: string; base64?: string }[] }).sager.find((s) => s.navn === "repo_billund_abvaerk_hourly")!;
    const r = valider(new Uint8Array(Buffer.from(repo.base64!, "base64")), "varmelast", { tidszone: "UTC", tidsstempel: "start", enhed: "MW" });
    const målt = fraPunkter(r.punkter)!;
    const p = V.tilfaelde.find((t) => t.navn === "billund_januar_karup")!.params;
    for (const omr of ["karup", "fyn"]) {
        it(`${omr}: forhold 0,98–1,04 og døgnkorrelation 0,96–0,99 (fv-data: 0,99–1,03 og 0,97–0,98)`, () => {
            const v = sammenligningsvindue(målt);
            const temp = temperaturPåAkse(v.fraMs, v.timer, V.dmi_aar[omr].tider, V.dmi_aar[omr].vaerdier)!;
            const s = sammenlign(målt, v.fraMs, syntetiser(v.fraMs, temp, p).total)!;
            expect(s.forhold).toBeGreaterThan(0.98);
            expect(s.forhold).toBeLessThan(1.04);
            expect(s.døgnkorrelation!).toBeGreaterThan(0.96);
            expect(s.døgnkorrelation!).toBeLessThan(0.99);
            expect(maaltModSyntetiskFund(s)).toBeNull();
        });
    }
});
