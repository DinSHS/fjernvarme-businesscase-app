//-----------------------------------------------------------------------
// GENERERET af _byg/byg_viden.py fra viden/knapper.json og viden/felt_katalog.json
// (fv-ekspert). Ret ikke i hånden.
// Modelcommit: b49aeb0af097be42938b80a0fea6acdd77162836 · 16 knapper · 151 felter
//-----------------------------------------------------------------------

import type { Feltpost, Knap, FastVindue, Regel } from "./viden";

export const MODEL_COMMIT = "b49aeb0af097be42938b80a0fea6acdd77162836";

export const FAELLES_REGLER: readonly Regel[] = [
 {
  "regel": "Én knap ad gangen. Kombineres flere, er differensen den samlede effekt, og bidragene kan ikke skilles ad.",
  "kilde": "doc/KOERSEL.md:43-44"
 },
 {
  "regel": "Reference og scenarie skal have samme værk (samme revision), periode, datakilde, opløsning, balanceringsvalg og gab — kun knappen må være forskellig.",
  "kilde": "doc/KOERSEL.md:11-15"
 },
 {
  "regel": "Læs differenser med mip_rel_gap 0.0002. Standardgabet (0,5 %) kan være større end selve differensen, og fortegnet kan vende.",
  "kilde": "doc/KOERSEL.md:57-60; src/config.py:701-711"
 },
 {
  "regel": "Sæt også mip_abs_gap, fx 100 kr. HiGHS stopper, når ÉT af de to gab er nået; uden solver-blok i værket er det absolutte gab 5.000 kr., og så binder det før 0,02 % på ethvert objektiv under 25 mio. kr. (målt: Spor A, marts 2026 stoppede ved 0,068 % i stedet for 0,02 %).",
  "kilde": "src/config.py:713-714; src/config.py:742-751; rapport v4 §2.3"
 },
 {
  "regel": "Slå en enhed eller et lager fra med disable (sti = navnet; oversættes til <units|storage>.<navn>.enabled) — sæt ikke kapaciteten til 0; det efterlader enhedens variable i problemet.",
  "kilde": "src/config.py:513; src/config.py:568"
 },
 {
  "regel": "set må kun pege på en eksisterende skalar- eller listesti i værket. Nye nøgler og blokke er en værksændring, ikke et scenarie. To ændringer på samme sti i ét scenarie afvises.",
  "kilde": "KONTRAKT §3.5; src/config.py:825-874"
 },
 {
  "regel": "Sæt grundstørrelsen, ikke den afledte: volume_m3 (med e_max_mwh = null), ikke e_max_mwh.",
  "kilde": "src/config.py:910-912; src/config.py:571-575"
 },
 {
  "regel": "Tidsgrænsen sættes med scenariets felt tidsgraense_s, ikke som set på solver.time_limit: Spor A/B-casene har ingen solver-blok, og stien findes derfor ikke.",
  "kilde": "KONTRAKT §3.4; src/config.py:1124-1131"
 },
 {
  "regel": "set på time.* og solver.* afvises i scenarier; brug scenariefelterne (periode, mip_rel_gap, mip_abs_gap, tidsgraense_s). Version 1 kører kun 1h-opløsning.",
  "kilde": "KONTRAKT §6c"
 }
];

export const ANBEFALET_GAB = {
 "mip_rel_gap": 0.0002,
 "mip_abs_gap": 100,
 "begrundelse": "Det absolutte gab må ikke binde før det relative: abs ≤ 0,0002 × objektiv. 100 kr. opfylder det for ethvert objektiv over 0,5 mio. kr. (alle repoets værker og vinduer). Målt 2026-10-16: med 0,0002 og 100 kr. løste alle otte Andeby-vinterkørsler til gab 0 på under 1 s; Billund Spor B (4 måneder, abs 1.000) nåede 0,013–0,019 %.",
 "kilde": "doc/KOERSEL.md:57-60; src/config.py:742-751; udviklingsrapport (gab-forsøg og demo-kørsler)"
} as const;

export const VISNINGSNAVNE: Record<string, Record<string, string>> = {
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

export const FASTE_VINDUER: readonly FastVindue[] = [
 {
  "navn": "Vintervindue (kursus)",
  "periode_start": "2026-01-05",
  "periode_slut": "2026-01-16",
  "note": "12 døgn; slutdatoen er inklusive. Løser på sekunder til et halvt minut.",
  "kilde": "doc/KOERSEL.md:109-110; doc/EGET_VAERK.md:109-111"
 },
 {
  "navn": "Sommervindue (kursus)",
  "periode_start": "2026-06-08",
  "periode_slut": "2026-06-19",
  "note": "12 døgn.",
  "kilde": "doc/KOERSEL.md:109-110"
 },
 {
  "navn": "Rullende år",
  "periode_start": "2025-07-01",
  "periode_slut": "2026-06-30",
  "note": "Kursets faste år: efter PICASSO, begge endepunkter om sommeren. Tager minutter til en time; regn på forhånd.",
  "kilde": "cases/andeby.yaml:93-117; README.md:148-152"
 }
];

export const KNAPPER: readonly Knap[] = [
 {
  "id": "balancemarkedets_vaerdi",
  "spoergsmaal": "Hvad er balancemarkedet værd for os?",
  "gruppe": "Balancemarked",
  "forklaring": "Kør samme værk og periode med og uden balancemarkedet (aFRR og mFRR). Differensen i samlet omkostning er balancemarkedets værdi — ikke indtægten, fordi den varme, der ikke produceres ved aktivering, skal laves et andet sted.",
  "valg": [],
  "reference": {
   "med_balancering": false,
   "aendringer": []
  },
  "scenarie": {
   "med_balancering": true,
   "aendringer": []
  },
  "kraever_stier": [
   "balancing.method"
  ],
  "tilgaengelig_i": [
   "andeby",
   "billund_idag",
   "billund_spora",
   "billund_spora_rullende",
   "billund_spora_rullende_bud",
   "billund_sporb",
   "billund_sporb_rullende"
  ],
  "advarsler": [
   "Perioden skal ligge efter ca. april 2025 (PICASSO). Data for ubalance og mFRR-aktivering begynder 4. marts 2025; tidligere perioder stopper på dækningen.",
   "Kun el-forbrugende enheder (varmepumpe, elkedel) byder. Gasmotorernes balanceindtægt og nedregulering er ikke med — hos Billund var motorerne 29 % af balanceindtægten i marts–juni 2026.",
   "Uden et månedsloft (availability) reserverer modellen al den effekt, footroom tillader. Tallet er en øvre grænse ved fuld tilgængelighed, ikke en prognose.",
   "Værket skal have prækvalificerede el-enheder (ancillary.afrr_qualified/mfrr_qualified) og lofter."
  ],
  "kilde": "doc/KOERSEL.md:36; doc/BALANCEMARKED.md:10-15; cases/andeby.yaml:97-101; rapport v4 §5.4; doc/BUDSTRATEGI.md:269",
  "utilgaengelig_tekst": "Værket har ingen balancemarkeds-blok.",
  "anbefaling": {
   "type": "beslutning",
   "kraever_helaar": false,
   "forventet_fortegn": "≤ 0 (at byde kan modellen altid lade være med)",
   "hvis_billigere": "Balancemarkedet sænker driftsomkostningen med {abs} i perioden{skaleret}.",
   "hvis_dyrere": "Balancemarkedet gør driften {abs} dyrere. Det kan ikke ske ved frivillige bud — tjek budstrategien (faste blokke, driven-gate).",
   "naeste_skridt": [
    "Kør med en prognose (foresight trailing30, settle realized), så modellen ikke kender aktiveringerne",
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab",
    "Sammenlign pr. marked med jeres egen afregning (Spor B)"
   ]
  }
 },
 {
  "id": "tankens_vaerdi",
  "spoergsmaal": "Hvad er tanken værd?",
  "gruppe": "Lager",
  "forklaring": "Slå alle lagre fra i scenariet. Differensen er tankens værdi i perioden. Regn den både uden og med balancemarked for at se, om tanken også betyder noget dér.",
  "valg": [],
  "reference": {
   "aendringer": []
  },
  "scenarie": {
   "aendringer": [
    {
     "type": "disable",
     "sti": "<lager>",
     "gentag_for": "alle_aktive_lagre"
    }
   ]
  },
  "kraever_stier": [
   "storage.<lager>.enabled"
  ],
  "tilgaengelig_i": [
   "andeby",
   "billund_idag",
   "billund_spora",
   "billund_spora_rullende",
   "billund_spora_rullende_bud",
   "billund_sporb",
   "billund_sporb_rullende"
  ],
  "eksempler": [
   {
    "vaerk": "andeby",
    "aendringer": [
     {
      "type": "disable",
      "sti": "tank_lav"
     },
     {
      "type": "disable",
      "sti": "tank_hoej"
     }
    ]
   },
   {
    "vaerk": "billund_*",
    "aendringer": [
     {
      "type": "disable",
      "sti": "tank_eksisterende"
     }
    ]
   }
  ],
  "advarsler": [
   "En tank kan skjule en urealistisk antagelse, fx kedler med minimumslast tændt ved start om sommeren. Uden tank kan scenariet blive uløseligt; sæt så initial_status 0 på de enheder i værket (gælder begge kørsler).",
   "Er tankens værdi ens med og uden balancemarked, begrænser budstrategien mængden så meget, at tanken ikke kommer i spil."
  ],
  "kilde": "doc/KOERSEL.md:37; rapport v4 §4.4; doc/BUDSTRATEGI.md:270",
  "utilgaengelig_tekst": "Værket mangler et felt, knappen kræver.",
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
 {
  "id": "tankstoerrelse",
  "spoergsmaal": "Hvor stor skal tanken være?",
  "gruppe": "Lager",
  "forklaring": "Kør en række scenarier med forskellig volumen og sammenlign hver med scenariet uden tank. Værdien mættes typisk hurtigt: hos Billund fangede de første 4.000 m³ 83 % af værdien af 14.000 m³.",
  "valg": [
   {
    "pladsholder": "<lager>",
    "fra": "storage",
    "filter": "enabled = true"
   }
  ],
  "reference": {
   "note": "Scenariet uden tank (knappen tankens_vaerdi) er fælles reference for hele rækken.",
   "aendringer": [
    {
     "type": "disable",
     "sti": "<lager>"
    }
   ]
  },
  "scenarie": {
   "aendringer": [
    {
     "type": "set",
     "sti": "storage.<lager>.volume_m3",
     "vaerdi_json": "4000"
    }
   ]
  },
  "sweep": {
   "sti": "storage.<lager>.volume_m3",
   "eksempel_vaerdier": [
    4000,
    8000,
    14000
   ],
   "kilde": "rapport v4 §4.3"
  },
  "kraever_stier": [
   "storage.<lager>.volume_m3"
  ],
  "tilgaengelig_i": [
   "andeby",
   "billund_idag",
   "billund_spora",
   "billund_spora_rullende",
   "billund_spora_rullende_bud",
   "billund_sporb",
   "billund_sporb_rullende"
  ],
  "advarsler": [
   "Virker kun, når e_max_mwh er null (det er det i alle repoets værker); ellers bestemmer e_max_mwh kapaciteten, og volumen ændrer intet.",
   "Bliver e_initial_mwh større end den nye kapacitet, sættes startindholdet automatisk til halvfuld. Skal det styres, sættes e_initial_mwh i samme scenarie.",
   "De marginale trin i et tanksweep er små (2.000–14.000 kr. på et objektiv omkring 5 mio.); brug det anbefalede gab."
  ],
  "kilde": "rapport v4 §4.3; src/config.py:571-594; doc/KOERSEL.md:57-60",
  "utilgaengelig_tekst": "Værket mangler et felt, knappen kræver.",
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
 {
  "id": "enhedens_vaerdi",
  "spoergsmaal": "Hvad er en enhed værd for os?",
  "gruppe": "Enheder",
  "forklaring": "Slå enheden fra i scenariet. Differensen er, hvad det koster at undvære den; KPI- og månedstallene viser, hvem der overtager.",
  "valg": [
   {
    "pladsholder": "<enhed>",
    "fra": "units",
    "filter": "enabled = true"
   }
  ],
  "reference": {
   "aendringer": []
  },
  "scenarie": {
   "aendringer": [
    {
     "type": "disable",
     "sti": "<enhed>"
    }
   ]
  },
  "kraever_stier": [
   "units.<enhed>.enabled"
  ],
  "tilgaengelig_i": [
   "andeby",
   "billund_idag",
   "billund_spora",
   "billund_spora_rullende",
   "billund_spora_rullende_bud",
   "billund_sporb",
   "billund_sporb_rullende"
  ],
  "advarsler": [
   "Kan de øvrige enheder ikke dække varmebehovet i alle timer, bliver modellen uløselig."
  ],
  "kilde": "doc/KOERSEL.md:38",
  "utilgaengelig_tekst": "Værket mangler et felt, knappen kræver.",
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
 {
  "id": "ny_enhed",
  "spoergsmaal": "Hvad er en ny enhed værd (investering)?",
  "gruppe": "Enheder",
  "forklaring": "Enheden skal stå i værket med enabled: false (læg den ind som værksændring). Slå den til i scenariet. Differensen er den årlige driftsbesparelse, som investeringen skal betale sig mod.",
  "valg": [
   {
    "pladsholder": "<enhed>",
    "fra": "units",
    "filter": "enabled = false"
   }
  ],
  "reference": {
   "aendringer": []
  },
  "scenarie": {
   "aendringer": [
    {
     "type": "enable",
     "sti": "<enhed>"
    }
   ]
  },
  "kraever_stier": [
   "units.<enhed>.enabled"
  ],
  "tilgaengelig_i": [
   "andeby",
   "billund_idag",
   "billund_spora",
   "billund_spora_rullende",
   "billund_spora_rullende_bud",
   "billund_sporb",
   "billund_sporb_rullende"
  ],
  "eksempler": [
   {
    "vaerk": "andeby",
    "aendringer": [
     {
      "type": "enable",
      "sti": "elkedel_gl"
     }
    ]
   },
   {
    "vaerk": "billund_*",
    "aendringer": [
     {
      "type": "enable",
      "sti": "overskudsvarme"
     }
    ]
   }
  ],
  "advarsler": [
   "Modellen regner kun driften. Investering, afskrivning og rente ligger uden for (investment.enabled bruges ikke).",
   "En ny el-enhed skal også have prækvalifikation og lofter, hvis den skal byde i balancemarkedet."
  ],
  "kilde": "README.md:28; doc/KOERSEL.md:38",
  "utilgaengelig_tekst": "Værket mangler et felt, knappen kræver.",
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
 {
  "id": "braendselspris",
  "spoergsmaal": "Hvor følsom er økonomien for brændselsprisen?",
  "gruppe": "Priser",
  "forklaring": "Sæt prisen på ét brændsel højere eller lavere. Differensen viser følsomheden. Hos Billund gjorde 25 % højere halm- og flispris tankens spotværdi ca. 18 % større.",
  "valg": [
   {
    "pladsholder": "<braendsel>",
    "fra": "prices",
    "tilladte": [
     "natural_gas",
     "straw",
     "flis",
     "wood_pellets",
     "waste_heat"
    ]
   }
  ],
  "reference": {
   "aendringer": []
  },
  "scenarie": {
   "aendringer": [
    {
     "type": "set",
     "sti": "prices.<braendsel>.value",
     "vaerdi_json": "<ny pris>"
    }
   ]
  },
  "kraever_stier": [
   "prices.<braendsel>.value"
  ],
  "tilgaengelig_i": [
   "andeby",
   "billund_idag",
   "billund_spora",
   "billund_spora_rullende",
   "billund_spora_rullende_bud",
   "billund_sporb",
   "billund_sporb_rullende"
  ],
  "noter": [
   "wood_pellets findes i intet af repoets værker; de øvrige fire findes i alle syv."
  ],
  "advarsler": [
   "Står flis ikke med egen pris i værket, bruger flis halmprisen; så flytter en ændret halmpris også flisen. (Alle repoets værker har egen flispris.)",
   "Prisen skal stå i værket i forvejen."
  ],
  "kilde": "doc/KOERSEL.md:39; rapport v4 §4.4; src/config.py:941",
  "utilgaengelig_tekst": "Brændslet har ingen pris i værket.",
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
 {
  "id": "co2_pris",
  "spoergsmaal": "Hvad betyder CO₂-kvoteprisen?",
  "gruppe": "Priser",
  "forklaring": "Sæt CO₂-prisen (kr. pr. ton). Den rammer kun enheder med co2_emissions_per_mwh_fuel > 0, typisk gas.",
  "valg": [],
  "reference": {
   "aendringer": []
  },
  "scenarie": {
   "aendringer": [
    {
     "type": "set",
     "sti": "prices.co2_eua.value",
     "vaerdi_json": "800"
    }
   ]
  },
  "kraever_stier": [
   "prices.co2_eua.value"
  ],
  "tilgaengelig_i": [
   "andeby",
   "billund_idag",
   "billund_spora",
   "billund_spora_rullende",
   "billund_spora_rullende_bud",
   "billund_sporb",
   "billund_sporb_rullende"
  ],
  "advarsler": [
   "Står gasprisen allerede inkl. CO₂-afgift, skal co2_eua være 0 i begge kørsler — ellers tælles CO₂ to gange."
  ],
  "kilde": "doc/KOERSEL.md:39; src/config.py:930-933",
  "utilgaengelig_tekst": "Værket har ingen CO₂-pris (prices.co2_eua).",
  "anbefaling": {
   "type": "foelsomhed",
   "forventet_fortegn": "højere pris → ≥ 0",
   "tekst": "En CO₂-pris på {b} i stedet for {a} kr./t gør driften {abs} dyrere/billigere i perioden.",
   "naeste_skridt": [
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab"
   ]
  }
 },
 {
  "id": "elafgift",
  "spoergsmaal": "Hvad betyder elafgiften?",
  "gruppe": "Priser",
  "forklaring": "Sæt elafgiften pr. MWh el. Har værket en tidsvarierende tarifprofil med posten elafgift_net, skal den sættes til samme tal i samme scenarie (to forskellige stier, så det er ikke en dublet).",
  "valg": [],
  "reference": {
   "aendringer": []
  },
  "scenarie": {
   "aendringer": [
    {
     "type": "set",
     "sti": "electricity.electricity_tax",
     "vaerdi_json": "<ny sats>"
    },
    {
     "type": "set",
     "sti": "electricity.tariff_consumption.fixed_components.elafgift_net",
     "vaerdi_json": "<samme sats>",
     "kun_hvis_stien_findes": true
    }
   ]
  },
  "kraever_stier": [
   "electricity.electricity_tax"
  ],
  "tilgaengelig_i": [
   "andeby",
   "billund_idag",
   "billund_spora",
   "billund_spora_rullende",
   "billund_spora_rullende_bud",
   "billund_sporb",
   "billund_sporb_rullende"
  ],
  "noter": [
   "Kun andeby har elafgift_net (tarifprofil)."
  ],
  "advarsler": [
   "Er de to tal forskellige, afvises kørslen."
  ],
  "kilde": "src/tariff.py:165-184",
  "utilgaengelig_tekst": "Værket har ingen elafgift (electricity.electricity_tax).",
  "anbefaling": {
   "type": "foelsomhed",
   "forventet_fortegn": "højere afgift → ≥ 0",
   "tekst": "En elafgift på {b} i stedet for {a} kr./MWh gør driften {abs} dyrere/billigere i perioden.",
   "naeste_skridt": [
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab"
   ]
  }
 },
 {
  "id": "praekvalifikation",
  "spoergsmaal": "Hvad er en større prækvalifikation værd?",
  "gruppe": "Balancemarked",
  "forklaring": "Hæv det samlede loft i balancemarkedet. Kør med balancering i både reference og scenarie.",
  "valg": [],
  "reference": {
   "med_balancering": true,
   "aendringer": []
  },
  "scenarie": {
   "med_balancering": true,
   "aendringer": [
    {
     "type": "set",
     "sti": "balancing.ancillary_caps.total_mw",
     "vaerdi_json": "<MW>"
    }
   ]
  },
  "kraever_stier": [
   "balancing.ancillary_caps.total_mw"
  ],
  "tilgaengelig_i": [
   "andeby",
   "billund_idag",
   "billund_spora",
   "billund_spora_rullende",
   "billund_spora_rullende_bud",
   "billund_sporb",
   "billund_sporb_rullende"
  ],
  "advarsler": [
   "Er kapacitetsprisgaten slået til, kan dens blokke binde før loftet; så ændrer et større loft intet. Hos Billund gav 47,52 MW uden større blokke samme resultat som 17,52 MW.",
   "Enhedens eget loft (per_unit_mw) og per-markedslofter binder stadig.",
   "Store bud bryder pris-tager-antagelsen: 17,52 MW svarer til 18 % af den aFRR-opregulering, Energinet i snit købte i DK1."
  ],
  "kilde": "rapport v4 §4.5; rapport v4 §7",
  "utilgaengelig_tekst": "Værket har intet samlet loft over buddene (balancing.ancillary_caps.total_mw).",
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
 {
  "id": "budstrategi_viden",
  "spoergsmaal": "Hvad betyder det, hvad værket ved, når det byder?",
  "gruppe": "Balancemarked",
  "forklaring": "Sammenlign 'kender aktiveringerne' (realized) med en prognose (trailing30) afregnet på det, der faktisk skete. Forskellen viser, hvor meget perfekt kendskab puster tallet op — den vigtigste antagelse bag et balancetal.",
  "valg": [],
  "reference": {
   "med_balancering": true,
   "aendringer": [
    {
     "type": "set",
     "sti": "balancing.activation.foresight",
     "vaerdi_json": "\"realized\""
    }
   ]
  },
  "scenarie": {
   "med_balancering": true,
   "aendringer": [
    {
     "type": "set",
     "sti": "balancing.activation.foresight",
     "vaerdi_json": "\"trailing30\""
    },
    {
     "type": "set",
     "sti": "balancing.activation.settle",
     "vaerdi_json": "\"realized\""
    }
   ]
  },
  "kraever_stier": [
   "balancing.activation.foresight",
   "balancing.activation.settle"
  ],
  "tilgaengelig_i": [
   "andeby",
   "billund_spora_rullende_bud"
  ],
  "advarsler": [
   "Kræver balancing.method activation_value.",
   "Med settle realized løses modellen to gange; løsetiden cirka fordobles.",
   "Mangler activation-blokken i værket, er knappen ikke tilgængelig; tilføj blokken som værksændring (doc/BUDSTRATEGI.md §5 har en færdig blok)."
  ],
  "kilde": "doc/BUDSTRATEGI.md:72-86; doc/BUDSTRATEGI.md:226-254; doc/BUDSTRATEGI.md:139-156",
  "utilgaengelig_tekst": "Værket har ingen budstrategi-blok (balancing.activation med foresight og settle). Tilføj den under Konfiguration › Balancemarked; doc/BUDSTRATEGI.md §5 har en færdig blok.",
  "anbefaling": {
   "type": "metode",
   "forventet_fortegn": "intet (forskelligt afregningsgrundlag)",
   "tekst": "At kende aktiveringerne på forhånd puster balancetallet {abs} op i forhold til en prognose — så meget af tallet er perfekt viden, ikke budstrategi.",
   "naeste_skridt": [
    "Brug prognosen (trailing30, settle realized) som jeres tal"
   ]
  }
 },
 {
  "id": "beregnet_budpris",
  "spoergsmaal": "Hvad sker der, hvis vi kun byder, når det betaler sig (beregnet budpris)?",
  "gruppe": "Balancemarked",
  "forklaring": "Slå kapacitetsprisgaten til med den beregnede budpris (alternativomkostning). Sammenlign med samme prognose uden gate.",
  "valg": [],
  "reference": {
   "med_balancering": true,
   "aendringer": [
    {
     "type": "set",
     "sti": "balancing.activation.foresight",
     "vaerdi_json": "\"trailing30\""
    },
    {
     "type": "set",
     "sti": "balancing.activation.settle",
     "vaerdi_json": "\"realized\""
    }
   ]
  },
  "scenarie": {
   "med_balancering": true,
   "aendringer": [
    {
     "type": "set",
     "sti": "balancing.activation.foresight",
     "vaerdi_json": "\"trailing30\""
    },
    {
     "type": "set",
     "sti": "balancing.activation.settle",
     "vaerdi_json": "\"realized\""
    },
    {
     "type": "set",
     "sti": "balancing.reservation_gate.enabled",
     "vaerdi_json": "true"
    }
   ]
  },
  "kraever_stier": [
   "balancing.activation.foresight",
   "balancing.activation.settle",
   "balancing.reservation_gate.afrr.opportunity_cost.reference_unit"
  ],
  "tilgaengelig_i": [
   "andeby"
  ],
  "advarsler": [
   "Kun Andeby har gaten med beregnet budpris (opportunity_cost). Billund-casene har gaten med fast tærskel og den slået til i forvejen.",
   "Giver gaten 0 kr., ligger værkets alternativomkostning over kapacitetsprisen i perioden. Det er ikke en fejl."
  ],
  "kilde": "doc/BUDSTRATEGI.md:226-262; cases/andeby.yaml:502-510",
  "utilgaengelig_tekst": "Værket har ingen kapacitetsprisgate med beregnet budpris (reservation_gate med opportunity_cost) og budstrategi-blok. Andeby har begge.",
  "anbefaling": {
   "type": "beslutning",
   "kraever_helaar": false,
   "forventet_fortegn": "intet (gaten kan både koste og spare, når der afregnes på det realiserede)",
   "hvis_billigere": "At byde kun, når det betaler sig, sparer {abs} i perioden mod at byde frit på prognosen.",
   "hvis_dyrere": "At byde kun, når det betaler sig, koster {abs} mere end at byde frit på prognosen — men det frie bud lover mere, end det holder (doc/BUDSTRATEGI.md:254).",
   "naeste_skridt": [
    "Kør helåret (1. juli 2025 – 30. juni 2026) med samme gab",
    "Sammenlign med jeres egen afregning pr. marked"
   ]
  }
 },
 {
  "id": "indtaegtsmetode",
  "spoergsmaal": "Hvor meget betyder indtægtsmetoden (legacy mod activation_value)?",
  "gruppe": "Balancemarked",
  "forklaring": "Kør med balancering og hver sin indtægtsmetode. legacy undervurderer systematisk, når aktivering og pris hænger sammen inden for timen.",
  "valg": [],
  "reference": {
   "med_balancering": true,
   "balancing_method": "activation_value",
   "aendringer": []
  },
  "scenarie": {
   "med_balancering": true,
   "balancing_method": "legacy",
   "aendringer": []
  },
  "kraever_stier": [
   "balancing.bid_strategy.up_markup_dkk_mwh"
  ],
  "tilgaengelig_i": [
   "andeby",
   "billund_idag",
   "billund_spora",
   "billund_spora_rullende",
   "billund_spora_rullende_bud",
   "billund_sporb",
   "billund_sporb_rullende"
  ],
  "advarsler": [
   "activation_value kræver bid_strategy i værket.",
   "Har værket en activation-blok med andet end clear/realized (andeby, billund_spora_rullende_bud, billund_sporb), afviser config.py method legacy i casen. Via scenariefeltet (CLI --balancing-method) sker kontrollen ikke, fordi metoden overskrives efter indlæsning (run_case.py:661-668); activation-blokken bruges så slet ikke, da aktiveringsparametrene kun bygges ved activation_value (src/data_loader_github.py:690-698). Differensen blander derfor metode og aktiveringsmodel på de tre værker."
  ],
  "kilde": "doc/KOERSEL.md:40; doc/BALANCEMARKED.md:52-65; src/config.py:1067-1071",
  "utilgaengelig_tekst": "Værket har ingen budstrategi (balancing.bid_strategy), som indtægtsmetoden activation_value kræver.",
  "anbefaling": {
   "type": "metode",
   "forventet_fortegn": "intet",
   "tekst": "Indtægtsmetoden flytter resultatet {abs}. activation_value er den anbefalede metode (doc/BALANCEMARKED.md:52-65).",
   "naeste_skridt": [
    "Brug activation_value i jeres tal"
   ]
  }
 },
 {
  "id": "robust_reservation",
  "spoergsmaal": "Hvad betyder kravet om, at driften holder uden aktivering?",
  "gruppe": "Balancemarked",
  "forklaring": "Sammenlign standarden (robust_reservation true) med false. Kun til at forstå modellen; false er ikke sådan, værker planlægger.",
  "valg": [],
  "reference": {
   "med_balancering": true,
   "aendringer": []
  },
  "scenarie": {
   "med_balancering": true,
   "aendringer": [
    {
     "type": "set",
     "sti": "balancing.robust_reservation",
     "vaerdi_json": "false"
    }
   ]
  },
  "kraever_stier": [
   "balancing.robust_reservation"
  ],
  "tilgaengelig_i": [
   "andeby",
   "billund_spora_rullende_bud"
  ],
  "advarsler": [
   "false kan give 'kan ikke løses' med settle realized uden tank om sommeren."
  ],
  "kilde": "doc/BUDSTRATEGI.md:88-97",
  "utilgaengelig_tekst": "Feltet robust_reservation står ikke i værket, så standarden (til) gælder altid. Tilføj feltet i værket for at kunne sammenligne.",
  "anbefaling": {
   "type": "metode",
   "forventet_fortegn": "false → ≤ 0 (kravet fjernes)",
   "tekst": "Kravet om, at driften holder uden aktivering, koster {abs} i perioden. Behold kravet — sådan planlægger værkerne (doc/BUDSTRATEGI.md:92-96).",
   "naeste_skridt": []
  }
 },
 {
  "id": "nettabsmodel",
  "spoergsmaal": "Ny mod gammel nettabsmodel?",
  "gruppe": "Varmelast",
  "forklaring": "Tilføj flaget --legacy-nettab i scenariet. Har kun virkning, hvis værket har en heat_load_params.nettab-blok og bruger syntetisk varmelast (intet heat_csv).",
  "valg": [],
  "reference": {
   "aendringer": []
  },
  "scenarie": {
   "ekstra_flag": "--legacy-nettab",
   "aendringer": []
  },
  "kraever_stier": [
   "heat_load_params.nettab.sommer.t_frem"
  ],
  "tilgaengelig_i": [],
  "advarsler": [
   "Intet værk i repoet @ b49aeb0 har en nettab-blok; knappen ændrer intet på dem.",
   "Med målt varmelast er nettabet allerede i målingen."
  ],
  "kilde": "doc/KOERSEL.md:41; doc/VARMELAST_OG_NETTAB.md:93-99; doc/VARMELAST_OG_NETTAB.md:136-139",
  "utilgaengelig_tekst": "Kræver den fysiske nettabsmodel (heat_load_params.nettab) og syntetisk varmelast. Ingen af repoets værker har den.",
  "anbefaling": {
   "type": "metode",
   "forventet_fortegn": "intet",
   "tekst": "Nettabsmodellen flytter resultatet {abs}.",
   "naeste_skridt": []
  }
 },
 {
  "id": "klimaomraade",
  "spoergsmaal": "Hvor meget betyder valget af DMI-område?",
  "gruppe": "Grundlag",
  "forklaring": "Ændrer grundlaget, ikke scenariet: vejret til varmelast og COP. Brug kun knappen, når netop datagrundlaget er spørgsmålet.",
  "valg": [
   {
    "pladsholder": "<omraade>",
    "tilladte": [
     "fyn",
     "vestkyst",
     "karup",
     "ringsted"
    ]
   }
  ],
  "reference": {
   "aendringer": []
  },
  "scenarie": {
   "aendringer": [
    {
     "type": "set",
     "sti": "data.dmi_area",
     "vaerdi_json": "\"<omraade>\""
    }
   ]
  },
  "kraever_stier": [
   "data.dmi_area"
  ],
  "tilgaengelig_i": [
   "andeby",
   "billund_idag",
   "billund_spora",
   "billund_spora_rullende",
   "billund_spora_rullende_bud",
   "billund_sporb",
   "billund_sporb_rullende"
  ],
  "advarsler": [
   "Valget alene kan flytte objektivet op til ca. 4 %.",
   "fyn og vestkyst mangler timer 28. februar 2026 (fyn også 1. januar 2026); perioder hen over dem stopper på dækningen."
  ],
  "kilde": "README.md:193-195; cases/andeby.yaml:89; doc/KOERSEL.md:110-111",
  "utilgaengelig_tekst": "Værket har ingen data-blok med DMI-område.",
  "anbefaling": {
   "type": "foelsomhed",
   "forventet_fortegn": "intet",
   "tekst": "Vejret fra {b} i stedet for {a} flytter driftsomkostningen {abs} ({pct}). Vælg den station, der ligner værkets klima.",
   "naeste_skridt": []
  }
 },
 {
  "id": "maalt_varmelast",
  "spoergsmaal": "Hvor meget betyder det at bruge målt varmelast i stedet for syntesen?",
  "gruppe": "Grundlag",
  "forklaring": "Sæt scenariets heat_csv til en målt varmelastfil. Ændrer grundlaget; bruges til at vurdere syntesens kvalitet, ikke som businesscase.",
  "valg": [
   {
    "pladsholder": "<fil>",
    "fra": "modelrepo data/",
    "tilladte": [
     "billund_abvaerk_hourly.csv",
     "billund_abvaerk_hourly_splejset_jun2026.csv"
    ]
   }
  ],
  "reference": {
   "heat_csv": null,
   "aendringer": []
  },
  "scenarie": {
   "heat_csv": "<fil>",
   "aendringer": []
  },
  "kraever_stier": [],
  "tilgaengelig_i": [
   "billund_idag",
   "billund_spora",
   "billund_spora_rullende",
   "billund_spora_rullende_bud",
   "billund_sporb",
   "billund_sporb_rullende"
  ],
  "advarsler": [
   "Billunds måling passer kun til Billund-værkerne.",
   "billund_abvaerk_hourly.csv har 161 manglende timer i marts–juni 2026; brug den splejsede fil."
  ],
  "kilde": "doc/KOERSEL.md:117; doc/BALANCEMARKED.md:209-210",
  "utilgaengelig_tekst": "Der findes ingen målt varmelast for dette værk i modelrepoets data/ — kun Billunds.",
  "anbefaling": {
   "type": "metode",
   "forventet_fortegn": "intet",
   "tekst": "Målt varmelast i stedet for syntesen flytter driftsomkostningen {abs} ({pct}) — et mål for syntesens fejl.",
   "naeste_skridt": [
    "Brug målt varmelast, når den findes; ellers rekalibrér syntesen (doc/VARMELAST_OG_NETTAB.md:50-85)"
   ]
  }
 }
] as unknown as readonly Knap[];

export const FELTER: readonly Feltpost[] = [
 {
  "sti": "meta.case_name",
  "sektion": "meta",
  "etiket": "Casens navn (filnavnsstamme)",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Bruges som første led i outputfilernes navn og som manifestets case_name. Skal være kort og uden mellemrum.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "meta.titel",
  "sektion": "meta",
  "etiket": "Titel",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Læsbar titel, som vises i manifestet. Mangler den, bruges case_name.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "meta.description",
  "sektion": "meta",
  "etiket": "Beskrivelse",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Fritekst om casen; skrives i manifestet som beskrivelse.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "meta.gruppe",
  "sektion": "meta",
  "etiket": "Gruppe",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Valgfri gruppering af cases (fx 'andeby'); skrives i manifestet.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "meta.rolle",
  "sektion": "meta",
  "etiket": "Rolle i gruppen",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Valgfri rolle inden for en gruppe (fx reference/scenarie); skrives i manifestet.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "meta.timezone_internal",
  "sektion": "meta",
  "etiket": "Intern tidszone",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Ren dokumentation: feltet læses ikke af modellen. Modellen regner altid internt i UTC og slår tarif og budvindue op i dansk lokaltid.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "meta.timezone_reporting",
  "sektion": "meta",
  "etiket": "Rapporteringstidszone",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Ren dokumentation: feltet læses ikke af modellen. Modellen regner altid internt i UTC og slår tarif og budvindue op i dansk lokaltid.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "meta.discount_rate_real",
  "sektion": "meta",
  "etiket": "Real diskonteringsrente",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Ren dokumentation: feltet læses ikke af modellen. Modellen regner altid internt i UTC og slår tarif og budvindue op i dansk lokaltid.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "meta.tax_year",
  "sektion": "meta",
  "etiket": "Afgiftsår",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Ren dokumentation: feltet læses ikke af modellen. Modellen regner altid internt i UTC og slår tarif og budvindue op i dansk lokaltid.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "data",
  "sektion": "data",
  "etiket": "Eksterne datakilder",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Påkrævet blok. Værket erklærer selv sit klimaområde og sin priszone; der er med vilje ingen standard, fordi en usynlig standard tidligere gav forkerte tal.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "data.dmi_area",
  "sektion": "data",
  "etiket": "DMI-område (klima)",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "fyn",
   "vestkyst",
   "karup",
   "ringsted"
  ],
  "min": null,
  "max": null,
  "forklaring": "Den DMI-station, hvis temperatur bruges til varmelast og varmepumpens COP. Vælg efter beliggenhed: vestkyst, karup (Midt- og Vestjylland), fyn, ringsted (Sjælland og øerne). Valget alene kan flytte objektivet op til ca. 4 %.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "data.price_zone",
  "sektion": "data",
  "etiket": "Priszone (spot)",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "DK1",
   "DK2"
  ],
  "min": null,
  "max": null,
  "forklaring": "Elspot-prisområde: DK1 vest for Storebælt, DK2 øst for. Bør være det samme som electricity.spot_area, som styrer balancepriserne.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "data.dmi_temp_shortname",
  "sektion": "data",
  "etiket": "DMI-temperaturvariabel",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Hvilken DMI-observation der bruges som udetemperatur. Lad standarden stå.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "data.eur_dkk",
  "sektion": "data",
  "etiket": "Valutakurs EUR→DKK",
  "enhed": "DKK/EUR",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Kurs til omregning af spotpriser i EUR.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "time.start",
  "sektion": "time",
  "etiket": "Periodens start",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Første time i kørslen, ISO-tid i UTC, fx 2025-07-01T00:00:00Z. Overskrives af scenariets periode, hvis den er sat.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "time.end",
  "sektion": "time",
  "etiket": "Periodens slut (sidste time)",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Sidste time i kørslen, inklusive, ISO-tid i UTC, fx 2026-06-30T23:00:00Z.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "time.resolution",
  "sektion": "time",
  "etiket": "Tidsopløsning",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "1h",
   "15min"
  ],
  "min": null,
  "max": null,
  "forklaring": "Modellens tidsskridt. Alle cases i repoet bruger 1h.",
  "avanceret": true,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "solver",
  "sektion": "solver",
  "etiket": "Solvertolerance",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Valgfri blok. Uden den gælder kodens standard (0,5 % / 5.000 kr. / 600 s), som er til absolutte tal, ikke til differenser.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "solver.mip_rel_gap",
  "sektion": "solver",
  "etiket": "Relativt MIP-gab",
  "enhed": "brøk",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": 1,
  "forklaring": "Solveren stopper, når løsningen bevisligt ligger inden for denne brøkdel af det bedst mulige. 0,005 = 0,5 %. Til differenser mellem scenarier: 0,0002.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "solver.mip_abs_gap",
  "sektion": "solver",
  "etiket": "Absolut MIP-gab",
  "enhed": "DKK",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Solveren stopper også, når afstanden til det bedst mulige er under dette beløb.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "solver.time_limit",
  "sektion": "solver",
  "etiket": "Tidsgrænse",
  "enhed": "s",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Maksimal løsetid. Rammes den, gemmes den bedste løsning med det opnåede gab.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "solver.presolve",
  "sektion": "solver",
  "etiket": "HiGHS presolve",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Sendes uændret til HiGHS. Lad standarden stå.",
  "avanceret": true,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "solver.parallel",
  "sektion": "solver",
  "etiket": "HiGHS parallel",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Sendes uændret til HiGHS. Lad standarden stå.",
  "avanceret": true,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "solver.presolve_rule_off",
  "sektion": "solver",
  "etiket": "Fravalgte presolve-regler (bitmaske)",
  "enhed": null,
  "type": "integer",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Tom = automatisk: aggregator-reglen (4096) slås fra ved robust reservation, fordi den 15/10-2026 gav en forkert løsning. 0 = alle regler tilladt.",
  "avanceret": true,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "heat_load_params",
  "sektion": "heat_load_params",
  "etiket": "Varmelast-syntese",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Parametre til at syntetisere varmebehovet af DMI-temperaturen. Blokken skal findes ved kørsel med rigtige data, også når målt varmelast (heat-csv) bruges — så læses den, men ignoreres.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "heat_load_params.gaf_mw_per_k",
  "sektion": "heat_load_params",
  "etiket": "Rumvarme-hældning (β_gaf)",
  "enhed": "MW/K",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Ekstra varmebehov pr. grad under t_ref (graddagsleddet), beregnet på et glidende gennemsnit af udetemperaturen.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.t_ref",
  "sektion": "heat_load_params",
  "etiket": "Referencetemperatur for rumvarme",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Udetemperatur, hvorunder der regnes rumvarme.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.thermal_inertia_hours",
  "sektion": "heat_load_params",
  "etiket": "Termisk inerti",
  "enhed": "timer",
  "type": "integer",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Tidskonstant for det glidende gennemsnit af udetemperaturen (bygningernes træghed).",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab_slope_mw_per_k",
  "sektion": "heat_load_params",
  "etiket": "Nettabs-hældning (β_net)",
  "enhed": "MW/K",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Hældningsmodellens nettab: ekstra MW pr. grad under t_net. 0 = intet temperaturafhængigt nettab-led. Ignoreres, hvis nettab-blokken findes.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.t_net",
  "sektion": "heat_load_params",
  "etiket": "Referencetemperatur for nettab",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Udetemperatur, hvorunder hældningsmodellens nettab-led regnes.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.baseline_profile_mw",
  "sektion": "heat_load_params",
  "etiket": "Grundlast pr. time på døgnet",
  "enhed": "MW",
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "24 tal: varmebehovet uden rumvarme (brugsvand og konstant nettab) for time 0–23 i UTC — modellens tidsakse, ikke dansk tid (time 0 = kl. 01 dansk vintertid, kl. 02 sommertid).",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.weekly_dip",
  "sektion": "heat_load_params",
  "etiket": "Weekend-reduktion",
  "enhed": "brøk",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Andel varmebehovet sænkes lørdag og søndag (0,02 = 2 %). Ugedagen bestemmes på UTC-aksen.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params._source",
  "sektion": "heat_load_params",
  "etiket": "Kalibreringsmetadata",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Sporbarhed fra kalibreringsscriptet. Felter med '_' foran læses ikke af modellen.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params._calibrated",
  "sektion": "heat_load_params",
  "etiket": "Kalibreringsmetadata",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Sporbarhed fra kalibreringsscriptet. Felter med '_' foran læses ikke af modellen.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params._fit_r2",
  "sektion": "heat_load_params",
  "etiket": "Kalibreringsmetadata",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Sporbarhed fra kalibreringsscriptet. Felter med '_' foran læses ikke af modellen.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params._fit_rmse",
  "sektion": "heat_load_params",
  "etiket": "Kalibreringsmetadata",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Sporbarhed fra kalibreringsscriptet. Felter med '_' foran læses ikke af modellen.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params._n_observations",
  "sektion": "heat_load_params",
  "etiket": "Kalibreringsmetadata",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Sporbarhed fra kalibreringsscriptet. Felter med '_' foran læses ikke af modellen.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab",
  "sektion": "heat_load_params",
  "etiket": "Fysisk nettabsmodel (to led)",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Valgfri blok. Når den findes, erstatter den hældningsmodellen: nettab = a·(T_rør − T_jord) + c·last. Påvirker kun den syntetiske varmelast; med målt varmelast er nettabet allerede i målingen.",
  "avanceret": true,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "heat_load_params.nettab.aarligt_nettab_pct",
  "sektion": "heat_load_params",
  "etiket": "Årligt nettab, andel",
  "enhed": "brøk",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Nettab som andel af årsproduktionen ab værk (0,146 = 14,6 %). Angiv denne eller aarligt_nettab_mwh.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.aarligt_nettab_mwh",
  "sektion": "heat_load_params",
  "etiket": "Årligt nettab, MWh",
  "enhed": "MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Nettab i MWh pr. år. Har forrang for aarligt_nettab_pct.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.sommer.t_frem",
  "sektion": "heat_load_params",
  "etiket": "Sommer: fremløbstemperatur",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Kundesidens fremløb i sommerperioden.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.sommer.t_retur",
  "sektion": "heat_load_params",
  "etiket": "Sommer: returtemperatur",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Kundesidens retur i sommerperioden.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.sommer.t_ude",
  "sektion": "heat_load_params",
  "etiket": "Sommer: ankertemperatur ude",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Udetemperaturen, som sæsonens rørtemperatur hører til.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.vinter.t_frem",
  "sektion": "heat_load_params",
  "etiket": "Vinter: fremløbstemperatur",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Kundesidens fremløb i vinterperioden.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.vinter.t_retur",
  "sektion": "heat_load_params",
  "etiket": "Vinter: returtemperatur",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Kundesidens retur i vinterperioden.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.vinter.t_ude",
  "sektion": "heat_load_params",
  "etiket": "Vinter: ankertemperatur ude",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Udetemperaturen, som sæsonens rørtemperatur hører til.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.konduktiv_andel",
  "sektion": "heat_load_params",
  "etiket": "Konduktiv andel af nettabet",
  "enhed": "brøk",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": 1,
  "forklaring": "Andel af nettabet, der er isolations- og jordtab; resten følger lasten.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.t_jord_avg",
  "sektion": "heat_load_params",
  "etiket": "Jordtemperatur, årsmiddel",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Middel af jordtemperaturen omkring rørene.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.t_jord_amp",
  "sektion": "heat_load_params",
  "etiket": "Jordtemperatur, amplitude",
  "enhed": "K",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Sæsonudsving i jordtemperaturen (statisk kurve, koldest i februar).",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.t_jord_dynamic",
  "sektion": "heat_load_params",
  "etiket": "Dynamisk jordtemperatur",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Lad jordtemperaturen følge et glidende gennemsnit af udetemperaturen i stedet for en fast sæsonkurve. Årets nettab er det samme; kun fordelingen ændres.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.t_jord_ema_days",
  "sektion": "heat_load_params",
  "etiket": "Jordtemperatur, tidskonstant",
  "enhed": "døgn",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Tidskonstant for det glidende gennemsnit (kun dynamisk).",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.t_jord_damping",
  "sektion": "heat_load_params",
  "etiket": "Jordtemperatur, dæmpning",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": 1,
  "forklaring": "Hvor meget af udetemperaturens afvigelse der slår igennem i jorden (kun dynamisk).",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "heat_load_params.nettab.t_jord_t_out_ref",
  "sektion": "heat_load_params",
  "etiket": "Klimanormal ude",
  "enhed": "°C",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Normal udetemperatur, som afvigelsen regnes fra (kun dynamisk).",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "prices.*",
  "sektion": "prices",
  "etiket": "Pris",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Én blok pr. brændsel med value (og unit som dokumentation). Brændselspriser er ekskl. moms pr. MWh brændsel. Kendte nøgler: natural_gas, straw, flis, wood_pellets, waste_heat, co2_eua.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "prices.co2_eua.value",
  "sektion": "prices",
  "etiket": "CO₂-kvotepris",
  "enhed": "DKK/t CO₂",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Pris pr. ton CO₂. Ganges på enhedernes co2_emissions_per_mwh_fuel. Skriv 0, hvis gasprisen allerede indeholder CO₂-afgiften.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "prices.natural_gas.value",
  "sektion": "prices",
  "etiket": "Naturgaspris",
  "enhed": "DKK/MWh brændsel",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Pris pr. MWh gas ekskl. moms, gerne inkl. de afgifter, der gælder alle gasenheder.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "prices.straw.value",
  "sektion": "prices",
  "etiket": "Halmpris",
  "enhed": "DKK/MWh brændsel",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Pris pr. MWh halm ekskl. moms.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "prices.flis.value",
  "sektion": "prices",
  "etiket": "Flispris",
  "enhed": "DKK/MWh brændsel",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Pris pr. MWh flis ekskl. moms. Mangler den, bruges halmprisen.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "prices.wood_pellets.value",
  "sektion": "prices",
  "etiket": "Træpillepris",
  "enhed": "DKK/MWh brændsel",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Pris pr. MWh træpiller ekskl. moms.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "prices.waste_heat.value",
  "sektion": "prices",
  "etiket": "Pris på overskudsvarme",
  "enhed": "DKK/MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Pris pr. MWh overskudsvarme. Modellen deler den IKKE med virkningsgraden, så den virker som en pris pr. MWh leveret varme.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "prices.*.unit",
  "sektion": "prices",
  "etiket": "Prisens enhed (tekst)",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Ren dokumentation; læses ikke af modellen.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "electricity.spot_area",
  "sektion": "electricity",
  "etiket": "Elområde for balancepriser",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "DK1",
   "DK2"
  ],
  "min": null,
  "max": null,
  "forklaring": "Prisområdet, aFRR- og mFRR-priserne hentes for. Hold det lig data.price_zone.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "electricity.tariff_consumption_flat",
  "sektion": "electricity",
  "etiket": "Forbrugstarif, fast",
  "enhed": "DKK/MWh el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Nettarif pr. MWh el, når der ikke er en tidsvarierende profil. Bruges også altid i aktiveringsværdien (sparet forbrug), selv når profilen er sat.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "electricity.tariff_production_flat",
  "sektion": "electricity",
  "etiket": "Produktionstarif",
  "enhed": "DKK/MWh el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Tarif pr. MWh produceret el; trækkes fra kraftvarmens elsalg.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "electricity.electricity_tax",
  "sektion": "electricity",
  "etiket": "Elafgift",
  "enhed": "DKK/MWh el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Elafgift pr. MWh el til varmeproduktion (efter godtgørelse). Lægges til elprisen for alle el-forbrugende enheder.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "electricity.tariff_consumption",
  "sektion": "electricity",
  "etiket": "Tidsvarierende forbrugstarif",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Valgfri båndprofil fra netselskabets prisblad: bånd, sæsoner og hverdag/weekend. Vinder over den faste tarif i driften. Opslag sker på dansk lokaltid.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "electricity.tariff_consumption.unit",
  "sektion": "electricity",
  "etiket": "Tarifprofilens enhed",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "kr_per_mwh"
  ],
  "min": null,
  "max": null,
  "forklaring": "Skal være kr_per_mwh.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "electricity.tariff_consumption.source",
  "sektion": "electricity",
  "etiket": "Kilde til tarifprofilen",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Fx netselskab og prisbladets dato. Vises i kørselsloggen.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "electricity.tariff_consumption.fixed_components.*",
  "sektion": "electricity",
  "etiket": "Fast tarifpost",
  "enhed": "DKK/MWh el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Tidsuafhængige poster (fx energinet, dv), der lægges oven i båndet. Navnene er frie.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "electricity.tariff_consumption.fixed_components.elafgift_net",
  "sektion": "electricity",
  "etiket": "Elafgift (dokumentation)",
  "enhed": "DKK/MWh el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Står kun som dokumentation og tælles IKKE med i tariffen; modellen lægger electricity_tax til. Skal være samme tal som electricity_tax.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "electricity.tariff_consumption.extra_holidays",
  "sektion": "electricity",
  "etiket": "Ekstra helligdage",
  "enhed": null,
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Datoer (ÅÅÅÅ-MM-DD), der tarifmæssigt regnes som weekend ud over de indbyggede danske helligdage (store bededag er ikke med fra 2024).",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "electricity.tariff_consumption.net_tariff.bands.*",
  "sektion": "electricity",
  "etiket": "Tarifbånd",
  "enhed": "DKK/MWh el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Nettarif pr. bånd, fx lav, hoej, spids. Navnene er frie og bruges i sæsonskemaerne.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "electricity.tariff_consumption.net_tariff.seasons.*.months",
  "sektion": "electricity",
  "etiket": "Sæsonens måneder",
  "enhed": null,
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Månedsnumre 1–12. Alle 12 måneder skal stå i præcis én sæson.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "electricity.tariff_consumption.net_tariff.seasons.*.weekday.*",
  "sektion": "electricity",
  "etiket": "Bånd for tidsinterval (hverdag)",
  "enhed": null,
  "type": "enum",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Nøglen er et halvåbent timeinterval 'HH-HH' i lokal tid ('06-21' = time 6 til og med 20); værdien er et båndnavn fra bands.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "electricity.tariff_consumption.net_tariff.seasons.*.weekend.*",
  "sektion": "electricity",
  "etiket": "Bånd for tidsinterval (weekend og helligdag)",
  "enhed": null,
  "type": "enum",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Nøglen er et halvåbent timeinterval 'HH-HH' i lokal tid ('06-21' = time 6 til og med 20); værdien er et båndnavn fra bands.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*",
  "sektion": "units",
  "etiket": "Produktionsenhed",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Én blok pr. enhed. Navnet er frit (brug små bogstaver, tal og _). Påkrævede felter: type, p_max_heat, p_min_heat, alpha, fuel.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "units.*.type",
  "sektion": "units",
  "etiket": "Enhedstype",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "heat_pump",
   "electric_boiler",
   "biomass_boiler",
   "gas_boiler",
   "gas_engine_chp",
   "solar_thermal",
   "waste_heat"
  ],
  "min": null,
  "max": null,
  "forklaring": "Varmepumpe, elkedel, biomassekedel, gaskedel, gasmotor, solvarme eller overskudsvarme. Typen er en etiket; økonomien styres af fuel og alpha. Kun heat_pump har en særregel (cop_curve).",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.enabled",
  "sektion": "units",
  "etiket": "Med i modellen",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "false fjerner enheden helt fra modellen — samme virkning som at slå den fra i et scenarie. Sæt ikke kapaciteten til 0 i stedet.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.p_max_heat",
  "sektion": "units",
  "etiket": "Maks. varmeeffekt",
  "enhed": "MW varme",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Enhedens største varmeproduktion. For varmepumpe med ydelsestabel et ekstra loft oven på tabellen; for solvarme nameplate (profilen binder).",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.p_min_heat",
  "sektion": "units",
  "etiket": "Min. varmeeffekt (minimumslast)",
  "enhed": "MW varme",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Laveste last, når enheden er tændt. Virker kun, når uc_enabled er true.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.alpha",
  "sektion": "units",
  "etiket": "El/varme-forhold (α)",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Elkedel: −1. Varmepumpe uden tabel: −1/COP. Gasmotor: el/varme (> 0), som giver elsalg. Kedler og sol: 0.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.fuel",
  "sektion": "units",
  "etiket": "Brændsel",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "electricity",
   "solar",
   "natural_gas",
   "straw",
   "flis",
   "wood_pellets",
   "waste_heat"
  ],
  "min": null,
  "max": null,
  "forklaring": "Hvad enheden bruger: electricity, solar eller en nøgle under prices. Afgør marginalomkostningen og om enheden kan byde i balancemarkedet (kun electricity).",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.eta_fuel_to_heat",
  "sektion": "units",
  "etiket": "Virkningsgrad brændsel→varme",
  "enhed": "brøk",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Varme pr. brændsel (0,96 = 96 %). Brændselsomkostningen pr. MWh varme er pris/η.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.var_om",
  "sektion": "units",
  "etiket": "Variabel D&V",
  "enhed": "DKK/MWh varme",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Drifts- og vedligeholdelsesomkostning pr. MWh varme.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.start_cost",
  "sektion": "units",
  "etiket": "Startomkostning",
  "enhed": "DKK/start",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Omkostning pr. start. Virker kun, når uc_enabled er true.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.min_uptime",
  "sektion": "units",
  "etiket": "Min. driftstid",
  "enhed": "timer",
  "type": "integer",
  "tilladte": null,
  "min": 1,
  "max": null,
  "forklaring": "Antal timer enheden skal køre efter en start. Virker kun med uc_enabled.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.min_downtime",
  "sektion": "units",
  "etiket": "Min. stilstandstid",
  "enhed": "timer",
  "type": "integer",
  "tilladte": null,
  "min": 1,
  "max": null,
  "forklaring": "Antal timer enheden skal stå efter et stop. Virker kun med uc_enabled.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.uc_enabled",
  "sektion": "units",
  "etiket": "Start/stop-logik (unit commitment)",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Slår minimumslast, min. drifts-/stilstandstid og startomkostning til. Gør modellen til en MILP og løsetiden længere.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.initial_status",
  "sektion": "units",
  "etiket": "Tændt ved periodens start",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   0,
   1
  ],
  "min": null,
  "max": null,
  "forklaring": "1 = tændt, 0 = slukket i første time. Betyder noget for enheder med minimumslast: tændte kedler uden tank kan gøre sommeren uløselig.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.co2_emissions_per_mwh_fuel",
  "sektion": "units",
  "etiket": "CO₂-udledning",
  "enhed": "t CO₂/MWh brændsel",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Ton CO₂ pr. MWh brændsel. Naturgas ca. 0,2; biomasse 0 (regnes neutral).",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.production_profile_path",
  "sektion": "units",
  "etiket": "Produktionsprofil (CSV)",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Tidsserie, der binder produktionen time for time: loft = min(profil, p_max_heat). Bruges til solvarme. Stien er relativ til modelrepoets rod; CSV med kolonnerne time (UTC) og en værdi i MW. Skal dække hele perioden.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.commissioned",
  "sektion": "units",
  "etiket": "Idriftsættelsesår",
  "enhed": null,
  "type": "integer",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Ren dokumentation; læses ikke af modellen.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.notes",
  "sektion": "units",
  "etiket": "Noter",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Fritekst; læses ikke af modellen.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.cop_curve",
  "sektion": "units",
  "etiket": "Varmepumpens ydelse",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Valgfri for heat_pump. Overruler alpha. Anbefalet er type table med målte punkter; uden blokken bruges COP = −1/alpha konstant.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "units.*.cop_curve.type",
  "sektion": "units",
  "etiket": "Ydelsesmodel",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "linear",
   "table"
  ],
  "min": null,
  "max": null,
  "forklaring": "table: målte punkter (udetemperatur, varme, el ved fuld last); varmeloftet følger temperaturen. linear: COP = a + b·T, klippet, med fast varmeloft (giver størst eloptag i frost — det omvendte af virkeligheden).",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.cop_curve.a",
  "sektion": "units",
  "etiket": "Lineær kurve: COP ved 0 °C",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Kun for type linear: COP = clip(a + b·T_ude, cop_min, cop_max).",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.cop_curve.b",
  "sektion": "units",
  "etiket": "Lineær kurve: COP-stigning pr. °C",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Kun for type linear: COP = clip(a + b·T_ude, cop_min, cop_max).",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.cop_curve.cop_min",
  "sektion": "units",
  "etiket": "Lineær kurve: Laveste COP",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Kun for type linear: COP = clip(a + b·T_ude, cop_min, cop_max).",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.cop_curve.cop_max",
  "sektion": "units",
  "etiket": "Lineær kurve: Højeste COP",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Kun for type linear: COP = clip(a + b·T_ude, cop_min, cop_max).",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.cop_curve.points",
  "sektion": "units",
  "etiket": "Ydelsestabel (målepunkter)",
  "enhed": null,
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Liste af {t_ambient (°C), heat_mw, el_mw} ved fuld last, gerne omkring −10, 0 og +15 °C. Varme og el interpoleres hver for sig; uden for punkterne holdes yderværdien. Tabellens største eloptag er reservationsloftet i balancemarkedet.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.ancillary",
  "sektion": "units",
  "etiket": "Balancemarked for enheden",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Kvalifikation og lofter for enhedens bud. Kun enheder med fuel electricity byder, uanset flagene.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "units.*.ancillary.afrr_qualified",
  "sektion": "units",
  "etiket": "Prækvalificeret til aFRR",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Må enheden byde op-regulering i aFRR.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.ancillary.mfrr_qualified",
  "sektion": "units",
  "etiket": "Prækvalificeret til mFRR",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Må enheden byde op-regulering i mFRR.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.ancillary.fcr_qualified",
  "sektion": "units",
  "etiket": "Prækvalificeret til FCR",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Læses, men bruges ikke: FCR er ikke med i modellen.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.ancillary.afrr_max_bid_mw",
  "sektion": "units",
  "etiket": "Maks. aFRR-bud for enheden",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Ældre pris-tager-beskyttelse pr. enhed. Ignoreres, når balancing.ancillary_caps eller shared_reserve_cap_mw er sat.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.ancillary.mfrr_max_bid_mw",
  "sektion": "units",
  "etiket": "Maks. mFRR-bud for enheden",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Ældre pris-tager-beskyttelse pr. enhed. Ignoreres, når balancing.ancillary_caps eller shared_reserve_cap_mw er sat.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.ancillary.available_from",
  "sektion": "units",
  "etiket": "Byder fra dato",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "ISO-dato; før den reserverer enheden intet (fx efter indkøring). Varmedriften er urørt.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.ancillary.bid_window.months",
  "sektion": "units",
  "etiket": "Budvindue: måneder",
  "enhed": null,
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Måneder (1–12, lokal tid), hvor enheden byder. Udeladt = alle. Fx byder mange værker ikke elkedlen om sommeren.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "units.*.ancillary.bid_window.hours_local",
  "sektion": "units",
  "etiket": "Budvindue: timer",
  "enhed": null,
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Timer på døgnet (0–23, dansk lokaltid), hvor enheden byder. Udeladt = alle.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "storage.*",
  "sektion": "storage",
  "etiket": "Varmelager (tank)",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Én blok pr. tank eller temperaturlag. Påkrævede felter: volume_m3, delta_t_k, e_initial_mwh, p_max_charge_mw, p_max_discharge_mw, self_discharge_per_hour.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "storage.*.enabled",
  "sektion": "storage",
  "etiket": "Med i modellen",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "false fjerner lageret helt — sådan regnes tankens værdi.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "storage.*.volume_m3",
  "sektion": "storage",
  "etiket": "Volumen",
  "enhed": "m³",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Tankens vandvolumen. Kapaciteten regnes af volumen og ΔT, hvis e_max_mwh er tom.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "storage.*.delta_t_k",
  "sektion": "storage",
  "etiket": "Temperaturdifferens (ΔT)",
  "enhed": "K",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Forskellen mellem lagerets top og bund. Kapacitet [MWh] = volumen × 1,163 kWh/(m³·K) × ΔT / 1000.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "storage.*.e_max_mwh",
  "sektion": "storage",
  "etiket": "Energikapacitet",
  "enhed": "MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Tom (null) = regnes af volumen og ΔT (anbefalet). Et tal her vinder over volumen.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "storage.*.e_initial_mwh",
  "sektion": "storage",
  "etiket": "Indhold ved start",
  "enhed": "MWh",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Lagerets indhold i første time. Med cyklusbinding skal lageret ende her.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "storage.*.p_max_charge_mw",
  "sektion": "storage",
  "etiket": "Maks. ladeeffekt",
  "enhed": "MW",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Største effekt ind i lageret.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "storage.*.p_max_discharge_mw",
  "sektion": "storage",
  "etiket": "Maks. afladeeffekt",
  "enhed": "MW",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Største effekt ud af lageret.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "storage.*.self_discharge_per_hour",
  "sektion": "storage",
  "etiket": "Varmetab pr. time",
  "enhed": "brøk/time",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Andel af indholdet, der tabes pr. time (0,0005 = 0,05 %).",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "storage.*.cycle_binding",
  "sektion": "storage",
  "etiket": "Slut som start",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Lageret skal ende med samme indhold, som det startede med, så perioden ikke tærer på et lager, den ikke har betalt for.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "storage.*.notes",
  "sektion": "storage",
  "etiket": "Noter",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Fritekst; læses ikke af modellen.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "grid.max_consumption_mw",
  "sektion": "grid",
  "etiket": "Nettilslutning, maks. eloptag",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Loft over det samlede eloptag fra varmepumper og elkedler pr. time. Gælder også planen uden aktivering og begrænser derfor reservationen. Billund: 33 MW.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "investment.enabled",
  "sektion": "investment",
  "etiket": "Investeringsmodul",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Læses, men bruges ikke af modellen i dag. Investeringer regnes som differens mellem to kørsler.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "ancillary_groups.*",
  "sektion": "ancillary_groups",
  "etiket": "Budgruppe",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Flere enheder med én fælles budgrænse pr. marked. Ignoreres, når balancing.ancillary_caps eller shared_reserve_cap_mw er sat.",
  "avanceret": true,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "ancillary_groups.*.units",
  "sektion": "ancillary_groups",
  "etiket": "Gruppens enheder",
  "enhed": null,
  "type": "list",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Enhedsnavne, der deler grænsen.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "ancillary_groups.*.afrr_max_bid_mw",
  "sektion": "ancillary_groups",
  "etiket": "Gruppens maks. aFRR-bud",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Summen af gruppens aFRR-bud pr. time.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "ancillary_groups.*.mfrr_max_bid_mw",
  "sektion": "ancillary_groups",
  "etiket": "Gruppens maks. mFRR-bud",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Summen af gruppens mFRR-bud pr. time.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing",
  "sektion": "balancing",
  "etiket": "Balancemarked",
  "enhed": null,
  "type": "object",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Læses kun ved kørsel med balancering. Uden den er varmeprisen ren spot.",
  "avanceret": false,
  "kan_saettes_i_scenarie": false
 },
 {
  "sti": "balancing.method",
  "sektion": "balancing",
  "etiket": "Indtægtsmetode",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "legacy",
   "activation_value"
  ],
  "min": null,
  "max": null,
  "forklaring": "activation_value (anbefalet): aktiveringsværdien regnes kvarter for kvarter, så samvariation mellem pris og aktivering fanges. legacy: gennemsnit gange gennemsnit; undervurderer systematisk.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.robust_reservation",
  "sektion": "balancing",
  "etiket": "Robust reservation",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Driften skal også holde, hvis buddet ikke aktiveres: varmen fra reserverede enheder skal kunne afsættes i nettet eller tanken. Standard siden 15/10-2026.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.shared_reserve_cap_mw",
  "sektion": "balancing",
  "etiket": "Fælles reserveloft (ældre)",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Ældre form af det samlede loft. Brug ancillary_caps.total_mw i stedet.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.bid_strategy.up_markup_dkk_mwh",
  "sektion": "balancing",
  "etiket": "Aktiveringsbud: tillæg til spot",
  "enhed": "DKK/MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Buddet på energi er spot + dette tillæg. Højere tillæg = sjældnere, men dyrere aktivering. Billund: 500.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.bid_strategy.up_markup_max_dkk_mwh",
  "sektion": "balancing",
  "etiket": "Aktiveringsbud: øvre bånd",
  "enhed": "DKK/MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Dokumentation af et øvre bånd; bruges ikke i beregningen.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.bid_strategy.down_markdown_dkk_mwh",
  "sektion": "balancing",
  "etiket": "Nedreguleringsbud: fradrag",
  "enhed": "DKK/MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Læses, men bruges ikke: modellen byder kun op-regulering.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.bid_strategy.down_markdown_max_dkk_mwh",
  "sektion": "balancing",
  "etiket": "Nedreguleringsbud: øvre bånd",
  "enhed": "DKK/MWh",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Læses, men bruges ikke.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.ancillary_caps.per_unit_mw.*",
  "sektion": "balancing",
  "etiket": "Prækvalifikation pr. enhed",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Største samlede bud (aFRR + mFRR) for enheden pr. time. Håndhæves altid.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.ancillary_caps.per_unit_market_mw.*.*",
  "sektion": "balancing",
  "etiket": "Bud pr. enhed pr. marked",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Værkets egen fordeling af den prækvalificerede effekt mellem aFRR og mFRR.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.ancillary_caps.total_mw",
  "sektion": "balancing",
  "etiket": "Samlet prækvalifikation",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Største sum af alle bud på tværs af enheder og markeder pr. time.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.reservation_gate.enabled",
  "sektion": "balancing",
  "etiket": "Kapacitetsprisgate til",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Byd kun i timer, hvor kapacitetsprisen er over en tærskel (fast eller beregnet).",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.reservation_gate.mode",
  "sektion": "balancing",
  "etiket": "Gatens virkemåde",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "driven",
   "bound"
  ],
  "min": null,
  "max": null,
  "forklaring": "bound: reservationen er højst blokken, når gaten er åben (Spor A, normativ). driven: reservationen ER blokken, når gaten er åben (fast melding).",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.reservation_gate.*.cm_threshold_dkk_mw_h",
  "sektion": "balancing",
  "etiket": "Fast budpris på kapacitet",
  "enhed": "DKK/MW/h",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Tærskel på day-ahead kapacitetsprisen; gaten er åben, når prisen er mindst denne.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.reservation_gate.*.block_mw",
  "sektion": "balancing",
  "etiket": "Blokstørrelse",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Den mængde, der reserveres (driven) eller højst reserveres (bound), når gaten er åben.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.reservation_gate.*.opportunity_cost.reference_unit",
  "sektion": "balancing",
  "etiket": "Beregnet budpris: referenceenhed",
  "enhed": null,
  "type": "string",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Den el-enhed, alternativomkostningen regnes for: τ = spot + tarif + afgift + COP·var_om − COP·(alternativ varmepris).",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.reservation_gate.*.opportunity_cost.floor_dkk_mw_h",
  "sektion": "balancing",
  "etiket": "Beregnet budpris: gulv",
  "enhed": "DKK/MW/h",
  "type": "number",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Laveste budpris uanset beregningen.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.activation.foresight",
  "sektion": "balancing",
  "etiket": "Hvad modellen ved, når den byder",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "realized",
   "profile",
   "trailing30",
   "lag24",
   "lag168"
  ],
  "min": null,
  "max": null,
  "forklaring": "realized: kender de faktiske aktiveringer (kun øvre grænse). profile: gennemsnit pr. måned og time. trailing30: de seneste 30 døgn. lag24/lag168: i går / sidste uge.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.activation.settle",
  "sektion": "balancing",
  "etiket": "Afregning",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "forecast",
   "realized"
  ],
  "min": null,
  "max": null,
  "forklaring": "forecast: tallet er prognosens. realized: løs på prognosen, lås reservationerne, og løs igen på det, der faktisk skete. Virker kun, når foresight ikke er realized.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.activation.*.model",
  "sektion": "balancing",
  "etiket": "Aktiveret andel",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "clear",
   "system_share",
   "ramp"
  ],
  "min": null,
  "max": null,
  "forklaring": "clear: hele buddet aktiveres, når prisen clearer (overvurderer 4–5 gange uden loft). system_share: andel efter systemets aktivering × k. ramp: andelen vokser med prisens afstand til buddet.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.activation.*.k",
  "sektion": "balancing",
  "etiket": "Skalering af systemandel (k)",
  "enhed": null,
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Kun system_share. Billund/Andeby-kalibrering for aFRR: 4.",
  "avanceret": false,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.activation.*.ramp_dkk_mwh",
  "sektion": "balancing",
  "etiket": "Rampebredde",
  "enhed": "DKK/MWh",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Kun ramp: prisafstand over buddet, hvor hele buddet regnes aktiveret.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.availability.enabled",
  "sektion": "balancing",
  "etiket": "Månedsloft på reservationen til",
  "enhed": null,
  "type": "boolean",
  "tilladte": null,
  "min": null,
  "max": null,
  "forklaring": "Værkets faktiske reservation pr. måned som loft (Spor B). Kræver egne afregningsdata og kan ikke overføres til andre værker eller perioder.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.availability.mode",
  "sektion": "balancing",
  "etiket": "Månedsloftets form",
  "enhed": null,
  "type": "enum",
  "tilladte": [
   "hourly",
   "energy"
  ],
  "min": null,
  "max": null,
  "forklaring": "hourly: loft i hver time. energy: loft på månedens MWh; modellen vælger selv timerne.",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 },
 {
  "sti": "balancing.availability.*.mw_by_month.*",
  "sektion": "balancing",
  "etiket": "Månedsloft",
  "enhed": "MW el",
  "type": "number",
  "tilladte": null,
  "min": 0,
  "max": null,
  "forklaring": "Reserverede MW for måneden (nøgle ÅÅÅÅ-MM).",
  "avanceret": true,
  "kan_saettes_i_scenarie": true
 }
];
