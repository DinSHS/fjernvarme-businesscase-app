//-----------------------------------------------------------------------
// Adapter mellem fanen Tidsserier og fundamentet (KONTRAKT §6d). Det er
// den ENESTE fil i området, der ved, hvor tidsserier hentes og skrives;
// siderne bruger kun funktionerne her.
//
// Læsning: fundamentets hooks (pagineret, normaliseret). Skrivning: kun
// fundamentets skrivehjælpere (anmodning i brugerens navn → Function).
// Hvor backend endnu mangler noget, kaster adapteren en Afvist med en
// ærlig grund i stedet for at sende noget, backend ville tolke forkert.
//-----------------------------------------------------------------------

import { useDmiTemperatur as useFundamentDmi, useTidsseriedata, useTidsserier as useFundamentTidsserier, useVaerksarkimporter as useFundamentImporter, type Hentet } from "@/lib/data/hooks";
import { useMemo } from "react";
import * as skriv from "@/lib/data/skriv";
import { Afvist } from "@/lib/data/skriv";
import { forLangTekst, MAKS_POSITIONER, type Serie } from "./serie";

export type Rolle = "varmelast" | "solprofil";

/** En række i `Tidsserie` som datalaget giver den (datoer som Date efter normaliseringen). */
export interface TidsserieRække {
    id: string;
    vaerk_id: string;
    rolle: Rolle;
    navn: string;
    filnavn: string;
    sti?: string | null;
    sha256?: string | null;
    oploesning?: string | null;
    start?: Date | string | null;
    slut?: Date | string | null;
    antal_raekker?: number | null;
    antal_huller?: number | null;
    enhed?: string | null;
    tidsstempel: "start" | "slut";
    tidszone: string;
    kilde: "csv" | "vaerksark" | "repo";
    status: "validerer" | "gyldig" | "afvist";
    validering_json?: string | null;
    aktiv: boolean;
    uploadet_af: string;
    uploadet: Date | string;
}

export interface VaerksarkimportRække {
    id: string;
    filnavn: string;
    status: "koe" | "koerer" | "faerdig" | "fejl";
    vaerk_id?: string | null;
    tidsserie_id?: string | null;
    log?: string | null;
    uploadet_af: string;
    uploadet: Date | string;
}

/** Alle værkets tidsserier (også afviste), nyeste upload først. */
export function useTidsserier(vaerkId: string | undefined): Hentet<TidsserieRække[]> {
    return useFundamentTidsserier(vaerkId) as unknown as Hentet<TidsserieRække[]>;
}

/** Værksark-importerne, nyeste først. */
export function useVaerksarkimporter(): Hentet<VaerksarkimportRække[]> {
    return useFundamentImporter() as unknown as Hentet<VaerksarkimportRække[]>;
}

/** Svaret fra hentTidsserie som serie; `ok: false` bliver en fejl med backendens tekst. */
export function tilSerie(d: { ok: boolean; fejl?: string; start?: string; oploesning?: string; vaerdier?: (number | null)[] }): Serie {
    if (!d.ok || !d.start || !d.vaerdier) throw new Afvist(d.fejl || "Tidsseriens værdier kunne ikke hentes.");
    const ms = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(d.start) ? d.start : `${d.start}Z`);
    if (Number.isNaN(ms)) throw new Afvist(`Ukendt start på tidsserien: ${d.start}`);
    if (d.vaerdier.length > MAKS_POSITIONER) throw new Afvist(forLangTekst(d.vaerdier.length, d.vaerdier.filter((v) => v !== null).length));
    return { startMs: ms, opløsning: d.oploesning === "15min" ? "15min" : "1h", værdier: d.vaerdier };
}

/** Seriens værdier (Function `hentTidsserie`). */
export function useTidsserieVaerdier(id: string | undefined): Hentet<Serie> {
    const h = useTidsseriedata(id);
    // Samme svar = samme serie-objekt, så analysen ikke regnes om ved hver rendering.
    const tolket = useMemo((): { data?: Serie; fejl?: Error } => {
        if (!h.data) return {};
        try { return { data: tilSerie(h.data) }; } catch (e) { return { fejl: e as Error }; }
    }, [h.data]);
    return { ...h, data: tolket.data, fejl: h.fejl ?? tolket.fejl };
}

export interface DmiTemperatur { data_commit: string; tider: string[]; vaerdier: (number | null)[] }

const dato = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Rå DMI-temperatur (df-data i lakehuset, samme commit som arbejderen) for timerne [fraMs, tilMs).
 * Function'en tager hele UTC-døgn (fra/til begge med, højst 366 døgn); temperaturPåAkse vælger timerne.
 */
export function useDmiTemperatur(omraade: string | undefined, fraMs: number | undefined, tilMs: number | undefined, kolonne: string): Hentet<DmiTemperatur> {
    const kan = !!omraade && fraMs !== undefined && tilMs !== undefined;
    const h = useFundamentDmi(kan ? omraade : null, kan ? dato(fraMs!) : null, kan ? dato(tilMs! - 3_600_000) : null, kolonne);
    const tolket = useMemo((): { data?: DmiTemperatur; fejl?: Error } => {
        if (!h.data) return {};
        const d = h.data;
        if (!d.ok || !d.tider || !d.vaerdier) return { fejl: new Afvist(d.fejl || "DMI-temperaturen kunne ikke hentes.") };
        // Et tal fra en anden temperaturkolonne må ikke udgives som modellens syntese (K5-F11).
        if (d.kolonne !== kolonne) return { fejl: new Afvist(`Værket regner med DMI-kolonnen ${kolonne}, men svaret er ${d.kolonne ?? "uden kolonne"} — varmelastmodellen vises derfor ikke.`) };
        return { data: { data_commit: d.data_commit ?? "", tider: d.tider, vaerdier: d.vaerdier } };
    }, [h.data, kolonne]);
    return { ...h, data: tolket.data, fejl: h.fejl ?? tolket.fejl };
}

export type Enhed = "MW" | "kW" | "MWh" | "kWh";
export interface UploadInput {
    vaerkId: string; rolle: Rolle; navn: string; filnavn: string;
    /** Filens oprindelige bytes — backend afkoder selv (UTF-8, ellers Windows-1252), som forhåndstjekket. */
    bytes: Uint8Array;
    tidsstempel: "start" | "slut"; tidszone: "UTC" | "Europe/Copenhagen"; enhed: Enhed; kolonne?: string | null;
}
export interface UploadSvar { ok: boolean; tidsserie_id?: string; status?: string; svar: string }

export async function uploadTidsserie(input: UploadInput, bruger: string | undefined): Promise<UploadSvar> {
    const s = await skriv.uploadTidsserie(input.vaerkId, { navn: input.filnavn, bytes: input.bytes },
        { rolle: input.rolle, tidsstempel: input.tidsstempel, tidszone: input.tidszone, enhed: input.enhed, kolonne: input.kolonne ?? null, navn: input.navn }, bruger);
    return { ok: s.ok, status: s.status, svar: s.svar, tidsserie_id: s.tidsserie_id };
}

export async function aktiverTidsserie(vaerkId: string, tidsserieId: string, aktiv: boolean, bruger: string | undefined): Promise<{ ok: boolean; svar: string }> {
    const s = await skriv.aktiverTidsserie(vaerkId, tidsserieId, aktiv, bruger);
    return { ok: s.ok && s.status === "udfoert", svar: s.svar };
}

/** `timeslut`: arkets timedata er stemplet med timens slut (scriptets `--timeslut`). */
export async function uploadVaerksark(filnavn: string, indholdBase64: string, timeslut: boolean, bruger: string | undefined): Promise<{ ok: boolean; import_id?: string; svar: string }> {
    const s = await skriv.uploadVaerksark({ navn: filnavn, base64: indholdBase64 }, bruger, { timeslut });
    return { ok: s.ok, import_id: s.import_id, svar: s.svar };
}
