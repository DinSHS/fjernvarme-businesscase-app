// "Genindlæs appen" i stedet for en død side, når en del af appen ikke kan hentes (fejlen 2026-10-19).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { erIndlaesningsfejl, installérIndlaesningsvagt, nulstilForældet, useForældet } from "./genindlaes";
import { OmraadeFejl } from "@/App";

afterEach(() => nulstilForældet());

describe("erIndlaesningsfejl", () => {
    it("genkender brugerens fejl ordret og browsernes varianter", () => {
        expect(erIndlaesningsfejl(new Error("Unable to preload CSS for /assets/dokumentation-3M7-JGRw.css"))).toBe(true);
        expect(erIndlaesningsfejl(new TypeError("Failed to fetch dynamically imported module: https://x/assets/a.js"))).toBe(true);
        expect(erIndlaesningsfejl(new TypeError("error loading dynamically imported module"))).toBe(true);
        expect(erIndlaesningsfejl(new TypeError("Importing a module script failed."))).toBe(true);
    });
    it("en almindelig sidefejl er ikke en indlæsningsfejl", () => {
        expect(erIndlaesningsfejl(new Error("Cannot read properties of undefined (reading 'navn')"))).toBe(false);
        expect(erIndlaesningsfejl(undefined)).toBe(false);
    });
});

describe("vite:preloadError", () => {
    it("markerer appen forældet (bjælken)", () => {
        const mål = new EventTarget();
        installérIndlaesningsvagt(mål as unknown as Window);
        const Vis = () => <span>{useForældet() ? "forældet" : "frisk"}</span>;
        render(<Vis />);
        expect(screen.getByText("frisk")).toBeTruthy();
        act(() => { mål.dispatchEvent(new Event("vite:preloadError")); });
        expect(screen.getByText("forældet")).toBeTruthy();
    });
});

describe("områdets fejlgrænse", () => {
    it("en indlæsningsfejl giver 'Genindlæs appen', ikke 'Prøv igen'", () => {
        render(<OmraadeFejl error={new Error("Unable to preload CSS for /assets/dokumentation-3M7-JGRw.css")} resetErrorBoundary={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Genindlæs appen" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Prøv igen" })).toBeNull();
        expect(screen.getByText("Appen skal genindlæses")).toBeTruthy();
    });
    it("en almindelig sidefejl giver stadig 'Prøv igen'", () => {
        render(<OmraadeFejl error={new Error("noget gik galt i siden")} resetErrorBoundary={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Prøv igen" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Genindlæs appen" })).toBeNull();
    });
});
