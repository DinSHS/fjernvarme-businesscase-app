// Runde 15, iagttagelse 3.7 (den uafhængige test 18. november 2026): fordelingen mellem flere lagre er ikke entydig.
// Appens timefil er byte-identisk med run_case.py på appens EGEN casefil, men mod modelrepoets cases/andeby.yaml med
// samme flag gav HiGHS en anden fordeling mellem tank_lav og tank_hoej (op til 68 MWh og 25 MW pr. tank) — med samme
// samlede lager, produktion og objektiv. Appen viste ΔRef pr. tank som et resultat uden forbehold og uden summen.
// Genskabt FØR rettelsen: lagertabellen havde ingen sumrække, og intet sted stod, at fordelingen ikke er entydig.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { maanedstabel, type LagerTal, type Samlet } from "./beregn";
import type { Pakke } from "./data";
import { Lager } from "./koersel";
import { LagerDelta } from "./sammenlign";
import { FLERE_LAGRE_FORBEHOLD } from "./tekster";

afterEach(cleanup);

const lager = (navn: string, afladet: number | null, opladet: number | null = afladet): LagerTal =>
    ({ navn, opladet_mwh: opladet, afladet_mwh: afladet, niveau_start_mwh: 50, niveau_slut_mwh: 50, niveau_max_mwh: 120 });
const pakke = (lagre: LagerTal[]): Pakke => ({ samlet: { lagre, tank_arbitrage_dkk: null } as unknown as Samlet, input: [], maaneder: maanedstabel([]) } as unknown as Pakke);
const raekker = (c: HTMLElement) => [...c.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td, th")].map((x) => x.textContent ?? ""));

describe("3.7: differensen pr. lager vises med summen over lagre og med forbeholdet", () => {
    // Samme sum (500 MWh) i begge kørsler, men fordelt forskelligt på de to tanke — som de to optimale løsninger i testen.
    const ref = pakke([lager("tank_hoej", 300), lager("tank_lav", 200)]);
    const scen = pakke([lager("tank_hoej", 232), lager("tank_lav", 268)]);

    it("sumrækken 'Alle lagre': 500 mod 500, ΔRef 0 — selv om hver tank flytter 68 MWh", () => {
        const r = raekker(render(<LagerDelta a={ref} b={scen} />).container);
        expect(r.map((x) => x[0])).toEqual(["tank_hoej", "tank_lav", "Alle lagre"]);
        expect(r[0].slice(1)).toEqual(["300", "232", "−68"]);
        expect(r[1].slice(1)).toEqual(["200", "268", "+68"]);
        expect(r[2].slice(1)).toEqual(["500", "500", "0"]);
    });
    it("forbeholdet står i kortet: fordelingen mellem lagrene er ikke entydig", () => {
        const t = render(<LagerDelta a={ref} b={scen} />).container.textContent!;
        expect(t).toContain(FLERE_LAGRE_FORBEHOLD);
        expect(FLERE_LAGRE_FORBEHOLD).toMatch(/ikke entydig/);
        expect(FLERE_LAGRE_FORBEHOLD).toMatch(/summen over lagrene/);
    });
    it("et ukendt tal for ét lager gør summen ukendt, ikke mindre", () => {
        const r = raekker(render(<LagerDelta a={ref} b={pakke([lager("tank_hoej", null), lager("tank_lav", 268)])} />).container);
        expect(r[2].slice(1)).toEqual(["500", "–", "–"]);
    });
    it("ét lager: ingen sumrække og intet forbehold (der er intet at fordele)", () => {
        const c = render(<LagerDelta a={pakke([lager("tank", 300)])} b={pakke([lager("tank", 280)])} />).container;
        expect(raekker(c).map((x) => x[0])).toEqual(["tank"]);
        expect(c.textContent).not.toMatch(/ikke entydig/);
    });
    it("kørslens eget lagerkort siger forbeholdet, når der er flere lagre", () => {
        expect(render(<Lager d={ref} />).container.textContent).toContain(FLERE_LAGRE_FORBEHOLD);
        cleanup();
        expect(render(<Lager d={pakke([lager("tank", 300)])} />).container.textContent).not.toMatch(/ikke entydig/);
    });
});
