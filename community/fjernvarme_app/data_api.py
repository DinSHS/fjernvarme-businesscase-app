"""Klientens data-adgang (``/api/data/<Entitet>``) med DAB's regler (KONTRAKT §3.0).

Rettighederne kommer fra skemaet (``skema.TabelInfo.ret``), ikke fra koden:

* ``read`` — alle tabeller (klienten må læse alt; betroede felter er stadig kun betroede at SKRIVE).
* ``create`` — kun hvor skemaet siger det; ``policy`` = e-mailfeltet, der skal være sessionens bruger
  (DAB: ``@claims.email eq @item.<felt>``), ``kraev`` = faste værdier (``Aendringsanmodning.status == "ny"``).
* ``update`` — kun hvor skemaet siger det, aldrig ``id`` eller felterne i ``exclude``.
* ``delete`` — kun hvor skemaet siger det.

Værdier valideres mod kolonnen FØR databasen ser dem (længde, sæt, type, påkrævet): sqlite håndhæver hverken
``VARCHAR(n)`` eller ``CHECK`` på en tilføjet kolonne, og tavs trunkering er forbudt (KONTRAKT §3.0).
"""

from __future__ import annotations

import math
import re

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, StatementError

from . import filter as F
from .database import Database, betroet_mutex
from .typer import er_uuid, ny_uuid, til_utc


class Fejl(Exception):
    """En afvist forespørgsel: ``kode`` til adapteren, ``besked`` (dansk) til brugeren."""

    def __init__(self, status: int, kode: str, besked: str):
        super().__init__(besked)
        self.status, self.kode, self.besked = status, kode, besked


def _js_laengde(s: str) -> int:
    """Længde i UTF-16-kodeenheder — som NVARCHAR(n) og JS' ``.length`` tæller."""
    return len(s.encode("utf-16-le")) // 2


def valider_vaerdi(info, kol, v):
    """Én værdi mod kolonnens skema. Returnerer den værdi, der skal bindes."""
    navn, typ = kol.navn, kol.type
    if v is None:
        if not kol.nullable:
            raise Fejl(400, "ugyldig", f"{info.entitet}.{navn} skal have en værdi")
        return None
    if typ == "uuid":
        if not er_uuid(v):
            raise Fejl(400, "ugyldig", f"{info.entitet}.{navn} skal være et uuid")
        return v.lower()
    if typ in ("text", "set"):
        if not isinstance(v, str):
            raise Fejl(400, "ugyldig", f"{info.entitet}.{navn} skal være tekst")
        if kol.max is not None and _js_laengde(v) > kol.max:
            raise Fejl(400, "ugyldig", f"{info.entitet}.{navn} er for lang ({_js_laengde(v)} af højst {kol.max} tegn)")
        if kol.min is not None and _js_laengde(v) < kol.min:
            raise Fejl(400, "ugyldig", f"{info.entitet}.{navn} er for kort (mindst {kol.min} tegn)")
        if kol.moenster and not re.search(kol.moenster, v):
            raise Fejl(400, "ugyldig", f"{info.entitet}.{navn} har ikke den krævede form")
        if typ == "set" and v not in kol.saet:
            raise Fejl(400, "ugyldig", f"{info.entitet}.{navn} skal være en af {', '.join(kol.saet)}")
        return v
    if typ == "boolean":
        if not isinstance(v, bool):
            raise Fejl(400, "ugyldig", f"{info.entitet}.{navn} skal være true eller false")
        return v
    if typ in ("int", "decimal"):
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
            raise Fejl(400, "ugyldig", f"{info.entitet}.{navn} skal være et endeligt tal")
        if typ == "int":
            if float(v) != int(v):
                raise Fejl(400, "ugyldig", f"{info.entitet}.{navn} skal være et heltal")
            return int(v)
        return v
    if typ == "datetime":
        try:
            return til_utc(v)
        except ValueError:
            raise Fejl(400, "ugyldig", f"{info.entitet}.{navn} skal være et ISO-tidspunkt") from None
    raise Fejl(500, "ugyldig", f"ukendt kolonnetype {typ}")


class DataApi:
    def __init__(self, db: Database, skema):
        self.db, self.skema = db, skema

    def _info(self, entitet: str):
        info = self.skema.tabeller.get(entitet)
        if info is None or entitet.startswith("_"):
            raise Fejl(404, "findes_ikke", f"ukendt entitet {entitet!r}")
        return info

    # -------------------------------------------------- læs
    def laes(self, entitet: str, *, filter_=None, orden=None, first=None, after=None, felter=None) -> dict:
        info = self._info(entitet)
        t = self.db.t(info.tabel)
        try:
            with self.db.laes() as cn:
                return F.side(cn, t, filter_=filter_, orden=orden, first=first, after=after, felter=felter)
        except F.Ugyldig as e:
            raise Fejl(400, "ugyldig", str(e)) from None
        except (ValueError, StatementError) as e:   # fx et ugyldigt uuid/tidspunkt i filteret
            orig = getattr(e, "orig", None)
            raise Fejl(400, "ugyldig", str(orig if isinstance(orig, ValueError) else e).split("\n")[0]) from None

    def laes_en(self, entitet: str, id_: str) -> dict:
        if not er_uuid(id_):
            raise Fejl(400, "ugyldig", "ugyldigt id")
        s = self.laes(entitet, filter_={"id": {"eq": id_.lower()}}, first=1)
        if not s["items"]:
            raise Fejl(404, "findes_ikke", f"{entitet} {id_} findes ikke")
        return s["items"][0]

    # -------------------------------------------------- skriv
    def opret(self, entitet: str, raekke: dict, bruger: str) -> dict:
        info = self._info(entitet)
        ret = info.ret.get("create")
        if not ret:
            raise Fejl(403, "ikke_tilladt", f"{entitet} kan ikke oprettes direkte — det sker gennem en anmodning.")
        if not isinstance(raekke, dict):
            raise Fejl(400, "ugyldig", "rækken skal være et objekt")
        ukendte = sorted(set(raekke) - {k.navn for k in info.kolonner})
        if ukendte:
            raise Fejl(400, "ugyldig", f"{entitet} har ingen felter {', '.join(ukendte)}")
        r = dict(raekke)
        if r.get("id") in (None, ""):
            r["id"] = ny_uuid()
        pol = ret.get("policy")
        if pol and r.get(pol) != bruger:
            raise Fejl(403, "policy", "Du kan kun oprette i dit eget navn (sessionens bruger passede ikke).")
        for felt, krav in (ret.get("kraev") or {}).items():
            if r.get(felt) != krav:
                raise Fejl(403, "policy", f"{entitet}.{felt} skal være {krav!r} ved oprettelse.")
        vaerdier = {}
        for k in info.kolonner:
            if k.navn not in r:
                if not k.nullable and k.standard is None:
                    raise Fejl(400, "ugyldig", f"{entitet}.{k.navn} mangler")
                continue
            vaerdier[k.navn] = valider_vaerdi(info, k, r[k.navn])
        t = self.db.t(info.tabel)
        try:
            with betroet_mutex, self.db.skriv() as cn:
                cn.execute(t.insert().values(**vaerdier))
        except IntegrityError:
            raise Fejl(409, "unik", "Findes allerede (samme nøgle).") from None
        return self.laes_en(entitet, vaerdier["id"])

    def opdater(self, entitet: str, id_: str, felter: dict, bruger: str) -> dict:
        info = self._info(entitet)
        ret = info.ret.get("update")
        if not ret:
            raise Fejl(403, "ikke_tilladt", f"{entitet} kan ikke ændres direkte.")
        if not er_uuid(id_):
            raise Fejl(400, "ugyldig", "ugyldigt id")
        if not isinstance(felter, dict) or not felter:
            raise Fejl(400, "ugyldig", "intet at ændre")
        forbudt = {"id", *(ret.get("exclude") or [])}
        kol = {k.navn: k for k in info.kolonner}
        vaerdier = {}
        for navn, v in felter.items():
            if navn not in kol:
                raise Fejl(400, "ugyldig", f"{entitet} har intet felt {navn}")
            if navn in forbudt:
                raise Fejl(403, "ikke_tilladt", f"{entitet}.{navn} kan ikke ændres.")
            vaerdier[navn] = valider_vaerdi(info, kol[navn], v)
        t = self.db.t(info.tabel)
        try:
            with betroet_mutex, self.db.skriv() as cn:
                n = cn.execute(t.update().where(t.c.id == id_.lower()).values(**vaerdier)).rowcount
        except IntegrityError:
            raise Fejl(409, "unik", "Findes allerede (samme nøgle).") from None
        if n != 1:
            raise Fejl(404, "findes_ikke", f"{entitet} {id_} findes ikke")
        return self.laes_en(entitet, id_)

    def slet(self, entitet: str, id_: str, bruger: str) -> dict:
        info = self._info(entitet)
        if not info.ret.get("delete"):
            raise Fejl(403, "ikke_tilladt", f"{entitet} kan ikke slettes (arkivér i stedet).")
        if not er_uuid(id_):
            raise Fejl(400, "ugyldig", "ugyldigt id")
        t = self.db.t(info.tabel)
        with betroet_mutex, self.db.skriv() as cn:
            n = cn.execute(t.delete().where(t.c.id == id_.lower())).rowcount
        if n != 1:
            raise Fejl(404, "findes_ikke", f"{entitet} {id_} findes ikke")
        return {"id": id_.lower()}


def foerste(db: Database, tabel: str, **hvor):
    t = db.t(tabel)
    q = select(t)
    for k, v in hvor.items():
        q = q.where(t.c[k] == v)
    with db.laes() as cn:
        r = cn.execute(q).first()
    return dict(r._mapping) if r else None
