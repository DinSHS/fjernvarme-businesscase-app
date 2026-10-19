//-----------------------------------------------------------------------
// KoerselTime — intervaldispatch, bredt med JSON (KONTRAKT §3.10).
//
// `_hourly.csv` har N-1 rækker (første interval droppes bevidst; t=0's
// lagerbalance er en kendt modeldefekt). 1h og 15min (`Koersel.oploesning`).
// Appen læser ALTID filtreret på koersel_id + tidsvindue, sorteret, pagineret.
// `vaerdier_json` = de øvrige kolonner i `_hourly.csv` som objekt, kompakt,
// NaN -> null (`{"p_halmkedel_mw":3.0,…}`). Skrives kun af notebooken.
//
// SQL-tabel: "KoerselTimes". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, date, decimal } from '@microsoft/rayfin-core';
import { DECIMAL, MAKS } from './fjv.constants.js';

@entity()
// Klienten må KUN læse (KONTRAKT §3.0). Alle skrivninger går gennem
// Functions (SQL som app-ejer) eller notebooks.
@authenticated('read')
export class KoerselTime {
    @uuid() id!: string;

    @uuid() koersel_id!: string;

    /** UTC, intervallets start. */
    @date() tid!: Date;

    @decimal({ ...DECIMAL.time }) varmelast_mw!: number;

    @decimal({ ...DECIMAL.time, optional: true }) spotpris?: number;

    @decimal({ ...DECIMAL.time, optional: true }) t_ude?: number;

    @text({ min: 1, max: MAKS.json }) vaerdier_json!: string;
}
