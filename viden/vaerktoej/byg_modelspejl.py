"""Bygger viden/modelspejl.json: det appen bruger fra modelrepoet, LÆST ved den pinnede commit (runde 8).

Spejlet er ikke en kopi af modellens kode, men de antagelser appen hviler på, udtrukket maskinelt:

* ``cases``: hver ``cases/*.yaml`` (ikke ``heat_load_params_*``) som blade (``fjv.flad``: sti -> [vaerdi_json,
  linje]) + filens sha256 + modelrepoets egne kørselskommandoer for casen (``fjv.modelkoersel``).
* ``standarder``: litterale standardværdier i modellens kode — dataclass-felter (``navn: type = værdi``) og
  ``.get("navn", værdi)`` — med fil:linje. Feltkataloget og enhedstyperne holdes op mod dem.
* ``solver``: ``class Solver``'s standarder (``src/config.py``).
* ``vinduer``: README's "vintervinduet"/"sommervinduet".
* ``krav``: ``requirements.txt``.
* ``vaerksdata_skabelon.xlsx`` (runde 12): modelrepoets eget værksark ved pinnen, kopieret byte for byte til
  ``app/src/sider/konfiguration/eksport/`` — eksporten udfylder netop den fil (MIT, modelforfatterens).
* ``varmelast_skalering``: hvordan ``scripts/vaerksark_til_yaml.py`` skalerer Andebys syntese til et årsbehov
  (divisor, afrunding, grundtal) — guiden "Nyt værk" skal bruge samme regel.
* ``vaerksark_typer`` (runde 15): scriptets egne tabeller over enhedstyper, brændsler, CO2-faktorer og prisarkets
  etiketter — appens typeliste holdes op mod dem ([5]), så en ny enhedstype i modellen gør gaten rød.
* ``budstrategi`` (runde 14c): ``doc/BUDSTRATEGI.md``'s færdige YAML-blokke som blade med linje og kommentar —
  Konfigurationens "Tilføj balancemarked" bygger blokken af dem.

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
#: Orakelvektorer for skaleringen (K8 F1): modelrepoets egne linjer udført i Python; vitest prøver nyt-vaerk.ts mod dem.
UD_VEK = ROD / "app" / "src" / "sider" / "konfiguration" / "skalering.vektorer.json"
#: Modelrepoets værksark ved pinnen (runde 12): appens eksport udfylder præcis denne fil.
SKABELON_KILDE = "vaerksdata_skabelon.xlsx"
UD_SKABELON = ROD / "app" / "src" / "sider" / "konfiguration" / "eksport" / "vaerksdata_skabelon.xlsx"
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

    def bytes(self, fil: str) -> bytes:
        if self.repo:
            return subprocess.check_output(["git", "-C", str(self.repo), "show", f"{PIN}:{fil}"])
        return (self.mappe / fil).read_bytes()

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


SK = "scripts/vaerksark_til_yaml.py"
BS = "doc/BUDSTRATEGI.md"


class RegelFejl(SystemExit):
    pass


def budstrategi(tekst: str) -> dict:
    """BUDSTRATEGI.md's afsnit "Færdige YAML-blokke" (runde 14c): hver ``### titel`` med sin ```yaml-blok som blade
    (``fjv.flad``: sti -> [vaerdi_json, linje i BUDSTRATEGI.md, kommentar]). Konfigurationens "Tilføj balancemarked"
    bygger blokken af præcis disse blade, så et værk, der mangler ``balancing``, får modelrepoets egne tal med kilde.

    En profilblok står indrykket (``  reservation_gate:``) som fortsættelse af den fælles ``balancing:``; den læses
    med ``balancing:`` foran, så stierne bliver fulde. Desuden linjerne, hvor afsnittet siger, at prækvalificerede
    enheder skal have ``afrr_qualified``/``mfrr_qualified``, og at enhedsnavnene skal være værkets egne — appen
    henviser til dem. Ændrer afsnittet form, stopper genbygningen (appen skal så gennemgås)."""
    linjer = tekst.splitlines()

    def form(betingelse: bool, hvad: str) -> None:
        if not betingelse:
            raise RegelFejl(f"FEJL: {BS} afsnittet med færdige YAML-blokke har ændret form ({hvad}) - "
                            "app/src/sider/konfiguration/balancemarked.ts skal gennemgås, før spejlet bygges igen")

    start = [i for i, l in enumerate(linjer) if re.match(r"^## \d+\. Færdige YAML-blokke\s*$", l)]
    form(len(start) == 1, f"fandt {len(start)} overskrifter '## N. Færdige YAML-blokke'")
    slut = next((i for i in range(start[0] + 1, len(linjer)) if linjer[i].startswith("## ")), len(linjer))
    blokke, titel, i = [], None, start[0] + 1
    kval = navne = None
    while i < slut:
        l = linjer[i]
        if l.startswith("### "):
            titel = l[4:].strip()
        elif kval is None and "afrr_qualified" in l and "mfrr_qualified" in l:
            kval = i + 1
        elif navne is None and "Enhedsnavnene skal være værkets egne" in l:
            navne = i + 1
        elif l.strip() == "```yaml":
            form(titel is not None, f"en yaml-blok uden ### titel (linje {i + 1})")
            luk = next((j for j in range(i + 1, slut) if linjer[j].strip() == "```"), None)
            form(luk is not None, f"yaml-blokken på linje {i + 1} lukkes ikke")
            krop = linjer[i + 1:luk]
            foerste = next((x for x in krop if x.strip() and not x.lstrip().startswith("#")), "")
            fortsat = foerste.startswith(" ")
            yaml_tekst = ("balancing:\n" if fortsat else "") + "\n".join(krop) + "\n"
            # Linje r i yaml_tekst (1-baseret) er linje i + 1 + r i filen, én mindre med det tilføjede "balancing:".
            forskyd = i + 1 - (1 if fortsat else 0)
            blokke.append({"titel": titel, "linjer": [i + 1, luk + 1], "fortsaetter_balancing": fortsat,
                           "blade": {p.sti: [p.vaerdi_json, p.raekkefoelge + forskyd, p.kommentar]
                                     for p in flad(yaml_tekst)}})
            titel, i = None, luk
        i += 1
    form(kval is not None, "linjen om afrr_qualified/mfrr_qualified findes ikke")
    form(navne is not None, "linjen 'Enhedsnavnene skal være værkets egne' findes ikke")
    form(any(not b["fortsaetter_balancing"] and any(s.startswith("balancing.") for s in b["blade"]) for b in blokke),
         "ingen fælles balancing-blok")
    return {"fil": BS, "afsnit": [start[0] + 1, slut], "kvalificering_linje": kval, "navne_linje": navne,
            "blokke": blokke}


def _skalering_noder(tekst: str):
    """De tre tildelinger, der ER skaleringsreglen: ``f = …aarsvolumen…``, ``andeby_profil = [...]``, ``heat_params = {...}``."""
    trae = ast.parse(tekst)
    ud = []
    for navn in ("f", "andeby_profil", "heat_params"):
        valg = [n for n in ast.walk(trae) if isinstance(n, ast.Assign)
                and any(isinstance(t, ast.Name) and t.id == navn for t in n.targets)]
        if navn == "f":
            valg = [n for n in valg if "aarsvolumen" in ast.unparse(n.value)]
        if len(valg) != 1:
            raise RegelFejl(f"FEJL: skaleringsreglen i {SK}: fandt {len(valg)} tildelinger til {navn!r} (forventet 1) - gennemgå")
        ud.append(valg[0])
    return ud


def _form(betingelse: bool, hvad: str) -> None:
    if not betingelse:
        raise RegelFejl(f"FEJL: skaleringsreglen i {SK} har ændret form ({hvad}) - appen (nyt-vaerk.ts, byg_nyt_vaerk.py) "
                        "kopierer reglen og skal gennemgås, før spejlet bygges igen")


def _round_af(node, inder):
    """``round(<inder>, <heltal>)`` -> decimaler; ellers formfejl."""
    _form(isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "round"
          and len(node.args) == 2 and isinstance(node.args[1], ast.Constant) and isinstance(node.args[1].value, int),
          f"{ast.unparse(node)} er ikke round(…, n)")
    inder(node.args[0])
    return node.args[1].value


def varmelast_skalering(tekst: str) -> dict:
    """HELE skaleringsreglen (K8 F4): betingelse, else-værdi, divisor og alle afrundinger, læst af AST'en. En anden form
    end den, appen kan gengive, stopper genbygningen; kildeteksten gemmes, så enhver ændring gør [2] rød."""
    nf, np_, nh = _skalering_noder(tekst)
    v = nf.value
    _form(isinstance(v, ast.IfExp), "f er ikke 'round(…) if … else …'")
    t = v.test
    _form(isinstance(t, ast.Compare) and isinstance(t.left, ast.Name) and t.left.id == "aarsvolumen" and len(t.ops) == 1
          and isinstance(t.ops[0], (ast.Gt, ast.GtE)) and isinstance(t.comparators[0], ast.Constant), "betingelsen")
    _form(isinstance(v.orelse, ast.Constant) and isinstance(v.orelse.value, (int, float)), "else-værdien")
    div = {}

    def kvotient(n):
        _form(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Div) and isinstance(n.left, ast.Name)
              and n.left.id == "aarsvolumen" and isinstance(n.right, ast.Constant), "aarsvolumen / divisor")
        div["v"] = float(n.right.value)
    afr = _round_af(v.body, kvotient)
    _form(isinstance(np_.value, ast.List), "andeby_profil er ikke en liste")
    profil = [float(x) for x in ast.literal_eval(np_.value)]
    _form(isinstance(nh.value, ast.Dict), "heat_params er ikke en dict")
    grund, dec, faste = {}, {}, {}
    for k, val in zip(nh.value.keys, nh.value.values):
        navn = k.value
        if navn.startswith("_"):
            continue
        if isinstance(val, ast.Constant):
            faste[navn] = val.value
        elif isinstance(val, ast.ListComp):
            _form(navn == "baseline_profile_mw" and len(val.generators) == 1
                  and isinstance(val.generators[0].iter, ast.Name) and val.generators[0].iter.id == "andeby_profil",
                  f"{navn} er ikke [round(v * f, n) for v in andeby_profil]")
            var = val.generators[0].target.id

            def vf(n, var=var, navn=navn):
                _form(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mult)
                      and {getattr(n.left, "id", None), getattr(n.right, "id", None)} == {var, "f"}, f"{navn}: v * f")
            dec[navn] = _round_af(val.elt, vf)
            grund[navn] = profil
        else:
            tal = {}

            def cf(n, tal=tal, navn=navn):
                _form(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mult) and isinstance(n.left, ast.Constant)
                      and isinstance(n.right, ast.Name) and n.right.id == "f", f"{navn}: tal * f")
                tal["v"] = float(n.left.value)
            dec[navn] = _round_af(val, cf)
            grund[navn] = tal["v"]
    _form(set(grund) == {"gaf_mw_per_k", "nettab_slope_mw_per_k", "baseline_profile_mw"},
          f"de skalerede nøgler er {sorted(grund)}")
    return {
        "betingelse": {"op": ">" if isinstance(t.ops[0], ast.Gt) else ">=", "graense": float(t.comparators[0].value)},
        "ellers": float(v.orelse.value),
        "divisor_gwh": div["v"], "afrunding": afr,
        "kilde": f"{SK}:{nf.lineno}",
        "gaf_mw_per_k": grund["gaf_mw_per_k"], "nettab_slope_mw_per_k": grund["nettab_slope_mw_per_k"],
        "baseline_profile_mw": grund["baseline_profile_mw"],
        "decimaler": {f"heat_load_params.{k}": d for k, d in dec.items()},
        "profil_afrunding": dec["baseline_profile_mw"],
        "faste": faste,
        "kilde_grundtal": f"{SK}:{np_.lineno}-{nh.end_lineno}",
        "kilde_tekst": "\n".join(ast.get_source_segment(tekst, n) for n in (nf, np_, nh)),
    }


def vaerksark_typer(tekst: str) -> dict:
    """Enhedstyper, brændsler og CO2-faktorer, som ``scripts/vaerksark_til_yaml.py`` selv opregner (runde 15).

    Appen gengiver dem flere steder (feltkataloget og enhedstyperne, eksportens forudsigelse i ``eksport/kort.ts``,
    valideringen). Ved 939228a kom ``oil_boiler``/``fuel_oil`` til, og intet tjek meldte, at appens liste manglede en
    type: [5] sammenlignede kun standardværdier. Nu læses tabellerne maskinelt, og [5] holder appens lister op mod dem.
    En tabel, der ikke længere er en litteral med det navn, stopper genbygningen (som skaleringsreglen)."""
    trae = ast.parse(tekst)

    def tabel(navn: str, hvor=None):
        valg = [n for n in (ast.walk(trae) if hvor is None else ast.walk(hvor)) if isinstance(n, ast.Assign)
                and any(isinstance(t, ast.Name) and t.id == navn for t in n.targets)]
        if len(valg) != 1:
            raise RegelFejl(f"FEJL: {SK}: fandt {len(valg)} tildelinger til {navn!r} (forventet 1) - appens typeliste "
                            "(byg_felt_katalog.py, eksport/kort.ts) kopierer tabellen og skal gennemgås")
        try:
            return ast.literal_eval(valg[0].value), valg[0].lineno
        except (ValueError, TypeError, SyntaxError):
            raise RegelFejl(f"FEJL: {SK}:{valg[0].lineno}: {navn} er ikke længere en litteral tabel - gennemgå appens typeliste")

    braendsel, l_b = tabel("BRAENDSEL_PR_TYPE")
    co2, l_c = tabel("CO2_PR_MWH_BRAENDSEL")
    ordene, l_o = tabel("BRAENDSEL_ORD")
    biomasse, l_m = tabel("BIOMASSE")
    laes = [n for n in trae.body if isinstance(n, ast.FunctionDef) and n.name == "laes_priser"]
    if len(laes) != 1:
        raise RegelFejl(f"FEJL: {SK}: laes_priser findes ikke (prisarkets etiketter kan ikke læses)")
    navne, l_n = tabel("navne", laes[0])
    return {
        "braendsel_pr_type": braendsel,
        "co2_pr_mwh_braendsel": co2,
        "braendsel_ord": {k: sorted(v) for k, v in ordene.items()},
        "biomasse": biomasse,
        "prisetiketter": navne,
        "kilde": {"braendsel_pr_type": f"{SK}:{l_b}", "co2_pr_mwh_braendsel": f"{SK}:{l_c}",
                  "braendsel_ord": f"{SK}:{l_o}", "biomasse": f"{SK}:{l_m}", "prisetiketter": f"{SK}:{l_n}"},
    }


#: G-værdier, orakelvektorerne altid har (inkl. Codex K8's halvtilfælde 12,5 og 103,125 og grænsen omkring 1).
VEKTOR_G = [0.5, 0.8, 1, 1.0001, 1.01, 1.25, 6.25, 10, 12.5, 37.37, 50, 100, 103.125, 105.52, 312.5, 5000]


def _halv(x: float, n: int) -> bool:
    """Er x (den binære værdi, eksakt) et halvtilfælde for round(x, n)?"""
    from decimal import Decimal
    return (abs(Decimal(x)) * (Decimal(10) ** n)) % 1 == Decimal("0.5")


def skalering_vektorer(tekst: str) -> list[dict]:
    """Orakel (K8 F1): modelrepoets EGNE tre tildelinger udført uændret i Python for udvalgte G — de faste, plus hver
    hundrededel i 1,01-500, der rammer et halvtilfælde i f, gaf, nettab eller profilen, plus hver 499. Appens
    TypeScript (nyt-vaerk.ts) prøves mod dem i vitest; [2] sikrer, at filen er det, modelrepoet giver."""
    kode = compile(ast.Module(body=_skalering_noder(tekst), type_ignores=[]), f"{PIN[:7]}:{SK}", "exec")
    regel = varmelast_skalering(tekst)
    d = regel["decimaler"]

    def koer(g):
        rum = {"aarsvolumen": g}
        exec(kode, rum)
        h = rum["heat_params"]
        return {"g": g, "f": rum["f"], "gaf": h["gaf_mw_per_k"], "nettab": h["nettab_slope_mw_per_k"],
                "profil": h["baseline_profile_mw"]}
    ud = [koer(g) for g in VEKTOR_G]
    for i in range(101, 50001):
        g = i / 100
        r = koer(g)
        halv = (_halv(g / regel["divisor_gwh"], regel["afrunding"])
                or _halv(regel["gaf_mw_per_k"] * r["f"], d["heat_load_params.gaf_mw_per_k"])
                or _halv(regel["nettab_slope_mw_per_k"] * r["f"], d["heat_load_params.nettab_slope_mw_per_k"])
                or any(_halv(v * r["f"], d["heat_load_params.baseline_profile_mw"]) for v in regel["baseline_profile_mw"]))
        if (halv or i % 499 == 0) and g not in VEKTOR_G:
            ud.append({**r, "halv": bool(halv)})
    return ud


def byg(kilde: Kilde) -> dict:
    readme = kilde.tekst("README.md")
    tabel = MK.flagtabel(kilde.tekst("run_case.py"))
    cases = {}
    for fil in kilde.filer("cases"):
        if not fil.endswith(".yaml") or fil.startswith("heat_load_params"):
            continue
        tekst = kilde.tekst(f"cases/{fil}")
        try:
            ks = MK.kommandoer(fil, tekst, readme, streng=True, tabel=tabel)
        except MK.KommandoFejl as e:
            raise RegelFejl(f"FEJL: {e} - kommandoerne skal kunne fortolkes fuldt, før spejlet bygges (K8 F5)")
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
        "run_case_flag": tabel,
        "varmelast_skalering": varmelast_skalering(kilde.tekst(SK)),
        "vaerksark_typer": vaerksark_typer(kilde.tekst(SK)),
        "budstrategi": budstrategi(kilde.tekst(BS)),
    }


def tekst_af(spejl: dict) -> str:
    return json.dumps(spejl, ensure_ascii=False, indent=1) + "\n"


def ts_af(spejl: dict) -> str:
    """Appens del af spejlet: pr. case filen, modelrepoets kørsler og bladene (sti -> [vaerdi_json, linje])."""
    def k(x):
        return None if x is None else {f: x.get(f) for f in ("kilde", "kommando", "med_balancering", "heat_csv",
                                                               "start", "slut", "balancing_method", "data_source", "ekstra")}
    cases = {kode: {"fil": c["fil"], "standard": k(c["standard"]), "kommandoer": [k(x) for x in c["kommandoer"]],
                    "blade": c["blade"]} for kode, c in spejl["cases"].items()}
    data = json.dumps({"model_commit": spejl["model_commit"], "cases": cases, "budstrategi": spejl["budstrategi"]},
                      ensure_ascii=False, indent=1)
    return ("//-----------------------------------------------------------------------\n"
            "// GENERERET af viden/vaerktoej/byg_modelspejl.py fra modelrepoet ved den pinnede commit.\n"
            "// Ret ikke i hånden; tjek_trofasthed.py fejler, hvis filen ikke er det, modelrepoet giver.\n"
            "//-----------------------------------------------------------------------\n\n"
            "import type { Modelspejl } from \"./modelspejl\";\n\n"
            f"export const MODELSPEJL: Modelspejl = {data};\n")


def vektorer_af(kilde: "Kilde") -> str:
    v = skalering_vektorer(kilde.tekst(SK))
    return json.dumps({"_om": f"GENERERET af viden/vaerktoej/byg_modelspejl.py: {SK} @ {PIN[:7]}'s egne tildelinger (f, "
                              "andeby_profil, heat_params) udført i Python for hvert G. Ret ikke i hånden.",
                       "model_commit": PIN, "vektorer": v}, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    kilde = Kilde.find()
    if kilde is None:
        print(f"FEJL: modelrepoet ved {PIN[:7]} findes ikke (sæt FJV_MODELREPO eller FJV_MODELMAPPE)")
        return 2
    spejl = byg(kilde)
    ny, ny_ts, ny_vek = tekst_af(spejl), ts_af(spejl), vektorer_af(kilde)
    ny_skabelon = kilde.bytes(SKABELON_KILDE)
    if "--tjek" in argv:
        fejl = [f.name for f, t in ((UD, ny), (UD_TS, ny_ts), (UD_VEK, ny_vek))
                if (f.read_text(encoding="utf-8") if f.exists() else "") != t]
        if (UD_SKABELON.read_bytes() if UD_SKABELON.exists() else b"") != ny_skabelon:
            fejl.append(UD_SKABELON.name)
        if fejl:
            print(f"FEJL: {', '.join(fejl)} er ikke, hvad modelrepoet ({kilde.beskriv()}) giver - kør byg_modelspejl.py")
            return 1
        print(f"OK: {UD.name}, {UD_TS.name}, {UD_VEK.name} og {UD_SKABELON.name} = modelrepoet ({kilde.beskriv()})")
        return 0
    UD_SKABELON.parent.mkdir(parents=True, exist_ok=True)
    UD_SKABELON.write_bytes(ny_skabelon)
    UD.write_text(ny, encoding="utf-8", newline="\n")
    UD_TS.write_text(ny_ts, encoding="utf-8", newline="\n")
    UD_VEK.write_text(ny_vek, encoding="utf-8", newline="\n")
    s = json.loads(ny)
    print(f"{UD.name}: {len(s['cases'])} cases, {sum(len(c['blade']) for c in s['cases'].values())} blade, "
          f"{len(s['standarder'])} standarder ({kilde.beskriv()})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
