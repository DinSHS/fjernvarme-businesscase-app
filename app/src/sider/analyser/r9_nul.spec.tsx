// Runde 9 (orkestratoren 09:44): en celle, der VISES som 0 efter den viste afrunding, får ingen farve — i niveau- og
// Δ-tabeller, i Heatmap og Retning. Testet på de rigtige tabeller (kørslens og sammenligningens 'Måned for måned') med
// værdier lige under og lige over afrundingsgrænsen, plus reglen for hver af de skalaer, siderne bruger.
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { farvning, glemVisning, saetVisning, type Visning } from "@/lib/tabelfarve";
import { maanedstabel, type Maaned } from "./beregn";
import type { Pakke } from "./data";
import { dec, pctVaerdi } from "./fmt";
import { TKR } from "./ibcs-grafer";
import { Maaneder } from "./koersel";
import { MaanedDelta } from "./sammenlign";
import { tal } from "@/lib/format";

/** Et tal, som det står i cellen, der læses som nul: 0, 0,00, −0, 0,0 %, … */
const VIST_NUL = /^[−+-]?0(,0+)?( %)?$/;

const række = (maaned: string, objekt: string | null, noegle: string, vaerdi: number): Maaned =>
    ({ id: `${maaned}|${objekt}|${noegle}`, koersel_id: "k", maaned, objekt, noegle, vaerdi } as unknown as Maaned);
const pakke = (rækker: Maaned[]): Pakke => ({ maaneder: maanedstabel(rækker) } as unknown as Pakke);

/** Alle celler i tabellen: [vist tekst, farvet?]. Farvet = data-heat eller en inline-farve (Retning sætter kun color). */
function celler(c: HTMLElement): [string, boolean][] {
    return [...c.querySelectorAll<HTMLElement>("table td")].map((td) => [td.textContent!.trim(), !!td.dataset.heat || !!td.style.background || !!td.style.color]);
}

beforeEach(() => { localStorage.clear(); glemVisning(); });

describe("en celle, der vises som 0, får ingen farve", () => {
    it("reglen i farvning() for hver skala, siderne viser tal med", () => {
        const art = { slags: "niveau" } as const, Δ = { slags: "delta", polaritet: 0 } as const;
        const GWH2 = { factor: 1, decimals: 2 }, HEL = { factor: 1, decimals: 0 }, EN = { factor: 1, decimals: 1 };
        // [værdi, skala, sådan vises den] — det viste tal og farven skal være enige om nul.
        const sager: [number, typeof GWH2, string][] = [
            [0.004, GWH2, dec(0.004, 2)], [0.0049999, GWH2, dec(0.0049999, 2)], [0.005, GWH2, dec(0.005, 2)],
            [0.4, HEL, tal(0.4)], [0.5, HEL, tal(0.5)], [0.04, EN, pctVaerdi(0.04)], [0.05, EN, pctVaerdi(0.05)],
            [49, TKR, "0,0"], [50, TKR, "0,1"],
        ];
        for (const v of ["heatmap", "retning"] as Visning[]) {
            for (const [x, s, vist] of sager) {
                for (const fortegn of [1, -1]) {
                    const tom = Object.keys(farvning(v, fortegn * x, Δ, 1, s)).length === 0;
                    const nul = VIST_NUL.test(vist);
                    if (v === "heatmap") expect(tom, `Δ ${fortegn * x} vist som ${vist} (${v})`).toBe(nul);
                    else expect(tom || !nul, `Δ ${fortegn * x} vist som ${vist} (${v})`).toBe(true);
                }
                if (v === "heatmap") expect(Object.keys(farvning(v, x, art, 1, s)).length === 0, `niveau ${x} vist som ${vist}`).toBe(VIST_NUL.test(vist));
            }
        }
    });

    it("kørslens månedstabel (niveau, GWh med 2 decimaler): 0,00 er ufarvet — også når værdien er lidt over 0", () => {
        saetVisning("niveau", "heatmap");
        const rk = [
            række("2025-07", "gasmotor", "produktion_gwh", 0.021), række("2025-08", "gasmotor", "produktion_gwh", 0.004),
            række("2025-09", "gasmotor", "produktion_gwh", 0),
            række("2025-07", "elkedel_ny", "produktion_gwh", 0.0049999), række("2025-08", "elkedel_ny", "produktion_gwh", 0.04),
            række("2025-09", "elkedel_ny", "produktion_gwh", 0.005),
            række("periode", "gasmotor", "produktion_gwh", 0.025), række("periode", "elkedel_ny", "produktion_gwh", 0.045),
        ];
        const { container } = render(<Maaneder d={pakke(rk)} pladser={new Map()} />);
        const c = celler(container);
        expect(c.filter(([t, f]) => f && VIST_NUL.test(t))).toEqual([]);
        // Ikke en tom test: de viste nuller findes, og tal over grænsen er farvet.
        expect(c.filter(([t]) => t === "0,00").length).toBeGreaterThanOrEqual(3);
        expect(c.filter(([t, f]) => f && t === "0,01").length).toBe(1);   // 0,005 → "0,01"
        // Og omvendt: hvert vist enhedstal forskelligt fra 0 er farvet (de andre kolonner har intet data: "–").
        const tal2 = c.filter(([t]) => /^\d+,\d\d$/.test(t) && !VIST_NUL.test(t));
        expect(tal2.length).toBeGreaterThanOrEqual(5);
        expect(tal2.filter(([, f]) => !f)).toEqual([]);
        expect(c.filter(([, f]) => f).length).toBe(tal2.length);
    });

    it("sammenligningens månedstabel (Δ, MWh uden decimaler): et Δ, der vises som 0, er ufarvet i Heatmap og Retning", () => {
        // GWh i data, MWh i tabellen: 0,0004 GWh = 0,4 MWh → "0"; 0,0006 GWh = 0,6 MWh → "+1".
        const ref = [række("2025-07", "gasmotor", "produktion_gwh", 0.01), række("2025-08", "gasmotor", "produktion_gwh", 0.01),
            række("periode", "gasmotor", "produktion_gwh", 0.02)];
        const scen = [række("2025-07", "gasmotor", "produktion_gwh", 0.0104), række("2025-08", "gasmotor", "produktion_gwh", 0.0094),
            række("periode", "gasmotor", "produktion_gwh", 0.0198)];
        for (const v of ["heatmap", "retning"] as Visning[]) {
            saetVisning("delta", v);
            const { container, unmount } = render(<MaanedDelta a={pakke(ref)} b={pakke(scen)} />);
            const c = celler(container);
            expect(c.filter(([t, f]) => f && VIST_NUL.test(t)), v).toEqual([]);
            expect(c.map(([t]) => t)).toEqual(expect.arrayContaining(["0", "−1"]));   // juli +0,4 → "0", august −0,6 → "−1"
            expect(c.find(([t]) => t === "−1")![1], `${v}: −1 er farvet`).toBe(true);
            unmount();
        }
    });
});
