// Tredje rettelsesrunde i runde 15, P2-2: "Et kort opslagssvigt kan udløse en ekstra kørsel."
//
// Efterprøvningens tilfælde: K1 er committet, svaret gik tabt. Genforsøget får — korrekt — en unikhedsfejl på
// klientnøglen og slår bestillingen op for at genoptage den. Opslaget rammer et kort netværksudfald. `bestilKoersel`
// gjorde det til "Bestillingen er allerede sendt" (`.catch(() => null)`), `bestilMedUdfald` gjorde DET til `ryddet`
// (en `Afvist` fra skrivelaget), nøglen blev skiftet, og næste klik oprettede K2. Parflowet arkiverede oven i købet
// det scenarie, det selv havde oprettet — med en kørsel i gang.
//
// Reglen efter rettelsen: et opslag, der fejler teknisk, er UAFKLARET. `ryddet` er forbeholdt bekræftet fravær (rækken
// blev aldrig oprettet, eller nøglen er en andens) og serverens udtrykkelige `ryddet: true`.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bestilMedUdfald, glemBestillingsforsøg } from "@/lib/data/bestillingsforsoeg";
import { KildeFejl } from "@/lib/data/kilde";
import { Afvist, bestilKoersel, sætSkriveKilde } from "@/lib/data/skriv";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import { KoerKnap } from "../KoerKnap";
import { opretOgBestilPar, type ParAfhængigheder, type ParInput } from "../par";
import { lager, ok, TABT, UAFKLARET } from "./bestillingslager.testdata";

const klik = async (navn: RegExp | string) => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: navn })); }); await act(async () => {}); };
const status = () => screen.getByRole("status").textContent ?? "";
const scenarie = (id: string) => ({ id } as Scenarie);
const NET = new KildeFejl("netvaerk", "Failed to fetch", 0);

beforeEach(() => glemBestillingsforsøg());
afterEach(() => { cleanup(); sætSkriveKilde(null); });

describe("P2-2 · Kør scenariet: et fejlet opslag på nøglen er uafklaret", () => {
    it("K1 committet, svaret tabt, opslaget fejler én gang: stadig én bestilling og én kørsel", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)), { opslagFejler: (nr) => (nr === 1 ? NET : undefined) });
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" />);
        await klik("Kør scenariet");
        expect(status()).toMatch(UAFKLARET);
        await klik("Prøv igen");                                    // unikhedsfejl + opslaget fejler
        // Før rettelsen: "Bestillingen er allerede sendt — se kørselslisten.", knappen hed "Kør scenariet" igen …
        expect(status()).toMatch(UAFKLARET);
        expect(status()).not.toMatch(/allerede sendt/);
        await klik("Prøv igen");
        // … og dette klik gav bestilling b2 og kørsel k2.
        expect(l.bestillinger.map((b) => b.id)).toEqual(["b1"]);
        expect([...l.kørsler]).toEqual([["b1", "k1"]]);
        expect(status()).toContain("Kørslen er bestilt");
    });
});

describe("P2-2 · parflowet arkiverer kun ved bekræftet fravær", () => {
    const input: ParInput = {
        vaerkId: "v1", spørgsmål: "Hvad er tanken værd?", forklaring: "Slå alle lagre fra.",
        fælles: { periode_start: "2026-01-05", periode_slut: "2026-01-06", mip_rel_gap: 0.0002, mip_abs_gap: 100, tidsgraense_s: null },
        reference: { felter: { med_balancering: false, balancing_method: null, ekstra_flag: null, heat_csv: null }, aendringer: [] },
        scenarie: { felter: { med_balancering: false, balancing_method: null, ekstra_flag: null, heat_csv: null }, aendringer: [{ type: "disable", sti: "tank_lav" }] },
    };
    const deps = (): ParAfhængigheder & { arkiveret: string[] } => {
        let n = 0;
        const arkiveret: string[] = [];
        return { opretScenarie: async () => ({ id: `s${++n}` }), gemScenarieAendringer: async () => {}, bestilKoersel, arkivérScenarie: async (id) => { arkiveret.push(id); }, arkiveret };
    };

    it("referencens kørsel er committet, svaret tabt, og opslaget fejler: scenariet arkiveres IKKE, og der kommer ingen ekstra kørsel", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)), { opslagFejler: (nr) => (nr === 1 ? NET : undefined) });
        const d = deps(), tilstand = {};
        await opretOgBestilPar(input, "a@b.dk", "N", tilstand, d);                 // uafklaret (svaret tabt)
        const andet = await opretOgBestilPar(input, "a@b.dk", "N", tilstand, d);   // unik + opslaget fejler
        expect(andet.ok).toBe(false);
        // Før rettelsen: "Referencen blev ikke bestilt: Bestillingen er allerede sendt", og s1 blev arkiveret.
        expect(andet.ok === false && andet.afvist).toMatch(/^Vi ved ikke, om referencen blev bestilt/);
        expect(d.arkiveret).toEqual([]);
        expect(andet.tilstand.refScenarieId).toBe("s1");
        const tredje = await opretOgBestilPar(input, "a@b.dk", "N", tilstand, d);
        expect(tredje.ok).toBe(true);
        expect(l.bestillinger.map((b) => [b.klient_noegle, b.scenarie_id])).toEqual([["N-r", "s1"], ["N-s", "s2"]]);
        expect(l.kørsler.size).toBe(2);
    });
});

describe("P2-2 · skrivelaget skelner en definitiv afvisning fra en bestilling, der står eller er uafklaret", () => {
    it("opslaget fejler teknisk: ikke en Afvist", async () => {
        lager((_nr, k) => ok(k), { opslagFejler: () => NET });
        await bestilKoersel("s1", "a@b.dk", "N1");
        const fejl = await bestilKoersel("s1", "a@b.dk", "N1").catch((e: unknown) => e);
        expect(fejl).toBeInstanceOf(Error);
        expect(fejl).not.toBeInstanceOf(Afvist);
        expect((await bestilMedUdfald(() => bestilKoersel("s1", "a@b.dk", "N1"))).art).toBe("uafklaret");
    });
    it("unikhedsfejl, men opslaget finder ingen række: modstridende svar er uafklaret (samme nøgle næste gang)", async () => {
        // Rækken findes (unikhedsfejlen), men kan ikke læses i opslaget — fx ryddet af serveren i samme øjeblik.
        const l = lager((_nr, k) => ok(k), { opslagFejler: () => "tomt" });
        await bestilKoersel("s1", "a@b.dk", "N1");
        const u = await bestilMedUdfald(() => bestilKoersel("s1", "a@b.dk", "N1"));
        expect(l.bestillinger.length).toBe(1);
        expect(u.art).toBe("uafklaret");
    });
    it("nøglen er en andens bestilling: bekræftet, at der ingen bestilling er for denne bruger — en Afvist som før", async () => {
        lager((_nr, k) => ok(k));
        await bestilKoersel("s1", "kollega@b.dk", "N1");
        await expect(bestilKoersel("s1", "a@b.dk", "N1")).rejects.toEqual(new Afvist("Bestillingen er allerede sendt — se kørselslisten."));
        expect((await bestilMedUdfald(() => bestilKoersel("s1", "a@b.dk", "N1"))).art).toBe("ryddet");
    });
    it("bestillingen er oprettet, men kaldet til startBestilling afvises af adapteren: bestillingen STÅR — aldrig ryddet", async () => {
        const l = lager((_nr, k) => ok(k), { kaldFejlerFør: (nr) => (nr === 1 ? new KildeFejl("ugyldig", "Ugyldigt kald.", 400) : undefined) });
        const u = await bestilMedUdfald(() => bestilKoersel("s1", "a@b.dk", "N1"));
        // Før rettelsen: `ryddet` (en Afvist fra skrivelaget) — næste klik fik ny nøgle, og b1 stod uden kørsel.
        expect(u.art).toBe("uafklaret");
        expect(l.bestillinger.length).toBe(1);
        expect((await bestilMedUdfald(() => bestilKoersel("s1", "a@b.dk", "N1"))).art).toBe("bestilt");
        expect(l.bestillinger.length).toBe(1);
    });
    it("ingen bruger: intet er sendt — en kendt afvisning uden bestilling", async () => {
        const l = lager((_nr, k) => ok(k));
        expect((await bestilMedUdfald(() => bestilKoersel("s1", undefined, "N1"))).art).toBe("ryddet");
        expect(l.bestillinger.length).toBe(0);
    });
});
