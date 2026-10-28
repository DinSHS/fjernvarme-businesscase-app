# Sådan bruger du appen

Appen har fem områder i topmenuen: **Dokumentation**, **Information**, **Konfiguration**,
**Analyser** og **Scenarier**. Den typiske vej er: find et værk i Konfiguration → stil et spørgsmål
under Scenarier → læs svaret under Analyser.

## 1. Konfiguration — værkerne

**Konfiguration** viser alle værker: Andeby (et fiktivt referenceværk) og Billund-værkerne fra
rapport v4. Værkets kode er skrevet med små bogstaver, fx `billund_spora` for casefilen
`billund_sporA.yaml`. (Kilde: KONTRAKT §3.1)

Et værk har faner: Enheder, Lagre, Priser og afgifter, El og tarif, Balancering, Varmelast,
Tid, data og solver, Meta, samt Revisionslog, Ændringer siden kørsel og Kildefil. Ved hvert
felt står en dansk forklaring og enheden. Felter markeret **[BEKRÆFT]** er antagelser, som ingen
har besluttet; de skal erstattes med jeres egne tal. (Kilde: cases/andeby.yaml:43-46)

**Ret et værk:** tryk "Redigér", ret felterne på tværs af faner, og tryk "Gem". Ændringerne gemmes
samlet med revisionsspor: hvem, hvornår, gammel og ny værdi. Har en anden gemt imens, afvises din
ændring, og dit udkast bevares. (Kilde: KONTRAKT §3.3b)

**Jeres eget værk:** tryk "Kopiér værk" på Andeby og ret kopien. Gå felterne igennem i den
rækkefølge, Andeby selv anbefaler: data (klimaområde og priszone), tid, varmelast, enheder, lagre,
priser, el og tarif, og til sidst balancemarkedet. (Kilde: cases/andeby.yaml:16-40)

**Værkets egne data:** under fanen **Tidsserier** ligger værkets egne tidsserier — målt varmelast og målt
solvarme. Træk en CSV-fil ind, vælg rolle og om tidsstemplet er timens *start* eller *slut*, se de første rækker
og tryk upload. Filen tjekkes straks (kolonner, enhed, opløsning, dækning, huller, plausibilitet); den får status
*gyldig* eller *afvist* med en forklaring. Højst én tidsserie er **aktiv** pr. værk og rolle — det er den, scenarier
bruger, medmindre de vælger en anden. Fanen viser også serien: profil over tid, varighedskurve, måneds- og årssummer,
huller og — for varmelast — målt mod den syntetiske. Markeds- og vejrdata (spotpris, aFRR, mFRR, DMI) kommer fra
datarepoet og uploades aldrig. (Kilde: KONTRAKT §6d)

**Nyt værk fra regneark:** under *Upload værksark* kan du i stedet uploade modellens regneark `vaerksdata_skabelon.xlsx`.
Et værk og en tidsserie oprettes af arket, og importen viser sin status og log. Hvad der skal stå hvor, står i
*Information → Hvilke data skal med?*. (Kilde: KONTRAKT §6d)

**Ret et værk i Excel:** tryk **Eksportér værksark (.xlsx)** på værkets side (eller i værkslisten). Appen udfylder
modellens egen skabelon med værket og viser først en liste over det, arket *ikke* kan bære — fx balancemarkedet,
slåede-fra enheder og de værdier, modellens script sætter selv. Ret arket i Excel, og upload det under *Upload
værksark*: appen genkender det, viser hvert ændret felt (gammel → ny) og timedata som en opsummering, og gemmer det som
**næste revision af samme værk**. Kun det, du har ændret, ændres; felterne på listen røres ikke. Er værket ændret, siden
du eksporterede, afvises arket — eksportér igen. Uden appens markering (det skjulte ark `_app`) bliver arket et nyt
værk som før. (Kilde: KONTRAKT §6d)

**Enheder:** "Ny enhed" laver en enhed ud fra en skabelon for typen; "Fjern enheden" kan kun bruges,
når intet scenarie bruger enheden. Vil du bare regne uden en enhed, så brug et scenarie i stedet —
så forbliver værket urørt.

## 2. Scenarier — stil et spørgsmål

Tryk **Nyt scenarie** under Scenarier og gå de fire trin igennem:

1. **Værk** — vælg værket.
2. **Spørgsmål** — vælg en knap, fx "Hvad er tanken værd?" eller "Hvor følsom er økonomien for
   brændselsprisen?". En grå knap kan ikke bruges på værket; teksten siger hvorfor.
3. **Reference og scenarie** — appen laver to scenarier, der kun adskiller sig ved knappen. Vælg
   periode (start med et kort vindue: vinter 5.–16. januar 2026 eller sommer 8.–19. juni 2026) og om
   balancemarkedet skal med i begge. (Kilde: doc/KOERSEL.md:109-110)
4. **Bekræft og kør** — begge kørsler bestilles; referencen først.

**Én knap ad gangen.** Ændrer du flere ting på én gang, kan du ikke se, hvad der gjorde forskellen.
(Kilde: doc/KOERSEL.md:43-44)

**Varmelast.** Scenariet vælger, hvilken varmelast der regnes på: den **syntetiske** (af udetemperaturen), værkets
**aktive tidsserie**, en **anden af værkets gyldige tidsserier**, eller en af modelrepoets egne filer. Dækker
tidsseriens periode ikke scenariets, advarer appen. En kørsel gemmer, hvilken tidsserie den brugte — med
kontrolsum — så to kørsler altid kan sammenlignes på samme data. (Kilde: KONTRAKT §6d)

Et scenarie kan kun ændre felter, der allerede findes i værket. Periode, solvergab og tidsgrænse har
egne felter på scenariet. Skal der en ny enhed eller blok til, er det en ændring af værket.
(Kilde: KONTRAKT §3.5; KONTRAKT §6c)

Til differenser: brug gabet 0,0002 og det absolutte gab 100 kr. i både reference og scenarie; det
absolutte gab må ikke binde før det relative. (Kilde: doc/KOERSEL.md:57-60; src/config.py:742-751; knapper.json)

## 3. Kørslen — kø og status

Kørslen fryses med de værdier, der gælder, når du trykker. Retter nogen værket bagefter, påvirker
det ikke din kørsel. Kørsler regnes én ad gangen i den rækkefølge, de er modtaget; hver bruger kan
have højst 3 ventende. Status går *i kø → kører → indlæser → færdig* (eller *fejl* med en
forklaring). En kørsel i kø kan annulleres; en kørsel, der regner, stopper ved næste kontrol.
(Kilde: KONTRAKT §3.0; KONTRAKT §3.6; KONTRAKT §6c)

Typiske regnetider målt i Fabric: et vindue på 12 døgn ca. 10 sekunder; Billund Spor B (4 måneder)
1½ minut uden og knap 3 minutter med balancemarked; Andeby et helt år uden balancemarked knap 5
minutter og med balancemarked op til en time. (Kilde: README.md:148-151; demo_scenarier.json)

Status opdateres, mens fanen er åben og du har en kørsel i gang. Tryk **Opdatér** øverst til højre,
hvis du har været væk. (Kilde: KONTRAKT §6)

## 4. Analyser — læs svaret

Under **Analyser** ligger alle kørsler. Én kørsel viser samlet driftsomkostning (objektivet) med
opnået gab, produktionen pr. enhed, måned for måned, balancemarkedet pr. marked og produkt, tanken og
time-for-time-driften. Måneder er danske kalendermåneder. (Kilde: KONTRAKT §3.9)

**Data i denne kørsel.** Kørselssiden viser det fulde datagrundlag: hvilken version af df-data, hvilke datasæt der
indgik (spot altid; aFRR, mFRR og ubalance kun med balancemarked), DMI-område og priszone, varmelasten
(syntetisk med parametre, eller tidsseriens navn og kontrolsum), solprofilen og værkets revision.
(Kilde: KONTRAKT §6d)

**Sammenlign to kørsler** — en reference og et scenarie. Differensen er scenarie minus reference og
er svaret på spørgsmålet. Appen viser, om kørslerne er sammenlignelige (samme værk, periode,
opløsning, data og gab), og om differensen er mindre end solverens tolerance — så kan den ikke
skelnes fra nul. (Kilde: KONTRAKT §6b)

Tjek altid, om resultatet giver mening: kører enhederne i den rækkefølge, I kender? Er tanken tom
eller fuld hele tiden? "Det kan ikke passe" er det rigtige svar at give — find så ud af, om det
skyldes data, en antagelse eller modellen. (Kilde: doc/EGET_VAERK.md:113-116)

## 5. Information og Dokumentation

**Information** forklarer metoden emne for emne, har en ordliste og viser referencetallene ved siden
af de kørsler, der findes i appen. **Dokumentation** har modelrepoets vejledninger og rapport v4.

## 6. Kør i hånden (notebook)

Notebooken `fjv_koer_scenarie` i workspacet kan også startes direkte med et værk, ændringer og en
periode. Kørslen oprettes da selv i appen og kan ses og sammenlignes som alle andre. Se
"Kør i en notebook" under Dokumentation. (Kilde: KONTRAKT §5.1)
