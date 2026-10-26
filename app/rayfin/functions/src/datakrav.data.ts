//-----------------------------------------------------------------------
// GENERERET af _byg/byg_datakrav.py fra viden/data_krav.json (fv-data).
// Ret ikke i hånden — ret data_krav.json og kør generatoren igen.
//-----------------------------------------------------------------------

export const DATAKRAV = {
 "version": 1,
 "sha256_data_krav": "f873f11303d63640ee8677f7f96fdc86d67ecbe094103833dd77d83dd11abff5",
 "graenser": {
  "max_bytes": 8000000,
  "max_raekker": 120000,
  "krav_mindst": "Et helt år i 15 min (35.040 rækker, ca. 1,2 MB) skal kunne uploades (KONTRAKT §6d).",
  "min_timer": 48,
  "kort_serie_doegn": 28,
  "helaar_doegn": 300,
  "urimelig_stor_mw": 5000,
  "langt_hul_timer": 48,
  "model_max_hulandel": 0.05,
  "sol_max_hulandel": 0.05,
  "nul_straek_timer": 24,
  "fastfrosset_timer": 24,
  "spids_vindue_timer": 49,
  "spids_faktor": 3.0,
  "benyttelsestid_varmelast_t": [
   1500,
   6000
  ],
  "benyttelsestid_sol_t": [
   250,
   1200
  ],
  "sol_nat_andel": 0.002,
  "sol_nat_spids_andel": 0.05,
  "sol_tyngdepunkt_utc": [
   10.2,
   11.5
  ],
  "sol_andel_min_pmax": 2.0,
  "validering_json_max_tegn": 4000,
  "maalt_mod_syntetisk_forhold": [
   0.85,
   1.15
  ],
  "maalt_mod_syntetisk_korrelation_min": 0.85
 },
 "tidskolonne_navne": [
  "timestamp",
  "time",
  "datetime",
  "hour_utc",
  "hour_dk",
  "tid",
  "tidspunkt",
  "tidsstempel",
  "dato",
  "date"
 ],
 "vaerdikolonne_navne": [
  "heat_mw_abvaerk",
  "mw",
  "power_mw",
  "varme_mw",
  "varme",
  "vaerdi",
  "value"
 ],
 "tomme_vaerdier": [
  "",
  "nan",
  "na",
  "n/a",
  "null",
  "none",
  "-",
  "–"
 ],
 "enheder": {
  "MW": {
   "faktor_til_mw": 1.0,
   "visning": "MW (middeleffekt i intervallet)"
  },
  "kW": {
   "faktor_til_mw": 0.001,
   "visning": "kW"
  },
  "MWh": {
   "faktor_til_mw": 1.0,
   "pr_interval": true,
   "visning": "MWh pr. interval"
  },
  "kWh": {
   "faktor_til_mw": 0.001,
   "pr_interval": true,
   "visning": "kWh pr. interval"
  }
 },
 "regler": {
  "rolle_ukendt": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Rollen '{rolle}' kendes ikke. Vælg varmelast eller solprofil."
  },
  "tidszone_ukendt": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Tidszonen '{tidszone}' kendes ikke. Vælg UTC eller dansk lokaltid."
  },
  "tidsstempel_ukendt": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Angiv om tidsstemplet er timens start eller timens slut."
  },
  "enhed_ukendt": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Enheden '{enhed}' kendes ikke. Vælg MW, kW, MWh pr. interval eller kWh pr. interval."
  },
  "for_stor": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Filen er for stor ({hvad}; grænsen er {graense}). Del den op, eller send timeværdier i stedet for kvarterværdier."
  },
  "kodning_cp1252": {
   "niveau": "info",
   "hvornaar": "upload",
   "besked": "Filen er ikke UTF-8; den er læst som Windows-1252 (typisk for Excel-eksport)."
  },
  "tom": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Filen har ingen datarækker."
  },
  "excel_serietal": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Tidskolonnen indeholder tal som 45839,5 (Excels interne datoer). Formatér kolonnen som dato og tid i Excel, og gem igen."
  },
  "ingen_tid": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Filen har ingen kolonne med tidsstempler (fx timestamp eller tidsstempel i formen 2025-07-01 00:00)."
  },
  "kolonne_findes_ikke": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Kolonnen '{kolonne}' findes ikke. Filen har: {kolonner}."
  },
  "ingen_vaerdi": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Filen har ingen kolonne med tal ved siden af tidsstemplet."
  },
  "flere_kolonner": {
   "niveau": "info",
   "hvornaar": "upload",
   "besked": "Filen har {antal} talkolonner; '{kolonne}' bruges. Vælg en anden, hvis det er forkert."
  },
  "hour_dk_som_utc": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Tidskolonnen hedder hour_dk (dansk tid), men tidszonen er sat til UTC. Er stemplerne dansk tid, så vælg dansk lokaltid."
  },
  "ugyldig_tid": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "{antal} rækker har et tidsstempel, der ikke kan læses (linje {linjer})."
  },
  "amerikansk_dato": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "{antal} datoer ligner amerikansk form måned/dag/år (linje {linjer}). Skriv dem som dag-måned-år eller ÅÅÅÅ-MM-DD."
  },
  "ugyldigt_tal": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "{antal} rækker har en værdi, der ikke er et tal (linje {linjer}). Lad cellen stå tom for en manglende time, eller skriv tallet."
  },
  "ikke_endelig": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "{antal} værdier er uendelige (linje {linjer})."
  },
  "blandet_zone": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Nogle tidsstempler har en tidszone, og andre ikke. Brug samme form i hele filen."
  },
  "zone_i_fil": {
   "niveau": "info",
   "hvornaar": "upload",
   "besked": "Tidsstemplerne har selv en tidszone; dit valg af tidszone bruges ikke."
  },
  "dst_time_findes_ikke": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "{antal} tidsstempler ligger i en time, der ikke findes ved skift til sommertid (linje {linjer}). De er flyttet frem til kl. 03."
  },
  "alle_tomme": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Filen har tidsstempler, men ingen værdier."
  },
  "oploesning": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Opløsningen er {minutter} minutter. Kun timeværdier og kvarterværdier understøttes."
  },
  "timeslut_mistanke": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Serien begynder kl. 01:00 og slutter kl. 00:00 den første i en måned - stemplerne ligner timens SLUT. Vælg 'timens slut', hvis det er tilfældet."
  },
  "timestart_mistanke": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Serien begynder kl. 00:00 den første og slutter kl. 23 den sidste i en måned - stemplerne ligner timens START."
  },
  "ligner_dansk_tid": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Stemplerne ligner dansk lokaltid: {hvor}. Vælg dansk lokaltid, hvis filen er et SRO-udtræk i dansk tid."
  },
  "dst_dobbelttime_en_gang": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Efterårets dobbelttime ({dato} kl. 02) står kun én gang. Den er læst som sommertid; én time i året kan ligge forkert."
  },
  "skaev_tid": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "{antal} tidsstempler ligger ikke på et helt {enhed} (linje {linjer})."
  },
  "dubletter": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "{antal} tidsstempler står mere end én gang (linje {linjer}). Ret udtrækket - vi vælger ikke selv, hvilken værdi der gælder."
  },
  "kvarter_aggregeret": {
   "niveau": "info",
   "hvornaar": "upload",
   "besked": "Kvarterværdierne er midlet til timeværdier (version 1 regner i timer). Originalen gemmes ikke."
  },
  "delvise_timer": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "{antal} timer har færre end fire kvarterværdier og er regnet som huller."
  },
  "enhed_omregnet": {
   "niveau": "info",
   "hvornaar": "upload",
   "besked": "Værdierne er omregnet fra {enhed} til MW."
  },
  "negativ": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "{antal} værdier er negative (første {foerste}: {vaerdi}). Varmeproduktion kan ikke være under nul; frostsikring i solfeltet er ikke produktion - skriv 0 eller lad cellen stå tom."
  },
  "alle_nul": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Alle værdier er 0."
  },
  "urimelig_stor": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Største værdi er {maks} MW (grænsen er {graense} MW). Står tallene i kW eller kWh? Vælg den rigtige enhed."
  },
  "for_kort": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Serien har kun {antal} timer med værdi; der skal mindst {graense} til (en prøvekørsel er 2 døgn)."
  },
  "kort_serie": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Serien dækker kun {doegn} døgn. Den kan bruges til kørsler inden for de døgn, men ikke til et årstal."
  },
  "huller": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "{antal} timer mangler ({andel}), længste hul {laengste} timer. En kørsel stopper, hvis mere end 5 % af dens timer mangler; under det udfylder modellen hullerne med en ret linje."
  },
  "langt_hul": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Et hul på {laengste} timer bliver en ret linje hen over vejrskift, hvis en kørsel rammer det. Vælg en periode uden om hullet, eller brug syntetisk varmelast for den."
  },
  "sol_huller": {
   "niveau": "fejl",
   "hvornaar": "upload",
   "besked": "Solprofilen mangler {antal} timer ({andel}). Over 5 % udfyldes ikke, og en kørsel kan ikke bruge en profil med huller."
  },
  "sol_huller_udfyldt": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "{antal} manglende timer i solprofilen er udfyldt (længste hul {laengste} timer): 0, når solen er nede, ellers en ret linje."
  },
  "nul_straek": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "{timer} timer i træk med 0 fra {fra}. Et fjernvarmeværk har altid nettab - er det en udfaldsperiode, så lad cellerne stå tomme i stedet."
  },
  "fastfrosset": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "{timer} timer i træk med præcis {vaerdi} MW fra {fra}. Det ligner en måler, der har stået stille."
  },
  "spids": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "{antal} timer ligger over {faktor} gange niveauet omkring dem (første {foerste}: {vaerdi} MW). Tjek for enkeltspidser i udtrækket."
  },
  "benyttelsestid": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Benyttelsestiden er {timer} timer (gennemsnit / største time x 8.760); normalt {lo}-{hi}. Tjek for enkeltspidser, forkert enhed eller en serie, der kun dækker en del af værket."
  },
  "sol_nat": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Solprofilen har produktion om natten: {timer} timer, i alt {mwh} MWh. Er det frostsikring eller en måler, der tæller begge veje, er det ikke produktion - eller er tidszonen forkert?"
  },
  "sol_tidsforskudt": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Solprofilens tyngdepunkt ligger kl. {tyngde} UTC (timens start); for Danmark ventes {lo}-{hi}. Serien er sandsynligvis forskudt en time - tjek tidszone og timens start/slut."
  },
  "over_kapacitet": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "{antal} timer ligger over værkets samlede kapacitet {kap} MW (aktive enheders maks varme + lagrenes afladeeffekt), første {foerste}: {vaerdi} MW. En kørsel, der rammer de timer, kan ikke løses."
  },
  "sol_ingen_enhed": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Værket har ingen aktiv solvarmeenhed (solar_thermal); profilen bruges ikke, før en sådan findes."
  },
  "sol_flere_enheder": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Værket har flere aktive solvarmeenheder ({navne}). En solprofil kan kun bruges, når der er præcis én."
  },
  "sol_over_pmax": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Solprofilen når {maks} MW, men {navn} har maks varme {pmax} MW. Modellen klipper profilen ved {pmax} MW."
  },
  "sol_andel": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Solprofilen går højst til 1, men enheden er på {pmax} MW. Det ligner en andel (0-1) og ikke MW; profilen skal være varmeeffekt i MW."
  },
  "sol_benyttelsestid": {
   "niveau": "advarsel",
   "hvornaar": "upload",
   "besked": "Solprofilen svarer til {timer} fuldlasttimer om året mod {pmax} MW; normalt {lo}-{hi}. Står profilen i en anden enhed, eller er maks varme forkert?"
  },
  "koersel_tidsserie_ikke_gyldig": {
   "niveau": "fejl",
   "hvornaar": "bestilling",
   "besked": "Den valgte tidsserie har status '{status}' og kan ikke bruges."
  },
  "koersel_varmelast_daekning": {
   "niveau": "fejl",
   "hvornaar": "bestilling",
   "besked": "Varmelasten mangler {mangler} af kørslens {vindue} timer ({andel}). Modellen stopper over 5 %. Serien dækker {serie}."
  },
  "koersel_varmelast_huller": {
   "niveau": "advarsel",
   "hvornaar": "bestilling",
   "besked": "{mangler} af kørslens {vindue} timer mangler i varmelasten; modellen udfylder dem med en ret linje."
  },
  "koersel_sol_daekning": {
   "niveau": "fejl",
   "hvornaar": "bestilling",
   "besked": "Solprofilen mangler {mangler} af kørslens {vindue} timer. Den skal dække hver time; serien dækker {serie}."
  },
  "koersel_huller_afkortet": {
   "niveau": "info",
   "hvornaar": "bestilling",
   "besked": "Tidsseriens hulliste er afkortet; dækningen kontrolleres endeligt i regnemotoren."
  },
  "koersel_over_kapacitet": {
   "niveau": "fejl",
   "hvornaar": "bestilling",
   "besked": "{antal} timer i kørslen ligger over værkets kapacitet {kap} MW (første {foerste}: {vaerdi} MW). Kørslen kan ikke løses - tilføj kapacitet, eller vælg en anden periode."
  },
  "koersel_sol_flere_enheder": {
   "niveau": "fejl",
   "hvornaar": "bestilling",
   "besked": "Solprofilen kan ikke placeres: værket har flere aktive solvarmeenheder, og ingen er markeret til tidsserien."
  },
  "koersel_df_data": {
   "niveau": "advarsel",
   "hvornaar": "bestilling",
   "besked": "Perioden ligger uden for markeds- eller vejrdata ({datasaet} dækker {fra} - {til}). Kørslen stopper sandsynligvis med en dækningsfejl."
  },
  "maalt_mod_syntetisk": {
   "niveau": "advarsel",
   "hvornaar": "visning",
   "besked": "Den målte varmelast er {forhold} gange værkets syntetiske (døgnkorrelation {korrelation}). Måler serien an forbruger (uden nettab), dækker den hele værket, og passer heat_load_params og DMI-området?"
  }
 }
} as const;
