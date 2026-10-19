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

/**
 * Navn pr. tidsserie-id. Ingen id'er → intet kald. Kan navnene ikke hentes (fx en
 * slettet række), er svaret et tomt opslag: linjen viser så det frosne sha256.
 */
export function useTidsserienavne(ider: readonly string[]): Hentet<Tidsserienavne> {
    const nøgle = ider.length ? `tidsserienavne:${ider.join(",")}` : null;
    const h = useHent(nøgle, async () => {
        const ud = new Map<string, string>();
        try {
            for (let i = 0; i < ider.length; i += BID) {
                const rækker = await læs("Tidsserie", { filter: { or: ider.slice(i, i + BID).map((id) => ({ id: { eq: id } })) } });
                for (const r of rækker) ud.set(r.id, r.navn);
            }
        } catch { /* navnet er pynt; sha256 står i det frosne input */ }
        return ud as Tidsserienavne;
    });
    const tom = useMemo<Tidsserienavne>(() => new Map(), []);
    return nøgle ? h : { data: tom, fejl: undefined, indlæser: false, genindlæs: () => {} };
}
