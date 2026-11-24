// Tredje rettelsesrunde i runde 15, P3-1: "Periodens browserparser afviser et gyldigt UTC-tidspunkt."
//
// Arbejderen læser værkets `time.start`/`time.end` med Pythons `datetime.fromisoformat` (fabric/fjv/byg_case.py ›
// _modeltid; modellen bruger samme parser). Browseren udleder kørslens effektive periode af det frosne input
// (analyser/beregn.ts › effektivPeriode) og havde sin egen grammatik oven på `Date.parse`:
//
//   * `2026-01-05T00:00:00+00` (kort nul-offset) er midnat UTC for arbejderen — browseren gav `null`, og et par med
//     netop den tekst på begge sider fik dommen UKENDT og mistede ΔRef (en manuel kørsel på værkets tidsblok, et
//     importeret arkiv);
//   * `2026-02-30` afviser arbejderen — `Date.parse` gjorde den til 2. marts, og perioden så gyldig ud.
//
// Leads afgørelse: samme tidsgrammatik som arbejderen; de omstridte former i de fælles vektorer.
// `skema/vektorer/modeltid/former.json` er MÅLT på arbejderen (fabric/tests/test_modeltid_vektorer.py).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import type { Koersel } from "../../../../rayfin/data/Koersel";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import { effektivPeriode, profil, sammenlignelighedsDom } from "../../analyser/beregn";

const ind = (kilde: InputRække["kilde"], sti: string, v: unknown): InputRække => ({ kilde, sti, vaerdi_json: JSON.stringify(v) });
const tid = (start: string, slut: string): InputRække[] => [ind("vaerk", "time.start", start), ind("vaerk", "time.end", slut), ind("vaerk", "time.resolution", "1h")];
const datoer = (start: string, slut: string): InputRække[] => [ind("scenarie", "_koersel.start", start), ind("scenarie", "_koersel.slut", slut)];

interface Form { navn: string; tid: string; ud: string | null }
const FORMER = (JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../skema/vektorer/modeltid/former.json"), "utf8")) as { tilfaelde: Form[] }).tilfaelde;

/**
 * Bevidste afvigelser fra arbejderen — hver med sin grund, og ingen af dem kan give en forkert dom:
 *
 *  * `laeser`: browseren læser formen, arbejderen afviser den. En kørsel med den tekst bliver aldrig færdig, så der
 *    er intet resultat at dømme. Lille `z` læser den betroede logik også (skema/vektorer/effektiv_akse.json, "værk
 *    med små bogstaver"), og samme spec binder browseren til dén.
 *  * `ukendt`: arbejderen læser formen, browseren giver `null` → dommen UKENDT (den forsigtige side). Pythons
 *    sjældne former, som ingen af appens veje skriver: basisformat, ugedato, mellemrum før zonen, offset med sekunder.
 */
const AFVIGELSER: Record<string, "laeser" | "ukendt"> = {
    "2026-01-05T00:00:00z": "laeser",
    "20260105T000000Z": "ukendt",
    "2026-W02-1": "ukendt",
    "2026-01-05T00:00:00 Z": "ukendt",
    "2026-01-05T00:00:00+00:00:00": "ukendt",
};

describe("P3-1: browseren læser værkets tid med arbejderens grammatik", () => {
    it("vektorfilen har de omstridte former", () => {
        expect(FORMER.length).toBeGreaterThanOrEqual(30);
        expect(FORMER.find((f) => f.tid === "2026-01-05T00:00:00+00")?.ud).toBe("2026-01-05T00:00:00Z");
        expect(FORMER.find((f) => f.tid === "2026-02-30")?.ud).toBeNull();
        for (const a of Object.keys(AFVIGELSER)) expect(FORMER.some((f) => f.tid === a), a).toBe(true);
    });

    for (const f of FORMER) {
        const afv = AFVIGELSER[f.tid];
        it(`${f.navn}: ${JSON.stringify(f.tid)} → ${f.ud ?? "afvist"}${afv ? ` (bevidst afvigelse: ${afv})` : ""}`, () => {
            const p = effektivPeriode(tid(f.tid, f.tid));
            const læst = p ? p.fra.replace(".000Z", "Z") : null;
            if (afv === "laeser") { expect(f.ud).toBeNull(); expect(læst).not.toBeNull(); return; }
            if (afv === "ukendt") { expect(f.ud).not.toBeNull(); expect(læst).toBeNull(); return; }
            expect(læst).toBe(f.ud);
            if (p) expect(p.til).toBe(p.fra);
        });
    }

    it("scenariets frosne datoer: en kalenderdato, der ændres ved parse og formattering, afvises (byg_case._dato)", () => {
        expect(effektivPeriode(datoer("2026-01-05", "2026-01-06"))).toEqual({ fra: "2026-01-05T00:00:00.000Z", til: "2026-01-06T23:00:00.000Z" });
        expect(effektivPeriode(datoer("2026-02-28", "2026-02-30"))).toBeNull();          // før: til og med 2. marts kl. 23
        expect(effektivPeriode(datoer("2025-02-29", "2025-03-01"))).toBeNull();
        expect(effektivPeriode(datoer("2024-02-29", "2024-03-01"))).toEqual({ fra: "2024-02-29T00:00:00.000Z", til: "2024-03-01T23:00:00.000Z" });
    });
});

describe("P3-1: dommen over et par med kort nul-offset i værkets tidsblok", () => {
    const pins = [ind("scenarie", "_koersel.model_commit", "939228aa048563c8498382a79d207c8b03fbda57"), ind("scenarie", "_koersel.data_commit", "106b9fce9a2e3610090b1a542559024056449b88")];
    const ref = { id: "s1", vaerk_id: "v1", navn: "Reference", arkiveret: false, oprettet: new Date(Date.UTC(2026, 10, 18, 8)), med_balancering: false } as Scenarie;
    const scen = { ...ref, id: "s2", navn: "Scenarie", reference_scenarie_id: "s1" } as Scenarie;
    const koersel = (s: Scenarie, id: string, objektiv_dkk: number): Koersel => ({
        id, scenarie_id: s.id, vaerk_id: s.vaerk_id, vaerk_revision: 1, status: "faerdig", objektiv_dkk, best_bound: objektiv_dkk, solve_status: "optimal",
        oploesning: "1h", data_commit: "106b9fce9a2e3610090b1a542559024056449b88", model_commit: "939228aa048563c8498382a79d207c8b03fbda57",
        oensket_rel_gap: 0.0002, oensket_abs_gap: 100, manifest_json: JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-06", oploesning: "1h" } }),
        bestilt: new Date(Date.UTC(2026, 10, 18, 10)), afsluttet: new Date(Date.UTC(2026, 10, 18, 11)), bestilt_af: "a@b.dk",
    }) as Koersel;
    const dom = (a: InputRække[], b: InputRække[]) => sammenlignelighedsDom(profil(koersel(ref, "k1", 866_567.72), "Andeby", ref, [...a, ...pins]), profil(koersel(scen, "k2", 843_051.76), "Andeby", scen, [...b, ...pins]));

    it("efterprøvningens tilfælde: `+00` på begge sider er samme periode → JA (før: ukendt)", () => {
        const kort = tid("2026-01-05T00:00:00+00", "2026-01-06T00:00:00+00");
        expect(effektivPeriode(kort)).toEqual({ fra: "2026-01-05T00:00:00.000Z", til: "2026-01-06T00:00:00.000Z" });
        expect(dom(kort, kort).status).toBe("ja");
    });
    it("to skrivemåder af samme tidspunkt er samme periode: `+00` mod `+00:00` → JA", () => {
        expect(dom(tid("2026-01-05T00:00:00+00", "2026-01-06T00:00:00+00"), tid("2026-01-05T00:00:00+00:00", "2026-01-06T00:00:00Z")).status).toBe("ja");
    });
    it("en dato, arbejderen afviser, giver ikke en periode at sammenligne på → UKENDT, ikke grønt", () => {
        const ugyldig = tid("2026-02-28", "2026-02-30");
        expect(dom(ugyldig, ugyldig).status).toBe("ukendt");          // før: "ja" på 28. februar–2. marts
    });
});
