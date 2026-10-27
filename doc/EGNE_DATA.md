# Dit eget værk — tre veje ind

Appen regner på **værker**: et sæt parametre (enheder, lagre, priser, tariffer, balancemarked, varmelast …) i præcis
modelrepoets YAML-form, gemt som blade i databasen. Repoets egne cases (Andeby, Billund) kommer med `--demo`. Dit eget
værk kan komme ind på tre måder. Vælg den første, du kan.

**Værkets data er dine.** Den lokale udgave gemmer dem i din datamappe og din database; intet sendes nogen steder hen.
Læg dem aldrig i et offentligt repo (`.gitignore` dækker `fjernvarme_data/` og `_lokal/`).

| Vej | Når | Du skal have |
|---|---|---|
| **1. Værksarket** | du starter fra bunden | modellens regneark udfyldt med anlæg, priser og (gerne) et års timedata |
| **2. I appen** | du vil starte fra Andeby eller et andet værk | ingenting — kopiér et værk, eller brug guiden *Nyt værk* |
| **3. SQL** | værkets data findes allerede i en database | en database, appen kan forbinde til (SQLite, PostgreSQL, SQL Server) |

Uanset vej kan du bagefter lægge **målte tidsserier** (varmelast, solprofil) på værket som CSV.

---

## 1. Værksarket (`vaerksdata_skabelon.xlsx`)

Skabelonen er modellens egen (`vaerksdata_skabelon.xlsx` i modelrepoets rod). Hent den i appen under
**Dokumentation › Skabelon til værksdata**, og udfyld den efter modelrepoets
[`doc/EGET_VAERK.md`](https://github.com/skj-1964/fjernvarme-businesscase/blob/eef950a2ac7b3808a9456dcf48742ce08e52366a/doc/EGET_VAERK.md).

Upload den under **Konfiguration › Upload værksark**. Appen konverterer arket med modelrepoets **eget**
`scripts/vaerksark_til_yaml.py` ved den pinnede commit — samme case, som hvis du kørte scriptet selv — og opretter værket
og (med timedata) en tidsserie for varmelasten. Importen viser sin status og modellens log.

Tre ting, der ofte giver en afvisning:

* **Perioden er fast:** 1. juli 2025 00:00 – 30. juni 2026 23:00 i arkets tidszone. Mindst 672 timer.
  Skabelonen kan ikke importeres uændret (de otte eksempelrækker er for få).
* **Timens start eller slut:** starter dine timedata 1. juli kl. 01:00, er stemplerne timens slut.
* Uden timedata (kun årsbehovet i B3) syntetiserer modellen varmelasten ud fra Andebys profil skaleret med
  `f = round(G/100, 4)`.

Hele kontrakten (felter, fejl og advarsler, målt på udfyldte ark) står i [`viden/data_krav.md`](../viden/data_krav.md) §4.

## 2. I appen

* **Kopiér et værk:** Konfiguration › kortet *Kopiér værk*. Ret derefter felterne; hver ændring logges med revision.
* **Nyt værk-guiden:** Konfiguration › *Nyt værk fra bunden*. Syv trin: navn og kode, klima og priszone, varmebehov,
  enheder, lager, priser og tarif, gennemse og opret. Varmelasten
  skaleres med modelrepoets regel; hvert felt viser sin kilde (Andeby i modelrepoet, brugerens eget valg eller *egen
  antagelse*).
* **Værkspakke:** et helt værk som zip (parametre, gyldige tidsserier, scenarier — uden e-mails og id'er), så det kan
  deles: `python -m fjernvarme_app eksport <kode> <fil.zip>` og `… import <fil.zip>`.

## 3. SQL — bring your own database

```
python -m fjernvarme_app ddl postgresql > fjv.sql      # eller sqlite / mssql; samme som skema/ddl/*.sql
psql -d fjv -f fjv.sql
python -m fjernvarme_app --db postgresql+psycopg://bruger:kode@vaert/fjv     # pip install "fjernvarme_app[postgresql]"
python -m fjernvarme_app valider-db                    # tjek det, du har skrevet udefra
```

Et værk er rækker i `Vaerks` og `VaerkParameters`: ét blad pr. YAML-sti (`units.gaskedel.p_max_heat` → `5.0`). Hvad du
må skrive, og hvordan, står i [`skema/SKEMA.md`](../skema/SKEMA.md#bring-your-own-sql); kontrakten er
[`skema/skema.json`](../skema/skema.json). Kørsler, resultater og motorens pins skriver kun arbejderen.

## Målte tidsserier (CSV)

Under **Konfiguration › værk › Tidsserier › Upload CSV**: vælg rolle (**varmelast** ab værk i MW, eller **solprofil**), og upload.

* Kolonner: tid + værdi. Komma, semikolon eller tab; decimalkomma ved semikolon.
* Tid: ISO 8601 eller `dd-mm-åååå tt:mm`; UTC eller dansk lokaltid; timens start eller slut; 1 time eller 15 min.
* Enhed: MW, kW, MWh eller kWh pr. interval.
* Varmelasten må mangle højst 5 % af en kørsels timer (modellen interpolerer); solprofilen ingen (huller op til 5 %
  udfyldes ved upload).

Filen tjekkes straks og får status *gyldig* eller *afvist* med en forklaring. Højst én tidsserie er **aktiv** pr. rolle;
den bruger scenarier som standard. Alle regler: [`viden/data_krav.md`](../viden/data_krav.md) §2.

## Kør på dit værk

Under **Scenarier** laver du et scenarie (værk + ændringer + periode) og bestiller en kørsel. Brug differensmetoden:
reference og scenarie med samme periode og samme data, og læs forskellen — ikke de absolutte tal. Appen foreslår par
og viser resultaterne under **Analyser**. Metoden står i [`viden/METODE.md`](../viden/METODE.md).
