//-----------------------------------------------------------------------
// Kørselslistens tabel (brief 17): grupperet eller kronologisk, alle kolonner
// sorterbare (klik på overskriften), forklaring (ⓘ) pr. kolonne med link til
// ordlisten, "Flere kolonner" og et kort pr. kørsel på smal skærm.
//
// Egen komponent i området: fundamentets `Tabel` har ingen grupperækker og
// ingen klikbare overskrifter. Klasserne (`fjv-tabel`, data-layout="tabel")
// er fundamentets, så typografi og layout-tjek er de samme.
//-----------------------------------------------------------------------

import type { ReactNode } from "react";
import { Maerke, StatusMaerke } from "@/components/layout";
import { tal, tidspunkt } from "@/lib/format";
import { absolutGab, koerselsVarighed, modtaget, type Koersel } from "./beregn";
import { gabPct, varighed } from "./fmt";
import { ANKRE, KOLONNE_FORKLARING, ordHref } from "./liste-tekster";
import { KOLONNER, type Kol } from "./liste-visning";
import { deltaOrd, type Gruppe, type ListeRaekke, type Sortering } from "./sammensaetning";


const stop = (e: React.MouseEvent) => e.stopPropagation();

/** `indryk`: dybden i familiens træ vises kun, når rækkerne står i træets rækkefølge. */
function Navn({ r, indryk }: { r: ListeRaekke; indryk: boolean }) {
    const d = indryk ? r.dybde : 0;
    return (
        <div className="fjv-a-kl-navn" data-dybde={d || undefined} style={{ marginLeft: d ? `${(d - 1) * 12}px` : undefined }}>
            <span className="fjv-a-kl-titel">{r.scenarie?.navn ?? r.side.navn}</span>
            {r.spoergsmaal && <span className="fjv-a-kl-spm">{r.spoergsmaal}</span>}
            <span className="fjv-a-kl-lille fjv-a-svag">{r.side.vaerkNavn}</span>
        </div>
    );
}

function Oprindelse({ r }: { r: ListeRaekke }) {
    const o = r.oprindelse;
    const tone = o.type === "roegtest" ? "advarsel" : o.type === "readme" ? "ok" : "neutral";
    return (
        <div className="fjv-a-kl-stak">
            <Maerke tone={tone}>{o.etiket}</Maerke>
            {o.detalje && <span className="fjv-a-kl-lille fjv-a-svag" title={o.readme ? `README-referencetal: ${o.readme.navn} (${o.readme.vindue})` : undefined}>{o.detalje}</span>}
        </div>
    );
}

function Markeder({ r }: { r: ListeRaekke }) {
    const m = r.markeder;
    return (
        <div className="fjv-a-kl-stak">
            <span>{m.tekst}</span>
            {m.spor && <a className="fjv-a-kl-lille fjv-a-link" href={ordHref(m.spor === "A" ? ANKRE.sporA : ANKRE.sporB)} onClick={stop}
                title={m.spor === "A" ? "Spor A: en øvre grænse ved fri reservation" : "Spor B: med værkets faktiske reservation som loft"}>Spor {m.spor}</a>}
        </div>
    );
}

function Delta({ r }: { r: ListeRaekke }) {
    const t = deltaOrd(r.delta);
    if (t === null) return <span className="fjv-a-svag">–</span>;
    // "44.220 kr." over "dyrere": to linjer holder kolonnen smal.
    const m = /^(.* kr\.) (dyrere|billigere)$/.exec(t);
    return (
        <span className={`fjv-a-kl-delta ${r.delta! < 0 ? "fjv-a-pos" : r.delta! > 0 ? "fjv-a-neg" : ""}`}>
            {m ? <><span>{m[1]}</span><span>{m[2]}</span></> : t}
        </span>
    );
}

/** Cellernes indhold pr. kolonne-id (kolonnernes navne og rækkefølge: `KOLONNER` i liste-visning.ts). */
const VIS: Record<string, (r: ListeRaekke, k: Koersel, indryk: boolean) => ReactNode> = {
    spoergsmaal: (r, _k, indryk) => <Navn r={r} indryk={indryk} />,
    aendringer: (r) => <span className="fjv-a-kl-aendr">{r.aendringer}</span>,
    rolle: (r) => <span className={r.rolle.type === "gentagelse" ? "fjv-a-svag" : undefined}>{r.rolle.tekst}</span>,
    oprindelse: (r) => <Oprindelse r={r} />,
    periode: (r) => <div className="fjv-a-kl-stak"><span>{r.periode.laengde ?? "–"}</span><span className="fjv-a-kl-lille fjv-a-svag">{r.periode.datoer}</span></div>,
    markeder: (r) => <Markeder r={r} />,
    varmelast: (r) => (
        <div className="fjv-a-kl-stak" title={r.varmelast.sha256 ? `sha256 ${r.varmelast.sha256}` : r.varmelast.maalt ? undefined : "Regnet af udetemperaturen"}>
            <span>{r.varmelast.tekst}</span>
            {r.varmelast.navn && <span className="fjv-a-kl-lille fjv-a-svag fjv-a-kl-fil">{r.varmelast.navn}</span>}
        </div>
    ),
    objektiv: (_r, k) => (k.objektiv_dkk == null ? "–" : tal(k.objektiv_dkk)),
    delta: (r) => <Delta r={r} />,
    anbefaling: (r) => (r.vurdering ? <Maerke tone={r.vurdering.tone}>{r.vurdering.maerke}</Maerke> : <span className="fjv-a-svag">–</span>),
    status: (_r, k) => <StatusMaerke status={k.status} />,
    vaerk: (r) => r.side.vaerkNavn,
    modtaget: (_r, k) => tidspunkt(modtaget(k)),
    gab: (_r, k) => { const g = absolutGab(k); return k.opnaaet_gap != null ? gabPct(k.opnaaet_gap) : g.rel != null ? `≤ ${gabPct(g.rel)}` : "–"; },
    varighed: (_r, k) => { const v = koerselsVarighed(k); return v == null ? "–" : varighed(v); },
    bestilt_af: (_r, k) => `${k.bestilt_af}${k.kilde === "notebook" ? " · notebook" : ""}`,
};

export interface TabelProps {
    grupper: readonly Gruppe[] | null;
    raekker: readonly ListeRaekke[];
    flere: boolean;
    sortering: Sortering | null;
    onSorter: (kolonne: string) => void;
    valgte: readonly string[];
    onVaelg: (id: string) => void;
    onAabn: (id: string) => void;
    /** Levende status pr. kørsels-id. */
    levende: ReadonlyMap<string, Koersel>;
}

function Overskrift({ k, sortering, onSorter }: { k: Kol; sortering: Sortering | null; onSorter: (k: string) => void }) {
    const aktiv = sortering?.kolonne === k.id;
    const f = KOLONNE_FORKLARING[k.id];
    return (
        <th className={k.tal ? "fjv-h" : undefined} aria-sort={aktiv ? (sortering!.retning === 1 ? "ascending" : "descending") : "none"} data-kolonne={k.id}>
            <span className="fjv-a-kl-th">
                <button type="button" className="fjv-a-kl-sort" onClick={() => onSorter(k.id)}
                    title={`Sortér efter ${k.navn.toLowerCase()}${aktiv ? (sortering!.retning === 1 ? " (faldende)" : " (stigende)") : ""}`}>
                    {k.navn}<span className="fjv-a-kl-pil" aria-hidden="true">{aktiv ? (sortering!.retning === 1 ? " ▲" : " ▼") : " ↕"}</span>
                </button>
                {f && (f.href
                    ? <a className="fjv-a-kl-info" href={f.href} title={f.tekst} aria-label={`Forklaring: ${k.navn}`}>ⓘ</a>
                    : <span className="fjv-a-kl-info" title={f.tekst} aria-label={`Forklaring: ${k.navn}`} role="img">ⓘ</span>)}
            </span>
        </th>
    );
}

export function KoerselTabel({ grupper, raekker, flere, sortering, onSorter, valgte, onVaelg, onAabn, levende }: TabelProps) {
    const kolonner = KOLONNER.filter((k) => flere || !k.flere);
    const indryk = !sortering || sortering.kolonne === "spoergsmaal";
    const n = kolonner.length + 1;
    const række = (r: ListeRaekke) => {
        const k = levende.get(r.k.id) ?? r.k;
        return (
            <tr key={r.k.id} data-valgbar="true" aria-selected={valgte.includes(r.k.id) ? true : undefined} onClick={() => onAabn(r.k.id)}
                data-rolle={r.rolle.type} data-oprindelse={r.oprindelse.type} title="Åbn kørslen">
                <td><input type="checkbox" className="fjv-a-vaelg" aria-label="Vælg til sammenligning" checked={valgte.includes(r.k.id)}
                    onClick={stop} onChange={() => onVaelg(r.k.id)} /></td>
                {kolonner.map((c) => <td key={c.id} className={c.tal ? "fjv-h" : undefined} data-kolonne={c.id}>{VIS[c.id](r, k, indryk)}</td>)}
            </tr>
        );
    };
    const kort = (r: ListeRaekke) => {
        const k = levende.get(r.k.id) ?? r.k;
        return (
            <li key={r.k.id} className="fjv-a-kl-kort" data-rolle={r.rolle.type} data-oprindelse={r.oprindelse.type}
                aria-selected={valgte.includes(r.k.id) ? true : undefined}>
                <div className="fjv-a-kl-kort-top">
                    <input type="checkbox" className="fjv-a-vaelg" aria-label="Vælg til sammenligning" checked={valgte.includes(r.k.id)} onChange={() => onVaelg(r.k.id)} />
                    <a className="fjv-a-kl-kort-navn" href={`#/analyser/${r.k.id}`}>{r.scenarie?.navn ?? r.side.navn}</a>
                </div>
                {r.spoergsmaal && <p className="fjv-a-kl-spm">{r.spoergsmaal}</p>}
                <div className="fjv-a-raekke">
                    <Oprindelse r={r} />
                    {r.vurdering && <Maerke tone={r.vurdering.tone}>{r.vurdering.maerke}</Maerke>}
                    <StatusMaerke status={k.status} />
                </div>
                <dl className="fjv-a-fakta fjv-a-kl-kort-fakta">
                    <dt>Ændringer</dt><dd>{r.aendringer}</dd>
                    <dt>Rolle</dt><dd>{r.rolle.tekst}</dd>
                    <dt>Indstillinger</dt><dd>{[r.periode.laengde ? `${r.periode.laengde} (${r.periode.datoer})` : r.periode.datoer, `${r.markeder.tekst}${r.markeder.spor ? ` · Spor ${r.markeder.spor}` : ""}`, `${r.varmelast.tekst.toLowerCase()} varmelast${r.varmelast.navn ? ` (${r.varmelast.navn})` : ""}`].join(" · ")}</dd>
                    <dt>Driftsomkostning</dt><dd className="fjv-a-tal">{k.objektiv_dkk == null ? "–" : `${tal(k.objektiv_dkk)} kr.`}{r.delta !== null && <> · <Delta r={r} /></>}</dd>
                </dl>
            </li>
        );
    };
    const gruppeHoved = (g: Gruppe) => (
        <span className="fjv-a-kl-gruppe-tekst">
            <span className="fjv-a-kl-gruppe-titel">{g.titel}</span>
            <span className="fjv-a-svag"> · {g.undertitel}</span>
        </span>
    );
    return (
        <>
            <div className="fjv-tabelrul fjv-a-kl-tabelrul">
                <table className="fjv-tabel fjv-a-kl" data-layout="tabel" data-flere={flere ? "true" : undefined}>
                    <thead>
                        <tr>
                            <th><span className="fjv-a-visuelt-skjult">Vælg</span></th>
                            {kolonner.map((k) => <Overskrift key={k.id} k={k} sortering={sortering} onSorter={onSorter} />)}
                        </tr>
                    </thead>
                    {grupper
                        ? grupper.map((g) => (
                            <tbody key={g.noegle} data-gruppe={g.type}>
                                <tr className="fjv-a-kl-gruppe"><th colSpan={n} scope="rowgroup">{gruppeHoved(g)}</th></tr>
                                {g.raekker.map(række)}
                            </tbody>
                        ))
                        : <tbody>{raekker.map(række)}</tbody>}
                </table>
            </div>
            <ul className="fjv-a-kl-kortliste" aria-label="Kørsler">
                {grupper
                    ? grupper.map((g) => [
                        <li key={`g-${g.noegle}`} className="fjv-a-kl-kort-gruppe">{gruppeHoved(g)}</li>,
                        ...g.raekker.map(kort),
                    ])
                    : raekker.map(kort)}
            </ul>
        </>
    );
}
