"""DIAGNOSE af to timefiler (``_hourly.csv``), der ikke er byte-ens: afviger de kun i fordelingen mellem lagre?

Hvorfor (runde 15, den uafhængige test 18. november 2026, iagttagelse 3.7): med to eller flere lagre er fordelingen
mellem dem ikke entydig. Testen så samme objektiv, samme produktion og samme samlede lager, men en anden fordeling
mellem ``tank_lav`` og ``tank_hoej`` (op til 68 MWh og 25 MW pr. tank). Det er en alternativ optimal løsning, ikke en
forskel i regningen — men en byte-sammenligning af timefilerne melder den som en forskel, og så er det værd at vide,
HVAD forskellen består i.

**Dette er ikke et beståelseskrav.** I runde 15 gav "ens på summen over lagre" en bestået case (``ENS*``) i
``bevis_app_vej.py``. Kodegennemgangen (fund 7) viste, at reglen kunne skjule ændrede resultater: den så kun på samlet
niveau og samlet NETTOeffekt, mens appens række *Alle lagre* viser BRUTTOafladningen (to lagre på 5/5 MWh uden drift
mod 6/4 MWh, hvor det ene lader 1 MW og det andet aflader 1 MW, gik igennem); et ``NaN`` gjorde differencen til
``NaN``, som aldrig er større end en tolerance; og manglede nettokolonnerne, blev effekten slet ikke sammenlignet.
Beviset kræver derfor igen byte-lighed, og funktionen her bruges kun til at forklare en ``FORSKEL``.

Diagnosen siger "samme sum" (``ens_paa_sum``), når

* overskriften og antallet af rækker er ens,
* HVER kolonne, der ikke hører til et lager, er tegn for tegn den samme (tid, varmelast, priser, hver enheds
  produktion, start/stop),
* serierne er KOMPLETTE: hvert lager har ``_level_mwh``, ``_net_mw``, ``_charge_mw`` og ``_discharge_mw``,
* hvert tal i dem er ENDELIGT (ikke tomt, ``NaN`` eller uendeligt), og
* summen over lagrene er den samme, række for række og inden for filens egen afrunding, for alle fire størrelser:
  niveau, netto, opladning og afladning (``sum`` siger hvilke).

``_level_pct`` lægges ikke sammen (procenten afhænger af tankens størrelse). Med ét lager er der intet at fordele.

Kun standardbiblioteket.
"""
from __future__ import annotations

import csv
import io
import math
import re

#: Kolonner pr. lager i modellens timefil (src/reporting.py); ``_level_mwh`` udpeger lageret.
_LAGERKOLONNE = re.compile(r"^(.+)_(level_mwh|level_pct|charge_mw|discharge_mw|net_mw)$")
#: Niveauet skrives med fuld præcision: to løsninger med samme samlede lager afviger på afrundingsstøj (målt < 1e-13).
TOL_NIVEAU_MWH = 1e-6
#: Effekter skrives med 3 decimaler: hver kolonne kan være afrundet 0,0005, så summen af n lagre højst n × 0,0005.
AFRUNDING_MW = 0.0005

#: De fire størrelser, der lægges sammen over lagrene: (nøgle i ``sum``, kolonneendelse, navn i teksten, enhed).
_STOERRELSER = (("niveau", "_level_mwh", "samlet lagerindhold", "MWh"), ("netto", "_net_mw", "samlet nettoeffekt fra lagrene", "MW"),
                ("opladning", "_charge_mw", "samlet opladning", "MW"), ("afladning", "_discharge_mw", "samlet afladning", "MW"))


def _laes(tekst: str) -> tuple[list[str], list[list[str]]]:
    rk = list(csv.reader(io.StringIO(tekst)))
    return (rk[0], rk[1:]) if rk else ([], [])


def lagre(hoved: list[str]) -> list[str]:
    """Lagernavnene i en timefils overskrift, i filens rækkefølge."""
    return [k[: -len("_level_mwh")] for k in hoved if k.endswith("_level_mwh")]


def _endelig(v: str) -> float:
    """Feltet som et endeligt tal — ``ValueError`` for tomt, tekst, ``NaN`` og uendeligt."""
    x = float(v)
    if not math.isfinite(x):
        raise ValueError(v)
    return x


def sammenlign(a_tekst: str, b_tekst: str) -> dict:
    """Diagnosticér to timefiler. Returnerer::

        {"byte_ens": bool,           # filerne er tegn for tegn ens (det eneste, der består beviset)
         "ens_paa_sum": bool,        # kun fordelingen mellem lagre afviger, efter reglen ovenfor (sand også ved byte_ens)
         "sum": {"niveau": …, "netto": …, "opladning": …, "afladning": …},   # sand/falsk pr. størrelse; None = ikke afgjort
         "lagre": [...],             # lagrene i filen
         "maks_pr_lager_mwh": float, # største forskel i ét lagers niveau (0 ved byte_ens)
         "forskelle": [...]}         # hvad der afviger, i klartekst (tom når ens_paa_sum)
    """
    if a_tekst == b_tekst:
        return {"byte_ens": True, "ens_paa_sum": True, "sum": {n: True for n, *_ in _STOERRELSER},
                "lagre": lagre(_laes(a_tekst)[0]), "maks_pr_lager_mwh": 0.0, "forskelle": []}
    (ha, ra), (hb, rb) = _laes(a_tekst), _laes(b_tekst)
    ud = {"byte_ens": False, "ens_paa_sum": False, "sum": {n: None for n, *_ in _STOERRELSER},
          "lagre": lagre(ha), "maks_pr_lager_mwh": 0.0, "forskelle": []}
    fejl: list[str] = ud["forskelle"]
    if ha != hb:
        fejl.append("overskrifterne er forskellige")
        return ud
    if len(ra) != len(rb):
        fejl.append(f"antal rækker: {len(ra)} mod {len(rb)}")
        return ud
    navne = ud["lagre"]
    if len(navne) < 2:
        fejl.append("filerne er forskellige, og der er færre end to lagre at fordele imellem")
        return ud
    # Komplette serier: hver størrelse skal findes for HVERT lager, ellers kan summen ikke afgøres.
    mangler = [f"{n}{endelse}" for _, endelse, *_ in _STOERRELSER for n in navne if f"{n}{endelse}" not in ha]
    if mangler:
        fejl.append(f"kolonnerne {', '.join(mangler)} mangler: serierne er ikke komplette, så summen over lagre kan ikke afgøres")
        return ud
    lagerkol = {i for i, k in enumerate(ha) if (m := _LAGERKOLONNE.match(k)) and m.group(1) in navne}
    kol = {noegle: [ha.index(f"{n}{endelse}") for n in navne] for noegle, endelse, *_ in _STOERRELSER}
    tol = {"niveau": TOL_NIVEAU_MWH, **{n: AFRUNDING_MW * 2 * len(navne) + 1e-9 for n in ("netto", "opladning", "afladning")}}
    ens = {n: True for n, *_ in _STOERRELSER}
    maks = 0.0
    for nr, (x, y) in enumerate(zip(ra, rb), start=2):
        if len(x) != len(ha) or len(y) != len(ha):
            fejl.append(f"linje {nr}: forkert antal felter")
            break
        andet = next((k for i, k in enumerate(ha) if i not in lagerkol and x[i] != y[i]), None)
        if andet is not None:
            i = ha.index(andet)
            fejl.append(f"linje {nr}, {andet}: {x[i]} mod {y[i]} (ikke en lagerkolonne)")
            break
        try:
            summer = {n: (sum(_endelig(x[i]) for i in ix), sum(_endelig(y[i]) for i in ix)) for n, ix in kol.items()}
            maks = max(maks, *(abs(_endelig(x[i]) - _endelig(y[i])) for i in kol["niveau"]))
        except ValueError:
            fejl.append(f"linje {nr}: en lagerkolonne er ikke et endeligt tal (tom, tekst, NaN eller uendelig)")
            break
        for noegle, _endelse, navn, enhed in _STOERRELSER:
            sa, sb = summer[noegle]
            if ens[noegle] and abs(sa - sb) > tol[noegle]:
                ens[noegle] = False                      # første afvigende række pr. størrelse er nok til teksten
                fejl.append(f"linje {nr}: {navn} {sa!r} mod {sb!r} {enhed}")
    else:
        ud["sum"] = ens                                   # alle rækker læst: summen er afgjort for hver størrelse
    ud["maks_pr_lager_mwh"] = maks
    ud["ens_paa_sum"] = not fejl
    return ud


def diagnose(r: dict) -> str:
    """Diagnosen som én sætning til beviset (``bevis_app_vej.py``) — aldrig en dom over, om casen består."""
    if r["byte_ens"]:
        return "timefilerne er byte-ens"
    if r["ens_paa_sum"]:
        return (f"kun fordelingen mellem lagrene ({', '.join(r['lagre'])}) afviger: samlet niveau, netto, opladning og afladning er ens "
                f"time for time, og alt uden for lagerkolonnerne er tegn for tegn ens (højst {r['maks_pr_lager_mwh']:.1f} MWh pr. lager)")
    kendte = [n for n, v in r["sum"].items() if v is True]
    return (("på summen over lagre er " + ", ".join(kendte) + " ens, men: " if kendte and len(kendte) < len(r["sum"]) else "")
            + "; ".join(r["forskelle"][:3]))
