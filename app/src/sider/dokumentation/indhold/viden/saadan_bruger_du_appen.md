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

## 7. Backup og flytning

Under **Scenarier › Backup og flytning** gemmer du scenarier og kørsler som et Excel-arkiv og importerer
det igen — som backup, eller for at flytte historikken fra en testinstallation til produktion (en ny
Fabric-installation starter med en tom database). **Eksportér arkiv** giver en .zip med én Excel-fil pr.
scenariefamilie (et scenarie og dets reference) og et manifest; på et scenarie giver **Eksportér til Excel**
én fil med scenariet, dets reference og de kørsler, du vælger. Kun færdige, fejlede og annullerede kørsler
kommer med. (Kilde: KONTRAKT §6e)

Arket **Læs mig** forklarer indholdet: app-version, modellens pin, hvem og hvornår. Hver tabel har sit eget
ark med danske overskrifter; tal står som tal, og hver tid står to gange — som Excel-dato i dansk tid og som
UTC-tekst, der er den, genimporten læser. Arket er en backup, ikke et redigeringsformat: hver tabel har en
kontrolsum i det skjulte ark `_manifest`, og et arkiv, hvor et tal er rettet, afvises. Åbn det skrivebeskyttet.
Eksporten tæller hver tabel i databasen og stopper, hvis en række mangler. Tal bevares med dobbelt præcision
(ca. 15–17 betydende cifre) — præcis som appen og regnemotoren læser og skriver dem. (Kilde: KONTRAKT §6e)

**Importér arkiv** viser først, hvad der vil ske — oprettes, findes allerede, konflikt eller kan ikke
importeres og hvorfor — og skriver intet, før du bekræfter. En kørsel importeres som historisk kørsel med
sit frosne input, sine pins og resultater uændret; den køres ikke om og kan sammenlignes som før. Den er
markeret *importeret fra arkiv* med dato og hvem. Samme indhold to gange springes over; en række, der
findes med andet indhold, er en konflikt og overskrives aldrig — det gælder også en kørsel, hvis tal er
ændret, og et scenarie, hvis ændringer er rettet her. Afbrydes en import, så importér igen — det, der
allerede er skrevet, springes over; en kørsel bliver først synlig, når alle dens rækker er på plads og
passer med arkivet. (Kilde: KONTRAKT §6e)

Værkerne er ikke med i arkivet. Upload værksarket først (Konfiguration); arkivet finder værket på dets
kode og tjekker, at værket her har haft præcis de parametre, kørslen bygger på. Det samme gælder en
varmelast eller solprofil, som kørslen bruger: den skal være uploadet med samme indhold og i samme rolle.
(Kilde: KONTRAKT §6e)
