# Arkitektur — hvem gør hvad

**Modellen regner aldrig i browseren.** Appen er et vindue ind i en database: du ser og retter værker og
scenarier og bestiller en kørsel. Selve optimeringen sker i en Python-notebook i Microsoft Fabric, som
skriver resultaterne tilbage til databasen, hvor appen læser dem. (Kilde: KONTRAKT §1)

## De fem dele

| Del | Hvad den gør | Hvem må skrive |
|---|---|---|
| **Appen** (browseren, en Fabric App) | Viser værker, scenarier, kørsler og resultater. Opretter scenarier, bestillinger og ændringsanmodninger. | Kun sine egne scenarier, bestillinger og anmodninger |
| **App-databasen** (Fabric SQL-database) | Gemmer værker og deres parametre, revisionsspor, scenarier, kørsler og resultater. | Appen og de betroede dele nedenfor, hver med sit område |
| **Functions** (kører som appens ejer) | Udfører ændringer af et værk i én transaktion, fryser input til en kørsel og starter notebooken. | Værker, parametre, log, kørsler |
| **Notebooken** `fjv_koer_scenarie` | Tager kørslerne i kø én ad gangen, kører modellen med HiGHS og skriver resultater. | Kørsler og resultater |
| **Lakehouset** `fjv_lakehouse` | Modelkoden, datakopien fra df-data og rå uddata fra hver kørsel. | Notebooken |

(Kilde: KONTRAKT §1; KONTRAKT §3.0; KONTRAKT §4)

## Hvad sker der, når du trykker Kør

1. Appen opretter en **bestilling** i databasen. Bestillingen bærer din identitet, som databasens regler kontrollerer — ikke en e-mail, du selv kan skrive.
2. En Function tjekker grænserne: højst 3 ventende bestillinger pr. bruger, en periode på højst 366 døgn og en tidsgrænse på højst 3.600 sekunder. Gentager du et klik, giver det den samme bestilling.
3. Functionen **fryser input**: alle værdier, der gælder lige nu, kopieres til kørslen sammen med en kontrolsum. Retter nogen værket bagefter, påvirker det ikke din kørsel.
4. Kørslen står nu som *i kø*. Er der ingen arbejder i gang, starter Functionen notebooken gennem Fabrics jobs-API.
5. Notebooken overtager den ældste kørsel i køen, kontrollerer kontrolsummen, bygger casen af det frosne input og kører modellen. Mens HiGHS løser, melder den hvert minut, at den stadig lever.
6. Resultaterne — nøgletal, måneder og time-for-time dispatch — skrives i **én transaktion**; først derefter bliver kørslen *færdig*. En afbrudt skrivning kan gentages uden dubletter.
7. Appen viser resultatet. Mens du selv har en kørsel i gang og fanen er åben, spørger den efter status højst hvert 20. sekund.

(Kilde: KONTRAKT §3.0; KONTRAKT §3.7; KONTRAKT §5.3; KONTRAKT §6)

## Én kørsel ad gangen

Der kører højst én solver ad gangen; de øvrige venter i kø i bestillingsrækkefølge. Det er et bevidst
valg: en optimering er tung, og to samtidige kørsler ville konkurrere om den samme kapacitet.
Statussen går *i kø → startet → kører → indlæser → færdig* — eller *fejl* med en forklaring eller
*annulleret*. Status går kun fremad. (Kilde: KONTRAKT §6)

Annullerer du en kørsel, der allerede regner, sætter appen en anmodning; notebooken stopper selv solveren,
og først det er bekræftelsen. Der publiceres aldrig noget efter en annullering. (Kilde: KONTRAKT §6b)

## Hvorfor sådan?

- **Reproducerbarhed.** Hver kørsel gemmer det frosne input, kontrolsummen og de fulde versionsnumre på modelkoden og datakopien. Du kan altid se, hvad et tal blev regnet af. (Kilde: KONTRAKT §3.6)
- **Ingen tavs overskrivning.** To personer kan ikke overskrive hinandens ændringer af et værk: ændringen afvises, hvis værket er rettet siden, du åbnede det. (Kilde: KONTRAKT §3.3b)
- **Lav kapacitetsudgift.** Appens database koster kapacitet, så længe den er vågen. Derfor er der ingen baggrundsopdatering. (Kilde: KONTRAKT §6)
- **Værksdata forlader aldrig Fabric.** Modelkoden er åben; dit værks tal ligger kun i appens database og lakehouset. (Kilde: KONTRAKT §2)

## Hvor kører det?

I Fabric-workspacet **dit Fabric-workspace**, på prøvekapaciteten FTL64 Trial (startet 8. oktober 2026, udløber
omkring 7. december 2026). Se *Information → Datadækning og driftsforhold* for, hvad udløbet betyder.
(Kilde: KONTRAKT §2)
