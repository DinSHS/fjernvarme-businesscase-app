//-----------------------------------------------------------------------
// Link til sammenligningen i Analyser. Differens, gab og tolerance regnes af
// analyser/beregn.ts (difference, absolutGab, differenceTekst), så scenariesiden
// og Analyser altid siger det samme om et par (fv-analyse's fund 11:30).
//-----------------------------------------------------------------------

import { rutehref } from "@/lib/rute";
import type { Koersel } from "../../../rayfin/data/Koersel";
import { difference, domNavne, koerselsDom, type Difference, type Dom } from "../analyser/beregn";

/** `#/analyser/sammenlign/<reference>/<scenarie>` — referencen først. */
export function sammenlignHref(refId: string, scenId: string): string {
    return rutehref("analyser", "sammenlign", refId, scenId);
}

/**
 * En kørsel mod parrets referencekørsel (runde 15, mail 1 fra den uafhængige test 18. november 2026). `diff` findes
 * KUN, når begge er færdige og direkte sammenlignelige; ellers er der ingen differens at vise, og `afviger` siger
 * hvorfor. Før regnede kørselskortet og sidens budskab `difference()` uden at spørge — og viste et grønt ΔRef mod
 * en reference med en anden periode.
 *
 * Kodegennemgangen af runde 15, fund 4: dommen er Analysers egen (`koerselsDom`), ikke en regel for sig. `dom` har tre
 * udfald: "ja" (differensen findes), "nej" (`afviger` navngiver felterne) og "ukendt" (`ukendt` navngiver de
 * nødvendige felter, der ikke kendes for begge kørsler) — det sidste er hverken et resultat eller en afvisning.
 */
export interface ModReference { diff: Difference | null; dom: Dom | null; afviger: string[]; ukendt: string[]; begge_faerdige: boolean }

export function modReference(reference: Koersel | undefined, k: Koersel): ModReference {
    const begge_faerdige = k.status === "faerdig" && reference?.status === "faerdig";
    if (!reference || !begge_faerdige) return { diff: null, dom: null, afviger: [], ukendt: [], begge_faerdige };
    const dom = koerselsDom(reference, k);
    return {
        diff: dom.status === "ja" ? difference(reference, k) : null, dom,
        afviger: domNavne(dom, "advarsel"), ukendt: dom.status === "ukendt" ? domNavne(dom, "ukendt") : [], begge_faerdige,
    };
}
