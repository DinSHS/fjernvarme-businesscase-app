// Skærmbilleder + målt layout af Dokumentation og Information (headless Chrome over CDP).
//
//   FJV_BYG=<mappe> npx vite build --config src/sider/dokumentation/_byg/skaerm.vite.mjs
//   node src/sider/dokumentation/_byg/skaerm.mjs --byg <mappe> --ud <mappe til billeder> [rute …]
//
// Ruter gives uden "#/" (`information/ordliste#afrr`, `dokumentation/readme`). Uden ruter: alle mine. Hver rute tages
// ved 1440 og 500 px (lyst), og de første "mørke" ruter også mørkt ved 1440. Billederne er HELE siden.
// Layoutreglerne er de samme som skaermbilleder/layout.mjs (R1–R5) plus to egne:
//   R6 intet indhold ud over sit kort (en tabel/kodeblok må rulle INDE i kortet, ikke løbe ud af det)
//   R7 hver sides budskab er ikke tomt, og hvert kort har en titel
// Exit 1 ved brud. 500 px er smalleste bredde headless Chrome vil (målt af fv-app).
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

function arg(navn, std) { const i = process.argv.indexOf(`--${navn}`); return i >= 0 ? process.argv[i + 1] : std; }
const byg = resolve(arg("byg", ""));
const ud = resolve(arg("ud", "."));
if (!existsSync(join(byg, "index.html"))) { console.error("Byg først (se filhovedet)."); process.exit(2); }
mkdirSync(ud, { recursive: true });

const ALLE = [
    "dokumentation", "dokumentation/om", "dokumentation/readme", "dokumentation/koersel", "dokumentation/arkitektur", "dokumentation/kor_i_notebook",
    "dokumentation/appens_metode", "dokumentation/kendte_begraensninger", "dokumentation/rapport_v4", "dokumentation/licens",
    "information", "information/hvad-er-modellen", "information/varmebalance-og-unit-commitment", "information/el-spot-tarif-afgift",
    "information/differensmetoden", "information/solvergab", "information/balancemarkedet", "information/spor-a-og-b",
    "information/budstrategi", "information/varmelast-og-nettab", "information/tanken", "information/data", "information/referencetal",
    "information/datadaekning", "information/fabric-og-kapacitet", "information/ordliste", "information/ordliste#afrr",
    "information/begraensninger",
];
const MOERKE = new Set(["information", "dokumentation/arkitektur", "information/referencetal", "information/ordliste#afrr"]);
const ruter = process.argv.slice(2).filter((a, i, v) => !a.startsWith("--") && !v[i - 1]?.startsWith("--")).map((r) => r.replace(/^#?\/?/, "").replace(/^.*\/Git\//, ""));
const RUTER = ruter.length ? ruter : ALLE;
const BREDDER = [1440, 500];

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TYPER = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = createServer((req, res) => {
    const sti = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const fil = join(byg, sti === "/" ? "index.html" : sti);
    if (!fil.startsWith(byg) || !existsSync(fil)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPER[extname(fil)] ?? "application/octet-stream" });
    res.end(readFileSync(fil));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const dport = 9500 + Math.floor(Math.random() * 400);
const profil = mkdtempSync(join(tmpdir(), "fjv-doku-"));
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

const TJEK = `(() => {
  const brud = [], detalje = [];
  const W = window.innerWidth;
  if (document.documentElement.scrollWidth > W + 1) brud.push("R1 vandret scroll: scrollWidth " + document.documentElement.scrollWidth + " > " + W);
  for (const g of document.querySelectorAll(".fjv-gitter")) {
    const kort = [...g.children].filter((c) => c.getBoundingClientRect().height > 0);
    const rækker = new Map();
    for (const k of kort) { const r = k.getBoundingClientRect(); const top = Math.round(r.top); (rækker.get(top) ?? rækker.set(top, []).get(top)).push(r); }
    const toppe = [...rækker.keys()].sort((a, b) => a - b);
    for (let i = 1; i < toppe.length; i++) if (toppe[i] - toppe[i - 1] <= 1) brud.push("R2 to kort med top " + toppe[i - 1] + " og " + toppe[i]);
    for (const [top, rs] of rækker) {
      const h = rs.map((r) => Math.round(r.height));
      detalje.push("række top=" + top + " højder=" + h.join("/"));
      if (Math.max(...h) - Math.min(...h) > 1) brud.push("R2 ulige højder i række top=" + top + ": " + h.join("/"));
    }
  }
  for (const k of document.querySelectorAll('[data-layout="kort"]')) {
    const r = k.getBoundingClientRect();
    if (r.right > W + 1) brud.push("R3 kort ud over kanten (" + Math.round(r.right) + " > " + W + "): " + (k.querySelector("h2")?.textContent ?? "").slice(0, 60));
    // R6: intet barn stikker ud over kortets højre kant (rulleområder klipper selv, men et barn uden overflow må ikke).
    const kr = r.right;
    for (const c of k.querySelectorAll("*")) {
      if (c.closest(".fjv-tabelrul, .fjv-md-pre, svg")) continue;
      const cr = c.getBoundingClientRect();
      if (cr.width > 0 && cr.right > kr + 1) { brud.push("R6 indhold ud over kortet: <" + c.tagName.toLowerCase() + "> " + (c.textContent ?? "").slice(0, 40)); break; }
    }
    if (!(k.querySelector('[data-layout="kort-titel"]')?.textContent ?? "").trim()) brud.push("R7 kort uden titel");
  }
  const main = document.querySelector("main");
  if (!main || !main.querySelector('[data-layout="kort"], .fjv-tilstand, [data-layout="side"]')) brud.push("R4 tom side");
  for (const k of document.querySelectorAll('[role="alert"] h2')) if (/Siden kunne ikke vises/.test(k.textContent)) brud.push("R5 fejlgrænse: " + (k.closest("[role=alert]").querySelector("pre")?.textContent ?? "").slice(0, 160));
  const bud = document.querySelector(".fjv-side-budskab");
  if (!bud || !bud.textContent.trim()) brud.push("R7 siden har intet budskab");
  if (document.querySelector("[aria-busy=true]")) brud.push("R8 stadig under indlæsning (skelet synligt)");
  return { brud, detalje, kort: document.querySelectorAll('[data-layout="kort"]').length, hoejde: document.documentElement.scrollHeight, budskab: bud?.textContent ?? "" };
})()`;

let fejl = 0;
const log = [];
for (const rute of RUTER) {
    const bred = [...BREDDER.map((b) => [b, "lys"]), ...(MOERKE.has(rute) ? [[1440, "moerk"]] : [])];
    for (const [b, tema] of bred) {
        const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
        const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
        await send("Emulation.setDeviceMetricsOverride", { width: b, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
        await send("Page.enable", {}, sessionId);
        await send("Page.navigate", { url: `http://127.0.0.1:${port}/${tema === "moerk" ? "?tema=moerk" : ""}#/${rute}` }, sessionId);
        await sov(2500);
        const r = await send("Runtime.evaluate", { expression: TJEK, returnByValue: true }, sessionId);
        const v = r.result?.result?.value ?? { brud: ["tjekket kunne ikke køre: " + JSON.stringify(r.result?.exceptionDetails ?? r).slice(0, 300)] };
        fejl += v.brud.length;
        const navn = rute.replace(/[/#]/g, "_") + `-${b}${tema === "moerk" ? "-moerk" : ""}.png`;
        if (v.hoejde) {
            await send("Emulation.setDeviceMetricsOverride", { width: b, height: v.hoejde, deviceScaleFactor: 1, mobile: false }, sessionId);
            await sov(300);
            const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
            if (s.result?.data) writeFileSync(join(ud, navn), Buffer.from(s.result.data, "base64"));
        }
        const linje = `${v.brud.length ? "BRUD" : "ok  "} ${String(b).padStart(4)}px ${tema === "moerk" ? "mørk" : "lys "} ${rute}  (${v.kort ?? 0} kort, ${v.hoejde ?? 0} px)`;
        console.log(linje); log.push(linje);
        for (const x of v.brud) { console.log(`       ${x}`); log.push(`       ${x}`); }
        if (process.env.FJV_DETALJE) for (const x of v.detalje ?? []) console.log(`       · ${x}`);
        if (process.env.FJV_BUDSKAB && b === 1440 && tema === "lys") console.log(`       “${v.budskab}”`);
        await send("Target.closeTarget", { targetId });
    }
}
ws.close(); chrome.kill(); server.close();
try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome kan stadig holde filer */ }
log.push(fejl ? `${fejl} brud` : "0 brud");
writeFileSync(join(ud, "_layout.txt"), log.join("\n") + "\n");
console.log(fejl ? `${fejl} brud` : "0 brud");
process.exit(fejl ? 1 : 0);
