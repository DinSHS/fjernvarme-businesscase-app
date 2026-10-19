// Live-bevis for værkets tidsserier (KONTRAKT §6d) mod den DEPLOYEDE backend, som en almindelig bruger (Entra-token):
//   node scripts/tidsserie_live.mjs <tokenfil> <csv-fil> [værkskode]
// Samme vej som src/lib/data/skriv.ts: anmodning i eget navn med sha256 af base64-teksten -> uploadTidsserie.
// Prøver: (1) den ægte fil -> gyldig; (2) en defekt fil -> afvist med grunde; (3) indhold der ikke passer med
// anmodningens sha256 -> afvist; (4) hentTidsserie; (5) hentDmiTemperatur; (6) aktivér og deaktivér (tilstanden uændret).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { RayfinClient } from "@microsoft/rayfin-client";
import { signInWithEntraToken } from "@microsoft/rayfin-auth-provider-fabric";
import { GraphQLClient } from "@microsoft/rayfin-data";

const [, , tokenfil, csvfil, kode = "billund_sporb"] = process.argv;
const env = Object.fromEntries(readFileSync(new URL("../rayfin/.env", import.meta.url), "utf8").split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const c = new RayfinClient({ baseUrl: env.RAYFIN_PUBLIC_API_URL, publishableKey: env.RAYFIN_PUBLIC_PUBLISHABLE_KEY, authStorage: false });
const session = await signInWithEntraToken(c.auth, { entraToken: readFileSync(tokenfil, "utf8").trim() });
const mig = session.user.email;
const gql = new GraphQLClient(c.apiClient);
const fn = (navn, input) => c.functions[navn].invoke(input, { timeoutMs: 180_000 });
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const v = (await gql.query(`{ vaerks(first: 1, filter: { kode: { eq: "${kode}" } }) { items { id kode } } }`)).vaerks.items[0];

async function upload(navn, bytes, valg, snyd = false) {
    const base64 = Buffer.from(bytes).toString("base64");
    const a = await c.data.Aendringsanmodning.create({
        vaerk_id: v.id, forventet_revision: 0, anmodet_af: mig, anmodet: new Date(), status: "ny",
        aendringer_json: JSON.stringify([{ handling: "upload_tidsserie", rolle: "varmelast", navn, filnavn: navn, tidsstempel: "start", tidszone: "UTC", enhed: "MW", kolonne: null, ...valg, sha256: sha(base64) }]),
    });
    return fn("uploadTidsserie", { anmodningId: a.id, indholdBase64: snyd ? Buffer.from("timestamp,mw\n2026-01-05 00:00,1\n").toString("base64") : base64 });
}
const kort = (r) => JSON.stringify({ ok: r.ok, status: r.status, svar: r.svar?.slice(0, 300), tidsserie_id: r.tidsserie_id });

// (1) den ægte fil
const ægte = readFileSync(csvfil);
const r1 = await upload("Test upload (fv-app): billund_abvaerk_hourly.csv", ægte, {});
console.log(`(1) ægte fil (${ægte.length} bytes): ${kort(r1)}`);
const t = r1.tidsserie_id && (await gql.query(`{ tidsseries(first: 1, filter: { id: { eq: "${r1.tidsserie_id}" } }) { items { id status sti sha256 oploesning start slut antal_raekker antal_huller enhed kilde aktiv uploadet_af } } }`)).tidsseries.items[0];
console.log(`    række: ${JSON.stringify(t)}`);
// (2) en defekt fil: negativ værdi + tekst i talkolonnen + 48 timer
const rk = Array.from({ length: 50 }, (_, i) => `${new Date(Date.UTC(2026, 0, 5, i)).toISOString().slice(0, 16).replace("T", " ")},${i === 3 ? -2 : i === 7 ? "x" : 10}`);
const r2 = await upload("Test upload (fv-app): defekt.csv", Buffer.from(["timestamp,mw", ...rk, ""].join("\n")), {});
console.log(`(2) defekt fil: ${kort(r2)}`);
// (3) indhold, der ikke passer med anmodningens sha256
const r3 = await upload("Test upload (fv-app): snyd.csv", ægte, {}, true);
console.log(`(3) andet indhold end anmodningens sha256: ${kort(r3)}`);
// (4) hentTidsserie
if (r1.tidsserie_id) {
    const d = await fn("hentTidsserie", { tidsserieId: r1.tidsserie_id, fra: "", til: "" });
    console.log(`(4) hentTidsserie: ok=${d.ok} start=${d.start} oploesning=${d.oploesning} enhed=${d.enhed} n=${d.vaerdier?.length} nuller=${d.vaerdier?.filter((x) => x === null).length} første=${d.vaerdier?.slice(0, 3)} ${d.fejl ?? ""}`);
}
// (5) hentDmiTemperatur
const dmi = await fn("hentDmiTemperatur", { omraade: "karup", fra: "2026-01-01", til: "2026-01-31", kolonne: "temp_mean_past1h" });
console.log(`(5) hentDmiTemperatur karup jan. 2026: ok=${dmi.ok} data_commit=${dmi.data_commit?.slice(0, 7)} n=${dmi.tider?.length} første=${dmi.tider?.[0]}=${dmi.vaerdier?.[0]} sidste=${dmi.tider?.at(-1)} ${dmi.fejl ?? ""}`);
// (6) aktivér og deaktivér
if (r1.tidsserie_id && r1.ok) {
    for (const aktiv of [true, false]) {
        const a = await c.data.Aendringsanmodning.create({ vaerk_id: v.id, forventet_revision: 0, anmodet_af: mig, anmodet: new Date(), status: "ny",
            aendringer_json: JSON.stringify([{ handling: "aktiver_tidsserie", tidsserie_id: r1.tidsserie_id, aktiv }]) });
        const s = await fn("udfoerAendring", { anmodningId: a.id });
        const aktive = (await gql.query(`{ tidsseries(first: 50, filter: { and: [{ vaerk_id: { eq: "${v.id}" } }, { aktiv: { eq: true } }] }) { items { id navn rolle } } }`)).tidsseries.items;
        console.log(`(6) aktiv=${aktiv}: ${JSON.stringify(s)} | aktive nu: ${JSON.stringify(aktive.map((x) => `${x.rolle}:${x.navn}`))}`);
    }
}
c.auth.destroy?.();
