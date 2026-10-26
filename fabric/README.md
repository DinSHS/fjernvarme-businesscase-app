# fabric/ — regnemotoren for Fjernvarme Businesscase

Den åbne MILP-driftsmodel (`github.com/skj-1964/fjernvarme-businesscase`, Linopy + HiGHS)
kører i en **Fabric Python-notebook** — aldrig i browseren. Appen bestiller kørsler i sin
SQL-database; notebooken `fjv_koer_scenarie` regner dem og skriver resultaterne tilbage.

> **Kan det køre i notebooks?** Ja. Åbn `fjv_koer_scenarie` i Fabric-workspacet,
> sæt `vaerk_kode` (og evt. `start`, `slut`, `med_balancering`) i parametercellen og kør.
> Kørslen oprettes som et scenarie med `kilde = notebook` og ses bagefter i appen.

## Pins

| Ting | Tilstand |
|---|---|
| Modelkode | `eef950a2ac7b3808a9456dcf48742ce08e52366a` (pinnet, `fjv/konstanter.py`; før 2026-10-26: `b49aeb0`) |
| df-data | `106b9fce9a2e3610090b1a542559024056449b88` (pinnet; opdateres om mandagen — skift bevidst; før 2026-10-26: `392992c`) |

Installationens workspace, lakehouse og item-id'er står **ikke** i kernen: udrulningen læser dem fra
`fabric_miljoe.py` (udfyld den - se `FABRIC.md` i roden).

Referencetal ved eef950a, målt lokalt 2026-10-26 med den ægte arbejder over hukommelseslageret
(som `koer_minne.py`; df-data 106b9fc): Andeby 5.–16. jan 2026 uden balancering **3.446.711,91**, med
balancering **3.117.644,03**; Billund Spor B **4.204.128,43** (= README). Ikke kørt i Fabric endnu.
Ved b49aeb0 (før rettelserne 19/10) gav Fabric 3.424.407,96 / 3.000.362,97 og Spor A-ankeret 4.698.361 —
de tal kan ikke sammenlignes med de nye.

## Kørsel i hånden

Parametre i `fjv_koer_scenarie`:

| Parameter | Betydning |
|---|---|
| *(ingen)* | kø-arbejder: tager ældste kørsel i kø, til køen er tom |
| `koersel_id` | kør netop den kørsel (skal stå i `koe` eller `startet`) |
| `vaerk_kode` | manuel kørsel af et importeret værk, fx `andeby`, `billund_spora` |
| `start`, `slut` | `ÅÅÅÅ-MM-DD`; tom = værkets egen tidsblok; højst 366 døgn |
| `med_balancering` | `True` = `--with-balancing` (kræver data efter ca. marts 2025) |
| `aendringer_json` | `[{"type":"set","sti":"prices.straw.value","vaerdi_json":"300.0"}, {"type":"disable","sti":"gasmotor"}]` |
| `mip_rel_gap`, `mip_abs_gap`, `tidsgraense_s` | tal som tekst; brug `"0.0002"` når resultatet læses som en differens |

| `heat_csv`, `ekstra_flag` | filnavn i modelrepoets `data/`; kun `--legacy-nettab` |
| `tidsserie_varmelast`, `tidsserie_solprofil` | `""` = værkets aktive tidsserie (hvis nogen), et `Tidsserie`-id, eller (varmelast) `"syntetisk"`. `heat_csv` er også et valg af varmelast |
| `batch_json` | flere kørsler i ét job: JSON eller `Files/…` i formen `viden/demo_scenarier.json` |
| `test_doed_efter_s` | **kun live-test**: processen dør hårdt efter N s af en kørsel (0 = fra) |

**Én solver ad gangen (KONTRAKT §6c):** arbejderen tager SQL-applocken `fjv_solver` (session-ejet,
timeout 0) på en dedikeret forbindelse og holder den hele jobbet. Får den ikke låsen, afslutter den
uden at røre nogen række — de kørsler, den selv har oprettet, ligger i køen, og den aktive arbejder
tager dem (FIFO efter `modtaget`). Under låsen er enhver anden kørsel i `koerer`/`indlaeser` død og
sættes til `fejl`. Annullering er samarbejdende: `annuller_anmodet` dræber solveren inden for ét
hjerteslag (60 s), og arbejderen sætter selv `annulleret` og går videre. Live-testet 2026-10-16
(rapporter/fv-fabric.md). Andeby helår med balancering tager ca. 1 time.

Resultater: tabellerne `Koersel*` i appens database og rå output i
`Files/fjv/koersler/<koersel_id>/` (`case.yaml`, `argv.json`, `log.txt`, `solver.log`,
`*_kpi.csv`, `*_monthly.csv`, `*_hourly.csv`, `*_manifest.json`, `*_dispatch.nc/png`,
`*_fjv_fuld.csv`, `rapport.json`). Notebookens egen rapport: `Files/_run/<notebook>.json`.

## Sådan virker en kørsel

1. **Frosset input** (`KoerselInput`) læses og `input_hash` efterregnes — notebooken læser aldrig de levende værkstabeller.
2. `fjv/byg_case.py` affladder værket, anvender ændringer og scenariefelter **i dict'en** og skriver
   hele `case.yaml` (ingen `--set`; `solver`-blokken oprettes, hvis den mangler).
3. Modelkode og df-data hentes som zip på fulde SHA'er til `Files/fjv/kode|df-data/<sha>/`, kopieres
   til lokal disk, og et `venv --system-site-packages` får modelrepoets pins.
4. `fjv/model_wrapper.py` kører `run_case.py` uændret og gemmer desuden den fulde tidsserie (alle N
   intervaller inkl. t=0) og det præcise objektiv.
5. `fjv/resultater.py` udtrækker efter `maaleregister.json` (måneder i Europe/Copenhagen fra den fulde
   tidsserie) og `fjv/db.py` publicerer i én transaktion.

## Værkets tidsserier (KONTRAKT §6d)

Målt varmelast og solprofil hører til **værket** (`Tidsserie`), ikke til df-data. Én uforanderlig fil pr.
serie: `Files/fjv/tidsserier/<vaerk_kode>/<sha256>.csv` i normaliseret form (`fjv/tidsserie.py`):

```
time,mw
2025-02-28T12:00:00Z,19.74
```
UTC, timens start, stigende, ingen dubletter, **huller udeladt** (ingen tom værdi), MW ≥ 0. Er kildens tal
allerede en ren decimal, bevares teksten tegn for tegn — modellen læser med pandas' hurtige parser, der ikke
lover samme double for `1.234560` og `1.23456`. Bevist: modellens egne læsere giver **bitvis** samme varmelast
(Billund, begge filer) og solprofil (Andeby) fra den normaliserede fil som fra repoets (`tests/test_tidsserier.py`).

- **Frysning:** `startBestilling` (og den manuelle vej, `db.oploes_tidsserier`) fryser
  `_koersel.tidsserie.<rolle> = {"id","sha256"}` i det hashbeskyttede input.
- **Arbejderen** (`koersel.hent_tidsserie`): slår stien op på id'et, men bruger kun filen, hvis dens bytes har
  præcis den frosne sha256 og den normaliserede form; den lægges som `data/_fjv_ts_<sha16>.csv` i kørslens
  kodekopi. Varmelast → `--heat-csv … --heat-csv-column mw`; solprofil → `production_profile_path` på enheden
  med markøren `"tidsserie:solprofil"` (ellers den ene aktive `solar_thermal`).
- **Repoets egne filer** registreres af `fjv_importer_vaerker` (kilde `repo`): Andebys solprofil (**aktiv** —
  casen læser den selv, så udfaldet er uændret) og Billunds `--heat-csv`-filer fra casefilernes
  kørselsvejledning (**ikke aktive** — casene kører i dag med syntetisk varmelast; at gøre dem aktive ville
  ændre eksisterende scenarier).
- **Værksark** (`fjv_importer_vaerksark`, parameter `import_id`): modelrepoets `scripts/vaerksark_til_yaml.py`
  køres uændret; værk (kilde `app`, revision 1), aktive tidsserier (kilde `vaerksark`) og importens status skrives
  i én transaktion. Solvarmens profilsti gemmes som markøren. Bruger ikke solver-låsen.
  **Ressourcer (K5-F3):** før scriptet læser arket, afvises det på ZIP-katalogets oplyste størrelser
  (højst 200 dele, 16 MiB pr. del, 32 MiB i alt, forhold 100 for dele over 1 MiB); scriptet kører med
  RLIMIT_AS 4 GiB og 900 s. Loftet måles i hvert jobs rapport (`hukommelsesloft`). **Kø (K5-F4):** hvert
  job tager først den bestilte import og tømmer derefter køen, så en import, hvis jobstart fejlede, ikke
  bliver liggende i `koe`.
- **Brugt eller kun frosset (K5-F12):** `manifest_json.tidsserier = {anvendt: {rolle: {id, sha256, enheder}},
  ubrugt: {rolle: {id, sha256, grund}}}`. En frosset solprofil på et værk med solvarmen slået fra hentes ikke.

## Én arbejder, to lagre (brief 21)

Arbejderen er databaseuafhængig; alt Fabric-specifikke ligger bag protokollerne i `fjv/lager.py`:

| Protokol | Fabric | Hukommelse (kørbar specifikation) |
|---|---|---|
| `Laas` (én solver ad gangen) | `db.SolverLaas` (SQL-applock) | `lager_minne.MinneLaas` |
| `KoerselLager` (det `koersel.koer_en` kalder) | `db.SqlLager` | `lager_minne.MinneKoerselLager` |
| `KoeLager` (det `arbejder.arbejd` kalder) | `db.SqlKoe` | `lager_minne.MinneKoe` |
| `ImportLager` (det `vaerksark.koer_importer` kalder) | `vaerksark.SqlImportLager` | `lager_minne.MinneImportLager` |

`db.koer_notebook` og `vaerksark.koer_notebook` er nu kun Fabric-bindingen omkring `arbejder.arbejd` og
`vaerksark.koer_importer`. **Fabric-adfærden er låst af et SQL-spor:** `tests/spor.py` kører begge indgange mod en
stub, og `tests/test_lager.py` kræver byte-identitet med `tests/data/sql_spor.json` (genereret fra koden før
grænsefladen, 3d144d5). Ændres Fabric-SQL med vilje, genereres sporet igen, og diffen hører med i committen.
`python koer_minne.py andeby 2026-01-05 2026-01-06` kører den ægte arbejder mod hukommelseslageret: 867.031,23 kr.
ved eef950a, samme tal som community-udgaven (målt 2026-10-26; ved b49aeb0 844.727,28 kr., samme bits som Fabric). Filroden er `FJV_FILES` (sæt den før `import fjv`).

## Udvikling

```
_lokal/.venv/Scripts/python -m unittest discover -s tests -t .     # 165 tests (2 kun på Linux), ingen netværk
python byg.py                                                     # celler/ -> _byg/*.Notebook
python koer_lokalt.py fjv_koer_scenarie vaerk_kode=andeby start=2026-01-05 slut=2026-01-16
python deploy.py kode                                             # fjv/*.py + maaleregister.json -> lakehouse
python deploy.py notebook <navn>                                  # byg + importér item
python deploy.py koer <navn> "navn:type=værdi,…"                  # fab job run
python deploy.py rapport <navn>                                   # læs Files/_run/<navn>.json
python ryd_tidsserier.py --server … --database … --tidsserie <id> --import <id>   # testoprydning, efter app/scripts/ryd_testdata.py
```

`_lokal/` (gitignored) holder egen venv med præcis modelrepoets pins, zip-udpakninger og lokale
kørsler; `koer_lokalt.py` tørkører en notebook med samme celler som i Fabric (uden database).
Rediger aldrig `_byg/*.ipynb` i hånden.

## Fælder vi betalte for

- **"AzureCLICredential: exit status 1" fra go-sqlcmd** (dev-maskinen): sqlcmd giver `az account get-access-token`
  ca. 10 s og dræber den så (exit 1, tom stderr). `az` tager her 4-19 s efter belastning, så fejlen kommer og går -
  fra shell og Python ens. `azsql.koer_sqlcmd` henter tokenet selv og giver sqlcmd en `az.cmd`-skim, der svarer
  straks (reproduceret med en `az` forsinket 15 s: før fejl, efter ok). Brug den i lokale SQL-scripts.

- **pyodbc connection pooling + autocommit** (`fjv/db.py`): en poolet forbindelse, der sidst kørte med
  `autocommit=False`, kommer retur i transaktionstilstand. Næste UPDATE blev aldrig committet, og dens
  lås blokerede kørslen. `pyodbc.pooling = False` + eksplicit `cn.autocommit`.
- **Job-instansens id er ikke synligt i notebooken** (`currentRunId` er tom i jobkørsel). Arbejderen
  skriver derfor ikke `fabric_job_id`.
- **Jobs-API'ets `cancel` stopper ikke en Python-notebooks proces.** Jobbet meldes `Completed` (ikke
  `Cancelled`), men kernen kører videre og holder låsen. Den eneste stopvej er `annuller_anmodet`.
  En rigtig procesdød (testet med `os._exit`) melder jobbet `Failed` og frigiver låsen.
- **HiGHS med `parallel=on` er ikke deterministisk:** samme input og miljø gav Spor A 4.698.190–4.698.545
  ved casens 0,5 % gab. Sammenlign differenser med stramt gab (rel 0,0002 + abs ≤ 1.000).
- **Genpublicering:** ændres `maaleregister.json`, kan færdige kørsler udtrækkes igen fra den gemte output
  uden omregning: `deploy.py koer fjv_selvtest "probe:string=genpubliser:<id>,<id>"`.
- **Windows**: `run_case.py` læser YAML med `read_text()` uden encoding → `PYTHONUTF8=1`; lange
  output-stems rammer 260-tegnsgrænsen → kort arbejdsmappe (`C:\fjvt`) lokalt.
- **`andeby --dummy` kan ikke køre** ved b49aeb0 og eef950a (målt 2026-10-26; dummy-data hæfter ikke solprofilen på); røgtesten bruger `billund_sporA --dummy`.
- **MILP-gab og miljø**: Spor A løses ikke til 0 % gab, og 2 kerner (Fabric) finder en anden løsning
  end 8 (lokalt) — 28 DKK fra hinanden. Kør differenser i samme miljø og med stramt gab.
