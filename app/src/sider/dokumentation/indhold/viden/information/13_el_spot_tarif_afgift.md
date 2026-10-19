# El: spotpris, tarif og afgift

**Spotprisen** kommer time for time fra datarepoet df-data for værkets priszone (DK1 vest for
Storebælt, DK2 øst for). Fra 1. oktober 2025 findes kvarterpriser. (Kilde: README.md:182-185;
cases/andeby.yaml:22)

## Hvad en MWh varme koster pr. enhedstype

| Enhed | Pris pr. MWh varme |
|---|---|
| Varmepumpe, elkedel | (spot + forbrugstarif + elafgift) / COP + D&V |
| Biomasse- og gaskedel | brændselspris / virkningsgrad + CO₂ + D&V |
| Gasmotor (kraftvarme) | som en kedel, minus α × (spot − produktionstarif) for den solgte el |
| Overskudsvarme | prisen pr. MWh + D&V |
| Solvarme | D&V |

(Kilde: src/model.py:31-110) En elkedel har COP 1; varmepumpens COP følger udetemperaturen.

## Tarif

Forbrugstariffen kan være **én fast sats** eller en **båndprofil** fra netselskabets prisblad:
bånd (fx lav, høj, spids), sæsoner (fx vinter oktober–marts, sommer april–september) og hverdag
mod weekend og helligdage. Opslaget sker på dansk lokaltid; danske helligdage er indbygget, store
bededag er ikke med fra 2024. (Kilde: src/tariff.py:1-24; src/tariff.py:59-83; cases/andeby.yaml:210-230)

Timeintervallerne er halvåbne: "06-21" dækker time 6 til og med 20. (Kilde: cases/andeby.yaml:208-209)

**Produktionstariffen** trækkes fra gasmotorens elsalg. (Kilde: src/model.py:103-108)

## Elafgift

Elafgiften lægges til elprisen for alle el-forbrugende enheder (`electricity_tax`). Står den også i
tarifprofilen (`elafgift_net`), er det kun som dokumentation, og de to tal skal være ens — ellers
afvises værket. (Kilde: src/tariff.py:165-184)

## To ting at vide

- Satserne er **faste i hele perioden**. Et vindue over to afgiftsår regnes med ét års satser.
  (Kilde: cases/andeby.yaml:75-80)
- I balancemarkedets aktiveringsværdi regnes det sparede forbrug med den **faste** tarif plus
  elafgift, også når en båndprofil er sat. Den faste sats er derfor ikke ligegyldig.
  (Kilde: src/data_loader_github.py:690-698)
