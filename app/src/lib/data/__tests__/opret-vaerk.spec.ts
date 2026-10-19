// @vitest-environment node
//-----------------------------------------------------------------------
// Nyt værk fra bunden (brief 15 B): klientens opdeling (skriv.ts) mod
// backendens samling (rayfin/functions/src/logik.ts) — samme rundtur som i
// drift: N `opret_vaerk_del` + én `opret_vaerk` -> én bladliste.
//-----------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { delNytVaerk, kopierVaerk, opretVaerk, sætSkriveKilde, type NytVaerkBlad } from "../skriv";
import { MAKS } from "../../../../rayfin/data/fjv.constants";
import { læsAnmodning, samlNytVaerk, type OpretVaerkDel } from "../../../../rayfin/functions/src/logik";

// fv-ekspert's minimale gyldige værk (viden/nyt_vaerk_skabelon.json, SKABELON KLAR 11:24) — 67 blade.
const skabelon = JSON.parse(readFileSync(new URL("../../../../../viden/nyt_vaerk_skabelon.json", import.meta.url), "utf8")) as { blade: (NytVaerkBlad & Record<string, unknown>)[] };

/** Et realistisk stort værk: skabelonen + 165 ekstra blade med kommentarer = 232 blade, som Andeby. */
const stortVaerk: NytVaerkBlad[] = [...skabelon.blade, ...Array.from({ length: 165 }, (_, i) => ({
    sti: `meta.noter.n_${i}`, vaerdi_json: JSON.stringify(i * 1.5),
    bekraeft: i % 3 === 0, kommentar: i % 4 === 0 ? `Skønnet værdi nr. ${i} — æøå bevares` : null,
}))];

function samlSomBackend(dele: string[]) {
    const læst = dele.map((d) => læsAnmodning(d));
    for (const l of læst) expect(l.type).toBe("opret_del");
    const ds = læst.map((l) => (l as { del: OpretVaerkDel }).del);
    return samlNytVaerk(ds, ds.length, ds[0].udkast);
}

describe("delNytVaerk -> samlNytVaerk (rundtur)", () => {
    const UDKAST = "11111111-2222-4333-8444-555555555555";

    it("skabelonen kommer uændret igennem: samme stier, værdier, bekræft og kommentarer i samme orden", () => {
        const dele = delNytVaerk(UDKAST, skabelon.blade);
        expect(dele.length).toBeGreaterThanOrEqual(2); // 20 KB-filen kan ikke være i én anmodning
        for (const d of dele) expect(d.length).toBeLessThanOrEqual(MAKS.json);
        const samlet = samlSomBackend(dele);
        expect(samlet.map((b) => [b.sti, b.vaerdi_json, b.bekraeft, b.kommentar])).toEqual(
            skabelon.blade.map((b) => [b.sti, b.vaerdi_json, b.bekraeft === true, b.kommentar || null]),
        );
        expect(samlet.map((b) => b.raekkefoelge)).toEqual(skabelon.blade.map((_, i) => i + 1));
        // Skabelonens hjælpefelter sendes ikke.
        expect(dele.join("")).not.toMatch(/"obligatorisk"|"trin"/);
    });

    it("et værk på Andebys størrelse deles i flere dele, hver under 4000 tegn, og samles helt", () => {
        const dele = delNytVaerk(UDKAST, stortVaerk);
        expect(dele.length).toBeGreaterThan(3);
        for (const d of dele) expect(d.length).toBeLessThanOrEqual(MAKS.json);
        expect(samlSomBackend(dele)).toHaveLength(232);
    });

    it("sætter sektion og objekt som en kopi gør (units/storage/prices har objekt)", () => {
        const s = samlSomBackend(delNytVaerk(UDKAST, skabelon.blade));
        const af = (sti: string) => { const b = s.find((x) => x.sti === sti)!; return [b.sektion, b.objekt]; };
        expect(af("units.gaskedel.type")).toEqual(["units", "gaskedel"]);
        expect(af("prices.natural_gas.value")).toEqual(["prices", "natural_gas"]);
        expect(af("time.start")).toEqual(["time", null]);
    });

    it("afviser et blad, der alene er for stort til én del", () => {
        expect(() => delNytVaerk(UDKAST, [{ sti: "meta.description", vaerdi_json: JSON.stringify("x".repeat(4000)) }])).toThrow(/for stort/);
    });
});

describe("opretVaerk — skrivevejen", () => {
    const lav = () => {
        let n = 0;
        const create = vi.fn(async (r: Record<string, unknown>) => ({ id: `anm-${++n}`, ...r }));
        const invoke = vi.fn(async (...args: unknown[]) => (void args, { ok: true, status: "udfoert", svar: "ok", vaerk_id: "v-ny", revision: 1 }));
        return { create, invoke };
    };
    let { create, invoke } = lav();
    beforeEach(() => {
        ({ create, invoke } = lav());
        const api = { create, update: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) };
        sætSkriveKilde(() => ({ data: { Aendringsanmodning: api }, functions: { udfoerAendring: { invoke } } }));
    });
    afterEach(() => sætSkriveKilde(null));

    it("sender N dele og én afsluttende oprettelse med samme udkast og kalder udfoerAendring på den sidste", async () => {
        const r = await opretVaerk("nyt_vaerk", "Nyt værk", skabelon.blade, "a@b.dk");
        expect(r).toMatchObject({ ok: true, vaerk_id: "v-ny" });
        const rækker = create.mock.calls.map((c) => c[0] as Record<string, unknown>);
        const dele = rækker.slice(0, -1).map((x) => JSON.parse(x.aendringer_json as string)[0]);
        const slut = JSON.parse(rækker.at(-1)!.aendringer_json as string)[0];
        expect(slut).toMatchObject({ handling: "opret_vaerk", ny_kode: "nyt_vaerk", navn: "Nyt værk", dele: dele.length });
        for (const d of dele) expect(d).toMatchObject({ handling: "opret_vaerk_del", udkast: slut.udkast, af: dele.length });
        expect(dele.map((d) => d.nr)).toEqual(dele.map((_, i) => i + 1));
        for (const x of rækker) {
            expect(x).toMatchObject({ vaerk_id: "00000000-0000-0000-0000-000000000000", forventet_revision: 0, anmodet_af: "a@b.dk", status: "ny" });
        }
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(invoke).toHaveBeenCalledWith({ anmodningId: `anm-${rækker.length}` }, expect.anything());
        // Backend kan samle det, klienten sendte.
        expect(samlNytVaerk(dele, slut.dele, slut.udkast)).toHaveLength(skabelon.blade.length);
    });

    it.each([
        ["ugyldig kode", () => opretVaerk("Nyt-Vaerk", "x", skabelon.blade, "a@b.dk"), /små bogstaver/],
        ["intet navn", () => opretVaerk("ny", "  ", skabelon.blade, "a@b.dk"), /navn/],
        ["ingen blade", () => opretVaerk("ny", "Ny", [], "a@b.dk"), /ingen parametre/],
        ["samme sti to gange", () => opretVaerk("ny", "Ny", [skabelon.blade[0], skabelon.blade[0]], "a@b.dk"), /to gange/],
        ["ingen bruger", () => opretVaerk("ny", "Ny", skabelon.blade, undefined), /bruger/],
        ["den reserverede kode nyt (K4-F9)", () => opretVaerk("nyt", "Nyt", skabelon.blade, "a@b.dk"), /reserveret/],
        ["kopi til den reserverede kode nyt (K4-F9)", () => kopierVaerk({ id: "v1", revision: 1 }, "nyt", "Nyt", "a@b.dk"), /reserveret/],
    ])("afviser %s uden at skrive noget", async (_n, kald, tekst) => {
        await expect(kald()).rejects.toThrow(tekst);
        expect(create).not.toHaveBeenCalled();
    });
});
