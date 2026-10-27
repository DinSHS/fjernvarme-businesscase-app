//-----------------------------------------------------------------------
// Scenarieoversigt (#/scenarier): pr. værk scenarierne med seneste kørsel,
// status, objektiv og om der findes en sammenlignelig reference — og et
// kø-panel: hvad regner nu, hvad venter (FIFO), egne bestillinger, grænserne.
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { DataTilstand, FarveValg, Gitter, Kort, Knap, Maerke, Side, StatusMaerke, Tabel, useHeatMaks, useVisning } from "@/components/layout";
import { useKoersler, useKoerselStatus, useScenarier, useVaerker } from "@/lib/data/hooks";
import { erAktiv } from "@/lib/data/koersel-status";
import { tal, tidspunkt } from "@/lib/format";
import { farvning, forklaring, skalaMaks } from "@/lib/tabelfarve";
import { DeltaTal, TKR, tkr } from "../analyser/ibcs-grafer";
import { GRAENSER } from "../../../rayfin/data/fjv.constants";
import type { OmraadeProps } from "../typer";
import { findReference, køTid, oversigtsbudskab, type Reference, type ScenarieRække } from "./oversigt-logik";

/** Kolonnen Reference: én klar tekst pr. udfald (oversigt-logik.ts › Reference). */
export function ReferenceCelle({ r }: { r: Reference | undefined }) {
    if (!r) return <span className="fs-lille">ikke kørt endnu</span>;
    switch (r.art) {
        case "par":
            return r.direkte ? <Maerke tone="ok">{r.navn}</Maerke>
                : <Maerke tone="advarsel">{`${r.navn} (${r.afviger.join(", ")} afviger)`}</Maerke>;
        case "par_ikke_koert":
            return <span className="fs-lille">{`referencen «${r.navn}» er ikke kørt`}</span>;
        case "er_reference":
            return <Maerke>{`reference for ${r.antal} scenarie${r.antal === 1 ? "" : "r"}`}</Maerke>;
        case "sammenlignelig":
            return <span className="fs-lille" title="Ikke oprettet som par, men samme værk, periode, opløsning, df-data, model og gab">kan sammenlignes med {r.navn}</span>;
        case "ingen":
            return <span className="fs-lille" title="Ingen anden aktiv kørsel på værket har samme periode, opløsning, df-data, model og gab">ingen sammenlignelig kørsel</span>;
    }
}

export default function Oversigt({ gåTil, bruger }: OmraadeProps) {
    const scenarier = useScenarier();
    const vaerker = useVaerker(true);
    const koersler = useKoersler();
    const levende = useKoerselStatus(koersler.data);

    const rækker = useMemo<ScenarieRække[] | undefined>(() => {
        if (!scenarier.data || !vaerker.data || !koersler.data) return undefined;
        const navn = new Map(vaerker.data.map((v) => [v.id, v.navn]));
        return scenarier.data
            .map((s) => ({
                s,
                vaerk: navn.get(s.vaerk_id) ?? "Ukendt værk",
                seneste: levende.find((k) => k.scenarie_id === s.id),
                reference: findReference(s, scenarier.data!, levende),
            }))
            .sort((a, b) => a.vaerk.localeCompare(b.vaerk, "da") || String(b.s.oprettet).localeCompare(String(a.s.oprettet)));
    }, [scenarier.data, vaerker.data, koersler.data, levende]);

    const aktive = useMemo(() => levende.filter((k) => erAktiv(k.status)), [levende]);
    // ΔRef (driftsomkostning, op = dårligt): tabellens farvevalg med én skala for kolonnen (IBCS.md §8).
    const delta = (x: ScenarieRække) => (x.reference?.art === "par" && x.reference.delta !== undefined ? x.reference.delta : null);
    const vis = useVisning("delta");
    const maks = useHeatMaks("Δt.kr.·par", skalaMaks((rækker ?? []).map(delta)));
    const art = { slags: "delta", polaritet: -1 } as const;
    const legende = forklaring(vis, art, [["", maks, `${tkr(maks)} t.kr.`]]);
    const regner = aktive.filter((k) => k.status !== "koe");
    // FIFO efter server-tid `modtaget` (KONTRAKT §6c); klientens `bestilt` kun indtil feltet findes.
    const venter = aktive.filter((k) => k.status === "koe").sort((a, b) => køTid(a) - køTid(b));
    const egne = aktive.filter((k) => k.bestilt_af === bruger);
    const egneVenter = egne.filter((k) => k.status === "koe").length;
    const scenarieNavn = (id: string) => scenarier.data?.find((s) => s.id === id)?.navn ?? "Scenarie";
    const samlet = { data: rækker, fejl: scenarier.fejl ?? vaerker.fejl ?? koersler.fejl, indlæser: false, genindlæs: () => {} };

    return (
        <Side omraade="Scenarier" titel="Scenarier og kørsler"
            budskab={rækker ? oversigtsbudskab(rækker, aktive) : undefined}
            handlinger={<Knap onClick={() => gåTil("scenarier/nyt")}>Nyt scenarie fra et spørgsmål</Knap>}>
            <Gitter form="8-4">
                <Kort titel="Scenarier" afgraensning="pr. værk, nyeste først"
                    budskab={rækker ? (rækker.length ? `${rækker.filter((r) => r.seneste).length} af ${rækker.length} er kørt; vælg et for at redigere, køre og sammenligne.` : "Stil et spørgsmål for at få et reference/scenarie-par.") : undefined}
                    handling={<FarveValg slags="delta" />}
                    fod={`Reference: parrets reference (grøn), eller en anden kørsel, der kan sammenlignes direkte. Direkte sammenlignelig = samme værk, periode, opløsning, df-data, modelversion og gab (differensmetoden).${legende ? ` ΔRef: ${legende.charAt(0).toLowerCase()}${legende.slice(1)} Hvert par har sin egen periode.` : ""}`}>
                    <DataTilstand h={samlet} højde={260}>
                        {(r) => (
                            <Tabel rækker={r} nøgle={(x) => x.s.id} onVælg={(x) => gåTil(`scenarier/${x.s.id}`)}
                                tom="Ingen scenarier endnu."
                                kolonner={[
                                    { navn: "Værk", vis: (x) => x.vaerk },
                                    { navn: "Scenarie", vis: (x) => x.s.navn },
                                    { navn: "Seneste kørsel", vis: (x) => (x.seneste ? <StatusMaerke status={x.seneste.status} /> : <span className="fs-lille">ikke kørt</span>) },
                                    { navn: "Driftsomkostning (t.kr.)", tal: true, vis: (x) => <span style={{ whiteSpace: "nowrap" }} title={x.seneste?.objektiv_dkk != null ? `${tal(x.seneste.objektiv_dkk)} kr.` : undefined}>{tkr(x.seneste?.objektiv_dkk)}</span> },
                                    {
                                        navn: "ΔRef (t.kr.)", tal: true, farve: (x) => farvning(vis, delta(x), art, maks, TKR),
                                        vis: (x) => (delta(x) !== null ? <DeltaTal v={delta(x)} polaritet={-1} arv={vis === "heatmap"} /> : "–"),
                                    },
                                    { navn: "Reference", vis: (x) => <ReferenceCelle r={x.reference} /> },
                                ]} />
                        )}
                    </DataTilstand>
                </Kort>
                <Kort titel="Kø" afgraensning="én kørsel ad gangen, først modtaget først"
                    budskab={koersler.data ? (aktive.length === 0 ? "Ingen kørsler regner eller venter." : `${regner.length} regner nu, ${venter.length} venter; du har ${egne.length} i gang.`) : undefined}
                    fod={`Grænser: højst ${GRAENSER.ventendePrBruger} ventende kørsler pr. bruger · én kørsel ad gangen · periode ≤ ${GRAENSER.maksPeriodeDoegn} døgn · tidsgrænse ≤ ${GRAENSER.maksTidsgraenseS.toLocaleString("da-DK")} s. Status opdateres hvert 20. sekund, mens noget er i gang.`}>
                    <DataTilstand h={koersler}>
                        {() => (
                            <div className="fs-blok">
                                <span className="fs-overskrift">Regner nu</span>
                                {regner.length === 0 ? <p className="fs-lille">Intet.</p> : regner.map((k) => (
                                    <div key={k.id} className="fs-raekke">
                                        <StatusMaerke status={k.status} />
                                        <a className="fs-link" href={`#/scenarier/${k.scenarie_id}`}>{scenarieNavn(k.scenarie_id)}</a>
                                        <span className="fs-lille">{k.fase ?? ""}</span>
                                    </div>
                                ))}
                                <hr className="fs-skillelinje" />
                                <span className="fs-overskrift">Venter ({venter.length})</span>
                                {venter.length === 0 ? <p className="fs-lille">Ingen i kø.</p> : (
                                    <ol className="fs-fund">
                                        {venter.map((k, i) => (
                                            <li key={k.id}>
                                                {i + 1}. <a className="fs-link" href={`#/scenarier/${k.scenarie_id}`}>{scenarieNavn(k.scenarie_id)}</a>
                                                {" "}<span className="fs-lille">· {k.bestilt_af === bruger ? "din" : k.bestilt_af} · {tidspunkt(k.bestilt)}</span>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                                <hr className="fs-skillelinje" />
                                <span className="fs-overskrift">Dine bestillinger</span>
                                <p className="fs-tekst">
                                    {egne.length === 0 ? "Du har ingen kørsler i gang."
                                        : `${egne.length} i gang, heraf ${egneVenter} i kø (højst ${GRAENSER.ventendePrBruger}).`}
                                    {egneVenter >= GRAENSER.ventendePrBruger - 1 && " Et nyt par fylder to pladser — vent, til en af dine er startet."}
                                </p>
                            </div>
                        )}
                    </DataTilstand>
                </Kort>
            </Gitter>
        </Side>
    );
}
