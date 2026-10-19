# Hvad er modellen?

En økonomisk optimering af et fjernvarmeværk over en valgt periode. For hver time vælger den
samtidig, hvilke enheder der producerer og hvor meget, om tanken lades eller aflades, og hvor meget
varmepumper og elkedler byder ind i balancemarkedet. Varmebehovet skal dækkes i hver time, og
modellen finder den billigste drift: brændsel, el, tariffer, afgifter og starter, fratrukket elsalg
fra kraftvarme og betaling fra balancemarkederne. (Kilde: rapport v4 §1)

Det er et **blandet heltalsproblem (MILP)**, fordi nogle kedler har minimumslast, minimum
driftstid og startomkostning, som kræver tænd/sluk-variable. Det løses med den åbne solver HiGHS.
(Kilde: rapport v4 §1; README.md:10-11)

## Tre egenskaber, I skal kende

- **Den kender fremtiden.** Modellen ser hele periodens spotpriser, vejr og balancepriser på én
  gang. Den regner, hvad driften *burde* have været, ikke hvad man kunne have planlagt. Det gør
  absolutte tal for høje, mest for balancemarkedet.
- **Den er så god som sine data.** Alle antagelser om anlægget står i værkets konfiguration.
  Modellen producerer altid et resultat, også når en antagelse er forkert.
- **Den er bygget til differenser.** "Hvad er tanken værd" besvares ved at regne med og uden tank.

(Kilde: rapport v4 §1)

## Enhedstyper

Syv typer: varmepumpe, elkedel, biomassekedel (halm, flis eller træpiller), gaskedel, gasmotor
(kraftvarme), solvarme og overskudsvarme. (Kilde: rapport v4 §2.1; doc/EGET_VAERK.md:31-34)
