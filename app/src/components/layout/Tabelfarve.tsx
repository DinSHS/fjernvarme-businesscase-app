//-----------------------------------------------------------------------
// Tabellernes farvevalg (runde 9, app/IBCS.md §8): knappen ved tabellens
// titel, valget som hook (fælles for alle tabeller af samme slags) og
// heatmap-skalagrupperne (samme enhed på en side ⇒ samme 100 %, som
// grafernes ScaleProvider). Logikken står i src/lib/tabelfarve.ts.
//-----------------------------------------------------------------------

import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { abonner, laesVisning, saetVisning, VALG, type Tabelslags, type Visning } from "@/lib/tabelfarve";

/** Det aktuelle valg for en slags tabel; alle tabeller af samme slags følger med, når én knap trykkes. */
export function useVisning(slags: Tabelslags): Visning {
    return useSyncExternalStore(abonner, () => laesVisning(slags), () => "ingen");
}

const ETIKET: Record<Visning, string> = { ingen: "Ingen", retning: "Retning", heatmap: "Heatmap" };
const FORKLARING: Record<Visning, string> = {
    ingen: "Ingen farve efter størrelse",
    retning: "Farv kun tallet efter retningen (op eller ned)",
    heatmap: "Farv cellen efter størrelsen: jo kraftigere farve, jo større",
};

/**
 * Den lille segmenterede knap ved tabellens titel (Kort.handling). Knapperne er almindelige knapper med aria-pressed,
 * så de nås med Tab og vælges med Enter/mellemrum.
 */
export function FarveValg({ slags }: { slags: Tabelslags }) {
    const v = useVisning(slags);
    return (
        <div className="fjv-farvevalg" role="group" aria-label="Farver i tabellen" data-slags={slags}>
            {VALG[slags].map((x) => (
                <button key={x} type="button" aria-pressed={v === x} title={FORKLARING[x]}
                    onClick={() => saetVisning(slags, x)}>{ETIKET[x]}</button>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------- skalagrupper

type Api = { meld: (id: string, noegle: string, maks: number) => void; glem: (id: string) => void };
const ApiKontekst = createContext<Api | null>(null);
const MaksKontekst = createContext<Map<string, number> | null>(null);

/**
 * Sidens heatmap-skalaer: tabeller, der melder samme nøgle (fx "ΔMWh·periode"), får samme 100 % — den største |værdi|
 * blandt dem. Uden provider har hver tabel sin egen skala. To kontekster af samme grund som ScaleProvider: en stabil
 * API, så tabellernes effekter ikke kører igen, når en anden tabel melder sig.
 */
export function HeatSkalaProvider({ children }: { children: ReactNode }) {
    const [meldt, setMeldt] = useState<Record<string, readonly [string, number]>>({});
    const meld = useCallback((id: string, noegle: string, maks: number) => {
        setMeldt((f) => (f[id]?.[0] === noegle && f[id]?.[1] === maks ? f : { ...f, [id]: [noegle, maks] as const }));
    }, []);
    const glem = useCallback((id: string) => {
        setMeldt((f) => {
            if (!(id in f)) return f;
            const n = { ...f };
            delete n[id];
            return n;
        });
    }, []);
    const api = useMemo(() => ({ meld, glem }), [meld, glem]);
    const maks = useMemo(() => {
        const m = new Map<string, number>();
        for (const [k, v] of Object.values(meldt)) m.set(k, Math.max(m.get(k) ?? 0, v));
        return m;
    }, [meldt]);
    return <ApiKontekst.Provider value={api}><MaksKontekst.Provider value={maks}>{children}</MaksKontekst.Provider></ApiKontekst.Provider>;
}

/** Meld tabellens største |værdi| under `noegle` og få gruppens 100 % tilbage (egen værdi uden provider). */
export function useHeatMaks(noegle: string, egen: number): number {
    const api = useContext(ApiKontekst);
    const maks = useContext(MaksKontekst);
    const id = useId();
    useLayoutEffect(() => {
        if (!api) return;
        api.meld(id, noegle, egen);
        return () => api.glem(id);
    }, [api, id, noegle, egen]);
    return Math.max(egen, maks?.get(noegle) ?? 0);
}
