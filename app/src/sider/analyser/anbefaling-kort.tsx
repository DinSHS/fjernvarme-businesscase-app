//-----------------------------------------------------------------------
// Historie- og anbefalingskortet øverst på sammenligningssiden (brief 15 A/A2).
//-----------------------------------------------------------------------

import { useState } from "react";
import { Knap, Kort, Maerke } from "@/components/layout";
import { rutehref } from "@/lib/rute";
import type { Par, Vurdering } from "./anbefaling";
import { KATEGORIER } from "./anbefaling.data";

/** Næste skridt med link: "Kør helåret …" → Scenarier med værk og knap valgt. */
export function NaesteSkridt({ skridt, vaerkKode, knap }: { skridt: readonly string[]; vaerkKode: string | null; knap: string | null }) {
    if (!skridt.length) return null;
    const href = vaerkKode ? rutehref("scenarier", "nyt", vaerkKode, ...(knap ? [knap] : [])) : rutehref("scenarier");
    return (
        <ol className="fjv-a-liste">
            {skridt.map((s) => (
                <li key={s}>{s}{/^Kør helåret/.test(s) && <> — <a className="fjv-a-link" href={href}>Bestil helårskørsel</a></>}</li>
            ))}
        </ol>
    );
}

/** Kopiér tekst til udklipsholderen; viser "Kopieret" et øjeblik. Uden clipboard-API: markér teksten selv. */
export function KopierKnap({ tekst, etiket = "Kopiér som tekst" }: { tekst: string; etiket?: string }) {
    const [status, setStatus] = useState<"" | "ok" | "fejl">("");
    const kopiér = async () => {
        try {
            await navigator.clipboard.writeText(tekst);
            setStatus("ok");
        } catch {
            setStatus("fejl");
        }
        window.setTimeout(() => setStatus(""), 2500);
    };
    return (
        <Knap sekundaer onClick={kopiér} title="Til en mail eller et bestyrelsesnotat">
            {status === "ok" ? "Kopieret" : status === "fejl" ? "Kunne ikke kopiere — markér teksten" : etiket}
        </Knap>
    );
}

export function HistorieKort({ par, historie }: { par: Par; historie: string }) {
    return (
        <Kort titel="Scenariet fortalt" afgraensning={`${par.scen.navn} mod ${par.ref.navn}`}
            budskab={historie}
            handling={<KopierKnap tekst={historie} />}
            fod={par.byttet ? "Den kørsel, der bærer ændringen ift. værket, fortælles som scenariet — her den, du valgte som reference." : "Regnet af de frosne input og resultaterne; tallene er afrundet efter appens anbefalingsregler."} />
    );
}

export function AnbefalingKort({ v, vaerkKode, kopiTekst }: { v: Vurdering; vaerkKode: string | null; kopiTekst: string }) {
    return (
        <Kort titel="Anbefaling" afgraensning={`${v.maerke.toLowerCase()} — efter appens anbefalingsregler`}
            budskab={v.saetning}
            handling={<div className="fjv-a-raekke"><Maerke tone={v.tone}>{v.maerke}</Maerke><KopierKnap tekst={kopiTekst} etiket="Kopiér" /></div>}
            fod={<>{KATEGORIER[v.kategori]?.betydning}{v.investering ? ` ${v.investering}` : ""}</>}>
            <p className="fjv-brod"><strong>Begrundelse:</strong> {v.begrundelse}</p>
            {v.skalering && <p className="fjv-brod">{v.skalering}</p>}
            {v.forbehold.length > 0 && (
                <div className="fjv-brod"><strong>Forbehold</strong>
                    <ul className="fjv-a-liste">{v.forbehold.map((f) => <li key={f.id}>{f.tekst}</li>)}</ul>
                </div>
            )}
            {v.noter.length > 0 && (
                <div className="fjv-brod fjv-a-svag"><strong>Noter</strong>
                    <ul className="fjv-a-liste">{v.noter.map((f) => <li key={f.id}>{f.tekst}</li>)}</ul>
                </div>
            )}
            <div className="fjv-brod"><strong>Næste skridt</strong><NaesteSkridt skridt={v.naesteSkridt} vaerkKode={vaerkKode} knap={v.knap} /></div>
        </Kort>
    );
}
