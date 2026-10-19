//-----------------------------------------------------------------------
// Danske (da-DK) formatterere for tal, procenter og datoer.
//-----------------------------------------------------------------------

const int0 = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });

function dec(v: number, d: number): string {
    return new Intl.NumberFormat("da-DK", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
    }).format(v);
}

/** Full integer with da-DK thousands separators, e.g. 168089 → "168.089". */
export function tal(v: number): string {
    return int0.format(Math.round(v));
}

/** Compact magnitude in Danish, e.g. 19006002 → "19,0 mio.", 168089 → "168 t.". */
export function kompakt(v: number): string {
    const a = Math.abs(v);
    if (a >= 1_000_000_000) return dec(v / 1_000_000_000, 1) + " mia.";
    if (a >= 1_000_000) return dec(v / 1_000_000, 1) + " mio.";
    if (a >= 10_000) return int0.format(Math.round(v / 1_000)) + " t.";
    return int0.format(Math.round(v));
}

/** Compact kroner, e.g. 19006002 → "19,0 mio. kr.". */
export function kr(v: number): string {
    return kompakt(v) + " kr.";
}

/** Signed percent, e.g. 0.081 → "+8,1 %", -0.02 → "−2,0 %". */
export function pct(v: number): string {
    const sign = v > 0 ? "+" : v < 0 ? "−" : "";
    return sign + dec(Math.abs(v) * 100, 1) + " %";
}

/** Unsigned percent, e.g. 0.025 → "2,5 %". */
export function procent(v: number): string {
    return dec(v * 100, 1) + " %";
}

/**
 * Dato fra modellen, fx "2025-10-13T00:00:00" → "13-10-2025".
 * Læses fra strengens egne cifre og IKKE via `new Date()`: modellens datoer er
 * uden zone, og en zone-konvertering kan flytte dem en dag (denne maskine kører UTC).
 */
export function modelDato(v: string | null | undefined): string {
    const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "–";
}

/** Tidspunkt fra databasen (UTC med zone) vist i brugerens lokale tid, fx "13-10-2026 09.12". */
export function tidspunkt(v: Date | string | null | undefined): string {
    if (!v) return "–";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "–";
    return d.toLocaleString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
