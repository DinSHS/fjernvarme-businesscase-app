"""Et helt værk som pakke (zip): eksport og import (brief 21 punkt 5).

Indhold::

    pakke.json                 format, versioner, værk, blade, tidsserier, scenarier (se FORMAT nedenfor)
    tidsserier/<sha256>.csv    værkets GYLDIGE tidsserier i normaliseret form (time,mw; UTC; timens start)
    kilde.yaml                 værkets oprindelige YAML, hvis den findes (kun visning)
    LAESMIG.txt                hvad pakken er, og hvor modellen kommer fra (kredit)

Pakken bærer **ingen identiteter** (ingen e-mails, ingen id'er fra kildedatabasen) — den kan deles. Ved import
får alt nye id'er, importøren står som opretter, og værket får kilde ``app`` og revision 1 med én ``opret``-log
pr. blad (som "kopiér værk").

Import validerer FØR noget skrives: formatet, hvert blad mod skemaet (``fjv_skema.tjek_raekke``) og dublerede
stier, modellens minimumskrav (``logik.regler.tjek_modelkrav``), hver tidsseries bytes mod sin sha256 og mod
fv-data's regler (oraklet), og scenarierne mod skemaet. Et værk med samme kode afvises (ingen overskrivning).
"""

from __future__ import annotations

import io
import json
import re
import zipfile

from sqlalchemy import select

from . import __version__
from . import skema as S
from .data_api import Fejl
from .database import betroet_mutex
from .typer import er_uuid, nu, ny_uuid

FORMAT = "fjernvarme-vaerkspakke"
#: 2 (K6): tidsserie-referencer er ``pakke:<rolle>:<sha256>`` (v1 skrev kun hashen — en fil registreret i begge
#: roller blev forvekslet, K6-F4), og scenarier har lokale nøgler + ``reference`` (K6-F5). v1 læses stadig.
FORMAT_VERSION = 2
LAESBARE_VERSIONER = (1, 2)
MAKS_PAKKE = 64 * 1024 * 1024
_KODE = re.compile(r"^[a-z0-9_]{1,60}$")
_SHA = re.compile(r"^[0-9a-f]{64}$")
BLAD_FELTER = ("sti", "vaerdi_json", "sektion", "objekt", "kommentar", "bekraeft", "raekkefoelge")
SCENARIE_FELTER = ("navn", "beskrivelse", "periode_start", "periode_slut", "med_balancering", "balancing_method",
                   "mip_rel_gap", "mip_abs_gap", "tidsgraense_s", "ekstra_flag", "heat_csv", "arkiveret")
#: Scenariekolonner, der IKKE kopieres som værdi: identiteter (nye ved import) og relationen, der oversættes via
#: pakkens nøgler (``reference``). En test kræver, at hver skemakolonne står i den ene eller den anden liste (K6-F5).
SCENARIE_UDELADT = ("id", "vaerk_id", "oprettet_af", "oprettet", "reference_scenarie_id")
TS_FELTER = ("rolle", "navn", "filnavn", "sha256", "tidsstempel", "tidszone", "kilde", "aktiv")
AENDRING_FELTER = ("type", "sti", "vaerdi_json", "raekkefoelge")
TS_PRAEFIKS = "pakke:"


def ts_noegle(rolle: str, sha256: str) -> str:
    """Pakkenøglen for en tidsserie: rollen OG hashen — samme fil kan være registreret i begge roller (K6-F4)."""
    return f"{rolle}:{sha256}"

LAESMIG = """Fjernvarme Businesscase - værkspakke ({kode})

Pakken er et værk (parametre, tidsserier, scenarier) til community-udgaven af appen, der er en
brugerflade til fjernvarme-businesscase-modellen af skj-1964 (MIT):
  https://github.com/skj-1964/fjernvarme-businesscase  (model, pinnet commit {model})
  https://github.com/skj-1964/df-data                   (markeds- og vejrdata, pinnet commit {data})
Modellen er udviklet med Billund Varme og Dansk Fjernvarme. Pakken indeholder ikke modellens kode.

Importér:  python -m fjernvarme_app import {fil}
"""


def _vaerk(app, noegle: str) -> dict:
    v = app.db.t("Vaerk")
    q = select(v).where(v.c.id == noegle.lower()) if er_uuid(noegle) else select(v).where(v.c.kode == noegle)
    with app.db.laes() as cn:
        r = cn.execute(q).first()
    if not r:
        raise Fejl(404, "findes_ikke", f"Værket {noegle!r} findes ikke.")
    return dict(r._mapping)


def eksporter(app, noegle: str) -> tuple[bytes, str]:
    from fjv import konstanter as K
    from fjv import tidsserie as TS

    from . import lokal_lager as LL
    db = app.db
    v = _vaerk(app, noegle)
    p, ts, sc, sa = db.t("VaerkParameter"), db.t("Tidsserie"), db.t("Scenarie"), db.t("ScenarieAendring")
    with db.laes() as cn:
        blade = [{k: r._mapping[k] for k in BLAD_FELTER} for r in cn.execute(
            select(p).where(p.c.vaerk_id == v["id"]).order_by(p.c.raekkefoelge, p.c.sti)).fetchall()]
        tsr = [dict(r._mapping) for r in cn.execute(
            select(ts).where(ts.c.vaerk_id == v["id"], ts.c.status == "gyldig").order_by(ts.c.uploadet)).fetchall()]
        scr = [dict(r._mapping) for r in cn.execute(
            select(sc).where(sc.c.vaerk_id == v["id"]).order_by(sc.c.oprettet)).fetchall()]
        aend = {}
        for s in scr:
            aend[s["id"]] = [{k: r._mapping[k] for k in AENDRING_FELTER} for r in
                             cn.execute(select(sa).where(sa.c.scenarie_id == s["id"]).order_by(sa.c.raekkefoelge)).fetchall()]
    ts_ref = {t["id"]: ts_noegle(t["rolle"], t["sha256"]) for t in tsr}
    sc_noegle = {s["id"]: f"s{i + 1}" for i, s in enumerate(scr)}
    filer: dict[str, bytes] = {}
    tidsserier = []
    for t in tsr:
        f = TS.find_fil(app.files, t["sha256"], t.get("sti"))
        if f is None:
            raise Fejl(409, "ugyldig", f"Tidsserien {t['navn']!r} mangler sin fil ({t['sha256'][:12]}…).")
        data = f.read_bytes()
        if TS.sha256(data) != t["sha256"]:
            raise Fejl(409, "ugyldig", f"Tidsserien {t['navn']!r} passer ikke med sin sha256.")
        filer[f"tidsserier/{t['sha256']}.csv"] = data
        tidsserier.append({**{k: t[k] for k in TS_FELTER}, "noegle": ts_noegle(t["rolle"], t["sha256"])})
    scenarier = []
    for s in scr:
        ae = []
        for a in aend[s["id"]]:
            a = dict(a)
            # Et valg af værkets egen tidsserie peger på et id; i pakken står det som seriens pakkenøgle (rolle + hash).
            # En reference, der ikke kan oversættes (fx til en afvist serie), er en fejl — den må ikke forsvinde tavst.
            if a["sti"].startswith("_tidsserie.") and a.get("vaerdi_json"):
                try:
                    x = json.loads(a["vaerdi_json"])
                except ValueError:
                    x = None
                if isinstance(x, str) and x != "syntetisk":
                    if x not in ts_ref:
                        raise Fejl(409, "ugyldig", f"Scenariet {s['navn']!r} vælger tidsserien {x}, som ikke er en "
                                                   "gyldig tidsserie i værket — ret scenariet, før det eksporteres.")
                    a["vaerdi_json"] = json.dumps(TS_PRAEFIKS + ts_ref[x])
            ae.append(a)
        scenarier.append({**{k: s[k] for k in SCENARIE_FELTER}, "noegle": sc_noegle[s["id"]],
                          "reference": sc_noegle.get(s.get("reference_scenarie_id")), "aendringer": ae})
    pins = LL.motor_pins(db)
    pakke = {
        "format": FORMAT, "format_version": FORMAT_VERSION, "skemaversion": app.skema.version,
        "app_version": __version__, "eksporteret": nu().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model": {"repo": K.MODEL_REPO, "commit": pins["model_commit"]},
        "data": {"repo": K.DF_DATA_REPO, "commit": pins["data_commit"]},
        "vaerk": {"kode": v["kode"], "navn": v["navn"], "beskrivelse": v["beskrivelse"], "kilde": v["kilde"],
                  "kilde_fil": v["kilde_fil"], "repo_commit": v["repo_commit"], "revision": v["revision"]},
        "blade": blade, "tidsserier": tidsserier, "scenarier": scenarier,
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("pakke.json", json.dumps(pakke, ensure_ascii=False, indent=1, allow_nan=False))
        for navn, data in filer.items():
            z.writestr(navn, data)
        kilde = app.files / "fjv" / "vaerker" / v["kode"] / "kilde.yaml"
        if kilde.is_file():
            z.writestr("kilde.yaml", kilde.read_bytes())
        z.writestr("LAESMIG.txt", LAESMIG.format(kode=v["kode"], model=pins["model_commit"][:7],
                                                 data=pins["data_commit"][:7], fil=f"{v['kode']}.fjvpakke.zip"))
    return buf.getvalue(), f"{v['kode']}.fjvpakke.zip"


def _afvis(fund: list[str]):
    raise Fejl(400, "ugyldig", "Pakken kan ikke importeres: " + " · ".join(fund[:12])
               + (f" (og {len(fund) - 12} mere)" if len(fund) > 12 else ""))


def _aendringsnoegle(typ: str, sti: str) -> str:
    """Hvad to ændringer i samme scenarie ikke må dele (KONTRAKT §3.5, §6b): samme ``set``-sti, eller samme objekts
    til/fra — hvor ``disable gasmotor`` og ``set units.gasmotor.enabled`` er samme ændring."""
    d = sti.split(".")
    if typ in ("enable", "disable"):
        return f"enabled:{d[-1]}"
    if typ == "set" and len(d) == 3 and d[0] in ("units", "storage") and d[2] == "enabled":
        return f"enabled:{d[1]}"
    return f"set:{sti}"


def _laes_aendringer(fs, raa: dict, s: dict, ts_noegler: set) -> tuple[list, list[str]]:
    """Et scenaries ændringsrækker valideret som den betroede skrivevej ville kræve det (K6-F6): skemaet
    (type, sti, gyldig JSON, længder), ``set`` med værdi, ingen dubletter, og hver tidsserie-reference oversættelig.
    Returnerer ``[(raekke, tidsserie_noegle | None)]`` og fundene."""
    fund, ud, set_ = [], [], set()
    navn = s.get("navn")
    for j, a in enumerate(s.get("aendringer") or []):
        if not isinstance(a, dict):
            fund.append(f"scenarie {navn!r}: ændring {j} er ikke et objekt")
            continue
        r = {k: a.get(k) for k in AENDRING_FELTER}
        if r["raekkefoelge"] is None:
            r["raekkefoelge"] = j
        hvor = f"scenarie {navn!r}, ændring {r.get('sti')!r}"
        fund += [f"{hvor}: {f['besked']}" for f in fs.tjek_raekke("ScenarieAendring",
                                                                   {**r, "id": ny_uuid(), "scenarie_id": ny_uuid()}, raa)]
        typ, sti = r.get("type"), r.get("sti")
        if not isinstance(sti, str) or not sti or not isinstance(typ, str):
            continue                                           # tjek_raekke har allerede sagt hvorfor
        if typ == "set" and r.get("vaerdi_json") is None:
            fund.append(f"{hvor}: en set-ændring skal have en værdi")
        k = _aendringsnoegle(typ, sti)
        if k in set_:
            fund.append(f"{hvor}: står to gange i scenariet")
        set_.add(k)
        ts_k = None
        if sti.startswith("_tidsserie.") and typ == "set" and r.get("vaerdi_json") is not None:
            rolle = sti.split(".", 1)[1]
            try:
                x = json.loads(r["vaerdi_json"])
            except ValueError:
                x = None                                       # tjek_raekke har fundet den ugyldige JSON
            if x == "syntetisk" and rolle == "varmelast":
                pass
            elif isinstance(x, str) and x.startswith(TS_PRAEFIKS):
                ts_k = x[len(TS_PRAEFIKS):]
            elif isinstance(x, str) and x.startswith("sha256:"):   # format 1: rollen står i stien
                ts_k = ts_noegle(rolle, x[len("sha256:"):])
            if ts_k is None and x != "syntetisk":
                fund.append(f"{hvor}: tidsserie-valget {r['vaerdi_json']} kan ikke oversættes til en tidsserie i pakken")
            elif ts_k is not None and (ts_k not in ts_noegler or not ts_k.startswith(rolle + ":")):
                fund.append(f"{hvor}: den valgte tidsserie ({ts_k[:20]}…) findes ikke i pakken i rollen {rolle}")
                ts_k = None
        ud.append((r, ts_k))
    return ud, fund


def importer(app, data: bytes, bruger: str, ny_kode: str | None = None) -> dict:
    from fjv import datakrav as DK, tidsserie as TS
    from fjv.flad import afflad

    from . import vaerksskriv as VS
    fs = S.fjv_skema()
    if not data:
        raise Fejl(400, "ugyldig", "Pakken er tom.")
    if len(data) > MAKS_PAKKE:
        raise Fejl(413, "ugyldig", f"Pakken er for stor (højst {MAKS_PAKKE // 1024 // 1024} MB).")
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        if sum(i.file_size for i in z.infolist()) > 4 * MAKS_PAKKE:
            raise Fejl(413, "ugyldig", "Pakken fylder for meget udpakket.")
        pakke = json.loads(z.read("pakke.json").decode("utf-8"))
    except Fejl:
        raise
    except Exception as e:
        raise Fejl(400, "ugyldig", f"Pakken kan ikke læses ({type(e).__name__}: {e}).") from None
    fund: list[str] = []
    if pakke.get("format") != FORMAT or pakke.get("format_version") not in LAESBARE_VERSIONER:
        _afvis([f"ukendt format {pakke.get('format')!r} version {pakke.get('format_version')!r}"])
    if pakke.get("skemaversion") != app.skema.version:
        fund.append(f"pakken er fra skemaversion {pakke.get('skemaversion')}, databasen er {app.skema.version}")
    vk = pakke.get("vaerk") or {}
    kode = (ny_kode or vk.get("kode") or "").strip().lower()
    if not _KODE.match(kode) or kode in ("nyt",):
        fund.append(f"koden {kode!r} er ikke gyldig (små bogstaver, cifre og _, højst 60 tegn; 'nyt' er reserveret)")
    navn = str(vk.get("navn") or kode)[:200]
    blade = pakke.get("blade")
    if not isinstance(blade, list) or not blade:
        _afvis(fund + ["pakken har ingen parametre"])
    stier = set()
    rk_blade = []
    for i, b in enumerate(blade):
        if not isinstance(b, dict):
            fund.append(f"blad {i} er ikke et objekt")
            continue
        r = {k: b.get(k) for k in BLAD_FELTER}
        r.update(id=ny_uuid(), vaerk_id=ny_uuid(), aendret_af=bruger, aendret=nu().strftime("%Y-%m-%dT%H:%M:%S.000Z"))
        if r["sti"] in stier:
            fund.append(f"stien {r['sti']} står to gange")
        stier.add(r["sti"])
        fund += [f"blad {r.get('sti')}: {f['besked']}" for f in fs.tjek_raekke("VaerkParameter", r, app.skema.raa)]
        rk_blade.append({k: r[k] for k in BLAD_FELTER})
    if fund:
        _afvis(fund)
    try:
        from .logik import regler as RG
        RG.tjek_modelkrav(rk_blade)
    except ImportError:
        pass
    except Exception as e:
        _afvis([f"modellens minimumskrav: {getattr(e, 'besked', None) or e}"])
    case = afflad(rk_blade)
    ts_ind = []
    for t in pakke.get("tidsserier") or []:
        sha = str(t.get("sha256") or "")
        if not _SHA.match(sha) or t.get("rolle") not in ("varmelast", "solprofil"):
            fund.append(f"tidsserien {t.get('navn')!r} har ugyldig rolle eller sha256")
            continue
        try:
            fil = z.read(f"tidsserier/{sha}.csv")
        except KeyError:
            fund.append(f"tidsserien {t.get('navn')!r} mangler sin fil i pakken")
            continue
        if TS.sha256(fil) != sha:
            fund.append(f"tidsserien {t.get('navn')!r} passer ikke med sin sha256")
            continue
        res = DK.valider(fil.decode("utf-8"), t["rolle"], tidszone="UTC", tidsstempel="start", vaerk=case)
        if res.status != "gyldig" or res.sha256 != sha:
            fund.append(f"tidsserien {t.get('navn')!r} er ikke gyldig efter fv-data's regler"
                        + ("" if res.status != "gyldig" else " (normaliseringen gav en anden fil)"))
            continue
        k = ts_noegle(t["rolle"], sha)
        if any(ts_noegle(x["rolle"], x["sha256"]) == k for x, _ in ts_ind):
            fund.append(f"tidsserien {t.get('navn')!r} står to gange i samme rolle")
            continue
        ts_ind.append((t, res))
    ts_noegler = {ts_noegle(t["rolle"], t["sha256"]) for t, _ in ts_ind}
    scen, sc_noegler = [], set()
    for i, s in enumerate(pakke.get("scenarier") or []):
        if not isinstance(s, dict):
            fund.append(f"scenarie {i} er ikke et objekt")
            continue
        sn = str(s.get("noegle") or f"s{i + 1}")
        if sn in sc_noegler:
            fund.append(f"scenariets pakkenøgle {sn!r} står to gange")
        sc_noegler.add(sn)
        r = {k: s.get(k) for k in SCENARIE_FELTER}
        r.update(id=ny_uuid(), vaerk_id=ny_uuid(), oprettet_af=bruger, oprettet=nu().strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                 arkiveret=bool(r.get("arkiveret")), med_balancering=bool(r.get("med_balancering")))
        fund += [f"scenarie {s.get('navn')!r}: {f['besked']}" for f in fs.tjek_raekke("Scenarie", r, app.skema.raa)]
        ae, fund_ae = _laes_aendringer(fs, app.skema.raa, s, ts_noegler)
        fund += fund_ae
        scen.append((sn, r, s.get("reference"), ae))
    for sn, r, ref, _ in scen:
        if ref is not None and (ref not in sc_noegler or ref == sn):
            fund.append(f"scenariet {r['navn']!r} henviser til referencen {ref!r}, som ikke er et andet scenarie i pakken")
    if fund:
        _afvis(fund)

    db = app.db
    with betroet_mutex, db.skriv() as cn:
        if VS.kode_findes(db, cn, kode):
            raise Fejl(409, "unik", f"Koden {kode!r} er allerede i brug — giv værket en ny kode (--kode).")
        bl = [{**b, "raekkefoelge": int(b["raekkefoelge"])} for b in rk_blade]
        vid = VS.opret_vaerk(db, cn, kode=kode, navn=navn, beskrivelse=vk.get("beskrivelse"), kilde="app",
                             blade=bl, hvem=bruger, kilde_fil=f"pakke:{vk.get('kode') or kode}"[:300],
                             repo_commit=vk.get("repo_commit"))
        noegle_til_id = {}
        for t, res in ts_ind:
            tid, _ = VS.indsaet_tidsserie(db, cn, vid, kode, t["rolle"], str(t.get("navn") or t["rolle"]),
                                          str(t.get("filnavn") or f"{t['sha256']}.csv"), res,
                                          t.get("kilde") if t.get("kilde") in ("csv", "vaerksark", "repo") else "csv",
                                          bool(t.get("aktiv")), bruger, tidsstempel=t.get("tidsstempel") or "start",
                                          tidszone=t.get("tidszone") or "UTC")
            noegle_til_id[ts_noegle(t["rolle"], t["sha256"])] = tid
        sct, sat = db.t("Scenarie"), db.t("ScenarieAendring")
        sc_id = {}
        for sn, r, _, ae in scen:
            sid = sc_id[sn] = ny_uuid()
            cn.execute(sct.insert().values(**{**{k: r[k] for k in SCENARIE_FELTER}, "id": sid, "vaerk_id": vid,
                                              "oprettet_af": bruger, "oprettet": nu()}))
            for a, ts_k in ae:
                vj = json.dumps(noegle_til_id[ts_k]) if ts_k else a["vaerdi_json"]
                cn.execute(sat.insert().values(id=ny_uuid(), scenarie_id=sid, type=a["type"], sti=a["sti"],
                                               vaerdi_json=vj, raekkefoelge=a["raekkefoelge"]))
        # Relationerne efter alle nye id'er findes (K6-F5).
        for sn, _, ref, _ in scen:
            if ref is not None:
                cn.execute(sct.update().where(sct.c.id == sc_id[sn]).values(reference_scenarie_id=sc_id[ref]))
    try:
        kilde = z.read("kilde.yaml").decode("utf-8")
        from fjv.importer import gem_kildefil
        gem_kildefil(kode, kilde)
    except KeyError:
        pass
    return {"ok": True, "vaerk_id": vid, "kode": kode, "parametre": len(rk_blade), "tidsserier": len(ts_ind),
            "scenarier": len(scen)}
