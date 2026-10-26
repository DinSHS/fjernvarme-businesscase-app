//-----------------------------------------------------------------------
// Analysernes grafer — inline SVG, ingen afhængigheder.
//
// Regler (dataviz-skillen + briefen): én akse pr. panel (aldrig to y-skalaer;
// spotpris får sit eget panel med fælles tidsakse), farven følger enheden
// (farvepladser i beregn.ts), tynde mærker, hårfine gitterlinjer, direkte
// etiketter sparsomt, tekst altid i tekst-tokens, hover med tal på alt.
// Hver graf ledsages af en tabel på siden (tal-visningen).
// IBCS (app/IBCS.md): her står kun sammensætningen over tid (stablede måneder,
// dispatch, punkter) — afvigelse AF1/AF3. Sammenligninger (Ref mod Scen, ΔRef)
// og strukturgrafer er i ibcs-grafer.tsx med IBCS-notation.
//-----------------------------------------------------------------------

import { useState, type ReactNode } from "react";
import { tal } from "@/lib/format";
import type { DispatchPunkt } from "./beregn";
import { farve, lagerFarve, paeneTicks, useBredde, type DispatchSkala } from "./graf-hjaelp";
import { dec, dkDagEtiket, dkTidspunkt } from "./fmt";
import { useSkalagruppe } from "./ibcs-grafer";

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

/** Søjle fra nul-linjen, kantet (IBCS SI 2.1: ingen afrundede datamærker). */
function soejleSti(x: number, y0: number, y1: number, b: number): string {
    const op = y1 < y0;
    const h = Math.abs(y1 - y0);
    if (h <= 0) return "";
    return `M${x},${y0}V${op ? y0 - h : y0 + h}H${x + b}V${y0}Z`;
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

/**
 * `skalagruppe`: grafen deler px pr. enhed med sidens andre grafer i samme enhed (ScaleProvider; IBCS CH 4.1, Codex K7 F6).
 * `faktor` omregner søjlernes enhed til gruppens (GWh → MWh = 1000). Plottets højde er da intervallet × px pr. enhed —
 * højst `maksPlot` px — i stedet for den faste `højde`.
 */
export function StablededeSoejler({ søjler, enhed, markørNavn, formatér, højde = 220, skalagruppe, maksPlot = 320 }: {
    søjler: readonly StakSoejle[]; enhed: string; markørNavn?: string; formatér: (v: number) => string; højde?: number;
    skalagruppe?: { enhed: string; faktor: number }; maksPlot?: number;
}) {
    const [ref, bredde] = useBredde<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);
    const venstre = 44, top = 24, bund = 22;
    const op = søjler.map((s) => Math.max(s.markør ?? 0, s.dele.reduce((a, d) => a + Math.max(0, d.værdi), 0)));
    const ned = søjler.map((s) => s.dele.reduce((a, d) => a + Math.min(0, d.værdi), 0));
    const ticks = paeneTicks(Math.min(0, ...ned), Math.max(0, ...op));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const ppu = useSkalagruppe(skalagruppe && { enhed: skalagruppe.enhed, min: lo * skalagruppe.faktor, max: hi * skalagruppe.faktor, plads: () => maksPlot }, bredde);
    const plotH = skalagruppe && ppu ? Math.max(1, (hi - lo) * skalagruppe.faktor * ppu) : højde - top - bund;
    const svgH = top + plotH + bund;
    const y = (v: number) => top + (hi - v) / (hi - lo || 1) * plotH;
    const plotB = Math.max(10, bredde - venstre - 4);
    const slot = plotB / Math.max(1, søjler.length);
    const sb = Math.min(24, Math.max(6, slot * 0.6));
    const tynd = søjler.length > 8 && slot < 46;

    return (
        <div className="fjv-a-graf" ref={ref} onPointerLeave={() => setHover(null)}>
            {bredde > 0 && (
                <svg width={bredde} height={svgH} role="img" aria-label={`Stablede søjler, ${enhed}`}>
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
                                    return <path key={d.navn} d={soejleSti(x, y0 - gab, y1 + (j < positive.length - 1 ? 1 : 0), sb)} fill={farve(d.plads)} opacity={hover === null || hover === i ? 1 : 0.55} />;
                                })}
                                {negative.map((d, j) => {
                                    const y0 = y(nedAkk), y1 = y(nedAkk + d.værdi);
                                    nedAkk += d.værdi;
                                    const gab = j > 0 ? 1 : 0;
                                    return <path key={d.navn} d={soejleSti(x, y0 + gab, y1 - (j < negative.length - 1 ? 1 : 0), sb)} fill={farve(d.plads)} opacity={hover === null || hover === i ? 1 : 0.55} />;
                                })}
                                {s.markør != null && <line x1={x - 4} x2={x + sb + 4} y1={y(s.markør)} y2={y(s.markør)} stroke="var(--dash-ink)" strokeWidth={2} />}
                                {s.topEtiket && !tynd && (
                                    <text className="fjv-a-etiket-svag" x={x + sb / 2} y={y(Math.max(s.markør ?? 0, opAkk)) - 6} textAnchor="middle">{s.topEtiket}</text>
                                )}
                                {(!tynd || i % Math.ceil(søjler.length / 6) === 0) && (
                                    <text className="fjv-a-akse" x={x + sb / 2} y={svgH - 6} textAnchor="middle">{s.etiket}</text>
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
