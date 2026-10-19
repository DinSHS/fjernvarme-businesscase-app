"""Frosset kørselsinput -> effektiv ``case.yaml`` + argv (KONTRAKT v2 §3.7, §5.2).

Indgangen er **kun** ``KoerselInput``-rækkerne ``(kilde, sti, vaerdi_json)`` i
den form, appens ``startBestilling`` (``app/rayfin/functions/src/logik.ts``,
``bygFrossetInput``) skriver dem:

==========  ===============================================================
kilde       sti
==========  ===============================================================
vaerk       alle VaerkParameter-blade ved den frosne revision
aendring    ``set`` på en eksisterende værkssti, og enable/disable som
            ``<units|storage>.<navn>.enabled`` = ``true``/``false``
scenarie    ``solver.mip_rel_gap`` / ``solver.mip_abs_gap`` / ``solver.time_limit``
            (case-stier; blokken oprettes, hvis værket ingen har), og
            ``_koersel.<felt>`` for det, der er CLI-flag og ikke case-YAML:
            ``start``, ``slut``, ``med_balancering``, ``balancing_method``,
            ``heat_csv``, ``ekstra_flag`` (JSON-liste), ``model_commit``, ``data_commit``,
            og ``tidsserie.<rolle>`` (§6d) = ``{"id","sha256"}`` (varmelast også
            ``"syntetisk"``)
==========  ===============================================================

Tidsserier (KONTRAKT §6d): en frosset ``tidsserie.varmelast`` bliver
``--heat-csv data/_fjv_ts_<sha16>.csv --heat-csv-column mw``, en frosset
``tidsserie.solprofil`` bliver ``production_profile_path`` på enheden med markøren
``"tidsserie:solprofil"`` (ellers den ene aktive ``solar_thermal``-enhed). Arbejderen
lægger den hash-verificerede fil på netop det navn i kørslens kodekopi, før den
anden ``byg`` (med ``heat_csv_rod``) kontrollerer, at den findes.

Prioritet: værk → ændring/scenarie (en ændring og et særligt felt på samme sti
er en dublet og afvises — ingen "sidste vinder"). Alle case-stier
**materialiseres i dict'en** og skrives som hele ``case.yaml``; CLI'en får
ingen ``--set``. Det er nødvendigt, ikke kosmetik: ``run_case`` genlæser
``heat_load_params`` direkte fra casefilen (``load_heat_load_params(args.case)``),
så en ``--set heat_load_params.*`` ville aldrig nå syntesen, og
``--set solver.time_limit`` afvises på Billund-casene, der ingen solver-blok har
(K1-F8/F9).

``input_hash`` = sha256 af ``json.dumps(sorted([[kilde, sti, vaerdi_json], …]),
ensure_ascii=False, separators=(",", ":"))`` — ``vaerdi_json`` som gemt streng.
Identisk med ``inputHash`` i appens ``logik.ts`` (målt ens af fv-app).
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import yaml

from .flad import FladFejl, afflad, ligner_strengt
from . import tidsserie as TS

KOERSEL_PRAEFIKS = "_koersel."
#: _koersel.<felt> -> tilladte JSON-typer.
KOERSELFELTER = {
    "start": (str,), "slut": (str,), "med_balancering": (bool,),
    "balancing_method": (str,), "heat_csv": (str,), "ekstra_flag": (list,),
    "model_commit": (str,), "data_commit": (str,),
}
SOLVERSTIER = {"solver.mip_rel_gap", "solver.mip_abs_gap", "solver.time_limit"}
TILLADTE_FLAG = {"--legacy-nettab"}
BALANCING_METODER = {"legacy", "activation_value"}
MAX_DOEGN = 366
MAX_TIDSGRAENSE_S = 3600
_DATO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_FILNAVN = re.compile(r"^[A-Za-z0-9_.\-]+\.csv$")
_SHA = re.compile(r"^[0-9a-f]{40}$")


class InputFejl(ValueError):
    """Det frosne input kan ikke blive til en kørsel. Beskeden er til brugeren."""


def input_hash(raekker) -> str:
    norm = sorted([r["kilde"], r["sti"], r["vaerdi_json"]] for r in raekker)
    tekst = json.dumps(norm, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


def som_float(x) -> str:
    """Som appens ``somFloat``: 3600 -> "3600.0", så float-felter forbliver float."""
    s = json.dumps(float(x))
    if s in ("NaN", "Infinity", "-Infinity"):
        raise InputFejl(f"tallet {x} kan ikke gemmes")
    return s


@dataclass
class Kørselsplan:
    case: dict
    case_yaml: str
    cli: list[str]                       # argumenter EFTER casefilens sti
    koersel: dict                        # de parsede _koersel.*-felter
    model_commit: str | None
    data_commit: str | None
    advarsler: list[str] = field(default_factory=list)
    #: rolle -> {"id", "sha256"} for de frosne tidsserier, arbejderen skal hente (§6d).
    tidsserier: dict = field(default_factory=dict)
    #: Kørslens første og sidste time (ISO UTC, begge med).
    periode: tuple | None = None
    #: Frosne tidsserier, kørslen IKKE bruger (fx solprofil, når solvarmen er slået fra).
    ubrugte: dict = field(default_factory=dict)
    #: rolle -> de aktive enheder, der bruger serien (varmelast: ["varmelast"]).
    anvendt_af: dict = field(default_factory=dict)


def _saet(d: dict, sti: str, v) -> None:
    dele = sti.split(".")
    for k in dele[:-1]:
        d = d.setdefault(k, {})
        if not isinstance(d, dict):
            raise InputFejl(f"{sti}: {k} er ikke en sektion")
    d[dele[-1]] = v


def _dato(s, navn: str) -> date:
    if not isinstance(s, str) or not _DATO.match(s):
        raise InputFejl(f"{navn} skal være en ISO-dato (ÅÅÅÅ-MM-DD), fik {s!r}")
    try:
        return date.fromisoformat(s)
    except ValueError as fejl:
        raise InputFejl(f"{navn}: {fejl}") from fejl


def _modeltid(s: str, navn: str):
    """Et tidsstempel som modellen læser det (``load_case``: ``fromisoformat`` med Z ->
    +00:00; ``make_time_index``: ``pd.date_range(..., tz="UTC")``). Naivt = UTC; en bar
    dato = midnat. Kun hele timer: aksen ville ellers ligge skævt for al timedata."""
    from datetime import datetime, timezone
    try:
        t = datetime.fromisoformat(str(s).strip().replace("Z", "+00:00"))
    except ValueError as fejl:
        raise InputFejl(f"værkets {navn} kan ikke læses: {s!r}") from fejl
    if t.tzinfo is not None and t.utcoffset().total_seconds() != 0:
        # Modellen giver selv op på en anden zone end UTC (pd.date_range(..., tz="UTC"):
        # "Inferred time zone not equal to passed time zone") - afvis før kørslen.
        raise InputFejl(f"værkets {navn} skal være i UTC (Z), fik {s!r}")
    t = t.replace(tzinfo=timezone.utc)
    if t.minute or t.second or t.microsecond:
        raise InputFejl(f"værkets {navn} skal ligge på en hel time, fik {s!r}")
    return t


def _effektiv_tid(case: dict, ps: str | None, pe: str | None) -> tuple[str, str]:
    """Grænser på den EFFEKTIVE konfiguration (§6c, K2-F7/F13) - modellens egen akse.

    * Opløsning skal være ``1h``: ved 15 min summerer modellens kr.-led uden Δt
      (K2-F13), så beløbene ville ikke være kroner. Uafklaret i version 1.
    * Med scenariets ``--start/--end`` (rene datoer): fra startdatoens 00:00 til
      slutdatoens 23:00 (``run_case._apply_time_override`` udvider en bar slutdato til
      døgnets sidste skridt).
    * Uden: værkets ``time``-blok **præcis** som den står - begge ender med, og en bar
      dato er MIDNAT, ikke hele døgnet (``make_time_index`` udvider intet; K5-F5).
    * Perioden ≤ 366 døgn, regnet på den akse.

    Returnerer kørslens første og sidste time (ISO UTC, begge med); arbejderens
    dækningstjek af tidsserier bruger den.
    """
    from datetime import timedelta

    tid = case.get("time") or {}
    oploesning = str(tid.get("resolution") or "1h")
    if oploesning != "1h":
        raise InputFejl(f"opløsningen {oploesning!r} understøttes ikke i version 1 - kun 1h "
                        "(ved 15 min summerer modellens beløb uden intervallængde, så kroner "
                        "kan ikke sammenlignes)")
    if ps:                                      # længden er kontrolleret ovenfor
        return f"{ps}T00:00:00Z", f"{pe}T23:00:00Z"
    if "start" not in tid or "end" not in tid:
        raise InputFejl("værket har ingen time.start/time.end")
    t0 = _modeltid(tid["start"], "time.start")
    t1 = _modeltid(tid["end"], "time.end")
    if t1 < t0:
        raise InputFejl("værkets time.end ligger før time.start")
    doegn = (t1 - t0 + timedelta(hours=1)).total_seconds() / 86400
    if doegn > MAX_DOEGN:
        raise InputFejl(f"værkets tidsblok er {doegn:g} døgn (maks {MAX_DOEGN}); "
                        "vælg en kortere periode i scenariet")
    iso = "%Y-%m-%dT%H:%M:%SZ"
    return t0.strftime(iso), t1.strftime(iso)


def _json(r) -> object:
    try:
        return json.loads(r["vaerdi_json"])
    except (TypeError, ValueError) as fejl:
        raise InputFejl(f"{r.get('sti')}: værdien er ikke gyldig JSON") from fejl


def byg(raekker, heat_csv_rod: Path | None = None) -> Kørselsplan:
    """Byg den effektive case og CLI-argumenterne. Rejser ``InputFejl`` ved fejl.

    ``heat_csv_rod`` er modelkodens ``data/``-mappe: ``_koersel.heat_csv`` må kun
    navngive en fil dér (hvidliste, ingen stier — K1-F18).
    """
    vaerk, aendr, scen_case, kf = [], [], [], {}
    for r in raekker:
        k, sti = r.get("kilde"), r.get("sti") or ""
        if k == "vaerk":
            vaerk.append(r)
        elif k == "aendring":
            aendr.append(r)
        elif k == "scenarie":
            if sti.startswith(KOERSEL_PRAEFIKS):
                felt = sti[len(KOERSEL_PRAEFIKS):]
                if felt.startswith("tidsserie."):
                    rolle = felt[len("tidsserie."):]
                    if rolle not in TS.ROLLER:
                        raise InputFejl(f"ukendt tidsserie-rolle i {sti} (kendte: "
                                        f"{', '.join(TS.ROLLER)})")
                    if felt in kf:
                        raise InputFejl(f"{sti} står to gange")
                    v = _json(r)
                    if v is None or (rolle == "varmelast" and v == "syntetisk"):
                        kf[felt] = None
                    elif TS.er_frossen_ref(v):
                        kf[felt] = {"id": v["id"].lower(), "sha256": v["sha256"]}
                    else:
                        raise InputFejl(f"{sti} skal være {{\"id\": <uuid>, \"sha256\": <64 hex>}}"
                                        + (' eller "syntetisk"' if rolle == "varmelast" else ""))
                    continue
                if felt not in KOERSELFELTER:
                    raise InputFejl(f"ukendt kørselsfelt: {sti}")
                if felt in kf:
                    raise InputFejl(f"{sti} står to gange")
                v = _json(r)
                if not isinstance(v, KOERSELFELTER[felt]) or (
                        isinstance(v, bool) and bool not in KOERSELFELTER[felt]):
                    raise InputFejl(f"{sti}: forkert type {type(v).__name__}")
                kf[felt] = v
            elif sti in SOLVERSTIER:
                scen_case.append(r)
            else:
                raise InputFejl(f"scenariet må kun sætte solver.*-stier og _koersel.*, ikke {sti}")
        else:
            raise InputFejl(f"ukendt kilde {k!r} på {sti}")
    if not vaerk:
        raise InputFejl("ingen værksparametre i det frosne input")

    try:
        case = afflad(vaerk)
    except FladFejl as fejl:
        raise InputFejl(f"værkets parametre kan ikke samles: {fejl}") from fejl
    stier = {r["sti"] for r in vaerk}
    sat: set[str] = set()
    advarsler: list[str] = []

    # 1) ændringer — kun eksisterende stier (og .enabled på en eksisterende enhed)
    for r in aendr:
        sti = r["sti"]
        if sti in sat:
            raise InputFejl(f"to ændringer på samme sti: {sti}")
        sat.add(sti)
        v = _json(r)
        dele = sti.split(".")
        if dele[0] in ("time", "solver"):
            # §6c / K2-F7: periode og solver har særlige scenariefelter, hvis grænser
            # kontrolleres; en almindelig set ville gå uden om dem.
            raise InputFejl(f"{sti}: tid og solver ændres med scenariets egne felter "
                            "(periode, gab, tidsgrænse), ikke som en ændring")
        er_enabled = (len(dele) == 3 and dele[0] in ("units", "storage")
                      and dele[2] == "enabled")
        if er_enabled:
            if not isinstance((case.get(dele[0]) or {}).get(dele[1]), dict):
                raise InputFejl(f"{dele[0]}.{dele[1]} findes ikke i værket")
            if not isinstance(v, bool):
                raise InputFejl(f"{sti} skal være true/false")
        elif sti not in stier:
            raise InputFejl(f"{sti} findes ikke i værket - nye felter er en "
                            "værksændring, ikke et scenarie")
        _saet(case, sti, v)

    # 2) scenariets solverfelter (blokken oprettes, hvis den mangler)
    for r in scen_case:
        sti = r["sti"]
        if sti in sat:
            raise InputFejl(f"{sti} sættes både af en ændring og af scenariet")
        sat.add(sti)
        v = _json(r)
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise InputFejl(f"{sti} skal være et tal")
        v = float(v)
        if sti == "solver.mip_rel_gap" and not 0 <= v < 1:
            raise InputFejl(f"mip_rel_gap skal ligge i [0, 1), fik {v:g}")
        if sti == "solver.mip_abs_gap" and v < 0:
            raise InputFejl(f"mip_abs_gap skal være ≥ 0, fik {v:g}")
        if sti == "solver.time_limit" and not 0 < v <= MAX_TIDSGRAENSE_S:
            raise InputFejl(f"tidsgrænse skal være 1-{MAX_TIDSGRAENSE_S} s, fik {v:g}")
        _saet(case, sti, v)
    tl = (case.get("solver") or {}).get("time_limit")
    if tl is not None and float(tl) > MAX_TIDSGRAENSE_S:
        raise InputFejl(f"solver.time_limit {tl} overstiger loftet {MAX_TIDSGRAENSE_S} s")

    tidsserier = {rolle: kf[f"tidsserie.{rolle}"] for rolle in TS.ROLLER
                  if kf.get(f"tidsserie.{rolle}")}
    if "solprofil" in tidsserier:
        for sti in sat:
            d = sti.split(".")
            if len(d) == 3 and d[0] == "units" and d[2] == "production_profile_path":
                raise InputFejl(f"{sti} ændres i scenariet, og der er samtidig valgt en "
                                "solprofil-tidsserie - vælg det ene")

    # 3) _koersel.* -> CLI
    cli = ["--data-source", "github"]
    ps, pe = kf.get("start"), kf.get("slut")
    if bool(ps) != bool(pe):
        raise InputFejl("periode kræver både start og slut (eller ingen af dem)")
    if ps:
        d0, d1 = _dato(ps, "periodens start"), _dato(pe, "periodens slut")
        if d1 < d0:
            raise InputFejl(f"periodens slut {pe} ligger før start {ps}")
        if (d1 - d0).days + 1 > MAX_DOEGN:
            raise InputFejl(f"perioden er {(d1 - d0).days + 1} døgn (maks {MAX_DOEGN})")
        cli += ["--start", ps, "--end", pe]
    periode = _effektiv_tid(case, ps, pe)
    if kf.get("med_balancering"):
        cli.append("--with-balancing")
    bm = kf.get("balancing_method")
    if bm:
        if bm not in BALANCING_METODER:
            raise InputFejl(f"ukendt balancing_method {bm!r}")
        if bm == "activation_value" and "bid_strategy" not in (case.get("balancing") or {}):
            raise InputFejl("activation_value kræver balancing.bid_strategy i værket")
        cli += ["--balancing-method", bm]
    hc = kf.get("heat_csv")
    if hc and "varmelast" in tidsserier:
        raise InputFejl("varmelasten er valgt både som repo-fil (heat_csv) og som værkets "
                        "tidsserie - vælg det ene")
    if "varmelast" in tidsserier:
        navn = TS.lokalt_navn(tidsserier["varmelast"]["sha256"])
        if heat_csv_rod is not None and not (heat_csv_rod / navn).is_file():
            raise InputFejl("varmelast-tidsserien er ikke lagt i kørslens data/ (intern fejl)")
        cli += ["--heat-csv", f"data/{navn}", "--heat-csv-column", "mw"]
    if hc:
        if not _FILNAVN.match(hc) or ".." in hc:
            raise InputFejl(f"heat_csv må kun være et filnavn i modelrepoets data/, fik {hc!r}")
        if heat_csv_rod is not None and not (heat_csv_rod / hc).is_file():
            raise InputFejl(f"heat_csv {hc!r} findes ikke i data/")
        cli += ["--heat-csv", f"data/{hc}"]
    flag = kf.get("ekstra_flag") or []
    if len(set(flag)) != len(flag):
        raise InputFejl("et ekstra flag står to gange")
    for f in flag:
        if not isinstance(f, str) or f not in TILLADTE_FLAG:
            raise InputFejl(f"flaget {f!r} er ikke tilladt (tilladt: "
                            f"{', '.join(sorted(TILLADTE_FLAG))})")
        cli.append(f)
    for felt in ("model_commit", "data_commit"):
        if kf.get(felt) and not _SHA.match(kf[felt]):
            raise InputFejl(f"_koersel.{felt} skal være en fuld 40-tegns SHA")

    # Profilfiler er på samme hvidliste som heat_csv (KONTRAKT §6b): kun filnavne i
    # modelrepoets data/, ingen absolutte stier eller traversal. run_case opløser dem
    # relativt til cwd (= den lokale kodekopi), så en anden sti ville enten fejle
    # eller læse en fil uden for den pinnede kode.
    # Kun de tidsserier, kørslen faktisk BRUGER, hentes og dækningstjekkes; en frosset,
    # ubrugt serie (solvarmen slået fra) står i ``ubrugte`` og vises ikke som data, der
    # indgik (K5-F12).
    ubrugte: dict = {}
    sol_enheder = _saet_solprofil(case, tidsserier.get("solprofil"), advarsler)
    if "solprofil" in tidsserier and not sol_enheder:
        ubrugte["solprofil"] = tidsserier.pop("solprofil")
    for navn, enh in (case.get("units") or {}).items():
        if not isinstance(enh, dict) or "production_profile_path" not in enh:
            continue
        sti = enh["production_profile_path"]
        if sti is None:
            continue
        if (not isinstance(sti, str) or not sti.startswith("data/")
                or not _FILNAVN.match(sti[len("data/"):]) or ".." in sti):
            raise InputFejl(f"units.{navn}.production_profile_path skal være data/<fil>.csv "
                            f"i modelrepoet, fik {sti!r}")
        if heat_csv_rod is not None and not (heat_csv_rod / sti[len("data/"):]).is_file():
            raise InputFejl(f"units.{navn}.production_profile_path: {sti} findes ikke")

    tekst = yaml.safe_dump(case, sort_keys=False, allow_unicode=True,
                           default_flow_style=False, width=100)
    forskel = ligner_strengt(yaml.safe_load(tekst), case)
    if forskel:                       # yaml.safe_dump må aldrig ændre en værdi
        raise InputFejl(f"intern fejl: case.yaml rundtur afviger: {forskel}")
    return Kørselsplan(case=case, case_yaml=tekst, cli=cli, koersel=kf,
                       model_commit=kf.get("model_commit"),
                       data_commit=kf.get("data_commit"), advarsler=advarsler,
                       tidsserier=tidsserier, periode=periode, ubrugte=ubrugte,
                       anvendt_af={**({"varmelast": ["heat_demand"]} if "varmelast" in tidsserier else {}),
                                   **({"solprofil": sol_enheder} if sol_enheder else {})})


def _aktiv(enh: dict) -> bool:
    return enh.get("enabled") is not False


def _saet_solprofil(case: dict, ref: dict | None, advarsler: list) -> list[str]:
    """Sæt en frosset solprofil som ``production_profile_path`` (§6d). Returnerer de
    AKTIVE enheder, der bruger den - tom liste = profilen indgår ikke i kørslen (K5-F12).

    Enheder med markøren ``"tidsserie:solprofil"`` får den, hvis de er aktive; en
    slået-fra enhed får ``null`` (modellen læser den ikke, og arbejderen henter ikke en
    fil, der ikke bruges). Uden markør: den ene aktive ``solar_thermal``-enhed. En aktiv
    markør uden frosset solprofil er en fejl; ingen aktiv solenhed er en advarsel."""
    enheder = {n: e for n, e in (case.get("units") or {}).items() if isinstance(e, dict)}
    markeret = [n for n, e in enheder.items()
                if e.get("production_profile_path") == TS.MARKOER_SOLPROFIL]
    aktive_markerede = [n for n in markeret if _aktiv(enheder[n])]
    for n in markeret:
        if n not in aktive_markerede:          # slået fra: modellen må ikke læse markøren
            enheder[n]["production_profile_path"] = None
    if ref is None:
        if aktive_markerede:
            raise InputFejl(f"værket bruger en solprofil-tidsserie ({', '.join(aktive_markerede)}), men "
                            "ingen er valgt - aktivér en solprofil på værket eller vælg en i scenariet")
        return []
    sti = f"data/{TS.lokalt_navn(ref['sha256'])}"
    if markeret:
        for n in aktive_markerede:
            enheder[n]["production_profile_path"] = sti
        if not aktive_markerede:
            advarsler.append("solprofil-tidsserien bruges ikke: solvarmeenheden er slået fra")
        return aktive_markerede
    sol = [n for n, e in enheder.items() if e.get("type") == "solar_thermal" and _aktiv(e)]
    if not sol:
        advarsler.append("solprofil-tidsserien bruges ikke: værket har ingen aktiv solvarmeenhed")
        return []
    if len(sol) > 1:
        raise InputFejl(f"solprofil-tidsserien kan ikke placeres: {len(sol)} aktive solvarmeenheder "
                        f"({', '.join(sol)}) - marker den rette med \"{TS.MARKOER_SOLPROFIL}\"")
    enheder[sol[0]]["production_profile_path"] = sti
    return sol


def raekker_fra_vaerk(params, aendringer=(), scenarie: dict | None = None) -> list[dict]:
    """Sammensæt KoerselInput-rækker som appens ``bygFrossetInput`` gør.

    Bruges af den manuelle notebookvej og i tests. ``aendringer`` er
    ``ScenarieAendring``-agtige dicts (``type``, ``sti``, evt. ``vaerdi_json``);
    ``scenarie`` har ``Scenarie``-felterne (``periode_start``, ``periode_slut``,
    ``med_balancering``, ``balancing_method``, ``mip_rel_gap``, ``mip_abs_gap``,
    ``tidsgraense_s``, ``ekstra_flag`` (mellemrumsadskilt), ``heat_csv``) plus de
    valgfri ``model_commit``/``data_commit`` og ``tidsserier`` (rolle -> ``{id, sha256}``
    eller ``"syntetisk"``; opløst af kalderen, som ``startBestilling`` gør).
    """
    vaerk = [p if isinstance(p, dict) else p.dict() for p in params]
    ud = [{"kilde": "vaerk", "sti": p["sti"], "vaerdi_json": p["vaerdi_json"]} for p in vaerk]
    case = afflad(vaerk)
    sc = dict(scenarie or {})

    def kompakt(v):
        return json.dumps(v, ensure_ascii=False, separators=(",", ":"))

    for a in sorted(aendringer, key=lambda a: a.get("raekkefoelge") or 0):
        t = a["type"]
        if t == "set":
            ud.append({"kilde": "aendring", "sti": a["sti"], "vaerdi_json": a["vaerdi_json"]})
        elif t in ("enable", "disable"):
            navn = a["sti"]
            sektioner = [s for s in ("units", "storage") if navn in (case.get(s) or {})]
            if len(sektioner) != 1:
                raise InputFejl(f"{navn!r} er hverken en enhed eller et lager i værket"
                                if not sektioner else f"{navn!r} er både enhed og lager")
            ud.append({"kilde": "aendring", "sti": f"{sektioner[0]}.{navn}.enabled",
                       "vaerdi_json": "true" if t == "enable" else "false"})
        else:
            raise InputFejl(f"ukendt ændringstype {t!r}")

    P = KOERSEL_PRAEFIKS
    if sc.get("periode_start") and sc.get("periode_slut"):
        ud.append({"kilde": "scenarie", "sti": P + "start", "vaerdi_json": kompakt(sc["periode_start"])})
        ud.append({"kilde": "scenarie", "sti": P + "slut", "vaerdi_json": kompakt(sc["periode_slut"])})
    elif sc.get("periode_start") or sc.get("periode_slut"):
        raise InputFejl("periode kræver både start og slut (eller ingen af dem)")
    ud.append({"kilde": "scenarie", "sti": P + "med_balancering",
               "vaerdi_json": "true" if sc.get("med_balancering") else "false"})
    if sc.get("balancing_method"):
        ud.append({"kilde": "scenarie", "sti": P + "balancing_method",
                   "vaerdi_json": kompakt(sc["balancing_method"])})
    if sc.get("heat_csv"):
        ud.append({"kilde": "scenarie", "sti": P + "heat_csv", "vaerdi_json": kompakt(sc["heat_csv"])})
    flag = (sc.get("ekstra_flag") or "").split()
    if flag:
        ud.append({"kilde": "scenarie", "sti": P + "ekstra_flag", "vaerdi_json": kompakt(flag)})
    for felt, sti in (("mip_rel_gap", "solver.mip_rel_gap"), ("mip_abs_gap", "solver.mip_abs_gap"),
                      ("tidsgraense_s", "solver.time_limit")):
        if sc.get(felt) is not None:
            ud.append({"kilde": "scenarie", "sti": sti, "vaerdi_json": som_float(sc[felt])})
    for felt in ("model_commit", "data_commit"):
        if sc.get(felt):
            ud.append({"kilde": "scenarie", "sti": P + felt, "vaerdi_json": kompakt(sc[felt])})
    # §6d: de tidsserier, der skal bruges (allerede opløst: aktiv/valgt -> {id, sha256}).
    for rolle, ref in sorted((sc.get("tidsserier") or {}).items()):
        if ref is None:
            continue
        ud.append({"kilde": "scenarie", "sti": f"{P}tidsserie.{rolle}",
                   "vaerdi_json": kompakt(ref if isinstance(ref, str)
                                          else {"id": ref["id"], "sha256": ref["sha256"]})})
    return ud
