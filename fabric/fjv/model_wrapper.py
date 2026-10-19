"""Kør ``run_case.py`` uændret — og gem det, modellen har i hukommelsen, men ikke skriver.

Køres af modellens EGET Python-miljø (venv med linopy/xarray), ikke af
notebookens kerne:

    <venv-python> model_wrapper.py <kodemappe> <run_case-argumenter …>

Hvorfor en wrapper (KONTRAKT v2 §3.9, K1-F5/F7/F13):

* ``_hourly.csv`` dropper bevidst første interval (N−1 rækker), og ``_dispatch.nc``
  har kun resultatvariable (produktion, lager, UC) — ikke varmelast, spot og
  udetemperatur. Lokale måneder og periodetotaler skal regnes på **alle N
  intervaller**, så inputserierne inkl. t=0 skal gemmes.
* Manifestets objektiv er afrundet til hele DKK; differenser skal bruge det
  præcise tal fra ``result.attrs``.

Mekanikken: ``src.manifest.write_manifest`` er det sidste, ``run_case.main()``
kalder, med ``result``, ``data`` og ``cfg`` som argumenter. Wrapperen pakker den
funktion ind *før* ``run_case`` importerer navnet, kalder originalen uændret og
skriver bagefter to ekstra filer:

    <stem>_fjv_fuld.csv   alle N intervaller: tid (UTC, Z), inputserier, resultatserier
    <stem>_fjv.json       præcist objektiv, status, opløsning, Δt, enheders p_max,
                          effektive solverindstillinger og pakkeversioner

Intet i modellens beregning ændres: indpakningen ser kun på argumenterne efter
at originalen har kørt. Fejler den ekstra skrivning, skrives det på stderr, og
kørslen fortsætter — notebooken opdager den manglende fil og melder fejl selv.
"""

from __future__ import annotations

import csv
import json
import math
import os
import runpy
import sys
import traceback
from pathlib import Path

WRAPPER_VERSION = "1"


def _f(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def _dump(result, data, cfg, stem, out_dir):
    import numpy as np
    import pandas as pd

    tid = pd.to_datetime(result["time"].values if "time" in result.coords
                         else data["time"].values)
    n = len(tid)
    kolonner: dict[str, list] = {}

    for navn, da in data.data_vars.items():
        if da.dims == ("time",) and len(da) == n and np.issubdtype(da.dtype, np.number):
            kolonner[f"in.{navn}"] = da.values.tolist()
    for navn, da in result.data_vars.items():
        if "time" not in da.dims or not np.issubdtype(da.dtype, np.number):
            continue
        andre = [d for d in da.dims if d != "time"]
        if not andre:
            kolonner[f"res.{navn}"] = da.values.tolist()
        elif len(andre) == 1:
            dim = andre[0]
            for lab in da[dim].values:
                kolonner[f"res.{navn}.{lab}"] = da.sel({dim: lab}).values.tolist()

    afledte, kontrol, reserver = _afledte_serier(result, data, cfg)
    for navn, vaerdier in afledte.items():
        kolonner[navn] = vaerdier

    sti = Path(out_dir) / f"{stem}_fjv_fuld.csv"
    with open(sti, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        navne = list(kolonner)
        w.writerow(["tid_utc"] + navne)
        for i in range(n):
            w.writerow([tid[i].strftime("%Y-%m-%dT%H:%M:%SZ")]
                       + [("" if _f(kolonner[c][i]) is None else repr(float(kolonner[c][i])))
                          for c in navne])

    dt_h = (tid[1] - tid[0]).total_seconds() / 3600.0 if n > 1 else None
    enheder = {}
    for navn, u in getattr(cfg, "units", {}).items():
        enheder[navn] = {"enabled": bool(getattr(u, "enabled", True)),
                         "p_max_heat": _f(getattr(u, "p_max_heat", None)),
                         "type": str(getattr(u, "type", ""))}
    lagre = {navn: {"enabled": bool(getattr(s, "enabled", True)),
                    "e_max_mwh": _f(getattr(s, "e_max_mwh", None))}
             for navn, s in getattr(cfg, "storage", {}).items()}
    solver = {}
    for k in ("mip_rel_gap", "mip_abs_gap", "time_limit", "presolve", "parallel"):
        if hasattr(getattr(cfg, "solver", None), k):
            v = getattr(cfg.solver, k)
            solver[k] = v if isinstance(v, (int, float, str, bool)) or v is None else str(v)
    pakker = {}
    try:
        import importlib.metadata as md
        for p in ("linopy", "highspy", "xarray", "pandas", "numpy", "scipy",
                  "netCDF4", "PyYAML"):
            try:
                pakker[p] = md.version(p)
            except Exception:
                pakker[p] = None
    except Exception:
        pass
    info = {
        "wrapper_version": WRAPPER_VERSION,
        "stem": stem,
        "objektiv_dkk": _f(result.attrs.get("objective_value")),
        "status": str(result.attrs.get("status")),
        "er_milp": bool(int(result.attrs.get("is_milp", 0))),
        "antal_interval_model": n,
        "dt_timer": dt_h,
        "oploesning": str(getattr(getattr(cfg, "time", None), "resolution", "")),
        "start_utc": tid[0].strftime("%Y-%m-%dT%H:%M:%SZ") if n else None,
        "slut_utc": tid[-1].strftime("%Y-%m-%dT%H:%M:%SZ") if n else None,
        "enheder": enheder,
        "lagre": lagre,
        "solver": solver,
        "python": sys.version.split()[0],
        "pakker": pakker,
        "balancing_method": str(getattr(cfg, "balancing_method", "") or ""),
        "kontrol": kontrol,
        "reserver": reserver,
        "kolonner": list(kolonner),
    }
    (Path(out_dir) / f"{stem}_fjv.json").write_text(
        json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")


def _afledte_serier(result, data, cfg):
    """El- og balanceringsserier pr. interval (alle N), udledt PRÆCIST som modellen gør.

    Konvention: kr.-serierne er objektivets led pr. interval (Σ over intervaller,
    som ``build_model`` og ``summarize_reserves`` summerer — uden Δt). MW-serierne
    er effekter; MWh fås i resultatlaget som Σ MW·Δt. Ved 1 h er de to ens.

    * El-forbrugende enheder (``fuel == "electricity"``):
      ``el_mw = heat_prod / COP(t)`` med COP fra ``cop_curve.evaluate(t_ambient)``
      ellers ``-alpha`` (samme som ``model.compute_marginal_cost``). Omkostningen
      deles i spot, forbrugstarif (``resolve_consumption_tariff``, uden afgift) og
      elafgift. Kontrol: Σ dele + var_om·Σ heat_prod skal være Σ heat_prod·mc.
    * Kraftvarme (``alpha > 0``): ``el_prod_mw = alpha·heat_prod``, salg til spot og
      produktionstarif — de to led, ``compute_marginal_cost`` trækker fra.
    * Balancering pr. marked og enhed: samme formler som
      ``balancing._summarize_one_market`` (kapacitet = r·cap-pris; activation_value:
      brutto = av·r, netto = av_payment·r, forbrugsmodregning = brutto − netto,
      aktiveret = clear·r; legacy: netto = α·p_act·r, aktiveret = α·r, intet brutto).
    """
    import numpy as np

    from src.balancing import MARKETS, summarize_reserves
    from src.model import compute_marginal_cost
    from src.tariff import resolve_consumption_tariff

    ud: dict[str, list] = {}
    kontrol: dict = {"el": {}, "balancering": {}}

    def serie(navn, da):
        v = np.asarray(da.values if hasattr(da, "values") else da, dtype=float)
        if v.ndim == 0:
            v = np.full(len(result["time"]), float(v))
        ud[navn] = v.tolist()
        return v

    hp_alle = result["heat_prod"]
    spot = data["spot_price"]
    tarif = resolve_consumption_tariff(cfg, data)
    afgift = float(cfg.electricity.electricity_tax)
    for u in [str(x) for x in hp_alle.unit.values]:
        enhed = cfg.units[u]
        hp = hp_alle.sel(unit=u)
        if enhed.fuel == "electricity":
            if enhed.cop_curve is not None:
                neg = 1.0 / enhed.cop_curve.evaluate(data["t_ambient"])
            else:
                neg = -enhed.alpha
            el = serie(f"afl.el_mw.{u}", hp * neg)
            s = serie(f"afl.el_spot_dkk.{u}", el * spot.values)
            t = serie(f"afl.el_tarif_dkk.{u}", el * tarif.values)
            a = serie(f"afl.el_afgift_dkk.{u}", el * afgift)
            serie(f"afl.el_omk_dkk.{u}", s + t + a)
            mc = compute_marginal_cost(enhed, cfg, data)
            objektivled = float((hp * mc).sum())
            dele = float(s.sum() + t.sum() + a.sum() + enhed.var_om * float(hp.sum()))
            kontrol["el"][u] = {"objektivled": objektivled, "dele": dele,
                                "afvigelse": abs(objektivled - dele)}
        elif getattr(enhed, "alpha", 0) and enhed.alpha > 0:
            elp = serie(f"afl.el_prod_mw.{u}", hp * enhed.alpha)
            serie(f"afl.el_salg_dkk.{u}", elp * spot.values)
            serie(f"afl.el_prodtarif_dkk.{u}",
                  elp * float(cfg.electricity.tariff_production_flat))

    for m in MARKETS:
        mk = m.label.lower()
        praefiks = f"{m.var_prefix}_"
        cap = data.get(m.cap_price_key)
        p_act = data.get(m.act_price_key)
        alpha = data.get(m.alpha_key)
        av = data.get(m.act_value_key) if m.act_value_key else None
        av_pay = data.get(m.act_payment_key) if m.act_payment_key else None
        clear = data.get(m.clear_fraction_key) if m.clear_fraction_key else None
        for var in [str(v) for v in result.data_vars if str(v).startswith(praefiks)]:
            u = var[len(praefiks):]
            r = serie(f"afl.bal_r_mw.{mk}.{u}", result[var])
            if cap is not None:
                serie(f"afl.bal_kapacitet_dkk.{mk}.{u}", r * cap.values)
            if av is not None:
                brutto = serie(f"afl.bal_akt_brutto_dkk.{mk}.{u}", av.values * r)
                if av_pay is not None:
                    netto = serie(f"afl.bal_akt_netto_dkk.{mk}.{u}", av_pay.values * r)
                    serie(f"afl.bal_modregning_dkk.{mk}.{u}", brutto - netto)
                if clear is not None:
                    serie(f"afl.bal_aktiveret_mw.{mk}.{u}", clear.values * r)
            elif alpha is not None and p_act is not None and spot is not None:
                serie(f"afl.bal_aktiveret_mw.{mk}.{u}", alpha.values * r)
                serie(f"afl.bal_akt_netto_dkk.{mk}.{u}", alpha.values * p_act.values * r)

    reserver = None
    try:
        summ = summarize_reserves(result, data)
        if summ:
            reserver = {mk: {u: {k: (float(v) if isinstance(v, (int, float)) else v)
                                 for k, v in st.items()} for u, st in units.items()}
                        for mk, units in summ.items()}
            # Kontrol: vores serier summerer til modellens eget sammendrag.
            for mk, units in summ.items():
                for u, st in units.items():
                    for felt, serienavn in (("capacity_revenue_dkk", "bal_kapacitet_dkk"),
                                            ("activation_gross_dkk", "bal_akt_brutto_dkk"),
                                            ("activation_payment_dkk", "bal_akt_netto_dkk")):
                        k = f"afl.{serienavn}.{mk.lower()}.{u}"
                        if felt in st and k in ud:
                            kontrol["balancering"][f"{mk.lower()}.{u}.{felt}"] = abs(
                                float(st[felt]) - float(np.sum(ud[k])))
    except Exception as fejl:
        kontrol["balancering_fejl"] = f"{type(fejl).__name__}: {fejl}"
    return ud, kontrol, reserver


def main(argv: list[str]) -> None:
    kode = Path(argv[0]).resolve()
    os.chdir(kode)                       # relative profilstier (data/…) opløses her
    sys.path.insert(0, str(kode))
    sys.argv = ["run_case.py"] + argv[1:]

    import src.manifest as manifest      # noqa: E402  (kræver kode på sys.path)
    original = manifest.write_manifest

    def write_manifest(result, data, cfg, kpi, args, stem, out_dir):
        ud = original(result, data, cfg, kpi, args, stem, out_dir)
        try:
            _dump(result, data, cfg, stem, out_dir)
            print(f"[fjv] fuld tidsserie gemt: {stem}_fjv_fuld.csv", flush=True)
        except Exception:
            print("[fjv] FEJL ved ekstra udtræk:\n" + traceback.format_exc(),
                  file=sys.stderr, flush=True)
        return ud

    manifest.write_manifest = write_manifest
    runpy.run_path(str(kode / "run_case.py"), run_name="__main__")


if __name__ == "__main__":
    main(sys.argv[1:])
