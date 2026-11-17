//-----------------------------------------------------------------------
// KoerselTimeDel — resten af et intervals øvrige kolonner (skemaversion 2, runde 14b).
//
// `KoerselTime.vaerdier_json` kan højst være 4000 tegn (NVARCHAR(4000); en
// tekst uden max bliver NVARCHAR(MAX), som DAB ikke kan bygge sit skema af —
// fjv.constants.ts). Målt ved 90fb16e fylder et værk med 40 elenheder og
// balancemarked ca. 21.000 tegn i én time og 4.612 selv uden kolonnenavnene.
// Så fylder en time flere rækker: KoerselTime har de første kolonner (del 0),
// her står del 1, 2, … for samme (koersel_id, tid). Sat sammen i orden er de
// præcis `_hourly.csv`'s kolonner; intet afrundes. `Koersel.manifest_json.
// time_dele` er antallet af rækker her, så appen kun læser tabellen, når den
// har noget (en database fra før version 2 har den ikke).
//
// SQL-tabel: "KoerselTimeDels". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, date, int } from '@microsoft/rayfin-core';
import { MAKS } from './fjv.constants.js';

@entity()
// Klienten må KUN læse (KONTRAKT §3.0). Kun notebooken og arkivets Function skriver.
@authenticated('read')
export class KoerselTimeDel {
    @uuid() id!: string;

    @uuid() koersel_id!: string;

    /** UTC, intervallets start — samme som KoerselTime-rækkens. */
    @date() tid!: Date;

    /** 1, 2, … i den rækkefølge, delene sættes sammen (KoerselTime er del 0). */
    @int() delnr!: number;

    @text({ min: 1, max: MAKS.json }) vaerdier_json!: string;
}
