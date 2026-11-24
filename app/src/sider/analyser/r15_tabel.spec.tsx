// Runde 15, fund 3.5 (den uafhængige test 18. november 2026): grafen "Δ driftsomkostning pr. par" under
// Anbefalinger var rigtig, men dens skjulte datatabel (til skærmlæsere) viste "Scen 0,0 · Ref 0,0" for hvert par:
// ParVarians byggede rækkerne med PL: 0 og ingen AC (ibcs-grafer.tsx:193 ved 251aa93). Genskabt FØR rettelsen.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ParVarians } from "./ibcs-grafer";

afterEach(cleanup);

/** Den skjulte tabel som rækker af celletekster (første række = overskrifterne). */
function tabel(c: HTMLElement): string[][] {
    return [...c.querySelectorAll("table tr")].map((tr) => [...tr.querySelectorAll("th, td")].map((x) => x.textContent ?? ""));
}

describe("3.5: den skjulte datatabel bag 'Δ driftsomkostning pr. par' har de rigtige tal", () => {
    // Testrapportens to par: 12 døgn (3.441.004,22 → 3.464.520,18) og 2 døgn (866.567,72 → 867.219,55).
    const par = [
        { navn: "Tanken, 12 døgn", ref: 3_441_004.22, scen: 3_464_520.18, delta: 23_515.96, indenForTolerance: false },
        { navn: "Tanken, 2 døgn", ref: 866_567.72, scen: 867_219.55, delta: 651.83, indenForTolerance: false },
    ];
    it("Scen og Ref er de to kørslers driftsomkostning, ΔRef forskellen — før 'Scen 0,0 · Ref 0,0'", () => {
        const t = tabel(render(<ParVarians par={par} />).container);
        expect(t[0]).toEqual(["Par", "Scen", "Ref", "ΔRef"]);
        expect(t[1]).toEqual(["Tanken, 12 døgn", "3.464,5", "3.441,0", "+23,5"]);
        expect(t[2]).toEqual(["Tanken, 2 døgn", "867,2", "866,6", "+0,7"]);
    });
    it("tabellens ΔRef er Scen − Ref i samme enhed som grafens etiketter (t.kr.)", () => {
        const { container } = render(<ParVarians par={par} />);
        expect(container.querySelector("caption")?.textContent).toContain("t.kr.");
        const etiketter = [...container.querySelectorAll("svg text")].map((x) => x.textContent);
        expect(etiketter).toContain("+23,5");
        // Grafen tegner stadig kun ΔRef: ingen bjælker for Scen eller Ref.
        expect(container.querySelectorAll("[data-role='bar-AC'], [data-role='bar-PL']")).toHaveLength(0);
    });
});
