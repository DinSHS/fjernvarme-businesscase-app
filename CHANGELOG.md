# Ændringslog

Versionerne følger [semantisk versionering](https://semver.org/lang/da/): **MAJOR** ændrer en beregning, et skema, der
kræver migrering, eller noget, en bruger har bygget på; **MINOR** tilføjer noget bagudkompatibelt; **PATCH** retter
uden at ændre betydning. Versionen står i `app/package.json`, `app/rayfin/rayfin.yml` og
`community/fjernvarme_app/__init__.py` (wheel'en).

Hver version siger, hvilken model- og df-data-commit den er pinnet til, og hvilke trin en eksisterende Fabric-installation
skal køre ([`doc/FABRIC.md`](doc/FABRIC.md#opdatér-en-eksisterende-installation)). Tal fra før en ny modelpin kan ikke
sammenlignes med tal efter.

## [Ikke udgivet] — 0.4.0

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
  efter bytes; afledte kolonner er entydigt kodet. Tal bevares med dobbelt præcision (som appen læser dem) — en decimal
  med flere cifre afvises i stedet for at afrundes.

### Ændret
- Scenarielisten (`#/scenarier`) har ikke længere farvevalg eller heatmap: ΔRef står som almindeligt tal med fortegn.
- Navnet på en kørsels tidsserie slås op på sha256, når id'et ikke findes i installationen (importerede kørsler).

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
