//-----------------------------------------------------------------------
// Fælles fakta om appens tabeller — DELT MELLEM BACKEND OG FRONTEND.
//
// Ingen decorators og ingen import af @microsoft/rayfin-core her: entitets-
// klasserne ved siden af bruger TC39 Stage 3-decorators, som Vite 8 (Oxc) ikke
// kan transformere. Frontenden importerer kun TYPER fra entiteterne (slettes
// ved compile) plus konstanterne herfra. En værdi-import af en entitet lægger
// rå `@entity(` i bundlen — `vite build` lykkes, browseren fejler.
//
// Kilden til felterne er KONTRAKT v2 §3 (udviklingsrapport). Notebooks
// og Functions skriver til de samme tabeller med SQL, så et omdøbt felt her
// bryder dem — ændr kun via en kontraktændring.
//-----------------------------------------------------------------------

/** Hvor et værk kommer fra. `repo` = importeret fra en case-fil i modelrepoet. */
export const VAERK_KILDER = ["repo", "app"] as const;
export type VaerkKilde = (typeof VAERK_KILDER)[number];

/** Handling i ændringsloggen for en værksparameter. */
export const LOG_HANDLINGER = ["opret", "ret", "slet"] as const;
export type LogHandling = (typeof LOG_HANDLINGER)[number];

/** En ændringsanmodnings behandlingsstatus (sættes af Function `udfoerAendring`). */
export const ANMODNING_STATUSSER = ["ny", "udfoert", "afvist"] as const;
export type AnmodningStatus = (typeof ANMODNING_STATUSSER)[number];

/** Hvad en tidsserie er for værket (KONTRAKT §6d). */
export const TIDSSERIE_ROLLER = ["varmelast", "solprofil"] as const;
export type TidsserieRolle = (typeof TIDSSERIE_ROLLER)[number];
/** Står tidsstemplet i KILDEN for timens start eller slut (repoets `--timeslut`)? Den gemte fil er altid "start". */
export const TIDSSTEMPEL_VALG = ["start", "slut"] as const;
export type Tidsstempel = (typeof TIDSSTEMPEL_VALG)[number];
/** Hvorfra en tidsserie kom. `repo` = modelrepoets egen datafil (registreret ved import af casene). */
export const TIDSSERIE_KILDER = ["csv", "vaerksark", "repo"] as const;
export type TidsserieKilde = (typeof TIDSSERIE_KILDER)[number];
export const TIDSSERIE_STATUSSER = ["validerer", "gyldig", "afvist"] as const;
export type TidsserieStatus = (typeof TIDSSERIE_STATUSSER)[number];
/** En værksark-imports gang (notebooken fjv_importer_vaerksark). */
export const IMPORT_STATUSSER = ["koe", "koerer", "faerdig", "fejl"] as const;
export type ImportStatus = (typeof IMPORT_STATUSSER)[number];

/** Balanceringsmetode (`--balancing-method`). */
export const BALANCERINGSMETODER = ["legacy", "activation_value"] as const;
export type Balanceringsmetode = (typeof BALANCERINGSMETODER)[number];

/** Et scenaries "knapper": sæt et blad, slå en enhed/et lager til eller fra. */
export const AENDRINGSTYPER = ["set", "enable", "disable"] as const;
export type Aendringstype = (typeof AENDRINGSTYPER)[number];

/**
 * En kørsels livscyklus (KONTRAKT §6). Kun fremadrettede skift:
 * koe -> startet -> koerer -> indlaeser -> faerdig; fejl fra startet/koerer/indlaeser;
 * annulleret fra koe (eller efter bekræftet jobstop).
 */
export const KOERSEL_STATUSSER = ["koe", "startet", "koerer", "indlaeser", "faerdig", "fejl", "annulleret"] as const;
export type KoerselStatus = (typeof KOERSEL_STATUSSER)[number];

/** Statusser hvor kørslen stadig kan ændre sig — kun dem polles (KONTRAKT §6). */
export const AKTIVE_STATUSSER: ReadonlySet<KoerselStatus> = new Set(["koe", "startet", "koerer", "indlaeser"]);

/** Hvem der startede kørslen. `notebook` = kørt i hånden i Fabric. */
export const KOERSEL_KILDER = ["app", "notebook"] as const;
export type KoerselKilde = (typeof KOERSEL_KILDER)[number];

/** Hvor en frosset inputværdi kom fra (KONTRAKT §3.7). */
export const INPUT_KILDER = ["vaerk", "aendring", "scenarie"] as const;
export type InputKilde = (typeof INPUT_KILDER)[number];

/**
 * Maksimale feltlængder — bruges både i entiteternes `@text({ max })` og i
 * frontendens `maxLength`, så de ikke kan komme ud af sync.
 *
 * `max` SKAL sættes på alle tekstfelter: uden bliver kolonnen NVARCHAR(MAX),
 * og DAB kan så ikke bygge sit GraphQL-skema — deployet lykkes, appen fejler
 * ved kørsel. `entiteter.spec.ts` håndhæver det. 4000 er SQL Servers loft for
 * en NVARCHAR der ikke er MAX.
 */
export const MAKS = {
    kode: 60,
    navn: 200,
    beskrivelse: 4000,
    kilde_fil: 300,
    commit: 40,
    heat_csv: 300,
    bruger: 200,
    sti: 400,
    json: 4000,
    sektion: 60,
    objekt: 120,
    marked: 20,
    kommentar: 2000,
    svar: 2000,
    periode: 20,
    ekstra_flag: 300,
    klient_noegle: 60,
    hash: 64,
    fase: 200,
    arbejder_id: 100,
    fabric_job_id: 100,
    lakehouse_sti: 400,
    oploesning: 10,
    solve_status: 60,
    fejlbesked: 4000,
    gruppe: 60,
    noegle: 120,
    enhed: 40,
    maaned: 7,
    filnavn: 300,
    tidsserie_enhed: 20,
    tidszone: 40,
    validering: 4000,
    importlog: 4000,
} as const;

/** Det faste id på Motor-tabellens ene række (KONTRAKT §6c). */
export const MOTOR_ID = "00000000-0000-4000-8000-00000000f001";

/** Værkskode: små bogstaver, cifre og understreg (KONTRAKT §3.1). */
export const KODE_MOENSTER = /^[a-z0-9_]+$/;

/**
 * Værkskoder, som appen selv bruger som rute (`#/konfiguration/nyt` er oprettelsesguiden) og derfor ikke kan
 * gives et værk (K4-F9). Backend afviser dem ved oprettelse og kopi; SKAL være lig RESERVEREDE_KODER i
 * rayfin/functions/src/logik.ts (test håndhæver det). UI importerer listen herfra.
 */
export const RESERVEREDE_KODER: readonly string[] = ["nyt"];

/**
 * Filgrænser for uploads (KONTRAKT §6d), ÉN definition for side, skrivehjælper og Function (K5-F13). Et Function-kald
 * tager højst 4 MB i alt, og filen sendes som base64 (×4/3) — derfor ikke data_krav.json's 8 MB. SKAL være lig
 * MAKS_UPLOAD_BYTES/MAKS_VAERKSARK_BYTES i rayfin/functions/src (test håndhæver det).
 */
export const MAKS_TIDSSERIE_BYTES = 2_900_000;
export const MAKS_VAERKSARK_BYTES = 2_500_000;

/** Grænser håndhævet i Function `startBestilling` (KONTRAKT §3.0). UI viser dem kun. */
export const GRAENSER = {
    ventendePrBruger: 3,
    maksPeriodeDoegn: 366,
    maksTidsgraenseS: 3600,
} as const;

/** Hvidliste for `Scenarie.ekstra_flag` (KONTRAKT §3.4). */
export const TILLADTE_FLAG = ["--legacy-nettab"] as const;

/**
 * Decimalpræcision (Rayfin `@decimal`, loft 28 pga. .NET decimal i DAB).
 * Kontrakten siger "number"; Rayfin har ingen float, så hver talkolonne er
 * enten `@int` eller `@decimal` med en præcision der rummer værdiens område.
 */
export const DECIMAL = {
    /** Nøgletal og månedsværdier: DKK, MWh, GWh, kr/MWh, andele. 18 heltalscifre, 10 decimaler. */
    vaerdi: { precision: 28, scale: 10 },
    /** Beløb i DKK (objektiv, best bound, absolut gab) — kan være negative. */
    dkk: { precision: 28, scale: 4 },
    /** Relativt MIP-gab (fx 0.0002). */
    gab: { precision: 18, scale: 10 },
    /** Sekunder med ms. */
    sekunder: { precision: 18, scale: 3 },
    /** Intervalværdier: MW, kr/MWh, °C. */
    time: { precision: 18, scale: 6 },
} as const;
