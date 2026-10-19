//-----------------------------------------------------------------------
// Hjælpere (hooks og rene funktioner) til Dokumentation og Information. Ligger for sig selv, fordi en fil med både
// komponenter og hjælpere ikke kan genindlæses hurtigt under udvikling (react-refresh).
//-----------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import type { Hentet } from "@/lib/data/hooks";
import { ANKER_PREFIX, parsMarkdown, type Blok } from "./markdown/parse";
import { useTekst } from "./tekster";

/** Er viewporten mindst `px` bred? (CSS-brudpunktet for gitteret er 900 px.) Uden matchMedia (jsdom) regnes den som bred. */
export function useMinBredde(px = 900): boolean {
    const mq = typeof window !== "undefined" && typeof window.matchMedia === "function" ? `(min-width: ${px}px)` : null;
    const [bred, setBred] = useState(() => (mq ? window.matchMedia(mq).matches : true));
    useEffect(() => {
        if (!mq) return;
        const m = window.matchMedia(mq);
        const l = () => setBred(m.matches);
        m.addEventListener("change", l);
        l();
        return () => m.removeEventListener("change", l);
    }, [mq]);
    return bred;
}

/**
 * Ruller til et anker (eller til toppen), når teksten er klar. Hash-routing bruger sit eget `#`, så browseren
 * ruller ikke af sig selv til et `#anker` efter ruten — det gør vi.
 */
export function useRulTilAnker(anker: string | undefined, nøgle: string, klar: boolean, prefix: string = ANKER_PREFIX): void {
    useEffect(() => {
        if (!klar) return;
        const el = anker ? document.getElementById(prefix + anker) : null;
        if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start" });
        else if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
    }, [anker, nøgle, klar, prefix]);
}

/** "dokumentation/readme#helår" -> ["readme", "helår"]. Ankeret står efter ruteleddets egen `#`. */
export function delAnker(led: string | undefined): [string | undefined, string | undefined] {
    if (!led) return [undefined, undefined];
    const i = led.indexOf("#");
    if (i < 0) return [led, undefined];
    return [led.slice(0, i) || undefined, led.slice(i + 1) || undefined];
}

/** Indlæser og parser en bundtet markdowntekst; formen er en `Hentet`, så `DataTilstand` kan bruges. */
export function useMarkdown(rel: string | undefined): Hentet<{ blokke: Blok[]; tekst: string }> & { tekst?: string } {
    const t = useTekst(rel);
    const data = useMemo(() => (t.tekst === undefined ? undefined : { tekst: t.tekst, blokke: parsMarkdown(t.tekst) }), [t.tekst]);
    return { data, fejl: t.fejl, indlæser: !data && !t.fejl, genindlæs: () => {}, tekst: t.tekst };
}
