# Ordliste

**Ab værk** — varme målt ved udgangen fra værket, før nettab. Den målte varmelast er ab værk.

**Aktivering** — når Energinet faktisk kalder et accepteret bud, og enheden stopper sit elforbrug.
Betales pr. MWh. Se også *kapacitet*.

**Aktiveret andel** — hvor stor en del af den reserverede effekt modellen regner som aktiveret i et
kvarter: `clear` (hele buddet, når prisen er over buddet), `system_share` (følger systemets
aktivering, skaleret med k) eller `ramp`. (Kilde: doc/BALANCEMARKED.md:80-90)

**Aktiveringsværdi** — værdien af én MWh aktiveret op-regulering: aktiveringsprisen plus den tarif
og elafgift, enheden sparer ved at stoppe. Spotprisen spares ikke: strømmen er købt dagen før. Regnes
kvarter for kvarter. (Kilde: src/activation_value.py:18-28)

**aFRR** — *automatic Frequency Restoration Reserve*: automatisk, hurtig reserve, som Energinet
aktiverer direkte. Ét af de to balancemarkeder i modellen.

**Alternativomkostning (beregnet budpris)** — hvad det koster at binde 1 MW eloptag i en time:
elvarmens pris minus prisen på den varme, der ellers skulle laves. Bruges som budpris på
kapacitet. (Kilde: doc/BUDSTRATEGI.md:42-48)

**Balancemarked** — markederne, hvor Energinet køber reserver til at holde balancen i elnettet:
her aFRR og mFRR.

**Budvindue** — måneder og timer, hvor en enhed overhovedet byder, fx ikke elkedlen om sommeren.

**CM-pris (kapacitetspris)** — prisen pr. MW pr. time for at holde reserve klar; afgøres ved auktion
dagen før.

**COP** — *Coefficient of Performance*: varme pr. el for en varmepumpe. COP 3 betyder 3 MWh varme
for 1 MWh el. Afhænger af udetemperaturen. (Kilde: src/config.py:373-381)

**Cyklusbinding** — tanken skal ende med samme indhold, som den startede med.

**D&V (var_om)** — variable drifts- og vedligeholdelsesomkostninger pr. MWh varme.

**Differens / differensmetoden** — at læse et resultat som forskellen mellem to kørsler, der er ens
på nær én ting.

**Driftsintervaller** — antal tidsintervaller, hvor en enhed producerer. Manifestets felt
`fuldlasttimer` er i virkeligheden dette tal; rigtige fuldlasttimer er produceret MWh delt med
nominel effekt. (Kilde: src/reporting.py:75; KONTRAKT §3.10)

**Footroom** — den del af en enheds aktuelle elforbrug, den kan stoppe. Enheden skal bruge mindst så
meget el, som den har budt.

**FCR** — *Frequency Containment Reserve*: den hurtigste reserve. Ikke med i modellen.

**Gab (solvergab, MIP-gab)** — hvor langt den fundne løsning højst ligger fra den bedst mulige,
relativt (fx 0,5 %) eller absolut (fx 5.000 kr.). (Kilde: src/config.py:713-714)

**Kapacitet** — betaling for at holde effekt klar i en time, uanset om den aktiveres.

**Kapacitetsprisgate** — regel om kun at byde i timer, hvor kapacitetsprisen er over en tærskel.

**Kraftvarme (gasmotor)** — enhed, der laver el og varme samtidig og sælger elen til spotpris.

**Månedsloft (availability)** — værkets faktiske reservation pr. marked og måned brugt som loft.
Bruges i Spor B.

**mFRR** — *manual Frequency Restoration Reserve*: manuelt aktiveret reserve. Afregnes til
marginalpris. Ét af de to balancemarkeder i modellen.

**MILP** — *Mixed Integer Linear Programming*: optimering med både kontinuerte variable (MW) og
heltalsvariable (tændt/slukket). Modellen er en MILP, når mindst én enhed har start/stop-logik.

**Minimumslast, min. driftstid, min. stilstand** — start/stop-krav til en kedel: laveste last når
den kører, og hvor længe den skal køre eller stå efter en start eller et stop.

**Nettab** — varme, der tabes i ledningsnettet mellem værk og kunde.

**Objektiv** — modellens samlede driftsomkostning for perioden i kr.: det tal, optimeringen
minimerer.

**Op-regulering** — at hjælpe elnettet, når der mangler el. For en el-forbrugende enhed betyder det
at stoppe forbruget.

**Perfekt foresight** — at modellen kender hele periodens priser og vejr på forhånd.

**PICASSO** — den europæiske platform for aFRR, som Danmark tilsluttede sig i 2025.
(Kilde: rapport v4 §3.2)

**Pris-tager** — antagelsen om, at værkets egne bud ikke flytter markedsprisen.

**Prækvalifikation** — den effekt, Energinet har godkendt, at værket må byde ind med.

**Referencekørsel** — den kørsel, et scenarie sammenlignes med.

**Robust reservation** — kravet om, at driften også holder, hvis et bud ikke aktiveres.

**Scenarie** — et værk plus én eller flere ændringer, der kan køres og sammenlignes.

**Spor A** — normativ beregning af balancemarkedet: hvad værket *kunne* tjene. En øvre grænse.

**Spor B** — beskrivende beregning med værkets faktiske reservation som loft. Bruges til validering.

**Spotpris** — elprisen på day-ahead-markedet, pr. time eller kvarter.

**Syntetisk varmelast** — varmebehov regnet af udetemperaturen, når der ikke er målinger.

**Tarif (net- og produktionstarif)** — netselskabets og Energinets betaling pr. MWh el.

**Unit commitment (UC)** — modellens start/stop-logik for enheder.

**Værk** — den samlede konfiguration: enheder, lagre, priser, tariffer, balancemarked, tid og data.

**ΔT (delta T)** — temperaturforskellen mellem tankens varme og kolde lag. Bestemmer, hvor meget
energi tanken rummer.

**Øvre grænse** — et tal, der ikke kan overgås under modellens antagelser; ikke en prognose.
