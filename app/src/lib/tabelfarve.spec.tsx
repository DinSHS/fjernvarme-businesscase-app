// Tabellernes farvevalg (runde 9, IBCS.md §8): farve pr. polaritet, skalaen (trin, egen skala for 'Hele perioden',
// fælles skala for samme enhed på siden), kontrast pr. celle i alle temaer × lys/mørk, og valget husket pr. bruger —
// også når lageret er blokeret.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FarveValg, HeatSkalaProvider, Tabel, useHeatMaks, useVisning } from "@/components/layout";
import { DeltaTal, TKR } from "@/sider/analyser/ibcs-grafer";
import { bland, kontrast } from "@/styles/farve";
import { BASISTEMA, HEAT_ANDEL, HEAT_RAMPER, HEAT_TRIN, css, heatRamper, laesbarTekst, loes, type Tema, type TemaFil } from "@/styles/tema-kerne";
import { farvning, forklaring, glemVisning, laesVisning, rampe, saetVisning, skalaMaks, trin } from "./tabelfarve";

const MWH = { factor: 1, prefix: "", decimals: 0 };
const GWH2 = { factor: 1, prefix: "", decimals: 2 };
const NEUTRAL = { slags: "delta", polaritet: 0 } as const;

beforeEach(() => { localStorage.clear(); glemVisning(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("farve pr. polaritet", () => {
    it("neutral (produktion, MWh): blå op, orange ned — ikke god/dårlig", () => {
        expect(rampe(959, NEUTRAL)).toBe("op");
        expect(rampe(-1917, NEUTRAL)).toBe("ned");
        expect(farvning("heatmap", 959, NEUTRAL, 2261, MWH).baggrund).toMatch(/^var\(--fjv-heat-op-\d\)$/);
        expect(farvning("heatmap", -1917, NEUTRAL, 2261, MWH).baggrund).toMatch(/^var\(--fjv-heat-ned-\d\)$/);
    });
    it("omkostning (op = dårligt) og balanceindtægt (op = godt) bruger temaets god/dårlig", () => {
        expect(rampe(44_219, { slags: "delta", polaritet: -1 })).toBe("daarlig");
        expect(rampe(-44_219, { slags: "delta", polaritet: -1 })).toBe("god");
        expect(rampe(12_000, { slags: "delta", polaritet: 1 })).toBe("god");
        expect(rampe(-12_000, { slags: "delta", polaritet: 1 })).toBe("daarlig");
    });
    it("niveauer er sekventielle (én nuance), uanset fortegn", () => {
        expect(rampe(5, { slags: "niveau" })).toBe("niveau");
        expect(farvning("heatmap", 3.2, { slags: "niveau" }, 4, GWH2).heat).toBe("niveau-4");
    });
    it("Retning farver kun teksten — neutral efter fortegn; med polaritet bærer DeltaTal god/dårlig som før", () => {
        expect(farvning("retning", 959, NEUTRAL, 2261, MWH)).toEqual({ tekst: "var(--fjv-heat-op)" });
        expect(farvning("retning", -309, NEUTRAL, 2261, MWH)).toEqual({ tekst: "var(--fjv-heat-ned)" });
        expect(farvning("retning", 44_219, { slags: "delta", polaritet: -1 }, 1, TKR)).toEqual({});
        expect(farvning("retning", 5, { slags: "niveau" }, 10, GWH2)).toEqual({});
    });
    it("Ingen er den hidtidige visning; 0, tomme celler og et afrundet nul får ingen farve", () => {
        expect(farvning("ingen", 959, NEUTRAL, 2261, MWH)).toEqual({});
        expect(farvning("heatmap", 0, NEUTRAL, 2261, MWH)).toEqual({});
        expect(farvning("heatmap", null, NEUTRAL, 2261, MWH)).toEqual({});
        expect(farvning("heatmap", undefined, NEUTRAL, 2261, MWH)).toEqual({});
        expect(farvning("heatmap", 0.4, NEUTRAL, 2261, MWH)).toEqual({}); // vises som "0"
        expect(farvning("retning", -0.3, NEUTRAL, 2261, MWH)).toEqual({});
        expect(farvning("heatmap", 0.6, NEUTRAL, 2261, MWH).heat).toBe("op-1"); // vises som "+1"
    });
});

describe("skalaen", () => {
    it("fem trin ∝ |værdi| / største |værdi|; den største er altid mørkest", () => {
        expect(trin(2261, 2261)).toBe(HEAT_TRIN);
        expect(trin(-2261, 2261)).toBe(5);
        expect(trin(452.2, 2261)).toBe(1);   // præcis 1/5
        expect(trin(452.3, 2261)).toBe(2);
        expect(trin(1, 2261)).toBe(1);
        expect(trin(3000, 2261)).toBe(5);    // over skalaen (skalagruppens maks er mindre): mørkest, ikke trin 7
        expect(trin(5, 0)).toBe(0);
    });
    it("skalaens 100 % er største |værdi| og ser bort fra tomme celler", () => {
        expect(skalaMaks([959, -1917, null, undefined, 1565, Number.NaN])).toBe(1917);
        expect(skalaMaks([])).toBe(0);
    });
    it("tabeller med samme nøgle på en side deler skala; andre nøgler og sider uden provider har deres egen", () => {
        const ud: Record<string, number> = {};
        function T({ id, noegle, maks }: { id: string; noegle: string; maks: number }) {
            ud[id] = useHeatMaks(noegle, maks);
            return null;
        }
        render(<HeatSkalaProvider>
            <T id="maaned-periode" noegle="ΔMWh·periode" maks={9277} />
            <T id="lager" noegle="ΔMWh·periode" maks={1200} />
            <T id="maaned" noegle="ΔMWh·måned" maks={2261} />
        </HeatSkalaProvider>);
        expect(ud).toEqual({ "maaned-periode": 9277, lager: 9277, maaned: 2261 });
        render(<T id="alene" noegle="ΔMWh·periode" maks={1200} />);
        expect(ud.alene).toBe(1200);
    });
    it("fodnoten siger, hvad den kraftigste farve svarer til, og hvilken farve der er op og ned", () => {
        expect(forklaring("heatmap", NEUTRAL, [["månederne", 2261, "2.261 MWh"], ["hele perioden", 9277, "9.277 MWh"]]))
            .toBe("Blå = mere end referencen, orange = mindre; jo kraftigere farve, jo større (5 trin à 20 %; kraftigst: månederne 2.261 MWh, hele perioden 9.277 MWh — hver har sin egen skala).");
        expect(forklaring("retning", NEUTRAL)).toBe("Blå = mere end referencen, orange = mindre.");
        expect(forklaring("heatmap", { slags: "delta", polaritet: 1 }, [["", 12_000, "12,0 t.kr."]])).toBe("Grøn = bedre end referencen, rød = dårligere; jo kraftigere farve, jo større (5 trin à 20 %; kraftigst = 12,0 t.kr.).");
        expect(forklaring("heatmap", { slags: "niveau" }, [["", 1.23, "1,23 GWh"]])).toBe("Jo kraftigere farve, jo større (5 trin à 20 %; kraftigst = 1,23 GWh).");
        expect(forklaring("ingen", NEUTRAL)).toBe("");
    });
    it("en skala uden farvede celler nævnes ikke — og er intet farvet, er der ingen forklaring", () => {
        expect(forklaring("heatmap", NEUTRAL, [["månederne", 2261, "2.261 MWh"], ["hele perioden", 0, "0 MWh"]]))
            .toBe("Blå = mere end referencen, orange = mindre; jo kraftigere farve, jo større (5 trin à 20 %; kraftigst: månederne 2.261 MWh).");
        expect(forklaring("heatmap", { slags: "delta", polaritet: 1 }, [["markederne", 0, "0,0 t.kr."], ["I alt", 0, "0,0 t.kr."]])).toBe("");
    });
});

describe("kontrast pr. celle i alle temaer × lys/mørk", () => {
    const filer = import.meta.glob<TemaFil>("../styles/temaer/**/*.json", { eager: true, import: "default" });
    const basis = loes(Object.values(filer).find((f) => f.id === BASISTEMA)!, undefined);
    const temaer: Tema[] = Object.values(filer).map((f) => (f.id === BASISTEMA ? basis : loes(f, basis)));

    it("dækker mindst de fire offentlige temaer", () => expect(temaer.length).toBeGreaterThanOrEqual(4));
    it.each(temaer.flatMap((t) => (["lys", "moerk"] as const).map((m) => [t.id, m, t] as const)))("%s/%s: hver celle har tekst ≥ 4,5:1 på sin egen baggrund", (_id, m, t) => {
        const r = heatRamper(t[m]);
        expect(Object.keys(r).sort()).toEqual([...HEAT_RAMPER].sort());
        for (const [navn, trinene] of Object.entries(r)) {
            expect(trinene).toHaveLength(HEAT_TRIN);
            for (const c of trinene) expect(kontrast(c.tekst, c.bg), `${navn} ${c.tekst} på ${c.bg}`).toBeGreaterThanOrEqual(4.5);
            // Stigende intensitet: hvert trin står stærkere mod kortets flade end det forrige.
            const mod = trinene.map((c) => kontrast(c.bg, t[m].flade));
            for (let i = 1; i < mod.length; i++) expect(mod[i]).toBeGreaterThan(mod[i - 1]);
        }
        // Retning-farverne er tal på kortet: ≥ 4,5:1 mod fladen.
        expect(kontrast(t[m].heatmap_op, t[m].flade)).toBeGreaterThanOrEqual(4.5);
        expect(kontrast(t[m].heatmap_ned, t[m].flade)).toBeGreaterThanOrEqual(4.5);
        // Skærmen bruger præcis de målte hex: tema-CSS'en skriver dem som variabler.
        const c = css(t, m);
        expect(c).toContain(`--fjv-heat-op-5: ${r.op[4].bg}`);
        expect(c).toContain(`--fjv-heat-daarlig-3-tekst: ${r.daarlig[2].tekst}`);
        expect(c).toContain(`--fjv-heat-niveau-1: ${bland(t[m].sekventiel[4], t[m].flade, HEAT_ANDEL[0])}`);
    });
    it("skifter til mørk/lys tekst, når temaets tekst ikke holder — og sort eller hvid holder altid", () => {
        const v = { tekst: "#16202b", flade: "#ffffff" };
        expect(laesbarTekst("#e4e8fa", v)).toBe("#16202b");
        expect(laesbarTekst("#3b5bdb", v)).toBe("#ffffff");
        // Mellemgråt, hvor hverken temaets tekst eller flade når 4,5:1: falder tilbage til sort/hvid.
        const grå = "#6f6f6f", svag = { tekst: "#3a3a3a", flade: "#b0b0b0" };
        expect(kontrast(svag.tekst, grå)).toBeLessThan(4.5);
        expect(kontrast(svag.flade, grå)).toBeLessThan(4.5);
        expect(kontrast(laesbarTekst(grå, svag), grå)).toBeGreaterThanOrEqual(4.5);
    });
});

describe("valget huskes pr. bruger", () => {
    it("gemmes i localStorage og læses igen", () => {
        saetVisning("delta", "heatmap");
        expect(localStorage.getItem("fjv.tabelfarve.delta.v1")).toBe("heatmap");
        glemVisning();
        expect(laesVisning("delta")).toBe("heatmap");
        expect(laesVisning("niveau")).toBe("ingen"); // Δ- og niveau-tabeller huskes hver for sig
    });
    it("ukendte værdier og Retning for niveau-tabeller giver Ingen", () => {
        localStorage.setItem("fjv.tabelfarve.delta.v1", "regnbue");
        localStorage.setItem("fjv.tabelfarve.niveau.v1", "retning");
        expect(laesVisning("delta")).toBe("ingen");
        expect(laesVisning("niveau")).toBe("ingen");
        saetVisning("niveau", "retning");
        expect(laesVisning("niveau")).toBe("ingen");
    });
    it("virker uden lager: blokeret getItem/setItem kaster ikke, og valget gælder resten af besøget", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("SecurityError"); });
        expect(laesVisning("delta")).toBe("ingen");
        expect(() => saetVisning("delta", "retning")).not.toThrow();
        expect(laesVisning("delta")).toBe("retning");
    });
});

describe("knappen og tabellen", () => {
    function DeltaTabel({ id }: { id: string }) {
        const vis = useVisning("delta");
        return (
            <div data-testid={id}>
                <FarveValg slags="delta" />
                <Tabel rækker={[959, -1917, 0]} nøgle={(v) => String(v)} kolonner={[{
                    navn: "ΔRef", tal: true, farve: (v) => farvning(vis, v, NEUTRAL, 2261, MWH),
                    vis: (v) => <DeltaTal v={v} polaritet={0} skala={MWH} arv={vis !== "ingen"} />,
                }]} />
            </div>
        );
    }

    it("har tre knapper med aria-pressed i en navngivet gruppe; niveau-tabeller har ikke Retning", () => {
        render(<><FarveValg slags="delta" /><FarveValg slags="niveau" /></>);
        const [delta, niveau] = screen.getAllByRole("group", { name: "Farver i tabellen" });
        expect([...delta.querySelectorAll("button")].map((b) => [b.textContent, b.getAttribute("aria-pressed")]))
            .toEqual([["Ingen", "true"], ["Retning", "false"], ["Heatmap", "false"]]);
        expect([...niveau.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Ingen", "Heatmap"]);
    });
    it("ét tryk farver alle tabeller af samme slags på siden og huskes", () => {
        render(<><DeltaTabel id="a" /><DeltaTabel id="b" /></>);
        const celler = () => [...document.querySelectorAll("td")].map((td) => td.getAttribute("data-heat"));
        expect(celler()).toEqual([null, null, null, null, null, null]);
        act(() => { fireEvent.click(screen.getAllByRole("button", { name: "Heatmap" })[0]); });
        expect(celler()).toEqual(["op-3", "ned-5", null, "op-3", "ned-5", null]);
        const td = document.querySelector<HTMLElement>('td[data-heat="ned-5"]')!;
        expect(td.style.background).toBe("var(--fjv-heat-ned-5)");
        expect(td.style.color).toBe("var(--fjv-heat-ned-5-tekst)");
        // Tallet arver cellens tekstfarve, og fortegnet står stadig i tallet (farve er aldrig eneste bærer).
        expect(td.querySelector("span")!.style.color).toBe("");
        expect(td.textContent).toBe("−1.917");
        expect(screen.getAllByRole("button", { name: "Heatmap" }).every((b) => b.getAttribute("aria-pressed") === "true")).toBe(true);
        expect(localStorage.getItem("fjv.tabelfarve.delta.v1")).toBe("heatmap");
    });
    it("Retning sætter kun tekstfarven; Ingen viser tabellen som før", () => {
        render(<DeltaTabel id="a" />);
        act(() => { fireEvent.click(screen.getByRole("button", { name: "Retning" })); });
        const [op, ned, nul] = [...document.querySelectorAll<HTMLElement>("td")];
        expect([op.style.color, op.style.background]).toEqual(["var(--fjv-heat-op)", ""]);
        expect(ned.style.color).toBe("var(--fjv-heat-ned)");
        expect(nul.getAttribute("style")).toBeNull();
        act(() => { fireEvent.click(screen.getByRole("button", { name: "Ingen" })); });
        expect([...document.querySelectorAll("td")].every((x) => !x.getAttribute("style"))).toBe(true);
        expect(document.querySelector("td span")!.getAttribute("style")).toContain("var(--fjv-delta-neutral)");
    });
});
