// @vitest-environment node
//-----------------------------------------------------------------------
// Codex K4 — fv-app's fund: F1 (betroet oprettelse accepterede ikke-endelige
// tal og ubrugelige værker) og F9 (den reserverede kode `nyt`).
//-----------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { læsAnmodning, RESERVEREDE_KODER, samlNytVaerk, tjekModelkrav, type OpretVaerkDel } from "../src/logik";
import { RESERVEREDE_KODER as RESERVEREDE_DATA } from "../../data/fjv.constants";
import { RESERVEREDE_KODER as RESERVEREDE_GUIDE } from "../../../src/sider/konfiguration/nyt-vaerk";

type B = { sti: string; vaerdi_json: string };
const K4 = JSON.parse(readFileSync(new URL("./vektorer/k4_guide_vaerker.json", import.meta.url), "utf8")) as { vaerker: Record<string, B[]> };
const BASIS = K4.vaerker.default;
const U = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** BASIS med `sti` sat til `json` (eller fjernet, når json er null). */
function med(ændr: Record<string, string | null>, basis: readonly B[] = BASIS): B[] {
    const ud = basis.filter((b) => !(b.sti in ændr) || ændr[b.sti] !== null).map((b) => (b.sti in ændr ? { sti: b.sti, vaerdi_json: ændr[b.sti]! } : b));
    for (const [sti, json] of Object.entries(ændr)) if (json !== null && !basis.some((b) => b.sti === sti)) ud.push({ sti, vaerdi_json: json });
    return ud;
}
const samlet = (blade: B[]) => samlNytVaerk([{ handling: "opret_vaerk_del", udkast: U, nr: 1, af: 1, blade: blade.map((b) => ({ sti: b.sti, ny_json: b.vaerdi_json })) } as OpretVaerkDel], 1, U);

describe("K4-F1: modelkrav ved betroet oprettelse", () => {
    it.each(Object.keys(K4.vaerker))("guidens variant %s (load_case = true hos Codex) accepteres", (navn) => {
        expect(() => tjekModelkrav(K4.vaerker[navn])).not.toThrow();
    });

    it("Codex' modprøve 1: én række units.x = null afvises (modellen: KeyError 'time')", () => {
        expect(() => samlet([{ sti: "units.x", vaerdi_json: "null" }])).toThrow(/kan ikke bruges af modellen.*time\.start/);
    });
    it("Codex' modprøve 2: hele skabelonen med gaspris 1e400 afvises (ikke-endelig marginalomkostning)", () => {
        expect(JSON.parse("1e400")).toBe(Infinity); // derfor er JSON-gyldighed ikke nok
        expect(() => samlet(med({ "prices.natural_gas.value": "1e400" }))).toThrow(/prices\.natural_gas\.value er ikke et endeligt tal \(Infinity\)/);
    });
    it("et ikke-endeligt tal inde i en liste afvises også", () => {
        expect(() => tjekModelkrav(med({ "heat_load_params.baseline_profile_mw": "[1, -1e999, 2]" }))).toThrow(/baseline_profile_mw er ikke et endeligt tal \(-Infinity\)/);
    });

    it.each([
        ["manglende tidsperiode", { "time.start": null }, /time\.start mangler/],
        ["slut før start", { "time.start": '"2026-07-01"' }, /time\.end skal ligge efter/],
        ["tekst hvor der skal stå et tal", { "electricity.electricity_tax": '"4,0"' }, /electricity_tax mangler eller er ikke et tal/],
        ["negativ effekt", { "units.gaskedel.p_max_heat": "-5" }, /p_max_heat må ikke være under 0/],
        ["p_min over p_max", { "units.gaskedel.p_min_heat": "30" }, /p_min_heat er større end p_max_heat/],
        ["kedel uden virkningsgrad", { "units.gaskedel.eta_fuel_to_heat": null }, /eta_fuel_to_heat mangler/],
        ["brændsel uden pris", { "units.gaskedel.fuel": '"straw"' }, /prices\.straw\.value mangler/],
        ["alle enheder slået fra", { "units.gaskedel.enabled": "false" }, /mindst én aktiv enhed/],
        ["ingen lagerblok", { storage: null }, /storage mangler/],
        ["lager uden felter", { storage: null, "storage.tank.volume_m3": "4000" }, /storage\.tank\.delta_t_k mangler/],
        ["sæsoner, der ikke dækker året", { "electricity.tariff_consumption.net_tariff.seasons.sommer.months": "[4, 5, 6, 7, 8]" }, /mangler 9/],
        ["en måned i to sæsoner", { "electricity.tariff_consumption.net_tariff.seasons.sommer.months": "[3, 4, 5, 6, 7, 8, 9]" }, /dobbelt 3/],
        ["et timehul", { "electricity.tariff_consumption.net_tariff.seasons.sommer.weekday.06-24": null, "electricity.tariff_consumption.net_tariff.seasons.sommer.weekday.06-20": '"hoej"' }, /time 20, 21, 22, 23/],
        ["et bånd, der ikke findes", { "electricity.tariff_consumption.net_tariff.seasons.vinter.weekday.06-21": '"top"' }, /peger på et bånd, der ikke findes/],
        ["elafgift_net forskellig fra elafgiften", { "electricity.tariff_consumption.fixed_components.elafgift_net": "72.0" }, /elafgift_net skal være lig/],
    ])("afviser %s", (_n, ændr, tekst) => expect(() => tjekModelkrav(med(ændr as Record<string, string | null>))).toThrow(tekst));

    it("et værk uden tarifprofil (flad tarif) kræver ingen profil", () => {
        expect(() => tjekModelkrav(BASIS.filter((b) => !b.sti.startsWith("electricity.tariff_consumption.")))).not.toThrow();
    });
    it("samler alle fejl i én besked, så brugeren ser dem på én gang", () => {
        expect(() => tjekModelkrav(med({ "time.start": null, "data.dmi_area": null }))).toThrow(/data\.dmi_area mangler.*time\.start mangler/);
    });
    it("en almindelig værksændring til 1e400 afvises også", () => {
        expect(() => læsAnmodning(JSON.stringify([{ sti: "prices.natural_gas.value", handling: "ret", ny_json: "1e400" }]))).toThrow(/ikke et endeligt tal/);
    });
});

describe("K4-F9: reserverede værkskoder", () => {
    it.each([
        ["opret_vaerk", { handling: "opret_vaerk", udkast: U, dele: 1, ny_kode: "nyt", navn: "Nyt" }],
        ["kopier_vaerk", { handling: "kopier_vaerk", ny_kode: "nyt", navn: "Nyt" }],
    ])("backend afviser koden nyt ved %s", (_n, a) => {
        expect(() => læsAnmodning(JSON.stringify([a]))).toThrow(/reserveret af appen/);
    });
    it("én liste: Functions, datamodellen og guiden er enige", () => {
        expect(RESERVEREDE_KODER).toEqual(RESERVEREDE_DATA);
        expect([...RESERVEREDE_GUIDE].sort()).toEqual([...RESERVEREDE_DATA].sort());
        expect(RESERVEREDE_DATA).toContain("nyt");
    });
});
