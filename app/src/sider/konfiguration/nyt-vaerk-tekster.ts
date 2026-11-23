//-----------------------------------------------------------------------
// Fodnoterne til guidens trin (#/konfiguration/nyt). I sin egen fil, så teksterne kan testes uden at eksportere en
// funktion fra komponentfilen (react-refresh) — bl.a. at trinnet Enheder siger, at felterne starter med appens egne
// forslag (kodegennemgangen af runde 15, fund 9).
//-----------------------------------------------------------------------

import { findFelt } from "./katalog";
import type { NytVaerkSkabelon, TrinId } from "./nyt-vaerk";

export function trinFod(trin: TrinId, s: NytVaerkSkabelon): string {
    // Brugertekst. Skabelonens guide_trin-regler er skrevet til udviklere (filnavne, validering.md), så tallene
    // tages derfra, men ikke ordlyden.
    switch (trin) {
        case "navn": return "Koden: små bogstaver, cifre og _ (højst 60 tegn).";
        case "klima": return findFelt("data.dmi_area")?.forklaring ?? "";
        case "varme": return `Formel (modelrepoets, som værksarket): ${s.varmelast.tekst}${s.varmelast.kilde ? ` — ${s.varmelast.kilde}` : ""}.${s.varmelast.forbehold ? ` ${s.varmelast.forbehold}` : ""}${s.egneAntagelser?.length ? ` Egne antagelser i skabelonen: ${s.egneAntagelser.join(" ")}` : ""}`;
        case "enheder": return `Mindst én enhed, og tilsammen skal de dække spidslasten (ca. ${String(s.spidslastVedF1 ?? 40.02).replace(".", ",")} MW × modelrepoets faktor f, dvs. ca. 0,4 MW pr. GWh/år over 1 GWh; solvarme tæller ikke med). Det gælder også med timedata: værket og prøvekørslen regner på varmelastmodellen, indtil et scenarie vælger en fil. Felterne starter med appens egne forslag for typen (egen antagelse — ikke værdier fra modelrepoet; kun CO₂-faktoren for gas- og oliefyrede enheder er modelrepoets) — erstat dem med værkets egne; resten kan rettes efter oprettelsen.`;
        case "lager": return "Kapacitet = volumen × 1,163 kWh/(m³·K) × ΔT / 1000. Startindhold sættes halvfuldt og tab pr. time som Andebys tanke — begge [BEKRÆFT].";
        case "priser": return "Ekskl. moms. electricity_tax og elafgift_net holdes ens (paritetsreglen). Priser og tarifbånd er Andebys (cases/andeby.yaml i modelrepoet; kilden står ved hvert felt) og markeret [BEKRÆFT].";
        case "gennemse": return "Værket kontrolleres med modellens egne regler før oprettelsen og oprettes i én transaktion som revision 1 med kilde 'Appen'; hvert felt logges i revisionsloggen.";
    }
}
