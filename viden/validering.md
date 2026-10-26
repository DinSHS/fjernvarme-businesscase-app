# Validering — alle fejl, modellen rejser, og hvem der kan fange dem

Kilde: modelrepoet @ `eef950a`. Linjehenvisninger er `fil:linje` ved den commit.
Sorteret efter **hvor brugeren laver fejlen** i appen. Kolonnen *Fanges* siger:

- **Klient** — kan afgøres alene ud fra værkets parametre og scenariet. Appen bør
  fange den, før der bestilles en kørsel, og vise teksten i *Besked til brugeren*.
- **Klient (periode)** — kan afgøres ud fra værk + scenariets periode uden data.
- **Notebook** — kræver data (df-data, profil-CSV, varmelast-CSV) eller selve løsningen.
  Notebooken skal oversætte den til en læsbar `fejlbesked` på Koersel.

## Tre ting at vide før tabellerne

1. **run_case.py fanger kun `ValueError` fra indlæsningen** og viser den uden traceback
   (run_case.py:626-632). Ukendte felter på en enhed eller et lager giver `TypeError`
   (dataclassen bygges med `Unit(**felter)`, src/config.py:962, `Storage(**felter)`, src/config.py:967),
   og manglende påkrævede nøgler giver `KeyError` (fx `raw["time"]`, src/config.py:921, eller
   `mk["block_mw"]`, src/config.py:1041). De ender som traceback. **Klienten skal fange dem**,
   ellers ser brugeren en Python-stak.
2. **Dækningsfejl (`CoverageError`) kommer efter indlæsningen** (src/data_loader.py:150, :184) og
   fanges ikke af run_case.py; de bliver også traceback. Notebooken skal genkende klassenavnet og
   vise beskedens første linjer ("dækning mangler for den ønskede periode …").
3. **En uløselig model stopper med `SystemExit` og en forklaring** (src/solve.py:128-140), ikke
   med en Python-fejl. Exit-koden er ikke 0; teksten er skrevet til brugeren og kan vises direkte.

## 1. Værk › Data (eksterne kilder)

| Fejl | Besked (forkortet) | Kilde | Fanges |
|---|---|---|---|
| `data`-blok mangler | casen mangler en 'data'-blok | src/config.py:1099-1110 | Klient |
| Ukendt nøgle i `data` | ukendte noegler i data-blokken | src/config.py:1112-1115 | Klient |
| `dmi_area` eller `price_zone` mangler | … mangler i casen og har med vilje ingen default | src/config.py:1116-1121 | Klient |
| `dmi_area` ukendt | er ikke en kendt DMI-station. Kendte: fyn, vestkyst, karup, ringsted | src/config.py:682-688 | Klient |
| `price_zone` ukendt | er ikke en kendt priszone. Kendte: DK1, DK2 | src/config.py:689-693 | Klient |
| `eur_dkk` ≤ 0 | data.eur_dkk skal vaere > 0 | src/config.py:694-696 | Klient |
| `price_zone` ≠ `electricity.spot_area` | *ingen fejl* — balancepriserne hentes for `spot_area`, spot for `price_zone` (src/data_loader_github.py:701) | — | Klient (advarsel) |

## 2. Værk › Tid og scenariets periode

| Fejl | Besked | Kilde | Fanges |
|---|---|---|---|
| `time.start`/`end`/`resolution` mangler | `KeyError` (traceback) | src/config.py:921-926 | Klient |
| Ugyldig ISO-tid | `ValueError` fra `datetime.fromisoformat` | src/config.py:923-924 | Klient |
| `resolution` ikke `1h`/`15min` | Ukendt cfg.time.resolution | run_case.py:465-474; src/data_loader.py:61 | Klient |
| Effektiv opløsning ≠ `1h` | afvises af `startBestilling` og arbejderen: kroneleddene summeres uden intervallets længde ved 15min | KONTRAKT §6c; src/model.py:432-434 | Klient + Function + Notebook |
| Slut før start (scenariets periode) | --end (…) skal være efter --start (…) | run_case.py:545-546 | Klient |
| Kun start eller kun slut | --start og --end skal bruges sammen | run_case.py:528-529 | Klient |
| Periode længere end 366 døgn | afvises af `startBestilling` | KONTRAKT §3.0 | Klient + Function |
| Data dækker ikke perioden (spot, DMI, aFRR, mFRR, ubalance) | `CoverageError`: dækning mangler for den ønskede periode | src/data_loader.py:150; src/data_loader.py:184 | Notebook |
| Balancering før 4. marts 2025 | `CoverageError` (ubalance og mFRR-aktivering begynder 4. marts 2025) | cases/andeby.yaml:97-101 | Klient (periode) — som advarsel; afgøres endeligt i Notebook |
| `fyn`/`vestkyst` og en periode hen over 28. februar 2026 (fyn også 1. januar 2026) | `CoverageError` | doc/KOERSEL.md:110-111; cases/andeby.yaml:89 | Klient (periode) — som advarsel |
| Produktionsprofil (solvarme) dækker ikke perioden | production_profile daekker ikke hele perioden … Profilen er IKKE nulfyldt | src/data_loader.py:996-1010 | Notebook (klient kan advare: Andebys profil dækker 1. januar 2025 – 3. oktober 2026, cases/andeby.yaml:57) |

## 3. Værk › Priser

| Fejl | Besked | Kilde | Fanges |
|---|---|---|---|
| `prices.co2_eua` mangler | prices.co2_eua mangler i casen. Skriv 0, hvis gasprisen allerede indeholder CO2-afgiften | src/config.py:930-933 | Klient |
| En pris mangler `value` | `KeyError` (traceback) | src/config.py:936-942 | Klient |
| En aktiv enhed bruger et brændsel uden pris | En enhed bruger halm, men prisen for halm er ikke sat under prices i casen | src/config.py:621-627 | Klient (rejses først ved modelbygning) |
| Ukendt brændsel på en enhed | `KeyError`: Ukendt brændsel | src/config.py:619-620 | Klient |

## 4. Værk › El og tariffer

| Fejl | Besked | Kilde | Fanges |
|---|---|---|---|
| `spot_area`, `tariff_consumption_flat`, `tariff_production_flat` eller `electricity_tax` mangler | `KeyError` (traceback) | src/config.py:947-951 | Klient |
| Tarifprofilens `unit` ≠ `kr_per_mwh` | … skal være 'kr_per_mwh' | src/tariff.py:111-115 | Klient |
| `net_tariff.seasons` mangler/tom | net_tariff.seasons mangler eller er tom | src/tariff.py:231-234 | Klient |
| En måned i to sæsoner | måned N står i både … og … | src/tariff.py:124-130 | Klient |
| En måned i ingen sæson | månederne […] er ikke dækket af nogen sæson | src/tariff.py:131-136 | Klient |
| Interval peger på udefineret bånd | refererer båndet …, som ikke er defineret under 'bands' | src/tariff.py:142-147 | Klient |
| Interval kan ikke læses (`HH-HH`) | intervallet … kan ikke læses. Formatet er 'HH-HH' | src/tariff.py:202-209 | Klient |
| Interval uden for 0–24 eller start ≥ slut | Timer skal ligge i 0–24 og start < slut | src/tariff.py:210-214 | Klient |
| Time dækket to gange | time HH er dækket af både … og … | src/tariff.py:148-154 | Klient |
| Time ikke dækket | timerne […] er ikke dækket. Intervaller er halvåbne | src/tariff.py:155-161 | Klient |
| `elafgift_net` ≠ `electricity_tax` | … afviger fra electricity.electricity_tax. De skal være samme tal | src/tariff.py:173-181 | Klient |

## 5. Værk › Enheder

| Fejl | Besked | Kilde | Fanges |
|---|---|---|---|
| Ukendt felt på en enhed, eller påkrævet felt mangler (`type`, `p_max_heat`, `p_min_heat`, `alpha`, `fuel`) | `TypeError` (traceback) | src/config.py:957-962 | **Klient** (skal) |
| `p_min_heat` > `p_max_heat` | <enhed>: p_min > p_max | src/config.py:523-524 | Klient |
| Brændselsenhed uden virkningsgrad | <enhed>: brændselsenhed mangler eta_fuel_to_heat | src/config.py:525-526 | Klient |
| `cop_curve` på andet end `heat_pump` | cop_curve kun gyldig for type='heat_pump' | src/config.py:529-533 | Klient |
| `cop_curve` uden `fuel: electricity` | cop_curve kræver fuel='electricity' | src/config.py:534-537 | Klient |
| UC: `initial_status` ikke 0/1 | initial_status skal være 0 eller 1 | src/config.py:540-544 | Klient |
| UC: `min_uptime`/`min_downtime` < 1 | min_uptime/min_downtime skal være ≥ 1 | src/config.py:545-548 | Klient |
| COP-type ukendt | `NotImplementedError`: Brug 'linear' eller 'table' (traceback) | src/config.py:408-412 | Klient |
| Lineær kurve med `points` | 'points' gælder kun type 'table' | src/config.py:401-402 | Klient |
| Lineær kurve: `cop_min` ≤ 0 eller `cop_max` ≤ `cop_min` | Ugyldige COP-grænser | src/config.py:403-406 | Klient |
| Tabel med under to punkter | kræver mindst to målepunkter | src/config.py:413-417 | Klient |
| Punkt mangler tal | punkt i: skal have t_ambient, heat_mw og el_mw som tal | src/config.py:419-428 | Klient |
| Varme eller el ≤ 0 | varme og el skal være > 0 | src/config.py:429-433 | Klient |
| COP i et punkt uden for 1–8 | er varme og el byttet om, eller står et tal i kW? | src/config.py:434-441 | Klient |
| Samme udetemperatur to gange | samme udetemperatur står to gange | src/config.py:444-446 | Klient |
| Ingen aktive enheder | Ingen aktive produktionsenheder — modellen er tom | src/model.py:150 | Klient (også efter scenariets disable) |
| Profilsti sat, men profilen ikke indlæst | production_profile_path sat, men profil mangler i data | src/model.py:165-170 | Notebook |
| Varmepumpe med tabel og huller i udetemperaturen | varmeloftet fra COP-tabellen har N tomme timer | src/model.py:188-194 | Notebook |

## 6. Værk › Lagre

| Fejl | Besked | Kilde | Fanges |
|---|---|---|---|
| Ukendt felt eller påkrævet felt mangler | `TypeError` (traceback) | src/config.py:966-967 | **Klient** (skal) |
| `e_initial_mwh` < 0 | … må ikke være negativt | src/config.py:576-579 | Klient |
| `e_initial_mwh` > kapacitet | *ingen fejl*: sættes til halvfuld med en besked i loggen | src/config.py:580-594 | Klient (advarsel; typisk efter en volumenændring) |

## 7. Værk › Balancemarked

| Fejl | Besked | Kilde | Fanges |
|---|---|---|---|
| Ukendt nøgle i `balancing` | ukendte noegler i balancing. Gyldige: … | src/config.py:984-991 | Klient |
| `method` ugyldig | balancing.method skal være 'legacy' eller 'activation_value' | src/config.py:993-998 | Klient |
| `activation_value` uden `bid_strategy` | … kræver balancing.bid_strategy | src/config.py:1001-1004 | Klient |
| Scenariets metode `activation_value` uden `bid_strategy` | `SystemExit`: --balancing-method activation_value kræver balancing.bid_strategy | run_case.py:664-668 | Klient |
| `bid_strategy` uden `up_markup_dkk_mwh` | `TypeError` (traceback) | src/config.py:1000 | Klient |
| `per_unit_market_mw.<enhed>` er ikke et map | skal være et map med nøglerne 'afrr' og/eller 'mfrr' | src/config.py:134-139 | Klient |
| Ukendt marked i `per_unit_market_mw` | ukendt marked […]. Gyldige nøgler: ['afrr', 'mfrr'] | src/config.py:140-145 | Klient |
| Loft på en enhed, der ikke findes | balancing.ancillary_caps.<felt>: enhed(er) […] findes ikke i casen | src/config.py:1018-1024 | Klient |
| Gate-marked uden tærskel og uden beregnet budpris | sæt enten cm_threshold_dkk_mw_h … eller opportunity_cost | src/config.py:164-170 | Klient |
| Gate-marked uden `block_mw` | `KeyError` (traceback) | src/config.py:1041 | Klient |
| Gate `mode` ugyldig | reservation_gate.mode skal være 'driven' eller 'bound' | src/config.py:331-336 | Klient |
| Beregnet budpris: referenceenhed findes ikke | opportunity_cost.reference_unit=… findes ikke i casen | src/balancing.py:709-713 | Klient |
| Beregnet budpris uden ikke-elektriske enheder | casen har ingen ikke-elektriske enheder at regne alternativomkostningen mod | src/balancing.py:676-680 | Klient |
| Ukendt nøgle i `activation` eller dens markeder | ukendte noegler i balancing.activation… | src/config.py:1052-1062 | Klient |
| Aktiveringsmodel ugyldig | balancing.activation.*.model skal være en af ('clear', 'system_share', 'ramp') | src/config.py:200-204 | Klient |
| `k` ≤ 0 | balancing.activation.*.k skal være > 0 | src/config.py:205-207 | Klient |
| `ramp` uden `ramp_dkk_mwh` > 0 | model='ramp' kræver ramp_dkk_mwh > 0 | src/config.py:208-213 | Klient |
| `foresight` ugyldig | skal være en af ('realized', 'profile', 'trailing30', 'lag24', 'lag168') | src/config.py:240-244 | Klient |
| `settle` ugyldig | skal være 'forecast' eller 'realized' | src/config.py:245-248 | Klient |
| Ikke-standard aktivering uden `activation_value` | balancing.activation kræver balancing.method='activation_value' | src/config.py:1067-1071 | Klient (kontrollen springes over, når metoden sættes som scenariefelt — run_case.py:661-668) |
| Ukendt nøgle i `availability` | ukendte noegler i balancing.availability | src/config.py:1077-1089 | Klient |
| Månedsnøgle ikke `ÅÅÅÅ-MM` | månedsnøgle skal være 'ÅÅÅÅ-MM' | src/config.py:264-266 | Klient |
| Månedsloft < 0 | skal være ≥ 0 | src/config.py:268-269 | Klient |
| `availability.mode` ugyldig | skal være 'hourly' eller 'energy' | src/config.py:294-298 | Klient |
| Måned i perioden uden månedsloft | balancing.availability.<marked>: intet loft for […] | src/balancing.py:1046-1052 | Klient (periode) — månederne er UTC-måneder (`strftime` på modellens UTC-akse) |
| Enheder i en budgruppe findes ikke | ancillary_groups.<gruppe>: ukendte enheder | src/config.py:974-979 | Klient |

## 8. Værk › Solver og nettilslutning

| Fejl | Besked | Kilde | Fanges |
|---|---|---|---|
| Ukendt nøgle i `solver` | ukendte noegler i solver-blokken | src/config.py:1126-1130 | Klient |
| `mip_rel_gap` uden for [0, 1) | solver.mip_rel_gap skal ligge i [0, 1) | src/config.py:725-728 | Klient (gælder også scenariets gab, run_case.py:640) |
| `mip_abs_gap` < 0 | solver.mip_abs_gap skal vaere >= 0 | src/config.py:733-736 | Klient |
| `time_limit` ≤ 0 | solver.time_limit skal vaere > 0 | src/config.py:737-740 | Klient |
| Tidsgrænse > 3.600 s | afvises af `startBestilling` | KONTRAKT §3.0 | Klient + Function |
| `presolve_rule_off` < 0 | solver.presolve_rule_off skal vaere >= 0 | src/config.py:729-732 | Klient |
| Ukendt nøgle i `grid` | ukendte noegler i grid-blokken | src/config.py:1135-1138 | Klient |
| `grid.max_consumption_mw` ≤ 0 | grid.max_consumption_mw skal vaere > 0 | src/config.py:1142-1143 | Klient |
| Nettilslutning uden aktive el-enheder | grid.max_consumption_mw er sat, men casen har ingen … | src/model.py:408-411 | Klient |

## 9. Værk › Varmelast (`heat_load_params`)

| Fejl | Besked | Kilde | Fanges |
|---|---|---|---|
| Blokken mangler (også når målt varmelast bruges) | heat_load_params mangler i … | src/data_loader.py:805-809; run_case.py:377 | Klient |
| `gaf_mw_per_k` mangler | `KeyError` (traceback) | src/data_loader.py:676 | Klient |
| `baseline_profile_mw` ikke 24 tal | baseline_profile_mw skal være 24-element array | src/data_loader.py:666-670 | Klient |
| Nettab: hverken `aarligt_nettab_mwh` eller `_pct` | Angiv enten 'aarligt_nettab_mwh' eller 'aarligt_nettab_pct' | src/nettab.py:116-125 | Klient |
| Nettab: sommer/vinter-temperatur mangler | `KeyError` (traceback) | src/nettab.py:128-129 | Klient |
| Nettab: `sommer.t_ude` ≤ `vinter.t_ude` | sommer.t_ude skal være højere end vinter.t_ude | src/nettab.py:133-134 | Klient |
| Nettab: `konduktiv_andel` uden for (0, 1) | konduktiv_andel skal være mellem 0 og 1 | src/nettab.py:156-158 | Klient |
| Nettab: dynamisk `t_jord_damping` uden for [0, 1] | t_jord_damping skal være mellem 0 og 1 | src/nettab.py:71-72 | Klient |
| Nettab: `t_jord_ema_days` ≤ 0 | t_jord_ema_days skal være positiv | src/nettab.py:73-74 | Klient |
| Nettab: drivkraft ikke positiv | Drive-integral ikke-positiv | src/nettab.py:149-153 | Notebook (afhænger af vejret) |
| Nettab ≥ årsproduktion | Inkonsistent input: nettab Q … er ≥ annual_production_mwh | src/nettab.py:160-165 | Notebook |
| Målt varmelast: filen findes ikke | Heat-CSV ikke fundet / --heat-csv: filen findes ikke | src/data_loader.py:874; run_case.py:622-623 | Klient (hvidliste) + Notebook |

## 10. Scenarie › Ændringer (`set`, `enable`, `disable`)

Appen anvender ændringerne i case-dict'et (KONTRAKT §5.2), ikke via `--set`. Reglerne nedenfor er
modellens egne for `--set` (src/config.py:809-885) og bør håndhæves ens, så et scenarie betyder det
samme i appen og på kommandolinjen.

| Fejl | Besked | Kilde | Fanges |
|---|---|---|---|
| Stien findes ikke i værket | nøgle '…' findes ikke … --set kan kun ændre nøgler, der allerede står i casen | src/config.py:843-851; src/config.py:861-866 | Klient |
| En forælder i stien er ikke en blok | '…' er ikke en dict, kan ikke navigere videre | src/config.py:837-842; src/config.py:856-860 | Klient |
| Stien peger på en blok eller liste | peger på en dict/list, ikke en leaf-værdi | src/config.py:868-874 | Klient (KONTRAKT §3.5 tillader at erstatte en liste som helt blad — det kan CLI'en ikke) |
| Værdien kan ikke læses | kunne ikke parse '…' som YAML-værdi | src/config.py:876-882 | Klient (`vaerdi_json` skal være gyldig JSON) |
| To ændringer på samme sti | afvises | KONTRAKT §3.5 | Klient |
| `enable`/`disable` på et navn, der hverken er enhed eller lager | `KeyError`: --enable/--disable …: hverken enhed eller lager | run_case.py:562-572 | Klient |
| `set` på `time.*` eller `solver.*` | afvises — periode, gab og tidsgrænse har egne scenariefelter | KONTRAKT §6c | Klient + Function + Notebook |
| Ekstra flag uden for hvidlisten | afvises | KONTRAKT §3.4 | Klient + Notebook |

Værd at vide: ved `--enable`/`--disable` udføres alle enables før alle disables
(run_case.py:554-572), så disable vinder. Med KONTRAKT §3.5's dubletforbud kan samme navn ikke
både slås til og fra i ét scenarie, så rækkefølgen er uden betydning.

## 11. Løsningen (kun notebook)

| Fejl | Besked | Kilde |
|---|---|---|
| Uløselig model | Modellen kan ikke løses (infeasible) … Typiske årsager: driven-blokke større end eleffekten; driven uden tank om sommeren; kedler tændt ved start med minimumslast | src/solve.py:128-140 |
| Tidsgrænsen nås | *ingen fejl*: bedste løsning gemmes; opnået gab står kun i solverens log | doc/KOERSEL.md:170-171; README.md:146 |
| Netværk/klon af df-data fejler | `RuntimeError` fra datalaget | src/data_loader_github.py:123 |

Typiske uløselige kombinationer, som klienten kan **advare** om (ikke afvise):
`reservation_gate.mode: driven` hvor aFRR- + mFRR-blok overstiger de bydende enheders samlede
eloptag (doc/BUDSTRATEGI.md:247-249), `driven` uden tank om sommeren, og enheder med
`initial_status: 1` og minimumslast i et sommervindue uden tank (rapport v4 §4.4).
