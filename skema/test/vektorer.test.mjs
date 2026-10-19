// TS-siden af de fælles vektorer: den NUVÆRENDE TypeScript-kode skal give præcis de vektorer, der ligger i
// skema/vektorer/ — dem Python-porten testes mod (community/fjernvarme_app/logik/tests/test_vektorer.py).
//
//   cd app && node --test "../skema/test/*.test.mjs"
//
// Ændrer nogen en regel, en grænse eller en afvisningstekst i app/rayfin/functions/src uden at generere
// vektorerne igen, fejler denne test i app'ens gate — ikke først i Python-udgaven. Rettelsen er:
//   cd app && npx tsx ../skema/vektorer/generer.mts            (generator + vektorer for de rene funktioner)
//   cd app && node ../skema/vektorer/udtraek.mjs               (tilfældene fra TS-testene, vektorer/fra_ts_testene/)
// og så at køre Python-testene, som derefter viser, hvad porten skal rettes til.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { APP } from "../vaerktoej/rayfin_analyse.mjs";
import { udtraek } from "../vektorer/udtraek.mjs";

const VEKTORER = fileURLToPath(new URL("../vektorer/", import.meta.url));
const FRA_TS_TESTENE = join(VEKTORER, "fra_ts_testene");

function sammenlign(gemt, ny, hvor) {
    const forskelle = [];
    const navne = (d) => d.tilfaelde.map((t) => t.navn);
    if (gemt.tilfaelde.length !== ny.tilfaelde.length) {
        forskelle.push(`${hvor}: ${gemt.tilfaelde.length} gemte tilfælde, ${ny.tilfaelde.length} fra den nuværende TS`);
    }
    const n = Math.min(gemt.tilfaelde.length, ny.tilfaelde.length);
    for (let i = 0; i < n && forskelle.length < 10; i++) {
        const a = JSON.stringify(gemt.tilfaelde[i]);
        const b = JSON.stringify(ny.tilfaelde[i]);
        if (a !== b) forskelle.push(`${hvor} #${i} "${navne(gemt)[i]}":\n  gemt ${a.slice(0, 300)}\n  nu   ${b.slice(0, 300)}`);
    }
    return forskelle;
}

test("de genererede vektorer er det, den nuværende TS-kode giver", () => {
    const ud = mkdtempSync(join(tmpdir(), "fjv-vektorer-"));
    try {
        const r = spawnSync(process.execPath, ["--import", "tsx", join(VEKTORER, "generer.mts")], {
            cwd: APP, env: { ...process.env, FJV_VEKTOR_UD: ud }, encoding: "utf8",
        });
        assert.equal(r.status, 0, `generer.mts fejlede:\n${r.stderr}`);
        const nye = readdirSync(ud).filter((f) => f.endsWith(".json")).sort();
        const gemte = readdirSync(VEKTORER).filter((f) => f.endsWith(".json")).sort();
        assert.deepEqual(nye, gemte, "vektorfilerne er ikke de samme grupper");
        const forskelle = [];
        for (const f of nye) {
            const gemt = JSON.parse(readFileSync(join(VEKTORER, f), "utf8"));
            const ny = JSON.parse(readFileSync(join(ud, f), "utf8"));
            forskelle.push(...sammenlign(gemt, ny, f));
            // kilder (sha256 af TS-filerne) må gerne afvige, når udfaldene er ens: så er ændringen uden betydning
            // for porten. Python-siden tjekker kilderne selv og beder om en ny generering.
        }
        assert.deepEqual(forskelle, [], forskelle.join("\n"));
    } finally {
        rmSync(ud, { recursive: true, force: true });
    }
});

test("tilfældene udtrukket af TS-testene er det, TS-testene og TS-koden giver nu", () => {
    // Fanger to ting: TS-koden ændrer udfald på et testtilfælde, eller TS-testene får nye/ændrede tilfælde,
    // som Python-porten endnu ikke er bundet af.
    const ud = mkdtempSync(join(tmpdir(), "fjv-udtraek-"));
    try {
        const r = udtraek({ ud });
        assert.equal(Object.keys(r.ikke_mappet).filter((f) => !["tidsserie.sha256Hex", "tidsserie.sha256Bytes", "frysning.frossenSti"].includes(f)).length, 0,
            `TS-testene kalder funktioner uden en vektorgruppe: ${JSON.stringify(r.ikke_mappet)} — tilføj dem i udtraek.mjs (GRUPPER)`);
        const nye = readdirSync(ud).sort();
        assert.deepEqual(nye, readdirSync(FRA_TS_TESTENE).sort(), "grupperne er ikke de samme");
        const forskelle = [];
        for (const f of nye) {
            forskelle.push(...sammenlign(JSON.parse(readFileSync(join(FRA_TS_TESTENE, f), "utf8")), JSON.parse(readFileSync(join(ud, f), "utf8")), `fra_ts_testene/${f}`));
        }
        assert.deepEqual(forskelle, [], forskelle.join("\n"));
    } finally {
        rmSync(ud, { recursive: true, force: true });
    }
});
