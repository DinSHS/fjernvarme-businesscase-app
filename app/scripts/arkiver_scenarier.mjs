// Arkivér testscenarier — KØRER LOKALT med udviklerens egen identitet (Entra-token), ALDRIG som Function (K2-F1).
//   node scripts/arkiver_scenarier.mjs <tokenfil> <scenarie-id> [<scenarie-id> …] [--udfoer]
// Samme princip som ryd_testdata.py: præcis de angivne id'er (en uforanderlig liste på kommandolinjen), aldrig
// noget udvalgt på navn, som en bruger selv kan skrive. Uden --udfoer vises kun, hvad der ville blive arkiveret.
// Arkivering er klientens egen update (arkiveret = true) — scenarier slettes ikke (K2); kørslerne bevares.
import { readFileSync } from "node:fs";
import { RayfinClient } from "@microsoft/rayfin-client";
import { signInWithEntraToken } from "@microsoft/rayfin-auth-provider-fabric";
import { GraphQLClient } from "@microsoft/rayfin-data";

const args = process.argv.slice(2);
const udfoer = args.includes("--udfoer");
const [tokenfil, ...ids] = args.filter((a) => a !== "--udfoer");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!tokenfil || ids.length === 0) { console.error("Brug: node scripts/arkiver_scenarier.mjs <tokenfil> <id> [<id> …] [--udfoer]"); process.exit(2); }
for (const i of ids) if (!UUID.test(i)) { console.error(`ikke et uuid: ${i}`); process.exit(2); }

const env = Object.fromEntries(readFileSync(new URL("../rayfin/.env", import.meta.url), "utf8").split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const c = new RayfinClient({ baseUrl: env.RAYFIN_PUBLIC_API_URL, publishableKey: env.RAYFIN_PUBLIC_PUBLISHABLE_KEY, authStorage: false });
await signInWithEntraToken(c.auth, { entraToken: readFileSync(tokenfil, "utf8").trim() });
const gql = new GraphQLClient(c.apiClient);

const fundet = (await gql.query(`{ scenaries(first: ${ids.length}, filter: { id: { in: ${JSON.stringify(ids)} } }) { items { id navn arkiveret } } }`)).scenaries.items;
const mangler = ids.filter((i) => !fundet.some((s) => s.id.toLowerCase() === i.toLowerCase()));
if (mangler.length) { console.error(`findes ikke: ${mangler.join(" ")}`); process.exit(1); }
for (const s of fundet) {
    if (s.arkiveret) { console.log(`allerede arkiveret  ${s.id}  ${s.navn}`); continue; }
    if (udfoer) await c.data.Scenarie.update({ id: s.id }, { arkiveret: true });
    console.log(`${udfoer ? "arkiveret" : "ville arkivere"}  ${s.id}  ${s.navn}`);
}
if (!udfoer) console.log("(tørløb — tilføj --udfoer)");
c.auth.destroy?.();
