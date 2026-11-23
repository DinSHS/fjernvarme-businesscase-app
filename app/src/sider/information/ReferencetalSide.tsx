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
import { grundlagTekst, sporBBudskab, versionsTekst, type RefRække, type RefTilstand, type SporB } from "./referencer";
import { gabProcent, gabTekst, signedKr, signedProcent } from "./tal";
import { useReferencetal } from "./useReferencer";

const TILSTAND: Record<RefTilstand, { tekst: string; tone: "neutral" | "ok" | "advarsel" | "fejl"; titel: string }> = {
    "ikke-koert": { tekst: "ikke kørt endnu", tone: "neutral", titel: "Ingen færdig kørsel af værket med referencens opsætning." },
    "andet-grundlag": { tekst: "kørt på et andet grundlag", tone: "neutral", titel: "En færdig, uændret kørsel med referencens opsætning findes, men grundlaget er ikke bekræftet som README's: værket er ikke modelrepoets case uændret, eller kørslens df-data er ikke en version, der er målt til at opfylde README's datakrav. Der regnes ingen afvigelse — en forskel ville måle grundlaget, ikke modellen." },
    "anden-version": { tekst: "kørt ved en anden modelversion", tone: "neutral", titel: "En færdig kørsel med referencens opsætning findes, men ved en anden modelversion end den, README-tallet er regnet ved. Tallene kan ikke sammenlignes, så der regnes ingen afvigelse." },
    "aendret": { tekst: "kun ændrede scenarier", tone: "advarsel", titel: "Kørsler med referencens opsætning findes, men alle blev bestilt med ændringer i scenariet — ingen er den rene reference." },
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
            <td>
                <span title={t.titel}><Maerke tone={t.tone}>{t.tekst}</Maerke></span>
                {/* Gennemgangens fund 6: hvad der skiller kørslens grundlag fra README's, i klartekst. */}
                {r.tilstand === "andet-grundlag" && r.kandidat && <span className="fjv-ref-sub">{grundlagTekst(r.kandidat.kvalifikation)}</span>}
            </td>
            <td>
                {r.kandidat ? (
                    <span title={r.tilstand === "anden-version" ? "Kørslens gab. Kørslen er regnet ved en anden modelversion og er ikke en måling af README-tallet." : r.tilstand === "andet-grundlag" ? "Kørslens gab. Kørslens grundlag er ikke bekræftet som README's, så den er ikke en måling af README-tallet." : r.kandidat.gab.erStrammere ? "Regnet med et strammere gab end casens eget — en lige så god måling af README-tallet." : "Regnet med casens eget gab."}>
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
    const anden = raekker.filter((r) => r.tilstand === "anden-version").length;
    const grundlag = raekker.filter((r) => r.tilstand === "andet-grundlag").length;
    if (mangler > 0) dele.push(`${mangler} er ikke kørt endnu`);
    if (grundlag > 0) dele.push(`${grundlag} er kun kørt på et grundlag, der ikke er bekræftet som README's`);
    if (anden > 0) dele.push(`${anden} er kun kørt ved en anden modelversion og kan ikke sammenlignes`);
    return dele.join(", ") + ".";
}

/** "Spor A-anker: README 5.069.729 · Fabric 5.069.700 (−0,0006 %)" — den første reference med en kørsel. */
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
    // Hvert tal har sin version: fra modelrepoets 939228a er Spor A-ankeret regnet efter spotrettelsen, de øvrige før.
    const version = ref.data ? versionsTekst(ref.data.raekker.map((r) => r.ref)) : undefined;
    const budskab = ref.data ? `${sammenfatning(ref.data.raekker)} ${eksempel(ref.data.raekker) ?? ""}`.trim() : tekst.budskab;

    return (
        <EmneRamme emne={emne} emner={emner} budskab={budskab}>
            <Gitter form="12">
                <Kort titel="README mod Fabric" afgraensning="objektiv, kr."
                    budskab={ref.data ? sammenfatning(ref.data.raekker) : undefined}
                    fod={`Afvigelse = Fabric − README. Tolerance = casens eget solvergab, max(absolut gab, relativt gab × objektiv) — README angiver ingen tolerance selv; for Andeby med balancering er det README's opnåede gab, 0,12 %. En kørsel tæller, hvis den blev bestilt med samme periode, balancering, varmelast og metode som referencen og uden ændringer i scenariet (læst af kørslens frosne input, ikke af scenariet, som det ser ud nu), værket er modelrepoets case uændret, kørslens df-data er en version, der er målt til at opfylde README's datakrav, og gabet er det samme eller strammere; den nyeste sådan kørsel vises. Er værket eller df-data ikke bekræftet, står kørslen som «kørt på et andet grundlag» uden afvigelse. Kørslen skal også være regnet ved den modelversion, README-tallene er regnet ved${version ? ` (${version})` : ""}; en kørsel ved en anden version står som «kørt ved en anden modelversion» uden afvigelse, fordi tallene ikke kan sammenlignes. Solveren minimerer, så et objektiv kan være for højt, men ikke under det sande optimum: en strammere kørsel ligger derfor typisk under README-tallet, ikke over.`}>
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
                        fod={<>{sporB.gaeldende ? <>{sporB.gaeldende.kilde}. Tabellen: </> : null}{sporB.kilde}. {sporB.forbehold}</>}>
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
