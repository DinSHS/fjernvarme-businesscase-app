//-----------------------------------------------------------------------
// Kredit til den oprindelige case (produktejer 2026-10-16: fuld kredit i begge udgaver).
// Ren modul uden React — så både kreditlinjen i sidefoden, siden "Om og kredit" og tests bruger de samme ord.
//
// Ingen formulering må antyde, at Dansk Fjernvarme, Billund Varme eller modellens forfatter står bag eller har
// godkendt appen. kredit.spec.ts fejler på de vendinger, der ville gøre det.
//-----------------------------------------------------------------------

import { DATAREPO, MODELREPO } from "./kilde";

export const FORFATTER_URL = "https://github.com/skj-1964";
export const OM_HREF = "#/dokumentation/om";

/** Kreditlinjen i sidefoden som led (tekst eller link) — samme ord overalt. */
export const KREDITLINJE: readonly { tekst: string; href?: string; ekstern?: boolean }[] = [
    { tekst: "Bygger på " },
    { tekst: "fjernvarme-businesscase", href: MODELREPO.url, ekstern: true },
    { tekst: " af " },
    { tekst: "skj-1964", href: FORFATTER_URL, ekstern: true },
    { tekst: " (MIT), udviklet med Billund Varme og Dansk Fjernvarme · data fra " },
    { tekst: "df-data", href: DATAREPO.url, ekstern: true },
    { tekst: " · " },
    { tekst: "Om og kredit", href: OM_HREF },
];

/** Linjens ren tekst (til tests og til en `title`). */
export const KREDITLINJE_TEKST = KREDITLINJE.map((d) => d.tekst).join("");

/** Det, appen er — og det, den ikke er. */
export const BRUGERFLADE_TIL_MODELLEN =
    "Appen er en brugerflade til modellen: den lader dig se og rette et værk, bestille kørsler og læse resultaterne.";
export const FORFATTERENS =
    "Selve modellen — metoden, valideringen og referencetallene — er forfatterens og ligger i det åbne modelrepo.";
export const IKKE_DISTRIBUERET =
    "Appen distribuerer ikke modellens kode: den afhænger af den på en pinnet commit og henter den, når en kørsel regnes.";
export const INGEN_GODKENDELSE =
    "Der foreligger ingen godkendelse eller tilslutning fra Dansk Fjernvarme, Billund Varme eller modellens forfatter; kreditten er en anerkendelse af, hvor modellen kommer fra.";

/** Adresse på en bestemt commit i et repo. */
export const commitHref = (repoUrl: string, sha: string) => `${repoUrl}/tree/${sha}`;

/** Første linje i en licenstekst, der passer på mønstret (fx "Copyright (c) 2026 …"). */
export function licensLinje(tekst: string | undefined, moenster: RegExp): string | undefined {
    return tekst?.split(/\r?\n/).find((l) => moenster.test(l))?.trim();
}

/** Den korte note nederst i df-datas LICENSE (efter `---`): hvad der gælder for selve dataene. */
export function dataNote(tekst: string | undefined): string | undefined {
    if (!tekst) return undefined;
    const dele = tekst.split(/\r?\n---\s*\r?\n/);
    return dele.length > 1 ? dele[dele.length - 1].trim().replace(/\s*\n\s*/g, " ") : undefined;
}

