"""Betroede skrivninger af værker og tidsserier i kalderens transaktion (SQLAlchemy).

Samme form som Fabric-motorens SQL (``fjv.importer._skriv_params``/``_log``, ``fjv.tidsserie_db.indsaet_tidsserie``)
— bruges af demo-importen (repoets cases), værksark-importen og pakke-importen. Reglerne:

* Et nyt værk får revision 1 og én ``opret``-logrække pr. blad (som appens "kopiér værk").
* En tidsserie er idempotent på (værk, rolle, sha256, kilde); filen er uforanderlig
  (``fjv.tidsserie_db.gem_tidsseriefil``); højst én aktiv pr. værk + rolle.
"""

from __future__ import annotations

from sqlalchemy import and_, func, select

from .database import Database
from .typer import nu, ny_uuid


def kode_findes(db: Database, cn, kode: str) -> bool:
    """Findes koden? Rækken læses LÅST (ikke ``count(*) … FOR UPDATE``, som PostgreSQL afviser — K6-F7)."""
    v = db.t("Vaerk")
    return cn.execute(db.laas_raekke(select(v.c.id).where(v.c.kode == kode))).first() is not None


def skriv_blade(db: Database, cn, vaerk_id: str, blade: list[dict], hvem: str) -> None:
    p = db.t("VaerkParameter")
    t = nu()
    rk = [{"id": ny_uuid(), "vaerk_id": vaerk_id, "sti": b["sti"], "vaerdi_json": b["vaerdi_json"],
           "sektion": b.get("sektion") or b["sti"].split(".")[0], "objekt": b.get("objekt"),
           "kommentar": b.get("kommentar"), "bekraeft": bool(b.get("bekraeft")),
           "raekkefoelge": int(b["raekkefoelge"]), "aendret_af": hvem, "aendret": t} for b in blade]
    for i in range(0, len(rk), 500):
        cn.execute(p.insert(), rk[i:i + 500])


def skriv_log(db: Database, cn, vaerk_id: str, revision: int, aendringer: list, hvem: str,
              anmodning_id: str | None = None) -> None:
    """``aendringer``: (sti, handling, gammel_json, ny_json)."""
    lg = db.t("Aendringslog")
    t = nu()
    rk = [{"id": ny_uuid(), "vaerk_id": vaerk_id, "revision": revision, "sti": s, "handling": h,
           "gammel_json": g, "ny_json": n, "aendret_af": hvem, "tidspunkt": t, "anmodning_id": anmodning_id}
          for s, h, g, n in aendringer]
    for i in range(0, len(rk), 500):
        cn.execute(lg.insert(), rk[i:i + 500])


def opret_vaerk(db: Database, cn, *, kode: str, navn: str, beskrivelse: str | None, kilde: str,
                blade: list[dict], hvem: str, kilde_fil: str | None = None, repo_commit: str | None = None,
                kopieret_fra_id: str | None = None, vaerk_id: str | None = None) -> str:
    """Værk (revision 1) + blade + én ``opret``-logrække pr. blad. Kontrollerer antallet bagefter."""
    v, p = db.t("Vaerk"), db.t("VaerkParameter")
    vid = vaerk_id or ny_uuid()
    t = nu()
    cn.execute(v.insert().values(id=vid, kode=kode, navn=navn[:200], beskrivelse=beskrivelse, kilde=kilde,
                                 kilde_fil=kilde_fil, repo_commit=repo_commit, kopieret_fra_id=kopieret_fra_id,
                                 revision=1, arkiveret=False, oprettet_af=hvem, aendret_af=hvem,
                                 oprettet=t, aendret=t))
    skriv_blade(db, cn, vid, blade, hvem)
    skriv_log(db, cn, vid, 1, [(b["sti"], "opret", None, b["vaerdi_json"]) for b in blade], hvem)
    n = cn.execute(select(func.count()).select_from(p).where(p.c.vaerk_id == vid)).scalar()
    if n != len(blade):
        raise RuntimeError(f"Uventet: {n} parametre indsat, {len(blade)} forventet.")
    return vid


def indsaet_tidsserie(db: Database, cn, vaerk_id: str, kode: str, rolle: str, navn: str, filnavn: str,
                      res, kilde: str, aktiv: bool, hvem: str, tidsstempel: str = "start",
                      tidszone: str = "UTC", files: str | None = None) -> tuple[str, str]:
    """Én Tidsserie-række (som ``fjv.tidsserie_db.indsaet_tidsserie``). Returnerer (id, udfald)."""
    from fjv.tidsserie_db import gem_tidsseriefil, kompakt_validering

    ts = db.t("Tidsserie")
    if res.status == "gyldig":
        r = cn.execute(select(ts.c.id).where(and_(ts.c.vaerk_id == vaerk_id, ts.c.rolle == rolle,
                                                  ts.c.sha256 == res.sha256, ts.c.kilde == kilde))).first()
        if r:
            return r.id, "uaendret"
    if aktiv:
        aktiv = cn.execute(select(func.count()).select_from(ts).where(and_(
            ts.c.vaerk_id == vaerk_id, ts.c.rolle == rolle, ts.c.aktiv.is_(True)))).scalar() == 0
    gyldig = res.status == "gyldig"
    sti = gem_tidsseriefil(kode, res.data, res.sha256, files) if gyldig else None
    tid = ny_uuid()
    cn.execute(ts.insert().values(
        id=tid, vaerk_id=vaerk_id, rolle=rolle, navn=navn[:200], filnavn=filnavn[:300], sti=sti,
        sha256=res.sha256, oploesning="1h" if gyldig else None,
        start=res.start if gyldig else None, slut=res.slut if gyldig else None,
        antal_raekker=res.antal_raekker if gyldig else None, antal_huller=res.antal_huller if gyldig else None,
        enhed="MW", tidsstempel=tidsstempel, tidszone=tidszone, kilde=kilde, status=res.status,
        validering_json=kompakt_validering(res.validering), aktiv=bool(aktiv and gyldig),
        uploadet_af=hvem[:200], uploadet=nu()))
    return tid, "oprettet"
