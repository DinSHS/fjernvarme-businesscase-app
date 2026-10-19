// Skærmbilleder pr. tema × modus (fv-design). Samme harness som tag.mjs, men temaet vælges i URL'en:
//   FJV_BYG=<mappe> node skaermbilleder/temaer.mjs <udmappe> @<rutefil> [tema:modus …] [--bredder=1440,500]
// Eksempel:  … temaer.mjs ud @ruter.txt nordisk:lys nordisk:moerk varme:lys
// Uden tema-argumenter: harnessens standard (lys) og ?tema=moerk (det gamle format, til "før"-billeder).
// Filnavn: <rute>-<bredde>-<tema>-<modus>.png. Parallelt (4 ad gangen) — Chrome er det langsomme led.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const her = fileURLToPath(new URL(".", import.meta.url));
const byg = process.env.FJV_BYG ? resolve(process.env.FJV_BYG) : join(her, ".byg");
const args = process.argv.slice(2);
const ud = resolve(args[0] ?? join(her, "billeder-temaer"));
mkdirSync(ud, { recursive: true });
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TYPER = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

const ruteFil = args.find((a) => a.startsWith("@"));
if (!ruteFil) { console.error("Mangler @rutefil"); process.exit(2); }
const RUTER = readFileSync(ruteFil.slice(1), "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((r) => r.replace(/^#?\/?/, ""))
    .map((r) => [r.replace(/([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "$1").replace(/[^\wÀ-ſ-]+/g, "-"), "#/" + r]);
const KOMBI = args.filter((a) => /^[\w-]+:(lys|moerk)$/.test(a)).map((a) => a.split(":"));
const bredArg = args.find((a) => a.startsWith("--bredder="));
const BREDDER = (bredArg ? bredArg.slice(10).split(",").map(Number) : [1440, 500]).map((b) => [b, b >= 900 ? 1100 : 1600]);

const server = createServer((req, res) => {
    const sti = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const fil = join(byg, sti === "/" ? "index.html" : sti);
    if (!fil.startsWith(byg) || !existsSync(fil)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPER[extname(fil)] ?? "application/octet-stream" });
    res.end(readFileSync(fil));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const opgaver = [];
for (const [navn, hash] of RUTER) {
    for (const [b, h] of BREDDER) {
        const kombi = KOMBI.length ? KOMBI : [["foer", "lys"], ["foer", "moerk"]];
        for (const [tema, modus] of kombi) {
            const fil = join(ud, `${navn}-${b}-${tema}-${modus}.png`);
            const q = tema === "foer" ? (modus === "moerk" ? "?tema=moerk" : "") : `?tema=${tema}&modus=${modus}`;
            opgaver.push({ fil, url: `http://127.0.0.1:${port}/${q}${hash}`, b, h });
        }
    }
}

// Chrome-profilen lægges i OS'ets temp-mappe og slettes efter hvert billede: den første version lagde én profil pr.
// billede i udmappen og ryddede aldrig op (fv-design2 målte hundredvis af mapper efter 280 billeder).
const profilRod = mkdtempSync(join(tmpdir(), "fjv-temaer-"));
const skyd = ({ fil, url, b, h }) => new Promise((ok) => {
    const profil = join(profilRod, Math.random().toString(36).slice(2));
    const p = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
        `--user-data-dir=${profil}`,
        `--window-size=${b},${h}`, "--force-device-scale-factor=1", "--virtual-time-budget=4000",
        `--screenshot=${fil}`, url], { stdio: "ignore" });
    p.on("exit", () => {
        console.log(existsSync(fil) ? `ok   ${fil}` : `FEJL ${fil}`);
        try { rmSync(profil, { recursive: true, force: true, maxRetries: 3 }); } catch { /* Chrome kan holde en fil et øjeblik */ }
        ok();
    });
});
let i = 0;
await Promise.all(Array.from({ length: 2 }, async () => { while (i < opgaver.length) await skyd(opgaver[i++]); }));
server.close();
try { rmSync(profilRod, { recursive: true, force: true, maxRetries: 3 }); } catch { /* best effort */ }
