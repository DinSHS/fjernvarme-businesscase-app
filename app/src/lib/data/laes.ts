//-----------------------------------------------------------------------
// Læsning fra appens database — ALTID pagineret og normaliseret.
//
// `execute()` læser kun DAB's første side på 100 rækker (huset har betalt for
// den fælde to gange). `hentAlle` løkker til `hasNextPage` er falsk. Brug altid
// et filter på den forælder, rækkerne hører til (vaerk_id, koersel_id …), og
// for KoerselTime ALTID et tidsvindue (KONTRAKT §3.10: aldrig hele året).
//-----------------------------------------------------------------------

import { hentDataKilde } from "@/backend/data";
import { hentAlle, type Sideforespørgsel } from "@/lib/hent-alle";
import type { FjvSchema } from "../../../rayfin/data/schema";
import { FELTER, type Entitet, type Feltsæt } from "./felter";
import { normaliser } from "./normaliser";

// Typerne for filter/sortering kommer fra Rayfin; holdt løse her, så hjælperen
// kan være generisk over entiteten.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Filter = Record<string, any>;
export type Sortering = Record<string, "asc" | "desc">;

export interface Læsning { filter?: Filter; sortering?: Sortering; sidestørrelse?: number }

/** Den del af klienten `læs` bruger — strukturelt, så den kan erstattes i tests. */
export interface LæseKilde {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: Record<string, { select(felter: readonly string[]): any }>;
}

let kilde: () => LæseKilde = () => hentDataKilde() as unknown as LæseKilde;

/** Kun til tests: erstat klienten. */
export function sætLæseKilde(k: (() => LæseKilde) | null): void {
    kilde = k ?? (() => hentDataKilde() as unknown as LæseKilde);
}

export async function læs<E extends Entitet>(entitet: E, l: Læsning = {}): Promise<FjvSchema[E][]> {
    const felter = FELTER[entitet] as unknown as Feltsæt<E>;
    const rækker = await hentAlle<Record<string, unknown>>(() => {
        let q = kilde().data[entitet].select(felter.alle);
        if (l.filter) q = q.where(l.filter);
        if (l.sortering) q = q.orderBy(l.sortering);
        return q as Sideforespørgsel<Record<string, unknown>>;
    }, l.sidestørrelse);
    return rækker.map((r) => normaliser<E, FjvSchema[E]>(r, felter));
}

/** Én række efter id, eller null. */
export async function læsÉn<E extends Entitet>(entitet: E, id: string): Promise<FjvSchema[E] | null> {
    const r = await læs(entitet, { filter: { id: { eq: id } } });
    return r[0] ?? null;
}
