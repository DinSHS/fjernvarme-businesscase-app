// Kører en kommando med VITE_BACKEND sat (npm-scripts på Windows kan ikke `VAR=x cmd`).
// Brug: node scripts/med-backend.mjs <rayfin|rest> <kommando> [argumenter …]
import { spawnSync } from "node:child_process";

const [backend, kommando, ...argumenter] = process.argv.slice(2);
if (!["rayfin", "rest"].includes(backend) || !kommando) {
    console.error("Brug: node scripts/med-backend.mjs <rayfin|rest> <kommando> [argumenter ...]");
    process.exit(2);
}
const r = spawnSync("npx", [kommando, ...argumenter], { stdio: "inherit", shell: true, env: { ...process.env, VITE_BACKEND: backend } });
process.exit(r.status ?? 1);
