// Runde 15, mail 1 (den uafhængige test 18. november 2026): "Kørsler, der ikke kan sammenlignes, vises som et grønt
// resultat." Genskabt her FØR rettelsen: sammenligningssiden tegnede Δ driftsomkostning i virkningsfarve (grøn =
// billigere) og mærket "Større end tolerancen" (grønt), også når de to kørsler havde hver sin periode, sit værk, sin
// opløsning, df-data, modelversion, sit gab eller sin værksrevision — advarslen stod først i et kort længere nede.
// Kandidatlisten skrev "X kr. billigere end denne" om kørsler under "kan ikke sammenlignes direkte".
// Reglen efter rettelsen: et par, der ikke er direkte sammenligneligt, vises aldrig som et godt eller dårligt resultat.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { findPar, vurder, ordnPar, type Side } from "./anbefaling";
import { maanedstabel, profil, sammenlignelighed, sammenlignelighedStatus, samlNoegletal, type Koersel, type Noegletal as NT, type Scenarie } from "./beregn";
import { tilSide, type Pakke } from "./data";
import { deltaTekst, kandidater, type KoerselInfo } from "./kandidater";
import { DeltaObjektiv, Noegletal, Vandfald } from "./sammenlign";

afterEach(cleanup);

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
let n = 0;
const nt = (gruppe: string, noegle: string, vaerdi: number): NT => ({ id: `r15-${n++}`, koersel_id: "k", gruppe, noegle, vaerdi } as NT);
const M = "90fb16eb1e2d5aa8e619b5a951b93760fa803985", D = "106b9fce9a2e3610090b1a542559024056449b88";
const VAERK = [ind("vaerk", "storage.tank.enabled", "true"), ind("vaerk", "units.kedel.type", "\"gas_boiler\""), ind("vaerk", "units.kedel.enabled", "true")];

/** En færdig kørsel som sammenligningssidens pakke. `over` ændrer kørslen, `periode` det frosne vindue. */
function pakke(id: string, objektiv: number, egne: InputRække[] = [], over: Partial<Koersel> = {}, periode: [string, string] = ["2026-01-05", "2026-01-16"]): Pakke {
    const input = [...VAERK, ind("scenarie", "_koersel.start", JSON.stringify(periode[0])), ind("scenarie", "_koersel.slut", JSON.stringify(periode[1])),
        ind("scenarie", "_koersel.med_balancering", "false"), ...egne];
    const k = {
        id, scenarie_id: `s-${id}`, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date(Date.UTC(2026, 10, 18, 8, n++)),
        model_commit: M, data_commit: D, oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal",
        objektiv_dkk: objektiv, best_bound: objektiv, input_hash: id.padEnd(64, "0"), ...over,
    } as Koersel;
    const vaerkNavn = k.vaerk_id === "v" ? "Andeby" : "Billund";
    return {
        k, vaerkNavn, vaerkKode: "andeby", scenarie: { id: k.scenarie_id, navn: id, med_balancering: false } as Scenarie,
        samlet: samlNoegletal([nt("objektiv", "objektiv_dkk", objektiv), nt("miljoe", "co2_ton", 150), nt("el", "forbrug_mwh", 400),
            nt("el", "omkostning_dkk", 600_000), nt("el", "salg_dkk", 170_000), nt("el", "produktionstarif_dkk", 400)]),
        maaneder: maanedstabel([]), input, profil: profil(k, vaerkNavn, null, input), objekter: { enheder: [], lagre: [] }, tidsserienavne: new Map(),
    };
}
const UDEN_TANK = [ind("aendring", "storage.tank.enabled", "false")];
/** Referencen: Andeby 5.–16. januar 2026, 3.441.004,22 kr. (testrapportens tal). */
const ref = () => pakke("ref", 3_441_004.22);

/** Hver af de syv betingelser i differensmetoden (KONTRAKT §6b + værksrevisionen): scenariet er BILLIGERE, så den gamle kode viste grønt. */
const IKKE_SAMMENLIGNELIGE: [string, () => Pakke][] = [
    ["anden periode", () => pakke("scen", 866_567.72, UDEN_TANK, {}, ["2026-01-05", "2026-01-06"])],
    ["andet værk", () => pakke("scen", 3_000_000, UDEN_TANK, { vaerk_id: "w" })],
    ["anden opløsning", () => pakke("scen", 3_000_000, UDEN_TANK, { oploesning: "15min" })],
    ["andet df-data", () => pakke("scen", 3_000_000, UDEN_TANK, { data_commit: "a859b8b000000000000000000000000000000000" })],
    ["anden modelversion", () => pakke("scen", 3_000_000, UDEN_TANK, { model_commit: "eef950a000000000000000000000000000000000" })],
    ["andet relativt gab", () => pakke("scen", 3_000_000, UDEN_TANK, { oensket_rel_gap: 0.005 })],
    ["andet absolut gab", () => pakke("scen", 3_000_000, UDEN_TANK, { oensket_abs_gap: 5000 })],
    ["anden værksrevision", () => pakke("scen", 3_000_000, UDEN_TANK, { vaerk_revision: 2 })],
];

const godtEllerDaarligt = (c: HTMLElement) => c.querySelectorAll("[data-impact='good'], [data-impact='bad']").length;
const groenneMaerker = (c: HTMLElement) => [...c.querySelectorAll(".fjv-maerke[data-tone='ok']")].map((x) => x.textContent);

describe("mail 1: et par, der ikke er direkte sammenligneligt, er aldrig et godt eller dårligt resultat", () => {
    it.each(IKKE_SAMMENLIGNELIGE)("%s: parret er ikke direkte sammenligneligt", (_navn, scen) => {
        expect(sammenlignelighedStatus(sammenlignelighed(ref().profil, scen().profil))).toBe("nej");
    });

    it.each(IKKE_SAMMENLIGNELIGE)("%s: Δ driftsomkostning har ingen virkningsfarve og intet grønt mærke, og kortet siger hvorfor", (_navn, scen) => {
        const { container } = render(<DeltaObjektiv a={ref()} b={scen()} />);
        expect(godtEllerDaarligt(container)).toBe(0);
        expect(groenneMaerker(container)).toEqual([]);
        expect(container.textContent).toMatch(/kan ikke sammenlignes direkte/i);
        expect(container.textContent).not.toMatch(/koster [\d.]+ kr\. (mindre|mere) end referencen/);
    });

    it.each(IKKE_SAMMENLIGNELIGE)("%s: nøgletalskortene farver ikke ΔRef grøn eller rød", (_navn, scen) => {
        const { container } = render(<Noegletal a={ref()} b={scen()} />);
        expect(godtEllerDaarligt(container)).toBe(0);
        expect(container.textContent).toMatch(/kan ikke sammenlignes direkte/i);
    });

    it("vandfaldet tegner ikke trinene i godt/dårligt, når perioden er en anden", () => {
        const { container } = render(<Vandfald a={ref()} b={IKKE_SAMMENLIGNELIGE[0][1]()} />);
        expect(container.textContent).toMatch(/kan ikke sammenlignes direkte/i);
    });

    it("kontrol: det sammenlignelige par (samme alt, kun tanken slået fra) beholder farve og mærke", () => {
        const { container } = render(<DeltaObjektiv a={ref()} b={pakke("scen", 3_464_520.18, UDEN_TANK)} />);
        expect(container.querySelectorAll("[data-impact='bad']").length).toBeGreaterThan(0);   // dyrere uden tank = rød
        expect(groenneMaerker(container)).toEqual(["Større end tolerancen"]);
        expect(container.textContent).not.toMatch(/kan ikke sammenlignes direkte/i);
    });

    it("et nødvendigt felt ukendt (df-data mangler på den ene): heller ikke et resultat", () => {
        const scen = pakke("scen", 3_000_000, UDEN_TANK, { data_commit: null as unknown as string });
        expect(sammenlignelighedStatus(sammenlignelighed(ref().profil, scen.profil))).toBe("ukendt");
        const { container } = render(<DeltaObjektiv a={ref()} b={scen} />);
        expect(godtEllerDaarligt(container)).toBe(0);
        expect(groenneMaerker(container)).toEqual([]);
        expect(container.textContent).toMatch(/kan ikke afgøres/i);
    });
});

describe("mail 1: anbefalinger og kørselslisten danner ikke par på tværs af værksrevisioner", () => {
    const side = (p: Pakke): Side => tilSide(p);
    it("reference ved revision 1 og scenarie ved revision 2 er ikke et par (før: 'Anbefalet'/'Frarådes' med farve)", () => {
        expect(findPar([side(ref()), side(pakke("scen", 3_464_520.18, UDEN_TANK, { vaerk_revision: 2 }))])).toEqual([]);
    });
    it("vurderingen af et sådant par, valgt i hånden, er 'Kan ikke afgøres' og nævner revisionen", () => {
        const v = vurder(ordnPar(side(ref()), side(pakke("scen", 3_464_520.18, UDEN_TANK, { vaerk_revision: 2 }))));
        expect(v.kategori).toBe("kan_ikke_afgoeres");
        expect(v.begrundelse).toMatch(/værkets revision/);
    });
});

describe("mail 1: kandidatlisten skriver ikke 'billigere/dyrere' om en kørsel, der ikke kan sammenlignes", () => {
    const info = (p: Pakke): KoerselInfo => ({ k: p.k, scenarie: p.scenarie, vaerkNavn: p.vaerkNavn, input: p.input.filter((r) => r.kilde !== "vaerk") });
    it("anden periode: ingen differens (før: '2.574.437 kr. billigere end denne')", () => {
        const { anbefalet, andre } = kandidater(info(ref()), [info(IKKE_SAMMENLIGNELIGE[0][1]())]);
        expect(anbefalet).toEqual([]);
        expect(andre[0].delta).toBeNull();
        expect(deltaTekst(andre[0].delta)).not.toMatch(/billigere|dyrere/);
    });
    it("anden værksrevision: står under 'kan ikke sammenlignes direkte' med grunden, ikke som 'Sammenlignelig'", () => {
        const { anbefalet, andre } = kandidater(info(ref()), [info(pakke("scen", 3_464_520.18, UDEN_TANK, { vaerk_revision: 2 }))]);
        expect(anbefalet).toEqual([]);
        expect(andre[0].afviger.join(" ")).toMatch(/værksrevision/);
        expect(andre[0].delta).toBeNull();
    });
    it("kontrol: en fejlet kørsel har ingen differens og kan ikke vælges (uændret)", () => {
        const fejlet = pakke("fejl", 0, UDEN_TANK, { status: "fejl", objektiv_dkk: undefined, best_bound: undefined } as Partial<Koersel>);
        const { andre } = kandidater(info(ref()), [info(fejlet)]);
        expect([andre[0].faerdig, andre[0].delta]).toEqual([false, null]);
    });
});
