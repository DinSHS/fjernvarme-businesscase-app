//-----------------------------------------------------------------------
// Scenariets historie i klartekst (briefs/15, A2) — kun visningen.
// Sætningerne regnes af fv-analyse's generator; dette kort viser dem,
// linker til sammenligningen og kan kopiere teksten til en mail/et notat.
//-----------------------------------------------------------------------

import { useState } from "react";
import { Knap, Kort, Maerke } from "@/components/layout";
import { useKoerselInput, useNoegletal, useScenarie, useScenarieAendringer } from "@/lib/data/hooks";
import type { Koersel } from "../../../rayfin/data/Koersel";
import type { Scenarie } from "../../../rayfin/data/Scenarie";
import { historieEfterKørsel, saetningFørKørsel } from "./historie";
import { sammenlignHref } from "./koersel-logik";
import { forventetInput, type Blade, type Scenariefelter, type Ændring } from "./logik";
import type { TidsserieInfo } from "./varmelast";

export function HistorieKort({ saetninger, fase, kategori, sammenlignHref, fod }: {
    /** 1 sætning før kørsel; 2–3 efter kørsel med reference. */
    saetninger: readonly string[];
    fase: "før" | "efter";
    /** Anbefalingskategorien som mærke (efter kørsel). */
    kategori?: { tekst: string; tone: "ok" | "advarsel" | "fejl" | "neutral" };
    sammenlignHref?: string;
    fod?: string;
}) {
    const [kopieret, setKopieret] = useState<"ja" | "fejl" | undefined>();
    const tekst = saetninger.join(" ");
    const kopiér = async () => {
        try {
            await navigator.clipboard.writeText(tekst);
            setKopieret("ja");
        } catch {
            setKopieret("fejl");
        }
    };
    return (
        <Kort titel="Scenariet fortalt" afgraensning={fase === "før" ? "hvad vi ændrer" : "hvad det gav"}
            budskab={saetninger[0]}
            handling={<span className="fs-fast">
                <Knap sekundaer onClick={kopiér} disabled={!tekst} title="Kopiér hele teksten til udklipsholderen">
                    {kopieret === "ja" ? "Kopieret" : "Kopiér som tekst"}
                </Knap>
            </span>}
            fod={fod}>
            {(saetninger.length > 1 || kategori || sammenlignHref) && (
                <div className="fs-blok">
                    {saetninger.slice(1).map((s, i) => <p key={i} className="fs-tekst">{s}</p>)}
                    <div className="fs-raekke">
                        {kategori && <Maerke tone={kategori.tone}>{kategori.tekst}</Maerke>}
                        {sammenlignHref && <a className="fs-link" href={sammenlignHref}>Se hele sammenligningen</a>}
                    </div>
                </div>
            )}
            {kopieret === "fejl" && <p className="fs-lille" role="status">Browseren tillod ikke at kopiere — markér teksten i stedet.</p>}
        </Kort>
    );
}

/**
 * Historiekortet på scenariesiden. Før kørsel: sætning 1 af det input, scenariet
 * VIL få frosset (kladden, gemt eller ej). Efter kørsel med en færdig reference:
 * hele historien og vurderingen af de to faktiske kørsler, med link.
 */
export function ScenarieHistorie({ s, ændringer, felter, blade, vaerkNavn, bekraeft, seneste, reference, refId, serier }: {
    s: Scenarie;
    ændringer: readonly Ændring[];
    felter: Scenariefelter;
    blade: Blade;
    vaerkNavn: string;
    bekraeft: ReadonlySet<string>;
    seneste?: Koersel;
    reference?: Koersel;
    refId?: string;
    serier: readonly TidsserieInfo[];
}) {
    const refScen = useScenarie(refId);
    const refÆnd = useScenarieAendringer(refId);
    const færdigt = seneste?.status === "faerdig" && reference?.status === "faerdig" && reference.id !== seneste.id;
    const sInput = useKoerselInput(færdigt ? seneste!.id : undefined);
    const sTal = useNoegletal(færdigt ? seneste!.id : undefined);
    const rInput = useKoerselInput(færdigt ? reference!.id : undefined);
    const rTal = useNoegletal(færdigt ? reference!.id : undefined);

    // Før kørsel (eller mens kørslernes data hentes): sætning 1.
    const r = refScen.data;
    const refFelter: Scenariefelter = r
        ? {
            periode_start: r.periode_start ?? null, periode_slut: r.periode_slut ?? null, med_balancering: r.med_balancering,
            balancing_method: r.balancing_method ?? null, mip_rel_gap: r.mip_rel_gap ?? null, mip_abs_gap: r.mip_abs_gap ?? null,
            tidsgraense_s: r.tidsgraense_s ?? null, ekstra_flag: r.ekstra_flag ?? null, heat_csv: r.heat_csv ?? null,
        }
        // Ingen reference: værket som det er — samme periode og gab, uden balancemarked, flag og målt varmelast.
        : { ...felter, med_balancering: false, balancing_method: null, ekstra_flag: null, heat_csv: null };
    const refÆndringer: Ændring[] = r ? (refÆnd.data ?? []).map((a) => ({ type: a.type, sti: a.sti, vaerdi_json: a.vaerdi_json })) : [];
    const refNavn = r ? r.navn : `${vaerkNavn} (værket som det er)`;
    const venterPåRef = !!refId && (refScen.data === undefined || refÆnd.data === undefined);
    const s1 = venterPåRef ? undefined
        : saetningFørKørsel(forventetInput(refÆndringer, refFelter, blade, serier), refNavn, forventetInput(ændringer, felter, blade, serier), s.navn, vaerkNavn, serier);

    if (færdigt && sInput.data && sTal.data && rInput.data && rTal.data) {
        const h = historieEfterKørsel(
            { k: reference!, navn: r?.navn ?? "referencen", scenarie: r ?? null, input: rInput.data, noegletal: rTal.data },
            { k: seneste!, navn: s.navn, scenarie: s, input: sInput.data, noegletal: sTal.data },
            vaerkNavn, bekraeft, serier,
        );
        return (
            <HistorieKort fase="efter" saetninger={[h.tekst]}
                kategori={{ tekst: h.vurdering.maerke, tone: h.vurdering.tone }}
                sammenlignHref={sammenlignHref(reference!.id, seneste!.id)}
                fod="Regnet af de to kørslers frosne input og nøgletal med Analysers generator; vurderingen følger appens anbefalingsregler." />
        );
    }
    return (
        <HistorieKort fase="før" saetninger={s1 ? [s1] : []}
            fod={færdigt ? "Henter kørslernes resultater …"
                : seneste?.status === "faerdig" && !refId
                    ? "Scenariet har ingen reference, så resultatet fortælles ikke som en forskel. Opret et par fra \"Nyt scenarie fra et spørgsmål\", eller sammenlign i Analyser."
                    : "Regnet af det, kørslen vil få frosset (også ændringer, der ikke er gemt endnu). Hele historien kommer, når scenariet og dets reference er kørt."} />
    );
}
