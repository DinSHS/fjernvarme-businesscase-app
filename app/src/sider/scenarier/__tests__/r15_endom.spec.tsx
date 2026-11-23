// Kodegennemgangen af runde 15, fund 4 (P2): "Scenarier og Analyser afgør samme pars sammenlignelighed forskelligt."
// Scenarier havde sin egen regel (scenarier/logik.ts › sammenlignelighed) ved siden af Analysers
// (analyser/beregn.ts › sammenlignelighedsDom). Genskabt FØR rettelsen med gennemgangens egne tilfælde:
//  * to færdige Andeby-kørsler 5.–6. januar 2026 med perioden i manifestet, men UDEN opløsning, pins og ønsket gab på
//    begge rækker: Scenarier fandt ingen afvigelse (null er "ens" med null) og viste grønt mærke og "koster … mindre",
//    mens Analyser sagde "Kan ikke afgøres";
//  * `2026-01-05`–`2026-01-06` mod `2026-01-05T00:00:00Z`–`2026-01-06T23:00:00Z`: periodeafvigelse i Scenarier, samme
//    effektive timeperiode i Analyser;
//  * en ukendt værksrevision er højst en note, men kortet sagde alligevel "samme værk og værksrevision";
//  * vandfaldets fodnote sagde "op = dyrere = rød", også når grafen havde slået virkningsfarverne fra.
// Efter rettelsen er der ÉN dom (sammenlignelighedsDom) over ÉN frossen profil (profil: kørslens egne felter, manifestet
// og det frosne input — aldrig scenariets levende felter), og begge områder spørger den. Ukendte nødvendige felter
// giver en udtrykkelig UKENDT dom: ingen farve, intet "billigere/dyrere" — men heller ikke "kan ikke sammenlignes".
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Koersel } from "../../../../rayfin/data/Koersel";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import { maanedstabel, profil, samlNoegletal, sammenlignelighedsDom, type Noegletal as NT } from "../../analyser/beregn";
import type { Pakke } from "../../analyser/data";
import { DeltaObjektiv, Noegletal, Sammenlignelighed, Vandfald } from "../../analyser/sammenlign";
import { ordnPar, vurder } from "../../analyser/anbefaling";
import { tilSide } from "../../analyser/data";
import { KoerselDetaljer } from "../KoerselKort";
import { modReference } from "../koersel-logik";
import { findReference } from "../oversigt-logik";
import { ReferenceCelle } from "../Oversigt";
import { frossenPeriode, frossetFor, frossetPar } from "./frosset.testdata";

// Efterprøvningen af rettelserne i runde 15, fund D: dommen udleder perioden af kørslens FROSNE input (manifestets rene
// datoer er kun kontrollen). Kørslerne her får den periode frosset, som deres manifest siger (frosset.testdata.ts).

vi.mock("@/lib/data/skriv", () => ({ annullerKoersel: async () => ({ besked: "" }) }));
afterEach(cleanup);

const manifest = (start: string, slut: string) => JSON.stringify({ periode: { start, slut } });
const TO = manifest("2026-01-05", "2026-01-06");
const ref = { id: "s1", vaerk_id: "v1", navn: "Hvad er tanken værd? · reference", arkiveret: false, oprettet: new Date(Date.UTC(2026, 10, 18, 8)), med_balancering: false } as Scenarie;
const scen = { ...ref, id: "s2", navn: "Hvad er tanken værd? · scenarie", reference_scenarie_id: "s1", oprettet: new Date(Date.UTC(2026, 10, 18, 9)) } as Scenarie;
let n = 0;
function koersel(s: Scenarie, objektiv_dkk: number, manifest_json: string | null, over: Partial<Koersel> = {}): Koersel {
    n++;
    return {
        id: `k${n}`, scenarie_id: s.id, vaerk_id: s.vaerk_id, vaerk_revision: 1, status: "faerdig", objektiv_dkk, best_bound: objektiv_dkk, solve_status: "optimal",
        oploesning: "1h", data_commit: "106b9fc", model_commit: "939228a", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, manifest_json,
        bestilt: new Date(Date.UTC(2026, 10, 18, 10, n)), afsluttet: new Date(Date.UTC(2026, 10, 18, 11, n)), bestilt_af: "a@b.dk", ...over,
    } as Koersel;
}
/** Gennemgangens første tilfælde: perioden står i manifestet, men rækken har hverken opløsning, pins eller ønsket gab. */
const UDEN = { oploesning: null, data_commit: null, model_commit: null, oensket_rel_gap: null, oensket_abs_gap: null } as unknown as Partial<Koersel>;

/** Analysers dom over de samme to rækker — med og uden scenariet og det frosne input, som siderne nu engang har dem. */
const analyser = (r: Koersel, k: Koersel) => sammenlignelighedsDom(profil(r, "Andeby", ref, frossenPeriode(r)), profil(k, "Andeby", scen, frossenPeriode(k))).status;
/** Scenariers dom: scenariets side (modReference) og oversigten (findReference). */
function scenarier(r: Koersel, k: Koersel) {
    const m = modReference(r, k, frossetPar(r, k));
    const o = findReference(scen, [ref, scen], [k, r], frossetFor([k, r]));
    return { side: m.dom?.status, oversigt: o?.art === "par" ? o.dom : undefined, m, o };
}

describe("fund 4: gennemgangens to tilfælde — samme dom begge steder", () => {
    it("opløsning, pins og gab mangler på begge rækker: UKENDT begge steder (før: grønt i Scenarier, 'Kan ikke afgøres' i Analyser)", () => {
        const r = koersel(ref, 866_567.72, TO, UDEN), k = koersel(scen, 843_051.76, TO, UDEN);
        expect(analyser(r, k)).toBe("ukendt");
        const s = scenarier(r, k);
        expect([s.side, s.oversigt]).toEqual(["ukendt", "ukendt"]);
        expect(s.m.diff).toBeNull();                                    // før: en differens på −23.515,96 kr.
        expect(s.o && "delta" in s.o ? s.o.delta : undefined).toBeUndefined();
    });
    it("ren dato mod præcist tidspunkt for samme døgn: samme periode begge steder (før: 'periode afviger' i Scenarier)", () => {
        const r = koersel(ref, 866_567.72, manifest("2026-01-05", "2026-01-06"));
        const k = koersel(scen, 843_051.76, manifest("2026-01-05T00:00:00Z", "2026-01-06T23:00:00Z"));
        expect(analyser(r, k)).toBe("ja");
        const s = scenarier(r, k);
        expect([s.side, s.oversigt]).toEqual(["ja", "ja"]);
        expect(s.m.diff?.delta).toBeCloseTo(-23_515.96, 2);
        expect(s.m.afviger).toEqual([]);
    });
});

describe("fund 4: de to områder er enige for hvert nødvendigt felt — afvigende, ukendt på den ene side og ukendt på begge", () => {
    const FELTER: [string, Partial<Koersel>, Partial<Koersel>][] = [
        ["opløsning", { oploesning: "15min" }, { oploesning: null } as unknown as Partial<Koersel>],
        ["df-data", { data_commit: "a859b8b" }, { data_commit: null } as unknown as Partial<Koersel>],
        ["modelversion", { model_commit: "eef950a" }, { model_commit: null } as unknown as Partial<Koersel>],
        ["relativt gab", { oensket_rel_gap: 0.005 }, { oensket_rel_gap: null } as unknown as Partial<Koersel>],
        ["absolut gab", { oensket_abs_gap: 5000 }, { oensket_abs_gap: null } as unknown as Partial<Koersel>],
    ];
    it.each(FELTER)("%s", (_navn, andet, ukendt) => {
        for (const [over_r, over_k, forventet] of [[{}, andet, "nej"], [{}, ukendt, "ukendt"], [ukendt, ukendt, "ukendt"], [{}, {}, "ja"]] as const) {
            const r = koersel(ref, 866_567.72, TO, over_r), k = koersel(scen, 843_051.76, TO, over_k);
            const s = scenarier(r, k);
            expect([analyser(r, k), s.side, s.oversigt]).toEqual([forventet, forventet, forventet]);
            expect(s.m.diff === null).toBe(forventet !== "ja");
        }
    });
    it("periode: en anden er 'nej', en manglende er 'ukendt' — også når det LEVENDE scenarie har en periode", () => {
        const r = koersel(ref, 866_567.72, TO);
        const anden = koersel(scen, 3_441_004.22, manifest("2026-01-05", "2026-01-16"));
        expect([analyser(r, anden), scenarier(r, anden).side]).toEqual(["nej", "nej"]);
        // Kørslen har intet manifest. Scenariets nuværende periode (som kan være rettet siden kørslen) er ikke kørslens.
        const uden = koersel(scen, 843_051.76, null);
        const levende = { ...scen, periode_start: "2026-01-05", periode_slut: "2026-01-06" } as Scenarie;
        const refLevende = { ...ref, periode_start: "2026-01-05", periode_slut: "2026-01-06" } as Scenarie;
        // Før: "ja" i Analyser (perioden blev læst af det levende scenarie), "periode afviger" i Scenarier.
        expect(sammenlignelighedsDom(profil(r, "Andeby", refLevende, frossenPeriode(r)), profil(uden, "Andeby", levende, frossenPeriode(uden))).status).toBe("ukendt");
        expect(scenarier(r, uden).side).toBe("ukendt");
    });
    it("værk og værksrevision: et andet værk og to kendte, forskellige revisioner er 'nej' begge steder", () => {
        const r = koersel(ref, 866_567.72, TO);
        const rev = koersel(scen, 843_051.76, TO, { vaerk_revision: 2 });
        expect([analyser(r, rev), scenarier(r, rev).side, scenarier(r, rev).oversigt]).toEqual(["nej", "nej", "nej"]);
        expect(scenarier(r, rev).m.afviger).toEqual(["værkets revision"]);
    });
});

describe("fund 4: den ukendte dom i Scenarier — ingen farve og intet 'billigere', men heller ikke 'kan ikke sammenlignes'", () => {
    const par = () => [koersel(ref, 866_567.72, TO, UDEN), koersel(scen, 843_051.76, TO, UDEN)] as const;

    it("kørselskortet: intet ΔRef i virkningsfarve, ingen 'koster … mindre', og beskeden siger 'kan ikke afgøres' med felterne", () => {
        const [r, k] = par();
        const { container } = render(<KoerselDetaljer k={k} reference={r} frosset={frossetPar(r, k)} />);
        expect(container.querySelectorAll("[data-impact='good'], [data-impact='bad']")).toHaveLength(0);      // før: grøn
        expect(container.textContent).not.toMatch(/mindre end referencen|mere end referencen/);              // før: "koster 23.516 kr. mindre"
        expect(container.textContent).toMatch(/kan ikke afgøres/i);
        expect(container.textContent).toMatch(/opløsning/);
        expect(container.textContent).not.toMatch(/Kan ikke sammenlignes direkte/);
        expect(container.textContent).not.toMatch(/afviger/);
    });
    it("oversigtens referencecelle: hverken grønt mærke eller 'afviger' — 'kan ikke afgøres'", () => {
        const [r, k] = par();
        const { container } = render(<ReferenceCelle r={findReference(scen, [ref, scen], [k, r], frossetFor([k, r]))} />);
        expect(container.querySelector(".fjv-maerke[data-tone='ok']")).toBeNull();                           // før: grønt mærke
        expect(container.textContent).toMatch(/kan ikke afgøres/i);
        expect(container.textContent).not.toMatch(/afviger/);
    });
    it("kontrol: en kendt afvigelse siger stadig 'kan ikke sammenlignes direkte … afviger'", () => {
        const k = koersel(scen, 3_441_004.22, manifest("2026-01-05", "2026-01-16")), r = koersel(ref, 866_567.72, TO);
        const { container } = render(<KoerselDetaljer k={k} reference={r} frosset={frossetPar(r, k)} />);
        expect(container.textContent).toMatch(/Kan ikke sammenlignes direkte med referencen: periode afviger/);
    });
});

// ---------------------------------------------------------------- Analysers kort følger dommen

let m = 0;
const nt = (gruppe: string, noegle: string, vaerdi: number): NT => ({ id: `r15e-${m++}`, koersel_id: "k", gruppe, noegle, vaerdi } as NT);
function pakke(k: Koersel): Pakke {
    return {
        k, vaerkNavn: "Andeby", vaerkKode: "andeby", scenarie: { id: k.scenarie_id, navn: k.id, med_balancering: false } as Scenarie,
        samlet: samlNoegletal([nt("objektiv", "objektiv_dkk", k.objektiv_dkk!), nt("el", "omkostning_dkk", 600_000), nt("el", "salg_dkk", 170_000)]),
        maaneder: maanedstabel([]), input: frossenPeriode(k), profil: profil(k, "Andeby", null, frossenPeriode(k)), objekter: { enheder: [], lagre: [] }, tidsserienavne: new Map(),
    };
}

describe("fund 4: teksterne i Analyser følger dommen", () => {
    it("ukendt værksrevision: kortet påstår ikke 'samme værksrevision' — det siger, at den ikke kendes", () => {
        const a = pakke(koersel(ref, 866_567.72, TO)), b = pakke(koersel(scen, 843_051.76, TO, { vaerk_revision: null } as unknown as Partial<Koersel>));
        expect(sammenlignelighedsDom(a.profil, b.profil).status).toBe("ja");      // en ukendt revision er en note (uændret)
        const { container } = render(<Sammenlignelighed a={a} b={b} />);
        const budskab = container.textContent ?? "";
        expect(budskab).not.toMatch(/samme værk og værksrevision/);                // før: stod der
        expect(budskab).toMatch(/værkets revision kendes ikke for begge/i);
    });
    it("kontrol: to kendte, ens revisioner → 'samme værk og værksrevision'", () => {
        const { container } = render(<Sammenlignelighed a={pakke(koersel(ref, 866_567.72, TO))} b={pakke(koersel(scen, 843_051.76, TO))} />);
        expect(container.textContent).toMatch(/samme værk og værksrevision/);
    });
    it("vandfaldets fodnote: 'op = dyrere = rød' kun når trinene faktisk er farvet", () => {
        const sammenlignelig = render(<Vandfald a={pakke(koersel(ref, 866_567.72, TO))} b={pakke(koersel(scen, 843_051.76, TO))} />);
        expect(sammenlignelig.container.textContent).toMatch(/op = dyrere = rød/);
        cleanup();
        for (const b of [koersel(scen, 3_441_004.22, manifest("2026-01-05", "2026-01-16")), koersel(scen, 843_051.76, TO, UDEN)]) {
            const { container } = render(<Vandfald a={pakke(koersel(ref, 866_567.72, TO))} b={pakke(b)} />);
            expect(container.textContent).not.toMatch(/rød|grøn/);                 // før: "(op = dyrere = rød)" under neutrale trin
            expect(container.textContent).toMatch(/neutrale/);
            cleanup();
        }
    });
});

describe("fund 4: også Analysers egne tekster skelner den ukendte dom fra en afvisning", () => {
    const par = () => [pakke(koersel(ref, 866_567.72, TO, UDEN)), pakke(koersel(scen, 843_051.76, TO, UDEN))] as const;
    it("Δ driftsomkostning og nøgletal: 'kan ikke afgøres' — ikke 'kan ikke sammenlignes' eller 'ikke sammenlignelige'", () => {
        const [a, b] = par();
        for (const kort of [<DeltaObjektiv key="d" a={a} b={b} />, <Noegletal key="n" a={a} b={b} />]) {
            const { container } = render(kort);
            expect(container.textContent).toMatch(/kan ikke afgøres/i);
            expect(container.textContent).not.toMatch(/kan ikke sammenlignes direkte|ikke sammenlignelige|ikke direkte sammenlignelige|er derfor ikke scenariets virkning/i);
            expect(container.querySelectorAll("[data-impact='good'], [data-impact='bad']")).toHaveLength(0);
            cleanup();
        }
    });
    it("anbefalingens sætning: 'kan ikke afgøres', og ingen anbefaling", () => {
        const [a, b] = par();
        const v = vurder(ordnPar(tilSide(a), tilSide(b)), new Set());
        expect(v.kategori).toBe("kan_ikke_afgoeres");
        expect(v.saetning).toMatch(/kan ikke afgøres/i);
        expect(`${v.saetning} ${v.begrundelse}`).not.toMatch(/kan ikke sammenlignes direkte/);          // før: sætningen sagde det
    });
});
