//-----------------------------------------------------------------------
// Den faste kreditlinje i sidefoden (alle sider). Skal placeres af app-skallen (fv-app): <Kreditlinje /> nederst i layoutet.
// Teksten og linkene står i kredit.ts.
//-----------------------------------------------------------------------

import { KREDITLINJE, KREDITLINJE_TEKST } from "./kredit";
import "./kredit.css";

export function Kreditlinje() {
    return (
        <footer className="fjv-kredit" data-layout="kredit" aria-label="Kredit" title={KREDITLINJE_TEKST}>
            <p>
                {KREDITLINJE.map((d, i) => d.href
                    ? <a key={i} href={d.href} {...(d.ekstern ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{d.tekst}</a>
                    : <span key={i}>{d.tekst}</span>)}
            </p>
        </footer>
    );
}
