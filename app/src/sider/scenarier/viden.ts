//-----------------------------------------------------------------------
// Typer for fagstoffet fra fv-ekspert (viden/knapper.json, viden/felt_katalog.json).
// Selve dataene står i viden.data.ts (genereret af _byg/byg_viden.py).
//-----------------------------------------------------------------------

export interface Regel { regel: string; kilde: string }

export interface FastVindue { navn: string; periode_start: string; periode_slut: string; note: string; kilde: string }

/** Et valg brugeren skal træffe for en knap (fx hvilken enhed). */
export interface KnapValg {
    pladsholder: string;
    /** `units`/`storage`/`prices` = navne fra værket; `modelrepo data/` = filer. */
    fra?: string;
    /** `enabled = true` / `enabled = false`. */
    filter?: string;
    tilladte?: string[];
}

export interface KnapAendring {
    type: "set" | "enable" | "disable";
    sti: string;
    vaerdi_json?: string;
    gentag_for?: string;
    kun_hvis_stien_findes?: boolean;
}

export interface KnapSide {
    med_balancering?: boolean;
    balancing_method?: "legacy" | "activation_value";
    ekstra_flag?: string;
    heat_csv?: string | null;
    note?: string;
    aendringer: KnapAendring[];
}

export interface Knap {
    id: string;
    spoergsmaal: string;
    gruppe: string;
    forklaring: string;
    valg: KnapValg[];
    reference: KnapSide;
    scenarie: KnapSide;
    kraever_stier: string[];
    tilgaengelig_i: string[];
    advarsler?: string[];
    /** Fagtekst når knappen ikke kan bruges i et værk (fv-ekspert); den rå sti står i tooltip. */
    utilgaengelig_tekst?: string;
    noter?: string[];
    sweep?: { sti: string; eksempel_vaerdier: number[]; kilde: string };
    kilde: string;
}

export interface Feltpost {
    sti: string;
    sektion: string;
    etiket: string;
    enhed: string | null;
    type: string | null;
    tilladte: unknown[] | null;
    min: number | null;
    max: number | null;
    forklaring: string | null;
    avanceret: boolean | null;
    kan_saettes_i_scenarie: boolean | null;
}
