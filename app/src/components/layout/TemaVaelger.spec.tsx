// Temavælgeren: åbner, skifter tema og modus, lukker på Escape med fokus tilbage, og markerer uofficielle temaer.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TemaVaelger } from "./TemaVaelger";
import { alleTemaer } from "@/styles/tema";

describe("TemaVaelger", () => {
    beforeEach(() => localStorage.clear());

    it("skifter tema og modus og lukker på Escape", () => {
        render(<TemaVaelger />);
        const knap = screen.getByRole("button", { name: /Tema:/ });
        expect(knap).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(knap);
        expect(screen.getByRole("dialog", { name: "Tema" })).toBeInTheDocument();

        act(() => { fireEvent.click(screen.getByRole("radio", { name: /^Papir/ })); });
        expect(document.documentElement.dataset.tema).toBe("papir");
        act(() => { fireEvent.click(screen.getByRole("radio", { name: /Mørk/ })); });
        expect(document.documentElement.dataset.modus).toBe("moerk");

        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(knap).toHaveFocus();
    });

    it("viser ikke et uofficielt temas navn i topbjælken (brief 22: ingen navne i sidehovedet)", () => {
        const uoff = alleTemaer().find((t) => t.uofficielt);
        if (!uoff) return; // den offentlige udgave har ingen
        render(<TemaVaelger />);
        fireEvent.click(screen.getByRole("button", { name: /Tema:/ }));
        act(() => { fireEvent.click(screen.getByRole("radio", { name: new RegExp(`^${uoff.navn.replace(/[()]/g, "\\$&")}`) })); });
        fireEvent.keyDown(document, { key: "Escape" });
        const knap = screen.getByRole("button", { name: /Tema:/ });
        expect(knap.textContent).toBe("Tema");
        expect(knap.getAttribute("aria-label")).not.toContain(uoff.navn);
    });

    it("viser mærketeksten i stedet for beskrivelsen ved temaer uden organisationens godkendelse", () => {
        render(<TemaVaelger />);
        fireEvent.click(screen.getByRole("button", { name: /Tema:/ }));
        for (const t of alleTemaer()) {
            const radio = screen.getByRole("radio", { name: new RegExp(`^${t.navn.replace(/[()]/g, "\\$&")}`) });
            const tekst = radio.closest("label")!.textContent!;
            expect(tekst).toContain(t.uofficielt ? t.maerke! : t.beskrivelse);
            if (t.uofficielt) expect(tekst).not.toContain(t.beskrivelse);
        }
    });
});
