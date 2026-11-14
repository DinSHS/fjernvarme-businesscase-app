//-----------------------------------------------------------------------
// Data til #/analyser/anbefalinger og kørselslisten: kørslerne som `Side`
// (fuldt frosset input + nøgletal), værkernes [BEKRÆFT]-stier og koder, og
// scenarierne. Anbefalingssiden henter kun færdige kørsler; listen (brief 17)
// henter alle (`alle = true`) — nøgletal findes kun for de færdige. Bygget på
// fundamentets `useHent` + `læs` (pagineret, normaliseret). Ønske til
// fundamentet: hooks for input/nøgletal til mange kørsler (står i rapporten).
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { useHent, useKoersler, useScenarier, useVaerker, type Hentet } from "@/lib/data/hooks";
import { læs } from "@/lib/data/laes";
import type { InputRække } from "@/lib/data/afflad";
import type { FjvSchema } from "../../../rayfin/data/schema";
import { profil, samlNoegletal, type Noegletal, type Scenarie } from "./beregn";

type Vaerk = FjvSchema["Vaerk"];
import type { Side } from "./anbefaling";
import type { Tidsserienavne } from "./datagrundlag";
import { tidsserieIder, tidsserieShas, useTidsserienavne } from "./tidsserie-data";

const BID = 20;

export interface AnbefalingsData {
    sider: Side[];
    bekraeft: Map<string, Set<string>>;
    koder: Map<string, string>;
    referenceScenarie: Map<string, string | null>;
    scenarier: Map<string, Scenarie>;
    /** Navnene på de tidsserier, kørslerne har frosset (brief 18). */
    tidsserienavne: Tidsserienavne;
    /** Værkerne pr. id — README-mærket verificeres mod kilde og repo-commit (Codex K5-F9). */
    vaerker: Map<string, Vaerk>;
}

async function iBidder<T>(ids: readonly string[], hent: (bid: string[]) => Promise<T[]>): Promise<T[]> {
    const ud: T[] = [];
    for (let i = 0; i < ids.length; i += BID) ud.push(...await hent(ids.slice(i, i + BID)));
    return ud;
}

export function useAnbefalingsData(alle = false): Hentet<AnbefalingsData> {
    const koersler = useKoersler(alle ? {} : { status: ["faerdig"] });
    const scenarier = useScenarier(undefined, true);
    const vaerker = useVaerker(true);
    const ids = useMemo(() => (koersler.data ?? []).map((k) => k.id).sort(), [koersler.data]);
    const nøgle = koersler.data ? `anbefaling:${alle ? "alle" : "faerdige"}:${ids.join(",")}` : null;
    const rækker = useHent(nøgle, async () => {
        const ellerId = (bid: string[]) => ({ or: bid.map((id) => ({ koersel_id: { eq: id } })) });
        const [input, noegletal, bekraeft] = await Promise.all([
            iBidder(ids, (bid) => læs("KoerselInput", { filter: ellerId(bid) })),
            iBidder(ids, (bid) => læs("KoerselNoegletal", { filter: ellerId(bid) })),
            læs("VaerkParameter", { filter: { bekraeft: { eq: true } } }),
        ]);
        return { input, noegletal, bekraeft };
    });
    const ider = useMemo(() => tidsserieIder(rækker.data ? [rækker.data.input] : []), [rækker.data]);
    const shas = useMemo(() => tidsserieShas(rækker.data ? [rækker.data.input] : []), [rækker.data]);
    const navne = useTidsserienavne(ider, shas);
    const data = useMemo<AnbefalingsData | undefined>(() => {
        if (!koersler.data || !scenarier.data || !vaerker.data || !rækker.data || !navne.data) return undefined;
        const sc = new Map(scenarier.data.map((s) => [s.id, s]));
        const vk = new Map(vaerker.data.map((v) => [v.id, v]));
        const inp = new Map<string, InputRække[]>(), nt = new Map<string, Noegletal[]>();
        for (const r of rækker.data.input) { if (!inp.has(r.koersel_id)) inp.set(r.koersel_id, []); inp.get(r.koersel_id)!.push({ kilde: r.kilde, sti: r.sti, vaerdi_json: r.vaerdi_json }); }
        for (const r of rækker.data.noegletal) { if (!nt.has(r.koersel_id)) nt.set(r.koersel_id, []); nt.get(r.koersel_id)!.push(r); }
        const bekraeft = new Map<string, Set<string>>();
        for (const r of rækker.data.bekraeft) { if (!r.bekraeft) continue; if (!bekraeft.has(r.vaerk_id)) bekraeft.set(r.vaerk_id, new Set()); bekraeft.get(r.vaerk_id)!.add(r.sti); }
        const sider = koersler.data.map((k): Side => {
            const input = inp.get(k.id) ?? [];
            const s = sc.get(k.scenarie_id) ?? null;
            const vaerkNavn = vk.get(k.vaerk_id)?.navn ?? "ukendt værk";
            return { k, navn: s?.navn ?? `Kørsel ${k.id.slice(0, 8)}`, vaerkNavn, input, samlet: samlNoegletal(nt.get(k.id) ?? []), profil: profil(k, vaerkNavn, s, input), tidsserienavne: navne.data };
        });
        return {
            sider, bekraeft,
            koder: new Map(vaerker.data.map((v) => [v.id, v.kode])),
            referenceScenarie: new Map(scenarier.data.map((s) => [s.id, s.reference_scenarie_id ?? null])),
            scenarier: sc,
            tidsserienavne: navne.data,
            vaerker: vk,
        };
    }, [koersler.data, scenarier.data, vaerker.data, rækker.data, navne.data]);
    return {
        data,
        fejl: koersler.fejl ?? scenarier.fejl ?? vaerker.fejl ?? rækker.fejl,
        indlæser: koersler.indlæser || scenarier.indlæser || vaerker.indlæser || rækker.indlæser,
        genindlæs: () => { koersler.genindlæs(); scenarier.genindlæs(); vaerker.genindlæs(); rækker.genindlæs(); },
    };
}
