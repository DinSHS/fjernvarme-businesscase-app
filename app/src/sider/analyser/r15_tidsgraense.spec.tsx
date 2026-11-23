// Runde 15, forslaget i testrapportens afsnit 2a (den uafhængige test 18. november 2026): "Når et scenarie stopper
// på tidsgrænsen, og usikkerheden er en væsentlig del af ΔRef, så foreslå en ny kørsel med længere tidsgrænse (appen
// tillader op til 3.600 s)." Målt i testen på Billund Spor B: scenariet uden tank stoppede ved modellens 600 s med
// "højst 3.926 kr. for højt"; tankens værdi var ca. 2,18 mio. kr., så usikkerheden var 0,2 % af ΔRef — konklusionen
// holdt, og intet forslag er på sin plads. Appen foreslog aldrig noget, og på scenariets side stod en kørsel, der var
// stoppet på tidsgrænsen, blot som "Færdig" (mail 1: "tjek også en kørsel, der stoppede på tidsgrænsen").
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { ordnPar, vurder, type Side } from "./anbefaling";
import { AnbefalingKort } from "./anbefaling-kort";
import { profil, samlNoegletal, stoppetPaaTid, tidsgraenseForslag, TIDSGRAENSE_VAESENTLIG_ANDEL, type Koersel, type Noegletal } from "./beregn";
import { KoerselDetaljer } from "../scenarier/KoerselKort";

vi.mock("@/lib/data/skriv", () => ({ annullerKoersel: async () => ({ besked: "" }) }));
afterEach(cleanup);

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
let n = 0;
/** `gab` = objektiv − best bound (kr.); `tid` = solverens status. `gab: null` = ingen best bound og intet opnået gab. */
function koersel(id: string, objektiv: number, gab: number | null, tid: boolean, over: Partial<Koersel> = {}): Koersel {
    return {
        id, scenarie_id: `s-${id}`, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date(Date.UTC(2026, 10, 18, 8, n++)), bestilt_af: "a@example.org",
        model_commit: "90fb16eb1e2d5aa8e619b5a951b93760fa803985", data_commit: "106b9fce9a2e3610090b1a542559024056449b88",
        oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: tid ? "time_limit" : "optimal", objektiv_dkk: objektiv,
        best_bound: gab === null ? undefined : objektiv - gab, manifest_json: JSON.stringify({ periode: { start: "2026-03-02", slut: "2026-06-30" } }), ...over,
    } as Koersel;
}
const VAERK = [ind("vaerk", "meta.titel", "\"Testværk\""), ind("vaerk", "storage.tank.enabled", "true"), ind("vaerk", "units.kedel.type", "\"gas_boiler\""), ind("vaerk", "units.kedel.enabled", "true")];
function side(k: Koersel, uden: boolean, ekstra: InputRække[] = []): Side {
    const input = [...VAERK, ind("scenarie", "_koersel.start", "\"2026-03-02\""), ind("scenarie", "_koersel.slut", "\"2026-06-30\""), ind("scenarie", "_koersel.med_balancering", "false"),
        ...(uden ? [ind("aendring", "storage.tank.enabled", "false")] : []), ...ekstra];
    return { k, navn: k.id, vaerkNavn: "Testværk", input, profil: profil(k, "Testværk", null, input),
        samlet: samlNoegletal([{ id: `n${n++}`, koersel_id: k.id, gruppe: "objektiv", noegle: "objektiv_dkk", vaerdi: k.objektiv_dkk! } as Noegletal]) };
}

describe("2a: hvornår foreslås en længere tidsgrænse?", () => {
    it("stoppetPaaTid kender solverens status", () => {
        expect([stoppetPaaTid("time_limit"), stoppetPaaTid("Time limit reached"), stoppetPaaTid("optimal"), stoppetPaaTid(null)]).toEqual([true, true, false, false]);
    });
    it("testrapportens Billund Spor B: usikkerhed 3.926 kr. af ΔRef ca. 2,18 mio. kr. (0,2 %) → intet forslag", () => {
        const f = tidsgraenseForslag(koersel("ref", 4_428_863.74, 88, false), koersel("uden", 6_607_703, 3_926, true), { graenser: [600, 600], maks: 3600 });
        expect(f).toBeNull();
    });
    it("usikkerheden er 30 % af ΔRef: foreslå scenariet kørt igen, med den nuværende og den højeste tidsgrænse nævnt", () => {
        const f = tidsgraenseForslag(koersel("ref", 4_000_000, 0, false), koersel("uden", 4_100_000, 30_000, true), { graenser: [600, 600], maks: 3600 })!;
        expect(f.roller).toEqual(["scenariet"]);
        expect(f.andel).toBeCloseTo(0.3, 6);
        expect(f.tekst).toMatch(/^Kør scenariet igen med en længere tidsgrænse \(nu 600 s; appen tillader op til 3\.600 s\)/);
        expect(f.tekst).toMatch(/højst 30\.000 kr\./);
        expect(f.tekst).toMatch(/30 % af forskellen/);
    });
    it("grænsen er appens egen antagelse: 10 % af |ΔRef|", () => {
        expect(TIDSGRAENSE_VAESENTLIG_ANDEL).toBe(0.1);
        const ref = koersel("ref", 4_000_000, 0, false);
        expect(tidsgraenseForslag(ref, koersel("a", 4_100_000, 9_999, true), { graenser: [600, 600], maks: 3600 })).toBeNull();
        expect(tidsgraenseForslag(ref, koersel("b", 4_100_000, 10_000, true), { graenser: [600, 600], maks: 3600 })).not.toBeNull();
    });
    it("begge stoppede på tidsgrænsen: begge nævnes, og usikkerhederne lægges sammen", () => {
        const f = tidsgraenseForslag(koersel("ref", 4_000_000, 20_000, true), koersel("uden", 4_100_000, 30_000, true), { graenser: [600, 900], maks: 3600 })!;
        expect(f.roller).toEqual(["referencen", "scenariet"]);
        expect(f.usikkerhed_kr).toBe(50_000);
        expect(f.tekst).toMatch(/Kør referencen og scenariet igen/);
    });
    it("usikkerheden kendes ikke (ingen best bound): foreslå — forskellen kan ikke vurderes", () => {
        const f = tidsgraenseForslag(koersel("ref", 4_000_000, 0, false), koersel("uden", 4_100_000, null, true), { graenser: [600, 600], maks: 3600 })!;
        expect(f.usikkerhed_kr).toBeNull();
        expect(f.tekst).toMatch(/usikkerheden kendes ikke/);
    });
    it("tidsgrænsen er allerede appens højeste: sig det, i stedet for at foreslå noget, der ikke kan lade sig gøre", () => {
        const f = tidsgraenseForslag(koersel("ref", 4_000_000, 0, false), koersel("uden", 4_100_000, 30_000, true), { graenser: [600, 3600], maks: 3600 })!;
        expect(f.tekst).toMatch(/allerede er appens højeste \(3\.600 s\)/);
        expect(f.tekst).not.toMatch(/^Kør scenariet igen med en længere tidsgrænse/);
    });
    it("ingen af kørslerne stoppede på tid: intet forslag, uanset gab", () => {
        expect(tidsgraenseForslag(koersel("ref", 4_000_000, 40_000, false), koersel("uden", 4_100_000, 40_000, false), { graenser: [600, 600], maks: 3600 })).toBeNull();
    });
});

describe("2a: forslaget står i anbefalingen", () => {
    it("første næste skridt er den længere tidsgrænse, og kortet linker til scenariet", () => {
        const scen = koersel("uden", 4_100_000, 30_000, true);
        const v = vurder(ordnPar(side(koersel("ref", 4_000_000, 0, false), false), side(scen, true)));
        expect(v.tidsgraense?.roller).toEqual(["scenariet"]);
        expect(v.naesteSkridt[0]).toMatch(/^Kør scenariet igen med en længere tidsgrænse \(nu 600 s/);
        const { container } = render(<AnbefalingKort v={v} vaerkKode="t" kopiTekst="" />);
        const link = [...container.querySelectorAll("a")].find((a) => /tidsgrænse/i.test(a.textContent ?? ""));
        expect(link?.getAttribute("href")).toBe(`#/scenarier/${scen.scenarie_id}`);
    });
    it("scenariets egen tidsgrænse (solver.time_limit i det frosne input) er den, der nævnes", () => {
        const v = vurder(ordnPar(side(koersel("ref", 4_000_000, 0, false), false), side(koersel("uden", 4_100_000, 30_000, true), true, [ind("scenarie", "solver.time_limit", "1200")])));
        expect(v.naesteSkridt[0]).toMatch(/nu 1\.200 s/);
    });
    it("testrapportens tilfælde (0,2 %): intet forslag i anbefalingen", () => {
        const v = vurder(ordnPar(side(koersel("ref", 4_428_863.74, 88, false), false), side(koersel("uden", 6_607_703, 3_926, true), true)));
        expect(v.tidsgraense).toBeNull();
        expect(v.naesteSkridt.join(" ")).not.toMatch(/tidsgrænse/);
    });
});

describe("mail 1, tidsgrænsen: scenariets kørselskort viser ikke en tidsstoppet kørsel som blot 'Færdig'", () => {
    it("mærket 'Stoppet på tidsgrænsen' og usikkerheden står på kortet", () => {
        const { container } = render(<KoerselDetaljer k={koersel("uden", 6_607_703, 3_926, true)} reference={koersel("ref", 4_428_863.74, 88, false)} tidsgraense_s={600} />);
        const maerker = [...container.querySelectorAll(".fjv-maerke")].map((m) => [m.getAttribute("data-tone"), m.textContent]);
        expect(maerker).toContainEqual(["advarsel", "Stoppet på tidsgrænsen"]);
        expect(container.textContent).toMatch(/højst 3\.926 kr\. over det bedst mulige/);
        // 0,2 % af forskellen: intet forslag om at køre igen.
        expect(container.textContent).not.toMatch(/længere tidsgrænse/);
    });
    it("er usikkerheden en væsentlig del af forskellen, står forslaget på kortet", () => {
        const { container } = render(<KoerselDetaljer k={koersel("uden", 4_100_000, 30_000, true)} reference={koersel("ref", 4_000_000, 0, false)} tidsgraense_s={600} />);
        expect(container.textContent).toMatch(/Kør scenariet igen med en længere tidsgrænse \(nu 600 s; appen tillader op til 3\.600 s\)/);
    });
    it("kontrol: en optimal kørsel har intet tidsmærke", () => {
        const { container } = render(<KoerselDetaljer k={koersel("uden", 4_100_000, 0, false)} reference={koersel("ref", 4_000_000, 0, false)} tidsgraense_s={600} />);
        expect(container.textContent).not.toMatch(/tidsgrænsen/);
    });
});
