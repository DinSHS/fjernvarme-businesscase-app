"""``skema/skema.json`` -> SQLAlchemy-tabeller og klientens rettigheder. Ingen håndskrevet kopi af skemaet.

* Læsning og validering af skemaet sker med fv-skemas eget modul ``skema/fjv_skema.py`` (ét sted).
* Databasen OPRETTES med ``fjv_skema.ddl(dialekt)`` — det samme script, en bruger kører for "bring your own
  SQL" (SKEMA.md). SQLAlchemy-tabellerne her bruges kun til at bygge forespørgsler; de oprettes aldrig med
  ``create_all``, så serverens database og den dokumenterede DDL ikke kan glide fra hinanden.
"""

from __future__ import annotations

import importlib.util
import sys
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import Boolean, Column, Integer, MetaData, String, Table

from .typer import Decimaltal, Heltal, Uuid36, UtcTid

HER = Path(__file__).resolve().parent


def skema_mappe() -> Path:
    for p in (HER / "_ressourcer" / "skema", HER.parent.parent / "skema"):
        if (p / "skema.json").is_file() and (p / "fjv_skema.py").is_file():
            return p
    raise RuntimeError("skema/skema.json findes hverken i pakken eller i repoet.")


def fjv_skema():
    """fv-skemas modul, indlæst efter sti (det er ikke en pakke)."""
    navn = "fjv_skema"
    if navn in sys.modules:
        return sys.modules[navn]
    spec = importlib.util.spec_from_file_location(navn, skema_mappe() / "fjv_skema.py")
    m = importlib.util.module_from_spec(spec)
    sys.modules[navn] = m
    spec.loader.exec_module(m)
    return m


@dataclass
class KolonneInfo:
    navn: str
    type: str
    nullable: bool
    max: int | None = None
    min: int | None = None
    saet: tuple = ()
    moenster: str | None = None
    unik: bool = False
    standard: object = None


@dataclass
class TabelInfo:
    entitet: str
    tabel: str
    kolonner: list[KolonneInfo]
    ret: dict = field(default_factory=dict)


@dataclass
class Skema:
    version: int
    raa: dict
    tabeller: dict[str, TabelInfo]          # entitet -> info
    metadata: MetaData
    konstanter: dict

    @property
    def entiteter(self) -> dict[str, str]:
        return {e: t.tabel for e, t in self.tabeller.items()}


def _sa_type(k: dict):
    typ = k["type"]
    if typ == "uuid":
        return Uuid36()
    if typ in ("text", "set"):
        return String(k.get("max") or max(len(v) for v in k["vaerdier"]))
    if typ == "int":
        return Heltal()
    if typ == "decimal":
        return Decimaltal(k["precision"], k["scale"])
    if typ == "boolean":
        return Boolean(create_constraint=False)
    if typ == "datetime":
        return UtcTid()
    raise ValueError(f"ukendt type {typ}")


def _ret(klient: dict) -> dict:
    """skema.json's ``klient`` -> data_api's form: create{policy, kraev}, update{exclude}, delete."""
    ud: dict = {"read": bool(klient.get("read"))}
    c = klient.get("create")
    if c:
        pol, kraev = None, {}
        for p in (c.get("policy") if isinstance(c, dict) else None) or []:
            if p.get("lig") == "$bruger":
                pol = p["felt"]
            else:
                kraev[p["felt"]] = p["lig"]
        ud["create"] = {"policy": pol, "kraev": kraev}
    u = klient.get("update")
    if u:
        ud["update"] = {"exclude": list(u.get("undtaget") or []) if isinstance(u, dict) else []}
    if klient.get("delete"):
        ud["delete"] = True
    return ud


def laes() -> Skema:
    fs = fjv_skema()
    raa = fs.laes(skema_mappe() / "skema.json")
    md = MetaData()
    tabeller = {}
    for t in raa["tabeller"]:
        Table(t["tabel"], md, *(Column(k["navn"], _sa_type(k), primary_key=bool(k.get("pk")),
                                       nullable=bool(k["nullable"])) for k in t["kolonner"]))
        tabeller[t["entitet"]] = TabelInfo(
            entitet=t["entitet"], tabel=t["tabel"],
            kolonner=[KolonneInfo(navn=k["navn"], type=k["type"], nullable=bool(k["nullable"]), max=k.get("max"),
                                  min=k.get("min"), saet=tuple(k.get("vaerdier") or ()), moenster=k.get("moenster"),
                                  unik=bool(k.get("unik")), standard=k.get("standard"))
                      for k in t["kolonner"]],
            ret=_ret(t.get("klient") or {}))
    Table(fs.SKEMA_TABEL, md, Column("version", Integer, primary_key=True))
    return Skema(version=raa["version"], raa=raa, tabeller=tabeller, metadata=md,
                 konstanter=dict(raa.get("konstanter") or {}))


def ddl(dialekt: str) -> str:
    return fjv_skema().ddl(dialekt)
