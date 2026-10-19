"""Fælles testopsætning: ÉN datamappe pr. testproces (``fjv.konstanter.FILES`` læses ved import og kan ikke skiftes),
men en ny sqlite-database pr. test."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

HER = Path(__file__).resolve().parent
sys.path.insert(0, str(HER.parent))

ROD = Path(tempfile.mkdtemp(prefix="fjvt_"))

from fjernvarme_app import miljoe  # noqa: E402

miljoe.forbered(ROD)

from fjernvarme_app import cli  # noqa: E402
from fjernvarme_app.database import sqlite_url  # noqa: E402
from fjernvarme_app.typer import nu, ny_uuid  # noqa: E402

_N = [0]
MODELREPO = Path(os.environ.get("FJV_MODELREPO", HER.parent.parent.parent / "fjernvarme-businesscase"))


def ny_app(bruger: str = "test@lokal", **kw):
    _N[0] += 1
    db = ROD / f"db{_N[0]}_{os.getpid()}.sqlite"
    return cli.byg_app(str(ROD), sqlite_url(db), bruger=bruger, start_processer=False, **kw)


def guide_blade() -> list[tuple[str, str]]:
    """Et værk, modellen kan regne på: guidens positive vektor (``k4_guide_vaerker.json`` › default, 67 blade),
    som modellens ``load_case`` har accepteret (app/AGENTS.md › "Nyt værk fra bunden")."""
    import json
    d = json.loads((HER.parent.parent / "app/rayfin/functions/test/vektorer/k4_guide_vaerker.json").read_text(encoding="utf-8"))
    return [(b["sti"], b["vaerdi_json"]) for b in d["vaerker"]["default"]]


def vaerk(app, kode: str = "testvaerk", blade=None, revision: int = 1) -> str:
    """Et værk direkte i databasen (blade = [(sti, vaerdi_json)]; standard: guidens værk)."""
    from fjernvarme_app import vaerksskriv as VS
    blade = blade or guide_blade()
    bl = [{"sti": s, "vaerdi_json": v, "sektion": s.split(".")[0],
           "objekt": s.split(".")[1] if s.split(".")[0] in ("units", "storage") and "." in s else None,
           "kommentar": None, "bekraeft": False, "raekkefoelge": i + 1} for i, (s, v) in enumerate(blade)]
    with app.db.skriv() as cn:
        return VS.opret_vaerk(app.db, cn, kode=kode, navn=kode, beskrivelse=None, kilde="app", blade=bl,
                              hvem="test@lokal")


def koersel(app, status: str = "koe", modtaget=None, **felter) -> str:
    """En Koersel (+ Scenarie + Bestilling) uden input — til køens tests."""
    vid = felter.pop("vaerk_id", None) or vaerk(app, f"v{ny_uuid()[:8]}")
    sid, bid, kid = ny_uuid(), ny_uuid(), ny_uuid()
    t = nu()
    with app.db.skriv() as cn:
        cn.execute(app.db.t("Scenarie").insert().values(id=sid, vaerk_id=vid, navn="s", med_balancering=False,
                                                         arkiveret=False, oprettet_af="test@lokal", oprettet=t))
        cn.execute(app.db.t("Bestilling").insert().values(id=bid, scenarie_id=sid, klient_noegle=bid,
                                                           bestilt_af="test@lokal", bestilt=t))
        cn.execute(app.db.t("Koersel").insert().values(**{
            "id": kid, "bestilling_id": bid, "scenarie_id": sid, "vaerk_id": vid, "vaerk_revision": 1,
            "input_hash": "0" * 64, "status": status, "bestilt_af": "test@lokal", "bestilt": t,
            "modtaget": modtaget or t, "forsoeg": 0, "kilde": "app", **felter}))
    return kid


def ryd():
    shutil.rmtree(ROD, ignore_errors=True)
