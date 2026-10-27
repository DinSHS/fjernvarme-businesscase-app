//-----------------------------------------------------------------------
// "Modelrepoet": hvor værkets tal og standardkørsel kommer fra (runde 8, fv-trofast).
// Et værk fra modelrepoet holdes op mod casefilen ved den pinnede commit (modelspejl.data.ts);
// afviger det (fx importeret ved en ældre commit), siges det her, med fil:linje.
//-----------------------------------------------------------------------

import { Gitter, Kort, Maerke, Tabel } from "@/components/layout";
import { SPEJL_COMMIT, spejlcase } from "@/lib/modelspejl";
import { afdrift, harAfdrift, kort, modelrepoBudskab } from "./modelrepo-logik";

export function ModelrepoKort({ vaerk, blade, rod }: {
    vaerk: { kode: string; kilde: string; revision: number; repo_commit?: string | null };
    blade: ReadonlyMap<string, string> | undefined;
    rod: string;
}) {
    const a = afdrift(vaerk, blade);
    const c = spejlcase(rod);
    const rækker = [
        ...(a?.afviger ?? []).map((x) => ({ sti: x.sti, vaerk: x.vaerk, model: `${x.model} (linje ${x.linje})` })),
        ...(a?.mangler ?? []).map((sti) => ({ sti, vaerk: "–", model: `${c?.blade[sti]?.[0] ?? ""} (linje ${c?.blade[sti]?.[1] ?? "?"})` })),
        ...(a?.ekstra ?? []).map((sti) => ({ sti, vaerk: blade?.get(sti) ?? "", model: "–" })),
    ];
    return (
        <Gitter>
            <Kort titel="Modelrepoet" afgraensning={c ? `${c.fil} @ ${kort(SPEJL_COMMIT)}` : "egen antagelse"}
                budskab={<>{harAfdrift(a) && <Maerke tone="advarsel">Afviger fra modelrepoet</Maerke>} {modelrepoBudskab(vaerk, a, rod)}</>}
                fod="Modelrepoet er sandheden: værdierne læses fra casefilen ved den pinnede commit, og standardkørslen (balancemarked og varmelast) er modelrepoets egen kommando for casen. Hvor appen afviger, står der 'egen antagelse'.">
                {rækker.length > 0 && (
                    <Tabel rækker={rækker.slice(0, 50)} nøgle={(r) => r.sti}
                        kolonner={[{ navn: "Felt", vis: (r) => <span className="kf-sti">{r.sti}</span> },
                            { navn: "Værket", vis: (r) => <span className="fjv-mono">{r.vaerk}</span> },
                            { navn: "Modelrepoet", vis: (r) => <span className="fjv-mono">{r.model}</span> }]} />
                )}
            </Kort>
        </Gitter>
    );
}
