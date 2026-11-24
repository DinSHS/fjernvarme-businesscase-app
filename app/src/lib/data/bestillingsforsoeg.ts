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
// Tredje rettelsesrunde, P2-1: et forsøg er BRUGERENS og gælder ét bestemt INDHOLD.
//
// Serveren fryser scenariet, første gang `startBestilling` når den. Var første forsøg nået frem (kørsel K1 med indhold
// A, svaret tabt), og rettede brugeren så scenariet til B, sendte næste klik samme nøgle, fik K1 tilbage og kvitterede
// "Kørslen er bestilt" — for A. Derfor bærer forsøget et fingeraftryk af det, der bestilles (`aftryk`: klientens
// forudsigelse af det frosne input, scenarier/logik.ts › bestillingsaftryk):
//
//   samme aftryk   -> forsøget genoptages (samme nøgle), og knappen viser den åbne tilstand — også efter navigation
//   andet aftryk   -> forsøget genoptages IKKE. Den gamle bestilling slås op; blev den til en kørsel, følger kørslens
//                     id med svaret (`forrige`), så siden kan sige det. Den nye bestilling får ny nøgle. Kan den
//                     gamle ikke slås op, bestilles intet nyt (ellers kunne en kørsel af det gamle indhold stå uomtalt).
//
// Forsøgene huskes pr. bruger og mål — i modulet, så de overlever, at siden forlades, og i `sessionStorage`, så de
// overlever en genindlæsning (før gav en genindlæsning efter et tabt svar en ekstra kørsel). Forsøget gemmes, FØR
// kaldet sendes: en genindlæsning midt i kaldet efterlader et åbent forsøg, ikke et glemt. sessionStorage er en
// bekvemmelighed: alle læsninger og skrivninger er i try/catch, og uden den huskes forsøget som før i hukommelsen.
// Fanen er grænsen — en anden fane eller en lukket browser kender ikke forsøget.
//
// Fjerde rettelsesrunde, punkt 1: et svar afslutter kun det forsøg, der bærer SAMME klientnøgle som kaldet. Pladsen
// (bruger + mål) kan have fået et nyere forsøg, mens svaret var undervejs.
//-----------------------------------------------------------------------

import { Afvist, bestillingensKoersel } from "./skriv";

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

// ------------------------------------------------------------------ de huskede forsøg (P2-1)

/** Hvad der bestilles, og af hvem. `mål`: `scenarie:<id>` eller `proeve:<værk>`; et andet mål er en anden kørsel. */
export interface Forsøgsmål {
    mål: string;
    bruger: string | undefined;
    /** Fingeraftryk af det, der bestilles (en vilkårlig tekst; ens tekst = samme indhold). */
    aftryk: string;
}

/**
 * `genoptages`: bestillingen står eller kan stå — næste klik med SAMME indhold sender samme nøgle. `aftryk` er en kort
 * kontrolsum af fingeraftrykket (ikke teksten selv: den kan være flere kilobyte og skal ikke ligge i browseren).
 */
interface Husket { nøgle: string; scenarieId?: string; genoptages?: boolean; aftryk: string }

const LAGERNØGLE = "fjv.bestillingsforsoeg.v1";
let FORSØG: Map<string, Husket> | undefined;

/**
 * Kontrolsum (cyrb53, 53 bit) — ikke kryptografisk og skal ikke være det: den afgør kun, om brugerens eget scenarie er
 * det samme som ved forrige klik. En kollision ville genoptage et forsøg på ændret indhold (det, der før skete altid).
 */
function kontrolsum(tekst: string): string {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < tekst.length; i++) {
        const c = tekst.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761);
        h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)}:${tekst.length}`;
}

function erHusket(x: unknown): x is Husket {
    const h = x as Partial<Husket> | null;
    return !!h && typeof h.nøgle === "string" && !!h.nøgle && typeof h.aftryk === "string"
        && (h.scenarieId === undefined || typeof h.scenarieId === "string") && (h.genoptages === undefined || typeof h.genoptages === "boolean");
}

function forsøg(): Map<string, Husket> {
    if (FORSØG) return FORSØG;
    FORSØG = new Map();
    try {
        const rå = globalThis.sessionStorage?.getItem(LAGERNØGLE);
        const liste: unknown = rå ? JSON.parse(rå) : [];
        if (Array.isArray(liste)) {
            for (const par of liste) {
                if (Array.isArray(par) && typeof par[0] === "string" && erHusket(par[1])) FORSØG.set(par[0], par[1]);
            }
        }
    } catch { /* ingen sessionStorage, eller ulæseligt indhold: begynd uden huskede forsøg */ }
    return FORSØG;
}

function gem(): void {
    try {
        const s = globalThis.sessionStorage;
        if (!s) return;
        const alle = [...forsøg()];
        if (alle.length) s.setItem(LAGERNØGLE, JSON.stringify(alle));
        else s.removeItem(LAGERNØGLE);
    } catch { /* fuld eller spærret: forsøget huskes stadig i modulet */ }
}

/** Uden bruger kan intet bestilles (skrivelaget afviser); forsøget hører da til ingen. */
const plads = (m: Forsøgsmål) => `${m.bruger ?? ""}\n${m.mål}`;

/** Kun til tests: glem alle igangværende forsøg — også de gemte. */
export function glemBestillingsforsøg(): void {
    FORSØG = new Map();
    gem();
}

/** Kun til tests: som en genindlæsning af appen — modulets hukommelse er væk, sessionStorage står. */
export function genindlæsBestillingsforsøg(): void {
    FORSØG = undefined;
}

/**
 * Står der et forsøg for netop denne bruger og dette mål, som næste klik skal forholde sig til?
 * `samme`: indholdet er det, forsøget bestilte — næste klik genoptager det ("Prøv igen").
 * `aendret`: indholdet er et andet — næste klik er en ny bestilling.
 */
export function åbentForsøg(m: Forsøgsmål): "samme" | "aendret" | undefined {
    const h = forsøg().get(plads(m));
    if (!h?.genoptages) return undefined;
    return h.aftryk === kontrolsum(m.aftryk) ? "samme" : "aendret";
}

export type HusketUdfald =
    | (Bestillingsudfald & {
        scenarieId: string;
        /** Et forsøg på det TIDLIGERE indhold var blevet til denne kørsel. */
        forrige?: { koersel_id: string };
    })
    /** Indholdet er ændret siden et åbent forsøg, og det gamle forsøg kunne ikke slås op. Intet nyt er sendt. */
    | { art: "forrige_ukendt"; detalje: string; scenarieId: string };

const stort = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Teksten til et udfald, der ikke er `bestilt`, for de to knapper, der bruger `bestilHusket`. `hvad` i bestemt form
 * ("kørslen", "prøvekørslen"); `det` er det, brugeren kan have ændret ("scenariet", "værket").
 */
export function udfaldTekst(u: Exclude<HusketUdfald, { art: "bestilt" }>, hvad: string, det: string): string {
    if (u.art === "uafklaret") return uafklaretTekst(hvad, u.detalje);
    if (u.art === "forrige_ukendt") {
        const d = u.detalje.trim();
        return `${stort(det)} er ændret siden et forsøg, hvis udfald vi ikke kender, og det forsøg kunne ikke slås op. Intet nyt er bestilt — prøv igen om lidt.${d ? ` (${d})` : ""}`;
    }
    return u.tekst;
}

/** Tilføjelsen til kvitteringen, når et forsøg på det tidligere indhold viste sig at være blevet til en kørsel. */
export function forrigeTekst(forrige: { koersel_id: string }, det: string): string {
    return ` Det forrige forsøg, fra før ${det} blev ændret, blev også til en kørsel (${forrige.koersel_id.slice(0, 8)}); den er regnet med det tidligere indhold.`;
}

/** Teksten ved en knap med et åbent forsøg (efter navigation eller genindlæsning er der intet svar at vise). */
export function åbentTekst(tilstand: "samme" | "aendret", hvad: string, det: string): string {
    return tilstand === "samme"
        ? `Der står et forsøg på at bestille ${hvad}, hvis udfald vi ikke kender. Prøv igen sender samme bestilling, så der kommer højst én kørsel.`
        : `${stort(det)} er ændret siden et forsøg på at bestille ${hvad}, hvis udfald vi ikke kender. Næste klik bestiller det ændrede som en ny kørsel og fortæller, om det forrige forsøg blev til en kørsel.`;
}

/**
 * Ét klik på en bestillingsknap. `scenarie` giver scenariets id — og kaldes kun, når forsøget ikke allerede har et
 * (prøvekørslen opretter sit scenarie her, én gang). Klientnøglen laves ved første klik og beholdes, til udfaldet er
 * kendt — medmindre indholdet er ændret siden (se filens hoved).
 */
export async function bestilHusket(
    m: Forsøgsmål,
    scenarie: () => Promise<string>,
    bestil: (scenarieId: string, nøgle: string) => Promise<Bestillingssvar>,
): Promise<HusketUdfald> {
    const alle = forsøg(), k = plads(m), aftryk = kontrolsum(m.aftryk);
    let h = alle.get(k);
    let forrige: { koersel_id: string } | undefined;
    if (h && h.aftryk !== aftryk) {
        if (h.genoptages && h.scenarieId) {
            // Indholdet er ændret siden et forsøg, der står åbent. Find ud af, hvad det gamle blev til, FØR noget nyt sendes.
            let gammel: Awaited<ReturnType<typeof bestillingensKoersel>>;
            try {
                gammel = await bestillingensKoersel(h.nøgle, h.scenarieId, m.bruger);
            } catch (e) {
                return { art: "forrige_ukendt", detalje: e instanceof Error ? e.message : String(e), scenarieId: h.scenarieId };
            }
            if (gammel?.koersel_id) forrige = { koersel_id: gammel.koersel_id };
        }
        // Ny nøgle til det nye indhold; scenariet er det samme (prøvekørslens er allerede oprettet).
        h = { nøgle: crypto.randomUUID(), scenarieId: h.scenarieId, aftryk };
        alle.set(k, h);
        gem();
    }
    if (!h) { h = { nøgle: crypto.randomUUID(), aftryk }; alle.set(k, h); }
    try {
        h.scenarieId ??= await scenarie();
    } catch (e) {
        // Intet er bestilt endnu. Forsøget huskes ikke: der er ingen bestilling at genoptage.
        alle.delete(k);
        gem();
        throw e;
    }
    const scenarieId = h.scenarieId, nøgle = h.nøgle;
    // Gemmes åbent, FØR kaldet sendes: forlades eller genindlæses siden midt i kaldet, kendes udfaldet ikke.
    h.genoptages = true;
    gem();
    const u = await bestilMedUdfald(() => bestil(scenarieId, nøgle));
    // Svaret hører til NØGLEN, ikke til pladsen. Mens kaldet var undervejs, kan et nyere forsøg (ændret indhold, ny
    // nøgle) have overtaget pladsen — også i en genindlæst hukommelse. Et sent svar må da hverken slette eller ændre
    // det: før slettede A's sene succes forsøget på B, og et tabt svar på B gav en tredje kørsel (r15d_sent_svar.spec).
    const nu = forsøg().get(k);
    if (nu?.nøgle === nøgle) {
        if (u.art === "bestilt") forsøg().delete(k);
        else if (u.art === "ryddet") { nu.nøgle = crypto.randomUUID(); nu.genoptages = false; }    // bestillingen er væk; scenariet beholdes
        else nu.genoptages = skalGenoptages(u);
        gem();
    }
    return { ...u, scenarieId, ...(forrige ? { forrige } : {}) };
}
