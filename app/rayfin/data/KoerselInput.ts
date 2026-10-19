//-----------------------------------------------------------------------
// KoerselInput — det frosne input for én kørsel (KONTRAKT §3.7).
//
// Skrives af `startBestilling` i SAMME transaktion som Koersel: alle
// VaerkParameter-blade ved `vaerk_revision` (kilde=vaerk), derefter
// scenariets ændringer (kilde=aendring) og særlige felter som stier
// (kilde=scenarie: `_scenarie.periode_start`, `solver.mip_rel_gap` …).
// Notebooken læser KUN dette (+ Koersel) og verificerer `input_hash`.
//
// SQL-tabel: "KoerselInputs". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, set } from '@microsoft/rayfin-core';
import { INPUT_KILDER, MAKS, type InputKilde } from './fjv.constants.js';

@entity()
// Klienten må KUN læse (KONTRAKT §3.0).
@authenticated('read')
export class KoerselInput {
    @uuid() id!: string;

    @uuid() koersel_id!: string;

    @text({ min: 1, max: MAKS.sti }) sti!: string;

    @text({ min: 1, max: MAKS.json }) vaerdi_json!: string;

    @set(...INPUT_KILDER) kilde!: InputKilde;
}
