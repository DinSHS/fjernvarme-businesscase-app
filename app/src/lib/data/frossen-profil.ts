//-----------------------------------------------------------------------
// Den KORTE frosne profil for mange kørsler ad gangen.
//
// Efterprøvningen af rettelserne i runde 15, fund D: dommen over et par (analyser/beregn.ts › sammenlignelighedsDom)
// kræver kørslens effektive periode, dens frosne pins og dens varmelast og solprofil — og de står i det frosne input,
// ikke på Koersel-rækken (manifestet bærer kun rene datoer). Scenarier-oversigten og kandidatlisten har hundredvis af
// kørsler og kan ikke hente hele værket for hver (flere hundrede blade pr. kørsel). Den korte profil er:
//
//   * kørslens EGNE rækker (kilde `scenarie`/`aendring`): periode, pins, tidsserier, varmelastfil, solverens gab;
//   * værkets tidsblok (`time.start`, `time.end`, `time.resolution`; kilde `vaerk`) — den akse, kørslen regnes på, når
//     scenariet ingen datoer har;
//   * enhedernes profilsti (`units.<enhed>.production_profile_path`; tredje rettelsesrunde, P2-4): den fil, en
//     solvarmeenhed læser, når kørslen ingen solprofil-tidsserie har frosset. Uden den ville oversigten dømme et par
//     anderledes end Analyser, som har hele det frosne input (beregn.ts › profil, repoprofiler.ts).
//
// Det er netop det, `effektivPeriode`, `frossetFlag` og `tidsseriekilde` læser. Hentes i bidder (DAB: 100 rækker pr.
// side; `læs` paginerer).
//-----------------------------------------------------------------------

import type { InputRække } from "./afflad";
import { useHent, type Hentet } from "./hooks";
import { læs } from "./laes";

/** De af værkets blade, sammenligningsprofilen læser. */
export const PROFIL_VAERKSSTIER = ["time.start", "time.end", "time.resolution"] as const;

/** Endelsen på en enheds profilsti. Filteret bruger `endsWith` (som `startsWith` i lib/arkiv/markering.ts). */
const PROFILSTI_ENDELSE = ".production_profile_path";
const PROFILSTI = /^units\.[^.]+\.production_profile_path$/;

const BID = 50;

/** Filteret for én bid kørsler: deres egne rækker og værkets tidsblok. */
export function kortProfilFilter(ids: readonly string[]) {
    return {
        and: [
            { or: ids.map((id) => ({ koersel_id: { eq: id } })) },
            { or: [{ kilde: { eq: "aendring" } }, { kilde: { eq: "scenarie" } }, ...PROFIL_VAERKSSTIER.map((sti) => ({ sti: { eq: sti } })), { sti: { endsWith: PROFILSTI_ENDELSE } }] },
        ],
    };
}

/** Hører rækken til den korte profil? (Den falske klient i tests forstår ikke alle filtre; tjek igen.) */
export function iKortProfil(r: { kilde: string; sti: string }): boolean {
    return r.kilde !== "vaerk" || (PROFIL_VAERKSSTIER as readonly string[]).includes(r.sti) || PROFILSTI.test(r.sti);
}

export async function hentKortFrossenProfil(ids: readonly string[]): Promise<Map<string, InputRække[]>> {
    const ud = new Map<string, InputRække[]>(ids.map((id) => [id, []]));
    for (let i = 0; i < ids.length; i += BID) {
        const rækker = await læs("KoerselInput", { filter: kortProfilFilter(ids.slice(i, i + BID)) });
        for (const r of rækker) if (iKortProfil(r)) ud.get(r.koersel_id)?.push({ kilde: r.kilde, sti: r.sti, vaerdi_json: r.vaerdi_json });
    }
    return ud;
}

/** Den korte frosne profil pr. kørsels-id. Ingen id'er = intet kald (`data` er da et tomt opslag). */
export function useKortFrossenProfil(ids: readonly string[] | undefined): Hentet<Map<string, InputRække[]>> {
    const sorteret = ids ? [...ids].sort() : undefined;
    const h = useHent(sorteret && sorteret.length ? `kort-profil:${sorteret.join(",")}` : null, () => hentKortFrossenProfil(sorteret!));
    return sorteret && sorteret.length === 0 ? { ...h, data: new Map() } : h;
}
