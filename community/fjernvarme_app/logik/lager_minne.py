"""``lager.BetroetLager`` i hukommelsen — den kørbare specifikation af protokollen (og testenes database).

Én global lås gør hver transaktion serialiserbar (det stærkeste, protokollen kræver; ``laas=True`` er dermed
opfyldt for alle verber), og en undtagelse ruller hele transaktionen tilbage fra et øjebliksbillede. Servertiden er
et injicerbart, strengt stigende ur, så FIFO efter ``modtaget`` er entydig.

Tabelnavnene er Rayfins SQL-flertal (``Koersels``, ``Scenaries`` …), kolonnerne databasens.
"""

from __future__ import annotations

import copy
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from .lager import UnikBrud

__all__ = ["MinneLager", "MinneFiler", "TABELLER"]

TABELLER = ("Vaerks", "VaerkParameters", "Aendringslogs", "Aendringsanmodnings", "Scenaries", "ScenarieAendrings",
            "Bestillings", "Koersels", "KoerselInputs", "Motors", "Tidsseries", "Vaerksarkimports")

#: Unikke nøgler ud over id (som i databasen).
_UNIKKE = {"Koersels": ("bestilling_id",), "Vaerks": ("kode",), "Bestillings": ("klient_noegle",)}


def _k(v) -> str:
    return str(v).lower() if v is not None else ""


class MinneLager:
    def __init__(self, ur=None):
        self.t: dict[str, dict[str, dict]] = {n: {} for n in TABELLER}
        self._laas = threading.RLock()
        self._sidste = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self._ur = ur

    # ------------------------------------------------------------ protokol

    def ny_id(self) -> str:
        return str(uuid.uuid4())

    @contextmanager
    def transaktion(self):
        with self._laas:
            billede = copy.deepcopy(self.t)
            try:
                yield _MinneTx(self)
            except BaseException:
                self.t = billede
                raise

    # ------------------------------------------------------------ til tests og seed

    def nu(self) -> datetime:
        t = self._ur() if self._ur else datetime.now(timezone.utc)
        if t <= self._sidste:
            t = self._sidste + timedelta(microseconds=1)
        self._sidste = t
        return t

    def indsaet(self, tabel: str, raekke: dict) -> dict:
        r = dict(raekke)
        r.setdefault("id", self.ny_id())
        for kol in _UNIKKE.get(tabel, ()):
            v = r.get(kol)
            if v is not None and any(_k(x.get(kol)) == _k(v) for x in self.t[tabel].values()):
                raise UnikBrud(f"{tabel}.{kol} = {v}")
        if _k(r["id"]) in self.t[tabel]:
            raise UnikBrud(f"{tabel}.id = {r['id']}")
        self.t[tabel][_k(r["id"])] = r
        return r

    def opdater(self, tabel: str, id: str, **felter) -> None:
        self.t[tabel][_k(id)].update(felter)

    def raekker(self, tabel: str, **filter_) -> list[dict]:
        return [dict(r) for r in self._levende_raekker(tabel, **filter_)]

    def _levende_raekker(self, tabel: str, **filter_) -> list[dict]:
        return [r for r in self.t[tabel].values()
                if all(_k(r.get(k)) == _k(v) if isinstance(v, str) or v is None else r.get(k) == v for k, v in filter_.items())]

    def en(self, tabel: str, id: str) -> dict | None:
        r = self.t[tabel].get(_k(id))
        return None if r is None else dict(r)

    def _levende(self, tabel: str, id: str) -> dict | None:
        return self.t[tabel].get(_k(id))


class _MinneTx:
    def __init__(self, l: MinneLager):
        self.l = l

    def _kopi(self, r):
        return None if r is None else dict(r)

    # -------------------------------------------------- bestilling
    def bestilling(self, id):
        return self._kopi(self.l._levende("Bestillings", id))

    def laas_kvote(self, email):
        pass                                             # den globale lås serialiserer allerede

    def scenarie(self, id, laas):
        return self._kopi(self.l._levende("Scenaries", id))

    def vaerk(self, id, laas):
        return self._kopi(self.l._levende("Vaerks", id))

    def antal_i_koe(self, bestilt_af):
        return sum(1 for r in self.l.t["Koersels"].values() if r.get("bestilt_af") == bestilt_af and r.get("status") == "koe")

    def parametre(self, vaerk_id):
        return [dict(r) for r in self.l._levende_raekker("VaerkParameters", vaerk_id=vaerk_id)]

    def scenarie_aendringer(self, scenarie_id, laas):
        return [dict(r) for r in self.l._levende_raekker("ScenarieAendrings", scenarie_id=scenarie_id)]

    def motor(self):
        m = list(self.l.t["Motors"].values())
        return dict(m[0]) if m else None

    def gyldige_tidsserier(self, vaerk_id, laas):
        return [dict(r) for r in self.l._levende_raekker("Tidsseries", vaerk_id=vaerk_id) if r.get("status") == "gyldig"]

    def indsaet_koersel(self, raekke):
        self.l.indsaet("Koersels", {**raekke, "modtaget": self.l.nu()})

    def indsaet_input(self, koersel_id, raekker):
        for r in raekker:
            self.l.indsaet("KoerselInputs", {"koersel_id": koersel_id, "sti": r["sti"], "vaerdi_json": r["vaerdi_json"],
                                             "kilde": r["kilde"]})

    def koersel_for_bestilling(self, bestilling_id):
        r = self.l._levende_raekker("Koersels", bestilling_id=bestilling_id)
        return {"id": r[0]["id"], "status": r[0]["status"]} if r else None

    # -------------------------------------------------- kørsler
    def koersel(self, id):
        return self._kopi(self.l._levende("Koersels", id))

    def annuller_i_koe(self, id, status):
        r = self.l._levende("Koersels", id)
        if not r or r["status"] != status:
            return False
        r.update(status="annulleret", afsluttet=self.l.nu(), fase="Annulleret før start")
        return True

    def anmod_annullering(self, id, status):
        r = self.l._levende("Koersels", id)
        if not r or r["status"] != status or r.get("annuller_anmodet") is not None:
            return False
        r.update(annuller_anmodet=self.l.nu(), fase="Annullering anmodet")
        return True

    # -------------------------------------------------- anmodninger
    def anmodning(self, id, laas):
        return self._kopi(self.l._levende("Aendringsanmodnings", id))

    def nye_anmodninger(self, anmodet_af, indeholder, laas):
        return [{"id": r["id"], "aendringer_json": r["aendringer_json"]} for r in self.l.t["Aendringsanmodnings"].values()
                if r.get("anmodet_af") == anmodet_af and r.get("status") == "ny"
                and indeholder.lower() in (r.get("aendringer_json") or "").lower()]

    def saet_anmodning(self, id, status, svar):
        r = self.l._levende("Aendringsanmodnings", id)
        if not r or r.get("status") != "ny":
            return False
        r.update(status=status, svar=svar)
        return True

    # -------------------------------------------------- værker
    def kode_findes(self, kode, laas):
        return any(r.get("kode") == kode for r in self.l.t["Vaerks"].values())

    def indsaet_vaerk(self, raekke):
        nu = self.l.nu()
        self.l.indsaet("Vaerks", {**raekke, "oprettet": nu, "aendret": nu})

    def indsaet_parametre(self, vaerk_id, blade, aendret_af):
        for b in blade:
            self.l.indsaet("VaerkParameters", {"vaerk_id": vaerk_id, "sti": b["sti"], "vaerdi_json": b["vaerdi_json"],
                                               "sektion": b.get("sektion"), "objekt": b.get("objekt"),
                                               "kommentar": b.get("kommentar"), "bekraeft": bool(b.get("bekraeft")),
                                               "raekkefoelge": b.get("raekkefoelge"), "aendret_af": aendret_af,
                                               "aendret": self.l.nu()})

    def indsaet_log(self, vaerk_id, raekker):
        for r in raekker:
            self.l.indsaet("Aendringslogs", {"vaerk_id": vaerk_id, **r, "tidspunkt": self.l.nu()})

    def antal_parametre(self, vaerk_id):
        return len(self.l._levende_raekker("VaerkParameters", vaerk_id=vaerk_id))

    def ret_parameter(self, vaerk_id, sti, ny_json, aendret_af):
        n = 0
        for r in self.l._levende_raekker("VaerkParameters", vaerk_id=vaerk_id):
            if r["sti"] == sti:
                r.update(vaerdi_json=ny_json, aendret_af=aendret_af, aendret=self.l.nu())
                n += 1
        return n

    def slet_parameter(self, vaerk_id, sti):
        ud = [k for k, r in self.l.t["VaerkParameters"].items() if _k(r["vaerk_id"]) == _k(vaerk_id) and r["sti"] == sti]
        for k in ud:
            del self.l.t["VaerkParameters"][k]
        return len(ud)

    def saet_revision(self, vaerk_id, gammel, ny, aendret_af):
        r = self.l._levende("Vaerks", vaerk_id)
        if not r or int(r["revision"]) != int(gammel):
            return False
        r.update(revision=ny, aendret_af=aendret_af, aendret=self.l.nu())
        return True

    # -------------------------------------------------- tidsserier
    def tidsserie(self, id, laas):
        return self._kopi(self.l._levende("Tidsseries", id))

    def laas_tidsserier(self, vaerk_id, rolle):
        pass

    def deaktiver_andre(self, vaerk_id, rolle, undtagen_id):
        for r in self.l._levende_raekker("Tidsseries", vaerk_id=vaerk_id, rolle=rolle):
            if _k(r["id"]) != _k(undtagen_id) and r.get("aktiv"):
                r["aktiv"] = False

    def saet_aktiv(self, tidsserie_id, aktiv):
        r = self.l._levende("Tidsseries", tidsserie_id)
        if r:
            r["aktiv"] = bool(aktiv)

    def indsaet_tidsserie(self, raekke):
        self.l.indsaet("Tidsseries", {**raekke, "uploadet": self.l.nu()})

    # -------------------------------------------------- værksark-importer
    def vaerksarkimport(self, id, laas):
        r = self.l._levende("Vaerksarkimports", id)
        return None if r is None else {k: r.get(k) for k in ("id", "status", "fabric_job_id", "log")}

    def indsaet_import(self, raekke):
        self.l.indsaet("Vaerksarkimports", {**raekke, "uploadet": self.l.nu()})

    def reserver_importstart(self, id):
        r = self.l._levende("Vaerksarkimports", id)
        if not r or r.get("status") != "koe":
            return False
        job = r.get("fabric_job_id")
        nu = self.l.nu()
        if job is not None:
            if not job.startswith("reserveret:"):
                return False
            try:
                da = datetime.fromisoformat(job[len("reserveret:"):])
            except ValueError:
                return False
            if da >= nu - timedelta(minutes=5):
                return False
        r["fabric_job_id"] = "reserveret:" + nu.isoformat()
        return True

    def bind_importjob(self, id, job_id, log):
        r = self.l._levende("Vaerksarkimports", id)
        if r and (r.get("fabric_job_id") or "").startswith("reserveret:"):
            r["fabric_job_id"] = job_id
            if log is not None:
                r["log"] = log


class MinneFiler:
    """``lager.Filer`` i hukommelsen."""

    def __init__(self):
        self.filer: dict[str, bytes] = {}

    def skriv_fil(self, files_relativ, data):
        self.filer[files_relativ] = bytes(data)

    def laes_tekst(self, files_relativ):
        b = self.filer.get(files_relativ)
        return None if b is None else b.decode("utf-8")
