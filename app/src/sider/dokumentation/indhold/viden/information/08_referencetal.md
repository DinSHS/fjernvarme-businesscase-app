# Referencetal

Modelrepoets tabel er kørt 19. oktober 2026 med df-data fra 5. oktober 2026 eller senere, efter to
rettelser samme dag: tankens niveau i første time følger nu lagerbalancen, og en aktiveret MWh
værdisættes som aktiveringsprisen plus sparet tarif og elafgift, uden spotprisen. Beløbet er
modellens samlede driftsomkostning (objektiv) for vinduet. (Kilde: README.md:173-181)

**Tabellens tal er fra før spotrettelsen.** Fra 3. november 2026 (modelversion 5021a5e; appens
version 90fb16e) regner modellen spotprisen som middel af timens fire kvarterer; før tog den kun
timens første kvarter. Det ændrer alle kørsler, der omfatter perioden fra 1. oktober 2025, også
vinduerne nedenfor. Modelrepoets README-tabel, tallene i `doc/` og rapport v4 er endnu regnet før
ændringen og opdateres senere; en afvigelse fra dem er derfor ikke en fejl. (Kilde: README.md:20-27)

| Case | Vindue | README, kr. (før spotrettelsen) | Regnet ved 90fb16e, kr. | Gab | Løsetid (README) |
|---|---|---:|---:|---:|---|
| Spor A-anker (Billund) | 2. marts–23. juni 2026 | 5.069.729 | 5.204.555 | 0,109 % | 2–3 min (2 kerner) |
| Spor B (Billund) | 2. marts–30. juni 2026 | 4.204.128 | 4.428.864 | 0,152 % | 2–3 min (2 kerner) |
| Billund rullende år | jul 2025–jun 2026 | 21.773.827 | intet optimum ¹ | 2,59 % | ca. 8 min (2 kerner) |
| Andeby helår, med balancering | jul 2025–jun 2026 | 24.188.471 | intet optimum ² | 0,13 % | 17 min (24 kerner), ca. 3,5 GB |
| Andeby helår, uden balancering | jul 2025–jun 2026 | 30.431.535 | 30.495.431 | 0,0209 % | 1 min (24 kerner) |

¹ Løseren ramte kodens tidsgrænse på 600 s med gab 2,59 %: optimum ved 90fb16e ligger mellem ca.
21.910.000 kr. (nedre grænse) og 22.492.900 kr. (løsningen), altså mindst ca. 135.000 kr. over
README-tallet. Tallet er ikke et optimum og ikke et referencetal. Ved eef950a ramte samme kørsel også tidsgrænsen (gab 2,03 %). (Kilde:
referencetal.json › readme › billund_rullende)

² Løseren ramte tidsgrænsen 3.600 s med gab 0,13 %, over casens 0,1 %: løsningen 24.235.822 kr.
er en øvre grænse, ikke optimal inden for casens gab. (Kilde: referencetal.json › readme ›
andeby_helaar_bal › regnet_igen)

"Regnet ved 90fb16e" er kørt 14. november 2026 med df-data 106b9fc på 8 kerner gennem appens kæde
(som `fabric/koer_minne.py`) med README's kommando og casens eget gab; Andeby som demo-kørslerne
D11 og D12. Ved den forrige version, eef950a, genskabte samme vej README-tallene for Spor A, Spor B
og Andeby uden balancering til kronen. (Kilde: referencetal.json › regnet_igen;
demo_scenarier.json › koersel_status)

**Modelrepoets kontroltal efter rettelsen** (juli 2025–juni 2026): Andeby kun spot 30.495.431 kr.,
Billund i dag kun spot 26.777.743 kr., Billund i dag faktisk marked 11.378.359 kr. Appens kæde
ramte alle tre til kronen ved 90fb16e (gab 0,0209 %, 0,0117 % og 0,0057 %). Billund i dag er regnet
med `billund_abvaerk_hourly_splejset_jun2026.csv` — *egen antagelse*: modelrepoet skriver ikke,
hvilken varmelastfil kontroltallene bruger. (Kilde: CLAUDE.md:30-38 i modelrepoet ved 90fb16e)

**Tal fra før 19. oktober 2026 kan ikke sammenlignes** med tabellen; balancetallene i rapport v4 er
regnet før rettelserne og er for høje (README.md:201-204). Appen måler kun kørsler regnet ved samme
modelversion som README-tallene (eef950a-koden) mod tallene. En kørsel ved 90fb16e står i
sammenligningen nedenfor med status kørt ved en anden modelversion, med link til kørslen, men uden
afvigelse og tolerance: tallene kan ikke sammenlignes.

**Hvor tæt skal en ny kørsel ramme?** Inden for casens eget gab: for Billund-casene 0,5 % (ca.
25.300 kr. på Spor A's README-tal), for Andeby 0,1 %. Kørsler, der rammer tidsgrænsen, kan lande længere væk.
(Kilde: doc/KOERSEL.md:64-66; cases/andeby.yaml:142-145)

**Andeby er fiktiv**: tallene viser potentialet ved fuld tilgængelighed, ikke hvad et værk vil
tjene. Andeby fik 8. oktober 2026 en solprofil fra målt DMI-globalstråling; ældre Andeby-tal kan
ikke sammenlignes. (Kilde: README.md:203-210)
