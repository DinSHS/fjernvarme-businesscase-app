// Runde 15, fund 4E (den uafhængige test 18. november 2026): modellens `co2_ton` (src/manifest.py:130-147) er
// Σ varme / eta_fuel_to_heat × co2_emissions_per_mwh_fuel over brændselsenhederne. Billund-casene har faktoren 0,0 på
// gasenhederne, fordi CO₂-omkostningen ligger i gasprisen — rigtigt for økonomien, men så er `co2_ton` 0, selv om
// gaskedlen brænder naturgas. Appen viste det som "CO₂-udledning 0 t". Genskabt FØR rettelsen.
// Efter rettelsen: producerer en enhed med fossilt brændsel varme med emissionsfaktor 0, siger appen, at udledningen
// ikke er opgjort, og hvorfor — i kørslens kort, i sammenligningens nøgletal og i "Scenariet fortalt".
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { konsekvenser, ordnPar, type Side } from "./anbefaling";
import { co2Opgoerelse, maanedstabel, profil, samlNoegletal, type Koersel, type Noegletal as NT, type Scenarie } from "./beregn";
import type { Pakke } from "./data";
import { VarmeOgMiljoe } from "./koersel";
import { Noegletal } from "./sammenlign";

afterEach(cleanup);

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
let n = 0;
const nt = (gruppe: string, noegle: string, vaerdi: number, objekt: string | null = null): NT => ({ id: `co2-${n++}`, koersel_id: "k", gruppe, noegle, vaerdi, objekt } as NT);

/** Et værk med gaskedel, gasmotor og fliskedel. `faktor` = gasenhedernes co2_emissions_per_mwh_fuel (null = feltet mangler). */
function vaerk(faktor: number | null, ekstra: InputRække[] = []): InputRække[] {
    const f = (u: string) => (faktor === null ? [] : [ind("vaerk", `units.${u}.co2_emissions_per_mwh_fuel`, faktor.toFixed(1))]);
    return [
        ind("vaerk", "storage.tank.enabled", "true"),
        ind("vaerk", "units.gaskedel_agg.type", "\"gas_boiler\""), ind("vaerk", "units.gaskedel_agg.fuel", "\"natural_gas\""), ind("vaerk", "units.gaskedel_agg.enabled", "true"), ...f("gaskedel_agg"),
        ind("vaerk", "units.gasmotor.type", "\"gas_engine_chp\""), ind("vaerk", "units.gasmotor.fuel", "\"natural_gas\""), ind("vaerk", "units.gasmotor.enabled", "true"), ...f("gasmotor"),
        ind("vaerk", "units.fliskedel.type", "\"biomass_boiler\""), ind("vaerk", "units.fliskedel.fuel", "\"flis\""), ind("vaerk", "units.fliskedel.enabled", "true"),
        ind("vaerk", "units.fliskedel.co2_emissions_per_mwh_fuel", "0.0"),
        ind("scenarie", "_koersel.start", "\"2026-03-02\""), ind("scenarie", "_koersel.slut", "\"2026-06-30\""), ind("scenarie", "_koersel.med_balancering", "false"),
        ...ekstra,
    ];
}
/**
 * Nøgletal: modellens co2_ton og, pr. enhed, produktionen (MWh) og antallet af driftsintervaller — som arbejderen gemmer
 * dem af kpi.csv (`production_mwh`, `operating_hours`). 0 MWh står her med 0 driftsintervaller: et dokumenteret nul
 * (kodegennemgangen af runde 15, fund 8, skelner det fra et afrundet nul og fra manglende tal; se sidst i filen).
 */
function tal(co2: number, produktion: Record<string, number>): NT[] {
    return [nt("objektiv", "objektiv_dkk", 4_428_863.74), nt("miljoe", "co2_ton", co2), nt("el", "forbrug_mwh", 400),
        ...Object.entries(produktion).flatMap(([u, mwh]) => [nt("enhed", "produktion_mwh", mwh, u), nt("enhed", "driftsintervaller", mwh > 0 ? 100 : 0, u)])];
}
function pakke(id: string, input: InputRække[], noegletal: NT[], objektiv = 4_428_863.74): Pakke {
    const k = {
        id, scenarie_id: `s-${id}`, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date(Date.UTC(2026, 10, 18, 8, n++)),
        model_commit: "90fb16eb1e2d5aa8e619b5a951b93760fa803985", data_commit: "106b9fce9a2e3610090b1a542559024056449b88",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv, best_bound: objektiv,
    } as Koersel;
    return {
        k, vaerkNavn: "Billund", vaerkKode: "billund_sporb", scenarie: { id: k.scenarie_id, navn: id, med_balancering: false } as Scenarie,
        samlet: samlNoegletal(noegletal), maaneder: maanedstabel([]), input, profil: profil(k, "Billund", null, input),
        objekter: { enheder: [], lagre: [] }, tidsserienavne: new Map(),
    };
}
const PROD = { gaskedel_agg: 704, gasmotor: 25, fliskedel: 9000 };

describe("4E: hvornår er CO₂-udledningen opgjort?", () => {
    it("Billund: gasenhederne producerer med emissionsfaktor 0 → ikke opgjort, med enhederne navngivet", () => {
        const p = pakke("billund", vaerk(0), tal(0, PROD));
        const o = co2Opgoerelse(p.input, p.samlet);
        expect(o.opgjort).toBe(false);
        expect(o.enheder).toEqual(["gaskedel_agg", "gasmotor"]);
        expect(o.grund).toMatch(/emissionsfaktoren .* er 0 for gaskedel_agg og gasmotor/);
        expect(o.grund).toMatch(/naturgas/);
    });
    it("feltet mangler helt (modellens standard er 0,0, src/config.py:504) → ikke opgjort", () => {
        const p = pakke("uden felt", vaerk(null), tal(0, PROD));
        expect(co2Opgoerelse(p.input, p.samlet).opgjort).toBe(false);
    });
    it("Andeby: faktoren 0,2 på gasenhederne → opgjort (modellens 159,2 t står, som den er)", () => {
        const p = pakke("andeby", vaerk(0.2), tal(159.2, PROD));
        expect(co2Opgoerelse(p.input, p.samlet)).toMatchObject({ opgjort: true, enheder: [], grund: null });
    });
    it("gasenhederne producerer intet i kørslen: 0 t er rigtigt, også med faktoren 0", () => {
        const p = pakke("ingen gas", vaerk(0), tal(0, { gaskedel_agg: 0, gasmotor: 0, fliskedel: 9729 }));
        expect(co2Opgoerelse(p.input, p.samlet).opgjort).toBe(true);
    });
    it("biomasse med faktoren 0 er modellens egen regel (regnes neutral) og gør ikke opgørelsen ufuldstændig", () => {
        const p = pakke("kun flis", vaerk(0.2), tal(0, { gaskedel_agg: 0, gasmotor: 0, fliskedel: 9729 }));
        expect(co2Opgoerelse(p.input, p.samlet).opgjort).toBe(true);
    });
    it("en gasenhed slået fra i scenariet tæller ikke", () => {
        const input = vaerk(0, [ind("aendring", "units.gaskedel_agg.enabled", "false"), ind("aendring", "units.gasmotor.enabled", "false")]);
        const p = pakke("fra", input, tal(0, { fliskedel: 9729 }));
        expect(co2Opgoerelse(p.input, p.samlet).opgjort).toBe(true);
    });
});

describe("4E: appen viser ikke '0 t' som udledning, når den ikke er opgjort", () => {
    it("kørslens kort 'Varme og miljø': 'ikke opgjort' med grunden — før 'CO₂-udledning 0 t'", () => {
        const { container } = render(<VarmeOgMiljoe d={pakke("billund", vaerk(0), tal(0, PROD))} />);
        const t = container.textContent!;
        expect(t).not.toMatch(/CO₂-udledning\s*0 t/);
        expect(t).toMatch(/CO₂-udledning\s*ikke opgjort/);
        expect(t).toMatch(/emissionsfaktoren .* er 0 for gaskedel_agg og gasmotor/);
        expect(t).toMatch(/egen antagelse/i);
    });
    it("kontrol: med faktoren 0,2 vises modellens tal", () => {
        const { container } = render(<VarmeOgMiljoe d={pakke("andeby", vaerk(0.2), tal(159.2, PROD))} />);
        expect(container.textContent).toMatch(/CO₂-udledning\s*159 t/);
        expect(container.textContent).not.toMatch(/ikke opgjort/);
    });
    it("sammenligningens nøgletal: intet CO₂-tal og intet 'CO₂ +0 t' i budskabet", () => {
        const a = pakke("ref", vaerk(0), tal(0, PROD)), b = pakke("uden tank", vaerk(0, [ind("aendring", "storage.tank.enabled", "false")]), tal(0, PROD), 6_607_703);
        const { container } = render(<Noegletal a={a} b={b} />);
        const t = container.textContent!;
        expect(t).not.toMatch(/CO₂ [+−]?0 t/);
        expect(t).toMatch(/CO₂-udledningen er ikke opgjort/);
    });
    it("'Scenariet fortalt' nævner ikke en CO₂-ændring, der ikke er opgjort", () => {
        const side = (p: Pakke): Side => ({ k: p.k, navn: p.scenarie!.navn, vaerkNavn: p.vaerkNavn, input: p.input, samlet: p.samlet, profil: p.profil });
        const a = pakke("ref", vaerk(0), tal(0, PROD));
        // Modellens tal flytter sig (fx fordi en enhed med faktor > 0 er med i en af kørslerne), men gasenhederne tæller ikke med.
        const b = pakke("uden tank", vaerk(0, [ind("aendring", "storage.tank.enabled", "false")]), tal(25, PROD), 6_607_703);
        const tekst = konsekvenser(ordnPar(side(a), side(b)), 2_178_839).join(" ");
        expect(tekst).not.toMatch(/CO₂/);
    });
});

// Opfølgning efter fletningen med modelskiftet til 939228a: modelrepoets oliekedel er typen `oil_boiler` med brændslet
// `fuel_oil` (i appen "Fyringsolie"), og modelscriptets CO₂-faktor er 0,266 t/MWh. Reglen fra 4E skal ramme den med de
// navne — og kalde brændslet det samme, som resten af appen gør.
describe("4E og oliekedlen (oil_boiler / fuel_oil ved 939228a)", () => {
    const olie = (faktor: number | null, medBraendsel = true): InputRække[] => [
        ind("vaerk", "units.oliekedel.type", "\"oil_boiler\""), ...(medBraendsel ? [ind("vaerk", "units.oliekedel.fuel", "\"fuel_oil\"")] : []),
        ind("vaerk", "units.oliekedel.enabled", "true"),
        ...(faktor === null ? [] : [ind("vaerk", "units.oliekedel.co2_emissions_per_mwh_fuel", String(faktor))]),
        ind("vaerk", "units.fliskedel.type", "\"biomass_boiler\""), ind("vaerk", "units.fliskedel.fuel", "\"flis\""), ind("vaerk", "units.fliskedel.enabled", "true"),
        ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-06\""), ind("scenarie", "_koersel.med_balancering", "false"),
    ];
    // Spor M's måling: oliekedlen 480,1 MWh 5.–6. januar 2026, CO₂ 207,4 t med faktoren 0,266.
    const PROD_OLIE = { oliekedel: 480.1, fliskedel: 300 };

    it("faktor 0,266 (modelscriptets): udledningen er opgjort, og modellens 207,4 t vises", () => {
        const p = pakke("olie", olie(0.266), tal(207.4, PROD_OLIE));
        expect(co2Opgoerelse(p.input, p.samlet)).toMatchObject({ opgjort: true, enheder: [], grund: null });
        expect(render(<VarmeOgMiljoe d={p} />).container.textContent).toMatch(/CO₂-udledning\s*207 t/);
    });
    it("faktor 0: ikke opgjort — og brændslet hedder fyringsolie, som i resten af appen", () => {
        const p = pakke("olie0", olie(0), tal(0, PROD_OLIE));
        const o = co2Opgoerelse(p.input, p.samlet);
        expect(o.opgjort).toBe(false);
        expect(o.enheder).toEqual(["oliekedel"]);
        expect(o.grund).toMatch(/er 0 for oliekedel, som producerede varme på fyringsolie/);
        expect(render(<VarmeOgMiljoe d={p} />).container.textContent).toMatch(/CO₂-udledning\s*ikke opgjort/);
    });
    it("typen alene (oil_boiler uden fuel-felt) er nok til at være fossil", () => {
        const p = pakke("olie uden fuel", olie(0, false), tal(0, PROD_OLIE));
        expect(co2Opgoerelse(p.input, p.samlet)).toMatchObject({ opgjort: false, enheder: ["oliekedel"] });
    });
    it("feltet mangler på oliekedlen (modellens standard 0,0): ikke opgjort", () => {
        const p = pakke("olie uden faktor", olie(null), tal(0, PROD_OLIE));
        expect(co2Opgoerelse(p.input, p.samlet).opgjort).toBe(false);
    });
});

// Kodegennemgangen af runde 15, fund 8 (P3): "En oliekedel i drift kan blive læst som uden produktion."
// Modellen afrunder enhedens produktion til 0,1 MWh, før nøgletallet gemmes (modelrepoets src/reporting.py:79:
// `round(prod, 1)`), men tæller driftsintervallerne på den uafrundede (`> 1e-6`, :75). En oliekedel med 0,04 MWh og én
// driftstime kom derfor ind i reglen med 0 MWh, og advarslen udeblev. Og manglede enhedens nøgletal helt, blev det
// læst som bevis på, at kedlen ikke deltog. Genskabt FØR rettelsen: samme tændte oliekedel med faktor 0 gav
// `opgjort=false` med positiv produktion og `opgjort=true` både med afrundet nul og uden enhedens nøgletal.
// Efter rettelsen skelnes DOKUMENTERET nul (0 MWh og 0 driftsintervaller) fra ufuldstændige tal: mindst ét
// driftsinterval udløser reglen trods et afrundet nul, og mangler tallene, er status UKENDT med sin egen forklaring.
describe("fund 8: dokumenteret nul, afrundet nul og manglende tal", () => {
    const olie = (ekstra: InputRække[] = []): InputRække[] => [
        ind("vaerk", "units.oliekedel.type", "\"oil_boiler\""), ind("vaerk", "units.oliekedel.fuel", "\"fuel_oil\""), ind("vaerk", "units.oliekedel.enabled", "true"),
        ind("vaerk", "units.oliekedel.co2_emissions_per_mwh_fuel", "0.0"),
        ind("vaerk", "units.fliskedel.type", "\"biomass_boiler\""), ind("vaerk", "units.fliskedel.fuel", "\"flis\""), ind("vaerk", "units.fliskedel.enabled", "true"),
        ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-06\""), ind("scenarie", "_koersel.med_balancering", "false"),
        ...ekstra,
    ];
    /** Nøgletal for oliekedlen, som arbejderen gemmer dem: produktionen afrundet til 0,1 MWh og antallet af driftsintervaller. */
    const enhed = (mwh: number | null, intervaller: number | null): NT[] => [
        nt("objektiv", "objektiv_dkk", 1_000_000), nt("miljoe", "co2_ton", 0), nt("enhed", "produktion_mwh", 300, "fliskedel"), nt("enhed", "driftsintervaller", 48, "fliskedel"),
        ...(mwh === null ? [] : [nt("enhed", "produktion_mwh", mwh, "oliekedel")]), ...(intervaller === null ? [] : [nt("enhed", "driftsintervaller", intervaller, "oliekedel")]),
    ];
    const opg = (noegletal: NT[], input = olie()) => { const p = pakke("olie", input, noegletal); return co2Opgoerelse(p.input, p.samlet); };

    it("0,04 MWh afrundet til 0,0 og én driftstime: kedlen KØRTE — ikke opgjort (før: opgjort)", () => {
        const o = opg(enhed(0, 1));
        expect([o.status, o.opgjort, o.enheder]).toEqual(["ikke_opgjort", false, ["oliekedel"]]);
        expect(o.grund).toMatch(/emissionsfaktoren .* er 0 for oliekedel, som producerede varme på fyringsolie/);
    });
    it("enhedens nøgletal mangler helt: det er ikke et bevis på, at kedlen stod stille — ukendt (før: opgjort)", () => {
        const o = opg(enhed(null, null));
        expect([o.status, o.opgjort, o.enheder]).toEqual(["ukendt", false, ["oliekedel"]]);
        expect(o.grund).toMatch(/Kan ikke afgøres/);
        expect(o.grund).toMatch(/resultaterne har ingen nøgletal for oliekedel/);
        expect(o.grund).not.toMatch(/som producerede varme/);              // det ved vi netop ikke
    });
    it("dokumenteret nul: 0 MWh og 0 driftsintervaller — opgjort, også med faktoren 0", () => {
        expect(opg(enhed(0, 0))).toMatchObject({ status: "opgjort", opgjort: true, enheder: [], grund: null });
    });
    it("0,0 MWh uden antallet af driftsintervaller: under afrundingen kan kedlen have kørt — ukendt", () => {
        const o = opg(enhed(0, null));
        expect(o.status).toBe("ukendt");
        expect(o.grund).toMatch(/produktionen er afrundet til 0,0 MWh, og antallet af driftsintervaller mangler for oliekedel/);
    });
    it("kontrol: positiv produktion er ikke opgjort, som før — og en sikker mangel går forud for en ukendt", () => {
        expect(opg(enhed(480.1, 35)).status).toBe("ikke_opgjort");
        // To fossile enheder med faktor 0: den ene producerede, den anden mangler tal. Udledningen ER ufuldstændig.
        const to = olie([ind("vaerk", "units.gaskedel.type", "\"gas_boiler\""), ind("vaerk", "units.gaskedel.fuel", "\"natural_gas\""), ind("vaerk", "units.gaskedel.enabled", "true")]);
        const o = opg(enhed(480.1, 35), to);
        expect([o.status, o.enheder]).toEqual(["ikke_opgjort", ["oliekedel"]]);
    });
    it("kørslens frosne input kendes ikke: det kan ikke ses, om en fossil enhed har faktoren 0 — ukendt", () => {
        const o = opg(enhed(480.1, 35), []);
        expect([o.status, o.opgjort]).toEqual(["ukendt", false]);
        expect(o.grund).toMatch(/kørslens frosne input kendes ikke/);
    });
    it("kørslens kort viser 'ukendt' med sin egen forklaring — ikke '0 t' og ikke 'ikke opgjort'", () => {
        const { container } = render(<VarmeOgMiljoe d={pakke("olie", olie(), enhed(null, null))} />);
        const t = container.textContent!;
        expect(t).toMatch(/CO₂-udledning\s*ukendt/);
        expect(t).not.toMatch(/CO₂-udledning\s*(0 t|ikke opgjort)/);
        expect(t).toMatch(/resultaterne har ingen nøgletal for oliekedel/);
    });
    it("sammenligningens nøgletal: 'kan ikke afgøres' for CO₂, når en af kørslerne er ukendt", () => {
        const a = pakke("ref", olie(), enhed(0, 0)), b = pakke("scen", olie(), enhed(null, null), 1_100_000);
        const t = render(<Noegletal a={a} b={b} />).container.textContent!;
        expect(t).toMatch(/CO₂-udledningen kan ikke afgøres/);
        expect(t).not.toMatch(/CO₂ [+−]?0 t/);
    });
});
