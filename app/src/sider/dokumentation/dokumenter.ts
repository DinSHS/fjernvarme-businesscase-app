//-----------------------------------------------------------------------
// Dokumentindekset: hvad Dokumentation-siden viser, i hvilken rækkefølge og hvorfra.
// Afspejler viden/dokumentation_indeks.json (fv-ekspert) plus appens egne dokumenter.
// Teksterne ligger bundtet i `indhold/` (se _byg/kopier-indhold.mjs).
//-----------------------------------------------------------------------

export type DokKilde = "modelrepo" | "viden" | "app";
export type DokFormat = "md" | "tekst" | "pdf" | "xlsx";

export interface Dok {
    id: string;
    titel: string;
    gruppe: string;
    beskrivelse: string;
    kilde: DokKilde;
    /** Sti i modelrepoet (kilde = modelrepo) eller i `viden/` (kilde = viden); ellers tom. */
    sti: string;
    format: DokFormat;
    /** Bundtet tekstfil under `indhold/` (kun for md/tekst). */
    fil?: string;
    note?: string;
    valgfri?: boolean;
    /** Vis arkitekturdiagrammet over teksten. */
    diagram?: boolean;
}

export const GRUPPER = ["Kom i gang", "Appen", "Modellen", "Brug", "Balancemarked", "Værket", "Baggrund"] as const;

export const DOKUMENTER: readonly Dok[] = [
    { id: "appens_metode", titel: "Metoden bag modellen", gruppe: "Kom i gang", kilde: "viden", sti: "METODE.md", format: "md", fil: "viden/METODE.md",
        beskrivelse: "Dansk ekspertsyntese til fagfolk: MILP'en, el og tarif, balancemarkedet, Spor A/B, differenser og solvergab, referencetal og begrænsninger — med kilder." },
    { id: "saadan_bruger_du_appen", titel: "Sådan bruger du appen", gruppe: "Kom i gang", kilde: "viden", sti: "app_tekster/saadan_bruger_du_appen.md", format: "md", fil: "viden/saadan_bruger_du_appen.md",
        beskrivelse: "Værker, scenarier, bestilling, kø og sammenligning af to kørsler." },

    { id: "arkitektur", titel: "Arkitektur", gruppe: "Appen", kilde: "app", sti: "", format: "md", fil: "egne/arkitektur.md", diagram: true,
        beskrivelse: "App, database, Functions, notebook og lakehouse — hvem skriver hvad, og hvorfor modellen aldrig kører i browseren." },
    { id: "kor_i_notebook", titel: "Kør i en notebook", gruppe: "Appen", kilde: "app", sti: "", format: "md", fil: "egne/kor_i_notebook.md",
        beskrivelse: "Start en kørsel i hånden fra Fabric-notebooken fjv_koer_scenarie, med parametre." },
    { id: "kendte_begraensninger", titel: "Kendte begrænsninger", gruppe: "Appen", kilde: "viden", sti: "app_tekster/begraensninger.md", format: "md", fil: "viden/begraensninger.md",
        beskrivelse: "Hvad modellen ikke kan — og hvad det betyder for tallene." },

    { id: "readme", titel: "README — overblik og referencetal", gruppe: "Modellen", kilde: "modelrepo", sti: "README.md", format: "md", fil: "repo/readme.md",
        beskrivelse: "Hvad modellen kan og ikke kan, de tre regler for tallene, referencetabellen og datakilderne." },
    { id: "rapport_v4", titel: "Rapport v4 — metode, validering og Billund", gruppe: "Modellen", kilde: "modelrepo", sti: "doc/rapport_billund_v4.pdf", format: "pdf",
        beskrivelse: "Hovedrapporten (22. oktober 2026): metode, Billund som case, tank og balancemarked, validering mod Billunds afregning og matematik i bilag B.",
        note: "Regnet ved commit 405b428; hvor README har nyere tal, har README forrang." },

    { id: "koersel", titel: "Kørsel, scenarier og output", gruppe: "Brug", kilde: "modelrepo", sti: "doc/KOERSEL.md", format: "md", fil: "repo/koersel.md",
        beskrivelse: "Alle flag til run_case.py, scenarier som differens, solvergab og outputfilerne.",
        note: "Beskriver kommandolinjen; i appen svarer flagene til scenariets felter og ændringer." },

    { id: "budstrategi", titel: "Budstrategi i balancemarkedet", gruppe: "Balancemarked", kilde: "modelrepo", sti: "doc/BUDSTRATEGI.md", format: "md", fil: "repo/budstrategi.md",
        beskrivelse: "Budpris, budstørrelse, prognose og afregning; seks budprofiler med færdige YAML-blokke og kontroltal på Andeby." },
    { id: "balancemarked", titel: "Balancemarked — aFRR og mFRR", gruppe: "Balancemarked", kilde: "modelrepo", sti: "doc/BALANCEMARKED.md", format: "md", fil: "repo/balancemarked.md",
        beskrivelse: "Bud, lofter, aktiveringsværdi, Spor A og B, det fiktive 2026-marked og valideringen mod afregning." },

    { id: "varmelast_og_nettab", titel: "Varmepumpe, varmelast og nettab", gruppe: "Værket", kilde: "modelrepo", sti: "doc/VARMELAST_OG_NETTAB.md", format: "md", fil: "repo/varmelast_og_nettab.md",
        beskrivelse: "Varmepumpens ydelsestabel, målt mod syntetisk varmelast, rekalibrering og de to nettabsmodeller." },
    { id: "eget_vaerk", titel: "Dit eget værk — fra regneark til model", gruppe: "Værket", kilde: "modelrepo", sti: "doc/EGET_VAERK.md", format: "md", fil: "repo/eget_vaerk.md",
        beskrivelse: "Excel-skabelonen, konverteringen, korte vinduer, helår og løsetid, og casen skrevet i hånden.",
        note: "Konverteringen kører lokalt (scripts/vaerksark_til_yaml.py); appen har sin egen vej til et nyt værk (kopiér og ret)." },
    { id: "vaerksdata_skabelon", titel: "Skabelon til værksdata (Excel)", gruppe: "Værket", kilde: "modelrepo", sti: "doc/vaerksdata_skabelon.xlsx", format: "xlsx",
        beskrivelse: "Regnearket, som et værk udfylder med timedata, anlæg, varmepumpe og priser. Til download." },

    { id: "workflow_claude", titel: "Arbejdsform med Claude i browseren (Vej B)", gruppe: "Baggrund", kilde: "modelrepo", sti: "doc/WORKFLOW_CLAUDE.md", format: "md", fil: "repo/workflow_claude.md", valgfri: true,
        beskrivelse: "Den arbejdsform, modellen blev udviklet i. Ikke nødvendig for at bruge appen." },
    { id: "workflow_lokal", titel: "Lokal installation (Vej A)", gruppe: "Baggrund", kilde: "modelrepo", sti: "doc/WORKFLOW_LOKAL.md", format: "md", fil: "repo/workflow_lokal.md", valgfri: true,
        beskrivelse: "Kør modellen på egen maskine. Ikke nødvendig for at bruge appen." },
    { id: "contributing", titel: "Bidrag tilbage", gruppe: "Baggrund", kilde: "modelrepo", sti: "CONTRIBUTING.md", format: "md", fil: "repo/contributing.md",
        beskrivelse: "Sådan deles modelforbedringer med fællesskabet — uden værksdata." },
    { id: "licens", titel: "Licens (MIT)", gruppe: "Baggrund", kilde: "modelrepo", sti: "LICENSE", format: "tekst", fil: "repo/licens.txt",
        beskrivelse: "Licensteksten, som skal følge med de bundtede dokumenter." },
];

export function dokument(id: string | undefined): Dok | undefined {
    return DOKUMENTER.find((d) => d.id === id);
}

/** Dokumenter kan læses i appen, når der er en bundtet tekst. */
export function erLaesbar(d: Dok): boolean {
    return d.fil !== undefined;
}
