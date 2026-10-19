//-----------------------------------------------------------------------
// Område c) Konfiguration (fv-konfig). Ruter:
//   #/konfiguration                              alle værker + "Kopiér værk" + "Nyt værk"
//   #/konfiguration/nyt                          guiden "Nyt værk fra bunden" (brief 15 B)
//   #/konfiguration/<kode>/kom-i-gang            efter oprettelse: [BEKRÆFT]-felter + prøvekørsel
//   #/konfiguration/<kode>[/<fane>[/<valg>]]     ét værk: enheder, lagre, priser, el, balancering,
//                                                varmelast, tid, meta, log, aendringer[/<koersel_id>],
//                                                kilde, ny-enhed; enheder/<navn> vælger en enhed
// Al skrivning går gennem gemVaerksaendringer/kopierVaerk (src/lib/data/skriv.ts),
// og værdier kodes med kodVaerdi — aldrig direkte.
//-----------------------------------------------------------------------

import "./konfiguration.css";
import type { OmraadeProps } from "../typer";
import Oversigt from "./Oversigt";
import { VaerkSide } from "./VaerkSide";
import NytVaerk from "./NytVaerk";

export default function Konfiguration(props: OmraadeProps) {
    const [kode, fane, valg] = props.sti;
    if (!kode) return <Oversigt {...props} />;
    // "nyt" er en reserveret kode (RESERVEREDE_KODER), så ruten kan ikke skygge for et værk.
    if (kode === "nyt") return <NytVaerk {...props} />;
    // key: et nyt værk = ny redigeringstilstand (et udkast må aldrig følge med til et andet værk).
    return <VaerkSide key={kode} kode={kode} fane={fane} valg={valg} gåTil={props.gåTil} bruger={props.bruger} />;
}
