// Fjerde rettelsesrunde i runde 15, punkt 3: "En solprofil med samme hash kan ende på en anden enhed."
//
// Lighedsreglen fra tredje runde (P2-4, r15c_ubrugt.spec.tsx) sagde: modelrepoets profilfil og samme fil frosset som
// normaliseret tidsserie er SAMME kilde, når den frosne sti og modelversionen beviser hashen. Den spurgte ikke, HVILKEN
// enhed der bruger profilen. Efterprøvningens tilfælde (Andeby-variant, 5.–6. januar 2026): repo-profilen står på
// `elkedel_ny`, og den aktive `solvarme` har ingen profilsti. I A er ingen serie aktiv. I B er samme fil aktiv som
// normaliseret serie: arbejderen lader elkedlens profil stå og lægger DESUDEN serien på `solvarme`
// (fabric/fjv/byg_case.py › _saet_solprofil). Modellen giver en enhed uden profilsti et konstant loft og en enhed med
// profilsti et tidsvarierende — planerne har forskellige produktionsgrænser. Dommen var alligevel *ja*.
//
// Reglen efter rettelsen: de to formater er kun samme kilde, når profilen bruges af SAMME aktive enhed(er) på begge
// sider — den frosne profilsti pr. enhed over for manifestets `tidsserier.anvendt.solprofil.enheder`. Kan det ikke
// bevises: *ukendt*.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { iKortProfil, kortProfilFilter } from "@/lib/data/frossen-profil";
import type { Koersel } from "../../../../rayfin/data/Koersel";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import { profil, sammenlignelighedsDom } from "../../analyser/beregn";
import { Sammenlignelighed } from "../../analyser/sammenlign";
import type { Pakke } from "../../analyser/data";
import { modReference } from "../koersel-logik";
import { findReference } from "../oversigt-logik";

afterEach(cleanup);

const ind = (kilde: InputRække["kilde"], sti: string, v: unknown): InputRække => ({ kilde, sti, vaerdi_json: JSON.stringify(v) });
const MODEL = "939228aa048563c8498382a79d207c8b03fbda57", DATA = "106b9fce9a2e3610090b1a542559024056449b88";
const fælles = (): InputRække[] => [
    ind("vaerk", "time.start", "2025-07-01T00:00:00Z"), ind("vaerk", "time.end", "2026-06-30T23:00:00Z"), ind("vaerk", "time.resolution", "1h"),
    ind("scenarie", "_koersel.start", "2026-01-05"), ind("scenarie", "_koersel.slut", "2026-01-06"),
    ind("scenarie", "_koersel.model_commit", MODEL), ind("scenarie", "_koersel.data_commit", DATA),
];
/** Hashen af Andebys solprofil i appens normaliserede form (viden/referencetal.json › solprofil_sha256). */
const ANDEBY_SOL = "35706793bf4dd9c81d88c2b045e39ef9866c17ccfb86e0703067fb42a9e93f29";
const STI = "data/solar_andeby_dmi_karup.csv";
const sol = ind("scenarie", "_koersel.tidsserie.solprofil", { id: "x2", sha256: ANDEBY_SOL });
const sti = (enhed: string, kilde: InputRække["kilde"] = "vaerk") => ind(kilde, `units.${enhed}.production_profile_path`, STI);

const ref = { id: "s1", vaerk_id: "v1", navn: "Reference", arkiveret: false, oprettet: new Date(Date.UTC(2026, 10, 18, 8)), med_balancering: false } as Scenarie;
const scen = { ...ref, id: "s2", navn: "Scenarie", reference_scenarie_id: "s1", oprettet: new Date(Date.UTC(2026, 10, 18, 9)) } as Scenarie;
let n = 0;
/** Kørslen, som arbejderen efterlader den: `tidsserier` er `fabric/fjv/koersel.py › tidsserie_brug`. */
function koersel(s: Scenarie, tidsserier?: unknown): Koersel {
    n++;
    return {
        id: `k${n}`, scenarie_id: s.id, vaerk_id: s.vaerk_id, vaerk_revision: 1, status: "faerdig", objektiv_dkk: 866_000 + n, best_bound: 866_000, solve_status: "optimal",
        oploesning: "1h", data_commit: DATA, model_commit: MODEL, oensket_rel_gap: 0.0002, oensket_abs_gap: 100,
        manifest_json: JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-06", oploesning: "1h" }, ...(tidsserier ? { tidsserier } : {}) }),
        bestilt: new Date(Date.UTC(2026, 10, 18, 10, n)), afsluttet: new Date(Date.UTC(2026, 10, 18, 11, n)), bestilt_af: "a@b.dk",
    } as Koersel;
}
const anvendtAf = (...enheder: string[]) => ({ anvendt: { solprofil: { id: "x2", sha256: ANDEBY_SOL, enheder } }, ubrugt: {} });

/** Samme par dømt alle tre steder: Analyser, scenariets side og oversigten. */
function dømt(r: Koersel, ri: InputRække[], k: Koersel, ki: InputRække[]) {
    const analyser = sammenlignelighedsDom(profil(r, "Andeby", ref, ri), profil(k, "Andeby", scen, ki));
    const side = modReference(r, k, { reference: ri, k: ki });
    const oversigt = findReference(scen, [ref, scen], [k, r], new Map([[r.id, ri], [k.id, ki]]));
    return { analyser, side, status: [analyser.status, side.dom?.status, oversigt?.art === "par" ? oversigt.dom : undefined] };
}

describe("punkt 3 · repo-profil og normaliseret serie er kun samme kilde på samme aktive enhed(er)", () => {
    it("efterprøvningens tilfælde: profilstien på elkedel_ny, serien lagt på solvarme → ikke JA, og grunden siges", () => {
        const vaerk = [...fælles(), sti("elkedel_ny"), ind("vaerk", "units.solvarme.type", "solar_thermal")];
        const d = dømt(koersel(ref), vaerk, koersel(scen, anvendtAf("solvarme")), [...vaerk, sol]);
        // Før rettelsen: "ja" alle tre steder — hashene er ens.
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
        expect(d.side.diff).toBeNull();                              // ingen ΔRef ved ukendt dom
        const a = d.analyser.afvigelser.find((x) => x.felt === "solprofil");
        expect(a?.alvor).toBe("ukendt");
        expect(a?.grund).toMatch(/samme aktive enhed/);
        expect(a?.grund).toContain("elkedel_ny");
        expect(a?.grund).toContain("solvarme");
    });
    it("samme enhed på begge sider (profilstien på solvarme, serien lagt på solvarme) → JA som før", () => {
        const vaerk = [...fælles(), sti("solvarme")];
        const d = dømt(koersel(ref), vaerk, koersel(scen, anvendtAf("solvarme")), [...vaerk, sol]);
        expect(d.status).toEqual(["ja", "ja", "ja"]);
    });
    it("manifestet siger ikke, hvilke enheder serien blev lagt på → kan ikke bevises → ukendt", () => {
        const vaerk = [...fælles(), sti("solvarme")];
        const uden = { anvendt: { solprofil: { id: "x2", sha256: ANDEBY_SOL } }, ubrugt: {} };
        expect(dømt(koersel(ref), vaerk, koersel(scen, uden), [...vaerk, sol]).status).toEqual(["ukendt", "ukendt", "ukendt"]);
        // En ældre kørsel uden registreringen: placeringen er lige så udokumenteret.
        expect(dømt(koersel(ref), vaerk, koersel(scen), [...vaerk, sol]).status).toEqual(["ukendt", "ukendt", "ukendt"]);
    });
    it("manifestets registrering skal gælde netop den frosne serie", () => {
        const vaerk = [...fælles(), sti("solvarme")];
        const anden = { anvendt: { solprofil: { id: "x9", sha256: "c".repeat(64), enheder: ["solvarme"] } }, ubrugt: {} };
        expect(dømt(koersel(ref), vaerk, koersel(scen, anden), [...vaerk, sol]).status).toEqual(["ukendt", "ukendt", "ukendt"]);
    });
    it("serien ligger på solvarme, men en ANDEN aktiv enhed læser stadig repo-filen: ikke samme enheder → ukendt", () => {
        // Referencen: kun solvarme læser filen. Kørslen: scenariet har desuden sat filen på elkedel_ny.
        const vaerk = [...fælles(), sti("solvarme")];
        const d = dømt(koersel(ref), vaerk, koersel(scen, anvendtAf("solvarme")), [...vaerk, sti("elkedel_ny", "aendring"), sol]);
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
    });
    it("enheden med profilstien er slået fra i referencen og til i kørslen: profilen bruges ikke af samme AKTIVE enheder → ukendt", () => {
        const vaerk = [...fælles(), sti("solvarme"), ind("vaerk", "units.solvarme.enabled", false)];
        const d = dømt(koersel(ref), vaerk, koersel(scen, anvendtAf("solvarme")), [...vaerk, ind("aendring", "units.solvarme.enabled", true), sol]);
        expect(d.status).toEqual(["ukendt", "ukendt", "ukendt"]);
    });
    it("to aktive enheder læser filen i referencen; serien dækker begge i kørslen (markører) → JA", () => {
        const vaerk = [...fælles(), sti("sol_a"), sti("sol_b")];
        const d = dømt(koersel(ref), vaerk, koersel(scen, anvendtAf("sol_b", "sol_a")), [...vaerk, sol]);
        expect(d.status).toEqual(["ja", "ja", "ja"]);
    });
    it("sammenligningskortet kalder det ikke 'samme fil', når placeringen ikke er bevist", () => {
        const vaerk = [...fælles(), sti("elkedel_ny")];
        const r = koersel(ref), k = koersel(scen, anvendtAf("solvarme"));
        const pa = profil(r, "Andeby", ref, vaerk), pb = profil(k, "Andeby", scen, [...vaerk, sol]);
        const { container } = render(<Sammenlignelighed a={{ k: r, profil: pa } as unknown as Pakke} b={{ k, profil: pb } as unknown as Pakke} />);
        const tekst = container.textContent ?? "";
        expect(tekst).not.toContain("Direkte sammenlignelige");
        expect(tekst).not.toMatch(/samme fil/);
        expect(tekst).toMatch(/samme aktive enhed/);
    });
});

describe("punkt 3 · den korte frosne profil bærer det, beviset kræver", () => {
    it("filteret henter enhedernes `enabled` ud over profilstien — ellers dømte oversigten anderledes end Analyser", () => {
        const f = JSON.stringify(kortProfilFilter(["k1"]));
        expect(f).toContain('{"sti":{"endsWith":".production_profile_path"}}');
        expect(f).toContain('{"sti":{"endsWith":".enabled"}}');
        expect(iKortProfil({ kilde: "vaerk", sti: "units.solvarme.enabled" })).toBe(true);
        expect(iKortProfil({ kilde: "vaerk", sti: "storage.tank.enabled" })).toBe(false);
        expect(iKortProfil({ kilde: "vaerk", sti: "units.solvarme.p_max" })).toBe(false);
    });
});
