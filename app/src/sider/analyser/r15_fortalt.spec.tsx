// Runde 15, mail 2 (den uafhængige test 18. november 2026): "'Scenariet fortalt' kan fortælle fra den anden kørsel
// end nøgletallene." Genskabt her FØR rettelsen: åbnes sammenligningen med den kørsel, der bærer ændringen, som
// reference (#/analyser/sammenlign/<uden tank>/<reference> — det sker fra kandidatlisten på referencens side, hvor
// "den valgte kørsel bliver referencen"), bytter anbefalingen rollerne og fortæller kørslen uden tank som scenariet
// ("gør driften ca. 24.000 kr. dyrere"), mens nøgletal, Δ driftsomkostning og vandfald læste rutens rækkefølge og
// viste den ANDEN kørsel som scenariet ("23,5 t.kr. mindre end referencen", grønt). Samme side, modsat fortegn.
// Reglen efter rettelsen: siden har ÉT sæt roller — scenariet er den kørsel, der bærer ændringen — og siger hvilke.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { maanedstabel, profil, samlNoegletal, type Koersel, type Noegletal as NT, type Scenarie } from "./beregn";
import { sideRoller, type Pakke } from "./data";
import Sammenlign from "./sammenlign";

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
let n = 0;
const nt = (gruppe: string, noegle: string, vaerdi: number): NT => ({ id: `f-${n++}`, koersel_id: "k", gruppe, noegle, vaerdi } as NT);
const VAERK = [ind("vaerk", "storage.tank.enabled", "true"), ind("vaerk", "units.kedel.type", "\"gas_boiler\""), ind("vaerk", "units.kedel.enabled", "true"),
    ind("vaerk", "prices.natural_gas.value", "606.0")];

function pakke(id: string, navn: string, objektiv: number, egne: InputRække[], minut: number): Pakke {
    const input = [...VAERK, ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-16\""), ind("scenarie", "_koersel.med_balancering", "false"), ...egne];
    const k = {
        id, scenarie_id: `s-${id}`, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date(Date.UTC(2026, 10, 18, 9, minut)), bestilt_af: "a@example.org",
        model_commit: "90fb16eb1e2d5aa8e619b5a951b93760fa803985", data_commit: "106b9fce9a2e3610090b1a542559024056449b88",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv, best_bound: objektiv, input_hash: id.padEnd(64, "0"),
    } as Koersel;
    return {
        k, vaerkNavn: "Andeby", vaerkKode: "andeby", scenarie: { id: k.scenarie_id, navn, med_balancering: false } as Scenarie,
        samlet: samlNoegletal([nt("objektiv", "objektiv_dkk", objektiv), nt("el", "omkostning_dkk", 600_000), nt("el", "salg_dkk", 170_000), nt("el", "produktionstarif_dkk", 400)]),
        maaneder: maanedstabel([]), input, profil: profil(k, "Andeby", null, input), objekter: { enheder: [], lagre: [] }, tidsserienavne: new Map(),
    };
}
// Testrapportens 12-døgnspar: reference 3.441.004,22 kr., uden tanke 3.464.520,18 kr. (tankværdi 23.515,96 kr.).
const PAKKER: Record<string, Pakke> = {
    ref: pakke("ref", "Tanken · reference", 3_441_004.22, [], 1),
    uden: pakke("uden", "Tanken · uden tank", 3_464_520.18, [ind("aendring", "storage.tank.enabled", "false")], 2),
    gas700: pakke("gas700", "Gaspris 700", 3_600_000, [ind("aendring", "prices.natural_gas.value", "700.0")], 3),
    gas800: pakke("gas800", "Gaspris 800", 3_700_000, [ind("aendring", "prices.natural_gas.value", "800.0")], 4),
};

const hentet = <T,>(data: T) => ({ data, fejl: undefined, indlæser: false, genindlæs: () => {} });
vi.mock("@/lib/data/hooks", () => ({ useVaerkParametre: () => hentet([]) }));
vi.mock("./dispatch-kort", () => ({ default: () => null }));
vi.mock("./data", async (original) => ({
    ...(await original<typeof import("./data")>()),
    usePakke: (id: string) => ({ ...hentet(PAKKER[id] ?? null), koersel: PAKKER[id]?.k ?? null }),
}));

afterEach(cleanup);

const kort = (c: HTMLElement, titel: string) => [...c.querySelectorAll("article.fjv-kort")].find((k) => k.querySelector(".fjv-kort-titel")?.textContent?.startsWith(titel));
const tekst = (c: HTMLElement, titel: string) => kort(c, titel)?.textContent ?? `(kortet "${titel}" findes ikke)`;

describe("mail 2: 'Scenariet fortalt' og nøgletallene læser samme kørsel i samme rolle", () => {
    it("kørslen, der bærer ændringen, valgt som reference: tekst og tal er enige om, hvem der er scenariet", () => {
        const { container } = render(<Sammenlign a="uden" b="ref" gåTil={() => {}} />);
        // Historien fortæller kørslen uden tank som scenariet: uden tank er driften dyrere.
        expect(tekst(container, "Scenariet fortalt")).toMatch(/slår vi tanken fra/);
        expect(tekst(container, "Scenariet fortalt")).toMatch(/ca\. 24\.000 kr\. dyrere/);
        // Nøgletallene siger det samme — før: "23,5 t.kr. mindre end referencen" og −23,5 i grønt.
        expect(tekst(container, "Nøgletal")).toMatch(/23,5 t\.kr\. mere end referencen/);
        expect(tekst(container, "Δ driftsomkostning")).toContain("+23,5");
        expect(tekst(container, "Δ driftsomkostning")).toMatch(/koster 23\.516 kr\. mere end referencen/);
        expect(kort(container, "Nøgletal")!.querySelectorAll("[data-impact='good']")).toHaveLength(0);
    });

    it("siden siger, hvilken kørsel der er scenariet, og at rollerne er byttet i forhold til valget", () => {
        const { container } = render(<Sammenlign a="uden" b="ref" gåTil={() => {}} />);
        expect(container.querySelector("h1, .fjv-side-titel")?.textContent ?? container.textContent).toContain("Tanken · uden tank mod Tanken · reference");
        expect(container.textContent).toMatch(/«Tanken · uden tank» bærer ændringen i forhold til værket og vises derfor som scenariet/);
        const fortalt = tekst(container, "Scenariet fortalt");
        expect(fortalt).toMatch(/Scenarie: «Tanken · uden tank»/);
        expect(fortalt).toMatch(/Reference: «Tanken · reference»/);
        expect(fortalt).toMatch(/samme to kørsler som nøgletallene/);
        // Knappen "Byt reference og scenarie" ville ikke ændre noget, når rollerne følger ændringen: den vises ikke.
        expect([...container.querySelectorAll("button")].map((b) => b.textContent)).not.toContain("Byt reference og scenarie");
    });

    it("kontrol: i den naturlige rækkefølge er intet byttet, og tallene er de samme", () => {
        const { container } = render(<Sammenlign a="ref" b="uden" gåTil={() => {}} />);
        expect(tekst(container, "Nøgletal")).toMatch(/23,5 t\.kr\. mere end referencen/);
        expect(tekst(container, "Scenariet fortalt")).toMatch(/ca\. 24\.000 kr\. dyrere/);
        expect(container.textContent).not.toMatch(/vises derfor som scenariet/);
    });

    it("to kørsler, der begge bærer en ændring (to gaspriser): rækkefølgen er brugerens, og 'Byt' findes", () => {
        expect(sideRoller(PAKKER.gas700, PAKKER.gas800)).toMatchObject({ byttet: false, fri: true });
        expect(sideRoller(PAKKER.gas800, PAKKER.gas700)).toMatchObject({ byttet: false, fri: true });
        const { container } = render(<Sammenlign a="gas800" b="gas700" gåTil={() => {}} />);
        expect([...container.querySelectorAll("button")].map((b) => b.textContent)).toContain("Byt reference og scenarie");
        expect(tekst(container, "Nøgletal")).toMatch(/100,0 t\.kr\. mindre end referencen/);
    });

    it("sideRoller: scenariet er den kørsel, der bærer ændringen — uanset rækkefølgen", () => {
        expect(sideRoller(PAKKER.uden, PAKKER.ref)).toMatchObject({ byttet: true, fri: false });
        expect(sideRoller(PAKKER.uden, PAKKER.ref).scen.k.id).toBe("uden");
        expect(sideRoller(PAKKER.ref, PAKKER.uden)).toMatchObject({ byttet: false, fri: false });
        expect(sideRoller(PAKKER.ref, PAKKER.uden).scen.k.id).toBe("uden");
    });
});
