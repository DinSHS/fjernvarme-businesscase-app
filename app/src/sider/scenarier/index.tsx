//-----------------------------------------------------------------------
// Område e) Scenarier (fv-scenarie). Ruter:
//   #/scenarier                     oversigt + kø
//   #/scenarier/nyt[/<værkskode>]   nyt reference/scenarie-par fra et spørgsmål
//   #/scenarier/<scenarie_id>       redigér, kør, følg, sammenlign, arkivér
//
// En bestilling går altid gennem `bestilKoersel` (src/lib/data/skriv.ts) med
// én klientnøgle pr. brugerhandling; status følges kun via useKoerselStatus.
//-----------------------------------------------------------------------

import type { OmraadeProps } from "../typer";
import NytScenarie from "./NytScenarie";
import Oversigt from "./Oversigt";
import ScenarieSide from "./ScenarieSide";
import "./scenarier.css";

export default function Scenarier(props: OmraadeProps) {
    const [første] = props.sti;
    if (første === "nyt") return <NytScenarie {...props} />;
    if (første) return <ScenarieSide {...props} />;
    return <Oversigt {...props} />;
}
