// rest-adapteren (src/backend/rest/) mod en falsk fetch, der opfører sig som community/API.md:
// hooks' læsevej (læs → hentAlle) og skrivehjælperne skal give det SAMME som mod Rayfin-klienten.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hentDataKilde, kaldApi, sætFetch } from "@/backend/rest/data";
import { bootstrapAuth, sessionsinfo } from "@/backend/rest/auth";
import { KildeFejl } from "../kilde";
import { læs, sætLæseKilde, type LæseKilde } from "../laes";
import { Afvist, bestilKoersel, gemScenarieAendringer, oversætFejl, sætSkriveKilde, type SkriveKilde } from "../skriv";

interface Kald { metode: string; url: URL; krop: unknown }
let kald: Kald[] = [];
type Svar = { status?: number; json?: unknown; tekst?: string };
let svar: (k: Kald) => Svar;

function falskFetch(): typeof fetch {
    return (async (adresse: RequestInfo | URL, init?: RequestInit) => {
        const k = { metode: init?.method ?? "GET", url: new URL(String(adresse), "http://localhost"), krop: init?.body ? JSON.parse(String(init.body)) : undefined };
        kald.push(k);
        const s = svar(k);
        const tekst = s.tekst ?? (s.json === undefined ? "" : JSON.stringify(s.json));
        return new Response(tekst, { status: s.status ?? 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
}

beforeEach(() => {
    kald = [];
    sætFetch(falskFetch());
    sætLæseKilde(() => hentDataKilde() as unknown as LæseKilde);
    sætSkriveKilde(() => hentDataKilde() as unknown as SkriveKilde);
});
afterEach(() => { sætFetch(null); sætLæseKilde(null); sætSkriveKilde(null); });

describe("læsning", () => {
    it("pagineres til hasNextPage er falsk, med filter og sortering uændret i URL'en", async () => {
        const rækker = Array.from({ length: 1203 }, (_, i) => ({ id: `ID-${i}`, vaerk_id: "V", sti: `s.${i}`, vaerdi_json: "1", sektion: "units", bekraeft: false, raekkefoelge: i }));
        svar = (k) => {
            const first = Number(k.url.searchParams.get("first"));
            const fra = Number(k.url.searchParams.get("after") ?? 0);
            const side = rækker.slice(fra, fra + first);
            const næste = fra + first < rækker.length;
            return { json: { items: side, hasNextPage: næste, endCursor: næste ? String(fra + first) : null } };
        };
        const filter = { and: [{ vaerk_id: { eq: "V" } }, { or: [{ sektion: { eq: "units" } }, { sektion: { eq: "storage" } }] }] };
        const r = await læs("VaerkParameter", { filter, sortering: { raekkefoelge: "asc" } });

        expect(r).toHaveLength(1203);
        expect(kald.map((k) => k.url.searchParams.get("after"))).toEqual([null, "500", "1000"]);
        for (const k of kald) {
            expect(k.metode).toBe("GET");
            expect(k.url.pathname).toBe("/api/data/VaerkParameter");
            expect(JSON.parse(k.url.searchParams.get("filter")!)).toEqual(filter);
            expect(JSON.parse(k.url.searchParams.get("orderBy")!)).toEqual({ raekkefoelge: "asc" });
            expect(k.url.searchParams.get("first")).toBe("500");
            // select(felter) -> fields, samme udvalg som mod DAB (API.md).
            expect(k.url.searchParams.get("fields")!.split(",")).toEqual(expect.arrayContaining(["id", "vaerk_id", "sti", "vaerdi_json"]));
        }
        // normaliser() er harmløs på rigtige JSON-typer: id'er med små bogstaver, tal forbliver tal.
        expect(r[0].id).toBe("id-0");
        expect(r[0].raekkefoelge).toBe(0);
    });

    it("datoer i et filter sendes som ISO-UTC", async () => {
        svar = () => ({ json: { items: [], hasNextPage: false, endCursor: null } });
        await læs("KoerselTime", { filter: { and: [{ koersel_id: { eq: "k" } }, { tid: { gte: new Date("2026-01-05T00:00:00Z") } }] } });
        expect(kald[0].url.searchParams.get("filter")).toContain('"gte":"2026-01-05T00:00:00.000Z"');
    });

    it("et svar uden hasNextPage er en fejl, ikke én side (ellers tavst for få rækker)", async () => {
        svar = () => ({ json: { items: [{ id: "a" }] } });
        await expect(læs("Vaerk")).rejects.toBeInstanceOf(KildeFejl);
    });

    it("en server, der altid siger hasNextPage, stopper ved loftet i stedet for at hænge", async () => {
        let n = 0;
        svar = () => ({ json: { items: [], hasNextPage: true, endCursor: String(++n) } });
        await expect(læs("Vaerk")).rejects.toThrow(/stoppede efter/);
    });
});

describe("fejl fra serveren", () => {
    it("fejlkode + dansk besked bliver KildeFejl", async () => {
        svar = () => ({ status: 400, json: { fejl: { kode: "ugyldig", besked: "Vaerk har intet felt 'x'" } } });
        await expect(kaldApi("GET", "/api/data/Vaerk")).rejects.toMatchObject({ kode: "ugyldig", status: 400, message: "Vaerk har intet felt 'x'" });
    });
    it("et svar uden fejlkode (fx 502 fra en proxy) bliver 'ukendt' med status og tekst", async () => {
        svar = () => ({ status: 502, tekst: "<html>Bad gateway</html>" });
        await expect(kaldApi("GET", "/api/session")).rejects.toMatchObject({ kode: "ukendt", status: 502 });
    });
    it("en ukendt fejlkode fra serveren tolkes ikke som en kendt", async () => {
        svar = () => ({ status: 409, json: { fejl: { kode: "noget_nyt", besked: "Hov" } } });
        await expect(kaldApi("GET", "/x")).rejects.toMatchObject({ kode: "ukendt", message: "Hov" });
    });
    it("ingen forbindelse bliver 'netvaerk' med en forklaring", async () => {
        sætFetch((async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch);
        await expect(kaldApi("GET", "/api/session")).rejects.toMatchObject({ kode: "netvaerk" });
        await expect(kaldApi("GET", "/api/session")).rejects.toThrow(/Kører fjernvarme_app/);
    });
    it("200 med noget, der ikke er JSON, er en fejl", async () => {
        svar = () => ({ tekst: "<!doctype html>" });
        await expect(kaldApi("GET", "/api/data/Vaerk")).rejects.toBeInstanceOf(KildeFejl);
    });
    it("oversætFejl giver samme Afvist som DAB's tekster", () => {
        expect(oversætFejl(new KildeFejl("unik", "UNIQUE constraint failed"))).toEqual(new Afvist("Findes allerede (samme nøgle)."));
        expect(oversætFejl(new Error("A record with the same unique value already exists"))).toEqual(new Afvist("Findes allerede (samme nøgle)."));
        const p = oversætFejl(new KildeFejl("policy", "Du kan kun oprette i dit eget navn."));
        expect(p).toBeInstanceOf(Afvist);
        expect(p.message).toBe("Du kan kun oprette i dit eget navn.");
        expect(oversætFejl(new KildeFejl("ikke_tilladt", ""))).toBeInstanceOf(Afvist);
        const n = new KildeFejl("netvaerk", "nede");
        expect(oversætFejl(n)).toBe(n);
        // findes_ikke og teknisk er fejl, ikke afvisninger (API.md › Fejl).
        for (const kode of ["findes_ikke", "teknisk"] as const) {
            const f = new KildeFejl(kode, "x");
            expect(oversætFejl(f)).toBe(f);
        }
    });
});

describe("skrivning", () => {
    it("bestilling: POST rækken, derefter Functionen; dato som ISO", async () => {
        svar = (k) => k.url.pathname === "/api/data/Bestilling"
            ? { json: { id: "b1", ...(k.krop as object) } }
            : { json: { ok: true, koersel_id: "k1", status: "koe", ny: true } };
        const r = await bestilKoersel("s1", "a@b.dk", "noegle-1");
        expect(r).toMatchObject({ ok: true, koersel_id: "k1" });
        expect(kald.map((k) => `${k.metode} ${k.url.pathname}`)).toEqual(["POST /api/data/Bestilling", "POST /api/fn/startBestilling"]);
        expect(kald[0].krop).toMatchObject({ scenarie_id: "s1", klient_noegle: "noegle-1", bestilt_af: "a@b.dk" });
        expect((kald[0].krop as { bestilt: string }).bestilt).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
        expect(kald[1].krop).toEqual({ bestillingId: "b1" });
    });

    it("en gentaget bestilling (unik) giver samme besked som i Fabric", async () => {
        svar = () => ({ status: 409, json: { fejl: { kode: "unik", besked: "Bestillings.klient_noegle findes allerede" } } });
        await expect(bestilKoersel("s1", "a@b.dk", "noegle-1")).rejects.toEqual(new Afvist("Bestillingen er allerede sendt — se kørselslisten."));
    });

    it("scenarieændringer: DELETE/PATCH på id i stien, POST for nye", async () => {
        svar = (k) => ({ json: k.metode === "DELETE" ? { id: "x" } : { id: "ny", ...(k.krop as object) } });
        await gemScenarieAendringer("s1",
            [{ id: "A", scenarie_id: "s1", type: "set", sti: "prices.gas.value", vaerdi_json: "1", raekkefoelge: 1 },
             { id: "B", scenarie_id: "s1", type: "disable", sti: "kedel", raekkefoelge: 2 }],
            [{ type: "set", sti: "prices.gas.value", vaerdi_json: "2" }, { type: "enable", sti: "vp" }]);
        expect(kald.map((k) => `${k.metode} ${k.url.pathname}`)).toEqual([
            "DELETE /api/data/ScenarieAendring/B",
            "PATCH /api/data/ScenarieAendring/A",
            "POST /api/data/ScenarieAendring",
        ]);
        expect(kald[1].krop).toEqual({ type: "set", vaerdi_json: "2", raekkefoelge: 1 });
    });

    it("ret og slet uden id afvises lokalt", async () => {
        svar = () => ({ json: {} });
        const k = hentDataKilde();
        await expect(k.data.Scenarie.update({} as { id: string }, { navn: "x" })).rejects.toMatchObject({ kode: "ugyldig" });
        expect(kald).toHaveLength(0);
    });

    it("datakilden ligner ikke et løfte (await på den kalder ingen entitet)", async () => {
        const k = hentDataKilde();
        expect(await k.data).toBe(k.data);
        expect(kald).toHaveLength(0);
    });
});

describe("session", () => {
    it("serverens bruger bliver sessionens e-mail", async () => {
        svar = () => ({ json: { bruger: "planlaegger@example.org", udgave: "community", version: "0.1.0", skemaversion: 1 } });
        const s = await bootstrapAuth().initEmbeddedAuth();
        expect(s).toEqual({ isAuthenticated: true, user: { email: "planlaegger@example.org" } });
        expect(sessionsinfo()).toMatchObject({ udgave: "community", skemaversion: 1 });
    });
    it("ingen bruger = ingen session (porten viser forklaringen)", async () => {
        svar = () => ({ json: { bruger: null, udgave: "community" } });
        expect(await bootstrapAuth().initEmbeddedAuth()).toBeNull();
    });
    it("401 (proxy-headeren mangler) = ingen session, ikke et nedbrud", async () => {
        svar = () => ({ status: 401, json: { fejl: { kode: "policy", besked: "Ingen bruger i X-Forwarded-Email" } } });
        expect(await bootstrapAuth().initEmbeddedAuth()).toBeNull();
    });
    it("en server, der er nede, er en fejl med forklaring (ikke 'ingen bruger')", async () => {
        sætFetch((async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch);
        await expect(bootstrapAuth().initEmbeddedAuth()).rejects.toMatchObject({ kode: "netvaerk" });
    });
});
