//-----------------------------------------------------------------------
// Faste tekster på analysesiderne. Fagtekst kommer fra fv-eksperts viden/
// (via etiketter.data.ts); her står kun appens egne formuleringer.
//-----------------------------------------------------------------------

import { FORBEHOLD } from "./etiketter.data";

/** Tekst fra fv-eksperts faste forbehold (resultat_etiketter.json), slået op på "hvornaar". */
export function forbehold(hvornaar: string): string {
    return FORBEHOLD.find((f) => f.hvornaar === hvornaar)?.tekst ?? "";
}

/**
 * Forbeholdet for Spor A (fri reservation), for alle værker — ikke udløst af
 * værkets navn (review A4). Formuleringen er fv-eksperts.
 */
export const SPOR_A_FORBEHOLD = "Spor A (fri reservation): balancetallene er et potentiale ved fuld tilgængelighed, ikke en forventning.";
export const SPOR_B_FORBEHOLD = "Spor B (værkets egen reservation som loft): beskriver én periode og forudsiger ikke.";

/** Fodnoten om N−1: intervaldata mangler første interval. */
export const N_MINUS_1 = "Intervaldata mangler kørslens første interval: modellens timefil udelader det. Objektivet og nøgletallene "
    + "medregner det; summer over intervaldata gør ikke. (I kørsler regnet før modelversion eef950a var tankens lagerbalance også ubundet dér.)";
