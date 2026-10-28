// @vitest-environment node
//-----------------------------------------------------------------------
// Arkivets rene logik og importforløbet (runde 13) mod en database i hukommelsen. Function'ens SQL er en tynd
// oversættelse af ArkivLager (function_app.ts); reglerne testes her, Python-porten mod de samme vektorer.
//-----------------------------------------------------------------------

import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    ArkivAfvisning, delOp, delTekst, fejlIVærdi, importAnmodningJson, importerDel, inputHashRen, kaldBytes, kanonisk, kolonnenavne, kolonner,
    læsDel, læsImportAnmodning, sha256Bytes, sha256Tekst, tabelSha, vaerkRevisioner, vaerkSha, type DelTabel, type ImportTabel, type Kanonisk,
} from "../src/arkiv";
import { inputHash } from "../src/logik";
import { eksempelDb, forventetFor, hukommelsesLager, ID, opretAnmodning, rækkerFra, tomDb, kopiDb, type Tabeller } from "./arkiv-hukommelse";

const ARKIV = "c".repeat(64);
const node = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("sha256 uden crypto-API", () => {
    it("er lig Nodes for alle længder omkring blokgrænserne og for tilfældige bytes", () => {
        for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4097]) {
            const b = randomBytes(n);
            expect(sha256Bytes(b)).toBe(node(b));
        }
        expect(sha256Tekst("æøå 😀")).toBe(createHash("sha256").update("æøå 😀", "utf8").digest("hex"));
    });
    it("inputHashRen er PRÆCIS logik.ts' inputHash (arbejderens definition)", () => {
        const r = [{ kilde: "vaerk", sti: "b", vaerdi_json: "1" }, { kilde: "aendring", sti: "b", vaerdi_json: "\"ø\"" }, { kilde: "vaerk", sti: "a", vaerdi_json: "[1,2]" }] as const;
        expect(inputHashRen(r)).toBe(inputHash(r as never));
    });
});

describe("kanonisk form", () => {
    const k = (navn: string, type: string) => ({ navn, type, nullable: true }) as never;
    it("tid er ISO i UTC med millisekunder; en streng uden zone er UTC, aldrig lokal tid", () => {
        expect(kanonisk(k("t", "datetime"), new Date(Date.UTC(2026, 9, 25, 1, 30)))).toBe("2026-10-25T01:30:00.000Z");
        expect(kanonisk(k("t", "datetime"), "2026-10-25T01:30:00")).toBe("2026-10-25T01:30:00.000Z");
        expect(kanonisk(k("t", "datetime"), "2026-10-25T03:30:00+02:00")).toBe("2026-10-25T01:30:00.000Z");
    });
    it("uuid med små bogstaver (mssql svarer med STORE), bit 0/1 som sand/falsk, -0 som 0", () => {
        expect(kanonisk(k("id", "uuid"), "AAAAAAAA-0000-4000-8000-000000000001")).toBe("aaaaaaaa-0000-4000-8000-000000000001");
        expect(kanonisk(k("b", "boolean"), 1)).toBe(true);
        expect(Object.is(kanonisk(k("x", "decimal"), -0), 0)).toBe(true);
    });
    it("kaster hellere end at gemme en værdi af forkert type", () => {
        expect(() => kanonisk(k("x", "decimal"), "abc")).toThrow(ArkivAfvisning);
        expect(() => kanonisk(k("x", "text"), 5)).toThrow(ArkivAfvisning);
    });
});

describe("validering mod skemaet", () => {
    const kol = (t: ImportTabel, n: string) => kolonner(t).find((k) => k.navn === n)!;
    it("afviser for lang tekst, ukendt sæt-værdi, ugyldig JSON og tid uden millisekunder", () => {
        expect(fejlIVærdi(kol("Koersel", "status"), "faerdig")).toBeNull();
        expect(fejlIVærdi(kol("Koersel", "status"), "FAERDIG")).toMatch(/ukendt værdi/);
        expect(fejlIVærdi(kol("Scenarie", "navn"), "x".repeat(201))).toMatch(/for lang/);
        expect(fejlIVærdi(kol("KoerselTime", "vaerdier_json"), "{NaN}")).toMatch(/JSON/);
        expect(fejlIVærdi(kol("KoerselTime", "tid"), "2026-01-01T00:00:00Z")).toMatch(/UTC/);
        expect(fejlIVærdi(kol("Koersel", "forsoeg"), 1.5)).toMatch(/heltal/);
        expect(fejlIVærdi(kol("Scenarie", "navn"), " ")).toMatch(/for kort/);
    });
});

describe("tabellens sha256", () => {
    it("afhænger ikke af rækkefølgen, men af hver værdi", () => {
        const r: Kanonisk[][] = [["b", 1, null], ["a", 2.5, "x"]];
        expect(tabelSha(r)).toBe(tabelSha([...r].reverse()));
        expect(tabelSha([["b", 1, null], ["a", 2.5000001, "x"]])).not.toBe(tabelSha(r));
    });
});

describe("værkets revisioner rekonstrueret fra Aendringslog", () => {
    it("finder revision 2 for parametrene, kørslen er frosset med — også efter at værket er ændret igen", () => {
        const db = eksempelDb();
        const blade = [...db.VaerkParameter.values()].map((r) => ({ sti: String(r.sti), vaerdi_json: String(r.vaerdi_json) }));
        const rev = vaerkRevisioner(3, blade, [...db.Aendringslog.values()] as never);
        const kørsel = vaerkSha([{ sti: "prices.straw.value", vaerdi_json: "250.0" }, { sti: "units.halmkedel.p_max", vaerdi_json: "4.0" }, { sti: "storage.tank.enabled", vaerdi_json: "true" }]);
        expect(rev.get(kørsel)).toEqual([2]);
        expect([...rev.values()].flat().sort()).toEqual([1, 2, 3]);
    });
});

describe("anmodning og del", () => {
    it("læser en gyldig anmodning og afviser en Koersel-del uden kørsler", () => {
        const j = importAnmodningJson({ arkiv: ARKIV, sha256: ARKIV, tabel: "KoerselTime", nr: 1, af: 2, koersel_ider: [], filnavn: "x.xlsx" });
        expect(læsImportAnmodning(j).tabel).toBe("KoerselTime");
        expect(() => læsImportAnmodning(j.replace("KoerselTime", "Koersel"))).toThrow(/koersel_ider/);
        expect(() => læsImportAnmodning(j.replace("KoerselTime", "Vaerk"))).toThrow(/Ukendt tabel/);
    });
    it("afviser en del med andre kolonner end skemaets", () => {
        const t = delTekst({ arkiv: ARKIV, tabel: "Scenarie", raekker: rækkerFra(eksempelDb(), "Scenarie"), aendringer: rækkerFra(eksempelDb(), "ScenarieAendring") });
        expect(læsDel(t).raekker).toHaveLength(2);
        expect(() => læsDel(t.replace('"navn"', '"Navn"'))).toThrow(/kolonnerne passer ikke/);
    });
    it("delOp holder hele kaldet under grænsen i UTF-8-bytes og deler aldrig en række", () => {
        const r = rækkerFra(eksempelDb(), "KoerselTime");
        const dele = delOp(r, "KoerselTime", 70_000);
        expect(dele.length).toBeGreaterThan(1);
        expect(dele.flatMap((d) => d.raekker)).toEqual(r);
        for (const d of dele) expect(kaldBytes(delTekst({ arkiv: ARKIV, tabel: "KoerselTime", raekker: d.raekker }))).toBeLessThanOrEqual(70_000);
    });
    it("K10-F7: dansk tekst og escape-tung JSON — grænsen gælder kaldets bytes, ikke tegn", () => {
        const base = rækkerFra(eksempelDb(1), "KoerselTime")[0];
        const ks = kolonnenavne("KoerselTime");
        const rækker = Array.from({ length: 700 }, (_, i) => {
            const r = [...base];
            r[0] = `aaaaaaaa-4444-4444-8444-${i.toString(16).padStart(12, "0")}`;
            r[ks.indexOf("tid")] = new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString();
            r[ks.indexOf("vaerdier_json")] = JSON.stringify({ notat: i % 2 ? "æ".repeat(3980) : '"'.repeat(1990) });
            return r;
        });
        const dele = delOp(rækker, "KoerselTime");
        expect(dele.length).toBeGreaterThan(1);
        for (const d of dele) expect(kaldBytes(delTekst({ arkiv: ARKIV, tabel: "KoerselTime", raekker: d.raekker }))).toBeLessThanOrEqual(3_000_000);
    });
    it("K10-F1: scenariets ændringer kan ikke sendes alene, og en Scenarie-del holder dem samlet", () => {
        const j = importAnmodningJson({ arkiv: ARKIV, sha256: ARKIV, tabel: "Bestilling", nr: 1, af: 1, koersel_ider: [], filnavn: "" });
        expect(() => læsImportAnmodning(j.replace("Bestilling", "ScenarieAendring"))).toThrow(/sammen med scenariet/);
        const db = eksempelDb();
        const dele = delOp(rækkerFra(db, "Scenarie"), "Scenarie", 3_000_000, rækkerFra(db, "ScenarieAendring"));
        expect(dele).toHaveLength(1);
        expect(dele[0].aendringer).toHaveLength(2);
    });
});

// ------------------------------------------------------------------ forløbet

/** Kilde-db'ens rækker sendt som klienten gør: scenarier med ændringer, bestilling, kørslens rækker, kørslen sidst. */
async function importér(kilde: Tabeller, mål: Tabeller, valg: { maksBytes?: number; afbrydEfter?: number; kun?: DelTabel[] } = {}) {
    const lager = hukommelsesLager(mål, { afbrydEfter: valg.afbrydEfter });
    const svar: { tabel: DelTabel; ok: boolean; status: string; svar: string }[] = [];
    const rækkefølge: DelTabel[] = valg.kun ?? ["Scenarie", "Bestilling", "KoerselInput", "KoerselNoegletal", "KoerselMaaned", "KoerselTime", "Koersel"];
    for (const tabel of rækkefølge) {
        const rækker = rækkerFra(kilde, tabel);
        if (!rækker.length) continue;
        const dele = delOp(rækker, tabel, valg.maksBytes, rækkerFra(kilde, "ScenarieAendring"));
        for (const [i, d] of dele.entries()) {
            const forventet = tabel === "Koersel" ? forventetFor(kilde, d.raekker) : undefined;
            const tekst = delTekst({ arkiv: ARKIV, tabel, raekker: d.raekker, aendringer: d.aendringer, forventet });
            const a = opretAnmodning(mål, importAnmodningJson({ arkiv: ARKIV, sha256: sha256Tekst(tekst), tabel, nr: i + 1, af: dele.length,
                koersel_ider: tabel === "Koersel" ? d.raekker.map((r) => r[0] as string) : [], filnavn: "test.xlsx" }));
            const s = await importerDel(lager, a, tekst);
            svar.push({ tabel, ...s });
            if (!s.ok) return svar;
        }
    }
    return svar;
}

const ens = (a: Tabeller, b: Tabeller, tabeller: ImportTabel[] = ["Scenarie", "ScenarieAendring", "Bestilling", "Koersel", "KoerselInput", "KoerselNoegletal", "KoerselMaaned", "KoerselTime"]) => {
    for (const t of tabeller) expect(tabelSha(rækkerFra(b, t)), t).toBe(tabelSha(rækkerFra(a, t)));
};

/** En tom installation med samme værk (som efter upload af værksarket) og samme tidsserie. */
function målMedVaerk(kilde: Tabeller): Tabeller {
    const m = tomDb();
    for (const t of ["Vaerk", "VaerkParameter", "Aendringslog", "Tidsserie"] as const) m[t] = new Map([...kilde[t]].map(([k, v]) => [k, { ...v }]));
    return m;
}

describe("importerDel", () => {
    it("rundtur i en tom database giver identiske rækker i alle tabeller, inkl. 250 timer", async () => {
        const kilde = eksempelDb();
        const mål = målMedVaerk(kilde);
        const svar = await importér(kilde, mål, { maksBytes: 80_000 });
        expect(svar.every((s) => s.ok), JSON.stringify(svar.filter((s) => !s.ok))).toBe(true);
        expect(svar.filter((s) => s.tabel === "KoerselTime").length).toBeGreaterThan(1);
        ens(kilde, mål);
        expect(mål.KoerselTime.size).toBe(250);
    });

    it("er idempotent: anden import springer alt over og opretter intet", async () => {
        const kilde = eksempelDb();
        const mål = målMedVaerk(kilde);
        await importér(kilde, mål);
        const før = kopiDb(mål);
        const svar = await importér(kilde, mål);
        expect(svar.every((s) => s.ok && /^0 /.test(s.svar))).toBe(true);
        ens(før, mål);
    });

    it("samme anmodning to gange: andet kald svarer med det gemte svar og skriver intet", async () => {
        const kilde = eksempelDb();
        const mål = målMedVaerk(kilde);
        const tekst = delTekst({ arkiv: ARKIV, tabel: "Scenarie", raekker: rækkerFra(kilde, "Scenarie").reverse(), aendringer: rækkerFra(kilde, "ScenarieAendring") });
        const a = opretAnmodning(mål, importAnmodningJson({ arkiv: ARKIV, sha256: sha256Tekst(tekst), tabel: "Scenarie", nr: 1, af: 1, koersel_ider: [], filnavn: "" }));
        const lager = hukommelsesLager(mål);
        expect((await importerDel(lager, a, tekst)).ok).toBe(true);
        const igen = await importerDel(lager, a, tekst);
        expect(igen).toMatchObject({ ok: true, status: "udfoert" });
        expect(lager.indsatte).toBe(4);          // 2 scenarier + 2 ændringer, én gang
    });

    it("samme id med andet indhold er en konflikt: hele delen afvises, intet overskrives", async () => {
        const kilde = eksempelDb();
        const mål = målMedVaerk(kilde);
        await importér(kilde, mål, { kun: ["Scenarie"] });
        mål.Scenarie.get(ID.scenarie)!.navn = "Omdøbt efter eksporten";
        const svar = await importér(kilde, mål, { kun: ["Scenarie"] });
        expect(svar[0]).toMatchObject({ ok: false, status: "afvist" });
        expect(svar[0].svar).toMatch(/Konflikt.*navn.*Intet er overskrevet/);
        expect(mål.Scenarie.get(ID.scenarie)!.navn).toBe("Omdøbt efter eksporten");
    });

    it("en afbrudt import genoptages uden dubletter, og kørslen er usynlig indtil den er komplet", async () => {
        const kilde = eksempelDb();
        const mål = målMedVaerk(kilde);
        await expect(importér(kilde, mål, { maksBytes: 80_000, afbrydEfter: 100 })).rejects.toThrow(/afbrudt/);
        expect(mål.Koersel.size).toBe(0);
        const svar = await importér(kilde, mål, { maksBytes: 80_000 });
        expect(svar.every((s) => s.ok)).toBe(true);
        ens(kilde, mål);
    });

    it("en kørsel med manglende timer skrives ikke (antal passer ikke)", async () => {
        const kilde = eksempelDb();
        const mål = målMedVaerk(kilde);
        await importér(kilde, mål, { kun: ["Scenarie", "Bestilling", "KoerselInput", "KoerselNoegletal", "KoerselMaaned"] });
        const svar = await importér(kilde, mål, { kun: ["Koersel"] });
        expect(svar[0].ok).toBe(false);
        expect(svar[0].svar).toMatch(/KoerselTime har 0 rækker i databasen, arkivet 250/);
        expect(mål.Koersel.size).toBe(0);
    });

    it("et manipuleret input (input_hash passer ikke) afvises", async () => {
        const kilde = eksempelDb();
        [...kilde.KoerselInput.values()][0].vaerdi_json = "999.0";
        const mål = målMedVaerk(kilde);
        const svar = await importér(kilde, mål);
        expect(svar.at(-1)).toMatchObject({ tabel: "Koersel", ok: false });
        expect(svar.at(-1)!.svar).toMatch(/input_hash/);
    });

    it("afviser en kørsel, hvis værket ikke har haft dens parametre, eller tidsserien mangler", async () => {
        const kilde = eksempelDb();
        const uden = målMedVaerk(kilde);
        uden.Aendringslog.clear();                    // historikken mangler: revision 2 kan ikke rekonstrueres
        expect((await importér(kilde, uden)).at(-1)!.svar).toMatch(/værksrevision/);
        const udenSerie = målMedVaerk(kilde);
        udenSerie.Tidsserie.clear();
        // Scenariets valg af varmelast peger på serien: nu afvises allerede scenariet (K10-F6).
        expect((await importér(kilde, udenSerie)).at(-1)!.svar).toMatch(/tidsserie(n)? \(varmelast\)/);
    });

    it("afviser scenarier, når værket ikke findes (upload værksarket først)", async () => {
        const svar = await importér(eksempelDb(), tomDb());
        expect(svar[0].svar).toMatch(/værket findes ikke her\. Upload værksarket først/);
    });

    it("afviser rækker til en kørsel, der allerede findes, og en kørsel der ikke er afsluttet", async () => {
        const kilde = eksempelDb();
        const mål = målMedVaerk(kilde);
        await importér(kilde, mål);
        const ny = rækkerFra(kilde, "KoerselTime").slice(0, 1).map((r) => ["7".repeat(8) + "-1111-4111-8111-111111111111", ...r.slice(1)]);
        const tekst = delTekst({ arkiv: ARKIV, tabel: "KoerselTime", raekker: ny });
        const a = opretAnmodning(mål, importAnmodningJson({ arkiv: ARKIV, sha256: sha256Tekst(tekst), tabel: "KoerselTime", nr: 1, af: 1, koersel_ider: [], filnavn: "" }));
        expect((await importerDel(hukommelsesLager(mål), a, tekst)).svar).toMatch(/findes allerede; der kan ikke tilføjes rækker/);

        const kø = eksempelDb();
        kø.Koersel.get(ID.koersel)!.status = "koe";
        expect((await importér(kø, målMedVaerk(kø))).at(-1)!.svar).toMatch(/kun færdige/);
    });

    it("afviser en del, hvis indhold ikke passer med anmodningens sha256, og en anmodning med et værk", async () => {
        const mål = målMedVaerk(eksempelDb());
        const tekst = delTekst({ arkiv: ARKIV, tabel: "Scenarie", raekker: rækkerFra(eksempelDb(), "Scenarie") });
        const a = opretAnmodning(mål, importAnmodningJson({ arkiv: ARKIV, sha256: "0".repeat(64), tabel: "Scenarie", nr: 1, af: 1, koersel_ider: [], filnavn: "" }));
        expect((await importerDel(hukommelsesLager(mål), a, tekst)).svar).toMatch(/sha256/);
        expect(mål.Aendringsanmodning.get(a)!.status).toBe("afvist");
    });
});
