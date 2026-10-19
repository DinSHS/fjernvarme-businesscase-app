"""Kørselsmiljø: kode og df-data fra GitHub-zip, Python-miljø, runtime-måling.

Tre valg herinde er værd at kende, fordi de hver forhindrer en tavs fejl:

* **Zip, ikke git.** Python-notebookens runtime kan ikke forudsættes at have
  ``git`` (det måles i ``maal_runtime``), og en zip af en fuld commit-SHA er
  præcis lige så pinnet som en klon. Modellens ``_ensure_df_data_cache`` kræver
  kun at ``<cache>/.git`` *findes* — så en udpakket zip med en ``.git``-markør
  og ``--df-data-cache <sti>`` giver loaderen en klon uden at modelkoden ændres
  og uden netværkskald fra modellen selv.
* **Markør skrives sidst.** En afbrudt udpakning efterlader en halv mappe; uden
  markøren ville næste kørsel tro at den var komplet og regne på et datasæt
  med huller (``assert_coverage`` ville fange nogle af dem, ikke alle).
* **Koden køres fra lokal disk, aldrig fra mountet.** Lakehouse-mountets
  ``(mtime, size)`` er for groft til Pythons bytekode-friskhedstjek (husets
  lektie fra Maalstyring): gammel ``.pyc`` kan skygge for ny kode. Koden
  kopieres derfor til ``/tmp`` og køres med ``PYTHONDONTWRITEBYTECODE=1``.
  Output skrives også lokalt og kopieres bagefter: netCDF/HDF5 laver
  tilfældige skrivninger, som et FUSE-mount ikke lover at håndtere.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from . import konstanter as K


def nu_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# --------------------------------------------------------------- måling

def maal_runtime() -> dict:
    """Hvad kører vi på? Svarene er målinger til rapporten, ikke antagelser."""
    ud: dict = {
        "python": platform.python_version(),
        "executable": sys.executable,
        "platform": platform.platform(),
        "cpu_antal": os.cpu_count(),
        "spark_home": os.environ.get("SPARK_HOME", "ikke sat"),
        "git": shutil.which("git") or "MANGLER",
    }
    try:
        with open("/proc/meminfo", encoding="ascii") as f:
            for linje in f:
                if linje.startswith(("MemTotal", "MemAvailable")):
                    navn, vaerdi = linje.split(":", 1)
                    ud[navn] = vaerdi.strip()
    except OSError:
        ud["MemTotal"] = "ukendt (ingen /proc/meminfo)"
    try:
        frit = shutil.disk_usage(tempfile.gettempdir()).free
        ud["tmp_frit_gb"] = round(frit / 1e9, 1)
    except OSError:
        pass
    return ud


def pakkeversioner(python: str, navne: list[str]) -> dict:
    """Versioner som *underprocessens* Python ser dem — det er den der regner."""
    kode = (
        "import importlib.metadata as m, json, sys\n"
        "ud = {}\n"
        "for n in sys.argv[1:]:\n"
        "    try: ud[n] = m.version(n)\n"
        "    except Exception: ud[n] = 'MANGLER'\n"
        "print(json.dumps(ud))\n"
    )
    r = subprocess.run([python, "-c", kode, *navne], capture_output=True, text=True)
    try:
        return json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:
        return {"fejl": (r.stderr or r.stdout)[-500:]}


# --------------------------------------------------------------- zip

def _hent(url: str, forsoeg: int = 3) -> bytes:
    sidste: Exception | None = None
    for i in range(forsoeg):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "fjv-motor"})
            with urllib.request.urlopen(req, timeout=300) as s:
                return s.read()
        except Exception as fejl:          # netværk: prøv igen, men ikke for evigt
            sidste = fejl
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"kunne ikke hente {url}: {sidste}")


def udpak_zip(data: bytes, maal: Path) -> int:
    """Udpak en GitHub-zip og fjern dens topmappe (``<repo>-<sha>/``)."""
    n = 0
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist():
            if "/" not in info.filename:
                continue
            rel = info.filename.split("/", 1)[1]
            if not rel:
                continue
            sti = maal / rel
            if info.is_dir():
                sti.mkdir(parents=True, exist_ok=True)
                continue
            sti.parent.mkdir(parents=True, exist_ok=True)
            sti.write_bytes(z.read(info))
            n += 1
    return n


def sikr_repo(repo: str, sha: str, rel_rod: str, git_markoer: bool = False,
              files: str | None = None) -> tuple[Path, dict]:
    """Sørg for at ``Files/<rel_rod>/<sha>/`` er en komplet udpakning af repo@sha.

    Returnerer (sti, markør). Genbruges på tværs af kørsler: findes markøren,
    sker der intet netværkskald.
    """
    if len(sha) != 40:
        raise ValueError(f"SHA skal være 40 tegn (fuld commit), fik {sha!r}")
    maal = Path(files or K.FILES) / rel_rod / sha
    markoer = maal / K.KOMPLET_MARKOER
    if markoer.exists():
        return maal, json.loads(markoer.read_text(encoding="utf-8"))

    t0 = time.time()
    url = f"https://codeload.github.com/{repo}/zip/{sha}"
    data = _hent(url)
    if maal.exists():
        # En halv udpakning fra en afbrudt kørsel: start forfra frem for at
        # blande to forsøg.
        shutil.rmtree(maal)
    maal.mkdir(parents=True, exist_ok=True)
    n = udpak_zip(data, maal)
    if git_markoer:
        g = maal / ".git"
        g.mkdir(exist_ok=True)
        (g / "FJV_ZIP_KLON.txt").write_text(
            f"Ikke en git-klon: udpakket zip af {repo}@{sha}.\n"
            "Mappen findes kun fordi _ensure_df_data_cache tjekker <cache>/.git.\n",
            encoding="utf-8")
    info = {"repo": repo, "sha": sha, "filer": n, "zip_bytes": len(data),
            "zip_sha256": hashlib.sha256(data).hexdigest(),
            "udpakket": nu_utc(), "sekunder": round(time.time() - t0, 1)}
    markoer.write_text(json.dumps(info, indent=2), encoding="utf-8")
    return maal, info


def sikr_model(sha: str = K.MODEL_COMMIT, files: str | None = None):
    return sikr_repo(K.MODEL_REPO, sha, K.REL_KODE, files=files)


def sikr_dfdata(sha: str = K.DF_DATA_SHA, files: str | None = None):
    return sikr_repo(K.DF_DATA_REPO, sha, K.REL_DFDATA, git_markoer=True, files=files)


def lokal_kodekopi(kilde: Path, maal: Path, dfdata: Path | None = None,
                   git_init: bool = False) -> Path:
    """Kopiér modelkoden til lokal disk (se modulets docstring for hvorfor).

    Med ``dfdata`` lægges ``data/df-data`` som symlink til lakehouse-udpakningen,
    så modelrepoets egen ``conftest.py`` finder "klonen" uden at blive ændret.

    ``git_init`` (kun selvtesten): ``test_repoets_gitignore_ignorerer_deltagere``
    kører ``git check-ignore``, som kræver et git-repo. En zip har ingen ``.git``,
    så testen ville fejle af en grund, der intet har med ``.gitignore`` at gøre.
    Et tomt ``git init`` (ingen commits) lader den måle det, den er skrevet til.
    Kørsler bruger det ikke — så ville manifestets ``git rev-parse`` læse en
    opdigtet historik.
    """
    if maal.exists():
        shutil.rmtree(maal)
    shutil.copytree(kilde, maal, ignore=shutil.ignore_patterns(
        "__pycache__", "*.pyc", K.KOMPLET_MARKOER))
    if dfdata is not None:
        link = maal / "data" / "df-data"
        link.parent.mkdir(parents=True, exist_ok=True)
        try:
            link.symlink_to(dfdata, target_is_directory=True)
        except OSError:
            # Windows uden udviklertilstand kan ikke lave symlinks; kopiér.
            shutil.copytree(dfdata, link)
    if git_init and shutil.which("git"):
        subprocess.run(["git", "init", "-q"], cwd=str(maal), capture_output=True)
    return maal


# --------------------------------------------------------------- python-miljø

def byg_miljoe(requirements: Path, venv: Path, log: list) -> str:
    """Byg et Python-miljø til run_case.py og returnér stien til dets python.

    ``FJV_PYTHON`` vinder (lokalt: en venv der allerede har pins'ene). Ellers en
    venv med ``--system-site-packages`` i ``/tmp``: pip installerer kun det der
    mangler eller har forkert version, og notebookens egen kerne røres ikke —
    en opgradering af numpy/pandas midt i en kørende kerne er en klassisk
    kilde til "virker interaktivt, fejler i jobbet".
    """
    tvunget = os.environ.get("FJV_PYTHON")
    if tvunget:
        log.append({"miljoe": "FJV_PYTHON", "python": tvunget})
        return tvunget

    t0 = time.time()
    py = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not py.exists():
        r = subprocess.run([sys.executable, "-m", "venv", "--system-site-packages",
                            str(venv)], capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError("venv fejlede: " + (r.stderr or r.stdout)[-1500:])
    r = subprocess.run(
        [str(py), "-m", "pip", "install", "--disable-pip-version-check",
         "--no-input", "-q", "-r", str(requirements)],
        capture_output=True, text=True)
    log.append({"pip_rc": r.returncode, "pip_sek": round(time.time() - t0, 1),
                "pip_hale": (r.stdout + r.stderr)[-1500:]})
    if r.returncode != 0:
        raise RuntimeError("pip install fejlede:\n" + (r.stderr or r.stdout)[-3000:])
    versioner = pakkeversioner(str(py), list(K.PINNEDE_PAKKER))
    for navn, krav in K.PINNEDE_PAKKER.items():
        if versioner.get(navn) != krav:
            raise RuntimeError(f"{navn} er {versioner.get(navn)}, pin kræver {krav}")
    return str(py)


def underproces_miljoe() -> dict:
    env = dict(os.environ)
    env.update({
        "PYTHONUTF8": "1",              # run_case læser YAML med read_text() uden
        "PYTHONIOENCODING": "utf-8",    # encoding; på Windows ville det være cp1252
        "PYTHONDONTWRITEBYTECODE": "1",
        # Ubufret: HiGHS skriver direkte til fd 1, Python bufrer sine print's.
        # Uden dette kommer modellens linjer efter solverloggen, og fasen
        # ("Løser MILP") kan ikke følges live.
        "PYTHONUNBUFFERED": "1",
        "MPLBACKEND": "Agg",
    })
    # Kernens egne pakker må ikke skygge for venv'ens. PYTHONPATH fra Fabric
    # peger på kernens site-packages og ville vinde over venv'en.
    env.pop("PYTHONPATH", None)
    env.pop("PYTHONHOME", None)
    return env


def doed_med_foraelder():
    """preexec_fn: solver-barnet dræbes af kernen, når notebookprocessen dør (K3-N1).

    På Linux bliver et barn ellers ompforældret til init og regner videre, når
    notebookprocessen dør - og Python sætter SIGPIPE til SIG_IGN, så HiGHS dør heller
    ikke af at skrive til den lukkede pipe. ``PR_SET_PDEATHSIG = SIGKILL`` lukker det
    hul. Forbeholdet: signalet udløses, når den TRÅD, der startede barnet, dør; derfor
    startes solveren fra hovedtråden. Ikke-Linux (dev-maskinen): None.
    """
    if not sys.platform.startswith("linux"):
        return None

    def _saet():
        import ctypes
        import signal
        libc = ctypes.CDLL("libc.so.6", use_errno=True)
        PR_SET_PDEATHSIG = 1
        if libc.prctl(PR_SET_PDEATHSIG, signal.SIGKILL, 0, 0, 0) != 0:
            raise OSError(ctypes.get_errno(), "prctl(PR_SET_PDEATHSIG) fejlede")
        # Er forælderen allerede død mellem fork og prctl, ses det som ppid 1.
        if os.getppid() == 1:
            os._exit(1)
    return _saet


def koer_proces(cmd: list[str], cwd: Path, log_sti: Path, timeout_s: float,
                ved_linje=None, stop=None) -> int:
    """Kør en kommando, stream output til en logfil og til ``ved_linje``.

    ``ved_linje(linje)`` bruges til fremdrift (``Koersel.fase``). En undtagelse
    i den afbryder ikke kørslen — fremdrift er information, ikke kontrol.
    ``stop`` (threading.Event) og ``timeout_s`` håndhæves af en vagt-tråd, ikke
    pr. outputlinje: HiGHS kan tie i minutter, og en annullering skal virke alligevel.
    """
    import threading
    with open(log_sti, "w", encoding="utf-8", newline="\n") as log:
        p = subprocess.Popen(cmd, cwd=str(cwd), env=underproces_miljoe(),
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, encoding="utf-8", errors="replace", bufsize=1,
                             preexec_fn=doed_med_foraelder())
        aarsag: list[str] = []

        def vagt():
            t0 = time.time()
            while p.poll() is None:
                if stop is not None and stop.is_set():
                    aarsag.append("annulleret")
                elif time.time() - t0 > timeout_s:
                    aarsag.append(f"timeout efter {timeout_s:.0f} s")
                if aarsag:
                    p.kill()
                    return
                time.sleep(2)

        threading.Thread(target=vagt, daemon=True).start()
        assert p.stdout is not None
        for linje in p.stdout:
            log.write(linje)
            if ved_linje is not None:
                try:
                    ved_linje(linje.rstrip("\n"))
                except Exception:
                    pass
        rc = p.wait()
        if aarsag:
            log.write(f"\n[fjv] AFBRUDT: {aarsag[0]}\n")
        return rc


def kodeaftryk(mappe: Path) -> dict:
    """sha256 + længde pr. modul: "kørte den min kode?" er et opslag, ikke en formodning."""
    ud = {}
    for f in sorted(mappe.glob("*.py")):
        b = f.read_bytes()
        ud[f.name] = f"{hashlib.sha256(b).hexdigest()[:16]} {len(b)}"
    return ud
