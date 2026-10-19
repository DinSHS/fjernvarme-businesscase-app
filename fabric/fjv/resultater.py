"""Modellens output -> rækker til Koersel, KoerselNoegletal, KoerselMaaned, KoerselTime.

Stdlib-only (csv/json): kører i notebookens kerne, ikke i modellens venv, så
den kan testes lokalt uden xarray. Alt der kræver modellens hukommelse, har
``model_wrapper.py`` allerede skrevet ud (``_fjv.json``, ``_fjv_fuld.csv``).

Registeret (``maaleregister.json``) **eksekveres**: hver post bestemmer kilde og
aggregering, og en kilde/aggregering koden ikke kender, er en fejl — ikke en
stille udeladelse. NaN/±Inf bliver ``None`` (null = ikke tilgængelig).
"""

from __future__ import annotations

import csv
import json
import math
import re
from collections import OrderedDict
from pathlib import Path

from .dansk_tid import lokal_maaned, parse_utc

MAX_JSON = 4000


class ResultatFejl(RuntimeError):
    pass


def register() -> dict:
    for sti in (Path(__file__).with_name("maaleregister.json"),
                Path(__file__).resolve().parent.parent / "maaleregister.json"):
        if sti.exists():
            return json.loads(sti.read_text(encoding="utf-8"))
    raise ResultatFejl("maaleregister.json ikke fundet")


def tal(v):
    if v is None or v == "" or isinstance(v, bool):
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


# ------------------------------------------------------------------ filer

class Output:
    """Én kørsels outputmappe. Finder filerne via wrapperens ``_fjv.json``-stem."""

    def __init__(self, mappe: Path):
        self.mappe = Path(mappe)
        info = sorted(p for p in self.mappe.iterdir() if p.name.endswith("_fjv.json"))
        if len(info) != 1:
            raise ResultatFejl(f"forventede én *_fjv.json i {mappe}, fandt {len(info)}")
        self.info = json.loads(info[0].read_text(encoding="utf-8"))
        self.stem = self.info["stem"]

    def fil(self, endelse: str) -> Path:
        p = self.mappe / f"{self.stem}{endelse}"
        if not p.exists():
            raise ResultatFejl(f"mangler {p.name}")
        return p

    def manifest(self) -> dict:
        return json.loads(self.fil("_manifest.json").read_text(encoding="utf-8"))

    def kpi(self) -> list[dict]:
        with open(self.fil("_kpi.csv"), encoding="utf-8", newline="") as f:
            return list(csv.DictReader(f))

    def fuld(self) -> tuple[list[str], dict[str, list]]:
        with open(self.fil("_fjv_fuld.csv"), encoding="utf-8", newline="") as f:
            r = csv.reader(f)
            hoved = next(r)
            kol: dict[str, list] = {h: [] for h in hoved}
            for raekke in r:
                for h, v in zip(hoved, raekke):
                    kol[h].append(v if h == "tid_utc" else tal(v))
        return kol.pop("tid_utc"), kol


# ------------------------------------------------------------------ HiGHS

_RAPPORT = re.compile(r"^Solving report\s*$", re.M)


def parse_highs(log: str) -> dict:
    """Seneste 'Solving report' fra HiGHS (MIP). Testet mod HiGHS 1.15.1-formatet.

    Ved tvivl er feltet None — et gættet gab er værre end intet (K1-F13).
    Ved ex post-afregning er der to rapporter; den sidste hører til det
    objektiv, der publiceres.
    """
    ud = {"highs_version": None, "status": None, "primal_bound": None, "dual_bound": None,
          "gap_pct": None, "loesetid_s": None, "antal_rapporter": 0}
    m = re.search(r"Running HiGHS (\d+\.\d+\.\d+)", log)
    if m:
        ud["highs_version"] = m.group(1)
    blokke = [m.start() for m in _RAPPORT.finditer(log)]
    ud["antal_rapporter"] = len(blokke)
    if not blokke:
        return ud
    blok = log[blokke[-1]:].split("\n\n", 1)[0]

    def felt(navn):
        mm = re.search(rf"^\s*{navn}\s+(.+)$", blok, re.M)
        return mm.group(1).strip() if mm else None

    ud["status"] = felt("Status")
    ud["primal_bound"] = tal(felt("Primal bound"))
    ud["dual_bound"] = tal(felt("Dual bound"))
    g = felt("Gap")
    if g:
        mm = re.match(r"([0-9.eE+-]+)%", g)
        ud["gap_pct"] = tal(mm.group(1)) if mm else None   # "inf" -> None
    t = felt("Timing")
    if t:
        ud["loesetid_s"] = tal(t.split()[0])
    return ud


# ------------------------------------------------------------------ aggregering

def _agg(vaerdier: list, dt: float, hvordan: str):
    v = [x for x in vaerdier if x is not None]
    if hvordan == "antal":
        return float(len(vaerdier))
    if not v:
        return None
    if len(v) != len(vaerdier) and hvordan not in ("foerste", "sidste", "max"):
        # Et hul i en serie må ikke blive en mindre sum uden at nogen ser det.
        raise ResultatFejl(f"serien har {len(vaerdier) - len(v)} tomme intervaller")
    if hvordan == "sum":                 # kr.-led som objektivet: Σ over intervaller
        return sum(v)
    if hvordan == "timer_over_0_01":     # som balancing.hours_bidding (r > 0,01), i timer
        return sum(1 for x in v if x > 0.01) * dt
    if hvordan == "sum_dt":
        return sum(v) * dt
    if hvordan == "sum_dt_gwh":
        return sum(v) * dt / 1000.0
    if hvordan == "sum_dt_afrundet":
        return float(round(sum(v) * dt, 6))
    if hvordan == "sum_afrundet":
        return float(round(sum(v)))
    if hvordan == "vaegtet_middel":      # ensartet Δt: tidsvægtet = aritmetisk
        return sum(v) / len(v)
    if hvordan == "foerste":
        return vaerdier[0]
    if hvordan == "sidste":
        return vaerdier[-1]
    if hvordan == "max":
        return max(v)
    raise ResultatFejl(f"ukendt aggregering {hvordan!r}")


_SUMMERBARE = {"sum", "sum_dt", "sum_dt_gwh", "sum_afrundet", "sum_dt_afrundet",
               "timer_over_0_01"}
_PLADSHOLDER = re.compile(r"<([a-z_]+)>")


def _udfold(serie: str, kolonner) -> list[tuple[str | None, str | None, str]]:
    """Udfold en serieskabelon til (objekt, marked, kolonnenavn) for alle matchende kolonner.

    ``<marked>`` fanges som marked; enhver anden pladsholder (``<enhed>``,
    ``<lager>``, ``<uc_enhed>``) som objekt. Hvert felt matcher et helt
    punktumfrit navneled, så ``res.heat_prod.<enhed>`` ikke fanger dybere navne.
    """
    if "<" not in serie:
        return [(None, None, serie)] if serie in kolonner else []
    moenster, sidst, navne = "", 0, []
    for m in _PLADSHOLDER.finditer(serie):
        moenster += re.escape(serie[sidst:m.start()])
        navn = "marked" if m.group(1) == "marked" else "objekt"
        if navn in navne:
            raise ResultatFejl(f"serieskabelonen {serie!r} har to {navn}-pladsholdere")
        navne.append(navn)
        moenster += rf"(?P<{navn}>[^.]+)"
        sidst = m.end()
    rx = re.compile(moenster + re.escape(serie[sidst:]) + "$")
    ud = []
    for k in kolonner:
        mm = rx.match(k)
        if mm:
            d = mm.groupdict()
            ud.append((d.get("objekt"), d.get("marked"), k))
    return ud


def _objekter(skabelon: str, serie: str, kolonner) -> list[tuple[str | None, str]]:
    """Bagudkompatibel: (objekt, kolonne) for skabeloner uden ``<marked>``."""
    return [(o, k) for o, _m, k in _udfold(serie, kolonner)]


def _hent(d: dict, sti: str):
    for k in sti.split("."):
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d


def noegletal(out: Output, reg: dict) -> list[dict]:
    man = out.manifest()
    kpi = out.kpi()
    tider, kol = out.fuld()
    dt = float(out.info["dt_timer"])
    ud: list[dict] = []
    enhedsvaerdier: dict[str, dict] = {}

    for post in reg["noegletal"]:
        kilde = post["kilde"]
        base = {"gruppe": post["gruppe"], "marked": post.get("marked"),
                "noegle": post["noegle"], "enhed": post.get("enhed")}
        if kilde == "fjv.json":
            ud.append({**base, "objekt": None, "vaerdi": tal(out.info.get(post["felt"]))})
        elif kilde == "manifest":
            ud.append({**base, "objekt": None, "vaerdi": tal(_hent(man, post["felt"]))})
        elif kilde == "kpi.csv":
            for r in kpi:
                v = tal(r.get(post["kolonne"]))
                enhedsvaerdier.setdefault(r["unit"], {})[post["noegle"]] = v
                ud.append({**base, "objekt": r["unit"], "vaerdi": v})
        elif kilde == "afledt":
            for enhed, ev in enhedsvaerdier.items():
                if post["formel"] == "driftsintervaller * dt_timer":
                    v = None if ev.get("driftsintervaller") is None else ev["driftsintervaller"] * dt
                elif post["formel"] == "produktion_mwh / p_max_mw":
                    p = ev.get("p_max_mw")
                    v = None if not p or ev.get("produktion_mwh") is None else ev["produktion_mwh"] / p
                else:
                    raise ResultatFejl(f"ukendt formel {post['formel']!r}")
                ud.append({**base, "objekt": enhed, "vaerdi": v})
        elif kilde == "fuld.csv":
            totaler: "OrderedDict[str | None, float]" = OrderedDict()
            for objekt, marked, k in _udfold(post["serie"], kol):
                v = _agg(kol[k], dt, post["aggregering"])
                ud.append({**base, "objekt": objekt, "marked": marked or base["marked"],
                           "vaerdi": v})
                if post.get("i_alt") and v is not None:
                    totaler[marked] = totaler.get(marked, 0.0) + v
            # "I alt" summeres her på uafrundede tal - appen summerer aldrig viste celler.
            if post.get("i_alt"):
                if post["aggregering"] not in _SUMMERBARE:
                    raise ResultatFejl(f"{post['noegle']}: i_alt kræver en summerbar aggregering")
                for marked, v in totaler.items():
                    ud.append({**base, "objekt": None, "marked": marked or base["marked"],
                               "vaerdi": v})
                # På tværs af markeder (objekt = null, marked = null) - fv-analyse 09:37:
                # "i alt" for et produkt skal heller ikke summeres af appen.
                if "<marked>" in post["serie"] and any(m for m in totaler):
                    ud.append({**base, "objekt": None, "marked": None,
                               "vaerdi": sum(totaler.values())})
        else:
            raise ResultatFejl(f"ukendt kilde {kilde!r} i måleregisteret")
    _tjek_unik(ud, ("gruppe", "objekt", "marked", "noegle"), "KoerselNoegletal")
    return ud


def maaneder(out: Output, reg: dict) -> list[dict]:
    tider, kol = out.fuld()
    dt = float(out.info["dt_timer"])
    if len(tider) != int(out.info["antal_interval_model"]):
        raise ResultatFejl(f"fuld tidsserie har {len(tider)} intervaller, modellen "
                           f"{out.info['antal_interval_model']}")
    maaned_af = [lokal_maaned(parse_utc(t)) for t in tider]
    grupper: "OrderedDict[str, list[int]]" = OrderedDict()
    for i, m in enumerate(maaned_af):
        grupper.setdefault(m, []).append(i)
    grupper["periode"] = list(range(len(tider)))
    ud: list[dict] = []
    for post in reg["maaned"]:
        if post["serie"] == "*":
            par = [(None, None, None)]
        else:
            par = _udfold(post["serie"], kol)
        for objekt, marked, k in par:
            # KoerselMaaned har ingen marked-kolonne: markedet står i nøglen.
            noegle = post["noegle"].replace("<marked>", marked or "")
            for m, idx in grupper.items():
                vaerdier = [None] * len(idx) if k is None else [kol[k][i] for i in idx]
                ud.append({"maaned": m, "objekt": objekt, "noegle": noegle,
                           "vaerdi": _agg(vaerdier, dt, post["aggregering"])})
    _tjek_unik(ud, ("maaned", "objekt", "noegle"), "KoerselMaaned")
    return ud


def timer(out: Output, reg: dict) -> list[dict]:
    navne = reg["tid"]["kolonner"]
    ud = []
    with open(out.fil("_hourly.csv"), encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            t = parse_utc(r.pop("timestamp")).strftime("%Y-%m-%dT%H:%M:%SZ")
            raekke = {"tid": t}
            for felt, kolonne in navne.items():
                raekke[felt] = tal(r.pop(kolonne, None))
            resten = {k: tal(v) for k, v in r.items()}
            js = json.dumps(resten, separators=(",", ":"), allow_nan=False)
            if len(js) > MAX_JSON:
                raise ResultatFejl(f"vaerdier_json er {len(js)} tegn kl. {t} (maks {MAX_JSON}) "
                                   "- værket har for mange kolonner til formatet")
            raekke["vaerdier_json"] = js
            ud.append(raekke)
    if ud and ud[0]["varmelast_mw"] is None:
        raise ResultatFejl("heat_load_mw mangler i _hourly.csv")
    _tjek_unik(ud, ("tid",), "KoerselTime")
    return ud


def _tjek_unik(raekker, noegle, tabel):
    set_ = set()
    for r in raekker:
        k = tuple(r.get(n) for n in noegle)
        if k in set_:
            raise ResultatFejl(f"{tabel}: dubleret naturlig nøgle {k}")
        set_.add(k)


def koersel_felter(out: Output, highs: dict) -> dict:
    """Felterne på Koersel, som kommer fra output (ikke fra bestillingen)."""
    man = out.manifest()
    info = out.info
    ens = (lambda a, b: a is not None and b is not None and abs(a - b) <= 1e-6 * max(1, abs(a)))
    obj = tal(info.get("objektiv_dkk"))
    if highs.get("primal_bound") is not None and obj is not None and not ens(obj, highs["primal_bound"]):
        # Objektivet og solverrapportens primal bound skal være samme tal; gør de
        # ikke det, hører rapporten ikke til denne løsning (fx en anden fase).
        # ALLE målinger fra den rapport forkastes - også løsningstiden (K2-F12).
        highs = {**highs, "gap_pct": None, "dual_bound": None, "loesetid_s": None,
                 "match": False,
                 "begrundelse": (f"HiGHS-rapportens primal bound {highs['primal_bound']} matcher "
                                 f"ikke objektivet {obj}; gab, bound og tid er derfor ikke målt")}
    elif highs.get("primal_bound") is None:
        highs = {**highs, "gap_pct": None, "dual_bound": None, "loesetid_s": None,
                 "match": False, "begrundelse": "ingen HiGHS-rapport fundet i loggen"}
    else:
        highs = {**highs, "match": True}
    status = man.get("sporbarhed", {}).get("solve_status")
    return {
        "solve_status": status,
        "er_milp": bool(info.get("er_milp")),
        "objektiv_dkk": obj,
        "opnaaet_gap": None if highs.get("gap_pct") is None else highs["gap_pct"] / 100.0,
        "best_bound": highs.get("dual_bound"),
        "loesetid_s": highs.get("loesetid_s"),
        "oploesning": info.get("oploesning"),
        "interval_min": None if info.get("dt_timer") is None else round(info["dt_timer"] * 60),
        "antal_interval_model": info.get("antal_interval_model"),
        "output_stem": out.stem,
        "manifest_json": json.dumps({
            "schema_version": man.get("schema_version"),
            "periode": man.get("koersel", {}).get("periode"),
            "datakilde": man.get("koersel", {}).get("datakilde"),
            "med_balancering": man.get("koersel", {}).get("med_balancering"),
            "enheder_til": man.get("koersel", {}).get("enheder_til"),
            "enheder_fra": man.get("koersel", {}).get("enheder_fra"),
            "model_type": man.get("sporbarhed", {}).get("model_type"),
            "highs": {k: highs.get(k) for k in ("highs_version", "status", "antal_rapporter",
                                                "match", "begrundelse")},
            # Værkets tidsserier, som kørslen faktisk brugte / frøs uden at bruge (K5-F12).
            # Mangler filen (kørsler før runde 5), udelades nøglen.
            **({"tidsserier": json.loads((out.mappe / "fjv_tidsserier.json").read_text(encoding="utf-8"))}
               if (out.mappe / "fjv_tidsserier.json").is_file() else {}),
        }, ensure_ascii=False, separators=(",", ":")),
    }
