// @vitest-environment node
//-----------------------------------------------------------------------
// Codex K10's modprøver mod arkivets skrivevej (runde 13b), som rigtige tests: røde på d077ed0, grønne efter.
// Lageret er READ COMMITTED med ventende låse pr. kørsel (arkiv-hukommelse.ts), så F3's sammenfletning af to
// anmodninger kan køres — og kontrolprøven uden lås viser, at testen fanger fejlen.
//-----------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
    delTekst, importAnmodningJson, importerDel, kanonisk, kolonnenavne, sha256Tekst, tabelSha, type DelTabel, type Kanonisk,
} from "../src/arkiv";
import { eksempelDb, forventetFor, hukommelsesLager, ID, opretAnmodning, rækkerFra, tomDb, type Lagervalg, type Tabeller } from "./arkiv-hukommelse";

const ARKIV = "c".repeat(64);

function målMedVaerk(kilde: Tabeller): Tabeller {
    const m = tomDb();
    for (const t of ["Vaerk", "VaerkParameter", "Aendringslog", "Tidsserie"] as const) m[t] = new Map([...kilde[t]].map(([k, v]) => [k, { ...v }]));
    return m;
}

/** Én del som klienten sender den. */
async function send(mål: Tabeller, tabel: DelTabel, raekker: Kanonisk[][], ekstra: { aendringer?: Kanonisk[][]; forventet?: ReturnType<typeof forventetFor>; arkiv?: string; valg?: Lagervalg } = {}) {
    const arkiv = ekstra.arkiv ?? ARKIV;
    const tekst = delTekst({ arkiv, tabel, raekker, aendringer: ekstra.aendringer, forventet: ekstra.forventet });
    const a = opretAnmodning(mål, importAnmodningJson({ arkiv, sha256: sha256Tekst(tekst), tabel, nr: 1, af: 1,
        koersel_ider: tabel === "Koersel" ? raekker.map((r) => r[0] as string) : [], filnavn: "k10.xlsx" }));
    return importerDel(hukommelsesLager(mål, ekstra.valg), a, tekst);
}

/** Scenarier (med ændringer) og bestilling — det, en kørsel bygger på. */
async function grundlag(kilde: Tabeller, mål: Tabeller) {
    expect((await send(mål, "Scenarie", rækkerFra(kilde, "Scenarie"), { aendringer: rækkerFra(kilde, "ScenarieAendring") })).ok).toBe(true);
    expect((await send(mål, "Bestilling", rækkerFra(kilde, "Bestilling"))).ok).toBe(true);
}

const BØRN = ["KoerselInput", "KoerselNoegletal", "KoerselMaaned", "KoerselTime"] as const;

describe("K10-F1: et scenarie findes ikke halvt", () => {
    it("scenariet og alle dets ændringer skrives i samme del — eller intet af det", async () => {
        const kilde = eksempelDb(5);
        const mål = målMedVaerk(kilde);
        // En ændring med for lang sti afviser hele delen: heller ikke scenarierne må være skrevet.
        const ændr = rækkerFra(kilde, "ScenarieAendring");
        const sti = kolonnenavne("ScenarieAendring").indexOf("sti");
        await expect(send(mål, "Scenarie", rækkerFra(kilde, "Scenarie"), { aendringer: [ændr[0], ændr[1].map((v, i) => (i === sti ? "x".repeat(401) : v))] }))
            .resolves.toMatchObject({ ok: false });
        expect(mål.Scenarie.size).toBe(0);
        const ok = await send(mål, "Scenarie", rækkerFra(kilde, "Scenarie"), { aendringer: ændr });
        expect(ok).toMatchObject({ ok: true, oprettet: 4 });
        expect(mål.ScenarieAendring.size).toBe(2);
    });
});

describe("K10-F2: indhold, ikke antal og id", () => {
    it("rækker fra et ANDET arkiv med samme id'er: kørslen afvises, selv om antallet passer", async () => {
        const kilde = eksempelDb(5);
        const mål = målMedVaerk(kilde);
        await grundlag(kilde, mål);
        const fremmede = rækkerFra(kilde, "KoerselNoegletal");
        fremmede[0][kolonnenavne("KoerselNoegletal").indexOf("vaerdi")] = 123456789;
        expect((await send(mål, "KoerselNoegletal", fremmede, { arkiv: "d".repeat(64) })).ok).toBe(true);
        for (const b of BØRN.filter((x) => x !== "KoerselNoegletal")) expect((await send(mål, b, rækkerFra(kilde, b))).ok).toBe(true);
        const k = rækkerFra(kilde, "Koersel");
        const svar = await send(mål, "Koersel", k, { forventet: forventetFor(kilde, k) });
        expect(svar.ok).toBe(false);
        expect(svar.svar).toMatch(/KoerselNoegletal i databasen har andet indhold end arkivets/);
        expect(mål.Koersel.size).toBe(0);
    });

    it("en eksisterende kørsel er kun 'findes', hvis dens rækker også passer", async () => {
        const kilde = eksempelDb(5);
        const mål = målMedVaerk(kilde);
        await grundlag(kilde, mål);
        for (const b of BØRN) await send(mål, b, rækkerFra(kilde, b));
        const k = rækkerFra(kilde, "Koersel");
        expect((await send(mål, "Koersel", k, { forventet: forventetFor(kilde, k) })).ok).toBe(true);
        expect((await send(mål, "Koersel", k, { forventet: forventetFor(kilde, k) }))).toMatchObject({ ok: true, oprettet: 0, fandtes: 1 });
        [...mål.KoerselNoegletal.values()][0].vaerdi = 999999;
        const igen = await send(mål, "Koersel", k, { forventet: forventetFor(kilde, k) });
        expect(igen.ok).toBe(false);
        expect(igen.svar).toMatch(/^Konflikt: Kørsel .*KoerselNoegletal i databasen har andet indhold/);
    });
});

describe("K10-F3: en fælles lås pr. kørsel", () => {
    /** B (en ekstra timerække) holder pause midt i sin transaktion; imens afslutter A kørslen. */
    async function sammenflet(valg: Lagervalg) {
        const kilde = eksempelDb(5);
        const mål = målMedVaerk(kilde);
        await grundlag(kilde, mål);
        for (const b of BØRN) await send(mål, b, rækkerFra(kilde, b));
        const ekstra = [...rækkerFra(kilde, "KoerselTime")[0]];
        ekstra[0] = "aaaaaaaa-2222-4222-8222-222222222222";
        ekstra[kolonnenavne("KoerselTime").indexOf("tid")] = "2026-03-31T01:00:00.000Z";
        let pause!: () => void, videre!: () => void;
        const iPause = new Promise<void>((r) => (pause = r));
        const fortsæt = new Promise<void>((r) => (videre = r));
        const b = send(mål, "KoerselTime", [ekstra], { valg: { ...valg, førIndsæt: async () => { pause(); await fortsæt; } } });
        await iPause;
        const k = rækkerFra(kilde, "Koersel");
        const a = send(mål, "Koersel", k, { forventet: forventetFor(kilde, k), valg });
        await new Promise((r) => setTimeout(r, 20));            // A får chancen for at køre forbi B
        videre();
        return { a: await a, b: await b, mål };
    }

    it("med låsen: afslutningen venter på børneskrivningen og ser den — kørslen skrives ikke med en fremmed række", async () => {
        const { a, b, mål } = await sammenflet({});
        expect(b.ok).toBe(true);
        expect(a.ok).toBe(false);
        expect(a.svar).toMatch(/KoerselTime har 6 rækker i databasen, arkivet 5/);
        expect(mål.Koersel.size).toBe(0);
    });

    it("kontrolprøve uden låsen: fejlen fra K10 opstår (kørsel med 5 forventede og 6 skrevne timer)", async () => {
        const { a, b, mål } = await sammenflet({ udenKørselslås: true });
        expect(a.ok && b.ok).toBe(true);
        expect(mål.Koersel.size).toBe(1);
        expect(mål.KoerselTime.size).toBe(6);
    });
});

describe("K10-F5: decimaler afrundes ikke tavst", () => {
    const dec = { navn: "vaerdi", type: "decimal", nullable: true } as const;
    it("en decimal som tekst, der ikke kan bæres af et JS-tal, afvises; en, der kan, er tallet", () => {
        expect(() => kanonisk(dec, "10000000.0000000001")).toThrow(/flere cifre, end arkivet kan bevare/);
        expect(() => kanonisk(dec, "10000000.0000000002")).toThrow(/flere cifre/);
        expect(kanonisk(dec, "867031.2345792934")).toBe(867031.2345792934);
        expect(kanonisk(dec, "867031.2300")).toBe(867031.23);
        expect(kanonisk(dec, "1e3")).toBe(1000);
        expect(kanonisk(dec, "-0.000000100")).toBe(-1e-7);
    });
    it("de tal, appen læser, giver forskellige hashes, når de er forskellige", () => {
        expect(tabelSha([[867031.2345792934]])).not.toBe(tabelSha([[867031.2345792935]]));
    });
});

describe("K10-F6: tidsseriens rolle skal passe", () => {
    function medSolprofil(kilde: Tabeller): Tabeller {
        const mål = målMedVaerk(kilde);
        const s = mål.Tidsserie.get(ID.tidsserie)!;
        mål.Tidsserie.clear();
        mål.Tidsserie.set("aaaaaaaa-3333-4333-8333-333333333333", { ...s, id: "aaaaaaaa-3333-4333-8333-333333333333", rolle: "solprofil" });
        return mål;
    }

    it("scenariets valg af varmelast skal pege på en gyldig varmelast her — ellers afvises scenariet", async () => {
        const kilde = eksempelDb(5);
        const mål = målMedVaerk(kilde);
        mål.Tidsserie.get(ID.tidsserie)!.rolle = "solprofil";             // samme id, anden rolle
        const svar = await send(mål, "Scenarie", rækkerFra(kilde, "Scenarie"), { aendringer: rækkerFra(kilde, "ScenarieAendring") });
        expect(svar.ok).toBe(false);
        expect(svar.svar).toMatch(/valgte tidsserie \(varmelast\) findes ikke her som gyldig varmelast/);
        expect(mål.Scenarie.size).toBe(0);
    });

    it("en solprofil med samme sha256 erstatter ikke kørslens frosne varmelast", async () => {
        const kilde = eksempelDb(5);
        const mål = medSolprofil(kilde);
        const sti = kolonnenavne("ScenarieAendring").indexOf("sti");
        const udenValg = rækkerFra(kilde, "ScenarieAendring").filter((a) => !String(a[sti]).startsWith("_tidsserie."));
        expect((await send(mål, "Scenarie", rækkerFra(kilde, "Scenarie"), { aendringer: udenValg })).ok).toBe(true);
        expect((await send(mål, "Bestilling", rækkerFra(kilde, "Bestilling"))).ok).toBe(true);
        for (const b of BØRN) await send(mål, b, rækkerFra(kilde, b));
        const k = rækkerFra(kilde, "Koersel");
        const svar = await send(mål, "Koersel", k, { forventet: forventetFor(kilde, k) });
        expect(svar.ok).toBe(false);
        expect(svar.svar).toMatch(/tidsserien \(varmelast\).*som ikke findes her som varmelast/);
    });
});
