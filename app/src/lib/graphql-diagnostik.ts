//-----------------------------------------------------------------------
// Diagnostik: spørg serveren hvilke felter dens GraphQL-Query faktisk har.
//
// Baggrund: klient og server pluraliserer entitetsnavnet med to forskellige
// biblioteker (se kommentaren i rayfin-client.ts). Er de uenige, fejler
// listeforespørgslen med "The field `x` does not exist on the type `Query`",
// og der er ingen anden måde at få det rigtige navn at vide — Rayfin-CLI'en
// skriver ikke serverens navn nogen steder, og introspektion udefra afvises.
//
// Kaldes KUN når den fejl opstår, så det rigtige navn kan vises i UI'et i
// stedet for at skulle gættes og deployes forfra.
//-----------------------------------------------------------------------

import { GraphQLClient } from "@microsoft/rayfin-data";
import { getRayfinClient } from "./rayfin-client";

interface IntrospektionsSvar {
    __schema: {
        queryType: { fields: { name: string }[] } | null;
    };
}

/** Feltnavnene på serverens `Query`-type, eller null hvis det ikke kunne læses. */
export async function hentQueryFeltnavne(): Promise<string[] | null> {
    try {
        // `apiClient` er kun `protected` i TypeScript — den findes på objektet
        // ved kørsel. Rayfin eksponerer ikke rå GraphQL-adgang offentligt.
        const klient = getRayfinClient() as unknown as { apiClient: never };
        const graphql = new GraphQLClient(klient.apiClient);

        const svar = await graphql.query<IntrospektionsSvar>(
            "{ __schema { queryType { fields { name } } } }",
        );

        return svar.__schema?.queryType?.fields?.map((f) => f.name) ?? null;
    } catch {
        // Introspektion kan være slået fra på serveren; så må vi klare os uden.
        return null;
    }
}

/** True hvis fejlen skyldes at klienten spurgte om et felt serveren ikke har. */
export function erUkendtFeltFejl(fejl: unknown): boolean {
    const besked = fejl instanceof Error ? fejl.message : String(fejl);
    return /does not exist on the type/i.test(besked);
}
