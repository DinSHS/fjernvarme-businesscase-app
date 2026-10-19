//-----------------------------------------------------------------------
// De fem områder (KONTRAKT §1). Ejes af fundamentet — sideagenter retter
// IKKE denne fil; de bygger i deres egen mappe src/sider/<område>/.
//-----------------------------------------------------------------------

import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { OmraadeMeta, OmraadeProps } from "./typer";

export interface Omraade extends OmraadeMeta {
    Komponent: LazyExoticComponent<ComponentType<OmraadeProps>>;
}

export const OMRAADER: readonly Omraade[] = [
    {
        id: "dokumentation", navn: "Dokumentation",
        beskrivelse: "Modelrepoets vejledninger og appens egen vejledning og arkitektur",
        Komponent: lazy(() => import("./dokumentation")),
    },
    {
        id: "information", navn: "Information",
        beskrivelse: "Metoden forklaret, begreber, referencetal, datadækning og kendte begrænsninger",
        Komponent: lazy(() => import("./information")),
    },
    {
        id: "konfiguration", navn: "Konfiguration",
        beskrivelse: "Se og redigér værker — enheder, lagre, priser, tariffer, balancering, tid, data, solver",
        Komponent: lazy(() => import("./konfiguration")),
    },
    {
        id: "analyser", navn: "Analyser",
        beskrivelse: "Alle kørsler: nøgletal, enhedsfordeling, måneder, dispatch og sammenligning af to kørsler",
        Komponent: lazy(() => import("./analyser")),
    },
    {
        id: "scenarier", navn: "Scenarier",
        beskrivelse: "Opret scenarier, bestil kørsler, følg status og sammenlign med en reference",
        Komponent: lazy(() => import("./scenarier")),
    },
];

export const STANDARD_OMRAADE = "konfiguration";
