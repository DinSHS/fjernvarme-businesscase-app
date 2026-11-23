// Runde 15, fund 3.3 (den uafhængige test 18. november 2026): kørselslisten kaldte 12-døgnsparret "Gentagelse af
// samme scenarie" og lagde det under 2-døgnsreferencen ("4 kørsler: 1 scenarier med en reference, 1 referencer,
// 2 gentagelser"). På en anden maskine, hvor 2-døgnsparret var kørt først, blev det omvendt: mærket fulgte
// rækkefølgen. Reglen var "samme værk og navn" — og parflowet giver alle par af samme spørgsmål samme navne
// ("Hvad er tanken værd? · reference"). Genskabt her FØR rettelsen med de fire kørsler i begge rækkefølger.
// Efter rettelsen: en gentagelse kræver også samme periode, og perioden står ved navnet.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import type { Side } from "./anbefaling";
import { profil, samlNoegletal, type Koersel, type Noegletal, type Scenarie } from "./beregn";
import { KoerselTabel } from "./liste-tabel";
import { grupper, listeRaekker, type ListeGrundlag } from "./sammensaetning";

afterEach(cleanup);

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
const VAERK = [ind("vaerk", "storage.tank.enabled", "true"), ind("vaerk", "units.kedel.type", "\"gas_boiler\""), ind("vaerk", "units.kedel.enabled", "true")];
const REF = "Hvad er tanken værd? · reference", SCEN = "Hvad er tanken værd? · scenarie";
const TO: [string, string] = ["2026-01-05", "2026-01-06"], TOLV: [string, string] = ["2026-01-05", "2026-01-16"];
const scenarier = new Map<string, Scenarie>();

/** `minut` = bestillingstidspunktet (rækkefølgen, parrene blev kørt i). */
function side(id: string, navn: string, objektiv: number, periode: [string, string], minut: number, uden = false, refId?: string, over: Partial<Koersel> = {}): Side {
    const input = [...VAERK, ind("scenarie", "_koersel.start", JSON.stringify(periode[0])), ind("scenarie", "_koersel.slut", JSON.stringify(periode[1])),
        ind("scenarie", "_koersel.med_balancering", "false"), ...(uden ? [ind("aendring", "storage.tank.enabled", "false")] : [])];
    const sid = over.scenarie_id ?? `s-${id}`;
    const k = {
        id, scenarie_id: sid, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", kilde: "app", bestilt: new Date(Date.UTC(2026, 10, 18, 9, minut)), bestilt_af: "a@example.org",
        model_commit: "90fb16eb1e2d5aa8e619b5a951b93760fa803985", data_commit: "106b9fce9a2e3610090b1a542559024056449b88",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv, best_bound: objektiv, ...over,
    } as Koersel;
    scenarier.set(sid, { id: sid, navn, vaerk_id: "v", arkiveret: false, med_balancering: false, reference_scenarie_id: refId ?? null } as Scenarie);
    return { k, navn, vaerkNavn: "Andeby", input, profil: profil(k, "Andeby", null, input),
        samlet: samlNoegletal([{ id: `n-${id}`, koersel_id: id, gruppe: "objektiv", noegle: "objektiv_dkk", vaerdi: objektiv } as Noegletal]) };
}
/** Testrapportens fire kørsler; `først` = hvilket par der blev kørt først. */
function fire(først: "2" | "12"): Side[] {
    const [a, b] = først === "2" ? [0, 10] : [10, 0];
    return [
        side("ref2", REF, 866_567.72, TO, a + 1), side("scen2", SCEN, 867_219.55, TO, a + 2, true, "s-ref2"),
        side("ref12", REF, 3_441_004.22, TOLV, b + 1), side("scen12", SCEN, 3_464_520.18, TOLV, b + 2, true, "s-ref12"),
    ];
}
const grundlag = (sider: Side[]): ListeGrundlag => ({ sider, scenarier, koder: new Map([["v", "andeby"]]), bekraeft: new Map() });
const roller = (sider: Side[]) => Object.fromEntries(listeRaekker(grundlag(sider)).map((r) => [r.k.id, r.rolle.type]));

describe("3.3: en gentagelse kræver samme periode — og mærket afhænger ikke af rækkefølgen", () => {
    const FORVENTET = { ref2: "reference", scen2: "scenarie", ref12: "reference", scen12: "scenarie" };

    it("2-døgnsparret kørt først: to selvstændige par, ingen gentagelser (før: 12-døgnsparret var 'gentagelse')", () => {
        expect(roller(fire("2"))).toEqual(FORVENTET);
    });
    it("12-døgnsparret kørt først (rækkefølgen på den anden maskine): samme roller", () => {
        expect(roller(fire("12"))).toEqual(FORVENTET);
    });
    it("rækkernes orden i datasættet ændrer intet", () => {
        expect(roller([...fire("2")].reverse())).toEqual(FORVENTET);
        expect(roller([...fire("12")].reverse())).toEqual(FORVENTET);
    });
    it("hvert par er sin egen gruppe med sin egen periode", () => {
        const gs = grupper(listeRaekker(grundlag(fire("2")))).filter((g) => g.type === "par");
        expect(gs.map((g) => g.raekker.map((r) => r.k.id))).toEqual(expect.arrayContaining([["ref2", "scen2"], ["ref12", "scen12"]]));
        expect(gs).toHaveLength(2);
        expect(gs.map((g) => g.undertitel).sort()).toEqual([expect.stringContaining("12 døgn"), expect.stringContaining("2 døgn")].sort());
    });
    it("kontrol: samme scenarie kørt to gange i SAMME periode er stadig en gentagelse", () => {
        const sider = [...fire("2"), side("ref12igen", REF, 3_441_004.22, TOLV, 30, false, undefined, { scenarie_id: "s-ref12" })];
        const r = listeRaekker(grundlag(sider));
        const typer = Object.fromEntries(r.map((x) => [x.k.id, x.rolle.type]));
        expect([typer.ref12, typer.ref12igen].sort()).toEqual(["gentagelse", "reference"]);
        expect(typer.ref2).toBe("reference");
        expect(r.find((x) => x.rolle.type === "gentagelse")!.rolle.tekst).toMatch(/samme scenarie og periode/);
    });
});

describe("3.3: perioden står ved navnet", () => {
    it("to rækker med samme navn kan skelnes på perioden i navnecellen", () => {
        const rk = listeRaekker(grundlag(fire("2")));
        const { container } = render(<KoerselTabel grupper={grupper(rk)} raekker={[]} flere={false} sortering={null} onSorter={() => {}} valgte={[]} onVaelg={() => {}} onAabn={() => {}} levende={new Map()} />);
        const navne = [...container.querySelectorAll("td[data-kolonne='spoergsmaal']")].map((td) => td.textContent ?? "");
        expect(navne.filter((t) => t.includes(REF))).toHaveLength(2);
        expect(navne.filter((t) => t.includes(REF)).map((t) => /5\. jan\.–6\. jan\. 2026/.test(t) || /5\. jan\.–16\. jan\. 2026/.test(t))).toEqual([true, true]);
        expect(new Set(navne.filter((t) => t.includes(REF))).size).toBe(2);
    });
});
