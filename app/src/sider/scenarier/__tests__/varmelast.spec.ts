//-----------------------------------------------------------------------
// Brief 18 / KONTRAKT §6d: varmelast-valget i scenariet. Skrevet FØR koden.
//   syntetisk · værkets aktive tidsserie · en anden gyldig tidsserie · repoets hvidlistede fil
//   + advarsel, når tidsseriens periode ikke dækker scenariets.
//-----------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import * as modul from "../varmelast";
import { forventetFrosset, frosset, sammeKort, tjekÆndringer, type Blade, type Scenariefelter } from "../logik";
import { VAERKER } from "./vaerker.testdata";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = modul as any;
const blade: Blade = new Map(Object.entries(VAERKER.billund_sporb));

const AKTIV = {
    id: "11111111-1111-4111-8111-111111111111", vaerk_id: "v", rolle: "varmelast", navn: "Billund målt 2025–26",
    filnavn: "billund.csv", sha256: "a".repeat(64), sti: "Files/fjv/tidsserier/billund_sporb/aaa.csv", oploesning: "1h", start: "2025-07-01T00:00:00Z", slut: "2026-06-30T23:00:00Z",
    antal_huller: 0, status: "gyldig", aktiv: true,
};
const ANDEN = { ...AKTIV, id: "22222222-2222-4222-8222-222222222222", navn: "Billund vinter", sha256: "b".repeat(64), start: "2026-01-01T00:00:00Z", slut: "2026-02-28T23:00:00Z", aktiv: false };
const AFVIST = { ...AKTIV, id: "33333333-3333-4333-8333-333333333333", navn: "Defekt", status: "afvist", aktiv: false };
const SOL = { ...AKTIV, id: "44444444-4444-4444-8444-444444444444", rolle: "solprofil", navn: "Sol", aktiv: true };
const SERIER = [AKTIV, ANDEN, AFVIST, SOL];

describe("varmelast-muligheder", () => {
    it("modulet findes", () => expect(typeof m.varmelastMuligheder).toBe("function"));

    it("syntetisk · værkets aktive · andre gyldige · repoets filer (kun varmelast-serier, ikke afviste)", () => {
        const mul = m.varmelastMuligheder(SERIER, "billund_sporb") as { valg: { type: string; id?: string; fil?: string }; etiket: string }[];
        const typer = mul.map((x) => x.valg.type);
        expect(typer[0]).toBe("aktiv");
        expect(typer).toContain("syntetisk");
        // K5-F6: også den aktive kan vælges som en BESTEMT serie (så valget ikke følger en senere aktivering).
        expect(mul.filter((x) => x.valg.type === "tidsserie").map((x) => x.valg.id)).toEqual([AKTIV.id, ANDEN.id]);
        expect(mul.some((x) => x.valg.type === "repo" && x.valg.fil === "billund_abvaerk_hourly_splejset_jun2026.csv")).toBe(true);
        expect(mul.some((x) => x.etiket.includes("Defekt") || x.etiket.includes("Sol"))).toBe(false);
        expect(mul[0].etiket).toMatch(/Billund målt 2025–26/);
    });

    it("uden aktiv serie: 'følg værkets aktive' (regnes syntetisk) og syntetisk; Andebys valg har ingen Billund-filer", () => {
        const mul = m.varmelastMuligheder([], "andeby") as { valg: { type: string } }[];
        expect(mul.map((x) => x.valg.type)).toEqual(["aktiv", "syntetisk"]);
    });
});

describe("kod og læs varmelast-valget (ScenarieAendring _tidsserie.varmelast + Scenarie.heat_csv)", () => {
    const rund = (valg: unknown, serier = SERIER) => {
        const k = m.kodVarmelast(valg, serier) as { aendring?: { type: string; sti: string; vaerdi_json: string }; heat_csv: string | null };
        return { k, læst: m.læsVarmelast(k.aendring ? [k.aendring] : [], k.heat_csv, serier) };
    };
    it("aktiv: ingen ændring, ingen heat_csv", () => {
        const { k, læst } = rund({ type: "aktiv" });
        expect(k).toEqual({ heat_csv: null });
        expect(læst).toEqual({ type: "aktiv" });
    });
    it("syntetisk med en aktiv serie: set _tidsserie.varmelast = \"syntetisk\"", () => {
        const { k, læst } = rund({ type: "syntetisk" });
        expect(k.aendring).toEqual({ type: "set", sti: "_tidsserie.varmelast", vaerdi_json: '"syntetisk"' });
        expect(læst).toEqual({ type: "syntetisk" });
    });
    it("syntetisk uden aktiv serie gemmes også (K5-F6); ingen ændring = følg den aktive", () => {
        expect(m.kodVarmelast({ type: "syntetisk" }, [])).toEqual({ aendring: { type: "set", sti: "_tidsserie.varmelast", vaerdi_json: '"syntetisk"' }, heat_csv: null });
        expect(m.læsVarmelast([], null, [])).toEqual({ type: "aktiv" });
    });
    it("en anden serie: set _tidsserie.varmelast = id (JSON-tekst)", () => {
        const { k, læst } = rund({ type: "tidsserie", id: ANDEN.id });
        expect(k.aendring?.vaerdi_json).toBe(JSON.stringify(ANDEN.id));
        expect(læst).toEqual({ type: "tidsserie", id: ANDEN.id });
    });
    it("den aktive valgt som BESTEMT serie gemmes med id (K5-F6)", () => {
        expect(m.kodVarmelast({ type: "tidsserie", id: AKTIV.id }, SERIER).aendring?.vaerdi_json).toBe(JSON.stringify(AKTIV.id));
    });
    it("repoets fil: kun heat_csv — backenden lader heat_csv vinde over den aktive serie (logik.ts §6d-prioritet)", () => {
        const { k, læst } = rund({ type: "repo", fil: "billund_abvaerk_hourly_splejset_jun2026.csv" });
        expect(k).toEqual({ heat_csv: "billund_abvaerk_hourly_splejset_jun2026.csv" });
        expect(læst).toEqual({ type: "repo", fil: "billund_abvaerk_hourly_splejset_jun2026.csv" });
    });
});

describe("tjek: gyldighed og dækning af scenariets periode", () => {
    const tjek = (valg: unknown, start: string | null, slut: string | null, serier = SERIER) =>
        m.tjekVarmelast(valg, serier, { start, slut }) as { niveau: string; tekst: string }[];

    it("den aktive helårsserie dækker vintervinduet: intet at sige", () => {
        expect(tjek({ type: "aktiv" }, "2026-01-05", "2026-01-16")).toEqual([]);
    });
    it("en vinterserie dækker under 95 % af helåret: FEJL (startBestilling afviser, MIN_DAEKNING_VARMELAST)", () => {
        const f = tjek({ type: "tidsserie", id: ANDEN.id }, "2025-07-01", "2026-06-30");
        expect(f).toHaveLength(1);
        expect(f[0].niveau).toBe("fejl");
        expect(f[0].tekst).toMatch(/\d+ %/);
        expect(f[0].tekst).toMatch(/Billund vinter/);
        expect(f[0].tekst).toMatch(/01-01-2026/);
        expect(f[0].tekst).toMatch(/01-07-2025/);
    });
    it("sidste døgn mangler en time (≥ 95 % dækket): advarsel, ikke fejl", () => {
        const kort = { ...ANDEN, slut: "2026-02-28T22:00:00Z" };
        const f = tjek({ type: "tidsserie", id: kort.id }, "2026-02-01", "2026-02-28", [AKTIV, kort]);
        expect(f).toHaveLength(1);
        expect(f[0].niveau).toBe("advarsel");
        expect(tjek({ type: "tidsserie", id: kort.id }, "2026-02-01", "2026-02-27", [AKTIV, kort])).toEqual([]);
    });
    it("huller i serien giver en advarsel", () => {
        const huller = { ...AKTIV, antal_huller: 161 };
        expect(tjek({ type: "aktiv" }, "2026-01-05", "2026-01-16", [huller])[0].tekst).toMatch(/161 huller/);
    });
    it("to aktive varmelast-serier er en fejl (startBestilling afviser)", () => {
        const f = tjek({ type: "aktiv" }, "2026-01-05", "2026-01-16", [AKTIV, { ...ANDEN, aktiv: true }]);
        expect(f.some((x) => x.niveau === "fejl" && /2 aktive/.test(x.tekst))).toBe(true);
    });
    it("en afvist eller forsvundet serie er en fejl", () => {
        expect(tjek({ type: "tidsserie", id: AFVIST.id }, "2026-01-05", "2026-01-16")[0].niveau).toBe("fejl");
        expect(tjek({ type: "tidsserie", id: "ukendt" }, "2026-01-05", "2026-01-16")[0].niveau).toBe("fejl");
    });
    it("tom scenarieperiode bruger værkets periode", () => {
        expect(m.tjekVarmelast({ type: "tidsserie", id: ANDEN.id }, SERIER, { start: null, slut: null }, blade)).toHaveLength(1);
    });
});

describe("samspil med reglerne for ændringer og frysning", () => {
    const felter: Scenariefelter = { periode_start: "2026-01-05", periode_slut: "2026-01-16", med_balancering: false, balancing_method: null, mip_rel_gap: 0.0002, mip_abs_gap: 100, tidsgraense_s: null, ekstra_flag: null, heat_csv: null };

    it("_tidsserie.varmelast er en lovlig ændring, selvom stien ikke står i værket", () => {
        expect(tjekÆndringer([{ type: "set", sti: "_tidsserie.varmelast", vaerdi_json: JSON.stringify(ANDEN.id) }], blade)).toEqual([]);
    });
    it("frysningen af den valgte serie indgår i genbrugstjekket: anden serie = andet kort", () => {
        const medAktiv = forventetFrosset([], felter, blade, SERIER);
        const medAnden = forventetFrosset([{ type: "set", sti: "_tidsserie.varmelast", vaerdi_json: JSON.stringify(ANDEN.id) }], felter, blade, SERIER);
        // Samme form som startBestilling fryser: præcis {id (små bogstaver), sha256} (K5-F7; se k5.spec.ts mod bygFrossetInput).
        expect(medAktiv.get("_koersel.tidsserie.varmelast")).toBe(JSON.stringify({ id: AKTIV.id, sha256: AKTIV.sha256 }));
        expect(medAnden.get("_koersel.tidsserie.varmelast")).toBe(JSON.stringify({ id: ANDEN.id, sha256: ANDEN.sha256 }));
        expect(sammeKort(medAktiv, medAnden)).toBe(false);
        // En kørsel frosset med den aktive serie matcher det forventede kort.
        const rækker = [...medAktiv].map(([sti, vaerdi_json]) => ({ kilde: sti.startsWith("_koersel.") ? "scenarie" : "aendring", sti, vaerdi_json }));
        expect(sammeKort(medAktiv, frosset(rækker))).toBe(true);
    });
});

describe("knap-parret og varmelasten", () => {
    const tom = { felter: { med_balancering: false, balancing_method: null, ekstra_flag: null, heat_csv: null }, aendringer: [] as { type: "set" | "enable" | "disable"; sti: string; vaerdi_json?: string | null }[] };

    it("valgNøgle og valgFraNøgle er hinandens omvendte", () => {
        for (const v of [{ type: "aktiv" }, { type: "syntetisk" }, { type: "tidsserie", id: ANDEN.id }, { type: "repo", fil: "billund_abvaerk_hourly.csv" }]) {
            expect(m.valgFraNøgle(m.valgNøgle(v))).toEqual(v);
        }
    });

    it("fælles valg sættes på begge sider af parret", () => {
        const par = m.anvendVarmelast({ reference: structuredClone(tom), scenarie: structuredClone(tom) }, { type: "tidsserie", id: ANDEN.id }, { type: "tidsserie", id: ANDEN.id }, SERIER);
        for (const side of [par.reference, par.scenarie]) {
            expect(side.aendringer).toEqual([{ type: "set", sti: "_tidsserie.varmelast", vaerdi_json: JSON.stringify(ANDEN.id) }]);
            expect(side.felter.heat_csv).toBeNull();
        }
    });

    it("'målt varmelast': referencen er syntetisk, selvom værket har en aktiv serie", () => {
        const par = m.anvendVarmelast({ reference: structuredClone(tom), scenarie: structuredClone(tom) }, { type: "syntetisk" }, { type: "aktiv" }, SERIER);
        expect(par.reference.aendringer).toEqual([{ type: "set", sti: "_tidsserie.varmelast", vaerdi_json: '"syntetisk"' }]);
        expect(par.scenarie.aendringer).toEqual([]);
    });

    it("'målt varmelast' kan bruges på et værk uden repo-fil, når værket har en gyldig målt serie", () => {
        const k = { id: "maalt_varmelast" };
        expect(m.maaltVarmelastMulig(k, [], "andeby")).toBe(false);
        expect(m.maaltVarmelastMulig(k, [{ ...AKTIV, aktiv: false }], "andeby")).toBe(true);
        expect(m.maaltVarmelastMulig(k, [AFVIST], "andeby")).toBe(false);
        expect(m.maaltVarmelastMulig(k, [], "billund_sporb")).toBe(true);
    });

    it("repo-fil i et par: kun heat_csv, ingen ændring", () => {
        const par = m.anvendVarmelast({ reference: structuredClone(tom), scenarie: structuredClone(tom) }, { type: "syntetisk" }, { type: "repo", fil: "billund_abvaerk_hourly.csv" }, SERIER);
        expect(par.scenarie).toEqual({ ...tom, felter: { ...tom.felter, heat_csv: "billund_abvaerk_hourly.csv" } });
    });

    it("de målte muligheder for knappen: gyldige serier og repoets filer, aldrig syntetisk", () => {
        const mul = m.maalteMuligheder(SERIER, "billund_sporb") as { valg: { type: string } }[];
        expect(mul.some((x) => x.valg.type === "syntetisk")).toBe(false);
        expect(mul.map((x) => x.valg.type)).toEqual(["aktiv", "tidsserie", "repo", "repo"]);
    });
});
