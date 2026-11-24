// Testdata: en kørsels frosne periode, som `startBestilling` fryser scenariets datoer (`_koersel.start/slut`).
//
// Efterprøvningen af rettelserne i runde 15, fund D: dommen over et par udleder perioden af det FROSNE input —
// manifestets rene datoer er kun kontrollen. Ældre tests byggede kørsler med et manifest og intet input; de får her
// det input, en rigtig kørsel med de datoer ville have haft.
import type { InputRække } from "@/lib/data/afflad";
import type { Koersel } from "../../../../rayfin/data/Koersel";

export function frossenPeriode(k: Pick<Koersel, "manifest_json">): InputRække[] {
    let p: { start?: string; slut?: string } | undefined;
    try { p = (JSON.parse(k.manifest_json ?? "{}") as { periode?: { start?: string; slut?: string } }).periode; } catch { p = undefined; }
    if (!p?.start || !p.slut) return [];
    return [
        { kilde: "scenarie", sti: "_koersel.start", vaerdi_json: JSON.stringify(p.start.slice(0, 10)) },
        { kilde: "scenarie", sti: "_koersel.slut", vaerdi_json: JSON.stringify(p.slut.slice(0, 10)) },
    ];
}

/** De to kørslers frosne input i den form, `modReference` og kørselskortet tager dem. */
export const frossetPar = (reference: Pick<Koersel, "manifest_json">, k: Pick<Koersel, "manifest_json">) => ({ reference: frossenPeriode(reference), k: frossenPeriode(k) });

/** Den korte frosne profil pr. kørsels-id, som oversigten henter den. */
export const frossetFor = (ks: readonly Koersel[]): Map<string, InputRække[]> => new Map(ks.map((k) => [k.id, frossenPeriode(k)]));
