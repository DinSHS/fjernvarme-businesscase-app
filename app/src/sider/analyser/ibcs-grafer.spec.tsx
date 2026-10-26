// Appens IBCS-lag (app/IBCS.md, review fv-ibcs): appens tokens (tema-variabler, da-DK), varianser på samme skala som
// basis (E5), neutral polaritet = blå (E6), afrundet nul uden fortegn (B5), N/A ved reference 0 (E14), vandfaldets
// afstemning og etiketten for frosne tidsserier (#20). Eksempeltallene er Andeby-tankparret målt 2026-10-26.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatDelta, formatPercentDelta, formatValue, impactFill, impactKey, impactText, layoutStructureBars, tokens, type Mark } from "@/ibcs";
import { aendringTekst, type EnhedVarians, type Samlet } from "./beregn";
import { DeltaTal, KODER, TKR, energiSkala, omkostningsBro, tkr } from "./ibcs-grafer";

const rect = (m: Mark) => (m.kind === "rect" ? m : null)!;

describe("appens tokens", () => {
    it("tal i da-DK: punktum som tusindtalsskille, komma som decimaltegn, ægte minus og mellemrum før %", () => {
        expect(formatValue(3_424_407.96, TKR)).toBe("3.424,4");
        expect(formatDelta(44_219.87, TKR)).toBe("+44,2");
        expect(formatDelta(-49_664, TKR)).toBe("−49,7");
        expect(formatPercentDelta(0.01291, 1)).toBe("+1,3 %");
        expect(tkr(null)).toBe("–");
    });
    it("et afrundet nul er uden fortegn og uden farve (B5)", () => {
        expect(formatDelta(40, TKR)).toBe("0,0");
        expect(formatPercentDelta(0.0004, 1)).toBe("0,0 %");
        expect(impactKey(40, { polarity: -1, isZero: true })).toBe("none");
    });
    it("farverne er temaets variabler: god/dårlig/neutral = delta_pos/delta_neg/delta_neutral (E6: neutral er blå, ikke grå)", () => {
        expect(impactFill("good")).toBe("var(--fjv-delta-pos)");
        expect(impactFill("bad")).toBe("var(--fjv-delta-neg)");
        expect(impactFill("neutral")).toBe("var(--fjv-delta-neutral)");
        expect(impactText("neutral")).toBe("var(--fjv-delta-neutral)");
        expect(tokens.color.scenario.ac).toBe("var(--fjv-ac)");
        expect(tokens.color.scenario.pl.stroke).toBe("var(--fjv-pl)");
        expect(impactKey(106, { polarity: 0 })).toBe("neutral");
        expect(impactKey(44_220, { polarity: -1 })).toBe("bad");
    });
    it("energi i grafer: ≥ 1.000 MWh skrives i GWh med 2 decimaler (≤ 3 cifre, SI 5.2)", () => {
        expect(energiSkala([3453, 10]).enhed).toBe("GWh");
        expect(formatValue(3453, energiSkala([3453]).skala)).toBe("3,45");
        expect(energiSkala([472, 10]).enhed).toBe("MWh");
    });
});

describe("Ref og Scen pr. enhed (spec analyser-sammenlign v2)", () => {
    const v: EnhedVarians[] = [
        { navn: "halmkedel", a: 3448, b: 3453, delta: 5, relativ: 5 / 3448 },
        { navn: "gaskedel_agg", a: 2014, b: 2119, delta: 105, relativ: 105 / 2014 },
        { navn: "elkedel_ny", a: 472, b: 410, delta: -62, relativ: -62 / 472 },
        { navn: "ny_enhed", a: 0, b: 12, delta: 12, relativ: null },
    ];
    const rækker = v.map((x) => ({ category: x.navn, AC: x.b, PL: x.a, delta: x.delta, deltaPct: x.a > 0 ? x.delta / x.a : null }));
    const l = layoutStructureBars(rækker, { width: 900, reference: "PL", referenceStyle: "bar", ppu: 0.1, scale: { factor: 1, prefix: "", decimals: 0 }, polarity: 0, codes: KODER });

    it("ΔRef-bjælkerne har samme px pr. MWh som produktionsbjælkerne (E5)", () => {
        const scen = l.marks.filter((m) => m.role === "bar-AC").map(rect);
        const delta = l.marks.filter((m) => m.role === "variance").map(rect);
        expect(scen[0].w / 3453).toBeCloseTo(0.1, 6);
        expect(delta.find((d) => d.category === "gaskedel_agg")!.w / 105).toBeCloseTo(0.1, 6);
    });
    it("Ref er omrids (plan-notation), Scen fyldt mørk; ΔRef neutral (blå) ved polaritet 0", () => {
        const ref = l.marks.filter((m) => m.role === "bar-PL").map(rect)[0];
        expect(ref.fill).toBe("var(--color-card)");
        expect(ref.stroke).toBe("var(--fjv-pl)");
        expect(rect(l.marks.find((m) => m.role === "bar-AC")!).fill).toBe("var(--fjv-ac)");
        const imp = l.marks.filter((m) => m.role === "variance").map((m) => m.impact);
        expect(new Set(imp)).toEqual(new Set(["neutral"]));
    });
    it("legender og den skjulte tabel bruger appens koder Ref/Scen/ΔRef", () => {
        const legender = l.marks.filter((m) => m.role === "legend").map((m) => (m.kind === "text" ? m.text : ""));
        expect(legender).toEqual(expect.arrayContaining(["Scen", "Ref"]));
        expect(l.table[0]).toEqual(["Enhed", "Scen", "Ref", "ΔRef", "ΔRef%"]);
    });
    it("ingen outlier-klipning af de største flytninger (F7): med outlierRatio 0 er alle pins hele", () => {
        const pins = [0.0015, 0.052, -0.017, -0.131, -0.017].map((p, i) => ({ category: `e${i}`, AC: 100, PL: 100, delta: 0, deltaPct: p }));
        const med = layoutStructureBars(pins, { width: 900, reference: "PL", ppu: 1, scale: { factor: 1, prefix: "", decimals: 0 }, polarity: 0 });
        const uden = layoutStructureBars(pins, { width: 900, reference: "PL", ppu: 1, scale: { factor: 1, prefix: "", decimals: 0 }, polarity: 0, outlierRatio: 0 });
        expect(med.marks.filter((m) => m.role === "outlier").length).toBeGreaterThan(0);   // bibliotekets standard klipper her
        expect(uden.marks.filter((m) => m.role === "outlier").length).toBe(0);
    });
    it("ΔRef% er N/A, når referencen er 0 (E14)", () => {
        const pct = l.marks.filter((m) => m.kind === "text" && m.category === "ny_enhed").map((m) => (m.kind === "text" ? m.text : ""));
        expect(pct).toContain("N/A");
    });
});

describe("omkostningsvandfaldet (spec analyser-sammenlign v1)", () => {
    const samlet = (el: number, salg: number, tarif: number): Samlet => ({
        objektiv_dkk: null, varmebehov_mwh: null, produktion_mwh: null, nettab_mwh: null, nettab_pct: null, co2_ton: null, el_forbrug_mwh: null,
        tank_arbitrage_dkk: null, enheder: [], lagre: [], balance: null, el_omkostning_dkk: el, el_salg_dkk: salg, el_produktionstarif_dkk: tarif,
    });
    it("Ref + Σ trin = Scen, med en navngiven rest", () => {
        const bro = omkostningsBro(samlet(666_278, 179_347, 433), samlet(616_614, 171_530, 426), 3_424_407.96, 3_468_627.83)!;
        const sum = bro.steps.reduce((s, x) => s + x.delta, bro.base.value);
        expect(sum).toBeCloseTo(bro.total.value, 6);
        expect(bro.steps.map((x) => x.label)).toEqual(["Elkøb", "Elsalg netto", "Brændsel, D&V, start m.m."]);
        expect(bro.steps[0].delta).toBeCloseTo(-49_664, 0);
        expect(bro.steps[1].delta).toBeCloseTo(7_810, 0);   // mindre salg = dyrere
        expect(bro.steps.at(-1)!.remainder).toBe(true);
        expect(bro.variance).toEqual({ code: "ΔRef", value: 3_468_627.83 - 3_424_407.96 });
    });
    it("uden objektiv: intet vandfald", () => {
        expect(omkostningsBro(samlet(1, 1, 0), samlet(1, 1, 0), null, 5)).toBeNull();
    });
});

describe("tal i tabeller", () => {
    it("DeltaTal: fortegn, virkningsfarve og data-role/data-impact til ibcs_lint", () => {
        const { container } = render(<DeltaTal v={44_219.87} polaritet={-1} />);
        const s = container.querySelector("[data-role='variance-label']")!;
        expect(s.textContent).toBe("+44,2");
        expect(s.getAttribute("data-impact")).toBe("bad");
    });
    it("DeltaTal: et afrundet nul er uden fortegn og 'none'", () => {
        const { container } = render(<DeltaTal v={-30} polaritet={-1} />);
        const s = container.querySelector("[data-role='variance-label']")!;
        expect(s.textContent).toBe("0,0");
        expect(s.getAttribute("data-impact")).toBe("none");
    });
});

describe("frosne tidsserier i 'hvad blev ændret' (review fv-ibcs #20)", () => {
    it("viser rollen og fingeraftrykket, aldrig den rå JSON", () => {
        const t = aendringTekst("_koersel.tidsserie.solprofil", undefined, JSON.stringify({ id: "c59a3787-c224-4392-b272-bf2a5b8cc9ff", sha256: "35706793bf4dd9c81d88c2aa" }));
        expect(t).toBe("Solprofil: frosset tidsserie (sha256 35706793bf4d)");
        expect(t).not.toMatch(/[{}"]/);
    });
});
