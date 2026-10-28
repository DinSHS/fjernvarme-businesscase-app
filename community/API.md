# Community-serverens REST-API

Ejer: fv-server. Den bindende aftale mellem `community/` (serveren) og frontendens `rest`-adapter
(`app/src/lib/data/**`, `VITE_BACKEND=rest`). Formen spejler Rayfin-klienten, så adapteren kan være tynd:
hooks og skrivehjælpere (`hooks.ts`, `skriv.ts`) bruger den samme `data.<Entitet>`/`functions.<navn>`-flade
i begge udgaver.

Alt er JSON (UTF-8). Basis: `/api`. Serveren lytter som standard på `http://localhost:8000`.

## Session og identitet

| Kald | Svar |
|---|---|
| `GET /api/session` | `{ "bruger": "<e-mail/navn>", "udgave": "community", "version": "0.3.1", "skemaversion": 1 }` |
| `GET /api/om` | kreditering, se nederst |

Der er **intet login**. Brugeren er en konfigurationsværdi (`--bruger`, `FJV_BRUGER`; standard `<login>@lokal`).
Bag en reverse proxy kan den i stedet komme fra en header (`--bruger-header X-Forwarded-Email`); mangler headeren,
svares `401`. Adapteren skal hente `bruger` fra `/api/session` og give den til skrivehjælperne som i dag (`bruger`
i props) — serveren håndhæver, at e-mailfeltet i en oprettet række ER sessionens bruger (som DAB's policy).

## Værn mod fremmede sider (K6-F9)

Serveren har intet login, så den beskytter sig mod at blive brugt *fra en anden webside* i brugerens browser:

| Regel | Gælder | Afvisning |
|---|---|---|
| `Host` skal være `localhost`, `127.0.0.1`, `[::1]` eller et navn givet med `--tilladt-vaert` (mod DNS-rebinding) | alle forespørgsler | `403 ikke_tilladt` |
| `Origin`, hvis den er sat, skal være siden selv (`http(s)://<Host>`) eller givet med `--tilladt-oprindelse` | skrivninger | `403 ikke_tilladt` |
| `Sec-Fetch-Site` må ikke være `cross-site` eller `same-site` | skrivninger | `403 ikke_tilladt` |
| `Content-Type: application/json` (import: `application/zip`); en `DELETE` uden krop er undtaget | skrivninger | `403 ikke_tilladt` |
| Sessionscookien `fjv_csrf` (sat af `GET /api/session` og af siden; `SameSite=Strict; HttpOnly`; ny ved hver serverstart) | skrivninger | `403 ikke_tilladt` ("Genindlæs siden") |

Skrivninger = `POST`/`PATCH`/`DELETE` under `/api`. Serveren svarer ikke på CORS-forhåndstjek (`OPTIONS` → 501), så en
fremmed side kan heller ikke sende JSON. Browseradapteren skal intet særligt: den kalder `/api/session` ved start og
bruger `credentials: "same-origin"`. **Andre klienter** (scripts) skal hente cookien fra `/api/session` først og sende
den med — se `tests/live_bestil.py`. En Vite-dev-proxy på en anden port kræver `--tilladt-oprindelse http://localhost:<port>`.

## Data: `/api/data/<Entitet>`

`<Entitet>` er entitetsnavnet (`Vaerk`, `VaerkParameter`, `Koersel`, …), ikke tabelnavnet.

### Læs

```
GET /api/data/<Entitet>?filter=<json>&orderBy=<json>&first=<n>&after=<markør>&fields=<a,b,c>
-> 200 { "items": [ {…}, … ], "hasNextPage": true|false, "endCursor": "<markør>"|null }

GET /api/data/<Entitet>/<id>
-> 200 { … }   |   404 findes_ikke
```

* **`filter`** — samme grammatik som Rayfin's `.where(...)`, uændret fra hooks'ene:
  `{"vaerk_id": {"eq": "…"}}`, `{"and": [ … ]}`, `{"or": [ … ]}`, `{"not": { … }}`.
  Operatorer: `eq` `neq` `gt` `gte` `lt` `lte` `in` `nin` `isNull` `contains` `notContains` `startsWith` `endsWith`.
  `eq: null` = `IS NULL`. Tidspunkter som ISO-tekst (`"2026-01-05T00:00:00.000Z"`; uden zone = UTC).
  Et ukendt felt eller en ukendt operator giver `400 ugyldig` — aldrig et tavst ignoreret filter.
* **`orderBy`** — `{"felt": "asc"|"desc", …}` (rækkefølgen af nøglerne bevares) eller en liste af sådanne.
  `id` tilføjes altid som sidste nøgle, så rækkefølgen er entydig.
* **`first`** — standard **100**, højst 100.000 (som DAB). Læs derfor ALTID til `hasNextPage` er `false`
  (`hent-alle.ts` gør det allerede).
* **`after`** — `endCursor` fra forrige side (uigennemsigtig; i dag en forskydning).
* **`fields`** — valgfrit kommasepareret feltudvalg (som `.select(felter)`).

Værdier ud: uuid med **små bogstaver**; tidspunkter som ISO-UTC med millisekunder og `Z`
(`"2026-10-16T18:46:36.714Z"`); booleans som JSON-booleans; decimaler som tal (heltal uden `.0`).
Ingen tekstværdi "snuses" om til boolean eller dato — men hooks'enes normalisering skal være harmløs på dem.

### Opret, ret, slet (klientens rettigheder, fra `skema/skema.json` › `klient`)

| Entitet | `POST /api/data/<E>` | `PATCH /api/data/<E>/<id>` | `DELETE /api/data/<E>/<id>` |
|---|---|---|---|
| `Scenarie` | ja, `oprettet_af` = brugeren | ja, ikke `oprettet`, `oprettet_af`, `vaerk_id` | nej (arkivér) |
| `ScenarieAendring` | ja | ja | ja |
| `Bestilling` | ja, `bestilt_af` = brugeren | nej | nej |
| `Aendringsanmodning` | ja, `anmodet_af` = brugeren og `status` = `"ny"` | nej | nej |
| alle andre | nej | nej | nej |

* `POST` tager rækken som krop og svarer `201` med den gemte række. `id` må udelades (serveren laver et uuid).
* Værdier valideres mod skemaet FØR databasen: type, længde i UTF-16-enheder, `min`, sæt-værdier, mønstre,
  påkrævede felter, ukendte felter. Ingen tavs trunkering.
* `PATCH` tager de felter, der ændres; svarer med den opdaterede række. `DELETE` svarer `{ "id": "…" }`.

## Funktioner: `POST /api/fn/<navn>`

Krop = input-objektet, svar = output — **præcis** `AppFunctionsSchema` i
`app/rayfin/functions/src/types.ts` (samme navne, samme felter, samme svar ved afvisning: en afvisning er et
`200`-svar med `ok: false` og en dansk tekst, som i Fabric).

| Navn | Input | Bemærkning lokalt |
|---|---|---|
| `startBestilling` | `{ bestillingId }` | fryser input og starter en lokal arbejder-proces; `arbejder.fabric_job_id` = `"lokal:<pid>"` |
| `udfoerAendring` | `{ anmodningId }` | |
| `afstem` | `{}` | døde kørsler (låsen fri + intet hjerteslag i 5 min) -> `fejl`; kø uden arbejder -> start |
| `annullerKoersel` | `{ koerselId }` | samarbejdende (`annuller_anmodet`), som §6c |
| `hentKildeYaml` | `{ vaerkId }` | `<data>/Files/fjv/vaerker/<kode>/kilde.yaml` |
| `uploadTidsserie` | `{ anmodningId, indholdBase64 }` | |
| `hentTidsserie` | `{ tidsserieId, fra, til }` | |
| `uploadVaerksark` | `{ anmodningId, indholdBase64 }` | starter en lokal import-proces |
| `hentDmiTemperatur` | `{ omraade, fra, til, kolonne }` | henter df-data på Motor-rækkens `data_commit`, hvis den ikke er hentet |
| `skemaInfo` | `{}` | `login` = `<dialekt>:<bruger>` |
| `importerArkiv` | `{ anmodningId, del }` | én del af et arkiv (runde 13): anmodning `importer_arkiv` (nil-uuid som værk) med delens sha256; `logik/arkiv.py` |

Kroppen må højst være 8 MB (uploads er base64 af højst 2,9 MB CSV / 2,5 MB xlsx).

## Værkspakker (kun community)

```
GET  /api/eksport/vaerk/<id eller kode>  -> application/zip  (<kode>.fjvpakke.zip)
POST /api/import/vaerk[?kode=<ny_kode>]  krop = zip-filens bytes (application/zip)
     -> 200 { ok: true, vaerk_id, kode, parametre, tidsserier, scenarier }  |  4xx fejl
```

Pakken: `pakke.json` (format, versioner, værk, blade, tidsserier, scenarier — ingen e-mails, ingen id'er),
`tidsserier/<sha256>.csv`, `kilde.yaml`, `LAESMIG.txt`. Se `fjernvarme_app/pakke_vaerk.py`.

Format 2 (K6-F4/F5): hver tidsserie har pakkenøglen `<rolle>:<sha256>`, og et scenaries valg `_tidsserie.<rolle>` står
som `"pakke:<rolle>:<sha256>"` — samme fil kan være registreret i begge roller uden at blive forvekslet. Scenarier har
en lokal `noegle` (`s1`, `s2` …) og `reference` (nøglen på referencescenariet), som oversættes til de nye id'er. Import
validerer HVER ændringsrække (skema, `set` med værdi, ingen dubletter inkl. `disable x` + `set units.x.enabled`,
oversættelige referencer) før noget skrives; en reference, der ikke kan oversættes, afviser hele pakken. Format 1 læses
stadig (rollen tages fra stien).

## Fejl

```
4xx/5xx { "fejl": { "kode": "<kode>", "besked": "<dansk tekst til brugeren>" } }
```

| `kode` | HTTP | Betyder | Adapteren bør |
|---|---|---|---|
| `policy` | 403/401 | rækken er ikke i brugerens navn (eller `status` ≠ `ny`) | `Afvist(besked)` (som DAB's "Could not insert row") |
| `unik` | 409 | samme unikke nøgle findes (fx `klient_noegle`) | `Afvist("Findes allerede (samme nøgle).")` — `bestilKoersel` genkender den |
| `ikke_tilladt` | 403 | entiteten/feltet må ikke skrives af klienten | `Afvist(besked)` (som "does not exist on the type `Mutation`") |
| `ugyldig` | 400/413 | ugyldigt input (felt, type, længde, filter) | `Afvist(besked)` |
| `findes_ikke` | 404 | ukendt entitet, id, funktion eller sti | fejl |
| `teknisk` | 500 | uventet fejl i serveren | fejl |

## Om og kredit: `GET /api/om`

```
{ "kreditlinje": "Bygger på fjernvarme-businesscase af skj-1964 (MIT), udviklet med Billund Varme og Dansk Fjernvarme · data fra df-data",
  "saetning": "Denne app er en brugerflade til fjernvarme-businesscase-modellen. …",
  "model": { repo, url, licens, ophavsret, commit, commit_url, licenstekst },
  "data":  { repo, url, licens, ophavsret, commit, commit_url, licenstekst, kilder },
  "forfatter": { navn, github, url }, "udviklet_med": [ … ], "distribution": "…", "app": { udgave, version } }
```

Faktaene kommer fra `offentlig/kredit.json` og `LICENSES/`; `commit` er den pin, en ny kørsel vil fryse
(Motor-rækken). Siden "Om og kredit" i appen kan bygges direkte af dette svar.
