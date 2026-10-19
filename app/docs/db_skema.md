# Databasens faktiske skema — målt 2026-10-16 06:25 UTC via Function skemaInfo (SQL som app-ejer)

```
login: shs-aad-ai-tst@example.com

Aendringsanmodnings: id uniqueidentifier NN, aendringer_json nvarchar(4000) NN, anmodet datetime2 NN, anmodet_af nvarchar(200) NN, forventet_revision int NN, status nvarchar(7) NN, svar nvarchar(2000), vaerk_id uniqueidentifier NN

Aendringslogs: id uniqueidentifier NN, aendret_af nvarchar(200) NN, gammel_json nvarchar(4000), handling nvarchar(5) NN, ny_json nvarchar(4000), sti nvarchar(400) NN, tidspunkt datetime2 NN, vaerk_id uniqueidentifier NN, anmodning_id uniqueidentifier, revision int NN

Bestillings: id uniqueidentifier NN, bestilt datetime2 NN, bestilt_af nvarchar(200) NN, klient_noegle nvarchar(60) NN, scenarie_id uniqueidentifier NN

KoerselInputs: id uniqueidentifier NN, kilde nvarchar(8) NN, koersel_id uniqueidentifier NN, sti nvarchar(400) NN, vaerdi_json nvarchar(4000) NN

KoerselMaaneds: id uniqueidentifier NN, koersel_id uniqueidentifier NN, maaned nvarchar(7) NN, noegle nvarchar(120) NN, objekt nvarchar(120), vaerdi decimal(28,10)

KoerselNoegletals: id uniqueidentifier NN, enhed nvarchar(40), gruppe nvarchar(60) NN, koersel_id uniqueidentifier NN, noegle nvarchar(120) NN, objekt nvarchar(120), vaerdi decimal(28,10), marked nvarchar(20)

KoerselTimes: id uniqueidentifier NN, koersel_id uniqueidentifier NN, spotpris decimal(18,6), t_ude decimal(18,6), tid datetime2 NN, vaerdier_json nvarchar(4000) NN, varmelast_mw decimal(18,6) NN

Koersels: id uniqueidentifier NN, afsluttet datetime2, interval_min int, bestilt datetime2 NN, bestilt_af nvarchar(200) NN, case_sti nvarchar(400), data_commit nvarchar(40), er_milp bit, fabric_job_id nvarchar(100), fase nvarchar(200), fejlbesked nvarchar(4000), kilde nvarchar(8) NN, loesetid_s decimal(18,3), manifest_json nvarchar(4000), opnaaet_gap decimal(18,10), model_commit nvarchar(40), objektiv_dkk decimal(28,4), output_stem nvarchar(400), output_sti nvarchar(400), scenarie_id uniqueidentifier NN, solve_status nvarchar(60), startet datetime2, status nvarchar(10) NN, vaerk_id uniqueidentifier NN, antal_interval_csv int, antal_interval_model int, arbejder_id nvarchar(100), best_bound decimal(28,4), bestilling_id uniqueidentifier NN, forsoeg int NN, hjerteslag datetime2, input_hash nvarchar(64) NN, miljoe_json nvarchar(4000), oensket_abs_gap decimal(28,4), oensket_rel_gap decimal(18,10), oploesning nvarchar(10), vaerk_revision int NN, annuller_anmodet datetime2

ScenarieAendrings: id uniqueidentifier NN, raekkefoelge int NN, scenarie_id uniqueidentifier NN, sti nvarchar(400) NN, type nvarchar(7) NN, vaerdi_json nvarchar(4000)

Scenaries: id uniqueidentifier NN, arkiveret bit NN, balancing_method nvarchar(16), beskrivelse nvarchar(4000), ekstra_flag nvarchar(300), med_balancering bit NN, mip_rel_gap decimal(18,10), navn nvarchar(200) NN, oprettet datetime2 NN, oprettet_af nvarchar(200) NN, periode_slut nvarchar(20), periode_start nvarchar(20), tidsgraense_s int, vaerk_id uniqueidentifier NN, heat_csv nvarchar(300), mip_abs_gap decimal(28,4)

Users: Id uniqueidentifier NN, Email varchar(255) NN

VaerkParameters: id uniqueidentifier NN, aendret datetime2 NN, aendret_af nvarchar(200) NN, bekraeft bit NN, kommentar nvarchar(2000), objekt nvarchar(120), raekkefoelge int NN, sektion nvarchar(60) NN, sti nvarchar(400) NN, vaerdi_json nvarchar(4000) NN, vaerk_id uniqueidentifier NN

Vaerks: id uniqueidentifier NN, aendret datetime2 NN, aendret_af nvarchar(200) NN, arkiveret bit NN, beskrivelse nvarchar(4000), kilde nvarchar(4) NN, kilde_fil nvarchar(300), kode nvarchar(60) NN, kopieret_fra_id uniqueidentifier, navn nvarchar(200) NN, oprettet datetime2 NN, oprettet_af nvarchar(200) NN, repo_commit nvarchar(40), revision int NN

UNIKKE:
  Aendringsanmodnings(id) PK
  Aendringslogs(id) PK
  Bestillings(id) PK
  Bestillings(klient_noegle) UNIQUE
  KoerselInputs(id) PK
  KoerselMaaneds(id) PK
  KoerselNoegletals(id) PK
  KoerselTimes(id) PK
  Koersels(bestilling_id) UNIQUE
  Koersels(id) PK
  ScenarieAendrings(id) PK
  Scenaries(id) PK
  Users(Id) PK
  VaerkParameters(id) PK
  Vaerks(id) PK
  Vaerks(kode) UNIQUE
  objects(folder,path) UNIQUE
  objects(id) PK

CHECKS:
  Aendringsanmodnings: ([status]='afvist' OR [status]='udfoert' OR [status]='ny')
  Aendringsanmodnings: (len([aendringer_json])>=(2))
  Aendringsanmodnings: (len([anmodet_af])>=(1))
  Aendringslogs: ([handling]='slet' OR [handling]='ret' OR [handling]='opret')
  Aendringslogs: (len([aendret_af])>=(1))
  Aendringslogs: (len([sti])>=(1))
  Bestillings: (len([bestilt_af])>=(1))
  Bestillings: (len([klient_noegle])>=(1))
  KoerselInputs: ([kilde]='scenarie' OR [kilde]='aendring' OR [kilde]='vaerk')
  KoerselInputs: (len([sti])>=(1))
  KoerselInputs: (len([vaerdi_json])>=(1))
  KoerselMaaneds: (len([maaned])>=(1))
  KoerselMaaneds: (len([noegle])>=(1))
  KoerselNoegletals: (len([gruppe])>=(1))
  KoerselNoegletals: (len([noegle])>=(1))
  KoerselTimes: (len([vaerdier_json])>=(1))
  Koersels: ([kilde]='notebook' OR [kilde]='app')
  Koersels: ([status]='annulleret' OR [status]='fejl' OR [status]='faerdig' OR [status]='indlaeser' OR [status]='koerer' OR [status]='startet' OR [status]='koe')
  Koersels: (len([bestilt_af])>=(1))
  Koersels: (len([input_hash])>=(64))
  ScenarieAendrings: ([type]='disable' OR [type]='enable' OR [type]='set')
  ScenarieAendrings: (len([sti])>=(1))
  Scenaries: ([balancing_method]='activation_value' OR [balancing_method]='legacy')
  Scenaries: (len([navn])>=(1))
  Scenaries: (len([oprettet_af])>=(1))
  VaerkParameters: (len([aendret_af])>=(1))
  VaerkParameters: (len([sektion])>=(1))
  VaerkParameters: (len([sti])>=(1))
  VaerkParameters: (len([vaerdi_json])>=(1))
  Vaerks: ([kilde]='app' OR [kilde]='repo')
  Vaerks: (len([aendret_af])>=(1))
  Vaerks: (len([kode])>=(1))
  Vaerks: (len([navn])>=(1))
  Vaerks: (len([oprettet_af])>=(1))
```
