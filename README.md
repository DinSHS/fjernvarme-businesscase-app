# Fjernvarme Businesscase — en brugerflade til den åbne driftsmodel

Dette er en brugerflade til [`fjernvarme-businesscase`](https://github.com/skj-1964/fjernvarme-businesscase) af
skj-1964 (MIT), den åbne MILP-driftsmodel for fjernvarmeværker, som Steen Kramer Jensen har udviklet sammen med
Billund Varme og Dansk Fjernvarme, og de markeds- og vejrdata fra [`df-data`](https://github.com/skj-1964/df-data),
den regner på. Metoden, valideringen og referencetallene er forfatterens; denne app gør modellen brugbar uden
kommandolinje. Se [`CREDITS.md`](CREDITS.md). Der foreligger ingen godkendelse eller tilslutning fra Dansk Fjernvarme,
Billund Varme eller modellens forfatter.

> **Status:** privat repo til deling med modellens forfatter; ikke offentliggjort. Repoet er **kilden** — se [`SYNKRONISERING.md`](SYNKRONISERING.md).

## Hvad du får

| Område | Indhold |
|---|---|
| Dokumentation | Modelrepoets vejledninger (uændret, med kildelinje) og appens egen vejledning |
| Information | Metoden forklaret, begreber, referencetal, datadækning, kendte begrænsninger |
| Konfiguration | Se og redigér værker (enheder, lagre, priser, tariffer, balancering, tid, data, solver) med revisionsspor |
| Analyser | Alle kørsler: nøgletal, enhedsfordeling, måneder, intervaldispatch — og sammenligning af to kørsler |
| Scenarier | Opret scenarie = værk + ændringer, bestil en kørsel, følg status, sammenlign med en reference |

Modellen kører aldrig i browseren. Der er **to måder at køre appen på**, med samme sider, samme databaseskema og samme regnemotor:

| | **Lokal udgave** | **Fabric-udgave** |
|---|---|---|
| Hvad | en Python-server på din maskine (SQLite eller din egen database), en lokal arbejder, filer i en mappe | en Fabric App med SQL-database, Entra-login og hosting; regnemotoren er en Python-notebook; kode og data i et lakehouse |
| Kom i gang | [`community/README.md`](community/README.md) | [`FABRIC.md`](FABRIC.md) |
| Kræver | Python 3.11–3.13 | en Fabric-kapacitet, `fab`, Node.js, Rayfin CLI 1.36.1 |

### Lokal udgave i korte træk

```bash
python community/pakke.py --ud wheel          # bygger wheel'en (frontend: cd app && npm ci && npm run build:community, først)
python -m venv .venv && .venv/Scripts/pip install "wheel/fjernvarme_app-<version>-py3-none-any.whl[model]"
.venv/Scripts/python -m fjernvarme_app --demo   # åbner http://localhost:8000 med modelrepoets cases som demo
```

* Egen database: `--db <sqlalchemy-url>` (SQLite er standard; PostgreSQL og SQL Server kan bruges). Egne data: CSV-tidsserier, værksark eller direkte i tabellerne via SQL — se
  [`skema/SKEMA.md`](skema/SKEMA.md); `valider-db` tjekker en database, der er skrevet udefra.

## Din installation — alt organisationsspecifikt er lokalt

Workspace-, lakehouse-, database- og notebook-id'er, servernavn, app-adresse, organisationens tema og navne står **aldrig** i repoet. De står i lokale, git-ignorerede filer:

| Fil | Indhold |
|---|---|
| `config/installation.json` | din Fabric-installation (skabelon: `config/installation.eksempel.json`) — læses af `fabric/deploy.py`, `fabric/byg.py` og `scripts/installation.py` |
| `config/forbud.lokal.json` | dine organisationsnavne m.m., som gaten skal stoppe (valgfri) |
| `app/src/styles/temaer/privat/` | dit eget tema ([`app/TEMAER.md`](app/TEMAER.md)) |

`python scripts/installation.py vis` viser din installation (id'er forkortet). `python fabric/deploy.py --tor kode` og `python scripts/installation.py rayfin-up --tor` viser, hvad en udrulning
*ville* gøre, uden at udføre noget.

**Gaten:** `python scripts/tjek.py` stopper, hvis noget af det lokale — eller et rigtigt servernavn, en brugersti eller en manglende kredit — står i det, der committes.
Installér pre-commit-hooken én gang i din kopi: `python scripts/tjek.py --installer-hook`. Se [`SYNKRONISERING.md`](SYNKRONISERING.md).

## Kom i gang som udvikler

```bash
python -m unittest discover -s offentlig/tests -t .          # gate, installation, kreditkrav (stdlib)
cd fabric && python -m unittest discover -s tests -t .        # regnemotoren (stdlib, ingen netværk)
cd app && npm ci && npm test                                  # frontend (vitest); `npm run test:community` kører mod REST-adapteren
cd app/rayfin/functions && npm ci                             # Rayfin Functions har egne afhængigheder (motor.spec.ts kræver dem)
```

Seks frontend-specs læser et **lokalt udtræk af din egen installations database** (`app/skaermbilleder/harness/fixtures.json`, hentes med
`node app/skaermbilleder/hent_fixtures.mjs <tokenfil>`). Filen er installationens data og ligger ikke i repoet; uden den springes de over
(`vitest.config.ts` skriver hvilke). Skærmbillede-/layout-harnessen (`app/skaermbilleder/harness/`) er ikke med, før der findes en syntetisk, delbar fixture.

## Kredit og licens

- Kredit, kildecitater, pinnede commits og vilkår: [`CREDITS.md`](CREDITS.md), kort: [`NOTICE`](NOTICE).
- Appens kode: [`LICENSE`](LICENSE). Modellens og datarepoets licenser (ordret): [`LICENSES/`](LICENSES/).
- **Vi distribuerer ikke modellens kode.** Appen afhænger af den på en pinnet commit og henter den, når en kørsel regnes.
- Data fra Energinet (Energi Data Service) og DMI er CC BY 4.0 (efter datarepoet); appen gør ikke krav på dem.
