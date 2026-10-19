"""fjv_skema — skema.json læst, valideret og omsat (kun standardbiblioteket, Python 3.11+).

Skemaet er kontrakten for begge udgaver (SKEMA.md). Dette modul er den ene Python-læsning af det:

* ``laes()``                      skema.json -> dict, strukturelt valideret (fejler højlydt)
* ``ddl(dialekt)``                CREATE-scriptet for ``sqlite`` | ``postgresql`` | ``mssql`` (community-profilen)
* ``rayfin_type`` / ``rayfin_check``  hvad Rayfin selv laver af en kolonne (Fabric-profilen; bruges af testene)
* ``tjek_raekke(entitet, raekke)``    én rækkes regler: typer, længder, sæt, mønstre, JSON
* ``tjek_data({entitet: [rækker]})``  på tværs: primærnøgler, unikke kolonner, referencer, invarianter
* ``struktur()``                  skemaets strukturelle fingeraftryk (versionering: versioner/<n>.json)

Ingen afhængigheder, så det samme modul kan bruges af community-serveren (``valider-db``), af en
notebook og af testene her. Længder måles i UTF-16-kodeenheder — sådan tæller nvarchar og JS' ``.length``;
Pythons ``len`` tæller kodepunkter og giver 1 for et tegn, nvarchar tæller som 2.
"""

from __future__ import annotations

import json
import math
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

SKEMA_FIL = Path(__file__).with_name("skema.json")
DIALEKTER = ("sqlite", "postgresql", "mssql")
TYPER = ("uuid", "text", "set", "int", "decimal", "boolean", "datetime")
SKEMA_TABEL = "_skema"

_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_TID = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
_NAVN = re.compile(r"^[_A-Za-z][_A-Za-z0-9]*$")
_INT32 = (-2**31, 2**31 - 1)


class SkemaFejl(ValueError):
    """skema.json er ikke gyldigt. Beskeden nævner stedet."""


# ------------------------------------------------------------------ læsning

def laes(sti: Path | str | None = None) -> dict:
    """Læs og validér skema.json. Kaster ``SkemaFejl`` med stedet ved første brud."""
    skema = json.loads(Path(sti or SKEMA_FIL).read_text(encoding="utf-8"))
    valider_skema(skema)
    return skema


def valider_skema(skema: dict) -> None:
    def fejl(hvor: str, hvad: str):
        raise SkemaFejl(f"{hvor}: {hvad}")

    if not isinstance(skema.get("version"), int) or skema["version"] < 1:
        fejl("version", "skal være et heltal >= 1")
    for t in TYPER:
        if t not in skema.get("typer", {}):
            fejl("typer", f"mangler {t}")
        for d in DIALEKTER:
            if d not in skema["typer"][t].get("ddl", {}):
                fejl(f"typer.{t}.ddl", f"mangler {d}")
    entiteter, tabeller = set(), set()
    for t in skema["tabeller"]:
        e, tb = t.get("entitet", ""), t.get("tabel", "")
        hvor = e or "?"
        if not _NAVN.match(e) or not _NAVN.match(tb):
            fejl(hvor, "entitet og tabel skal være ASCII-identifiers")
        if e in entiteter or tb in tabeller:
            fejl(hvor, "entitet/tabel findes to gange")
        if tb == SKEMA_TABEL:
            fejl(hvor, f"{SKEMA_TABEL} er reserveret til skemaversionen")
        entiteter.add(e)
        tabeller.add(tb)
        navne = set()
        pk = [k["navn"] for k in t["kolonner"] if k.get("pk")]
        if pk != ["id"]:
            fejl(hvor, f"primærnøglen skal være præcis 'id' (er {pk})")
        for k in t["kolonner"]:
            kh = f"{e}.{k.get('navn')}"
            if not _NAVN.match(k.get("navn", "")):
                fejl(kh, "kolonnenavn skal være ASCII ([_A-Za-z0-9], GraphQL)")
            if k["navn"] in navne:
                fejl(kh, "kolonnen findes to gange")
            navne.add(k["navn"])
            if k.get("type") not in TYPER:
                fejl(kh, f"ukendt type {k.get('type')!r}")
            if not isinstance(k.get("nullable"), bool):
                fejl(kh, "nullable skal være true/false")
            if k["type"] == "text":
                if not isinstance(k.get("max"), int) or not 1 <= k["max"] <= 4000:
                    fejl(kh, "text kræver max i 1..4000 (uden max bliver kolonnen NVARCHAR(MAX), og DAB fejler)")
                if "min" in k and not (isinstance(k["min"], int) and 0 <= k["min"] <= k["max"]):
                    fejl(kh, "min skal være et heltal i 0..max")
            if k["type"] == "set":
                v = k.get("vaerdier")
                if not v or len(set(v)) != len(v) or not all(isinstance(x, str) and x and "'" not in x for x in v):
                    fejl(kh, "set kræver en liste af forskellige, ikke-tomme værdier uden apostrof")
            if k["type"] == "decimal":
                p, s = k.get("precision"), k.get("scale")
                if not (isinstance(p, int) and isinstance(s, int) and 1 <= p <= 28 and 0 <= s <= p):
                    fejl(kh, "decimal kræver precision 1..28 og scale 0..precision (DAB/.NET-loft 28)")
            if "moenster" in k:
                re.compile(k["moenster"])
                if k["type"] != "text":
                    fejl(kh, "moenster kun på text")
        for inv in t.get("invarianter", []):
            for c in inv["kolonner"]:
                if c not in navne:
                    fejl(f"{e}.invarianter.{inv['navn']}", f"ukendt kolonne {c}")
            for c in inv.get("hvor", {}):
                if c not in navne:
                    fejl(f"{e}.invarianter.{inv['navn']}", f"ukendt kolonne {c} i hvor")
    for t in skema["tabeller"]:
        for k in t["kolonner"]:
            if "ref" in k:
                if k["ref"] not in entiteter:
                    fejl(f"{t['entitet']}.{k['navn']}", f"ref til ukendt entitet {k['ref']}")
                if k["type"] != "uuid":
                    fejl(f"{t['entitet']}.{k['navn']}", "ref kun på uuid-kolonner")
                for u in k.get("ref_undtagelser", []):
                    if u not in skema.get("konstanter", {}):
                        fejl(f"{t['entitet']}.{k['navn']}", f"ukendt konstant {u}")


def tabel(skema: dict, entitet: str) -> dict:
    for t in skema["tabeller"]:
        if t["entitet"] == entitet:
            return t
    raise KeyError(entitet)


def struktur(skema: dict | None = None) -> dict:
    """Alt der bestemmer databasens form og regler — uden forklarende tekst. Ændres den, skal versionen op."""
    skema = skema or laes()
    tabeller = []
    for t in skema["tabeller"]:
        tabeller.append({
            "entitet": t["entitet"], "tabel": t["tabel"], "klient": t["klient"],
            "kolonner": [{k2: v for k2, v in k.items() if k2 != "beskrivelse"} for k in t["kolonner"]],
            "invarianter": [{k2: v for k2, v in i.items() if k2 != "kilde"} for i in t.get("invarianter", [])],
        })
    return {"version": skema["version"], "konstanter": skema["konstanter"],
            "typer": {n: {"rayfin": v["rayfin"], "ddl": v["ddl"]} for n, v in skema["typer"].items()},
            "tabeller": tabeller}


# ------------------------------------------------------------------ typer

def _laengste(k: dict) -> int:
    return max(len(v) for v in k["vaerdier"])


def _skabelon(s: str, k: dict) -> str:
    return s.format(max=k.get("max"), laengste=_laengste(k) if k["type"] == "set" else None,
                    precision=k.get("precision"), scale=k.get("scale"))


def ddl_type(skema: dict, k: dict, dialekt: str) -> str:
    """Community-profilens fysiske type."""
    return _skabelon(skema["typer"][k["type"]]["ddl"][dialekt], k)


def rayfin_type(skema: dict, k: dict, dialekt: str) -> str:
    """Den type Rayfin selv giver kolonnen (Fabric-profilen: mssql; Rayfins postgresql til sammenligning)."""
    return _skabelon(skema["typer"][k["type"]]["rayfin"][dialekt], k)


def _citer(navn: str, dialekt: str) -> str:
    return f"[{navn}]" if dialekt == "mssql" else f'"{navn}"'


def _literal(v) -> str:
    return "'" + str(v).replace("'", "''") + "'"


def rayfin_check(k: dict, dialekt: str) -> str | None:
    """Rayfins eget CHECK-udtryk for kolonnen (præcis Rayfins tekst; testen sammenligner med oraklet)."""
    q = _citer(k["navn"], dialekt)
    if k["type"] == "set":
        return f"{q} IN ({', '.join(_literal(v) for v in k['vaerdier'])})"
    if k["type"] == "text" and k.get("min"):
        fn = "LEN" if dialekt == "mssql" else "LENGTH"
        return f"{fn}({q}) >= {k['min']}"
    return None


# ------------------------------------------------------------------ DDL (community-profilen)

def _checks(k: dict, tb: str, dialekt: str) -> list[tuple[str, str]]:
    """(navn, udtryk) for én kolonne. Rayfins egne regler + community-profilens formatregler."""
    q = _citer(k["navn"], dialekt)
    ud = []
    if k["type"] == "text" and k.get("min"):
        # Fabric-semantik i alle dialekter: mssql LEN tæller ikke afsluttende mellemrum.
        udtryk = f"LEN({q}) >= {k['min']}" if dialekt == "mssql" else f"LENGTH(RTRIM({q}, ' ')) >= {k['min']}"
        ud.append((f"CK_{tb}_{k['navn']}_minlen", udtryk))
    if k["type"] == "set":
        vaerdier = ", ".join(_literal(v) for v in k["vaerdier"])
        # Versalfølsom overalt (Fabric-databasens kollation er CI og ville tage imod 'KOE').
        venstre = f"{q} COLLATE Latin1_General_100_BIN2" if dialekt == "mssql" else q
        ud.append((f"CK_{tb}_{k['navn']}", f"{venstre} IN ({vaerdier})"))
    if dialekt == "sqlite":
        if k["type"] == "uuid":
            ud.append((f"CK_{tb}_{k['navn']}_uuid", f"LENGTH({q}) = 36 AND {q} NOT GLOB '*[^0-9a-f-]*'"))
        elif k["type"] == "datetime":
            d = "[0-9]"
            g = f"{d*4}-{d*2}-{d*2}T{d*2}:{d*2}:{d*2}.{d*3}Z"
            ud.append((f"CK_{tb}_{k['navn']}_tid", f"{q} GLOB '{g}'"))
        elif k["type"] == "boolean":
            ud.append((f"CK_{tb}_{k['navn']}_bool", f"{q} IN (0, 1)"))
    return ud


def _indeks(skema: dict, t: dict) -> list[tuple[str, bool, list[str], dict]]:
    """(navn, unik, kolonner, hvor): invarianter med ddl=true + et opslagsindeks pr. referencekolonne."""
    ud = []
    for inv in t.get("invarianter", []):
        if inv["type"] == "unik" and inv.get("ddl"):
            ud.append((f"UX_{t['tabel']}_{inv['navn']}", True, inv["kolonner"], inv.get("hvor", {})))
    foerste = {cols[0] for _, unik, cols, hvor in ud if unik and not hvor}
    foerste |= {k["navn"] for k in t["kolonner"] if k.get("unik") or k.get("pk")}
    for k in t["kolonner"]:
        if "ref" in k and k["navn"] not in foerste:
            ud.append((f"IX_{t['tabel']}_{k['navn']}", False, [k["navn"]], {}))
    return ud


def _hvor(hvor: dict, dialekt: str) -> str:
    led = []
    for c, v in hvor.items():
        q = _citer(c, dialekt)
        if isinstance(v, bool) and dialekt == "postgresql":
            led.append(q if v else f"NOT {q}")
        elif isinstance(v, bool):
            led.append(f"{q} = {1 if v else 0}")
        else:
            led.append(f"{q} = {_literal(v)}")
    return " AND ".join(led)


def _kolonne_ddl(skema: dict, k: dict, dialekt: str) -> str:
    return f"{_citer(k['navn'], dialekt)} {ddl_type(skema, k, dialekt)}{'' if k['nullable'] else ' NOT NULL'}"


def _indeks_ddl(skema: dict, t: dict, dialekt: str) -> list[str]:
    q = lambda n: _citer(n, dialekt)  # noqa: E731
    ud = []
    for navn, unik, cols, hvor in _indeks(skema, t):
        s = f"CREATE {'UNIQUE ' if unik else ''}INDEX {q(navn)} ON {q(t['tabel'])} ({', '.join(q(c) for c in cols)})"
        if hvor:
            s += f" WHERE {_hvor(hvor, dialekt)}"
        ud.append(s + ";")
    return ud


def _tabel_ddl(skema: dict, t: dict, dialekt: str) -> list[str]:
    q = lambda n: _citer(n, dialekt)  # noqa: E731
    tb = t["tabel"]
    dele = [f"    {_kolonne_ddl(skema, k, dialekt)}" for k in t["kolonner"]]
    dele.append(f"    CONSTRAINT {q('PK_' + tb)} PRIMARY KEY ({q('id')})")
    for k in t["kolonner"]:
        if k.get("unik"):
            dele.append(f"    CONSTRAINT {q(f'UQ_{tb}_' + k['navn'])} UNIQUE ({q(k['navn'])})")
    for k in t["kolonner"]:
        for navn, udtryk in _checks(k, tb, dialekt):
            dele.append(f"    CONSTRAINT {q(navn)} CHECK ({udtryk})")
    return [f"-- {t['entitet']}", f"CREATE TABLE {q(tb)} (", ",\n".join(dele), ");", *_indeks_ddl(skema, t, dialekt), ""]


def _forord(dialekt: str) -> list[str]:
    if dialekt == "mssql":
        return ["SET ANSI_NULLS ON;", "SET QUOTED_IDENTIFIER ON;  -- påkrævet for filtrerede indeks (sqlcmd slår det ellers fra)", ""]
    if dialekt == "sqlite":
        return ["PRAGMA foreign_keys = OFF;  -- referencer er logiske og tjekkes af valider-db (SKEMA.md)", ""]
    return []


def ddl(dialekt: str, skema: dict | None = None) -> str:
    """CREATE-scriptet for en tom database (community-profilen). Deterministisk; LF-linjeskift."""
    if dialekt not in DIALEKTER:
        raise ValueError(f"ukendt dialekt {dialekt!r} (kendte: {', '.join(DIALEKTER)})")
    skema = skema or laes()
    q = lambda n: _citer(n, dialekt)  # noqa: E731
    L = [
        f"-- Fjernvarme Businesscase — databaseskema version {skema['version']} ({dialekt}).",
        "-- GENERERET af skema/byg.py fra skema/skema.json. Ret aldrig her; ret skema.json og kør byg.py.",
        "-- Community-profilen: Fabric-udgavens database laves af Rayfin ud fra app/rayfin/data/*.ts (se SKEMA.md).",
        "",
        *_forord(dialekt),
    ]
    for t in skema["tabeller"]:
        L += _tabel_ddl(skema, t, dialekt)
    L += [
        "-- Skemaversionen. Aktuel version = MAX(version); en migration indsætter sin egen række.",
        f"CREATE TABLE {q(SKEMA_TABEL)} (",
        f"    {q('version')} {'INT' if dialekt == 'mssql' else 'INTEGER'} NOT NULL,",
        f"    CONSTRAINT {q('PK_' + SKEMA_TABEL)} PRIMARY KEY ({q('version')})",
        ");",
        f"INSERT INTO {q(SKEMA_TABEL)} ({q('version')}) VALUES ({skema['version']});",
        "",
    ]
    return "\n".join(L)


# ------------------------------------------------------------------ migrationer

class IkkeAdditiv(SkemaFejl):
    """En ændring, som ikke kan migreres automatisk uden risiko for data. Kræver en håndskrevet migration."""


def migration(fra: dict, til: dict, dialekt: str) -> str:
    """SQL, der løfter en database fra ``fra`` til ``til`` (to strukturer, se ``struktur``). Kun additivt:
    nye tabeller, nye NULL-kolonner sidst i en tabel, nye indeks. Alt andet -> ``IkkeAdditiv`` med grunden,
    for en automatisk migration må aldrig kunne tabe eller omtolke data.
    """
    if til["version"] != fra["version"] + 1:
        raise SkemaFejl(f"en migration går ét trin: {fra['version']} -> {fra['version'] + 1} (fik {til['version']})")
    if fra["typer"] != til["typer"]:
        raise IkkeAdditiv("typeprofilerne er ændret — det ændrer eksisterende kolonner")
    q = lambda n: _citer(n, dialekt)  # noqa: E731
    gamle = {t["entitet"]: t for t in fra["tabeller"]}
    nye = {t["entitet"]: t for t in til["tabeller"]}
    for e in gamle:
        if e not in nye:
            raise IkkeAdditiv(f"tabellen {e} er fjernet")
    L = [f"-- Migration {fra['version']} -> {til['version']} ({dialekt}). GENERERET af skema/byg.py — ret ikke her.", "",
         *_forord(dialekt)]
    for t in til["tabeller"]:
        e = t["entitet"]
        if e not in gamle:
            L += _tabel_ddl(til, t, dialekt)
            continue
        g = gamle[e]
        if g["tabel"] != t["tabel"]:
            raise IkkeAdditiv(f"{e}: tabelnavnet er ændret")
        gk = g["kolonner"]
        if t["kolonner"][:len(gk)] != gk:
            for a, b in zip(gk, t["kolonner"]):
                if a != b:
                    raise IkkeAdditiv(f"{e}.{a['navn']}: en eksisterende kolonne er ændret, fjernet eller flyttet")
            raise IkkeAdditiv(f"{e}: en eksisterende kolonne er fjernet")
        for k in t["kolonner"][len(gk):]:
            if not k["nullable"]:
                raise IkkeAdditiv(f"{e}.{k['navn']}: en ny kolonne skal være nullable (rækkerne findes allerede)")
            if k.get("unik") or k.get("pk"):
                raise IkkeAdditiv(f"{e}.{k['navn']}: en ny unik kolonne kræver en håndskrevet migration")
            checks = " ".join(f"CONSTRAINT {q(n)} CHECK ({u})" for n, u in _checks(k, t["tabel"], dialekt))
            tilfoej = "ADD" if dialekt == "mssql" else "ADD COLUMN"
            L.append(f"ALTER TABLE {q(t['tabel'])} {tilfoej} {_kolonne_ddl(til, k, dialekt)}{' ' + checks if checks else ''};")
        gi = {i["navn"]: i for i in g.get("invarianter", [])}
        for i in t.get("invarianter", []):
            if i["navn"] in gi and gi[i["navn"]] != i:
                raise IkkeAdditiv(f"{e}: invarianten {i['navn']} er ændret")
        for n in gi:
            if n not in {i["navn"] for i in t.get("invarianter", [])}:
                raise IkkeAdditiv(f"{e}: invarianten {n} er fjernet")
        eksisterende = {x[0] for x in _indeks(fra, g)}
        for linje, (navn, *_r) in zip(_indeks_ddl(til, t, dialekt), _indeks(til, t)):
            if navn not in eksisterende:
                L.append(linje)
    L += [f"INSERT INTO {q(SKEMA_TABEL)} ({q('version')}) VALUES ({til['version']});", ""]
    return "\n".join(L)


# ------------------------------------------------------------------ rækkeregler

def utf16_laengde(s: str) -> int:
    """Længden som nvarchar og JS tæller den (et tegn uden for BMP = 2)."""
    return len(s.encode("utf-16-le")) // 2


def _afvis_konstant(navn):
    raise ValueError(f"{navn} er ikke gyldig JSON")


def gyldig_json(s: str) -> bool:
    """Som JS' JSON.parse: NaN/Infinity afvises (Pythons json.loads tager imod dem som standard)."""
    try:
        json.loads(s, parse_constant=_afvis_konstant)
        return True
    except ValueError:
        return False


def _fund(niveau, entitet, raekke_id, kolonne, kode, besked) -> dict:
    return {"niveau": niveau, "entitet": entitet, "id": raekke_id, "kolonne": kolonne, "kode": kode, "besked": besked}


def tjek_raekke(entitet: str, raekke: dict, skema: dict | None = None) -> list[dict]:
    """Én rækkes regler. ``raekke`` = kolonnenavn -> Python-værdi som læst fra databasen.

    Godtager de former drivere giver: uuid som str (store bogstaver -> fund, fordi sammenligning i sqlite er
    versalfølsom), datetime som ``datetime`` eller sqlite-tekst, boolean som bool eller 0/1, decimal som
    ``Decimal``/int/float.
    """
    skema = skema or laes()
    t = tabel(skema, entitet)
    rid = raekke.get("id")
    ud = []
    kendte = {k["navn"] for k in t["kolonner"]}
    for c in raekke:
        if c not in kendte:
            ud.append(_fund("fejl", entitet, rid, c, "ukendt_kolonne", f"Kolonnen {c} findes ikke i skemaet."))
    for k in t["kolonner"]:
        n, v = k["navn"], raekke.get(k["navn"])
        f = lambda kode, besked: ud.append(_fund("fejl", entitet, rid, n, kode, besked))  # noqa: E731
        if v is None:
            if not k["nullable"]:
                f("mangler", f"{n} må ikke være tom.")
            continue
        typ = k["type"]
        if typ == "uuid":
            if not isinstance(v, str) or not _UUID.match(v):
                f("uuid", f"{n} er ikke et uuid med små bogstaver ({str(v)[:40]!r}).")
        elif typ in ("text", "set"):
            if not isinstance(v, str):
                f("type", f"{n} skal være tekst (fik {type(v).__name__}).")
                continue
            if typ == "set" and v not in k["vaerdier"]:
                f("saet", f"{n} = {v!r} er ikke en af {', '.join(k['vaerdier'])}.")
            if typ == "text":
                if utf16_laengde(v) > k["max"]:
                    f("for_lang", f"{n} er {utf16_laengde(v)} tegn (UTF-16); højst {k['max']}.")
                if k.get("min") and len(v.rstrip(" ")) < k["min"]:
                    f("for_kort", f"{n} skal have mindst {k['min']} tegn (afsluttende mellemrum tæller ikke).")
                if "moenster" in k and not re.fullmatch(k["moenster"], v):
                    f("moenster", f"{n} = {v[:60]!r} passer ikke til {k['moenster']}.")
                if n.endswith("_json") and not gyldig_json(v):
                    f("json", f"{n} er ikke gyldig JSON (NaN/Infinity er heller ikke).")
        elif typ == "int":
            if isinstance(v, bool) or not isinstance(v, int) or not _INT32[0] <= v <= _INT32[1]:
                f("int", f"{n} skal være et 32-bit heltal (fik {v!r}).")
        elif typ == "decimal":
            if isinstance(v, bool) or not isinstance(v, (int, float, Decimal)):
                f("decimal", f"{n} skal være et tal (fik {type(v).__name__}).")
                continue
            if isinstance(v, float) and not math.isfinite(v):
                f("decimal", f"{n} er {v} — NaN/uendelig kan ikke gemmes.")
                continue
            try:
                heltal = abs(Decimal(str(v))).to_integral_value(rounding="ROUND_DOWN")
            except InvalidOperation:
                f("decimal", f"{n} = {v!r} er ikke et tal.")
                continue
            if heltal >= Decimal(10) ** (k["precision"] - k["scale"]):
                f("decimal_for_stor", f"{n} = {v} har flere end {k['precision'] - k['scale']} cifre før kommaet.")
        elif typ == "boolean":
            if not (isinstance(v, bool) or v in (0, 1)):
                f("boolean", f"{n} skal være sand/falsk (fik {v!r}).")
        elif typ == "datetime":
            if isinstance(v, datetime):
                if v.tzinfo is not None and v.utcoffset().total_seconds() != 0:
                    f("tid_zone", f"{n} har tidszonen {v.tzinfo}; databasen gemmer UTC.")
            elif not (isinstance(v, str) and _TID.match(v)):
                f("tid", f"{n} = {str(v)[:40]!r} er ikke 'YYYY-MM-DDTHH:MM:SS.fffZ'.")
    return ud


def _noegle(raekke: dict, kolonner: list[str]) -> tuple:
    return tuple(raekke.get(c) for c in kolonner)


def _matcher(raekke: dict, hvor: dict) -> bool:
    for c, v in hvor.items():
        r = raekke.get(c)
        if isinstance(v, bool):
            if bool(r) != v or r is None:
                return False
        elif r != v:
            return False
    return True


def tjek_data(data: dict[str, list[dict]], skema: dict | None = None, *, raekkeregler: bool = True) -> list[dict]:
    """Regler på tværs af rækker og tabeller. ``data`` = entitet -> alle rækker (kolonnenavn -> værdi).

    Mangler en entitet i ``data``, springes dens regler over, og referencer TIL den tjekkes ikke (fund
    ``ikke_tjekket`` som advarsel), så et delvist udtræk aldrig ligner et rent.
    """
    skema = skema or laes()
    konst = skema["konstanter"]
    ud = []
    ids = {e: {r.get("id") for r in rs} for e, rs in data.items()}
    for t in skema["tabeller"]:
        e = t["entitet"]
        if e not in data:
            ud.append(_fund("advarsel", e, None, None, "ikke_tjekket", f"{e} var ikke med i udtrækket."))
            continue
        rs = data[e]
        if raekkeregler:
            for r in rs:
                ud.extend(tjek_raekke(e, r, skema))
        unikke = [("pk", ["id"], {}, False)]
        unikke += [("unik", [k["navn"]], {}, False) for k in t["kolonner"] if k.get("unik")]
        unikke += [(i["navn"], i["kolonner"], i.get("hvor", {}), i.get("null_er_vaerdi", False))
                   for i in t.get("invarianter", []) if i["type"] == "unik"]
        for navn, cols, hvor, null_er_vaerdi in unikke:
            set_ = {}
            for r in rs:
                if hvor and not _matcher(r, hvor):
                    continue
                n = _noegle(r, cols)
                if not null_er_vaerdi and any(x is None for x in n):
                    continue  # SQL: NULL er aldrig lig NULL i et unikt indeks
                if n in set_:
                    ud.append(_fund("fejl", e, r.get("id"), ",".join(cols), "dublet",
                                    f"{e} har to rækker med samme {', '.join(cols)} ({navn}): {set_[n]} og {r.get('id')}."))
                else:
                    set_[n] = r.get("id")
        for i in t.get("invarianter", []):
            if i["type"] == "fast_id":
                fast = konst[i["vaerdi"]]
                for r in rs:
                    if r.get("id") != fast:
                        ud.append(_fund("fejl", e, r.get("id"), "id", "fast_id", f"{e} må kun have rækken {fast}."))
        for k in t["kolonner"]:
            if "ref" not in k:
                continue
            til = k["ref"]
            if til not in ids:
                continue
            undtaget = {konst[u] for u in k.get("ref_undtagelser", [])}
            for r in rs:
                v = r.get(k["navn"])
                if v is None or v in undtaget:
                    continue
                if v not in ids[til]:
                    ud.append(_fund("fejl", e, r.get("id"), k["navn"], "reference",
                                    f"{e}.{k['navn']} = {v} peger på en {til}, der ikke findes."))
    return ud
