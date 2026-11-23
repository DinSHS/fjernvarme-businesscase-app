// Runde 15, fund 3.1 (den uafhængige test 18. november 2026): "Korte perioder skaleres lineært til et år i
// anbefalingen." Genskabt FØR rettelsen med testrapportens to tal:
//  * Andeby 5.–16. januar 2026 (12 døgn), tankværdi 23.515,96 kr. → "(skaleret til et år ca. 715.000 kr.)"
//    = 23.515,96 × 365 / 12 (anbefaling.ts:354 ved 251aa93);
//  * Billund Spor B 2.3.–30.6.2026 (121 døgn), tankværdi ca. 2,18 mio. kr. → ca. 6,6 mio. kr. om året.
// En januar- eller forårsværdi kan ikke ganges op: tanken er mest værd, når elprisen svinger, og varmebehov og
// prisbillede er helt anderledes resten af året. Reglen efter rettelsen: appen viser kun et årstal, når perioden SELV
// er mindst 365 døgn — og så er det periodens tal, ikke et skøn.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { historie, ordnPar, vurder, type Side } from "./anbefaling";
import { AnbefalingKort } from "./anbefaling-kort";
import { profil, samlNoegletal, type Koersel, type Noegletal } from "./beregn";

afterEach(cleanup);

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
let n = 0;
const nt = (gruppe: string, noegle: string, vaerdi: number): Noegletal => ({ id: `aar-${n++}`, koersel_id: "k", gruppe, noegle, vaerdi } as Noegletal);
const VAERK = [ind("vaerk", "meta.titel", "\"Testværk\""), ind("vaerk", "storage.tank.enabled", "true"), ind("vaerk", "units.kedel.type", "\"gas_boiler\""), ind("vaerk", "units.kedel.enabled", "true")];

function side(navn: string, objektiv: number, periode: [string, string], egne: InputRække[] = []): Side {
    const input = [...VAERK, ind("scenarie", "_koersel.start", JSON.stringify(periode[0])), ind("scenarie", "_koersel.slut", JSON.stringify(periode[1])), ind("scenarie", "_koersel.med_balancering", "false"), ...egne];
    const k = {
        id: navn, scenarie_id: navn, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date(Date.UTC(2026, 10, 18, 8, n++)),
        model_commit: "90fb16eb1e2d5aa8e619b5a951b93760fa803985", data_commit: "106b9fce9a2e3610090b1a542559024056449b88",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv, best_bound: objektiv,
    } as Koersel;
    return { k, navn, vaerkNavn: "Testværk", input, samlet: samlNoegletal([nt("objektiv", "objektiv_dkk", objektiv)]), profil: profil(k, "Testværk", null, input) };
}
const UDEN_TANK = [ind("aendring", "storage.tank.enabled", "false")];
function tankpar(periode: [string, string], ref: number, uden: number) {
    const p = ordnPar(side("ref", ref, periode), side("uden", uden, periode, UDEN_TANK));
    const v = vurder(p);
    return { p, v, h: historie(p, v) };
}

const TOLV: [string, string] = ["2026-01-05", "2026-01-16"];
const SPOR_B: [string, string] = ["2026-03-02", "2026-06-30"];
const HELAAR: [string, string] = ["2025-07-01", "2026-06-30"];

describe("3.1: en kort periode skaleres ikke til et år", () => {
    it("Andeby 12 døgn (tankværdi 23.515,96 kr.): intet årstal — før '(skaleret til et år ca. 715.000 kr.)'", () => {
        const { p, v, h } = tankpar(TOLV, 3_441_004.22, 3_464_520.18);
        expect(p.knap).toBe("tankens_vaerdi");
        expect(v.doegn).toBe(12);
        for (const tekst of [v.saetning, v.begrundelse, h]) {
            expect(tekst).not.toMatch(/skaleret|715\.000/i);
        }
        expect(v.saetning).toBe("Tanken sparer ca. 24.000 kr. i perioden — behold den.");
        expect(v.aarligt).toBeNull();
    });

    it("Billund Spor B 121 døgn (ca. 2,18 mio. kr.): intet 6,6 mio. kr. om året ud fra en forårsperiode", () => {
        const { v, h } = tankpar(SPOR_B, 4_428_863.74, 6_607_703);
        expect(v.doegn).toBe(121);
        expect(`${v.saetning} ${h}`).not.toMatch(/skaleret|6,6 mio/i);
        expect(v.aarligt).toBeNull();
    });

    it("anbefalingskortet for 12 døgn viser intet skaleret beløb og siger, at perioden ikke er et år", () => {
        const { v } = tankpar(TOLV, 3_441_004.22, 3_464_520.18);
        const t = render(<AnbefalingKort v={v} vaerkKode="andeby" kopiTekst="" />).container.textContent!;
        expect(t).not.toMatch(/Skaleret til et år|715\.000/);
        expect(t).toMatch(/Beløbet gælder de 12 døgn/);
        expect(t).toMatch(/skalerer det ikke til et år/);
    });

    it("et helår (365 døgn): periodens tal ER årets — vist som det, uden omregning", () => {
        const { v } = tankpar(HELAAR, 30_000_000, 30_715_000);
        expect(v.doegn).toBe(365);
        expect(v.aarligt).toBe(715_000);
        expect(v.saetning).toBe("Tanken sparer 715.000 kr. i perioden (et helt år) — behold den.");
        const t = render(<AnbefalingKort v={v} vaerkKode="andeby" kopiTekst="" />).container.textContent!;
        expect(t).toMatch(/Perioden er et helt år \(365 døgn\)/);
        expect(t).not.toMatch(/skaleret/i);
    });

    it("364 døgn er ikke et år: intet årstal", () => {
        const { v } = tankpar(["2025-07-01", "2026-06-29"], 30_000_000, 30_715_000);
        expect(v.doegn).toBe(364);
        expect(v.aarligt).toBeNull();
        expect(v.saetning).not.toMatch(/helt år|skaleret/);
    });
});
