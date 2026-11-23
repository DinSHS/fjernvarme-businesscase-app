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

## 3. Ikke regnet igen ved 939228a

- **D12 / Andeby helår med balancemarked** (ca. en time; ramte ved 90fb16e tidsgrænsen 3.600 s med gab 0,13 %).
- **Billund i dag, kun spot og faktisk marked** (modelrepoets kontroltal; ved 90fb16e ramt til kronen).
- **Mængdetal** i demo-scenariernes vurderinger (MWh, CO₂, balanceindtægter) og BUDSTRATEGI-kolonnen "Prognosen lovede".

Maskinlæsbare målefiler lå under kørslen i en midlertidig mappe; tallene ovenfor er skrevet ind i
`viden/demo_scenarier.json` (`koersel_status`, `par › maalt_2026_11_23`) og `viden/referencetal.json` (`regnet_igen`)
af et script, der læste dem derfra og krævede lighed med 90fb16e-målingen.
