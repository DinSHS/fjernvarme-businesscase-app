import { describe, expect, it } from "vitest";
import type { FjvSchema } from "../../../rayfin/data/schema";
import type { InputRække } from "@/lib/data/afflad";
import { oprindelse } from "../analyser/sammensaetning";
import { byggRaekker, frossenOpsaetning, grundlagTekst, kandidatKoersler, kandidater, kørslensGab, laesReferencer, sporBBudskab, toleranceFor, versionsTekst, vurder, type SporB } from "./referencer";
import { gabTekst, signedKr, signedProcent } from "./tal";

type Koersel = FjvSchema["Koersel"];
type Scenarie = FjvSchema["Scenarie"];
type Vaerk = FjvSchema["Vaerk"];

const rå = (import.meta.glob("../dokumentation/indhold/viden/referencetal.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>)["../dokumentation/indhold/viden/referencetal.json"];
const refs = laesReferencer(rå);
const ref = (id: string) => refs.find((r) => r.id === id)!;

/** Et værk som modelrepoets case uændret, importeret ved `repo_commit`. */
const vaerk = (id: string, kode: string, repo_commit: string) => ({ id, kode, kilde: "repo", repo_commit }) as Vaerk;
// Kørslerne er regnet ved eef950a (de fire README-tal fra før spotrettelsen), medmindre testen siger andet.
const EEF950A = "eef950a2ac7b3808a9456dcf48742ce08e52366a";
// Runde 15: ved modelrepoets 939228a er README's Spor A-anker regnet igen efter spotrettelsen (5.204.555, README.md:185 og
// fodnote ³); de fire øvrige tal er stadig fra før. Referencen bærer derfor sin egen liste af versioner (regnet_ved), og
// en kørsel ved appens pins efter rettelsen (90fb16e, 939228a) er en måling af tallet — en ved eef950a er det ikke.
const N90 = "90fb16eb1e2d5aa8e619b5a951b93760fa803985";
const PIN = "939228aa048563c8498382a79d207c8b03fbda57";
const koersel = (id: string, vaerk_id: string, scenarie_id: string, objektiv_dkk: number | undefined, over: Partial<Koersel> = {}) =>
    ({ id, vaerk_id, scenarie_id, status: "faerdig", objektiv_dkk, model_commit: EEF950A, data_commit: "106b9fce9a2e3610090b1a542559024056449b88", vaerk_revision: 1,
        // P2-6 (tredje rettelsesrunde): en måling er en afsluttet løsning — status optimal og et opnået gab inden for casens.
        solve_status: "optimal", opnaaet_gap: 0.0001,
        afsluttet: new Date("2026-10-26T07:32:12Z"), bestilt: new Date("2026-10-26T07:29:42Z"), ...over }) as Koersel;

describe("README-referencerne", () => {
    it("indlæser de fem tal fra README, med de rigtige beløb og værker", () => {
        expect(refs.map((r) => r.id)).toEqual(["spora_anker", "sporb", "billund_rullende", "andeby_helaar_bal", "andeby_helaar_spot"]);
        expect(ref("spora_anker")).toMatchObject({ kode: "billund_spora", objektiv: 5204555, toleranceKr: 26023, modelCommit: N90, modelCommits: [N90, PIN] });
        expect(ref("sporb")).toMatchObject({ kode: "billund_sporb", objektiv: 4204128, modelCommit: EEF950A, modelCommits: [EEF950A] });
        expect(refs.filter((r) => r.id !== "spora_anker").every((r) => r.modelCommits?.join() === EEF950A)).toBe(true);
    });
    it("fodnoten siger, hvilken version hvert tal er regnet ved — den fælles først, undtagelsen ved navn", () => {
        expect(versionsTekst(refs)).toBe("eef950a; Spor A-anker: 90fb16e eller 939228a");
        expect(versionsTekst(refs.filter((r) => r.id !== "spora_anker"))).toBe("eef950a");
        expect(versionsTekst(refs.map((r) => ({ ...r, modelCommit: null, modelCommits: null })))).toBeUndefined();
    });
    it("en fil uden regnet_ved pr. reference læses som før: alle ved filens model_commit", () => {
        const uden = JSON.parse(rå) as { grupper: { id: string; referencer: Record<string, unknown>[] }[] };
        for (const r of uden.grupper.find((g) => g.id === "readme")!.referencer) delete r.regnet_ved;
        expect(laesReferencer(JSON.stringify(uden)).every((r) => r.modelCommits?.join() === EEF950A)).toBe(true);
        expect(ref("billund_rullende").scenarie.heat_csv).toBe("billund_abvaerk_hourly_splejset_jun2026.csv");
    });
    it("Andeby med balancering er optimal inden for casens gab (eef950a) — tolerancen er casens 0,1 % af tallet", () => {
        const r = ref("andeby_helaar_bal");
        expect(r.objektiv).toBe(24188471);
        expect(toleranceFor(r)).toBe(24188); // 24.188.471 × 0,1 %
    });
    it("uden kronebeløb falder tolerancen tilbage på et opnået gab af objektivet", () => {
        expect(toleranceFor({ ...ref("andeby_helaar_bal"), toleranceKr: null, gabPct: 0.12 })).toBe(29026); // 24.188.471 × 0,12 %
    });
    it("afviser en fil uden README-gruppen", () => {
        expect(() => laesReferencer('{"grupper":[]}')).toThrow(/readme/);
    });
});

describe("vurdering mod README", () => {
    it("Spor A-ankeret: en kørsel 28,67 kr. under README 5.204.555 er −0,0006 % og inden for tolerancen", () => {
        const v = vurder(ref("spora_anker"), 5204555 - 28.6676);
        expect(Math.round(v.diff)).toBe(-29);
        expect(signedKr(v.diff)).toBe("−29");
        expect(signedProcent(v.brøk)).toBe("−0,0006 %");
        expect(v.indenfor).toBe(true);
        expect(v.tolerance).toBe(26023);                 // casens gab 0,5 % af 5.204.555
    });
    it("uden for tolerancen, når afvigelsen er større end det README tillader", () => {
        expect(vurder(ref("spora_anker"), 5204555 + 26024).indenfor).toBe(false);
        expect(vurder(ref("spora_anker"), 5204555 - 26023).indenfor).toBe(true);
    });
    it("målingen ved 939228a (5.204.555,28) ligger 0,28 kr. over README's tal", () => {
        const v = vurder(ref("spora_anker"), 5204555.28);
        expect(v.indenfor).toBe(true);
        expect(signedKr(v.diff)).toBe("0");
    });
    it("lille afvigelse vises med nok decimaler til at kunne ses", () => {
        expect(signedProcent(0)).toBe("0,0 %");
        expect(signedProcent(0.0123)).toBe("+1,23 %");
        expect(signedProcent(-0.0456)).toBe("−4,56 %");
        expect(signedProcent(-0.0006)).toBe("−0,060 %");
    });
});

// Kodegennemgangen af runde 15, fund 6: kvalifikationen læser det FROSNE input (ikke det levende scenarie og dets
// nuværende antal ændringer) og er den samme som Analysers README-mærke. Testene nedenfor er de gamle, skrevet om til
// det frosne input; de nye står sidst i blokken.
/** Det frosne input, som en bestilling fryser det: opsætningen (`_koersel.*`), solverens indstillinger og `aendringer` scenarieændringer. */
function frosset(o: Partial<Scenarie> = {}, aendringer = 0): InputRække[] {
    const f = (sti: string, v: unknown): InputRække => ({ kilde: "scenarie", sti, vaerdi_json: JSON.stringify(v) });
    return [
        f("_koersel.med_balancering", o.med_balancering ?? true),
        ...(o.periode_start ? [f("_koersel.start", o.periode_start)] : []), ...(o.periode_slut ? [f("_koersel.slut", o.periode_slut)] : []),
        ...(o.balancing_method ? [f("_koersel.balancing_method", o.balancing_method)] : []),
        ...(o.ekstra_flag ? [f("_koersel.ekstra_flag", o.ekstra_flag.split(" "))] : []),
        ...(o.heat_csv ? [f("_koersel.heat_csv", o.heat_csv)] : []),
        ...(o.mip_rel_gap != null ? [f("solver.mip_rel_gap", o.mip_rel_gap)] : []), ...(o.mip_abs_gap != null ? [f("solver.mip_abs_gap", o.mip_abs_gap)] : []),
        ...(o.tidsgraense_s != null ? [f("solver.time_limit", o.tidsgraense_s)] : []),
        ...Array.from({ length: aendringer }, (_, i): InputRække => ({ kilde: "aendring", sti: `storage.tank${i}.enabled`, vaerdi_json: "false" })),
    ];
}
/** Kørsler med hver sit frosne input: [kørsel, input]. */
const medInput = (par: readonly (readonly [Koersel, InputRække[]])[]) => ({ k: par.map(([k]) => k), input: new Map(par.map(([k, i]) => [k.id, i])) });

describe("hvilken kørsel er referencen", () => {
    // Værkerne er modelrepoets cases uændret, importeret ved den version, deres README-tal er regnet ved.
    const vaerker = [vaerk("v-bil", "billund_spora", PIN), vaerk("v-and", "andeby", EEF950A)];
    /** En kørsel af Spor A ved appens pin (939228a) — den version, README's Spor A-tal kan måles ved. */
    const kA = (id: string, objektiv_dkk: number | undefined, over: Partial<Koersel> = {}) =>
        koersel(id, "v-bil", "s", objektiv_dkk, { model_commit: PIN, ...over });
    const REN = frosset(), TANK = frosset({}, 1);
    const grund = medInput([
        [kA("k-ren", 5204555.28), REN],
        [kA("k-uden", 5300000), frosset({ med_balancering: false })],
        [kA("k-vindue", 1000000), frosset({ periode_start: "2026-03-01" })],
        [kA("k-fejl", undefined, { status: "fejl" }), REN],
        [koersel("k-andet-vaerk", "v-and", "s", 1, { model_commit: PIN }), REN],
    ]);
    const anker = (par: readonly (readonly [Koersel, InputRække[]])[]) => { const m = medInput(par); return byggRaekker(refs, vaerker, m.k, m.input).find((x) => x.ref.id === "spora_anker")!; };

    it("samme værk og samme opsætning — ikke en kørsel uden balancering, med andet vindue, fejlet eller af et andet værk", () => {
        expect(kandidater(ref("spora_anker"), vaerker, grund.k, grund.input).map((x) => x.koersel.id)).toEqual(["k-ren"]);
    });
    it("en kørsel ved en ældre modelversion (b49aeb0, før rettelserne 19/10) er ikke en måling af README-tallet", () => {
        const gammel = koersel("k-gammel", "v-bil", "s", 4698361.33, { model_commit: "b49aeb0af097be42938b80a0fea6acdd77162836", afsluttet: new Date("2026-10-29T00:00:00Z") });
        const r = anker([[gammel, REN]]);
        expect(r.tilstand).toBe("anden-version");
        expect(r.vurdering).toBeUndefined();
    });
    // Codex-review ved 90fb16e: en gennemført kørsel ved en anden modelversion end README-tallets stod som "ikke kørt endnu".
    // Den er kørt — bare ved en version, tallet ikke kan måles ved. Status skal sige præcis det. Ved 939228a er det for Spor A
    // en kørsel ved eef950a (README's gamle tal 5.069.729), og for de fire tal fra før spotrettelsen en kørsel ved pinnen.
    it("Spor A: en kørsel ved eef950a er 'anden-version' — med kørslen, uden afvigelse eller tolerance", () => {
        const gammel = koersel("k-eef", "v-bil", "s", 5069729.03, { afsluttet: new Date("2026-11-20T10:42:18Z") });
        const r = anker([[gammel, REN]]);
        expect(r.tilstand).toBe("anden-version");
        expect(r.kandidat?.koersel.id).toBe("k-eef");
        expect(r.vurdering).toBeUndefined();
        expect(kandidatKoersler(refs, vaerker, [gammel]).map((k) => k.id)).toEqual(["k-eef"]);   // dens frosne input skal også hentes
        // en kørsel ved README-tallets version vinder, også når den anden er nyere
        const begge = anker([[gammel, REN], [kA("k-ren", 5204555.28), REN]]);
        expect([begge.tilstand, begge.kandidat?.koersel.id]).toEqual(["indenfor", "k-ren"]);
        // Codex-efterreview: en ÆNDRET kørsel ved README-tallets version må ikke skjule en REN ved en anden version
        const blandet = anker([[kA("k-tank-pin", 9999999), TANK], [gammel, REN]]);
        expect([blandet.tilstand, blandet.kandidat?.koersel.id]).toEqual(["anden-version", "k-eef"]);
        // ved en anden version med ændringer i scenariet: ikke referencen
        expect(anker([[gammel, TANK]]).tilstand).toBe("aendret");
    });
    it("Spor A: en kørsel ved 90fb16e eller 939228a er en måling af README's tal efter spotrettelsen", () => {
        for (const version of [N90, PIN]) {
            const r = anker([[kA("k-ny", 5204555.28, { model_commit: version }), REN]]);
            expect([r.tilstand, r.kandidat?.koersel.id, Math.round(r.vurdering!.diff)], version).toEqual(["indenfor", "k-ny", 0]);
        }
    });
    it("de fire tal fra før spotrettelsen: en kørsel ved pinnen er stadig 'anden-version' (Andeby helår uden balancering)", () => {
        const vedPin = koersel("k-d11", "v-and", "s", 30495430.9, { model_commit: PIN, oensket_rel_gap: 0.001, oensket_abs_gap: 1000 });
        const m = medInput([[vedPin, frosset({ med_balancering: false })]]);
        // Også når værket (som i en installation ved pinnen) er importeret ved pinnen: det er versionen, der skiller.
        for (const importeret of [EEF950A, PIN]) {
            const r = byggRaekker(refs, [vaerk("v-and", "andeby", importeret)], m.k, m.input).find((x) => x.ref.id === "andeby_helaar_spot")!;
            expect([r.tilstand, r.kandidat?.koersel.id, r.vurdering], importeret).toEqual(["anden-version", "k-d11", undefined]);
        }
    });
    it("nyeste kørsel først", () => {
        const nyere = kA("k-ny", 5204600, { afsluttet: new Date("2026-10-27T00:00:00Z") });
        const m = medInput([[kA("k-ren", 5204555.28), REN], [nyere, REN]]);
        expect(kandidater(ref("spora_anker"), vaerker, m.k, m.input).map((x) => x.koersel.id)).toEqual(["k-ny", "k-ren"]);
    });
    it("en kørsel med frosne ændringer er ikke referencen — selv om dens opsætning er ens", () => {
        const tank = kA("k-tank", 9999999, { afsluttet: new Date("2026-10-28T00:00:00Z") });
        const r = anker([[kA("k-ren", 5204555.28), REN], [tank, TANK]]);
        expect(r.kandidat?.koersel.id).toBe("k-ren"); // den nyeste TANK-kørsel springes over, den ældre rene bruges
        expect(r.tilstand).toBe("indenfor");
    });
    it("kun ændrede kørsler: tilstanden siger det, og der regnes ingen afvigelse", () => {
        const r = anker([[kA("k-tank", 9999999), frosset({}, 2)]]);
        expect(r.tilstand).toBe("aendret");
        expect(r.vurdering).toBeUndefined();
    });
    it("ingen kørsel: ikke kørt; uden for tolerancen: udenfor", () => {
        expect(byggRaekker(refs, vaerker, [], new Map()).every((r) => r.tilstand === "ikke-koert")).toBe(true);
        expect(anker([[kA("k-skæv", 5150000), REN]]).tilstand).toBe("udenfor");
    });

    // ---- gennemgangens fund 6 --------------------------------------------------------------------------------
    it("fund 6: en ændret Spor A-case (værk i revision 2) med ukendt df-data dømmes ikke mod README-tallet (før: 'uden for tolerancen')", () => {
        const k = kA("k-rev2", 5_400_000, { vaerk_revision: 2, data_commit: "f".repeat(40) });
        const r = anker([[k, REN]]);
        expect([r.tilstand, r.vurdering]).toEqual(["andet-grundlag", undefined]);
        expect(r.kandidat?.kvalifikation).toMatchObject({ opsaetning: true, uaendret: true, version: true, vaerk: false, data: false, maaling: false });
        expect(grundlagTekst(r.kandidat!.kvalifikation)).toMatch(/værket er ikke modelrepoets case uændret.*df-data/);
        // Hver for sig: kun værket rettet, kun df-data ukendt, og et værk oprettet i appen (kopi) — ingen af dem er README's grundlag.
        expect(anker([[kA("k1", 5_204_555, { vaerk_revision: 2 }), REN]]).tilstand).toBe("andet-grundlag");
        expect(anker([[kA("k2", 5_204_555, { data_commit: "f".repeat(40) }), REN]]).tilstand).toBe("andet-grundlag");
        const m = medInput([[kA("k3", 5_204_555), REN]]);
        expect(byggRaekker(refs, [{ ...vaerk("v-bil", "billund_spora", PIN), kilde: "app" } as Vaerk], m.k, m.input).find((x) => x.ref.id === "spora_anker")!.tilstand).toBe("andet-grundlag");
    });
    it("fund 6: en kørsel med en ændring er stadig ændret, når ændringen siden er fjernet fra scenariet (før: 'ren')", () => {
        // Det levende scenarie indgår slet ikke længere: kun kørslens frosne input tæller.
        const r = anker([[kA("k-tank", 5_400_000), TANK]]);
        expect([r.tilstand, r.vurdering]).toEqual(["aendret", undefined]);
    });
    it("fund 6: en kørsel, hvis frosne input ikke kendes, kan ikke bekræftes som referencen", () => {
        expect(anker([[kA("k-uden-input", 5_204_555), []]]).tilstand).toBe("ikke-koert");
    });
    it("fund 6: Information og Analyser bruger samme kvalifikation — README-mærket i kørselslisten gives netop til en måling", () => {
        const tilfaelde: [string, Koersel, InputRække[], Vaerk][] = [
            ["måling", kA("a", 5_204_555), REN, vaerk("v-bil", "billund_spora", PIN)],
            ["anden version", kA("b", 5_069_729, { model_commit: EEF950A }), REN, vaerk("v-bil", "billund_spora", PIN)],
            ["værk rettet", kA("c", 5_204_555, { vaerk_revision: 2 }), REN, vaerk("v-bil", "billund_spora", PIN)],
            ["df-data ukendt", kA("d", 5_204_555, { data_commit: "f".repeat(40) }), REN, vaerk("v-bil", "billund_spora", PIN)],
            ["frossen ændring", kA("e", 5_204_555), TANK, vaerk("v-bil", "billund_spora", PIN)],
            ["anden opsætning", kA("f", 5_204_555), frosset({ med_balancering: false }), vaerk("v-bil", "billund_spora", PIN)],
            ["løsere gab", kA("g", 5_204_555, { oensket_rel_gap: 0.05 }), REN, vaerk("v-bil", "billund_spora", PIN)],
            ["værk importeret ved en anden version", kA("h", 5_204_555), REN, vaerk("v-bil", "billund_spora", EEF950A)],
        ];
        for (const [navn, k, input, v] of tilfaelde) {
            const r = byggRaekker(refs, [v], [k], new Map([[k.id, input]])).find((x) => x.ref.id === "spora_anker")!;
            const maalt = r.vurdering !== undefined;
            const maerke = oprindelse(k, { id: "s", navn: "Min kørsel", med_balancering: true } as Scenarie, "billund_spora", input, v).type === "readme";
            expect([navn, maalt, maerke]).toEqual([navn, navn === "måling", navn === "måling"]);
        }
    });
});

describe("Spor B mod Billunds afregning", () => {
    const { validering_billund } = JSON.parse(rå) as { validering_billund: SporB };
    it("budskabet bruger README's gældende validering efter rettelserne 19/10 (eef950a), ikke rapportens tabel", () => {
        expect(validering_billund.gaeldende).toMatchObject({ i_alt_pct: 120, afrr_pct: 109, mfrr_pct: 129 });
        expect(sporBBudskab(validering_billund)).toBe("Modellen ramte 120 % af Billunds realiserede balanceindtægt (aFRR 109 %, mFRR 129 %) efter rettelserne 19. oktober 2026.");
    });
    it("uden gældende validering regnes budskabet af tabellen: samlet forhold og størst afvigelse", () => {
        expect(sporBBudskab({ ...validering_billund, gaeldende: undefined })).toBe("Modellen ramte 121 % af Billunds realiserede balanceindtægt; størst afvigelse: mFRR, kapacitet (139 %).");
    });
    it("hver række er kapacitet + aktivering = i alt (som tabellens egen note påstår)", () => {
        const r = (p: string) => validering_billund.raekker.find((x) => x.post === p)!;
        expect(r("aFRR, kapacitet").model + r("aFRR, aktivering (netto)").model).toBe(r("aFRR i alt").model);
        expect(r("mFRR, kapacitet").model + r("mFRR, aktivering (netto)").model).toBe(r("mFRR i alt").model);
        expect(r("aFRR i alt").model + r("mFRR i alt").model).toBe(r("I alt").model);
    });
});

// I1 (fagligt review): en kørsel med SAMME ELLER STRAMMERE gab er en måling af README-tallet. Tallene er de rigtige demo-kørsler:
// D09 Billund Spor B (README 4.204.128; casens gab 0,5 % / 5.000 kr.; demo 0,02 % / 1.000 kr.) og D11 Andeby helår uden balance,
// begge målt 2026-10-26 ved eef950a (viden/demo_scenarier.json › koersel_status_eef950a).
describe("gab: samme eller strammere (I1)", () => {
    const sporB = ref("sporb");
    const vaerker = [vaerk("v-b", "billund_sporb", EEF950A), vaerk("v-a", "andeby", EEF950A)];
    const csv = "billund_abvaerk_hourly_splejset_jun2026.csv";
    // D09's frosne opsætning: Spor B's varmelast, strammere gab og en tidsgrænse.
    const D09 = frosset({ heat_csv: csv, mip_rel_gap: 0.0002, mip_abs_gap: 1000, tidsgraense_s: 1800 });
    const kand = (r: typeof sporB, k: Koersel, input: InputRække[]) => kandidater(r, vaerker, [k], new Map([[k.id, input]]));

    it("README-gruppens referencer kender casens eget gab", () => {
        expect(sporB.caseGab).toEqual({ rel: 0.005, abs: 5000 });
        expect(ref("andeby_helaar_spot").caseGab).toEqual({ rel: 0.001, abs: 1000 });
    });

    it("D09: Spor B kørt med strammere gab (og en tidsgrænse) tæller — afvigelse under 1 kr. — og gabet vises", () => {
        const k = koersel("k-d09", "v-b", "s-d09", 4204128.43, { oensket_rel_gap: 0.0002, oensket_abs_gap: 1000, opnaaet_gap: 0.000185 });
        const [x] = kand(sporB, k, D09);
        expect(x.koersel.id).toBe("k-d09");
        expect(x.gab).toMatchObject({ rel: 0.0002, abs: 1000, opnaaet: 0.000185, erTilladt: true, erStrammere: true });
        const r = byggRaekker(refs, vaerker, [k], new Map([[k.id, D09]])).find((y) => y.ref.id === "sporb")!;
        expect(r.tilstand).toBe("indenfor");
        expect(Math.abs(r.vurdering!.diff)).toBeLessThan(1);
        expect(gabTekst(x.gab.rel, x.gab.abs)).toBe("0,02 % og 1.000 kr.");
    });

    it("D11: Andeby helår uden balance på værkets eget gab tæller, også med en frossen tidsgrænse", () => {
        const input = frosset({ med_balancering: false, tidsgraense_s: 3600 });
        const k = koersel("k-d11", "v-a", "s-d11", 30431535.06, { oensket_rel_gap: 0.001, oensket_abs_gap: 1000 });
        const [x] = kand(ref("andeby_helaar_spot"), k, input);
        expect(x.gab.erStrammere).toBe(false);
        const r = byggRaekker(refs, vaerker, [k], new Map([[k.id, input]])).find((y) => y.ref.id === "andeby_helaar_spot")!;
        expect(r.tilstand).toBe("indenfor");
        expect(signedKr(r.vurdering!.diff)).toBe("0");
    });

    it("et LØSERE gab end casens tæller ikke — hverken relativt eller absolut — og samme gab er ikke 'strammere'", () => {
        const løs = (over: Partial<Koersel>) => kand(sporB, koersel("k", "v-b", "s-d09", 4204128, over), D09);
        expect(løs({ oensket_rel_gap: 0.01, oensket_abs_gap: 1000 })).toHaveLength(0);
        expect(løs({ oensket_rel_gap: 0.0002, oensket_abs_gap: 10000 })).toHaveLength(0);
        const lige = løs({ oensket_rel_gap: 0.005, oensket_abs_gap: 5000 });
        expect(lige).toHaveLength(1);
        expect(lige[0].gab.erStrammere).toBe(false);
    });

    it("kun det ene gab strammere: tæller, og er 'strammere'", () => {
        const [k1] = kand(sporB, koersel("k", "v-b", "s-d09", 4204128, { oensket_rel_gap: 0.005, oensket_abs_gap: 100 }), D09);
        expect(k1.gab).toMatchObject({ erTilladt: true, erStrammere: true });
    });

    it("opsætningen skal stadig være ens: andet vindue, anden varmelast eller anden balancering tæller ikke, uanset gab", () => {
        const gabOk = { oensket_rel_gap: 0.0002, oensket_abs_gap: 1000 };
        for (const over of [{ periode_start: "2026-03-09" }, { heat_csv: "andet.csv" }, { med_balancering: false }, { balancing_method: "legacy" }, { ekstra_flag: "--legacy-nettab" }] as Partial<Scenarie>[]) {
            expect(kand(sporB, koersel("k", "v-b", "s-x", 4204128, gabOk), frosset({ heat_csv: csv, ...over })), JSON.stringify(over)).toHaveLength(0);
        }
    });

    it("kørslens gab: rækkens frosne først, ellers det frosne inputs, ellers casens", () => {
        const s = frossenOpsaetning(frosset({ heat_csv: csv, mip_rel_gap: 0.0002 }));
        expect(kørslensGab(koersel("k", "v-b", "s", 1, { oensket_rel_gap: 0.001 }), s, sporB)).toMatchObject({ rel: 0.001, abs: 5000 });
        expect(kørslensGab(koersel("k", "v-b", "s", 1, {}), s, sporB)).toMatchObject({ rel: 0.0002, abs: 5000, erStrammere: true });
        expect(kørslensGab(koersel("k", "v-b", "s", 1, {}), frossenOpsaetning(frosset()), sporB)).toMatchObject({ rel: 0.005, abs: 5000, erStrammere: false });
    });
});
