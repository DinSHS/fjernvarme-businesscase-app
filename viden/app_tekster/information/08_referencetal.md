# Referencetal

Modelrepoets tabel er kørt 19. oktober 2026 med df-data fra 5. oktober 2026 eller senere, efter to
rettelser samme dag: tankens niveau i første time følger nu lagerbalancen, og en aktiveret MWh
værdisættes som aktiveringsprisen plus sparet tarif og elafgift, uden spotprisen. Beløbet er
modellens samlede driftsomkostning (objektiv) for vinduet. (Kilde: README.md:173-181)

**Fire af tabellens fem tal er fra før spotrettelsen.** Fra 3. november 2026 (modelversion 5021a5e;
appens versioner 90fb16e og 939228a) regner modellen spotprisen som middel af timens fire
kvarterer; før tog den kun timens første kvarter. Det ændrer alle kørsler, der omfatter perioden fra
1. oktober 2025, også vinduerne nedenfor. Spor A-ankeret er regnet igen 18. november 2026 efter
rettelsen: 5.204.555 kr., før 5.069.729 kr. De fire øvrige tal i README-tabellen, tallene i `doc/`
og rapport v4 er endnu regnet før ændringen og opdateres senere; en afvigelse fra dem er derfor
ikke en fejl. (Kilde: README.md:20-27; README.md:195)

| Case | Vindue | README, kr. | Regnet ved 939228a, kr. | Gab | Løsetid (README) |
|---|---|---:|---:|---:|---|
| Spor A-anker (Billund) | 2. marts–23. juni 2026 | 5.204.555 ³ | 5.204.555 | 0,109 % | 2–3 min (2 kerner) |
| Spor B (Billund) | 2. marts–30. juni 2026 | 4.204.128 (før spotrettelsen) | 4.428.864 | 0,152 % | 2–3 min (2 kerner) |
| Billund rullende år | jul 2025–jun 2026 | 21.773.827 (før spotrettelsen) | intet optimum ¹ | 2,59 % | ca. 8 min (2 kerner) |
| Andeby helår, med balancering | jul 2025–jun 2026 | 24.188.471 (før spotrettelsen) | intet optimum ² | 0,13 % | 17 min (24 kerner), ca. 3,5 GB |
| Andeby helår, uden balancering | jul 2025–jun 2026 | 30.431.535 (før spotrettelsen) | 30.495.431 | 0,0209 % | 1 min (24 kerner) |

¹ Løseren ramte kodens tidsgrænse på 600 s med gab 2,59 %: optimum ligger mellem ca.
21.910.000 kr. (nedre grænse) og 22.492.900 kr. (løsningen), altså mindst ca. 135.000 kr. over
README-tallet. Tallet er ikke et optimum og ikke et referencetal. Samme tal ved 90fb16e; ved eef950a
ramte samme kørsel også tidsgrænsen (gab 2,03 %). (Kilde: referencetal.json › readme ›
billund_rullende)

² Regnet ved 90fb16e (14. november 2026) og ikke regnet igen ved 939228a: løseren ramte
tidsgrænsen 3.600 s med gab 0,13 %, over casens 0,1 %, så løsningen 24.235.822 kr. er en øvre
grænse, ikke optimal inden for casens gab. (Kilde: referencetal.json › readme ›
andeby_helaar_bal › regnet_igen)

³ README's tal efter spotrettelsen (regnet 18. november 2026 på modelversion 3cf753a). Appens kæde
gav 5.204.555,28 kr. ved både 90fb16e og 939228a. (Kilde: README.md:195; referencetal.json ›
readme › spora_anker)

"Regnet ved 939228a" er kørt 23. november 2026 med df-data 106b9fc på 8 kerner gennem appens kæde
(som `fabric/koer_minne.py`) med README's kommando og casens eget gab; Andeby uden balancering som
demo-kørslen D11. Hvert tal er det samme som ved 90fb16e (14. november 2026) til øren: modelrepoets
versioner 0.10.0 og 0.11.0 flytter ingen tal. Ved eef950a genskabte samme vej README's daværende tal
for Spor A, Spor B og Andeby uden balancering til kronen. (Kilde: referencetal.json › regnet_igen;
demo_scenarier.json › koersel_status)

**Modelrepoets kontroltal efter rettelsen**: Spor A-anker med balancering 5.204.555 kr. (2. marts–23.
juni 2026) og for juli 2025–juni 2026 Andeby kun spot 30.495.431 kr., Billund i dag kun spot
26.777.743 kr. og Billund i dag faktisk marked 11.378.359 kr. Appens kæde ramte Spor A og Andeby til
kronen ved 939228a (gab 0,109 % og 0,0209 %). De to Billund i dag-tal ramte den til kronen ved
90fb16e (gab 0,0117 % og 0,0057 %); de er ikke regnet igen ved 939228a. Billund i dag er regnet
med `billund_abvaerk_hourly_splejset_jun2026.csv` — *egen antagelse*: modelrepoet skriver ikke,
hvilken varmelastfil kontroltallene bruger. (Kilde: CLAUDE.md:30-39 i modelrepoet ved 939228a)

**Tal fra før 19. oktober 2026 kan ikke sammenlignes** med tabellen; balancetallene i rapport v4 er
regnet før rettelserne og er for høje (README.md:203-206). Appen måler kun en kørsel mod et
README-tal, når den er regnet ved en modelversion, tallet selv er regnet ved: Spor A-ankeret ved
90fb16e eller 939228a, de fire øvrige ved eef950a. En kørsel ved en anden version står i
sammenligningen nedenfor med status kørt ved en anden modelversion, med link til kørslen, men uden
afvigelse og tolerance: tallene kan ikke sammenlignes. (Kilde: referencetal.json › readme ›
spora_anker › regnet_ved)

**Hvilken kørsel måles mod et README-tal?** Kun en kørsel af README's eget grundlag: den er
bestilt med referencens periode, balancering, varmelast og metode og uden ændringer i scenariet,
værket er modelrepoets case uændret, og kørslens df-data er en version, hvis dato er målt til at
opfylde README's datakrav. Appen læser det af det, der blev frosset for kørslen ved bestillingen —
ikke af scenariet, som det ser ud nu. Er værket rettet eller kopieret, eller kendes df-data ikke,
står kørslen som *kørt på et andet grundlag* uden afvigelse: en forskel ville måle grundlaget, ikke
modellen. Reglen er den samme som for mærket *README-reference* i Analysers kørselsliste — *egen
antagelse* (appens regel for, hvornår to tal må holdes op mod hinanden; README stiller ingen).
(Kilde: referencetal.json › datakrav; doc/TROFASTHED.md §5)

**Hvor tæt skal en ny kørsel ramme?** Inden for casens eget gab: for Billund-casene 0,5 % (ca.
26.000 kr. på Spor A's README-tal), for Andeby 0,1 %. Kørsler, der rammer tidsgrænsen, kan lande længere væk.
(Kilde: doc/KOERSEL.md:64-66; cases/andeby.yaml:142-145)

**Andeby er fiktiv**: tallene viser potentialet ved fuld tilgængelighed, ikke hvad et værk vil
tjene. Andeby fik 8. oktober 2026 en solprofil fra målt DMI-globalstråling; ældre Andeby-tal kan
ikke sammenlignes. (Kilde: README.md:205-212)
