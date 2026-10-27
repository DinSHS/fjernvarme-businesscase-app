# Fjernvarme Businesscase — community-udgaven

En lokal brugerflade til den åbne MILP-driftsmodel
[github.com/skj-1964/fjernvarme-businesscase](https://github.com/skj-1964/fjernvarme-businesscase) (MIT) af
Steen Kramer Jensen (`skj-1964`), udviklet sammen med **Billund Varme** og **Dansk Fjernvarme**, og
datarepoet [github.com/skj-1964/df-data](https://github.com/skj-1964/df-data) (Energinet/Energi Data Service og
DMI, CC BY 4.0). Metoden, valideringen og referencetallene er forfatterens; appen er en brugerflade til modellen
og kører den uændret på en pinnet commit. Vi distribuerer ikke modellens kode — den hentes fra GitHub på den
pinnede commit ved første kørsel. Appen er ikke udviklet, godkendt eller støttet af forfatteren, Billund
Varme eller Dansk Fjernvarme. Fuld kreditering og licenstekster: `CREDITS.md`, `NOTICE`, `LICENSES/` og
`GET /api/om`.

---

Samme app som Fabric-udgaven — samme sider, samme databaseskema (`skema/skema.json`), samme regnemotor
(`fabric/fjv`) og samme betroede regler (`fjernvarme_app/logik`, bundet af fælles testvektorer) — men på din egen
maskine: en Python-server med SQLite (eller din egen database), en lokal arbejder-proces og filer i en mappe.

## Kom i gang

Wheel'en bygges fra repoet: se [README › Kom i gang](../README.md#kom-i-gang--lokal-udgave-ca-5-minutter) (brugerfladen med
`npm run build:community`, derefter `python community/pakke.py`). Har du allerede en wheel:

```
python -m venv .venv
.venv/Scripts/pip install "fjernvarme_app-<version>-py3-none-any.whl[model]"    # Windows; Linux: .venv/bin/pip
.venv/Scripts/python -m fjernvarme_app --demo
```

Browseren åbner `http://localhost:8000`. `--demo` indlæser modelrepoets egne cases (Andeby, Billund …) som værker
første gang; næste gang springes de over. Bestil så en kørsel af Andeby på 2 døgn: den skal give
**867.031,23 kr.** ved modelversion eef950a (målt 2026-10-26 fra et rent venv med wheel'en; samme tal som
den ægte arbejder i `fabric/koer_minne.py`). Før rettelserne 19/10-2026 (b49aeb0) var tallet 844.727,28 kr.

* Python 3.11–3.13. `[model]` installerer modellens pins (`linopy 0.10.0`, `highspy 1.15.1` …) i samme venv.
  Uden `[model]` bygger motoren selv et venv med modelrepoets `requirements.txt` ved første kørsel (kræver net).
* Første kørsel henter modelkoden (zip, ~1 MB) og df-data (zip, ~60 MB) på de pinnede commits til datamappen.
* **Windows:** Brug en kort datamappe (`--data C:\fjv`). Kørslernes filnavne er lange, og Windows' grænse er
  260 tegn pr. sti.

## Kommandoer

| Kommando | Gør |
|---|---|
| `python -m fjernvarme_app [--demo]` | start serveren (standard `127.0.0.1:8000`, datamappe `./fjernvarme_data`) |
| `… --data <mappe> --db <url> --port <n> --bruger <e-mail>` | egen datamappe, egen database, port, identitet |
| `… --uden-arbejder` | start ikke arbejder-processer (kørsler bliver i kø) |
| `… --tilladt-vaert <navn>` / `--tilladt-oprindelse <url>` | ekstra tilladt `Host` (bag en proxy) / `Origin` (en dev-proxy) |
| `python -m fjernvarme_app arbejder` | kør ét arbejderjob i hånden (tager solver-låsen og tømmer køen) |
| `python -m fjernvarme_app valider-db [--json]` | tjek en database, fx skrevet udefra med SQL, mod skemaet |
| `python -m fjernvarme_app eksport <kode> <fil.zip>` | eksportér et værk som pakke |
| `python -m fjernvarme_app import <fil.zip> [--kode <ny>]` | importér en værkspakke |
| `python -m fjernvarme_app ddl sqlite\|postgresql\|mssql` | CREATE-scriptet til din egen database |
| `python -m fjernvarme_app demo` | indlæs modelrepoets cases og stop |

## Data ind og ud

* **CSV-tidsserier** (målt varmelast, solprofil) og **værksark** (`vaerksdata_skabelon.xlsx`) uploades i appen som i
  Fabric-udgaven; reglerne er fv-data's (`viden/data_krav.json`).
* **Værkspakke** (zip): et helt værk — parametre, gyldige tidsserier, scenarier — uden e-mails eller id'er, så den
  kan deles. Import validerer mod skemaet, modellens minimumskrav og tidsseriernes sha256, før noget skrives.
  `GET /api/eksport/vaerk/<kode>`, `POST /api/import/vaerk`.
* **Skriv selv i tabellerne (bring your own SQL).** Opret databasen med `python -m fjernvarme_app ddl <dialekt>`
  (eller `skema/ddl/*.sql`), og start serveren med `--db <url>`:
  `postgresql+psycopg://bruger:kode@vaert/db` (`pip install fjernvarme_app[postgresql]`) eller
  `mssql+pyodbc://…?driver=ODBC+Driver+18+for+SQL+Server` (`[mssql]`). Reglerne for, hvad du må skrive, står i
  `skema/SKEMA.md`; kør `python -m fjernvarme_app valider-db` bagefter — den finder hængende referencer, ugyldig
  JSON, dubletter i naturlige nøgler, to aktive tidsserier for samme rolle, forkerte typer og længder.
  Betroede tabeller (`Koersel*`, `Motor`) skal du ikke skrive i; det gør arbejderen.

## Arkitektur

```
Browser (app/dist-rest, VITE_BACKEND=rest) ──REST /api──► fjernvarme_app.server (stdlib http.server)
                                                             │  data_api   klientens rettigheder fra skema.json (som DAB)
                                                             │  funktioner fv-port's forløb (logik.tjenester)
                                                             ▼             mod betroet_lager (SQLAlchemy)
                                                          SQLite / PostgreSQL / SQL Server
python -m fjernvarme_app arbejder  (startes af serveren) ──► fjv.arbejder.arbejd + fjv.koersel.koer_en (UÆNDREDE)
                                                             mod lokal_lager (SQLAlchemy) + laas.FilLaas (OS-lås)
                                                             filer i <data>/Files/ (samme layout som lakehousets Files/)
```

* **Én solver ad gangen** (KONTRAKT §6c) med en OS-fillås (`<data>/fjv_solver.lock`) i stedet for SQL-applocken:
  dør arbejderen, frigiver operativsystemet låsen. `afstem` (ved start og "Opdatér") sætter kørsler uden levende
  arbejder til `fejl` efter 5 minutter uden hjerteslag og starter en ny arbejder, hvis der er kø.
* **Identitet:** intet login. Brugeren er `--bruger` (standard `<login>@lokal`); bag en reverse proxy kan den komme
  fra en header (`--bruger-header X-Forwarded-Email`) — den header er KUN betroet bag en proxy, der selv logger ind og
  overskriver den. Multi-bruger er ikke bygget — sæt ikke serveren på et netværk uden en proxy med login foran.
  Lytter serveren på andet end loopback (`--vaert 0.0.0.0`), skriver den en tydelig ADVARSEL ved start.
* **Værn mod fremmede sider:** `Host` skal være localhost (eller `--tilladt-vaert <navn>`, fx proxyens offentlige
  navn); skrivninger kræver sidens egen `Origin` (eller `--tilladt-oprindelse`), JSON-medietype og sessionscookien,
  som siden selv får. Detaljer i `API.md`. Docker med en anden port (`-p 9000:8000`) virker uden videre, fordi
  `Origin` sammenlignes med `Host`.
* REST-API'et er beskrevet i `API.md`. Det spejler Rayfin-klienten, så frontendens sider er de samme.

## Udvikling

```
cd community
python -m venv _lokal/.venv && _lokal/.venv/Scripts/pip install sqlalchemy pyyaml openpyxl setuptools
_lokal/.venv/Scripts/python -m unittest discover -s tests -t tests                     # serveren
FJV_BETROET_LAGER=sql_fabrik:fabrik PYTHONPATH=tests \
  _lokal/.venv/Scripts/python -m unittest fjernvarme_app.logik.tests.test_tjenester     # forløbene mod SQL
_lokal/.venv/Scripts/python pakke.py                                                   # wheel i _byg/dist/
```

Manuelle live-prøver mod en kørende server (ikke en del af testsuiten, som kun samler `test_*.py`):
`python tests/live_bestil.py http://localhost:8000 andeby 2026-01-05 2026-01-06` (samme kald som knappen *Bestil*) og
`python tests/live_upload.py http://localhost:8000 <værk> <fil.csv> <ark.xlsx>` (upload af CSV og værksark).

Fra repoet kører `python -m fjernvarme_app` direkte (motoren læses fra `../fabric/fjv`, skemaet fra `../skema`).
`pakke.py` lægger dem ind i pakken. Docker: `docker build -f community/Dockerfile .` fra repoets rod.

## Licens

Appens egen kode: se [`LICENSE`](../LICENSE). Modellen og data: se [`CREDITS.md`](../CREDITS.md) og [`LICENSES/`](../LICENSES/).
