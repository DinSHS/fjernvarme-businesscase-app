// Målbart layout-tjek (husets regel: "ingen svævende kasser" er en måling, ikke et øjemål):
//   npx vite build --config vite.skaerm.config.ts && node skaermbilleder/layout.mjs [rute …]   (rute fx konfiguration/andeby)
// Uden ruter: alle områdernes forsider + kendte under-ruter (RUTER nedenfor). Bredder: 1440 og 500 px
// (headless Chrome kan ikke være smallere end 500 — målt). Exit 1 ved brud. Regler:
//   R1 ingen vandret scroll på siden (document.scrollWidth <= innerWidth)
//   R2 kort i samme gitter-række har samme top og samme højde (±1 px)
//   R3 intet kort går ud over viewportens højre kant
//   R4 ingen tom side: mindst ét kort eller én tilstandstekst i <main>
//   R5 ingen ubehandlet fejl: intet fejlkort fra områdets fejlgrænse ("Siden kunne ikke vises")
// Negativ kontrol: FJV_INJICER='<js>' node skaermbilleder/layout.mjs konfiguration/andeby — skal give brud.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const her = fileURLToPath(new URL(".", import.meta.url));
// FJV_BYG=<mappe>: samme mappe som `FJV_BYG=<mappe> npx vite build --config vite.skaerm.config.ts`.
const byg = process.env.FJV_BYG ? resolve(process.env.FJV_BYG) : join(her, ".byg");
if (!existsSync(join(byg, "index.html"))) { console.error("Byg først: npx vite build --config vite.skaerm.config.ts"); process.exit(2); }
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TYPER = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

// Ruter gives UDEN "#/" (`konfiguration/andeby`): Git Bash omskriver et argument der starter med "/" til en
// Windows-sti ("#/x" blev til "#C:/Program Files/Git/x" — målt). "#/" og "/" foran fjernes og sættes på igen.
// `@fil` læser ruter fra en fil (én pr. linje, # = kommentar), fx `@skaermbilleder/ruter.txt`.
const rå = process.argv.slice(2).flatMap((a) => a.startsWith("@")
    ? readFileSync(a.slice(1), "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    : [a]);
const argRuter = rå.map((r) => "#/" + r.replace(/^#?\/?/, "").replace(/^.*\/Git\//, ""));
const RUTER = argRuter.length ? argRuter : [
    "#/dokumentation", "#/information", "#/konfiguration", "#/konfiguration/andeby", "#/analyser", "#/scenarier",
];
const BREDDER = [1440, 500];

const server = createServer((req, res) => {
    const sti = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const fil = join(byg, sti === "/" ? "index.html" : sti);
    if (!fil.startsWith(byg) || !existsSync(fil)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPER[extname(fil)] ?? "application/octet-stream" });
    res.end(readFileSync(fil));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
// FJV_URL=<adresse>: mål en KØRENDE app i stedet for harness-bygget (fx community-serveren med dist-rest: rest-udgaven
// med rigtige data). Uden den serveres FJV_BYG/.byg lokalt som før.
const grund = process.env.FJV_URL ? process.env.FJV_URL.replace(/\/+$/, "") : `http://127.0.0.1:${port}`;

const dport = 9500 + Math.floor(Math.random() * 400);
const profil = mkdtempSync(join(tmpdir(), "fjv-layout-"));
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
  const brud = [];
  const detalje = [];
  const W = window.innerWidth;
  if (document.documentElement.scrollWidth > W + 1) brud.push("R1 vandret scroll: scrollWidth " + document.documentElement.scrollWidth + " > " + W);
  for (const g of document.querySelectorAll(".fjv-gitter")) {
    const kort = [...g.children].filter((c) => c.getBoundingClientRect().height > 0);
    const rækker = new Map();
    for (const k of kort) { const r = k.getBoundingClientRect(); const top = Math.round(r.top); (rækker.get(top) ?? rækker.set(top, []).get(top)).push(r); }
    // Kort hvis top ligger inden for 1 px af hinanden er samme række; højder skal være ens.
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
  }
  const main = document.querySelector("main");
  if (!main || !main.querySelector('[data-layout="kort"], .fjv-tilstand, [data-layout="side"]')) brud.push("R4 tom side");
  for (const k of document.querySelectorAll('[role="alert"] h2')) if (/Siden kunne ikke vises/.test(k.textContent)) brud.push("R5 fejlgrænse: " + (k.closest("[role=alert]").querySelector("pre")?.textContent ?? "").slice(0, 160));
  return { brud, detalje, kort: document.querySelectorAll('[data-layout="kort"]').length, hoejde: document.documentElement.scrollHeight };
})()`;

let fejl = 0;
for (const rute of RUTER) {
    for (const b of BREDDER) {
        const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
        const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
        await send("Emulation.setDeviceMetricsOverride", { width: b, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
        await send("Page.enable", {}, sessionId);
        await send("Page.navigate", { url: `${grund}/${rute}` }, sessionId);
        // Vent til <main> har indhold (højst 10 s), ikke en fast tid: under fuld last (156 sider) nåede en side
        // ikke at blive tegnet på 2,5 s og gav et falsk R4 (målt 10:26). En reelt tom side fejler stadig efter 10 s.
        const KLAR = `!!document.querySelector('main [data-layout="kort"], main .fjv-tilstand, main [data-layout="side"]')`;
        for (let t0 = Date.now(); Date.now() - t0 < 10_000;) {
            if ((await send("Runtime.evaluate", { expression: KLAR, returnByValue: true }, sessionId)).result?.result?.value) break;
            await sov(250);
        }
        await sov(800); // indlæsning efter første kort (data, grafer) må falde på plads før målingen
        // Negativ kontrol: FJV_INJICER=<js> køres lige før tjekket (fx et bevidst brud, som tjekket SKAL finde).
        if (process.env.FJV_INJICER) await send("Runtime.evaluate", { expression: process.env.FJV_INJICER }, sessionId);
        const r = await send("Runtime.evaluate", { expression: TJEK, returnByValue: true }, sessionId);
        const v = r.result?.result?.value ?? { brud: ["tjekket kunne ikke køre: " + JSON.stringify(r.result?.exceptionDetails ?? r).slice(0, 200)] };
        fejl += v.brud.length;
        console.log(`${v.brud.length ? "BRUD" : "ok  "} ${b}px ${rute}  (${v.kort ?? 0} kort, ${v.hoejde ?? 0} px)`);
        for (const x of v.brud) console.log(`       ${x}`);
        if (process.env.FJV_DETALJE) for (const x of v.detalje ?? []) console.log(`       · ${x}`);
        await send("Target.closeTarget", { targetId });
    }
}
ws.close(); chrome.kill(); server.close();
try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome kan stadig holde filer */ }
console.log(fejl ? `${fejl} brud` : "0 brud");
process.exit(fejl ? 1 : 0);
