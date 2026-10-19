//-----------------------------------------------------------------------
// Valget af backend ved build: VITE_BACKEND=rayfin|rest (standard rayfin) — brief 21, arkitektur 1.
//
// `@/backend/<modul>` peges på src/backend/<backend>/<modul>.ts. Det er et ALIAS og ikke en
// `if` i koden: en rest-bundle må hverken indeholde Rayfin-SDK'et eller Fabric-id'er, og det kan
// kun garanteres ved, at modulerne aldrig importeres. tsconfig.json ser rayfin-mappen (paths);
// src/backend/tjek.ts typetjekker begge mod src/backend/kontrakt.ts.
//
// Bruges af vite.config.ts, vitest.config.ts og vite.skaerm.config.ts.
//-----------------------------------------------------------------------

import { resolve } from "path";

export type Backend = "rayfin" | "rest";

export function valgtBackend(mode?: string): Backend {
    const v = process.env.VITE_BACKEND ?? (mode === "community" ? "rest" : "rayfin");
    if (v !== "rayfin" && v !== "rest") {
        throw new Error(`VITE_BACKEND skal være "rayfin" eller "rest", ikke "${v}".`);
    }
    return v;
}

/** Aliaset; skal stå FØR `@`-aliaset, ellers vinder det generelle. */
export function backendAlias(rod: string, backend: Backend) {
    return { find: /^@\/backend\/(data|auth|fejl|temaer)$/, replacement: resolve(rod, `src/backend/${backend}/$1.ts`) };
}
