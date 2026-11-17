// Runde 14: appens egne faner i værksarket (Læs først, Start og drift, Balancemarked, Øvrige felter).
//
// Målt baggrund: et rigtigt værk blev lagt ind via arket, og alle enheder stod til slukket ved start, balancemarkedet
// kunne ikke stå i arket, og 71–106 felter pr. katalogværk stod på listen "ikke med i arket". Brugertesten af runde 14
// (noter_ekspert/r14_review_bruger.md) og Codex' review fandt derefter, at "intet skrevet" betød tre ting (F2), at en
// eksport af Andeby kunne blive en revision af Andeby (F3), at modelrepoets faner viste andre tal end modellen bruger
// (F4–F7), at fanerne var skrevet i modellørsprog (F8–F13), og at læserne kunne fastholdes af et lille ark (fund 1).
// Testene her forhindrer, at
//   * et felt i værket hverken står i arket eller på listen (tavst tab), eller at en celle står tom ved eksport;
//   * en celle læses anderledes i eksportens forudsigelse end i importen (vektorerne binder TS og Python);
//   * en række i Øvrige felter tavst skjuler en celle i modelrepoets faner (betingelsen);
//   * et ark i det gamle format tavst bliver et nyt værk, når værket findes;
//   * brugerens faner viser YAML-stier eller engelske koder som det første, eller har to ens kolonneoverskrifter.
// Importens side (fabric/fjv/arklag.py) prøves i fabric/tests/test_arklag.py, og hele kæden med modelrepoets script i
// gaten (viden/vaerktoej/tjek_eksport_rundtur.py).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { analyserUpload, type Hentere } from "./analyse";
import { eksporter, læsMarkering, MARKOER_ARK, MARKOER_FORMAT, MARKOER_FORMAT_FOER, tomSkabelon } from "./eksporter";
import { genkend, læsArkmodel, sammenlign } from "./genkend";
import { planlæg, type Eksportkilde } from "./kort";
import { APPENS_FANER, BALANCEMARKED, celleFor, FINDES_IKKE, KUN_HVIS, LAES_FOERST, læsCelle, læsLag, OEVRIGE, sammeTal, START_OG_DRIFT, STI_OVERSKRIFT, ukendteOverskrifter } from "./lag";
import { andeby, ANDEBY_ID, skabelon } from "./testdata";
import { Arbejdsbog, delRef, læsCeller, type Læstværdi } from "./xlsx";

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
/** Arkets XML for en fane (til opsætningen: dropdowns, frosne ruder, fanevalg). */
function faneXml(bytes: Uint8Array, fane: string): string {
    const z = unzipSync(bytes);
    const wb = strFromU8(z["xl/workbook.xml"]);
    const rid = new RegExp(`<sheet name="${fane}"[^>]*r:id="([^"]+)"`).exec(wb)![1];
    const mål = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(strFromU8(z["xl/_rels/workbook.xml.rels"]))![1];
    return strFromU8(z[`xl/${mål.replace(/^\/?xl\//, "")}`]);
}

// ------------------------------------------------------------------ celle <-> vaerdi_json: vektorerne

const VEKTORFIL = resolve(import.meta.dirname, "../../../../../skema/vektorer/arklag/celler.json");
/** (sti, celle) — bredt: hver type, grænserne, det et regneark gør ved en indtastning, tom, (findes ikke) og etiketter. */
const TILFAELDE: [string, number | string | boolean | null][] = [
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
    // Runde 14, rettelser: tom og (findes ikke) betyder hver sin ting (F2) — også for et felt, kataloget ikke kender.
    ["units.x.co2_emissions_per_mwh_fuel", null], ["units.x.co2_emissions_per_mwh_fuel", ""], ["units.x.co2_emissions_per_mwh_fuel", "   "],
    ["units.x.co2_emissions_per_mwh_fuel", "(findes ikke)"], ["units.x.initial_status", " (Findes ikke) "], ["units.x.findes_ikke", null],
    ["units.x.findes_ikke", "(findes ikke)"], ["units.x.notes", "(findes ikke)"], ["balancing.method", null],
    // Danske etiketter med koden i parentes (F11): koden gælder; en etiket uden kode eller en forkert kode afvises.
    ["balancing.method", "aktiveringsværdi kvarter for kvarter – anbefalet (activation_value)"], ["balancing.method", "aktiveringsværdi"],
    ["balancing.method", "noget (forkert)"], ["balancing.activation.foresight", "i går (lag24)"], ["balancing.activation.foresight", "i går ( lag24 )"],
    ["balancing.activation.settle", "efter det der skete (realized)"], ["balancing.activation.afrr.model", "andel af systemets aktivering gange k (system_share)"],
    ["balancing.reservation_gate.mode", "reservér højst blokken (bound)"], ["balancing.availability.mode", "loft på månedens MWh (energy)"],
    ["data.dmi_area", "Karup (karup)"],
    // En ægte boolsk celle (TRUE/FALSE): ja/1 og nej/0 — også i et 0/1-felt; et tal- eller tekstfelt tager den ikke.
    ["units.x.initial_status", true], ["units.x.initial_status", false], ["units.x.enabled", false], ["units.x.uc_enabled", true],
    ["storage.t.cycle_binding", false], ["units.x.min_uptime", true], ["units.x.notes", false], ["units.x.ancillary.bid_window.months", true],
];

describe("celle <-> vaerdi_json (fælles vektorer med importen)", () => {
    const beregnet = { _om: "Appens faner i værksarket: hvad en celle betyder (tom, (findes ikke), værdien eller grunden) efter feltkataloget (runde 14). Genereret af app/src/sider/konfiguration/eksport/lag.spec.ts (FJV_SKRIV_VEKTORER=1) fra TypeScript-udgaven (læsCelle); fabric/tests/test_arklag_vektorer.py kræver samme udfald af fjv.feltkatalog.laes_celle. Ret aldrig i hånden.", tilfaelde: TILFAELDE.map(([sti, celle]) => ({ sti, celle, ud: læsCelle(sti, celle) })) };

    it("vektorfilen er den, TypeScript-udgaven giver (Python-udgaven prøves mod samme fil)", () => {
        if (process.env.FJV_SKRIV_VEKTORER) {
            mkdirSync(dirname(VEKTORFIL), { recursive: true });
            writeFileSync(VEKTORFIL, `${JSON.stringify(beregnet, null, 1)}\n`);
        }
        expect(existsSync(VEKTORFIL), "kør: FJV_SKRIV_VEKTORER=1 npx vitest run src/sider/konfiguration/eksport/lag.spec.ts").toBe(true);
        expect(JSON.parse(readFileSync(VEKTORFIL, "utf8"))).toEqual(beregnet);
    });

    it("tom = appen rører ikke feltet; (findes ikke) = feltet sættes ikke (brugertesten F2)", () => {
        expect(læsCelle("units.x.co2_emissions_per_mwh_fuel", null)).toEqual({ tom: true });
        expect(læsCelle("units.x.co2_emissions_per_mwh_fuel", " ")).toEqual({ tom: true });
        expect(læsCelle("units.x.co2_emissions_per_mwh_fuel", "(findes ikke)")).toEqual({ fjern: true });
        expect(læsCelle("units.x.co2_emissions_per_mwh_fuel", 0.2)).toEqual({ json: "0.2" });
    });

    it("typen kommer fra kataloget, ikke fra cellen; en dansk etiket læses på koden i parentesen", () => {
        expect(læsCelle("units.x.p_max_heat", 12)).toEqual({ json: "12.0" });
        expect(læsCelle("units.x.min_uptime", 3)).toEqual({ json: "3" });
        expect(læsCelle("units.x.initial_status", "ja")).toEqual({ json: "1" });
        expect(læsCelle("units.x.enabled", "nej")).toEqual({ json: "false" });
        expect(læsCelle("units.x.notes", "ja")).toEqual({ json: '"ja"' });
        expect(læsCelle("units.x.ancillary.bid_window.months", "10, 11, 12")).toEqual({ json: "[10,11,12]" });
        expect(læsCelle("units.x.ancillary.available_from", 46082)).toEqual({ json: '"2026-03-01"' });   // Excel gjorde teksten til en dato
        expect(læsCelle("balancing.activation.foresight", "i går (lag24)")).toEqual({ json: '"lag24"' });
        expect(læsCelle("balancing.activation.foresight", "i går")).toEqual({ fejl: expect.stringMatching(/ikke tilladt/) });
        expect(læsCelle("units.x.findes_ikke", 1)).toEqual({ fejl: expect.stringMatching(/findes ikke i feltkataloget/) });
        expect(læsCelle("balancing.ancillary_caps.total_mw", -1)).toEqual({ fejl: expect.stringMatching(/≥ 0/) });
    });

    it("celleFor er den inverse: cellen læses tilbage til det vaerdi_json, den siger — også en dansk etiket", () => {
        for (const [sti, json] of [["units.x.p_max_heat", "12.0"], ["units.x.initial_status", "1"], ["units.x.enabled", "false"], ["units.x.notes", '"Under indkøring"'],
            ["units.x.ancillary.bid_window.months", "[10,11,12,1,2,3]"], ["storage.t.e_max_mwh", "null"], ["balancing.method", '"activation_value"'],
            ["balancing.activation.foresight", '"trailing30"'], ["meta.tax_year", "2026"]] as const) {
            const c = celleFor(sti, json);
            expect("celle" in c, `${sti}: ${"grund" in c ? c.grund : ""}`).toBe(true);
            if (!("celle" in c)) continue;
            expect(læsCelle(sti, c.celle as number | string)).toEqual({ json: c.json });
            expect(c.json === json || sammeTal(c.json, json), `${sti}: ${c.json} mod ${json}`).toBe(true);
        }
        expect(celleFor("balancing.method", '"activation_value"')).toEqual({ celle: "aktiveringsværdi kvarter for kvarter – anbefalet (activation_value)", json: '"activation_value"' });
        expect(celleFor("meta.tax_year", "2026")).toEqual({ celle: 2026, json: "2026.0" });
        expect(celleFor("units.x.notes", '"med\\u0001kontroltegn"')).toEqual({ grund: expect.stringMatching(/tegn/) });
        expect(celleFor("units.x.notes", '""')).toEqual({ grund: expect.stringMatching(/tom tekst/) });
        expect(celleFor("units.x.notes", '"(findes ikke)"')).toEqual({ grund: expect.stringMatching(/fjerne et felt/) });
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
        expect(p.afvigelser).toEqual([]);
        const værk = blade(andeby());
        for (const [sti, json] of værk) if (sti !== "units.solvarme.production_profile_path") expect(p.endelig.get(sti), sti).toBe(json);
        expect(p.endelig.size).toBe(værk.size);
    });

    it("eksporten skriver alle celler: en enhedsrække har aldrig en tom celle, kun en værdi eller (findes ikke)", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const lag = læsLag(læsCeller(e.bytes));
        expect(lag.size).toBeGreaterThan(150);
        for (const [sti, x] of lag) {
            expect(x.v, `${x.hvor} ${sti}`).not.toBeUndefined();
            const b = læsCelle(sti, x.v);
            if ("fjern" in b) { expect(e.plan.endelig.has(sti), `${x.hvor} ${sti}`).toBe(false); continue; }
            expect("json" in b, `${x.hvor} ${sti}: ${JSON.stringify(b)}`).toBe(true);
            if (!("json" in b)) continue;
            const slut = e.plan.endelig.get(sti)!;
            expect(b.json === slut || sammeTal(b.json, slut), `${x.hvor} ${sti}: ${b.json} mod ${slut}`).toBe(true);
        }
        // Gaskedlen har intet idriftsættelsesår: cellen siger det udtrykkeligt.
        expect(lag.get("units.gaskedel_agg.commissioned")?.v).toBe(FINDES_IKKE);
    });

    it("Start og drift: Værket øverst (nettilslutning, modelperiode), enheder og tanke — også slåede-fra enheder", async () => {
        const e = await eksporter(andebyMed({ "grid.max_consumption_mw": "33.0" }), skabelon(), NU);
        const lag = læsLag(læsCeller(e.bytes));
        const v = (sti: string) => lag.get(sti)?.v;
        expect(v("grid.max_consumption_mw")).toBe(33);
        expect(lag.get("grid.max_consumption_mw")?.hvor).toMatch(/^Start og drift!B\d+$/);
        expect(v("time.start")).toBe("2025-07-01T00:00:00Z");
        expect(lag.get("time.start")?.betingelse).toBe("2025-07-01T00:00:00Z");   // betinget af scriptets periode
        expect(v("units.halmkedel.initial_status")).toBe("ja");            // værket: 1; modelscriptet ville skrive 0
        expect(v("units.gasmotor.uc_enabled")).toBe("nej");
        expect(v("units.fliskedel.enabled")).toBe("nej");
        expect(v("units.halmkedel.commissioned")).toBe(2015);
        expect(v("storage.tank_hoej.e_initial_mwh")).toBe(96);
        expect(lag.get("units.halmkedel.initial_status")?.hvor).toMatch(/^Start og drift!D\d+$/);
        // Nettilslutning og periode står ikke længere i Øvrige felter.
        expect([...lag.values()].filter((x) => x.hvor.startsWith(OEVRIGE) && /^(grid|time)\./.test(x.sti))).toEqual([]);
    });

    it("Balancemarked: hele blokken på dansk; et værk uden balancemarked får (findes ikke) i alle felter", async () => {
        const med = læsLag(læsCeller((await eksporter(andeby(), skabelon(), NU)).bytes));
        expect(med.get("balancing.method")?.v).toBe("aktiveringsværdi kvarter for kvarter – anbefalet (activation_value)");
        expect(med.get("balancing.activation.foresight")?.v).toMatch(/\(profile\)$/);
        expect(med.get("balancing.ancillary_caps.total_mw")?.v).toBe(14);
        expect(med.get("balancing.reservation_gate.afrr.block_mw")?.v).toBe(3);
        expect(med.get("balancing.ancillary_caps.per_unit_mw.vp_luft_vand")?.v).toBe(6);
        expect(med.get("units.elkedel_ny.ancillary.bid_window.months")?.v).toBe("[10,11,12,1,2,3]");
        const uden = andebyMed(Object.fromEntries(andeby().blade.filter((b) => b.sti.startsWith("balancing.") || /\.ancillary\.(afrr_max|mfrr_max|bid_window|available)/.test(b.sti)).map((b) => [b.sti, null])));
        const e = await eksporter(uden, skabelon(), NU);
        const fane = [...læsLag(læsCeller(e.bytes)).values()].filter((x) => x.hvor.startsWith(BALANCEMARKED));
        expect(fane.length).toBeGreaterThan(20);
        expect(fane.every((x) => x.v === FINDES_IKKE)).toBe(true);
        expect([...e.plan.endelig.keys()].filter((s) => s.startsWith("balancing."))).toEqual([]);
    });

    it("Øvrige felter: feltets navn først, stien til højre, og betingelsen, der viger for en rettelse i modelrepoets faner", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const c = læsCeller(e.bytes);
        const lag = læsLag(c);
        const ø = (sti: string) => lag.get(sti);
        expect(ø("investment.enabled")).toMatchObject({ v: "nej", hvor: expect.stringMatching(/^Øvrige felter!B/) });
        expect(ø("investment.enabled")?.betingelse).toBeUndefined();
        expect(ø("electricity.tariff_consumption_flat")).toMatchObject({ v: 125, betingelse: 129.8 });
        expect(ø("storage.tank_hoej.e_max_mwh")).toMatchObject({ v: "null", betingelse: 191.9 });
        expect(ø("meta.case_name")).toMatchObject({ v: "andeby", betingelse: "andeby_fiktivt_referencevaerk" });
        const r = Number(ø("storage.tank_hoej.e_max_mwh")!.hvor.split("!B")[1]);
        const ark = c.get(OEVRIGE)!;
        expect(ark.get(`A${r}`)).toBe("Energikapacitet · tank_hoej");                // det første, brugeren ser
        expect(ark.get(`F${r}`)).toBe("storage.tank_hoej.e_max_mwh");               // stien til højre
        expect(ø("units.halmkedel.var_om")).toBeUndefined();                          // modelrepoets faner bærer det
    });

    it("et værk med flad eltarif: rækkerne fjerner tarifskemaet, modelscriptet altid skriver", () => {
        const k = andebyMed(Object.fromEntries(andeby().blade.filter((b) => b.sti.startsWith("electricity.tariff_consumption.")).map((b) => [b.sti, null])));
        const p = planlæg(k);
        expect(p.nægter).toEqual([]);
        expect([...p.endelig.keys()].filter((s) => s.startsWith("electricity.tariff_consumption."))).toEqual([]);
        expect(p.celler.filter((c) => c.ark === OEVRIGE && c.v === FINDES_IKKE).length).toBeGreaterThanOrEqual(15);
        expect(p.ikkeMed.map((t) => t.sti)).toEqual(["units.solvarme.production_profile_path"]);
        expect(p.lagafvigelser.find((a) => /eltarif/.test(a.hvor))?.hvad).toMatch(/ingen tarifprofil/);
    });

    it("skrivemåder: et heltal i værket (96) kommer ikke tilbage som decimaltal — markeringen bærer formen", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        expect(e.plan.former["storage.tank_hoej.e_initial_mwh"]).toBe("96");
        expect(e.plan.endelig.get("storage.tank_hoej.e_initial_mwh")).toBe("96");
        expect(læsMarkering(læsCeller(e.bytes))?.former).toEqual(e.plan.former);
        expect(sammeTal("96", "96.0")).toBe(true);
        expect(sammeTal("96", "96")).toBe(false);
    });

    it("en slået-fra enhed, modelscriptet ikke kan læse, står i Øvrige felter — ikke på listen", () => {
        const p = planlæg(andebyMed({
            "units.pillekedel.enabled": "false", "units.pillekedel.type": '"biomass_boiler"', "units.pillekedel.p_max_heat": "8.0", "units.pillekedel.p_min_heat": "0.0",
            "units.pillekedel.alpha": "0.0", "units.pillekedel.fuel": '"wood_pellets"', "units.pillekedel.eta_fuel_to_heat": "0.9",
        }));
        expect(p.nægter).toEqual([]);
        expect(p.endelig.get("units.pillekedel.enabled")).toBe("false");
        expect(p.celler.filter((c) => c.ark === OEVRIGE && c.v === "units.pillekedel.p_max_heat")).toHaveLength(1);
        expect(p.ikkeMed.map((t) => t.sti)).toEqual(["units.solvarme.production_profile_path"]);
    });

    it("en enhed med en type, feltkataloget ikke kender (fx en oliekedel), holdes HELT ude og står på listen med grunden", () => {
        const p = planlæg(andebyMed({
            "units.oliekedel.enabled": "true", "units.oliekedel.type": '"oil_boiler"', "units.oliekedel.p_max_heat": "8.0", "units.oliekedel.p_min_heat": "0.0",
            "units.oliekedel.alpha": "0.0", "units.oliekedel.fuel": '"natural_gas"', "units.oliekedel.eta_fuel_to_heat": "0.9",
            "balancing.ancillary_caps.per_unit_mw.oliekedel": "2.0",
        }));
        expect(p.nægter).toEqual([]);
        expect([...p.endelig.keys()].filter((s) => s.includes("oliekedel"))).toEqual([]);
        const olie = p.ikkeMed.filter((t) => t.sti.includes("oliekedel"));
        expect(olie).toHaveLength(8);
        expect(olie.find((t) => t.sti === "units.oliekedel.p_max_heat")?.grund).toMatch(/enheden oliekedel kan ikke stå i arket, fordi type ikke kan/);
        expect(olie.find((t) => t.sti.startsWith("balancing."))?.grund).toMatch(/enheden oliekedel findes ikke i værket/);
    });

    it("en slået-fra tank står i Anlaeg med 'i drift: nej'; er der ikke plads, tager den aldrig en aktiv tanks række", () => {
        const tank = (n: string, til: boolean) => ({ [`storage.${n}.enabled`]: til ? "true" : "false", [`storage.${n}.volume_m3`]: "5000", [`storage.${n}.delta_t_k`]: "33.0",
            [`storage.${n}.e_initial_mwh`]: "90.0", [`storage.${n}.p_max_charge_mw`]: "25.0", [`storage.${n}.p_max_discharge_mw`]: "25.0", [`storage.${n}.self_discharge_per_hour`]: "0.0005" });
        const slukket = planlæg(andebyMed({ "storage.tank_hoej.enabled": "false" }));
        expect(slukket.celler.filter((c) => c.ark === "Anlaeg" && c.v === "tank_hoej")).toHaveLength(1);
        expect(slukket.endelig.get("storage.tank_hoej.enabled")).toBe("false");
        const k = andebyMed({ ...tank("t3", true), ...tank("t4", true), ...tank("t5", true), ...tank("t6", true) });
        const mange = planlæg({ ...k, blade: [...Object.entries(tank("reserve", false)).map(([sti, v], j) => ({ sti, vaerdi_json: v, raekkefoelge: -100 + j })), ...k.blade] });
        expect(mange.nægter).toEqual([]);
        const iAnlaeg = mange.celler.filter((c) => c.ark === "Anlaeg" && /^A5[2-7]$/.test(c.ref) && typeof c.v === "string").map((c) => c.v);
        expect(iAnlaeg.sort()).toEqual(["t3", "t4", "t5", "t6", "tank_hoej", "tank_lav"]);
        expect(mange.endelig.get("storage.reserve.enabled")).toBe("false");
        expect(mange.ikkeMed.map((t) => t.sti)).toEqual(["units.solvarme.production_profile_path"]);
    });

    it("det, en celle beviseligt ikke kan bære, står stadig på listen med grunden", () => {
        const p = planlæg(andebyMed({ "prices.fyringsolie.value": "900.0", "units.halmkedel.notes": '"linje\\u0001med kontroltegn"' }));
        expect(p.nægter).toEqual([]);
        const post = (sti: string) => p.ikkeMed.find((t) => t.sti === sti);
        expect(post("prices.fyringsolie.value")).toMatchObject({ værk: "900.0", script: null, grund: expect.stringMatching(/feltkataloget/) });
        expect(post("units.halmkedel.notes")?.grund).toMatch(/tegn/);
        expect(p.afvigelser).toEqual(["prices.fyringsolie.value"]);
    });
});

// ------------------------------------------------------------------ Læs først og brugervenligheden

describe("fanerne er appens egne — og siger det på dansk", () => {
    it("Læs først står forrest og åbnes; modelrepoets faner er urørt ud over hvilken fane der var valgt", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const z = unzipSync(e.bytes), før = unzipSync(skabelon());
        const wb = strFromU8(z["xl/workbook.xml"]);
        const navne = [...wb.matchAll(/<sheet name="([^"]+)"[^>]*state="(\w+)"/g)].map((m) => m[1]);
        expect(navne).toEqual([LAES_FOERST, "Vejledning", "Timedata", "Anlaeg", "Varmepumpe", "Priser", "Solvarme", START_OG_DRIFT, BALANCEMARKED, OEVRIGE, "_app"]);
        expect(wb).toMatch(/activeTab="0"/);
        expect(faneXml(e.bytes, LAES_FOERST)).toMatch(/tabSelected="true"/);
        // Præcis én valgt fane (to valgte faner er en gruppe i Excel, hvor en indtastning rammer begge).
        expect(navne.filter((n) => n !== "_app" && /tabSelected="true"/.test(faneXml(e.bytes, n)))).toEqual([LAES_FOERST]);
        expect(strFromU8(z["xl/worksheets/sheet1.xml"])).toBe(strFromU8(før["xl/worksheets/sheet1.xml"]).replace('tabSelected="true"', 'tabSelected="false"'));
    });

    it("Læs først: værkets navn, kode og revision, farverne, _app — og hvor modellen ikke bruger det, modelrepoets faner viser", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const lf = [...læsCeller(e.bytes).get(LAES_FOERST)!.values()].map(String).join("\n");
        expect(lf).toMatch(/hører til værket Andeby — fiktivt referenceværk \(kode andeby\), revision 1/);
        expect(lf).toMatch(/Opret som nyt værk/);
        expect(lf).toMatch(/Slet det ikke/);
        expect(lf).toMatch(/Gul = du udfylder/);
        // Andeby: tankens kapacitet regnes af volumen og ΔT, tariffen i aktiveringsværdien er den faste, solvarmen fra
        // arket Solvarme, og gasmotorens startomkostning bruges ikke (start/stop-logik nej).
        const hvor = e.plan.lagafvigelser.map((a) => a.hvor).join(" | ");
        expect(hvor).toMatch(/Anlaeg C5\d \(maks fyldning, tank_hoej\)/);
        expect(hvor).toMatch(/Priser, eltarif/);
        expect(hvor).toMatch(/Anlaeg M \(solvarmens årsproduktion\)/);
        expect(hvor).toMatch(/Anlaeg række \d+ \(gasmotor\): startomkostning/);
        expect(e.plan.lagafvigelser.find((a) => a.hvor.includes("tank_hoej"))?.hvad).toMatch(/volumen og temperaturforskel/);
        for (const a of e.plan.lagafvigelser) expect(lf).toContain(a.hvad);
    });

    it("ingen YAML-sti eller engelsk kode som det første, brugeren ser; unikke kolonneoverskrifter med enhed (F8–F13, F36)", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const c = læsCeller(e.bytes);
        for (const fane of APPENS_FANER) {
            const a = c.get(fane)!;
            expect(String(a.get("A1"))).toMatch(/^[A-ZÆØÅ][a-zæøå]/);
            for (const [ref, v] of a) {
                if (typeof v !== "string" || delRef(ref).kol !== 1) continue;
                expect(v, `${fane}!${ref}`).not.toMatch(/^(units|storage|balancing|electricity|meta|grid|time|solver|heat_load_params)\./);
            }
            // Appens egne tekster (ikke værkets værdier, som er data: kolonnerne værdi, kun hvis og sti i Øvrige felter).
            const alle = [...a.entries()].filter(([ref]) => fane !== OEVRIGE || ![2, 3, 6].includes(delRef(ref).kol)).map(([, v]) => String(v)).join(" ");
            expect(alle, fane).not.toMatch(/vaerksark_til_yaml|BUDSTRATEGI|--heat-csv|\bMILP\b|Spor [AB]\b/);
        }
        for (const fane of [START_OG_DRIFT, BALANCEMARKED]) {
            const a = c.get(fane)!;
            const rækker = new Map<number, string[]>();
            for (const [ref, v] of a) { const { kol, række } = delRef(ref); if (kol > 1 && a.get(`A${række + 1}`) === STI_OVERSKRIFT && typeof v === "string") rækker.set(række, [...(rækker.get(række) ?? []), v]); }
            for (const [r, hd] of rækker) expect(new Set(hd).size, `${fane} række ${r}: ${hd.join(" | ")}`).toBe(hd.length);
        }
        const bm = [...c.get(BALANCEMARKED)!.values()].map(String);
        expect(bm).toContain("aFRR-Bud pr. enhed pr. marked (MW el)");
        expect(bm).toContain("mFRR-Bud pr. enhed pr. marked (MW el)");
        expect(bm.some((t) => t.startsWith("Ældre: Maks. aFRR-bud"))).toBe(true);
        expect(bm.some((t) => /OM der regnes med balancemarked, vælger du på scenariet/.test(t))).toBe(true);
        const sd = [...c.get(START_OG_DRIFT)!.values()].map(String);
        expect(sd).toContain("Varmetab pr. time (andel pr. time)");
        expect(sd.some((t) => /Tom celle: værket får modellens scripts værdi — 0,2 for gaskedler og gasmotorer/.test(t))).toBe(true);
        expect(sd.some((t) => /Nej: de tal i Anlaeg bruges IKKE/.test(t))).toBe(true);
    });

    it("dropdowns: ja/nej og danske lister med (findes ikke); frosne overskrifter; gule felter", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const sd = faneXml(e.bytes, START_OG_DRIFT), bm = faneXml(e.bytes, BALANCEMARKED);
        expect(sd).toMatch(/<formula1>&quot;ja,nej,\(findes ikke\)&quot;<\/formula1>/);
        expect(sd).toMatch(/<pane xSplit="0" ySplit="2"[^>]*state="frozen"/);
        expect(bm).toContain("i går (lag24)");
        expect(bm).toContain("reservér højst blokken (bound)");
        for (const x of [sd, bm]) for (const m of x.matchAll(/<formula1>([^<]*)<\/formula1>/g)) expect(m[1].replace(/&quot;/g, '"').length).toBeLessThanOrEqual(255);
    });

    it("12 rækker til månedsloftet (F14) og plads til 19 enheder i den tomme skabelon (F15)", async () => {
        const c = læsCeller(tomSkabelon(skabelon()));
        const bm = c.get(BALANCEMARKED)!;
        const sti = [...bm.entries()].find(([, v]) => v === "balancing.availability.{marked}.mw_by_month.{måned}".replace("{marked}", "afrr"))![0];
        const teknik = delRef(sti).række;
        const ark = faneXml(tomSkabelon(skabelon()), BALANCEMARKED);
        const gule = [...ark.matchAll(new RegExp(`<c r="A(\\d+)" s="10"`, "g"))].map((m) => Number(m[1])).filter((r) => r > teknik);
        expect(gule.length).toBe(12);
        const sd = faneXml(tomSkabelon(skabelon()), START_OG_DRIFT);
        expect(sd).toMatch(/sqref="C\d+:C(\d+)"/);
    });

    it("format 3; samme værk giver samme hash, og en ændring i en af appens faner giver en anden", async () => {
        const a = await eksporter(andeby(), skabelon(), NU);
        expect(MARKOER_FORMAT).toBe("fjv-vaerksark-eksport/3");
        expect(læsMarkering(læsCeller(a.bytes))).toMatchObject({ format: MARKOER_FORMAT, vaerk_id: ANDEBY_ID, sha256: a.markering.sha256 });
        expect((await eksporter(andeby(), skabelon(), new Date(Date.UTC(2027, 0, 1)))).markering.sha256).toBe(a.markering.sha256);
        expect((await eksporter(andebyMed({ "units.halmkedel.initial_status": "0" }), skabelon(), NU)).markering.sha256).not.toBe(a.markering.sha256);
    });
});

// ------------------------------------------------------------------ den tomme skabelon (F3)

describe("tom skabelon med appens faner", () => {
    it("modelrepoets skabelon uændret + de fire faner, ingen markering; upload bliver et nyt værk", async () => {
        const b = tomSkabelon(skabelon());
        const z = unzipSync(b), før = unzipSync(skabelon());
        for (const f of ["xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml", "xl/worksheets/sheet4.xml", "xl/worksheets/sheet5.xml", "xl/styles.xml", "xl/sharedStrings.xml"]) {
            expect(strFromU8(z[f]), f).toBe(strFromU8(før[f]));
        }
        const c = læsCeller(b);
        expect([...c.keys()]).toEqual([LAES_FOERST, "Vejledning", "Timedata", "Anlaeg", "Varmepumpe", "Priser", START_OG_DRIFT, BALANCEMARKED, OEVRIGE]);
        expect(læsMarkering(c)).toBeNull();
        expect(String(c.get(LAES_FOERST)!.get("A2"))).toMatch(/Tom skabelon/);
        // Alle appens celler står tomme: appen rører intet felt, før brugeren skriver noget.
        expect([...læsLag(c).values()].filter((x) => x.v !== undefined)).toEqual([]);
        const hent: Hentere = { kilde: async () => andeby(), skabelon: async () => skabelon() };
        expect(await analyserUpload(b, [{ id: ANDEBY_ID, kode: "andeby", navn: "Andeby", revision: 1 }], hent)).toMatchObject({ art: "nyt" });
    });
});

// ------------------------------------------------------------------ læseren (Codex' review, fund 1)

describe("browserens læser", () => {
    it("en celle uden for regnearkets grænser afvises", () => {
        expect(() => delRef("A1048577")).toThrow(/uden for et regnearks grænser/);
        expect(() => delRef("XFE1")).toThrow(/uden for et regnearks grænser/);
        expect(() => delRef("A999999999999")).toThrow(/uden for et regnearks grænser/);
        expect(delRef("XFD1048576")).toEqual({ kol: 16384, række: 1048576 });
    });

    it("læsLag og genkend gennemløber de rækker, arket har — ikke alle rækkenumre til den sidste celle", () => {
        let opslag = 0;
        class Tæller<K, V> extends Map<K, V> { override get(k: K) { opslag++; return super.get(k); } }
        const fane = new Tæller<string, string | number>([["A4", "felt"], ["B4", "værdi"], ["F4", STI_OVERSKRIFT], ["A5", "x"], ["F5", "grid.max_consumption_mw"], ["B5", 3], ["A1048576", "slut"]]);
        const td = new Tæller<string, string | number>([["A6", 46000], ["B6", 1], ["A1048576", 46001], ["B1048576", 2]]);
        const ark = new Map<string, ReadonlyMap<string, Læstværdi>>([[OEVRIGE, fane], ["Timedata", td]]);
        expect(læsLag(ark).get("grid.max_consumption_mw")?.v).toBe(3);
        læsArkmodel(ark as Map<string, Map<string, string | number>>);
        expect(opslag).toBeLessThan(5000);
    });
});

// ------------------------------------------------------------------ Codex' andet review (P2): formel og faneform

/** En rå celle, som et andet program kan gemme den. */
function sætRå(wb: Arbejdsbog, fane: string, celleRef: string, xml: string) {
    const { kol, række } = delRef(celleRef);
    wb.regneark(fane).sæt(celleRef, null);
    wb.regneark(fane).rækker.get(række)!.celler.set(kol, xml);
}
const VAERKER = [{ id: ANDEBY_ID, kode: "andeby", navn: "Andeby — fiktivt referenceværk", revision: 1 }];
const HENT: Hentere = { kilde: async () => andeby(), skabelon: async () => skabelon() };

const FANEVEKTORFIL = resolve(import.meta.dirname, "../../../../../skema/vektorer/arklag/faner.json");
/** Fanens celler med én celle ændret (null = slettet). */
const med = (c: ReadonlyMap<string, Læstværdi>, ret: Record<string, string | number | null>) => {
    const ud = new Map(c);
    for (const [k, v] of Object.entries(ret)) { if (v === null) ud.delete(k); else ud.set(k, v); }
    return ud;
};
/** Den første række med `tekst` i kolonne A (en feltbloks overskrift, en tabels sti-række). */
const overskrift = (c: ReadonlyMap<string, Læstværdi>, tekst: string) => {
    const r = [...c].filter(([k, v]) => /^A\d+$/.test(k) && v === tekst).map(([k]) => Number(k.slice(1))).sort((a, b) => a - b);
    return r[0];
};

describe("Codex' andet review: formler uden resultat og ukendte faneformer afvises — også i browseren", () => {
    it("en boolsk formel med tomt <v/> er ikke nej, men en formel uden resultat: analysen afviser arket med celle", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const [fane, ref] = læsLag(læsCeller(e.bytes)).get("units.gasmotor.enabled")!.hvor.split("!");
        for (const xml of [`<c r="${ref}" t="b"><f>TRUE()</f><v/></c>`, `<c r="${ref}" t="b"><f>TRUE()</f><v></v></c>`,
            `<c r="${ref}"><f>0.2</f></c>`, `<c r="${ref}" t="str"><f>"ja"</f><v></v></c>`]) {
            const wb = new Arbejdsbog(e.bytes);
            sætRå(wb, fane, ref, xml);
            const uden: string[] = [];
            expect(læsCeller(wb.bytes(), uden).get(fane)!.get(ref), xml).toBeUndefined();
            // (Listen gælder hele arbejdsbogen — Varmepumpes IF(…;"") læses af modelscriptet; analysen ser kun appens faner.)
            expect(uden.filter((x) => x.startsWith(`${fane}!`)), xml).toEqual([`${fane}!${ref}`]);
            expect(await analyserUpload(wb.bytes(), VAERKER, HENT), xml).toMatchObject({ art: "afvist", grund: expect.stringMatching(new RegExp(`${fane}!${ref}: cellen har en formel uden et gemt resultat`)) });
        }
        const wb = new Arbejdsbog(e.bytes);
        sætRå(wb, fane, ref, `<c r="${ref}" t="b"><f>TRUE()</f><v>1</v></c>`);
        expect(læsCeller(wb.bytes()).get(fane)!.get(ref)).toBe(true);                  // gemt resultat: læses som det
        // En formel uden resultat i modelrepoets faner afviser ikke her: dem læser modelscriptet (som før).
        const wb2 = new Arbejdsbog(e.bytes);
        sætRå(wb2, "Anlaeg", "H9", `<c r="H9"><f>30</f></c>`);
        expect((await analyserUpload(wb2.bytes(), VAERKER, HENT)).art).not.toBe("afvist");
    }, 30_000);

    it("Øvrige felter i formen fra før rettelserne (stien i kolonne A) afvises med besked om at eksportere igen", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const c = læsCeller(e.bytes).get(OEVRIGE)!;
        const h = overskrift(c, "felt");
        expect(ukendteOverskrifter(OEVRIGE, c)).toEqual([]);
        expect(ukendteOverskrifter(OEVRIGE, med(c, { [`A${h}`]: "sti" }))).toEqual([{ ref: `A${h}`, ældre: true }]);
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark(OEVRIGE).sæt(`A${h}`, "sti");
        const a = await analyserUpload(wb.bytes(), VAERKER, HENT);
        expect(a).toMatchObject({ art: "afvist", grund: expect.stringMatching(/ældre udgave af appen.*Eksportér værket igen/) });
        expect(await analyserUpload(wb.bytes(), [], HENT)).toMatchObject({ art: "afvist" });          // også som nyt værk
    }, 30_000);

    it("de fælles vektorer for fanernes form: appens egen eksport har ingen ukendte overskrifter", async () => {
        const c = læsCeller((await eksporter(andeby(), skabelon(), NU)).bytes);
        const start = c.get(START_OG_DRIFT)!, bal = c.get(BALANCEMARKED)!, oev = c.get(OEVRIGE)!;
        const tilfaelde: [string, string, ReadonlyMap<string, Læstværdi>][] = [
            ["Andebys eksport", START_OG_DRIFT, start], ["Andebys eksport", BALANCEMARKED, bal], ["Andebys eksport", OEVRIGE, oev],
            ["tidligere Øvrige felter", OEVRIGE, new Map<string, string | number>([["A1", "Øvrige felter"], ["A4", "sti"], ["B4", "værdi"], ["C4", KUN_HVIS], ["A5", "electricity.tariff_consumption_flat"], ["B5", 125], ["C5", 129.8]])],
            ["tabellens sti-række omdøbt", START_OG_DRIFT, med(start, { [`A${overskrift(start, STI_OVERSKRIFT)}`]: "sti" })],
            ["feltblokkens 'felt' omdøbt", BALANCEMARKED, med(bal, { [`A${overskrift(bal, "felt")}`]: "felter" })],
            ["løs 'kun hvis' under fanen", OEVRIGE, med(oev, { C900: KUN_HVIS })],
            ["'sti i modellen' slettet: tabellen er væk, ingen overskrift tilbage", START_OG_DRIFT, med(start, { [`A${overskrift(start, STI_OVERSKRIFT)}`]: null })],
        ];
        const beregnet = {
            _om: "Appens faner i værksarket: rækker, der ligner en overskrift, men ikke er en kendt blok (Codex' andet review, runde 14). Genereret af app/src/sider/konfiguration/eksport/lag.spec.ts (FJV_SKRIV_VEKTORER=1) fra ukendteOverskrifter; fabric/tests/test_arklag_vektorer.py kræver samme udfald af fjv.arklag.ukendte_overskrifter. Ret aldrig i hånden.",
            tilfaelde: tilfaelde.map(([navn, fane, celler]) => ({ navn, fane, celler: Object.fromEntries(celler), ud: ukendteOverskrifter(fane, celler) })),
        };
        if (process.env.FJV_SKRIV_VEKTORER) writeFileSync(FANEVEKTORFIL, `${JSON.stringify(beregnet, null, 1)}\n`);
        expect(existsSync(FANEVEKTORFIL), "kør: FJV_SKRIV_VEKTORER=1 npx vitest run src/sider/konfiguration/eksport/lag.spec.ts").toBe(true);
        expect(JSON.parse(readFileSync(FANEVEKTORFIL, "utf8"))).toEqual(beregnet);
        expect(beregnet.tilfaelde.slice(0, 3).map((t) => t.ud)).toEqual([[], [], []]);
        expect(beregnet.tilfaelde.slice(3, 7).map((t) => t.ud.length)).toEqual([1, 1, 1, 1]);
        expect(beregnet.tilfaelde[3].ud).toEqual([{ ref: "A4", ældre: true }]);
        expect(beregnet.tilfaelde[4].ud).toEqual([{ ref: expect.stringMatching(/^A\d+$/), ældre: false }]);
    }, 30_000);
});

describe("en ægte boolsk celle (TRUE/FALSE) betyder ja/nej — ens i forhåndsvisningen og importen", () => {
    it("feltreglen: TRUE/FALSE er 1/0 i et 0/1-felt og true/false i et ja/nej-felt (som fjv.feltkatalog)", () => {
        expect(læsCelle("units.x.initial_status", true)).toEqual({ json: "1" });
        expect(læsCelle("units.x.initial_status", false)).toEqual({ json: "0" });
        expect(læsCelle("units.x.enabled", true)).toEqual({ json: "true" });
        expect(læsCelle("units.x.enabled", false)).toEqual({ json: "false" });
        expect(læsCelle("units.x.min_uptime", true)).toEqual({ fejl: expect.stringMatching(/helt tal \(cellen indeholder sand\)/) });
    });

    it("læseren giver en boolsk celle som sand/falsk (ikke 1/0), og forhåndsvisningen ser på betydningen", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const lag = læsLag(læsCeller(e.bytes));
        const STIER = ["units.gasmotor.enabled", "units.gasmotor.initial_status"];
        // Eksportens ja/nej skrevet om til TRUE/FALSE med samme betydning: ingen ændring (importen gemmer intet).
        const wb = new Arbejdsbog(e.bytes);
        const før = new Map<string, boolean>();
        for (const sti of STIER) {
            const x = lag.get(sti)!, [fane, ref] = x.hvor.split("!");
            const j = læsCelle(sti, x.v);
            expect("json" in j, `${sti}: ${JSON.stringify(j)}`).toBe(true);
            const b = "json" in j && (j.json === "true" || j.json === "1");
            før.set(sti, b);
            sætRå(wb, fane, ref, `<c r="${ref}" t="b"><v>${b ? 1 : 0}</v></c>`);
            expect(læsCeller(wb.bytes()).get(fane)!.get(ref)).toBe(b);
        }
        expect(await analyserUpload(wb.bytes(), VAERKER, HENT)).toMatchObject({ art: "ingen_aendringer" });
        // Den modsatte værdi i 0/1-feltet er en ændring, vist som ja/nej — den samme, importen gemmer.
        const sti = "units.gasmotor.initial_status", [fane, ref] = lag.get(sti)!.hvor.split("!");
        const wb2 = new Arbejdsbog(e.bytes);
        sætRå(wb2, fane, ref, `<c r="${ref}" t="b"><v>${før.get(sti) ? 0 : 1}</v></c>`);
        const a = await analyserUpload(wb2.bytes(), VAERKER, HENT);
        expect(a.art).toBe("revision");
        if (a.art !== "revision") return;
        expect(a.forskel.felter).toEqual([expect.objectContaining({ hvor: START_OG_DRIFT, felt: expect.stringMatching(/initial_status/), nu: før.get(sti) ? "nej" : "ja" })]);
    }, 30_000);
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

    it("en ændret og en tømt række i Øvrige felter er ændringer; uændret ark er ingen", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        expect(await analyserUpload(e.bytes, vaerker, hent)).toMatchObject({ art: "ingen_aendringer" });
        const { fane, ref } = lagcelle(e.bytes, "electricity.tariff_consumption_flat");
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark(fane).sæt(ref, 131);
        const basis = læsArkmodel(læsCeller(e.bytes));
        expect(sammenlign(basis, genkend(wb.bytes()).model).felter).toEqual([expect.objectContaining({ hvor: OEVRIGE, før: "125", nu: "131" })]);
        const wb2 = new Arbejdsbog(e.bytes);
        wb2.regneark(fane).sæt(ref.replace("B", "F"), null);                 // stien ryddet: rækken er væk
        expect(sammenlign(basis, genkend(wb2.bytes()).model).felter).toEqual([expect.objectContaining({ hvor: OEVRIGE, nu: "rækken er slettet" })]);
    });

    it("et ark i format 2 (før appens faner): afvises klart, når værket findes; ellers et nyt værk som før", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark(MARKOER_ARK).sæt("B1", MARKOER_FORMAT_FOER);
        const gammelt = wb.bytes();
        expect(læsMarkering(læsCeller(gammelt))?.format).toBe(MARKOER_FORMAT_FOER);
        expect(await analyserUpload(gammelt, vaerker, hent)).toMatchObject({ art: "anden_eksport", vaerk: vaerker[0], ældre: true, arkKode: "andeby_fiktivt_referencevaerk" });
        expect(await analyserUpload(gammelt, [], hent)).toMatchObject({ art: "nyt", grund: expect.stringMatching(/ikke findes her/) });
        wb.regneark(MARKOER_ARK).sæt("B1", "fjv-vaerksark-eksport/1");
        expect(læsMarkering(læsCeller(wb.bytes()))).toBeNull();
    });

    it(`kolonnen '${KUN_HVIS}' er en del af en række: en rettet betingelse vises`, async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const { fane, ref } = lagcelle(e.bytes, "electricity.tariff_consumption_flat");
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark(fane).sæt(ref.replace("B", "C"), 130);
        expect(sammenlign(læsArkmodel(læsCeller(e.bytes)), genkend(wb.bytes()).model).felter).toEqual([expect.objectContaining({ felt: expect.stringMatching(/kun hvis modelscriptet giver/), nu: "130" })]);
    });
});
