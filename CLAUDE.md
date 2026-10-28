# CLAUDE.md

Vejledning til Claude Code (claude.ai/code) og andre kodeassistenter, der arbejder i dette repo. Sproget er dansk i
dokumentation, kommentarer og identifiers (jf. [`CONTRIBUTING.md`](CONTRIBUTING.md)); denne fil følger samme konvention.

---

## 1. Hvad projektet er

En brugerflade til den åbne MILP-driftsmodel [`skj-1964/fjernvarme-businesscase`](https://github.com/skj-1964/fjernvarme-businesscase)
(Linopy + HiGHS). Appen lader en fjernvarmeingeniør se og rette værker, bestille kørsler og læse resultaterne — uden
kommandolinje. **Modellen kører aldrig i browseren**: en arbejder (lokalt en Python-proces, i Fabric en notebook) kører
modelrepoets `run_case.py` uændret på en pinnet commit.

**Modelrepoet er sandheden.** Appen må ikke opfinde, afrunde, forenkle eller forbedre en antagelse uden at sige det
(*egen antagelse*). Se [`doc/TROFASTHED.md`](doc/TROFASTHED.md). Repoet indeholder ikke modellens kode.

Én kerne, to udgaver med samme sider, skema og regnemotor:

| | Lokal udgave (`community/`) | Fabric-udgave (`app/rayfin/`, `fabric/`) |
|---|---|---|
| Server | `python -m fjernvarme_app` (stdlib http.server + SQLAlchemy) | Fabric App (Rayfin): SQL-database, Entra, hosting |
| Frontend | `app/`, bygget med `VITE_BACKEND=rest` → `app/dist-rest/` | `app/`, `VITE_BACKEND=rayfin` → `app/dist/` |
| Arbejder | `fabric/fjv` som underproces, fillås | `fabric/fjv` i notebooken `fjv_koer_scenarie`, SQL-applock |
| Vejledning | [`community/README.md`](community/README.md) | [`doc/FABRIC.md`](doc/FABRIC.md) |

---

## 2. Når brugeren siger …

Brugerne er driftsfolk og ingeniører, ikke nødvendigvis programmører. Oversæt deres ord til kommandoerne nedenfor, og
spørg kun tilbage, hvis noget ikke kan afgøres herfra. Kør fra repoets rod.

| Når brugeren siger … | … betyder det |
|---|---|
| "start appen", "prøv appen", "vis mig appen" | Den lokale udgave med modelrepoets cases: følg README's *Kom i gang* (byg frontend, byg og installér wheel'en med `[model]`, `python -m fjernvarme_app --demo --data <kort mappe>`). Er wheel'en allerede installeret i `.venv`, så start bare serveren. Windows: datamappen skal være kort (`C:\fjv`); grænsen er 260 tegn pr. sti. |
| "start appen med mine data", "mit værk", "vores værk" | Spørg, hvad de har: **værksark** (`vaerksdata_skabelon.xlsx`), **CSV** med målt varmelast, eller en **database**. Start serveren (`--demo` giver Andeby at sammenligne med). Arket uploades i browseren under *Konfiguration › Upload værksark*; CSV under *værk › Tidsserier › Upload CSV*; en database gives med `--db <SQLAlchemy-URL>` og tjekkes med `python -m fjernvarme_app valider-db`. Se [`doc/EGNE_DATA.md`](doc/EGNE_DATA.md). Konvertér **ikke** arket selv med andet end appen: den bruger modelrepoets eget script ved pinnen. |
| "Andeby" | Kursets fiktive værk, `cases/andeby.yaml` i modelrepoet; værkskode `andeby`. |
| "kør Andeby", "en hurtig kørsel" | Bestil Andeby 5.–6. januar 2026 uden balancemarked i appen (*Scenarier*). Facit: **867.031,23 kr.** Uden server: `python fabric/koer_minne.py andeby 2026-01-05 2026-01-06`. |
| "vintervinduet" / "sommervinduet" | 5.–16. januar 2026 / 8.–19. juni 2026 (modelrepoets README). |
| "hvad koster det at …", "hvad sparer vi ved …" | Differensmetoden: et par kørsler med samme værk, periode og data, kun ændringen forskellig. Appen laver parret under *Scenarier* og viser forskellen under *Analyser*. Læs differensen, ikke de absolutte tal. |
| "helåret", "hele året" | Tager 1–40 minutter og op til 3,5 GB hukommelse. Sig det, før du bestiller; kør ikke to helår samtidig. |
| "regner appen rigtigt?", "test trofastheden" | [`doc/TROFASTHED.md`](doc/TROFASTHED.md) §4: `tjek_trofasthed.py` og `bevis_app_vej.py`. |
| "tag backup", "flyt historikken", "gem kørslerne i Excel" | *Scenarier › Backup og flytning* (`#/scenarier/arkiv`): eksportér arkivet (.xlsx pr. familie / .zip), importér med forhåndsvisning. Værkerne er ikke med: upload værksarket først. Et rettet arkiv afvises (sha256 pr. tabel). Se *Sådan bruger du appen* §7. |
| "installér i Fabric", "udrul" | [`doc/FABRIC.md`](doc/FABRIC.md). Brugeren skal selv logge ind (`fab auth login`, `az login`, `npx rayfin login`) i en rigtig konsol. **Udrul aldrig uden at blive bedt om det.** |
| "ny modelversion", "opdatér modellen" | [`CONTRIBUTING.md`](CONTRIBUTING.md#ny-modelversion). Pinnen skiftes bevidst; tallene ændrer sig. |

Sådan svarer du:

- På dansk, med driftsfolkenes ord: enheder, varme, tank, kroner og MWh. Nævn altid perioden; 2 døgn er ikke et år.
- Vis tal fra appen eller modellens filer, aldrig hukommelse. Ser et tal mærkeligt ud, så sig det.
- Skeln mellem modellens tal og appens egne antagelser (fx et forslået gab eller en anbefaling).

---

## 3. Kommandoer

```bash
# Lokal udgave fra kilden (Node ≥ 20, Python 3.11–3.13)
cd app && npm ci && npm run build:community && cd ..
python -m venv .venv && .venv/Scripts/python -m pip install setuptools     # POSIX: .venv/bin/
.venv/Scripts/python community/pakke.py --ud _lokal/wheel                  # kræver setuptools (pip wheel --no-build-isolation)
.venv/Scripts/python -m pip install "_lokal/wheel/fjernvarme_app-<version>-py3-none-any.whl[model]"
.venv/Scripts/python -m fjernvarme_app --demo --data C:\fjv

# Gaten (begge udgaver, 10–15 min; trofasthed kræver modelrepoet i ../fjernvarme-businesscase eller FJV_MODELREPO)
cd app && npm run gate
python scripts/tjek.py                                     # intet organisationsspecifikt; kreditten intakt

# Python-tests (stdlib, intet netværk)
python -m unittest discover -s offentlig/tests -t .
cd fabric && python -m unittest discover -s tests -t .
python -m unittest discover -s skema/test
cd community && python -m unittest discover -s tests -t tests       # kræver sqlalchemy, pyyaml, openpyxl

# Trofasthed
python viden/vaerktoej/byg_modelspejl.py [--tjek]
python viden/vaerktoej/tjek_trofasthed.py
python viden/vaerktoej/bevis_app_vej.py --model <modelrepo ved pinnen> --ud <kort mappe>
```

---

## 4. Arkitektur — det, der ikke kan ses af filnavnene

- **Kontrakten er `skema/skema.json`.** DDL for SQLite/PostgreSQL/SQL Server, Rayfin-entiteterne (`app/rayfin/data/*.ts`)
  og den lokale servers rettigheder udledes af eller testes mod den. Et skemaskift kræver migrering af hver database.
- **Den betroede logik findes to gange**: TypeScript i `app/rayfin/functions/src/` (Fabric) og Python i
  `community/fjernvarme_app/logik/` (lokalt), bundet af de fælles vektorer i `skema/vektorer/`. Ret begge.
- **Udgaven vælges ved build** (`VITE_BACKEND=rayfin|rest`), som et alias til `app/src/backend/<udgave>/`. Siderne er de samme.
- **En kørsel fryses ved bestilling**: input, pins og `input_hash` (sha256 af de sorterede `[kilde, sti, vaerdi_json]`).
  Arbejderen afviser en kørsel, hvis hashen eller pinsene ikke passer. Kun den betroede logik og arbejderen skriver
  `Koersel*` og `Motors`.
- **Én solver ad gangen** (SQL-applock i Fabric, OS-fillås lokalt). Annullering er samarbejdende.
- **Pinnen** (`MODEL_COMMIT`, `DF_DATA_SHA` i `fabric/fjv/konstanter.py`) står flere steder; `scripts/tjek.py` fejler,
  hvis de ikke er ens. Modellens kode hentes som zip ved pinnen ved første kørsel.
- **Genererede filer** (ret ikke i hånden): `viden/modelspejl.json`, `app/src/lib/modelspejl.data.ts`,
  `app/src/sider/konfiguration/skalering.vektorer.json` (fra `byg_modelspejl.py`), `viden/felt_katalog.json`,
  `viden/nyt_vaerk_skabelon.json`, `viden/data_krav.json`, `app/src/ibcs/tokens.*.ts` (`npm run tokens`) og
  dokumentationskopierne under `app/src/sider/dokumentation/indhold/` (`kopier-indhold.mjs`).

---

## 5. Målte faldgruber — gentag dem ikke

- **Windows' 260-tegnsgrænse.** Modellens outputnavne er lange. Brug korte data- og uddatamapper (`C:\fjv`).
- **Rayfin-entiteternes dekoratorer må ikke nå browserbundtet** (Vite 8/Oxc kan ikke oversætte dem; build lykkes, siden
  dør). Importér entiteter med `import type`; delte værdier står i `fjv.constants.ts`. `scripts/tjek_bundle.mjs` tjekker.
- **DAB returnerer 100 rækker pr. side.** Læs altid med paginering (`app/src/lib/hent-alle.ts`).
- **Rayfin CLI finder projektet ud fra den aktuelle mappe**: kør den fra `app/`. Den slutter med exitkode 0 ved en
  halv udrulning; `scripts/installation.py rayfin-up` læser outputtet og slutter med 1.
- **Python's `round` er ikke JavaScripts `toFixed`.** Halvtilfælde runder til lige på den binære værdi; brug
  `app/src/lib/pyround.ts`, hvor appen genberegner noget, modellen afrunder.
- **HiGHS stopper ved det første af de to gab.** `--mip-gap 0.0002` alene stopper ved casens absolutte gab.
- **Vitest kan tabe en testfil under hukommelsespres og stadig være grøn.** Gaten sammenligner antallet af tests i
  de to udgaver. Kør ikke to tunge ting ad gangen.
- **Konsollen er cp1252 på Windows.** Scripts kalder `sys.stdout.reconfigure(errors="replace")`.

---

## 6. Arbejdsform

- Én gren pr. opgave; `python scripts/tjek.py --installer-hook` én gang pr. klon. Stage filer ved navn.
- Testen skrives før rettelsen og skal fejle af den rigtige grund. Mål, udled ikke; skriv i koden, hvad der er målt.
- Kommentarerne begrunder valg og navngiver den fejl, de forhindrer. Behold den tæthed.
- `noter/` er udviklingsnoter (historik), ikke vejledning.
- Udrul eller push ikke uden at blive bedt om det.
