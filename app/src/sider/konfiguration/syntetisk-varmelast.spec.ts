// Browserens syntetiske varmelast mod MODELLENS EGEN Python (synthesize_heat_load @ b49aeb0 på df-data).
// Vektorerne skrives af _byg/syntese_vektorer.py; de dækker et manglende første tal, kunstige huller midt i og
// i slutningen, en sommerperiode (GAF = 0) og ugen over sommertidsskiftet.
import { describe, expect, it } from "vitest";
import vektorer from "./syntese-vektorer.json";
import { syntesParametre, syntetiser, temperaturPåAkse, utcMs, type SyntesParametre } from "./syntetisk-varmelast";

interface Tilfælde {
    navn: string; start: string; antal: number; params: SyntesParametre; rå_huller: number;
    dmi: { tider: string[]; vaerdier: (number | null)[] };
    t_ambient: number[]; gaf: number[]; guf: number[]; nettab: number[]; total: number[];
}
const T = (vektorer as unknown as { tilfaelde: Tilfælde[] }).tilfaelde;

function størsteAfvigelse(a: readonly number[], b: readonly number[]): number {
    expect(a.length).toBe(b.length);
    return a.reduce((m, x, i) => Math.max(m, Math.abs(x - b[i])), 0);
}

describe("syntetisk varmelast = modellens", () => {
    it("vektorerne dækker de svære tilfælde", () => {
        expect(T.map((t) => t.navn)).toEqual(["billund_januar_karup", "andeby_juli_karup", "billund_sommertid_fyn", "billund_huller_karup"]);
        expect(T[0].rå_huller).toBeGreaterThan(0);
        expect(T[3].dmi.tider.length).toBeLessThan(T[3].antal); // rækker mangler helt
        expect(T[1].gaf.filter((g) => g === 0).length).toBeGreaterThan(24); // juli: klipningen ved 0 bruges
    });
    for (const t of T) {
        it(`${t.navn}: temperatur på aksen og alle fire led inden for 1e-9`, () => {
            const start = utcMs(t.start);
            const temp = temperaturPåAkse(start, t.antal, t.dmi.tider, t.dmi.vaerdier);
            expect(temp).not.toBeNull();
            expect(størsteAfvigelse(temp!, t.t_ambient)).toBeLessThan(1e-9);
            const s = syntetiser(start, temp!, t.params);
            expect(størsteAfvigelse(s.gaf, t.gaf)).toBeLessThan(1e-9);
            expect(størsteAfvigelse(s.guf, t.guf)).toBeLessThan(1e-9);
            expect(størsteAfvigelse(s.nettab, t.nettab)).toBeLessThan(1e-9);
            expect(størsteAfvigelse(s.total, t.total)).toBeLessThan(1e-9);
        });
    }
    it("uden et eneste tal er der ingen temperatur", () => {
        expect(temperaturPåAkse(utcMs("2026-01-01T00:00:00Z"), 3, ["2026-01-01 00:00:00"], [null])).toBeNull();
    });
});

describe("parametre fra værkets blade", () => {
    const blade = (o: Record<string, string>) => new Map(Object.entries(o).map(([k, v]) => [`heat_load_params.${k}`, v]));
    it("modellens standardværdier, når blade mangler", () => {
        const u = syntesParametre(blade({ gaf_mw_per_k: "0.5" }));
        expect(u).toEqual({ ok: true, p: { gaf_mw_per_k: 0.5, t_ref: 15, thermal_inertia_hours: 24, nettab_slope_mw_per_k: 0, t_net: 12, weekly_dip: 0.02, baseline_profile_mw: new Array(24).fill(6) } });
    });
    it("gaf_mw_per_k er påkrævet", () => {
        expect(syntesParametre(blade({ t_ref: "15.0" })).ok).toBe(false);
    });
    it("en profil med 23 tal afvises", () => {
        expect(syntesParametre(blade({ gaf_mw_per_k: "1", baseline_profile_mw: JSON.stringify(new Array(23).fill(1)) })).ok).toBe(false);
    });
    it("den fysiske nettab-model regnes ikke i appen — og siger det", () => {
        const u = syntesParametre(blade({ gaf_mw_per_k: "1", "nettab.aarligt_nettab_pct": "0.2" }));
        expect(u.ok).toBe(false);
        expect(!u.ok && u.grund).toMatch(/fysiske nettab-model/);
    });
    it("thermal_inertia_hours afkortes som Pythons int()", () => {
        const u = syntesParametre(blade({ gaf_mw_per_k: "1", thermal_inertia_hours: "23.9" }));
        expect(u.ok && u.p.thermal_inertia_hours).toBe(23);
    });
});
