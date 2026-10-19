import { describe, expect, it } from "vitest";
import { Inputfejl } from "@/lib/data/vaerdi";
import {
    bygPar, datoTilFelt, feltTilDato, forventetFrosset, pinsAf, utilgængeligTekst, visningsnavn, forventetVarighed, frosset, knapStatus, medReference, referenceAf, referenceId, sammeKort,
    sammenlignelighed, tjekPeriode, tjekÆndringer, varighedTekst, visBeskrivelse, værdifelter, værksperiode,
    STRAMT_GAB, type Blade, type Scenariefelter,
} from "../logik";
import { KNAPPER } from "../viden.data";
import { VAERKER } from "./vaerker.testdata";

const blade = (kode: string): Blade => new Map(Object.entries(VAERKER[kode]));
const KODER = Object.keys(VAERKER);

/** Første mulighed for hvert valg + et fornuftigt tal i hvert værdifelt. */
function standardvalg(kode: string, knapId: string) {
    const k = KNAPPER.find((x) => x.id === knapId)!;
    const st = knapStatus(k, blade(kode), kode);
    const valgt = Object.fromEntries(st.valg.map((v) => [v.pladsholder, v.muligheder[0]]));
    const værdier = Object.fromEntries(værdifelter(k, blade(kode), valgt).map((f) => [f.pladsholder, f.standard || "12,5"]));
    return { k, st, valgt, værdier };
}

describe("knap -> ændringsliste for alle knapper x alle 7 værker", () => {
    it("fixturen har de 7 importerede værker", () => {
        expect(KODER).toHaveLength(7);
    });

    for (const knap of KNAPPER) {
        it(`${knap.id}: mulig præcis i ${knap.tilgaengelig_i.length ? knap.tilgaengelig_i.join(", ") : "ingen"}`, () => {
            const mulige = KODER.filter((kode) => knapStatus(knap, blade(kode), kode).mulig).sort();
            // tilgaengelig_i er fv-eksperts måling på repoets værker @ b49aeb0 — vores regel skal give det samme.
            expect(mulige).toEqual([...knap.tilgaengelig_i].sort());
        });

        for (const kode of knap.tilgaengelig_i) {
            it(`${knap.id} i ${kode}: parret består stireglen og dubletreglen`, () => {
                const { k, valgt, værdier } = standardvalg(kode, knap.id);
                const par = bygPar(k, blade(kode), valgt, værdier, false);
                for (const side of [par.reference, par.scenarie]) {
                    const fejl = tjekÆndringer(side.aendringer, blade(kode)).filter((f) => f.niveau === "fejl");
                    expect(fejl).toEqual([]);
                    for (const æ of side.aendringer) {
                        expect(æ.sti).not.toMatch(/[<>]/);
                        if (æ.type === "set") expect(() => JSON.parse(æ.vaerdi_json!)).not.toThrow();
                    }
                }
                // Kun knappen må være forskellig: noget skal adskille de to kørsler.
                const ens = JSON.stringify(par.reference) === JSON.stringify(par.scenarie);
                expect(ens).toBe(false);
            });
        }
    }

    it("utilgængelig knap har en grund", () => {
        const k = KNAPPER.find((x) => x.id === "nettabsmodel")!;
        const st = knapStatus(k, blade("andeby"), "andeby");
        expect(st.mulig).toBe(false);
        expect(st.grund).toMatch(/nettab/);
    });
});

describe("konkrete knapper", () => {
    it("tankens værdi slår alle aktive lagre fra (Andeby: to tanke)", () => {
        const { k, valgt, værdier } = standardvalg("andeby", "tankens_vaerdi");
        const par = bygPar(k, blade("andeby"), valgt, værdier, true);
        expect(par.reference.aendringer).toEqual([]);
        expect(par.scenarie.aendringer.map((a) => `${a.type}:${a.sti}`).sort()).toEqual(["disable:tank_hoej", "disable:tank_lav"]);
        expect(par.reference.felter.med_balancering).toBe(true);
        expect(par.scenarie.felter.med_balancering).toBe(true);
    });

    it("balancemarkedets værdi styrer selv balanceringen", () => {
        const { k, valgt, værdier } = standardvalg("billund_spora", "balancemarkedets_vaerdi");
        const par = bygPar(k, blade("billund_spora"), valgt, værdier, true);
        expect(par.reference.felter.med_balancering).toBe(false);
        expect(par.scenarie.felter.med_balancering).toBe(true);
    });

    it("brændselspris bevarer værkets type (decimaltal) og forstår dansk komma", () => {
        const b = blade("andeby");
        const k = KNAPPER.find((x) => x.id === "braendselspris")!;
        const valgt = { "<braendsel>": "straw" };
        const gammel = b.get("prices.straw.value")!;
        const par = bygPar(k, b, valgt, { "<ny pris>": "93,5" }, false);
        const æ = par.scenarie.aendringer[0];
        expect(æ).toMatchObject({ type: "set", sti: "prices.straw.value" });
        expect(æ.vaerdi_json).toBe("93.5");
        if (/\./.test(gammel)) expect(bygPar(k, b, valgt, { "<ny pris>": "90" }, false).scenarie.aendringer[0].vaerdi_json).toBe("90.0");
    });

    it("brændselspris uden værdi giver en Inputfejl", () => {
        const k = KNAPPER.find((x) => x.id === "braendselspris")!;
        expect(() => bygPar(k, blade("andeby"), { "<braendsel>": "straw" }, {}, false)).toThrow(Inputfejl);
    });

    it("elafgift sætter begge stier med samme sats i Andeby, kun den ene i Billund", () => {
        const k = KNAPPER.find((x) => x.id === "elafgift")!;
        expect(værdifelter(k, blade("andeby"), {}).map((f) => f.pladsholder)).toEqual(["<ny sats>"]);
        const a = bygPar(k, blade("andeby"), {}, { "<ny sats>": "100" }, false).scenarie.aendringer;
        expect(a.map((x) => x.sti)).toEqual(["electricity.electricity_tax", "electricity.tariff_consumption.fixed_components.elafgift_net"]);
        expect(new Set(a.map((x) => Number(x.vaerdi_json))).size).toBe(1);
        const b = bygPar(k, blade("billund_spora"), {}, { "<ny sats>": "100" }, false).scenarie.aendringer;
        expect(b.map((x) => x.sti)).toEqual(["electricity.electricity_tax"]);
    });

    it("tankstørrelse: reference uden tank, scenarie med ny volumen (kan rettes)", () => {
        const k = KNAPPER.find((x) => x.id === "tankstoerrelse")!;
        const b = blade("billund_spora");
        const felter = værdifelter(k, b, { "<lager>": "tank_eksisterende" });
        expect(felter).toHaveLength(1);
        expect(felter[0].standard).toBe("4000");
        const par = bygPar(k, b, { "<lager>": "tank_eksisterende" }, { [felter[0].pladsholder]: "8000" }, false);
        expect(par.reference.aendringer).toEqual([{ type: "disable", sti: "tank_eksisterende" }]);
        expect(par.scenarie.aendringer[0].sti).toBe("storage.tank_eksisterende.volume_m3");
        expect(Number(par.scenarie.aendringer[0].vaerdi_json)).toBe(8000);
    });

    it("klimaområde koder området som tekst", () => {
        const k = KNAPPER.find((x) => x.id === "klimaomraade")!;
        const par = bygPar(k, blade("andeby"), { "<omraade>": "karup" }, {}, false);
        expect(par.scenarie.aendringer).toEqual([{ type: "set", sti: "data.dmi_area", vaerdi_json: '"karup"' }]);
    });

    it("målt varmelast: kun Billunds filer, kun i scenariet", () => {
        const k = KNAPPER.find((x) => x.id === "maalt_varmelast")!;
        expect(knapStatus(k, blade("andeby"), "andeby").mulig).toBe(false);
        const st = knapStatus(k, blade("billund_spora"), "billund_spora");
        expect(st.valg[0].muligheder).toContain("billund_abvaerk_hourly_splejset_jun2026.csv");
        const par = bygPar(k, blade("billund_spora"), { "<fil>": "billund_abvaerk_hourly_splejset_jun2026.csv" }, {}, false);
        expect(par.reference.felter.heat_csv).toBeNull();
        expect(par.scenarie.felter.heat_csv).toBe("billund_abvaerk_hourly_splejset_jun2026.csv");
    });

    it("ny enhed tilbyder kun enheder, der er slået fra", () => {
        const k = KNAPPER.find((x) => x.id === "ny_enhed")!;
        const st = knapStatus(k, blade("andeby"), "andeby");
        expect(st.valg[0].muligheder.sort()).toEqual(["elkedel_gl", "fliskedel"]);
    });

    it("en kopi af et Billund-værk arver filvalget via rodkoden", () => {
        const k = KNAPPER.find((x) => x.id === "maalt_varmelast")!;
        expect(knapStatus(k, blade("billund_spora"), "billund_spora").mulig).toBe(true);
        expect(knapStatus(k, blade("billund_spora"), "andeby").mulig).toBe(false);
    });
});

describe("tekster til brugeren (review S2, S3, S8)", () => {
    it("S2: en utilgængelig knap viser fv-eksperts fagtekst; stien er kun detaljen", () => {
        for (const k of KNAPPER) expect(k.utilgaengelig_tekst, k.id).toBeTruthy();
        const k = KNAPPER.find((x) => x.id === "budstrategi_viden")!;
        const t = utilgængeligTekst(k, knapStatus(k, blade("billund_spora"), "billund_spora"));
        expect(t.tekst).toMatch(/budstrategi-blok/);
        expect(t.detalje).toMatch(/balancing\.activation/);
    });
    it("S3: brændsler vises med dansk navn", () => {
        expect(visningsnavn("<braendsel>", "natural_gas")).toBe("Naturgas");
        expect(visningsnavn("<braendsel>", "straw")).toBe("Halm");
        expect(visningsnavn("<enhed>", "halmkedel")).toBe("halmkedel");
    });
    it("S4: det anbefalede gab er 0,02 % og højst 100 kr.", () => {
        expect(STRAMT_GAB).toEqual({ mip_rel_gap: 0.0002, mip_abs_gap: 100 });
    });
    it("S8: datoer i dansk form, og de læses tilbage", () => {
        expect(datoTilFelt("2026-01-05")).toBe("05-01-2026");
        expect(datoTilFelt(null)).toBe("");
        expect(feltTilDato("05-01-2026")).toBe("2026-01-05");
        expect(feltTilDato("5.1.2026")).toBe("2026-01-05");
        expect(feltTilDato("")).toBe("");
        expect(feltTilDato("i morgen")).toBe("i morgen");
        expect(tjekPeriode(feltTilDato("i morgen"), "2026-01-16", blade("andeby"), { medBalancering: false }).fund[0].niveau).toBe("fejl");
    });
});

describe("dubletreglen", () => {
    const b = blade("andeby");
    it("to set på samme sti afvises", () => {
        const f = tjekÆndringer([
            { type: "set", sti: "prices.straw.value", vaerdi_json: "80.0" },
            { type: "set", sti: "prices.straw.value", vaerdi_json: "90.0" },
        ], b);
        expect(f.filter((x) => x.niveau === "fejl")).toHaveLength(1);
    });
    it("disable + set …enabled er en dublet", () => {
        const f = tjekÆndringer([
            { type: "disable", sti: "tank_lav" },
            { type: "set", sti: "storage.tank_lav.enabled", vaerdi_json: "false" },
        ], b);
        expect(f.some((x) => x.niveau === "fejl" && /samme sti/.test(x.tekst))).toBe(true);
    });
    it("enable + disable af samme navn er en dublet", () => {
        const f = tjekÆndringer([{ type: "enable", sti: "fliskedel" }, { type: "disable", sti: "fliskedel" }], b);
        expect(f.filter((x) => x.niveau === "fejl")).toHaveLength(1);
    });
    it("set på en sti der ikke findes afvises", () => {
        const f = tjekÆndringer([{ type: "set", sti: "prices.uran.value", vaerdi_json: "1.0" }], b);
        expect(f[0].tekst).toMatch(/findes ikke/);
    });
    it("til/fra på et ukendt navn afvises", () => {
        expect(tjekÆndringer([{ type: "disable", sti: "atomkraft" }], b)[0].tekst).toMatch(/ingen enhed eller lager/);
    });
    it("set på solver.* og time.* afvises — de har egne scenariefelter (§6c)", () => {
        expect(tjekÆndringer([{ type: "set", sti: "solver.mip_rel_gap", vaerdi_json: "0.001" }], b)[0].tekst).toMatch(/egne felter/);
        expect(tjekÆndringer([{ type: "set", sti: "time.resolution", vaerdi_json: '"15min"' }], b)[0].tekst).toMatch(/egne felter/);
    });
    it("alle enheder slået fra afvises (modellen er tom)", () => {
        const enheder = [...b.keys()].map((k) => /^units\.([^.]+)\.enabled$/.exec(k)?.[1]).filter(Boolean) as string[];
        const f = tjekÆndringer(enheder.map((n) => ({ type: "disable" as const, sti: n })), b);
        expect(f.some((x) => /Ingen aktive produktionsenheder/.test(x.tekst))).toBe(true);
    });
    it("forskellige stier er i orden", () => {
        expect(tjekÆndringer([{ type: "disable", sti: "tank_lav" }, { type: "set", sti: "prices.straw.value", vaerdi_json: "80.0" }], b)).toEqual([]);
    });
});

describe("periodevalidering", () => {
    const b = blade("andeby");
    const o = { medBalancering: false, idag: "2026-10-16" };
    it("vintervinduet er 12 døgn og i orden", () => {
        const p = tjekPeriode("2026-01-05", "2026-01-16", b, o);
        expect(p.doegn).toBe(12);
        expect(p.fund.filter((f) => f.niveau === "fejl")).toEqual([]);
    });
    it("kun én dato er en fejl", () => {
        expect(tjekPeriode("2026-01-05", "", b, o).fund[0].niveau).toBe("fejl");
    });
    it("slut før start er en fejl", () => {
        expect(tjekPeriode("2026-02-01", "2026-01-01", b, o).fund[0].tekst).toMatch(/før startdatoen/);
    });
    it("ugyldig dato er en fejl", () => {
        expect(tjekPeriode("2026-02-30", "2026-03-01", b, o).fund[0].niveau).toBe("fejl");
    });
    it("366 døgn er tilladt, 367 ikke", () => {
        expect(tjekPeriode("2024-01-01", "2024-12-31", b, o).fund.filter((f) => f.niveau === "fejl")).toEqual([]);
        expect(tjekPeriode("2025-01-01", "2026-01-02", b, o).fund.some((f) => /højst 366/.test(f.tekst))).toBe(true);
    });
    it("tom periode = værkets time-blok (Andeby helår = 365 døgn)", () => {
        const p = tjekPeriode(null, null, b, o);
        expect(p.doegn).toBe(365);
        expect(værksperiode(b)?.start).toBe("2025-07-01");
    });
    it("balancering før 4. marts 2025 giver en advarsel", () => {
        const p = tjekPeriode("2025-01-06", "2025-01-08", b, { ...o, medBalancering: true });
        expect(p.fund.some((f) => f.niveau === "advarsel" && /balancering/i.test(f.tekst))).toBe(true);
        expect(tjekPeriode("2025-01-06", "2025-01-08", b, o).fund.some((f) => /balancering/i.test(f.tekst))).toBe(false);
    });
    it("fyn hen over 28. februar 2026 giver en advarsel (Billund Spor A er fyn)", () => {
        const p = tjekPeriode("2026-02-20", "2026-03-05", blade("billund_spora"), o);
        expect(p.fund.some((f) => /28\. februar/.test(f.tekst))).toBe(true);
    });
    it("kun 1h-opløsning i version 1 (§6c)", () => {
        const kvarter = new Map(b);
        kvarter.set("time.resolution", '"15min"');
        expect(tjekPeriode("2026-01-05", "2026-01-16", kvarter, o).fund.some((f) => f.niveau === "fejl" && /1h/.test(f.tekst))).toBe(true);
    });
    it("S1: balancering hen over aFRR-hullet 4. september 2026 giver en advarsel, uden balancering ikke", () => {
        const idag = { idag: "2026-12-01" };
        expect(tjekPeriode("2026-08-20", "2026-09-10", b, { medBalancering: true, ...idag }).fund.some((f) => /aFRR/.test(f.tekst))).toBe(true);
        expect(tjekPeriode("2026-08-20", "2026-09-03", b, { medBalancering: true, ...idag }).fund.some((f) => /aFRR/.test(f.tekst))).toBe(false);
        expect(tjekPeriode("2026-08-20", "2026-09-10", b, { medBalancering: false, ...idag }).fund.some((f) => /aFRR/.test(f.tekst))).toBe(false);
    });
    it("en periode der slutter i fremtiden giver en advarsel", () => {
        expect(tjekPeriode("2026-10-01", "2026-10-30", b, o).fund.some((f) => /df-data/.test(f.tekst))).toBe(true);
    });
});

describe("forventet varighed", () => {
    it("2 uger: under 1 minut", () => {
        expect(varighedTekst(forventetVarighed({ rodKode: "andeby", doegn: 14, medBalancering: true }))).toBe("under 1 minut");
    });
    it("Billund-år med balancering omkring 4 minutter", () => {
        const v = forventetVarighed({ rodKode: "billund_spora_rullende", doegn: 365, medBalancering: true });
        expect(v.lav).toBeLessThanOrEqual(4);
        expect(v.høj).toBeGreaterThanOrEqual(4);
    });
    it("Spor A (113 døgn) omkring 2 minutter", () => {
        const v = forventetVarighed({ rodKode: "billund_spora", doegn: 113, medBalancering: true });
        expect(v.lav).toBeLessThanOrEqual(2);
        expect(v.høj).toBeGreaterThanOrEqual(2);
    });
    it("Andeby-år uden balancering omkring de målte 4,4 min (265 s), med ca. 1 time", () => {
        const u = forventetVarighed({ rodKode: "andeby", doegn: 365, medBalancering: false });
        expect(u.lav).toBeLessThanOrEqual(4.4);
        expect(u.høj).toBeGreaterThanOrEqual(4.4);
        const m = forventetVarighed({ rodKode: "andeby", doegn: 365, medBalancering: true });
        expect(m.lav).toBeLessThanOrEqual(60);
        expect(m.høj).toBeGreaterThanOrEqual(60);
        expect(varighedTekst({ lav: 6, høj: 10 })).toBe("6–10 min");
    });
    it("Billund Spor B 4 mdr. dækker de målte 71 s uden og 154 s med balance", () => {
        const u = forventetVarighed({ rodKode: "billund_sporb", doegn: 121, medBalancering: false });
        const m = forventetVarighed({ rodKode: "billund_sporb", doegn: 121, medBalancering: true });
        expect(u.lav).toBeLessThanOrEqual(71 / 60); expect(u.høj).toBeGreaterThanOrEqual(71 / 60);
        expect(m.lav).toBeLessThanOrEqual(154 / 60); expect(m.høj).toBeGreaterThanOrEqual(154 / 60);
    });
    it("settle realized fordobler", () => {
        const a = forventetVarighed({ rodKode: "andeby", doegn: 200, medBalancering: true });
        const b = forventetVarighed({ rodKode: "andeby", doegn: 200, medBalancering: true, settleRealized: true });
        expect(b.høj).toBeGreaterThan(a.høj * 1.8);
    });
    it("lange varigheder vises i timer", () => {
        expect(varighedTekst({ lav: 90, høj: 150 })).toBe("1,5 t–2,5 t");
    });
});

describe("genbrug af reference (frosset input)", () => {
    const b = blade("andeby");
    const felter: Scenariefelter = {
        periode_start: "2026-01-05", periode_slut: "2026-01-16", med_balancering: true, balancing_method: null,
        mip_rel_gap: 0.0002, mip_abs_gap: 1000, tidsgraense_s: null, ekstra_flag: null, heat_csv: null,
    };
    it("matcher den form startBestilling fryser (inkl. _koersel.* og solver-stier)", () => {
        const forventet = forventetFrosset([{ type: "disable", sti: "tank_lav" }], felter, b);
        const rækker = [
            { kilde: "vaerk", sti: "storage.tank_lav.enabled", vaerdi_json: "true" },
            { kilde: "aendring", sti: "storage.tank_lav.enabled", vaerdi_json: "false" },
            { kilde: "scenarie", sti: "_koersel.start", vaerdi_json: '"2026-01-05"' },
            { kilde: "scenarie", sti: "_koersel.slut", vaerdi_json: '"2026-01-16"' },
            { kilde: "scenarie", sti: "_koersel.med_balancering", vaerdi_json: "true" },
            { kilde: "scenarie", sti: "solver.mip_rel_gap", vaerdi_json: "0.0002" },
            { kilde: "scenarie", sti: "solver.mip_abs_gap", vaerdi_json: "1000.0" },
        ];
        expect(sammeKort(forventet, frosset(rækker))).toBe(true);
        // Pins (model/data-SHA fra Motor) indgår ikke i kortet, men kan læses for sig.
        const medPins = [...rækker, { kilde: "scenarie", sti: "_koersel.data_commit", vaerdi_json: '"abc"' }];
        expect(sammeKort(forventet, frosset(medPins))).toBe(true);
        expect(pinsAf(medPins, { model_commit: "m" })).toEqual({ model: "m", data: "abc" });
        expect(sammeKort(forventetFrosset([], felter, b), frosset(rækker))).toBe(false);
        expect(sammeKort(forventetFrosset([{ type: "disable", sti: "tank_lav" }], { ...felter, med_balancering: false }, b), frosset(rækker))).toBe(false);
    });
});

describe("sammenlignelighed (KONTRAKT §6b)", () => {
    const m = JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-16", oploesning: "1h" } });
    const a = { vaerk_id: "v", oploesning: "1h", data_commit: "d", model_commit: "m", oensket_rel_gap: 0.0002, oensket_abs_gap: 1000, manifest_json: m };
    it("ens kørsler er direkte sammenlignelige", () => expect(sammenlignelighed(a, { ...a })).toEqual([]));
    it("navngiver det der afviger", () => {
        expect(sammenlignelighed(a, { ...a, data_commit: "x", oensket_rel_gap: 0.005 })).toEqual(["df-data", "relativt gab"]);
        expect(sammenlignelighed(a, { ...a, manifest_json: null })).toEqual(["periode"]);
    });
});

describe("parrets henvisning", () => {
    it("gemmes som sidste linje og skjules ved visning", () => {
        const id = "0b0c9d6e-1111-4222-8333-944455556666";
        const s = medReference("Hvad er tanken værd?", id);
        expect(referenceAf(s)).toBe(id);
        expect(visBeskrivelse(s)).toBe("Hvad er tanken værd?");
        expect(referenceAf(medReference(s, id))).toBe(id);
        expect(medReference(s, id).match(/reference-scenarie/g)).toHaveLength(1);
    });
    it("feltet reference_scenarie_id vinder; den gamle linje er kun en reserve", () => {
        const a = "0b0c9d6e-1111-4222-8333-944455556666", b = "1b0c9d6e-1111-4222-8333-944455556666";
        expect(referenceId({ reference_scenarie_id: a, beskrivelse: medReference("x", b) })).toBe(a);
        expect(referenceId({ reference_scenarie_id: null, beskrivelse: medReference("x", b) })).toBe(b);
        expect(referenceId({ beskrivelse: "x" })).toBeUndefined();
    });
});
