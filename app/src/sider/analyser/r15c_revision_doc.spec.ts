// Tredje rettelsesrunde i runde 15, P3-5: "Trofasthedstabellen overdriver sikkerheden ved manglende værksrevision."
//
// Rækken "Hvornår en differens er et resultat" i doc/TROFASTHED.md §5 sagde først, at "samme værk og værksrevision"
// er et krav, og senere i samme række, at en ukendt revision kun er en note. Koden følger det sidste: et par med
// revision 2 i referencen og INGEN revision i scenariet får "ja", når de øvrige krav er opfyldt (ældre data). Den
// undtagelse er appens egen antagelse og hører med i kravsætningen. Her bindes ordlyden til reglen.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import type { Koersel } from "../../../rayfin/data/Koersel";
import { profil, sammenlignelighedsDom } from "./beregn";

// En fil i repoets rod. (Ikke en dynamisk `new URL(…, import.meta.url)`: Vite læser den som et glob over hele mappen.)
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const raekke = readFileSync(resolve(REPO, "doc/TROFASTHED.md"), "utf8").split("\n").find((l) => l.startsWith("| Hvornår en differens er et resultat"));

const ind = (kilde: InputRække["kilde"], sti: string, v: unknown): InputRække => ({ kilde, sti, vaerdi_json: JSON.stringify(v) });
const input = [ind("scenarie", "_koersel.start", "2026-01-05"), ind("scenarie", "_koersel.slut", "2026-01-06"), ind("vaerk", "time.resolution", "1h")];
const koersel = (id: string, vaerk_revision: number | null): Koersel => ({
    id, scenarie_id: `s-${id}`, vaerk_id: "v", vaerk_revision, status: "faerdig", objektiv_dkk: 866_567.72, best_bound: 866_567.72, solve_status: "optimal",
    oploesning: "1h", data_commit: "106b9fce9a2e3610090b1a542559024056449b88", model_commit: "939228aa048563c8498382a79d207c8b03fbda57",
    oensket_rel_gap: 0.0002, oensket_abs_gap: 100, manifest_json: JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-06", oploesning: "1h" } }),
    bestilt: new Date(Date.UTC(2026, 10, 18, 10)), bestilt_af: "a@b.dk",
}) as unknown as Koersel;
const dom = (a: number | null, b: number | null) => sammenlignelighedsDom(profil(koersel("a", a), "Andeby", null, input), profil(koersel("b", b), "Andeby", null, input));

describe("P3-5: reglen, som dokumentet skal beskrive", () => {
    it("to forskellige KENDTE værksrevisioner spærrer", () => {
        expect(dom(2, 3).status).toBe("nej");
        expect(dom(2, 2).status).toBe("ja");
    });
    it("efterprøvningens tilfælde: revision 2 mod en manglende revision er stadig 'ja' — med en note", () => {
        const d = dom(2, null);
        expect(d.status).toBe("ja");
        expect(d.afvigelser.find((x) => x.felt === "vaerk_revision")).toMatchObject({ alvor: "note" });
        expect(dom(null, null).status).toBe("ja");
    });
});

describe("P3-5: doc/TROFASTHED.md §5 siger det samme i kravsætningen", () => {
    it("rækken findes", () => { expect(raekke).toBeDefined(); });
    it("kravsætningen kalder ikke 'samme værksrevision' et ubetinget krav", () => {
        expect(raekke).not.toMatch(/samme værk \*\*og værksrevision\*\*/);          // før: stod der — i modstrid med noten senere i rækken
    });
    it("forskellige KENDTE revisioner spærrer, og en manglende revision er en oplyst undtagelse (appens egen antagelse)", () => {
        expect(raekke).toMatch(/to forskellige \*\*kendte\*\* værksrevisioner spærrer/);
        expect(raekke).toMatch(/Mangler værksrevisionen[^.]*spærrer det ikke[^.]*oplyst undtagelse/);
        expect(raekke).toMatch(/Mangler værksrevisionen[^|]*egen antagelse/);
    });
    it("kravsætningen står FØR beskrivelsen af dommen — ikke kun som en note sidst i rækken", () => {
        expect(raekke!.indexOf("Mangler værksrevisionen")).toBeGreaterThan(-1);
        expect(raekke!.indexOf("Mangler værksrevisionen")).toBeLessThan(raekke!.indexOf("Dommen fældes"));
    });
});
