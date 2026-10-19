"""Testvektorer for tidsserie-analyse.ts (efter tolkning med tidsserie-validering.ts): et uddrag af modelrepoets
rigtige filer (ordret tekst) og pandas' egne tal for dem.

  billund   data/billund_abvaerk_hourly.csv, de første 1500 rækker (UTC-naive "YYYY-MM-DD HH:MM:SS")
  sol       data/solar_andeby_dmi_karup.csv, rækkerne for marts-april 2025 (ISO med Z; sommertidsskiftet)

Månedssummer grupperes på DANSK måned (Europe/Copenhagen), som appens måneder (KONTRAKT §3.9).

Kør (fra app/):
  ../fabric/_lokal/.venv/Scripts/python.exe src/sider/konfiguration/_byg/csv_vektorer.py
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
import pandas as pd  # noqa: E402

HER = Path(__file__).resolve().parent
MODELREPO = HER.parents[4].parent / "fjernvarme-businesscase"
UD = HER.parent / "csv-vektorer.json"


def reference(tekst: str) -> dict:
    df = pd.read_csv(io.StringIO(tekst))
    t = pd.to_datetime(df.iloc[:, 0], utc=True)
    v = df.iloc[:, 1].astype(float)
    s = pd.Series(v.values, index=t)
    dk = s.tz_convert("Europe/Copenhagen")
    mdr = dk.groupby(dk.index.strftime("%Y-%m")).sum()
    return {
        "raekker": int(len(s)),
        "start": t.min().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "slut": t.max().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sum_mwh": float(v.sum()),
        "maks": float(v.max()),
        "min": float(v.min()),
        "maaneder": {k: float(x) for k, x in mdr.items()},
    }


def main() -> None:
    linjer = (MODELREPO / "data" / "billund_abvaerk_hourly.csv").read_text(encoding="utf-8").splitlines()
    billund = "\n".join(linjer[:1501]) + "\n"
    sol_l = (MODELREPO / "data" / "solar_andeby_dmi_karup.csv").read_text(encoding="utf-8").splitlines()
    sol = "\n".join([sol_l[0]] + [x for x in sol_l[1:] if x.startswith(("2025-03", "2025-04"))]) + "\n"
    ud = {
        "kilde": "modelrepo b49aeb0 data/; pandas " + pd.__version__,
        "billund": {"tekst": billund, "ref": reference(billund)},
        "sol": {"tekst": sol, "ref": reference(sol)},
    }
    UD.write_text(json.dumps(ud, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for k in ("billund", "sol"):
        r = ud[k]["ref"]
        print(f"{k}: {r['raekker']} raekker {r['start']}..{r['slut']}, {r['sum_mwh']:.3f} MWh, {len(r['maaneder'])} maaneder")
    print(f"skrevet: {UD.name} ({UD.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
