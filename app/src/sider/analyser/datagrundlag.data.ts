//-----------------------------------------------------------------------
// GENERERET af _byg/byg_sammensaetning.py fra viden/data_krav.json (fv-data):
// data_i_koersel og datakilder. Ret ikke i hånden.
// data_krav version 1 · 2026-10-16 · modelrepo b49aeb0af097be42938b80a0fea6acdd77162836
//-----------------------------------------------------------------------

/** Linjerne i "Data i denne kørsel". `vaerdi` er en skabelon; alternativer er adskilt af " | ". */
export const DATA_LINJER: readonly { etiket: string; vaerdi: string; kilde?: string; fodnote?: string; altid?: boolean; kun_hvis?: string; ellers?: string }[] = [
 {
  "etiket": "Markeds- og vejrdata",
  "vaerdi": "df-data @ {data_commit[:7]}",
  "kilde": "Koersel.data_commit (fuld SHA; vis 7 tegn, fuld i tooltip)"
 },
 {
  "etiket": "Model",
  "vaerdi": "fjernvarme-businesscase @ {model_commit[:7]}",
  "kilde": "Koersel.model_commit"
 },
 {
  "etiket": "Værk",
  "vaerdi": "{vaerk.navn}, revision {vaerk_revision}",
  "kilde": "Koersel.vaerk_revision"
 },
 {
  "etiket": "Periode",
  "vaerdi": "{start} - {slut} (dansk tid), {antal_interval_model} timer",
  "kilde": "_koersel.start/_koersel.slut, Koersel.antal_interval_model"
 },
 {
  "etiket": "Spotpris",
  "vaerdi": "spot {data.price_zone}",
  "altid": true,
  "fodnote": "Efter 1. oktober 2025: timens første kvarter (se datakilder.spot)"
 },
 {
  "etiket": "Udetemperatur",
  "vaerdi": "DMI {data.dmi_area} ({data.dmi_temp_shortname})",
  "altid": true
 },
 {
  "etiket": "Balancemarked",
  "vaerdi": "aFRR, mFRR-kapacitet, mFRR-aktivering og ubalancepris for {electricity.spot_area}",
  "kun_hvis": "_koersel.med_balancering = true",
  "ellers": "ikke med"
 },
 {
  "etiket": "Varmelast",
  "vaerdi": "syntetisk (heat_load_params, DMI {data.dmi_area}) | tidsserie '{navn}' (sha256 {sha256[:12]}) | repo-fil {heat_csv}",
  "kilde": "_koersel.tidsserie.varmelast / _koersel.heat_csv"
 },
 {
  "etiket": "Solprofil",
  "vaerdi": "tidsserie '{navn}' (sha256 {sha256[:12]}) | repo-fil {units.<sol>.production_profile_path} | ingen solvarme",
  "kilde": "_koersel.tidsserie.solprofil / units.*.production_profile_path"
 },
 {
  "etiket": "Priszone afviger",
  "vaerdi": "spot {data.price_zone}, balance {electricity.spot_area}",
  "kun_hvis": "data.price_zone != electricity.spot_area"
 }
];

export const DATAKILDER: readonly { id: string; navn: string; bruges: string }[] = [
 {
  "id": "spot",
  "navn": "Elspotpris",
  "bruges": "altid"
 },
 {
  "id": "dmi",
  "navn": "Udetemperatur (DMI)",
  "bruges": "altid - også med målt varmelast: temperaturen bruges af varmepumpens COP-tabel og vises i resultatet"
 },
 {
  "id": "afrr",
  "navn": "aFRR-kapacitet (pris og indkøbt MW)",
  "bruges": "kun med balancemarked (--with-balancing)"
 },
 {
  "id": "imbalance",
  "navn": "Ubalancepris og aFRR-aktiveringspriser",
  "bruges": "kun med balancemarked"
 },
 {
  "id": "mfrr_cap",
  "navn": "mFRR-kapacitet",
  "bruges": "kun med balancemarked"
 },
 {
  "id": "mfrr_act",
  "navn": "mFRR-aktiveret volumen",
  "bruges": "kun med balancemarked"
 },
 {
  "id": "varmelast_syntetisk",
  "navn": "Syntetisk varmelast",
  "bruges": "når ingen målt varmelast er valgt"
 },
 {
  "id": "varmelast_maalt",
  "navn": "Målt varmelast ab værk",
  "bruges": "når scenariet vælger den; erstatter syntesen helt"
 },
 {
  "id": "solprofil",
  "navn": "Solvarmeprofil",
  "bruges": "for hver aktiv enhed med production_profile_path"
 },
 {
  "id": "vaerksparametre",
  "navn": "Værkets parametre",
  "bruges": "altid"
 }
];

/** DMI-kolonnen, når værket ikke sætter data.dmi_temp_shortname (datakilder -> dmi). */
export const STANDARD_TEMP = "temp_mean_past1h";

export const TIDSSERIENS_NAVN = "Tidsserie.navn og sha256 slås op på id fra det frosne input; vis det frosne sha256, også hvis rækken siden er ændret eller slettet.";
