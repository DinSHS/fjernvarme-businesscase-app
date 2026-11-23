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
import type { TidsserieInfo } from "./varmelast";

/**
 * Seriernes navne til teksten, slået op på id (små bogstaver: DAB og mssql skriver uuid'er forskelligt).
 *
 * Efterprøvningen af rettelserne i runde 15, fund G: her blev den frosne serie (`_koersel.tidsserie.varmelast`) før
 * skrevet om til `_koersel.heat_csv` med seriens NAVN som værdi. Dermed forsvandt id og sha256, før generatoren så
 * inputtet: en målt reference mod et syntetisk scenarie blev fortalt omvendt ("målt varmelast (–) i stedet for
 * syntesen"), og to serier med samme navn var "samme input". Nu går inputtet uændret videre, og navnene følger med
 * ved siden af (`Side.tidsserienavne`) — kun til tekst; identiteten er id + sha256.
 */
function serienavne(serier: readonly TidsserieInfo[]): ReadonlyMap<string, string> {
    return new Map(serier.map((s) => [s.id.toLowerCase(), s.navn]));
}

/**
 * En "side" uden kørsel, til sætning 1 før kørsel. ordnPar/historie læser kun
 * `input` og `navn` for sætning 1; resten er tomme pladsholdere og læses ikke,
 * når der ikke er en Δ (historie returnerer da kun sætning 1).
 */
function sideUdenKørsel(input: readonly InputRække[], navn: string, vaerkNavn: string, serier: readonly TidsserieInfo[]): Side {
    return { k: {} as Koersel, navn, vaerkNavn, input, samlet: {} as Side["samlet"], profil: {} as Side["profil"], tidsserienavne: serienavne(serier) };
}

/**
 * Sætning 1 før kørsel: "I dette scenarie slår begge tanke fra — ellers som Andeby …".
 * `refInput` = referencens forventede input (eller værket, som det er).
 */
export function saetningFørKørsel(refInput: readonly InputRække[], refNavn: string, scenInput: readonly InputRække[], scenNavn: string, vaerkNavn: string, serier: readonly TidsserieInfo[] = []): string {
    // Rollerne er sidens — dette scenarie mod sin reference (parret): generatoren ordner dem ikke om (gennemgangens fund 5).
    const p = ordnPar(sideUdenKørsel(refInput, refNavn, vaerkNavn, serier), sideUdenKørsel(scenInput, scenNavn, vaerkNavn, serier), "ab");
    // Uden Δ returnerer historie() kun sætning 1 (analyser/anbefaling.ts historie: `if (v.delta === null) return s1`).
    return historie(p, { delta: null } as Vurdering);
}

export interface KørselMedData { k: Koersel; navn: string; scenarie?: Scenarie | null; input: readonly InputRække[]; noegletal: readonly Noegletal[] }

/**
 * Hele historien og vurderingen for et færdigt reference/scenarie-par.
 *
 * På scenariets side er rollerne givet af siden — dette scenarie mod sin reference — og nøgletallet i kortet "Kørsel"
 * læser dem sådan. Historien fortælles i de SAMME roller (kodegennemgangen af runde 15, fund 5: parrelationen
 * fastlægger rollerne, også når det er referencen, der bærer ændringen i forhold til værket; forskellen fortælles da
 * fra referencen til scenariet, fx "slår vi lageret tank til"). Runde 15 (mail 2) lod i stedet historien udeblive i
 * det tilfælde og henviste til sammenligningen, hvor rollerne dengang blev byttet.
 */
export function historieEfterKørsel(ref: KørselMedData, scen: KørselMedData, vaerkNavn: string, bekraeft: ReadonlySet<string>, serier: readonly TidsserieInfo[] = []): { tekst: string; vurdering: Vurdering } {
    const side = (x: KørselMedData): Side => ({
        k: x.k, navn: x.navn, vaerkNavn, input: x.input, tidsserienavne: serienavne(serier),
        samlet: samlNoegletal(x.noegletal), profil: profil(x.k, vaerkNavn, x.scenarie ?? null, x.input),
    });
    const p = ordnPar(side(ref), side(scen), "ab");
    const v = vurder(p, bekraeft);
    return { tekst: historie(p, v), vurdering: v };
}
