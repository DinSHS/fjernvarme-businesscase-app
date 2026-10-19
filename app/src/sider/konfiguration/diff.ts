//-----------------------------------------------------------------------
// "Kan jeg stadig genskabe dette resultat?" — diff mellem en kørsels
// frosne værksinput (KoerselInput, kilde = vaerk) og værkets blade nu.
// Sammenligningen er på JSON-TEKSTEN: 12 og 12.0 er forskellige værdier
// for modellen (KONTRAKT §3.2), så de er også forskellige her.
//-----------------------------------------------------------------------

import { katalogOrden } from "./katalog";

export interface DiffRække { sti: string; art: "ændret" | "tilføjet" | "fjernet"; før: string | null; nu: string | null }

export function diffKoersel(
    input: readonly { kilde: string; sti: string; vaerdi_json: string }[],
    nu: readonly { sti: string; vaerdi_json: string }[],
): DiffRække[] {
    const da = new Map(input.filter((r) => r.kilde === "vaerk").map((r) => [r.sti, r.vaerdi_json]));
    const nuMap = new Map(nu.map((b) => [b.sti, b.vaerdi_json]));
    const ud: DiffRække[] = [];
    for (const [sti, før] of da) {
        const n = nuMap.get(sti);
        if (n === undefined) ud.push({ sti, art: "fjernet", før, nu: null });
        else if (n !== før) ud.push({ sti, art: "ændret", før, nu: n });
    }
    for (const [sti, n] of nuMap) if (!da.has(sti)) ud.push({ sti, art: "tilføjet", før: null, nu: n });
    return ud.sort((a, b) => katalogOrden(a.sti) - katalogOrden(b.sti) || a.sti.localeCompare(b.sti));
}

/** Kørslens egne tilføjelser oven på værket (scenariets ændringer og særlige felter). */
export function koerselsTillaeg(input: readonly { kilde: string; sti: string; vaerdi_json: string }[]) {
    return input.filter((r) => r.kilde !== "vaerk").sort((a, b) => a.sti.localeCompare(b.sti));
}
