//-----------------------------------------------------------------------
// Et emnes tekst og det, der regnes af den (sidens budskab, kortets budskab).
//-----------------------------------------------------------------------

import { useMemo } from "react";
import type { Hentet } from "@/lib/data/hooks";
import { useMarkdown, useRulTilAnker } from "../dokumentation/hjaelp";
import { foersteSaetning, laesetid, overskrifter, type Blok } from "../dokumentation/markdown/parse";
import type { Emne } from "./emner";

export interface EmneTekst {
    hentet: Hentet<{ blokke: Blok[]; tekst: string }>;
    /** Sidens budskab: tekstens første sætning (uden kildehenvisning). */
    budskab: string | undefined;
}

/** Indlæser et emnes tekst og regner sidens budskab af den. */
export function useEmneTekst(emne: Emne, anker?: string): EmneTekst {
    const md = useMarkdown(emne.fil);
    useRulTilAnker(anker, emne.id, md.data !== undefined);
    const budskab = useMemo(() => (md.data ? foersteSaetning(md.data.blokke) : undefined), [md.data]);
    return { hentet: md, budskab };
}

/** "ca. 2 min. læsning · 3 afsnit · 7 kildehenvisninger" — regnet af selve teksten. */
export function tekstBudskab(d: { blokke: Blok[]; tekst: string }): string {
    const { minutter } = laesetid(d.tekst);
    const afsnit = overskrifter(d.blokke).filter((o) => o.niveau === 2).length;
    const kilder = (d.tekst.match(/\(Kilder?:/g) ?? []).length;
    return [`ca. ${minutter} min. læsning`, afsnit > 0 ? `${afsnit} afsnit` : null, kilder > 0 ? `${kilder} kildehenvisninger` : null]
        .filter(Boolean).join(" · ");
}

