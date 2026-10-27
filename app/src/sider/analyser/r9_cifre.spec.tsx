// Runde 9 (orkestratoren 10:29, IBCS-review fund 2): energi i tabeller og kort har højst 4 heltalscifre (IBCS.md §3) —
// GWh, når MWh ellers får 5 cifre, med samme regel som graferne (energiSkala, ét præfiks pr. tabel). Testet på de
// rigtige kort med helårstal (Andeby helår: 47.612 MWh i enhedstabellen, 105.523 MWh varmebehov) og med små tal, der
// skal blive i MWh.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatValue } from "@/ibcs";
import { maanedstabel, type EnhedTal, type LagerTal, type Maaned, type Samlet } from "./beregn";
import type { Pakke } from "./data";
import { ENERGI_TABEL, energiSkala } from "./ibcs-grafer";
import { Enheder, Lager, VarmeOgMiljoe } from "./koersel";
import { LagerDelta, MaanedDelta, Noegletal } from "./sammenlign";

const enhed = (navn: string, mwh: number): EnhedTal => ({
    navn, p_max_mw: 12, produktion_mwh: mwh, andel_pct: 40, kapacitetsfaktor_pct: 45.3, driftsintervaller: 5370, driftstimer: 5370, fuldlasttimer: 3968,
});
const lager = (navn: string, op: number, af: number): LagerTal => ({ navn, opladet_mwh: op, afladet_mwh: af, niveau_start_mwh: 120, niveau_slut_mwh: 300, niveau_max_mwh: 1240 });
const samlet = (over: Partial<Samlet>): Samlet => ({
    objektiv_dkk: null, varmebehov_mwh: null, produktion_mwh: null, nettab_mwh: null, nettab_pct: null, co2_ton: null, el_forbrug_mwh: null,
    tank_arbitrage_dkk: null, enheder: [], lagre: [], balance: null, el_omkostning_dkk: null, el_salg_dkk: null, el_produktionstarif_dkk: null, ...over,
} as Samlet);
const pakke = (s: Partial<Samlet>, måneder: Maaned[] = []): Pakke => ({ samlet: samlet(s), input: [], maaneder: maanedstabel(måneder) } as unknown as Pakke);

/** Heltalscifrene i hvert tal, kortet viser i tabeller og faktalister (tusindtalspunktum fjernet, decimaler ignoreret). */
function tal(c: HTMLElement): string[] {
    const tekst = [...c.querySelectorAll("td, dd")].map((x) => x.textContent ?? "").join(" | ");
    return [...tekst.matchAll(/[−+-]?\d{1,3}(?:\.\d{3})*(?:,\d+)?/g)].map((m) => m[0]);
}
const heltalscifre = (s: string) => s.replace(/^[−+-]/, "").split(",")[0].replace(/\./g, "").length;
const overskrifter = (c: HTMLElement) => [...c.querySelectorAll("th")].map((x) => x.textContent);

describe("energi i tabeller: højst 4 heltalscifre, GWh med samme regel som graferne", () => {
    it("energiSkala: graferne skifter ved 1.000 MWh (≤ 3 cifre), tabellerne ved 10.000 MWh (≤ 4 cifre) — afrundet som vist", () => {
        expect(energiSkala([999]).enhed).toBe("MWh");
        expect(energiSkala([1000]).enhed).toBe("GWh");
        expect(energiSkala([9999], ENERGI_TABEL).enhed).toBe("MWh");
        expect(energiSkala([9999.6], ENERGI_TABEL).enhed).toBe("GWh");   // ville stå som "10.000"
        expect(energiSkala([-12_000, 3, null, Number.NaN], ENERGI_TABEL).enhed).toBe("GWh");
        const s = energiSkala([47_612, 874], ENERGI_TABEL).skala;
        expect([formatValue(47_612, s), formatValue(874, s)]).toEqual(["47,61", "0,87"]);
    });

    it("kørslens enhedstabel: helårets 47.612 MWh står som 47,61 i en GWh-kolonne; små tal bliver i MWh", () => {
        const stor = render(<Enheder d={pakke({ enheder: [enhed("halmkedel", 47_612), enhed("gasmotor", 874)] })} />).container;
        expect(overskrifter(stor)).toContain("GWh");
        expect(overskrifter(stor)).not.toContain("MWh");
        expect(stor.textContent).toContain("47,61");
        expect(tal(stor).filter((t) => heltalscifre(t) > 4)).toEqual([]);
        const lille = render(<Enheder d={pakke({ enheder: [enhed("elkedel_ny", 472), enhed("vp", 939)] })} />).container;
        expect(overskrifter(lille)).toContain("MWh");
        expect(lille.textContent).toContain("472");
    });

    it("Varme og miljø: varmebehov, produktion, forskel og nettab deler ét præfiks", () => {
        const c = render(<VarmeOgMiljoe d={pakke({ varmebehov_mwh: 105_523, produktion_mwh: 109_897, nettab_mwh: 19_602, co2_ton: 4_321 })} />).container;
        expect(c.textContent).toMatch(/105,52 GWh/);
        expect(c.textContent).toMatch(/\+4,37 GWh/);
        expect(c.textContent).toMatch(/19,60 GWh/);
        expect(c.textContent).not.toMatch(/MWh/);
        expect(tal(c).filter((t) => heltalscifre(t) > 4)).toEqual([]);
    });

    it("kørslens lager: tabel og budskab i GWh, når et helårs op- og afladning ellers får 5 cifre", () => {
        const c = render(<Lager d={pakke({ lagre: [lager("tank_hoej", 60_392, 60_100)] })} />).container;
        expect(c.textContent).toMatch(/hele perioden, GWh/);
        expect(c.textContent).toMatch(/ladede 60,39 GWh op og afladede 60,10 GWh/);
        expect(tal(c).filter((t) => heltalscifre(t) > 4)).toEqual([]);
        const lille = render(<Lager d={pakke({ lagre: [lager("tank_hoej", 414.9, 422.3)] })} />).container;
        expect(lille.textContent).toMatch(/hele perioden, MWh/);
    });

    it("sammenligningens lager og månedstabel: ét præfiks pr. tabel, også for ΔRef", () => {
        const c = render(<LagerDelta a={pakke({ lagre: [lager("tank_hoej", 60_000, 60_392)] })} b={pakke({ lagre: [lager("tank_hoej", 41_000, 41_210)] })} />).container;
        expect(overskrifter(c)).toEqual(expect.arrayContaining(["Ref (GWh)", "Scen (GWh)"]));
        expect(c.textContent).toContain("−19,18");   // ΔRef 41.210 − 60.392 MWh
        expect(tal(c).filter((t) => heltalscifre(t) > 4)).toEqual([]);
        // Månedstabellen: et værk, hvor 'Hele perioden' flytter > 10.000 MWh, skifter hele tabellen (også månederne) til GWh.
        const m = (maaned: string, objekt: string, gwh: number) => ({ id: `${maaned}${objekt}`, koersel_id: "k", maaned, objekt, noegle: "produktion_gwh", vaerdi: gwh } as unknown as Maaned);
        const ref = pakke({}, [m("2025-07", "halmkedel", 5), m("periode", "halmkedel", 60)]);
        const scen = pakke({}, [m("2025-07", "halmkedel", 3.1), m("periode", "halmkedel", 47.5)]);
        const t = render(<MaanedDelta a={ref} b={scen} />).container;
        expect(t.textContent).toMatch(/ΔRef varmeproduktion, GWh/);
        expect(t.textContent).toContain("−12,50");
        expect(t.textContent).toContain("−1,90");
        expect(tal(t).filter((x) => heltalscifre(x) > 4)).toEqual([]);
    });

    it("nøgletalskortet Elforbrug: et helårs 22.376 MWh el står som 22,38 GWh el (kort ≤ 4 cifre); små tal bliver i MWh", () => {
        const k = (el: number) => ({ ...pakke({ el_forbrug_mwh: el }), k: { id: `k${el}`, objektiv_dkk: 1e6, best_bound: 1e6, opnaaet_gap: 0, solve_status: "optimal" } } as unknown as Pakke);
        const c = render(<Noegletal a={k(13_789)} b={k(22_376)} />).container.textContent!;
        expect(c).toMatch(/GWh el/);
        expect(c).toContain("22,38");
        expect(c).toContain("+8,59");
        expect(c).not.toMatch(/22\.376|MWh el/);
        const lille = render(<Noegletal a={k(472)} b={k(803)} />).container.textContent!;
        expect(lille).toMatch(/MWh el/);
        expect(lille).toContain("803");
    });
});
