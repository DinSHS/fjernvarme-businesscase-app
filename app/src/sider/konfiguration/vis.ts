//-----------------------------------------------------------------------
// Visning af værdier i området (dansk talformat, enheder). Ren logik.
//-----------------------------------------------------------------------

import { visVaerdi, værditype } from "@/lib/data/vaerdi";
import { parseJV, type JV } from "./jsontekst";

const nf = (d: number) => new Intl.NumberFormat("da-DK", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Tal med fast antal decimaler og tusindtalsseparator: 1234.5 -> "1.234,5". */
export function dk(v: number | null | undefined, d = 1): string {
    return v === null || v === undefined || !Number.isFinite(v) ? "–" : nf(d).format(v);
}

/** Tal med de decimaler det har brug for (højst `maks`): 12 -> "12", 0.96 -> "0,96". */
export function dkFri(v: number | null | undefined, maks = 3): string {
    return v === null || v === undefined || !Number.isFinite(v) ? "–" : new Intl.NumberFormat("da-DK", { maximumFractionDigits: maks }).format(v);
}

/** Andel som procent: 0.001 -> "0,1 %". */
export function pctTekst(v: number | null | undefined, d = 1): string {
    return v === null || v === undefined ? "–" : `${dk(v * 100, d)} %`;
}

function jvKort(v: JV): string {
    switch (v.t) {
        case "tal": return visVaerdi(v.raw);
        case "tekst": return v.v;
        case "bool": return v.v ? "Ja" : "Nej";
        case "null": return "(tom)";
        case "liste": return v.v.map(jvKort).join(" · ");
        case "objekt": return v.v.map(([k, x]) => `${k} ${jvKort(x)}`).join(", ");
    }
}

/** En gemt værdi til en tabelcelle: tal med dansk komma (decimaler som gemt), lister kort. */
export function visFelt(json: string | null | undefined): string {
    if (json == null) return "–";
    // fv-fabric2's markør i units.<sol>.production_profile_path for et værk, hvis solprofil er en tidsserie (KONTRAKT §6d).
    if (json.trim() === '"tidsserie:solprofil"') return "Værkets solprofil (tidsserie — se fanen Tidsserier)";
    const t = værditype(json);
    if (t === "liste") {
        try {
            const v = parseJV(json);
            if (v.t === "liste" && v.v.length && v.v.every((x) => x.t === "objekt")) return `${v.v.length} punkter`;
            return v.t === "liste" && v.v.length === 0 ? "(tom liste)" : jvKort(v);
        } catch { return json; }
    }
    if (t === "objekt") return json === "{}" ? "(tom blok)" : json;
    return visVaerdi(json);
}

/** Teksten et inputfelt starter med (det brugeren ville skrive). */
export function redigerbarTekst(json: string | null | undefined): string {
    if (json == null) return "";
    const t = værditype(json);
    if (t === "tom") return "";
    if (t === "tekst") { try { return String(JSON.parse(json)); } catch { return json; } }
    if (t === "heltal" || t === "decimaltal") return visVaerdi(json);
    if (t === "sand/falsk") return json.trim() === "true" ? "ja" : "nej";
    return json;
}
