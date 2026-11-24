//-----------------------------------------------------------------------
// #/konfiguration/<kode>/kom-i-gang — efter "Nyt værk fra bunden":
// listen over [BEKRÆFT]-felter, der bør rettes, og "Bestil en prøvekørsel
// (2 døgn)" (opretScenarie + bestilKoersel).
//
// Efterprøvningen af rettelserne i runde 15, fund B: hvert klik oprettede et nyt scenarie og en ny klientnøgle. Gik
// svaret tabt, efter serveren havde committet kørslen, gav næste klik endnu et scenarie og endnu en kørsel. Nu huskes
// scenariet og nøglen pr. værk (bestilHusket), til udfaldet er kendt; et uafklaret svar siger, at det er uafklaret.
//
// Tredje rettelsesrunde, P2-1: forsøget er brugerens og gælder prøvekørslens felter på værkets nuværende revision. Er
// værket rettet siden et uafklaret forsøg, bestilles en ny kørsel af samme prøvescenarie, og blev det gamle forsøg til
// en kørsel, står det i kvitteringen. Forsøget overlever en genindlæsning (sessionStorage).
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Gitter, Knap, Kort, Maerke, Tabel } from "@/components/layout";
import { useKoersler } from "@/lib/data/hooks";
import { bestilKoersel, opretScenarie } from "@/lib/data/skriv";
import { bestilHusket, forrigeTekst, genfundetTekst, udfaldTekst, åbentForsøg, åbentTekst, type Forsøgsmål } from "@/lib/data/bestillingsforsoeg";
import { frossetSomNu } from "../scenarier/frosset-som-nu";
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
    const [svar, setSvar] = useState<{ ok: boolean; tekst: string; scenarie?: string; uafklaret?: boolean; åben?: boolean }>();
    const mål: Forsøgsmål = { mål: `proeve:${vaerk.id}`, bruger, aftryk: JSON.stringify([prøvekørselFelter(vaerk.id), vaerk.revision]) };
    const tidStart = g.alle.find((b) => b.sti === "time.start")?.vaerdi_json;
    const tidSlut = g.alle.find((b) => b.sti === "time.end")?.vaerdi_json;
    const iVindue = !!tidStart && !!tidSlut && JSON.parse(tidStart) <= `${PRØVEPERIODE.start}T00:00:00Z` && JSON.parse(tidSlut) >= `${PRØVEPERIODE.slut}T23:00:00Z`;

    // Punkt 2 (fjerde rettelsesrunde): blev et forsøg på en anden værksrevision til en kørsel, afgør kørslens frosne
    // input, om den er svaret. Prøvekørslen har ingen ændringer; felterne er skabelonens.
    const somFrosset = (koerselId: string) => {
        const p = prøvekørselFelter(vaerk.id);
        return frossetSomNu(koerselId, vaerk, [], {
            periode_start: p.periode_start, periode_slut: p.periode_slut, med_balancering: p.med_balancering, balancing_method: null,
            mip_rel_gap: p.mip_rel_gap, mip_abs_gap: p.mip_abs_gap, tidsgraense_s: null, ekstra_flag: null, heat_csv: null,
        }, new Map(g.alle.map((b) => [b.sti, b.vaerdi_json])));
    };
    const bestil = async (bestilNy = false) => {
        setSender(true); setSvar(undefined);
        try {
            // Scenariet oprettes kun ved forsøgets FØRSTE klik; et nyt klik efter et uafklaret svar bruger det samme.
            const u = await bestilHusket(mål, async () => (await opretScenarie(prøvekørselFelter(vaerk.id), bruger)).id,
                (id, nøgle) => bestilKoersel(id, bruger, nøgle), { somFrosset, bestilNy });
            const a = u.art === "bestilt" ? u.svar.arbejder : undefined;
            setSvar(u.art === "bestilt"
                ? { ok: true, tekst: u.genfundet ? genfundetTekst(u.koersel_id, "prøvekørslen") : `${a?.startet ? "Prøvekørslen er bestilt, og beregningen er startet." : `Prøvekørslen er bestilt. ${a?.grund ?? ""}`}${u.forrige ? forrigeTekst(u.forrige, "værket") : ""}`, scenarie: u.scenarieId }
                // Linket til scenariet vises kun, når der står noget at følge — ikke ved et uafklaret svar.
                : { ok: false, tekst: udfaldTekst(u, "prøvekørslen", "værket"), uafklaret: u.art === "uafklaret", åben: u.art === "forrige_aaben", scenarie: u.art === "uafklaret" ? undefined : u.scenarieId });
            opdaterAlt();
        } catch (e) {
            setSvar({ ok: false, tekst: e instanceof Error ? e.message : String(e) });
        } finally { setSender(false); }
    };
    const åbent = sender ? undefined : åbentForsøg(mål);
    const fortsætter = åbent === "samme";

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
                    <Knap onClick={() => bestil()} disabled={sender || !bruger || !iVindue}>{sender ? "Bestiller…" : fortsætter ? "Prøv igen" : "Bestil en prøvekørsel (2 døgn)"}</Knap>
                    {svar?.åben && åbent === "aendret" && <Knap sekundaer onClick={() => bestil(true)} disabled={sender || !bruger || !iVindue}>Bestil ny kørsel</Knap>}
                    {!iVindue && <Maerke tone="advarsel">Perioden ligger uden for værkets tidsvindue</Maerke>}
                </div>
                {!svar && åbent && <p className="kf-svar" role="status">{åbentTekst(åbent, "prøvekørslen", "værket")}</p>}
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
