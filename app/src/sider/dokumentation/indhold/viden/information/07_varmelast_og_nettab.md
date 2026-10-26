# Varmelast og nettab

**Målt varmelast er det sikreste**: timeværdier ab værk. Sådan kører Billund-værkerne.
(Kilde: doc/VARMELAST_OG_NETTAB.md:41-44)

**Uden måling syntetiseres varmelasten** af DMI-temperaturen: en grundlast pr. time på døgnet
(brugsvand og konstant nettab) plus rumvarme, der stiger under en referencetemperatur og følger et
glidende gennemsnit af udetemperaturen, plus et nettabsled. Weekenden sænkes en smule.
(Kilde: src/data_loader.py:632-661) Andeby bruger syntesen, skaleret fra Billund til ca. 100 GWh om
året. (Kilde: cases/andeby.yaml:148-151)

**Klimaområdet** vælges blandt fyn, vestkyst, karup og ringsted. Valget alene kan flytte objektivet
op til ca. 4 %. (Kilde: README.md:235-237)

## Nettab

- **Hældningsmodellen** — et led, der vokser, når det er koldt — bruges af alle cases i repoet.
- **Den fysiske to-ledsmodel** (valgfri) deler nettabet i et isolations-/jordtab og et led, der
  følger lasten, ud fra årligt nettab og sommer- og vintertemperaturer.

(Kilde: doc/VARMELAST_OG_NETTAB.md:89-133)

Nettabsmodellen påvirker kun den syntetiske varmelast; med målt varmelast er nettabet allerede i
målingen. (Kilde: doc/VARMELAST_OG_NETTAB.md:136-139)

## Varmepumpens ydelse

En luft/vand-varmepumpe leverer mindre varme, når det er koldt. Beskriv den med en målt
**ydelsestabel**: varme og eloptag ved fuld last ved mindst to udetemperaturer, gerne −10, 0 og
+15 °C. Den lineære COP-kurve giver størst eloptag i frost — det omvendte af virkeligheden.
Skiftet til tabel flyttede Billunds Spor A fra 5,19 til 4,70 mio. kr.
(Kilde: doc/VARMELAST_OG_NETTAB.md:5-37)
