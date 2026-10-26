//-----------------------------------------------------------------------
// Fælles layoutkomponenter. Alle sider bygges af disse — se AGENTS.md.
// Formen (størrelser, gitter) står i src/styles/layout.css; farverne er temaets
// tokens (src/styles/temaer/*.json, se app/TEMAER.md).
//-----------------------------------------------------------------------

import type { ReactNode } from "react";
import { CircleAlert, Inbox, RefreshCw } from "lucide-react";
import type { Hentet } from "@/lib/data/hooks";
import { STATUS_TEKST, STATUS_TONE } from "@/lib/data/koersel-status";
import type { KoerselStatus } from "../../../rayfin/data/fjv.constants";

// Temaet anvendes, så snart layoutet importeres (src/styles/tema.ts kører ved import).
export { TemaVaelger } from "./TemaVaelger";
export { Sidefod } from "./Sidefod";

/**
 * IBCS-titlen i tre linjer (UN 2.2, app/IBCS.md §4): hvem (værk + alle afgrænsninger), **hvad** (mål i fed + enhed),
 * hvornår (periode + scenarier). Rent beskrivende — vurderingen står i budskabet.
 */
export interface Titelblok { hvem: ReactNode; hvad: ReactNode; hvornaar: ReactNode }

/** Sidens ramme: område-mærke, titel, budskab (én sætning), IBCS-titelblok, handlinger, indhold. */
export function Side({ omraade, titel, budskab, titelblok, handlinger, children }: {
    omraade: string; titel: string; budskab?: ReactNode; titelblok?: Titelblok; handlinger?: ReactNode; children: ReactNode;
}) {
    return (
        <section className="fjv-side" data-layout="side">
            <header className="fjv-side-hoved">
                <span className="fjv-side-omraade">{omraade}</span>
                <h1 className="fjv-side-titel">{titel}</h1>
                {budskab && <p className="fjv-side-budskab">{budskab}</p>}
                {titelblok && (
                    <div className="fjv-titelblok" data-layout="titelblok">
                        <span data-linje="hvem">{titelblok.hvem}</span>
                        <span data-linje="hvad">{titelblok.hvad}</span>
                        <span data-linje="hvornaar">{titelblok.hvornaar}</span>
                    </div>
                )}
                {handlinger && <div className="fjv-side-handlinger">{handlinger}</div>}
            </header>
            {children}
        </section>
    );
}

export type Gitterform = "12" | "8-4" | "4-8" | "6-6" | "4-4-4" | "3-3-3-3" | "3-9";

/** Én række i 12-spalte-gitteret. Kortene i rækken bliver lige høje. */
export function Gitter({ form = "12", children }: { form?: Gitterform; children: ReactNode }) {
    return <div className={`fjv-gitter${form === "12" ? "" : ` fjv-gitter-${form}`}`}>{children}</div>;
}

/**
 * Et kort med IBCS-titel i to linjer: linje 1 = hvad (+ afgrænsning), linje 2 =
 * budskabet regnet af data. Fodnoten står altid nederst.
 */
export function Kort({ titel, afgraensning, budskab, handling, fod, children }: {
    titel: string; afgraensning?: string; budskab?: ReactNode; handling?: ReactNode; fod?: ReactNode; children?: ReactNode;
}) {
    return (
        <article className="fjv-kort" data-layout="kort">
            <div className="fjv-kort-hoved">
                <div className="fjv-kort-titelblok">
                    <h2 className="fjv-kort-titel" data-layout="kort-titel">
                        {titel}{afgraensning && <span className="fjv-afgraensning"> · {afgraensning}</span>}
                    </h2>
                    {budskab && <p className="fjv-kort-budskab" data-layout="kort-budskab">{budskab}</p>}
                </div>
                {handling}
            </div>
            {children && <div className="fjv-kort-indhold">{children}</div>}
            {fod && <div className="fjv-fod" data-layout="fodnote">{fod}</div>}
        </article>
    );
}

export interface Kolonne<T> {
    navn: string;
    vis: (r: T) => ReactNode;
    /** Højrestillet tal-kolonne. */
    tal?: boolean;
}

export function Tabel<T>({ rækker, kolonner, nøgle, valgt, onVælg, tom = "Ingen rækker." }: {
    rækker: readonly T[]; kolonner: readonly Kolonne<T>[]; nøgle: (r: T) => string;
    valgt?: string; onVælg?: (r: T) => void; tom?: string;
}) {
    if (rækker.length === 0) return <Tom>{tom}</Tom>;
    return (
        <div className="fjv-tabelrul">
            <table className="fjv-tabel" data-layout="tabel">
                <thead>
                    <tr>{kolonner.map((k) => <th key={k.navn} scope="col" className={k.tal ? "fjv-h" : undefined}>{k.navn}</th>)}</tr>
                </thead>
                <tbody>
                    {rækker.map((r) => {
                        const n = nøgle(r);
                        // En valgbar række kan også vælges med tastaturet (Tab, Enter/mellemrum) — ikke kun med musen.
                        return (
                            <tr key={n} data-valgbar={onVælg ? "true" : undefined} aria-selected={valgt === n ? true : undefined}
                                tabIndex={onVælg ? 0 : undefined}
                                onClick={onVælg ? () => onVælg(r) : undefined}
                                onKeyDown={onVælg ? (e) => {
                                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onVælg(r); }
                                } : undefined}>
                                {kolonner.map((k) => <td key={k.navn} className={k.tal ? "fjv-h" : undefined}>{k.vis(r)}</td>)}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/** Tom tilstand: viser roligt, hvor indholdet kommer, i stedet for en hvid plet. */
export function Tom({ children }: { children: ReactNode }) {
    return <div className="fjv-tom"><Inbox size={16} strokeWidth={1.75} aria-hidden="true" /><span>{children}</span></div>;
}

/** Fejltilstand: hvad gik galt (systemets besked) og hvad man kan gøre. */
export function Fejl({ titel = "Kunne ikke hente data", children, igen }: { titel?: string; children?: ReactNode; igen?: () => void }) {
    return (
        <div className="fjv-fejl" role="alert">
            <CircleAlert size={16} strokeWidth={2} aria-hidden="true" />
            <div className="fjv-fejl-tekst"><strong>{titel}</strong>{children}</div>
            {igen && <button type="button" className="fjv-knap" data-variant="sekundaer" onClick={igen}><RefreshCw size={14} strokeWidth={2} aria-hidden="true" />Prøv igen</button>}
        </div>
    );
}

/** Viser indlæsning/fejl for en hook; børnene får data når det er der. */
export function DataTilstand<T>({ h, children, højde = 120 }: { h: Hentet<T>; children: (data: T) => ReactNode; højde?: number }) {
    if (h.fejl) return <Fejl igen={h.genindlæs}>{h.fejl.message}</Fejl>;
    if (h.data === undefined) return <div className="fjv-skelet" style={{ height: højde }} aria-busy="true" aria-label="Henter data" />;
    return <>{children(h.data)}</>;
}

export function Maerke({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "advarsel" | "fejl"; children: ReactNode }) {
    return <span className="fjv-maerke" data-tone={tone}>{children}</span>;
}

export function StatusMaerke({ status }: { status: string }) {
    const s = status as KoerselStatus;
    return <Maerke tone={STATUS_TONE[s] ?? "neutral"}>{STATUS_TEKST[s] ?? status}</Maerke>;
}

export function Knap({ children, onClick, sekundaer, disabled, title }: {
    children: ReactNode; onClick?: () => void; sekundaer?: boolean; disabled?: boolean; title?: string;
}) {
    return (
        <button type="button" className="fjv-knap" data-variant={sekundaer ? "sekundaer" : undefined}
            onClick={onClick} disabled={disabled} title={title}>
            {children}
        </button>
    );
}
