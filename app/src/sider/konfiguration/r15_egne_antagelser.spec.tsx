// Kodegennemgangen af runde 15, fund 9 (P3): "Trofasthedsteksterne efterlader to nye valg uklare."
//  (a) Lagerkortene sagde stadig, at fordelingen mellem flere lagre "følger casefilens skrivemåde". Det var
//      testrapportens formodning; doc/TROFASTHED.md §4b dokumenterer, at årsagen er UKENDT, og at eftermålingen
//      23. november 2026 gav byte-ens timefiler.
//  (b) *Tilføj enhed* og guiden *Nyt værk* opretter en oliekedel med 15 MW, virkningsgrad 0,95, D&V 30 kr./MWh og
//      startomkostning 500 kr. — appens egne forslag (gaskedlens pladsholdere). Det stod hverken i §5 eller i
//      formularen; kun CO₂-faktoren 0,266 t/MWh er modelrepoets (værksarkets konvertering).
// Genskabt FØR rettelsen: teksten indeholdt "casefilens skrivemåde", formularen nævnte ikke "egen antagelse", og §5
// havde ingen række med oliekedlens tal.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODELSPEJL } from "@/lib/modelspejl.data";
import { FLERE_LAGRE_FORBEHOLD } from "../analyser/tekster";
import type { Blad } from "./gruppering";
import { CO2_FAKTOR_FRA_MODELREPOET, ENHEDSTYPER, skabelonKilde } from "./katalog";
import { NyEnhed } from "./NyEnhed";
import { trinFod } from "./nyt-vaerk-tekster";
import { NYT_VAERK_SKABELON } from "./nyt-vaerk.data";
import type { RedigeringsTilstand } from "./useRedigering";
import { validerVaerk } from "./validering";

afterEach(cleanup);
// En fil i repoets rod. (Ikke en dynamisk `new URL(…, import.meta.url)`: Vite læser den som et glob over hele mappen.)
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const rod = (sti: string) => readFileSync(resolve(REPO, sti), "utf8");

describe("fund 9 (a): lagerkortene siger det målte — årsagen til fordelingen er ikke fundet", () => {
    it("forbeholdet påstår ikke længere, at fordelingen følger casefilens skrivemåde", () => {
        expect(FLERE_LAGRE_FORBEHOLD).not.toMatch(/casefilens skrivemåde/);           // før: stod der
        expect(FLERE_LAGRE_FORBEHOLD).toMatch(/ikke fundet/);
        expect(FLERE_LAGRE_FORBEHOLD).toMatch(/ikke entydig/);
        expect(FLERE_LAGRE_FORBEHOLD).toMatch(/summen over lagrene/);
    });
    it("§4b i doc/TROFASTHED.md siger det samme (årsagen er ikke fundet; eftermålingen var byte-ens)", () => {
        const doc = rod("doc/TROFASTHED.md");
        expect(doc).toMatch(/\*Hvad\* i inputfilen der flytter fordelingen, er ikke fundet/);
        expect(doc).toMatch(/\*\*byte-ens\*\* timefiler mod `cases\/andeby\.yaml`/);
    });
});

describe("fund 9 (b): skabelonens tal er mærket som appens egne antagelser — i formularen og i §5", () => {
    const olie = new Map(ENHEDSTYPER.oil_boiler.skabelon.map((s) => [s.sti, s.vaerdi_json]));

    it("oliekedlens skabelon: 15 MW, 0,95, D&V 30 og start 500 er appens; kun CO₂-faktoren 0,266 er modelrepoets", () => {
        expect([olie.get("p_max_heat"), olie.get("eta_fuel_to_heat"), olie.get("var_om"), olie.get("start_cost"), olie.get("co2_emissions_per_mwh_fuel")])
            .toEqual(["15.0", "0.95", "30.0", "500.0", "0.266"]);
        for (const felt of ["p_max_heat", "eta_fuel_to_heat", "var_om", "start_cost", "min_uptime", "min_downtime"]) expect(skabelonKilde("oil_boiler", felt), felt).toBe("egen antagelse");
        expect(skabelonKilde("oil_boiler", "co2_emissions_per_mwh_fuel")).toBe("modelrepoet");
        expect(skabelonKilde("biomass_boiler", "co2_emissions_per_mwh_fuel")).toBe("egen antagelse");
    });
    it("'modelrepoet' gælder netop de typer, modelscriptet selv har en CO₂-faktor for — med samme tal (modelspejlet)", () => {
        const spejl = (JSON.parse(rod("viden/modelspejl.json")) as { vaerksark_typer: { co2_pr_mwh_braendsel: Record<string, number> } }).vaerksark_typer.co2_pr_mwh_braendsel;
        expect([...CO2_FAKTOR_FRA_MODELREPOET].sort()).toEqual(Object.keys(spejl).sort());
        for (const [type, faktor] of Object.entries(spejl)) {
            expect(Number(ENHEDSTYPER[type].skabelon.find((s) => s.sti === "co2_emissions_per_mwh_fuel")?.vaerdi_json), type).toBe(faktor);
        }
    });
    it("Tilføj enhed: formularen siger 'egen antagelse' om forslagene, og tabellen viser kilden pr. felt", () => {
        const andeby = new Map(Object.entries(MODELSPEJL.cases.andeby.blade).map(([s, [v]]) => [s, v]));
        const blade: Blad[] = [...andeby].map(([sti, vaerdi_json]) => ({ sti, vaerdi_json, sektion: sti.split(".")[0] }));
        const rt = { nu: andeby, grundFund: validerVaerk(andeby), red: { aktiv: false, udkast: new Map(), sæt: () => {} }, sender: false, svar: undefined, send: vi.fn(async () => true) } as unknown as RedigeringsTilstand;
        const { container } = render(<NyEnhed kode="andeby" blade={blade} rt={rt} gåTil={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("Type"), { target: { value: "oil_boiler" } });
        const tekst = container.textContent ?? "";
        expect(tekst).toMatch(/appens egne forslag \(egen antagelse/);                  // før: "Skabelonens tal er pladsholdere"
        expect(tekst).toMatch(/CO₂-faktoren.*modelrepoets/);
        // Felterne, formularen spørger om, er mærket, så længe de står med forslaget.
        expect((screen.getByLabelText(/^Maks\. varmeeffekt/) as HTMLInputElement).value).toBe("15,0");
        expect(screen.getByLabelText(/^Maks\. varmeeffekt/).closest("label")?.textContent).toMatch(/egen antagelse/);
        // Tabellen over resten af skabelonen har kilden pr. felt.
        const raekker = [...container.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "");
        expect(raekker.find((r) => /CO₂/.test(r))).toMatch(/modelrepoet/);
        expect(raekker.filter((r) => !/CO₂/.test(r)).every((r) => /egen antagelse/.test(r))).toBe(true);
    });
    it("Nyt værk: trinnet Enheder siger, at felterne starter med appens egne forslag", () => {
        const fod = trinFod("enheder", NYT_VAERK_SKABELON!);
        expect(fod).toMatch(/appens egne forslag for typen \(egen antagelse/);          // før: "typens skønnede værdier"
        expect(fod).toMatch(/CO₂-faktoren.*modelrepoets/);
    });
    it("§5 i doc/TROFASTHED.md navngiver oliekedlens pladsholdere under begge oprettelsesveje", () => {
        const raekke = rod("doc/TROFASTHED.md").split("\n").find((l) => l.startsWith("| Enhedstypernes pladsholdere"));
        expect(raekke, "§5 mangler rækken om enhedstypernes pladsholdere").toBeTruthy();
        for (const m of [/Tilføj enhed/, /Nyt værk/, /15 MW/, /0,95/, /30 kr\.\/MWh/, /500 kr\./, /0,266/, /egne? antagelse|egne forslag/]) expect(raekke).toMatch(m);
    });
});
