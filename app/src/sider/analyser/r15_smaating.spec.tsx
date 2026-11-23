// Runde 15, fund 3.6 (den uafhængige test 18. november 2026), de to småting i Analyser og Scenarier:
//  * "Kørslen gemmer model_zip_sha256: null i miljoe_json. […] appen kunne advare, når markøren ikke kommer fra en
//    zip." Arbejderen henter modelkoden som zip ved den pinnede commit og gemmer zippens sha256 (fabric/fjv/runtime.py
//    › sikr_repo). Er den tom, er koden lagt i cachen på anden vis, og appen kan ikke stå inde for, at det er pinnen.
//  * Knappen hed "Bekræft og kør begge", også når referencen genbruges, og kun scenariet bestilles.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { kodeOprindelse } from "./beregn";
import { KodeOprindelse } from "./dele";
import { parTekster } from "../scenarier/par";

afterEach(cleanup);

const miljoe = (over: Record<string, unknown>) => JSON.stringify({ python: "3.13.14", pakker: { linopy: "0.10.0" }, motor_version: "1", ...over });
const ZIP = "902fa86b" + "0".repeat(56), DATA = "447c552c" + "0".repeat(56);

describe("3.6: advarsel, når modelkoden ikke kommer fra en zip", () => {
    it("begge zip-fingeraftryk kendt: ingen advarsel, og de kan vises", () => {
        const o = kodeOprindelse(miljoe({ model_zip_sha256: ZIP, data_zip_sha256: DATA }));
        expect(o.advarsler).toEqual([]);
        expect(o.model).toBe(ZIP);
        expect(o.data).toBe(DATA);
    });
    it("model_zip_sha256 er null: advarsel om modelkoden (testrapportens tilfælde)", () => {
        const o = kodeOprindelse(miljoe({ model_zip_sha256: null, data_zip_sha256: null }));
        expect(o.advarsler).toHaveLength(2);
        expect(o.advarsler[0]).toMatch(/Modelkoden .* ikke hentet som zip/);
        expect(o.advarsler[1]).toMatch(/df-data .* ikke hentet som zip/);
    });
    it("en ældre kørsel uden felterne (eller uden miljø): intet at sige — ikke en advarsel om noget, kørslen aldrig målte", () => {
        expect(kodeOprindelse(miljoe({})).advarsler).toEqual([]);
        expect(kodeOprindelse(null).advarsler).toEqual([]);
        expect(kodeOprindelse("ikke json").advarsler).toEqual([]);
    });
    it("kørslens side viser advarslen som en advarsel", () => {
        const { container } = render(<KodeOprindelse miljoe_json={miljoe({ model_zip_sha256: null, data_zip_sha256: DATA })} />);
        const a = container.querySelector("[data-tone='advarsel'][role='status']");
        expect(a?.textContent).toMatch(/Modelkoden .* ikke hentet som zip/);
        expect(a?.textContent).not.toMatch(/df-data/);
    });
    it("uden advarsel gengiver komponenten ingenting", () => {
        expect(render(<KodeOprindelse miljoe_json={miljoe({ model_zip_sha256: ZIP, data_zip_sha256: DATA })} />).container.textContent).toBe("");
    });
});

describe("3.6: knapteksten følger, hvad der faktisk bestilles", () => {
    it("ny reference: to kørsler, 'Bekræft og kør begge'", () => {
        expect(parTekster(false)).toMatchObject({ knap: "Bekræft og kør begge", afgraensning: "to kørsler", bestilt: "Begge er bestilt — følg dem på scenariets side." });
    });
    it("genbrugt reference: én kørsel, 'Bekræft og kør scenariet' (før: 'Bekræft og kør begge')", () => {
        const t = parTekster(true);
        expect(t.knap).toBe("Bekræft og kør scenariet");
        expect(t.afgraensning).toBe("én kørsel — referencen genbruges");
        expect(t.bestilt).toMatch(/^Scenariet er bestilt; referencen er genbrugt/);
    });
});
