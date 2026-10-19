# fjv_importer_vaerksark

Laver et uploadet værksark (`vaerksdata_skabelon.xlsx`) om til et **værk** og dets
**tidsserier** (KONTRAKT §6d). Appens Function `uploadVaerksark` gemmer filen i
`Files/fjv/uploads/<id>.xlsx`, opretter en `Vaerksarkimport`-række (`koe`) og starter
denne notebook med `import_id`.

1. Modelrepoets `scripts/vaerksark_til_yaml.py` køres **uændret** i solverens venv.
2. Casefilen flades til værk (kilde `app`, revision 1), solvarmens profilsti bliver
   markøren `tidsserie:solprofil`.
3. Varmelast og solprofil normaliseres og gemmes som uforanderlige filer + aktive
   `Tidsserie`-rækker (kilde `vaerksark`) — alt i én transaktion med importens status.

Uden `import_id` tages alle ventende importer (FIFO). Bruger ikke solver-låsen.
Rapport: `Files/_run/fjv_importer_vaerksark.json`.
