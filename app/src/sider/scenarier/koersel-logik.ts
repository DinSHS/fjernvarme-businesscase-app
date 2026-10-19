//-----------------------------------------------------------------------
// Link til sammenligningen i Analyser. Differens, gab og tolerance regnes af
// analyser/beregn.ts (difference, absolutGab, differenceTekst), så scenariesiden
// og Analyser altid siger det samme om et par (fv-analyse's fund 11:30).
//-----------------------------------------------------------------------

import { rutehref } from "@/lib/rute";

/** `#/analyser/sammenlign/<reference>/<scenarie>` — referencen først. */
export function sammenlignHref(refId: string, scenId: string): string {
    return rutehref("analyser", "sammenlign", refId, scenId);
}
