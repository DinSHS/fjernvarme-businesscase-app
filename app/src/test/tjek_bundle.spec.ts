// @vitest-environment node
// scripts/tjek_bundle.mjs genkender et lokalt tema på dets DATA (navn, beskrivelse, særlige farver) — ikke på id'et som
// delstreng. Et id som "billund" matchede ellers casenavne (billund_sporA.yaml) i en rest-bundle uden temaet (falsk
// positiv, fv-ibcs 2026-10-26). Testtemaet ligger i en midlertidig mappe (FJV_TEMAMAPPE), så testen ikke afhænger af
// installationens git-ignorerede privat/.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { vendoredeNotices } from "../ibcs/notices";

const APP = resolve(import.meta.dirname, "../..");
const NOTICES = vendoredeNotices((sti) => readFileSync(resolve(APP, sti), "utf8"));
const mapper: string[] = [];
afterAll(() => { for (const m of mapper) rmSync(m, { recursive: true, force: true }); });
const tmp = () => { const m = mkdtempSync(join(tmpdir(), "fjv-tjek-")); mapper.push(m); return m; };

const TEMA = {
    id: "andeby", navn: "Andeby Vand (prøvetema)", beskrivelse: "Andegul og dammegrøn til bundletjekkets prøve.",
    lys: { baggrund: "#f7f3e8", flade: "#fffdf6", tekst: "#1c2a1f", ac: "#2e4a33", delta_pos: "#1f7a4d", delta_neg: "#b3261e" },
    moerk: { baggrund: "#101611", flade: "#18211a", tekst: "#eef2ea" },
};
const temaMappe = (() => { const m = tmp(); writeFileSync(join(m, "andeby.json"), JSON.stringify(TEMA)); return m; })();

function bundle(js: string): string {
    const m = tmp();
    mkdirSync(join(m, "assets"));
    writeFileSync(join(m, "assets", "index.js"), js);
    writeFileSync(join(m, "index.html"), "<!doctype html>\n");
    writeFileSync(join(m, "THIRD_PARTY_NOTICES.txt"), NOTICES);
    return m;
}
const tjek = (backend: "rest" | "rayfin", mappe: string) =>
    spawnSync(process.execPath, ["scripts/tjek_bundle.mjs", backend, mappe], { cwd: APP, encoding: "utf8", env: { ...process.env, FJV_TEMAMAPPE: temaMappe } });

describe("tjek_bundle: lokale temaer genkendes på data, ikke på id", () => {
    it("rest: temaets id som delstreng af et casenavn er IKKE et fund (før: falsk positiv)", () => {
        const r = tjek("rest", bundle('const c={kode:"andeby_sporA",fil:"cases/andeby_idag.yaml"};console.log(c);\n'));
        expect(r.stdout).toMatch(/0 fund/);
        expect(r.status).toBe(0);
    });
    it("rest: temaets navn i bundlen er et fund", () => {
        const r = tjek("rest", bundle(`const t={navn:${JSON.stringify(TEMA.navn)}};\n`));
        expect(r.status).toBe(1);
        expect(r.stdout).toContain("andeby");
    });
    it("rest: temaets særlige farver i én fil er et fund, også uden navnet", () => {
        const r = tjek("rest", bundle(`const f=${JSON.stringify(Object.values(TEMA.lys))};\n`));
        expect(r.status).toBe(1);
    });
    it("rayfin: et tema, der kun optræder som id-delstreng, mangler (før: talte som til stede)", () => {
        const r = tjek("rayfin", bundle('import"rayfin";const c="andeby_sporA";\n'));
        expect(r.status).toBe(1);
        expect(r.stdout).toMatch(/mangler det lokale tema "andeby"/);
    });
    it("rayfin: temaets data i bundlen opfylder kravet", () => {
        const r = tjek("rayfin", bundle(`import"rayfin";const t=${JSON.stringify(TEMA)};\n`));
        expect(r.stdout).toMatch(/0 fund/);
        expect(r.status).toBe(0);
    });
});
