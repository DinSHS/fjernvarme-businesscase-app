// Helsidesskærmbilleder af konfigurationens ruter (harness, fixture-data):
//   npx vite build --config vite.skaerm.config.ts && node src/sider/konfiguration/_byg/skaermbilleder.mjs <udmappe> [rute …]
// Ruter UDEN "#/" (Git Bash omskriver et argument der starter med "/"). Bredder 1440 og 500 px; mørkt tema
// for ruter i MOERK. Samme CDP-mønster som skaermbilleder/layout.mjs (fundamentet), men med hele sidens højde.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const her = fileURLToPath(new URL(".", import.meta.url));
// FJV_BYG=<mappe>: samme mappe som `FJV_BYG=<mappe> npx vite build --config vite.skaerm.config.ts` (så agenter ikke deler build).
const byg = process.env.FJV_BYG ? resolve(process.env.FJV_BYG) : resolve(her, "../../../../skaermbilleder/.byg");
if (!existsSync(join(byg, "index.html"))) { console.error("Byg først: npx vite build --config vite.skaerm.config.ts"); process.exit(2); }
const [udArg, ...ruteArg] = process.argv.slice(2);
if (!udArg) { console.error("Brug: node skaermbilleder.mjs <udmappe> [rute …]"); process.exit(2); }
const ud = resolve(udArg);
mkdirSync(ud, { recursive: true });
const CHROME = process.env.CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TYPER = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".csv": "text/csv" };

const RUTER = ruteArg.length ? ruteArg : [
    "konfiguration", "konfiguration/andeby", "konfiguration/andeby/enheder/halmkedel", "konfiguration/andeby/lagre",
    "konfiguration/andeby/priser", "konfiguration/andeby/el", "konfiguration/andeby/balancering", "konfiguration/andeby/varmelast",
    "konfiguration/andeby/tid", "konfiguration/andeby/meta", "konfiguration/andeby/log", "konfiguration/andeby/aendringer",
    "konfiguration/andeby/kilde", "konfiguration/andeby/ny-enhed", "konfiguration/billund_spora/el", "konfiguration/findes_ikke",
];
const MOERK = new Set(["konfiguration/billund_sporb/tidsserier/f80cbaf0-7960-44a7-9096-5d98a779a685", "konfiguration/andeby", "konfiguration/andeby/el", "konfiguration/andeby/varmelast"]);

const server = createServer((req, res) => {
    const sti = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const fil = join(byg, sti === "/" ? "index.html" : sti);
    if (!fil.startsWith(byg) || !existsSync(fil)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPER[extname(fil)] ?? "application/octet-stream" });
    res.end(readFileSync(fil));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const dport = 9100 + Math.floor(Math.random() * 300);
const profil = mkdtempSync(join(tmpdir(), "fjv-konfig-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    `--remote-debugging-port=${dport}`, `--user-data-dir=${profil}`, "about:blank"], { stdio: "ignore" });
const sov = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 100 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${dport}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sov(200); }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const venter = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && venter.has(m.id)) { venter.get(m.id)(m); venter.delete(m.id); } });
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; venter.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });

for (const rute of RUTER) {
    for (const b of [1440, 500]) {
        for (const tema of b === 1440 && MOERK.has(rute) ? ["lys", "moerk"] : ["lys"]) {
            const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
            const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
            await send("Emulation.setDeviceMetricsOverride", { width: b, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
            await send("Page.enable", {}, sessionId);
            await send("Page.navigate", { url: `http://127.0.0.1:${port}/${tema === "moerk" ? "?tema=moerk" : ""}#/${rute}` }, sessionId);
            await sov(2500);
            // Valgfri handling før billedet (fx klik på "Redigér"): FJV_FOER='<js>'; navnet får suffikset FJV_NAVN.
            if (process.env.FJV_FOER) { await send("Runtime.evaluate", { expression: process.env.FJV_FOER }, sessionId); await sov(Number(process.env.FJV_VENT ?? 800)); }
            const h = (await send("Runtime.evaluate", { expression: "document.documentElement.scrollHeight", returnByValue: true }, sessionId)).result.result.value;
            await send("Emulation.setDeviceMetricsOverride", { width: b, height: Math.min(h, 12000), deviceScaleFactor: 1, mobile: false }, sessionId);
            await sov(400);
            const { result } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
            const fil = join(ud, `${rute.replace(/\//g, "_")}${process.env.FJV_NAVN ?? ""}-${b}${tema === "moerk" ? "-moerk" : ""}.png`);
            writeFileSync(fil, Buffer.from(result.data, "base64"));
            console.log(`ok   ${fil} (${h} px)`);
            await send("Target.closeTarget", { targetId });
        }
    }
}
ws.close(); chrome.kill(); server.close();
try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome kan stadig holde filer */ }
