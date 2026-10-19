//-----------------------------------------------------------------------
// Data til kandidatlisten (brief 14): alle kørsler, deres scenarier og værker,
// og hver kørsels EGNE frosne inputrækker (kilde aendring/scenarie — ikke
// værkets blade, så det er få rækker pr. kørsel).
//
// Bygget på fundamentets `useHent` + `læs` (pagineret og normaliseret), ikke på
// klienten direkte. Der findes ingen hook for input til mange kørsler; ønsket
// står i rapporten (useKoerselInputFor).
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { useHent, useKoersler, useScenarier, useVaerker, type Hentet } from "@/lib/data/hooks";
import { læs } from "@/lib/data/laes";
import type { InputRække } from "@/lib/data/afflad";
import type { KoerselInfo } from "./kandidater";

const BID = 50;

type EgenRække = InputRække & { koersel_id: string };

/** Kun kørslens egne rækker: det er dem, der beskriver ændringer, periode og balancering. */
export function egneRaekker(input: readonly InputRække[]): InputRække[] {
    return input.filter((r) => r.kilde !== "vaerk");
}

export function useKandidatInfo(): Hentet<KoerselInfo[]> {
    const koersler = useKoersler({});
    const scenarier = useScenarier(undefined, true);
    const vaerker = useVaerker(true);
    const ids = useMemo(() => (koersler.data ?? []).map((k) => k.id).sort(), [koersler.data]);
    const input = useHent(koersler.data ? `kandidat-input:${ids.join(",")}` : null, async () => {
        const ud: EgenRække[] = [];
        for (let i = 0; i < ids.length; i += BID) {
            const bid = ids.slice(i, i + BID);
            const rækker = await læs("KoerselInput", {
                filter: { and: [{ or: bid.map((id) => ({ koersel_id: { eq: id } })) }, { or: [{ kilde: { eq: "aendring" } }, { kilde: { eq: "scenarie" } }] }] },
            });
            ud.push(...rækker);
        }
        return ud;
    });
    const data = useMemo<KoerselInfo[] | undefined>(() => {
        if (!koersler.data || !scenarier.data || !vaerker.data || !input.data) return undefined;
        const sc = new Map(scenarier.data.map((s) => [s.id, s]));
        const vk = new Map(vaerker.data.map((v) => [v.id, v.navn]));
        const pr = new Map<string, InputRække[]>();
        for (const r of input.data) {
            if (r.kilde === "vaerk") continue;   // den falske klient forstår ikke alle filtre; tjek igen
            if (!pr.has(r.koersel_id)) pr.set(r.koersel_id, []);
            pr.get(r.koersel_id)!.push({ kilde: r.kilde, sti: r.sti, vaerdi_json: r.vaerdi_json });
        }
        return koersler.data.map((k) => ({ k, scenarie: sc.get(k.scenarie_id) ?? null, vaerkNavn: vk.get(k.vaerk_id) ?? "ukendt værk", input: pr.get(k.id) ?? [] }));
    }, [koersler.data, scenarier.data, vaerker.data, input.data]);
    return {
        data,
        fejl: koersler.fejl ?? scenarier.fejl ?? vaerker.fejl ?? input.fejl,
        indlæser: koersler.indlæser || scenarier.indlæser || vaerker.indlæser || input.indlæser,
        genindlæs: () => { koersler.genindlæs(); scenarier.genindlæs(); vaerker.genindlæs(); input.genindlæs(); },
    };
}
