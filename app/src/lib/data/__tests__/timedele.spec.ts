// Runde 14b: et bredt værks interval står i KoerselTime + KoerselTimeDel (skemaversion 2). Læsevejen sætter dem
// sammen, så resten af appen (dispatchkortet, balancen i vinduet, arkivet) ser én vaerdier_json pr. interval -
// tegn for tegn som modellens fil - og spørger kun efter delene, når kørslens manifest siger, at de findes.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sætLæseKilde } from "../laes";
import { fletTimedele, læsTimer, timedeleAntal, timekolonner } from "../timedele";

const VEKTOR = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../../fabric/tests/data/bred_40el/timedele_vektor.json"), "utf8")) as {
    time: { tid: string; vaerdier_json: string };
    dele: { tid: string; delnr: number; vaerdier_json: string }[];
    hel: string;
};

const T1 = new Date("2026-01-05T01:00:00Z");
const T2 = new Date("2026-01-05T02:00:00Z");
const time = (tid: Date, vaerdier_json: string) => ({ id: `t${tid.getTime()}`, koersel_id: "k", tid, varmelast_mw: 1, spotpris: null, t_ude: null, vaerdier_json });
const del = (tid: Date, delnr: number, vaerdier_json: string) => ({ id: `d${tid.getTime()}-${delnr}`, koersel_id: "k", tid, delnr, vaerdier_json });

describe("timedeleAntal — manifest_json.time_dele", () => {
    it("er 0 for smalle kørsler, kørsler fra før runde 14b og et manifest, der ikke kan læses", () => {
        expect(timedeleAntal(null)).toBe(0);
        expect(timedeleAntal(undefined)).toBe(0);
        expect(timedeleAntal('{"schema_version":"1"}')).toBe(0);
        expect(timedeleAntal("{ikke json")).toBe(0);
        expect(timedeleAntal('{"time_dele":"3"}')).toBe(0);
    });
    it("er antallet for et bredt værk", () => expect(timedeleAntal('{"time_dele":311}')).toBe(311));
});

describe("fletTimedele", () => {
    it("sætter skriverens dele sammen til PRÆCIS modellens tekst (vektoren fra fjv.resultater, 40 elenheder)", () => {
        const tid = new Date(VEKTOR.time.tid);
        const [r] = fletTimedele([time(tid, VEKTOR.time.vaerdier_json)], [...VEKTOR.dele].reverse().map((d) => del(tid, d.delnr, d.vaerdier_json)));
        expect(VEKTOR.dele.length).toBeGreaterThan(3);
        expect(r.vaerdier_json).toBe(VEKTOR.hel);                        // tekst, ikke kun værdi: -0.0 og 17 cifre
        expect(VEKTOR.time.vaerdier_json.length).toBeLessThanOrEqual(4000);
        expect(VEKTOR.hel.length).toBeGreaterThan(4000);
    });

    it("rører ikke et interval uden dele og bevarer rækkefølgen", () => {
        const a = time(T1, '{"a":1.0}');
        const b = time(T2, '{"x":2.0}');
        const ud = fletTimedele([a, b], [del(T1, 2, '{"c":null}'), del(T1, 1, '{"b":-0.0}')]);
        expect(ud.map((r) => r.vaerdier_json)).toEqual(['{"a":1.0,"b":-0.0,"c":null}', '{"x":2.0}']);
        expect(ud[1]).toBe(b);
        expect(Object.keys(JSON.parse(ud[0].vaerdier_json))).toEqual(["a", "b", "c"]);
    });

    it("afviser et hul i delene i stedet for at vise et halvt interval", () => {
        expect(() => fletTimedele([time(T1, '{"a":1.0}')], [del(T1, 1, '{"b":1.0}'), del(T1, 3, '{"d":1.0}')]))
            .toThrow(/2026-01-05T01:00:00.000Z.*del 2 mangler/);
    });
    it("afviser en del uden sit interval og en del, der ikke er et JSON-objekt", () => {
        expect(() => fletTimedele([time(T1, '{"a":1.0}')], [del(T2, 1, '{"b":1.0}')])).toThrow(/uden sit interval/);
        expect(() => fletTimedele([time(T1, '{"a":1.0}')], [del(T1, 1, "[1.0]")])).toThrow(/ikke et JSON-objekt/);
    });
});

describe("antal kolonner pr. time (Codex, runde 14-review): en manglende SIDSTE del eller alle dele opdages", () => {
    const tid = new Date(VEKTOR.time.tid);
    const n = Object.keys(JSON.parse(VEKTOR.hel)).length;
    const dele = VEKTOR.dele.map((d) => del(tid, d.delnr, d.vaerdier_json));

    it("manifestets time_kolonner læses; uden den (smalle og ældre kørsler) er der intet at kræve", () => {
        expect(timekolonner(`{"time_dele":5,"time_kolonner":${n}}`)).toBe(n);
        expect(timekolonner('{"time_dele":5}')).toBeNull();
        expect(timekolonner(null)).toBeNull();
    });
    it("en hel time består", () => {
        expect(fletTimedele([time(tid, VEKTOR.time.vaerdier_json)], dele, n)[0].vaerdier_json).toBe(VEKTOR.hel);
    });
    it("uden sin sidste del afvises timen (før blev den læst kortere uden fejl)", () => {
        expect(() => fletTimedele([time(tid, VEKTOR.time.vaerdier_json)], dele.slice(0, -1), n))
            .toThrow(/2026-01-05T16:00:00.000Z.*ufuldstændige.*kolonner/);
    });
    it("uden alle sine dele afvises timen", () => {
        expect(() => fletTimedele([time(tid, VEKTOR.time.vaerdier_json)], [], n)).toThrow(/ufuldstændige/);
        // ... også når en ANDEN time i vinduet har sine dele (så fletningen ikke springes over).
        expect(() => fletTimedele([time(T1, '{"a":1.0}'), time(T2, '{"a":1.0}')], [del(T1, 1, '{"b":2.0}')], 2))
            .toThrow(/2026-01-05T02:00:00.000Z.*ufuldstændige/);
    });
});

describe("læsTimer — spørger kun efter KoerselTimeDel, når manifestet siger, at de findes", () => {
    afterEach(() => sætLæseKilde(null));

    function falskKilde(rækker: Record<string, Record<string, unknown>[]>) {
        const spurgt: string[] = [];
        const kilde = (navn: string) => ({
            select: vi.fn(() => {
                spurgt.push(navn);
                const q = { where: () => q, orderBy: () => q, first: () => q, after: () => q,
                    executePaginated: async () => ({ items: rækker[navn] ?? [], hasNextPage: false, endCursor: null }) };
                return q;
            }),
        });
        sætLæseKilde(() => ({ data: { KoerselTime: kilde("KoerselTime"), KoerselTimeDel: kilde("KoerselTimeDel") } }));
        return spurgt;
    }

    it("et smalt værk (og en database fra før skemaversion 2) læser kun KoerselTime", async () => {
        const spurgt = falskKilde({ KoerselTime: [time(T1, '{"a":1.0}')] });
        const r = await læsTimer({ id: "k", manifest_json: '{"schema_version":"1"}' }, T1, T2);
        expect(spurgt).toEqual(["KoerselTime"]);
        expect(r[0].vaerdier_json).toBe('{"a":1.0}');
    });

    it("et bredt værk får delene sat sammen", async () => {
        const spurgt = falskKilde({
            KoerselTime: [time(T1, '{"a":1.0}')],
            KoerselTimeDel: [del(T1, 1, '{"b":-0.0}')],
        });
        const r = await læsTimer({ id: "k", manifest_json: '{"time_dele":1}' }, T1, T2);
        expect(spurgt).toEqual(["KoerselTime", "KoerselTimeDel"]);
        expect(r[0].vaerdier_json).toBe('{"a":1.0,"b":-0.0}');
    });

    it("kræver manifestets antal kolonner pr. time i vinduet", async () => {
        falskKilde({ KoerselTime: [time(T1, '{"a":1.0}')], KoerselTimeDel: [del(T1, 1, '{"b":-0.0}')] });
        expect((await læsTimer({ id: "k", manifest_json: '{"time_dele":2,"time_kolonner":2}' }, T1, T2))[0].vaerdier_json).toBe('{"a":1.0,"b":-0.0}');
        await expect(læsTimer({ id: "k", manifest_json: '{"time_dele":2,"time_kolonner":3}' }, T1, T2)).rejects.toThrow(/2 af 3 kolonner/);
    });
});
