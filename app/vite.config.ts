//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type PluginOption } from "vite";
import { backendAlias, valgtBackend } from "./backend.config";
import license from "rollup-plugin-license";

import { resolve } from 'path';

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// Dev-only middleware: makes the local Vite server compatible with browsers that
// enforce Local Network Access (LNA) checks when a public origin (the Fabric portal)
// embeds an iframe pointing at http://localhost. Sets the LNA opt-in response header
// on every response and short-circuits the corresponding preflight OPTIONS request.
// This is required for fetch/XHR subresources from the embedded app — top-level
// iframe navigations additionally require launching Chromium with the
// `--disable-features=...LocalNetworkAccessChecks` flag (see .playwright-config.json).
const localNetworkAccessPlugin: PluginOption = {
  name: 'local-network-access-headers',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      if (req.method === 'OPTIONS' && req.headers['access-control-request-private-network']) {
        const origin = req.headers.origin || '*';
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
        res.statusCode = 204;
        res.end();
        return;
      }
      next();
    });
  },
};

// https://vite.dev/config/
// `npm run build` = Fabric-udgaven (rayfin) til dist/; `npm run build:community` = rest-udgaven til dist-rest/.
export default defineConfig(({ mode }) => {
  const backend = valgtBackend(mode);
  // Rest-udgaven får sin egen mappe, så den aldrig kan blive det, `rayfin up` deployer.
  const outDir = resolve(projectRoot, backend === 'rest' ? 'dist-rest' : 'dist');
  return {
    plugins: [
        react(),
        tailwindcss(),
        localNetworkAccessPlugin,
    ],
    resolve: {
        alias: [
            backendAlias(projectRoot, backend),
            { find: '@', replacement: resolve(projectRoot, 'src') },
        ],
    },
    // Vite 8 transformerer med Oxc, ikke esbuild — `esbuild:` er deprecated og
    // ignoreres. Sæt derfor målniveauet her.
    //
    // Bemærk: Oxc kan IKKE transformere TC39 Stage 3-decorators (og
    // @vitejs/plugin-react-swc har `decorators: false` som standard). Derfor må
    // rayfin/data/Kontraktnote.ts og Afklaring.ts kun importeres med `import type` fra
    // src/ — ellers ender rå `@entity(`-syntaks i bundlen og appen fejler med
    // SyntaxError i browseren. Fælles værdier ligger i
    // rayfin/data/afregning.constants.ts, som er decorator-fri.
    oxc: {
        target: 'es2022',
    },
    optimizeDeps: {
        include: ['@microsoft/fabric-visuals-core'],
        rolldownOptions: {
            transform: {
                target: 'es2022',
            },
        },
    },
    build: {
        outDir,
        emptyOutDir: true,
        // Al CSS i ÉN fil, der hentes ved start. Fabrics statiske vært svarer CSS med `no-store` (JS med
        // `immutable`), så en områdes-CSS hentes igen ved HVERT besøg og fejler, når værtens session er udløbet
        // — også i et område, man allerede har set (målt 2026-10-19). 60 kB i alt; én fil fjerner fejlpunktet.
        cssCodeSplit: false,
        target: 'es2022',
        commonjsOptions: {
            include: [/node_modules/],
        },
        rollupOptions: {
            plugins: [
                license({
                    thirdParty: {
                        multipleVersions: true,
                        output: {
                            file: resolve(outDir, 'THIRD_PARTY_NOTICES.txt'),
                            template(dependencies) {
                                if (dependencies.length === 0) {
                                    return 'No third-party dependencies.';
                                }
                                return (
                                    'This file was auto-generated at build time.\n\n' +
                                    dependencies
                                        .map((dep) => {
                                            const lines = [
                                                `${dep.name}@${dep.version}`,
                                                `License: ${dep.license || 'UNKNOWN'}`,
                                            ];
                                            if (dep.author) {
                                                lines.push(`Author: ${typeof dep.author === 'string' ? dep.author : dep.author.text()}`);
                                            }
                                            if (dep.noticeText) {
                                                lines.push('', 'NOTICE:', dep.noticeText.trim());
                                            }
                                            if (dep.licenseText) {
                                                lines.push('', dep.licenseText.trim());
                                            }
                                            return lines.join('\n');
                                        })
                                        .join('\n\n' + '='.repeat(60) + '\n\n')
                                );
                            },
                        },
                    },
                }),
            ],
        },
    },
  };
});
