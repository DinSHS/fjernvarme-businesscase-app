//-----------------------------------------------------------------------
// Grafernes bredde i pixel (ResizeObserver), så tekst har tokenstørrelsen.
//-----------------------------------------------------------------------

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Grafen tegnes i sin FAKTISKE pixelbredde (viewBox = bredden), så akse- og etiketskrift
 * har tokenstørrelsen uanset kortets bredde. Med en fast viewBox skaleres teksten med kortet
 * (målt: 11 px blev til 23 px i et 900 px kort).
 */
export function useBredde(): [RefObject<HTMLDivElement | null>, number] {
    const ref = useRef<HTMLDivElement | null>(null);
    const [b, setB] = useState(420);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const mål = () => setB(Math.max(240, Math.round(el.getBoundingClientRect().width)));
        mål();
        const ro = new ResizeObserver(mål);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, b];
}
