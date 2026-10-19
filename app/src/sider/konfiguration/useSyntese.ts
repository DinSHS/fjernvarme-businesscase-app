//-----------------------------------------------------------------------
// Værkets varmelastmodel regnet i browseren over en målt series periode
// (højst det seneste år), med DMI-temperatur fra lakehusets df-data.
//-----------------------------------------------------------------------

import { useMemo } from "react";
import type { Serie } from "./serie";
import { tilTimer } from "./tidsserie-analyse";
import { syntesParametre, syntetiser, temperaturPåAkse } from "./syntetisk-varmelast";
import { useDmiTemperatur } from "./tidsserie-kilde";

const TIME = 3_600_000, DØGN = 24 * TIME;

/** Højst ét år bagud fra seriens slutning — så meget DMI-temperatur hentes til sammenligningen. */
export function sammenligningsvindue(s: Serie): { fraMs: number; tilMs: number; timer: number } {
    const h = tilTimer(s);
    const til = h.startMs + h.værdier.length * TIME;
    const fra = Math.max(h.startMs, til - 365 * DØGN);
    return { fraMs: fra, tilMs: til, timer: (til - fra) / TIME };
}

/** Værkets DMI-temperaturkolonne (data.dmi_temp_shortname) eller modellens standard. */
export function dmiKolonne(blade: ReadonlyMap<string, string> | undefined): string {
    try {
        const v: unknown = JSON.parse(blade?.get("data.dmi_temp_shortname") ?? "null");
        return typeof v === "string" && v ? v : "temp_mean_past1h";
    } catch { return "temp_mean_past1h"; }
}

export interface Syntesetilstand { fraMs: number; total: number[] | null; grund?: string; data_commit?: string; kolonne?: string; henter: boolean }

/** Værkets varmelastmodel regnet over (højst) seriens seneste år med DMI-temperatur fra lakehuset. */
export function useSyntese(serie: Serie | null, blade: ReadonlyMap<string, string> | undefined, aktiv: boolean): Syntesetilstand | null {
    const params = useMemo(() => (blade ? syntesParametre(blade) : null), [blade]);
    const vindue = useMemo(() => (serie ? sammenligningsvindue(serie) : null), [serie]);
    const omraade = blade ? (() => { try { return JSON.parse(blade.get("data.dmi_area") ?? "null") as string | null; } catch { return null; } })() : null;
    // Modellen læser cfg.data.dmi_temp_shortname (src/data_loader_github.py:632-645), standard temp_mean_past1h (src/config.py:678).
    const kolonne = dmiKolonne(blade);
    const kan = aktiv && !!vindue && !!params?.ok && !!omraade;
    const dmi = useDmiTemperatur(kan ? omraade ?? undefined : undefined, kan ? vindue!.fraMs : undefined, kan ? vindue!.tilMs : undefined, kolonne);
    return useMemo(() => {
        if (!aktiv || !vindue) return null;
        if (!params) return { fraMs: vindue.fraMs, total: null, grund: "Værkets parametre er ikke hentet.", henter: true };
        if (!params.ok) return { fraMs: vindue.fraMs, total: null, grund: params.grund, henter: false };
        if (!omraade) return { fraMs: vindue.fraMs, total: null, grund: "Værket har intet DMI-område (data.dmi_area).", henter: false };
        if (dmi.fejl) return { fraMs: vindue.fraMs, total: null, grund: dmi.fejl.message, henter: false };
        if (!dmi.data) return { fraMs: vindue.fraMs, total: null, henter: true };
        const temp = temperaturPåAkse(vindue.fraMs, vindue.timer, dmi.data.tider, dmi.data.vaerdier);
        if (!temp) return { fraMs: vindue.fraMs, total: null, grund: `df-data har ingen temperatur for ${omraade} i perioden.`, henter: false };
        return { fraMs: vindue.fraMs, total: syntetiser(vindue.fraMs, temp, params.p).total, data_commit: dmi.data.data_commit, kolonne, henter: false };
    }, [aktiv, vindue, params, omraade, kolonne, dmi.data, dmi.fejl]);
}

