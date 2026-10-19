"""Én kørsel fra frosset input til publicerede resultater (KONTRAKT v2 §5.2-5.3, §6).

``koer_en(raekker, koersel_id, lager, rap)`` er hele forløbet. Databasen er
abstraheret som ``Lager`` (``db.SqlLager`` i Fabric, ``IngenLager`` til den
manuelle vej uden database), så tilstandsmaskinen er ét sted og kan testes.

Rækkefølgen er bindende:

1. Kørslen er overtaget (``koe|startet -> koerer``, betinget UPDATE) af
   kø-arbejderen i ``db.py`` FØR ``koer_en`` kaldes.
2. Hjerteslag fra en baggrundstråd hvert minut, også mens HiGHS løser.
3. Model og data hentes på de FULDE SHA'er fra bestillingen (eller de pinnede),
   og zip-arkivets sha256 registreres — manifestets korte ``git rev-parse`` er
   ``ukendt`` fra en zip og bruges ikke (K1-F15).
4. ``case.yaml`` er den effektive case; argv gemmes som liste og køres uden shell.
5. ``indlaeser``: resultater udtrækkes og valideres, publiceres i én transaktion,
   og først derefter ``faerdig``. Er kørslen ``annulleret`` imens, publiceres intet.
"""

from __future__ import annotations

import json
import re
import shutil
import tempfile
import threading
import time
from pathlib import Path

from . import konstanter as K
from . import resultater as RES
from . import runtime as R
from . import datakrav as DK
from . import tidsserie as TS
from .byg_case import InputFejl, byg, input_hash

MOTOR_VERSION = "1"
_FASER = [
    ("Indlæser case", "Indlæser case"),
    ("Henter data", "Henter df-data"),
    ("Genererer dummy", "Genererer dummy-data"),
    ("Bygger model", "Bygger model"),
    ("Løser med", "Løser MILP"),
    ("Trin 2", "Løser trin 2 (ex post-afregning)"),
    ("=== KPI", "Skriver modellens output"),
]
_UNDTAGELSE = re.compile(r"^([A-Za-z_][\w.]*(?:Error|Exception)): (.+)$")


class Afbrudt(RuntimeError):
    """Kørslen blev annulleret eller overtaget af en anden — publicér intet."""


class IngenLager:
    """Ingen database: alt ender i rapporten. Bruges af den manuelle vej før DB findes."""

    def __init__(self):
        self.status = "koerer"          # "overtaget" - der er ingen kø uden database
        self.felter: dict = {}
        self.publiceret: dict | None = None
        self.annulleret = False
        self.stop = False

    def skift(self, fra: str, til: str, **felter) -> bool:
        if self.status != fra:
            return False
        self.status = til
        self.felter.update(felter)
        return True

    def saet(self, **felter):
        self.felter.update(felter)

    def hjerteslag(self):
        self.felter["hjerteslag"] = R.nu_utc()

    def er_annulleret(self) -> bool:
        return self.status == "annulleret"

    def publicer(self, noegletal, maaneder, timer, slutfelter=None):
        self.felter.update(slutfelter or {})
        self.publiceret = {"noegletal": len(noegletal), "maaneder": len(maaneder),
                           "timer": len(timer)}
        return self.publiceret


def fejlbesked_fra_log(log: str, rc: int) -> str:
    """Læsbar fejl: modellens egen 'FEJL i casen …' eller sidste undtagelseslinje."""
    linjer = [l.rstrip() for l in log.splitlines() if l.strip()]
    for l in reversed(linjer):
        if l.startswith("FEJL"):
            return l[:3900]
    for l in reversed(linjer):
        m = _UNDTAGELSE.match(l.strip())
        if m:
            navn, tekst = m.group(1).split(".")[-1], m.group(2)
            hint = {
                "CoverageError": " (df-data dækker ikke hele perioden - vælg en anden "
                                 "periode eller en nyere data-SHA)",
            }.get(navn, "")
            return f"{navn}: {tekst}{hint}"[:3900]
    if "infeasible" in log.lower():
        return "Modellen er uløselig (infeasible) med disse indstillinger."
    return f"run_case.py stoppede med kode {rc} uden en læsbar fejl - se log.txt"


def _solverlog(log: str) -> str:
    """HiGHS' egne linjer (til ``solver.log``): fra 'Running HiGHS' til rapportens slut."""
    ud, med, i_rapport = [], False, False
    for l in log.splitlines():
        if l.startswith("Running HiGHS"):
            med = True
        if not med:
            continue
        ud.append(l)
        if l.startswith("Solving report"):
            i_rapport = True
        elif i_rapport and not l.strip():
            med = i_rapport = False
    return "\n".join(ud)


class _Hjerte(threading.Thread):
    def __init__(self, lager, interval_s: float = 60.0):
        super().__init__(daemon=True)
        self.lager, self.interval_s = lager, interval_s
        self.stop = threading.Event()
        self.stop_proces = threading.Event()     # sat ved annullering -> solveren dræbes
        self.fejl: list[str] = []

    def run(self):
        t0 = time.time()
        doed_efter = float(getattr(self.lager, "test_doed_efter_s", 0) or 0)
        while not self.stop.wait(self.interval_s):
            if doed_efter and time.time() - t0 >= doed_efter:
                # KUN live-test af §6c ("dræb et job midt i en kørsel"): jobs-API'ets
                # cancel stopper IKKE en Python-notebooks proces (målt 2026-10-16), så
                # en rigtig procesdød fremkaldes her. SQL-sessionen dør med processen,
                # og fjv_solver-låsen frigives af SQL Server.
                import os
                os._exit(3)
            try:
                self.lager.hjerteslag()
                # Annullering ELLER tabt ejerskab (§6c): solveren skal stoppe.
                if getattr(self.lager, "stop", False) or getattr(self.lager, "annulleret", False):
                    self.stop_proces.set()
            except Exception as fejl:            # et tabt hjerteslag stopper ikke solveren
                self.fejl.append(f"{type(fejl).__name__}: {fejl}"[:300])


def koer_en(raekker: list[dict], koersel_id: str, lager, rap, *,
            forventet_hash: str | None = None, timeout_s: float = 4 * 3600,
            hjerte_s: float = 60.0) -> dict:
    """Kør én kørsel. Returnerer et resumé; rejser aldrig for en modelfejl (den
    bliver til status ``fejl``), men rejser ``Afbrudt`` hvis en anden tog over."""
    resume: dict = {"koersel_id": koersel_id, "motor_version": MOTOR_VERSION}
    rap["koersel"] = resume
    arbejde = Path(tempfile.gettempdir()) / "fjv_koer" / koersel_id
    lh_mappe = Path(K.FILES) / K.REL_KOERSLER / koersel_id
    hjerte = _Hjerte(lager, hjerte_s)

    def fase(tekst):
        if resume.get("fase") != tekst:
            resume["fase"] = tekst
            rap["db_log"] = getattr(lager, "log", lambda: None)()
            rap.trin("fase", tekst)          # FØR databasen: hænger kaldet, ses fasen
            lager.saet(fase=tekst)

    def fejl(besked: str, fra: str):
        resume["fejlbesked"] = besked
        if not lager.skift(fra, "fejl", fejlbesked=besked[:4000], afsluttet=R.nu_utc()):
            raise Afbrudt(f"kunne ikke sætte fejl fra {fra} (status ændret af en anden)")
        rap.trin("fejl", besked)
        resume["status"] = "fejl"
        return resume

    # Kørslen er allerede overtaget (status 'koerer', arbejder_id = os) af
    # kø-arbejderen med en betinget UPDATE - se db.overtag_*.
    if lager.er_annulleret():
        raise Afbrudt("annulleret før start")
    hjerte.start()
    # Tabt låse-forbindelse skal dræbe solveren STRAKS, ikke ved næste hjerteslag (K3-N1).
    laas = getattr(lager, "laas", None)
    if laas is not None:
        laas.ved_tab(hjerte.stop_proces.set)
    try:
        # --- 1. input ------------------------------------------------------
        fase("Kontrollerer input")
        h = input_hash(raekker)
        resume["input_hash"] = h
        if forventet_hash and h != forventet_hash:
            return fejl(f"input_hash passer ikke: beregnet {h}, bestilt {forventet_hash}. "
                        "Det frosne input er ændret efter bestillingen.", "koerer")
        try:
            plan = byg(raekker)
        except InputFejl as e:
            return fejl(f"Ugyldigt input: {e}", "koerer")

        # --- 2. kode, data, miljø -----------------------------------------
        fase("Henter modelkode og df-data")
        # De frosne SHA'er fra det hashbeskyttede input (§6c). Mangler de (ældre
        # bestillinger), bruges de pinnede - synligt, så det ikke sker i stilhed.
        # §6c: de frosne SHA'er fra det hashbeskyttede input SKAL være der - ellers
        # kunne en ændret pin mellem bestilling og kørsel ændre datagrundlaget uden
        # at ændre hashen (K2-F8). Fejl i den sikre retning.
        if not plan.model_commit or not plan.data_commit:
            return fejl("Input mangler frosne model- og data-SHA'er (_koersel.model_commit/"
                        "_koersel.data_commit). Bestil kørslen igen.", "koerer")
        model_sha, data_sha = plan.model_commit, plan.data_commit
        kode_lh, kode_info = R.sikr_model(model_sha)
        df_lh, df_info = R.sikr_dfdata(data_sha)
        if arbejde.exists():
            shutil.rmtree(arbejde)
        kode = R.lokal_kodekopi(kode_lh, arbejde / "kode")
        # §6d: værkets frosne tidsserier hentes, hash-verificeres og lægges i kodekopiens
        # data/ på det navn, byg_case har givet dem - FØR den anden byg kontrollerer dem.
        resume["tidsserier"] = {}
        if plan.tidsserier:
            resume["regler"] = DK.kilder()           # hvilke datakrav-regler kørte
        for rolle, ref in sorted(plan.tidsserier.items()):
            fase(f"Henter tidsserie ({rolle})")
            besked = hent_tidsserie(lager, rolle, ref, kode / "data")
            if isinstance(besked, str):
                return fejl(besked, "koerer")
            # Dækker serien kørslens timer (og kan værket levere den)? fv-data's
            # kørselsregler med de eksakte punkter - samme regler som ved bestillingen,
            # men her på den effektive case og den fil, der faktisk køres på.
            punkter = besked.pop("punkter")
            fund = DK.tjek_koersel(TS.tid_tekst(punkter[0][0]), TS.tid_tekst(punkter[-1][0]),
                                   rolle, plan.periode[0], plan.periode[1], punkter, plan.case)
            besked["fund"] = [f["kode"] for f in fund]
            resume["tidsserier"][rolle] = besked
            stop = [f["besked"] for f in fund if f["niveau"] == "fejl"]
            if stop:
                return fejl(f"Tidsserien til {rolle} kan ikke bruges i denne kørsel: "
                            + " ".join(stop), "koerer")
            for f in fund:
                if f["niveau"] == "advarsel":
                    rap.advar(f"{rolle}: {f['besked']}")
        try:
            plan = byg(raekker, heat_csv_rod=kode / "data")   # nu med heat_csv-hvidliste
        except InputFejl as e:
            return fejl(f"Ugyldigt input: {e}", "koerer")
        fase("Installerer Python-pakker")
        miljoelog: list = []
        py = R.byg_miljoe(kode / "requirements.txt", Path(tempfile.gettempdir()) / "fjv_venv",
                          miljoelog)
        pakker = R.pakkeversioner(py, ["linopy", "highspy", "xarray", "pandas", "numpy",
                                       "scipy", "netCDF4", "PyYAML"])
        # venv'en er bygget af kernens egen python, så versionen er den samme.
        miljoe = {"python": R.maal_runtime()["python"],
                  "pakker": pakker, "motor_version": MOTOR_VERSION,
                  "model_zip_sha256": kode_info.get("zip_sha256"),
                  "data_zip_sha256": df_info.get("zip_sha256")}
        # Ønsket tolerance = den effektive i case.yaml (ellers modellens standard,
        # src/config.py SolverConfig: 0,005 / 5000 DKK). Opnået gab kommer fra HiGHS.
        solver = plan.case.get("solver") or {}
        lager.saet(model_commit=model_sha, data_commit=data_sha,
                   oensket_rel_gap=float(solver.get("mip_rel_gap", 0.005)),
                   oensket_abs_gap=float(solver.get("mip_abs_gap", 5000.0)),
                   miljoe_json=json.dumps(miljoe, separators=(",", ":"))[:4000])
        resume.update(model_commit=model_sha, data_commit=data_sha, miljoe=miljoe)

        # --- 3. case.yaml + argv ------------------------------------------
        ud = arbejde / "ud"
        ud.mkdir(parents=True)
        # Hvilke frosne tidsserier kørslen faktisk BRUGTE (K5-F12) - publiceres i
        # manifest_json.tidsserier, så visningen ikke skal gætte ud fra det frosne input.
        brug = tidsserie_brug(plan)
        (ud / "fjv_tidsserier.json").write_text(json.dumps(brug, ensure_ascii=False, indent=1),
                                                encoding="utf-8")
        resume["tidsserier_brug"] = brug
        case_sti = arbejde / "case.yaml"
        case_sti.write_text(plan.case_yaml, encoding="utf-8", newline="\n")
        wrapper = Path(__file__).with_name("model_wrapper.py")
        argv = [py, str(wrapper), str(kode), str(case_sti), *plan.cli,
                "--df-data-cache", str(df_lh), "--out-dir", str(ud)]
        (arbejde / "argv.json").write_text(json.dumps(argv, indent=1), encoding="utf-8")
        (arbejde / "input.json").write_text(
            json.dumps({"koersel_id": koersel_id, "input_hash": h, "raekker": raekker},
                       ensure_ascii=False, indent=1), encoding="utf-8")
        resume["argv"] = argv[3:]

        # --- 4. kør ---------------------------------------------------------
        fase("Kører modellen")

        def ved_linje(l: str):
            for noegle, tekst in _FASER:
                if noegle in l:
                    fase(tekst)

        t0 = time.time()
        rc = R.koer_proces(argv, kode, arbejde / "log.txt", timeout_s, ved_linje,
                           stop=hjerte.stop_proces)
        resume["rc"] = rc
        resume["koeretid_s"] = round(time.time() - t0, 1)
        log = (arbejde / "log.txt").read_text(encoding="utf-8", errors="replace")
        (arbejde / "solver.log").write_text(_solverlog(log), encoding="utf-8")
        _kopier(arbejde, ud, lh_mappe)
        lager.saet(case_sti=K.lh_sti(K.REL_KOERSLER, koersel_id, "case.yaml"),
                   output_sti=K.lh_sti(K.REL_KOERSLER, koersel_id))
        if lager.er_annulleret():
            raise Afbrudt("annulleret under kørslen - publicerer intet")
        if rc != 0:
            return fejl(fejlbesked_fra_log(log, rc), "koerer")

        # --- 5. indlæs + publicér ------------------------------------------
        if not lager.skift("koerer", "indlaeser"):
            raise Afbrudt("status ændret under kørslen - publicerer intet")
        fase("Indlæser resultater")
        try:
            out = RES.Output(ud)
            reg = RES.register()
            highs = RES.parse_highs(log)
            felter = RES.koersel_felter(out, highs)
            nt, mn, tm = RES.noegletal(out, reg), RES.maaneder(out, reg), RES.timer(out, reg)
        except RES.ResultatFejl as e:
            return fejl(f"Resultaterne kunne ikke læses: {e}", "indlaeser")
        felter["antal_interval_csv"] = len(tm)
        resume.update({k: v for k, v in felter.items() if k != "manifest_json"},
                      highs=highs, antal={"noegletal": len(nt), "maaneder": len(mn),
                                          "timer": len(tm)})
        if lager.er_annulleret():
            raise Afbrudt("annulleret før publicering - publicerer intet")
        # Slutmetadata skrives i publiceringens betingede slut-UPDATE - samme
        # transaktion som resultatrækkerne og 'faerdig' (§6c, K3-N9).
        resume["publiceret"] = lager.publicer(nt, mn, tm, slutfelter=felter)
        # SqlLager sætter 'faerdig' i SAMME transaktion som resultaterne (§6c, K2-F6);
        # kun lagre uden den egenskab får et separat statusskift.
        if not getattr(lager, "faerdig_i_publicering", False):
            if not lager.skift("indlaeser", "faerdig", afsluttet=R.nu_utc(), fase="Færdig"):
                raise Afbrudt("status ændret under publicering")
        resume["status"] = "faerdig"
        rap.trin("faerdig", {"objektiv_dkk": felter["objektiv_dkk"],
                             "opnaaet_gap": felter["opnaaet_gap"]})
        return resume
    except Afbrudt:
        raise
    except Exception as e:                      # motorfejl, ikke modelfejl
        besked = f"Motorfejl ({type(e).__name__}): {e}"
        for fra in ("koerer", "indlaeser"):
            try:
                if lager.skift(fra, "fejl", fejlbesked=besked[:4000], afsluttet=R.nu_utc()):
                    break
            except Exception:
                pass
        resume["status"] = "fejl"
        resume["fejlbesked"] = besked
        rap.fejl(e)
        return resume
    finally:
        hjerte.stop.set()
        if laas is not None:
            laas.afmeld(hjerte.stop_proces.set)
        if hjerte.fejl:
            resume["hjerteslag_fejl"] = hjerte.fejl[-5:]
        try:
            lh_mappe.mkdir(parents=True, exist_ok=True)
            (lh_mappe / "rapport.json").write_text(
                json.dumps(rap.data, ensure_ascii=False, indent=1, default=str),
                encoding="utf-8")
        except Exception as e:
            print("kunne ikke skrive kørslens rapport.json:", e)


def tidsserie_brug(plan) -> dict:
    """``{"anvendt": {rolle: {id, sha256, enheder}}, "ubrugt": {rolle: {id, sha256, grund}}}``."""
    return {
        "anvendt": {r: {**ref, "enheder": list(plan.anvendt_af.get(r) or [])}
                    for r, ref in sorted(plan.tidsserier.items())},
        "ubrugt": {r: {**ref, "grund": "ingen aktiv enhed bruger den"}
                   for r, ref in sorted(plan.ubrugte.items())},
    }


def hent_tidsserie(lager, rolle: str, ref: dict, data_mappe: Path):
    """Hent en frosset tidsserie til ``data/_fjv_ts_<sha16>.csv`` (§6d).

    Returnerer en dict til rapporten, eller en læsbar fejlbesked (str). Stien slås
    op på id'et (``lager.tidsserie_sti``), men det er HASHEN, der er beskyttet: filen
    bruges kun, hvis dens bytes har præcis den frosne sha256, og den har den
    normaliserede form."""
    sti = None
    opslag = getattr(lager, "tidsserie_sti", None)
    if opslag is not None:
        try:
            sti = opslag(ref["id"])
        except Exception as e:                  # opslaget er en genvej, ikke et krav
            sti = None
            print(f"tidsserie-opslag fejlede ({type(e).__name__}: {e}); søger på hash")
    fil = TS.find_fil(K.FILES, ref["sha256"], sti)
    if fil is None:
        return (f"Tidsserien til {rolle} ({ref['id']}, sha256 {ref['sha256'][:12]}…) findes ikke "
                "i lakehouset. Den kan være slettet - vælg en anden tidsserie og bestil igen.")
    data = fil.read_bytes()
    faktisk = TS.sha256(data)
    if faktisk != ref["sha256"]:
        return (f"Tidsserien til {rolle} er ændret efter bestillingen: filen har sha256 "
                f"{faktisk[:12]}…, bestillingen {ref['sha256'][:12]}…. Bestil kørslen igen.")
    try:
        punkter = TS.laes_normaliseret(data)
    except TS.TidsserieFejl as e:
        return f"Tidsserien til {rolle} kan ikke bruges: {e}"
    data_mappe.mkdir(parents=True, exist_ok=True)
    (data_mappe / TS.lokalt_navn(ref["sha256"])).write_bytes(data)
    return {"id": ref["id"], "sha256": ref["sha256"], "raekker": len(punkter),
            "start": TS.tid_tekst(punkter[0][0]), "slut": TS.tid_tekst(punkter[-1][0]),
            "fil": str(fil).replace("\\", "/")[-200:], "lokal": TS.lokalt_navn(ref["sha256"]),
            "punkter": punkter}


def _kopier(arbejde: Path, ud: Path, maal: Path):
    """Rå output til ``Files/fjv/koersler/<id>/`` (KONTRAKT §4)."""
    maal.mkdir(parents=True, exist_ok=True)
    for f in ("input.json", "case.yaml", "argv.json", "log.txt", "solver.log"):
        if (arbejde / f).exists():
            shutil.copyfile(arbejde / f, maal / f)
    for f in ud.iterdir():
        if f.is_file():
            shutil.copyfile(f, maal / f.name)
