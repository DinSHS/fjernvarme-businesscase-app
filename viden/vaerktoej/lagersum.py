"""Sammenlign to timefiler (``_hourly.csv``) på SUMMEN over lagre, ikke lager for lager.

Hvorfor (runde 15, den uafhængige test 18. november 2026, iagttagelse 3.7): med to eller flere lagre er fordelingen
mellem dem ikke entydig. ``run_case.py`` på modelrepoets ``cases/andeby.yaml`` og appens vej (casen skrevet fra
bladene) gav i januarvinduerne samme objektiv, samme produktion og samme samlede lager, men en anden fordeling mellem
``tank_lav`` og ``tank_hoej`` (op til 68 MWh og 25 MW pr. tank). Det er en alternativ optimal løsning, ikke en
forskel i regningen — men en byte-sammenligning af timefilerne melder den som en forskel.

Reglen her er snæver med vilje. To timefiler er *ens på summen over lagre*, når

* overskriften og antallet af rækker er ens,
* HVER kolonne, der ikke hører til et lager, er tegn for tegn den samme (tid, varmelast, priser, hver enheds
  produktion, start/stop), og
* for hver række er summen over lagrene af ``<lager>_level_mwh`` og af ``<lager>_net_mw`` den samme inden for
  filens egen afrunding.

Lagrene er de navne, der har en kolonne ``<navn>_level_mwh``; deres øvrige kolonner (``_level_pct``,
``_charge_mw``, ``_discharge_mw``) er pr. lager og kan ikke lægges sammen til noget entydigt: procenten afhænger af
tankens størrelse, og lader ét lager, mens et andet aflader, vokser bruttotallene uden at nettoen ændres.
Med ét lager er der intet at fordele: da kræves byte-lighed.

Kun standardbiblioteket.
"""
from __future__ import annotations

import csv
import io
import re

#: Kolonner pr. lager i modellens timefil (src/reporting.py); ``_level_mwh`` udpeger lageret.
_LAGERKOLONNE = re.compile(r"^(.+)_(level_mwh|level_pct|charge_mw|discharge_mw|net_mw)$")
#: Niveauet skrives med fuld præcision: to løsninger med samme samlede lager afviger på afrundingsstøj (målt < 1e-13).
TOL_NIVEAU_MWH = 1e-6
#: Effekter skrives med 3 decimaler: hver kolonne kan være afrundet 0,0005, så summen af n lagre højst n × 0,0005.
AFRUNDING_MW = 0.0005


def _laes(tekst: str) -> tuple[list[str], list[list[str]]]:
    rk = list(csv.reader(io.StringIO(tekst)))
    return (rk[0], rk[1:]) if rk else ([], [])


def lagre(hoved: list[str]) -> list[str]:
    """Lagernavnene i en timefils overskrift, i filens rækkefølge."""
    return [k[: -len("_level_mwh")] for k in hoved if k.endswith("_level_mwh")]


def sammenlign(a_tekst: str, b_tekst: str) -> dict:
    """Sammenlign to timefiler. Returnerer::

        {"byte_ens": bool,          # filerne er tegn for tegn ens
         "ens_paa_sum": bool,       # ens efter reglen ovenfor (sand også ved byte_ens)
         "lagre": [...],            # lagrene i filen
         "maks_pr_lager_mwh": float,# største forskel i ét lagers niveau (0 ved byte_ens)
         "forskelle": [...]}        # hvorfor ikke, i klartekst (tom når ens_paa_sum)
    """
    if a_tekst == b_tekst:
        return {"byte_ens": True, "ens_paa_sum": True, "lagre": lagre(_laes(a_tekst)[0]), "maks_pr_lager_mwh": 0.0, "forskelle": []}
    (ha, ra), (hb, rb) = _laes(a_tekst), _laes(b_tekst)
    ud = {"byte_ens": False, "ens_paa_sum": False, "lagre": lagre(ha), "maks_pr_lager_mwh": 0.0, "forskelle": []}
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
    lagerkol = {i for i, k in enumerate(ha) if (m := _LAGERKOLONNE.match(k)) and m.group(1) in navne}
    niveau = [ha.index(f"{n}_level_mwh") for n in navne]
    netto = [ha.index(f"{n}_net_mw") for n in navne if f"{n}_net_mw" in ha]
    tol_netto = AFRUNDING_MW * 2 * len(navne) + 1e-9
    maks = 0.0
    for nr, (x, y) in enumerate(zip(ra, rb), start=2):
        if len(x) != len(ha) or len(y) != len(ha):
            fejl.append(f"linje {nr}: forkert antal felter")
            break
        for i, k in enumerate(ha):
            if i not in lagerkol and x[i] != y[i]:
                fejl.append(f"linje {nr}, {k}: {x[i]} mod {y[i]} (ikke en lagerkolonne)")
                break
        if fejl:
            break
        try:
            sa, sb = sum(float(x[i]) for i in niveau), sum(float(y[i]) for i in niveau)
            na, nb = sum(float(x[i]) for i in netto), sum(float(y[i]) for i in netto)
            maks = max(maks, *(abs(float(x[i]) - float(y[i])) for i in niveau))
        except ValueError:
            fejl.append(f"linje {nr}: en lagerkolonne er ikke et tal")
            break
        if abs(sa - sb) > TOL_NIVEAU_MWH:
            fejl.append(f"linje {nr}: samlet lagerindhold {sa!r} mod {sb!r} MWh")
            break
        if len(netto) == len(navne) and abs(na - nb) > tol_netto:
            fejl.append(f"linje {nr}: samlet nettoeffekt fra lagrene {na!r} mod {nb!r} MW")
            break
    ud["maks_pr_lager_mwh"] = maks
    ud["ens_paa_sum"] = not fejl
    return ud
