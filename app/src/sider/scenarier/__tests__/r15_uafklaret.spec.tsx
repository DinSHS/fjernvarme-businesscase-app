// Efterprøvningen af rettelserne i runde 15, fund B (P2): "Et mistet svar kan stadig give en ekstra kørsel."
//
// Serveren committer kørslen, og svarforbindelsen falder ud. *Kør scenariet* nulstillede klientnøglen i `finally`, så
// næste klik oprettede en NY bestilling — og dermed en kørsel mere for samme scenarie. *Bestil en prøvekørsel*
// oprettede oven i købet et nyt scenarie pr. klik. Parflowet beholdt nøgle og scenarie, men læste aldrig `teknisk` og
// sagde "blev ikke bestilt" om et svar, hvor ingen ved, om kørslen blev bestilt.
//
// Genskabt her med de RIGTIGE komponenter og den rigtige `bestilKoersel` mod et lager, der — som databasen — har en
// unik klientnøgle pr. bestilling og højst én kørsel pr. bestilling. Efter rettelsen beholder alle tre indgange
// klientnøgle og scenarie-id, til udfaldet er kendt; et kastet kald eller `teknisk: true` er UAFKLARET og har sin
// egen tekst.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { glemBestillingsforsøg, udfaldAfSvar } from "@/lib/data/bestillingsforsoeg";
import { KildeFejl } from "@/lib/data/kilde";
import { sætLæseKilde } from "@/lib/data/laes";
import { bestilKoersel, sætSkriveKilde, type SkriveKilde } from "@/lib/data/skriv";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import { KomIGang } from "../../konfiguration/KomIGang";
import type { Gruppering } from "../../konfiguration/gruppering";
import { KoerKnap } from "../KoerKnap";
import { opretOgBestilPar, type ParAfhængigheder, type ParInput } from "../par";

type Svar = Record<string, unknown>;
/**
 * Databasen i det små: `Bestilling.klient_noegle` er unik, og `startBestilling` er idempotent på bestillingen (højst
 * én kørsel pr. bestilling). `svar(nr, kørsel)` bestemmer, hvad KLIENTEN får at se for kald nr. `nr` — kørslen er da
 * allerede committet, præcis som når svaret går tabt på vejen hjem.
 */
function lager(svar: (nr: number, kørsel: string) => Svar | Error) {
    const bestillinger: { id: string; scenarie_id: string; klient_noegle: string; bestilt_af: string }[] = [];
    const scenarier: string[] = [];
    const kørsler = new Map<string, string>();                    // bestilling -> kørsel
    let kald = 0;
    const ingen = async () => ({});
    const kilde: SkriveKilde = {
        data: {
            Scenarie: { create: async () => { scenarier.push(`s${scenarier.length + 1}`); return { id: scenarier.at(-1) }; }, update: ingen, delete: ingen },
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
        functions: {
            startBestilling: {
                invoke: async (i: { bestillingId: string }) => {
                    kald += 1;
                    if (!kørsler.has(i.bestillingId)) kørsler.set(i.bestillingId, `k${kørsler.size + 1}`);     // committet
                    const s = svar(kald, kørsler.get(i.bestillingId)!);
                    if (s instanceof Error) throw s;
                    return s;
                },
            },
        },
    };
    sætSkriveKilde(() => kilde);
    return { bestillinger, scenarier, kørsler };
}
const ok = (kørsel: string): Svar => ({ ok: true, koersel_id: kørsel, status: "koe", ny: true, arbejder: { startet: true, grund: "" } });
const TABT = new Error("Failed to fetch");
const TEKNISK: Svar = { ok: false, afvist: "Teknisk fejl i startBestilling: forbindelsen døde", teknisk: true };
const UAFKLARET = /Vi ved ikke, om .* blev bestilt — prøv igen/;

const klik = async (navn: RegExp | string) => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: navn })); }); await act(async () => {}); };
const status = () => screen.getByRole("status").textContent ?? "";
const scenarie = (id: string) => ({ id } as Scenarie);

beforeEach(() => {
    glemBestillingsforsøg();
    // Læsesiden (useKoersler i KomIGang): ingen rækker.
    sætLæseKilde(() => ({ data: new Proxy({}, { get: () => ({ select: () => { const q = { where: () => q, orderBy: () => q, first: () => q, after: () => q, executePaginated: async () => ({ items: [], hasNextPage: false, endCursor: null }) }; return q; } }) }) }) as never);
});
afterEach(() => { cleanup(); sætSkriveKilde(null); sætLæseKilde(null); });

describe("fund B · Kør scenariet: klientnøglen beholdes, til udfaldet er kendt", () => {
    it("svaret går tabt efter commit, og brugeren klikker igen: stadig én bestilling og én kørsel", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" />);
        await klik("Kør scenariet");
        expect(status()).toMatch(UAFKLARET);                       // før: "Failed to fetch" — og nøglen var glemt
        expect(status()).not.toMatch(/blev ikke bestilt|blev afvist/);
        await klik("Prøv igen");
        // Før rettelsen: to bestillinger (b1, b2) og to kørsler for samme scenarie.
        expect(l.bestillinger.map((b) => b.id)).toEqual(["b1"]);
        expect([...l.kørsler]).toEqual([["b1", "k1"]]);
        expect(status()).toContain("Kørslen er bestilt");
    });
    it("teknisk: true er også uafklaret — samme nøgle næste gang", async () => {
        const l = lager((nr, k) => (nr === 1 ? TEKNISK : ok(k)));
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" />);
        await klik("Kør scenariet");
        expect(status()).toMatch(UAFKLARET);
        expect(status()).toContain("forbindelsen døde");            // den tekniske detalje står stadig i teksten
        await klik("Prøv igen");
        expect(l.bestillinger.length).toBe(1);
        expect(l.kørsler.size).toBe(1);
    });
    it("nøglen overlever, at siden forlades og åbnes igen (komponenten monteres på ny)", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        const første = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" />);
        await klik("Kør scenariet");
        første.unmount();
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" />);
        await klik(/Kør scenariet|Prøv igen/);
        expect(l.bestillinger.length).toBe(1);
    });
    it("et kendt udfald afslutter forsøget: næste klik er en NY kørsel (som brugeren beder om)", async () => {
        const l = lager((_nr, k) => ok(k));
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" />);
        await klik("Kør scenariet");
        await klik("Kør scenariet");
        expect(l.bestillinger.length).toBe(2);
        expect(l.kørsler.size).toBe(2);
    });
    it("et andet scenarie er en anden kørsel: dets nøgle er dets egen, og det første scenaries uafklarede forsøg huskes", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        const a = render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" />);
        await klik("Kør scenariet");
        a.unmount();
        const b = render(<KoerKnap s={scenarie("s2")} bruger="a@b.dk" />);
        await klik("Kør scenariet");
        b.unmount();
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" />);
        await klik(/Kør scenariet|Prøv igen/);
        expect(l.bestillinger.map((x) => x.scenarie_id)).toEqual(["s1", "s2"]);
    });
    it("en endelig afvisning vises ordret og kaldes ikke uafklaret", async () => {
        lager(() => ({ ok: false, afvist: "Du har allerede 3 kørsler i kø; højst 3 ad gangen. Vent til en er færdig, eller annullér en.", ryddet: true }));
        render(<KoerKnap s={scenarie("s1")} bruger="a@b.dk" />);
        await klik("Kør scenariet");
        expect(status()).toBe("Du har allerede 3 kørsler i kø; højst 3 ad gangen. Vent til en er færdig, eller annullér en.");
        expect(screen.getByRole("button", { name: "Kør scenariet" })).toBeInTheDocument();
    });
});

describe("fund B · Bestil en prøvekørsel: også scenariet beholdes", () => {
    const g = { alle: [{ sti: "time.start", vaerdi_json: '"2025-07-01T00:00:00Z"' }, { sti: "time.end", vaerdi_json: '"2026-06-30T23:00:00Z"' }] } as unknown as Gruppering;
    const vaerk = { id: "v1", kode: "nyt", navn: "Nyt værk", revision: 1, oprettet: new Date(Date.UTC(2026, 10, 23)) };

    it("svaret går tabt, og brugeren klikker igen: ét scenarie, én bestilling, én kørsel", async () => {
        const l = lager((nr, k) => (nr === 1 ? TABT : ok(k)));
        render(<KomIGang vaerk={vaerk} g={g} bruger="a@b.dk" gåTil={() => {}} />);
        await klik("Bestil en prøvekørsel (2 døgn)");
        expect(status()).toMatch(UAFKLARET);
        await klik("Prøv igen");
        // Før rettelsen: to scenarier "Prøvekørsel (2 døgn)", to bestillinger, to kørsler.
        expect(l.scenarier).toEqual(["s1"]);
        expect(l.bestillinger.map((b) => [b.id, b.scenarie_id])).toEqual([["b1", "s1"]]);
        expect(l.kørsler.size).toBe(1);
        expect(status()).toContain("Prøvekørslen er bestilt");
    });
    it("teknisk: true: samme scenarie og samme bestilling næste gang", async () => {
        const l = lager((nr, k) => (nr === 1 ? TEKNISK : ok(k)));
        render(<KomIGang vaerk={vaerk} g={g} bruger="a@b.dk" gåTil={() => {}} />);
        await klik("Bestil en prøvekørsel (2 døgn)");
        expect(status()).toMatch(UAFKLARET);
        await klik("Prøv igen");
        expect([l.scenarier.length, l.bestillinger.length, l.kørsler.size]).toEqual([1, 1, 1]);
    });
});

describe("fund B · parflowet: et uafklaret svar får sin egen tekst", () => {
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

    it("teknisk: true: 'vi ved ikke' — ikke 'blev ikke bestilt' — og scenariet og nøglen beholdes", async () => {
        const l = lager((nr, k) => (nr === 1 ? TEKNISK : ok(k)));
        const d = deps(), tilstand = {};
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", tilstand, d);
        expect(svar.ok).toBe(false);
        // Før rettelsen: "Referencen blev ikke bestilt: Teknisk fejl i startBestilling: forbindelsen døde".
        expect(svar.ok === false && svar.afvist).toMatch(/^Vi ved ikke, om referencen blev bestilt — prøv igen/);
        expect(svar.ok === false && svar.afvist).not.toMatch(/blev ikke bestilt/);
        expect(svar.tilstand.refScenarieId).toBe("s1");
        expect(d.arkiveret).toEqual([]);
        const igen = await opretOgBestilPar(input, "a@b.dk", "N", tilstand, d);
        expect(igen.ok).toBe(true);
        expect(l.bestillinger.map((b) => [b.klient_noegle, b.scenarie_id])).toEqual([["N-r", "s1"], ["N-s", "s2"]]);
        expect(l.kørsler.size).toBe(2);                            // referencen og scenariet — ingen ekstra
    });
    it("et kastet kald (svaret gik tabt): samme tekst, samme tilstand, og genforsøget finder den committede kørsel", async () => {
        const l = lager((nr, k) => (nr === 2 ? TABT : ok(k)));    // scenariets bestilling: committet, svaret tabt
        const d = deps(), tilstand = {};
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", tilstand, d);
        // Før rettelsen kastede opretOgBestilPar "Failed to fetch" videre til siden.
        expect(svar.ok === false && svar.afvist).toMatch(/^Vi ved ikke, om scenariet blev bestilt — prøv igen/);
        expect(svar.tilstand).toMatchObject({ refScenarieId: "s1", refKoerselId: "k1", scenScenarieId: "s2" });
        const igen = await opretOgBestilPar(input, "a@b.dk", "N", tilstand, d);
        expect(igen.ok && igen.tilstand.scenKoerselId).toBe("k2");
        expect(l.bestillinger.length).toBe(2);
        expect(l.kørsler.size).toBe(2);
    });
    it("en endelig afvisning hedder stadig 'blev ikke bestilt'", async () => {
        lager(() => ({ ok: false, afvist: "Du har allerede 3 kørsler i kø." }));
        const svar = await opretOgBestilPar(input, "a@b.dk", "N", {}, deps());
        expect(svar.ok === false && svar.afvist).toBe("Referencen blev ikke bestilt: Du har allerede 3 kørsler i kø.");
    });
});

describe("fund B · ét sted afgør, hvad et svar betyder", () => {
    it("de fire udfald", () => {
        expect(udfaldAfSvar({ ok: true, koersel_id: "k1" }).art).toBe("bestilt");
        expect(udfaldAfSvar({ ok: false, afvist: "x", ryddet: true }).art).toBe("ryddet");
        expect(udfaldAfSvar({ ok: false, afvist: "x" }).art).toBe("afvist");
        expect(udfaldAfSvar({ ok: false, afvist: "x", teknisk: true }).art).toBe("uafklaret");
        // Et "ok" uden kørsel er ikke et kendt udfald.
        expect(udfaldAfSvar({ ok: true, koersel_id: null }).art).toBe("uafklaret");
    });
});
