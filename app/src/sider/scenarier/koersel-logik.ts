//-----------------------------------------------------------------------
// Link til sammenligningen i Analyser. Differens, gab og tolerance regnes af
// analyser/beregn.ts (difference, absolutGab, differenceTekst), så scenariesiden
// og Analyser altid siger det samme om et par (fv-analyse's fund 11:30).
//-----------------------------------------------------------------------

import { rutehref } from "@/lib/rute";
import type { Koersel } from "../../../rayfin/data/Koersel";
import { difference, type Difference } from "../analyser/beregn";
import { sammenlignelighed } from "./logik";

/** `#/analyser/sammenlign/<reference>/<scenarie>` — referencen først. */
export function sammenlignHref(refId: string, scenId: string): string {
    return rutehref("analyser", "sammenlign", refId, scenId);
}

/**
 * En kørsel mod parrets referencekørsel (runde 15, mail 1 fra den uafhængige test 18. november 2026). `diff` findes
 * KUN, når begge er færdige og direkte sammenlignelige; ellers er der ingen differens at vise, og `afviger` siger
 * hvorfor. Før regnede kørselskortet og sidens budskab `difference()` uden at spørge — og viste et grønt ΔRef mod
 * en reference med en anden periode.
 */
export interface ModReference { diff: Difference | null; afviger: string[]; begge_faerdige: boolean }

export function modReference(reference: Koersel | undefined, k: Koersel): ModReference {
    const begge_faerdige = k.status === "faerdig" && reference?.status === "faerdig";
    if (!reference || !begge_faerdige) return { diff: null, afviger: [], begge_faerdige };
    const afviger = sammenlignelighed(reference, k);
    return { diff: afviger.length === 0 ? difference(reference, k) : null, afviger, begge_faerdige };
}
