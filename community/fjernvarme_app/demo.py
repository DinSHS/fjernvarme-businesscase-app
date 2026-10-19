"""``--demo``: modelrepoets egne cases som værker (samme regler som Fabric's ``fjv_importer_vaerker``).

* Modelrepoet hentes som zip på den pinnede commit (``fjv.runtime.sikr_model``) — eller læses fra en lokal
  kopi (``--modelrepo``), hvis maskinen er uden net. Modellens kode distribueres ikke med appen.
* Hvert ``cases/*.yaml`` (ikke ``heat_load_params_*``) flades til blade og bliver et værk med kilde ``repo``,
  revision 1. Findes koden allerede, røres værket ikke (idempotent; et værk rettet i appen overskrives aldrig).
* Casefilens egne datafiler registreres som tidsserier (kilde ``repo``): solprofilen aktiv (casen læser den
  selv), målte varmelaster IKKE aktive (casene kører med syntetisk varmelast) — præcis som i Fabric.
* Motor-rækken får de pinnede SHA'er, så en bestilling kan fryse dem.
"""

from __future__ import annotations

from pathlib import Path

from .database import Database

HVEM = "fjernvarme_app --demo"


def importer_cases(db: Database, modelrepo: Path | None = None, rap=print) -> list[dict]:
    from fjv import datakrav as DK, konstanter as K, runtime as R
    from fjv.flad import FladFejl, flad
    from fjv.importer import _meta, gem_kildefil, kode_af, vaerksfiler
    from fjv.tidsserie_db import repo_tidsserier
    import yaml

    from . import lokal_lager as LL
    from . import vaerksskriv as VS

    if modelrepo is None:
        rap(f"Henter modelrepoet {K.MODEL_REPO}@{K.MODEL_COMMIT[:7]} (zip) ...")
        mappe, _ = R.sikr_model(K.MODEL_COMMIT)
        sha = K.MODEL_COMMIT
    else:
        mappe, sha = Path(modelrepo), K.MODEL_COMMIT
    ud = []
    for fil in vaerksfiler(mappe):
        kode = kode_af(fil.name)
        tekst = fil.read_text(encoding="utf-8")
        try:
            params = flad(tekst)
        except FladFejl as e:
            ud.append({"kode": kode, "udfald": "fejl", "besked": f"kan ikke flades: {e}"})
            continue
        navn, besk = _meta(tekst, kode)
        with db.skriv() as cn:
            if VS.kode_findes(db, cn, kode):
                ud.append({"kode": kode, "udfald": "findes"})
                continue
            blade = [{**p.dict(), "bekraeft": bool(p.bekraeft)} for p in params]
            vid = VS.opret_vaerk(db, cn, kode=kode, navn=navn, beskrivelse=besk, kilde="repo", blade=blade,
                                 hvem=HVEM, kilde_fil=f"cases/{fil.name}", repo_commit=sha)
            case = yaml.safe_load(tekst) or {}
            ts = []
            for f in repo_tidsserier(tekst, params):
                kilde_sti = mappe / "data" / f["fil"]
                if not kilde_sti.is_file():
                    ts.append({"fil": f["fil"], "udfald": "mangler i repoet"})
                    continue
                res = DK.valider(kilde_sti.read_text(encoding="utf-8"), f["rolle"], tidszone="UTC",
                                 tidsstempel="start", vaerk=case)
                hvad = "solprofil" if f["rolle"] == "solprofil" else "målt varmelast"
                tid, udfald = VS.indsaet_tidsserie(db, cn, vid, kode, f["rolle"], f"Repo: {hvad} ({f['fil']})",
                                                   f["fil"], res, "repo", f["aktiv"], HVEM)
                ts.append({"fil": f["fil"], "rolle": f["rolle"], "status": res.status, "udfald": udfald})
        gem_kildefil(kode, tekst)
        ud.append({"kode": kode, "udfald": "oprettet", "parametre": len(blade), "tidsserier": ts})
        rap(f"  {kode}: {len(blade)} parametre, {len(ts)} tidsserie(r)")
    LL.skriv_motor_pins(db, K.MODEL_COMMIT, K.DF_DATA_SHA)
    return ud
