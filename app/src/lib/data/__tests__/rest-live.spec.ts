// rest-adapteren mod en KØRENDE community-server (community/API.md) gennem det rigtige datalag.
// Springes over uden FJV_REST_URL. Kør:
//   python -m fjernvarme_app --data <kort sti> --port 8791 --bruger webtest@example.org --demo --uden-arbejder --ikke-aaben
//   FJV_REST_URL=http://127.0.0.1:8791 npx vitest run src/lib/data/__tests__/rest-live.spec.ts
// Skriver kun testrækker med navnet "Test fv-web …" i serverens database (en lokal demo-database, aldrig Fabric).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hentDataKilde, sætFetch } from "@/backend/rest/data";
import { bootstrapAuth } from "@/backend/rest/auth";
import { læs, læsÉn, sætLæseKilde, type LæseKilde } from "../laes";
import { Afvist, afstem, annullerKoersel, bestilKoersel, gemScenarieAendringer, opdaterScenarie, opretScenarie, sætSkriveKilde, type SkriveKilde } from "../skriv";

const URL_ = process.env.FJV_REST_URL?.replace(/\/+$/, "");

describe.skipIf(!URL_)("rest mod en kørende server", () => {
    let bruger = "";
    beforeAll(async () => {
        sætFetch(((sti: string, init?: RequestInit) => fetch(`${URL_}${sti}`, init)) as typeof fetch);
        sætLæseKilde(() => hentDataKilde() as unknown as LæseKilde);
        sætSkriveKilde(() => hentDataKilde() as unknown as SkriveKilde);
        const s = await bootstrapAuth().initEmbeddedAuth();
        bruger = s?.user?.email ?? "";
    });
    afterAll(() => { sætFetch(null); sætLæseKilde(null); sætSkriveKilde(null); });

    it("session giver serverens bruger", () => {
        expect(bruger).toMatch(/@/);
    });

    it("værker og blade læses pagineret (flere sider end standardsiden)", async () => {
        const vaerker = await læs("Vaerk", { sortering: { navn: "asc" } });
        expect(vaerker.length).toBeGreaterThanOrEqual(1);
        const andeby = vaerker.find((v) => v.kode === "andeby") ?? vaerker[0];
        // sidestørrelse 50 tvinger flere sider: rækkerne skal være de samme som ved én stor side.
        const små = await læs("VaerkParameter", { filter: { vaerk_id: { eq: andeby.id } }, sortering: { raekkefoelge: "asc" }, sidestørrelse: 50 });
        const store = await læs("VaerkParameter", { filter: { vaerk_id: { eq: andeby.id } }, sortering: { raekkefoelge: "asc" } });
        expect(små.length).toBeGreaterThan(50);
        expect(små.map((r) => r.id)).toEqual(store.map((r) => r.id));
        expect(new Set(små.map((r) => r.id)).size).toBe(små.length);
        // typer som datalaget forventer
        expect(typeof små[0].raekkefoelge).toBe("number");
        expect(typeof små[0].bekraeft).toBe("boolean");
        expect(små[0].id).toBe(små[0].id.toLowerCase());
        expect(await læsÉn("Vaerk", andeby.id)).toMatchObject({ id: andeby.id, kode: andeby.kode });
        // or-filter + tid som Date
        const units = await læs("VaerkParameter", { filter: { and: [{ vaerk_id: { eq: andeby.id } }, { or: [{ sektion: { eq: "units" } }, { sektion: { eq: "storage" } }] }] } });
        expect(units.every((r) => r.sektion === "units" || r.sektion === "storage")).toBe(true);
        expect(andeby.oprettet === undefined || andeby.oprettet instanceof Date || andeby.oprettet === null).toBe(true);
    });

    it("et ukendt felt i filteret er en fejl, ikke et tavst tomt filter", async () => {
        await expect(læs("Vaerk", { filter: { findes_ikke: { eq: 1 } } })).rejects.toMatchObject({ kode: "ugyldig" });
    });

    let scenarieId = "";
    it("scenarie: opret, ret, ændringer (opret/ret/slet)", async () => {
        const [v] = await læs("Vaerk", { filter: { kode: { eq: "andeby" } } });
        expect(v).toBeTruthy();
        const s = await opretScenarie({
            vaerk_id: v.id, navn: "Test fv-web rest-adapter", beskrivelse: "testrække (fv-web)", periode_start: "2026-01-05", periode_slut: "2026-01-06",
            med_balancering: false,
        } as never, bruger);
        expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(s.oprettet_af).toBe(bruger);

        const r = await opdaterScenarie(s.id, { beskrivelse: "rettet (fv-web)" });
        expect(r.beskrivelse).toBe("rettet (fv-web)");

        await gemScenarieAendringer(s.id, [], [{ type: "set", sti: "prices.gas.value", vaerdi_json: "300.0" }]);
        let æ = await læs("ScenarieAendring", { filter: { scenarie_id: { eq: s.id } } });
        expect(æ).toHaveLength(1);
        await gemScenarieAendringer(s.id, æ, [{ type: "set", sti: "prices.gas.value", vaerdi_json: "310.0" }]);
        æ = await læs("ScenarieAendring", { filter: { scenarie_id: { eq: s.id } } });
        expect(æ.map((x) => x.vaerdi_json)).toEqual(["310.0"]);
        await gemScenarieAendringer(s.id, æ, []);
        expect(await læs("ScenarieAendring", { filter: { scenarie_id: { eq: s.id } } })).toHaveLength(0);
        scenarieId = s.id;
    });

    // Kræver fv-ports logik.tjenester i serveren (startBestilling/annullerKoersel).
    it("bestil, gentaget bestilling afvises, annullér", async () => {
        expect(scenarieId).toBeTruthy();
        const s = { id: scenarieId };
        const nøgle = crypto.randomUUID();
        const b = await bestilKoersel(s.id, bruger, nøgle);
        expect(b.ok).toBe(true);
        expect(b.koersel_id).toBeTruthy();
        await expect(bestilKoersel(s.id, bruger, nøgle)).rejects.toEqual(new Afvist("Bestillingen er allerede sendt — se kørselslisten."));

        const a = await annullerKoersel(b.koersel_id!);
        expect(a.ok).toBe(true);
        const k = await læsÉn("Koersel", b.koersel_id!);
        expect(k?.status).toBe("annulleret");

        await opdaterScenarie(s.id, { arkiveret: true });
    });

    it("en række i en andens navn afvises med Afvist (policy)", async () => {
        const [v] = await læs("Vaerk", { filter: { kode: { eq: "andeby" } } });
        await expect(opretScenarie({ vaerk_id: v.id, navn: "Test fv-web policy", med_balancering: false } as never, "en.anden@example.org"))
            .rejects.toBeInstanceOf(Afvist);
    });

    it("klienten kan ikke skrive et værk direkte (ikke_tilladt -> Afvist)", async () => {
        await expect(hentDataKilde().data.Vaerk.create({ kode: "test_fvweb", navn: "x" })).rejects.toMatchObject({ kode: "ikke_tilladt" });
    });

    it("afstem svarer i Functions-formen", async () => {
        const r = await afstem();
        expect(r).toHaveProperty("tjekket");
    });
});
