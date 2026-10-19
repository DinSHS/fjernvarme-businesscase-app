//-----------------------------------------------------------------------
// Fagkataloget (fv-eksperts viden/) som opslag: sti -> felt-post, og
// værkets afsnit. Data står i katalog.data.ts (genereret, se _byg/).
//-----------------------------------------------------------------------

import { FELTER, ENHEDSTYPER, BRAENDSELSNAVNE } from "./katalog.data";

export interface FeltPost {
    sti: string;
    sektion: string;
    etiket: string;
    enhed: string | null;
    type: "number" | "integer" | "string" | "enum" | "boolean" | "list" | "object";
    tilladte: readonly (string | number)[] | null;
    min: number | null;
    max: number | null;
    min_eksklusiv?: boolean;
    paakraevet: boolean;
    gaelder_for: readonly string[] | null;
    forklaring: string;
    kilde: string;
    avanceret: boolean;
    laeses_af_koden: boolean;
    blad: boolean;
    kan_saettes_i_scenarie: boolean;
    kan_saettes_med_cli_set: boolean;
    regler?: readonly string[] | null;
    standard?: unknown;
    eksempel?: unknown;
    stjerne?: readonly { navn: string; fra?: string; tilladte?: readonly string[]; format?: string }[];
}

export interface Enhedstype {
    navn: string;
    beskrivelse: string;
    fuel: readonly string[];
    paakraevede: readonly string[];
    valgfri: readonly string[];
    irrelevante: readonly string[];
    kan_byde_balance: boolean;
    noter: readonly string[];
    /** Skabelonen som blade relativt til `units.<navn>.`, med typestreng vaerdi_json. */
    skabelon: readonly { sti: string; vaerdi_json: string }[];
}

export { ENHEDSTYPER };

/** Brændselsnavne på dansk — fra viden/enhedstyper.json → braendselsnavne (fv-ekspert). */
export const BRAENDSEL: Readonly<Record<string, string>> = BRAENDSELSNAVNE;

export const enhedstypeNavn = (type: string | undefined): string =>
    (type && ENHEDSTYPER[type]?.navn) || type || "Ukendt type";

// ------------------------------------------------------------------ opslag

interface Skabelon { post: FeltPost; dele: string[]; stjerner: number; orden: number }

const SKABELONER: Skabelon[] = FELTER.map((post, orden) => {
    const dele = post.sti.split(".");
    return { post, dele, stjerner: dele.filter((d) => d === "*").length, orden };
});

function passer(dele: readonly string[], s: Skabelon): boolean {
    if (dele.length !== s.dele.length) return false;
    return s.dele.every((d, i) => d === "*" || d === dele[i]);
}

const cache = new Map<string, FeltPost | null>();

/**
 * Felt-posten for en konkret sti. Ved flere mulige vinder den mest konkrete
 * (færrest `*`), så `prices.co2_eua.value` slår `prices.*.value`, og
 * `fixed_components.elafgift_net` slår `fixed_components.*`.
 */
export function findFelt(sti: string): FeltPost | null {
    const c = cache.get(sti);
    if (c !== undefined) return c;
    const dele = sti.split(".");
    let bedst: Skabelon | null = null;
    for (const s of SKABELONER) {
        if (!passer(dele, s)) continue;
        if (!bedst || s.stjerner < bedst.stjerner || (s.stjerner === bedst.stjerner && s.post.blad && !bedst.post.blad)) bedst = s;
    }
    const r = bedst?.post ?? null;
    cache.set(sti, r);
    return r;
}

/** Katalog-rækkefølgen for en sti (til sortering inden for et afsnit). Ukendte sidst. */
export function katalogOrden(sti: string): number {
    const p = findFelt(sti);
    return p ? FELTER.indexOf(p) : Number.MAX_SAFE_INTEGER;
}

/** Felterne en enhed kan have (units.*.X, også indlejrede som cop_curve.type) — til at finde ukendte felter. */
export function kendteObjektfelter(sektion: "units" | "storage"): Set<string> {
    const pre = `${sektion}.*.`;
    return new Set(FELTER.filter((f) => f.sti.startsWith(pre)).map((f) => f.sti.slice(pre.length)));
}

/** Skjules bag "Vis alle felter": avancerede og felter modellen ikke læser. */
export function erSkjult(post: FeltPost | null): boolean {
    return !!post && (post.avanceret || !post.laeses_af_koden);
}

// ------------------------------------------------------------------ afsnit

export type AfsnitId = "enheder" | "lagre" | "priser" | "el" | "balancering" | "varmelast" | "tid" | "meta" | "oevrige";

export interface AfsnitDef {
    id: AfsnitId;
    navn: string;
    /** Sektionerne (første led i stien), afsnittet viser. */
    sektioner: readonly string[];
}

/**
 * Værkets afsnit i den rækkefølge en planlægger tænker i (brief 07): først
 * anlægget, så økonomien, så markedet, så last og tid. Felterne inden for et
 * afsnit står i katalogets rækkefølge.
 */
export const AFSNIT: readonly AfsnitDef[] = [
    { id: "enheder", navn: "Enheder", sektioner: ["units"] },
    { id: "lagre", navn: "Lagre", sektioner: ["storage"] },
    { id: "priser", navn: "Priser og afgifter", sektioner: ["prices"] },
    { id: "el", navn: "El og tarif", sektioner: ["electricity", "grid"] },
    { id: "balancering", navn: "Balancering", sektioner: ["balancing", "ancillary_groups"] },
    { id: "varmelast", navn: "Varmelast", sektioner: ["heat_load_params"] },
    { id: "tid", navn: "Tid, data og solver", sektioner: ["time", "data", "solver"] },
    { id: "meta", navn: "Meta", sektioner: ["meta", "investment"] },
    { id: "oevrige", navn: "Øvrige", sektioner: [] },
];

const SEKTION_TIL_AFSNIT = new Map<string, AfsnitId>(AFSNIT.flatMap((a) => a.sektioner.map((s) => [s, a.id] as const)));

export function afsnitFor(sektion: string): AfsnitId {
    return SEKTION_TIL_AFSNIT.get(sektion) ?? "oevrige";
}
