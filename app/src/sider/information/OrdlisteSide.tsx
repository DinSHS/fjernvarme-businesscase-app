//-----------------------------------------------------------------------
// Ordlisten: søgbar, med et anker pr. navn (#/information/ordliste#<anker>, se ordliste-anker.ts).
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { DataTilstand, Gitter, Kort } from "@/components/layout";
import { Inl } from "../dokumentation/markdown/Markdown";
import { useRulTilAnker } from "../dokumentation/hjaelp";
import { EmneRamme } from "./EmneRamme";
import type { Emne } from "./emner";
import { filtrer, linkKursiveHenvisninger, postForAnker, type Ordpost } from "./ordliste";
import { useOrdposter } from "./useOrdposter";
import { flertal } from "./tal";

const ORD_PREFIX = "o-";
const intetLink = (href: string) => ({ href, ekstern: /^https?:/.test(href) });

function Post({ p, alle, maal }: { p: Ordpost; alle: readonly Ordpost[]; maal: boolean }) {
    const forklaring = useMemo(() => linkKursiveHenvisninger(p.forklaring, alle, p), [p, alle]);
    return (
        <div className="fjv-ord" data-maal={maal ? "true" : undefined} id={ORD_PREFIX + p.ankre[0]} data-layout="ordpost">
            {/* Ét usynligt anker pr. ekstra navn, så alle navne kan linkes til. */}
            {p.ankre.slice(1).map((a) => <span key={a} id={ORD_PREFIX + a} className="fjv-ord-aliasanker" />)}
            <dt><a href={`#/information/ordliste#${p.ankre[0]}`}>{p.ord}</a></dt>
            <dd><Inl b={forklaring} link={intetLink} /></dd>
        </div>
    );
}

export function OrdlisteSide({ emne, emner, anker }: { emne: Emne; emner: readonly Emne[]; anker: string | undefined }) {
    const poster = useOrdposter();
    const [soeg, setSoeg] = useState("");
    const alle = useMemo(() => poster.data ?? [], [poster.data]);
    const synlige = useMemo(() => filtrer(alle, soeg), [alle, soeg]);
    const maal = postForAnker(alle, anker);
    useRulTilAnker(anker, "ordliste", poster.data !== undefined, ORD_PREFIX);

    const budskab = poster.data
        ? soeg.trim()
            ? `${flertal(synlige.length, "fagord", "fagord")} passer på «${soeg.trim()}» — af ${poster.data.length}.`
            : `${flertal(poster.data.length, "fagord", "fagord")} forklaret på dansk, med kilde — søg på ord eller forklaring.`
        : "Fagord forklaret på dansk, med kilde.";

    return (
        <EmneRamme emne={emne} emner={emner} budskab={budskab}>
            <Gitter form="12">
                <Kort titel="Fagord" afgraensning="A–Å" budskab={poster.data ? `${poster.data.length} ord · ${synlige.length} vises` : undefined}
                    fod="Kilderne står i forklaringerne. Et fagord andre steder i appen kan linke hertil med #/information/ordliste#<ord> (små bogstaver, mellemrum som bindestreg).">
                    <div className="fjv-soeg">
                        <label className="fjv-tilstand" htmlFor="ordliste-soeg">Søg</label>
                        <input id="ordliste-soeg" className="fjv-felt" type="search" value={soeg} placeholder="fx gab, tank, aFRR …"
                            onChange={(e) => setSoeg(e.target.value)} autoComplete="off" />
                    </div>
                    <DataTilstand h={poster} højde={240}>
                        {() => synlige.length === 0
                            ? <p className="fjv-tilstand">Ingen fagord passer på «{soeg.trim()}». Prøv et kortere ord.</p>
                            : (
                                <dl className="fjv-ordliste">
                                    {synlige.map((p) => <Post key={p.ankre[0]} p={p} alle={alle} maal={maal === p} />)}
                                </dl>
                            )}
                    </DataTilstand>
                </Kort>
            </Gitter>
        </EmneRamme>
    );
}

