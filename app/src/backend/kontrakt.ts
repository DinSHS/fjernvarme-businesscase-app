//-----------------------------------------------------------------------
// Hvad hver backend-mappe (src/backend/rayfin/, src/backend/rest/) skal levere.
//
// `@/backend/<modul>` peger ved build på den valgte mappe (vite.config.ts, VITE_BACKEND);
// tsc ser rayfin-mappen gennem tsconfig's paths, og begge mapper typetjekkes mod disse
// typer med `satisfies` — så de to udgaver ikke kan glide fra hinanden.
//
// Begge filer i en mappe skal kunne importeres uden sideeffekter: intet her må læse
// miljøvariabler eller kontakte en server, før en funktion kaldes.
//-----------------------------------------------------------------------

import type { DataKilde, Session } from "@/lib/data/kilde";
import type { TemaFil } from "@/styles/tema-kerne";

export type Backendnavn = "rayfin" | "rest";

/** Login. Svarer `null`, når der ikke kan skaffes en session (fx appen åbnet uden for Fabric-portalen). */
export interface AuthService {
    initEmbeddedAuth(): Promise<Session | null>;
}

/** Tekster i skallen, der afhænger af udgaven (Fabric-portal vs. lokal server). */
export interface Udgavetekster {
    forbinder: string;
    ikkeLoggetIndTitel: string;
    ikkeLoggetIndTekst: string;
    /** Foran fejlteksten, når `afstem` fejler. */
    afstemFejl: string;
    /** Tooltip på "Opdatér". */
    opdaterTitel: string;
}

export interface DataModul {
    BACKEND: Backendnavn;
    hentDataKilde(): DataKilde;
}

export interface AuthModul {
    bootstrapAuth(): AuthService;
    UDGAVETEKSTER: Udgavetekster;
    /**
     * Henter appen forfra, så login (og den statiske værts session) etableres igen. Kaldes fra et KLIK
     * (topnavigation fra en iframe kræver en brugerhandling). Rayfin indlejret: hele portalsiden; ellers reload.
     */
    genindlaesApp(): void;
}

export interface TemaModul {
    /** Temaer ud over de neutrale i src/styles/temaer/*.json: Fabric = privat/ (lokale, git-ignorerede; det med højest `standard` er standard), rest = ingen. */
    UDGAVETEMAER: readonly TemaFil[];
}

export interface FejlModul {
    /** Gør en læsefejl brugbar for brugeren (Rayfin: sessionsfejl og pluralis-diagnose; rest: uændret). */
    berigFejl(fejl: unknown): Promise<Error>;
}
