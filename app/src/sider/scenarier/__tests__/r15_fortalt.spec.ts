// Runde 15, mail 2 (den uafhængige test 18. november 2026) på scenariets side: kortet "Scenariet fortalt" og
// nøgletallet i kortet "Kørsel" skal læse samme kørsel i samme rolle. Genskabt FØR rettelsen: peger et scenarie UDEN
// ændringer på en reference, der selv bærer ændringen (fx referencen "uden tank"), byttede generatoren rollerne og
// fortalte REFERENCEN som scenariet ("slår vi tanken fra … gør driften ca. 24.000 kr. dyrere") på scenariets egen
// side — hvor nøgletallet viser dette scenarie som 23,5 t.kr. BILLIGERE end referencen.
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import type { Koersel, Noegletal } from "../../analyser/beregn";
import { historieEfterKørsel, type KørselMedData } from "../historie";

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
const VAERK = [ind("vaerk", "storage.tank.enabled", "true"), ind("vaerk", "units.kedel.type", "\"gas_boiler\""), ind("vaerk", "units.kedel.enabled", "true")];
let n = 0;
function kørsel(navn: string, objektiv: number, egne: InputRække[]): KørselMedData {
    n++;
    const input = [...VAERK, ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-16\""), ind("scenarie", "_koersel.med_balancering", "false"), ...egne];
    const k = {
        id: `k${n}`, scenarie_id: `s${n}`, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date(Date.UTC(2026, 10, 18, 9, n)),
        model_commit: "90fb16eb1e2d5aa8e619b5a951b93760fa803985", data_commit: "106b9fce9a2e3610090b1a542559024056449b88",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv, best_bound: objektiv,
    } as Koersel;
    return { k, navn, input, noegletal: [{ id: `n${n}`, koersel_id: k.id, gruppe: "objektiv", noegle: "objektiv_dkk", vaerdi: objektiv } as Noegletal] };
}
const UDEN_TANK = [ind("aendring", "storage.tank.enabled", "false")];

describe("mail 2: historien på scenariets side fortæller scenariet — eller siger, at den ikke gør", () => {
    it("referencen bærer ændringen: historien fortælles ikke med byttede roller på scenariets side", () => {
        // Scenariet her er værket som det er (3.441.004,22 kr.); dets reference er kørslen uden tank (3.464.520,18 kr.).
        const h = historieEfterKørsel(kørsel("Uden tank", 3_464_520.18, UDEN_TANK), kørsel("Med tank", 3_441_004.22, []), "Andeby", new Set());
        expect(h.tekst).not.toMatch(/gør driften|dyrere|billigere/);
        expect(h.byttet).toBe(true);
        expect(h.tekst).toMatch(/referencen «Uden tank», der bærer ændringen/);
        expect(h.tekst).toMatch(/sammenligningen/);
    });
    it("kontrol: scenariet bærer ændringen → hele historien, ikke byttet", () => {
        const h = historieEfterKørsel(kørsel("Med tank", 3_441_004.22, []), kørsel("Uden tank", 3_464_520.18, UDEN_TANK), "Andeby", new Set());
        expect(h.byttet).toBe(false);
        expect(h.tekst).toMatch(/slår vi tanken fra/);
        expect(h.tekst).toMatch(/ca\. 24\.000 kr\. dyrere/);
    });
});
