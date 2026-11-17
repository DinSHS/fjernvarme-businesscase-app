// Runde 12 i brugerfladen: eksportfanen viser listen "ikke med i arket" FØR arket hentes, og upload-kortet genkender
// et eksporteret ark — diff før bekræftelse, konflikt, ingen ændringer, og uden markering som før. Den rigtige analyse og
// eksport køres; kun datalaget (værkets blade/tidsserier og skabelonen) og skrivningen er udskiftet.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const t = vi.hoisted(() => ({ revision: 1, ret: {} as Record<string, string>, upload: vi.fn() }));
vi.mock("./hent", async () => {
    const d = await import("./testdata");
    return { hentEksportkilde: async () => d.andeby(t.revision, t.ret), hentSkabelon: async () => d.skabelon() };
});
vi.mock("../tidsserie-kilde", async (original) => ({
    ...(await original<typeof import("../tidsserie-kilde")>()),
    useVaerksarkimporter: () => ({ data: [], fejl: undefined, indlæser: false, genindlæs: () => {} }),
    uploadVaerksark: t.upload,
}));

import { VaerksarkKort } from "../Vaerksark";
import { EksportKort } from "./EksportKort";
import { eksporter } from "./eksporter";
import { andeby, ANDEBY_ID, skabelon } from "./testdata";
import { Arbejdsbog } from "./xlsx";

const ANDEBY = { id: ANDEBY_ID, kode: "andeby", navn: "Andeby — fiktivt referenceværk", revision: 1 };

beforeEach(() => { t.revision = 1; t.ret = {}; t.upload.mockReset(); t.upload.mockResolvedValue({ ok: true, svar: "Værksarket importeres nu." }); });
afterEach(cleanup);

async function vælgArk(bytes: Uint8Array, vaerker = [ANDEBY]) {
    const r = render(<VaerksarkKort vaerker={vaerker} bruger="test@example.org" />);
    const fil = new File([bytes as BlobPart], "andeby_rev1.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await act(async () => { fireEvent.change(screen.getByLabelText("Vælg værksark"), { target: { files: [fil] } }); });
    return r;
}

describe("eksportfanen", () => {
    it("viser listen 'ikke med i arket' og en knap til at hente arket — intet hentes af sig selv", async () => {
        const createObjectURL = vi.fn(() => "blob:x");
        Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
        render(<EksportKort vaerk={ANDEBY} />);
        const knap = await screen.findByRole("button", { name: "Hent andeby_rev1.xlsx" }, { timeout: 15_000 });
        expect(createObjectURL).not.toHaveBeenCalled();
        // Runde 14: kortet siger, at de tre faner er appens egne, hvad der er med i dem, og hvad der stadig ikke er.
        expect(screen.getByText(/1 felt er ikke med i arket — se listen, før du henter arket/)).toBeTruthy();
        expect(screen.getByText(/appens egne \(egen antagelse\)/)).toBeTruthy();
        expect(screen.getByText(/modelrepoets script læser dem ikke/)).toBeTruthy();
        for (const fane of ["Start og drift", "Balancemarked", "Øvrige felter"]) {
            expect(document.querySelector(`li[data-fane="${fane}"]`)?.textContent, fane).toMatch(/appens egen fane\): \d+ felter/);
        }
        expect(screen.getByText("Enhed solvarme")).toBeTruthy();              // det eneste, der stadig ikke er med
        expect(screen.queryByText("Enhed fliskedel")).toBeNull();             // slået fra: nu med (Start og drift)
        expect(screen.getByText(/Målt solvarme \(arket Solvarme\): 8\.760 timer; 6\.624 timer er ikke med/)).toBeTruthy();
        fireEvent.click(knap);
        expect(createObjectURL).toHaveBeenCalledTimes(1);
    }, 30_000);
    it("et værk, arket ikke kan bære, nægtes med grunden", async () => {
        // (Slåede-fra tanke nægtes ikke længere: fra runde 14 står de i arket med "i drift: nej".)
        t.ret = { "data.dmi_area": '"groenland"' };
        render(<EksportKort vaerk={ANDEBY} />);
        expect((await screen.findByRole("alert", {}, { timeout: 15_000 })).textContent).toMatch(/DMI-området "groenland" findes ikke i skabelonen/);
        expect(screen.queryByRole("button", { name: /Hent/ })).toBeNull();
    }, 30_000);
    it("et værk med alle tanke slået fra kan eksporteres: 'i drift: nej' står i Start og drift", async () => {
        t.ret = Object.fromEntries(andeby().blade.filter((b) => b.sti.endsWith(".enabled") && b.sti.startsWith("storage.")).map((b) => [b.sti, "false"]));
        render(<EksportKort vaerk={ANDEBY} />);
        expect(await screen.findByRole("button", { name: "Hent andeby_rev1.xlsx" }, { timeout: 15_000 })).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
    }, 30_000);
});

describe("upload-kortet genkender et eksporteret ark", () => {
    it("ændret ark: diff før bekræftelse og 'Gem som revision 2 af Andeby'", async () => {
        const e = await eksporter(andeby(), skabelon());
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark("Anlaeg").sæt("H9", 32.5);
        await vælgArk(wb.bytes());
        const knap = await screen.findByRole("button", { name: "Gem som revision 2 af Andeby — fiktivt referenceværk" }, { timeout: 15_000 });
        const tabel = screen.getByRole("table", { name: "Ændringer i arket" });
        expect(tabel.textContent).toMatch(/Enhed halmkedel.*30.*32,5/);
        expect(screen.queryByLabelText(/timens slut/)).toBeNull();          // en revision læses med timens start (som eksporten)
        await act(async () => { fireEvent.click(knap); });
        expect(t.upload).toHaveBeenCalledWith("andeby_rev1.xlsx", expect.any(String), false, "test@example.org",
            { vaerkId: ANDEBY_ID, revision: 1, basisBase64: expect.any(String) });
        await screen.findByText("Værksarket importeres nu.");
    }, 30_000);
    it("værket er ændret siden eksporten: konflikt, ingen knap", async () => {
        const e = await eksporter(andeby(), skabelon());
        t.revision = 2;
        await vælgArk(e.bytes, [{ ...ANDEBY, revision: 2 }]);
        const a = await screen.findByRole("alert", {}, { timeout: 15_000 });
        expect(a.textContent).toMatch(/revision 1, men værket er siden ændret \(nu revision 2\)\. Intet bliver gemt/);
        expect(screen.queryByRole("button", { name: /Gem|Upload/ })).toBeNull();
        expect(t.upload).not.toHaveBeenCalled();
    }, 30_000);
    it("runde 14 (brugertesten F3): et markeret ark kan i stedet blive et nyt værk; en eksisterende kode spærrer", async () => {
        const e = await eksporter(andeby(), skabelon());
        t.revision = 2;                                                                  // en konflikt: som revision spærret
        const kopi = { id: "11111111-2222-4333-8444-555555555555", kode: "andeby_fiktivt_referencevaerk", navn: "Kopi", revision: 1 };
        await vælgArk(e.bytes, [{ ...ANDEBY, revision: 2 }, kopi]);
        await screen.findByRole("alert", {}, { timeout: 15_000 });
        const valg = screen.getByLabelText(/Opret som nyt værk i stedet — arket hører til Andeby — fiktivt referenceværk \(kode andeby\)/);
        await act(async () => { fireEvent.click(valg); });
        // Værkets navn i Priser giver koden andeby_fiktivt_referencevaerk, som findes: intet kan sendes.
        expect(document.querySelector('[data-tilstand="kode_findes"]')?.textContent).toMatch(/koden andeby_fiktivt_referencevaerk findes allerede/);
        expect(screen.queryByRole("button", { name: /Upload|Gem/ })).toBeNull();
        cleanup();
        // Et nyt navn i Priser: arket sendes som et nyt værk — uden basis, og Andeby røres ikke.
        const wb = new Arbejdsbog(e.bytes);
        wb.regneark("Priser").sæt("B30", "Mit Værk");
        await vælgArk(wb.bytes(), [{ ...ANDEBY, revision: 2 }, kopi]);
        await screen.findByRole("alert", {}, { timeout: 15_000 });
        await act(async () => { fireEvent.click(screen.getByLabelText(/Opret som nyt værk i stedet/)); });
        expect(document.querySelector('[data-tilstand="nyt_fra_markeret"]')?.textContent).toMatch(/med koden mit_vaerk/);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Upload og importér" })); });
        expect(t.upload).toHaveBeenCalledWith("andeby_rev1.xlsx", expect.any(String), false, "test@example.org");
    }, 60_000);
    it("uændret ark: 'Ingen ændringer' og intet at gemme", async () => {
        const e = await eksporter(andeby(), skabelon());
        await vælgArk(e.bytes);
        await waitFor(() => expect(document.querySelector('[data-tilstand="ingen_aendringer"]')).not.toBeNull(), { timeout: 15_000 });
        expect(screen.queryByRole("button", { name: /Gem|Upload/ })).toBeNull();
    }, 30_000);
    it("uden markering: et nyt værk som før (med timeslut-valget)", async () => {
        await vælgArk(skabelon());
        const knap = await screen.findByRole("button", { name: "Upload og importér" }, { timeout: 15_000 });
        await waitFor(() => expect((knap as HTMLButtonElement).disabled).toBe(false));
        expect(screen.getByLabelText(/timens slut/)).toBeTruthy();
        await act(async () => { fireEvent.click(knap); });
        expect(t.upload).toHaveBeenCalledWith("andeby_rev1.xlsx", expect.any(String), false, "test@example.org");
    }, 30_000);
});
