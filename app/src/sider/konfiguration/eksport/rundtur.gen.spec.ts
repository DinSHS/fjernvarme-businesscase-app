// Generatoren til rundturs-beviset (runde 12, viden/vaerktoej/tjek_eksport_rundtur.py). Springes over, medmindre
// FJV_RUNDTUR peger på en mappe med `<kode>/input.json` (værkets blade + aktive tidsserier, lavet af Python-siden fra
// modelrepoet ved pinnen). For hvert værk skrives `<kode>/eksport.xlsx` (appens eksport, uændret), `<kode>/uden_app.xlsx`
// (samme ark uden markeringen — beviser, at scriptet ignorerer den) og `<kode>/plan.json` (forudsigelsen og listen).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { eksporter } from "./eksporter";
import type { Eksportkilde } from "./kort";
import { Arbejdsbog } from "./xlsx";

const MAPPE = process.env.FJV_RUNDTUR;
const SKABELON = resolve(import.meta.dirname, "vaerksdata_skabelon.xlsx");

describe.skipIf(!MAPPE)("eksport til rundturs-beviset", () => {
    it("skriver eksport, eksport uden markering og plan for hvert værk", async () => {
        const skabelon = new Uint8Array(readFileSync(SKABELON));
        const koder = readdirSync(MAPPE!).filter((k) => existsSync(join(MAPPE!, k, "input.json")));
        expect(koder.length).toBeGreaterThan(0);
        for (const kode of koder) {
            const k = JSON.parse(readFileSync(join(MAPPE!, kode, "input.json"), "utf8")) as Eksportkilde;
            const ud = join(MAPPE!, kode);
            try {
                const e = await eksporter(k, skabelon, new Date(Date.UTC(2026, 9, 28)));
                writeFileSync(join(ud, "eksport.xlsx"), e.bytes);
                // Uden markering: samme bytes, men arket _app fjernet fra arbejdsbogen.
                writeFileSync(join(ud, "uden_app.xlsx"), udenMarkering(e.bytes));
                writeFileSync(join(ud, "plan.json"), JSON.stringify({
                    filnavn: e.filnavn, markering: e.markering, forventet: Object.fromEntries(e.plan.forventet),
                    ikkeMed: e.plan.ikkeMed, afvigelser: e.plan.afvigelser, serier: e.plan.serier, udfyldes: e.plan.udfyldes, afrundes: e.plan.afrundes, noter: e.plan.noter,
                }, null, 1));
            } catch (x) {
                writeFileSync(join(ud, "plan.json"), JSON.stringify({ fejl: x instanceof Error ? x.message : String(x) }));
            }
        }
    }, 600_000);
});

function udenMarkering(bytes: Uint8Array): Uint8Array {
    const wb = new Arbejdsbog(bytes);
    return wb.udenArk("_app");
}
