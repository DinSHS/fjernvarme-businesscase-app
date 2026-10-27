// Fundamentets gate for BEGGE udgaver (brief 21/23: "gaten kører begge varianter").
// Brug: node scripts/gate.mjs [--hurtig]   (--hurtig: vitest kun én gang, mod rayfin)
// Trin: tsc (app + Functions) · eslint · vitest rayfin · vitest rest · build rayfin · build rest ·
// bundletjek af begge · trofasthed (runde 8: appens værdier og bestillingsvej mod modelrepoet ved den pinnede commit,
// viden/vaerktoej/tjek_trofasthed.py; Python med PyYAML, FJV_PYTHON vælger fortolkeren). Layout/skærmbilleder er
// separate (skaermbilleder/), fordi de tager minutter.
import { spawnSync } from "node:child_process";

const hurtig = process.argv.includes("--hurtig");
const trin = [
    ["tsc app", "npx", ["tsc", "-b", "--force"]],
    ["tsc functions", "npx", ["tsc", "-p", "rayfin/functions", "--noEmit"]],
    ["eslint", "npx", ["eslint", "."]],
    ["vitest rayfin", "npx", ["vitest", "run", "--maxWorkers=4"], { VITE_BACKEND: "rayfin" }],
    ...(hurtig ? [] : [["vitest rest", "npx", ["vitest", "run", "--maxWorkers=4"], { VITE_BACKEND: "rest" }]]),
    ["build rayfin", "npx", ["vite", "build"], { VITE_BACKEND: "rayfin" }],
    ["build rest", "npx", ["vite", "build", "--mode", "community"], { VITE_BACKEND: "rest" }],
    ["bundle rayfin", "node", ["scripts/tjek_bundle.mjs", "rayfin"]],
    ["bundle rest", "node", ["scripts/tjek_bundle.mjs", "rest"]],
    ["trofasthed", process.env.FJV_PYTHON ?? "python", ["../viden/vaerktoej/tjek_trofasthed.py"], { PYTHONUTF8: "1" }],
    // Codex K8: modprøverne (ændrede antagelser i en kopi af modelrepoet) skal gøre gaten rød — ellers er en grøn gate intet bevis.
    ["trofasthed modprøver", process.env.FJV_PYTHON ?? "python", ["../viden/vaerktoej/test_trofasthed.py"], { PYTHONUTF8: "1" }],
];

const resultat = [];
for (const [navn, cmd, args, env = {}] of trin) {
    const t0 = Date.now();
    const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], shell: true, encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 64 << 20 });
    const ud = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const ok = r.status === 0;
    const tests = ud.match(/Tests\s+(.+)/)?.[1]?.replace(/\x1b\[[0-9;]*m/g, "").trim();
    const note = tests ?? ud.match(/^TROFASTHED .+$/m)?.[0] ?? ud.match(/^Ran \d+ tests? in .+$/m)?.[0];
    resultat.push({ navn, ok, s: Math.round((Date.now() - t0) / 1000), note: note ?? "" });
    console.log(`${ok ? "OK  " : "FEJL"} ${navn} (${resultat.at(-1).s} s)${note ? ` — ${note}` : ""}`);
    if (!ok) console.log(ud.split("\n").slice(-40).join("\n"));
}
// Totalen skal være ens i de to varianter: en testfil, der tavst falder ud (målt 2026-10-17: rayfin talte 1273 af 1283
// under hukommelsespres, og kørslen var "grøn"), er ellers usynlig. Samme regel som Fabric-suiten: assert totalen.
const totaler = resultat.filter((r) => r.navn.startsWith("vitest")).map((r) => [r.navn, Number(r.note.match(/\((\d+)\)\s*$/)?.[1])]);
if (totaler.length === 2 && totaler[0][1] !== totaler[1][1]) {
    resultat.push({ navn: "ens testtotal", ok: false, s: 0, note: totaler.map(([n, t]) => `${n}=${t}`).join(" ") });
    console.log(`FEJL ens testtotal — ${totaler.map(([n, t]) => `${n}=${t}`).join(", ")}`);
} else if (totaler.length === 2) {
    console.log(`OK   ens testtotal — ${totaler[0][1]}`);
}
const fejl = resultat.filter((r) => !r.ok);
console.log(fejl.length ? `GATE FEJLER: ${fejl.map((r) => r.navn).join(", ")}` : "GATE OK (begge udgaver)");
process.exit(fejl.length ? 1 : 0);
