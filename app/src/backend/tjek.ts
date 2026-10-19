//-----------------------------------------------------------------------
// Kun til tsc: begge backend-mapper skal opfylde kontrakten (src/backend/kontrakt.ts).
// Filen importeres ikke af appen og kommer derfor aldrig i en bundle.
//-----------------------------------------------------------------------

import * as rayfinData from "./rayfin/data";
import * as rayfinAuth from "./rayfin/auth";
import * as rayfinFejl from "./rayfin/fejl";
import * as rayfinTemaer from "./rayfin/temaer";
import * as restData from "./rest/data";
import * as restAuth from "./rest/auth";
import * as restFejl from "./rest/fejl";
import * as restTemaer from "./rest/temaer";
import type { AuthModul, DataModul, FejlModul, TemaModul } from "./kontrakt";

export const tjek = [
    rayfinData satisfies DataModul, restData satisfies DataModul,
    rayfinAuth satisfies AuthModul, restAuth satisfies AuthModul,
    rayfinFejl satisfies FejlModul, restFejl satisfies FejlModul,
    rayfinTemaer satisfies TemaModul, restTemaer satisfies TemaModul,
] as const;
