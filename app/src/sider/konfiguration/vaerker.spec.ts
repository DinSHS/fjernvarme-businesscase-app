// Gruppering og validering på ALLE 7 importerede værker (databasens øjebliksbillede).
// Værkerne kører i modellen (fv-fabric's F5), så klientvalideringen må ikke finde én eneste FEJL i dem.
import { describe, expect, it } from "vitest";
import { læsFixture } from "./fixture-vaerker";
import { enhed, grupper, lager, opslag } from "./gruppering";
import { validerVaerk } from "./validering";
import { laesTarif } from "./tarif";

const fx = læsFixture();

describe("de 7 importerede værker (og værker oprettet i appen, fx fra et værksark)", () => {
    it("7 er importeret fra modelrepoet, og hvert værk har blade", () => {
        expect(fx.vaerker.filter((v) => v.kilde === "repo")).toHaveLength(7);
        for (const v of fx.vaerker) expect(fx.blade.get(v.id)?.length ?? 0).toBeGreaterThan(100);
    });

    for (const v of fx.vaerker) {
        describe(v.kode, () => {
            const blade = fx.blade.get(v.id)!;
            const g = grupper(blade);

            it("alle blade lander i et genkendt afsnit (0 under Øvrige) og har en post i kataloget", () => {
                expect(g.oevrige).toBe(0);
                expect(g.ukendte.map((b) => b.sti)).toEqual([]);
                expect(g.afsnit.reduce((s, a) => s + a.antal, 0)).toBe(blade.length);
            });

            it("enheder og lagre bliver objekter med type, effekt og kapacitet", () => {
                const enheder = g.efterId("enheder").objekter.map(enhed);
                expect(enheder.length).toBeGreaterThan(0);
                for (const e of enheder) {
                    expect(e.type, e.navn).toBeTruthy();
                    expect(e.pMax, e.navn).not.toBeNull();
                }
                expect(g.efterId("enheder").blade).toEqual([]); // intet units-blad uden enhed
                for (const l of g.efterId("lagre").objekter.map(lager)) expect(l.kapacitet, l.navn).toBeGreaterThan(0);
            });

            it("klientvalideringen finder ingen fejl i et værk, modellen kører", () => {
                const fejl = validerVaerk(opslag(blade)).filter((f) => f.alvor === "fejl");
                expect(fejl).toEqual([]);
            });

            it("tarifskemaet er komplet, hvor værket har en tarifprofil", () => {
                const t = laesTarif(opslag(blade));
                expect(t.fejl).toEqual([]);
                for (const s of t.saesoner) for (const dag of ["weekday", "weekend"] as const) expect(s.timer[dag].every((b) => b !== null)).toBe(true);
            });
        });
    }
});
