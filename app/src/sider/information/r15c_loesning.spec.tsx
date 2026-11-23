// Tredje rettelsesrunde i runde 15, P2-6: "En tidsstoppet kørsel kan få en tilsyneladende fejldom mod README."
//
// Efterprøvningens tilfælde: en færdig Spor A-kørsel på referencens periode, pins og opsætning, bestilt med casens gab
// (0,5 % / 5.000 kr.) — men stoppet på tidsgrænsen med et OPNÅET gab på 33 %. Kvalifikationen så kun på det ØNSKEDE
// gab: `maaling: true`, og Information viste "uden for tolerancen" for et foreløbigt objektiv. `solve_status:
// "time_limit"` ændrede intet.
//
// Leads afgørelse: README-målingen kræver en AFSLUTTET løsning inden for referencens gab — det opnåede gab og
// solverstatus afgør det. En tidsstoppet kørsel, eller en med for stort eller ukendt opnået gab, er ikke en måling;
// den står ved siden af facittet med sin solverstatus, uden afvigelse og uden dom. Og en `probe-…`-kørsel, der ER en
// måling, beholder et synligt røgtestmærke ved siden af README-mærket.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FjvSchema } from "../../../rayfin/data/schema";
import type { InputRække } from "@/lib/data/afflad";
import { oprindelse } from "../analyser/sammensaetning";
import { OprindelseCelle } from "../analyser/liste-tabel";
import type { ListeRaekke } from "../analyser/sammensaetning";
import { RefRaekke, sammenfatning } from "./ReferencetalSide";
import { byggRaekker, kvalificer, laesReferencer, loesningsTekst } from "./referencer";

afterEach(cleanup);

type Koersel = FjvSchema["Koersel"];
type Scenarie = FjvSchema["Scenarie"];
type Vaerk = FjvSchema["Vaerk"];

const rå = (import.meta.glob("../dokumentation/indhold/viden/referencetal.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>)["../dokumentation/indhold/viden/referencetal.json"];
const refs = laesReferencer(rå);
const SPOR_A = refs.find((r) => r.id === "spora_anker")!;
const PIN = "939228aa048563c8498382a79d207c8b03fbda57", DF = "106b9fce9a2e3610090b1a542559024056449b88";
const f = (sti: string, v: unknown): InputRække => ({ kilde: "scenarie", sti, vaerdi_json: JSON.stringify(v) });
const opsaetning = (): InputRække[] => [f("_koersel.med_balancering", SPOR_A.scenarie.med_balancering)];
const vaerk = () => ({ id: "v", kode: SPOR_A.kode, kilde: "repo", repo_commit: PIN }) as Vaerk;
/** Spor A-kørslen, bestilt med casens eget gab; løsningen (status, opnået gab, nedre grænse) gives pr. test. */
const koersel = (objektiv_dkk: number, løsning: Partial<Koersel>): Koersel => ({
    id: "k1234567-0000-4000-8000-000000000000", vaerk_id: "v", scenarie_id: "s", status: "faerdig", objektiv_dkk, model_commit: PIN, data_commit: DF, vaerk_revision: 1,
    oensket_rel_gap: 0.005, oensket_abs_gap: 5000,
    afsluttet: new Date("2026-11-23T07:32:12Z"), bestilt: new Date("2026-11-23T07:29:42Z"), ...løsning,
}) as Koersel;
const række = (k: Koersel) => byggRaekker(refs, [vaerk()], [k], new Map([[k.id, opsaetning()]])).find((x) => x.ref.id === "spora_anker")!;
const mærke = (k: Koersel, navn = "Spor A-anker") => oprindelse(k, { id: "s", navn, med_balancering: true } as Scenarie, SPOR_A.kode, opsaetning(), vaerk());

describe("P2-6 · kun en afsluttet løsning inden for referencens gab er en måling", () => {
    it("kontrol: casens gab er 0,5 % / 5.000 kr.", () => {
        expect(SPOR_A.caseGab).toEqual({ rel: 0.005, abs: 5000 });
    });
    it("efterprøvningens tilfælde: stoppet på tidsgrænsen med opnået gab 33 % → ikke en måling, ingen dom", () => {
        const k = koersel(6_900_000, { solve_status: "time_limit", opnaaet_gap: 0.33 });
        const q = kvalificer(SPOR_A, k, opsaetning(), vaerk());
        // Før rettelsen: maaling: true — og Information sagde "uden for tolerancen" om et foreløbigt objektiv.
        expect(q).toMatchObject({ opsaetning: true, uaendret: true, version: true, vaerk: true, data: true, grundlag: true, loest: false, maaling: false });
        const r = række(k);
        expect([r.tilstand, r.vurdering]).toEqual(["ikke-loest", undefined]);
        expect(r.kandidat?.koersel.id).toBe(k.id);
        expect(loesningsTekst(q)).toBe("stoppet ved tidsgrænsen; opnået gab 33 %");
        expect(mærke(k).type).not.toBe("readme");                   // samme udvælgelse i Analyser
    });
    it("optimal med opnået gab 0,109 % (inden for casens 0,5 %) → en måling", () => {
        const k = koersel(5_204_555.28, { solve_status: "optimal", opnaaet_gap: 0.00109 });
        expect(kvalificer(SPOR_A, k, opsaetning(), vaerk())).toMatchObject({ loest: true, maaling: true });
        expect(række(k).tilstand).toBe("indenfor");
        expect(mærke(k).type).toBe("readme");
    });
    it("den nedre grænse er målingen, når den findes: |objektiv − best bound| / |objektiv|", () => {
        const k = koersel(5_204_555.28, { solve_status: "optimal", best_bound: 5_204_555.28 * (1 - 0.001), opnaaet_gap: 0.9 });
        expect(kvalificer(SPOR_A, k, opsaetning(), vaerk())).toMatchObject({ loest: true, maaling: true });
    });
    it("solveren stopper ved det FØRSTE af de to gab: et relativt gab over casens, men under casens 5.000 kr. → en måling", () => {
        const k = koersel(500_000, { solve_status: "optimal", best_bound: 500_000 - 4_000 });   // 0,8 % og 4.000 kr.
        expect(kvalificer(SPOR_A, k, opsaetning(), vaerk())).toMatchObject({ loest: true });
    });
    it("status optimal, men det opnåede gab er ikke oplyst → ikke en måling (det ønskede gab er ikke et bevis)", () => {
        const k = koersel(5_204_555.28, { solve_status: "optimal" });
        const q = kvalificer(SPOR_A, k, opsaetning(), vaerk());
        expect(q).toMatchObject({ loest: false, maaling: false });
        expect(loesningsTekst(q)).toBe("optimal inden for det ønskede gab; opnået gab ikke oplyst");
        expect(række(k).tilstand).toBe("ikke-loest");
    });
    it("status optimal, men opnået gab større end casens på begge mål → ikke en måling", () => {
        const k = koersel(5_204_555.28, { solve_status: "optimal", opnaaet_gap: 0.009 });       // 0,9 % ≈ 46.841 kr.
        const q = kvalificer(SPOR_A, k, opsaetning(), vaerk());
        expect(q).toMatchObject({ loest: false, maaling: false });
        expect(loesningsTekst(q)).toMatch(/opnået gab 0,9 % — større end casens/);
    });
    it("stoppet på tidsgrænsen er ikke en afsluttet løsning — heller ikke med et lille opnået gab", () => {
        const k = koersel(5_204_555.28, { solve_status: "time_limit", opnaaet_gap: 0.0003 });
        expect(kvalificer(SPOR_A, k, opsaetning(), vaerk())).toMatchObject({ loest: false, maaling: false });
    });
    it("uden solverstatus kendes løsningen ikke", () => {
        const q = kvalificer(SPOR_A, koersel(5_204_555.28, { opnaaet_gap: 0.001 }), opsaetning(), vaerk());
        expect(q).toMatchObject({ loest: false, maaling: false });
        expect(loesningsTekst(q)).toMatch(/^ukendt løsningsstatus/);
    });
    it("en afsluttet måling går forud for en nyere, tidsstoppet kørsel", () => {
        const god = { ...koersel(5_204_555.28, { solve_status: "optimal", opnaaet_gap: 0.00109 }), id: "god", afsluttet: new Date("2026-11-20T07:00:00Z") } as Koersel;
        const ny = { ...koersel(6_900_000, { solve_status: "time_limit", opnaaet_gap: 0.33 }), id: "ny", afsluttet: new Date("2026-11-23T07:00:00Z") } as Koersel;
        const r = byggRaekker(refs, [vaerk()], [ny, god], new Map([[god.id, opsaetning()], [ny.id, opsaetning()]])).find((x) => x.ref.id === "spora_anker")!;
        expect([r.tilstand, r.kandidat?.koersel.id]).toEqual(["indenfor", "god"]);
    });
});

describe("P2-6 · den uafsluttede kørsel står ved siden af facittet med sin solverstatus", () => {
    const k = koersel(6_900_000, { solve_status: "time_limit", opnaaet_gap: 0.33 });
    it("rækken viser kørslens objektiv og status — men ingen afvigelse, ingen tolerance og ikke 'uden for tolerancen'", () => {
        const { container } = render(<table><tbody><RefRaekke r={række(k)} /></tbody></table>);
        const celler = [...container.querySelectorAll("td")].map((td) => td.textContent ?? "");
        expect(celler[1]).toBe("5.204.555");                         // README
        expect(celler[2]).toBe("6.900.000");                         // kørslens (foreløbige) objektiv
        expect(celler[3]).toBe("–");                                 // ingen afvigelse
        expect(celler[4]).toBe("–");                                 // ingen tolerance at dømme på
        expect(celler[5]).toMatch(/ikke løst til casens gab/);
        expect(celler[5]).toMatch(/stoppet ved tidsgrænsen; opnået gab 33 %/);
        expect(container.textContent).not.toMatch(/uden for tolerancen|inden for tolerancen/);
    });
    it("sammenfatningen tæller den for sig — ikke som genskabt og ikke som uden for", () => {
        const s = sammenfatning([række(k)]);
        expect(s).toMatch(/0 af 1 er genskabt/);
        expect(s).toMatch(/1 er kørt, men ikke løst til casens gab/);
        expect(s).not.toMatch(/ligger uden for/);
    });
});

describe("P2-6 · en teknisk prøvekørsel, der er en måling, beholder røgtestmærket", () => {
    const k = koersel(5_204_555.28, { solve_status: "optimal", opnaaet_gap: 0.00109 });
    it("probe-…: README-reference OG røgtest", () => {
        const o = mærke(k, "probe-spora");
        // Før rettelsen: type "readme" uden noget spor af, at kørslen var en teknisk prøve.
        expect([o.type, o.roegtest]).toEqual(["readme", true]);
        expect([mærke(k).type, mærke(k).roegtest]).toEqual(["readme", false]);
    });
    it("begge mærker er synlige i kørselslisten", () => {
        const { container } = render(<OprindelseCelle r={{ oprindelse: mærke(k, "probe-spora") } as ListeRaekke} />);
        expect(container.textContent).toContain("README-reference");
        expect(container.textContent).toContain("Røgtest");
        cleanup();
        const uden = render(<OprindelseCelle r={{ oprindelse: mærke(k) } as ListeRaekke} />);
        expect(uden.container.textContent).not.toContain("Røgtest");
    });
    it("en probe-kørsel, der IKKE er en måling, er stadig kun en røgtest", () => {
        const o = mærke(koersel(6_900_000, { solve_status: "time_limit", opnaaet_gap: 0.33 }), "probe-spora");
        expect([o.type, o.roegtest]).toEqual(["roegtest", true]);
    });
});
