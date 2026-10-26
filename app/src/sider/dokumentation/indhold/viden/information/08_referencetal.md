# Referencetal

Kørt 19. oktober 2026 med df-data fra 5. oktober 2026 eller senere, efter to rettelser samme dag:
tankens niveau i første time følger nu lagerbalancen, og en aktiveret MWh værdisættes som
aktiveringsprisen plus sparet tarif og elafgift, uden spotprisen. Beløbet er modellens samlede
driftsomkostning (objektiv) for vinduet. (Kilde: README.md:164-172)

| Case | Vindue | Objektiv, kr. (README) | Genskabt lokalt 26/10, kr. | Løsetid (README) |
|---|---|---:|---:|---|
| Spor A-anker (Billund) | 2. marts–23. juni 2026 | 5.069.729 | 5.069.729 | 2–3 min (2 kerner) |
| Spor B (Billund) | 2. marts–30. juni 2026 | 4.204.128 | 4.204.128 | 2–3 min (2 kerner) |
| Billund rullende år | jul 2025–jun 2026 | 21.773.827 | ikke genskabt ¹ | ca. 8 min (2 kerner) |
| Andeby helår, med balancering | jul 2025–jun 2026 | 24.188.471 | ikke regnet | 17 min (24 kerner), ca. 3,5 GB |
| Andeby helår, uden balancering | jul 2025–jun 2026 | 30.431.535 | 30.431.535 | 1 min (24 kerner) |

¹ Lokalt (8 kerner, delt maskine) ramte løseren kodens tidsgrænse på 600 s med gab 2,03 %: løsning 22.159.684 kr., nedre grænse 21.708.371 kr. README-tallet ligger i det interval, men er ikke genskabt her.

(Kilde: README.md:174-190.) "Genskabt lokalt" er kørt ved modelversion eef950a med df-data 106b9fc på 8
kerner: Spor A, Spor B og det rullende år med README's egen kommando, Andeby uden balancering som
demo-kørslen D11 gennem appens motor med casens egen solver-blok; se rapporter/fv-model.md.

I README's kørsler er alle fem optimale inden for casens gab. **Tal fra før 19. oktober 2026 kan ikke sammenlignes** med
tallene ovenfor; balancetallene i rapport v4 er regnet før rettelserne og er for høje. Appen
sammenligner derfor kun kørsler regnet ved samme modelversion som tallene. (Kilde: README.md:184;
README.md:192-195)

**Hvor tæt skal en ny kørsel ramme?** Inden for casens eget gab: for Billund-casene 0,5 % (ca.
25.300 kr. på Spor A), for Andeby 0,1 %. Kørsler, der rammer tidsgrænsen, kan lande længere væk.
(Kilde: doc/KOERSEL.md:64-66; cases/andeby.yaml:142-145)

**Andeby er fiktiv**: tallene viser potentialet ved fuld tilgængelighed, ikke hvad et værk vil
tjene. Andeby fik 8. oktober 2026 en solprofil fra målt DMI-globalstråling; ældre Andeby-tal kan
ikke sammenlignes. (Kilde: README.md:194-201)
