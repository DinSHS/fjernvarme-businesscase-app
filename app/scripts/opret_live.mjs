// Live-bevis for opret_vaerk (brief 15 B) mod den DEPLOYEDE backend, som en almindelig bruger (Entra-token):
//   node scripts/opret_live.mjs <tokenfil> [kode] [bladfil]   (bladfil fra scripts/guide_blade.ts; ellers skabelonen)
// Samme trådformat som src/lib/data/skriv.ts opretVaerk (delNytVaerk): N opret_vaerk_del + én opret_vaerk.
// Prøver: (1) opret fra viden/nyt_vaerk_skabelon.json, (2) læs værk/parametre/log/dele tilbage, (3) samme kode igen
// -> afvist og delene afvist, (4) en del alene -> 'ny', intet ændret, (5) en manglende del -> afvist.
// Testværket hedder "test_…" og fjernes bagefter med scripts/ryd_testdata.py (kræver az login).
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { RayfinClient } from "@microsoft/rayfin-client";
import { signInWithEntraToken } from "@microsoft/rayfin-auth-provider-fabric";
import { GraphQLClient } from "@microsoft/rayfin-data";

const [, , tokenfil, kode = "test_nyt_vaerk", bladfil] = process.argv;
const env = Object.fromEntries(readFileSync(new URL("../rayfin/.env", import.meta.url), "utf8").split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const c = new RayfinClient({ baseUrl: env.RAYFIN_PUBLIC_API_URL, publishableKey: env.RAYFIN_PUBLIC_PUBLISHABLE_KEY, authStorage: false });
const session = await signInWithEntraToken(c.auth, { entraToken: readFileSync(tokenfil, "utf8").trim() });
const mig = session.user.email;
const gql = new GraphQLClient(c.apiClient);
const INTET = "00000000-0000-0000-0000-000000000000";
const skabelon = bladfil ? JSON.parse(readFileSync(bladfil, "utf8")) : JSON.parse(readFileSync(new URL("../../viden/nyt_vaerk_skabelon.json", import.meta.url), "utf8"));

function dele(udkast, blade) { // = skriv.ts delNytVaerk
    const tekst = (nr, af, bs) => JSON.stringify([{ handling: "opret_vaerk_del", udkast, nr, af, blade: bs }]);
    const g = [[]];
    for (const b of blade) {
        const r = { sti: b.sti, ny_json: b.vaerdi_json, ...(b.bekraeft ? { bekraeft: true } : {}), ...(b.kommentar ? { kommentar: b.kommentar } : {}) };
        if (g.at(-1).length && tekst(99, 99, [...g.at(-1), r]).length > 4000) g.push([r]); else g.at(-1).push(r);
    }
    return g.map((x, i) => tekst(i + 1, g.length, x));
}
const anmod = (aendringer_json) => c.data.Aendringsanmodning.create({ vaerk_id: INTET, forventet_revision: 0, aendringer_json, anmodet_af: mig, anmodet: new Date(), status: "ny" });
const udfoer = (id) => c.functions.udfoerAendring.invoke({ anmodningId: id }, { timeoutMs: 120_000 });
const status = async (ids) => (await gql.query(`{ aendringsanmodnings(first: 100, filter: { id: { in: ${JSON.stringify(ids)} } }) { items { id status svar } } }`)).aendringsanmodnings.items;
async function send(udkast, delTekster, ekstra = {}) {
    const ids = [];
    for (const d of delTekster) ids.push((await anmod(d)).id);
    const slut = await anmod(JSON.stringify([{ handling: "opret_vaerk", udkast, dele: delTekster.length, ny_kode: kode, navn: "Test: nyt værk fra skabelon (fv-app)", ...ekstra }]));
    return { ids, slut: slut.id, svar: await udfoer(slut.id) };
}

// (1) opret
const u1 = randomUUID();
const d1 = dele(u1, skabelon.blade);
console.log(`(1) ${skabelon.blade.length} blade -> ${d1.length} dele (${d1.map((d) => d.length).join(", ")} tegn)`);
const r1 = await send(u1, d1);
console.log(`    svar: ${JSON.stringify(r1.svar)}`);
// (2) læs tilbage
const v = (await gql.query(`{ vaerks(first: 1, filter: { kode: { eq: "${kode}" } }) { items { id kode navn kilde revision kopieret_fra_id oprettet_af } } }`)).vaerks.items[0];
console.log(`(2) værk: ${JSON.stringify(v)}`);
if (v) {
    const p = (await gql.query(`{ vaerkParameters(first: 1000, filter: { vaerk_id: { eq: "${v.id}" } }) { items { sti vaerdi_json bekraeft kommentar raekkefoelge } } }`)).vaerkParameters.items;
    const l = (await gql.query(`{ aendringslogs(first: 1000, filter: { vaerk_id: { eq: "${v.id}" } }) { items { revision handling anmodning_id } } }`)).aendringslogs.items;
    const forventet = new Map(skabelon.blade.map((b) => [b.sti, b]));
    const afvig = p.filter((x) => { const b = forventet.get(x.sti); return !b || b.vaerdi_json !== x.vaerdi_json || (b.bekraeft === true) !== x.bekraeft || (b.kommentar || null) !== (x.kommentar || null); });
    const orden = [...p].sort((a, b) => a.raekkefoelge - b.raekkefoelge).map((x) => x.sti).join("|") === skabelon.blade.map((b) => b.sti).join("|");
    console.log(`    parametre: ${p.length} (forventet ${skabelon.blade.length}), afvigende: ${afvig.length}, orden bevaret: ${orden}, bekræft: ${p.filter((x) => x.bekraeft).length}`);
    console.log(`    log: ${l.length} rækker, alle revision 1 + 'opret': ${l.every((x) => x.revision === 1 && x.handling === "opret")}, anmodning = slut: ${l.every((x) => x.anmodning_id === r1.slut)}`);
    console.log(`    anmodninger: ${JSON.stringify((await status([...r1.ids, r1.slut])).map((x) => x.status))}`);
}
// (3) samme kode igen
const u3 = randomUUID();
const r3 = await send(u3, dele(u3, skabelon.blade));
console.log(`(3) samme kode: ${JSON.stringify(r3.svar)}; dele: ${JSON.stringify((await status(r3.ids)).map((x) => x.status))}`);
// (4) en del alene
const u4 = randomUUID();
const del4 = (await anmod(dele(u4, skabelon.blade)[0])).id;
console.log(`(4) del alene: ${JSON.stringify(await udfoer(del4))}; status bagefter: ${(await status([del4]))[0].status}`);
// (5) manglende del: sig N+1 dele
const u5 = randomUUID();
const d5 = dele(u5, skabelon.blade);
const ids5 = []; for (const d of d5) ids5.push((await anmod(d)).id);
const s5 = await anmod(JSON.stringify([{ handling: "opret_vaerk", udkast: u5, dele: d5.length + 1, ny_kode: `${kode}_x`, navn: "Test" }]));
console.log(`(5) manglende del: ${JSON.stringify(await udfoer(s5.id))}; dele: ${JSON.stringify((await status(ids5)).map((x) => x.status))}`);
console.log(`værk-id: ${v?.id ?? "-"}`);
c.auth.destroy?.();
