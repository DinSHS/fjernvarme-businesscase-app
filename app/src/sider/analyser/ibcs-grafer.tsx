//-----------------------------------------------------------------------
// Analysernes IBCS-grafer (app/IBCS.md, specs i app/docs/ibcs/). Tynde
// adaptere oven på src/ibcs: rækkerne formes her, layout og notation kommer
// fra biblioteket. Scenariekoder: Scen = fyldt mørk (bibliotekets AC),
// Ref = omrids (bibliotekets PL), ΔRef = Scen − Ref. Farverne er temaets
// variabler, så lys/mørk og alle temaer virker uden kode her.
//-----------------------------------------------------------------------

import type { ReactNode } from "react";
import {
    KpiCard, MarksSvg, formatDelta, formatValue, impactKey, impactText, layoutStructureBars, layoutVarianceWaterfall, roundsToZero, structureExtents,
    type Bridge, type KpiVariance, type Layout, type NumberScale, type StructureRow,
} from "@/ibcs";
import type { EnhedTal, EnhedVarians, Samlet } from "./beregn";
import { useBredde } from "./graf-hjaelp";

/** Scenariekoderne i grafernes legender, tooltips og skjulte tabeller (IBCS.md §1). */
export const KODER = { primary: "Scen", reference: "Ref", delta: "ΔRef", category: "Enhed" } as const;

/** Bredden under denne stabler varians-tierne under bjælkerne (telefon). */
const SMAL = 640;

/**
 * Mål containeren, læg layoutet ud og tegn det. `lav` får bredden i px. `undertitel` er grafens synlige undertitel
 * (UN 2.2: kun det, der adskiller grafen fra kortets titel — typisk målet i fed og enheden); `titel` er det tilgængelige navn.
 */
export function IbcsFigur({ titel, lav, beskrivelse, undertitel }: { titel: string; lav: (bredde: number) => Layout | null; beskrivelse?: string; undertitel?: ReactNode }) {
    const [ref, bredde] = useBredde<HTMLDivElement>();
    const layout = bredde > 0 ? lav(bredde) : null;
    return (
        <div className="fjv-a-graf fjv-ibcs" ref={ref}>
            {undertitel && <div className="fjv-ibcs-undertitel">{undertitel}</div>}
            {layout && <MarksSvg layout={layout} title={titel} desc={beskrivelse} />}
        </div>
    );
}

// ---------------------------------------------------------------- skalaer

/** Energi: GWh med 2 decimaler, når det største tal er ≥ 1.000 MWh (≤ 3 cifre i grafer, SI 5.2); ellers MWh uden decimaler. */
export function energiSkala(mwh: readonly (number | null | undefined)[]): { skala: NumberScale; enhed: "GWh" | "MWh" } {
    const maks = Math.max(0, ...mwh.map((v) => Math.abs(v ?? 0)));
    return maks >= 1000 ? { skala: { factor: 1000, prefix: "G", decimals: 2 }, enhed: "GWh" } : { skala: { factor: 1, prefix: "", decimals: 0 }, enhed: "MWh" };
}

/** Driftsomkostning i t.kr. med én decimal (IBCS.md §3: ≤ 4 cifre i tabeller og kort). */
export const TKR: NumberScale = { factor: 1000, prefix: "t.", decimals: 1 };

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
export function DeltaTal({ v, polaritet, skala = TKR }: { v: number | null | undefined; polaritet: number; skala?: NumberScale }) {
    if (v == null || !Number.isFinite(v)) return <>–</>;
    const k = impactKey(v, { polarity: polaritet, isZero: roundsToZero(v, skala) });
    return <span data-role="variance-label" data-impact={k} style={{ color: impactText(k) }}>{formatDelta(v, skala)}</span>;
}

// ---------------------------------------------------------------- produktion pr. enhed (én kørsel)

/** A-19: vandrette bjælker, fyldt mørk (én kørsel = Scen-notation uden kode), sorteret ↓, ingen enhedskulører. */
export function ProduktionPrEnhed({ enheder }: { enheder: readonly EnhedTal[] }) {
    const rækker: StructureRow[] = [...enheder]
        .sort((x, y) => (y.produktion_mwh ?? 0) - (x.produktion_mwh ?? 0) || x.navn.localeCompare(y.navn))
        .map((e) => ({ category: e.navn, AC: e.produktion_mwh ?? 0 }));
    const { skala, enhed } = energiSkala(rækker.map((r) => r.AC));
    return (
        <IbcsFigur titel={`Varmeproduktion i ${enhed}, pr. enhed`} undertitel={<><strong>Varmeproduktion</strong> i {enhed}, pr. enhed, sorteret ↓</>}
            lav={(b) => layoutStructureBars(rækker, { width: b, ppu: pxPrEnhed(rækker, b, false, false), scale: skala, codes: { ...KODER, primary: "" } })} />
    );
}

// ---------------------------------------------------------------- Ref og Scen pr. enhed med ΔRef og ΔRef%

/** A-23 + A-25 + A-26: Ref som omrids bagved, Scen fyldt foran, ΔRef på samme skala, ΔRef% som pins. Polaritet 0 → blå. */
export function ProduktionMod({ varians, fremhaev }: { varians: readonly EnhedVarians[]; fremhaev?: string }) {
    const rækker: StructureRow[] = [...varians]
        .sort((x, y) => y.b - x.b || y.a - x.a || x.navn.localeCompare(y.navn))
        .map((v) => ({ category: v.navn, AC: v.b, PL: v.a, delta: v.delta, deltaPct: v.a > 0 ? v.delta / v.a : null }));
    const { skala, enhed } = energiSkala(rækker.flatMap((r) => [r.AC, r.PL]));
    return (
        <IbcsFigur titel={`Varmeproduktion i ${enhed}, pr. enhed — Ref og Scen, ΔRef og ΔRef%`}
            undertitel={<><strong>Varmeproduktion</strong> i {enhed}, pr. enhed · Ref og Scen | ΔRef | ΔRef%</>}
            lav={(b) => {
                const stablet = b < SMAL;
                return layoutStructureBars(rækker, {
                    width: b, reference: "PL", referenceStyle: "bar", ppu: pxPrEnhed(rækker, b, true, stablet), scale: skala,
                    // Ingen outlier-klipning (IBCS F7: kun for forretningsmæssigt uvæsentlige relative værdier). Bibliotekets
                    // "dybeste kløft" klippede ellers netop de to største flytninger (tankparret: +5,2 % og −13,1 %).
                    polarity: 0, stack: stablet ? true : "auto", codes: KODER, pctDecimals: 1, outlierRatio: 0,
                    highlight: fremhaev ? { category: fremhaev, tier: "delta" } : undefined,
                });
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
    return (
        <IbcsFigur titel="ΔRef driftsomkostning i t.kr., pr. par" undertitel={<><strong>Driftsomkostning</strong> ΔRef i t.kr., pr. par</>}
            lav={(b) => {
                const e = structureExtents(rækker, { primary: "AC", reference: "PL" }).delta;
                const spænd = Math.max(1e-9, Math.max(0, e.max) - Math.min(0, e.min));
                const navne = Math.min(b * 0.45, 260);
                return layoutStructureBars(rækker, {
                    width: b, reference: "PL", only: "delta", ppu: Math.max(1e-9, (b - navne - 2 * 60) / spænd), scale: TKR,
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
 */
export function omkostningsBro(a: Samlet, b: Samlet, objA: number | null, objB: number | null): Bridge | null {
    if (objA == null || objB == null) return null;
    const d = (x: number | null | undefined, y: number | null | undefined) => (x == null && y == null ? null : (y ?? 0) - (x ?? 0));
    const netSalg = (s: Samlet) => (s.el_salg_dkk == null ? null : s.el_salg_dkk - (s.el_produktionstarif_dkk ?? 0));
    const trin: Bridge["steps"] = [];
    const elkoeb = d(a.el_omkostning_dkk, b.el_omkostning_dkk);
    if (elkoeb != null) trin.push({ label: "Elkøb", delta: elkoeb });
    const salg = d(netSalg(a), netSalg(b));
    if (salg != null) trin.push({ label: "Elsalg netto", delta: -salg });
    const bal = d(a.balance?.i_alt.brutto, b.balance?.i_alt.brutto);
    if ((a.balance || b.balance) && bal != null) trin.push({ label: "Balanceindtægt", delta: -bal });
    const total = objB - objA;
    const rest = total - trin.reduce((s, x) => s + x.delta, 0);
    trin.push({ label: "Brændsel, D&V, start m.m.", delta: rest, remainder: true });
    return {
        base: { label: "Reference", scenario: "PL", value: objA },
        steps: trin,
        total: { label: "Scenarie", scenario: "AC", value: objB },
        variance: { code: "ΔRef", value: total },
    };
}

export function OmkostningsVandfald({ bro }: { bro: Bridge }) {
    return (
        <IbcsFigur titel="Driftsomkostning i t.kr., Ref → Scen: hvad forklarer ΔRef" undertitel={<><strong>Driftsomkostning</strong> i t.kr., Ref → Scen</>}
            lav={(b) => {
                const maks = Math.max(Math.abs(bro.base.value), Math.abs(bro.total.value));
                return layoutVarianceWaterfall(bro, { width: b, ppu: Math.max(1e-9, (b * 0.55) / maks), scale: TKR, polarity: -1, magnifier: b < SMAL ? "below" : "auto" });
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
                        ...(t.relativ === false ? {} : { relative: t.ref != null && t.scen != null && t.ref > 0 ? (t.scen - t.ref) / t.ref : null }),
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
