// Codex K8 (review af runde 8), F1, F2, F3, F5 og F6 — skrevet FØR rettelsen.
// Facit kommer fra modelrepoets egne linjer: f, andeby_profil og heat_params i scripts/vaerksark_til_yaml.py @ eef950a
// udført uændret i Python (samme metode som Codex' orakel i K8).
import { describe, expect, it } from "vitest";
import { MODELSPEJL } from "./modelspejl.data";
import { afdrift, harAfdrift, spejlcase } from "./modelspejl";
import { NYT_VAERK_SKABELON } from "@/sider/konfiguration/nyt-vaerk.data";
import { autoEffekt, bygVaerk, kapacitet, skalerVarmelast, startUdkast, tjekTrin, varmelastFaktor, type Udkast } from "@/sider/konfiguration/nyt-vaerk";
import { modelrepoBudskab } from "@/sider/konfiguration/modelrepo-logik";
import VEKTORER from "@/sider/konfiguration/skalering.vektorer.json";
import { pyRound } from "./pyround";

const s = NYT_VAERK_SKABELON!;
const varme = (g: number) => new Map(skalerVarmelast(s.blade, s.varmelast, g).map((b) => [b.sti, JSON.parse(b.vaerdi_json)]));
const udkast = (gwh: string): Udkast => ({ ...startUdkast(s), kode: "lille", navn: "Lille", varme: { kilde: "gwh", gwh } });

describe("F1 — Pythons afrunding (halvtilfælde runder til lige)", () => {
    it("G = 12,5: døgnprofilens anden værdi er round(4,5 × 0,125, 3) = 0,562 som i modellen (ikke 0,563)", () => {
        expect(varmelastFaktor(s.varmelast, 12.5)).toBe(0.125);
        const v = varme(12.5);
        expect(v.get("heat_load_params.baseline_profile_mw")).toEqual([0.555, 0.562, 0.575, 0.596, 0.603, 0.639, 0.699, 0.701, 0.669, 0.619, 0.597, 0.587, 0.57, 0.559, 0.552, 0.545, 0.554, 0.575, 0.591, 0.596, 0.592, 0.591, 0.576, 0.549]);
        expect(v.get("heat_load_params.gaf_mw_per_k")).toBe(0.0957);
        expect(v.get("heat_load_params.nettab_slope_mw_per_k")).toBe(0.0596);
    });
    it("G = 103,125: faktoren er round(1,03125, 4) = 1,0312 og gaf 0,7892 som i modellen (ikke 1,0313 / 0,7893)", () => {
        expect(varmelastFaktor(s.varmelast, 103.125)).toBe(1.0312);
        const v = varme(103.125);
        expect(v.get("heat_load_params.gaf_mw_per_k")).toBe(0.7892);
        expect(v.get("heat_load_params.nettab_slope_mw_per_k")).toBe(0.4917);
        expect((v.get("heat_load_params.baseline_profile_mw") as number[]).slice(0, 4)).toEqual([4.575, 4.64, 4.746, 4.916]);
    });
});

describe("F2 — kapacitetsestimatet følger den faktisk genererede faktor", () => {
    it("G = 1 GWh: modellen bruger f = 1 (hele Andeby-lasten); spidslasten er Andebys, og en 1 MW kedel afvises", () => {
        const u = udkast("1");
        expect(kapacitet(u, s).spidslast!).toBeCloseTo(40.02, 6);
        expect(autoEffekt(u.enheder[0], u, s)).toBe(50);
        u.enheder[0].værdier.set("p_max_heat", "1");
        expect(tjekTrin("enheder", u, s, { optagneKoder: new Set() }).join(" ")).toMatch(/spidslasten er ca\. 40 MW/);
    });
    it("lige over grænsen (G = 1,01): f = 0,0101, spidslast ca. 0,40 MW", () => {
        const u = udkast("1,01");
        expect(kapacitet(u, s).spidslast!).toBeCloseTo(40.02 * 0.0101, 6);
    });
    it("særreglen ved G ≤ 1 er synlig i varmetrinnet", () => {
        expect(tjekTrin("varme", udkast("0,8"), s, { optagneKoder: new Set() }).join(" ")).toMatch(/G ≤ 1 GWh .*f = 1/);
    });
});

describe("F3 — en sprunget sammenligning giver aldrig en lighedserklæring", () => {
    it("revision 2 med gaspris 999 mod modelrepoets 606: afdrift vises, og 'felt for felt' siges ikke", () => {
        const pin = spejlcase("andeby")!;
        const b = new Map(Object.entries(pin.blade).map(([sti, [v]]) => [sti, v]));
        b.set("prices.natural_gas.value", "999.0");
        const v = { kode: "andeby", kilde: "repo", revision: 2, repo_commit: MODELSPEJL.model_commit };
        const a = afdrift(v, b)!;
        expect(harAfdrift(a)).toBe(true);
        expect(a.afviger.map((x) => x.sti)).toEqual(["prices.natural_gas.value"]);
        const t = modelrepoBudskab(v, a, "andeby");
        expect(t).not.toMatch(/felt for felt/);
        expect(t).toMatch(/rettet i appen \(revision 2\).*1 felt afviger/);
    });
});

describe("F5 — standardkommandoens hele betydning følger med til appen", () => {
    it("spejlet bærer alle fortolkede flag, og ingen standardkommando har flag, appens standardkørsel ikke sætter", () => {
        for (const [kode, c] of Object.entries(MODELSPEJL.cases)) {
            if (!c.standard) continue;
            expect(c.standard, kode).toHaveProperty("ekstra");
            expect((c.standard as { ekstra?: string[] }).ekstra, kode).toEqual([]);
            expect(c.standard.balancing_method, kode).toBeNull();
            expect([c.standard.start, c.standard.slut], kode).toEqual([null, null]);
        }
    });
});

describe("F6 — proveniens følger enhedsbladene ind i værket", () => {
    it("gaskedlens D&V er Andebys med kilde; dens effekt er appens egen antagelse", () => {
        const blade = new Map(bygVaerk({ ...udkast("50"), kode: "vesterby" }, s).blade.map((b) => [b.sti, b]));
        expect(blade.get("units.gaskedel.var_om")).toMatchObject({ vaerdi_json: "89.0", kommentar: expect.stringMatching(/Kilde: Andeby, cases\/andeby\.yaml:\d+ @ eef950a/) });
        expect(blade.get("units.gaskedel.p_max_heat")?.kommentar).toMatch(/egen antagelse/);
        const u = { ...udkast("50"), kode: "vesterby" };
        u.enheder[0].værdier.set("var_om", "70");
        expect(new Map(bygVaerk(u, s).blade.map((b) => [b.sti, b])).get("units.gaskedel.var_om")?.kommentar).toMatch(/Brugerens eget valg/);
    });
});

describe("F1 — orakel: modelrepoets egne skaleringslinjer udført i Python (skalering.vektorer.json)", () => {
    it("hver G (de faste, alle halvtilfælde i 1,01–500 og en stikprøve) giver præcis modellens f, gaf, nettab og profil", () => {
        const vek = VEKTORER.vektorer as { g: number; f: number; gaf: number; nettab: number; profil: number[]; halv?: boolean }[];
        expect(vek.length).toBeGreaterThan(100);
        expect(vek.some((x) => x.g === 12.5) && vek.some((x) => x.g === 103.125)).toBe(true);
        expect(vek.filter((x) => x.halv).length).toBeGreaterThan(10);
        const afvigelser = vek.filter((x) => {
            const v = varme(x.g);
            return varmelastFaktor(s.varmelast, x.g) !== x.f || v.get("heat_load_params.gaf_mw_per_k") !== x.gaf
                || v.get("heat_load_params.nettab_slope_mw_per_k") !== x.nettab
                || JSON.stringify(v.get("heat_load_params.baseline_profile_mw")) !== JSON.stringify(x.profil);
        }).map((x) => x.g);
        expect(afvigelser).toEqual([]);
    });
    it("pyRound: halvtilfælde til lige (som Python), ellers den eksakte binære værdi", () => {
        expect(pyRound(0.5625, 3)).toBe(0.562);         // 9/16: ægte halvtilfælde
        expect(pyRound(0.5635, 3)).toBe(0.564);         // ikke et halvtilfælde i binær form
        expect(pyRound(1.03125, 4)).toBe(1.0312);
        expect(pyRound(2.5, 0)).toBe(2);
        expect(pyRound(3.5, 0)).toBe(4);
        expect(pyRound(-0.5625, 3)).toBe(-0.562);
        expect(pyRound(2.675, 2)).toBe(2.67);           // 2,675 er binært lidt under: Python giver 2,67
        expect(pyRound(0, 3)).toBe(0);
    });
});
