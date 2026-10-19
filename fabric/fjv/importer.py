"""Importér modelrepoets ``cases/*.yaml`` som Vaerk + VaerkParameter (KONTRAKT v2 §5.1).

* Én **transaktion pr. værk**: værk, parametre og revisionsspor skrives sammen
  eller slet ikke.
* **Idempotent**: et værk hvis blade (sti, værdi, kommentar, markør, rækkefølge)
  er uændrede, røres ikke — ingen ny revision, ingen logrækker.
* **Beskyttet**: et værk med ``kilde='app'`` eller ``revision > 1`` (nogen har
  rettet det) overskrives aldrig uden ``overskriv=True``.
* Overskrivning er en ændring som enhver anden: revisionen øges, og hver
  oprettet/rettet/slettet sti logges i ``Aendringslog`` med importøren som
  ``aendret_af``. Første import logger én ``opret`` pr. parameter (revision 1),
  samme form som appens "kopiér værk".
* ``kode`` = filnavnet i små bogstaver (``billund_sporA`` -> ``billund_spora``);
  to filer med samme kode er en fejl, ikke "sidste vinder".
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

from . import konstanter as K
from .flad import FladFejl, flad

_KODE = re.compile(r"^[a-z0-9_]{1,60}$")


def kode_af(filnavn: str) -> str:
    k = Path(filnavn).stem.lower()
    if not _KODE.match(k):
        raise ValueError(f"{filnavn}: koden {k!r} er ikke [a-z0-9_], 1-60 tegn")
    return k


def vaerksfiler(kode_mappe: Path) -> list[Path]:
    filer = sorted(p for p in (kode_mappe / "cases").iterdir()
                   if p.suffix == ".yaml" and not p.name.startswith("heat_load_params"))
    set_: dict[str, str] = {}
    for f in filer:
        k = kode_af(f.name)
        if k in set_:
            raise ValueError(f"kodekollision: {set_[k]} og {f.name} giver begge {k!r}")
        set_[k] = f.name
    return filer


def _meta(tekst: str, kode: str) -> tuple[str, str | None]:
    d = yaml.safe_load(tekst) or {}
    meta = d.get("meta") or {}
    navn = str(meta.get("titel") or meta.get("case_name") or kode)[:200]
    besk = meta.get("description")
    besk = str(besk).strip()[:4000] if besk else None
    return navn, besk


def _sammenlign(gamle: dict, nye: dict) -> list[tuple[str, str, str | None, str | None]]:
    """(sti, handling, gammel_json, ny_json) for alt der er forskelligt."""
    ud = []
    for sti, p in nye.items():
        if sti not in gamle:
            ud.append((sti, "opret", None, p["vaerdi_json"]))
        elif gamle[sti]["vaerdi_json"] != p["vaerdi_json"]:
            ud.append((sti, "ret", gamle[sti]["vaerdi_json"], p["vaerdi_json"]))
    for sti, g in gamle.items():
        if sti not in nye:
            ud.append((sti, "slet", g["vaerdi_json"], None))
    return ud


def _metadata_ens(gamle: dict, nye: dict) -> bool:
    felter = ("kommentar", "bekraeft", "raekkefoelge", "sektion", "objekt")
    return all(all((gamle[s].get(f) or None) == (nye[s].get(f) or None) for f in felter)
               for s in nye if s in gamle)


def gem_kildefil(kode: str, tekst: str, kun_hvis_mangler: bool = False,
                files: str | None = None) -> str:
    """``kilde_<sha12>.yaml`` (uforanderlig) + ``kilde.yaml`` (den appen viser)."""
    import hashlib
    mappe = Path(files or K.FILES) / "fjv" / "vaerker" / kode
    mappe.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha256(tekst.encode("utf-8")).hexdigest()[:12]
    versioneret = mappe / f"kilde_{h}.yaml"
    if not versioneret.exists():
        versioneret.write_text(tekst, encoding="utf-8", newline="\n")
    aktuel = mappe / "kilde.yaml"
    if not (kun_hvis_mangler and aktuel.exists()):
        aktuel.write_text(tekst, encoding="utf-8", newline="\n")
    return versioneret.name


def importer_et(db, fil: Path, model_sha: str, overskriv: bool) -> dict:
    kode = kode_af(fil.name)
    tekst = fil.read_text(encoding="utf-8")
    try:
        params = flad(tekst)
    except FladFejl as e:
        return {"kode": kode, "udfald": "fejl", "besked": f"kan ikke flades: {e}"}
    navn, besk = _meta(tekst, kode)
    nye = {p.sti: {**p.dict(), "bekraeft": bool(p.bekraeft)} for p in params}
    # Kildeteksten gemmes til visning - men FØRST når importen er accepteret
    # (K2-F14): et beskyttet værk må ikke få sin viste kilde erstattet af en
    # import, databasen afviste. Versioneret på indholdets hash, så en gammel
    # revisions kilde ikke overskrives.
    def gem_kilde(kun_hvis_mangler: bool = False) -> str:
        return gem_kildefil(kode, tekst, kun_hvis_mangler)

    cn = db.forbind(autocommit=False)
    try:
        cur = cn.cursor()
        cur.execute("SELECT SUSER_SNAME()")
        hvem = (cur.fetchone()[0] or "fjv_importer_vaerker")[:200]
        cur.execute("SELECT CAST(id AS nvarchar(36)), kilde, revision FROM dbo.Vaerks "
                    "WITH (UPDLOCK, HOLDLOCK) WHERE kode=?", kode)
        v = cur.fetchone()
        if v is None:
            cur.execute("SELECT CAST(NEWID() AS nvarchar(36))")
            vid = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO dbo.Vaerks (id, kode, navn, beskrivelse, kilde, kilde_fil, "
                "repo_commit, revision, arkiveret, oprettet_af, aendret_af, oprettet, aendret) "
                "VALUES (?,?,?,?,'repo',?,?,1,0,?,?,SYSUTCDATETIME(),SYSUTCDATETIME())",
                vid, kode, navn, besk, f"cases/{fil.name}", model_sha, hvem, hvem)
            _skriv_params(cur, vid, list(nye.values()), hvem)
            _log(cur, vid, 1, [(s, "opret", None, p["vaerdi_json"]) for s, p in nye.items()], hvem)
            cn.commit()
            return {"kode": kode, "udfald": "oprettet", "parametre": len(nye), "revision": 1,
                    "kildefil": gem_kilde()}
        vid, kilde_type, rev = v
        cur.execute("SELECT sti, vaerdi_json, kommentar, bekraeft, raekkefoelge, sektion, objekt "
                    "FROM dbo.VaerkParameters WHERE vaerk_id=?", vid)
        kol = [d[0] for d in cur.description]
        gamle = {}
        for r in cur.fetchall():
            d = dict(zip(kol, r))
            d["bekraeft"] = bool(d["bekraeft"])
            if d["sti"] in gamle:
                cn.rollback()
                return {"kode": kode, "udfald": "fejl",
                        "besked": f"værket har stien {d['sti']} to gange i databasen"}
            gamle[d["sti"]] = d
        aendr = _sammenlign(gamle, nye)
        if not aendr and _metadata_ens(gamle, nye):
            cn.rollback()
            return {"kode": kode, "udfald": "uaendret", "parametre": len(nye), "revision": rev,
                    "kildefil": gem_kilde(kun_hvis_mangler=True)}
        if (kilde_type == "app" or rev > 1) and not overskriv:
            cn.rollback()
            return {"kode": kode, "udfald": "beskyttet", "revision": rev, "kilde": kilde_type,
                    "afvigelser": len(aendr),
                    "besked": "rettet i appen (revision > 1 eller kilde=app) - kør med overskriv=True"}
        ny_rev = rev + 1
        cur.execute("DELETE FROM dbo.VaerkParameters WHERE vaerk_id=?", vid)
        _skriv_params(cur, vid, list(nye.values()), hvem)
        _log(cur, vid, ny_rev, aendr, hvem)
        cur.execute("UPDATE dbo.Vaerks SET navn=?, beskrivelse=?, kilde_fil=?, repo_commit=?, "
                    "revision=?, aendret_af=?, aendret=SYSUTCDATETIME() WHERE id=? AND revision=?",
                    navn, besk, f"cases/{fil.name}", model_sha, ny_rev, hvem, vid, rev)
        if cur.rowcount != 1:
            raise RuntimeError(f"{kode}: revisionen ændrede sig under importen")
        cn.commit()
        return {"kode": kode, "udfald": "opdateret", "parametre": len(nye), "revision": ny_rev,
                "kildefil": gem_kilde(),
                "aendringer": len(aendr)}
    except Exception:
        cn.rollback()
        raise
    finally:
        cn.close()


def _skriv_params(cur, vid: str, params: list[dict], hvem: str):
    for i in range(0, len(params), 500):
        bid = [{"s": p["sti"], "v": p["vaerdi_json"], "k": p["sektion"], "o": p.get("objekt"),
                "c": p.get("kommentar"), "b": 1 if p.get("bekraeft") else 0,
                "r": int(p["raekkefoelge"])} for p in params[i:i + 500]]
        cur.execute(
            "INSERT INTO dbo.VaerkParameters (id, vaerk_id, sti, vaerdi_json, sektion, objekt, "
            "kommentar, bekraeft, raekkefoelge, aendret_af, aendret) "
            "SELECT NEWID(), ?, j.s, j.v, j.k, j.o, j.c, j.b, j.r, ?, SYSUTCDATETIME() "
            "FROM OPENJSON(?) WITH (s nvarchar(400) '$.s', v nvarchar(4000) '$.v', "
            "k nvarchar(60) '$.k', o nvarchar(120) '$.o', c nvarchar(2000) '$.c', b bit '$.b', "
            "r int '$.r') j", vid, hvem, json.dumps(bid, ensure_ascii=False))


def _log(cur, vid: str, rev: int, aendr: list, hvem: str):
    for i in range(0, len(aendr), 500):
        bid = [{"s": s, "h": h, "g": g, "n": n} for s, h, g, n in aendr[i:i + 500]]
        cur.execute(
            "INSERT INTO dbo.Aendringslogs (id, vaerk_id, revision, sti, handling, gammel_json, "
            "ny_json, aendret_af, tidspunkt) SELECT NEWID(), ?, ?, j.s, j.h, j.g, j.n, ?, "
            "SYSUTCDATETIME() FROM OPENJSON(?) WITH (s nvarchar(400) '$.s', h nvarchar(5) '$.h', "
            "g nvarchar(4000) '$.g', n nvarchar(4000) '$.n') j",
            vid, rev, hvem, json.dumps(bid, ensure_ascii=False))
