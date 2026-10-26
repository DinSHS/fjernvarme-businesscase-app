# IBCS i appen — notationsregler

Appens grafer, tabeller og nøgletal følger IBCS® Standards v2.0 (SIMPLIFY · UNIFY · CHECK), som de er omsat i
`ibcs-notation`-skillen (tokens i `src/ibcs/tokens.generated.ts`). Denne fil er appens **notationsmanual**: de få
steder, hvor domænet kræver et valg, IBCS ikke træffer, og de dokumenterede afvigelser. Visualspecs pr. side står i
`docs/ibcs/*.visual-spec.yaml`. Appen følger IBCS; den er ikke certificeret af IBCS Institute.

## 1. Scenarier: reference og scenarie

En kørsel er hverken AC (målt), PY (forrige periode), PL/BU (plan) eller FC (prognose): begge kørsler i en
sammenligning er **modelregnede**, og de adskiller sig kun ved det, scenariet ændrer (differensmetoden).
Appen har derfor to egne scenariekoder med faste IBCS-virkemidler — samme notation på alle sider:

| Kode | Betydning | Søjle/bjælke | Linje | Tabelhoved | Som Δ-akse (subtrahend) |
|---|---|---|---|---|---|
| **Scen** | Scenariet — det, spørgsmålet ændrer (minuend) | **fyldt mørk** (`--fjv-ac`) | mørk linje, fyldte markører | tyk mørk streg | — |
| **Ref** | Referencen — sammenligningsgrundlaget (subtrahend) | **omrids**: flade-farvet fyld, mørk kant (`--fjv-pl`) | mørk linje, hule markører | dobbelt tynd streg | **to tynde parallelle linjer** |

- **Δ = Scen − Ref** (`ΔRef`), relativ **ΔRef% = (Scen − Ref) / Ref** med fortegnet reference. Ref ≤ 0 eller
  tom → **N/A** (ingen pin). Afvigelser af procenter er **pp**.
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
| Driftsomkostning, Δ driftsomkostning | **t.kr.** (3.424 · +44,2) | **mio. kr.** med 2 decimaler (3,42) eller t.kr. for Δ |
| Balanceindtægt | t.kr. | t.kr. |
| Energi | MWh under 10.000, ellers GWh | MWh eller GWh, ét præfiks pr. skalagruppe |
| CO₂ | t | t |

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
- En graf, der ikke kan dele skala (fx intervaldispatch i MW, spotpris), er en anden enhed og har sin egen akse.

## 6. Dokumenterede afvigelser

| # | Regel | Hvad | Hvorfor | Afbødning |
|---|---|---|---|---|
| AF1 | SI 2.2 / UN 3.2 (gråtrin i stablede søjler) | Intervaldispatch og stablede månedssøjler farver hver enhed med temaets **kategoriske serie** (fast plads pr. enhed) | 6–8 lag over op til 8.760 intervaller kan ikke skelnes i gråtrin; farven er enhedens identitet, ikke en vurdering | Kun i *sammensætning over tid*. Alle sammenligninger (Ref mod Scen, Δ) er i scenarienotation og virkningsfarver uden enhedskulører |
| AF2 | web-charts §7 (hvidt "papir") | Graferne følger temaets flade, også i mørk tilstand | Appen har fire temaer × lys/mørk med målt kontrast | Notationen er tokens pr. modus; `node scripts/kontrast.ts` måler AC/PL/Δ-farverne mod fladen i begge modi |
| AF3 | A8 (ingen værdiakse) | Tætte tidsgrafer (dispatch, tidsserier, varighedskurve) har værdiakse og hårfine gitterlinjer | Hundreder af intervaller kan ikke etiketteres | Tilladt undtagelse (SI 3.1: tætte grafer) |
| AF4 | A5 (farve med betydning) | Den højeste time i grundprofilen er fremhævet i accentfarve | Fremhævning af den værdi, kortets budskab nævner | Fremhævning er IBCS' egen markør (UN 5.1) |

## 7. Komponenter

`src/ibcs/` er IBCS-referencekomponenterne fra `ibcs-web-charts`-skillen (MIT, © 2026 Sonni Simmelsgaard —
se `src/ibcs/LICENSE`), tilpasset appen: farver er appens tema-variabler (`src/ibcs/tema.ts`), talformat er
da-DK. Layoutfunktionerne er rene (`layout(rækker, valg) → mærker`), og hvert mærke bærer `data-role` /
`data-impact`, så `ibcs_lint.py dom` kan efterse en gemt side.
