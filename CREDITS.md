# Kredit — hvad denne app bygger på

**Fjernvarme Businesscase (app)** er en **brugerflade til** den åbne driftsmodel
[`skj-1964/fjernvarme-businesscase`](https://github.com/skj-1964/fjernvarme-businesscase) (MIT) og de data,
modellen regner på, fra [`skj-1964/df-data`](https://github.com/skj-1964/df-data). **Metoden, valideringen og
referencetallene er den oprindelige forfatters** — appen lader dig se og rette et værk, bestille kørsler og læse
resultaterne; den gør ikke modellen bedre og ejer ikke dens resultater.

Denne fil er kreditten i **begge udgaver** af appen (Fabric-udgaven og den offentlige community-udgave). Den
gengiver kilderne og deres vilkår **ordret**; vores egne ord står uden for citaterne. `NOTICE` er den korte
udgave, og `tjek_offentlig.py` fejler, hvis denne fil, kreditlinjen i appen eller licenstekserne mangler.

## 1. Modellen — `fjernvarme-businesscase`

| | |
|---|---|
| Repo | https://github.com/skj-1964/fjernvarme-businesscase |
| Forfatter | Steen Kramer Jensen (`skj-1964`) |
| Udviklet sammen med | **Billund Varme** og **Dansk Fjernvarme** |
| Licens | MIT — `Copyright (c) 2026 Dansk Fjernvarme` |
| Pinnet commit | `eef950a2ac7b3808a9456dcf48742ce08e52366a` |
| Licenstekst | [`LICENSES/fjernvarme-businesscase_LICENSE.txt`](LICENSES/fjernvarme-businesscase_LICENSE.txt) — bytes fra den pinnede commit |

Modellens egen indledning, ordret fra dens `README.md` ved den pinnede commit:

> En åben MILP-driftsmodel for fjernvarmeværker, udviklet sammen med
> **Billund Varme** og **Dansk Fjernvarme**. Frigivet under MIT-licens,
> så andre værker kan regne på deres eget anlæg og bygge videre.

Og dens licensafsnit, ordret:

> MIT — se [`LICENSE`](LICENSE). Frit at bruge, ændre og videredistribuere,
> også kommercielt. Modellen er udviklet sammen med Billund Varme og
> Dansk Fjernvarme og deles, så andre værker kan bygge videre på den.

Rapporten om metode, antagelser og validering, [`doc/rapport_billund_v4.pdf`](https://github.com/skj-1964/fjernvarme-businesscase/blob/eef950a2ac7b3808a9456dcf48742ce08e52366a/doc/rapport_billund_v4.pdf),
og vejledningerne i `doc/` er forfatterens. De tekster fra modelrepoet, appen viser på dokumentationssiderne, er
kopieret **uændret** fra den pinnede commit og bærer deres kildelinje.

### Vi distribuerer ikke modellens kode

Dette repo indeholder **ikke** modellens kode (`run_case.py`, `src/` …). Appen **afhænger af den på en pinnet
commit** (`MODEL_COMMIT` i `fabric/fjv/konstanter.py`): når en kørsel regnes, henter regnemotoren præcis den commit
som zip fra GitHub og kører modellen uændret. Hver kørsel gemmer de fulde SHA'er, den brugte. Skift af pinnet version er
et bevidst valg, ikke en automatisk opdatering. Modellens MIT-licenstekst gengives alligevel her, fordi dens tekster
og dokumenter bundtes i appen.

## 2. Data — `df-data`

| | |
|---|---|
| Repo | https://github.com/skj-1964/df-data |
| Vedligeholdes af | Steen Kramer Jensen, Dansk Fjernvarme (efter datarepoets egen README) |
| Licens | scripts MIT; data CC BY 4.0 (se nedenfor) |
| Pinnet commit | `106b9fce9a2e3610090b1a542559024056449b88` |
| Licenstekst | [`LICENSES/df-data_LICENSE.txt`](LICENSES/df-data_LICENSE.txt) — bytes fra den pinnede commit |

Datarepoets egen beskrivelse af indholdet, ordret fra dets `README.md`:

> Cachede markeds- og vejrdata til brug i fjernvarme-driftsoptimeringsmodeller, primært til at understøtte modeller som [fjernvarme-businesscase](https://github.com/skj-1964/fjernvarme-businesscase).
>
> Repo'et indeholder råudtræk fra [Energinet Energi Data Service](https://www.energidataservice.dk/) (spotpris og balancemarkeder) og DMI-observationer (vejrdata via en proxy-API).

Dets licensafsnit, ordret:

> Data er offentlige fra Energinet (CC BY 4.0) og DMI (CC BY 4.0). Dette repo gør ingen krav på dem og frigiver dem under samme vilkår.
>
> Scripts: MIT.

Og noten nederst i dets `LICENSE`, ordret:

> Note: data files in this repository are derived from public sources
> (Energinet Energi Data Service and Danmarks Meteorologiske Institut),
> both published under CC BY 4.0. This repository redistributes them
> unmodified under the same terms. See README.md for details.

### De oprindelige kilder

| Kilde | Hvad | Vilkår |
|---|---|---|
| **Energinet — Energi Data Service** (energidataservice.dk) | spotpris, aFRR, mFRR (kapacitet og aktivering), ubalancepris | CC BY 4.0 (efter datarepoet) |
| **DMI** (Danmarks Meteorologiske Institut) — Frie Data | vejrobservationer pr. time (temperatur, globalstråling, vind, nedbør, tryk, fugtighed) | CC BY 4.0 (efter datarepoet) |
| **api.sysapp.dk** | den proxy-API, modellen og datarepoet henter markeds- og vejrdata gennem; Energi Data Service bruges til kontrol (efter modellens `README.md`, afsnittet *Data*) | **ikke angivet** i df-data eller modelrepoet — vi har ikke verificeret nogen vilkår og påstår ingen |

Appen viser den datadækning og den df-data-commit, hver kørsel faktisk brugte. Data, der indgår i en kørsel,
er Energinets og DMI's; appen gør ikke krav på dem. Brugerens egne værksdata (egne tidsserier, værksark) hører til
brugeren og er ikke omfattet af denne kredit.

## 3. Hvad appen er — og ikke er

- Appen er en **brugerflade til** modellen. Den er ikke modellen, og den ændrer ikke modellens metode.
- Referencetal, valideringer og anbefalinger, appen viser, stammer fra modelrepoet og dets rapport; hvor appen
  selv regner (fx sammenligning af to kørsler, månedsopdeling i dansk tid), står det i dens egen dokumentation.
- **Der foreligger ingen godkendelse eller tilslutning fra Dansk Fjernvarme, Billund Varme eller modellens
  forfatter.** Kreditten er en anerkendelse af, hvor modellen kommer fra, ikke en påstand om, at de står bag
  appen eller har gennemgået den. Ingen tekst, intet navn og intet logo i appen må tilsige andet.

## 4. Tredjepartskomponenter

Appens frontend og backend bygger på Rayfin-app-skabelonen (Microsoft, MIT — `app/LICENSE` bevares uændret) og
open source-pakker (React, Vite m.fl.), hvis licenser står i deres pakker (`app/package-lock.json`). Regnemotoren
installerer modellens egne pakkepins (modelrepoets `requirements.txt`: Linopy, HiGHS m.fl.) med deres respektive licenser.

## 5. Sådan holdes kreditten korrekt

- Pinnede commits står i `fabric/fjv/konstanter.py` (`MODEL_COMMIT`, `DF_DATA_SHA`). Skift dem **kun** sammen med
  denne fil og `app/src/sider/dokumentation/kilde.ts`; `tjek_offentlig.py` fejler, hvis de ikke er ens.
- Kreditfakta, som scriptet kontrollerer mod, står i `offentlig/kredit.json`.
- Licenstekserne i `LICENSES/` er hentet byte for byte; scriptet sammenligner deres SHA-256 (linjeskift normaliseret).
