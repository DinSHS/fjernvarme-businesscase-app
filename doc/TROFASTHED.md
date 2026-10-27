# Til Steen: sådan tester du trofastheden

Appen er en brugerflade til [`fjernvarme-businesscase`](https://github.com/skj-1964/fjernvarme-businesscase). Den skal regne
**præcis som modelrepoet** og må ikke opfinde, afrunde, forenkle eller "forbedre" en antagelse uden at sige det. Denne side
viser, hvordan du selv kan efterprøve det på 15 minutter. Den er skrevet til modellens forfatter, men alle kan følge den.

**Modelrepoet er sandheden.** Hvor appen afviger, står der *egen antagelse* i appen og i tabellen nederst.

---

## 1. Hvilken version appen er pinnet til

| | Commit | Står i |
|---|---|---|
| Modellen | `eef950a2ac7b3808a9456dcf48742ce08e52366a` ("FINAL version …", oktober 2026) | `MODEL_COMMIT` i [`fabric/fjv/konstanter.py`](../fabric/fjv/konstanter.py) |
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
* Wrapperen ændrer intet i beregningen. Den pakker `src.manifest.write_manifest` ind og skriver bagefter
  `_fjv_fuld.csv` (alle N intervaller, fordi `_hourly.csv` dropper det første) og `_fjv.json` (objektivet uden afrunding).
* Månedstal i dansk tid regnes af appen ud fra `_fjv_fuld.csv`, fordi modellens `_monthly.csv` grupperer i UTC.
  Objektivet regnes op igen eksakt ud fra appens serier.

## 3. Modelspejlet — appen læser dine filer, den afskriver dem ikke

[`viden/vaerktoej/byg_modelspejl.py`](../viden/vaerktoej/byg_modelspejl.py) læser modelrepoet ved den pinnede commit
(`git show eef950a:<fil>`) og skriver tre genererede filer:

| Fil | Indhold |
|---|---|
| [`viden/modelspejl.json`](../viden/modelspejl.json) | hver case som blade med linjenummer; kørselskommandoerne pr. case (casens `KØRES MED`-kommentar og README's tabel); kodens standardværdier med fil:linje; `class Solver`; README's vinduer; `requirements.txt`; værksarkets skaleringsregel med kildetekst |
| `app/src/lib/modelspejl.data.ts` | samme spejl, som appen viser (kortet *Modelrepoet* på hvert værk, kilden under hvert felt) |
| `app/src/sider/konfiguration/skalering.vektorer.json` | facit for skaleringen: modelrepoets egne linjer i `vaerksark_til_yaml.py` (`f`, `andeby_profil`, `heat_params`) udført i Python for 135 værdier af årsbehovet, inkl. alle halvtilfælde |

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
git -C model checkout eef950a2ac7b3808a9456dcf48742ce08e52366a
git clone https://github.com/skj-1964/df-data.git model/data/df-data
git -C model/data/df-data checkout 106b9fce9a2e3610090b1a542559024056449b88

python -m venv .venv
source .venv/bin/activate                     # Windows: .venv\Scripts\activate
pip install -r model/requirements.txt pyyaml
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
FJV_MODELREPO=model python app/viden/vaerktoej/test_trofasthed.py   # 10 tests, ca. 1 minut
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
argv → wrapperen). Scriptet sammenligner objektivet, `_hourly.csv` og `_kpi.csv` byte for byte. Målt 2026-10-27
(linopy 0.10.0, highspy 1.15.1):

| Case | Kommando (kilde) | Objektiv A = B | `_hourly.csv`, `_kpi.csv` |
|---|---|---:|---|
| andeby | uden balancemarked, syntetisk last (`cases/andeby.yaml:9`) | 224.960 | byte-ens |
| billund_idag | med, målt last (`cases/billund_idag.yaml:24-25`) | 127.642 | byte-ens |
| billund_sporA | med, syntetisk (`README.md:176`) | 181.392 | byte-ens |
| billund_sporA_rullende | med, målt (`README.md:178`) | 181.218 | byte-ens |
| billund_sporA_rullende_bud | ingen kommando: **egen antagelse** (uden, syntetisk) | 236.659 | byte-ens |
| billund_sporB | med, målt (`cases/billund_sporB.yaml:17-19`) | 51.764 | byte-ens |
| billund_sporB_rullende | ingen kommando: **egen antagelse** (uden, syntetisk) | 236.659 | byte-ens |

**7 af 7 er ens.** Ét vindue kan vælges med `--start`/`--slut`, enkelte cases som argumenter (`andeby.yaml`).

### 4c. Hele appen med en rigtig kørsel

Følg [kom-i-gang i README](../README.md#kom-i-gang--lokal-udgave-ca-5-minutter) og bestil Andeby 5.–6. januar 2026 uden
balancemarked: **867.031,23 kr.** Samme tal giver den ægte arbejder uden server (`python fabric/koer_minne.py andeby
2026-01-05 2026-01-06`). Kørslens side viser modelversionerne og *Data i denne kørsel*; de rå filer — `case.yaml`,
`argv.json`, modellens egne `_kpi.csv`/`_hourly.csv`/`_manifest.json` og solverloggen — ligger i
`<datamappe>/Files/fjv/koersler/<kørsels-id>/`, så du kan køre præcis den kørsel med `run_case.py`.

## 5. Egen antagelse — hvor appen bevidst afviger eller tilføjer

| Hvor | Appens valg | Modelrepoet | Hvorfor |
|---|---|---|---|
| Parforslag (scenarie mod reference) | relativt gab 0,02 % **og** absolut gab 100 kr. | `--mip-gap 0.0002` (README.md:152); det absolutte gab er casens (fx 5.000 kr.) | en differens på få tusinde kroner drukner ellers i det absolutte gab (se [nedenfor](#highs)) |
| Cases uden kørselskommando (`billund_sporA_rullende_bud`, `billund_sporB_rullende`) og egne værker | uden balancemarked, syntetisk varmelast | ingen kommando | appen skal vælge noget; valget står som *egen antagelse* i scenariet |
| "Nyt værk" | årsbehov 50 GWh som udgangspunkt; gaskedel `round(50 × f)` MW; enhedstypernes pladsholdere | skalering `f = round(G/100, 4)` og Andebys tal (brugt uændret) | et minimalt gyldigt værk; hvert felt bærer sin kilde ind i databasen |
| Månedstal | dansk lokaltid, alle N intervaller | `_monthly.csv` i UTC | sammenlignes med værkets egne måneder |
| Sammenligning, vandfald, anbefalinger | appens egne regler (`viden/anbefalingsregler.json`, METODE §6a) | differensmetoden (README) | appen lægger to kørsler side om side; reglerne står i appen |
| Grænser | kun timeopløsning (1h); højst 366 døgn; én solver ad gangen; tidsgrænse ≤ 3.600 s i Fabric; CSV-upload strengere end modellens læser | modellen kan 15 min og vilkårlig længde | driftssikkerhed i en delt installation |
| Netto og brutto balanceindtægt | vises hver for sig, aldrig lagt sammen | objektivet bruger brutto, manifestet netto | som modellens egen dokumentation |

Ikke med i appen: `--heat-params`, `--heat-csv-column`/`--heat-csv-tz`, `--legacy-nettab` i standardkørslen, `--dummy`.

## 6. Observationer i modelrepoet

Fundet under arbejdet ved `eef950a` og ikke rettet af os (modelrepoet er dit). Ingen af dem påvirker appens tal.

| Hvor | Hvad |
|---|---|
| `README.md:125,253`, `CONTRIBUTING.md:71`, `doc/WORKFLOW_LOKAL.md:149`, `doc/EGET_VAERK.md:4`, `scripts/vaerksark_til_yaml.py:51` | peger på `doc/vaerksdata_skabelon.xlsx`; filen ligger nu i roden |
| `scripts/byg_skabelon.py:571` | skriver stadig skabelonen til `doc/` |
| `README.md:14,217` | linker til `.docx`-filer, der er flyttet til `doc/arkiv/` |
| `doc/BALANCEMARKED.md:52-62` | aktiveringsværdien står stadig med spot; koden (`src/activation_value.py`) og BUDSTRATEGI §4.2 regner uden |
| `src/reporting.py:314-338`, `src/model.py:262` | kommentarerne beskriver stadig t=0-lagerbalancen som ubundet |
| `CONTRIBUTING.md:38` | "434 passed"; ved eef950a er der 437 tests |
| `doc/matematisk_modelbeskrivelse_v4.pdf`, bilag D | beskriver koden før rettelserne 19. oktober |
| `doc/VARMELAST_OG_NETTAB.md:43-44` mod `README.md:176` | "Billund-casene kører med målt varmelast", men Spor A-ankeret kører uden `--heat-csv` |
| `cases/billund_sporA*.yaml:17-31`, `billund_sporB_rullende.yaml:28-31` | kørselskommentaren er arvet fra `billund_backtest_jan_apr_2026.yaml`, som ikke findes; casens egen kommando står kun i README (og slet ikke for `_rullende_bud` og `sporB_rullende`) |
| `scripts/vaerksark_til_yaml.py:1581` | skalerer fra "Andebys ~100 GWh"; Andebys parametre giver 105,52 GWh på karup-vejret jul 2025–jun 2026 (vores måling) |
| `scripts/vaerksark_til_yaml.py:1015-1036` | dansk lokaltid i både Timedata og Solvarme fejler altid ("mangler 22 timer i starten") |
| `cases/andeby.yaml:184` | CO₂-enheden hedder `DKK/t`; konverteringen skriver `DKK/t_CO2` |

<a id="highs"></a>Om gabet: med `--mip-gap 0.0002` alene stopper HiGHS ved det absolutte gab (casens 5.000 kr.), før det
relative er nået. Det er grunden til appens 100 kr. i parforslag.

## 7. Når modelrepoet får en ny version

Se [`CONTRIBUTING.md`](../CONTRIBUTING.md#ny-modelversion). Kort: ret pinnen, kør `byg_modelspejl.py`, og lad
`tjek_trofasthed.py` sige, hvor appen bruger noget, der er ændret. Ret dem, eller skriv dem som *egen antagelse*.
