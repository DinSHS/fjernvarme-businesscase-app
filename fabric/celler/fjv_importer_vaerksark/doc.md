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

**Genupload som revision (runde 12).** Bærer anmodningen bag importen en `basis_sha256`, er arket eksporteret af
appen: scriptet køres også på basis (`<id>_basis.xlsx`, appens nye eksport af værkets revision), og kun forskellen
mellem de to læsninger gemmes på værket (`fjv.revision`) — parametre + revisionslog som `udfoerAendring`,
`forventet_revision` tjekket i samme transaktion, ændrede timer som en ny aktiv tidsserie. Ingen forskel = intet gemt.

**Bindingen til værket (runde 12b, Codex K11).** Klientens hash beviser ikke, hvor arket kommer fra. Importen kræver
derfor, at arket og basis bærer samme markering (`_app`, format 2) for anmodningens værk og revision, at markeringens
*grundlag* (sha256 af værkets parametre og aktive seriers sha256) er værkets nuværende — beregnet fra de låste rækker i
transaktionen — og at scriptets læsning af basis er værket bortset fra markeringens erklærede *afvigelser*. Scriptets
objektnavne (`slug()`) føres tilbage til værkets; to kandidater afvises. En tidsserieændring øger også revisionen
(Aendringslog `tidsserie.<rolle>`).

Uden `import_id` tages alle ventende importer (FIFO). Bruger ikke solver-låsen.
Rapport: `Files/_run/fjv_importer_vaerksark.json`.
