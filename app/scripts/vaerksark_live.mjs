// Live-bevis for værksark-upload (KONTRAKT §6d) mod den DEPLOYEDE backend, som en almindelig bruger (Entra-token):
//   node scripts/vaerksark_live.mjs <tokenfil> <ark.xlsx>
// Samme vej som src/lib/data/skriv.ts uploadVaerksark: anmodning i eget navn med sha256 af base64-teksten ->
// uploadVaerksark -> Vaerksarkimport (id = anmodningens) -> fjv_importer_vaerksark. Følger importen til faerdig/fejl
// (højst hvert 20. s) og viser det oprettede værk. Kald igen med samme anmodning prøves også (K5-F4: samme import).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { RayfinClient } from "@microsoft/rayfin-client";
import { signInWithEntraToken } from "@microsoft/rayfin-auth-provider-fabric";
import { GraphQLClient } from "@microsoft/rayfin-data";

const [, , tokenfil, arkfil] = process.argv;
const env = Object.fromEntries(readFileSync(new URL("../rayfin/.env", import.meta.url), "utf8").split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const c = new RayfinClient({ baseUrl: env.RAYFIN_PUBLIC_API_URL, publishableKey: env.RAYFIN_PUBLIC_PUBLISHABLE_KEY, authStorage: false });
const session = await signInWithEntraToken(c.auth, { entraToken: readFileSync(tokenfil, "utf8").trim() });
const gql = new GraphQLClient(c.apiClient);
const nu = () => new Date().toISOString().slice(11, 19);
const base64 = readFileSync(arkfil).toString("base64");
const a = await c.data.Aendringsanmodning.create({
    vaerk_id: "00000000-0000-0000-0000-000000000000", forventet_revision: 0, anmodet_af: session.user.email, anmodet: new Date(), status: "ny",
    aendringer_json: JSON.stringify([{ handling: "upload_vaerksark", filnavn: "test_r5.xlsx", timeslut: null, sha256: createHash("sha256").update(base64, "utf8").digest("hex") }]),
});
const kald = () => c.functions.uploadVaerksark.invoke({ anmodningId: a.id, indholdBase64: base64 }, { timeoutMs: 180_000 });
const r1 = await kald();
console.log(`${nu()} uploadVaerksark: ${JSON.stringify(r1)}`);
const r2 = await kald();
console.log(`${nu()} samme anmodning igen: ${JSON.stringify(r2)}  (samme import: ${r1.import_id === r2.import_id})`);
for (let i = 0; i < 45; i++) {
    const im = (await gql.query(`{ vaerksarkimports(first: 1, filter: { id: { eq: "${r1.import_id}" } }) { items { id status vaerk_id tidsserie_id fabric_job_id log } } }`)).vaerksarkimports.items[0];
    if (["faerdig", "fejl"].includes(im?.status)) {
        console.log(`${nu()} import: ${JSON.stringify({ ...im, log: im.log?.slice(-400) })}`);
        if (im.vaerk_id) {
            const v = (await gql.query(`{ vaerks(first: 1, filter: { id: { eq: "${im.vaerk_id}" } }) { items { id kode navn kilde revision } } tidsseries(first: 10, filter: { vaerk_id: { eq: "${im.vaerk_id}" } }) { items { id rolle status kilde aktiv antal_raekker } } }`));
            console.log(`    værk: ${JSON.stringify(v.vaerks.items[0])}`);
            console.log(`    tidsserier: ${JSON.stringify(v.tidsseries.items)}`);
        }
        break;
    }
    await new Promise((ok) => setTimeout(ok, 20_000));
}
const antal = (await gql.query(`{ vaerksarkimports(first: 50, filter: { filnavn: { eq: "test_r5.xlsx" } }) { items { id } } }`)).vaerksarkimports.items.length;
console.log(`importer med filnavnet test_r5.xlsx: ${antal} (K5-F4: skal være 1)`);
c.auth.destroy?.();
