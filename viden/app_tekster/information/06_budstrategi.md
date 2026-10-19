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
| Uden balance | – | 3.424.408 kr. | – |
| Byd frit, kender aktiveringerne | – | 2.869.989 kr. | 554.000 kr. |
| Byd frit, prognose | 2.720.352 kr. | 3.163.413 kr. | 261.000 kr. |
| Beregnet budpris, prognose | 3.247.444 kr. | 3.268.332 kr. | 156.000 kr. |

(Kilde: doc/BUDSTRATEGI.md:245-252)

Den første er et loft, ingen kan nå. Den anden lover mest, men skuffer mest: modellen kører
elkedlen for at fange aktiveringer, der ikke kommer. Den sidste lover mindre, men holder.
(Kilde: doc/BUDSTRATEGI.md:254)

## Advarselstegn

- **Negativ årsomkostning** betyder næsten altid, at modellen kender aktiveringerne eller regner
  hele buddet aktiveret hver gang.
- **Elkedlen kører fuldt i timer med lav varmelast og høj spotpris**: modellen byder efter
  prisspidser, den ikke kunne kende.
- **Ligger modellen langt over jeres afregning**, er det oftest mængden, ikke prisen, der er forkert.

(Kilde: doc/BUDSTRATEGI.md:267-273)
