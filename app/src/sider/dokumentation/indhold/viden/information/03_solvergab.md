# Solvergab

Solveren stopper, når den har *bevist*, at løsningen ligger tæt nok på den bedst mulige. "Tæt nok"
er gabet. (Kilde: doc/KOERSEL.md:49-53)

| Brug | Gab | Hvorfor |
|---|---|---|
| Absolutte tal | 0,5 % (kodens standard) | lille mod usikkerheden i antagelserne |
| Differenser | 0,0002 = 0,02 % | et scenarie kan flytte 2.000–14.000 kr., mens 0,5 % af 5 mio. kr. er ca. 26.000 kr. |

(Kilde: doc/KOERSEL.md:55-60)

Med det løse gab kan en differens drukne i solverens egen tolerance, og **fortegnet kan vende**:
målt på Spor A gjorde en ekstra 30 MW elkedel driften 1.262 kr. dyrere — umuligt.
(Kilde: cases/andeby.yaml:122-126)

**Både det relative og det absolutte gab tæller.** Solveren stopper ved det første, der nås.
Uden egen solver-blok i værket er det absolutte gab 5.000 kr.; så binder det før 0,02 % på
ethvert objektiv under 25 mio. kr. Sæt derfor også det absolutte gab ned — rapport v4 brugte
højst 0,1 % eller 1.000 kr. (Kilde: src/config.py:713-714; src/config.py:742-751; rapport v4 §2.3)

Målt 16. oktober 2026 på Spor A, marts 2026 med balancering, ønsket gab 0,0002: med standardens absolutte gab på 5.000 kr. stoppede solveren ved 0,068 % (HiGHS angav selv 'tolerance: 0.22%') efter 52 s; med absolut gab 1 kr. ved 0,019 % efter 124 s. Objektivet blev det samme (2.273.504 kr.), men usikkerheden faldt fra ca. 1.550 til ca. 430 kr. (Kilde: egen måling (appens udvikling, 16.10.2026 ved b49aeb0; står ikke i modelrepoet))

**Ønsket og opnået gab er to ting.** Scenariet angiver det ønskede gab. Det opnåede står i
solverens log; rammer kørslen tidsgrænsen, kan det være større end ønsket. Andeby helår med
balancering stoppede ved 0,12 % mod målet 0,1 %. (Kilde: README.md:146; doc/KOERSEL.md:170-171)

Strammere gab koster tid. På Andebys helår gav 0,5 % svaret på 64 sekunder, 0,1 % på 415 og
0,02 % på 747 sekunder — og 0,1 % og 0,02 % gav samme objektiv. (Kilde: cases/andeby.yaml:127-137)
