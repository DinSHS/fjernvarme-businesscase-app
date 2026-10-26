# Datakrav — hvilke data, hvilket format, hvilke regler (fv-data)

Kilde for maskinerne: `data_krav.json` (genereret af `vaerktoej/byg_data_krav.py`). Orakel:
`vaerktoej/valider_tidsserie.py` (kun standardbibliotek). Port: `vaerktoej/tjek_data_krav.py`. Modelrepoet er
pinnet på `eef950a`; df-data er målt ved `392992c` (2026-10-12; januar–juni 2026 og 2025 har samme værdier ved den pinnede `106b9fc`). Denne fil er *hvorfor*; JSON'en er *hvad*.

## 1. Hvilke data modellen bruger — og hvornår

| Data | Bruges | df-data / kilde | Styres af |
|---|---|---|---|
| Spot | altid | `spot/{price_zone}`, `spot_price_dkk` | `data.price_zone` |
| DMI-temperatur | altid, også med målt varmelast | `dmi/{dmi_area}`, `temp_mean_past1h` | `data.dmi_area`, `data.dmi_temp_shortname` |
| aFRR · ubalance · mFRR-kap. · mFRR-akt. | kun `--with-balancing` | `afrr` · `imbalance` · `mfrr_cap` · `mfrr_act` /`{spot_area}` | `electricity.spot_area` |
| Varmelast | altid | syntese (`heat_load_params` + DMI) eller målt (`--heat-csv`) | `_koersel.tidsserie.varmelast` / `_koersel.heat_csv` |
| Solprofil | aktive enheder med `production_profile_path` | tidsserie eller repoets `data/` | `units.*.production_profile_path` / `_koersel.tidsserie.solprofil` |
| Værksparametre | altid | VaerkParameter ved den frosne revision | — |

Kilder: src/data_loader_github.py:599-717 (hele vejen), src/data_loader_github.py:62-83 (krav pr. datasæt),
run_case.py:374-458 (valget af kilde).

Fire ting, man ikke ser uden at læse koden:

1. **DMI hentes altid.** Også med målt varmelast — temperaturen indgår i varmepumpens COP-tabel
   (src/model.py:177-193) og i resultatet. En periode uden DMI-dækning stopper derfor også en kørsel med målt last.
2. **`heat_load_params` kræves altid** (run_case.py:377), selv om den ignoreres ved målt last.
3. **`price_zone` ≠ `spot_area` er tilladt.** Spot læses fra `data.price_zone`, balancepriser fra
   `electricity.spot_area` (src/data_loader_github.py:699-705). Ingen kontrol af, at de er ens → vis begge.
   DK2 har intet aFRR-marked: balance med `spot_area: DK2` stopper med `FileNotFoundError`.
4. **Spot efter 1. oktober 2025 er timens første kvarter.** `spot_raw.reindex(idx)` (src/data_loader_github.py:659)
   på en timeakse vælger stemplet hh:00 blandt fire kvarterpriser. Målt på DK1, 1. okt. 2025 – 11. okt. 2026:
   gennemsnitlig numerisk forskel mod timegennemsnittet 79 kr./MWh, skævhed +6,8 kr./MWh. Ubalance- og
   mFRR-datasættene midles derimod (src/data_loader_github.py:467). Ikke vores at rette (modelrepoet er
   read-only) — men en kørsel skal vise det, og det er sendt som spørgsmål til forfatteren.

### Målt dækning ved df-data `392992c`

Alle seks datasæt slutter 2026-10-11 23:00 UTC. Ingen huller med modellens egen regel — undtagen mFRR-kapacitet
22.–23. juni 2023 (24 timer). Balancekørsler kan tidligst starte **2025-03-04 12:00 UTC** (ubalance), dvs. første
hele danske døgn er 5. marts 2025. **De huller, casens kommentarer nævner** (fyn/vestkyst 28. februar 2026,
aFRR fra 4. september 2026, cases/andeby.yaml:89), **findes ikke længere** ved `392992c`; information-siden
`09_datadaekning.md` beskriver derfor et ældre datasæt. Dækningsvagten tæller rækker, ikke værdier: DMI har få tomme
temperaturer (karup 14 timer 2023–26), som udfyldes ved interpolation (src/data_loader_github.py:655-658).

Dækningen flytter sig hver mandag. Tallene i `data_krav.json → maalt_daekning` er en måling ved én version; den
frosne `data_commit` og arbejderens dækningsvagt (src/data_loader.py:83-197) har det sidste ord.

## 2. Værkets tidsserier

### Roller

- **varmelast** — samlet varmeproduktion **ab værk** i MW (middel over timen), inkl. nettab. Erstatter syntesen.
  Modellen tåler huller på ≤ 5 % af *kørslens* timer (lineær interpolation) og stopper over (src/data_loader.py:926-939).
- **solprofil** — mulig solvarme i MW pr. time; et loft `min(profil, p_max_heat)` (src/model.py:155-172). Ingen huller
  tilladt: profil-læseren stopper på én manglende time (src/data_loader.py:997-1010).

### Den normaliserede fil

Formen er motorens (fv-fabric2, `fabric/fjv/tidsserie.py`) og verificeret byte-identisk med oraklet for alle fire
repofiler (port [4]): `time,mw`, intervallets **start** i UTC som `YYYY-MM-DDTHH:MM:SSZ`, 1h, **huller udeladt**,
ren decimaltekst bevaret tegn for tegn. Én tilføjelse fra data-siden: en **solprofil gemmes uden huller** — huller op
til 5 % udfyldes ved upload (0, når solen er nede; ellers en ret linje), som værksarket gør
(scripts/vaerksark_til_yaml.py:1043-1049). Ellers ville en kørsel stoppe på den første manglende time.

**Bevist i port [7]:** modellens egen `apply_heat_csv_override` læser den normaliserede Billund-fil med `--heat-csv-column mw`
**bit-identisk** med originalfilen (`timestamp,heat_mw_abvaerk`, naive stempler), og profil-læserens linjer
(src/data_loader.py:988-990) læser den normaliserede solprofil bit-identisk med `solar_andeby_dmi_karup.csv`. Samme
`heat_demand` ⇒ samme MILP ⇒ fv-fabric2's live-bevis (Spor B via upload = 3.964.585,72) har intet andet at være
forskelligt på end miljøet.

### Input, vi tager imod

Komma/semikolon/tab; decimalkomma ved semikolon; ISO 8601 eller dansk `dd-mm-åååå tt:mm` (med `-` `.` `/`, dagen
først); UTC eller dansk lokaltid (EU-reglen regnet, ikke slået op — Windows har ingen tz-database); timens start eller
slut; 1h eller 15 min (15 min midles, kræver alle fire kvarterer); MW, kW, MWh/kWh pr. interval. Grænse 8 MB og
120.000 rækker; et helt år i 15 min (35.040 rækker ≈ 1,2 MB) skal kunne (KONTRAKT §6d). fv-app må sænke grænsen
til det, Functions faktisk tager imod — og skal skrive tallet.

### Fejl eller advarsel?

**Fejl**, når modellen ville stoppe, regne noget sikkert forkert, eller vi skulle gætte. **Advarsel**, når data kan
være rigtige, men er usædvanlige. Tre valg, der kan diskuteres, er truffet bevidst:

- **Dubletter er en fejl** (fv-tidsserie's forhåndstjek har dem som advarsel). Modellen beholder tavst den første
  (src/data_loader.py:911-913); to værdier for samme time er en fejl i udtrækket, og "første vinder" er et gæt.
  Efterårets dobbelttime i dansk tid er *ikke* en dublet, når tidszonen er valgt rigtigt.
- **Huller i varmelasten er en advarsel ved upload, en fejl ved bestilling** — kun hvis > 5 % af *den kørsels* timer
  mangler. En serie med et hul i januar er fin til en kørsel i marts.
- **Over værkets kapacitet** (aktive enheders `p_max_heat` + lagres afladeeffekt) er en advarsel ved upload og en
  fejl ved bestilling for timer i perioden. Det er en *nødvendig* betingelse: modellen har intet slæk, så sådan en
  time er uløselig uanset alt andet. Kapaciteten regnes på den **effektive** konfiguration (scenariet kan slukke en enhed).

### Plausibilitet — kalibreret, ikke gættet

| Tjek | Tærskel | Målt på repoets data |
|---|---|---|
| Enkeltspids: time / median(±24 t) | > 3 | Billund højst 2,0 |
| Fastfrosset: ens værdier i træk | ≥ 24 t | Billund højst 3 |
| Benyttelsestid varmelast (middel/maks × 8.760) | 1.500–6.000 t | Billund 2.996; Andeby (syntese) 2.637 |
| Solprofil fuldlasttimer mod `p_max_heat` | 250–1.200 t | Andeby 579 (2025) |
| Solens tyngdepunkt (starttime, UTC) | 10,2–11,5 | Andeby DMI-profil 10,95; +1 time 11,95 |
| Nattesol (solen > 6° under horisonten) | > 0,2 % af energien eller > 5 % af spidsen | Andeby DMI-profil 0 |
| Målt/syntetisk energi · døgnkorrelation | 0,85–1,15 · ≥ 0,85 | Billund mod Billund-syntesen: 0,99–1,03 · 0,97–0,98 |

Nattesol-reglen og solens højde er portet 1:1 fra værksarket (scripts/vaerksark_til_yaml.py:922-932,
scripts/vaerksark_til_yaml.py:1063-1071).

**Fund:** modelrepoets *syntetiske* solprofil er forskudt ca. én time: tyngdepunkt 11,99 mod den DMI-baserede
10,95, og 43,6 MWh nattesol. Begge generatorer behandler UTC-timen som soltid med middag kl. 12
(scripts/generate_solar_andeby.py:83-86, scripts/vaerksark_til_yaml.py:1103-1119); solens middag i Danmark er
11,0–11,5 UTC. Andeby bruger ikke længere den syntetiske fil (cases/andeby.yaml:52-60), men **et værk fra
værksarket uden arket Solvarme får en sådan profil** — derfor udløser den `sol_tidsforskudt` og `sol_nat` i appen.
Det er rigtigt, at den gør det.

## 3. Ved bestilling

`startBestilling` fryser `_koersel.tidsserie.<rolle> = {"id","sha256"}` og tjekker på den **effektive**
konfiguration (`tjek_koersel` i oraklet): status `gyldig`; varmelast mangler ≤ 5 % af kørslens timer (fejl over,
advarsel under); solprofil dækker hver time; ingen time over kapaciteten. Hullerne slås op i
`validering_json.huller` (`[fra, til, antal]`, UTC); er listen afkortet (`huller_fuld: false`), afgør arbejderen.
Port [6] beviser, at vejen via `validering_json` giver præcis samme resultat som den eksakte vej over punkterne.

Eksempel fra porten: `data/billund_abvaerk_hourly.csv` slutter 24. juni 06:00. Spor B-perioden (2. marts – 30. juni)
mangler 161 af 2.904 timer = 5,5 % → fejl; det er grunden til, at README's Spor A-anker slutter 23. juni og Spor B
bruger den splejsede fil (README.md:139-144).

## 4. Værksarket — kontrakten, målt

Kørt lokalt 2026-10-16 (`scripts/vaerksark_til_yaml.py` uændret, output i egen scratch). Hele kontrakten står i
`data_krav.json → vaerksark`. Det vigtigste for fv-fabric2 og fv-app:

- **Skabelonen kan ikke importeres uændret:** exit 1, "Timedata har kun 8 timer" — de otte eksempelrækker er under
  grænsen på 672 timer (scripts/vaerksark_til_yaml.py:309). Live-beviset skal bruge en udfyldt kopi: enten Timedata tømt
  med B3 udfyldt (syntetisk last), eller en rigtig serie for 1. juli 2025 – 30. juni 2026.
- **Begge veje kører 2 døgn (målt):** 5.–6. januar 2026, uden balance, gab 0,0002/100 kr., df-data `392992c`:
  B3 = 50 GWh → optimal, 740 MWh, 160.190 kr.; Billunds målte last (UTC) → optimal, 1.521 MWh, 650.779 kr.
- **Perioden er fast og gælder i arkets tidszone:** 1. juli 2025 00:00 – 30. juni 2026 23:00. En dansk-tids-serie,
  der er omregnet fra et UTC-år, rammer 1. juli kl. 00 og 01 og afvises — med et misvisende råd om "1900"
  (scripts/vaerksark_til_yaml.py:406-408). Spørgsmål til forfatteren.
- **Læk-vagten** nægter at læse eller skrive i et git-repo, der ikke git-ignorerer stien
  (scripts/vaerksark_til_yaml.py:1467-1508). I Fabric ligger arket og output uden for ethvert repo, og en kodekopi
  fra zip er ikke et repo → vagten gælder ikke. `--tillad-offentlig` må aldrig bruges.
- **Output → app:** casen (alle blokke inkl. `solver` 0,001/1.000/3.600 og `heat_load_params` skaleret med
  årsvolumen/100), varmelast-CSV (kun med timedata) og solprofil (syntetisk for **hele kalenderår** fra start- til
  slutår, eller målt fra arket Solvarme). `production_profile_path` er scriptets egen sti → skal byttes til markøren
  `tidsserie:solprofil`. Den syntetiske solprofil dækker 2025–2026; varmelasten kun det faste år.
- `--timeslut` gælder både Timedata og Solvarme og flyttes **efter** UTC-omregning (scripts/vaerksark_til_yaml.py:361-367).

## 5. "Data i denne kørsel" (til fv-analyse2)

`data_krav.json → data_i_koersel.linjer` er den præcise liste: df-data- og modelcommit, værksrevision, periode,
spot-område (med fodnoten om første kvarter), DMI-område, balancedata kun når med, varmelast (syntetisk med
DMI-område · tidsserie-navn + sha256 · repo-fil), solprofil, og en linje når `price_zone ≠ spot_area`. Alt fra det
frosne input; vis det frosne sha256, også hvis tidsserien siden er ændret.

## 6. Mindre fund

- `load_heat_load_params` læser casen med `read_text()` uden encoding (src/data_loader.py:825): på Windows
  (cp1252) fejler den på `cases/andeby.yaml`. I Fabric (UTF-8) ikke. Lokalt: `PYTHONUTF8=1`.
- Modellens varmelast-læser genkender `hour_dk` som tidskolonne, men læser den som UTC uden `--heat-csv-tz`
  (src/data_loader.py:878-909) → reglen `hour_dk_som_utc`.

<!-- REGLER START -->

## 7. Alle regler (genereret af vaerktoej/byg_data_krav.py)

| Kode | Niveau | Hvornår | Roller | Tjek |
|---|---|---|---|---|
| `rolle_ukendt` | fejl | upload | varmelast, solprofil | rollen er ikke varmelast eller solprofil |
| `tidszone_ukendt` | fejl | upload | varmelast, solprofil | tidszonen er ikke UTC eller Europe/Copenhagen |
| `tidsstempel_ukendt` | fejl | upload | varmelast, solprofil | tidsstempel er ikke start eller slut |
| `enhed_ukendt` | fejl | upload | varmelast, solprofil | enheden er ikke MW, kW, MWh eller kWh (pr. interval) |
| `for_stor` | fejl | upload | varmelast, solprofil | filen har flere bytes eller rækker end grænsen |
| `kodning_cp1252` | info | upload | varmelast, solprofil | filen er ikke UTF-8 og læses som Windows-1252 |
| `tom` | fejl | upload | varmelast, solprofil | ingen datarækker |
| `excel_serietal` | fejl | upload | varmelast, solprofil | tidskolonnen er Excel-serietal (fx 45839,5) i stedet for datoer |
| `ingen_tid` | fejl | upload | varmelast, solprofil | ingen kolonne med tidsstempler |
| `kolonne_findes_ikke` | fejl | upload | varmelast, solprofil | den valgte værdikolonne findes ikke |
| `ingen_vaerdi` | fejl | upload | varmelast, solprofil | ingen kolonne med tal ved siden af tidsstemplet |
| `flere_kolonner` | info | upload | varmelast, solprofil | flere talkolonner; den foretrukne bruges |
| `hour_dk_som_utc` | advarsel | upload | varmelast, solprofil | tidskolonnen hedder hour_dk, men tidszonen er UTC |
| `ugyldig_tid` | fejl | upload | varmelast, solprofil | et tidsstempel kan ikke læses |
| `amerikansk_dato` | fejl | upload | varmelast, solprofil | datoer med / har et andet felt over 12 (måned/dag/år) |
| `ugyldigt_tal` | fejl | upload | varmelast, solprofil | en værdi er tekst og ikke et tal |
| `ikke_endelig` | fejl | upload | varmelast, solprofil | en værdi er uendelig |
| `blandet_zone` | fejl | upload | varmelast, solprofil | nogle stempler har tidszone, andre ikke |
| `zone_i_fil` | info | upload | varmelast, solprofil | stemplerne har selv en zone; valget af tidszone bruges ikke |
| `dst_time_findes_ikke` | advarsel | upload | varmelast, solprofil | dansk tid: et stempel ligger i forårets manglende time |
| `alle_tomme` | fejl | upload | varmelast, solprofil | alle værdier er tomme |
| `oploesning` | fejl | upload | varmelast, solprofil | opløsningen er hverken 1 time eller 15 minutter |
| `timeslut_mistanke` | advarsel | upload | varmelast, solprofil | valgt 'timens start', men serien begynder kl. 01 den 1. og slutter kl. 00 den 1. |
| `timestart_mistanke` | advarsel | upload | varmelast, solprofil | valgt 'timens slut', men serien begynder kl. 00 den 1. og slutter kl. 23 den sidste |
| `ligner_dansk_tid` | advarsel | upload | varmelast, solprofil | valgt UTC, men efterårets kl. 02 står to gange eller forårets kl. 02 mangler |
| `dst_dobbelttime_en_gang` | advarsel | upload | varmelast, solprofil | dansk tid: efterårets kl. 02 står kun én gang |
| `skaev_tid` | fejl | upload | varmelast, solprofil | et stempel ligger ikke på et helt interval |
| `dubletter` | fejl | upload | varmelast, solprofil | samme interval står mere end én gang (efter omregning til UTC) |
| `kvarter_aggregeret` | info | upload | varmelast, solprofil | kvarterværdier er midlet til timer |
| `delvise_timer` | advarsel | upload | varmelast, solprofil | 15 min: timer med færre end fire kvarterer |
| `enhed_omregnet` | info | upload | varmelast, solprofil | værdierne er omregnet til MW |
| `negativ` | fejl | upload | varmelast, solprofil | en værdi er negativ |
| `alle_nul` | fejl | upload | varmelast, solprofil | alle værdier er 0 |
| `urimelig_stor` | fejl | upload | varmelast, solprofil | største værdi over 5.000 MW |
| `for_kort` | fejl | upload | varmelast, solprofil | under 48 timer med værdi |
| `kort_serie` | advarsel | upload | varmelast, solprofil | serien spænder under 28 døgn |
| `huller` | advarsel | upload | varmelast | timer mangler mellem første og sidste time |
| `langt_hul` | advarsel | upload | varmelast | længste hul over 48 timer |
| `sol_huller` | fejl | upload | solprofil | solprofil: over 5 % af timerne mangler |
| `sol_huller_udfyldt` | advarsel | upload | solprofil | solprofil: huller på højst 5 % er udfyldt |
| `nul_straek` | advarsel | upload | varmelast | 24 timer eller flere i træk med 0 |
| `fastfrosset` | advarsel | upload | varmelast | 24 timer eller flere i træk med præcis samme værdi |
| `spids` | advarsel | upload | varmelast | en time over 3 gange medianen af ±24 timer |
| `benyttelsestid` | advarsel | upload | varmelast | helår: gennemsnit/maks x 8.760 uden for 1.500-6.000 timer |
| `sol_nat` | advarsel | upload | solprofil | solprofil: produktion, mens solen er mere end 6 grader under horisonten |
| `sol_tidsforskudt` | advarsel | upload | solprofil | solprofil: produktionens tyngdepunkt uden for 10,2-11,5 UTC |
| `over_kapacitet` | advarsel | upload | varmelast | en time over værkets samlede varmekapacitet (kræver værk) |
| `sol_ingen_enhed` | advarsel | upload | solprofil | værket har ingen aktiv solvarmeenhed (kræver værk) |
| `sol_flere_enheder` | advarsel | upload | solprofil | værket har flere aktive solvarmeenheder (kræver værk) |
| `sol_over_pmax` | advarsel | upload | solprofil | solprofilens største værdi over enhedens maks varme (kræver værk) |
| `sol_andel` | advarsel | upload | solprofil | solprofilen ligger mellem 0 og 1, mens enheden er på flere MW (kræver værk) |
| `sol_benyttelsestid` | advarsel | upload | solprofil | helår: årsproduktion / maks varme uden for 250-1.200 timer (kræver værk) |
| `koersel_tidsserie_ikke_gyldig` | fejl | bestilling | varmelast, solprofil | den valgte tidsserie er ikke gyldig |
| `koersel_varmelast_daekning` | fejl | bestilling | varmelast | over 5 % af kørslens timer mangler i varmelasten |
| `koersel_varmelast_huller` | advarsel | bestilling | varmelast | 1-5 % af kørslens timer mangler i varmelasten |
| `koersel_sol_daekning` | fejl | bestilling | solprofil | solprofilen dækker ikke hver time i kørslen |
| `koersel_huller_afkortet` | info | bestilling | varmelast, solprofil | hullisten i validering_json er afkortet |
| `koersel_over_kapacitet` | fejl | bestilling | varmelast | en time i kørslen over værkets effektive kapacitet (kræver værk) |
| `koersel_sol_flere_enheder` | fejl | bestilling | solprofil | flere aktive solvarmeenheder uden markør (kræver værk) |
| `koersel_df_data` | advarsel | bestilling | varmelast, solprofil | perioden ligger uden for den målte df-data-dækning |
| `maalt_mod_syntetisk` | advarsel | visning | varmelast | målt/syntetisk energi uden for 0,85-1,15 eller døgnkorrelation under 0,85 |

Kilde: viden/data_krav.json

<!-- REGLER SLUT -->
