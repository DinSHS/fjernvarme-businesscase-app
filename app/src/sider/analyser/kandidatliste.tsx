//-----------------------------------------------------------------------
// Kandidatlisten "Hvad skal denne kørsel sammenlignes med?" (brief 14).
// Erstatter den gamle <select> med beløb uden kontekst. Logikken står i
// kandidater.ts; her er kun visningen.
//-----------------------------------------------------------------------

import { DataTilstand, Kort, Maerke, StatusMaerke } from "@/components/layout";
import { tal } from "@/lib/format";
import { rutehref } from "@/lib/rute";
import type { Hentet } from "@/lib/data/hooks";
import { egneRaekker } from "./kandidat-data";
import { deltaTekst, kandidater, resumeTekst, type Kandidat, type KoerselInfo } from "./kandidater";
import type { Pakke } from "./data";
import { periodeTekst } from "./fmt";

function balancering(b: boolean | null): string {
    return b === null ? "balancemarked ukendt" : b ? "med balancemarked" : "uden balancemarked";
}

function Raekke({ c, denne }: { c: Kandidat; denne: string }) {
    const indhold = (
        <>
            <div className="fjv-a-kand-tekst">
                <div className="fjv-a-kand-navn">
                    <span>{c.navn}</span>
                    {c.naturlig && <Maerke tone="ok">Naturlig reference</Maerke>}
                    {c.status === "ja" && <Maerke tone="ok">Sammenlignelig</Maerke>}
                    {c.sammeInput && c.status === "ja" && <Maerke>Samme input — kontrol for solverstøj</Maerke>}
                    {!c.faerdig && <StatusMaerke status={c.k.status} />}
                </div>
                <div className="fjv-a-kand-meta">
                    {c.vaerkNavn} · {periodeTekst(c.profil.periode_start, c.profil.periode_slut)} · {balancering(c.medBalancering)}
                </div>
                <div className="fjv-a-kand-meta">
                    <span className="fjv-a-svag">Ændret ift. værket: </span>{resumeTekst(c.aendringer)}
                </div>
                {c.status !== "ja" && c.afviger.length > 0 && (
                    <div className="fjv-a-kand-meta"><span className="fjv-a-svag">Afviger: </span>{c.afviger.join(", ")}</div>
                )}
            </div>
            <div className="fjv-a-kand-tal">
                <div><span className="fjv-a-tal">{c.k.objektiv_dkk == null ? "–" : `${tal(c.k.objektiv_dkk)} kr.`}</span> <span className="fjv-a-svag">driftsomkostning</span></div>
                <div className={c.delta == null ? "fjv-a-svag" : undefined}>{deltaTekst(c.delta)}</div>
            </div>
        </>
    );
    return (
        <li>
            {c.faerdig
                // Kandidaten bliver referencen (a); den aktuelle kørsel er scenariet (b).
                ? <a className="fjv-a-kand-rk" href={rutehref("analyser", "sammenlign", c.k.id, denne)} title="Sammenlign — kandidaten bliver referencen">{indhold}</a>
                : <div className="fjv-a-kand-rk" data-deaktiveret="true">{indhold}</div>}
        </li>
    );
}

export default function Kandidatliste({ pakke, alle }: { pakke: Pakke; alle: Hentet<KoerselInfo[]> }) {
    const denne: KoerselInfo = { k: pakke.k, scenarie: pakke.scenarie, vaerkNavn: pakke.vaerkNavn, input: egneRaekker(pakke.input) };
    const periode = periodeTekst(pakke.profil.periode_start, pakke.profil.periode_slut);
    return (
        <DataTilstand h={alle} højde={180}>
            {(liste) => {
                const { anbefalet, andre } = kandidater(denne, liste);
                const top = anbefalet[0];
                const budskab = top
                    ? `${anbefalet.length} ${anbefalet.length === 1 ? "kørsel kan" : "kørsler kan"} sammenlignes direkte med denne. ${top.naturlig ? "Naturlig reference" : "Øverst"}: "${top.navn}" — ${deltaTekst(top.delta)}.`
                    : `Der er ingen anden kørsel af ${pakke.vaerkNavn} i samme periode (${periode}) med samme data, modelversion og gab.`;
                return (
                    <Kort titel="Hvad skal denne kørsel sammenlignes med?" afgraensning="vælg en reference — differensen er produktet"
                        budskab={budskab}
                        fod={<>Direkte sammenlignelig = samme værk, periode, opløsning, data, modelversion og ønsket gab (KONTRAKT §6b). Den naturlige
                            reference er scenariets egen reference, ellers værket som det er med samme balancering. Den valgte kørsel bliver
                            referencen; "Byt reference og scenarie" findes på sammenligningssiden.</>}>
                        {anbefalet.length > 0
                            ? <ul className="fjv-a-kand">{anbefalet.map((c) => <Raekke key={c.k.id} c={c} denne={pakke.k.id} />)}</ul>
                            : <p className="fjv-brod">Bestil en reference under <a className="fjv-a-link" href={rutehref("scenarier")}>Scenarier</a> —
                                samme værk og periode uden ændringer, og med samme gab som denne kørsel.</p>}
                        {andre.length > 0 && (
                            <details open={anbefalet.length === 0}>
                                <summary className="fjv-a-svag" style={{ cursor: "pointer" }}>Andre kørsler — kan ikke sammenlignes direkte ({andre.length})</summary>
                                <ul className="fjv-a-kand">{andre.map((c) => <Raekke key={c.k.id} c={c} denne={pakke.k.id} />)}</ul>
                            </details>
                        )}
                    </Kort>
                );
            }}
        </DataTilstand>
    );
}
