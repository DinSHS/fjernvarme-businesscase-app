# Balancemarkedet: aFRR og mFRR

**Hvad sælges?** En varmepumpe eller elkedel, der kører, kan tilbyde at *stoppe* sit elforbrug, hvis
Energinet kalder den — op-regulering fra forbrugssiden. Kun enheder med el som brændsel byder.
Nedregulering og gasmotorernes balanceindtægt er ikke med. (Kilde: doc/BALANCEMARKED.md:3-12)

| Indtægt | Hvad betales der for | Hvornår afgøres det |
|---|---|---|
| Kapacitet | at holde effekten klar i en given time | auktion dagen før |
| Aktivering | den energi, der faktisk reguleres | i driftsdøgnet, når Energinet har brug for den |

(Kilde: doc/BUDSTRATEGI.md:27-34)

**aFRR** er automatisk og hurtig, **mFRR** manuel. Samme MW kan bydes i begge, men summen må ikke
overstige, hvad enheden kan levere. (Kilde: doc/BUDSTRATEGI.md:34)

## Det fysiske krav: footroom

For at kunne stoppe 5 MW elforbrug skal enheden *bruge* mindst 5 MW i den time. Et vundet bud
tvinger altså enheden til at køre, og varmen skal afsættes i nettet eller i tanken. Her får tanken
betydning for balancemarkedet. (Kilde: doc/BUDSTRATEGI.md:36)

**Robust reservation** (standard): driften skal også holde, hvis buddet *ikke* aktiveres. Sådan
planlægger værkerne i dag. (Kilde: doc/BUDSTRATEGI.md:88-97)

## Hvad begrænser buddet?

Det strammeste af: enhedens største eloptag, prækvalifikationen pr. enhed og samlet, værkets egen
fordeling mellem markederne, budvinduer (fx ingen elkedel om sommeren), idriftsættelsesdato,
nettilslutningen og eventuelt et månedsloft. (Kilde: doc/BUDSTRATEGI.md:60-70; doc/BALANCEMARKED.md:19-43)

## Hvor meget aktiveres?

At buddet ligger i merit, er ikke det samme som at blive kaldt. `clear` regner hele buddet
aktiveret og gav 4–5 gange for meget aktiveret energi mod Billunds afregning. `system_share`
følger systemets faktiske aktivering (aFRR: k = 4). (Kilde: doc/BALANCEMARKED.md:79-89; doc/BUDSTRATEGI.md:125-129)

## Krav til perioden

Perioden skal ligge efter ca. april 2025 (PICASSO). Ubalance- og mFRR-aktiveringsdata begynder 4.
marts 2025. (Kilde: doc/BALANCEMARKED.md:14-15; cases/andeby.yaml:97-101)

## Markedet skiftede

Billund tjente 13,8 mio. kr. på forbrugssidens op-regulering i 2. halvår 2025 og 3,2 mio. kr. i
marts–juni 2026. aFRR-kapacitetsprisen faldt fra 407 kr./MW/t i juli 2025 til under 100 i maj–juni
2026, og mFRR blev det største marked. Tal fra 2025 kan ikke bruges om 2026. (Kilde: rapport v4 §5.3)
