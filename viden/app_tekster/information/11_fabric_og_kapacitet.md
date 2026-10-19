# Hvor regnes der, og hvad koster det?

Modellen regner i en **Python-notebook i Microsoft Fabric**, ikke i browseren. Appen bestiller en
kørsel; notebooken tager kørslerne én ad gangen i den rækkefølge, serveren har modtaget dem, og skriver
resultaterne tilbage. Notebooken kan også køres i hånden. (Kilde: KONTRAKT §1; KONTRAKT §5.1; KONTRAKT §6c)

**Én kørsel ad gangen.** Står en anden kørsel og regner, venter jeres i kø. Hver bruger kan højst
have 3 ventende bestillinger; en periode må højst være 366 døgn og tidsgrænsen højst 3.600 sekunder.
(Kilde: KONTRAKT §3.0)

**Prøvekapacitet.** Workspacet kører på en Fabric-prøvekapacitet (FTL64 Trial), startet 8. oktober
2026. Den udløber omkring 7. december 2026; derefter kan der ikke regnes nye kørsler, før workspacet
er flyttet til en betalt kapacitet. Hvad der sker med appen, databasen og de gemte kørsler ved
udløb, skal afklares med Fabric-administratoren i god tid før. (Kilde: KONTRAKT §2)

**Hvorfor status ikke opdateres hele tiden:** appens database koster kapacitet, så længe den er
vågen. Appen spørger derfor kun efter status hvert 20. sekund, mens I selv har en kørsel i gang
og fanen er synlig. (Kilde: KONTRAKT §6)
