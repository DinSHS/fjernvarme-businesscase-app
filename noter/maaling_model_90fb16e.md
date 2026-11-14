# Målte tal ved modelpin 90fb16e (spot midles over tidsskridtet)

Målt 14. november 2026 på grenen `opdatering/model-90fb16e-tal`. Model `90fb16e` (`90fb16eb1e2d5aa8e619b5a951b93760fa803985`),
df-data `106b9fc` (`DF_DATA_SHA` uændret). Alle kørsler gennem appens egen kæde: frosset input → `input_hash` →
`fjv.arbejder` → `fjv.koersel` → hukommelseslager (som `fabric/koer_minne.py`), 8 kerner, linopy 0.10.0 / highspy 1.15.1,
højst to kørsler ad gangen på samme maskine (køretiderne er derfor ikke rene løsetider). Maskinlæsbar version:
[`maaling_model_90fb16e.json`](maaling_model_90fb16e.json). "Gammelt" = tal i repoet fra **før** spotrettelsen (ved `eef950a`);
de kan ikke sammenlignes med de nye, og forskellen er forventet, ikke en fejl.

## 1. Referencetallet og beviset

| Tal | Kommando | Gammelt | Nyt | Gab | Tid |
|---|---|---:|---:|---|---:|
| Andeby 5.–6. jan 2026, uden balancemarked | `python fabric/koer_minne.py andeby 2026-01-05 2026-01-06` | 867.031,23 | **866.567,72** | 0 | 16 s |

Lig leads direkte måling på modelrepoet (866.567,72): appens kæde afviger ikke.

**Beviset "appens vej = run_case.py"** (`bevis_app_vej.py --model ../fjernvarme-businesscase --ud C:/fjvb`, vindue
10.–11. marts 2026, uden balancemarked): **7 af 7 cases ens** (objektiv, `_hourly.csv` og `_kpi.csv` byte for byte).
andeby 224.912 · billund_idag 132.766 · billund_sporA 183.920 · billund_sporA_rullende 183.494 ·
billund_sporA_rullende_bud 236.859 · billund_sporB 54.619 · billund_sporB_rullende 236.859 kr.
Scriptet melder `df-data hentes (appens pin 106b9fc)`; modelrepoets egen klon `data/df-data` står på `a859b8b`, men begge veje
bruger samme klon, så sammenligningen holder. Gamle tal for netop dette vindue har jeg ikke set i repoet (ikke sammenlignet).

## 2. Demo-scenarierne (`viden/demo_scenarier.json › koersel_status`)

Gab i bestillingen: 0,0002 / 100 kr. for D01–D08 (Andeby 5.–16. jan 2026); D09/D10 0,0002 / 1.000 kr., 1.800 s; D11/D12 Andebys egen solver-blok.

| Id | Scenarie | Gammelt, kr. | Nyt, kr. | Δ nyt−gammelt | Gab | Tid |
|---|---|---:|---:|---:|---|---:|
| D01 | reference | 3.446.711,91 | **3.441.004,22** | −5.707,69 | 0 | 11 s |
| D02 | uden tankene | 3.468.627,83 | **3.464.520,18** | −4.107,65 | 0 | 10 s |
| D03 | uden varmepumpen | 3.921.367,11 | **3.917.608,86** | −3.758,25 | 0 | 11 s |
| D04 | gaspris +20 % | 3.714.863,68 | **3.708.013,03** | −6.850,65 | 0 | 11 s |
| D05 | gammel 12 MW elkedel | 3.312.645,86 | **3.302.741,09** | −9.904,77 | 0 | 12 s |
| D06 | med balancemarked | 3.117.644,03 | **3.111.637,94** | −6.006,09 | 0 | 13 s |
| D07 | balancemarked, uden tanke | 3.162.398,25 | **3.155.447,03** | −6.951,22 | 0 | 11 s |
| D08 | balancemarked, kender aktiveringerne | 3.025.300,75 | **3.011.915,11** | −13.385,64 | 0 | 13 s |
| D09 | Billund Spor B med balancemarked | 4.204.128,43 | **4.428.863,74** | +224.735,31 | 0,0015 % | 319 s |
| D10 | Billund Spor B uden balancemarked | 6.433.917,97 | **6.561.709,91** | +127.791,94 | 0,0121 % | 83 s |
| D11 | Andeby helår uden balancemarked | 30.431.535,06 | **30.495.430,90** | +63.895,84 | 0,0209 % | 585 s |
| D12 | Andeby helår med balancemarked | (ikke regnet ved eef950a) | **24.235.821,54** | – | **0,13 %** | 3.693 s |

D12 ramte tidsgrænsen (3.600 s) med gab 0,13 %, over casens 0,1 %: tallet er ikke optimalt inden for casens gab.
Det er aldrig regnet ved `eef950a`; README's 24.188.471 er fra før rettelsen og 23.052.841 fra b49aeb0.

Differenserne (`par`), regnet af ovenstående (gammelt i parentes): P1 tank D02−D01 **+23.515,96** (21.915,92) · P2 varmepumpe D03−D01
**+476.604,64** (474.655,20) · P3 gaspris D04−D01 **+267.008,81** (268.151,77) · P4 gl. elkedel D05−D01 **−138.263,13** (−134.066,05) ·
P5 balancemarked D06−D01 **−329.366,28** (−329.067,88) · P6 tank med balance D07−D06 **+43.809,09** (44.754,23) ·
P7 D08−D06 **−99.722,83** (−92.343,28) · P8 D09−D10 **−2.132.846,18** (−2.229.789,54) · P9 D12−D11 **−6.259.609,36** (ikke regnet).
Fortegnene er som før. Mængdetal (MWh pr. enhed, aFRR/mFRR-indtægt, CO₂) i `vurdering`-teksterne er **ikke** gjort op igen.

## 3. BUDSTRATEGI-kontroltallene (Andeby 5.–16. jan 2026, doc/BUDSTRATEGI.md:332-335)

Afregnet på det realiserede, gab 0. Kolonnen "prognosen lovede" er **ikke** regnet igen.

| Kørsel | Gammelt | Nyt | Δ |
|---|---:|---:|---:|
| (1) uden balance (= D01) | 3.446.712 | **3.441.004** | −5.708 |
| (2) byd frit, kender aktiveringerne (= D08) | 3.025.301 | **3.011.915** | −13.386 |
| (3) byd frit, prognose (`foresight=trailing30`, `settle=realized`) | 3.231.194 | **3.220.386** | −10.808 |
| (4) beregnet budpris, prognose (+ `reservation_gate.enabled=true`) | 3.319.185 | **3.346.957** | +27.772 |

Balancens værdi, (1) minus kørslen: (2) **429.089** (gammelt 421.000) · (3) **220.618** (216.000) · (4) **94.047** (128.000).
Rækkefølgen (2) > (3) > (4) holder. (4) er den eneste, der går op, og balancens værdi falder fra 128.000 til 94.000 kr.:
det har jeg ikke forklaret (se afsnit 6).

## 4. Referencetal og upstreams kontroltal (08_referencetal.md, METODE.md)

| Tal | Kommando (README) | Gammelt | Nyt | Gab | Tid |
|---|---|---:|---:|---|---:|
| Spor A-anker 2. mar–23. jun 2026 | `cases/billund_sporA.yaml --with-balancing` | 5.069.729 | **5.204.555,28** | 0,109 % | 178 s |
| Spor B 2. mar–30. jun 2026 | `cases/billund_sporB.yaml --with-balancing --heat-csv …splejset_jun2026.csv` | 4.204.128 | **4.428.863,74** | 0,152 % | 261 s |
| Billund rullende år jul 2025–jun 2026 | `cases/billund_sporA_rullende.yaml --with-balancing --heat-csv …` | 21.773.827 (ikke genskabt lokalt) | **22.492.900,32** | **2,59 %** | 1.261 s |
| Andeby helår, uden balancering | `cases/andeby.yaml` (= D11) | 30.431.535 | **30.495.430,90** | 0,0209 % | 585 s |
| Andeby helår, med balancering | `cases/andeby.yaml --with-balancing` (= D12) | 24.188.471 | **24.235.821,54** | 0,13 % | 3.693 s |
| Billund i dag, kun spot | `cases/billund_idag.yaml --heat-csv …` | – | **26.777.743,45** | 0,0117 % | 542 s |
| Billund i dag, faktisk marked | `cases/billund_idag.yaml --with-balancing --heat-csv …` | – | **11.378.358,87** | 0,0057 % | 1.708 s |

**Mod upstreams tre kontroltal** (`CLAUDE.md` i modelrepoet ved 90fb16e): Andeby kun spot 30.495.431 ✔ (30.495.430,90) ·
Billund i dag kun spot 26.777.743 ✔ (26.777.743,45) · Billund i dag faktisk marked 11.378.359 ✔ (11.378.358,87). Alle tre til kronen.
Egen antagelse: upstream skriver ikke, hvilken varmelastfil der er brugt; jeg brugte `billund_abvaerk_hourly_splejset_jun2026.csv`
til begge Billund-kørsler (casens kommentar bruger den), og tallene rammer.

Spor B og D09 giver samme objektiv (4.428.863,74) ved forskelligt gab: samme optimum.

## 5. Kontrol: vindue før 1. oktober 2025

Et vindue før 1. oktober 2025 må ikke flytte sig. Andeby 4.–5. aug 2025, uden balancemarked, kørt ved begge pins:
`eef950a` **7.688,88 kr.** = `90fb16e` **7.688,88 kr.** (gab 0). Identisk, som det skal. Alle andre målte vinduer ligger efter
1. oktober 2025 og kan ikke selv vise dette.

## 6. Ikke regnet igen, og afvigelser

- **Mængdetal i `vurdering`-felterne** (MWh, aFRR/mFRR-indtægter, CO₂, brutto/netto, tankens første interval): ikke gjort op igen. Kun objektiv og differenser er målt.
- **BUDSTRATEGI-kolonnen "Prognosen lovede"** (2.932.972 og 3.303.953): ikke regnet igen.
- **Billund-firkanten og Andeby §9 i METODE.md** (rapport v4, fx 5.002.707 og 4.175.596): kommer fra rapporten, ikke fra appens kæde, og er ikke regnet igen. De er fra før begge rettelser.
- **Billund rullende år**: løseren stoppede med gab 2,59 %, så 22.492.900 er en øvre grænse og nedre grænse ca. 21.910.000 (22.492.900,32 × (1 − 0,0259) = 21.910.334; gabet er afrundet, ±1.100 kr.). Det gamle README-tal 21.773.827 ligger **under** intervallet, mindst ca. 135.000 kr. (rettet 14/11 efter Codex-review; første udgave sagde fejlagtigt, at det lå i intervallet). Ikke et optimum og ikke et referencetal.
- **D12 / Andeby helår med balancering**: ramte tidsgrænsen (gab 0,13 %). En stor maskine kan måske nå optimum; ikke prøvet.
- **Afvigelser, jeg ikke kan forklare med spotrettelsen**: ingen i referencetal, de tre upstream-kontroltal eller kontrollen før 1. oktober. Uforklaret er kun,
  at BUDSTRATEGI (4) går op (+27.772 kr.), hvor (1)–(3) går ned. Mønstret ellers: Andeby-vinter falder 4–13.000 kr. pr. kørsel, Billund marts–juni og
  Andeby helår stiger (+64.000 til +225.000 kr.); årsagen er ikke målt.
- Intet i dokumenter, demo-json eller kode er rettet.
