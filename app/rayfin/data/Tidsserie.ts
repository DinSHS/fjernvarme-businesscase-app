//-----------------------------------------------------------------------
// Tidsserie — en af værkets EGNE tidsserier (målt varmelast, målt solvarme), KONTRAKT §6d.
//
// Markeds- og vejrdata (spot, aFRR, mFRR, ubalance, DMI) bliver i df-data og
// uploades aldrig. Klienten må KUN læse; rækken skrives af Function
// `uploadTidsserie` (eller af importen af repo-casene / værksark-notebooken).
//
// Filen er UFORANDERLIG: `Files/fjv/tidsserier/<vaerk_kode>/<sha256>.csv` i
// normaliseret form (UTC, timens start, MW, én værdikolonne). Samme hash =
// samme fil; en ny upload er en ny række. `sti`/`sha256`/perioden er tomme på
// en afvist upload (der findes ingen normaliseret fil).
//
// Højst én `aktiv` pr. værk + rolle — håndhæves i Function (Rayfin kan ikke
// udtrykke et filtreret unikt indeks), så læsevejen skal TÅLE to og vise det.
//
// SQL-tabel: "Tidsseries". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, set, date, int, boolean } from '@microsoft/rayfin-core';
import {
    MAKS, TIDSSERIE_KILDER, TIDSSERIE_ROLLER, TIDSSERIE_STATUSSER, TIDSSTEMPEL_VALG,
    type TidsserieKilde, type TidsserieRolle, type TidsserieStatus, type Tidsstempel,
} from './fjv.constants.js';

@entity()
@authenticated('read')
export class Tidsserie {
    @uuid() id!: string;

    @uuid() vaerk_id!: string;

    @set(...TIDSSERIE_ROLLER) rolle!: TidsserieRolle;

    @text({ min: 1, max: MAKS.navn }) navn!: string;

    /** Brugerens filnavn (kun til visning). */
    @text({ min: 1, max: MAKS.filnavn }) filnavn!: string;

    /** Lakehouse-sti til den normaliserede fil; tom ved `afvist`. */
    @text({ max: MAKS.lakehouse_sti, optional: true }) sti?: string;

    /** sha256 af den normaliserede fil (hex); tom ved `afvist`. */
    @text({ max: MAKS.hash, optional: true }) sha256?: string;

    /** `1h` eller `15min`. */
    @text({ max: MAKS.oploesning, optional: true }) oploesning?: string;

    /** Første og sidste interval (timens START, UTC). */
    @date({ optional: true }) start?: Date;
    @date({ optional: true }) slut?: Date;

    @int({ optional: true }) antal_raekker?: number;
    @int({ optional: true }) antal_huller?: number;

    /** Altid `MW` i den gemte fil. */
    @text({ max: MAKS.tidsserie_enhed, optional: true }) enhed?: string;

    /** Hvad tidsstemplet betød i KILDEN (`start`/`slut` på timen). */
    @set(...TIDSSTEMPEL_VALG) tidsstempel!: Tidsstempel;

    /** Kildens tidszone (fx `Europe/Copenhagen` eller `UTC`); den gemte fil er UTC. */
    @text({ min: 1, max: MAKS.tidszone }) tidszone!: string;

    @set(...TIDSSERIE_KILDER) kilde!: TidsserieKilde;

    @set(...TIDSSERIE_STATUSSER) status!: TidsserieStatus;

    /** Kompakt JSON: dækning, huller, min/max, årssum, fejl og advarsler (se app/AGENTS.md). */
    @text({ max: MAKS.validering, optional: true }) validering_json?: string;

    @boolean() aktiv!: boolean;

    @text({ min: 1, max: MAKS.bruger }) uploadet_af!: string;

    /** UTC. */
    @date() uploadet!: Date;
}
