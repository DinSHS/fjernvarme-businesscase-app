# Budstrategi — det vigtigste valg bag et balancetal

På samme værk, samme år og samme data kan modellen give alt fra få millioner til mere end hele
værkets varmeomkostning. Forskellen ligger ikke i markedet, men i tre antagelser:
(Kilde: doc/BUDSTRATEGI.md:9-19)

1. **Hvornår byder værket**, og til hvilken pris (kapacitetsprisgaten: fast pris, beregnet pris eller ingen).
2. **Hvor meget byder det ind** (fast blok, op til en blok, eller alt hvad fysikken tillader).
3. **Hvad ved værket, når det byder** (kender aktiveringerne, eller en prognose).

Et balancetal skal altid stå sammen med den budstrategi, det er regnet med.

## Prøvet på Andebys vintervindue (5.–16. januar 2026)

| Kørsel | Prognosen lovede | Afregnet | Balancens værdi |
|---|---:|---:|---:|
| Uden balance | – | 3.446.712 kr. | – |
| Byd frit, kender aktiveringerne | – | 3.025.301 kr. | 421.000 kr. |
| Byd frit, prognose | 2.932.972 kr. | 3.231.194 kr. | 216.000 kr. |
| Beregnet budpris, prognose | 3.303.953 kr. | 3.319.185 kr. | 128.000 kr. |

Regnet ved modelversion eef950a, efter rettelserne 19. oktober 2026 (tankens første time og
aktiveringsværdien uden spotpris); genskabt til kronen 26. oktober 2026 med df-data 106b9fc. Tal fra
før rettelserne kan ikke sammenlignes. (Kilde: doc/BUDSTRATEGI.md:328-335)

Den første er et loft, ingen kan nå. Den anden lover mest, men skuffer mest: modellen kører
elkedlen for at fange aktiveringer, der ikke kommer. Den sidste lover mindre, men holder.
(Kilde: doc/BUDSTRATEGI.md:337)

## Advarselstegn

- **Negativ årsomkostning** betyder næsten altid, at modellen kender aktiveringerne eller regner
  hele buddet aktiveret hver gang.
- **Elkedlen kører fuldt i timer med lav varmelast og høj spotpris**: modellen byder efter
  prisspidser, den ikke kunne kende.
- **Ligger modellen langt over jeres afregning**, er det oftest mængden, ikke prisen, der er forkert.

(Kilde: doc/BUDSTRATEGI.md:350-356)
