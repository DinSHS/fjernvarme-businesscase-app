// Codex K3 (rapporter/K3_codex.md), fund N6 og N7 — Codex' egne modprøver som tests.
// Skrevet FØR rettelsen og set fejle; reglerne er modellens (src/tariff.py, src/config.py @ b49aeb0).
import { describe, expect, it } from "vitest";
import { læsFixture } from "./fixture-vaerker";
import { opslag } from "./gruppering";
import { TARIF, laesTarif } from "./tarif";
import { tjekFelt, validerVaerk } from "./validering";
import { elBudskab } from "./budskaber";

const fx = læsFixture();
const vaerk = (kode: string) => opslag(fx.blade.get(fx.vaerker.find((v) => v.kode === kode)!.id)!);
const andeby = vaerk("andeby");
const spora = vaerk("billund_spora");

/** Billund Spor A (ingen profil) + en tarifprofil bygget af stier. */
function medProfil(blade: Record<string, string>): Map<string, string> {
    const m = new Map(spora);
    for (const [s, j] of Object.entries(blade)) m.set(`${TARIF}.${s}`, j);
    return m;
}
const helDag = { "weekday.00-24": '"brugt"', "weekend.00-24": '"brugt"' };

describe("N6 — profilens billigste time regnes kun af bånd, der faktisk bruges", () => {
    it("Codex' modprøve: ubrugt bånd på −1000 giver 215, ikke −885", () => {
        const m = medProfil({
            unit: '"kr_per_mwh"', "fixed_components.energinet": "115.0",
            "net_tariff.bands.brugt": "100.0", "net_tariff.bands.ubrugt": "-1000.0",
            "net_tariff.seasons.hele.months": "[1,2,3,4,5,6,7,8,9,10,11,12]",
            ...Object.fromEntries(Object.entries(helDag).map(([k, v]) => [`net_tariff.seasons.hele.${k}`, v])),
        });
        const t = laesTarif(m);
        expect(t.fejl).toEqual([]); // modellens parser accepterer profilen
        expect(t.billigsteTime).toBe(215);
        expect(elBudskab(t, m)).toMatch(/profilens billigste time koster 215,0 kr\.\/MWh/);
        expect(elBudskab(t, m)).not.toMatch(/-885|−885/);
    });
    it("Andeby er uændret: 7,4 + 115 = 122,4", () => {
        expect(laesTarif(andeby).billigsteTime).toBeCloseTo(122.4, 10);
    });
});

describe("N7.1 — obligatoriske værdier må ikke være null (catalog `paakraevet`)", () => {
    it("Codex' modprøve: electricity.electricity_tax = null i Billund Spor A er en fejl", () => {
        const m = new Map(spora);
        m.set("electricity.electricity_tax", "null");
        expect(tjekFelt("electricity.electricity_tax", "null")?.alvor).toBe("fejl");
        expect(validerVaerk(m).some((f) => f.alvor === "fejl" && f.sti === "electricity.electricity_tax")).toBe(true);
    });
    it("gælder alle påkrævede felter, også dem der før kun blev tjekket for tilstedeværelse", () => {
        for (const sti of ["electricity.spot_area", "electricity.tariff_consumption_flat", "data.price_zone", "time.start",
            "balancing.bid_strategy.up_markup_dkk_mwh", "balancing.reservation_gate.afrr.block_mw", "units.halmkedel.p_max_heat"]) {
            const m = new Map(andeby);
            m.set(sti, "null");
            expect(validerVaerk(m).some((f) => f.alvor === "fejl" && f.sti === sti), sti).toBe(true);
        }
    });
    it("et valgfrit felt må stadig være tomt (e_max_mwh: null = beregnes af volumen)", () => {
        expect(tjekFelt("storage.tank_lav.e_max_mwh", "null")).toBeNull();
    });
});

describe("N7.2 — en ufuldstændig tarifprofil er ikke 'ingen profil' (src/tariff.py:218-240)", () => {
    it("Codex' modprøve: kun fixed_components.energinet giver fejl, og budskabet siger ikke 'ingen tarifprofil'", () => {
        const m = medProfil({ "fixed_components.energinet": "115.0" });
        const t = laesTarif(m);
        expect(t.findes).toBe(true);
        expect(t.fejl.map((f) => f.besked).join("\n")).toMatch(/net_tariff\.seasons mangler eller er tom/);
        expect(validerVaerk(m).some((f) => f.alvor === "fejl" && /seasons mangler/.test(f.besked))).toBe(true);
        expect(elBudskab(t, m)).not.toMatch(/ingen tarifprofil/);
        expect(elBudskab(t, m)).toMatch(/ufuldstændig/);
    });
    it("manglende unit afvises (modellen læser den som '' og kræver 'kr_per_mwh')", () => {
        const m = medProfil({
            "net_tariff.bands.brugt": "100.0", "net_tariff.seasons.hele.months": "[1,2,3,4,5,6,7,8,9,10,11,12]",
            ...Object.fromEntries(Object.entries(helDag).map(([k, v]) => [`net_tariff.seasons.hele.${k}`, v])),
        });
        expect(laesTarif(m).fejl.map((f) => f.besked).join("\n")).toMatch(/unit skal være 'kr_per_mwh'/);
    });
    it("en sæson uden months/weekday/weekend afvises (modellen giver KeyError)", () => {
        const m = medProfil({ unit: '"kr_per_mwh"', "net_tariff.bands.brugt": "100.0", "net_tariff.seasons.hele.weekday.00-24": '"brugt"' });
        const f = laesTarif(m).fejl.map((x) => x.besked).join("\n");
        expect(f).toMatch(/hele: months mangler/);
        expect(f).toMatch(/hele: weekend mangler/);
    });
    it("Billund uden profil og Andeby med komplet profil giver stadig ingen tariffejl", () => {
        expect(laesTarif(spora)).toMatchObject({ findes: false, fejl: [] });
        expect(laesTarif(andeby).fejl).toEqual([]);
        expect(elBudskab(laesTarif(spora), spora)).toMatch(/ingen tarifprofil/);
    });
});

