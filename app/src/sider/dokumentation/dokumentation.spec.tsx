import { configure, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dokumentation from "./index";

const vis = (sti: string[]) => render(<Dokumentation sti={sti} gåTil={() => {}} bruger="a@b.dk" />);

// Siderne indlæser teksterne som lazy chunks; i en fuld testkørsel med mange parallelle arbejdere tager det mere end ét sekund.
configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 20000 });

beforeEach(() => { window.scrollTo = vi.fn(); Element.prototype.scrollIntoView = vi.fn(); });

describe("Dokumentation", () => {
    it("indekset viser alle grupper og en kildelinje med licensen", () => {
        vis([]);
        for (const g of ["Kom i gang", "Appen", "Modellen", "Brug", "Balancemarked", "Værket", "Baggrund"]) expect(screen.getByRole("heading", { name: g })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "README — overblik og referencetal" })).toHaveAttribute("href", "#/dokumentation/readme");
        expect(screen.getByRole("link", { name: /Licens \(MIT\)/ })).toHaveAttribute("href", "#/dokumentation/licens");
        expect(screen.getByText(/17 dokumenter i 7 grupper/)).toBeInTheDocument();
    });

    it("README: kildelinje, indholdsfortegnelse og omskrevne links (internt dokument, GitHub ved commit)", async () => {
        vis(["readme"]);
        await screen.findByText(/Fra skj-1964\/fjernvarme-businesscase @ b49aeb0 \(MIT\)/);
        await waitFor(() => expect(screen.getAllByRole("link").some((a) => a.getAttribute("href") === "#/dokumentation/koersel")).toBe(true));
        const pdf = screen.getAllByRole("link").find((a) => /rapport_billund_v4\.pdf$/.test(a.getAttribute("href") ?? ""));
        expect(pdf).toHaveAttribute("href", "https://github.com/skj-1964/fjernvarme-businesscase/blob/b49aeb0af097be42938b80a0fea6acdd77162836/doc/rapport_billund_v4.pdf");
        expect(pdf).toHaveAttribute("rel", "noopener noreferrer");
        expect(pdf).toHaveAttribute("target", "_blank");
        expect(screen.getByRole("navigation", { name: "Indhold" })).toBeInTheDocument();
    });

    it("et anker ruller til overskriften, når teksten er læst ind", async () => {
        vis(["balancemarked#fiktivt-2026-marked-scenarie"]);
        await screen.findByText(/Fra skj-1964/);
        await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
        expect(document.getElementById("a-fiktivt-2026-marked-scenarie")).not.toBeNull();
    });

    it("arkitektur: diagram og tekst", async () => {
        vis(["arkitektur"]);
        expect((await screen.findAllByRole("img", { name: /^Arkitektur/ })).length).toBe(2);
        expect(await screen.findByText(/Modellen regner aldrig i browseren/)).toBeInTheDocument();
    });

    it("PDF bundtes ikke: knap til GitHub ved commit", () => {
        vis(["rapport_v4"]);
        expect(screen.getByRole("link", { name: "Åbn PDF på GitHub" }).getAttribute("href")).toContain("/blob/b49aeb0af097be42938b80a0fea6acdd77162836/doc/rapport_billund_v4.pdf");
    });

    it("regnearket hentes direkte", () => {
        vis(["vaerksdata_skabelon"]);
        expect(screen.getByRole("link", { name: "Hent regnearket" }).getAttribute("href")).toContain("/raw/b49aeb0af097be42938b80a0fea6acdd77162836/doc/vaerksdata_skabelon.xlsx");
    });

    it("ukendt dokument giver en side med veje videre — aldrig en hvid side", () => {
        vis(["findes-ikke"]);
        expect(screen.getByRole("heading", { name: "Dokumentet findes ikke" })).toBeInTheDocument();
        expect(within(document.body).getAllByRole("link").length).toBeGreaterThan(10);
    });

    it("licensen vises uændret", async () => {
        vis(["licens"]);
        expect(await screen.findByText(/Copyright \(c\) 2026 Dansk Fjernvarme/)).toBeInTheDocument();
        expect(screen.getByText(/Permission is hereby granted, free of charge/)).toBeInTheDocument();
    });
});
