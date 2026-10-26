#!/usr/bin/env python3
"""tjek_offentlig.py - repoets gate: intet organisationsspecifikt og intet manglende kredit maa kunne committes eller deles.

Repoet er KILDEN (se SYNKRONISERING.md). Normalt koeres gaten via scripts/tjek.py (`--repo`):

  python scripts/tjek.py                   hele repoet: det git kender mod generisk + lokal forbudsliste + vaerdierne i den lokale
                                           installation (config/installation.json), og kreditkravene
  python scripts/tjek.py --staged          kun det staged (indholdet af indekset) - pre-commit-hooken
  python tjek_offentlig.py --wheel FIL     et FAERDIGT wheel: forbudslisterne paa hvert medlem + licenstekster + CREDITS

De to oevrige tilstande er historiske (de blev brugt til den ene eksport fra det oprindelige arbejdsrepo) og kraever en privat
forbudsliste (`--forbud`):

  python tjek_offentlig.py                 ARBEJDSTRAE: anvend offentlig/regler.json og list det private
  python tjek_offentlig.py <mappe>         EKSPORT: scan HVER fil i mappen (ingen undtagelser)

De historiske tilstande koerer to ting:

  1. FORBUDSLISTEN (offentlig/forbud.privat.json): tenant-/workspace-/item-id'er, organisationsnavne, e-mails, interne
     stier, organisationstemaer (brief 22), og filnavne som deploy-tilstand. Id'er i deploy-tilstandsfilerne
     (regler.json: hoester_id_fra) tilfoejes automatisk ved hver koersel.
  2. KRAVLISTEN (offentlig/kredit.json): fuld kredit til den oprindelige case i begge udgaver. Fejler, hvis CREDITS.md,
     NOTICE, de ordrette licenstekster (SHA-256), README's foerste afsnit, appens kreditlinje (med layout-hooken
     data-layout="kreditlinje" i skallen), licenstekster i appens indhold, tredjepartslicenser, eller de pinnede commits
     er forkerte - eller en tekst antyder, at Dansk Fjernvarme, Billund Varme eller forfatteren staar bag appen.

Niveauer: "fejl" giver exitkode 1, "advarsel" ikke (ukendt e-mail, ikke-syntetisk GUID uden for listen, ...).
Exitkode 2 = brugsfejl (mangler forbudsliste: uden den er der intet at tjekke imod).

Kun standardbibliotek. Intet netvaerk. Uddata er rent ASCII-symboler (husets cp1252-faelde). Fund viser aldrig et helt
id: GUID'er forkortes, e-mails maskeres.
"""
import argparse
import bisect
import collections
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROD = Path(__file__).resolve().parent
OFFENTLIG = ROD / "offentlig"

Fund = collections.namedtuple("Fund", "niveau regel fil linje tekst")
Resultat = collections.namedtuple("Resultat", "funde privat offentlige")

GUID_RX = re.compile(r"(?<![0-9A-Fa-f])[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}(?![0-9A-Fa-f])")
# E-mails findes ved '@' og et begraenset vindue til hver side. Et ledende [A-Za-z0-9._%+-]+@ er KVADRATISK paa lange
# tegnraekker uden '@' (base64, minificeret JS) og lod den foerste koersel paa det rigtige produkt tage minutter.
AT_RX = re.compile("@")
LOKAL_HALE_RX = re.compile(r"[A-Za-z0-9._%+-]+$")
DOMAENE_HOVED_RX = re.compile(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
LOKAL_MAKS = 64
RUN4_RX = re.compile(r"([0-9a-f])\1{3}")
MAKS_BYTES = 64_000_000  # over graensen er en fil en FEJL (K6-F2), ikke en advarsel
KODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}


class BrugsFejl(Exception):
    """Forkert opsaetning (manglende liste, ugyldigt moenster). Bliver til exitkode 2."""


# ----------------------------------------------------------------------------------------------------------------------
# Hjaelpere
# ----------------------------------------------------------------------------------------------------------------------

def laes_json(sti):
    try:
        return json.loads(Path(sti).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise BrugsFejl(f"mangler {sti}")
    except ValueError as e:
        raise BrugsFejl(f"{sti} er ikke gyldig JSON: {e}")


def glob_regex(moenster, ignorer_versaler=False):
    """* = inden for en mappe, ** = paa tvaers, ? = et tegn. Alt andet - ogsaa [ og ] - er literalt (jf. husets [dev]-faelde)."""
    ud, i = [], 0
    while i < len(moenster):
        c = moenster[i]
        if moenster.startswith("**/", i):
            ud.append("(?:.*/)?")
            i += 3
        elif moenster.startswith("**", i):
            ud.append(".*")
            i += 2
        elif c == "*":
            ud.append("[^/]*")
            i += 1
        elif c == "?":
            ud.append("[^/]")
            i += 1
        else:
            ud.append(re.escape(c))
            i += 1
    return re.compile("^" + "".join(ud) + "$", re.I if ignorer_versaler else 0)


def glob_match(moenster, sti, ignorer_versaler=False):
    return glob_regex(moenster, ignorer_versaler).match(sti) is not None


def alle_filer(rod):
    """Alle filer under rod som sorterede /-stier (uden at springe noget over - bruges paa eksportmapper)."""
    rod = Path(rod)
    ud = []
    for d, dirs, filer in os.walk(rod):
        dirs[:] = [x for x in dirs if x != ".git"]  # repoets egen historik er hverken indhold eller en del af en eksport
        for f in filer:
            p = Path(d) / f
            if p.is_symlink():
                continue
            ud.append(p.relative_to(rod).as_posix())
    return sorted(ud)


def filsaet(rod, regler):
    """(offentlige, private) for et arbejdstrae. private = [(sti, grund)]; en udeladt mappe staar som 'mappe/'."""
    rod = Path(rod)
    mappenavne = {m["navn"]: m["grund"] for m in regler.get("udeladt_mapper", [])}
    moenstre = [(glob_regex(m["moenster"]), m["grund"]) for m in regler.get("udeladt_filer", [])]
    offentlige, private = [], []
    for d, dirs, filer in os.walk(rod):
        dirs.sort()
        rel_d = Path(d).relative_to(rod).as_posix()
        rel_d = "" if rel_d == "." else rel_d + "/"
        for navn in list(dirs):
            if navn in mappenavne:
                private.append((rel_d + navn + "/", mappenavne[navn]))
                dirs.remove(navn)
            elif navn == ".git":
                dirs.remove(navn)
        for f in sorted(filer):
            p = Path(d) / f
            if p.is_symlink():
                continue
            rel = rel_d + f
            grund = next((g for rx, g in moenstre if rx.match(rel)), None)
            if grund:
                private.append((rel, grund))
            else:
                offentlige.append(rel)
    if regler.get("respekter_gitignore") and (rod / ".git").exists():
        # K6-F1: eksporten er det git kender som kildekode (sporet + usporet, ikke ignoreret). Build, logs, deploy-tilstand
        # og lokale arbejdsfiler staar i .gitignore; at de ikke er listet i regler.json maa ikke goere dem offentlige.
        kendte = git_kendte(rod)
        for rel in [r for r in offentlige if r not in kendte]:
            private.append((rel, "ignoreret af git (.gitignore): ikke kildekode"))
        offentlige = [r for r in offentlige if r in kendte]
    return sorted(offentlige), sorted(private)


def git_kendte(rod):
    """Filer git kender: sporede + usporede, der ikke er ignoreret. Lokal git; intet netvaerk."""
    try:
        r = subprocess.run(["git", "-C", str(rod), "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
                           capture_output=True, timeout=120)
    except (OSError, subprocess.SubprocessError) as e:
        raise BrugsFejl(f"git kan ikke koeres ({e.__class__.__name__}) - uden git kan .gitignore ikke afgoere, hvad der er kildekode "
                        "(saet respekter_gitignore til false i regler.json, hvis det er med vilje)")
    if r.returncode != 0:
        raise BrugsFejl("git ls-files fejlede: " + r.stderr.decode("utf-8", "replace")[-300:])
    return {x.decode("utf-8", "replace") for x in r.stdout.split(b"\0") if x}


def anvend_erstat(rod, offentlige, regler):
    """Anvend 'erstat'-reglerne. Returnerer (destinationer, kilde, fund): kilde[dest] = den fil, indholdet laeses fra."""
    rod = Path(rod)
    maal = set(offentlige)
    kilde, fund = {}, []
    for r in regler.get("erstat", []):
        dest, med = r["fil"], r["med"]
        if (rod / med).is_file():
            maal.add(dest)
            kilde[dest] = med
        elif (rod / dest).is_file():
            fund.append(Fund("fejl", "erstatning-mangler", dest, 0,
                             f"{dest} skal erstattes af {med} i den offentlige udgave ({r.get('grund', '')}), men skabelonen findes ikke"))
    return sorted(maal), kilde, fund


def hoest_guids(rod, regler):
    """Alle GUID'er i deploy-tilstandsfilerne (regler.json: hoester_id_fra) - de er per definition tenant-specifikke."""
    ud = set()
    for rel in regler.get("hoester_id_fra", []):
        p = Path(rod) / rel
        if p.is_file():
            ud.update(g.lower() for g in GUID_RX.findall(p.read_bytes().decode("utf-8", "replace")))
    return ud


def emailved(t, i):
    """(start, slut) for en e-mail med '@' paa position i - eller None."""
    lokal = LOKAL_HALE_RX.search(t[max(0, i - LOKAL_MAKS):i])
    dom = DOMAENE_HOVED_RX.match(t, i + 1)
    if not lokal or not dom:
        return None
    return i - len(lokal.group(0)), dom.end()


def overlapper(spans, a, z):
    return any(s < z and a < e for s, e in spans)


def er_binaer(b):
    return b"\x00" in b[:8192]


def tekst_af(b):
    """Dekod filens tekst: UTF-8 (med/uden BOM) og UTF-16 (med BOM, eller uden hvis hver anden byte er NUL). None = ikke tekst.

    K6-F2: et NUL i de foerste bytes gjorde tidligere HELE filen "binaer" og sprang den over - en UTF-16-fil med et
    forbudt ord gav derfor intet fund."""
    if b.startswith((b"\xff\xfe", b"\xfe\xff")):
        return b.decode("utf-16", "replace")
    if b.startswith(b"\xef\xbb\xbf"):
        return b[3:].decode("utf-8", "replace")
    if not er_binaer(b):
        return b.decode("utf-8", "replace")
    proeve = b[:4096]
    lige, ulige = proeve[0::2], proeve[1::2]
    if lige and ulige:
        z_lige, z_ulige = lige.count(0) / len(lige), ulige.count(0) / len(ulige)
        if z_ulige >= 0.4 and z_lige < 0.1:
            return b.decode("utf-16-le", "replace")
        if z_lige >= 0.4 and z_ulige < 0.1:
            return b.decode("utf-16-be", "replace")
    return None


ARKIV_EXT = (".zip", ".xlsx", ".xlsm", ".docx", ".pptx", ".whl", ".jar")
MAKS_ARKIV_DYBDE = 2


def enheder(navn, b, binaere=(), dybde=0):
    """Yield (navn, tekst, fund) for en fil: et arkiv (zip, xlsx, whl ...) giver hvert medlem som 'arkiv::medlem'.

    tekst=None og fund=None: bevidst sprunget over (binaer type paa tilladelseslisten `binaere`).
    tekst=None og fund: kunne ikke scannes - det er en FEJL (K6-F2), ikke en advarsel."""
    if navn.lower().endswith(ARKIV_EXT):
        if dybde > MAKS_ARKIV_DYBDE:
            yield navn, None, Fund("fejl", "ikke-scannet", navn, 0, "arkiv i arkiv i arkiv - for dybt til at scanne")
            return
        try:
            z = zipfile.ZipFile(io.BytesIO(b))
            medlemmer = [i for i in z.infolist() if not i.is_dir()]
        except (zipfile.BadZipFile, OSError, ValueError) as e:
            yield navn, None, Fund("fejl", "ikke-scannet", navn, 0, f"arkivet kan ikke aabnes ({e.__class__.__name__}) - indholdet er ikke scannet")
            return
        samlet = 0
        for i in medlemmer:
            samlet += i.file_size
            if i.file_size > MAKS_BYTES or samlet > 2 * MAKS_BYTES:
                yield f"{navn}::{i.filename}", None, Fund("fejl", "for-stor", f"{navn}::{i.filename}", 0,
                                                          f"{i.file_size} bytes udpakket - over graensen, indholdet er ikke scannet")
                continue
            try:
                data = z.read(i)
            except Exception as e:  # noqa: BLE001 - beskadiget medlem, krypteret, ukendt komprimering
                yield f"{navn}::{i.filename}", None, Fund("fejl", "ikke-scannet", f"{navn}::{i.filename}", 0,
                                                          f"medlemmet kan ikke laeses ({e.__class__.__name__})")
                continue
            yield from enheder(f"{navn}::{i.filename}", data, binaere, dybde + 1)
        return
    if len(b) > MAKS_BYTES:
        yield navn, None, Fund("fejl", "for-stor", navn, 0, f"{len(b)} bytes er over graensen ({MAKS_BYTES}) - indholdet er ikke scannet")
        return
    t = tekst_af(b)
    if t is not None:
        yield navn, t, None
        return
    sidste = navn.split("::")[-1]
    if any(glob_match(g, sidste) for g in binaere):
        yield navn, None, None
        return
    yield navn, None, Fund("fejl", "ikke-scannet", navn, 0,
                           "indholdet er binaert og typen staar ikke paa tilladelseslisten (binaere_filer) - kan ikke scannes")


def er_syntetisk(guid):
    """Test-fixtures ('11111111-1111-...', 'aaaaaaaa-bbbb-...') har en gentaget cifferfoelge; et rigtigt id har det saa godt som aldrig."""
    return RUN4_RX.search(guid.lower().replace("-", "")) is not None


def forkort(token, regel):
    if GUID_RX.fullmatch(token):
        return token[:8] + "-..."
    if regel == "e-mail" and "@" in token:
        lokal, dom = token.split("@", 1)
        return lokal[:1] + "***@" + dom
    return token if len(token) <= 60 else token[:57] + "..."


def linje_af(offsets, pos):
    return bisect.bisect_right(offsets, pos - 1) + 1  # offsets = positioner af '\n'


# ----------------------------------------------------------------------------------------------------------------------
# Forbudslisten
# ----------------------------------------------------------------------------------------------------------------------

def oversaet_forbud(forbud):
    try:
        lit = [(re.compile(re.escape(x["vaerdi"]), re.I), x) for x in forbud.get("litteraler", [])]
        rx = [(re.compile(x["moenster"]), x) for x in forbud.get("regex", [])]
        navne = [(glob_regex(x["moenster"], True), x) for x in forbud.get("forbudte_filnavne", [])]
    except re.error as e:
        raise BrugsFejl(f"ugyldigt moenster i forbudslisten: {e}")
    guids = {x["vaerdi"].lower(): x for x in forbud.get("guids", [])}
    return lit, rx, navne, guids


def byg_omskriv(regler, forbud, hoestet=frozenset()):
    """Returnerer omskriv(sti, bytes) -> (bytes, taeller). Mekanisk og SYNLIG omskrivning af det, der ikke kan fjernes ved kilden.

    * regler["omskriv"]: generiske moenstre (fx kildeangivelser, der peger paa interne stier) paa navngivne filer.
    * regler["omskriv_filer"] + forbudslistens `erstat`: id'er, e-mails og navne i dokumentation og konfiguration.
    Kun UTF-8-tekst omskrives. Gaten scanner det OMSKREVNE og melder hver omskrevet fil som advarsel; eksporten skriver
    de omskrevne bytes og noterer dem i manifestet. Den private kilde roeres aldrig."""
    filer_rx = [glob_regex(g) for g in regler.get("omskriv_filer", [])]
    generiske = []
    for r in regler.get("omskriv", []):
        try:
            generiske.append(([glob_regex(g) for g in r["filer"]], re.compile(r["moenster"]), r["med"], r.get("navn", "kildeangivelse")))
        except re.error as e:
            raise BrugsFejl(f"ugyldigt omskriv-moenster: {e}")
    lit, rx, _navne, guids = oversaet_forbud(forbud)

    def omskriv(sti, b):
        tael = collections.Counter()
        med_forbud = any(r.match(sti) for r in filer_rx)
        aktive = [g for g in generiske if any(r.match(sti) for r in g[0])]
        if not med_forbud and not aktive:
            return b, tael
        try:
            t = b.decode("utf-8")
        except UnicodeDecodeError:
            return b, tael
        if er_binaer(b):
            return b, tael
        t0 = t
        for _f, mon, med, navn in aktive:
            t, n = mon.subn(lambda m, e=med: e, t)
            tael[navn] += n
        if med_forbud:
            for kilder in (rx, lit):
                for r, x in kilder:
                    if "erstat" in x:
                        t, n = r.subn(lambda m, e=x["erstat"]: e, t)
                        tael[x["regel"]] += n

            def guid(m):
                g = m.group(0).lower()
                x = guids.get(g)
                if x and "erstat" in x:
                    tael[x["regel"]] += 1
                    return x["erstat"]
                if g in hoestet:
                    tael["deploy-tilstand"] += 1
                    return "<id>"
                return m.group(0)
            t = GUID_RX.sub(guid, t)
        tael = collections.Counter({k: v for k, v in tael.items() if v})
        return (t.encode("utf-8") if t != t0 else b), tael
    return omskriv


def _scan_tekst(navn, t, ctx):
    """Scan een tekst (en fil eller et arkivmedlem). ctx: lit, rx, guids, tilladte, dom_ok, hoestet, undtagelser."""
    lit, rx, guids, tilladte, dom_ok, hoestet, undtagelser = ctx
    funde = []
    offs = [m.start() for m in re.finditer("\n", t)]
    hits, brugt = [], []  # (linje, orden, Fund)

    def tilfoej(m, regel, niveau, forklaring, orden):
        brugt.append((m.start(), m.end()))
        hits.append((linje_af(offs, m.start()), orden, Fund(niveau, regel, navn, linje_af(offs, m.start()),
                                                            f"{forkort(m.group(0), regel)} ({forklaring})")))
    # Moenstre foer litteraler: en e-mail paa et privat domaene meldes som e-mail (en person), ikke som "organisation".
    # Et tegnstykke meldes kun een gang - et fund, der overlapper et tidligere, er stoej.
    for orden, kilder in ((0, rx), (1, lit)):
        for k, (r, x) in enumerate(kilder):
            for m in r.finditer(t):
                if not overlapper(brugt, m.start(), m.end()):
                    tilfoej(m, x["regel"], x.get("niveau", "fejl"), x.get("forklaring", ""), (orden, k))
    for m in GUID_RX.finditer(t):
        if overlapper(brugt, m.start(), m.end()):
            continue
        g = m.group(0).lower()
        if g in guids:
            x = guids[g]
            tilfoej(m, x["regel"], x.get("niveau", "fejl"), x.get("forklaring", ""), (2, 0))
        elif g in hoestet:
            tilfoej(m, "deploy-tilstand", "fejl", "id fra deploy-tilstandsfilerne", (2, 1))
        elif not er_syntetisk(g):
            tilfoej(m, "ukendt-guid", "advarsel", "ikke-syntetisk id uden for forbudslisten - er det et rigtigt id?", (2, 2))
    for a in AT_RX.finditer(t):
        m = emailved(t, a.start())
        if m is None or overlapper(brugt, m[0], m[1]):
            continue
        adr = t[m[0]:m[1]]
        dom = adr.rsplit("@", 1)[1].lower()
        if adr.lower() in tilladte or any(dom == d or dom.endswith("." + d) for d in dom_ok) or dom.split(".")[0].isdigit():
            continue
        hits.append((linje_af(offs, m[0]), (3, 0), Fund("advarsel", "e-mail-ukendt", navn, linje_af(offs, m[0]),
                                                       f"{forkort(adr, 'e-mail')} (e-mail uden for den tilladte liste)")))
    # Undtagelser: KUN (fil-moenster, regel)-par fra den gennemgaaede liste i regler.json. Et markoer i selve indholdet kan aldrig
    # undertrykke noget (K6-F2: en JSON-vaerdi med markoeren undertrykte resten af linjen).
    til_stede = [u for u in undtagelser if glob_match(u["fil"], navn)]
    if til_stede:
        tilladt = {r for u in til_stede for r in u["regler"]}
        skjult = [h for h in hits if h[2].niveau == "fejl" and h[2].regel in tilladt]
        if skjult:
            hits = [h for h in hits if h not in skjult]
            tael = collections.Counter(h[2].regel for h in skjult)
            funde.append(Fund("advarsel", "undtaget", navn, skjult[0][0],
                              f"{len(skjult)} fund undtaget efter regler.json ({', '.join(f'{r} x{n}' for r, n in sorted(tael.items()))})"))
    return funde + [h[2] for h in sorted(hits, key=lambda h: (h[0], h[1]))]


def _ctx(forbud, hoestet, undtagelser):
    lit, rx, _navne, guids = oversaet_forbud(forbud)
    return (lit, rx, guids, {e.lower() for e in forbud.get("tilladte_emails", [])},
            [d.lower() for d in forbud.get("tilladte_email_domaener", [])], hoestet, list(undtagelser))


def scan_bytes(navn, b, forbud, hoestet=frozenset(), undtagelser=(), binaere=(), ctx=None):
    """Scan en fils (eller et arkivs) bytes. Filnavnsreglerne anvendes ogsaa paa arkivmedlemmer."""
    ctx = ctx or _ctx(forbud, hoestet, undtagelser)
    navne = oversaet_forbud(forbud)[2]
    funde = []
    for enhed, t, fund in enheder(navn, b, binaere):
        for n_rx, n in navne:
            if enhed != navn and n_rx.match(enhed):
                funde.append(Fund(n.get("niveau", "fejl"), n["regel"], enhed, 0, f"filnavnet matcher {n['moenster']}"))
        if fund is not None:
            funde.append(fund)
        if t is not None:
            funde.extend(_scan_tekst(enhed, t, ctx))
    return funde


def scan(rod, filer, forbud, hoestet=frozenset(), kilde=None, undtagelser=(), binaere=(), omskriv=None, laes_bytes=None):
    """Scan filerne for forbudte ting. `kilde` (dest -> sti) angiver, at indholdet skal laeses et andet sted fra.

    `omskriv` (se byg_omskriv): scanner det omskrevne indhold og melder omskrivningerne som advarsler."""
    rod = Path(rod)
    kilde = kilde or {}
    ctx = _ctx(forbud, hoestet, undtagelser)
    navne = oversaet_forbud(forbud)[2]
    funde = []
    for rel in filer:
        undt = [u for u in undtagelser if glob_match(u["fil"], rel)]  # en gennemgaaet (fil, regel)-undtagelse gaelder ogsaa filnavnsreglerne
        for n_rx, n in navne:
            if n_rx.match(rel):
                if any(n["regel"] in u["regler"] for u in undt):
                    funde.append(Fund("advarsel", "undtaget", rel, 0, f"filnavnet matcher {n['moenster']} (undtaget efter regler.json: {n['regel']})"))
                else:
                    funde.append(Fund(n.get("niveau", "fejl"), n["regel"], rel, 0, f"filnavnet matcher {n['moenster']}"))
        try:
            b = laes_bytes(rel) if laes_bytes else (rod / kilde.get(rel, rel)).read_bytes()
        except OSError as e:
            funde.append(Fund("fejl", "laesefejl", rel, 0, f"kan ikke laeses: {e}"))
            continue
        if omskriv is not None:
            b, tael = omskriv(rel, b)
            if tael:
                funde.append(Fund("advarsel", "omskrevet", rel, 0,
                                  f"{sum(tael.values())} omskrivning(er) i den offentlige udgave ({', '.join(f'{r} x{n}' for r, n in sorted(tael.items()))})"))
        funde.extend(scan_bytes(rel, b, forbud, hoestet, undtagelser, binaere, ctx))
    return funde


# ----------------------------------------------------------------------------------------------------------------------
# Kravlisten
# ----------------------------------------------------------------------------------------------------------------------

def _sha_lf(b):
    return hashlib.sha256(b.replace(b"\r\n", b"\n")).hexdigest()


def _er_test(rel):
    low = rel.lower()
    return ".spec." in low or ".test." in low or "/__tests__/" in low


BLOK_KOMMENTAR_RX = re.compile(r"/\*.*?\*/", re.S)
LINJE_KOMMENTAR_RX = re.compile(r"(?<![:\"'`\\])//[^\n]*")
IMPORT_RX = re.compile(r"\b(?P<k>import|export)\s+(?P<spec>(?:type\s+)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*\s*as\s+[\w$]+|\*|[\w$]+))"
                       r"\s*from\s*['\"](?P<sti>[^'\"]+)['\"]")
LAZY_RX = re.compile(r"\bimport\(\s*['\"](?P<sti>[^'\"]+)['\"]\s*\)")


def uden_kommentarer(t):
    """Fjern kommentarer, saa et udkommenteret <Sidefod /> ikke tael som en montering."""
    return LINJE_KOMMENTAR_RX.sub("", BLOK_KOMMENTAR_RX.sub("", t))


def lokale_navne(spec):
    spec = re.sub(r"^type\s+", "", spec.strip())
    navne = []
    m = re.search(r"\{(.*?)\}", spec, re.S)
    if m:
        for d in m.group(1).split(","):
            d = re.sub(r"^\s*type\s+", "", d.strip())
            if d:
                navne.append(d.split(" as ")[-1].strip())
        spec = spec.replace(m.group(0), "")
    m = re.search(r"\*\s*as\s+([\w$]+)", spec)
    if m:
        navne.append(m.group(1))
    else:
        navne += [d.strip() for d in spec.split(",") if re.fullmatch(r"[A-Za-z_$][\w$]*", d.strip())]
    return navne


def _baser(sti, fra, alias):
    """Kandidatbaser for en importsti, eller None for en pakke. Et alias kan pege paa FLERE mapper (backend-vaelgeren
    `@/backend/x` -> src/backend/rayfin/x og src/backend/rest/x): alle skal have modulet."""
    import posixpath
    for pre, maal in alias.items():
        if sti.startswith(pre):
            return [m + sti[len(pre):] for m in ([maal] if isinstance(maal, str) else maal)]
    if sti.startswith("."):
        return [posixpath.normpath(posixpath.join(posixpath.dirname(fra), sti))]
    return None


def _find(base, filer):
    for ext in ("", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"):
        if base + ext in filer:
            return base + ext
    if base.endswith((".js", ".jsx", ".mjs")):  # TS-ESM: `./x.js` peger paa x.ts
        stamme = base.rsplit(".", 1)[0]
        for ext in (".ts", ".tsx", ".mts"):
            if stamme + ext in filer:
                return stamme + ext
    return None


def loes_alle(sti, fra, filer, alias):
    """Liste over de filer, en importsti peger paa (None-pladser for dem, der ikke findes); None for en pakke."""
    baser = _baser(sti, fra, alias)
    return None if baser is None else [_find(b, filer) for b in baser]


def loes_import(sti, fra, filer, alias):
    """Foerste fil, importstien peger paa (til importgrafen), eller None."""
    return next((r for r in (loes_alle(sti, fra, filer, alias) or []) if r), None)


SIDE_IMPORT_RX = re.compile(r"""\bimport\s*['"](?P<sti>[^'"]+)['"]""")
BRUDT_EXT = {".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"}


def brudte_importer(filer, laes, alias, rod_app="app/"):
    """[(fil, sti)]: kodefiler under app/, der importerer en relativ/alias-sti, som ikke findes i filsaettet.

    Fundet ved at BYGGE fra den rene eksport: 4 specs importerede en udeladt (privat) fixture, saa `tsc -b` fejlede. Et filsaet
    skal vaere lukket under import; ellers er eksporten ikke en installation, men en samling brudte filer."""
    filer = set(filer)
    ud = []
    for f in sorted(filer):
        if not f.startswith(rod_app) or Path(f).suffix not in BRUDT_EXT:
            continue
        tekst = laes(f)
        if tekst is None:
            continue
        kode = uden_kommentarer(tekst)
        stier = [m.group("sti") for m in IMPORT_RX.finditer(kode)] + [m.group("sti") for m in LAZY_RX.finditer(kode)] \
            + [m.group("sti") for m in SIDE_IMPORT_RX.finditer(kode)]
        for sti in dict.fromkeys(stier):
            ren = sti.split("?")[0].split("#")[0]
            alle = loes_alle(ren, f, filer, alias)
            if alle is None:
                continue  # en pakke (react, vitest ...)
            if any(r is None for r in alle):
                ud.append((f, sti))
    return ud


def importgraf(kodefiler, indhold, filer, alias):
    """fil -> maengden af filer, den BRUGER: en import taeller kun, hvis et importeret navn staar i koden uden for importen
    (en `export ... from` taeller altid). K6-F3: en ubrugt import og en ubrugt komponentfil beviser ingen montering."""
    graf = {}
    for f in kodefiler:
        kode = uden_kommentarer(indhold[f])
        brugt_tekst = IMPORT_RX.sub("", kode)
        kanter = set()
        for m in IMPORT_RX.finditer(kode):
            maal = [r for r in (loes_alle(m.group("sti"), f, filer, alias) or []) if r]
            if not maal:
                continue
            if m.group("k") == "export":
                kanter.update(maal)
            elif any(re.search(r"(?<![\w$])" + re.escape(n) + r"(?![\w$])", brugt_tekst) for n in lokale_navne(m.group("spec"))):
                kanter.update(maal)
        for m in LAZY_RX.finditer(kode):
            kanter.update(r for r in (loes_alle(m.group("sti"), f, filer, alias) or []) if r)
        graf[f] = kanter
    return graf


def naaelige(graf, start):
    set_, kø = {start}, [start]
    while kø:
        for n in graf.get(kø.pop(), ()):
            if n not in set_:
                set_.add(n)
                kø.append(n)
    return set_


def sidefod_monteret(kodefiler, indhold, filer, kl, hookfiler):
    """Fejltekster, hvis den synlige sidefod ikke er MONTERET i skallen (entry) eller ikke bruger kreditkomponenten."""
    entry = kl.get("skal_entry", "app/src/App.tsx")
    if entry not in indhold:
        return [f"skallen {entry} findes ikke - sidefoden kan ikke vaere monteret"]
    graf = importgraf(kodefiler, indhold, filer, kl.get("alias", {"@/": "app/src/"}))
    fra_skal = naaelige(graf, entry)
    monteret = [h for h in hookfiler if h in fra_skal]
    if not monteret:
        return [f"sidefoden ({', '.join(hookfiler)}) er ikke monteret: {entry} bruger den ikke (en ubrugt import, udkommenteret kald eller en komponentfil uden for skallen "
                f"er ikke en montering)"]
    kredit_filer = {f for f in kodefiler if all(s in indhold[f] for s in kl["skal_indeholde"])}
    if not any(naaelige(graf, h) & kredit_filer for h in monteret):
        return [f"den monterede sidefod ({', '.join(monteret)}) bruger ikke kreditlinjen (kredit.ts) - hookens element er monteret, men tomt"]
    return []


def tjek_krav(rod, filer, kredit, kilde=None):
    """Kravlisten. `filer` er maengden af (destinations)stier, der ville vaere offentlige; `kilde` som i scan()."""
    rod = Path(rod)
    filer = set(filer)
    kilde = kilde or {}
    funde = []

    def fejl(regel, fil, tekst):
        funde.append(Fund("fejl", regel, fil, 0, tekst))

    def laes(rel):
        try:
            return (rod / kilde.get(rel, rel)).read_bytes().decode("utf-8", "replace")
        except OSError:
            return None

    def findes(rel):
        return rel in filer and laes(rel) is not None

    # --- pinnede commits ------------------------------------------------------------------------------------------
    pins = {}
    for nogle in ("model", "data"):
        pin = kredit[nogle]["pin"]
        t = laes(pin["fil"]) if pin["fil"] in filer else None
        m = re.search(r"^\s*" + re.escape(pin["navn"]) + r"\s*=\s*[\"']([0-9a-f]{40})[\"']", t or "", re.M)
        if not m:
            fejl("krav-pin", pin["fil"], f"kan ikke laese {pin['navn']} (40 hex-tegn) i {pin['fil']}; kreditten kan ikke holdes op mod en pinnet commit")
        else:
            pins[nogle] = (pin["navn"], m.group(1))

    # --- CREDITS.md ------------------------------------------------------------------------------------------------
    if not findes("CREDITS.md"):
        fejl("krav-credits", "CREDITS.md", "CREDITS.md mangler (fuld kredit til den oprindelige case, i begge udgaver)")
    else:
        t = re.sub(r"\s+", " ", laes("CREDITS.md").replace("*", ""))  # linjeombrydning/fed skrift maa ikke bryde et udtryk
        for s in kredit["credits_skal_indeholde"]:
            if s not in t:
                fejl("krav-credits", "CREDITS.md", f"CREDITS.md mangler: {s}")
        for navn, sha in pins.values():
            if sha not in t:
                fejl("krav-pin", "CREDITS.md", f"CREDITS.md nævner ikke den pinnede {navn} ({sha[:7]}...) fra {kredit['model']['pin']['fil']}")

    # --- NOTICE ----------------------------------------------------------------------------------------------------
    if not findes("NOTICE"):
        fejl("krav-notice", "NOTICE", "NOTICE mangler")
    elif "CREDITS.md" not in laes("NOTICE"):
        fejl("krav-notice", "NOTICE", "NOTICE peger ikke paa CREDITS.md")

    # --- ordrette licenstekster ------------------------------------------------------------------------------------
    for nogle in ("model", "data"):
        k = kredit[nogle]
        rel = k["licensfil"]
        if rel not in filer:
            fejl("krav-licenstekst", rel, f"{rel} mangler (kildens licenstekst skal gengives ordret)")
            continue
        b = (rod / kilde.get(rel, rel)).read_bytes()
        if _sha_lf(b) != k["licens_sha256_lf"]:
            fejl("krav-licenstekst", rel, f"{rel} er ikke kildens ordrette licenstekst (SHA-256 efter linjeskiftsnormalisering afviger)")
        elif k["ophavsret"].encode("utf-8") not in b:
            fejl("krav-licenstekst", rel, f"{rel} mangler ophavsretslinjen: {k['ophavsret']}")

    # --- appens egen licens ------------------------------------------------------------------------------------------
    if not findes("LICENSE"):
        fejl("krav-licens", "LICENSE", "LICENSE mangler")
    else:
        t = laes("LICENSE")
        if "[RETTIGHEDSHAVER" in t:
            fejl("krav-licens", "LICENSE", "LICENSE har stadig pladsholderen for rettighedshaveren (aabent produktejervalg)")
        if "Copyright (c)" not in t:
            fejl("krav-licens", "LICENSE", "LICENSE har ingen ophavsretslinje")

    # --- README -----------------------------------------------------------------------------------------------------
    if not findes("README.md"):
        fejl("krav-readme", "README.md", "README.md mangler (ved eksport erstattes den af README.public.md)")
    else:
        top = "\n".join(laes("README.md").splitlines()[: kredit["readme_foerste_afsnit_linjer"]])
        for s in kredit["readme_foerste_afsnit_skal_naevne"]:
            if s not in top:
                fejl("krav-readme", "README.md", f"README's foerste afsnit (de foerste {kredit['readme_foerste_afsnit_linjer']} linjer) skal pege paa den oprindelige case: {s}")

    # --- appens kreditlinje, hook og licenstekster ------------------------------------------------------------------------
    kl = kredit["kreditlinje"]
    rod_app = kl["app_kilde_rod"].rstrip("/") + "/"
    app_filer = sorted(f for f in filer if f.startswith(rod_app) and not _er_test(f))
    kodefiler = [f for f in app_filer if Path(f).suffix in KODE_EXT]
    if not app_filer:
        fejl("krav-kreditlinje", kl["app_kilde_rod"], f"appen ({kl['app_kilde_rod']}) findes ikke i det offentlige saet - ingen kreditlinje")
    else:
        indhold = {f: (laes(f) or "") for f in app_filer}
        if not any(all(s in indhold[f] for s in kl["skal_indeholde"]) for f in kodefiler):
            fejl("krav-kreditlinje", kl["app_kilde_rod"], "kreditlinjen findes ikke i appens kode (skal indeholde: " + "; ".join(kl["skal_indeholde"]) + ")")
        skal = [f for f in kodefiler if any(f == s or f.startswith(s.rstrip("/") + "/") for s in kl["skal_findes_i_skal"])]
        hookfiler = [f for f in skal if kl["layout_hook"] in indhold[f]]
        if not hookfiler:
            fejl("krav-kreditlinje", ", ".join(kl["skal_findes_i_skal"]), f"sidefoden i appens skal ({' / '.join(kl['skal_findes_i_skal'])}) har ikke elementet {kl['layout_hook']} - kreditlinjen skal staa paa ALLE sider")
        else:
            for tekst in sidefod_monteret(kodefiler, indhold, set(filer), kl, hookfiler):
                fejl("krav-kreditlinje", kl.get("skal_entry", "app/src/App.tsx"), tekst)
        for s in kredit.get("app_licenstekst_skal_findes", []):
            if not any(s in t for t in indhold.values()):
                fejl("krav-app-licens", kl["app_kilde_rod"], f"appens indhold bundter ikke licenstekst/vilkaar med '{s}'")

    for f, sti in brudte_importer(filer, laes, kredit["kreditlinje"].get("alias", {"@/": "app/src/"})):
        fejl("krav-import", f, f"importerer {sti}, som ikke er med i det offentlige saet (udeladt som privat, eller findes ikke) - en build fra eksporten fejler")
        funde[-1] = funde[-1]._replace(fil=f)

    # --- tredjepart ---------------------------------------------------------------------------------------------------------
    for tp in kredit.get("tredjepart", []):
        if not findes(tp["fil"]):
            fejl("krav-tredjepart", tp["fil"], f"{tp['fil']} mangler ({tp['navn']} - licensen skal bevares)")
        else:
            t = laes(tp["fil"])
            for s in tp["skal_indeholde"]:
                if s not in t:
                    fejl("krav-tredjepart", tp["fil"], f"{tp['fil']} mangler '{s}' ({tp['navn']})")

    # --- appens og vidensfilernes pins skal vaere lig konstanter.py ---------------------------------------------------------
    def tjek_pin(rel, nogle, forventet, tekst):
        if tekst is not None and forventet and forventet != tekst:
            fejl("krav-pin", rel, f"{rel}: {nogle} er {tekst[:7]}..., men {kredit['model']['pin']['fil']} pinner {forventet[:7]}...")
    kilde_ts = "app/src/sider/dokumentation/kilde.ts"
    if kilde_ts in filer and laes(kilde_ts) is not None:
        t = laes(kilde_ts)
        for blok, nogle in (("MODELREPO", "model"), ("DATAREPO", "data")):
            m = re.search(blok + r"\s*=\s*\{[^}]*?commit:\s*[\"']([0-9a-f]{40})[\"']", t, re.S)
            if m and nogle in pins:
                tjek_pin(kilde_ts, blok + ".commit", pins[nogle][1], m.group(1))
    dc = "app/src/sider/dokumentation/indhold/kreditter/df-data_commit.txt"
    if dc in filer and laes(dc) is not None and "data" in pins:
        tjek_pin(dc, "df-data-commit", pins["data"][1], laes(dc).strip())
    di = "viden/dokumentation_indeks.json"
    if di in filer and laes(di) is not None and "model" in pins:
        m = re.search(r"\"model_commit\"\s*:\s*\"([0-9a-f]{40})\"", laes(di))
        if m:
            tjek_pin(di, "model_commit", pins["model"][1], m.group(1))

    # --- ingen antydning af godkendelse -----------------------------------------------------------------------------------
    moenstre = [re.compile(p) for p in kredit.get("ikke_antydning", [])]
    undtag = [u.lower() for u in kredit.get("ikke_antydning_undtagelser", [])]
    udelad = [glob_regex(g) for g in kredit.get("ikke_antydning_udelad", [])]
    for rel in sorted(filer):
        if any(u.match(rel) for u in udelad):
            continue
        p = rod / kilde.get(rel, rel)
        try:
            b = p.read_bytes()
        except OSError:
            continue
        if er_binaer(b) or len(b) > MAKS_BYTES:
            continue
        for i, linje in enumerate(b.decode("utf-8", "replace").splitlines(), 1):
            if any(u in linje.lower() for u in undtag):
                continue
            for rx in moenstre:
                m = rx.search(linje)
                if m:
                    funde.append(Fund("fejl", "krav-antydning", rel, i, f"antyder godkendelse/tilslutning: '{m.group(0)}'"))
    return funde


# ----------------------------------------------------------------------------------------------------------------------
# Samlet koersel
# ----------------------------------------------------------------------------------------------------------------------

def koer(rod, mappe, regler, forbud, kredit):
    """rod = produktmappen (kilden til deploy-id'er). mappe=None: arbejdstrae med regler; ellers scannes mappen som den er."""
    rod = Path(rod)
    hoestet = frozenset(hoest_guids(rod, regler))
    if mappe is None:
        offentlige, privat = filsaet(rod, regler)
        offentlige, kilde, f0 = anvend_erstat(rod, offentlige, regler)
        basis = rod
    else:
        basis = Path(mappe)
        offentlige, privat, kilde, f0 = alle_filer(basis), [], {}, []
    funde = list(f0)
    omskriv = byg_omskriv(regler, forbud, hoestet) if mappe is None else None  # en eksportmappe er allerede omskrevet
    funde += scan(basis, offentlige, forbud, hoestet, kilde, regler.get("undtagelser", []), regler.get("binaere_filer", []), omskriv)
    funde += tjek_krav(basis, offentlige, kredit, kilde)
    return Resultat(funde, privat, offentlige)


def tjek_wheel(sti, regler, kredit, forbud, rod):
    """Scan det FAERDIGE wheel (K6-F1: ogsaa distributionsartefaktet, ikke kun kildeeksporten) og kontroller kreditten i det."""
    sti = Path(sti)
    try:
        b = sti.read_bytes()
    except OSError as e:
        raise BrugsFejl(f"kan ikke laese {sti}: {e}")
    hoestet = frozenset(hoest_guids(rod, regler))
    funde = scan_bytes(sti.name, b, forbud, hoestet, regler.get("undtagelser", []), regler.get("binaere_filer", []))

    def fejl(tekst):
        funde.append(Fund("fejl", "krav-wheel", sti.name, 0, tekst))
    try:
        z = zipfile.ZipFile(io.BytesIO(b))
    except zipfile.BadZipFile:
        fejl("filen er ikke et wheel (zip)")
        return Resultat(funde, [], [])
    medlemmer = [i.filename for i in z.infolist() if not i.is_dir()]

    def find(basis):
        return [n for n in medlemmer if n.split("/")[-1] == basis]
    for nogle in ("model", "data"):
        k = kredit[nogle]
        basis = Path(k["licensfil"]).name
        h = find(basis)
        if not h:
            fejl(f"wheel mangler {basis} (kildens licenstekst skal med i distributionen)")
        elif _sha_lf(z.read(h[0])) != k["licens_sha256_lf"]:
            fejl(f"{h[0]} er ikke kildens ordrette licenstekst (SHA-256 efter linjeskiftsnormalisering afviger)")
    c = find("CREDITS.md")
    if not c:
        fejl("wheel mangler CREDITS.md")
    else:
        norm = re.sub(r"\s+", " ", z.read(c[0]).decode("utf-8", "replace").replace("*", ""))
        for s in kredit["credits_skal_indeholde"]:
            if s not in norm:
                fejl(f"CREDITS.md i wheel mangler: {s}")
    return Resultat(funde, [], medlemmer)


INSTALLATION_MIN_LAENGDE = 6


def _blade(d, sti=()):
    if isinstance(d, dict):
        for k, v in d.items():
            if not str(k).startswith("_"):
                yield from _blade(v, sti + (k,))
    elif isinstance(d, list):
        for i, v in enumerate(d):
            yield from _blade(v, sti + (i,))
    elif isinstance(d, str):
        yield sti, d


def installation_vaerdier(rod):
    """Strengene i den lokale installation (config/installation.json og config/installation.*.json) - de er per definition
    organisationsspecifikke og maa ikke staa i noget, der committes. Pladsholdere (`<...>`), meget korte vaerdier og vaerdier, der er
    ens med den samme noegle i den committede eksempelfil (offentlige standarder, fx lakehousets navn), tages ikke med."""
    rod = Path(rod)
    cfg = rod / "config"
    eks = {}
    ek = cfg / "installation.eksempel.json"
    if ek.is_file():
        try:
            eks = dict(_blade(json.loads(ek.read_text(encoding="utf-8"))))
        except ValueError as e:
            raise BrugsFejl(f"{ek} er ikke gyldig JSON: {e}")
    filer = []
    miljoe = os.environ.get("FJV_INSTALLATION")
    if miljoe and Path(miljoe).is_file():
        filer.append(Path(miljoe))
    if cfg.is_dir():
        filer += sorted(p for p in cfg.glob("installation*.json") if p.name != "installation.eksempel.json")
    ud = set()
    for f in filer:
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except ValueError as e:
            raise BrugsFejl(f"{f} er ikke gyldig JSON ({e}) - gaten kan ikke kende installationens vaerdier")
        for sti, v in _blade(d):
            v = v.strip()
            if len(v) < INSTALLATION_MIN_LAENGDE or v.startswith("<") or eks.get(sti) == v:
                continue
            ud.add(v)
    return ud


def repo_forbud(rod):
    """Forbudslisten for repoet: den generiske + den lokale + installationens vaerdier."""
    rod = Path(rod)
    g = laes_json(rod / "offentlig" / "forbud.generisk.json")
    lokal = rod / "config" / "forbud.lokal.json"
    if lokal.is_file():
        l = laes_json(lokal)
        for nogle in ("litteraler", "regex", "guids", "forbudte_filnavne", "tilladte_emails", "tilladte_email_domaener"):
            g[nogle] = list(g.get(nogle, [])) + list(l.get(nogle, []))
    g["litteraler"] = list(g.get("litteraler", [])) + [
        {"vaerdi": v, "regel": "installation", "forklaring": "vaerdi fra den lokale installation (config/installation.json)"}
        for v in sorted(installation_vaerdier(rod))]
    return g


def skip_worktree(rod):
    """Sporede filer med git `skip-worktree` (installationens lokale paafoersel i konfig.ts/rayfin.yml): deres arbejdsmappe-indhold er
    lokalt og kan ikke committes; det, der KAN committes, er indekset. Den fulde gate vurderer derfor indekset for dem."""
    r = subprocess.run(["git", "-C", str(rod), "ls-files", "-v", "-z"], capture_output=True, timeout=120)
    if r.returncode != 0:
        return set()
    return {x[2:].decode("utf-8", "replace") for x in r.stdout.split(b"\0") if x[:2] == b"S "}


def staged_filer(rod):
    r = subprocess.run(["git", "-C", str(rod), "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], capture_output=True, timeout=120)
    if r.returncode != 0:
        raise BrugsFejl("git diff --cached fejlede: " + r.stderr.decode("utf-8", "replace")[-300:])
    return sorted(x.decode("utf-8", "replace") for x in r.stdout.split(b"\0") if x)


def koer_repo(rod, regler, kredit, staged=False):
    """Gaten for repoet selv (kilden): det git kender (eller de staged filers INDHOLD i indekset) mod forbudslisterne; med kreditkravene,
    undtagen ved `staged` (det hurtige pre-commit-tjek)."""
    rod = Path(rod)
    forbud = repo_forbud(rod)
    hoestet = frozenset(hoest_guids(rod, regler))
    LISTEN = "offentlig/forbud.generisk.json"  # reglerne selv indeholder det forbudte; de er gennemgaaet, ikke scannet
    undt, binaere = regler.get("undtagelser", []), regler.get("binaere_filer", [])
    if staged:
        if not (rod / ".git").exists():
            raise BrugsFejl(f"{rod} er ikke et git-repo - --staged kraever git")
        filer = [f for f in staged_filer(rod) if f != LISTEN]

        def laes(rel):
            r = subprocess.run(["git", "-C", str(rod), "show", ":" + rel], capture_output=True, timeout=120)
            if r.returncode != 0:
                raise OSError(r.stderr.decode("utf-8", "replace")[-200:])
            return r.stdout
        return Resultat(scan(rod, filer, forbud, hoestet, None, undt, binaere, None, laes), [], filer)
    if (rod / ".git").exists():
        filer = sorted(f for f in git_kendte(rod) if (rod / f).is_file())
    else:
        filer, _ = filsaet(rod, {"udeladt_mapper": regler.get("udeladt_mapper", [])})
    filer = [f for f in filer if f != LISTEN]
    laes = None
    sw = skip_worktree(rod) if (rod / ".git").exists() else set()
    if sw:
        def laes(rel):
            if rel in sw:
                r = subprocess.run(["git", "-C", str(rod), "show", ":" + rel], capture_output=True, timeout=120)
                if r.returncode != 0:
                    raise OSError(r.stderr.decode("utf-8", "replace")[-200:])
                return r.stdout
            return (rod / rel).read_bytes()
    funde = scan(rod, filer, forbud, hoestet, None, undt, binaere, None, laes)
    funde += tjek_krav(rod, filer, kredit)
    return Resultat(funde, [], filer)


def _indlaes(args, rod):
    regler = laes_json(args.regler or (rod / "offentlig" / "regler.json"))
    kredit = laes_json(args.kredit or (rod / "offentlig" / "kredit.json"))
    fp = Path(args.forbud) if args.forbud else rod / "offentlig" / "forbud.privat.json"
    if args.kun_krav:
        return regler, kredit, {}
    if not fp.is_file():
        raise BrugsFejl(f"forbudslisten {fp} findes ikke - uden den er der intet at tjekke imod. Giv en med --forbud <fil>.")
    return regler, kredit, laes_json(fp)


def _skriv(res, mappe, vis_privat, maks, stille, kun_krav=False, etiket=None, kun_fejl=False):
    ud = print
    fejl = [f for f in res.funde if f.niveau == "fejl"]
    adv = [f for f in res.funde if f.niveau == "advarsel"]
    if not stille:
        ud(f"{etiket or ('EKSPORTMAPPE' if mappe else 'ARBEJDSTRAE')}: {len(res.offentlige)} {'filer' if not etiket else 'medlemmer'} {'tjekket' if kun_krav else 'scannet'}"
           + (f", {len(res.privat)} private poster udeladt" if not mappe and not etiket else ""))
        if not mappe and not kun_krav and not etiket:
            grupper = collections.Counter(g for _, g in res.privat)
            ud("\nPRIVAT (udeladt fra den offentlige udgave):")
            for g, n in grupper.most_common():
                ud(f"  {n:5d}  {g}")
            if vis_privat:
                for p, g in res.privat:
                    ud(f"         {p}   [{g}]")
        for navn, liste in (("FEJL", fejl), ("ADVARSLER", [] if kun_fejl else adv)):
            if not liste:
                continue
            ud(f"\n{navn}: {len(liste)}")
            pr_regel = collections.Counter(f.regel for f in liste)
            for r, n in pr_regel.most_common():
                ud(f"  {n:5d}  {r}")
            for f in liste[:maks]:
                ud(f"  [{f.regel}] {f.fil}{(':' + str(f.linje)) if f.linje else ''}  {f.tekst}")
            if len(liste) > maks:
                ud(f"  ... og {len(liste) - maks} flere (brug --maks eller --json)")
    ud(f"\nRESULTAT: {'FEJL' if fejl else 'OK'} - {len(fejl)} fejl, {len(adv)} advarsler")
    return 1 if fejl else 0


def main(argv=None):
    try:
        sys.stdout.reconfigure(errors="replace")
        sys.stderr.reconfigure(errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="Tjek, om en mappe er sikker at offentliggoere, og at kreditten er intakt.")
    ap.add_argument("mappe", nargs="?", help="eksportmappe; udeladt = arbejdstrae (regler.json anvendes)")
    ap.add_argument("--rod", help="produktmappen (kilde til deploy-id'er); standard: mappen med dette script")
    ap.add_argument("--forbud", help="forbudsliste; standard offentlig/forbud.privat.json")
    ap.add_argument("--regler", help="standard offentlig/regler.json")
    ap.add_argument("--kredit", help="standard offentlig/kredit.json")
    ap.add_argument("--vis-privat", action="store_true", help="list hver privat fil")
    ap.add_argument("--maks", type=int, default=200, help="hoejst N fund pr. niveau i uddata (standard 200)")
    ap.add_argument("--json", help="skriv alle fund (forkortede) til denne fil")
    ap.add_argument("--stille", action="store_true", help="kun resultatlinjen")
    ap.add_argument("--repo", action="store_true", help="repoets gate: det git kender mod generisk + lokal forbudsliste + installationens vaerdier, og kreditkravene")
    ap.add_argument("--staged", action="store_true", help="med --repo: kun det staged (indekset) - det hurtige pre-commit-tjek")
    ap.add_argument("--wheel", help="scan et FAERDIGT wheel (zip) i stedet for en mappe: forbudslisten paa alle medlemmer + kreditten i det")
    ap.add_argument("--kun-krav", action="store_true",
                    help="kun kravlisten (kredit), paa HELE traeet uden at udelade private filer - til Fabric-udgaven (kredit i begge udgaver)")
    args = ap.parse_args(argv)
    rod = Path(args.rod).resolve() if args.rod else ROD
    if args.repo:
        try:
            regler = laes_json(args.regler or (rod / "offentlig" / "regler.json"))
            kredit = laes_json(args.kredit or (rod / "offentlig" / "kredit.json"))
            res = koer_repo(rod, regler, kredit, staged=args.staged)
        except BrugsFejl as e:
            print(f"FEJL: {e}", file=sys.stderr)
            return 2
        if args.json:
            Path(args.json).write_text(json.dumps({"funde": [f._asdict() for f in res.funde]}, ensure_ascii=True, indent=1), encoding="utf-8")
        return _skriv(res, None, False, args.maks, args.stille, etiket="REPO (staged)" if args.staged else "REPO", kun_fejl=args.staged)
    if args.wheel is not None and not args.forbud:
        # Et bygget wheel scannes mod repoets egne lister (generisk + lokal + installationens vaerdier), ikke en privat liste.
        try:
            regler = laes_json(args.regler or (rod / "offentlig" / "regler.json"))
            kredit = laes_json(args.kredit or (rod / "offentlig" / "kredit.json"))
            res = tjek_wheel(args.wheel, regler, kredit, repo_forbud(rod), rod)
        except BrugsFejl as e:
            print(f"FEJL: {e}", file=sys.stderr)
            return 2
        if args.json:
            Path(args.json).write_text(json.dumps({"funde": [f._asdict() for f in res.funde]}, ensure_ascii=True, indent=1), encoding="utf-8")
        return _skriv(res, None, False, args.maks, args.stille, etiket="WHEEL " + Path(args.wheel).name)
    try:
        regler, kredit, forbud = _indlaes(args, rod)
        mappe = Path(args.mappe).resolve() if args.mappe else None
        if mappe is not None and not mappe.is_dir():
            raise BrugsFejl(f"{mappe} er ikke en mappe")
        if args.wheel is not None:  # "" er ogsaa et valg af --wheel: en tom sti maa ikke tavst blive til arbejdstrae-tilstand
            res = tjek_wheel(args.wheel, regler, kredit, forbud, rod)
            if args.json:
                Path(args.json).write_text(json.dumps({"funde": [f._asdict() for f in res.funde]}, ensure_ascii=True, indent=1), encoding="utf-8")
            return _skriv(res, None, False, args.maks, args.stille, etiket="WHEEL " + Path(args.wheel).name)
        if args.kun_krav:
            basis = mappe or rod
            filer, _privat = filsaet(basis, {"udeladt_mapper": regler.get("udeladt_mapper", [])}) if mappe is None else (alle_filer(basis), [])
            res = Resultat(tjek_krav(basis, filer, kredit), [], filer)
        else:
            res = koer(rod, mappe, regler, forbud, kredit)
    except BrugsFejl as e:
        print(f"FEJL: {e}", file=sys.stderr)
        return 2
    if args.json:
        Path(args.json).write_text(json.dumps({"funde": [f._asdict() for f in res.funde],
                                                "privat": res.privat}, ensure_ascii=True, indent=1), encoding="utf-8")
    return _skriv(res, mappe, args.vis_privat, args.maks, args.stille, args.kun_krav)


if __name__ == "__main__":
    sys.exit(main())
