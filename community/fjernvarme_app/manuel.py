"""Den manuelle vej (som notebookens ``vaerk_kode``-parameter, ``fjv.db.opret_manuel``): værk + ændringer +
scenariefelter -> Scenarie + Bestilling + Koersel(``koe``) + KoerselInput i ÉN transaktion, kilde ``notebook``.

Samme frysning som Fabric: ``fjv.byg_case.raekker_fra_vaerk`` (model/data-SHA'erne fra Motor fryses i det
hashbeskyttede input), og inputtet afvises med ``byg`` FØR noget skrives. Bruges af ``fjernvarme_app koer`` og
af testene; appens knap "Bestil kørsel" går den betroede vej (``startBestilling``).
"""

from __future__ import annotations

import json

from sqlalchemy import and_, select

from .database import Database
from .typer import nu, ny_uuid


def oploes_tidsserier(db: Database, cn, vaerk_id: str, valg: dict | None, heat_csv: str | None) -> dict:
    """Som ``fjv.db.oploes_tidsserier``: ``""`` = værkets aktive, ``"syntetisk"`` (varmelast) eller et id."""
    from fjv.byg_case import InputFejl
    ts = db.t("Tidsserie")
    valg = dict(valg or {})
    ud: dict = {}
    for rolle in ("varmelast", "solprofil"):
        v = (valg.get(rolle) or "").strip().lower()
        if rolle == "varmelast" and v == "syntetisk":
            ud[rolle] = "syntetisk"
            continue
        if rolle == "varmelast" and heat_csv:
            if v:
                raise InputFejl("varmelasten er valgt både som repo-fil (heat_csv) og som tidsserie")
            continue
        if v:
            r = cn.execute(select(ts.c.id, ts.c.sha256, ts.c.status, ts.c.rolle, ts.c.vaerk_id)
                           .where(ts.c.id == v)).first()
            if not r:
                raise InputFejl(f"tidsserien {v} findes ikke")
            if r.vaerk_id != vaerk_id or r.rolle != rolle:
                raise InputFejl(f"tidsserien {v} er ikke værkets {rolle}")
            if r.status != "gyldig" or not r.sha256:
                raise InputFejl(f"tidsserien {v} er ikke gyldig (status {r.status})")
            ud[rolle] = {"id": r.id, "sha256": r.sha256}
            continue
        aktive = cn.execute(select(ts.c.id, ts.c.sha256).where(and_(
            ts.c.vaerk_id == vaerk_id, ts.c.rolle == rolle, ts.c.aktiv.is_(True), ts.c.status == "gyldig"))).fetchall()
        if len(aktive) > 1:
            raise InputFejl(f"værket har {len(aktive)} aktive {rolle}-tidsserier - højst én må være aktiv")
        if aktive and aktive[0].sha256:
            ud[rolle] = {"id": aktive[0].id, "sha256": aktive[0].sha256}
    return ud


def opret_manuel(db: Database, vaerk_kode: str, scenarie_navn: str, aendringer: list, scenarie: dict,
                 hvem: str) -> str:
    from fjv.byg_case import InputFejl, byg, input_hash, raekker_fra_vaerk

    from . import lokal_lager as LL

    kode = vaerk_kode.strip().lower()
    pins = LL.motor_pins(db)
    scen = dict(scenarie)
    scen.setdefault("model_commit", pins["model_commit"])
    if not scen.get("data_commit"):
        scen["data_commit"] = pins["data_commit"]
    v, p = db.t("Vaerk"), db.t("VaerkParameter")
    with db.skriv() as cn:
        r = cn.execute(db.laas_raekke(select(v.c.id, v.c.revision).where(and_(v.c.kode == kode,
                                                                             v.c.arkiveret.is_(False))))).first()
        if not r:
            raise InputFejl(f"intet aktivt værk med koden {kode!r}")
        vaerk_id, revision = r.id, r.revision
        params = [dict(x._mapping) for x in cn.execute(
            select(p.c.sti, p.c.vaerdi_json, p.c.raekkefoelge).where(p.c.vaerk_id == vaerk_id)).fetchall()]
        scen["tidsserier"] = oploes_tidsserier(db, cn, vaerk_id, scen.get("tidsserie_valg"), scen.get("heat_csv"))
        raekker = raekker_fra_vaerk(params, aendringer, scen)
        byg(raekker)                                     # afvis ugyldigt input FØR noget skrives
        h = input_hash(raekker)
        sid, bid, kid = ny_uuid(), ny_uuid(), ny_uuid()
        t = nu()
        cn.execute(db.t("Scenarie").insert().values(
            id=sid, vaerk_id=vaerk_id, navn=(scenarie_navn or f"Manuel {t:%Y-%m-%d %H:%M} UTC")[:200],
            beskrivelse="Oprettet af fjernvarme_app koer (manuel kørsel).",
            periode_start=scen.get("periode_start"), periode_slut=scen.get("periode_slut"),
            med_balancering=bool(scen.get("med_balancering")), balancing_method=scen.get("balancing_method"),
            mip_rel_gap=scen.get("mip_rel_gap"), mip_abs_gap=scen.get("mip_abs_gap"),
            tidsgraense_s=None if scen.get("tidsgraense_s") is None else int(scen["tidsgraense_s"]),
            ekstra_flag=scen.get("ekstra_flag"), heat_csv=scen.get("heat_csv"), arkiveret=False,
            oprettet_af=hvem, oprettet=t))
        visning = list(aendringer) + [
            {"type": "set", "sti": f"_tidsserie.{rolle}", "vaerdi_json": json.dumps(x.strip().lower())}
            for rolle, x in sorted((scen.get("tidsserie_valg") or {}).items()) if (x or "").strip()]
        for i, a in enumerate(visning):
            cn.execute(db.t("ScenarieAendring").insert().values(
                id=ny_uuid(), scenarie_id=sid, type=a["type"], sti=a["sti"], vaerdi_json=a.get("vaerdi_json"),
                raekkefoelge=i))
        cn.execute(db.t("Bestilling").insert().values(id=bid, scenarie_id=sid, klient_noegle=f"nb-{kid}",
                                                      bestilt_af=hvem, bestilt=t))
        cn.execute(db.t("Koersel").insert().values(
            id=kid, bestilling_id=bid, scenarie_id=sid, vaerk_id=vaerk_id, vaerk_revision=revision, input_hash=h,
            status="koe", fase="I kø", bestilt_af=hvem, bestilt=t, modtaget=t, forsoeg=0, kilde="notebook",
            oensket_rel_gap=scen.get("mip_rel_gap"), oensket_abs_gap=scen.get("mip_abs_gap")))
        cn.execute(db.t("KoerselInput").insert(), [
            {"id": ny_uuid(), "koersel_id": kid, "kilde": x["kilde"], "sti": x["sti"], "vaerdi_json": x["vaerdi_json"]}
            for x in raekker])
    return kid
