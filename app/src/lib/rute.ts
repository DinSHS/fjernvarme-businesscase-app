//-----------------------------------------------------------------------
// Hash-routing: `#/<område>/<resten…>`. Hash, så en dyb henvisning virker i
// Fabric-iframen uden server-side routing, og så frem/tilbage i browseren virker.
//
//   const { omraade, sti, gåTil } = useRute();
//   gåTil("konfiguration/andeby")   // -> #/konfiguration/andeby
//-----------------------------------------------------------------------

import { useCallback, useSyncExternalStore } from "react";

export interface Rute { omraade: string; sti: string[] }

export function parsRute(hash: string): Rute {
    const dele = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map((d) => decodeURIComponent(d));
    return { omraade: dele[0] ?? "", sti: dele.slice(1) };
}

export function rutehref(...dele: string[]): string {
    return `#/${dele.filter(Boolean).map((d) => encodeURIComponent(d)).join("/")}`;
}

const abonnér = (l: () => void) => {
    window.addEventListener("hashchange", l);
    return () => window.removeEventListener("hashchange", l);
};

export function useRute(): Rute & { gåTil: (sti: string) => void } {
    const hash = useSyncExternalStore(abonnér, () => window.location.hash, () => "");
    const gåTil = useCallback((sti: string) => { window.location.hash = `#/${sti.replace(/^#?\/?/, "")}`; }, []);
    const r = parsRute(hash);
    return { ...r, gåTil };
}
