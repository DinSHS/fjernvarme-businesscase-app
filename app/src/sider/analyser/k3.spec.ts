// Codex K3: N2 (sammenlignelighed på rå værdier), N3 (balancemarkedets værdi kun ved ren balance-difference),
// N8 (nul og lighed i toleranceteksten). Skrevet FØR rettelsen og kørt mod den gamle kode (fejlede), derefter rettet.
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import {
    balancemarkedetsVaerdi, balanceForskel, difference, differenceTekst, profil, samlNoegletal, sammenlignelighed,
    sammenlignelighedStatus, type Koersel, type Noegletal,
} from "./beregn";

let n = 0;
const nt = (gruppe: string, noegle: string, vaerdi: number, marked?: string): Noegletal =>
    ({ id: `k3-${n++}`, koersel_id: "k", gruppe, noegle, vaerdi, marked } as Noegletal);
const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
function kørsel(over: Partial<Koersel> = {}): Koersel {
    return {
        id: "k", bestilling_id: "b", scenarie_id: "s", vaerk_id: "v1", vaerk_revision: 1, input_hash: "x".repeat(64),
        status: "faerdig", bestilt_af: "a@b", bestilt: new Date("2026-10-16T07:00:00Z"), forsoeg: 1, kilde: "app",
        model_commit: "b49aeb0af097be42938b80a0fea6acdd77162836", data_commit: "392992c7fe35992e79fba8d1ba7b91967e8d1481",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal",
        manifest_json: JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-16", oploesning: "1h" } }),
        ...over,
    } as Koersel;
}
const advarsler = (a: Koersel, b: Koersel, ia?: InputRække[], ib?: InputRække[]) =>
    sammenlignelighed(profil(a, "A", null, ia), profil(b, "A", null, ib)).filter((x) => x.alvor !== "note").map((x) => x.navn);

describe("K3 N2: sammenlignelighed afgøres af rå værdier, ikke af formatterede tekster", () => {
    it("relativt gab 0,0002 mod 0,00020001 afviger", () => {
        expect(advarsler(kørsel(), kørsel({ oensket_rel_gap: 0.00020001 }))).toContain("Ønsket relativt gab");
    });
    it("absolut gab 100 mod 100,1 kr. afviger", () => {
        expect(advarsler(kørsel(), kørsel({ oensket_abs_gap: 100.1 }))).toContain("Ønsket absolut gab");
    });
    it("fulde data-SHA'er med samme første syv tegn afviger", () => {
        expect(advarsler(kørsel(), kørsel({ data_commit: "392992c0000000000000000000000000000000ff" }))).toContain("Datagrundlag (df-data)");
    });
    it("start kl. 00 mod kl. 12 samme dato afviger (præcis periode fra det frosne input)", () => {
        const ia = [ind("scenarie", "_koersel.start", "\"2026-01-05T00:00:00Z\""), ind("scenarie", "_koersel.slut", "\"2026-01-16\"")];
        const ib = [ind("scenarie", "_koersel.start", "\"2026-01-05T12:00:00Z\""), ind("scenarie", "_koersel.slut", "\"2026-01-16\"")];
        expect(advarsler(kørsel(), kørsel(), ia, ib)).toContain("Periode");
    });
    it("samme periode skrevet på to måder er ens (ren dato = hele døgnet: start kl. 00, slut = sidste interval kl. 23)", () => {
        const ia = [ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-16\"")];
        const ib = [ind("vaerk", "time.start", "\"2026-01-05T00:00:00Z\""), ind("vaerk", "time.end", "\"2026-01-16T23:00:00+00:00\"")];
        expect(advarsler(kørsel(), kørsel(), ia, ib)).toEqual([]);
    });
    it("ukendte nødvendige metadata giver 'kan ikke afgøres' — også når de mangler på BEGGE sider", () => {
        const a = profil(kørsel({ data_commit: undefined }), "A"), b = profil(kørsel({ data_commit: undefined }), "A");
        const af = sammenlignelighed(a, b);
        expect(af.find((x) => x.navn === "Datagrundlag (df-data)")?.alvor).toBe("ukendt");
        expect(sammenlignelighedStatus(af)).toBe("ukendt");
        expect(sammenlignelighedStatus(sammenlignelighed(profil(kørsel(), "A"), profil(kørsel(), "A")))).toBe("ja");
        expect(sammenlignelighedStatus(sammenlignelighed(profil(kørsel(), "A"), profil(kørsel({ oploesning: "15min" }), "A")))).toBe("nej");
    });
});

describe("K3 N3: balancemarkedets værdi kun når balanceringen er den ENESTE forskel", () => {
    const uden = samlNoegletal([nt("objektiv", "objektiv_dkk", 1000)]);
    const med = samlNoegletal([nt("balancering", "netto_dkk", 500), nt("objektiv", "objektiv_dkk", 3000)]);
    const balIn = (v: boolean) => [ind("vaerk", "prices.natural_gas.value", "606.0"), ind("scenarie", "_koersel.med_balancering", String(v))];
    const pakke = (k: Koersel, samlet: typeof uden, input: InputRække[], navn = "A") => ({ k, samlet, input, profil: profil(k, navn, null, input) });

    it("to forskellige værker: ingen 'balancemarkedets værdi'", () => {
        const a = pakke(kørsel({ objektiv_dkk: 1000 }), uden, balIn(false), "A");
        const b = pakke(kørsel({ vaerk_id: "v2", objektiv_dkk: 3000 }), med, balIn(true), "B");
        expect(balancemarkedetsVaerdi(a, b)).toBeNull();
        expect(balanceForskel(a, b)).toMatchObject({ type: "blandet", med: "b" });
        expect((balanceForskel(a, b) as { grunde: string[] }).grunde).toContain("Værk");
    });
    it("samme værk, men gasprisen ændret samtidig: ingen 'værdi', og ændringen navngives", () => {
        const a = pakke(kørsel({ objektiv_dkk: 3424408 }), uden, balIn(false));
        const ib = [ind("vaerk", "prices.natural_gas.value", "606.0"), ind("aendring", "prices.natural_gas.value", "727.2"), ind("scenarie", "_koersel.med_balancering", "true")];
        const b = pakke(kørsel({ objektiv_dkk: 3000363 }), med, ib);
        expect(balancemarkedetsVaerdi(a, b)).toBeNull();
        expect((balanceForskel(a, b) as { grunde: string[] }).grunde).toEqual(["prices.natural_gas.value"]);
    });
    it("kun balanceringen (og dens metode) afviger: værdien = objektiv(uden) − objektiv(med)", () => {
        const a = pakke(kørsel({ objektiv_dkk: 3424407.96 }), uden, balIn(false));
        const ib = [...balIn(true), ind("scenarie", "_koersel.balancing_method", "\"activation_value\"")];
        const b = pakke(kørsel({ objektiv_dkk: 3000362.97 }), med, ib);
        expect(balancemarkedetsVaerdi(a, b)?.vaerdi).toBeCloseTo(424044.99, 2);
        expect(balanceForskel(a, b)).toMatchObject({ type: "vaerdi", med: "b" });
    });
    it("kan sammenligneligheden ikke afgøres (ukendt metadata), gives heller ingen værdi", () => {
        const a = pakke(kørsel({ objektiv_dkk: 1000, data_commit: undefined }), uden, balIn(false));
        const b = pakke(kørsel({ objektiv_dkk: 900, data_commit: undefined }), med, balIn(true));
        expect(balancemarkedetsVaerdi(a, b)).toBeNull();
    });
});

describe("K3 N8: nul og lighed i toleranceteksten", () => {
    it("identiske objektiver med nul gab: 'det samme', aldrig 'større end tolerancen'", () => {
        const d = difference(kørsel({ objektiv_dkk: 3424407.9575, best_bound: 3424407.9575 }), kørsel({ objektiv_dkk: 3424407.9575, best_bound: 3424407.9575 }))!;
        const t = differenceTekst(d);
        expect(t).toContain("koster det samme");
        expect(t).not.toContain("større");
    });
    it("|Δ| præcis lig en positiv tolerance: siges som lighed (kontraktens strenge < bevares)", () => {
        const d = difference(kørsel({ objektiv_dkk: 100, best_bound: 90 }), kørsel({ objektiv_dkk: 120, best_bound: 110 }))!;
        expect(d.indenForTolerance).toBe(false);
        const t = differenceTekst(d);
        expect(t).toContain("præcis lig med solverens tolerance");
        expect(t).not.toContain("større");
    });
});
