// @vitest-environment node
//-----------------------------------------------------------------------
// Arkivet i browseren (runde 13): xlsx-laget, dansk tid, Excels grænser og hele rundturen
// eksport -> .xlsx/.zip -> forhåndsvisning -> import -> identiske rækker og samme tal på sammenligningssiden.
// Databasen er rayfin/functions/test/arkiv-hukommelse.ts bag en datakilde, der paginerer som DAB.
//-----------------------------------------------------------------------

import { afterEach, describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { importerDel, tabelSha, type ImportTabel } from "../../../rayfin/functions/src/arkiv";
import {
    eksempelDb, hukommelsesLager, ID, opretAnmodning, REF_KOERSEL, rækkerFra, tomDb, type Række, type Tabeller,
} from "../../../rayfin/functions/test/arkiv-hukommelse";
import { sætLæseKilde, læs, type LæseKilde } from "@/lib/data/laes";
import { difference, maanedstabel, samlNoegletal } from "@/sider/analyser/beregn";
import { bygArkivBog, danskVægur, danskExcelSerie, læsArkivBog } from "./bog";
import { eksporterFamilie, eksporterSamling, familier, hentArkivindhold } from "./eksport";
import { importér, læsArkivfil, planlæg } from "./genimport";
import { EXCEL_MAKS_TEGN, fraXmlTekst, læsXlsx, skrivXlsx, tilXmlTekst } from "./xlsx";

// ------------------------------------------------------------------ en datakilde som DAB

/** `select().where().orderBy().first().after().executePaginated()` over en hukommelses-db. Uden first: 100 rækker (DAB's standard). */
function dabKilde(db: Tabeller, tæller?: { kald: number }): LæseKilde {
    const data: Record<string, { select(felter: readonly string[]): unknown }> = {};
    for (const t of [...Object.keys(db), "Motor"]) {
        data[t] = {
            select: () => {
                const q = { filter: {} as Record<string, { eq?: unknown }>, sort: null as null | [string, "asc" | "desc"], n: 100, efter: 0 };
                const api = {
                    where(f: Record<string, { eq?: unknown }>) { q.filter = f; return api; },
                    orderBy(s: Record<string, "asc" | "desc">) { q.sort = Object.entries(s)[0]; return api; },
                    first(n: number) { q.n = n; return api; },
                    after(m: string) { q.efter = Number(m); return api; },
                    async executePaginated() {
                        if (tæller) tæller.kald++;
                        let r = [...(db[t] ?? new Map<string, Række>()).values()].filter((x) => Object.entries(q.filter).every(([k, f]) => x[k] === f.eq));
                        if (q.sort) { const [k, o] = q.sort; r = r.sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (o === "asc" ? 1 : -1)); }
                        const side = r.slice(q.efter, q.efter + q.n).map((x) => ({ ...x }));
                        const slut = q.efter + side.length;
                        return { items: side, hasNextPage: slut < r.length, endCursor: String(slut) };
                    },
                };
                return api;
            },
        };
    }
    return { data } as LæseKilde;
}

afterEach(() => sætLæseKilde(null));

/** Skriv via importerDel mod mål-db'en — det samme forløb som Function'en og community-serveren. */
const skriverTil = (mål: Tabeller) => async (anm: string, del: string, bruger: string | undefined) =>
    importerDel(hukommelsesLager(mål), opretAnmodning(mål, anm, bruger ?? ""), del);

const IMPORT_TABELLER: ImportTabel[] = ["Scenarie", "ScenarieAendring", "Bestilling", "Koersel", "KoerselInput", "KoerselNoegletal", "KoerselMaaned", "KoerselTime"];

function målMedVaerk(kilde: Tabeller): Tabeller {
    const m = tomDb();
    for (const t of ["Vaerk", "VaerkParameter", "Aendringslog", "Tidsserie"] as const) m[t] = new Map([...kilde[t]].map(([k, v]) => [k, { ...v }]));
    return m;
}

async function eksportérFra(kilde: Tabeller, scenarier = [ID.reference, ID.scenarie]) {
    sætLæseKilde(() => dabKilde(kilde));
    return eksporterFamilie({ scenarier, bruger: "eksportoer@example.org" });
}

async function importérTil(mål: Tabeller, bytes: Uint8Array, filnavn = "arkiv.xlsx") {
    sætLæseKilde(() => dabKilde(mål));
    const [fil] = læsArkivfil(bytes, filnavn);
    const plan = await planlæg(fil);
    const resultat = await importér(plan, "importoer@example.org", undefined, skriverTil(mål));
    return { plan, resultat };
}

/** Månedstabellen er funktioner; sammenlign det, siden slår op i den. */
function månedstal(rækker: Parameters<typeof maanedstabel>[0]) {
    const t = maanedstabel(rækker);
    return { maaneder: t.maaneder, vaerdier: rækker.map((r) => [r.maaned, r.objekt, r.noegle, t.vaerdi(r.maaned, r.objekt ?? null, r.noegle), t.periode(r.objekt ?? null, r.noegle)]) };
}

/** Det, sammenligningssiden regner med for en kørsel (analyser/data.ts usePakke -> beregn.ts). Databasen lover ingen
 *  rækkefølge, så begge sider læses sorteret på id. */
async function sidensTal(db: Tabeller, kørsel: string) {
    sætLæseKilde(() => dabKilde(db));
    const k = (await læs("Koersel", { filter: { id: { eq: kørsel } } }))[0];
    return {
        k, samlet: samlNoegletal(await læs("KoerselNoegletal", { filter: { koersel_id: { eq: kørsel } }, sortering: { id: "asc" } })),
        maaneder: månedstal(await læs("KoerselMaaned", { filter: { koersel_id: { eq: kørsel } }, sortering: { id: "asc" } })),
        timer: await læs("KoerselTime", { filter: { koersel_id: { eq: kørsel } }, sortering: { tid: "asc" } }),
    };
}

// ------------------------------------------------------------------ xlsx

describe("xlsx-laget", () => {
    it("tekst kommer præcis tilbage: kontroltegn, \\r\\n, escape-lignende tekst, tom tekst, emoji", () => {
        const tekster = ["a\r\nb\tc", "\u0001\u001f", "_x0041_", "_x005F_x0041_", "__x0041__", "", "æøå 😀 <&>\"'", "_x00", "x".repeat(EXCEL_MAKS_TEGN)];
        for (const t of tekster) expect(fraXmlTekst(tilXmlTekst(t))).toBe(t);
        const b = skrivXlsx([{ navn: "A", rækker: [tekster, [0.1 + 0.2, 1e-7, -12.5, 2 ** 53, true, false, null, { dato: 46000.5 }]] }], { titel: "t" });
        const [a] = læsXlsx(b);
        expect([...a.celler.get(1)!.values()]).toEqual(tekster);
        expect([...a.celler.get(2)!.entries()]).toEqual([[1, 0.30000000000000004], [2, 1e-7], [3, -12.5], [4, 2 ** 53], [5, true], [6, false], [8, 46000.5]]);
    });
    it("afviser hellere end at afkorte: for lang celle, for mange kolonner, løs surrogat", () => {
        expect(() => skrivXlsx([{ navn: "A", rækker: [["x".repeat(EXCEL_MAKS_TEGN + 1)]] }], { titel: "t" })).toThrow(/højst 32767/);
        expect(() => skrivXlsx([{ navn: "A", rækker: [new Array(16_385).fill(1)] }], { titel: "t" })).toThrow(/16384/);
        expect(() => tilXmlTekst("a\uD800b")).toThrow(/surrogat/);
    });
    it("skjulte ark og rækker læses som skjulte", () => {
        const [a, b] = læsXlsx(skrivXlsx([{ navn: "Synlig", rækker: [["x"], ["y"]], skjulteRækker: [2] }, { navn: "_skjult", rækker: [["z"]], skjult: true }], { titel: "t" }));
        expect(a.skjulteRækker.has(2)).toBe(true);
        expect(b.skjult).toBe(true);
    });
});

describe("dansk tid (maskinen kører i UTC — assert på vægurets komponenter)", () => {
    const vu = (iso: string) => { const v = danskVægur(iso); return [v.år, v.måned, v.dag, v.time, v.minut]; };
    it("vinter +1, sommer +2, og overgangene i 2026", () => {
        expect(vu("2026-01-05T23:30:00.000Z")).toEqual([2026, 1, 6, 0, 30]);
        expect(vu("2026-07-01T22:00:00.000Z")).toEqual([2026, 7, 2, 0, 0]);
        expect(vu("2026-03-29T00:59:00.000Z")).toEqual([2026, 3, 29, 1, 59]);
        expect(vu("2026-03-29T01:00:00.000Z")).toEqual([2026, 3, 29, 3, 0]);
        expect(vu("2026-10-25T00:30:00.000Z")).toEqual([2026, 10, 25, 2, 30]);
        expect(vu("2026-10-25T01:30:00.000Z")).toEqual([2026, 10, 25, 2, 30]);     // den gentagne time — derfor er UTC data
    });
    it("Excel-serietallet er vægurets dato og tid", () => {
        const s = danskExcelSerie("2026-07-01T22:00:00.000Z");
        const d = new Date(Math.round((s - 25569) * 86_400_000));
        expect([d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours()]).toEqual([2026, 7, 2, 0]);
    });
});

// ------------------------------------------------------------------ eksport

describe("eksport", () => {
    it("pagineret og fuldstændig: 250 timer (> 100, DAB's standardside) — rækketallet er databasens", async () => {
        const db = eksempelDb(250, true);
        const tæller = { kald: 0 };
        sætLæseKilde(() => dabKilde(db, tæller));
        const ind = await hentArkivindhold({ scenarier: [ID.reference, ID.scenarie], bruger: "x@example.org" });
        expect(ind.tabeller.KoerselTime.length).toBe(db.KoerselTime.size);
        expect(ind.tabeller.KoerselTime.length).toBe(500);
        expect(tabelSha(ind.tabeller.KoerselTime)).toBe(tabelSha(rækkerFra(db, "KoerselTime")));
        expect(tæller.kald).toBeGreaterThan(10);
    });

    it("stopper, hvis en kørsel får færre timer end den selv siger (en afkortet læsning)", async () => {
        const db = eksempelDb(250);
        sætLæseKilde(() => {
            const k = dabKilde(db);
            const sel = k.data.KoerselTime.select.bind(k.data.KoerselTime);
            type Q = { first(n: number): Q; executePaginated(): Promise<{ items: unknown[]; hasNextPage: boolean; endCursor?: string | null }> };
            // Som `execute()` uden `first:`: én side på 100 rækker og intet om, at der er flere.
            k.data.KoerselTime = {
                select: (f: readonly string[]) => {
                    const q = sel(f) as Q;
                    const first = q.first.bind(q), e = q.executePaginated.bind(q);
                    q.first = () => first(100);
                    q.executePaginated = async () => ({ ...(await e()), hasNextPage: false });
                    return q;
                },
            };
            return k;
        });
        await expect(hentArkivindhold({ scenarier: [ID.reference, ID.scenarie], bruger: "x" })).rejects.toThrow(/250|timerækker/);
    });

    it("springer kørsler over, der ikke er afsluttede, og siger det i Læs mig", async () => {
        const db = eksempelDb(10);
        db.Koersel.get(ID.koersel)!.status = "koerer";
        const e = await eksportérFra(db);
        expect(e.manifest.tabeller.Koersel.raekker).toBe(0);
        expect(e.manifest.meta.udeladt).toEqual([{ id: ID.koersel, scenarie_id: ID.scenarie, status: "koerer" }]);
        const læsmig = læsXlsx(e.bytes)[0];
        expect([...læsmig.celler.values()].some((r) => String(r.get(2) ?? "").includes("ikke afsluttede"))).toBe(true);
    });

    it("arket: danske overskrifter, skjult række med feltnavne, dansk tid ved siden af UTC, tal som tal, skjult _manifest", async () => {
        const e = await eksportérFra(eksempelDb(5));
        const ark = læsXlsx(e.bytes);
        expect(ark.map((a) => a.navn)).toEqual(["Læs mig", "Scenarier", "Ændringer", "Bestillinger", "Kørsler", "Input", "Nøgletal", "Måneder", "Timer", "Værksændringer", "Værker", "Værksrevisioner", "Tidsserier", "_manifest"]);
        const timer = ark.find((a) => a.navn === "Timer")!;
        expect(timer.skjulteRækker.has(2)).toBe(true);
        const navne = [...timer.celler.get(2)!.values()];
        expect(navne.slice(0, 4)).toEqual(["id", "koersel_id", "tid~dk", "tid"]);
        expect(navne).toContain("vaerdier_json~p_halmkedel_mw");
        expect([...timer.celler.get(1)!.values()].slice(2, 4)).toEqual(["Interval start (dansk tid)", "Interval start (UTC)"]);
        const r3 = timer.celler.get(3)!;
        expect(r3.get(4)).toBe("2026-03-28T22:00:00.000Z");
        expect(typeof r3.get(3)).toBe("number");                 // Excel-dato
        expect(typeof r3.get(5)).toBe("number");                 // varmelast_mw som tal
        expect(ark.at(-1)!.skjult).toBe(true);
    });

    it("Excels rækkegrænse: en tabel deles i flere ark og læses tilbage uden tab", async () => {
        sætLæseKilde(() => dabKilde(eksempelDb(250)));
        const ind = await hentArkivindhold({ scenarier: [ID.reference, ID.scenarie], bruger: "x" });
        const { bytes, manifest } = bygArkivBog(ind, { maksDatarækker: 100 });
        expect(manifest.tabeller.KoerselTime.ark).toEqual(["Timer", "Timer (2)", "Timer (3)"]);
        expect(tabelSha(læsArkivBog(bytes).indhold.tabeller.KoerselTime)).toBe(tabelSha(ind.tabeller.KoerselTime));
    });

    it("familier: et scenarie og dets reference hører sammen", () => {
        expect(familier([
            { id: "a", reference_scenarie_id: null, navn: "A ref" }, { id: "b", reference_scenarie_id: "a", navn: "B" },
            { id: "c", reference_scenarie_id: null, navn: "C alene" },
        ])).toEqual([["a", "b"], ["c"]]);
    });
});

// ------------------------------------------------------------------ manipulation

/** Ændrer én celles XML i et ark og pakker filen igen (som en bruger, der retter i arket). */
function retCelle(bytes: Uint8Array, ark: number, fra: RegExp, til: string): Uint8Array {
    const f = unzipSync(bytes);
    const sti = `xl/worksheets/sheet${ark}.xml`;
    const før = strFromU8(f[sti]);
    const efter = før.replace(fra, til);
    expect(efter).not.toBe(før);
    f[sti] = strToU8(efter);
    return zipSync(f);
}

describe("et rettet arkiv afvises før noget skrives", () => {
    it("et tal i Timer, en dato i dansk tid, en slettet række, en udfoldet kolonne", async () => {
        const e = await eksportérFra(eksempelDb(20));
        const timer = 9;          // Læs mig = 1, Scenarier = 2 … Timer = 9
        expect(() => læsArkivBog(retCelle(e.bytes, timer, /(<c r="E3"><v>)([^<]+)/, "$13.6"))).toThrow(/sha256/);
        expect(() => læsArkivBog(retCelle(e.bytes, timer, /(<c r="C3" s="2"><v>)([^<]+)/, "$146000"))).toThrow(/dansk tid.*rettet/);
        expect(() => læsArkivBog(retCelle(e.bytes, timer, /<row r="22">[\s\S]*?<\/row>/, ""))).toThrow(/rækker, manifestet/);
        expect(() => læsArkivBog(retCelle(e.bytes, timer, /(<c r="I3"><v>)([^<]+)/, "$17"))).toThrow(/passer ikke med "Øvrige værdier/);
    });
    it("en .zip, hvor en fil er ændret eller mangler", async () => {
        const db = eksempelDb(5);
        sætLæseKilde(() => dabKilde(db));
        const z = await eksporterSamling([[ID.reference, ID.scenarie]], "x");
        expect(læsArkivfil(z.bytes, z.navn)).toHaveLength(1);
        const f = unzipSync(z.bytes);
        const navn = z.manifest.filer[0].navn;
        f[navn] = retCelle(f[navn], 9, /(<c r="E3"><v>)([^<]+)/, "$13.6");
        expect(() => læsArkivfil(zipSync(f), "x.zip")).toThrow(/ændret eller beskadiget/);
        delete f[navn];
        expect(() => læsArkivfil(zipSync(f), "x.zip")).toThrow(/mangler/);
    });
});

// ------------------------------------------------------------------ rundturen

describe("rundtur eksport -> import", () => {
    it("i en tom installation med samme værk: identiske rækker i alle tabeller (inkl. 500 timer) og samme tal på sammenligningssiden", async () => {
        const kilde = eksempelDb(250, true);
        const e = await eksportérFra(kilde);
        const mål = målMedVaerk(kilde);
        const { plan, resultat } = await importérTil(mål, e.bytes, e.navn);
        expect(plan.poster.map((p) => p.udfald)).toEqual(["opret", "opret", "opret", "opret"]);
        expect(resultat.oprettet).toBe(IMPORT_TABELLER.reduce((s, t) => s + kilde[t].size, 0));
        for (const t of IMPORT_TABELLER) expect(tabelSha(rækkerFra(mål, t)), t).toBe(tabelSha(rækkerFra(kilde, t)));

        const [fa, fb, ea, eb] = [await sidensTal(kilde, REF_KOERSEL), await sidensTal(kilde, ID.koersel), await sidensTal(mål, REF_KOERSEL), await sidensTal(mål, ID.koersel)];
        for (const [x, y] of [[ea, fa], [eb, fb]] as const) {
            expect(JSON.stringify(x.k)).toBe(JSON.stringify(y.k));
            expect(x.samlet).toEqual(y.samlet);
            expect(x.maaneder).toEqual(y.maaneder);
            expect(JSON.stringify(x.timer)).toBe(JSON.stringify(y.timer));
        }
        expect(difference(ea.k, eb.k)).toEqual(difference(fa.k, fb.k));
        expect(difference(ea.k, eb.k)!.delta).toBeCloseTo(-170, 6);       // scenariet er 170 kr. billigere end referencen
    });

    it("anden import: alt findes og springes over; intet skrives", async () => {
        const kilde = eksempelDb(30, true);
        const e = await eksportérFra(kilde);
        const mål = målMedVaerk(kilde);
        await importérTil(mål, e.bytes);
        const før = IMPORT_TABELLER.map((t) => tabelSha(rækkerFra(mål, t)));
        const { plan, resultat } = await importérTil(mål, e.bytes);
        expect(plan.poster.every((p) => p.udfald === "findes")).toBe(true);
        expect(resultat.dele).toBe(0);
        expect(IMPORT_TABELLER.map((t) => tabelSha(rækkerFra(mål, t)))).toEqual(før);
    });

    it("konflikt: et scenarie, der er rettet her, vises og røres ikke; dets kørsler importeres stadig", async () => {
        const kilde = eksempelDb(10);
        const e = await eksportérFra(kilde);
        const mål = målMedVaerk(kilde);
        mål.Scenarie.set(ID.scenarie, { ...kilde.Scenarie.get(ID.scenarie)!, navn: "Rettet her" });
        const { plan } = await importérTil(mål, e.bytes);
        const s = plan.poster.find((p) => p.id === ID.scenarie)!;
        expect(s.udfald).toBe("konflikt");
        expect(s.grund).toMatch(/navn/);
        expect(mål.Scenarie.get(ID.scenarie)!.navn).toBe("Rettet her");
        expect(mål.Koersel.has(ID.koersel)).toBe(true);
        expect(mål.ScenarieAendring.size).toBe(0);           // et eksisterende scenaries ændringer røres ikke
    });

    it("en afbrudt import vises som 'genoptag' og sender kun de manglende rækker", async () => {
        const kilde = eksempelDb(250);
        const e = await eksportérFra(kilde);
        const mål = målMedVaerk(kilde);
        sætLæseKilde(() => dabKilde(mål));
        const [fil] = læsArkivfil(e.bytes, "a.xlsx");
        let dele = 0;
        const skriv = skriverTil(mål);
        await expect(importér(await planlæg(fil), "i@example.org", undefined, async (a, d, b) => {
            if (++dele > 4) throw new Error("netværket forsvandt");
            return skriv(a, d, b);
        })).rejects.toThrow(/netværket/);
        expect(mål.Koersel.size).toBe(0);
        const plan = await planlæg(fil);
        const k = plan.poster.find((p) => p.slags === "koersel")!;
        expect(k.udfald).toBe("genoptag");
        expect(k.rækker).toBe(5 + 2 + 2 + 250 + 1 - 5);         // inputrækkerne nåede at blive skrevet; resten sendes
        await importér(plan, "i@example.org", undefined, skriv);
        for (const t of IMPORT_TABELLER) expect(tabelSha(rækkerFra(mål, t)), t).toBe(tabelSha(rækkerFra(kilde, t)));
    });

    it("ny installation: værket uploadet igen (nyt id, revision 1) og tidsserien igen (nyt id, samme sha256)", async () => {
        const kilde = eksempelDb(10);
        const e = await eksportérFra(kilde);
        const mål = tomDb();
        const nytVaerk = "12121212-1212-4121-8121-121212121212";
        const nySerie = "34343434-3434-4343-8343-343434343434";
        mål.Vaerk.set(nytVaerk, { ...kilde.Vaerk.get(ID.vaerk)!, id: nytVaerk, revision: 1, kilde: "app" });
        // Værksarket fra revision 2 (den kørslen bygger på): straw 250, p_max 4.
        for (const [i, [sti, v]] of ([["prices.straw.value", "250.0"], ["units.halmkedel.p_max", "4.0"], ["storage.tank.enabled", "true"]] as const).entries()) {
            mål.VaerkParameter.set(`p${i}`, { id: `p${i}`, vaerk_id: nytVaerk, sti, vaerdi_json: v });
        }
        mål.Tidsserie.set(nySerie, { ...kilde.Tidsserie.get(ID.tidsserie)!, id: nySerie, vaerk_id: nytVaerk });
        const { plan } = await importérTil(mål, e.bytes);
        expect(plan.poster.every((p) => p.udfald === "opret")).toBe(true);
        const k = mål.Koersel.get(ID.koersel)!;
        expect([k.vaerk_id, k.vaerk_revision]).toEqual([nytVaerk, 1]);
        expect(mål.Scenarie.get(ID.scenarie)!.vaerk_id).toBe(nytVaerk);
        const valg = [...mål.ScenarieAendring.values()].find((a) => a.sti === "_tidsserie.varmelast")!;
        expect(valg.vaerdi_json).toBe(JSON.stringify(nySerie));
        // Kørslens frosne input er uændret (input_hash gælder stadig): den gamle tidsseries id står der.
        expect(tabelSha(rækkerFra(mål, "KoerselInput"))).toBe(tabelSha(rækkerFra(kilde, "KoerselInput")));
    });

    it("afviser med grund, når værket mangler, eller værket her ikke har kørslens revision", async () => {
        const kilde = eksempelDb(5);
        const e = await eksportérFra(kilde);
        const { plan } = await importérTil(tomDb(), e.bytes).catch(() => ({ plan: null }));
        void plan;
        sætLæseKilde(() => dabKilde(tomDb()));
        const p = await planlæg(læsArkivfil(e.bytes, "a.xlsx")[0]);
        expect(p.poster.every((x) => x.udfald === "afvist")).toBe(true);
        expect(p.poster[0].grund).toMatch(/Upload værksarket/);

        const mål = målMedVaerk(kilde);
        mål.Aendringslog.clear();
        sætLæseKilde(() => dabKilde(mål));
        const p2 = await planlæg(læsArkivfil(e.bytes, "a.xlsx")[0]);
        expect(p2.poster.find((x) => x.slags === "koersel")!.grund).toMatch(/aldrig haft de parametre/);
        expect(p2.poster.find((x) => x.slags === "scenarie" && x.id === ID.scenarie)!.udfald).toBe("opret");
    });
});
