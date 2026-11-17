# Måling: tegn pr. time i KoerselTime (runde 14b, 17. november 2026)

**Fejlen (Fabric, 16.–17. november):** et værk med 17 enheder og én tank, 8.–19. juni 2026 med balancemarked, blev løst,
men `fjv.resultater.timer` afviste resultaterne: `vaerdier_json er 4002 tegn kl. 2026-06-10T04:00:00Z (maks 4000)`.
Samme værk uden balancemarked: ca. 2.100 tegn (77 kolonner).

**Sådan er der målt:** `viden/vaerktoej/maal_timebredde.py`. Modelkode `90fb16e`, df-data `106b9fc`, `--mip-gap 0.01`
(gabet flytter tallene, ikke kolonnerne). Syntetisk værk = `cases/andeby.yaml` (6 enheder, 2 tanke) + N enheder med
neutrale navne, klonet fra Andebys typer på skift (varmepumpe, elkedel, gaskedel, halmkedel, gasmotor) med en
tredjedel af kildens `p_max_heat`. *Stress* = intet budvindue og et samlet budloft på 1000 MW (det værst tænkelige,
ikke et værk). *Kun el* = de ekstra enheder er kun varmepumper og elkedler, alle prækvalificeret til aFRR og mFRR.

Tegn = den bredeste time i vinduet, kompakt JSON som `fjv.resultater` skriver den. *Liste* = samme time som en liste
af tal uden kolonnenavne: den mindste kodning, der stadig er uafrundet.

## 8.–10. juni 2026 (71 timer), blandede typer

| Enheder | Kolonner u./m. bal. | Uden balancemarked | Med | Med, stress | Liste, med, stress |
|---:|---:|---:|---:|---:|---:|
| 6 (Andeby) | 27 / 57 | 600 | 1.813 | – | 381 (uden stress) |
| 12 | 36 / 102 | 836 | 3.608 | 3.657 | 751 |
| 20 | 50 / 152 | 1.208 | 5.436 | 5.614 | 1.156 |
| 30 | 66 / 216 | 1.626 | 7.846 | 8.161 | 1.673 |
| 40 | 82 / 280 | 2.051 | 10.276 | 10.706 | 2.188 |
| 60 | 114 / 408 | 2.893 | 15.134 | 15.821 | 3.243 |
| 100 | 178 / 664 | 4.569 | 24.799 | 25.849 | 5.151 |

5.–7. januar 2026 giver det samme billede: 40 enheder med balancemarked 10.681 tegn (stress 10.846; liste 2.328).

## Kun elenheder, stress (det værst tænkelige)

| Enheder | Kolonner | Vindue | Objekt | Liste | Rækker pr. time efter runde 14b |
|---:|---:|---|---:|---:|---:|
| 40 | 499 | januar | 20.987 | **4.612** | 6 |
| 40 | 499 | juni | 20.678 | 4.303 | – |
| 60 | 759 | januar | 32.031 | 6.866 | – |
| 100 | 1.279 | januar | 52.113 | 9.368 | 14 |

## Hvad tallene siger

* Med balancemarked fylder hver bydende enhed 12 kolonner (6 pr. marked), og fire af dem er uafrundede kroner/MWh
  med op til 17 cifre (`_activated_mwh`, `_cap_revenue_dkk`, `_act_revenue_dkk`, `_act_gross_dkk`). Grænsen på
  4.000 tegn nås ved ca. 12 enheder med balancemarked og ca. 90 uden.
* Kolonnenavnene er ca. 80 % af tegnene, men selv uden dem fylder 40 elenheder 4.612 tegn. **Ingen kodning inden for
  4.000 tegn bærer et værk med 40 enheder og balancemarked uden at afrunde** - og afrunding er udelukket
  (`doc/TROFASTHED.md`).
* `NVARCHAR(MAX)` er udelukket i Fabric: DAB kan ikke bygge sit GraphQL-skema af den (`fjv.constants.ts`, `MAKS`).
* Derfor flere rækker pr. time: `KoerselTimeDel` (skemaversion 2). 40 elenheder = 6 rækker pr. time, 100 = 14.
