//-----------------------------------------------------------------------
// Pythons round(x, n) for et float (Codex K8 F1). Modelrepoets værksark skalerer varmelasten med round(…)
// (scripts/vaerksark_til_yaml.py:1581-1592), og appens guide skal give PRÆCIS samme tal.
//
// Python afrunder den binære værdis EKSAKTE decimaludvidelse til nærmeste; et ægte halvtilfælde (fx 0,5625 =
// 9/16 til 3 decimaler) går til det LIGE ciffer. JavaScripts toFixed afrunder også den eksakte værdi, men tager
// det STØRSTE tal ved et halvtilfælde — derfor findes halvtilfældet her eksakt med BigInt og afgøres som i Python.
//-----------------------------------------------------------------------

/** Den eksakte binære værdi af x som (tæller, 2-eksponent): |x| = m · 2^e, m heltal. */
function eksakt(x: number): { m: bigint; e: number } {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, Math.abs(x));
    const bits = dv.getBigUint64(0);
    const eksp = Number((bits >> 52n) & 0x7ffn);
    const brøk = bits & ((1n << 52n) - 1n);
    return eksp === 0 ? { m: brøk, e: -1074 } : { m: brøk | (1n << 52n), e: eksp - 1075 };
}

/** round(x, n) som i Python 3 (n ≥ 0). */
export function pyRound(x: number, n: number): number {
    if (!Number.isFinite(x) || x === 0) return x;
    const { m, e } = eksakt(x);
    if (e < 0) {
        const tæller = m * 10n ** BigInt(n);
        const nævner = 1n << BigInt(-e);
        if ((tæller % nævner) * 2n === nævner) {            // ægte halvtilfælde: til lige
            let q = tæller / nævner;
            if (q % 2n === 1n) q += 1n;
            const t = Number(`${q}e-${n}`);
            return x < 0 ? -t : t;
        }
    }
    return Number(x.toFixed(n));
}
