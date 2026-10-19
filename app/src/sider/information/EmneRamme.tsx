//-----------------------------------------------------------------------
// Rammen om et Information-emne: sidens titel og budskab, emnelisten til venstre (3 spalter) og
// emnets kort til højre (9 spalter). Emnets kort lægges i en kolonne; kort, der skal stå side om side,
// ligger i deres egen <Gitter>.
//-----------------------------------------------------------------------

import type { ReactNode } from "react";
import { Gitter, Kort, Side } from "@/components/layout";
import { rutehref } from "@/lib/rute";
import { Indholdsliste } from "../dokumentation/komponenter";
import { LinkKnap } from "../dokumentation/komponenter";
import { emneHref, gruppeInddelt, type Emne } from "./emner";
import "./information.css";

export function Emneliste({ emner, aktiv }: { emner: readonly Emne[]; aktiv?: string }) {
    return (
        <Kort titel="Emner" budskab={`${emner.length} emner i ${gruppeInddelt(emner).length} grupper`}>
            <Indholdsliste etiket="Emner" grupper={gruppeInddelt(emner).map((g) => ({
                navn: g.gruppe,
                punkter: g.emner.map((e) => ({ id: e.id, tekst: e.titel, href: emneHref(e.id), aktiv: e.id === aktiv })),
            }))} />
        </Kort>
    );
}

export function EmneRamme({ emne, emner, budskab, children }: { emne: Emne; emner: readonly Emne[]; budskab?: ReactNode; children: ReactNode }) {
    return (
        <Side omraade="Information" titel={emne.titel} budskab={budskab}
            handlinger={<LinkKnap href={rutehref("information")}>← Oversigt</LinkKnap>}>
            <Gitter form="3-9">
                <Emneliste emner={emner} aktiv={emne.id} />
                <div className="fjv-emne-hoved">{children}</div>
            </Gitter>
        </Side>
    );
}
