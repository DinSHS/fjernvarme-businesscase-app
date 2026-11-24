// Fjerde rettelsesrunde i runde 15, punkt 2: "Bestillingsaftrykket kan udløse en ekstra kørsel."
//
// Efterprøvningens forløb: scenariet åbnes, mens det gemte indhold er A. I en anden fane gemmes B, FØR første klik.
// Den oprindelige fane viser stadig A: første klik husker A's aftryk, men serveren fryser det gemte B og committer K1.
// Svaret tabes, siden genindlæses (klienten ser nu B), og der klikkes igen. Klienten så "andet aftryk", fandt K1,
// roterede nøglen og bestilte K2 — med samme indhold som K1 — og kvitterede, at K1 var "regnet med det tidligere indhold".
//
// Reglen efter rettelsen: et andet aftryk er klientens FORMODNING om en ændring; beviset er den gamle kørsels frosne
// input. Blev den gamle bestilling til en kørsel, sammenlignes det, der nu skal bestilles, med kørslens frosne input:
//   ens                -> den gamle kørsel er svaret; intet nyt bestilles
//   forskelligt        -> nyt bestilles som før, og kun da siger kvitteringen "regnet med det tidligere indhold"
//   kan ikke hentes    -> uafklaret; intet nyt
// Blev den endnu ikke til en kørsel, men kan det gamle kald stadig være undervejs (forsøget er uafklaret), står den
// åben: intet nyt, før udfaldet er kendt, eller brugeren udtrykkeligt vælger *Bestil ny kørsel*.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { genindlæsBestillingsforsøg, glemBestillingsforsøg } from "@/lib/data/bestillingsforsoeg";
import { KildeFejl } from "@/lib/data/kilde";
import { sætLæseKilde } from "@/lib/data/laes";
import { sætSkriveKilde } from "@/lib/data/skriv";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import { bygFrossetInput } from "../../../../rayfin/functions/src/logik";
import { KomIGang } from "../../konfiguration/KomIGang";
import type { Gruppering } from "../../konfiguration/gruppering";
import { prøvekørselFelter } from "../../konfiguration/nyt-vaerk";
import { frossetSomNu } from "../frosset-som-nu";
import { KoerKnap } from "../KoerKnap";
import type { Scenariefelter } from "../logik";
import { frossetMed, lager, læsFrosset, ok, TABT, type FrossenKoersel } from "./bestillingslager.testdata";

const scenarie = (id: string) => ({ id } as Scenarie);
const knap = (navn: string) => screen.queryByRole("button", { name: navn });
const klik = async (navn: string) => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: navn })); }); await act(async () => {}); };
const status = () => screen.getByRole("status").textContent ?? "";
const NET = new KildeFejl("netvaerk", "Failed to fetch", 0);
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

describe("punkt 2 · den gamle bestilling blev til en kørsel: det frosne input afgør, om indholdet er ændret", () => {
    it("fanen viste A, serveren frøs B (gemt i en anden fane): efter genindlæsning er K1 svaret — ingen K2", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        l.indhold.nu = "B";                                           // gemt i en anden fane, FØR første klik
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" somFrosset={frossetMed(l, "A")} />);
        await klik("Kør scenariet");
        expect([...l.frosset]).toEqual([["k1", "B"]]);               // serveren frøs det gemte B
        første.unmount();
        genindlæsBestillingsforsøg();                                // genindlæsning: klienten ser nu B

        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" somFrosset={frossetMed(l, "B")} />);
        await klik("Kør scenariet");
        // Før rettelsen: to bestillinger, k1 og k2 begge med B — og "regnet med det tidligere indhold" om k1.
        expect(l.bestillinger.length).toBe(1);
        expect([...l.frosset]).toEqual([["k1", "B"]]);
        expect(status()).toMatch(/allerede bestilt/);
        expect(status()).toContain("k1");
        expect(status()).toMatch(/Intet nyt er bestilt/);
        expect(status()).not.toMatch(/tidligere indhold/);
        // Udfaldet er kendt: forsøget er afsluttet, også det gemte.
        expect(knap("Prøv igen")).toBeNull();
        expect(sessionStorage.getItem("fjv.bestillingsforsoeg.v1")).toBeNull();
    });

    it("det frosne input afviger faktisk: der bestilles nyt, og kvitteringen siger 'regnet med det tidligere indhold'", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" somFrosset={frossetMed(l, "A")} />);
        await klik("Kør scenariet");
        første.unmount();
        l.indhold.nu = "B";
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" somFrosset={frossetMed(l, "B")} />);
        await klik("Kør scenariet");
        expect([...l.frosset]).toEqual([["k1", "A"], ["k2", "B"]]);
        expect(status()).toContain("Kørslen er bestilt");
        expect(status()).toMatch(/k1.*tidligere indhold/);
    });

    it("det frosne input kan ikke hentes: uafklaret, intet nyt — og næste klik afgør det", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        l.indhold.nu = "B";
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" somFrosset={frossetMed(l, "A")} />);
        await klik("Kør scenariet");
        første.unmount();
        let fejler = true;
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" somFrosset={async (k) => { if (fejler) throw NET; return l.frosset.get(k) === "B"; }} />);
        await klik("Kør scenariet");
        expect(l.bestillinger.length).toBe(1);
        expect(status()).toMatch(/frosne input kunne ikke hentes/);
        expect(status()).toContain("k1");
        expect(status()).toMatch(/Intet nyt er bestilt/);
        fejler = false;
        await klik("Kør scenariet");
        expect(l.bestillinger.length).toBe(1);
        expect(status()).toMatch(/allerede bestilt/);
    });

    it("uden en sammenligning kan lighed ikke bevises: intet nyt bestilles", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" />);
        await klik("Kør scenariet");
        første.unmount();
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" />);
        await klik("Kør scenariet");
        expect(l.bestillinger.length).toBe(1);
        expect(status()).toMatch(/Intet nyt er bestilt/);
    });
});

describe("punkt 2 · den gamle bestilling er endnu ikke en kørsel, men kaldet kan være undervejs", () => {
    it("det gamle kald hænger før commit: intet nyt bestilles; når det når frem, er dets kørsel svaret", async () => {
        const a = tilbageholdt();
        // Svaret på det gamle kald når aldrig siden (den er genindlæst): for klienten forbliver det uafklaret.
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)), { ventFør: (nr) => (nr === 1 ? a.venter : undefined) });
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" somFrosset={frossetMed(l, "A")} />);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Kør scenariet" })); });
        await vi.waitFor(() => expect(l.bestillinger.length).toBe(1));   // bestillingen står; kørslen er ikke committet
        første.unmount();
        genindlæsBestillingsforsøg();
        l.indhold.nu = "B";

        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" somFrosset={frossetMed(l, "B")} />);
        await klik("Kør scenariet");
        // Før rettelsen: ny nøgle og en ny bestilling her — og det gamle kald committede bagefter en kørsel mere.
        expect(l.bestillinger.length).toBe(1);
        expect(l.kørsler.size).toBe(0);
        expect(status()).toMatch(/kan stadig blive det/);
        expect(status()).toMatch(/Intet nyt er bestilt/);
        expect(knap("Bestil ny kørsel")).not.toBeNull();

        await a.slip();                                               // det gamle kald når frem og fryser det gemte B
        expect([...l.frosset]).toEqual([["k1", "B"]]);
        await klik("Kør scenariet");
        expect(l.bestillinger.length).toBe(1);
        expect(l.kørsler.size).toBe(1);
        expect(status()).toMatch(/allerede bestilt/);
    });

    it("svaret gik tabt, før serveren committede: stadig åbent — og 'Bestil ny kørsel' er brugerens udtrykkelige valg", async () => {
        const l = lager((_nr, k) => ok(k), { kaldFejlerFør: (nr) => (nr === 1 ? TABT : undefined) });
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" somFrosset={frossetMed(l, "A")} />);
        await klik("Kør scenariet");
        første.unmount();
        l.indhold.nu = "B";
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" somFrosset={frossetMed(l, "B")} />);
        expect(knap("Bestil ny kørsel")).toBeNull();                 // tilbydes først, når opslaget har vist, at den står åben
        await klik("Kør scenariet");
        expect(l.bestillinger.length).toBe(1);
        expect(l.kørsler.size).toBe(0);
        await klik("Bestil ny kørsel");
        expect(l.bestillinger.length).toBe(2);
        expect(l.bestillinger[0].klient_noegle).not.toBe(l.bestillinger[1].klient_noegle);
        expect([...l.frosset]).toEqual([["k1", "B"]]);
        expect(status()).toContain("Kørslen er bestilt");
        expect(status()).not.toMatch(/tidligere indhold/);
    });

    it("en ENDELIG afvisning, hvor bestillingen står, er ikke undervejs: der bestilles nyt uden at spørge", async () => {
        const l = lager((_nr, k) => ok(k), { afvisFør: (nr) => (nr === 1 ? { ok: false, afvist: "Du har allerede 3 kørsler i kø." } : undefined) });
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="A" somFrosset={frossetMed(l, "A")} />);
        await klik("Kør scenariet");
        første.unmount();
        genindlæsBestillingsforsøg();                                // også efter en genindlæsning huskes, at den var afvist
        l.indhold.nu = "B";
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" aftryk="B" somFrosset={frossetMed(l, "B")} />);
        await klik("Kør scenariet");
        expect(l.bestillinger.length).toBe(2);
        expect([...l.frosset]).toEqual([["k1", "B"]]);
    });
});

describe("punkt 2 · sammenligningen er klientens forudsigelse over for kørslens frosne input (frossetSomNu)", () => {
    const blade = new Map([["units.kedel.enabled", "true"], ["prices.gas.value", "300"]]);
    const params = [...blade].map(([sti, vaerdi_json]) => ({ sti, vaerdi_json }));
    const B: Scenariefelter = { periode_start: "2026-01-05", periode_slut: "2026-01-06", med_balancering: false, balancing_method: null, mip_rel_gap: 0.0002, mip_abs_gap: 100, tidsgraense_s: null, ekstra_flag: null, heat_csv: null };
    const A: Scenariefelter = { ...B, periode_slut: "2026-01-07" };
    const ændringer = [{ type: "set" as const, sti: "prices.gas.value", vaerdi_json: "12" }];
    // Det frosne input laves af backendens egen frysning (rayfin/functions/src/logik.ts), ikke af testen.
    const frys = (f: Scenariefelter, revision = 3): FrossenKoersel => ({
        vaerk_revision: revision,
        rækker: bygFrossetInput(params, ændringer.map((æ, i) => ({ ...æ, raekkefoelge: i + 1 })), f, {}, []).rækker,
    });
    const vaerk = { id: "v1", revision: 3 };

    it("samme scenarie, samme værksrevision: ens — 12 og 12.0 er samme værdi", async () => {
        læsFrosset(() => frys(B));
        expect(await frossetSomNu("k1", vaerk, [{ type: "set", sti: "prices.gas.value", vaerdi_json: "12.0" }], B, blade)).toBe(true);
    });
    it("en anden periode, en anden ændring eller en anden værksrevision: forskelligt", async () => {
        læsFrosset(() => frys(A));
        expect(await frossetSomNu("k1", vaerk, ændringer, B, blade)).toBe(false);
        læsFrosset(() => frys(B));
        expect(await frossetSomNu("k1", vaerk, [{ type: "set", sti: "prices.gas.value", vaerdi_json: "13" }], B, blade)).toBe(false);
        expect(await frossetSomNu("k1", { id: "v1", revision: 4 }, ændringer, B, blade)).toBe(false);
    });
    it("værket har nu en aktiv varmelast, som den gamle kørsel ikke frøs: forskelligt", async () => {
        læsFrosset(() => frys(B), [{ id: "11111111-1111-4111-8111-111111111111", vaerk_id: "v1", rolle: "varmelast", navn: "målt", sha256: "a".repeat(64), status: "gyldig", aktiv: true }]);
        expect(await frossetSomNu("k1", vaerk, ændringer, B, blade)).toBe(false);
    });
    it("kørslen eller dens input kan ikke læses: kaster — 'ved ikke' er hverken ens eller forskelligt", async () => {
        læsFrosset(() => undefined);
        await expect(frossetSomNu("k1", vaerk, ændringer, B, blade)).rejects.toThrow(/frosne input/);
        læsFrosset(() => NET);
        await expect(frossetSomNu("k1", vaerk, ændringer, B, blade)).rejects.toThrow();
    });
});

describe("punkt 2 · prøvekørslen bruger samme regel", () => {
    const g = { alle: [{ sti: "time.start", vaerdi_json: '"2025-07-01T00:00:00Z"' }, { sti: "time.end", vaerdi_json: '"2026-06-30T23:00:00Z"' }] } as unknown as Gruppering;
    const vaerk = { id: "v1", kode: "nyt", navn: "Nyt værk", revision: 1, oprettet: new Date(Date.UTC(2026, 10, 23)) };
    const p = prøvekørselFelter("v1");
    const felter: Scenariefelter = { periode_start: p.periode_start, periode_slut: p.periode_slut, med_balancering: p.med_balancering, balancing_method: null, mip_rel_gap: p.mip_rel_gap, mip_abs_gap: p.mip_abs_gap, tidsgraense_s: null, ekstra_flag: null, heat_csv: null };
    const frosset = (revision: number): FrossenKoersel => ({ vaerk_revision: revision, rækker: bygFrossetInput(g.alle.map((b) => ({ sti: b.sti, vaerdi_json: b.vaerdi_json })), [], felter, {}, []).rækker });

    it("fanen viste revision 1, serveren frøs revision 2: efter genindlæsning er den gamle kørsel svaret — ét scenarie, én kørsel", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        læsFrosset(() => frosset(2));
        const første = render(<KomIGang vaerk={vaerk} g={g} bruger="a@b.dk" gåTil={() => {}} />);
        await klik("Bestil en prøvekørsel (2 døgn)");
        første.unmount();
        genindlæsBestillingsforsøg();
        render(<KomIGang vaerk={{ ...vaerk, revision: 2 }} g={g} bruger="a@b.dk" gåTil={() => {}} />);
        await klik("Bestil en prøvekørsel (2 døgn)");
        expect([l.scenarier.length, l.bestillinger.length, l.kørsler.size]).toEqual([1, 1, 1]);
        expect(status()).toMatch(/allerede bestilt/);
        expect(status()).not.toMatch(/tidligere indhold/);
    });
});
