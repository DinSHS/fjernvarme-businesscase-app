//-----------------------------------------------------------------------
// Små byggesten kun scenarierne bruger: formularfelter og fundlister.
// Hjælpefunktionerne står i hjaelp.ts.
//-----------------------------------------------------------------------

import type { ReactNode } from "react";
import type { Fund } from "./logik";

export function Felt({ etiket, hjælp, bred, children }: { etiket: string; hjælp?: ReactNode; bred?: boolean; children: ReactNode }) {
    return (
        <label className={`fs-felt${bred ? " fs-felt-bred" : ""}`}>
            <span>{etiket}</span>
            {children}
            {hjælp && <small>{hjælp}</small>}
        </label>
    );
}

export function Fundliste({ fund }: { fund: readonly Fund[] }) {
    if (fund.length === 0) return null;
    return (
        <ul className="fs-fund" role="status">
            {fund.map((f, i) => <li key={i} data-niveau={f.niveau}>{f.tekst}</li>)}
        </ul>
    );
}
