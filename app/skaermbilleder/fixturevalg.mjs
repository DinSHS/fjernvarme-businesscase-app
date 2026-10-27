// Fixture-rækker ud fra INDHOLD, ikke ud fra én installations række-id'er (Codex K9 F3): et id i harnessens
// fixtures.json er en række i den database, udtrækket kom fra, og findes ikke i en anden installations udtræk.
// Demokørsler findes på demokode (viden/demo_scenarier.json › koersler: navn + værk) — samme nøgle som appens
// demoId (src/sider/analyser/sammensaetning.ts) — og øvrige rækker på deres egenskaber. Flere træffere: den først
// oprettede, så valget er stabilt. Ingen træffer: en fejl, der siger, hvad fixturen mangler.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const her = fileURLToPath(new URL(".", import.meta.url));

/** FJV_FIXTURES=<fil> eller harness/fixtures.json (hent_fixtures.mjs; aldrig i git). */
export function laesFixtures(sti = process.env.FJV_FIXTURES ?? resolve(her, "harness/fixtures.json")) {
    if (!existsSync(sti)) throw new Error(`Ingen fixture: ${sti} (sæt FJV_FIXTURES eller læg harnessen i skaermbilleder/harness)`);
    return JSON.parse(readFileSync(sti, "utf-8"));
}

/** Vælgere over en fixture. `demo` er demo_scenarier.json (standard: repoets egen). */
export function vaelger(fx, demo = JSON.parse(readFileSync(resolve(her, "../../viden/demo_scenarier.json"), "utf-8"))) {
    const kode = new Map(fx.Vaerk.map((v) => [v.id, v.kode]));
    const status = (s) => fx.Koersel.filter((k) => k.scenarie_id === s.id).map((k) => k.status);
    const først = (hvad, rækker) => {
        if (!rækker.length) throw new Error(`Fixturen har ${hvad} — ingen træffer`);
        return [...rækker].sort((a, b) => String(a.oprettet ?? a.uploadet ?? "").localeCompare(String(b.oprettet ?? b.uploadet ?? "")))[0];
    };
    const scenarie = (hvad, krav) => først(hvad, fx.Scenarie.filter((s) => krav({ ...s, vaerk: kode.get(s.vaerk_id), status: status(s) })));
    return {
        /** Scenariet bag en demokørsel (D01–D12): samme navn og værk som i demo_scenarier.json. */
        demo(id) {
            const d = demo.koersler.find((k) => k.id === id);
            if (!d) throw new Error(`Ukendt demokode ${id}`);
            return scenarie(`intet scenarie '${d.navn}' på ${d.vaerk_kode} (${id})`, (s) => s.navn === d.navn && s.vaerk === d.vaerk_kode);
        },
        scenarie,
        tidsserie: (hvad, krav) => først(hvad, fx.Tidsserie.filter((t) => krav({ ...t, vaerk: kode.get(t.vaerk_id) }))),
    };
}
