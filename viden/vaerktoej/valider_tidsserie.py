#!/usr/bin/env python3
"""Referenceimplementering af reglerne i viden/data_krav.json (fv-data).

Kun standardbibliotek, så den kører med bare ``python3``, i en Fabric-notebook og
her. Den er ORAKLET for appens ``uploadTidsserie`` (TypeScript) og motorens
importør: samme input skal give samme status, samme fundkoder og - for en gyldig
serie - samme normaliserede bytes og sha256. Tærskler og beskeder læses fra
data_krav.json; koden her er kun mekanikken.

    from valider_tidsserie import valider, tjek_koersel
    r = valider(tekst, "varmelast", tidszone="UTC", tidsstempel="start")
    r.status, r.sha256, r.validering["fund"]

    python valider_tidsserie.py FIL.csv varmelast [--tidszone Europe/Copenhagen]
        [--tidsstempel slut] [--enhed kW] [--kolonne navn]

Den normaliserede fil er den, fv-fabric2's arbejder læser (fabric/fjv/tidsserie.py):
overskrift ``time,mw``, ét interval pr. linje, intervallets START i UTC som
``YYYY-MM-DDTHH:MM:SSZ``, stigende, 1h, huller UDELADT, ``\\n`` og UTF-8 uden BOM.
En værdi, der allerede er en ren decimal i kilden, skrives tegn for tegn; ellers
korteste decimalform uden eksponent (``tal_tekst``).
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

HER = Path(__file__).resolve().parent
KRAV_STI = HER.parent / "data_krav.json"
TIME = timedelta(hours=1)
KVARTER = timedelta(minutes=15)
UTC = timezone.utc


def krav() -> dict:
    return json.loads(KRAV_STI.read_text(encoding="utf-8"))


# ---------------------------------------------------------------- tal og tid

TOMME = {"", "nan", "na", "n/a", "null", "none", "-", "–"}
_REN_DECIMAL = re.compile(r"^[0-9]+(?:\.[0-9]+)?$")
_TAL = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")
_DECIMALKOMMA = re.compile(r"^-?\d+(\.\d{3})*,\d+$")
_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?"
                  r"\s*(Z|z|[+-]\d{2}:?\d{2})?$")
_DANSK = re.compile(r"^(\d{1,2})([-./])(\d{1,2})\2(\d{4})(?:[ T](\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?$")


def tal_tekst(x: float) -> str:
    """Korteste decimalform, der giver samme double, uden eksponent og uden '.0'.
    Identisk med fabric/fjv/tidsserie.py:tal_tekst og med JS String(x) for
    1e-6 <= x < 1e21."""
    if not math.isfinite(x):
        raise ValueError(f"ikke et endeligt tal: {x}")
    if x == 0:
        return "0"
    r = repr(float(x))
    if "e" in r or "E" in r:
        r = format(Decimal(r), "f")
    if r.endswith(".0"):
        r = r[:-2]
    return r


def tid_tekst(t: datetime) -> str:
    return t.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sidste_soendag(aar: int, maaned: int) -> datetime:
    """Sidste søndag i måneden kl. 01:00 UTC - EU's skiftetidspunkt."""
    if maaned == 12:
        d = datetime(aar + 1, 1, 1, tzinfo=UTC) - timedelta(days=1)
    else:
        d = datetime(aar, maaned + 1, 1, tzinfo=UTC) - timedelta(days=1)
    d -= timedelta(days=(d.weekday() + 1) % 7)       # weekday: man=0 .. søn=6
    return d.replace(hour=1, minute=0, second=0)


def dk_forskydning(t_utc: datetime) -> int:
    """Danmarks forskydning fra UTC i timer (1 vinter, 2 sommer). Regnet efter EU's
    regel, ikke slået op - der er ingen tz-database på Windows (zoneinfo fejler)."""
    a = t_utc.year
    return 2 if _sidste_soendag(a, 3) <= t_utc < _sidste_soendag(a, 10) else 1


def dk_lokal(t_utc: datetime) -> datetime:
    """UTC -> naiv dansk lokaltid."""
    return (t_utc + timedelta(hours=dk_forskydning(t_utc))).replace(tzinfo=None)


def laes_tal(f: str, decimalkomma: bool):
    """(værdi, tekst) ; (None, None) = tom ; ValueError = ikke et tal."""
    t = f.strip()
    if t.lower() in TOMME:
        return None, None
    if decimalkomma:
        t = re.sub(r"\.(?=\d{3}(\D|$))", "", t).replace(",", ".")
    if not _TAL.match(t):
        raise ValueError(t)
    v = float(t)
    if not math.isfinite(v):
        raise ValueError(t)
    return v, (t if _REN_DECIMAL.match(t) else None)


@dataclass
class Stempel:
    naiv: datetime            # naiv vægur (uden zone)
    zone_min: int | None      # forskydning i minutter, hvis stemplet selv har en
    slash: tuple | None = None   # (første, andet) felt ved d/m/åååå - til US-tjek


def laes_stempel(f: str) -> Stempel | None:
    t = f.strip()
    m = _ISO.match(t)
    if m:
        aa, mo, d = int(m[1]), int(m[2]), int(m[3])
        h, mi, s = int(m[4] or 0), int(m[5] or 0), int(m[6] or 0)
        zone = None
        if m[7]:
            if m[7] in ("Z", "z"):
                zone = 0
            else:
                z = m[7].replace(":", "")
                zone = (-1 if z[0] == "-" else 1) * (int(z[1:3]) * 60 + int(z[3:5]))
        slash = None
    else:
        m = _DANSK.match(t)
        if not m:
            return None
        d, mo, aa = int(m[1]), int(m[3]), int(m[4])
        h, mi, s = int(m[5] or 0), int(m[6] or 0), int(m[7] or 0)
        zone = None
        slash = (int(m[1]), int(m[3])) if m[2] == "/" else None
    try:
        if h == 24 and mi == 0 and s == 0:
            naiv = datetime(aa, mo, d) + timedelta(days=1)
        else:
            naiv = datetime(aa, mo, d, h, mi, s)
    except ValueError:
        return None
    return Stempel(naiv, zone, slash)


def lokal_til_utc(naiv: datetime, set_: set) -> tuple[datetime, str]:
    """Naiv dansk lokaltid -> UTC. Tvetydig time ved vintertid: første forekomst er
    sommertid, anden vintertid (pandas ambiguous='infer' på en sorteret serie). En
    time, der ikke findes ved sommertid, flyttes frem (nonexistent='shift_forward').
    Returnerer (utc, 'ok' | 'tvetydig1' | 'tvetydig2' | 'findes_ikke')."""
    sommer = (naiv - timedelta(hours=2)).replace(tzinfo=UTC)
    vinter = (naiv - timedelta(hours=1)).replace(tzinfo=UTC)
    s_ok, v_ok = dk_forskydning(sommer) == 2, dk_forskydning(vinter) == 1
    if s_ok and v_ok:
        if naiv in set_:
            return vinter, "tvetydig2"
        set_.add(naiv)
        return sommer, "tvetydig1"
    if s_ok:
        return sommer, "ok"
    if v_ok:
        return vinter, "ok"
    return _sidste_soendag(naiv.year, 3), "findes_ikke"


# ---------------------------------------------------------------- solens højde

def solen_er_nede(t_utc: datetime) -> bool:
    """Port af scripts/vaerksark_til_yaml.py:_solen_er_nede (56° N, 10,5° Ø, midt i
    timen, mere end 6° under horisonten)."""
    doy = t_utc.timetuple().tm_yday
    soltid = t_utc.hour + 0.5 + 10.5 / 15.0
    decl = math.radians(23.45 * math.sin(math.radians(360.0 / 365.0 * (doy - 81))))
    lat = math.radians(56.0)
    sin_h = (math.sin(lat) * math.sin(decl)
             + math.cos(lat) * math.cos(decl) * math.cos(math.radians(15.0 * (soltid - 12.0))))
    return sin_h < math.sin(math.radians(-6.0))


# ---------------------------------------------------------------- resultat

@dataclass
class Resultat:
    status: str                     # 'gyldig' | 'afvist'
    data: bytes | None
    sha256: str | None
    validering: dict
    punkter: list = field(default_factory=list)   # [(utc, værdi)] for gyldig serie


class Fund:
    def __init__(self, k: dict):
        self.k = {r["kode"]: r for r in k["tidsserier"]["regler"]}
        self.liste: list[dict] = []

    def __call__(self, kode: str, niveau: str | None = None, **felter):
        r = self.k[kode]                      # KeyError = koden findes ikke i data_krav.json
        niv = niveau or r["niveau"]
        try:
            besked = r["besked"].format(**felter)
        except (KeyError, IndexError):
            besked = r["besked"]
        self.liste.append({"niveau": niv, "kode": kode, "besked": besked[:400]})

    def har_fejl(self) -> bool:
        return any(f["niveau"] == "fejl" for f in self.liste)

    def koder(self, niveau: str | None = None) -> list[str]:
        return [f["kode"] for f in self.liste if niveau is None or f["niveau"] == niveau]


def _linjer(nr: list[int]) -> str:
    return ", ".join(map(str, nr[:3])) + (f" (og {len(nr) - 3} flere)" if len(nr) > 3 else "")


def _dato(t: datetime) -> str:
    """Dansk visning af et UTC-tidspunkt: dd-mm-åååå tt:mm (UTC)."""
    return t.astimezone(UTC).strftime("%d-%m-%Y %H:%M") + " UTC"


# ---------------------------------------------------------------- tabel

def laes_tabel(tekst: str):
    if tekst.startswith("﻿"):
        tekst = tekst[1:]
    linjer = [(i + 1, l) for i, l in enumerate(re.split(r"\r\n|\n|\r", tekst))
              if l.strip() and not l.lstrip().startswith("#")]
    if not linjer:
        return None
    foerste = linjer[0][1]
    skille = "\t" if "\t" in foerste else ";" if ";" in foerste else ","

    def del_(l):
        ud, felt, citat, i = [], "", False, 0
        while i < len(l):
            c = l[i]
            if citat:
                if c == '"' and i + 1 < len(l) and l[i + 1] == '"':
                    felt += '"'; i += 1
                elif c == '"':
                    citat = False
                else:
                    felt += c
            elif c == '"':
                citat = True
            elif c == skille:
                ud.append(felt.strip()); felt = ""
            else:
                felt += c
            i += 1
        ud.append(felt.strip())
        return ud

    alle = [(nr, del_(l)) for nr, l in linjer]
    hoved0 = alle[0][1]
    overskrift = laes_stempel(hoved0[0]) is None and not _ligner_tal(hoved0[-1])
    data = alle[1:] if overskrift else alle
    bredde = max(len(r) for _, r in alle)
    kolonner = hoved0 if overskrift else [f"kolonne {i + 1}" for i in range(bredde)]
    decimalkomma = skille != "," and any(
        _DECIMALKOMMA.match(f) for _, r in data[:500] for f in r)
    return {"skille": skille, "decimalkomma": decimalkomma, "overskrift": overskrift,
            "kolonner": [k.strip() for k in kolonner], "raekker": data}


def _ligner_tal(f: str) -> bool:
    try:
        v, _ = laes_tal(f, True)
        return v is not None
    except ValueError:
        return False


# ---------------------------------------------------------------- valider

def valider(indhold, rolle: str, *, tidszone: str = "UTC", tidsstempel: str = "start",
            enhed: str = "MW", kolonne: str | None = None, vaerk: dict | None = None,
            k: dict | None = None) -> Resultat:
    """Tolk, normalisér og validér én uploadet tidsserie.

    ``vaerk`` (valgfri) er værkets effektive case som dict (units/storage) - giver
    de værksafhængige regler (over_kapacitet, sol_*). Uden den springes de over."""
    k = k or krav()
    g = k["tidsserier"]["graenser"]
    fund = Fund(k)
    val: dict = {"version": k["version"], "rolle": rolle, "tidszone": tidszone,
                 "tidsstempel": tidsstempel, "enhed_kilde": enhed, "enhed": "MW"}

    def afvis():
        val["fund"] = fund.liste
        val["fejl"] = [f["besked"] for f in fund.liste if f["niveau"] == "fejl"]
        val["advarsler"] = [f["besked"] for f in fund.liste if f["niveau"] == "advarsel"]
        return Resultat("afvist", None, None, _komprimer(val, g))

    if rolle not in k["tidsserier"]["roller"]:
        fund("rolle_ukendt", rolle=rolle)
        return afvis()
    if tidszone not in ("UTC", "Europe/Copenhagen"):
        fund("tidszone_ukendt", tidszone=tidszone)
        return afvis()
    if tidsstempel not in ("start", "slut"):
        fund("tidsstempel_ukendt", tidsstempel=tidsstempel)
        return afvis()
    faktor_enhed = k["tidsserier"]["inputformat"]["enheder"].get(enhed)
    if faktor_enhed is None:
        fund("enhed_ukendt", enhed=enhed)
        return afvis()

    # --- bytes -> tekst
    if isinstance(indhold, (bytes, bytearray)):
        if len(indhold) > g["max_bytes"]:
            fund("for_stor", hvad=f"{len(indhold):,} bytes".replace(",", "."),
                 graense=f"{g['max_bytes']:,} bytes".replace(",", "."))
            return afvis()
        try:
            tekst = bytes(indhold).decode("utf-8")
        except UnicodeDecodeError:
            tekst = bytes(indhold).decode("cp1252", errors="replace")
            fund("kodning_cp1252")
    else:
        tekst = indhold

    tabel = laes_tabel(tekst)
    if tabel is None or not tabel["raekker"]:
        fund("tom")
        return afvis()
    if len(tabel["raekker"]) > g["max_raekker"]:
        fund("for_stor", hvad=f"{len(tabel['raekker']):,} rækker".replace(",", "."),
             graense=f"{g['max_raekker']:,} rækker".replace(",", "."))
        return afvis()

    kol = tabel["kolonner"]
    navne = [c.lower() for c in kol]
    prove = tabel["raekker"][:50]

    def andel(i, ok):
        felter = [r[i] for _, r in prove if i < len(r) and r[i].strip().lower() not in TOMME]
        return sum(1 for f in felter if ok(f)) / len(felter) if felter else 0.0

    it = next((navne.index(n) for n in k["tidsserier"]["inputformat"]["tidskolonne_navne"]
               if n in navne), None)
    if it is None or andel(it, lambda f: laes_stempel(f) is not None) < 0.9:
        it = next((i for i in range(len(kol)) if andel(i, lambda f: laes_stempel(f) is not None) >= 0.9), None)
    if it is None:
        # Excel-serietal (fx 45839,5) i stedet for en dato?
        if any(andel(i, lambda f: _ligner_excel(f, tabel["decimalkomma"])) >= 0.9 for i in range(len(kol))):
            fund("excel_serietal")
        else:
            fund("ingen_tid")
        return afvis()

    def er_talkol(i):
        def ok(f):
            try:
                laes_tal(f, tabel["decimalkomma"])
                return True
            except ValueError:
                return False
        return i != it and andel(i, ok) >= 0.9 and any(
            i < len(r) and r[i].strip().lower() not in TOMME for _, r in prove)

    talkol = [i for i in range(len(kol)) if er_talkol(i)]
    if kolonne is not None:
        if kolonne not in kol:
            fund("kolonne_findes_ikke", kolonne=kolonne, kolonner=", ".join(kol))
            return afvis()
        iv = kol.index(kolonne)
    else:
        foretrukne = [navne.index(n) for n in k["tidsserier"]["inputformat"]["vaerdikolonne_navne"]
                      if n in navne and navne.index(n) in talkol]
        iv = foretrukne[0] if foretrukne else (talkol[0] if talkol else None)
    if iv is None:
        fund("ingen_vaerdi")
        return afvis()
    if len(talkol) > 1 and kolonne is None:
        fund("flere_kolonner", antal=len(talkol), kolonne=kol[iv])
    val.update(tidskolonne=kol[it], vaerdikolonne=kol[iv], kilde_raekker=len(tabel["raekker"]))
    if navne[it] == "hour_dk" and tidszone == "UTC":
        fund("hour_dk_som_utc")

    # --- tid og tal
    ugyldig_tid, ugyldigt_tal, ikke_endelig = [], [], []
    tvetydige: set = set()
    findes_ikke, slash_us = [], []
    med_zone = uden_zone = 0
    rå: list = []                 # (utc, værdi|None, tekst|None, linje)
    lokal_naiv: list = []
    for nr, r in tabel["raekker"]:
        f = r[it] if it < len(r) else ""
        st = laes_stempel(f)
        if st is None:
            m_us = _DANSK.match(f.strip())
            if m_us and m_us[2] == "/" and int(m_us[3]) > 12 >= int(m_us[1]):
                slash_us.append(nr)              # måned/dag/år: måned 13+ findes ikke
            else:
                ugyldig_tid.append(nr)
            continue
        if st.slash and st.slash[1] > 12 >= st.slash[0]:
            slash_us.append(nr)
        try:
            v, vt = laes_tal(r[iv] if iv < len(r) else "", tabel["decimalkomma"])
        except ValueError as e:
            (ikke_endelig if str(e).lower().lstrip("+-") in ("inf", "infinity") else ugyldigt_tal).append(nr)
            continue
        if st.zone_min is not None:
            med_zone += 1
            t = (st.naiv - timedelta(minutes=st.zone_min)).replace(tzinfo=UTC)
        else:
            uden_zone += 1
            if tidszone == "UTC":
                t = st.naiv.replace(tzinfo=UTC)
            else:
                lokal_naiv.append(st.naiv)
                t, art = lokal_til_utc(st.naiv, tvetydige)
                if art == "findes_ikke":
                    findes_ikke.append(nr)
        rå.append((t, v, vt, nr, st.naiv))
    if ugyldig_tid:
        fund("ugyldig_tid", antal=len(ugyldig_tid), linjer=_linjer(ugyldig_tid))
    if slash_us:
        fund("amerikansk_dato", antal=len(slash_us), linjer=_linjer(slash_us))
    if ugyldigt_tal:
        fund("ugyldigt_tal", antal=len(ugyldigt_tal), linjer=_linjer(ugyldigt_tal))
    if ikke_endelig:
        fund("ikke_endelig", antal=len(ikke_endelig), linjer=_linjer(ikke_endelig))
    if med_zone and uden_zone:
        fund("blandet_zone")
    if med_zone and not uden_zone and tidszone != "UTC":
        fund("zone_i_fil")
    if findes_ikke:
        fund("dst_time_findes_ikke", antal=len(findes_ikke), linjer=_linjer(findes_ikke))
    if fund.har_fejl():
        return afvis()
    vaerdier_alle = [p for p in rå if p[1] is not None]
    if not vaerdier_alle:
        fund("alle_tomme")
        return afvis()

    # --- opløsning og timens slut
    rå.sort(key=lambda p: p[0])
    skridt: dict = {}
    for a, b in zip(rå, rå[1:]):
        d = b[0] - a[0]
        if d > timedelta(0):
            skridt[d] = skridt.get(d, 0) + 1
    typisk = max(skridt, key=lambda d: skridt[d]) if skridt else None
    if typisk not in (TIME, KVARTER):
        fund("oploesning", minutter=("?" if typisk is None else int(typisk.total_seconds() // 60)))
        return afvis()
    kilde_opl = "1h" if typisk == TIME else "15min"
    val["kilde_oploesning"] = kilde_opl
    forskyd = typisk if tidsstempel == "slut" else timedelta(0)

    # Mistanke om timens slut/start - på stemplerne, som de står i filen (naive).
    naive = sorted(p[4] for p in rå)
    n0, n1 = naive[0], naive[-1]
    if tidsstempel == "start" and n0.day == 1 and n0.hour == 1 and n0.minute == 0 \
            and n1.day == 1 and n1.hour == 0 and n1.minute == 0:
        fund("timeslut_mistanke")
    if tidsstempel == "slut" and n0.day == 1 and n0.hour == 0 and n0.minute == 0 \
            and (n1 + typisk).day == 1 and (n1 + typisk).hour == 0:
        fund("timestart_mistanke")

    # Dansk tid erklæret som UTC? (efterårets dobbelttime står to gange, forårets mangler)
    if tidszone == "UTC" and uden_zone:
        dobbelt = [n for n in set(naive) if naive.count(n) >= 2 and n.month == 10 and n.weekday() == 6
                   and n.day > 24 and n.hour == 2]
        sfort = set(naive)
        hul_forar = []
        for aar in sorted({n.year for n in naive}):
            s = _sidste_soendag(aar, 3).replace(tzinfo=None)     # 01:00 UTC = 02:00 lokal vinter
            kl2 = s.replace(hour=2)
            if n0 < kl2 < n1 and kl2 not in sfort and (kl2 - TIME) in sfort and (kl2 + TIME) in sfort:
                hul_forar.append(kl2)
        if dobbelt or hul_forar:
            fund("ligner_dansk_tid", hvor=", ".join(
                [d.strftime("%d-%m-%Y kl. %H") + " (to gange)" for d in sorted(dobbelt)]
                + [d.strftime("%d-%m-%Y kl. %H") + " (mangler)" for d in hul_forar]))

    # Efterårets dobbelttime kun én gang i dansk tid?
    if tidszone == "Europe/Copenhagen" and lokal_naiv:
        for aar in sorted({n.year for n in lokal_naiv}):
            kl2 = _sidste_soendag(aar, 10).replace(tzinfo=None, hour=2)
            if lokal_naiv[0] < kl2 < lokal_naiv[-1] and lokal_naiv.count(kl2) == 1:
                fund("dst_dobbelttime_en_gang", dato=kl2.strftime("%d-%m-%Y"))

    # --- skæve stempler, dubletter
    skaeve, dubletter = [], []
    pr_tid: dict = {}
    for t, v, vt, nr, _ in rå:
        t2 = t - forskyd
        if t2.minute % (60 if kilde_opl == "1h" else 15) or t2.second:
            skaeve.append(nr)
            continue
        if t2 in pr_tid:
            dubletter.append(nr)
            continue
        pr_tid[t2] = (v, vt)
    if skaeve:
        fund("skaev_tid", antal=len(skaeve), linjer=_linjer(skaeve),
             enhed="klokkeslæt" if kilde_opl == "1h" else "kvarter")
    if dubletter:
        fund("dubletter", antal=len(dubletter), linjer=_linjer(dubletter))
    if fund.har_fejl():
        return afvis()

    # --- 15 min -> 1 h (middel af fire kvarterer; ellers er timen et hul)
    if kilde_opl == "15min":
        timer: dict = {}
        for t, (v, vt) in pr_tid.items():
            if v is None:
                continue
            h = t.replace(minute=0)
            timer.setdefault(h, []).append(v)
        delvise = sum(1 for vs in timer.values() if len(vs) < 4)
        punkter = sorted((h, math.fsum(vs) / 4.0, None) for h, vs in timer.items() if len(vs) == 4)
        fund("kvarter_aggregeret")
        if delvise:
            fund("delvise_timer", antal=delvise)
        timer_pr_interval = 0.25
    else:
        punkter = sorted((t, v, vt) for t, (v, vt) in pr_tid.items() if v is not None)
        timer_pr_interval = 1.0
    if not punkter:
        fund("alle_tomme")
        return afvis()

    # --- enhed
    fak = faktor_enhed["faktor_til_mw"]
    if faktor_enhed.get("pr_interval"):
        fak = fak / timer_pr_interval
    if fak != 1.0:
        punkter = [(t, v * fak, None) for t, v, _ in punkter]
        fund("enhed_omregnet", enhed=enhed)

    # --- værdier
    vs = [v for _, v, _ in punkter]
    neg = [(t, v) for t, v, _ in punkter if v < 0]
    if neg:
        fund("negativ", antal=len(neg), foerste=_dato(neg[0][0]), vaerdi=tal_tekst(neg[0][1]))
    if max(vs) == 0:
        fund("alle_nul")
    if max(vs) > g["urimelig_stor_mw"]:
        fund("urimelig_stor", maks=tal_tekst(round(max(vs), 1)), graense=g["urimelig_stor_mw"])
    if len(punkter) < g["min_timer"]:
        fund("for_kort", antal=len(punkter), graense=g["min_timer"])
    if fund.har_fejl():
        return afvis()

    t0, t1 = punkter[0][0], punkter[-1][0]
    forventet = int((t1 - t0) / TIME) + 1
    tider = [t for t, _, _ in punkter]
    huller = []                                        # [fra, til (sidste manglende), antal]
    for a, b in zip(tider, tider[1:]):
        n = int((b - a) / TIME) - 1
        if n > 0:
            huller.append([a + TIME, b - TIME, n])
    antal_huller = sum(h[2] for h in huller)
    laengste = max((h[2] for h in huller), default=0)
    spaend_doegn = (t1 - t0 + TIME) / timedelta(days=1)

    # --- solprofil: huller udfyldes (højst 5 %), ellers afvises
    udfyldt = 0
    if rolle == "solprofil" and antal_huller:
        if antal_huller > g["sol_max_hulandel"] * forventet:
            fund("sol_huller", antal=antal_huller, andel=f"{antal_huller / forventet:.1%}".replace(".", ","))
            return afvis()
        ny = []
        for (ta, va, sa), (tb, vb, sb) in zip(punkter, punkter[1:]):
            ny.append((ta, va, sa))
            n = int((tb - ta) / TIME) - 1
            for j in range(1, n + 1):
                t = ta + j * TIME
                x = 0.0 if solen_er_nede(t) else va + (vb - va) * j / (n + 1)
                ny.append((t, x, None))
        ny.append(punkter[-1])
        punkter = ny
        udfyldt = antal_huller
        fund("sol_huller_udfyldt", antal=antal_huller, laengste=laengste)
        vs = [v for _, v, _ in punkter]

    total = math.fsum(vs)
    middel = total / len(vs)
    maks = max(vs)
    maks_t = next(t for t, v, _ in punkter if v == maks)
    val.update(start=tid_tekst(t0), slut=tid_tekst(t1), oploesning="1h",
               antal_raekker=len(punkter), forventet_raekker=forventet,
               antal_huller=0 if rolle == "solprofil" else antal_huller,
               udfyldte_timer=udfyldt, laengste_hul_timer=laengste,
               daekning=round(1 - (0 if rolle == "solprofil" else antal_huller) / forventet, 6),
               min=min(vs), max=maks, max_tid=tid_tekst(maks_t), middel=middel, sum_mwh=total,
               aarssum_gwh=middel * 8760.0 / 1000.0,
               benyttelsestid_t=(round(middel / maks * 8760.0) if maks > 0 else None),
               huller=[[tid_tekst(a), tid_tekst(b), n] for a, b, n in huller]
               if rolle == "varmelast" else [])

    if rolle == "varmelast" and huller:
        fund("huller", antal=antal_huller, laengste=laengste,
             andel=f"{antal_huller / forventet:.1%}".replace(".", ","))
        if laengste > g["langt_hul_timer"]:
            fund("langt_hul", laengste=laengste)
    if spaend_doegn < g["kort_serie_doegn"]:
        fund("kort_serie", doegn=f"{spaend_doegn:.1f}".replace(".", ","))

    if rolle == "varmelast":
        n0s, t0s = _nulstraek(punkter)
        if n0s >= g["nul_straek_timer"]:
            fund("nul_straek", timer=n0s, fra=_dato(t0s))
        nf, tf, vf = _konstant(punkter)
        if nf >= g["fastfrosset_timer"]:
            fund("fastfrosset", timer=nf, fra=_dato(tf), vaerdi=tal_tekst(vf))
        sp = _spidser(punkter, g["spids_vindue_timer"], g["spids_faktor"])
        if sp:
            fund("spids", antal=len(sp), foerste=_dato(sp[0][0]), vaerdi=tal_tekst(round(sp[0][1], 2)),
                 faktor=tal_tekst(g["spids_faktor"]))
        if spaend_doegn >= g["helaar_doegn"] and maks > 0:
            b = middel / maks * 8760.0
            lo, hi = g["benyttelsestid_varmelast_t"]
            if not lo <= b <= hi:
                fund("benyttelsestid", timer=round(b), lo=lo, hi=hi)

    if rolle == "solprofil" and total > 0:
        nat = [(t, v) for t, v, _ in punkter if solen_er_nede(t)]
        nat_sum = math.fsum(v for _, v in nat)
        nat_max = max((v for _, v in nat), default=0.0)
        if nat_sum > g["sol_nat_andel"] * total or nat_max > g["sol_nat_spids_andel"] * maks:
            fund("sol_nat", timer=sum(1 for _, v in nat if v > 0.01 * maks),
                 mwh=tal_tekst(round(nat_sum, 1)))
        tyngde = math.fsum(t.hour * v for t, v, _ in punkter) / total
        val["sol_tyngdepunkt_time_utc"] = round(tyngde, 3)
        lo, hi = g["sol_tyngdepunkt_utc"]
        if not lo <= tyngde <= hi:
            fund("sol_tidsforskudt", tyngde=f"{tyngde:.2f}".replace(".", ","), lo=lo, hi=hi)

    # --- værksafhængige regler
    if vaerk is not None:
        for f in vaerks_fund(punkter, rolle, vaerk, k, spaend_doegn):
            fund.liste.append(f)

    if fund.har_fejl():
        return afvis()

    # --- normaliseret fil
    ud = ["time,mw"]
    for t, v, vt in punkter:
        ud.append(f"{tid_tekst(t)},{vt if (vt is not None and fak == 1.0) else tal_tekst(v)}")
    data = ("\n".join(ud) + "\n").encode("utf-8")
    val["fund"] = fund.liste
    val["fejl"] = []
    val["advarsler"] = [f["besked"] for f in fund.liste if f["niveau"] == "advarsel"]
    return Resultat("gyldig", data, hashlib.sha256(data).hexdigest(), _komprimer(val, g),
                    [(t, v) for t, v, _ in punkter])


def _nulstraek(punkter):
    bedst = cur = 0
    start = bst = None
    forrige = None
    for t, v, _ in punkter:
        if v == 0 and forrige is not None and forrige[1] == 0 and t - forrige[0] == TIME:
            cur += 1
        elif v == 0:
            cur, start = 1, t
        else:
            cur = 0
        if cur > bedst:
            bedst, bst = cur, start
        forrige = (t, v)
    return bedst, bst


def _konstant(punkter):
    """Længste stræk af ens værdier > 0 i træk (fastfrosset måler)."""
    bedst = cur = 0
    start = bst = None
    bv = None
    forrige = None
    for t, v, _ in punkter:
        if v > 0 and forrige is not None and forrige[1] == v and t - forrige[0] == TIME:
            cur += 1
        elif v > 0:
            cur, start = 1, t
        else:
            cur = 0
        if cur > bedst:
            bedst, bst, bv = cur, start, v
        forrige = (t, v)
    return bedst, bst, bv


def _spidser(punkter, vindue: int, faktor: float):
    """Intervaller over faktor x medianen af et centreret vindue (vindue timer i
    alt, inkl. intervallet selv; kun tilstedeværende værdier)."""
    vs = [v for _, v, _ in punkter]
    ts = [t for t, _, _ in punkter]
    h = vindue // 2
    ud = []
    for i, v in enumerate(vs):
        lo, hi = i, i
        while lo > 0 and ts[i] - ts[lo - 1] <= h * TIME:
            lo -= 1
        while hi < len(vs) - 1 and ts[hi + 1] - ts[i] <= h * TIME:
            hi += 1
        s = sorted(vs[lo:hi + 1])
        n = len(s)
        med = s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
        if med > 0 and v > faktor * med:
            ud.append((ts[i], v))
    return ud


def _aktiv(enh: dict) -> bool:
    return enh.get("enabled", True) is not False


def vaerks_fund(punkter, rolle: str, vaerk: dict, k: dict, spaend_doegn: float) -> list[dict]:
    """Regler, der kræver værkets (effektive) konfiguration."""
    f = Fund(k)
    g = k["tidsserier"]["graenser"]
    units = {n: u for n, u in (vaerk.get("units") or {}).items() if isinstance(u, dict) and _aktiv(u)}
    vs = [v for _, v, _ in punkter]
    maks = max(vs)
    if rolle == "varmelast":
        kap = kapacitet_mw(vaerk)
        over = [(t, v) for t, v, _ in punkter if v > kap * (1 + 1e-9)]
        if over:
            f("over_kapacitet", antal=len(over), foerste=_dato(over[0][0]),
              vaerdi=tal_tekst(round(over[0][1], 2)), kap=tal_tekst(round(kap, 2)))
    if rolle == "solprofil":
        sol = [(n, u) for n, u in units.items() if u.get("type") == "solar_thermal"]
        if not sol:
            f("sol_ingen_enhed")
            return f.liste
        if len(sol) > 1:
            f("sol_flere_enheder", navne=", ".join(n for n, _ in sol))
            return f.liste
        navn, u = sol[0]
        pmax = float(u.get("p_max_heat") or 0)
        if pmax > 0 and maks > pmax * (1 + 1e-9):
            f("sol_over_pmax", maks=tal_tekst(round(maks, 2)), pmax=tal_tekst(pmax), navn=navn)
        if pmax >= g["sol_andel_min_pmax"] and 0 < maks <= 1.0:
            f("sol_andel", pmax=tal_tekst(pmax))
        if spaend_doegn >= g["helaar_doegn"] and pmax > 0:
            b = math.fsum(vs) / len(vs) * 8760.0 / pmax
            lo, hi = g["benyttelsestid_sol_t"]
            if not lo <= b <= hi:
                f("sol_benyttelsestid", timer=round(b), lo=lo, hi=hi, pmax=tal_tekst(pmax))
    return f.liste


def _komprimer(val: dict, g: dict) -> dict:
    """validering_json skal kunne gemmes i 4000 tegn (KONTRAKT §3.0, kompakt JSON).
    Afkort hullisten først, derefter info-fund - aldrig fejl eller advarsler."""
    def laengde(v):
        return len(json.dumps(v, ensure_ascii=False, separators=(",", ":")))
    v = dict(val)
    graense = g["validering_json_max_tegn"]
    if laengde(v) > graense and v.get("huller"):
        hl = sorted(v["huller"], key=lambda h: -h[2])
        while hl and laengde({**v, "huller": hl}) > graense:
            hl = hl[: max(0, len(hl) // 2)]
        v["huller"] = sorted(hl)
        v["huller_fuld"] = False
    elif v.get("huller") is not None:
        v["huller_fuld"] = True
    if laengde(v) > graense and v.get("fund"):
        v["fund"] = [x for x in v["fund"] if x["niveau"] != "info"]
    if laengde(v) > graense:
        for x in v.get("fund", []):
            x["besked"] = x["besked"][:160]
        v["fejl"] = [b[:160] for b in v.get("fejl", [])]
        v["advarsler"] = [b[:160] for b in v.get("advarsler", [])]
    if laengde(v) > graense:
        raise ValueError(f"validering_json er {laengde(v)} tegn - over {graense} (fejl højlydt, §3.0)")
    return v


def _ligner_excel(f: str, decimalkomma: bool) -> bool:
    try:
        v, _ = laes_tal(f, decimalkomma)
    except ValueError:
        return False
    return v is not None and 20000 <= v <= 80000


# ---------------------------------------------------------------- ved bestilling

def tjek_koersel(validering: dict, rolle: str, start: str, slut: str, *,
                 status: str = "gyldig", vaerk: dict | None = None,
                 punkter: list | None = None, k: dict | None = None) -> list[dict]:
    """Regler ved bestilling (startBestilling) og i arbejderen: dækker den frosne
    tidsserie kørslens timer? ``start``/``slut`` er kørslens første og sidste time
    (ISO, UTC, begge inklusive - som modellens akse efter _apply_time_override).
    ``punkter`` (valgfri) gør tjekket eksakt; uden dem bruges validering_json."""
    k = k or krav()
    g = k["tidsserier"]["graenser"]
    f = Fund(k)
    if status != "gyldig":
        f("koersel_tidsserie_ikke_gyldig", status=status)
        return f.liste
    a = datetime.fromisoformat(start.replace("Z", "+00:00"))
    b = datetime.fromisoformat(slut.replace("Z", "+00:00"))
    a = a if a.tzinfo else a.replace(tzinfo=UTC)
    b = b if b.tzinfo else b.replace(tzinfo=UTC)
    vindue = int((b - a) / TIME) + 1
    s0 = datetime.fromisoformat(validering["start"].replace("Z", "+00:00"))
    s1 = datetime.fromisoformat(validering["slut"].replace("Z", "+00:00"))
    if punkter is not None:
        har = {t for t, _ in punkter}
        mangler = sum(1 for i in range(vindue) if a + i * TIME not in har)
        eksakt = True
    else:
        uden_for = max(0, int((s0 - a) / TIME)) + max(0, int((b - s1) / TIME))
        i_huller = 0
        for h in validering.get("huller", []):
            ha = datetime.fromisoformat(h[0].replace("Z", "+00:00"))
            hb = datetime.fromisoformat(h[1].replace("Z", "+00:00"))
            lo, hi = max(ha, a), min(hb, b)
            if lo <= hi:
                i_huller += int((hi - lo) / TIME) + 1
        mangler = min(vindue, uden_for + i_huller)
        eksakt = validering.get("huller_fuld", True)
    if rolle == "varmelast":
        if mangler > g["model_max_hulandel"] * vindue:
            f("koersel_varmelast_daekning", mangler=mangler, vindue=vindue,
              andel=f"{mangler / vindue:.1%}".replace(".", ","),
              serie=f"{_dato(s0)} - {_dato(s1)}")
        elif mangler:
            f("koersel_varmelast_huller", mangler=mangler, vindue=vindue)
    else:
        if mangler:
            f("koersel_sol_daekning", mangler=mangler, vindue=vindue,
              serie=f"{_dato(s0)} - {_dato(s1)}")
    if not eksakt:
        f("koersel_huller_afkortet")
    if vaerk is not None and punkter is not None and rolle == "varmelast":
        kap = kapacitet_mw(vaerk)
        over = [(t, v) for t, v in punkter if a <= t <= b and v > kap * (1 + 1e-9)]
        if over:
            f("koersel_over_kapacitet", antal=len(over), foerste=_dato(over[0][0]),
              vaerdi=tal_tekst(round(over[0][1], 2)), kap=tal_tekst(round(kap, 2)))
    return f.liste


def kapacitet_mw(vaerk: dict) -> float:
    """Største varme, værket overhovedet kan levere i én time: aktive enheders
    p_max_heat + aktive lagres p_max_discharge_mw. En nødvendig betingelse - ligger
    behovet over, er timen uløselig uanset alt andet (modellen har intet slæk)."""
    units = [u for u in (vaerk.get("units") or {}).values() if isinstance(u, dict) and _aktiv(u)]
    lagre = [s for s in (vaerk.get("storage") or {}).values() if isinstance(s, dict) and _aktiv(s)]
    return (math.fsum(float(u.get("p_max_heat") or 0) for u in units)
            + math.fsum(float(s.get("p_max_discharge_mw") or 0) for s in lagre))


# ---------------------------------------------------------------- CLI

def main(argv: list[str]) -> int:
    sys.stdout.reconfigure(errors="replace")
    import argparse
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("fil", type=Path)
    p.add_argument("rolle", choices=["varmelast", "solprofil"])
    p.add_argument("--tidszone", default="UTC")
    p.add_argument("--tidsstempel", default="start")
    p.add_argument("--enhed", default="MW")
    p.add_argument("--kolonne", default=None)
    p.add_argument("--ud", type=Path, default=None, help="skriv den normaliserede fil her")
    a = p.parse_args(argv)
    r = valider(a.fil.read_bytes(), a.rolle, tidszone=a.tidszone, tidsstempel=a.tidsstempel,
                enhed=a.enhed, kolonne=a.kolonne)
    print(f"status: {r.status}   sha256: {r.sha256}")
    for x in r.validering.get("fund", []):
        print(f"  [{x['niveau']}] {x['kode']}: {x['besked']}")
    if r.data and a.ud:
        a.ud.write_bytes(r.data)
    return 0 if r.status == "gyldig" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
