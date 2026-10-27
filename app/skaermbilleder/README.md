# app/skaermbilleder — skærmbilleder og layouttjek (kræver en lokal harness)

`layout.mjs` (målbart layout: ingen vandret scroll, kort i samme række lige høje …), `tag.mjs` og `temaer.mjs`
(skærmbilleder pr. rute, bredde og tema) bygger appen med `vite.skaerm.config.ts` mod en **harness** med en falsk
Rayfin-klient og et udtræk af en installations database (`harness/fixtures.json`, hentet med `hent_fixtures.mjs`,
anonymiseret med `anonymiser.mjs`).

Harnessen er **ikke i repoet**, fordi udtrækket er en installations data. Uden den kan scripts her ikke køre. Skærmbillederne
i `doc/skaermbilleder/` er taget af den lokale udgave med `--demo` (modelrepoets egne cases) i temaet Nordisk.
