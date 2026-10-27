// Skærmbilleder + layout-tjek af scenariesiderne via Chrome DevTools-protokollen (ingen pakker).
//   npx vite build --config vite.skaerm.config.ts --outDir <bygmappe> && node src/sider/scenarier/_byg/skaerm.mjs <bygmappe> <udmappe>
// Tjekker pr. rute og bredde: ingen vandret scroll, kort i samme gitterrække lige høje, ingen hvid side.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { laesFixtures, vaelger } from "../../../../skaermbilleder/fixturevalg.mjs";

const byg = resolve(process.argv[2]);
const ud = resolve(process.argv[3]);
mkdirSync(ud, { recursive: true });
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TYPER = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

const server = createServer((req, res) => {
    const sti = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const fil = join(byg, sti === "/" ? "index.html" : sti);
    if (!fil.startsWith(byg) || !existsSync(fil)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPER[extname(fil)] ?? "application/octet-stream" });
    res.end(readFileSync(fil));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

// Scenarierne findes i harnessens fixture ud fra indhold (Codex K9 F3), ikke på én installations række-id'er.
const v = vaelger(laesFixtures());
const side = (s) => `#/scenarier/${s.id}`;
const RUTER = [
    ["oversigt", "#/scenarier"],
    ["nyt", "#/scenarier/nyt"],
    ["nyt-andeby-tank", "#/scenarier/nyt/andeby/tankens_vaerdi"],
    ["nyt-billund-pris", "#/scenarier/nyt/billund_spora/braendselspris"],
    // K4-F8: "Bestil helårskørsel" fra Analyser — perioden skal være helåret.
    ["nyt-andeby-tank-helaar", "#/scenarier/nyt/andeby/tankens_vaerdi/helaar"],
    ["nyt-ukendt-periode", "#/scenarier/nyt/andeby/tankens_vaerdi/helår-2027"],
    ["scenarie-faerdig", side(v.scenarie("intet færdigt Andeby-scenarie med balancemarked", (s) => s.vaerk === "andeby" && s.med_balancering && !s.arkiveret && s.status.includes("faerdig")))],
    ["scenarie-fejl", side(v.scenarie("intet scenarie med balancemarked, hvis kørsel fejlede", (s) => s.med_balancering && s.status.includes("fejl")))],
    ["scenarie-spora", side(v.scenarie("intet færdigt scenarie på Billund Spor A", (s) => s.vaerk === "billund_spora" && !s.arkiveret && s.status.includes("faerdig")))],
    // Historie (A2) — kræver at demo-parrene har reference_scenarie_id (midlertidig harness, se rapporten).
    ["historie-tank", side(v.demo("D02"))],
    ["historie-gaspris", side(v.demo("D04"))],
    ["historie-sporb-balance", side(v.demo("D09"))],
    // Brief 18: varmelast-valget (kræver tidsserier i fixturen — scratch-kopi, se rapporten).
    ["varmelast-sporb-aktiv", side(v.demo("D10"))],
    ["varmelast-andeby-daekning", side(v.demo("D01"))],
    ["varmelast-nyt-maalt", "#/scenarier/nyt/billund_sporb/maalt_varmelast"],
];
const BREDDER = [1440, 500];

const dbgPort = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--remote-debugging-port=${dbgPort}`,
    `--user-data-dir=${join(tmpdir(), "fv-scenarie-chrome")}`, "about:blank"], { stdio: "ignore" });
let ws;
for (let i = 0; i < 50 && !ws; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
        const sider = await (await fetch(`http://127.0.0.1:${dbgPort}/json`)).json();
        const side = sider.find((s) => s.type === "page");
        if (side) ws = new WebSocket(side.webSocketDebuggerUrl);
    } catch { /* venter */ }
}
await new Promise((r) => ws.addEventListener("open", r));
let n = 0;
const ventende = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && ventende.has(m.id)) { ventende.get(m.id)(m); ventende.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((ok) => { const id = ++n; ventende.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const vent = (ms) => new Promise((r) => setTimeout(r, ms));

const MÅL = `(() => {
  const ud = { bredde: innerWidth, scrollWidth: document.documentElement.scrollWidth, rækker: [], hvid: !document.querySelector('[data-layout="side"]'), fejl: [] };
  for (const g of document.querySelectorAll('.fjv-gitter')) {
    const kort = [...g.children].map((k) => k.getBoundingClientRect());
    const pr = new Map();
    for (const r of kort) { const top = Math.round(r.top); pr.set(top, [...(pr.get(top) ?? []), Math.round(r.height)]); }
    for (const [top, h] of pr) if (h.length > 1) ud.rækker.push({ top, h, ens: Math.max(...h) - Math.min(...h) <= 1 });
  }
  for (const el of document.querySelectorAll('[data-layout="kort"]')) {
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1) ud.fejl.push('kort uden for skærmen: ' + el.querySelector('h2')?.textContent);
  }
  return JSON.stringify(ud);
})()`;

const rapport = [];
await cdp("Page.enable");
await cdp("Runtime.enable");
for (const [navn, hash] of RUTER) {
    for (const b of BREDDER) {
        for (const tema of b === 1440 && (navn === "oversigt" || navn === "nyt-andeby-tank" || navn === "scenarie-faerdig" || navn === "historie-tank" || navn === "varmelast-sporb-aktiv") ? ["lys", "moerk"] : ["lys"]) {
            await cdp("Emulation.setDeviceMetricsOverride", { width: b, height: 900, deviceScaleFactor: 1, mobile: false });
            await cdp("Page.navigate", { url: "about:blank" });
            await vent(100);
            await cdp("Page.navigate", { url: `http://127.0.0.1:${port}/${tema === "moerk" ? "?tema=moerk" : ""}${hash}` });
            await vent(3500);
            const m = JSON.parse((await cdp("Runtime.evaluate", { expression: MÅL, returnByValue: true })).result.result.value);
            const h = (await cdp("Runtime.evaluate", { expression: "document.documentElement.scrollHeight", returnByValue: true })).result.result.value;
            await cdp("Emulation.setDeviceMetricsOverride", { width: b, height: Math.min(h, 6000), deviceScaleFactor: 1, mobile: false });
            await vent(300);
            const bild = await cdp("Page.captureScreenshot", { format: "png" });
            const fil = join(ud, `${navn}-${b}${tema === "moerk" ? "-moerk" : ""}.png`);
            writeFileSync(fil, Buffer.from(bild.result.data, "base64"));
            const ok = m.scrollWidth <= m.bredde && m.rækker.every((r) => r.ens) && !m.hvid && m.fejl.length === 0;
            rapport.push({ navn, bredde: b, tema, ok, ...m });
            console.log(`${ok ? "ok  " : "BRUD"} ${navn} ${b} ${tema} scroll=${m.scrollWidth}/${m.bredde} rækker=${JSON.stringify(m.rækker.map((r) => r.h))} ${m.fejl.join("; ")}${m.hvid ? " HVID" : ""}`);
        }
    }
}
writeFileSync(join(ud, "layout.json"), JSON.stringify(rapport, null, 1));
ws.close();
chrome.kill();
server.close();
