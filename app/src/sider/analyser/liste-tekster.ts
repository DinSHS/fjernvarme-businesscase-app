//-----------------------------------------------------------------------
// Tekster til kørselslisten og "Sådan er en analyse sammensat" (brief 17).
// Fagteksten kommer fra viden/: ordlistens definitioner (ORDLISTE, genereret),
// app_tekster/saadan_bruger_du_appen.md (citeret med kilde nedenfor) og
// anbefalingsregler.json (KATEGORIER). Appens egne formuleringer er kun
// overskrifter og sammenbinding.
//-----------------------------------------------------------------------

import { KATEGORIER } from "./anbefaling.data";
import { ORDLISTE } from "./sammensaetning.data";

/** Ankre i ordlisten (`#/information/ordliste#<anker>`, fv-doku's format). Testet mod ordliste.md. */
export const ANKRE = {
    scenarie: "scenarie", reference: "referencekørsel", vaerk: "værk", differens: "differensmetoden", gab: "gab", objektiv: "objektiv",
    syntetisk: "syntetisk-varmelast", sporA: "spor-a", sporB: "spor-b", balancemarked: "balancemarked",
} as const;

export const ordHref = (anker: string) => `#/information/ordliste#${anker}`;
export const DIFFERENSMETODEN_HREF = "#/information/differensmetoden";
export const REFERENCETAL_HREF = "#/information/referencetal";

const ord = (navn: string) => ORDLISTE[navn] ?? "";
const stort = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Kolonnernes forklaring (tooltip) og evt. link (ordlisten eller et Information-emne). */
export const KOLONNE_FORKLARING: Readonly<Record<string, { tekst: string; href?: string }>> = {
    spoergsmaal: { tekst: `Scenariets navn og det spørgsmål, det besvarer. ${stort(ord("Scenarie"))}`, href: ordHref(ANKRE.scenarie) },
    aendringer: { tekst: "Hvad kørslen har ændret i værket (fra det frosne input). Periode, balancemarked og varmelast står i egne kolonner.", href: ordHref(ANKRE.vaerk) },
    rolle: { tekst: `Reference eller scenarie i et par — eller en enkeltkørsel. Referencekørsel: ${ord("Referencekørsel")}`, href: ordHref(ANKRE.reference) },
    oprindelse: { tekst: "Hvor kørslen kommer fra: genskaber et README-referencetal, en af demo-kørslerne, bestilt i appen, kørt i notebooken — eller en røgtest af kørselsvejen.", href: REFERENCETAL_HREF },
    periode: { tekst: "Periodens længde og datoer. Et kort vindue viser retningen, ikke størrelsen." },
    markeder: { tekst: `Kun spotmarkedet, eller også balancemarkedet (aFRR og mFRR). Spor A: ${ord("Spor A")} Spor B: ${ord("Spor B")}`, href: ordHref(ANKRE.balancemarked) },
    varmelast: { tekst: `Målt varmelast (fil) eller syntetisk. Syntetisk varmelast: ${ord("Syntetisk varmelast")}`, href: ordHref(ANKRE.syntetisk) },
    objektiv: { tekst: `Driftsomkostning (objektivet): ${ord("Objektiv")}`, href: ordHref(ANKRE.objektiv) },
    delta: { tekst: `Scenarie minus reference i driftsomkostning. Differensmetoden: ${ord("Differens / differensmetoden")}`, href: ordHref(ANKRE.differens) },
    anbefaling: { tekst: Object.values(KATEGORIER).map((k) => `${k.maerke}: ${k.betydning}`).join(" ") },
    status: { tekst: "Kørslens status: i kø → kører → indlæser → færdig (eller fejl/annulleret)." },
    vaerk: { tekst: stort(ord("Værk")), href: ordHref(ANKRE.vaerk) },
    modtaget: { tekst: "Hvornår bestillingen blev modtaget (køens rækkefølge)." },
    gab: { tekst: `Opnået gab. ${stort(ord("Gab (solvergab, MIP-gab)"))}`, href: ordHref(ANKRE.gab) },
    varighed: { tekst: "Regnetid fra start til slut." },
    bestilt_af: { tekst: "Hvem der bestilte kørslen, og om den kom fra notebooken." },
};

/**
 * De syv trin i "Sådan er en analyse sammensat". `tekst` er fagteksten med kilde;
 * eksemplet udfyldes af data (demo-parret P1) i komponenten.
 */
export const TRIN: readonly { id: string; titel: string; tekst: string; kilde: string; href?: string }[] = [
    { id: "vaerk", titel: "Værk", tekst: stort(ord("Værk")), kilde: "ordliste", href: ordHref(ANKRE.vaerk) },
    { id: "scenarie", titel: "Scenarie", tekst: `${stort(ord("Scenarie"))} Én knap ad gangen: ændrer du flere ting på én gang, kan du ikke se, hvad der gjorde forskellen.`, kilde: "ordliste; Sådan bruger du appen §2 (doc/KOERSEL.md:43-44)", href: ordHref(ANKRE.scenarie) },
    { id: "periode", titel: "Periode", tekst: "Start med et kort vindue (vinter 5.–16. januar 2026 eller sommer 8.–19. juni 2026); en investering skal regnes på et helt år.", kilde: "Sådan bruger du appen §2 (doc/KOERSEL.md:109-110)" },
    { id: "indstillinger", titel: "Indstillinger", tekst: "Balancemarked med eller uden, målt eller syntetisk varmelast, og solvergabet — ens i reference og scenarie (gab 0,0002 og 100 kr.).", kilde: "Sådan bruger du appen §2 (doc/KOERSEL.md:57-60)", href: ordHref(ANKRE.gab) },
    { id: "koersel", titel: "Kørsel", tekst: "Kørslen fryses med de værdier, der gælder, når du trykker. Retter nogen værket bagefter, påvirker det ikke din kørsel.", kilde: "Sådan bruger du appen §3" },
    { id: "sammenligning", titel: "Sammenligning", tekst: "Differensen er scenarie minus reference og er svaret på spørgsmålet. Er den mindre end solverens tolerance, kan den ikke skelnes fra nul.", kilde: "Sådan bruger du appen §4", href: DIFFERENSMETODEN_HREF },
    { id: "anbefaling", titel: "Anbefaling", tekst: "Kategorien afgøres af differensen, tolerancen og forbeholdene: Anbefalet, Undersøg nærmere, Frarådes, Følsomhed eller Kan ikke afgøres.", kilde: "Appens anbefalingsregler" },
];
