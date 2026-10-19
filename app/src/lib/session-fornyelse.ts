//-----------------------------------------------------------------------
// Fornyelse af Fabric-sessionen når adgangstokenet er udløbet.
//
// **Hvorfor dette findes.** Rayfin-SDK'ens egen 401-håndtering kan ikke
// klare den indlejrede Fabric-flow. `Auth.attachToClient` sætter denne
// callback på ApiClient:
//
//     client.setRefreshCallback(async () => {
//         if (this.hasRefreshToken()) { await this.refreshSession(); }
//     });
//
// Findes der ingen refresh-token, lykkes callbacken UDEN at gøre noget.
// ApiClient prøver derefter kaldet igen med præcis det samme døde token, får
// 401 igen, og relabeler fejlen til »Authentication failed after token
// refresh« (`ApiClient.js:245`) — en besked hvis catch-blok dækker både
// fornyelsen OG genforsøget, så den oprindelige årsag kastes væk.
//
// Appen hentede sin session ÉN gang ved mount og fornyede den aldrig. Når
// `scheduleSessionExpiration` løb af, kaldte den `clearInternalSession()`, og
// derfra var hvert databasekald dødt indtil brugeren gik F5 i portalen.
//
// Vejen ud er den indlejrede postMessage-handoff: forælderen (Fabric-portalen)
// er stadig logget ind, og `embeddedFabricLogin` kan hente et nyt token uden
// popup og uden brugerhandling. Denne fil holder BESLUTNINGEN om hvornår det
// må ske — porte til SDK'et injiceres, så reglerne kan unit-testes uden
// netværk, uden iframe og uden ur.
//
// ⚠️ To samtidige handoffs ØDELÆGGER hinanden. `embeddedFabricLogin` starter
// med `auth.signOut()`, som *tilbagekalder tokenet server-side*. Kører to
// fornyelser oven i hinanden, river den anden det token ned den første netop
// hentede. Derfor er både sammenfletningen (ét kald ad gangen) og karantænen
// (ingen ny handoff lige efter en lykket) korrektheds­krav — ikke optimering.
//-----------------------------------------------------------------------

/**
 * Efter en lykket fornyelse afvises nye fornyelsesforsøg så længe.
 *
 * Uden den: to kald 401'er samtidig, kald A fornyer, og kald B's 401 — der var
 * undervejs FØR fornyelsen — udløser handoff nummer to, som tilbagekalder A's
 * friske token. Næste kald 401'er så igen, og appen tøffer rundt i en løkke af
 * handoffs der slår hinanden ihjel. B's genforsøg bruger `getAccessToken()` og
 * læser derfor det nye token af sig selv; der er intet at forny.
 *
 * 10 s er rundt regnet en handoff-runde (postMessage + token-udveksling) gange
 * tre, og langt under enhver tokenlevetid, så et ægte udløb aldrig rammer den.
 */
export const FORNYELSE_KARANTÆNE_MS = 10_000;

/** Portene ind til SDK'et. Injiceres, så reglerne herunder kan testes isoleret. */
export interface Fornyelsesporte {
    /**
     * Har appen nogensinde haft en gyldig session? Falsk betyder at vi ikke
     * kører indlejret i Fabric-portalen (den eneste vej til en session), og så
     * er der ingen forælder at lave handoff med — `requestHandoff` ville blot
     * vente sine 30 s ud og kaste.
     */
    harHaftSession: () => boolean;
    /** `auth.hasRefreshToken()` */
    harRefreshToken: () => boolean;
    /** `auth.refreshSession()` — billig vej, ét HTTP-kald, ingen postMessage. */
    fornyMedRefreshToken: () => Promise<void>;
    /** `embeddedFabricLogin(auth, options)` — fuld handoff mod forælderen. */
    handoff: () => Promise<void>;
    /** `auth.getSession().isAuthenticated` — læses EFTER handoff. */
    erAutentificeret: () => boolean;
    /** Injiceret tid. `Date.now` i produktion. */
    nu: () => number;
}

/**
 * Bygger den funktion der skal sidde som ApiClients `setRefreshCallback`.
 *
 * Kontrakt: resolver når der (formentlig) findes et brugbart token igen,
 * kaster hvis sessionen ikke kunne genskabes. ApiClient prøver kaldet igen
 * præcis én gang bagefter og henter tokenet forfra, så en resolve er nok —
 * vi behøver ikke give det videre.
 */
export function opretSessionsfornyer(porte: Fornyelsesporte): () => Promise<void> {
    let igangværende: Promise<void> | null = null;
    let senesteSucces = 0;
    let iHandoff = false;

    async function udfør(): Promise<void> {
        // Billigste vej først. Bemærk at SDK'en gjorde KUN dette — og faldt
        // tavst igennem når der ikke var noget refresh-token. Det er hele
        // fejlen vi retter her.
        if (porte.harRefreshToken()) {
            try {
                await porte.fornyMedRefreshToken();
                senesteSucces = porte.nu();
                return;
            } catch (fejl) {
                // Refresh-tokenet kan være tilbagekaldt eller udløbet
                // (`INVALID_GRANT` → SDK'en har netop ryddet sessionen).
                // Handoff'en kan stadig lykkes, så det er ikke enden.
                console.debug("[Auth] refreshSession fejlede — falder tilbage på Fabric-handoff", fejl);
            }
        }

        // Rekursionsspærren SKAL sættes før handoff'en: dens egen
        // `exchangeVerificationCode` går gennem SAMME ApiClient, og den sætter
        // ikke `skipRetryOn401`. Svarer token-endpointet 401, kalder ApiClient
        // denne fornyer igen — og uden spærren startede vi en ny handoff inde
        // i den vi allerede er i, som ville signOut'e os selv.
        // (`signOut` selv er ufarlig: den sætter `skipRetryOn401: true`.)
        iHandoff = true;
        try {
            await porte.handoff();
            if (!porte.erAutentificeret()) {
                // Handoff'en kan "lykkes" uden at efterlade en session — sker
                // hvis forælderen svarer men token-udvekslingen ikke gav et
                // access token. En resolve her ville sende ApiClient ud i et
                // genforsøg med samme døde token og samme fejlbesked.
                throw new Error(
                    "Fabric-handoff gennemført, men der blev ikke etableret nogen session.",
                );
            }
            senesteSucces = porte.nu();
        } finally {
            iHandoff = false;
        }
    }

    return async function forny(): Promise<void> {
        // Ikke indlejret (eller endnu ikke logget ind første gang): der er
        // ingen forælder at lave handoff med. AuthGate viser i forvejen
        // "kan ikke åbnes uden for Fabric".
        if (!porte.harHaftSession()) return;

        // Rekursion — se kommentaren i `udfør()`. Dette tjek SKAL ligge før
        // `igangværende`: er vi inde i handoff'en, er `igangværende` netop den
        // promise vi selv er en del af, og et `await` på den ville låse fast
        // for evigt (kun brudt af handoff'ens 30 s timeout).
        if (iHandoff) return;

        // Nogen fornyer allerede. Vent på DEN — start ikke en ny, der ville
        // tilbagekalde det token den første er ved at hente.
        if (igangværende) return igangværende;

        // Fornyet for et øjeblik siden: dette 401 stammer fra et kald der var
        // undervejs FØR fornyelsen. Genforsøget henter det nye token selv.
        if (porte.nu() - senesteSucces < FORNYELSE_KARANTÆNE_MS) return;

        igangværende = udfør();
        try {
            await igangværende;
        } finally {
            igangværende = null;
        }
    };
}
