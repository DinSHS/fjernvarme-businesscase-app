//-----------------------------------------------------------------------
// Én farve pr. enhed — den SAMME i Konfiguration, Scenarier og Analyser (fv-analyse's ønske).
// Farverne er tokens i global.css (--fjv-serie-1..8, 0 = "øvrige"). Tildelingen er deterministisk:
// værkets enheder sorteret alfabetisk, de første 8 får 1..8, resten "øvrige". Paletten cykles aldrig.
//-----------------------------------------------------------------------

export const ANTAL_SERIEFARVER = 8;

/** CSS-værdi for seriefarve nr. `i` (1..8; alt andet = "øvrige"). */
export function seriefarve(i: number): string {
    return i >= 1 && i <= ANTAL_SERIEFARVER ? `var(--fjv-serie-${i})` : "var(--fjv-serie-0)";
}

/** Farven for `navn` blandt værkets enheder (`alle`). Samme input giver samme farve overalt. */
export function enhedsfarve(navn: string, alle: readonly string[]): string {
    const sorteret = [...new Set(alle)].sort((a, b) => a.localeCompare(b, "da"));
    return seriefarve(sorteret.indexOf(navn) + 1);
}
