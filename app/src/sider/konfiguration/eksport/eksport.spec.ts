// Runde 12: eksporten af et værk til modelrepoets værksark og genkendelsen ved genupload. Modelscriptet selv
// (scripts/vaerksark_til_yaml.py) køres af rundturs-beviset i gaten (viden/vaerktoej/tjek_eksport_rundtur.py); her
// prøves appens side: skabelonen bevares, markeringen, hashen, Python-tallene og de fem tilfælde ved upload.
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { analyserUpload, type Hentere } from "./analyse";
import { eksporter, indholdstekst, læsMarkering, MARKOER_ARK } from "./eksporter";
import { genkend, læsArkmodel, sammenlign } from "./genkend";
import { planlæg, slug } from "./kort";
import { fladPy, f, i, pyFloatTekst, pyJson } from "./pyjson";
import { andeby, ANDEBY_ID, skabelon } from "./testdata";
import { Arbejdsbog, excelSerie, fraExcelSerie, læsCeller } from "./xlsx";

const NU = new Date(Date.UTC(2026, 9, 28, 12));
const filer = (b: Uint8Array) => unzipSync(b);

describe("Python-tal og modelscriptets slug", () => {
    it("repr(float) som Python: altid med decimal, eksponent under 1e-4 og fra 1e16", () => {
        expect([12, 0.0005, 0.035, 1e-5, 1.5e-5, 1e16, -3.5, 129.8, 1234567].map(pyFloatTekst))
            .toEqual(["12.0", "0.0005", "0.035", "1e-05", "1.5e-05", "1e+16", "-3.5", "129.8", "1234567.0"]);
        expect(pyJson({ a: [i(10), f(1)], b: null, c: true, d: "æ" })).toBe('{"a":[10,1.0],"b":null,"c":true,"d":"æ"}');
        expect(fladPy({ x: { y: f(1), z: {} }, l: [f(2)] })).toEqual(new Map([["x.y", "1.0"], ["x.z", "{}"], ["l", "[2.0]"]]));
    });
    it("slug: æøå, accenter og andet end a-z0-9 som scriptet", () => {
        expect(slug("Andeby — fiktivt referenceværk")).toBe("andeby_fiktivt_referencevaerk");
        // Scriptet erstatter kun SMÅ æøå; et stort Æ falder bort i .encode("ascii", "ignore") (målt mod scriptet).
        expect(slug("Ærø Fjernvarme A/S")).toBe("roe_fjernvarme_a_s");
        // NFKD før erstatningen: å er da a + kombinerende ring -> "a"; et stort Ø falder bort.
        expect(slug("Tårs Halmværk")).toBe("tars_halmvaerk");
        expect(slug("Brønderslev Østerby")).toBe("broenderslev_sterby");
        expect(slug("vp_luft_vand")).toBe("vp_luft_vand");
        expect(slug("__Café__")).toBe("cafe");
    });
    it("Excel-datoer frem og tilbage til samme time", () => {
        for (const ms of [Date.UTC(2025, 6, 1, 0), Date.UTC(2025, 9, 26, 1), Date.UTC(2026, 5, 30, 23)]) expect(fraExcelSerie(excelSerie(ms))).toBe(ms);
    });
});

describe("eksporten af Andeby", () => {
    it("udfylder modelrepoets skabelon og bevarer resten byte for byte", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const før = filer(skabelon()), efter = filer(e.bytes);
        // Det, eksporten ikke skriver i, er skabelonens egne bytes: vejledning, styles, delte strenge, tema.
        for (const f_ of ["xl/worksheets/sheet1.xml", "xl/styles.xml", "xl/sharedStrings.xml", "xl/theme/theme1.xml", "docProps/core.xml"]) {
            expect(strFromU8(efter[f_]), f_).toBe(strFromU8(før[f_]));
        }
        // Dropdowns (datavalidering) i Anlaeg og Priser står der stadig.
        const anlaeg = strFromU8(efter["xl/worksheets/sheet3.xml"]), priser = strFromU8(efter["xl/worksheets/sheet5.xml"]);
        expect(anlaeg).toContain('sqref="B5:B23"');
        expect(anlaeg).toContain('sqref="L5:L23"');
        expect(priser).toContain('sqref="B28"');
        // Den skjulte markering og arket Solvarme (Andeby har en aktiv solprofil).
        const wb = strFromU8(efter["xl/workbook.xml"]);
        expect(wb).toMatch(/<sheet name="_app" sheetId="\d+" state="hidden"/);
        expect(wb).toMatch(/<sheet name="Solvarme" sheetId="\d+" state="visible"/);
        expect(e.filnavn).toBe("andeby_rev1.xlsx");
    });

    it("skriver værdier, ikke formler, i Anlaeg og Priser — og de værdier, værket har", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const c = læsCeller(e.bytes);
        const an = c.get("Anlaeg")!, pr = c.get("Priser")!;
        expect(strFromU8(filer(e.bytes)["xl/worksheets/sheet3.xml"])).not.toMatch(/<f[ >]/);
        expect(an.get("A5")).toBe("vp_luft_vand");
        expect(an.get("N4")).toBe("brændsel");                 // biomassekedel: brændslet står i kolonne N
        expect([...an.entries()].filter(([k, v]) => /^A(5|6|7|8|9|1\d|2[0-3])$/.test(k) && typeof v === "string").map(([, v]) => v))
            .toEqual(["vp_luft_vand", "elkedel_ny", "halmkedel", "gasmotor", "gaskedel_agg", "solvarme"]);   // slåede-fra enheder er ikke med
        expect(pr.get("B6")).toBe(606);
        expect(pr.get("B30")).toBe("Andeby — fiktivt referenceværk");
        expect(c.get("Timedata")!.get("B3")).toBe(100);         // Andebys kalibrering × 1,0
        expect(c.get("Solvarme")!.get("A5")).toBe("tidsstempel");
    });

    it("markeringen bærer værk, revision og sha256 af indholdet; samme værk giver samme hash", async () => {
        const a = await eksporter(andeby(), skabelon(), NU);
        const b = await eksporter(andeby(), skabelon(), new Date(Date.UTC(2027, 0, 1)));
        const m = læsMarkering(læsCeller(a.bytes))!;
        expect(m).toMatchObject({ vaerk_id: ANDEBY_ID, vaerk_kode: "andeby", revision: 1, sha256: a.markering.sha256 });
        expect(b.markering.sha256).toBe(a.markering.sha256);
        expect(indholdstekst(b.plan, b.markering.grundlag)).toBe(indholdstekst(a.plan, a.markering.grundlag));
        const c = await eksporter(andeby(1, { "units.halmkedel.var_om": "31.0" }), skabelon(), NU);
        expect(c.markering.sha256).not.toBe(a.markering.sha256);
    });

    it("listen 'ikke med i arket' siger tabet højt: slåede-fra enheder, balancemarkedet, scriptets egne værdier", () => {
        const p = planlæg(andeby());
        expect(p.nægter).toEqual([]);
        const stier = p.ikkeMed.map((t) => t.sti);
        expect(stier).toContain("units.fliskedel.enabled");
        expect(stier).toContain("balancing.method");
        expect(stier).toContain("units.gasmotor.uc_enabled");
        expect(p.ikkeMed.find((t) => t.sti === "units.fliskedel.p_max_heat")?.grund).toMatch(/slået fra/);
        // Det, der går tabsfrit igennem, står IKKE på listen.
        expect(stier).not.toContain("units.halmkedel.var_om");
        expect(stier).not.toContain("prices.straw.value");
        expect(stier).not.toContain("units.vp_luft_vand.cop_curve.points");
        expect(p.serier).toEqual([expect.objectContaining({ rolle: "solprofil", med: 8760, udenfor: 6624 })]);
    });

    it("eksporten nægter, hvad modelscriptet ville afvise (fx ingen tank)", async () => {
        const k = andeby();
        const uden = { ...k, blade: k.blade.filter((b) => !b.sti.startsWith("storage.")) };
        expect(planlæg(uden).nægter.join(" ")).toMatch(/akkumuleringstank/);
        await expect(eksporter(uden, skabelon(), NU)).rejects.toThrow(/kan ikke eksporteres/);
    });

    it("træpiller får sin egen række i prisblokken (rækkerne under og deres dropdowns flyttes én ned)", async () => {
        const k = andeby();
        const e = await eksporter({ ...k, blade: [...k.blade, { sti: "prices.wood_pellets.value", vaerdi_json: "250.0" }, { sti: "prices.wood_pellets.unit", vaerdi_json: '"DKK/MWh_fuel"' }] }, skabelon(), NU);
        const pr = læsCeller(e.bytes).get("Priser")!;
        expect([pr.get("A11"), pr.get("B11")]).toEqual(["træpiller", 250]);
        expect(pr.has("A12")).toBe(false);                         // blokken slutter stadig ved en tom række
        expect(pr.get("A13")).toBe("Elafgift og faste tarifled");
        expect(pr.get("B29")).toBe("karup");
        expect(strFromU8(filer(e.bytes)["xl/worksheets/sheet5.xml"])).toContain('sqref="B29"');
    });
});

describe("genupload: genkendelse og diff", () => {
    const vaerker = [{ id: ANDEBY_ID, kode: "andeby", navn: "Andeby — fiktivt referenceværk", revision: 1 }];
    const hent = (rev = 1, ret: Record<string, string> = {}): Hentere => ({ kilde: async () => andeby(rev, ret), skabelon: async () => skabelon() });

    it("uden markering: et nyt værk som før", async () => {
        expect(await analyserUpload(skabelon(), vaerker, hent())).toEqual({ art: "nyt" });
    });
    it("markering, men værket findes ikke her: nyt værk, og det siges", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const a = await analyserUpload(e.bytes, [], hent());
        expect(a).toMatchObject({ art: "nyt", grund: expect.stringMatching(/ikke findes her/) });
    });
    it("værket er ændret siden eksporten: konflikt, intet sendes", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const a = await analyserUpload(e.bytes, [{ ...vaerker[0], revision: 2 }], hent(2));
        expect(a).toMatchObject({ art: "konflikt", arkRevision: 1 });
    });
    it("ingen ændringer i arket: intet at gemme", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        expect(await analyserUpload(e.bytes, vaerker, hent())).toMatchObject({ art: "ingen_aendringer" });
    });
    it("en ny eksport af revisionen er en anden (fx en anden aktiv tidsserie): eksportér igen", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        expect(await analyserUpload(e.bytes, vaerker, hent(1, { "units.halmkedel.var_om": "31.0" }))).toMatchObject({ art: "anden_eksport" });
    });
    it("én ændret celle: diff med appens etiket og basis til importen", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark("Anlaeg").sæt("H7", 32.5);                     // halmkedlens D&V
        wb.regneark("Solvarme").sæt("B4000", 7.25);                 // én solvarmetime
        const a = await analyserUpload(wb.bytes(), vaerker, hent());
        expect(a.art).toBe("revision");
        if (a.art !== "revision") return;
        expect(a.forskel.felter).toEqual([{ hvor: "Enhed halmkedel", felt: expect.stringMatching(/D&V|drift/i), før: "30", nu: "32,5" }]);
        expect(a.forskel.serier).toEqual([expect.objectContaining({ rolle: "solprofil", ændret: 1, tilføjet: 0, fjernet: 0 })]);
        expect(læsMarkering(læsCeller(a.basis))?.sha256).toBe(e.markering.sha256);
    });
    it("en flyttet enhedsrække er ikke en ændring (arket læses på navnene, som scriptet)", () => {
        const basis = genkend(new Arbejdsbog(skabelon()).bytes()).model;
        const ark = læsArkmodel(læsCeller(new Arbejdsbog(skabelon()).bytes()));
        expect(sammenlign(basis, ark).tom).toBe(true);
    });
    it("et regneark, der gemmer 15 cifre, er ikke en ændring (4.6000000000000005 -> 4.600000000000001)", () => {
        const m = (v: number) => ({ ...læsArkmodel(new Map()), timedata: new Map([[0, v]]), poster: new Map<string, number | string>([["halm", v]]) });
        expect(sammenlign(m(4.6000000000000005), m(4.600000000000001)).tom).toBe(true);
        const f = sammenlign(m(4.6000000000000005), m(4.61));
        expect([f.felter.length, f.serier[0]?.ændret]).toEqual([1, 1]);
    });
    it("markeringen afvises, hvis den er forkert udfyldt", async () => {
        const e = await eksporter(andeby(), skabelon(), NU);
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark(MARKOER_ARK).sæt("B5", "ikke en hash");
        expect(læsMarkering(læsCeller(wb.bytes()))).toBeNull();
    });
});
