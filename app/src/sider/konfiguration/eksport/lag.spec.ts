// Runde 14: appens egne faner i værksarket (Start og drift, Balancemarked, Øvrige felter).
//
// Målt baggrund: et rigtigt værk blev lagt ind via arket, og alle enheder stod til slukket ved start, balancemarkedet
// kunne ikke stå i arket, og 71–106 felter pr. katalogværk stod på listen "ikke med i arket". Testene her forhindrer, at
//   * et felt i værket hverken står i arket eller på listen (tavst tab);
//   * en celle læses med en anden type end den, importen gemmer (vektorerne binder TS og Python);
//   * en række i Øvrige felter tavst skjuler en celle i modelrepoets faner (betingelsen);
//   * et ark i det gamle format tavst bliver et nyt værk, når værket findes.
// Importens side (fabric/fjv/arklag.py) prøves i fabric/tests/test_arklag.py, og hele kæden med modelrepoets script i
// gaten (viden/vaerktoej/tjek_eksport_rundtur.py).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { analyserUpload, type Hentere } from "./analyse";
import { eksporter, læsMarkering, MARKOER_ARK, MARKOER_FORMAT, MARKOER_FORMAT_FOER } from "./eksporter";
import { genkend, læsArkmodel, sammenlign } from "./genkend";
import { planlæg, type Eksportkilde } from "./kort";
import { BALANCEMARKED, celleFor, FINDES_IKKE, jsonFraCelle, LAGFANER, læsLag, OEVRIGE, sammeTal, START_OG_DRIFT } from "./lag";
import { tjekFelt } from "../validering";
import { andeby, ANDEBY_ID, skabelon } from "./testdata";
import { Arbejdsbog, læsCeller } from "./xlsx";

const NU = new Date(Date.UTC(2026, 10, 17, 12));
const blade = (k: Eksportkilde) => new Map(k.blade.map((b) => [b.sti, b.vaerdi_json]));
/** Andeby med blade rettet (null = bladet fjernes) og nye blade tilføjet. */
function andebyMed(ret: Record<string, string | null>): Eksportkilde {
    const k = andeby();
    const set = new Set(k.blade.map((b) => b.sti));
    return {
        ...k,
        blade: [...k.blade.filter((b) => ret[b.sti] !== null).map((b) => ({ ...b, vaerdi_json: ret[b.sti] ?? b.vaerdi_json })),
            ...Object.entries(ret).filter(([s, v]) => v !== null && !set.has(s)).map(([sti, v], j) => ({ sti, vaerdi_json: v as string, raekkefoelge: 10_000 + j }))],
    };
}

// ------------------------------------------------------------------ celle <-> vaerdi_json: vektorerne

const VEKTORFIL = resolve(import.meta.dirname, "../../../../../skema/vektorer/arklag/celler.json");
/** (sti, celle) — bredt: hver type, grænserne, og det et regneark gør ved en indtastning. */
const TILFAELDE: [string, number | string | boolean][] = [
    ["units.x.p_max_heat", 12], ["units.x.p_max_heat", 12.5], ["units.x.p_max_heat", -1], ["units.x.p_max_heat", "12,5"], ["units.x.p_max_heat", true],
    ["units.x.p_max_heat", "null"], ["units.x.min_uptime", 3], ["units.x.min_uptime", 3.5], ["units.x.min_uptime", "3"], ["units.x.commissioned", 2015],
    ["units.x.enabled", "ja"], ["units.x.enabled", "Nej"], ["units.x.enabled", " JA "], ["units.x.enabled", true], ["units.x.enabled", "måske"], ["units.x.enabled", 1],
    ["units.x.enabled", "sand"], ["units.x.enabled", "false"], ["units.x.initial_status", "ja"], ["units.x.initial_status", "nej"], ["units.x.initial_status", 1],
    ["units.x.initial_status", 0], ["units.x.initial_status", 2], ["units.x.initial_status", 0.5], ["units.x.initial_status", "tændt"],
    ["units.x.uc_enabled", "nej"], ["units.x.co2_emissions_per_mwh_fuel", 0.204], ["units.x.co2_emissions_per_mwh_fuel", -0.1], ["units.x.notes", "ja"],
    ["units.x.notes", "Under indkøring — ikke i drift."], ["units.x.notes", 2015], ["units.x.notes", " med kanter "], ["units.x.notes", "null"],
    ["units.x.type", "gas_boiler"], ["units.x.type", "oliekedel"], ["units.x.type", " heat_pump "], ["units.x.fuel", "natural_gas"],
    ["units.x.ancillary.available_from", "2026-03-01"], ["units.x.ancillary.available_from", 46082], ["units.x.ancillary.available_from", 12],
    ["units.x.ancillary.bid_window.months", "[10,11,12,1,2,3]"], ["units.x.ancillary.bid_window.months", "10, 11, 12"], ["units.x.ancillary.bid_window.months", 3],
    ["units.x.ancillary.bid_window.months", "vinter"], ["units.x.ancillary.bid_window.months", '{"a":1}'], ["units.x.ancillary.afrr_max_bid_mw", 1.5],
    ["units.x.findes_ikke", 1], ["units.x", "{}"], ["units.x.ancillary", "{}"],
    ["storage.t.e_initial_mwh", 96], ["storage.t.e_initial_mwh", -1], ["storage.t.e_initial_mwh", "null"], ["storage.t.e_max_mwh", "null"], ["storage.t.e_max_mwh", "NULL"],
    ["storage.t.self_discharge_per_hour", 0], ["storage.t.self_discharge_per_hour", 0.0005], ["storage.t.cycle_binding", "nej"], ["storage.t.volume_m3", 5000],
    ["balancing.method", "activation_value"], ["balancing.method", "gætværk"], ["balancing.robust_reservation", "ja"], ["balancing.ancillary_caps.total_mw", 14],
    ["balancing.ancillary_caps.total_mw", -1], ["balancing.ancillary_caps.per_unit_mw.vp", 6], ["balancing.ancillary_caps.per_unit_market_mw.vp.afrr", 2],
    ["balancing.bid_strategy.up_markup_dkk_mwh", 500], ["balancing.reservation_gate.mode", "bound"], ["balancing.reservation_gate.afrr.block_mw", 3],
    ["balancing.reservation_gate.afrr.opportunity_cost.reference_unit", "vp_luft_vand"], ["balancing.activation.foresight", "profile"],
    ["balancing.activation.afrr.model", "system_share"], ["balancing.activation.afrr.k", 4], ["balancing.availability.afrr.mw_by_month.2026-03", 1.155],
    ["balancing.availability.mode", "energy"], ["grid.max_consumption_mw", 33], ["investment.enabled", "nej"],
    ["meta.tax_year", 2026], ["meta.description", "Fiktivt referenceværk."], ["meta.case_name", "andeby"], ["solver.mip_rel_gap", 0.001], ["solver.time_limit", 3600],
    ["time.start", "2026-03-02T00:00:00Z"], ["time.resolution", "1h"], ["time.resolution", "5min"], ["data.dmi_area", "karup"],
    ["electricity.tariff_consumption_flat", 125], ["electricity.tariff_consumption.source", "Fiktivt netselskab"], ["electricity.tariff_consumption.unit", "kr_per_mwh"],
    ["electricity.tariff_consumption.net_tariff.bands.hoej", 0], ["electricity.tariff_consumption.net_tariff.seasons.vinter.months", "[10,11,12,1,2,3]"],
    ["electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.06-21", "spids"], ["electricity.tariff_consumption.fixed_components.elafgift_net", 4],
    ["heat_load_params.baseline_profile_mw", "[5.66,5.74,5.87]"], ["heat_load_params.baseline_profile_mw", "[5.66, 5.0, 6]"], ["heat_load_params.gaf_mw_per_k", 0.7653],
    ["heat_load_params.gaf_mw_per_k", 1e-5], ["prices.co2_eua.unit", "DKK/t"], ["prices.straw.value", 232], ["prices.fyringsolie.value", 900],
];

/** Det, importen gør med en celle: typen fra kataloget, derefter feltets regler (som en redigering i appen). */
function læsCelle(sti: string, celle: number | string | boolean): { json: string } | { fejl: string } {
    try {
        const json = jsonFraCelle(sti, celle);
        const fund = tjekFelt(sti, json);
        return fund ? { fejl: fund.besked } : { json };
    } catch (e) { return { fejl: e instanceof Error ? e.message : String(e) }; }
}

describe("celle <-> vaerdi_json (fælles vektorer med importen)", () => {
    const beregnet = { _om: "Appens faner i værksarket: en celle som vaerdi_json efter feltkataloget (runde 14). Genereret af app/src/sider/konfiguration/eksport/lag.spec.ts (FJV_SKRIV_VEKTORER=1) fra TypeScript-udgaven; fabric/tests/test_arklag_vektorer.py kræver samme udfald af fjv.feltkatalog. Ret aldrig i hånden.", tilfaelde: TILFAELDE.map(([sti, celle]) => ({ sti, celle, ud: læsCelle(sti, celle) })) };

    it("vektorfilen er den, TypeScript-udgaven giver (Python-udgaven prøves mod samme fil)", () => {
        if (process.env.FJV_SKRIV_VEKTORER) {
            mkdirSync(dirname(VEKTORFIL), { recursive: true });
            writeFileSync(VEKTORFIL, `${JSON.stringify(beregnet, null, 1)}\n`);
        }
        expect(existsSync(VEKTORFIL), "kør: FJV_SKRIV_VEKTORER=1 npx vitest run src/sider/konfiguration/eksport/lag.spec.ts").toBe(true);
        expect(JSON.parse(readFileSync(VEKTORFIL, "utf8"))).toEqual(beregnet);
    });

    it("typen kommer fra kataloget, ikke fra cellen: tal -> decimaltal, heltal -> heltal, ja/nej -> 1/0 eller sand/falsk", () => {
        const ud = (sti: string, c: number | string | boolean) => læsCelle(sti, c);
        expect(ud("units.x.p_max_heat", 12)).toEqual({ json: "12.0" });
        expect(ud("units.x.min_uptime", 3)).toEqual({ json: "3" });
        expect(ud("units.x.initial_status", "ja")).toEqual({ json: "1" });
        expect(ud("units.x.enabled", "nej")).toEqual({ json: "false" });
        expect(ud("units.x.notes", "ja")).toEqual({ json: '"ja"' });
        expect(ud("units.x.ancillary.bid_window.months", "10, 11, 12")).toEqual({ json: "[10,11,12]" });
        expect(ud("units.x.ancillary.available_from", 46082)).toEqual({ json: '"2026-03-01"' });   // Excel gjorde teksten til en dato
        expect(ud("storage.t.e_max_mwh", "null")).toEqual({ json: "null" });
        expect(ud("units.x.findes_ikke", 1)).toEqual({ fejl: expect.stringMatching(/findes ikke i feltkataloget/) });
        expect(ud("units.x.p_max_heat", "12,5")).toEqual({ fejl: expect.stringMatching(/skal være et tal/) });
        expect(ud("balancing.ancillary_caps.total_mw", -1)).toEqual({ fejl: expect.stringMatching(/≥ 0/) });
    });

    it("celleFor er den inverse: cellen læses tilbage til det vaerdi_json, den siger", () => {
        for (const [sti, json] of [["units.x.p_max_heat", "12.0"], ["units.x.initial_status", "1"], ["units.x.enabled", "false"], ["units.x.notes", '"Under indkøring"'],
            ["units.x.ancillary.bid_window.months", "[10,11,12,1,2,3]"], ["storage.t.e_max_mwh", "null"], ["balancing.method", '"activation_value"'], ["meta.tax_year", "2026"]] as const) {
            const c = celleFor(sti, json);
            expect("celle" in c, `${sti}: ${"grund" in c ? c.grund : ""}`).toBe(true);
            if (!("celle" in c)) continue;
            expect(læsCelle(sti, c.celle as number | string)).toEqual({ json: c.json });
            expect(c.json === json || sammeTal(c.json, json), `${sti}: ${c.json} mod ${json}`).toBe(true);
        }
        // Et heltal, hvor kataloget siger tal: cellen giver decimaltallet; skrivemåden bæres af markeringen.
        expect(celleFor("meta.tax_year", "2026")).toEqual({ celle: 2026, json: "2026.0" });
        // Det, en celle ikke kan bære, siges med grunden.
        expect(celleFor("units.x.notes", '"med\\u0001kontroltegn"')).toEqual({ grund: expect.stringMatching(/tegn/) });
        expect(celleFor("units.x.notes", '""')).toEqual({ grund: expect.stringMatching(/tom tekst/) });
        expect(celleFor("prices.fyringsolie.value", "900.0")).toEqual({ grund: expect.stringMatching(/feltkataloget/) });
        expect(celleFor("units.x.initial_status", "2")).toEqual({ grund: expect.stringMatching(/afviser/) });
    });
});

// ------------------------------------------------------------------ planen for fanerne

describe("appens faner bærer det, modelrepoets skabelon ikke kan", () => {
    it("Andeby: kun solprofilens sti er tilbage på listen 'ikke med i arket' (før runde 14: 80 felter)", () => {
        const p = planlæg(andeby());
        expect(p.nægter).toEqual([]);
        expect(p.ikkeMed.map((t) => t.sti)).toEqual(["units.solvarme.production_profile_path"]);
        expect(p.ikkeMed[0].grund).toMatch(/arket Solvarme/);
        expect(p.afvigelser).toEqual([]);                                   // stien er en af konverteringens egne
        // Det, importen gemmer ved upload som nyt værk, er værket — blad for blad og typestrengt.
        const værk = blade(andeby());
        for (const [sti, json] of værk) if (sti !== "units.solvarme.production_profile_path") expect(p.endelig.get(sti), sti).toBe(json);
        expect(p.endelig.size).toBe(værk.size);
        expect(Object.values(p.lagantal).every((n) => n > 0)).toBe(true);
    });

    it("Start og drift: tændt ved start, unit commitment, CO2-faktor, idriftsat og tankens start — også for slåede-fra enheder", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const c = læsCeller(e.bytes);
        const lag = læsLag(c);
        const v = (sti: string) => lag.get(sti)?.v;
        expect(v("units.halmkedel.initial_status")).toBe("ja");            // værket: 1; modelscriptet ville skrive 0
        expect(v("units.gasmotor.uc_enabled")).toBe("nej");
        expect(v("units.fliskedel.enabled")).toBe("nej");                   // slået fra: står nu i Anlaeg med "i drift: nej"
        expect(v("units.halmkedel.commissioned")).toBe(2015);
        expect(v("storage.tank_hoej.e_initial_mwh")).toBe(96);
        expect(lag.get("units.halmkedel.initial_status")?.hvor).toMatch(/^Start og drift!D\d+$/);
        const an = c.get("Anlaeg")!;
        const navne = [...an.entries()].filter(([k, x]) => /^A([5-9]|1\d|2[0-3])$/.test(k) && typeof x === "string").map(([, x]) => x);
        expect(navne).toContain("fliskedel");
        expect(navne).toContain("elkedel_gl");
        // Hver celle læses tilbage til det, planen siger, importen gemmer.
        for (const [sti, x] of lag) {
            if (x.v === undefined || x.v === FINDES_IKKE) { expect(e.plan.endelig.has(sti), sti).toBe(false); continue; }
            const json = jsonFraCelle(sti, x.v);
            const slut = e.plan.endelig.get(sti)!;
            expect(json === slut || sammeTal(json, slut), `${x.hvor} ${sti}: ${json} mod ${slut}`).toBe(true);
        }
    });

    it("Balancemarked: hele blokken og enhedernes budfelter; et værk uden balancemarked får en tom fane", async () => {
        const med = læsLag(læsCeller((await eksporter(andeby(), skabelon(), NU)).bytes));
        expect(med.get("balancing.method")?.v).toBe("activation_value");
        expect(med.get("balancing.ancillary_caps.total_mw")?.v).toBe(14);
        expect(med.get("balancing.reservation_gate.afrr.block_mw")?.v).toBe(3);
        expect(med.get("balancing.reservation_gate.mfrr.opportunity_cost.reference_unit")?.v).toBe("vp_luft_vand");
        expect(med.get("balancing.ancillary_caps.per_unit_mw.vp_luft_vand")?.v).toBe(6);
        expect(med.get("units.gasmotor.ancillary.afrr_max_bid_mw")?.v).toBe(1);
        expect(med.get("units.elkedel_ny.ancillary.bid_window.months")?.v).toBe("[10,11,12,1,2,3]");
        const uden = andebyMed(Object.fromEntries(andeby().blade.filter((b) => b.sti.startsWith("balancing.") || /\.ancillary\.(afrr_max|mfrr_max|bid_window|available)/.test(b.sti)).map((b) => [b.sti, null])));
        const e = await eksporter(uden, skabelon(), NU);
        const tom = [...læsLag(læsCeller(e.bytes)).values()].filter((x) => x.hvor.startsWith(BALANCEMARKED) && x.v !== undefined);
        expect(tom).toEqual([]);
        expect(e.plan.lagantal[BALANCEMARKED]).toBe(0);
        expect([...e.plan.endelig.keys()].filter((s) => s.startsWith("balancing."))).toEqual([]);
    });

    it("Øvrige felter: resten, med betingelsen der viger for en rettelse i modelrepoets faner", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const lag = læsLag(læsCeller(e.bytes));
        const ø = (sti: string) => lag.get(sti);
        expect(ø("investment.enabled")).toMatchObject({ v: "nej", hvor: expect.stringMatching(/^Øvrige felter!B/) });
        expect(ø("investment.enabled")?.betingelse).toBeUndefined();        // modelscriptet skriver intet: rækken gælder altid
        expect(ø("electricity.tariff_consumption_flat")).toMatchObject({ v: 125, betingelse: 129.8 });
        expect(ø("storage.tank_hoej.e_max_mwh")).toMatchObject({ v: "null", betingelse: 191.9 });
        expect(ø("units.solvarme.min_uptime")).toMatchObject({ v: FINDES_IKKE, betingelse: 1 });
        expect(ø("meta.case_name")).toMatchObject({ v: "andeby", betingelse: "andeby_fiktivt_referencevaerk" });
        // Felter, modelrepoets faner bærer, står IKKE i Øvrige felter (ellers kunne rækken skjule en rettelse).
        expect(ø("units.halmkedel.var_om")).toBeUndefined();
        expect(ø("prices.straw.value")).toBeUndefined();
    });

    it("et værk med flad eltarif: rækkerne fjerner tarifskemaet, modelscriptet altid skriver", () => {
        const k = andebyMed(Object.fromEntries(andeby().blade.filter((b) => b.sti.startsWith("electricity.tariff_consumption.")).map((b) => [b.sti, null])));
        const p = planlæg(k);
        expect(p.nægter).toEqual([]);
        expect([...p.endelig.keys()].filter((s) => s.startsWith("electricity.tariff_consumption."))).toEqual([]);
        const rækker = p.celler.filter((c) => c.ark === OEVRIGE && c.v === FINDES_IKKE);
        expect(rækker.length).toBeGreaterThanOrEqual(15);
        expect(p.ikkeMed.map((t) => t.sti)).toEqual(["units.solvarme.production_profile_path"]);
    });

    it("skrivemåder: et heltal i værket (96) kommer ikke tilbage som decimaltal — markeringen bærer formen", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        expect(e.plan.former["storage.tank_hoej.e_initial_mwh"]).toBe("96");
        expect(e.plan.endelig.get("storage.tank_hoej.e_initial_mwh")).toBe("96");
        expect(læsMarkering(læsCeller(e.bytes))?.former).toEqual(e.plan.former);
        // Formen er en del af det, sha256 dækker.
        expect(sammeTal("96", "96.0")).toBe(true);
        expect(sammeTal("96", "96")).toBe(false);
        expect(sammeTal("96", "97.0")).toBe(false);
    });

    it("en slået-fra enhed, modelscriptet ikke kan læse, står i Øvrige felter — ikke på listen", () => {
        // En slået-fra pillekedel uden pillepris: scriptet ville afvise rækken i Anlaeg ("prisen er ikke udfyldt"),
        // så enheden bæres felt for felt af Øvrige felter og kommer hel tilbage.
        const p = planlæg(andebyMed({
            "units.pillekedel.enabled": "false", "units.pillekedel.type": '"biomass_boiler"', "units.pillekedel.p_max_heat": "8.0", "units.pillekedel.p_min_heat": "0.0",
            "units.pillekedel.alpha": "0.0", "units.pillekedel.fuel": '"wood_pellets"', "units.pillekedel.eta_fuel_to_heat": "0.9",
        }));
        expect(p.nægter).toEqual([]);
        expect(p.endelig.get("units.pillekedel.p_max_heat")).toBe("8.0");
        expect(p.endelig.get("units.pillekedel.enabled")).toBe("false");
        expect(p.celler.filter((c) => c.ark === OEVRIGE && c.v === "units.pillekedel.p_max_heat")).toHaveLength(1);
        expect(p.celler.filter((c) => c.ark === "Anlaeg" && c.v === "pillekedel")).toEqual([]);
        expect(p.ikkeMed.map((t) => t.sti)).toEqual(["units.solvarme.production_profile_path"]);
    });

    it("en enhed med en type, feltkataloget ikke kender (fx en oliekedel), holdes HELT ude og står på listen med grunden", () => {
        // Ellers ville enheden komme tilbage uden sin type, og importen ville afvise hele arket ("type mangler").
        // Peger balancemarkedet på enheden, holdes pegeren også ude.
        const p = planlæg(andebyMed({
            "units.oliekedel.enabled": "true", "units.oliekedel.type": '"oil_boiler"', "units.oliekedel.p_max_heat": "8.0", "units.oliekedel.p_min_heat": "0.0",
            "units.oliekedel.alpha": "0.0", "units.oliekedel.fuel": '"natural_gas"', "units.oliekedel.eta_fuel_to_heat": "0.9",
            "balancing.ancillary_caps.per_unit_mw.oliekedel": "2.0",
        }));
        expect(p.nægter).toEqual([]);
        expect([...p.endelig.keys()].filter((s) => s.includes("oliekedel"))).toEqual([]);
        const olie = p.ikkeMed.filter((t) => t.sti.includes("oliekedel"));
        expect(olie.map((t) => t.sti).sort()).toEqual(["balancing.ancillary_caps.per_unit_mw.oliekedel", "units.oliekedel.alpha", "units.oliekedel.enabled",
            "units.oliekedel.eta_fuel_to_heat", "units.oliekedel.fuel", "units.oliekedel.p_max_heat", "units.oliekedel.p_min_heat", "units.oliekedel.type"]);
        expect(olie.find((t) => t.sti === "units.oliekedel.p_max_heat")?.grund).toMatch(/enheden oliekedel kan ikke stå i arket, fordi type ikke kan/);
        expect(olie.find((t) => t.sti.startsWith("balancing."))?.grund).toMatch(/enheden oliekedel findes ikke i værket/);
        expect(p.celler.filter((c) => typeof c.v === "string" && c.v.includes("oliekedel"))).toEqual([]);
    });

    it("en slået-fra tank står i Anlaeg med 'i drift: nej'; er der ikke plads, tager den aldrig en aktiv tanks række", () => {
        const tank = (n: string, til: boolean) => ({ [`storage.${n}.enabled`]: til ? "true" : "false", [`storage.${n}.volume_m3`]: "5000", [`storage.${n}.delta_t_k`]: "33.0",
            [`storage.${n}.e_initial_mwh`]: "90.0", [`storage.${n}.p_max_charge_mw`]: "25.0", [`storage.${n}.p_max_discharge_mw`]: "25.0", [`storage.${n}.self_discharge_per_hour`]: "0.0005" });
        const slukket = planlæg(andebyMed({ "storage.tank_hoej.enabled": "false" }));
        expect(slukket.nægter).toEqual([]);
        expect(slukket.celler.filter((c) => c.ark === "Anlaeg" && c.v === "tank_hoej")).toHaveLength(1);
        expect(slukket.endelig.get("storage.tank_hoej.enabled")).toBe("false");
        // Andeby har to tanke. En slået-fra tank FØRST i værket og fire aktive mere: seks aktive i alt fylder skabelonens
        // seks rækker, og den slåede-fra bæres af Øvrige felter i stedet for at skubbe en aktiv ud.
        const k = andebyMed({ ...tank("t3", true), ...tank("t4", true), ...tank("t5", true), ...tank("t6", true) });
        const mange = planlæg({ ...k, blade: [...Object.entries(tank("reserve", false)).map(([sti, v], j) => ({ sti, vaerdi_json: v, raekkefoelge: -100 + j })), ...k.blade] });
        expect(mange.nægter).toEqual([]);
        const iAnlaeg = mange.celler.filter((c) => c.ark === "Anlaeg" && /^A5[2-7]$/.test(c.ref) && typeof c.v === "string").map((c) => c.v);
        expect(iAnlaeg.sort()).toEqual(["t3", "t4", "t5", "t6", "tank_hoej", "tank_lav"]);
        expect(mange.endelig.get("storage.reserve.enabled")).toBe("false");
        expect(mange.celler.filter((c) => c.ark === OEVRIGE && c.v === "storage.reserve.volume_m3")).toHaveLength(1);
        expect(mange.ikkeMed.map((t) => t.sti)).toEqual(["units.solvarme.production_profile_path"]);
    });

    it("det, en celle beviseligt ikke kan bære, står stadig på listen med grunden", () => {
        const p = planlæg(andebyMed({ "prices.fyringsolie.value": "900.0", "units.halmkedel.notes": '"linje\\u0001med kontroltegn"' }));
        expect(p.nægter).toEqual([]);
        const post = (sti: string) => p.ikkeMed.find((t) => t.sti === sti);
        expect(post("prices.fyringsolie.value")).toMatchObject({ værk: "900.0", script: null, grund: expect.stringMatching(/feltkataloget/) });
        expect(post("units.halmkedel.notes")?.grund).toMatch(/tegn/);
        expect(p.afvigelser).toEqual(["prices.fyringsolie.value"]);         // noter er konverteringens egne og sammenlignes ikke
    });
});

// ------------------------------------------------------------------ fanernes udseende og markeringen

describe("fanerne er appens egne — og siger det", () => {
    it("tre synlige faner efter modelrepoets, med vejledning, dropdowns, frosne overskrifter og gule felter", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const z = unzipSync(e.bytes);
        const wb = strFromU8(z["xl/workbook.xml"]);
        const navne = [...wb.matchAll(/<sheet name="([^"]+)"[^>]*state="(\w+)"/g)].map((m) => [m[1], m[2]]);
        expect(navne.map((n) => n[0])).toEqual(["Vejledning", "Timedata", "Anlaeg", "Varmepumpe", "Priser", "Solvarme", ...LAGFANER, "_app"]);
        expect(navne.filter((n) => n[1] === "hidden").map((n) => n[0])).toEqual(["_app"]);
        const c = læsCeller(e.bytes);
        for (const fane of LAGFANER) {
            const a = c.get(fane)!;
            expect(String(a.get("A1"))).toMatch(/appens egne felter/);
            expect(String(a.get("A2"))).toMatch(/Denne fane er appens egen\. Modelrepoets script \(scripts\/vaerksark_til_yaml\.py\) læser den ikke/);
        }
        const xml = (fane: string) => {
            const rid = new RegExp(`<sheet name="${fane}"[^>]*r:id="([^"]+)"`).exec(wb)![1];
            const mål = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(strFromU8(z["xl/_rels/workbook.xml.rels"]))![1];
            return strFromU8(z[`xl/${mål}`]);
        };
        const sd = xml(START_OG_DRIFT);
        expect(sd).toMatch(/<pane xSplit="0" ySplit="5"[^>]*state="frozen"/);
        expect(sd).toMatch(/<dataValidation [^>]*type="list"[^>]*><formula1>&quot;ja,nej&quot;<\/formula1>/);
        expect(sd).toContain("<mergeCell ref=\"A2:H2\"/>");
        expect(sd).toMatch(/<c r="D6" s="10"/);                              // gul = udfyld, som skabelonens indtastningsfelter
        const bm = xml(BALANCEMARKED);
        expect(bm).toContain("&quot;legacy,activation_value&quot;");         // lukket liste fra feltkataloget
        expect(xml(OEVRIGE)).toMatch(/<pane xSplit="0" ySplit="4"/);
        // Modelrepoets faner er urørt ud over de celler, eksporten altid har udfyldt.
        expect(strFromU8(z["xl/worksheets/sheet1.xml"])).toBe(strFromU8(unzipSync(skabelon())["xl/worksheets/sheet1.xml"]));
    });

    it("enheder i kolonneoverskriften og én forklarende sætning pr. felt — fra feltkataloget", async () => {
        const c = læsCeller((await eksporter(andeby(), skabelon(), NU)).bytes);
        const sd = [...c.get(START_OG_DRIFT)!.values()].map(String);
        expect(sd).toContain("CO₂-udledning (t CO₂/MWh brændsel)");
        expect(sd).toContain("Indhold ved start (MWh)");
        expect(sd.some((t) => /1 = tændt, 0 = slukket i første time/.test(t) && /Tom celle = modellens standard: ja/.test(t))).toBe(true);
        const bm = [...c.get(BALANCEMARKED)!.values()].map(String);
        expect(bm).toContain("DKK/MWh");
        expect(bm).toContain("balancing.bid_strategy.up_markup_dkk_mwh");   // stien i modellen står ved feltet
    });

    it("format 3; samme værk giver samme hash, og en ændring i en af appens faner giver en anden", async () => {
        const a = await eksporter(andeby(), skabelon(), NU);
        expect(MARKOER_FORMAT).toBe("fjv-vaerksark-eksport/3");
        expect(læsMarkering(læsCeller(a.bytes))).toMatchObject({ format: MARKOER_FORMAT, vaerk_id: ANDEBY_ID, sha256: a.markering.sha256 });
        expect((await eksporter(andeby(), skabelon(), new Date(Date.UTC(2027, 0, 1)))).markering.sha256).toBe(a.markering.sha256);
        expect((await eksporter(andebyMed({ "units.halmkedel.initial_status": "0" }), skabelon(), NU)).markering.sha256).not.toBe(a.markering.sha256);
    });
});

// ------------------------------------------------------------------ genupload

describe("genupload af et ark med appens faner", () => {
    const vaerker = [{ id: ANDEBY_ID, kode: "andeby", navn: "Andeby — fiktivt referenceværk", revision: 1 }];
    const hent: Hentere = { kilde: async () => andeby(), skabelon: async () => skabelon() };
    const lagcelle = (bytes: Uint8Array, sti: string) => {
        const [fane, ref] = læsLag(læsCeller(bytes)).get(sti)!.hvor.split("!");
        return { fane, ref };
    };

    it("en ændret celle i Start og drift vises med fanen og feltets navn før bekræftelse", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const { fane, ref } = lagcelle(e.bytes, "units.gasmotor.initial_status");
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark(fane).sæt(ref, "ja");
        const a = await analyserUpload(wb.bytes(), vaerker, hent);
        expect(a.art).toBe("revision");
        if (a.art !== "revision") return;
        expect(a.forskel.felter).toEqual([{ hvor: START_OG_DRIFT, felt: expect.stringMatching(/Tændt ved periodens start · gasmotor \(units\.gasmotor\.initial_status\)/), før: expect.any(String), nu: "ja" }]);
        expect(a.forskel.gemmes).toBe(1);
    });

    it("en ændret række i Øvrige felter og en slettet række er ændringer; uændret ark er ingen", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        expect(await analyserUpload(e.bytes, vaerker, hent)).toMatchObject({ art: "ingen_aendringer" });
        const { fane, ref } = lagcelle(e.bytes, "electricity.tariff_consumption_flat");
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark(fane).sæt(ref, 131);
        const basis = læsArkmodel(læsCeller(e.bytes));
        expect(sammenlign(basis, genkend(wb.bytes()).model).felter).toEqual([expect.objectContaining({ hvor: OEVRIGE, før: "125", nu: "131" })]);
        const wb2 = new Arbejdsbog(e.bytes);
        wb2.regneark(fane).sæt(ref.replace("B", "A"), null);                 // stien ryddet: rækken er væk
        expect(sammenlign(basis, genkend(wb2.bytes()).model).felter).toEqual([expect.objectContaining({ hvor: OEVRIGE, nu: "rækken er slettet" })]);
    });

    it("et ark i format 2 (før appens faner): afvises klart, når værket findes; ellers et nyt værk som før", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark(MARKOER_ARK).sæt("B1", MARKOER_FORMAT_FOER);
        const gammelt = wb.bytes();
        expect(læsMarkering(læsCeller(gammelt))?.format).toBe(MARKOER_FORMAT_FOER);
        expect(await analyserUpload(gammelt, vaerker, hent)).toEqual({ art: "anden_eksport", vaerk: vaerker[0], ældre: true });
        expect(await analyserUpload(gammelt, [], hent)).toMatchObject({ art: "nyt", grund: expect.stringMatching(/ikke findes her/) });
        // Et ukendt format er ikke en markering (som før).
        wb.regneark(MARKOER_ARK).sæt("B1", "fjv-vaerksark-eksport/1");
        expect(læsMarkering(læsCeller(wb.bytes()))).toBeNull();
    });
});
