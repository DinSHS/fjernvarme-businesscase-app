//-----------------------------------------------------------------------
// Scenarie — et værk plus ændringer, der kan bestilles kørt (KONTRAKT §3.4).
//
// Klient-CRUD (KONTRAKT §3.0): oprettelse kræver at `oprettet_af` er
// kalderens egen e-mail (DAB-policy), så revisionssporet er verificeret.
// Ved opdatering kan `oprettet_af`, `oprettet` og `vaerk_id` ikke ændres.
// Sletning er bevidst IKKE tilladt: et scenarie med kørsler ville efterlade
// hængende referencer — arkivér i stedet.
//
// Scenariet er levende; det der faktisk køres, fryses i KoerselInput ved
// bestilling. Ændringer efter en bestilling påvirker derfor ikke kørslen.
//
// SQL-tabel: "Scenaries". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, set, date, boolean, int, decimal } from '@microsoft/rayfin-core';
import { BALANCERINGSMETODER, DECIMAL, MAKS, type Balanceringsmetode } from './fjv.constants.js';

@entity()
@authenticated('read')
@authenticated<Scenarie>('create', { policy: (claims, item) => claims.email.eq(item.oprettet_af) })
@authenticated<Scenarie>('update', { exclude: ['oprettet_af', 'oprettet', 'vaerk_id'] })
export class Scenarie {
    @uuid() id!: string;

    @uuid() vaerk_id!: string;

    @text({ min: 1, max: MAKS.navn }) navn!: string;

    @text({ max: MAKS.beskrivelse, optional: true }) beskrivelse?: string;

    /** Det scenarie, differensen regnes mod (reference/scenarie-par oprettet i appen). */
    @uuid({ optional: true }) reference_scenarie_id?: string;

    /** ISO-dato `2026-01-05`; tom = værkets `time`-blok. */
    @text({ max: MAKS.periode, optional: true }) periode_start?: string;

    @text({ max: MAKS.periode, optional: true }) periode_slut?: string;

    /** `--with-balancing`. */
    @boolean() med_balancering!: boolean;

    @set({ optional: true }, ...BALANCERINGSMETODER) balancing_method?: Balanceringsmetode;

    /** Ønsket relativ tolerance (`solver.mip_rel_gap`); anbefal 0.0002 ved differenser. */
    @decimal({ ...DECIMAL.gab, optional: true }) mip_rel_gap?: number;

    /** Ønsket absolut tolerance i DKK (`solver.mip_abs_gap`; modellens standard er 5.000). */
    @decimal({ ...DECIMAL.dkk, optional: true }) mip_abs_gap?: number;

    /** `solver.time_limit` i sekunder (højst 3600, håndhæves i startBestilling). */
    @int({ optional: true }) tidsgraense_s?: number;

    /** Hvidlistede flag (`--legacy-nettab`). Functions/notebook afviser alt andet. */
    @text({ max: MAKS.ekstra_flag, optional: true }) ekstra_flag?: string;

    /** Varmelast-CSV (`--heat-csv`); kun filer i modelrepoets `data/`. */
    @text({ max: MAKS.heat_csv, optional: true }) heat_csv?: string;

    @boolean() arkiveret!: boolean;

    @text({ min: 1, max: MAKS.bruger }) oprettet_af!: string;

    /** UTC. */
    @date() oprettet!: Date;
}
