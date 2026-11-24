//-----------------------------------------------------------------------
// Opret og bestil et reference/scenarie-par — ét brugerklik, fire skridt.
//
// Skridtene huskes i `tilstand` (som funktionen MUTERER undervejs), så "Prøv
// igen" efter en afvisning (fx tre ventende kørsler pr. bruger) eller en
// netværksfejl midt i fortsætter, hvor den stoppede, i stedet for at oprette
// scenarierne igen. Bestillingerne får hver sin klientnøgle afledt af
// handlingens nøgle: samme klik = samme bestillinger (KONTRAKT §3.6).
//
// Referencen bestilles FØR scenariet, så FIFO-køen regner den først. Findes
// der allerede en sammenlignelig referencekørsel, genbruges den (§6b) — men kun
// hvis scenariets FROSNE pins (model, df-data) bagefter er de samme som
// referencens; ellers bestilles en ny reference (K3-N4).
//
// Runde 15 (fund 3.2, den uafhængige test 18. november 2026): afviser backenden en bestilling, ARKIVERES det
// scenarie, parflowet oprettede til den i samme handling, og det glemmes i `tilstand` — så en afvisning ikke
// efterlader et scenarie, der står som "ikke kørt" mellem de rigtige, og "Prøv igen" opretter det på ny. (Sletning
// er bevidst ikke tilladt for Scenarie, KONTRAKT §3.4.) En genbrugt reference er ikke parflowets og røres aldrig.
//
// Kodegennemgangen af runde 15 (fund 3): det gælder KUN, når serveren svarer `ryddet: true` — en endelig afvisning,
// hvor bestillingen er væk, og ingen kørsel er oprettet. Efter en teknisk fejl (`teknisk: true`) eller en afvisning,
// hvor bestillingen blev stående (Fabric-udgaven sletter ikke), beholdes scenariet og dets id: "Prøv igen" sender
// samme klientnøgle, og `bestilKoersel` genoptager den eksisterende bestilling. Før blev scenariet arkiveret på
// ethvert `ok: false`, og genforsøget oprettede et nyt scenarie, som den gamle bestilling så spærrede for.
//
// Efterprøvningen af rettelserne (fund B): et svar med `teknisk: true` — eller et kald, der kastede, fordi svaret gik
// tabt — er UAFKLARET: ingen ved, om kørslen blev bestilt. Det hed "blev ikke bestilt"; nu har det sin egen tekst
// (`uafklaretTekst`), og et kastet bestillingskald når ikke længere siden som en rå fejl. Tilstanden er den samme:
// scenarie og nøgle beholdes, og "Prøv igen" genoptager bestillingen.
//-----------------------------------------------------------------------

import type { ÆndringUdkast, ScenarieFelter } from "@/lib/data/skriv";
import { bestilMedUdfald, uafklaretTekst } from "@/lib/data/bestillingsforsoeg";
import type { Scenarie } from "../../../rayfin/data/Scenarie";
import type { Forslag, Pins, Scenariefelter } from "./logik";
import { pinsPasser } from "./logik";

export interface ParTilstand {
    refScenarieId?: string;
    refÆndringerGemt?: boolean;
    refKoerselId?: string;
    refGenbrugt?: boolean;
    scenScenarieId?: string;
    scenÆndringerGemt?: boolean;
    scenKoerselId?: string;
    /** Scenariets frosne pins er sammenlignet med den genbrugte reference (K3-N4). */
    pinsTjekket?: boolean;
    /** Pins passede ikke: den genbrugte reference er droppet, og en ny er bestilt. */
    pinsUdskiftet?: boolean;
    referenceSat?: boolean;
}

export interface ParAfhængigheder {
    opretScenarie: (felter: ScenarieFelter, bruger: string | undefined) => Promise<Pick<Scenarie, "id">>;
    gemScenarieAendringer: (id: string, eksisterende: [], nye: readonly ÆndringUdkast[]) => Promise<void>;
    bestilKoersel: (scenarieId: string, bruger: string | undefined, nøgle: string) => Promise<{ ok: boolean; koersel_id?: string | null; afvist?: string | null; ryddet?: boolean | null; teknisk?: boolean | null }>;
    /** De pins (model, df-data), startBestilling frøs for en kørsel. */
    frosnePins?: (koerselId: string) => Promise<Pins>;
    /** Peg scenariets `reference_scenarie_id` på en anden reference. */
    sætReference?: (scenarieId: string, refScenarieId: string) => Promise<void>;
    /** Arkivér et scenarie, parflowet selv oprettede, hvis bestilling blev endeligt afvist OG ryddet af serveren (fund 3.2). Uden den bliver scenariet stående. */
    arkivérScenarie?: (scenarieId: string) => Promise<void>;
}

export interface ParInput {
    vaerkId: string;
    spørgsmål: string;
    forklaring: string;
    fælles: Pick<Scenariefelter, "periode_start" | "periode_slut" | "mip_rel_gap" | "mip_abs_gap" | "tidsgraense_s">;
    reference: Forslag;
    scenarie: Forslag;
    /** En eksisterende sammenlignelig referencekørsel, der genbruges i stedet for en ny. */
    genbrug?: { scenarie_id: string; koersel_id: string; pins?: Pins };
}

/** Navnet må højst være 200 tegn (MAKS.navn); spørgsmålet afkortes, endelsen bevares. */
export function parNavn(spørgsmål: string, del: "reference" | "scenarie", tillæg?: string): string {
    const endelse = ` · ${del}${tillæg ? ` (${tillæg})` : ""}`;
    const plads = 200 - endelse.length;
    const s = spørgsmål.length > plads ? `${spørgsmål.slice(0, plads - 1)}…` : spørgsmål;
    return `${s}${endelse}`;
}

/** Scenariefelterne som rækken skal oprettes med (null -> udeladt, som DAB forventer ved create). */
function felter(input: ParInput, f: Forslag, navn: string, beskrivelse: string): ScenarieFelter {
    const alle = { ...input.fælles, ...f.felter };
    const ud: Record<string, unknown> = { vaerk_id: input.vaerkId, navn, beskrivelse };
    for (const [k, v] of Object.entries(alle)) if (v !== null && v !== undefined) ud[k] = v;
    return ud as unknown as ScenarieFelter;
}

/**
 * Teksterne i trinnet "Bekræft og kør" (runde 15, fund 3.6): knappen hed "Bekræft og kør begge" og kortet "to
 * kørsler", også når referencen blev genbrugt, og kun scenariet blev bestilt.
 */
export function parTekster(referenceGenbruges: boolean): { knap: string; afgraensning: string; bestilt: string } {
    return referenceGenbruges
        ? { knap: "Bekræft og kør scenariet", afgraensning: "én kørsel — referencen genbruges", bestilt: "Scenariet er bestilt; referencen er genbrugt — følg det på scenariets side." }
        : { knap: "Bekræft og kør begge", afgraensning: "to kørsler", bestilt: "Begge er bestilt — følg dem på scenariets side." };
}

export type ParSvar = { ok: true; tilstand: ParTilstand } | { ok: false; tilstand: ParTilstand; afvist: string };

/** Scenariets beskrivelse: spørgsmålet og knappens forklaring. Referencen står i `reference_scenarie_id`. */
export function scenarieBeskrivelse(spørgsmål: string, forklaring: string): string {
    return `${spørgsmål}

${forklaring}`;
}

export async function opretOgBestilPar(
    input: ParInput, bruger: string | undefined, nøgle: string, start: ParTilstand, deps: ParAfhængigheder,
    påSkridt?: (tekst: string) => void,
): Promise<ParSvar> {
    const t = start;
    /** Genbrug er kun et tilbud, indtil scenariets frosne pins er kontrolleret (K3-N4). */
    const genbrugTilbudt = !!input.genbrug && !t.pinsUdskiftet;

    /**
     * Fund 3.2: bestillingen af et scenarie, denne handling selv oprettede, blev afvist — arkivér det og glem det.
     * Kun når serveren har bekræftet, at bestillingen er ryddet (`ryddet`); ellers står bestillingen med sin
     * klientnøgle og peger på netop dette scenarie, og næste forsøg skal genoptage den, ikke begynde forfra.
     * Fejler arkiveringen (netværk), beholdes id'et i tilstanden, så "Prøv igen" genbruger rækken i stedet for at lave en til.
     */
    const rydAfvist = async (hvilket: "ref" | "scen", ryddet: boolean | null | undefined): Promise<void> => {
        const id = hvilket === "ref" ? t.refScenarieId : t.scenScenarieId;
        if (ryddet !== true || !id || !deps.arkivérScenarie) return;
        try { await deps.arkivérScenarie(id); } catch { return; }
        if (hvilket === "ref") { t.refScenarieId = undefined; t.refÆndringerGemt = false; }
        else { t.scenScenarieId = undefined; t.scenÆndringerGemt = false; }
    };

    /** Opret og bestil en NY reference (springer færdige skridt over ved et nyt forsøg). */
    const nyReference = async (): Promise<string | undefined> => {
        if (!t.refScenarieId) {
            påSkridt?.("Opretter referencen…");
            const s = await deps.opretScenarie(
                felter(input, input.reference, parNavn(input.spørgsmål, "reference"), `${input.spørgsmål}

Reference: ${input.forklaring}`),
                bruger,
            );
            t.refScenarieId = s.id;
        }
        if (!t.refÆndringerGemt) {
            if (input.reference.aendringer.length) await deps.gemScenarieAendringer(t.refScenarieId, [], input.reference.aendringer);
            t.refÆndringerGemt = true;
        }
        if (!t.refKoerselId) {
            påSkridt?.("Bestiller referencen…");
            const refId = t.refScenarieId;
            const u = await bestilMedUdfald(() => deps.bestilKoersel(refId, bruger, `${nøgle}-r`));
            if (u.art === "uafklaret") return uafklaretTekst("referencen", u.detalje);
            if (u.art !== "bestilt") {
                await rydAfvist("ref", u.art === "ryddet");
                return `Referencen blev ikke bestilt: ${u.tekst}`;
            }
            t.refKoerselId = u.koersel_id;
        }
        return undefined;
    };

    if (genbrugTilbudt && !t.refScenarieId) {
        t.refScenarieId = input.genbrug!.scenarie_id;
        t.refKoerselId = input.genbrug!.koersel_id;
        t.refGenbrugt = true;
    }
    if (!t.refGenbrugt) {
        const afvist = await nyReference();
        if (afvist) return { ok: false, tilstand: t, afvist };
    }
    if (!t.scenScenarieId) {
        påSkridt?.("Opretter scenariet…");
        const s = await deps.opretScenarie(
            { ...felter(input, input.scenarie, parNavn(input.spørgsmål, "scenarie"), scenarieBeskrivelse(input.spørgsmål, input.forklaring)), reference_scenarie_id: t.refScenarieId! },
            bruger,
        );
        t.scenScenarieId = s.id;
    }
    if (!t.scenÆndringerGemt) {
        if (input.scenarie.aendringer.length) await deps.gemScenarieAendringer(t.scenScenarieId, [], input.scenarie.aendringer);
        t.scenÆndringerGemt = true;
    }
    if (!t.scenKoerselId) {
        påSkridt?.("Bestiller scenariet…");
        const scenId = t.scenScenarieId;
        const u = await bestilMedUdfald(() => deps.bestilKoersel(scenId, bruger, `${nøgle}-s`));
        if (u.art === "uafklaret") return { ok: false, tilstand: t, afvist: uafklaretTekst("scenariet", u.detalje) };
        if (u.art !== "bestilt") {
            await rydAfvist("scen", u.art === "ryddet");
            return { ok: false, tilstand: t, afvist: `Scenariet blev ikke bestilt: ${u.tekst}` };
        }
        t.scenKoerselId = u.koersel_id;
    }
    // K3-N4: Motor kan have skiftet pins mellem visning og bestilling. Fik scenariet andre frosne
    // pins end den genbrugte reference, er parret ikke sammenligneligt — bestil en ny reference.
    if (t.refGenbrugt && !t.pinsTjekket && deps.frosnePins && input.genbrug?.pins) {
        påSkridt?.("Kontrollerer datagrundlaget…");
        const p = await deps.frosnePins(t.scenKoerselId);
        t.pinsTjekket = true;
        if (!pinsPasser(p, input.genbrug.pins)) {
            t.refGenbrugt = false;
            t.pinsUdskiftet = true;
            t.refScenarieId = undefined;
            t.refKoerselId = undefined;
            t.refÆndringerGemt = false;
        }
    }
    if (t.pinsUdskiftet) {
        const afvist = await nyReference();
        if (afvist) return { ok: false, tilstand: t, afvist };
        if (!t.referenceSat) {
            await deps.sætReference?.(t.scenScenarieId!, t.refScenarieId!);
            t.referenceSat = true;
        }
    }
    return { ok: true, tilstand: t };
}
