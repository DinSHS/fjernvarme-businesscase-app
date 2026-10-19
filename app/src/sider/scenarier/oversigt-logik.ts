//-----------------------------------------------------------------------
// Oversigtens beregninger: reference pr. scenarie, køens rækkefølge, budskabet.
//-----------------------------------------------------------------------

import type { Koersel } from "../../../rayfin/data/Koersel";
import type { Scenarie } from "../../../rayfin/data/Scenarie";
import { parretsReference, sammenlignelighed } from "./logik";

export interface ScenarieRække {
    s: Scenarie;
    vaerk: string;
    seneste?: Koersel;
    reference?: Reference;
}

/**
 * Kolonnen Reference i oversigten. Hvert udfald har sin egen tekst — aldrig "ukendt scenarie":
 * - `par`: parrets reference (feltet, beskrivelsen eller demo-parret) har en færdig kørsel; `direkte` = sammenlignelig.
 * - `par_ikke_koert`: scenariet har en parret reference, men den er ikke kørt færdig.
 * - `er_reference`: scenariet er selv reference for `antal` andre scenarier (og har ingen reference selv).
 * - `sammenlignelig`: ikke parret, men en anden aktiv kørsel på værket kan sammenlignes direkte.
 * - `ingen`: scenariet er kørt, men intet kan sammenlignes direkte med det.
 */
export type Reference =
    | { art: "par"; navn: string; direkte: boolean; afviger: string[] }
    | { art: "par_ikke_koert"; navn: string }
    | { art: "er_reference"; antal: number }
    | { art: "sammenlignelig"; navn: string }
    | { art: "ingen" };

const tid = (t: Date | string | null | undefined) => (t ? new Date(t).getTime() || 0 : 0);
const nyeste = (ks: readonly Koersel[]) => [...ks].sort((a, b) => tid(b.afsluttet) - tid(a.afsluttet) || tid(b.bestilt) - tid(a.bestilt))[0];

/**
 * `scenarier` er de AKTIVE (ikke-arkiverede) scenarier. Kørsler af arkiverede scenarier er aldrig en reference —
 * det var dem, der før blev til "kan sammenlignes med ukendt scenarie" (22 færdige kørsler af arkiverede
 * testscenarier, målt 2026-10-19).
 */
export function findReference(s: Scenarie, scenarier: readonly Scenarie[], koersler: readonly Koersel[]): Reference | undefined {
    const aktive = new Map(scenarier.map((x) => [x.id, x]));
    const navn = (id: string) => (aktive.get(id)?.navn ?? "").trim();
    const færdige = koersler.filter((k) => k.status === "faerdig");
    const egen = nyeste(færdige.filter((k) => k.scenarie_id === s.id));

    const refId = parretsReference(s, scenarier);
    if (refId && aktive.has(refId)) {
        const ref = nyeste(færdige.filter((k) => k.scenarie_id === refId));
        if (!ref) return { art: "par_ikke_koert", navn: navn(refId) };
        if (!egen) return undefined;
        const afv = sammenlignelighed(ref, egen);
        return { art: "par", navn: navn(refId), direkte: afv.length === 0, afviger: afv };
    }

    const antal = scenarier.filter((x) => x.id !== s.id && parretsReference(x, scenarier) === s.id).length;
    if (antal > 0) return { art: "er_reference", antal };

    if (!egen) return undefined;
    const kandidater = færdige.filter((k) => k.scenarie_id !== s.id && k.vaerk_id === s.vaerk_id && aktive.has(k.scenarie_id)
        && sammenlignelighed(k, egen).length === 0);
    const direkte = nyeste(kandidater);
    return direkte ? { art: "sammenlignelig", navn: navn(direkte.scenarie_id) } : { art: "ingen" };
}

/** Køens sorteringsnøgle: `modtaget` (server-tid, §6c), ellers `bestilt`. */
export function køTid(k: Pick<Koersel, "bestilt"> & { modtaget?: Date | string | null }): number {
    return new Date(k.modtaget ?? k.bestilt).getTime();
}

export function oversigtsbudskab(rækker: readonly ScenarieRække[], aktive: readonly Koersel[]): string {
    if (rækker.length === 0) return "Ingen scenarier endnu — start med et spørgsmål.";
    const værker = new Set(rækker.map((r) => r.s.vaerk_id)).size;
    const færdige = rækker.filter((r) => r.seneste?.status === "faerdig").length;
    const par = rækker.filter((r) => (r.reference?.art === "par" && r.reference.direkte) || r.reference?.art === "sammenlignelig").length;
    const regner = aktive.filter((k) => k.status !== "koe").length;
    const venter = aktive.filter((k) => k.status === "koe").length;
    const kø = regner + venter === 0 ? "Køen er tom." : `${regner} kørsel${regner === 1 ? "" : "er"} regner, ${venter} venter.`;
    return `${rækker.length} scenarier på ${værker} værk${værker === 1 ? "" : "er"}; ${færdige} har en færdig seneste kørsel, og ${par} kan sammenlignes direkte med en reference. ${kø}`;
}
