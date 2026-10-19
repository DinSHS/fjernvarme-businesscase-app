//-----------------------------------------------------------------------
// "Data i denne kørsel" (KONTRAKT §6d sidste punkt; brief 18) — rene
// funktioner, testet i datagrundlag.spec.ts på de rigtige fixtures.
//
// Linjerne, deres etiketter og skabeloner er fv-datas
// (viden/data_krav.json → data_i_koersel, genereret ind i
// datagrundlag.data.ts). Alt udfyldes af Koersel + det FROSNE input — aldrig af
// levende tabeller — med én undtagelse: en tidsseries NAVN slås op på id;
// sha256 er altid det frosne, også hvis rækken siden er ændret eller slettet.
//-----------------------------------------------------------------------

import { effektivtInput, KOERSEL_PRAEFIKS, type InputRække } from "@/lib/data/afflad";
import { tal } from "@/lib/format";
import type { Koersel, Profil } from "./beregn";
import { DATA_LINJER, STANDARD_TEMP } from "./datagrundlag.data";

/** En frosset tidsserie: `_koersel.tidsserie.<rolle>` = `{"id": …, "sha256": …}`. */
export interface FrossenTidsserie { rolle: string; id: string | null; sha256: string | null }

/** Tidsseriernes navne (Tidsserie.navn pr. id), slået op i databasen. */
export type Tidsserienavne = ReadonlyMap<string, string>;

export interface DataLinje {
    etiket: string;
    vaerdi: string;
    /** Den fulde værdi (fx hele SHA'en), når `vaerdi` er forkortet. */
    fuld: string | null;
    fodnote: string | null;
    /** false = datasættet indgik IKKE (fx balancemarkedet uden balancering). */
    med: boolean;
}

const json = (j: string | undefined): unknown => { if (j === undefined) return undefined; try { return JSON.parse(j); } catch { return j; } };

/** Alle frosne tidsserier i inputtet (rolle → id + sha256). */
export function frosneTidsserier(input: readonly InputRække[]): FrossenTidsserie[] {
    const ud: FrossenTidsserie[] = [];
    for (const r of input) {
        const m = new RegExp(`^${KOERSEL_PRAEFIKS.replace(".", "\\.")}tidsserie\\.([a-z_]+)$`).exec(r.sti);
        if (!m) continue;
        const v = json(r.vaerdi_json) as { id?: unknown; sha256?: unknown } | null;
        ud.push({ rolle: m[1], id: typeof v?.id === "string" ? v.id : null, sha256: typeof v?.sha256 === "string" ? v.sha256 : null });
    }
    return ud;
}

/** Opslag i det frosne input: et blad (`data.price_zone`) eller et scenarieflag (`_koersel.med_balancering`). */
function opslag(input: readonly InputRække[]): (sti: string) => unknown {
    const e = effektivtInput(input);
    return (sti) => {
        if (sti.startsWith(KOERSEL_PRAEFIKS)) return json(e.flag.get(sti.slice(KOERSEL_PRAEFIKS.length)));
        return json(e.blade.get(sti)?.vaerdi_json);
    };
}

/** `{navn}`, `{data_commit[:7]}`, `{sha256[:12]}` — manglende værdi = "ukendt". */
export function udfyldSkabelon(t: string, v: Readonly<Record<string, string | number | null | undefined>>): string {
    return t.replace(/\{([^}[\]]+)(?:\[:(\d+)\])?\}/g, (_m, navn: string, n?: string) => {
        const x = v[navn];
        if (x === null || x === undefined || x === "") return "ukendt";
        const s = typeof x === "number" ? tal(x) : String(x);
        return n ? s.slice(0, Number(n)) : s;
    });
}

/** "_koersel.med_balancering = true", "data.price_zone != electricity.spot_area". Ukendt form → sand. */
function betingelse(udtryk: string, slå: (sti: string) => unknown): boolean {
    const m = /^\s*(\S+)\s*(!=|=)\s*(\S+)\s*$/.exec(udtryk);
    if (!m) return true;
    const højre = m[3] === "true" ? true : m[3] === "false" ? false : slå(m[3]);
    const lig = slå(m[1]) === højre;
    return m[2] === "=" ? lig : !lig;
}

/** Alternativet i en skabelon som "a | b | c", valgt efter et nøgleord ("syntetisk", "tidsserie", "repo", "ingen"). */
function alternativ(vaerdi: string, nøgle: string): string {
    return vaerdi.split(" | ").find((x) => x.includes(nøgle)) ?? vaerdi;
}

/** fabric/fjv/tidsserie.py → MARKOER_SOLPROFIL: en enheds profilsti, der peger på værkets solprofil-tidsserie. */
export const MARKOER_SOLPROFIL = "tidsserie:solprofil";

interface Enhed { navn: string; type: string | null; aktiv: boolean; profil: string | null }

/** Værkets enheder efter scenariets ændringer (aktiv = `enabled` ikke false, som byg_case._aktiv). */
function enheder(input: readonly InputRække[]): Enhed[] {
    const e = effektivtInput(input);
    const navne = new Set<string>();
    for (const sti of e.blade.keys()) { const m = /^units\.([^.]+)\./.exec(sti); if (m) navne.add(m[1]); }
    const v = (sti: string) => json(e.blade.get(sti)?.vaerdi_json);
    return [...navne].sort().map((navn) => {
        const p = v(`units.${navn}.production_profile_path`), t = v(`units.${navn}.type`);
        return { navn, type: typeof t === "string" ? t : null, aktiv: v(`units.${navn}.enabled`) !== false, profil: typeof p === "string" && p ? p : null };
    });
}

export type Solprofil =
    | { slags: "tidsserie"; brugere: string[] }
    | { slags: "tidsserie_ubrugt"; grund: string }
    | { slags: "repo"; filer: { enhed: string; sti: string }[] }
    | { slags: "markoer_uden_serie"; enheder: string[] }
    | { slags: "ingen" };

/**
 * Hvem en frosset solprofil faktisk bruges af — præcis motorens regel (fabric/fjv/byg_case.py
 * `_saet_solprofil`, Codex K5-F12): enheder markeret `tidsserie:solprofil` (de aktive af dem), ellers den
 * ENE aktive `solar_thermal`-enhed. Ingen → "bruges ikke" (motoren advarer); flere uden markør → kan ikke
 * placeres (motoren fejler). Uden frosset solprofil: aktive enheders egne repo-filer; markøren er aldrig en fil.
 */
export function solprofil(input: readonly InputRække[]): Solprofil {
    const alle = enheder(input);
    const frossen = frosneTidsserier(input).some((t) => t.rolle === "solprofil");
    const markeret = alle.filter((x) => x.profil === MARKOER_SOLPROFIL);
    if (frossen) {
        if (markeret.length) {
            const aktive = markeret.filter((x) => x.aktiv).map((x) => x.navn);
            return aktive.length ? { slags: "tidsserie", brugere: aktive } : { slags: "tidsserie_ubrugt", grund: "solvarmeenheden er slået fra" };
        }
        const sol = alle.filter((x) => x.type === "solar_thermal" && x.aktiv).map((x) => x.navn);
        if (sol.length === 1) return { slags: "tidsserie", brugere: sol };
        if (sol.length === 0) return { slags: "tidsserie_ubrugt", grund: "værket har ingen aktiv solvarmeenhed" };
        return { slags: "tidsserie_ubrugt", grund: `kan ikke placeres: ${sol.length} aktive solvarmeenheder (${sol.join(", ")})` };
    }
    const aktivMarkeret = markeret.filter((x) => x.aktiv).map((x) => x.navn);
    if (aktivMarkeret.length) return { slags: "markoer_uden_serie", enheder: aktivMarkeret };
    const filer = alle.filter((x) => x.aktiv && x.profil && x.profil !== MARKOER_SOLPROFIL).map((x) => ({ enhed: x.navn, sti: x.profil! }));
    return filer.length ? { slags: "repo", filer } : { slags: "ingen" };
}

const INTERVAL_MIN: Record<string, number> = { "1h": 60, "15min": 15 };

const DK = new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "5.1.2026 kl. 01.00" i dansk tid — bygget af delene, så ICU-versionens tegnsætning ikke slår igennem. */
export function dkTid(d: Date): string {
    const p = Object.fromEntries(DK.formatToParts(d).map((x) => [x.type, x.value]));
    return `${Number(p.day)}.${Number(p.month)}.${p.year} kl. ${p.hour}.${p.minute}`;
}

/**
 * Kørslens fulde datagrundlag som linjer (data_krav.json → data_i_koersel):
 * df-data og model (commit), værk og revision, periode i dansk tid, spot, DMI,
 * balancemarked (med eller "ikke med"), varmelast, solprofil og evt. afvigende priszone.
 */
export function datagrundlag(k: Koersel, vaerkNavn: string, profil: Profil, input: readonly InputRække[], navne: Tidsserienavne = new Map()): DataLinje[] {
    const slå = opslag(input);
    const ts = new Map(frosneTidsserier(input).map((t) => [t.rolle, t]));
    const min = INTERVAL_MIN[profil.oploesning ?? "1h"] ?? 60;
    const start = profil.periode_fra ? dkTid(new Date(profil.periode_fra)) : null;
    const slut = profil.periode_til ? dkTid(new Date(Date.parse(profil.periode_til) + min * 60_000)) : null;
    const str = (x: unknown) => (typeof x === "string" || typeof x === "number" ? String(x) : null);
    const v: Record<string, string | number | null> = {
        data_commit: k.data_commit ?? str(slå(`${KOERSEL_PRAEFIKS}data_commit`)),
        model_commit: k.model_commit ?? str(slå(`${KOERSEL_PRAEFIKS}model_commit`)),
        "vaerk.navn": vaerkNavn, vaerk_revision: k.vaerk_revision ?? null,
        // Arbejderen sætter antal_interval_model; før det (kø, fejl) regnes det af den frosne periode.
        start, slut, antal_interval_model: k.antal_interval_model
            ?? (profil.periode_fra && profil.periode_til ? Math.round((Date.parse(profil.periode_til) - Date.parse(profil.periode_fra)) / (min * 60_000)) + 1 : null),
        "data.price_zone": str(slå("data.price_zone")), "data.dmi_area": str(slå("data.dmi_area")),
        "data.dmi_temp_shortname": str(slå("data.dmi_temp_shortname")) ?? STANDARD_TEMP,
        "electricity.spot_area": str(slå("electricity.spot_area")),
        heat_csv: str(slå(`${KOERSEL_PRAEFIKS}heat_csv`)),
    };
    const fuld = (navn: string) => (typeof v[navn] === "string" ? v[navn] as string : null);
    const tidsserieTekst = (skabelon: string, t: FrossenTidsserie) =>
        udfyldSkabelon(alternativ(skabelon, "tidsserie"), { navn: (t.id && navne.get(t.id)) || "navn ikke fundet", sha256: t.sha256 });

    const ud: DataLinje[] = [];
    for (const l of DATA_LINJER) {
        const linje = (vaerdi: string, ekstra: Partial<DataLinje> = {}) =>
            ud.push({ etiket: l.etiket, vaerdi, fuld: null, fodnote: l.fodnote ? `${l.fodnote.replace(/\s*\(se [^)]*\)/, "").replace(/\.?$/, ".")}` : null, med: true, ...ekstra });
        if (l.kun_hvis && !betingelse(l.kun_hvis, (s) => slå(s))) {
            if (l.ellers) linje(l.ellers, { med: false, fodnote: null });
            continue;
        }
        if (l.etiket === "Varmelast") {
            const t = ts.get("varmelast");
            if (t) linje(tidsserieTekst(l.vaerdi, t), { fuld: t.sha256 });
            else if (v.heat_csv) linje(udfyldSkabelon(alternativ(l.vaerdi, "repo"), v));
            else linje(udfyldSkabelon(alternativ(l.vaerdi, "syntetisk"), v));
            continue;
        }
        if (l.etiket === "Solprofil") {
            const t = ts.get("solprofil");
            const sp = solprofil(input);
            if (t && sp.slags === "tidsserie") linje(`${tidsserieTekst(l.vaerdi, t)} (${sp.brugere.join(", ")})`, { fuld: t.sha256 });
            // Frosset, men ubrugt: står med, så man kan se den, men som "ikke med" (Codex K5-F12).
            else if (t && sp.slags === "tidsserie_ubrugt") linje(`${tidsserieTekst(l.vaerdi, t)} — frosset, men bruges ikke: ${sp.grund}`, { fuld: t.sha256, med: false, fodnote: null });
            else if (sp.slags === "repo") linje(sp.filer.map((x) => `${udfyldSkabelon(alternativ(l.vaerdi, "repo").replace(/\{units\.<sol>\.production_profile_path\}/, "{sti}"), { sti: x.sti })} (${x.enhed})`).join("; "));
            else if (sp.slags === "markoer_uden_serie") linje(`${sp.enheder.join(", ")} er sat til værkets solprofil-tidsserie, men ingen er frosset — motoren afviser kørslen`, { med: false, fodnote: null });
            else linje(alternativ(l.vaerdi, "ingen"));
            continue;
        }
        const vaerdi = udfyldSkabelon(l.vaerdi, v);
        const forkortet = /\{(data_commit|model_commit)\[:\d+\]\}/.exec(l.vaerdi);
        linje(vaerdi, { fuld: forkortet ? fuld(forkortet[1]) : null });
    }
    // Spotprisens fodnote (første kvarter) gælder kun perioder, der rækker ind efter 1. oktober 2025.
    const spot = ud.find((x) => x.etiket === "Spotpris");
    if (spot && profil.periode_til && profil.periode_til < "2025-10-01") spot.fodnote = null;
    return ud;
}

/** Varmelast til kørselslisten: målt (tidsseriens navn / repo-filen) eller syntetisk. */
export function varmelastKilde(input: readonly InputRække[], heatCsv: string | null, navne: Tidsserienavne = new Map()):
    { maalt: boolean; tekst: string; navn: string | null; sha256: string | null } {
    const t = frosneTidsserier(input).find((x) => x.rolle === "varmelast");
    if (t) return { maalt: true, tekst: "Målt", navn: (t.id && navne.get(t.id)) || `tidsserie ${t.sha256?.slice(0, 12) ?? "ukendt"}`, sha256: t.sha256 };
    if (heatCsv) return { maalt: true, tekst: "Målt", navn: heatCsv, sha256: null };
    return { maalt: false, tekst: "Syntetisk", navn: null, sha256: null };
}
