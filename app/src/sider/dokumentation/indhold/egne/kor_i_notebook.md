# Kør i en notebook

Notebooken `fjv_koer_scenarie` i Fabric-workspacet **dit Fabric-workspace** kan startes direkte — uden om appen —
med et værk, ændringer og en periode. Kørslen oprettes da selv i appens database (som kilde *notebook*)
og kan ses og sammenlignes i **Analyser** som alle andre. (Kilde: fabric/README.md)

## Sådan gør du

1. Åbn notebooken `fjv_koer_scenarie` i workspacet.
2. Sæt værdierne i **parametercellen** (den første kodecelle).
3. Kør alle celler. Notebooken lægger en kørsel i køen og regner den — og derefter den næste i køen, til køen er tom.

Starter du den uden parametre, er den en ren **kø-arbejder**: den tager de bestillinger, der allerede
står i køen, og intet andet. (Kilde: fabric/README.md)

## Parametre

| Parameter | Betydning |
|---|---|
| *(ingen)* | Kø-arbejder: tager den ældste kørsel i kø, til køen er tom. |
| `koersel_id` | Kør netop den kørsel (skal stå som *i kø*). |
| `vaerk_kode` | Manuel kørsel af et værk, fx `andeby` eller `billund_spora`. Koden er værkets navn med små bogstaver. |
| `scenarie_navn` | Navnet, kørslens scenarie får i appen. |
| `start`, `slut` | `ÅÅÅÅ-MM-DD`. Tom = værkets egen tidsblok. Højst 366 døgn. |
| `med_balancering` | `True` = med balancemarkedet (kræver data efter ca. marts 2025). |
| `balancing_method` | `legacy` eller `activation_value`; tom = værkets egen. |
| `aendringer_json` | Liste af ændringer, se nedenfor. |
| `mip_rel_gap`, `mip_abs_gap`, `tidsgraense_s` | Solverens gab og tidsgrænse, som tal skrevet som tekst. Sæt **begge** gab, når resultatet skal læses som en differens, fx `"0.0002"` og `"100"`. |
| `heat_csv` | Målt varmelast: et filnavn i modelrepoets `data/`, fx `billund_abvaerk_hourly_splejset_jun2026.csv`. Tom = værkets syntetiske varmelast. |
| `ekstra_flag` | Kun `--legacy-nettab` er tilladt. |
| `tidsserie_varmelast` | Hvilken varmelast der regnes på: tom = værkets **aktive** tidsserie (hvis værket har en, ellers den syntetiske), et tidsserie-id, eller `syntetisk`. |
| `tidsserie_solprofil` | Solprofilen: tom = værkets aktive solprofil, ellers et tidsserie-id. |
| `data_commit` | Fuld SHA af df-data; tom = den version, notebooken er pinnet til. |
| `batch_json` | Flere kørsler i ét job: en liste, som alle lægges i køen først og derefter køres én ad gangen. |

(Kilde: fabric/celler/fjv_koer_scenarie/params.py; KONTRAKT §6d)

## Varmelast og referencetallene

Billund Spor B og Billund rullende år er regnet med **målt varmelast** og kan kun genskabes, hvis `heat_csv` er sat til
`billund_abvaerk_hourly_splejset_jun2026.csv`. Andeby og Billund Spor A bruger syntetisk varmelast: lad `heat_csv` stå tom.
Sæt du den forkerte (eller glemmer den), regner modellen fint — men på en anden varmelast, så tallet er ikke README-tallet.
(Kilde: README.md:138-140)

## Værkets egne tidsserier og værksark

Målt varmelast og målt solvarme **uploades til værket** i appen (Konfiguration → værket → *Tidsserier*) som CSV; de
hører til værket, ikke til en enkelt kørsel. En gyldig tidsserie ligger uforanderlig i lakehouset under
`Files/fjv/tidsserier/<værkskode>/<sha256>.csv` (UTC, timens start, MW, én værdikolonne). Markeds- og vejrdata
(spot, aFRR, mFRR, ubalance, DMI) uploades aldrig — de kommer fra datarepoet. (Kilde: KONTRAKT §6d)

- **Frysning.** Når en kørsel bestilles, fryses den tidsserie, den bruger, med kontrolsum. Notebooken henter filen,
  **verificerer kontrolsummen** og bruger den som varmelastfil (`--heat-csv`) eller som solvarmeenhedens profil. Er
  kontrolsummen forkert, fejler kørslen — den regner aldrig på en anden fil end den, der blev bestilt.
- **Valg.** Varmelasten er den syntetiske, værkets aktive tidsserie eller en anden af værkets gyldige tidsserier — i
  appen vælger scenariet, i notebooken sætter du `tidsserie_varmelast`. `heat_csv` (ovenfor) gælder kun modelrepoets
  egne filer og er et selvstændigt valg af varmelast; sæt ikke begge.
- **Værksark.** Uploades `vaerksdata_skabelon.xlsx` under *Nyt værk*, kører notebooken `fjv_importer_vaerksark`
  modelrepoets `scripts/vaerksark_til_yaml.py` uændret og opretter værk og tidsserie. Importen bruger ikke
  solver-låsen, så den kan køre, mens en kørsel regner. Hvad arket skal indeholde, står i *Information → Hvilke data
  skal med?*.

## Ændringer

`aendringer_json` er en liste. Hver ændring har en type og en sti i værket:

```json
[
  {"type": "set", "sti": "prices.straw.value", "vaerdi_json": "300.0"},
  {"type": "disable", "sti": "gasmotor"}
]
```

- `set` retter en værdi, der **allerede findes** i værket. En liste erstattes som helt blad.
- `enable` og `disable` slår en enhed eller et lager til eller fra.
- To ændringer på samme sti afvises.

Skal der en ny enhed eller blok til, er det en ændring af værket, ikke af et scenarie. (Kilde: KONTRAKT §3.5; KONTRAKT §6b)

## Det skal du vide

- **Én solver ad gangen.** Kører en anden arbejder allerede, lægges din kørsel i køen, og den aktive arbejder tager den bagefter. Andeby helår med balancering tager ca. 1 time. (Kilde: fabric/README.md)
- **Kun timeopløsning.** Kvartersopløsning afvises endnu, fordi modellens kroneled ved 15 minutter ikke er afklaret. (Kilde: KONTRAKT §6c)
- **Differenser kræver samme miljø.** Kør reference og scenarie i samme notebook, med samme gab og samme periode. Spor A blev målt 28 kr. forskellig mellem to og otte kerner; det er solverstøj, ikke en forskel i værket. (Kilde: KONTRAKT §6b)
- **Resultaterne** ligger i appens database (tabellerne for kørsler) og som rå uddata i lakehouset under `Files/fjv/koersler/<kørsels-id>/`. Notebookens egen rapport står i `Files/_run/`. (Kilde: fabric/README.md)
- **Værksdata er ikke offentlige.** Læg aldrig et værks tal i det åbne modelrepo. (Kilde: KONTRAKT §2)
