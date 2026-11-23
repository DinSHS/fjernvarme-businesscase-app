// Runde 15, opfølgning: README_PINS i Analyser stod ved eef950a, mens referencetal.json ved 939228a lader en reference
// bære sin egen liste af modelversioner (Spor A-ankeret er regnet igen efter spotrettelsen; de fire øvrige er fra før).
// Genskabt FØR rettelsen: en Spor A-kørsel ved pinnen (939228a, df-data 106b9fc) fik ikke mærket "README-reference" i
// kørselslisten — reglen krævede eef950a for alle fem referencer og kendte kun df-data 392992c.
// Efter rettelsen afgør REFERENCENS egne modelversioner (Reference.modelCommits) både kørslens og værkets commit.
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import type { Koersel, Scenarie } from "./beregn";
import { oprindelse, readmeReferencer, type VaerkKilde } from "./sammensaetning";
import { README_PINS } from "./sammensaetning.data";

const EEF = "eef950a2ac7b3808a9456dcf48742ce08e52366a", P90 = "90fb16eb1e2d5aa8e619b5a951b93760fa803985", P93 = "939228aa048563c8498382a79d207c8b03fbda57";
const D39 = "392992c7fe35992e79fba8d1ba7b91967e8d1481", D10 = "106b9fce9a2e3610090b1a542559024056449b88";
const ind = (sti: string, vaerdi_json: string): InputRække => ({ kilde: "scenarie", sti, vaerdi_json });
const vaerk = (commit: string): VaerkKilde => ({ kilde: "repo", repo_commit: commit });

/** En færdig kørsel af repo-casen uændret, med casens eget gab (README's kommando). */
function koersel(model: string, data: string, rel: number, abs: number): Koersel {
    return { id: "k", scenarie_id: "s", vaerk_id: "v", vaerk_revision: 1, status: "faerdig", kilde: "app", model_commit: model, data_commit: data,
        oensket_rel_gap: rel, oensket_abs_gap: abs } as Koersel;
}
const scenarie = (navn: string) => ({ id: "s", navn, med_balancering: false } as Scenarie);
const SPOR_A = [ind("_koersel.med_balancering", "true")];
const ANDEBY_SPOT = [ind("_koersel.med_balancering", "false")];
const type = (kode: string, model: string, data: string, input: InputRække[], vaerkCommit = model, gab: [number, number] = [0.005, 5000]) =>
    oprindelse(koersel(model, data, ...gab), scenarie("Min kørsel"), kode, input, vaerk(vaerkCommit));

describe("README-mærket følger referencens egne modelversioner (referencetal.json ved 939228a)", () => {
    it("referencerne bærer deres versioner: Spor A-ankeret 90fb16e og 939228a, de fire øvrige eef950a", () => {
        const r = new Map(readmeReferencer().map((x) => [x.id, x.modelCommits]));
        expect(r.get("spora_anker")).toEqual([P90, P93]);
        for (const id of ["sporb", "billund_rullende", "andeby_helaar_bal", "andeby_helaar_spot"]) expect(r.get(id), id).toEqual([EEF]);
    });
    it("Spor A ved pinnen (939228a, df-data 106b9fc) ER README-referencen 5.204.555 — før: 'Bestilt i appen'", () => {
        const o = type("billund_spora", P93, D10, SPOR_A);
        expect(o.type).toBe("readme");
        expect(o.detalje).toContain("5.204.555");
    });
    it("Spor A ved 90fb16e (også efter spotrettelsen) er det samme tal", () => {
        expect(type("billund_spora", P90, D10, SPOR_A).type).toBe("readme");
    });
    it("Spor A ved eef950a er IKKE en måling af det nye tal (README's tal er regnet igen)", () => {
        expect(type("billund_spora", EEF, D39, SPOR_A).type).toBe("app");
    });
    it("Andeby helår uden balancering: fortsat kun ved eef950a (tallet er fra før spotrettelsen)", () => {
        expect(type("andeby", EEF, D39, ANDEBY_SPOT, EEF, [0.001, 1000]).type).toBe("readme");
        expect(type("andeby", P93, D10, ANDEBY_SPOT, P93, [0.001, 1000]).type).toBe("app");
    });
    it("værket skal være importeret ved en af referencens versioner — ikke ved en tredje", () => {
        expect(type("billund_spora", P93, D10, SPOR_A, P90).type).toBe("readme");   // 90fb16e og 939228a er begge referencens
        expect(type("billund_spora", P93, D10, SPOR_A, EEF).type).toBe("app");
    });
    it("df-data skal være en kendt commit med målt dato efter README's datakrav: 106b9fc er fra 26. oktober 2026", () => {
        expect(README_PINS.df_data_kendt[D10]).toBe("2026-10-26");
        expect(README_PINS.df_data_kendt[D39]).toBe("2026-10-12");
        expect(type("billund_spora", P93, "a".repeat(40), SPOR_A).type).toBe("app");
    });
    it("et løsere gab end casens er ikke en måling (uændret regel)", () => {
        expect(type("billund_spora", P93, D10, SPOR_A, P93, [0.01, 5000]).type).toBe("app");
    });
});
