"""Testvektorer for browserens syntetiske varmelast (syntetisk-varmelast.ts).

Kører MODELLENS EGEN kode (fetch_dmi_obs_github + interpolationen i
load_external_data_github + synthesize_heat_load @ b49aeb0) på df-data fra
fv-fabrics lokale kopi, og skriver input (rå DMI-rækker som i filen) og
forventet output. TypeScript-porten skal ramme tallene inden for 1e-9 MW.

Kør (fra app/):
  ../fabric/_lokal/.venv/Scripts/python.exe src/sider/konfiguration/_byg/syntese_vektorer.py

Modelrepo og df-data læses kun; intet skrives uden for denne mappe.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")

HER = Path(__file__).resolve().parent
PRODUKT = HER.parents[4]                      # repoets rod
MODELREPO = PRODUKT.parent / "fjernvarme-businesscase"
DF_DATA = PRODUKT / "fabric" / "_lokal" / "df-data"
UD = HER.parent / "syntese-vektorer.json"

sys.path.insert(0, str(MODELREPO))
import pandas as pd  # noqa: E402
from src.data_loader import HeatLoadParams, synthesize_heat_load  # noqa: E402
from src.data_loader_github import fetch_dmi_obs_github  # noqa: E402

BILLUND = dict(gaf_mw_per_k=0.9761, t_ref=15.0, thermal_inertia_hours=24, nettab_slope_mw_per_k=0.6081, t_net=12.0,
               weekly_dip=0.02, baseline_profile_mw=None)
ANDEBY = dict(gaf_mw_per_k=0.7653, t_ref=15.0, thermal_inertia_hours=24, nettab_slope_mw_per_k=0.4768, t_net=12.0,
              weekly_dip=0.02, baseline_profile_mw=None)


def profil(kode: str) -> list[float]:
    """baseline_profile_mw fra harnessens databasekopi (samme tal som værket i appen)."""
    fx = json.loads((PRODUKT / "app" / "skaermbilleder" / "harness" / "fixtures.json").read_text(encoding="utf-8"))
    vid = next(v["id"] for v in fx["Vaerk"] if v["kode"] == kode)
    p = next(p for p in fx["VaerkParameter"] if p["vaerk_id"] == vid and p["sti"] == "heat_load_params.baseline_profile_mw")
    return json.loads(p["vaerdi_json"])


def ren(x: float) -> float | None:
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else float(x)


def tilfaelde(navn: str, params: dict, omraade: str, start: str, slut: str, sha: str, fjern: tuple[int, ...] = (), nan: tuple[int, ...] = ()) -> dict:
    idx = pd.date_range(start, slut, freq="h")
    t_raw = fetch_dmi_obs_github("temp_mean_past1h", idx, area=omraade, repo_root=DF_DATA / sha)
    # Kunstige huller (rækker der mangler helt, og tomme værdier), så interpolationen afprøves midt i serien.
    if nan:
        t_raw = t_raw.copy()
        t_raw.iloc[list(nan)] = float("nan")
    if fjern:
        t_raw = t_raw.drop(t_raw.index[list(fjern)])
    # Samme justering som load_external_data_github (data_loader_github.py:656-659).
    t_ambient = (t_raw.reindex(idx.union(t_raw.index)).sort_index()
                 .interpolate(method="time").reindex(idx).ffill().bfill())
    hp = HeatLoadParams(**params)
    df = synthesize_heat_load(t_ambient, hp)
    return {
        "navn": navn,
        "omraade": omraade,
        "start": idx[0].strftime("%Y-%m-%dT%H:%M:%SZ"),
        "antal": len(idx),
        "params": {k: (list(v) if k == "baseline_profile_mw" else v) for k, v in params.items()},
        "dmi": {"tider": [t.strftime("%Y-%m-%d %H:%M:%S") for t in t_raw.index], "vaerdier": [ren(v) for v in t_raw.values]},
        "rå_huller": int(t_raw.isna().sum()),
        "t_ambient": [float(v) for v in t_ambient.values],
        "gaf": [float(v) for v in df["gaf"].values],
        "guf": [float(v) for v in df["guf"].values],
        "nettab": [float(v) for v in df["nettab"].values],
        "total": [float(v) for v in df["total"].values],
    }


def main() -> None:
    shas = [p.name for p in DF_DATA.iterdir() if p.is_dir()]
    if len(shas) != 1:
        raise SystemExit(f"Forventede én df-data-kopi i {DF_DATA}, fandt {shas}")
    sha = shas[0]
    b = {**BILLUND, "baseline_profile_mw": profil("billund_idag")}
    a = {**ANDEBY, "baseline_profile_mw": profil("andeby")}
    ud = {
        "kilde": "synthesize_heat_load @ modelrepo b49aeb0; df-data " + sha,
        "data_commit": sha,
        "tilfaelde": [
            tilfaelde("billund_januar_karup", b, "karup", "2026-01-01 00:00", "2026-01-14 23:00", sha),
            tilfaelde("andeby_juli_karup", a, "karup", "2025-07-01 00:00", "2025-07-10 23:00", sha),
            tilfaelde("billund_sommertid_fyn", b, "fyn", "2026-03-25 00:00", "2026-04-02 23:00", sha),
            tilfaelde("billund_huller_karup", b, "karup", "2026-02-01 00:00", "2026-02-07 23:00", sha,
                      fjern=(50, 51, 52, 53, 54, 55, 167), nan=(0, 1, 100)),
        ],
    }
    # Rå DMI-rækker for et helt år (som hentDmiTemperatur vil give dem) - til helårstesten af målt mod syntetisk
    # på Billunds egen målte fil (fv-data målte forhold 0,99-1,03 og døgnkorrelation 0,97-0,98).
    aar = pd.date_range("2025-06-01 00:00", "2026-06-30 23:00", freq="h")
    ud["dmi_aar"] = {}
    for omr in ("karup", "fyn"):
        t_raw = fetch_dmi_obs_github("temp_mean_past1h", aar, area=omr, repo_root=DF_DATA / sha)
        ud["dmi_aar"][omr] = {"tider": [t.strftime("%Y-%m-%d %H:%M:%S") for t in t_raw.index], "vaerdier": [ren(v) for v in t_raw.values]}
    UD.write_text(json.dumps(ud, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for t in ud["tilfaelde"]:
        print(f"{t['navn']}: {t['antal']} timer, {t['rå_huller']} rå huller, total {min(t['total']):.3f}-{max(t['total']):.3f} MW")
    print(f"skrevet: {UD.name} ({UD.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
