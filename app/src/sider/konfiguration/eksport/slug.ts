//-----------------------------------------------------------------------
// Modelrepoets slug() (scripts/vaerksark_til_yaml.py:101-108) — skilt ud fra
// kort.ts, så navnereglen ved oprettelse (redigering.ts, hovedbundtet) kan
// bruge den uden at hente eksporten (Codex K11 F1).
//-----------------------------------------------------------------------

/** slug() i scriptet: NFKD, æøå -> ae/oe/aa, alt uden for ASCII bort, [^a-z0-9]+ -> _, uden _ i enderne. */
export function slug(navn: string): string {
    let s = navn.normalize("NFKD").replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa");
    // .encode("ascii", "ignore"): alt uden for ASCII falder bort.
    s = [...s].filter((c) => c.charCodeAt(0) < 128).join("").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return s;
}
