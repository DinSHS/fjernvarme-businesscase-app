// Inputfelterne: det brugeren skriver -> den kladde, der gemmes.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FeltInput } from "./Felt";
import { findFelt } from "./katalog";

describe("FeltInput", () => {
    it("decimalfelt: '12,5' bliver 12.5; samme værdi som før giver ingen kladde", () => {
        const sæt = vi.fn();
        render(<FeltInput sti="units.h.p_max_heat" post={findFelt("units.h.p_max_heat")} gammel="12.0" k={undefined} sæt={sæt} />);
        const felt = screen.getByLabelText("Maks. varmeeffekt");
        fireEvent.change(felt, { target: { value: "12,5" } });
        expect(sæt).toHaveBeenLastCalledWith({ tekst: "12,5", json: "12.5", fejl: null });
        fireEvent.change(felt, { target: { value: "12" } });
        expect(sæt).toHaveBeenLastCalledWith(null);
    });
    it("ugyldigt tal giver en kladde med fejl", () => {
        const sæt = vi.fn();
        render(<FeltInput sti="units.h.p_max_heat" post={findFelt("units.h.p_max_heat")} gammel="12.0" k={undefined} sæt={sæt} />);
        fireEvent.change(screen.getByLabelText("Maks. varmeeffekt"), { target: { value: "tolv" } });
        expect(sæt.mock.calls.at(-1)?.[0]).toMatchObject({ json: null, fejl: expect.stringMatching(/ikke et tal/) });
    });
    it("kontakt og valg", () => {
        const sæt = vi.fn();
        const { unmount } = render(<FeltInput sti="units.h.enabled" post={findFelt("units.h.enabled")} gammel="true" k={undefined} sæt={sæt} />);
        fireEvent.click(screen.getByRole("checkbox"));
        expect(sæt).toHaveBeenLastCalledWith({ tekst: "nej", json: "false", fejl: null });
        unmount();
        render(<FeltInput sti="units.h.fuel" post={findFelt("units.h.fuel")} gammel={'"straw"'} k={undefined} sæt={sæt} />);
        fireEvent.change(screen.getByRole("combobox"), { target: { value: "flis" } });
        expect(sæt).toHaveBeenLastCalledWith({ tekst: "flis", json: '"flis"', fejl: null });
    });
    it("COP-tabellen redigeres som tabel og bevarer decimaltal i urørte celler", () => {
        const sæt = vi.fn();
        const gammel = '[{"t_ambient":-10.0,"heat_mw":2.55,"el_mw":1.062},{"t_ambient":0.0,"heat_mw":3.4,"el_mw":1.169}]';
        render(<FeltInput sti="units.vp.cop_curve.points" post={findFelt("units.vp.cop_curve.points")} gammel={gammel} k={undefined} sæt={sæt} />);
        fireEvent.change(screen.getByLabelText(/række 2, heat_mw/), { target: { value: "3,5" } });
        expect(sæt).toHaveBeenLastCalledWith(expect.objectContaining({
            json: '[{"t_ambient":-10.0,"heat_mw":2.55,"el_mw":1.062},{"t_ambient":0.0,"heat_mw":3.5,"el_mw":1.169}]', fejl: null,
        }));
        fireEvent.click(screen.getByText("Tilføj række"));
        expect(sæt.mock.calls.at(-1)?.[0].json).toMatch(/,\{"t_ambient":0\.0,"heat_mw":3\.5,"el_mw":1\.169\}\]$/);
    });
});
