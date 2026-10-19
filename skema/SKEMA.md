# Skemaet — databasens kontrakt for begge udgaver

`skema.json` er den **eneste** definition af appens database. Fabric-udgaven og community-udgaven har intet
fælles ud over kodebasen; at deres data "passer i samme skema", betyder: begge er bygget og testet mod denne fil.

| Fil | Hvad |
|---|---|
| `skema.json` | Tabeller, kolonner, typer, længder, nullable, sæt-værdier, nøgler, rettigheder, referencer, invarianter, version |
| `fjv_skema.py` | Den ene Python-læsning (kun standardbiblioteket): `laes`, `ddl`, `tjek_raekke`, `tjek_data`, `migration`, `struktur` |
| `ddl/sqlite.sql` · `ddl/postgresql.sql` · `ddl/mssql.sql` | CREATE-scripts til en tom database — **genereret**, ret dem aldrig |
| `versioner/<n>.json` | Skemaets strukturelle fingeraftryk ved version *n* (fastfrosset) |
| `migrationer/<nnnn>.<dialekt>.sql` | Løft fra version *n−1* til *n* — **genereret** af forskellen mellem to versioner |
| `maalt/fabric_*.json` | Den målte Fabric-database (INFORMATION_SCHEMA m.m.), som testen sammenligner med |
| `vaerktoej/rayfin_analyse.mjs` | Rayfins egen læsning af `app/rayfin/data/*.ts` — oraklet for overensstemmelsen |
| `vektorer/*.json` | Fælles testvektorer for den betroede logik (TS-Functions og Python-porten) — se `vektorer/README.md` |
| `byg.py` | Skriver de afledte filer; `--tjek` fejler, hvis noget er ude af takt |

## De 15 tabeller

Fabric-databasen har desuden Rayfins egne `Users` og `objects` (de "+2" i briefen). De er ikke en del af
kontrakten, og community-udgaven har dem ikke.

| Entitet | Tabel | Klienten må | Hvad |
|---|---|---|---|
| `Vaerk` | `Vaerks` | læse | Værkets hoved (kode, navn, oprindelse, `revision`) |
| `VaerkParameter` | `VaerkParameters` | læse | Ét blad i værkets case-YAML (`sti` = punktum-nøgler, `vaerdi_json`) |
| `Aendringslog` | `Aendringslogs` | læse | Revisionsspor pr. blad |
| `Aendringsanmodning` | `Aendringsanmodnings` | læse, oprette (egen e-mail, `status='ny'`) | Ønske om værksændring; udføres af backend |
| `Scenarie` | `Scenaries` | læse, oprette (egen e-mail), opdatere (ikke `oprettet_af`, `oprettet`, `vaerk_id`) | Værk + ændringer + kørselsvalg |
| `ScenarieAendring` | `ScenarieAendrings` | alt | Én knap i et scenarie (`set`/`enable`/`disable`) |
| `Bestilling` | `Bestillings` | læse, oprette (egen e-mail) | Ønske om en kørsel (`klient_noegle` er unik = idempotens) |
| `Koersel` | `Koersels` | læse | Én kørsel: status, frosset hash, resultatmetadata |
| `KoerselInput` | `KoerselInputs` | læse | Det frosne input (hashbeskyttet) |
| `KoerselNoegletal` · `KoerselMaaned` · `KoerselTime` | `…s` | læse | Resultater i langt format / pr. interval |
| `Motor` | `Motors` | læse | Regnemotorens tilstand, én række med `MOTOR_ID` |
| `Tidsserie` | `Tidsseries` | læse | Værkets egne tidsserier (uforanderlige filer + metadata) |
| `Vaerksarkimport` | `Vaerksarkimports` | læse | Én upload af et værksark og dens gang |

Tabelnavnene er Rayfins engelske flertal af klassenavnet (`Scenarie` → `Scenaries`). Det er grimt og
bindende: Functions, notebooks og community-serveren skriver SQL mod netop de navne.

## Typer: én logisk type, tre fysiske

| Logisk | Fabric (Rayfin, mssql) | sqlite | postgresql | mssql (community) |
|---|---|---|---|---|
| `uuid` | `UNIQUEIDENTIFIER` | `CHAR(36)` + CHECK små bogstaver | `UUID` | `UNIQUEIDENTIFIER` |
| `text` (max n) | `NVARCHAR(n)` | `VARCHAR(n)` | `VARCHAR(n)` | `NVARCHAR(n)` |
| `set` | `NVARCHAR(længste)` + CHECK | `VARCHAR(længste)` + CHECK | `VARCHAR(længste)` + CHECK | `NVARCHAR(længste)` + CHECK (BIN2) |
| `int` | `INT` | `INTEGER` | `INTEGER` | `INT` |
| `decimal(p,s)` | `DECIMAL(p,s)` | `NUMERIC(p,s)` | `NUMERIC(p,s)` | `DECIMAL(p,s)` |
| `boolean` | `BIT` | `INTEGER` + CHECK `IN (0,1)` | `BOOLEAN` | `BIT` |
| `datetime` | `DATETIME2` | `CHAR(24)` `YYYY-MM-DDTHH:MM:SS.fffZ` + CHECK | `TIMESTAMP(3)` | `DATETIME2(3)` |

**Bevidste afvigelser fra Rayfins egne valg** (testen kræver, at Fabric-kolonnen stadig er Rayfins):

- **Tid er UTC med millisekunder, uden tidszone** i community-udgaven. Rayfins postgresql-valg er
  `TIMESTAMP WITH TIME ZONE`, hvor en `INSERT '2026-01-05 10:00'` tolkes i sessionens tidszone — en fælde for
  den, der skriver selv med SQL. Millisekunder, fordi `Motor.sidste_jobstart` bruges som nøgle i betingede
  UPDATEs (huset har betalt for 100 ns mod JS' ms én gang).
- **sqlite gemmer tid som fast-bredde tekst**, så tekstsortering er tidssortering, og `tid >= ?` virker. CHECK'en
  afviser enhver anden form — ellers sorterer én fremmed række forkert, uden fejl.
- **Sæt-værdier er versalfølsomme overalt.** Fabric-databasens kollation er `SQL_Latin1_General_CP1_CI_AS`, så dens
  CHECK tager imod `'KOE'` som `'koe'`. Community-mssql bruger `COLLATE Latin1_General_100_BIN2` (det Rayfin selv
  skifter til bag et feature-flag).
- **`min` tæller ikke afsluttende mellemrum** i alle tre dialekter (`LENGTH(RTRIM(x,' '))`), som Fabrics `LEN`.
  Rayfins egen postgresql-DDL bruger `LENGTH(x)` og ville tage imod `' '` som et navn.

## Regler, som databasen ikke kan håndhæve

Dem håndhæver serveren/Functions ved skrivning og `valider-db` (`fjv_skema.tjek_data`) bagefter:

1. **Tekstlængde måles i UTF-16-kodeenheder** — som nvarchar og JS' `.length`. Pythons `len("😀")` er 1, nvarchar
   tæller 2. Brug `fjv_skema.utf16_laengde`. sqlite håndhæver ingen længde; postgresql tæller kodepunkter.
2. **`*_json`-kolonner skal kunne læses af JS' `JSON.parse`.** Pythons `json.loads` tager imod `NaN`/`Infinity`;
   `fjv_skema.gyldig_json` gør ikke. Kompakt JSON, ikke-endelige tal skrives som `null` (KONTRAKT §3.0).
3. **Mønstre** (`moenster`): `Vaerk.kode` `^[a-z0-9_]+$`, hashes som små hex, `KoerselMaaned.maaned` `YYYY-MM|periode`,
   scenariets periode som ISO-dato.
4. **Referencer er logiske — der er ingen FOREIGN KEY.** Fabric-databasen har ingen (Rayfin laver dem kun for
   relationer, og entiteterne bruger rene id-kolonner), `Aendringsanmodning.vaerk_id` er bevidst nil-uuid'et ved
   *opret værk* (der er intet kildeværk endnu), og oprydning sletter i en rækkefølge, som en FK ville blokere.
   Hver referencekolonne har et opslagsindeks.
5. **Invarianter**, som Rayfin ikke kan udtrykke (`invarianter` i skema.json). Med `ddl: true` er de også et
   (evt. filtreret) unikt indeks i community-DDL'en; i Fabric håndhæves de kun i kode, og læsevejen skal tåle brud:

   | Tabel | Invariant | Indeks i DDL |
   |---|---|---|
   | `VaerkParameter` | én værdi pr. (`vaerk_id`, `sti`) | ja |
   | `KoerselInput` | én værdi pr. (`koersel_id`, `kilde`, `sti`) — samme sti må stå som `vaerk` **og** `aendring` | ja |
   | `KoerselTime` | ét interval pr. (`koersel_id`, `tid`) | ja |
   | `Tidsserie` | højst én `aktiv` pr. (`vaerk_id`, `rolle`) | ja, filtreret (`WHERE aktiv`). Slå de andre fra **før** den nye slås til |
   | `KoerselNoegletal` · `KoerselMaaned` | naturlig nøgle med `NULL` som værdi | **nej**: dialekterne er uenige om `NULL` i et unikt indeks (mssql: lig; sqlite/postgresql: forskellige) |
   | `ScenarieAendring` | én ændring pr. (`scenarie_id`, `sti`) | nej: klienten må skrive en dublet; den afvises ved bestilling |
   | `Motor` | kun rækken `MOTOR_ID` | nej |

6. **Tekstsammenligning er versalufølsom i Fabric** (kollationen), versalfølsom i sqlite og postgresql. Det rammer
   e-mails: DAB's policy `@claims.email eq @item.bestilt_af` og kvoten pr. bruger matcher `Bruger@…` med `bruger@…` i
   Fabric, men ikke i community. Skriv e-mails, som sessionen giver dem — sammenlign aldrig en indtastet.

## Bring your own SQL

Community-udgaven kører på SQLite som standard; vil du bruge din egen database:

1. Opret en **tom** database, og kør scriptet for din dialekt:
   `sqlite3 fjv.db < skema/ddl/sqlite.sql` · `psql -d fjv -f skema/ddl/postgresql.sql` ·
   `sqlcmd -d fjv -i skema/ddl/mssql.sql` (scriptet sætter selv `QUOTED_IDENTIFIER ON`, som filtrerede indeks kræver).
   Eller `python -m fjernvarme_app ddl <dialekt>`.
2. Start serveren mod den: `python -m fjernvarme_app --db <SQLAlchemy-URL>`. Serveren opretter aldrig tabeller
   med andet end netop dette script, så den dokumenterede DDL og serverens database kan ikke glide fra hinanden.
3. **Skriv selv data** — kun i disse tabeller, og efter disse regler:

   | Tabel | Må du skrive? | Regler |
   |---|---|---|
   | `Vaerks` + `VaerkParameters` (+ `Aendringslogs`) | ja — et helt værk ad gangen | `kode` unik og `^[a-z0-9_]+$`; `revision = 1`, `kilde = 'app'`; ét blad pr. `sti` som fladet YAML (KONTRAKT §3.2: dicts rekurseres, skalarer **og lister** er blade, en tom dict er bladet `{}`); `sektion` = første nøgle, `objekt` = anden for `units`/`storage`/`prices`. En `opret`-log pr. blad holder revisionssporet ærligt. Nemmere: `python -m fjernvarme_app import <pakke.zip>` |
   | `Tidsseries` | kun med filen | Filen skal ligge normaliseret i datamappen (`time,mw`, UTC, timens start) med præcis den `sha256`, rækken siger — ellers afviser arbejderen den. Brug upload i appen |
   | `Scenaries` + `ScenarieAendrings` | ja | `set` kun på en eksisterende sti; `time.*`/`solver.*` har egne scenariefelter |
   | `Bestillings` | hellere ikke | Bestil i appen: kun `startBestilling` fryser input og håndhæver grænserne |
   | `Koersels`, `KoerselInputs`, `Koersel*`, `Motors`, `Vaerksarkimports` | **nej** | Skrives kun af den betroede logik og arbejderen; et forkert input bryder `input_hash` |

4. Kør `python -m fjernvarme_app valider-db` bagefter. Den læser rækkerne rå og rapporterer typer, længder,
   sæt, mønstre, JSON, dubletter, invarianter og referencer — det databasen ikke selv kan fange.

## Versioner og migrationer

- `version` i skema.json er et heltal. `versioner/<n>.json` fastfryses første gang `byg.py` ser version *n*.
- **Ændrer du strukturen** (alt undtagen `beskrivelse`/`kilde`-tekster), fejler `byg.py --tjek` og testen, indtil du
  hæver `version`. Så skriver `byg.py` `versioner/<n>.json` og `migrationer/<nnnn>.<dialekt>.sql`.
- Migrationen **afledes** af forskellen mellem `versioner/<n−1>.json` og `<n>.json` og er kun additiv: nye tabeller,
  nye NULL-kolonner sidst i en tabel, nye indeks. Alt andet (fjernet/ændret kolonne, ny sæt-værdi, NOT NULL på
  eksisterende rækker, ændret invariant) afvises med `IkkeAdditiv` og grunden — det kræver en håndskrevet migration,
  fordi en automatisk aldrig må kunne tabe eller omtolke data.
- Databasens version står i `_skema` (aktuel = `MAX(version)`); en migration indsætter sin egen række.
- Fabric-databasen migreres **ikke** herfra: Rayfin (`rayfin up db apply`) gør det ud fra entiteterne. Derfor skal en
  ændring altid ske begge steder — og overensstemmelsestesten fejler, indtil den er det.

## Tests

```
python -m unittest discover -s skema/test                                   # 36 tests, kun stdlib (+ community/ til vektorerne)
cd app && node --test "../skema/test/*.test.mjs"                            # Rayfin-overensstemmelse + TS-siden af vektorerne (kræver app/node_modules)
FJV_PGLITE=<mappe> node --test ../skema/test/postgresql.test.mjs            # postgresql-DDL'en kørt i rigtig Postgres (PGlite)
python skema/byg.py --tjek                                                  # afledte filer i takt
```

| Test | Beviser |
|---|---|
| `rayfin.test.mjs` | skema.json = Rayfins **egen** analyse af `app/rayfin/data/*.ts` for mssql og postgresql: kolonner i rækkefølge, typer, max/min, nullable, sæt, precision/scale, unik, CHECK-udtryk, rettigheder med policies. Oraklet er `SchemaAnalyzer`, ikke en regex, og var byte-identisk med CLI'ens deploy-config. Tre negative kontroller, heraf én der ændrer en kopi af en entitet |
| `test_skema.py › MaaltFabric` | Den **målte** Fabric-database (typer, nullability, PK/unikke, CHECKs — SQL Servers egen omskrivning af `IN` til `OR`) er skemaets Rayfin-profil. Kolonner tilføjet efter målingen er en eksplicit liste |
| `test_skema.py › SqliteDDL` + `postgresql.test.mjs` | DDL'en køres, og `ddl_tilfaelde.json` (22 tilfælde) giver samme udfald i begge — undtagen hvor dialekterne er dokumenteret uenige |
| `test_skema.py › Migrationer` | En v1-database med data løftet til en tænkt v2 er strukturelt lig en frisk v2; seks ikke-additive ændringer afvises |
| `test_skema.py › Raekkeregler`, `Tvaersregler` | `valider-db`'s regler, inkl. UTF-16, NaN, NULL som værdi i naturlige nøgler, filtrerede invarianter, delvise udtræk |
| `vektorer.test.mjs` · `test_vektorer_ts_testene.py` | De fælles vektorer: den nuværende TS giver præcis de gemte (genererede og udtrukne af TS-testene), og Python-porten giver TS' udfald på tilfældene fra TS-testene. Se `vektorer/README.md` |

**Ikke kørt:** `ddl/mssql.sql` — der er ingen SQL Server på udviklingsmaskinen. Dens typer og CHECKs er Rayfins (testet
mod oraklet og den målte database) bortset fra `DATETIME2(3)`, `COLLATE … BIN2` og indeksene.
