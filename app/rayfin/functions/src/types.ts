/**
 * Function schema types for RayfinClient.
 *
 * AUTO-GENERATED — do not edit manually.
 * Re-generated automatically when function source files change.
 *
 * If this file is not updating automatically, run:
 *   rayfin dev functions apply
 *
 * The schema is a closed object type: only the function names listed
 * below are accepted by RayfinClient.functions.<name>.invoke(...).
 * Adding, renaming, or changing the signature of a udf.func() call
 * regenerates this file and surfaces type errors at every consumer.
 *
 * IMPORTANT: This file must NOT import any Node.js packages — it is
 * resolved by the frontend app's TypeScript compiler.
 */

export type AppFunctionsSchema = {
  startBestilling: {
    input: { bestillingId: string };
    output: { ok: boolean; koersel_id?: undefined | string; status?: undefined | string; ny?: undefined | false | true; afvist?: undefined | string; arbejder?: undefined | { startet: boolean; fabric_job_id?: undefined | string; grund: string } };
  };
  udfoerAendring: {
    input: { anmodningId: string };
    output: { ok: boolean; status: string; svar: string; vaerk_id?: undefined | string; revision?: undefined | number };
  };
  afstem: {
    input: Record<string, never>;
    output: { tjekket: number; aendret: string[]; arbejder: { startet: boolean; fabric_job_id?: undefined | string; grund: string } };
  };
  annullerKoersel: {
    input: { koerselId: string };
    output: { ok: boolean; status: string; besked: string };
  };
  hentKildeYaml: {
    input: { vaerkId: string };
    output: { ok: boolean; kode?: undefined | string; tekst?: undefined | string; bytes?: undefined | number; fejl?: undefined | string };
  };
  uploadTidsserie: {
    input: { anmodningId: string; indholdBase64: string };
    output: { ok: boolean; status: string; svar: string; tidsserie_id?: undefined | string; import_id?: undefined | string; validering_json?: undefined | string };
  };
  hentTidsserie: {
    input: { tidsserieId: string; fra: string; til: string };
    output: { ok: boolean; fejl?: undefined | string; positioner?: undefined | number; id?: undefined | string; navn?: undefined | string; rolle?: undefined | string; start?: undefined | string; oploesning?: undefined | string; enhed?: undefined | string; vaerdier?: undefined | (null | number)[] };
  };
  uploadVaerksark: {
    input: { anmodningId: string; indholdBase64: string };
    output: { ok: boolean; status: string; svar: string; tidsserie_id?: undefined | string; import_id?: undefined | string; validering_json?: undefined | string };
  };
  hentDmiTemperatur: {
    input: { omraade: string; fra: string; til: string; kolonne: string };
    output: { ok: boolean; fejl?: undefined | string; data_commit?: undefined | string; kolonne?: undefined | string; tider?: undefined | string[]; vaerdier?: undefined | (null | number)[] };
  };
  skemaInfo: {
    input: Record<string, never>;
    output: { login: string; kolonner: { tabel: string; kolonne: string; type: string; laengde: null | number; praecision: null | number; skala: null | number; nullable: boolean }[]; unikke: string[]; checks: string[] };
  };
};
