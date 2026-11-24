// Efterprøvningen af rettelserne i runde 15, fund E (P2): "Analyser viser fortsat differenser, retning og farver ved
// ukendt dom."
//
// Genskabt FØR rettelsen med efterprøvningens tilfælde — to færdige Andeby-kørsler 5.–6. januar 2026 med kendte
// objektiver, hvor modelversionen ikke kendes (hverken på rækken eller i det frosne input):
//  * *Δ driftsomkostning* viste stadig et tal ("−23,5 t.kr.") og et advarselsmærke;
//  * vandfaldet tegnede trinene, og fodnoten sagde "op = dyrere";
//  * *Varmeproduktion pr. enhed*, *Måned for måned* og *Lager* spurgte slet ikke dommen: med farvesættet rød/grøn og
//    visningen Retning eller Heatmap blev et ΔRef farvet grønt eller rødt;
//  * balancekortet sagde, at kørslerne "afviger også i modelversion" — den er UKENDT, ikke forskellig.
//
// Leads afgørelse: alle kort på sammenligningssiden spørger samme dom. Ved UKENDT: begge værdier med egne perioder,
// ingen afledt Δ, ingen retningsfarve, ingen prisord, ingen "op = dyrere"; balancekortet har sin egen tekst for
// manglende grundlag. (Ved "nej" vises tallene som før, neutralt — men nu også uden retningsfarve i de tre kort.)
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { glemVisning, saetFarvesaet, saetVisning } from "@/lib/tabelfarve";
import { maanedstabel, profil, samlNoegletal, sammenlignelighedsDom, type Koersel, type Maaned, type Noegletal as NT, type Scenarie } from "./beregn";
import type { Pakke } from "./data";
import { BalanceDelta, DeltaObjektiv, LagerDelta, MaanedDelta, Noegletal, Produktion, Sammenlignelighed, Vandfald } from "./sammenlign";

beforeEach(() => { localStorage.clear(); glemVisning(); saetFarvesaet("roedgroen"); });
afterEach(cleanup);

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
let n = 0;
const nt = (gruppe: string, noegle: string, vaerdi: number, objekt?: string, marked?: string): NT => ({ id: `e-${n++}`, koersel_id: "k", gruppe, noegle, vaerdi, objekt, marked } as NT);
const md = (maaned: string, noegle: string, vaerdi: number, objekt?: string): Maaned => ({ id: `m-${n++}`, koersel_id: "k", maaned, noegle, vaerdi, objekt } as Maaned);
const M = "939228aa048563c8498382a79d207c8b03fbda57", D = "106b9fce9a2e3610090b1a542559024056449b88";

interface Valg { objektiv: number; halm: number; gas: number; balance?: number; over?: Partial<Koersel>; periode?: [string, string]; udenTank?: boolean }
/** En færdig Andeby-kørsel som sammenligningssidens pakke: to enheder, to lagre, måneder og (valgfrit) balancemarked. */
function pakke(id: string, v: Valg): Pakke {
    const [start, slut] = v.periode ?? ["2026-01-05", "2026-01-06"];
    const input = [
        ind("vaerk", "storage.tank_hoej.enabled", "true"), ind("vaerk", "storage.tank_lav.enabled", "true"),
        ind("scenarie", "_koersel.start", JSON.stringify(start)), ind("scenarie", "_koersel.slut", JSON.stringify(slut)),
        ind("scenarie", "_koersel.med_balancering", String(v.balance !== undefined)), ind("scenarie", "_koersel.data_commit", JSON.stringify(D)),
        ...(v.udenTank ? [ind("aendring", "storage.tank_lav.enabled", "false")] : []),
    ];
    const k = {
        id, scenarie_id: `s-${id}`, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date(Date.UTC(2026, 10, 18, 8, n++)),
        model_commit: M, data_commit: D, oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal",
        objektiv_dkk: v.objektiv, best_bound: v.objektiv, manifest_json: JSON.stringify({ periode: { start, slut, oploesning: "1h" } }), ...v.over,
    } as Koersel;
    return {
        k, vaerkNavn: "Andeby", vaerkKode: "andeby", scenarie: { id: k.scenarie_id, navn: id, med_balancering: v.balance !== undefined } as Scenarie,
        samlet: samlNoegletal([
            nt("objektiv", "objektiv_dkk", v.objektiv), nt("miljoe", "co2_ton", 150), nt("el", "forbrug_mwh", 400),
            nt("el", "omkostning_dkk", 600_000), nt("el", "salg_dkk", 170_000),
            nt("enhed", "produktion_mwh", v.halm, "halmkedel"), nt("enhed", "andel_pct", (100 * v.halm) / (v.halm + v.gas), "halmkedel"), nt("enhed", "driftstimer", 48, "halmkedel"),
            nt("enhed", "produktion_mwh", v.gas, "gaskedel"), nt("enhed", "andel_pct", (100 * v.gas) / (v.halm + v.gas), "gaskedel"), nt("enhed", "driftstimer", 20, "gaskedel"),
            nt("lager", "afladet_mwh", 120, "tank_hoej"), ...(v.udenTank ? [] : [nt("lager", "afladet_mwh", 80, "tank_lav")]),
            ...(v.balance !== undefined ? [nt("balancering", "netto_dkk", v.balance), nt("balancering", "brutto_dkk", v.balance + 20_000),
                nt("balancering", "netto_dkk", v.balance, undefined, "afrr"), nt("balancering", "brutto_dkk", v.balance + 20_000, undefined, "afrr")] : []),
        ]),
        maaneder: maanedstabel([
            md("2026-01", "produktion_gwh", v.halm / 1000, "halmkedel"), md("periode", "produktion_gwh", v.halm / 1000, "halmkedel"),
            md("2026-01", "produktion_gwh", v.gas / 1000, "gaskedel"), md("periode", "produktion_gwh", v.gas / 1000, "gaskedel"),
            md("2026-01", "varmebehov_gwh", (v.halm + v.gas) / 1000), md("periode", "varmebehov_gwh", (v.halm + v.gas) / 1000),
        ]),
        input, profil: profil(k, "Andeby", null, input), objekter: { enheder: ["halmkedel", "gaskedel"], lagre: ["tank_hoej", "tank_lav"] }, tidsserienavne: new Map(),
    };
}
/** Efterprøvningens tilfælde: modelversionen kendes ikke — hverken på rækken eller i det frosne input. */
const UDEN_MODEL = { model_commit: null } as unknown as Partial<Koersel>;
const ref = (over: Partial<Koersel> = UDEN_MODEL) => pakke("ref", { objektiv: 866_567.72, halm: 600, gas: 400, over });
const scen = (over: Partial<Koersel> = UDEN_MODEL) => pakke("scen", { objektiv: 843_051.76, halm: 900, gas: 100, udenTank: true, over });
const scenMedBalance = (over: Partial<Koersel> = UDEN_MODEL) => pakke("scen", { objektiv: 843_051.76, halm: 900, gas: 100, balance: 150_000, over });

const KORT = [
    ["Δ driftsomkostning", DeltaObjektiv], ["Nøgletal", Noegletal], ["Vandfald", Vandfald], ["Varmeproduktion pr. enhed", Produktion],
    ["Måned for måned", MaanedDelta], ["Balancemarked", BalanceDelta], ["Lager", LagerDelta],
] as const;
/** Farver, der dømmer: virkningsfarve på et tal, eller en farvet celle (Retning/Heatmap). */
const dømmendeFarver = (c: HTMLElement) => c.querySelectorAll("[data-impact='good'], [data-impact='bad'], td[data-heat], td[style*='background'], td[style*='color']").length;
const PRISORD = /billigere|dyrere|besparelse|meromkostning|koster [\d.,]+ (t\.)?kr\. (mere|mindre)|mere end referencen|mindre end referencen|balancemarkedets værdi/i;

describe("fund E: tilfældet er en ukendt dom", () => {
    it("modelversionen kendes ikke for nogen af kørslerne → ukendt", () => {
        expect(sammenlignelighedsDom(ref().profil, scen().profil)).toMatchObject({ status: "ukendt" });
        expect(sammenlignelighedsDom(ref({}).profil, scen({}).profil).status).toBe("ja");          // kontrol: med modelversion er parret et resultat
    });
});

describe.each([["retning"], ["heatmap"], ["ingen"]] as const)("fund E: ved ukendt dom, farvevisning '%s' og farvesæt rød/grøn", (visning) => {
    beforeEach(() => saetVisning("delta", visning));

    it.each(KORT)("%s: ingen afledt Δ, ingen retningsfarve, ingen prisord og intet 'op = dyrere'", (_navn, Komponent) => {
        const b = _navn === "Balancemarked" ? scenMedBalance() : scen();
        const { container } = render(<Komponent a={ref()} b={b} />);
        const tekst = container.textContent ?? "";
        expect(dømmendeFarver(container)).toBe(0);                                   // før: grønne/røde ΔRef i tre af kortene
        expect(tekst).not.toMatch(PRISORD);
        expect(tekst).not.toMatch(/op = dyrere/);                                    // før: vandfaldets fodnote
        // Intet afledt Δ: hverken et tal med fortegn (−23,5 / +300) eller en ΔRef-kolonne.
        expect([...container.querySelectorAll("th")].map((th) => th.textContent)).not.toContainEqual(expect.stringMatching(/Δ/));
        expect(container.querySelectorAll("[data-role='variance-label'], .fjv-delta").length).toBe(0);
        expect(tekst).not.toMatch(/[+−-]\d[\d.]*,\d\s*(t\.kr\.|MWh|pp)/);
        // Farvevalget hører til et ΔRef; uden det er der intet at vælge farver til.
        expect(container.querySelector("[aria-label='Farver i tabellen']")).toBeNull();
        // Og kortet siger hvorfor — som en ukendt dom, ikke som en afvisning.
        expect(tekst).toMatch(/kan ikke afgøres/i);
        expect(tekst).not.toMatch(/kan ikke sammenlignes direkte|afviger/i);
    });
});

describe("fund E: ved ukendt dom står begge værdier med hver sin periode", () => {
    it("Δ driftsomkostning: de to driftsomkostninger og deres perioder — og et neutralt mærke", () => {
        const { container } = render(<DeltaObjektiv a={ref()} b={scen()} />);
        const tekst = container.textContent ?? "";
        expect(tekst).toMatch(/Reference\s*866,6 t\.kr\.\s*·\s*5\. jan\.–6\. jan\. 2026/);
        expect(tekst).toMatch(/Scenarie\s*843,1 t\.kr\.\s*·\s*5\. jan\.–6\. jan\. 2026/);
        expect(tekst).not.toMatch(/23,5/);                                           // før: "−23,5 t.kr. (kan ikke afgøres)"
        expect([...container.querySelectorAll(".fjv-maerke")].map((m) => [m.getAttribute("data-tone"), m.textContent])).toEqual([["neutral", "Kan ikke afgøres"]]);   // før: advarsel
    });
    it("Nøgletal: reference og scenarie i hver sin kolonne med perioden i overskriften", () => {
        const { container } = render(<Noegletal a={ref()} b={scen()} />);
        const hoveder = [...container.querySelectorAll("th")].map((th) => th.textContent);
        expect(hoveder).toEqual(["Nøgletal", "Reference · 5. jan.–6. jan. 2026", "Scenarie · 5. jan.–6. jan. 2026"]);
        const drift = [...container.querySelectorAll("tbody tr")].find((r) => r.textContent?.startsWith("Driftsomkostning"))!;
        expect([...drift.querySelectorAll("td")].map((td) => td.textContent)).toEqual(["Driftsomkostning (t.kr.)", "866,6", "843,1"]);
    });
    it("Varmeproduktion pr. enhed: produktionen i begge kørsler, uden ΔRef", () => {
        saetVisning("delta", "heatmap");
        const { container } = render(<Produktion a={ref()} b={scen()} />);
        const halm = [...container.querySelectorAll("tbody tr")].find((r) => r.textContent?.startsWith("halmkedel"))!;
        expect([...halm.querySelectorAll("td")].slice(0, 3).map((td) => td.textContent)).toEqual(["halmkedel", "600", "900"]);
    });
    it("Lager: afladet energi i begge kørsler, og hvilket lager scenariet er uden — uden ΔRef", () => {
        const { container } = render(<LagerDelta a={ref()} b={scen()} />);
        expect(container.textContent).toMatch(/Scenariet kører uden tank_lav/);
        expect([...container.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Lager", "Ref · 5. jan.–6. jan. 2026 (MWh)", "Scen · 5. jan.–6. jan. 2026 (MWh)"]);   // P3-2: hver sin periode
    });
    it("Måned for måned: henviser til sammensætningen ovenfor i stedet for et ΔRef pr. måned", () => {
        const { container } = render(<MaanedDelta a={ref()} b={scen()} />);
        expect(container.querySelector("table")).toBeNull();
        expect(container.textContent).toMatch(/sammensætningen pr\. måned/i);
    });
});

describe("fund E: balancekortet har sin egen tekst for manglende grundlag", () => {
    it("kun scenariet har balancemarked, og modelversionen er ukendt: ikke 'afviger også i modelversion', og ingen 'værdi'", () => {
        const { container } = render(<BalanceDelta a={ref()} b={scenMedBalance()} />);
        const tekst = container.textContent ?? "";
        // Før: "Kun scenariet har balancemarked, men kørslerne afviger også i modelversion. Δ driftsomkostning (−23,5 t.kr.) er …"
        expect(tekst).not.toMatch(/afviger også i/);
        expect(tekst).toMatch(/Kun scenariet er regnet med balancemarked/);
        expect(tekst).toMatch(/modelversion kendes ikke for begge/);
        expect(tekst).toMatch(/Balancetallene står side om side/);
        expect([...container.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Marked", "Produkt", "Ref · 5. jan.–6. jan. 2026 (t.kr.)", "Scen · 5. jan.–6. jan. 2026 (t.kr.)"]);   // P3-2: hver sin periode
    });
    it("kontrol: med kendt modelversion og balancen som eneste forskel siges balancemarkedets værdi som før", () => {
        const { container } = render(<BalanceDelta a={pakke("ref", { objektiv: 866_567.72, halm: 600, gas: 400 })} b={pakke("scen", { objektiv: 843_051.76, halm: 600, gas: 400, balance: 150_000 })} />);
        expect(container.textContent).toMatch(/Balancemarkedets værdi: 23,5 t\.kr\./);
    });
});

describe("fund E: ved 'nej' vises tallene neutralt — nu også i de kort, der ikke spurgte dommen", () => {
    const anden = () => pakke("scen", { objektiv: 843_051.76, halm: 900, gas: 100, udenTank: true, over: { model_commit: "eef950a000000000000000000000000000000000" } });
    it.each([["Varmeproduktion pr. enhed", Produktion], ["Måned for måned", MaanedDelta], ["Lager", LagerDelta]] as const)(
        "%s: ingen grønne eller røde ΔRef og intet farvevalg, selv med Heatmap og rød/grøn valgt", (_navn, Komponent) => {
            saetVisning("delta", "heatmap");
            const { container } = render(<Komponent a={ref({})} b={anden()} />);
            expect(dømmendeFarver(container)).toBe(0);                               // før: farvede celler efter fortegn
            expect(container.querySelector("[aria-label='Farver i tabellen']")).toBeNull();
            expect(container.textContent).toMatch(/ikke direkte sammenlignelige/);
        });
    it("kontrol: et direkte sammenligneligt par farves som før", () => {
        saetVisning("delta", "heatmap");
        const { container } = render(<Produktion a={ref({})} b={scen({})} />);
        expect(container.querySelectorAll("td[data-heat]").length).toBeGreaterThan(0);
        expect(container.querySelector("[aria-label='Farver i tabellen']")).not.toBeNull();
    });
});

describe("fund D i kortet 'Kan de to kørsler sammenlignes?': varmelast og solprofil står i tabellen", () => {
    it("to forskellige frosne varmelastserier: rækken 'Varmelast' viser dem, og budskabet siger, hvad der ikke kan afgøres", () => {
        const med = (sha: string) => { const p = ref({}); const input = [...p.input, ind("scenarie", "_koersel.tidsserie.varmelast", JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", sha256: sha.repeat(64) }))]; return { ...p, input, profil: profil(p.k, "Andeby", null, input) }; };
        const { container } = render(<Sammenlignelighed a={med("a")} b={med("b")} />);
        const række = [...container.querySelectorAll("tbody tr")].find((r) => r.textContent?.startsWith("Varmelast"))!;
        expect([...række.querySelectorAll("td")].map((td) => td.textContent)).toEqual(["Varmelast", "tidsserie aaaaaaaaaaaa", "tidsserie bbbbbbbbbbbb", "ukendt"]);
        expect(container.textContent).toMatch(/om den er valgt i scenariet eller arvet fra værket/);
        expect([...container.querySelectorAll("tbody tr")].map((r) => r.querySelector("td")?.textContent)).toContain("Solprofil");
    });
});
