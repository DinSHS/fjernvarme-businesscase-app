# Repoet er kilden — sådan holdes det rent

**Dette repo er kilden.** Det er ikke en genereret kopi af noget andet, og det må redigeres direkte. Arbejdsrepoet `fjernvarme_fabric`,
det blev oprettet ud fra (én gang, fra commit `83028160f63e76d216847de82728b8ace1e56daa`), er **historik** og følger ikke længere med. Der er ingen
synkronisering tilbage dertil.

En **installation** er `repoet + en lokal konfiguration`. Alt, der er specifikt for en organisation eller en installation, ligger i lokale,
git-ignorerede filer. Det er dét, der gør, at samme repo kan deles med modellens forfatter og andre — og at to installationer kan bruge den samme kode.

## 1. Hvad er lokalt, og hvad er i repoet

| Lokalt (git-ignoreret — committes aldrig) | I repoet |
|---|---|
| `config/installation.json` — workspace-, lakehouse-, database-, notebook-id'er, servernavn, app-adresse | `config/installation.eksempel.json` — skabelonen |
| `config/forbud.lokal.json` — navne og id'er, gaten skal stoppe | `offentlig/forbud.generisk.json` — mønstre, der er forkerte i *enhver* installation |
| `app/src/styles/temaer/privat/` — en organisations eget tema | de fire neutrale temaer; formatet i `app/TEMAER.md` |
| `app/rayfin/.deployments.json`, `app/rayfin/.env`, `app/.env.local` — Rayfins udrulningstilstand | `app/rayfin/rayfin.yml` og `…/functions/src/konfig.ts` **med tomme værdier** |
| `fjernvarme_data/`, `_lokal/`, `node_modules/`, `dist*/` — kørselsdata og build | koden, skemaet, vektorerne, dokumentationen |

`python scripts/installation.py paafoer` skriver installationens værdier ind i `konfig.ts` og `rayfin.yml` **lokalt** og sætter `skip-worktree`, så de to
filer aldrig står som ændrede. `fjern` ruller tilbage. Se [`FABRIC.md`](FABRIC.md).

## 2. Gaten — intet organisationsspecifikt kan committes ved en fejl

`scripts/tjek.py` er repoets gate (`tjek_offentlig.py --repo`). Den scanner det, git kender (sporet og usporet, ikke ignoreret) — og i `--staged`-tilstand *indholdet af
indekset* — mod **tre** lister:

1. den generiske liste i repoet (`offentlig/forbud.generisk.json`: rigtige servernavne og app-adresser, tenant-konti, absolutte brugerstier, lokale filer, private temaer),
2. din lokale liste (`config/forbud.lokal.json`: organisationsnavne m.m.),
3. **værdierne i din lokale installation** (`config/installation.json`): hver tekstværdi, der ikke er en pladsholder og ikke er ens med skabelonens standard, må ikke stå i noget
   sporet. Et nyt id eller servernavn kan derfor aldrig glippe, fordi nogen glemte at skrive det på en liste.

Den kører også **kreditkravene** (`CREDITS.md`, `NOTICE`, licenstekster med SHA-256, kreditlinjen monteret i appens skal, pinnede commits ens overalt, ingen antydning af, at
Dansk Fjernvarme, Billund Varme eller modellens forfatter står bag appen). UTF-16, arkiver (zip/xlsx/wheel) og ikke-scannelige filer er fejl, ikke tavse spring.

```
python scripts/tjek.py                     # hele repoet (CI, før en release)
python scripts/tjek.py --staged            # kun det staged — pre-commit
python scripts/tjek.py --installer-hook    # sæt git config core.hooksPath scripts/hooks (en gang pr. kopi)
python tjek_offentlig.py --wheel <fil.whl> # forbudslisterne på HVERT medlem af et bygget wheel + licenstekster + CREDITS
```

**Installér hooken i din kopi** (`--installer-hook`). `--no-verify` omgår den — gør det ikke: gaten er det eneste, der forhindrer, at en installations værdier havner i det delte repo.
Kør desuden den fulde `python scripts/tjek.py` før hver release og i CI.

Undtagelser (`offentlig/regler.json` → `undtagelser`) er en **gennemgået liste** (fil + regel + grund), ikke et mærke i indholdet: det er i dag rettighedshaverens navn i `LICENSE`
og de tests/scripts, der skal nævne det forbudte for at bevise dets fravær. En ny undtagelse kræver en post og en begrundelse i en pull request.

## 3. Arbejdsgang

```
git switch -c <emne>                 # en gren pr. arbejdsopgave
… ret, test …
python scripts/tjek.py               # grøn
git add <filer> && git commit        # pre-commit-hooken kører --staged
git push -u origin <emne>            # pull request mod main
```

Før en release (og efter en ændring af pins): kør testsuiterne og byg wheel'en fra en ren kopi:

```
python -m unittest discover -s offentlig/tests -t .                 # gaten, installationen, kreditkravene
cd fabric && python -m unittest discover -s tests -t .             # regnemotoren (stdlib)
cd app && npm ci && npm test && npm run build && npm run build:community
python community/pakke.py --ud <mappe> && python tjek_offentlig.py --wheel <wheel>
```

## 4. Hvad må aldrig blive uenigt

* Den betroede logik findes ét sted pr. sprog (TypeScript i Rayfin Functions, Python i `community/`), bundet af **fælles testvektorer** i `skema/vektorer/`. En ændring i vektorerne er en
  ændring af begge. Skemaet (`skema/skema.json`) er kontrakten; en test fejler, hvis Rayfin-entiteterne (`app/rayfin/data/*.ts`) og skemaet ikke er enige. Et skemaskift kræver migrering af hver
  installations database.
* **Pinnede commits** (`MODEL_COMMIT`, `DF_DATA_SHA` i `fabric/fjv/konstanter.py`) står også i `CREDITS.md`, `app/src/sider/dokumentation/kilde.ts` og `viden/dokumentation_indeks.json`.
  Gaten fejler, hvis de ikke er ens. Modellens kode distribueres ikke: appen afhænger af den på den pinnede commit.

## 5. Kredit — kan ikke fjernes i nogen installation

Kreditten til den oprindelige case ([skj-1964/fjernvarme-businesscase](https://github.com/skj-1964/fjernvarme-businesscase) og
[skj-1964/df-data](https://github.com/skj-1964/df-data)) er en del af repoet: `CREDITS.md`, `NOTICE`, `LICENSES/`, kreditlinjen i sidefoden og siden *Om og kredit*. En installation
må ikke slette eller omskrive den; gaten fejler, hvis den mangler.

## 6. Historik

Repoet blev oprettet 2026-10-19 ud fra arbejdsrepoets commit `83028160f63e` med et engangsværktøj (eksport fra committet kode, ikke arbejdsmappen), som derefter er fjernet fra repoet. Det
oprindelige arbejdsrepo indeholdt en organisations egen installation (workspace, database, tema); den er ikke med her og kan ikke genskabes herfra.

## 7. Det, der ikke er afgjort

* Repoets endelige navn og hjemsted (privat GitHub-repo delt med modellens forfatter; intet er offentliggjort).
* Om Dansk Fjernvarme, Billund Varme og modellens forfatter ønsker at blive nævnt som her — kreditten er en anerkendelse, ikke en godkendelse.
* En CI-pipeline, der kører `python scripts/tjek.py` og testsuiterne ved hver pull request (kommandoerne findes; pipelinen er ikke sat op).
