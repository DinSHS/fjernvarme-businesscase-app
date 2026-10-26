// Codex K7-F2: forbrugsmodregningen (brutto − netto) betød før modelrettelsen 19/10-2026 sparet spot + tarif + elafgift,
// fra eef950a kun tarif + elafgift. Etiket og forklaring skal følge kørslens FROSNE modelversion.
// Tallene er den historiske fixture fabric/tests/data/andeby_bal (b49aeb0): 116.847,06 kr. modregning ved 109,2251 MWh,
// heraf kun 14.090,04 kr. tarif og afgift (129 kr./MWh) — resten er spotprisen.
import { describe, expect, it } from "vitest";
import { BALANCE_KOLONNER, balanceDelta, balanceKolonner, samlNoegletal, type Noegletal } from "./beregn";

const GAMMEL = "b49aeb0af097be42938b80a0fea6acdd77162836";
const NY = "eef950a2ac7b3808a9456dcf48742ce08e52366a";
let n = 0;
const nt = (noegle: string, vaerdi: number, marked?: string) =>
    ({ id: `bv-${n++}`, koersel_id: "k", gruppe: "balancering", noegle, vaerdi, objekt: null, marked: marked ?? null } as unknown as Noegletal);
const balance = (modregning: number, netto: number) => samlNoegletal([
    nt("netto_dkk", netto), nt("brutto_dkk", netto + modregning),
    nt("netto_dkk", netto, "afrr"), nt("brutto_dkk", netto + modregning, "afrr"),
    nt("kapacitetsindtaegt_dkk", netto / 2, "afrr"), nt("aktivering_netto_dkk", netto / 2, "afrr"),
    nt("forbrugsmodregning_dkk", modregning, "afrr"), nt("aktivering_brutto_dkk", netto / 2 + modregning, "afrr"),
]).balance!;
const modregningKolonne = (k: ReturnType<typeof balanceKolonner>) => k.find((x) => x.felt === "sparet_elkoeb")!;

describe("forbrugsmodregningen følger kørslens modelversion (K7-F2)", () => {
    it("kørsel ved eef950a: kolonnerne er de nye (sparet tarif og afgift, uden spot)", () => {
        expect(balanceKolonner([NY])).toBe(BALANCE_KOLONNER);
        expect(modregningKolonne(balanceKolonner([NY])).etiket).toBe("Sparet tarif og afgift ved aktivering");
    });

    it("kørsel ved b49aeb0: neutral etiket og den gamle definition med spot — aldrig den nye tekst", () => {
        const k = modregningKolonne(balanceKolonner([GAMMEL]));
        expect(k.etiket).toBe("Forbrugsmodregning ved aktivering");
        expect(k.forklaring).toMatch(/spotpris, tarif og elafgift/);
        expect(k.forklaring).toMatch(/b49aeb0/);
        expect(k.forklaring).not.toMatch(/Spotprisen er ikke med/);
        expect(k.uensDefinition).toBe(false);
    });

    it("blandede versioner: begge definitioner nævnes, og der regnes intet Δ for poster med modregningen", () => {
        const kol = balanceKolonner([GAMMEL, NY]);
        expect(modregningKolonne(kol).forklaring).toMatch(/b49aeb0.*spotprisen.*eef950a.*tarif og elafgift/);
        const gammel = balance(116847.06, 500000);   // fixturens modregning: 102.757,02 kr. af den er spot
        const ny = balance(14090.04, 500000);        // samme aktivering, kun tarif + afgift (129 kr./MWh × 109,2251 MWh)
        const rk = balanceDelta(gammel, ny, kol).filter((r) => r.marked === "aFRR");
        const delta = (felt: string) => rk.find((r) => r.felt === felt)?.delta;
        expect(delta("sparet_elkoeb")).toBeNull();
        expect(delta("aktivering_brutto")).toBeNull();
        expect(delta("brutto")).toBeNull();
        expect(delta("netto")).toBe(0);                // netto har samme definition i begge versioner
        expect(rk.find((r) => r.felt === "sparet_elkoeb")!.etiket).toBe("Forbrugsmodregning ved aktivering");
    });

    it("samme nye version på begge sider: Δ regnes som før", () => {
        const rk = balanceDelta(balance(14090.04, 500000), balance(20000, 510000), balanceKolonner([NY, NY]));
        expect(rk.find((r) => r.marked === "aFRR" && r.felt === "sparet_elkoeb")!.delta).toBeCloseTo(5909.96, 2);
    });

    it("ukendt version: neutral etiket, ikke den nye definition", () => {
        const k = modregningKolonne(balanceKolonner([undefined]));
        expect(k.etiket).toBe("Forbrugsmodregning ved aktivering");
        expect(k.forklaring).toMatch(/afhænger af modelversionen/);
    });
});
