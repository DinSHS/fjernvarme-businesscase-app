# Hvilke data skal med?

En kørsel bygger på tre slags data. **Markeds- og vejrdata** henter appen selv fra datarepoet df-data — dem
uploader du aldrig. **Værkets parametre** (enheder, lagre, priser, tarif) står under Konfiguration.
**Værkets egne tidsserier** — målt varmelast og solvarme — uploader du under *Konfiguration → værk → Tidsserier*
eller via værksarket. (Kilde: KONTRAKT §6d)

## Hvad modellen bruger i hver kørsel

| Data | Hvornår | Hvorfra |
|---|---|---|
| Elspotpris | altid | df-data, værkets priszone (`data.price_zone`) |
| Udetemperatur | altid — også med målt varmelast | df-data, værkets DMI-område (`data.dmi_area`) |
| aFRR, mFRR-kapacitet, mFRR-aktivering, ubalancepris | kun med balancemarked | df-data, værkets elområde (`electricity.spot_area`) |
| Varmelast | altid | syntetisk fra `heat_load_params` og temperaturen — eller en målt tidsserie |
| Solprofil | kun hvis værket har solvarme | en tidsserie eller en fil i modelrepoet |
| Brændsels- og CO₂-priser, elafgift, tarif | altid | værkets parametre (faste tal, ingen tidsserier) |

Temperaturen indgår også med målt varmelast, fordi varmepumpens ydelse følger udetemperaturen.
(Kilde: src/data_loader_github.py:644-661; src/data_loader_github.py:684-705; src/model.py:177-193)

## Varmelast: syntetisk eller målt

**Syntetisk** varmelast regnes af DMI-temperaturen med værkets `heat_load_params`: en døgnprofil, rumvarme og
nettab. Døgnprofilens timer er UTC-timer. Parametrene skal altid findes — også når varmelasten er målt.
(Kilde: src/data_loader.py:702-778; run_case.py:377)

**Målt** varmelast er den sikreste: samlet varmeproduktion ab værk i MW, time for time, *inklusive* nettab —
ikke salget an forbruger. Den erstatter syntesen i hele kørslen. Mangler op til 5 % af kørslens timer, udfylder
modellen dem med en ret linje; mangler flere, stopper kørslen. (Kilde: src/data_loader.py:835-961; doc/VARMELAST_OG_NETTAB.md:43-46)

## Solprofil

En solprofil er solvarmeanlæggets mulige varmeproduktion i MW hver time. Modellen bruger den laveste af profilen og
enhedens maks varme som loft. Profilen skal dække **hver** time i kørslen — én manglende time stopper kørslen.
Varme sendt ud i solfeltet for at undgå frost er ikke produktion. (Kilde: src/model.py:155-172; src/data_loader.py:997-1010)

## Sådan skal en tidsserie se ud

- To kolonner: tidsstempel og værdi. Komma, semikolon eller tabulator; decimalkomma er i orden ved semikolon.
- Tidsstemplet `2025-07-01 00:00` eller `01-07-2025 00:00`. Du vælger selv, om det er **UTC** eller **dansk
  lokaltid**, og om det er **timens start** eller **timens slut** — appen gætter ikke, for en forkert time flytter
  hele serien i forhold til elprisen uden at noget ser forkert ud.
- Timeværdier eller kvarterværdier. Kvarterværdier midles til timer, fordi denne version regner i timer.
- Værdier i MW (middeleffekt). kW og MWh/kWh pr. interval kan vælges og regnes om.
- En manglende time er en **tom celle**, aldrig 0 — nul er en gyldig måling.
  (Kilde: viden/data_krav.json; doc/EGET_VAERK.md:16-27)

## Hvad appen tjekker

Appen tjekker serien, så snart den er uploadet, og igen når du bestiller en kørsel med den. **Fejl** betyder, at
modellen ville stoppe eller regne noget, der med sikkerhed er forkert — så afvises serien. **Advarsler** betyder,
at data kan være rigtige, men er usædvanlige; serien kan bruges, men se efter.

| Eksempel | Hvad det er |
|---|---|
| Samme time står to gange | fejl — vi vælger ikke selv, hvilken værdi der gælder |
| Negative værdier | fejl |
| Største værdi over 5.000 MW | fejl — står tallene i kW? |
| Huller i serien | advarsel — og fejl ved bestilling, hvis over 5 % af kørslens timer mangler |
| 24 timer i træk med 0 eller med præcis samme tal | advarsel — udfald eller en måler, der står stille |
| En time over værkets samlede kapacitet | advarsel — og fejl ved bestilling, for timen kan ikke løses |
| Solvarme om natten, eller middagstoppen en time forskudt | advarsel — tjek tidszonen og timens start/slut |

Grænserne er målt på repoets egne data: Billunds målte varmelast har højst 3 ens timer i træk og ingen time over
to gange niveauet omkring den. (Kilde: viden/data_krav.json; src/data_loader.py:911-939)

## Værksarket

Værksarket (`vaerksdata_skabelon.xlsx`) er den lette vej til et nyt værk: anlæg, priser, tarif, DMI-område og
varmeproduktion ab værk for 1. juli 2025 – 30. juni 2026 i ét regneark. Appen omsætter det med modelrepoets eget
script og opretter værket og dets tidsserier. Skabelonens otte eksempelrækker skal slettes eller erstattes — ellers
afviser scriptet arket. Er timedata tomme, men årsproduktionen udfyldt, bliver varmelasten syntetisk.
(Kilde: scripts/vaerksark_til_yaml.py:256-316; doc/EGET_VAERK.md:16-31)

Et værk fra værksarket kan kun køres i den periode, dets data dækker: den målte varmelast 1. juli 2025 – 30. juni
2026, og en syntetisk solprofil de kalenderår, perioden rører. (Kilde: scripts/vaerksark_til_yaml.py:1084-1135)

Et værk i appen kan også eksporteres til værksarket og uploades igen som en ny revision af samme værk. Arket kan ikke
bære alt: balancemarkedet, nettilslutningen, slåede-fra enheder og tanke, timer uden for perioden og en kalibreret
varmelastmodel står ikke i skabelonen, og modellens script sætter selv bl.a. tankenes startfyldning og gasenhedernes
CO2-faktor. Eksporten viser listen før download; ved genupload røres de felter ikke. (Kilde: KONTRAKT §6d;
scripts/vaerksark_til_yaml.py:586-918)

## Hvad står der om data på en kørsel

Hver kørsel viser sit datagrundlag: hvilken version af df-data og af modellen den brugte, værkets revision,
spotpris-område og DMI-område, om balancemarkedets data var med, og om varmelasten var syntetisk eller hvilken
tidsserie (med navn og fingeraftryk) der blev brugt — det samme for solprofilen. Alt er låst, da kørslen blev
bestilt, så det står fast, selv om værket senere ændres. (Kilde: KONTRAKT §6d; KONTRAKT §3.7)

## Kendte forhold

- **Spotprisen efter 1. oktober 2025** er kvarterpriser, og en timekørsel bruger prisen for timens *første*
  kvarter, ikke timens gennemsnit. Målt over et år er forskellen i gennemsnit 79 kr./MWh pr. time og +6,8 kr./MWh
  i alt. Det gælder alle kørsler i denne version. (Kilde: src/data_loader_github.py:659)
- **Tomme temperaturer** i DMI-data udfyldes ved interpolation; det drejer sig om få timer pr. område.
  (Kilde: src/data_loader_github.py:655-658)
- **Markedsdata slutter**, hvor df-data slutter (opdateres mandage). Andebys solprofil slutter 3. oktober 2026, så
  Andeby kan ikke køres efter den dato. (Kilde: cases/andeby.yaml:52-60)
