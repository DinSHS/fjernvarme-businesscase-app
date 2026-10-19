//-----------------------------------------------------------------------
// Aendringsanmodning — brugerens ønske om at ændre et værk (KONTRAKT §3.3b).
//
// Klienten må KUN oprette (og læse), og kun med sin egen e-mail i
// `anmodet_af` (DAB-policy). Function `udfoerAendring` udfører den i ÉN
// SQL-transaktion: tjek `forventet_revision`, ret VaerkParameter, skriv
// Aendringslog, øg Vaerk.revision, sæt status. Konflikt -> `afvist` + `svar`.
//
// `aendringer_json` er en liste. Former (læses af rayfin/functions/src/logik.ts læsAnmodning):
//   parameterændringer : [{"sti": "...", "handling": "opret|ret|slet", "ny_json": "..."}]
//   værksniveau        : [{"handling": "kopier_vaerk", "ny_kode": "...", "navn": "..."}]
//                        (vaerk_id = kildeværket; forventet_revision = dets revision)
//   nyt værk, N dele   : [{"handling": "opret_vaerk_del", "udkast": "<uuid>", "nr": k, "af": N, "blade": [{sti, ny_json, bekraeft?, kommentar?}]}]
//   nyt værk, afslut   : [{"handling": "opret_vaerk", "udkast": "<uuid>", "dele": N, "ny_kode": "...", "navn": "..."}]
//                        (vaerk_id = nil-uuid, forventet_revision = 0; se app/AGENTS.md › Nyt værk fra bunden)
//
// Status skrives af funktionen; DAB afviser create med en anden status end `ny` (K2-F10).
//
// SQL-tabel: "Aendringsanmodnings". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, set, date, int } from '@microsoft/rayfin-core';
import { ANMODNING_STATUSSER, MAKS, type AnmodningStatus } from './fjv.constants.js';

@entity()
@authenticated('read')
// K2-F10: create må kun sætte indhold. Status skal være 'ny' (DAB-policy); svar/resultat skrives af backend,
// og udfoerAendring ignorerer et klientleveret svar.
@authenticated<Aendringsanmodning>('create', { policy: (claims, item) => claims.email.eq(item.anmodet_af).and(item.status.eq('ny')) })
export class Aendringsanmodning {
    @uuid() id!: string;

    @uuid() vaerk_id!: string;

    /** Værkets revision da brugeren begyndte at redigere. */
    @int() forventet_revision!: number;

    /** Kompakt JSON-liste — se filhovedet. */
    @text({ min: 2, max: MAKS.json }) aendringer_json!: string;

    @text({ min: 1, max: MAKS.bruger }) anmodet_af!: string;

    /** UTC. */
    @date() anmodet!: Date;

    @set(...ANMODNING_STATUSSER) status!: AnmodningStatus;

    /** Funktionens svar: hvad blev gjort, eller hvorfor afvist. */
    @text({ max: MAKS.svar, optional: true }) svar?: string;
}
