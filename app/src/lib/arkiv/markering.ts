//-----------------------------------------------------------------------
// "Importeret fra arkiv <dato>" (runde 13) — uden en ny kolonne i Koersel.
//
// Hver Koersel-del af en genimport er en udført Aendringsanmodning `importer_arkiv` (nil-uuid som værk) med
// kørslernes id'er i `koersel_ider`, importørens e-mail (DAB-verificeret) og tidspunktet. Det er revisionssporet
// og markeringen på én gang; skemaet (og dermed alle installationers databaser) er uændret.
//-----------------------------------------------------------------------

import { IMPORT_PRAEFIKS, NIL_UUID } from "../../../rayfin/functions/src/arkiv";
import { useHent, type Hentet } from "@/lib/data/hooks";
import { læs } from "@/lib/data/laes";

export interface Arkivimport { tidspunkt: Date; af: string; filnavn: string }

/** koersel_id -> hvornår og af hvem den blev importeret fra et arkiv (kun importerede kørsler står her). */
export async function hentArkivimporter(): Promise<Map<string, Arkivimport>> {
    const rækker = await læs("Aendringsanmodning", {
        filter: { vaerk_id: { eq: NIL_UUID }, status: { eq: "udfoert" }, aendringer_json: { startsWith: IMPORT_PRAEFIKS } },
    });
    const ud = new Map<string, Arkivimport>();
    for (const r of rækker) {
        try {
            const [a] = JSON.parse(r.aendringer_json) as [{ tabel?: string; koersel_ider?: string[]; filnavn?: string }];
            if (a?.tabel !== "Koersel") continue;
            for (const id of a.koersel_ider ?? []) ud.set(id, { tidspunkt: r.anmodet as Date, af: r.anmodet_af, filnavn: a.filnavn ?? "" });
        } catch { /* en ugyldig række er ikke en import */ }
    }
    return ud;
}

export function useArkivimporter(): Hentet<Map<string, Arkivimport>> {
    return useHent("arkivimporter", hentArkivimporter);
}

/** "importeret fra arkiv 28-10-2026" */
export function importTekst(a: Arkivimport): string {
    const d = a.tidspunkt;
    return `importeret fra arkiv ${d.toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Copenhagen" })}`;
}
