//-----------------------------------------------------------------------
// Codex K4-F8 (udviklingsrapport): "Bestil helårskørsel" skal
// forudfylde helåret, ikke vintervinduet. Skrevet FØR rettelsen.
// Hele kæden testes: link -> rute -> periodevalg -> de felter, der bestilles.
//-----------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { parsRute } from "@/lib/rute";
import * as nytRute from "../nyt-rute";
import { tjekPeriode, type Blade } from "../logik";
import { VAERKER } from "./vaerker.testdata";

type Modul = {
    nytScenarieHref: (vaerkKode: string, knap?: string, periode?: string) => string;
    periodeFraRute: (seg: string | undefined) => { valg: unknown; ugyldig?: string };
    periodeFelter: (valg: unknown) => { start: string | null; slut: string | null };
};
const m = nytRute as unknown as Partial<Modul>;
const blade: Blade = new Map(Object.entries(VAERKER.andeby));

/** Det, siden ville bestille, når den åbnes på `href`. */
function bestiltPeriode(href: string) {
    const { omraade, sti } = parsRute(href);
    expect(omraade).toBe("scenarier");
    expect(sti[0]).toBe("nyt");
    return m.periodeFelter!(m.periodeFraRute!(sti[3]).valg);
}

describe("K4-F8: link med periode forudfylder perioden", () => {
    it("modulet findes", () => {
        expect(typeof m.nytScenarieHref).toBe("function");
        expect(typeof m.periodeFraRute).toBe("function");
    });

    it("'Bestil helårskørsel' -> 1. juli 2025 – 30. juni 2026 (365 døgn), ikke vintervinduet", () => {
        const href = m.nytScenarieHref!("andeby", "tankens_vaerdi", "helaar");
        const p = bestiltPeriode(href);
        expect(p).toEqual({ start: "2025-07-01", slut: "2026-06-30" });
        expect(tjekPeriode(p.start, p.slut, blade, { medBalancering: false, idag: "2026-10-16" }).doegn).toBe(365);
        // Knappen og værket kommer også med.
        expect(parsRute(href).sti.slice(1, 3)).toEqual(["andeby", "tankens_vaerdi"]);
    });

    it("eksplicitte datoer i linket", () => {
        expect(bestiltPeriode(m.nytScenarieHref!("andeby", "tankens_vaerdi", "2026-02-01_2026-02-28"))).toEqual({ start: "2026-02-01", slut: "2026-02-28" });
    });

    it("værkets egen periode", () => {
        expect(bestiltPeriode(m.nytScenarieHref!("andeby", "tankens_vaerdi", "vaerk"))).toEqual({ start: null, slut: null });
    });

    it("et link uden periode beholder standarden (vintervinduet)", () => {
        expect(bestiltPeriode(m.nytScenarieHref!("andeby", "tankens_vaerdi"))).toEqual({ start: "2026-01-05", slut: "2026-01-16" });
    });

    it("en ukendt periode i linket afvises synligt og falder tilbage til standarden", () => {
        const r = m.periodeFraRute!("helår-2027");
        expect(r.ugyldig).toMatch(/helår-2027/);
        expect(m.periodeFelter!(r.valg)).toEqual({ start: "2026-01-05", slut: "2026-01-16" });
        expect(m.periodeFraRute!("2026-02-30_2026-03-01").ugyldig).toBeTruthy();
        expect(m.periodeFraRute!("2026-03-01_2026-02-01").ugyldig).toBeTruthy();
    });
});
