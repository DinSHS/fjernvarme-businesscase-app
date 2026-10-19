//-----------------------------------------------------------------------
// VaerkParameter — én blad-værdi i værkets case-YAML (KONTRAKT §3.2).
//
// Stien er punktum-separerede nøgler (`units.halmkedel.p_max_heat`); dicts
// rekurseres, skalarer OG lister er blade. Værdien er JSON-kodet, så typen
// overlever rundturen (12 vs 12.0, "true" vs true, null).
//
// Unikhed (vaerk_id, sti) håndhæves i kode — Rayfin kan ikke udtrykke en
// sammensat constraint. Læsevejen skal derfor TÅLE en dublet og vise den.
//
// SQL-tabel: "VaerkParameters". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, date, boolean, int } from '@microsoft/rayfin-core';
import { MAKS } from './fjv.constants.js';

@entity()
// Klienten må KUN læse (KONTRAKT §3.0). Alle skrivninger går gennem
// Functions (SQL som app-ejer) eller notebooks.
@authenticated('read')
export class VaerkParameter {
    @uuid() id!: string;

    @uuid() vaerk_id!: string;

    @text({ min: 1, max: MAKS.sti }) sti!: string;

    /** JSON: `12.0`, `"straw"`, `true`, `[4.4, 4.5]`, `null`. */
    @text({ min: 1, max: MAKS.json }) vaerdi_json!: string;

    /** Første nøgle: `units`, `prices`, `electricity`, … */
    @text({ min: 1, max: MAKS.sektion }) sektion!: string;

    /** Anden nøgle for `units`/`storage`/`prices` (enhedens/lagerets/brændslets navn). */
    @text({ max: MAKS.objekt, optional: true }) objekt?: string;

    /** YAML-kommentaren på/over linjen. */
    @text({ max: MAKS.kommentar, optional: true }) kommentar?: string;

    /** Linjen bærer `[BEKRÆFT]` eller `[TBC]`. */
    @boolean() bekraeft!: boolean;

    /** Linjens position i kildefilen. */
    @int() raekkefoelge!: number;

    @text({ min: 1, max: MAKS.bruger }) aendret_af!: string;

    /** UTC. */
    @date() aendret!: Date;
}
