import { describe, expect, it } from "vitest";
import { parsMarkdown, inlineTekst } from "../dokumentation/markdown/parse";
import { filtrer, linkKursiveHenvisninger, navneAf, ordposter, postForAnker } from "./ordliste";
import { ordlisteHref } from "./ordliste-anker";

const rå = (import.meta.glob("../dokumentation/indhold/viden/ordliste.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>)["../dokumentation/indhold/viden/ordliste.md"];
const poster = ordposter(parsMarkdown(rå));

describe("navne pr. fagord", () => {
    it.each([
        ["Gab (solvergab, MIP-gab)", ["Gab", "solvergab", "MIP-gab"]],
        ["Differens / differensmetoden", ["Differens", "differensmetoden"]],
        ["Minimumslast, min. driftstid, min. stilstand", ["Minimumslast", "min. driftstid", "min. stilstand"]],
        ["ΔT (delta T)", ["ΔT", "delta T"]],
        ["aFRR", ["aFRR"]],
    ])("%s", (ord, navne) => expect(navneAf(ord)).toEqual(navne));
});

describe("ordlisten", () => {
    it("alle poster i filen er med (ét '**ord** —' pr. afsnit)", () => {
        const antal = (rå.match(/^\*\*[^*]+\*\* — /gm) ?? []).length;
        expect(poster.length).toBe(antal);
        expect(antal).toBeGreaterThan(30);
    });
    it("ankre er unikke på tværs af hele ordlisten — ellers peger to ord på samme sted", () => {
        const alle = poster.flatMap((p) => p.ankre);
        expect(new Set(alle).size).toBe(alle.length);
    });
    it("det dokumenterede ankerformat virker: aFRR, spor-a, cm-pris, solvergab, mip-gab, differensmetoden", () => {
        for (const [anker, ord] of [["afrr", "aFRR"], ["spor-a", "Spor A"], ["cm-pris", "CM-pris (kapacitetspris)"], ["kapacitetspris", "CM-pris (kapacitetspris)"], ["solvergab", "Gab (solvergab, MIP-gab)"],
            ["mip-gab", "Gab (solvergab, MIP-gab)"], ["differensmetoden", "Differens / differensmetoden"], ["månedsloft", "Månedsloft (availability)"]]) {
            expect(postForAnker(poster, anker)?.ord, anker).toBe(ord);
        }
        expect(postForAnker(poster, "findes-ikke")).toBeUndefined();
        expect(postForAnker(poster, undefined)).toBeUndefined();
    });
    it("ordlisteHref bygger ankeret efter hash-ruten", () => {
        expect(ordlisteHref("aFRR")).toBe("#/information/ordliste#afrr");
        expect(ordlisteHref("Spor A")).toBe("#/information/ordliste#spor-a");
    });
    it("søgning finder på ord og forklaring, alle søgeord skal passe, tom søgning viser alt", () => {
        expect(filtrer(poster, "")).toHaveLength(poster.length);
        expect(filtrer(poster, "solvergab").map((p) => p.ord)).toContain("Gab (solvergab, MIP-gab)");
        expect(filtrer(poster, "frequency restoration").map((p) => p.ord).sort()).toEqual(["aFRR", "mFRR"]);
        expect(filtrer(poster, "frequency xyzxyz")).toEqual([]);
    });
    it("forklaringen står uden gedankestreg og indeholder ikke selve ordet som fed", () => {
        const a = postForAnker(poster, "afrr")!;
        expect(inlineTekst(a.forklaring).startsWith("—")).toBe(false);
        expect(inlineTekst(a.forklaring)).toMatch(/automatic Frequency Restoration Reserve/);
    });
    it("kursive henvisninger til et kendt fagord bliver link; andre kursiver bliver stående", () => {
        const akt = postForAnker(poster, "aktivering")!;
        const m = linkKursiveHenvisninger(akt.forklaring, poster, akt);
        expect(m.some((n) => n.t === "link" && n.href === "#/information/ordliste#kapacitet")).toBe(true);
        const a = postForAnker(poster, "afrr")!;
        expect(linkKursiveHenvisninger(a.forklaring, poster, a).some((n) => n.t === "link")).toBe(false);
    });
});
