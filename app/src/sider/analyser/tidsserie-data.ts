//-----------------------------------------------------------------------
// Tidsseriernes navne til "Data i denne kørsel" og Varmelast-kolonnen
// (brief 18). Kun navnet hentes levende; sha256 vises altid fra det frosne
// input. Bygget på fundamentets `useHent` + `læs` (pagineret, normaliseret).
// Ønske til fundamentet: `useTidsserier(vaerkId?)` (står i rapporten).
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { useHent, type Hentet } from "@/lib/data/hooks";
import { læs } from "@/lib/data/laes";
import type { InputRække } from "@/lib/data/afflad";
import { frosneTidsserier, type Tidsserienavne } from "./datagrundlag";

const BID = 50;

/** Id'erne på alle frosne tidsserier i et eller flere inputs. */
export function tidsserieIder(inputs: Iterable<readonly InputRække[]>): string[] {
    const ider = new Set<string>();
    for (const input of inputs) for (const t of frosneTidsserier(input)) if (t.id) ider.add(t.id);
    return [...ider].sort();
}

/** sha256 pr. frossen tidsserie-id (til opslaget efter indhold, når id'et ikke findes her). */
export function tidsserieShas(inputs: Iterable<readonly InputRække[]>): Map<string, string> {
    const ud = new Map<string, string>();
    for (const input of inputs) for (const t of frosneTidsserier(input)) if (t.id && t.sha256) ud.set(t.id, t.sha256);
    return ud;
}

/**
 * Navn pr. tidsserie-id. Ingen id'er → intet kald. Kan navnene ikke hentes (fx en
 * slettet række), er svaret et tomt opslag: linjen viser så det frosne sha256.
 * En kørsel importeret fra et arkiv (runde 13) har en anden installations id'er i sit frosne input; findes id'et
 * ikke her, slås serien op på sit sha256 (samme indhold = samme fil, KONTRAKT §6d).
 */
export function useTidsserienavne(ider: readonly string[], shas: ReadonlyMap<string, string> = new Map()): Hentet<Tidsserienavne> {
    const nøgle = ider.length ? `tidsserienavne:${ider.join(",")}` : null;
    const h = useHent(nøgle, async () => {
        const ud = new Map<string, string>();
        try {
            for (let i = 0; i < ider.length; i += BID) {
                const rækker = await læs("Tidsserie", { filter: { or: ider.slice(i, i + BID).map((id) => ({ id: { eq: id } })) } });
                for (const r of rækker) ud.set(r.id, r.navn);
            }
            const mangler = ider.filter((id) => !ud.has(id) && shas.has(id));
            for (let i = 0; i < mangler.length; i += BID) {
                const bid = mangler.slice(i, i + BID);
                const rækker = await læs("Tidsserie", { filter: { or: bid.map((id) => ({ sha256: { eq: shas.get(id) } })) } });
                for (const id of bid) {
                    const r = rækker.find((x) => x.sha256 === shas.get(id));
                    if (r) ud.set(id, r.navn);
                }
            }
        } catch { /* navnet er pynt; sha256 står i det frosne input */ }
        return ud as Tidsserienavne;
    });
    const tom = useMemo<Tidsserienavne>(() => new Map(), []);
    return nøgle ? h : { data: tom, fejl: undefined, indlæser: false, genindlæs: () => {} };
}
