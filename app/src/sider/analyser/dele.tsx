//-----------------------------------------------------------------------
// Små, fælles byggeklodser for analysesiderne (kun komponenter).
//-----------------------------------------------------------------------

import type { ReactNode } from "react";
import { Maerke } from "@/components/layout";
import { rutehref } from "@/lib/rute";

/** Navn/værdi-par som definitionsliste. */
export function Fakta({ par }: { par: readonly (readonly [string, ReactNode] | null | false)[] }) {
    return (
        <dl className="fjv-a-fakta">
            {par.filter((p): p is readonly [string, ReactNode] => !!p).map(([n, v]) => (
                <div key={n} style={{ display: "contents" }}><dt>{n}</dt><dd>{v}</dd></div>
            ))}
        </dl>
    );
}

/** Kort commit med det fulde SHA i title. */
export function Commit({ sha }: { sha: string | null | undefined }) {
    if (!sha) return <span className="fjv-a-svag">ukendt</span>;
    return <span className="fjv-a-tag" title={sha}>{sha.slice(0, 7)}</span>;
}

export function KoerselLink({ id, children }: { id: string; children: ReactNode }) {
    return <a className="fjv-a-link" href={rutehref("analyser", id)}>{children}</a>;
}

/** Spor A/B-mærket på balancetal. */
export function SporMaerke({ spor }: { spor: "A" | "B" }) {
    return spor === "A"
        ? <Maerke tone="advarsel">Spor A · øvre grænse, ikke en prognose</Maerke>
        : <Maerke>Spor B · beskrivende, forudsiger ikke</Maerke>;
}
