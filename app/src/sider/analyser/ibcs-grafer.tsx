//-----------------------------------------------------------------------
// Analysernes IBCS-grafer (app/IBCS.md, specs i app/docs/ibcs/). Tynde
// adaptere oven på src/ibcs: rækkerne formes her, layout og notation kommer
// fra biblioteket. Scenariekoder: Scen = fyldt mørk (bibliotekets AC),
// Ref = omrids (bibliotekets PL), ΔRef = Scen − Ref. Farverne er temaets
// variabler, så lys/mørk og alle temaer virker uden kode her.
//-----------------------------------------------------------------------

import type { ReactNode } from "react";
import {
    KpiCard, MarksSvg, formatDelta, formatValue, impactKey, impactText, layoutStructureBars, layoutVarianceWaterfall, roundsToZero, structureExtents, useScale,
    type Bridge, type KpiVariance, type Layout, type NumberScale, type ScaleRequest, type StructureRow,
} from "@/ibcs";
import { relativAfvigelse, varianseOrden, type EnhedTal, type EnhedVarians, type Samlet } from "./beregn";
import { useBredde } from "./graf-hjaelp";

/** Scenariekoderne i grafernes legender, tooltips og skjulte tabeller (IBCS.md §1). */
export const KODER = { primary: "Scen", reference: "Ref", delta: "ΔRef", category: "Enhed" } as const;

/** Bredden under denne stabler varians-tierne under bjælkerne (telefon). */
const SMAL = 640;

/**
 * Mål containeren, læg layoutet ud og tegn det. `lav` får bredden i px. `undertitel` er grafens synlige undertitel
 * (UN 2.2: kun det, der adskiller grafen fra kortets titel — typisk målet i fed og enheden); `titel` er det tilgængelige navn.
 */
export function IbcsFigur({ titel, lav, beskrivelse, undertitel, skalagruppe }: {
    titel: string; lav: (bredde: number, ppu?: number) => Layout | null; beskrivelse?: string; undertitel?: ReactNode; skalagruppe?: Skalagruppe;
}) {
    const [ref, bredde] = useBredde<HTMLDivElement>();
    const ppu = useSkalagruppe(skalagruppe, bredde);
    const layout = bredde > 0 ? lav(bredde, ppu) : null;
    return (
        <div className="fjv-a-graf fjv-ibcs" ref={ref}>
            {undertitel && <div className="fjv-ibcs-undertitel">{undertitel}</div>}
            {layout && <MarksSvg layout={layout} title={titel} desc={beskrivelse} />}
        </div>
    );
}

// ---------------------------------------------------------------- skalaer

/**
 * En grafs plads i sidens skalagruppe (IBCS CH 4.1: samme enhed på en side ⇒ samme px pr. enhed). `enhed` er gruppens
 * nøgle (fx "MWh"), min/maks grafens udstrækning i den enhed, og `plads(bredde)` de px, grafen højst må bruge.
 */
export interface Skalagruppe { enhed: string; min: number; max: number; plads: (bredde: number) => number }

/**
 * Registrér grafen i sidens ScaleProvider og læs gruppens px pr. enhed (den mindste i gruppen). Uden provider — eller før
 * første layout — er det grafens egen; uden gruppe undefined. Delt af IBCS-graferne og grafer.tsx (Codex K7 F6).
 */
export function useSkalagruppe(g: Skalagruppe | undefined, bredde: number): number | undefined {
    const req: ScaleRequest[] = g && bredde > 0 ? [{ unit: g.enhed, min: g.min, max: g.max, availablePx: g.plads(bredde) }] : [];
    return useScale(req).get(g?.enhed ?? "");
}

/**
 * Energi: GWh med 2 decimaler, når det største tal ellers får mere end `cifre` heltalscifre i MWh; ellers MWh uden
 * decimaler. Ét præfiks for hele grafen eller tabellen. Grafer ≤ 3 cifre (SI 5.2, skift ved 1.000 MWh); tabeller og
 * kort ≤ 4 cifre (IBCS.md §3, skift ved 10.000 MWh) — samme regel, kald med `ENERGI_TABEL`.
 */
export function energiSkala(mwh: readonly (number | null | undefined)[], cifre = 3): { skala: NumberScale; enhed: "GWh" | "MWh" } {
    const maks = Math.max(0, ...mwh.map((v) => (v == null || !Number.isFinite(v) ? 0 : Math.abs(v))));
    // Afrundet, som MWh vises (0 decimaler): 9.999,6 MWh står som "10.000" — 5 cifre — og skal derfor være GWh.
    return Math.round(maks) >= 10 ** cifre ? { skala: { factor: 1000, prefix: "G", decimals: 2 }, enhed: "GWh" } : { skala: { factor: 1, prefix: "", decimals: 0 }, enhed: "MWh" };
}
/** Tabeller og kort: højst 4 heltalscifre (IBCS.md §3) — `energiSkala(tal, ENERGI_TABEL)`. */
export const ENERGI_TABEL = 4;

/** Driftsomkostning i t.kr. med én decimal (IBCS.md §3: ≤ 4 cifre i tabeller og kort). */
export const TKR: NumberScale = { factor: 1000, prefix: "t.", decimals: 1 };
/** Mio. kr. med to decimaler (IBCS.md §3). */
export const MIOKR: NumberScale = { factor: 1e6, prefix: "mio. ", decimals: 2 };

/**
 * Penge i GRAFER (≤ 3 heltalscifre, SI 5.2): mio. kr. med 2 decimaler, når gruppens største |værdi| er ≥ 1 mio. kr.
 * (t.kr. ville give 4 cifre: 3.424,4); ellers t.kr. med 1 decimal. Ét præfiks for hele grafen — titel og etiketter
 * følger valget (Codex K7 F7). Tabeller og kort bliver i t.kr. (≤ 4 cifre).
 */
export function pengeSkala(kr: readonly (number | null | undefined)[]): { skala: NumberScale; enhed: "t.kr." | "mio. kr." } {
    const maks = Math.max(0, ...kr.map((v) => (v == null || !Number.isFinite(v) ? 0 : Math.abs(v))));
    return maks >= 1e6 ? { skala: MIOKR, enhed: "mio. kr." } : { skala: TKR, enhed: "t.kr." };
}

/**
 * px pr. enhed, så basis-tieren (og Δ-tieren, som deler den) kan stå i bredden: bredden minus navnekolonnen,
 * etiketplads og pin-tieren, fordelt på basis + Δ. Δ bruger SAMME px pr. enhed som basis (E5).
 */
function pxPrEnhed(rækker: StructureRow[], bredde: number, medTiers: boolean, stablet: boolean): number {
    const e = structureExtents(rækker, { primary: "AC", reference: medTiers ? "PL" : undefined });
    const basis = Math.max(1e-9, e.base.max - Math.min(0, e.base.min));
    const delta = medTiers ? Math.max(0, e.delta.max) - Math.min(0, e.delta.min) : 0;
    const navne = Math.min(bredde * 0.3, 130);
    if (!medTiers || stablet) return Math.max(1e-9, (bredde - navne - 70) / Math.max(basis, delta));
    const fri = bredde - navne - 70 /* basisetiket */ - 2 * 56 /* Δ-etiketter */ - (90 + 60) /* pins + etiketter */ - 3 * 16;
    return Math.max(1e-9, fri / (basis + delta));
}

// ---------------------------------------------------------------- tal i tabeller

/** Et beløb i t.kr. (3.424,4); "–" for intet tal. */
export const tkr = (v: number | null | undefined) => (v == null ? "–" : formatValue(v, TKR));

/**
 * En afvigelse som tal i en tabel eller tekst: fortegn, afrundet nul uden fortegn og farve, virkningsfarve efter
 * polaritet (temaets delta-tokens er målt ≥ 4,5:1 som tekst). `data-role` gør den synlig for ibcs_lint dom.
 */
export function DeltaTal({ v, polaritet, skala = TKR, arv = false }: { v: number | null | undefined; polaritet: number; skala?: NumberScale; arv?: boolean }) {
    if (v == null || !Number.isFinite(v)) return <>–</>;
    const k = impactKey(v, { polarity: polaritet, isZero: roundsToZero(v, skala) });
    // `arv`: tabellens farvevalg (Retning/Heatmap) har sat cellens tekstfarve — tallet arver den (IBCS.md §8).
    return <span data-role="variance-label" data-impact={k} style={arv ? undefined : { color: impactText(k) }}>{formatDelta(v, skala)}</span>;
}

// ---------------------------------------------------------------- produktion pr. enhed (én kørsel)

/** A-19: vandrette bjælker, fyldt mørk (én kørsel = Scen-notation uden kode), sorteret ↓, ingen enhedskulører. */
export function ProduktionPrEnhed({ enheder }: { enheder: readonly EnhedTal[] }) {
    const rækker: StructureRow[] = [...enheder]
        .sort((x, y) => (y.produktion_mwh ?? 0) - (x.produktion_mwh ?? 0) || x.navn.localeCompare(y.navn))
        .map((e) => ({ category: e.navn, AC: e.produktion_mwh ?? 0 }));
    const { skala, enhed } = energiSkala(rækker.map((r) => r.AC));
    // Samme px pr. MWh som månedsgrafen på kørselssiden (skalagruppe "MWh", IBCS.md §5; Codex K7 F6).
    const maks = Math.max(0, ...rækker.map((r) => r.AC ?? 0));
    return (
        <IbcsFigur titel={`Varmeproduktion i ${enhed}, pr. enhed`} undertitel={<><strong>Varmeproduktion</strong> i {enhed}, pr. enhed, sorteret ↓</>}
            skalagruppe={{ enhed: "MWh", min: 0, max: maks, plads: (b) => maks * pxPrEnhed(rækker, b, false, false) }}
            lav={(b, ppu) => layoutStructureBars(rækker, { width: b, ppu: ppu ?? pxPrEnhed(rækker, b, false, false), scale: skala, codes: { ...KODER, primary: "" } })} />
    );
}

// ---------------------------------------------------------------- Ref og Scen pr. enhed med ΔRef og ΔRef%

/** Variansmærkerne (søjle, nål, outlier og deres etiketter); 0 og N/A har virkningen "none" og røres ikke. */
const VARIANSROLLER = new Set(["variance", "variance-label", "pin", "outlier"]);

/**
 * Kortets farvevalg i grafen (runde 11, IBCS.md AF7): giv variansmærkerne `farve(fortegn)` — fortegnet er rækkens ΔRef
 * (ΔRef% har samme fortegn, når den findes). `farve` → undefined beholder bibliotekets IBCS-farve. Geometri og tal
 * (med fortegn) er uændrede.
 */
export function omfarv(layout: Layout, fortegn: ReadonlyMap<string, number | null | undefined>, farve?: (v: number) => string | undefined): Layout {
    if (!farve) return layout;
    const marks = layout.marks.map((m) => {
        if (!VARIANSROLLER.has(m.role) || !m.impact || m.impact === "none" || m.category == null) return m;
        const v = fortegn.get(m.category);
        const f = v == null ? undefined : farve(v);
        if (!f) return m;
        if (m.kind === "text") return { ...m, fill: f };
        if (m.kind === "rect" || m.kind === "path") return { ...m, fill: f };
        return m;
    });
    return { ...layout, marks };
}

/**
 * A-23 + A-25 + A-26: Ref som omrids bagved, Scen fyldt foran, ΔRef på samme skala, ΔRef% som pins. Polaritet 0 → blå
 * (Ingen); `farve` er kortets farvevalg (Retning/Heatmap: farvesættets pol, se omfarv).
 */
export function ProduktionMod({ varians, fremhaev, farve }: { varians: readonly EnhedVarians[]; fremhaev?: string; farve?: (v: number) => string | undefined }) {
    // Codex K9 F1: ukendt Scen tegnes ikke — biblioteket tegner en manglende AC som 0, når Ref findes (udgået enhed), så
    // Ref udelades også; ukendt Ref tegner kun Scen. Δ og Δ% er da ukendte (ingen bjælke, N/A).
    const rækker: StructureRow[] = [...varians]
        .sort(varianseOrden)
        .map((v) => ({ category: v.navn, AC: v.b, PL: v.b == null ? null : v.a, delta: v.delta, deltaPct: relativAfvigelse(v.a, v.b) }));
    const { skala, enhed } = energiSkala(rækker.flatMap((r) => [r.AC, r.PL]));
    return (
        <IbcsFigur titel={`Varmeproduktion i ${enhed}, pr. enhed — Ref og Scen, ΔRef og ΔRef%`}
            undertitel={<><strong>Varmeproduktion</strong> i {enhed}, pr. enhed · Ref og Scen | ΔRef | ΔRef%</>}
            lav={(b) => {
                const stablet = b < SMAL;
                return omfarv(layoutStructureBars(rækker, {
                    width: b, reference: "PL", referenceStyle: "bar", ppu: pxPrEnhed(rækker, b, true, stablet), scale: skala,
                    // Ingen outlier-klipning (IBCS F7: kun for forretningsmæssigt uvæsentlige relative værdier). Bibliotekets
                    // "dybeste kløft" klippede ellers netop de to største flytninger (tankparret: +5,2 % og −13,1 %).
                    polarity: 0, stack: stablet ? true : "auto", codes: KODER, pctDecimals: 1, outlierRatio: 0,
                    highlight: fremhaev ? { category: fremhaev, tier: "delta" } : undefined,
                }), new Map(rækker.map((r) => [r.category, r.delta])), farve);
            }} />
    );
}

// ---------------------------------------------------------------- ΔRef pr. par (anbefalinger)

export interface ParDelta { navn: string; delta: number; indenForTolerance: boolean }

/**
 * A-25: én variansbjælke pr. par i t.kr. (spec analyser-anbefalinger v1). Omkostning: op = dårligt (rød), ned = godt.
 * Et ΔRef inden for solverens tolerance kan ikke skelnes fra nul: det er tvetydigt og tegnes neutralt (blå, IBCS UN 4.1).
 */
export function ParVarians({ par }: { par: readonly ParDelta[] }) {
    const rækker: StructureRow[] = par.map((p) => ({ category: p.navn, delta: p.delta, deltaImpact: p.indenForTolerance ? 0 : undefined, PL: 0 }));
    const { skala, enhed } = pengeSkala(par.map((p) => p.delta));
    return (
        <IbcsFigur titel={`ΔRef driftsomkostning i ${enhed}, pr. par`} undertitel={<><strong>Driftsomkostning</strong> ΔRef i {enhed}, pr. par</>}
            lav={(b) => {
                const e = structureExtents(rækker, { primary: "AC", reference: "PL" }).delta;
                const spænd = Math.max(1e-9, Math.max(0, e.max) - Math.min(0, e.min));
                const navne = Math.min(b * 0.45, 260);
                return layoutStructureBars(rækker, {
                    width: b, reference: "PL", only: "delta", ppu: Math.max(1e-9, (b - navne - 2 * 60) / spænd), scale: skala,
                    polarity: -1, codes: { ...KODER, category: "Par" },
                });
            }} />
    );
}

// ---------------------------------------------------------------- driftsomkostningens vandfald

/**
 * Forklaringen af ΔRef på driftsomkostningen (A-29), i omkostningsfortegn: elkøb, elsalg netto (indtægt → −Δ),
 * balanceindtægt brutto (indtægt → −Δ, kun med balancemarked) og en NAVNGIVET rest (brændsel, D&V, start m.m.),
 * så Ref + Σ trin = Scen. Null, når et af objektiverne mangler. Polaritet −1.
 * En post er kun et trin, når den er KENDT i begge kørsler. Nul bruges kun, hvor posten dokumenteret ikke findes
 * (kørsel uden balancemarked); mangler et forventet tal, fordeles posten ikke, og resten siger, at den rummer den
 * (Codex K7 F5) — ellers ville `?? 0` vise hele den anden kørsels beløb som en kendt forklaring.
 */
/**
 * Vandfaldet: ΔRef forklaret af de poster, kørslerne gemmer. `legacy` (runde 8, V9): med metoden legacy er modellens
 * sammendrag "brutto" = netto (src/balancing.py:1132-1140, "udelader sparet forbrug"), mens objektivet også regner
 * den sparede tarif og afgift med (src/balancing.py:353-358). Så bruges netto, og det manglende led navngives i resten.
 */
export function omkostningsBro(a: Samlet, b: Samlet, objA: number | null, objB: number | null, legacy = false): Bridge | null {
    if (objA == null || objB == null) return null;
    const kendt = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : x);
    const trin: Bridge["steps"] = [];
    const ukendte: string[] = [];
    // fortegn −1: indtægter (mindre indtægt = dyrere)
    const post = (navn: string, x: number | null, y: number | null, fortegn: 1 | -1) => {
        if (x == null || y == null) ukendte.push(navn.toLowerCase());
        else trin.push({ label: navn, delta: fortegn * (y - x) });
    };
    post("Elkøb", kendt(a.el_omkostning_dkk), kendt(b.el_omkostning_dkk), 1);
    const netSalg = (s: Samlet) => { const salg = kendt(s.el_salg_dkk), tarif = kendt(s.el_produktionstarif_dkk); return salg == null || tarif == null ? null : salg - tarif; };
    post("Elsalg netto", netSalg(a), netSalg(b), -1);
    // Uden balancemarked er balanceindtægten dokumenteret 0; med balancemarked og intet bruttotal er den ukendt.
    const brutto = (s: Samlet) => (s.balance ? kendt(legacy ? s.balance.i_alt.netto : s.balance.i_alt.brutto) : 0);
    if (a.balance || b.balance) {
        post(legacy ? "Balanceindtægt, netto" : "Balanceindtægt", brutto(a), brutto(b), -1);
        if (legacy) ukendte.push("sparet tarif og afgift ved aktivering (legacy-metoden)");
    }
    const total = objB - objA;
    const rest = total - trin.reduce((s, x) => s + x.delta, 0);
    const restNavn = "Brændsel, CO₂-kvoter, D&V, start m.m." + (ukendte.length ? ` inkl. ${ukendte.join(", ")} (ukendt)` : "");
    trin.push({ label: restNavn, delta: rest, remainder: true });
    return {
        base: { label: "Reference", scenario: "PL", value: objA },
        steps: trin,
        total: { label: "Scenarie", scenario: "AC", value: objB },
        variance: { code: "ΔRef", value: total },
    };
}

/** Vandfaldets pengeskala: hele grafen (basis, slutværdi og trin) er én skalagruppe (Codex K7 F7). */
export const vandfaldSkala = (bro: Bridge) => pengeSkala([bro.base.value, bro.total.value, ...bro.steps.map((s) => s.delta)]);

export function OmkostningsVandfald({ bro }: { bro: Bridge }) {
    const { skala, enhed } = vandfaldSkala(bro);
    return (
        <IbcsFigur titel={`Driftsomkostning i ${enhed}, Ref → Scen: hvad forklarer ΔRef`} undertitel={<><strong>Driftsomkostning</strong> i {enhed}, Ref → Scen</>}
            lav={(b) => {
                const maks = Math.max(Math.abs(bro.base.value), Math.abs(bro.total.value));
                // Oversigten må give plads til forstørrelsen VED SIDEN AF (lavere graf: kortet står over folden ved 1280 px,
                // sidekvalitet K7). Den laveste af nogle få oversigtsbredder vinder; ved lige højde den bredeste.
                const andele = b < SMAL ? [0.55] : [0.55, 0.45, 0.38, 0.32];
                return andele
                    .map((andel) => layoutVarianceWaterfall(bro, { width: b, ppu: Math.max(1e-9, (b * andel) / maks), scale: skala, polarity: -1, magnifier: b < SMAL ? "below" : "auto" }))
                    .reduce((x, y) => (y.height < x.height - 1 ? y : x));
            }} />
    );
}

// ---------------------------------------------------------------- nøgletalskort

export interface Noegletal { navn: string; enhed: string; ref: number | null; scen: number | null; skala: NumberScale; polaritet: number; definition?: string; relativ?: boolean }

/** KPI-kort (B-T-KPI): Scen-værdien, ΔRef og ΔRef% i virkningsfarve. ΔRef% er N/A, når Ref ≤ 0. */
export function NoegletalKort({ tal, fremhaev, fod }: { tal: readonly Noegletal[]; fremhaev?: string; fod?: ReactNode }) {
    return (
        <div className="fjv-ibcs-kpi">
            <div className="fjv-ibcs-kpi-raekke">
                {tal.map((t) => {
                    const v: KpiVariance = {
                        code: "ΔRef", absolute: t.ref != null && t.scen != null ? t.scen - t.ref : null, polarity: t.polaritet, reference: t.ref,
                        ...(t.relativ === false ? {} : { relative: relativAfvigelse(t.ref, t.scen) }),
                    };
                    return (
                        <KpiCard key={t.navn} label={t.navn} unit={`i ${t.enhed}`} value={t.scen} scale={t.skala} variances={[v]}
                            cardStyle="square" align="start" definition={t.definition} highlight={fremhaev === t.navn ? "ΔRef" : undefined} />
                    );
                })}
            </div>
            {fod}
        </div>
    );
}
