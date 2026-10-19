//-----------------------------------------------------------------------
// KoerselNoegletal — en kørsels nøgletal i langt format (KONTRAKT §3.8).
//
// Mapping pr. nøgle står i fabric/maaleregister.json. Naturlig nøgle
// (koersel_id, gruppe, objekt, marked, noegle). Skrives kun af notebooken.
//
// SQL-tabel: "KoerselNoegletals". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, decimal } from '@microsoft/rayfin-core';
import { DECIMAL, MAKS } from './fjv.constants.js';

@entity()
// Klienten må KUN læse (KONTRAKT §3.0). Alle skrivninger går gennem
// Functions (SQL som app-ejer) eller notebooks.
@authenticated('read')
export class KoerselNoegletal {
    @uuid() id!: string;

    @uuid() koersel_id!: string;

    /** `objektiv`, `enhed`, `balancering`, `lager`, `el`, … */
    @text({ min: 1, max: MAKS.gruppe }) gruppe!: string;

    /** Enhed/lager. */
    @text({ max: MAKS.objekt, optional: true }) objekt?: string;

    /** `afrr`/`mfrr`/tom. */
    @text({ max: MAKS.marked, optional: true }) marked?: string;

    @text({ min: 1, max: MAKS.noegle }) noegle!: string;

    /** Tom = ikke tilgængelig (fx LP-duals i MILP) — ikke 0. */
    @decimal({ ...DECIMAL.vaerdi, optional: true }) vaerdi?: number;

    /** Måleenhed: `DKK`, `MWh`, `kr/MWh` … */
    @text({ max: MAKS.enhed, optional: true }) enhed?: string;
}
