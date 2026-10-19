"""Arbejderprotokollen, serversiden (som ``app/rayfin/functions/src/motor.ts``, KONTRAKT §6c).

* ``start_arbejder()`` — er der kø, er solver-låsen fri, og kører der ikke allerede en arbejder-proces, som
  SERVEREN har startet, så startes ``python -m fjernvarme_app arbejder`` som en selvstændig proces. Den tager
  låsen, tømmer køen FIFO og stopper. En ekstra arbejder er ufarlig: den får ikke låsen og afslutter straks.
* ``afstem()`` — tag låsen (ingen arbejder lever, mens vi har den), markér ``koerer``/``indlaeser`` uden
  hjerteslag i ``DOED_EFTER_MIN`` minutter som ``fejl`` (betinget på status og arbejder_id), frigiv, start en
  arbejder hvis der er kø.
* Motor-rækken: ``sidste_jobstart``/``sidste_job_id`` (``lokal:<pid>``) til visning, som i Fabric.

Værksark-importen kører i sin egen proces (``arbejder --import``) og bruger ikke solver-låsen (§6d).
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from datetime import timedelta
from pathlib import Path

from sqlalchemy import and_, func, select

from .database import Database
from .laas import NAVN as LAAS_NAVN, FilLaas, er_fri
from .typer import nu

class Motor:
    def __init__(self, db: Database, datamappe: Path, db_url: str, *, model_python: str | None = None,
                 start_processer: bool = True):
        self.db, self.datamappe, self.db_url = db, Path(datamappe), db_url
        self.model_python = model_python
        self.start_processer = start_processer
        self._mutex = threading.Lock()
        self._arbejder: subprocess.Popen | None = None
        self._importer: subprocess.Popen | None = None

    @property
    def laas_sti(self) -> Path:
        return self.datamappe / LAAS_NAVN

    def _kommando(self, *ekstra: str) -> list[str]:
        return [sys.executable, "-m", "fjernvarme_app", "--data", str(self.datamappe), "--db", self.db_url,
                "arbejder", *ekstra]

    def _miljoe(self) -> dict:
        env = dict(os.environ)
        rod = str(Path(__file__).resolve().parent.parent)
        env["PYTHONPATH"] = rod + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
        env["PYTHONUTF8"] = "1"
        if self.model_python:
            env["FJV_PYTHON"] = self.model_python
        return env

    def _start(self, *ekstra: str) -> subprocess.Popen:
        logmappe = self.datamappe / "logs"
        logmappe.mkdir(parents=True, exist_ok=True)
        navn = "import" if ekstra else "arbejder"
        log = open(logmappe / f"{navn}-{time.strftime('%Y%m%d-%H%M%S')}-{os.getpid()}.log", "ab")
        flag = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
        try:
            return subprocess.Popen(self._kommando(*ekstra), stdout=log, stderr=subprocess.STDOUT,
                                    stdin=subprocess.DEVNULL, env=self._miljoe(), creationflags=flag)
        finally:
            log.close()

    def koe_antal(self) -> int:
        k = self.db.t("Koersel")
        with self.db.laes() as cn:
            return cn.execute(select(func.count()).select_from(k).where(and_(
                k.c.status == "koe", k.c.annuller_anmodet.is_(None)))).scalar()

    def _noter_jobstart(self, job_id: str) -> None:
        from . import lokal_lager as LL
        m = self.db.t("Motor")
        with self.db.skriv() as cn:
            if cn.execute(select(m.c.id).where(m.c.id == LL.motor_id())).first() is None:
                cn.execute(m.insert().values(id=LL.motor_id(), aendret=nu()))
            cn.execute(m.update().where(m.c.id == LL.motor_id()).values(
                sidste_jobstart=nu(), sidste_job_id=job_id, aendret=nu()))

    def start_arbejder(self) -> dict:
        """Som ``startJobHvisFri``: ``{startet, fabric_job_id?, grund}``."""
        if not self.start_processer:
            return {"startet": False, "grund": "Arbejderen startes ikke automatisk (--uden-arbejder); kørslen venter i kø."}
        if self.koe_antal() == 0:
            return {"startet": False, "grund": "Køen er tom."}
        with self._mutex:
            if self._arbejder is not None and self._arbejder.poll() is None:
                return {"startet": False, "grund": "En arbejder er i gang; kørslen venter i kø."}
            if not er_fri(self.laas_sti):
                return {"startet": False, "grund": "En arbejder er i gang; kørslen venter i kø."}
            self._arbejder = self._start()
            job = f"lokal:{self._arbejder.pid}"
        self._noter_jobstart(job)
        return {"startet": True, "fabric_job_id": job, "grund": "Beregningsjob startet."}

    def start_import(self, import_id: str) -> dict:
        if not self.start_processer:
            return {"ok": False, "fejl": "importen startes ikke automatisk (--uden-arbejder)"}
        with self._mutex:
            if self._importer is not None and self._importer.poll() is None:
                # Den kørende import tømmer køen (K5-F4), også den nye.
                return {"ok": True, "jobId": f"lokal:{self._importer.pid}"}
            self._importer = self._start("--import", import_id)
            return {"ok": True, "jobId": f"lokal:{self._importer.pid}"}

    def marker_doede(self) -> list[dict] | None:
        """``None`` hvis en arbejder holder låsen; ellers de kørsler, der blev sat ``fejl``."""
        from .logik import tjenester as T
        laas = FilLaas(self.laas_sti)
        if not laas.tag():
            return None
        try:
            k = self.db.t("Koersel")
            graense = nu() - timedelta(minutes=T.DOED_EFTER_MIN)
            sidst = func.coalesce(k.c.hjerteslag, k.c.startet, k.c.bestilt)
            ud = []
            with self.db.skriv() as cn:
                kand = cn.execute(select(k.c.id, k.c.status, k.c.arbejder_id, k.c.annuller_anmodet).where(and_(
                    k.c.status.in_(("startet", "koerer", "indlaeser")), sidst < graense))).fetchall()
                for r in kand:
                    besked = T.DOEDE_TEKSTER.get(r.status, T.DOEDE_TEKSTER["koerer"])
                    if r.annuller_anmodet is not None:
                        besked += T.DOED_ANNULLERET_TILLAEG
                    w = [k.c.id == r.id, k.c.status == r.status]
                    w.append(k.c.arbejder_id.is_(None) if r.arbejder_id is None else k.c.arbejder_id == r.arbejder_id)
                    if cn.execute(k.update().where(and_(*w)).values(
                            status="fejl", afsluttet=nu(), fase="Fejl", fejlbesked=besked)).rowcount == 1:
                        ud.append({"id": r.id, "status": r.status})
            return ud
        finally:
            laas.frigiv()

    def afstem(self) -> dict:
        from .logik import tjenester as T
        return T.afstem(self.marker_doede, self.start_arbejder)
