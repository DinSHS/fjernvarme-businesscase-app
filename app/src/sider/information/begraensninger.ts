//-----------------------------------------------------------------------
// Begrænsningerne (viden/begraensninger.md): en tabel "Begrænsning | Betydning for tallene".
//-----------------------------------------------------------------------

import { inlineTekst, type Blok, type Inline } from "../dokumentation/markdown/parse";

export interface Begraensning { hvad: Inline[]; betyder: Inline[] }

export function begraensninger(blokke: readonly Blok[]): Begraensning[] {
    const t = blokke.find((b): b is Extract<Blok, { t: "tabel" }> => b.t === "tabel");
    return t ? t.raekker.map((r) => ({ hvad: r[0] ?? [], betyder: r[1] ?? [] })) : [];
}

/** "11 begrænsninger — den første: Absolutte tal er for gode, mest for balancemarkedet." */
export function begraensningerBudskab(blokke: readonly Blok[]): string | undefined {
    const l = begraensninger(blokke);
    if (l.length === 0) return undefined;
    const første = inlineTekst(l[0].betyder).trim();
    return `${l.length} begrænsninger, hver med sin betydning for tallene — først: ${første}`;
}
