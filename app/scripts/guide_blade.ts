// Bygger et nyt værk med GUIDENS egen kode (src/sider/konfiguration/nyt-vaerk.ts) — samme vej som "Opret værk"
// i #/konfiguration/nyt — og skriver bladene til en fil, som scripts/opret_live.mjs sender til den deployede backend.
//   npx tsx scripts/guide_blade.ts <udfil.json> <kode> [gwh] [ekstra enhedstype]
// Fejler (exit 1), hvis et af guidens trin har fejl: så ville knappen "Opret værk" heller ikke være aktiv.
import { writeFileSync } from "node:fs";
import { NYT_VAERK_SKABELON as s } from "../src/sider/konfiguration/nyt-vaerk.data";
import { TRIN, bygVaerk, startUdkast, tjekTrin } from "../src/sider/konfiguration/nyt-vaerk";

const [ud, kode, gwh = "80", ekstra = "heat_pump"] = process.argv.slice(2);
if (!ud || !kode) { console.error("Brug: npx tsx scripts/guide_blade.ts <udfil.json> <kode> [gwh] [enhedstype]"); process.exit(2); }
const u = startUdkast(s);
u.kode = kode;
u.navn = `Test: værk fra guiden (${kode})`;
u.varme = { kilde: "gwh", gwh };
if (ekstra) u.enheder.push({ type: ekstra, navn: "ekstra_" + ekstra, værdier: new Map() });
const ctx = { optagneKoder: new Set<string>() };
let fejl = 0;
for (const t of TRIN) {
    const f = tjekTrin(t.id, u, s, ctx as never);
    if (f.length) { fejl += f.length; console.log(`trin ${t.id}: ${f.join(" | ")}`); }
}
if (fejl) process.exit(1);
const v = bygVaerk(u, s);
if (v.fejl.length) { console.log(`bygVaerk: ${v.fejl.join(" | ")}`); process.exit(1); }
writeFileSync(ud, JSON.stringify({ kode, navn: u.navn, blade: v.blade }, null, 1), "utf8");
console.log(`${v.blade.length} blade (${v.blade.filter((b) => b.bekraeft).length} [BEKRÆFT]) -> ${ud}`);
