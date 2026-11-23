// Tredje rettelsesrunde i runde 15, P2-1: "En redigering kan kvitteres som en kørsel med gamle input."
//
// Efterprøvningens tilfælde: første forsøg committer kørsel K1 med indhold A, og svaret går tabt. Brugeren retter
// scenariet til B og klikker igen. Klienten genbrugte nøglen, serveren svarede med K1, og siden kvitterede "Kørslen er
// bestilt" — for en kørsel af A. Ingen kørsel af B. Efter navigation hed knappen *Kør scenariet*, selv om forsøget
// stadig blev husket; efter en genindlæsning var det glemt, og næste klik gav en ekstra kørsel.
//
// Reglen efter rettelsen (leads afgørelse): forsøget bærer BRUGER og et FINGERAFTRYK af det, der bestilles.
//   uændret indhold  -> *Prøv igen* genoptager samme bestilling; knappen viser det også efter navigation og genindlæsning
//   ændret indhold   -> forsøget genoptages ikke: den gamle bestilling slås op (blev den til en kørsel, siges det med
//                       henvisning til kørslen), og den nye bestilling får ny nøgle
// Forsøget ligger i sessionStorage, så en genindlæsning ikke giver en ekstra kørsel; appen virker uden.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { genindlæsBestillingsforsøg, glemBestillingsforsøg } from "@/lib/data/bestillingsforsoeg";
import { KildeFejl } from "@/lib/data/kilde";
import { sætLæseKilde } from "@/lib/data/laes";
import { sætSkriveKilde } from "@/lib/data/skriv";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import { KomIGang } from "../../konfiguration/KomIGang";
import type { Gruppering } from "../../konfiguration/gruppering";
import { KoerKnap } from "../KoerKnap";
import { bestillingsaftryk } from "../logik";
import { lager, ok, TABT, UAFKLARET } from "./bestillingslager.testdata";

const klik = async (navn: RegExp | string) => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: navn })); }); await act(async () => {}); };
const status = () => screen.getByRole("status").textContent ?? "";
const scenarie = (id: string) => ({ id } as Scenarie);
const knap = (navn: string) => screen.queryByRole("button", { name: navn });
const NET = new KildeFejl("netvaerk", "Failed to fetch", 0);

beforeEach(() => {
    glemBestillingsforsøg();
    sætLæseKilde(() => ({ data: new Proxy({}, { get: () => ({ select: () => { const q = { where: () => q, orderBy: () => q, first: () => q, after: () => q, executePaginated: async () => ({ items: [], hasNextPage: false, endCursor: null }) }; return q; } }) }) }) as never);
});
afterEach(() => { cleanup(); sætSkriveKilde(null); sætLæseKilde(null); vi.restoreAllMocks(); });

describe("P2-1 · ændret indhold: forsøget genoptages ikke", () => {
    it("K1 (indhold A) er committet, svaret tabt; scenariet rettes til B: der bestilles en kørsel af B, og K1 nævnes", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await klik("Kør scenariet");
        expect(status()).toMatch(UAFKLARET);
        første.unmount();
        l.indhold.nu = "B";                                           // brugeren gemmer en ændring
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" />);
        // Knappen lover ikke at genoptage: næste klik er en NY bestilling af det ændrede scenarie.
        expect(knap("Prøv igen")).toBeNull();
        await klik("Kør scenariet");
        // Før rettelsen: én bestilling, én kørsel (k1 med A) — kvitteret som "Kørslen er bestilt".
        expect(l.bestillinger.length).toBe(2);
        expect(l.bestillinger[0].klient_noegle).not.toBe(l.bestillinger[1].klient_noegle);
        expect([...l.frosset]).toEqual([["k1", "A"], ["k2", "B"]]);
        expect(status()).toContain("Kørslen er bestilt");
        expect(status()).toMatch(/forrige forsøg.*blev.*til en kørsel/);
        expect(status()).toContain("k1");                            // henvisningen til den gamle kørsel
    });
    it("den gamle bestilling blev aldrig til en kørsel (afvist, men stående): ny nøgle, og intet om en forrige kørsel", async () => {
        const l = lager((_nr, k) => ok(k), { afvisFør: (nr) => (nr === 1 ? { ok: false, afvist: "Du har allerede 3 kørsler i kø." } : undefined) });
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await klik("Kør scenariet");
        expect(status()).toBe("Du har allerede 3 kørsler i kø.");
        første.unmount();
        l.indhold.nu = "B";
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" />);
        await klik("Kør scenariet");
        expect(l.bestillinger.length).toBe(2);
        expect([...l.frosset]).toEqual([["k1", "B"]]);
        expect(status()).not.toMatch(/forrige forsøg/);
    });
    it("det gamle forsøg kan ikke slås op: intet nyt bestilles, og teksten siger hvorfor", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)), { opslagFejler: (nr) => (nr === 1 ? NET : undefined) });
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await klik("Kør scenariet");
        første.unmount();
        l.indhold.nu = "B";
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" />);
        await klik("Kør scenariet");
        expect(l.bestillinger.length).toBe(1);                       // intet nyt er sendt
        expect(status()).toMatch(/ændret siden et forsøg/);
        expect(status()).toMatch(/Intet nyt er bestilt/);
        expect(status()).not.toMatch(/sender samme bestilling/);    // det gør næste klik netop ikke
        await klik("Kør scenariet");                                 // opslaget virker igen
        expect([...l.frosset]).toEqual([["k1", "A"], ["k2", "B"]]);
        expect(status()).toContain("k1");
    });
    it("rettes scenariet TILBAGE til det, forsøget bestilte, genoptages forsøget", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        const a = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await klik("Kør scenariet");
        a.unmount();
        const b = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" />);
        expect(knap("Prøv igen")).toBeNull();
        b.unmount();
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await klik("Prøv igen");
        expect(l.bestillinger.length).toBe(1);
        expect(l.kørsler.size).toBe(1);
    });
});

describe("P2-1 · uændret indhold: knappen viser den åbne tilstand, også efter navigation og genindlæsning", () => {
    it("efter navigation (komponenten monteres på ny) hedder knappen 'Prøv igen', og der står hvorfor", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await klik("Kør scenariet");
        første.unmount();
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        // Før rettelsen: "Kør scenariet" og ingen tekst — knappens tekst afhang af komponentens lokale svar.
        expect(knap("Prøv igen")).not.toBeNull();
        expect(status()).toMatch(/et forsøg på at bestille .* hvis udfald vi ikke kender/i);
        await klik("Prøv igen");
        expect(l.bestillinger.length).toBe(1);
        expect(l.kørsler.size).toBe(1);
    });
    it("efter en genindlæsning af appen: samme nøgle, stadig én kørsel", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await klik("Kør scenariet");
        første.unmount();
        genindlæsBestillingsforsøg();                                // modulets hukommelse er væk; sessionStorage står
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        expect(knap("Prøv igen")).not.toBeNull();
        await klik("Prøv igen");
        // Før rettelsen: to bestillinger og to kørsler.
        expect(l.bestillinger.length).toBe(1);
        expect(l.kørsler.size).toBe(1);
        expect(status()).toContain("Kørslen er bestilt");
    });
    it("genindlæses siden, MENS kaldet er undervejs, står forsøget åbent bagefter", async () => {
        // Første kalds svar kommer aldrig (siden, der ventede på det, findes ikke mere).
        const l = lager((_nr, k) => ok(k), { vent: (nr) => (nr === 1 ? new Promise<void>(() => {}) : undefined) });
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Kør scenariet" })); });
        await vi.waitFor(() => expect(l.kørsler.size).toBe(1));      // kørslen er committet, svaret er ikke kommet
        første.unmount();
        genindlæsBestillingsforsøg();
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        expect(knap("Prøv igen")).not.toBeNull();
        await klik("Prøv igen");
        expect(l.bestillinger.length).toBe(1);
        expect(l.kørsler.size).toBe(1);
    });
    it("et kendt udfald rydder også det gemte: efter 'bestilt' og en genindlæsning er næste klik en ny kørsel", async () => {
        const l = lager((_nr, k) => ok(k));
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await klik("Kør scenariet");
        første.unmount();
        genindlæsBestillingsforsøg();
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        expect(knap("Prøv igen")).toBeNull();
        await klik("Kør scenariet");
        expect(l.bestillinger.length).toBe(2);
    });
    it("uden sessionStorage virker appen som før: forsøget huskes i hukommelsen", async () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
        vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("SecurityError"); });
        genindlæsBestillingsforsøg();
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await klik("Kør scenariet");
        expect(status()).toMatch(UAFKLARET);
        await klik("Prøv igen");
        expect(l.bestillinger.length).toBe(1);
        expect(status()).toContain("Kørslen er bestilt");
    });
    it("ulæseligt indhold i sessionStorage vælter ikke knappen", async () => {
        sessionStorage.setItem("fjv.bestillingsforsoeg.v1", "{ikke json");
        genindlæsBestillingsforsøg();
        const l = lager((_nr, k) => ok(k));
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await klik("Kør scenariet");
        expect(l.kørsler.size).toBe(1);
    });
});

describe("P2-1 · forsøget er brugerens eget", () => {
    it("en anden bruger i samme fane arver ikke forsøget: egen nøgle, egen bestilling", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        const a = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await klik("Kør scenariet");
        a.unmount();
        render(<KoerKnap s={scenarie("s1")} bruger="kollega@b.dk" aftryk="A" />);
        expect(knap("Prøv igen")).toBeNull();
        await klik("Kør scenariet");
        // Før rettelsen: kollegaen sendte a@b.dk's nøgle og fik "Bestillingen er allerede sendt".
        expect(l.bestillinger.map((b) => b.bestilt_af)).toEqual(["a@b.dk", "kollega@b.dk"]);
        expect(status()).toContain("Kørslen er bestilt");
    });
});

describe("P2-1 · prøvekørslen: også scenariet overlever en genindlæsning", () => {
    const g = { alle: [{ sti: "time.start", vaerdi_json: '"2025-07-01T00:00:00Z"' }, { sti: "time.end", vaerdi_json: '"2026-06-30T23:00:00Z"' }] } as unknown as Gruppering;
    const vaerk = { id: "v1", kode: "nyt", navn: "Nyt værk", revision: 1, oprettet: new Date(Date.UTC(2026, 10, 23)) };

    it("svaret går tabt, appen genindlæses, og brugeren klikker igen: ét scenarie, én bestilling, én kørsel", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        const første = render(<KomIGang vaerk={vaerk} g={g} bruger="a@b.dk" gåTil={() => {}} />);
        await klik("Bestil en prøvekørsel (2 døgn)");
        første.unmount();
        genindlæsBestillingsforsøg();
        render(<KomIGang vaerk={vaerk} g={g} bruger="a@b.dk" gåTil={() => {}} />);
        await klik("Prøv igen");
        expect([l.scenarier.length, l.bestillinger.length, l.kørsler.size]).toEqual([1, 1, 1]);
    });
    it("værket er rettet siden forsøget (ny revision): samme scenarie, men en ny bestilling — og den forrige kørsel nævnes", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        const første = render(<KomIGang vaerk={vaerk} g={g} bruger="a@b.dk" gåTil={() => {}} />);
        await klik("Bestil en prøvekørsel (2 døgn)");
        første.unmount();
        l.indhold.nu = "B";
        render(<KomIGang vaerk={{ ...vaerk, revision: 2 }} g={g} bruger="a@b.dk" gåTil={() => {}} />);
        await klik("Bestil en prøvekørsel (2 døgn)");
        expect([l.scenarier.length, l.bestillinger.length, l.kørsler.size]).toEqual([1, 2, 2]);
        expect(status()).toMatch(/forrige forsøg.*blev.*til en kørsel/);
    });
});

describe("P2-1 · fingeraftrykket følger det, en kørsel fryser", () => {
    const blade = new Map([["units.kedel.enabled", "true"], ["prices.gas.value", "300"]]);
    const felter = { periode_start: "2026-01-05", periode_slut: "2026-01-06", med_balancering: false, balancing_method: null, mip_rel_gap: null, mip_abs_gap: null, tidsgraense_s: null, ekstra_flag: null, heat_csv: null };
    const af = (ændringer: Parameters<typeof bestillingsaftryk>[1], f = felter, revision = 3) => bestillingsaftryk({ id: "v1", revision }, ændringer, f, blade);

    it("samme indhold giver samme aftryk — uanset rækkefølgen af ændringerne og 12 mod 12.0", () => {
        const a = af([{ type: "set", sti: "prices.gas.value", vaerdi_json: "12" }, { type: "disable", sti: "kedel" }]);
        const b = af([{ type: "disable", sti: "kedel" }, { type: "set", sti: "prices.gas.value", vaerdi_json: "12.0" }]);
        expect(a).toBe(b);
    });
    it("en ændret værdi, en ændret periode, et andet varmelastvalg og en ny værksrevision giver hver sit aftryk", () => {
        const grund = af([{ type: "set", sti: "prices.gas.value", vaerdi_json: "12" }]);
        const andre = [
            af([{ type: "set", sti: "prices.gas.value", vaerdi_json: "13" }]),
            af([{ type: "set", sti: "prices.gas.value", vaerdi_json: "12" }], { ...felter, periode_slut: "2026-01-07" }),
            // Varmelastvalget fryses ikke som en `aendring`-række, men er en del af det, der bestilles.
            af([{ type: "set", sti: "prices.gas.value", vaerdi_json: "12" }, { type: "set", sti: "_tidsserie.varmelast", vaerdi_json: '"syntetisk"' }]),
            af([{ type: "set", sti: "prices.gas.value", vaerdi_json: "12" }], felter, 4),
        ];
        expect(new Set([grund, ...andre]).size).toBe(5);
    });
});
