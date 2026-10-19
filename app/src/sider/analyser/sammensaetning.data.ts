//-----------------------------------------------------------------------
// GENERERET af _byg/byg_sammensaetning.py fra viden/demo_scenarier.json,
// viden/referencetal.json (gruppen readme) og viden/app_tekster/ordliste.md
// (fv-ekspert). Ret ikke i hånden.
// Modelcommit: b49aeb0af097be42938b80a0fea6acdd77162836 · 12 demo-kørsler · 9 par · 5 README-referencer
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
export const README_REFERENCER_JSON = "{\"grupper\":[{\"id\":\"readme\",\"navn\":\"README-referencetal (gældende)\",\"kilde\":\"README.md:128-159\",\"koert\":\"2026-10-15, robust reservation som standard, rullende Billund-cases med flis- og halmkedel slukket 1. juli\",\"referencer\":[{\"id\":\"spora_anker\",\"navn\":\"Spor A-anker\",\"vindue\":\"2. marts–23. juni 2026\",\"vaerk\":{\"kode\":\"billund_spora\",\"kilde_fil\":\"cases/billund_sporA.yaml\"},\"scenarie\":{\"navn\":\"Spor A-anker\",\"periode_start\":null,\"periode_slut\":null,\"med_balancering\":true,\"balancing_method\":null,\"mip_rel_gap\":null,\"mip_abs_gap\":null,\"tidsgraense_s\":null,\"ekstra_flag\":null,\"heat_csv\":null},\"aendringer\":[],\"case_gab\":{\"mip_rel_gap\":0.005,\"mip_abs_gap\":5000,\"time_limit_s\":600,\"kilde\":\"kodens standard, casen har ingen solver-blok (doc/KOERSEL.md:64-66)\"},\"forventet\":{\"objektiv_dkk\":4698390,\"tolerance_dkk\":23492},\"loesetid\":\"ca. 2 minutter (sandkasse, 2 kerner)\",\"kommando\":\"python run_case.py cases/billund_sporA.yaml --data-source github --with-balancing\",\"noter\":[\"Syntetisk varmelast (intet heat_csv), DMI-område fyn.\",\"Slutter 23. juni, fordi ankeret er regnet før den sidste uge af juni blev splejset ind.\"],\"kilde\":\"README.md:138; README.md:144; README.md:148-150\"},{\"id\":\"sporb\",\"navn\":\"Spor B\",\"vindue\":\"2. marts–30. juni 2026\",\"vaerk\":{\"kode\":\"billund_sporb\",\"kilde_fil\":\"cases/billund_sporB.yaml\"},\"scenarie\":{\"navn\":\"Spor B\",\"periode_start\":null,\"periode_slut\":null,\"med_balancering\":true,\"balancing_method\":null,\"mip_rel_gap\":null,\"mip_abs_gap\":null,\"tidsgraense_s\":null,\"ekstra_flag\":null,\"heat_csv\":\"billund_abvaerk_hourly_splejset_jun2026.csv\"},\"aendringer\":[],\"case_gab\":{\"mip_rel_gap\":0.005,\"mip_abs_gap\":5000,\"time_limit_s\":600,\"kilde\":\"kodens standard (doc/KOERSEL.md:64-66)\"},\"forventet\":{\"objektiv_dkk\":3964586,\"tolerance_dkk\":19823},\"loesetid\":\"ca. 2 minutter\",\"kommando\":\"python run_case.py cases/billund_sporB.yaml --data-source github --with-balancing --heat-csv data/billund_abvaerk_hourly_splejset_jun2026.csv\",\"noter\":[\"Mod Billunds afregning marts–juni 2026 (ex post): 121 % (aFRR 108 %, mFRR 132 %).\"],\"kilde\":\"README.md:139; README.md:155-157\"},{\"id\":\"billund_rullende\",\"navn\":\"Billund rullende år\",\"vindue\":\"juli 2025–juni 2026\",\"vaerk\":{\"kode\":\"billund_spora_rullende\",\"kilde_fil\":\"cases/billund_sporA_rullende.yaml\"},\"scenarie\":{\"navn\":\"Billund rullende år, med balancering\",\"periode_start\":null,\"periode_slut\":null,\"med_balancering\":true,\"balancing_method\":null,\"mip_rel_gap\":null,\"mip_abs_gap\":null,\"tidsgraense_s\":null,\"ekstra_flag\":null,\"heat_csv\":\"billund_abvaerk_hourly_splejset_jun2026.csv\"},\"aendringer\":[],\"case_gab\":{\"mip_rel_gap\":0.005,\"mip_abs_gap\":5000,\"time_limit_s\":600,\"kilde\":\"kodens standard (doc/KOERSEL.md:64-66)\"},\"forventet\":{\"objektiv_dkk\":20341652,\"tolerance_dkk\":101708},\"loesetid\":\"ca. 4 minutter\",\"kommando\":\"python run_case.py cases/billund_sporA_rullende.yaml --data-source github --with-balancing --heat-csv data/billund_abvaerk_hourly_splejset_jun2026.csv\",\"noter\":[\"Samme tal som rapport v4 tabel 4.1 (med tank, med balancemarked).\"],\"kilde\":\"README.md:140; README.md:148-151\"},{\"id\":\"andeby_helaar_bal\",\"navn\":\"Andeby helår, med balancering\",\"vindue\":\"juli 2025–juni 2026\",\"vaerk\":{\"kode\":\"andeby\",\"kilde_fil\":\"cases/andeby.yaml\"},\"scenarie\":{\"navn\":\"Andeby helår, med balancering\",\"periode_start\":null,\"periode_slut\":null,\"med_balancering\":true,\"balancing_method\":null,\"mip_rel_gap\":null,\"mip_abs_gap\":null,\"tidsgraense_s\":null,\"ekstra_flag\":null,\"heat_csv\":null},\"aendringer\":[],\"case_gab\":{\"mip_rel_gap\":0.001,\"mip_abs_gap\":1000,\"time_limit_s\":3600,\"kilde\":\"cases/andeby.yaml:142-145\"},\"forventet\":{\"objektiv_dkk\":23067291,\"tolerance_dkk\":null,\"opnaaet_gab_pct\":0.12},\"loesetid\":\"ca. 1 time; ca. 3,5 GB hukommelse (robust reservation fordobler driftsdelen)\",\"kommando\":\"python run_case.py cases/andeby.yaml --data-source github --with-balancing\",\"noter\":[\"Stopper ved casens tidsgrænse på 1 time med gab 0,12 % (mål 0,1 %). Tallet er derfor ikke reproducerbart til kronen; en ny kørsel kan lande et andet sted inden for ca. 0,12 % (ca. 28.000 kr.).\",\"Regn den på forhånd; kør ikke helår live.\",\"Andebys balancetal er et potentiale ved fuld tilgængelighed, ikke hvad et værk vil tjene.\"],\"kilde\":\"README.md:141; README.md:146; README.md:150-152; README.md:158-159\"},{\"id\":\"andeby_helaar_spot\",\"navn\":\"Andeby helår, uden balancering\",\"vindue\":\"juli 2025–juni 2026\",\"vaerk\":{\"kode\":\"andeby\",\"kilde_fil\":\"cases/andeby.yaml\"},\"scenarie\":{\"navn\":\"Andeby helår, uden balancering\",\"periode_start\":null,\"periode_slut\":null,\"med_balancering\":false,\"balancing_method\":null,\"mip_rel_gap\":null,\"mip_abs_gap\":null,\"tidsgraense_s\":null,\"ekstra_flag\":null,\"heat_csv\":null},\"aendringer\":[],\"case_gab\":{\"mip_rel_gap\":0.001,\"mip_abs_gap\":1000,\"time_limit_s\":3600,\"kilde\":\"cases/andeby.yaml:142-145\"},\"forventet\":{\"objektiv_dkk\":30430965,\"tolerance_dkk\":30431},\"loesetid\":\"6–10 minutter\",\"kommando\":\"python run_case.py cases/andeby.yaml --data-source github\",\"noter\":[\"Andeby fik 8. oktober 2026 en solprofil fra målt DMI-globalstråling; Andeby-tal fra før den dato kan ikke sammenlignes.\"],\"kilde\":\"README.md:142; README.md:150-153\"}]}]}";

/** README-referencetallenes pins (Codex K5-F9): modelcommit, df-data fra-dato og målte df-data-commits med dato. */
export const README_PINS: { model_commit: string; df_data_fra: string; df_data_kendt: Readonly<Record<string, string>> } = {
 "model_commit": "b49aeb0af097be42938b80a0fea6acdd77162836",
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
