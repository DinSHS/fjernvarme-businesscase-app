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
    console.error("Brug: node scripts/probe.mjs <tokenfil> lister|fn|gql ...");
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
    } else if (kommando === "e2e") {
        // Ende-til-ende mod de betroede funktioner på testværket `probe_vaerk`.
        // Skriver det frosne input til <tokenfil>.input.json, så hash-definitionen kan
        // efterregnes i Python (scripts/tjek_hash.py).
        const mig = session.user?.email;
        const fn = (navn, input) => client.functions[navn].invoke(input ?? {}, { timeoutMs: 240_000 });
        const nu = () => new Date();
        const log = (t, v) => console.log(`\n## ${t}\n${JSON.stringify(v, null, 1)}`);
        const alle = async (entitet, felter, filter) => {
            const ud = []; let efter;
            for (;;) {
                let q = client.data[entitet].select(felter);
                if (filter) q = q.where(filter);
                q = q.first(100); if (efter) q = q.after(efter);
                const s = await q.executePaginated(); ud.push(...s.items);
                if (!s.hasNextPage) return ud; efter = s.endCursor;
            }
        };

        const seed = await fn("seedProbevaerk"); log("seedProbevaerk", seed);
        const vaerkId = seed.vaerk_id;
        const nytScenarie = async (navn, felter, ændringer) => {
            const s = await client.data.Scenarie.create({
                vaerk_id: vaerkId, navn, med_balancering: false, arkiveret: false, oprettet_af: mig, oprettet: nu(), ...felter,
            });
            for (const [i, æ] of (ændringer ?? []).entries()) {
                await client.data.ScenarieAendring.create({ scenarie_id: s.id, raekkefoelge: i + 1, ...æ });
            }
            return s.id;
        };
        const bestil = async (scenarieId) => (await client.data.Bestilling.create({
            scenarie_id: scenarieId, klient_noegle: `probe-${crypto.randomUUID()}`, bestilt_af: mig, bestilt: nu(),
        })).id;

        // 1) Gyldig bestilling -> Koersel(koe) + KoerselInput + arbejder startet
        const s1 = await nytScenarie("probe-1 gyldig", { periode_start: "2026-01-05", periode_slut: "2026-01-07", tidsgraense_s: 300, mip_rel_gap: 0.0002 }, [
            { type: "set", sti: "prices.straw.value", vaerdi_json: "50.0" },
            { type: "enable", sti: "elkedel" },
        ]);
        const b1 = await bestil(s1);
        const r1 = await fn("startBestilling", { bestillingId: b1 }); log("startBestilling (1. kald)", r1);
        const r1b = await fn("startBestilling", { bestillingId: b1 }); log("startBestilling (2. kald, samme bestilling -> samme kørsel)", r1b);
        if (r1.koersel_id) {
            const k = await alle("Koersel", ["id", "status", "fase", "vaerk_revision", "input_hash", "forsoeg", "fabric_job_id", "oensket_rel_gap", "oensket_abs_gap"], { id: { eq: r1.koersel_id } });
            log("Koersel som klienten ser den", k);
            const input = await alle("KoerselInput", ["kilde", "sti", "vaerdi_json"], { koersel_id: { eq: r1.koersel_id } });
            console.log(`\nKoerselInput: ${input.length} rækker; kilder: ${JSON.stringify(input.reduce((m, r) => ((m[r.kilde] = (m[r.kilde] ?? 0) + 1), m), {}))}`);
            (await import("node:fs")).writeFileSync(`${tokenfil}.input.json`, JSON.stringify({ hash: k[0]?.input_hash, rækker: input }));
        }

        // 2) Afvisninger
        const afvis = async (titel, felter, ændringer) => {
            const r = await fn("startBestilling", { bestillingId: await bestil(await nytScenarie(`probe-${titel}`, felter, ændringer)) });
            console.log(`\n## Afvisning: ${titel}\n${r.ok ? "IKKE AFVIST: " + JSON.stringify(r) : r.afvist}`);
        };
        await afvis("ukendt sti", {}, [{ type: "set", sti: "prices.olie.value", vaerdi_json: "1.0" }]);
        await afvis("dublet sti", { tidsgraense_s: 100 }, [{ type: "set", sti: "solver.time_limit", vaerdi_json: "200.0" }]);
        await afvis("tidsgrænse 7200", { tidsgraense_s: 7200 });
        await afvis("periode 400 døgn", { periode_start: "2025-01-01", periode_slut: "2026-02-04" });
        await afvis("ukendt flag", { ekstra_flag: "--rm-rf" });
        await afvis("ukendt enhed", {}, [{ type: "disable", sti: "kulkedel" }]);

        // 3) Kø-grænse: allerede 1 i kø (eller startet); fyld op og se den 4. afvist
        const køsvar = [];
        for (let i = 0; i < 4; i++) køsvar.push(await fn("startBestilling", { bestillingId: await bestil(await nytScenarie(`probe-kø-${i}`, {})) }));
        log("Kø-grænse (3 pr. bruger i 'koe')", køsvar.map((r) => r.ok ? `ok ${r.status}` : `afvist: ${r.afvist}`));

        // 4) Annullér én i kø
        const iKø = køsvar.find((r) => r.ok && r.status === "koe");
        if (iKø) log("annullerKoersel (koe)", await fn("annullerKoersel", { koerselId: iKø.koersel_id }));

        // 5) Ændringsanmodning: gyldig, derefter konflikt på gammel revision
        const anmod = async (forventet, liste) => (await client.data.Aendringsanmodning.create({
            vaerk_id: vaerkId, forventet_revision: forventet, aendringer_json: JSON.stringify(liste),
            anmodet_af: mig, anmodet: nu(), status: "ny",
        })).id;
        const v0 = (await alle("Vaerk", ["id", "revision"], { id: { eq: vaerkId } }))[0];
        log("udfoerAendring (gyldig)", await fn("udfoerAendring", { anmodningId: await anmod(v0.revision, [
            { sti: "prices.straw.value", handling: "ret", ny_json: "47.5" },
            { sti: "units.halmkedel.p_min_heat", handling: "opret", ny_json: "2.0" },
        ]) }));
        log("udfoerAendring (gammel revision -> afvist)", await fn("udfoerAendring", { anmodningId: await anmod(v0.revision, [
            { sti: "prices.straw.value", handling: "ret", ny_json: "99.0" },
        ]) }));
        log("udfoerAendring (opret under et blad -> afvist)", await fn("udfoerAendring", { anmodningId: await anmod(v0.revision + 1, [
            { sti: "prices.straw.value.x", handling: "opret", ny_json: "1.0" },
        ]) }));
        const logRækker = await alle("Aendringslog", ["revision", "sti", "handling", "gammel_json", "ny_json", "aendret_af"], { vaerk_id: { eq: vaerkId } });
        log("Aendringslog for testværket", logRækker);
        const efterRet = await alle("VaerkParameter", ["sti", "vaerdi_json", "aendret_af"], { vaerk_id: { eq: vaerkId } });
        log("prices.straw.value efter ret", efterRet.filter((p) => p.sti.startsWith("prices.straw") || p.sti.endsWith("p_min_heat")));

        // 6) Kopi af værk
        log("udfoerAendring (kopier_vaerk)", await fn("udfoerAendring", { anmodningId: await anmod(v0.revision + 1, [
            { handling: "kopier_vaerk", ny_kode: "probe_kopi", navn: "Kopi af testværk (probe)" },
        ]) }));

        // 7) Afstemning
        log("afstem", await fn("afstem"));
        const k = await alle("Koersel", ["id", "status", "fase", "forsoeg", "fabric_job_id"], { vaerk_id: { eq: vaerkId } });
        log("Testværkets kørsler", k);
    } else if (kommando === "rigtig") {
        // Ende-til-ende med den RIGTIGE arbejder: bestil en kort Andeby-kørsel (scenarie "probe-…",
        // så rydProberaekker kan fjerne den igen), følg status til sluttilstand, tæl resultaterne.
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
