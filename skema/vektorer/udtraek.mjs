// udtraek.mjs — vektorer UDTRUKKET af de håndskrevne TS-tests (brief 21 pkt. 4: "udtræk fra TS-testene").
//
//   cd app && node ../skema/vektorer/udtraek.mjs            skriv skema/vektorer/fra_ts_testene/<gruppe>.json
//   cd app && node ../skema/vektorer/udtraek.mjs --ud <dir>  skriv et andet sted (testen bruger det)
//
// generer.mts dækker funktionerne bredt med genererede input. Denne fil tager det, som TS-testene selv
// afprøver — Codex' modprøver, målte hashes, K4/K5-tilfældene — og gør dem til vektorer i SAMME format og
// SAMME grupper, så Python-porten skal give de samme udfald på dem. Fremgangsmåde: TS-testene køres med
// optag.setup.mts, der optager hvert kald til logik/tidsserie/zip/frysning (input + TS' faktiske udfald).
// Kald, der ikke svarer til en gruppe (fx sha256Hex), tælles og nævnes, så et hul i dækningen er synligt.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HER = fileURLToPath(new URL(".", import.meta.url));
const ROD = resolve(HER, "..", "..");
const APP = resolve(process.env.FJV_APP_DIR ?? join(ROD, "app"));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const KILDER = ["logik.ts", "frysning.ts", "sti.ts", "tidsserie.ts", "tidsserie-validering.ts", "datakrav.data.ts", "zip.ts", "vaerksark.ts"]
    .map((f) => `app/rayfin/functions/src/${f}`);
const SPECS = readdirSync(join(APP, "rayfin", "functions", "test")).filter((f) => f.endsWith(".spec.ts")).sort()
    .map((f) => `app/rayfin/functions/test/${f}`);

// Kendte filer, så store input skrives som {"$fil": …} i stedet for megabytes base64.
const FILER = new Map();
for (const mappe of ["app/rayfin/functions/test/vektorer"]) {
    for (const f of readdirSync(join(ROD, mappe))) FILER.set(sha(readFileSync(join(ROD, mappe, f))), `${mappe}/${f}`);
}

function bytesKode(b64) {
    const b = Buffer.from(b64, "base64");
    const kendt = FILER.get(sha(b));
    if (kendt) return { $fil: kendt };
    if (b.length > 0 && b.every((x) => x === 0x61)) return { $fyld: b.length };
    if (b.length > 0 && b.every((x) => x === 0)) return { $nul: b.length };
    return { $b64: b64 };
}
// optag.setup.mts koder bytes som {"$bytes": b64}; her bliver de til generer.mts' former.
function omkod(v) {
    if (Array.isArray(v)) return v.map(omkod);
    if (v && typeof v === "object") {
        if (Object.keys(v).length === 1 && "$bytes" in v) return bytesKode(v.$bytes);
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, omkod(x)]));
    }
    return v;
}
const taltilbage = (v) => (v && typeof v === "object" && "$tal" in v ? { Infinity: Infinity, "-Infinity": -Infinity, NaN: NaN, "-0": -0 }[v.$tal] : v);
const bits = (x) => { const b = Buffer.alloc(8); b.writeDoubleBE(x); return { $bits: b.toString("hex") }; };
const harTalmærke = (v) => JSON.stringify(v).includes('"$tal"');

const frossenSti = JSON.parse(readFileSync(join(HER, "frossen_tidsserie.json"), "utf8")).tilfaelde.find((t) => t.ud)?.ud.sti;

/** (modul.funktion) -> (args, udfald) => [gruppe, input, udfald] | null (null = kan ikke udtrykkes i gruppens form). */
const GRUPPER = {
    "logik.inputHash": (a, u) => ["input_hash", { raekker: a[0] }, u],
    "logik.bygFrossetInput": (a, u) => ["byg_frosset_input", { params: a[0], aendringer: a[1], scenarie: a[2], pins: a[3] ?? {}, tidsserier: a[4] ?? [] }, u],
    "logik.periodeDoegn": (a, u) => ["periode_doegn", { scenarie: a[0], vaerdier: a[1] }, u],
    "logik.effektivAkse": (a, u) => ["effektiv_akse", { scenarie: a[0], periode: a[1] }, u],
    "logik.læsAnmodning": (a, u) => ["laes_anmodning", { aendringer_json: a[0] }, u],
    "logik.planlægParametre": (a, u) => ["planlaeg_parametre", { nuvaerende: a[0], aendringer: a[1] }, u],
    "logik.samlNytVaerk": (a, u) => ["saml_nyt_vaerk", { dele: a[0], antal: a[1], udkast: a[2] }, u],
    // tjekModelkrav returnerer undefined; generer.mts registrerer det som null.
    "logik.tjekModelkrav": (a, u) => ["tjek_modelkrav", { blade: a[0] }, "ud" in u || !("afvisning" in u || "fejl" in u) ? { ud: null } : u],
    "logik.gyldigSti": (a, u) => ["gyldig_sti", { sti: a[0] }, u],
    "logik.ikkeEndelig": (a, u) => (harTalmærke(a[0]) ? null : ["ikke_endelig", { json: JSON.stringify(a[0]) }, u]),
    "logik.somFloat": (a, u) => {
        const x = taltilbage(a[0]);
        return typeof x === "number" ? ["tal", { x: bits(x) }, { ud: { streng: String(x), somFloat: u } }] : null;
    },
    "tidsserie.validerUpload": (a, u) => ["valider_upload", { bytes: a[0], rolle: a[1], valg: a[2], vaerk: a[3] ?? null },
        u.ud ? { ud: { status: u.ud.status, normaliseret_sha256: u.ud.normaliseret == null ? null : sha(Buffer.from(u.ud.normaliseret, "utf8")), validering: u.ud.validering } } : u],
    "tidsserie.valideringJson": (a, u) => ["validering_json", { v: a[0] }, u],
    "tidsserie.tætRække": (a, u) => ["taet_raekke", { normaliseret: a[0], vindue: a[1] ?? null }, u],
    "tidsserie.vaerkTrae": (a, u) => ["vaerk_trae", { params: a[0] }, u],
    "zip.tjekZip": (a, u) => ["tjek_zip", { bytes: a[0] }, u],
    "frysning.frossenTidsserie": (a, u) => (frossenSti ? ["frossen_tidsserie", { s: a[0] }, u.ud !== undefined ? { ud: { sti: frossenSti, vaerdi: u.ud } } : u] : null),
};

export function udtraek({ ud = join(HER, "fra_ts_testene") } = {}) {
    const tmp = mkdtempSync(join(tmpdir(), "fjv-optag-"));
    const optag = join(tmp, "optag.jsonl");
    writeFileSync(optag, "");
    try {
        const vitest = join(APP, "node_modules", "vitest", "vitest.mjs");
        const r = spawnSync(process.execPath, [vitest, "run", "--config", join(HER, "udtraek.vitest.mjs")], {
            cwd: APP, env: { ...process.env, FJV_OPTAG: optag }, encoding: "utf8",
        });
        if (r.status !== 0) throw new Error(`TS-testene fejlede under optagelsen (exit ${r.status}):\n${(r.stdout + r.stderr).slice(-3000)}`);
        const rækker = readFileSync(optag, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
        const grupper = {};
        const set = new Set();
        const uden = {};
        let asynkrone = 0;
        for (const x of rækker) {
            if (x.udfald.asynkron) { asynkrone++; continue; }
            const f = GRUPPER[`${x.modul}.${x.funktion}`];
            const m = f ? f(omkod(x.args), omkod(x.udfald)) : null;
            if (!m) { uden[`${x.modul}.${x.funktion}`] = (uden[`${x.modul}.${x.funktion}`] ?? 0) + 1; continue; }
            const [gruppe, input, udfald] = m;
            const nøgle = gruppe + "\u0000" + JSON.stringify(input);
            if (set.has(nøgle)) continue;
            set.add(nøgle);
            (grupper[gruppe] ??= []).push({ navn: `${x.fil} › ${x.test}`, input, ...udfald });
        }
        const kilder = Object.fromEntries([...KILDER, ...SPECS].map((f) => [f, sha(readFileSync(join(ROD, f)))]));
        rmSync(ud, { recursive: true, force: true });
        mkdirSync(ud, { recursive: true });
        let n = 0;
        for (const [gruppe, liste] of Object.entries(grupper).sort()) {
            // vitest ordner testfilerne efter tidligere køretider, så optagelsesrækkefølgen er ikke stabil på tværs af
            // kørsler. Stabil orden: fil + testnavn, og inden for en test kaldenes egen rækkefølge (sorteringen er stabil).
            const tilfaelde = [...liste].sort((a, b) => (a.navn < b.navn ? -1 : a.navn > b.navn ? 1 : 0));
            const om = `Udtrukket af TS-testene (${gruppe}) med skema/vektorer/udtraek.mjs: input og TS' faktiske udfald for hvert kald, testene selv laver. Ret aldrig i hånden — udtræk igen.`;
            writeFileSync(join(ud, `${gruppe}.json`), JSON.stringify({ _om: om, kilder, tilfaelde }, null, 1) + "\n", "utf8");
            n += tilfaelde.length;
        }
        return { vektorer: n, grupper: Object.keys(grupper).length, kald: rækker.length, asynkrone, ikke_mappet: uden };
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const i = process.argv.indexOf("--ud");
    const r = udtraek(i > 0 ? { ud: resolve(process.argv[i + 1]) } : {});
    console.log(JSON.stringify(r));
}
