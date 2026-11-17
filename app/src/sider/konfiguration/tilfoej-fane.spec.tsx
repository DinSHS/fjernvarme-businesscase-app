// Runde 14c: forløbet i brugerfladen — et værk uden balancing-blok får blokken som ÉN anmodning, først når brugeren har
// taget stilling og bekræftet; et manglende felt tilføjes med modellens standard; advarslen om start vises.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MODELSPEJL } from "@/lib/modelspejl.data";
import type { Parameterændring } from "@/lib/data/skriv";
import { validerVaerk } from "./validering";
import type { RedigeringsTilstand } from "./useRedigering";
import { BalancemarkedKort, FjernBalancemarked, TilfoejBalancemarked } from "./BalancemarkedFane";
import { StartAdvarselKort, TilfoejFelt } from "./TilfoejFelt";

const andeby = new Map(Object.entries(MODELSPEJL.cases.andeby.blade).map(([s, [v]]) => [s, v]));
const arkVaerk = new Map([...andeby].filter(([s]) => !s.startsWith("balancing.")));

function rt(nu: Map<string, string>, aktiv = false) {
    const send = vi.fn<(æ: readonly Parameterændring[]) => Promise<boolean>>(async () => true);
    const t = { nu, grundFund: validerVaerk(nu), red: { aktiv, udkast: new Map(), sæt: () => {} }, sender: false, svar: undefined, send };
    return { t: t as unknown as RedigeringsTilstand, send };
}

describe("fanen Balancering", () => {
    it("et værk uden blok viser 'Tilføj balancemarked'; et med blok viser 'Fjern'", () => {
        const gåTil = vi.fn();
        const { unmount } = render(<BalancemarkedKort kode="ark" rt={rt(arkVaerk).t} gåTil={gåTil} />);
        fireEvent.click(screen.getByRole("button", { name: "Tilføj balancemarked…" }));
        expect(gåTil).toHaveBeenCalledWith("konfiguration/ark/balancering/tilfoej");
        unmount();
        render(<BalancemarkedKort kode="andeby" rt={rt(andeby).t} gåTil={gåTil} />);
        expect(screen.getByRole("button", { name: "Fjern balancemarkedet…" })).toBeTruthy();
    });

    it("gemmer først, når loftet er udfyldt og blokken er bekræftet — som ÉN anmodning med hele blokken", async () => {
        const { t, send } = rt(arkVaerk);
        const gåTil = vi.fn();
        render(<TilfoejBalancemarked kode="ark" rt={t} gåTil={gåTil} />);
        const gem = () => screen.getByRole("button", { name: "Gem blokken" }) as HTMLButtonElement;
        // Forvalgt: de el-enheder, værket har prækvalificeret; loftet mangler.
        expect((screen.getByRole("checkbox", { name: /vp_luft_vand/ }) as HTMLInputElement).checked).toBe(true);
        expect(screen.getAllByText(/Skriv loftet for/).length).toBeGreaterThan(0);
        expect(gem().disabled).toBe(true);
        for (const n of ["elkedel_ny", "elkedel_gl"]) fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(n) }));
        const loft = screen.getAllByRole("textbox").find((x) => x.closest("label")?.textContent?.startsWith("Loft pr. enhed"))!;
        fireEvent.change(loft, { target: { value: "5,5" } });
        // Kilden står ved hvert felt.
        expect(screen.getAllByText(/^doc\/BUDSTRATEGI\.md:\d+ @ /).length).toBeGreaterThan(5);
        expect(gem().disabled).toBe(true);
        fireEvent.click(screen.getByRole("checkbox", { name: /Jeg har set hele blokken/ }));
        expect(gem().disabled).toBe(false);
        fireEvent.click(gem());
        await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
        const æ = send.mock.calls[0][0];
        expect(æ).toEqual(expect.arrayContaining([
            { sti: "balancing.method", handling: "opret", ny_json: '"activation_value"' },
            { sti: "balancing.ancillary_caps.per_unit_mw.vp_luft_vand", handling: "opret", ny_json: "5.5" },
        ]));
        expect(æ.some((x) => x.sti.includes("elkedel"))).toBe(false);
        await vi.waitFor(() => expect(gåTil).toHaveBeenCalledWith("konfiguration/ark/balancering"));
    });

    it("kan ikke gemmes, mens værket har rettelser i et udkast", () => {
        render(<TilfoejBalancemarked kode="ark" rt={rt(arkVaerk, true).t} gåTil={vi.fn()} />);
        expect(screen.getByText("Gem eller fortryd rettelserne i værket først.")).toBeTruthy();
    });

    it("fjern: én anmodning med slet af hver balancing-sti; blokeret, når et scenarie ændrer et felt i blokken", async () => {
        const { t, send } = rt(andeby);
        const { unmount } = render(<FjernBalancemarked kode="andeby" rt={t} gåTil={vi.fn()} scenarier={[{ id: "s1", navn: "Prognose" }]}
            scenarieAendringer={[{ scenarie_id: "s1", type: "set", sti: "balancing.activation.foresight" }]} />);
        expect((screen.getByRole("button", { name: "Fjern blokken" }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText(/Prognose/)).toBeTruthy();
        unmount();
        render(<FjernBalancemarked kode="andeby" rt={t} gåTil={vi.fn()} scenarier={[]} scenarieAendringer={[]} />);
        fireEvent.click(screen.getByRole("button", { name: "Fjern blokken" }));
        await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
        const æ = send.mock.calls[0][0];
        expect(æ.every((x) => x.handling === "slet" && x.sti.startsWith("balancing."))).toBe(true);
        expect(æ.length).toBe([...andeby.keys()].filter((s) => s.startsWith("balancing.")).length);
    });
});

describe("Tilføj et felt", () => {
    it("vælg et manglende felt; modellens standard står som udgangspunkt; ét opret", async () => {
        const v = new Map(andeby);
        v.delete("units.halmkedel.min_uptime");
        const { t, send } = rt(v);
        render(<TilfoejFelt rt={t} sektioner={["units"]} objekt="halmkedel" />);
        fireEvent.change(screen.getByRole("combobox"), { target: { value: "units.halmkedel.min_uptime" } });
        expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("1");
        expect(screen.getByText(/Modellens standard: 1 \(src\/config\.py:\d+ @/)).toBeTruthy();
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "4" } });
        fireEvent.click(screen.getByRole("button", { name: "Tilføj feltet" }));
        await vi.waitFor(() => expect(send).toHaveBeenCalledWith([{ sti: "units.halmkedel.min_uptime", handling: "opret", ny_json: "4" }]));
    });
    it("vises ikke, når intet mangler", () => {
        const { container } = render(<TilfoejFelt rt={rt(andeby).t} sektioner={["storage"]} objekt="findes_ikke" />);
        expect(container.textContent).toBe("");
    });
});

describe("advarslen om start", () => {
    it("vises med enhed og felt, når ingen tændt enhed med unit commitment står til tændt ved start", () => {
        const v = new Map(andeby);
        v.set("units.halmkedel.initial_status", "0");
        render(<StartAdvarselKort rt={rt(v).t} kode="ark" />);
        expect(screen.getByText(/uden tank/)).toBeTruthy();
        expect(screen.getByText("units.halmkedel.initial_status = 0")).toBeTruthy();
    });
    it("vises ikke for Andeby", () => {
        const { container } = render(<StartAdvarselKort rt={rt(andeby).t} kode="andeby" />);
        expect(container.textContent).toBe("");
    });
});
