// probe.mjs — kald appens backend (DAB-GraphQL og Functions) UDEN portal-iframe.
//
// Logger ind med et delegeret Entra-token (Power BI-audience med Item.Execute.All,
// fx fra fab's login) via signInWithEntraToken. Kræver
// `services.auth.fabric.externalEntraExchange: true` i rayfin/rayfin.yml.
//
//   node scripts/probe.mjs <tokenfil> lister               # list-query (first:1) på hver entitet
//   node scripts/probe.mjs <tokenfil> fn <navn> '<json>'   # kald en Function
//   node scripts/probe.mjs <tokenfil> gql '<query>'        # rå GraphQL
//
// Tokenet læses fra en FIL (aldrig fra kommandolinjen, hvor det havner i historikken).
// Koordinater læses fra rayfin/.env, som `rayfin up` skriver.

import { readFileSync } from "node:fs";
import { RayfinClient } from "@microsoft/rayfin-client";
import { signInWithEntraToken } from "@microsoft/rayfin-auth-provider-fabric";
import { GraphQLClient } from "@microsoft/rayfin-data";

const [, , tokenfil, kommando, ...rest] = process.argv;
if (!tokenfil || !kommando) {
    console.error("Brug: node scripts/probe.mjs <tokenfil> lister|policytest|rigtig|fn|gql ...");
    process.exit(2);
}

const env = Object.fromEntries(
    readFileSync(new URL("../rayfin/.env", import.meta.url), "utf8")
        .split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const client = new RayfinClient({
    baseUrl: env.RAYFIN_PUBLIC_API_URL,
    publishableKey: env.RAYFIN_PUBLIC_PUBLISHABLE_KEY,
    authStorage: false,
    useProxy: false,
});

const session = await signInWithEntraToken(client.auth, { entraToken: readFileSync(tokenfil, "utf8").trim() });
console.error(`session: ${session.isAuthenticated ? "OK" : "NEJ"} ${session.user?.email ?? ""}`);

const ENTITETER = [
    "Vaerk", "VaerkParameter", "Aendringslog", "Aendringsanmodning", "Scenarie", "ScenarieAendring",
    "Bestilling", "Koersel", "KoerselInput", "KoerselNoegletal", "KoerselMaaned", "KoerselTime",
];

try {
    if (kommando === "lister") {
        for (const e of ENTITETER) {
            const api = client.data[e];
            if (!api) { console.log(`${e}: (ikke i klientens skema)`); continue; }
            try {
                const svar = await api.select(["id"]).first(1).executePaginated();
                console.log(`${e}: OK (${svar.items.length} række(r) på første side, hasNextPage=${svar.hasNextPage})`);
            } catch (err) {
                console.log(`${e}: FEJL ${err?.message ?? err}`);
            }
        }
    } else if (kommando === "policytest") {
        // KONTRAKT §3.0: Bestilling er klient-create MED e-mail-policy; Koersel er read-only.
        // Testrækker får klient_noegle "probe-…" så de kan genkendes og ryddes.
        const mig = session.user?.email;
        const forsøg = async (navn, fn) => {
            try { const r = await fn(); console.log(`${navn}: LYKKEDES ${JSON.stringify(r)}`); }
            catch (err) { console.log(`${navn}: AFVIST ${String(err?.message ?? err).slice(0, 300)}`); }
        };
        const nu = new Date();
        await forsøg("Bestilling med egen e-mail (forventet: lykkes)", () =>
            client.data.Bestilling.create({ scenarie_id: crypto.randomUUID(), klient_noegle: `probe-${crypto.randomUUID()}`, bestilt_af: mig, bestilt: nu }));
        await forsøg("Bestilling med fremmed e-mail (forventet: afvist)", () =>
            client.data.Bestilling.create({ scenarie_id: crypto.randomUUID(), klient_noegle: `probe-${crypto.randomUUID()}`, bestilt_af: "en.anden@example.com", bestilt: nu }));
        const nøgle = `probe-${crypto.randomUUID()}`;
        await forsøg("Bestilling, samme klient_noegle 1. gang", () =>
            client.data.Bestilling.create({ scenarie_id: crypto.randomUUID(), klient_noegle: nøgle, bestilt_af: mig, bestilt: nu }));
        await forsøg("Bestilling, samme klient_noegle 2. gang (forventet: afvist, unik)", () =>
            client.data.Bestilling.create({ scenarie_id: crypto.randomUUID(), klient_noegle: nøgle, bestilt_af: mig, bestilt: nu }));
        await forsøg("Koersel create (forventet: afvist, read-only)", () =>
            client.data.Koersel.create({ bestilling_id: crypto.randomUUID(), scenarie_id: crypto.randomUUID(), vaerk_id: crypto.randomUUID(),
                vaerk_revision: 1, input_hash: "0".repeat(64), status: "faerdig", bestilt_af: mig, bestilt: nu, forsoeg: 0, kilde: "app" }));
        await forsøg("Vaerk create (forventet: afvist, read-only)", () =>
            client.data.Vaerk.create({ kode: "probe", navn: "probe", kilde: "app", revision: 1, arkiveret: false, oprettet_af: mig, aendret_af: mig, oprettet: nu, aendret: nu }));
    } else if (kommando === "rigtig") {
        // Ende-til-ende med den RIGTIGE arbejder: bestil en kort Andeby-kørsel (scenarie "probe-…",
        // så den kan genkendes og fjernes med scripts/ryd_testdata.py), følg status til sluttilstand, tæl resultaterne.
        const mig = session.user?.email;
        const [kode = "andeby", fra = "2026-01-05", til = "2026-01-06"] = rest;
        const v = (await client.data.Vaerk.select(["id", "kode", "revision"]).where({ kode: { eq: kode } }).first(1).executePaginated()).items[0];
        if (!v) throw new Error(`værk ${kode} findes ikke`);
        const s = await client.data.Scenarie.create({
            vaerk_id: v.id, navn: `probe-ende-til-ende ${kode} ${fra}`, med_balancering: false, arkiveret: false,
            periode_start: fra, periode_slut: til, oprettet_af: mig, oprettet: new Date(),
        });
        const b = await client.data.Bestilling.create({ scenarie_id: s.id, klient_noegle: `probe-${crypto.randomUUID()}`, bestilt_af: mig, bestilt: new Date() });
        const t0 = Date.now();
        const svar = await client.functions.startBestilling.invoke({ bestillingId: b.id }, { timeoutMs: 120_000 });
        console.log(`startBestilling (${((Date.now() - t0) / 1000).toFixed(1)} s): ${JSON.stringify(svar)}`);
        if (!svar.ok) process.exit(1);
        let sidst = "";
        for (let i = 0; i < 60; i++) {
            const k = (await client.data.Koersel.select(["status", "fase", "fabric_job_id", "objektiv_dkk", "solve_status", "opnaaet_gap", "antal_interval_model", "antal_interval_csv", "fejlbesked", "hjerteslag"])
                .where({ id: { eq: svar.koersel_id } }).first(1).executePaginated()).items[0];
            const linje = `${k.status} | ${k.fase ?? ""}`;
            if (linje !== sidst) { console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s  ${linje}`); sidst = linje; }
            if (["faerdig", "fejl", "annulleret"].includes(k.status)) {
                console.log(JSON.stringify(k, null, 1));
                for (const e of ["KoerselNoegletal", "KoerselMaaned", "KoerselTime", "KoerselInput"]) {
                    let n = 0, efter;
                    for (;;) {
                        let q = client.data[e].select(["id"]).where({ koersel_id: { eq: svar.koersel_id } }).first(1000);
                        if (efter) q = q.after(efter);
                        const p = await q.executePaginated(); n += p.items.length;
                        if (!p.hasNextPage) break; efter = p.endCursor;
                    }
                    console.log(`${e}: ${n} rækker`);
                }
                break;
            }
            await new Promise((r) => setTimeout(r, 20_000));
        }
    } else if (kommando === "fn") {
        const [navn, json] = rest;
        const ud = await client.functions[navn].invoke(json ? JSON.parse(json) : undefined, { timeoutMs: 240_000 });
        console.log(JSON.stringify(ud, null, 2));
    } else if (kommando === "gql") {
        const gql = new GraphQLClient(client.apiClient);
        console.log(JSON.stringify(await gql.query(rest[0]), null, 2));
    } else {
        throw new Error(`ukendt kommando ${kommando}`);
    }
} finally {
    client.auth.destroy?.();
}
