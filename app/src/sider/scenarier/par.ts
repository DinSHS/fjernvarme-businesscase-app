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
//-----------------------------------------------------------------------

import type { ÆndringUdkast, ScenarieFelter } from "@/lib/data/skriv";
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
    bestilKoersel: (scenarieId: string, bruger: string | undefined, nøgle: string) => Promise<{ ok: boolean; koersel_id?: string | null; afvist?: string | null }>;
    /** De pins (model, df-data), startBestilling frøs for en kørsel. */
    frosnePins?: (koerselId: string) => Promise<Pins>;
    /** Peg scenariets `reference_scenarie_id` på en anden reference. */
    sætReference?: (scenarieId: string, refScenarieId: string) => Promise<void>;
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
            const r = await deps.bestilKoersel(t.refScenarieId, bruger, `${nøgle}-r`);
            if (!r.ok || !r.koersel_id) return `Referencen blev ikke bestilt: ${r.afvist ?? "afvist uden forklaring."}`;
            t.refKoerselId = r.koersel_id;
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
        const r = await deps.bestilKoersel(t.scenScenarieId!, bruger, `${nøgle}-s`);
        if (!r.ok || !r.koersel_id) return { ok: false, tilstand: t, afvist: `Scenariet blev ikke bestilt: ${r.afvist ?? "afvist uden forklaring."}` };
        t.scenKoerselId = r.koersel_id;
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
