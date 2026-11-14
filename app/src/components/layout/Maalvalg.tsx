//-----------------------------------------------------------------------
// Sammensætningens målvalg (runde 11): MWh · % af total ved kortets titel,
// samme segmenterede knap som farvevalget. Logikken står i src/lib/energimaal.ts.
//-----------------------------------------------------------------------

import { useSyncExternalStore } from "react";
import { abonnerMaal, laesMaal, MAAL, saetMaal, STANDARD_MAAL, type Maal } from "@/lib/energimaal";

/** Brugerens mål for sammensætningen; fælles for alle sammensætninger på alle sider. */
export function useMaal(): Maal {
    return useSyncExternalStore(abonnerMaal, laesMaal, () => STANDARD_MAAL);
}

const ETIKET: Record<Maal, string> = { mwh: "MWh", andel: "% af total" };
const FORKLARING: Record<Maal, string> = {
    mwh: "Produktionen i energi (MWh, eller GWh når tallene bliver store)",
    andel: "Hver søjle = 100 %: enhedens andel af søjlens samlede produktion",
};

export function MaalValg() {
    const m = useMaal();
    return (
        <div className="fjv-farvevalg" role="group" aria-label="Mål i sammensætningen" data-maal={m}>
            {MAAL.map((x) => (
                <button key={x} type="button" aria-pressed={m === x} title={FORKLARING[x]} onClick={() => saetMaal(x)}>{ETIKET[x]}</button>
            ))}
        </div>
    );
}
