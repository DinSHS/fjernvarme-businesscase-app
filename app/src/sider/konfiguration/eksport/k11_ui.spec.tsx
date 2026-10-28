// Runde 12b, Codex K11 F3 og F5 i upload-kortet: filvalg, bytes og analyse er én tilstand med et valg-id, så et sent
// analysesvar for et tidligere valg aldrig binder den valgte fil til et andet værk; en ændret værksliste gør analysen
// forældet; og et ark, der kun ændrer felter, genupload ikke gemmer, tilbyder ingen revision.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const t = vi.hoisted(() => ({ analyse: vi.fn(), upload: vi.fn() }));
vi.mock("./analyse", () => ({ analyserUpload: t.analyse }));
vi.mock("../tidsserie-kilde", async (original) => ({
    ...(await original<typeof import("../tidsserie-kilde")>()),
    useVaerksarkimporter: () => ({ data: [], fejl: undefined, indlæser: false, genindlæs: () => {} }),
    uploadVaerksark: t.upload,
}));

import { VaerksarkKort } from "../Vaerksark";
import { GEMMES_IKKE } from "./genkend";

const A = { id: "aaaaaaaa-1111-4111-8111-111111111111", kode: "a", navn: "Vaerk A", revision: 1 };
const B = { id: "bbbbbbbb-2222-4222-8222-222222222222", kode: "b", navn: "Vaerk B", revision: 1 };
const BRUGER = "test@example.org";
const forskel = { felter: [], serier: [], tom: false, gemmes: 1 };

function fil(navn: string, b: number) {
    const f = new File([new Uint8Array([b])], navn, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    Object.defineProperty(f, "arrayBuffer", { value: async () => new Uint8Array([b]).buffer });
    return f;
}
const vælg = async (f: File) => act(async () => { fireEvent.change(screen.getByLabelText("Vælg værksark"), { target: { files: [f] } }); });

beforeEach(() => { t.analyse.mockReset(); t.upload.mockReset(); t.upload.mockResolvedValue({ ok: true, svar: "Værksarket importeres nu." }); });
afterEach(cleanup);

describe("K11 F3: filvalg og analyse kan ikke komme ud af takt", () => {
    it("et sent analysesvar for fil A ignoreres; send bruger fil B's bytes, værk og basis", async () => {
        let svarA: (x: unknown) => void = () => {};
        const venterA = new Promise((r) => { svarA = r; });
        t.analyse.mockImplementationOnce(() => venterA)
            .mockResolvedValueOnce({ art: "revision", vaerk: B, basis: new Uint8Array([9]), forskel });
        render(<VaerksarkKort vaerker={[A, B]} bruger={BRUGER} />);
        await vælg(fil("a.xlsx", 1));
        await waitFor(() => expect(t.analyse).toHaveBeenCalledTimes(1));
        await vælg(fil("b.xlsx", 2));
        await screen.findByRole("button", { name: "Gem som revision 2 af Vaerk B" });
        // A's analyse bliver færdig sidst — på 6c820b2 satte den analysen tilbage til A, mens fil B stod valgt.
        await act(async () => { svarA({ art: "revision", vaerk: A, basis: new Uint8Array([8]), forskel }); await venterA; });
        expect(screen.queryByRole("button", { name: "Gem som revision 2 af Vaerk A" })).toBeNull();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Gem som revision 2 af Vaerk B" })); });
        expect(t.upload).toHaveBeenCalledTimes(1);
        const [filnavn, b64, , , rev] = t.upload.mock.calls[0];
        expect([filnavn, b64, rev]).toEqual(["b.xlsx", btoa(String.fromCharCode(2)), { vaerkId: B.id, revision: 1, basisBase64: btoa(String.fromCharCode(9)) }]);
    });

    it("en ændret revision i værkslisten gør analysen forældet: send er spærret, til arket er læst igen", async () => {
        t.analyse.mockResolvedValue({ art: "revision", vaerk: B, basis: new Uint8Array([9]), forskel });
        const r = render(<VaerksarkKort vaerker={[A, B]} bruger={BRUGER} />);
        await vælg(fil("b.xlsx", 2));
        const knap = await screen.findByRole("button", { name: "Gem som revision 2 af Vaerk B" });
        r.rerender(<VaerksarkKort vaerker={[A, { ...B, revision: 2 }]} bruger={BRUGER} />);
        expect((knap as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByRole("alert").textContent).toMatch(/analysen gælder ikke længere/);
        // Læs igen: analysen køres mod den nye liste (her: konflikt), og der sendes intet.
        t.analyse.mockResolvedValueOnce({ art: "konflikt", vaerk: { ...B, revision: 2 }, arkRevision: 1 });
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Læs arket igen" })); });
        await waitFor(() => expect(t.analyse).toHaveBeenCalledTimes(2));
        expect(t.analyse.mock.calls[1][1]).toEqual([A, { ...B, revision: 2 }]);
        await screen.findByText(/værket er siden ændret \(nu revision 2\)/);
        expect(t.upload).not.toHaveBeenCalled();
    });
});

describe("K11 F5: felter, genupload ikke gemmer", () => {
    it("kun årsproduktionen ændret: ingen knap, og grunden står i tabellen", async () => {
        t.analyse.mockResolvedValue({ art: "ingen_aendringer", vaerk: A, ikkeGemt: [
            { hvor: "Timedata", felt: "Timedata: årsproduktion (GWh)", før: "100", nu: "120", gemmesIkke: GEMMES_IKKE.aarsproduktion },
        ] });
        render(<VaerksarkKort vaerker={[A]} bruger={BRUGER} />);
        await vælg(fil("a.xlsx", 1));
        expect((await screen.findByRole("alert")).textContent).toMatch(/kun felter, der ikke gemmes ved genupload\. Intet bliver gemt/);
        expect(screen.getByRole("table", { name: "Ændringer, der ikke gemmes" }).textContent).toMatch(/100 → 120.*heat_load_params/);
        expect(screen.queryByRole("button", { name: /Gem|Upload/ })).toBeNull();
    });
});
