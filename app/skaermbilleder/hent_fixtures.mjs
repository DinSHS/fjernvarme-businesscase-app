// Øjebliksbillede af appens database til skærmbillede-harnessen:
//   node skaermbilleder/hent_fixtures.mjs <tokenfil>
// Skriver skaermbilleder/harness/fixtures.json med ALLE rækker i alle 12 tabeller, læst RÅT via GraphQL
// (som DAB sender dem — falsk-klient.ts efterligner selv Rayfin-klientens sniffing). Undtagelse:
// KoerselTime tages kun for de første 31 døgn pr. kørsel (appen læser aldrig mere end 31 døgn ad gangen,
// og et helår ville gøre filen på 10+ MB). Felterne læses af entitetsfilerne i rayfin/data/.
// Testrækker udelades: scenarier hvis navn begynder med "Test " (agenternes live-prøver, fx "Test K2 (…)",
// "Test 6c (…)"), værker hvis kode begynder med "test_" (fx test_nyt_vaerk), og alt der hænger på dem —
// parametre, log, bestillinger, ændringer, kørsler og kørslernes inddata/resultater.
// Antallet af udeladte rækker skrives ud, så udeladelsen kan ses.
//
// Data er værksdata: filen må ligge i dette (private) repo, ALDRIG i det offentlige modelrepo.
// Login som probe.mjs (delegeret Entra-token, Power BI-audience).

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { anonymiser } from "./anonymiser.mjs";
import { RayfinClient } from "@microsoft/rayfin-client";
import { signInWithEntraToken } from "@microsoft/rayfin-auth-provider-fabric";
import { GraphQLClient } from "@microsoft/rayfin-data";

const [, , tokenfil] = process.argv;
if (!tokenfil) { console.error("Brug: node skaermbilleder/hent_fixtures.mjs <tokenfil>"); process.exit(2); }

const rod = new URL("../", import.meta.url);
const env = Object.fromEntries(readFileSync(new URL("rayfin/.env", rod), "utf8").split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const client = new RayfinClient({ baseUrl: env.RAYFIN_PUBLIC_API_URL, publishableKey: env.RAYFIN_PUBLIC_PUBLISHABLE_KEY, authStorage: false });
await signInWithEntraToken(client.auth, { entraToken: readFileSync(tokenfil, "utf8").trim() });
const gql = new GraphQLClient(client.apiClient);

const dataMappe = new URL("rayfin/data/", rod);
const entiteter = readdirSync(dataMappe).filter((f) => /^[A-Z]\w+\.ts$/.test(f) && f !== "schema.ts").map((f) => {
    const kilde = readFileSync(new URL(f, dataMappe), "utf8");
    const felter = [...kilde.matchAll(/^\s*@\w+\([^)]*\)\s+(\w+)[!?]:/gmu)].map((m) => m[1]);
    const navn = f.replace(".ts", "");
    return { navn, felter, query: navn.charAt(0).toLowerCase() + navn.slice(1) + "s" };
});

async function alle(query, felter, filter = "", sortering = "", grænse = Infinity) {
    const ud = [];
    let efter = null;
    while (ud.length < grænse) {
        const side = Math.min(1000, grænse - ud.length);
        const args = [`first: ${side}`, efter ? `after: "${efter}"` : "", filter, sortering].filter(Boolean).join(", ");
        const svar = await gql.query(`{ ${query}(${args}) { items { ${felter.join(" ")} } hasNextPage endCursor } }`);
        const r = svar[query];
        ud.push(...r.items);
        if (!r.hasNextPage) break;
        efter = r.endCursor;
    }
    return ud;
}

const ud = {};
for (const e of entiteter) {
    if (e.navn === "KoerselTime") continue;
    ud[e.navn] = await alle(e.query, e.felter);
    console.log(`${e.navn}: ${ud[e.navn].length}`);
}
const testVaerker = new Set(ud.Vaerk.filter((v) => /^test_/.test(v.kode ?? "")).map((v) => v.id));
const testScenarier = new Set(ud.Scenarie.filter((s) => /^Test /.test(s.navn ?? "") || testVaerker.has(s.vaerk_id)).map((s) => s.id));
const testKoersler = new Set(ud.Koersel.filter((k) => testScenarier.has(k.scenarie_id) || testVaerker.has(k.vaerk_id)).map((k) => k.id));
for (const [navn, rækker] of Object.entries(ud)) {
    const behold = rækker.filter((r) => !(navn === "Scenarie" && testScenarier.has(r.id)) && !(navn === "Vaerk" && testVaerker.has(r.id))
        && !(r.vaerk_id && testVaerker.has(r.vaerk_id))
        && !(r.scenarie_id && testScenarier.has(r.scenarie_id)) && !(r.koersel_id && testKoersler.has(r.koersel_id)));
    if (behold.length !== rækker.length) console.log(`${navn}: ${rækker.length - behold.length} testrækker udeladt`);
    ud[navn] = behold;
}
const tid = entiteter.find((e) => e.navn === "KoerselTime");
ud.KoerselTime = [];
for (const k of ud.Koersel) {
    // 31 døgn ved kvarterer = 2976 intervaller; ved timer giver grænsen hele 31 døgn + resten afskæres nedenfor.
    const rækker = await alle(tid.query, tid.felter, `filter: { koersel_id: { eq: "${k.id}" } }`, `orderBy: { tid: ASC }`, 2976);
    if (!rækker.length) continue;
    const slut = new Date(rækker[0].tid).getTime() + 31 * 86_400_000;
    const inden = rækker.filter((r) => new Date(r.tid).getTime() < slut);
    ud.KoerselTime.push(...inden);
    console.log(`KoerselTime ${k.id.slice(0, 8)}: ${inden.length}`);
}

// Kildefilerne (kilde.yaml) via Function hentKildeYaml — samme vej som appen.
ud.kildefiler = {};
for (const v of ud.Vaerk) {
    const r = await client.functions.hentKildeYaml.invoke({ vaerkId: v.id }, { timeoutMs: 120_000 });
    if (r.ok) ud.kildefiler[v.kode] = r.tekst;
    console.log(`kilde.yaml ${v.kode}: ${r.ok ? r.bytes + " tegn" : r.fejl}`);
}

// KONTRAKT §6d: værdierne for hver gyldig tidsserie og DMI-temperatur for værkernes klimaområder — via de
// rigtige Functions, så harnessens grafer viser rigtige tal (fv-tidsserie, ønske 4/5).
ud.tidsseriedata = {};
for (const t of (ud.Tidsserie ?? []).filter((x) => x.status === "gyldig")) {
    const r = await client.functions.hentTidsserie.invoke({ tidsserieId: t.id, fra: "", til: "" }, { timeoutMs: 120_000 });
    if (r.ok) ud.tidsseriedata[t.id] = r;
    console.log(`hentTidsserie ${t.id.slice(0, 8)} (${t.navn}): ${r.ok ? r.vaerdier.length + " timer" : r.fejl}`);
}
ud.dmi = {};
const omraader = [...new Set((ud.VaerkParameter ?? []).filter((p) => p.sti === "data.dmi_area").map((p) => JSON.parse(p.vaerdi_json)))];
for (const o of omraader) {
    const del = [];
    for (const [fra, til] of [["2025-01-01", "2025-12-31"], ["2026-01-01", "2026-06-30"]]) {
        const r = await client.functions.hentDmiTemperatur.invoke({ omraade: o, fra, til, kolonne: "temp_mean_past1h" }, { timeoutMs: 120_000 });
        if (r.ok) del.push(r);
    }
    ud.dmi[o] = { tider: del.flatMap((r) => r.tider), vaerdier: del.flatMap((r) => r.vaerdier) };
    console.log(`hentDmiTemperatur ${o}: ${ud.dmi[o].tider.length} timer`);
}

const fil = new URL("skaermbilleder/harness/fixtures.json", rod);
writeFileSync(fil, JSON.stringify({ hentet: new Date().toISOString(), ...anonymiser(ud) }));
console.log(`skrevet: ${fil.pathname} (${(readFileSync(fil).length / 1e6).toFixed(1)} MB)`);
client.auth.destroy?.();
