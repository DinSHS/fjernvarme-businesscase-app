// Runde 15, fund 3.4 (den uafhængige test 18. november 2026): for 2-døgnsparret (Δ = 652 kr.) stod der "inden for
// solverens tolerance (0 kr.) eller under væsentlighedsgrænsen (1.000 kr.)", mens mærket ved siden af sagde "over
// 100 × tolerancen". Begge dele var rigtige, men teksten sagde ikke, HVILKEN regel der bandt — og tolerancen stod
// som "0 kr.", fordi et gab på under en krone blev rundet ned. Genskabt FØR rettelsen.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { ordnPar, vurder, type Side } from "./anbefaling";
import { absolutGab, difference, differenceTekst, gabTekst, maanedstabel, profil, samlNoegletal, toleranceKr, type Koersel, type Noegletal, type Scenarie } from "./beregn";
import type { Pakke } from "./data";
import { DeltaObjektiv } from "./sammenlign";

afterEach(cleanup);

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
let n = 0;
const VAERK = [ind("vaerk", "meta.titel", "\"Testværk\""), ind("vaerk", "storage.tank.enabled", "true"), ind("vaerk", "units.kedel.type", "\"gas_boiler\""), ind("vaerk", "units.kedel.enabled", "true")];

function pakke(id: string, objektiv: number, gab: number, periode: [string, string], uden = false): Pakke {
    const input = [...VAERK, ind("scenarie", "_koersel.start", JSON.stringify(periode[0])), ind("scenarie", "_koersel.slut", JSON.stringify(periode[1])), ind("scenarie", "_koersel.med_balancering", "false"),
        ...(uden ? [ind("aendring", "storage.tank.enabled", "false")] : [])];
    const k = {
        id, scenarie_id: `s-${id}`, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date(Date.UTC(2026, 10, 18, 8, n++)),
        model_commit: "90fb16eb1e2d5aa8e619b5a951b93760fa803985", data_commit: "106b9fce9a2e3610090b1a542559024056449b88",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv, best_bound: objektiv - gab,
    } as Koersel;
    return {
        k, vaerkNavn: "Testværk", vaerkKode: "t", scenarie: { id: k.scenarie_id, navn: id, med_balancering: false } as Scenarie,
        samlet: samlNoegletal([{ id: `n${n}`, koersel_id: id, gruppe: "objektiv", noegle: "objektiv_dkk", vaerdi: objektiv } as Noegletal]),
        maaneder: maanedstabel([]), input, profil: profil(k, "Testværk", null, input), objekter: { enheder: [], lagre: [] }, tidsserienavne: new Map(),
    };
}
const side = (p: Pakke): Side => ({ k: p.k, navn: p.scenarie!.navn, vaerkNavn: p.vaerkNavn, input: p.input, samlet: p.samlet, profil: p.profil });
const TO: [string, string] = ["2026-01-05", "2026-01-06"], HELAAR: [string, string] = ["2025-07-01", "2026-06-30"];
const begrundelse = (a: Pakke, b: Pakke) => vurder(ordnPar(side(a), side(b))).begrundelse;

describe("3.4: tolerancen vises ikke som '0 kr.', når gabet er under en krone", () => {
    it("toleranceKr: 0 er 0, under 1 kr. er '< 1 kr.', ellers beløbet", () => {
        expect([toleranceKr(0), toleranceKr(0.004), toleranceKr(0.5), toleranceKr(0.99), toleranceKr(1), toleranceKr(1234.4)])
            .toEqual(["0 kr.", "< 1 kr.", "< 1 kr.", "< 1 kr.", "1 kr.", "1.234 kr."]);
    });
    it("Δ driftsomkostning: 'Tolerance < 1 kr.' og budskabet siger '< 1 kr.' (før: '0 kr.')", () => {
        const a = pakke("ref", 866_567.72, 0.3, TO), b = pakke("uden", 867_219.55, 0.2, TO, true);
        expect(differenceTekst(difference(a.k, b.k)!)).toMatch(/summen af gabene, < 1 kr\.\)/);
        const t = render(<DeltaObjektiv a={a} b={b} />).container.textContent!;
        expect(t).toMatch(/Tolerance\s*< 1 kr\. \(summen af de to gab\)/);
        expect(t).not.toMatch(/\b0 kr\./);
    });
    it("kørslens usikkerhed: 'under 1 kr. over det bedst mulige' (før: 'højst 0 kr.')", () => {
        expect(gabTekst(absolutGab(pakke("ref", 866_567.72, 0.3, TO).k))).toMatch(/^under 1 kr\. over det bedst mulige/);
        expect(gabTekst(absolutGab(pakke("ref", 866_567.72, 0, TO).k))).toMatch(/^højst 0 kr\. over det bedst mulige/);
    });
});

describe("3.4: begrundelsen ved 'Kan ikke afgøres' siger, hvilken regel der binder", () => {
    it("testrapportens par (Δ = 652 kr., gab under 1 kr.): væsentlighedsgrænsen binder, tolerancen gør ikke", () => {
        const t = begrundelse(pakke("ref", 866_567.72, 0.3, TO), pakke("uden", 867_219.55, 0.2, TO, true));
        expect(t).toMatch(/større end solverens tolerance \(< 1 kr\.\)/);
        expect(t).toMatch(/under væsentlighedsgrænsen på 1\.000 kr\./);
        expect(t).toMatch(/den største af 1\.000 kr\. og 0,1 % af referencens driftsomkostning/);
        expect(t).not.toMatch(/tolerance \(0 kr\.\)/);
        expect(t).not.toMatch(/inden for solverens tolerance .* eller under/);
    });
    it("Δ = 50.000 kr. med to gab på 100.000 kr.: tolerancen binder, væsentlighedsgrænsen gør ikke", () => {
        const t = begrundelse(pakke("ref", 30_000_000, 100_000, HELAAR), pakke("uden", 30_050_000, 100_000, HELAAR, true));
        expect(t).toMatch(/inden for solverens tolerance/);
        expect(t).toMatch(/2 × summen af de to kørslers gab \(200\.000 kr\.\)/);
        expect(t).not.toMatch(/under væsentlighedsgrænsen/);
    });
    it("Δ = 500 kr. med to gab på 400 kr.: begge regler binder, og teksten siger begge", () => {
        const t = begrundelse(pakke("ref", 866_567.72, 400, TO), pakke("uden", 867_067.72, 400, TO, true));
        expect(t).toMatch(/både inden for solverens tolerance/);
        expect(t).toMatch(/og under væsentlighedsgrænsen på 1\.000 kr\./);
    });
    it("0,1 % af referencen binder for et stort værk: grænsen er referencens, ikke de 1.000 kr.", () => {
        const t = begrundelse(pakke("ref", 30_000_000, 0, HELAAR), pakke("uden", 30_020_000, 0, HELAAR, true));
        expect(t).toMatch(/under væsentlighedsgrænsen på 30\.000 kr\./);
        expect(t).toMatch(/større end solverens tolerance \(0 kr\.\)/);
    });
});
