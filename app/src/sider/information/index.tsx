//-----------------------------------------------------------------------
// Område b) Information — metoden, begreberne, referencetallene, datadækningen og begrænsningerne.
//
//   #/information                       forside
//   #/information/<emne>                et emne (se emner.ts)
//   #/information/ordliste#<anker>      et fagord i ordlisten (se ordliste-anker.ts)
//-----------------------------------------------------------------------

import { Gitter, Kort, Side } from "@/components/layout";
import { rutehref } from "@/lib/rute";
import type { OmraadeProps } from "../typer";
import { delAnker } from "../dokumentation/hjaelp";
import { LinkKnap } from "../dokumentation/komponenter";
import { EmneRamme, Emneliste } from "./EmneRamme";
import { EmneTekstKort } from "./EmneSide";
import { begraensningerBudskab } from "./begraensninger";
import { useEmneTekst } from "./emneTekst";
import { Forside } from "./Forside";
import { DatadaekningSide, FabricSide } from "./DriftSide";
import { OrdlisteSide } from "./OrdlisteSide";
import { ReferencetalSide } from "./ReferencetalSide";
import { emneFraId, useEmner, type Emne } from "./emner";

function Emnet({ emne, emner, anker }: { emne: Emne; emner: readonly Emne[]; anker: string | undefined }) {
    switch (emne.id) {
        case "ordliste": return <OrdlisteSide emne={emne} emner={emner} anker={anker} />;
        case "referencetal": return <ReferencetalSide emne={emne} emner={emner} anker={anker} />;
        case "datadaekning": return <DatadaekningSide emne={emne} emner={emner} anker={anker} />;
        case "fabric-og-kapacitet": return <FabricSide emne={emne} emner={emner} anker={anker} />;
        default: return <AlmindeligtEmne emne={emne} emner={emner} anker={anker} />;
    }
}

function AlmindeligtEmne({ emne, emner, anker }: { emne: Emne; emner: readonly Emne[]; anker: string | undefined }) {
    const tekst = useEmneTekst(emne, anker);
    const budskab = emne.id === "begraensninger" && tekst.hentet.data ? begraensningerBudskab(tekst.hentet.data.blokke) : tekst.budskab;
    return (
        <EmneRamme emne={emne} emner={emner} budskab={budskab}>
            <EmneTekstKort emne={emne} emner={emner} tekst={tekst} />
        </EmneRamme>
    );
}

export default function Information({ sti }: OmraadeProps) {
    const [id, anker] = delAnker(sti[0]);
    const e = useEmner();

    if (e.fejl) {
        return (
            <Side omraade="Information" titel="Metode og begreber" budskab="Emnelisten kunne ikke indlæses.">
                <Gitter form="12"><Kort titel="Fejl"><p className="fjv-tilstand" data-tone="fejl" role="alert">{e.fejl.message}</p></Kort></Gitter>
            </Side>
        );
    }
    if (!e.emner) {
        return (
            <Side omraade="Information" titel="Metode og begreber" budskab="Henter emnerne …">
                <Gitter form="12"><Kort titel="Emner"><div className="fjv-skelet" style={{ height: 160 }} aria-busy="true" /></Kort></Gitter>
            </Side>
        );
    }
    if (!id) return <Forside emner={e.emner} />;

    const emne = emneFraId(e.emner, id);
    if (!emne) {
        return (
            <Side omraade="Information" titel="Emnet findes ikke" budskab={`Der er intet emne med navnet «${id}».`}
                handlinger={<LinkKnap href={rutehref("information")}>← Oversigt</LinkKnap>}>
                <Gitter form="3-9">
                    <Emneliste emner={e.emner} />
                    <Kort titel="Prøv et af emnerne til venstre" budskab="Linket er forkert, eller emnet er omdøbt." />
                </Gitter>
            </Side>
        );
    }
    return <Emnet emne={emne} emner={e.emner} anker={anker} />;
}
