//-----------------------------------------------------------------------
// Motor — regnemotorens tilstand, ÉN række (KONTRAKT v2.2 §6c).
//
//   model_commit, data_commit  de pins arbejderen aktuelt bruger (skrives af fv-fabric's importer/arbejder);
//                              startBestilling fryser dem i det hashbeskyttede input (K2-F8).
//   sidste_jobstart            hvornår en Function sidst POST'ede et arbejderjob; betinget UPDATE
//                              (ældre end 2 min) sikrer, at kun ét kald starter et job (K2-F3).
//   sidste_job_id              arbejderjobbets id (job-id hører til jobbet, ikke til en kørsel).
//
// Rækken har det faste id MOTOR_ID (fjv.constants.ts) og oprettes af Functions, hvis den mangler.
// Global eksklusion af solveren er IKKE et felt her, men SQL-applocken 'fjv_solver' (§6c).
//
// SQL-tabel: "Motors". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, date } from '@microsoft/rayfin-core';
import { MAKS } from './fjv.constants.js';

@entity()
// Klienten må KUN læse (KONTRAKT §6c).
@authenticated('read')
export class Motor {
    @uuid() id!: string;

    @text({ max: MAKS.commit, optional: true }) model_commit?: string;

    @text({ max: MAKS.commit, optional: true }) data_commit?: string;

    @date({ optional: true }) sidste_jobstart?: Date;

    @text({ max: MAKS.fabric_job_id, optional: true }) sidste_job_id?: string;

    /** UTC. */
    @date() aendret!: Date;
}
