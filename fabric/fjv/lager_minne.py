"""Lager-grænsefladen i hukommelsen - den kørbare specifikation (brief 21).

Ingen database, ingen tråde ud over kalderens. Hver regel fra ``fjv/lager.py`` er skrevet
ud her i ren Python, så en ny implementering (community-udgavens SQLAlchemy-lager) kan
læses op imod den og køres gennem de samme tests (``tests/test_lager.py``). Bruges også til
at køre ``arbejder.arbejd`` og ``vaerksark.koer_importer`` uden Fabric.

``MinneDb`` er "databasen": almindelige dicts, delt af alle lagre bygget på den. Tiden er
``MinneDb.nu()`` (UTC), som tests kan stille.
"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime, timedelta, timezone

from . import db as DB
from .koersel import Afbrudt

AKTIVE = ("koerer", "indlaeser")


class MinneDb:
    def __init__(self):
        self.koersler: dict[str, dict] = {}       # id -> Koersel-række
        self.inputs: dict[str, list] = {}         # koersel_id -> KoerselInput-rækker
        self.resultater: dict[str, dict] = {}     # koersel_id -> {noegletal, maaneder, timer}
        self.tidsserier: dict[str, dict] = {}     # id -> Tidsserie-række
        self.importer: dict[str, dict] = {}       # id -> Vaerksarkimport-række
        self.vaerker: dict[str, dict] = {}        # id -> Vaerk (+ "parametre", "log")
        self.motor: dict = {}
        self.laas_ejer = None
        self._mutex = threading.Lock()            # ét "transaktions"-niveau for hele db'en
        self.tid: datetime | None = None          # None = rigtig tid

    def nu(self) -> datetime:
        return self.tid or datetime.now(timezone.utc)

    def bestil(self, koersel_id: str | None = None, raekker: list | None = None,
               input_hash: str = "", **felter) -> str:
        """Læg en kørsel i køen (det appens ``startBestilling`` gør) - til tests og demo."""
        kid = (koersel_id or str(uuid.uuid4())).lower()
        self.koersler[kid] = {"id": kid, "status": "koe", "modtaget": self.nu(), "forsoeg": 0,
                              "arbejder_id": None, "annuller_anmodet": None, "hjerteslag": None,
                              "startet": None, "input_hash": input_hash, **felter}
        self.inputs[kid] = list(raekker or [])
        return kid


class MinneLaas:
    """``lager.Laas``: én ejer pr. ``MinneDb``. ``tabt`` sættes kun af ``mist()`` (tests)."""

    def __init__(self, db: MinneDb):
        self.db = db
        self.tabt = threading.Event()
        self._ved_tab: list = []

    def tag(self) -> bool:
        with self.db._mutex:
            if self.db.laas_ejer is not None:
                return False
            self.db.laas_ejer = self
            return True

    def holdt(self) -> bool:
        return self.db.laas_ejer is self and not self.tabt.is_set()

    def frigiv(self) -> None:
        self._ved_tab.clear()
        with self.db._mutex:
            if self.db.laas_ejer is self:
                self.db.laas_ejer = None

    def start_vagt(self, interval_s: float | None = None) -> None:
        pass                                      # intet at overvåge i hukommelsen

    def ved_tab(self, funktion) -> None:
        self._ved_tab.append(funktion)
        if self.tabt.is_set():
            funktion()

    def afmeld(self, funktion) -> None:
        if funktion in self._ved_tab:
            self._ved_tab.remove(funktion)

    def mist(self) -> None:
        """Simulér en død låse-forbindelse: låsen er fri, og ejeren får besked."""
        with self.db._mutex:
            if self.db.laas_ejer is self:
                self.db.laas_ejer = None
        if not self.tabt.is_set():
            self.tabt.set()
            for f in list(self._ved_tab):
                f()


def _felter(db: MinneDb, felter: dict) -> dict:
    ud = {}
    for k, v in felter.items():
        if k not in DB.KOERSEL_FELTER:
            raise ValueError(f"ukendt Koersels-felt {k!r}")
        ud[k] = db.nu() if k in DB._TID_FELTER else DB._tekst(k, v)
    return ud


class MinneKoerselLager:
    """``lager.KoerselLager`` - samme regler som ``db.SqlLager``."""

    def __init__(self, db: MinneDb, koersel_id: str, arbejder_id: str, laas: MinneLaas | None = None):
        self.db, self.id, self.mig, self.laas = db, koersel_id, arbejder_id, laas
        self._annulleret = self._tabt = False
        self.faerdig_i_publicering = True

    def log(self) -> list:
        return []

    def _raekke(self) -> dict | None:
        return self.db.koersler.get(self.id)

    def skift(self, fra: str, til: str, **felter) -> bool:
        f = _felter(self.db, felter)
        with self.db._mutex:
            r = self._raekke()
            if (r is None or r["status"] != fra or r.get("arbejder_id") != self.mig
                    or (til not in ("fejl", "annulleret") and r.get("annuller_anmodet") is not None)):
                return False
            r.update(f, status=til)
            return True

    def saet(self, **felter) -> None:
        if not felter:
            return
        f = _felter(self.db, felter)
        with self.db._mutex:
            r = self._raekke()
            if r is not None and r.get("arbejder_id") == self.mig and r["status"] in AKTIVE:
                r.update(f)

    def _vurder(self) -> None:
        r = self._raekke()
        if r is None:
            self._tabt = True
            return
        if r.get("annuller_anmodet") is not None or r["status"] == "annulleret":
            self._annulleret = True
        if r["status"] not in AKTIVE or (r.get("arbejder_id") or "") != self.mig:
            self._tabt = True

    def hjerteslag(self) -> None:
        with self.db._mutex:
            r = self._raekke()
            if r is not None and r.get("arbejder_id") == self.mig and r["status"] in AKTIVE:
                r["hjerteslag"] = self.db.nu()
            self._vurder()
        if self.laas is not None and not self.laas.holdt():
            self._tabt = True

    def tidsserie_sti(self, tidsserie_id: str) -> str | None:
        r = self.db.tidsserier.get(tidsserie_id)
        return r.get("sti") if r else None

    def er_annulleret(self) -> bool:
        with self.db._mutex:
            self._vurder()
        if self.laas is not None and not self.laas.holdt():
            self._tabt = True
        return self._annulleret or self._tabt

    @property
    def annulleret(self) -> bool:
        return self._annulleret

    @property
    def tabt(self) -> bool:
        return self._tabt or (self.laas is not None and self.laas.tabt.is_set())

    @property
    def stop(self) -> bool:
        return self._annulleret or self.tabt

    def annuller_selv(self) -> bool:
        return any(self.skift(fra, "annulleret", afsluttet="nu", fase="Annulleret efter anmodning")
                   for fra in AKTIVE)

    def publicer(self, noegletal, maaneder, timer, slutfelter: dict | None = None) -> dict:
        f = _felter(self.db, dict(slutfelter or {}))
        with self.db._mutex:                      # "transaktionen": alt eller intet
            r = self._raekke()
            if (r is None or r["status"] != "indlaeser" or r.get("arbejder_id") != self.mig
                    or r.get("annuller_anmodet") is not None):
                raise Afbrudt(f"kørslen er ikke længere vores at publicere: {r and r['status']}")
            for navn, rk, noegle in (("noegletal", noegletal, ("gruppe", "objekt", "marked", "noegle")),
                                     ("maaneder", maaneder, ("maaned", "objekt", "noegle")),
                                     ("timer", timer, ("tid",))):
                if len({tuple(x.get(n) for n in noegle) for x in rk}) != len(rk):
                    raise RuntimeError(f"{navn}: dubletter i den naturlige nøgle")
            self.db.resultater[self.id] = {"noegletal": list(noegletal), "maaneder": list(maaneder),
                                           "timer": list(timer)}
            r.update(f, status="faerdig", afsluttet=self.db.nu(), fase=f.get("fase", "Færdig"))
            return {"KoerselNoegletals": len(noegletal), "KoerselMaaneds": len(maaneder),
                    "KoerselTimes": len(timer)}


class MinneKoe:
    """``lager.KoeLager`` - samme regler som ``db.SqlKoe``."""

    def __init__(self, db: MinneDb):
        self.db = db
        self._grund: list[str] = []

    def laas(self) -> MinneLaas:
        return MinneLaas(self.db)

    def _friske(self, mig: str) -> list[dict]:
        graense = self.db.nu() - timedelta(seconds=DB.OVERTAGELSE_S)
        return [r for r in self.db.koersler.values()
                if r["status"] in AKTIVE and (r.get("arbejder_id") or "") != mig
                and (r.get("hjerteslag") or r.get("startet") or graense) >= graense]

    def vent_overtagelse(self, mig: str, laas, rap=None) -> bool:
        # Hukommelsen har ingen anden proces at vente på: en frisk fremmed = giv op nu.
        return laas.holdt() and not self._friske(mig)

    def ryd_doede(self, mig: str, laas) -> list:
        if not laas.holdt():
            return []
        graense = self.db.nu() - timedelta(seconds=DB.OVERTAGELSE_S)
        ud = []
        with self.db._mutex:
            for r in self.db.koersler.values():
                if (r["status"] in AKTIVE and (r.get("arbejder_id") or "") != mig
                        and (r.get("hjerteslag") or r.get("startet") or graense) < graense):
                    r.update(status="fejl", afsluttet=self.db.nu(), fase="Fejl",
                             fejlbesked="Arbejderen stoppede uden at afslutte kørslen. Bestil kørslen igen.")
                    ud.append(r["id"])
        return ud

    def _overtag(self, r: dict, mig: str) -> None:
        r.update(status="koerer", arbejder_id=mig, hjerteslag=self.db.nu(), startet=self.db.nu(),
                 forsoeg=(r.get("forsoeg") or 0) + 1)

    def overtag_bestemt(self, koersel_id: str, mig: str, laas) -> bool:
        if not laas.holdt():
            raise RuntimeError("overtagelse uden fjv_solver-låsen er ikke tilladt (§6c)")
        with self.db._mutex:
            r = self.db.koersler.get(koersel_id)
            if r is None or r["status"] not in ("koe", "startet") or r.get("annuller_anmodet") is not None:
                return False
            self._overtag(r, mig)
            return True

    def overtag_naeste(self, mig: str, laas) -> str | None:
        if not laas.holdt():
            self._grund.append("fjv_solver-låsen er ikke længere vores")
            return None
        with self.db._mutex:
            kand = sorted((r for r in self.db.koersler.values()
                           if r["status"] in ("koe", "startet") and r.get("annuller_anmodet") is None),
                          key=lambda r: (r["modtaget"], r["id"]))
            if not kand:
                self._grund.append("køen er tom")
                return None
            self._overtag(kand[0], mig)
            return kand[0]["id"]

    def grund(self) -> str:
        return self._grund[-1] if self._grund else ""

    def laes_input(self, koersel_id: str):
        r = self.db.koersler.get(koersel_id)
        if r is None:
            raise RuntimeError(f"kørslen {koersel_id} findes ikke")
        return [dict(x) for x in self.db.inputs.get(koersel_id, [])], {
            k: r.get(k) for k in ("id", "input_hash", "status", "vaerk_revision", "vaerk_id")}

    def koersel_lager(self, koersel_id: str, mig: str, laas) -> MinneKoerselLager:
        return MinneKoerselLager(self.db, koersel_id, mig, laas)

    def skriv_motor_pins(self, model_commit: str, data_commit: str) -> bool:
        for sha in (model_commit, data_commit):
            if len(sha or "") != 40:
                raise ValueError(f"Motor-pins skal være fulde 40-tegns SHA'er, fik {sha!r}")
        self.db.motor.update(model_commit=model_commit, data_commit=data_commit, aendret=self.db.nu())
        return True


class MinneImportLager:
    """``lager.ImportLager`` - samme regler som ``vaerksark.SqlImportLager``."""

    def __init__(self, db: MinneDb):
        self.db = db

    def ryd_doede_importer(self) -> int:
        from .vaerksark import DOED_EFTER_MIN
        graense = self.db.nu() - timedelta(minutes=DOED_EFTER_MIN)
        n = 0
        with self.db._mutex:
            for r in self.db.importer.values():
                if r["status"] == "koerer" and r["uploadet"] < graense:
                    r.update(status="fejl", log=("Importen stoppede uden at afslutte (jobbet blev "
                                                 "afbrudt). Upload arket igen.\n" + (r.get("log") or ""))[:4000])
                    n += 1
        return n

    def tag_import(self, import_id: str | None) -> dict | None:
        with self.db._mutex:
            kand = sorted((r for r in self.db.importer.values() if r["status"] == "koe"
                           and (import_id is None or r["id"] == import_id)),
                          key=lambda r: (r["uploadet"], r["id"]))
            if not kand:
                return None
            r = kand[0]
            r.update(status="koerer", log="Importerer arket ...")
            return {"id": r["id"], "filnavn": r.get("filnavn"), "sti": r.get("sti"),
                    "uploadet_af": r.get("uploadet_af"), "timeslut": int(bool(r.get("timeslut")))}

    def saet_fejl(self, import_id: str, besked: str) -> bool:
        from .vaerksark import MAKS_LOG
        with self.db._mutex:
            r = self.db.importer.get(import_id)
            if r is None or r["status"] != "koerer":
                return False
            r.update(status="fejl", log=besked[:MAKS_LOG])
            return True

    def gem_vaerk(self, imp: dict, k, model_sha: str, scriptlog: str,
                  files: str | None = None) -> dict:
        from .tidsserie_db import gem_tidsseriefil
        from .vaerksark import ArkFejl
        hvem = (imp.get("uploadet_af") or "fjv_importer_vaerksark")[:200]
        with self.db._mutex:
            r = self.db.importer.get(imp["id"])
            if not r or r["status"] != "koerer":
                raise ArkFejl(f"importen er ikke længere i gang (status {r and r['status']})")
            if any(v["kode"] == k.kode for v in self.db.vaerker.values()):
                raise ArkFejl(f"der findes allerede et værk med koden {k.kode!r}")
            vid = str(uuid.uuid4())
            blade = [{**p.dict(), "bekraeft": bool(p.bekraeft)} for p in k.params]
            ts_ud = []
            for t in k.tidsserier:
                res = t["res"]
                tid = str(uuid.uuid4())
                gyldig = res.status == "gyldig"
                aktiv = gyldig and not any(x["vaerk_id"] == vid and x["rolle"] == t["rolle"] and x["aktiv"]
                                           for x in self.db.tidsserier.values())
                self.db.tidsserier[tid] = {
                    "id": tid, "vaerk_id": vid, "rolle": t["rolle"], "navn": t["navn"][:200],
                    "sti": gem_tidsseriefil(k.kode, res.data, res.sha256, files) if gyldig else None,
                    "sha256": res.sha256, "kilde": "vaerksark", "status": res.status, "aktiv": aktiv,
                    "uploadet_af": hvem, "uploadet": self.db.nu()}
                ts_ud.append({"rolle": t["rolle"], "id": tid, "sha256": res.sha256,
                              "raekker": res.antal_raekker, "start": res.start, "slut": res.slut})
            self.db.vaerker[vid] = {"id": vid, "kode": k.kode, "navn": k.navn, "kilde": "app",
                                    "revision": 1, "repo_commit": model_sha, "parametre": blade,
                                    "oprettet_af": hvem}
            varme = next((t["id"] for t in ts_ud if t["rolle"] == "varmelast"), None)
            sol = next((t["id"] for t in ts_ud if t["rolle"] == "solprofil"), None)
            log = f"Værket '{k.navn}' (kode {k.kode}) er oprettet med {len(blade)} parametre."
            r.update(status="faerdig", vaerk_id=vid, tidsserie_id=varme or sol, log=log)
        return {"vaerk_id": vid, "kode": k.kode, "parametre": len(blade), "tidsserier": ts_ud, "log": log}

    def motor_pins(self) -> dict:
        from . import konstanter as K
        m = self.db.motor
        if m.get("model_commit") and m.get("data_commit"):
            return {"model_commit": m["model_commit"], "data_commit": m["data_commit"], "kilde": "Motor"}
        return {"model_commit": K.MODEL_COMMIT, "data_commit": K.DF_DATA_SHA, "kilde": "konstanter"}
