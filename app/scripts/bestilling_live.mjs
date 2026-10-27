// Live-beviser for K2/§6c på Functions-siden — mod den DEPLOYEDE app, som en almindelig bruger (Entra-token).
//   node scripts/bestilling_live.mjs <tokenfil> kvote [værkskode]     4 samtidige bestillinger -> 3 i kø + 1 afvist; ingen jobstart
//                                                              mens en arbejder holder fjv_solver; pins + modtaget frosset
//   node scripts/bestilling_live.mjs <tokenfil> samtidig [værkskode]  2 samtidige bestillinger med låsen FRI -> præcis ét POST
//   node scripts/bestilling_live.mjs <tokenfil> status <id …>          status/fase/modtaget/startet for kørsler + Motor
//   node scripts/bestilling_live.mjs <tokenfil> annuller <id>          annullerKoersel
//   node scripts/bestilling_live.mjs <tokenfil> en <værkskode> [navn]    én kørsel (FJV_PERIODE, FJV_BALANCERING)
//   node scripts/bestilling_live.mjs <tokenfil> arkiver                 arkivér egne "Test K2 (…)"-scenarier
//   node scripts/bestilling_live.mjs <tokenfil> vagt-foerste <id …>    annullér den FØRSTE af kørslerne, der ses i `koerer`
//                                                              (kun én: ingen annulleres, hvis én allerede er det)
// FJV_BALANCERING=1: med balancering (MILP, minutter i stedet for sekunder — giver et sikkert `koerer`-vindue).
// Periode: FJV_PERIODE=2026-01-01:2026-01-31 (standard 5.-6. jan.) — længere periode = længere `koerer`-vindue.
// Opretter scenarier med navnet "Test K2 (…)" på en 2-døgns periode (5.-6. jan. 2026), så kørslerne er korte.
import { readFileSync } from "node:fs";
import { RayfinClient } from "@microsoft/rayfin-client";
import { signInWithEntraToken } from "@microsoft/rayfin-auth-provider-fabric";
import { GraphQLClient } from "@microsoft/rayfin-data";

const [, , tokenfil, kommando, ...rest] = process.argv;
const env = Object.fromEntries(readFileSync(new URL("../rayfin/.env", import.meta.url), "utf8").split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const c = new RayfinClient({ baseUrl: env.RAYFIN_PUBLIC_API_URL, publishableKey: env.RAYFIN_PUBLIC_PUBLISHABLE_KEY, authStorage: false });
const session = await signInWithEntraToken(c.auth, { entraToken: readFileSync(tokenfil, "utf8").trim() });
const mig = session.user.email;
const gql = new GraphQLClient(c.apiClient);
const fn = (navn, input) => c.functions[navn].invoke(input, { timeoutMs: 120_000 });
const PERIODE = (process.env.FJV_PERIODE ?? "2026-01-05:2026-01-06").split(":");
const nu = () => new Date().toISOString().slice(11, 19);

async function motor() {
    return (await gql.query(`{ motors(first: 1) { items { model_commit data_commit sidste_jobstart sidste_job_id } } }`)).motors.items[0];
}
async function værk(kode) {
    return (await gql.query(`{ vaerks(first: 1, filter: { kode: { eq: "${kode}" } }) { items { id kode } } }`)).vaerks.items[0];
}
async function nytScenarieOgBestilling(vaerkId, navn) {
    const s = await c.data.Scenarie.create({ vaerk_id: vaerkId, navn, med_balancering: process.env.FJV_BALANCERING === "1", arkiveret: false,
        periode_start: PERIODE[0], periode_slut: PERIODE[1], oprettet_af: mig, oprettet: new Date() });
    const b = await c.data.Bestilling.create({ scenarie_id: s.id, klient_noegle: crypto.randomUUID(), bestilt_af: mig,
        bestilt: new Date("2020-01-01T00:00:00Z") }); // bevidst gammel klienttid: FIFO skal bruge servertiden
    return { scenarie: s.id, bestilling: b.id };
}

if (kommando === "kvote" || kommando === "samtidig") {
    const v = await værk(rest[0] ?? "andeby");
    const n = kommando === "kvote" ? 4 : 2;
    const m0 = await motor();
    console.log(`${nu()} Motor før: ${JSON.stringify(m0)}`);
    const par = [];
    for (let i = 1; i <= n; i++) par.push(await nytScenarieOgBestilling(v.id, `Test K2 (${kommando} ${i}/${n})`));
    console.log(`${nu()} ${n} bestillinger oprettet; kalder startBestilling ${n} gange SAMTIDIGT`);
    const svar = await Promise.all(par.map((p) => fn("startBestilling", { bestillingId: p.bestilling }).catch((e) => ({ ok: false, afvist: `KALDFEJL ${e?.message ?? e}` }))));
    svar.forEach((s, i) => console.log(`  ${i + 1}: ${s.ok ? `ok ${s.status} ${s.koersel_id}` : `afvist: ${s.afvist}`} | arbejder: ${JSON.stringify(s.arbejder ?? null)}`));
    const m1 = await motor();
    console.log(`${nu()} Motor efter: ${JSON.stringify(m1)}`);
    console.log(`  POST'et job: ${svar.filter((s) => s.arbejder?.startet).length} (Motor.sidste_job_id ${m0.sidste_job_id === m1.sidste_job_id ? "uændret" : "ændret"})`);
    const ok = svar.filter((s) => s.ok);
    if (ok.length) {
        const k = (await gql.query(`{ koersels(first: 1, filter: { id: { eq: "${ok[0].koersel_id}" } }) { items { modtaget bestilt model_commit data_commit } } }`)).koersels.items[0];
        const pins = (await gql.query(`{ koerselInputs(first: 10, filter: { and: [{ koersel_id: { eq: "${ok[0].koersel_id}" } }, { kilde: { eq: "scenarie" } }] }) { items { sti vaerdi_json } } }`)).koerselInputs.items;
        console.log(`  kørsel ${ok[0].koersel_id}: modtaget=${k.modtaget} (klientens bestilt=${k.bestilt}) model_commit=${k.model_commit} data_commit=${k.data_commit}`);
        console.log(`  frosne pins i input: ${JSON.stringify(pins.filter((p) => /commit/.test(p.sti)))}`);
        console.log(`  pins = Motor: ${k.model_commit === m1.model_commit && k.data_commit === m1.data_commit}`);
    }
    console.log(`  id'er: ${ok.map((s) => s.koersel_id).join(" ")}`);
} else if (kommando === "lang-kort") {
    // Aktiv annullering: en LANG kørsel (helår, balancering) og bagefter en KORT (2 døgn, uden). FIFO = lang først.
    const v = await værk(rest[0] ?? "andeby");
    const lang = await (async () => { const g = [[...PERIODE], process.env.FJV_BALANCERING]; // kopi: PERIODE ændres på stedet
        PERIODE.splice(0, 2, "2026-01-01", "2026-12-31"); process.env.FJV_BALANCERING = "1";
        const p = await nytScenarieOgBestilling(v.id, "Test K2 (aktiv annullering, lang)");
        PERIODE.splice(0, 2, ...g[0]); process.env.FJV_BALANCERING = g[1] ?? ""; return p; })();
    const s1 = await fn("startBestilling", { bestillingId: lang.bestilling });
    const kort = await nytScenarieOgBestilling(v.id, "Test K2 (aktiv annullering, kort)");
    const s2 = await fn("startBestilling", { bestillingId: kort.bestilling });
    console.log(`${nu()} lang ${s1.koersel_id} ${JSON.stringify(s1.arbejder)}`);
    console.log(`${nu()} kort ${s2.koersel_id} ${JSON.stringify(s2.arbejder)}`);
} else if (kommando === "arkiver") {
    // Arkivér egne "Test K2 (…)"-scenarier (klientens update; scenarier slettes ikke, K2).
    const ss = (await gql.query(`{ scenaries(first: 200, filter: { and: [{ arkiveret: { eq: false } }, { oprettet_af: { eq: "${mig}" } }] }) { items { id navn } } }`)).scenaries.items
        .filter((s) => /^Test K2 \(/.test(s.navn));
    for (const s of ss) await c.data.Scenarie.update({ id: s.id }, { arkiveret: true });
    console.log(`${nu()} arkiveret: ${ss.length} (${ss.map((s) => s.navn).join("; ")})`);
} else if (kommando === "en") {
    // Én kørsel af et værk (fx en prøvekørsel på 2 døgn af et nyt værk): `en <værkskode> [navn]`.
    const v = await værk(rest[0]);
    if (!v) { console.error(`værket ${rest[0]} findes ikke`); process.exit(2); }
    const p = await nytScenarieOgBestilling(v.id, rest[1] ?? `Test prøvekørsel (${rest[0]})`);
    const s = await fn("startBestilling", { bestillingId: p.bestilling });
    console.log(`${nu()} ${JSON.stringify(s)}`);
} else if (kommando === "status") {
    for (const id of rest) {
        const k = (await gql.query(`{ koersels(first: 1, filter: { id: { eq: "${id}" } }) { items { id status fase modtaget startet afsluttet arbejder_id objektiv_dkk annuller_anmodet fejlbesked } } }`)).koersels.items[0];
        console.log(JSON.stringify(k));
    }
    console.log(`Motor: ${JSON.stringify(await motor())}`);
} else if (kommando === "vagt") {
    // Én linje pr. kald: "<id8>=<status>/<fase>" for hver kørsel. `vagt <annullér-id> <øvrige id …>`: står
    // annullér-id i `koerer` med en arbejder, anmodes annullering (samarbejdende stop af en AKTIV kørsel).
    const [mål, ...øvrige] = rest;
    const dele = [];
    for (const id of [mål, ...øvrige]) {
        const k = (await gql.query(`{ koersels(first: 1, filter: { id: { eq: "${id}" } }) { items { status fase arbejder_id annuller_anmodet } } }`)).koersels.items[0];
        dele.push(`${id.slice(0, 8)}=${k.status}/${k.fase ?? ""}${k.annuller_anmodet ? "/anmodet" : ""}`);
        if (id === mål && k.status === "koerer" && k.arbejder_id && !k.annuller_anmodet) {
            dele.push(`ANNULLER ${JSON.stringify(await fn("annullerKoersel", { koerselId: id }))}`);
        }
    }
    const m = await motor();
    console.log(`${nu()} ${dele.join(" ")} motor=${m.sidste_job_id ?? "null"}`);
} else if (kommando === "vagt-foerste") {
    const ks = [];
    for (const id of rest) {
        ks.push({ id, ...(await gql.query(`{ koersels(first: 1, filter: { id: { eq: "${id}" } }) { items { status fase arbejder_id annuller_anmodet } } }`)).koersels.items[0] });
    }
    const dele = ks.map((k) => `${k.id.slice(0, 8)}=${k.status}/${k.fase ?? ""}${k.annuller_anmodet ? "/anmodet" : ""}`);
    const alleredeRamt = ks.some((k) => k.annuller_anmodet || k.status === "annulleret");
    const aktiv = ks.find((k) => k.status === "koerer" && k.arbejder_id);
    if (!alleredeRamt && aktiv) dele.push(`ANNULLER ${aktiv.id.slice(0, 8)} ${JSON.stringify(await fn("annullerKoersel", { koerselId: aktiv.id }))}`);
    const m = await motor();
    console.log(`${nu()} ${dele.join(" ")} motor=${m.sidste_job_id ?? "null"}`);
} else if (kommando === "annuller") {
    console.log(JSON.stringify(await fn("annullerKoersel", { koerselId: rest[0] })));
} else {
    console.error("ukendt kommando"); process.exit(2);
}
c.auth.destroy?.();
