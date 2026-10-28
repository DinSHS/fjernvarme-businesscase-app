// Runde 11 (brief 41): sammensætningen måned for måned — MWh · % af total på kørselssiden og sammenligningssiden — og
// tillægget: kortets farvevalg styrer også variansgraferne. %-søjler summerer til 100 (også afrundet), periodens andel
// regnes på periode-rækkerne, en enhed kun i én kørsel, ukendt ≠ 0, valget husket uden lager, samme skala for Ref og
// Scen, og graffarven pr. tilstand × farvesæt × polaritet med et uændret Ingen.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeatSkalaProvider } from "@/components/layout";
import { glemMaal, laesMaal, saetMaal, abonnerMaal } from "@/lib/energimaal";
import { FARVESAET, glemVisning, grafFarve, saetFarvesaet, saetVisning, type Farvesaet, type Visning } from "@/lib/tabelfarve";
import { GRAFIK, KONTRASTKRAV } from "@/styles/tema-kerne";
import { PERIODE, afrundMedStoersteRest, andel, produktion, soejleTotal, visteAndele } from "./andele";
import { maanedstabel, produktionsvarians, type EnhedTal, type Maaned } from "./beregn";
import type { Pakke } from "./data";
import { ProduktionMod } from "./ibcs-grafer";
import { Maaneder } from "./koersel";
import { Produktion } from "./sammenlign";
import { SammensaetningMaaned } from "./sammensaetning-kort";

const KOL = ["2026-01", "2026-02", "periode"];
/** En månedstabel: objekt → [jan, feb, periode] i GWh; `behov` er varmebehovet pr. kolonne. */
const tabel = (vs: Record<string, (number | null)[]>, behov?: (number | null)[]) => maanedstabel([
    ...Object.entries(vs).flatMap(([objekt, v]) => v.map((vaerdi, i) => ({ id: `${objekt}${i}`, koersel_id: "k", maaned: KOL[i], objekt, noegle: "produktion_gwh", vaerdi }))),
    ...(behov ?? []).map((vaerdi, i) => ({ id: `b${i}`, koersel_id: "k", maaned: KOL[i], objekt: null, noegle: "varmebehov_gwh", vaerdi })),
] as unknown as Maaned[]);
const pakke = (vs: Record<string, (number | null)[]>, behov?: (number | null)[], navn = "x") =>
    ({ maaneder: tabel(vs, behov), samlet: { lagre: [], enheder: [] }, input: [], scenarie: { navn } }) as unknown as Pakke;
const sum = (xs: Iterable<number | null | undefined>) => [...xs].reduce<number>((a, x) => a + (x ?? 0), 0);

beforeEach(() => { localStorage.clear(); glemVisning(); glemMaal(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("% af total: hver søjle er 100 %", () => {
    it("de uafrundede andele i hver måned og i hele perioden summerer til 100", () => {
        const t = tabel({ a: [1.234, 0.5, 2.1], b: [0.7, 1.9, 2.4], c: [0.01, 0, 0.02] });
        for (const kol of KOL) expect(sum(["a", "b", "c"].map((e) => andel(t, kol, e)))).toBeCloseTo(100, 10);
    });

    it("de viste andele (1 decimal) summerer præcis til 100,0 — største rest, ikke 33,3 × 3 = 99,9", () => {
        const t = tabel({ a: [1, 1, 1], b: [1, 1, 1], c: [1, 1, 1] });
        const v = visteAndele(t, "2026-01", ["a", "b", "c"]);
        expect([...v.values()]).toEqual([33.4, 33.3, 33.3]);
        expect(Math.round(sum(v.values()) * 10)).toBe(1000);
        // Mange skæve andele: summen bliver 100,0 i hver kolonne.
        const skæv = tabel({ a: [0.123, 0.777, 1], b: [0.456, 0.111, 1], c: [0.789, 0.222, 1], d: [0.0005, 0.333, 1] });
        for (const kol of KOL) expect(Math.round(sum(visteAndele(skæv, kol, ["a", "b", "c", "d"]).values()) * 10)).toBe(1000);
    });

    it("afrundMedStoersteRest lader ukendt og fraværende stå og runder resten", () => {
        expect(afrundMedStoersteRest([null, 50.04, undefined, 49.96])).toEqual([null, 50, undefined, 50]);
        expect(afrundMedStoersteRest([])).toEqual([]);
    });

    it("'Hele perioden' regnes på periode-rækkerne, ikke på summen af månederne", () => {
        // Månederne siger 50/50; periode-rækkerne (de fulde tidsserier) siger 3 mod 1 → 75 %.
        const t = tabel({ a: [1, 1, 3], b: [1, 1, 1] });
        expect(andel(t, "2026-01", "a")).toBe(50);
        expect(andel(t, PERIODE, "a")).toBe(75);
        expect(soejleTotal(t, PERIODE)).toBe(4);
    });

    it("en måned uden produktion har ingen andel (ikke 0 % og ikke ukendt)", () => {
        expect(andel(tabel({ a: [0, 1, 1], b: [0, 1, 1] }), "2026-01", "a")).toBeUndefined();
    });
});

describe("en enhed kun i én kørsel og en ukendt måling", () => {
    it("en enhed, kørslen ikke har, er fraværende (undefined) — ikke 0 og ikke ukendt", () => {
        const t = tabel({ a: [1, 1, 2] });
        expect(produktion(t, "2026-01", "ny")).toBeUndefined();
        expect(andel(t, "2026-01", "ny")).toBeUndefined();
        expect(andel(t, "2026-01", "a")).toBe(100);
    });

    it("en ukendt måling gør søjlens total ukendt: alle andele i søjlen er ukendte, de andre søjler ikke", () => {
        const t = tabel({ a: [null, 1, 2], b: [1, 1, 2] });
        expect(soejleTotal(t, "2026-01")).toBeNull();
        expect(andel(t, "2026-01", "a")).toBeNull();
        expect(andel(t, "2026-01", "b")).toBeNull();
        expect(andel(t, "2026-02", "b")).toBe(50);
    });

    it("tabellen: '–' for enheden i kørslen uden den, 'ukendt' for den manglende måling, ingen farve på nogen af dem", () => {
        saetVisning("niveau", "heatmap");
        const a = pakke({ a: [null, 1, 2] }, [1, 1, 2], "Ref-kørsel"), b = pakke({ a: [1, 1, 2], ny: [0.5, 0.5, 1] }, [1.5, 1.5, 3], "Scen-kørsel");
        const { container } = render(<SammensaetningMaaned a={a} b={b} pladser={new Map()} />);
        const rk = [...container.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")]);
        const række = (g: number, enhed: string) => rk.filter((r) => r[1].textContent === enhed)[g];
        expect(række(0, "ny")[2].textContent).toBe("–");
        expect(række(0, "ny")[2].getAttribute("data-heat")).toBeNull();
        expect(række(0, "a")[2].textContent).toBe("ukendt");
        expect(række(0, "a")[2].getAttribute("data-heat")).toBeNull();
        expect(række(1, "ny")[2].textContent).toBe("500");
        expect(række(1, "ny")[2].getAttribute("data-heat")).toMatch(/^niveau-\d$/);
        // Rækkegrupperne: Reference over Scenarie, navnet kun på gruppens første række.
        expect(rk.map((r) => r[0].textContent).filter(Boolean)).toEqual(["Reference", "Scenarie"]);
        // % af total: andelene for scenariet og '–' for referencens manglende enhed; varmebehovet forsvinder.
        act(() => saetMaal("andel"));
        const rk2 = [...container.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent));
        expect(rk2.find((r) => r[0] === "Scenarie")).toEqual(["Scenarie", "a", "66,7", "66,7", "66,7"]);
        expect(rk2.filter((r) => r[1] === "ny")).toEqual([["", "ny", "–", "–", "–"], ["", "ny", "33,3", "33,3", "33,3"]]);
        expect(rk2.some((r) => r[1] === "Varmebehov")).toBe(false);
        expect(rk2.find((r) => r[0] === "Reference")![2]).toBe("ukendt");
    });
});

describe("valget MWh · % af total huskes pr. bruger — og virker uden lager", () => {
    it("standard er MWh; et gemt valg læses; en ukendt værdi giver MWh", () => {
        expect(laesMaal()).toBe("mwh");
        localStorage.setItem("fjv.sammensaetning.maal.v1", "andel"); glemMaal();
        expect(laesMaal()).toBe("andel");
        localStorage.setItem("fjv.sammensaetning.maal.v1", "gwh"); glemMaal();
        expect(laesMaal()).toBe("mwh");
    });

    it("blokeret lager: læsning giver MWh, valget gælder i hukommelsen, og lytterne får besked", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceeded"); });
        expect(laesMaal()).toBe("mwh");
        const lytter = vi.fn();
        const af = abonnerMaal(lytter);
        expect(() => saetMaal("andel")).not.toThrow();
        expect(laesMaal()).toBe("andel");
        expect(lytter).toHaveBeenCalledTimes(1);
        af();
    });

    it("knappen skifter alle sammensætninger på én gang (kørselssiden og sammenligningssiden)", () => {
        const d = pakke({ a: [1, 3, 4], b: [1, 1, 2] }, [2, 4, 6]);
        render(<HeatSkalaProvider><Maaneder d={d} pladser={new Map()} /><SammensaetningMaaned a={d} b={d} pladser={new Map()} /></HeatSkalaProvider>);
        const knapper = screen.getAllByRole("button", { name: "% af total" });
        expect(knapper).toHaveLength(2);
        fireEvent.click(knapper[0]);
        for (const k of screen.getAllByRole("button", { name: "% af total" })) expect(k.getAttribute("aria-pressed")).toBe("true");
        expect(localStorage.getItem("fjv.sammensaetning.maal.v1")).toBe("andel");
        // Kørselssidens tabel viser nu andele (jan.: 50/50, feb.: 75/25, perioden: 66,7/33,3).
        const kørsel = [...document.querySelectorAll("table")[0].querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent));
        expect(kørsel.map((r) => [r[3], r[4]])).toEqual([["50,0", "50,0"], ["75,0", "25,0"], ["66,7", "33,3"]]);
        expect(screen.getAllByRole("img", { name: "Stablede søjler, %" }).length).toBe(3);
    });
});

describe("små multipler: Ref og Scen har samme skala", () => {
    const svgHøjder = (c: HTMLElement) => [...c.querySelectorAll("[data-scenarie] svg")].map((s) => s.getAttribute("height"));
    const akse = (c: HTMLElement, kode: string) => [...c.querySelectorAll(`[data-scenarie="${kode}"] svg text.fjv-a-akse`)].map((t) => t.textContent).filter((x) => /^\d/.test(x ?? ""));

    it("MWh: samme højde og samme akse, selv når scenariet producerer dobbelt så meget", () => {
        const a = pakke({ a: [1, 1, 2] }, [1, 1, 2]), b = pakke({ a: [2, 2, 4] }, [2, 2, 4]);
        const { container } = render(<SammensaetningMaaned a={a} b={b} pladser={new Map()} />);
        const [ha, hb] = svgHøjder(container);
        expect(ha).toBe(hb);
        expect(akse(container, "Ref")).toEqual(akse(container, "Scen"));
        // Referencens søjle er halvt så høj som scenariets (samme px pr. MWh).
        const højde = (kode: string) => sum([...container.querySelectorAll(`[data-scenarie="${kode}"] svg path`)].slice(0, 1).map((p) => {
            const tal = (p.getAttribute("d") ?? "").match(/V(-?[\d.]+)/g)?.map((x) => Number(x.slice(1))) ?? [];
            return tal.length >= 2 ? Math.abs(tal[0] - tal[1]) : 0;
        }));
        expect(højde("Ref") * 2).toBeCloseTo(højde("Scen"), 0);
    });

    it("% af total: begge akser går 0–100 %, og 'Periode' er en adskilt søjle; Ref og Scen er tydeligt mærket", () => {
        saetMaal("andel");
        const a = pakke({ a: [1, 1, 2], b: [3, 1, 4] }), b = pakke({ a: [2, 2, 4] });
        const { container } = render(<SammensaetningMaaned a={a} b={b} pladser={new Map()} />);
        expect(akse(container, "Ref")).toEqual(["0", "25", "50", "75", "100"]);
        expect(akse(container, "Scen")).toEqual(akse(container, "Ref"));
        expect(svgHøjder(container)[0]).toBe(svgHøjder(container)[1]);
        expect(container.querySelector('[data-scenarie="Ref"]')!.textContent).toMatch(/^ Ref · x/);
        expect(container.querySelector('[data-scenarie="Scen"]')!.textContent).toMatch(/^ Scen · x/);
        expect([...container.querySelectorAll('[data-scenarie="Ref"] svg text.fjv-a-akse')].some((t) => t.textContent === "Periode")).toBe(true);
        expect(container.textContent).toMatch(/summen af enhedernes periode-rækker/);
        expect(container.querySelector(".fjv-a-forklaring")!.textContent).not.toMatch(/Varmebehov/);
    });
});

describe("tillæg: kortets farvevalg styrer også variansgraferne", () => {
    const polaritet = (p: number, saet: Farvesaet) => ({ slags: "delta" as const, polaritet: p, saet });

    it("graffarven pr. tilstand × farvesæt × polaritet × fortegn (ét fast trin, ingen gradient)", () => {
        const FORVENTET: [Farvesaet, number, number, string | undefined][] = [
            ["roedgroen", 0, +1, "groen"], ["roedgroen", 0, -1, "roed"], ["roedgroen", -1, +1, "roed"], ["roedgroen", -1, -1, "groen"], ["roedgroen", 1, +1, "groen"], ["roedgroen", 1, -1, "roed"],
            ["blaaroed", 0, +1, "blaa"], ["blaaroed", 0, -1, "roed"], ["blaaroed", -1, +1, "roed"], ["blaaroed", -1, -1, "blaa"], ["blaaroed", 1, +1, "blaa"], ["blaaroed", 1, -1, "roed"],
            // Neutral: blå/orange uden polaritet; med polaritet temaets god/dårlig = bibliotekets IBCS-farve (undefined).
            ["neutral", 0, +1, "op"], ["neutral", 0, -1, "ned"], ["neutral", -1, +1, undefined], ["neutral", 1, -1, undefined],
        ];
        for (const vis of ["retning", "heatmap"] as Visning[]) for (const [saet, p, fortegn, rampe] of FORVENTET) {
            expect(grafFarve(vis, polaritet(p, saet), fortegn * 1234.5)).toBe(rampe && `var(--fjv-heat-${rampe})`);
        }
        for (const saet of FARVESAET) for (const p of [-1, 0, 1]) for (const v of [1, -1, 0, null, Number.NaN]) {
            expect(grafFarve("ingen", polaritet(p, saet), v)).toBeUndefined();
            expect(grafFarve("heatmap", polaritet(p, saet), v === 1 || v === -1 ? 0 : v)).toBeUndefined();
        }
        expect(grafFarve("heatmap", { slags: "niveau" }, 5)).toBeUndefined();
    });

    it("graffarverne er målt ≥ 3:1 mod kortfladen i alle temaer (KONTRASTKRAV, kontrastscriptet)", () => {
        for (const t of ["heatmap_op", "heatmap_ned", "heatmap_groen", "heatmap_roed", "heatmap_blaa"]) {
            const krav = KONTRASTKRAV.find(([fg]) => fg === t);
            expect(krav?.[1]).toContain("flade");
            expect(krav![2]).toBeGreaterThanOrEqual(GRAFIK);
        }
    });

    // Produktionskortet: enheden 'op' producerer mere i scenariet, 'ned' mindre.
    const enheder = (mwh: Record<string, number>) => Object.entries(mwh).map(([navn, produktion_mwh]) =>
        ({ navn, produktion_mwh, andel_pct: (produktion_mwh / sum(Object.values(mwh))) * 100, driftstimer: 10 })) as EnhedTal[];
    const kort = (vs: Record<string, number>) => ({ samlet: { enheder: enheder(vs), lagre: [] }, maaneder: tabel({}), input: [] }) as unknown as Pakke;
    const A = kort({ op: 1000, ned: 3000 }), B = kort({ op: 2500, ned: 2000 });
    const fyld = (c: HTMLElement, rolle: string) => Object.fromEntries([...c.querySelectorAll(`svg [data-role="${rolle}"]`)].map((m) => [m.getAttribute("data-category"), m.getAttribute("fill")]));

    it("Ingen: grafen er uændret — samme markup som ProduktionMod uden farvevalg, neutral blå", () => {
        saetVisning("delta", "ingen");
        const { container } = render(<Produktion a={A} b={B} />);
        const kortSvg = container.querySelector("svg")!.outerHTML;
        cleanup();
        const { container: før } = render(<ProduktionMod varians={produktionsvarians(A.samlet.enheder, B.samlet.enheder)} fremhaev="op" />);
        // Ens markup bortset fra React's genererede id (useId).
        const uden = (html: string) => html.replace(/_r_[a-z0-9]+_/g, "id");
        expect(uden(kortSvg)).toBe(uden(før.querySelector("svg")!.outerHTML));
        expect(fyld(før, "variance")).toEqual({ op: "var(--fjv-delta-neutral)", ned: "var(--fjv-delta-neutral)" });
    });

    it.each([
        ["retning", "roedgroen", "groen", "roed"], ["heatmap", "roedgroen", "groen", "roed"],
        ["retning", "blaaroed", "blaa", "roed"], ["heatmap", "blaaroed", "blaa", "roed"],
        ["retning", "neutral", "op", "ned"], ["heatmap", "neutral", "op", "ned"],
    ] as const)("%s + %s: søjle, nål og etiket i farvesættets pol (mere = %s, mindre = %s); tallene beholder fortegn", (vis, saet, mere, mindre) => {
        saetVisning("delta", vis); saetFarvesaet(saet);
        const { container } = render(<Produktion a={A} b={B} />);
        for (const rolle of ["variance", "pin"]) expect(fyld(container, rolle)).toEqual({ op: `var(--fjv-heat-${mere})`, ned: `var(--fjv-heat-${mindre})` });
        const etiketter = [...container.querySelectorAll('svg [data-role="variance-label"]')];
        expect(etiketter.filter((e) => e.getAttribute("data-category") === "op").every((e) => e.getAttribute("fill") === `var(--fjv-heat-${mere})`)).toBe(true);
        expect(etiketter.map((e) => e.textContent)).toEqual(expect.arrayContaining(["+1,50", "−1,00"]));
        // Fodnoten følger valget: ikke "neutrale (blå)", når et farvesæt farver grafen.
        const fod = container.querySelector(".fjv-fod")!.textContent!;
        expect(fod).not.toMatch(/neutrale \(blå\)/);
        expect(fod).toMatch(/Farvevalget gælder hele kortet/);
        // Samme farve i graf og tabel for samme fortegn (Retning: tallets farve; Heatmap: cellens nuance).
        const ΔAndel = [...container.querySelectorAll("tbody tr")].map((r) => r.querySelectorAll("td")[3] as HTMLElement);
        if (vis === "retning") expect(ΔAndel.map((td) => td.style.color).filter(Boolean).sort()).toEqual([`var(--fjv-heat-${mere})`, `var(--fjv-heat-${mindre})`].sort());
        else expect(ΔAndel.map((td) => td.getAttribute("data-heat")?.split("-")[0]).filter(Boolean).sort()).toEqual([mere, mindre].sort());
    });
});
