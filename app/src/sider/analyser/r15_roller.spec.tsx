// Kodegennemgangen af runde 15, fund 5 (P2): "En knaps skabelon kan vende brugerens reference og fortegnet."
// Genskabt her FØR rettelsen med gennemgangens tilfælde: et værk, hvor tanken er slået FRA, en reference uden
// ændringer og et scenarie, der alene slår tanken TIL. `ordnPar` genkendte kun "Hvad er tanken værd?" i retningen
// tændt → slukket og byttede derfor rollerne: kørslen MED ændringen blev reference og den uændrede scenarie. Siden
// sagde samtidig, at den uændrede kørsel "bærer ændringen", bød ingen bytteknap, og ΔRef stod med modsat fortegn af
// parrets valgte reference.
// Reglen efter rettelsen (leads afgørelse): rollerne fastlægges af PARRELATIONEN (scenariets reference under
// Scenarier), ellers af den kørsel, der ENTYDIGT bærer ændringen, ellers af valgets rækkefølge. En knaps skabelon
// genkendes derefter kun i den valgte retning; kan den ikke genkendes, bruger sidens kort stadig det valgte par og fortegn.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { findPar, ordnPar } from "./anbefaling";
import { maanedstabel, profil, samlNoegletal, type Koersel, type Noegletal as NT, type Scenarie } from "./beregn";
import { parRelation, sideRoller, tilSide, type Pakke } from "./data";
import Sammenlign from "./sammenlign";

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
let n = 0;
const nt = (gruppe: string, noegle: string, vaerdi: number): NT => ({ id: `ro-${n++}`, koersel_id: "k", gruppe, noegle, vaerdi } as NT);
const vaerk = (tank: boolean) => [ind("vaerk", "storage.tank.enabled", String(tank)), ind("vaerk", "storage.tank.volume_m3", "5000.0"),
    ind("vaerk", "units.kedel.type", "\"gas_boiler\""), ind("vaerk", "units.kedel.enabled", "true"), ind("vaerk", "prices.natural_gas.value", "606.0")];

function pakke(id: string, navn: string, objektiv: number, egne: InputRække[], opt: { tank?: boolean; reference?: string } = {}): Pakke {
    const input = [...vaerk(opt.tank ?? true), ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-16\""), ind("scenarie", "_koersel.med_balancering", "false"), ...egne];
    const k = {
        id, scenarie_id: `s-${id}`, vaerk_id: opt.tank === false ? "v-fra" : "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date(Date.UTC(2026, 10, 18, 9, n++)), bestilt_af: "a@b.dk",
        model_commit: "939228a000000000000000000000000000000000", data_commit: "106b9fce9a2e3610090b1a542559024056449b88",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv, best_bound: objektiv, input_hash: id.padEnd(64, "0"),
    } as Koersel;
    const scenarie = { id: k.scenarie_id, vaerk_id: k.vaerk_id, navn, med_balancering: false, ...(opt.reference ? { reference_scenarie_id: `s-${opt.reference}` } : {}) } as Scenarie;
    return {
        k, vaerkNavn: "Andeby", vaerkKode: "andeby", scenarie,
        samlet: samlNoegletal([nt("objektiv", "objektiv_dkk", objektiv), nt("el", "omkostning_dkk", 600_000), nt("el", "salg_dkk", 170_000), nt("el", "produktionstarif_dkk", 400)]),
        maaneder: maanedstabel([]), input, profil: profil(k, "Andeby", null, input), objekter: { enheder: [], lagre: [] }, tidsserienavne: new Map(),
    };
}
const TIL = [ind("aendring", "storage.tank.enabled", "true")], FRA = [ind("aendring", "storage.tank.enabled", "false")];
const PAKKER: Record<string, Pakke> = {
    // Gennemgangens tilfælde: værket har tanken slået FRA. Referencen er værket, som det er; scenariet slår tanken til
    // og er 23.515,96 kr. billigere.
    refFra: pakke("refFra", "Tank · reference", 3_464_520.18, [], { tank: false }),
    medTank: pakke("medTank", "Tank · med tank", 3_441_004.22, TIL, { tank: false, reference: "refFra" }),
    medTankUdenPar: pakke("medTankUdenPar", "Tank · med tank (uden par)", 3_441_004.22, TIL, { tank: false }),
    // Parrelationen går forud for, hvem der bærer ændringen: brugerens reference er kørslen UDEN tank, scenariet er værket.
    refUden: pakke("refUden", "Uden tank (reference)", 3_464_520.18, FRA),
    somVaerket: pakke("somVaerket", "Værket som det er", 3_441_004.22, [], { reference: "refUden" }),
    // Tankstørrelse: "ingen tank" er knappens reference, scenariet har tanken med en anden størrelse — begge bærer en ændring.
    ingenTank: pakke("ingenTank", "Tankstørrelse · reference", 3_464_520.18, FRA),
    stor: pakke("stor", "Tankstørrelse · 8000 m³", 3_430_000, [ind("aendring", "storage.tank.volume_m3", "8000.0")], { reference: "ingenTank" }),
    storUdenPar: pakke("storUdenPar", "8000 m³ (uden par)", 3_430_000, [ind("aendring", "storage.tank.volume_m3", "8000.0")]),
    // Det almindelige par (runde 15, mail 2): værket har tanken, scenariet slår den fra.
    ref: pakke("ref", "Tanken · reference", 3_441_004.22, []),
    uden: pakke("uden", "Tanken · uden tank", 3_464_520.18, FRA),
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
const knapper = (c: HTMLElement) => [...c.querySelectorAll("button")].map((b) => b.textContent);
const P = PAKKER;

describe("fund 5: gennemgangens tilfælde — tanken er slået fra i værket, scenariet slår den til", () => {
    it("rollerne er parrets: referencen er den uændrede kørsel, scenariet kørslen med ændringen (før: byttet)", () => {
        const r = sideRoller(P.refFra, P.medTank);
        expect([r.ref.k.id, r.scen.k.id, r.byttet, r.grund]).toEqual(["refFra", "medTank", false, "par"]);     // før: ["medTank", "refFra", true]
        // … også uden en parrelation: scenariet er den kørsel, der ALENE bærer ændringen.
        const u = sideRoller(P.refFra, P.medTankUdenPar);
        expect([u.ref.k.id, u.scen.k.id, u.byttet, u.grund]).toEqual(["refFra", "medTankUdenPar", false, "aendring"]);
    });
    it("hele siden: scenariet MED tank er 23,5 t.kr. billigere end referencen — tal, Δ og fortælling siger det samme", () => {
        const { container } = render(<Sammenlign a="refFra" b="medTank" gåTil={() => {}} />);
        expect(container.textContent).toContain("Tank · med tank mod Tank · reference");                       // før: "Tank · reference mod Tank · med tank"
        expect(tekst(container, "Nøgletal")).toMatch(/23,5 t\.kr\. mindre end referencen/);                    // før: "mere end referencen"
        expect(tekst(container, "Δ driftsomkostning")).toMatch(/koster 23\.516 kr\. mindre end referencen/);
        expect(tekst(container, "Scenariet fortalt")).toMatch(/slår vi lageret tank til/);                     // før: "slår vi tanken fra"
        expect(tekst(container, "Scenariet fortalt")).toMatch(/ca\. 24\.000 kr\. billigere/);                  // før: "dyrere"
        // Siden påstår ikke, at den uændrede kørsel bærer ændringen.
        expect(container.textContent).not.toMatch(/«Tank · reference» bærer ændringen/);
        expect(container.textContent).not.toMatch(/omvendt af den rækkefølge/);
    });
    it("skabelonen genkendes kun i den valgte retning: 'tanken til' er ikke 'Hvad er tanken værd?' vendt om", () => {
        const p = ordnPar(tilSide(P.refFra), tilSide(P.medTank), "ab");
        expect([p.ref.k.id, p.scen.k.id, p.byttet, p.knap]).toEqual(["refFra", "medTank", false, null]);      // før: knap "tankens_vaerdi" med byttede roller
        expect(p.diff.map((d) => [d.sti, d.a, d.b])).toEqual([["storage.tank.enabled", "false", "true"]]);
        // Kontrol: den almindelige retning genkendes stadig.
        expect(ordnPar(tilSide(P.ref), tilSide(P.uden)).knap).toBe("tankens_vaerdi");
    });
    it("anbefalingssidens par: referencen er parrets reference — aldrig kørslen med ændringen", () => {
        const par = findPar([tilSide(P.refFra), tilSide(P.medTank)], (s) => (s === "s-medTank" ? "s-refFra" : null));
        // Før: ét par med ref = medTank og scen = refFra, genkendt som "tankens_vaerdi".
        expect(par.map((p) => [p.ref.k.id, p.scen.k.id, p.knap])).toEqual([["refFra", "medTank", null]]);
    });
});

describe("fund 5: parrelationen går forud for, hvem der bærer ændringen", () => {
    it("parRelation læser scenariets reference — i begge rækkefølger", () => {
        expect(parRelation(P.refFra.scenarie, P.medTank.scenarie)).toBe("ab");
        expect(parRelation(P.medTank.scenarie, P.refFra.scenarie)).toBe("ba");
        expect(parRelation(P.ref.scenarie, P.uden.scenarie)).toBeNull();
    });
    it("brugerens reference bærer ændringen (uden tank), scenariet er værket: rollerne er stadig parrets", () => {
        for (const [a, b, byttet] of [[P.refUden, P.somVaerket, false], [P.somVaerket, P.refUden, true]] as const) {
            const r = sideRoller(a, b);
            expect([r.ref.k.id, r.scen.k.id, r.byttet, r.grund, r.fri]).toEqual(["refUden", "somVaerket", byttet, "par", false]);
        }
    });
    it("åbnet i omvendt rækkefølge: siden siger, at rollerne er parrets — ikke at scenariet 'bærer ændringen'", () => {
        const { container } = render(<Sammenlign a="somVaerket" b="refUden" gåTil={() => {}} />);
        expect(tekst(container, "Nøgletal")).toMatch(/23,5 t\.kr\. mindre end referencen/);
        expect(tekst(container, "Reference og scenarie")).toMatch(/«Værket som det er» er oprettet som scenarie med «Uden tank \(reference\)» som reference/);
        expect(container.textContent).not.toMatch(/«Værket som det er» bærer ændringen/);
        expect(knapper(container)).not.toContain("Byt reference og scenarie");
    });
    it("tankstørrelse med parrelation: knappen genkendes i begge rækkefølger, fordi rollerne er parrets", () => {
        for (const [a, b] of [[P.ingenTank, P.stor], [P.stor, P.ingenTank]] as const) {
            const r = sideRoller(a, b);
            expect([r.ref.k.id, r.scen.k.id, r.grund]).toEqual(["ingenTank", "stor", "par"]);
            expect(ordnPar(tilSide(r.ref), tilSide(r.scen), "ab").knap).toBe("tankstoerrelse");
        }
    });
});

describe("fund 5: uden parrelation og uden en entydigt ændret kørsel gælder valgets rækkefølge", () => {
    it("begge bærer en ændring: rækkefølgen er brugerens, 'Byt' findes, og skabelonen genkendes kun i den retning", () => {
        const ret = sideRoller(P.ingenTank, P.storUdenPar), omvendt = sideRoller(P.storUdenPar, P.ingenTank);
        expect([ret.ref.k.id, ret.byttet, ret.fri, ret.grund]).toEqual(["ingenTank", false, true, "valg"]);
        expect([omvendt.ref.k.id, omvendt.byttet, omvendt.fri, omvendt.grund]).toEqual(["storUdenPar", false, true, "valg"]);   // før: byttet af skabelonen
        expect(ordnPar(tilSide(P.ingenTank), tilSide(P.storUdenPar)).knap).toBe("tankstoerrelse");
        expect(ordnPar(tilSide(P.storUdenPar), tilSide(P.ingenTank)).knap).toBeNull();
        const { container } = render(<Sammenlign a="storUdenPar" b="ingenTank" gåTil={() => {}} />);
        expect(knapper(container)).toContain("Byt reference og scenarie");
        // Sidens kort bruger det valgte par og fortegn: referencen er den valgte (8000 m³), scenariet "ingen tank" er dyrere.
        expect(tekst(container, "Nøgletal")).toMatch(/34,5 t\.kr\. mere end referencen/);
    });
    it("kontrol (runde 15, mail 2): én kørsel bærer ændringen → den er scenariet i begge rækkefølger", () => {
        expect(sideRoller(P.uden, P.ref)).toMatchObject({ byttet: true, fri: false, grund: "aendring" });
        expect(sideRoller(P.ref, P.uden)).toMatchObject({ byttet: false, fri: false, grund: "aendring" });
    });
});
