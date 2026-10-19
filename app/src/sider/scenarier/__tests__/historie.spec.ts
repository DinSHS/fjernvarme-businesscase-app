//-----------------------------------------------------------------------
// A2 (briefs/15): scenariets historie. Før kørsel bygges det input, kørslen
// VILLE få frosset, så fv-analyse's tekstgeneratorer kan læse det som et
// rigtigt KoerselInput.
//-----------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { spoergsmaal } from "../../analyser/beregn";
import { forventetInput, frossetRækker, type Blade, type Scenariefelter } from "../logik";
import { VAERKER } from "./vaerker.testdata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { historieEfterKørsel, saetningFørKørsel } from "../historie";
import type { Koersel, Noegletal, Scenarie } from "../../analyser/beregn";
import type { InputRække } from "@/lib/data/afflad";

const blade: Blade = new Map(Object.entries(VAERKER.andeby));
const felter: Scenariefelter = {
    periode_start: "2026-01-05", periode_slut: "2026-01-16", med_balancering: true, balancing_method: null,
    mip_rel_gap: 0.0002, mip_abs_gap: 100, tidsgraense_s: null, ekstra_flag: null, heat_csv: null,
};

describe("forventet input før kørsel", () => {
    it("har værkets blade + ændringer + scenariefelter i KoerselInput-form", () => {
        const input = forventetInput([{ type: "disable", sti: "tank_lav" }], felter, blade);
        expect(input.filter((r) => r.kilde === "vaerk")).toHaveLength(blade.size);
        expect(input).toContainEqual({ kilde: "aendring", sti: "storage.tank_lav.enabled", vaerdi_json: "false" });
        expect(input).toContainEqual({ kilde: "scenarie", sti: "_koersel.med_balancering", vaerdi_json: "true" });
    });

    it("bevarer rå værdier (decimaltal forbliver decimaltal)", () => {
        const r = frossetRækker([{ type: "set", sti: "prices.straw.value", vaerdi_json: "90.0" }], felter, blade);
        expect(r[0].vaerdi_json).toBe("90.0");
    });

    it("kan læses af fv-analyse's spoergsmaal() som et rigtigt frosset input", () => {
        const linjer = spoergsmaal(forventetInput([{ type: "disable", sti: "tank_lav" }], felter, blade));
        expect(linjer.some((l) => /tank_lav/.test(l) && /fra/.test(l))).toBe(true);
        expect(linjer.some((l) => /balancemarked/i.test(l))).toBe(true);
    });
});

// ------------------------------------------------------------------ med fv-analyse's generator


const tom: Scenariefelter = { ...felter, med_balancering: false };

describe("sætning 1 før kørsel (fv-analyse's generator)", () => {
    it("tankene fra mod værket, som det er", () => {
        const scen = forventetInput([{ type: "disable", sti: "tank_lav" }, { type: "disable", sti: "tank_hoej" }], tom, blade);
        const ref = forventetInput([], tom, blade);
        const s = saetningFørKørsel(ref, "Andeby (værket som det er)", scen, "Uden tankene", "Andeby");
        // Ordlyden er fv-analyse's; her testes kun, at ændringen og referencen står i sætningen.
        expect(s).toMatch(/^I dette scenarie .*begge tanke fra/);
        expect(s).toMatch(/ellers som Andeby \(værket som det er\)\.$/);
    });
    it("balancemarkedet og en pris, med danske navne", () => {
        const scen = forventetInput([{ type: "set", sti: "prices.natural_gas.value", vaerdi_json: "700.0" }], felter, blade);
        const s = saetningFørKørsel(forventetInput([], tom, blade), "værket", scen, "x", "Andeby");
        expect(s).toMatch(/balancemarkedet \(aFRR og mFRR\) til/);
        expect(s).toMatch(/naturgasprisen fra .* til 700/);
    });
    it("uden ændringer siges det ærligt", () => {
        expect(saetningFørKørsel(forventetInput([], tom, blade), "værket", forventetInput([], tom, blade), "x", "Andeby")).toMatch(/samme input/);
    });
});

/** Rigtige kørsler fra harnessens øjebliksbillede af databasen (fv-app henter dem). */
const FIX = JSON.parse(readFileSync(resolve(process.cwd(), "skaermbilleder/harness/fixtures.json"), "utf-8")) as Record<string, Record<string, unknown>[]>;
function kørsel(scenarienavn: string) {
    const s = FIX.Scenarie.find((x) => x.navn === scenarienavn) as unknown as Scenarie;
    const k = FIX.Koersel.find((x) => x.scenarie_id === s.id && x.status === "faerdig") as unknown as Koersel;
    return {
        k, navn: s.navn, scenarie: s,
        input: FIX.KoerselInput.filter((r) => r.koersel_id === k.id) as unknown as InputRække[],
        noegletal: FIX.KoerselNoegletal.filter((r) => r.koersel_id === k.id) as unknown as Noegletal[],
    };
}

describe("hele historien efter kørsel (demo-par P1: Andeby vinter uden tankene)", () => {
    const ref = kørsel("Demo: Andeby vinter — reference");
    const scen = kørsel("Demo: Andeby vinter — uden tankene");
    const h = historieEfterKørsel(ref, scen, "Andeby", new Set());

    it("fortæller ændringen, konsekvensen i kroner og sikkerheden", () => {
        expect(h.tekst).toMatch(/^I dette scenarie .*begge tanke fra/);
        expect(h.tekst).toMatch(/dyrere i perioden/);
        expect(h.tekst.split(/(?<=\.) (?=[A-ZÆØÅ])/).length).toBeGreaterThanOrEqual(3);
        expect(h.tekst).not.toMatch(/[+−]\d/);   // fortegn i ord, ikke tegn (afrundingsreglen)
    });
    it("vurderingen har Δ = scenarie − reference", () => {
        expect(h.vurdering.delta).toBeCloseTo((scen.k.objektiv_dkk ?? 0) - (ref.k.objektiv_dkk ?? 0), 2);
        expect(h.vurdering.delta!).toBeGreaterThan(0);
    });
    it("byttede roller giver samme historie (generatoren ordner selv parret)", () => {
        expect(historieEfterKørsel(scen, ref, "Andeby", new Set()).tekst).toBe(h.tekst);
    });
});

describe("historien med værkets tidsserier (brief 18)", () => {
    const serie = {
        id: "11111111-1111-4111-8111-111111111111", rolle: "varmelast", navn: "Billund målt 2025–26", sha256: "a".repeat(64),
        sti: "Files/x.csv", oploesning: "1h", start: "2025-07-01T00:00:00Z", slut: "2026-06-30T23:00:00Z", status: "gyldig", aktiv: true,
    };
    it("syntetisk reference mod målt scenarie nævner seriens navn", () => {
        const ref = forventetInput([{ type: "set", sti: "_tidsserie.varmelast", vaerdi_json: '"syntetisk"' }], tom, blade, [serie]);
        const scen = forventetInput([], tom, blade, [serie]);
        const s = saetningFørKørsel(ref, "referencen", scen, "scenariet", "Billund", [serie]);
        expect(s).toMatch(/målt varmelast \(Billund målt 2025–26\)/);
        expect(s).not.toMatch(/samme input/);
    });
    it("samme serie på begge sider er ikke en ændring", () => {
        const inp = forventetInput([], tom, blade, [serie]);
        expect(saetningFørKørsel(inp, "referencen", inp, "scenariet", "Billund", [serie])).toMatch(/samme input/);
    });
});
