// Guiden i browseren: trin for trin til "Opret værk", med opretVaerk mocket (backend kaldes ikke).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { sætLæseKilde } from "@/lib/data/laes";

const opretVaerk = vi.fn(async () => ({ ok: true, status: "udfoert", svar: "Værket er oprettet.", revision: 1 }));
vi.mock("@/lib/data/skriv", async (orig) => ({ ...(await orig<typeof import("@/lib/data/skriv")>()), opretVaerk: (...a: unknown[]) => opretVaerk(...(a as [])) }));

import NytVaerk from "./NytVaerk";

// Én eksisterende værkskode ("andeby"), så kodekollisionen kan prøves.
sætLæseKilde(() => ({
    data: new Proxy({}, {
        get: (_t, entitet) => ({
            select: () => {
                const q = { where: () => q, orderBy: () => q, first: () => q, after: () => q,
                    executePaginated: async () => ({ items: entitet === "Vaerk" ? [{ id: "v1", kode: "andeby", navn: "Andeby", revision: 1, arkiveret: false }] : [], hasNextPage: false, endCursor: null }) };
                return q;
            },
        }),
    }),
}));
afterEach(() => opretVaerk.mockClear());

const knap = (t: string) => screen.getByRole("button", { name: t });

describe("Nyt værk — guiden", () => {
    it("Næste er spærret, til trinnet er udfyldt; en optaget kode stopper", async () => {
        render(<NytVaerk sti={["nyt"]} gåTil={() => {}} bruger="planlaegger@example.com" />);
        await act(async () => {});
        expect(knap("Næste")).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/^Navn/), { target: { value: "Andeby" } });
        await act(async () => {});
        expect(screen.getByText(/Koden andeby er i brug/)).toBeInTheDocument();
        expect(knap("Næste")).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/^Navn/), { target: { value: "Fjernvarme Vesterby" } });
        expect(knap("Næste")).toBeEnabled();
    });

    it("gennem alle syv trin til Opret værk: opretVaerk får koden, navnet og skabelonens blade; derefter kom-i-gang", async () => {
        const gåTil = vi.fn();
        render(<NytVaerk sti={["nyt"]} gåTil={gåTil} bruger="planlaegger@example.com" />);
        await act(async () => {});
        fireEvent.change(screen.getByLabelText(/^Navn/), { target: { value: "Fjernvarme Vesterby" } });
        for (let i = 0; i < 6; i++) fireEvent.click(knap("Næste"));
        expect(screen.getByRole("heading", { name: /Gennemse og opret/ })).toBeInTheDocument();
        await act(async () => { fireEvent.click(knap("Opret værk")); });
        expect(opretVaerk).toHaveBeenCalledTimes(1);
        const [kode, navn, blade, bruger] = opretVaerk.mock.calls[0] as unknown as [string, string, { sti: string; vaerdi_json: string }[], string];
        expect([kode, navn, bruger]).toEqual(["fjernvarme_vesterby", "Fjernvarme Vesterby", "planlaegger@example.com"]);
        const m = new Map(blade.map((b) => [b.sti, b.vaerdi_json]));
        expect(m.get("meta.case_name")).toBe('"fjernvarme_vesterby"');
        expect(m.get("units.gaskedel.type")).toBe('"gas_boiler"');
        expect(m.get("storage")).toBe("{}");
        expect(gåTil).toHaveBeenCalledWith("konfiguration/fjernvarme_vesterby/kom-i-gang");
    });
});
