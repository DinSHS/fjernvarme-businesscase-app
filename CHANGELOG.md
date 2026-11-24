# Ændringslog

Versionerne følger [semantisk versionering](https://semver.org/lang/da/): **MAJOR** ændrer en beregning, et skema, der
kræver migrering, eller noget, en bruger har bygget på; **MINOR** tilføjer noget bagudkompatibelt; **PATCH** retter
uden at ændre betydning. Versionen står i `app/package.json`, `app/rayfin/rayfin.yml` og
`community/fjernvarme_app/__init__.py` (wheel'en).

Hver version siger, hvilken model- og df-data-commit den er pinnet til, og hvilke trin en eksisterende Fabric-installation
skal køre ([`doc/FABRIC.md`](doc/FABRIC.md#opdatér-en-eksisterende-installation)). Tal fra før en ny modelpin kan ikke
sammenlignes med tal efter.

## [Ikke udgivet] — 0.5.0

Model **`939228a`** (modelrepoets v0.11.0; før `90fb16e`), df-data **`106b9fc`** (uændret). **Tallene er de samme som ved
`90fb16e`:** modelrepoets 0.10.0 (tekstfiler læses som UTF-8) og 0.11.0 (oliekedel) flytter ingen tal, og det er målt
gennem appens kæde: Andeby 5.–6. januar 2026 uden balancemarked **866.567,72 kr.** ved begge versioner, og 16 andre
kørsler (demo-scenarierne D01–D11, budstrategiens kontroltal, Spor A, Spor B og Billunds rullende år) er ens til øren
(`noter/maaling_model_939228a.md`). Kørsler ved `90fb16e` kan derfor sammenlignes med nye; kørsler ved `eef950a` og
ældre kan stadig ikke (spotrettelsen, se 0.4.0). df-data er ikke skiftet: modellen pinner ikke df-data, koden ved
`939228a` læser ingen ny datafil, og `bea2c1e` (modelrepoets CHANGELOG) afviger kun fra `106b9fc` i rækker fra
23. oktober 2026 og frem (målt).

**Det kræver af en installation.** Intet skemaskift og ingen migrering.

- **Lokal udgave:** byg og installér den nye wheel (README, *Kom i gang*: `npm run build:community`,
  `community/pakke.py`, `pip install … [model]`). Modelkoden ved `939228a` hentes som zip ved første kørsel (kræver net
  én gang). Databasen og datamappen bruges uændret.
- **Fabric:** `deploy.py kode` (motoren, feltkataloget og pins i `dbo.Motors`), appen (`rayfin-up`, eller de to deltrin
  i en installation med skemaafvigelsen) og `deploy.py koer fjv_importer_vaerker`
  ([`doc/FABRIC.md`](doc/FABRIC.md#opdatér-en-eksisterende-installation)). Casefilerne er uændrede mellem de to
  versioner, så importen melder repoværkerne som `uaendret`. En bestilling, der ligger i køen med de gamle pins,
  afvises; bestil den igen. Ikke afprøvet i Fabric.
  **Functions skal udrulles** (appens `rayfin-up`): `startBestilling` tager nu en lås pr. bestilling, før den læses,
  og svarer `teknisk`, når en fejl er teknisk (se *Rettet*). Brugerfladen tåler en ældre Functions: uden de nye
  svarfelter arkiverer den intet og genoptager bestillingen ved *Prøv igen*. I Fabric-udgaven bliver en afvist
  bestilling stående som `Bestilling`-række (funktionen kender ikke kalderen og sletter derfor ikke). Låsens SQL er
  ikke kørt mod en Fabric-database.
- **Værksark eksporteret før opgraderingen** kan ikke genuploades som en revision bagefter: arkets indholdshash dækker
  cellernes placering, og Priser-arkets rækker er rykket. Appen siger *eksportér igen*; eksportér værket på ny og før
  rettelserne over, eller upload arket som et nyt værk. (Udledt af koden, `analyse.ts`; ikke afprøvet med et gammelt ark.)
  Et ark bygget på modelrepoets gamle skabelon kan stadig uploades som nyt værk: modelscriptet læser Priser på
  etiketterne (modelrepoets CHANGELOG 0.11.0).

### Tilføjet
- **Oliekedel** (modelrepoets enhedstype `oil_boiler` med brændslet `fuel_oil`): typen kan vælges under *Konfiguration ›
  Tilføj enhed* og i guiden *Nyt værk*, med prisen *Fyringsoliepris* (`prices.fuel_oil.value`, kr. pr. MWh olie inkl.
  energiafgift) og CO₂-faktoren 0,266 t/MWh fra modelscriptet (tung fuelolie: ret til ca. 0,28). Mangler værket
  olieprisen, spørger *Tilføj enhed* om den og opretter den sammen med enheden. Valideringen kræver olieprisen og en
  CO₂-pris, som modellen og modelscriptet gør — i browseren og i den betroede logik i begge udgaver (fælles vektorer).
  Værksarket bærer oliekedlen (typen i Anlaeg, prisen i rækken *fyringsolie*; en anden CO₂-faktor end scriptets står i
  fanen *Start og drift*). I Analyser hedder enheden *oliekedlen*, og olieprisen er en brændselspris i knappen
  *Hvor følsom er økonomien for brændselsprisen?*. CO₂-opgørelsen er modellens egen og tæller olien med.
  Målt: Andeby med en oliekedel på 20 MW i stedet for gaskedlen, 5.–6. januar 2026: **1.083.242,38 kr.** direkte med
  `run_case.py`, ad appens bestillingsvej (timefil og KPI-fil ens byte for byte) og gennem hele arbejderkæden;
  5.–16. januar: 4.001.969,31 kr. ad alle tre veje (`noter/maaling_model_939228a.md`).
- `tjek_trofasthed.py` [5] holder appens enhedstyper, brændsler, CO₂-faktorer og priser op mod modelscriptets egne
  tabeller (modelspejlets `vaerksark_typer`). Før var gaten grøn med en app, der ikke kendte en ny enhedstype.
- `skabelon.spec.ts`: eksporten er bundet til selve skabelonfilen (etiketterne i Priser, hvert stilindeks, velformet
  XML, præcis én valgt fane). Rundturs-beviset har varianten `andeby_olie`.
- **Forslag om længere tidsgrænse**: stoppede en af et pars kørsler på solverens tidsgrænse, og er usikkerheden mindst
  10 % af forskellen (eller ukendt), er første næste skridt i anbefalingen en ny kørsel med længere tidsgrænse — med
  den nuværende grænse, appens loft (3.600 s) og et link til scenariet. De 10 % er appens egen antagelse. En færdig
  kørsel, der stoppede på tidsgrænsen, får mærket *Stoppet på tidsgrænsen* i kørselslisten, i Scenarier-oversigten og
  på scenariets side, som også viser usikkerheden.
- **Rækken *Alle lagre*** i lagertabellen i en sammenligning, og et forbehold i kortene *Lager* og *Intervaldispatch*:
  med flere lagre er fordelingen mellem dem ikke entydig. `bevis_app_vej.py` kræver fortsat byte-lighed (objektiv,
  `_hourly.csv`, `_kpi.csv`); er timefilerne ikke byte-ens, er casen en `FORSKEL`, og beviset skriver en diagnose af,
  om kun fordelingen mellem lagrene afviger — summen over lagre af niveau, netto, opladning og afladning, med endelige
  tal og komplette serier (`viden/vaerktoej/lagersum.py`, modprøver i `test_trofasthed.py`). Diagnosen giver ikke en
  bestået case. Målt 23. november 2026: beviset er byte-ens for Andeby i begge januarvinduer.
- Kørslens side advarer, når modelkoden eller df-data ikke er hentet som zip af regnemotoren (tomt
  `model_zip_sha256`/`data_zip_sha256`). En adresse, der ikke findes (`#/findes/ikke`), giver en besked i stedet for
  stille at vise Konfiguration.

### Ændret
- **Hvornår en differens er et resultat.** Et par vises kun som godt eller dårligt — virkningsfarve, grønt mærke,
  "billigere/dyrere", en anbefaling — når det er direkte sammenligneligt. Det kræver nu også **samme værksrevision**
  (appens egen antagelse; før en note). Ellers står tallene side om side med grunden først. Par på tværs af
  værksrevisioner forsvinder derfor fra *Anbefalinger*; kør referencen igen ved den nye revision.
- **Sammenligningssidens roller følger ændringen, ikke rækkefølgen i linket.** Scenariet er den kørsel, der bærer
  ændringen i forhold til værket; `#/analyser/sammenlign/<a>/<b>` betyder ikke længere altid "a er referencen".
  Siden siger, når rollerne er omvendt af valget, og *Byt reference og scenarie* vises kun, når ingen af kørslerne
  peges ud.
- **Intet årstal af en kortere periode.** Anbefalingen viste Δ × 365 / døgn for perioder på 7–364 døgn (12 januardøgn
  i Andeby blev til "ca. 715.000 kr." om året). Nu vises kun periodens beløb; et årstal står der alene, når perioden
  selv er mindst 365 døgn. Reglen og teksterne står i `viden/anbefalingsregler.json` (`aarstal`).
- **"Gentagelse"** kræver nu samme periode, ikke kun samme værk og navn, og mærket afhænger ikke af, hvilket par der
  blev kørt først. Perioden står ved scenariets navn i kørselslisten og i Scenarier-oversigten.
- **CO₂-udledningen vises som *ikke opgjort***, når en tændt enhed med fossilt brændsel (naturgas, fyringsolie) har
  produceret varme med emissionsfaktor 0 — som Billund-casene, hvor CO₂-omkostningen ligger i gasprisen. Før stod
  der "0 t". Appen gætter ingen faktor; økonomien er uændret (egen antagelse, `doc/TROFASTHED.md` §5).
  En enhed har produceret, når produktionen er over 0 *eller* den har mindst ét driftsinterval (modellen afrunder
  produktionen til 0,1 MWh, så en oliekedel med 0,04 MWh og én driftstime står med 0,0 MWh). Mangler tallene —
  ingen nøgletal for enheden, eller kørslens frosne input kendes ikke — står der *ukendt* med sin egen forklaring.
- **README-mærket i kørselslisten** følger referencens egne modelversioner: en Spor A-kørsel ved `90fb16e` eller
  `939228a` genkendes nu som README-referencen 5.204.555, og en gammel ved `eef950a` gør det ikke længere. Pinnens
  df-data (`106b9fc`, 26. oktober 2026) er en kendt commit.
- Begrundelsen ved *Kan ikke afgøres* siger, om det er solverens tolerance eller væsentlighedsgrænsen, der binder
  (eller begge); et gab over 0 og under 1 kr. skrives "< 1 kr." i stedet for "0 kr.". Knappen i *Nyt scenarie* hedder
  *Bekræft og kør scenariet*, når referencen genbruges.
- **Værksarkets skabelon ved `939228a`**: Priser har fået rækken *fyringsolie* (række 10), så CO₂ og alt under er
  rykket én række ned, og filen er nu skrevet direkte af openpyxl (før gemt af LibreOffice). Eksporten skriver i de nye
  rækker (ét sted: `PRISER_RAEKKER`), og Excel-skriveren bærer begge XML-former. Målt: `tjek_eksport_rundtur.py` 11
  værker, 0 fejl.
- **Referencetal**: README's Spor A-anker er regnet igen efter spotrettelsen (5.204.555 kr.; før 5.069.729). En
  reference kan nu bære sin egen liste af modelversioner (`regnet_ved`): Spor A måles ved `90fb16e` eller `939228a`, de
  fire øvrige README-tal stadig ved `eef950a`.
- Gatens undtagelse for modelforfatterens kontaktlinje i skabelonen peger på arkets XML (`offentlig/regler.json`): samme
  linje og samme regel som før, kun stien er flyttet med den nye skabelon.
- `PYTHONUTF8=1` er ikke længere nødvendig for modellen (0.10.0 læser selv UTF-8). Den sættes stadig: den skader ikke,
  og en kørsel ved en ældre pin kræver den på Windows.
- Vektorerne `skema/vektorer/fra_ts_testene` er optaget igen (to tilfælde fra runde 14c manglede).

### Rettet
Fundene fra den uafhængige test 18. november 2026 (appen ved `251aa93`). Beregningen var rigtig; fejlene lå i
præsentationen og i datahåndteringen omkring kørslerne.
- **Kørsler, der ikke kan sammenlignes, blev vist som et grønt resultat.** Sammenligningssiden farvede Δ
  driftsomkostning og satte mærket "Større end tolerancen" for to kørsler med hver sin periode, sit værk, sin
  opløsning, df-data, modelversion eller sit gab; advarslen stod i sjette kort. Samme fejl i kandidatlisten ("X kr.
  billigere end denne"), på scenariets kørselskort og i Scenarier-oversigten, som også viste et ΔRef fra en ældre
  kørsel ved siden af status "Fejl".
- **Scenarier og Analyser kunne dømme samme par forskelligt** (kodegennemgangen af runde 15). Scenarier havde sin
  egen regel: to ukendte felter talte som ens, og perioden blev sammenlignet som tekst, så et par uden kendt
  opløsning, pins og gab fik grønt mærke dér og "Kan ikke afgøres" i Analyser. Begge områder spørger nu den samme
  dom over kørslens frosne profil (rækkens egne felter, manifestet og det frosne input — aldrig scenariets levende
  felter). Kendes et nødvendigt felt ikke for begge kørsler, er dommen *kan ikke afgøres*: ingen farve og intet
  "billigere/dyrere", men heller ikke "kan ikke sammenlignes". Sammenlignelighedskortet påstår ikke "samme
  værksrevision", når revisionen ikke kendes, og vandfaldets fodnote nævner kun rød, når trinene er farvet.
- ***Scenariet fortalt* kunne fortælle den anden kørsel end nøgletallene.** Var kørslen, der bærer ændringen, valgt
  som reference (vejen fra kandidatlisten på referencens side), sagde teksten "dyrere" og nøgletallene "mindre end
  referencen" på samme side. På scenariets side kunne referencen blive fortalt som scenariet.
- **En knaps skabelon kunne vende brugerens reference og fortegnet** (kodegennemgangen af runde 15). I et værk med
  tanken slået fra blev scenariet "slå tanken til" læst som *Hvad er tanken værd?* vendt om: kørslen med ændringen
  blev reference, og ΔRef fik modsat fortegn. Rollerne fastlægges nu af parret (scenariets egen reference), ellers af
  den kørsel, der alene bærer ændringen, ellers af valgets rækkefølge; en skabelon genkendes kun i den retning.
  Kan den ikke genkendes, gives ingen anbefaling, men tal og fortegn følger det valgte par. På scenariets side
  fortælles historien i sidens roller, også når det er referencen, der bærer ændringen.
- ***Information › Referencetal* kunne dømme et ændret grundlag mod README-tallet** (kodegennemgangen af runde 15).
  Siden læste scenariet, som det så ud nu, og dets nuværende antal ændringer, og så hverken på værket eller på
  df-data: en kørsel af en rettet Spor A-case (værk i revision 2) stod som "uden for tolerancen" mod 5.204.555 kr., og
  en kørsel bestilt med en ændring fremstod som ren, når ændringen siden var fjernet fra scenariet. Nu er der én
  kvalifikation pr. README-reference, på kørslens frosne felter, og både *Referencetal* og mærket *README-reference*
  i Analysers kørselsliste bruger den. En uændret kørsel på et grundlag, der ikke er bekræftet som README's, står som
  *kørt på et andet grundlag* uden afvigelse.
- **En afvist bestilling efterlod `Scenarie` og `Bestilling`.** Solprofilens dækning tjekkes nu, før noget oprettes
  (med backendens regel). Bliver en bestilling alligevel afvist, afhænger resten af udgaven:
  - *Lokal udgave:* den betroede logik sletter bestillingen i den samme transaktion, som afviser den — under en lås
    pr. bestilling, kun når kalderen (sessionens bruger) er bestillingens ejer, og kun hvis ingen kørsel peger på
    den — og svarer `ryddet`. Først da arkiverer parflowet de scenarier, det selv nåede at oprette.
  - *Fabric-udgaven:* funktionen kender ikke kalderen (tokenet bærer ingen e-mail) og sletter derfor ikke.
    Bestillingen og scenariet bliver stående.
  - *Begge:* *Prøv igen* genoptager den eksisterende bestilling (før spærrede dens unikke klientnøgle med
    "Bestillingen er allerede sendt"). En teknisk fejl svares som `teknisk` og arkiverer aldrig noget; før blev
    scenariet arkiveret på enhver fejl, og genforsøget efterlod et nyt, tomt scenarie.
- Den skjulte datatabel bag *Δ driftsomkostning pr. par* viste "Scen 0,0 · Ref 0,0" for hvert par; grafen var rigtig.
- **To egne valg stod uklart** (kodegennemgangen af runde 15). Lagerkortene sagde, at fordelingen mellem flere lagre
  "følger casefilens skrivemåde"; det er ikke målt, og de siger nu, at årsagen ikke er fundet (som
  `doc/TROFASTHED.md` §4b). *Tilføj enhed* og guiden *Nyt værk* mærker skabelonens tal som appens egne forslag
  (*egen antagelse*): for oliekedlen 15 MW, virkningsgrad 0,95, D&V 30 kr./MWh og startomkostning 500 kr.; kun
  CO₂-faktoren er modelrepoets. Tallene står i `doc/TROFASTHED.md` §5.
- `doc/TROFASTHED.md`: "samme timefil" gælder mod appens egen casefil; solprofilens kolonnenavn `mw` (modellens
  `power_mw`) og den ændrede sha256 står som *egen antagelse*.
- **En applås uden svar kunne tælle som tildelt** (efterprøvningen af rettelserne i runde 15, fund I). Den lokale
  udgaves kvotelås kaldte `sp_getapplock` uden at læse returværdien: ved en timeout på SQL Server kunne to
  bestillinger fra samme bruger begge tælle køen. Fabric-udgaven læste en manglende svarrække som tildelt. Begge
  udgaver har nu ét tjek for alle tre låse (kvote, bestilling, arkivets kørselslås): kun et gyldigt, ikke-negativt
  svar er en lås. Kun relevant på SQL Server; sqlite og PostgreSQL er uændrede. Ikke kørt mod en SQL Server.
- **Arkivimporten kunne efterlade en kørsel uden sin `Bestilling`** (efterprøvningen af rettelserne, fund A; kun lokal
  udgave på en delt PostgreSQL- eller SQL Server-database). Importen læste den importerede bestilling og indsatte
  derefter den historiske kørsel; imellem de to kunne ejerens afviste bestilling blive ryddet. Kørselsdelen tager nu
  bestillingens lås — den samme, som bestillingsvejen tager — før bestillingen læses, i sorteret orden ved flere
  bestillinger. Ingen fremmednøgle i denne runde. sqlite kan ikke genskabe kapløbet (én skriver ad gangen); det er
  afprøvet mod en model med READ COMMITTED og ventende låse, ikke mod en rigtig PostgreSQL eller SQL Server.
- **En kollega kunne få en andens bestilling behandlet** (efterprøvningen af rettelserne, fund C). Ejerskabet var kun
  et værn mod sletning: et direkte kald til `startBestilling` med en andens bestillings-id oprettede kørslen i ejerens
  navn og brugte ejerens køkvote. *Lokal udgave:* kun bestillingens ejer (sessionens bruger) kan nu få den behandlet;
  tjekket står før opslaget af en eksisterende kørsel og før frysningen, og en anden får "Bestillingen er oprettet af
  en anden bruger …". *Fabric-udgaven:* uændret — funktionen har intet identitetsgrundlag (tokenet bærer ingen
  e-mail). Begrænsningen står i [`doc/FABRIC.md`](doc/FABRIC.md#det-der-gælder-altid).
- **Beviset sammenlignede et afrundet objektiv** (efterprøvningen af rettelserne, fund H).
  `viden/vaerktoej/bevis_app_vej.py` læste manifestets objektiv, som modellen afrunder til hele kroner, og
  sammenlignede de to filer på de første 16 hextegn af deres SHA-256. Det læser nu modellens uafrundede
  `objective_value` fra `_dispatch.nc` (begge veje skriver den) og sammenligner hele SHA-256; uden et fuldt, endeligt
  objektiv består en case ikke. Scriptet kræver derfor xarray (fra modellens pakker). Målt igen 23. november 2026:
  Andeby 5.–6. januar 2026 giver 866.567,7207319243 kr. ad begge veje, begge filer byte-ens; de 7 cases
  10.–11. marts 2026 er stadig 7 af 7.
- **Et mistet svar kunne give en ekstra kørsel** (efterprøvningen af rettelserne, fund B). Committede serveren en
  kørsel, og svaret gik tabt, glemte *Kør scenariet* sin klientnøgle, og næste klik bestilte en kørsel mere; *Bestil
  en prøvekørsel* oprettede desuden et nyt scenarie pr. klik. Alle tre indgange (også parflowet) beholder nu
  klientnøgle og scenarie, til udfaldet er kendt: et nyt klik sender samme bestilling, og der kommer højst én kørsel.
  Et svar, hvor ingen ved, om kørslen blev bestilt (et afbrudt kald eller en teknisk fejl), siger det — "Vi ved ikke,
  om kørslen blev bestilt — prøv igen" — i stedet for "blev ikke bestilt", og knappen hedder *Prøv igen*. En afvisning,
  hvor bestillingen blev stående (Fabric-udgaven), genoptages ligeledes med samme nøgle. Nøglen huskes i fanen, også
  hen over en genindlæsning af siden (se næste punkt).
- **En redigering kunne kvitteres som en kørsel med de gamle input** (tredje rettelsesrunde, P2-1). Var første forsøg
  nået frem til serveren, uden at svaret kom hjem, og rettede man derefter scenariet, sendte næste klik samme
  bestilling og kvitterede "Kørslen er bestilt" — for kørslen af det gamle indhold. Et forsøg hører nu til brugeren
  og til det indhold, der blev bestilt (et fingeraftryk af det gemte scenarie og værkets revision). Uændret indhold:
  *Prøv igen* genoptager som før, og knappen viser den åbne tilstand, også når siden åbnes igen. Ændret indhold:
  der bestilles en ny kørsel, og blev det gamle forsøg til en kørsel, står det i kvitteringen med kørslens id. Kan
  det gamle forsøg ikke slås op, bestilles intet nyt, før det kan. Forsøget gemmes i fanens `sessionStorage`, så en
  genindlæsning efter et tabt svar ikke længere giver en ekstra kørsel; en anden fane kender det ikke.
- **Et sent svar kunne slette et nyere bestillingsforsøg** (fjerde rettelsesrunde, punkt 1). Var svaret på en
  bestilling stadig undervejs, da man rettede scenariet og bestilte igen (ny nøgle), slettede det sene svar det nyere
  forsøg — også det gemte. Gik svaret på den nye bestilling så tabt, gav næste klik efter en genindlæsning en tredje
  kørsel. Et svar afslutter nu kun det forsøg, der bærer samme klientnøgle som kaldet.
- **PostgreSQL brugte samme 32-bit låsenøgler på tværs af tre låsetyper** (tredje rettelsesrunde, P3-6; kun den
  lokale udgave på PostgreSQL). Kvotelåsen, bestillingens lås og arkivets kørselslås blev alle taget som
  `pg_advisory_xact_lock(hashtext(navn))` — ét fælles rum, hvor præfikset ikke skiller typerne efter hashing. Ramte
  en brugers kvotenøgle en kørsels nøgle, kunne en arkivimport og en bestilling låse hinanden fast (statisk fundet;
  sjældent). Hver låsetype har nu sit eget låserum (to-nøgle-formen), og hvor flere låse tages på én gang, tages de
  faktiske nøgler sorteret og uden dubletter. Ikke kørt mod en PostgreSQL-server: prøvet mod en optagende forbindelse.
  SQL Server (hele ressourcenavne) og SQLite (`BEGIN IMMEDIATE`) er uændrede.
- **Trofasthedstabellen kaldte værksrevisionen et ubetinget krav** (tredje rettelsesrunde, P3-5). Rækken *Hvornår en
  differens er et resultat* i `doc/TROFASTHED.md` §5 sagde "samme værk og værksrevision" og senere, at en ukendt
  revision kun er en note. Koden følger det sidste. Kravsætningen siger nu, at to forskellige **kendte**
  værksrevisioner spærrer, og at en manglende revision (ældre data) er en oplyst undtagelse — appens egen antagelse.
  Kun ordlyden er ændret; reglen er den samme, og en test binder de to.
- **Fabric og den lokale udgave tolkede en uventet låsekode forskelligt** (tredje rettelsesrunde, P3-4). Svarede
  `sp_getapplock` med en positiv kode ud over de dokumenterede (fx 2), tog Fabric-udgaven det som en tildelt lås
  ("helt og ikke-negativt"), mens den lokale udgave kastede. Begge kræver nu netop 0 (tildelt) eller 1 (tildelt efter
  ventetid); alt andet — også en manglende række — ruller transaktionen tilbage. Ingen kendt vej giver koden 2.
- **Lagerdiagnosen kunne afbryde hele bevisrapporten** (tredje rettelsesrunde, P3-3). Afveg to timefiler, læste
  `bevis_app_vej.py` dem som tekst for at diagnosticere forskellen — uden for fejlgrenen. En timefil med en ugyldig
  UTF-8-byte stoppede derfor programmet før de næste cases og før `resultat.json`. Diagnosen kaster ikke længere:
  casen står som *FORSKEL* (det var den allerede), og rækken får `diagnose.fejl` med navnet på den side, hvis fil
  ikke kunne læses. En fejlet diagnose tæller aldrig som "kun fordelingen mellem lagre".
- **Sammenligningssiden fortalte stadig om en differens ved ukendt dom** (tredje rettelsesrunde, P3-2). Tre steder
  spurgte ikke dommen: rollekortet *Reference og scenarie* viste formlen "ΔRef = scenarie − reference", selv om siden
  intet ΔRef viste; *Sammensætning måned for måned* udpegede den største forskydning i andele ("går fra 40 % til
  60 %") eller erklærede andelene ens; og *Varmeproduktion*, *Balancemarked* og *Lager* havde kolonnerne *Ref* og
  *Scen* uden kørslens egen periode. Ved en ukendt dom er formlen nu væk, sammensætningskortet beskriver de to
  niveauer side om side uden at udpege en ændring, og niveaukolonnerne og de to paneler bærer hver sin periode.
- **Sammenligningen læste værkets tid med en anden grammatik end arbejderen** (tredje rettelsesrunde, P3-1). Står
  værkets `time.start` som `2026-01-05T00:00:00+00` (kort nul-offset), læser arbejderen og modellen det som midnat
  UTC; browseren kunne ikke, så to kørsler på værkets egen tidsblok — en manuel kørsel, et importeret arkiv — fik
  dommen *ukendt* og mistede ΔRef. Omvendt blev 30. februar til 2. marts, hvor arbejderen afviser datoen. Den
  effektive periode udledes nu med arbejderens grammatik; formerne er målt på arbejderen i de fælles vektorer
  (`skema/vektorer/modeltid/former.json`), og browseren prøves mod dem. Bestillingens egen kontrol er uændret.
- **En tidsstoppet kørsel kunne få en fejldom mod README** (tredje rettelsesrunde, P2-6). Om en kørsel var en måling
  af et README-tal, blev afgjort på det ØNSKEDE gab. En Spor A-kørsel bestilt med casens gab, men stoppet på
  tidsgrænsen med et opnået gab på 33 %, stod derfor som *uden for tolerancen* under *Information › Referencetal* og
  som *README-reference* i Analyser. En måling kræver nu en afsluttet løsning inden for casens gab: solveren meldte
  optimal, og det opnåede gab er kendt og inden for casens relative eller absolutte gab. Ellers vises kørslen ved
  siden af README-tallet som *ikke løst til casens gab* med sin solverstatus ("stoppet ved tidsgrænsen; opnået gab
  33 %") — uden afvigelse og uden dom — og den får ikke README-mærket i Analyser. **Følge, man skal kende:** en ældre
  kørsel uden gemt opnået gab eller solverstatus er ikke længere en måling, også når den var optimal. En kørsel med
  et teknisk testnavn (`probe-…`), der er en måling, viser nu *Røgtest* ved siden af *README-reference*.
- **Historien og anbefalingen kunne sige hver sin retning om varmelasten** (tredje rettelsesrunde, P2-5). *Scenariet
  fortalt* kendte alle retninger, men anbefalingen brugte knappens ene sætning — "Målt varmelast i stedet for syntesen
  flytter … et mål for syntesens fejl" — for enhver forskel i varmelast: også med målt reference og syntetisk
  scenarie, og mellem to målte filer, hvor ingen side brugte syntesen. Den effektive varmelast klassificeres nu ét
  sted (syntese → måling, måling → syntese, måling → måling), og historien, anbefalingens sætning og valget af
  knappens skabelon læser alle den. De to nye sætninger er appens egne formuleringer. Parentesen i sætningen er
  forskellen i procent af referencens driftsomkostning (før stod den tom). Faglig lighed afgøres på indholdet: to
  uploads med hver sit id og samme sha256 er samme varmelast og fortælles ikke længere som et skift med en virkning;
  id'erne står fortsat i den tekniske inputvisning.
- **Ubrugte solprofiler kunne gøre et gyldigt par ukendt** (tredje rettelsesrunde, P2-4). To kørsler med samme værk,
  revision, pins, gab og periode kunne have hver sin frosne solprofil, selv om ingen af dem brugte en (værkets aktive
  profilfil var skiftet, og værket har ingen aktiv solvarmeenhed) — og dommen blev *kan ikke afgøres*. En serie, som
  begge kørslers manifest dokumenterer som ubrugt (regnemotorens registrering), indgår ikke længere i dommen;
  tabellen skriver "(bruges ikke)". Kun på begge sider: er serien brugt eller udokumenteret på den ene, er dommen som
  før. Desuden er modelrepoets egen profilfil og den samme fil frosset som tidsserie nu samme kilde, når den frosne
  profilsti og modelversionen beviser det — i dag Andebys `data/solar_andeby_dmi_karup.csv` ved `eef950a`, `90fb16e`
  og `939228a` (`viden/referencetal.json` › `solprofil_sti`, `solprofil_model_commits`). Den korte frosne profil,
  oversigten og kandidatlisten henter, tager derfor også enhedernes profilsti med (filter `endsWith`; ikke kørt mod
  DAB i Fabric). Sammenligningskortet siger nu, HVORFOR en forskel ikke spærrer: valgt i scenariet, ubrugt i begge,
  eller samme fil — før hed alle tre "valgt i scenariet".
- **Analysers kopi af README-referencerne var forældet** (fundet i tredje rettelsesrunde). De to Andeby-referencer
  fik i anden rettelsesrunde deres egen solprofil (`solprofil_sha256`), men den genererede kopi, Analysers
  kørselsliste læser (`sammensaetning.data.ts`), blev ikke bygget igen. En Andeby-kørsel med casens egen solprofil
  frosset som tidsserie var derfor en måling under *Information › Referencetal* og "kørt på et andet grundlag" i
  Analyser. Kopien er bygget igen, og en test binder den til `viden/referencetal.json`.
- ***Målt varmelast* mistede resultatet for værkets egne tidsserier** (tredje rettelsesrunde, P2-3). Parret er en
  syntetisk reference mod et målt scenarie. Referencens udtrykkelige valg af syntesen frøs ingen række, så det frosne
  input ikke kunne bevise valget, og over for en af værkets egne serier blev dommen *kan ikke afgøres* — uden ΔRef og
  anbefaling. Valget fryses nu som `_koersel.tidsserie.varmelast = "syntetisk"` i begge udgaver: samme række, som den
  manuelle vej altid har skrevet, og som arbejderen læser som "ingen tidsserie" — intet nyt rækkeskema og intet nyt
  format hos arbejderen. Ikke sammen med en af modelrepoets varmelastfiler (dér bruger arbejderen filen, og filen er
  beviset). Arkivets tjek og visningerne læser rækken som "ingen tidsserie"; før afviste arkivimporten en kørsel med
  den række ("mangler id eller sha256"), og kørselslisten skrev "Målt · tidsserie ukendt" for den.
  **Følger, man skal kende:** ældre kørsler uden rækken forbliver *kan ikke afgøres* over for en serie, og en ældre
  syntetisk reference genbruges ikke til et nyt par — der bestilles en ny, som bærer beviset. To forskellige af
  værkets egne serier over for hinanden er fortsat *kan ikke afgøres*. I Fabric virker det først, når Functions er
  udrullet; et arkiv med rækken afvises af en ældre Functions-udgave med en læselig besked.
- **Et kort opslagssvigt kunne udløse en ekstra kørsel** (tredje rettelsesrunde, P2-2). Et genforsøg slår den
  eksisterende bestilling op på klientnøglen. Fejlede netop det opslag et øjeblik, blev svaret til "Bestillingen er
  allerede sendt", nøglen blev skiftet, og næste klik bestilte en kørsel mere; parflowet arkiverede desuden det
  scenarie, det selv havde oprettet. Et opslag, der fejler teknisk — eller svarer tomt i modstrid med databasens
  unikhedsfejl — er nu *uafklaret*: samme nøgle næste gang, og intet arkiveres. Det samme gælder et kald til
  `startBestilling`, der afvises, efter at bestillingen er oprettet. Kun bekræftet fravær (rækken blev aldrig oprettet,
  eller nøglen er en andens) og serverens udtrykkelige `ryddet` giver en ny nøgle.
- ***Scenariet fortalt* kunne sige det modsatte om varmelasten** (efterprøvningen af rettelserne, fund G). En
  reference med målt varmelast og et scenarie med syntesen blev fortalt som "bruger vi målt varmelast (–) i stedet for
  syntesen", og to tidsserier med samme navn som "samme input". Historien bærer nu seriens id og sha256 frem til
  teksten, som formulerer alle retninger: syntese → måling, måling → syntese og serie → anden serie, med seriernes
  navne (og deres sha256, når navnene er ens eller ukendte). Det samme gælder modelrepoets varmelastfiler.
- **Periode og datagrundlag kunne give en fejlagtig grøn dom** (efterprøvningen af rettelserne, fund D).
  - *Perioden.* Modellen har to regler: scenariets slutdato er hele døgnet (til kl. 23 UTC), værkets egen `time.end`
    som bar dato er midnat. Sammenligningen udvidede begge til kl. 23, så et værk med `time.end: 2026-01-06` og et
    scenarie med slutdato 6. januar (25 mod 48 timer) stod som samme periode. Perioden udledes nu af kørslens frosne
    input med arbejderens egen regel, ens i Scenarier og Analyser; modellens manifest bærer kun datoer og er kontrollen.
    Kan perioden ikke udledes af det frosne, er dommen *kan ikke afgøres*.
  - *Varmelast og solprofil.* Blev en anden tidsserie gjort aktiv på værket mellem to kørsler, skiftede den frosne
    seriehash uden at værksrevisionen gjorde det, og parret fik grønt mærke og ΔRef. De to kørslers frosne varmelast og
    solprofil holdes nu op mod hinanden. Et udtrykkeligt scenarievalg, som det frosne input kan bevise (en af
    modelrepoets varmelastfiler), er parrets ændring og spærrer ikke; ellers er dommen *kan ikke afgøres*.
    **Følge, man skal kende:** det frosne input viser i dag ikke, om en af værkets egne tidsserier er valgt i scenariet
    eller arvet fra værket. Et par, hvor scenariet bevidst bruger en anden af værkets egne serier (fx *målt mod
    syntetisk varmelast* på et værk med uploadet varmelast), står derfor som *kan ikke afgøres* uden ΔRef, indtil
    frysningen bærer valgets oprindelse. Par med modelrepoets varmelastfiler (Billund) er uændrede.
  - *Scenarier* dømmer på de frosne input: scenariets side bruger dem, den allerede henter, og oversigten og
    kandidatlisten henter en kort frossen profil (kørslens egne rækker og værkets tidsblok). Oversigtens fodtekst
    kalder ikke længere en ukendt værksrevision et krav.
- **Sammenligningssiden viste differenser og farver ved en ukendt dom** (efterprøvningen af rettelserne, fund E).
  *Δ driftsomkostning* viste stadig et tal under mærket "Kan ikke afgøres"; vandfaldets fodnote sagde "op = dyrere";
  *Varmeproduktion pr. enhed*, *Måned for måned* og *Lager* spurgte slet ikke dommen, så farvevalget (Retning eller
  Heatmap med rød/grøn) kunne farve et ΔRef efter fortegn; og balancekortet sagde, at kørslerne "afviger" i en
  modelversion, der blot ikke kendes. Alle kort spørger nu samme dom. Ved *kan ikke afgøres* står de to kørslers tal
  side om side med hver sin periode — uden afledt Δ, uden retningsfarve, uden prisord og uden vandfald — og
  balancekortet siger, hvad der mangler. Ved *ikke direkte sammenlignelige* er ΔRef neutralt, og farvevalget er slået
  fra. Kortet *Kan de to kørsler sammenlignes?* viser også varmelast og solprofil.
- **En kørsel på en anden varmelast kunne blive målt mod README-tallet** (efterprøvningen af rettelserne, fund F).
  En af værkets tidsserier gjort aktiv fryses i kørslen uden at stå som en scenarieændring, og README-kvalifikationen
  læste kun scenariets varmelastfil: en Spor A-kørsel på en anden varmelast stod som "uden for tolerancen" under
  *Information › Referencetal* og med mærket *README-reference* i Analyser. Kvalifikationen holder nu kørslens frosne
  varmelast og solprofil op mod referencens grundlag, før en afvigelse regnes; ellers står kørslen som *kørt på et
  andet grundlag* med grunden. De to Andeby-referencer bærer den målte hash af casens egen solprofil
  (`viden/referencetal.json`). Målingen går desuden forud for navnereglen for røgtests, og kun en færdig kørsel kan
  være en måling — så *Referencetal* og kørselslisten altid placerer samme kørsel ens.

## [Ikke udgivet] — 0.4.0

Model **`90fb16e`** (før `eef950a`), df-data **`106b9fc`** (uændret). **Tallene kan ikke sammenlignes med før:** modellen
regner nu spotprisen som middel af timens fire kvarterer, hvor den før tog timens første kvarter (modelrepoets `5021a5e`).
Det ændrer alle kørsler, der omfatter perioden fra 1. oktober 2025; perioder før er uændrede (målt: Andeby 4.–5. august
2025 giver 7.688,88 kr. ved begge versioner). Andeby 5.–6. januar 2026 uden balancemarked: **866.567,72 kr.** (før
867.031,23). Fabric for modelskiftet: `deploy.py kode` og `deploy.py koer fjv_importer_vaerker`
([`doc/FABRIC.md`](doc/FABRIC.md#opdatér-en-eksisterende-installation)); versionens øvrige trin står under punkterne.

**Skemaversion 2 — kræver migrering** (runde 14b). Et værk med mange enheder og balancemarked kunne regnes, men ikke
gemmes: én time fyldte mere end databasens 4.000 tegn (målt i Fabric: 17 enheder 4.002 tegn; 40 elenheder ca. 21.000).
Resten af timen står nu i den nye tabel `KoerselTimeDel`, og intet tal ændres eller afrundes. Ingen kodning inden for
4.000 tegn kunne bære 40 enheder, og `NVARCHAR(MAX)` kan DAB ikke bruge (`noter/maaling_timebredde_r14b.md`). Kørsler og
arkiver fra før læses uændret. **Lokal udgave:** `python -m fjernvarme_app migrer --data <mappe>` én gang (SQLite-filen
kopieres først). **Fabric:** `rayfin-db-apply`. I en installation med skemaafvigelsen (409) virker det først, når
afvigelsen er løst; indtil da kan koden udrulles med deltrinene. Så afvises kun brede værker, og beskeden siger
hvorfor ([`doc/FABRIC.md`](doc/FABRIC.md#opdatér-en-eksisterende-installation)).

### Tilføjet
- Farvestyring i tabellerne med Δ-tal (kørsel og sammenligning): *Ingen*, *Retning* og *Heatmap*, med farver efter
  IBCS-polaritet og WCAG AA-kontrast. Arbejdet foregår på grenen `runde9/heatmap`.
- Sammenligningen har kortet **Sammensætning måned for måned**: Ref og Scen som små multipler på samme skala med
  enhedskulører og varmebehov, og en tabel med rækkegrupperne Reference og Scenarie (runde 11). Det står før
  ΔRef-kortet *Måned for måned*, som er uændret bortset fra afgrænsningen "ΔRef = Scen − Ref".
- Vælgeren **MWh · % af total** på sammensætningen (kørsel og sammenligning): under % af total er hver søjle 100 % —
  enhedens andel af månedens (eller hele periodens) produktion; tooltip viser både energi og andel. Huskes pr. bruger.
- Farvevalget i et kort gælder nu også kortets variansgraf (ΔRef-søjler og ΔRef%-nåle): Retning og Heatmap tegner dem i
  farvesættets farver; `Ingen` er uændret IBCS (`app/IBCS.md` AF7).

- **Eksportér værksark (.xlsx)** (runde 12): et værk som modelrepoets egen `vaerksdata_skabelon.xlsx` udfyldt i
  browseren (begge udgaver; fflate 0.8.3, MIT). Listen "ikke med i arket" vises før download. Genupload af arket
  genkendes (skjult ark `_app`): diff før bekræftelse, og arket gemmes som **ny revision af samme værk** — kun
  forskellen mellem modelscriptets læsning af appens nye eksport og af arket. Konflikt ved en nyere revision; intet
  gemmes uden ændringer. Gaten har trinnet *eksport rundtur* (`viden/vaerktoej/tjek_eksport_rundtur.py`).
- Rettet efter Codex' review K11 (runde 12b), før udgivelse:
  - Importen binder selv arket til værket i sin transaktion: markeringen (format 2) bærer værkets *grundlag* og de
    erklærede afvigelser, og basis skal være værkets eksport. Et ark fra et andet værk eller en forfalsket basis afvises.
  - Objektnavne, modelscriptet normaliserer (`halm__kedel` -> `halm_kedel`), føres tilbage til værkets objekt;
    sammenfald nægtes ved eksport og afvises ved import. Nye enheds- og tanknavne skal være slug-faste.
  - En tidsserierettelse via genupload er en revision (Aendringslog `tidsserie.<rolle>`, `forventet_revision`).
  - Upload-kortet binder fil, bytes og analyse med et valg-id; et sent analysesvar ignoreres.
  - Felter, genupload ikke gemmer (årsproduktionen i Timedata!B3, værkets navn …), markeres før bekræftelse.
  - Eksporten oplyser timer, modelscriptet selv udfylder i solprofilen, og nægter kontroltegn og `_xHHHH_`-tekst.
- **Udvidet værksark** (runde 14): det eksporterede ark har tre faner mere, som er **appens egne** — *Start og drift*
  (i drift, tændt ved start, start/stop-logik, CO₂-faktor, idriftsættelsesår og noter pr. enhed; indhold ved start,
  varmetab og slut-som-start pr. tank), *Balancemarked* (hele `balancing`-blokken og enhedernes budfelter) og *Øvrige
  felter* (hvert resterende felt med sti, værdi og forklaring fra feltkataloget). Modelrepoets skabelon og
  `scripts/vaerksark_til_yaml.py` bruges uændret og læser ikke fanerne; importen lægger deres værdier oven på
  scriptets læsning (`fabric/fjv/arklag.py`) — ved upload som nyt værk og ved genupload som revision — og validerer
  hver værdi som en redigering i appen (feltkataloget, typen, modellens minimumskrav). Egen antagelse:
  [`doc/TROFASTHED.md`](doc/TROFASTHED.md#5-egen-antagelse--hvor-appen-bevidst-afviger-eller-tilføjer).
  - Listen "ikke med i arket" er målt gået fra 71–106 felter pr. katalogværk til 0 (Billund-værkerne) og 1 (Andeby:
    solprofilens sti). Slåede-fra enheder og tanke står nu i Anlaeg med "i drift: nej".
  - En række i *Øvrige felter* kan være betinget (*kun hvis modelscriptet giver*): den viger for en rettelse i
    modelrepoets faner, og importens log siger det. Appens faner kan ikke tavst skjule en celle.
  - Revisionssporet: et nyt værk fra et ark med appens faner er **revision 2** (revision 1 er modelscriptets læsning),
    og hvert felt fra fanerne bærer kilden som kommentar. Markeringen `_app` er format 3 og bærer tallenes skrivemåde
    (96 mod 96,0); et ark i format 2 afvises som revision med en klar besked og importeres som nyt værk som før.
  - Gaten (`tjek_eksport_rundtur.py`) uploader hver eksport som nyt værk gennem importens egen kode og kræver det
    oprindelige værk blad for blad (bortset fra en eksplicit, begrundet liste) og samme `run_case`-objektiv, også med
    balancemarked. Nye fælles vektorer: `skema/vektorer/arklag/celler.json` (en celle som `vaerdi_json`).
  - Ingen skemaændring. Fabric: `deploy.py kode` (nye motormoduler og `felt_katalog.json` ved motoren), `deploy.py
    notebook` (kun dokumentationscellen i `fjv_importer_vaerksark` er ændret) og frontend (`rayfin up`); ingen `db apply`.
- **Værksarket efter brugertest og review** (runde 14, rettelser): en tom celle i appens faner betyder nu, at appen ikke
  rører feltet (modelscriptets værdi); `(findes ikke)` betyder, at feltet ikke sættes. Ny forreste fane *Læs først* med
  værkets identitet og stederne, hvor modellens faner ikke viser det, modellen bruger. Nettilslutning og modelperiode i
  blokken *Værket* i *Start og drift*; danske lister med koden i parentes; stien til højre i *Øvrige felter*; advarsel
  ved start/stop-logik nej med startomkostning; *Opret som nyt værk i stedet* ved upload og en tom skabelon med appens
  faner. Importen afviser en formel uden gemt resultat og en celle uden for regnearkets grænser, læser kun eksisterende
  rækker og har egne ressourcegrænser (Codex' review, fund 1–2), og kontrollen af basis dækker de felter, appens faner
  kan gemme (fund 3).
- **Højlydt import af værksarket** (runde 14, gælder også ark uden appens faner): en række i Anlaeg med navn, men uden
  type (eller omvendt, eller kun tal), en tank uden volumen eller under de seks tankrækker og et målepunkt under
  varmepumpens tabel afviser importen med rækkenummer — modelscriptet springer dem over uden besked (målt: otte af et
  værks 17 enheder forsvandt). Importens log advarer, når hver styrbar enhed står til slukket ved start: uden tank kan
  værket ikke dække den første time (scriptet skriver `initial_status: 0`).
- **Backup og flytning** (runde 13, `#/scenarier/arkiv`): scenarier og kørsler eksporteres til Excel og genimporteres
  tabsfrit — som backup og som vejen fra en testinstallation til produktion. Én .xlsx pr. scenariefamilie (et
  scenarie og dets reference) eller alt som .zip med manifest; ark *Læs mig*, ét ark pr. tabel med danske
  overskrifter, tid i dansk tid og UTC, skjult `_manifest` med rækketal og sha256 pr. tabel. Genimporten viser en
  forhåndsvisning, er idempotent på id, viser konflikter uden at overskrive, afviser et rettet arkiv og skriver en
  kørsel som historisk kørsel (markeret *importeret fra arkiv*). Ny Function `importerArkiv` (Fabric) og samme forløb
  i den lokale server (`logik/arkiv.py`, bundet af `skema/vektorer/arkiv/`). Ingen skemaændring.
  Fabric: deploy Functions og frontend (`rayfin up`); ingen `db apply`.
- Arkivet rettet efter Codex' review K10 (runde 13b, formatversion 2 — arkiver fra før kan ikke læses): et scenarie skrives
  sammen med sine ændringer; en kørsel skrives først, når dens rækker har arkivets antal og indhold (sha256 pr. undertabel)
  under en lås pr. kørsel, og en eksisterende kørsel er kun "findes", hvis dens rækker også passer; eksporten tæller hver
  tabel i databasen (ny Function `arkivTal`) og tjekker `input_hash`; tidsserier matches på rolle og sha256; delene deles
  efter bytes; afledte kolonner er entydigt kodet. Tal arkiveres med dobbelt præcision (ca. 15–17 betydende cifre), som
  appen læser dem; har en databaseværdi flere cifre (skrevet udefra med SQL), arkiveres den afrundede værdi (runde 13c).
  Function'en sender decimaler som ren decimaltekst uden eksponent (`1e-7` -> `0.0000001`), og den lokale udgave stopper
  ved en fejlet `sp_getapplock` (returkode < 0).

### Ændret
- **Modelversion `90fb16e`** (spot midles over timens kvarterer). En time, der kun har to eller tre kvarterpriser, stopper
  kørslen med en dækningsfejl; arbejderens hjælpetekst og appens råd siger det. Information › Data og fodnoten i *Data i
  denne kørsel* følger kørslens modelversion: kørsler ved `eef950a`/`b49aeb0` beholder "timens første kvarter".
- Modelrepoets README-tabel, `doc/` og rapport v4 er ved `90fb16e` stadig regnet før spotrettelsen (modelrepoets
  README.md:20-27). Information › Referencetal, Budstrategi og METODE §7 viser dem som det og sætter vores egne målinger
  ved `90fb16e` ved siden af. Sammenligningen *README mod Fabric* tæller fortsat kun kørsler ved `eef950a`, den version
  README-tallene er regnet ved (`viden/referencetal.json` › `model_commit`, `regnet_ved`). Billunds rullende år og Andeby
  helår med balancering nåede ikke optimum lokalt (gab 2,59 % og 0,13 %) og er ikke nye referencetal.
- Demo-scenarierne (`viden/demo_scenarier.json`) har objektiver og differenser ved `90fb16e`; tallene ved `eef950a` står
  under `koersel_status_eef950a`. Mængder (MWh, CO₂, balanceindtægter) er ikke målt igen.
- Scenarielisten (`#/scenarier`) har ikke længere farvevalg eller heatmap: ΔRef står som almindeligt tal med fortegn.
- Navnet på en kørsels tidsserie slås op på sha256, når id'et ikke findes i installationen (importerede kørsler).
- `uploadVaerksark` tager en valgfri tredje parameter `basisBase64`, og `upload_vaerksark`-anmodningen et valgfrit
  `basis_sha256` (KONTRAKT §6d). Intet skemaskift. Fabric: `deploy.py kode` (fjv), `deploy.py notebook`
  (fjv_importer_vaerksark) og `rayfin-up` (Functions + frontend).

## [0.3.1] — 2026-10-27 — oprydning og dokumentation før offentliggørelse

Ingen ændring i beregninger, skema eller pins. Fabric: intet at gøre.

### Tilføjet
- [`doc/TROFASTHED.md`](doc/TROFASTHED.md): til modellens forfatter — pinnen, modelspejlet, trofasthedstesten, beviset
  og listen over appens egne antagelser.
- `viden/vaerktoej/bevis_app_vej.py`: gentag beviset *appens vej = `run_case.py`* for alle cases med én kommando.
- [`doc/EGNE_DATA.md`](doc/EGNE_DATA.md) (værksark, i appen, SQL, CSV), `CLAUDE.md`, `CONTRIBUTING.md`, denne fil,
  skærmbilleder i README og `noter/` til udviklingsnoter.

### Ændret
- README omskrevet i modelrepoets form med kom-i-gang for den lokale udgave.
- `FABRIC.md` og `SYNKRONISERING.md` flyttet til `doc/`; `doc/FABRIC.md` gennemgået mod den seneste udrulning
  (logins, `fab` ≥ 1.7.0, `az` + `sqlcmd`, opdatering af en eksisterende installation).
- `LICENSE` nævner IBCS-komponenternes licens og varemærket IBCS®.
- `app/scripts/k2_live.mjs` hedder nu `bestilling_live.mjs`.

### Fjernet
- `app/scripts/tjek_hash.py` og `probe.mjs e2e`: brugte Functions, der er fjernet; hash-definitionen er
  `fabric/fjv/byg_case.py`.
- `app/docs/db_skema.md` (en måling fra første udrulning) er flyttet til `noter/`.

## [0.3.0] — 2026-10-27 — trofasthed mod modelrepoet

Model `eef950a`, df-data `106b9fc` (uændret). Fabric: `deploy.py kode`, `deploy.py notebook`, `rayfin-up`,
**`deploy.py koer fjv_importer_vaerker`** (repoværkerne stod ved `b49aeb0`).

### Tilføjet
- Modelspejlet (`viden/modelspejl.json`, genereret af `byg_modelspejl.py` fra modelrepoet ved pinnen) og
  trofasthedstesten i gaten (11 kategorier) med 10 modprøver, der skal gøre gaten rød.
- Konfiguration › værk: kortet *Modelrepoet* med afdrift felt for felt; kilden står under hvert felt.
- `deploy.py pins`: udrulningen skriver motorens pins i `dbo.Motors` og læser dem tilbage.

### Ændret
- En ny kørsel af et repoværk bruger casens egen kommando som standard (balancemarked og målt varmelast som i
  README); afvigelser står som *egen antagelse*.
- "Nyt værk" skalerer varmelasten med modelrepoets regel `f = round(G/100, 4)` med Pythons afrunding (før G/105,52).
- Den registrerede varmelastfil pr. case følger modelrepoets kommando for netop casen.
- Community `--demo` bringer et uændret repoværk op til casefilen ved pinnen.

### Rettet
- Arbejderen afviser en kørsel, hvis de frosne pins ikke er den motor, der regner den (første bestilling efter en
  motoropgradering kunne regne med det forrige mærke).
- `installation.py rayfin-up` slutter med exitkode 1, når Rayfin melder en fejl og selv slutter med 0.
- `app/rayfin/functions/host.json` er committet (en frisk klon kunne ikke udrulle Functions).

## [0.2.0] — 2026-10-27 — modellen til eef950a og IBCS

Model **`eef950a`** (før `b49aeb0`), df-data **`106b9fc`** (før `392992c`). **Tallene ændrer sig:** lagerets første
time følger nu lagerbalancen, og en aktiveret MWh værdisættes uden spotprisen. Andeby 5.–6. januar 2026:
**867.031,23 kr.** (før 844.727,28).

### Ændret
- Analyser og Scenarier følger IBCS® Standards: scenarie massivt, reference omridset, ΔRef = scenarie − reference,
  fælles skala pr. enhed på en side (`app/IBCS.md`).
- Referencetal, dokumentation og kredit følger modelrepoets nye README ("Billund Varme").

## [0.1.0] — 2026-10-19 — første version

Model `b49aeb0`, df-data `392992c`.

- Én kerne og to udgaver: **Fabric** (Fabric App med SQL-database og en Python-notebook som regnemotor) og **lokal**
  (Python-server med SQLite eller egen database). Samme sider, skema og regnemotor.
- Dokumentation, information, konfiguration af værker med revisionsspor, analyser, scenarier med bestilling og
  sammenligning, værksark- og CSV-upload, værkspakker.
- Kredit til modellen og datarepoet i begge udgaver; gaten (`scripts/tjek.py`) stopper organisationsspecifikke værdier.

[Ikke udgivet]: https://github.com/DinSHS/fjernvarme-businesscase-app/compare/v0.3-trofast...HEAD
[0.3.1]: https://github.com/DinSHS/fjernvarme-businesscase-app/compare/v0.3-trofast...HEAD
[0.3.0]: https://github.com/DinSHS/fjernvarme-businesscase-app/compare/v0.2-ibcs-eef950a...v0.3-trofast
[0.2.0]: https://github.com/DinSHS/fjernvarme-businesscase-app/compare/v0.1-foer-ibcs...v0.2-ibcs-eef950a
[0.1.0]: https://github.com/DinSHS/fjernvarme-businesscase-app/releases/tag/v0.1-foer-ibcs
