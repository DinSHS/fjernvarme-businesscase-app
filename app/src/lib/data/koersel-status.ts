//-----------------------------------------------------------------------
// Kørselsstatus: etiketter og reglen for hvornår appen må spørge igen.
//
// En Fabric SQL-database der røres oftere end hvert 15. minut er tændt
// døgnet rundt (1,74 CU konstant — målt i huset 2026-10-08). Derfor polles
// KUN mens en synlig kørsel er aktiv, KUN mens fanen er synlig, og højst hvert
// 20. sekund (KONTRAKT §6). Ingen baggrundspolling ellers.
//-----------------------------------------------------------------------

import { AKTIVE_STATUSSER, type KoerselStatus } from "../../../rayfin/data/fjv.constants";

export const POLL_MS = 20_000;

export const STATUS_TEKST: Record<KoerselStatus, string> = {
    koe: "I kø",
    startet: "Startet",
    koerer: "Regner",
    indlaeser: "Indlæser resultater",
    faerdig: "Færdig",
    fejl: "Fejl",
    annulleret: "Annulleret",
};

export type StatusTone = "neutral" | "ok" | "advarsel" | "fejl";

export const STATUS_TONE: Record<KoerselStatus, StatusTone> = {
    koe: "neutral", startet: "neutral", koerer: "advarsel", indlaeser: "advarsel",
    faerdig: "ok", fejl: "fejl", annulleret: "neutral",
};

export function erAktiv(status: string | null | undefined): boolean {
    return !!status && AKTIVE_STATUSSER.has(status as KoerselStatus);
}

/** Må appen spørge databasen igen nu? Ren funktion — testet. */
export function skalPolle(statusser: readonly (string | null | undefined)[], synlig: boolean, sidstMs: number, nuMs: number): boolean {
    if (!synlig) return false;
    if (!statusser.some(erAktiv)) return false;
    return nuMs - sidstMs >= POLL_MS;
}
