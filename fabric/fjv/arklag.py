"""Appens eget lag i værksarket (runde 14): fanerne *Start og drift*, *Balancemarked* og *Øvrige felter*.

Modelrepoets skabelon og ``scripts/vaerksark_til_yaml.py`` bærer kun en del af et værk: scriptet sætter selv
``initial_status: 0``, tankenes startfyldning, CO2-faktoren og unit commitment, og det skriver en case uden
``balancing``-blok. Appen lægger derfor tre **egne** faner i det eksporterede ark. Modelscriptet læser dem ikke
(det åbner sine ark ved navn); importen læser dem HER og lægger deres værdier oven på scriptets læsning, før værket
gemmes (nyt værk) eller forskellen beregnes (revision; basis og arket behandles ens).

Fanernes form — fælles kontrakt med eksporten (app/src/sider/konfiguration/eksport/lag.ts):

* **feltblok**: en overskriftsrække med ``felt`` i kolonne A og en kolonne ``sti i modellen``. Hver række under den
  (til første række uden sti) er ét felt. Værdikolonnen hedder ``værdi``; hedder kolonnerne i stedet ``aFRR`` og
  ``mFRR``, står ``{marked}`` i stien.
* **tabel**: en overskriftsrække med ``navn``, ``tank`` eller ``måned`` i kolonne A, og lige under den en række med
  ``sti i modellen`` i kolonne A og en stiskabelon pr. kolonne (``units.{enhed}.initial_status``). Hver række under
  den (til første tomme celle i A) er én enhed, tank eller måned.
* **Øvrige felter**: en overskriftsrække med ``sti`` i kolonne A og kolonnerne ``værdi`` og ``kun hvis
  modelscriptet giver``. Teksten ``(findes ikke)`` som værdi fjerner feltet.

Regler:

* I en feltblok og en tabel gælder cellen: en udfyldt celle sætter feltet, en tom celle betyder, at feltet ikke
  sættes (modellen bruger sin standard) — også når modelscriptet ville have sat det. En enhed UDEN række i en tabel
  beholder modelscriptets værdier, og importens log siger det.
* En række i *Øvrige felter* med noget i ``kun hvis modelscriptet giver`` gælder kun, så længe scriptet læser netop
  den værdi af de øvrige faner. Har brugeren rettet det, scriptets værdi kommer af, vinder rettelsen, og loggen
  siger, at rækken ikke blev brugt. Sådan kan laget aldrig tavst skjule en celle i modelrepoets faner.
* Hver værdi valideres som en redigering i appen: kendt sti (feltkataloget), feltets type og grænser. En ukendt
  sti, et ukendt enhedsnavn eller en værdi af forkert type afviser hele importen med ark, celle og grund.
* Navne normaliseres som modelscriptet gør (``fjv.revision.slug``), så lagets stier står i samme navnerum som
  scriptets læsning; ved en revision føres de tilbage med ``fjv.revision.objektkort``.

Modulet indeholder også importens to højlydte kontroller (brief C): rækker i modelrepoets faner, som scriptet
ville springe over uden besked (``tjek_tavse_raekker``), og advarslen, når ingen enhed kan levere i første time
uden tank (``foerste_time_advarsel``).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from . import arklaes as AL
from . import feltkatalog as FK
from . import revision as REV

START_OG_DRIFT = "Start og drift"
BALANCEMARKED = "Balancemarked"
OEVRIGE = "Øvrige felter"
#: Læses i denne rækkefølge; en senere tildeling af samme sti vinder.
FANER = (START_OG_DRIFT, BALANCEMARKED, OEVRIGE)
FINDES_IKKE = "(findes ikke)"
STI_OVERSKRIFT = "sti i modellen"
TABELNOEGLER = ("navn", "tank", "måned")
PLADSHOLDERE = ("{enhed}", "{tank}", "{måned}")
_MAANED = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_KOLONNER_UDEN_VAERDI = {"", "felt", "enhed", "forklaring", "standard", STI_OVERSKRIFT}
MAKS_FEJL = 8


class LagFejl(ValueError):
    """Appens faner kan ikke lægges på værket. Beskeden nævner ark, celle og grund og er til brugeren."""


@dataclass
class Tildeling:
    """Én celle i appens faner: ``sti`` (i scriptets navnerum) sættes til ``json`` — eller fjernes (``None``)."""
    sti: str
    json: str | None
    ark: str
    celle: str
    #: Kun *Øvrige felter*: rækken gælder kun, når modelscriptet giver denne værdi (``FINDES_IKKE`` = intet felt).
    betingelse: str | None = None
    #: Enheden/tanken, rækken hører til i en tabel: (sektion, scriptnavn, navnet som skrevet).
    objekt: tuple | None = None


@dataclass
class Laesning:
    tildelinger: list = field(default_factory=list)
    #: {(ark, "units"|"storage"): {scriptnavn}} — de enheder/tanke, en tabel har en række for.
    tabeller: dict = field(default_factory=dict)
    faner: list = field(default_factory=list)


@dataclass
class Lag:
    """Resultatet af at lægge appens faner på scriptets læsning."""
    blade: dict                                   # sti -> vaerdi_json, scriptets navnerum
    #: Scriptets læsning med værkets skrivemåder (det, ændringerne er regnet imod).
    script: dict = field(default_factory=dict)
    kilder: dict = field(default_factory=dict)    # sti -> "Start og drift!D7" (felter, laget satte)
    fjernet: dict = field(default_factory=dict)   # sti -> celle (felter, laget fjernede)
    aendringer: list = field(default_factory=list)   # (sti, handling, scriptets json, lagets json)
    noter: list = field(default_factory=list)     # til importens log
    advarsler: list = field(default_factory=list)
    antal: dict = field(default_factory=dict)     # ark -> antal felter, laget satte eller fjernede

    def stier(self) -> set:
        """De stier, laget har bestemt (sat eller fjernet) i denne læsning."""
        return set(self.kilder) | set(self.fjernet)


# ------------------------------------------------------------------ navne

def til_script(sti: str) -> str:
    """Stien i scriptets navnerum: enheds- og tanknavne normaliseret som ``slug()`` — også hvor balancemarkedet
    nævner en enhed i stien. Rejser ``LagFejl``, hvis et navn bliver tomt."""
    d = sti.split(".")
    i = None
    if d[0] in ("units", "storage") and len(d) > 2:
        i = 1
    elif len(d) >= 4 and d[:3] in (["balancing", "ancillary_caps", "per_unit_mw"],
                                    ["balancing", "ancillary_caps", "per_unit_market_mw"]):
        i = 3
    if i is not None:
        s = REV.slug(d[i])
        if not s:
            raise LagFejl(f"navnet {d[i]!r} i stien {sti} bliver tomt efter modelscriptets normalisering")
        d[i] = s
    return ".".join(d)


def enhedsreference(sti: str) -> str | None:
    """Hvilken slags enhedsnavn VÆRDIEN er, hvis feltet peger på en enhed: ``"tekst"`` eller ``"liste"``."""
    d = sti.split(".")
    if d[0] == "balancing" and d[-2:] == ["opportunity_cost", "reference_unit"]:
        return "tekst"
    if d[0] == "ancillary_groups" and len(d) == 3 and d[2] == "units":
        return "liste"
    return None


def enhedsnavn_i_sti(sti: str) -> str | None:
    """Enhedsnavnet, en balancemarkedssti nævner (``per_unit_mw.<enhed>``), eller None."""
    d = sti.split(".")
    if len(d) >= 4 and d[:3] in (["balancing", "ancillary_caps", "per_unit_mw"],
                                  ["balancing", "ancillary_caps", "per_unit_market_mw"]):
        return d[3]
    return None


def _med_script_navne(sti: str, vaerdi_json: str) -> str:
    """Enhedsnavne i en VÆRDI (referenceenhed, budgruppens enheder) i scriptets navnerum."""
    art = enhedsreference(sti)
    if not art:
        return vaerdi_json
    v = json.loads(vaerdi_json)
    if art == "tekst" and isinstance(v, str):
        return FK.til_json(REV.slug(v) or v)
    if art == "liste" and isinstance(v, list):
        return FK.til_json([REV.slug(x) or x if isinstance(x, str) else x for x in v])
    return vaerdi_json


# ------------------------------------------------------------------ læsning af fanerne

def har_faner(sti: Path) -> bool:
    try:
        return bool(AL.laes_ark(sti, kun=FANER))
    except AL.LaeseFejl:
        return False


def laes(sti: Path) -> Laesning:
    """Appens faner i arket som tildelinger (i fanernes rækkefølge). Et ark uden fanerne giver en tom læsning.

    Rejser ``LagFejl`` med ark, celle og grund for hver celle, der ikke kan læses (højst ``MAKS_FEJL`` vist)."""
    try:
        ark = AL.laes_ark(sti, kun=FANER)
    except AL.LaeseFejl as e:
        raise LagFejl(str(e)) from e
    ud = Laesning()
    fejl: list[str] = []
    for navn in FANER:
        if navn not in ark:
            continue
        ud.faner.append(navn)
        _laes_fane(navn, ark[navn], ud, fejl)
    if fejl:
        raise LagFejl(_saml(fejl))
    return ud


def _saml(fejl: list[str]) -> str:
    vis = fejl[:MAKS_FEJL]
    rest = f" (og {len(fejl) - len(vis)} mere)" if len(fejl) > len(vis) else ""
    return "Appens faner i arket kan ikke bruges: " + "; ".join(vis) + rest + ". Intet er gemt."


def _laes_fane(navn: str, c: dict, ud: Laesning, fejl: list) -> None:
    # Codex fund 2: en formel uden gemt resultat er ikke en tom celle. Den afvises med ark og celle, før noget læses —
    # ellers ville den betyde "feltet sættes ikke" og tavst fjerne scriptets værdi.
    for (r, k), v in sorted(c.items()):
        if v is AL.FORMEL_UDEN_RESULTAT:
            fejl.append(f"{navn}!{AL.ref(r, k)}: cellen har en formel uden et gemt resultat (arket er gemt af et "
                        "program, der ikke regner formler ud). Åbn arket i Excel og gem det igen, eller skriv tallet "
                        "i cellen i stedet for formlen")
    if any(v is AL.FORMEL_UDEN_RESULTAT for v in c.values()):
        return
    # Codex fund 1: løkken går over de rækker, fanen HAR celler i — ikke over alle rækkenumre til den sidste celle.
    raekker = AL.raekker(c)
    sidste = raekker[-1] if raekker else 0
    i = 0
    while i < len(raekker):
        r = raekker[i]
        a = AL.norm(c.get((r, 1)))
        if a == "felt" and _kolonne(c, r, STI_OVERSKRIFT):
            naeste = _feltblok(navn, c, r, sidste, ud, fejl)
        elif a in TABELNOEGLER and AL.norm(c.get((r + 1, 1))) == STI_OVERSKRIFT:
            naeste = _tabel(navn, c, r, sidste, ud, fejl)
        elif a == "sti" and navn == OEVRIGE and _kolonne(c, r, "værdi"):
            naeste = _oevrige(navn, c, r, sidste, ud, fejl)
        else:
            naeste = r + 1
        while i < len(raekker) and raekker[i] < naeste:
            i += 1


def _kolonne(c: dict, r: int, overskrift: str, praefiks: bool = False) -> int | None:
    for (rk, k), v in c.items():
        t = AL.norm(v)
        if rk == r and (t == overskrift or (praefiks and t.startswith(overskrift))):
            return k
    return None


def _tildel(navn: str, c: dict, r: int, k: int, sti: str, ud: Laesning, fejl: list, objekt=None,
            betingelse: str | None = None, tom_fjerner: bool = True) -> None:
    """Cellen (r, k) som tildeling af ``sti`` (i arkets navne). Fejl samles med ark og celle."""
    hvor = f"{navn}!{AL.ref(r, k)}"
    celle = c.get((r, k))
    try:
        if not REV.gyldig_sti(sti):
            raise FK.FeltFejl(f"stien {sti!r} er ikke gyldig")
        post = FK.find(sti)
        if not post or not post.get("blad"):
            raise FK.FeltFejl(f"stien {sti} findes ikke i feltkataloget (et felt, modellen ikke kender)")
        s = til_script(sti)
        if celle is None or (isinstance(celle, str) and not celle.strip()):
            if not tom_fjerner:
                raise FK.FeltFejl(f"{sti} har ingen værdi; skriv {FINDES_IKKE} for at fjerne feltet, eller slet rækken")
            ud.tildelinger.append(Tildeling(s, None, navn, AL.ref(r, k), betingelse, objekt))
            return
        if isinstance(celle, str) and celle.strip().lower() == FINDES_IKKE and not tom_fjerner:
            ud.tildelinger.append(Tildeling(s, None, navn, AL.ref(r, k), betingelse, objekt))
            return
        j = FK.fra_celle(sti, celle, post)
        if len(j) > FK.MAKS_JSON:
            raise FK.FeltFejl(f"{post['etiket']}: værdien er for lang (højst {FK.MAKS_JSON} tegn)")
        grund = FK.tjek(sti, j, post)
        if grund:
            raise FK.FeltFejl(grund)
        ud.tildelinger.append(Tildeling(s, _med_script_navne(sti, j), navn, AL.ref(r, k), betingelse, objekt))
    except (FK.FeltFejl, LagFejl) as e:
        fejl.append(f"{hvor}: {e}")


def _feltblok(navn: str, c: dict, h: int, sidste: int, ud: Laesning, fejl: list) -> int:
    p = _kolonne(c, h, STI_OVERSKRIFT)
    vaerdikol = [(k, AL.norm(c.get((h, k)))) for k in range(2, p) if AL.norm(c.get((h, k))) not in _KOLONNER_UDEN_VAERDI]
    r = h + 1
    while r <= sidste:
        skabelon = c.get((r, p))
        if not isinstance(skabelon, str) or not skabelon.strip():
            break
        skabelon = skabelon.strip()
        for k, overskrift in vaerdikol:
            if overskrift == "værdi":
                if "{marked}" in skabelon:
                    fejl.append(f"{navn}!{AL.ref(r, p)}: stien {skabelon} har {{marked}}, men kolonnen hedder 'værdi'")
                    continue
                sti = skabelon
            else:
                if "{marked}" not in skabelon:
                    fejl.append(f"{navn}!{AL.ref(r, p)}: stien {skabelon} mangler {{marked}} (kolonnerne er markeder)")
                    break
                sti = skabelon.replace("{marked}", overskrift)
            _tildel(navn, c, r, k, sti, ud, fejl)
        r += 1
    return r


def _noegle(navn: str, c: dict, r: int, art: str, fejl: list) -> str | None:
    v = c.get((r, 1))
    if art == "{måned}":
        if isinstance(v, (int, float)) and not isinstance(v, bool) and 20000 <= v <= 80000:
            # Excel gør "2026-03" til en dato (serietal); måneden er datoens måned.
            d = date(1899, 12, 30) + timedelta(days=int(v))
            v = f"{d.year:04d}-{d.month:02d}"
        if not isinstance(v, str) or not _MAANED.match(v.strip()):
            fejl.append(f"{navn}!{AL.ref(r, 1)}: måneden skal skrives ÅÅÅÅ-MM (fx 2026-03), ikke {v!r}")
            return None
        return v.strip()
    tekst = str(int(v)) if isinstance(v, float) and v.is_integer() else str(v)
    return tekst.strip()


def _tabel(navn: str, c: dict, h: int, sidste: int, ud: Laesning, fejl: list) -> int:
    t = h + 1
    kolonner = []
    for k in sorted(kk for (rk, kk) in c if rk == t and kk > 1):
        skabelon = c.get((t, k))
        if not isinstance(skabelon, str) or not skabelon.strip():
            continue
        skabelon = skabelon.strip()
        arter = [p for p in PLADSHOLDERE if p in skabelon]
        if len(arter) != 1 or skabelon.count(arter[0]) != 1:
            fejl.append(f"{navn}!{AL.ref(t, k)}: stiskabelonen {skabelon} skal have præcis én af "
                        f"{', '.join(PLADSHOLDERE)}")
            continue
        kolonner.append((k, skabelon, arter[0]))
    set_noegler: dict = {}
    r = t + 1
    while r <= sidste:
        if c.get((r, 1)) is None or (isinstance(c.get((r, 1)), str) and not c[(r, 1)].strip()):
            break
        for art in sorted({a for _k, _s, a in kolonner}):
            noegle = _noegle(navn, c, r, art, fejl)
            if noegle is None:
                continue
            objekt = None
            if art in ("{enhed}", "{tank}"):
                sek = "units" if art == "{enhed}" else "storage"
                s = REV.slug(noegle)
                if not s:
                    fejl.append(f"{navn}!{AL.ref(r, 1)}: navnet {noegle!r} bliver tomt efter modelscriptets normalisering")
                    continue
                if s in set_noegler.setdefault((sek, t), {}):
                    fejl.append(f"{navn}!{AL.ref(r, 1)}: {noegle!r} står to gange i tabellen (også række "
                                f"{set_noegler[(sek, t)][s]})")
                    continue
                set_noegler[(sek, t)][s] = r
                ud.tabeller.setdefault((navn, sek), set()).add(s)
                objekt = (sek, s, noegle)
            elif noegle in set_noegler.setdefault(("måned", t), {}):
                fejl.append(f"{navn}!{AL.ref(r, 1)}: måneden {noegle} står to gange i tabellen")
                continue
            else:
                set_noegler[("måned", t)][noegle] = r
            for k, skabelon, a in kolonner:
                if a != art:
                    continue
                # En måned uden værdi i cellen er ikke et felt (tabellen har tomme rækker til nye måneder).
                if art == "{måned}" and c.get((r, k)) is None:
                    continue
                _tildel(navn, c, r, k, skabelon.replace(art, noegle), ud, fejl, objekt=objekt)
        r += 1
    return r


def _oevrige(navn: str, c: dict, h: int, sidste: int, ud: Laesning, fejl: list) -> int:
    kv = _kolonne(c, h, "værdi")
    kb = _kolonne(c, h, "kun hvis", praefiks=True)
    set_stier: dict = {}
    for r in (x for x in AL.raekker(c) if x > h):
        sti = c.get((r, 1))
        if sti is None or (isinstance(sti, str) and not sti.strip()):
            continue
        if not isinstance(sti, str):
            fejl.append(f"{navn}!{AL.ref(r, 1)}: stien skal være tekst, ikke {sti!r}")
            continue
        sti = sti.strip()
        if sti in set_stier:
            fejl.append(f"{navn}!{AL.ref(r, 1)}: {sti} står to gange (også række {set_stier[sti]})")
            continue
        set_stier[sti] = r
        betingelse = None
        b = c.get((r, kb)) if kb else None
        if b is not None and not (isinstance(b, str) and not b.strip()):
            if isinstance(b, str) and b.strip().lower() == FINDES_IKKE:
                betingelse = FINDES_IKKE
            else:
                try:
                    betingelse = _med_script_navne(sti, FK.fra_celle(sti, b))
                except FK.FeltFejl as e:
                    fejl.append(f"{navn}!{AL.ref(r, kb)}: {e}")
                    continue
        _tildel(navn, c, r, kv, sti, ud, fejl, betingelse=betingelse, tom_fjerner=False)
    return sidste + 1


# ------------------------------------------------------------------ laget lagt på scriptets læsning

def _objekter(blade: dict, sektion: str) -> set:
    return {s.split(".")[1] for s in blade if s.startswith(f"{sektion}.") and len(s.split(".")) > 2}


def _gruppe(sti: str) -> str:
    """Betingede fjernelser hører sammen blokvis: fjernes hele tarifskemaet, og er ét af dets felter rettet i
    modelrepoets faner, gælder ingen af fjernelserne (ellers stod et halvt skema tilbage)."""
    d = sti.split(".")
    return sti if d[0] in REV.OBJEKT_SEKTIONER or len(d) < 3 else ".".join(d[:2])


def _lig(a: str | None, b: str | None) -> bool:
    """To værdier er ens med regnearkets præcision; et heltal og et decimaltal med samme værdi er ens (et
    regneark kender ikke forskellen)."""
    if a is None or b is None:
        return a is b
    if REV.samme_vaerdi(a, b):
        return True
    try:
        x, y = json.loads(a), json.loads(b)
    except ValueError:
        return False
    tal = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)   # noqa: E731
    return tal(x) and tal(y) and REV._p15(float(x)) == REV._p15(float(y))


def _vis(j: str | None) -> str:
    return "intet" if j is None else (j if len(j) <= 60 else j[:57] + "…")


def anvend(script: dict, laesning: Laesning, former: dict | None = None) -> Lag:
    """Lagets tildelinger lagt på scriptets læsning (``sti -> vaerdi_json``, scriptets navne).

    ``former`` er markeringens skrivemåder (``_app``, format 3): står et tal i det færdige værk med samme værdi,
    men skrevet anderledes end i det eksporterede værk (12.0 mod 12), beholdes værkets skrivemåde."""
    lag = Lag(dict(script))
    fejl: list[str] = []
    enheder = {"units": _objekter(script, "units"), "storage": _objekter(script, "storage")}

    # Tabellernes rækker skal være enheder og tanke, modelscriptet har læst (de står i Anlaeg).
    kendt_fejl = set()
    for t in laesning.tildelinger:
        if t.objekt and t.objekt[1] not in enheder[t.objekt[0]] and (t.ark, t.objekt) not in kendt_fejl:
            kendt_fejl.add((t.ark, t.objekt))
            hvad = "enheden" if t.objekt[0] == "units" else "tanken"
            fejl.append(f"{t.ark}!A{re.sub(r'^[A-Z]+', '', t.celle)}: {hvad} {t.objekt[2]!r} står ikke i arket Anlaeg "
                        f"(kendte: {', '.join(sorted(enheder[t.objekt[0]])) or 'ingen'})")
    if fejl:
        raise LagFejl(_saml(fejl))

    # Betingede rækker (Øvrige felter): gælder kun, når scriptet stadig giver den værdi, rækken er skrevet til.
    foraeldet = {}
    for i, t in enumerate(laesning.tildelinger):
        if t.betingelse is None:
            continue
        nu = script.get(t.sti)
        if not (nu is None if t.betingelse == FINDES_IKKE else _lig(nu, t.betingelse)):
            foraeldet[i] = nu
    grupper = {_gruppe(laesning.tildelinger[i].sti) for i in foraeldet if laesning.tildelinger[i].json is None}
    for i, t in enumerate(laesning.tildelinger):
        if t.betingelse is not None and t.json is None and i not in foraeldet and _gruppe(t.sti) in grupper \
                and _gruppe(t.sti) != t.sti:
            foraeldet[i] = script.get(t.sti)
    for i in sorted(foraeldet):
        t = laesning.tildelinger[i]
        lag.noter.append(
            f"{t.ark}!{t.celle} ({t.sti}) er ikke brugt: rækken gælder, når modelscriptet giver "
            f"{_vis(None if t.betingelse == FINDES_IKKE else t.betingelse)}, men det læser nu {_vis(foraeldet[i])} "
            "af arkets øvrige faner. Det, der står dér, gælder.")

    for i, t in enumerate(laesning.tildelinger):
        if i in foraeldet:
            continue
        foer = lag.blade.get(t.sti)
        if t.json is None:
            if t.sti in lag.blade:
                del lag.blade[t.sti]
            lag.kilder.pop(t.sti, None)
            # Kun en fjernelse af noget, scriptet (eller en tidligere celle) havde sat, er en ændring.
            if foer is not None or t.sti in script:
                lag.fjernet[t.sti] = f"{t.ark}!{t.celle}"
        else:
            lag.blade[t.sti] = t.json
            lag.kilder[t.sti] = f"{t.ark}!{t.celle}"
            lag.fjernet.pop(t.sti, None)
        if t.ark == START_OG_DRIFT and t.json is None and t.sti.endswith(".uc_enabled") and script.get(t.sti) == "true":
            lag.advarsler.append(
                f"{t.ark}!{t.celle}: start/stop-logik (unit commitment) er tom for {t.sti.split('.')[1]} og regnes "
                "derfor som nej (modellens standard). Modelscriptet ville have slået den til, fordi enheden har en "
                "minimumslast eller en mindste driftstid. Skriv ja i cellen, hvis de skal gælde.")

    # Felter, der kun er fjernet, og som scriptet aldrig havde, er ikke en del af laget.
    lag.fjernet = {s: c for s, c in lag.fjernet.items() if s in script and s not in lag.blade}

    # Enheder, balancemarkedet peger på, skal findes i det færdige værk.
    alle = _objekter(lag.blade, "units")
    for sti, hvor in sorted(lag.kilder.items()):
        n = enhedsnavn_i_sti(sti)
        if n is not None and n not in alle:
            fejl.append(f"{hvor}: enheden {n!r} ({sti}) findes ikke i værket (kendte: {', '.join(sorted(alle))})")
        art = enhedsreference(sti)
        if art:
            v = json.loads(lag.blade[sti])
            for x in ([v] if art == "tekst" else v if isinstance(v, list) else []):
                if isinstance(x, str) and x not in alle:
                    fejl.append(f"{hvor}: enheden {x!r} ({sti}) findes ikke i værket (kendte: "
                                f"{', '.join(sorted(alle))})")
    # Intet blad over eller under et andet (ellers kan YAML'en ikke genskabes) — som planlaegParametre.
    for sti in sorted(lag.kilder):
        d = sti.split(".")
        for i in range(1, len(d)):
            if ".".join(d[:i]) in lag.blade:
                fejl.append(f"{lag.kilder[sti]}: {sti} kan ikke sættes, fordi {'.'.join(d[:i])} er en værdi i værket")
        if any(s.startswith(sti + ".") for s in lag.blade):
            fejl.append(f"{lag.kilder[sti]}: {sti} kan ikke være en værdi, fordi værket har felter under den")
    if fejl:
        raise LagFejl(_saml(fejl))

    # Skrivemåder: samme tal, værkets egen form (12 i stedet for 12.0). Det er ikke en ændring af værdien og
    # hører derfor til scriptets læsning, ikke til laget: ændringerne nedenfor regnes mod læsningen MED formerne.
    lag.script = dict(script)
    n_form = 0
    for sti, j in (former or {}).items():
        try:
            s = til_script(sti)
        except LagFejl:
            continue
        for d in (lag.script, lag.blade):
            nu = d.get(s)
            if nu is not None and nu != j and _samme_tal(nu, j):
                d[s] = j
                n_form += d is lag.blade
    if n_form:
        lag.noter.append(f"{n_form} tal beholder værkets skrivemåde (fx 12 i stedet for 12.0); et regneark kender "
                         "ikke forskellen.")

    for sti in sorted(set(lag.script) | set(lag.blade)):
        g, n = lag.script.get(sti), lag.blade.get(sti)
        if g == n:
            continue
        lag.aendringer.append((sti, "slet" if n is None else "opret" if g is None else "ret", g, n))
    for hvor in list(lag.kilder.values()) + list(lag.fjernet.values()):
        ark = hvor.split("!")[0]
        lag.antal[ark] = lag.antal.get(ark, 0) + 1

    # En enhed i Anlaeg uden række i en tabel beholder modelscriptets værdier — siges højt.
    for (ark, sek), navne in sorted(laesning.tabeller.items()):
        if ark != START_OG_DRIFT:
            continue
        uden = sorted(enheder[sek] - navne)
        if uden:
            hvad = "Enheden" if sek == "units" else "Tanken"
            flertal = "Enhederne" if sek == "units" else "Tankene"
            lag.noter.append(
                f"{hvad if len(uden) == 1 else flertal} {', '.join(uden)} står i Anlaeg, men ikke i fanen {ark}: "
                f"{'den' if len(uden) == 1 else 'de'} får modelscriptets værdier (fx slukket ved start).")
    return lag


def _samme_tal(a: str, b: str) -> bool:
    """To JSON-tal med samme værdi (regnearkets præcision) — kun skrivemåden er forskellig."""
    try:
        x, y = json.loads(a), json.loads(b)
    except ValueError:
        return False
    tal = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)   # noqa: E731
    return tal(x) and tal(y) and REV._p15(float(x)) == REV._p15(float(y))


def kommentar(hvor: str, scriptets: str | None) -> str:
    """Bladets kommentar (``VaerkParameter.kommentar``): hvor værdien kom fra — revisionssporets kilde."""
    ark, celle = hvor.split("!")
    return (f"Fra appens fane «{ark}» i værksarket (celle {celle}), ikke fra modelscriptet"
            + (f", som gav {_vis(scriptets)}." if scriptets is not None else "."))


def logtekst(lag: Lag) -> list[str]:
    """Lagets linjer til importens log: hvad der kom fra appens faner, og hvad der ikke blev brugt."""
    if not lag.antal and not lag.noter:
        return []
    ud = []
    if lag.antal:
        ret = sum(1 for a in lag.aendringer if a[1] == "ret")
        nye = sum(1 for a in lag.aendringer if a[1] == "opret")
        vaek = sum(1 for a in lag.aendringer if a[1] == "slet")
        ud.append("Appens egne faner (læses af appen, ikke af modelscriptet): "
                  + ", ".join(f"{a} {n} felter" for a, n in lag.antal.items())
                  + f". Lagt oven på modelscriptets læsning: {ret} ændret, {nye} tilføjet, {vaek} fjernet.")
    ud += lag.noter
    return ud


# ------------------------------------------------------------------ højlydt import (brief C)

class TavsRaekke(ValueError):
    """En række i arket ville blive sprunget over af modelscriptet uden besked. Beskeden er til brugeren."""


def _tom(v) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def tjek_tavse_raekker(sti: Path) -> None:
    """Afvis arket, hvis modelscriptet ville springe en udfyldt række over uden besked (runde 14, brief C).

    Målt: scripts/vaerksark_til_yaml.py:606 (``dropna(subset=["navn", "type"])``) springer en enhed med navn, men
    uden type, over; otte af et værks 17 enheder forsvandt sådan. Tanktabellen gør det samme for en tank uden
    volumen (:878) og læser kun seks rækker (:876); Varmepumpe læser kun til sin note eller 18 rækker (:513).
    Blokkene findes som scriptet finder dem (overskriften i kolonne A)."""
    try:
        ark = AL.laes_ark(sti, kun=("Anlaeg", "Varmepumpe"))
    except AL.LaeseFejl as e:
        # Codex fund 1: et ark, læseren afviser (en celle uden for regnearkets grænser, for mange celler, entiteter),
        # stoppes her, før modelscriptet kører — med læserens grund.
        raise TavsRaekke(f"Arket kan ikke læses: {e}. Intet er gemt.") from e
    fejl: list[str] = []
    an = ark.get("Anlaeg") or {}
    hr = AL.find_raekke(an, "navn")
    if hr is not None:
        slut = AL.find_raekke(an, "lovlige værdier", praefiks=True, efter=hr)
        sidste = (slut - 1) if slut else hr + 19
        for r in (x for x in AL.raekker(an) if hr < x <= sidste):
            navn, type_ = an.get((r, 1)), an.get((r, 2))
            andet = [k for k in range(3, 15) if not _tom(an.get((r, k)))]
            if not _tom(navn) and _tom(type_):
                fejl.append(f"Anlaeg række {r}: enheden {str(navn).strip()!r} har et navn, men ingen type (kolonne B). "
                            "Vælg typen, eller ryd rækken")
            elif _tom(navn) and not _tom(type_):
                fejl.append(f"Anlaeg række {r}: der står en type ({str(type_).strip()}), men intet navn (kolonne A). "
                            "Skriv enhedens navn, eller ryd rækken")
            elif _tom(navn) and _tom(type_) and andet:
                fejl.append(f"Anlaeg række {r}: der står tal i rækken ({AL.ref(r, andet[0])}), men hverken navn "
                            "eller type. Skriv navn og type, eller ryd rækken")
    th = AL.find_raekke(an, "tank")
    if th is not None:
        for r in range(th + 1, th + 7):
            navn, vol = an.get((r, 1)), an.get((r, 2))
            andet = [k for k in range(3, 6) if not _tom(an.get((r, k)))]
            if not _tom(navn) and _tom(vol):
                fejl.append(f"Anlaeg række {r}: tanken {str(navn).strip()!r} har et navn, men intet volumen "
                            "(kolonne B). Skriv volumen i m³, eller ryd rækken")
            elif _tom(navn) and not _tom(vol):
                fejl.append(f"Anlaeg række {r}: der står et volumen, men intet tanknavn (kolonne A). "
                            "Skriv tankens navn, eller ryd rækken")
            elif _tom(navn) and _tom(vol) and andet:
                fejl.append(f"Anlaeg række {r}: der står tal i tankrækken ({AL.ref(r, andet[0])}), men hverken "
                            "navn eller volumen. Udfyld begge, eller ryd rækken")
        r = th + 7
        while not _tom(an.get((r, 1))) and isinstance(an.get((r, 2)), (int, float)) and not isinstance(an.get((r, 2)), bool):
            fejl.append(f"Anlaeg række {r}: tanken {str(an[(r, 1)]).strip()!r} står under de seks tankrækker, som "
                        "modelscriptet læser. Flyt den op i en af de seks rækker under overskriften 'tank'")
            r += 1
    vp = ark.get("Varmepumpe") or {}
    vh = AL.find_raekke(vp, "navn")
    if vh is not None:
        note = AL.find_raekke(vp, "tjek cop", praefiks=True, efter=vh)
        foerste_uden = note + 1 if note else vh + 19
        for r in (x for x in AL.raekker(vp) if x >= foerste_uden):
            tal = [k for k in (2, 3, 4) if isinstance(vp.get((r, k)), (int, float)) and not isinstance(vp.get((r, k)), bool)]
            if not _tom(vp.get((r, 1))) and len(tal) >= 2:
                fejl.append(f"Varmepumpe række {r}: målepunktet for {str(vp[(r, 1)]).strip()!r} står under de rækker, "
                            "modelscriptet læser (over noten 'Tjek COP'). Flyt det op i tabellen")
    if fejl:
        vis = fejl[:MAKS_FEJL]
        rest = f" (og {len(fejl) - len(vis)} mere)" if len(fejl) > len(vis) else ""
        raise TavsRaekke("Arket har rækker, som modelscriptet ville springe over uden besked: " + "; ".join(vis) + rest
                         + ". Intet er gemt — ret arket, og upload det igen.")


def foerste_time_advarsel(blade: dict, har_lag: bool) -> str | None:
    """Advarsel, når ingen enhed kan levere varme i første time uden tank (runde 14, brief C).

    Målt: modelscriptet sætter ``initial_status: 0`` på hver enhed med unit commitment
    (scripts/vaerksark_til_yaml.py:855-856). Uden tank kunne kørslen "hvad er tanken værd" ikke løses; med
    ``units.el_kedel.initial_status: 1`` løste den. Advarslen gælder, når HVER aktiv enhed, der kan styres
    (solvarme er vejrbestemt), har unit commitment og står til slukket ved start. Med tank er værket gyldigt."""
    v = {s: json.loads(j) for s, j in blade.items() if s.startswith("units.")}
    navne = sorted({s.split(".")[1] for s in v if len(s.split(".")) > 2})
    styrbare = [n for n in navne if v.get(f"units.{n}.enabled") is not False
                and v.get(f"units.{n}.type") != "solar_thermal"]
    if not styrbare:
        return None
    # Modellens standard: uc_enabled = False, initial_status = 1 (src/config.py:519-520).
    slukket = [n for n in styrbare if v.get(f"units.{n}.uc_enabled") is True and v.get(f"units.{n}.initial_status", 1) == 0]
    if len(slukket) != len(styrbare):
        return None
    hvor = ("Sæt 'tændt ved start' til ja for mindst én enhed i fanen Start og drift, og upload arket igen"
            if har_lag else
            "Ret feltet i appen (Konfiguration › værket › enheden › Tændt ved periodens start), eller eksportér "
            "værket og sæt 'tændt ved start' til ja i fanen Start og drift")
    return (f"Værket kan ikke dække varmebehovet i den første time uden tank: alle enheder med start/stop-logik "
            f"({', '.join(slukket)}) står til slukket ved periodens start (units.<navn>.initial_status = 0, som "
            "modelscriptet altid skriver). Med tanken i drift leverer tanken den første time, men en kørsel uden "
            f"tank — fx 'hvad er tanken værd' — kan ikke løses. {hvor}.")
