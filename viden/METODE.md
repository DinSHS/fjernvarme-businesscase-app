# Metoden bag Fjernvarme Businesscase

*En syntese til driftsledere og økonomer, der ikke koder. Kilden er det åbne modelrepo
`skj-1964/fjernvarme-businesscase` ved commit `eef950a` (MIT) og rapport v4. Henvisninger er
`fil:linje` i repoet eller `rapport v4 §afsnit`.*

---

## 1. Problemet

Et fjernvarmeværk skal dække varmebehovet hver eneste time med en håndfuld enheder, der koster
noget forskelligt at køre: varmepumpe og elkedel følger elprisen, biomasse- og gaskedler følger
brændselsprisen, en gasmotor tjener på at sælge el, og en akkumuleringstank kan flytte varme fra
billige til dyre timer. Ved siden af kan de el-forbrugende enheder sælge fleksibilitet til
Energinet på balancemarkederne. Spørgsmålet er altid det samme: *hvad er det værd* — en tank, en
varmepumpe, en anden halmpris, en prækvalifikation? Modellen svarer ved at regne den billigst
mulige drift time for time over en periode, typisk et år (README.md:7-11).

## 2. Modellen: én optimering over hele perioden

Modellen er en **blandet heltalsoptimering (MILP)**. For hver time vælger den samtidig, hvilke
enheder der producerer og hvor meget, om tanken lades eller aflades, og hvor meget op-regulering
varmepumper og elkedler byder ind. Målet er den laveste samlede omkostning: brændsel, el,
tariffer, afgifter og starter, fratrukket elsalg fra kraftvarme og betaling fra balancemarkederne
(rapport v4 §1). Den løses med de åbne værktøjer Linopy og HiGHS (README.md:10-11).

**Beslutningsvariable** (rapport v4, bilag B):

| Variabel | Betydning |
|---|---|
| varmeproduktion p(i,t) | MW varme fra enhed i i time t |
| ladning, afladning, indhold | tankens ind- og udstrømning og energiindhold |
| tændt u(i,t), start v(i,t) | 0/1-variable for enheder med start/stop-logik |
| reservation r(m,i,t) | MW el, enheden byder ind i marked m (aFRR eller mFRR) |

**Varmebalancen** skal holde i hver time: produktion + afladning − ladning = varmebehov. Med
balancemarkedet trækkes den forventede varme fra, der *ikke* produceres, når en enhed aktiveres og
stopper (rapport v4, bilag B).

**Tanken** er et energilager: indholdet i en time er forrige times indhold minus et lille tab plus
ladning minus afladning (src/model.py:255-260). Kapaciteten regnes af volumen og
temperaturdifferens: 1 m³ vand med 1 K giver ca. 1,163 kWh (src/config.py:571-575). Andebys to
lag på 7.000 m³ ved 30 K og 3.000 m³ ved 55 K rummer derfor ca. 244 og 192 MWh
(cases/andeby.yaml:416-438). Tanken skal ende, hvor den startede, så perioden ikke tærer på et
lager, den ikke har betalt for (src/model.py:278-284; rapport v4 §2.1).

**Start/stop (unit commitment).** Kedler med minimumslast, minimum driftstid og
startomkostning gør problemet til et heltalsproblem. Logikken er kun aktiv, når enheden har
`uc_enabled: true`; ellers ignoreres de felter (src/config.py:514-520). Det er det, der gør et
helår tungt: fra et halvt minut til over et kvarter (doc/EGET_VAERK.md:124-129).

**Hvad koster en MWh varme pr. enhed** (src/model.py:31-110):

| Enhed | Marginalomkostning pr. MWh varme |
|---|---|
| Varmepumpe, elkedel | (spot + forbrugstarif + elafgift) / COP + D&V |
| Biomasse- og gaskedel | brændselspris / virkningsgrad + CO₂ + D&V |
| Gasmotor | som kedel, minus α × (spot − produktionstarif) for den solgte el |
| Overskudsvarme | prisen pr. MWh + D&V (deles ikke med virkningsgraden) |
| Solvarme | D&V; produktionen bindes af en tidsprofil |

**Varmepumpen** beskrives bedst med en målt ydelsestabel: varme og eloptag ved fuld last ved
mindst to udetemperaturer, gerne omkring −10, 0 og +15 °C. Varmeloftet følger så
udetemperaturen time for time. Den ældre lineære COP-kurve har fast varmeloft og giver størst
eloptag i frost — det omvendte af en luft/vand-varmepumpe (doc/VARMELAST_OG_NETTAB.md:5-34).
Skiftet til målt tabel flyttede alene Billunds Spor A fra 5,19 til 4,70 mio. kr.
(doc/VARMELAST_OG_NETTAB.md:36-37).

## 3. El: spot, tarif og afgift

Spotprisen kommer time for time fra df-data; fra 1. oktober 2025 findes kvarterpriser
(README.md:224-227). Til elprisen for varmepumpe og elkedel lægges nettarif og elafgift. Tariffen
kan være en fast sats eller en **båndprofil** fra netselskabets prisblad: bånd (fx lav, høj,
spids), sæsoner og hverdag/weekend, slået op i dansk lokaltid med danske helligdage
(src/tariff.py:1-24). To fælder:

- Elafgiften står i profilen som dokumentation (`elafgift_net`), men lægges til af modellen via
  `electricity_tax`; de to tal skal være ens, ellers afvises casen (src/tariff.py:165-184).
- Aktiveringsværdien i balancemarkedet regner den sparede tarif med den **faste** sats plus
  elafgift, også når profilen er sat (src/data_loader_github.py:690-698). Den faste sats er
  altså ikke ligegyldig.

## 4. Balancemarkedet: aFRR og mFRR

**Hvad der sælges.** En varmepumpe eller elkedel, der kører, kan tilbyde at *stoppe* sit
elforbrug, hvis Energinet kalder den: op-regulering fra forbrugssiden. Modellen dækker kun det.
Nedregulering og gasmotorernes balanceindtægt er ikke med; hos Billund var motorerne 29 % af
balanceindtægten i marts–juni 2026 (doc/BALANCEMARKED.md:3-12; rapport v4 §5.4).

**To markeder, to indtægter.** aFRR er automatisk og hurtig, mFRR manuel. I begge betales for
*kapacitet* (at holde MW klar i en time; auktion dagen før) og for *aktivering* (den energi, der
faktisk reguleres) (doc/BUDSTRATEGI.md:27-34).

**Footroom.** For at kunne stoppe 5 MW elforbrug skal enheden bruge mindst 5 MW i timen. Et
vundet bud tvinger altså enheden til at køre, og varmen skal kunne afsættes i nettet eller i
tanken. Det er her, tanken får betydning for balancemarkedet (doc/BUDSTRATEGI.md:36;
doc/BALANCEMARKED.md:26-28).

**Robust reservation.** Modellen regner med den *forventede* aktivering. Uden et ekstra krav kan
den lægge en plan, hvor elkedlen laver mere varme, end nettet kan tage, fordi aktiveringen
"forventes" at fjerne forskellen. Med `robust_reservation: true` — standard siden 15. oktober
2026 — skal driften også holde, hvis buddet *ikke* aktiveres (doc/BUDSTRATEGI.md:88-97).

**Lofter.** Reservationen begrænses af enhedens største eloptag, af prækvalifikationen pr. enhed
og samlet (Billund: 5,52 MW på varmepumpen, 17,52 MW i alt), af værkets egen fordeling mellem
markederne, af budvinduer og idriftsættelsesdato og eventuelt af nettilslutningen
(doc/BALANCEMARKED.md:19-43; doc/BUDSTRATEGI.md:60-70).

**Aktiveringsværdien** regnes kvarter for kvarter, så samvariationen mellem pris og aktivering
fanges: værdien af én MWh aktiveret op-regulering er aktiveringsprisen **plus** den sparede tarif
og elafgift. Spotprisen er *ikke* en besparelse: strømmen er købt dagen før og betales, uanset om
enheden stopper. Det blev bekræftet af Billund 19. oktober 2026 og rettet i modellen samme dag;
før regnede modellen også spotprisen som sparet og overvurderede aktiveringen
(src/activation_value.py:18-28; doc/BUDSTRATEGI.md:155-185). Modelrepoets doc/BALANCEMARKED.md
viser stadig den gamle formel med spotprisen (doc/BALANCEMARKED.md:52-62); koden er gældende.
Metoden hedder `activation_value`; den ældre `legacy`
ganger timegennemsnit og undervurderer systematisk (doc/BALANCEMARKED.md:47-66).

**Hvor meget aktiveres?** At buddet ligger i merit, er ikke det samme som at blive kaldt.
`clear` regner hele buddet aktiveret og gav 4–5 gange for meget aktiveret energi mod Billunds
afregning; `system_share` følger systemets faktiske aktivering skaleret med en faktor k (k = 4
for aFRR, kalibreret på marts–juni 2026); `ramp` lader andelen vokse med prisens afstand til
buddet (doc/BALANCEMARKED.md:80-90; doc/BUDSTRATEGI.md:131-135).

**Hvad ved værket, når det byder?** Kapacitetsbuddet afgives dagen før. Ser modellen de faktiske
aktiveringer (`foresight: realized`), vælger den præcis timerne med prisspidser, og tallet bliver
for højt. `profile`, `trailing30`, `lag24` og `lag168` er gradvist mere ærlige prognoser.
`settle: realized` løser først på prognosen, låser reservationen og afregner så på det, der
faktisk skete (doc/BUDSTRATEGI.md:72-86).

**Budpris på kapacitet.** En kapacitetsprisgate åbner kun for bud i timer, hvor
kapacitetsprisen er over en tærskel: enten en fast pris eller en *beregnet* budpris =
alternativomkostningen ved at binde 1 MW eloptag (spot + tarif + afgift + COP·D&V − COP·prisen på
den varme, der ellers skulle laves). Dyr gas på marginalen giver automatisk en højere budpris
(doc/BUDSTRATEGI.md:42-48; src/balancing.py:717-724).

### Spor A og Spor B

| | Spor A — normativ | Spor B — beskrivende |
|---|---|---|
| Spørgsmål | Hvad *kunne* værket tjene med fuld tilgængelighed? | Hvad gav modellen med den reservation, værket faktisk stillede? |
| Reservation | frit inden for lofter og kapacitetsprisgate (`mode: bound`) | værkets egen reserverede mængde pr. marked og måned som loft |
| Brug | **øvre grænse**, ikke en prognose | validering mod afregning; forudsiger ikke |

Kilde: doc/BALANCEMARKED.md:113-121. Uden månedsloftet reserverede modellen 3–8 gange mere, end
Billund gjorde (rapport v4 §2.2). Månedsloftet beskriver ét værk i én periode og kan ikke
overføres (doc/BALANCEMARKED.md:156-157).

**Budstrategien er det vigtigste valg.** På samme værk, år og data kan balancetallet gå fra få
millioner til mere end hele værkets varmeomkostning. Et balancetal skal derfor altid stå sammen
med den budstrategi, det er regnet med (doc/BUDSTRATEGI.md:9-19). På Andebys vintervindue gav
fire strategier en balanceværdi på 421.000 kr. (kender aktiveringerne), 216.000 kr. (prognose)
og 128.000 kr. (beregnet budpris, prognose) ved modelversion eef950a (doc/BUDSTRATEGI.md:328-337;
genskabt til kronen 26. oktober 2026).

## 5. Varmelasten: målt eller syntetiseret

Den sikreste varmelast er **målt** ab værk, time for time (`--heat-csv`). Sådan kører Billund-
casene og alle værker, der kommer ind via regnearket (doc/VARMELAST_OG_NETTAB.md:41-44).

Uden måling **syntetiseres** varmelasten af DMI-temperaturen
(src/data_loader.py:632-661):

> varmebehov(t) = grundlast(time på døgnet) + β_gaf · max(0, T_ref − glidende T_ude) + nettab-led

Grundlasten er en 24-timers profil (brugsvand og konstant nettab); rumvarmen følger et glidende
gennemsnit af udetemperaturen med en termisk inerti (Andeby: 24 timer); weekenden sænkes 2 %
(cases/andeby.yaml:152-164). Syntesen kan genkalibreres mod en måling med
`scripts/calibrate_heat_load.py` (doc/VARMELAST_OG_NETTAB.md:50-85).

**Nettab** findes i to former. Hældningsmodellen (et led, der vokser under en referencetemperatur, i Andeby 12 °C,
cases/andeby.yaml:156-157) bruges af alle cases i repoet. Den fysiske to-ledsmodel — et konduktivt led mod jordtemperaturen og et
flowled, der følger lasten — aktiveres med en `nettab`-blok med årligt nettab og
sommer/vinter-temperaturer (doc/VARMELAST_OG_NETTAB.md:89-133). Med målt varmelast er nettabet
allerede i målingen (doc/VARMELAST_OG_NETTAB.md:136-139).

**Klimaområdet** vælges blandt fire DMI-områder (fyn, vestkyst, karup, ringsted). Valget alene
kan flytte objektivet med op til ca. 4 % (README.md:235-237).

## 6. Differensmetoden og solvergab

**Et modeltal læses som en differens.** En businesscase er altid to kørsler, der er ens på nær
én ting: med og uden tank, med og uden balancemarked, halmpris 205 eller 256 kr./MWh.
Systematiske fejl, der rammer begge kørsler ens, går ud, og antagelser, der ikke er ændret,
behøver kun at være rimelige (rapport v4 §2.3; doc/KOERSEL.md:9-15). Samme case, periode og
datakilde i begge kørsler.

**Solvergab.** Solveren stopper, når den har bevist, at løsningen ligger inden for et gab af det
bedst mulige. Standarden 0,5 % eller 5.000 kr. er fin til absolutte tal, men på et objektiv
omkring 5 mio. kr. er 0,5 % ca. 26.000 kr., mens et scenarie kan flytte 2.000–14.000 kr. Så kan
differensen drukne i solverens tolerance, og fortegnet kan vende. Til differenser: 0,0002
(doc/KOERSEL.md:49-66). Det er sket: målt på Spor A viste standardgabet, at en ekstra 30 MW elkedel gjorde driften
1.262 kr. *dyrere* — umuligt, og forklaret af gabet (cases/andeby.yaml:122-126).

**Begge gab tæller.** Solveren får både et relativt og et absolut gab og stopper, når det første
er nået (src/config.py:742-751). Uden en solver-blok i casen er det absolutte gab 5.000 kr., og
så binder det før 0,02 % på ethvert objektiv under 25 mio. kr. Sæt derfor også det absolutte gab
ned ved differenser; rapport v4 regnede alle differenser med højst 0,1 % eller 1.000 kr.
(src/config.py:713-714; rapport v4 §2.3).

Målt 16. oktober 2026 på Spor A, marts 2026 med balancering, ønsket gab 0,0002: med standardens absolutte gab på 5.000 kr. stoppede solveren ved 0,068 % (HiGHS angav selv 'tolerance: 0.22%') efter 52 s; med absolut gab 1 kr. ved 0,019 % efter 124 s. Objektivet blev det samme (2.273.504 kr.), men usikkerheden faldt fra ca. 1.550 til ca. 430 kr. (Kilde: udviklingsrapport, afsnit Målt)

**Tre regler for brug af tallene** (README.md:148-160):

1. Differenser frem for absolutte tal.
2. Balancetal pr. marked (aFRR/mFRR) og pr. produkt (kapacitet/aktivering), aldrig kun som total.
   Totalen har to gange i projektet skjult fejl, der udlignede hinanden (rapport v4 §2.4).
3. Spor A er en øvre grænse, ikke en prognose.

**Første time — rettet 19. oktober 2026.** Indtil modelversion `eef950a` var lagerbalancen ikke
bundet i periodens første time: tanken kunne aflade uden at blive tømt, og den varme var gratis.
Kørslen med tank fik dermed gratis varme, som kørslen uden tank ikke fik — på et kort vindue en
stor del af differensen: i Andeby 5.–16. januar 2026 leverede tankene 33 MWh gratis i første time,
omkring halvdelen af tankværdien på 44.220 kr. (udviklingsrapport). Fra `eef950a` gælder
lagerbalancen også i første time (src/model.py:267-271; tests/test_lager_foerste_time.py), og
tankværdien i samme vindue blev ca. halvt så stor: 21.915,92 kr., målt 26. oktober 2026 som D02 − D01 i
demo_scenarier.json (samme tal som tests/test_lager_foerste_time.py:5-6).
Kørsler regnet før `eef950a` har stadig fejlen; appen sammenligner kun kørsler ved samme
modelversion. Timefilen har fortsat én række færre end perioden — modellens rapport udelader
første interval (src/reporting.py:314-338) — mens objektivet medregner den.

## 6a. Fra differens til anbefaling

En differens er først en anbefaling, når den er større end solverens usikkerhed, stor nok til at
betyde noget, og når intet forbehold kan vende den. Reglerne står i `viden/anbefalingsregler.json`;
her er de i ord.

**Fire udfald** for et spørgsmål, værket selv kan beslutte (en tank, en enhed, en prækvalifikation,
balancemarkedet):

| Udfald | Betyder |
|---|---|
| Anbefalet | Scenariet er billigere med margin, og intet forbehold kan vende konklusionen |
| Frarådes | Scenariet er dyrere med margin |
| Kan ikke afgøres | Forskellen er inden for tolerancen eller for lille, kørslerne er ikke sammenlignelige, eller fortegnet kan ikke passe |
| Undersøg nærmere | Tydelig forskel, men med et væsentligt forbehold; næste skridt fjerner det |

(Kilde: anbefalingsregler.json)

**Margin.** Tolerancen er summen af de to kørslers absolutte gab (KONTRAKT §6b). En forskel er
tydelig, når den er mere end to gange tolerancen og mere end 0,1 % af referencens driftsomkostning
(mindst 1.000 kr.). Faktoren to dækker solverstøj mellem miljøer og at gabet er et loft.
(Kilde: anbefalingsregler.json; KONTRAKT §6b)

**Fortegnet skal kunne passe.** At fjerne en enhed eller en tank kan ikke gøre driften billigere, og
at tilføje en enhed eller hæve et loft kan ikke gøre den dyrere — mulighederne bliver kun færre eller
flere. Brydes det med mere end tolerancen, er tallet ikke til at stole på. Det var præcis sådan, et
for løst gab blev opdaget: en ekstra elkedel gjorde driften 1.262 kr. dyrere. (Kilde: cases/andeby.yaml:122-126)

**Forbehold, der nedgraderer "Anbefalet" til "Undersøg nærmere":** under 14 døgn; en investering
regnet på under et år; Spor A (øvre grænse); at modellen kender aktiveringerne; [BEKRÆFT]-værdier i
det, scenariet ændrer; løst gab; en kørsel stoppet ved tidsgrænsen; profilbundne enheder. Ændrer
scenariet et lager på under 90 døgn, og er en af kørslerne regnet før modelversion `eef950a`,
nedgraderes både "Anbefalet" og "Frarådes", fordi første times gratis varme dér kan bære en stor
del af forskellen (afsnit 6). (Kilde: anbefalingsregler.json;
doc/BUDSTRATEGI.md:346; README.md:156-158)

**Spørgsmål, værket ikke selv vælger** — en gaspris, et DMI-område, en indtægtsmetode — får ingen
anbefaling, kun en følsomhed: "en gaspris 20 % højere koster X kr. i perioden".
(Kilde: knapper.json)

**Investeringer.** Modellen regner kun driften; investeringsbeløbet findes ikke i den. Det årlige
beløb fra et helår er driftsbesparelsen før kapitalomkostning. Den sammenholdes med investeringens
annuitet A = I × r / (1 − (1 + r)^(−n)) plus faste årlige omkostninger. Andeby og Billund angiver en
real rente på 3,5 %, som modellen ikke selv bruger. (Kilde: README.md:59; cases/andeby.yaml:74)

**Skalering til et år** (Δ × 365 / døgn) vises kun som et groft skøn og kun for vinduer på mindst en
uge: en enkelt sæson er ikke repræsentativ, fordi døgnets prisspænd — som tanken tjener på — er
størst forår og sommer. (Kilde: rapport v4, bilag A)

**Historien i klartekst.** Hvert par fortæller sig selv i tre sætninger: hvad vi ændrer, de vigtigste
konsekvenser i MWh, kroner og ton CO₂, og hvor sikkert det er. Fx: "I dette scenarie slår vi begge
tanke fra. Det flytter ca. 87 MWh til gaskedlen, øger CO₂-udledningen med 17 t og gør driften
22.000 kr. dyrere i perioden 5.–16. januar 2026. Begge kørsler er løst til optimum; perioden er kun
12 døgn, så tallet viser retningen, ikke årets størrelse."
(Kilde: anbefalingsregler.json; demo_scenarier.json)

## 7. Referencetal

Kørt 15. oktober 2026 med df-data fra 5. oktober 2026 eller senere. Beløbet er modellens samlede
driftsomkostning for vinduet (README.md:128-146):

| Case | Vindue | Objektiv, kr. (README) | Genskabt lokalt 26/10, kr. | Løsetid (README) |
|---|---|---:|---:|---|
| Spor A-anker (Billund) | 2. marts–23. juni 2026 | 5.069.729 | 5.069.729 | 2–3 min (2 kerner) |
| Spor B (Billund) | 2. marts–30. juni 2026 | 4.204.128 | 4.204.128 | 2–3 min (2 kerner) |
| Billund rullende år | jul 2025–jun 2026 | 21.773.827 | ikke genskabt ¹ | ca. 8 min (2 kerner) |
| Andeby helår, med balancering | jul 2025–jun 2026 | 24.188.471 | ikke regnet | 17 min (24 kerner), ca. 3,5 GB |
| Andeby helår, uden balancering | jul 2025–jun 2026 | 30.431.535 | 30.431.535 | 1 min (24 kerner) |

¹ Lokalt (8 kerner, delt maskine) ramte løseren kodens tidsgrænse på 600 s med gab 2,03 %: løsning 22.159.684 kr., nedre grænse 21.708.371 kr. README-tallet ligger i det interval, men er ikke genskabt her. (Kilde: referencetal.json › readme › billund_rullende › genskabt)

I README's kørsler er alle optimale inden for casens gab (README.md:182-186). "Genskabt lokalt" er
kørt ved eef950a og df-data 106b9fc: README's egen kommando, og for Andeby uden balancering demo-kørslen
D11 gennem appens motor (rapporter/fv-model.md). Løsetider: på en
sandkasse med to kerner Spor A og B 2–3 minutter og Billunds rullende år ca. 8 minutter; på en pc med
24 kerner Andeby uden balancering 1 minut og med balancering 17 minutter og 3,5 GB hukommelse. Regn
helår på forhånd (README.md:186-190). Tal fra før 19. oktober 2026 — herunder rapport v4's
balancetal og firkanten nedenfor — er regnet før rettelserne og kan ikke sammenlignes (README.md:192-195).

**Billund-firkanten** (rullende år, rapport v4 §4.1, tabel 4.1): tanken er 5.002.707 kr. værd på
spotmarkedet og 4.978.833 kr. med balancemarkedet åbent; balancemarkedet er 6.688.632 kr. værd med
tank og 6.712.506 kr. uden. De to værdier er her næsten uafhængige — i denne konfiguration
begrænses reservationen af prækvalifikationen og kapacitetsprisgaten, ikke af tanken.

**Tankstørrelse** (rapport v4 §4.3): de første 4.000 m³ fanger 83 % af spotværdien af 14.000 m³,
8.000 m³ fanger 93 %. Værdien mættes hurtigt, fordi tanken tjener på døgnets prisspænd.

**Andeby** (rapport v4 §9, tabel 9.1): tankene er 4.175.596 kr. værd på spotmarkedet og
4.356.786 kr. med balancemarkedet. Andebys balancetal er et potentiale ved fuld tilgængelighed,
ikke hvad et værk vil tjene (README.md:199-201).

I appen er hver reference udtrykt som værk + scenarie i `viden/referencetal.json`, så de kan
regnes igen i Fabric og sammenlignes med tolerancen fra casens eget gab.

## 8. Validering mod virkeligheden

Spor B for marts–juni 2026 blev sat op mod Billunds egen afregning for forbrugssidens
op-regulering: efter rettelserne 19. oktober 2026 ligger modellen på 120 % (aFRR 109 %, mFRR 129 %;
model 3,80 mio. kr. mod afregnet 3,18 mio. kr.) (README.md:197-198; cases/billund_sporB.yaml:373-376).
Rapport v4 regnede før rettelserne og fik 121 % (aFRR 108 %, mFRR 132 %); dens opdeling pr. produkt
viser, at mFRR-kapaciteten ligger ca. 39 % for højt, fordi modellen kender kapacitetsprisen på
forhånd og samler reservationen i få, dyre timer (rapport v4 §5.2). Opdelingen er ikke regnet
igen efter rettelserne, og afregningen ligger ikke i repoet, så appen kan ikke selv efterregne den.

Markedet skiftede undervejs: Billund tjente 13,8 mio. kr. på forbrugssidens op-regulering i 2.
halvår 2025 og 3,2 mio. kr. i marts–juni 2026; aFRR-kapacitetsprisen faldt fra 407 kr./MW/t i juli
2025 til under 100 i maj–juni 2026. Kalibreringen gælder kun marts–juni 2026 og skal testes igen
med vinterdata 2026/27 (rapport v4 §5.3).

## 9. Hvad modellen ikke kan

(README.md:53-62; rapport v4 §7)

- **Planlægge fremad.** Den kender hele periodens spotpriser, vejr og balancepriser på forhånd.
  Absolutte tal bliver for høje, mest for balancemarkedet.
- **Gasmotorernes balanceindtægt og nedregulering** er ikke med.
- **Forudsige balanceindtægten.** Spor B er kalibreret på ét værk i én periode med værkets egen
  reservation som input.
- **mFRR-kapacitet præcist**: overvurderes med ca. 30–40 %.
- **Være pris-tager uden forbehold**: Billunds 17,52 MW svarer til 18 % af den aFRR-op-regulering,
  Energinet i snit købte i DK1 (rapport v4, bilag A).
- **Fremløbs- og returtemperatur**: tanken regnes med fast ΔT, nettabet afhænger af
  udetemperaturen, og der er ingen kobling fra enhed til lager (cases/andeby.yaml:412-415).
- **Tidsvarierende afgift** over et afgiftsår: satserne er faste i hele perioden
  (cases/andeby.yaml:75-80).
- **Regne økonomi i kvarterer.** Modellen kan løse med 15-minutters opløsning, men objektivets led er effekt × pris pr. MWh uden at gange med intervallets længde, og kapacitetsindtægten er pris × MW pr. interval. Ved 1h er det kroner; ved 15 min tæller hvert kvarter som en hel time, mens startomkostninger tælles pr. start. Appens version 1 kører derfor kun 1h (src/model.py:432-434; src/balancing.py:342; KONTRAKT §6c). Alle repoets værker er 1h (src/data_loader.py:59-63).
- **Løse et helt år på sekunder**: fra et halvt minut til over en time (README.md:62; README.md:148-151).

## 10. Data og dækning

Markeds- og vejrdata kommer fra datarepoet df-data, som opdateres hver mandag: spot, aFRR,
mFRR-kapacitet, mFRR-aktivering, ubalancepris og DMI-observationer for fire områder. Kilden er
api.sysapp.dk, med Energi Data Service til kontrol (README.md:222-228). Kendte grænser:

- Ubalance- og mFRR-aktiveringsdata begynder 4. marts 2025; perioder før kan ikke køres med
  balancemarked (cases/andeby.yaml:97-101).
- Balancemarkedet kræver en periode efter ca. april 2025 (PICASSO) (doc/BALANCEMARKED.md:14-15).
- fyn mangler timer 1. januar og 28. februar–1. marts 2026; vestkyst mangler 28. februar 2026
  (doc/KOERSEL.md:110-111; cases/andeby.yaml:111-113).
- Der er et hul i aFRR-data fra 4. september 2026 (cases/andeby.yaml:100-101).
- Mangler data i perioden, stopper kørslen med en dækningsfejl i stedet for at fylde hullet
  (src/data_loader.py:83-110).

Det rullende år 1. juli 2025 – 30. juni 2026 er kursets faste år: det seneste hele år efter
PICASSO, med begge endepunkter om sommeren, hvor tanken betyder mindst (cases/andeby.yaml:93-113;
rapport v4 §3.2).
