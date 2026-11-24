// Fjerde rettelsesrunde i runde 15, punkt 1: "Et sent svar kan slette nøglen til det nyere forsøg."
//
// Efterprøvningens forløb: K1 med indhold A committer, men svaret holdes tilbage. Brugeren gemmer B og bestiller B; det
// forsøg får sin egen nøgle, og K2 committer. Så kommer A's succes hjem, mens B endnu står åbent. Afslutningen af A's
// kald slettede det huskede forsøg på PLADSEN (bruger + scenarie) — som nu tilhørte B — også fra sessionStorage. Gik
// svaret på B derefter tabt, kendte næste klik efter en genindlæsning ingen nøgle og bestilte en tredje kørsel:
// K1(A), K2(B), K3(B).
//
// Reglen efter rettelsen: afslutningen af et kald må kun ændre eller slette det huskede forsøg, hvis det stadig bærer
// SAMME klientnøgle som kaldet.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { genindlæsBestillingsforsøg, glemBestillingsforsøg } from "@/lib/data/bestillingsforsoeg";
import { sætLæseKilde } from "@/lib/data/laes";
import { sætSkriveKilde } from "@/lib/data/skriv";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import { KoerKnap } from "../KoerKnap";
import { lager, ok, TABT } from "./bestillingslager.testdata";

const scenarie = (id: string) => ({ id } as Scenarie);
const knap = (navn: string) => screen.queryByRole("button", { name: navn });
const klik = async (navn: string) => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: navn })); }); await act(async () => {}); };
/** Et svar, testen selv frigiver. */
function tilbageholdt() {
    let slip!: () => void;
    const venter = new Promise<void>((r) => { slip = r; });
    return { venter, slip: async () => { await act(async () => { slip(); await venter; }); await act(async () => {}); } };
}

beforeEach(() => {
    glemBestillingsforsøg();
    sætLæseKilde(() => ({ data: new Proxy({}, { get: () => ({ select: () => { const q = { where: () => q, orderBy: () => q, first: () => q, after: () => q, executePaginated: async () => ({ items: [], hasNextPage: false, endCursor: null }) }; return q; } }) }) }) as never);
});
afterEach(() => { cleanup(); sætSkriveKilde(null); sætLæseKilde(null); vi.restoreAllMocks(); });

describe("punkt 1 · et sent svar må ikke slette et nyere forsøg", () => {
    it("K1(A) holdes tilbage, B bestilles med egen nøgle, A's succes frigives, B's svar tabes, genindlæsning, nyt klik: stadig kun K1 og K2", async () => {
        const a = tilbageholdt(), b = tilbageholdt();
        // Kald 1 (A) og kald 2 (B) committer straks; svarene holdes tilbage. Kald 2's svar går tabt, kald 3 svarer.
        const l = lager((nr, k) => (nr === 2 ? TABT : ok(k)), { vent: (nr) => (nr === 1 ? a.venter : nr === 2 ? b.venter : undefined) });

        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Kør scenariet" })); });
        await vi.waitFor(() => expect(l.kørsler.size).toBe(1));      // K1 er committet; svaret er undervejs
        første.unmount();

        l.indhold.nu = "B";                                           // brugeren gemmer B; redigeringen monteres på ny
        const anden = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" />);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Kør scenariet" })); });
        await vi.waitFor(() => expect(l.kørsler.size).toBe(2));      // K2 er committet med sin egen nøgle
        expect(l.bestillinger[0].klient_noegle).not.toBe(l.bestillinger[1].klient_noegle);

        await a.slip();                                               // A's succes kommer hjem, mens B står åbent
        await b.slip();                                               // svaret på B går tabt
        anden.unmount();
        genindlæsBestillingsforsøg();                                // modulets hukommelse er væk; sessionStorage står

        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" />);
        // Før rettelsen: A's afslutning havde slettet B's forsøg — knappen hed "Kør scenariet", og klikket gav K3.
        expect(knap("Prøv igen")).not.toBeNull();
        await klik("Prøv igen");
        expect(l.bestillinger.length).toBe(2);
        expect([...l.frosset]).toEqual([["k1", "A"], ["k2", "B"]]);
        expect(screen.getByRole("status").textContent).toContain("Kørslen er bestilt");
    });

    it("et sent UAFKLARET svar på det gamle kald lukker ikke det nyere forsøg op for en ny nøgle", async () => {
        // Det gamle kald ender uafklaret EFTER, at det nyere forsøg er afsluttet som bestilt: det må ikke genskabe et
        // åbent forsøg på pladsen (så ville næste klik hedde "Prøv igen" for en bestilling, der er kvitteret).
        const a = tilbageholdt();
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)), { vent: (nr) => (nr === 1 ? a.venter : undefined) });
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Kør scenariet" })); });
        await vi.waitFor(() => expect(l.kørsler.size).toBe(1));
        første.unmount();
        l.indhold.nu = "B";
        const anden = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" />);
        await klik("Kør scenariet");                                  // B bestilt og kvitteret: forsøget er afsluttet
        expect(l.kørsler.size).toBe(2);
        await a.slip();                                               // nu taber A's kald sit svar
        anden.unmount();
        genindlæsBestillingsforsøg();
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" />);
        expect(knap("Prøv igen")).toBeNull();
        expect(sessionStorage.getItem("fjv.bestillingsforsoeg.v1")).toBeNull();
    });
});
