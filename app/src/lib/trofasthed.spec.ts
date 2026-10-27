// Runde 8 (fv-trofast): appen følger modelrepoets data og antagelser ved den pinnede commit.
// Uden installationsdata: alt her bygger på modelspejl.data.ts (genereret fra modelrepoet, bundet af tjek_trofasthed.py).
import { describe, expect, it } from "vitest";
import { afdrift, bladkilde, harAfdrift, koerselskilde, modelKoersel, SPEJL_COMMIT, spejlcase } from "./modelspejl";
import { MODEL_COMMIT } from "@/sider/konfiguration/katalog.data";
import { NYT_VAERK_SKABELON } from "@/sider/konfiguration/nyt-vaerk.data";
import { skalerVarmelast, varmelastFaktor } from "@/sider/konfiguration/nyt-vaerk";
import { modelrepoBudskab, vaerdikilde } from "@/sider/konfiguration/modelrepo-logik";
import { standardVarmelastvalg, varmelastMuligheder, type TidsserieInfo } from "@/sider/scenarier/varmelast";
import { omkostningsBro } from "@/sider/analyser/ibcs-grafer";
import { balanceMetode, type Balance, type Samlet } from "@/sider/analyser/beregn";

const SPLEJSET = "billund_abvaerk_hourly_splejset_jun2026.csv";

describe("modelspejlet", () => {
    it("er bygget ved samme commit som resten af appens viden", () => {
        expect(SPEJL_COMMIT).toBe(MODEL_COMMIT);
        expect(Object.keys(spejlcase("andeby")!.blade).length).toBeGreaterThan(200);
    });
});

describe("standardkørslen er modelrepoets egen kommando for casen (B2)", () => {
    it("Spor B: med balancemarked og målt varmelast (cases/billund_sporB.yaml:17-19, README.md:177)", () => {
        expect(modelKoersel("billund_sporb")).toMatchObject({ med_balancering: true, heat_csv: SPLEJSET, kilde: "cases/billund_sporB.yaml:17-19" });
    });
    it("Spor A-ankeret: med balancemarked, syntetisk varmelast (README.md:176)", () => {
        expect(modelKoersel("billund_spora")).toMatchObject({ med_balancering: true, heat_csv: null, kilde: "README.md:176" });
    });
    it("Billund i dag og Billund rullende år: målt varmelast", () => {
        expect(modelKoersel("billund_idag")).toMatchObject({ med_balancering: true, heat_csv: SPLEJSET });
        expect(modelKoersel("billund_spora_rullende")).toMatchObject({ med_balancering: true, heat_csv: SPLEJSET, kilde: "README.md:178" });
    });
    it("Andeby: casens egen kommando er uden balancemarked (cases/andeby.yaml:9)", () => {
        expect(modelKoersel("andeby")).toMatchObject({ med_balancering: false, heat_csv: null, kilde: "cases/andeby.yaml:9" });
    });
    it("cases uden kommando i modelrepoet og egne værker: ingen standard, og teksten siger 'egen antagelse'", () => {
        expect(modelKoersel("billund_sporb_rullende")).toBeUndefined();
        expect(modelKoersel("billund_spora_rullende_bud")).toBeUndefined();
        expect(modelKoersel("vesterby")).toBeUndefined();
        expect(koerselskilde("billund_sporb_rullende")).toMatch(/^Egen antagelse: modelrepoet angiver ingen kørsel af cases\/billund_sporB_rullende\.yaml/);
        expect(koerselskilde("vesterby")).toMatch(/^Egen antagelse/);
        expect(koerselskilde("billund_sporb")).toMatch(/^Som modelrepoet kører cases\/billund_sporB\.yaml: med balancemarked, målt varmelast .*@ eef950a/);
    });
    it("varmelasten: modelrepoets fil, medmindre værket har sin egen aktive serie", () => {
        const ingen: TidsserieInfo[] = [];
        const mul = varmelastMuligheder(ingen, "billund_sporb");
        expect(standardVarmelastvalg(modelKoersel("billund_sporb"), ingen, mul)).toEqual({ type: "repo", fil: SPLEJSET });
        expect(standardVarmelastvalg(modelKoersel("billund_spora"), ingen, varmelastMuligheder(ingen, "billund_spora"))).toEqual({ type: "aktiv" });
        const aktiv: TidsserieInfo[] = [{ id: "a", rolle: "varmelast", navn: "egen", status: "gyldig", aktiv: true, sha256: "x" }];
        expect(standardVarmelastvalg(modelKoersel("billund_sporb"), aktiv, varmelastMuligheder(aktiv, "billund_sporb"))).toEqual({ type: "aktiv" });
        // Er filen ikke en mulighed (fx et andet rodværk), bruges den ikke.
        expect(standardVarmelastvalg(modelKoersel("billund_sporb"), ingen, [])).toEqual({ type: "aktiv" });
    });
});

describe("afdrift mellem et repoværk og casefilen ved den pinnede commit (V1)", () => {
    const pin = spejlcase("andeby")!;
    const blade = () => new Map(Object.entries(pin.blade).map(([s, [v]]) => [s, v]));
    it("et værk, der er casen felt for felt, har ingen afdrift", () => {
        const a = afdrift({ kode: "andeby", kilde: "repo", revision: 1, repo_commit: SPEJL_COMMIT }, blade());
        expect(harAfdrift(a)).toBe(false);
        expect(modelrepoBudskab({ kode: "andeby", kilde: "repo", revision: 1 }, a, "andeby")).toMatch(/^Værket er cases\/andeby\.yaml ved den pinnede modelversion eef950a/);
    });
    it("Fabric-databasen 27/10 (målt): importeret ved b49aeb0, og co2_eua.unit er den gamle", () => {
        const b = blade();
        b.set("prices.co2_eua.unit", "\"DKK/MWh_gas\"");
        const a = afdrift({ kode: "andeby", kilde: "repo", revision: 1, repo_commit: "b49aeb0a00000000000000000000000000000000" }, b)!;
        expect(a.gammelCommit).toBe(true);
        expect(a.afviger).toEqual([{ sti: "prices.co2_eua.unit", vaerk: "\"DKK/MWh_gas\"", model: "\"DKK/t\"", linje: 184 }]);
        expect(modelrepoBudskab({ kode: "andeby", kilde: "repo", revision: 1, repo_commit: "b49aeb0a" }, a, "andeby"))
            .toMatch(/importeret ved b49aeb0, men appen kører modelversion eef950a; 1 felt afviger fra cases\/andeby\.yaml @ eef950a/);
    });
    it("feltkilden: fil:linje @ commit — eller at værket afviger", () => {
        expect(bladkilde("andeby", "prices.co2_eua.value")).toBe("cases/andeby.yaml:183 @ eef950a");
        expect(vaerdikilde("andeby", "prices.co2_eua.value", "600.0")).toBe("Værdien: cases/andeby.yaml:183 @ eef950a");
        expect(vaerdikilde("andeby", "prices.co2_eua.value", "800.0")).toMatch(/^Modelrepoet har 600\.0 .*værket afviger$/);
        expect(vaerdikilde("vesterby", "prices.co2_eua.value", "600.0")).toBeUndefined();
    });
});

describe("guiden 'Nyt værk' skalerer varmelasten som modelrepoets værksark (B1)", () => {
    const s = NYT_VAERK_SKABELON!;
    // Forventet = Pythons round() i scripts/vaerksark_til_yaml.py (regnet med byg_nyt_vaerk.varmelast).
    const PY: Record<string, [number, number, number, number[]]> = {
        "10": [0.1, 0.0765, 0.0477, [0.444, 0.45, 0.46, 0.477, 0.482, 0.511, 0.559, 0.561, 0.536, 0.496, 0.478, 0.47, 0.456, 0.447, 0.441, 0.436, 0.443, 0.46, 0.473, 0.477, 0.474, 0.473, 0.461, 0.439]],
        "105.52": [1.0552, 0.8075, 0.5031, [4.682, 4.748, 4.856, 5.03, 5.088, 5.394, 5.899, 5.915, 5.651, 5.229, 5.039, 4.955, 4.815, 4.716, 4.658, 4.6, 4.675, 4.856, 4.989, 5.03, 4.996, 4.989, 4.864, 4.632]],
        "37.37": [0.3737, 0.286, 0.1782, [1.658, 1.682, 1.72, 1.781, 1.802, 1.91, 2.089, 2.095, 2.001, 1.852, 1.784, 1.755, 1.705, 1.67, 1.65, 1.629, 1.655, 1.72, 1.767, 1.781, 1.769, 1.767, 1.723, 1.641]],
        "0.8": [1, 0.7653, 0.4768, [4.437, 4.5, 4.602, 4.767, 4.822, 5.112, 5.59, 5.606, 5.355, 4.955, 4.775, 4.696, 4.563, 4.469, 4.414, 4.359, 4.43, 4.602, 4.728, 4.767, 4.735, 4.728, 4.61, 4.39]],
    };
    it("regel og kilde er modelrepoets: f = round(G / 100, 4)", () => {
        expect(s.varmelast).toMatchObject({ divisor_gwh: 100, afrunding: 4 });
        expect(s.varmelast.kilde).toMatch(/^scripts\/vaerksark_til_yaml\.py:1581 @ eef950a/);
    });
    for (const [g, [f, gaf, nettab, profil]] of Object.entries(PY)) {
        it(`G = ${g} GWh giver præcis det, modelrepoets konvertering giver`, () => {
            expect(varmelastFaktor(s.varmelast, Number(g))).toBe(f);
            const v = new Map(skalerVarmelast(s.blade, s.varmelast, Number(g)).map((b) => [b.sti, JSON.parse(b.vaerdi_json)]));
            expect(v.get("heat_load_params.gaf_mw_per_k")).toBe(gaf);
            expect(v.get("heat_load_params.nettab_slope_mw_per_k")).toBe(nettab);
            expect(v.get("heat_load_params.baseline_profile_mw")).toEqual(profil);
        });
    }
    it("hvert blad har sin kilde: Andeby i modelrepoet, modelrepoets skalering eller 'egen antagelse'", () => {
        for (const b of s.blade) {
            if (!b.kilde) continue;
            expect(b.kilde, b.sti).toMatch(/^(Andeby, cases\/andeby\.yaml:\d+ @ eef950a|scripts\/vaerksark_til_yaml\.py:\d+ @ eef950a|egen antagelse: )/);
        }
        expect(s.blade.find((b) => b.sti === "units.gaskedel.var_om")).toMatchObject({ vaerdi_json: "89.0", kilde: expect.stringMatching(/^Andeby, cases\/andeby\.yaml:\d+/) });
        expect(s.blade.find((b) => b.sti === "units.gaskedel.p_max_heat")?.kilde).toMatch(/^egen antagelse/);
        expect(s.egneAntagelser?.length).toBeGreaterThan(0);
    });
});

describe("legacy-metodens brutto er ikke objektivets (V9) og CO₂-kvoterne er nævnt (V10)", () => {
    const m = (netto: number, brutto: number) => ({ netto, brutto, kapacitet: null, aktivering_netto: null, sparet_elkoeb: null, aktivering_brutto: null });
    const samlet = (netto: number, brutto: number): Samlet => ({
        objektiv_dkk: null, varmebehov_mwh: null, produktion_mwh: null, nettab_mwh: null, nettab_pct: null, co2_ton: null, el_forbrug_mwh: null,
        tank_arbitrage_dkk: null, enheder: [], lagre: [], el_omkostning_dkk: 600_000, el_salg_dkk: 170_000, el_produktionstarif_dkk: 400,
        balance: { afrr: m(netto, brutto), mfrr: m(netto, brutto), i_alt: m(netto, brutto), harProdukter: false } as Balance,
    });
    it("metoden læses som modellen: scenariets flag slår værkets blad; ellers kodens standard legacy (src/config.py:993)", () => {
        expect(balanceMetode([{ sti: "balancing.method", vaerdi_json: "\"activation_value\"" }])).toBe("activation_value");
        expect(balanceMetode([{ sti: "balancing.method", vaerdi_json: "\"activation_value\"" }, { sti: "_koersel.balancing_method", vaerdi_json: "\"legacy\"" }])).toBe("legacy");
        expect(balanceMetode([])).toBe("legacy");
    });
    it("activation_value: brutto er trinnet; legacy: netto, og det manglende led står navngivet i resten", () => {
        const av = omkostningsBro(samlet(40_000, 50_000), samlet(60_000, 75_000), 1_000_000, 990_000)!;
        expect(av.steps.map((s) => [s.label, s.delta])).toContainEqual(["Balanceindtægt", -25_000]);
        const lg = omkostningsBro(samlet(40_000, 40_000), samlet(60_000, 60_000), 1_000_000, 990_000, true)!;
        expect(lg.steps.map((s) => [s.label, s.delta])).toContainEqual(["Balanceindtægt, netto", -20_000]);
        expect(lg.steps.at(-1)!.label).toBe("Brændsel, CO₂-kvoter, D&V, start m.m. inkl. sparet tarif og afgift ved aktivering (legacy-metoden) (ukendt)");
        expect(lg.steps.reduce((s, x) => s + x.delta, 0)).toBeCloseTo(-10_000, 6);   // vandfaldet afstemmer stadig
    });
});
