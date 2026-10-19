//-----------------------------------------------------------------------
// Ankerformat for fagord — så andre sider kan linke til ordlisten.
//
//   #/information/ordliste#<anker>        <anker> = ordAnker(ord)
//
//   ordAnker("aFRR")        -> "afrr"
//   ordAnker("Spor A")      -> "spor-a"
//   ordAnker("CM-pris")     -> "cm-pris"
//   ordAnker("Månedsloft")  -> "månedsloft"
//
// Små bogstaver; mellemrum og `_` bliver `-`; alt andet end bogstaver, cifre og `-` fjernes (æøå og Δ bevares).
// Står flere navne på ét ord i ordlisten ("Gab (solvergab, MIP-gab)"), virker hvert af dem som anker.
// Et ukendt anker viser blot ordlisten uden markering.
//
//   <a href={ordlisteHref("aFRR")}>aFRR</a>
//-----------------------------------------------------------------------

import { ordAnker } from "../dokumentation/markdown/parse";

export { ordAnker };

/** Hash-link til et fagord i ordlisten. Ankeret står efter ruteleddets egen `#` (se `delAnker`). */
export function ordlisteHref(ord: string): string {
    return `#/information/ordliste#${ordAnker(ord)}`;
}
