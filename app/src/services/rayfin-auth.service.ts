//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type { OpaqueSession } from "@microsoft/rayfin-auth";
import {
    embeddedFabricLogin,
    initEmbeddedAuth as sdkInitEmbeddedAuth,
    type FabricAuthOptions,
} from "@microsoft/rayfin-auth-provider-fabric";
import { getRayfinClient } from "@/lib/rayfin-client";
import { opretSessionsfornyer } from "@/lib/session-fornyelse";

export interface IAuthService {
    /**
     * Try to acquire a session via the embedded (iframe) Fabric flow
     * without any UI. Returns `null` when not running inside a Fabric
     * iframe — the {@link AuthGate} renders the "not embedded" notice in
     * that case.
     */
    initEmbeddedAuth(): Promise<OpaqueSession | null>;
}

/**
 * Read `VITE_*` env vars and construct the auth service used by the app.
 *
 * Called from `main.tsx` at module init — **before** React mounts. If
 * any required env var is missing this throws synchronously, the SPA
 * never boots, and the user sees the static `<noscript>` fallback in
 * `index.html`. That is intentional: a Fabric-embedded app with no
 * usable Rayfin or Fabric config has nothing to render.
 *
 * Required vars:
 * - `VITE_RAYFIN_API_URL` — Rayfin API base URL (e.g. `http://localhost:5168`)
 * - `VITE_RAYFIN_PUBLISHABLE_KEY` — Rayfin publishable key (`pk-...`)
 * - `VITE_FABRIC_WORKSPACE_ID` — Fabric workspace ID
 * - `VITE_FABRIC_ITEM_ID` — Fabric item ID
 * - `VITE_FABRIC_PORTAL_URL` — Fabric portal base URL
 */
export function bootstrapAuth(): IAuthService {
    const client = getRayfinClient();

    const workspaceId = import.meta.env.VITE_FABRIC_WORKSPACE_ID;
    const projectId = import.meta.env.VITE_FABRIC_ITEM_ID;
    const fabricPortalUrl = import.meta.env.VITE_FABRIC_PORTAL_URL;

    if (
        !workspaceId ||
        !projectId ||
        !fabricPortalUrl
    ) {
        throw new Error(`Missing required env vars for Fabric auth - run 'npx rayfin up'`);
    }

    const fabricOptions: FabricAuthOptions = {
        workspaceId,
        projectId,
        fabricPortalUrl,
        returnOrigin: window.location.origin,
    };

    const service = new RayfinAuthService(client, fabricOptions);

    // Erstat SDK'ens fornyelses-callback. Dens egen gør INTET når der ikke er
    // noget refresh-token, hvorefter ApiClient prøver kaldet igen med samme
    // døde token og relabeler 401'et til »Authentication failed after token
    // refresh«. Uden dette dør appen ved tokenets udløb og kan først bruges
    // igen efter en genindlæsning af iframen. Se `session-fornyelse.ts`.
    //
    // Callbacken dækker BÅDE læsninger og skrivninger: `RayfinClientBase` giver
    // `createDataApi` den samme ApiClient som `auth` er hængt på.
    client.installerSessionsfornyer(service.fornySession);

    return service;
}

/**
 * Auth service that wraps the Fabric brokered authentication SDK
 * (`@microsoft/rayfin-auth-provider-fabric`).
 */
class RayfinAuthService implements IAuthService {
    /**
     * Sættes når vi første gang HAR haft en gyldig session. Er den falsk,
     * kører vi ikke indlejret i portalen (den eneste vej til en session), og
     * så er der ingen forælder at lave handoff med — `requestHandoff` ville
     * blot vente sine 30 s ud og kaste.
     */
    private harHaftSession = false;

    constructor(
        private readonly client: ReturnType<typeof getRayfinClient>,
        private readonly fabricOptions: FabricAuthOptions,
    ) {}

    async initEmbeddedAuth(): Promise<OpaqueSession | null> {
        const session = await sdkInitEmbeddedAuth(this.client.auth, this.fabricOptions);
        if (session?.isAuthenticated) this.harHaftSession = true;
        return session;
    }

    /**
     * Fornyer sessionen. Sidder som ApiClients 401-callback, så den kaldes
     * uden om React — et gem der rammer et udløbet token bliver forsøgt igen
     * med et friskt, og brugeren ser ingenting.
     *
     * Feltinitialiseret arrow, ikke en metode: den gives videre som
     * funktionsreference til `installerSessionsfornyer`, og en metode ville
     * miste sin `this`.
     *
     * Der bruges `embeddedFabricLogin` og IKKE `initEmbeddedAuth`. Sidstnævnte
     * prøver først `tryResumeSession`, som returnerer den nuværende session
     * hvis `isAuthenticated` er sand — og et 401 betyder netop at det token
     * serveren afviste er det vi selv tror på. Genbrug ville give samme fejl
     * igen. `embeddedFabricLogin` fremtvinger en ny handoff.
     */
    readonly fornySession = opretSessionsfornyer({
        harHaftSession: () => this.harHaftSession,
        harRefreshToken: () => this.client.auth.hasRefreshToken(),
        fornyMedRefreshToken: async () => { await this.client.auth.refreshSession(); },
        handoff: () => embeddedFabricLogin(this.client.auth, this.fabricOptions),
        erAutentificeret: () => this.client.auth.getSession().isAuthenticated,
        nu: () => Date.now(),
    });
}