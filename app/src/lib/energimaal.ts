//-----------------------------------------------------------------------
// Sammensætningens mål (runde 11): MWh · % af total. Ren logik uden React —
// det gemte valg, fælles for kørselssidens og sammenligningssidens
// "Måned for måned"-sammensætning. Samme mønster som tabelfarve.ts:
// localStorage i try/catch, så siden virker uden lager.
//
//   MWh        = absolutte stablede søjler (energiSkala: MWh eller GWh)
//   % af total = hver søjle er 100 %: enhedens andel af søjlens samlede
//                produktion (måneden eller hele perioden)
//-----------------------------------------------------------------------

export type Maal = "mwh" | "andel";
export const MAAL: readonly Maal[] = ["mwh", "andel"];
export const STANDARD_MAAL: Maal = "mwh";

const NOEGLE = "fjv.sammensaetning.maal.v1";
let husket: Maal | undefined;
const lyttere = new Set<() => void>();

/** Det gemte mål; MWh, når intet er gemt, lageret er blokeret, eller værdien er ukendt. */
export function laesMaal(): Maal {
    if (husket) return husket;
    let v: unknown = null;
    try { v = globalThis.localStorage?.getItem(NOEGLE); } catch { /* blokeret lager: siden virker uden */ }
    husket = (MAAL as readonly unknown[]).includes(v) ? (v as Maal) : STANDARD_MAAL;
    return husket;
}

/** Sætter målet for alle sammensætninger (også på andre sider) og husker det, hvis lageret tillader det. */
export function saetMaal(m: Maal): void {
    if (!MAAL.includes(m)) return;
    husket = m;
    try { globalThis.localStorage?.setItem(NOEGLE, m); } catch { /* blokeret lager: valget gælder til siden lukkes */ }
    lyttere.forEach((f) => f());
}

export function abonnerMaal(f: () => void): () => void {
    lyttere.add(f);
    return () => { lyttere.delete(f); };
}

/** Kun til test: glem det huskede, så næste læsning går til lageret igen. */
export function glemMaal(): void {
    husket = undefined;
}
