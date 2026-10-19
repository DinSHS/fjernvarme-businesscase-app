# Kø-arbejder (fra appen): koersel_id = "" og ingen andre parametre -> tag køen.
# Bestemt kørsel:          koersel_id = "<uuid>".
# Manuel kørsel:           vaerk_kode + evt. resten. Opretter selv Scenarie +
#                          Bestilling + Koersel (kilde=notebook), når databasen findes.
koersel_id = ""
vaerk_kode = ""
scenarie_navn = ""
aendringer_json = "[]"        # [{"type": "set|enable|disable", "sti": "...", "vaerdi_json": "..."}]
start = ""                    # ÅÅÅÅ-MM-DD; tom = værkets time-blok
slut = ""
med_balancering = False
balancing_method = ""         # legacy | activation_value | tom
mip_rel_gap = ""              # tal som tekst, fx "0.0002"; tom = værkets
mip_abs_gap = ""
tidsgraense_s = ""
data_commit = ""              # fuld SHA; tom = den pinnede i fjv/konstanter.py
heat_csv = ""                 # filnavn i modelrepoets data/, fx "billund_abvaerk_hourly_splejset_jun2026.csv"
ekstra_flag = ""              # kun "--legacy-nettab" er tilladt
# Værkets egne tidsserier (KONTRAKT §6d): "" = værkets aktive (hvis nogen), et tidsserie-id,
# eller (kun varmelast) "syntetisk". Et heat_csv ovenfor er også et valg af varmelast.
tidsserie_varmelast = ""
tidsserie_solprofil = ""
# Flere kørsler i ét job: JSON-liste (eller en fil i lakehouset, "Files/...") i formen
# viden/demo_scenarier.json -> "koersler". Alle lægges i køen først, derefter køres de FIFO.
batch_json = ""
# KUN live-test af §6c: arbejderens proces dør hårdt efter N sekunder af en kørsel. 0 = fra.
test_doed_efter_s = 0
