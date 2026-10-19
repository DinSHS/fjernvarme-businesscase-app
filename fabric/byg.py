#!/usr/bin/env python3
"""Bygger Fabric-notebook-items ud fra ``celler/<navn>/`` (husets mønster).

    python byg.py                 # alle notebooks
    python byg.py fjv_selvtest    # én

Rediger **aldrig** de byggede ``.ipynb`` i hånden — rediger ``celler/`` og byg.
Hver celle parses med ``ast`` her, så en syntaksfejl fanges lokalt og ikke først
når en Fabric-kørsel har brugt kapacitet på at finde den.

Celleorden i den byggede notebook:

1. ``doc.md``                     markdown
2. ``params.py``                  tagget ``parameters`` (jobs-API'et og
                                  ``fab job run -P`` indsætter en override-celle
                                  lige efter netop den)
3. ``celler/_faelles/prelude.py`` henter motorpakken fra lakehouset
4. ``00.py``, ``01.py`` …

Forskellen fra et tilsvarende udrulningsvaerktoej er kernen: dette er en
**Python-notebook** (``jupyter`` / ``python3.12``), ikke ``synapse_pyspark``.
Metadata er bekræftet ved at importere og eksportere et item (se README).
"""

from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")

HER = Path(__file__).resolve().parent
CELLER = HER / "celler"
BYG = HER / "_byg"
sys.path.insert(0, str(HER))
import fabric_miljoe as MILJOE  # noqa: E402  (privat: workspace og lakehouse, K6-F1)

PY_KERNE = "python3.12"
CELLE_META = {"microsoft": {"language": "python", "language_group": "jupyter_python"}}


def _linjer(tekst: str) -> list[str]:
    l = tekst.rstrip("\n").split("\n")
    return [x + "\n" for x in l[:-1]] + [l[-1]]


def _kode(tekst: str, params: bool = False) -> dict:
    ast.parse(tekst)
    meta = json.loads(json.dumps(CELLE_META))
    if params:
        meta["tags"] = ["parameters"]
    return {"cell_type": "code", "execution_count": None, "metadata": meta,
            "outputs": [], "source": _linjer(tekst)}


def notebook_metadata() -> dict:
    return {
        "kernel_info": {"name": "jupyter", "jupyter_kernel_name": PY_KERNE},
        "kernelspec": {"name": "jupyter", "display_name": "Jupyter"},
        "language_info": {"name": "python"},
        "microsoft": {"language": "python", "language_group": "jupyter_python"},
        "dependencies": {"lakehouse": {
            "default_lakehouse": MILJOE.LAKEHOUSE_ID,
            "default_lakehouse_name": MILJOE.LAKEHOUSE_NAVN,
            "default_lakehouse_workspace_id": MILJOE.WORKSPACE_ID,
        }},
    }


def byg_en(navn: str) -> Path:
    mappe = CELLER / navn
    celler = []
    doc = mappe / "doc.md"
    if doc.exists():
        celler.append({"cell_type": "markdown", "metadata": {},
                       "source": _linjer(doc.read_text(encoding="utf-8"))})
    params = mappe / "params.py"
    if params.exists():
        celler.append(_kode(params.read_text(encoding="utf-8"), params=True))
    celler.append(_kode((CELLER / "_faelles" / "prelude.py").read_text(encoding="utf-8")))
    kodefiler = sorted(p for p in mappe.iterdir()
                       if p.suffix == ".py" and p.name != "params.py")
    if not kodefiler:
        raise SystemExit(f"{navn}: ingen kodeceller")
    for f in kodefiler:
        celler.append(_kode(f.read_text(encoding="utf-8")))

    item = BYG / f"{navn}.Notebook"
    item.mkdir(parents=True, exist_ok=True)
    platform = {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/"
                   "gitIntegration/platformProperties/2.0.0/schema.json",
        "metadata": {"type": "Notebook", "displayName": navn},
        "config": {"version": "2.0", "logicalId": "00000000-0000-0000-0000-000000000000"},
    }
    (item / ".platform").write_text(json.dumps(platform, indent=2) + "\n",
                                    encoding="utf-8", newline="\n")
    nb = {"nbformat": 4, "nbformat_minor": 5, "metadata": notebook_metadata(),
          "cells": celler}
    (item / "notebook-content.ipynb").write_text(
        json.dumps(nb, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"  {navn:24} {len(celler)} celler -> {item}")
    return item


def alle() -> list[str]:
    return sorted(p.name for p in CELLER.iterdir()
                  if p.is_dir() and not p.name.startswith("_"))


def main(argv: list[str]) -> int:
    for navn in argv or alle():
        try:
            byg_en(navn)
        except SyntaxError as fejl:
            print(f"SYNTAKSFEJL i {navn}: {fejl}")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
