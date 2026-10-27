// Codex K9 F4: samme resultat stod som "170 kr. mindre" (overskriften, præcist) og "200 kr. billigere" (fortællingen,
// afrundet efter historie.afrunding) uden afrundingsmarkør. Reglen (viden/anbefalingsregler.json): fortællingen afrunder
// stadig, men et afrundet beløb, der ikke er beløbet i hele kroner, står med "ca." — som skaleringen og energitallene
// ("ca. 87 MWh") allerede gør. Skrevet FØR rettelsen.
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { profil, samlNoegletal, type Koersel, type Noegletal } from "./beregn";
import { historie, krNul, krRund, neutralSaetning, ordnPar, vurder, type Side } from "./anbefaling";

describe("kr.-reglen med afrundingsmarkør", () => {
    it("Codex' eksempel: 170,18 kr. er 'ca. 200 kr.'; et beløb, der allerede er rundt, står uden 'ca.'", () => {
        expect(krRund(866_861.0581715223 - 867_031.2345792934)).toBe("ca. 200 kr.");
        expect(krRund(200)).toBe("200 kr.");
        expect(krRund(22_000.4)).toBe("22.000 kr.");
        expect(krRund(21_915.92)).toBe("ca. 22.000 kr.");
        expect(krRund(-2_500_000)).toBe("2,5 mio. kr.");
        expect(krRund(2_543_210)).toBe("ca. 2,5 mio. kr.");
    });
    it("et beløb, der afrundes til 0, er 'under 100 kr.'; nul er nul", () => {
        expect(krRund(30)).toBe("under 100 kr.");
        expect(krRund(0)).toBe("0 kr.");
        expect([krNul(0), krNul(30), krNul(-49.9), krNul(50)]).toEqual([true, true, true, false]);
        expect(neutralSaetning(30, true)).toBe("Scenariet og referencen har samme driftsomkostning i perioden (forskellen er under 100 kr.).");
    });
    it("uden markør, hvor teksten selv siger 'ca.' (skaleringen)", () => {
        expect(krRund(170.18, false)).toBe("200 kr.");
    });
});

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
let n = 0;
const nt = (gruppe: string, noegle: string, vaerdi: number): Noegletal => ({ id: `k9-${n++}`, koersel_id: "k", gruppe, noegle, vaerdi } as Noegletal);
const VAERK = [
    ind("vaerk", "meta.titel", "\"Testværk\""), ind("vaerk", "units.kedel.type", "\"gas_boiler\""), ind("vaerk", "units.kedel.enabled", "true"),
    ind("vaerk", "storage.tank.enabled", "true"), ind("vaerk", "storage.tank.volume_m3", "4000"),
];
const VINTER = [ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-16\""), ind("scenarie", "_koersel.med_balancering", "false")];
function side(navn: string, objektiv: number, egne: InputRække[]): Side {
    const input = [...VAERK, ...VINTER, ...egne];
    const k = {
        id: navn, scenarie_id: navn, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date("2026-10-16T08:00:00Z"),
        model_commit: "eef950a2ac7b3808a9456dcf48742ce08e52366a", data_commit: "106b9fce9a2e3610090b1a542559024056449b88",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv, best_bound: objektiv,
    } as Koersel;
    return { k, navn, vaerkNavn: "Testværk", input, samlet: samlNoegletal([nt("objektiv", "objektiv_dkk", objektiv)]), profil: profil(k, "Testværk", null, input) };
}

describe("fortællingen og vurderingen bruger samme beløbsformat", () => {
    it("et afrundet beløb står med 'ca.', aldrig som et præcist tal, og aldrig 'kr. kr.'", () => {
        // Δ = +44.876,55 kr. uden tanken: over væsentlighedsgrænsen (30.000 kr.) og med det forventede fortegn, så
        // vurderingen når trin 7 ("Scenariet gør driften {delta} kr. dyrere"), hvis skabelon selv skriver "kr.".
        const p = ordnPar(side("ref", 30_000_000, []), side("scen", 30_044_876.55, [ind("aendring", "storage.tank.enabled", "false")]));
        const v = vurder(p);
        expect(v.kategori).toBe("fraraades");
        expect(v.begrundelse).toMatch(/^Scenariet gør driften ca\. 45\.000 kr\. dyrere/);
        const tekst = [historie(p, v), v.saetning, v.begrundelse].join(" | ");
        expect(tekst).not.toMatch(/kr\. kr\./);
        expect(tekst).toMatch(/ca\. 45\.000 kr\./);
        expect(tekst).not.toMatch(/(?<!ca\. )45\.000 kr\./);
    });
});
