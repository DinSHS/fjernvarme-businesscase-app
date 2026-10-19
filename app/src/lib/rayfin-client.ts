//-----------------------------------------------------------------------
// Den ene RayfinClient i appen: data (DAB/GraphQL) + Functions.
//
// Brug den ALDRIG direkte fra en side — gå gennem src/lib/data/ (hooks,
// læsning med normalisering og paginering, betroede skrivninger). Se AGENTS.md.
//-----------------------------------------------------------------------

import { RayfinClient } from "@microsoft/rayfin-client";
import type { FjvSchema } from "../../rayfin/data/schema";
import type { AppFunctionsSchema } from "../../rayfin/functions/src/types";

// Klient og server pluraliserer entitetsnavnet med to FORSKELLIGE biblioteker
// (JS `pluralize` / DAB i .NET). Målt 2026-10-16 med scripts/probe.mjs: for alle
// 12 entiteter er de enige (bare et "s"), så der registreres ingen
// `EntityNameResolver.setCustomPlural(...)`. Tilføjes en entitet, så kør
// `node scripts/probe.mjs <token> lister` efter deploy.

/**
 * Klient med én tilføjelse: adgang til at udskifte ApiClients
 * fornyelses-callback (se `session-fornyelse.ts`). `apiClient` er `protected`,
 * så en subklasse er den eneste type-lovlige vej ind.
 */
export class FabricRayfinClient extends RayfinClient<FjvSchema, AppFunctionsSchema> {
    /** Sætter callbacken ApiClient kalder ved 401 før den prøver kaldet igen. */
    installerSessionsfornyer(fornyer: () => Promise<void>): void {
        this.apiClient.setRefreshCallback(fornyer);
    }
}

let _client: FabricRayfinClient | undefined;

export function getRayfinClient(): FabricRayfinClient {
    if (!_client) {
        const apiUrl = import.meta.env.VITE_RAYFIN_API_URL;
        const publishableKey = import.meta.env.VITE_RAYFIN_PUBLISHABLE_KEY;

        if (!apiUrl || !publishableKey) {
            throw new Error(`Missing required env vars for creating rayfin client - run 'npx rayfin up'`);
        }

        _client = new FabricRayfinClient({
            baseUrl: apiUrl,
            publishableKey,
            authStorage: true,
        });
    }

    return _client;
}
