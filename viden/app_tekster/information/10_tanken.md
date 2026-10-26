# Akkumuleringstanken

Tanken tjener på **døgnets prisspænd**: den køber el i de billige timer og lægger varmen til side til
de dyre. Derfor mættes værdien hurtigt — at flytte et døgns produktion kræver langt mindre end en
stor tank. (Kilde: rapport v4 §4.3)

Hos Billund (rullende år, kun spot):

| Tankvolumen | Værdi mod ingen tank | Andel af 14.000 m³ |
|---|---:|---:|
| 4.000 m³ | 4.149.959 kr. | 83 % |
| 8.000 m³ | 4.655.455 kr. | 93 % |
| 14.000 m³ | 5.002.707 kr. | 100 % |

(Kilde: rapport v4 §4.3, tabel 4.3)

**Tankens værdi afhænger af brændselspriserne** på de enheder, den konkurrerer med: med 25 % højere
halm- og flispris blev tanken ca. 18 % mere værd. (Kilde: rapport v4 §4.4)

**En tank kan skjule en urealistisk antagelse.** Med flis- og halmkedlen tændt 1. juli gik det med
tank, men uden tank var sommeren uløselig: minimumslasten gav mere varme, end nettet aftog. Det ses
først, når tanken fjernes. (Kilde: rapport v4 §4.4)

**Kapacitet** regnes af volumen og temperaturdifferens: ca. 1,163 kWh pr. m³ pr. grad. Har værket
lag ved forskellige temperaturer, så skriv ét lager pr. lag. (Kilde: src/config.py:571-575; cases/andeby.yaml:407-415)

**Første time er rettet.** Indtil modelversion eef950a (19. oktober 2026) var lagerbalancen ikke
bundet i periodens første time, så tanken fik gratis varme dér: i Andeby 5.–16. januar 2026 omkring
halvdelen af tankværdien på 44.220 kr. Fra eef950a gælder balancen også i første time. Kørsler regnet
før har stadig fejlen; sammenlign kun kørsler ved samme modelversion. (Kilde: src/model.py:267-271;
tests/test_lager_foerste_time.py; demo_scenarier.json)
