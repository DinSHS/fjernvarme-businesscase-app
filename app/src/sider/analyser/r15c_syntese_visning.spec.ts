// Tredje rettelsesrunde i runde 15, P2-3 (følge): når appens udtrykkelige syntesevalg fryses som
// `_koersel.tidsserie.varmelast = "syntetisk"`, må visningerne ikke læse rækken som en TIDSSERIE.
//
// `frosneTidsserier` tog enhver række under `_koersel.tidsserie.` som en serie (med id og sha256 = null), så
// kørselslisten skrev "Målt · tidsserie ukendt" og *Data i denne kørsel* "tidsserie 'navn ikke fundet' (sha256 ukendt)"
// for en kørsel på syntesen. Fejlen fandtes allerede for den manuelle vejs kørsler; fra denne runde ville den ramme
// hver kørsel, der vælger syntesen i appen.
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import type { Koersel, Profil } from "./beregn";
import { datagrundlag, frosneTidsserier, varmelastKilde } from "./datagrundlag";

const ind = (sti: string, v: unknown): InputRække => ({ kilde: "scenarie", sti, vaerdi_json: JSON.stringify(v) });
const SYNTESE = ind("_koersel.tidsserie.varmelast", "syntetisk");
const SERIE = ind("_koersel.tidsserie.varmelast", { id: "11111111-1111-4111-8111-111111111111", sha256: "a".repeat(64) });

describe("P2-3 · en frossen \"syntetisk\" er ikke en tidsserie", () => {
    it("frosneTidsserier: kun rækker, der henviser til en serie", () => {
        expect(frosneTidsserier([SYNTESE])).toEqual([]);
        expect(frosneTidsserier([ind("_koersel.tidsserie.solprofil", null)])).toEqual([]);
        expect(frosneTidsserier([SERIE])).toEqual([{ rolle: "varmelast", id: "11111111-1111-4111-8111-111111111111", sha256: "a".repeat(64) }]);
        // En henvisning uden sha256 er stadig en (ufuldstændig) serie — den skal ses, ikke skjules.
        expect(frosneTidsserier([ind("_koersel.tidsserie.varmelast", { id: "x" })])).toEqual([{ rolle: "varmelast", id: "x", sha256: null }]);
    });
    it("kørselslisten: Syntetisk — ikke 'Målt · tidsserie ukendt'", () => {
        // Før rettelsen: { maalt: true, tekst: "Målt", navn: "tidsserie ukendt", sha256: null }.
        expect(varmelastKilde([SYNTESE], null)).toEqual({ maalt: false, tekst: "Syntetisk", navn: null, sha256: null });
        expect(varmelastKilde([SERIE], null).maalt).toBe(true);
    });
    it("Data i denne kørsel: varmelastlinjen siger syntetisk", () => {
        const k = { id: "k1", status: "faerdig", vaerk_revision: 1 } as unknown as Koersel;
        const p = { oploesning: "1h", periode_fra: "2026-01-05T00:00:00.000Z", periode_til: "2026-01-06T23:00:00.000Z" } as unknown as Profil;
        const linje = datagrundlag(k, "Andeby", p, [SYNTESE, { kilde: "vaerk", sti: "data.dmi_area", vaerdi_json: '"DK1"' }]).find((x) => x.etiket === "Varmelast")!;
        expect(linje.vaerdi).toMatch(/^syntetisk/);
        expect(linje.vaerdi).not.toMatch(/tidsserie/);
    });
});
