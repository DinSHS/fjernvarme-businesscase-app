// Efterprøvningen af rettelserne i runde 15, fund F (P2): "En anden varmelast kan stadig blive målt som README-facit."
//
// Genskabt FØR rettelsen med efterprøvningens tilfælde: Spor A-referencens opsætning, modelversion 939228a, df-data
// 106b9fc, værk i revision 1 — og en anden, frossen `_koersel.tidsserie.varmelast` (en serie gjort aktiv på værket).
// `kvalificer` læste scenariets `heat_csv`, men ikke den frosne serie, og serien står ikke som en ændring (kilde
// `aendring`): kørslen var en "måling" (`maaling: true`). Information viste "uden for tolerancen" for et objektiv
// på 5.000.000 kr., og Analyser gav mærket README-reference.
//
// Og de to visninger kunne ende hver sit sted om SAMME kørsel: omdøbt til `probe-spora` var den stadig en måling i
// Information, mens Analysers navneregel gjorde den til en røgtest.
//
// Efter rettelsen: kvalifikationen holder kørslens effektive frosne varmelast og solprofil op mod referencens
// grundlag, før en afvigelse regnes; og målingen går forud for navnereglen — samme udvælgelse begge steder.
import { describe, expect, it } from "vitest";
import type { FjvSchema } from "../../../rayfin/data/schema";
import type { InputRække } from "@/lib/data/afflad";
import { oprindelse } from "../analyser/sammensaetning";
import { byggRaekker, grundlagTekst, kvalificer, laesReferencer } from "./referencer";

type Koersel = FjvSchema["Koersel"];
type Scenarie = FjvSchema["Scenarie"];
type Vaerk = FjvSchema["Vaerk"];

const rå = (import.meta.glob("../dokumentation/indhold/viden/referencetal.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>)["../dokumentation/indhold/viden/referencetal.json"];
const refs = laesReferencer(rå);
const SPOR_A = refs.find((r) => r.id === "spora_anker")!;
/** En reference, der regnes med en af modelrepoets målte varmelastfiler. */
const MAALT = refs.find((r) => r.scenarie.heat_csv)!;

const PIN = "939228aa048563c8498382a79d207c8b03fbda57";
const DF = "106b9fce9a2e3610090b1a542559024056449b88";
const f = (sti: string, v: unknown): InputRække => ({ kilde: "scenarie", sti, vaerdi_json: JSON.stringify(v) });
/** Referencens frosne opsætning, som en bestilling fryser den. */
function opsaetning(r = SPOR_A): InputRække[] {
    const s = r.scenarie;
    return [
        f("_koersel.med_balancering", s.med_balancering),
        ...(s.periode_start ? [f("_koersel.start", s.periode_start)] : []), ...(s.periode_slut ? [f("_koersel.slut", s.periode_slut)] : []),
        ...(s.balancing_method ? [f("_koersel.balancing_method", s.balancing_method)] : []),
        ...(s.ekstra_flag ? [f("_koersel.ekstra_flag", s.ekstra_flag.split(" "))] : []),
        ...(s.heat_csv ? [f("_koersel.heat_csv", s.heat_csv)] : []),
    ];
}
const serie = (rolle: "varmelast" | "solprofil", sha = "a") => f(`_koersel.tidsserie.${rolle}`, { id: "11111111-1111-4111-8111-111111111111", sha256: sha.repeat(64) });
const vaerk = (r = SPOR_A, pin = PIN) => ({ id: "v", kode: r.kode, kilde: "repo", repo_commit: pin }) as Vaerk;
const koersel = (objektiv_dkk: number | undefined, over: Partial<Koersel> = {}, r = SPOR_A) => ({
    id: "k", vaerk_id: "v", scenarie_id: "s", status: "faerdig", objektiv_dkk, model_commit: r.modelCommits?.at(-1) ?? PIN, data_commit: DF, vaerk_revision: 1,
    // P2-6 (tredje rettelsesrunde): en måling er en afsluttet løsning — status optimal og et opnået gab inden for casens.
    solve_status: "optimal", opnaaet_gap: 0.0001,
    afsluttet: new Date("2026-11-23T07:32:12Z"), bestilt: new Date("2026-11-23T07:29:42Z"), ...over,
}) as Koersel;
/** Samme kørsel set fra begge sider: Information › Referencetal og Analysers mærke i kørselslisten. */
function beggeVisninger(k: Koersel, input: InputRække[], navn = "Spor A-anker", r = SPOR_A) {
    const v = vaerk(r, r.modelCommits?.at(-1) ?? PIN);
    const række = byggRaekker(refs, [v], [k], new Map([[k.id, input]])).find((x) => x.ref.id === r.id)!;
    const mærke = oprindelse(k, { id: "s", navn, med_balancering: r.scenarie.med_balancering } as Scenarie, r.kode, input, v);
    return { række, mærke, information: række.vurdering !== undefined, analyser: mærke.type === "readme" };
}

describe("fund F: den effektive frosne varmelast holdes op mod referencens grundlag", () => {
    it("kontrol: Spor A-ankeret er regnet uden målt varmelast (syntesen), og referencen er en måling uden frosne serier", () => {
        expect(SPOR_A.scenarie.heat_csv).toBeNull();
        expect(kvalificer(SPOR_A, koersel(5_204_555), opsaetning(), vaerk())).toMatchObject({ grundlag: true, maaling: true });
    });
    it("efterprøvningens tilfælde: en anden aktiv, frossen varmelast-tidsserie er IKKE README's grundlag", () => {
        const input = [...opsaetning(), serie("varmelast")];
        const k = koersel(5_000_000);
        const q = kvalificer(SPOR_A, k, input, vaerk());
        // Før rettelsen: maaling: true — serien står hverken i heat_csv eller som en ændring.
        expect(q).toMatchObject({ opsaetning: true, uaendret: true, version: true, vaerk: true, data: true, grundlag: false, maaling: false });
        const b = beggeVisninger(k, input);
        expect([b.information, b.analyser]).toEqual([false, false]);         // før: [true, true] — "uden for tolerancen" og README-reference
        expect([b.række.tilstand, b.række.vurdering]).toEqual(["andet-grundlag", undefined]);
        expect(grundlagTekst(q)).toMatch(/varmelast/);
        expect(grundlagTekst(q)).toMatch(/tidsserie aaaaaaaaaaaa/);
    });
    it("en reference med målt varmelast: netop dens fil er grundlaget — ikke en tidsserie i stedet", () => {
        expect(MAALT.scenarie.heat_csv).toBeTruthy();
        const pin = MAALT.modelCommits?.at(-1) ?? PIN;
        const k = koersel(MAALT.objektiv, {}, MAALT);
        expect(kvalificer(MAALT, k, opsaetning(MAALT), vaerk(MAALT, pin))).toMatchObject({ grundlag: true, maaling: true });
    });
});

describe("fund F: en solprofil, der faktisk bruges, får samme kontrol", () => {
    const brug = (hvor: "anvendt" | "ubrugt") => JSON.stringify({ tidsserier: { anvendt: {}, ubrugt: {}, [hvor]: { solprofil: { id: "x", sha256: "a".repeat(64) } } } });
    const input = [...opsaetning(), serie("solprofil")];

    it("en frossen solprofil-tidsserie, som kørslen BRUGTE, er ikke Spor A-casens grundlag (casen har ingen solprofil)", () => {
        const q = kvalificer(SPOR_A, koersel(5_204_555, { manifest_json: brug("anvendt") }), input, vaerk());
        expect(q).toMatchObject({ grundlag: false, maaling: false });       // før: maaling: true
        expect(grundlagTekst(q)).toMatch(/solprofil/);
    });
    it("frosset, men ikke brugt af nogen enhed (kørslens manifest siger det): modellen er uændret, og kørslen er en måling", () => {
        expect(kvalificer(SPOR_A, koersel(5_204_555, { manifest_json: brug("ubrugt") }), input, vaerk())).toMatchObject({ grundlag: true, maaling: true });
    });
    it("siger manifestet ikke, om serien blev brugt (ældre kørsler), kan grundlaget ikke bekræftes", () => {
        expect(kvalificer(SPOR_A, koersel(5_204_555), input, vaerk())).toMatchObject({ grundlag: false, maaling: false });
    });
    it("referencens egen solprofil (dens sha256 står på referencen) er grundlaget", () => {
        const medSol = { ...SPOR_A, solprofilSha256: "a".repeat(64) };
        expect(kvalificer(medSol, koersel(5_204_555, { manifest_json: brug("anvendt") }), input, vaerk())).toMatchObject({ grundlag: true, maaling: true });
        expect(kvalificer(medSol, koersel(5_204_555, { manifest_json: brug("anvendt") }), [...opsaetning(), serie("solprofil", "b")], vaerk())).toMatchObject({ grundlag: false });
        // Uden en frossen solprofil-tidsserie læser enheden værkets egen profilsti (sådan er kørsler fra før runde 15
        // frosset); at værket er repo-casen uændret, er sit eget krav.
        expect(kvalificer(medSol, koersel(5_204_555), opsaetning(), vaerk())).toMatchObject({ grundlag: true });
    });
    it("Andeby-referencerne bærer den målte hash af casens egen solprofil — og en kørsel med netop den er en måling", () => {
        const ANDEBY = refs.find((r) => r.id === "andeby_helaar_spot")!;
        // data/solar_andeby_dmi_karup.csv i appens normaliserede form, målt 23. november 2026 (samme fil ved eef950a,
        // 90fb16e og 939228a); fabric/tests/test_tidsserier.py holder tallet op mod modelrepoet.
        expect(ANDEBY.solprofilSha256).toBe("35706793bf4dd9c81d88c2b045e39ef9866c17ccfb86e0703067fb42a9e93f29");
        expect(refs.filter((r) => r.solprofilSha256).map((r) => r.id).sort()).toEqual(["andeby_helaar_bal", "andeby_helaar_spot"]);
        const pin = ANDEBY.modelCommits!.at(-1)!;
        const egen = f("_koersel.tidsserie.solprofil", { id: "22222222-2222-4222-8222-222222222222", sha256: ANDEBY.solprofilSha256 });
        const k = koersel(ANDEBY.objektiv, { manifest_json: brug("anvendt") }, ANDEBY);
        expect(kvalificer(ANDEBY, k, [...opsaetning(ANDEBY), egen], vaerk(ANDEBY, pin))).toMatchObject({ grundlag: true, maaling: true });
        // En uploadet solprofil gjort aktiv på Andeby er et andet grundlag.
        expect(kvalificer(ANDEBY, k, [...opsaetning(ANDEBY), serie("solprofil", "b")], vaerk(ANDEBY, pin))).toMatchObject({ grundlag: false, maaling: false });
    });
});

describe("fund F: samme udvælgelsesregel for målingen og røgtestmærket, i Information og Analyser", () => {
    it("en kvalificeret kørsel omdøbt til 'probe-spora' er en måling BEGGE steder (før: måling i Information, Røgtest i Analyser)", () => {
        const b = beggeVisninger(koersel(5_204_555), opsaetning(), "probe-spora");
        expect([b.information, b.analyser]).toEqual([true, true]);
        expect(b.mærke.type).toBe("readme");
    });
    it("en teknisk testkørsel, der IKKE er en måling, er stadig en røgtest", () => {
        const b = beggeVisninger(koersel(5_000_000), [...opsaetning(), serie("varmelast")], "probe-spora");
        expect([b.information, b.analyser, b.mærke.type]).toEqual([false, false, "roegtest"]);
        expect(oprindelse(koersel(1), { id: "s", navn: "Test K5 kvote", med_balancering: false } as Scenarie, "andeby", [], vaerk()).type).toBe("roegtest");
    });
    it("en kørsel, der ikke er færdig, er ikke en måling nogen af stederne — heller ikke med referencens opsætning", () => {
        const k = koersel(undefined, { status: "fejl" });
        const b = beggeVisninger(k, opsaetning());
        expect([b.information, b.analyser]).toEqual([false, false]);         // før: Analyser gav README-reference til en fejlet kørsel
        expect(kvalificer(SPOR_A, k, opsaetning(), vaerk())).toMatchObject({ faerdig: false, maaling: false });
    });
    it("de to visninger er enige for hvert tilfælde ovenfor", () => {
        const tilfaelde: [Koersel, InputRække[], string][] = [
            [koersel(5_204_555), opsaetning(), "Spor A"], [koersel(5_204_555), opsaetning(), "probe-spora"], [koersel(5_204_555), opsaetning(), "F2 Spor A kontrol"],
            [koersel(5_000_000), [...opsaetning(), serie("varmelast")], "Spor A"], [koersel(5_204_555), [...opsaetning(), serie("solprofil")], "Spor A"],
            [koersel(undefined, { status: "fejl" }), opsaetning(), "Spor A"], [koersel(5_204_555, { vaerk_revision: 2 }), opsaetning(), "Test K3"],
        ];
        for (const [k, input, navn] of tilfaelde) { const b = beggeVisninger(k, input, navn); expect([navn, b.analyser]).toEqual([navn, b.information]); }
    });
});
