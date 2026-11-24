// Efterprøvningen af rettelserne i runde 15, fund G (P2): "Historien kan give den modsatte forklaring, når referencen
// bærer ændringen."
//
// Genskabt FØR rettelsen: en reference med MÅLT varmelast (værkets tidsserie) og et scenarie med syntesen gav
// "I dette scenarie bruger vi målt varmelast (–) i stedet for syntesen" — det modsatte af, hvad scenariet gør.
// `scenarier/historie.ts` skrev den frosne serie om til `_koersel.heat_csv` med seriens NAVN som værdi, og
// generatorens tekst for den sti kendte kun retningen syntese → måling. Samme omskrivning skjulte forskellen mellem to
// serier med ens navn (navnet var hele værdien; id og hash var væk): "Scenariet har samme input som …".
//
// Efter rettelsen bærer historien seriens id og sha256 hele vejen til tekstgeneratoren (`anbefaling.ts ›
// aendringsfraser`), som formulerer alle retninger med serienavne: syntese → måling, måling → syntese, serie → anden
// serie, og det samme for modelrepoets varmelastfiler (`heat_csv`).
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import type { Koersel, Noegletal } from "../../analyser/beregn";
import { historieEfterKørsel, saetningFørKørsel, type KørselMedData } from "../historie";
import type { TidsserieInfo } from "../varmelast";

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
const VAERK = [ind("vaerk", "storage.tank.enabled", "true"), ind("vaerk", "units.kedel.type", "\"gas_boiler\""), ind("vaerk", "units.kedel.enabled", "true")];
const FAST = [ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-16\""), ind("scenarie", "_koersel.med_balancering", "false")];

const serie = (id: string, navn: string, sha: string): TidsserieInfo => ({
    id, rolle: "varmelast", navn, sha256: sha.repeat(64), sti: `Files/fjv/tidsserier/billund/${sha}.csv`, oploesning: "1h",
    start: "2025-07-01T00:00:00Z", slut: "2026-06-30T23:00:00Z", status: "gyldig", aktiv: true,
} as TidsserieInfo);
const A = serie("11111111-1111-4111-8111-111111111111", "Billund målt 2025–26", "a");
const B = serie("22222222-2222-4222-8222-222222222222", "Billund målt, renset", "b");
/** Samme navn som A — en ny upload af "samme" måling med andet indhold. */
const A2 = serie("33333333-3333-4333-8333-333333333333", "Billund målt 2025–26", "c");

/** Kørslens frosne input: syntese (ingen række), en af værkets tidsserier, eller en af modelrepoets filer. */
const frossen = (s: TidsserieInfo) => ind("scenarie", "_koersel.tidsserie.varmelast", JSON.stringify({ id: s.id, sha256: s.sha256, sti: s.sti }));
const fil = (navn: string) => ind("scenarie", "_koersel.heat_csv", JSON.stringify(navn));
const input = (...egne: InputRække[]): InputRække[] => [...VAERK, ...FAST, ...egne];
const s1 = (ref: InputRække[], scen: InputRække[], serier: TidsserieInfo[] = [A, B, A2]) => saetningFørKørsel(ref, "referencen", scen, "scenariet", "Billund", serier);

describe("fund G: sætning 1 siger, hvad SCENARIET gør — i begge retninger", () => {
    it("efterprøvningens tilfælde: målt reference, syntetisk scenarie", () => {
        const s = s1(input(frossen(A)), input());
        // Før rettelsen: "I dette scenarie bruger vi målt varmelast (–) i stedet for syntesen — ellers som referencen."
        expect(s).toBe("I dette scenarie bruger vi syntesen i stedet for den målte varmelast 'Billund målt 2025–26' — ellers som referencen.");
        expect(s).not.toMatch(/\(–\)/);
    });
    it("den oprindelige retning: syntetisk reference, målt scenarie", () => {
        expect(s1(input(), input(frossen(A)))).toBe("I dette scenarie bruger vi den målte varmelast 'Billund målt 2025–26' i stedet for syntesen — ellers som referencen.");
    });
    it("serie → anden serie: begge navne, scenariets først", () => {
        expect(s1(input(frossen(A)), input(frossen(B)))).toBe("I dette scenarie bruger vi den målte varmelast 'Billund målt, renset' i stedet for 'Billund målt 2025–26' — ellers som referencen.");
        expect(s1(input(frossen(B)), input(frossen(A)))).toBe("I dette scenarie bruger vi den målte varmelast 'Billund målt 2025–26' i stedet for 'Billund målt, renset' — ellers som referencen.");
    });
    it("to serier med SAMME navn er stadig en ændring — og skelnes på deres sha256", () => {
        const s = s1(input(frossen(A)), input(frossen(A2)));
        // Før rettelsen: "Scenariet har samme input som referencen." — navnet var det eneste, der blev sammenlignet.
        expect(s).not.toMatch(/samme input/);
        expect(s).toBe("I dette scenarie bruger vi den målte varmelast 'Billund målt 2025–26' (sha256 cccccccccccc) i stedet for 'Billund målt 2025–26' (sha256 aaaaaaaaaaaa) — ellers som referencen.");
    });
    it("samme serie på begge sider er ikke en ændring", () => {
        expect(s1(input(frossen(A)), input(frossen(A)))).toBe("Scenariet har samme input som referencen.");
    });
    it("en serie, hvis navn ikke kendes her (fx et importeret arkiv), nævnes på sit sha256 — aldrig som en tom parentes", () => {
        expect(s1(input(frossen(A)), input(), [])).toBe("I dette scenarie bruger vi syntesen i stedet for den målte varmelast (tidsserie, sha256 aaaaaaaaaaaa) — ellers som referencen.");
    });
});

describe("fund G: modelrepoets varmelastfiler (heat_csv) har samme tre retninger", () => {
    it("fil → syntese (før: 'målt varmelast (–) i stedet for syntesen')", () => {
        expect(s1(input(fil("billund_2025.csv")), input())).toBe("I dette scenarie bruger vi syntesen i stedet for den målte varmelast (billund_2025.csv) — ellers som referencen.");
    });
    it("syntese → fil", () => {
        expect(s1(input(), input(fil("billund_2025.csv")))).toBe("I dette scenarie bruger vi den målte varmelast (billund_2025.csv) i stedet for syntesen — ellers som referencen.");
    });
    it("fil → anden fil", () => {
        expect(s1(input(fil("a.csv")), input(fil("b.csv")))).toBe("I dette scenarie bruger vi den målte varmelast (b.csv) i stedet for (a.csv) — ellers som referencen.");
    });
    it("fil → værkets tidsserie er ÉN ændring af varmelasten, ikke to modsatrettede", () => {
        const s = s1(input(fil("a.csv")), input(frossen(B)));
        expect(s).toBe("I dette scenarie bruger vi den målte varmelast 'Billund målt, renset' i stedet for (a.csv) — ellers som referencen.");
        expect(s.match(/varmelast/g)?.length).toBe(1);
    });
});

describe("fund G: hele historien efter kørsel bærer serien frem", () => {
    let n = 0;
    function kørsel(navn: string, objektiv: number, egne: InputRække[]): KørselMedData {
        n++;
        const k = {
            id: `k${n}`, scenarie_id: `s${n}`, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date(Date.UTC(2026, 10, 18, 9, n)),
            model_commit: "939228aa048563c8498382a79d207c8b03fbda57", data_commit: "106b9fce9a2e3610090b1a542559024056449b88",
            oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal", objektiv_dkk: objektiv, best_bound: objektiv,
        } as Koersel;
        return { k, navn, input: input(...egne), noegletal: [{ id: `n${n}`, koersel_id: k.id, gruppe: "objektiv", noegle: "objektiv_dkk", vaerdi: objektiv } as Noegletal] };
    }
    it("målt reference, syntetisk scenarie: sætning 1 siger 'syntesen i stedet for den målte'", () => {
        const h = historieEfterKørsel(kørsel("Målt last", 5_000_000, [frossen(A)]), kørsel("Syntetisk last", 5_100_000, []), "Billund", new Set(), [A, B]);
        expect(h.tekst).toMatch(/^I dette scenarie bruger vi syntesen i stedet for den målte varmelast 'Billund målt 2025–26' — ellers som Målt last\./);
        expect(h.vurdering.delta).toBeCloseTo(100_000, 2);
    });
    it("to serier med samme navn: historien udebliver ikke som 'samme input'", () => {
        const h = historieEfterKørsel(kørsel("Første upload", 5_000_000, [frossen(A)]), kørsel("Anden upload", 5_100_000, [frossen(A2)]), "Billund", new Set(), [A, A2]);
        expect(h.tekst).not.toMatch(/samme input/);
        expect(h.tekst).toMatch(/sha256 cccccccccccc\) i stedet for 'Billund målt 2025–26' \(sha256 aaaaaaaaaaaa\)/);
    });
});
