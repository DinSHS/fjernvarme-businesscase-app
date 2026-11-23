# Dit eget værk — tre veje ind

Appen regner på **værker**: et sæt parametre (enheder, lagre, priser, tariffer, balancemarked, varmelast …) i præcis
modelrepoets YAML-form, gemt som blade i databasen. Repoets egne cases (Andeby, Billund) kommer med `--demo`. Dit eget
værk kan komme ind på tre måder. Vælg den første, du kan.

**Værkets data er dine.** Den lokale udgave gemmer dem i din datamappe og din database; intet sendes nogen steder hen.
Læg dem aldrig i et offentligt repo (`.gitignore` dækker `fjernvarme_data/` og `_lokal/`).

| Vej | Når | Du skal have |
|---|---|---|
| **1. Værksarket** | du starter fra bunden | modellens regneark udfyldt med anlæg, priser og (gerne) et års timedata |
| **2. I appen** | du vil starte fra Andeby eller et andet værk | ingenting — kopiér et værk, eller brug guiden *Nyt værk* |
| **3. SQL** | værkets data findes allerede i en database | en database, appen kan forbinde til (SQLite, PostgreSQL, SQL Server) |

Uanset vej kan du bagefter lægge **målte tidsserier** (varmelast, solprofil) på værket som CSV.

---

## 1. Værksarket (`vaerksdata_skabelon.xlsx`)

Skabelonen er modellens egen (`vaerksdata_skabelon.xlsx` i modelrepoets rod). Hent den i appen under
**Dokumentation › Skabelon til værksdata**, og udfyld den efter modelrepoets
[`doc/EGET_VAERK.md`](https://github.com/skj-1964/fjernvarme-businesscase/blob/939228aa048563c8498382a79d207c8b03fbda57/doc/EGET_VAERK.md).

Upload den under **Konfiguration › Upload værksark**. Appen konverterer arket med modelrepoets **eget**
`scripts/vaerksark_til_yaml.py` ved den pinnede commit — samme case, som hvis du kørte scriptet selv — og opretter værket
og (med timedata) en tidsserie for varmelasten. Importen viser sin status og modellens log.

Fire ting, der ofte giver en afvisning:

* **Perioden er fast:** 1. juli 2025 00:00 – 30. juni 2026 23:00 i arkets tidszone. Mindst 672 timer.
  Skabelonen kan ikke importeres uændret (de otte eksempelrækker er for få).
* **Timens start eller slut:** starter dine timedata 1. juli kl. 01:00, er stemplerne timens slut.
* Uden timedata (kun årsbehovet i B3) syntetiserer modellen varmelasten ud fra Andebys profil skaleret med
  `f = round(G/100, 4)`.
* **En række med navn, men uden type eller volumen:** modelscriptet springer en enhed uden type og en tank uden
  volumen over uden besked (målt: otte af et værks 17 enheder forsvandt sådan). Appen afviser derfor arket med
  rækkenummeret, før scriptet kører — også en række med tal, men uden navn, en tank under de seks tankrækker og et
  målepunkt under varmepumpens tabel.

**Slukket ved start.** Modelscriptet sætter hver enhed med start/stop-logik (unit commitment) til slukket i første
time. Med tank er det uden betydning; uden tank — fx i kørslen "hvad er tanken værd" — kan ingen enhed levere i første
time, og kørslen kan ikke løses. Importens log advarer, når det gælder dit værk, og siger, hvilket felt der rettes
(*tændt ved start* i fanen *Start og drift*, eller feltet *Tændt ved periodens start* på enheden i appen).

Hele kontrakten (felter, fejl og advarsler, målt på udfyldte ark) står i [`viden/data_krav.md`](../viden/data_krav.md) §4.

### Ret et værk i Excel: eksport og genupload som revision

**Konfiguration › værket › Eksportér værksark (.xlsx)** (også i værkslisten) udfylder modelrepoets egen
`vaerksdata_skabelon.xlsx` ved pinnen med værket — anlæg (også slåede-fra enheder), tanke, varmepumpernes målepunkter,
priser, eltarif, DMI-område og priszone, den aktive målte varmelast (Timedata) og den aktive målte solvarme (et ark
*Solvarme*, som modelscriptet læser). Arket bygges i browseren i begge udgaver; filen hedder `<kode>_rev<N>.xlsx`.

**Appens egne faner (runde 14).** Skabelonen kan kun bære en del af et værk, og modelscriptet sætter selv resten
(slukket ved start, halvfuld tank, CO₂-faktor 0,2 for gas, intet balancemarked). Derfor har det eksporterede ark fire
faner mere — *Læs først* forrest (arket åbner dér) og tre efter modelrepoets:

| Fane | Indhold |
|---|---|
| **Læs først** | værkets navn, kode og revision; hvad fanerne og farverne betyder; "slet ikke `_app`"; hvad der ikke gemmes ved genupload; og for netop dette værk hvert sted, hvor en værdi i modelrepoets faner **ikke** er den, modellen bruger (fx tankens kapacitet, tariffen, solvarmens årsproduktion, perioden, startomkostninger uden start/stop-logik) — med cellen, der gælder |
| **Start og drift** | blokken *Værket* øverst (nettilslutning og modelperiode), så én række pr. enhed (navnet som i Anlaeg): i drift, tændt ved start, start/stop-logik, CO₂-faktor, idriftsættelsesår, noter; og én række pr. tank: i drift, indhold ved start, varmetab pr. time, slut som start, noter |
| **Balancemarked** | *hvordan* værket byder (om der regnes med balancemarked, vælges på scenariet): metode, budstrategi, lofter i alt og pr. enhed og marked, reservationsregler, aktivering, månedsloft — og enhedernes egne budfelter. Lister vises med danske betegnelser og koden i parentes, fx *i går (lag24)* |
| **Øvrige felter** | hvert felt, som hverken modelrepoets faner eller de to andre bærer: feltets navn, værdi, forklaring — og stien i modellen i en kolonne til højre |

**Tom celle og `(findes ikke)`.** I appens faner betyder en **tom celle**, at appen ikke rører feltet: værket får
præcis det, modelscriptet læser af modelrepoets faner — som om rækken ikke fandtes. `(findes ikke)` (et valg i
dropdownen) betyder, at feltet ikke sættes, og at modellen bruger sin egen standard. Ved hvert felt står begge værdier,
fx for CO₂-faktoren: *tom = 0,2 for gaskedler og gasmotorer; (findes ikke) = 0*. Eksporten skriver altid en værdi eller
`(findes ikke)` i hver celle. (Før rettelserne i runde 14 betød en tom celle modellens standard, mens en manglende række
gav scriptets værdi — det gav modsatte resultater, uden at det kunne ses i arket.)

Fanerne er **appens egne — en egen antagelse**: `scripts/vaerksark_til_yaml.py` læser dem ikke. Kører du scriptet
selv på arket, får du casen uden dem. Appen læser dem ved upload og lægger værdierne oven på scriptets læsning; hver
værdi valideres som en redigering i appen (feltet skal findes i feltkataloget, typen og grænserne skal passe, og det
færdige værk skal opfylde modellens minimumskrav). En ukendt sti, et enhedsnavn, der ikke står i Anlaeg, eller en værdi
af forkert type afviser hele importen med ark, celle og grund — også en værdi uden sti eller uden enhedsnavn, en formel,
hvis resultat ikke er gemt i filen (åbn og gem arket i Excel), og en celle uden for et regnearks grænser. Hver fane har
en kort vejledning øverst, enheden i kolonneoverskriften, dropdowns for ja/nej og lukkede lister, gule celler til det,
du udfylder, og én forklarende sætning pr. felt. Kursiv grå er appens kontrolværdier og stier; ret dem ikke.

**Start/stop-logik.** Står start/stop-logik på nej for en enhed, bruger modellen ikke dens startomkostning, min.
driftstid, min. stoptid og min varme fra Anlaeg. Importens log advarer, når de er udfyldt, og *Læs først* nævner
enheden.

* **En enhed uden række** i *Start og drift* får modelscriptets værdier, og importens log siger det. Sletter du en
  hel fane, gælder det samme for alle dens felter; ved genupload vises det som ændringer, før du bekræfter.
* **En række i *Øvrige felter* med noget i kolonnen *kun hvis modelscriptet giver*** gælder kun, så længe
  modelscriptet læser netop den værdi af de øvrige faner. Eksempel: Andebys tanke har ingen fast kapacitet (den regnes
  af volumen og ΔT); rækken sætter derfor `e_max_mwh` til `null`, *kun hvis* scriptet giver 191,9. Retter du maks
  fyldning i Anlaeg, vinder din rettelse, og loggen siger, at rækken ikke blev brugt. Sådan kan appens faner aldrig
  tavst skjule en celle i modelrepoets faner.
* **Tal** gemmes med feltets type fra feltkataloget (heltal eller decimaltal), ikke med cellens. Har værket et heltal,
  hvor kataloget siger tal (96 i stedet for 96,0), bærer det skjulte ark `_app` værkets egen skrivemåde.
* **Revisionssporet** viser, hvad der kom fra fanerne: et nyt værk fra et ark med appens faner oprettes som
  revision 2 — revision 1 er modelscriptets læsning, revision 2 fanernes ændringer oven på den — og hvert felt, fanerne
  har sat, bærer kilden som kommentar (*Fra appens fane «Start og drift» i værksarket (celle D7), ikke fra
  modelscriptet*). Ved en revision står fanen og cellen i importens log ud for ændringen.

Et ark **uden** appens faner — modelrepoets rene skabelon — importeres præcis som før.

**Et nyt værk ud fra et andet værks ark.** Et eksporteret ark hører til sit værk (det skjulte ark `_app`): uploades det,
tilbyder appen at gemme ændringerne som en ny revision af *det* værk. Vil du i stedet lave et nyt værk, så giv det et
nyt navn i Priser (*værkets navn*) og vælg **Opret som nyt værk i stedet** ved upload; findes koden allerede, siger
appen det. Til et helt nyt værk findes også en **tom skabelon med appens faner** (under *Upload værksark* og
*Dokumentation › Skabelon til værksdata*).

Før du henter arket, viser appen listen **"ikke med i arket"**. Den er nu næsten tom: for katalogets værker står kun
solprofilens sti på den (Andeby; det nye værk peger på sin egen solprofil fra arket *Solvarme*), og for Billund-værkerne
intet. Før runde 14 stod der 71–106 felter. På listen står også det, en celle beviseligt ikke kan bære: et felt,
feltkataloget ikke kender (fx prisen på et brændsel, modellen ikke har), og tekst med tegn, et regneark ikke kan gemme.

Før download siger eksporten også, hvad modelscriptet selv udfylder: tomme timer inde i solprofilen interpoleres
lineært (højst 5 %), og tomme nattetimer i vinduets ende sættes til 0 — med tidspunkt og værdi. Huller i varmelasten
står tomme i arket og forbliver huller. Kan arket ikke rundture, nægter eksporten med grunden: to objekter, der får
samme navn efter modelscriptets normalisering (`halm__kedel` og `halm_kedel`), tegn, et regneark ikke kan gemme
(kontroltegn), eller tekst som `_x0041_`, som Excel læser som et kodet tegn. Nye enheds- og tanknavne skal derfor være
*slug-faste*: ingen `_` først eller sidst, ingen `__`.

Ret arket i Excel og upload det under **Konfiguration › Upload værksark**. Arket bærer et skjult ark `_app` med
værkets id, revisionen, en sha256 af det eksporterede indhold og værkets *grundlag* (en sha256 af dets parametre og
aktive tidsserier, som eksporten så dem); modelscriptet ignorerer det. Appen genkender det:

* **Værket findes, og revisionen er den samme:** appen laver en ny eksport af værkets revision (*basis*) og viser hvert
  ændret felt (gammel → ny) og timedata som en opsummering (timer ændret, sum før/efter). *Gem som revision N+1*
  sender arket og basis; importen kører modelscriptet **uændret på begge** og gemmer kun forskellen — som en
  redigering i appen (revisionslog i dit navn, `forventet_revision` tjekket). Appens egne faner lægges på begge
  læsninger på samme måde, så en rettet celle i *Start og drift*, *Balancemarked* eller *Øvrige felter* ændrer præcis
  det ene felt. Ændrede timer giver en ny aktiv tidsserie, hvor timerne uden for arket er bevaret — og er også en
  revision (logrækken `tidsserie.<rolle>`), så to uploads fra samme revision ikke begge kan gemmes. Felterne på listen
  "ikke med i arket" røres aldrig.
* **Felter, der ikke gemmes:** årsproduktionen i Timedata!B3 (den skalerer kun modelscriptets syntetiske varmelast),
  værkets navn, solvarmens årsproduktion i Anlaeg (når arket Solvarme har timerne) og COP ved 0 °C for en varmepumpe
  med målepunkter. Appen markerer dem *gemmes ikke* før bekræftelse; ændrer arket kun dem, tilbydes ingen revision.
* **Ingen ændringer:** appen siger det og gemmer intet.
* **Værket er ændret siden eksporten:** arket afvises (eksportér igen) — ingen tavs overskrivning. Importen
  kontrollerer selv bindingen i sin transaktion: et ark fra et andet værk, et værk, hvis parametre eller aktive serier er
  skiftet, og en basis, der ikke er værkets eksport, afvises med intet gemt.
* **Et ark fra før runde 14** (markeringen i format 2, uden appens faner): afvises som revision med beskeden
  "eksportér værket igen" — appen kan ikke sammenligne det med en ny eksport. Som nyt værk importeres det som før.
* **Ingen markering, eller værket findes ikke** (slettet, anden installation): arket bliver et nyt værk — med hele
  indholdet, også appens faner; kun felterne på listen "ikke med i arket" får modelscriptets værdi.

Beviset står i gaten: `viden/vaerktoej/tjek_eksport_rundtur.py` eksporterer hvert værk i kataloget med appens kode,
uploader arket som et **nyt værk** gennem importens egen kode (modelrepoets script + appens faner) og kræver, at det
nye værk er det oprindelige blad for blad — bortset fra en eksplicit, begrundet liste (solprofilens sti) — at
`run_case` giver samme objektiv for de to, også med balancemarked, at genupload uden ændringer gemmer intet, og at én
ændret celle, også i appens faner, ændrer præcis det felt. Det gælder også et værk med et navn, scriptet
normaliserer, og serier med huller.

**Præcision.** Forskelle afgøres med regnearkets præcision, 15 betydende cifre (Excel gemmer ikke flere). En rettelse
efter det 15. ciffer kan derfor ikke ses — den ville heller ikke overleve Excel. Solprofilen skrives af modelscriptet
med 6 decimaler; eksporten siger, hvis det afrunder noget.

## 2. I appen

* **Kopiér et værk:** Konfiguration › kortet *Kopiér værk*. Ret derefter felterne; hver ændring logges med revision.
* **Nyt værk-guiden:** Konfiguration › *Nyt værk fra bunden*. Syv trin: navn og kode, klima og priszone, varmebehov,
  enheder, lager, priser og tarif, gennemse og opret. Varmelasten
  skaleres med modelrepoets regel; hvert felt viser sin kilde (Andeby i modelrepoet, brugerens eget valg eller *egen
  antagelse*).
* **Værkspakke:** et helt værk som zip (parametre, gyldige tidsserier, scenarier — uden e-mails og id'er), så det kan
  deles: `python -m fjernvarme_app eksport <kode> <fil.zip>` og `… import <fil.zip>`.

## 3. SQL — bring your own database

```
python -m fjernvarme_app ddl postgresql > fjv.sql      # eller sqlite / mssql; samme som skema/ddl/*.sql
psql -d fjv -f fjv.sql
python -m fjernvarme_app --db postgresql+psycopg://bruger:kode@vaert/fjv     # pip install "fjernvarme_app[postgresql]"
python -m fjernvarme_app valider-db                    # tjek det, du har skrevet udefra
```

Et værk er rækker i `Vaerks` og `VaerkParameters`: ét blad pr. YAML-sti (`units.gaskedel.p_max_heat` → `5.0`). Hvad du
må skrive, og hvordan, står i [`skema/SKEMA.md`](../skema/SKEMA.md#bring-your-own-sql); kontrakten er
[`skema/skema.json`](../skema/skema.json). Kørsler, resultater og motorens pins skriver kun arbejderen.

## Målte tidsserier (CSV)

Under **Konfiguration › værk › Tidsserier › Upload CSV**: vælg rolle (**varmelast** ab værk i MW, eller **solprofil**), og upload.

* Kolonner: tid + værdi. Komma, semikolon eller tab; decimalkomma ved semikolon.
* Tid: ISO 8601 eller `dd-mm-åååå tt:mm`; UTC eller dansk lokaltid; timens start eller slut; 1 time eller 15 min.
* Enhed: MW, kW, MWh eller kWh pr. interval.
* Varmelasten må mangle højst 5 % af en kørsels timer (modellen interpolerer); solprofilen ingen (huller op til 5 %
  udfyldes ved upload).

Filen tjekkes straks og får status *gyldig* eller *afvist* med en forklaring. Højst én tidsserie er **aktiv** pr. rolle;
den bruger scenarier som standard. Alle regler: [`viden/data_krav.md`](../viden/data_krav.md) §2.

## Kør på dit værk

Under **Scenarier** laver du et scenarie (værk + ændringer + periode) og bestiller en kørsel. Brug differensmetoden:
reference og scenarie med samme periode og samme data, og læs forskellen — ikke de absolutte tal. Appen foreslår par
og viser resultaterne under **Analyser**. Metoden står i [`viden/METODE.md`](../viden/METODE.md).
