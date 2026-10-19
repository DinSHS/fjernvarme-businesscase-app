"""Kørselsrapporten ``Files/_run/<notebook>.json`` — husets mønster.

``fab job run`` og jobs-API'et siger kun Completed/Failed. En notebook der ikke
selv skriver, hvad den gjorde, er usynlig udefra; derfor skrives rapporten
**uanset udfald** (også midt i en kørsel, så en dræbt kerne efterlader det
seneste trin) og notebooken rejser til sidst, hvis ``ok`` er falsk.
"""

from __future__ import annotations

import json
import time
import traceback
from pathlib import Path

from . import konstanter as K
from .runtime import nu_utc


class Rapport:
    def __init__(self, notebook: str, files: str | None = None, sti: str | None = None):
        self.sti = Path(sti) if sti else Path(files or K.FILES) / K.REL_RUN / f"{notebook}.json"
        self.t0 = time.time()
        self.data: dict = {"notebook": notebook, "start": nu_utc(), "ok": False,
                           "trin": [], "advarsler": []}

    def __setitem__(self, k, v):
        self.data[k] = v

    def __getitem__(self, k):
        return self.data[k]

    def trin(self, navn: str, vaerdi=None):
        self.data["trin"].append({"navn": navn, "t_s": round(time.time() - self.t0, 1),
                                  "vaerdi": vaerdi})
        print(f"[{time.time() - self.t0:7.1f}s] {navn}: {vaerdi if vaerdi is not None else ''}")
        self.skriv()

    def advar(self, tekst: str):
        self.data["advarsler"].append(tekst)
        print("ADVARSEL:", tekst)

    def fejl(self, fejl: BaseException):
        self.data["ok"] = False
        self.data["undtagelse"] = f"{type(fejl).__name__}: {fejl}"
        self.data["traceback"] = traceback.format_exc()[-6000:]

    def skriv(self):
        self.data["slut"] = nu_utc()
        self.data["sekunder"] = round(time.time() - self.t0, 1)
        try:
            self.sti.parent.mkdir(parents=True, exist_ok=True)
            self.sti.write_text(json.dumps(self.data, ensure_ascii=False, indent=2,
                                           default=str), encoding="utf-8")
        except Exception as fejl:      # rapporten må aldrig vælte kørslen
            print("kunne ikke skrive rapport:", fejl)
