//-----------------------------------------------------------------------
// Analysernes datasamling oven på fundamentets hooks (ingen egne kald mod
// databasen). Én "pakke" pr. kørsel: kørslen (med levende status),
// nøgletal, måneder, frosset input, værk og scenarie.
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { useKoersel, useKoerselInput, useKoerselStatus, useMaaneder, useNoegletal, useScenarie, useVaerk } from "@/lib/data/hooks";
import type { Hentet } from "@/lib/data/hooks";
import {
    maanedstabel, profil, samlNoegletal, vaerketsObjekter, type Koersel, type Maanedstabel, type Profil, type Samlet, type Scenarie,
} from "./beregn";
import type { Side } from "./anbefaling";
import type { Tidsserienavne } from "./datagrundlag";
import { tidsserieIder, useTidsserienavne } from "./tidsserie-data";

/** En pakke som anbefalingens `Side` (anbefaling.ts). */
export function tilSide(p: Pakke): Side {
    return { k: p.k, navn: p.scenarie?.navn ?? `Kørsel ${p.k.id.slice(0, 8)}`, vaerkNavn: p.vaerkNavn, input: p.input, samlet: p.samlet, profil: p.profil, tidsserienavne: p.tidsserienavne };
}

export interface Pakke {
    k: Koersel;
    vaerkNavn: string;
    /** Værkets kode (til links ind i Scenarier, fx #/scenarier/nyt/<kode>/<knap>). */
    vaerkKode: string | null;
    scenarie: Scenarie | null;
    samlet: Samlet;
    maaneder: Maanedstabel;
    input: FjvInput[];
    profil: Profil;
    objekter: { enheder: string[]; lagre: string[] };
    /** Navnene på kørslens frosne tidsserier (brief 18). */
    tidsserienavne: Tidsserienavne;
}

type FjvInput = { kilde: "vaerk" | "aendring" | "scenarie"; sti: string; vaerdi_json: string };

/**
 * Alt om én kørsel som én Hentet. Status holdes levende efter §6 (kun mens
 * kørslen er aktiv og fanen synlig). Resultaterne hentes først, når kørslen er
 * færdig — før det er der intet at vise, og intet at hente.
 */
export function usePakke(id: string | undefined): Hentet<Pakke | null> & { koersel: Koersel | null } {
    const kh = useKoersel(id);
    const levende = useKoerselStatus(kh.data ? [kh.data] : undefined)[0] ?? kh.data ?? null;
    const færdig = levende?.status === "faerdig" ? id : undefined;
    const nh = useNoegletal(færdig);
    const mh = useMaaneder(færdig);
    const ih = useKoerselInput(id);
    const vh = useVaerk(levende?.vaerk_id);
    const sh = useScenarie(levende?.scenarie_id);
    const ider = useMemo(() => tidsserieIder(ih.data ? [ih.data] : []), [ih.data]);
    const th = useTidsserienavne(ider);

    const data = useMemo<Pakke | null | undefined>(() => {
        if (kh.data === null) return null;
        if (!levende || !ih.data || vh.data === undefined || sh.data === undefined || !th.data) return undefined;
        if (færdig && (!nh.data || !mh.data)) return undefined;
        const vaerkNavn = vh.data?.navn ?? "ukendt værk";
        return {
            k: levende, vaerkNavn, vaerkKode: vh.data?.kode ?? null, scenarie: sh.data,
            samlet: samlNoegletal(nh.data ?? []),
            maaneder: maanedstabel(mh.data ?? []),
            input: ih.data,
            profil: profil(levende, vaerkNavn, sh.data, ih.data),
            objekter: vaerketsObjekter(ih.data),
            tidsserienavne: th.data,
        };
    }, [kh.data, levende, færdig, nh.data, mh.data, ih.data, vh.data, sh.data, th.data]);

    const fejl = kh.fejl ?? ih.fejl ?? vh.fejl ?? sh.fejl ?? nh.fejl ?? mh.fejl;
    const genindlæs = () => { kh.genindlæs(); nh.genindlæs(); mh.genindlæs(); ih.genindlæs(); vh.genindlæs(); sh.genindlæs(); };
    return {
        data, fejl, koersel: levende,
        indlæser: kh.indlæser || nh.indlæser || mh.indlæser || ih.indlæser || vh.indlæser || sh.indlæser,
        genindlæs,
    };
}
