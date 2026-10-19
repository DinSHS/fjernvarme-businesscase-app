// rayfin_analyse.mjs — Rayfins EGEN læsning af entiteterne i app/rayfin/data/*.ts, som JSON.
//
// Oraklet for overensstemmelsestesten (skema/test/rayfin.test.mjs): ikke en regex over kildeteksten,
// men den kæde `rayfin up db apply` bruger — TypeScript-compileren transpilerer entiteterne
// (TC39-decorators), modulerne importeres, så decoratorerne registrerer deres metadata, og
// `SchemaAnalyzer` + `ConfigGenerator` fra @microsoft/rayfin-core læser dem. Resultatet er
// kolonnetyper for mssql OG postgresql, nullability, PK/unik, CHECK-udtryk og DAB-rettigheder.
// Målt 2026-10-16: for alle 15 entiteter byte-identisk med den dab-config.json, CLI'en selv skrev
// ved deployet kl. 17:37.
//
//   cd app && node ../skema/vaerktoej/rayfin_analyse.mjs [udfil.json]
//
// Kræver app/node_modules (npm install i app/). Transpilerede filer skrives i
// app/node_modules/.cache/fjv-skema/<n>/ (aldrig i rayfin/.temp, som tilhører Rayfin-CLI'en), fordi
// de bare specifiers ('@microsoft/rayfin-core') kun kan opløses fra et sted under app/node_modules.
// Ingen netværk, ingen Fabric.

import { createRequire } from "node:module";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const her = fileURLToPath(new URL(".", import.meta.url));
export const APP = resolve(process.env.FJV_APP_DIR ?? join(her, "..", "..", "app"));

let løbenr = 0;

/**
 * @param {{ app?: string, dataDir?: string }} valg  `dataDir` = entitetsmappen (standard app/rayfin/data);
 *        en anden mappe bruges af testens negative kontrol.
 */
export async function rayfinAnalyse({ app = APP, dataDir } = {}) {
    const kravAf = createRequire(join(app, "package.json"));
    const ts = kravAf("typescript");
    const kilde = dataDir ?? join(app, "rayfin", "data");
    // Ny mappe pr. kald: ESM-modulcachen er pr. URL, så en genbrugt sti ville give det forrige resultat.
    const ud = join(app, "node_modules", ".cache", "fjv-skema", `${process.pid}-${løbenr++}`);
    rmSync(ud, { recursive: true, force: true });
    mkdirSync(ud, { recursive: true });
    try {
        const filer = readdirSync(kilde).filter((f) => f.endsWith(".ts")).sort();
        for (const f of filer) {
            const r = ts.transpileModule(readFileSync(join(kilde, f), "utf8"), {
                fileName: f,
                reportDiagnostics: true,
                compilerOptions: {
                    // Som Rayfin-CLI'ens kompilering (rayfin/tsconfig.json): ES2022, TC39-decorators.
                    target: ts.ScriptTarget.ES2022,
                    module: ts.ModuleKind.ESNext,
                    experimentalDecorators: false,
                    useDefineForClassFields: true,
                },
            });
            const fejl = (r.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
            if (fejl.length) throw new Error(`${f}: ${fejl.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")).join("; ")}`);
            writeFileSync(join(ud, f.replace(/\.ts$/, ".js")), r.outputText);
        }

        // Pakken eksporterer kun "import"-betingelsen, så require.resolve kan ikke bruges. Samme fil-URL som
        // entiteternes '@microsoft/rayfin-core' opløses til = samme modulinstans (samme metadata-symboler).
        const kerne = join(app, "node_modules", "@microsoft", "rayfin-core", "dist");
        const analyse = await import(pathToFileURL(join(kerne, "analysis", "index.js")).href);
        const skemaMod = await import(pathToFileURL(join(kerne, "schema.js")).href);

        // Samme indsamling som CLI'ens dab-config-generator: alle eksporter, der er Rayfin-entiteter.
        const fundne = {};
        for (const f of filer) {
            const mod = await import(pathToFileURL(join(ud, f.replace(/\.ts$/, ".js"))).href);
            for (const [navn, v] of Object.entries(mod)) if (skemaMod.isRayfinEntity(v)) fundne[navn] = v;
        }

        const resultat = { kilde: "app/rayfin/data/*.ts via @microsoft/rayfin-core SchemaAnalyzer", filer, dialekter: {} };
        for (const dialekt of ["mssql", "postgresql"]) {
            const entiteter = new analyse.SchemaAnalyzer(Object.values(fundne), dialekt, { log: () => {} }).analyzeEntities();
            const dab = new analyse.ConfigGenerator(dialekt).generateConfig(entiteter);
            resultat.dialekter[dialekt] = {
                entiteter: entiteter.map((e) => ({
                    entitet: e.name,
                    tabel: e.tableName,
                    rettigheder: e.permissions,
                    felter: e.fields.map((x) => ({
                        navn: x.name,
                        dbType: x.dbType,
                        nullable: x.nullable,
                        pk: x.primaryKey,
                        unik: x.unique,
                        check: x.checkConstraint ?? null,
                        relation: x.isRelationship,
                        // Decoratorens egne argumenter (max/min/optional/enum) — det, kildeteksten SIGER.
                        meta: x.originalFieldMetadata ?? null,
                    })),
                })),
                dab: dab.entities,
            };
        }
        return resultat;
    } finally {
        rmSync(ud, { recursive: true, force: true });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const r = await rayfinAnalyse();
    const tekst = JSON.stringify(r, null, 2);
    if (process.argv[2]) writeFileSync(process.argv[2], tekst);
    else process.stdout.write(tekst);
}
