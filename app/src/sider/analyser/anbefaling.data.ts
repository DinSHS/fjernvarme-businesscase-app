//-----------------------------------------------------------------------
// GENERERET af _byg/byg_etiketter.py fra viden/anbefalingsregler.json og
// viden/knapper.json (fv-ekspert). Ret ikke i hånden.
// Modelcommit: eef950a2ac7b3808a9456dcf48742ce08e52366a · 16 knapper · 12 forbehold
//-----------------------------------------------------------------------

export const KATEGORIER: Readonly<Record<string, { maerke: string; tone: string; betydning: string }>> = {
 "anbefalet": {
  "maerke": "Anbefalet",
  "tone": "ok",
  "betydning": "Scenariet er billigere end referencen med en margin ud over solverens tolerance, og der er intet forbehold, der kan vende konklusionen."
 },
 "fraraades": {
  "maerke": "Frarådes",
  "tone": "fejl",
  "betydning": "Scenariet er dyrere end referencen med en margin ud over solverens tolerance."
 },
 "kan_ikke_afgoeres": {
  "maerke": "Kan ikke afgøres",
  "tone": "neutral",
  "betydning": "Forskellen er inden for solverens tolerance eller under væsentlighedsgrænsen, kørslerne er ikke sammenlignelige, eller fortegnet kan ikke passe."
 },
 "undersoeg_naermere": {
  "maerke": "Undersøg nærmere",
  "tone": "advarsel",
  "betydning": "Lovende eller tydelig, men med et væsentligt forbehold (kort vindue, Spor A, [BEKRÆFT]-værdier, løst gab, første times artefakt i ældre kørsler …). Næste skridt fjerner forbeholdet."
 },
 "foelsomhed": {
  "maerke": "Følsomhed",
  "tone": "neutral",
  "betydning": "Knapper af typen 'foelsomhed' og 'metode' (fx gaspris +20 %, DMI-område, indtægtsmetode) beskriver noget, værket ikke selv vælger. De får ingen anbefalingskategori — kun historien og følsomheden ('X kr. pr. …'). Typen står i knapper.json → anbefaling.type."
 }
};

export const FORBEHOLD_REGLER: Readonly<Record<string, { virkning: string; tekst: string; kilde: string }>> = {
 "faa_doegn": {
  "virkning": "nedgrader",
  "tekst": "Perioden er kun {doegn} døgn. Et kort vindue viser retningen, ikke størrelsen.",
  "kilde": "doc/BUDSTRATEGI.md:346"
 },
 "kort_periode_beslutning": {
  "virkning": "nedgrader",
  "tekst": "Perioden er {doegn} døgn. En investering skal regnes på et helt år; et kort vindue kan ikke ganges op.",
  "kilde": "doc/BUDSTRATEGI.md:346; doc/EGET_VAERK.md:142"
 },
 "en_saeson": {
  "virkning": "note",
  "tekst": "Perioden dækker kun {saeson}. Tankens værdi er størst i forår og sommer, hvor døgnets prisspænd er størst; en vinterperiode alene undervurderer eller overvurderer året.",
  "kilde": "rapport v4, bilag A"
 },
 "spor_a": {
  "virkning": "nedgrader",
  "tekst": "Balancetallet er Spor A: en øvre grænse ved fuld tilgængelighed, ikke en prognose.",
  "kilde": "README.md:156-158; doc/BALANCEMARKED.md:113-121"
 },
 "kender_aktiveringerne": {
  "virkning": "nedgrader",
  "tekst": "Modellen kender aktiveringerne på forhånd; det er et loft, ingen kan nå. Kør med en prognose (trailing30, settle realized).",
  "kilde": "doc/BUDSTRATEGI.md:76-86; doc/BUDSTRATEGI.md:337; src/config.py:232"
 },
 "bekraeft": {
  "virkning": "nedgrader",
  "tekst": "{antal} af de værdier, scenariet afhænger af, er markeret [BEKRÆFT]: {felter}. Bekræft dem, før tallet bruges.",
  "kilde": "cases/andeby.yaml:43-46"
 },
 "gab_loest": {
  "virkning": "nedgrader",
  "tekst": "Kørslerne er regnet med et løst gab ({gab}). Til differenser: 0,0002 og højst 100 kr.",
  "kilde": "doc/KOERSEL.md:57-60; knapper.json → anbefalet_differens"
 },
 "ikke_optimal": {
  "virkning": "nedgrader",
  "tekst": "{rolle} stoppede ved tidsgrænsen med gab {gab}; tallet er ikke bevist optimalt.",
  "kilde": "README.md:146"
 },
 "profilbunden": {
  "virkning": "nedgrader",
  "tekst": "{enhed} følger en produktionsprofil; resultatet afhænger af profilens skalering og dækning.",
  "kilde": "cases/andeby.yaml:53-60"
 },
 "t0_lager": {
  "virkning": "nedgrader_begge",
  "tekst": "Mindst én af kørslerne er regnet ved en ældre modelversion ({commit}), hvor tankens første time var ubundet og gav gratis varme; på {doegn} døgn kan det være en stor del af forskellen (målt: ca. halvdelen af tankværdien i Andeby 5.–16. jan 2026). Regn begge kørsler igen med den aktuelle modelversion.",
  "kilde": "modelrepoet 3c2afa6 (tests/test_lager_foerste_time.py); egen måling (appens udvikling, Andeby D01/D02 ved b49aeb0, 16.10.2026; står ikke i modelrepoet)"
 },
 "fiktivt_vaerk": {
  "virkning": "note",
  "tekst": "Værket er fiktivt: tallene viser metoden, ikke et rigtigt værks økonomi.",
  "kilde": "cases/andeby.yaml:4-6"
 },
 "spor_b_kalibrering": {
  "virkning": "note",
  "tekst": "Spor B er kalibreret på marts–juni 2026 og forudsiger ikke andre perioder.",
  "kilde": "doc/BALANCEMARKED.md:216-218"
 }
};

/** Modelversioner, hvor tankens første time var ubundet (forbeholdet t0_lager gælder kun kørsler herfra). */
export const T0_DEFEKTE_MODEL_COMMITS: readonly string[] = [
 "b49aeb0af097be42938b80a0fea6acdd77162836"
];

/** Begrundelser pr. trin i beslutningsrækkefølgen (pladsholdere i {}). */
export const TRIN: Readonly<Record<string, string>> = {
 "1": "Kørslerne er ikke sammenlignelige: {felter} afviger, så differensen blander flere effekter.",
 "2": "Scenariet ændrer flere ting på én gang ({antal} ændringer); bidragene kan ikke skilles ad (doc/KOERSEL.md:43-44).",
 "3": "Solverens tolerance kendes ikke for begge kørsler, så forskellen kan ikke vurderes.",
 "4": "Fortegnet kan ikke passe: {forklaring}. Tjek gab, starttilstand og første interval, før tallet bruges.",
 "5": "Forskellen på {delta} er inden for solverens tolerance ({T}) eller under væsentlighedsgrænsen ({V}) og kan ikke skelnes fra nul.",
 "6": "{forbehold}",
 "7": "Scenariet gør driften {delta} kr. dyrere — {n} gange solverens tolerance.",
 "8": "Scenariet er {delta} kr. billigere, men: {forbehold}",
 "9": "Scenariet gør driften {delta} kr. billigere — {n} gange solverens tolerance, uden blokerende forbehold."
};

export const SKALERING_TEKST = "Skaleret til et år er det ca. {aarligt} — kun hvis perioden er repræsentativ, og det er en enkelt sæson ikke.";

export const INVESTERING = {
 "tekst": "Modellen regner kun driften. Investeringsbeløbet findes ikke i modellen, og det årlige beløb er driftsbesparelsen før kapitalomkostning, skat og faste D&V.",
 "knapper": [
  "ny_enhed",
  "tankstoerrelse",
  "tankens_vaerdi",
  "praekvalifikation"
 ],
 "annuitet": "A = I × r / (1 − (1 + r)^(−n))",
 "forklaring": "I = investering (kr.), r = real kalkulationsrente, n = levetid (år). Investeringen betaler sig, når den årlige driftsbesparelse fra et helår er større end A plus enhedens faste årlige omkostninger."
};

export const KNAPPER: Readonly<Record<string, { spoergsmaal: string; anbefaling: Record<string, unknown> }>> = {
 "balancemarkedets_vaerdi": {
  "spoergsmaal": "Hvad er balancemarkedet værd for os?",
  "anbefaling": {
   "type": "beslutning",
   "kraever_helaar": false,
   "forventet_fortegn": "≤ 0 — men kun når scenariet ikke har kapacitetsprisgaten i mode 'driven' (reservation_gate.enabled = true og mode = driven): dér tvinger en fast blok buddet ind, når gaten er åben, og det kan koste (doc/BUDSTRATEGI.md:56). Med driven-gate: intet fortegnskrav.",
   "hvis_billigere": "Balancemarkedet sænker driftsomkostningen med {abs} i perioden{skaleret}.",
   "hvis_dyrere": "Balancemarkedet gør driften {abs} dyrere. Med frie bud kan det ikke ske; med en fast blok (driven-gate) kan det — tjek budstrategien og blokstørrelsen.",
   "naeste_skridt": [
    "Kør med en prognose (foresight trailing30, settle realized), så modellen ikke kender aktiveringerne",
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab",
    "Sammenlign pr. marked med jeres egen afregning (Spor B)"
   ]
  }
 },
 "tankens_vaerdi": {
  "spoergsmaal": "Hvad er tanken værd?",
  "anbefaling": {
   "type": "beslutning",
   "kraever_helaar": true,
   "forventet_fortegn": "≥ 0 (uden tank er der færre muligheder)",
   "hvis_dyrere": "Tanken sparer {abs} i perioden{skaleret} — behold den.",
   "hvis_billigere": "Driften er {abs} billigere uden tanken. Det kan ikke passe ud over solverens tolerance; tjek starttilstand og gab.",
   "naeste_skridt": [
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab",
    "Kør parret igen med balancemarkedet slået til",
    "Kør knappen 'Hvor stor skal tanken være?' for at se, hvor værdien mættes"
   ]
  }
 },
 "tankstoerrelse": {
  "spoergsmaal": "Hvor stor skal tanken være?",
  "anbefaling": {
   "type": "beslutning",
   "kraever_helaar": true,
   "forventet_fortegn": "≤ 0 mod 'ingen tank' (en tank kan kun hjælpe)",
   "hvis_billigere": "En tank på {vaerdi} sparer {abs} i perioden mod ingen tank{skaleret}. Sammenhold det årlige beløb med tankens annuitet.",
   "hvis_dyrere": "Tanken sparer intet mod ingen tank. Det kan ikke passe ud over tolerancen; tjek starttilstand og gab.",
   "naeste_skridt": [
    "Kør hele rækken 4.000 / 8.000 / 14.000 m³ for at se, hvor værdien mættes",
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab",
    "Kør parret igen med balancemarkedet slået til"
   ]
  }
 },
 "enhedens_vaerdi": {
  "spoergsmaal": "Hvad er en enhed værd for os?",
  "anbefaling": {
   "type": "beslutning",
   "kraever_helaar": true,
   "forventet_fortegn": "≥ 0 (uden enheden er der færre muligheder)",
   "hvis_dyrere": "{enhed} sparer {abs} i driften i perioden{skaleret} — behold den.",
   "hvis_billigere": "Driften er {abs} billigere uden {enhed}. Det kan ikke passe ud over solverens tolerance; tjek starttilstand (initial_status) og gab.",
   "naeste_skridt": [
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab",
    "Sammenhold med enhedens faste årlige omkostninger, som modellen ikke kender"
   ]
  }
 },
 "ny_enhed": {
  "spoergsmaal": "Hvad er en ny enhed værd (investering)?",
  "anbefaling": {
   "type": "beslutning",
   "kraever_helaar": true,
   "forventet_fortegn": "≤ 0 (en ekstra enhed kan kun udvide mulighederne)",
   "hvis_billigere": "Den nye {enhed} sparer {abs} i driften i perioden{skaleret}. Investeringen betaler sig, hvis den årlige besparelse er større end investeringens annuitet plus faste omkostninger.",
   "hvis_dyrere": "Den nye {enhed} gør driften dyrere — det kan ikke passe ud over tolerancen; tjek gab og starttilstand.",
   "naeste_skridt": [
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab",
    "Kør parret igen med balancemarkedet slået til (hvis enheden er el og kan prækvalificeres)",
    "Beregn annuiteten af investeringen (se anbefalingsregler.json → investering)"
   ]
  }
 },
 "braendselspris": {
  "spoergsmaal": "Hvor følsom er økonomien for brændselsprisen?",
  "anbefaling": {
   "type": "foelsomhed",
   "forventet_fortegn": "højere pris → ≥ 0; lavere pris → ≤ 0",
   "tekst": "{brændsel} {pct} dyrere gør driften {abs} dyrere i perioden — ca. {pr_enhed} kr. pr. kr./MWh i prisændring.",
   "naeste_skridt": [
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab",
    "Prøv samme ændring med og uden tank: brændselsprisen flytter tankens værdi (rapport v4 §4.4)"
   ]
  }
 },
 "co2_pris": {
  "spoergsmaal": "Hvad betyder CO₂-kvoteprisen?",
  "anbefaling": {
   "type": "foelsomhed",
   "forventet_fortegn": "højere pris → ≥ 0",
   "tekst": "En CO₂-pris på {b} i stedet for {a} kr./t gør driften {abs} dyrere/billigere i perioden.",
   "naeste_skridt": [
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab"
   ]
  }
 },
 "elafgift": {
  "spoergsmaal": "Hvad betyder elafgiften?",
  "anbefaling": {
   "type": "foelsomhed",
   "forventet_fortegn": "højere afgift → ≥ 0",
   "tekst": "En elafgift på {b} i stedet for {a} kr./MWh gør driften {abs} dyrere/billigere i perioden.",
   "naeste_skridt": [
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab"
   ]
  }
 },
 "praekvalifikation": {
  "spoergsmaal": "Hvad er en større prækvalifikation værd?",
  "anbefaling": {
   "type": "beslutning",
   "kraever_helaar": true,
   "forventet_fortegn": "≤ 0 (et højere loft kan kun udvide mulighederne)",
   "hvis_billigere": "En større prækvalifikation sænker driftsomkostningen med {abs} i perioden{skaleret} — som Spor A en øvre grænse.",
   "hvis_dyrere": "Et højere loft kan ikke gøre driften dyrere ud over tolerancen; tjek gab.",
   "naeste_skridt": [
    "Tjek om kapacitetsprisgatens blokke binder før loftet (så ændrer loftet intet)",
    "Kør med en prognose i stedet for at kende aktiveringerne",
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab"
   ]
  }
 },
 "budstrategi_viden": {
  "spoergsmaal": "Hvad betyder det, hvad værket ved, når det byder?",
  "anbefaling": {
   "type": "metode",
   "forventet_fortegn": "intet (forskelligt afregningsgrundlag)",
   "tekst": "At kende aktiveringerne på forhånd puster balancetallet {abs} op i forhold til en prognose — så meget af tallet er perfekt viden, ikke budstrategi.",
   "naeste_skridt": [
    "Brug prognosen (trailing30, settle realized) som jeres tal"
   ]
  }
 },
 "beregnet_budpris": {
  "spoergsmaal": "Hvad sker der, hvis vi kun byder, når det betaler sig (beregnet budpris)?",
  "anbefaling": {
   "type": "beslutning",
   "kraever_helaar": false,
   "forventet_fortegn": "intet (gaten kan både koste og spare, når der afregnes på det realiserede)",
   "hvis_billigere": "At byde kun, når det betaler sig, sparer {abs} i perioden mod at byde frit på prognosen.",
   "hvis_dyrere": "At byde kun, når det betaler sig, koster {abs} mere end at byde frit på prognosen — men det frie bud lover mere, end det holder (doc/BUDSTRATEGI.md:337).",
   "naeste_skridt": [
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab",
    "Sammenlign med jeres egen afregning pr. marked"
   ]
  }
 },
 "indtaegtsmetode": {
  "spoergsmaal": "Hvor meget betyder indtægtsmetoden (legacy mod activation_value)?",
  "anbefaling": {
   "type": "metode",
   "forventet_fortegn": "intet",
   "tekst": "Indtægtsmetoden flytter resultatet {abs}. activation_value er den anbefalede metode (doc/BALANCEMARKED.md:52-66).",
   "naeste_skridt": [
    "Brug activation_value i jeres tal"
   ]
  }
 },
 "robust_reservation": {
  "spoergsmaal": "Hvad betyder kravet om, at driften holder uden aktivering?",
  "anbefaling": {
   "type": "metode",
   "forventet_fortegn": "false → ≤ 0 (kravet fjernes)",
   "tekst": "Kravet om, at driften holder uden aktivering, koster {abs} i perioden. Behold kravet — sådan planlægger værkerne (doc/BUDSTRATEGI.md:92-96).",
   "naeste_skridt": []
  }
 },
 "nettabsmodel": {
  "spoergsmaal": "Ny mod gammel nettabsmodel?",
  "anbefaling": {
   "type": "metode",
   "forventet_fortegn": "intet",
   "tekst": "Nettabsmodellen flytter resultatet {abs}.",
   "naeste_skridt": []
  }
 },
 "klimaomraade": {
  "spoergsmaal": "Hvor meget betyder valget af DMI-område?",
  "anbefaling": {
   "type": "foelsomhed",
   "forventet_fortegn": "intet",
   "tekst": "Vejret fra {b} i stedet for {a} flytter driftsomkostningen {abs} ({pct}). Vælg den station, der ligner værkets klima.",
   "naeste_skridt": []
  }
 },
 "maalt_varmelast": {
  "spoergsmaal": "Hvor meget betyder det at bruge målt varmelast i stedet for syntesen?",
  "anbefaling": {
   "type": "metode",
   "forventet_fortegn": "intet",
   "tekst": "Målt varmelast i stedet for syntesen flytter driftsomkostningen {abs} ({pct}) — et mål for syntesens fejl.",
   "naeste_skridt": [
    "Brug målt varmelast, når den findes; ellers rekalibrér syntesen (doc/VARMELAST_OG_NETTAB.md:50-85)"
   ]
  }
 }
};

export const VISNINGSNAVNE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
 "braendsel": {
  "natural_gas": "Naturgas",
  "straw": "Halm",
  "flis": "Flis",
  "wood_pellets": "Træpiller",
  "waste_heat": "Overskudsvarme",
  "co2_eua": "CO₂-kvoter",
  "electricity": "El",
  "solar": "Sol"
 },
 "marked": {
  "afrr": "aFRR",
  "mfrr": "mFRR"
 },
 "foresight": {
  "realized": "kender aktiveringerne",
  "profile": "gennemsnit pr. måned og time",
  "trailing30": "seneste 30 døgn",
  "lag24": "samme time i går",
  "lag168": "samme time sidste uge"
 },
 "settle": {
  "forecast": "prognosens tal",
  "realized": "afregnet på det realiserede"
 },
 "balancing_method": {
  "activation_value": "kvarterets aktiveringsværdi (anbefalet)",
  "legacy": "gennemsnit gange gennemsnit (ældre)"
 }
};

export const FASTE_VINDUER: readonly { navn: string; periode_start: string; periode_slut: string }[] = [
 {
  "navn": "Vintervindue (kursus)",
  "periode_start": "2026-01-05",
  "periode_slut": "2026-01-16"
 },
 {
  "navn": "Sommervindue (kursus)",
  "periode_start": "2026-06-08",
  "periode_slut": "2026-06-19"
 },
 {
  "navn": "Rullende år",
  "periode_start": "2025-07-01",
  "periode_slut": "2026-06-30"
 }
];
