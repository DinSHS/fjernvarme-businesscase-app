// Runde 10 (brief 40, IBCS.md AF7): valgfrit farvesæt til tabellernes Δ — Rød/grøn (standard) · Blå/rød (farveblind-
// sikker) · Neutral (IBCS). Semantikken pr. farvesæt × polaritet (en omkostning, der stiger, er ALDRIG grøn), legenden,
// kontrasten pr. celle i alle temaer × lys/mørk (også de private, når de ligger lokalt) og valget husket uden lager.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FarveValg, Tabel, useFarvesaet, useVisning } from "@/components/layout";
import { DeltaTal, TKR } from "@/sider/analyser/ibcs-grafer";
import { afstand, kontrast } from "@/styles/farve";
import { BASISTEMA, CVD_GULV, css, heatRamper, loes, maal, type Tema, type TemaFil } from "@/styles/tema-kerne";
import {
    FARVESAET, farverTeksten, farvning, forklaring, glemVisning, laesFarvesaet, rampe, saetFarvesaet, saetVisning,
    STANDARD_FARVESAET, type Art, type Farvesaet,
} from "./tabelfarve";

const MWH = { factor: 1, prefix: "", decimals: 0 };
const delta = (polaritet: number, saet?: Farvesaet): Art => ({ slags: "delta", polaritet, saet });

beforeEach(() => { localStorage.clear(); glemVisning(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("semantik pr. farvesæt × polaritet", () => {
    // [farvesæt, polaritet, fortegn] → rampe. Polaritet −1 = omkostning/CO₂ (op = dårligt), +1 = balanceindtægt (op = godt).
    const FORVENTET: [Farvesaet, number, number, string][] = [
        ["roedgroen", -1, +1, "roed"], ["roedgroen", -1, -1, "groen"], ["roedgroen", +1, +1, "groen"], ["roedgroen", +1, -1, "roed"],
        ["roedgroen", 0, +1, "groen"], ["roedgroen", 0, -1, "roed"],
        ["blaaroed", -1, +1, "roed"], ["blaaroed", -1, -1, "blaa"], ["blaaroed", +1, +1, "blaa"], ["blaaroed", +1, -1, "roed"],
        ["blaaroed", 0, +1, "blaa"], ["blaaroed", 0, -1, "roed"],
        ["neutral", -1, +1, "daarlig"], ["neutral", -1, -1, "god"], ["neutral", +1, +1, "god"], ["neutral", +1, -1, "daarlig"],
        ["neutral", 0, +1, "op"], ["neutral", 0, -1, "ned"],
    ];
    it.each(FORVENTET)("%s, polaritet %i, fortegn %i → %s", (saet, p, fortegn, forventet) => {
        expect(rampe(fortegn * 44_219, delta(p, saet))).toBe(forventet);
        expect(farvning("heatmap", fortegn * 44_219, delta(p, saet), 50_000, TKR).heat).toBe(`${forventet}-5`);
    });
    it("en omkostning, der stiger, er rød i Rød/grøn og Blå/rød — i Retning og Heatmap — og aldrig grøn eller blå", () => {
        for (const saet of ["roedgroen", "blaaroed"] as const) {
            expect(farvning("retning", 44_219, delta(-1, saet), 50_000, TKR)).toEqual({ tekst: "var(--fjv-heat-roed)" });
            expect(farvning("heatmap", 44_219, delta(-1, saet), 50_000, TKR).baggrund).toBe("var(--fjv-heat-roed-5)");
        }
    });
    it("uden farvesæt er Δ IBCS-varianten (Neutral) — som før runde 10", () => {
        expect(rampe(959, { slags: "delta", polaritet: 0 })).toBe("op");
        expect(rampe(44_219, { slags: "delta", polaritet: -1 })).toBe("daarlig");
    });
    it("niveau-tabeller følger intet farvesæt (én sekventiel nuance)", () => {
        for (const v of [5, -5]) expect(rampe(v, { slags: "niveau" })).toBe("niveau");
    });
    it("0, et afrundet nul og ukendt er ufarvede i alle farvesæt; fortegnet bliver i tallet", () => {
        for (const saet of FARVESAET) for (const p of [-1, 0, 1]) for (const v of [0, 0.4, -0.3, null, undefined, Number.NaN]) {
            expect(farvning("heatmap", v, delta(p, saet), 2261, MWH)).toEqual({});
            expect(farvning("retning", v, delta(p, saet), 2261, MWH)).toEqual({});
        }
    });
    it("Retning: tabeller med polaritet farver tallet i Rød/grøn og Blå/rød; i Neutral bærer DeltaTal virkningsfarven som før", () => {
        expect(farvning("retning", -44_219, delta(-1, "roedgroen"), 1, TKR)).toEqual({ tekst: "var(--fjv-heat-groen)" });
        expect(farvning("retning", -44_219, delta(-1, "blaaroed"), 1, TKR)).toEqual({ tekst: "var(--fjv-heat-blaa)" });
        expect(farvning("retning", -44_219, delta(-1, "neutral"), 1, TKR)).toEqual({});
        expect(farverTeksten("retning", delta(-1, "neutral"))).toBe(false);
        expect(farverTeksten("retning", delta(-1, "roedgroen"))).toBe(true);
        expect(farverTeksten("retning", delta(0, "neutral"))).toBe(true);
        expect(farverTeksten("heatmap", delta(1, "neutral"))).toBe(true);
        expect(farverTeksten("ingen", delta(0, "roedgroen"))).toBe(false);
        expect(farverTeksten("heatmap", { slags: "niveau" })).toBe(true);
    });
});

describe("legenden følger farvesættet", () => {
    const S: [string, number, string][] = [["", 2261, "2.261 MWh"]];
    it("neutrale tabeller siger ærligt, at farven er retning, ikke godt eller dårligt", () => {
        expect(forklaring("retning", delta(0, "roedgroen"))).toBe("Grøn = mere end referencen, rød = mindre — farven siger retning, ikke godt eller dårligt.");
        expect(forklaring("retning", delta(0, "blaaroed"))).toBe("Blå = mere end referencen, rød = mindre — farven siger retning, ikke godt eller dårligt.");
        expect(forklaring("retning", delta(0, "neutral"))).toBe("Blå = mere end referencen, orange = mindre.");
        expect(forklaring("heatmap", delta(0, "roedgroen"), S)).toMatch(/^Grøn = mere end referencen, rød = mindre — farven siger retning, ikke godt eller dårligt; jo kraftigere farve, jo større \(5 trin à 20 %; kraftigst = 2\.261 MWh\)\.$/);
    });
    it("tabeller med polaritet: grøn/blå = bedre, rød = dårligere", () => {
        expect(forklaring("heatmap", delta(-1, "roedgroen"), S)).toMatch(/^Grøn = bedre end referencen, rød = dårligere; jo kraftigere/);
        expect(forklaring("heatmap", delta(-1, "blaaroed"), S)).toMatch(/^Blå = bedre end referencen, rød = dårligere; jo kraftigere/);
        expect(forklaring("retning", delta(-1, "blaaroed"))).toBe("Blå = bedre end referencen, rød = dårligere.");
        // Neutral + Retning: tallet står i IBCS-virkningsfarven som under Ingen — ingen ekstra legende.
        expect(forklaring("retning", delta(-1, "neutral"))).toBe("");
    });
});

describe("kontrast pr. celle i alle temaer × lys/mørk (de nye ramper)", () => {
    const filer = import.meta.glob<TemaFil>("../styles/temaer/**/*.json", { eager: true, import: "default" });
    const basis = loes(Object.values(filer).find((f) => f.id === BASISTEMA)!, undefined);
    const temaer: Tema[] = Object.values(filer).map((f) => (f.id === BASISTEMA ? basis : loes(f, basis)));
    it.each(temaer.flatMap((t) => (["lys", "moerk"] as const).map((m) => [t.id, m, t] as const)))("%s/%s", (_id, m, t) => {
        const v = t[m];
        const r = heatRamper(v);
        for (const navn of ["groen", "roed", "blaa"] as const) {
            for (const c of r[navn]) expect(kontrast(c.tekst, c.bg), `${navn} ${c.tekst} på ${c.bg}`).toBeGreaterThanOrEqual(4.5);
            expect(css(t, m)).toContain(`--fjv-heat-${navn}-5: ${r[navn][4].bg}`);
        }
        // Retning-farverne er tal på kortet: ≥ 4,5:1 mod fladen.
        for (const pol of [v.heatmap_groen, v.heatmap_roed, v.heatmap_blaa]) expect(kontrast(pol, v.flade)).toBeGreaterThanOrEqual(4.5);
        // Blå/rød er det farveblind-sikre sæt.
        expect(Math.min(afstand(v.heatmap_blaa, v.heatmap_roed, "protan"), afstand(v.heatmap_blaa, v.heatmap_roed, "deutan"))).toBeGreaterThanOrEqual(CVD_GULV);
        // Temaets egen måling (kontrastscriptet) har 0 brud.
        expect(maal(t).filter((f) => f.niveau === "brud")).toEqual([]);
    });
});

describe("farvesættet huskes pr. bruger", () => {
    it("standard er Rød/grøn; et gemt valg læses igen; ukendte værdier giver standarden", () => {
        expect(STANDARD_FARVESAET).toBe("roedgroen");
        expect(laesFarvesaet()).toBe("roedgroen");
        saetFarvesaet("blaaroed");
        expect(localStorage.getItem("fjv.tabelfarve.farvesaet.v1")).toBe("blaaroed");
        glemVisning();
        expect(laesFarvesaet()).toBe("blaaroed");
        localStorage.setItem("fjv.tabelfarve.farvesaet.v1", "lilla");
        glemVisning();
        expect(laesFarvesaet()).toBe("roedgroen");
        saetFarvesaet("lilla" as Farvesaet);
        expect(laesFarvesaet()).toBe("roedgroen");
    });
    it("virker uden lager: blokeret getItem/setItem kaster ikke, og valget gælder resten af besøget", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blokeret"); });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blokeret"); });
        expect(laesFarvesaet()).toBe("roedgroen");
        expect(() => saetFarvesaet("neutral")).not.toThrow();
        expect(laesFarvesaet()).toBe("neutral");
    });
});

describe("knappen og tabellen", () => {
    // En omkostningstabel (polaritet −1): +44.219 (dyrere), −20.000 (billigere), 0.
    function Omkostning() {
        const vis = useVisning("delta"), saet = useFarvesaet();
        const art = { slags: "delta", polaritet: -1, saet } as const;
        return (
            <div>
                <FarveValg slags="delta" />
                <Tabel rækker={[44_219, -20_000, 0]} nøgle={(v) => String(v)} kolonner={[{
                    navn: "ΔRef", tal: true, farve: (v) => farvning(vis, v, art, 44_219, TKR),
                    vis: (v) => <DeltaTal v={v} polaritet={-1} arv={farverTeksten(vis, art)} />,
                }]} />
            </div>
        );
    }
    const celler = () => [...document.querySelectorAll("td")].map((td) => td.getAttribute("data-heat"));

    it("Farvesæt vises kun i Δ-tabeller, og kun når Retning eller Heatmap er valgt", () => {
        render(<><FarveValg slags="delta" /><FarveValg slags="niveau" /></>);
        expect(screen.queryByRole("group", { name: "Farvesæt" })).toBeNull();
        act(() => { saetVisning("delta", "retning"); saetVisning("niveau", "heatmap"); });
        const grupper = screen.getAllByRole("group", { name: "Farvesæt" });
        expect(grupper).toHaveLength(1);
        expect([...grupper[0].querySelectorAll("button")].map((b) => [b.textContent, b.getAttribute("aria-pressed")]))
            .toEqual([["Rød/grøn", "true"], ["Blå/rød", "false"], ["Neutral", "false"]]);
    });
    it("omkostning op er rød, ned er grøn (standard); Blå/rød og Neutral skifter alle tabeller og huskes", () => {
        render(<><Omkostning /><Omkostning /></>);
        act(() => { fireEvent.click(screen.getAllByRole("button", { name: "Heatmap" })[0]); });
        expect(celler()).toEqual(["roed-5", "groen-3", null, "roed-5", "groen-3", null]);
        const td = document.querySelector<HTMLElement>('td[data-heat="roed-5"]')!;
        expect([td.style.background, td.style.color]).toEqual(["var(--fjv-heat-roed-5)", "var(--fjv-heat-roed-5-tekst)"]);
        expect(td.textContent).toBe("+44,2");   // fortegnet bliver i tallet (t.kr.)
        act(() => { fireEvent.click(screen.getAllByRole("button", { name: "Blå/rød" })[0]); });
        expect(celler()).toEqual(["roed-5", "blaa-3", null, "roed-5", "blaa-3", null]);
        expect(localStorage.getItem("fjv.tabelfarve.farvesaet.v1")).toBe("blaaroed");
        act(() => { fireEvent.click(screen.getAllByRole("button", { name: "Neutral" })[1]); });
        expect(celler()).toEqual(["daarlig-5", "god-3", null, "daarlig-5", "god-3", null]);
    });
    it("Retning i Rød/grøn farver omkostningens tal (rød op, grøn ned); i Neutral står de i virkningsfarven som før", () => {
        render(<Omkostning />);
        act(() => { fireEvent.click(screen.getByRole("button", { name: "Retning" })); });
        const [op, ned] = [...document.querySelectorAll<HTMLElement>("td")];
        expect([op.style.color, ned.style.color]).toEqual(["var(--fjv-heat-roed)", "var(--fjv-heat-groen)"]);
        expect(op.querySelector("span")!.style.color).toBe("");   // tallet arver cellens farve
        act(() => { fireEvent.click(screen.getByRole("button", { name: "Neutral" })); });
        expect([op.style.color, op.style.background]).toEqual(["", ""]);
        expect(op.querySelector("span")!.getAttribute("style")).toContain("var(--fjv-delta-neg)");
    });
});
