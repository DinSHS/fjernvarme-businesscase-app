# fjv_importer_vaerker

Flader modelrepoets `cases/*.yaml` (ikke `heat_load_params_*`) ind som `Vaerk` +
`VaerkParameter` i appens database — én transaktion pr. værk.

- **Idempotent:** uændrede værker røres ikke (ingen ny revision).
- **Beskyttet:** et værk med `kilde = app` eller `revision > 1` overskrives kun med
  `overskriv = True`; overskrivning øger revisionen og logges i `Aendringslog`.
- Den oprindelige YAML gemmes i `Files/fjv/vaerker/<kode>/kilde.yaml` til visning.

Rapport: `Files/_run/fjv_importer_vaerker.json`.
