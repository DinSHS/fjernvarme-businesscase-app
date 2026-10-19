import { describe, expect, it } from "vitest";
import { opretOgBestilPar, parNavn, type ParAfhængigheder, type ParInput } from "../par";
import { referenceAf } from "../logik";
import { dækningsårsager, rådFor } from "../raad";

function falske(afvisScenarie = 0) {
    const log: string[] = [];
    let n = 0;
    let bestillinger = 0;
    const deps: ParAfhængigheder = {
        opretScenarie: async (f) => { n += 1; log.push(`opret:${f.navn}`); return { id: `00000000-0000-4000-8000-00000000000${n}` }; },
        gemScenarieAendringer: async (id, _e, nye) => { log.push(`ændringer:${id.slice(-1)}:${nye.map((x) => x.sti).join(",")}`); },
        bestilKoersel: async (id, _b, nøgle) => {
            bestillinger += 1;
            log.push(`bestil:${id.slice(-1)}:${nøgle}`);
            if (afvisScenarie && bestillinger === afvisScenarie) return { ok: false, afvist: "Du har allerede 3 ventende kørsler." };
            return { ok: true, koersel_id: `k${bestillinger}` };
        },
    };
    return { deps, log };
}

const input: ParInput = {
    vaerkId: "v1",
    spørgsmål: "Hvad er tanken værd?",
    forklaring: "Slå alle lagre fra.",
    fælles: { periode_start: "2026-01-05", periode_slut: "2026-01-16", mip_rel_gap: 0.0002, mip_abs_gap: 1000, tidsgraense_s: null },
    reference: { felter: { med_balancering: false, balancing_method: null, ekstra_flag: null, heat_csv: null }, aendringer: [] },
    scenarie: { felter: { med_balancering: false, balancing_method: null, ekstra_flag: null, heat_csv: null }, aendringer: [{ type: "disable", sti: "tank_lav" }] },
};

describe("opret og bestil et par", () => {
    it("opretter og bestiller referencen før scenariet, med hver sin nøgle", async () => {
        const { deps, log } = falske();
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", {}, deps);
        expect(svar.ok).toBe(true);
        expect(log).toEqual([
            "opret:Hvad er tanken værd? · reference",
            "bestil:1:N-r",
            "opret:Hvad er tanken værd? · scenarie",
            "ændringer:2:tank_lav",
            "bestil:2:N-s",
        ]);
        expect(svar.tilstand).toMatchObject({ refKoerselId: "k1", scenKoerselId: "k2" });
    });

    it("scenariet peger på referencen med reference_scenarie_id (ikke en tekstlinje)", async () => {
        const oprettede: Record<string, unknown>[] = [];
        const { deps } = falske();
        const opret = deps.opretScenarie;
        deps.opretScenarie = async (f, b) => { oprettede.push(f as unknown as Record<string, unknown>); return opret(f, b); };
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", {}, deps);
        expect(oprettede[1].reference_scenarie_id).toBe(svar.tilstand.refScenarieId);
        expect(referenceAf(oprettede[1].beskrivelse as string)).toBeUndefined();
        expect(oprettede[0].reference_scenarie_id).toBeUndefined();
    });

    it("genbruger en sammenlignelig reference i stedet for at bestille en ny", async () => {
        const { deps, log } = falske();
        const svar = await opretOgBestilPar({ ...input, genbrug: { scenarie_id: "ref-gammel", koersel_id: "k-gammel" } }, "a@b.dk", "N", {}, deps);
        expect(svar.ok).toBe(true);
        expect(log.filter((l) => l.startsWith("bestil"))).toEqual(["bestil:1:N-s"]);
        expect(svar.tilstand).toMatchObject({ refKoerselId: "k-gammel", refGenbrugt: true });
    });

    it("en afvisning returneres ordret, og et nyt forsøg fortsætter uden at oprette igen", async () => {
        const { deps, log } = falske(2);
        const første = await opretOgBestilPar(input, "a@b.dk", "N", {}, deps);
        expect(første.ok).toBe(false);
        if (!første.ok) expect(første.afvist).toMatch(/3 ventende/);
        const før = log.length;
        const andet = await opretOgBestilPar(input, "a@b.dk", "N", første.tilstand, deps);
        expect(andet.ok).toBe(true);
        expect(log.slice(før)).toEqual(["bestil:2:N-s"]);
    });

    it("en netværksfejl midt i (ændringerne) genoptages uden nyt scenarie og uden at miste ændringerne", async () => {
        const { deps, log } = falske();
        const gem = deps.gemScenarieAendringer;
        let første = true;
        deps.gemScenarieAendringer = async (id, e, nye) => {
            if (første) { første = false; throw new Error("netværk"); }
            return gem(id, e, nye);
        };
        const tilstand = {};
        await expect(opretOgBestilPar(input, "a@b.dk", "N", tilstand, deps)).rejects.toThrow("netværk");
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", tilstand, deps);
        expect(svar.ok).toBe(true);
        expect(log.filter((l) => l.startsWith("opret"))).toHaveLength(2);
        expect(log).toContain("ændringer:2:tank_lav");
    });

    it("referencens felter følger knappen, de fælles følger brugeren; null udelades", async () => {
        const set: Record<string, unknown>[] = [];
        const { deps } = falske();
        const opret = deps.opretScenarie;
        deps.opretScenarie = async (f, b) => { set.push(f as unknown as Record<string, unknown>); return opret(f, b); };
        await opretOgBestilPar({ ...input, scenarie: { ...input.scenarie, felter: { ...input.scenarie.felter, med_balancering: true } } }, "a@b.dk", "N", {}, deps);
        expect(set[0]).toMatchObject({ vaerk_id: "v1", med_balancering: false, mip_rel_gap: 0.0002, periode_start: "2026-01-05" });
        expect(set[1]).toMatchObject({ med_balancering: true });
        expect("tidsgraense_s" in set[0]).toBe(false);
        expect("heat_csv" in set[0]).toBe(false);
    });

    it("navnet holdes under 200 tegn", () => {
        expect(parNavn("x".repeat(300), "reference").length).toBeLessThanOrEqual(200);
        expect(parNavn("x".repeat(300), "reference").endsWith(" · reference")).toBe(true);
    });
});

describe("råd ved fejl", () => {
    it("dækningsfejl", () => expect(rådFor("CoverageError: imbalance/DK1: ingen brugbare tidsstempler.")?.tekst).toMatch(/4\. marts 2025/));
    it("dødt hjerteslag", () => expect(rådFor("Arbejderen stoppede uden at afslutte kørslen (intet hjerteslag i 30 minutter)")?.tekst).toMatch(/igen/));
    it("uløselig", () => expect(rådFor("Modellen kan ikke løses (infeasible)")?.kilde).toMatch(/solve\.py/));
    it("ukendt fejl giver intet råd", () => expect(rådFor("noget helt andet")).toBeUndefined());
    it("S7: ved en dækningsfejl vises den årsag, der passer på kørslen", () => {
        const fejl = "CoverageError: imbalance/DK1: ingen brugbare tidsstempler.";
        // Andeby (karup), balancering i januar 2025: kun hullet før 4. marts 2025 — ikke fyn/vestkyst.
        const r = rådFor(fejl, { medBalancering: true, start: "2025-01-06", slut: "2025-01-08", dmi: "karup" })!;
        expect(r.tekst).toMatch(/^Perioden begynder før 4\. marts 2025/);
        expect(r.tekst).not.toMatch(/fyn|vestkyst/);
        // Billund (fyn) hen over 28/2-2026 uden balancering: kun DMI-hullet.
        expect(dækningsårsager({ medBalancering: false, start: "2026-02-20", slut: "2026-03-05", dmi: "fyn" })).toEqual(["DMI-området fyn mangler timer 28. februar 2026."]);
        // Ingen kendt årsag rammer -> det generelle råd.
        expect(rådFor(fejl, { medBalancering: false, start: "2026-03-10", slut: "2026-03-20", dmi: "karup" })?.tekst).toMatch(/df-data opdateres mandage/);
    });
});
