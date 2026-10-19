//-----------------------------------------------------------------------
// Koersel — én kørsel af et scenarie (KONTRAKT §3.6, §6).
//
// Klienten må KUN læse. Rækken oprettes af `startBestilling` (status `koe`)
// sammen med KoerselInput; notebook-arbejderen overtager den atomisk
// (betinget UPDATE på status + arbejder_id), sætter `hjerteslag` hvert
// minut, og publicerer til sidst. Alle statusskift er kun fremadrettede.
//
// `bestilling_id` er unik: én bestilling giver højst én kørsel, uanset hvor
// mange gange startBestilling kaldes (idempotens).
//
// SQL-tabel: "Koersels". Omdøb ikke klassen.
// ⚠️ Må KUN importeres med `import type` fra src/ — se fjv.constants.ts.
//-----------------------------------------------------------------------

import { entity, authenticated, uuid, text, set, date, boolean, int, decimal } from '@microsoft/rayfin-core';
import {
    DECIMAL, KOERSEL_KILDER, KOERSEL_STATUSSER, MAKS,
    type KoerselKilde, type KoerselStatus,
} from './fjv.constants.js';

@entity()
// Klienten må KUN læse (KONTRAKT §3.0).
@authenticated('read')
export class Koersel {
    @uuid() id!: string;

    @uuid({ unique: true }) bestilling_id!: string;

    @uuid() scenarie_id!: string;

    /** Denormaliseret for hurtig liste. */
    @uuid() vaerk_id!: string;

    /** Værkets revision der blev frosset i KoerselInput. */
    @int() vaerk_revision!: number;

    /** sha256 (hex) over KoerselInput, sorteret, kompakt JSON. */
    @text({ min: 64, max: MAKS.hash }) input_hash!: string;

    @set(...KOERSEL_STATUSSER) status!: KoerselStatus;

    /** Fremdrift i ord: "Henter df-data", "Løser MILP", "Skriver resultater". */
    @text({ max: MAKS.fase, optional: true }) fase?: string;

    @text({ min: 1, max: MAKS.bruger }) bestilt_af!: string;

    /** Klientens tidspunkt fra Bestilling — KUN diagnostik (K2-F9). */
    @date() bestilt!: Date;

    /**
     * Serverens modtagelsestid (SYSUTCDATETIME() i startBestilling) = køens sorteringsnøgle (KONTRAKT §6c).
     * Optional, fordi rækker fra før v2.2 og notebookens manuelle vej kan mangle den; sortér på
     * COALESCE(modtaget, bestilt), id.
     */
    @date({ optional: true }) modtaget?: Date;

    @date({ optional: true }) startet?: Date;

    @date({ optional: true }) afsluttet?: Date;

    /** Sættes af arbejderen hvert minut, også mens HiGHS løser. */
    @date({ optional: true }) hjerteslag?: Date;

    /**
     * Sat af `annullerKoersel` for en aktiv kørsel: jobstop er bedt om, men
     * `annulleret` sættes først når jobs-API'et bekræfter det (KONTRAKT §6).
     * Arbejderen må ikke overtage en kørsel med dette felt sat.
     */
    @date({ optional: true }) annuller_anmodet?: Date;

    /** Antal startforsøg. */
    @int() forsoeg!: number;

    @text({ max: MAKS.arbejder_id, optional: true }) arbejder_id?: string;

    /** UDGÅET med §6c (job-id står på Motor.sidste_job_id). Skrives ikke længere; ældre rækker kan have en værdi. */
    @text({ max: MAKS.fabric_job_id, optional: true }) fabric_job_id?: string;

    @set(...KOERSEL_KILDER) kilde!: KoerselKilde;

    /** FULDE SHA'er fra download — ikke manifestets korte. */
    @text({ max: MAKS.commit, optional: true }) model_commit?: string;

    @text({ max: MAKS.commit, optional: true }) data_commit?: string;

    /** python-version, solverpakker, wrapper-version. */
    @text({ max: MAKS.json, optional: true }) miljoe_json?: string;

    @text({ max: MAKS.lakehouse_sti, optional: true }) case_sti?: string;

    @text({ max: MAKS.lakehouse_sti, optional: true }) output_sti?: string;

    @text({ max: MAKS.lakehouse_sti, optional: true }) output_stem?: string;

    /** `1h` / `15min`. Kendes først sikkert når arbejderen har bygget casen. */
    @text({ max: MAKS.oploesning, optional: true }) oploesning?: string;

    @int({ optional: true }) interval_min?: number;

    /** N — alle modelintervaller inkl. t=0. */
    @int({ optional: true }) antal_interval_model?: number;

    /** N-1 — rækker i `_hourly.csv`. */
    @int({ optional: true }) antal_interval_csv?: number;

    @text({ max: MAKS.solve_status, optional: true }) solve_status?: string;

    @boolean({ optional: true }) er_milp?: boolean;

    /** Præcist fra `.nc`, ikke manifestets afrundede tal. */
    @decimal({ ...DECIMAL.dkk, optional: true }) objektiv_dkk?: number;

    @decimal({ ...DECIMAL.gab, optional: true }) oensket_rel_gap?: number;

    @decimal({ ...DECIMAL.dkk, optional: true }) oensket_abs_gap?: number;

    /** Parset fra HiGHS-loggen; tom ved tvivl (forklaring i fase/fejlbesked). */
    @decimal({ ...DECIMAL.gab, optional: true }) opnaaet_gap?: number;

    @decimal({ ...DECIMAL.dkk, optional: true }) best_bound?: number;

    @decimal({ ...DECIMAL.sekunder, optional: true }) loesetid_s?: number;

    /** Læsbar fejl (CoverageError, infeasible-forklaring …). */
    @text({ max: MAKS.fejlbesked, optional: true }) fejlbesked?: string;

    /** Fast udvalg: schema_version, periode, kilde, metode, aktive enheder. */
    @text({ max: MAKS.json, optional: true }) manifest_json?: string;
}
