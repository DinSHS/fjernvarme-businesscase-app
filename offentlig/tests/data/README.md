# Optaget output fra `npx rayfin up` (runde 7c)

Bruges af `offentlig/tests/test_installation.py` til at vise, at `scripts/installation.py rayfin-up` og `rayfin-db-apply`
returnerer ikke-0, når Rayfin-CLI'en melder en fejl, men selv slutter med exitkode 0.

* `rayfin_up_functions_fejl.txt`: den rigtige udskrift fra 2026-10-27 (functions manglede `host.json`; CLI'en sluttede med 0).
  Stier og id'er er erstattet med pladsholdere; linjen om et mislykket stille token-forsøg er udeladt.
* `rayfin_up_ok.txt`: den rigtige udskrift fra det fuldførte deploy samme dag, anonymiseret på samme måde.
* `rayfin_up_dab_fejl.txt`: SAMMENSAT af CLI'ens egne beskeder for en fejlet DAB-apply (rayfin-cli
  `dist/commands/up/up.js`: `Database apply failed: …` + `You can manually run 'rayfin up db apply' …`), som CLI'en ikke
  behandler som fatal - ikke en optagelse.
