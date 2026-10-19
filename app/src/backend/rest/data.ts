//-----------------------------------------------------------------------
// Community-udgaven: datakilden er fjernvarme_app's REST-API (community/API.md, ejet af fv-server).
//
// Samme form som Rayfin-klienten (src/lib/data/kilde.ts), så hooks og skrivehjælpere er uændrede:
//   GET    /api/data/<Entitet>?filter=<json>&orderBy=<json>&first=<n>&after=<markør>&fields=<a,b>
//            -> { items, hasNextPage, endCursor }
//   POST   /api/data/<Entitet>           (rækken)       -> den oprettede række
//   PATCH  /api/data/<Entitet>/<id>      (felterne)     -> den rettede række
//   DELETE /api/data/<Entitet>/<id>                     -> { id }
//   POST   /api/fn/<navn>                (input)        -> Functionens output
// Fejl: 4xx/5xx med { fejl: { kode, besked } } -> KildeFejl(kode, besked).
//
// Filteret gives videre UÆNDRET (Rayfin/DAB-grammatikken, community/fjernvarme_app/filter.py).
// `select(felter)` sendes som `fields` (samme udvalg som mod DAB). normaliser() er harmløs på
// rigtige JSON-typer (ingen "sniffing" at rette).
//-----------------------------------------------------------------------

import { KildeFejl, type DataKilde, type EntitetsKilde, type Forespørgsel, type FunktionsKilde, type Fejlkode } from "@/lib/data/kilde";
import type { Backendnavn } from "../kontrakt";

export const BACKEND: Backendnavn = "rest";

const KODER: readonly Fejlkode[] = ["policy", "unik", "ikke_tilladt", "ugyldig", "findes_ikke", "teknisk"];

/** Grundadressen; tom = samme oprindelse som siden (serveren serverer selv frontenden). */
export function grundadresse(): string {
    return (import.meta.env.VITE_REST_URL ?? "").replace(/\/+$/, "");
}

type Fetch = typeof fetch;
let hent: Fetch = (...a) => fetch(...a);

/** Kun til tests: erstat fetch. */
export function sætFetch(f: Fetch | null): void {
    hent = f ?? ((...a) => fetch(...a));
}

/** Ét kald mod API'et. Svaret er JSON; et fejlsvar bliver en KildeFejl med serverens danske besked. */
export async function kaldApi(metode: string, sti: string, krop?: unknown, timeoutMs?: number): Promise<unknown> {
    const adresse = `${grundadresse()}${sti}`;
    const afbryd = timeoutMs ? new AbortController() : undefined;
    const ur = afbryd ? setTimeout(() => afbryd.abort(), timeoutMs) : undefined;
    let svar: Response;
    try {
        svar = await hent(adresse, {
            method: metode,
            headers: krop === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
            body: krop === undefined ? undefined : JSON.stringify(krop),
            credentials: "same-origin",
            signal: afbryd?.signal,
        });
    } catch (e) {
        const tid = afbryd?.signal.aborted ? ` inden for ${Math.round((timeoutMs ?? 0) / 1000)} s` : "";
        throw new KildeFejl("netvaerk", `Serveren svarede ikke${tid} (${metode} ${sti}). Kører fjernvarme_app? (${e instanceof Error ? e.message : String(e)})`);
    } finally {
        if (ur) clearTimeout(ur);
    }
    const tekst = await svar.text();
    let json: unknown = null;
    try { json = tekst ? JSON.parse(tekst) : null; } catch { json = undefined; }
    if (!svar.ok) {
        const f = (json as { fejl?: { kode?: string; besked?: string } } | null | undefined)?.fejl;
        const kode = KODER.includes(f?.kode as Fejlkode) ? (f!.kode as Fejlkode) : "ukendt";
        throw new KildeFejl(kode, f?.besked || `Serveren svarede HTTP ${svar.status} på ${metode} ${sti}${tekst ? `: ${tekst.slice(0, 200)}` : ""}`, svar.status);
    }
    if (json === undefined) throw new KildeFejl("ukendt", `Serveren svarede ikke med JSON på ${metode} ${sti}.`, svar.status);
    return json;
}

interface Tilstand {
    felter?: readonly string[];
    filter?: Record<string, unknown>;
    orden?: Record<string, "asc" | "desc">;
    first?: number;
    after?: string;
}

/** Uforanderlig forespørgsel: hvert trin giver en ny, så en genbrugt bygger aldrig bærer en gammel markør. */
class RestForespørgsel implements Forespørgsel {
    constructor(private readonly entitet: string, private readonly t: Tilstand = {}) {}
    where(filter: Record<string, unknown>) { return new RestForespørgsel(this.entitet, { ...this.t, filter }); }
    orderBy(orden: Record<string, "asc" | "desc">) { return new RestForespørgsel(this.entitet, { ...this.t, orden }); }
    first(n: number) { return new RestForespørgsel(this.entitet, { ...this.t, first: n }); }
    after(markør: string) { return new RestForespørgsel(this.entitet, { ...this.t, after: markør }); }

    async executePaginated() {
        const q = new URLSearchParams();
        if (this.t.filter) q.set("filter", JSON.stringify(this.t.filter));
        if (this.t.orden) q.set("orderBy", JSON.stringify(this.t.orden));
        if (this.t.first !== undefined) q.set("first", String(this.t.first));
        if (this.t.after) q.set("after", this.t.after);
        if (this.t.felter?.length) q.set("fields", this.t.felter.join(","));
        const s = q.toString();
        const svar = await kaldApi("GET", `/api/data/${encodeURIComponent(this.entitet)}${s ? `?${s}` : ""}`) as
            { items?: unknown; hasNextPage?: unknown; endCursor?: unknown } | null;
        if (!svar || !Array.isArray(svar.items) || typeof svar.hasNextPage !== "boolean") {
            // En side uden hasNextPage ville få hentAlle til at stoppe efter første side — tavst for få rækker.
            throw new KildeFejl("ukendt", `Serveren svarede ikke med en side ({ items, hasNextPage, endCursor }) for ${this.entitet}.`);
        }
        return {
            items: svar.items as Record<string, unknown>[],
            hasNextPage: svar.hasNextPage,
            endCursor: typeof svar.endCursor === "string" ? svar.endCursor : null,
        };
    }
}

function id(hvor: { id?: unknown }, handling: string, entitet: string): string {
    if (typeof hvor?.id !== "string" || !hvor.id) throw new KildeFejl("ugyldig", `${handling} på ${entitet} kræver et id.`);
    return encodeURIComponent(hvor.id);
}

function entitetsKilde(entitet: string): EntitetsKilde {
    const e = encodeURIComponent(entitet);
    return {
        select: (felter) => new RestForespørgsel(entitet, { felter }),
        create: (række) => kaldApi("POST", `/api/data/${e}`, række),
        // async: et manglende id skal være et afvist løfte som alle andre fejl, ikke en synkron undtagelse.
        update: async (hvor, data) => kaldApi("PATCH", `/api/data/${e}/${id(hvor, "Ret", entitet)}`, data),
        delete: async (hvor) => kaldApi("DELETE", `/api/data/${e}/${id(hvor, "Slet", entitet)}`),
    };
}

function funktionsKilde(navn: string): FunktionsKilde {
    return { invoke: (input, valg) => kaldApi("POST", `/api/fn/${encodeURIComponent(navn)}`, input ?? {}, valg?.timeoutMs) };
}

/** Proxyer, så enhver entitet/Function findes ved navn som på Rayfin-klienten. Serveren afgør, hvad der er tilladt. */
function navneopslag<T>(lav: (navn: string) => T): Record<string, T> {
    const cache = new Map<string, T>();
    return new Proxy({} as Record<string, T>, {
        get: (_, navn) => {
            // "then": ellers ligner objektet et løfte, og `await` på det ville kalde en entitet.
            if (typeof navn !== "string" || navn === "then" || navn === "toJSON") return undefined;
            if (!cache.has(navn)) cache.set(navn, lav(navn));
            return cache.get(navn);
        },
    });
}

let kilde: DataKilde | undefined;

export function hentDataKilde(): DataKilde {
    kilde ??= { data: navneopslag(entitetsKilde), functions: navneopslag(funktionsKilde) };
    return kilde;
}
