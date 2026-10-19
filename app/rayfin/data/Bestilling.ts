//-----------------------------------------------------------------------
// Bestilling — brugerens ønske om at køre et scenarie (KONTRAKT §3.6).
//
// Klienten må KUN oprette (og læse), og kun med sin egen e-mail i
// `bestilt_af` (DAB-policy). Function `startBestilling` behandler den: håndhæver
// grænserne, fryser input og opretter Koersel. Det er derfor bestillingen og
// ikke kørslen, klienten skriver — status, job-id og resultater er betroede.
//
// `klient_noegle` er unik: et dobbeltklik eller et gentaget kald med samme
// nøgle kan ikke give to bestillinger (idempotens i databasen, ikke kun i UI).
//
// SQL-tabel: "Bestillings". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, date } from '@microsoft/rayfin-core';
import { MAKS } from './fjv.constants.js';

@entity()
@authenticated('read')
@authenticated<Bestilling>('create', { policy: (claims, item) => claims.email.eq(item.bestilt_af) })
export class Bestilling {
    @uuid() id!: string;

    @uuid() scenarie_id!: string;

    /** Klientgenereret (uuid). Samme nøgle = samme bestilling. */
    @text({ min: 1, max: MAKS.klient_noegle, unique: true }) klient_noegle!: string;

    @text({ min: 1, max: MAKS.bruger }) bestilt_af!: string;

    /** UTC. */
    @date() bestilt!: Date;
}
