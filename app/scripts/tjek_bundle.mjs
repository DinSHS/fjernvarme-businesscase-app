// Tjekker en færdig bundle for den valgte udgave (brief 21: én kerne, to adaptere).
// Brug: node scripts/tjek_bundle.mjs <rayfin|rest> [mappe]   (standard: dist / dist-rest)
// Exit 1 ved fund. Begge: ingen rå decorators (@entity( …) i JS. rest: intet Rayfin-SDK, ingen
// Fabric-/tenant-adresser, ingen @microsoft-pakker i THIRD_PARTY_NOTICES, og INTET af det, der er lokalt for installationen:
// temaernes id'er fra src/styles/temaer/privat/, tekstværdierne i config/installation.json og litteralerne i
// config/forbud.lokal.json (alle git-ignorerede — koden her bærer ingen organisations navne).
// rayfin: rest-adapteren er ikke med (aliaset har valgt rigtigt), og de lokale temaer ER med.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const [backend, mappeArg] = process.argv.slice(2);
if (!["rayfin", "rest"].includes(backend)) { console.error("Brug: node scripts/tjek_bundle.mjs <rayfin|rest> [mappe]"); process.exit(2); }
const mappe = mappeArg ?? (backend === "rest" ? "dist-rest" : "dist");
const assets = join(mappe, "assets");
if (!existsSync(assets)) { console.error(`Ingen bundle i ${assets} — byg først.`); process.exit(2); }

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const json = (sti) => { try { return JSON.parse(readFileSync(sti, "utf8")); } catch { return null; } };
function* blade(x) { if (typeof x === "string") yield x; else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) if (!k.startsWith("_")) yield* blade(v); }

// Lokale temaer: id'erne må ikke være i en rest-bundle, og SKAL være i en rayfin-bundle.
const TEMAMAPPE = "src/styles/temaer/privat";
const lokaleTemaer = existsSync(TEMAMAPPE)
    ? readdirSync(TEMAMAPPE).filter((f) => f.endsWith(".json")).map((f) => json(join(TEMAMAPPE, f))?.id).filter(Boolean)
    : [];
// Det lokale: installationens tekstværdier (ikke pladsholdere, ikke ens med eksemplet) og den lokale forbudslistes litteraler.
const eksempel = new Set(blade(json("../config/installation.eksempel.json") ?? {}));
const inst = [...blade(json(process.env.FJV_INSTALLATION ?? "../config/installation.json") ?? {})]
    .map((v) => v.trim()).filter((v) => v.length >= 6 && !v.startsWith("<") && !eksempel.has(v));
const lokalForbud = (json("../config/forbud.lokal.json")?.litteraler ?? []).map((l) => l.vaerdi).filter(Boolean);
const LOKALT = [...new Set([...inst, ...lokalForbud])].map((v) => new RegExp(esc(v), "i"));

const FÆLLES = [/@(entity|text|uuid|set|date)\(/];
const REST_FORBUDT = [/rayfin/i, /@microsoft\//, /fabricapps\.net/i, ...LOKALT, ...lokaleTemaer.map((id) => new RegExp(esc(id)))];
const RAYFIN_FORBUDT = [/\/api\/fn\//];

const forbudt = [...FÆLLES, ...(backend === "rest" ? REST_FORBUDT : RAYFIN_FORBUDT)];
const fund = [];
const filer = readdirSync(assets).filter((f) => f.endsWith(".js")).map((f) => join(assets, f));
if (backend === "rest" && existsSync(join(mappe, "THIRD_PARTY_NOTICES.txt"))) filer.push(join(mappe, "THIRD_PARTY_NOTICES.txt"));
if (existsSync(join(mappe, "index.html"))) filer.push(join(mappe, "index.html"));
for (const fil of filer) {
    const tekst = readFileSync(fil, "utf8");
    for (const m of forbudt) {
        const i = tekst.search(m);
        if (i >= 0) fund.push(`${fil}: ${m.source.length > 24 ? m.source.slice(0, 8) + "…" : m} … ${JSON.stringify(tekst.slice(Math.max(0, i - 20), i + 20))}`);
    }
}
if (backend === "rayfin" && !filer.some((f) => /rayfin/i.test(readFileSync(f, "utf8")))) fund.push("rayfin-bundlen indeholder ikke Rayfin-klienten — forkert alias?");
// Fabric-udgaven skal have de lokale temaer — findes privat/-mappen, skal hvert tema med.
if (backend === "rayfin") for (const id of lokaleTemaer) {
    if (!filer.some((f) => readFileSync(f, "utf8").includes(id))) fund.push(`rayfin-bundlen mangler det lokale tema "${id}" (src/backend/rayfin/temaer.ts)`);
}
console.log(`${backend}: ${filer.length} filer i ${mappe}, ${lokaleTemaer.length} lokale temaer, ${LOKALT.length} lokale værdier, ${fund.length} fund`);
for (const f of fund) console.log(`  ${f}`);
process.exit(fund.length ? 1 : 0);
