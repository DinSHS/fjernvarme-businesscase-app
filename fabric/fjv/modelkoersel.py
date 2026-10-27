"""Modelrepoets egne kørselskommandoer for en case — læst, ikke gættet (fv-trofast, runde 8; Codex K8 F5).

Modelrepoet siger selv, hvordan en case køres: i casefilens hoved ("KØRES MED", "Faktisk marked")
og i README's referencetabel. Det er sandheden for "værket kørt som modelrepoet gør det": med eller
uden ``--with-balancing``, og med hvilken målt varmelast (``--heat-csv data/<fil>``).

* ``kommandoer`` finder **alle** ``python run_case.py cases/<denne fil> …``-kommandoer: i casens
  kommentarer (fortsættelseslinjer med ``\\`` samles) og i README-tabellens rækker. En kommando,
  der kører en *anden* casefil (fx den nedarvede ``billund_backtest_jan_apr_2026.yaml``-kommentar i de
  rullende cases), tæller ikke — den beskriver ikke denne case.
* ``standard`` er casens egen første kommando; har casen ingen, README's første. Har ingen af dem en,
  angiver modelrepoet ingen kørsel, og appens valg er en *egen antagelse* (``None``).
* **Streng tilstand** (``streng=True``, spejlet og trofasthedsgaten — K8 F5): en linje, der nævner
  ``run_case.py`` for denne case (eller en README-tabelrække med ``run_case.py``), men ikke kan læses som
  ``python run_case.py cases/<fil> …``, er en **fejl** — ellers ville en omskrevet kommando (fx ``python3``)
  forsvinde, og standarden glide til en anden. Med en flagtabel (``run_case.py``'s egne
  ``add_argument``-kald, ``flagtabel``) er et ukendt flag eller et flag uden sin værdi også en fejl. Alle
  fortolkede flag gemmes i ``flag``; dem, appens standardkørsel ikke selv oversætter, i ``ekstra``.

Kun standardbiblioteket (bruges af motoren i Fabric, af community-udgaven og af viden-værktøjerne).
"""

from __future__ import annotations

import ast
import re
import shlex

#: Linjer, der overhovedet nævner en kørsel; den kanoniske form er ``python run_case.py <case> …``.
_NAEVNER = re.compile(r"run_case\.py\s+(\S+\.yaml)\b")
_KOMMANDO = re.compile(r"(?:^|\s)(\S+)\s+run_case\.py\s+(\S+\.yaml)\b")
_README_RAEKKE = re.compile(r"^\|.*`([^`]*run_case\.py\s+cases/[^`]*)`")
FORTOLKER = "python"
#: Flag, appens bestilling oversætter til scenariefelter (byg_case/startBestilling). Alt andet havner i ``ekstra``.
APP_FLAG = {"--data-source", "--with-balancing", "--heat-csv", "--start", "--end", "--balancing-method"}
#: Uden flagtabel (motoren): run_case.py's flag uden værdi @ eef950a.
_NUL_ARITET = {"--with-balancing", "--legacy-nettab", "--dummy", "--external", "--force-refresh"}
#: Flag, der ikke påvirker resultatet (kun output/visning).
UDEN_BETYDNING = {"--days", "--out-dir"}


class KommandoFejl(ValueError):
    """En kommando i modelrepoet kan ikke fortolkes fuldt. Beskeden nævner fil:linje."""


def flagtabel(run_case_tekst: str) -> dict[str, int]:
    """``run_case.py``'s egne flag -> antal værdier (0 for store_true/store_false, ellers 1), læst af AST'en."""
    ud: dict[str, int] = {}
    for node in ast.walk(ast.parse(run_case_tekst)):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "add_argument"):
            continue
        navne = [a.value for a in node.args if isinstance(a, ast.Constant) and isinstance(a.value, str) and a.value.startswith("-")]
        action = next((k.value.value for k in node.keywords if k.arg == "action" and isinstance(k.value, ast.Constant)), None)
        for n in navne:
            ud[n] = 0 if action in ("store_true", "store_false") else 1
    if "--with-balancing" not in ud or "--heat-csv" not in ud:
        raise KommandoFejl("run_case.py: argparse-flagene kan ikke læses (mangler --with-balancing/--heat-csv)")
    return ud


def _kommentarlinjer(tekst: str) -> list[tuple[int, str]]:
    """(linjenr, tekst efter '#') for rene kommentarlinjer i casens hoved og krop."""
    ud = []
    for i, l in enumerate(tekst.splitlines(), 1):
        s = l.strip()
        if s.startswith("#"):
            ud.append((i, s.lstrip("#").strip()))
    return ud


def _flag(argv: list[str], kilde: str, tabel: dict[str, int] | None) -> dict:
    ud: dict = {"med_balancering": False, "heat_csv": None, "start": None, "slut": None,
                "balancing_method": None, "data_source": None, "ekstra": [], "flag": []}
    i = 0
    while i < len(argv):
        a = argv[i]
        if not a.startswith("--"):
            raise KommandoFejl(f"{kilde}: kan ikke fortolke {a!r} (ikke et flag)")
        if tabel is not None and a not in tabel:
            raise KommandoFejl(f"{kilde}: ukendt flag {a} (run_case.py kender det ikke)")
        n = tabel[a] if tabel is not None else (0 if a in _NUL_ARITET else 1)
        v = argv[i + 1] if n and i + 1 < len(argv) else None
        if n and (v is None or v.startswith("--")):
            raise KommandoFejl(f"{kilde}: flaget {a} mangler sin værdi")
        ud["flag"].append([a, v])
        if a == "--with-balancing":
            ud["med_balancering"] = True
        elif a == "--heat-csv":
            ud["heat_csv"] = v[len("data/"):] if v.startswith("data/") else v
        elif a in ("--start", "--end"):
            ud["start" if a == "--start" else "slut"] = v
        elif a == "--balancing-method":
            ud["balancing_method"] = v
        elif a == "--data-source":
            ud["data_source"] = v
        if a not in APP_FLAG and a not in UDEN_BETYDNING:
            ud["ekstra"].append(a if v is None else f"{a} {v}")
        i += 1 + n
    return ud


def _post(argv: list[str], kilde: str, case_sti: str, tabel) -> dict:
    return {"kilde": kilde, "kommando": " ".join(["python", "run_case.py", case_sti, *argv]), **_flag(argv, kilde, tabel)}


def kommandoer(case_fil: str, case_tekst: str, readme_tekst: str | None = None, *, streng: bool = False,
               tabel: dict[str, int] | None = None) -> list[dict]:
    """Alle kommandoer, modelrepoet angiver for ``cases/<case_fil>``, i rækkefølge: casen først, så README."""
    sti = f"cases/{case_fil}"
    ud: list[dict] = []
    linjer = _kommentarlinjer(case_tekst)
    i = 0
    while i < len(linjer):
        nr, t = linjer[i]
        naevn = _NAEVNER.search(t)
        m = _KOMMANDO.search(t)
        if not naevn:
            i += 1
            continue
        if not m or (streng and m.group(1) != FORTOLKER):
            if streng and naevn.group(1) == sti:
                raise KommandoFejl(f"{sti}:{nr}: kommandoen kan ikke fortolkes som '{FORTOLKER} run_case.py {sti} …' "
                                   f"({t[:80]!r}) - en kommando, der ikke læses, forsvinder fra standarden")
            i += 1
            continue
        dele, slut = [t[m.start(1):]], nr
        while dele[-1].endswith("\\") and i + 1 < len(linjer) and linjer[i + 1][0] == slut + 1:
            dele[-1] = dele[-1][:-1]
            i += 1
            slut = linjer[i][0]
            dele.append(linjer[i][1])
        i += 1
        if m.group(2) != sti:
            continue
        try:
            argv = shlex.split(" ".join(dele))[3:]
        except ValueError as e:
            raise KommandoFejl(f"{sti}:{nr}: {e}") from e
        try:
            ud.append(_post(argv, f"{sti}:{nr}" + (f"-{slut}" if slut != nr else ""), sti, tabel))
        except KommandoFejl:
            if streng:
                raise
    for nr, l in enumerate((readme_tekst or "").splitlines(), 1):
        m = _README_RAEKKE.search(l)
        if not m:
            continue
        try:
            argv = shlex.split(m.group(1))
        except ValueError as e:
            if streng:
                raise KommandoFejl(f"README.md:{nr}: {e}") from e
            continue
        if len(argv) < 3 or argv[1] != "run_case.py":
            if streng:
                raise KommandoFejl(f"README.md:{nr}: tabelrækkens kommando kan ikke fortolkes ({m.group(1)[:80]!r})")
            continue
        if argv[2] != sti:
            continue
        if streng and argv[0] != FORTOLKER:
            raise KommandoFejl(f"README.md:{nr}: kommandoen for {sti} bruger {argv[0]!r}, ikke '{FORTOLKER}'")
        try:
            post = _post(argv[3:], f"README.md:{nr}", sti, tabel)
        except KommandoFejl:
            if streng:
                raise
            continue
        celler = [c.strip() for c in l.strip().strip("|").split("|")]
        post["navn"] = celler[0] if celler else None
        tal = re.sub(r"[^\d]", "", celler[2]) if len(celler) > 2 else ""
        post["objektiv_dkk"] = int(tal) if tal else None
        ud.append(post)
    return ud


def standard(kommandoer_: list[dict]) -> dict | None:
    """Casens egen første kommando, ellers README's første, ellers None (modelrepoet angiver ingen)."""
    egne = [k for k in kommandoer_ if k["kilde"].startswith("cases/")]
    if egne:
        return egne[0]
    readme = [k for k in kommandoer_ if k["kilde"].startswith("README.md")]
    return readme[0] if readme else None


def varmelastfiler(kommandoer_: list[dict]) -> list[str]:
    """Målte varmelastfiler (navn i ``data/``), modelrepoet kører casen med — uden dubletter."""
    ud: list[str] = []
    for k in kommandoer_:
        f = k.get("heat_csv")
        if f and "/" not in f and f not in ud:
            ud.append(f)
    return ud


def ikke_oversat(st: dict | None) -> list[str]:
    """Det i en standardkommando, appens STANDARDKØRSEL (balancemarked + varmelast) ikke sætter — skal være tomt."""
    if not st:
        return []
    ud = list(st.get("ekstra") or [])
    if st.get("start") or st.get("slut"):
        ud.append(f"--start {st.get('start')} --end {st.get('slut')}")
    if st.get("balancing_method"):
        ud.append(f"--balancing-method {st['balancing_method']}")
    if st.get("data_source") not in (None, "github"):
        ud.append(f"--data-source {st['data_source']}")
    return ud
