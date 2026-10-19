//-----------------------------------------------------------------------
// Hjælpere til graferne (ingen komponenter her — se grafer.tsx).
//-----------------------------------------------------------------------

import { useCallback, useState } from "react";
import type { DispatchPunkt } from "./beregn";

export const farve = (plads: number | undefined) => `var(--a-s${plads ?? 0})`;

/**
 * Containerens bredde (px) via en callback-ref: måles synkront, når elementet
 * monteres, og følges derefter af en ResizeObserver. (En useLayoutEffect med
 * tom afhængighedsliste målte aldrig et element, der først kommer frem efter et
 * senere datakald — dispatch-grafen forblev tom.) Uden ResizeObserver (jsdom): 640.
 */
export function useBredde<T extends HTMLElement>(): [(el: T | null) => (() => void) | undefined, number] {
    const [b, setB] = useState(() => (typeof ResizeObserver === "undefined" ? 640 : 0));
    const ref = useCallback((el: T | null) => {
        if (!el || typeof ResizeObserver === "undefined") return undefined;
        setB(Math.round(el.clientWidth));
        const ro = new ResizeObserver(() => setB(Math.round(el.clientWidth)));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, b];
}

/** Pæne akseværdier fra min til maks (inkl. 0). */
export function paeneTicks(min: number, maks: number, antal = 4): number[] {
    const lo = Math.min(0, min), hi = Math.max(0, maks);
    if (hi - lo <= 0) return [0];
    const rå = (hi - lo) / antal;
    const p = 10 ** Math.floor(Math.log10(rå));
    const trin = [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => x >= rå * 0.999)!;
    const start = Math.floor(lo / trin + 1e-9) * trin;
    const ud: number[] = [];
    for (let v = start; v < hi + trin * 0.999; v += trin) ud.push(Math.abs(v) < trin * 1e-9 ? 0 : v);
    return ud;
}

export const lagerFarve = (i: number) => (i === 0 ? "var(--dash-series)" : i === 1 ? "var(--dash-series-2)" : "var(--dash-ink-2)");

export interface DispatchSkala { prod: number; lager: number; spotMin: number; spotMaks: number }

/** Fælles skala for flere dispatch-paneler (samme skala ved sammenligning). */
export function dispatchSkala(...serier: readonly (readonly DispatchPunkt[])[]): DispatchSkala {
    let prod = 0, lager = 0, spotMin = 0, spotMaks = 0;
    for (const s of serier) for (const p of s) {
        prod = Math.max(prod, p.last, Object.values(p.prod).reduce((a, b) => a + b, 0) + p.aflad);
        for (const v of Object.values(p.lager)) lager = Math.max(lager, v);
        if (p.spot != null) { spotMin = Math.min(spotMin, p.spot); spotMaks = Math.max(spotMaks, p.spot); }
    }
    return { prod, lager, spotMin, spotMaks };
}

