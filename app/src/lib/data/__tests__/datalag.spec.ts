import { afterEach, describe, expect, it, vi } from "vitest";
import { normaliser, somDato, somTekst } from "../normaliser";
import { FELTER } from "../felter";
import { kodVaerdi, visVaerdi, værditype, Inputfejl } from "../vaerdi";
import { afflad, effektivtInput } from "../afflad";
import { POLL_MS, skalPolle } from "../koersel-status";
import { læs, sætLæseKilde } from "../laes";
import { tælObjekter } from "../hooks";
import { enhedsfarve, seriefarve } from "../../serie-farver";

describe("normaliser — Rayfin-klientens sniffede værdier tilbage til kolonnens type", () => {
    it("laver boolean i en tekstkolonne tilbage til 'true'/'false' (målt: vaerdi_json='true' kom som true)", () => {
        expect(somTekst(true)).toBe("true");
        expect(somTekst(false)).toBe("false");
    });
    it("laver en sniffet dato i en tekstkolonne tilbage til ÅÅÅÅ-MM-DD", () => {
        expect(somTekst(new Date("2026-01-05"))).toBe("2026-01-05");
    });
    it("læser en datokolonne uden zone som UTC, aldrig lokal tid", () => {
        expect(somDato("2026-10-16T06:21:15.328")?.toISOString()).toBe("2026-10-16T06:21:15.328Z");
        expect(somDato("2026-10-16T06:21:15.328Z")?.toISOString()).toBe("2026-10-16T06:21:15.328Z");
        expect(somDato(null)).toBeNull();
    });
    it("normaliserer en hel række efter entitetens feltsæt og gør id'er små", () => {
        const r = normaliser<"Scenarie", Record<string, unknown>>({
            id: "ABC", vaerk_id: "DEF", periode_start: new Date("2026-01-05"), navn: "true", mip_rel_gap: "0.0002", oprettet: "2026-10-16T06:00:00Z",
        }, FELTER.Scenarie);
        expect(r).toMatchObject({ id: "abc", vaerk_id: "def", periode_start: "2026-01-05", navn: "true", mip_rel_gap: 0.0002 });
        expect(r.oprettet).toBeInstanceOf(Date);
    });
});

describe("kodVaerdi — redigering uden at miste typen", () => {
    it.each([
        ["12.0", "13", "13.0"], ["12.0", "12,5", "12.5"], ["12.0", "1e-3", "1e-3"], ["0.0002", ",5", "0.5"],
        ["12", "13", "13"], ["true", "nej", "false"], ["false", "Ja", "true"],
        ['"straw"', "halm", '"halm"'], ['"x"', "true", '"true"'],
        ["[4.4, 4.5]", "[4.4,4.6]", "[4.4,4.6]"], ["null", "", "null"], ["null", "2,0", "2.0"],
    ])("gammel %s + input %s -> %s", (gammel, input, ud) => expect(kodVaerdi(gammel, input)).toBe(ud));

    it.each([["12", "12,5", /helt tal/], ["12.0", "tolv", /ikke et tal/], ["true", "måske", /ja eller nej/], ["[1]", "{", /JSON/], ["[1]", '{"a":1}', /liste/]])(
        "afviser gammel %s + input %s", (gammel, input, tekst) => {
            expect(() => kodVaerdi(gammel, input)).toThrow(Inputfejl);
            expect(() => kodVaerdi(gammel, input)).toThrow(tekst);
        });
    it("gætter typen for en ny parameter", () => {
        expect(kodVaerdi(null, "3")).toBe("3");
        expect(kodVaerdi(null, "3,0")).toBe("3.0");
        expect(kodVaerdi(null, "ja")).toBe("true");
        expect(kodVaerdi(null, "halm")).toBe('"halm"');
    });
    it("læser typen af teksten, ikke af den parsede værdi", () => {
        expect(værditype("12.0")).toBe("decimaltal");
        expect(værditype("12")).toBe("heltal");
        expect(visVaerdi("12.50")).toBe("12,50");
        expect(visVaerdi("true")).toBe("Ja");
        expect(visVaerdi('"1h"')).toBe("1h");
    });
});

describe("afflad og effektivt input", () => {
    it("bygger træet og bevarer tom dict og lister som blade", () => {
        expect(afflad([
            { sti: "units.halmkedel.p_max_heat", vaerdi_json: "12.0" },
            { sti: "units.halmkedel.cop_curve.points", vaerdi_json: '[{"t":-10,"cop":2.1}]' },
            { sti: "balancing", vaerdi_json: "{}" },
        ])).toEqual({ units: { halmkedel: { p_max_heat: 12, cop_curve: { points: [{ t: -10, cop: 2.1 }] } } }, balancing: {} });
    });
    it("afviser en sti under et blad", () => {
        expect(() => afflad([{ sti: "a", vaerdi_json: "1" }, { sti: "a.b", vaerdi_json: "2" }])).toThrow(/under bladet/);
    });
    it("lader ændringer overskrive værket og holder _koersel.* ude af casen", () => {
        const { blade, flag } = effektivtInput([
            { kilde: "vaerk", sti: "prices.straw.value", vaerdi_json: "45.0" },
            { kilde: "aendring", sti: "prices.straw.value", vaerdi_json: "50.0" },
            { kilde: "scenarie", sti: "_koersel.start", vaerdi_json: '"2026-01-05"' },
        ]);
        expect(blade.get("prices.straw.value")).toEqual({ vaerdi_json: "50.0", kilde: "aendring", vaerk_json: "45.0" });
        expect(flag.get("start")).toBe('"2026-01-05"');
        expect(blade.has("_koersel.start")).toBe(false);
    });
});

describe("seriefarver", () => {
    it("tildeler deterministisk efter alfabetisk orden og cykler aldrig", () => {
        const alle = ["vp", "gaskedel", "halmkedel"];
        expect(enhedsfarve("gaskedel", alle)).toBe("var(--fjv-serie-1)");
        expect(enhedsfarve("vp", ["halmkedel", "vp", "gaskedel"])).toBe("var(--fjv-serie-3)");
        expect(seriefarve(9)).toBe("var(--fjv-serie-0)");
        expect(enhedsfarve("ukendt", alle)).toBe("var(--fjv-serie-0)");
    });
});

describe("tælObjekter", () => {
    it("tæller enheder og lagre pr. værk; manglende enabled = til, false = fra", () => {
        const b = (vaerk_id: string, sti: string, vaerdi_json = "1.0") => {
            const [sektion, objekt] = sti.split(".");
            return { vaerk_id, sektion, objekt, sti, vaerdi_json };
        };
        const m = tælObjekter([
            b("v1", "units.halm.p_max_heat"), b("v1", "units.halm.enabled", "true"),
            b("v1", "units.elkedel.enabled", "false"), b("v1", "units.vp.p_max_heat"),
            b("v1", "storage.tank.e_max_mwh"), b("v1", "prices.straw.value"),
            b("v2", "storage.tank.enabled", "false"),
        ]);
        expect(m.get("v1")).toEqual({ enheder: 3, enhederTil: 2, lagre: 1, lagreTil: 1 });
        expect(m.get("v2")).toEqual({ enheder: 0, enhederTil: 0, lagre: 1, lagreTil: 0 });
    });
});

describe("skalPolle — KONTRAKT §6 (databasen må sove)", () => {
    const t0 = 1_000_000;
    it("poller kun når en kørsel er aktiv, fanen er synlig og der er gået 20 s", () => {
        expect(skalPolle(["koerer"], true, t0, t0 + POLL_MS)).toBe(true);
        expect(skalPolle(["koerer"], true, t0, t0 + POLL_MS - 1)).toBe(false);
        expect(skalPolle(["koerer"], false, t0, t0 + 10 * POLL_MS)).toBe(false);
        expect(skalPolle(["faerdig", "fejl", "annulleret"], true, t0, t0 + 10 * POLL_MS)).toBe(false);
        expect(skalPolle([], true, t0, t0 + 10 * POLL_MS)).toBe(false);
    });
    it("tæller koe, startet, koerer og indlaeser som aktive", () => {
        for (const s of ["koe", "startet", "koerer", "indlaeser"]) expect(skalPolle([s], true, t0, t0 + POLL_MS)).toBe(true);
    });
});

describe("læs — paginering og normalisering", () => {
    afterEach(() => sætLæseKilde(null));

    function falskKilde(sider: Record<string, unknown>[][]) {
        const kald: { first?: number; after?: string; where?: unknown; order?: unknown }[] = [];
        const q = (state: { first?: number; after?: string; where?: unknown; order?: unknown }) => ({
            where: (w: unknown) => q({ ...state, where: w }),
            orderBy: (o: unknown) => q({ ...state, order: o }),
            first: (n: number) => q({ ...state, first: n }),
            after: (a: string) => q({ ...state, after: a }),
            executePaginated: async () => {
                kald.push(state);
                const i = state.after ? Number(state.after) : 0;
                return { items: sider[i], hasNextPage: i + 1 < sider.length, endCursor: String(i + 1) };
            },
        });
        sætLæseKilde(() => ({ data: { KoerselInput: { select: vi.fn(() => q({})) } } }));
        return kald;
    }

    it("henter alle sider, sender filter og sortering videre, og normaliserer rækkerne", async () => {
        const kald = falskKilde([
            [{ id: "A", koersel_id: "K", kilde: "vaerk", sti: "units.x.enabled", vaerdi_json: true }],
            [{ id: "B", koersel_id: "K", kilde: "aendring", sti: "_koersel.start", vaerdi_json: '"2026-01-05"' }],
        ]);
        const r = await læs("KoerselInput", { filter: { koersel_id: { eq: "k" } }, sortering: { sti: "asc" } });
        expect(r).toHaveLength(2);
        expect(r[0].vaerdi_json).toBe("true");
        expect(r[0].id).toBe("a");
        expect(kald).toHaveLength(2);
        expect(kald[1].after).toBe("1");
        expect(kald[0].where).toEqual({ koersel_id: { eq: "k" } });
        expect(kald[0].order).toEqual({ sti: "asc" });
    });
});
