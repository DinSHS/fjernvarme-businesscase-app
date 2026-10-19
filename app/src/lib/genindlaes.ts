//-----------------------------------------------------------------------
// Når en dovent indlæst del af appen (et områdes JS eller CSS) ikke kan hentes, er siden ikke "i stykker" —
// appen skal genindlæses. To årsager, begge målt eller kendte:
//   1. Fabric: den statiske værts session (`__Host-rayfin_sh_sid`) er udløbet i en fane, der har stået åben.
//      JS svarer `immutable` og ligger i browserens cache, men CSS og index.html er `no-store` og kræver
//      sessionen → 401 → "Unable to preload CSS …" (målt 2026-10-19; genskabt ved at slette cookien).
//   2. Et nyt deploy har fjernet de gamle hash-navne, mens fanen stod åben.
// I stedet for et dødt fejlkort vises "Genindlæs appen". Genindlæsningen er udgavens (`@/backend/auth`):
// i portalen hele portalsiden (kun den kan forny værtens session), ellers en almindelig reload.
//-----------------------------------------------------------------------

import { useSyncExternalStore } from "react";

const MØNSTRE = [
    /Unable to preload CSS/i,
    /Failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /Importing a module script failed/i,
    /Loading (CSS )?chunk [\w-]+ failed/i,
];

/** Er fejlen en mislykket indlæsning af en del af appen (og ikke en fejl i siden selv)? */
export function erIndlaesningsfejl(fejl: unknown): boolean {
    const tekst = fejl instanceof Error ? `${fejl.name}: ${fejl.message}` : String(fejl ?? "");
    return MØNSTRE.some((m) => m.test(tekst));
}

let forældet = false;
const lyttere = new Set<() => void>();

/** Markér appen som forældet (kaldt af `vite:preloadError` og af områdets fejlgrænse). */
export function markérForældet(): void {
    if (forældet) return;
    forældet = true;
    lyttere.forEach((l) => l());
}

/** Sand, når en del af appen ikke kunne hentes — skallen viser da en genindlæsningsbjælke. */
export function useForældet(): boolean {
    return useSyncExternalStore(
        (l) => { lyttere.add(l); return () => { lyttere.delete(l); }; },
        () => forældet,
        () => forældet,
    );
}

/**
 * Lyt på Vites `vite:preloadError` (udløses, når en dynamisk import eller dens CSS ikke kan hentes). Fejlen
 * gives stadig videre til områdets fejlgrænse (ingen `preventDefault`), som viser knappen; bjælken i toppen
 * gør det synligt, selv hvis fejlen sker uden for et område. Ingen automatisk genindlæsning: i portalen kræver
 * top-navigation et klik, og en automatisk løkke ville kunne gentage sig.
 */
export function installérIndlaesningsvagt(mål: Pick<Window, "addEventListener"> = window): void {
    mål.addEventListener("vite:preloadError", () => markérForældet());
}

/** Kun til tests. */
export function nulstilForældet(): void {
    forældet = false;
    lyttere.forEach((l) => l());
}
