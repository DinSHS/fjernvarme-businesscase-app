//-----------------------------------------------------------------------
// Vaerk — et konfigureret fjernvarmeværk (KONTRAKT §3.1).
//
// Værkets faktiske konfiguration ligger IKKE her, men som blade i
// VaerkParameter (hele case-YAML'en fladet). Denne række er hovedet: navn,
// oprindelse og sporbarhed.
//
// `kode` er unik (DB-constraint) og følger [a-z0-9_] — mønsteret håndhæves i
// appen og i notebooken, ikke i databasen. `revision` øges ved hver gemt
// ændring og bruges til optimistisk kontrol i `udfoerAendring` (KONTRAKT §3.3b).
//
// SQL-tabel: "Vaerks" (engelsk pluralizer). Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, set, date, boolean, int } from '@microsoft/rayfin-core';
import { MAKS, VAERK_KILDER, type VaerkKilde } from './fjv.constants.js';

@entity()
// Klienten må KUN læse (KONTRAKT §3.0). Alle skrivninger går gennem
// Functions (SQL som app-ejer) eller notebooks.
@authenticated('read')
export class Vaerk {
    @uuid() id!: string;

    @text({ min: 1, max: MAKS.kode, unique: true }) kode!: string;

    @text({ min: 1, max: MAKS.navn }) navn!: string;

    @text({ max: MAKS.beskrivelse, optional: true }) beskrivelse?: string;

    @set(...VAERK_KILDER) kilde!: VaerkKilde;

    /** Oprindeligt filnavn, fx `cases/billund_sporA.yaml` (koden er normaliseret til lowercase). */
    @text({ max: MAKS.kilde_fil, optional: true }) kilde_fil?: string;

    /** Modelrepoets commit ved import. */
    @text({ max: MAKS.commit, optional: true }) repo_commit?: string;

    /** Ved kopi af et andet værk. */
    @uuid({ optional: true }) kopieret_fra_id?: string;

    /** Øges ved hver gemt ændring (optimistisk kontrol). Import = 1. */
    @int() revision!: number;

    @boolean() arkiveret!: boolean;

    @text({ min: 1, max: MAKS.bruger }) oprettet_af!: string;

    @text({ min: 1, max: MAKS.bruger }) aendret_af!: string;

    /** UTC. */
    @date() oprettet!: Date;

    /** UTC. */
    @date() aendret!: Date;
}
