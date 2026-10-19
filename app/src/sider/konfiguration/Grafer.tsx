//-----------------------------------------------------------------------
// Små, rolige grafer (IBCS-inspireret): dataetiketter ved få punkter,
// akse ved tætte serier. Farver og skrift kun via tokens (konfiguration.css).
//-----------------------------------------------------------------------

import { useBredde } from "./useBredde";
import type { CopPunkt } from "./gruppering";
import { dk, dkFri } from "./vis";

const H = 190, M = { v: 36, h: 12, o: 18, n: 30 };


/** COP mod udetemperatur — én linje med dataetiket i hvert målepunkt. */
export function CopKurve({ punkter }: { punkter: readonly CopPunkt[] }) {
    const [ref, B] = useBredde();
    if (punkter.length < 2) return <p className="fjv-tilstand">COP-tabellen har under to punkter.</p>;
    const xs = punkter.map((p) => p.t_ambient), ys = punkter.map((p) => p.cop);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = 0, y1 = Math.ceil(Math.max(...ys) + 0.5);
    const x = (v: number) => M.v + ((v - x0) / (x1 - x0 || 1)) * (B - M.v - M.h);
    const y = (v: number) => H - M.n - ((v - y0) / (y1 - y0)) * (H - M.o - M.n);
    const sti = punkter.map((p, i) => `${i ? "L" : "M"}${x(p.t_ambient).toFixed(1)},${y(p.cop).toFixed(1)}`).join(" ");
    return (
        <div ref={ref}><svg className="kf-graf" width={B} height={H} viewBox={`0 0 ${B} ${H}`} role="img" aria-label={`COP fra ${dk(ys[0], 2)} til ${dk(ys[ys.length - 1], 2)}`}>
            <line className="kf-akse" x1={M.v} x2={B - M.h} y1={y(0)} y2={y(0)} />
            {punkter.map((p) => (
                <g key={p.t_ambient}>
                    <text x={x(p.t_ambient)} y={H - M.n + 16} textAnchor="middle">{dkFri(p.t_ambient)} °C</text>
                </g>
            ))}
            <path className="kf-serie" d={sti} />
            {punkter.map((p) => (
                <g key={`p${p.t_ambient}`}>
                    <circle className="kf-punkt" cx={x(p.t_ambient)} cy={y(p.cop)} r={3.5} />
                    <text className="kf-etiket" x={x(p.t_ambient)} y={y(p.cop) - 8} textAnchor="middle">{dk(p.cop, 2)}</text>
                </g>
            ))}
            <text x={M.v} y={H - 2}>Udetemperatur</text>
            <text x={2} y={M.o - 4}>COP</text>
        </svg></div>
    );
}

/** 24-timers profil — søjler med akse (tæt serie), højeste time fremhævet. */
export function ProfilGraf({ værdier, enhed }: { værdier: readonly number[]; enhed: string }) {
    const [ref, B] = useBredde();
    if (værdier.length === 0) return <p className="fjv-tilstand">Ingen profil.</p>;
    const maks = Math.max(...værdier);
    const top = Math.ceil(maks);
    const trin = top <= 4 ? 1 : top <= 10 ? 2 : Math.ceil(top / 5);
    const linjer = Array.from({ length: Math.floor(top / trin) + 1 }, (_, i) => i * trin);
    const w = (B - M.v - M.h) / værdier.length;
    const y = (v: number) => H - M.n - (v / (linjer[linjer.length - 1] || 1)) * (H - M.o - M.n);
    return (
        <div ref={ref}><svg className="kf-graf" width={B} height={H} viewBox={`0 0 ${B} ${H}`} role="img" aria-label={`Profil, højest ${dk(maks, 1)} ${enhed}`}>
            {linjer.map((l) => (
                <g key={l}>
                    <line className={l === 0 ? "kf-akse" : "kf-gitterlinje"} x1={M.v} x2={B - M.h} y1={y(l)} y2={y(l)} />
                    <text x={M.v - 6} y={y(l) + 4} textAnchor="end">{dkFri(l)}</text>
                </g>
            ))}
            {værdier.map((v, i) => (
                <rect key={i} className="kf-soejle" data-top={v === maks ? "true" : undefined}
                    x={M.v + i * w + 1} width={Math.max(w - 2, 1)} y={y(v)} height={Math.max(y(0) - y(v), 0)}>
                    <title>{`kl. ${String(i).padStart(2, "0")}: ${dk(v, 2)} ${enhed}`}</title>
                </rect>
            ))}
            {værdier.map((_, i) => (i % 3 === 0 ? <text key={`t${i}`} x={M.v + i * w + w / 2} y={H - M.n + 16} textAnchor="middle">{String(i).padStart(2, "0")}</text> : null))}
            <text x={M.v} y={H - 2}>Time 0–23 (UTC)</text>
            <text x={2} y={M.o - 4}>{enhed}</text>
        </svg></div>
    );
}
