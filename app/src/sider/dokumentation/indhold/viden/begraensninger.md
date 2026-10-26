# Hvad modellen ikke kan — og hvad det betyder for tallene

| Begrænsning | Betydning for tallene |
|---|---|
| **Den kender fremtiden.** Hele periodens spot, vejr og balancepriser er kendt på forhånd. | Absolutte tal er for gode, mest for balancemarkedet. Differenser er mere robuste. |
| **Gasmotorernes balanceindtægt er ikke med.** | Modellens balancetal er ikke værkets samlede. Hos Billund var motorerne 29 % af balanceindtægten i marts–juni 2026. |
| **Nedregulering er ikke med.** | Billund fik netto 0,07 mio. kr. derfra i samme periode. |
| **Spor B forudsiger ikke.** | Det er kalibreret på ét værk i én periode med værkets egen reservation som input. |
| **mFRR-kapacitet overvurderes med ca. 30–40 %.** | Modellen samler reservationen i få dyre timer, fordi kapacitetsprisen er kendt. |
| **Pris-tager.** Værkets bud antages ikke at flytte prisen. | Holder for en lille reservation; ikke for et værk, der byder fuld prækvalifikation hver time (17,52 MW = 18 % af den indkøbte aFRR i DK1). |
| **Fast temperaturdifferens og ingen kobling fra enhed til lager.** | Fremløb og retur påvirker ikke tankens kapacitet; en varmepumpe kan i modellen lade et lag, den i praksis ikke kan nå. |
| **Faste afgiftssatser i hele perioden.** | Et vindue over to afgiftsår regnes med ét års satser. |
| **Timefilen mangler første time.** | Modellens timefil viser én time færre end perioden; objektivet og nøgletallene medregner den. Kørsler regnet før modelversion eef950a (19. oktober 2026) havde desuden en ubundet lagerbalance i første time — på et 12-døgns vindue ca. halvdelen af tankens værdi. Sammenlign kun kørsler ved samme modelversion. |
| **Aktiveringsandelen er kalibreret på marts–juni 2026.** | Skal testes igen med vinterdata 2026/27, før den bruges på en anden periode. |
| **Kun timeopløsning (1h) i denne version.** Modellen kan regne i kvarterer, men dens kroneled ganger ikke med intervallets længde. | Ved 15 min ville hvert kvarter tælle som en hel time i el-, brændsels- og kapacitetsleddene, mens startomkostninger tælles pr. start — tallet er da ikke kroner. Appen afviser derfor andet end 1h. |
| **Løsetid.** | Et helt år med balancemarked tog 17 minutter og ca. 3,5 GB på en pc med 24 kerner; på få kerner tager det væsentligt længere og kan ramme tidsgrænsen. Regn helår på forhånd. |

Kilder: src/model.py:432-434; src/balancing.py:342; KONTRAKT §6c; README.md:53-62; rapport v4 §7; rapport v4 §5.4; rapport v4, bilag A; rapport v4 §5.3;
cases/andeby.yaml:75-80; cases/andeby.yaml:412-415; src/reporting.py:314-338; src/model.py:267-271; README.md:186-190.

**Grundreglen:** et modeltal gælder for en periode, under nogle antagelser, med en metode. Skifter
en af de tre, skifter tallet. Modellen producerer altid et tal — det er fagpersonen, der skal sige
"det kan ikke passe". (Kilde: README.md:159-160; rapport v4 §6)
