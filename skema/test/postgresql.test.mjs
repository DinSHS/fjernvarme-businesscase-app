// ddl/postgresql.sql KØRT i en rigtig PostgreSQL (PGlite = Postgres kompileret til WASM, i processen).
//
//   FJV_PGLITE=<mappe med node_modules/@electric-sql/pglite> node --test ../skema/test/postgresql.test.mjs
//   (installér én gang: npm install --prefix <mappe> @electric-sql/pglite@0.2.17)
//
// Uden FJV_PGLITE springes testen over MED en besked — det er ikke en bestået test. Samme tilfælde som
// sqlite-testen i test_skema.py (ddl_tilfaelde.json).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const rod = fileURLToPath(new URL("..", import.meta.url));
const skema = JSON.parse(readFileSync(join(rod, "skema.json"), "utf8"));
const T = JSON.parse(readFileSync(join(rod, "test", "ddl_tilfaelde.json"), "utf8"));
const NYT_ID = "f0f0f0f0-0000-4000-8000-000000000001";
const pgDir = process.env.FJV_PGLITE;

const skip = pgDir ? false : "FJV_PGLITE er ikke sat — postgresql-DDL'en er IKKE kørt (se filhovedet)";

async function db() {
    const { PGlite } = await import(pathToFileURL(join(pgDir, "node_modules", "@electric-sql", "pglite", "dist", "index.js")).href);
    const pg = new PGlite();
    await pg.exec(readFileSync(join(rod, "ddl", "postgresql.sql"), "utf8"));
    return pg;
}

const tabelAf = (e) => skema.tabeller.find((t) => t.entitet === e).tabel;

async function indsæt(pg, entitet, række) {
    const cols = Object.keys(række);
    const t = skema.tabeller.find((x) => x.entitet === entitet);
    // Et ikke-boolesk tal til en boolean-kolonne sendes som tekst, så det er SERVEREN, der afviser det
    // (PGlites klient afviser det selv, før Postgres ser det — det ville ikke teste DDL'en).
    const somTekst = (c) => t.kolonner.find((k) => k.navn === c)?.type === "boolean" && typeof række[c] === "number";
    await pg.query(
        `INSERT INTO "${t.tabel}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map((c, i) => (somTekst(c) ? `$${i + 1}::text::boolean` : `$${i + 1}`)).join(", ")})`,
        cols.map((c) => (somTekst(c) ? String(række[c]) : række[c])),
    );
}

const fysisk = (k) =>
    skema.typer[k.type].ddl.postgresql
        .replace("{max}", k.max).replace("{precision}", k.precision).replace("{scale}", k.scale)
        .replace("{laengste}", k.type === "set" ? Math.max(...k.vaerdier.map((v) => v.length)) : "");

test("postgresql: DDL'en kører, og kolonnerne er skemaets", { skip }, async () => {
    const pg = await db();
    const r = await pg.query(`SELECT table_name, column_name, data_type, character_maximum_length AS l, numeric_precision AS p,
        numeric_scale AS s, datetime_precision AS dp, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`);
    const navn = { "character varying": (x) => `VARCHAR(${x.l})`, uuid: () => "UUID", integer: () => "INTEGER", boolean: () => "BOOLEAN",
        numeric: (x) => `NUMERIC(${x.p},${x.s})`, "timestamp without time zone": (x) => `TIMESTAMP(${x.dp})` };
    for (const t of skema.tabeller) {
        const kol = r.rows.filter((x) => x.table_name === t.tabel);
        assert.deepEqual(kol.map((x) => x.column_name), t.kolonner.map((k) => k.navn), t.tabel);
        for (const [x, k] of kol.map((x, i) => [x, t.kolonner[i]])) {
            assert.equal(navn[x.data_type](x), fysisk(k), `${t.tabel}.${k.navn}`);
            assert.equal(x.is_nullable === "YES", k.nullable, `${t.tabel}.${k.navn} nullable`);
        }
    }
    assert.equal((await pg.query(`SELECT MAX(version) AS v FROM "_skema"`)).rows[0].v, skema.version);
    await pg.close();
});

test("postgresql: adfærd som ddl_tilfaelde.json", { skip }, async () => {
    const pg = await db();
    for (const [e, r] of Object.entries(T.gyldige)) await indsæt(pg, e, r);
    for (const t of T.tilfaelde) {
        const r = { ...T.gyldige[t.entitet], id: NYT_ID, ...t.saet };
        await pg.exec("BEGIN");
        let faktisk = "ok";
        try {
            await indsæt(pg, t.entitet, r);
        } catch (e) {
            // 23xxx = integritetsbrud; 22xxx = dataundtagelse (fx numeric overflow, 2 som boolean).
            if (!/^2[23]/.test(e.code ?? "")) throw e;
            faktisk = "afvist";
        }
        await pg.exec("ROLLBACK");
        const forventet = typeof t.forventet === "string" ? t.forventet : t.forventet.postgresql;
        assert.equal(faktisk, forventet, t.navn);
    }
    await pg.close();
});
