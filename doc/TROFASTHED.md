# Til Steen: sådan tester du trofastheden

Appen er en brugerflade til [`fjernvarme-businesscase`](https://github.com/skj-1964/fjernvarme-businesscase). Den skal regne
**præcis som modelrepoet** og må ikke opfinde, afrunde, forenkle eller "forbedre" en antagelse uden at sige det. Denne side
viser, hvordan du selv kan efterprøve det på en halv time (det meste er installation og ventetid). Den er skrevet til modellens forfatter, men alle kan følge den.

**Modelrepoet er sandheden.** Hvor appen afviger, står der *egen antagelse* i appen og i tabellen nederst.

---

## 1. Hvilken version appen er pinnet til

| | Commit | Står i |
|---|---|---|
| Modellen | `939228aa048563c8498382a79d207c8b03fbda57` ("Udgiv 0.11.0: oliekedel som enhedstype", november 2026; oliekedlen fra `131f305`, UTF-8 fra `3cf753a`, spot midles over tidsskridtet fra `5021a5e`) | `MODEL_COMMIT` i [`fabric/fjv/konstanter.py`](../fabric/fjv/konstanter.py) |
| df-data | `106b9fce9a2e3610090b1a542559024056449b88` | `DF_DATA_SHA` samme sted |

Pinnen står også i [`CREDITS.md`](../CREDITS.md), `app/src/sider/dokumentation/kilde.ts` og `viden/*.json`, og gaten
(`python scripts/tjek.py`) fejler, hvis de ikke er ens. Appen distribuerer ikke modellens kode: regnemotoren henter præcis den
commit som zip fra GitHub og kører `run_case.py` uændret. Hver kørsel gemmer de fulde SHA'er, den brugte.

## 2. Sådan regner appen — ingen egen matematik

```
cases/<værk>.yaml ── fjv/flad.py ──► blade i databasen (sti → værdi, typestrengt)
                                          │  brugerens ændringer (set / enable / disable)
                                          ▼
                     fjv/byg_case.py ──► case.yaml + argv (frosset ved bestilling, sha256 = input_hash)
                                          ▼
                     fjv/model_wrapper.py ──► run_case.py UÆNDRET  (+ to ekstra filer: alle N intervaller og præcist objektiv)
```

* Et værk fra modelrepoet er casefilens blade uændret. Rundturen `flad → afflad` er typestreng for alle 7 cases.
* Et værksark konverteres af modelrepoets **eget** `scripts/vaerksark_til_yaml.py` ved den pinnede commit.
* Eksporten af et værk til værksarket (runde 12) udfylder modelrepoets **egen** `vaerksdata_skabelon.xlsx` og er den
  inverse af scriptet: hvad scriptet læser tilbage, er bevist felt for felt i gaten ([4d](#4d-eksport-til-værksark--rundturen)).
  Ved genupload som revision køres scriptet uændret på både arket og en ny eksport af værket, og kun forskellen gemmes.
* Det, skabelonen ikke kan bære, står i **appens egne faner** i det eksporterede ark (runde 14: *Start og drift*,
  *Balancemarked*, *Øvrige felter*, og *Læs først* forrest). Scriptet læser dem ikke; importen lægger deres værdier oven
  på scriptets læsning. En tom celle betyder, at appen ikke rører feltet; `(findes ikke)`, at feltet ikke sættes.
  Det er en **egen antagelse** ([afsnit 5](#5-egen-antagelse--hvor-appen-bevidst-afviger-eller-tilføjer)) og står i
  revisionssporet: scriptets læsning er revision 1, fanernes ændringer revision 2.
* Wrapperen ændrer intet i beregningen. Den pakker `src.manifest.write_manifest` ind og skriver bagefter
  `_fjv_fuld.csv` (alle N intervaller, fordi `_hourly.csv` dropper det første) og `_fjv.json` (objektivet uden afrunding).
* Månedstal i dansk tid regnes af appen ud fra `_fjv_fuld.csv`, fordi modellens `_monthly.csv` grupperer i UTC.
  Objektivet regnes op igen eksakt ud fra appens serier.

## 3. Modelspejlet — appen læser dine filer, den afskriver dem ikke

[`viden/vaerktoej/byg_modelspejl.py`](../viden/vaerktoej/byg_modelspejl.py) læser modelrepoet ved den pinnede commit
(`git show 939228a:<fil>`) og skriver fire genererede filer:

| Fil | Indhold |
|---|---|
| [`viden/modelspejl.json`](../viden/modelspejl.json) | hver case som blade med linjenummer; kørselskommandoerne pr. case (casens `KØRES MED`-kommentar og README's tabel); kodens standardværdier med fil:linje; `class Solver`; README's vinduer; `requirements.txt`; værksarkets skaleringsregel med kildetekst; `doc/BUDSTRATEGI.md`'s færdige YAML-blokke som blade med linje og kommentar (runde 14c) |
| `app/src/lib/modelspejl.data.ts` | samme spejl, som appen viser (kortet *Modelrepoet* på hvert værk, kilden under hvert felt) |
| `app/src/sider/konfiguration/eksport/vaerksdata_skabelon.xlsx` | modelrepoets værksark ved pinnen, byte for byte (runde 12); eksporten udfylder det |
| `app/src/sider/konfiguration/skalering.vektorer.json` | facit for skaleringen: modelrepoets egne linjer i `vaerksark_til_yaml.py` (`f`, `andeby_profil`, `heat_params`) udført i Python for 135 værdier af årsbehovet, inkl. alle halvtilfælde |

Fra runde 15 bærer spejlet også `vaerksark_typer`: værksark-scriptets egne tabeller over enhedstyper, brændsel pr. type,
CO₂-faktorer og prisarkets etiketter (`BRAENDSEL_PR_TYPE`, `CO2_PR_MWH_BRAENDSEL`, `BRAENDSEL_ORD`, `BIOMASSE` og `navne` i
`laes_priser`), læst af kildeteksten. Trofasthedstjekkets [5] holder appens enhedstyper, brændsler og priser op mod dem.
Baggrunden: da modellen fik `oil_boiler` ved `939228a`, var tjekket grønt med en app, der ikke kendte typen.

Kørselskommandoerne læses **strengt** af [`fabric/fjv/modelkoersel.py`](../fabric/fjv/modelkoersel.py): flag og antal
værdier tages fra `run_case.py`'s egen `argparse`. En linje, der ikke kan fortolkes, eller et ukendt flag stopper
genbygningen. Appens standardkørsel for et repoværk er casens egen kommando (fx Spor B: med balancemarked og målt
varmelast); kun cases uden kommando får appens egen antagelse.

## 4. Gentag testen selv

Du skal bruge Python 3.11–3.13 og git. Arbejd i en kort sti (Windows har en grænse på 260 tegn pr. sti, og modellens
filnavne er lange).

```bash
git clone https://github.com/DinSHS/fjernvarme-businesscase-app.git app
git clone https://github.com/skj-1964/fjernvarme-businesscase.git model
git -C model checkout 939228aa048563c8498382a79d207c8b03fbda57
git clone https://github.com/skj-1964/df-data.git model/data/df-data
git -C model/data/df-data checkout 106b9fce9a2e3610090b1a542559024056449b88

python -m venv .venv
source .venv/bin/activate                     # Windows: .venv\Scripts\activate
pip install -r model/requirements.txt pyyaml   # ca. 4 minutter
```

### 4a. Trofasthedstesten (sekunder)

```bash
FJV_MODELREPO=model python app/viden/vaerktoej/tjek_trofasthed.py     # Windows: set FJV_MODELREPO=model
```

Den har 11 kategorier og slutter med `TROFASTHED OK` eller exit 1 med hvert fund:

| # | Tjek |
|---|---|
| 1 | pins: spejlet, `konstanter.py` og hver `viden/*.json` peger på samme commit |
| 2 | spejlet er præcis, hvad modelrepoet giver ved commit'en (de tre filer ovenfor) |
| 3 | for hver case: appens bestillingsvej med modelrepoets kommando giver casen typestrengt uændret og præcis kommandoens flag |
| 4 | feltkatalogets standardværdier = kodens (navn, værdi, fil:linje) |
| 5 | enhedstypernes standardværdier = `src/config.py`'s |
| 6 | appens referencetal = README's tabel (kommando, objektiv) og casens gab |
| 7 | de faste vinduer = README's vinter-/sommervindue og Andebys tidsblok |
| 8 | "Nyt værk"-skabelonen = `cases/andeby.yaml`; varmelasten = modelrepoets skalering |
| 9 | appens pakkepins dækker `requirements.txt` |
| 10 | de registrerede varmelastfiler pr. case = filerne i modelrepoets kommandoer for casen |
| 11 | ingen kildehenvisning til en fil, der ikke findes |

`FJV_MODELREPO` peger på en git-klon (spejlet læses med `git show <pin>:<fil>`, så din arbejdskopi kan stå på en anden
commit). En udpakket zip går også: `FJV_MODELMAPPE=<mappe>`.

**Modprøven** viser, at testen faktisk fanger noget. Den ændrer antagelser i en kopi af modelrepoet (fx skaleringens
grænse, profilens decimaler, `python3` i en kommando, et nyt flag `--legacy-nettab`, en manglende `[model]`-sektion) og
kræver, at gaten bliver rød:

```bash
FJV_MODELREPO=model python app/viden/vaerktoej/test_trofasthed.py   # 10 tests, ca. 3 minutter
```

Vil du se den fange en ændring, du selv vælger: ret en værdi i `model/cases/andeby.yaml` (fx CO₂-prisen), og sæt
`FJV_MODELMAPPE=model`, så værktøjerne læser arbejdsmappen i stedet for pinnen. `tjek_trofasthed.py` fejler nu på `[2]`
(spejlet er ikke længere modelrepoet). Kør `python app/viden/vaerktoej/byg_modelspejl.py` og så `tjek_trofasthed.py` igen:
den melder præcis de steder, hvor appen bruger den ændrede værdi. `git -C app checkout .` og `git -C model checkout .`
rydder op.

### 4b. Beviset: appens vej = `run_case.py` (ca. 5 minutter)

```bash
python app/viden/vaerktoej/bevis_app_vej.py --model model --ud bevis
```

For hver af de 7 cases køres 10.–11. marts 2026 to gange med modelrepoets egen kommando for casen: **A** direkte
(`python run_case.py cases/<fil> --data-source github …`) og **B** ad appens vej (blade → frosset input → `case.yaml` +
argv → wrapperen). Scriptet sammenligner objektivet, `_hourly.csv` og `_kpi.csv` byte for byte. Målt 2026-11-23 ved
`939228a` med df-data **`106b9fc`** (= appens pin; scriptet melder `df-data 106b9fc, appens pin 106b9fc`), linopy 0.10.0,
highspy 1.15.1, i en klon af modelrepoet ved pinnen. Objektiverne er de samme som ved `90fb16e` (2026-11-14):
modelrepoets 0.10.0 og 0.11.0 flytter ingen tal:

| Case | Kommando (kilde) | Objektiv A = B, kr. | `_hourly.csv`, `_kpi.csv` | Ved `eef950a` (2026-10-27) |
|---|---|---:|---|---:|
| andeby | uden balancemarked, syntetisk last (`cases/andeby.yaml:9`) | 224.912 | byte-ens | 224.960 |
| billund_idag | med, målt last (`cases/billund_idag.yaml:24-25`) | 132.766 | byte-ens | 127.642 |
| billund_sporA | med, syntetisk (`README.md:185`) | 183.920 | byte-ens | 181.392 |
| billund_sporA_rullende | med, målt (`README.md:187`) | 183.494 | byte-ens | 181.218 |
| billund_sporA_rullende_bud | ingen kommando: **egen antagelse** (uden, syntetisk) | 236.859 | byte-ens | 236.659 |
| billund_sporB | med, målt (`cases/billund_sporB.yaml:17-19`) | 54.619 | byte-ens | 51.764 |
| billund_sporB_rullende | ingen kommando: **egen antagelse** (uden, syntetisk) | 236.859 | byte-ens | 236.659 |

**7 af 7 er ens** ved alle tre versioner. En ottende case, som ikke står i modelrepoet, er kørt samme vej: Andeby med
en oliekedel på 20 MW i stedet for gaskedlen (`oil_boiler`, `fuel_oil` 900 kr./MWh, ny ved `939228a`). 5.–6. januar 2026:
**1.083.242 kr.** direkte = ad appens vej, begge filer byte-ens, og 1.083.242,38 kr. gennem hele arbejderkæden
(oliekedlen 480,1 MWh, CO₂ 207,4 t mod 159,2 t med gaskedlen); 5.–16. januar: 4.001.969 kr. ad alle tre veje
(`noter/maaling_model_939228a.md`). Marts 2026 ligger efter 1. oktober 2025, så objektiverne flytter sig med
spotrettelsen (5021a5e); kolonnen *ved eef950a* kan ikke sammenlignes med de nye tal, og forskellen er ikke en fejl. Ét vindue kan vælges med `--start`/`--slut`, enkelte cases som argumenter (`andeby.yaml`).

**Hvad "samme timefil" dækker — og hvad det ikke gør.** Tabellen ovenfor er målt i ét vindue (10.–11. marts 2026) og
er byte-ens dér. Den generelle garanti er snævrere: timefilen fra en kørsel i appen er den samme som `run_case.py`
giver på appens **egen** casefil — den `case.yaml`, der ligger i kørslens mappe ([4c](#4c-hele-appen-med-en-rigtig-kørsel)).
Mod modelrepoets `cases/<værk>.yaml` med de samme flag er **objektivet, den samlede produktion og det samlede lager**
de samme, men fordelingen mellem flere lagre behøver ikke være det. Den uafhængige test 18. november 2026 målte det på
Andeby i januarvinduerne: byte-identisk timefil mod appens `case.yaml`; mod `cases/andeby.yaml` en anden fordeling
mellem `tank_lav` og `tank_hoej` (op til 68 MWh og 25 MW pr. tank), mens summen over de to tanke, produktionen og
objektivet var ens (afvigelse < 1e-13). Det er en alternativ optimal løsning, ikke en regnefejl: med to lagre uden
tie-break er fordelingen mellem dem ikke bestemt af objektivet. Testen fandt samme fordeling på Linux og Windows —
givet inputfilen er den deterministisk.

*Hvad* i inputfilen der flytter fordelingen, er ikke fundet. Genmålt 23. november 2026 ved `939228a` (df-data
`106b9fc`, highspy 1.15.1, Windows) gav `bevis_app_vej.py` **byte-ens** timefiler mod `cases/andeby.yaml` i begge
januarvinduer (5.–6. og 5.–16. januar 2026): 866.568 og 3.441.004 kr. Også med parforslagets gab (0,02 % og 100 kr.)
ad appens vej mod `--mip-gap 0.0002` direkte var de byte-ens. Testen blev kørt ved `90fb16e` gennem den kørende app;
forskellen er altså hverken casefilens skrivemåde alene eller gabet alene.

Derfor: **sammenlign summen over lagre, ikke hvert lager for sig.** Appen gør det samme, hvor et tal står pr. lager:
lagertabellen i en sammenligning har rækken *Alle lagre*, og kortene *Lager* og *Intervaldispatch* siger, at
fordelingen ikke er entydig, når kørslen har mere end ét lager (`app/src/sider/analyser/tekster.ts` ›
`FLERE_LAGRE_FORBEHOLD`). Beviset gør det samme: er timefilerne ikke byte-ens, sammenligner `bevis_app_vej.py` dem
på summen over lagre (`viden/vaerktoej/lagersum.py`: samlet lagerindhold og samlet nettoeffekt pr. time) og melder
casen som `ENS*` med den største forskel pr. lager. Alt uden for lagerkolonnerne, objektivet og `_kpi.csv` skal
stadig være tegn for tegn ens; modprøverne står i `test_trofasthed.py` (`Lagersum`). Ingen af de målte cases har
endnu udløst det. Det samme gælder enheder med unit commitment (start/stop): to kørsler af samme input kan
ende i forskellige løsninger med samme objektiv inden for gabet — målt samme dag på Billund Spor B, hvor appen og den
direkte kørsel gav samme objektiv, men en anden fordeling mellem flis- og halmkedel.

### 4d. Eksport til værksark — rundturen

```bash
FJV_MODELPYTHON=<python med modelrepoets requirements.txt> python viden/vaerktoej/tjek_eksport_rundtur.py --koer
```

Gaten kører det som trinnet *eksport rundtur*. For hvert værk i kataloget (de 7 cases, plus `billund_idag_maalt`:
billund_idag med casens egen målte varmelast aktiv, så Timedata prøves), tre varianter fra Codex' review K11
(`andeby_navne`: halmkedlen hedder `halm__kedel`; `andeby_hul`: solprofilen med et dagtimehul og to tomme nattetimer i
vinduets ende; `billund_idag_maalt_hul`: den målte varmelast med et hul) og `andeby_olie` (runde 15: en oliekedel i
stedet for gaskedlen, med oliepris og CO₂-faktor 0,28) laver **appens egen kode** eksporten, og
modelrepoets `scripts/vaerksark_til_yaml.py` køres **uændret** på arket, som importen kører det. Kravene:

* importens `slug()` (`fjv.revision`) = scriptets egen på svære navne;

* scriptet godtager arket, og arket med og uden den skjulte markering `_app` giver præcis samme case og tidsserier;
* eksportens forudsigelse af scriptet (`app/src/sider/konfiguration/eksport/kort.ts`) = scriptets blade, typestreng;
* arket uploadet som et **nyt værk** gennem importens egen kode — scriptets læsning, appens egne faner
  (`fjv.vaerksark.laeg_lag`) og modelkravene — er præcis eksportens forudsigelse (`lag.ts`) og **det oprindelige værk
  blad for blad**, bortset fra den eksplicitte, begrundede liste i `UNDTAGELSER` (solprofilens sti: det nye værk
  peger på sin egen solprofil). Hver forskel står på eksportens liste *ikke med i arket*, og listen har intet andet;
  markeringens *afvigelser* er listens ikke-artefakter. Målt ved `90fb16e` og igen ved `939228a` med den nye skabelon
  (2026-11-23): Andeby 232 af 232 blade med én forskel (før runde 14: 80), Billund-værkerne ingen (før 71–106);
* revisionssporet for det nye værk er revision 1 = scriptets læsning og revision 2 = fanernes ændringer, og hvert
  blad, laget har sat, bærer kilden som kommentar; samme ark uden appens faner giver præcis scriptets læsning;
* den målte serie i arket kommer tilbage byte for byte (inden for arkets periode), og begge mængdeforskelle i
  tidsaksen er forklaret: timer, scriptet tilføjer, er præcis eksportens *udfyldes* (tidspunkt og værdi med 6
  decimaler); timer, det fjerner, ligger uden for arket;
* genupload uden ændringer gemmer intet (værket er blad for blad det samme);
* `run_case` giver **samme objektiv** for det oprindelige værk og værket uploadet som nyt (`--koer`), med modelrepoets
  egen kommando for casen — med balancemarked for de værker, der har det, og med den målte varmelast for
  `billund_idag_maalt`. Tidsserierne lægges som arbejderen gør det, i en lokal kopi af modelkoden ved pinnen;
* modprøver: én ændret celle (D&V, en brændselspris, én solvarmetime — og én celle i hver af appens faner, også et
  felt i konverteringens egne sektioner) ændrer præcis det felt; en serierettelse er revision 2 med logrækken
  `tidsserie.<rolle>`; et værk på en nyere revision, et ark fra et andet værk og en basis, der ikke er værkets eksport
  (det rettede ark sendt som sin egen basis), afvises uden at gemme noget; kun årsproduktionen i Timedata!B3 ændret
  gemmer intet og siger hvorfor; en kedel uden type i Anlaeg springer scriptet over uden besked (målt i samme prøve),
  og importen afviser arket med rækkenummeret.

Rundturen sammenligner revisioner med regnearkets præcision (15 betydende cifre), ikke bit for bit: en rettelse efter
det 15. ciffer er usynlig. Upload som nyt værk sammenlignes typestrengt, blad for blad. Tre varianter køres ikke med
`run_case` (hullerne i `andeby_hul` udfylder scriptet ved upload som nyt værk, og det er oplyst før download;
`billund_idag_maalt_hul` og `andeby_navne` prøver serien og navnene); grunden står i `UDEN_KOERSEL`.

En fejl i forudsigelsen (målt: tankenes selvafladning sat til 0,0006) gør trinnet rødt med fire fund.

### 4c. Hele appen med en rigtig kørsel

Følg [kom-i-gang i README](../README.md#kom-i-gang--lokal-udgave-520-minutter) og bestil Andeby 5.–6. januar 2026 uden
balancemarked: **866.567,72 kr.** ved `939228a` og `90fb16e` (867.031,23 ved `eef950a`, før spotrettelsen). Samme tal giver
den ægte arbejder uden server (`python fabric/koer_minne.py andeby 2026-01-05 2026-01-06`, målt 2026-11-23 ved `939228a`)
og `run_case.py` direkte på modelrepoet ved `939228a` (866.568, målt samme dag). Kørslens side viser modelversionerne og *Data i denne kørsel*; de rå filer — `case.yaml`,
`argv.json`, modellens egne `_kpi.csv`/`_hourly.csv`/`_manifest.json` og solverloggen — ligger i
`<datamappe>/Files/fjv/koersler/<kørsels-id>/`, så du kan køre præcis den kørsel med `run_case.py`.

## 5. Egen antagelse — hvor appen bevidst afviger eller tilføjer

| Hvor | Appens valg | Modelrepoet | Hvorfor |
|---|---|---|---|
| Parforslag (scenarie mod reference) | relativt gab 0,02 % **og** absolut gab 100 kr. | `--mip-gap 0.0002` (README.md:161); det absolutte gab er casens (fx 5.000 kr.) | en differens på få tusinde kroner drukner ellers i det absolutte gab (se [nedenfor](#highs)) |
| Cases uden kørselskommando (`billund_sporA_rullende_bud`, `billund_sporB_rullende`) og egne værker | uden balancemarked, syntetisk varmelast | ingen kommando | appen skal vælge noget; valget står som *egen antagelse* i scenariet |
| "Nyt værk" | årsbehov 50 GWh som udgangspunkt; gaskedel `round(50 × f)` MW; enhedstypernes pladsholdere | skalering `f = round(G/100, 4)` og Andebys tal (brugt uændret) | et minimalt gyldigt værk; hvert felt bærer sin kilde ind i databasen |
| Månedstal | dansk lokaltid, alle N intervaller | `_monthly.csv` i UTC | sammenlignes med værkets egne måneder |
| Sammenligning, vandfald, anbefalinger | appens egne regler (`viden/anbefalingsregler.json`, METODE §6a) | differensmetoden (README) | appen lægger to kørsler side om side; reglerne står i appen |
| Hvornår en differens er et resultat (runde 15) | et par vises kun som godt eller dårligt (virkningsfarve, grønt mærke, "billigere/dyrere", en anbefaling), når det er direkte sammenligneligt: samme værk **og værksrevision**, periode, opløsning, df-data, modelversion og ønsket gab. Ellers står tallene side om side med grunden først (`beregn.ts` › `sammenlignelighedsDom`). Scenariet er altid den kørsel, der bærer ændringen i forhold til værket; hele sammenligningssiden læser de to kørsler i de roller (`data.ts` › `sideRoller`) | differensmetoden (README): kun det, scenariet ændrer, må være forskelligt. Værksrevisionen findes kun i appen | den uafhængige test 18. november 2026: et par med hver sin periode stod med grøn differens, og *Scenariet fortalt* kunne fortælle den anden kørsel end nøgletallene. Revisionen er taget med, fordi to revisioner er to forskellige værker under scenariet |
| Intet årstal af en kortere periode (runde 15) | anbefalingen viser kun periodens beløb. Et årstal vises alene, når perioden selv er mindst 365 døgn — og er da periodens tal uændret. Før: Δ × 365 / døgn for 7–364 døgn (`anbefaling.ts` › `HELAAR_DOEGN`) | modellen regner den periode, den får; den skalerer intet | den uafhængige test 18. november 2026 (3.1): 12 januardøgn i Andeby blev til "ca. 715.000 kr." om året, 121 forårsdøgn i Billund til ca. 6,6 mio. kr. En sæson er ikke et år |
| Forslag om længere tidsgrænse (runde 15) | stoppede en af parrets kørsler på solverens tidsgrænse, og er usikkerheden (summen af de tidsstoppede kørslers gab) mindst **10 %** af \|ΔRef\| — eller ukendt — er første næste skridt en ny kørsel med længere tidsgrænse; kørslen mærkes "Stoppet på tidsgrænsen" (`beregn.ts` › `tidsgraenseForslag`, `TIDSGRAENSE_VAESENTLIG_ANDEL`) | modellen stopper ved `solver.time_limit` (standard 600 s) og gemmer den bedste løsning; den foreslår intet | forslag i den uafhængige test 18. november 2026 (afsnit 2a). Tallet 10 % er appens: i testens eget tilfælde (Billund Spor B, 3.926 kr. af ca. 2,18 mio. kr. = 0,2 %) holdt konklusionen, og dér foreslås intet |
| Grænser | kun timeopløsning (1h); højst 366 døgn; én solver ad gangen; tidsgrænse ≤ 3.600 s i Fabric; CSV-upload strengere end modellens læser | modellen kan 15 min og vilkårlig længde | driftssikkerhed i en delt installation |
| *Tilføj balancemarked* (Konfiguration › Balancering, runde 14c) | blokken bygges af Andebys blok eller BUDSTRATEGI's fælles del + profil 1–4 **uændret**, med fil:linje pr. felt; brugeren vælger de prækvalificerede el-enheder, loftet pr. enhed (og for Andebys blok fordelingen pr. marked) og referenceenheden; kildens øvrige tal står som *eksempel* og kan rettes; de valgte enheder får `afrr_qualified`/`mfrr_qualified: true`. Profil 5 og budvinduet tilbydes ikke (profil 5 kræver en kommentar-instruks, budvinduet er et enhedsfelt) | `doc/BUDSTRATEGI.md:216-305`: blokkene indsættes i casefilen i hånden ("Bed Claude om at gøre det"), og "Tallene er eksempler og skal erstattes med værkets egne"; værksark-scriptet skriver ingen blok | et værk fra modelrepoets skabelon kunne ikke regne med balancemarked (appens eksporterede ark kan bære blokken i fanen *Balancemarked* — den anden vej); appen opfinder ingen værdier, men samler blokken af modelrepoets egne og lader brugeren udfylde det, der er værkets |
| *Tilføj et felt* (runde 14c) | et felt fra kataloget, værket mangler, med modellens standardværdi som udgangspunkt; ikke enkeltfelter i en blok, hvis tilstedeværelse ændrer regningen (`cop_curve`, tarifprofilen, `nettab`), ikke enhedsfelter for typer uden for katalogets `gaelder_for`, og ikke `balancing`-felter uden blok | modellen bruger standarden, når feltet mangler (kataloget, holdt op mod koden af tjek [4]) | med standardværdien regner modellen som før; feltet bliver synligt og kan rettes og bruges i scenarier |
| Advarslen om starttilstand (runde 14c) | værkets side advarer, når alle tændte enheder med unit commitment har `initial_status: 0` | værksark-scriptet sætter `initial_status = 0` på hver UC-enhed (`scripts/vaerksark_til_yaml.py`); modellens standard er 1 (`src/config.py`) | målt 2026-11-17 (90fb16e, df-data 106b9fc) på Andeby fra værksarket: 5.–6. januar 2026 med tankene slået fra uløselig, med halmkedlen tændt ved start 869.828,49 kr.; 8.–9. juni løser begge. Derfor "kan blive uløselig". Appen ændrer ikke værket selv |
| Netto og brutto balanceindtægt | vises hver for sig, aldrig lagt sammen | objektivet bruger brutto, manifestet netto | som modellens egen dokumentation |
| Værkets tidsserier i normaliseret form — også casens egen solprofil (runde 15) | én filform til modellen for alle værkets tidsserier: `time,mw` (UTC, timens start, huller udeladt; `fabric/fjv/tidsserie.py`). Casens egen solprofil (fx `data/solar_andeby_dmi_karup.csv`) registreres som tidsserie og gives til modellen i den form — kolonnen hedder altså `mw`, ikke `power_mw`, og filens sha256 er en anden end repo-filens. Værdierne er de samme, tegn for tegn hvor kilden er en ren decimal | repoets solprofil har overskriften `time,power_mw` (`data/solar_andeby_dmi_karup.csv:1`); profil-læseren er `src/data_loader.py:998-1029` | én filkontrakt, som arbejderen kan stole på (form, hash, sti). Modellens egne læsere giver bitvis samme serie fra den normaliserede fil som fra repoets (`fabric/tests/test_tidsserier.py`); den uafhængige test 18. november 2026 fandt værdierne identiske og bad om, at det andet kolonnenavn og den ændrede sha256 står her. Den frosne `sha256` i en kørsel er derfor den normaliserede fils, ikke repo-filens |
| CO₂-udledning (runde 15) | "ikke opgjort" i stedet for modellens tal, når en tændt enhed med fossilt brændsel (naturgas; olie og kul står også på appens liste) har produceret varme med `co2_emissions_per_mwh_fuel` ≤ 0 — i kørslens kort, i sammenligningens nøgletal og i *Scenariet fortalt*. Appen gætter ingen faktor og retter ikke tallet; modellens tal står i kortets fodnote (`beregn.ts` › `co2Opgoerelse`) | `co2_ton` = Σ varme / `eta_fuel_to_heat` × faktoren over enheder med faktor > 0 (`src/manifest.py:130-147`); standarden er 0,0 (`src/config.py:504`). Billund-casene har 0,0 på gasenhederne, fordi CO₂-omkostningen ligger i gasprisen | den uafhængige test 18. november 2026 (4E): "0 t" blev vist som udledning for et værk, der brænder naturgas. Økonomien er uændret; kun udledningen mangler, indtil modellen skiller den fysiske faktor fra omkostningen |
| Værksarkets faner *Start og drift*, *Balancemarked* og *Øvrige felter* (runde 14) | appens eget lag: eksporten skriver dem efter modelrepoets faner, og importen lægger deres værdier oven på scriptets læsning — typen fra feltkataloget, hver værdi valideret som en redigering i appen, det færdige værk mod modellens minimumskrav. En række i *Øvrige felter* viger for en rettelse i modelrepoets faner (kolonnen *kun hvis modelscriptet giver*). Et nyt værk er revision 2 (revision 1 = scriptets læsning), og bladet bærer kilden som kommentar | skabelonen har fanerne Vejledning, Timedata, Anlaeg, Varmepumpe, Priser (og Solvarme); scriptet sætter selv `initial_status: 0` (`scripts/vaerksark_til_yaml.py:872-873`), halvfuld tank, selvafladning 0,0005 og `cycle_binding` (`:912-916`), CO₂-faktor 0,2 (`:846-847`), unit commitment efter minimumslasten (`:853-854`) og skriver en case uden `balancing` (`:1685`) | et værk skal kunne eksporteres, rettes og uploades uden at miste et felt; målt stod 71–106 felter pr. katalogværk på listen *ikke med i arket*. Scriptet køres stadig uændret, og fanerne siger selv, at de er appens |
| Højlydt import af værksarket (runde 14) | en række i Anlaeg med navn uden type (eller omvendt, eller kun tal), en tank uden volumen eller under de seks tankrækker og et målepunkt under varmepumpens tabel afviser importen med rækkenummer, før scriptet kører; importens log advarer, når hver styrbar enhed står til slukket ved start | scriptet springer rækken over uden besked (`dropna`, `scripts/vaerksark_til_yaml.py:616` og `:878`; `nrows=6`, `:876`; `nrows` i Varmepumpe, `:513-515`) | målt: otte af et værks 17 enheder forsvandt, og kørslen uden tank var uløselig, fordi alle enheder var slukket i første time |
| Referencetal efter spotrettelsen (`5021a5e`) | fire af README's fem tal vises som *regnet før spotrettelsen* med egne målinger ved `939228a` ved siden af (Information › Referencetal og Budstrategi, METODE §7, `referencetal.json` › `regnet_igen`); Spor A-ankeret er README's tal efter rettelsen. *README mod Fabric* tæller for hvert tal kun kørsler ved en version, tallet er regnet ved: Spor A ved `90fb16e` eller `939228a` (`regnet_ved` på referencen — **egen antagelse**, at netop de to pins giver README's tal; den hviler på modelrepoets CHANGELOG og to målinger), de fire øvrige ved `eef950a`; demoernes forventede tal er egne målinger, og D12 har intet | README-tabellen, `doc/` (fx `doc/BUDSTRATEGI.md:328-335`) og rapport v4 er regnet før rettelsen og opdateres senere (README.md:20-27); efter rettelsen kun tre kontroltal (CLAUDE.md:30-38) | koden ved pinnen regner med den nye spotregel; et gammelt tal som facit ville melde en korrekt kørsel som forkert |

Ikke med i appen: `--heat-params`, `--heat-csv-column`/`--heat-csv-tz`, `--legacy-nettab` i standardkørslen, `--dummy`.

## 6. Observationer i modelrepoet

Fundet under arbejdet ved `eef950a` og ikke rettet af os (modelrepoet er dit). Ingen af dem påvirker appens tal. Rækker
mærket *ved 90fb16e* er fundet ved modelskiftet 14. november 2026; deres linjer er ved `90fb16e`. Rækker mærket
*ved 939228a* er fundet ved modelskiftet 23. november 2026.

| Hvor | Hvad |
|---|---|
| `README.md:125,255`, `CONTRIBUTING.md:71`, `doc/WORKFLOW_LOKAL.md:149`, `doc/EGET_VAERK.md:4`, `scripts/vaerksark_til_yaml.py:51` | peger på `doc/vaerksdata_skabelon.xlsx`; filen ligger nu i roden |
| `scripts/byg_skabelon.py:577` | skriver stadig skabelonen til `doc/` |
| `README.md:14,219` | linker til `.docx`-filer, der er flyttet til `doc/arkiv/` |
| `README.md:20-27`, `README.md:183-189`, `doc/BUDSTRATEGI.md:328-335` (ved 90fb16e) | tallene er regnet før spotrettelsen; modelrepoet siger det selv. Appen viser dem som sådan (afsnit 5) |
| `CLAUDE.md:30-38` (ved 90fb16e) | kontroltallene for Billund i dag siger ikke, hvilken varmelastfil de er regnet med; appens kæde ramte dem til kronen med `billund_abvaerk_hourly_splejset_jun2026.csv` |
| `doc/BALANCEMARKED.md:52-62` | aktiveringsværdien står stadig med spot; koden (`src/activation_value.py`) og BUDSTRATEGI §4.2 regner uden |
| `src/reporting.py:314-338`, `src/model.py:262` | kommentarerne beskriver stadig t=0-lagerbalancen som ubundet |
| `CONTRIBUTING.md:38` | "434 passed"; ved eef950a er der 437 tests |
| `doc/matematisk_modelbeskrivelse_v4.pdf`, bilag D | beskriver koden før rettelserne 19. oktober |
| `doc/VARMELAST_OG_NETTAB.md:43-44` mod `README.md:176` | "Billund-casene kører med målt varmelast", men Spor A-ankeret kører uden `--heat-csv` |
| `cases/billund_sporA*.yaml:17-31`, `billund_sporB_rullende.yaml:28-31` | kørselskommentaren er arvet fra `billund_backtest_jan_apr_2026.yaml`, som ikke findes; casens egen kommando står kun i README (og slet ikke for `_rullende_bud` og `sporB_rullende`) |
| `scripts/vaerksark_til_yaml.py:1600` | skalerer fra "Andebys ~100 GWh"; Andebys parametre giver 105,52 GWh på karup-vejret jul 2025–jun 2026 (vores måling) |
| `scripts/vaerksark_til_yaml.py:1032-1053` | dansk lokaltid i både Timedata og Solvarme fejler altid ("mangler 22 timer i starten") |
| `cases/andeby.yaml:184` | CO₂-enheden hedder `DKK/t`; konverteringen skriver `DKK/t_CO2` |
| `scripts/vaerksark_til_yaml.py:606`, `:878` (ved 90fb16e) | `dropna(subset=["navn", "type"])` springer en enhed med navn, men uden type, over uden besked — og `dropna(subset=["navn", "volumen"])` en tank uden volumen. Målt i gaten: en kedel uden type giver exit 0 og en case uden kedlen. Appens import afviser arket med rækkenummer (afsnit 5) |
| `scripts/vaerksark_til_yaml.py:855-856` mod `src/config.py:520` (ved 90fb16e) | konverteringen skriver `initial_status: 0` for hver enhed med unit commitment; modellens standard er 1. Et værk fra arket kan derfor ikke dække første time uden tank (målt: kørslen løser med `units.el_kedel.initial_status: 1`). Appens import advarer |
| `vaerksdata_skabelon.xlsx` (ved 939228a) | filen er skrevet direkte af `scripts/byg_skabelon.py` (openpyxl) og ikke gemt i et regneark: formlerne i `Varmepumpe!E6:E23` har intet gemt resultat (før: gemt af LibreOffice med resultater). `doc/EGET_VAERK.md` siger, at formler skal have en beregnet værdi; konverteringen læser ikke kolonne E, så arket virker (målt i rundturen). Appens eksport måtte følge den nye XML-form (afsnit 4d) |
| `CHANGELOG.md` 0.11.0 (ved 939228a) | nævner DMI-område B28 → B29 og priszone B29 → B30; værkets navn er rykket med (B30 → B31), og det var den celle, vores test skrev i |
| `scripts/vaerksark_til_yaml.py:111-118` | `slug()` normaliserer til NFKD **før** æ/ø/å erstattes: `å` er da allerede `a` + en kombinerende ring og bliver `a` (ikke `aa`), og et stort Æ eller Ø falder bort i `.encode("ascii", "ignore")`. Målt: "Ærø Fjernvarme" → `roe_fjernvarme`, "Brønderslev Østerby" → `broenderslev_sterby`, "Tårs Halmværk" → `tars_halmvaerk`. Appens eksport forudsiger det samme |

<a id="highs"></a>Om gabet: med `--mip-gap 0.0002` alene stopper HiGHS ved det absolutte gab (casens 5.000 kr.), før det
relative er nået. Det er grunden til appens 100 kr. i parforslag.

## 7. Når modelrepoet får en ny version

Se [`CONTRIBUTING.md`](../CONTRIBUTING.md#ny-modelversion). Kort: ret pinnen, kør `byg_modelspejl.py`, og lad
`tjek_trofasthed.py` sige, hvor appen bruger noget, der er ændret. Ret dem, eller skriv dem som *egen antagelse*.
