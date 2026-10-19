// Skærmbilleder af alle områder med fixture-data (ingen Fabric):
//   npx vite build --config vite.skaerm.config.ts && node skaermbilleder/tag.mjs [udmappe]
// Serverer skaermbilleder/.byg statisk og tager ét billede pr. rute og bredde med headless Chrome.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const her = fileURLToPath(new URL(".", import.meta.url));
// FJV_BYG=<mappe>: samme mappe som `FJV_BYG=<mappe> npx vite build --config vite.skaerm.config.ts`.
const byg = process.env.FJV_BYG ? resolve(process.env.FJV_BYG) : join(her, ".byg");
const ud = resolve(process.argv[2] ?? join(her, "billeder"));
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
// FJV_URL=<adresse>: mål en KØRENDE app i stedet for harness-bygget (fx community-serveren med dist-rest: rest-udgaven
// med rigtige data). Uden den serveres FJV_BYG/.byg lokalt som før.
const grund = process.env.FJV_URL ? process.env.FJV_URL.replace(/\/+$/, "") : `http://127.0.0.1:${port}`;

// `node skaermbilleder/tag.mjs <udmappe> @skaermbilleder/ruter.txt` tager alle ruter i filen (samme format som
// layout.mjs; filnavn = ruten med "/" -> "-"). Uden fil: den faste liste nedenfor (+ mørkt tema af ét værk).
const ruteFil = process.argv.slice(3).find((a) => a.startsWith("@"));
const RUTER = ruteFil
    ? readFileSync(ruteFil.slice(1), "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
        .map((r) => r.replace(/^#?\/?/, ""))
        // UUID'er forkortes til 8 tegn i filnavnet: to fulde UUID'er + en lang udmappe sprængte Windows' 260 tegn (målt).
        .map((r) => [r.replace(/([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "$1").replace(/[^\wÀ-ſ-]+/g, "-"), "#/" + r])
    : [
    ["konfiguration", "#/konfiguration"],
    ["konfiguration-andeby", "#/konfiguration/andeby"],
    ["analyser", "#/analyser"],
    ["scenarier", "#/scenarier"],
    ["scenarier-valgt", "#/scenarier/s2"],
    ["dokumentation", "#/dokumentation"],
    ["information", "#/information"],
];
// Headless Chrome klemmer --window-size til mindst 500 px bredde (målt: innerWidth=500 ved 390) — et
// 390-billede viser kun venstre del af et 500-layout. Smal bredde er derfor 500.
const BREDDER = [[1440, 1100], [500, 1600]];

for (const [navn, hash] of RUTER) {
    for (const [b, h] of BREDDER) {
        for (const tema of b === 1440 ? ["lys", "moerk"] : ["lys"]) {
            if (tema === "moerk" && navn !== "konfiguration-andeby") continue;
            const fil = join(ud, `${navn}-${b}${tema === "moerk" ? "-moerk" : ""}.png`);
            const url = `${grund}/${tema === "moerk" ? "?tema=moerk" : ""}${hash}`;
            // Asynkron: serveren kører i denne proces, så Chrome må ikke blokere event-loopet.
            await new Promise((ok) => {
                import("node:child_process").then(({ spawn }) => {
                    const p = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                        `--window-size=${b},${h}`, "--force-device-scale-factor=1", "--virtual-time-budget=4000",
                        `--screenshot=${fil}`, url], { stdio: "ignore" });
                    p.on("exit", ok);
                });
            });
            console.log(existsSync(fil) ? `ok   ${fil}` : `FEJL ${fil}`);
        }
    }
}
server.close();
