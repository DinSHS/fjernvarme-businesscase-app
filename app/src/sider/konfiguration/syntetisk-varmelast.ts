//-----------------------------------------------------------------------
// Modellens syntetiske varmelast, regnet i browseren — så en målt serie kan
// lægges ved siden af det, modellen ville have regnet med uden filen.
//
// Port af (modelrepo @ b49aeb0):
//   src/data_loader_github.py:656-659  DMI-temperatur → modellens akse
//                                       (tidsinterpolation, så ffill/bfill)
//   src/data_loader.py:702-778         synthesize_heat_load, grenene
//                                       "dual-slope" og "ingen nettab"
//   src/data_loader.py:673-686         HeatLoadParams.from_yaml_dict (standardværdier)
// Den fysiske to-leds nettab-model (heat_load_params.nettab) er IKKE porteret:
// et værk med den blok får en forklaring i stedet for et tal.
// Testet mod modellens egen Python (syntese-vektorer.json, _byg/syntese_vektorer.py).
// Ren logik.
//-----------------------------------------------------------------------

export interface SyntesParametre {
    gaf_mw_per_k: number;
    t_ref: number;
    thermal_inertia_hours: number;
    nettab_slope_mw_per_k: number;
    t_net: number;
    weekly_dip: number;
    baseline_profile_mw: number[];
}

export type Parameterudfald = { ok: true; p: SyntesParametre } | { ok: false; grund: string };

const PRÆFIKS = "heat_load_params.";

function tal(json: string | undefined): number | undefined {
    if (json === undefined) return undefined;
    try {
        const v: unknown = JSON.parse(json);
        return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    } catch { return undefined; }
}

/**
 * Parametrene fra værkets blade (sti → vaerdi_json), med modellens standardværdier
 * hvor et blad mangler. `gaf_mw_per_k` er påkrævet, som i modellen (`float(d["gaf_mw_per_k"])`).
 */
export function syntesParametre(blade: ReadonlyMap<string, string>): Parameterudfald {
    const g = (k: string) => blade.get(PRÆFIKS + k);
    if ([...blade.keys()].some((s) => s.startsWith(`${PRÆFIKS}nettab.`) || s === `${PRÆFIKS}nettab`)) {
        return { ok: false, grund: "Værket bruger den fysiske nettab-model (heat_load_params.nettab). Den regnes kun i modellen, ikke i appen." };
    }
    const gaf = tal(g("gaf_mw_per_k"));
    if (gaf === undefined) return { ok: false, grund: "Værket har ingen gyldig heat_load_params.gaf_mw_per_k, så varmelastmodellen kan ikke regnes." };
    let profil = [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6];
    const pj = g("baseline_profile_mw");
    if (pj !== undefined) {
        try {
            const v: unknown = JSON.parse(pj);
            if (!Array.isArray(v) || v.length !== 24 || !v.every((x) => typeof x === "number" && Number.isFinite(x))) {
                return { ok: false, grund: "heat_load_params.baseline_profile_mw skal være 24 tal (modellen afviser casen)." };
            }
            profil = v as number[];
        } catch { return { ok: false, grund: "heat_load_params.baseline_profile_mw kan ikke læses." }; }
    }
    return {
        ok: true,
        p: {
            gaf_mw_per_k: gaf,
            t_ref: tal(g("t_ref")) ?? 15.0,
            // int(...) i Python: afkort mod nul.
            thermal_inertia_hours: Math.trunc(tal(g("thermal_inertia_hours")) ?? 24),
            nettab_slope_mw_per_k: tal(g("nettab_slope_mw_per_k")) ?? 0.0,
            t_net: tal(g("t_net")) ?? 12.0,
            weekly_dip: tal(g("weekly_dip")) ?? 0.02,
            baseline_profile_mw: profil,
        },
    };
}

const TIME_MS = 3_600_000;

/** "2026-01-01 00:00:00" / ISO med eller uden Z → ms (UTC; DMI's hour_utc er uden zone). */
export function utcMs(tekst: string): number {
    const t = tekst.trim().replace(" ", "T");
    return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? t : `${t}Z`);
}

/**
 * DMI-rækkerne lagt på modellens timeakse [start, start + n timer):
 * `reindex(akse ∪ rå).interpolate(method="time").reindex(akse).ffill().bfill()`.
 * Rækker uden tal (null) er huller, som interpoleres ligesom manglende rækker.
 * Returnerer null, hvis der ikke er ét eneste tal.
 */
export function temperaturPåAkse(startMs: number, n: number, tider: readonly string[], værdier: readonly (number | null)[]): number[] | null {
    // Rå punkter (dubletter: den første beholdes, som fetch_dmi_obs_github), sorteret.
    const set = new Map<number, number | null>();
    tider.forEach((t, i) => { const ms = utcMs(t); if (!Number.isNaN(ms) && !set.has(ms)) set.set(ms, værdier[i] ?? null); });
    for (let i = 0; i < n; i++) { const ms = startMs + i * TIME_MS; if (!set.has(ms)) set.set(ms, null); }
    const punkter = [...set.entries()].sort((a, b) => a[0] - b[0]);
    const gyldige = punkter.filter((p): p is [number, number] => p[1] !== null && Number.isFinite(p[1]));
    if (gyldige.length === 0) return null;
    // Tidsinterpolation mellem gyldige naboer; efter sidste gyldige: den sidste værdi (pandas' fremadrettede udfyldning);
    // før den første: tom, som derefter bfill'es.
    const v = new Map<number, number | null>();
    let j = 0;
    for (const [ms, x] of punkter) {
        if (x !== null && Number.isFinite(x)) { v.set(ms, x); continue; }
        while (j < gyldige.length && gyldige[j][0] < ms) j++;
        const før = gyldige[j - 1], efter = gyldige[j];
        if (!før) v.set(ms, null);
        else if (!efter) v.set(ms, før[1]);
        else v.set(ms, før[1] + ((ms - før[0]) / (efter[0] - før[0])) * (efter[1] - før[1]));
    }
    const akse: (number | null)[] = Array.from({ length: n }, (_, i) => v.get(startMs + i * TIME_MS) ?? null);
    for (let i = 1; i < n; i++) if (akse[i] === null) akse[i] = akse[i - 1];
    for (let i = n - 2; i >= 0; i--) if (akse[i] === null) akse[i] = akse[i + 1];
    return akse as number[];
}

export interface Syntese { gaf: number[]; guf: number[]; nettab: number[]; total: number[] }

/** synthesize_heat_load for en timeakse fra `startMs` (UTC) med temperaturen allerede på aksen. */
export function syntetiser(startMs: number, tUde: readonly number[], p: SyntesParametre): Syntese {
    const n = tUde.length;
    const α = 2 / (p.thermal_inertia_hours + 1);
    const gaf: number[] = new Array(n), guf: number[] = new Array(n), nettab: number[] = new Array(n), total: number[] = new Array(n);
    let glat = 0;
    for (let i = 0; i < n; i++) {
        // ewm(span, adjust=False): y0 = x0, y_t = (1 − α)·y_{t−1} + α·x_t
        glat = i === 0 ? tUde[0] : (1 - α) * glat + α * tUde[i];
        const d = new Date(startMs + i * TIME_MS);
        let g = p.gaf_mw_per_k * Math.max(p.t_ref - glat, 0);
        // Weekend-dyk kun på GAF; ugedag på den UTC-naive akse (dayofweek >= 5 = lørdag/søndag).
        if (p.weekly_dip) { const dag = d.getUTCDay(); if (dag === 6 || dag === 0) g *= 1 - p.weekly_dip; }
        const b = p.baseline_profile_mw[d.getUTCHours()];
        const nt = p.nettab_slope_mw_per_k > 0 ? p.nettab_slope_mw_per_k * Math.max(p.t_net - tUde[i], 0) : 0;
        gaf[i] = g; guf[i] = b; nettab[i] = nt; total[i] = g + b + nt;
    }
    return { gaf, guf, nettab, total };
}
