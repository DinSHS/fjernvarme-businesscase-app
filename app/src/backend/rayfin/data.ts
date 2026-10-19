//-----------------------------------------------------------------------
// Fabric-udgaven: datakilden er Rayfin-klienten (DAB/GraphQL + Functions).
// Se src/lib/data/kilde.ts og src/backend/kontrakt.ts.
//-----------------------------------------------------------------------

import { getRayfinClient } from "@/lib/rayfin-client";
import type { DataKilde } from "@/lib/data/kilde";
import type { Backendnavn } from "../kontrakt";

export const BACKEND: Backendnavn = "rayfin";

export function hentDataKilde(): DataKilde {
    return getRayfinClient() as unknown as DataKilde;
}
