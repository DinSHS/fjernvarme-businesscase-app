# Målte tal ved modelpin 939228a (modelrepoets v0.11.0, oliekedel)

Målt 23. november 2026 på grenen `runde15/model-939228a`. Model `939228a` (`939228aa048563c8498382a79d207c8b03fbda57`),
df-data `106b9fc` (`DF_DATA_SHA` uændret). Alle kørsler gennem appens egen kæde: frosset input → `input_hash` →
`fjv.arbejder` → `fjv.koersel` → hukommelseslager (som `fabric/koer_minne.py`), 8 kerner, linopy 0.10.0 / highspy 1.15.1,
én kørsel ad gangen på en delt maskine (køretiderne er derfor ikke rene løsetider). Modelkoden er hentet som zip ved
pinnen fra GitHub ved første kørsel, som arbejderen gør det.

Modelrepoets CHANGELOG siger for både 0.10.0 (UTF-8) og 0.11.0 (oliekedel): *Flytter tal: nej*. Målingerne her bekræfter
det gennem appens kæde: hver kørsel giver samme objektiv som ved `90fb16e` (noter/maaling_model_90fb16e.md) til øren.

## 1. Referencetallet

| Tal | Kommando | Ved 90fb16e | Ved 939228a | Gab | Tid |
|---|---|---:|---:|---|---:|
| Andeby 5.–6. jan 2026, uden balancemarked | `python fabric/koer_minne.py andeby 2026-01-05 2026-01-06` | 866.567,72 | **866.567,72** | 0 | 76 s |

## 2. Demo-scenarierne og referencetallene

"Vindue" er casens egen tidsblok, hvor intet andet står. Gab i bestillingen som ved 90fb16e: 0,0002 / 100 kr. for
D01–D08 (Andeby 5.–16. januar 2026); D09/D10 0,0002 / 1.000 kr., 1.800 s; D11 og README-referencerne casens eget gab.

| Id | Kørsel | Ved 90fb16e, kr. | Ved 939228a, kr. | Opnået gab | Tid |
|---|---|---:|---:|---|---:|
| D01 | Andeby vinter, reference (= budstrategi 1) | 3.441.004,22 | **3.441.004,22** | 0 | 19 s |
| D02 | uden tankene | 3.464.520,18 | **3.464.520,18** | 0 | 10 s |
| D03 | uden varmepumpen | 3.917.608,86 | **3.917.608,86** | 0 | 8 s |
| D04 | gaspris +20 % | 3.708.013,03 | **3.708.013,03** | 0 | 7 s |
| D05 | gammel 12 MW elkedel | 3.302.741,09 | **3.302.741,09** | 0 | 8 s |
| D06 | med balancemarked | 3.111.637,94 | **3.111.637,94** | 0 | 10 s |
| D07 | balancemarked, uden tankene | 3.155.447,03 | **3.155.447,03** | 0 | 8 s |
| D08 | balancemarked, kender aktiveringerne (= budstrategi 2) | 3.011.915,11 | **3.011.915,11** | 0 | 9 s |
| – | budstrategi 3: byd frit, prognose | 3.220.386,23 | **3.220.386,23** | 0 | 17 s |
| – | budstrategi 4: beregnet budpris, prognose | 3.346.956,95 | **3.346.956,95** | 0 | 19 s |
| D09 | Billund Spor B med balancemarked (demo-gab) | 4.428.863,74 | **4.428.863,74** | 0,0015 % | 326 s |
| D10 | Billund Spor B uden balancemarked | 6.561.709,91 | **6.561.709,91** | 0,0121 % | 85 s |
| D11 | Andeby helår uden balancemarked (README) | 30.495.430,90 | **30.495.430,90** | 0,0209 % | 478 s |
| D12 | Andeby helår med balancemarked (README) | 24.235.821,54 | ikke regnet igen | – | – |
| – | Spor A-anker (README, med balancemarked) | 5.204.555,28 | **5.204.555,28** | 0,109 % | 179 s |
| – | Spor B (README, casens gab) | 4.428.863,74 | **4.428.863,74** | 0,152 % | 236 s |
| – | Billund rullende år (README) | 22.492.900,32 | **22.492.900,32** | 2,59 % | 1.363 s |

Spor A-ankeret rammer README's tal ved 939228a (5.204.555, regnet igen 18. november 2026 på `3cf753a` efter
spotrettelsen). De fire øvrige README-tal er stadig fra før rettelsen og kan ikke sammenlignes med kolonnerne her.

Billund rullende år ramte som ved 90fb16e kodens tidsgrænse (600 s) med gab 2,59 %: tallet er en øvre grænse.

## 3. En kørsel med oliekedel (ny enhedstype ved 939228a)

Casen er Andeby med en oliekedel i stedet for gaskedlen: `gaskedel_agg` slået fra, en oliekedel på 20 MW
(`type: oil_boiler`, `fuel: fuel_oil`, virkningsgrad 0,92, D&V 40 kr./MWh, start 500 kr., CO₂-faktor 0,266 t/MWh som
modelscriptet sætter den) og `prices.fuel_oil` 900 kr./MWh olie. Casefilen er lavet ved tekstrettelser i
`cases/andeby.yaml` i en separat klon af modelrepoet ved pinnen, ikke af appens kode. Tallene er *appens egen case*,
ikke et tal fra modelrepoet.

| Vindue | A: `run_case.py` direkte | B: appens bestillingsvej (`bevis_app_vej.py`) | C: hele arbejderkæden (frosset input, `input_hash`, `fjv.arbejder`) |
|---|---:|---:|---:|
| 5.–6. januar 2026, uden balancemarked | 1.083.242 | 1.083.242,38 (timefil og KPI-fil byte-ens med A) | **1.083.242,38** (gab 0) |
| 5.–16. januar 2026, uden balancemarked (gab 0,0002 / 100 kr. i C) | 4.001.969 | 4.001.969,31 (byte-ens med A) | **4.001.969,31** (gab 0) |
| 5.–16. januar 2026, med balancemarked | ikke kørt | ikke kørt | 3.616.106,96 (gab 0) |

A viser manifestets objektiv i hele kroner; B og C wrapperens præcise tal. Til sammenligning Andeby med gaskedlen:
866.567,72 kr. (2 døgn) og 3.441.004,22 kr. (12 døgn, D01).

Oliekedlen i kørslen 5.–6. januar: 480,1 MWh varme (32,4 % af produktionen), i drift 35 af 47 timer, maks. 20 MW.
CO₂ for værket: 207,4 t mod 159,2 t med gaskedlen (modellens egen opgørelse, `src/manifest.py`). 5.–16. januar:
1.302,0 MWh fra oliekedlen, CO₂ 517,9 t. Arbejderen publicerede oliekedlens nøgletal (produktion, andel, driftstimer,
fuldlasttimer) og 47 hhv. 287 timerækker.

**Beviset `bevis_app_vej.py` ved 939228a** (10.–11. marts 2026, df-data 106b9fc): 8 af 8 cases ens (objektiv,
`_hourly.csv` og `_kpi.csv` byte for byte): de syv fra modelrepoet med samme objektiver som ved 90fb16e
(andeby 224.912 · billund_idag 132.766 · billund_sporA 183.920 · billund_sporA_rullende 183.494 ·
billund_sporA_rullende_bud 236.859 · billund_sporB 54.619 · billund_sporB_rullende 236.859 kr.) og oliekedel-casen
(224.912 kr.: i marts-vinduet er hverken olie- eller gaskedlen i drift).

**Gennem værksarket** (`tjek_eksport_rundtur.py --koer`, varianten `andeby_olie` med CO₂-faktor 0,28): appens eksport →
modelrepoets `vaerksark_til_yaml.py` → upload som nyt værk → genupload → `run_case` på original og nyt værk. 219 blade
fra scriptet, 250 i det nye værk, kun solprofilens sti på listen "ikke med i arket". Scriptet læser faktoren som 0,266;
appens fane *Start og drift* fører 0,28 tilbage. Objektivet for original og nyt værk er ens: 10.–11. marts 2026 224.911,78 kr. (oliekedlen er ikke i drift) og
5.–6. januar 2026 **1.087.588,24 kr.** (oliekedlen i drift; højere end 1.083.242,38 ovenfor, fordi varianten regner med
0,28 t CO₂ pr. MWh olie). Andeby selv gennem samme vej 5.–6. januar: 866.567,72 kr. for både original og nyt værk.

## 4. Ikke regnet igen ved 939228a

- **D12 / Andeby helår med balancemarked** (ca. en time; ramte ved 90fb16e tidsgrænsen 3.600 s med gab 0,13 %).
- **Billund i dag, kun spot og faktisk marked** (modelrepoets kontroltal; ved 90fb16e ramt til kronen).
- **Mængdetal** i demo-scenariernes vurderinger (MWh, CO₂, balanceindtægter) og BUDSTRATEGI-kolonnen "Prognosen lovede".

Maskinlæsbare målefiler lå under kørslen i en midlertidig mappe; tallene ovenfor er skrevet ind i
`viden/demo_scenarier.json` (`koersel_status`, `par › maalt_2026_11_23`) og `viden/referencetal.json` (`regnet_igen`)
af et script, der læste dem derfra og krævede lighed med 90fb16e-målingen.
