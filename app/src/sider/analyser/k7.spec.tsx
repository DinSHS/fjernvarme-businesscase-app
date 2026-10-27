// Codex K7 (rapporter/K7_codex.md): F4 relativ afvigelse ved negativ reference, F5 ukendte vandfaldsposter, F6 fælles
// px pr. MWh mellem produktionen pr. enhed og månedsgrafen på kørselssiden, F7 pengegraferne skifter til mio. kr.
// Hver test fejlede mod design/ibcs eedbd2c og består efter rettelsen.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScaleProvider } from "@/ibcs";
import { produktionsvarians, relativAfvigelse, type Balance, type Samlet } from "./beregn";
import type { Pakke } from "./data";
import { StablededeSoejler } from "./grafer";
import { NoegletalKort, OmkostningsVandfald, ParVarians, ProduktionPrEnhed, TKR, omkostningsBro, pengeSkala } from "./ibcs-grafer";
import { DeltaObjektiv, Vandfald } from "./sammenlign";

const samlet = (over: Partial<Samlet> = {}): Samlet => ({
    objektiv_dkk: null, varmebehov_mwh: null, produktion_mwh: null, nettab_mwh: null, nettab_pct: null, co2_ton: null, el_forbrug_mwh: null,
    tank_arbitrage_dkk: null, enheder: [], lagre: [], balance: null, el_omkostning_dkk: 600_000, el_salg_dkk: 170_000, el_produktionstarif_dkk: 400, ...over,
});
const balance = (brutto: number | null): Balance => {
    const m = { netto: brutto, brutto, kapacitet: null, aktivering_netto: null, sparet_elkoeb: null, aktivering_brutto: null };
    return { afrr: m, mfrr: m, i_alt: m, harProdukter: false } as Balance;
};
const pakke = (objektiv: number, s: Samlet = samlet()): Pakke => ({
    k: { id: `k${objektiv}`, objektiv_dkk: objektiv, best_bound: objektiv, opnaaet_gap: 0, solve_status: "optimal" },
    vaerkNavn: "Andeby", vaerkKode: null, scenarie: null, samlet: s, input: [], objekter: { enheder: [], lagre: [] },
} as unknown as Pakke);

describe("F4: én regel for relativ afvigelse — N/A når referencen er ≤ 0", () => {
    it("relativAfvigelse dividerer med den fortegnsbærende reference og giver null ved Ref ≤ 0", () => {
        expect(relativAfvigelse(200, 250)).toBeCloseTo(0.25, 12);
        expect(relativAfvigelse(-100_000, -80_000)).toBeNull();
        expect(relativAfvigelse(0, 12)).toBeNull();
        expect(relativAfvigelse(null, 12)).toBeNull();
    });
    it("detaljekortet viser N/A ved negativ reference, ligesom KPI-kortet (før: '+20,00 %' med |Ref| i nævneren)", () => {
        const a = pakke(-100_000), b = pakke(-80_000);
        const kpi = render(<NoegletalKort tal={[{ navn: "Driftsomkostning", enhed: "t.kr.", ref: -100_000, scen: -80_000, skala: TKR, polaritet: -1 }]} />);
        expect(kpi.container.textContent).toContain("N/A");
        const detalje = render(<DeltaObjektiv a={a} b={b} />).container.textContent!;
        expect(detalje).toMatch(/Relativt\s*N\/A/);
        expect(detalje).not.toMatch(/20,00 %/);
    });
    it("positiv reference: detaljekortet og KPI-kortet giver samme procent", () => {
        const detalje = render(<DeltaObjektiv a={pakke(3_424_407.96)} b={pakke(3_468_627.83)} />).container.textContent!;
        expect(detalje).toMatch(/Relativt\s*\+1,29 %/);
    });
    it("produktionsvariansen bruger samme funktion (ny enhed med Ref 0 → null)", () => {
        const v = produktionsvarians([{ navn: "x", produktion_mwh: 0 } as never], [{ navn: "x", produktion_mwh: 5 } as never]);
        expect(v[0].relativ).toBeNull();
    });
});

describe("F5: vandfaldet gør ikke en ukendt post til et kendt trin", () => {
    it("kendt brutto i begge kørsler giver et balancetrin (normaltilfældet er uændret)", () => {
        const bro = omkostningsBro(samlet({ balance: balance(50_000) }), samlet({ balance: balance(70_000) }), 100_000, 90_000)!;
        expect(bro.steps.find((s) => s.label === "Balanceindtægt")?.delta).toBe(-20_000);
        expect(bro.steps.at(-1)!.label).toBe("Brændsel, CO₂-kvoter, D&V, start m.m.");
    });
    it("ukendt brutto i referencen: intet balancetrin, og resten siger, at den rummer den ukendte post", () => {
        const bro = omkostningsBro(samlet({ balance: balance(null) }), samlet({ balance: balance(50_000) }), 100_000, 90_000)!;
        expect(bro.steps.map((s) => s.label)).not.toContain("Balanceindtægt");
        const rest = bro.steps.at(-1)!;
        expect(rest.remainder).toBe(true);
        expect(rest.label).toMatch(/balanceindtægt/i);
        expect(bro.steps.reduce((s, x) => s + x.delta, bro.base.value)).toBeCloseTo(bro.total.value, 9);
    });
    it("uden balancemarked i begge kørsler er balancen dokumenteret nul: intet trin og ingen 'ukendt' i resten", () => {
        const bro = omkostningsBro(samlet(), samlet(), 100_000, 90_000)!;
        expect(bro.steps.map((s) => s.label)).toEqual(["Elkøb", "Elsalg netto", "Brændsel, CO₂-kvoter, D&V, start m.m."]);
    });
    it("elkøb kendt i kun den ene kørsel: intet elkøbstrin, resten navngiver elkøb", () => {
        const bro = omkostningsBro(samlet({ el_omkostning_dkk: null }), samlet(), 100_000, 90_000)!;
        expect(bro.steps.map((s) => s.label)).not.toContain("Elkøb");
        expect(bro.steps.at(-1)!.label).toMatch(/elkøb/i);
    });
});

describe("F6: produktionen pr. enhed og månedsgrafen deler px pr. MWh på kørselssiden", () => {
    it("i samme ScaleProvider er en MWh lige lang i begge grafer", () => {
        const enheder = [{ navn: "halmkedel", produktion_mwh: 3448 }, { navn: "gaskedel", produktion_mwh: 2014 }] as never[];
        const { container } = render(
            <ScaleProvider>
                <ProduktionPrEnhed enheder={enheder} />
                <StablededeSoejler søjler={[{ etiket: "jan", dele: [{ navn: "halmkedel", plads: 0, værdi: 3.448 }, { navn: "gaskedel", plads: 1, værdi: 2.014 }] }]}
                    enhed="GWh" formatér={String} skalagruppe={{ enhed: "MWh", faktor: 1000 }} />
            </ScaleProvider>,
        );
        const bjaelke = container.querySelector("[data-role='bar-AC'][data-category='halmkedel']")!;
        const strukturPpu = Number(bjaelke.getAttribute("width")) / 3448;
        const sti = container.querySelectorAll("svg")[1].querySelector("path")!.getAttribute("d")!;
        const [, y0, y1] = sti.match(/^M[\d.]+,([\d.]+)V([\d.]+)/)!.map(Number);
        const maanedPpu = (Math.abs(y0 - y1) + 1) / 3448;   // +1: segmentets 1 px fladeafstand
        expect(strukturPpu).toBeGreaterThan(0);
        expect(maanedPpu / strukturPpu).toBeGreaterThan(0.98);
        expect(maanedPpu / strukturPpu).toBeLessThan(1.02);
    });
});

describe("F7: pengegraferne vælger t.kr. eller mio. kr. efter gruppens største værdi (≤ 3 cifre i grafer)", () => {
    it("pengeSkala: mio. kr. med 2 decimaler fra 1 mio. kr., ellers t.kr. med 1 decimal", () => {
        expect(pengeSkala([3_468_627.83, -49_664]).enhed).toBe("mio. kr.");
        expect(pengeSkala([3_468_627.83]).skala).toMatchObject({ factor: 1e6, decimals: 2 });
        expect(pengeSkala([44_219.87]).enhed).toBe("t.kr.");
    });
    it("Andeby-vandfaldet (3,42 → 3,47 mio. kr.): ingen etiket over 3 heltalscifre, og undertitel og kort siger mio. kr.", () => {
        const s = samlet({ el_omkostning_dkk: 666_278, el_salg_dkk: 179_347, el_produktionstarif_dkk: 433 });
        const t = samlet({ el_omkostning_dkk: 616_614, el_salg_dkk: 171_530, el_produktionstarif_dkk: 426 });
        const bro = omkostningsBro(s, t, 3_424_407.96, 3_468_627.83)!;
        const { container } = render(<OmkostningsVandfald bro={bro} />);
        // tallene i grafens tekster (fx "3,42", "−0,05", "ΔRef +0,04"); "Trin ×k" er forstørrelsens faktor, ikke et beløb
        const tal = [...container.querySelectorAll("text")].map((x) => x.textContent ?? "").filter((x) => !/×/.test(x))
            .flatMap((x) => x.match(/\d[\d.]*(,\d+)?/g) ?? []);
        expect(tal).toEqual(["3,42", "3,47", "0,04", "0,05", "0,01", "0,09"]);
        for (const x of tal) expect(x.split(",")[0].replace(/\./g, "").length).toBeLessThanOrEqual(3);
        expect(container.textContent).toContain("mio. kr.");
        const kort = render(<Vandfald a={pakke(3_424_407.96, s)} b={pakke(3_468_627.83, t)} />).container.textContent!;
        expect(kort).toContain("mio. kr., Ref → Scen");
    });
    it("par-variansen følger samme regel", () => {
        const { container } = render(<ParVarians par={[{ navn: "a", delta: 2_500_000, indenForTolerance: false }, { navn: "b", delta: -40_000, indenForTolerance: false }]} />);
        expect(container.textContent).toContain("mio. kr.");
        expect(container.textContent).toContain("+2,50");
    });
});
