//-----------------------------------------------------------------------
// Akser til fanen Tidsserier: pæne trin og tidsmærker i dansk tid. Ren logik.
//-----------------------------------------------------------------------

import { dkDel, dkMidnat } from "./serie";
import { månedNavn } from "./tidsserie-budskaber";

const TIME = 3_600_000, DØGN = 24 * TIME;

/** Pæn øvre grænse og trin for en akse fra 0. */
export function akse(maks: number): { top: number; trin: number } {
    if (!(maks > 0)) return { top: 1, trin: 0.25 };
    const rå = maks / 4;
    const p = 10 ** Math.floor(Math.log10(rå));
    const trin = [1, 2, 2.5, 5, 10].map((f) => f * p).find((t) => t >= rå) ?? 10 * p;
    return { top: Math.ceil(maks / trin) * trin, trin };
}

/** Akse-mærker i dansk tid, tæthed efter vinduets længde og grafens bredde. */
export function tidsmærker(fra: number, til: number, bredde: number): { ms: number; tekst: string }[] {
    const spænd = til - fra;
    const maksAntal = Math.max(2, Math.floor(bredde / 70));
    const ud: { ms: number; tekst: string }[] = [];
    const d0 = dkDel(fra);
    if (spænd <= 3 * DØGN) {
        const trin = [3, 6, 12].find((h) => spænd / (h * TIME) <= maksAntal) ?? 24;
        for (let t = Math.ceil(fra / TIME) * TIME; t <= til; t += TIME) {
            const d = dkDel(t);
            if (d.time % trin === 0) ud.push({ ms: t, tekst: d.time === 0 ? `${d.dag}/${d.måned}` : `kl. ${String(d.time).padStart(2, "0")}` });
        }
        return ud;
    }
    if (spænd <= 70 * DØGN) {
        const trin = [1, 2, 7, 14].find((n) => spænd / (n * DØGN) <= maksAntal) ?? 14;
        for (let i = 0; ; i++) {
            const t = dkMidnat(d0.år, d0.måned, d0.dag + i);
            if (t > til) break;
            const d = dkDel(t);
            if (t >= fra && (trin === 1 || (trin < 7 ? d.dag % trin === 1 : d.dag === 1 || d.dag === 15 || (trin === 7 && (d.dag === 8 || d.dag === 22)))))
                ud.push({ ms: t, tekst: `${d.dag}/${d.måned}` });
        }
        return ud;
    }
    const trin = [1, 2, 3, 6, 12].find((n) => spænd / (n * 30.4 * DØGN) <= maksAntal) ?? 12;
    for (let i = 0; ; i++) {
        const m0 = d0.måned - 1 + i;
        const år = d0.år + Math.floor(m0 / 12), måned = (m0 % 12) + 1;
        const t = dkMidnat(år, måned, 1);
        if (t > til) break;
        if (t >= fra && (måned - 1) % trin === 0) ud.push({ ms: t, tekst: måned === 1 || ud.length === 0 ? månedNavn(`${år}-${String(måned).padStart(2, "0")}`, true) : månedNavn(`${år}-${String(måned).padStart(2, "0")}`, true).split(" ")[0] });
    }
    return ud;
}

