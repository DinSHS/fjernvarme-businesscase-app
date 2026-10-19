//-----------------------------------------------------------------------
// Aendringslog — revisionsspor for værkskonfiguration (KONTRAKT §3.3).
//
// Append-only: én række pr. opret/ret/slet af en VaerkParameter. Skrives af
// Function `udfoerAendring` i SAMME SQL-transaktion som selve ændringen, så en
// ændring aldrig kan lykkes uden log. Notebookens importer bruger loggen til at
// afgøre, om et værk er ændret i appen (og så ikke må overskrives).
//
// SQL-tabel: "Aendringslogs". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, set, date, int } from '@microsoft/rayfin-core';
import { LOG_HANDLINGER, MAKS, type LogHandling } from './fjv.constants.js';

@entity()
// Klienten må KUN læse (KONTRAKT §3.0). Alle skrivninger går gennem
// Functions (SQL som app-ejer) eller notebooks.
@authenticated('read')
export class Aendringslog {
    @uuid() id!: string;

    @uuid() vaerk_id!: string;

    /** Værkets revision EFTER ændringen. */
    @int() revision!: number;

    @text({ min: 1, max: MAKS.sti }) sti!: string;

    @set(...LOG_HANDLINGER) handling!: LogHandling;

    @text({ max: MAKS.json, optional: true }) gammel_json?: string;

    @text({ max: MAKS.json, optional: true }) ny_json?: string;

    @text({ min: 1, max: MAKS.bruger }) aendret_af!: string;

    /** UTC. */
    @date() tidspunkt!: Date;

    /** Den Aendringsanmodning, ændringen kom fra. */
    @uuid({ optional: true }) anmodning_id?: string;
}
