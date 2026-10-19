"""De betroede regler — tro port af ``app/rayfin/functions/src/logik.ts`` (+ ``frysning.ts``, ``sti.ts``).

Samme funktioner, samme rækkefølge af tjek og samme danske tekster som TypeScript, så de to udgaver
ikke kan blive uenige om en hash, en grænse eller en afvisning. Bindingen er de fælles testvektorer
(``skema/vektorer/``, genereret ved at KØRE TS-koden; ``tests/test_vektorer.py``), ikke denne kommentar.

To regler fra TS-filens hoved gælder også her:

1. JSON-værdier fra databasen RE-SERIALISERES ALDRIG. Strenge valideres med ``jsjson.parse`` og
   gemmes råt — ellers bliver ``12.0`` tavst til ``12`` (eller, i Python, ``12`` til ``12.0``).
2. En afvisning er en ``Afvisning`` med en dansk tekst til brugeren; alt andet er en programfejl.

Data ind og ud er dicts med databasens kolonnenavne. Nøglen ``rækker`` i TS hedder ``raekker`` her.
Alle JS-semantiske detaljer (talformat, ``Date.parse``, UTF-16-længder, ``Math.round`` …) går
gennem ``jsjson``; brug aldrig ``str()``, ``len()`` eller ``round()`` på de værdier, TS formaterer.
"""

from __future__ import annotations

import hashlib
import math
import re

from . import jsjson as J

__all__ = [
    "Afvisning", "GRAENSER", "TILLADTE_FLAG", "MAKS_STI", "MAKS_JSON", "MODEL_STANDARD",
    "KOERSEL_PRAEFIKS", "TIDSSERIE_VALG_PRAEFIKS", "SOLPROFIL_MARKOER", "MIN_DAEKNING_VARMELAST",
    "MAKS_DELE", "MAKS_BLADE", "RESERVEREDE_KODER", "KODE_MOENSTER", "FARLIGE_SEGMENTER",
    "FROSNE_ROLLER", "frossen_sti", "frossen_tidsserie",
    "laes_json", "som_float", "input_hash", "periode_doegn", "effektiv_akse", "byg_frosset_input",
    "gyldig_sti", "laes_anmodning", "planlaeg_parametre", "saml_nyt_vaerk", "ikke_endelig",
    "tjek_modelkrav",
]


class Afvisning(Exception):
    """Fejl der skal vises for brugeren — ikke en programfejl."""

    @property
    def besked(self) -> str:
        return str(self)


# ------------------------------------------------------------------ konstanter (logik.ts)

GRAENSER = {"ventende_pr_bruger": 3, "maks_periode_doegn": 366, "maks_tidsgraense_s": 3600}
TILLADTE_FLAG: tuple[str, ...] = ("--legacy-nettab",)
MAKS_STI = 400
MAKS_JSON = 4000
#: Modellens standarder (src/config.py SolverConfig), når hverken værk eller scenarie sætter dem.
MODEL_STANDARD = {"mip_rel_gap": 0.005, "mip_abs_gap": 5000, "time_limit": 600}
#: Præfiks for scenariets særlige felter (CLI-flag, ikke case-YAML) — KONTRAKT §5.2.
KOERSEL_PRAEFIKS = "_koersel."
#: Et scenaries valg af tidsserie (§6d): ``set`` på ``_tidsserie.<rolle>`` = id eller "syntetisk".
TIDSSERIE_VALG_PRAEFIKS = "_tidsserie."
SOLPROFIL_MARKOER = "tidsserie:solprofil"
MIN_DAEKNING_VARMELAST = 0.95
MAKS_DELE = 50
MAKS_BLADE = 2000
#: Koder appen selv bruger i ruten ``#/konfiguration/<kode>`` (K4-F9). = RESERVEREDE_KODER i fjv.constants.ts.
RESERVEREDE_KODER: tuple[str, ...] = ("nyt",)
KODE_MOENSTER = re.compile(r"[a-z0-9_]+", re.ASCII)            # bruges med fullmatch
#: Stisegmenter, der i JS betyder objektets prototype (K5-F1). Afvises ved alle skriveindgange.
FARLIGE_SEGMENTER = frozenset({"__proto__", "constructor", "prototype"})

_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.ASCII | re.I)
_SHA40 = re.compile(r"[0-9a-f]{40}", re.ASCII)
_SHA64 = re.compile(r"[0-9a-f]{64}", re.ASCII)
_DATO = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", re.ASCII)
_DATO_START = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", re.ASCII)  # bruges med match (præfiks)
_ZONE = re.compile(r"(Z|[+-][0-9]{2}:?[0-9]{2})\Z", re.ASCII | re.I)
_UTC_ZONE = re.compile(r"(Z|[+-]00:?00)", re.ASCII | re.I)
_TIME_SOLVER = re.compile(r"(time|solver)\.", re.ASCII)            # match = ^…
_HEAT_CSV = re.compile(r"[A-Za-z0-9_.-]+\.csv", re.ASCII)
_PROFILSTI = re.compile(r"units\.[^.]+\.production_profile_path", re.ASCII)
_STI_DEL = re.compile("[^." + re.escape(J.BLANKE) + "][^.]*", re.S)
_TT_TT = re.compile(r"([0-9]{2})-([0-9]{2})", re.ASCII)

_T = 3_600_000
_DOEGN = 86_400_000
_OPLOESNING_MS = {"1h": 3_600_000, "15min": 900_000}


# ------------------------------------------------------------------ frysning.ts

FROSNE_ROLLER = ("varmelast", "solprofil")


def frossen_sti(rolle: str) -> str:
    """Stien i det frosne input for en rolle."""
    return f"_koersel.tidsserie.{rolle}"


def frossen_tidsserie(s: dict) -> str:
    """``_koersel.tidsserie.<rolle>``'s værdi — præcis ``{id, sha256}``, id med små bogstaver."""
    return J.stringify({"id": s["id"].lower(), "sha256": s["sha256"]})


# ------------------------------------------------------------------ JSON


def laes_json(s, hvor: str):
    """Validerer at ``s`` er gyldig JSON og returnerer den parsede værdi (kun til aflæsning)."""
    tekst = s if isinstance(s, str) else J.streng(s)
    try:
        return J.parse(tekst)
    except ValueError:
        raise Afvisning(f"{hvor}: værdien er ikke gyldig JSON ({J.skive(tekst, 0, 80)}).") from None


def som_float(x) -> str:
    """Koder et tal som JSON-float: 3600 -> "3600.0", 0.0002 -> "0.0002", 1e-7 -> "1e-7"."""
    if not J.er_endelig(x):
        raise Afvisning(f"Tallet {J.js_str(x) if J.er_tal(x) else J.streng(x)} kan ikke gemmes (NaN/uendelig).")
    s = J.js_str(x)
    return s if re.search(r"[.eE]", s) else f"{s}.0"


def _kompakt(v) -> str:
    return J.stringify(v)


# ------------------------------------------------------------------ hash


def input_hash(raekker) -> str:
    """sha256 (hex) over det frosne input. DEFINITION (identisk i TS, notebooken og her):

        rækker = sorteret liste af [kilde, sti, vaerdi_json], leksikografisk på (kilde, sti, vaerdi_json)
        tekst  = JSON.stringify(rækker)       (kompakt, ingen ASCII-escaping)
        hash   = sha256(tekst som UTF-8)

    Sorteringen er JS' (UTF-16-kodeenheder), ikke Pythons (kodepunkter) — de er kun uenige for tegn
    uden for BMP mod tegn i U+E000–U+FFFF, men så skal hashen stadig være TS'.
    """
    tupler = [(r["kilde"], r["sti"], r["vaerdi_json"]) for r in raekker]
    tupler.sort(key=lambda t: tuple(J.UTF16_NOEGLE(x) for x in t))
    tekst = J.stringify([list(t) for t in tupler])
    return hashlib.sha256(tekst.encode("utf-8", "surrogatepass")).hexdigest()


# ------------------------------------------------------------------ periode


def _parse_dato(s, hvor: str) -> float:
    s = J.streng(s)
    if not _DATO.fullmatch(s):
        raise Afvisning(f'{hvor} skal være en dato på formen ÅÅÅÅ-MM-DD (fik "{s}").')
    t = J.dato_parse(f"{s}T00:00:00Z")
    if math.isnan(t) or J.iso(t)[:10] != s:
        raise Afvisning(f'{hvor}: "{s}" er ikke en gyldig dato.')
    return t


def _parse_tidsstempel(v, hvor: str) -> float:
    if not isinstance(v, str):
        raise Afvisning(f"{hvor} mangler eller er ikke en tekst.")
    t = J.dato_parse(v)
    if math.isnan(t):
        raise Afvisning(f'{hvor}: "{v}" kan ikke læses som tidspunkt.')
    return t


def periode_doegn(scenarie: dict, vaerdier: dict) -> dict:
    """Antal døgn kørslen dækker. Scenariets datoer er inklusive; værkets ``time.end`` er det sidste
    intervals start, så ét interval lægges til. ``vaerdier`` = sti -> parset værdi."""
    s = scenarie.get("periode_start") or None
    e = scenarie.get("periode_slut") or None
    if s or e:
        if not s or not e:
            raise Afvisning("Periode: både start- og slutdato skal udfyldes (eller ingen af dem).")
        a = _parse_dato(s, "Periodens start")
        b = _parse_dato(e, "Periodens slut")
        if b < a:
            raise Afvisning(f"Periodens slut ({J.streng(e)}) ligger før start ({J.streng(s)}).")
        return {"start": s, "slut": e, "doegn": J.rund((b - a) / _DOEGN) + 1}
    a = _parse_tidsstempel(vaerdier.get("time.start", J.UNDEFINED), "Værkets time.start")
    b = _parse_tidsstempel(vaerdier.get("time.end", J.UNDEFINED), "Værkets time.end")
    opl = vaerdier.get("time.resolution", J.UNDEFINED)
    skridt = _OPLOESNING_MS[opl] if isinstance(opl, str) and opl in _OPLOESNING_MS else _T
    if b < a:
        raise Afvisning("Værkets time.end ligger før time.start.")
    return {"start": J.streng(vaerdier.get("time.start", J.UNDEFINED)),
            "slut": J.streng(vaerdier.get("time.end", J.UNDEFINED)),
            "doegn": (b - a + skridt) / _DOEGN}


def _modeltid(s) -> float:
    """Et tidsstempel som modellen læser det (byg_case._modeltid): naivt = UTC, en bar dato = midnat."""
    x = J.trim(J.streng(s))
    if _DATO.fullmatch(x):
        return J.dato_parse(f"{x}T00:00:00Z")
    m = _ZONE.search(x)
    zone = m.group(1) if m else None
    # Modellen opgiver selv en anden zone end UTC — afvis før kørslen.
    if zone and not _UTC_ZONE.fullmatch(zone):
        raise Afvisning(f'Værkets tid skal være i UTC (Z), fik "{x}".')
    return J.dato_parse(x if zone else f"{x}Z")


def effektiv_akse(scenarie: dict, periode: dict) -> dict:
    """Kørslens første og sidste time (UTC ms, begge med) — den akse, modellen regner på (K5-F5)."""
    ps, pe = scenarie.get("periode_start"), scenarie.get("periode_slut")
    if ps and pe:
        return {"fra": J.dato_parse(f"{J.skive(J.streng(ps), 0, 10)}T00:00:00Z"),
                "til": J.dato_parse(f"{J.skive(J.streng(pe), 0, 10)}T23:00:00Z")}
    return {"fra": _modeltid(periode["start"]), "til": _modeltid(periode["slut"])}


def _manglende_timer(ts: dict, fra: float, til: float) -> dict:
    """Timer i [fra, til] (UTC ms, timens start), serien ikke dækker: uden for start–slut + egne huller."""
    ts_fra, ts_til = J.dato_parse(ts.get("start")), J.dato_parse(ts.get("slut"))
    vinduet = (til - fra) / _T + 1
    if ts_fra > til or ts_til < fra:
        return {"mangler": vinduet, "ukendt": False}
    mangler = J.maks(0, (ts_fra - fra) / _T) + J.maks(0, (til - ts_til) / _T)
    ukendt = False
    try:
        vj = ts.get("validering_json")
        v = J.parse(vj) if vj else {}
        if v is None:
            _kast_typefejl()                         # null.huller kaster i JS
        huller = J.felt(v, "huller")                 # en tekst/liste/tal har ingen .huller -> undefined
        if J.nullish(huller):
            huller = []
        if isinstance(huller, str):
            huller = list(huller)
        if not isinstance(huller, list):
            _kast_typefejl()
        for h in huller:
            a = J.maks(fra, J.dato_parse(_indeks(h, 0)))
            b = J.mini(til, J.dato_parse(_indeks(h, 1)))
            if b >= a:
                mangler += (b - a) / _T + 1
        if J.felt(v, "huller_fuld") is False:
            ukendt = True
    except (ValueError, TypeError):
        ukendt = True
    return {"mangler": J.rund(mangler), "ukendt": ukendt}


def _kast_typefejl():
    raise TypeError("ikke itererbar")


def _indeks(h, i):
    """``h[i]`` i JS: en liste/tekst giver elementet eller undefined; null kaster."""
    if h is None:
        raise TypeError("null[i]")
    if isinstance(h, (list, str)):
        return h[i] if i < len(h) else J.UNDEFINED
    return J.UNDEFINED


# ------------------------------------------------------------------ frysning


def _tal(v):
    return float(v) if J.er_endelig(v) else None


def _enabled_sti(navn, objekter: dict) -> str:
    if not navn or "." in navn:
        raise Afvisning(f'Til/fra skal pege på et enheds- eller lagernavn, ikke en sti ("{J.streng(navn)}").')
    i_units, i_storage = navn in objekter["units"], navn in objekter["storage"]
    if i_units and i_storage:
        raise Afvisning(f'"{navn}" findes både som enhed og som lager — angiv ændringen som en sti i stedet.')
    if not i_units and not i_storage:
        raise Afvisning(f'Værket har ingen enhed eller lager ved navn "{navn}".')
    return f"{'units' if i_units else 'storage'}.{navn}.enabled"


def _ikke_null(v):
    """``v != null`` -> v, ellers None (``scenarie.x ?? …``)."""
    return None if J.nullish(v) else v


def byg_frosset_input(params, aendringer, scenarie: dict, pins: dict | None = None,
                      tidsserier=()) -> dict:
    """KoerselInput for én bestilling (KONTRAKT §3.7) med grænserne fra §3.0 og reglerne fra §3.5.

    ``params``: ``[{sti, vaerdi_json}]``; ``aendringer``: ``[{type, sti, vaerdi_json, raekkefoelge}]``;
    ``scenarie``: Scenarie-rækkens felter (tal som tal, ikke Decimal); ``pins``: ``{model_commit,
    data_commit}``; ``tidsserier``: værkets GYLDIGE Tidsserie-rækker (``start``/``slut`` som ISO-tekst).
    Returnerer ``{"raekker", "hash", "effektiv"}``; kaster ``Afvisning`` ved brud.
    """
    pins = pins or {}
    params = list(params)
    if len(params) == 0:
        raise Afvisning("Værket har ingen parametre — er det importeret?")

    stier: dict[str, None] = {}
    vaerdier: dict = {}
    objekter = {"units": {}, "storage": {}}
    for p in params:
        sti = p["sti"]
        if sti in stier:
            raise Afvisning(f'Værket har parameteren "{sti}" to gange — ret værket før det køres.')
        stier[sti] = None
        vaerdier[sti] = laes_json(p["vaerdi_json"], f"Værksparameter {sti}")
        dele = sti.split(".")
        sek, obj = dele[0], (dele[1] if len(dele) > 1 else None)
        if obj and sek in ("units", "storage"):
            objekter[sek][obj] = None

    raekker = [{"kilde": "vaerk", "sti": p["sti"], "vaerdi_json": p["vaerdi_json"]} for p in params]
    sat: dict[str, None] = {}

    def saet(kilde: str, sti: str, vaerdi_json: str, hvorfra: str) -> None:
        if sti in sat:
            raise Afvisning(f'To ændringer rammer samme sti "{sti}" ({hvorfra}). Fjern den ene.')
        if J.laengde(sti) > MAKS_STI:
            raise Afvisning(f"Stien er for lang ({J.laengde(sti)} > {MAKS_STI} tegn).")
        if J.laengde(vaerdi_json) > MAKS_JSON:
            raise Afvisning(f"Værdien på {sti} er for lang ({J.laengde(vaerdi_json)} > {MAKS_JSON} tegn).")
        sat[sti] = None
        raekker.append({"kilde": kilde, "sti": sti, "vaerdi_json": vaerdi_json})

    def _orden(a):
        r = a.get("raekkefoelge")
        return 0.0 if J.nullish(r) else float(r)

    ts_valg: dict[str, str] = {}
    for a in sorted(aendringer, key=_orden):
        typ, a_sti = a.get("type"), a.get("sti")
        a_vj = a.get("vaerdi_json")
        if typ == "set" and a_sti.startswith(TIDSSERIE_VALG_PRAEFIKS):
            rolle = a_sti[len(TIDSSERIE_VALG_PRAEFIKS):]
            if rolle not in ("varmelast", "solprofil"):
                raise Afvisning(f'Ukendt tidsserie-rolle "{rolle}" (varmelast eller solprofil).')
            if rolle in ts_valg:
                raise Afvisning(f"Scenariet vælger {rolle} to gange — fjern den ene.")
            valg = laes_json("" if J.nullish(a_vj) else a_vj, f"Valget af {rolle}")
            if not isinstance(valg, str) or not valg:
                eller = ' eller "syntetisk"' if rolle == "varmelast" else ""
                raise Afvisning(f"Valget af {rolle} skal være en tidsseries id{eller}.")
            ts_valg[rolle] = valg.lower()
            continue
        if typ == "set":
            # K2-F7: tid og solver har egne scenariefelter; to veje til samme værdi er to sandheder.
            if _TIME_SOLVER.match(a_sti):
                raise Afvisning(f'"{a_sti}" kan ikke ændres som en værdi i et scenarie — brug scenariets '
                                f"felter for periode, gab og tidsgrænse.")
            if not gyldig_sti(a_sti):
                raise Afvisning(f'Ændringen peger på en ugyldig sti "{a_sti}".')
            if a_sti not in stier:
                raise Afvisning(f'Ændringen peger på "{a_sti}", som ikke findes i værket. Et scenarie kan kun '
                                f"ændre eksisterende værdier — nye enheder eller blokke er en værksændring.")
            if J.nullish(a_vj) or a_vj == "":
                raise Afvisning(f'Ændringen af "{a_sti}" mangler en værdi.')
            vaerdier[a_sti] = laes_json(a_vj, f"Ændringen af {a_sti}")
            saet("aendring", a_sti, a_vj, "scenariets ændringer")
        elif typ in ("enable", "disable"):
            sti = _enabled_sti(a_sti, objekter)
            vaerdier[sti] = typ == "enable"
            saet("aendring", sti, "true" if typ == "enable" else "false",
                 f"slå {a_sti} {'til' if typ == 'enable' else 'fra'}")
        else:
            raise Afvisning(f'Ukendt ændringstype "{J.streng(J.UNDEFINED if typ is None and "type" not in a else typ)}".')

    # Særlige felter. Effektive værdier = scenarie ?? værk ?? modellens standard.
    # K2-F13: kun 1h i version 1.
    oploesning = vaerdier.get("time.resolution", J.UNDEFINED)
    if J.nullish(oploesning):
        oploesning = "1h"
    if not (isinstance(oploesning, str) and oploesning == "1h"):
        raise Afvisning(f'Værket regner med opløsningen "{J.streng(oploesning)}". Appen kører i denne version '
                        f"kun 1h, fordi modellens økonomi ved 15 minutter endnu ikke er valideret (kendt begrænsning).")
    periode = periode_doegn(scenarie, vaerdier)
    if periode["doegn"] > GRAENSER["maks_periode_doegn"]:
        raise Afvisning(f"Perioden er {J.js_str(math.ceil(periode['doegn']))} døgn; højst "
                        f"{GRAENSER['maks_periode_doegn']} døgn pr. kørsel.")
    ps, pe = scenarie.get("periode_start"), scenarie.get("periode_slut")
    if ps and pe:
        saet("scenarie", f"{KOERSEL_PRAEFIKS}start", _kompakt(ps), "periode")
        saet("scenarie", f"{KOERSEL_PRAEFIKS}slut", _kompakt(pe), "periode")
    saet("scenarie", f"{KOERSEL_PRAEFIKS}med_balancering",
         "true" if scenarie.get("med_balancering") else "false", "balancering")
    bm = scenarie.get("balancing_method")
    if bm:
        if bm not in ("legacy", "activation_value"):
            raise Afvisning(f'Ukendt balanceringsmetode "{J.streng(bm)}".')
        saet("scenarie", f"{KOERSEL_PRAEFIKS}balancing_method", _kompakt(bm), "balanceringsmetode")
    heat_csv = scenarie.get("heat_csv")
    if heat_csv:
        if not _HEAT_CSV.fullmatch(heat_csv) or ".." in heat_csv:
            raise Afvisning(f'Varmelastfilen skal være et filnavn i modelrepoets data/-mappe (fik "{heat_csv}").')
        saet("scenarie", f"{KOERSEL_PRAEFIKS}heat_csv", _kompakt(heat_csv), "varmelastfil")
    ef = scenarie.get("ekstra_flag")
    flag = [f for f in J.split_ws("" if J.nullish(ef) else J.streng(ef)) if f]
    for f in flag:
        if f not in TILLADTE_FLAG:
            raise Afvisning(f'Flaget "{f}" er ikke tilladt. Tilladt: {", ".join(TILLADTE_FLAG)}.')
    if len(set(flag)) != len(flag):
        raise Afvisning("Et ekstra flag er angivet to gange.")
    if flag:
        saet("scenarie", f"{KOERSEL_PRAEFIKS}ekstra_flag", _kompakt(flag), "ekstra flag")

    # §6d: værkets egne tidsserier. Prioritet pr. rolle: scenariets valg -> repoets heat_csv (varmelast)
    # -> værkets aktive -> ingen.
    tidsserier = list(tidsserier)
    for rolle in ("varmelast", "solprofil"):
        valg = ts_valg.get(rolle)
        if rolle == "varmelast" and valg and valg != "syntetisk" and heat_csv:
            raise Afvisning("Scenariet vælger både en af værkets tidsserier og en af repoets varmelastfiler — vælg én.")
        if valg == "syntetisk":
            if rolle != "varmelast":
                raise Afvisning('"syntetisk" findes kun for varmelast.')
            continue
        ts = None
        if rolle == "solprofil" and valg and any(_PROFILSTI.fullmatch(s) for s in sat):
            raise Afvisning("Scenariet vælger både en solprofil-tidsserie og ændrer en enheds "
                            "production_profile_path — vælg én.")
        if valg:
            ts = next((x for x in tidsserier if x["id"].lower() == valg), None)
            if ts is None:
                raise Afvisning(f"Den valgte {rolle} findes ikke blandt værkets gyldige tidsserier "
                                f"(afvist, slettet eller fra et andet værk?).")
            if ts["rolle"] != rolle:
                raise Afvisning(f'"{ts["navn"]}" er en {ts["rolle"]}, ikke en {rolle}.')
        elif not (rolle == "varmelast" and heat_csv):
            aktive = [x for x in tidsserier if x["rolle"] == rolle and x.get("aktiv")]
            if len(aktive) > 1:
                raise Afvisning(f"Værket har {len(aktive)} aktive {rolle}-tidsserier — gør én af dem aktiv "
                                f"igen, før der køres.")
            ts = aktive[0] if aktive else None
        if ts is None:
            if rolle == "solprofil" and any(_PROFILSTI.fullmatch(s) and isinstance(x, str) and x == SOLPROFIL_MARKOER
                                            for s, x in vaerdier.items()):
                raise Afvisning("Værket bruger en solprofil-tidsserie, men ingen er aktiv eller valgt — gør "
                                "en af værkets solprofiler aktiv.")
            continue
        # Dækning af kørslens EFFEKTIVE akse (K5-F5), inkl. seriens egne huller.
        akse = effektiv_akse(scenarie, periode)
        fra, til = akse["fra"], akse["til"]
        timer = (til - fra) / _T + 1
        mangler = _manglende_timer(ts, fra, til)["mangler"]
        daekning = 1 - mangler / timer
        if rolle == "solprofil" and mangler > 0:
            raise Afvisning(f'Solprofilen "{ts["navn"]}" mangler {J.js_str(mangler)} af periodens '
                            f"{J.js_str(timer)} timer ({J.skive(ts['start'], 0, 10)}–{J.skive(ts['slut'], 0, 10)}); "
                            f"modellen nulfylder ikke en solprofil.")
        if rolle == "varmelast" and daekning < MIN_DAEKNING_VARMELAST:
            raise Afvisning(f'Varmelasten "{ts["navn"]}" dækker kun {J.js_str(math.floor(daekning * 100))} % af '
                            f"perioden ({J.skive(ts['start'], 0, 10)}–{J.skive(ts['slut'], 0, 10)}); modellen kræver "
                            f"mindst {J.js_str(MIN_DAEKNING_VARMELAST * 100)} %.")
        saet("scenarie", frossen_sti(rolle), frossen_tidsserie(ts), f"{rolle}-tidsserie")

    # K2-F8: model- og data-revision fryses i det hashbeskyttede input.
    for navn in ("model_commit", "data_commit"):
        sha = pins.get(navn)
        if not sha:
            continue
        if not (isinstance(sha, str) and _SHA40.fullmatch(sha)):
            raise ValueError(f"Ugyldig {navn} i pins: {J.streng(sha)}")      # programfejl, ikke Afvisning
        saet("scenarie", f"{KOERSEL_PRAEFIKS}{navn}", _kompakt(sha), navn)

    vaerk_rel = _tal(vaerdier.get("solver.mip_rel_gap"))
    vaerk_abs = _tal(vaerdier.get("solver.mip_abs_gap"))
    vaerk_tid = _tal(vaerdier.get("solver.time_limit"))
    s_rel = _ikke_null(scenarie.get("mip_rel_gap", J.UNDEFINED))
    s_abs = _ikke_null(scenarie.get("mip_abs_gap", J.UNDEFINED))
    s_tid = _ikke_null(scenarie.get("tidsgraense_s", J.UNDEFINED))
    if s_rel is not None:
        if not (J.er_tal(s_rel) and 0 <= s_rel < 1):
            raise Afvisning("Relativt MIP-gab skal ligge i [0; 1).")
        saet("scenarie", "solver.mip_rel_gap", som_float(s_rel), "relativt gab")
    if s_abs is not None:
        if not (J.er_tal(s_abs) and s_abs >= 0):
            raise Afvisning("Absolut MIP-gab skal være ≥ 0.")
        saet("scenarie", "solver.mip_abs_gap", som_float(s_abs), "absolut gab")
    if s_tid is not None:
        if not (J.er_tal(s_tid) and s_tid > 0):
            raise Afvisning("Tidsgrænsen skal være større end 0 sekunder.")
        saet("scenarie", "solver.time_limit", som_float(s_tid), "tidsgrænse")
    rel_gap = s_rel if s_rel is not None else vaerk_rel if vaerk_rel is not None else MODEL_STANDARD["mip_rel_gap"]
    abs_gap = s_abs if s_abs is not None else vaerk_abs if vaerk_abs is not None else MODEL_STANDARD["mip_abs_gap"]
    tid = s_tid if s_tid is not None else vaerk_tid if vaerk_tid is not None else MODEL_STANDARD["time_limit"]
    if tid > GRAENSER["maks_tidsgraense_s"]:
        raise Afvisning(f"Solverens tidsgrænse er {J.js_str(tid)} s; højst {GRAENSER['maks_tidsgraense_s']} s "
                        f"pr. kørsel. Sæt en lavere tidsgrænse i scenariet.")

    return {
        "raekker": raekker,
        "hash": input_hash(raekker),
        "effektiv": {"start": periode["start"], "slut": periode["slut"], "doegn": periode["doegn"],
                     "tidsgraense_s": tid, "mip_rel_gap": rel_gap, "mip_abs_gap": abs_gap},
    }


# ------------------------------------------------------------------ værksændringer


def gyldig_sti(sti) -> bool:
    """En gyldig værkssti: ikke tom, ≤ MAKS_STI, ingen tomme segmenter og ingen prototype-segmenter."""
    return (isinstance(sti, str) and bool(sti) and J.laengde(sti) <= MAKS_STI
            and all(_STI_DEL.fullmatch(d) and d not in FARLIGE_SEGMENTER for d in sti.split(".")))


def _laes_kode_og_navn(o) -> tuple[str, str, str | None]:
    kode_v = J.felt(o, "ny_kode")
    kode = "" if J.nullish(kode_v) else J.streng(kode_v)
    navn_v = J.felt(o, "navn")
    navn = J.trim("" if J.nullish(navn_v) else J.streng(navn_v))
    if not KODE_MOENSTER.fullmatch(kode) or J.laengde(kode) > 60:
        raise Afvisning(f'Koden "{kode}" skal bestå af små bogstaver, cifre og _ (højst 60 tegn).')
    if kode in RESERVEREDE_KODER:
        raise Afvisning(f'Koden "{kode}" er reserveret af appen — vælg en anden.')
    if not navn or J.laengde(navn) > 200:
        raise Afvisning("Det nye værk skal have et navn (højst 200 tegn).")
    b = J.felt(o, "beskrivelse")
    beskrivelse = None if J.nullish(b) else J.streng(b)
    if beskrivelse and J.laengde(beskrivelse) > 4000:
        raise Afvisning("Beskrivelsen er for lang (højst 4000 tegn).")
    return kode, navn, beskrivelse


def _laes_heltal(x, navn: str, mini: int, maks: int) -> int:
    if not J.er_heltal(x) or x < mini or x > maks:
        raise Afvisning(f"{navn} skal være et helt tal mellem {J.js_str(mini)} og {J.js_str(maks)}.")
    return int(x)


def _laes_udkast(x) -> str:
    s = "" if J.nullish(x) else J.streng(x)
    if not _UUID.fullmatch(s):
        raise Afvisning("Udkastets id er ikke et gyldigt uuid.")
    return s.lower()


def laes_anmodning(aendringer_json: str) -> dict:
    """Fortolker og validerer ``Aendringsanmodning.aendringer_json``. Returnerer samme form som TS:
    ``{"type": "parametre", "aendringer": [...]}``, ``{"type": "kopi", "kopi": {...}}``, ``opret``,
    ``opret_del`` (``del``), ``upload_tidsserie``/``upload_vaerksark`` (``upload``), ``aktiver_tidsserie``
    (``aktiver``)."""
    v = laes_json(aendringer_json, "Ændringsanmodningen")
    if not isinstance(v, list) or len(v) == 0:
        raise Afvisning("Ændringsanmodningen skal være en ikke-tom liste.")
    f0 = v[0]
    h0 = J.felt(f0, "handling")                      # `første && første.handling`: ikke-objekter giver undefined
    if h0 == "kopier_vaerk":
        if len(v) != 1:
            raise Afvisning("En kopi af et værk skal være den eneste handling i anmodningen.")
        kode, navn, beskrivelse = _laes_kode_og_navn(f0)
        return {"type": "kopi", "kopi": {"handling": "kopier_vaerk", "ny_kode": kode, "navn": navn,
                                         "beskrivelse": beskrivelse}}
    if h0 in ("upload_tidsserie", "upload_vaerksark", "aktiver_tidsserie"):
        if len(v) != 1:
            raise Afvisning("En upload eller aktivering skal være den eneste handling i anmodningen.")
        fn = J.felt(f0, "filnavn")
        filnavn = J.trim("" if J.nullish(fn) else J.streng(fn))
        sh = J.felt(f0, "sha256")
        sha = ("" if J.nullish(sh) else J.streng(sh)).lower()
        if h0 == "aktiver_tidsserie":
            ti = J.felt(f0, "tidsserie_id")
            tid = ("" if J.nullish(ti) else J.streng(ti)).lower()
            if not _UUID.fullmatch(tid):
                raise Afvisning("Tidsseriens id er ikke et gyldigt uuid.")
            aktiv = J.felt(f0, "aktiv")
            if not isinstance(aktiv, bool):
                raise Afvisning('"aktiv" skal være true eller false.')
            return {"type": "aktiver_tidsserie",
                    "aktiver": {"handling": "aktiver_tidsserie", "tidsserie_id": tid, "aktiv": aktiv}}
        if not filnavn or J.laengde(filnavn) > 300:
            raise Afvisning("Filnavnet mangler eller er for langt (højst 300 tegn).")
        if not _SHA64.fullmatch(sha):
            raise Afvisning("Filens sha256 mangler eller er ugyldig.")
        if h0 == "upload_vaerksark":
            ts_ = J.felt(f0, "timeslut")
            if not J.nullish(ts_) and not isinstance(ts_, bool):
                raise Afvisning('"timeslut" skal være true, false eller udeladt.')
            return {"type": "upload_vaerksark",
                    "upload": {"handling": "upload_vaerksark", "filnavn": filnavn, "sha256": sha,
                               "timeslut": None if J.nullish(ts_) else ts_}}
        rolle = J.felt(f0, "rolle")
        if rolle not in ("varmelast", "solprofil") or not isinstance(rolle, str):
            raise Afvisning(f'Ukendt rolle "{J.streng(rolle)}" (varmelast eller solprofil).')
        tidsstempel = J.felt(f0, "tidsstempel")
        if not (isinstance(tidsstempel, str) and tidsstempel in ("start", "slut")):
            raise Afvisning('Tidsstemplet skal være "start" eller "slut" på timen.')
        nv = J.felt(f0, "navn")
        navn = J.trim("" if J.nullish(nv) else J.streng(nv)) or filnavn
        if J.laengde(navn) > 200:
            raise Afvisning("Navnet er for langt (højst 200 tegn).")
        tz = J.felt(f0, "tidszone")
        tidszone = "" if J.nullish(tz) else J.streng(tz)
        if not tidszone or J.laengde(tidszone) > 40:
            raise Afvisning("Tidszonen mangler — vælg UTC eller dansk lokaltid.")
        en = J.felt(f0, "enhed")
        enhed = "" if J.nullish(en) else J.streng(en)
        if not enhed or J.laengde(enhed) > 20:
            raise Afvisning("Enheden mangler — vælg MW, kW, MWh eller kWh pr. interval.")
        ko = J.felt(f0, "kolonne")
        kolonne = None if (J.nullish(ko) or ko == "") else J.streng(ko)
        if kolonne and J.laengde(kolonne) > 200:
            raise Afvisning("Kolonnenavnet er for langt.")
        return {"type": "upload_tidsserie",
                "upload": {"handling": "upload_tidsserie", "rolle": rolle, "navn": navn, "filnavn": filnavn,
                           "tidsstempel": tidsstempel, "tidszone": tidszone, "enhed": enhed,
                           "kolonne": kolonne, "sha256": sha}}
    if h0 in ("opret_vaerk", "opret_vaerk_del"):
        if len(v) != 1:
            raise Afvisning("Oprettelse af et værk skal være den eneste handling i anmodningen.")
        udkast = _laes_udkast(J.felt(f0, "udkast"))
        if h0 == "opret_vaerk":
            kode, navn, beskrivelse = _laes_kode_og_navn(f0)
            dele = _laes_heltal(J.felt(f0, "dele"), "Antal dele", 1, MAKS_DELE)
            return {"type": "opret", "opret": {"handling": "opret_vaerk", "udkast": udkast, "dele": dele,
                                               "ny_kode": kode, "navn": navn, "beskrivelse": beskrivelse}}
        af = _laes_heltal(J.felt(f0, "af"), "Antal dele", 1, MAKS_DELE)
        nr = _laes_heltal(J.felt(f0, "nr"), "Delens nummer", 1, af)
        blade = J.felt(f0, "blade")
        if not isinstance(blade, list) or len(blade) == 0:
            raise Afvisning(f"Del {nr} af {af} har ingen blade.")
        return {"type": "opret_del", "del": {"handling": "opret_vaerk_del", "udkast": udkast, "nr": nr,
                                             "af": af, "blade": blade}}
    ud, set_ = [], set()
    for i, r in enumerate(v):
        sv = J.felt(r, "sti")
        sti = "" if J.nullish(sv) else J.streng(sv)
        handling = J.felt(r, "handling")
        if not (isinstance(handling, str) and handling in ("opret", "ret", "slet")):
            raise Afvisning(f'Ændring {i + 1}: ukendt handling "{J.streng(handling)}".')
        if not gyldig_sti(sti):
            raise Afvisning(f'Ændring {i + 1}: ugyldig sti "{sti}".')
        if sti in set_:
            raise Afvisning(f'Stien "{sti}" ændres to gange i samme anmodning.')
        set_.add(sti)
        ny_json = None
        if handling != "slet":
            nj = J.felt(r, "ny_json")
            if not isinstance(nj, str) or not nj:
                raise Afvisning(f"Ændring af {sti}: mangler ny værdi.")
            if J.laengde(nj) > MAKS_JSON:
                raise Afvisning(f"Ændring af {sti}: værdien er for lang (højst {MAKS_JSON} tegn).")
            f = ikke_endelig(laes_json(nj, f"Ændring af {sti}"))
            if f is not None:
                raise Afvisning(f"Ændring af {sti}: {J.js_str(f)} er ikke et endeligt tal.")
            ny_json = nj
        ud.append({"sti": sti, "handling": handling, "ny_json": ny_json})
    return {"type": "parametre", "aendringer": ud}


def planlaeg_parametre(nuvaerende: dict, aendringer) -> dict:
    """Sammenholder parameterændringer med værkets nuværende blade (``nuvaerende``: sti -> vaerdi_json,
    i databasens rækkefølge). ``opret`` må ikke ramme et eksisterende blad, og et nyt blad må hverken
    ligge UNDER et eksisterende blad eller OVER et — ellers kan YAML'en ikke genskabes."""
    aendringer = list(aendringer)
    plan = {"opret": [], "ret": [], "slet": []}
    slettes = {a["sti"] for a in aendringer if a["handling"] == "slet"}
    efter_slet = {s: None for s in nuvaerende if s not in slettes}
    for a in aendringer:
        sti = a["sti"]
        gammel = nuvaerende.get(sti)
        if a["handling"] == "opret":
            if gammel is not None:
                raise Afvisning(f'"{sti}" findes allerede — brug ret i stedet for opret.')
            for s in efter_slet:
                if sti.startswith(f"{s}."):
                    raise Afvisning(f'"{sti}" kan ikke oprettes, fordi "{s}" allerede er en værdi.')
                if s.startswith(f"{sti}."):
                    raise Afvisning(f'"{sti}" kan ikke blive en værdi, fordi "{s}" ligger under den.')
            dele = sti.split(".")
            har_objekt = dele[0] in ("units", "storage", "prices") and len(dele) > 2
            plan["opret"].append({"sti": sti, "ny_json": a["ny_json"], "sektion": dele[0],
                                  "objekt": dele[1] if har_objekt else None})
            efter_slet[sti] = None
        elif gammel is None:
            raise Afvisning(f'"{sti}" findes ikke i værket (måske slettet af en anden).')
        elif a["handling"] == "ret":
            if gammel != a["ny_json"]:
                plan["ret"].append({"sti": sti, "gammel_json": gammel, "ny_json": a["ny_json"]})
        else:
            plan["slet"].append({"sti": sti, "gammel_json": gammel})
    if len(plan["opret"]) + len(plan["ret"]) + len(plan["slet"]) == 0:
        raise Afvisning("Anmodningen ændrer ingenting.")
    return plan


# ------------------------------------------------------------------ nyt værk fra bunden


def saml_nyt_vaerk(dele, antal: int, udkast: str) -> list[dict]:
    """Samler et nyt værks dele (``opret_vaerk_del``-anmodningernes ``del``) til én bladliste og
    validerer den. Delene skal være præcis nr. 1..``antal``, hver med ``af = antal``; bladene beholder
    delenes rækkefølge (= ``raekkefoelge``). Til sidst modellens minimumskrav (``tjek_modelkrav``)."""
    dele = list(dele)
    fremmed = next((d for d in dele if d["udkast"] != udkast), None)
    if fremmed is not None:
        raise Afvisning("En del hører til et andet udkast.")
    forkert = next((d for d in dele if d["af"] != antal), None)
    if forkert is not None:
        raise Afvisning(f"Del {J.js_str(forkert['nr'])} siger {J.js_str(forkert['af'])} dele, men oprettelsen "
                        f"siger {J.js_str(antal)}.")
    pr: dict = {}
    for d in dele:
        if d["nr"] in pr:
            raise Afvisning(f"Del {J.js_str(d['nr'])} findes to gange — send oprettelsen igen fra begyndelsen.")
        pr[d["nr"]] = d
    mangler = [n for n in range(1, int(antal) + 1) if n not in pr]
    if mangler:
        raise Afvisning(f"Del {', '.join(map(str, mangler))} af {J.js_str(antal)} mangler — send oprettelsen "
                        f"igen fra begyndelsen.")

    ud: list[dict] = []
    set_: dict[str, None] = {}
    for n in range(1, int(antal) + 1):
        for b in pr[n]["blade"]:
            sv = J.felt(b, "sti")
            sti = "" if J.nullish(sv) else J.streng(sv)
            if not gyldig_sti(sti):
                raise Afvisning(f'Ugyldig sti "{sti}".')
            if sti in set_:
                raise Afvisning(f'Stien "{sti}" står to gange.')
            set_[sti] = None
            nj = J.felt(b, "ny_json")
            if not isinstance(nj, str) or not nj:
                raise Afvisning(f"{sti}: mangler værdi.")
            if J.laengde(nj) > MAKS_JSON:
                raise Afvisning(f"{sti}: værdien er for lang (højst {MAKS_JSON} tegn).")
            laes_json(nj, sti)
            ko = J.felt(b, "kommentar")
            kommentar = None if (J.nullish(ko) or ko == "") else J.streng(ko)
            if kommentar and J.laengde(kommentar) > 2000:
                raise Afvisning(f"{sti}: kommentaren er for lang (højst 2000 tegn).")
            d = sti.split(".")
            har_objekt = d[0] in ("units", "storage", "prices") and len(d) > 2
            ud.append({"sti": sti, "vaerdi_json": nj, "sektion": d[0], "objekt": d[1] if har_objekt else None,
                       "bekraeft": J.felt(b, "bekraeft") is True, "kommentar": kommentar,
                       "raekkefoelge": len(ud) + 1})
            if len(ud) > MAKS_BLADE:
                raise Afvisning(f"Værket har for mange blade (højst {MAKS_BLADE}).")
    # Et blad over/under et andet: tjek hvert blads egne præfikser (ikke naboer efter sortering).
    for sti in set_:
        d = sti.split(".")
        for i in range(1, len(d)):
            over = ".".join(d[:i])
            if over in set_:
                raise Afvisning(f'"{over}" kan ikke være en værdi, fordi "{sti}" ligger under den.')
    tjek_modelkrav(ud)
    return ud


# ------------------------------------------------------------------ modelkrav (K4-F1)


def ikke_endelig(v):
    """Første ikke-endelige tal i en JSON-værdi (rekursivt, JS' nøglerækkefølge), eller None."""
    if J.er_tal(v):
        return None if math.isfinite(v) else v
    if isinstance(v, list):
        for x in v:
            f = ikke_endelig(x)
            if f is not None:
                return f
        return None
    if isinstance(v, dict):
        for k in J.noegler(v):
            f = ikke_endelig(v[k])
            if f is not None:
                return f
    return None


_BRAENDSEL_UDEN_PRIS = {"electricity", "solar"}
_NT = "electricity.tariff_consumption.net_tariff"


def tjek_modelkrav(blade) -> None:
    """Modellens minimumskrav til et værk (K4-F1) — et MINIMUM: afviser hvad modellen med sikkerhed
    ikke kan indlæse eller regne på. Alle beskeder samles i én afvisning (højst 8 vist)."""
    blade = list(blade)
    v: dict = {}
    for b in blade:
        v[b["sti"]] = J.parse(b["vaerdi_json"])        # ugyldig JSON her er en programfejl (prævalideret)
    fejl: list[str] = []
    for sti, x in v.items():
        f = ikke_endelig(x)
        if f is not None:
            fejl.append(f"{sti} er ikke et endeligt tal ({J.js_str(f)})")

    def tal(sti: str, mini: float = -math.inf) -> None:
        x = v.get(sti, J.UNDEFINED)
        if not J.er_endelig(x):
            fejl.append(f"{sti} mangler eller er ikke et tal")
        elif x < mini:
            fejl.append(f"{sti} må ikke være under {J.js_str(mini)}")

    def tekst(sti: str) -> None:
        x = v.get(sti, J.UNDEFINED)
        if not isinstance(x, str) or not J.trim(x):
            fejl.append(f"{sti} mangler eller er ikke en tekst")

    for s in ("meta.case_name", "data.dmi_area", "data.price_zone", "time.resolution", "electricity.spot_area"):
        tekst(s)
    for s in ("time.start", "time.end"):
        x = v.get(s, J.UNDEFINED)
        if not isinstance(x, str) or not _DATO_START.match(x):
            fejl.append(f"{s} mangler eller er ikke en dato (ÅÅÅÅ-MM-DD)")
    start, slut = v.get("time.start", J.UNDEFINED), v.get("time.end", J.UNDEFINED)
    if (isinstance(start, str) and isinstance(slut, str) and _DATO_START.match(start) and _DATO_START.match(slut)
            and J.UTF16_NOEGLE(J.skive(start, 0, 10)) >= J.UTF16_NOEGLE(J.skive(slut, 0, 10))):
        fejl.append("time.end skal ligge efter time.start")
    tal("heat_load_params.gaf_mw_per_k", 0)
    for s in ("prices.co2_eua.value", "electricity.tariff_consumption_flat", "electricity.tariff_production_flat",
              "electricity.electricity_tax"):
        tal(s)

    enheder = list(dict.fromkeys(_seg(b["sti"], 1) for b in blade if b["sti"].startswith("units.")))
    aktive = [n for n in enheder if v.get(f"units.{n}.enabled", J.UNDEFINED) is not False]
    if len(aktive) == 0:
        fejl.append("værket skal have mindst én aktiv enhed (units.<navn>)")
    for n in enheder:
        u = f"units.{n}"
        tekst(f"{u}.type")
        tekst(f"{u}.fuel")
        tal(f"{u}.p_max_heat", 0)
        tal(f"{u}.p_min_heat", 0)
        tal(f"{u}.alpha")
        pmax, pmin = v.get(f"{u}.p_max_heat"), v.get(f"{u}.p_min_heat")
        if J.er_tal(pmax) and J.er_tal(pmin) and pmin > pmax:
            fejl.append(f"{u}.p_min_heat er større end p_max_heat")
        fuel = v.get(f"{u}.fuel")
        if isinstance(fuel, str) and fuel and fuel not in _BRAENDSEL_UDEN_PRIS:
            tal(f"{u}.eta_fuel_to_heat")
            eta = v.get(f"{u}.eta_fuel_to_heat")
            if J.er_tal(eta) and eta <= 0:
                fejl.append(f"{u}.eta_fuel_to_heat skal være større end 0")
            if v.get(f"{u}.enabled", J.UNDEFINED) is not False:
                tal(f"prices.{fuel}.value")

    lagre = list(dict.fromkeys(_seg(b["sti"], 1) for b in blade if b["sti"].startswith("storage.")))
    if "storage" not in v and len(lagre) == 0:
        fejl.append("storage mangler (et værk uden lager har en tom storage-blok)")
    for n in lagre:
        for f in ("volume_m3", "delta_t_k", "e_initial_mwh", "p_max_charge_mw", "p_max_discharge_mw"):
            tal(f"storage.{n}.{f}", 0)
        tal(f"storage.{n}.self_discharge_per_hour", 0)

    if any(b["sti"].startswith(f"{_NT}.") for b in blade):
        tekst("electricity.tariff_consumption.unit")
        baand = list(dict.fromkeys(_seg(b["sti"], 4) for b in blade if b["sti"].startswith(f"{_NT}.bands.")))
        if len(baand) == 0:
            fejl.append(f"{_NT}.bands mangler")
        for b in baand:
            tal(f"{_NT}.bands.{J.streng(b)}")
        saesoner = list(dict.fromkeys(_seg(b["sti"], 4) for b in blade if b["sti"].startswith(f"{_NT}.seasons.")))
        if len(saesoner) == 0:
            fejl.append(f"{_NT}.seasons mangler")
        maaneder: list = []
        for s in saesoner:
            ss = J.streng(s)
            m = v.get(f"{_NT}.seasons.{ss}.months", J.UNDEFINED)
            if not isinstance(m, list) or not all(J.er_heltal(x) and 1 <= x <= 12 for x in m):
                fejl.append(f"{_NT}.seasons.{ss}.months skal være en liste af måneder 1-12")
            else:
                maaneder.extend(m)
            for dag in ("weekday", "weekend"):
                foer = f"{_NT}.seasons.{ss}.{dag}."
                timer = [0] * 24
                for b in blade:
                    if not b["sti"].startswith(foer):
                        continue
                    r = _TT_TT.fullmatch(J.skive(b["sti"], J.laengde(foer)))
                    if not r:
                        fejl.append(f"{b['sti']}: timeintervallet skal skrives TT-TT")
                        continue
                    t, slut_t = int(r.group(1)), int(r.group(2))
                    while t < slut_t and t < 24:
                        timer[t] += 1
                        t += 1
                    navn = v.get(b["sti"])
                    if not isinstance(navn, str) or navn not in baand:
                        fejl.append(f"{b['sti']} peger på et bånd, der ikke findes ({J.stringify(navn)})")
                huller = [t for t, n_ in enumerate(timer) if n_ != 1]
                if huller:
                    fejl.append(f"{foer[:-1]} dækker ikke hver time præcis én gang (time "
                                f"{', '.join(map(str, huller))})")
        dubletter = [m for i, m in enumerate(maaneder) if _indeks_af(maaneder, m) != i]
        mangler = [m for m in range(1, 13) if not any(float(x) == m for x in maaneder)]
        if saesoner and (dubletter or mangler):
            dub = list(dict.fromkeys(float(x) for x in dubletter))
            fejl.append(f"sæsonerne skal dække hver måned præcis én gang (mangler "
                        f"{', '.join(map(str, mangler)) or '-'}, dobbelt {', '.join(J.js_str(x) for x in dub) or '-'})")
        net = v.get("electricity.tariff_consumption.fixed_components.elafgift_net", J.UNDEFINED)
        if net is not J.UNDEFINED and not J.streng_lig(net, v.get("electricity.electricity_tax", J.UNDEFINED)):
            fejl.append("fixed_components.elafgift_net skal være lig electricity.electricity_tax")

    if fejl:
        vis = fejl[:8]
        rest = f" (og {len(fejl) - len(vis)} mere)" if len(fejl) > len(vis) else ""
        raise Afvisning(f"Værket kan ikke bruges af modellen: {'; '.join(vis)}{rest}.")


def _seg(sti: str, i: int):
    """``sti.split('.')[i]`` (``undefined``, hvis der ikke er så mange segmenter)."""
    d = sti.split(".")
    return d[i] if i < len(d) else J.UNDEFINED


def _indeks_af(liste: list, x) -> int:
    """``liste.indexOf(x)`` med JS' ``===`` (tal sammenlignes som tal)."""
    for i, y in enumerate(liste):
        if J.streng_lig(y, x):
            return i
    return -1
