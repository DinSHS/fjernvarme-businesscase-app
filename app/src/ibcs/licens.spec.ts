// @vitest-environment node
// Codex K7 F1: den indkopierede IBCS-kode (MIT) skal have sin fulde licens med i den BYGGEDE frontends notices, og
// bundletjekket skal fejle, hvis ophavsangivelsen mangler. Fejlede mod design/ibcs eedbd2c; består efter rettelsen.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { VENDOREDE_LICENSER, vendoredeNotices } from "./notices";

const APP = resolve(import.meta.dirname, "../..");
const LICENS = readFileSync(resolve(APP, "src/ibcs/LICENSE"), "utf8");
const mapper: string[] = [];
afterAll(() => { for (const m of mapper) rmSync(m, { recursive: true, force: true }); });

/** En minimal færdig rest-bundle med de givne notices. */
function bundle(notices: string): string {
    const m = mkdtempSync(join(tmpdir(), "fjv-licens-"));
    mapper.push(m);
    mkdirSync(join(m, "assets"));
    writeFileSync(join(m, "assets", "index.js"), "console.log(1);\n");
    writeFileSync(join(m, "index.html"), "<!doctype html><script src=\"assets/index.js\"></script>\n");
    writeFileSync(join(m, "THIRD_PARTY_NOTICES.txt"), notices);
    return m;
}
const tjek = (mappe: string) => spawnSync(process.execPath, ["scripts/tjek_bundle.mjs", "rest", mappe], { cwd: APP, encoding: "utf8" });

describe("IBCS-licensen i frontendens notices", () => {
    it("vendoredeNotices gengiver hele LICENSE-filen ordret, med ophavsangivelsen", () => {
        expect(VENDOREDE_LICENSER.map((v) => v.licensfil)).toContain("src/ibcs/LICENSE");
        const tekst = vendoredeNotices((sti) => readFileSync(resolve(APP, sti), "utf8"));
        expect(tekst).toContain(LICENS.trim());
        expect(tekst).toContain("Copyright (c) 2026 Sonni Simmelsgaard");
    });
    it("bundletjekket fejler, når notices mangler ophavsangivelsen", () => {
        const r = tjek(bundle("This file was auto-generated at build time.\n\nreact@19.0.0\nLicense: MIT\n"));
        expect(r.status).toBe(1);
        expect(r.stdout).toMatch(/src\/ibcs\/LICENSE/);
    });
    it("bundletjekket fejler, når licensen kun står delvist (ophavslinjen uden tilladelsesteksten)", () => {
        expect(tjek(bundle("Copyright (c) 2026 Sonni Simmelsgaard\n")).status).toBe(1);
    });
    it("bundletjekket består med den fulde licens i notices", () => {
        const r = tjek(bundle(`react@19.0.0\nLicense: MIT\n\n${vendoredeNotices((sti) => readFileSync(resolve(APP, sti), "utf8"))}`));
        expect(r.stdout).toMatch(/0 fund/);
        expect(r.status).toBe(0);
    });
});
