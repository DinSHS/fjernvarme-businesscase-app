// @vitest-environment node
//-----------------------------------------------------------------------
// Codex K5 — fv-app's fund (F1, F2, F3, F4, F5, F7, F13). Hver test fejler på
// koden før K5 og består efter.
//-----------------------------------------------------------------------

import { afterEach, describe, expect, it } from "vitest";
import { Afvisning, bygFrossetInput, læsAnmodning, samlNytVaerk, type Parameter, type ScenarieAendringRad } from "../src/logik";
import { ForLangRække, MAKS_POSITIONER, tætRække, vaerkTrae, validerUpload } from "../src/tidsserie";

const kvarterer = (n: number) => new TextEncoder().encode(
    "time,mw\n" + Array.from({ length: n }, (_, i) => `${new Date(Date.UTC(2026, 0, 5) + i * 900_000).toISOString().slice(0, 19)}Z,1`).join("\n") + "\n");
const MW = { tidszone: "UTC", tidsstempel: "start", enhed: "MW" } as const;
const sumMwh = () => validerUpload(kvarterer(192), "varmelast", MW, null).validering.sum_mwh;

describe("K5-F1: ingen prototypeforurening fra brugerskrevne stier", () => {
    afterEach(() => { delete (Object.prototype as Record<string, unknown>).pr_interval; });

    it("Codex' måling: 192 kvarterer à 1 MW er 48 MWh — også efter et træ med units.__proto__.pr_interval er bygget", () => {
        expect(sumMwh()).toBe(48);
        vaerkTrae([{ sti: "units.__proto__.pr_interval", vaerdi_json: "true" }, { sti: "units.constructor.x", vaerdi_json: "1" }]);
        expect(({} as Record<string, unknown>).pr_interval).toBeUndefined();
        expect(sumMwh()).toBe(48);
    });
    it("værkstræet har ingen prototype og bygger stadig almindelige stier", () => {
        const t = vaerkTrae([{ sti: "units.sol.type", vaerdi_json: '"solar_thermal"' }]);
        expect(Object.getPrototypeOf(t.units)).toBeNull();
        expect((t.units.sol as Record<string, unknown>).type).toBe("solar_thermal");
    });
    it.each(["units.__proto__.pr_interval", "constructor.prototype.x", "storage.tank.prototype"])("parameterændringen %s afvises", (sti) => {
        expect(() => læsAnmodning(JSON.stringify([{ sti, handling: "opret", ny_json: "true" }]))).toThrow(/ugyldig sti/);
    });
    it("et nyt værk med et prototype-segment afvises", () => {
        const del = { handling: "opret_vaerk_del" as const, udkast: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", nr: 1, af: 1, blade: [{ sti: "units.__proto__.pr_interval", ny_json: "true" }] };
        expect(() => samlNytVaerk([del], 1, del.udkast)).toThrow(/Ugyldig sti/);
    });
    it("en scenarieændring med et prototype-segment afvises", () => {
        const værk: Parameter[] = [{ sti: "time.start", vaerdi_json: '"2026-01-05T00:00:00Z"' }, { sti: "time.end", vaerdi_json: '"2026-01-06T23:00:00Z"' }, { sti: "units.k.enabled", vaerdi_json: "true" }];
        const æ = [{ type: "set", sti: "units.__proto__.pr_interval", vaerdi_json: "true", raekkefoelge: 1 } as ScenarieAendringRad];
        expect(() => bygFrossetInput(værk, æ, { med_balancering: false })).toThrow(Afvisning);
    });
    it("enheden 'constructor' er en ukendt enhed (som oraklets KeyError), ikke Object", () => {
        const r = validerUpload(kvarterer(192), "varmelast", { ...MW, enhed: "constructor" }, null);
        expect(r.status).toBe("afvist");
        expect(r.validering.fund.map((f) => f.kode)).toEqual(["enhed_ukendt"]);
    });
});

describe("K5-F2: en tæt række allokeres aldrig ubegrænset", () => {
    const timer = (år: number, n: number) => Array.from({ length: n }, (_, i) => `${new Date(Date.UTC(år, 0, 5) + i * 3_600_000).toISOString().slice(0, 19)}Z,1`);
    // 24 timer i 2026 og 24 timer i 2100: ~650.000 positioner (Codex brugte år 9999 = 70 mio.; samme mekanisme).
    const spredt = ["time,mw", ...timer(2026, 24), ...timer(2100, 24), ""].join("\n");
    it("en serie over 120.000 timer giver ForLangRække FØR allokering, med antallet", () => {
        expect(() => tætRække(spredt)).toThrow(ForLangRække);
        try { tætRække(spredt); } catch (e) { expect((e as ForLangRække).positioner).toBeGreaterThan(MAKS_POSITIONER); }
    });
    it("et vindue henter den samme serie i bidder", () => {
        const r = tætRække(spredt, { fra: Date.UTC(2026, 0, 1), til: Date.UTC(2026, 11, 31) });
        expect(r).toMatchObject({ start: "2026-01-05T00:00:00Z", oploesning: "1h" });
        expect(r.vaerdier).toHaveLength(24);
    });
});

describe("K5-F13: én filgrænse for side, skrivehjælper og Function", () => {
    it("fjv.constants (side + skrivehjælper) = Functions", async () => {
        const c = await import("../../data/fjv.constants");
        const f = await import("../src/tidsserie");
        expect(c.MAKS_VAERKSARK_BYTES).toBe(f.MAKS_VAERKSARK_BYTES);
        expect(c.MAKS_TIDSSERIE_BYTES).toBe(f.MAKS_UPLOAD_BYTES);
        expect(c.MAKS_VAERKSARK_BYTES).toBeLessThan(4_000_000 * 3 / 4); // base64 af arket skal kunne være i ét kald på 4 MB
    });
});

describe("K5-F5: dækningen regnes på modellens faktiske akse", () => {
    const værk = (start: string, slut: string): Parameter[] => [
        { sti: "time.start", vaerdi_json: JSON.stringify(start) }, { sti: "time.end", vaerdi_json: JSON.stringify(slut) },
        { sti: "time.resolution", vaerdi_json: '"1h"' }, { sti: "units.k.enabled", vaerdi_json: "true" },
    ];
    const serie = (start: string, slut: string) => ({ id: "11111111-1111-4111-8111-111111111111", rolle: "varmelast" as const, navn: "Målt", sha256: "a".repeat(64),
        sti: "Files/x.csv", oploesning: "1h", start, slut, aktiv: true });
    it("Codex' tilfælde: værk og serie dækker begge 5. jan. 12 UTC – 7. jan. 11 UTC (48 timer) -> accepteres", () => {
        expect(() => bygFrossetInput(værk("2026-01-05T12:00:00Z", "2026-01-07T11:00:00Z"), [], { med_balancering: false }, {},
            [serie("2026-01-05T12:00:00Z", "2026-01-07T11:00:00Z")])).not.toThrow();
    });
    it("med scenariets rene datoer gælder hele døgn (00–23 UTC), så den samme serie dækker for lidt", () => {
        expect(() => bygFrossetInput(værk("2026-01-05T12:00:00Z", "2026-01-07T11:00:00Z"), [], { med_balancering: false, periode_start: "2026-01-05", periode_slut: "2026-01-07" }, {},
            [serie("2026-01-05T12:00:00Z", "2026-01-07T11:00:00Z")])).toThrow(/dækker kun 66 %/);
    });
    it("en bar dato i værket er midnat (ikke hele døgnet), som modellens make_time_index", () => {
        // time.start/end = bare datoer -> aksen er 2026-01-05 00:00 .. 2026-01-07 00:00 (49 timer); serien slutter 00:00 -> fuld dækning.
        expect(() => bygFrossetInput(værk("2026-01-05", "2026-01-07"), [], { med_balancering: false }, {},
            [serie("2026-01-05T00:00:00Z", "2026-01-07T00:00:00Z")])).not.toThrow();
    });
});

// ------------------------------------------------------------------ F3 + F4: værksark

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tjekZip, ZIP_GRAENSER } from "../src/zip";
import { behandlVaerksark, type AnmodningsRad, type ImportRad, type Jobsvar, type VaerksarkDeps } from "../src/vaerksark";

const ark = (n: string) => new Uint8Array(readFileSync(new URL(`./vektorer/${n}`, import.meta.url)));

/** Et syntetisk ZIP-katalog (kun det tjekZip læser): `n` medlemmer med de angivne størrelser. */
function katalog(medlemmer: { navn: string; komp: number; ud: number }[], antalFelt?: number): Uint8Array {
    const dele: number[] = [0x50, 0x4b, 0x03, 0x04];
    const cdStart = dele.length;
    for (const m of medlemmer) {
        const navn = [...Buffer.from(m.navn)];
        const h = new Uint8Array(46); const v = new DataView(h.buffer);
        v.setUint32(0, 0x02014b50, true); v.setUint32(20, m.komp, true); v.setUint32(24, m.ud, true); v.setUint16(28, navn.length, true);
        dele.push(...h, ...navn);
    }
    const cdStørrelse = dele.length - cdStart;
    const e = new Uint8Array(22); const ev = new DataView(e.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(10, antalFelt ?? medlemmer.length, true); ev.setUint32(12, cdStørrelse, true); ev.setUint32(16, cdStart, true);
    return new Uint8Array([...dele, ...e]);
}

describe("K5-F3: værksarkets udpakkede størrelse tjekkes før import", () => {
    it("den uændrede skabelon godtages (15 dele, ~98 kB udpakket)", () => {
        expect(tjekZip(ark("skabelon_uaendret.xlsx"))).toMatchObject({ ok: true });
    });
    it("Codex' ark (29 kB med 8 MiB XML-kommentar) afvises på komprimeringsforholdet", () => {
        const r = tjekZip(ark("k5_komprimeret.xlsx"));
        expect(r.ok).toBe(false);
        expect(r.fejl).toMatch(/forhold over 100:1/);
    });
    it.each([
        ["for mange dele", katalog(Array.from({ length: ZIP_GRAENSER.medlemmer + 1 }, (_, i) => ({ navn: `x${i}`, komp: 10, ud: 10 }))), /dele \(højst/],
        ["et for stort medlem (selv med rimeligt forhold)", katalog([{ navn: "xl/worksheets/sheet1.xml", komp: 1_000_000, ud: 17_000_000 }]), /udpakket \(højst 16777216\)/],
        ["for meget i alt", katalog([1, 2, 3].map((i) => ({ navn: `s${i}.xml`, komp: 1_000_000, ud: 14_000_000 }))), /udpakket \(højst 33554432\)/],
        ["ZIP64", katalog([{ navn: "a", komp: 0xffffffff, ud: 0xffffffff }]), /ZIP64/],
        ["intet katalog", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), /ZIP-kataloget mangler/],
    ])("afviser %s", (_n, b, tekst) => expect(tjekZip(b).fejl).toMatch(tekst));
});

describe("K5-F4: én anmodning -> højst én import og én jobstart; en fejlet start genoptages", () => {
    const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
    const base64 = Buffer.from(ark("skabelon_uaendret.xlsx")).toString("base64");
    const ANM = "0b20eb7f-01e9-49fc-b0f5-95d307fc585d";

    /** Falsk database: anmodningstabellens lås er en mutex (som UPDLOCK/HOLDLOCK), reservationen er atomisk. */
    function falsk(jobsvar: Jobsvar[] = [{ ok: true, jobId: "job-1", status: 202 }]) {
        const anm = new Map<string, AnmodningsRad>([[ANM, { id: ANM, status: "ny", svar: null, anmodet_af: "a@b.dk",
            aendringer_json: JSON.stringify([{ handling: "upload_vaerksark", filnavn: "ark.xlsx", sha256: sha(base64) }]) }]]);
        const imp = new Map<string, ImportRad>();
        const filer: string[] = [], starter: string[] = [];
        let lås = Promise.resolve();
        const tick = () => new Promise((ok) => setTimeout(ok, 1));
        const d: VaerksarkDeps = {
            læsAnmodning: async (id) => { await tick(); const a = anm.get(id); return a ? { ...a } : undefined; },
            læsImport: async (id) => { await tick(); const i = imp.get(id); return i ? { ...i } : undefined; },
            læsVaerk: async () => undefined,
            skrivFil: async (sti) => { await tick(); filer.push(sti); },
            opretImport: (a, _u, _sti, log) => { const kør = lås.then(async () => {
                await tick();
                if (anm.get(a.id)!.status !== "ny") return "allerede_behandlet" as const;
                if (!imp.has(a.id)) imp.set(a.id, { id: a.id, status: "koe", fabric_job_id: null, log });
                anm.get(a.id)!.status = "udfoert";
                return "oprettet" as const;
            }); lås = kør.then(() => undefined); return kør; },
            reserverJobstart: async (id) => { const i = imp.get(id)!; if (i.status !== "koe" || i.fabric_job_id) return false; i.fabric_job_id = "reserveret:nu"; return true; },
            bindJob: async (id, job, log) => { const i = imp.get(id)!; i.fabric_job_id = job; if (log) i.log = log; },
            startJob: async (id) => { starter.push(id); await tick(); return jobsvar.shift() ?? { ok: true, jobId: "job-x", status: 202 }; },
            afvisAnmodning: async (id, tekst) => { anm.get(id)!.status = "afvist"; anm.get(id)!.svar = tekst; },
        };
        return { d, anm, imp, filer, starter };
    }

    it("to samtidige kald, der begge har læst 'ny' -> én import, én række, én jobstart (Codex: to af hver)", async () => {
        const f = falsk();
        const [r1, r2] = await Promise.all([behandlVaerksark(f.d, ANM, base64), behandlVaerksark(f.d, ANM, base64)]);
        expect(f.imp.size).toBe(1);
        expect(new Set(f.filer)).toEqual(new Set([`fjv/uploads/${ANM}.xlsx`]));
        expect(f.starter).toEqual([ANM]);
        expect(r1.import_id).toBe(ANM);
        expect(r2.import_id).toBe(ANM);
    });
    it("HTTP 429 ved jobstart -> nyt kald med samme anmodning genoptager og returnerer import_id (Codex: ok/udfoert uden job)", async () => {
        const f = falsk([{ ok: false, status: 429, fejl: "for mange" }, { ok: true, jobId: "job-2", status: 202 }]);
        const r1 = await behandlVaerksark(f.d, ANM, base64);
        expect(r1).toMatchObject({ ok: false, status: "koe", import_id: ANM });
        expect(f.imp.get(ANM)!.fabric_job_id).toBeNull();
        const r2 = await behandlVaerksark(f.d, ANM, base64);
        expect(r2).toMatchObject({ ok: true, status: "koe", import_id: ANM });
        expect(f.starter).toEqual([ANM, ANM]);
        expect(f.imp.get(ANM)!.fabric_job_id).toBe("job-2");
        expect(f.imp.size).toBe(1);
    });
    it("et ark, der ikke består ZIP-tjekket, afviser anmodningen uden at gemme eller oprette noget", async () => {
        const bombe = Buffer.from(ark("k5_komprimeret.xlsx")).toString("base64");
        const f = falsk();
        f.anm.get(ANM)!.aendringer_json = JSON.stringify([{ handling: "upload_vaerksark", filnavn: "ark.xlsx", sha256: sha(bombe) }]);
        const r = await behandlVaerksark(f.d, ANM, bombe);
        expect(r).toMatchObject({ ok: false, status: "afvist" });
        expect(f.filer).toEqual([]);
        expect(f.imp.size).toBe(0);
        expect(f.anm.get(ANM)!.status).toBe("afvist");
    });
});

// ------------------------------------------------------------------ F7: én definition af den frosne form

import { FROSNE_ROLLER, frossenSti, frossenTidsserie } from "../src/frysning";

describe("K5-F7: den frosne tidsserie har én definition — begge roller, præcis {id, sha256}", () => {
    const værk: Parameter[] = [{ sti: "time.start", vaerdi_json: '"2026-01-05T00:00:00Z"' }, { sti: "time.end", vaerdi_json: '"2026-01-06T23:00:00Z"' },
        { sti: "time.resolution", vaerdi_json: '"1h"' }, { sti: "units.sol.enabled", vaerdi_json: "true" }];
    const serie = (rolle: "varmelast" | "solprofil", id: string) => ({ id: id.toUpperCase(), rolle, navn: rolle, sha256: rolle[0].repeat(64),
        sti: `Files/fjv/tidsserier/x/${rolle[0].repeat(64)}.csv`, oploesning: "1h", start: "2026-01-01T00:00:00Z", slut: "2026-12-31T23:00:00Z", aktiv: true });
    it("bygFrossetInput fryser begge roller med netop den fælles form (id med små bogstaver, ingen sti/opløsning)", () => {
        const s = [serie("varmelast", "11111111-1111-4111-8111-111111111111"), serie("solprofil", "22222222-2222-4222-8222-222222222222")];
        const r = bygFrossetInput(værk, [], { med_balancering: false }, {}, s);
        for (const [i, rolle] of FROSNE_ROLLER.entries()) {
            const rad = r.rækker.find((x) => x.sti === frossenSti(rolle))!;
            expect(rad.vaerdi_json).toBe(frossenTidsserie(s[i]));
            expect(Object.keys(JSON.parse(rad.vaerdi_json))).toEqual(["id", "sha256"]);
        }
    });
});

// ------------------------------------------------------------------ F5 mod motorens egne vektorer

import { effektivAkse } from "../src/logik";

describe("K5-F5: samme første/sidste time som motoren (fabric/tests/data/periode_vektorer.json, modellens make_time_index)", () => {
    const V = JSON.parse(readFileSync(new URL("../../../../fabric/tests/data/periode_vektorer.json", import.meta.url), "utf8")) as {
        vektorer: { navn: string; time_start: string; time_end: string; start: string | null; slut: string | null; foerste: string; sidste: string; afvises?: boolean }[] };
    it.each(V.vektorer.map((v) => [v.navn, v] as const))("%s", (_n, v) => {
        if ((v as { afvises?: boolean }).afvises) {
            expect(() => effektivAkse({ med_balancering: false, periode_start: v.start, periode_slut: v.slut }, { start: v.time_start, slut: v.time_end })).toThrow(/UTC/);
            return;
        }
        const a = effektivAkse({ med_balancering: false, periode_start: v.start, periode_slut: v.slut }, { start: v.time_start, slut: v.time_end });
        expect([new Date(a.fra).toISOString().replace(".000Z", "Z"), new Date(a.til).toISOString().replace(".000Z", "Z")]).toEqual([v.foerste, v.sidste]);
    });
});
