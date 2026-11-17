# bred_40el — et bredt værks `_hourly.csv` (runde 14b)

Tre timer (række 1, 16 og 17) af modellens `_hourly.csv` for et syntetisk værk: Andeby + 34 elenheder med neutrale
navne, alle prækvalificeret til aFRR og mFRR, intet budvindue, samlet budloft 1000 MW. Modelkode `90fb16e`, df-data
`106b9fc`, 5.–7. januar 2026 med balancemarked, `--mip-gap 0.01`:

    python viden/vaerktoej/maal_timebredde.py 34 --model <modelrepo ved 90fb16e> --df-data <df-data ved 106b9fc> \
        --ud C:\fjvm --balancering --stress --kun-el

499 kolonner. Den bredeste time (2026-01-05T16:00) fylder 20.987 tegn som ét JSON-objekt og 4.612 som en liste uden
kolonnenavne. `_fjv.json` er skåret ned til `stem` og `dt_timer`: testene bruger kun timefilen. Tallene er modellens,
uændrede; ingen rækker er rettet.
