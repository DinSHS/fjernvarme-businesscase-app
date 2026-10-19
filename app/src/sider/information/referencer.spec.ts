import { describe, expect, it } from "vitest";
import type { FjvSchema } from "../../../rayfin/data/schema";
import { byggRaekker, kandidatScenarier, kandidater, kørslensGab, laesReferencer, sporBBudskab, toleranceFor, vurder, type SporB } from "./referencer";
import { gabTekst, signedKr, signedProcent } from "./tal";

type Koersel = FjvSchema["Koersel"];
type Scenarie = FjvSchema["Scenarie"];
type Vaerk = FjvSchema["Vaerk"];

const rå = (import.meta.glob("../dokumentation/indhold/viden/referencetal.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>)["../dokumentation/indhold/viden/referencetal.json"];
const refs = laesReferencer(rå);
const ref = (id: string) => refs.find((r) => r.id === id)!;

const vaerk = (id: string, kode: string) => ({ id, kode }) as Vaerk;
const scenarie = (id: string, vaerk_id: string, over: Partial<Scenarie> = {}) =>
    ({ id, vaerk_id, med_balancering: true, ...over }) as Scenarie;
const koersel = (id: string, vaerk_id: string, scenarie_id: string, objektiv_dkk: number | undefined, over: Partial<Koersel> = {}) =>
    ({ id, vaerk_id, scenarie_id, status: "faerdig", objektiv_dkk, afsluttet: new Date("2026-10-16T07:32:12Z"), bestilt: new Date("2026-10-16T07:29:42Z"), ...over }) as Koersel;

describe("README-referencerne", () => {
    it("indlæser de fem tal fra README, med de rigtige beløb og værker", () => {
        expect(refs.map((r) => r.id)).toEqual(["spora_anker", "sporb", "billund_rullende", "andeby_helaar_bal", "andeby_helaar_spot"]);
        expect(ref("spora_anker")).toMatchObject({ kode: "billund_spora", objektiv: 4698390, toleranceKr: 23492 });
        expect(ref("sporb")).toMatchObject({ kode: "billund_sporb", objektiv: 3964586 });
        expect(ref("billund_rullende").scenarie.heat_csv).toBe("billund_abvaerk_hourly_splejset_jun2026.csv");
    });
    it("Andeby med balancering har intet kronebeløb — tolerancen er det opnåede gab af objektivet", () => {
        const r = ref("andeby_helaar_bal");
        expect(r.toleranceKr).toBeNull();
        expect(toleranceFor(r)).toBe(27681); // 23.067.291 × 0,12 %
    });
    it("afviser en fil uden README-gruppen", () => {
        expect(() => laesReferencer('{"grupper":[]}')).toThrow(/readme/);
    });
});

describe("vurdering mod README", () => {
    it("Spor A-ankeret: Fabric 4.698.361 mod README 4.698.390 er −0,0006 % og inden for tolerancen", () => {
        const v = vurder(ref("spora_anker"), 4698361.3324);
        expect(Math.round(v.diff)).toBe(-29);
        expect(signedKr(v.diff)).toBe("−29");
        expect(signedProcent(v.brøk)).toBe("−0,0006 %");
        expect(v.indenfor).toBe(true);
        expect(v.tolerance).toBe(23492);
    });
    it("uden for tolerancen, når afvigelsen er større end det README tillader", () => {
        expect(vurder(ref("spora_anker"), 4698390 + 23493).indenfor).toBe(false);
        expect(vurder(ref("spora_anker"), 4698390 - 23492).indenfor).toBe(true);
    });
    it("lille afvigelse vises med nok decimaler til at kunne ses", () => {
        expect(signedProcent(0)).toBe("0,0 %");
        expect(signedProcent(0.0123)).toBe("+1,23 %");
        expect(signedProcent(-0.0456)).toBe("−4,56 %");
        expect(signedProcent(-0.0006)).toBe("−0,060 %");
    });
});

describe("hvilken kørsel er referencen", () => {
    const vaerker = [vaerk("v-bil", "billund_spora"), vaerk("v-and", "andeby")];
    const scen = [
        scenarie("s-ren", "v-bil"),
        scenarie("s-uden-bal", "v-bil", { med_balancering: false }),
        scenarie("s-tank", "v-bil"),
        scenarie("s-vindue", "v-bil", { periode_start: "2026-03-01" }),
    ];
    const k = [
        koersel("k-ren", "v-bil", "s-ren", 4698361.33),
        koersel("k-uden", "v-bil", "s-uden-bal", 5100000),
        koersel("k-vindue", "v-bil", "s-vindue", 1000000),
        koersel("k-fejl", "v-bil", "s-ren", undefined, { status: "fejl" }),
        koersel("k-andet-vaerk", "v-and", "s-ren", 1),
    ];

    it("samme værk og samme opsætning — ikke en kørsel uden balancering, med andet vindue, fejlet eller af et andet værk", () => {
        expect(kandidater(ref("spora_anker"), vaerker, scen, k).map((x) => x.koersel.id)).toEqual(["k-ren"]);
    });
    it("nyeste kørsel først", () => {
        const nyere = koersel("k-ny", "v-bil", "s-ren", 4698400, { afsluttet: new Date("2026-10-17T00:00:00Z") });
        expect(kandidater(ref("spora_anker"), vaerker, scen, [...k, nyere]).map((x) => x.koersel.id)).toEqual(["k-ny", "k-ren"]);
    });
    it("et scenarie med ændringer er ikke referencen — selv om dets felter er ens", () => {
        const tank = koersel("k-tank", "v-bil", "s-tank", 9999999, { afsluttet: new Date("2026-10-18T00:00:00Z") });
        const alle = [...k, tank];
        const ids = kandidatScenarier(refs, vaerker, scen, alle);
        expect(ids.sort()).toEqual(["s-ren", "s-tank"]);
        const rækker = byggRaekker(refs, vaerker, scen, alle, new Map([["s-tank", 1]]));
        const anker = rækker.find((r) => r.ref.id === "spora_anker")!;
        expect(anker.kandidat?.koersel.id).toBe("k-ren"); // den nyeste TANK-kørsel springes over, den ældre rene bruges
        expect(anker.tilstand).toBe("indenfor");
    });
    it("kun ændrede scenarier: tilstanden siger det, og der regnes ingen afvigelse", () => {
        const rækker = byggRaekker(refs, vaerker, scen, [koersel("k-tank", "v-bil", "s-tank", 9999999)], new Map([["s-tank", 2]]));
        const anker = rækker.find((r) => r.ref.id === "spora_anker")!;
        expect(anker.tilstand).toBe("aendret");
        expect(anker.vurdering).toBeUndefined();
    });
    it("ingen kørsel: ikke kørt; uden for tolerancen: udenfor", () => {
        expect(byggRaekker(refs, vaerker, scen, [], new Map()).every((r) => r.tilstand === "ikke-koert")).toBe(true);
        const r = byggRaekker(refs, vaerker, scen, [koersel("k-skæv", "v-bil", "s-ren", 4800000)], new Map());
        expect(r.find((x) => x.ref.id === "spora_anker")!.tilstand).toBe("udenfor");
    });
});

describe("Spor B mod Billunds afregning", () => {
    const { validering_billund } = JSON.parse(rå) as { validering_billund: SporB };
    it("budskabet regnes af tabellen: samlet forhold og størst afvigelse", () => {
        expect(sporBBudskab(validering_billund)).toBe("Modellen ramte 121 % af Billunds realiserede balanceindtægt; størst afvigelse: mFRR, kapacitet (139 %).");
    });
    it("hver række er kapacitet + aktivering = i alt (som tabellens egen note påstår)", () => {
        const r = (p: string) => validering_billund.raekker.find((x) => x.post === p)!;
        expect(r("aFRR, kapacitet").model + r("aFRR, aktivering (netto)").model).toBe(r("aFRR i alt").model);
        expect(r("mFRR, kapacitet").model + r("mFRR, aktivering (netto)").model).toBe(r("mFRR i alt").model);
        expect(r("aFRR i alt").model + r("mFRR i alt").model).toBe(r("I alt").model);
    });
});

// I1 (fagligt review): en kørsel med SAMME ELLER STRAMMERE gab er en måling af README-tallet. Tallene er de rigtige demo-kørsler:
// D09 Billund Spor B (README 3.964.586; casens gab 0,5 % / 5.000 kr.; demo 0,02 % / 1.000 kr.) og D11 Andeby helår uden balance.
describe("gab: samme eller strammere (I1)", () => {
    const sporB = ref("sporb");
    const vaerker = [vaerk("v-b", "billund_sporb"), vaerk("v-a", "andeby")];
    const csv = "billund_abvaerk_hourly_splejset_jun2026.csv";
    const d09 = scenarie("s-d09", "v-b", { heat_csv: csv, mip_rel_gap: 0.0002, mip_abs_gap: 1000, tidsgraense_s: 1800 });

    it("README-gruppens referencer kender casens eget gab", () => {
        expect(sporB.caseGab).toEqual({ rel: 0.005, abs: 5000 });
        expect(ref("andeby_helaar_spot").caseGab).toEqual({ rel: 0.001, abs: 1000 });
    });

    it("D09: Spor B kørt med strammere gab (og en tidsgrænse) tæller — afvigelse under 1 kr. — og gabet vises", () => {
        const k = koersel("k-d09", "v-b", "s-d09", 3964586.28, { oensket_rel_gap: 0.0002, oensket_abs_gap: 1000, opnaaet_gap: 0.000185 });
        const [kand] = kandidater(sporB, vaerker, [d09], [k]);
        expect(kand.koersel.id).toBe("k-d09");
        expect(kand.gab).toMatchObject({ rel: 0.0002, abs: 1000, opnaaet: 0.000185, erTilladt: true, erStrammere: true });
        const r = byggRaekker(refs, vaerker, [d09], [k], new Map()).find((x) => x.ref.id === "sporb")!;
        expect(r.tilstand).toBe("indenfor");
        expect(Math.abs(r.vurdering!.diff)).toBeLessThan(1);
        expect(gabTekst(kand.gab.rel, kand.gab.abs)).toBe("0,02 % og 1.000 kr.");
    });

    it("D11: Andeby helår uden balance på værkets eget gab tæller, også med en tidsgrænse i scenariet", () => {
        const s = scenarie("s-d11", "v-a", { med_balancering: false, tidsgraense_s: 3600 });
        const k = koersel("k-d11", "v-a", "s-d11", 30430960.12, { oensket_rel_gap: 0.001, oensket_abs_gap: 1000 });
        const [kand] = kandidater(ref("andeby_helaar_spot"), vaerker, [s], [k]);
        expect(kand.gab.erStrammere).toBe(false);
        const r = byggRaekker(refs, vaerker, [s], [k], new Map()).find((x) => x.ref.id === "andeby_helaar_spot")!;
        expect(r.tilstand).toBe("indenfor");
        expect(signedKr(r.vurdering!.diff)).toBe("−5");
    });

    it("et LØSERE gab end casens tæller ikke — hverken relativt eller absolut — og samme gab er ikke 'strammere'", () => {
        const løs = (over: Partial<Koersel>) => kandidater(sporB, vaerker, [d09], [koersel("k", "v-b", "s-d09", 3964586, over)]);
        expect(løs({ oensket_rel_gap: 0.01, oensket_abs_gap: 1000 })).toHaveLength(0);
        expect(løs({ oensket_rel_gap: 0.0002, oensket_abs_gap: 10000 })).toHaveLength(0);
        const lige = løs({ oensket_rel_gap: 0.005, oensket_abs_gap: 5000 });
        expect(lige).toHaveLength(1);
        expect(lige[0].gab.erStrammere).toBe(false);
    });

    it("kun det ene gab strammere: tæller, og er 'strammere'", () => {
        const [k1] = kandidater(sporB, vaerker, [d09], [koersel("k", "v-b", "s-d09", 3964586, { oensket_rel_gap: 0.005, oensket_abs_gap: 100 })]);
        expect(k1.gab).toMatchObject({ erTilladt: true, erStrammere: true });
    });

    it("opsætningen skal stadig være ens: andet vindue, anden varmelast eller anden balancering tæller ikke, uanset gab", () => {
        const gabOk = { oensket_rel_gap: 0.0002, oensket_abs_gap: 1000 };
        for (const over of [{ periode_start: "2026-03-09" }, { heat_csv: "andet.csv" }, { med_balancering: false }, { balancing_method: "legacy" }, { ekstra_flag: "--legacy-nettab" }] as Partial<Scenarie>[]) {
            const s = scenarie("s-x", "v-b", { heat_csv: csv, ...over });
            expect(kandidater(sporB, vaerker, [s], [koersel("k", "v-b", "s-x", 3964586, gabOk)]), JSON.stringify(over)).toHaveLength(0);
        }
    });

    it("kørslens gab: det frosne først, ellers scenariets, ellers casens", () => {
        const s = scenarie("s", "v-b", { heat_csv: csv, mip_rel_gap: 0.0002 });
        expect(kørslensGab(koersel("k", "v-b", "s", 1, { oensket_rel_gap: 0.001 }), s, sporB)).toMatchObject({ rel: 0.001, abs: 5000 });
        expect(kørslensGab(koersel("k", "v-b", "s", 1, {}), s, sporB)).toMatchObject({ rel: 0.0002, abs: 5000, erStrammere: true });
        expect(kørslensGab(koersel("k", "v-b", "s", 1, {}), scenarie("s2", "v-b"), sporB)).toMatchObject({ rel: 0.005, abs: 5000, erStrammere: false });
    });
});
