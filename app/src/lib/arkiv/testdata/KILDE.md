# arkiv_skemaversion1.xlsx

Et arkiv eksporteret af appen ved commit `cd77e79` (skemaversion 1, før `KoerselTimeDel`, runde 14b) - med appens
egen `eksporterFamilie` over testdatabasen `eksempelDb(24, true)` (rayfin/functions/test/arkiv-hukommelse.ts):
syntetiske data, intet fra en installation. Testen `arkiv.spec.ts` › *et arkiv fra skemaversion 1* kræver, at det
stadig kan læses og importeres. Lav det ikke om med den nye kode: så tester det ikke længere det gamle format.
