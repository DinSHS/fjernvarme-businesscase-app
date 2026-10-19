// @vitest-environment node
//-----------------------------------------------------------------------
// opret_vaerk (brief 15 B): backendens læsning og samling af et nyt værk,
// og transaktionsreglerne i function_app.ts.
//-----------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { læsAnmodning, samlNytVaerk, type Blad, type OpretVaerkDel } from "../src/logik";

const U = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
// Et modelgyldigt værk (Codex K4's "default" = skabelonen, som load_case accepterede) — basis for de samlinger,
// der skal lykkes; de strukturelle afvisninger nedenfor sker før modelkravene.
const K4 = JSON.parse(readFileSync(new URL("./vektorer/k4_guide_vaerker.json", import.meta.url), "utf8")) as { vaerker: Record<string, { sti: string; vaerdi_json: string }[]> };
const BASIS: Blad[] = K4.vaerker.default.map((b) => ({ sti: b.sti, ny_json: b.vaerdi_json }));
const enhed: Blad = BASIS.find((b) => b.sti === "units.gaskedel.type")!;
const resten = BASIS.filter((b) => b !== enhed);
const del = (nr: number, af: number, blade: Blad[], udkast = U): OpretVaerkDel => ({ handling: "opret_vaerk_del", udkast, nr, af, blade });

describe("læsAnmodning — opret_vaerk og dele", () => {
    it("læser den afsluttende oprettelse og en del", () => {
        expect(læsAnmodning(JSON.stringify([{ handling: "opret_vaerk", udkast: U.toUpperCase(), dele: 3, ny_kode: "nyt_1", navn: " Nyt " }]))).toEqual({
            type: "opret", opret: { handling: "opret_vaerk", udkast: U, dele: 3, ny_kode: "nyt_1", navn: "Nyt", beskrivelse: null },
        });
        expect(læsAnmodning(JSON.stringify([del(2, 3, [enhed])])).type).toBe("opret_del");
    });
    it.each([
        ["udkast der ikke er et uuid", [{ handling: "opret_vaerk", udkast: "%", dele: 1, ny_kode: "a", navn: "A" }], /uuid/],
        ["0 dele", [{ handling: "opret_vaerk", udkast: U, dele: 0, ny_kode: "a", navn: "A" }], /mellem 1 og 50/],
        ["51 dele", [{ handling: "opret_vaerk", udkast: U, dele: 51, ny_kode: "a", navn: "A" }], /mellem 1 og 50/],
        ["kode med bindestreg", [{ handling: "opret_vaerk", udkast: U, dele: 1, ny_kode: "a-b", navn: "A" }], /små bogstaver/],
        ["del nr. over antal", [{ handling: "opret_vaerk_del", udkast: U, nr: 3, af: 2, blade: [enhed] }], /mellem 1 og 2/],
        ["del uden blade", [{ handling: "opret_vaerk_del", udkast: U, nr: 1, af: 1, blade: [] }], /ingen blade/],
        ["oprettelse sammen med andet", [{ handling: "opret_vaerk", udkast: U, dele: 1, ny_kode: "a", navn: "A" }, { sti: "x", handling: "slet" }], /eneste handling/],
    ])("afviser %s", (_n, v, tekst) => expect(() => læsAnmodning(JSON.stringify(v))).toThrow(tekst));
});

describe("samlNytVaerk", () => {
    it("samler dele i nummerorden uanset fundrækkefølge og nummererer bladene", () => {
        const [a, b, ...c] = resten;
        const s = samlNytVaerk([del(2, 2, c), del(1, 2, [enhed, { ...a, bekraeft: true, kommentar: "skøn" }, b])], 2, U);
        expect(s.slice(0, 3).map((x) => [x.sti, x.raekkefoelge, x.bekraeft, x.kommentar])).toEqual([
            [enhed.sti, 1, false, null], [a.sti, 2, true, "skøn"], [b.sti, 3, false, null],
        ]);
        expect(s).toHaveLength(BASIS.length);
    });
    it.each([
        ["en manglende del", [del(1, 3, [enhed]), del(3, 3, [{ sti: "a.b", ny_json: "1" }])], 3, /Del 2 af 3 mangler/],
        ["en del to gange", [del(1, 2, [enhed]), del(1, 2, [{ sti: "a.b", ny_json: "1" }])], 2, /to gange/],
        ["en del med andet antal", [del(1, 2, [enhed]), del(2, 3, [{ sti: "a.b", ny_json: "1" }])], 2, /siger 3 dele/],
        ["en del fra et andet udkast", [del(1, 1, [enhed], "ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee")], 1, /andet udkast/],
        ["samme sti i to dele", [del(1, 2, [enhed]), del(2, 2, [enhed])], 2, /to gange/],
        ["en værdi der ikke er JSON", [del(1, 1, [enhed, { sti: "prices.gas.value", ny_json: "12,5" }])], 1, /gyldig JSON/],
        ["et blad under et andet blad", [del(1, 1, [enhed, { sti: "units.gaskedel", ny_json: "1" }])], 1, /ligger under/],
        ["et blad under et andet med en nabo imellem (a.b, a.b-x, a.b.c)", [del(1, 1, [enhed, { sti: "a.b", ny_json: "1" }, { sti: "a.b-x", ny_json: "1" }, { sti: "a.b.c", ny_json: "1" }])], 1, /"a\.b" kan ikke være en værdi/],
        ["ingen enhed", [del(1, 1, BASIS.filter((b) => !b.sti.startsWith("units.")))], 1, /mindst én aktiv enhed/],
        ["en ugyldig sti", [del(1, 1, [enhed, { sti: "a..b", ny_json: "1" }])], 1, /Ugyldig sti/],
    ])("afviser %s", (_n, dele, antal, tekst) => expect(() => samlNytVaerk(dele, antal, U)).toThrow(tekst));
});

describe("function_app.ts — opret_vaerk i kilden", () => {
    const f = readFileSync(new URL("../src/function_app.ts", import.meta.url), "utf8");
    it("en del udføres aldrig alene: den returnerer status 'ny' FØR transaktionen åbnes", () => {
        const i = f.indexOf("anmodning.type === 'opret_del'");
        expect(i).toBeGreaterThan(0);
        expect(i).toBeLessThan(f.indexOf("return await iTransaktion(pool", i));
        expect(f.slice(i, i + 300)).toMatch(/status: 'ny'/);
    });
    it("delene findes kun hos samme bruger, med status 'ny', og låses i transaktionen", () => {
        expect(f).toMatch(/WHERE anmodet_af = @af AND status = 'ny' AND aendringer_json LIKE @m/);
        expect(f).toMatch(/findDele\(req, a\.anmodet_af, o\.udkast, true\)/);
        expect(f).toMatch(/WITH \(UPDLOCK, HOLDLOCK\)' : ''/);
    });
    it("oprettelsen sker før opslaget af et kildeværk (et nyt værk har intet) og som kilde 'app', revision 1", () => {
        expect(f.indexOf("return opretVaerk(req, a, anmodning.opret)")).toBeLessThan(f.indexOf("SELECT id, kode, navn, revision, arkiveret FROM dbo.Vaerks"));
        expect(f).toMatch(/VALUES \(@ny, @k, @navn, @besk, 'app', NULL, 1, 0,/);
    });
    it("koden låses mod samtidig oprettelse, og et unik-brud bliver en læsbar afvisning", () => {
        expect(f).toMatch(/FROM dbo\.Vaerks WITH \(UPDLOCK, HOLDLOCK\) WHERE kode = @k/);
        expect(f).toMatch(/if \(erUnikBrud\(e\)\) throw new Afvisning\(`Koden/);
    });
    it("afvises oprettelsen, afvises delene også", () => {
        expect(f).toMatch(/if \(udkast\) \{\s*for \(const d of await findDele\(\(\) => pool\.request\(\), a\.anmodet_af, udkast, false\)\)/);
    });
});
