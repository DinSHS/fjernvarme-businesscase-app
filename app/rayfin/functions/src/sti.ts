//-----------------------------------------------------------------------
// Rene stiregler, der også bruges i browseren (ingen node:-importer) — K5-F1.
//-----------------------------------------------------------------------

/**
 * Stisegmenter, der i JavaScript betyder objektets prototype. En sti som `units.__proto__.pr_interval` ville —
 * når bladene bygges til et træ — skrive på Object.prototype og ændre normaliseringen af alle efterfølgende
 * uploads i samme proces (K5-F1). Afvises ved alle skriveindgange; et træ bygget af stier springer dem over.
 */
export const FARLIGE_SEGMENTER: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);
