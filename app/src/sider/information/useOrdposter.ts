//-----------------------------------------------------------------------
// Ordlistens poster, indlæst og parset (se ordliste.ts).
//-----------------------------------------------------------------------

import { useMemo } from "react";
import type { Hentet } from "@/lib/data/hooks";
import { useMarkdown } from "../dokumentation/hjaelp";
import { ordposter, type Ordpost } from "./ordliste";

export function useOrdposter(): Hentet<Ordpost[]> {
    const md = useMarkdown("viden/ordliste.md");
    const poster = useMemo(() => (md.data ? ordposter(md.data.blokke) : undefined), [md.data]);
    return { data: poster, fejl: md.fejl, indlæser: !poster && !md.fejl, genindlæs: () => {} };
}
