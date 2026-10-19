// Overensstemmelse: skema/skema.json mod Rayfin-entiteterne i app/rayfin/data/*.ts.
//
//   cd app && node --test ../skema/test/
//
// Oraklet er Rayfins egen SchemaAnalyzer (vaerktoej/rayfin_analyse.mjs), ikke en regex. Fejler, hvis
// nogen ændrer en entitet uden skema.json eller omvendt — kolonnenavne, typer, max/min, nullable, sæt,
// precision/scale, unik, CHECK-udtryk og rettigheder, for både mssql og postgresql.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { APP, rayfinAnalyse } from "../vaerktoej/rayfin_analyse.mjs";
import { forskelle } from "../vaerktoej/sammenlign.mjs";

const SKEMA = fileURLToPath(new URL("../skema.json", import.meta.url));
const skema = JSON.parse(readFileSync(SKEMA, "utf8"));
const analyse = await rayfinAnalyse();

test("Rayfin finder alle entiteter i begge dialekter", () => {
    for (const d of ["mssql", "postgresql"]) assert.equal(analyse.dialekter[d].entiteter.length, skema.tabeller.length, d);
});

test("skema.json og app/rayfin/data er enige", () => {
    assert.deepEqual(forskelle(skema, analyse), []);
});

test("DAB-skemaet Rayfin genererer har præcis skema.json's kolonner og nullability", () => {
    // Det DAB faktisk bygger sit GraphQL-skema af (x-schema) — en uafhængig vej ud af analysen.
    for (const t of skema.tabeller) {
        const xs = analyse.dialekter.mssql.dab[t.entitet]["x-schema"].fields;
        assert.deepEqual(Object.keys(xs), t.kolonner.map((k) => k.navn), t.entitet);
        for (const k of t.kolonner) assert.equal(xs[k.navn].nullable, k.nullable, `${t.entitet}.${k.navn}`);
    }
});

// --- negative kontroller: testen skal kunne fejle

test("NEGATIV: et ændret max i skema.json opdages", () => {
    const kopi = structuredClone(skema);
    kopi.tabeller.find((t) => t.entitet === "Koersel").kolonner.find((k) => k.navn === "fase").max = 201;
    const f = forskelle(kopi, analyse);
    assert.ok(f.some((x) => x.includes("Koersel.fase") && x.includes("NVARCHAR(201)")), f.join("\n"));
});

test("NEGATIV: en ny sæt-værdi, en anden nullability og en fjernet policy opdages", () => {
    const kopi = structuredClone(skema);
    const k = kopi.tabeller.find((t) => t.entitet === "Koersel");
    k.kolonner.find((c) => c.navn === "status").vaerdier.push("pause");
    k.kolonner.find((c) => c.navn === "fase").nullable = false;
    kopi.tabeller.find((t) => t.entitet === "Bestilling").klient.create = true;
    const f = forskelle(kopi, analyse).join("\n");
    assert.match(f, /Koersel\.status: type NVARCHAR\(10\)|Koersel\.status: CHECK/);
    assert.match(f, /Koersel\.fase: nullable false/);
    assert.match(f, /Bestilling: rettigheder/);
});

test("NEGATIV: en ændret entitet (kilden) opdages", async () => {
    // En kopi af app/rayfin/data med ét felt ændret, analyseret af Rayfin — som hvis nogen glemte skema.json.
    const tmp = mkdtempSync(join(tmpdir(), "fjv-skema-"));
    try {
        cpSync(join(APP, "rayfin", "data"), tmp, { recursive: true });
        const fil = join(tmp, "Vaerk.ts");
        const før = readFileSync(fil, "utf8");
        const efter = før.replace("@text({ max: MAKS.kilde_fil, optional: true }) kilde_fil?: string;",
            "@text({ max: MAKS.kilde_fil, optional: true }) kilde_fil?: string;\n\n    @int({ optional: true }) ny_kolonne?: number;");
        assert.notEqual(efter, før, "ankeret i Vaerk.ts er flyttet — ret testen");
        writeFileSync(fil, efter);
        const f = forskelle(skema, await rayfinAnalyse({ dataDir: tmp }));
        assert.ok(f.some((x) => x.includes("Vaerk: kolonner") && x.includes("ny_kolonne")), f.join("\n"));
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
});
