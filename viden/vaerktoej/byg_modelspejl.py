"""Bygger viden/modelspejl.json: det appen bruger fra modelrepoet, LÆST ved den pinnede commit (runde 8).

Spejlet er ikke en kopi af modellens kode, men de antagelser appen hviler på, udtrukket maskinelt:

* ``cases``: hver ``cases/*.yaml`` (ikke ``heat_load_params_*``) som blade (``fjv.flad``: sti -> [vaerdi_json,
  linje]) + filens sha256 + modelrepoets egne kørselskommandoer for casen (``fjv.modelkoersel``).
* ``standarder``: litterale standardværdier i modellens kode — dataclass-felter (``navn: type = værdi``) og
  ``.get("navn", værdi)`` — med fil:linje. Feltkataloget og enhedstyperne holdes op mod dem.
* ``solver``: ``class Solver``'s standarder (``src/config.py``).
* ``vinduer``: README's "vintervinduet"/"sommervinduet".
* ``krav``: ``requirements.txt``.
* ``varmelast_skalering``: hvordan ``scripts/vaerksark_til_yaml.py`` skalerer Andebys syntese til et årsbehov
  (divisor, afrunding, grundtal) — guiden "Nyt værk" skal bruge samme regel.

Kør:   python byg_modelspejl.py          (skriver viden/modelspejl.json)
       python byg_modelspejl.py --tjek   (exit 1, hvis den skrevne fil ikke er det, modelrepoet giver nu)

Modelrepoet: søster til produktmappen (../fjernvarme-businesscase) eller FJV_MODELREPO. Læses med
``git show <PIN>:<fil>`` — arbejdsmappen og andre commits betyder intet. Kræver PyYAML (``fjv.flad``).
"""
from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
HER = Path(__file__).resolve().parent
VIDEN = HER.parent
ROD = VIDEN.parent
sys.path.insert(0, str(ROD / "fabric"))

from fjv import konstanter as K  # noqa: E402
from fjv import modelkoersel as MK  # noqa: E402
from fjv.flad import flad  # noqa: E402
from fjv.importer import kode_af  # noqa: E402

PIN = K.MODEL_COMMIT
UD = VIDEN / "modelspejl.json"
#: Appens kopi (genereret af samme kørsel): kørselskommandoer og blade pr. case til Konfiguration og Scenarier.
UD_TS = ROD / "app" / "src" / "lib" / "modelspejl.data.ts"
STANDARD_FILER = ("src/config.py", "src/data_loader.py", "src/tariff.py", "src/nettab.py", "src/balancing.py")


class Kilde:
    """Modelrepoet ved PIN: lokal git (foretrukket) eller en udpakket mappe (FJV_MODELMAPPE)."""

    def __init__(self, repo: Path | None = None, mappe: Path | None = None):
        self.repo, self.mappe = repo, mappe

    @classmethod
    def find(cls) -> "Kilde | None":
        mappe = os.environ.get("FJV_MODELMAPPE")
        if mappe and Path(mappe, "run_case.py").is_file():
            return cls(mappe=Path(mappe))
        repo = Path(os.environ.get("FJV_MODELREPO", ROD.parent / "fjernvarme-businesscase"))
        try:
            subprocess.run(["git", "-C", str(repo), "cat-file", "-e", f"{PIN}^{{commit}}"],
                           check=True, capture_output=True)
            return cls(repo=repo)
        except (OSError, subprocess.CalledProcessError):
            return None

    def tekst(self, fil: str) -> str:
        if self.repo:
            return subprocess.check_output(["git", "-C", str(self.repo), "show", f"{PIN}:{fil}"],
                                           text=True, encoding="utf-8")
        return (self.mappe / fil).read_text(encoding="utf-8")

    def filer(self, mappe: str) -> list[str]:
        if self.repo:
            ud = subprocess.check_output(["git", "-C", str(self.repo), "ls-tree", "--name-only", f"{PIN}:{mappe}"],
                                         text=True, encoding="utf-8")
            return sorted(ud.split())
        return sorted(p.name for p in (self.mappe / mappe).iterdir())

    def beskriv(self) -> str:
        return f"git {self.repo} @ {PIN[:7]}" if self.repo else f"mappe {self.mappe}"


def _litteral(node):
    """Litteral værdi af en AST-node, inkl. ``[x] * n``; ellers en undtagelse."""
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mult) and isinstance(node.left, ast.List):
        return ast.literal_eval(node.left) * ast.literal_eval(node.right)
    return ast.literal_eval(node)


def standarder(kilde: Kilde) -> list[dict]:
    ud = []
    for fil in STANDARD_FILER:
        trae = ast.parse(kilde.tekst(fil))
        for node in ast.walk(trae):
            navn = vaerdi = None
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value is not None:
                navn, vaerdi_node = node.target.id, node.value
            elif (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "get"
                  and len(node.args) == 2 and isinstance(node.args[0], ast.Constant)
                  and isinstance(node.args[0].value, str)):
                navn, vaerdi_node = node.args[0].value, node.args[1]
            else:
                continue
            try:
                vaerdi = _litteral(vaerdi_node)
            except (ValueError, TypeError, SyntaxError):
                continue
            if isinstance(vaerdi, (set, tuple, bytes)) or navn.startswith("_"):
                continue
            ud.append({"navn": navn, "vaerdi": vaerdi, "kilde": f"{fil}:{node.lineno}"})
    return ud


def solver(kilde: Kilde) -> dict:
    trae = ast.parse(kilde.tekst("src/config.py"))
    for node in trae.body:
        if isinstance(node, ast.ClassDef) and node.name == "Solver":
            return {n.target.id: {"vaerdi": _litteral(n.value), "kilde": f"src/config.py:{n.lineno}"}
                    for n in node.body if isinstance(n, ast.AnnAssign) and n.value is not None}
    raise SystemExit("FEJL: class Solver findes ikke i src/config.py")


def vinduer(readme: str) -> dict:
    ud = {}
    for nr, l in enumerate(readme.splitlines(), 1):
        m = re.match(r'^\|\s*"(\w+vinduet)"\s*\|\s*`--start (\S+) --end (\S+)`', l)
        if m:
            ud[m.group(1)] = {"start": m.group(2), "slut": m.group(3), "kilde": f"README.md:{nr}"}
    if set(ud) != {"vintervinduet", "sommervinduet"}:
        raise SystemExit(f"FEJL: README's vinduer kan ikke læses (fandt {sorted(ud)})")
    return ud


def krav(tekst: str) -> dict:
    ud = {}
    for l in tekst.splitlines():
        m = re.match(r"^([A-Za-z0-9_.\-]+)\s*([=<>!~]=?.*)$", l.strip())
        if m:
            ud[m.group(1).lower()] = m.group(2).strip()
    return ud


def varmelast_skalering(tekst: str) -> dict:
    linjer = tekst.splitlines()

    def find(m):
        for i, l in enumerate(linjer, 1):
            if re.search(m, l):
                return i, l
        raise SystemExit(f"FEJL: {m!r} findes ikke i scripts/vaerksark_til_yaml.py")

    nr, l = find(r"f = round\(aarsvolumen / [\d.]+, \d+\)")
    m = re.search(r"round\(aarsvolumen / ([\d.]+), (\d+)\)", l)
    nr_p, _ = find(r"andeby_profil = \[")
    blok = "\n".join(linjer[nr_p - 1:nr_p + 4])
    profil = ast.literal_eval(blok[blok.index("["):blok.index("]") + 1])
    nr_g, lg = find(r'"gaf_mw_per_k": round\([\d.]+ \* f, 4\)')
    nr_n, ln = find(r'"nettab_slope_mw_per_k": round\([\d.]+ \* f, 4\)')
    return {
        "divisor_gwh": float(m.group(1)), "afrunding": int(m.group(2)),
        "kilde": f"scripts/vaerksark_til_yaml.py:{nr}",
        "gaf_mw_per_k": float(re.search(r"round\(([\d.]+) \* f", lg).group(1)),
        "nettab_slope_mw_per_k": float(re.search(r"round\(([\d.]+) \* f", ln).group(1)),
        "baseline_profile_mw": profil,
        "kilde_grundtal": f"scripts/vaerksark_til_yaml.py:{nr_p}-{nr_n}",
        "profil_afrunding": 3,
    }


def byg(kilde: Kilde) -> dict:
    readme = kilde.tekst("README.md")
    cases = {}
    for fil in kilde.filer("cases"):
        if not fil.endswith(".yaml") or fil.startswith("heat_load_params"):
            continue
        tekst = kilde.tekst(f"cases/{fil}")
        ks = MK.kommandoer(fil, tekst, readme)
        cases[kode_af(fil)] = {
            "fil": f"cases/{fil}",
            "sha256": hashlib.sha256(tekst.replace("\r\n", "\n").encode("utf-8")).hexdigest(),
            "kommandoer": ks,
            "standard": MK.standard(ks),
            "blade": {p.sti: [p.vaerdi_json, p.raekkefoelge] for p in flad(tekst)},
        }
    return {
        "_om": ("Modelrepoets antagelser, som appen bruger, LÆST ved model_commit (genereres af "
                "viden/vaerktoej/byg_modelspejl.py; ret ikke i hånden). tjek_trofasthed.py holder appens værdier "
                "op mod dette spejl og spejlet op mod modelrepoet, så en modelopdatering, der ændrer en antagelse, "
                "får gaten til at fejle."),
        "model_commit": PIN,
        "data_commit": K.DF_DATA_SHA,
        "cases": cases,
        "solver": solver(kilde),
        "standarder": standarder(kilde),
        "vinduer": vinduer(readme),
        "krav": krav(kilde.tekst("requirements.txt")),
        "varmelast_skalering": varmelast_skalering(kilde.tekst("scripts/vaerksark_til_yaml.py")),
    }


def tekst_af(spejl: dict) -> str:
    return json.dumps(spejl, ensure_ascii=False, indent=1) + "\n"


def ts_af(spejl: dict) -> str:
    """Appens del af spejlet: pr. case filen, modelrepoets kørsler og bladene (sti -> [vaerdi_json, linje])."""
    def k(x):
        return None if x is None else {f: x.get(f) for f in ("kilde", "kommando", "med_balancering", "heat_csv",
                                                               "start", "slut", "balancing_method")}
    cases = {kode: {"fil": c["fil"], "standard": k(c["standard"]), "kommandoer": [k(x) for x in c["kommandoer"]],
                    "blade": c["blade"]} for kode, c in spejl["cases"].items()}
    data = json.dumps({"model_commit": spejl["model_commit"], "cases": cases}, ensure_ascii=False, indent=1)
    return ("//-----------------------------------------------------------------------\n"
            "// GENERERET af viden/vaerktoej/byg_modelspejl.py fra modelrepoet ved den pinnede commit.\n"
            "// Ret ikke i hånden; tjek_trofasthed.py fejler, hvis filen ikke er det, modelrepoet giver.\n"
            "//-----------------------------------------------------------------------\n\n"
            "import type { Modelspejl } from \"./modelspejl\";\n\n"
            f"export const MODELSPEJL: Modelspejl = {data};\n")


def main(argv: list[str]) -> int:
    kilde = Kilde.find()
    if kilde is None:
        print(f"FEJL: modelrepoet ved {PIN[:7]} findes ikke (sæt FJV_MODELREPO eller FJV_MODELMAPPE)")
        return 2
    spejl = byg(kilde)
    ny, ny_ts = tekst_af(spejl), ts_af(spejl)
    if "--tjek" in argv:
        fejl = [f.name for f, t in ((UD, ny), (UD_TS, ny_ts))
                if (f.read_text(encoding="utf-8") if f.exists() else "") != t]
        if fejl:
            print(f"FEJL: {', '.join(fejl)} er ikke, hvad modelrepoet ({kilde.beskriv()}) giver - kør byg_modelspejl.py")
            return 1
        print(f"OK: {UD.name} og {UD_TS.name} = modelrepoet ({kilde.beskriv()})")
        return 0
    UD.write_text(ny, encoding="utf-8", newline="\n")
    UD_TS.write_text(ny_ts, encoding="utf-8", newline="\n")
    s = json.loads(ny)
    print(f"{UD.name}: {len(s['cases'])} cases, {sum(len(c['blade']) for c in s['cases'].values())} blade, "
          f"{len(s['standarder'])} standarder ({kilde.beskriv()})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
