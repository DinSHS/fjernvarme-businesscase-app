//-----------------------------------------------------------------------
// Adgang til de bundtede tekster under indhold/. Vite pakker hver fil som sin egen chunk
// (`?raw`), så en bruger kun henter den tekst, hun åbner. Ingen netværkskald til GitHub.
//-----------------------------------------------------------------------

import { useEffect, useState } from "react";

const FILER = import.meta.glob("./indhold/**/*.{md,txt,json}", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

const nøgle = (rel: string) => `./indhold/${rel}`;

export function findesTekst(rel: string): boolean {
    return nøgle(rel) in FILER;
}

export function alleTekstStier(): string[] {
    return Object.keys(FILER).map((k) => k.replace("./indhold/", ""));
}

const cache = new Map<string, Promise<string>>();

/** Henter en bundtet tekst (cachet). Afvises med en læsbar fejl, hvis filen ikke er bundtet. */
export function hentTekst(rel: string): Promise<string> {
    const k = nøgle(rel);
    const hentet = cache.get(k);
    if (hentet) return hentet;
    const læs = FILER[k];
    const p = læs ? læs() : Promise.reject(new Error(`Teksten "${rel}" er ikke bundtet i appen.`));
    // En fejl (fx et mislykket chunk-hent) må ikke ligge i cachen: næste forsøg skal prøve igen.
    p.catch(() => cache.delete(k));
    cache.set(k, p);
    return p;
}

export interface TekstTilstand { tekst?: string; fejl?: Error }

/** Indlæser en tekst; `undefined` for begge felter = under indlæsning. Nøgleskift kasserer svar fra den gamle nøgle. */
export function useTekst(rel: string | undefined): TekstTilstand {
    const [svar, setSvar] = useState<TekstTilstand & { rel?: string }>({});
    useEffect(() => {
        if (rel === undefined) return;
        let annulleret = false;
        hentTekst(rel).then(
            (tekst) => { if (!annulleret) setSvar({ rel, tekst }); },
            (fejl: unknown) => { if (!annulleret) setSvar({ rel, fejl: fejl instanceof Error ? fejl : new Error(String(fejl)) }); },
        );
        return () => { annulleret = true; };
    }, [rel]);
    return svar.rel === rel ? { tekst: svar.tekst, fejl: svar.fejl } : {};
}
