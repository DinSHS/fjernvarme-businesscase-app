"""Værksark → værk + tidsserier (KONTRAKT v2.3 §6d, notebook ``fjv_importer_vaerksark``).

Modelrepoets ``scripts/vaerksark_til_yaml.py`` køres **uændret** i kørselsmiljøet (samme
venv som solveren: pandas + openpyxl fra modelrepoets ``requirements.txt``) med
output i en midlertidig mappe uden for kodekopien. Bagefter:

* casefilen flades som en import (``flad``), og hver ``units.<sol>.production_profile_path``
  (en sti i den midlertidige mappe) erstattes af markøren ``"tidsserie:solprofil"``;
* varmelasten (``<slug>_abvaerk_hourly.csv``) og solprofilen (målt eller syntetisk)
  normaliseres og gemmes som uforanderlige filer + ``Tidsserie``-rækker (kilde
  ``vaerksark``, **aktive**: det er værkets egne data);
* værk, parametre, revisionsspor (revision 1, kilde ``app``, samme form som appens
  ``opret_vaerk``), tidsserier og importens status skrives i **én** transaktion.

Importen bruger IKKE solver-låsen. Status skifter med betingede UPDATEs
(``koe → koerer → faerdig|fejl``), så to importjobs aldrig tager samme række.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from . import datakrav as DK
from . import konstanter as K
from . import runtime as R
from . import tidsserie as TS
from .flad import FladFejl, flad

_KODE = re.compile(r"^[a-z0-9_]{1,60}$")
#: Appens egne ruter (``RESERVEREDE_KODER`` i appens logik.ts) - et værk må ikke hedde sådan.
RESERVEREDE_KODER = {"nyt"}
MAKS_LOG = 4000
DOED_EFTER_MIN = 120             # en import i koerer så længe efter upload er død (en import tager minutter)


class ArkFejl(ValueError):
    """Arket kan ikke blive til et værk. Beskeden er til brugeren."""


@dataclass
class Konvertering:
    kode: str
    navn: str
    beskrivelse: str | None
    tekst: str                                   # casefilens YAML (til kilde.yaml)
    params: list                                 # flad()-blade, markør indsat
    tidsserier: list = field(default_factory=list)   # [{rolle, navn, filnavn, res, ...}]
    advarsler: list = field(default_factory=list)


# ------------------------------------------------------------------ ressourcegrænser (K5-F3)
#
# En xlsx er en ZIP: Functionens grænse på den KOMPRIMEREDE størrelse (2,5 MB) siger intet
# om, hvad openpyxl/pandas skal folde ud (K5 målte 29 KB -> 8 MiB XML -> 50 MB Python-
# hukommelse). Derfor kontrolleres medlemmerne, før modelscriptet starter, og scriptet
# køres med et hukommelsesloft. Et udfyldt år (Timedata + Solvarme, 8.760 rækker hver)
# fylder målt ~1 MB udpakket med kompressionsforhold ~7 - grænserne giver 16-32 gange luft.
MAKS_MEDLEMMER = 200
MAKS_MEDLEM_BYTES = 16 * 2 ** 20
MAKS_UDPAKKET_BYTES = 32 * 2 ** 20
MAKS_FORHOLD = 100                   # kun for medlemmer over 1 MiB (små filer komprimerer vildt)
HUKOMMELSE_BYTES = 4 * 2 ** 30       # RLIMIT_AS for scriptet (Linux); kernen har 16 GB


def tjek_zip(ark: Path) -> dict:
    """Afvis et værksark, hvis udpakkede størrelse er urimelig - FØR noget læser det.

    Bruger kun ZIP-katalogets oplyste størrelser (intet pakkes ud her). Et katalog, der
    lyver om størrelsen, fanges af hukommelsesloftet på scriptet (``begraens_proces``)."""
    import zipfile
    try:
        with zipfile.ZipFile(ark) as z:
            info = z.infolist()
    except zipfile.BadZipFile as e:
        raise ArkFejl("filen er ikke et Excel-ark (xlsx) - gem arket som .xlsx og upload igen") from e
    if len(info) > MAKS_MEDLEMMER:
        raise ArkFejl(f"arket indeholder {len(info)} interne dele (højst {MAKS_MEDLEMMER}) - "
                      "gem skabelonen igen uden ekstra indhold")
    total = sum(i.file_size for i in info)
    stoerst = max(info, key=lambda i: i.file_size, default=None)
    if stoerst is not None and stoerst.file_size > MAKS_MEDLEM_BYTES:
        raise ArkFejl(f"en del af arket ({stoerst.filename}) fylder {stoerst.file_size / 2**20:.1f} MiB "
                      f"udpakket (højst {MAKS_MEDLEM_BYTES // 2**20} MiB) - arket indeholder mere end "
                      "skabelonens data")
    if total > MAKS_UDPAKKET_BYTES:
        raise ArkFejl(f"arket fylder {total / 2**20:.1f} MiB udpakket (højst "
                      f"{MAKS_UDPAKKET_BYTES // 2**20} MiB)")
    for i in info:
        if i.file_size > 2 ** 20 and i.file_size > MAKS_FORHOLD * max(i.compress_size, 1):
            raise ArkFejl(f"en del af arket ({i.filename}) pakker sig {i.file_size // max(i.compress_size, 1)} "
                          f"gange ud (højst {MAKS_FORHOLD}) - det ligner ikke regnearksdata")
    return {"medlemmer": len(info), "udpakket_bytes": total,
            "stoerste": stoerst.filename if stoerst else None,
            "stoerste_bytes": stoerst.file_size if stoerst else 0}


def begraens_proces():
    """preexec_fn: hukommelsesloft + barnet dør med notebookprocessen (Linux). Ellers None."""
    import sys
    if not sys.platform.startswith("linux"):
        return None
    doed = R.doed_med_foraelder()

    def _saet():
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (HUKOMMELSE_BYTES, HUKOMMELSE_BYTES))
        if doed is not None:
            doed()
    return _saet


def maal_loft() -> dict:
    """Mål loftet, som et barn startet med ``begraens_proces`` faktisk får (K5-F3).

    Står i hvert importjobs rapport: RLIMIT_AS findes kun på Linux, så det er det eneste
    bevis for, at loftet virker i Fabric og ikke kun er sat i koden."""
    import sys
    ud = {"platform": sys.platform, "forventet": HUKOMMELSE_BYTES, "maalt": None}
    if not sys.platform.startswith("linux"):
        return ud
    r = subprocess.run([sys.executable, "-c",
                        "import resource; print(resource.getrlimit(resource.RLIMIT_AS)[0])"],
                       capture_output=True, text=True, timeout=60, preexec_fn=begraens_proces())
    try:
        ud["maalt"] = int(r.stdout.strip())
    except ValueError:
        ud["fejl"] = (r.stderr or r.stdout or "")[-300:]
    return ud


def koer_script(kode: Path, py: str, ark: Path, ud: Path, timeslut: bool,
                timeout_s: float = 900) -> tuple[int, str]:
    """``vaerksark_til_yaml.py`` uændret, cwd = kodekopien, output i ``ud/``, med
    hukommelsesloft og tidsgrænse (K5-F3)."""
    argv = [py, str(kode / "scripts" / "vaerksark_til_yaml.py"), str(ark),
            "--cases-dir", str(ud / "cases"), "--data-dir", str(ud / "data")]
    if timeslut:
        argv.append("--timeslut")
    try:
        r = subprocess.run(argv, cwd=str(kode), env=R.underproces_miljoe(), capture_output=True,
                           text=True, encoding="utf-8", errors="replace", timeout=timeout_s,
                           preexec_fn=begraens_proces())
    except subprocess.TimeoutExpired as e:
        raise ArkFejl(f"konverteringen af arket tog over {timeout_s:.0f} s og blev stoppet") from e
    log = (r.stdout or "") + (("\n" + r.stderr) if r.stderr else "")
    if r.returncode != 0 and "MemoryError" in log:
        raise ArkFejl(f"konverteringen brugte mere end {HUKOMMELSE_BYTES // 2**30} GiB hukommelse og "
                      "blev stoppet - arket indeholder mere end skabelonens data")
    return r.returncode, log


def kildens_tidszone(kode: Path, py: str, ark: Path, fane: str = "Timedata") -> str:
    """Arkets egen erklæring (``<fane>!B2``) læst med scriptets egen funktion (``laes_tidszone(sti, ark)``).
    Solvarme-arket har sin egen B2 (scripts/vaerksark_til_yaml.py læser den for den målte solprofil);
    runde 8 rettede, at den målte solprofil fik Timedata's tidszone som metadata."""
    prog = ("import sys; from pathlib import Path; sys.path.insert(0, 'scripts'); "
            "import vaerksark_til_yaml as v; print(v.laes_tidszone(Path(sys.argv[1]), sys.argv[2]))")
    r = subprocess.run([py, "-c", prog, str(ark), fane], cwd=str(kode), env=R.underproces_miljoe(),
                       capture_output=True, text=True, encoding="utf-8", errors="replace",
                       timeout=120, preexec_fn=begraens_proces())
    linjer = (r.stdout or "").strip().splitlines()
    return linjer[-1][:40] if r.returncode == 0 and linjer else "ukendt"


def fejl_fra_log(log: str, rc: int) -> str:
    """Scriptets egen forklaring ('Arket kan ikke bruges endnu: …' / 'FEJL: …')."""
    m = re.search(r"Arket kan ikke bruges endnu:\s*\n(.+?)(?:\n\s*\n|\Z)", log, re.S)
    if m:
        return "Arket kan ikke bruges endnu: " + " ".join(m.group(1).split())
    for l in reversed([x.strip() for x in log.splitlines() if x.strip()]):
        if l.startswith("FEJL"):
            return l
    hale = [x for x in log.splitlines() if x.strip()][-3:]
    return f"Konverteringen stoppede med kode {rc}: " + " | ".join(hale)


def konverter_output(ud: Path, tidszone: str, timeslut: bool, sol_tidszone: str | None = None) -> Konvertering:
    """Scriptets output → blade (med markør) + normaliserede tidsserier. ``tidszone`` er Timedata-arkets
    erklæring, ``sol_tidszone`` Solvarme-arkets (metadata for en målt solprofil; uden den bruges ``tidszone``)."""
    cases = sorted(p for p in (ud / "cases").iterdir() if p.suffix == ".yaml") \
        if (ud / "cases").is_dir() else []
    if len(cases) != 1:
        raise ArkFejl(f"konverteringen skrev {len(cases)} casefiler (forventet 1)")
    case_fil = cases[0]
    tekst = case_fil.read_text(encoding="utf-8")
    kode = case_fil.stem.lower()
    if not _KODE.match(kode):
        raise ArkFejl(f"værkets kode {kode!r} (fra værkets navn på arket Priser) er ikke "
                      "små bogstaver, cifre og _ (højst 60 tegn)")
    if kode in RESERVEREDE_KODER:
        raise ArkFejl(f"koden {kode!r} er reserveret af appen - giv værket et andet navn på arket Priser")
    try:
        params = flad(tekst)
    except FladFejl as e:
        raise ArkFejl(f"casefilen fra arket kan ikke gemmes som værk: {e}") from e
    d = yaml.safe_load(tekst) or {}
    meta = d.get("meta") or {}
    navn = str(meta.get("titel") or kode)[:200]
    besk = meta.get("description")
    besk = str(besk).strip()[:4000] if besk else None

    k = Konvertering(kode, navn, besk, tekst, params)
    stempel = "slut" if timeslut else "start"
    # Varmelast: scriptets egen fil (findes kun, hvis arket havde timedata).
    varme = ud / "data" / f"{kode}_abvaerk_hourly.csv"
    # Scriptet har allerede omregnet til UTC og timens start (også ved --timeslut), så
    # oraklet får dets output som UTC/start; Tidsserie.tidsstempel/tidszone gemmer,
    # hvad KILDEN (arket) sagde.
    if varme.is_file():
        res = DK.valider(varme.read_text(encoding="utf-8"), "varmelast", tidszone="UTC",
                         tidsstempel="start", kolonne="heat_mw_abvaerk", vaerk=d)
        k.tidsserier.append({"rolle": "varmelast", "navn": f"Værksark: målt varmelast ({navn})"[:200],
                             "filnavn": varme.name, "res": res, "tidsstempel": stempel,
                             "tidszone": tidszone})
    # Solprofil: den sti, scriptet satte på enheden, erstattes af markøren.
    sol = [p for p in params if p.sti.startswith("units.")
           and p.sti.endswith(".production_profile_path")]
    if len(sol) > 1:
        raise ArkFejl(f"arket har {len(sol)} solvarmeenheder med profil; et værk kan i denne "
                      "version kun have én solprofil - læg dem sammen i arket Anlaeg")
    for p in sol:
        enhed = p.sti.split(".")[1]
        sti = Path(json.loads(p.vaerdi_json))
        fil = sti if sti.is_absolute() else ud.parent / sti
        if not fil.is_file():
            fil = ud / "data" / sti.name
        if not fil.is_file():
            raise ArkFejl(f"solprofilen for {enhed} ({sti.name}) blev ikke skrevet")
        res = DK.valider(fil.read_text(encoding="utf-8"), "solprofil", tidszone="UTC",
                         tidsstempel="start", vaerk=d)
        maalt = fil.name.endswith("_maalt.csv")
        k.tidsserier.append({
            "rolle": "solprofil",
            "navn": f"Værksark: {'målt' if maalt else 'syntetisk'} solprofil ({enhed})"[:200],
            "filnavn": fil.name, "res": res, "tidsstempel": stempel if maalt else "start", "maalt": maalt,
            "tidszone": (sol_tidszone or tidszone) if maalt else "UTC"})
        p.vaerdi_json = json.dumps(TS.MARKOER_SOLPROFIL)
    for t in k.tidsserier:
        if t["res"].status != "gyldig":
            raise ArkFejl(f"{t['navn']}: " + "; ".join(t["res"].validering.get("fejl") or []))
        # Runde 8 (V8): en syntetisk solprofil er MODELLENS (scripts/vaerksark_til_yaml.py), ikke brugerens data;
        # oraklets fund ("forskudt en time", "produktion om natten") må ikke lyde som en fejl i arket.
        hvis = "solprofil (modellens syntetiske profil, ikke jeres data)" if t.get("maalt") is False else t["rolle"]
        k.advarsler += [f"{hvis}: {a}" for a in t["res"].validering.get("advarsler") or []]
    return k


def _log_tekst(resume: str, scriptlog: str) -> str:
    hale = scriptlog.strip()
    plads = MAKS_LOG - len(resume) - 10
    if plads <= 0:
        return resume[:MAKS_LOG]
    if len(hale) > plads:
        hale = "..." + hale[-(plads - 3):]
    return f"{resume}\n---\n{hale}"[:MAKS_LOG]


# ------------------------------------------------------------------ databasen

def ryd_doede_importer(db) -> int:
    return db.opdater(
        "UPDATE dbo.Vaerksarkimports SET status='fejl', log=LEFT(CONCAT(N'Importen stoppede uden at "
        "afslutte (jobbet blev afbrudt). Upload arket igen.', CHAR(10), ISNULL(log, N'')), 4000) "
        "WHERE status='koerer' AND uploadet < DATEADD(minute, -?, SYSUTCDATETIME())", DOED_EFTER_MIN)


def tag_import(db, import_id: str | None) -> dict | None:
    """Betinget ``koe → koerer``. ``import_id`` tom = den ældste i kø."""
    from .db import _har_kolonne
    hvor = "id=? AND " if import_id else ""
    params = [import_id] if import_id else []
    ts = (", CAST(inserted.timeslut AS int) timeslut"
          if _har_kolonne(db, "Vaerksarkimports", "timeslut") else "")
    rk = db.alle(
        f";WITH n AS (SELECT TOP 1 * FROM dbo.Vaerksarkimports WITH (UPDLOCK, READPAST, ROWLOCK) "
        f"WHERE {hvor}status='koe' ORDER BY uploadet, id) "
        "UPDATE n SET status='koerer', log=N'Importerer arket ...' "
        "OUTPUT CAST(inserted.id AS nvarchar(36)) id, inserted.filnavn, inserted.sti, "
        f"inserted.uploadet_af{ts}", *params)
    if not rk:
        return None
    r = rk[0]
    r["id"] = r["id"].lower()
    return r


def saet_fejl(db, import_id: str, besked: str) -> bool:
    return db.opdater("UPDATE dbo.Vaerksarkimports SET status='fejl', log=? "
                      "WHERE id=? AND status='koerer'", besked[:MAKS_LOG], import_id) == 1


def gem_vaerk(db, imp: dict, k: Konvertering, model_sha: str, scriptlog: str,
              files: str | None = None) -> dict:
    """Værk + parametre + log + tidsserier + importens status i ÉN transaktion."""
    from .importer import _log, _skriv_params, gem_kildefil
    from .tidsserie_db import indsaet_tidsserie

    hvem = (imp.get("uploadet_af") or "fjv_importer_vaerksark")[:200]
    cn = db.forbind(autocommit=False)
    try:
        cur = cn.cursor()
        cur.execute("SELECT status FROM dbo.Vaerksarkimports WITH (UPDLOCK, HOLDLOCK) WHERE id=?",
                    imp["id"])
        r = cur.fetchone()
        if not r or r[0] != "koerer":
            raise ArkFejl(f"importen er ikke længere i gang (status {r[0] if r else None})")
        cur.execute("SELECT COUNT(*) FROM dbo.Vaerks WITH (UPDLOCK, HOLDLOCK) WHERE kode=?", k.kode)
        if cur.fetchone()[0]:
            raise ArkFejl(f"der findes allerede et værk med koden {k.kode!r} - giv værket et andet "
                          "navn på arket Priser (feltet 'værkets navn'), eller kopiér det eksisterende")
        cur.execute("SELECT CAST(NEWID() AS nvarchar(36))")
        vid = cur.fetchone()[0].lower()
        cur.execute(
            "INSERT INTO dbo.Vaerks (id, kode, navn, beskrivelse, kilde, kilde_fil, repo_commit, "
            "revision, arkiveret, oprettet_af, aendret_af, oprettet, aendret) "
            "VALUES (?,?,?,?,'app',?,?,1,0,?,?,SYSUTCDATETIME(),SYSUTCDATETIME())",
            vid, k.kode, k.navn, k.beskrivelse, f"vaerksark:{imp.get('filnavn') or ''}"[:300],
            model_sha, hvem, hvem)
        blade = [{**p.dict(), "bekraeft": bool(p.bekraeft)} for p in k.params]
        _skriv_params(cur, vid, blade, hvem)
        _log(cur, vid, 1, [(b["sti"], "opret", None, b["vaerdi_json"]) for b in blade], hvem)
        cur.execute("SELECT COUNT(*) FROM dbo.VaerkParameters WHERE vaerk_id=?", vid)
        if cur.fetchone()[0] != len(blade):
            raise RuntimeError("antal parametre passer ikke efter indsættelse")
        ts_ud = []
        for t in k.tidsserier:
            tid, udfald = indsaet_tidsserie(cur, vid, k.kode, t["rolle"], t["navn"], t["filnavn"],
                                            t["res"], "vaerksark", True, hvem,
                                            tidsstempel=t["tidsstempel"], tidszone=t["tidszone"],
                                            files=files)
            ts_ud.append({"rolle": t["rolle"], "id": tid, "sha256": t["res"].sha256,
                          "raekker": t["res"].antal_raekker, "start": t["res"].start,
                          "slut": t["res"].slut})
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
        cur.execute("UPDATE dbo.Vaerksarkimports SET status='faerdig', vaerk_id=?, tidsserie_id=?, "
                    "log=? WHERE id=? AND status='koerer'", vid, varme or sol, log, imp["id"])
        if cur.rowcount != 1:
            raise ArkFejl("importens status blev ændret under importen")
        cn.commit()
    except Exception:
        cn.rollback()
        raise
    finally:
        cn.close()
    try:
        gem_kildefil(k.kode, k.tekst, files=files)
    except Exception as e:                     # visning; værket er gemt
        k.advarsler.append(f"kilde.yaml kunne ikke gemmes: {e}")
    return {"vaerk_id": vid, "kode": k.kode, "parametre": len(blade), "tidsserier": ts_ud,
            "log": log}


class SqlImportLager:
    """``lager.ImportLager`` mod appens Fabric SQL-database.

    Kalder modulets funktioner ved navn på kaldstidspunktet, så Fabric-adfærden er den
    samme som før lager-grænsefladen (og testenes udskiftninger stadig virker)."""

    def __init__(self, db):
        self.db = db

    def ryd_doede_importer(self) -> int:
        return ryd_doede_importer(self.db)

    def tag_import(self, import_id: str | None) -> dict | None:
        return tag_import(self.db, import_id)

    def saet_fejl(self, import_id: str, besked: str) -> bool:
        return saet_fejl(self.db, import_id, besked)

    def gem_vaerk(self, imp: dict, k, model_sha: str, scriptlog: str,
                  files: str | None = None) -> dict:
        return gem_vaerk(self.db, imp, k, model_sha, scriptlog, files=files)

    def motor_pins(self) -> dict:
        from . import db as DB
        return DB.motor_pins(self.db)


def som_import_lager(x):
    """En ``ImportLager`` som den er; alt andet (en ``db.Db``) pakkes i ``SqlImportLager``."""
    return x if hasattr(x, "gem_vaerk") and hasattr(x, "tag_import") else SqlImportLager(x)


def importer_et(db, imp: dict, model_sha: str, timeslut: bool, rap,
                files: str | None = None) -> dict:
    """Hele forløbet for én overtaget import. Rejser aldrig for en arkfejl (den bliver ``fejl``).

    ``db`` er en ``lager.ImportLager`` (eller en ``db.Db``, der pakkes)."""
    lager = som_import_lager(db)
    files = files or K.FILES
    arbejde = Path(tempfile.gettempdir()) / "fjv_vaerksark" / imp["id"]
    shutil.rmtree(arbejde, ignore_errors=True)
    arbejde.mkdir(parents=True)
    t0 = time.time()
    try:
        sti = imp.get("sti") or K.lh_sti("fjv", "uploads", f"{imp['id']}.xlsx")
        kilde = Path(files) / (sti[len("Files/"):] if sti.startswith("Files/") else sti)
        if not kilde.is_file():
            raise ArkFejl(f"den uploadede fil findes ikke i lakehouset ({sti}) - upload arket igen")
        ark = arbejde / "ark.xlsx"
        shutil.copyfile(kilde, ark)
        rap.trin("ark", {"sti": sti, "bytes": ark.stat().st_size, "zip": tjek_zip(ark)})
        kode_lh, _ = R.sikr_model(model_sha)
        kode = R.lokal_kodekopi(kode_lh, arbejde / "kode")
        miljoelog: list = []
        py = R.byg_miljoe(kode / "requirements.txt", Path(tempfile.gettempdir()) / "fjv_venv",
                          miljoelog)
        rc, log = koer_script(kode, py, ark, arbejde / "ud", timeslut)
        (arbejde / "log.txt").write_text(log, encoding="utf-8")
        rap.trin("script", {"rc": rc, "log_hale": log[-1500:]})
        if rc != 0:
            raise ArkFejl(fejl_fra_log(log, rc))
        tz = kildens_tidszone(kode, py, ark)
        k = konverter_output(arbejde / "ud", tz, timeslut, kildens_tidszone(kode, py, ark, "Solvarme"))
        res = lager.gem_vaerk(imp, k, model_sha, log, files=files)
        res.update(status="faerdig", sekunder=round(time.time() - t0, 1), advarsler=k.advarsler)
        rap.trin("faerdig", {x: res[x] for x in ("vaerk_id", "kode", "parametre", "tidsserier")})
        return res
    except ArkFejl as e:
        besked = str(e)
    except Exception as e:                      # motorfejl, ikke en arkfejl
        besked = f"Importen fejlede ({type(e).__name__}): {e}"
        rap.fejl(e)
    try:
        log = (arbejde / "log.txt").read_text(encoding="utf-8") if (arbejde / "log.txt").exists() else ""
    except OSError:
        log = ""
    lager.saet_fejl(imp["id"], _log_tekst(besked, log))
    rap.trin("fejl", besked)
    return {"status": "fejl", "besked": besked, "sekunder": round(time.time() - t0, 1)}


def koer_notebook(konfig: dict, rap, *, import_id: str = "", timeslut: bool = False,
                  maks: int = 10) -> dict:
    """Notebookens indgang: tag ``import_id`` (eller alle i kø, FIFO) og importér dem."""
    from .db import Db
    return koer_importer(SqlImportLager(Db(konfig)), rap, import_id=import_id,
                         timeslut=timeslut, maks=maks)


def koer_importer(lager, rap, *, import_id: str = "", timeslut: bool = False,
                  maks: int = 10) -> dict:
    """Importjobbet mod en vilkårlig ``lager.ImportLager`` (Fabric eller lokalt)."""
    rap.trin("hukommelsesloft", maal_loft())
    doede = lager.ryd_doede_importer()
    if doede:
        rap.trin("ryddet_doede", doede)
    pins = lager.motor_pins()
    ud = {"importer": [], "ok": True, "model_commit": pins["model_commit"]}
    # Først den bestilte import (hvis angivet), derefter RESTEN af køen (K5-F4): en import,
    # hvis jobstart fejlede (fx HTTP 429), står i 'koe' uden at noget job tager den. Hvert
    # job tømmer derfor køen, så den næste upload - eller en genstart fra appen - også tager
    # de strandede. Den betingede overtagelse (koe -> koerer) sikrer, at to samtidige jobs
    # aldrig tager samme række.
    oensket = import_id.strip().lower() or None
    for _ in range(maks):
        imp = lager.tag_import(oensket)
        if imp is None and oensket:
            if not ud["importer"]:
                rap.advar(f"importen {import_id} står ikke i 'koe' (allerede taget eller kørt)")
            oensket = None
            imp = lager.tag_import(None)
        if imp is None:
            break
        oensket = None
        rap.trin("import", {"id": imp["id"], "filnavn": imp.get("filnavn")})
        # Brugerens valg på rækken (Vaerksarkimport.timeslut) eller notebookens parameter.
        r = importer_et(lager, imp, pins["model_commit"], bool(timeslut or imp.get("timeslut")), rap)
        ud["importer"].append({"id": imp["id"], **{k: r.get(k) for k in
                                                  ("status", "kode", "vaerk_id", "besked", "sekunder")}})
    # 'fejl' i en import er brugerens ark, ikke notebookens fejl: jobbet er ok, hvis
    # hver import endte i en sluttilstand med en forklaring.
    ud["ok"] = all(i["status"] in ("faerdig", "fejl") for i in ud["importer"])
    return ud
