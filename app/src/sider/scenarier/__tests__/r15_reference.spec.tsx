// Runde 15, mail 1 (den uafhængige test 18. november 2026) på Scenarier-siderne. Genskabt FØR rettelsen:
//  * scenariets kørselskort viste ΔRef og ΔRef% i virkningsfarve (grøn = billigere) mod en reference med en ANDEN
//    periode, og sætningen "Scenariet koster X kr. mindre end referencen"; forbeholdet stod med småt nedenunder;
//  * oversigten viste et ΔRef-tal for et par, hvis reference ikke var sammenlignelig, og for et scenarie, hvis
//    SENESTE kørsel var fejlet (tallet kom fra en ældre kørsel, mens rækken sagde "Fejl");
//  * en anden værksrevision talte ikke som en afvigelse.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Koersel } from "../../../../rayfin/data/Koersel";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import { KoerselDetaljer } from "../KoerselKort";
import { modReference } from "../koersel-logik";
import { sammenlignelighed } from "../logik";
import { findReference } from "../oversigt-logik";
import { ReferenceCelle } from "../Oversigt";

vi.mock("@/lib/data/skriv", () => ({ annullerKoersel: async () => ({ besked: "" }) }));
afterEach(cleanup);

const TOLV = JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-16" } });
const TO = JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-06" } });
const ref = { id: "s1", vaerk_id: "v1", navn: "Hvad er tanken værd? · reference", arkiveret: false, oprettet: new Date(Date.UTC(2026, 10, 18, 8)), med_balancering: false } as Scenarie;
const scen = { ...ref, id: "s2", navn: "Hvad er tanken værd? · scenarie", reference_scenarie_id: "s1", oprettet: new Date(Date.UTC(2026, 10, 18, 9)) } as Scenarie;
let n = 0;
function koersel(s: Scenarie, objektiv_dkk: number | undefined, manifest_json: string, over: Partial<Koersel> = {}): Koersel {
    n++;
    return {
        id: `k${n}`, scenarie_id: s.id, vaerk_id: s.vaerk_id, vaerk_revision: 1, status: "faerdig", objektiv_dkk, best_bound: objektiv_dkk, solve_status: "optimal",
        oploesning: "1h", data_commit: "106b9fc", model_commit: "90fb16e", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, manifest_json,
        bestilt: new Date(Date.UTC(2026, 10, 18, 10, n)), afsluttet: new Date(Date.UTC(2026, 10, 18, 11, n)), bestilt_af: "a@example.org", ...over,
    } as Koersel;
}

describe("mail 1: differensen mod en reference, der ikke kan sammenlignes, findes ikke", () => {
    it("anden periode: ingen differens, og grunden er navngivet", () => {
        const m = modReference(koersel(ref, 3_441_004.22, TOLV), koersel(scen, 867_219.55, TO));
        expect(m.diff).toBeNull();
        expect(m.afviger).toEqual(["periode"]);
    });
    it("anden værksrevision er en afvigelse (før: ikke nævnt)", () => {
        expect(sammenlignelighed(koersel(ref, 1, TOLV), koersel(scen, 2, TOLV, { vaerk_revision: 2 }))).toEqual(["værksrevision"]);
    });
    it("kontrol: samme periode, samme alt → differensen findes", () => {
        const m = modReference(koersel(ref, 3_441_004.22, TOLV), koersel(scen, 3_464_520.18, TOLV));
        expect(m.afviger).toEqual([]);
        expect(m.diff?.delta).toBeCloseTo(23_515.96, 2);
    });
    it("en fejlet kørsel eller en fejlet reference giver ingen differens", () => {
        expect(modReference(koersel(ref, 3_441_004.22, TOLV), koersel(scen, undefined, TOLV, { status: "fejl" })).diff).toBeNull();
        expect(modReference(koersel(ref, undefined, TOLV, { status: "fejl" }), koersel(scen, 3_464_520.18, TOLV)).diff).toBeNull();
    });
});

describe("mail 1: kørselskortet på scenariets side", () => {
    it("reference med en anden periode: intet ΔRef i farve, ingen 'koster … mindre', men en tydelig besked", () => {
        const { container } = render(<KoerselDetaljer k={koersel(scen, 867_219.55, TO)} reference={koersel(ref, 3_441_004.22, TOLV)} />);
        expect(container.querySelectorAll("[data-impact='good'], [data-impact='bad']")).toHaveLength(0);
        expect(container.textContent).not.toMatch(/mindre end referencen|mere end referencen/);
        expect(container.querySelector("[role='alert'], .fjv-maerke[data-tone='advarsel']")?.textContent ?? "").toMatch(/sammenlign/i);
        expect(container.textContent).toMatch(/periode afviger/);
    });
    it("kontrol: sammenlignelig reference → ΔRef i virkningsfarve (dyrere uden tank = rød)", () => {
        const { container } = render(<KoerselDetaljer k={koersel(scen, 3_464_520.18, TOLV)} reference={koersel(ref, 3_441_004.22, TOLV)} />);
        expect(container.querySelectorAll("[data-impact='bad']").length).toBeGreaterThan(0);
        expect(container.textContent).toMatch(/mere end referencen/);
    });
});

describe("mail 1: oversigtens ΔRef", () => {
    it("parrets reference har en anden periode: intet ΔRef (før: −2.573,8 t.kr.)", () => {
        const r = findReference(scen, [ref, scen], [koersel(scen, 867_219.55, TO), koersel(ref, 3_441_004.22, TOLV)]);
        expect(r).toEqual({ art: "par", navn: ref.navn, direkte: false, afviger: ["periode"] });
    });
    it("seneste kørsel fejlede, en ældre er færdig: intet ΔRef og intet grønt mærke — rækken handler om den seneste", () => {
        const gammel = koersel(scen, 3_464_520.18, TOLV), r0 = koersel(ref, 3_441_004.22, TOLV), fejlet = koersel(scen, undefined, TOLV, { status: "fejl", afsluttet: undefined });
        const r = findReference(scen, [ref, scen], [fejlet, r0, gammel]);
        expect(r).toEqual({ art: "seneste_ikke_faerdig", navn: ref.navn, status: "fejl" });
        const { container } = render(<ReferenceCelle r={r} />);
        expect(container.querySelector(".fjv-maerke[data-tone='ok']")).toBeNull();
        expect(container.textContent).toMatch(/seneste kørsel/i);
    });
    it("kontrol: sammenligneligt par → ΔRef = scenarie − reference", () => {
        const r = findReference(scen, [ref, scen], [koersel(scen, 3_464_520.18, TOLV), koersel(ref, 3_441_004.22, TOLV)]);
        expect(r?.art).toBe("par");
        expect(r && "delta" in r ? r.delta : undefined).toBeCloseTo(23_515.96, 2);
    });
});
