//-----------------------------------------------------------------------
// Gør en fejl fra databasevejen (Rayfin/DAB GraphQL) brugbar for brugeren.
//-----------------------------------------------------------------------

import { erSessionsFejl, SESSIONS_FEJL_BESKED } from "@/lib/auth-fejl";
import { erUkendtFeltFejl, hentQueryFeltnavne } from "@/lib/graphql-diagnostik";

/**
 * - En sessionsfejl er nået hertil FORDI den automatiske fornyelse ikke
 *   lykkedes (`session-fornyelse.ts`); Rayfins ordlyd peger på rettigheder,
 *   som aldrig er årsagen. Den oprindelige besked beholdes efter vores egen.
 * - Ved "feltet findes ikke på Query" spørges serveren hvilke felter den HAR:
 *   klient og server pluraliserer entitetsnavnet med hver sit bibliotek, og
 *   uden serverens navn skulle det gættes gennem et deploy ad gangen.
 */
export async function berigFejl(err: unknown): Promise<Error> {
    const fejl = err instanceof Error ? err : new Error(String(err));

    if (erSessionsFejl(fejl)) {
        return new Error(`${SESSIONS_FEJL_BESKED}\n\n(Teknisk: ${fejl.message})`);
    }
    if (!erUkendtFeltFejl(fejl)) return fejl;

    const felter = await hentQueryFeltnavne();
    if (!felter?.length) return fejl;

    return new Error(
        `${fejl.message}\n\nServerens Query-felter: ${felter.join(", ")}. ` +
        `Klient og server er uenige om entitetsnavnets pluralis — registrér serverens navn med ` +
        `setCustomPlural(...) i src/lib/rayfin-client.ts.`,
    );
}
