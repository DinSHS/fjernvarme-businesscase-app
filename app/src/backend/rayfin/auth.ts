//-----------------------------------------------------------------------
// Fabric-udgaven: Entra-login via portalens handoff (services/rayfin-auth.service.ts).
//-----------------------------------------------------------------------

import { bootstrapAuth as bootstrapRayfin } from "@/services/rayfin-auth.service";
import type { AuthService, Udgavetekster } from "../kontrakt";

export function bootstrapAuth(): AuthService {
    return bootstrapRayfin();
}

/**
 * Den statiske vært er beskyttet af cookien `__Host-rayfin_sh_sid`, som KUN portalen kan forny (et handoff, når
 * den opretter iframen). En `location.reload()` inde i iframen ender på værtens login-side, der venter på et
 * popup-handoff og hænger på "Loading" (målt 2026-10-19 i headless Edge). Derfor genindlæses hele portalsiden:
 * top-navigation fra en krydsoprindelses-iframe er tilladt ved en brugerhandling (knappen). Udenfor portalen
 * (direkte link) er en almindelig genindlæsning rigtig — værten viser selv sin login-side.
 */
export function genindlaesApp(): void {
    const portal = (import.meta.env.VITE_FABRIC_PORTAL_URL ?? "https://app.fabric.microsoft.com").replace(/\/+$/, "");
    const ws = import.meta.env.VITE_FABRIC_WORKSPACE_ID;
    const item = import.meta.env.VITE_FABRIC_ITEM_ID;
    const indlejret = (() => { try { return window.top !== window.self; } catch { return true; } })();
    if (indlejret && ws && item) {
        try {
            window.top!.location.href = `${portal}/groups/${ws}/appbackends/${item}`;
            return;
        } catch { /* blokeret: falder tilbage til iframen */ }
    }
    window.location.reload();
}

export const UDGAVETEKSTER: Udgavetekster = {
    forbinder: "Forbinder til Fabric…",
    ikkeLoggetIndTitel: "Appen kan kun åbnes i Fabric-portalen",
    ikkeLoggetIndTekst: "Åbn »Fjernvarme Businesscase« fra workspacet »dit Fabric-workspace« i Fabric.",
    afstemFejl: "Kørslerne kunne ikke afstemmes med Fabric",
    opdaterTitel: "Afstem kørsler med Fabric og hent alle data igen",
};
