// Runde 15: modelrepoets 939228a (v0.11.0) har enhedstypen oil_boiler med brændslet fuel_oil og prisen prices.fuel_oil.
// Modelscriptet (scripts/vaerksark_til_yaml.py) og load_case (src/config.py, fuel_price) kræver olieprisen og en CO2-pris.
// Fejlen, disse tests forhindrer: appen kendte ikke typen, klientvalideringen spurgte ikke om olieprisen (fast tabel over
// brændsler), og "Tilføj enhed" havde intet felt til en pris, værket ikke har — en oliekedel kunne ikke oprettes.
// Værket er Andeby fra modelspejlet (cases/andeby.yaml ved pinnen), så specen kører uden installationens databaseudtræk.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MODELSPEJL } from "@/lib/modelspejl.data";
import type { Parameterændring } from "@/lib/data/skriv";
import { BRAENDSEL, ENHEDSTYPER, findFelt } from "./katalog";
import type { Blad } from "./gruppering";
import { NyEnhed } from "./NyEnhed";
import { anvend, manglendeBraendselspris, nyEnhed } from "./redigering";
import { nyeFejl, type RedigeringsTilstand } from "./useRedigering";
import { validerVaerk } from "./validering";

const andeby = new Map(Object.entries(MODELSPEJL.cases.andeby.blade).map(([s, [v]]) => [s, v]));
const blade: Blad[] = [...andeby].map(([sti, vaerdi_json]) => ({ sti, vaerdi_json, sektion: sti.split(".")[0] }));
const PRIS = "prices.fuel_oil.value";

function rt(nu: Map<string, string>) {
    const send = vi.fn<(æ: readonly Parameterændring[]) => Promise<boolean>>(async () => true);
    const t = { nu, grundFund: validerVaerk(nu), red: { aktiv: false, udkast: new Map(), sæt: () => {} }, sender: false, svar: undefined, send };
    return { t: t as unknown as RedigeringsTilstand, send };
}

describe("oliekedel — kataloget (viden/enhedstyper.json og felt_katalog.json)", () => {
    it("kender typen, brændslet, prisen og modelscriptets CO₂-faktor", () => {
        const t = ENHEDSTYPER.oil_boiler;
        expect(t.navn).toBe("Oliekedel");
        expect(t.fuel).toEqual(["fuel_oil"]);
        expect(t.kan_byde_balance).toBe(false);
        const sk = new Map(t.skabelon.map((s) => [s.sti, s.vaerdi_json]));
        expect(sk.get("type")).toBe('"oil_boiler"');
        expect(sk.get("fuel")).toBe('"fuel_oil"');
        expect(sk.get("co2_emissions_per_mwh_fuel")).toBe("0.266");   // scripts/vaerksark_til_yaml.py: CO2_PR_MWH_BRAENDSEL
        expect(BRAENDSEL.fuel_oil).toBe("Fyringsolie");
        expect(findFelt(PRIS)?.etiket).toBe("Fyringsoliepris");
        expect(findFelt("units.x.type")?.tilladte).toContain("oil_boiler");
        expect(findFelt("units.x.fuel")?.tilladte).toContain("fuel_oil");
        expect(findFelt("units.x.eta_fuel_to_heat")?.gaelder_for).toContain("oil_boiler");
    });
});

describe("oliekedel — klientvalideringen kræver det, modellen kræver", () => {
    const { ændringer } = nyEnhed("oil_boiler", "oliekedel", new Map());
    const før = validerVaerk(andeby);

    it("Andeby fra modelspejlet har ingen fejl i forvejen (ellers siger testene nedenfor intet)", () => {
        expect(før.filter((x) => x.alvor === "fejl")).toEqual([]);
        expect(andeby.has(PRIS)).toBe(false);
    });
    it("en aktiv oliekedel uden oliepris er en fejl — med modellens ord", () => {
        const nye = nyeFejl(før, validerVaerk(anvend(andeby, ændringer)));
        expect(nye.map((x) => x.sti)).toEqual([PRIS]);
        expect(nye[0].besked).toBe("En enhed (oliekedel) bruger fyringsolie, men prisen for fyringsolie er ikke sat under prices.");
    });
    it("med olieprisen er værket gyldigt", () => {
        const med = anvend(andeby, [...ændringer, { sti: PRIS, handling: "opret", ny_json: "900.0" }]);
        expect(nyeFejl(før, validerVaerk(med))).toEqual([]);
    });
    it("en slukket oliekedel kræver ingen pris (modellen spørger kun for enheder, der er med)", () => {
        const slukket = anvend(andeby, ændringer.map((æ) => (æ.sti === "units.oliekedel.enabled" ? { ...æ, ny_json: "false" } : æ)));
        expect(nyeFejl(før, validerVaerk(slukket))).toEqual([]);
    });
    it("CO₂-prisen kræves også med en oliekedel", () => {
        const m = anvend(andeby, [...ændringer, { sti: PRIS, handling: "opret", ny_json: "900.0" }]);
        m.delete("prices.co2_eua.value");
        expect(nyeFejl(før, validerVaerk(m)).map((x) => x.sti)).toEqual(["prices.co2_eua.value"]);
    });
    it("gaskedlens besked bruger også modellens ord (før: nøglen natural_gas)", () => {
        const m = new Map(andeby);
        m.delete("prices.natural_gas.value");
        expect(validerVaerk(m).map((x) => x.besked).join("\n")).toMatch(/bruger naturgas, men prisen for naturgas er ikke sat under prices/);
    });
});

describe("oliekedel — Tilføj enhed opretter brændslets pris i samme ændring", () => {
    it("manglendeBraendselspris: kun et købt brændsel, værket ikke har en pris for", () => {
        expect(manglendeBraendselspris(andeby, "fuel_oil")).toBe(PRIS);
        expect(manglendeBraendselspris(andeby, "natural_gas")).toBeNull();     // Andeby har gasprisen
        expect(manglendeBraendselspris(andeby, "electricity")).toBeNull();
        expect(manglendeBraendselspris(andeby, "solar")).toBeNull();
        expect(manglendeBraendselspris(andeby, undefined)).toBeNull();
        expect(manglendeBraendselspris(new Map([...andeby, [PRIS, "900.0"]]), "fuel_oil")).toBeNull();
    });
    it("nyEnhed: prisen kodes som decimaltal og kræves udfyldt", () => {
        const r = nyEnhed("oil_boiler", "oliekedel", new Map([["p_max_heat", "6"]]), { sti: PRIS, tekst: "912,5" });
        expect(r.fejl).toEqual([]);
        expect(r.ændringer.find((æ) => æ.sti === PRIS)).toEqual({ sti: PRIS, handling: "opret", ny_json: "912.5" });
        expect(r.ændringer.filter((æ) => æ.sti.startsWith("units.oliekedel.")).length).toBe(ENHEDSTYPER.oil_boiler.skabelon.length);
        expect(nyEnhed("oil_boiler", "oliekedel", new Map(), { sti: PRIS, tekst: "900" }).ændringer.find((æ) => æ.sti === PRIS)?.ny_json).toBe("900.0");
        expect(nyEnhed("oil_boiler", "oliekedel", new Map(), { sti: PRIS, tekst: " " }).fejl)
            .toEqual([{ sti: PRIS, besked: "Sæt en pris for fyringsolie — værket har ingen, og modellen kan ikke regne enheden uden." }]);
        expect(nyEnhed("oil_boiler", "oliekedel", new Map(), { sti: PRIS, tekst: "dyr" }).fejl.map((x) => x.sti)).toEqual([PRIS]);
    });
    it("hver enhedstypes skabelon giver et gyldigt værk i Andeby, når den manglende pris følger med", () => {
        const før = validerVaerk(andeby);
        for (const type of Object.keys(ENHEDSTYPER)) {
            const sti = manglendeBraendselspris(andeby, ENHEDSTYPER[type].fuel[0]);
            const { ændringer, fejl } = nyEnhed(type, `ny_${type}`, new Map(), sti ? { sti, tekst: "900" } : undefined);
            expect(fejl, type).toEqual([]);
            expect(nyeFejl(før, validerVaerk(anvend(andeby, ændringer))), type).toEqual([]);
        }
    });
    it("formularen: oliekedlen kan først oprettes, når olieprisen er skrevet — og prisen sendes med enheden", async () => {
        const { t, send } = rt(andeby);
        const gåTil = vi.fn();
        render(<NyEnhed kode="andeby" blade={blade} rt={t} gåTil={gåTil} />);
        const opret = () => screen.getByRole("button", { name: "Opret enhed" }) as HTMLButtonElement;
        fireEvent.change(screen.getByLabelText("Type"), { target: { value: "oil_boiler" } });
        fireEvent.change(screen.getByLabelText(/^Navn/), { target: { value: "oliekedel" } });
        const pris = screen.getByLabelText(/^Fyringsoliepris/) as HTMLInputElement;
        expect(pris.value).toBe("");
        expect(screen.getByText(/Sæt en pris for fyringsolie/)).toBeTruthy();
        expect(opret().disabled).toBe(true);
        fireEvent.change(pris, { target: { value: "900" } });
        expect(screen.queryByText(/Sæt en pris for fyringsolie/)).toBeNull();
        expect(opret().disabled).toBe(false);
        fireEvent.click(opret());
        await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
        const sendt = new Map(send.mock.calls[0][0].map((æ) => [æ.sti, æ]));
        expect(sendt.get(PRIS)).toEqual({ sti: PRIS, handling: "opret", ny_json: "900.0" });
        expect(sendt.get("units.oliekedel.type")?.ny_json).toBe('"oil_boiler"');
        expect(sendt.get("units.oliekedel.fuel")?.ny_json).toBe('"fuel_oil"');
        expect(sendt.get("units.oliekedel.co2_emissions_per_mwh_fuel")?.ny_json).toBe("0.266");
        await vi.waitFor(() => expect(gåTil).toHaveBeenCalledWith("konfiguration/andeby/enheder/oliekedel"));
    });
    it("formularen: en gaskedel i Andeby får intet prisfelt (værket har gasprisen)", () => {
        render(<NyEnhed kode="andeby" blade={blade} rt={rt(andeby).t} gåTil={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("Type"), { target: { value: "gas_boiler" } });
        fireEvent.change(screen.getByLabelText(/^Navn/), { target: { value: "gas_ny" } });
        expect(screen.queryByLabelText(/pris/i)).toBeNull();
        expect((screen.getByRole("button", { name: "Opret enhed" }) as HTMLButtonElement).disabled).toBe(false);
    });
});
