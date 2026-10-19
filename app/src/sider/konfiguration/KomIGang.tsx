//-----------------------------------------------------------------------
// #/konfiguration/<kode>/kom-i-gang — efter "Nyt værk fra bunden":
// listen over [BEKRÆFT]-felter, der bør rettes, og "Bestil en prøvekørsel
// (2 døgn)" (opretScenarie + bestilKoersel, én klientnøgle pr. klik).
//-----------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
import { Gitter, Knap, Kort, Maerke, Tabel } from "@/components/layout";
import { useKoersler } from "@/lib/data/hooks";
import { bestilKoersel, opretScenarie } from "@/lib/data/skriv";
import { opdaterAlt } from "@/lib/data/opdatering";
import { rutehref } from "@/lib/rute";
import { AFSNIT, afsnitFor, findFelt } from "./katalog";
import { feltnavn, type Gruppering } from "./gruppering";
import { erRettet, prøvekørselFelter, PRØVEPERIODE } from "./nyt-vaerk";
import { kortDato } from "./budskaber";
import { visFelt } from "./vis";

export function KomIGang({ vaerk, g, bruger, gåTil }: {
    vaerk: { id: string; kode: string; navn: string; revision: number; oprettet: Date | string }; g: Gruppering; bruger: string | undefined; gåTil: (s: string) => void;
}) {
    const koersler = useKoersler({ vaerkId: vaerk.id });
    // I fanernes rækkefølge, så listen kan arbejdes igennem fane for fane.
    const bekræft = useMemo(() => {
        const orden = (sti: string) => AFSNIT.findIndex((a) => a.id === afsnitFor(sti.split(".")[0]));
        return g.alle.filter((b) => b.bekraeft).sort((a, b) => orden(a.sti) - orden(b.sti));
    }, [g]);
    // [BEKRÆFT]-flaget bliver stående, når et felt rettes (udfoerAendring ændrer kun værdien); om skønnet er
    // erstattet, ses af feltets eget ændringstidspunkt.
    const rettet = (b: { aendret?: Date | string | null }) => erRettet(b.aendret, vaerk.oprettet);
    const tilbage = bekræft.filter((b) => !rettet(b)).length;
    const [sender, setSender] = useState(false);
    const [svar, setSvar] = useState<{ ok: boolean; tekst: string; scenarie?: string }>();
    const nøgle = useRef<string | null>(null);
    const tidStart = g.alle.find((b) => b.sti === "time.start")?.vaerdi_json;
    const tidSlut = g.alle.find((b) => b.sti === "time.end")?.vaerdi_json;
    const iVindue = !!tidStart && !!tidSlut && JSON.parse(tidStart) <= `${PRØVEPERIODE.start}T00:00:00Z` && JSON.parse(tidSlut) >= `${PRØVEPERIODE.slut}T23:00:00Z`;

    const bestil = async () => {
        setSender(true); setSvar(undefined);
        nøgle.current ??= crypto.randomUUID();
        try {
            const s = await opretScenarie(prøvekørselFelter(vaerk.id), bruger);
            const r = await bestilKoersel(s.id, bruger, nøgle.current);
            setSvar(r.ok
                ? { ok: true, tekst: r.arbejder?.startet ? "Prøvekørslen er bestilt, og beregningen er startet." : `Prøvekørslen er bestilt. ${r.arbejder?.grund ?? ""}`, scenarie: s.id }
                : { ok: false, tekst: r.afvist ?? "Bestillingen blev afvist.", scenarie: s.id });
            opdaterAlt();
        } catch (e) {
            setSvar({ ok: false, tekst: e instanceof Error ? e.message : String(e) });
        } finally { nøgle.current = null; setSender(false); }
    };

    return (
        <Gitter form="8-4">
            <Kort titel="Ret de skønnede værdier" afgraensning={`${bekræft.length} felter markeret [BEKRÆFT]`}
                budskab={bekræft.length ? (tilbage ? `${tilbage} af ${bekræft.length} skønnede værdier fra skabelonen er endnu ikke erstattet med værkets egne.` : `Alle ${bekræft.length} skønnede værdier er rettet siden oprettelsen.`) : `${vaerk.navn} er oprettet uden skønnede værdier.`}
                fod="Klik på et afsnit for at rette felterne der. Mærket [BEKRÆFT] bliver stående ved feltet; 'rettet' betyder, at værdien er ændret efter oprettelsen (se revisionsloggen).">
                <Tabel rækker={bekræft} nøgle={(b) => b.sti} tom="Ingen felter er markeret [BEKRÆFT]."
                    kolonner={[
                        { navn: "Afsnit", vis: (b) => { const a = AFSNIT.find((x) => x.id === afsnitFor(b.sti.split(".")[0])); return a ? <a href={rutehref("konfiguration", vaerk.kode, a.id)}>{a.navn}</a> : "–"; } },
                        { navn: "Felt", vis: (b) => <><span className="kf-feltnavn">{feltnavn(b)}</span><div className="kf-sti">{b.sti}</div></> },
                        { navn: "Skøn", vis: (b) => <span className="kf-vaerdi" data-lang="true">{visFelt(b.vaerdi_json)}</span>, tal: true },
                        { navn: "Enhed", vis: (b) => findFelt(b.sti)?.enhed ?? "" },
                        { navn: "Status", vis: (b) => (rettet(b) ? <Maerke tone="ok">rettet</Maerke> : <Maerke tone="advarsel">skøn</Maerke>) },
                    ]} />
            </Kort>
            <Kort titel="Prøvekørsel" afgraensning={`2 døgn · ${kortDato(PRØVEPERIODE.start)}–${kortDato(PRØVEPERIODE.slut)}`}
                budskab={koersler.data?.length ? `Værket er kørt ${koersler.data.length} ${koersler.data.length === 1 ? "gang" : "gange"}.` : "En kort kørsel viser, om modellen accepterer værket, før du bruger tid på et helår."}
                fod="Prøven er uden balancemarked, med gab 0,0002 og 100 kr. Tallene er ikke et resultat — kun et bevis for, at modellen accepterer og kan regne værket.">
                <div className="kf-handlinger">
                    <Knap onClick={bestil} disabled={sender || !bruger || !iVindue}>{sender ? "Bestiller…" : "Bestil en prøvekørsel (2 døgn)"}</Knap>
                    {!iVindue && <Maerke tone="advarsel">Perioden ligger uden for værkets tidsvindue</Maerke>}
                </div>
                {svar && (
                    <p className="kf-svar" data-tone={svar.ok ? "ok" : "fejl"} role="status">
                        {svar.tekst}{svar.scenarie && <> <a href={rutehref("scenarier", svar.scenarie)}>Følg kørslen under Scenarier</a>.</>}
                    </p>
                )}
                <div className="kf-handlinger">
                    <Knap sekundaer onClick={() => gåTil(`konfiguration/${vaerk.kode}`)}>Til værkets enheder</Knap>
                </div>
            </Kort>
        </Gitter>
    );
}
