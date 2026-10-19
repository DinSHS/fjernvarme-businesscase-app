// Efter-deploy-kontrol af den STATISKE app (Fabric-udgaven; privat — bruger portal-SSO).
//
// Den statiske vært er beskyttet (`assetAccess: protected`): kun cookien `__Host-rayfin_sh_sid`, som portalen
// udsteder gennem sit brokered-auth-handoff, giver adgang. Bearer-tokens (Power BI, Fabric, Rayfin-session) giver
// alle 401 (målt 2026-10-19). Derfor åbner scriptet portalen i headless Edge med en FRISK profil — på en
// Entra-tilknyttet maskine logger Edge ind med Windows-kontoens PRT uden kodeord — hægter sig på appens iframe
// og henter hver fil i `dist/` med `fetch` INDE i iframen (samme cookie som appen selv).
//
// Brug (fra app/):  node scripts/tjek_deployede_assets.mjs [--dist dist] [--ruter dokumentation,information/data …]
// Exit 1, hvis en fil ikke svarer 200, har forkert Content-Type, eller hvis størrelse/sha256 afviger fra dist/,
// eller hvis en rute viser fejlgrænsen ("Siden kunne ikke vises"). Udskriver én linje pr. fil + en opsummering.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";

const arg = (navn, std) => { const i = process.argv.indexOf(`--${navn}`); return i > 0 ? process.argv[i + 1] : std; };
const DIST = arg("dist", "dist");
const RUTER = (arg("ruter", "dokumentation,dokumentation/om,information,konfiguration,analyser,scenarier") ?? "").split(",").filter(Boolean);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const reg = JSON.parse(readFileSync("rayfin/.deployments.json", "utf8"));
const dep = reg.deployments[reg.active];
const PORTAL = dep.fabricDeepLink;
const VAERT = new URL(dep.hostingUrl).origin;

const TYPE = { ".html": "text/html", ".js": "javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
    ".png": "image/png", ".ico": "image/", ".txt": "text/plain", ".woff2": "font/woff2", ".woff": "font/woff", ".md": "text/" };

function filer(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? filer(join(dir, d.name)) : [join(dir, d.name)]);
}
const lokale = filer(DIST).map((f) => {
    const b = readFileSync(f);
    return { sti: relative(DIST, f).replaceAll("\\", "/"), bytes: b.length, sha: createHash("sha256").update(b).digest("hex") };
});

const sov = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9700 + Math.floor(Math.random() * 250);
const profil = mkdtempSync(join(tmpdir(), "fjv-assets-"));
const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profil}`, "--no-first-run", "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });
let wsUrl;
for (let i = 0; i < 75 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sov(200); } }
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r));
let n = 0;
const vent = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && vent.has(m.id)) { vent.get(m.id)(m); vent.delete(m.id); } });
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++n; vent.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

let slut = 1;
try {
    const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
    const side = (await send("Target.attachToTarget", { targetId, flatten: true })).result.sessionId;
    await send("Page.enable", {}, side);
    await send("Page.navigate", { url: PORTAL }, side);

    // Vent på appens iframe og på, at appen er tegnet (topbjælken findes) — dvs. at handoff + cookie er på plads.
    let ramme;
    for (let t = 0; t < 60 && !ramme; t++) {
        await sov(2000);
        const mål = (await send("Target.getTargets")).result.targetInfos.find((x) => x.type === "iframe" && x.url.startsWith(VAERT));
        if (!mål) continue;
        const s = (await send("Target.attachToTarget", { targetId: mål.targetId, flatten: true })).result.sessionId;
        const klar = await send("Runtime.evaluate", { expression: "!!document.querySelector('.fjv-top')", returnByValue: true }, s);
        if (klar.result?.result?.value) ramme = s;
    }
    if (!ramme) throw new Error(`appens iframe (${VAERT}) blev ikke klar inden for 120 s — portal-login eller handoff fejlede`);
    const ev = async (expression) => {
        const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, ramme);
        if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "evaluate fejlede");
        return r.result.result.value;
    };

    // 1) Hver fil i dist/ — hentet med appens cookie, uden cache.
    const fjern = await ev(`(async () => {
        const ud = [];
        for (const sti of ${JSON.stringify(lokale.map((l) => l.sti))}) {
            try {
                const r = await fetch("/" + sti, { cache: "no-store", credentials: "include" });
                const b = new Uint8Array(await r.arrayBuffer());
                const h = [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");
                const tekst = sti === "rayfin.config.json" ? new TextDecoder().decode(b) : undefined;
                ud.push({ sti, status: r.status, type: r.headers.get("content-type") ?? "", bytes: b.length, sha: h, cache: r.headers.get("cache-control") ?? "", tekst });
            } catch (e) { ud.push({ sti, status: 0, type: "", bytes: 0, sha: "", fejl: String(e) }); }
        }
        return ud;
    })()`);
    const fund = [];
    for (const l of lokale) {
        const f = fjern.find((x) => x.sti === l.sti);
        const forventetType = TYPE[extname(l.sti)] ?? "";
        const afvig = [];
        if (!f || f.status !== 200) afvig.push(`status ${f?.status ?? "?"}${f?.fejl ? ` (${f.fejl})` : ""}`);
        else if (l.sti === "rayfin.config.json") {
            // Værten skriver runtime-konfigurationen om (tilføjer `serviceMode`, anden nøglerækkefølge — målt
            // 2026-10-19). Sammenlign derfor på værdier: alle lokale nøgler skal have samme værdi på serveren.
            try {
                const lok = JSON.parse(readFileSync(join(DIST, l.sti), "utf8"));
                const srv = JSON.parse(f.tekst ?? "");
                for (const [k, v] of Object.entries(lok)) if (JSON.stringify(srv[k]) !== JSON.stringify(v)) afvig.push(`${k} afviger`);
            } catch (e) { afvig.push(`kan ikke læses (${e instanceof Error ? e.message : e})`); }
        } else {
            if (forventetType && !f.type.includes(forventetType)) afvig.push(`type "${f.type}"`);
            if (f.bytes !== l.bytes) afvig.push(`bytes ${f.bytes} ≠ ${l.bytes}`);
            if (f.sha !== l.sha) afvig.push(`sha ${f.sha.slice(0, 12)} ≠ ${l.sha.slice(0, 12)}`);
        }
        console.log(`${afvig.length ? "AFVIG" : "ok   "} ${String(f?.status ?? "-").padEnd(3)} ${(f?.type ?? "").split(";")[0].padEnd(24)} ${String(l.bytes).padStart(8)}  ${l.sti}${afvig.length ? "  <- " + afvig.join(", ") : ""}`);
        if (afvig.length) fund.push(l.sti);
    }

    // 2) Ruterne: navigér i appen og se efter fejlgrænsen (lazy-chunk + CSS-preload i den rigtige vært).
    const rutefund = [];
    for (const rute of RUTER) {
        await ev(`(location.hash = "#/${rute}", true)`);
        await sov(3500);
        const v = await ev(`(() => { const t = document.body.innerText; return { fejl: /Siden kunne ikke vises|Unable to preload|Failed to fetch dynamically/.test(t), tekst: (document.querySelector('[role=alert]')?.innerText ?? "").slice(0, 200) }; })()`);
        console.log(`${v.fejl ? "FEJL " : "ok   "} rute #/${rute}${v.fejl ? "  <- " + v.tekst.replace(/\s+/g, " ") : ""}`);
        if (v.fejl) rutefund.push(rute);
    }

    console.log(`\n${VAERT}: ${lokale.length} filer i ${DIST}, ${fund.length} afviger; ${RUTER.length} ruter, ${rutefund.length} med fejl`);
    slut = fund.length || rutefund.length ? 1 : 0;
} catch (e) {
    console.error(`KONTROL FEJLEDE: ${e instanceof Error ? e.message : e}`);
    slut = 2;
} finally {
    ws.close();
    edge.kill();
    try { rmSync(profil, { recursive: true, force: true }); } catch { /* Edge kan holde filer et øjeblik */ }
}
process.exit(slut);
