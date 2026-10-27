// Codex K9 F1: en ukendt måling (null) for et objekt, kørslen HAR, må aldrig blive til et tal — Δ er ukendt (–), cellen
// er ufarvet, og værdien står uden for heatmappets maksimum. Et objekt, kørslen ikke har (lager slået fra, enhed der ikke
// findes), bidrager fortsat med 0. De fem første prøver er Codex' egne (rapporter/K9_probe.spec.tsx), uændrede i indhold;
// de to sidste fejlede i aa281fa.
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HeatSkalaProvider } from "@/components/layout";
import { glemVisning, saetFarvesaet, saetVisning } from "@/lib/tabelfarve";
import { maanedstabel, produktionsvarians, sammenligningsBudskab, type EnhedTal, type LagerTal, type Maaned } from "./beregn";
import type { Pakke } from "./data";
import { energi } from "./fmt";
import { Enheder, Maaneder } from "./koersel";
import { LagerDelta, MaanedDelta } from "./sammenlign";

const PERIODER = ["2026-01", "2026-02", "periode"];
const måneder = (vs: Record<string, (number | null)[]>) => maanedstabel(Object.entries(vs).flatMap(([objekt, værdier]) =>
    værdier.map((vaerdi, i) => ({ id: objekt + i, koersel_id: "k", maaned: PERIODER[i], objekt, noegle: "produktion_gwh", vaerdi }))) as unknown as Maaned[]);
const lager = (navn: string, afladet_mwh: number | null) => ({ navn, afladet_mwh }) as LagerTal;
const pakke = (vs: Record<string, (number | null)[]>, lagre: LagerTal[] = []) => ({ maaneder: måneder(vs), samlet: { lagre }, input: [] }) as unknown as Pakke;
type Celle = { text: string | null; heat: string | null };
const celler = (c: HTMLElement): Celle[][][] => [...c.querySelectorAll("table")]
    .map((t) => [...t.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((td) => ({ text: td.textContent, heat: td.getAttribute("data-heat") }))))
    .filter((rækker) => rækker.some((r) => r.length > 1));
const række = (c: Celle[][], navn: string) => c.find((r) => r[0].text === navn)!;

// Farvesættet Neutral (IBCS: op/ned): prøverne gælder ukendt, nul og skala — farvesættene har deres egne tests (r10_farvesaet).
beforeEach(() => { localStorage.clear(); glemVisning(); saetVisning("delta", "heatmap"); saetVisning("niveau", "heatmap"); saetFarvesaet("neutral"); });
afterEach(cleanup);

describe("Codex K9-prøverne (rød → grøn)", () => {
    it("neutral månedlig Δ: fortegn og adskilte måneds-/periodeskalaer; bytning vender polen", () => {
        const a = pakke({ x: [1, 1, 2], y: [1, 1, 2] }), b = pakke({ x: [2, 2, 4], y: [0.8, 0.8, 1.6] });
        for (const [aa, bb, fortegn] of [[a, b, 1], [b, a, -1]] as const) {
            const { container, unmount } = render(<MaanedDelta a={aa} b={bb} />);
            const c = celler(container);
            const x = række(c[0], "x");
            expect(x[1].heat).toBe(fortegn === 1 ? "op-5" : "ned-5");
            expect(x[3].heat).toBe(x[1].heat);
            expect(række(c[0], "y")[1].heat).toBe(fortegn === 1 ? "ned-1" : "op-1");
            unmount();
        }
    });

    it("GWh-skift bevarer fortegn, nulafrunding og den delte periodeskala med lageret", () => {
        const a = pakke({ x: [1, 1, 2], tiny: [0, 0, 0] }, [lager("tank", 10_000)]);
        const b = pakke({ x: [7, 7, 14], tiny: [0.0004, 0, 0.0004] }, [lager("tank", 16_000)]);
        const c = celler(render(<HeatSkalaProvider><MaanedDelta a={a} b={b} /><LagerDelta a={a} b={b} /></HeatSkalaProvider>).container);
        expect(række(c[0], "x")[3]).toEqual({ text: "+12,00", heat: "op-5" });
        expect(c[1][0][3]).toEqual({ text: "+6,00", heat: "op-3" });
        expect(række(c[0], "tiny")[1]).toEqual({ text: "0,00", heat: null });
    });

    it("niveautabellerne deler råt MWh-maksimum, selv om månedsdata er i GWh", () => {
        const d = pakke({ x: [2, 3, 5], y: [4, 6, 10] });
        (d.samlet as { enheder: EnhedTal[] }).enheder = [
            { navn: "x", produktion_mwh: 5000, andel_pct: 33.3, driftstimer: 48, fuldlasttimer: 20, p_max_mw: 250, kapacitetsfaktor_pct: 50 },
            { navn: "y", produktion_mwh: 10000, andel_pct: 66.7, driftstimer: 48, fuldlasttimer: 40, p_max_mw: 250, kapacitetsfaktor_pct: 100 },
        ] as EnhedTal[];
        const c = celler(render(<HeatSkalaProvider><Enheder d={d} /><Maaneder d={d} pladser={new Map()} /></HeatSkalaProvider>).container);
        expect(c[0][0][2].heat).toBe("niveau-3");
        expect(c[0][1][2].heat).toBe("niveau-5");
        const p = række(c[1], "Hele perioden");
        expect(p[3].heat).toBe("niveau-5");
        expect(p[4].heat).toBe("niveau-3");
    });

    it("ukendt afladning for et lager, begge kørsler har, bliver ikke 0 og en farvet positiv Δ", () => {
        const c = celler(render(<LagerDelta a={pakke({}, [lager("tank", null)])} b={pakke({}, [lager("tank", 100)])} />).container);
        expect(c[0][0][3].heat).toBeNull();
        expect(c[0][0][3].text).toMatch(/^(?:–|N\/A)$/);
    });

    it("ukendt månedsproduktion for en enhed, kørslen har, forbliver ukendt", () => {
        const c = celler(render(<MaanedDelta a={pakke({ x: [null, 1, 1] })} b={pakke({ x: [0.1, 1, 1.1] })} />).container);
        const x = række(c[0], "x");
        expect(x[1].heat).toBeNull();
        expect(x[1].text).toMatch(/^(?:–|N\/A)$/);
    });
});

describe("ukendt er ikke 0 — men et objekt, kørslen ikke har, er stadig 0", () => {
    it("lager: slået fra i referencen giver Δ = hele scenariets afladning, farvet; ukendt står uden for maksimum", () => {
        const a = pakke({}, [lager("tank", 50)]), b = pakke({}, [lager("tank", null), lager("ny", 80)]);
        const c = celler(render(<LagerDelta a={a} b={b} />).container)[0];
        expect(række(c, "ny")).toEqual([
            { text: "ny", heat: null }, { text: "slået fra", heat: null }, { text: "80", heat: null }, { text: "+80", heat: "op-5" },
        ]);
        // 'tank' (ukendt Scen) er ufarvet og trækker ikke maksimum: 'ny' er alene om trin 5.
        expect(række(c, "tank")[3]).toEqual({ text: "–", heat: null });
    });

    it("måned: en enhed, referencen ikke har, tæller 0; ukendt varmebehov er –", () => {
        const a = måneder({ x: [1, 1, 2] }), b = måneder({ x: [1, 1, 2], ny: [0.5, 0.5, 1] });
        const behov = (t: number | null) => ({ id: `b${t}`, koersel_id: "k", maaned: "2026-01", objekt: null, noegle: "varmebehov_gwh", vaerdi: t }) as unknown as Maaned;
        const pa = { maaneder: maanedstabel([...rækkerAf(a), behov(null)]), samlet: { lagre: [] }, input: [] } as unknown as Pakke;
        const pb = { maaneder: maanedstabel([...rækkerAf(b), behov(3)]), samlet: { lagre: [] }, input: [] } as unknown as Pakke;
        const c = celler(render(<MaanedDelta a={pa} b={pb} />).container)[0];
        expect(række(c, "ny")[1]).toEqual({ text: "+500", heat: "op-5" });
        expect(række(c, "Varmebehov")[1]).toEqual({ text: "–", heat: null });
    });

    it("produktionsvariansen: ukendt produktion giver ukendt Δ og indgår ikke i budskabet", () => {
        const v = produktionsvarians(
            [{ navn: "gaskedel", produktion_mwh: null }, { navn: "halmkedel", produktion_mwh: 3000 }] as EnhedTal[],
            [{ navn: "gaskedel", produktion_mwh: 1300 }, { navn: "halmkedel", produktion_mwh: 1800 }, { navn: "ny", produktion_mwh: 40 }] as EnhedTal[],
        );
        expect(v.find((x) => x.navn === "gaskedel")).toMatchObject({ a: null, b: 1300, delta: null, relativ: null });
        expect(v.find((x) => x.navn === "ny")).toMatchObject({ a: 0, b: 40, delta: 40 });
        expect(sammenligningsBudskab(v, null, energi)).toBe("I scenariet overtager ny 40 MWh (mest fra halmkedel).");
    });
});

/** Rækkerne bag en Maanedstabel (testhjælper: tabellen gemmer dem ikke). */
function rækkerAf(t: ReturnType<typeof måneder>): Maaned[] {
    return [...t.maaneder, "periode"].flatMap((m) => t.objekter("produktion_gwh").map((o) => ({
        id: `${m}${o}`, koersel_id: "k", maaned: m, objekt: o, noegle: "produktion_gwh",
        vaerdi: m === "periode" ? t.periode(o, "produktion_gwh") : t.vaerdi(m, o, "produktion_gwh"),
    }) as unknown as Maaned));
}
