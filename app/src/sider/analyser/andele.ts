//-----------------------------------------------------------------------
// Sammensætningen måned for måned (runde 11): produktionen pr. enhed og
// søjle (måned eller hele perioden) i MWh eller som andel af søjlens total.
// Ren logik — graferne og tabellerne står i sammensaetning-kort.tsx og
// koersel.tsx.
//
// Nævneren for '% af total' er søjlens samlede produktion: summen af
// kørslens enheders produktion i måneden — og for 'Hele perioden' summen af
// enhedernes periode-rækker (regnet på de fulde tidsserier), aldrig summen
// af månederne. Codex K9 F1: ukendt er ikke 0. Mangler én enheds måling, er
// søjlens total ukendt, og så er alle søjlens andele ukendte.
//-----------------------------------------------------------------------

import type { Maanedstabel } from "./beregn";
import type { Maal } from "@/lib/energimaal";
import { dec, maanedKort } from "./fmt";
import type { StakSoejle } from "./grafer";

/** Kolonnenøglen for hele perioden (som Maanedstabel.periode). */
export const PERIODE = "periode";

/**
 * Enhedens produktion i GWh i en måned eller hele perioden. `undefined` = fraværende: enheden findes ikke i kørslen,
 * eller måneden ligger uden for kørslens periode. `null` = ukendt: kørslen har enheden, men målingen mangler.
 */
export function produktion(t: Maanedstabel, kol: string, e: string): number | null | undefined {
    if ((kol !== PERIODE && !t.maaneder.includes(kol)) || !t.objekter("produktion_gwh").includes(e)) return undefined;
    return kol === PERIODE ? t.periode(e, "produktion_gwh") : t.vaerdi(kol, e, "produktion_gwh");
}

/**
 * Søjlens samlede produktion i GWh: summen over kørslens egne enheder. `null`, når én af dem er ukendt; `undefined`,
 * når måneden ligger uden for kørslens periode (eller kørslen ingen enheder har).
 */
export function soejleTotal(t: Maanedstabel, kol: string): number | null | undefined {
    const egne = t.objekter("produktion_gwh");
    if ((kol !== PERIODE && !t.maaneder.includes(kol)) || egne.length === 0) return undefined;
    let sum = 0;
    for (const e of egne) {
        const v = produktion(t, kol, e);
        if (v == null) return null;
        sum += v;
    }
    return sum;
}

/**
 * Enhedens andel i % af søjlens samlede produktion — uafrundet; kendte andele i en søjle summerer til 100. `undefined`
 * for en fraværende enhed eller søjle, og når søjlen intet producerer (en andel af 0 findes ikke — fx en delmåned, hvor
 * lageret leverer); `null`, når enhedens eller søjlens total er ukendt.
 */
export function andel(t: Maanedstabel, kol: string, e: string): number | null | undefined {
    const v = produktion(t, kol, e);
    if (v === undefined) return undefined;
    const total = soejleTotal(t, kol);
    if (v === null || total === null) return null;
    if (total === undefined || !(total > 0)) return undefined;
    return (v / total) * 100;
}

/**
 * Afrund procenter til `d` decimaler, så de summerer præcis til deres afrundede sum (100,0 for en hel søjle): største
 * rest. Ellers giver tre lige store andele 33,3 + 33,3 + 33,3 = 99,9. Ikke-endelige værdier passerer urørt.
 */
export function afrundMedStoersteRest(v: readonly (number | null | undefined)[], d = 1): (number | null | undefined)[] {
    const f = 10 ** d;
    const idx = v.map((x, i) => [x, i] as const).filter((p): p is readonly [number, number] => p[0] != null && Number.isFinite(p[0]));
    if (idx.length === 0) return [...v];
    const skaleret = idx.map(([x]) => x * f);
    const gulv = skaleret.map(Math.floor);
    const maal = Math.round(skaleret.reduce((a, x) => a + x, 0));
    let mangler = maal - gulv.reduce((a, x) => a + x, 0);
    // Største rest først; ved lige rest den største værdi (stabilt: dernæst rækkefølgen).
    const orden = skaleret.map((x, j) => j).sort((a, b) => (skaleret[b] - gulv[b]) - (skaleret[a] - gulv[a]) || skaleret[b] - skaleret[a] || a - b);
    for (const j of orden) { if (mangler <= 0) break; gulv[j] += 1; mangler -= 1; }
    const ud: (number | null | undefined)[] = [...v];
    idx.forEach(([, i], j) => { ud[i] = gulv[j] / f; });
    return ud;
}

/** De viste andele (1 decimal, største rest) for enhederne i én søjle, i enhedernes rækkefølge. */
export function visteAndele(t: Maanedstabel, kol: string, enheder: readonly string[]): Map<string, number | null | undefined> {
    const rå = enheder.map((e) => andel(t, kol, e));
    const afr = afrundMedStoersteRest(rå, 1);
    return new Map(enheder.map((e, i) => [e, afr[i]]));
}

/** En procent med én decimal til tabeller og tooltip: "23,4 %". */
export const pct1 = (v: number) => `${dec(v, 1)} %`;

/** Fraværende (undefined) er "–"; ukendt (null) er "ukendt" — aldrig 0 (Codex K9 F1). */
export function celleTekst(v: number | null | undefined, f: (x: number) => string): string {
    return v === undefined ? "–" : v === null || !Number.isFinite(v) ? "ukendt" : f(v);
}

/** Varmebehovet i MWh for en måned eller hele perioden; undefined uden for kørslens periode. */
export function behov(t: Maanedstabel, kol: string): number | null | undefined {
    if (kol !== PERIODE && !t.maaneder.includes(kol)) return undefined;
    const v = kol === PERIODE ? t.periode(null, "varmebehov_gwh") : t.vaerdi(kol, null, "varmebehov_gwh");
    return v == null ? null : v * 1000;
}

/** Enhedens produktion i MWh (fraværende/ukendt som produktion()). */
export const mwh = (t: Maanedstabel, kol: string, e: string) => { const v = produktion(t, kol, e); return v == null ? v : v * 1000; };

/** Enhederne fra begge kørsler, i scenariets rækkefølge (største produktion i perioden først), som Δ-kortet. */
export function enhedsorden(ta: Maanedstabel, tb: Maanedstabel): string[] {
    return [...new Set([...ta.objekter("produktion_gwh"), ...tb.objekter("produktion_gwh")])]
        .sort((x, y) => (tb.periode(y, "produktion_gwh") ?? 0) - (tb.periode(x, "produktion_gwh") ?? 0) || x.localeCompare(y));
}

/**
 * Søjlerne for én kørsel. MWh: månederne med varmebehovet som markør, i grafens enhed (`faktor` MWh pr. enhed).
 * % af total: månederne + 'Hele perioden' (adskilt), hver = 100 %; uden markør. Tooltip viser både energi og andel.
 */
export function soejler(t: Maanedstabel, måneder: readonly string[], enheder: readonly string[], pladser: Map<string, number>,
    maal: Maal, faktor: number, energiTekst: (mwh: number) => string): StakSoejle[] {
    const kolonner = maal === "andel" ? [...måneder, PERIODE] : måneder;
    return kolonner.map((kol) => {
        const viste = visteAndele(t, kol, enheder);
        const tip = (e: string) => `${celleTekst(mwh(t, kol, e), energiTekst)} · ${celleTekst(viste.get(e), pct1)}`;
        const b = maal === "mwh" ? behov(t, kol) : undefined;
        return {
            etiket: kol === PERIODE ? "Periode" : maanedKort(kol),
            adskilt: kol === PERIODE,
            dele: enheder.filter((e) => produktion(t, kol, e) !== undefined).map((e) => ({
                navn: e, plads: pladser.get(e) ?? 0, tip: tip(e),
                værdi: maal === "andel" ? andel(t, kol, e) ?? 0 : (mwh(t, kol, e) ?? 0) / faktor,
            })),
            ...(b != null ? { markør: b / faktor, topEtiket: energiTekst(b).replace(/ [GM]Wh$/, "") } : {}),
        };
    });
}
