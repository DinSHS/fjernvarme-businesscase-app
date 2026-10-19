//-----------------------------------------------------------------------
// Kørselslistens kolonner, rute for sortering og forklaringens eksempeltekster
// (brief 17) — uden React, så komponentfilerne kun eksporterer komponenter.
//-----------------------------------------------------------------------

import { tal } from "@/lib/format";
import { gabPct } from "./fmt";
import { deltaOrd, type ListeRaekke, type Sortering } from "./sammensaetning";

export interface Kol {
    id: string;
    navn: string;
    tal?: boolean;
    /** Kun under "Flere kolonner". */
    flere?: boolean;
}

/** Alle kolonner i visningsrækkefølge — "Vælg" sættes foran af tabellen selv. */
export const KOLONNER: readonly Kol[] = [
    { id: "spoergsmaal", navn: "Spørgsmål / scenarie" },
    { id: "aendringer", navn: "Ændringer ift. værket" },
    { id: "rolle", navn: "Rolle" },
    { id: "oprindelse", navn: "Oprindelse" },
    { id: "periode", navn: "Periode" },
    { id: "markeder", navn: "Markeder" },
    { id: "varmelast", navn: "Varmelast" },
    { id: "objektiv", navn: "Driftsomkostning (kr.)", tal: true },
    { id: "delta", navn: "Δ mod reference", tal: true },
    { id: "anbefaling", navn: "Anbefaling" },
    { id: "status", navn: "Status" },
    { id: "vaerk", navn: "Værk", flere: true },
    { id: "modtaget", navn: "Modtaget", flere: true },
    { id: "gab", navn: "Opnået gab", tal: true, flere: true },
    { id: "varighed", navn: "Varighed", tal: true, flere: true },
    { id: "bestilt_af", navn: "Bestilt af", flere: true },
];

/** Talkolonner sorteres faldende ved første klik (største beløb/nyeste først); tekst stigende. */
export const FØRST_FALDENDE = new Set(["objektiv", "modtaget", "varighed", "gab"]);

/** Sortering fra rutens to sidste led; ukendt kolonne eller retning = ingen sortering. */
export function læsSortering(kolonne: string | undefined, retning: string | undefined): Sortering | null {
    if (!kolonne || !KOLONNER.some((k) => k.id === kolonne)) return null;
    return { kolonne, retning: retning === "ned" ? -1 : 1 };
}
export function sorteringsRute(kronologisk: boolean, s: Sortering | null): string {
    const visning = kronologisk ? "kronologisk" : "grupperet";
    if (!s) return kronologisk ? "analyser/kronologisk" : "analyser";
    return `analyser/${visning}/${s.kolonne}/${s.retning === 1 ? "op" : "ned"}`;
}

/** Eksemplets værdi pr. trin, regnet af de to rækker. */
export function eksempelTekster(ref: ListeRaekke, scen: ListeRaekke): Record<string, string> {
    const k = scen.k;
    const gab = k.oensket_rel_gap != null || k.oensket_abs_gap != null
        ? `gab ${k.oensket_rel_gap != null ? gabPct(k.oensket_rel_gap) : "?"} / ${k.oensket_abs_gap != null ? `${tal(k.oensket_abs_gap)} kr.` : "?"}` : "værkets eget gab";
    const navn = (r: ListeRaekke) => r.scenarie?.navn ?? r.side.navn;
    return {
        vaerk: scen.side.vaerkNavn,
        scenarie: `«${navn(scen)}»: ${scen.aendringer}`,
        periode: `${scen.periode.datoer}${scen.periode.laengde ? ` (${scen.periode.laengde})` : ""}`,
        indstillinger: `${scen.markeder.tekst}${scen.markeder.spor ? ` (Spor ${scen.markeder.spor})` : ""} · ${scen.varmelast.tekst.toLowerCase()} varmelast${scen.varmelast.navn ? ` (${scen.varmelast.navn})` : ""} · ${gab}`,
        koersel: k.objektiv_dkk != null ? `Driftsomkostning ${tal(k.objektiv_dkk)} kr.` : "Ingen driftsomkostning endnu",
        sammenligning: `Mod referencen «${navn(ref)}»${ref.k.objektiv_dkk != null ? ` (${tal(ref.k.objektiv_dkk)} kr.)` : ""}: ${deltaOrd(scen.delta) ?? "–"}`,
        anbefaling: scen.vurdering?.maerke ?? "–",
    };
}
