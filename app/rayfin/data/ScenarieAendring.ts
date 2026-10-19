//-----------------------------------------------------------------------
// ScenarieAendring — én knap i et scenarie (KONTRAKT §3.5).
//
// `set`     : `sti` er et EKSISTERENDE blad i værket (`prices.straw.value`);
//             `vaerdi_json` erstatter det (en liste erstattes som helt blad).
// `enable`  : `sti` er et enheds- eller lagernavn; `<units|storage>.<navn>.enabled = true`.
// `disable` : som enable, men false.
// To ændringer på samme sti i ét scenarie afvises (ikke "sidste vinder") —
// det tjekkes i appen ved gem og igen i startBestilling.
//
// Klient-CRUD uden policy: rækken har ingen brugerkolonne, og identiteten
// sidder på scenariet. Det der køres, fryses i KoerselInput ved bestilling.
//
// SQL-tabel: "ScenarieAendrings". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, set, int } from '@microsoft/rayfin-core';
import { AENDRINGSTYPER, MAKS, type Aendringstype } from './fjv.constants.js';

@entity()
@authenticated(['create', 'read', 'update', 'delete'])
export class ScenarieAendring {
    @uuid() id!: string;

    @uuid() scenarie_id!: string;

    @set(...AENDRINGSTYPER) type!: Aendringstype;

    @text({ min: 1, max: MAKS.sti }) sti!: string;

    /** Kun ved `set`. JSON-kodet, kompakt. */
    @text({ max: MAKS.json, optional: true }) vaerdi_json?: string;

    @int() raekkefoelge!: number;
}
