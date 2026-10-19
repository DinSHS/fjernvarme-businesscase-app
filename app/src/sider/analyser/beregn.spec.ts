import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import {
    absolutGab, aendringTekst, balanceIVindue, difference, differenceTekst, dispatchPunkter, farvepladser, feltInfo, fuldlasttimer,
    gabTekst, inputDiff, maanedstabel, produktionsvarians, profil, sammenlignelighed, sammenligningsBudskab, samlNoegletal,
    modtaget, sammenligningsRaekkefoelge, spoergsmaal, spor, vinduer, BALANCE_KOLONNER, balanceDelta, balancemarkedetsVaerdi,
    intervalTekst, profilbundne, type Koersel, type Maaned, type Noegletal, type Time,
} from "./beregn";
import { energi } from "./fmt";

// ---------------------------------------------------------------- hjælpere

let n = 0;
function nt(gruppe: string, noegle: string, vaerdi: number | null, objekt?: string, marked?: string): Noegletal {
    return { id: `n${n++}`, koersel_id: "k", gruppe, noegle, vaerdi: vaerdi ?? undefined, objekt, marked } as Noegletal;
}
function kørsel(over: Partial<Koersel> = {}): Koersel {
    return {
        id: "k", bestilling_id: "b", scenarie_id: "s", vaerk_id: "v1", vaerk_revision: 1, input_hash: "x".repeat(64),
        status: "faerdig", bestilt_af: "a@b", bestilt: new Date("2026-10-16T07:00:00Z"), forsoeg: 1, kilde: "app",
        model_commit: "b49aeb0af097be42938b80a0fea6acdd77162836", data_commit: "392992c7fe35992e79fba8d1ba7b91967e8d1481",
        oploesning: "1h", oensket_rel_gap: 0.001, oensket_abs_gap: 1000, solve_status: "optimal",
        manifest_json: JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-16", oploesning: "1h" } }),
        ...over,
    } as Koersel;
}
const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });

// ---------------------------------------------------------------- fuldlasttimer

describe("fuldlasttimer", () => {
    it("er MWh / nominel MW — ikke modellens driftsintervaller", () => {
        const s = samlNoegletal([
            nt("enhed", "produktion_mwh", 938.7, "vp_luft_vand"), nt("enhed", "p_max_mw", 4.462, "vp_luft_vand"),
            nt("enhed", "driftsintervaller", 287, "vp_luft_vand"), nt("enhed", "fuldlasttimer", 287, "vp_luft_vand"),
        ]);
        expect(s.enheder[0].fuldlasttimer).toBeCloseTo(210.3765, 3);
        expect(s.enheder[0].driftsintervaller).toBe(287);
    });
    it("er null ved p_max 0 eller manglende tal", () => {
        expect(fuldlasttimer(100, 0)).toBeNull();
        expect(fuldlasttimer(null, 4)).toBeNull();
        expect(fuldlasttimer(100, undefined)).toBeNull();
    });
});

describe("samlNoegletal", () => {
    it("holder netto og brutto adskilt pr. marked og giver null uden balancering", () => {
        const med = samlNoegletal([
            nt("balancering", "netto_dkk", 299848, undefined, "afrr"), nt("balancering", "brutto_dkk", 348016, undefined, "afrr"),
            nt("balancering", "netto_dkk", 247353, undefined, "mfrr"), nt("balancering", "brutto_dkk", 316031, undefined, "mfrr"),
            nt("balancering", "netto_dkk", 547201), nt("balancering", "brutto_dkk", 664048),
        ]);
        expect(med.balance?.afrr).toMatchObject({ netto: 299848, brutto: 348016 });
        expect(med.balance?.i_alt).toMatchObject({ netto: 547201, brutto: 664048 });
        expect(med.balance?.harProdukter).toBe(false);
        const uden = samlNoegletal([nt("balancering", "netto_dkk", null), nt("objektiv", "objektiv_dkk", 1)]);
        expect(uden.balance).toBeNull();
    });
    it("tankarbitrage er null (ikke tilgængelig), aldrig 0", () => {
        expect(samlNoegletal([nt("lager", "tank_arbitrage_dkk", null)]).tank_arbitrage_dkk).toBeNull();
    });
    it("sorterer enheder efter produktion", () => {
        const s = samlNoegletal([nt("enhed", "produktion_mwh", 10, "a"), nt("enhed", "produktion_mwh", 30, "b")]);
        expect(s.enheder.map((e) => e.navn)).toEqual(["b", "a"]);
    });
});

// ---------------------------------------------------------------- gab og tolerance

describe("absolutGab", () => {
    it("bruger |objektiv − best bound| (Billund Spor A, målt)", () => {
        const g = absolutGab(kørsel({ objektiv_dkk: 4698361.3324, best_bound: 4696006.51, opnaaet_gap: 0.000501 }));
        expect(g.kilde).toBe("best_bound");
        expect(g.kr).toBeCloseTo(2354.8224, 3);
        expect(gabTekst(g)).toBe("højst 2.355 kr. over det bedst mulige (0,050 %)");
    });
    it("falder tilbage til opnået gab × objektiv", () => {
        const g = absolutGab(kørsel({ objektiv_dkk: 1_000_000, best_bound: undefined, opnaaet_gap: 0.002 }));
        expect(g).toEqual({ kr: 2000, rel: 0.002, kilde: "opnaaet" });
    });
    it("bruger det ønskede gab som loft kun ved optimal", () => {
        const opt = absolutGab(kørsel({ objektiv_dkk: 5_000_000, oensket_rel_gap: 0.005, oensket_abs_gap: 5000 }));
        expect(opt).toMatchObject({ kr: 25000, kilde: "oensket_loft" });
        expect(gabTekst(opt)).toMatch(/^højst 25\.000 kr\. over det bedst mulige .*loft ud fra det ønskede gab$/);
        const tid = absolutGab(kørsel({ objektiv_dkk: 5_000_000, solve_status: "time_limit" }));
        expect(tid).toEqual({ kr: null, rel: null, kilde: "ukendt" });
    });
});

describe("difference og toleranceregel", () => {
    const a = kørsel({ objektiv_dkk: 3_424_407.9575, best_bound: 3_424_000 });     // gab 407,96
    it("Δ = b − a, med fortegn i ord", () => {
        const d = difference(a, kørsel({ objektiv_dkk: 3_000_362.9747, best_bound: 3_000_362.9747 }))!;
        expect(d.delta).toBeCloseTo(-424_044.9828, 3);
        expect(d.retning).toBe("billigere");
        expect(d.indenForTolerance).toBe(false);
        expect(differenceTekst(d)).toMatch(/^Scenariet koster 424\.045 kr\. mindre end referencen; forskellen er større end/);
    });
    it("|Δ| under summen af de to absolutte gab = kan ikke skelnes fra nul", () => {
        const d = difference(a, kørsel({ objektiv_dkk: 3_424_407.9575 + 300, best_bound: 3_424_407.9575 + 200 }))!;
        expect(d.tolerance).toBeCloseTo(407.9575 + 100, 3);
        expect(d.indenForTolerance).toBe(true);
        expect(differenceTekst(d)).toContain("kan ikke skelnes fra nul");
    });
    it("præcis på tolerancen er IKKE inden for (|Δ| < sum)", () => {
        const d = difference(kørsel({ objektiv_dkk: 100, best_bound: 90 }), kørsel({ objektiv_dkk: 120, best_bound: 110 }))!;
        expect(d.tolerance).toBe(20);
        expect(d.indenForTolerance).toBe(false);
    });
    it("ukendt gab i én kørsel giver ingen tolerance — og ingen falsk sikkerhed", () => {
        const d = difference(a, kørsel({ objektiv_dkk: 3_424_500, solve_status: "time_limit" }))!;
        expect(d.tolerance).toBeNull();
        expect(d.indenForTolerance).toBe(false);
        expect(differenceTekst(d)).toContain("kendes ikke");
    });
    it("null uden objektiv", () => {
        expect(difference(kørsel({ objektiv_dkk: undefined }), a)).toBeNull();
    });
});

// ---------------------------------------------------------------- sammenlignelighed

describe("sammenlignelighed (KONTRAKT §6b)", () => {
    const p = (over: Partial<Koersel> = {}, navn = "Andeby") => profil(kørsel(over), navn);
    it("ens profiler = ingen advarsler", () => {
        expect(sammenlignelighed(p(), p()).filter((x) => x.alvor === "advarsel")).toEqual([]);
    });
    it("navngiver hver afvigelse blandt de syv felter", () => {
        const b = p({
            vaerk_id: "v2", oploesning: "15min", data_commit: "ffffffffff", model_commit: "eeeeeeeeee",
            oensket_rel_gap: 0.0002, oensket_abs_gap: 1,
            manifest_json: JSON.stringify({ periode: { start: "2026-03-02", slut: "2026-06-23" } }),
        }, "Billund");
        const navne = sammenlignelighed(p(), b).filter((x) => x.alvor === "advarsel").map((x) => x.navn);
        expect(navne).toEqual(["Værk", "Periode", "Opløsning", "Datagrundlag (df-data)", "Modelversion", "Ønsket relativt gab", "Ønsket absolut gab"]);
    });
    it("viser afvigelsen med værdierne", () => {
        const [x] = sammenlignelighed(p(), p({ oensket_rel_gap: 0.0002 }));
        expect(x).toMatchObject({ navn: "Ønsket relativt gab", a: "0,10 %", b: "0,020 %" });
    });
    it("værksrevision, balancering og miljø er noter, ikke advarsler", () => {
        const a = profil(kørsel({ miljoe_json: JSON.stringify({ python: "3.12.12" }) }), "A", null, [ind("scenarie", "_koersel.med_balancering", "false")]);
        const b = profil(kørsel({ vaerk_revision: 2, miljoe_json: JSON.stringify({ python: "3.13.14" }) }), "A", null, [ind("scenarie", "_koersel.med_balancering", "true")]);
        const af = sammenlignelighed(a, b);
        expect(af.every((x) => x.alvor === "note")).toBe(true);
        expect(af.map((x) => x.navn)).toEqual(["Værkets revision", "Balancemarked", "Beregningsmiljø"]);
    });
    it("en ukendt værdi mod en kendt er en afvigelse", () => {
        const af = sammenlignelighed(p(), p({ data_commit: undefined }));
        expect(af.map((x) => [x.navn, x.b])).toEqual([["Datagrundlag (df-data)", "ukendt"]]);
    });
});

// ---------------------------------------------------------------- måneder

describe("maanedstabel", () => {
    const m = (maaned: string, noegle: string, vaerdi: number, objekt?: string): Maaned => ({ id: `m${n++}`, koersel_id: "k", maaned, noegle, vaerdi, objekt } as Maaned);
    const t = maanedstabel([
        m("2026-02", "produktion_gwh", 1.04, "halm"), m("2026-01", "produktion_gwh", 2.02, "halm"),
        m("periode", "produktion_gwh", 3.0612, "halm"), m("2026-01", "varmebehov_gwh", 2.5), m("periode", "varmebehov_gwh", 3.8),
        m("2026-01", "produktion_gwh", 0.3, "gas"),
    ]);
    it("sorterer måneder og holder periode-rækken udenfor", () => {
        expect(t.maaneder).toEqual(["2026-01", "2026-02"]);
    });
    it("totalen er periode-rækken — ikke summen af de viste celler", () => {
        expect(t.periode("halm", "produktion_gwh")).toBe(3.0612);
        expect(t.vaerdi("2026-01", "halm", "produktion_gwh")! + t.vaerdi("2026-02", "halm", "produktion_gwh")!).not.toBe(3.0612);
    });
    it("mangler en celle, er den null (ikke 0)", () => {
        expect(t.vaerdi("2026-02", "gas", "produktion_gwh")).toBeNull();
        expect(t.periode("gas", "produktion_gwh")).toBeNull();
    });
    it("lister objekter pr. nøgle", () => {
        expect(t.objekter("produktion_gwh")).toEqual(["gas", "halm"]);
    });
});

// ---------------------------------------------------------------- intervaldispatch og N−1

describe("dispatch og N−1", () => {
    const række = (tid: string, v: Record<string, number | null>): Time => ({
        id: tid, koersel_id: "k", tid: new Date(tid), varmelast_mw: 30, spotpris: 600, vaerdier_json: JSON.stringify(v),
    } as Time);
    it("finder enheder (også med _ i navnet) og lagre", () => {
        const [p] = dispatchPunkter([række("2026-01-05T01:00:00Z", { p_vp_luft_vand_mw: 2.55, p_halmkedel_mw: 12, tank_lav_level_mwh: 128, r_afrr_vp_luft_vand_mw: 1 })]);
        expect(p.prod).toEqual({ vp_luft_vand: 2.55, halmkedel: 12 });
        expect(p.lager).toEqual({ tank_lav: 128 });
        expect(p.aflad).toBe(0);
    });
    it("A5: lager er NETTO over alle lagre — et lag der lader et andet er flytning, ikke forsyning", () => {
        // Andeby: tank_hoej aflader 25 MW, mens tank_lav lader 6,184 MW → fra lager 18,816 MW, ikke 25.
        const [p] = dispatchPunkter([række("2026-01-05T01:00:00Z", { tank_hoej_discharge_mw: 25, tank_hoej_charge_mw: 0, tank_lav_charge_mw: 6.184, tank_lav_discharge_mw: 0, tank_lav_net_mw: 6.184 })]);
        expect(p.aflad).toBeCloseTo(18.816, 6);
        expect(p.lad).toBe(0);
        const [q] = dispatchPunkter([række("2026-01-05T02:00:00Z", { tank_hoej_discharge_mw: 2, tank_lav_charge_mw: 7 })]);
        expect([q.aflad, q.lad]).toEqual([0, 5]);
        const [r] = dispatchPunkter([række("2026-01-05T03:00:00Z", { tank_hoej_discharge_mw: 4, tank_lav_charge_mw: 4 })]);
        expect([r.aflad, r.lad]).toEqual([0, 0]);
    });
    it("sorterer efter tid og tåler null/−0", () => {
        const ps = dispatchPunkter([række("2026-01-05T02:00:00Z", { p_a_mw: -0 }), række("2026-01-05T01:00:00Z", { p_a_mw: null })]);
        expect(ps.map((x) => x.tid.toISOString())).toEqual(["2026-01-05T01:00:00.000Z", "2026-01-05T02:00:00.000Z"]);
        expect(ps[0].prod).toEqual({});
        expect(Object.is(ps[1].prod.a, -0)).toBe(false);
    });
    it("summerer kapacitet og aktivering pr. marked i vinduet", () => {
        const b = balanceIVindue([
            række("2026-01-05T01:00:00Z", { r_mfrr_elkedel_ny_cap_revenue_dkk: 856, r_mfrr_elkedel_ny_act_revenue_dkk: 219.5, r_mfrr_elkedel_ny_act_gross_dkk: 349, r_afrr_vp_mw: 1 }),
            række("2026-01-05T02:00:00Z", { r_mfrr_vp_luft_vand_cap_revenue_dkk: 227, r_afrr_vp_luft_vand_cap_revenue_dkk: 10 }),
        ])!;
        expect(b.mfrr).toEqual({ kapacitet: 1083, aktivering_netto: 219.5, aktivering_brutto: 349 });
        expect(b.afrr.kapacitet).toBe(10);
        expect(balanceIVindue([række("2026-01-05T01:00:00Z", { p_a_mw: 1 })])).toBeNull();
    });
    it("vinduer: 7-døgns-blokke, slutdøgnet med, hele perioden først når ≤ 31 døgn", () => {
        const v = vinduer("2026-01-05", "2026-01-16");
        expect(v.map((x) => x.etiket)).toEqual(["Hele perioden", "Uge 1: 5. jan.–11. jan. 2026", "Uge 2: 12. jan.–16. jan. 2026"]);
        expect(v[0].til.toISOString()).toBe("2026-01-17T00:00:00.000Z");
        expect(v.every((x) => (x.til.getTime() - x.fra.getTime()) / 86_400_000 <= 31)).toBe(true);
        const lang = vinduer("2026-03-02", "2026-06-23");
        expect(lang[0].etiket).toBe("Uge 1: 2. mar.–8. mar. 2026");
        expect(lang.at(-1)!.til.toISOString()).toBe("2026-06-24T00:00:00.000Z");
        expect(vinduer(null, "2026-01-01")).toEqual([]);
    });
});

// ---------------------------------------------------------------- input og klartekst

describe("input og klartekst", () => {
    const værk = [
        ind("vaerk", "storage.tank_lav.enabled", "true"), ind("vaerk", "prices.straw.value", "205.0"),
        ind("vaerk", "units.halmkedel.type", "\"biomass_boiler\""), ind("vaerk", "solver.mip_rel_gap", "0.001"),
    ];
    it("slår etiket og objekt op i fagkataloget", () => {
        expect(feltInfo("units.halmkedel.p_max_heat").objekt).toBe("halmkedel");
        expect(feltInfo("ukendt.sti").etiket).toBe("ukendt.sti");
    });
    it("beskriver knapper i klartekst", () => {
        expect(aendringTekst("storage.tank_lav.enabled", "true", "false")).toBe("Lageret tank_lav er slået fra");
        expect(aendringTekst("_koersel.med_balancering", undefined, "true")).toBe("Med balancemarked (aFRR og mFRR)");
        expect(aendringTekst("prices.straw.value", "205.0", "256.0")).toMatch(/: 205 → 256/);
    });
    it("spørgsmålet: værkets ændringer, så balancering og periode", () => {
        const s = spoergsmaal([...værk, ind("aendring", "storage.tank_lav.enabled", "false"),
            ind("scenarie", "_koersel.med_balancering", "false"), ind("scenarie", "_koersel.start", "\"2026-01-05\""),
            ind("scenarie", "_koersel.slut", "\"2026-01-16\""), ind("scenarie", "solver.mip_rel_gap", "0.0002")]);
        expect(s).toEqual(["Lageret tank_lav er slået fra", "Uden balancemarked", "Periode 5. jan.–16. jan. 2026"]);
        expect(spoergsmaal(værk)).toEqual(["Værket som det er — ingen ændringer"]);
    });
    it("input-diff sammenligner effektive værdier og ignorerer 12 mod 12.0", () => {
        const a = [...værk, ind("scenarie", "_koersel.med_balancering", "false")];
        const b = [...værk.map((r) => (r.sti === "prices.straw.value" ? { ...r, vaerdi_json: "205" } : r)),
            ind("aendring", "storage.tank_lav.enabled", "false"), ind("scenarie", "_koersel.med_balancering", "false")];
        expect(inputDiff(a, b)).toEqual([{ sti: "storage.tank_lav.enabled", a: "true", b: "false" }]);
    });
    it("Spor B kun med månedsloft", () => {
        expect(spor(værk)).toBe("A");
        expect(spor([...værk, ind("vaerk", "balancing.availability.enabled", "true")])).toBe("B");
    });
});

// ---------------------------------------------------------------- farver og budskab

describe("farver og budskab", () => {
    it("farven følger enheden, ikke rangen", () => {
        const f = farvepladser(["halmkedel", "gaskedel", "elkedel"]);
        expect([f.get("elkedel"), f.get("gaskedel"), f.get("halmkedel")]).toEqual([1, 2, 3]);
        const ni = farvepladser(["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
        expect(ni.get("i")).toBe(0);
    });
    it("budskab regnet af data", () => {
        const v = produktionsvarians(
            [{ navn: "gaskedel", produktion_mwh: 100 }, { navn: "halmkedel", produktion_mwh: 3000 }] as never,
            [{ navn: "gaskedel", produktion_mwh: 1300 }, { navn: "halmkedel", produktion_mwh: 1800 }] as never,
        );
        expect(v[0]).toMatchObject({ navn: "halmkedel", delta: -1200, relativ: -0.4 });
        const d = difference(kørsel({ objektiv_dkk: 1_000_000, best_bound: 1_000_000 }), kørsel({ objektiv_dkk: 1_089_000, best_bound: 1_089_000 }));
        expect(sammenligningsBudskab(v, d, energi)).toBe("I scenariet overtager gaskedel 1.200 MWh (mest fra halmkedel), og driften bliver 89.000 kr. dyrere.");
    });
    it("enhed kun i én kørsel tæller 0 i den anden (relativ = null fra 0)", () => {
        const v = produktionsvarians([], [{ navn: "ny", produktion_mwh: 5 }] as never);
        expect(v[0]).toMatchObject({ a: 0, b: 5, relativ: null });
    });
});

// ---------------------------------------------------------------- KONTRAKT §6c (v2.2)

describe("§6c: modtaget og frosne commits", () => {
    it("referencen er den først MODTAGNE (server-tid), ikke den først bestilte", () => {
        const x = kørsel({ id: "x", bestilt: new Date("2026-10-16T08:00:00Z") });
        const y = kørsel({ id: "y", bestilt: new Date("2026-10-16T09:00:00Z") });
        (x as unknown as { modtaget: Date }).modtaget = new Date("2026-10-16T09:05:00Z");
        (y as unknown as { modtaget: Date }).modtaget = new Date("2026-10-16T09:01:00Z");
        expect(sammenligningsRaekkefoelge([x, y])).toEqual(["y", "x"]);
        expect(modtaget(kørsel()).toISOString()).toBe("2026-10-16T07:00:00.000Z");
    });
    it("frosne model-/data-SHA'er er metadata: ikke i spørgsmålet, men profilen bruger dem", () => {
        const input = [ind("scenarie", "_koersel.model_commit", "\"abcdef0123\""), ind("scenarie", "_koersel.data_commit", "\"9876543210\"")];
        expect(spoergsmaal(input)).toEqual(["Værket som det er — ingen ændringer"]);
        const p = profil(kørsel({ model_commit: undefined, data_commit: undefined }), "A", null, input);
        expect([p.model_commit, p.data_commit]).toEqual(["abcdef0123", "9876543210"]);
        expect(aendringTekst("_koersel.model_commit", undefined, "\"abcdef0123\"")).toBe("Modelversion (frosset): abcdef0");
    });
});

// ---------------------------------------------------------------- fv-eksperts review (A1-A8)

describe("review A1: kapacitet og aktivering for hele perioden (register v3)", () => {
    const v3 = [
        nt("balancering", "netto_dkk", 299848, undefined, "afrr"), nt("balancering", "brutto_dkk", 348016, undefined, "afrr"),
        nt("balancering", "netto_dkk", 247353, undefined, "mfrr"), nt("balancering", "brutto_dkk", 316031, undefined, "mfrr"),
        nt("balancering", "netto_dkk", 547201), nt("balancering", "brutto_dkk", 664048),
        nt("balancering", "kapacitetsindtaegt_dkk", 82496.1, undefined, "afrr"), nt("balancering", "aktivering_netto_dkk", 217351.9, undefined, "afrr"),
        nt("balancering", "forbrugsmodregning_dkk", 48168, undefined, "afrr"), nt("balancering", "aktivering_brutto_dkk", 265519.9, undefined, "afrr"),
        nt("balancering", "kapacitetsindtaegt_dkk", 97686.6, undefined, "mfrr"), nt("balancering", "aktivering_netto_dkk", 149666.4, undefined, "mfrr"),
        nt("balancering", "forbrugsmodregning_dkk", 68678, undefined, "mfrr"), nt("balancering", "aktivering_brutto_dkk", 218344.4, undefined, "mfrr"),
        // pr. enhed (objekt sat) må IKKE blandes ind i markedets total
        nt("balancering", "kapacitetsindtaegt_dkk", 50000, "elkedel_ny", "afrr"),
    ];
    const b = samlNoegletal(v3).balance!;
    it("læser produkterne pr. marked fra rækken med objekt = null", () => {
        expect(b.harProdukter).toBe(true);
        expect(b.afrr).toMatchObject({ kapacitet: 82496.1, aktivering_netto: 217351.9, sparet_elkoeb: 48168, aktivering_brutto: 265519.9 });
    });
    it("kapacitet + aktivering netto = netto; netto + sparet elkøb = brutto (data hænger sammen)", () => {
        for (const m of [b.afrr, b.mfrr]) {
            expect(m.kapacitet! + m.aktivering_netto!).toBeCloseTo(m.netto!, 0);
            expect(m.netto! + m.sparet_elkoeb!).toBeCloseTo(m.brutto!, 0);
        }
    });
    it("I alt: netto/brutto fra manifestet, produkterne = aFRR + mFRR (uafrundet); mangler et marked → null", () => {
        expect(b.i_alt.netto).toBe(547201);
        expect(b.i_alt.kapacitet).toBeCloseTo(180182.7, 6);
        const kunAfrr = samlNoegletal([nt("balancering", "kapacitetsindtaegt_dkk", 1, undefined, "afrr")]).balance!;
        expect(kunAfrr.i_alt.kapacitet).toBeNull();
    });
    it("kolonnerne følger registerets etiketter og rækkefølgen kapacitet → aktivering netto → sparet elkøb → brutto → i alt", () => {
        expect(BALANCE_KOLONNER.map((k) => k.felt)).toEqual(["kapacitet", "aktivering_netto", "sparet_elkoeb", "aktivering_brutto", "netto", "brutto"]);
        expect(BALANCE_KOLONNER.map((k) => k.etiket).slice(0, 4)).toEqual(["Kapacitetsindtægt", "Aktiveringsindtægt, netto", "Sparet elkøb ved aktivering", "Aktiveringsindtægt, brutto"]);
    });
});

describe("review A2: balance-Δ når kun den ene kørsel har balancemarked", () => {
    const med = samlNoegletal([nt("balancering", "netto_dkk", 547201), nt("balancering", "brutto_dkk", 664048), nt("objektiv", "objektiv_dkk", 3000362.97)]);
    const uden = samlNoegletal([nt("objektiv", "objektiv_dkk", 3424407.96)]);
    it("Δ er '–' (null), når én side mangler — indtægten må ikke stå som Δ", () => {
        const rk = balanceDelta(uden.balance, med.balance);
        expect(rk.length).toBeGreaterThan(0);
        expect(rk.every((r) => r.delta === null)).toBe(true);
        expect(rk.find((r) => r.marked === "I alt" && r.felt === "netto")).toMatchObject({ a: null, b: 547201 });
    });
    it("Δ findes, når begge har tallet", () => {
        const andet = samlNoegletal([nt("balancering", "netto_dkk", 500000)]);
        expect(balanceDelta(andet.balance, med.balance).find((r) => r.marked === "I alt" && r.felt === "netto")?.delta).toBe(47201);
    });
    it("værdien er objektiv(uden) − objektiv(med), ikke indtægten", () => {
        const side = (k: Koersel, samlet: typeof uden, bal: boolean) => {
            const input = [ind("scenarie", "_koersel.med_balancering", String(bal))];
            return { k, samlet, input, profil: profil(k, "A", null, input) };
        };
        const a = side(kørsel({ objektiv_dkk: 3424407.96 }), uden, false);
        const b = side(kørsel({ objektiv_dkk: 3000362.97 }), med, true);
        expect(balancemarkedetsVaerdi(a, b)!.vaerdi).toBeCloseTo(424044.99, 2);
        expect(balancemarkedetsVaerdi(b, a)).toMatchObject({ med: "a" });
        expect(balancemarkedetsVaerdi(b, b)).toBeNull();
    });
});

describe("review A3/A4: Spor A/B", () => {
    const g = (enabled: string, mode: string) => [ind("vaerk", "balancing.reservation_gate.enabled", enabled), ind("vaerk", "balancing.reservation_gate.mode", `"${mode}"`)];
    it("gate i mode driven uden månedsloft er Spor B (billund_sporb_rullende)", () => {
        expect(spor(g("true", "driven"))).toBe("B");
    });
    it("gate i mode bound er Spor A (Andeby, Billund Spor A); en slået-fra driven-gate er også A", () => {
        expect(spor(g("true", "bound"))).toBe("A");
        expect(spor(g("false", "driven"))).toBe("A");
    });
    it("et scenarie, der slår månedsloftet til, flytter kørslen til Spor B (effektivt input)", () => {
        expect(spor([ind("vaerk", "balancing.availability.enabled", "false"), ind("aendring", "balancing.availability.enabled", "true")])).toBe("B");
    });
});

describe("review A6: usikkerheden er ensidet", () => {
    it("sandt Δ ∈ [Δ − gab(scenarie); Δ + gab(reference)]", () => {
        const a = kørsel({ objektiv_dkk: 1000, best_bound: 990 });   // gab 10
        const b = kørsel({ objektiv_dkk: 1100, best_bound: 1097 });  // gab 3
        const d = difference(a, b)!;
        expect(d.interval).toEqual([97, 110]);
        expect(intervalTekst(d)).toBe("Det sande Δ ligger mellem 97 og 110 kr.");
        expect(d.tolerance).toBe(13);
    });
    it("ukendt gab → intet interval", () => {
        expect(difference(kørsel({ objektiv_dkk: 1 }), kørsel({ objektiv_dkk: 2, solve_status: "time_limit" }))!.interval).toBeNull();
    });
});

describe("review A8: profilbundne enheder", () => {
    it("en enhed med production_profile_path er profilbundet; null/tom er ikke", () => {
        const s = profilbundne([
            ind("vaerk", "units.solvarme.production_profile_path", "\"data/solar_andeby_dmi_karup.csv\""),
            ind("vaerk", "units.halmkedel.production_profile_path", "null"),
            ind("vaerk", "units.gaskedel.production_profile_path", "\"\""),
        ]);
        expect([...s]).toEqual(["solvarme"]);
    });
});

