//-----------------------------------------------------------------------
// Kontrakten mellem app-skallen og et område (src/sider/<område>/index.tsx).
//-----------------------------------------------------------------------

export interface OmraadeProps {
    /** Resten af ruten efter områdets navn: `#/konfiguration/andeby/units` -> ["andeby", "units"]. */
    sti: string[];
    /** Naviger inden for appen: `gåTil("analyser/<koersel_id>")`. */
    gåTil: (sti: string) => void;
    /** Den indloggede brugers e-mail (til `oprettet_af`/`bestilt_af`). */
    bruger: string | undefined;
}

export interface OmraadeMeta {
    id: "dokumentation" | "information" | "konfiguration" | "analyser" | "scenarier";
    navn: string;
    /** Én linje til navigationens titel-attribut. */
    beskrivelse: string;
}
