# Temaer

Appens farver, skrift og runding er et **tema**: én JSON-fil med en `lys` og en `moerk` udgave. Brugeren vælger
tema og lys/mørk/system i topbjælken (palet-knappen); valget huskes i browseren. Uden et gemt valg følger
lys/mørk styresystemets indstilling (`prefers-color-scheme`).

## De medfølgende temaer

| Fil | Navn | Udgave | Idé |
|---|---|---|---|
| `src/styles/temaer/nordisk.json` | Nordisk | begge | **Basistema** og standard i den offentlige udgave. Kølige skifergrå flader, fjordblå handlinger. |
| `src/styles/temaer/varme.json` | Varme | begge | Fjernvarmens farver: varmrøde handlinger, en signaturstribe fra fremløbsrød til orange. |
| `src/styles/temaer/hoej_kontrast.json` | Høj kontrast | begge | Sort/hvid, kraftige kanter, en fokusring der ikke kan overses. Til svagsynede og skarpt lys. |
| `src/styles/temaer/papir.json` | Papir | begge | Som en trykt rapport: serif-brødtekst, sort blæk, farve kun hvor den betyder noget. |
| `src/styles/temaer/privat/*.json` | **lokale temaer** (en installations eget) | **ikke i repoet** | Mappen er git-ignoreret; se *Dit eget tema, lokalt* nedenfor. |

Standardtemaet er det installerede tema med **højest `standard`**. Et lokalt tema med `standard: 100` er derfor standard i en
Fabric-installation; uden det er Nordisk standard. `privat/` indlæses kun gennem Fabric-udgavens backend-modul
(`src/backend/rayfin/temaer.ts`; `src/backend/rest/temaer.ts` er tom), så en community-bundle aldrig får dem med
(`scripts/tjek_bundle.mjs` håndhæver det).

## Dit eget tema, lokalt (en organisations tema)

Repoet indeholder **ingen organisations tema** — kun de fire neutrale. Vil din installation bruge sit eget (farver efter jeres egen
profil), så læg det som en fil `src/styles/temaer/privat/<id>.json` i din egen kopi og byg (`npm run build`):

1. Filen følger formatet nedenfor. Giv den `standard: 100`, hvis den skal være standard i Fabric-installationen.
2. Mappen `privat/` er **git-ignoreret**: temaet kommer ikke i repoet, og `scripts/tjek.py` afviser en fil dér, hvis nogen
   alligevel tvinger den ind (`git add -f`). Navnet på din organisation hører til i `config/forbud.lokal.json` (også lokal), så gaten
   også stopper navnet i tekst og kode (se SYNKRONISERING.md).
3. Er temaet efter en *anden* organisations offentlige profil, skal det være `uofficielt: true` med `maerke` og `kilder` (se tabellen),
   og må ikke bære organisationens navn eller logo i sidehovedet. Vis det aldrig offentligt uden organisationens lov.
4. Tjek kontrasten, før temaet tages i brug (afsnittet *Tjek et tema* nedenfor).

**Community-installation** (færdigbygget wheel): læg i stedet en `temaer.json` ved siden af `index.html` — se *Lægge et eget tema ind*.

## Lægge et eget tema ind

**Når du bygger selv:** læg filen i `src/styles/temaer/` og byg — alle `*.json` dér indlæses automatisk i begge
udgaver (i `privat/` kun i Fabric-udgaven).

**I en færdig installation (community-udgaven):** læg en fil `temaer.json` ved siden af appens `index.html` — ét
tema eller en liste af temaer. Appen henter den ved start (kun i et produktionsbyg); findes den ikke, sker der
intet. Et ugyldigt tema afvises med en advarsel i browserkonsollen, og appen kører videre med de andre.

## Formatet

Et tema behøver kun det, der adskiller det: **mangler en nøgle, arves den fra Nordisk i samme modus.**

```json
{
  "id": "mit_vaerk",
  "navn": "Mit værk",
  "beskrivelse": "En sætning, der vises i temavælgeren.",
  "standard": 50,
  "lys":   { "primaer": "#004f6e", "accent": "#00668f", "fokus": "#00668f", "signatur": ["#004f6e", "#00a0c6"] },
  "moerk": { "primaer": "#0a6f94", "accent": "#5cc4e8", "fokus": "#5cc4e8", "signatur": ["#5cc4e8"] }
}
```

| Felt | Krav |
|---|---|
| `id` | 2–40 tegn `a-z 0-9 _ -`; unikt |
| `navn`, `beskrivelse` | tekst |
| `standard` | tal (valgfrit, 0); højest vinder som standard |
| `uofficielt` | sæt den for et tema efter en organisations offentlige profil, som organisationen ikke har godkendt. Kræver `kilder` og `maerke`. Ingen logoer, intet navn i sidehovedet. |
| `maerke` | teksten, vælgeren viser i stedet for beskrivelsen, når temaet ikke er godkendt — den skal sige netop det (mindst 20 tegn) |
| `kilder` | `[{ "rolle", "farve", "kilde", "dato": "ÅÅÅÅ-MM-DD", "metode"? }]` — hvor hver farve stammer fra |
| `skrift` | `{ "base"?, "tal"? }` — CSS `font-family`-lister (ingen `; { }`); `tal` bør have faste cifre |
| `form` | `{ "radius_kort"?, "radius_felt"? }` — px, 0–24 |
| `lys`, `moerk` | farvetokens, alle `#rrggbb` (se nedenfor) |

### Farvetokens (pr. modus)

| Token | Bruges til | Målt krav (WCAG AA) |
|---|---|---|
| `baggrund` | sidens baggrund | — |
| `flade` | kort, topbjælke, felter | — |
| `flade_haevet` | mærker, segmenter, tom-tilstand | — |
| `flade_hover`, `flade_valgt` | række under musen / valgt række | tekst ≥ 4,5:1 på begge |
| `tekst`, `tekst_2` | brødtekst, sekundær tekst | ≥ 4,5:1 på alle flader |
| `tekst_3` | fodnoter, tabelhoveder | ≥ 4,5:1 på baggrund, flade, flade_haevet |
| `streg` | kortkanter, skillelinjer (dekoration) | — |
| `streg_felt` | formularfelters og sekundære knappers kant | ≥ 3:1 mod flade (WCAG 1.4.11) |
| `gitter` | gitterlinjer og rækkeskel | — |
| `primaer`, `primaer_tekst` | knap, aktiv fane; teksten på dem | tekst ≥ 4,5:1 på primaer; primaer ≥ 3:1 mod flade |
| `accent` | links, enkeltserie i grafer | ≥ 4,5:1 som tekst |
| `accent_2` | sekundær accent (citatstreg, bånd) | — |
| `fokus` | fokusring | ≥ 3:1 mod flader |
| `pos`, `neg`, `advarsel` | statustekst og -mærker | ≥ 4,5:1; pos/neg skal kunne skelnes ved farveblindhed |
| `ac`, `py`, `pl` | IBCS faktisk / forrige år / plan | ≥ 3:1; AC og PY tydeligt forskellige |
| `heatmap_op`, `heatmap_ned` | tabellernes farvevalg (`IBCS.md` §8): Retning-farven for mere/mindre end referencen og den kraftigste heatmap-celle (blå / orange i de neutrale temaer). Heatmappets 5 trin pr. rampe (op, ned, god, dårlig og niveau = stærkeste `sekventiel`-trin) blandes over `flade`, og deres tekstfarve regnes af `heatRamper()` | ≥ 4,5:1 på `flade`; op/ned kan skelnes ved farveblindhed; hver celles tekst ≥ 4,5:1 på sin egen baggrund, og trinene bliver stærkere mod fladen |
| `delta_pos`, `delta_neg`, `delta_neutral` | IBCS-virkning af en afvigelse: **god**, **dårlig**, **neutral** (ikke fortegn — se `IBCS.md` §2). Blågrøn / rød / blå i de neutrale temaer | ≥ 4,5:1 på `flade` (mærker *og* farvede tal); alle tre par kan skelnes ved farveblindhed |
| `serie` (8) | kategoriske serier, fast rækkefølge (aldrig cyklet) | hver ≥ 3:1 — også ved 85 % opacitet (analysernes lagdelte flader); **alle par** (ikke kun naboer) ΔE ≥ 6 (mål 8) under protan/deutan og ≥ 15 normalt: hver enhed i et værk har sin plads, og alle står i samme graf |
| `serie_oevrige` | 9.+ kategori ("øvrige") | ≥ 3:1 (også ved 85 %); mod hver serie samme afstandskrav som serierne |
| `sekventiel` (5) | størrelse, svag → stærk | stigende kontrast mod fladen; trin 5 ≥ 3:1 |
| `divergerende` (5) | negativ ← neutral → positiv | neutral midte; stigende mod polerne; poler ≥ 3:1 |
| `signatur` (1–4) | striben øverst, 4-1-1 | — |
| `skygge_kort` | `box-shadow` på kort, eller `"none"` | — |

## Tjek et tema — altid før det tages i brug

```
node scripts/kontrast.ts                        # alle temaer under src/styles/temaer/
node scripts/kontrast.ts sti/til/mit_tema.json  # plus et ekstra
```

Ud over tokens mod rene flader måler scriptet de **sammensatte** flader, skærmen viser: tekst på statusmærkernes
tonede baggrund, fejlboksen og knapper under mus/tryk. De beregnes i `tema-kerne.ts` (`afledte()`) og skrives selv som
tokens (`--fjv-maerke-ok-bg` …), så CSS'en aldrig blander bag tekst med `color-mix`, og måling og skærm bruger samme hex.
Opacity på indhold er forbudt (kun deaktiverede kontroller) — en test håndhæver det.

Exit 0 = 0 brud. Scriptet måler hver regel i tabellen ovenfor i begge modi, og farveblindhed med
Machado-Oliveira-Fernandes (2009) ved fuld styrke. Det er ikke et skøn: tallene står i outputtet. `npx vitest run`
kører de samme mål på alle bundtede temaer.

## Fra tema til skærm

`src/styles/tema.ts` skriver tokens ind på de CSS-variabler, appen bruger (`--dash-*`, `--color-*`,
`--fjv-serie-*`, `--fjv-ac` …; tabellen står i `src/styles/tema-kerne.ts`, `CSS_VARIABLER`) og sætter
`data-tema`, `data-modus` og `.dark` på `<html>`. Sider bruger aldrig hex-farver — kun variablerne.

Til skærmbilleder og links: `?tema=<id>&modus=lys|moerk` i URL'en (gemmes ikke).
