"""``logik.lager.BetroetLager`` mod SQLAlchemy — de betroede forløbs (``logik.tjenester``) database-verber.

Hvert verbum er ét SQL-udsagn fra ``function_app.ts``; reglerne (hvad der tjekkes, i hvilken rækkefølge, med
hvilke tekster) står i fv-port's forløb, ikke her. Semantikken følger ``logik/lager.py``:

* ``transaktion()``: commit ved normal afslutning, rollback ved undtagelse. sqlite: ``BEGIN IMMEDIATE`` —
  skrivelåsen tages ved start, hvilket opfylder ``laas=True`` for alle verber. mssql: læsninger med ``laas=True``
  får ``WITH (UPDLOCK, HOLDLOCK)`` som Fabric-handlerne; postgresql ``FOR UPDATE`` (``database.laas_for``, K6-F7).
  ``laas_kvote`` er en transaktionsejet advisory-/applock.
* Servertid sættes af lageret (``typer.nu()``), uanset hvad forløbet giver.
* Et unikt brud bliver ``UnikBrud``.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path

from sqlalchemy import and_, func, select, text
from sqlalchemy.exc import IntegrityError

from .typer import nu, ny_uuid, til_utc


def _unik():
    from .logik.lager import UnikBrud
    return UnikBrud


def er_unikbrud(e: IntegrityError) -> bool:
    """Kun et brud på en unik nøgle/et unikt indeks — sqlite, postgresql (23505), mssql (2627/2601)."""
    orig = getattr(e, "orig", e)
    if getattr(orig, "pgcode", None) == "23505" or getattr(orig, "sqlstate", None) == "23505":
        return True
    tekst = str(orig)
    return "UNIQUE constraint failed" in tekst or "(2627)" in tekst or "(2601)" in tekst or \
        "duplicate key" in tekst.lower()


def _d(r) -> dict | None:
    return dict(r._mapping) if r is not None else None


class SqlTransaktion:
    def __init__(self, db, cn):
        self.db, self.cn = db, cn

    def t(self, navn):
        return self.db.t(navn)

    def _en(self, q, laas: bool = False):
        return _d(self.cn.execute(self.db.laas_raekke(q) if laas else q).first())

    def _alle(self, q, laas: bool = False) -> list[dict]:
        return [dict(r._mapping) for r in self.cn.execute(self.db.laas_raekke(q) if laas else q).fetchall()]

    def _indsaet(self, tabel: str, raekker):
        try:
            self.cn.execute(self.t(tabel).insert(), raekker)
        except IntegrityError as e:
            if er_unikbrud(e):
                raise _unik()(str(e.orig)) from None
            raise                                  # NOT NULL/CHECK er en fejl, ikke "en anden kom først"

    # -------------------------------------------------- bestilling
    def bestilling(self, id: str):
        b = self.t("Bestilling")
        return self._en(select(b.c.id, b.c.scenarie_id, b.c.bestilt_af, b.c.bestilt).where(b.c.id == id.lower()))

    def laas_kvote(self, email: str) -> None:
        d = self.db.dialekt
        if d == "postgresql":
            self.cn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": "fjv_kvote:" + email})
        elif d == "mssql":
            self.cn.execute(text("EXEC sp_getapplock @Resource = :k, @LockMode = 'Exclusive', "
                                 "@LockOwner = 'Transaction', @LockTimeout = 30000"), {"k": "fjv_kvote:" + email})
        # sqlite: BEGIN IMMEDIATE har allerede serialiseret alle skrivere.

    def scenarie(self, id: str, laas: bool):
        s = self.t("Scenarie")
        return self._en(select(s.c.id, s.c.vaerk_id, s.c.arkiveret, s.c.periode_start, s.c.periode_slut,
                               s.c.med_balancering, s.c.balancing_method, s.c.mip_rel_gap, s.c.mip_abs_gap,
                               s.c.tidsgraense_s, s.c.ekstra_flag, s.c.heat_csv).where(s.c.id == id.lower()), laas)

    def vaerk(self, id: str, laas: bool):
        v = self.t("Vaerk")
        return self._en(select(v.c.id, v.c.kode, v.c.navn, v.c.revision, v.c.arkiveret).where(v.c.id == id.lower()), laas)

    def antal_i_koe(self, bestilt_af: str) -> int:
        k = self.t("Koersel")
        return self.cn.execute(select(func.count()).select_from(k).where(and_(
            k.c.bestilt_af == bestilt_af, k.c.status == "koe"))).scalar()

    def parametre(self, vaerk_id: str) -> list[dict]:
        p = self.t("VaerkParameter")
        return self._alle(select(p.c.sti, p.c.vaerdi_json, p.c.sektion, p.c.objekt, p.c.kommentar, p.c.bekraeft,
                                 p.c.raekkefoelge).where(p.c.vaerk_id == vaerk_id.lower()))

    def scenarie_aendringer(self, scenarie_id: str, laas: bool) -> list[dict]:
        a = self.t("ScenarieAendring")
        return self._alle(select(a.c.type, a.c.sti, a.c.vaerdi_json, a.c.raekkefoelge)
                          .where(a.c.scenarie_id == scenarie_id.lower()), laas)

    def motor(self):
        from . import lokal_lager as LL
        m = self.t("Motor")
        return self._en(select(m.c.model_commit, m.c.data_commit).where(m.c.id == LL.motor_id()))

    def gyldige_tidsserier(self, vaerk_id: str, laas: bool) -> list[dict]:
        t = self.t("Tidsserie")
        return self._alle(select(t.c.id, t.c.rolle, t.c.navn, t.c.sha256, t.c.sti, t.c.oploesning, t.c.start,
                                 t.c.slut, t.c.aktiv, t.c.validering_json)
                          .where(and_(t.c.vaerk_id == vaerk_id.lower(), t.c.status == "gyldig")), laas)

    def indsaet_koersel(self, raekke: dict) -> None:
        self._indsaet("Koersel", [{**raekke, "modtaget": nu()}])

    def indsaet_input(self, koersel_id: str, raekker: list[dict]) -> None:
        rk = [{"id": ny_uuid(), "koersel_id": koersel_id.lower(), "kilde": r["kilde"], "sti": r["sti"],
               "vaerdi_json": r["vaerdi_json"]} for r in raekker]
        for i in range(0, len(rk), 1000):
            self._indsaet("KoerselInput", rk[i:i + 1000])

    def koersel_for_bestilling(self, bestilling_id: str):
        k = self.t("Koersel")
        return self._en(select(k.c.id, k.c.status).where(k.c.bestilling_id == bestilling_id.lower()))

    # -------------------------------------------------- kørsler
    def koersel(self, id: str):
        k = self.t("Koersel")
        return self._en(select(k.c.id, k.c.status, k.c.annuller_anmodet).where(k.c.id == id.lower()))

    def annuller_i_koe(self, id: str, status: str) -> bool:
        k = self.t("Koersel")
        return self.cn.execute(k.update().where(and_(k.c.id == id.lower(), k.c.status == status)).values(
            status="annulleret", afsluttet=nu(), fase="Annulleret før start")).rowcount == 1

    def anmod_annullering(self, id: str, status: str) -> bool:
        k = self.t("Koersel")
        return self.cn.execute(k.update().where(and_(k.c.id == id.lower(), k.c.status == status,
                                                     k.c.annuller_anmodet.is_(None))).values(
            annuller_anmodet=nu(), fase="Annullering anmodet")).rowcount == 1

    # -------------------------------------------------- anmodninger
    def anmodning(self, id: str, laas: bool):
        a = self.t("Aendringsanmodning")
        return self._en(select(a.c.id, a.c.vaerk_id, a.c.forventet_revision, a.c.aendringer_json, a.c.anmodet_af,
                               a.c.status, a.c.svar).where(a.c.id == id.lower()), laas)

    def nye_anmodninger(self, anmodet_af: str, indeholder: str, laas: bool) -> list[dict]:
        a = self.t("Aendringsanmodning")
        return self._alle(select(a.c.id, a.c.aendringer_json).where(and_(
            a.c.anmodet_af == anmodet_af, a.c.status == "ny",
            func.lower(a.c.aendringer_json).contains(indeholder.lower(), autoescape=True))), laas)

    def saet_anmodning(self, id: str, status: str, svar: str) -> bool:
        a = self.t("Aendringsanmodning")
        return self.cn.execute(a.update().where(and_(a.c.id == id.lower(), a.c.status == "ny"))
                               .values(status=status, svar=svar)).rowcount == 1

    # -------------------------------------------------- værker
    def kode_findes(self, kode: str, laas: bool) -> bool:
        v = self.t("Vaerk")
        q = select(v.c.id).where(v.c.kode == kode)          # rækken låst, ikke et låst aggregat (K6-F7)
        return self.cn.execute(self.db.laas_raekke(q) if laas else q).first() is not None

    def indsaet_vaerk(self, raekke: dict) -> None:
        t = nu()
        self._indsaet("Vaerk", [{**raekke, "oprettet": t, "aendret": t}])

    def indsaet_parametre(self, vaerk_id: str, blade: list[dict], aendret_af: str) -> None:
        t = nu()
        rk = [{"id": ny_uuid(), "vaerk_id": vaerk_id.lower(), "sti": b["sti"], "vaerdi_json": b["vaerdi_json"],
               "sektion": b["sektion"], "objekt": b.get("objekt"), "kommentar": b.get("kommentar"),
               "bekraeft": bool(b.get("bekraeft")), "raekkefoelge": int(b["raekkefoelge"]),
               "aendret_af": aendret_af, "aendret": t} for b in blade]
        for i in range(0, len(rk), 500):
            self._indsaet("VaerkParameter", rk[i:i + 500])

    def indsaet_log(self, vaerk_id: str, raekker: list[dict]) -> None:
        t = nu()
        rk = [{"id": ny_uuid(), "vaerk_id": vaerk_id.lower(), "revision": int(r["revision"]), "sti": r["sti"],
               "handling": r["handling"], "gammel_json": r.get("gammel_json"), "ny_json": r.get("ny_json"),
               "aendret_af": r["aendret_af"], "tidspunkt": t, "anmodning_id": r.get("anmodning_id")} for r in raekker]
        for i in range(0, len(rk), 500):
            self._indsaet("Aendringslog", rk[i:i + 500])

    def antal_parametre(self, vaerk_id: str) -> int:
        p = self.t("VaerkParameter")
        return self.cn.execute(select(func.count()).select_from(p).where(p.c.vaerk_id == vaerk_id.lower())).scalar()

    def ret_parameter(self, vaerk_id: str, sti: str, ny_json: str, aendret_af: str) -> int:
        p = self.t("VaerkParameter")
        return self.cn.execute(p.update().where(and_(p.c.vaerk_id == vaerk_id.lower(), p.c.sti == sti))
                               .values(vaerdi_json=ny_json, aendret_af=aendret_af, aendret=nu())).rowcount

    def slet_parameter(self, vaerk_id: str, sti: str) -> int:
        p = self.t("VaerkParameter")
        return self.cn.execute(p.delete().where(and_(p.c.vaerk_id == vaerk_id.lower(), p.c.sti == sti))).rowcount

    def saet_revision(self, vaerk_id: str, gammel: int, ny: int, aendret_af: str) -> bool:
        v = self.t("Vaerk")
        return self.cn.execute(v.update().where(and_(v.c.id == vaerk_id.lower(), v.c.revision == gammel))
                               .values(revision=ny, aendret_af=aendret_af, aendret=nu())).rowcount == 1

    # -------------------------------------------------- tidsserier
    def tidsserie(self, id: str, laas: bool):
        t = self.t("Tidsserie")
        return self._en(select(t.c.id, t.c.vaerk_id, t.c.rolle, t.c.navn, t.c.sti, t.c.sha256, t.c.oploesning,
                               t.c.status).where(t.c.id == id.lower()), laas)

    def laas_tidsserier(self, vaerk_id: str, rolle: str) -> None:
        t = self.t("Tidsserie")
        self._alle(select(t.c.id).where(and_(t.c.vaerk_id == vaerk_id.lower(), t.c.rolle == rolle)), True)

    def deaktiver_andre(self, vaerk_id: str, rolle: str, undtagen_id: str) -> None:
        t = self.t("Tidsserie")
        self.cn.execute(t.update().where(and_(t.c.vaerk_id == vaerk_id.lower(), t.c.rolle == rolle,
                                              t.c.id != undtagen_id.lower(), t.c.aktiv.is_(True))).values(aktiv=False))

    def saet_aktiv(self, tidsserie_id: str, aktiv: bool) -> None:
        t = self.t("Tidsserie")
        self.cn.execute(t.update().where(t.c.id == tidsserie_id.lower()).values(aktiv=bool(aktiv)))

    def indsaet_tidsserie(self, raekke: dict) -> None:
        self._indsaet("Tidsserie", [{**raekke, "uploadet": nu()}])

    # -------------------------------------------------- værksark-importer
    def vaerksarkimport(self, id: str, laas: bool):
        i = self.t("Vaerksarkimport")
        return self._en(select(i.c.id, i.c.status, i.c.fabric_job_id, i.c.log).where(i.c.id == id.lower()), laas)

    def indsaet_import(self, raekke: dict) -> None:
        self._indsaet("Vaerksarkimport", [{**raekke, "uploadet": nu()}])

    def reserver_importstart(self, id: str) -> bool:
        i = self.t("Vaerksarkimport")
        r = self._en(select(i.c.status, i.c.fabric_job_id).where(i.c.id == id.lower()), True)
        if r is None or r["status"] != "koe":
            return False
        gammel = r["fabric_job_id"]
        if gammel is not None:
            if not gammel.startswith("reserveret:"):
                return False
            try:
                tid = til_utc(gammel[len("reserveret:"):])
            except ValueError:
                tid = None
            if tid is not None and tid >= nu() - timedelta(minutes=5):
                return False
        w = [i.c.id == id.lower(), i.c.status == "koe",
             i.c.fabric_job_id.is_(None) if gammel is None else i.c.fabric_job_id == gammel]
        ny = "reserveret:" + nu().strftime("%Y-%m-%dT%H:%M:%S.") + f"{nu().microsecond // 1000:03d}"
        return self.cn.execute(i.update().where(and_(*w)).values(fabric_job_id=ny)).rowcount == 1

    def bind_importjob(self, id: str, job_id: str | None, log: str | None) -> None:
        i = self.t("Vaerksarkimport")
        v = {"fabric_job_id": job_id}
        if log is not None:
            v["log"] = log
        self.cn.execute(i.update().where(and_(i.c.id == id.lower(), i.c.fabric_job_id.like("reserveret:%"))).values(**v))

    # -------------------------------------------------- arkivet (runde 13/13b; logik/arkiv.py importer_del)
    def arkiv_hent(self, tabel: str, ider) -> list[dict]:
        t = self.t(tabel)
        ud: list[dict] = []
        ider = [i.lower() for i in ider]
        for a in range(0, len(ider), 500):
            ud += self._alle(select(t).where(t.c.id.in_(ider[a:a + 500])))
        return ud

    def arkiv_indsaet(self, tabel: str, raekker: list[dict], kolonner: list[dict]) -> None:
        # K10-F5: en decimal bindes som Decimal af JS' korteste tekst (præcis den værdi, appen læste) — en float ville
        # driveren selv konvertere. sqlite gemmer NUMERIC som double; dér er float det samme.
        if self.db.dialekt != "sqlite":
            from decimal import Decimal
            from .logik import jsjson as J
            dec = [k["navn"] for k in kolonner if k["type"] == "decimal"]
            raekker = [{**r, **{d: (Decimal(J.js_str(r[d])) if r[d] is not None else None) for d in dec}} for r in raekker]
        for a in range(0, len(raekker), 500):
            self._indsaet(tabel, raekker[a:a + 500])

    def arkiv_laas_koersler(self, ider) -> None:
        """K10-F3: en transaktionsejet lås pr. kørsels-id, i den givne (sorterede) orden. sqlite: BEGIN IMMEDIATE har
        allerede serialiseret alle skrivere."""
        d = self.db.dialekt
        for id in ider:
            if d == "postgresql":
                self.cn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": "fjv_arkiv:" + id.lower()})
            elif d == "mssql":
                self.cn.execute(text("EXEC sp_getapplock @Resource = :k, @LockMode = 'Exclusive', "
                                     "@LockOwner = 'Transaction', @LockTimeout = 60000"), {"k": "fjv_arkiv:" + id.lower()})

    def arkiv_boerneside(self, koersel_id: str, tabel: str, fra: int, antal: int) -> list[dict]:
        t = self.t(tabel)
        return self._alle(select(t).where(t.c.koersel_id == koersel_id.lower()).order_by(t.c.id).offset(fra).limit(antal))

    def arkiv_input(self, koersel_id: str) -> list[dict]:
        t = self.t("KoerselInput")
        return self._alle(select(t.c.kilde, t.c.sti, t.c.vaerdi_json).where(t.c.koersel_id == koersel_id.lower()))

    def arkiv_vaerk_historik(self, vaerk_id: str) -> dict:
        v, p, log = self.t("Vaerk"), self.t("VaerkParameter"), self.t("Aendringslog")
        rev = self.cn.execute(select(v.c.revision).where(v.c.id == vaerk_id.lower())).scalar()
        return {"revision": int(rev or 0),
                "blade": self._alle(select(p.c.sti, p.c.vaerdi_json).where(p.c.vaerk_id == vaerk_id.lower())),
                "log": self._alle(select(log.c.revision, log.c.sti, log.c.handling, log.c.gammel_json, log.c.ny_json)
                                  .where(log.c.vaerk_id == vaerk_id.lower()))}

    def arkiv_tidsserier(self, vaerk_id: str) -> list[dict]:
        t = self.t("Tidsserie")
        return self._alle(select(t.c.rolle, t.c.sha256).where(and_(
            t.c.vaerk_id == vaerk_id.lower(), t.c.status == "gyldig", t.c.sha256.is_not(None))))

    def arkiv_tal(self, scenarie_ider: list[str]) -> dict:
        """Rækketal (COUNT) for scenarierne, deres kørsler og værker — Function ``arkivTal``."""
        def tael(tabel, kol, vaerdi):
            t = self.t(tabel)
            return self.cn.execute(select(func.count()).select_from(t).where(t.c[kol] == vaerdi)).scalar()
        s, k = self.t("Scenarie"), self.t("Koersel")
        scen = self._alle(select(s.c.id, s.c.vaerk_id).where(s.c.id.in_(scenarie_ider)))
        koer = self._alle(select(k.c.id, k.c.vaerk_id).where(k.c.scenarie_id.in_(scenarie_ider)))
        vaerker = sorted({str(x["vaerk_id"]).lower() for x in scen + koer})
        return {
            "scenarier": {str(x["id"]).lower(): {"ScenarieAendring": tael("ScenarieAendring", "scenarie_id", x["id"]),
                                                 "Bestilling": tael("Bestilling", "scenarie_id", x["id"]),
                                                 "Koersel": tael("Koersel", "scenarie_id", x["id"])} for x in scen},
            "koersler": {str(x["id"]).lower(): {b: tael(b, "koersel_id", x["id"]) for b in
                                                ("KoerselInput", "KoerselNoegletal", "KoerselMaaned", "KoerselTime")} for x in koer},
            "vaerker": {v: {"Aendringslog": tael("Aendringslog", "vaerk_id", v), "Tidsserie": tael("Tidsserie", "vaerk_id", v)}
                        for v in vaerker},
        }


class SqlBetroetLager:
    """``logik.lager.BetroetLager`` mod en ``database.Database``."""

    def __init__(self, db):
        self.db = db

    @contextmanager
    def transaktion(self):
        with self.db.skriv() as cn:
            yield SqlTransaktion(self.db, cn)

    def ny_id(self) -> str:
        return ny_uuid()


class LokaleFiler:
    """``logik.lager.Filer``: en lokal mappe i stedet for lakehousets ``Files/``. Stierne valideres."""

    def __init__(self, files: Path):
        self.rod = Path(files).resolve()

    def _sti(self, rel: str) -> Path:
        rel = rel[len("Files/"):] if rel.startswith("Files/") else rel
        p = (self.rod / rel).resolve()
        if self.rod not in p.parents:
            raise ValueError(f"stien {rel!r} peger uden for datamappen")
        return p

    def skriv_fil(self, files_relativ: str, data: bytes) -> None:
        p = self._sti(files_relativ)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_name(p.name + f".{os.getpid()}.tmp")
        tmp.write_bytes(data)
        os.replace(tmp, p)

    def laes_tekst(self, files_relativ: str) -> str | None:
        p = self._sti(files_relativ)
        return p.read_text(encoding="utf-8") if p.is_file() else None


def fabrik(db, files: Path):
    """Til fv-port's ``tests/test_tjenester.py`` (``FJV_BETROET_LAGER=fjernvarme_app.betroet_lager:fabrik``)."""
    return SqlBetroetLager(db), LokaleFiler(files)


class Tjenester:
    """fv-port's forløb (``logik.tjenester``) bundet til denne apps lager, filer, arbejder- og importstart."""

    def __init__(self, app):
        from .logik import tjenester as T
        self.T, self.app = T, app
        self.lager, self.filer = SqlBetroetLager(app.db), LokaleFiler(app.files)

    def start_bestilling(self, bestilling_id):
        return self.T.start_bestilling(self.lager, bestilling_id, self.app.motor.start_arbejder)

    def udfoer_aendring(self, anmodning_id):
        return self.T.udfoer_aendring(self.lager, anmodning_id)

    def annuller_koersel(self, koersel_id):
        return self.T.annuller_koersel(self.lager, koersel_id)

    def upload_tidsserie(self, anmodning_id, indhold_base64):
        return self.T.upload_tidsserie(self.lager, self.filer, anmodning_id, indhold_base64)

    def hent_tidsserie(self, tidsserie_id, fra="", til=""):
        return self.T.hent_tidsserie(self.lager, self.filer, tidsserie_id, fra, til)

    def upload_vaerksark(self, anmodning_id, indhold_base64):
        return self.T.upload_vaerksark(self.lager, self.filer, self.app.motor.start_import, anmodning_id,
                                       indhold_base64)

    def hent_kilde_yaml(self, vaerk_id):
        return self.T.hent_kilde_yaml(self.lager, self.filer, vaerk_id)

    def hent_dmi_temperatur(self, omraade, fra, til, kolonne=""):
        # Lokalt hentes df-data først, når den skal bruges (i Fabric har arbejderen altid hentet den).
        from . import lokal_lager as LL
        pins = LL.motor_pins(self.app.db)
        if pins.get("kilde") == "Motor":
            try:
                from fjv import runtime as R
                with _hent_mutex:
                    R.sikr_dfdata(pins["data_commit"])
            except Exception as e:                    # forløbet svarer selv "Ingen DMI-data …"
                print("df-data kunne ikke hentes:", e)
        return self.T.hent_dmi_temperatur(self.lager, self.filer, omraade, fra, til, kolonne)

    def afstem(self):
        return self.T.afstem(self.app.motor.marker_doede, self.app.motor.start_arbejder)

    def arkiv_tal(self, scenarie_ider):
        """Runde 13b (K10-F4): rækketal til eksportens fuldstændighedstjek (``logik.arkiv.arkiv_tal``). Kun læsning."""
        from .logik import arkiv as A
        return A.arkiv_tal(self.lager, scenarie_ider)

    def importer_arkiv(self, anmodning_id, del_):
        """Runde 13: én del af et arkiv (``logik.arkiv.importer_del``, port af Function ``importerArkiv``)."""
        from .logik import arkiv as A
        try:
            return A.importer_del(self.lager, anmodning_id, del_)
        except _unik():
            tekst = "Konflikt: en række med samme nøgle blev skrevet samtidig eller findes allerede. Intet i denne del er gemt; importér igen."
            with self.lager.transaktion() as tx:
                tx.saet_anmodning(anmodning_id, "afvist", tekst)
            return {"ok": False, "status": "afvist", "svar": tekst}
        except Exception as e:                                     # noqa: BLE001
            return {"ok": False, "status": "ny", "svar": self.T.teknisk_fejl("importerArkiv", e) + " Intet i denne del er gemt; prøv igen."}


import threading as _threading  # noqa: E402

_hent_mutex = _threading.Lock()


def tjenester(app) -> Tjenester:
    return Tjenester(app)
