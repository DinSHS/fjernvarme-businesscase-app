// Runde 15, fund 3.2 (den uafhængige test 18. november 2026): "Afviste bestillinger efterlader scenarier." Når
// startBestilling afviste (fx "Solprofilen … mangler 48 af periodens 48 timer" for januar 2027), var Scenarie og
// Bestilling allerede oprettet; to forsøg gav to scenarier, der stod som "ikke kørt" og ikke kunne skelnes fra de
// rigtige. Genskabt FØR rettelsen:
//  * klienten tjekkede kun VARMELASTENS dækning før bestilling — solprofilens blev først opdaget af backenden;
//  * parflowet lod de scenarier stå, det selv havde oprettet, når bestillingen blev afvist.
// Efter rettelsen: (1) solprofilens dækning tjekkes med backendens regel, FØR en række oprettes; (2) bliver en
// bestilling alligevel afvist, arkiverer parflowet de scenarier, det oprettede i samme handling (sletning er bevidst
// ikke tilladt for Scenarie, KONTRAKT §3.4); (3) den betroede logik fjerner den afviste Bestilling (begge udgaver;
// testet i community/fjernvarme_app/logik/tests/test_tjenester.py).
import { afterEach, describe, expect, it } from "vitest";
import { bestilKoersel, sætSkriveKilde, type SkriveKilde } from "@/lib/data/skriv";
import { KildeFejl } from "@/lib/data/kilde";
import { Afvisning, bygFrossetInput, type TidsserieRad } from "../../../../rayfin/functions/src/logik";
import type { Blade, Scenariefelter } from "../logik";
import { opretOgBestilPar, type ParAfhængigheder, type ParInput } from "../par";
import { tjekSolprofil, type TidsserieInfo } from "../varmelast";
import { VAERKER } from "./vaerker.testdata";

// Andeby som et værk fra værksarket: solprofilen er en tidsserie (markøren i production_profile_path).
const blade: Blade = new Map(Object.entries({ ...VAERKER.andeby, "units.solvarme.production_profile_path": "\"tidsserie:solprofil\"" }));
const SOL = {
    id: "44444444-4444-4444-8444-444444444444", rolle: "solprofil" as const, navn: "Andeby sol 2025–26", sha256: "d".repeat(64),
    sti: "Files/fjv/tidsserier/andeby/sol.csv", oploesning: "1h", start: "2025-07-01T00:00:00Z", slut: "2026-06-30T23:00:00Z", status: "gyldig", aktiv: true,
};
const felter = (start: string | null, slut: string | null): Scenariefelter => ({
    periode_start: start, periode_slut: slut, med_balancering: false, balancing_method: null, mip_rel_gap: 0.0002, mip_abs_gap: 100,
    tidsgraense_s: null, ekstra_flag: null, heat_csv: null,
});
const params = [...blade].map(([sti, vaerdi_json]) => ({ sti, vaerdi_json }));
const rad = (s: typeof SOL): TidsserieRad => ({ id: s.id, rolle: s.rolle, navn: s.navn, sha256: s.sha256, sti: s.sti, oploesning: s.oploesning, start: s.start, slut: s.slut, aktiv: s.aktiv });
/** Backendens dom over samme scenarie: afvisningsteksten, eller null når det fryses. */
function backend(f: Scenariefelter, serier: (typeof SOL)[] = [SOL]): string | null {
    try { bygFrossetInput(params, [], f, {}, serier.map(rad)); return null; } catch (e) { if (e instanceof Afvisning) return e.message; throw e; }
}

describe("3.2 (1): solprofilens dækning tjekkes, før noget oprettes — med backendens regel", () => {
    it("testrapportens tilfælde, 5.–6. januar 2027: klienten blokerer med samme tal, som backenden afviser med", () => {
        const f = felter("2027-01-05", "2027-01-06");
        expect(backend(f)).toBe('Solprofilen "Andeby sol 2025–26" mangler 48 af periodens 48 timer (2025-07-01–2026-06-30); modellen nulfylder ikke en solprofil.');
        const fund = tjekSolprofil([], f.heat_csv, [SOL as TidsserieInfo], { start: f.periode_start, slut: f.periode_slut }, blade);
        expect(fund.map((x) => x.niveau)).toEqual(["fejl"]);
        expect(fund[0].tekst).toContain('Solprofilen "Andeby sol 2025–26" mangler 48 af periodens 48 timer');
    });
    it("perioden rager ud over profilens slut (29. juni–2. juli 2026): 48 af 96 timer mangler, begge steder", () => {
        const f = felter("2026-06-29", "2026-07-02");
        expect(backend(f)).toContain("mangler 48 af periodens 96 timer");
        expect(tjekSolprofil([], null, [SOL as TidsserieInfo], { start: f.periode_start, slut: f.periode_slut }, blade)[0].tekst).toContain("mangler 48 af periodens 96 timer");
    });
    it("en dækket periode giver ingen fejl — hverken i klienten eller i backenden", () => {
        const f = felter("2026-01-05", "2026-01-16");
        expect(backend(f)).toBeNull();
        expect(tjekSolprofil([], null, [SOL as TidsserieInfo], { start: f.periode_start, slut: f.periode_slut }, blade)).toEqual([]);
    });
    it("værket bruger en solprofil-tidsserie, men ingen er aktiv: fejl begge steder", () => {
        const f = felter("2026-01-05", "2026-01-16");
        expect(backend(f, [{ ...SOL, aktiv: false }])).toContain("ingen er aktiv eller valgt");
        expect(tjekSolprofil([], null, [{ ...SOL, aktiv: false } as TidsserieInfo], { start: f.periode_start, slut: f.periode_slut }, blade).map((x) => x.niveau)).toEqual(["fejl"]);
    });
    it("et værk med solprofilen som fil i modelrepoet har ingen tidsserie at tjekke", () => {
        expect(tjekSolprofil([], null, [], { start: "2027-01-05", slut: "2027-01-06" }, new Map(Object.entries(VAERKER.andeby)))).toEqual([]);
    });
    it("huller inde i profilen kender klienten kun antallet af: en advarsel, ikke en falsk blokering", () => {
        const fund = tjekSolprofil([], null, [{ ...SOL, antal_huller: 2 } as TidsserieInfo], { start: "2026-01-05", slut: "2026-01-16" }, blade);
        expect(fund.map((x) => x.niveau)).toEqual(["advarsel"]);
    });
});

/**
 * `afvis` giver afvisningens tekst; svaret er en ENDELIG afvisning, hvor serveren har ryddet bestillingen
 * (`ryddet: true`) — det eneste svar, der må få parflowet til at arkivere (kodegennemgangen af runde 15, fund 3).
 */
function falske(afvis: (scenarieId: string, nr: number) => string | null, art: { ryddet?: boolean; teknisk?: boolean } = { ryddet: true }) {
    const scenarier = new Map<string, { navn: string; arkiveret: boolean }>();
    let n = 0, bestillinger = 0;
    const kald: { scenarieId: string; nøgle: string }[] = [];
    const deps: ParAfhængigheder = {
        opretScenarie: async (f) => { n += 1; const id = `s${n}`; scenarier.set(id, { navn: (f as { navn: string }).navn, arkiveret: false }); return { id }; },
        gemScenarieAendringer: async () => {},
        bestilKoersel: async (id, _bruger, nøgle) => {
            bestillinger += 1;
            const afvist = afvis(id, bestillinger);
            kald.push({ scenarieId: id, nøgle });
            return afvist ? { ok: false, afvist, ...art } : { ok: true, koersel_id: `k${bestillinger}` };
        },
        arkivérScenarie: async (id) => { scenarier.get(id)!.arkiveret = true; },
    };
    const synlige = () => [...scenarier].filter(([, s]) => !s.arkiveret).map(([id]) => id);
    return { deps, scenarier, synlige, kald };
}
const input: ParInput = {
    vaerkId: "v1", spørgsmål: "Hvad er tanken værd?", forklaring: "Slå alle lagre fra.",
    fælles: { periode_start: "2027-01-05", periode_slut: "2027-01-06", mip_rel_gap: 0.0002, mip_abs_gap: 100, tidsgraense_s: null },
    reference: { felter: { med_balancering: false, balancing_method: null, ekstra_flag: null, heat_csv: null }, aendringer: [] },
    scenarie: { felter: { med_balancering: false, balancing_method: null, ekstra_flag: null, heat_csv: null }, aendringer: [{ type: "disable", sti: "tank_lav" }] },
};
const SOLAFVIST = 'Solprofilen "Andeby sol 2025–26" mangler 48 af periodens 48 timer (2025-07-01–2026-06-30); modellen nulfylder ikke en solprofil.';

describe("3.2 (2): en afvist bestilling efterlader intet synligt scenarie", () => {
    it("referencens bestilling afvises: scenariet, parflowet netop oprettede, arkiveres — og to forsøg giver ikke to", async () => {
        const f = falske(() => SOLAFVIST);
        const tilstand = {};
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", tilstand, f.deps);
        expect(svar.ok).toBe(false);
        expect(f.synlige()).toEqual([]);                    // før: ["s1"] — stod som "ikke kørt" under Scenarier
        expect(svar.tilstand.refScenarieId).toBeUndefined();
        await opretOgBestilPar(input, "a@b.dk", "N", tilstand, f.deps);
        expect(f.synlige()).toEqual([]);                    // før: to forsøg = to scenarier
    });
    it("referencen bestilles, scenariets bestilling afvises: kun scenariets scenarie arkiveres; referencen har en kørsel og bliver", async () => {
        const f = falske((_id, nr) => (nr === 2 ? "Du har allerede 3 kørsler i kø; højst 3 ad gangen. Vent til en er færdig, eller annullér en." : null));
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", {}, f.deps);
        expect(svar.ok).toBe(false);
        expect(f.synlige()).toEqual(["s1"]);
        expect(svar.tilstand).toMatchObject({ refScenarieId: "s1", refKoerselId: "k1" });
        expect(svar.tilstand.scenScenarieId).toBeUndefined();
    });
    it("'Prøv igen' efter en afvisning opretter scenariet på ny og bestiller det — referencen genbruges", async () => {
        let afvis = true;
        const f = falske((_id, nr) => (afvis && nr === 2 ? "Du har allerede 3 kørsler i kø." : null));
        const tilstand = {};
        await opretOgBestilPar(input, "a@b.dk", "N", tilstand, f.deps);
        afvis = false;
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", tilstand, f.deps);
        expect(svar.ok).toBe(true);
        expect(f.synlige()).toEqual(["s1", "s3"]);          // s2 (det afviste) er arkiveret
        expect(svar.tilstand).toMatchObject({ refScenarieId: "s1", scenScenarieId: "s3" });
    });
    it("en GENBRUGT reference er ikke parflowets: den arkiveres aldrig", async () => {
        const f = falske(() => "Du har allerede 3 kørsler i kø.");
        f.scenarier.set("ref-gammel", { navn: "gammel reference", arkiveret: false });
        const svar = await opretOgBestilPar({ ...input, genbrug: { scenarie_id: "ref-gammel", koersel_id: "k-gammel" } }, "a@b.dk", "N", {}, f.deps);
        expect(svar.ok).toBe(false);
        expect(f.synlige()).toEqual(["ref-gammel"]);
        expect(svar.tilstand.refScenarieId).toBe("ref-gammel");
    });
});

// Kodegennemgangen af runde 15, fund 3 (P2): "Et teknisk Fabric-svar kan blokere genforsøg og skabe et nyt tomt
// scenarie." Fabric svarede også tekniske fejl som `ok: false` med en `afvist`-tekst, og den oprindelige Bestilling
// blev stående. Parflowet arkiverede alligevel scenariet og glemte det; "Prøv igen" oprettede et NYT scenarie, den
// samme klientnøgle ramte den gamle bestilling, skrivehjælperen kastede "Bestillingen er allerede sendt", og det nye
// scenarie stod tilbage som ukørt. Efter rettelsen skelner svaret: kun en endelig afvisning, som serveren har ryddet
// (`ryddet: true`), arkiverer; ellers beholdes scenariet, og "Prøv igen" genoptager den EKSISTERENDE bestilling.
describe("gennemgangens fund 3: kun en endelig, ryddet afvisning arkiverer — ellers genoptages bestillingen", () => {
    it("teknisk fejl: scenariet bliver stående, og 'Prøv igen' bruger samme scenarie og samme klientnøgle", async () => {
        const f = falske(() => "Teknisk fejl i startBestilling: forbindelsen døde", { teknisk: true });
        const tilstand = {};
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", tilstand, f.deps);
        expect(svar.ok).toBe(false);
        expect(f.synlige()).toEqual(["s1"]);                 // før: [] — arkiveret på en teknisk fejl
        expect(svar.tilstand.refScenarieId).toBe("s1");      // før: undefined — glemt, så næste forsøg lavede et nyt
        await opretOgBestilPar(input, "a@b.dk", "N", tilstand, f.deps);
        expect([...f.scenarier.keys()]).toEqual(["s1"]);     // før: s1 og s2
        expect(f.kald).toEqual([{ scenarieId: "s1", nøgle: "N-r" }, { scenarieId: "s1", nøgle: "N-r" }]);
    });
    it("endelig afvisning, men bestillingen står (Fabric-udgaven sletter ikke): heller ingen arkivering", async () => {
        const f = falske(() => "Du har allerede 3 kørsler i kø.", {});
        const tilstand = {};
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", tilstand, f.deps);
        expect(svar.ok).toBe(false);
        expect(svar.ok === false && svar.afvist).toBe("Referencen blev ikke bestilt: Du har allerede 3 kørsler i kø.");
        expect(f.synlige()).toEqual(["s1"]);
        expect(svar.tilstand.refScenarieId).toBe("s1");
    });
    it("endelig afvisning, ryddet af serveren: scenariet arkiveres og glemmes (som fund 3.2 ville)", async () => {
        const f = falske(() => SOLAFVIST, { ryddet: true });
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", {}, f.deps);
        expect(f.synlige()).toEqual([]);
        expect(svar.tilstand.refScenarieId).toBeUndefined();
    });
});

/**
 * Gennemgangens egen genskabelse: den FAKTISKE `opretOgBestilPar` og den faktiske `bestilKoersel` mod et lager,
 * der — som databasen — bevarer bestillingen og dens unikke klientnøgle, når startBestilling svarer med en fejl.
 */
function lager(svar: (nr: number, bestillingId: string) => Record<string, unknown>) {
    const bestillinger: { id: string; scenarie_id: string; klient_noegle: string; bestilt_af: string }[] = [];
    const startet: string[] = [];
    const ingen = async () => ({});
    const kilde: SkriveKilde = {
        data: {
            Bestilling: {
                create: async (r: { scenarie_id: string; klient_noegle: string; bestilt_af: string }) => {
                    if (bestillinger.some((b) => b.klient_noegle === r.klient_noegle)) throw new KildeFejl("unik", "Findes allerede (samme nøgle).", 409);
                    const b = { id: `b${bestillinger.length + 1}`, scenarie_id: r.scenarie_id, klient_noegle: r.klient_noegle, bestilt_af: r.bestilt_af };
                    bestillinger.push(b);
                    return b;
                },
                update: ingen, delete: ingen,
                select: () => {
                    let filter: { klient_noegle?: { eq: string } } = {};
                    const q = {
                        where(f: typeof filter) { filter = f; return q; }, orderBy() { return q; }, first() { return q; }, after() { return q; },
                        async executePaginated() { return { items: bestillinger.filter((b) => b.klient_noegle === filter.klient_noegle?.eq), hasNextPage: false }; },
                    };
                    return q;
                },
            },
        },
        functions: { startBestilling: { invoke: async (i: { bestillingId: string }) => { startet.push(i.bestillingId); return svar(startet.length, i.bestillingId); } } },
    };
    sætSkriveKilde(() => kilde);
    return { bestillinger, startet };
}

describe("gennemgangens fund 3, med den faktiske bestilKoersel: et genforsøg genoptager den eksisterende bestilling", () => {
    afterEach(() => sætSkriveKilde(null));

    it("teknisk fejl, så 'Prøv igen': ét scenarie, én bestilling, behandlet to gange — ikke et nyt tomt scenarie", async () => {
        const l = lager((nr) => (nr === 1 ? { ok: false, afvist: "Teknisk fejl i startBestilling: forbindelsen døde", teknisk: true } : { ok: true, koersel_id: `k${nr}`, ny: true }));
        const f = falske(() => null);
        const deps = { ...f.deps, bestilKoersel };
        const tilstand = {};
        const første = await opretOgBestilPar(input, "a@b.dk", "N", tilstand, deps);
        expect(første.ok).toBe(false);
        expect(f.synlige()).toEqual(["s1"]);
        // Før rettelsen kastede dette kald "Bestillingen er allerede sendt — se kørselslisten." og efterlod s2 som ukørt.
        const andet = await opretOgBestilPar(input, "a@b.dk", "N", tilstand, deps);
        expect(andet.ok).toBe(true);
        expect(f.synlige()).toEqual(["s1", "s2"]);           // referencen (s1) og scenariet (s2) — ingen efterladte
        expect(andet.tilstand).toMatchObject({ refScenarieId: "s1", refKoerselId: "k2", scenScenarieId: "s2", scenKoerselId: "k3" });
        expect(l.bestillinger.map((b) => [b.klient_noegle, b.scenarie_id])).toEqual([["N-r", "s1"], ["N-s", "s2"]]);
        expect(l.startet).toEqual(["b1", "b1", "b2"]);       // b1 genoptaget, ikke erstattet
    });
    it("endelig afvisning uden oprydning (Fabric), så 'Prøv igen', når køen er fri: samme bestilling bliver til kørslen", async () => {
        const l = lager((nr) => (nr === 1 ? { ok: false, afvist: "Du har allerede 3 kørsler i kø; højst 3 ad gangen. Vent til en er færdig, eller annullér en." } : { ok: true, koersel_id: `k${nr}`, ny: true }));
        const f = falske(() => null);
        const deps = { ...f.deps, bestilKoersel };
        const tilstand = {};
        expect((await opretOgBestilPar(input, "a@b.dk", "N", tilstand, deps)).ok).toBe(false);
        expect((await opretOgBestilPar(input, "a@b.dk", "N", tilstand, deps)).ok).toBe(true);
        expect([...f.scenarier.keys()]).toEqual(["s1", "s2"]);
        expect(l.startet).toEqual(["b1", "b1", "b2"]);
    });
    it("samme nøgle, men bestillingen hører til et ANDET scenarie eller en anden bruger: genoptages ikke", async () => {
        const l = lager(() => ({ ok: true, koersel_id: "k1" }));
        await bestilKoersel("s1", "a@b.dk", "N-r");
        await expect(bestilKoersel("s9", "a@b.dk", "N-r")).rejects.toThrow("Bestillingen er allerede sendt — se kørselslisten.");
        await expect(bestilKoersel("s1", "kollega@b.dk", "N-r")).rejects.toThrow("Bestillingen er allerede sendt — se kørselslisten.");
        expect(l.startet).toEqual(["b1"]);
    });
});
