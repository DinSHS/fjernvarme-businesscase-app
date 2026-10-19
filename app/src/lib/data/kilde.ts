//-----------------------------------------------------------------------
// DataKilde — den ene grænseflade mellem datalaget og en backend.
//
// To implementeringer, valgt ved build (VITE_BACKEND, se vite.config.ts):
//   rayfin  src/backend/rayfin/  — Fabric App: Rayfin-klienten (DAB/GraphQL + Functions), Entra-login
//   rest    src/backend/rest/    — community-udgaven: fjernvarme_app's REST-API (community/API.md)
//
// Formen er Rayfin-klientens (data[E].select/where/orderBy/first/after/executePaginated,
// create/update/delete, functions[F].invoke), så hooks.ts og skriv.ts er de SAMME i begge
// udgaver. Siderne ser aldrig en DataKilde — de bruger hooks og skrivehjælpere.
//-----------------------------------------------------------------------

/** En sideopdelt forespørgsel (Rayfins bygger). `first`/`after` sættes af `hentAlle`. */
export interface Forespørgsel<T = Record<string, unknown>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where(filter: Record<string, any>): Forespørgsel<T>;
    orderBy(sortering: Record<string, "asc" | "desc">): Forespørgsel<T>;
    first(n: number): Forespørgsel<T>;
    after(markør: string): Forespørgsel<T>;
    executePaginated(): Promise<{ items: T[]; hasNextPage: boolean; endCursor?: string | null }>;
}

export interface EntitetsKilde {
    select(felter: readonly string[]): Forespørgsel;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(række: any): Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update(hvor: { id: string }, data: any): Promise<any>;
    delete(hvor: { id: string }): Promise<unknown>;
}

export interface FunktionsKilde {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    invoke(input?: any, valg?: { timeoutMs?: number }): Promise<any>;
}

export interface DataKilde {
    data: Record<string, EntitetsKilde>;
    functions: Record<string, FunktionsKilde>;
}

/**
 * En afvisning fra en backend, der svarer med en fejlkode (rest-adapteren). `oversætFejl` i skriv.ts gør den
 * til den samme `Afvist`, som Rayfins DAB-tekster giver, så siderne ikke kan se forskel på udgaverne.
 * Koderne er community/API.md › Fejl. `netvaerk` = serveren svarede ikke; `ukendt` = et svar uden (kendt) fejlkode,
 * fx 502 fra en proxy.
 */
export type Fejlkode = "policy" | "unik" | "ikke_tilladt" | "ugyldig" | "findes_ikke" | "teknisk" | "netvaerk" | "ukendt";

export class KildeFejl extends Error {
    constructor(readonly kode: Fejlkode, besked: string, readonly status = 0) {
        super(besked);
        this.name = "KildeFejl";
    }
}

/** Den del af en session appen bruger. Rayfins `OpaqueSession` opfylder den; rest-udgaven bygger den fra `/api/session`. */
export interface Session {
    isAuthenticated: boolean;
    user: { email?: string | null } | null;
}
