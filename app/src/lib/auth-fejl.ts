//-----------------------------------------------------------------------
// Oversætter sessionsfejl til noget en bruger kan handle på.
//
// Rayfins egne beskeder peger det forkerte sted hen. »Authentication failed
// after token refresh« kastes fra en catch-blok der dækker BÅDE fornyelsen og
// genforsøget (`ApiClient.js:245`), så den oprindelige årsag er væk — og
// beskeden lyder som et rettighedsproblem, hvilket det aldrig er. Manglende
// rettigheder giver 403 eller en DAB-policy-fejl; 401 handler om HVEM man er,
// ikke hvad man må. En workspace-administrator ser præcis samme fejl.
//
// Fornyelsen i `session-fornyelse.ts` klarer det normale tilfælde tavst.
// Kommer fejlen alligevel igennem, er sessionen ikke til at genskabe fra
// appen — typisk fordi portalfanen har mistet sin egen login, eller fordi
// forælderen ikke svarede på postMessage-handoff'en.
//
// ⚠️ Restusikkerhed vi ikke kan fjerne udefra: ApiClients catch dækker også
// GENFORSØGET. Fejler det af en helt anden grund (DAB-fejl, timeout) EFTER en
// lykket fornyelse, får vi stadig ordlyden om authentication — og så viser vi
// »sessionen udløb« for noget der ikke er det. Alternativet (at lade Rayfins
// egen besked stå) er forkert i det almindelige tilfælde i stedet for i det
// sjældne, så afvejningen er bevidst.
//-----------------------------------------------------------------------

/**
 * Mønstre der entydigt betyder »sessionen holder ikke længere«.
 *
 * Der matches på tekst OG på `status`, fordi fejlen kan komme fra tre lag med
 * hver sin type: `NetworkError` (ApiClient), `AuthError` (Auth/AuthApi) og en
 * almindelig `Error` fra vores egen fornyelse.
 */
const SESSIONS_MØNSTRE = [
    /authentication failed after token refresh/i,
    /authentication required/i,
    /session expired/i,
    /session_expired/i,
    /no_refresh_token/i,
    /no refresh token/i,
    /invalid_grant/i,
    /blev ikke etableret nogen session/i,
    // Kun ApiClient/AuthApi's egne 401-formater. Et bart `401` ville også ramme
    // en serverbesked der tilfældigvis citerer værdien »401« fra en række.
    /http error 401\b/i,
    /\b401 unauthorized\b/i,
];

/** True hvis fejlen skyldes en udløbet/afvist session — ikke manglende rettigheder. */
export function erSessionsFejl(fejl: unknown): boolean {
    if (!fejl) return false;

    // `NetworkError.status` er `number | undefined`. Der duck-types frem for
    // `instanceof`, fordi fejlen kan være pakket om undervejs (AuthApi.mapError
    // laver NetworkError → AuthError) og fordi et `instanceof` mod SDK'ens
    // klasse brækker hvis pakken nogensinde bliver duplikeret i node_modules.
    if ((fejl as { status?: unknown }).status === 401) return true;

    const besked = fejl instanceof Error ? fejl.message : String(fejl);
    return SESSIONS_MØNSTRE.some((m) => m.test(besked));
}

/**
 * Beskeden brugeren får når fornyelsen ikke lykkedes.
 *
 * Genindlæsning er den eneste vej videre, og den KOSTER de indtastninger der
 * ikke er gemt — det skal stå der, ellers trykker brugeren F5 og mister
 * arbejde uden varsel. Gemte rækker er upåvirkede: de ligger i databasen.
 */
export const SESSIONS_FEJL_BESKED =
    "Din Fabric-session er udløbet, og appen kunne ikke fornye den automatisk.\n\n" +
    "Genindlæs appen i Fabric-portalen (F5) og log ind igen hvis du bliver spurgt. " +
    "Det er ikke et rettighedsproblem — manglende adgang ville give en anden fejl.\n\n" +
    "Bemærk: felter du har udfyldt uden at gemme, forsvinder ved genindlæsning. " +
    "Skriv dem ned først. Alt der står som »Gemt«, ligger i databasen og er ikke i fare.";
