//-----------------------------------------------------------------------
// #/analyser              — kørselslisten, grupperet pr. spørgsmål (standard)
// #/analyser/kronologisk  — samme liste uden grupper
// #/analyser/<grupperet|kronologisk>/<kolonne>/<op|ned> — sorteret; sorteringen
//                           står i ruten, så den kan linkes og frem/tilbage virker
//
// Brief 17: hver kørsel forklarer sin sammensætning (spørgsmål, ændringer ift.
// værket, rolle, oprindelse, periode, markeder, varmelast, Δ mod parrets
// reference og anbefaling). Alle kolonner kan sorteres; sortering efter
// spørgsmål samler reference, scenarier og gentagelser. Røgtests er skjult som
// standard. Vælg to → Sammenlign (som før).
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { DataTilstand, Gitter, Knap, Kort, Side } from "@/components/layout";
import { useKoerselStatus } from "@/lib/data/hooks";
import { STATUS_TEKST } from "@/lib/data/koersel-status";
import { KOERSEL_STATUSSER } from "../../../rayfin/data/fjv.constants";
import type { OmraadeProps } from "../typer";
import { useAnbefalingsData } from "./anbefaling-data";
import { sammenligningsRaekkefoelge, type Koersel } from "./beregn";
import { SammensaetningForklaring } from "./forklaring";
import { KoerselTabel } from "./liste-tabel";
import { FØRST_FALDENDE, KOLONNER, sorteringsRute } from "./liste-visning";
import {
    eksempel, filtrer, grupper, listeRaekker, OPRINDELSE_ETIKET, sorter, sorterGrupper, titelOpslag,
    type Filtre, type ListeRaekke, type OprindelseType, type Sortering,
} from "./sammensaetning";

const FLERE_NØGLE = "fjv.analyser.flere-kolonner";
const læsFlere = () => { try { return window.localStorage.getItem(FLERE_NØGLE) === "1"; } catch { return false; } };
const gemFlere = (v: boolean) => { try { window.localStorage.setItem(FLERE_NØGLE, v ? "1" : "0"); } catch { /* huskes bare ikke */ } };

const KRONOLOGISK: Sortering = { kolonne: "modtaget", retning: -1 };

export default function Liste({ gåTil, kronologisk = false, sortering = null }: Pick<OmraadeProps, "gåTil"> & { kronologisk?: boolean; sortering?: Sortering | null }) {
    const [filtre, setFiltre] = useState<Filtre>({ vaerkId: "", oprindelse: "", markeder: "", status: "" });
    const [visRoegtest, setVisRoegtest] = useState(false);
    const [flere, setFlere] = useState(læsFlere);
    const [valgte, setValgte] = useState<string[]>([]);

    const h = useAnbefalingsData(true);
    const levendeListe = useKoerselStatus(useMemo(() => h.data?.sider.map((s) => s.k), [h.data]));
    const levende = useMemo(() => new Map(levendeListe.map((k) => [k.id, k as Koersel])), [levendeListe]);

    const alle = useMemo(() => (h.data ? listeRaekker(h.data, true) : undefined), [h.data]);
    const roegtests = (alle ?? []).filter((r) => r.oprindelse.type === "roegtest").length;
    const synlige = useMemo(() => (alle ?? []).filter((r) => visRoegtest || r.oprindelse.type !== "roegtest"), [alle, visRoegtest]);
    const filtreret = useMemo(() => filtrer(synlige, filtre), [synlige, filtre]);
    const gs = useMemo(() => grupper(filtreret), [filtreret]);
    const aktiv: Sortering | null = sortering ?? (kronologisk ? KRONOLOGISK : null);
    const visteGrupper = useMemo(() => (kronologisk ? null : sorterGrupper(gs, aktiv)), [kronologisk, gs, aktiv]);
    const visteRækker = useMemo(() => (kronologisk ? sorter(filtreret, aktiv ?? KRONOLOGISK, titelOpslag(gs)) : []), [kronologisk, filtreret, aktiv, gs]);
    const ek = useMemo(() => (alle ? eksempel(alle.filter((r) => r.oprindelse.type !== "roegtest")) : null), [alle]);

    const setSortering = (s: Sortering | null) => gåTil(sorteringsRute(kronologisk, s));
    const sorterEfter = (kolonne: string) => setSortering(aktiv?.kolonne === kolonne
        ? { kolonne, retning: aktiv.retning === 1 ? -1 : 1 }
        : { kolonne, retning: FØRST_FALDENDE.has(kolonne) ? -1 : 1 });
    const sætFilter = (f: Partial<Filtre>) => setFiltre((x) => ({ ...x, ...f }));
    const vælg = (id: string) => setValgte((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id].slice(-2)));
    const valgteKørsler = valgte.map((id) => levende.get(id)).filter((k): k is Koersel => !!k);
    const par = sammenligningsRaekkefoelge(valgteKørsler);
    const ikkeFærdig = valgteKørsler.some((k) => k.status !== "faerdig");

    const tæl = (t: string) => filtreret.filter((r) => r.rolle.type === t).length;
    const erFiltreret = !!(filtre.vaerkId || filtre.oprindelse || filtre.markeder || filtre.status);
    const budskab = !alle ? undefined : alle.length === 0 ? "Der er ingen kørsler endnu — bestil en under Scenarier."
        : filtreret.length === 0 ? "Ingen kørsler passer til filtrene."
            : `${filtreret.length} kørsler${erFiltreret ? " passer til filtrene" : ""}: ${tæl("scenarie")} scenarier med en reference, ${tæl("reference")} referencer, ${tæl("gentagelse")} gentagelser og ${tæl("enkelt")} enkeltkørsler${!visRoegtest && roegtests ? ` — ${roegtests} røgtests er skjult` : ""}.`;
    const sortNavn = aktiv ? KOLONNER.find((k) => k.id === aktiv.kolonne)?.navn.toLowerCase() : null;
    const afgraensning = kronologisk
        ? (sortering ? `sorteret efter ${sortNavn}` : "kronologisk, nyeste først")
        : `grupperet pr. spørgsmål${sortering ? `, sorteret efter ${sortNavn}` : ""}`;
    const familier = (visteGrupper ?? []).filter((g) => g.type === "par").length;
    const sortValg = KOLONNER.filter((k) => flere || !k.flere || (kronologisk && k.id === "modtaget"));

    return (
        <Side omraade="Analyser" titel="Kørsler" budskab={budskab}
            handlinger={<>
                <Knap onClick={() => gåTil("analyser/anbefalinger")} title="Alle reference/scenarie-par med anbefaling og historie">Anbefalinger — hvad bør vi gøre?</Knap>
                <Knap sekundaer disabled={!par || ikkeFærdig} onClick={() => par && gåTil(`analyser/sammenlign/${par[0]}/${par[1]}`)}
                    title={!par ? "Vælg to kørsler i tabellen" : ikkeFærdig ? "Begge kørsler skal være færdige" : "Den først modtagne er referencen"}>
                    Sammenlign {valgte.length}/2
                </Knap>
                {valgte.length > 0 && <Knap sekundaer onClick={() => setValgte([])}>Ryd valg</Knap>}
            </>}>
            <Gitter>
                <SammensaetningForklaring eksempel={ek} />
            </Gitter>
            <Gitter>
                <Kort titel="Alle kørsler" afgraensning={afgraensning}
                    budskab={par ? (ikkeFærdig ? "Begge valgte kørsler skal være færdige, før de kan sammenlignes." : "To kørsler valgt — den først modtagne bliver referencen.")
                        : kronologisk ? "Sortér efter spørgsmål for at samle reference, scenarier og gentagelser; klik på en række for at åbne kørslen."
                            : `${familier} ${familier === 1 ? "gruppe" : "grupper"} med reference og scenarier; sortér med en overskrift eller "Sortér efter", og klik på en række for at åbne kørslen.`}
                    fod={<>Δ er scenariet minus parrets reference. Parrene er de samme som under Anbefalinger: to direkte sammenlignelige kørsler, der kun
                        adskiller sig ved én knap. En gentagelse er en kørsel af samme scenarie (samme værk og navn). ⓘ ved en overskrift forklarer kolonnen
                        og linker til ordlisten. Status opdateres automatisk hvert 20. sekund, så længe en kørsel er i gang og fanen er synlig.</>}>
                    <div className="fjv-a-filtre">
                        <div className="fjv-a-kl-visning" role="group" aria-label="Visning">
                            <Knap sekundaer={kronologisk} onClick={() => gåTil(sorteringsRute(false, sortering))} title="Reference, scenarier og gentagelser samlet">Grupperet pr. spørgsmål</Knap>
                            <Knap sekundaer={!kronologisk} onClick={() => gåTil(sorteringsRute(true, sortering))} title="Alle kørsler i én liste — sorteringen følger med">Kronologisk</Knap>
                        </div>
                        <label>Værk
                            <select className="fjv-felt" value={filtre.vaerkId} onChange={(e) => sætFilter({ vaerkId: e.target.value })}>
                                <option value="">Alle værker</option>
                                {[...new Map(synlige.map((r) => [r.k.vaerk_id, r.side.vaerkNavn])).entries()].sort((a, b) => a[1].localeCompare(b[1], "da"))
                                    .map(([id, navn]) => <option key={id} value={id}>{navn}</option>)}
                            </select>
                        </label>
                        <label>Oprindelse
                            <select className="fjv-felt" value={filtre.oprindelse} onChange={(e) => sætFilter({ oprindelse: e.target.value })}>
                                <option value="">Alle</option>
                                {(Object.keys(OPRINDELSE_ETIKET) as OprindelseType[]).filter((t) => visRoegtest || t !== "roegtest")
                                    .map((t) => <option key={t} value={t}>{OPRINDELSE_ETIKET[t]}</option>)}
                            </select>
                        </label>
                        <label>Markeder
                            <select className="fjv-felt" value={filtre.markeder} onChange={(e) => sætFilter({ markeder: e.target.value })}>
                                <option value="">Alle</option>
                                <option value="spot">Kun spot</option>
                                <option value="A">Spot + aFRR/mFRR (Spor A)</option>
                                <option value="B">Spot + aFRR/mFRR (Spor B)</option>
                            </select>
                        </label>
                        <label>Status
                            <select className="fjv-felt" value={filtre.status} onChange={(e) => sætFilter({ status: e.target.value })}>
                                <option value="">Alle statusser</option>
                                {KOERSEL_STATUSSER.filter((s) => s !== "startet").map((s) => <option key={s} value={s}>{STATUS_TEKST[s]}</option>)}
                            </select>
                        </label>
                        <label>Sortér efter
                            <select className="fjv-felt" value={aktiv ? `${aktiv.kolonne}:${aktiv.retning}` : ""}
                                onChange={(e) => { const [k, r] = e.target.value.split(":"); setSortering(k ? { kolonne: k, retning: Number(r) as 1 | -1 } : null); }}>
                                {!kronologisk && <option value="">Standard (reference først)</option>}
                                {sortValg.flatMap((k) => [
                                    <option key={`${k.id}:1`} value={`${k.id}:1`}>{k.navn} — stigende</option>,
                                    <option key={`${k.id}:-1`} value={`${k.id}:-1`}>{k.navn} — faldende</option>,
                                ])}
                            </select>
                        </label>
                        <label className="fjv-a-kl-afkryds">
                            <input type="checkbox" checked={visRoegtest} onChange={(e) => setVisRoegtest(e.target.checked)} />
                            Vis røgtests ({roegtests})
                        </label>
                        <Knap sekundaer onClick={() => setFlere((v) => { gemFlere(!v); return !v; })} title="Værk, modtaget, opnået gab, varighed og bestilt af">
                            {flere ? "Færre kolonner" : "Flere kolonner"}
                        </Knap>
                        {sortering && <Knap sekundaer onClick={() => setSortering(null)}>{kronologisk ? "Nyeste først" : "Standardrækkefølge"}</Knap>}
                    </div>
                    <DataTilstand h={h} højde={260}>
                        {() => (filtreret.length === 0
                            ? <p className="fjv-tilstand">{erFiltreret ? "Ingen kørsler passer til filtrene." : "Ingen kørsler endnu."}</p>
                            : <KoerselTabel grupper={visteGrupper} raekker={visteRækker as ListeRaekke[]} flere={flere} sortering={aktiv}
                                onSorter={sorterEfter} valgte={valgte} onVaelg={vælg} onAabn={(id) => gåTil(`analyser/${id}`)} levende={levende} />)}
                    </DataTilstand>
                </Kort>
            </Gitter>
        </Side>
    );
}
