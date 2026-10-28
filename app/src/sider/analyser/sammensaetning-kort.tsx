//-----------------------------------------------------------------------
// Sammenligningssidens "Sammensætning måned for måned" (runde 11): Ref og
// Scen som små multipler side om side — samme akse, samme px pr. MWh (IBCS
// CH 4.1, skalagruppen "MWh"), samme enhedsrækkefølge og enhedskulører — og
// en tabel med rækkegrupperne Reference og Scenarie. Vælgeren MWh · % af
// total styrer både graferne og tabellen (andele.ts, lib/energimaal.ts).
// Niveauer, ikke differenser: ΔRef står i kortet "Måned for måned" lige under.
//-----------------------------------------------------------------------

import { ScaleProvider, formatValue } from "@/ibcs";
import { FarveValg, Kort, MaalValg, Tabel, useHeatMaks, useMaal, useVisning } from "@/components/layout";
import { farvning, forklaring, skalaMaks } from "@/lib/tabelfarve";
import type { Maanedstabel } from "./beregn";
import type { Pakke } from "./data";
import { PERIODE, andel, behov, celleTekst, enhedsorden, mwh, pct1, soejler, visteAndele } from "./andele";
import { dec, maanedKort } from "./fmt";
import { Forklaring, StablededeSoejler } from "./grafer";
import { ENERGI_TABEL, energiSkala } from "./ibcs-grafer";

/** Rækkenøgle for varmebehovet (kan ikke kollidere med et enhedsnavn: modellens navne er [a-z0-9_]). */
const VARMEBEHOV = "Varmebehov ";
const PCT1 = { factor: 1, prefix: "", decimals: 1 };

/** Periode-andelene (uafrundede) pr. enhed for budskabet. */
function periodeAndele(t: Maanedstabel, enheder: readonly string[]) {
    return new Map(enheder.map((e) => [e, andel(t, PERIODE, e)]));
}

export function SammensaetningMaaned({ a, b, pladser }: { a: Pakke; b: Pakke; pladser: Map<string, number> }) {
    const ta = a.maaneder, tb = b.maaneder;
    const maal = useMaal();
    const måneder = [...new Set([...ta.maaneder, ...tb.maaneder])].sort();
    const enheder = enhedsorden(ta, tb);

    // Grafernes enhed (≤ 3 cifre, SI 5.2) og tabellens (≤ 4 cifre, IBCS.md §3): ét præfiks for begge kørsler.
    const alleMwh = [ta, tb].flatMap((t) => [...måneder, PERIODE].flatMap((m) => [...enheder.map((e) => mwh(t, m, e)), behov(t, m)]));
    const G = energiSkala([ta, tb].flatMap((t) => måneder.flatMap((m) => [
        enheder.reduce((s, e) => s + (mwh(t, m, e) ?? 0), 0), behov(t, m)])));
    const T = energiSkala(alleMwh, ENERGI_TABEL);
    const gTekst = (v: number) => `${formatValue(v, G.skala)} ${G.enhed}`;
    const tTekst = (v: number) => formatValue(v, T.skala);
    const sa = soejler(ta, måneder, enheder, pladser, maal, G.skala.factor, gTekst);
    const sb = soejler(tb, måneder, enheder, pladser, maal, G.skala.factor, gTekst);
    // Fælles akse-top for Ref og Scen (små multipler, CH 4.1): højeste stak eller markør i de to kørsler.
    const top = maal === "andel" ? 100 : Math.max(0, ...[...sa, ...sb].map((s) => Math.max(s.markør ?? 0, s.dele.reduce((x, d) => x + Math.max(0, d.værdi), 0))));

    // Budskabet: den enhed, hvis andel af periodens produktion flytter mest (reference → scenarie).
    const pa = periodeAndele(ta, enheder), pb = periodeAndele(tb, enheder);
    const flyt = enheder.map((e) => {
        const x = pa.get(e), y = pb.get(e);
        // En enhed, kørslen ikke har, har andelen 0; en ukendt andel indgår ikke (K9 F1).
        return [e, x === null || y === null ? null : (y ?? 0) - (x ?? 0), x ?? 0, y ?? 0] as const;
    }).filter((r): r is readonly [string, number, number, number] => r[1] !== null).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    const budskab = måneder.length === 0 ? "Ingen månedstal."
        : flyt.length === 0 ? "Sammensætningen kan ikke sammenlignes: andelene er ukendte."
            : Math.abs(flyt[0][1]) < 0.05 ? "Enhedernes andel af periodens produktion er den samme i begge kørsler."
                : `${flyt[0][0]}s andel af periodens produktion går fra ${pct1(flyt[0][2])} i referencen til ${pct1(flyt[0][3])} i scenariet.`;

    // Tabellen: rækkegrupperne Reference og Scenarie; varmebehov kun i MWh (en andel af varmebehovet findes ikke).
    const kolonner = [...måneder, PERIODE];
    type Række = { g: "Reference" | "Scenarie"; t: Maanedstabel; e: string; første: boolean };
    const gruppe = (g: Række["g"], t: Maanedstabel): Række[] =>
        [...enheder, ...(maal === "mwh" ? [VARMEBEHOV] : [])].map((e, i) => ({ g, t, e, første: i === 0 }));
    const rækker = [...gruppe("Reference", ta), ...gruppe("Scenarie", tb)];
    const viste = new Map([ta, tb].map((t) => [t, new Map(kolonner.map((k) => [k, visteAndele(t, k, enheder)]))]));
    const værdi = (r: Række, kol: string): number | null | undefined => r.e === VARMEBEHOV ? behov(r.t, kol)
        : maal === "andel" ? viste.get(r.t)!.get(kol)!.get(r.e) : mwh(r.t, kol, r.e);
    // Heatmap som niveau (sekventielt): én skala for månederne og én for 'Hele perioden', fælles for Ref og Scen, så
    // samme farve betyder det samme i begge grupper. Varmebehovet er en anden størrelse og farves ikke.
    const vis = useVisning("niveau");
    const art = { slags: "niveau" } as const;
    const enhedsrækker = rækker.filter((r) => r.e !== VARMEBEHOV);
    const nøgle = maal === "andel" ? "%·andel" : "MWh·enhed";
    const mM = useHeatMaks(`${nøgle}·måned·sammenligning`, skalaMaks(måneder.flatMap((m) => enhedsrækker.map((r) => værdi(r, m)))));
    const mP = useHeatMaks(`${nøgle}·periode·sammenligning`, skalaMaks(enhedsrækker.map((r) => værdi(r, PERIODE))));
    const fmt = maal === "andel" ? pct1 : (v: number) => `${tTekst(v)} ${T.enhed}`;
    const legende = forklaring(vis, art, [["månederne", mM, fmt(mM)], ["hele perioden", mP, fmt(mP)]]);

    const navn = (p: Pakke, std: string) => p.scenarie?.navn ?? std;
    const fod = maal === "andel"
        ? `% af total: hver søjle er 100 % — enhedens andel af søjlens samlede produktion. Nævneren er summen af kørslens enheders produktion i måneden; for 'Hele perioden' summen af enhedernes periode-rækker (regnet på de fulde tidsserier), ikke summen af månederne. Andelene er afrundet til én decimal med største rest, så hver søjle summerer til 100,0 %. Totalen er søjlens, ikke grand total over alle måneder: en andel af den ville tegne samme form som MWh. Varmebehovet har ingen andel og vises kun under MWh.`
        : `Ref og Scen har samme akse og samme px pr. MWh (IBCS CH 4.1), samme enhedsrækkefølge og enhedskulører som resten af siden; enhedskulørerne er enhedens identitet, ikke en vurdering. Stregen er varmebehovet. 'Hele perioden' i tabellen er regnet på de fulde tidsserier, ikke som summen af månederne.`;
    return (
        <Kort titel="Sammensætning måned for måned" afgraensning={`niveau, Ref og Scen, ${maal === "andel" ? "% af søjlens produktion" : `${G.enhed} pr. enhed`}`}
            budskab={budskab}
            handling={<div className="fjv-farvevalg-raekke"><MaalValg /><FarveValg slags="niveau" /></div>}
            fod={`${fod} – = enheden findes ikke i kørslen, måneden ligger uden for dens periode, eller søjlen har ingen produktion at fordele; 'ukendt' = kørslen har enheden, men målingen mangler — aldrig 0.${legende ? ` Tabellen: ${legende.charAt(0).toLowerCase()}${legende.slice(1)}` : ""}`}>
            <Forklaring serier={enheder.map((e) => ({ navn: e, plads: pladser.get(e) ?? 0 }))}
                ekstra={maal === "mwh" ? <span><i className="fjv-a-streg" />Varmebehov</span> : undefined} />
            <ScaleProvider>
                <div className="fjv-a-to" data-maal={maal}>
                    {([["Ref", "Reference", a, sa], ["Scen", "Scenarie", b, sb]] as const).map(([kode, std, p, s]) => (
                        <div key={kode} data-scenarie={kode}>
                            <div className="fjv-a-panel-titel">
                                <i className={kode === "Ref" ? "fjv-a-hul" : "fjv-a-prik fjv-a-fyldt"} aria-hidden="true" /> <strong>{kode}</strong> · {navn(p, std)}
                            </div>
                            <StablededeSoejler søjler={s} maks={top} markørNavn={maal === "mwh" ? "Varmebehov" : undefined}
                                enhed={maal === "andel" ? "%" : G.enhed}
                                formatér={maal === "andel" ? pct1 : (v) => gTekst(v * G.skala.factor)}
                                skalagruppe={maal === "andel" ? undefined : { enhed: "MWh", faktor: G.skala.factor }} />
                        </div>
                    ))}
                </div>
            </ScaleProvider>
            <Tabel rækker={rækker} nøgle={(r) => `${r.g}|${r.e}`} kolonner={[
                { navn: "Kørsel", vis: (r) => (r.første ? <strong>{r.g}</strong> : "") },
                { navn: `Enhed (${maal === "andel" ? "%" : T.enhed})`, vis: (r) => (r.e === VARMEBEHOV ? <span className="fjv-a-svag">Varmebehov</span> : r.e) },
                ...kolonner.map((kol) => ({
                    navn: kol === PERIODE ? "Hele perioden" : maanedKort(kol), tal: true,
                    farve: (r: Række) => (r.e === VARMEBEHOV ? {} : farvning(vis, værdi(r, kol), art, kol === PERIODE ? mP : mM, maal === "andel" ? PCT1 : T.skala)),
                    vis: (r: Række) => {
                        const tekst = celleTekst(værdi(r, kol), maal === "andel" ? (v) => dec(v, 1) : tTekst);
                        return kol === PERIODE ? <strong>{tekst}</strong> : tekst;
                    },
                })),
            ]} />
        </Kort>
    );
}
