"""Modellens minimumskrav til et værk (K4-F1) i arbejderen — runde 14.

Et værk fra værksarket var før netop det, modelscriptet skrev, og dermed gyldigt af konstruktion. Med appens egne
faner (``fjv.arklag``) kan brugeren fjerne eller ændre felter, modellen kræver (fx tankens indhold ved start).
Importen kontrollerer derfor det færdige værk med de samme krav, som appen stiller til et nyt værk
(``tjekModelkrav`` i app/rayfin/functions/src/logik.ts; ``tjek_modelkrav`` i community/…/logik/regler.py).

Reglerne er en tredje udgave af de samme krav, fordi arbejderen i Fabric kun har ``fjv``. De fælles vektorer i
``skema/vektorer/tjek_modelkrav.json`` binder alle tre: ``fabric/tests/test_modelkrav.py`` kræver samme udfald og
samme besked for hvert tilfælde. Kontrollen er et MINIMUM: den afviser, hvad modellen med sikkerhed ikke kan
indlæse eller regne på; om tallene er fornuftige, afgør en prøvekørsel.
"""

from __future__ import annotations

import json
import math
import re

BRAENDSEL_UDEN_PRIS = {"electricity", "solar"}
_DATO_START = re.compile(r"^\d{4}-\d{2}-\d{2}")
_TT_TT = re.compile(r"^(\d{2})-(\d{2})$")
_NT = "electricity.tariff_consumption.net_tariff"
_MANGLER = object()


class ModelkravFejl(ValueError):
    """Værket kan ikke bruges af modellen. Beskeden er til brugeren."""


def _tal(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _endelig(x) -> bool:
    return _tal(x) and math.isfinite(x)


def _js(x) -> str:
    """JavaScripts ``String(x)`` for et tal (1.0 -> "1", inf -> "Infinity")."""
    if isinstance(x, float):
        if math.isinf(x):
            return "Infinity" if x > 0 else "-Infinity"
        if math.isnan(x):
            return "NaN"
        if x.is_integer() and abs(x) < 1e21:
            return str(int(x))
    return str(x)


def _ikke_endelig(v):
    """Første ikke-endelige tal i en JSON-værdi (rekursivt), eller None."""
    if _tal(v):
        return None if math.isfinite(v) else v
    if isinstance(v, list):
        for x in v:
            f = _ikke_endelig(x)
            if f is not None:
                return f
    elif isinstance(v, dict):
        # JavaScripts nøgleorden (Object.values): heltalsnøgler stigende først, derefter resten som skrevet —
        # ellers nævner beskeden et andet tal end appens, når et objekt har flere ikke-endelige.
        heltal = sorted((k for k in v if _er_indeks(k)), key=int)
        for k in heltal + [k for k in v if not _er_indeks(k)]:
            f = _ikke_endelig(v[k])
            if f is not None:
                return f
    return None


def _er_indeks(k: str) -> bool:
    return k.isascii() and k.isdigit() and (k == "0" or not k.startswith("0")) and int(k) < 2 ** 32 - 1


def _seg(sti: str, i: int):
    d = sti.split(".")
    return d[i] if i < len(d) else None


def _strengt_lig(a, b) -> bool:
    if _tal(a) and _tal(b):
        return a == b
    return type(a) is type(b) and a == b


def fejl(blade) -> list[str]:
    """Alle brud på modellens minimumskrav for værket ``blade`` (``[{sti, vaerdi_json}]`` eller ``{sti: json}``)."""
    if isinstance(blade, dict):
        blade = [{"sti": s, "vaerdi_json": j} for s, j in blade.items()]
    blade = list(blade)
    v = {b["sti"]: json.loads(b["vaerdi_json"]) for b in blade}
    ud: list[str] = []
    for sti, x in v.items():
        f = _ikke_endelig(x)
        if f is not None:
            ud.append(f"{sti} er ikke et endeligt tal ({_js(f)})")

    def tal(sti: str, mini: float = -math.inf) -> None:
        x = v.get(sti, _MANGLER)
        if not _endelig(x):
            ud.append(f"{sti} mangler eller er ikke et tal")
        elif x < mini:
            ud.append(f"{sti} må ikke være under {_js(mini)}")

    def tekst(sti: str) -> None:
        x = v.get(sti, _MANGLER)
        if not isinstance(x, str) or not x.strip():
            ud.append(f"{sti} mangler eller er ikke en tekst")

    for s in ("meta.case_name", "data.dmi_area", "data.price_zone", "time.resolution", "electricity.spot_area"):
        tekst(s)
    for s in ("time.start", "time.end"):
        x = v.get(s, _MANGLER)
        if not isinstance(x, str) or not _DATO_START.match(x):
            ud.append(f"{s} mangler eller er ikke en dato (ÅÅÅÅ-MM-DD)")
    start, slut = v.get("time.start", _MANGLER), v.get("time.end", _MANGLER)
    if (isinstance(start, str) and isinstance(slut, str) and _DATO_START.match(start) and _DATO_START.match(slut)
            and start[:10] >= slut[:10]):
        ud.append("time.end skal ligge efter time.start")
    tal("heat_load_params.gaf_mw_per_k", 0)
    for s in ("prices.co2_eua.value", "electricity.tariff_consumption_flat", "electricity.tariff_production_flat",
              "electricity.electricity_tax"):
        tal(s)

    enheder = list(dict.fromkeys(_seg(b["sti"], 1) for b in blade if b["sti"].startswith("units.")))
    aktive = [n for n in enheder if v.get(f"units.{n}.enabled", _MANGLER) is not False]
    if not aktive:
        ud.append("værket skal have mindst én aktiv enhed (units.<navn>)")
    for n in enheder:
        u = f"units.{n}"
        tekst(f"{u}.type")
        tekst(f"{u}.fuel")
        tal(f"{u}.p_max_heat", 0)
        tal(f"{u}.p_min_heat", 0)
        tal(f"{u}.alpha")
        pmax, pmin = v.get(f"{u}.p_max_heat"), v.get(f"{u}.p_min_heat")
        if _tal(pmax) and _tal(pmin) and pmin > pmax:
            ud.append(f"{u}.p_min_heat er større end p_max_heat")
        fuel = v.get(f"{u}.fuel")
        if isinstance(fuel, str) and fuel and fuel not in BRAENDSEL_UDEN_PRIS:
            tal(f"{u}.eta_fuel_to_heat")
            eta = v.get(f"{u}.eta_fuel_to_heat")
            if _tal(eta) and eta <= 0:
                ud.append(f"{u}.eta_fuel_to_heat skal være større end 0")
            if v.get(f"{u}.enabled", _MANGLER) is not False:
                tal(f"prices.{fuel}.value")

    lagre = list(dict.fromkeys(_seg(b["sti"], 1) for b in blade if b["sti"].startswith("storage.")))
    if "storage" not in v and not lagre:
        ud.append("storage mangler (et værk uden lager har en tom storage-blok)")
    for n in lagre:
        for f in ("volume_m3", "delta_t_k", "e_initial_mwh", "p_max_charge_mw", "p_max_discharge_mw"):
            tal(f"storage.{n}.{f}", 0)
        tal(f"storage.{n}.self_discharge_per_hour", 0)

    if any(b["sti"].startswith(f"{_NT}.") for b in blade):
        tekst("electricity.tariff_consumption.unit")
        baand = list(dict.fromkeys(_seg(b["sti"], 4) for b in blade if b["sti"].startswith(f"{_NT}.bands.")))
        if not baand:
            ud.append(f"{_NT}.bands mangler")
        for b in baand:
            tal(f"{_NT}.bands.{b}")
        saesoner = list(dict.fromkeys(_seg(b["sti"], 4) for b in blade if b["sti"].startswith(f"{_NT}.seasons.")))
        if not saesoner:
            ud.append(f"{_NT}.seasons mangler")
        maaneder: list = []
        for s in saesoner:
            m = v.get(f"{_NT}.seasons.{s}.months", _MANGLER)
            if not isinstance(m, list) or not all(_tal(x) and float(x).is_integer() and 1 <= x <= 12 for x in m):
                ud.append(f"{_NT}.seasons.{s}.months skal være en liste af måneder 1-12")
            else:
                maaneder.extend(m)
            for dag in ("weekday", "weekend"):
                foer = f"{_NT}.seasons.{s}.{dag}."
                timer = [0] * 24
                for b in blade:
                    if not b["sti"].startswith(foer):
                        continue
                    r = _TT_TT.match(b["sti"][len(foer):])
                    if not r:
                        ud.append(f"{b['sti']}: timeintervallet skal skrives TT-TT")
                        continue
                    t, slut_t = int(r.group(1)), int(r.group(2))
                    while t < slut_t and t < 24:
                        timer[t] += 1
                        t += 1
                    navn = v.get(b["sti"])
                    if not isinstance(navn, str) or navn not in baand:
                        ud.append(f"{b['sti']} peger på et bånd, der ikke findes "
                                  f"({json.dumps(navn, ensure_ascii=False, separators=(',', ':'))})")
                huller = [t for t, n_ in enumerate(timer) if n_ != 1]
                if huller:
                    ud.append(f"{foer[:-1]} dækker ikke hver time præcis én gang (time {', '.join(map(str, huller))})")
        dubletter = [m for i, m in enumerate(maaneder) if next(j for j, y in enumerate(maaneder) if y == m) != i]
        mangler = [m for m in range(1, 13) if not any(float(x) == m for x in maaneder)]
        if saesoner and (dubletter or mangler):
            dub = list(dict.fromkeys(float(x) for x in dubletter))
            ud.append(f"sæsonerne skal dække hver måned præcis én gang (mangler "
                      f"{', '.join(map(str, mangler)) or '-'}, dobbelt {', '.join(_js(x) for x in dub) or '-'})")
        net = v.get("electricity.tariff_consumption.fixed_components.elafgift_net", _MANGLER)
        if net is not _MANGLER and not _strengt_lig(net, v.get("electricity.electricity_tax", _MANGLER)):
            ud.append("fixed_components.elafgift_net skal være lig electricity.electricity_tax")
    return ud


def besked(liste: list[str]) -> str:
    vis = liste[:8]
    rest = f" (og {len(liste) - len(vis)} mere)" if len(liste) > len(vis) else ""
    return f"Værket kan ikke bruges af modellen: {'; '.join(vis)}{rest}."


def tjek(blade) -> None:
    """Rejser ``ModelkravFejl`` med samme besked som appens ``tjekModelkrav``, hvis værket ikke opfylder kravene."""
    liste = fejl(blade)
    if liste:
        raise ModelkravFejl(besked(liste))
