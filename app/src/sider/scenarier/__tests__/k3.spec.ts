//-----------------------------------------------------------------------
// Codex K3 (udviklingsrapport), fund N4 og N5 — skrevet FØR rettelsen.
//-----------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import * as logik from "../logik";
import { forventetFrosset, knapStatus, objekter, tjekÆndringer, type Blade, type Scenariefelter } from "../logik";
import { opretOgBestilPar, type ParAfhængigheder, type ParInput } from "../par";
import { KNAPPER } from "../viden.data";
import { VAERKER } from "./vaerker.testdata";

/** Billund uden de valgfrie `enabled: true`-blade — modellens standard er enabled=True (src/config.py:513, :568). */
function billundUdenEnabled(): Blade {
    return new Map(Object.entries(VAERKER.billund_spora).filter(([sti, v]) => !(/^(units|storage)\.[^.]+\.enabled$/.test(sti) && v.trim() === "true")));
}

describe("N5: enheder og lagre uden enabled-blad findes stadig (standard = til)", () => {
    const b = billundUdenEnabled();

    it("fixturen har faktisk mistet bladene", () => {
        expect(b.has("units.halmkedel.enabled")).toBe(false);
        expect(b.has("units.halmkedel.p_max_heat")).toBe(true);
    });

    it("objekter() finder halmkedel og tanken som tændte", () => {
        const o = objekter(b);
        expect(o.find((x) => x.navn === "halmkedel")).toEqual({ navn: "halmkedel", slags: "units", til: true });
        expect(o.find((x) => x.navn === "tank_eksisterende")).toEqual({ navn: "tank_eksisterende", slags: "storage", til: true });
        // En enhed, der står med enabled: false, er stadig slukket.
        expect(o.find((x) => x.navn === "elkedel_ny")?.til).toBe(false);
    });

    it("disable halmkedel accepteres og fryses som units.halmkedel.enabled = false (som backenden)", () => {
        expect(tjekÆndringer([{ type: "disable", sti: "halmkedel" }], b)).toEqual([]);
        const felter: Scenariefelter = { periode_start: null, periode_slut: null, med_balancering: false, balancing_method: null, mip_rel_gap: null, mip_abs_gap: null, tidsgraense_s: null, ekstra_flag: null, heat_csv: null };
        expect(forventetFrosset([{ type: "disable", sti: "halmkedel" }], felter, b).get("units.halmkedel.enabled")).toBe("false");
    });

    it("knapperne om tanken og enheder er stadig tilgængelige", () => {
        for (const id of ["tankens_vaerdi", "tankstoerrelse", "enhedens_vaerdi"]) {
            const k = KNAPPER.find((x) => x.id === id)!;
            expect(knapStatus(k, b, "billund_spora").mulig, id).toBe(true);
        }
    });

    it("samme navn som både enhed og lager afvises (som backenden)", () => {
        const m = new Map(b);
        m.set("storage.halmkedel.volume_m3", "100.0");
        const f = tjekÆndringer([{ type: "disable", sti: "halmkedel" }], m);
        expect(f.some((x) => x.niveau === "fejl" && /både som enhed og som lager/.test(x.tekst))).toBe(true);
    });
});

describe("N4: genbrug af reference kræver Motorens aktuelle pins", () => {
    const pinsPasser = (logik as unknown as { pinsPasser?: (nye: { model?: string; data?: string } | undefined, k: { model?: string; data?: string }) => boolean }).pinsPasser;

    it("findes", () => expect(typeof pinsPasser).toBe("function"));

    it("Motor på D2, kandidaten på D1 -> ikke genbrug", () => {
        expect(pinsPasser!({ model: "M", data: "D2" }, { model: "M", data: "D1" })).toBe(false);
    });
    it("en kandidat, der mangler en pin, kan ikke genbruges", () => {
        expect(pinsPasser!({ model: "M", data: "D2" }, { model: "M" })).toBe(false);
        expect(pinsPasser!({ model: "M", data: "D2" }, { data: "D2" })).toBe(false);
    });
    it("ukendte Motor-pins -> ikke genbrug", () => {
        expect(pinsPasser!(undefined, { model: "M", data: "D2" })).toBe(false);
        expect(pinsPasser!({ model: "M" }, { model: "M", data: "D2" })).toBe(false);
    });
    it("ens pins -> genbrug", () => {
        expect(pinsPasser!({ model: "M", data: "D2" }, { model: "M", data: "D2" })).toBe(true);
    });

    it("skiftede Motor mellem visning og bestilling, bestilles en ny reference, og scenariet peger på den", async () => {
        const log: string[] = [];
        let n = 0;
        const deps: ParAfhængigheder = {
            opretScenarie: async (f) => { n += 1; log.push(`opret:${f.navn}`); return { id: `00000000-0000-4000-8000-00000000000${n}` }; },
            gemScenarieAendringer: async () => {},
            bestilKoersel: async (id, _b, nøgle) => { log.push(`bestil:${nøgle}`); return { ok: true, koersel_id: `k-${nøgle}` }; },
            // Den bestilte scenariekørsel fik D2 frosset — referencen, der blev vist, var D1.
            frosnePins: async () => ({ model: "M", data: "D2" }),
            sætReference: async (id, ref) => { log.push(`reference:${id.slice(-1)}->${ref.slice(-1)}`); },
        } as ParAfhængigheder;
        const input: ParInput = {
            vaerkId: "v1", spørgsmål: "Hvad er tanken værd?", forklaring: "x",
            fælles: { periode_start: "2026-01-05", periode_slut: "2026-01-16", mip_rel_gap: 0.0002, mip_abs_gap: 100, tidsgraense_s: null },
            reference: { felter: { med_balancering: false, balancing_method: null, ekstra_flag: null, heat_csv: null }, aendringer: [] },
            scenarie: { felter: { med_balancering: false, balancing_method: null, ekstra_flag: null, heat_csv: null }, aendringer: [{ type: "disable", sti: "tank_lav" }] },
            genbrug: { scenarie_id: "gammel-ref", koersel_id: "k-gammel", pins: { model: "M", data: "D1" } },
        } as ParInput;
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", {}, deps);
        expect(svar.ok).toBe(true);
        expect(log).toEqual([
            "opret:Hvad er tanken værd? · scenarie",
            "bestil:N-s",
            "opret:Hvad er tanken værd? · reference",
            "bestil:N-r",
            "reference:1->2",
        ]);
        expect(svar.tilstand.refGenbrugt).toBe(false);
        expect(svar.tilstand.refKoerselId).toBe("k-N-r");
    });

    it("var pins uændrede, genbruges referencen", async () => {
        const log: string[] = [];
        const deps = {
            opretScenarie: async () => ({ id: "00000000-0000-4000-8000-000000000001" }),
            gemScenarieAendringer: async () => {},
            bestilKoersel: async (_id: string, _b: unknown, nøgle: string) => { log.push(`bestil:${nøgle}`); return { ok: true, koersel_id: `k-${nøgle}` }; },
            frosnePins: async () => ({ model: "M", data: "D1" }),
            sætReference: async () => { log.push("reference"); },
        } as unknown as ParAfhængigheder;
        const input = {
            vaerkId: "v1", spørgsmål: "q", forklaring: "x",
            fælles: { periode_start: null, periode_slut: null, mip_rel_gap: 0.0002, mip_abs_gap: 100, tidsgraense_s: null },
            reference: { felter: { med_balancering: false, balancing_method: null, ekstra_flag: null, heat_csv: null }, aendringer: [] },
            scenarie: { felter: { med_balancering: true, balancing_method: null, ekstra_flag: null, heat_csv: null }, aendringer: [] },
            genbrug: { scenarie_id: "gammel-ref", koersel_id: "k-gammel", pins: { model: "M", data: "D1" } },
        } as ParInput;
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", {}, deps);
        expect(log).toEqual(["bestil:N-s"]);
        expect(svar.tilstand).toMatchObject({ refGenbrugt: true, refKoerselId: "k-gammel" });
    });
});
