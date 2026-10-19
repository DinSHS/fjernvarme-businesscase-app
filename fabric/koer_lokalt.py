#!/usr/bin/env python3
"""Tørkør en notebook lokalt — samme celler, samme rækkefølge som i Fabric.

    python koer_lokalt.py fjv_selvtest
    python koer_lokalt.py fjv_koer_scenarie vaerk_kode=andeby start=2026-01-05 slut=2026-01-16

Lakehouset spejles af ``_lokal/Files`` (``FJV_FILES``), motorpakken læses direkte
fra ``fjv/`` (``FJV_MOTOR``), og modellen køres med ``_lokal/.venv`` (``FJV_PYTHON``,
som har præcis modelrepoets pins). En Fabric-kørsel koster kapacitet og svarer
kun Completed/Failed; en lokal tørkørsel koster sekunder og viser hele fejlen.

Parametre gives som ``navn=værdi`` og parses som Python-literal, hvis muligt
(``mip_gap=0.0002``, ``med_balancering=True``), ellers som streng — samme
virkning som Fabrics override-celle efter ``parameters``-cellen.
"""

from __future__ import annotations

import ast
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
HER = Path(__file__).resolve().parent
LOKAL = HER / "_lokal"

os.environ.setdefault("FJV_FILES", str(LOKAL / "Files"))
os.environ.setdefault("FJV_MOTOR", str(HER))
# Kort arbejdsrod: modellens output-stem kan være >150 tegn, og Windows' 260-tegns
# stigrænse gav ellers FileNotFoundError i test_robust_reservation (målt). Linux
# i Fabric har ikke grænsen.
if os.name == "nt":
    os.makedirs("C:/fjvt", exist_ok=True)
    os.environ.setdefault("TMPDIR", "C:/fjvt")
    import tempfile
    tempfile.tempdir = os.environ["TMPDIR"]
py = LOKAL / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
if py.exists():
    os.environ.setdefault("FJV_PYTHON", str(py))


def main(argv: list[str]) -> int:
    navn, rest = argv[0], argv[1:]
    mappe = HER / "celler" / navn
    kilder = []
    if (mappe / "params.py").exists():
        kilder.append((mappe / "params.py").read_text(encoding="utf-8"))
    over = []
    for a in rest:
        k, v = a.split("=", 1)
        try:
            ast.literal_eval(v)
            over.append(f"{k} = {v}")
        except Exception:
            over.append(f"{k} = {v!r}")
    kilder.append("\n".join(over))
    kilder.append((HER / "celler" / "_faelles" / "prelude.py").read_text(encoding="utf-8"))
    kilder += [p.read_text(encoding="utf-8") for p in sorted(mappe.iterdir())
               if p.suffix == ".py" and p.name != "params.py"]
    g: dict = {"__name__": "__main__"}
    for k in kilder:
        exec(compile(k, f"<{navn}>", "exec"), g)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
