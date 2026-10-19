//-----------------------------------------------------------------------
// Vaerksarkimport — én upload af `vaerksdata_skabelon.xlsx` (KONTRAKT §6d).
//
// Function `uploadVaerksark` gemmer filen i `Files/fjv/uploads/<id>.xlsx`,
// opretter rækken (`koe`) og starter notebooken `fjv_importer_vaerksark`, der
// kører modelrepoets `scripts/vaerksark_til_yaml.py` uændret og opretter værk
// (som opret_vaerk, kilde `app`) + tidsserie (kilde `vaerksark`). Importen bruger
// IKKE solver-låsen. Klienten må KUN læse; status/log skrives af backend.
//
// SQL-tabel: "Vaerksarkimports". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, set, date, boolean } from '@microsoft/rayfin-core';
import { IMPORT_STATUSSER, MAKS, type ImportStatus } from './fjv.constants.js';

@entity()
@authenticated('read')
export class Vaerksarkimport {
    @uuid() id!: string;

    /** Brugerens filnavn (kun til visning). */
    @text({ min: 1, max: MAKS.filnavn }) filnavn!: string;

    /** Lakehouse-sti til den uploadede fil. */
    @text({ max: MAKS.lakehouse_sti, optional: true }) sti?: string;

    @set(...IMPORT_STATUSSER) status!: ImportStatus;

    /** Værket, importen oprettede (når `faerdig`). */
    @uuid({ optional: true }) vaerk_id?: string;

    /** Tidsserien, importen oprettede (hvis arket havde en). */
    @uuid({ optional: true }) tidsserie_id?: string;

    /** Notebookens log (seneste 4000 tegn) og en læsbar fejl ved `fejl`. */
    @text({ max: MAKS.importlog, optional: true }) log?: string;

    @text({ max: MAKS.fabric_job_id, optional: true }) fabric_job_id?: string;

    /** Står arkets tidsstempler for timens SLUT? (`--timeslut` til vaerksark_til_yaml.py; tom = nej, scriptet stopper selv højlydt ved tvivl.) */
    @boolean({ optional: true }) timeslut?: boolean;

    @text({ min: 1, max: MAKS.bruger }) uploadet_af!: string;

    /** UTC. */
    @date() uploadet!: Date;
}
