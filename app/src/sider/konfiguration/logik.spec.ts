// Logikken bag konfigurationen: kodning, redigering, ny/fjern enhed, diff, YAML, tarif, validering, budskaber.
import { describe, expect, it } from "vitest";
import { læsFixture } from "./fixture-vaerker";
import { parseJV, serialiserJV } from "./jsontekst";
import { anmodningsLængde, anvend, fjernObjekt, kladde, kodFelt, listeJson, nyEnhed, scenarieReferencer, tjekNavn, ændringerFraUdkast } from "./redigering";
import { findFelt, ENHEDSTYPER } from "./katalog";
import { diffKoersel } from "./diff";
import { rekonstruerYaml, yamlNøgle } from "./yaml";
import { laesTarif, interval } from "./tarif";
import { validerVaerk, tjekFelt } from "./validering";
import { enhed, feltnavn, grupper, objektnavne, opslag } from "./gruppering";
import { enhedBudskab, elBudskab, kortDato, priserBudskab, tidBudskab, vaerkBudskab } from "./budskaber";
import { nyeFejl } from "./useRedigering";
import { filtrerLog, revisioner } from "./historik-logik";
import { senesteKoersel } from "./oversigt-logik";
import { visFelt, redigerbarTekst } from "./vis";

const fx = læsFixture();
const andeby = fx.vaerker.find((v) => v.kode === "andeby")!;
const blade = fx.blade.get(andeby.id)!;
const nu = opslag(blade);

describe("jsontekst — bevarer talenes tekst", () => {
    it("rundtur er tegn-for-tegn ens for ALLE blade i de 7 værker", () => {
        let n = 0;
        for (const l of fx.blade.values()) for (const b of l) { expect(serialiserJV(parseJV(b.vaerdi_json)), b.sti).toBe(b.vaerdi_json); n++; }
        expect(n).toBe([...fx.blade.values()].reduce((s, l) => s + l.length, 0));
    });
    it("6.0 forbliver 6.0 (JSON.parse ville gøre det til 6)", () => {
        expect(serialiserJV(parseJV("[6.0,6,-1.5e3]"))).toBe("[6.0,6,-1.5e3]");
        expect(JSON.stringify(JSON.parse("[6.0]"))).toBe("[6]"); // fælden, parseren findes for
    });
    it("afviser ugyldig JSON", () => { expect(() => parseJV("[1,")).toThrow(); expect(() => parseJV("1 2")).toThrow(); });
});

describe("kodning af input efter typen", () => {
    it("decimalfelt forbliver decimaltal; dansk komma accepteres", () => {
        expect(kodFelt(findFelt("units.halmkedel.p_max_heat"), "12.0", "13")).toBe("13.0");
        expect(kodFelt(findFelt("units.halmkedel.p_max_heat"), "12.0", "12,5")).toBe("12.5");
    });
    it("heltal afviser decimaler", () => {
        expect(kladde(findFelt("units.halmkedel.min_uptime"), "4", "4,5").fejl).toMatch(/helt tal/);
    });
    it("et tomt (null) decimalfelt kodes efter katalogets type, ikke som heltal", () => {
        expect(kodFelt(findFelt("storage.tank_lav.e_max_mwh"), "null", "380")).toBe("380.0");
        expect(kodFelt(findFelt("storage.tank_lav.e_max_mwh"), "null", "")).toBe("null");
    });
    it("tekst og valg kodes som JSON-streng; bool som true/false", () => {
        expect(kodFelt(findFelt("units.halmkedel.fuel"), '"straw"', "flis")).toBe('"flis"');
        expect(kodFelt(findFelt("units.halmkedel.enabled"), "true", "nej")).toBe("false");
        expect(kodFelt(findFelt("units.halmkedel.initial_status"), "1", "0")).toBe("0");
    });
    it("redigerbarTekst er det, brugeren ville skrive, og visFelt viser dansk", () => {
        expect(redigerbarTekst("12.5")).toBe("12,5");
        expect(redigerbarTekst('"straw"')).toBe("straw");
        expect(visFelt('[{"t_ambient":-10.0,"heat_mw":1.0,"el_mw":0.5}]')).toBe("1 punkter");
        expect(visFelt("[10,11,12]")).toBe("10 · 11 · 12");
    });
});

describe("udkast -> ændringer", () => {
    it("kun faktisk ændrede felter bliver 'ret'; uændret input giver ingen ændring", () => {
        const u = new Map([
            ["units.halmkedel.p_max_heat", kladde(findFelt("units.halmkedel.p_max_heat"), "12.0", "14")],
            ["units.halmkedel.var_om", kladde(findFelt("units.halmkedel.var_om"), "30.0", "30,0")],
        ]);
        const { ændringer, fejl } = ændringerFraUdkast(u, nu);
        expect(fejl).toEqual([]);
        expect(ændringer).toEqual([{ sti: "units.halmkedel.p_max_heat", handling: "ret", ny_json: "14.0" }]);
    });
    it("inputfejl og forsvundne felter blokerer", () => {
        const u = new Map([
            ["units.halmkedel.p_max_heat", kladde(findFelt("units.halmkedel.p_max_heat"), "12.0", "tolv")],
            ["units.findes_ikke.p_max_heat", { tekst: "1", json: "1.0", fejl: null }],
        ]);
        const { ændringer, fejl } = ændringerFraUdkast(u, nu);
        expect(ændringer).toEqual([]);
        expect(fejl.map((f) => f.sti)).toEqual(["units.halmkedel.p_max_heat", "units.findes_ikke.p_max_heat"]);
    });
    it("kun NYE fejl blokerer gem (en arvet fejl må ikke låse værket)", () => {
        const før = validerVaerk(nu);
        const efter = validerVaerk(anvend(nu, [{ sti: "units.halmkedel.p_min_heat", handling: "ret", ny_json: "20.0" }]));
        expect(nyeFejl(før, efter).map((f) => f.besked)).toEqual(["halmkedel: p_min > p_max."]);
        expect(nyeFejl(efter, efter)).toEqual([]);
    });
    it("anmodningens længde måles som gemVaerksaendringer sender den", () => {
        expect(anmodningsLængde([{ sti: "a.b", handling: "slet" }])).toBe(JSON.stringify([{ sti: "a.b", handling: "slet" }]).length);
    });
});

describe("lister", () => {
    it("COP-tabellen redigeres celle for celle og bevarer decimaltal", () => {
        const kol = ["t_ambient", "heat_mw", "el_mw"];
        const rk = [[{ tekst: "-10", base: "-10.0" }, { tekst: "2,6", base: "2.55" }, { tekst: "1", base: "1.062" }]];
        expect(listeJson(kol, rk)).toBe('[{"t_ambient":-10.0,"heat_mw":2.6,"el_mw":1.0}]');
    });
    it("skalarliste (måneder) bevarer heltal og navngiver den fejlende celle", () => {
        expect(listeJson(null, [[{ tekst: "4", base: "4" }], [{ tekst: "5", base: "4" }]])).toBe("[4,5]");
        expect(() => listeJson(null, [[{ tekst: "4,5", base: "4" }]])).toThrow(/element 1/);
    });
});

describe("ny enhed fra skabelonen", () => {
    it("alle skabelonens blade oprettes, brugerens værdier har skabelonens type", () => {
        const { ændringer, fejl } = nyEnhed("biomass_boiler", "halm_ny", new Map([["p_max_heat", "8"], ["fuel", "flis"], ["uc_enabled", "nej"]]));
        expect(fejl).toEqual([]);
        const m = new Map(ændringer.map((æ) => [æ.sti, æ.ny_json]));
        expect(ændringer.every((æ) => æ.handling === "opret")).toBe(true);
        expect(m.get("units.halm_ny.p_max_heat")).toBe("8.0");
        expect(m.get("units.halm_ny.fuel")).toBe('"flis"');
        expect(m.get("units.halm_ny.uc_enabled")).toBe("false");
        expect(m.get("units.halm_ny.min_uptime")).toBe("4"); // heltal i skabelonen forbliver heltal
        expect(m.get("units.halm_ny.p_min_heat")).toBe("3.0"); // decimaltal i skabelonen bevaret (ikke "3")
        expect(m.size).toBe(ENHEDSTYPER.biomass_boiler.skabelon.length);
    });
    it("hver enhedstypes skabelon giver et gyldigt værk, når den lægges i Andeby", () => {
        const før = validerVaerk(nu);
        for (const type of Object.keys(ENHEDSTYPER)) {
            const { ændringer } = nyEnhed(type, `ny_${type}`, new Map());
            expect(nyeFejl(før, validerVaerk(anvend(nu, ændringer))), type).toEqual([]);
        }
    });
    it("navn: format og kollision med både enheder og lagre", () => {
        const o = objektnavne(blade);
        expect(tjekNavn("Halm Ny", o)).toMatch(/små bogstaver/);
        expect(tjekNavn("halmkedel", o)).toMatch(/allerede en enhed/);
        expect(tjekNavn("tank_lav", o)).toMatch(/lager/);
        expect(tjekNavn("halm_ny", o)).toBeNull();
    });
});

describe("fjern enhed", () => {
    it("sletter enhedens blade og dens balanceringslofter, og navngiver referencer", () => {
        const f = fjernObjekt("units", "vp_luft_vand", blade);
        const egne = blade.filter((b) => b.sti.startsWith("units.vp_luft_vand.")).length;
        expect(f.medslettes.sort()).toEqual([
            "balancing.ancillary_caps.per_unit_market_mw.vp_luft_vand.afrr",
            "balancing.ancillary_caps.per_unit_market_mw.vp_luft_vand.mfrr",
            "balancing.ancillary_caps.per_unit_mw.vp_luft_vand",
        ]);
        expect(f.ændringer).toHaveLength(egne + 3);
        expect(f.nævnt).toEqual(expect.arrayContaining(["balancing.reservation_gate.afrr.opportunity_cost.reference_unit"]));
        // Uden at rette referencerne ville valideringen fange det:
        expect(validerVaerk(anvend(nu, f.ændringer)).some((x) => /reference_unit=vp_luft_vand findes ikke/.test(x.besked))).toBe(true);
    });
    it("en enhed uden referencer kan fjernes uden nye fejl", () => {
        const f = fjernObjekt("units", "fliskedel", blade);
        expect(f.nævnt).toEqual([]);
        expect(nyeFejl(validerVaerk(nu), validerVaerk(anvend(nu, f.ændringer)))).toEqual([]);
    });
    it("scenarier der slår enheden til/fra eller sætter et felt under den, tæller som referencer", () => {
        const æ = [
            { scenarie_id: "s1", type: "disable", sti: "halmkedel" },
            { scenarie_id: "s2", type: "set", sti: "units.halmkedel.p_max_heat" },
            { scenarie_id: "s3", type: "set", sti: "units.halmkedel_2.p_max_heat" },
            { scenarie_id: "s4", type: "disable", sti: "gasmotor" },
        ];
        expect([...scenarieReferencer("units", "halmkedel", æ)].sort()).toEqual(["s1", "s2"]);
    });
});

describe("diff mod en kørsels frosne input", () => {
    const k = fx.koersler.find((x) => x.vaerk_id === andeby.id && fx.input.some((r) => r.koersel_id === x.id))!;
    const input = fx.input.filter((r) => r.koersel_id === k.id);
    it("den rigtige kørsel matcher værket nu (revision 1, intet ændret)", () => {
        expect(input.filter((r) => r.kilde === "vaerk")).toHaveLength(blade.length);
        expect(diffKoersel(input, blade)).toEqual([]);
    });
    it("finder ændret, tilføjet og fjernet — og 12 mod 12.0 er en ændring", () => {
        const ny = blade
            .filter((b) => b.sti !== "units.fliskedel.var_om")
            .map((b) => (b.sti === "units.halmkedel.p_max_heat" ? { ...b, vaerdi_json: "12" } : b))
            .concat([{ ...blade[0], sti: "units.ny.enabled", vaerdi_json: "true" }]);
        const d = diffKoersel(input, ny);
        expect(d.map((x) => [x.art, x.sti])).toEqual(expect.arrayContaining([
            ["ændret", "units.halmkedel.p_max_heat"], ["fjernet", "units.fliskedel.var_om"], ["tilføjet", "units.ny.enabled"],
        ]));
        expect(d).toHaveLength(3);
    });
});

describe("rekonstrueret YAML", () => {
    const y = rekonstruerYaml(blade);
    it("hvert blad står med sin JSON-tekst under sin nøgle", () => {
        for (const b of blade) expect(y.includes(`${yamlNøgle(b.sti.split(".").pop()!)}: ${b.vaerdi_json}`), b.sti).toBe(true);
    });
    it("nøgler der ligner tal/bool citeres", () => {
        expect(yamlNøgle("06-21")).toBe('"06-21"');
        expect(yamlNøgle("on")).toBe('"on"');
        expect(yamlNøgle("p_max_heat")).toBe("p_max_heat");
    });
    it("rækkefølgen følger kildefilen: meta før units før balancing", () => {
        expect(y.indexOf("\nmeta:")).toBeLessThan(y.indexOf("\nunits:"));
        expect(y.indexOf("\nunits:")).toBeLessThan(y.indexOf("\nbalancing:"));
    });
});

describe("tarif og validering — brud", () => {
    it("interval-nøgler læses halvåbent", () => { expect(interval("06-21")).toEqual([6, 21]); expect(interval("6–21")).toBeNull(); });
    it("et fjernet interval giver huller; elafgift-paritet brudt; udefineret bånd", () => {
        const m = new Map(nu);
        m.delete("electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.06-21");
        m.set("electricity.electricity_tax", "5.0");
        m.set("electricity.tariff_consumption.net_tariff.seasons.sommer.weekend.00-06", '"nat"');
        const f = laesTarif(m).fejl.map((x) => x.besked).join("\n");
        expect(f).toMatch(/timerne 6, 7, .*20 er ikke dækket/);
        expect(f).toMatch(/elafgift_net \(4\) afviger fra electricity\.electricity_tax \(5\)/);
        expect(f).toMatch(/båndet "nat"/);
    });
    it("overlap og måned i to sæsoner", () => {
        const m = new Map(nu);
        m.set("electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.05-07", '"lav"');
        m.set("electricity.tariff_consumption.net_tariff.seasons.sommer.months", "[3,4,5,6,7,8,9]");
        const f = laesTarif(m).fejl.map((x) => x.besked).join("\n");
        expect(f).toMatch(/Time 05 er dækket to gange/);
        expect(f).toMatch(/Måned 3 står i både/);
    });
    it("validerVaerk fanger de klassiske brud med modellens beskeder", () => {
        const m = new Map(nu);
        m.set("units.halmkedel.foo", "1");
        m.delete("prices.co2_eua.value");
        m.set("units.vp_luft_vand.cop_curve.points", '[{"t_ambient":-10.0,"heat_mw":1.0,"el_mw":2.0},{"t_ambient":-10.0,"heat_mw":3.0,"el_mw":1.0}]');
        m.set("data.dmi_area", '"bornholm"');
        m.set("units.gaskedel_agg.enabled", "true");
        m.delete("prices.natural_gas.value");
        m.set("heat_load_params.baseline_profile_mw", "[1.0,2.0]");
        const f = validerVaerk(m).filter((x) => x.alvor === "fejl").map((x) => x.besked).join("\n");
        expect(f).toMatch(/ukendt felt "foo"/);
        expect(f).toMatch(/prices\.co2_eua mangler/);
        expect(f).toMatch(/COP 0,50/);
        expect(f).toMatch(/samme udetemperatur/);
        expect(f).toMatch(/"bornholm" er ikke tilladt/);
        expect(f).toMatch(/bruger natural_gas, men prisen/);
        expect(f).toMatch(/præcis 24 tal/);
    });
    it("ingen aktive enheder er en fejl", () => {
        const m = new Map(nu);
        for (const u of objektnavne(blade).units) m.set(`units.${u}.enabled`, "false");
        expect(validerVaerk(m).some((x) => /Ingen aktive produktionsenheder/.test(x.besked))).toBe(true);
    });
    it("feltniveau: min eksklusiv, heltal, enum med tal", () => {
        expect(tjekFelt("solver.time_limit", "0.0")?.besked).toMatch(/> 0/);
        expect(tjekFelt("units.x.min_uptime", "1.5")?.besked).toMatch(/helt tal/);
        expect(tjekFelt("units.x.initial_status", "2")?.besked).toMatch(/ikke tilladt/);
        expect(tjekFelt("units.x.initial_status", "1")).toBeNull();
    });
});

describe("budskaber regnet af data (Andeby)", () => {
    const g = grupper(blade);
    const enheder = g.efterId("enheder").objekter.map(enhed);
    it("værk, enheder og én enhed", () => {
        expect(vaerkBudskab(g, enheder, [])).toMatch(/^8 enheder \(6 slået til: 51 MW styrbar varme \+ 22 MW solvarme \(profilbundet\)\)/);
        expect(enhedBudskab(enheder.find((e) => e.navn === "halmkedel")!)).toBe("12 MW biomassekedel på halm, virkningsgrad 0,96, minimumslast 4 MW, mindst 4 timers drift.");
        expect(enhedBudskab(enheder.find((e) => e.navn === "vp_luft_vand")!)).toMatch(/COP 2,40 ved -10 °C til 3,39 ved 16 °C/);
    });
    it("priser, el og tid", () => {
        expect(priserBudskab(nu)).toMatch(/^Billigst er overskudsvarme \(50 kr\.\/MWh\), dyrest naturgas \(606 kr\.\/MWh\)\. CO₂-kvoter: 600 kr\.\/t\.$/);
        expect(elBudskab(laesTarif(nu), nu)).toBe("Dyreste bånd (spids, 29,5 kr./MWh) gælder vinter, hverdag kl. 06–21; faste tillæg 115 kr./MWh, så profilens billigste time koster 122,4 kr./MWh (126,4 med elafgift); elafgift 4 kr./MWh = elafgift_net.");
        expect(tidBudskab(nu)).toBe("Periode 1. jul. 2025 – 30. jun. 2026 i 1h-opløsning; vejr fra karup, priszone DK1; MIP-gab 0,10 %.");
        expect(kortDato("2026-01-05")).toBe("5. jan. 2026");
    });
    it("Billund uden tarifprofil får den flade sats i budskabet", () => {
        const b = fx.vaerker.find((v) => v.kode === "billund_spora")!;
        const m = opslag(fx.blade.get(b.id)!);
        expect(elBudskab(laesTarif(m), m)).toMatch(/^Flad forbrugstarif .* \(ingen tarifprofil\)/);
    });
    it("feltnavn tilføjer de frie navne fra stjernerne, men ikke enhedens", () => {
        const vb = (sti: string) => g.alle.find((b) => b.sti === sti)!;
        expect(feltnavn(vb("electricity.tariff_consumption.net_tariff.bands.spids"))).toBe("Tarifbånd · spids");
        expect(feltnavn(vb("electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.06-21"))).toMatch(/· vinter 06-21$/);
        expect(feltnavn(vb("units.halmkedel.p_max_heat"))).toBe(findFelt("units.halmkedel.p_max_heat")!.etiket);
    });
});

describe("oversigt og revisionslog", () => {
    it("seneste kørsel pr. værk", () => {
        const m = senesteKoersel([{ vaerk_id: "a", bestilt: "2026-10-16T07:00:00Z", n: 1 }, { vaerk_id: "a", bestilt: "2026-10-16T08:00:00Z", n: 2 }]);
        expect(m.get("a")?.n).toBe(2);
    });
    it("revisioner grupperes, importen genkendes, og filteret virker", () => {
        const log = [
            { id: "1", revision: 1, sti: "units.a.x", handling: "opret", aendret_af: "imp", tidspunkt: "2026-10-16T06:00:00Z" },
            { id: "2", revision: 2, sti: "units.a.x", handling: "ret", gammel_json: "1", ny_json: "2", aendret_af: "p", tidspunkt: "2026-10-16T07:00:00Z" },
            { id: "3", revision: 2, sti: "prices.straw.value", handling: "ret", aendret_af: "p", tidspunkt: "2026-10-16T07:00:00Z" },
        ];
        const r = revisioner(log);
        expect(r.map((x) => x.revision)).toEqual([2, 1]);
        expect(r[1].resume).toBe("1 opret (import)");
        expect(r[0].resume).toBe("2 ret i units.a, prices");
        expect(filtrerLog(log, "UNITS.A", false).map((x) => x.id)).toEqual(["2"]);
        expect(filtrerLog(log, "", true)).toHaveLength(3);
    });
});
