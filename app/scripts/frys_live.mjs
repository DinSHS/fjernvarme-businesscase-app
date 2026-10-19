// Live-bevis for frysningen af en tidsserie i startBestilling (KONTRAKT §6d) mod den DEPLOYEDE backend:
//   node scripts/frys_live.mjs <tokenfil> <værkskode> <tidsserie-id> <repo-filnavn>
// A: scenarie med repoets hvidlistede heat_csv = <repo-filnavn>; B: samme periode, men varmelasten valgt som værkets
// tidsserie (ScenarieAendring `set _tidsserie.varmelast` = id). Samme fil -> samme objektiv. B's frosne input skal
// have _koersel.tidsserie.varmelast = {id, sha256} og ingen _koersel.heat_csv. Scenarierne hedder "Test …".
import { readFileSync } from "node:fs";
import { RayfinClient } from "@microsoft/rayfin-client";
import { signInWithEntraToken } from "@microsoft/rayfin-auth-provider-fabric";
import { GraphQLClient } from "@microsoft/rayfin-data";

const [, , tokenfil, kode, tsId, repofil] = process.argv;
const env = Object.fromEntries(readFileSync(new URL("../rayfin/.env", import.meta.url), "utf8").split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const c = new RayfinClient({ baseUrl: env.RAYFIN_PUBLIC_API_URL, publishableKey: env.RAYFIN_PUBLIC_PUBLISHABLE_KEY, authStorage: false });
const session = await signInWithEntraToken(c.auth, { entraToken: readFileSync(tokenfil, "utf8").trim() });
const mig = session.user.email;
const gql = new GraphQLClient(c.apiClient);
const fn = (navn, input) => c.functions[navn].invoke(input, { timeoutMs: 120_000 });
const nu = () => new Date().toISOString().slice(11, 19);
const v = (await gql.query(`{ vaerks(first: 1, filter: { kode: { eq: "${kode}" } }) { items { id } } }`)).vaerks.items[0];

async function bestil(navn, felter, valg) {
    const s = await c.data.Scenarie.create({ vaerk_id: v.id, navn, med_balancering: false, arkiveret: false,
        periode_start: "2026-01-05", periode_slut: "2026-01-06", oprettet_af: mig, oprettet: new Date(), ...felter });
    if (valg) await c.data.ScenarieAendring.create({ scenarie_id: s.id, type: "set", sti: "_tidsserie.varmelast", vaerdi_json: JSON.stringify(valg), raekkefoelge: 1 });
    const b = await c.data.Bestilling.create({ scenarie_id: s.id, klient_noegle: crypto.randomUUID(), bestilt_af: mig, bestilt: new Date() });
    const r = await fn("startBestilling", { bestillingId: b.id });
    console.log(`${nu()} ${navn}: ${JSON.stringify({ ok: r.ok, koersel_id: r.koersel_id, afvist: r.afvist })}`);
    return r.koersel_id;
}
const kA = await bestil("Test frysning A (heat_csv)", { heat_csv: repofil }, null);
const kB = await bestil("Test frysning B (tidsserie)", {}, tsId);
const input = (await gql.query(`{ koerselInputs(first: 50, filter: { and: [{ koersel_id: { eq: "${kB}" } }, { sti: { startsWith: "_koersel." } }] }) { items { sti vaerdi_json } } }`)).koerselInputs.items;
console.log(`B frosset: ${JSON.stringify(input.filter((x) => /tidsserie|heat_csv/.test(x.sti)))}`);
for (let i = 0; i < 40; i++) {
    const ks = (await gql.query(`{ koersels(first: 2, filter: { id: { in: ["${kA}", "${kB}"] } }) { items { id status objektiv_dkk fejlbesked } } }`)).koersels.items;
    const f = (id) => ks.find((k) => k.id === id);
    if ([f(kA), f(kB)].every((k) => k && ["faerdig", "fejl", "annulleret"].includes(k.status))) {
        console.log(`${nu()} A: ${f(kA).status} ${f(kA).objektiv_dkk} ${f(kA).fejlbesked ?? ""}`);
        console.log(`${nu()} B: ${f(kB).status} ${f(kB).objektiv_dkk} ${f(kB).fejlbesked ?? ""}`);
        console.log(`samme objektiv: ${f(kA).objektiv_dkk === f(kB).objektiv_dkk}`);
        break;
    }
    await new Promise((ok) => setTimeout(ok, 20_000));
}
c.auth.destroy?.();
