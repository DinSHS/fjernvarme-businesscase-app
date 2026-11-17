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

**Appens egne faner (runde 14).** Et ark, appen har eksporteret, bærer fanerne *Start og drift*, *Balancemarked* og
*Øvrige felter* (markeringen er format 3). Scriptet læser dem ikke; importen læser dem (`fjv.arklag`, kun
standardbiblioteket) og lægger værdierne oven på scriptets læsning — på arket og på basis ens. Hver værdi valideres
mod feltkataloget (`felt_katalog.json`, lagt ved motoren af `deploy.py kode`) og det færdige værk mod modellens
minimumskrav (`fjv.modelkrav`). Et nyt værk med faner er revision 2: revision 1 er scriptets læsning, revision 2
fanernes ændringer. Før scriptet kører, afvises rækker, det ville springe over uden besked (navn uden type, tank uden
volumen). Et ark uden fanerne importeres som før; et ark i format 2 afvises som revision.

Uden `import_id` tages alle ventende importer (FIFO). Bruger ikke solver-låsen.
Rapport: `Files/_run/fjv_importer_vaerksark.json`.
