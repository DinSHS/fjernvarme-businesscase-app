//-----------------------------------------------------------------------
// Community-udgaven: intet login i browseren. Serveren afgør brugeren og svarer på GET /api/session
// med { bruger, udgave, version, skemaversion }:
//   - lokalt er brugeren en konfigurationsværdi i serveren (én bruger pr. installation);
//   - bag en reverse proxy, der selv logger ind, kan serveren tage e-mailen fra en header
//     (se community/README.md). Appen gør det samme i begge tilfælde: den viser og bruger det,
//     serveren siger — skrivninger tjekkes igen på serveren (samme regel som DAB's create-policy).
// Multi-bruger med eget login er ikke bygget.
//-----------------------------------------------------------------------

import type { Session } from "@/lib/data/kilde";
import type { AuthService, Udgavetekster } from "../kontrakt";
import { KildeFejl } from "@/lib/data/kilde";
import { kaldApi } from "./data";

export interface Sessionsinfo {
    bruger: string | null;
    udgave: string;
    version?: string;
    skemaversion?: number;
}

let info: Sessionsinfo | null = null;

/** Det serveren sagde ved opstart (null før login er afsluttet). Til "Om og kredit" og fejlsøgning. */
export function sessionsinfo(): Sessionsinfo | null {
    return info;
}

export async function hentSession(): Promise<Session | null> {
    let svar: Partial<Sessionsinfo> | null;
    try {
        svar = await kaldApi("GET", "/api/session") as Partial<Sessionsinfo> | null;
    } catch (e) {
        // 401: serveren tager brugeren fra en proxy-header, og den mangler (API.md) -> porten forklarer det.
        if (e instanceof KildeFejl && e.status === 401) { info = null; return null; }
        throw e;
    }
    const bruger = typeof svar?.bruger === "string" && svar.bruger.trim() ? svar.bruger.trim() : null;
    info = { bruger, udgave: String(svar?.udgave ?? "community"), version: svar?.version, skemaversion: svar?.skemaversion };
    return bruger ? { isAuthenticated: true, user: { email: bruger } } : null;
}

export function bootstrapAuth(): AuthService {
    return { initEmbeddedAuth: hentSession };
}

/** Lokalt er der ingen udløbende værtssession; en almindelig genindlæsning henter de nye filer. */
export function genindlaesApp(): void {
    window.location.reload();
}

export const UDGAVETEKSTER: Udgavetekster = {
    forbinder: "Forbinder til serveren…",
    ikkeLoggetIndTitel: "Serveren kender ingen bruger",
    ikkeLoggetIndTekst: "Start fjernvarme_app med en bruger (se README › Bruger), eller sæt brugerens e-mail i proxyens header.",
    afstemFejl: "Kørslerne kunne ikke afstemmes med den lokale arbejder",
    opdaterTitel: "Afstem kørsler og hent alle data igen",
};
