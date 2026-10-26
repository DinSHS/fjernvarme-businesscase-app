# Data og datadækning

Markeds- og vejrdata kommer fra datarepoet **df-data**, som opdateres hver mandag: spot (kvarterpriser
fra 1. oktober 2025), aFRR, mFRR-kapacitet, mFRR-aktivering, ubalancepris og DMI-observationer.
Kilden er api.sysapp.dk, kontrolleret mod Energi Data Service. Hver kørsel gemmer, hvilken version
af data den brugte. (Kilde: README.md:222-228; KONTRAKT §3.6)

## Kendte huller og grænser

| Hvad | Konsekvens |
|---|---|
| Ubalancedata begynder 4. marts 2025 kl. 12 UTC | balancekørsler kan tidligst starte da; første hele døgn er 5. marts 2025 |
| Alle markeds- og vejrdata slutter 11. oktober 2026 (df-data af 12. oktober) | senere perioder kan ikke køres, før df-data er opdateret |
| mFRR-kapacitet mangler 22.–23. juni 2023 | balancekørsler hen over de døgn stopper |
| Enkelte tomme temperaturtimer (fx 1. januar 2026 kl. 00) | udfyldes ved interpolation; ingen fejl |

Målt 16. oktober 2026 ved df-data `392992c` med modellens egen dækningsregel. Ældre versioner af df-data havde
flere huller (fyn og vestkyst 28. februar 2026, aFRR fra 4. september 2026), som casens kommentarer stadig nævner;
de er fyldt siden. Hvad der gælder for en kørsel, afgøres af den version af df-data, kørslen bruger.
(Kilde: viden/data_krav.json; cases/andeby.yaml:97-113; src/data_loader_github.py:62-83)

**Huller i markedsdata fyldes aldrig** (tomme temperaturtimer undtaget). Mangler data i perioden, stopper kørslen
med en dækningsfejl, der siger hvilke timer der mangler. Det er med vilje: tidligere gav et hul tavst nul balanceindtægt eller nul
sol. (Kilde: src/data_loader.py:83-110; rapport v4, bilag C)

**Det rullende år** 1. juli 2025 – 30. juni 2026 er standardperioden: det seneste hele år efter
PICASSO, med begge endepunkter om sommeren, hvor tanken betyder mindst. (Kilde: cases/andeby.yaml:93-113)
