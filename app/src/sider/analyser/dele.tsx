//-----------------------------------------------------------------------
// Små, fælles byggeklodser for analysesiderne (kun komponenter).
//-----------------------------------------------------------------------

import type { ReactNode } from "react";
import { Maerke } from "@/components/layout";
import { rutehref } from "@/lib/rute";
import { kodeOprindelse, stoppetPaaTid } from "./beregn";

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

/**
 * En færdig kørsel, der stoppede på solverens tidsgrænse, er ikke bare "Færdig" (runde 15, mail 1: "tjek også en
 * kørsel, der stoppede på tidsgrænsen"): løsningen er den bedste fundne, ikke bevist optimal. Vises ved statusmærket.
 */
export function TidsgraenseMaerke({ k }: { k: { status: string; solve_status?: string | null } }) {
    if (k.status !== "faerdig" || !stoppetPaaTid(k.solve_status)) return null;
    return <Maerke tone="advarsel">Stoppet på tidsgrænsen</Maerke>;
}

/** Advarslen, når kørslens modelkode eller df-data ikke er hentet som zip af regnemotoren (fund 3.6; beregn.ts › kodeOprindelse). */
export function KodeOprindelse({ miljoe_json }: { miljoe_json: string | null | undefined }) {
    const { advarsler } = kodeOprindelse(miljoe_json);
    if (advarsler.length === 0) return null;
    return <p className="fjv-tilstand" data-tone="advarsel" role="status">{advarsler.join(" ")}</p>;
}

/** Spor A/B-mærket på balancetal. */
export function SporMaerke({ spor }: { spor: "A" | "B" }) {
    return spor === "A"
        ? <Maerke tone="advarsel">Spor A · øvre grænse, ikke en prognose</Maerke>
        : <Maerke>Spor B · beskrivende, forudsiger ikke</Maerke>;
}
