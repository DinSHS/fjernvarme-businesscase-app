// Runde 15: oliekedlen (modelrepoets 939228a: enhedstypen oil_boiler, brændslet fuel_oil) i Analyser og Scenarier.
// Fejlen, testene forhindrer: typen og brændslet var opregnet i faste lister, som ikke kendte dem — et par, der kun
// ændrer olieprisen, blev ikke genkendt som en prisfølsomhed, oliekedlen hed "enheden" i historien, og olieprisen
// kunne ikke vælges i knappen "Hvor følsom er økonomien for brændselsprisen?".
// Egen fil: et andet spor retter samtidig præsentationen i analyser/ (runde 15, spor P).
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { KNAPPER as SCENARIEKNAPPER, VISNINGSNAVNE as SCENARIENAVNE } from "../scenarier/viden.data";
import { aendringsfraser, ordnPar, type Side } from "./anbefaling";
import { VISNINGSNAVNE } from "./anbefaling.data";
import { enhedstype, profil, samlNoegletal, type Koersel, type Noegletal } from "./beregn";
import { ENHEDSTYPER, FELTER } from "./etiketter.data";

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
const VAERK = [
    ind("vaerk", "meta.titel", '"Testværk"'),
    ind("vaerk", "units.halmkedel.type", '"biomass_boiler"'), ind("vaerk", "units.halmkedel.enabled", "true"),
    ind("vaerk", "units.oliekedel.type", '"oil_boiler"'), ind("vaerk", "units.oliekedel.enabled", "true"), ind("vaerk", "units.oliekedel.fuel", '"fuel_oil"'),
    ind("vaerk", "prices.straw.value", "205.0"), ind("vaerk", "prices.fuel_oil.value", "900.0"), ind("vaerk", "prices.co2_eua.value", "600.0"),
    ind("vaerk", "heat_load_params.gaf_mw_per_k", "0.5"),
];
const VINDUE = [ind("scenarie", "_koersel.start", '"2026-01-05"'), ind("scenarie", "_koersel.slut", '"2026-01-16"'), ind("scenarie", "_koersel.med_balancering", "false")];
function side(navn: string, objektiv: number, egne: InputRække[]): Side {
    const input = [...VAERK, ...VINDUE, ...egne];
    const k = {
        id: navn, scenarie_id: navn, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date("2026-11-23T08:00:00Z"),
        model_commit: "939228aa048563c8498382a79d207c8b03fbda57", data_commit: "106b9fce9a2e3610090b1a542559024056449b88",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv, best_bound: objektiv,
    } as Koersel;
    const nt = [{ id: `${navn}-o`, koersel_id: navn, gruppe: "objektiv", noegle: "objektiv_dkk", vaerdi: objektiv } as Noegletal];
    return { k, navn, vaerkNavn: "Testværk", input, samlet: samlNoegletal(nt), profil: profil(k, "Testværk", null, input) };
}

describe("oliekedlen i Analyser", () => {
    it("typen hedder Oliekedel i tabellerne, og olieprisen har en etiket", () => {
        expect(ENHEDSTYPER.oil_boiler).toBe("Oliekedel");
        expect(enhedstype(VAERK, "oliekedel")).toBe("Oliekedel");
        expect(FELTER.find((f) => f.sti === "prices.fuel_oil.value")?.etiket).toBe("Fyringsoliepris");
        expect(VISNINGSNAVNE.braendsel.fuel_oil).toBe("Fyringsolie");
    });
    it("et par, der kun ændrer olieprisen, er en prisfølsomhed — og historien siger fyringsolie", () => {
        const p = ordnPar(side("ref", 3_000_000, []), side("scen", 3_050_000, [ind("aendring", "prices.fuel_oil.value", "1080.0")]));
        expect(p.knap).toBe("braendselspris");
        expect(aendringsfraser(p).join(" ")).toMatch(/hæver fyringsolieprisen fra 900 til 1\.?080 kr\.\/MWh \(\+20 %\)/);
    });
    it("slås oliekedlen fra, hedder den oliekedlen — ikke enheden", () => {
        const p = ordnPar(side("ref", 3_000_000, []), side("scen", 2_990_000, [ind("aendring", "units.oliekedel.enabled", "false")]));
        expect(p.knap).toBe("enhedens_vaerdi");
        expect(aendringsfraser(p)).toEqual(["slår oliekedlen oliekedel fra"]);
    });
});

describe("oliekedlen i Scenarier", () => {
    it("knappen for brændselspris tilbyder fyringsolie, og valget vises på dansk", () => {
        const knap = SCENARIEKNAPPER.find((k) => k.id === "braendselspris")!;
        const valg = knap.valg!.find((v) => v.pladsholder === "<braendsel>")!;
        expect(valg.tilladte).toContain("fuel_oil");
        expect(SCENARIENAVNE.braendsel.fuel_oil).toBe("Fyringsolie");
    });
});
