import { configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FjvSchema } from "../../../rayfin/data/schema";

type Koersel = FjvSchema["Koersel"];
const state = {
    koersler: [] as Koersel[],
    vaerker: [{ id: "v1", kode: "billund_spora" }] as unknown[],
    scenarier: [{ id: "s1", vaerk_id: "v1", med_balancering: true }] as unknown[],
};

// Datalaget erstattes: siderne læser kun via disse hooks.
vi.mock("@/lib/data/hooks", () => {
    const ok = <T,>(data: T) => ({ data, fejl: undefined, indlæser: false, genindlæs: () => {} });
    return {
        useVaerker: () => ok(state.vaerker),
        useScenarier: () => ok(state.scenarier),
        useKoersler: () => ok(state.koersler),
        useScenarieAendringerFor: () => ok([]),
    };
});

import Information from "./index";

// Antallet læses af selve teksten (fv-ekspert udbygger den), ikke skrives ind her.
const begraensningerRå = Object.values(import.meta.glob("../dokumentation/indhold/viden/begraensninger.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>)[0];
const emnerRå = Object.values(import.meta.glob("../dokumentation/indhold/viden/emner.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>)[0];
const antalEmner = (JSON.parse(emnerRå) as { emner: unknown[] }).emner.length; // Opslag (ordliste, begrænsninger) tælles ikke med
const antalBegraensninger = (begraensningerRå.match(/^\| \*\*/gm) ?? []).length;

const vis = (sti: string[]) => render(<Information sti={sti} gåTil={() => {}} bruger="a@b.dk" />);
const k = (o: Partial<Koersel>) => ({
    id: "2e345787-3a37-4c5f-a1b4-ecfd321355c1", vaerk_id: "v1", scenarie_id: "s1", status: "faerdig", objektiv_dkk: 4698361.33,
    afsluttet: new Date("2026-10-16T07:32:12Z"), oensket_rel_gap: 0.005, oensket_abs_gap: 5000, opnaaet_gap: 0.000501, model_commit: "b49aeb0af097be42938b80a0fea6acdd77162836",
    data_commit: "392992c7fe35992e79fba8d1ba7b91967e8d1481", ...o,
}) as Koersel;

// Siderne indlæser teksterne som lazy chunks; i en fuld testkørsel med mange parallelle arbejdere tager det mere end ét sekund.
configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 20000 });

beforeEach(() => {
    state.vaerker = [{ id: "v1", kode: "billund_spora" }];
    state.scenarier = [{ id: "s1", vaerk_id: "v1", med_balancering: true }];
    state.koersler = [];
    window.scrollTo = vi.fn(); Element.prototype.scrollIntoView = vi.fn();
});

describe("Information", () => {
    it("forsiden: gør/kan ikke, veje videre og et budskab regnet af teksten", async () => {
        vis([]);
        expect(await screen.findByRole("heading", { name: /^Hvad modellen gør/ })).toBeInTheDocument();
        expect(await screen.findByText(/4 trin fra værk til sammenligning · 3 regler for tallene/)).toBeInTheDocument();
        expect(await screen.findByText(new RegExp(`${antalEmner} emner, 43 fagord og 5 referencetal`))).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Solvergab" })).toHaveAttribute("href", "#/information/solvergab");
        expect(screen.getByText(new RegExp(`de 4 vigtigste af ${antalBegraensninger}`))).toBeInTheDocument();
    });

    it("et emne: sidens budskab er tekstens første sætning, og forrige/næste findes", async () => {
        vis(["solvergab"]);
        expect(await screen.findByText(/Solveren stopper, når den har bevist/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /← Differensmetoden/ })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Balancemarkedet: aFRR og mFRR →/ })).toBeInTheDocument();
    });

    it("ukendt emne: emnelisten vises", async () => {
        vis(["nej"]);
        expect(await screen.findByRole("heading", { name: "Emnet findes ikke" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Ordliste" })).toBeInTheDocument();
    });

    it("ordlisten: søgning, ingen fund, og et anker markerer ordet og ruller til det", async () => {
        const { unmount } = vis(["ordliste"]);
        const felt = await screen.findByRole("searchbox");
        expect(await screen.findByText("aFRR")).toBeInTheDocument();
        fireEvent.change(felt, { target: { value: "solvergab" } });
        expect(screen.getByText("Gab (solvergab, MIP-gab)")).toBeInTheDocument();
        expect(screen.queryByText("aFRR")).toBeNull();
        fireEvent.change(felt, { target: { value: "xyzxyz" } });
        expect(screen.getByText(/Ingen fagord passer på «xyzxyz»/)).toBeInTheDocument();
        unmount();

        vis(["ordliste#mip-gab"]);
        const post = (await screen.findByText("Gab (solvergab, MIP-gab)")).closest(".fjv-ord");
        expect(post).toHaveAttribute("data-maal", "true");
        await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
        expect(document.getElementById("o-mip-gab")).not.toBeNull();
        expect(document.querySelectorAll('.fjv-ord[data-maal="true"]')).toHaveLength(1);
    });

    it("referencetal uden kørsler: README-tallene vises, og status siger 'ikke kørt endnu'", async () => {
        vis(["referencetal"]);
        expect(await screen.findAllByText("ikke kørt endnu")).toHaveLength(5);
        expect(screen.getAllByText("4.698.390").length).toBeGreaterThan(0);
    });

    it("referencetal med Spor A-kørslen: Fabric-tal, afvigelse og link til kørslen", async () => {
        state.koersler = [k({})];
        vis(["referencetal"]);
        expect(await screen.findByText("inden for tolerancen")).toBeInTheDocument();
        expect(screen.getByText("0,5 % og 5.000 kr.")).toBeInTheDocument(); // kørslens gab vises (I1)
        expect(screen.getByText(/opnået 0,0501 %/)).toBeInTheDocument();
        expect(screen.getByText("4.698.361")).toBeInTheDocument();
        expect(screen.getByText("−0,0006 %")).toBeInTheDocument();
        expect(screen.getByText("±23.492")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /2e345787/ })).toHaveAttribute("href", "#/analyser/2e345787-3a37-4c5f-a1b4-ecfd321355c1");
        expect((await screen.findAllByText(/1 af 5 er genskabt/)).length).toBeGreaterThan(0);
    });

    it("I2: tolerancen forklares som casens eget solvergab — ikke som noget README selv tillader", async () => {
        state.koersler = [k({})];
        const { container } = vis(["referencetal"]);
        await screen.findByText("inden for tolerancen");
        const tekst = container.textContent ?? "";
        expect(tekst).toMatch(/Tolerance = casens eget solvergab, max\(absolut gab, relativt gab × objektiv\)/);
        expect(tekst).toMatch(/README angiver ingen tolerance selv/);
        expect(tekst).not.toMatch(/det, README selv tillader/);
        expect(tekst).not.toMatch(/README's tolerance/);
    });

    it("I1: Spor B kørt med strammere gab vises som genskabt — ikke som 'ikke kørt endnu' — med kørslens gab", async () => {
        const tæt = { ...k({ id: "d09aaaaa-0000-0000-0000-000000000000", objektiv_dkk: 3964586.28, oensket_rel_gap: 0.0002, oensket_abs_gap: 1000, opnaaet_gap: 0.000185 }), vaerk_id: "v2", scenarie_id: "s2" } as Koersel;
        state.koersler = [tæt];
        state.vaerker = [{ id: "v2", kode: "billund_sporb" }];
        state.scenarier = [{ id: "s2", vaerk_id: "v2", med_balancering: true, heat_csv: "billund_abvaerk_hourly_splejset_jun2026.csv", mip_rel_gap: 0.0002, mip_abs_gap: 1000 }];
        vis(["referencetal"]);
        expect(await screen.findByText("inden for tolerancen")).toBeInTheDocument();
        expect(screen.getByText(/0,02 % og 1\.000 kr\./)).toBeInTheDocument();
        expect(screen.getByText(/strammere end casen/)).toBeInTheDocument();
        expect(screen.getAllByText("ikke kørt endnu")).toHaveLength(4);
    });

    it("§6d: 'Hvilke data skal med?' har en side — tabellen over data pr. kørsel, formatkravene og værksarket", async () => {
        vis(["data"]);
        expect(await screen.findByRole("heading", { level: 1, name: "Hvilke data skal med?" })).toBeInTheDocument();
        expect(await screen.findByText("Elspotpris")).toBeInTheDocument();
        expect(screen.getByText(/aFRR, mFRR-kapacitet, mFRR-aktivering, ubalancepris/)).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Sådan skal en tidsserie se ud" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Værksarket" })).toBeInTheDocument();
        // Navigationen: emnet står i 'Værket og tallene', og siden har forrige/næste som de andre emner.
        expect(screen.getByRole("link", { name: "Hvilke data skal med?" })).toHaveAttribute("href", "#/information/data");
        expect(screen.getByRole("link", { name: /← Akkumuleringstanken/ })).toBeInTheDocument();
    });

    it("datadækning: versionerne kørslerne er regnet på", async () => {
        state.koersler = [k({}), k({ id: "andet" })];
        vis(["datadaekning"]);
        expect(await screen.findByText(/2 kørsler er regnet på 1 version/)).toBeInTheDocument();
        expect(screen.getAllByText("392992c").length).toBeGreaterThan(0);
    });

    it("driftsforhold: kapacitetens udløb og køen", async () => {
        state.koersler = [k({ status: "koerer" }), k({ id: "b", status: "koe" })];
        vis(["fabric-og-kapacitet"]);
        expect((await screen.findAllByText(/Prøvekapaciteten udløb/)).length).toBeGreaterThan(0);
        expect(await screen.findByText(/1 kørsel regner, 1 venter i kø/)).toBeInTheDocument();
    });
});
