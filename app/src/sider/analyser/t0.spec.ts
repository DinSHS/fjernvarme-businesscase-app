// Forbeholdet t0_lager (tankens første time) gælder kun kørsler regnet ved en modelversion med fejlen.
// Modelrepoet rettede lagerbalancen i første time 19/10-2026 (3c2afa6; første pinnede version eef950a). Kørsler i en
// installations database regnet ved b49aeb0 har stadig fejlen og skal stadig have forbeholdet.
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { profil, samlNoegletal, type Koersel, type Noegletal } from "./beregn";
import { forbehold, ordnPar, type Side } from "./anbefaling";
import { T0_DEFEKTE_MODEL_COMMITS } from "./anbefaling.data";

const GAMMEL = "b49aeb0af097be42938b80a0fea6acdd77162836";
const NY = "eef950a2ac7b3808a9456dcf48742ce08e52366a";
const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
const VAERK = [
    ind("vaerk", "meta.titel", "\"Testværk\""),
    ind("vaerk", "units.kedel.type", "\"gas_boiler\""), ind("vaerk", "units.kedel.enabled", "true"),
    ind("vaerk", "storage.tank.enabled", "true"), ind("vaerk", "storage.tank.volume_m3", "4000"),
];
const VINTER = [ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-16\""), ind("scenarie", "_koersel.med_balancering", "false")];

function side(navn: string, objektiv: number, egne: InputRække[], model_commit: string): Side {
    const input = [...VAERK, ...VINTER, ...egne];
    const k = {
        id: navn, scenarie_id: navn, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date("2026-10-26T08:00:00Z"),
        model_commit, data_commit: "106b9fce9a2e3610090b1a542559024056449b88",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv, best_bound: objektiv,
    } as Koersel;
    const nt = { id: `${navn}-o`, koersel_id: navn, gruppe: "objektiv", noegle: "objektiv_dkk", vaerdi: objektiv } as Noegletal;
    return { k, navn, vaerkNavn: "Testværk", input, samlet: samlNoegletal([nt]), profil: profil(k, "Testværk", null, input) };
}
const par = (commit: string) => ordnPar(side("ref", 3_000_000, [], commit), side("uden", 3_050_000, [ind("aendring", "storage.tank.enabled", "false")], commit));

describe("t0_lager følger modelversionen", () => {
    it("listen over versioner med fejlen er netop de tidligere pins (b49aeb0), ikke den aktuelle", () => {
        expect(T0_DEFEKTE_MODEL_COMMITS).toEqual([GAMMEL]);
    });
    it("kørsler ved b49aeb0: tanksammenligning på 12 døgn får forbeholdet, med versionen i teksten", () => {
        const f = forbehold(par(GAMMEL), new Set()).find((x) => x.id === "t0_lager");
        expect(f?.virkning).toBe("nedgrader_begge");
        expect(f?.tekst).toMatch(/b49aeb0/);
        expect(f?.tekst).toMatch(/12 døgn/);
    });
    it("kørsler ved eef950a: ingen t0-forbehold — lagerbalancen gælder også i første time", () => {
        expect(forbehold(par(NY), new Set()).map((x) => x.id)).not.toContain("t0_lager");
    });
});
