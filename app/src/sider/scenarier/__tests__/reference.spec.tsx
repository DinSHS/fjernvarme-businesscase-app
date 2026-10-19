// Kolonnen Reference i Scenarier-oversigten (fejl set i produktion 2026-10-19):
// - demo-scenarierne har intet reference_scenarie_id i databasen (0 af 14, målt) → alle Andeby vinter-rækker pegede på
//   den nyeste sammenlignelige kørsel ("… kender aktiveringerne"), også referencen selv;
// - færdige kørsler af ARKIVEREDE scenarier (22, målt) blev valgt og vist som "kan sammenlignes med ukendt scenarie".
// Forventet: parrets egen reference (demo_scenarier.json › par), og klartekst, når intet kan sammenlignes.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DEMO_KOERSLER, DEMO_PAR } from "../../analyser/sammensaetning.data";
import type { Koersel } from "../../../../rayfin/data/Koersel";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import { demoReferenceNavn, parretsReference } from "../logik";
import { findReference } from "../oversigt-logik";
import { ReferenceCelle } from "../Oversigt";

const ANDEBY = "v-andeby", BILLUND_B = "v-sporb", BILLUND_A = "v-spora";
const VINTER = JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-16" } });
const HELAAR = JSON.stringify({ periode: { start: "2025-07-01", slut: "2026-06-30" } });
const SPOR_B = JSON.stringify({ periode: { start: "2026-03-02", slut: "2026-06-30" } });

let n = 0;
function scenarie(navn: string, vaerk_id: string, ekstra: Partial<Scenarie> = {}): Scenarie {
    n++;
    return { id: `s${n}`, vaerk_id, navn, arkiveret: false, oprettet: new Date(Date.UTC(2026, 9, 16, 8, n)), oprettet_af: "a@example.org",
        med_balancering: false, ...ekstra } as Scenarie;
}
function koersel(s: Scenarie, manifest: string, minut: number, ekstra: Partial<Koersel> = {}): Koersel {
    return { id: `k-${s.id}-${minut}`, scenarie_id: s.id, vaerk_id: s.vaerk_id, status: "faerdig", manifest_json: manifest, oploesning: "1h",
        data_commit: "392992c", model_commit: "b49aeb0", oensket_rel_gap: 0.0002, oensket_abs_gap: 100,
        bestilt: new Date(Date.UTC(2026, 9, 16, 9, minut)), afsluttet: new Date(Date.UTC(2026, 9, 16, 10, minut)), ...ekstra } as Koersel;
}

// Databasen som målt: de 12 demo-scenarier UDEN reference_scenarie_id + F5-scenarierne + et arkiveret testscenarie.
const vaerkAf = (kode: string) => (kode === "andeby" ? ANDEBY : kode === "billund_sporb" ? BILLUND_B : BILLUND_A);
const demo = new Map(DEMO_KOERSLER.map((d) => [d.id, scenarie(d.navn, vaerkAf(d.vaerk_kode))]));
const f5Andeby = scenarie("F5 Andeby vinter med balancering", ANDEBY);
const f5SporA = scenarie("F5 Billund Spor A-anker med balancering", BILLUND_A);
const arkiveret = scenarie("Test K2 (kvote 1)", ANDEBY, { arkiveret: true });
const aktive = [...demo.values(), f5Andeby, f5SporA];

const manifestAf = (id: string) => (id === "D11" || id === "D12" ? HELAAR : id === "D09" || id === "D10" ? SPOR_B : VINTER);
const kørsler: Koersel[] = [
    ...[...demo].map(([id, s], i) => koersel(s, manifestAf(id), i)),
    // F5 Andeby: anden periode → intet sammenligneligt. F5 Spor A: eneste kørsel på sit værk.
    koersel(f5Andeby, JSON.stringify({ periode: { start: "2026-01-05", slut: "2026-01-06" } }), 30),
    koersel(f5SporA, JSON.stringify({ periode: { start: "2026-03-02", slut: "2026-06-23" } }), 31),
    // Det arkiverede testscenarie har den NYESTE direkte sammenlignelige kørsel på Andeby vinter.
    koersel(arkiveret, VINTER, 59),
// Som useKoersler leverer dem: nyeste bestilling først (`sortering: { bestilt: "desc" }`) — derfor ramte den gamle kode
// det arkiverede testscenarie først.
].sort((a, b) => new Date(b.bestilt).getTime() - new Date(a.bestilt).getTime());
const ref = (s: Scenarie) => findReference(s, aktive, kørsler);

describe("parrets egen reference (demo_scenarier.json)", () => {
    it("hvert demo-par får sin egen reference, ikke den nyeste kørsel", () => {
        for (const p of DEMO_PAR) {
            const s = demo.get(p.scenarie)!, r = demo.get(p.reference)!;
            expect(ref(s)).toEqual({ art: "par", navn: r.navn, direkte: true, afviger: [] });
        }
    });
    it("referencen selv peger ikke på en anden kørsel, men siger, hvem den er reference for", () => {
        expect(ref(demo.get("D01")!)).toEqual({ art: "er_reference", antal: 5 });
        expect(ref(demo.get("D10")!)).toEqual({ art: "er_reference", antal: 1 });
        expect(ref(demo.get("D11")!)).toEqual({ art: "er_reference", antal: 1 });
    });
    it("demo-navnet slås op (feltet mangler i databasen); feltet vinder, når det findes", () => {
        expect(demoReferenceNavn("Demo: Andeby vinter — uden tankene")).toBe("Demo: Andeby vinter — reference");
        expect(demoReferenceNavn("F5 Andeby vinter med balancering")).toBeUndefined();
        const s = { ...demo.get("D02")!, reference_scenarie_id: "valgt-af-brugeren" };
        expect(parretsReference(s, aktive)).toBe("valgt-af-brugeren");
    });
    it("en parret reference uden færdig kørsel siges i klartekst", () => {
        const uden = kørsler.filter((k) => k.scenarie_id !== demo.get("D01")!.id);
        expect(findReference(demo.get("D02")!, aktive, uden)).toEqual({ art: "par_ikke_koert", navn: "Demo: Andeby vinter — reference" });
    });
});

describe("aldrig 'ukendt scenarie'", () => {
    it("kørsler af arkiverede scenarier er ikke kandidater", () => {
        for (const s of aktive) {
            const r = ref(s);
            expect(JSON.stringify(r ?? {})).not.toContain("ukendt");
            if (r && "navn" in r) expect(r.navn).not.toBe("");
        }
    });
    it("F5-scenarierne uden sammenlignelig kørsel får 'ingen sammenlignelig kørsel'", () => {
        expect(ref(f5Andeby)).toEqual({ art: "ingen" });
        expect(ref(f5SporA)).toEqual({ art: "ingen" });
        render(<ReferenceCelle r={ref(f5Andeby)} />);
        expect(screen.getByText("ingen sammenlignelig kørsel")).toBeTruthy();
    });
    it("et ikke-parret scenarie med en aktiv sammenlignelig kørsel navngives", () => {
        const egen = scenarie("Mit eget vinterscenarie", ANDEBY);
        const ks = [...kørsler, koersel(egen, VINTER, 40)];
        const r = findReference(egen, [...aktive, egen], ks);
        expect(r?.art).toBe("sammenlignelig");
        expect(r && "navn" in r ? r.navn : "").toMatch(/^Demo: Andeby vinter/);
    });
    it("et scenarie, der ikke er kørt, siger det", () => {
        render(<ReferenceCelle r={undefined} />);
        expect(screen.getByText("ikke kørt endnu")).toBeTruthy();
    });
});
