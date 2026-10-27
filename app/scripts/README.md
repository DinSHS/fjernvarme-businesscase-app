# app/scripts — værktøjer omkring brugerfladen

Kør fra `app/`. Hverdagsværktøjerne bruges af `npm`-scripts; resten er til udvikling og fejlsøgning mod en udrullet
Fabric-installation og er ikke en del af gaten.

## Hverdag (npm-scripts og gaten)

| Script | Gør | Kaldes af |
|---|---|---|
| `gate.mjs` | hele gaten for begge udgaver: tsc, eslint, vitest, build, bundletjek, trofasthed og modprøver | `npm run gate` |
| `med-backend.mjs` | kører en kommando med `VITE_BACKEND` sat (Windows-npm kan ikke `VAR=x cmd`) | `npm run test:community` |
| `tjek_bundle.mjs` | en færdig bundle: ingen rå dekoratorer, ingen private temaer eller navne, licensnoterne med | gaten |
| `gen_tokens.mjs` | IBCS-design-tokens → `src/ibcs/tokens.*.ts` | `npm run tokens` |
| `kontrast.ts` | WCAG-kontrast og farveblindhed for alle temaer (`node scripts/kontrast.ts`) | i hånden, efter et temaskift |
| `tjek_deployede_assets.mjs` | efter en udrulning: den statiske Fabric-app svarer med de byggede filer | `npm run tjek:deploy` |
| `open-fabric-portal.mjs` | åbner appen i Fabric-portalen | `npm run test:fabric` |

## Mod en udrullet Fabric-installation (udvikling)

Alle logger ind med et delegeret Entra-token **fra en fil** (aldrig på kommandolinjen) og læser appens adresse fra
`rayfin/.env`, som `rayfin up` skriver. De skriver kun testrækker med genkendelige navne ("Test …", `test_…`, `probe-…`).

| Script | Gør |
|---|---|
| `probe.mjs` | kald backend uden portal: `lister`, `policytest` (klientens rettigheder), `rigtig` (én kort Andeby-kørsel ende til ende), `fn`, `gql` |
| `bestilling_live.mjs` | bestillingsvejen under pres: kvote (3 i kø pr. bruger), samtidige bestillinger, annullering, status |
| `frys_live.mjs` | en tidsserie fryses ved bestilling og giver samme objektiv som modelrepoets fil |
| `tidsserie_live.mjs` | CSV-upload: gyldig, afvist, forkert sha256, hent, aktivér/deaktivér |
| `vaerksark_live.mjs` | værksark-upload og importen til et værk |
| `opret_live.mjs` + `guide_blade.ts` | "Opret værk" med guidens egen kode (`npx tsx scripts/guide_blade.ts …`) |
| `arkiver_scenarier.mjs`, `ryd_testdata.py` | ryd op efter prøverne: præcis de id'er, du giver (se også `fabric/ryd_tidsserier.py`) |
