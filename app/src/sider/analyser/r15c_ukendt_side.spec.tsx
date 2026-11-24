// Tredje rettelsesrunde i runde 15, P3-2: "Den samlede sammenligningsside fortæller stadig om en differens ved ukendt
// dom."
//
// De syv kort i r15_ukendt_kort.spec.tsx skjuler Δ og virkningsfarver ved en ukendt dom. Tre steder på den SAMLEDE
// side gjorde det ikke — genskabt her med efterprøvningens tilfælde (omvendt linkrækkefølge, modelversionen kendes
// ikke for nogen af kørslerne):
//
//  * rollekortet *Reference og scenarie* sagde stadig "Differensmetoden: ΔRef = scenarie − reference", selv om siden
//    ikke viser et ΔRef;
//  * *Sammensætning måned for måned* udpegede den største forskydning ("halmkedels andel … går fra 60,0 % i referencen
//    til 90,0 % i scenariet") — og kunne lige så vel erklære andelene ens — uden at spørge dommen;
//  * *Varmeproduktion*, *Balancemarked* og *Lager* havde kolonnerne "Ref" og "Scen" uden kørslens egen periode.
//
// Afgørelsen (som foreslået): skjul Δ-formlen, lad sammensætningskortet beskrive de to niveauer uden at udpege en
// ændring, og giv niveaukolonnerne hver sin periode. Kortets farvevalg for NIVEAU bliver: det koder de enkelte
// værdier, ikke en virkning.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InputRække } from "@/lib/data/afflad";
import { maanedstabel, profil, samlNoegletal, sammenlignelighedsDom, type Koersel, type Maaned, type Noegletal as NT, type Scenarie } from "./beregn";
import type { Pakke } from "./data";
import Sammenlign, { BalanceDelta, LagerDelta, Produktion } from "./sammenlign";
import { SammensaetningMaaned } from "./sammensaetning-kort";

const ind = (kilde: InputRække["kilde"], sti: string, vaerdi_json: string): InputRække => ({ kilde, sti, vaerdi_json });
let n = 0;
const nt = (gruppe: string, noegle: string, vaerdi: number, objekt?: string, marked?: string): NT => ({ id: `e-${n++}`, koersel_id: "k", gruppe, noegle, vaerdi, objekt, marked } as NT);
const md = (maaned: string, noegle: string, vaerdi: number, objekt?: string): Maaned => ({ id: `m-${n++}`, koersel_id: "k", maaned, noegle, vaerdi, objekt } as Maaned);
const M = "939228aa048563c8498382a79d207c8b03fbda57", D = "106b9fce9a2e3610090b1a542559024056449b88";

interface Valg { navn: string; objektiv: number; halm: number; gas: number; balance?: number; model?: string | null; reference?: string }
/** En færdig Andeby-kørsel 5.–6. januar 2026 som sammenligningssidens pakke: to enheder, et lager, en måned. */
function pakke(id: string, v: Valg): Pakke {
    const input = [
        ind("vaerk", "storage.tank.enabled", "true"),
        ind("scenarie", "_koersel.start", "\"2026-01-05\""), ind("scenarie", "_koersel.slut", "\"2026-01-06\""),
        ind("scenarie", "_koersel.med_balancering", String(v.balance !== undefined)), ind("scenarie", "_koersel.data_commit", JSON.stringify(D)),
    ];
    const k = {
        id, scenarie_id: `s-${id}`, vaerk_id: "v", vaerk_revision: 1, status: "faerdig", bestilt: new Date(Date.UTC(2026, 10, 18, 8, n++)), bestilt_af: "a@b.dk",
        model_commit: v.model === undefined ? M : v.model, data_commit: D, oploesning: "1h", oensket_rel_gap: 0.0002, oensket_abs_gap: 100, solve_status: "optimal",
        objektiv_dkk: v.objektiv, best_bound: v.objektiv, manifest_json: JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-06", oploesning: "1h" } }),
    } as Koersel;
    return {
        k, vaerkNavn: "Andeby", vaerkKode: "andeby",
        scenarie: { id: k.scenarie_id, vaerk_id: "v", navn: v.navn, med_balancering: v.balance !== undefined, ...(v.reference ? { reference_scenarie_id: `s-${v.reference}` } : {}) } as Scenarie,
        samlet: samlNoegletal([
            nt("objektiv", "objektiv_dkk", v.objektiv), nt("miljoe", "co2_ton", 150), nt("el", "forbrug_mwh", 400), nt("el", "omkostning_dkk", 600_000), nt("el", "salg_dkk", 170_000),
            nt("enhed", "produktion_mwh", v.halm, "halmkedel"), nt("enhed", "andel_pct", (100 * v.halm) / (v.halm + v.gas), "halmkedel"), nt("enhed", "driftstimer", 48, "halmkedel"),
            nt("enhed", "produktion_mwh", v.gas, "gaskedel"), nt("enhed", "andel_pct", (100 * v.gas) / (v.halm + v.gas), "gaskedel"), nt("enhed", "driftstimer", 20, "gaskedel"),
            nt("lager", "afladet_mwh", 120, "tank"),
            ...(v.balance !== undefined ? [nt("balancering", "netto_dkk", v.balance), nt("balancering", "brutto_dkk", v.balance + 20_000),
                nt("balancering", "netto_dkk", v.balance, undefined, "afrr"), nt("balancering", "brutto_dkk", v.balance + 20_000, undefined, "afrr")] : []),
        ]),
        maaneder: maanedstabel([
            md("2026-01", "produktion_gwh", v.halm / 1000, "halmkedel"), md("periode", "produktion_gwh", v.halm / 1000, "halmkedel"),
            md("2026-01", "produktion_gwh", v.gas / 1000, "gaskedel"), md("periode", "produktion_gwh", v.gas / 1000, "gaskedel"),
            md("2026-01", "varmebehov_gwh", (v.halm + v.gas) / 1000), md("periode", "varmebehov_gwh", (v.halm + v.gas) / 1000),
        ]),
        input, profil: profil(k, "Andeby", null, input), objekter: { enheder: ["halmkedel", "gaskedel"], lagre: ["tank"] }, tidsserienavne: new Map(),
    };
}
/** Halmkedlens andel går fra 60 % til 90 % — det, kortet før udpegede. `model: null` = modelversionen kendes ikke. */
const PAKKER: Record<string, Pakke> = {
    ref: pakke("ref", { navn: "Reference", objektiv: 866_567.72, halm: 600, gas: 400, model: null }),
    scen: pakke("scen", { navn: "Scenarie", objektiv: 843_051.76, halm: 900, gas: 100, balance: 150_000, model: null, reference: "ref" }),
    ens: pakke("ens", { navn: "Samme andele", objektiv: 843_051.76, halm: 600, gas: 400, model: null }),
    refKendt: pakke("refKendt", { navn: "Reference", objektiv: 866_567.72, halm: 600, gas: 400 }),
    scenKendt: pakke("scenKendt", { navn: "Scenarie", objektiv: 843_051.76, halm: 900, gas: 100, reference: "refKendt" }),
};
const P = PAKKER;

const hentet = <T,>(data: T) => ({ data, fejl: undefined, indlæser: false, genindlæs: () => {} });
vi.mock("@/lib/data/hooks", () => ({ useVaerkParametre: () => hentet([]) }));
vi.mock("./dispatch-kort", () => ({ default: () => null }));
vi.mock("./data", async (original) => ({
    ...(await original<typeof import("./data")>()),
    usePakke: (id: string) => ({ ...hentet(PAKKER[id] ?? null), koersel: PAKKER[id]?.k ?? null }),
}));
afterEach(cleanup);

const kort = (c: HTMLElement, titel: string) => [...c.querySelectorAll("article.fjv-kort")].find((k) => k.querySelector(".fjv-kort-titel")?.textContent?.startsWith(titel));
const tekst = (c: HTMLElement, titel: string) => kort(c, titel)?.textContent ?? `(kortet "${titel}" findes ikke)`;
const hoveder = (c: HTMLElement) => [...c.querySelectorAll("th")].map((th) => th.textContent);
const PERIODE = "5. jan.–6. jan. 2026";

describe("P3-2: tilfældet", () => {
    it("modelversionen kendes ikke → ukendt; med modelversion er parret et resultat", () => {
        expect(sammenlignelighedsDom(P.ref.profil, P.scen.profil).status).toBe("ukendt");
        expect(sammenlignelighedsDom(P.refKendt.profil, P.scenKendt.profil).status).toBe("ja");
    });
});

describe("P3-2: rollekortet ved omvendt linkrækkefølge", () => {
    it("ukendt dom: kortet forklarer rollerne — uden Δ-formlen for et ΔRef, siden ikke viser", () => {
        const { container } = render(<Sammenlign a="scen" b="ref" gåTil={() => {}} />);
        const t = tekst(container, "Reference og scenarie");
        expect(t).toMatch(/«Scenarie» er oprettet som scenarie med «Reference» som reference/);
        expect(t).not.toMatch(/ΔRef/);                                   // før: "Differensmetoden: ΔRef = scenarie − reference."
        expect(t).not.toMatch(/Differensmetoden/);
        expect(t).toMatch(/Alle tal og tekster på siden læser de to kørsler i disse roller/);
    });
    it("kontrol: et direkte sammenligneligt par beholder formlen", () => {
        const { container } = render(<Sammenlign a="scenKendt" b="refKendt" gåTil={() => {}} />);
        expect(tekst(container, "Reference og scenarie")).toMatch(/Differensmetoden: ΔRef = scenarie − reference\./);
    });
});

describe("P3-2: Sammensætning måned for måned spørger dommen", () => {
    it("ukendt dom: budskabet beskriver de to niveauer — det udpeger ingen forskydning", () => {
        const { container } = render(<SammensaetningMaaned a={P.ref} b={P.scen} pladser={new Map()} />);
        const b = container.querySelector(".fjv-kort-budskab")?.textContent ?? container.textContent ?? "";
        expect(b).not.toMatch(/går fra/);                                // før: "halmkedels andel af periodens produktion går fra 60,0 % … til 90,0 % …"
        expect(b).not.toMatch(/i referencen til .* i scenariet/);
        expect(b).toMatch(/kan ikke afgøres/i);
        expect(b).toMatch(/side om side/);
        // Niveauerne står der stadig: begge paneler og begge rækkegrupper.
        expect(container.querySelectorAll("[data-scenarie]").length).toBe(2);
        expect(container.textContent).toMatch(/Reference/);
        expect(container.textContent).toMatch(/Scenarie/);
    });
    it("ukendt dom: kortet erklærer heller ikke andelene ens", () => {
        const { container } = render(<SammensaetningMaaned a={P.ref} b={P.ens} pladser={new Map()} />);
        expect(container.textContent).not.toMatch(/den samme i begge kørsler/);
        expect(container.textContent).toMatch(/kan ikke afgøres/i);
    });
    it("ukendt dom: de to paneler bærer hver sin kørsels periode", () => {
        const { container } = render(<SammensaetningMaaned a={P.ref} b={P.scen} pladser={new Map()} />);
        expect([...container.querySelectorAll(".fjv-a-panel-titel")].map((x) => x.textContent?.trim())).toEqual([`Ref · Reference · ${PERIODE}`, `Scen · Scenarie · ${PERIODE}`]);
    });
    it("kontrol: et direkte sammenligneligt par får forskydningen udpeget som før", () => {
        const { container } = render(<SammensaetningMaaned a={P.refKendt} b={P.scenKendt} pladser={new Map()} />);
        expect(container.textContent).toMatch(/halmkedels andel af periodens produktion går fra 60,0 % i referencen til 90,0 % i scenariet/);
    });
});

describe("P3-2: ved ukendt dom har niveaukolonnerne hver sin periode", () => {
    it("Varmeproduktion pr. enhed", () => {
        const { container } = render(<Produktion a={P.ref} b={P.scen} />);
        expect(hoveder(container).slice(0, 3)).toEqual(["Enhed", `Ref · ${PERIODE} (MWh)`, `Scen · ${PERIODE} (MWh)`]);       // før: "Ref (MWh)", "Scen (MWh)"
        expect(container.textContent).toMatch(/Andel og driftstimer hører til samme kørsel og periode/);
    });
    it("Balancemarked", () => {
        const { container } = render(<BalanceDelta a={P.ref} b={P.scen} />);
        expect(hoveder(container)).toEqual(["Marked", "Produkt", `Ref · ${PERIODE} (t.kr.)`, `Scen · ${PERIODE} (t.kr.)`]);
    });
    it("Lager", () => {
        const { container } = render(<LagerDelta a={P.ref} b={P.scen} />);
        expect(hoveder(container)).toEqual(["Lager", `Ref · ${PERIODE} (MWh)`, `Scen · ${PERIODE} (MWh)`]);
    });
    it("kontrol: et direkte sammenligneligt par har de korte kolonnehoveder og sit ΔRef", () => {
        const { container } = render(<LagerDelta a={P.refKendt} b={P.scenKendt} />);
        expect(hoveder(container)).toEqual(["Lager", "Ref (MWh)", "Scen (MWh)", "ΔRef"]);
    });
});
