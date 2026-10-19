//-----------------------------------------------------------------------
// Analysernes grafer — inline SVG, ingen afhængigheder.
//
// Regler (dataviz-skillen + briefen): én akse pr. panel (aldrig to y-skalaer;
// spotpris får sit eget panel med fælles tidsakse), farven følger enheden
// (farvepladser i beregn.ts), tynde mærker, hårfine gitterlinjer, direkte
// etiketter sparsomt, tekst altid i tekst-tokens, hover med tal på alt.
// Hver graf ledsages af en tabel på siden (tal-visningen).
//-----------------------------------------------------------------------

import { useState, type ReactNode } from "react";
import { tal } from "@/lib/format";
import type { DispatchPunkt } from "./beregn";
import { farve, lagerFarve, paeneTicks, useBredde, type DispatchSkala } from "./graf-hjaelp";
import { dec, dkDagEtiket, dkTidspunkt } from "./fmt";

// ---------------------------------------------------------------- fælles

/** Akse-tal: decimaler efter trinstørrelsen. */
function akseTal(v: number, ticks: readonly number[]): string {
    const trin = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
    const d = trin >= 1 ? 0 : trin >= 0.1 ? 1 : 2;
    return d === 0 ? tal(v) : dec(v, d);
}

export interface Serie { navn: string; plads: number }

export function Forklaring({ serier, ekstra }: { serier: readonly Serie[]; ekstra?: ReactNode }) {
    return (
        <div className="fjv-a-forklaring" aria-label="Forklaring">
            {serier.map((s) => (
                <span key={s.navn}><i className="fjv-a-prik" style={{ background: farve(s.plads) }} />{s.navn}</span>
            ))}
            {ekstra}
        </div>
    );
}

interface TipRække { navn: string; plads?: number; streg?: boolean; værdi: string }

function Tip({ x, bredde, titel, rækker }: { x: number; bredde: number; titel: string; rækker: readonly TipRække[] }) {
    const venstre = x > bredde / 2;
    return (
        <div className="fjv-a-tip" role="status" style={venstre ? { right: bredde - x + 10, top: 4 } : { left: x + 10, top: 4 }}>
            <div className="fjv-a-tip-titel">{titel}</div>
            {rækker.map((r) => (
                <div className="fjv-a-tip-rk" key={r.navn}>
                    {r.streg ? <i className="fjv-a-streg" /> : r.plads !== undefined ? <i className="fjv-a-prik" style={{ background: farve(r.plads) }} /> : <i />}
                    <span>{r.navn}</span><span>{r.værdi}</span>
                </div>
            ))}
        </div>
    );
}

/** Søjle med 4 px afrundet dataende og firkantet basis (vokser fra nul-linjen). */
function soejleSti(x: number, y0: number, y1: number, b: number, afrund: boolean): string {
    const op = y1 < y0;
    const h = Math.abs(y1 - y0);
    const r = afrund ? Math.min(4, h / 2, b / 2) : 0;
    if (h <= 0) return "";
    if (op) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + b - r}Q${x + b},${y1} ${x + b},${y1 + r}V${y0}Z`;
    return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + b - r}Q${x + b},${y1} ${x + b},${y1 - r}V${y0}Z`;
}

/** Vandret bjælke fra x0 til x1 (afrundet ende ved x1). */
function bjaelkeSti(x0: number, x1: number, y: number, h: number): string {
    const w = Math.abs(x1 - x0);
    if (w <= 0) return "";
    const r = Math.min(4, w / 2, h / 2);
    if (x1 > x0) return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`;
    return `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 + r},${y + h}H${x0}Z`;
}

// ---------------------------------------------------------------- vandrette bjælker (én værdi pr. række)

export interface BjaelkeRaekke { navn: string; plads: number; værdi: number; etiket: string }

/** Vandrette bjælker med direkte etiket ved spidsen. Til "produktion pr. enhed". */
export function Bjaelker({ rækker, enhed }: { rækker: readonly BjaelkeRaekke[]; enhed: string }) {
    const [ref, bredde] = useBredde<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);
    const navneB = Math.min(140, Math.max(80, bredde * 0.28));
    // Plads til den længste etiket ved spidsen (≈ 6,5 px pr. tegn ved --t-datalabel 11 px).
    const etiketB = Math.max(...rækker.map((r) => r.etiket.length), 4) * 6.5 + 10;
    const rh = 26, bh = 14;
    const maks = Math.max(1e-9, ...rækker.map((r) => r.værdi));
    const plot = Math.max(10, bredde - navneB - etiketB);
    const højde = rækker.length * rh + 4;
    return (
        <div className="fjv-a-graf" ref={ref}>
            {bredde > 0 && (
                <svg width={bredde} height={højde} role="img" aria-label={`Bjælker, ${enhed}`}>
                    {rækker.map((r, i) => {
                        const y = i * rh + 4;
                        const x1 = navneB + (Math.max(0, r.værdi) / maks) * plot;
                        return (
                            <g key={r.navn} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                                <rect x={0} y={y - 4} width={bredde} height={rh} fill="transparent" />
                                <text className="fjv-a-akse-navn" x={navneB - 8} y={y + bh / 2} dy="0.35em" textAnchor="end">{r.navn}</text>
                                <path d={bjaelkeSti(navneB, x1, y, bh)} fill={farve(r.plads)} opacity={hover === null || hover === i ? 1 : 0.45} />
                                <text className="fjv-a-etiket" x={x1 + 6} y={y + bh / 2} dy="0.35em">{r.etiket}</text>
                            </g>
                        );
                    })}
                    <line className="fjv-a-nul" x1={navneB} x2={navneB} y1={0} y2={højde} />
                </svg>
            )}
        </div>
    );
}

// ---------------------------------------------------------------- stablede søjler pr. måned (også diverging Δ)

export interface StakSoejle {
    etiket: string;
    /** Bidrag pr. serie (kan være negative ved Δ). */
    dele: { navn: string; plads: number; værdi: number }[];
    /** Valgfri markør (fx varmebehov) som vandret streg over søjlen. */
    markør?: number | null;
    /** Tekst over søjlen (fx varmebehovet). */
    topEtiket?: string;
}

export function StablededeSoejler({ søjler, enhed, markørNavn, formatér, højde = 220 }: {
    søjler: readonly StakSoejle[]; enhed: string; markørNavn?: string; formatér: (v: number) => string; højde?: number;
}) {
    const [ref, bredde] = useBredde<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);
    const venstre = 44, top = 24, bund = 22;
    const op = søjler.map((s) => Math.max(s.markør ?? 0, s.dele.reduce((a, d) => a + Math.max(0, d.værdi), 0)));
    const ned = søjler.map((s) => s.dele.reduce((a, d) => a + Math.min(0, d.værdi), 0));
    const ticks = paeneTicks(Math.min(0, ...ned), Math.max(0, ...op));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const plotH = højde - top - bund;
    const y = (v: number) => top + (hi - v) / (hi - lo || 1) * plotH;
    const plotB = Math.max(10, bredde - venstre - 4);
    const slot = plotB / Math.max(1, søjler.length);
    const sb = Math.min(24, Math.max(6, slot * 0.6));
    const tynd = søjler.length > 8 && slot < 46;

    return (
        <div className="fjv-a-graf" ref={ref} onPointerLeave={() => setHover(null)}>
            {bredde > 0 && (
                <svg width={bredde} height={højde} role="img" aria-label={`Stablede søjler, ${enhed}`}>
                    {ticks.map((t) => (
                        <g key={t}>
                            <line className={t === 0 ? "fjv-a-nul" : "fjv-a-gitter"} x1={venstre} x2={bredde} y1={y(t)} y2={y(t)} />
                            <text className="fjv-a-akse" x={venstre - 6} y={y(t)} dy="0.35em" textAnchor="end">{akseTal(t, ticks)}</text>
                        </g>
                    ))}
                    <text className="fjv-a-akse-navn" x={0} y={8}>{enhed}</text>
                    {søjler.map((s, i) => {
                        const x = venstre + i * slot + (slot - sb) / 2;
                        let opAkk = 0, nedAkk = 0;
                        const positive = s.dele.filter((d) => d.værdi > 0), negative = s.dele.filter((d) => d.værdi < 0);
                        return (
                            <g key={s.etiket} onPointerEnter={() => setHover(i)}>
                                <rect x={venstre + i * slot} y={top} width={slot} height={plotH} fill="transparent" />
                                {positive.map((d, j) => {
                                    const y0 = y(opAkk), y1 = y(opAkk + d.værdi);
                                    opAkk += d.værdi;
                                    const gab = j > 0 ? 1 : 0;   // 2 px flade-mellemrum mellem segmenter (1 px hver side)
                                    return <path key={d.navn} d={soejleSti(x, y0 - gab, y1 + (j < positive.length - 1 ? 1 : 0), sb, j === positive.length - 1)} fill={farve(d.plads)} opacity={hover === null || hover === i ? 1 : 0.55} />;
                                })}
                                {negative.map((d, j) => {
                                    const y0 = y(nedAkk), y1 = y(nedAkk + d.værdi);
                                    nedAkk += d.værdi;
                                    const gab = j > 0 ? 1 : 0;
                                    return <path key={d.navn} d={soejleSti(x, y0 + gab, y1 - (j < negative.length - 1 ? 1 : 0), sb, j === negative.length - 1)} fill={farve(d.plads)} opacity={hover === null || hover === i ? 1 : 0.55} />;
                                })}
                                {s.markør != null && <line x1={x - 4} x2={x + sb + 4} y1={y(s.markør)} y2={y(s.markør)} stroke="var(--dash-ink)" strokeWidth={2} />}
                                {s.topEtiket && !tynd && (
                                    <text className="fjv-a-etiket-svag" x={x + sb / 2} y={y(Math.max(s.markør ?? 0, opAkk)) - 6} textAnchor="middle">{s.topEtiket}</text>
                                )}
                                {(!tynd || i % Math.ceil(søjler.length / 6) === 0) && (
                                    <text className="fjv-a-akse" x={x + sb / 2} y={højde - 6} textAnchor="middle">{s.etiket}</text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            )}
            {hover !== null && søjler[hover] && (
                <Tip x={venstre + hover * slot + slot / 2} bredde={bredde} titel={søjler[hover].etiket} rækker={[
                    ...søjler[hover].dele.map((d) => ({ navn: d.navn, plads: d.plads, værdi: formatér(d.værdi) })),
                    ...(søjler[hover].markør != null && markørNavn ? [{ navn: markørNavn, streg: true, værdi: formatér(søjler[hover].markør!) }] : []),
                ]} />
            )}
        </div>
    );
}

// ---------------------------------------------------------------- små punkter pr. kategori (fx spotpris pr. måned)

export function PunktRaekke({ punkter, enhed, formatér, højde = 90 }: {
    punkter: readonly { etiket: string; værdi: number | null }[]; enhed: string; formatér: (v: number) => string; højde?: number;
}) {
    const [ref, bredde] = useBredde<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);
    const venstre = 44, top = 24, bund = 6;
    const vals = punkter.map((p) => p.værdi).filter((v): v is number => v != null);
    const ticks = paeneTicks(Math.min(0, ...vals), Math.max(0, ...vals), 2);
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const y = (v: number) => top + (hi - v) / (hi - lo || 1) * (højde - top - bund);
    const slot = Math.max(10, bredde - venstre - 4) / Math.max(1, punkter.length);
    const cx = (i: number) => venstre + i * slot + slot / 2;
    const sti = punkter.map((p, i) => (p.værdi == null ? null : `${cx(i)},${y(p.værdi)}`)).filter(Boolean).join(" L");
    return (
        <div className="fjv-a-graf" ref={ref} onPointerLeave={() => setHover(null)}>
            {bredde > 0 && (
                <svg width={bredde} height={højde} role="img" aria-label={enhed}>
                    {ticks.map((t) => (
                        <g key={t}>
                            <line className={t === 0 ? "fjv-a-nul" : "fjv-a-gitter"} x1={venstre} x2={bredde} y1={y(t)} y2={y(t)} />
                            <text className="fjv-a-akse" x={venstre - 6} y={y(t)} dy="0.35em" textAnchor="end">{akseTal(t, ticks)}</text>
                        </g>
                    ))}
                    <text className="fjv-a-akse-navn" x={0} y={8}>{enhed}</text>
                    {punkter.length > 1 && sti && <path className="fjv-a-linje" d={`M${sti}`} stroke="var(--dash-series)" />}
                    {punkter.map((p, i) => p.værdi == null ? null : (
                        <g key={p.etiket} onPointerEnter={() => setHover(i)}>
                            <rect x={venstre + i * slot} y={0} width={slot} height={højde} fill="transparent" />
                            <circle cx={cx(i)} cy={y(p.værdi)} r={4} fill="var(--dash-series)" stroke="var(--color-card)" strokeWidth={2} />
                            {(punkter.length <= 6) && <text className="fjv-a-etiket-svag" x={cx(i)} y={y(p.værdi) - 10} textAnchor="middle">{formatér(p.værdi)}</text>}
                        </g>
                    ))}
                </svg>
            )}
            {hover !== null && punkter[hover]?.værdi != null && (
                <Tip x={cx(hover)} bredde={bredde} titel={punkter[hover].etiket} rækker={[{ navn: enhed, værdi: formatér(punkter[hover].værdi!) }]} />
            )}
        </div>
    );
}

// ---------------------------------------------------------------- IBCS-varians: a vs b, Δ absolut, Δ relativ

export interface VariansRaekke { navn: string; plads: number; a: number; b: number; delta: number; relativ: number | null }

/**
 * Tre paneler med fælles rækker: (1) a (hul) og b (fyldt) på samme skala,
 * (2) Δ absolut, (3) Δ relativ. Δ er neutralt farvet — mere produktion er
 * hverken godt eller skidt; omkostning vurderes på objektivet.
 */
export function Varians({ rækker, enhed, formatér, aNavn = "Reference", bNavn = "Scenarie" }: {
    rækker: readonly VariansRaekke[]; enhed: string; formatér: (v: number) => string; aNavn?: string; bNavn?: string;
}) {
    const [ref, bredde] = useBredde<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);
    const smal = bredde < 640;
    const navneB = smal ? 96 : 120;
    const rh = 34, bh = 10;
    const top = 22;
    const højdePanel = rækker.length * rh + top;
    const panelB = smal ? bredde - navneB : (bredde - navneB) / 3;
    const maks = Math.max(1e-9, ...rækker.flatMap((r) => [r.a, r.b]));
    const dMaks = Math.max(1e-9, ...rækker.map((r) => Math.abs(r.delta)));
    const rMaks = Math.max(1e-9, ...rækker.map((r) => Math.abs(r.relativ ?? 0)));
    const plads = 64;   // til etiket ved spidsen

    const panel = (nr: number, titel: string, children: (x0: number, w: number) => ReactNode) => {
        const x0 = smal ? navneB : navneB + nr * panelB;
        const yOff = smal ? nr * (højdePanel + 8) : 0;
        return (
            <g key={nr} transform={`translate(0,${yOff})`}>
                <text className="fjv-a-akse-navn" x={x0} y={12}>{titel}</text>
                {(smal || nr === 0) && rækker.map((r, i) => (
                    <text key={r.navn} className="fjv-a-akse-navn" x={navneB - 8} y={top + i * rh + rh / 2} dy="0.35em" textAnchor="end">{r.navn}</text>
                ))}
                {children(x0, panelB - 8)}
                {rækker.map((r, i) => (
                    <rect key={r.navn} x={0} y={top + i * rh} width={bredde} height={rh} fill="transparent"
                        onPointerEnter={() => setHover(i)} />
                ))}
            </g>
        );
    };

    const svgH = smal ? 3 * (højdePanel + 8) : højdePanel;
    return (
        <div className="fjv-a-graf" ref={ref} onPointerLeave={() => setHover(null)}>
            {bredde > 0 && (
                <svg width={bredde} height={svgH} role="img" aria-label={`Varians pr. enhed, ${enhed}`}>
                    {panel(0, `${aNavn} og ${bNavn} (${enhed})`, (x0, w) => {
                            const s = (v: number) => (Math.max(0, v) / maks) * (w - plads);
                            return <>{rækker.map((r, i) => {
                                const y = top + i * rh + (rh - 2 * bh - 2) / 2;
                                return (
                                    <g key={r.navn} opacity={hover === null || hover === i ? 1 : 0.5}>
                                        <path d={bjaelkeSti(x0, x0 + s(r.a), y, bh)} fill="none" stroke="var(--dash-ink-2)" strokeWidth={1.5} />
                                        <path d={bjaelkeSti(x0, x0 + s(r.b), y + bh + 2, bh)} fill={farve(r.plads)} />
                                        <text className="fjv-a-etiket" x={x0 + s(r.b) + 6} y={y + bh + 2 + bh / 2} dy="0.35em">{formatér(r.b)}</text>
                                    </g>
                                );
                            })}<line className="fjv-a-nul" x1={x0} x2={x0} y1={top - 2} y2={højdePanel} /></>;
                        })}
                    {panel(1, `Δ ${bNavn.toLowerCase()} − ${aNavn.toLowerCase()} (${enhed})`, (x0, w) => {
                            const midt = x0 + w / 2;
                            const s = (v: number) => (v / dMaks) * (w / 2 - plads);
                            return <>{rækker.map((r, i) => {
                                const y = top + i * rh + (rh - bh) / 2;
                                const x1 = midt + s(r.delta);
                                return (
                                    <g key={r.navn} opacity={hover === null || hover === i ? 1 : 0.5}>
                                        <path d={bjaelkeSti(midt, x1, y, bh)} fill="var(--dash-ink-2)" />
                                        <text className="fjv-a-etiket" x={r.delta >= 0 ? x1 + 6 : x1 - 6} y={y + bh / 2} dy="0.35em" textAnchor={r.delta >= 0 ? "start" : "end"}>
                                            {(r.delta > 0 ? "+" : r.delta < 0 ? "−" : "") + formatér(Math.abs(r.delta))}
                                        </text>
                                    </g>
                                );
                            })}<line className="fjv-a-nul" x1={midt} x2={midt} y1={top - 2} y2={højdePanel} /></>;
                        })}
                    {panel(2, "Δ relativ (%)", (x0, w) => {
                            const midt = x0 + w / 2;
                            const s = (v: number) => (v / rMaks) * (w / 2 - plads);
                            return <>{rækker.map((r, i) => {
                                const y = top + i * rh + (rh - bh) / 2;
                                if (r.relativ === null) {
                                    return <text key={r.navn} className="fjv-a-etiket-svag" x={midt + 6} y={y + bh / 2} dy="0.35em">{r.b > 0 ? "ny" : "–"}</text>;
                                }
                                const x1 = midt + s(r.relativ);
                                return (
                                    <g key={r.navn} opacity={hover === null || hover === i ? 1 : 0.5}>
                                        <path d={bjaelkeSti(midt, x1, y + 2, bh - 4)} fill="var(--dash-ink-3)" />
                                        <circle cx={x1} cy={y + bh / 2} r={4} fill="var(--dash-ink-2)" stroke="var(--color-card)" strokeWidth={2} />
                                        <text className="fjv-a-etiket" x={r.relativ >= 0 ? x1 + 8 : x1 - 8} y={y + bh / 2} dy="0.35em" textAnchor={r.relativ >= 0 ? "start" : "end"}>
                                            {(r.relativ > 0 ? "+" : r.relativ < 0 ? "−" : "") + dec(Math.abs(r.relativ) * 100, 0) + " %"}
                                        </text>
                                    </g>
                                );
                            })}<line className="fjv-a-nul" x1={midt} x2={midt} y1={top - 2} y2={højdePanel} /></>;
                        })}
                </svg>
            )}
            {hover !== null && rækker[hover] && (
                <Tip x={bredde / 2} bredde={bredde} titel={rækker[hover].navn} rækker={[
                    { navn: aNavn, værdi: formatér(rækker[hover].a) },
                    { navn: bNavn, plads: rækker[hover].plads, værdi: formatér(rækker[hover].b) },
                    { navn: "Δ", værdi: (rækker[hover].delta < 0 ? "−" : rækker[hover].delta > 0 ? "+" : "") + formatér(Math.abs(rækker[hover].delta)) },
                    { navn: "Δ relativ", værdi: rækker[hover].relativ === null ? "–" : `${rækker[hover].relativ! < 0 ? "−" : "+"}${dec(Math.abs(rækker[hover].relativ!) * 100, 1)} %` },
                ]} />
            )}
        </div>
    );
}

// ---------------------------------------------------------------- intervaldispatch

/**
 * Tre paneler med fælles tidsakse: stablet varmeproduktion pr. enhed med
 * varmelast som linje (MW), tankniveau (MWh), spotpris (kr./MWh). Hover viser
 * alle tal for intervallet. Ingen sekundær y-akse.
 */
export function Dispatch({ punkter, enheder, lagre, skala, visLager = true, visSpot = true }: {
    punkter: readonly DispatchPunkt[]; enheder: readonly Serie[]; lagre: readonly string[]; skala: DispatchSkala;
    visLager?: boolean; visSpot?: boolean;
}) {
    const [ref, bredde] = useBredde<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);
    const venstre = 44, højre = 6;
    const pH = 200, lH = 80, sH = 80, mellem = 34, top = 24, aksH = 20;
    const harLager = visLager && lagre.length > 0;
    const harSpot = visSpot && punkter.some((p) => p.spot != null);
    const yL0 = top + pH + mellem, yS0 = yL0 + (harLager ? lH + mellem : 0);
    const total = yS0 + (harSpot ? sH : -mellem) + aksH;
    const plotB = Math.max(10, bredde - venstre - højre);
    const n = punkter.length;
    const t0 = n ? punkter[0].tid.getTime() : 0;
    const dt = n > 1 ? punkter[1].tid.getTime() - t0 : 3_600_000;
    const t1 = n ? punkter[n - 1].tid.getTime() + dt : 1;
    const x = (t: number) => venstre + ((t - t0) / (t1 - t0 || 1)) * plotB;

    const pT = paeneTicks(0, skala.prod, 4), pHi = pT[pT.length - 1] || 1;
    const yP = (v: number) => top + (pHi - v) / pHi * pH;
    const lT = paeneTicks(0, skala.lager, 3), lHi = lT[lT.length - 1] || 1;
    const yL = (v: number) => yL0 + (lHi - v) / lHi * lH;
    const sT = paeneTicks(skala.spotMin, skala.spotMaks, 3), sLo = sT[0], sHi = sT[sT.length - 1];
    const yS = (v: number) => yS0 + (sHi - v) / (sHi - sLo || 1) * sH;

    // Stablede trin-flader (step-after): hvert interval er en konstant effekt.
    const flader = enheder.map((e, k) => {
        const under = (i: number) => enheder.slice(0, k).reduce((a, f) => a + (punkter[i].prod[f.navn] ?? 0), 0);
        let op = "", ned = "";
        for (let i = 0; i < n; i++) {
            const xa = x(punkter[i].tid.getTime()), xb = x(punkter[i].tid.getTime() + dt);
            const u = under(i), o = u + (punkter[i].prod[e.navn] ?? 0);
            op += `${i === 0 ? "M" : "L"}${xa},${yP(o)}L${xb},${yP(o)}`;
            ned = `L${xb},${yP(u)}L${xa},${yP(u)}` + ned;
        }
        return { e, d: n ? `${op}${ned}Z` : "" };
    });
    // Afladning fra lager stables øverst: forsyning = produktion + afladning (≈ varmelast + opladning).
    let afladSti = "";
    if (n && lagre.length) {
        let op = "", ned = "";
        for (let i = 0; i < n; i++) {
            const xa = x(punkter[i].tid.getTime()), xb = x(punkter[i].tid.getTime() + dt);
            const u = Object.values(punkter[i].prod).reduce((a, b) => a + b, 0), o = u + punkter[i].aflad;
            op += `${i === 0 ? "M" : "L"}${xa},${yP(o)}L${xb},${yP(o)}`;
            ned = `L${xb},${yP(u)}L${xa},${yP(u)}` + ned;
        }
        afladSti = `${op}${ned}Z`;
    }
    const trin = (f: (p: DispatchPunkt) => number | null, y: (v: number) => number) => {
        let d = "";
        let åben = false;
        for (let i = 0; i < n; i++) {
            const v = f(punkter[i]);
            if (v == null) { åben = false; continue; }
            const xa = x(punkter[i].tid.getTime()), xb = x(punkter[i].tid.getTime() + dt);
            d += `${åben ? "L" : "M"}${xa},${y(v)}L${xb},${y(v)}`;
            åben = true;
        }
        return d;
    };

    // Dagsstreger og etiketter (dansk tid); ved mange døgn kun hver n'te etiket.
    const dage: number[] = [];
    if (n) {
        const første = new Date(t0);
        første.setUTCHours(0, 0, 0, 0);
        for (let t = første.getTime(); t <= t1; t += 86_400_000) if (t >= t0) dage.push(t);
    }
    const hverN = Math.max(1, Math.ceil(dage.length / Math.max(1, Math.floor(plotB / 64))));

    const vælg = (e: React.PointerEvent<SVGRectElement>) => {
        const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
        const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
        const i = Math.min(n - 1, Math.max(0, Math.floor((t - t0) / dt)));
        setHover(Number.isFinite(i) ? i : null);
    };

    const hp = hover !== null ? punkter[hover] : null;

    return (
        <div className="fjv-a-graf" ref={ref} onPointerLeave={() => setHover(null)}>
            {bredde > 0 && n > 0 && (
                <svg width={bredde} height={total} role="img" aria-label="Intervaldispatch">
                    {/* produktion */}
                    <text className="fjv-a-akse-navn" x={0} y={10}>Varmeproduktion og varmelast (MW)</text>
                    {pT.map((t) => (
                        <g key={`p${t}`}>
                            <line className={t === 0 ? "fjv-a-nul" : "fjv-a-gitter"} x1={venstre} x2={bredde - højre} y1={yP(t)} y2={yP(t)} />
                            <text className="fjv-a-akse" x={venstre - 6} y={yP(t)} dy="0.35em" textAnchor="end">{akseTal(t, pT)}</text>
                        </g>
                    ))}
                    {flader.map(({ e, d }) => <path key={e.navn} d={d} fill={farve(e.plads)} opacity={0.85} />)}
                    {afladSti && <path d={afladSti} fill="var(--dash-ink-3)" opacity={0.35} />}
                    <path className="fjv-a-last" d={trin((p) => p.last, yP)} />
                    {/* lager */}
                    {harLager && <>
                        <text className="fjv-a-akse-navn" x={0} y={yL0 - 14}>Tankens indhold (MWh)</text>
                        {lT.map((t) => (
                            <g key={`l${t}`}>
                                <line className={t === 0 ? "fjv-a-nul" : "fjv-a-gitter"} x1={venstre} x2={bredde - højre} y1={yL(t)} y2={yL(t)} />
                                <text className="fjv-a-akse" x={venstre - 6} y={yL(t)} dy="0.35em" textAnchor="end">{akseTal(t, lT)}</text>
                            </g>
                        ))}
                        {lagre.map((l, i) => <path key={l} className="fjv-a-linje" d={trin((p) => p.lager[l] ?? null, yL)} stroke={lagerFarve(i)} />)}
                    </>}
                    {/* spot */}
                    {harSpot && <>
                        <text className="fjv-a-akse-navn" x={0} y={yS0 - 14}>Spotpris (kr./MWh)</text>
                        {sT.map((t) => (
                            <g key={`s${t}`}>
                                <line className={t === 0 ? "fjv-a-nul" : "fjv-a-gitter"} x1={venstre} x2={bredde - højre} y1={yS(t)} y2={yS(t)} />
                                <text className="fjv-a-akse" x={venstre - 6} y={yS(t)} dy="0.35em" textAnchor="end">{akseTal(t, sT)}</text>
                            </g>
                        ))}
                        <path className="fjv-a-linje" d={trin((p) => p.spot, yS)} stroke="var(--dash-ink-2)" />
                    </>}
                    {/* tidsakse */}
                    {dage.map((t, i) => (
                        <g key={t}>
                            <line className="fjv-a-gitter" x1={x(t)} x2={x(t)} y1={top} y2={total - aksH} />
                            {i % hverN === 0 && x(t) + 58 <= bredde && <text className="fjv-a-akse" x={x(t) + 3} y={total - 6}>{dkDagEtiket(new Date(t))}</text>}
                        </g>
                    ))}
                    {hp && <line className="fjv-a-kors" x1={x(hp.tid.getTime() + dt / 2)} x2={x(hp.tid.getTime() + dt / 2)} y1={top} y2={total - aksH} />}
                    <rect className="fjv-a-flade" x={venstre} y={top} width={plotB} height={total - aksH - top} onPointerMove={vælg} onPointerDown={vælg} />
                </svg>
            )}
            {hp && (
                <Tip x={x(hp.tid.getTime() + dt / 2)} bredde={bredde} titel={dkTidspunkt(hp.tid)} rækker={[
                    { navn: "Varmelast", streg: true, værdi: `${dec(hp.last, 1)} MW` },
                    ...enheder.filter((e) => (hp.prod[e.navn] ?? 0) > 0.0005).map((e) => ({ navn: e.navn, plads: e.plads, værdi: `${dec(hp.prod[e.navn], 1)} MW` })),
                    ...(hp.aflad > 0.0005 ? [{ navn: "Fra lager (netto)", værdi: `${dec(hp.aflad, 1)} MW` }] : []),
                    ...(hp.lad > 0.0005 ? [{ navn: "Til lager (netto)", værdi: `${dec(hp.lad, 1)} MW` }] : []),
                    ...(harLager ? lagre.map((l) => ({ navn: l, værdi: hp.lager[l] == null ? "–" : `${tal(hp.lager[l])} MWh` })) : []),
                    ...(harSpot && hp.spot != null ? [{ navn: "Spotpris", værdi: `${tal(hp.spot)} kr./MWh` }] : []),
                ]} />
            )}
        </div>
    );
}

export function LagerForklaring({ lagre }: { lagre: readonly string[] }) {
    if (lagre.length === 0) return null;
    return <>
        <span><i className="fjv-a-prik" style={{ background: "var(--dash-ink-3)", opacity: 0.5 }} />Fra lager (netto)</span>
        {lagre.map((l, i) => <span key={l}><i className="fjv-a-streg" style={{ background: lagerFarve(i) }} />{l}</span>)}
    </>;
}
