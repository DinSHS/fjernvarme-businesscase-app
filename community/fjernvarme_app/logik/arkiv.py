"""Arkivets genimport (runde 13) — tro port af ``app/rayfin/functions/src/arkiv.ts``.

Reglerne, rækkefølgen af tjek og de danske tekster er TS'; de fælles vektorer i ``skema/vektorer/arkiv/`` (genereret
ved at køre TS, ``skema/vektorer/arkiv/generer_arkiv.mts``) binder de to. Forløbet ``importer_del`` kører mod
``betroet_lager`` (verberne ``arkiv_*`` i ``SqlTransaktion``), som Function'en kører mod mssql.

Tekst sammenlignes og sorteres som i JS (UTF-16-kodeenheder), tal skrives som JS' ``String(x)`` (``jsjson``), så en
tabels sha256 og et frosset inputs hash er de samme i begge udgaver.
"""

from __future__ import annotations

import hashlib
import math
import re
from datetime import datetime, timezone

from . import jsjson as J
from .regler import input_hash

__all__ = ["ArkivAfvisning", "IMPORT_TABELLER", "KOERSEL_BOERN", "AFSLUTTEDE_STATUS", "NIL_UUID", "kolonner",
           "kolonnenavne", "kanonisk", "kanonisk_raekke", "raekke_tekst", "tabel_sha", "fejl_i_vaerdi", "fejl_i_raekke",
           "forskelle", "sammenlign", "vaerk_sha", "vaerk_revisioner", "frosne_tidsserier", "laes_import_anmodning",
           "laes_del", "tjek_koersel", "importer_del", "sha256_tekst"]


class ArkivAfvisning(Exception):
    """En afvisning med en dansk tekst til brugeren (TS' ``ArkivAfvisning``)."""


DEL_FORMAT = "fjv-arkiv-del"
NIL_UUID = "00000000-0000-0000-0000-000000000000"
IMPORT_TABELLER = ("Scenarie", "ScenarieAendring", "Bestilling", "KoerselInput", "KoerselNoegletal", "KoerselMaaned",
                   "KoerselTime", "Koersel")
KOERSEL_BOERN = ("KoerselInput", "KoerselNoegletal", "KoerselMaaned", "KoerselTime")
AFSLUTTEDE_STATUS = ("faerdig", "fejl", "annulleret")
MAKS_KOERSLER_PR_DEL = 60

_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.ASCII)
_ISO_MS = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", re.ASCII)
_SHA = re.compile(r"[0-9a-f]{64}", re.ASCII)
_ISO_TID = re.compile(r"\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?)?(Z|[+-]\d{2}:\d{2})?", re.ASCII)
_INT_MIN, _INT_MAX = -2147483648, 2147483647

_SKEMA: dict | None = None


def _tabeller() -> dict:
    global _SKEMA
    if _SKEMA is None:
        from ..skema import fjv_skema
        _SKEMA = {t["entitet"]: t for t in fjv_skema().laes()["tabeller"]}
    return _SKEMA


def kolonner(tabel: str) -> list[dict]:
    return _tabeller()[tabel]["kolonner"]


def kolonnenavne(tabel: str) -> list[str]:
    return [k["navn"] for k in kolonner(tabel)]


def sha256_tekst(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8", "surrogatepass")).hexdigest()


# ------------------------------------------------------------------ kanonisk form

def _iso(t_ms: float) -> str:
    d = datetime.fromtimestamp(t_ms / 1000, tz=timezone.utc)
    return d.strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(t_ms) % 1000:03d}Z"


def _parse_tid(v: str) -> float:
    """``Date.parse`` for ISO-former (uden zone = UTC). NaN ved alt andet."""
    from ..typer import til_utc
    if not _ISO_TID.fullmatch(v):
        return math.nan
    try:
        d = til_utc(v)
    except ValueError:
        return math.nan
    return (d.replace(tzinfo=timezone.utc) - datetime(1970, 1, 1, tzinfo=timezone.utc)).total_seconds() * 1000


def kanonisk(k: dict, v):
    """En databaseværdi i arkivets form (TS' ``kanonisk``)."""
    if v is None:
        return None
    t = k["type"]
    navn = k["navn"]
    if t == "uuid":
        if not isinstance(v, str):
            raise ArkivAfvisning(f"{navn}: forventede et uuid, fik {_jstype(v)}.")
        return v.lower()
    if t in ("text", "set"):
        if isinstance(v, str):
            return v
        raise ArkivAfvisning(f"{navn}: forventede tekst, fik {_jstype(v)}.")
    if t in ("int", "decimal"):
        if isinstance(v, bool):
            n = math.nan
        elif J.er_tal(v) or _er_decimal(v):
            n = float(v)
        elif isinstance(v, str) and v.strip() != "":
            n = J.tal(v)
        else:
            n = math.nan
        if not math.isfinite(n):
            raise ArkivAfvisning(f"{navn}: forventede et tal, fik {_js_streng(v)}.")
        if n == 0:
            return 0
        return int(n) if float(n).is_integer() and abs(n) < 2 ** 53 else n
    if t == "boolean":
        if isinstance(v, bool):
            return v
        if v == 0 or v == 1:
            return v == 1
        raise ArkivAfvisning(f"{navn}: forventede sand/falsk, fik {_js_streng(v)}.")
    if t == "datetime":
        if isinstance(v, datetime):
            d = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
            ms = (d - datetime(1970, 1, 1, tzinfo=timezone.utc)).total_seconds() * 1000
            ms = math.floor(round(ms, 3))
        elif isinstance(v, str):
            ms = _parse_tid(v)
        else:
            ms = math.nan
        if not math.isfinite(ms):
            raise ArkivAfvisning(f"{navn}: forventede et tidspunkt, fik {_js_streng(v)}.")
        return _iso(ms)
    raise ArkivAfvisning(f"{navn}: ukendt type {t}.")


def _er_decimal(v) -> bool:
    from decimal import Decimal
    return isinstance(v, Decimal)


def _jstype(v) -> str:
    if isinstance(v, bool):
        return "boolean"
    if J.er_tal(v) or _er_decimal(v):
        return "number"
    if isinstance(v, str):
        return "string"
    return "object"


def _js_streng(v) -> str:
    """``String(v)``."""
    return J.streng(v)


def kanonisk_raekke(tabel: str, r: dict) -> list:
    return [kanonisk(k, r.get(k["navn"])) for k in kolonner(tabel)]


def raekke_tekst(r) -> str:
    return J.stringify(list(r))


def tabel_sha(raekker) -> str:
    linjer = sorted((raekke_tekst(r) for r in raekker), key=J.UTF16_NOEGLE)
    return sha256_tekst("\n".join(linjer))


# ------------------------------------------------------------------ validering

def _len_uden_halemellemrum(s: str) -> int:
    return J.laengde(s.rstrip(" "))


def fejl_i_vaerdi(k: dict, v) -> str | None:
    navn = k["navn"]
    if v is None:
        return None if k["nullable"] else f"{navn} må ikke være tom."
    t = k["type"]
    if t == "uuid":
        return None if isinstance(v, str) and _UUID.fullmatch(v) else f"{navn} er ikke et uuid med små bogstaver."
    if t in ("text", "set"):
        if not isinstance(v, str):
            return f"{navn} skal være tekst."
        if k.get("max") is not None and J.laengde(v) > k["max"]:
            return f"{navn} er for lang ({J.laengde(v)} > {k['max']} tegn)."
        if k.get("min") is not None and _len_uden_halemellemrum(v) < k["min"]:
            return f"{navn} er for kort."
        if k.get("vaerdier") and v not in k["vaerdier"]:
            return f'{navn} har en ukendt værdi "{v}".'
        if k.get("moenster") and not re.search(k["moenster"], v):
            return f"{navn} har ikke den forventede form."
        if navn.endswith("_json"):
            try:
                J.parse(v)
            except Exception:
                return f"{navn} er ikke gyldig JSON."
        return None
    if t == "int":
        ok = J.er_tal(v) and math.isfinite(v) and float(v).is_integer() and _INT_MIN <= v <= _INT_MAX
        return None if ok else f"{navn} skal være et heltal."
    if t == "decimal":
        if not J.er_tal(v) or not math.isfinite(v):
            return f"{navn} skal være et tal."
        loft = float(10 ** ((k.get("precision") or 38) - (k.get("scale") or 0)))     # en double, som JS' 10 ** n
        return None if abs(v) < loft else f"{navn} er for stort til kolonnen."
    if t == "boolean":
        return None if isinstance(v, bool) else f"{navn} skal være sand eller falsk."
    if t == "datetime":
        ok = isinstance(v, str) and _ISO_MS.fullmatch(v) and math.isfinite(_parse_tid(v)) and _iso(_parse_tid(v)) == v
        return None if ok else f"{navn} er ikke et tidspunkt i UTC (ÅÅÅÅ-MM-DDTtt:mm:ss.sssZ)."
    return f"{navn}: ukendt type."


def fejl_i_raekke(tabel: str, r) -> list[str]:
    ks = kolonner(tabel)
    if len(r) != len(ks):
        return [f"{tabel}: rækken har {len(r)} værdier, skemaet {len(ks)}."]
    return [f for f in (fejl_i_vaerdi(k, x) for k, x in zip(ks, r)) if f is not None]


# ------------------------------------------------------------------ sammenligning

def _lig(a, b) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if J.er_tal(a) and J.er_tal(b):
        return float(a) == float(b)
    return a == b


def forskelle(tabel: str, a, b) -> list[str]:
    return [n for n, x, y in zip(kolonnenavne(tabel), a, b) if not _lig(x, y)]


def sammenlign(tabel: str, arkiv, db: dict | None) -> dict:
    if not db:
        return {"udfald": "ny", "kolonner": []}
    f = forskelle(tabel, arkiv, kanonisk_raekke(tabel, db))
    return {"udfald": "konflikt" if f else "ens", "kolonner": f}


# ------------------------------------------------------------------ værkets revisioner

def vaerk_sha(blade) -> str:
    return input_hash([{"kilde": "vaerk", "sti": b["sti"], "vaerdi_json": b["vaerdi_json"]} for b in blade])


def vaerk_revisioner(revision: int, blade, log) -> dict[str, list[int]]:
    tilstand = {b["sti"]: b["vaerdi_json"] for b in blade}
    pr_revision: dict[int, list] = {}
    for rad in log:
        pr_revision.setdefault(int(rad["revision"]), []).append(rad)
    ud: dict[str, list[int]] = {}
    for rev in range(int(revision), 0, -1):
        sha = vaerk_sha([{"sti": s, "vaerdi_json": v} for s, v in tilstand.items()])
        ud.setdefault(sha, []).append(rev)
        for rad in pr_revision.get(rev, []):
            if rad["handling"] == "opret":
                tilstand.pop(rad["sti"], None)
            elif rad.get("gammel_json") is not None:
                tilstand[rad["sti"]] = rad["gammel_json"]
    return ud


def frosne_tidsserier(inp) -> list[dict]:
    ud = []
    for r in inp:
        if not r["sti"].startswith("_koersel.tidsserie."):
            continue
        try:
            v = J.parse(r["vaerdi_json"])
        except Exception:
            raise ArkivAfvisning(f"{r['sti']} er ikke gyldig JSON.") from None
        if not isinstance(v, dict) or not isinstance(v.get("sha256"), str) or not isinstance(v.get("id"), str):
            raise ArkivAfvisning(f"{r['sti']} mangler id eller sha256.")
        ud.append({"rolle": r["sti"][len("_koersel.tidsserie."):], "id": v["id"], "sha256": v["sha256"]})
    return ud


# ------------------------------------------------------------------ anmodning og del

def _heltal_mindst_1(x) -> bool:
    return J.er_tal(x) and not isinstance(x, bool) and math.isfinite(x) and float(x).is_integer() and x >= 1


def laes_import_anmodning(tekst: str) -> dict:
    try:
        v = J.parse(tekst)
    except Exception:
        raise ArkivAfvisning("Anmodningen er ikke gyldig JSON.") from None
    if not isinstance(v, list) or len(v) != 1:
        raise ArkivAfvisning("En arkivimport skal være den eneste handling i anmodningen.")
    a = v[0] if isinstance(v[0], dict) else {}
    if a.get("handling") != "importer_arkiv":
        raise ArkivAfvisning("Anmodningen er ikke en arkivimport.")
    if not isinstance(a.get("arkiv"), str) or not _SHA.fullmatch(a["arkiv"]):
        raise ArkivAfvisning("Arkivets sha256 mangler eller er ugyldig.")
    if not isinstance(a.get("sha256"), str) or not _SHA.fullmatch(a["sha256"]):
        raise ArkivAfvisning("Delens sha256 mangler eller er ugyldig.")
    if not isinstance(a.get("tabel"), str) or a["tabel"] not in IMPORT_TABELLER:
        raise ArkivAfvisning(f'Ukendt tabel "{_js_streng(a.get("tabel", "undefined"))}".')
    if not _heltal_mindst_1(a.get("nr")) or not _heltal_mindst_1(a.get("af")) or a["nr"] > a["af"]:
        raise ArkivAfvisning("Delens nummer er ugyldigt.")
    ider = a.get("koersel_ider")
    if not isinstance(ider, list) or not all(isinstance(x, str) and _UUID.fullmatch(x) for x in ider):
        raise ArkivAfvisning("koersel_ider skal være en liste af uuid'er.")
    if (a["tabel"] == "Koersel") != (len(ider) > 0):
        raise ArkivAfvisning("koersel_ider skal netop angives for en Koersel-del.")
    if len(ider) > MAKS_KOERSLER_PR_DEL:
        raise ArkivAfvisning(f"Højst {MAKS_KOERSLER_PR_DEL} kørsler pr. del.")
    filnavn = a["filnavn"] if isinstance(a.get("filnavn"), str) else ""
    if J.laengde(filnavn) > 300:
        raise ArkivAfvisning("Filnavnet er for langt.")
    return {"handling": "importer_arkiv", "arkiv": a["arkiv"], "sha256": a["sha256"], "tabel": a["tabel"],
            "nr": int(a["nr"]), "af": int(a["af"]), "koersel_ider": list(ider), "filnavn": filnavn}


def _er_celle(x) -> bool:
    return x is None or isinstance(x, (str, bool)) or J.er_tal(x)


def laes_del(tekst: str) -> dict:
    try:
        v = J.parse(tekst)
    except Exception:
        raise ArkivAfvisning("Delen er ikke gyldig JSON.") from None
    if not isinstance(v, dict) or v.get("format") != DEL_FORMAT or not (J.er_tal(v.get("version")) and v.get("version") == 1
                                                                          and not isinstance(v.get("version"), bool)):
        raise ArkivAfvisning("Delen har ikke arkivets format.")
    if not isinstance(v.get("arkiv"), str) or not _SHA.fullmatch(v["arkiv"]):
        raise ArkivAfvisning("Delen mangler arkivets sha256.")
    tabel = v.get("tabel")
    if not isinstance(tabel, str) or tabel not in IMPORT_TABELLER:
        raise ArkivAfvisning(f'Ukendt tabel "{_js_streng(v.get("tabel", "undefined"))}".')
    forventede = kolonnenavne(tabel)
    k = v.get("kolonner")
    if not isinstance(k, list) or k != forventede:
        raise ArkivAfvisning(f"{tabel}: kolonnerne passer ikke med skemaet (arkivet er fra en anden skemaversion?).")
    raekker = v.get("raekker")
    if not isinstance(raekker, list) or len(raekker) == 0:
        raise ArkivAfvisning("Delen har ingen rækker.")
    ider: set = set()
    for r in raekker:
        if not isinstance(r, list) or not all(_er_celle(x) for x in r):
            raise ArkivAfvisning(f"{tabel}: en række har ugyldige værdier.")
        fejl = fejl_i_raekke(tabel, r)
        if fejl:
            raise ArkivAfvisning(f"{tabel} {_js_streng(r[0]) if r else 'undefined'}: {' '.join(fejl)}")
        if r[0] in ider:
            raise ArkivAfvisning(f"{tabel} {_js_streng(r[0])} står to gange i delen.")
        ider.add(r[0])
    forventet = None
    if tabel == "Koersel":
        f = v.get("forventet")
        if not isinstance(f, dict):
            raise ArkivAfvisning("En Koersel-del skal angive det forventede antal rækker pr. kørsel.")
        forventet = {}
        for i in ider:
            x = f.get(i)
            if not isinstance(x, dict) or not all(_heltal_ikke_negativ(x.get(b)) for b in KOERSEL_BOERN):
                raise ArkivAfvisning(f"Kørsel {i}: det forventede antal rækker mangler.")
            forventet[i] = {b: int(x[b]) for b in KOERSEL_BOERN}
    return {"format": DEL_FORMAT, "version": 1, "arkiv": v["arkiv"], "tabel": tabel, "kolonner": forventede,
            "raekker": raekker, "forventet": forventet}


def _heltal_ikke_negativ(x) -> bool:
    return J.er_tal(x) and not isinstance(x, bool) and math.isfinite(x) and float(x).is_integer() and x >= 0


# ------------------------------------------------------------------ kørslens tjek

def _felt(r, navn: str):
    return r[kolonnenavne("Koersel").index(navn)]


def tjek_koersel(x: dict) -> None:
    """TS' ``tjekKoersel``: kaster ``ArkivAfvisning``, hvis kørslen ikke kan skrives som historisk kørsel."""
    k = x["koersel"]
    id = _js_streng(_felt(k, "id"))
    status = _js_streng(_felt(k, "status"))
    if status not in AFSLUTTEDE_STATUS:
        raise ArkivAfvisning(f'Kørsel {id} har status "{status}"; kun færdige, fejlede og annullerede kørsler kan genimporteres.')
    for b in KOERSEL_BOERN:
        if x["antal"][b] != x["forventet"][b]:
            raise ArkivAfvisning(f"Kørsel {id}: {b} har {x['antal'][b]} rækker i databasen, arkivet {x['forventet'][b]} — "
                                 "importen er ufuldstændig; kør den igen.")
    if input_hash(x["input"]) != _felt(k, "input_hash"):
        raise ArkivAfvisning(f"Kørsel {id}: det frosne input passer ikke med input_hash — arkivet er rettet eller beskadiget.")
    if not x["bestilling"]:
        raise ArkivAfvisning(f"Kørsel {id}: bestillingen findes ikke.")
    if x["bestilling"]["scenarie_id"] != _felt(k, "scenarie_id"):
        raise ArkivAfvisning(f"Kørsel {id}: bestillingen hører til et andet scenarie.")
    if not x["scenarie"]:
        raise ArkivAfvisning(f"Kørsel {id}: scenariet findes ikke.")
    if x["scenarie"]["vaerk_id"] != _felt(k, "vaerk_id"):
        raise ArkivAfvisning(f"Kørsel {id}: scenariet hører til et andet værk.")
    if not x["vaerk"]:
        raise ArkivAfvisning(f"Kørsel {id}: værket findes ikke. Upload værksarket først.")
    sha = vaerk_sha([r for r in x["input"] if r["kilde"] == "vaerk"])
    rev = _felt(k, "vaerk_revision")
    if rev not in x["revisioner"].get(sha, []):
        raise ArkivAfvisning(f"Kørsel {id} bygger på en værksrevision (parametre {sha[:12]}…), som værket her ikke har haft "
                             f"som revision {J.js_str(rev)}. Upload værksarket for den revision først.")
    for t in frosne_tidsserier(x["input"]):
        if t["sha256"] not in x["tidsserier"]:
            raise ArkivAfvisning(f"Kørsel {id} bygger på tidsserien ({t['rolle']}) med sha256 {t['sha256'][:12]}…, som ikke "
                                 "findes her. Upload den først.")


# ------------------------------------------------------------------ forløbet

_NAVN = {"Scenarie": "scenarier", "ScenarieAendring": "scenarieændringer", "Bestilling": "bestillinger",
         "Koersel": "kørsler", "KoerselInput": "inputrækker", "KoerselNoegletal": "nøgletal",
         "KoerselMaaned": "månedsrækker", "KoerselTime": "timerækker"}


def importer_del(lager, anmodning_id: str, tekst) -> dict:
    """TS' ``importerDel`` mod ``betroet_lager`` (``arkiv_*``-verberne): én del i én transaktion."""
    if not isinstance(anmodning_id, str) or not _UUID.fullmatch(anmodning_id.lower()):
        return {"ok": False, "status": "afvist", "svar": "Ugyldigt anmodnings-id."}
    with lager.transaktion() as tx:
        a = tx.anmodning(anmodning_id, laas=False)
    if not a:
        return {"ok": False, "status": "afvist", "svar": "Anmodningen findes ikke."}
    if a["status"] != "ny":
        return {"ok": a["status"] == "udfoert", "status": a["status"], "svar": a.get("svar") or ""}
    try:
        imp = laes_import_anmodning(a["aendringer_json"])
        if str(a["vaerk_id"]).lower() != NIL_UUID:
            raise ArkivAfvisning("En arkivimport skal have nil-uuid'et som vaerk_id.")
        if not isinstance(tekst, str) or sha256_tekst(tekst) != imp["sha256"]:
            raise ArkivAfvisning("Delens indhold passer ikke med anmodningens sha256 — send delen igen.")
        d = laes_del(tekst)
        if d["tabel"] != imp["tabel"] or d["arkiv"] != imp["arkiv"]:
            raise ArkivAfvisning("Delen passer ikke med anmodningen (tabel eller arkiv).")
        if d["tabel"] == "Koersel":
            i = {r[0] for r in d["raekker"]}
            if len(i) != len(imp["koersel_ider"]) or any(x not in i for x in imp["koersel_ider"]):
                raise ArkivAfvisning("Delens kørsler passer ikke med anmodningens koersel_ider.")
        with lager.transaktion() as tx:
            igen = tx.anmodning(anmodning_id, laas=True)
            if igen["status"] != "ny":
                return {"ok": igen["status"] == "udfoert", "status": igen["status"], "svar": igen.get("svar") or ""}
            oprettet, fandtes = _skriv_del(tx, d)
            svar = f"{oprettet} {_NAVN[d['tabel']]} oprettet, {fandtes} fandtes allerede (del {imp['nr']} af {imp['af']})."
            tx.saet_anmodning(anmodning_id, "udfoert", svar)
            return {"ok": True, "status": "udfoert", "svar": svar, "oprettet": oprettet, "fandtes": fandtes}
    except ArkivAfvisning as e:
        with lager.transaktion() as tx:
            tx.saet_anmodning(anmodning_id, "afvist", J.skive(str(e), 0, 2000))
        return {"ok": False, "status": "afvist", "svar": str(e)}


def _kol(tabel: str, r, navn: str):
    return r[kolonnenavne(tabel).index(navn)]


def _skriv_del(tx, d: dict) -> tuple[int, int]:
    tabel = d["tabel"]
    ider = [r[0] for r in d["raekker"]]
    eksisterende = {str(r["id"]).lower(): r for r in tx.arkiv_hent(tabel, ider)}
    nye, konflikter = [], []
    for r in d["raekker"]:
        s = sammenlign(tabel, r, eksisterende.get(r[0]))
        if s["udfald"] == "konflikt":
            konflikter.append(f"{r[0]} ({', '.join(s['kolonner'])})")
        elif s["udfald"] == "ny":
            nye.append(r)
    if konflikter:
        raise ArkivAfvisning(f"Konflikt: {len(konflikter)} {_NAVN[tabel]} findes allerede med andet indhold, fx "
                             f"{'; '.join(konflikter[:3])}. Intet er overskrevet.")
    if nye:
        _tjek_nye(tx, d, nye)
        tx.arkiv_indsaet(tabel, [dict(zip(kolonnenavne(tabel), r)) for r in nye])
    return len(nye), len(d["raekker"]) - len(nye)


def _findes(tx, tabel: str, ider) -> dict:
    u = list(dict.fromkeys(i for i in ider if isinstance(i, str)))
    return {str(r["id"]).lower(): r for r in (tx.arkiv_hent(tabel, u) if u else [])}


def _tjek_nye(tx, d: dict, nye: list) -> None:
    tabel = d["tabel"]

    def ref(navn):
        return [_kol(tabel, r, navn) for r in nye]

    if tabel == "Scenarie":
        v = _findes(tx, "Vaerk", ref("vaerk_id"))
        s = _findes(tx, "Scenarie", ref("reference_scenarie_id"))
        i_delen = {r[0] for r in d["raekker"]}
        for r in nye:
            if _kol(tabel, r, "vaerk_id") not in v:
                raise ArkivAfvisning(f"Scenarie {r[0]}: værket findes ikke her. Upload værksarket først.")
            reference = _kol(tabel, r, "reference_scenarie_id")
            if reference is not None and reference not in s and reference not in i_delen:
                raise ArkivAfvisning(f"Scenarie {r[0]}: referencescenariet {reference} findes ikke (importér det først).")
        return
    if tabel in ("ScenarieAendring", "Bestilling"):
        s = _findes(tx, "Scenarie", ref("scenarie_id"))
        for r in nye:
            if _kol(tabel, r, "scenarie_id") not in s:
                raise ArkivAfvisning(f"{tabel} {r[0]}: scenariet findes ikke.")
        return
    if tabel != "Koersel":
        k = _findes(tx, "Koersel", ref("koersel_id"))
        if k:
            raise ArkivAfvisning(f"Kørsel {next(iter(k))} findes allerede; der kan ikke tilføjes rækker til en kørsel.")
        return
    bestillinger = _findes(tx, "Bestilling", ref("bestilling_id"))
    scenarier = _findes(tx, "Scenarie", ref("scenarie_id"))
    vaerker = _findes(tx, "Vaerk", ref("vaerk_id"))
    historik: dict = {}
    serier: dict = {}
    for r in nye:
        id = r[0]
        vaerk_id = _kol("Koersel", r, "vaerk_id")
        vaerk = vaerker.get(vaerk_id)
        if vaerk and vaerk_id not in historik:
            h = tx.arkiv_vaerk_historik(vaerk_id)
            historik[vaerk_id] = vaerk_revisioner(h["revision"], h["blade"], h["log"])
            serier[vaerk_id] = tx.arkiv_tidsserie_shas(vaerk_id)
        b = bestillinger.get(_kol("Koersel", r, "bestilling_id"))
        s = scenarier.get(_kol("Koersel", r, "scenarie_id"))
        tjek_koersel({
            "koersel": r, "antal": tx.arkiv_tael_boern(id), "forventet": d["forventet"][id], "input": tx.arkiv_input(id),
            "bestilling": {"scenarie_id": str(b["scenarie_id"]).lower()} if b else None,
            "scenarie": {"vaerk_id": str(s["vaerk_id"]).lower()} if s else None,
            "vaerk": {"id": vaerk_id} if vaerk else None,
            "revisioner": historik.get(vaerk_id, {}), "tidsserier": serier.get(vaerk_id, set()),
        })
