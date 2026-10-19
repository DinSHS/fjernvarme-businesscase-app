//-----------------------------------------------------------------------
// "Sådan er en analyse sammensat" (brief 17 pkt. 3): værk → scenarie →
// periode → indstillinger → kørsel → sammenligning → anbefaling, med ét
// konkret eksempel regnet af data (demo-parret P1, ellers det første par).
// Sammenklappelig; valget huskes i localStorage (try/catch — siden virker uden).
//-----------------------------------------------------------------------

import { useState } from "react";
import { Knap, Kort, Maerke } from "@/components/layout";
import { DIFFERENSMETODEN_HREF, TRIN } from "./liste-tekster";
import { eksempelTekster } from "./liste-visning";
import { deltaOrd, type ListeRaekke } from "./sammensaetning";

const NØGLE = "fjv.analyser.forklaring.skjult";

function læsSkjult(): boolean {
    try { return window.localStorage.getItem(NØGLE) === "1"; } catch { return false; }
}
function gemSkjult(v: boolean): void {
    try { window.localStorage.setItem(NØGLE, v ? "1" : "0"); } catch { /* privat vindue o.l.: valget huskes bare ikke */ }
}

export function SammensaetningForklaring({ eksempel }: { eksempel: { ref: ListeRaekke; scen: ListeRaekke } | null }) {
    const [skjult, setSkjult] = useState(læsSkjult);
    const skift = () => setSkjult((v) => { gemSkjult(!v); return !v; });
    const ek = eksempel ? eksempelTekster(eksempel.ref, eksempel.scen) : null;
    const spørgsmål = eksempel?.scen.spoergsmaal;
    const budskab = eksempel
        ? `Eksempel: ${spørgsmål ? `"${spørgsmål}" — ` : ""}scenariet er ${deltaOrd(eksempel.scen.delta) ?? "–"} end referencen, og anbefalingen er "${eksempel.scen.vurdering?.maerke ?? "–"}".`
        : "En kørsel er et værk med scenariets ændringer, en periode og indstillinger; svaret er differensen mod en reference.";
    return (
        <Kort titel="Sådan er en analyse sammensat" afgraensning={eksempel ? "med et eksempel fra demo-kørslerne" : undefined} budskab={budskab}
            handling={<Knap sekundaer onClick={skift} title={skjult ? "Vis forklaringen" : "Skjul forklaringen (valget huskes)"}>{skjult ? "Vis forklaring" : "Skjul"}</Knap>}
            fod={skjult ? undefined : <>Teksterne er fra ordlisten og "Sådan bruger du appen". Læs mere om <a className="fjv-a-link" href={DIFFERENSMETODEN_HREF}>differensmetoden</a> under Information,
                eller se <a className="fjv-a-link" href="#/analyser/anbefalinger">alle anbefalinger</a>.</>}>
            {!skjult && (
                <ol className="fjv-a-trin" aria-label="Trinene i en analyse">
                    {TRIN.map((t, i) => (
                        <li key={t.id} className="fjv-a-trin-rk" data-trin={t.id}>
                            <div className="fjv-a-trin-hoved">
                                <span className="fjv-a-trin-nr" aria-hidden="true">{i + 1}</span>
                                {t.href ? <a className="fjv-a-link" href={t.href} title="Se forklaringen">{t.titel}</a> : <span className="fjv-a-trin-titel">{t.titel}</span>}
                            </div>
                            <p className="fjv-a-trin-tekst">{t.tekst}</p>
                            {ek && (
                                <p className="fjv-a-trin-eks">
                                    {t.id === "anbefaling" && eksempel?.scen.vurdering
                                        ? <Maerke tone={eksempel.scen.vurdering.tone}>{ek.anbefaling}</Maerke>
                                        : ek[t.id]}
                                </p>
                            )}
                        </li>
                    ))}
                </ol>
            )}
        </Kort>
    );
}
