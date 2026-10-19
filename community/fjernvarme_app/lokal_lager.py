"""``fjv.lager``'s protokoller mod SQLAlchemy — så ``fjv.arbejder.arbejd`` og ``fjv.koersel.koer_en`` kører
UÆNDREDE lokalt (brief 21 punkt 3).

Reglerne er de samme som ``fjv.db.SqlLager``/``SqlKoe`` og ``fjv.vaerksark.SqlImportLager`` (og den kørbare
spec ``fjv.lager_minne``); kun SQL'en er anden:

* Låsen er ``laas.FilLaas`` (OS-fillås), ikke en SQL-applock.
* Tid er lagerets egen (``typer.nu()``: UTC, ms). Felter i ``fjv.db._TID_FELTER`` får altid lagerets tid.
* Alle statusskift er betingede UPDATEs; ``rowcount == 1`` = vi kom først.
* Publicering: rækken læses låst, resultatrækker slettes og indsættes, antal og naturlige nøgler kontrolleres,
  og ``faerdig`` sættes — i ÉN transaktion.

``import fjv`` sker først i ``LokalKoe(...)``, efter ``miljoe.forbered``.
"""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path

from sqlalchemy import and_, func, or_, select

from .database import Database
from .laas import NAVN as LAAS_NAVN, FilLaas
from .typer import nu, ny_uuid

AKTIVE = ("koerer", "indlaeser")


def _fjv():
    from fjv import db as DB, koersel as KS
    return DB, KS


def _felter(felter: dict) -> dict:
    DB, _ = _fjv()
    ud = {}
    for k, v in felter.items():
        if k not in DB.KOERSEL_FELTER:
            raise ValueError(f"ukendt Koersels-felt {k!r}")
        ud[k] = nu() if k in DB._TID_FELTER else DB._tekst(k, v)
    return ud


def _tal(v, dec: int):
    """Som ``db._f``: fast antal decimaler (sqlite gemmer NUMERIC som REAL; afrundingen er den samme)."""
    if v is None:
        return None
    return round(float(v), dec)


# ------------------------------------------------------------------ én kørsel

class LokalKoerselLager:
    """``lager.KoerselLager`` — samme regler som ``db.SqlLager``."""

    def __init__(self, db: Database, koersel_id: str, arbejder_id: str, laas: FilLaas | None = None):
        self.db, self.id, self.mig, self.laas = db, koersel_id, arbejder_id, laas
        self.k = db.t("Koersel")
        self._annulleret = False
        self._tabt = False
        self.faerdig_i_publicering = True

    def log(self) -> list:
        return []

    def skift(self, fra: str, til: str, **felter) -> bool:
        f = _felter(felter)
        k = self.k
        w = [k.c.id == self.id, k.c.status == fra, k.c.arbejder_id == self.mig]
        if til not in ("fejl", "annulleret"):
            w.append(k.c.annuller_anmodet.is_(None))
        with self.db.skriv() as cn:
            return cn.execute(k.update().where(and_(*w)).values(status=til, **f)).rowcount == 1

    def saet(self, **felter) -> None:
        if not felter:
            return
        f = _felter(felter)
        k = self.k
        with self.db.skriv() as cn:
            cn.execute(k.update().where(and_(k.c.id == self.id, k.c.arbejder_id == self.mig,
                                             k.c.status.in_(AKTIVE))).values(**f))

    def _vurder(self, r) -> None:
        if r is None:
            self._tabt = True
            return
        if r.annuller_anmodet is not None or r.status == "annulleret":
            self._annulleret = True
        if r.status not in AKTIVE or (r.arbejder_id or "") != self.mig:
            self._tabt = True

    def _laes(self):
        k = self.k
        with self.db.laes() as cn:
            return cn.execute(select(k.c.status, k.c.annuller_anmodet, k.c.arbejder_id)
                              .where(k.c.id == self.id)).first()

    def hjerteslag(self) -> None:
        k = self.k
        try:
            with self.db.skriv() as cn:
                cn.execute(k.update().where(and_(k.c.id == self.id, k.c.arbejder_id == self.mig,
                                                 k.c.status.in_(AKTIVE))).values(hjerteslag=nu()))
            self._vurder(self._laes())
        except Exception:
            self._tabt = True                      # kan ikke bekræfte ejerskab -> stop
        if self.laas is not None and not self.laas.holdt():
            self._tabt = True

    def tidsserie_sti(self, tidsserie_id: str) -> str | None:
        t = self.db.t("Tidsserie")
        with self.db.laes() as cn:
            r = cn.execute(select(t.c.sti).where(t.c.id == tidsserie_id)).first()
        return r[0] if r and r[0] else None

    def er_annulleret(self) -> bool:
        self._vurder(self._laes())
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
        for fra in AKTIVE:
            if self.skift(fra, "annulleret", afsluttet="nu", fase="Annulleret efter anmodning"):
                return True
        return False

    def publicer(self, noegletal, maaneder, timer, slutfelter: dict | None = None) -> dict:
        _, KS = _fjv()
        f = _felter(dict(slutfelter or {}))
        k = self.k
        tn, tm, tt = self.db.t("KoerselNoegletal"), self.db.t("KoerselMaaned"), self.db.t("KoerselTime")
        with self.db.skriv() as cn:
            r = cn.execute(self.db.laas_raekke(select(k.c.status, k.c.arbejder_id, k.c.annuller_anmodet)
                                                .where(k.c.id == self.id))).first()
            if r is None or r.status != "indlaeser" or r.arbejder_id != self.mig or r.annuller_anmodet is not None:
                raise KS.Afbrudt(f"kørslen er ikke længere vores at publicere: {tuple(r) if r else None}")
            for t in (tn, tm, tt):
                cn.execute(t.delete().where(t.c.koersel_id == self.id))
            _indsaet(cn, tn, self.id, [{
                "gruppe": str(x["gruppe"]), "objekt": x.get("objekt"), "marked": x.get("marked"),
                "noegle": str(x["noegle"]), "vaerdi": _tal(x.get("vaerdi"), 10), "enhed": x.get("enhed")}
                for x in noegletal])
            _indsaet(cn, tm, self.id, [{
                "maaned": str(x["maaned"]), "objekt": x.get("objekt"), "noegle": str(x["noegle"]),
                "vaerdi": _tal(x.get("vaerdi"), 10)} for x in maaneder])
            _indsaet(cn, tt, self.id, [{
                "tid": x["tid"], "varmelast_mw": _tal(x.get("varmelast_mw"), 6),
                "spotpris": _tal(x.get("spotpris"), 6), "t_ude": _tal(x.get("t_ude"), 6),
                "vaerdier_json": None if x.get("vaerdier_json") is None else str(x["vaerdier_json"])}
                for x in timer])
            antal = {}
            for t, forventet, noegle in ((tn, len(noegletal), ("gruppe", "objekt", "marked", "noegle")),
                                         (tm, len(maaneder), ("maaned", "objekt", "noegle")),
                                         (tt, len(timer), ("tid",))):
                n = cn.execute(select(func.count()).select_from(t).where(t.c.koersel_id == self.id)).scalar()
                d = select(*(t.c[x] for x in noegle)).where(t.c.koersel_id == self.id) \
                    .group_by(*(t.c[x] for x in noegle)).having(func.count() > 1).subquery()
                dub = cn.execute(select(func.count()).select_from(d)).scalar()
                if n != forventet or dub:
                    raise RuntimeError(f"{t.name}: {n} rækker (forventet {forventet}), {dub} dubletter")
                antal[t.name] = n
            u = cn.execute(k.update().where(and_(k.c.id == self.id, k.c.status == "indlaeser",
                                                 k.c.arbejder_id == self.mig, k.c.annuller_anmodet.is_(None)))
                           .values(status="faerdig", afsluttet=nu(), fase="Færdig", **f))
            if u.rowcount != 1:
                raise KS.Afbrudt("statusskiftet til faerdig ramte ikke rækken - publicerer intet")
        return antal


def _indsaet(cn, t, koersel_id: str, raekker: list[dict], bid: int = 1000) -> None:
    for i in range(0, len(raekker), bid):
        cn.execute(t.insert(), [{"id": ny_uuid(), "koersel_id": koersel_id, **r} for r in raekker[i:i + bid]])


# ------------------------------------------------------------------ køen

class LokalKoe:
    """``lager.KoeLager`` — samme regler som ``db.SqlKoe`` (FIFO efter ``modtaget``, kun under låsen)."""

    def __init__(self, db: Database, datamappe: Path, overtagelse_s: float | None = None):
        DB, _ = _fjv()
        self.db = db
        self.laas_sti = Path(datamappe) / LAAS_NAVN
        self.overtagelse_s = DB.OVERTAGELSE_S if overtagelse_s is None else overtagelse_s
        self.k = db.t("Koersel")
        self._grund: list[str] = []

    def laas(self) -> FilLaas:
        return FilLaas(self.laas_sti)

    def _graense(self):
        return nu() - timedelta(seconds=self.overtagelse_s)

    def friske_fremmede(self, mig: str) -> list[dict]:
        k = self.k
        sidst = func.coalesce(k.c.hjerteslag, k.c.startet)
        with self.db.laes() as cn:
            rk = cn.execute(select(k.c.id, k.c.arbejder_id, sidst.label("sidst")).where(and_(
                k.c.status.in_(AKTIVE), func.coalesce(k.c.arbejder_id, "") != mig,
                sidst >= self._graense()))).fetchall()
        return [{"id": r.id, "arbejder_id": r.arbejder_id} for r in rk]

    def vent_overtagelse(self, mig: str, laas, rap=None, pause_s: float = 15.0) -> bool:
        """Som ``db.vent_overtagelse``: vent (med låsen), til ingen fremmed kørsel har et friskt hjerteslag."""
        import time
        t0 = time.time()
        while True:
            if not laas.holdt():
                return False
            friske = self.friske_fremmede(mig)
            if not friske:
                return True
            if rap is not None:
                rap.trin("venter_overtagelse", [f["id"][:8] for f in friske])
            if time.time() - t0 >= self.overtagelse_s + 60:
                return False
            time.sleep(pause_s)

    def ryd_doede(self, mig: str, laas) -> list:
        if not laas.holdt():
            return []
        k = self.k
        w = and_(k.c.status.in_(AKTIVE), func.coalesce(k.c.arbejder_id, "") != mig,
                 or_(func.coalesce(k.c.hjerteslag, k.c.startet) < self._graense(),
                     func.coalesce(k.c.hjerteslag, k.c.startet).is_(None)))
        with self.db.skriv() as cn:
            ids = [r.id for r in cn.execute(select(k.c.id).where(w)).fetchall()]
            if ids:
                cn.execute(k.update().where(and_(k.c.id.in_(ids), w)).values(
                    status="fejl", afsluttet=nu(), fase="Fejl",
                    fejlbesked="Arbejderen stoppede uden at afslutte kørslen (fx fordi processen blev "
                               "stoppet). Bestil kørslen igen."))
        return ids

    def _overtag(self, cn, kid: str, mig: str) -> bool:
        k = self.k
        t = nu()
        return cn.execute(k.update().where(and_(k.c.id == kid, k.c.status.in_(("koe", "startet")),
                                                k.c.annuller_anmodet.is_(None)))
                          .values(status="koerer", arbejder_id=mig, hjerteslag=t, startet=t,
                                  forsoeg=func.coalesce(k.c.forsoeg, 0) + 1)).rowcount == 1

    def overtag_bestemt(self, koersel_id: str, mig: str, laas) -> bool:
        if not laas.holdt():
            raise RuntimeError("overtagelse uden fjv_solver-låsen er ikke tilladt (§6c)")
        with self.db.skriv() as cn:
            return self._overtag(cn, koersel_id.lower(), mig)

    def overtag_naeste(self, mig: str, laas) -> str | None:
        if not laas.holdt():
            self._grund.append("fjv_solver-låsen er ikke længere vores")
            return None
        k = self.k
        with self.db.skriv() as cn:
            for r in cn.execute(self.db.laas_raekke(
                    select(k.c.id).where(and_(k.c.status.in_(("koe", "startet")), k.c.annuller_anmodet.is_(None)))
                    .order_by(k.c.modtaget, k.c.id).limit(5))).fetchall():
                if self._overtag(cn, r.id, mig):
                    return r.id
        self._grund.append("køen er tom")
        return None

    def grund(self) -> str:
        return self._grund[-1] if self._grund else ""

    def laes_input(self, koersel_id: str):
        k, i = self.k, self.db.t("KoerselInput")
        with self.db.laes() as cn:
            r = cn.execute(select(k.c.id, k.c.input_hash, k.c.status, k.c.vaerk_revision, k.c.vaerk_id)
                           .where(k.c.id == koersel_id)).first()
            if r is None:
                raise RuntimeError(f"kørslen {koersel_id} findes ikke")
            rk = cn.execute(select(i.c.kilde, i.c.sti, i.c.vaerdi_json).where(i.c.koersel_id == koersel_id)).fetchall()
        return [dict(x._mapping) for x in rk], dict(r._mapping)

    def koersel_lager(self, koersel_id: str, mig: str, laas) -> LokalKoerselLager:
        return LokalKoerselLager(self.db, koersel_id, mig, laas)

    def skriv_motor_pins(self, model_commit: str, data_commit: str) -> bool:
        return skriv_motor_pins(self.db, model_commit, data_commit)


def motor_id() -> str:
    DB, _ = _fjv()
    return DB.MOTOR_ID


def skriv_motor_pins(db: Database, model_commit: str, data_commit: str) -> bool:
    for sha in (model_commit, data_commit):
        if len(sha or "") != 40:
            raise ValueError(f"Motor-pins skal være fulde 40-tegns SHA'er, fik {sha!r}")
    m = db.t("Motor")
    with db.skriv() as cn:
        if cn.execute(select(m.c.id).where(m.c.id == motor_id())).first() is None:
            cn.execute(m.insert().values(id=motor_id(), aendret=nu()))
        cn.execute(m.update().where(m.c.id == motor_id()).values(
            model_commit=model_commit, data_commit=data_commit, aendret=nu()))
    return True


def motor_pins(db: Database) -> dict:
    from fjv import konstanter as K
    m = db.t("Motor")
    with db.laes() as cn:
        r = cn.execute(select(m.c.model_commit, m.c.data_commit).where(m.c.id == motor_id())).first()
    if r and r.model_commit and r.data_commit:
        return {"model_commit": r.model_commit, "data_commit": r.data_commit, "kilde": "Motor"}
    return {"model_commit": K.MODEL_COMMIT, "data_commit": K.DF_DATA_SHA, "kilde": "konstanter"}


# ------------------------------------------------------------------ værksark-importen

class LokalImportLager:
    """``lager.ImportLager`` — samme regler som ``vaerksark.SqlImportLager``."""

    def __init__(self, db: Database):
        self.db = db
        self.i = db.t("Vaerksarkimport")

    def ryd_doede_importer(self) -> int:
        from fjv.vaerksark import DOED_EFTER_MIN, MAKS_LOG
        i = self.i
        graense = nu() - timedelta(minutes=DOED_EFTER_MIN)
        n = 0
        with self.db.skriv() as cn:
            for r in cn.execute(select(i.c.id, i.c.log).where(and_(i.c.status == "koerer",
                                                                   i.c.uploadet < graense))).fetchall():
                log = ("Importen stoppede uden at afslutte (jobbet blev afbrudt). Upload arket igen.\n"
                       + (r.log or ""))[:MAKS_LOG]
                n += cn.execute(i.update().where(and_(i.c.id == r.id, i.c.status == "koerer"))
                                .values(status="fejl", log=log)).rowcount
        return n

    def tag_import(self, import_id: str | None) -> dict | None:
        i = self.i
        w = [i.c.status == "koe"]
        if import_id:
            w.append(i.c.id == import_id.lower())
        with self.db.skriv() as cn:
            for r in cn.execute(self.db.laas_raekke(select(i).where(and_(*w)).order_by(i.c.uploadet, i.c.id)
                                                     .limit(5))).fetchall():
                if cn.execute(i.update().where(and_(i.c.id == r.id, i.c.status == "koe"))
                              .values(status="koerer", log="Importerer arket ...")).rowcount == 1:
                    return {"id": r.id, "filnavn": r.filnavn, "sti": r.sti, "uploadet_af": r.uploadet_af,
                            "timeslut": int(bool(r.timeslut))}
        return None

    def saet_fejl(self, import_id: str, besked: str) -> bool:
        from fjv.vaerksark import MAKS_LOG
        i = self.i
        with self.db.skriv() as cn:
            return cn.execute(i.update().where(and_(i.c.id == import_id, i.c.status == "koerer"))
                              .values(status="fejl", log=besked[:MAKS_LOG])).rowcount == 1

    def gem_vaerk(self, imp: dict, k, model_sha: str, scriptlog: str, files: str | None = None) -> dict:
        """Værk + parametre + log + tidsserier + importens status i ÉN transaktion (som ``vaerksark.gem_vaerk``)."""
        from fjv.importer import gem_kildefil
        from fjv.vaerksark import ArkFejl, _log_tekst
        from . import vaerksskriv as VS

        hvem = (imp.get("uploadet_af") or "fjv_importer_vaerksark")[:200]
        i = self.i
        with self.db.skriv() as cn:
            r = cn.execute(self.db.laas_raekke(select(i.c.status).where(i.c.id == imp["id"]))).first()
            if not r or r.status != "koerer":
                raise ArkFejl(f"importen er ikke længere i gang (status {r.status if r else None})")
            if VS.kode_findes(self.db, cn, k.kode):
                raise ArkFejl(f"der findes allerede et værk med koden {k.kode!r} - giv værket et andet "
                              "navn på arket Priser (feltet 'værkets navn'), eller kopiér det eksisterende")
            blade = [{**p.dict(), "bekraeft": bool(p.bekraeft)} for p in k.params]
            vid = VS.opret_vaerk(self.db, cn, kode=k.kode, navn=k.navn, beskrivelse=k.beskrivelse, kilde="app",
                                 kilde_fil=f"vaerksark:{imp.get('filnavn') or ''}"[:300], repo_commit=model_sha,
                                 blade=blade, hvem=hvem)
            ts_ud = []
            for t in k.tidsserier:
                tid, _ = VS.indsaet_tidsserie(self.db, cn, vid, k.kode, t["rolle"], t["navn"], t["filnavn"],
                                              t["res"], "vaerksark", True, hvem, tidsstempel=t["tidsstempel"],
                                              tidszone=t["tidszone"], files=files)
                ts_ud.append({"rolle": t["rolle"], "id": tid, "sha256": t["res"].sha256,
                              "raekker": t["res"].antal_raekker, "start": t["res"].start, "slut": t["res"].slut})
            varme = next((t["id"] for t in ts_ud if t["rolle"] == "varmelast"), None)
            sol = next((t["id"] for t in ts_ud if t["rolle"] == "solprofil"), None)
            linjer = [f"Værket '{k.navn}' (kode {k.kode}) er oprettet med {len(blade)} parametre "
                      f"({sum(1 for b in blade if b['bekraeft'])} skal bekræftes)."]
            for t in ts_ud:
                linjer.append(f"{'Varmelast' if t['rolle'] == 'varmelast' else 'Solprofil'}: "
                              f"{t['raekker']} timer, {t['start']} til {t['slut']} (aktiv).")
            if not varme:
                linjer.append("Ingen målt varmelast i arket: varmen syntetiseres af modellen ud fra "
                              "DMI-vejrdata og årsproduktionen.")
            linjer += [f"Advarsel - {a}" for a in k.advarsler[:6]]
            log = _log_tekst("\n".join(linjer), scriptlog)
            if cn.execute(i.update().where(and_(i.c.id == imp["id"], i.c.status == "koerer"))
                          .values(status="faerdig", vaerk_id=vid, tidsserie_id=varme or sol, log=log)).rowcount != 1:
                raise ArkFejl("importens status blev ændret under importen")
        try:
            gem_kildefil(k.kode, k.tekst, files=files)
        except Exception as e:                     # visning; værket er gemt
            k.advarsler.append(f"kilde.yaml kunne ikke gemmes: {e}")
        return {"vaerk_id": vid, "kode": k.kode, "parametre": len(blade), "tidsserier": ts_ud, "log": log}

    def motor_pins(self) -> dict:
        return motor_pins(self.db)
