//-----------------------------------------------------------------------
// KoerselMaaned — en kørsels månedsværdier i langt format (KONTRAKT §3.9).
//
// Beregnes i notebooken fra den fulde tidsserie (alle N intervaller), IKKE fra
// `_monthly.csv` (UTC-måned 1-12 uden år, K1-F5). `maaned` er `YYYY-MM` i
// Europe/Copenhagen eller `periode` (hele kørslen, på uafrundede data).
// Appen summerer ALDRIG viste celler — brug `periode`-rækken.
//
// SQL-tabel: "KoerselMaaneds". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, decimal } from '@microsoft/rayfin-core';
import { DECIMAL, MAKS } from './fjv.constants.js';

@entity()
// Klienten må KUN læse (KONTRAKT §3.0). Alle skrivninger går gennem
// Functions (SQL som app-ejer) eller notebooks.
@authenticated('read')
export class KoerselMaaned {
    @uuid() id!: string;

    @uuid() koersel_id!: string;

    /** `2026-01` (Europe/Copenhagen) eller `periode`. */
    @text({ min: 1, max: MAKS.maaned }) maaned!: string;

    @text({ max: MAKS.objekt, optional: true }) objekt?: string;

    @text({ min: 1, max: MAKS.noegle }) noegle!: string;

    @decimal({ ...DECIMAL.vaerdi, optional: true }) vaerdi?: number;
}
