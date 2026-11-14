// TS-siden af arkivets vektorer (runde 13): den NUVÆRENDE arkiv.ts skal give præcis skema/vektorer/arkiv/*.json —
// dem Python-porten testes mod (community/tests/test_arkiv.py). Ellers: cd app && npx tsx ../skema/vektorer/arkiv/generer_arkiv.mts
//
//   cd app && node --test "../skema/test/*.test.mjs"

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { APP } from "../vaerktoej/rayfin_analyse.mjs";

const MAPPE = fileURLToPath(new URL("../vektorer/arkiv/", import.meta.url));

test("arkivets vektorer er det, den nuværende arkiv.ts giver", () => {
    const ud = mkdtempSync(join(tmpdir(), "fjv-arkiv-"));
    try {
        const r = spawnSync(process.execPath, ["--import", "tsx", join(MAPPE, "generer_arkiv.mts")], {
            cwd: APP, env: { ...process.env, FJV_VEKTOR_UD: ud }, encoding: "utf8",
        });
        assert.equal(r.status, 0, `generer_arkiv.mts fejlede:\n${r.stderr}`);
        const nye = readdirSync(ud).filter((f) => f.endsWith(".json")).sort();
        assert.deepEqual(nye, readdirSync(MAPPE).filter((f) => f.endsWith(".json")).sort(), "grupperne er ikke de samme");
        const forskelle = [];
        for (const f of nye) {
            const a = JSON.parse(readFileSync(join(MAPPE, f), "utf8")).tilfaelde;
            const b = JSON.parse(readFileSync(join(ud, f), "utf8")).tilfaelde;
            if (a.length !== b.length) forskelle.push(`${f}: ${a.length} gemte, ${b.length} nu`);
            for (let i = 0; i < Math.min(a.length, b.length) && forskelle.length < 10; i++) {
                if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) forskelle.push(`${f} #${i} "${a[i].navn}"`);
            }
        }
        assert.deepEqual(forskelle, [], forskelle.join("\n"));
    } finally {
        rmSync(ud, { recursive: true, force: true });
    }
});
