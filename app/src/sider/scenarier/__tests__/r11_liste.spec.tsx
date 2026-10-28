// Brief 41, tillæg 2 (2026-10-28): "Do not need heatmaps and coloring here." Scenarielisten har intet farvevalg og
// ingen cellefarver — ΔRef er et almindeligt tal med fortegn i brødtekstens farve — og listen rører ikke det delte
// farvevalg, som analysesiderne fortsat bruger.
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { glemVisning, saetFarvesaet, saetVisning } from "@/lib/tabelfarve";
import type { Koersel } from "../../../../rayfin/data/Koersel";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import type { Pakke } from "../../analyser/data";
import { Produktion } from "../../analyser/sammenlign";
import Oversigt from "../Oversigt";

const hentet = <T,>(data: T) => ({ data, fejl: undefined, indlæser: false, genindlæs: () => {} });
const ref = { id: "s1", vaerk_id: "v1", navn: "Reference", arkiveret: false, oprettet: new Date(Date.UTC(2026, 9, 1)), oprettet_af: "a@example.org" } as Scenarie;
const scen = { ...ref, id: "s2", navn: "Scenarie", reference_scenarie_id: "s1", oprettet: new Date(Date.UTC(2026, 9, 2)) } as Scenarie;
const koersel = (s: Scenarie, objektiv_dkk: number) => ({
    id: `k-${s.id}`, scenarie_id: s.id, vaerk_id: "v1", status: "faerdig", objektiv_dkk, oploesning: "1h", data_commit: "d", model_commit: "m",
    oensket_rel_gap: 0.0002, oensket_abs_gap: 100, manifest_json: "{}", bestilt: new Date(Date.UTC(2026, 9, 3)), bestilt_af: "a@example.org",
}) as unknown as Koersel;

vi.mock("@/lib/data/hooks", () => ({
    useScenarier: () => hentet([ref, scen]),
    useVaerker: () => hentet([{ id: "v1", navn: "Andeby" }]),
    useKoersler: () => hentet([koersel(ref, 1_000_000), koersel(scen, 1_044_219)]),
    useKoerselStatus: (k: Koersel[] | undefined) => k ?? [],
}));

beforeEach(() => { localStorage.clear(); glemVisning(); saetVisning("delta", "heatmap"); saetFarvesaet("roedgroen"); });
afterEach(cleanup);

describe("scenarielisten uden farvevalg og heatmap", () => {
    it("ingen kontrol, ingen farvede celler, ΔRef som almindeligt tal med fortegn", () => {
        const { container } = render(<Oversigt gåTil={() => {}} bruger="a@example.org" sti={[]} />);
        const kort = [...container.querySelectorAll("article.fjv-kort")].find((k) => k.querySelector(".fjv-kort-titel")?.textContent?.startsWith("Scenarier"))!;
        expect(kort.querySelector(".fjv-farvevalg, .fjv-farvevalg-raekke, [aria-label='Farver i tabellen'], [aria-label='Farvesæt']")).toBeNull();
        expect(kort.querySelectorAll("td[data-heat]")).toHaveLength(0);
        for (const td of kort.querySelectorAll<HTMLElement>("td")) {
            expect(td.style.background).toBe("");
            expect(td.style.color).toBe("");
        }
        // Ingen virkningsfarve i tallet (DeltaTal ville bære data-impact og en inline farve).
        expect(kort.querySelector("[data-impact], [data-role='variance-label']")).toBeNull();
        const scenRække = [...kort.querySelectorAll("tbody tr")].find((r) => r.textContent?.includes("Scenarie"))!;
        expect([...scenRække.querySelectorAll("td")].map((td) => td.textContent)).toContain("+44,2");
        expect(kort.querySelector(".fjv-fod")!.textContent).not.toMatch(/kraftigere|Grøn = |Blå = /);
    });

    it("det delte farvevalg er urørt, og analysesidernes kontrol virker som før", () => {
        render(<Oversigt gåTil={() => {}} bruger="a@example.org" sti={[]} />);
        expect(localStorage.getItem("fjv.tabelfarve.delta.v1")).toBe("heatmap");
        expect(localStorage.getItem("fjv.tabelfarve.farvesaet.v1")).toBe("roedgroen");
        cleanup();
        const enheder = (x: number) => [{ navn: "a", produktion_mwh: x, andel_pct: 40, driftstimer: 1 }, { navn: "b", produktion_mwh: 1000, andel_pct: 60, driftstimer: 1 }];
        const p = (x: number) => ({ samlet: { enheder: enheder(x), lagre: [] }, input: [] }) as unknown as Pakke;
        const { container } = render(<Produktion a={p(500)} b={{ ...p(900), samlet: { enheder: [{ ...enheder(900)[0], andel_pct: 47 }, { ...enheder(900)[1], andel_pct: 53 }], lagre: [] } } as unknown as Pakke} />);
        expect(container.querySelector("[aria-label='Farver i tabellen'] [aria-pressed='true']")!.textContent).toBe("Heatmap");
        expect(container.querySelector("[aria-label='Farvesæt'] [aria-pressed='true']")!.textContent).toBe("Rød/grøn");
        expect(container.querySelectorAll("td[data-heat]").length).toBeGreaterThan(0);
    });
});
