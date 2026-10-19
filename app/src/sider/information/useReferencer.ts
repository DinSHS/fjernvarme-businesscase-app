//-----------------------------------------------------------------------
// README's referencetal mod kørslerne i databasen, som React-hook. Den rene logik står i referencer.ts.
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { useKoersler, useScenarieAendringerFor, useScenarier, useVaerker, type Hentet } from "@/lib/data/hooks";
import { useTekst } from "../dokumentation/tekster";
import { byggRaekker, kandidatScenarier, laesReferencer, type RefRække, type Reference } from "./referencer";

export interface Referencetal { raekker: RefRække[]; refs: Reference[] }

/** Antal ændringer pr. scenarie-id (hooken i datalaget henter dem for flere scenarier i ét kald). */
function useAendringerPrScenarie(ids: readonly string[] | undefined): Hentet<Map<string, number>> {
    const h = useScenarieAendringerFor(ids && ids.length ? ids : undefined);
    const data = useMemo(() => {
        if (!h.data) return undefined;
        const antal = new Map<string, number>();
        for (const r of h.data) antal.set(r.scenarie_id, (antal.get(r.scenarie_id) ?? 0) + 1);
        return antal;
    }, [h.data]);
    return { ...h, data };
}

/**
 * `data` er først sat, når ALT er hentet (værker, scenarier, kørsler og ændringer): en halv sandhed her ville
 * vise en kørsel med ændringer som en ren reference i et øjeblik.
 */
export function useReferencetal(): Hentet<Referencetal> {
    const json = useTekst("viden/referencetal.json");
    const vaerker = useVaerker(true);
    const scenarier = useScenarier(undefined, true);
    const koersler = useKoersler({ status: ["faerdig"] });

    const refs = useMemo(() => {
        if (json.tekst === undefined) return undefined;
        try { return { refs: laesReferencer(json.tekst) }; } catch (e) { return { fejl: e instanceof Error ? e : new Error(String(e)) }; }
    }, [json.tekst]);

    const klar = vaerker.data && scenarier.data && koersler.data && refs?.refs;
    const ids = useMemo(
        () => (klar ? kandidatScenarier(refs.refs, vaerker.data!, scenarier.data!, koersler.data!) : undefined),
        [klar, refs, vaerker.data, scenarier.data, koersler.data],
    );
    // Ingen kandidater = intet at slå op (hooken henter ikke uden id'er); et tomt kort stilles til rådighed nedenfor.
    const aendringer = useAendringerPrScenarie(ids);

    const fejl = json.fejl ?? refs?.fejl ?? vaerker.fejl ?? scenarier.fejl ?? koersler.fejl ?? aendringer.fejl;
    const aendringerKlar = ids !== undefined && (ids.length === 0 || aendringer.data !== undefined);
    const data = useMemo<Referencetal | undefined>(() => {
        if (!klar || !aendringerKlar) return undefined;
        const raekker = byggRaekker(refs.refs, vaerker.data!, scenarier.data!, koersler.data!, aendringer.data ?? new Map());
        return { raekker, refs: refs.refs };
    }, [klar, aendringerKlar, refs, vaerker.data, scenarier.data, koersler.data, aendringer.data]);

    return {
        data, fejl, indlæser: !data && !fejl,
        genindlæs: () => { vaerker.genindlæs(); scenarier.genindlæs(); koersler.genindlæs(); aendringer.genindlæs(); },
    };
}
