// Codex K4: F3 (knapper genkendes på hele skabelonen), F4 (ukendte/ufuldstændige ændringer er neutrale),
// F5 (pris- og omkostningsretning hver for sig), F6 (neutrale udfald får ingen handlingsanvisning; nul er nul),
// F7 ("samme input" afgøres af hele det frosne input). Skrevet FØR rettelsen og kørt mod den gamle kode.
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { profil, samlNoegletal, type Koersel, type Noegletal, type Scenarie } from "./beregn";
import { findPar, historie, ordnPar, vurder, type Side } from "./anbefaling";
import { kandidater, type KoerselInfo } from "./kandidater";

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
let n = 0;
const nt = (gruppe: string, noegle: string, vaerdi: number): Noegletal => ({ id: `k4-${n++}`, koersel_id: "k", gruppe, noegle, vaerdi } as Noegletal);
const VAERK = [
    ind("vaerk", "meta.titel", "\"Testværk\""),
    ind("vaerk", "units.kedel.type", "\"gas_boiler\""), ind("vaerk", "units.kedel.enabled", "true"),
    ind("vaerk", "units.elkedel.type", "\"electric_boiler\""), ind("vaerk", "units.elkedel.enabled", "false"),
    ind("vaerk", "storage.tank.enabled", "true"), ind("vaerk", "storage.tank.volume_m3", "4000"),
    ind("vaerk", "prices.natural_gas.value", "606.0"), ind("vaerk", "prices.straw.value", "205.0"),
    ind("vaerk", "electricity.electricity_tax", "72.0"), ind("vaerk", "electricity.tariff_consumption.fixed_components.elafgift_net", "72.0"),
    ind("vaerk", "heat_load_params.gaf_mw_per_k", "0.5"),
];
const HELAAR = [ind("scenarie", "_koersel.start", "\"2025-07-01\""), ind("scenarie", "_koersel.slut", "\"2026-06-30\""), ind("scenarie", "_koersel.med_balancering", "false")];
function side(navn: string, objektiv: number, egne: InputRække[], gab = 0): Side {
    const input = [...VAERK, ...HELAAR, ...egne];
    const k = {
        id: navn, scenarie_id: navn, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date("2026-10-16T08:00:00Z"),
        model_commit: "b49aeb0af097be42938b80a0fea6acdd77162836", data_commit: "392992c7fe35992e79fba8d1ba7b91967e8d1481",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv, best_bound: objektiv - gab,
    } as Koersel;
    return { k, navn, vaerkNavn: "Testværk", input, samlet: samlNoegletal([nt("objektiv", "objektiv_dkk", objektiv)]), profil: profil(k, "Testværk", null, input) };
}
const ref = (objektiv = 30_000_000, gab = 0) => side("ref", objektiv, [], gab);

describe("K4 F3: en knap genkendes på hele sin skabelon", () => {
    it("elafgift: electricity_tax OG dokumentationsposten elafgift_net til samme sats er ÉN knap", () => {
        const p = ordnPar(ref(), side("scen", 29_000_000, [ind("aendring", "electricity.electricity_tax", "8.0"), ind("aendring", "electricity.tariff_consumption.fixed_components.elafgift_net", "8.0")]));
        expect(p.knap).toBe("elafgift");
        expect(p.flere).toBe(false);
    });
    it("tankstørrelse: reference uden tanken, scenarie med større volumen er ÉN knap — i begge rækkefølger", () => {
        const udenTank = side("uden", 31_000_000, [ind("aendring", "storage.tank.enabled", "false")]);
        const stor = side("stor", 30_000_000, [ind("aendring", "storage.tank.volume_m3", "8000")]);
        const p = ordnPar(udenTank, stor);
        expect([p.knap, p.flere, p.byttet]).toEqual(["tankstoerrelse", false, false]);
        const q = ordnPar(stor, udenTank);
        expect([q.knap, q.byttet, q.ref.navn]).toEqual(["tankstoerrelse", true, "uden"]);
        expect(findPar([udenTank, stor]).map((x) => x.knap)).toEqual(["tankstoerrelse"]);
    });
    it("uvedkommende ekstra ændringer afvises fortsat (tankstørrelse + gaspris)", () => {
        const p = ordnPar(side("uden", 31_000_000, [ind("aendring", "storage.tank.enabled", "false")]),
            side("stor", 30_000_000, [ind("aendring", "storage.tank.volume_m3", "8000"), ind("aendring", "prices.natural_gas.value", "700.0")]));
        expect(p.knap).toBeNull();
        expect(p.flere).toBe(true);
    });
});

describe("K4 F4: ukendte eller ufuldstændigt matchede ændringer får en neutral vurdering", () => {
    it("en ændret varmelast-antagelse (heat_load_params) er ikke et tiltag: ingen 'Anbefalet', ingen 'gennemfør'", () => {
        const p = ordnPar(ref(), side("scen", 29_800_000, [ind("aendring", "heat_load_params.gaf_mw_per_k", "0.1")]));
        const v = vurder(p);
        expect(v.kategori).toBe("kan_ikke_afgoeres");
        expect(v.begrundelse).toMatch(/svarer ikke til en af knapperne/);
        expect(historie(p, v)).not.toMatch(/gennemfør/i);
    });
    it("to brændselspriser på én gang er ikke en isoleret prisfølsomhed", () => {
        const p = ordnPar(ref(), side("scen", 30_400_000, [ind("aendring", "prices.natural_gas.value", "727.2"), ind("aendring", "prices.straw.value", "250.0")]));
        expect(p.knap).toBeNull();
        const v = vurder(p);
        expect(v.kategori).toBe("kan_ikke_afgoeres");
        expect(v.saetning).not.toMatch(/Naturgas/);
    });
});

describe("K4 F5: prisretning og omkostningsretning hver for sig", () => {
    it("prisfald og billigere drift: '20 % billigere … 200.000 kr. billigere'", () => {
        const v = vurder(ordnPar(ref(), side("scen", 29_800_000, [ind("aendring", "prices.natural_gas.value", "484.8")])));
        expect(v.kategori).toBe("foelsomhed");
        expect(v.saetning).toMatch(/^Naturgas 20 % billigere gør driften 200\.000 kr\. billigere i perioden/);
        expect(v.saetning).not.toMatch(/dyrere/);
    });
    // Δ = 265.776 kr. → "ca. 266.000 kr." (kr.-reglen med afrundingsmarkør, Codex K9 F4).
    it("prisstigning og dyrere drift: '20 % dyrere … dyrere'", () => {
        const v = vurder(ordnPar(ref(), side("scen", 30_265_776, [ind("aendring", "prices.natural_gas.value", "727.2")])));
        expect(v.saetning).toMatch(/^Naturgas 20 % dyrere gør driften ca\. 266\.000 kr\. dyrere i perioden/);
    });
    it("prisstigning men lavere omkostning ud over tolerancen: fortegnet kan ikke passe → neutral, ingen 'dyrere drift'", () => {
        const v = vurder(ordnPar(ref(), side("scen", 29_800_000, [ind("aendring", "prices.natural_gas.value", "727.2")])));
        expect(v.kategori).toBe("kan_ikke_afgoeres");
        expect(v.saetning).not.toMatch(/gør driften [\d.]+ kr\. dyrere/);
        expect(v.saetning).toMatch(/200\.000 kr\. billigere/);
    });
});

describe("K4 F6: neutrale udfald uden handlingsanvisning; nul er nul", () => {
    it("Δ +50.000 kr. inden for 2 × tolerancen: 'Kan ikke afgøres' og ingen 'behold'/'sparer'", () => {
        const v = vurder(ordnPar(ref(30_000_000, 100_000), side("scen", 30_050_000, [ind("aendring", "units.kedel.enabled", "false")], 100_000)));
        expect(v.kategori).toBe("kan_ikke_afgoeres");
        expect(v.saetning).not.toMatch(/behold|sparer|gennemfør/i);
        expect(v.saetning).toMatch(/50\.000 kr\. dyrere/);
        expect(v.saetning).toMatch(/kan ikke skelnes fra nul/);
    });
    it("Δ = 0 for en ny enhed: ingen retning — hverken i sætningen eller i historien", () => {
        const p = ordnPar(ref(), side("scen", 30_000_000, [ind("aendring", "units.elkedel.enabled", "true")]));
        const v = vurder(p);
        expect(v.saetning).not.toMatch(/dyrere|billigere|sparer/);
        expect(v.saetning).toMatch(/samme driftsomkostning/);
        const h = historie(p, v);
        expect(h).toContain("ændrer ikke driftsomkostningen i perioden");
        expect(h).not.toMatch(/0 kr\. (dyrere|billigere)/);
    });
});

describe("K4 F7: 'samme input' afgøres af hele det frosne input (input_hash), ikke af scenarierækkerne", () => {
    const kør = (navn: string, rev: number, hash: string): KoerselInfo => {
        const input = [ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-16\""), ind("scenarie", "_koersel.med_balancering", "false")];
        const k = {
            id: navn, scenarie_id: navn, vaerk_id: "v", vaerk_revision: rev, input_hash: hash, status: "faerdig", bestilt: new Date("2026-10-16T08:00:00Z"),
            model_commit: "b49aeb0af097be42938b80a0fea6acdd77162836", data_commit: "392992c7fe35992e79fba8d1ba7b91967e8d1481",
            oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: 1_000_000,
        } as Koersel;
        return { k, scenarie: { id: navn, navn, med_balancering: false } as Scenarie, vaerkNavn: "Testværk", input };
    };
    it("revision 1 (25 MW) mod revision 2 (35 MW), begge uden ændringer: IKKE samme input, ikke nedprioriteret", () => {
        const { anbefalet } = kandidater(kør("rev2", 2, "b".repeat(64)), [kør("rev2", 2, "b".repeat(64)), kør("rev1", 1, "a".repeat(64))]);
        expect(anbefalet[0].sammeInput).toBe(false);
        expect(anbefalet[0].aendringer.join(" ")).toMatch(/værksrevision r1 \(denne kørsel: r2\)/);
    });
    it("samme hash = samme input (en gentagelse)", () => {
        const { anbefalet } = kandidater(kør("x", 1, "c".repeat(64)), [kør("x", 1, "c".repeat(64)), kør("y", 1, "c".repeat(64))]);
        expect(anbefalet[0].sammeInput).toBe(true);
    });
});
