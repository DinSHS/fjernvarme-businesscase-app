# Fabric-udgaven — udrulning i dit eget workspace

Samme app som den lokale udgave ([`community/README.md`](../community/README.md)), men kørt i **Microsoft Fabric**: appen er en Fabric App (Rayfin) med SQL-database,
Entra-login og hosting; regnemotoren er en **Python-notebook**, der tager kørsler fra databasens kø; data og kode ligger i et **lakehouse**.
Modellen kører aldrig i browseren.

**Intet organisationsspecifikt står i repoet.** Workspace-, lakehouse-, database- og notebook-id'er, servernavn og app-adresse står i **én lokal,
git-ignoreret fil**, `config/installation.json`. Koden og udrulningsværktøjerne læser derfra, og `scripts/tjek.py` (pre-commit) stopper, hvis en af
værdierne alligevel havner i noget, der committes.

## Forudsætninger

| Hvad | Krav |
|---|---|
| Fabric | en **kapacitet** (F-SKU eller prøvekapacitet), hvor *Fabric Apps (preview)*, SQL database, Lakehouse og Python-notebooks er slået til for dit workspace. En SQL-database, der røres oftere end hvert 15. minut, er tændt døgnet rundt (~1,7 CU konstant); appen polle­r derfor kun, mens en kørsel er aktiv og fanen er synlig. |
| Rolle | administrator/medlem af workspacet og ret til at oprette items |
| Python | 3.11–3.13 (kun standardbibliotek til udrulningsværktøjerne) |
| `fab` | Fabric CLI **1.7.0 eller nyere** (`pip install --user ms-fabric-cli`; 1.6 kan ikke uploade fra lokal disk). På Windows ligger `fab.exe` i Python-brugerens `Scripts`-mappe, som ikke er på PATH — peg på den med miljøvariablen `FJV_FAB` (fx `…\Python313\Scripts\fab.exe`). |
| `az` + `sqlcmd` | Azure CLI og **go-sqlcmd** på PATH. `deploy.py db`/`pins` skriver motorens pins i appens SQL-database med dit Entra-login (`az account get-access-token`). |
| Node.js | `^20.19.0 \|\| >=22.12.0` (Vites krav) med npm. **Rayfin CLI 1.36.1** installeres af `npm ci` i `app/` (præcis den version; `^` trækker en nyere med manglende afhængighed) |
| Netværk | adgang til GitHub (kørslerne henter modelkoden og df-data på pinnede commits) |

## Logins — tre forskellige, alle i en rigtig konsol

Log ind i **cmd eller PowerShell**, ikke i Git Bash eller et værktøj uden terminal: `fab` og `az` afviser en konsol, de ikke kan
styre. Loginnet gemmes, så andre skaller (og scripts) kan bruge det bagefter.

| Værktøj | Kommando | Bruges af | Udløber |
|---|---|---|---|
| Fabric CLI | `fab auth login` (tjek: `fab auth status`) | `fabric/deploy.py` (lakehouse, notebooks, jobs) | sjældent; cachen holder |
| Azure CLI | `az login --tenant <din tenant>` | `deploy.py db`/`pins` (SQL med Entra) | efter organisationens regler (ofte 10–12 timer) |
| Rayfin CLI | `cd app && npx rayfin login` | `scripts/installation.py rayfin-up`/`rayfin-db-apply` | ca. 1 time |

## Din installation — det du udfylder

Kopiér skabelonen og udfyld den (filen er git-ignoreret og committes aldrig):

```
cp config/installation.eksempel.json config/installation.json
```

| Felt | Hvad | Hvor du får det |
|---|---|---|
| `workspace_navn`, `workspace_id` | dit Fabric-workspace | portalen, eller `fab get "<navn>.Workspace" -q id` |
| `lakehouse_navn` | `fjv_lakehouse` (standard; skift kun, hvis du også retter notebook-metadata) | — |
| `lakehouse_id` | lakehousets id | `fab get "<workspace>.Workspace/fjv_lakehouse.Lakehouse" -q id` |
| `notebooks.koer_scenarie`, `.importer_vaerksark` (`.importer_vaerker`, `.selvtest`) | notebook-id'erne | efter `deploy.py notebook` (se trin 3) |
| `sql_server`, `sql_database` | appens SQL-database (servernavn **uden** port; databasenavn) | portalen: SQL-databasen, `rayfin up` oprettede — *Indstillinger → Forbindelsesstrenge* (trin 4) |
| `app.redirect_uris` | appens adresse efter første udrulning | `hostingUrl` i `app/rayfin/.deployments.json` (trin 4) |

`python scripts/installation.py vis` viser, hvad der er udfyldt (id'er forkortet). Vil du drive flere installationer fra samme kopi, så peg på en anden
fil med miljøvariablen `FJV_INSTALLATION` (eller `--config`).

## Rækkefølgen

Læg mærke til, at **appens SQL-database først findes efter appens første udrulning**; derfor er der to omgange i trin 4.

1. **Workspace og lakehouse.** Opret et workspace på din kapacitet og et lakehouse `fjv_lakehouse` i det (portalen, eller `fab mkdir`; se `fab mkdir -h`).
   Skriv `workspace_navn`, `workspace_id` og `lakehouse_id` i `config/installation.json`.
2. **Motorkoden til lakehouset.** `python fabric/deploy.py kode` lægger `fjv/*.py`, måleregistret og tidsserie-reglerne i `Files/fjv/motor/`.
   Koden er **én delt kopi** for alle notebooks. Bagefter skriver `kode` motorens pins (model- og df-data-SHA) i appens `dbo.Motors`, som
   appens bestillinger fryser dem fra; findes databasen ikke endnu (første installation), springes det over, og trin 5 gør det.
3. **Notebooks.** `python fabric/deploy.py notebook` bygger og importerer de fire notebooks (`fjv_koer_scenarie`, `fjv_importer_vaerker`,
   `fjv_importer_vaerksark`, `fjv_selvtest`) bundet til lakehouset. Skriv deres id'er i `notebooks.*` (`fab get "<workspace>.Workspace/<navn>.Notebook" -q id`).
4. **Appen (to omgange).**
   ```
   cd app && npm ci && npx rayfin login
   python ../scripts/installation.py rayfin-up        # 1. gang: opretter appen og dens SQL-database
   ```
   Aflæs databasens `sql_server` og `sql_database` og appens `hostingUrl`, skriv dem i `config/installation.json` (`app.redirect_uris`), og kør igen:
   ```
   python ../scripts/installation.py rayfin-up        # nu med dine værdier i Functions og i redirect-adresserne
   python ../scripts/installation.py rayfin-db-apply  # skemaet (kun skema; `--force` = datatab, spørg først)
   ```
   `rayfin-up` kalder først `paafoer`, som skriver værdierne ind i `app/rayfin/functions/src/konfig.ts` og `app/rayfin/rayfin.yml` **lokalt** og sætter
   `git update-index --skip-worktree`, så de to filer ikke kan committes med dine værdier. `python scripts/installation.py fjern` ruller tilbage (gør det før `git pull`).
5. **Databasebindingen til notebooks.** `python fabric/deploy.py db` skriver `Files/fjv/konfig/db.json` fra `sql_server`/`sql_database`
   og motorens pins i `dbo.Motors` (`python fabric/deploy.py pins` gør kun det sidste; kræver `az login`).
6. **Værkerne.** `python fabric/deploy.py koer fjv_importer_vaerker` importerer modelrepoets værker i databasen. **Kør den igen efter hver
   ændring af `MODEL_COMMIT`:** værkerne i databasen er casefilerne ved den commit, de blev importeret ved, og ellers regner appen på en ældre
   versions antagelser (målt 2026-10-27: alle 7 repoværker stod ved b49aeb0, mens motoren kørte eef950a). Uændrede repoværker (revision 1)
   opdateres; rettede beskyttes. Konfiguration › værk › kortet *Modelrepoet* viser afdrift felt for felt mod casefilen ved den pinnede commit.
7. **Kontrol.** `python fabric/deploy.py koer fjv_selvtest` og `python fabric/deploy.py rapport fjv_selvtest` (modelrepoets egen testsuite i Fabric), og åbn appen i portalen.

Hver kommando kan prøves **tørt** uden at røre Fabric: `python fabric/deploy.py --tor kode` (og `--tor notebook`, `--tor db`, `--tor koer …`),
`python scripts/installation.py rayfin-up --tor`. En tørkørsel skriver hver `fab`-kommando, den ville have kørt, og udfører ingen.

## Opdatér en eksisterende installation

Efter `git pull` (fx en ny version af appen eller en ny pinnet modelversion), fra repoets rod:

```
python scripts/installation.py fjern          # før pull: rul de lokalt påførte værdier tilbage
git pull
python fabric/deploy.py kode                  # motorkoden + pins i dbo.Motors (læst tilbage)
python fabric/deploy.py notebook              # notebooks (kun nødvendigt, hvis fabric/celler/ er ændret)
cd app && npm ci && npx rayfin login
python ../scripts/installation.py rayfin-up   # paafoer + appen; exit 1, hvis Rayfin melder en fejl
python ../scripts/installation.py rayfin-db-apply   # kun hvis skema/skema.json er ændret
cd ..
python fabric/deploy.py koer fjv_importer_vaerker   # kun hvis MODEL_COMMIT er ændret (se trin 6)
```

Rækkefølgen betyder noget: motoren (og dermed `dbo.Motors`) før appen, så den første bestilling efter opdateringen fryser de nye pins.
`CHANGELOG.md` siger for hver version, hvilke af trinene den kræver.

**Modelskiftet `90fb16e` → `939228a` (version 0.5.0, oliekedel).** Kun `MODEL_COMMIT` skifter; `DF_DATA_SHA` (`106b9fc`) og
skemaet er uændrede, og tallene er de samme (målt lokalt: Andeby 5.–6. januar 2026 866.567,72 kr. ved begge versioner).
Kør `deploy.py kode` (motoren, feltkataloget med oliekedlen og pins i `dbo.Motors`), appen (`rayfin-up` eller de to
deltrin; frontenden bærer den nye skabelon til værksarket) og `deploy.py koer fjv_importer_vaerker`. Casefilerne er de
samme ved de to versioner (målt: `git diff --stat 90fb16e 939228a` i modelrepoet rører ingen fil under `cases/`), så
importen melder hvert uændret repoværk som `uaendret`. En bestilling i køen med de gamle pins afvises; bestil den igen.
Kørsler ved `90fb16e` kan sammenlignes med nye. Et værksark eksporteret før opdateringen skal eksporteres igen, før det
kan genuploades som en revision (se `CHANGELOG.md`). **Ikke udrullet og ikke afprøvet i Fabric.**

**Modelskiftet `eef950a` → `90fb16e` (version 0.4.0).** Kun `MODEL_COMMIT` skifter; `DF_DATA_SHA` (`106b9fc`) og skemaet er
uændrede. Kør `deploy.py kode` (motoren og pins i `dbo.Motors`) og `deploy.py koer fjv_importer_vaerker`. Casefilerne er
de samme ved de to versioner (målt: `git diff --stat eef950a 90fb16e` i modelrepoet rører kun `src/data_loader.py`,
`src/data_loader_github.py`, `README.md`, `CLAUDE.md` og to tests). Efter koden melder importen derfor hvert uændret
repoværk som `uaendret`, og værket beholder sin `repo_commit` (`fabric/fjv/importer.py:146-149`). En bestilling, der ligger i
køen med de gamle pins, afvises (status `fejl`); bestil den igen. Tal fra kørsler ved `eef950a` kan ikke sammenlignes med
nye. Udrullet i én installation 16. november 2026: `deploy.py kode` (pins læst tilbage som `90fb16e` / `106b9fc`) og
`deploy.py koer fjv_importer_vaerker` (rækketallene i `Vaerks`, `VaerkParameters` og `Aendringslogs` uændrede). Appen
kunne ikke udrulles med `rayfin-up` (skemaafvigelse, se nedenfor) og blev udrullet med de to deltrin. Ingen kørsel er
endnu bestilt i Fabric ved `90fb16e`; referencetallet er kun målt lokalt.

**Skemaversion 2: tabellen `KoerselTimeDels` (runde 14b, version 0.4.0).** Et værk med mange enheder og balancemarked
fylder mere end 4.000 tegn pr. time (målt: 17 enheder 4.002, 40 elenheder ca. 21.000; `noter/maaling_timebredde_r14b.md`).
Resten af timen står nu i den nye tabel. Den kommer i databasen med `rayfin-db-apply` (eller `rayfin-up`). Det er en
ny tabel uden rækker, så den giver ingen nye standardværdier, men **i en installation med skemaafvigelsen kan den ikke
anvendes, før afvigelsen er løst** (se nedenfor). Indtil da kan koden alligevel udrulles: `deploy.py kode` og de to deltrin.
Appens egen antagelse, ikke afprøvet i Fabric: en database uden tabellen virker som før for alle værker, hvis timer kan stå
i én række. Et bredt værk afvises ved indlæsningen med beskeden *"… databasen mangler tabellen KoerselTimeDels …"*, og
intet publiceres. Et arkiv med timedele afvises ved importen med samme grund. Kørsler fra før skemaversion 2 læses uændret.

### Udrul appen i deltrin (uden databasetrinnet)

`rayfin up` gør fire ting i rækkefølge: indstillinger, databaseskema, Functions og brugerflade. Fejler databasetrinnet,
stopper resten. Er skemaet uændret (`app/rayfin/data/` er den samme som ved sidste udrulning), kan de to sidste udrulles
hver for sig, fra `app/`:

```
python ../scripts/installation.py paafoer     # installationens værdier i konfig.ts og rayfin.yml
npx rayfin up switch <deployment>             # kun hvis app/rayfin/.env mangler RAYFIN_PUBLIC_API_URL (se nedenfor)
npx rayfin up functions deploy                # bygger og udruller Functions
npx rayfin up staticapp deploy                # bygger (build:fabric) og udruller brugerfladen
```

Målt 16. november 2026 med Rayfin CLI 1.36.1: begge gennemført, databasen urørt. Deltrinene anvender ikke
indstillingerne i `rayfin.yml` (fx redirect-adresser); er de ændret, skal `rayfin up` køre.

**Udrul fra en mappe, der har installationens git-ignorerede filer.** En frisk klon eller et `git worktree` mangler dem,
og bygget lykkes alligevel:

* `config/installation.json` — uden den fejler `paafoer`.
* `app/src/styles/temaer/privat/` — uden den bygges brugerfladen med standardtemaet. Målt: en udrulning fra et
  arbejdstræ uden mappen fjernede installationens eget tema, indtil brugerfladen blev udrullet igen.
* `app/rayfin/.deployments.json` — uden den melder deltrinene *No remote endpoint configured*. Kopiér den fra den
  mappe, der sidst udrullede, og kør `npx rayfin up switch <deployment>`; den skriver `RAYFIN_PUBLIC_*` i
  `app/rayfin/.env`, som brugerfladen bygges med.
* `app/node_modules` — uden den leder `npx rayfin` efter en offentlig pakke ved navn `rayfin` (404). Kør `npm ci`.

## Det der gælder altid

* **Kør Rayfin fra `app/`** (CLI'en finder projektet ud fra den aktuelle mappe). Giv altid `--workspace-id` — `scripts/installation.py rayfin-up` gør det.
* **Én solver ad gangen** og **kun appens egen kø**: notebooken tager en global SQL-lås; en anden arbejder afslutter uden at røre noget.
* En kørsel gemmer de fulde pinnede commits (model og df-data), den brugte. Skift pins bevidst (`fabric/fjv/konstanter.py`, `CREDITS.md`, `app/src/sider/dokumentation/kilde.ts`
  — `scripts/tjek.py` fejler, hvis de ikke er ens), og deploy med `deploy.py kode`, så `dbo.Motors` følger med. Arbejderen **afviser** (status `fejl`) en
  kørsel, hvis frosne pins ikke er den motor, der kører den — fx en bestilling lagt, mens `dbo.Motors` stadig stod på den forrige motor. Bestil den igen.
* `installation.py rayfin-up`/`rayfin-db-apply` læser Rayfin-CLI'ens output og slutter med **exitkode 1**, hvis den melder `Deployment failed`, en fejlet
  database-apply o.l. — CLI'en selv slutter med 0 i de tilfælde (en halv udrulning: frontenden er ude, resten ikke).
* `fab job run` melder kun Completed/Failed; hver notebook skriver sin egen rapport til `Files/_run/<navn>.json` (`deploy.py rapport <navn>`).
* `deploy.py koer` venter højst en time (`fab job run --timeout 3600`). En længere kørsel (Andeby helår med balancemarked tog 38 minutter;
  et rullende Billund-år kan tage mere) bestilles i appen eller startes med `fab job start` og følges i appen.

## Hvad ligger hvor

| Sted | Committes? | Indhold |
|---|---|---|
| `config/installation.eksempel.json` | ja | skabelonen (pladsholdere) |
| `config/installation.json` | **nej** (git-ignoreret) | dine id'er, servernavn, adresser |
| `config/forbud.lokal.json` | **nej** | dine organisationsnavne m.m., som gaten skal stoppe (valgfri) |
| `app/src/styles/temaer/privat/` | **nej** | dit eget tema (se [`app/TEMAER.md`](../app/TEMAER.md)) |
| `app/rayfin/.deployments.json`, `app/rayfin/.env`, `app/.env.local` | **nej** | Rayfins egen udrulningstilstand |
| `app/rayfin/functions/src/konfig.ts`, `app/rayfin/rayfin.yml` | ja — **med tomme værdier** | `paafoer` fylder dem lokalt (skip-worktree) |
| `app/rayfin/functions/host.json` | ja | Azure Functions-værtens standard (Rayfin-CLI'ens skabelon); uden den udruller `rayfin up` ikke functions |

## Fejlfinding

| Symptom | Årsag |
|---|---|
| `fabric_miljoe: findes ikke: …/installation.json` | du har ikke kopieret og udfyldt skabelonen (se ovenfor) |
| `… mangler eller har pladsholdere i: …` | et påkrævet felt er tomt eller stadig `<…>` |
| `fab: kommando findes ikke` | `fab` er ikke på PATH — sæt `FJV_FAB` til den fulde sti |
| Appen starter, men en kørsel bliver stående i `koe` | `notebooks.koer_scenarie` er tom eller forkert i `konfig.ts` — kør `paafoer` + `rayfin-up` igen |
| *The field `x` does not exist on the type `Query`* efter et deploy | databaseskemaet blev ikke anvendt — kør `rayfin-db-apply` (en fejlet `db apply` inde i `rayfin up` er ikke fatal for CLI'en; `installation.py` melder den nu med exit 1) |
| `rayfin-up`/`rayfin-db-apply`: *409 Schema drift detected; no migration SQL was applied* | Rayfin-tjenesten sammenligner databasen med sin egen registrering af skemaet og fandt en forskel. CLI 1.36.1 viser kun overskriften; se *Skemaafvigelse* nedenfor |
| `rayfin up db apply`: *No remote endpoint configured* | `app/rayfin/.deployments.json` mangler i denne mappe — se *Udrul appen i deltrin* |
| Appen har mistet installationens tema efter en udrulning | brugerfladen blev bygget uden `app/src/styles/temaer/privat/` — læg mappen ind og kør `npx rayfin up staticapp deploy` |
| `rayfin-up`: *mangler app/rayfin/functions/host.json* | filen er committet; hent den med `git checkout -- app/rayfin/functions/host.json` |
| En kørsel ender i `fejl`: *bestilt med andre versioner end den motor, der skal regne den* | bestillingen frøs den forrige motors pins — kør `deploy.py pins` (hvis `dbo.Motors` ikke er opdateret) og bestil igen |
| `git pull` brokker sig over `konfig.ts`/`rayfin.yml` | kør `python scripts/installation.py fjern`, pull, og `paafoer` igen |

### Skemaafvigelse (409 Schema drift detected)

Målt 16. november 2026 i en installation, hvis skema ikke var ændret siden sidste vellykkede udrulning (28. oktober):
den genererede `dab-config.json` var identisk med den forrige, og kolonner, typer, nøgler og CHECK-regler stemte med
entiteterne. Tjenestens svar (kun `message` vises af CLI 1.36.1; resten af JSON-svaret har listen) nævnte seks
standardværdier, som findes i databasen, men ikke i entiteterne:

| Tabel | Kolonne | Standardværdi i databasen |
|---|---|---|
| `Vaerks` | `revision` | `0` |
| `Aendringslogs` | `revision` | `0` |
| `Koersels` | `bestilling_id` | `00000000-0000-0000-0000-000000000000` |
| `Koersels` | `forsoeg`, `vaerk_revision` | `0` |
| `Koersels` | `input_hash` | tom tekst |

De er systemnavngivne (`DF__…`) og oprettet 16. oktober 2026 kl. 06:05:02 UTC, i samme sekund som Rayfin oprettede
`Bestillings` og `KoerselInputs`. Appens egen antagelse: de stammer fra Rayfins migration, da kolonnerne blev tilføjet
til tabeller med rækker. Ingen kode bruger dem; motoren og Functions skriver alle seks kolonner ved hver indsættelse.

Hvad der er prøvet:

* At skrive `default` ind i de seks dekoratorer fjerner **ikke** fejlen. Tjenesten sammenligner databasen med sin
  registrering, ikke med entiteterne.
* `--force` er ikke prøvet. Den tillader destruktive skemaændringer; spørg installationens ejer først.
* Rayfin CLI 2.0.0 (forhåndsudgave) har `rayfin up db repair`, som overtager databasens afvigelser i entiteterne og i
  tjenestens registrering uden at ændre databasen. En tørkørsel (`--all --dry-run`) lod alle tre tabeller stå: den kan
  ikke læse `@set(...KONSTANT)`. Samme CLI har `rayfin up db apply --skip-drift-check`; ikke prøvet.

Indtil afvigelsen er løst, kan en skemaændring ikke udrulles i en sådan installation. En app uden skemaændring udrulles
med deltrinene ovenfor. En nyoprettet database har ikke de seks standardværdier, så længe ingen påkrævet kolonne er
tilføjet til en tabel med rækker.
