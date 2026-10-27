# IBCS i appen — notationsregler

Appens grafer, tabeller og nøgletal følger IBCS® Standards v2.0 (SIMPLIFY · UNIFY · CHECK), som de er omsat i
`ibcs-notation`-skillen (tokens i `src/ibcs/tokens.generated.ts`). Denne fil er appens **notationsmanual**: de få
steder, hvor domænet kræver et valg, IBCS ikke træffer, og de dokumenterede afvigelser. Visualspecs pr. side står i
`docs/ibcs/*.visual-spec.yaml`. Appen følger IBCS; den er ikke certificeret af IBCS Institute. IBCS® er et registreret varemærke tilhørende IBCS Institute.

## 1. Scenarier: reference og scenarie

En kørsel er hverken AC (målt), PY (forrige periode), PL/BU (plan) eller FC (prognose): begge kørsler i en
sammenligning er **modelregnede**, og de adskiller sig kun ved det, scenariet ændrer (differensmetoden).
Appen har derfor to egne scenariekoder med faste IBCS-virkemidler — samme notation på alle sider:

| Kode | Betydning | Søjle/bjælke | Linje | Tabelhoved | Som Δ-akse (subtrahend) |
|---|---|---|---|---|---|
| **Scen** | Scenariet — det, spørgsmålet ændrer (minuend) | **fyldt mørk** (`--fjv-ac`) | mørk linje, fyldte markører | tyk mørk streg | — |
| **Ref** | Referencen — sammenligningsgrundlaget (subtrahend) | **omrids**: flade-farvet fyld, mørk kant (`--fjv-pl`) | mørk linje, hule markører | dobbelt tynd streg | **to tynde parallelle linjer** |

- **Δ = Scen − Ref** (`ΔRef`), relativ **ΔRef% = (Scen − Ref) / Ref** med fortegnet reference. Ref ≤ 0 eller
  tom → **N/A** (ingen pin) — ÉN funktion, `relativAfvigelse` i `beregn.ts`, for kort, detaljer, grafer og tabeller.
  Afvigelser af procenter er **pp**.
- Hvorfor omrids og ikke lys (PY): lys fyldning betyder *målt, tidligere* i IBCS. Referencen er et modelregnet
  sammenligningsgrundlag ligesom en plan — derfor plan-notationen. Appen har brugt hul bjælke = reference siden
  fase 1, så brugerne kender den.
- En **enkelt kørsel** (kørselssiden) er Scen-notation uden kode: fyldt mørk, som en AC-serie.
- Rækkefølge i tabeller: `Ref | Scen | ΔRef | ΔRef%`. Grafer: Ref bag Scen (overlappet), Scen foran.
- Etiketter siger "Reference" og "Scenarie" i fuld tekst, når der er plads; `Ref`/`Scen`/`ΔRef` i smalle
  kolonnehoveder og i titellinje 3.

## 2. Polaritet (farven følger virkningen, geometrien følger fortegnet)

| Størrelse | Polaritet | Δ op betyder |
|---|---|---|
| Driftsomkostning (objektiv), elomkostning, brændsel, tariffer, afgifter | **−1** | dårligt (rød) |
| Balanceindtægt (netto og brutto), elsalg | **+1** | godt (grøn) |
| CO₂-udledning | **−1** | dårligt (rød) |
| Varmeproduktion pr. enhed, elforbrug, lageraktivitet, varmebehov | **0** | neutral (blå) — at én enhed producerer mere, er hverken godt eller skidt; virkningen står i driftsomkostningen |

- Tre impact-farver pr. tema: `delta_pos` = **god**, `delta_neg` = **dårlig**, `delta_neutral` = **neutral**
  (navnene er historiske; de betyder virkning, ikke fortegn). De offentlige temaer bruger IBCS' farveblinde-
  variant for "god" (blågrøn), rød for "dårlig" og blå for "neutral"; kontrastscriptet måler alle tre par.
- Δ = 0, eller et Δ der afrundes til 0 ved de viste decimaler, får **intet mærke, ingen farve og intet fortegn**
  (`0`, `0,0 %`).
- Tal i tabeller og kort farves kun med virkningsfarven, når farven har tekstkontrast ≥ 4,5:1 (temaets
  `delta_*` er målt til det); ellers står tallet i tekstfarven, og bjælken bærer farven.

## 3. Enheder og skalering

| Størrelse | Tabeller og kort (≤ 4 cifre) | Grafer (≤ 3 cifre) |
|---|---|---|
| Driftsomkostning, Δ driftsomkostning | **t.kr.** (3.424 · +44,2) | **mio. kr.** med 2 decimaler (3,42), når grafens største \|værdi\| ≥ 1 mio. kr., ellers t.kr. med 1 decimal — ét præfiks for hele grafen, også dens Δ-trin (`pengeSkala`) |
| Balanceindtægt | t.kr. | t.kr. |
| Energi | MWh under 10.000, ellers GWh | MWh eller GWh, ét præfiks pr. skalagruppe |
| CO₂ | t | t |

- **Energi har ét præfiks pr. graf eller tabel**, valgt af `energiSkala(tal, cifre)` (`ibcs-grafer.tsx`): GWh med 2 decimaler,
  når det største tal afrundet i MWh ellers får mere end 3 heltalscifre (grafer) eller 4 (tabeller og kort, `ENERGI_TABEL`).
  Samme funktion, kun grænsen er forskellig; titel, kolonnehoved, budskab og fodnote følger valget (`r9_cifre.spec.tsx`).
- Enheden står i titlen (linje 2) eller i kolonnehovedet — ikke på hvert tal.
- Decimaler er faste pr. skalagruppe. Fuld præcision (hele kr.) findes i tooltip og i "Kopiér som tekst".
- Tal i løbende tekst (budskaber, historie) følger samme præfiks som siden.
- Datoer: perioder som `5.–16. jan. 2026`; datoer i formularfelter `ÅÅÅÅ-MM-DD`.

## 4. Titler og budskab

- Hver analyseside har **budskabet øverst** (én sætning, regnet af data — kun *detektion*; anbefalingen er
  regelstyret og står i sit eget kort) og under det en **tre-linjers titelblok**:
  1. *hvem*: værk + alle aktive afgrænsninger (balancemarked, vindue),
  2. ***hvad***: mål i fed + enhed,
  3. *hvornår*: periode + scenarier (`Ref og Scen, ΔRef`).
- Kort har én undertitel med det, der adskiller kortet fra sidens titel.
- Kilder (modelcommit, df-data-commit) og datotid står på siden (kortet "Data i denne kørsel" / fodnoter).

## 5. Skalaer

- **Samme enhed på en side ⇒ samme px pr. enhed** (skalagruppe): produktion pr. enhed, dens ΔRef og
  månedernes produktion deler MWh-gruppen. Pins (ΔRef%) har deres egen %-skala pr. graf (største |Δ%| ≈ 90 %).
- Gruppen er en `ScaleProvider` om siden (`src/ibcs/scale.tsx`); hver graf melder udstrækning og plads med
  `useSkalagruppe` (`ibcs-grafer.tsx`), og den mindste px pr. enhed gælder alle. En graf med mindre tal bliver kortere.
- En graf, der ikke kan dele skala (fx intervaldispatch i MW, spotpris), er en anden enhed og har sin egen akse.

## 6. Dokumenterede afvigelser

| # | Regel | Hvad | Hvorfor | Afbødning |
|---|---|---|---|---|
| AF1 | SI 2.2 / UN 3.2 (gråtrin i stablede søjler) | Intervaldispatch og stablede månedssøjler farver hver enhed med temaets **kategoriske serie** (fast plads pr. enhed) | 6–8 lag over op til 8.760 intervaller kan ikke skelnes i gråtrin; farven er enhedens identitet, ikke en vurdering | Kun i *sammensætning over tid*. Alle sammenligninger (Ref mod Scen, Δ) er i scenarienotation og virkningsfarver uden enhedskulører |
| AF2 | web-charts §7 (hvidt "papir") | Graferne følger temaets flade, også i mørk tilstand | Appen har fire temaer × lys/mørk med målt kontrast | Notationen er tokens pr. modus; `node scripts/kontrast.ts` måler AC/PL/Δ-farverne mod fladen i begge modi |
| AF3 | A8 (ingen værdiakse) | Tætte tidsgrafer (dispatch, tidsserier, varighedskurve) har værdiakse og hårfine gitterlinjer | Hundreder af intervaller kan ikke etiketteres | Tilladt undtagelse (SI 3.1: tætte grafer) |
| AF4 | A5 (farve med betydning) | Den højeste time i grundprofilen er fremhævet i accentfarve | Fremhævning af den værdi, kortets budskab nævner | Fremhævning er IBCS' egen markør (UN 5.1) |
| AF5 | SI 2.2 (ingen dekorativ farve) / UN 4 (størrelse vises med længde) | Tabellernes **Heatmap** farver cellens baggrund efter \|værdi\| | Brugerens ønske (runde 9): mønstret i en enhed × måned-tabel (hvem overtager hvilke måneder) skal kunne ses uden at læse hvert tal | Valgfrit og fra som standard (`Ingen`); farven følger polariteten (§2) og aldrig god/dårlig for neutrale størrelser; fortegnet står altid i tallet; skala og 100 % står i fodnoten (§8) |
| AF6 | UN 4.1 (samme farve = samme betydning) / E6 (neutral afvigelse er blå) | I tabellernes **Retning** og **Heatmap** er en neutral afvigelse blå, når den er positiv, og **orange**, når den er negativ — graferne tegner al neutral ΔRef blå | Briefens krav (runde 9): brugeren vil se, hvad der går op og ned i en enhed × måned-tabel; et blåt Δ for begge fortegn viser kun størrelsen | Kun når valgt (standard `Ingen` = blå for begge fortegn som graferne); fodnoten siger "blå = mere, orange = mindre" i netop den tabel; orange er en okker (`heatmap_ned`), ikke `delta_neg`, og bruges aldrig om god/dårlig. Påpeget af IBCS-reviewet (fund 1 og 3) og bevidst beholdt |

## 7. Komponenter

`src/ibcs/` er IBCS-referencekomponenterne fra `ibcs-web-charts`-skillen (MIT, © 2026 Sonni Simmelsgaard —
se `src/ibcs/LICENSE`; den fulde licens skrives ind i den byggede frontends `THIRD_PARTY_NOTICES.txt` via
`src/ibcs/notices.ts`, og `scripts/tjek_bundle.mjs` fejler, hvis den mangler), tilpasset appen: farver er appens tema-variabler (`src/ibcs/tema.ts`), talformat er
da-DK. Layoutfunktionerne er rene (`layout(rækker, valg) → mærker`), og hvert mærke bærer `data-role` /
`data-impact`, så `ibcs_lint.py dom` kan efterse en gemt side.

## 8. Tabellernes farvevalg (Ingen · Retning · Heatmap)

Tabeller med Δ eller niveauer pr. enhed × måned/periode har en lille segmenteret knap ved titlen (`FarveValg`,
`src/components/layout/Tabelfarve.tsx`; logikken i `src/lib/tabelfarve.ts`). Samme komponent overalt.

| Valg | Δ-tabeller | Niveau-tabeller |
|---|---|---|
| **Ingen** (standard) | som hidtil: tallet i virkningsfarven (§2) | ingen farve |
| **Retning** | kun tekstfarven efter fortegn: neutral (polaritet 0) **blå = mere, orange = mindre** (`heatmap_op`/`heatmap_ned`); med polaritet uændret god/dårlig | — (intet fortegn) |
| **Heatmap** | baggrund i 5 trin ∝ \|værdi\|: neutral blå/orange (*divergerende*, to neutrale nuancer — ikke god/dårlig), med polaritet temaets `delta_pos`/`delta_neg` | baggrund i én nuance: temaets stærkeste `sekventiel`-trin (*sekventiel*) |

- **Trinene**: trin *k* dækker \|værdi\| ∈ ((k−1)·20 %; k·20 %] af skalaens 100 %. Hver rampe blandes af én pol over fladen
  med andelene 0,22 · 0,40 · 0,58 · 0,78 · 1 (`HEAT_ANDEL`), så lysheden falder i næsten lige store skridt, trin 1 står
  med ≥ 1,35:1 mod fladen, og intensiteten er monoton i alle temaer pr. konstruktion. Trin 5 = polen = Retning-farven.
- **Tekstfarven på en farvet celle** er målt pr. tema og modus: temaets tekst, ellers fladen, ellers sort/hvid — den
  første med ≥ 4,5:1 på netop den baggrund (`laesbarTekst` i `tema-kerne.ts`). Ramperne skrives som tokens
  (`--fjv-heat-<op|ned|god|daarlig|niveau>-<1–5>[-tekst]`), så skærm og `node scripts/kontrast.ts` bruger samme hex.
- **En celle, der VISES som 0, får ingen farve** — 0, 0,00, 0,0 % og tal, der afrundes til 0 ved de viste decimaler, i
  niveau- og Δ-tabeller. `farvning()` kræver derfor cellens viste skala (faktor og decimaler), så farve og tal ikke kan
  være uenige (`r9_nul.spec.tsx` tester det på kørslens og sammenligningens månedstabeller). Tomme celler: ingen farve.
  Fortegnet står altid i tallet (farve er aldrig eneste bærer).
- **Knappen vises kun, hvor der er noget at farve** (fx ikke på balancekortet, når kun den ene kørsel har balancemarked).
- **Én skala pr. tabel**: 100 % = største \|værdi\| i månedscellerne; totalen (`Hele perioden`, `I alt`) har sin egen skala,
  så den ikke vasker månederne ud. **Samme størrelse og enhed på samme side = samme skala** (`HeatSkalaProvider`, som
  grafernes `ScaleProvider`): fx månedstabellens 'Hele perioden' og lagertabellens ΔRef (ΔMWh i perioden), og kørslens
  enhedstabel (MWh) og månedstabellens 'Hele perioden'. Tabeller med flere enheder (enhedstabellen) har én skala pr. kolonne.
- **Legenden står i fodnoten**: "Blå = mere end referencen, orange = mindre; jo kraftigere farve, jo større (5 trin à 20 %; kraftigst = …)".
  *Kraftigere*, ikke *mørkere*: i mørk tilstand er det stærkeste trin det lyseste.
- Valget huskes pr. bruger og slags (`fjv.tabelfarve.delta.v1`, `fjv.tabelfarve.niveau.v1` i localStorage, i try/catch —
  siden virker uden) og gælder alle tabeller af samme slags, også på andre sider.
