"""Tidsserier i databasen og lakehouset (KONTRAKT §6d) — den betroede skrivevej.

Bruges af ``fjv_importer_vaerker`` (repoets egne datafiler, kilde ``repo``) og
``fjv_importer_vaerksark`` (kilde ``vaerksark``). Appens ``uploadTidsserie`` (kilde
``csv``) skriver samme form fra sin Function.

* Filen skrives **uforanderligt** (``fjv/tidsserier/<kode>/<sha256>.csv``) via en
  midlertidig fil + ``replace``, så en halv fil aldrig får det endelige navn. Findes
  navnet med et andet indhold, er en uforanderlig fil ændret — det er en fejl.
* Rækken er **idempotent** på (værk, rolle, sha256, kilde): en ny import af samme fil
  laver ikke en ny række.
* **Højst én aktiv** pr. værk + rolle: en ny række gøres kun aktiv, hvis ingen anden er.
"""

from __future__ import annotations

import json
from pathlib import Path

from . import datakrav as DK
from . import konstanter as K
from . import modelkoersel as MK
from . import tidsserie as TS


def repo_tidsserier(tekst: str, params, case_fil: str | None = None, readme: str | None = None) -> list[dict]:
    """De datafiler i modelrepoets ``data/``, en casefil bruger.

    * ``units.<navn>.production_profile_path: data/<fil>.csv`` → ``solprofil``. Casen
      læser den selv, så den registreres som **aktiv** (samme værdier, så udfaldet er
      uændret — bevist bitvis med modellens egen læser).
    * ``--heat-csv data/<fil>.csv`` i **modelrepoets egne kommandoer for netop denne case**
      (casens hoved og README's referencetabel, ``fjv.modelkoersel``) → ``varmelast``, ikke
      aktiv. Standardkørslen vælger filen, når modelrepoet kører casen med den (Scenarier,
      runde 8); en aktiv serie ville gælde alle scenarier på værket. Før runde 8 tog et
      regulært udtryk ``--heat-csv`` fra *alle* kommentarer — også en nedarvet kommando for
      en anden casefil — og registrerede ``billund_abvaerk_hourly.csv`` for Spor A og de
      rullende cases, som modelrepoet kører syntetisk eller med ``…_splejset_jun2026.csv``.
      Uden ``case_fil`` registreres ingen varmelast.
    """
    ud, set_ = [], set()
    for p in params:
        sti = p.sti if hasattr(p, "sti") else p["sti"]
        vj = p.vaerdi_json if hasattr(p, "vaerdi_json") else p["vaerdi_json"]
        d = sti.split(".")
        if len(d) == 3 and d[0] == "units" and d[2] == "production_profile_path":
            v = json.loads(vj)
            if isinstance(v, str) and v.startswith("data/") and v.endswith(".csv"):
                k = ("solprofil", v[len("data/"):])
                if k not in set_:
                    set_.add(k)
                    ud.append({"rolle": "solprofil", "fil": k[1], "enhed": d[1], "aktiv": True})
    filer = MK.varmelastfiler(MK.kommandoer(case_fil, tekst, readme)) if case_fil else []
    for fil in filer:
        k = ("varmelast", fil)
        if k not in set_:
            set_.add(k)
            ud.append({"rolle": "varmelast", "fil": k[1], "enhed": None, "aktiv": False})
    return ud


def kompakt_validering(val: dict, maks: int = 4000) -> str:
    """``validering_json`` kompakt. Oraklet har allerede afkortet efter fv-data's regel
    (hullisten først, så info-fund, så beskeder); er den stadig for lang, fejler vi
    højlydt (KONTRAKT §3.0) i stedet for at trunkere."""
    tekst = json.dumps(val, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    if len(tekst) > maks:
        raise ValueError(f"validering_json er {len(tekst)} tegn (maks {maks})")
    return tekst


def gem_tidsseriefil(kode: str, data: bytes, sha: str, files: str | None = None) -> str:
    """Skriv den normaliserede fil uforanderligt; returnér ``Files/...``-stien."""
    if TS.sha256(data) != sha:
        raise ValueError("data passer ikke med sha256")
    rel = TS.lakehouse_rel(kode, sha)
    p = Path(files or K.FILES) / rel
    if p.exists():
        if TS.sha256(p.read_bytes()) != sha:
            raise RuntimeError(f"{rel} findes med andet indhold - en uforanderlig fil er ændret")
    else:
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_name(p.name + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(p)
    return K.lh_sti(rel)


def indsaet_tidsserie(cur, vaerk_id: str, kode: str, rolle: str, navn: str, filnavn: str,
                      res: "DK.Valideret", kilde: str, aktiv: bool, hvem: str,
                      tidsstempel: str = "start", tidszone: str = "UTC",
                      files: str | None = None) -> tuple[str, str]:
    """Én Tidsserie-række i kalderens transaktion. Returnerer (id, udfald)."""
    if res.status == "gyldig":
        cur.execute("SELECT CAST(id AS nvarchar(36)) FROM dbo.Tidsseries WITH (UPDLOCK, HOLDLOCK) "
                    "WHERE vaerk_id=? AND rolle=? AND sha256=? AND kilde=?",
                    vaerk_id, rolle, res.sha256, kilde)
        r = cur.fetchone()
        if r:
            return r[0].lower(), "uaendret"
    if aktiv:
        cur.execute("SELECT COUNT(*) FROM dbo.Tidsseries WITH (UPDLOCK, HOLDLOCK) "
                    "WHERE vaerk_id=? AND rolle=? AND aktiv=1", vaerk_id, rolle)
        aktiv = cur.fetchone()[0] == 0
    gyldig = res.status == "gyldig"
    sti = gem_tidsseriefil(kode, res.data, res.sha256, files) if gyldig else None
    cur.execute("SELECT CAST(NEWID() AS nvarchar(36))")
    tid = cur.fetchone()[0].lower()
    cur.execute(
        "INSERT INTO dbo.Tidsseries (id, vaerk_id, rolle, navn, filnavn, sti, sha256, oploesning, "
        "start, slut, antal_raekker, antal_huller, enhed, tidsstempel, tidszone, kilde, status, "
        "validering_json, aktiv, uploadet_af, uploadet) VALUES (?,?,?,?,?,?,?,?,"
        "CAST(? AS datetime2),CAST(? AS datetime2),?,?,?,?,?,?,?,?,?,?,SYSUTCDATETIME())",
        tid, vaerk_id, rolle, navn[:200], filnavn[:300], sti, res.sha256,
        "1h" if gyldig else None,
        res.start.rstrip("Z") if gyldig else None, res.slut.rstrip("Z") if gyldig else None,
        res.antal_raekker if gyldig else None, res.antal_huller if gyldig else None,
        "MW", tidsstempel, tidszone, kilde, res.status, kompakt_validering(res.validering),
        1 if (aktiv and gyldig) else 0, hvem[:200])
    return tid, "oprettet"


def registrer_repo_tidsserier(db, kode_mappe: Path, fil: Path, files: str | None = None) -> list[dict]:
    """Registrér casefilens egne datafiler som Tidsserie (kilde ``repo``). Én transaktion pr. værk."""
    from .flad import flad
    from .importer import kode_af

    kode = kode_af(fil.name)
    tekst = fil.read_text(encoding="utf-8")
    params = flad(tekst)
    readme = kode_mappe / "README.md"
    filer = repo_tidsserier(tekst, params, fil.name, readme.read_text(encoding="utf-8") if readme.is_file() else None)
    if not filer:
        return []
    import yaml
    case = yaml.safe_load(tekst) or {}
    cn = db.forbind(autocommit=False)
    ud = []
    try:
        cur = cn.cursor()
        cur.execute("SELECT SUSER_SNAME()")
        hvem = (cur.fetchone()[0] or "fjv_importer_vaerker")[:200]
        cur.execute("SELECT CAST(id AS nvarchar(36)) FROM dbo.Vaerks WHERE kode=?", kode)
        v = cur.fetchone()
        if not v:
            cn.rollback()
            return [{"kode": kode, "udfald": "sprunget over", "besked": "værket findes ikke"}]
        vid = v[0].lower()
        for f in filer:
            kilde_sti = kode_mappe / "data" / f["fil"]
            if not kilde_sti.is_file():
                ud.append({"kode": kode, "fil": f["fil"], "udfald": "mangler i repoet"})
                continue
            # Repoets filer er UTC og timens start (modellens egen form, run_case.py:190).
            res = DK.valider(kilde_sti.read_text(encoding="utf-8"), f["rolle"], tidszone="UTC",
                             tidsstempel="start", vaerk=case)
            hvad = "solprofil" if f["rolle"] == "solprofil" else "målt varmelast"
            tid, udfald = indsaet_tidsserie(
                cur, vid, kode, f["rolle"], f"Repo: {hvad} ({f['fil']})", f["fil"], res,
                "repo", f["aktiv"], hvem, files=files)
            ud.append({"kode": kode, "fil": f["fil"], "rolle": f["rolle"], "id": tid,
                       "udfald": udfald, "status": res.status, "sha256": res.sha256,
                       "raekker": res.antal_raekker})
        cn.commit()
        return ud
    except Exception:
        cn.rollback()
        raise
    finally:
        cn.close()
