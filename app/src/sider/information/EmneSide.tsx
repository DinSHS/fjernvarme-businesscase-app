//-----------------------------------------------------------------------
// Et almindeligt emne: fagsidens tekst (markdown), med forrige/næste. Bruges af alle emner, der
// ikke har et eget indhold ud over teksten; de øvrige (referencetal, drift) lægger deres kort til.
//-----------------------------------------------------------------------

import { useMemo, type ReactNode } from "react";
import { DataTilstand, Kort } from "@/components/layout";
import type { Hentet } from "@/lib/data/hooks";
import { MarkdownBlokke } from "../dokumentation/markdown/Markdown";
import { linkOmskriver } from "../dokumentation/markdown/links";
import { udenTitel, type Blok } from "../dokumentation/markdown/parse";
import { emneHref, type Emne } from "./emner";
import { tekstBudskab, type EmneTekst } from "./emneTekst";

export function EmneTekstKort({ emne, emner, tekst, fod }: { emne: Emne; emner: readonly Emne[]; tekst: EmneTekst; fod?: ReactNode }) {
    const link = useMemo(() => linkOmskriver({ rute: `information/${emne.id}`, mappe: "" }), [emne.id]);
    const i = emner.findIndex((e) => e.id === emne.id);
    const før = emner[i - 1];
    const efter = emner[i + 1];
    return (
        <Kort titel={emne.gruppe} afgraensning={`emne ${i + 1} af ${emner.length}`}
            budskab={tekst.hentet.data ? tekstBudskab(tekst.hentet.data) : undefined}
            fod={(
                <>
                    {fod ?? "Skrevet til appen af fagsiden; kilderne står i teksten."}
                    <span className="fjv-nabo">
                        {før ? <a href={emneHref(før.id)}>← {før.titel}</a> : <span />}
                        {efter ? <a href={emneHref(efter.id)}>{efter.titel} →</a> : <span />}
                    </span>
                </>
            )}>
            <DataTilstand h={tekst.hentet as Hentet<{ blokke: Blok[] }>} højde={240}>
                {(d) => <MarkdownBlokke blokke={udenTitel(d.blokke)} link={link} />}
            </DataTilstand>
        </Kort>
    );
}
