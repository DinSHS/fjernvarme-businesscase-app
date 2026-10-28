//-----------------------------------------------------------------------
// Område e) Scenarier (fv-scenarie). Ruter:
//   #/scenarier                     oversigt + kø
//   #/scenarier/nyt[/<værkskode>]   nyt reference/scenarie-par fra et spørgsmål
//   #/scenarier/<scenarie_id>       redigér, kør, følg, sammenlign, arkivér
//   #/scenarier/arkiv[/<id>]        backup og flytning: eksport til Excel og genimport (runde 13)
//
// En bestilling går altid gennem `bestilKoersel` (src/lib/data/skriv.ts) med
// én klientnøgle pr. brugerhandling; status følges kun via useKoerselStatus.
//-----------------------------------------------------------------------

import type { OmraadeProps } from "../typer";
import Arkiv from "./Arkiv";
import NytScenarie from "./NytScenarie";
import Oversigt from "./Oversigt";
import ScenarieSide from "./ScenarieSide";
import "./scenarier.css";

export default function Scenarier(props: OmraadeProps) {
    const [første] = props.sti;
    if (første === "nyt") return <NytScenarie {...props} />;
    if (første === "arkiv") return <Arkiv {...props} />;
    if (første) return <ScenarieSide {...props} />;
    return <Oversigt {...props} />;
}
