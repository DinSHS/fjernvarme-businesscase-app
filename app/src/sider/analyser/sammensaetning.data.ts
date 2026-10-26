//-----------------------------------------------------------------------
// GENERERET af _byg/byg_sammensaetning.py fra viden/demo_scenarier.json,
// viden/referencetal.json (gruppen readme) og viden/app_tekster/ordliste.md
// (fv-ekspert). Ret ikke i hånden.
// Modelcommit: eef950a2ac7b3808a9456dcf48742ce08e52366a · 12 demo-kørsler · 9 par · 5 README-referencer
//-----------------------------------------------------------------------

export const DEMO_KOERSLER: readonly { id: string; navn: string; vaerk_kode: string }[] = [
 {
  "id": "D01",
  "navn": "Demo: Andeby vinter — reference",
  "vaerk_kode": "andeby"
 },
 {
  "id": "D02",
  "navn": "Demo: Andeby vinter — uden tankene",
  "vaerk_kode": "andeby"
 },
 {
  "id": "D03",
  "navn": "Demo: Andeby vinter — uden varmepumpen",
  "vaerk_kode": "andeby"
 },
 {
  "id": "D04",
  "navn": "Demo: Andeby vinter — gaspris +20 %",
  "vaerk_kode": "andeby"
 },
 {
  "id": "D05",
  "navn": "Demo: Andeby vinter — med den gamle 12 MW elkedel",
  "vaerk_kode": "andeby"
 },
 {
  "id": "D06",
  "navn": "Demo: Andeby vinter — med balancemarked",
  "vaerk_kode": "andeby"
 },
 {
  "id": "D07",
  "navn": "Demo: Andeby vinter — med balancemarked, uden tankene",
  "vaerk_kode": "andeby"
 },
 {
  "id": "D08",
  "navn": "Demo: Andeby vinter — balancemarked, kender aktiveringerne",
  "vaerk_kode": "andeby"
 },
 {
  "id": "D09",
  "navn": "Demo: Billund Spor B — med balancemarked",
  "vaerk_kode": "billund_sporb"
 },
 {
  "id": "D10",
  "navn": "Demo: Billund Spor B — uden balancemarked",
  "vaerk_kode": "billund_sporb"
 },
 {
  "id": "D11",
  "navn": "Demo: Andeby helår — uden balancemarked",
  "vaerk_kode": "andeby"
 },
 {
  "id": "D12",
  "navn": "Demo: Andeby helår — med balancemarked",
  "vaerk_kode": "andeby"
 }
];

export const DEMO_PAR: readonly { id: string; reference: string; scenarie: string; spoergsmaal: string; knap: string | null }[] = [
 {
  "id": "P1",
  "reference": "D01",
  "scenarie": "D02",
  "spoergsmaal": "Hvad er Andebys tanke værd i en vinteruge uden balancemarked?",
  "knap": "tankens_vaerdi"
 },
 {
  "id": "P2",
  "reference": "D01",
  "scenarie": "D03",
  "spoergsmaal": "Hvad er varmepumpen værd i en vinteruge?",
  "knap": "enhedens_vaerdi"
 },
 {
  "id": "P3",
  "reference": "D01",
  "scenarie": "D04",
  "spoergsmaal": "Hvor følsom er Andebys vinterøkonomi for gasprisen?",
  "knap": "braendselspris"
 },
 {
  "id": "P4",
  "reference": "D01",
  "scenarie": "D05",
  "spoergsmaal": "Hvad sparer en ekstra 12 MW elkedel i en vinteruge (investeringsspørgsmål)?",
  "knap": "ny_enhed"
 },
 {
  "id": "P5",
  "reference": "D01",
  "scenarie": "D06",
  "spoergsmaal": "Hvad er balancemarkedet værd for Andeby i en vinteruge?",
  "knap": "balancemarkedets_vaerdi"
 },
 {
  "id": "P6",
  "reference": "D06",
  "scenarie": "D07",
  "spoergsmaal": "Er tanken mere værd, når balancemarkedet er åbent?",
  "knap": "tankens_vaerdi"
 },
 {
  "id": "P7",
  "reference": "D06",
  "scenarie": "D08",
  "spoergsmaal": "Hvor meget puster perfekt kendskab til aktiveringerne balancetallet op?",
  "knap": "budstrategi_viden"
 },
 {
  "id": "P8",
  "reference": "D10",
  "scenarie": "D09",
  "spoergsmaal": "Hvad var balancemarkedet værd for Billund i marts–juni 2026 med den reservation, værket faktisk stillede?",
  "knap": "balancemarkedets_vaerdi"
 },
 {
  "id": "P9",
  "reference": "D11",
  "scenarie": "D12",
  "spoergsmaal": "Hvad er balancemarkedet værd for Andeby over et helt år?",
  "knap": "balancemarkedets_vaerdi"
 }
];

/** referencetal.json med kun gruppen "readme" — læses med `laesReferencer` (information/referencer.ts). */
export const README_REFERENCER_JSON = "{\"grupper\":[{\"id\":\"readme\",\"navn\":\"README-referencetal (gældende)\",\"kilde\":\"README.md:164-195\",\"koert\":\"2026-10-19 ved d813e6b (samme kode som eef950a), efter rettelserne samme dag: tankens første time følger lagerbalancen, og en aktiveret MWh værdisættes uden spotprisen; robust reservation som standard; rullende Billund-cases med flis- og halmkedel slukket 1. juli\",\"referencer\":[{\"id\":\"spora_anker\",\"navn\":\"Spor A-anker\",\"vindue\":\"2. marts–23. juni 2026\",\"vaerk\":{\"kode\":\"billund_spora\",\"kilde_fil\":\"cases/billund_sporA.yaml\"},\"scenarie\":{\"navn\":\"Spor A-anker\",\"periode_start\":null,\"periode_slut\":null,\"med_balancering\":true,\"balancing_method\":null,\"mip_rel_gap\":null,\"mip_abs_gap\":null,\"tidsgraense_s\":null,\"ekstra_flag\":null,\"heat_csv\":null},\"aendringer\":[],\"case_gab\":{\"mip_rel_gap\":0.005,\"mip_abs_gap\":5000,\"time_limit_s\":600,\"kilde\":\"kodens standard, casen har ingen solver-blok (doc/KOERSEL.md:64-66)\"},\"forventet\":{\"objektiv_dkk\":5069729,\"tolerance_dkk\":25349},\"loesetid\":\"2–3 minutter (sandkasse, 2 kerner); 4,5 min lokalt (8 kerner)\",\"kommando\":\"python run_case.py cases/billund_sporA.yaml --data-source github --with-balancing\",\"noter\":[\"Syntetisk varmelast (intet heat_csv), DMI-område fyn.\",\"Slutter 23. juni, fordi ankeret er regnet før den sidste uge af juni blev splejset ind.\"],\"kilde\":\"README.md:176; README.md:182; README.md:186-187\",\"genskabt\":[{\"af\":\"fv-model, lokalt: run_case.py uændret ved eef950a med README's kommando, df-data 106b9fc, app-venv (linopy 0.10.0, highspy 1.15.1), 8 kerner\",\"dato\":\"2026-10-26\",\"objektiv_dkk\":5069729,\"status\":\"optimal (gab under casens 0,5 %), 272 s\",\"kilde\":\"rapporter/fv-model.md\"}]},{\"id\":\"sporb\",\"navn\":\"Spor B\",\"vindue\":\"2. marts–30. juni 2026\",\"vaerk\":{\"kode\":\"billund_sporb\",\"kilde_fil\":\"cases/billund_sporB.yaml\"},\"scenarie\":{\"navn\":\"Spor B\",\"periode_start\":null,\"periode_slut\":null,\"med_balancering\":true,\"balancing_method\":null,\"mip_rel_gap\":null,\"mip_abs_gap\":null,\"tidsgraense_s\":null,\"ekstra_flag\":null,\"heat_csv\":\"billund_abvaerk_hourly_splejset_jun2026.csv\"},\"aendringer\":[],\"case_gab\":{\"mip_rel_gap\":0.005,\"mip_abs_gap\":5000,\"time_limit_s\":600,\"kilde\":\"kodens standard (doc/KOERSEL.md:64-66)\"},\"forventet\":{\"objektiv_dkk\":4204128,\"tolerance_dkk\":21021},\"loesetid\":\"2–3 minutter (sandkasse, 2 kerner); 6 min lokalt (8 kerner)\",\"kommando\":\"python run_case.py cases/billund_sporB.yaml --data-source github --with-balancing --heat-csv data/billund_abvaerk_hourly_splejset_jun2026.csv\",\"noter\":[\"Mod Billunds afregning marts–juni 2026 (ex post): 120 % (aFRR 109 %, mFRR 129 %) efter rettelserne 19/10; rapport v4 fik 121 % før dem.\"],\"kilde\":\"README.md:177; README.md:197-198\",\"genskabt\":[{\"af\":\"fv-model, lokalt: run_case.py uændret ved eef950a med README's kommando, df-data 106b9fc, app-venv (linopy 0.10.0, highspy 1.15.1), 8 kerner\",\"dato\":\"2026-10-26\",\"objektiv_dkk\":4204128,\"status\":\"optimal (gab under casens 0,5 %), 363 s\",\"kilde\":\"rapporter/fv-model.md\"}]},{\"id\":\"billund_rullende\",\"navn\":\"Billund rullende år\",\"vindue\":\"juli 2025–juni 2026\",\"vaerk\":{\"kode\":\"billund_spora_rullende\",\"kilde_fil\":\"cases/billund_sporA_rullende.yaml\"},\"scenarie\":{\"navn\":\"Billund rullende år, med balancering\",\"periode_start\":null,\"periode_slut\":null,\"med_balancering\":true,\"balancing_method\":null,\"mip_rel_gap\":null,\"mip_abs_gap\":null,\"tidsgraense_s\":null,\"ekstra_flag\":null,\"heat_csv\":\"billund_abvaerk_hourly_splejset_jun2026.csv\"},\"aendringer\":[],\"case_gab\":{\"mip_rel_gap\":0.005,\"mip_abs_gap\":5000,\"time_limit_s\":600,\"kilde\":\"kodens standard (doc/KOERSEL.md:64-66)\"},\"forventet\":{\"objektiv_dkk\":21773827,\"tolerance_dkk\":108869},\"loesetid\":\"ca. 8 minutter (sandkasse, 2 kerner)\",\"kommando\":\"python run_case.py cases/billund_sporA_rullende.yaml --data-source github --with-balancing --heat-csv data/billund_abvaerk_hourly_splejset_jun2026.csv\",\"noter\":[\"Rapport v4 tabel 4.1 (20.341.652, med tank og balancemarked) er regnet før rettelserne 19/10 og kan ikke sammenlignes.\"],\"kilde\":\"README.md:178; README.md:186-187\",\"genskabt\":[{\"af\":\"fv-model, lokalt: run_case.py uændret ved eef950a med README's kommando, df-data 106b9fc, app-venv, 8 kerner (delt maskine)\",\"dato\":\"2026-10-26\",\"objektiv_dkk\":22159684,\"status\":\"IKKE genskabt: kodens tidsgrænse 600 s ramt med gab 2,03 % (nedre grænse 21.708.371); README-tallet ligger i intervallet\",\"kilde\":\"rapporter/fv-model.md\"}]},{\"id\":\"andeby_helaar_bal\",\"navn\":\"Andeby helår, med balancering\",\"vindue\":\"juli 2025–juni 2026\",\"vaerk\":{\"kode\":\"andeby\",\"kilde_fil\":\"cases/andeby.yaml\"},\"scenarie\":{\"navn\":\"Andeby helår, med balancering\",\"periode_start\":null,\"periode_slut\":null,\"med_balancering\":true,\"balancing_method\":null,\"mip_rel_gap\":null,\"mip_abs_gap\":null,\"tidsgraense_s\":null,\"ekstra_flag\":null,\"heat_csv\":null},\"aendringer\":[],\"case_gab\":{\"mip_rel_gap\":0.001,\"mip_abs_gap\":1000,\"time_limit_s\":3600,\"kilde\":\"cases/andeby.yaml:142-145\"},\"forventet\":{\"objektiv_dkk\":24188471,\"tolerance_dkk\":24188},\"loesetid\":\"17 minutter på en pc med 24 kerner; ca. 3,5 GB hukommelse (robust reservation fordobler driftsdelen)\",\"kommando\":\"python run_case.py cases/andeby.yaml --data-source github --with-balancing\",\"noter\":[\"Optimal inden for casens gab (0,1 %) i README's kørsel.\",\"Regn den på forhånd; kør ikke helår live.\",\"Andebys balancetal er et potentiale ved fuld tilgængelighed, ikke hvad et værk vil tjene.\"],\"kilde\":\"README.md:179; README.md:184; README.md:188-190; README.md:199-201\"},{\"id\":\"andeby_helaar_spot\",\"navn\":\"Andeby helår, uden balancering\",\"vindue\":\"juli 2025–juni 2026\",\"vaerk\":{\"kode\":\"andeby\",\"kilde_fil\":\"cases/andeby.yaml\"},\"scenarie\":{\"navn\":\"Andeby helår, uden balancering\",\"periode_start\":null,\"periode_slut\":null,\"med_balancering\":false,\"balancing_method\":null,\"mip_rel_gap\":null,\"mip_abs_gap\":null,\"tidsgraense_s\":null,\"ekstra_flag\":null,\"heat_csv\":null},\"aendringer\":[],\"case_gab\":{\"mip_rel_gap\":0.001,\"mip_abs_gap\":1000,\"time_limit_s\":3600,\"kilde\":\"cases/andeby.yaml:142-145\"},\"forventet\":{\"objektiv_dkk\":30431535,\"tolerance_dkk\":30432},\"loesetid\":\"1 minut på en pc med 24 kerner\",\"kommando\":\"python run_case.py cases/andeby.yaml --data-source github\",\"noter\":[\"Andeby fik 8. oktober 2026 en solprofil fra målt DMI-globalstråling; Andeby-tal fra før den dato kan ikke sammenlignes.\"],\"kilde\":\"README.md:180; README.md:188; README.md:194-195\",\"genskabt\":[{\"af\":\"fv-model, lokalt: demo-kørslen D11 gennem den ægte arbejder (som fabric/koer_minne.py) ved eef950a, df-data 106b9fc, 8 kerner\",\"dato\":\"2026-10-26\",\"objektiv_dkk\":30431535.06,\"status\":\"optimal, gab 0,0142 %, 643 s\",\"kilde\":\"viden/demo_scenarier.json › koersel_status\"}]}]}]}";

/** README-referencetallenes pins (Codex K5-F9): modelcommit, df-data fra-dato og målte df-data-commits med dato. */
export const README_PINS: { model_commit: string; df_data_fra: string; df_data_kendt: Readonly<Record<string, string>> } = {
 "model_commit": "eef950a2ac7b3808a9456dcf48742ce08e52366a",
 "df_data_fra": "2026-10-05",
 "df_data_kendt": {
  "392992c7fe35992e79fba8d1ba7b91967e8d1481": "2026-10-12"
 }
};

/** Ordlistens definitioner (app_tekster/ordliste.md) for de ord, listen forklarer. */
export const ORDLISTE: Readonly<Record<string, string>> = {
 "Værk": "den samlede konfiguration: enheder, lagre, priser, tariffer, balancemarked, tid og data.",
 "Scenarie": "et værk plus én eller flere ændringer, der kan køres og sammenlignes.",
 "Referencekørsel": "den kørsel, et scenarie sammenlignes med.",
 "Differens / differensmetoden": "at læse et resultat som forskellen mellem to kørsler, der er ens på nær én ting.",
 "Gab (solvergab, MIP-gab)": "hvor langt den fundne løsning højst ligger fra den bedst mulige, relativt (fx 0,5 %) eller absolut (fx 5.000 kr.).",
 "Objektiv": "modellens samlede driftsomkostning for perioden i kr.: det tal, optimeringen minimerer.",
 "Syntetisk varmelast": "varmebehov regnet af udetemperaturen, når der ikke er målinger.",
 "Spor A": "normativ beregning af balancemarkedet: hvad værket kunne tjene. En øvre grænse.",
 "Spor B": "beskrivende beregning med værkets faktiske reservation som loft. Bruges til validering.",
 "Balancemarked": "markederne, hvor Energinet køber reserver til at holde balancen i elnettet: her aFRR og mFRR.",
 "aFRR": "automatic Frequency Restoration Reserve: automatisk, hurtig reserve, som Energinet aktiverer direkte. Ét af de to balancemarkeder i modellen.",
 "mFRR": "manual Frequency Restoration Reserve: manuelt aktiveret reserve. Afregnes til marginalpris. Ét af de to balancemarkeder i modellen.",
 "Spotpris": "elprisen på day-ahead-markedet, pr. time eller kvarter."
};
