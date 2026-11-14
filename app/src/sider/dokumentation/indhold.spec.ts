// Regler for de bundtede tekster: de må ikke være ældre end deres kilde (I4), og vores egen vejledning i notebooken
// skal stemme med notebookens faktiske parametre (I3). Kildefilerne findes kun i produktmappen — uden dem springes testen
// over (fx efter flytning til ADO), og de rene regler om teksten gælder stadig.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const her = dirname(fileURLToPath(import.meta.url));
const produkt = resolve(her, "..", "..", "..", ".."); // repoets rod
const viden = join(produkt, "viden");
const params = join(produkt, "fabric", "celler", "fjv_koer_scenarie", "params.py");
const indhold = join(her, "indhold");
const læs = (...d: string[]) => readFileSync(join(...d), "utf8");

describe.skipIf(!existsSync(viden))("I4: de bundtede kopier af viden/ er ikke forældede", () => {
    const par: [string, string][] = [
        ["METODE.md", "METODE.md"],
        ["app_tekster/saadan_bruger_du_appen.md", "saadan_bruger_du_appen.md"],
        ["app_tekster/begraensninger.md", "begraensninger.md"],
        ["app_tekster/forside.md", "forside.md"],
        ["app_tekster/ordliste.md", "ordliste.md"],
        ["referencetal.json", "referencetal.json"],
        ...(existsSync(join(viden, "app_tekster", "information"))
            ? readdirSync(join(viden, "app_tekster", "information")).filter((f) => f.endsWith(".md")).map((f): [string, string] => [`app_tekster/information/${f}`, `information/${f}`])
            : []),
    ];
    it.each(par)("%s er ens med kopien (kør _byg/kopier-indhold.mjs, hvis ikke)", (kilde, kopi) => {
        expect(læs(indhold, "viden", kopi)).toBe(læs(viden, kilde));
    });
    it("hvert emne i viden/information har sin kopi, og kopierne har ingen overskydende filer", () => {
        const kilder = readdirSync(join(viden, "app_tekster", "information")).filter((f) => f.endsWith(".md")).sort();
        const kopier = readdirSync(join(indhold, "viden", "information")).filter((f) => f.endsWith(".md")).sort();
        expect(kopier).toEqual(kilder);
    });
});

describe("I3: Kør i en notebook", () => {
    const doc = læs(indhold, "egne", "kor_i_notebook.md");
    const tabel = doc.slice(doc.indexOf("| Parameter"), doc.indexOf("(Kilde: fabric/celler"));
    const iDoc = [...tabel.matchAll(/^\| `([a-z_]+)`(?:, `([a-z_]+)`)*/gm)].flatMap((m) => [...m[0].matchAll(/`([a-z_]+)`/g)].map((x) => x[1]));

    it("nævner varmelast og flag som parametre (de er ikke forbeholdt appen) og at Billund Spor B kræver heat_csv", () => {
        expect(iDoc).toContain("heat_csv");
        expect(iDoc).toContain("ekstra_flag");
        expect(doc).toMatch(/Billund Spor B og Billund rullende år .* kræver|kan kun genskabes, hvis `heat_csv`/s);
        expect(doc).toContain("billund_abvaerk_hourly_splejset_jun2026.csv");
    });
    it("siger 'i kø', ikke 'startet' — §6c bruger ikke status startet som reservation", () => {
        expect(doc).not.toMatch(/\bstartet\b/);
        expect(doc).toMatch(/koersel_id` \| Kør netop den kørsel \(skal stå som \*i kø\*\)/);
    });
    it("nævner ikke hvidlistede flag, der ikke findes: kun --legacy-nettab", () => {
        expect(doc).toMatch(/Kun `--legacy-nettab` er tilladt/);
    });
    it.skipIf(!existsSync(params))("parametrene i vejledningen er præcis notebookens (undtagen testparameteren)", () => {
        const faktiske = [...læs(params).matchAll(/^([a-z_]+)\s*=/gm)].map((m) => m[1]).filter((n) => n !== "test_doed_efter_s");
        expect([...new Set(iDoc)].sort()).toEqual([...new Set(faktiske)].sort());
    });
});

// Runde 5 (KONTRAKT §6d): upload af tidsserier og værksark skal kunne læses i begge vejledninger.
describe("§6d: tidsserier og værksark i vejledningerne", () => {
    const notebook = læs(indhold, "egne", "kor_i_notebook.md");
    const bruger = læs(indhold, "viden", "saadan_bruger_du_appen.md");

    it("Kør i en notebook: tidsserierne hører til værket, frosne med kontrolsum, værksark-notebooken bruger ikke solver-låsen", () => {
        expect(notebook).toMatch(/Files\/fjv\/tidsserier\/<værkskode>\/<sha256>\.csv/);
        expect(notebook).toMatch(/verificerer kontrolsummen/);
        expect(notebook).toContain("fjv_importer_vaerksark");
        expect(notebook).toMatch(/ikke\s+solver-låsen/);
        expect(notebook).toMatch(/Markeds- og vejrdata[\s\S]{0,80}uploades aldrig/);
    });
    it("Sådan bruger du appen: fanen Tidsserier, værksark under Nyt værk, varmelast-valget og 'Data i denne kørsel'", () => {
        expect(bruger).toMatch(/fanen \*\*Tidsserier\*\*/);
        expect(bruger).toMatch(/vaerksdata_skabelon\.xlsx/);
        expect(bruger).toMatch(/\*\*Varmelast\.\*\* Scenariet vælger/);
        expect(bruger).toMatch(/\*\*Data i denne kørsel\.\*\*/);
        expect(bruger).toMatch(/Hvilke data skal med\?/);
    });
});

// Runde 13 (KONTRAKT §6e): arkivet — backup og flytning — skal kunne læses i brugervejledningen.
describe("§6e: backup og flytning i vejledningen", () => {
    const bruger = læs(indhold, "viden", "saadan_bruger_du_appen.md");
    it("eksport, Læs mig, kontrolsum, forhåndsvisning, historisk kørsel og værksarket først", () => {
        expect(bruger).toMatch(/## 7\. Backup og flytning/);
        expect(bruger).toMatch(/\*\*Eksportér arkiv\*\*/);
        expect(bruger).toMatch(/\*\*Importér arkiv\*\* viser først/);
        expect(bruger).toMatch(/importeret fra arkiv/);
        expect(bruger).toMatch(/Upload værksarket først/);
    });
});
