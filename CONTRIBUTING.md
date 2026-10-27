# Sådan bidrager I

Tak, fordi I vil gøre appen bedre. Den er en brugerflade til
[`skj-1964/fjernvarme-businesscase`](https://github.com/skj-1964/fjernvarme-businesscase), og den er kun nyttig, så
længe den regner præcis som modellen. Det er den ene regel, der går forud for alle andre.

## Trofasthedsreglen

**Modelrepoet er sandheden.** Appen må ikke opfinde, afrunde, forenkle eller "forbedre" en antagelse uden at sige det.

- Værdier, appen viser eller bruger som standard, **læses** fra modelrepoet ved den pinnede commit (modelspejlet,
  `viden/vaerktoej/byg_modelspejl.py`). Skriv dem ikke af.
- Hvor appen bevidst vælger noget selv, står der **egen antagelse** med en begrundelse — i appen og i
  [`doc/TROFASTHED.md`](doc/TROFASTHED.md#5-egen-antagelse--hvor-appen-bevidst-afviger-eller-tilføjer).
- Regnevejen er `run_case.py` uændret. Vil I ændre metoden, hører ændringen hjemme i modelrepoet, ikke her.
- Er I i tvivl om, hvad modellen gør, så kør den, og mål. Skriv i koden, hvad der er *målt*, og hvad der er *læst*.

`npm run gate` kører trofasthedstesten og dens modprøver. Fejler den efter jeres ændring, er det ikke testen, der skal rettes.

## Hvad bidrager I med?

- **Fejlrettelser og tydeligere tekster** — alt fra tastefejl til bedre forklaringer.
- **Nye analyser eller visninger** af det, modellen allerede regner (IBCS-notationen i [`app/IBCS.md`](app/IBCS.md)).
- **Databaser og drift** for den lokale udgave: PostgreSQL, SQL Server, Docker, Linux og macOS er bygget, men lidt afprøvet.
- **En ny modelversion** (se nedenfor).

Åbn gerne et *Issue* først, før I bygger noget stort.

## Sådan gør I det

1. **Fork og gren:**
   ```bash
   git clone https://github.com/<jeres-konto>/fjernvarme-businesscase-app.git
   cd fjernvarme-businesscase-app
   git switch -c min-aendring
   python scripts/tjek.py --installer-hook      # pre-commit: stopper organisationsspecifikke værdier
   ```
2. **Modelrepoet ved siden af** (trofasthedstesten læser det):
   ```bash
   git clone https://github.com/skj-1964/fjernvarme-businesscase.git ../fjernvarme-businesscase
   ```
   Pinnen læses med `git show <pin>:<fil>`, så klonen kan stå på `main`. En anden placering: `FJV_MODELREPO=<sti>`.
3. **Test før I sender.** Kræver Node.js ≥ 20, Python 3.11–3.13 med PyYAML (`FJV_PYTHON` vælger fortolkeren).
   ```bash
   cd app && npm ci && npm run gate && cd ..     # tsc, eslint, vitest og build for begge udgaver, trofasthed + modprøver
   python scripts/tjek.py                        # intet organisationsspecifikt, kreditten er intakt
   python -m unittest discover -s offentlig/tests -t .                 # gaten og installationen (stdlib)
   cd fabric && python -m unittest discover -s tests -t . && cd ..    # regnemotoren (stdlib, intet netværk)
   python -m unittest discover -s skema/test                           # skemaet og vektorerne
   ```
   Den lokale udgave (kræver `pip install sqlalchemy pyyaml openpyxl`):
   ```bash
   cd community && python -m unittest discover -s tests -t tests && cd ..
   ```
   Gaten kører hvert testsæt for begge udgaver og fejler, hvis antallet af tests ikke er ens. Den tager 10–15 minutter.
   Seks frontend-specs læser et udtræk af en installations egen database (`app/skaermbilleder/harness/fixtures.json`,
   hentes med `node app/skaermbilleder/hent_fixtures.mjs <tokenfil>`). Udtrækket er installationens data og ligger ikke i
   repoet; uden det springes de seks over, og `vitest.config.ts` skriver hvilke.
   Hukommelsen er den knappe ressource; kør ikke to tunge ting samtidig.
4. **Ændrer I noget, der flytter et tal med vilje**, så skriv det gamle og det nye i pull requesten og i
   [`CHANGELOG.md`](CHANGELOG.md). Referencetallet for hele kæden er Andeby 5.–6. januar 2026 uden balancemarked:
   **867.031,23 kr.** (`python fabric/koer_minne.py andeby 2026-01-05 2026-01-06`, kræver modellens pakker).
5. **Pull request** mod `main`: hvad, hvorfor, og hvordan I har testet.

## Sprog og stil

- **Dansk** i dokumentation, brugerflade, kommentarer og identifiers (`vaerk`, `koersel`, `noegletal`); æøå skrives
  `ae`/`oe`/`aa` i filnavne og identifiers. Modellens egne navne (`run_case.py`, `heat_load_params`) bevares.
- Kommentarer begrunder et valg og navngiver den fejl, de forhindrer. Behold den tæthed.
- **Testen skrives før rettelsen** og skal fejle af den rigtige grund.
  Testfiler og specs med et K-nummer (`test_k5.py`, `k8.spec.ts`) er regressionstests for fund fra uafhængige
  gennemgange; nummeret peger på gennemgangen, og hver test siger i sin docstring, hvilken fejl den forhindrer.
- Organisationsspecifikke værdier (id'er, servernavne, temaer, navne) hører i `config/installation.json` og
  `app/src/styles/temaer/privat/` — aldrig i repoet. Gaten stopper dem; omgå den ikke med `--no-verify`.
- Den betroede logik findes i to sprog (TypeScript i Rayfin Functions, Python i `community/`), bundet af fælles
  vektorer i `skema/vektorer/`. En ændring i den ene er en ændring i begge.
- Filnavne: små bogstaver med understreger.

## Ny modelversion

Pinnen skiftes bevidst, aldrig automatisk.

1. Ret `MODEL_COMMIT` (og evt. `DF_DATA_SHA`) i `fabric/fjv/konstanter.py`, og samme SHA'er i `CREDITS.md`,
   `app/src/sider/dokumentation/kilde.ts`, `viden/dokumentation_indeks.json` og `model_commit` i `viden/*.json`.
   `python scripts/tjek.py` siger, hvor de ikke er ens. Er en licenstekst ændret, så hent den byte for byte til
   `LICENSES/` og ret dens SHA-256 i `offentlig/kredit.json`.
2. Byg det genererede igen fra modelrepoet ved den nye pin:
   ```bash
   python viden/vaerktoej/byg_modelspejl.py
   python viden/vaerktoej/byg_felt_katalog.py
   python viden/vaerktoej/byg_nyt_vaerk.py
   python viden/vaerktoej/byg_data_krav.py
   node app/src/sider/dokumentation/_byg/kopier-indhold.mjs --modelrepo ../fjernvarme-businesscase
   ```
3. `python viden/vaerktoej/tjek_trofasthed.py` melder hvert sted, hvor appen bruger noget, der er ændret. Ret det, eller
   skriv det som *egen antagelse*.
4. Regn referencetallene igen (`fabric/koer_minne.py`, `viden/vaerktoej/bevis_app_vej.py`), ret dem i dokumentationen,
   og skriv en ny version i `CHANGELOG.md` med "tallene kan ikke sammenlignes med før".
5. Fabric-installationer: `deploy.py kode` og `deploy.py koer fjv_importer_vaerker` ([`doc/FABRIC.md`](doc/FABRIC.md)).

## Bidrag skrevet med Claude eller en anden AI

Helt fint. Repoet har en [`CLAUDE.md`](CLAUDE.md). Vi forventer, at I selv har læst ændringen, kørt gaten, og skriver i
pull requesten, hvis hovedparten er AI-genereret.

## Licens

Bidrag udgives under appens licens ([`LICENSE`](LICENSE), MIT). Kreditten til modellen og datarepoet
([`CREDITS.md`](CREDITS.md)) må ikke fjernes; gaten fejler, hvis den mangler.
