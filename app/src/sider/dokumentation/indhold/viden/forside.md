# Fjernvarme Businesscase

**Hvad er en tank, en varmepumpe eller en prækvalifikation værd for jeres værk?** Appen regner
svaret med den åbne driftsmodel, som Dansk Fjernvarme og Billund Varme har udviklet: en
optimering af hele driften time for time over en periode, typisk et år, mod spotprisen og — hvis
I vil — balancemarkederne aFRR og mFRR. (Kilde: README.md:1-11)

## Sådan virker det

1. **Vælg et værk.** Andeby er et fiktivt referenceværk; Billund-værkerne er den gennemgående
   case fra rapport v4. I kan også kopiere et værk og rette det til jeres eget.
2. **Lav et scenarie.** Ét spørgsmål = én knap: slå tanken fra, sæt halmprisen op, slå
   balancemarkedet til.
3. **Bestil en kørsel.** Modellen regner i Fabric, ikke i browseren. Et kort vindue tager
   sekunder til et minut; et helt år fra minutter til en time. (Kilde: README.md:148-151)
4. **Sammenlign to kørsler.** Differensen er svaret — ikke det enkelte tal.

## Tre regler for tallene

- **Differenser frem for absolutte tal.** Kør altid en reference og et scenarie med samme værk,
  periode og datakilde.
- **Balancetal pr. marked og pr. produkt**, aldrig kun som total.
- **Spor A er en øvre grænse**, ikke en prognose.

(Kilde: README.md:148-160)

Et modeltal gælder for en periode, under nogle antagelser, med en metode. Skifter en af de tre,
skifter tallet. (Kilde: README.md:159-160)
