//-----------------------------------------------------------------------
// Én kørsel: levende status og fase, forventet varighed, annullér, og når
// den er færdig: objektiv, opnået gab, link til kørslen og — er der en
// reference — direkte til sammenligningen i Analyser.
//
// Status kommer fra useKoerselStatus hos forælderen (ingen egne timere, §6).
//-----------------------------------------------------------------------

import { useState } from "react";
import { Knap, Maerke, StatusMaerke } from "@/components/layout";
import { annullerKoersel } from "@/lib/data/skriv";
import { erAktiv } from "@/lib/data/koersel-status";
import { opdaterAlt } from "@/lib/data/opdatering";
import { tal, tidspunkt } from "@/lib/format";
import { rutehref } from "@/lib/rute";
import type { Koersel } from "../../../rayfin/data/Koersel";
import { GRAENSER } from "../../../rayfin/data/fjv.constants";
import { absolutGab, differenceTekst, gabTekst, tidsgraenseForslag } from "../analyser/beregn";
import { TidsgraenseMaerke } from "../analyser/dele";
import { NoegletalKort, TKR } from "../analyser/ibcs-grafer";
import { modReference, sammenlignHref } from "./koersel-logik";
import { varighedTekst } from "./logik";
import { rådFor, type Rådkontekst } from "./raad";

export function KoerselDetaljer({ k, varighed, reference, rådkontekst, tidsgraense_s }: {
    /** Scenariets gældende tidsgrænse i sekunder — den, en ny kørsel vil få (til forslaget om en længere). */
    tidsgraense_s?: number;
    k: Koersel;
    /** Forventet regnetid (for en aktiv kørsel). */
    varighed?: { lav: number; høj: number };
    /** Parrets referencekørsel (levende), hvis der er en. */
    reference?: Koersel;
    /** Kørslens periode, balancering og DMI-område — så rådet ved en dækningsfejl rammer den rigtige årsag. */
    rådkontekst?: Rådkontekst;
}) {
    const [svar, setSvar] = useState<string | undefined>();
    const [sender, setSender] = useState(false);
    const aktiv = erAktiv(k.status);
    const råd = k.status === "fejl" ? rådFor(k.fejlbesked, rådkontekst) : undefined;
    // Runde 15 (mail 1): differensen findes kun mod en færdig, direkte sammenlignelig reference (koersel-logik.ts).
    // Gennemgangens fund 4: dommen er Analysers; et ukendt grundlag er hverken et resultat eller en afvisning.
    const { diff, afviger: afvig, ukendt } = modReference(reference, k);
    // Testrapportens afsnit 2a + mail 1: en kørsel, der stoppede på tidsgrænsen, vises som det — og er usikkerheden en
    // væsentlig del af forskellen mod referencen, foreslås en ny kørsel med længere tidsgrænse.
    const forslag = diff && reference ? tidsgraenseForslag(reference, k, { graenser: [null, tidsgraense_s ?? null], maks: GRAENSER.maksTidsgraenseS }) : null;

    const annullér = async () => {
        setSender(true);
        try {
            const r = await annullerKoersel(k.id);
            setSvar(r.besked);
            opdaterAlt();
        } catch (e) {
            setSvar(e instanceof Error ? e.message : String(e));
        } finally {
            setSender(false);
        }
    };

    return (
        <div className="fs-blok">
            <div className="fs-raekke">
                <StatusMaerke status={k.status} />
                <TidsgraenseMaerke k={k} />
                {k.fase && k.status !== "faerdig" && <span className="fjv-brod">{k.status === "fejl" ? `stoppede under: ${k.fase}` : k.fase}</span>}
                {k.annuller_anmodet && aktiv && <Maerke tone="advarsel">Annullering anmodet</Maerke>}
            </div>
            {k.objektiv_dkk != null && (
                // Spec scenarie-resultat k1: scenariets driftsomkostning i t.kr. med ΔRef og ΔRef% mod referencen (IBCS.md).
                <NoegletalKort tal={[{
                    navn: "Driftsomkostning", enhed: "t.kr.", ref: diff ? (reference?.objektiv_dkk ?? null) : null, scen: k.objektiv_dkk, skala: TKR, polaritet: -1,
                    definition: `Objektivet for hele perioden: ${tal(k.objektiv_dkk)} kr.`,
                }]} fremhaev={diff && !diff.indenForTolerance ? "Driftsomkostning" : undefined} />
            )}
            <dl className="fs-dl">
                <dt>Bestilt</dt><dd>{tidspunkt(k.bestilt)} af {k.bestilt_af}</dd>
                {k.startet && <><dt>Startet</dt><dd>{tidspunkt(k.startet)}</dd></>}
                {k.afsluttet && <><dt>Afsluttet</dt><dd>{tidspunkt(k.afsluttet)}{k.loesetid_s != null ? ` · løsetid ${k.loesetid_s.toLocaleString("da-DK", { maximumFractionDigits: k.loesetid_s < 10 ? 1 : 0 })} s` : ""}</dd></>}
                {aktiv && varighed && <><dt>Forventet</dt><dd>{varighedTekst(varighed)} regnetid + ca. 1 min opstart{k.status === "koe" ? ", når den er forrest i køen" : ""}</dd></>}
                {k.status === "faerdig" && (
                    <><dt>Opnået gab</dt><dd className="fjv-tal">{k.opnaaet_gap != null ? `${(k.opnaaet_gap * 100).toLocaleString("da-DK", { maximumFractionDigits: 3 })} %` : "ukendt (ikke i solverloggen)"}</dd></>
                )}
                {k.status === "faerdig" && (k.solve_status ?? "").toLowerCase().includes("time") && (
                    <><dt>Usikkerhed</dt><dd>{gabTekst(absolutGab(k))} — den bedste løsning, solveren nåede; ikke bevist optimal</dd></>
                )}
                {diff && (
                    <><dt>Mod reference</dt><dd>{differenceTekst(diff)}</dd></>
                )}
            </dl>
            {forslag && <p className="fjv-tilstand" data-tone="advarsel" role="status">{forslag.tekst}</p>}
            {k.status === "fejl" && k.fejlbesked && (
                <div className="fs-blok">
                    <p className="fjv-tilstand" data-tone="fejl" role="alert">{k.fejlbesked}</p>
                    {råd && <p className="fs-tekst">{råd.tekst} <span className="fs-lille">({råd.kilde})</span></p>}
                </div>
            )}
            {afvig.length > 0 && (
                <p className="fjv-tilstand" data-tone="advarsel" role="alert">
                    Kan ikke sammenlignes direkte med referencen: {afvig.join(", ")} afviger. Der vises derfor ingen ΔRef — kør referencen igen med samme {afvig.join(", ")}.
                </p>
            )}
            {afvig.length === 0 && ukendt.length > 0 && (
                <p className="fjv-tilstand" role="status">
                    Det kan ikke afgøres, om kørslen kan sammenlignes med referencen: {ukendt.join(", ")} kendes ikke for begge kørsler. Der vises derfor ingen ΔRef.
                </p>
            )}
            <div className="fs-raekke">
                {aktiv && <Knap sekundaer onClick={annullér} disabled={sender || !!k.annuller_anmodet}>{sender ? "Annullerer…" : "Annullér"}</Knap>}
                {k.status === "faerdig" && <a className="fs-link" href={rutehref("analyser", k.id)}>Se kørslen</a>}
                {k.status === "faerdig" && reference?.status === "faerdig" && (
                    <a className="fs-link" href={sammenlignHref(reference.id, k.id)}>Sammenlign med referencen</a>
                )}
            </div>
            {svar && <p className="fs-tekst" role="status">{svar}</p>}
        </div>
    );
}
