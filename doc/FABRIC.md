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
| Node.js | ≥ 20 med npm. **Rayfin CLI 1.36.1** installeres af `npm ci` i `app/` (præcis den version; `^` trækker en nyere med manglende afhængighed) |
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
| `rayfin-up`: *mangler app/rayfin/functions/host.json* | filen er committet; hent den med `git checkout -- app/rayfin/functions/host.json` |
| En kørsel ender i `fejl`: *bestilt med andre versioner end den motor, der skal regne den* | bestillingen frøs den forrige motors pins — kør `deploy.py pins` (hvis `dbo.Motors` ikke er opdateret) og bestil igen |
| `git pull` brokker sig over `konfig.ts`/`rayfin.yml` | kør `python scripts/installation.py fjern`, pull, og `paafoer` igen |
