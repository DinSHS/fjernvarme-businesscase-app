# fjv_koer_scenarie — regnemotoren

Kører den åbne MILP-driftsmodel (`run_case.py`, Linopy + HiGHS) på et **frosset
input** og publicerer resultaterne. Modellen kører aldrig i browseren; appen
bestiller, denne notebook regner.

**Tre måder at starte den på**

| Parametre | Gør |
|---|---|
| ingen | kø-arbejder: overtager den ældste `koe`-kørsel, kører den, tager den næste, til køen er tom |
| `koersel_id` | kører netop den kørsel (skal stå i `koe`/`startet`) |
| `vaerk_kode` (+ `start`, `slut`, `aendringer_json`, …) | manuel kørsel: opretter selv scenarie og kørsel (kilde = notebook), så resultatet også ses i appen |

Rapport: `Files/_run/fjv_koer_scenarie.json` (seneste) og
`Files/fjv/koersler/<koersel_id>/rapport.json` (pr. kørsel), skrevet uanset udfald.
Rå output: `Files/fjv/koersler/<koersel_id>/`.
