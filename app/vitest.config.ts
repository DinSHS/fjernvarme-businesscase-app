//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { defineConfig, configDefaults } from "vitest/config";
import { existsSync } from "node:fs";
import { resolve } from "path";
import { backendAlias, valgtBackend } from "./backend.config";

// Disse specs læser et LOKALT udtræk af en installations egen database (skaermbilleder/harness/fixtures.json; hent det med
// `node skaermbilleder/hent_fixtures.mjs <tokenfil>`). Filen er installationens data og ligger ikke i repoet — uden den springes
// specs'ene over, i stedet for at hele suiten fejler.
const FIXTURE_AFHAENGIGE = [
    "src/sider/konfiguration/k3.spec.ts", "src/sider/konfiguration/logik.spec.ts", "src/sider/konfiguration/nyt-vaerk.spec.ts",
    "src/sider/konfiguration/review.spec.ts", "src/sider/konfiguration/vaerker.spec.ts", "src/sider/scenarier/__tests__/historie.spec.ts",
];
const harFixture = existsSync(resolve(import.meta.dirname, "skaermbilleder/harness/fixtures.json"));
if (!harFixture) console.warn(`[vitest] ${FIXTURE_AFHAENGIGE.length} specs springes over: skaermbilleder/harness/fixtures.json findes ikke (installationens eget databaseudtræk).`);

export default defineConfig({
    test: {
        environment: "jsdom",
        setupFiles: ["src/test/setup.ts"],
        globals: true,
        // rayfin/functions/test: de betroede funktioners rene logik (node-miljø, se filhovedet).
        include: ["src/**/*.spec.{ts,tsx}", "rayfin/functions/test/**/*.spec.ts"],
        exclude: harFixture ? configDefaults.exclude : [...configDefaults.exclude, ...FIXTURE_AFHAENGIGE],
    },
    // Denne fil erstatter vite.config.ts under test — den arver ikke fra den.
    // Uden ES2022-target kan Oxc ikke parse TC39-decorators i rayfin/data/,
    // og entitets-testen fejler med "Invalid or unexpected token".
    oxc: {
        target: "es2022",
    },
    resolve: {
        // VITE_BACKEND=rest npx vitest run kører hele suiten mod rest-mappen (gaten kører begge).
        alias: [backendAlias(import.meta.dirname, valgtBackend()), { find: "@", replacement: resolve(import.meta.dirname, "src") }],
    },
});
