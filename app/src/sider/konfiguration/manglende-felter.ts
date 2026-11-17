//-----------------------------------------------------------------------
// "Tilføj et felt" (runde 14c): katalogets felter, som værket ikke har,
// men som modellen kender (viden/felt_katalog.json), med katalogets
// forklaring og modellens standardværdi (kataloget, holdt op mod koden af
// tjek_trofasthed.py [4]) som udgangspunkt. Ren logik.
//
// Hvad der IKKE tilbydes, og hvorfor:
//  - et felt under en blok, værket ikke har, når blokkens tilstedeværelse
//    ændrer regningen: cop_curve (overruler alpha, src/config.py:Unit),
//    tarifprofilen (electricity.tariff_consumption erstatter den flade
//    tarif) og nettab — ét felt alene ville slå blokken til med modellens
//    standarder for resten. Enhedens `ancillary` (og dens budvindue) er en
//    dataclass med standarder for hvert felt og må gerne startes af ét felt;
//  - balancing-felter, når værket ingen blok har ("Tilføj balancemarked");
//  - felter med `*` uden for enhedens/lagerets navn (pr. brændsel, pr.
//    marked …): de kræver et navn, kataloget ikke har;
//  - enhedsfelter for typer, kataloget siger de ikke gælder for.
//-----------------------------------------------------------------------

import type { Parameterændring } from "@/lib/data/skriv";
import { kildeMedCommit } from "@/lib/modelspejl";
import { FELTER } from "./katalog.data";
import type { FeltPost } from "./katalog";
import { kladde } from "./redigering";

export interface Kandidat {
    sti: string;
    post: FeltPost;
    /** Enhedens/lagerets navn, når feltet hører til et objekt. */
    objekt: string | null;
    /** Modellens standardværdi som vaerdi_json (katalogets type), eller null, når modellen ikke har nogen. */
    standard_json: string | null;
    /** Hvor standardværdien står i koden: "src/config.py:520 @ 90fb16e". */
    standardKilde: string | null;
}

/** Dele af en sti, hvor ét felt gerne må oprette blokken (dataclass med standard pr. felt). */
const MÅ_STARTE_BLOK = [/^units\.[^.]+\.ancillary$/, /^units\.[^.]+\.ancillary\.bid_window$/];

function standardJson(post: FeltPost): string | null {
    const s = post.standard;
    if (s === undefined || s === null) return null;
    if (Array.isArray(s)) return s.length === 0 ? "[]" : null;   // en liste med tal kan ikke gives sin type tilbage (6.0 -> 6)
    if (typeof s === "object") return null;
    const tekst = typeof s === "boolean" ? (s ? "ja" : "nej") : String(s);
    const k = kladde(post, null, tekst);
    return k.fejl ? null : k.json;
}

/**
 * Felterne, værket mangler, inden for `sektioner` (første led i stien) — eller kun objektet `objekt`
 * (`units`/`storage`-navnet), når det er givet. I katalogets rækkefølge.
 */
export function manglendeFelter(nu: ReadonlyMap<string, string>, sektioner: readonly string[], objekt?: string): Kandidat[] {
    const stier = [...nu.keys()];
    const findes = (præfiks: string) => stier.some((s) => s.startsWith(`${præfiks}.`));
    const objekter = (sektion: string) => [...new Set(stier.filter((s) => s.startsWith(`${sektion}.`)).map((s) => s.split(".")[1]))];
    const typeAf = (navn: string) => { try { return JSON.parse(nu.get(`units.${navn}.type`) ?? "null") as string | null; } catch { return null; } };
    const ud: Kandidat[] = [];
    for (const post of FELTER) {
        if (!post.blad || !sektioner.includes(post.sektion)) continue;
        const dele = post.sti.split(".");
        const stjerner = dele.map((d, i) => (d === "*" ? i : -1)).filter((i) => i >= 0);
        let konkrete: { sti: string; objekt: string | null }[];
        if (stjerner.length === 0) {
            if (objekt) continue;
            konkrete = [{ sti: post.sti, objekt: null }];
        } else if (stjerner.length === 1 && stjerner[0] === 1 && (dele[0] === "units" || dele[0] === "storage")) {
            const navne = objekt ? (objekter(dele[0]).includes(objekt) ? [objekt] : []) : objekter(dele[0]);
            konkrete = navne
                .filter((n) => dele[0] !== "units" || !post.gaelder_for || post.gaelder_for.includes(typeAf(n) ?? ""))
                .map((n) => ({ sti: [dele[0], n, ...dele.slice(2)].join("."), objekt: n }));
        } else continue;
        for (const k of konkrete) {
            if (nu.has(k.sti)) continue;
            const d = k.sti.split(".");
            // Et blad under en værdi, eller over et andet blads blok, kan ikke gemmes (planlægParametre afviser det).
            if (d.some((_, i) => i > 0 && nu.has(d.slice(0, i).join(".")))) continue;
            if (findes(k.sti)) continue;
            if (d[0] === "balancing" && !findes("balancing")) continue;
            const forælder = d.slice(0, -1).join(".");
            const forælderOk = d.length === 2                                   // direkte under sektionen
                || (k.objekt !== null && d.length === 3)                         // direkte på enheden/lageret
                || findes(forælder)                                              // blokken findes allerede
                || (MÅ_STARTE_BLOK.some((r) => r.test(forælder)) && k.objekt !== null);
            if (!forælderOk) continue;
            const standard_json = standardJson(post);
            ud.push({ sti: k.sti, post, objekt: k.objekt, standard_json, standardKilde: standard_json !== null ? kildeMedCommit(post.kilde) : null });
        }
    }
    return ud;
}

/** `opret` for feltet med brugerens tekst (kodet efter katalogets type), eller hvorfor ikke. */
export function tilfoejFelt(k: Kandidat, tekst: string): { ændring?: Parameterændring; fejl?: string } {
    if (!tekst.trim()) return { fejl: "Skriv en værdi." };
    const r = kladde(k.post, null, tekst);
    if (r.fejl || r.json === null || r.json === "null") return { fejl: r.fejl ?? "Skriv en værdi." };
    if (k.post.tilladte && !k.post.tilladte.some((t) => JSON.stringify(t) === r.json)) {
        return { fejl: `Tilladte værdier: ${k.post.tilladte.join(", ")}.` };
    }
    return { ændring: { sti: k.sti, handling: "opret", ny_json: r.json } };
}
