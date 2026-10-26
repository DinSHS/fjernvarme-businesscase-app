//-----------------------------------------------------------------------
// Hvilket modelrepo og hvilken udgivelse dokumenterne er bundtet fra.
// Skal stå i takt med viden/dokumentation_indeks.json (`model_commit`) — det tjekker
// dokumenter.spec.ts. Opdateres ved en bevidst opgradering af modelversionen, sammen
// med `_byg/kopier-indhold.mjs`, som henter filerne ved præcis denne commit.
//-----------------------------------------------------------------------

export const MODELREPO = {
    navn: "skj-1964/fjernvarme-businesscase",
    url: "https://github.com/skj-1964/fjernvarme-businesscase",
    commit: "eef950a2ac7b3808a9456dcf48742ce08e52366a",
    kort: "eef950a",
    licens: "MIT",
} as const;

/**
 * Datarepoet, som kørslerne henter markeds- og vejrdata fra. `commit` er den version, notebooken er pinnet til
 * (fabric/fjv/konstanter.py: DF_DATA_SHA) — `kredit.spec.ts` tjekker, at de to er ens. Datarepoet opdateres om mandagen;
 * pinnet version skiftes bevidst. Hver kørsel gemmer den version, den faktisk brugte.
 */
export const DATAREPO = {
    navn: "skj-1964/df-data",
    url: "https://github.com/skj-1964/df-data",
    commit: "106b9fce9a2e3610090b1a542559024056449b88",
    kort: "106b9fc",
} as const;

export const DATAREPO_URL = DATAREPO.url;

/** Kildelinjen, der står under hvert repodokument. */
export const KILDELINJE = `Fra ${MODELREPO.navn} @ ${MODELREPO.kort} (${MODELREPO.licens})`;

export type GitHubArt = "blob" | "tree" | "raw";

/** Adresse på en fil i modelrepoet ved den pinnede commit (aldrig `main`: dokumenterne er en bestemt udgivelse). */
export function githubUrl(sti: string, art: GitHubArt = "blob", anker?: string): string {
    const ren = sti.replace(/^\/+/, "").replace(/\/+$/, "");
    return `${MODELREPO.url}/${art}/${MODELREPO.commit}/${ren}${anker ? `#${anker}` : ""}`;
}
