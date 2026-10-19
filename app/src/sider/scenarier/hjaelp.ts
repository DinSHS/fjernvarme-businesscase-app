//-----------------------------------------------------------------------
// Hjælpere kun scenarierne bruger: værkets blade som opslag, katalogets
// etiket for en sti, værkets rodkode og danske tal i inputfelter.
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { useTidsserier, useVaerkParametre } from "@/lib/data/hooks";
import type { Vaerk } from "../../../rayfin/data/Vaerk";
import type { Blade } from "./logik";
import type { TidsserieInfo } from "./varmelast";
import type { Feltpost } from "./viden";
import { FELTER, VISNINGSNAVNE } from "./viden.data";
import { tal } from "@/lib/format";

/** Værkets blade som opslag sti -> vaerdi_json (undefined mens de hentes). */
export function useBlade(vaerkId: string | undefined) {
    const h = useVaerkParametre(vaerkId);
    const blade = useMemo<Blade | undefined>(() => (h.data ? new Map(h.data.map((p) => [p.sti, p.vaerdi_json])) : undefined), [h.data]);
    return { ...h, blade };
}

/** Værkets oprindelige repo-kode (følger kopieret_fra_id), så en kopi af Billund regnes som Billund. */
export function rodKode(v: Pick<Vaerk, "id" | "kode" | "kopieret_fra_id"> | undefined, alle: readonly Pick<Vaerk, "id" | "kode" | "kopieret_fra_id">[] | undefined): string {
    let x = v;
    for (let i = 0; i < 10 && x?.kopieret_fra_id; i++) {
        const forælder = alle?.find((a) => a.id === x!.kopieret_fra_id);
        if (!forælder) break;
        x = forælder;
    }
    return x?.kode ?? "";
}

// ------------------------------------------------------------------ katalog

const SKABELONER: readonly { re: RegExp; post: Feltpost; stjerner: number }[] = FELTER
    .filter((f) => f.sti)
    .map((f) => ({
        re: new RegExp(`^${f.sti.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^.]+")}$`),
        post: f,
        stjerner: (f.sti.match(/\*/g) ?? []).length,
    }))
    .sort((a, b) => a.stjerner - b.stjerner);

/** Katalogposten for en konkret sti (den mest præcise skabelon). */
export function katalogpost(sti: string): Feltpost | undefined {
    return SKABELONER.find((s) => s.re.test(sti))?.post;
}

/** "halmkedel · Maks. varmeeffekt" — objektets navn foran katalogets etiket. */
export function stiEtiket(sti: string): string {
    const post = katalogpost(sti);
    const dele = sti.split(".");
    const navn = dele[0] === "prices" ? VISNINGSNAVNE.braendsel?.[dele[1]] ?? dele[1] : dele[1];
    const objekt = ["units", "storage", "prices"].includes(dele[0]) && dele.length > 2 ? `${navn} · ` : "";
    return post ? `${objekt}${post.etiket}` : sti;
}

export function enhedAf(sti: string): string | undefined {
    return katalogpost(sti)?.enhed ?? undefined;
}

/**
 * Stier et scenarie kan sætte med "vælg felt": findes i værket, katalogets
 * kan_saettes_i_scenarie er ikke false, og stien har ikke sin egen kontrol
 * (til/fra, periode, solver-felter, meta).
 */
export function sætbareStier(blade: Blade): string[] {
    return [...blade.keys()].filter((sti) => {
        if (/^(meta|time|solver)\./.test(sti)) return false;
        if (/^(units|storage)\.[^.]+\.enabled$/.test(sti)) return false;
        const post = katalogpost(sti);
        return post?.kan_saettes_i_scenarie !== false;
    });
}

/** Dansk decimaltal fra et inputfelt; tom = null; ugyldigt = NaN. */
export function læsTal(s: string): number | null {
    const t = s.trim().replace(/\s/g, "").replace(",", ".");
    if (!t) return null;
    return /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) ? Number(t) : NaN;
}

/** Tal til et inputfelt med dansk komma (ingen tusindtalsadskiller, så det kan læses igen). */
export function talTilFelt(v: number | null | undefined): string {
    return v == null ? "" : String(v).replace(".", ",");
}

/** Relativt gab som procent: 0.0002 -> "0,02 %". */
export function gabProcent(v: number): string {
    return `${(v * 100).toLocaleString("da-DK", { maximumFractionDigits: 4 })} %`;
}

/** Et tal fra en JSON-værdi som dansk heltal med enhed: "1000.0" -> "1.000 kr.". */
export function tekstTal(json: string | undefined, enhed: string): string {
    const n = json === undefined ? NaN : Number(json);
    return Number.isFinite(n) ? `${tal(n)} ${enhed}` : "–";
}

/**
 * Værkets tidsserier (KONTRAKT §6d) — alle roller og statusser; varmelast.ts filtrerer selv.
 * ENESTE sted scenarierne læser dem (fundamentets `useTidsserier`).
 */
export function useVaerketsTidsserier(vaerkId: string | undefined): { data: TidsserieInfo[] | undefined; fejl: Error | undefined } {
    const h = useTidsserier(vaerkId);
    return { data: h.data, fejl: h.fejl };
}
