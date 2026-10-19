//-----------------------------------------------------------------------
// Feltlister pr. entitet — hvad der læses, og hvilke felter der er TEKST
// og DATO. Bruges af `normaliser.ts` og `laes.ts`.
//
// Hvorfor tekst/dato skal stå her: Rayfin-klienten "sniffer" værdier i en
// browser (rayfin-data/dist/utils/serialization.js, legacy-gren — aktiv når
// RAYFIN_FEATURE_FLAGS ikke har `cli-minor-fixes`, dvs. ALTID i en browser):
// en tekstværdi på præcis "true"/"false" bliver boolean, og en ISO-dato-formet
// tekst bliver Date. Målt 2026-10-16: `vaerdi_json = "true"` kom tilbage som
// `true`. For at kunne lave det om igen skal vi vide hvilke felter der er tekst.
//
// `felter.spec.ts` krydstjekker listerne mod entitetsfilerne i rayfin/data/,
// så en ny kolonne ikke kan glemmes her.
//-----------------------------------------------------------------------

import type { FjvSchema } from "../../../rayfin/data/schema";

export type Entitet = keyof FjvSchema;

export interface Feltsæt<E extends Entitet> {
    alle: readonly (keyof FjvSchema[E] & string)[];
    /** `@text` og `@set` — værdien SKAL være en streng. */
    tekst: readonly (keyof FjvSchema[E] & string)[];
    /** `@date` — værdien SKAL være en Date (UTC). */
    dato: readonly (keyof FjvSchema[E] & string)[];
    /** `@int`/`@decimal` — værdien SKAL være et tal. */
    tal: readonly (keyof FjvSchema[E] & string)[];
}

function sæt<E extends Entitet>(f: {
    tekst: readonly (keyof FjvSchema[E] & string)[];
    dato?: readonly (keyof FjvSchema[E] & string)[];
    tal?: readonly (keyof FjvSchema[E] & string)[];
    andre?: readonly (keyof FjvSchema[E] & string)[];
}): Feltsæt<E> {
    const dato = f.dato ?? [];
    const tal = f.tal ?? [];
    return { tekst: f.tekst, dato, tal, alle: [...f.tekst, ...dato, ...tal, ...(f.andre ?? [])] };
}

// `andre` = uuid og boolean (uuid er tekst, men sniffes aldrig; holdes adskilt for overblikkets skyld).
export const FELTER = {
    Vaerk: sæt<"Vaerk">({
        tekst: ["kode", "navn", "beskrivelse", "kilde", "kilde_fil", "repo_commit", "oprettet_af", "aendret_af"],
        dato: ["oprettet", "aendret"],
        tal: ["revision"],
        andre: ["id", "kopieret_fra_id", "arkiveret"],
    }),
    VaerkParameter: sæt<"VaerkParameter">({
        tekst: ["sti", "vaerdi_json", "sektion", "objekt", "kommentar", "aendret_af"],
        dato: ["aendret"],
        tal: ["raekkefoelge"],
        andre: ["id", "vaerk_id", "bekraeft"],
    }),
    Aendringslog: sæt<"Aendringslog">({
        tekst: ["sti", "handling", "gammel_json", "ny_json", "aendret_af"],
        dato: ["tidspunkt"],
        tal: ["revision"],
        andre: ["id", "vaerk_id", "anmodning_id"],
    }),
    Aendringsanmodning: sæt<"Aendringsanmodning">({
        tekst: ["aendringer_json", "anmodet_af", "status", "svar"],
        dato: ["anmodet"],
        tal: ["forventet_revision"],
        andre: ["id", "vaerk_id"],
    }),
    Scenarie: sæt<"Scenarie">({
        tekst: ["navn", "beskrivelse", "periode_start", "periode_slut", "balancing_method", "ekstra_flag", "heat_csv", "oprettet_af"],
        dato: ["oprettet"],
        tal: ["mip_rel_gap", "mip_abs_gap", "tidsgraense_s"],
        andre: ["id", "vaerk_id", "reference_scenarie_id", "med_balancering", "arkiveret"],
    }),
    ScenarieAendring: sæt<"ScenarieAendring">({
        tekst: ["type", "sti", "vaerdi_json"],
        tal: ["raekkefoelge"],
        andre: ["id", "scenarie_id"],
    }),
    Bestilling: sæt<"Bestilling">({
        tekst: ["klient_noegle", "bestilt_af"],
        dato: ["bestilt"],
        andre: ["id", "scenarie_id"],
    }),
    Koersel: sæt<"Koersel">({
        tekst: [
            "input_hash", "status", "fase", "bestilt_af", "arbejder_id", "fabric_job_id", "kilde", "model_commit", "data_commit",
            "miljoe_json", "case_sti", "output_sti", "output_stem", "oploesning", "solve_status", "fejlbesked", "manifest_json",
        ],
        dato: ["bestilt", "modtaget", "startet", "afsluttet", "hjerteslag", "annuller_anmodet"],
        tal: [
            "vaerk_revision", "forsoeg", "interval_min", "antal_interval_model", "antal_interval_csv", "objektiv_dkk",
            "oensket_rel_gap", "oensket_abs_gap", "opnaaet_gap", "best_bound", "loesetid_s",
        ],
        andre: ["id", "bestilling_id", "scenarie_id", "vaerk_id", "er_milp"],
    }),
    KoerselInput: sæt<"KoerselInput">({
        tekst: ["sti", "vaerdi_json", "kilde"],
        andre: ["id", "koersel_id"],
    }),
    KoerselNoegletal: sæt<"KoerselNoegletal">({
        tekst: ["gruppe", "objekt", "marked", "noegle", "enhed"],
        tal: ["vaerdi"],
        andre: ["id", "koersel_id"],
    }),
    KoerselMaaned: sæt<"KoerselMaaned">({
        tekst: ["maaned", "objekt", "noegle"],
        tal: ["vaerdi"],
        andre: ["id", "koersel_id"],
    }),
    KoerselTime: sæt<"KoerselTime">({
        tekst: ["vaerdier_json"],
        dato: ["tid"],
        tal: ["varmelast_mw", "spotpris", "t_ude"],
        andre: ["id", "koersel_id"],
    }),
    Motor: sæt<"Motor">({
        tekst: ["model_commit", "data_commit", "sidste_job_id"],
        dato: ["sidste_jobstart", "aendret"],
        andre: ["id"],
    }),
    Tidsserie: sæt<"Tidsserie">({
        tekst: ["rolle", "navn", "filnavn", "sti", "sha256", "oploesning", "enhed", "tidsstempel", "tidszone", "kilde", "status", "validering_json", "uploadet_af"],
        dato: ["start", "slut", "uploadet"],
        tal: ["antal_raekker", "antal_huller"],
        andre: ["id", "vaerk_id", "aktiv"],
    }),
    Vaerksarkimport: sæt<"Vaerksarkimport">({
        tekst: ["filnavn", "sti", "status", "log", "fabric_job_id", "uploadet_af"],
        dato: ["uploadet"],
        andre: ["id", "vaerk_id", "tidsserie_id", "timeslut"],
    }),
} as const satisfies { [E in Entitet]: Feltsæt<E> };
