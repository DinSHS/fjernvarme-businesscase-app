// Codex K5 (rapporter/K5_codex.md), fund F2 (serie.ts-delen), F11 og F13 — skrevet FØR rettelserne og set fejle.
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// F11: fang kaldet til fundamentets DMI-hook (område, fra, til, kolonne) og svar med den kolonne, testen vælger.
const dmi = vi.hoisted(() => ({ kald: [] as unknown[][], svarKolonne: "temp_mean_past1h" as string | undefined }));
vi.mock("@/lib/data/hooks", async (original) => ({
    ...(await original<typeof import("@/lib/data/hooks")>()),
    useDmiTemperatur: (...args: unknown[]) => {
        dmi.kald.push(args);
        const [omr, fra, til] = args as string[];
        if (!omr || !fra || !til) return { data: undefined, fejl: undefined, indlæser: false, genindlæs: () => {} };
        const start = Date.parse(`${fra}T00:00:00Z`), slut = Date.parse(`${til}T23:00:00Z`);
        const tider: string[] = [], vaerdier: number[] = [];
        for (let t = start; t <= slut; t += 3_600_000) { tider.push(new Date(t).toISOString().slice(0, 19).replace("T", " ")); vaerdier.push(2); }
        return { data: { ok: true, data_commit: "test", kolonne: dmi.svarKolonne, tider, vaerdier }, fejl: undefined, indlæser: false, genindlæs: () => {} };
    },
}));

import { fraPunkter, MAKS_POSITIONER } from "./serie";
import { tilSerie } from "./tidsserie-kilde";
import { valider } from "./tidsserie-validering";
import { useSyntese } from "./useSyntese";
import { MAKS_VAERKSARK_BYTES, vaerksarkFejl } from "./tidsserie-logik";
import { MAKS_VAERKSARK_BYTES as SKRIV_MAKS_VAERKSARK } from "@/lib/data/skriv";

function døgn(start: string, timer = 24): string {
    const t0 = Date.parse(start);
    return Array.from({ length: timer }, (_, i) => `${new Date(t0 + i * 3_600_000).toISOString().slice(0, 16).replace("T", " ")},${10 + (i % 5)}`).join("\n");
}

describe("F2 — en lille fil må ikke kunne udvides til millioner af positioner i browseren", () => {
    const tekst = `time,mw\n${døgn("2026-01-05T00:00:00Z")}\n${døgn("2046-01-05T00:00:00Z")}\n`;
    const r = valider(tekst, "varmelast", { tidszone: "UTC", tidsstempel: "start", enhed: "MW" });
    it("forudsætning: 48 timer med 20 års hul er gyldig efter uploadreglerne (Codex' måling, kun advarsler)", () => {
        expect(r.status).toBe("gyldig");
        expect((r.validering.forventet_raekker as number)).toBeGreaterThan(MAKS_POSITIONER);
    });
    it("fraPunkter afviser i stedet for at allokere hele spændet — med en forklaring", () => {
        expect(() => fraPunkter(r.punkter)).toThrow(/huller/);
    });
    it("Codex' egen fil (2026 + år 9999, 69,9 mio. forventede timer) afvises på millisekunder uden allokering", () => {
        const ekstrem = valider(`time,mw\n${døgn("2026-01-05T00:00:00Z")}\n${døgn("9999-01-05T00:00:00Z")}\n`, "varmelast", { tidszone: "UTC", tidsstempel: "start", enhed: "MW" });
        expect(ekstrem.status).toBe("gyldig");
        const t0 = performance.now();
        expect(() => fraPunkter(ekstrem.punkter)).toThrow(/69\.\d{3}\.\d{3} timer/);
        expect(performance.now() - t0).toBeLessThan(50);
    });
    it("tilSerie (svaret fra hentTidsserie) afviser et svar over grænsen", () => {
        expect(() => tilSerie({ ok: true, start: "2026-01-01T00:00:00Z", oploesning: "1h", vaerdier: new Array(MAKS_POSITIONER + 1).fill(null) })).toThrow(/huller/);
    });
    it("en sammenhængende serie på data_krav's max_raekker passer altid (grænsen rammer kun hul-oppustede spænd)", () => {
        expect(MAKS_POSITIONER).toBeGreaterThanOrEqual(120_000);
        expect(fraPunkter([{ t: 0, v: 1 }, { t: (MAKS_POSITIONER - 1) * 3_600_000, v: 2 }])!.værdier).toHaveLength(MAKS_POSITIONER);
    });
});

describe("F11 — målt mod syntetisk bruger værkets egen DMI-temperaturkolonne", () => {
    beforeEach(() => { dmi.kald.length = 0; dmi.svarKolonne = "temp_dry"; });
    const serie = { startMs: Date.parse("2026-01-05T00:00:00Z"), opløsning: "1h" as const, værdier: new Array(48).fill(20) };
    const blade = (kolonne?: string) => new Map<string, string>([
        ["heat_load_params.gaf_mw_per_k", "1.0"], ["data.dmi_area", '"karup"'],
        ...(kolonne ? [["data.dmi_temp_shortname", JSON.stringify(kolonne)] as [string, string]] : []),
    ]);
    it("værkets data.dmi_temp_shortname sendes med til hentDmiTemperatur", () => {
        const { result } = renderHook(() => useSyntese(serie, blade("temp_dry"), true));
        expect(dmi.kald.find((a) => a[0])?.[3]).toBe("temp_dry");
        expect(result.current?.total).toHaveLength(48);
    });
    it("uden feltet bruges modellens standard temp_mean_past1h (src/config.py:678)", () => {
        dmi.svarKolonne = "temp_mean_past1h";
        renderHook(() => useSyntese(serie, blade(), true));
        expect(dmi.kald.find((a) => a[0])?.[3]).toBe("temp_mean_past1h");
    });
    it("et svar med en anden kolonne end værkets udgives ikke som modellens syntese", () => {
        dmi.svarKolonne = "temp_mean_past1h";
        const { result } = renderHook(() => useSyntese(serie, blade("temp_dry"), true));
        expect(result.current?.total).toBeNull();
        expect(result.current?.grund).toMatch(/temp_dry/);
    });
});

describe("F13 — værksark-siden bruger skrivevejens grænse", () => {
    it("sidens grænse er skrivehjælperens", () => {
        expect(MAKS_VAERKSARK_BYTES).toBe(SKRIV_MAKS_VAERKSARK);
    });
    it("et ark på 3 MB afvises på siden, før uploadknappen bliver aktiv", () => {
        expect(vaerksarkFejl({ name: "ark.xlsx", size: 3_000_000 })).toMatch(/for stort/);
        expect(vaerksarkFejl({ name: "ark.xlsx", size: 21_239 })).toBeNull();
        expect(vaerksarkFejl({ name: "ark.csv", size: 100 })).toMatch(/xlsx/);
    });
});
