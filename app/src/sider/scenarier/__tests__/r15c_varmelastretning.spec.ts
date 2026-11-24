// Tredje rettelsesrunde i runde 15, P2-5: "Historien og anbefalingen kan sige hver sin retning."
//
// Sætning 1 (*Scenariet fortalt*) fik i anden rettelsesrunde alle retninger for varmelasten. ANBEFALINGEN gjorde ikke:
// skabelonen for knappen *Målt varmelast* har én fast sætning ("Målt varmelast i stedet for syntesen flytter … — et
// mål for syntesens fejl"), og den blev brugt for ENHVER forskel i varmelast. Efterprøvningens tilfælde:
//   * målt reference, syntetisk scenarie → historien sagde "syntesen i stedet for den målte", anbefalingen det modsatte;
//   * to forskellige målte filer → "i stedet for syntesen", selv om ingen side brugte syntesen;
//   * to uploads med hver sit id og SAMME sha256 → dommen sagde "ja", men input-diffet så to forskellige JSON-objekter,
//     så historien fortalte et skift "fra en hash til den samme hash" og anbefalingen en virkning.
//
// Efter rettelsen klassificeres den EFFEKTIVE varmelast ét sted (`anbefaling.ts › varmelastskift`), og historien,
// anbefalingens tekst og skabelonvalget læser alle den: syntese → måling, måling → syntese, måling → måling — eller
// ingen ændring. Faglig lighed afgøres på sha256; id'et står kun i den tekniske inputvisning (`inputDiff`).
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { ordnPar, varmelastskift, type Side } from "../../analyser/anbefaling";
import { inputDiff, profil, samlNoegletal, type Koersel, type Noegletal } from "../../analyser/beregn";
import { historieEfterKørsel, type KørselMedData } from "../historie";
import type { TidsserieInfo } from "../varmelast";

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
const VAERK = [ind("vaerk", "storage.tank.enabled", "true"), ind("vaerk", "units.kedel.type", "\"gas_boiler\""), ind("vaerk", "units.kedel.enabled", "true")];
const FAST = [ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-16\""), ind("scenarie", "_koersel.med_balancering", "false")];
const serie = (id: string, navn: string, sha: string): TidsserieInfo => ({
    id, rolle: "varmelast", navn, sha256: sha.repeat(64), sti: `Files/fjv/tidsserier/billund/${sha}.csv`, oploesning: "1h",
    start: "2025-07-01T00:00:00Z", slut: "2026-06-30T23:00:00Z", status: "gyldig", aktiv: true,
} as TidsserieInfo);
const A = serie("11111111-1111-4111-8111-111111111111", "Billund målt 2025–26", "a");
const B = serie("22222222-2222-4222-8222-222222222222", "Billund målt, renset", "b");
/** En ny upload af SAMME indhold som A: andet id, andet navn, samme sha256. */
const A_IGEN = { ...serie("44444444-4444-4444-8444-444444444444", "Billund målt 2025–26 (uploadet igen)", "a") };

const frossen = (s: TidsserieInfo) => ind("scenarie", "_koersel.tidsserie.varmelast", JSON.stringify({ id: s.id, sha256: s.sha256 }));
const SYNTESE = ind("scenarie", "_koersel.tidsserie.varmelast", "\"syntetisk\"");
const fil = (navn: string) => ind("scenarie", "_koersel.heat_csv", JSON.stringify(navn));
const input = (...egne: InputRække[]): InputRække[] => [...VAERK, ...FAST, ...egne];

let n = 0;
function kørsel(navn: string, objektiv: number, egne: InputRække[]): KørselMedData {
    n++;
    const k = {
        id: `k${n}`, scenarie_id: `s${n}`, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date(Date.UTC(2026, 10, 18, 9, n)),
        model_commit: "939228aa048563c8498382a79d207c8b03fbda57", data_commit: "106b9fce9a2e3610090b1a542559024056449b88",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv, best_bound: objektiv,
    } as Koersel;
    return { k, navn, input: input(...egne), noegletal: [{ id: `n${n}`, koersel_id: k.id, gruppe: "objektiv", noegle: "objektiv_dkk", vaerdi: objektiv } as Noegletal] };
}
const fortalt = (ref: InputRække[], scen: InputRække[], serier: TidsserieInfo[] = [A, B, A_IGEN]) =>
    historieEfterKørsel(kørsel("Referencen", 5_000_000, ref), kørsel("Scenariet", 5_030_000, scen), "Billund", new Set(), serier);
const side = (x: KørselMedData): Side => ({ k: x.k, navn: x.navn, vaerkNavn: "Billund", input: x.input, samlet: samlNoegletal(x.noegletal), profil: profil(x.k, "Billund", null, x.input) });
const par = (ref: InputRække[], scen: InputRække[]) => ordnPar(side(kørsel("Referencen", 5_000_000, ref)), side(kørsel("Scenariet", 5_030_000, scen)), "ab");

describe("P2-5 · anbefalingens sætning følger samme klassifikation som historien", () => {
    it("syntese → måling (knappens egen retning): sætningen er knappens — med procenten udfyldt", () => {
        const h = fortalt([SYNTESE], [fil("billund_abvaerk_hourly.csv")]);
        expect(h.vurdering.saetning).toBe("Målt varmelast i stedet for syntesen flytter driftsomkostningen 30.000 kr. (0,6 %) — et mål for syntesens fejl.");
        expect(h.tekst).toMatch(/^I dette scenarie bruger vi den målte varmelast \(billund_abvaerk_hourly\.csv\) i stedet for syntesen/);
    });
    it("efterprøvningens tilfælde — måling → syntese: sætningen vender med", () => {
        const h = fortalt([fil("billund_abvaerk_hourly.csv")], []);
        expect(h.vurdering.sammenlignelig).toBe(true);
        // Før rettelsen: "Målt varmelast i stedet for syntesen flytter driftsomkostningen 30.000 kr. () — et mål for syntesens fejl."
        expect(h.vurdering.saetning).toBe("Syntesen i stedet for den målte varmelast flytter driftsomkostningen 30.000 kr. (0,6 %) — et mål for syntesens fejl.");
        expect(h.tekst).toMatch(/^I dette scenarie bruger vi syntesen i stedet for den målte varmelast/);
        expect(h.vurdering.saetning).not.toMatch(/\(\)/);
    });
    it("efterprøvningens tilfælde — måling → måling (to repo-filer): ingen af siderne er syntesen", () => {
        const h = fortalt([fil("billund_abvaerk_hourly.csv")], [fil("billund_abvaerk_hourly_splejset_jun2026.csv")]);
        // Før rettelsen: samme sætning som ovenfor — "i stedet for syntesen … et mål for syntesens fejl".
        expect(h.vurdering.saetning).toBe("En anden målt varmelast flytter driftsomkostningen 30.000 kr. (0,6 %) — forskellen mellem to målinger, ikke et mål for syntesens fejl.");
        expect(h.vurdering.saetning).not.toMatch(/i stedet for syntesen/);
    });
    it("…og mellem en repo-fil og en af værkets tidsserier", () => {
        expect(fortalt([fil("billund_abvaerk_hourly.csv")], [frossen(B)]).vurdering.saetning).toMatch(/^En anden målt varmelast flytter/);
    });
    it("værkets tidsserie i stedet for den udtrykkelige syntese (appens *Målt varmelast* fra og med P2-3)", () => {
        const h = fortalt([SYNTESE], [frossen(A)]);
        expect(h.vurdering.sammenlignelig).toBe(true);
        expect(h.vurdering.saetning).toMatch(/^Målt varmelast i stedet for syntesen flytter driftsomkostningen 30\.000 kr\./);
        expect(fortalt([frossen(A)], [SYNTESE]).vurdering.saetning).toMatch(/^Syntesen i stedet for den målte varmelast flytter/);
    });
});

describe("P2-5 · faglig lighed afgøres på sha256 — id'et står kun i den tekniske inputvisning", () => {
    it("efterprøvningens tilfælde: to uploads med hver sit id og samme sha256 er SAMME varmelast", () => {
        const h = fortalt([frossen(A)], [frossen(A_IGEN)]);
        // Før rettelsen: "… bruger vi den målte varmelast '… (uploadet igen)' i stedet for 'Billund målt 2025–26'" og en
        // følsomhedssætning om en virkning — for to kørsler på præcis samme varmelast.
        expect(h.tekst).not.toMatch(/i stedet for/);
        expect(h.tekst).toMatch(/samme input/);
        expect(h.vurdering.saetning).not.toMatch(/varmelast/i);
        expect(h.vurdering.begrundelse).toMatch(/samme frosne input/);
        expect(h.vurdering.knap).toBeNull();
    });
    it("uden serienavne siger historien ikke 'fra en hash til den samme hash'", () => {
        const h = fortalt([frossen(A)], [frossen(A_IGEN)], []);
        expect(h.tekst).not.toMatch(/sha256 aaaaaaaaaaaa\).*sha256 aaaaaaaaaaaa/);
        expect(h.tekst).toMatch(/samme input/);
    });
    it("den tekniske inputvisning viser stadig de to id'er", () => {
        const d = inputDiff(input(frossen(A)), input(frossen(A_IGEN))).filter((x) => x.sti === "_koersel.tidsserie.varmelast");
        expect(d).toHaveLength(1);
        expect(d[0].a).toContain(A.id);
        expect(d[0].b).toContain(A_IGEN.id);
    });
    it("samme sha256 skrevet med store og små bogstaver er samme indhold", () => {
        const stor = ind("scenarie", "_koersel.tidsserie.varmelast", JSON.stringify({ id: A_IGEN.id, sha256: A.sha256!.toUpperCase() }));
        expect(par([frossen(A)], [stor]).diff).toEqual([]);
    });
    it("den udtrykkelige syntese over for en ældre kørsel uden række: begge er syntesen — ingen ændring, ingen skabelon", () => {
        const p = par([SYNTESE], []);
        // Før rettelsen (med P2-3's række): ét diff på tidsserie.varmelast → skabelonen "maalt_varmelast".
        expect(p.diff).toEqual([]);
        expect(p.knap).toBeNull();
        expect(varmelastskift(p.ref, p.scen)).toBeNull();
    });
    it("et andet indhold er stadig en ændring, også når navnet er det samme", () => {
        const andet = { ...A, id: "33333333-3333-4333-8333-333333333333", sha256: "c".repeat(64) } as TidsserieInfo;
        const p = par([frossen(A)], [frossen(andet)]);
        expect(p.diff.map((d) => d.sti)).toEqual(["_koersel.tidsserie.varmelast"]);
        expect(varmelastskift(p.ref, p.scen)).toBe("maaling_til_maaling");
    });
});

describe("P2-5 · klassifikationen selv, og skabelonvalget", () => {
    it("de tre retninger og 'ingen ændring'", () => {
        const s = (egne: InputRække[]) => side(kørsel("x", 1, egne));
        expect(varmelastskift(s([]), s([frossen(A)]))).toBe("syntese_til_maaling");
        expect(varmelastskift(s([SYNTESE]), s([fil("a.csv")]))).toBe("syntese_til_maaling");
        expect(varmelastskift(s([frossen(A)]), s([]))).toBe("maaling_til_syntese");
        expect(varmelastskift(s([fil("a.csv")]), s([fil("b.csv")]))).toBe("maaling_til_maaling");
        expect(varmelastskift(s([fil("a.csv")]), s([frossen(A)]))).toBe("maaling_til_maaling");
        expect(varmelastskift(s([fil("a.csv")]), s([fil("a.csv")]))).toBeNull();
        expect(varmelastskift(s([]), s([SYNTESE]))).toBeNull();
        // Arbejderen bruger filen, når både fil og "syntetisk" er frosset (den manuelle vej): det er en måling.
        expect(varmelastskift(s([]), s([SYNTESE, fil("a.csv")]))).toBe("syntese_til_maaling");
    });
    it("knappens skabelon gælder varmelasten ALENE: sammen med en anden ændring er det flere ændringer", () => {
        const p = par([SYNTESE], [frossen(A), ind("aendring", "storage.tank.enabled", "false")]);
        expect(p.knap).toBeNull();
        expect(p.flere).toBe(true);
        expect(par([SYNTESE], [frossen(A)]).knap).toBe("maalt_varmelast");
    });
});
