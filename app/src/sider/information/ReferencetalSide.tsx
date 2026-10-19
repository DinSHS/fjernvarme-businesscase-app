//-----------------------------------------------------------------------
// Referencetal: README's tabel side om side med de kørsler, der findes i databasen — og Spor B mod
// Billunds afregning. Differensen mellem README og Fabric er ikke et fejlmål: solveren stopper ved et gab, så to
// korrekte kørsler kan ligge forskelligt inden for tolerancen. README angiver ingen tolerance; den er afledt af
// casens eget solvergab (max(absolut gab, relativt gab × objektiv), jf. referencetal.json → _om).
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { DataTilstand, Gitter, Kort, Maerke } from "@/components/layout";
import { tal, tidspunkt } from "@/lib/format";
import { rutehref } from "@/lib/rute";
import { useTekst } from "../dokumentation/tekster";
import { EmneRamme } from "./EmneRamme";
import { EmneTekstKort } from "./EmneSide";
import { useEmneTekst } from "./emneTekst";
import type { Emne } from "./emner";
import { sporBBudskab, type RefRække, type RefTilstand, type SporB } from "./referencer";
import { gabProcent, gabTekst, signedKr, signedProcent } from "./tal";
import { useReferencetal } from "./useReferencer";

const TILSTAND: Record<RefTilstand, { tekst: string; tone: "neutral" | "ok" | "advarsel" | "fejl"; titel: string }> = {
    "ikke-koert": { tekst: "ikke kørt endnu", tone: "neutral", titel: "Ingen færdig kørsel af værket med referencens opsætning." },
    "aendret": { tekst: "kun ændrede scenarier", tone: "advarsel", titel: "Kørsler af værket findes, men alle har ændringer i scenariet — ingen er den rene reference." },
    "indenfor": { tekst: "inden for tolerancen", tone: "ok", titel: "Afvigelsen er mindre end casens eget solvergab tillader." },
    "udenfor": { tekst: "uden for tolerancen", tone: "fejl", titel: "Afvigelsen er større end casens solvergab tillader. Tjek data-version, kerner og gab." },
    "uafgoerligt": { tekst: "ingen tolerance at måle mod", tone: "neutral", titel: "Hverken et kronebeløb eller et opnået gab er oplyst for dette tal." },
};

function RefRaekke({ r }: { r: RefRække }) {
    const t = TILSTAND[r.tilstand];
    const k = r.kandidat?.koersel;
    return (
        <tr>
            <td>{r.ref.navn}<span className="fjv-ref-sub">{r.ref.vindue} · værk {r.ref.kode}</span></td>
            <td className="fjv-h">{tal(r.ref.objektiv)}</td>
            <td className="fjv-h">{r.vurdering && k ? tal(k.objektiv_dkk as number) : "–"}</td>
            <td className="fjv-h">
                {r.vurdering ? <>{signedKr(r.vurdering.diff)}<span className="fjv-ref-sub">{signedProcent(r.vurdering.brøk)}</span></> : "–"}
            </td>
            <td className="fjv-h">{r.vurdering?.tolerance != null ? `±${tal(r.vurdering.tolerance)}` : "–"}</td>
            <td><span title={t.titel}><Maerke tone={t.tone}>{t.tekst}</Maerke></span></td>
            <td>
                {r.kandidat ? (
                    <span title={r.kandidat.gab.erStrammere ? "Regnet med et strammere gab end casens eget — en lige så god måling af README-tallet." : "Regnet med casens eget gab."}>
                        <span className="fjv-ref-tal">{gabTekst(r.kandidat.gab.rel, r.kandidat.gab.abs)}</span>
                        <span className="fjv-ref-sub">
                            {r.kandidat.gab.opnaaet !== null ? `opnået ${gabProcent(r.kandidat.gab.opnaaet)}` : "opnået gab ikke oplyst"}
                            {r.kandidat.gab.erStrammere ? " · strammere end casen" : ""}
                        </span>
                    </span>
                ) : "–"}
            </td>
            <td>
                {k ? <a className="fjv-lnk" href={rutehref("analyser", k.id)}>{k.id.slice(0, 8)}<span className="fjv-ref-sub">{tidspunkt(k.afsluttet)}</span></a> : "–"}
            </td>
        </tr>
    );
}

function sammenfatning(raekker: readonly RefRække[]): string {
    const inden = raekker.filter((r) => r.tilstand === "indenfor").length;
    const uden = raekker.filter((r) => r.tilstand === "udenfor").length;
    const mangler = raekker.filter((r) => r.tilstand === "ikke-koert" || r.tilstand === "aendret").length;
    const dele = [`${inden} af ${raekker.length} er genskabt i Fabric inden for casens solvergab`];
    if (uden > 0) dele.push(`${uden} ligger uden for`);
    if (mangler > 0) dele.push(`${mangler} er ikke kørt endnu`);
    return dele.join(", ") + ".";
}

/** "Spor A-anker: README 4.698.390 · Fabric 4.698.361 (−0,0006 %)" — den første reference med en kørsel. */
function eksempel(raekker: readonly RefRække[]): string | undefined {
    const r = raekker.find((x) => x.vurdering && x.kandidat);
    if (!r?.vurdering || !r.kandidat) return undefined;
    return `${r.ref.navn}: README ${tal(r.ref.objektiv)} · Fabric ${tal(r.kandidat.koersel.objektiv_dkk as number)} (${signedProcent(r.vurdering.brøk)})`;
}

function useSporB(): SporB | undefined {
    const json = useTekst("viden/referencetal.json");
    return useMemo(() => {
        if (json.tekst === undefined) return undefined;
        try { return (JSON.parse(json.tekst) as { validering_billund?: SporB }).validering_billund; } catch { return undefined; }
    }, [json.tekst]);
}

export function ReferencetalSide({ emne, emner, anker }: { emne: Emne; emner: readonly Emne[]; anker: string | undefined }) {
    const tekst = useEmneTekst(emne, anker);
    const ref = useReferencetal();
    const sporB = useSporB();
    const budskab = ref.data ? `${sammenfatning(ref.data.raekker)} ${eksempel(ref.data.raekker) ?? ""}`.trim() : tekst.budskab;

    return (
        <EmneRamme emne={emne} emner={emner} budskab={budskab}>
            <Gitter form="12">
                <Kort titel="README mod Fabric" afgraensning="objektiv, kr."
                    budskab={ref.data ? sammenfatning(ref.data.raekker) : undefined}
                    fod="Afvigelse = Fabric − README. Tolerance = casens eget solvergab, max(absolut gab, relativt gab × objektiv) — README angiver ingen tolerance selv; for Andeby med balancering er det README's opnåede gab, 0,12 %. En kørsel tæller, hvis den har samme værk, periode, balancering, varmelast og metode som referencen, intet i scenariet er ændret, og gabet er det samme eller strammere; den nyeste sådan kørsel vises. Solveren minimerer, så et objektiv kan være for højt, men ikke under det sande optimum: en strammere kørsel ligger derfor typisk under README-tallet, ikke over.">
                    <DataTilstand h={ref} højde={220}>
                        {(d) => (
                            <div className="fjv-tabelrul">
                                <table className="fjv-tabel" data-layout="tabel">
                                    <thead>
                                        <tr>
                                            <th>Case</th><th className="fjv-h">README, kr.</th><th className="fjv-h">Fabric, kr.</th>
                                            <th className="fjv-h">Afvigelse, kr.</th><th className="fjv-h">Tolerance, kr.</th><th>Status</th><th>Gab, ønsket</th><th>Kørsel</th>
                                        </tr>
                                    </thead>
                                    <tbody>{d.raekker.map((r) => <RefRaekke key={r.ref.id} r={r} />)}</tbody>
                                </table>
                            </div>
                        )}
                    </DataTilstand>
                </Kort>
            </Gitter>
            <Gitter form="6-6">
                <EmneTekstKort emne={emne} emner={emner} tekst={tekst} />
                {sporB ? (
                    <Kort titel="Spor B mod Billunds afregning" afgraensning="marts–juni 2026, kr."
                        budskab={sporBBudskab(sporB)}
                        fod={<>{sporB.kilde}. {sporB.forbehold}</>}>
                        <div className="fjv-tabelrul">
                            <table className="fjv-tabel" data-layout="tabel">
                                <thead><tr><th>Post</th><th className="fjv-h">Realiseret</th><th className="fjv-h">Model</th><th className="fjv-h">Forhold</th></tr></thead>
                                <tbody>
                                    {sporB.raekker.map((r) => (
                                        <tr key={r.post}><td>{r.post}</td><td className="fjv-h">{tal(r.realiseret)}</td><td className="fjv-h">{tal(r.model)}</td><td className="fjv-h">{r.forhold_pct} %</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Kort>
                ) : (
                    <Kort titel="Spor B mod Billunds afregning"><p className="fjv-tilstand">Tallene er ikke bundtet i denne udgave.</p></Kort>
                )}
            </Gitter>
        </EmneRamme>
    );
}
