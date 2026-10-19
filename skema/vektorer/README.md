# Fælles testvektorer — TS-Functions og Python-porten må ikke kunne blive uenige

Den betroede logik findes to gange: i TypeScript (`app/rayfin/functions/src/`, Fabric-udgaven) og i Python
(`community/fjernvarme_app/logik/`, community-udgaven). Vektorerne her binder dem: samme input → samme hash,
samme grænse, samme resultat, og ved en afvisning **samme danske tekst**.

| Hvor | Hvad | Laves af |
|---|---|---|
| `*.json` (22 grupper, ~2.900 tilfælde) | Bred dækning af de rene funktioner: genererede input inkl. grænsetilfælde (tal, datoer, hash, frysning, anmodninger, modelkrav, tidsserier, zip, værksark-forløbet) | `generer.mts` (skrevet af fv-port) — kører TS-koden |
| `fra_ts_testene/*.json` (15 grupper, ~200 tilfælde) | Præcis de kald, de håndskrevne TS-tests laver: Codex' modprøver, målte hashes, K4/K5-tilfældene | `udtraek.mjs` + `optag.setup.mts` — kører TS-testene og optager hvert kald |

## Format

```json
{ "_om": "…", "kilder": { "app/rayfin/functions/src/logik.ts": "<sha256>", … },
  "tilfaelde": [ { "navn": "…", "input": { … }, "ud": … } ] }
```

Udfaldet er ét af `{"ud": …}`, `{"afvisning": "<præcis tekst>"}` eller `{"fejl": "…", "fejltype": "…"}` (en
programfejl, ikke en afvisning). Særlige værdier: `{"$tal": "Infinity"|"-Infinity"|"NaN"|"-0"}`,
`{"$bits": "<16 hex>"}` (en double præcist), `{"$b64": …}`, `{"$fil": "<sti fra produktroden>"}`, `{"$fyld": n}`
(n bytes `a`), `{"$nul": n}`, `{"$map": [[k, v], …]}`. Gruppens navn bestemmer kaldet — kaldsformen pr. gruppe står
i `community/fjernvarme_app/logik/tests/test_vektorer.py` (`KALD`).

## Hvem kører dem

| Side | Test | Fejler, når |
|---|---|---|
| TypeScript | `cd app && node --test "../skema/test/*.test.mjs"` (`vektorer.test.mjs`) | TS-koden giver et andet udfald end vektoren, eller TS-testene har fået tilfælde, der ikke er udtrukket |
| Python | `cd community && python -m unittest discover -s fjernvarme_app/logik/tests -t .` (de 22 grupper) og `python -m unittest discover -s skema/test` (`test_vektorer_ts_testene.py`) | porten giver et andet udfald end TS |

Ændrer du en regel i TS: kør begge generatorer, så Python-testene viser, hvad porten skal rettes til.

```
cd app && npx tsx ../skema/vektorer/generer.mts
cd app && node ../skema/vektorer/udtraek.mjs
```

## Bevidste afvigelser

En afvigelse er kun tilladt, hvis den står i `KENDTE_AFVIGELSER` (test_vektorer.py) med begrundelse og har sin egen
test, der måler den. I dag én: V8's ældre `Date.parse` læser `"January 5, 2026"`; porten afviser.

## Hvad der IKKE er vektorer

Forløb med SQL (transaktioner, låse, betingede UPDATEs — `function_app.ts`, `motor.ts`) og tekst-tjek af kilden
(`registrering.spec.ts`, dele af `motor.spec.ts`/`opret_vaerk.spec.ts`) er ikke rene funktioner. De er porteret som
forløb mod en lager-grænseflade og testes dér (fv-port: `logik.lager_minne`); værksark-forløbet er den ene
undtagelse, der ligger her, fordi dets kaldsspor kan optages (`behandl_vaerksark.json`).
