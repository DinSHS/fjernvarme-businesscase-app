// Guiden "Nyt værk fra bunden" (brief 15 B): trinvalidering og sammensætning af bladene.
import { describe, expect, it } from "vitest";
import { læsFixture } from "./fixture-vaerker";
import { findFelt } from "./katalog";
import {
    TRIN, bygVaerk, erRettet, foreslåKode, førsteFejltrin, manglendeObligatoriske, manglendePriser, prisfelter, prøvekørselFelter, PRØVEPERIODE,
    skalerVarmelast, startUdkast, tjekTrin, type NytVaerkSkabelon, type Udkast,
} from "./nyt-vaerk";
import { NYT_VAERK_SKABELON } from "./nyt-vaerk.data";
import { afflad } from "@/lib/data/afflad";

const fx = læsFixture();
const andeby = fx.blade.get(fx.vaerker.find((v) => v.kode === "andeby")!.id)!;

/**
 * Skabelonen guiden testes mod: fv-eksperts (viden/nyt_vaerk_skabelon.json), når den findes; ellers en
 * MIDLERTIDIG af Andebys rigtige blade — alt uden balancering, lagre og andre enheder end gaskedlen.
 */
function skabelon(): NytVaerkSkabelon {
    if (NYT_VAERK_SKABELON) return NYT_VAERK_SKABELON;
    const blade = andeby
        .filter((b) => !/^(balancing|ancillary_groups|grid|storage)\./.test(b.sti))
        .filter((b) => !b.sti.startsWith("units.") || b.sti.startsWith("units.gaskedel_agg."))
        .map((b) => ({ sti: b.sti.replace("units.gaskedel_agg.", "units.gaskedel."), vaerdi_json: b.vaerdi_json, bekraeft: b.bekraeft, kommentar: b.kommentar }));
    return {
        blade,
        varmelast: { reference_gwh: 100, skaleres: ["heat_load_params.baseline_profile_mw", "heat_load_params.gaf_mw_per_k", "heat_load_params.nettab_slope_mw_per_k"], tekst: "lineært med GWh/100 (midlertidig)" },
        dmi: findFelt("data.dmi_area")!.tilladte!.map(String),
        zoner: findFelt("data.price_zone")!.tilladte!.map(String),
        kilde: "MIDLERTIDIG (Andeby uden balancering)",
    };
}
const s = skabelon();
const ctx = { optagneKoder: new Set(fx.vaerker.map((v) => v.kode)) };
const gyldigt = (): Udkast => ({ ...startUdkast(s), kode: "vesterby", navn: "Fjernvarme Vesterby", varme: { kilde: "gwh", gwh: "45" } });
const fejlPå = (trin: (typeof TRIN)[number]["id"], u: Udkast) => tjekTrin(trin, u, s, ctx);

describe("skabelonen", () => {
    it("er gyldig i sig selv: bygget uden ændringer giver 0 klientfejl", () => {
        const r = bygVaerk(gyldigt(), s);
        expect(r.fejl).toEqual([]);
        expect(r.fund.filter((f) => f.alvor === "fejl")).toEqual([]);
    });
    it("startudkastet har skabelonens enhed med dens egne værdier som forvalg", () => {
        const u = startUdkast(s);
        expect(u.enheder.map((e) => e.navn)).toEqual(["gaskedel"]);
        expect(u.enheder[0].type).toBe("gas_boiler");
        expect(u.enheder[0].forvalg?.get("p_max_heat")?.json).toBeDefined();
        expect(u.kode).toBe("");
    });
});

describe("trin 1 — navn og kode", () => {
    it("tomt navn og tom kode stopper trinnet", () => {
        expect(fejlPå("navn", { ...gyldigt(), navn: " ", kode: "" })).toEqual(["Giv værket et navn.", "Giv værket en kode."]);
    });
    it("koden: format, i brug, reserveret", () => {
        expect(fejlPå("navn", { ...gyldigt(), kode: "Mit Værk" })[0]).toMatch(/små bogstaver/);
        expect(fejlPå("navn", { ...gyldigt(), kode: "andeby" })[0]).toMatch(/i brug/);
        expect(fejlPå("navn", { ...gyldigt(), kode: "nyt" })[0]).toMatch(/reserveret/);
        expect(fejlPå("navn", { ...gyldigt(), kode: "x".repeat(61) })[0]).toMatch(/60 tegn/);
        expect(fejlPå("navn", gyldigt())).toEqual([]);
    });
    it("kodeforslaget følger navnet med æ/ø/å omskrevet", () => {
        expect(foreslåKode("Fjernvarme Vesterby Ø")).toBe("fjernvarme_vesterby_oe");
        expect(foreslåKode("  Ærø Fjernvarme A/S ")).toBe("aeroe_fjernvarme_a_s");
    });
});

describe("trin 2–3 — klima og varmebehov", () => {
    it("ukendt klima/priszone stopper", () => {
        expect(fejlPå("klima", { ...gyldigt(), dmi: "bornholm", zone: "DK3" })).toHaveLength(2);
        expect(fejlPå("klima", gyldigt())).toEqual([]);
    });
    it("varmebehovet skal være et positivt tal; dansk komma accepteres", () => {
        expect(fejlPå("varme", { ...gyldigt(), varme: { kilde: "gwh", gwh: "mange" } })[0]).toMatch(/tal i GWh/);
        expect(fejlPå("varme", { ...gyldigt(), varme: { kilde: "gwh", gwh: "0" } })[0]).toMatch(/større end 0/);
        expect(fejlPå("varme", { ...gyldigt(), varme: { kilde: "gwh", gwh: "45000" } })[0]).toMatch(/GWh, ikke MWh/);
        expect(fejlPå("varme", { ...gyldigt(), varme: { kilde: "timedata", gwh: "12,5" } })).toEqual([]);
    });
    it("varmelasten skaleres lineært, elementvis, forbliver decimaltal og markeres [BEKRÆFT]", () => {
        const før = s.blade.find((b) => b.sti === "heat_load_params.baseline_profile_mw")!;
        const efter = skalerVarmelast(s.blade, s.varmelast, s.varmelast.reference_gwh / 2).find((b) => b.sti === før.sti)!;
        const a = JSON.parse(før.vaerdi_json) as number[], b = JSON.parse(efter.vaerdi_json) as number[];
        expect(b).toHaveLength(24);
        b.forEach((x, i) => expect(x).toBeCloseTo(a[i] / 2, 6));
        // Hvert element forbliver et decimaltal i teksten (6.0, ikke 6) — modellens rundtur er typestreng.
        expect(efter.vaerdi_json.slice(1, -1).split(",").every((x) => /[.eE]/.test(x))).toBe(true);
        expect(efter.bekraeft).toBe(true);
        expect(skalerVarmelast([{ sti: "heat_load_params.gaf_mw_per_k", vaerdi_json: "2.0", bekraeft: false }], s.varmelast, s.varmelast.reference_gwh)[0].vaerdi_json).toBe("2.0");
    });
});

describe("trin 4–5 — enheder og lager", () => {
    it("mindst én enhed; dublerede navne og ugyldige tal stopper", () => {
        expect(fejlPå("enheder", { ...gyldigt(), enheder: [] })[0]).toMatch(/mindst én enhed/);
        const u = gyldigt();
        u.enheder.push({ type: "gas_boiler", navn: "gaskedel", værdier: new Map() });
        expect(fejlPå("enheder", u).join()).toMatch(/allerede en enhed/);
        expect(fejlPå("enheder", { ...gyldigt(), enheder: [{ type: "gas_boiler", navn: "g", værdier: new Map([["p_max_heat", "tolv"]]) }] }).join()).toMatch(/ikke et tal/);
    });
    it("lager: tal > 0 kræves, og startindholdet bliver halvfuldt (skøn)", () => {
        const l = { navn: "tank", volumen: "5000", deltaT: "40", pLad: "20", pAflad: "20" };
        expect(fejlPå("lager", { ...gyldigt(), lagre: [{ ...l, volumen: "0" }] })[0]).toMatch(/Volumen skal være/);
        expect(fejlPå("lager", { ...gyldigt(), lagre: [l] })).toEqual([]);
        const r = bygVaerk({ ...gyldigt(), lagre: [l] }, s);
        const v = new Map(r.blade.map((b) => [b.sti, b]));
        expect(v.get("storage.tank.volume_m3")?.vaerdi_json).toBe("5000.0");
        expect(Number(v.get("storage.tank.e_initial_mwh")?.vaerdi_json)).toBeCloseTo((5000 * 1.163 * 40) / 1000 / 2, 6);
        expect(v.get("storage.tank.e_initial_mwh")?.bekraeft).toBe(true);
        expect(r.fund.filter((f) => f.alvor === "fejl")).toEqual([]);
    });
});

describe("trin 6 — priser og tarif", () => {
    it("en enhed med et brændsel, skabelonen ikke prissætter, kræver en pris", () => {
        // Et biomassebrændsel, skabelonen IKKE har en pris for (den minimale skabelon har kun gas) — vælges, ikke antaget.
        const fuel = ["wood_pellets", "straw", "flis"].find((f) => !s.blade.some((b) => b.sti === `prices.${f}.value`));
        expect(fuel, "skabelonen prissætter alle biomassebrændsler — testen skal have et andet brændsel").toBeDefined();
        const sti = `prices.${fuel}.value`;
        const u = { ...gyldigt(), enheder: [...gyldigt().enheder, { type: "biomass_boiler", navn: "pillekedel", værdier: new Map([["fuel", fuel!]]) }] };
        expect(manglendePriser(u, s)).toEqual([sti]);
        expect(prisfelter(u, s)).toContain(sti);
        expect(fejlPå("priser", u).join()).toMatch(new RegExp(`pris for ${fuel}`));
        u.priser.set(sti, "310");
        expect(fejlPå("priser", u)).toEqual([]);
        const r = bygVaerk(u, s);
        expect(r.blade.find((b) => b.sti === sti)).toMatchObject({ vaerdi_json: "310.0", bekraeft: false });
        expect(r.fund.filter((f) => f.alvor === "fejl")).toEqual([]);
    });
    it("electricity_tax trækker elafgift_net med (paritetsreglen), og en egen pris er ikke længere skøn", () => {
        const u = gyldigt();
        u.priser.set("electricity.electricity_tax", "5,5");
        const r = bygVaerk(u, s);
        const v = new Map(r.blade.map((b) => [b.sti, b]));
        expect(v.get("electricity.electricity_tax")).toMatchObject({ vaerdi_json: "5.5", bekraeft: false });
        if (v.has("electricity.tariff_consumption.fixed_components.elafgift_net")) {
            expect(v.get("electricity.tariff_consumption.fixed_components.elafgift_net")?.vaerdi_json).toBe("5.5");
        }
        expect(r.fund.filter((f) => f.alvor === "fejl")).toEqual([]);
    });
    it("et ugyldigt tal stopper trinnet", () => {
        const u = gyldigt();
        u.priser.set("electricity.electricity_tax", "fire");
        expect(fejlPå("priser", u).join()).toMatch(/ikke et tal/);
    });
});

describe("trin 7 — gennemse", () => {
    it("klientvalideringen af det samlede værk blokerer oprettelse ved en fejl", () => {
        const u = gyldigt();
        u.enheder[0].værdier.set("p_min_heat", "999");
        expect(fejlPå("gennemse", u).join()).toMatch(/p_min > p_max/);
    });
    it("værkets kode, navn, klima og priszone står i bladene; spot_area følger priszonen", () => {
        const r = bygVaerk({ ...gyldigt(), dmi: "ringsted", zone: "DK2" }, s);
        const v = new Map(r.blade.map((b) => [b.sti, b.vaerdi_json]));
        expect(v.get("meta.case_name")).toBe('"vesterby"');
        expect(v.get("data.dmi_area")).toBe('"ringsted"');
        expect(v.get("data.price_zone")).toBe('"DK2"');
        if (v.has("electricity.spot_area")) expect(v.get("electricity.spot_area")).toBe('"DK2"');
        expect(r.fund.some((f) => /Priszonen .* ikke lig/.test(f.besked))).toBe(false);
    });
    it("kun brugerens egne tal mister [BEKRÆFT]; skabelonens skøn bevares", () => {
        const u = gyldigt();
        u.enheder[0].værdier.set("p_max_heat", "15");
        const r = bygVaerk(u, s);
        const b = new Map(r.blade.map((x) => [x.sti, x]));
        expect(b.get("units.gaskedel.p_max_heat")).toMatchObject({ vaerdi_json: "15.0", bekraeft: false });
        expect(b.get("units.gaskedel.type")?.bekraeft).toBe(false);
        for (const sb of s.blade.filter((x) => x.bekraeft && !x.sti.startsWith("units."))) {
            if (!["meta.case_name", "data.dmi_area", "data.price_zone", "electricity.spot_area"].includes(sb.sti)) expect(b.get(sb.sti)?.bekraeft, sb.sti).toBe(true);
        }
    });
    it("førsteFejltrin peger på det trin, der stopper", () => {
        expect(førsteFejltrin(gyldigt(), s, ctx)).toBeNull();
        expect(førsteFejltrin({ ...gyldigt(), enheder: [] }, s, ctx)).toBe("enheder");
        expect(førsteFejltrin({ ...gyldigt(), kode: "" }, s, ctx)).toBe("navn");
    });
});

describe("skabelonens egne regler (viden/nyt_vaerk_skabelon.json)", () => {
    it("guiden bruger fv-eksperts skabelon, ikke den midlertidige", () => {
        expect(NYT_VAERK_SKABELON?.kilde).toMatch(/^viden\/nyt_vaerk_skabelon\.json @ b49aeb0/);
        expect(s.varmelast.reference_gwh).toBe(50);
        expect([...s.varmelast.skaleres].sort()).toEqual(["heat_load_params.baseline_profile_mw", "heat_load_params.gaf_mw_per_k", "heat_load_params.nettab_slope_mw_per_k"]);
    });
    it("standardværket (50 GWh) er skabelonen uændret på varmelast og gaskedel", () => {
        const u = { ...gyldigt(), varme: { kilde: "gwh" as const, gwh: "50" } };
        const v = new Map(bygVaerk(u, s).blade.map((b) => [b.sti, b.vaerdi_json]));
        for (const sti of s.varmelast.skaleres) expect(v.get(sti), sti).toBe(s.blade.find((b) => b.sti === sti)!.vaerdi_json);
        expect(v.get("units.gaskedel.p_max_heat")).toBe("25.0"); // rund(0,5 × 50)
    });
    it("krydstjek mod Andeby: ved G = 105,52 GWh (Andebys målte årsbehov) bliver varmelasten Andebys egen (±0,05 %)", () => {
        const v = new Map(bygVaerk({ ...gyldigt(), varme: { kilde: "gwh", gwh: "105,52" } }, s).blade.map((b) => [b.sti, JSON.parse(b.vaerdi_json)]));
        const a = new Map(andeby.map((b) => [b.sti, JSON.parse(b.vaerdi_json)]));
        for (const sti of ["heat_load_params.gaf_mw_per_k", "heat_load_params.nettab_slope_mw_per_k"]) {
            expect(Math.abs(v.get(sti) / a.get(sti) - 1), sti).toBeLessThan(5e-4);
        }
        const p = v.get("heat_load_params.baseline_profile_mw") as number[], q = a.get("heat_load_params.baseline_profile_mw") as number[];
        p.forEach((x, i) => expect(Math.abs(x / q[i] - 1), `time ${i}`).toBeLessThan(5e-4));
    });
    it("gaskedlen følger varmebehovet — rund(0,5 × G) — indtil brugeren selv sætter effekten", () => {
        const auto = new Map(bygVaerk({ ...gyldigt(), varme: { kilde: "gwh", gwh: "80" } }, s).blade.map((b) => [b.sti, b]));
        expect(auto.get("units.gaskedel.p_max_heat")).toMatchObject({ vaerdi_json: "40.0", bekraeft: true });
        const u = { ...gyldigt(), varme: { kilde: "gwh" as const, gwh: "80" } };
        u.enheder[0].værdier.set("p_max_heat", "35");
        expect(new Map(bygVaerk(u, s).blade.map((b) => [b.sti, b])).get("units.gaskedel.p_max_heat")).toMatchObject({ vaerdi_json: "35.0", bekraeft: false });
    });
    it("enhederne skal dække spidslasten (0,38 MW pr. GWh); solvarme tæller ikke", () => {
        const u = { ...gyldigt(), varme: { kilde: "gwh" as const, gwh: "100" } };
        u.enheder[0].værdier.set("p_max_heat", "30"); // 30 < 38
        expect(fejlPå("enheder", u).join()).toMatch(/spidslasten er ca\. 38 MW/);
        u.enheder.push({ type: "solar_thermal", navn: "sol", værdier: new Map([["p_max_heat", "20"]]) });
        expect(fejlPå("enheder", u).join()).toMatch(/spidslasten/); // solens nameplate dækker ikke spidslast
        u.enheder.push({ type: "electric_boiler", navn: "elkedel", værdier: new Map([["p_max_heat", "10"]]) });
        expect(fejlPå("enheder", u)).toEqual([]);
    });
});

describe("Codex K4-F2 — 'jeg har timedata' omgår ikke kapacitetskontrollen", () => {
    // Codex' modprøve: 50 GWh, timedata-valget og kun en 1 MW gaskedel passerede alle syv trin; prøvekørslen (uden
    // heat_csv) regner på syntesen og blev infeasible. Værket kører på syntesen, indtil et scenarie vælger en fil.
    const lille = (): Udkast => {
        const u = { ...gyldigt(), varme: { kilde: "timedata" as const, gwh: "50" } };
        u.enheder[0].værdier.set("p_max_heat", "1");
        return u;
    };
    it("enhedstrinnet stopper ved timedata som ved GWh (1 MW mod en spidslast på 19 MW)", () => {
        expect(fejlPå("enheder", lille()).join()).toMatch(/spidslasten er ca\. 19 MW/);
    });
    it("guiden kan ikke nå 'Opret' — førsteFejltrin og gennemse stopper begge", () => {
        expect(førsteFejltrin(lille(), s, ctx)).toBe("enheder");
        expect(fejlPå("gennemse", lille()).join()).toMatch(/spidslasten/);
    });
    it("prøvekørslen har ingen heat_csv — den regner på syntesen, som kontrollen gælder", () => {
        expect(prøvekørselFelter("v1")).not.toHaveProperty("heat_csv");
    });
    it("standardens 25 MW består også i timedata-tilstand", () => {
        expect(fejlPå("enheder", { ...gyldigt(), varme: { kilde: "timedata", gwh: "50" } })).toEqual([]);
    });
    it("den tomme lagerblok storage: {} fjernes, når der kommer et lager (ellers er storage både blad og forælder)", () => {
        expect(s.blade.some((b) => b.sti === "storage" && b.vaerdi_json === "{}")).toBe(true);
        const uden = bygVaerk(gyldigt(), s).blade;
        expect(uden.some((b) => b.sti === "storage")).toBe(true);
        const med = bygVaerk({ ...gyldigt(), lagre: [{ navn: "tank", volumen: "4000", deltaT: "40", pLad: "15", pAflad: "15" }] }, s).blade;
        expect(med.some((b) => b.sti === "storage")).toBe(false);
        expect(() => afflad(med)).not.toThrow();
        expect(() => afflad(uden)).not.toThrow();
    });
    it("et rigt værk (tre enheder, lager, egne priser) samles uden konflikter og uden klientfejl", () => {
        const u = { ...gyldigt(), varme: { kilde: "gwh" as const, gwh: "60" }, lagre: [{ navn: "tank", volumen: "6000", deltaT: "45", pLad: "20", pAflad: "20" }] };
        u.enheder.push({ type: "heat_pump", navn: "vp", værdier: new Map() }, { type: "biomass_boiler", navn: "flis", værdier: new Map([["fuel", "flis"]]) });
        u.priser.set("prices.flis.value", "232");
        const r = bygVaerk(u, s);
        expect(() => afflad(r.blade)).not.toThrow();
        expect(r.fejl).toEqual([]);
        expect(r.fund.filter((f) => f.alvor === "fejl")).toEqual([]);
        expect(new Set(r.blade.map((b) => b.sti)).size).toBe(r.blade.length); // ingen dubletter
    });
});

describe("skabelonens obligatoriske felter (backend tjekker kun struktur)", () => {
    const altid = (s.obligatoriske?.altid ?? []) as string[];
    it("listen findes og har stier", () => {
        expect(altid).toEqual(expect.arrayContaining(["meta.case_name", "electricity.electricity_tax", "prices.co2_eua.value"]));
    });
    it("standardværket har dem alle", () => {
        expect(manglendeObligatoriske(bygVaerk(gyldigt(), s).blade, s)).toEqual([]);
    });
    it("hver sti i listen fanges, hvis den mangler eller er tom — og blokerer gennemse", () => {
        const blade = bygVaerk(gyldigt(), s).blade;
        for (const sti of altid.filter((x) => /^[a-z_]+(\.[a-z0-9_]+)+$/.test(x))) {
            expect(manglendeObligatoriske(blade.filter((b) => b.sti !== sti), s).join(), sti).toMatch(new RegExp(sti.replace(/\./g, "\\.")));
            expect(manglendeObligatoriske(blade.map((b) => (b.sti === sti ? { ...b, vaerdi_json: "null" } : b)), s), sti).toHaveLength(1);
        }
    });
});

describe("efter oprettelsen", () => {
    it("prøvekørslen er 2 døgn (inklusiv), uden balancering", () => {
        const f = prøvekørselFelter("v1");
        expect(f).toMatchObject({ vaerk_id: "v1", periode_start: PRØVEPERIODE.start, periode_slut: PRØVEPERIODE.slut, med_balancering: false, mip_rel_gap: 0.0002, mip_abs_gap: 100 });
        expect((Date.parse(f.periode_slut) - Date.parse(f.periode_start)) / 86_400_000 + 1).toBe(2);
    });
    it("et felt tæller som rettet, når det er ændret efter oprettelsen", () => {
        expect(erRettet("2026-10-16T10:00:00.500Z", "2026-10-16T10:00:00Z")).toBe(false);
        expect(erRettet("2026-10-16T10:05:00Z", "2026-10-16T10:00:00Z")).toBe(true);
        expect(erRettet(null, "2026-10-16T10:00:00Z")).toBe(false);
    });
});
