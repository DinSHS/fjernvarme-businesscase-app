//-----------------------------------------------------------------------
// "Opdatér"-knappen: én global version, som alle hooks lytter på. Et tryk
// (eller en gemt ændring) øger versionen, og hver synlig hook henter igen.
// Ingen timer — databasen røres kun, når nogen beder om det.
//-----------------------------------------------------------------------

import { useSyncExternalStore } from "react";

let version = 0;
const lyttere = new Set<() => void>();

export function opdaterAlt(): void {
    version++;
    for (const l of lyttere) l();
}

export function useOpdateringsVersion(): number {
    return useSyncExternalStore(
        (l) => { lyttere.add(l); return () => lyttere.delete(l); },
        () => version,
        () => version,
    );
}
