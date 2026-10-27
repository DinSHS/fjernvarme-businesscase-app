"""Modelrepoets egne kørselskommandoer for en case — læst, ikke gættet (fv-trofast, runde 8).

Modelrepoet siger selv, hvordan en case køres: i casefilens hoved ("KØRES MED", "Faktisk marked")
og i README's referencetabel. Det er sandheden for "værket kørt som modelrepoet gør det": med eller
uden ``--with-balancing``, og med hvilken målt varmelast (``--heat-csv data/<fil>``).

* ``kommandoer`` finder **alle** ``python run_case.py cases/<denne fil> …``-kommandoer: i casens
  kommentarer (fortsættelseslinjer med ``\\`` samles) og i README-tabellens rækker. En kommando,
  der kører en *anden* casefil (fx den nedarvede ``billund_backtest_jan_apr_2026.yaml``-kommentar i de
  rullende cases), tæller ikke — den beskriver ikke denne case.
* ``standard`` er casens egen første kommando; har casen ingen, README's første. Har ingen af dem en,
  angiver modelrepoet ingen kørsel, og appens valg er en *egen antagelse* (``None``).

Kun standardbiblioteket (bruges af motoren i Fabric, af community-udgaven og af viden-værktøjerne).
"""

from __future__ import annotations

import re
import shlex

_KOMMANDO = re.compile(r"python\s+run_case\.py\s+(\S+\.yaml)\b")
_README_RAEKKE = re.compile(r"^\|.*`(python\s+run_case\.py\s+[^`]+)`")


def _kommentarlinjer(tekst: str) -> list[tuple[int, str]]:
    """(linjenr, tekst efter '#') for rene kommentarlinjer i casens hoved og krop."""
    ud = []
    for i, l in enumerate(tekst.splitlines(), 1):
        s = l.strip()
        if s.startswith("#"):
            ud.append((i, s.lstrip("#").strip()))
    return ud


def _flag(argv: list[str]) -> dict:
    ud: dict = {"med_balancering": "--with-balancing" in argv, "heat_csv": None, "start": None, "slut": None,
                "balancing_method": None, "ekstra": []}
    i = 0
    while i < len(argv):
        a = argv[i]
        nxt = argv[i + 1] if i + 1 < len(argv) else None
        if a == "--heat-csv" and nxt:
            ud["heat_csv"] = nxt[len("data/"):] if nxt.startswith("data/") else nxt
            i += 2
            continue
        if a in ("--start", "--end") and nxt:
            ud["start" if a == "--start" else "slut"] = nxt
            i += 2
            continue
        if a == "--balancing-method" and nxt:
            ud["balancing_method"] = nxt
            i += 2
            continue
        if a.startswith("--") and a not in ("--with-balancing", "--data-source"):
            ud["ekstra"].append(a)
        i += 1
    return ud


def _post(argv: list[str], kilde: str, case_sti: str) -> dict:
    return {"kilde": kilde, "kommando": " ".join(["python", "run_case.py", case_sti, *argv]), **_flag(argv)}


def kommandoer(case_fil: str, case_tekst: str, readme_tekst: str | None = None) -> list[dict]:
    """Alle kommandoer, modelrepoet angiver for ``cases/<case_fil>``, i rækkefølge: casen først, så README."""
    sti = f"cases/{case_fil}"
    ud: list[dict] = []
    linjer = _kommentarlinjer(case_tekst)
    i = 0
    while i < len(linjer):
        nr, t = linjer[i]
        m = _KOMMANDO.search(t)
        if not m:
            i += 1
            continue
        dele, slut = [t[m.start():]], nr
        while dele[-1].endswith("\\") and i + 1 < len(linjer) and linjer[i + 1][0] == slut + 1:
            dele[-1] = dele[-1][:-1]
            i += 1
            slut = linjer[i][0]
            dele.append(linjer[i][1])
        i += 1
        if m.group(1) != sti:
            continue
        argv = shlex.split(" ".join(dele))[3:]
        ud.append(_post(argv, f"{sti}:{nr}" + (f"-{slut}" if slut != nr else ""), sti))
    for nr, l in enumerate((readme_tekst or "").splitlines(), 1):
        m = _README_RAEKKE.search(l)
        if not m:
            continue
        argv = shlex.split(m.group(1))
        if len(argv) < 3 or argv[2] != sti:
            continue
        post = _post(argv[3:], f"README.md:{nr}", sti)
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
