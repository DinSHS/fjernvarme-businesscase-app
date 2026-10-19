//-----------------------------------------------------------------------
// Område d) Analyser (fv-analyse). Ruter — andre områder må linke hertil:
//
//   #/analyser                          kørselsliste, grupperet pr. spørgsmål
//   #/analyser/kronologisk              kørselsliste uden grupper
//   #/analyser/<grupperet|kronologisk>/<kolonne>/<op|ned>   sorteret (kan linkes)
//   #/analyser/<koersel_id>             én kørsel
//   #/analyser/<koersel_id>/sammenlign  én kørsel med listen "hvad kan den sammenlignes med?" åben
//   #/analyser/sammenlign/<a>/<b>       sammenligning; a = reference, b = scenarie, Δ = b − a
//   #/analyser/anbefalinger             "hvad bør vi gøre?": alle par med anbefaling og historie
//-----------------------------------------------------------------------

import type { OmraadeProps } from "../typer";
import KoerselSide from "./koersel";
import Anbefalinger from "./anbefalinger";
import Liste from "./liste";
import { læsSortering } from "./liste-visning";
import Sammenlign from "./sammenlign";
import "./analyser.css";

export default function Analyser({ sti, gåTil }: OmraadeProps) {
    let indhold;
    if (sti[0] === "sammenlign" && sti[1] && sti[2]) indhold = <Sammenlign key={`${sti[1]}/${sti[2]}`} a={sti[1].toLowerCase()} b={sti[2].toLowerCase()} gåTil={gåTil} />;
    else if (sti[0] === "anbefalinger") indhold = <Anbefalinger gåTil={gåTil} />;
    else if (sti[0] === "kronologisk" || sti[0] === "grupperet") indhold = <Liste gåTil={gåTil} kronologisk={sti[0] === "kronologisk"} sortering={læsSortering(sti[1], sti[2])} />;
    else if (sti[0] && sti[0] !== "sammenlign") indhold = <KoerselSide key={sti[0]} id={sti[0].toLowerCase()} gåTil={gåTil} sammenlign={sti[1] === "sammenlign"} />;
    else indhold = <Liste gåTil={gåTil} />;
    return <div className="fjv-analyse">{indhold}</div>;
}
