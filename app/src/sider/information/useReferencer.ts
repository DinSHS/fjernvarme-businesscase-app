//-----------------------------------------------------------------------
// README's referencetal mod kørslerne i databasen, som React-hook. Den rene logik står i referencer.ts.
//
// Kodegennemgangen af runde 15, fund 6: kvalifikationen læser kørslens FROSNE input (KoerselInput), ikke det levende
// scenarie og dets nuværende ændringer. Kun rækkerne med kilde `scenarie`/`aendring` hentes — det er dem, reglen
// læser (opsætningen, solverens indstillinger og om noget blev ændret) — for de færdige kørsler af referencernes værker.
//-----------------------------------------------------------------------

import { useMemo } from "react";
import type { InputRække } from "@/lib/data/afflad";
import { useHent, useKoersler, useVaerker, type Hentet } from "@/lib/data/hooks";
import { læs } from "@/lib/data/laes";
import { useTekst } from "../dokumentation/tekster";
import { byggRaekker, kandidatKoersler, laesReferencer, type RefRække, type Reference } from "./referencer";

export interface Referencetal { raekker: RefRække[]; refs: Reference[] }

const BID = 50;

/** Det frosne input (uden værkets blade) pr. kørsels-id, hentet i bidder, så OR-filteret ikke bliver uendeligt langt. */
function useFrossetInput(ids: readonly string[] | undefined): Hentet<Map<string, InputRække[]>> {
    return useHent(ids && ids.length ? `referencetal-input:${ids.join(",")}` : null, async () => {
        const ud = new Map<string, InputRække[]>(ids!.map((id) => [id, []]));
        for (let i = 0; i < ids!.length; i += BID) {
            const bid = ids!.slice(i, i + BID);
            const rækker = await læs("KoerselInput", {
                filter: { and: [{ or: bid.map((id) => ({ koersel_id: { eq: id } })) }, { or: [{ kilde: { eq: "aendring" } }, { kilde: { eq: "scenarie" } }] }] },
            });
            for (const r of rækker) ud.get(r.koersel_id)?.push({ kilde: r.kilde, sti: r.sti, vaerdi_json: r.vaerdi_json });
        }
        return ud;
    });
}

/**
 * `data` er først sat, når ALT er hentet (værker, kørsler og deres frosne input): en halv sandhed her ville vise en
 * kørsel med ændringer som en ren reference i et øjeblik.
 */
export function useReferencetal(): Hentet<Referencetal> {
    const json = useTekst("viden/referencetal.json");
    const vaerker = useVaerker(true);
    const koersler = useKoersler({ status: ["faerdig"] });

    const refs = useMemo(() => {
        if (json.tekst === undefined) return undefined;
        try { return { refs: laesReferencer(json.tekst) }; } catch (e) { return { fejl: e instanceof Error ? e : new Error(String(e)) }; }
    }, [json.tekst]);

    const klar = vaerker.data && koersler.data && refs?.refs;
    const ids = useMemo(
        () => (klar ? kandidatKoersler(refs.refs, vaerker.data!, koersler.data!).map((k) => k.id).sort() : undefined),
        [klar, refs, vaerker.data, koersler.data],
    );
    // Ingen kandidater = intet at slå op (hooken henter ikke uden id'er); et tomt kort stilles til rådighed nedenfor.
    const input = useFrossetInput(ids);

    const fejl = json.fejl ?? refs?.fejl ?? vaerker.fejl ?? koersler.fejl ?? input.fejl;
    const inputKlar = ids !== undefined && (ids.length === 0 || input.data !== undefined);
    const data = useMemo<Referencetal | undefined>(() => {
        if (!klar || !inputKlar) return undefined;
        return { raekker: byggRaekker(refs.refs, vaerker.data!, koersler.data!, input.data ?? new Map()), refs: refs.refs };
    }, [klar, inputKlar, refs, vaerker.data, koersler.data, input.data]);

    return {
        data, fejl, indlæser: !data && !fejl,
        genindlæs: () => { vaerker.genindlæs(); koersler.genindlæs(); input.genindlæs(); },
    };
}
