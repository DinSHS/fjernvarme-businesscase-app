//-----------------------------------------------------------------------
// Hvad et svar på en bestilling BETYDER — og hvad klienten skal huske til næste klik.
//
// Efterprøvningen af rettelserne i runde 15, fund B: serveren kan committe en kørsel, og svaret kan gå tabt på
// vejen hjem. Klientnøglen er det eneste, der binder et nyt forsøg til den samme bestilling (unik i databasen; højst
// én kørsel pr. bestilling). *Kør scenariet* og *Bestil en prøvekørsel* glemte nøglen efter ethvert svar, så næste
// klik gav en ny bestilling og en kørsel mere; prøvekørslen også et nyt scenarie.
//
// Fire udfald, og kun de to første afslutter et forsøg:
//
//   bestilt    ok + kørslens id.                                              -> glem alt; næste klik er en ny kørsel
//   ryddet     endelig afvisning, og serveren har fjernet bestillingen        -> ny nøgle; scenariet beholdes
//   afvist     endelig afvisning, men bestillingen står (Fabric sletter ikke) -> samme nøgle: næste klik genoptager den
//   uafklaret  `teknisk: true`, et "ok" uden kørsel, eller et kald, der kastede -> samme nøgle, samme scenarie
//
// "Uafklaret" har sin egen tekst: vi ved ikke, om kørslen blev bestilt. Det er ikke en afvisning.
// En `Afvist` kastet af skrivelaget (ingen bruger, en række serveren nægtede at oprette, en nøgle der er en andens) er
// derimod et KENDT udfald: der står ingen bestilling for denne bruger.
//
// Tredje rettelsesrunde, P2-2: `ryddet` er forbeholdt BEKRÆFTET fravær og serverens udtrykkelige `ryddet: true`. Et
// opslag på nøglen, der fejler teknisk, og et kald, der afvises, efter at rækken er oprettet, kaster skrivelaget som
// `UafklaretBestilling` (skriv.ts › bestilKoersel) — og alt, der ikke er en `Afvist`, er uafklaret her.
//
// Forsøgene huskes pr. mål i modulet — ikke i komponenten — så nøglen overlever, at brugeren forlader siden og kommer
// tilbage. De overlever ikke en genindlæsning af appen; det er en begrænsning (rapporten for anden rettelsesrunde).
//-----------------------------------------------------------------------

import { Afvist } from "./skriv";

/** Det af `startBestilling`s svar, udfaldet afgøres af (rayfin/functions/src/function_app.ts › Bestillingssvar). */
export interface Bestillingssvar {
    ok: boolean;
    koersel_id?: string | null;
    afvist?: string | null;
    ryddet?: boolean | null;
    teknisk?: boolean | null;
    arbejder?: { startet?: boolean; grund?: string } | null;
}

export type Bestillingsudfald =
    | { art: "bestilt"; koersel_id: string; svar: Bestillingssvar }
    /** Endelig afvisning; bestillingen findes ikke (længere) — `tekst` er serverens eller skrivelagets egen. */
    | { art: "ryddet"; tekst: string }
    /** Endelig afvisning; bestillingen står og kan genoptages med samme nøgle. */
    | { art: "afvist"; tekst: string }
    /** Ingen ved, om kørslen blev bestilt. `detalje` er den tekniske tekst, hvis der er en. */
    | { art: "uafklaret"; detalje: string };

export function udfaldAfSvar(r: Bestillingssvar): Bestillingsudfald {
    if (r.ok && r.koersel_id) return { art: "bestilt", koersel_id: r.koersel_id, svar: r };
    if (r.ok) return { art: "uafklaret", detalje: "serveren svarede uden en kørsel" };
    if (r.teknisk === true) return { art: "uafklaret", detalje: r.afvist ?? "" };
    const tekst = r.afvist ?? "Bestillingen blev afvist.";
    return r.ryddet === true ? { art: "ryddet", tekst } : { art: "afvist", tekst };
}

/** Kører bestillingen og oversætter BÅDE svaret og en kastet fejl til et udfald. */
export async function bestilMedUdfald(bestil: () => Promise<Bestillingssvar>): Promise<Bestillingsudfald> {
    try {
        return udfaldAfSvar(await bestil());
    } catch (e) {
        // Skrivelagets egen afvisning: rækken blev ikke oprettet (eller er en andens) — et kendt udfald uden bestilling.
        // Alt andet (netværk, `UafklaretBestilling`) er uafklaret: bestillingen kan stå.
        if (e instanceof Afvist) return { art: "ryddet", tekst: e.message };
        return { art: "uafklaret", detalje: e instanceof Error ? e.message : String(e) };
    }
}

/** Teksten til et uafklaret udfald. `hvad` i bestemt form: "kørslen", "prøvekørslen", "referencen", "scenariet". */
export function uafklaretTekst(hvad: string, detalje?: string): string {
    const d = detalje?.trim();
    return `Vi ved ikke, om ${hvad} blev bestilt — prøv igen. Et nyt forsøg sender samme bestilling, så der kommer højst én kørsel.${d ? ` (${d})` : ""}`;
}

/** Skal næste klik fortsætte det samme forsøg (samme nøgle)? */
export const skalGenoptages = (u: Bestillingsudfald): boolean => u.art === "uafklaret" || u.art === "afvist";

/** `genoptages`: sidste udfald lod bestillingen stå (eller er uafklaret) — næste klik sender SAMME nøgle. */
interface Husket { nøgle: string; scenarieId?: string; genoptages?: boolean }
const FORSØG = new Map<string, Husket>();

/** Kun til tests: glem alle igangværende forsøg. */
export function glemBestillingsforsøg(): void {
    FORSØG.clear();
}

/** Står der et forsøg, som næste klik fortsætter med samme bestilling? (Til knappens tekst: "Prøv igen".) */
export function harÅbentForsøg(mål: string): boolean {
    return FORSØG.get(mål)?.genoptages === true;
}

/**
 * Ét klik på en bestillingsknap. `mål` navngiver det, brugeren bestiller (`scenarie:<id>` eller `proeve:<værk>`): et
 * andet mål er en anden kørsel og har sit eget forsøg. `scenarie` giver scenariets id — og kaldes kun, når forsøget
 * ikke allerede har et (prøvekørslen opretter sit scenarie her, én gang). Klientnøglen laves ved første klik og
 * beholdes, til udfaldet er kendt.
 */
export async function bestilHusket(
    mål: string,
    scenarie: () => Promise<string>,
    bestil: (scenarieId: string, nøgle: string) => Promise<Bestillingssvar>,
): Promise<Bestillingsudfald & { scenarieId: string }> {
    let h = FORSØG.get(mål);
    if (!h) { h = { nøgle: crypto.randomUUID() }; FORSØG.set(mål, h); }
    try {
        h.scenarieId ??= await scenarie();
    } catch (e) {
        // Intet er bestilt endnu. Forsøget huskes ikke: der er ingen bestilling at genoptage.
        FORSØG.delete(mål);
        throw e;
    }
    const scenarieId = h.scenarieId, nøgle = h.nøgle;
    const u = await bestilMedUdfald(() => bestil(scenarieId, nøgle));
    if (u.art === "bestilt") FORSØG.delete(mål);
    else if (u.art === "ryddet") { h.nøgle = crypto.randomUUID(); h.genoptages = false; }    // bestillingen er væk; scenariet beholdes
    else h.genoptages = skalGenoptages(u);
    return { ...u, scenarieId };
}
