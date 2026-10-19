//-----------------------------------------------------------------------
// Grafer til fanen Tidsserier. IBCS-inspireret: målt = fuld linje/søjle,
// model (syntetisk varmelast) = stiplet linje / tom søjle; tætte serier
// har akse og gitterlinjer, få punkter har dataetiketter. Tegnes i den
// faktiske pixelbredde (useBredde), farver og skrift kun via tokens.
//-----------------------------------------------------------------------

import type { Spand } from "./tidsserie-analyse";
import { månedNavn } from "./tidsserie-budskaber";
import { useBredde } from "./useBredde";
import { akse, tidsmærker } from "./graf-akse";
import { dk, dkFri } from "./vis";

// o: plads over plotområdet til enhedsteksten, så den ikke rammer øverste akseværdi.
const H = 236, M = { v: 44, h: 12, o: 26, n: 30 };
const TIME = 3_600_000;

export interface Spor { navn: string; type: "maalt" | "model"; spande: Spand[] }

/** Tidsforløb: middel som linje; for den målte serie også min–maks-båndet, når et punkt dækker flere intervaller. */
export function TidsGraf({ spor, fraMs, tilMs, enhed = "MW" }: { spor: Spor[]; fraMs: number; tilMs: number; enhed?: string }) {
    const [ref, B] = useBredde();
    const maks = Math.max(0, ...spor.flatMap((s) => s.spande.map((x) => (s.type === "maalt" ? x.maks : x.middel) ?? 0)));
    const { top, trin } = akse(maks);
    const x = (ms: number) => M.v + ((ms - fraMs) / (tilMs - fraMs || 1)) * (B - M.v - M.h);
    const y = (v: number) => H - M.n - (v / top) * (H - M.o - M.n);
    const linjer = Array.from({ length: Math.round(top / trin) + 1 }, (_, i) => i * trin);
    const sti = (sp: Spand[], f: (s: Spand) => number | null) => {
        let d = "", ny = true;
        for (const s of sp) {
            const v = f(s);
            if (v === null) { ny = true; continue; }
            d += `${ny ? "M" : "L"}${x((s.fraMs + s.tilMs) / 2).toFixed(1)},${y(v).toFixed(1)}`;
            ny = false;
        }
        return d;
    };
    const bånd = (sp: Spand[]) => {
        const dele: string[] = [];
        let cur: Spand[] = [];
        const luk = () => {
            if (cur.length > 1) {
                const op = cur.map((s) => `${x((s.fraMs + s.tilMs) / 2).toFixed(1)},${y(s.maks!).toFixed(1)}`);
                const ned = [...cur].reverse().map((s) => `${x((s.fraMs + s.tilMs) / 2).toFixed(1)},${y(s.min!).toFixed(1)}`);
                dele.push(`M${op.join("L")}L${ned.join("L")}Z`);
            }
            cur = [];
        };
        for (const s of sp) { if (s.min === null || s.maks === null) luk(); else cur.push(s); }
        luk();
        return dele.join(" ");
    };
    const mærker = tidsmærker(fraMs, tilMs, B - M.v - M.h);
    const harBånd = (sp: Spand[]) => sp.some((s) => s.tilMs - s.fraMs > TIME);
    return (
        <div ref={ref}><svg className="kf-graf" width={B} height={H} viewBox={`0 0 ${B} ${H}`} role="img"
            aria-label={`${spor.map((s) => s.navn).join(" og ")}, højst ${dk(maks, 1)} ${enhed}`}>
            {linjer.map((l) => (
                <g key={l}>
                    <line className={l === 0 ? "kf-akse" : "kf-gitterlinje"} x1={M.v} x2={B - M.h} y1={y(l)} y2={y(l)} />
                    <text x={M.v - 6} y={y(l) + 4} textAnchor="end">{dkFri(l)}</text>
                </g>
            ))}
            {mærker.map((m) => (
                <g key={m.ms}>
                    <line className="kf-akse" x1={x(m.ms)} x2={x(m.ms)} y1={y(0)} y2={y(0) + 4} />
                    <text x={x(m.ms)} y={H - M.n + 16} textAnchor="middle">{m.tekst}</text>
                </g>
            ))}
            {spor.filter((s) => s.type === "maalt" && harBånd(s.spande)).map((s) => <path key={`b${s.navn}`} className="kf-baand" d={bånd(s.spande)} />)}
            {spor.map((s) => <path key={s.navn} className={s.type === "maalt" ? "kf-maalt" : "kf-model"} d={sti(s.spande, (z) => z.middel)} />)}
            <text x={2} y={10}>{enhed}</text>
        </svg></div>
    );
}

/** Varighedskurve: værdierne sorteret faldende over andelen af tiden. */
export function VarighedsGraf({ punkter, enhed = "MW" }: { punkter: { andel: number; mw: number }[]; enhed?: string }) {
    const [ref, B] = useBredde();
    if (!punkter.length) return <p className="fjv-tilstand">Ingen værdier.</p>;
    const { top, trin } = akse(punkter[0].mw);
    const x = (a: number) => M.v + a * (B - M.v - M.h);
    const y = (v: number) => H - M.n - (v / top) * (H - M.o - M.n);
    const linjer = Array.from({ length: Math.round(top / trin) + 1 }, (_, i) => i * trin);
    const d = punkter.map((p, i) => `${i ? "L" : "M"}${x(p.andel).toFixed(1)},${y(p.mw).toFixed(1)}`).join("");
    return (
        <div ref={ref}><svg className="kf-graf" width={B} height={H} viewBox={`0 0 ${B} ${H}`} role="img"
            aria-label={`Varighedskurve fra ${dk(punkter[0].mw, 1)} til ${dk(punkter[punkter.length - 1].mw, 1)} ${enhed}`}>
            {linjer.map((l) => (
                <g key={l}>
                    <line className={l === 0 ? "kf-akse" : "kf-gitterlinje"} x1={M.v} x2={B - M.h} y1={y(l)} y2={y(l)} />
                    <text x={M.v - 6} y={y(l) + 4} textAnchor="end">{dkFri(l)}</text>
                </g>
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((a) => <text key={a} x={x(a)} y={H - M.n + 16} textAnchor={a === 0 ? "start" : a === 1 ? "end" : "middle"}>{dkFri(a * 100)} %</text>)}
            <path className="kf-maalt" d={d} />
            <text x={2} y={10}>{enhed}</text>
            <text x={B - M.h} y={H - 2} textAnchor="end">Andel af tiden</text>
        </svg></div>
    );
}

export interface Månedssøjle { nøgle: string; maalt: number; model?: number; hel: boolean }

/**
 * Energi pr. måned. Målt = fyldt søjle, model = tom søjle ved siden af. Ufuldstændige måneder tegnes lysere.
 * Etiketter på søjlerne, når der er få måneder og ingen model (IBCS: få punkter → etiketter, ellers akse).
 */
export function MaanedsGraf({ måneder, enhed = "MWh" }: { måneder: Månedssøjle[]; enhed?: string }) {
    const [ref, B] = useBredde();
    if (!måneder.length) return <p className="fjv-tilstand">Ingen måneder.</p>;
    const medModel = måneder.some((m) => m.model !== undefined);
    const rå = Math.max(...måneder.map((m) => Math.max(m.maalt, m.model ?? 0)));
    // Store tal vises i GWh (aksen "30.000" MWh fylder og læses dårligt).
    const gwh = enhed === "MWh" && rå >= 10_000;
    const f = gwh ? 1 / 1000 : 1;
    måneder = måneder.map((m) => ({ ...m, maalt: m.maalt * f, model: m.model === undefined ? undefined : m.model * f }));
    enhed = gwh ? "GWh" : enhed;
    const maks = rå * f;
    const { top, trin } = akse(maks);
    const w = (B - M.v - M.h) / måneder.length;
    const y = (v: number) => H - M.n - (v / top) * (H - M.o - M.n);
    const linjer = Array.from({ length: Math.round(top / trin) + 1 }, (_, i) => i * trin);
    const etiketter = !medModel && måneder.length <= 13 && w >= 34;
    const hvert = Math.max(1, Math.ceil(måneder.length / Math.max(1, Math.floor((B - M.v - M.h) / 46))));
    const bw = medModel ? Math.max((w - 6) / 2, 1) : Math.max(w - 6, 1);
    return (
        <div ref={ref}><svg className="kf-graf" width={B} height={H} viewBox={`0 0 ${B} ${H}`} role="img" aria-label={`Energi pr. måned, højst ${dk(maks, 0)} ${enhed}`}>
            {linjer.map((l) => (
                <g key={l}>
                    <line className={l === 0 ? "kf-akse" : "kf-gitterlinje"} x1={M.v} x2={B - M.h} y1={y(l)} y2={y(l)} />
                    {!etiketter && <text x={M.v - 6} y={y(l) + 4} textAnchor="end">{dkFri(l)}</text>}
                </g>
            ))}
            {måneder.map((m, i) => {
                const x0 = M.v + i * w + 3;
                return (
                    <g key={m.nøgle}>
                        <rect className="kf-soejle" data-delvis={m.hel ? undefined : "true"} x={x0} width={bw} y={y(m.maalt)} height={Math.max(y(0) - y(m.maalt), 0)}>
                            <title>{`${månedNavn(m.nøgle)}: målt ${dk(m.maalt, gwh ? 2 : 0)} ${enhed}${m.model !== undefined ? `, model ${dk(m.model, gwh ? 2 : 0)} ${enhed}` : ""}${m.hel ? "" : " (ufuldstændig måned)"}`}</title>
                        </rect>
                        {m.model !== undefined && <rect className="kf-soejle-model" x={x0 + bw} width={bw} y={y(m.model)} height={Math.max(y(0) - y(m.model), 0)} />}
                        {etiketter && <text className="kf-etiket" x={x0 + bw / 2} y={y(m.maalt) - 4} textAnchor="middle">{dkFri(m.maalt, gwh ? 1 : 0)}</text>}
                        {i % hvert === 0 && <text x={x0 + (medModel ? bw : bw / 2)} y={H - M.n + 16} textAnchor="middle">{månedNavn(m.nøgle, true).split(" ")[0]}</text>}
                    </g>
                );
            })}
            <text x={2} y={10}>{enhed}</text>
        </svg></div>
    );
}

/** 24 timers middelprofil (UTC); tomme timer tegnes ikke. */
export function DoegnGraf({ værdier, enhed = "MW" }: { værdier: (number | null)[]; enhed?: string }) {
    const [ref, B] = useBredde();
    const maks = Math.max(0, ...værdier.map((v) => v ?? 0));
    const { top, trin } = akse(maks);
    const w = (B - M.v - M.h) / 24;
    const y = (v: number) => H - M.n - (v / top) * (H - M.o - M.n);
    const linjer = Array.from({ length: Math.round(top / trin) + 1 }, (_, i) => i * trin);
    return (
        <div ref={ref}><svg className="kf-graf" width={B} height={H} viewBox={`0 0 ${B} ${H}`} role="img" aria-label={`Døgnprofil, højst ${dk(maks, 1)} ${enhed}`}>
            {linjer.map((l) => (
                <g key={l}>
                    <line className={l === 0 ? "kf-akse" : "kf-gitterlinje"} x1={M.v} x2={B - M.h} y1={y(l)} y2={y(l)} />
                    <text x={M.v - 6} y={y(l) + 4} textAnchor="end">{dkFri(l)}</text>
                </g>
            ))}
            {værdier.map((v, i) => (v === null ? null : (
                <rect key={i} className="kf-soejle" data-top={v === maks ? "true" : undefined} x={M.v + i * w + 1} width={Math.max(w - 2, 1)} y={y(v)} height={Math.max(y(0) - y(v), 0)}>
                    <title>{`kl. ${String(i).padStart(2, "0")} UTC: ${dk(v, 2)} ${enhed}`}</title>
                </rect>
            )))}
            {værdier.map((_, i) => (i % 3 === 0 ? <text key={`t${i}`} x={M.v + i * w + w / 2} y={H - M.n + 16} textAnchor="middle">{String(i).padStart(2, "0")}</text> : null))}
            <text x={M.v} y={H - 2}>Time 0–23 (UTC)</text>
            <text x={2} y={10}>{enhed}</text>
        </svg></div>
    );
}
