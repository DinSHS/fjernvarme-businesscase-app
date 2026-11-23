//-----------------------------------------------------------------------
// Scenariets historie (briefs/15, A2) — TILSLUTNING til fv-analyse's
// generator (analyser/anbefaling.ts). Her står ingen tekstregler; kun hvordan
// scenariesiden giver generatoren sine data:
//
//   før kørsel:  sætning 1 af det input, kørslen VILLE få frosset
//                (logik.ts forventetInput), mod referencens forventede input
//                eller værket, som det er;
//   efter kørsel med reference: hele historien + vurderingen af de to
//                faktiske kørsler (frosset input + nøgletal).
//-----------------------------------------------------------------------

import { historie, ordnPar, vurder, type Side, type Vurdering } from "../analyser/anbefaling";
import { profil, samlNoegletal, type Koersel, type Noegletal, type Scenarie } from "../analyser/beregn";
import type { InputRække } from "@/lib/data/afflad";
import { FROSSET_TIDSSERIE_STI, type TidsserieInfo } from "./varmelast";

/**
 * Generatoren kender målt varmelast som `_koersel.heat_csv` (repo-filen), endnu ikke den frosne serie
 * `_koersel.tidsserie.varmelast` (§6d). Til TEKSTEN oversættes serien derfor til samme form med seriens
 * navn — kun her, aldrig i det, der gemmes eller sammenlignes. (Ønske til fv-analyse2 i rapporten.)
 */
function medSerienavn(input: readonly InputRække[], serier: readonly TidsserieInfo[]): InputRække[] {
    return input.map((r) => {
        if (r.sti !== FROSSET_TIDSSERIE_STI) return r;
        let id: string | undefined;
        try { id = (JSON.parse(r.vaerdi_json) as { id?: string }).id; } catch { id = undefined; }
        const navn = serier.find((s) => s.id.toLowerCase() === id?.toLowerCase())?.navn ?? "værkets tidsserie";
        return { ...r, sti: "_koersel.heat_csv", vaerdi_json: JSON.stringify(navn) };
    });
}

/**
 * En "side" uden kørsel, til sætning 1 før kørsel. ordnPar/historie læser kun
 * `input` og `navn` for sætning 1; resten er tomme pladsholdere og læses ikke,
 * når der ikke er en Δ (historie returnerer da kun sætning 1).
 */
function sideUdenKørsel(input: readonly InputRække[], navn: string, vaerkNavn: string): Side {
    return { k: {} as Koersel, navn, vaerkNavn, input, samlet: {} as Side["samlet"], profil: {} as Side["profil"] };
}

/**
 * Sætning 1 før kørsel: "I dette scenarie slår begge tanke fra — ellers som Andeby …".
 * `refInput` = referencens forventede input (eller værket, som det er).
 */
export function saetningFørKørsel(refInput: readonly InputRække[], refNavn: string, scenInput: readonly InputRække[], scenNavn: string, vaerkNavn: string, serier: readonly TidsserieInfo[] = []): string {
    const p = ordnPar(sideUdenKørsel(medSerienavn(refInput, serier), refNavn, vaerkNavn), sideUdenKørsel(medSerienavn(scenInput, serier), scenNavn, vaerkNavn));
    // Uden Δ returnerer historie() kun sætning 1 (analyser/anbefaling.ts historie: `if (v.delta === null) return s1`).
    return historie(p, { delta: null } as Vurdering);
}

export interface KørselMedData { k: Koersel; navn: string; scenarie?: Scenarie | null; input: readonly InputRække[]; noegletal: readonly Noegletal[] }

/**
 * Hele historien og vurderingen for et færdigt reference/scenarie-par.
 *
 * Runde 15 (mail 2, den uafhængige test 18. november 2026): på scenariets side er rollerne givet af siden — dette
 * scenarie mod sin reference — og nøgletallet i kortet "Kørsel" læser dem sådan. Generatoren (ordnPar) fortæller
 * derimod den kørsel, der BÆRER ændringen, som scenariet. Er det referencen (`byttet`), ville historien handle om
 * den anden kørsel end nøgletallet, med modsat fortegn. Så fortælles den ikke her: teksten siger, hvem der bærer
 * ændringen, og henviser til sammenligningen, hvor hele siden har de roller.
 */
export function historieEfterKørsel(ref: KørselMedData, scen: KørselMedData, vaerkNavn: string, bekraeft: ReadonlySet<string>, serier: readonly TidsserieInfo[] = []): { tekst: string; vurdering: Vurdering; byttet: boolean } {
    const side = (x: KørselMedData): Side => ({
        k: x.k, navn: x.navn, vaerkNavn, input: medSerienavn(x.input, serier),
        samlet: samlNoegletal(x.noegletal), profil: profil(x.k, vaerkNavn, x.scenarie ?? null, x.input),
    });
    const p = ordnPar(side(ref), side(scen));
    const v = vurder(p, bekraeft);
    if (p.byttet) {
        return {
            byttet: true, vurdering: v,
            tekst: `Her er det referencen «${ref.navn}», der bærer ændringen i forhold til værket; dette scenarie er uden den. `
                + "Historien og anbefalingen handler om ændringen og står derfor i sammenligningen, hvor referencen her er scenariet.",
        };
    }
    return { tekst: historie(p, v), vurdering: v, byttet: false };
}
