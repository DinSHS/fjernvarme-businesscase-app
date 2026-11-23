//-----------------------------------------------------------------------
// Den frosne form af en tidsserie i en kørsels input (KONTRAKT §6d, K5-F7) — ÉN definition for backend
// (logik.ts bygFrossetInput) og browser (scenariesidens genbrug af referencer). Ren logik uden node:-importer,
// så begge kan importere den. Arbejderens form (fv-fabric2 14:00) er PRÆCIS {id, sha256} — ingen sti, ingen
// opløsning: stien slås op, hashen er det beskyttede.
//-----------------------------------------------------------------------

/** Rollerne, der fryses — begge, ikke kun varmelast. */
export const FROSNE_ROLLER = ['varmelast', 'solprofil'] as const;

/** Stien i det frosne input for en rolle. */
export const frossenSti = (rolle: (typeof FROSNE_ROLLER)[number]) => `_koersel.tidsserie.${rolle}`;

/**
 * `_koersel.tidsserie.varmelast`'s værdi (JSON), når scenariet UDTRYKKELIGT har valgt modellens syntese
 * (`_tidsserie.varmelast = "syntetisk"`). Tredje rettelsesrunde i runde 15, P2-3: før frøs valget ingen række, så det
 * frosne input ikke kunne bevise, at syntesen var valgt (og ikke bare fulgte af et værk uden aktiv serie) — og et par
 * "syntetisk reference mod målt scenarie" med en af værkets egne serier kunne ikke sammenlignes. Værdien er den, den
 * manuelle vej allerede skriver (fjv.db.oploes_tidsserier), og arbejderen læser den som "ingen tidsserie"
 * (fabric/fjv/byg_case.py › byg). Ingen ændring af rækkeskema eller arbejderens format.
 */
export const FROSSET_SYNTETISK = '"syntetisk"';

/** `_koersel.tidsserie.<rolle>`'s værdi (JSON) — præcis `{id, sha256}`, id med små bogstaver. */
export function frossenTidsserie(s: { id: string; sha256: string }): string {
    return JSON.stringify({ id: s.id.toLowerCase(), sha256: s.sha256 });
}
