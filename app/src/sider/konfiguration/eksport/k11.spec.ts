// Runde 12b: Codex K11's modprøver mod eksport og genupload som rigtige tests — røde på 6c820b2, grønne efter
// rettelsen. Importens side (binding til værket, objektnavne, tidsserie som revision) prøves i Python
// (fabric/tests/test_revision.py, community/tests/test_r12_revision.py) og i gatens rundtur med modelscriptet.
import { describe, expect, it } from "vitest";
import { tjekNavn } from "../redigering";
import { analyserUpload, type Hentere } from "./analyse";
import { eksporter, grundlagstekst, læsMarkering, MARKOER_ARK, MARKOER_FORMAT, sha256Bytes } from "./eksporter";
import { GEMMES_IKKE } from "./genkend";
import { erArtefakt, PERIODE_START, planlæg, solenErNede, type Eksportkilde } from "./kort";
import { andeby, ANDEBY_ID, skabelon } from "./testdata";
import { Arbejdsbog, læsCeller } from "./xlsx";

const NU = new Date(Date.UTC(2026, 9, 28, 12));
const H = 3_600_000;
const VAERKER = [{ id: ANDEBY_ID, kode: "andeby", navn: "Andeby — fiktivt referenceværk", revision: 1 }];
const hent = (k: Eksportkilde = andeby()): Hentere => ({ kilde: async () => k, skabelon: async () => skabelon() });
const omdøb = (k: Eksportkilde, fra: string, til: string): Eksportkilde =>
    ({ ...k, blade: k.blade.map((b) => ({ ...b, sti: b.sti.replace(`units.${fra}.`, `units.${til}.`) })) });
/** Andeby med solprofilen ændret af `ret` (værdierne som array). */
const medSol = (ret: (v: (number | null)[]) => void): Eksportkilde => {
    const k = andeby();
    const v = [...k.solprofil!.serie.værdier];
    ret(v);
    return { ...k, solprofil: { ...k.solprofil!, serie: { ...k.solprofil!.serie, værdier: v } } };
};
const KONTROLTEGN = String.fromCharCode(1);

describe("K11 F1: objektnavne, som modelscriptet normaliserer", () => {
    it("halm__kedel: arket bærer navnet, listen og markeringen bruger værkets navn, og noten siger det", async () => {
        const k = omdøb(andeby(), "halmkedel", "halm__kedel");
        const e = await eksporter(k, skabelon(), NU);
        expect(e.plan.nægter).toEqual([]);
        expect(læsCeller(e.bytes).get("Anlaeg")!.get("A7")).toBe("halm__kedel");
        // Scriptet læser halm_kedel; forudsigelsen er i scriptets navne (rundturen holder den op mod scriptet) ...
        expect(e.plan.forventet.get("units.halm_kedel.var_om")).toBe("30.0");
        // ... men "ikke med i arket" og afvigelserne er i værkets: præcis som for Andeby med det oprindelige navn.
        const før = planlæg(andeby());
        expect(e.plan.ikkeMed.map((t) => t.sti)).toEqual(før.ikkeMed.map((t) => t.sti.replace("units.halmkedel.", "units.halm__kedel.")).sort());
        expect(e.plan.afvigelser.some((s) => s.includes("halm_kedel"))).toBe(false);
        expect(e.plan.noter.join(" ")).toMatch(/"halm__kedel" hedder "halm_kedel" i arket/);
        expect(læsMarkering(læsCeller(e.bytes))?.afvigelser).toEqual(e.plan.afvigelser);
    });

    it("sammenfald efter normaliseringen nægtes — også med et objekt, der ikke kommer med i arket", () => {
        const k = omdøb(andeby(), "halmkedel", "halm__kedel");
        const slukket = { ...k, blade: [...k.blade, { sti: "units.halm_kedel.enabled", vaerdi_json: "false" }, { sti: "units.halm_kedel.type", vaerdi_json: '"biomass_boiler"' }] };
        const p = planlæg(slukket);
        expect(p.nægter).toEqual([expect.stringMatching(/^Enhederne "halm_kedel" og "halm__kedel" hedder alle "halm_kedel" i modelscriptet/)]);
        expect(p.ikkeMed).toEqual([]);
    });

    it("nye navne skal være slug-faste; eksisterende navne brydes ikke", () => {
        const tom = { units: new Set<string>(), storage: new Set<string>() };
        expect(tjekNavn("halm__kedel", tom)).toMatch(/to _ i træk/);
        expect(tjekNavn("_kedel", tom)).toMatch(/starte eller slutte/);
        expect(tjekNavn("kedel_", tom)).toMatch(/starte eller slutte/);
        expect(tjekNavn("a_x0041_b", tom)).toMatch(/kodet tegn/);
        expect(tjekNavn("halm_kedel", { units: new Set(["halm__kedel"]), storage: new Set() })).toMatch(/samme som halm__kedel/);
        expect(tjekNavn("halm_kedel", { units: new Set(), storage: new Set(["_halm_kedel_"]) })).toMatch(/samme som _halm_kedel_/);
        // Et eksisterende navn, der ikke er slug-fast, spærrer ikke andre navne.
        expect(tjekNavn("halm_kedel_2", { units: new Set(["halm__kedel"]), storage: new Set() })).toBeNull();
        expect(tjekNavn("vp_ny", tom)).toBeNull();
    });
});

describe("K11 F4: markeringen binder arket til værkets grundlag", () => {
    it("grundlaget er samme tekst og hash som fjv.revision.grundlag (vektor delt med test_revision.py)", async () => {
        const blade = [
            { sti: "units.b.p_max_heat", vaerdi_json: "1.0" },
            { sti: "prices.straw.unit", vaerdi_json: '"DKK/MWh_æøå"' },
            { sti: "data.dmi_area", vaerdi_json: '"karup"' },
            { sti: "units.a.cop_curve.points", vaerdi_json: '[{"t_ambient":-10.0}]' },
        ];
        const serie = { startMs: 0, oploesning: "1h" as const, værdier: [] };
        const sol = { id: "s", sha256: "ab".repeat(32), serie };
        expect(await sha256Bytes(grundlagstekst({ blade, solprofil: sol, varmelast: null })))
            .toBe("460fcaa85e634f44ccde1ef2699626f0f7d41f26e7b407e66783e64fc8338c24");
        expect(await sha256Bytes(grundlagstekst({ blade, solprofil: sol, varmelast: { id: "v", sha256: "cd".repeat(32), serie } })))
            .toBe("e5467d410bed30a40d8e36651175aae2658ae6bd65e0fb17d652a6ab1d3dfa03");
    });

    it("format 2: grundlag og erklærede afvigelser; en anden aktiv serie giver et andet grundlag", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const m = læsMarkering(læsCeller(e.bytes))!;
        expect(MARKOER_FORMAT).toBe("fjv-vaerksark-eksport/2");
        expect(m).toMatchObject({ format: MARKOER_FORMAT, vaerk_id: ANDEBY_ID, grundlag: await sha256Bytes(grundlagstekst(andeby())) });
        expect(m.afvigelser).toEqual(e.plan.afvigelser);
        expect(m.afvigelser).toContain("units.fliskedel.enabled");
        expect(m.afvigelser.filter(erArtefakt)).toEqual([]);
        const k2 = andeby();
        const e2 = await eksporter({ ...k2, solprofil: { ...k2.solprofil!, sha256: "ef".repeat(32) } }, skabelon(), NU);
        expect(e2.markering.grundlag).not.toBe(e.markering.grundlag);
        expect(e2.markering.sha256).not.toBe(e.markering.sha256);
    });

    it("et ark fra før K11 (format 1) genkendes ikke som revision", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark(MARKOER_ARK).sæt("B1", "fjv-vaerksark-eksport/1");
        expect(læsMarkering(læsCeller(wb.bytes()))).toBeNull();
        expect(await analyserUpload(wb.bytes(), VAERKER, hent())).toEqual({ art: "nyt" });
    });
});

describe("K11 F5: felter, som genupload ikke gemmer, siges før bekræftelse", () => {
    it("kun årsproduktionen (Timedata!B3) ændret: ingen revision tilbydes, og grunden står der", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark("Timedata").sæt("B3", 120);
        const a = await analyserUpload(wb.bytes(), VAERKER, hent());
        expect(a).toEqual({ art: "ingen_aendringer", vaerk: VAERKER[0], ikkeGemt: [
            { hvor: "Timedata", felt: "Timedata: årsproduktion (GWh)", før: "100", nu: "120", gemmesIkke: GEMMES_IKKE.aarsproduktion },
        ] });
    });

    it("årsproduktion og en D&V-rettelse: revision med D&V; årsproduktionen står under 'gemmes ikke'", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark("Timedata").sæt("B3", 120);
        wb.regneark("Anlaeg").sæt("H7", 32.5);
        wb.regneark("Priser").sæt("B30", "Andeby Nord");
        const a = await analyserUpload(wb.bytes(), VAERKER, hent());
        expect(a.art).toBe("revision");
        if (a.art !== "revision") return;
        expect(a.forskel.gemmes).toBe(1);
        expect(a.forskel.felter.filter((x) => !x.gemmesIkke).map((x) => x.hvor)).toEqual(["Enhed halmkedel"]);
        expect(a.forskel.felter.filter((x) => x.gemmesIkke).map((x) => x.gemmesIkke)).toEqual([GEMMES_IKKE.navn, GEMMES_IKKE.aarsproduktion]);
    });
});

describe("K11 F6: huller i en serie analyseres før download", () => {
    it("et hul inde i solprofilen: scriptets lineære udfyldning oplyses præcist (Codex målte 3,005183 MW)", () => {
        let idx = -1, y0 = 0, y1 = 0;
        const k = medSol((v) => {
            idx = v.findIndex((n, j) => j > 7000 && n !== null && n > 1);
            [y0, y1] = [v[idx - 1] as number, v[idx + 1] as number];
            v[idx] = null;
        });
        const ms = k.solprofil!.serie.startMs + idx * H;
        expect(new Date(ms).toISOString()).toBe("2025-10-24T10:00:00.000Z");
        const p = planlæg(k);
        expect(p.nægter).toEqual([]);
        // numpy.interp: slope * (x - x0) + y0 med slope = (y1 - y0) / 2.
        expect(p.udfyldes).toEqual([{ rolle: "solprofil", ms, v: (y1 - y0) / 2 * 1 + y0, hvordan: "interpolation" }]);
        expect(p.noter.join(" ")).toContain("24/10/2025 10:00 UTC → 3,005183 MW");
        expect(p.afrundes).toEqual([]);                         // Andebys gemte værdier har 6 decimaler
        // Scriptets note om profilen regnes på den udfyldte serie.
        expect(p.forventet.get("units.solvarme.notes")).toBe(planlæg(andeby()).forventet.get("units.solvarme.notes"));
    });

    it("tomme nattetimer i enden sættes til 0; tomme dagtimer i enden og over 5 % huller nægtes", () => {
        const sidst = (k: Eksportkilde) => (PERIODE_START + 8759 * H - k.solprofil!.serie.startMs) / H;
        const nat = medSol((v) => { const j = sidst(andeby()); v[j] = null; v[j - 1] = null; });
        expect(solenErNede(Date.UTC(2026, 5, 30, 22)) && solenErNede(Date.UTC(2026, 5, 30, 23))).toBe(true);
        const pn = planlæg(nat);
        expect(pn.nægter).toEqual([]);
        expect(pn.udfyldes.map((u) => [new Date(u.ms).toISOString(), u.v, u.hvordan]))
            .toEqual([["2026-06-30T22:00:00.000Z", 0, "nat"], ["2026-06-30T23:00:00.000Z", 0, "nat"]]);
        expect(pn.noter.join(" ")).toMatch(/2 timer i enden af kørselsvinduet .* sætter dem til 0 MW/);
        const dag = medSol((v) => { const j = sidst(andeby()); for (let x = 0; x < 12; x++) v[j - x] = null; });
        expect(planlæg(dag).nægter.join(" ")).toMatch(/nogle af dem er dagtimer/);
        const mange = medSol((v) => { for (let x = 7000; x < 7500; x++) v[x] = null; });
        expect(planlæg(mange).nægter.join(" ")).toMatch(/højst 5 %/);
    });

    it("en gemt værdi med flere end 6 decimaler: scriptets afrunding oplyses (antal timer og største afrunding)", () => {
        const k = medSol((v) => { const j = v.findIndex((n, x) => x > 7000 && n !== null && n > 1); v[j] = (v[j] as number) + 0.0000004; });
        const p = planlæg(k);
        expect(p.afrundes).toEqual([{ rolle: "solprofil", n: 1, maks: expect.closeTo(4e-7, 9) }]);
        expect(p.noter.join(" ")).toMatch(/6 decimaler: 1 time afrundes/);
    });

    it("huller i varmelasten oplyses: arket bærer dem som tomme timer, scriptet udfylder dem ikke", () => {
        const værdier: (number | null)[] = new Array(8760).fill(12.5);
        værdier[1000] = null;
        const k: Eksportkilde = { ...andeby(), varmelast: { id: "vl", sha256: null, serie: { startMs: PERIODE_START, oploesning: "1h", værdier } } };
        const p = planlæg(k);
        expect(p.nægter).toEqual([]);
        expect(p.serier.find((s) => s.rolle === "varmelast")).toMatchObject({ med: 8759 });
        expect(p.noter.join(" ")).toMatch(/Varmelasten har 1 tom time i perioden \(11\/08\/2025 16:00 UTC\)/);
        expect(p.celler.find((c) => c.ark === "Timedata" && c.ref === `B${6 + 1000}`)?.v).toBeNull();
        expect(p.udfyldes).toEqual([]);
    });
});

describe("K11 F7: tegn, et regneark ikke kan bære", () => {
    it("et kontroltegn i værkets navn nægtes som feltfejl", async () => {
        const k = andeby();
        k.vaerk.navn = `Syntetisk${KONTROLTEGN}varme`;
        expect(planlæg(k).nægter.join(" ")).toMatch(/Priser!B30 .* tegnet U\+0001/);
        await expect(eksporter(k, skabelon(), NU)).rejects.toThrow(/kan ikke eksporteres/);
    });
    it("en bogstavelig _xHHHH_-sekvens nægtes (Excel læser den som et tegn, modelscriptet bogstaveligt)", () => {
        const k = omdøb(andeby(), "halmkedel", "halm_x0041_kedel");
        expect(planlæg(k).nægter.join(" ")).toMatch(/Anlaeg!A7 .* "_x0041_"/);
    });
    it("xlsx-skriveren bygger aldrig en fil, der ikke er gyldig XML", () => {
        expect(() => new Arbejdsbog(skabelon()).regneark("Priser").sæt("B30", `a${KONTROLTEGN}b`)).toThrow(/XML 1\.0/);
    });
});
