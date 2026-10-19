//-----------------------------------------------------------------------
// #/analyser/anbefalinger — "hvad bør vi gøre?" på én side (brief 15 A pkt. 2):
// alle sammenlignelige reference/scenarie-par (seneste pr. scenarie), sorteret
// efter kategori og værdi, med historien som én linje pr. par.
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { DataTilstand, Gitter, Knap, Kort, Maerke, Side } from "@/components/layout";
import { rutehref } from "@/lib/rute";
import type { OmraadeProps } from "../typer";
import { findPar, historie, krRund, sorterAnbefalinger, vurder } from "./anbefaling";
import { useAnbefalingsData } from "./anbefaling-data";
import { KopierKnap } from "./anbefaling-kort";
import { parbare } from "./sammensaetning";

export default function Anbefalinger({ gåTil }: Pick<OmraadeProps, "gåTil">) {
    const h = useAnbefalingsData();
    const rækker = useMemo(() => {
        if (!h.data) return undefined;
        const d = h.data;
        // Røgtests og arkiverede scenarier parres ikke (brief 17 pkt. 5; fv-app 12:05) — samme par som kørselslisten.
        const par = findPar(parbare(d.sider, d.scenarier, d.koder, d.vaerker), (s) => d.referenceScenarie.get(s));
        return sorterAnbefalinger(par.map((p) => {
            const v = vurder(p, d.bekraeft.get(p.scen.k.vaerk_id) ?? new Set());
            return { p, v, h: historie(p, v) };
        }));
    }, [h.data]);
    const tæl = (k: string) => (rækker ?? []).filter((x) => x.v.kategori === k).length;
    const budskab = !rækker ? undefined : rækker.length === 0
        ? "Der er endnu ingen sammenlignelige reference/scenarie-par — bestil et under Scenarier."
        : `${rækker.length} par: ${[["anbefalet", "anbefalet"], ["undersoeg_naermere", "bør undersøges nærmere"], ["fraraades", "frarådes"], ["foelsomhed", "følsomheder"], ["kan_ikke_afgoeres", "kan ikke afgøres"]]
            .filter(([k]) => tæl(k)).map(([k, t]) => `${tæl(k)} ${t}`).join(", ")}.`;
    const alt = (rækker ?? []).map((x) => `${x.v.maerke}: ${x.p.scen.navn}\n${x.h}`).join("\n\n");
    return (
        <Side omraade="Analyser" titel="Anbefalinger — hvad bør vi gøre?" budskab={budskab}
            handlinger={<>
                <Knap sekundaer onClick={() => gåTil("analyser")}>Alle kørsler</Knap>
                {rækker && rækker.length > 0 && <KopierKnap tekst={alt} etiket="Kopiér alle som tekst" />}
            </>}>
            <Gitter>
                <Kort titel="Reference/scenarie-par" afgraensning="seneste kørsel pr. scenarie, sorteret efter kategori og værdi"
                    budskab={rækker?.[0] ? `Øverst: "${rækker[0].p.scen.navn}" — ${rækker[0].v.maerke.toLowerCase()}.` : undefined}
                    fod={<>Et par er to direkte sammenlignelige kørsler (KONTRAKT §6b), hvor scenariet bærer præcis én knaps ændring ift. referencen.
                        Kategorierne og forbeholdene følger fv-eksperts regler (anbefalingsregler.json). Følsomheder og metodevalg får mærket
                        "Følsomhed": de beskriver noget, værket ikke selv vælger.</>}>
                    <DataTilstand h={h} højde={260}>
                        {() => (
                            <ul className="fjv-a-kand">
                                {(rækker ?? []).map(({ p, v, h: tekst }) => (
                                    <li key={p.scen.k.id}>
                                        <a className="fjv-a-kand-rk" href={rutehref("analyser", "sammenlign", p.ref.k.id, p.scen.k.id)} title="Se sammenligningen">
                                            <div className="fjv-a-kand-tekst">
                                                <div className="fjv-a-kand-navn">
                                                    <Maerke tone={v.tone}>{v.maerke}</Maerke>
                                                    <span>{p.scen.navn}</span>
                                                    <span className="fjv-a-svag" style={{ fontWeight: 400 }}>mod {p.ref.navn}</span>
                                                </div>
                                                <div className="fjv-a-kand-meta">{tekst}</div>
                                            </div>
                                            <div className="fjv-a-kand-tal">
                                                <div><span className="fjv-a-tal">{v.delta === null ? "–" : krRund(v.delta)}</span> {v.delta === null ? "" : v.delta < 0 ? "billigere" : "dyrere"}</div>
                                                <div className="fjv-a-svag">i perioden · {v.n === null ? (v.tolerance === 0 ? "løst til optimum" : "tolerance ukendt") : v.n > 100 ? "over 100 × tolerancen" : `${v.n} × tolerancen`}</div>
                                            </div>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </DataTilstand>
                </Kort>
            </Gitter>
        </Side>
    );
}
