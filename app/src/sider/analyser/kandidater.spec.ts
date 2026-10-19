// Brief 14: kandidatlisten "hvad skal jeg sammenligne med?" — rangering og "hvad er ændret".
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import type { Koersel, Scenarie } from "./beregn";
import { aendringsResume, afvigerTekst, deltaTekst, kandidater, resumeTekst, type KoerselInfo } from "./kandidater";
import { sammenlignelighed, profil } from "./beregn";

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
const vinter = (bal: boolean): InputRække[] => [
    ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-16\""),
    ind("scenarie", "_koersel.med_balancering", String(bal)), ind("scenarie", "solver.mip_rel_gap", "0.0002"), ind("scenarie", "solver.mip_abs_gap", "100.0"),
];
let nr = 0;
function info(navn: string, objektiv: number | null, input: InputRække[], over: Partial<Koersel> = {}, scen: Partial<Scenarie> = {}): KoerselInfo {
    const id = `k${nr++}`;
    const k = {
        id, scenarie_id: `s-${navn}`, vaerk_id: "andeby", vaerk_revision: 1, status: "faerdig", bestilt: new Date(Date.UTC(2026, 9, 16, 8, nr)),
        model_commit: "b49aeb0af097be42938b80a0fea6acdd77162836", data_commit: "392992c7fe35992e79fba8d1ba7b91967e8d1481",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv ?? undefined,
        manifest_json: JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-16", oploesning: "1h" } }), ...over,
    } as Koersel;
    return { k, scenarie: { id: k.scenarie_id, navn, med_balancering: false, ...scen } as Scenarie, vaerkNavn: "Andeby", input };
}

// Demo-sættet (D01–D08 + F3) med de målte objektiver fra fv-ekspert.
const D01 = info("Demo: Andeby vinter — reference", 3424407.96, vinter(false));
const D02 = info("Demo: Andeby vinter — uden tankene", 3468627.83, [...vinter(false), ind("aendring", "storage.tank_hoej.enabled", "false"), ind("aendring", "storage.tank_lav.enabled", "false")]);
const D03 = info("Demo: Andeby vinter — uden varmepumpen", 3897791.79, [...vinter(false), ind("aendring", "units.vp_luft_vand.enabled", "false")]);
const D04 = info("Demo: Andeby vinter — gaspris +20 %", 3690184.00, [...vinter(false), ind("aendring", "prices.natural_gas.value", "727.2")]);
const D05 = info("Demo: Andeby vinter — med den gamle 12 MW elkedel", 3290606.73, [...vinter(false), ind("aendring", "units.elkedel_gl.enabled", "true")]);
const D06 = info("Demo: Andeby vinter — med balancemarked", 3000362.97, vinter(true));
const D07 = info("Demo: Andeby vinter — med balancemarked, uden tankene", 3073850.47, [...vinter(true), ind("aendring", "storage.tank_hoej.enabled", "false"), ind("aendring", "storage.tank_lav.enabled", "false")]);
// F3: samme værk og periode, men værkets eget gab (0,1 % / 1.000 kr.) — ikke direkte sammenlignelig.
const F3 = info("F3 manuel - Andeby vinter uden balancering", 3424407.96, [
    ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-16\""), ind("scenarie", "_koersel.med_balancering", "false"),
], { oensket_rel_gap: 0.001, oensket_abs_gap: 1000 });
const BILLUND = info("Demo: Billund Spor B — med balancemarked", 3964585.72, [ind("scenarie", "_koersel.med_balancering", "true")],
    { vaerk_id: "billund", manifest_json: JSON.stringify({ periode: { start: "2026-03-02", slut: "2026-06-23" } }) });
BILLUND.vaerkNavn = "billund_sporB";
const FEJL = info("F3 fejlvej", null, vinter(true), { status: "fejl", objektiv_dkk: undefined });
const ALLE = [D01, D02, D03, D04, D05, D06, D07, F3, BILLUND, FEJL];

describe("hvad er ændret — klartekst", () => {
    it("slåede-fra lagre samles: 'Uden tank_hoej, tank_lav'", () => {
        expect(aendringsResume(D02.input)).toEqual(["Uden tank_hoej, tank_lav"]);
    });
    it("satte værdier får etiket og enhed i kr.", () => {
        expect(aendringsResume(D04.input)).toEqual(["Naturgaspris 727,2 kr./MWh brændsel"]);
    });
    it("slåede-til enheder: 'Med elkedel_gl'", () => {
        expect(aendringsResume(D05.input)).toEqual(["Med elkedel_gl"]);
    });
    it("periode, balancering, solver og frosne pins er ikke ændringer → 'Værket som det er'", () => {
        const r = aendringsResume([...vinter(true), ind("scenarie", "_koersel.model_commit", "\"abc\"")]);
        expect(r).toEqual([]);
        expect(resumeTekst(r)).toBe("Værket som det er");
    });
    it("målt varmelast og balanceringsfelter beskrives", () => {
        expect(aendringsResume([ind("scenarie", "_koersel.heat_csv", "\"billund.csv\""), ind("aendring", "balancing.activation.foresight", "\"realized\"")]))
            .toEqual(["Målt varmelast (billund.csv)", "Hvad modellen ved, når den byder: kender aktiveringerne"]);
    });
});

describe("Δ og afvigelser i ord", () => {
    it("Δ har altid etiket og retning", () => {
        expect(deltaTekst(44219.87)).toBe("44.220 kr. dyrere end denne");
        expect(deltaTekst(-133801.2)).toBe("133.801 kr. billigere end denne");
        expect(deltaTekst(0.2)).toBe("samme driftsomkostning som denne");
        expect(deltaTekst(null)).toBe("ingen driftsomkostning at sammenligne");
    });
    it("afvigelser kort: anden periode, andet værk, andet ønsket gab", () => {
        const af = sammenlignelighed(profil(D01.k, "Andeby", D01.scenarie, D01.input), profil(BILLUND.k, "billund_sporB", BILLUND.scenarie, BILLUND.input));
        expect(afvigerTekst(af)).toEqual(["andet værk", "anden periode"]);
        expect(afvigerTekst(sammenlignelighed(profil(D01.k, "A", null, D01.input), profil(F3.k, "A", null, F3.input))))
            .toEqual(["andet ønsket relativt gab", "andet ønsket absolut gab"]);
    });
});

describe("rangering", () => {
    it("et scenarie (uden tankene): sammenlignelige først, den naturlige reference (D01) øverst", () => {
        const { anbefalet, andre } = kandidater(D02, ALLE);
        expect(anbefalet[0].navn).toBe(D01.scenarie!.navn);
        expect(anbefalet[0].naturlig).toBe(true);
        expect(anbefalet.every((c) => c.status === "ja")).toBe(true);
        expect(anbefalet.map((c) => c.navn)).toContain(D07.scenarie!.navn);
        // F3 (andet gab), Billund (andet værk) og en fejlet kørsel er ikke anbefalet
        expect(andre.map((c) => c.navn)).toEqual(expect.arrayContaining([F3.scenarie!.navn, BILLUND.scenarie!.navn, FEJL.scenarie!.navn]));
        expect(anbefalet.find((c) => c.navn === D01.scenarie!.navn)!.delta).toBeCloseTo(3424407.96 - 3468627.83, 2);
    });
    it("samme balancering før anden balancering; værket som det er før andre scenarier", () => {
        const { anbefalet } = kandidater(D02, ALLE);
        const i = (s: KoerselInfo) => anbefalet.findIndex((c) => c.navn === s.scenarie!.navn);
        expect(i(D01)).toBeLessThan(i(D06));   // begge uden ændringer; D01 har samme balancering
        expect(i(D06)).toBeLessThan(i(D03));   // værket som det er (anden balancering) før et andet scenarie
        expect(i(D03)).toBeLessThan(i(D07));   // samme balancering før anden balancering
    });
    it("med balancemarked + uden tankene: naturlig reference er D06 (værket som det er, med balancemarked)", () => {
        expect(kandidater(D07, ALLE).anbefalet[0].navn).toBe(D06.scenarie!.navn);
    });
    it("scenariets egen reference (reference_scenarie_id) slår alt", () => {
        const scen = { ...D02, scenarie: { ...D02.scenarie!, reference_scenarie_id: D05.k.scenarie_id } };
        expect(kandidater(scen, ALLE).anbefalet[0].navn).toBe(D05.scenarie!.navn);
    });
    it("en gentagelse med samme input står sidst blandt de sammenlignelige og er ikke 'naturlig'", () => {
        const gentag = info("Demo: Andeby vinter — reference (igen)", 3424407.96, vinter(false));
        const { anbefalet } = kandidater(D01, [...ALLE, gentag]);
        expect(anbefalet.at(-1)!.navn).toBe(gentag.scenarie!.navn);
        expect(anbefalet.at(-1)!.sammeInput).toBe(true);
        expect(anbefalet[0].naturlig).toBe(false);   // D01 er selv værket som det er; ingen naturlig reference
    });
    it("ikke-sammenlignelige: samme værk før andre værker, med hvad der afviger", () => {
        const { andre } = kandidater(D02, ALLE);
        expect(andre[0].vaerkNavn).toBe("Andeby");
        expect(andre.find((c) => c.navn === BILLUND.scenarie!.navn)!.afviger).toEqual(["andet værk", "anden periode"]);
        expect(andre.find((c) => c.navn === FEJL.scenarie!.navn)!.afviger).toEqual(["ikke færdig (Fejl)"]);
    });
    it("ingen anden kørsel → tomme lister", () => {
        expect(kandidater(D01, [D01])).toEqual({ anbefalet: [], andre: [] });
    });
});
