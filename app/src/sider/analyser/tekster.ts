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

/**
 * Forbeholdet ved tal pr. lager (runde 15, iagttagelse 3.7 fra den uafhængige test 18. november 2026). Appens timefil
 * er byte-identisk med run_case.py på appens egen casefil, men mod modelrepoets cases/andeby.yaml målte testen en anden
 * fordeling mellem tank_lav og tank_hoej (op til 68 MWh og 25 MW pr. tank) med samme samlede lager, produktion og
 * objektiv. Appens egen formulering (doc/TROFASTHED.md §4b).
 *
 * Kodegennemgangen af runde 15, fund 9: teksten sagde, at valget "følger casefilens skrivemåde". Det var testrapportens
 * formodning, ikke en måling: eftermålingen 23. november 2026 gav byte-ens timefiler mod cases/andeby.yaml, og §4b siger
 * derfor, at årsagen ikke er fundet. Teksten siger nu det samme.
 */
export const FLERE_LAGRE_FORBEHOLD = "Fordelingen mellem flere lagre er ikke entydig: der findes flere optimale løsninger med samme samlede "
    + "lagerindhold, produktion og driftsomkostning. Hvad der afgør, hvilken modellen vælger, er ikke fundet. Læs summen over lagrene; et tal "
    + "pr. lager — og et ΔRef pr. lager — kan skifte, uden at resultatet er et andet.";

/** Fodnoten om N−1: intervaldata mangler første interval. */
export const N_MINUS_1 = "Intervaldata mangler kørslens første interval: modellens timefil udelader det. Objektivet og nøgletallene "
    + "medregner det; summer over intervaldata gør ikke. (I kørsler regnet før modelversion eef950a var tankens lagerbalance også ubundet dér.)";
