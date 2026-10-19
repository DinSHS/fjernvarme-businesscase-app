"""De betroede forløb — tro port af ``app/rayfin/functions/src/function_app.ts`` (kontrolflow, ikke SQL).

=========================  ===========================================================================
Function (TS)              Her
=========================  ===========================================================================
``startBestilling``        ``start_bestilling(lager, bestilling_id, start_arbejder)``
``udfoerAendring``         ``udfoer_aendring(lager, anmodning_id)`` (parametre, kopier_vaerk, opret_vaerk,
                           aktiver_tidsserie)
``annullerKoersel``        ``annuller_koersel(lager, koersel_id)``
``uploadTidsserie``        ``upload_tidsserie(lager, filer, anmodning_id, indhold_base64)``
``hentTidsserie``          ``hent_tidsserie(lager, filer, tidsserie_id, fra, til)``
``uploadVaerksark``        ``upload_vaerksark(lager, filer, start_import, anmodning_id, indhold_base64)``
``hentKildeYaml``          ``hent_kilde_yaml(lager, filer, vaerk_id)``
``hentDmiTemperatur``      ``hent_dmi_temperatur(lager, filer, omraade, fra, til, kolonne)``
``afstem``                 ``afstem(marker_doede, start_arbejder)``
=========================  ===========================================================================

Rækkefølgen af tjek, teksterne og hvad der skrives er TS'; ``lager`` (``lager.BetroetLager``) gør transaktion,
låse og servertid. Jobstarten er en callback, fordi Fabrics jobs-API og community-udgavens lokale arbejder ikke
har noget til fælles: ``start_arbejder() -> {"startet": bool, "grund": str, ["fabric_job_id"]}`` (TS'
``Arbejderstart``), ``start_import(import_id) -> {"ok", "status", ["jobId"], ["fejl"]}`` (TS' ``Jobsvar``) eller
``None``.

Identitet: som i Fabric stoler forløbene på ``bestilt_af``/``anmodet_af`` på rækken, som skrivelaget (DAB-policyen;
i community REST-laget) har verificeret ved oprettelse — de kender ikke kalderen.
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timezone

from . import jsjson as J
from .lager import UnikBrud
from .regler import GRAENSER, Afvisning, byg_frosset_input, laes_anmodning, planlaeg_parametre, saml_nyt_vaerk
from .tidsserie import (MAKS_UPLOAD_BYTES, ForLangRaekke, base64_bytes, sha256_bytes, sha256_hex, taet_raekke,
                        vaerk_trae, valider_upload, validering_json)
from .vaerksark import behandl_vaerksark

__all__ = ["start_bestilling", "udfoer_aendring", "annuller_koersel", "upload_tidsserie", "hent_tidsserie",
           "upload_vaerksark", "hent_kilde_yaml", "hent_dmi_temperatur", "afstem", "DOED_EFTER_MIN", "DOEDE_TEKSTER",
           "teknisk_fejl"]

_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.ASCII | re.I)
_BASE64 = re.compile(r"[A-Za-z0-9+/]+={0,2}", re.ASCII)
_KODE = re.compile(r"[a-z0-9_]{1,60}", re.ASCII)


def _uuid(v) -> bool:
    return isinstance(v, str) and bool(_UUID.fullmatch(v))


def _lc(v) -> str:
    """mssql giver uniqueidentifier med STORE bogstaver, DAB med små — svar altid med små."""
    return J.streng(v).lower() if v is not None else "null"


def teknisk_fejl(hvor: str, e: BaseException) -> str:
    """En uventet fejl som læsbar tekst (en anonym fejl når ellers kalderen uden tekst)."""
    return J.skive(f"Teknisk fejl i {hvor}: {e}", 0, 1900)


def _tal(v):
    """``x == null ? null : Number(x)`` — en SQL-decimal bliver et tal."""
    return None if v is None else float(v)


def _n(v) -> str:
    """``${v}`` for et tal fra databasen (int, float eller Decimal) — som JS skriver det (``1``, ikke ``1.0``)."""
    if v is None:
        return "null"
    if isinstance(v, bool) or isinstance(v, str):
        return J.streng(v)
    return J.js_str(float(v))


def _nn(v, standard):
    """``v ?? standard``."""
    return standard if v is None else v


def _iso(v) -> str:
    """``new Date(v).toISOString()`` for en datetime (naiv = UTC) eller ISO-tekst fra lageret."""
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        d = v - datetime(1970, 1, 1, tzinfo=timezone.utc)
        return J.iso((d.days * 86_400 + d.seconds) * 1000 + d.microseconds // 1000)   # ms, afkortet som mssql
    return J.iso(J.dato_parse(v))


def _dt(iso_tekst):
    """ISO-tekst -> datetime (UTC) til lageret."""
    t = J.dato_parse(iso_tekst)
    if math.isnan(t):
        return None
    return datetime.fromtimestamp(t / 1000, tz=timezone.utc)


# ================================================================== startBestilling


def start_bestilling(lager, bestilling_id: str, start_arbejder) -> dict:
    """Bestilling -> Koersel(``koe``) + KoerselInput (+ frosne pins), og start en arbejder. Idempotent på
    bestillingen. Returnerer TS' ``Bestillingssvar``: ``{ok, koersel_id?, status?, ny?, afvist?, arbejder?}``."""
    if not _uuid(bestilling_id):
        return {"ok": False, "afvist": "Ugyldigt bestillings-id."}

    def findes():
        with lager.transaktion() as tx:
            return tx.koersel_for_bestilling(bestilling_id)

    foer = findes()
    if foer:
        return {"ok": True, "koersel_id": _lc(foer["id"]), "status": foer["status"], "ny": False, "arbejder": start_arbejder()}

    try:
        with lager.transaktion() as tx:
            b = tx.bestilling(bestilling_id)
            if not b:
                raise Afvisning("Bestillingen findes ikke.")
            # K2-F9: kvoten tælles og forbruges under en lås pr. bruger (på tværs af værker).
            tx.laas_kvote(b["bestilt_af"])
            s = tx.scenarie(b["scenarie_id"], laas=True)
            if not s:
                raise Afvisning("Scenariet findes ikke.")
            if s.get("arkiveret"):
                raise Afvisning("Scenariet er arkiveret.")
            # Lås på værket: serialiserer mod udfoerAendring, så revision og blade hører sammen.
            v = tx.vaerk(s["vaerk_id"], laas=True)
            if not v:
                raise Afvisning("Værket findes ikke.")
            if v.get("arkiveret"):
                raise Afvisning("Værket er arkiveret.")
            ventende = int(tx.antal_i_koe(b["bestilt_af"]))
            if ventende >= GRAENSER["ventende_pr_bruger"]:
                raise Afvisning(f"Du har allerede {_n(ventende)} kørsler i kø; højst {GRAENSER['ventende_pr_bruger']} ad "
                                f"gangen. Vent til en er færdig, eller annullér en.")
            params = [{"sti": p["sti"], "vaerdi_json": p["vaerdi_json"]} for p in tx.parametre(v["id"])]
            aendr = tx.scenarie_aendringer(s["id"], laas=True)
            motor = tx.motor()
            if not motor or not motor.get("model_commit") or not motor.get("data_commit"):
                raise Afvisning("Regnemotoren har endnu ikke registreret sin model- og dataversion. Prøv igen om lidt.")
            scenarie = {
                "periode_start": s.get("periode_start"), "periode_slut": s.get("periode_slut"),
                "med_balancering": bool(s.get("med_balancering")), "balancing_method": s.get("balancing_method"),
                "mip_rel_gap": _tal(s.get("mip_rel_gap")), "mip_abs_gap": _tal(s.get("mip_abs_gap")),
                "tidsgraense_s": _tal(s.get("tidsgraense_s")),
                "ekstra_flag": s.get("ekstra_flag"), "heat_csv": s.get("heat_csv"),
            }
            tidsserier = [{**t, "id": _lc(t["id"]), "aktiv": bool(t.get("aktiv")), "start": _iso(t["start"]),
                           "slut": _iso(t["slut"])} for t in tx.gyldige_tidsserier(v["id"], laas=True)]
            frossen = byg_frosset_input(params, aendr, scenarie,
                                        {"model_commit": motor["model_commit"], "data_commit": motor["data_commit"]},
                                        tidsserier)
            koersel_id = lager.ny_id()
            tx.indsaet_koersel({
                "id": koersel_id, "bestilling_id": b["id"], "scenarie_id": s["id"], "vaerk_id": v["id"],
                "vaerk_revision": v["revision"], "input_hash": frossen["hash"], "status": "koe", "fase": "I kø",
                "bestilt_af": b["bestilt_af"], "bestilt": b.get("bestilt"), "forsoeg": 0, "kilde": "app",
                "oensket_rel_gap": frossen["effektiv"]["mip_rel_gap"], "oensket_abs_gap": frossen["effektiv"]["mip_abs_gap"],
                "model_commit": motor["model_commit"], "data_commit": motor["data_commit"],
            })
            tx.indsaet_input(koersel_id, frossen["raekker"])
    except Afvisning as e:
        return {"ok": False, "afvist": str(e)}
    except UnikBrud:
        # To samtidige kald med samme bestilling: den anden taber på den unikke bestilling_id.
        efter = findes()
        if efter:
            return {"ok": True, "koersel_id": _lc(efter["id"]), "status": efter["status"], "ny": False}
        return {"ok": False, "afvist": teknisk_fejl("startBestilling", UnikBrud("unik nøgle brudt"))}
    except Exception as e:                                     # noqa: BLE001 — svar læsbart, som TS
        return {"ok": False, "afvist": teknisk_fejl("startBestilling", e)}

    arbejder = start_arbejder()
    nu = findes()
    return {"ok": True, "koersel_id": koersel_id, "status": _nn((nu or {}).get("status"), "koe"), "ny": True,
            "arbejder": arbejder}


# ================================================================== udfoerAendring


def _find_dele(tx, anmodet_af: str, udkast: str, laas: bool) -> list[dict]:
    """Et udkasts dele: anmodninger fra SAMME bruger, status ``ny``, af typen opret_vaerk_del med netop dette udkast."""
    ud = []
    for rad in tx.nye_anmodninger(anmodet_af, udkast, laas):
        try:
            x = laes_anmodning(rad["aendringer_json"])
        except Afvisning:
            continue                                         # en ugyldig række med uuid'et i teksten er ikke en del
        if x["type"] == "opret_del" and x["del"]["udkast"] == udkast:
            ud.append({"id": _lc(rad["id"]), "del": x["del"]})
    return ud


def _opret_vaerk(lager, tx, a: dict, o: dict) -> dict:
    dele = _find_dele(tx, a["anmodet_af"], o["udkast"], True)
    blade = saml_nyt_vaerk([d["del"] for d in dele], o["dele"], o["udkast"])
    if tx.kode_findes(o["ny_kode"], laas=True):
        raise Afvisning(f'Koden "{o["ny_kode"]}" er allerede i brug.')
    ny_id = lager.ny_id()
    try:
        tx.indsaet_vaerk({"id": ny_id, "kode": o["ny_kode"], "navn": o["navn"], "beskrivelse": o.get("beskrivelse"),
                          "kilde": "app", "kopieret_fra_id": None, "revision": 1, "arkiveret": False,
                          "oprettet_af": a["anmodet_af"], "aendret_af": a["anmodet_af"]})
    except UnikBrud:
        raise Afvisning(f'Koden "{o["ny_kode"]}" er allerede i brug.') from None
    tx.indsaet_parametre(ny_id, blade, a["anmodet_af"])
    tx.indsaet_log(ny_id, [{"revision": 1, "sti": p["sti"], "handling": "opret", "gammel_json": None,
                            "ny_json": p["vaerdi_json"], "aendret_af": a["anmodet_af"], "anmodning_id": a["id"]}
                           for p in tx.parametre(ny_id)])
    n = int(tx.antal_parametre(ny_id))
    if n != len(blade):
        raise RuntimeError(f"Uventet: {n} parametre indsat, {len(blade)} forventet.")
    svar = (f'Værket "{o["ny_kode"]}" er oprettet fra bunden med {_n(n)} parametre '
            f'({sum(1 for b in blade if b["bekraeft"])} skal bekræftes).')
    for d in dele:
        if not tx.saet_anmodning(d["id"], "udfoert", J.skive(f'Del {d["del"]["nr"]}/{d["del"]["af"]}: {svar}', 0, 2000)):
            raise RuntimeError(f'Uventet: del {d["del"]["nr"]} blev ændret samtidig.')
    tx.saet_anmodning(a["id"], "udfoert", J.skive(svar, 0, 2000))
    return {"ok": True, "status": "udfoert", "svar": svar, "vaerk_id": ny_id, "revision": 1}


def _aktiver_tidsserie(tx, a: dict, o: dict) -> dict:
    ts = tx.tidsserie(o["tidsserie_id"], laas=True)
    if not ts:
        raise Afvisning("Tidsserien findes ikke.")
    if _lc(ts["vaerk_id"]) != _lc(a["vaerk_id"]):
        raise Afvisning("Tidsserien hører til et andet værk.")
    if o["aktiv"] and ts["status"] != "gyldig":
        raise Afvisning(f'"{ts["navn"]}" er {ts["status"]} og kan ikke gøres aktiv.')
    tx.laas_tidsserier(ts["vaerk_id"], ts["rolle"])
    if o["aktiv"]:
        tx.deaktiver_andre(ts["vaerk_id"], ts["rolle"], ts["id"])
    tx.saet_aktiv(ts["id"], o["aktiv"])
    svar = (f'"{ts["navn"]}" er nu værkets aktive {ts["rolle"]}.' if o["aktiv"]
            else f'"{ts["navn"]}" er ikke længere aktiv.')
    tx.saet_anmodning(a["id"], "udfoert", svar)
    return {"ok": True, "status": "udfoert", "svar": svar, "vaerk_id": _lc(ts["vaerk_id"])}


def udfoer_aendring(lager, anmodning_id: str) -> dict:
    """Aendringsanmodning -> VaerkParameter + Aendringslog + revision (også kopi, nyt værk, aktivering).
    Returnerer TS' ``Aendringssvar``: ``{ok, status, svar, vaerk_id?, revision?}``."""
    if not _uuid(anmodning_id):
        return {"ok": False, "status": "afvist", "svar": "Ugyldigt anmodnings-id."}
    with lager.transaktion() as tx:
        a = tx.anmodning(anmodning_id, laas=False)
    if not a:
        return {"ok": False, "status": "afvist", "svar": "Anmodningen findes ikke."}
    # K2-F10: kun backend skriver status/svar; et klientleveret svar på en 'ny' anmodning overskrives.
    if a["status"] != "ny":
        return {"ok": a["status"] == "udfoert", "status": a["status"], "svar": _nn(a.get("svar"), "")}

    udkast = None
    try:
        anm = laes_anmodning(a["aendringer_json"])
        if anm["type"] == "opret_del":
            return {"ok": False, "status": "ny",
                    "svar": f'Del {anm["del"]["nr"]} af {anm["del"]["af"]} af et nyt værk — udføres sammen med den '
                            f"afsluttende oprettelse."}
        if anm["type"] in ("upload_tidsserie", "upload_vaerksark"):
            return {"ok": False, "status": "ny", "svar": "En upload udføres sammen med filen af uploadTidsserie/uploadVaerksark."}
        if anm["type"] == "opret":
            udkast = anm["opret"]["udkast"]
        with lager.transaktion() as tx:
            igen = tx.anmodning(a["id"], laas=True)
            if igen["status"] != "ny":
                return {"ok": igen["status"] == "udfoert", "status": igen["status"], "svar": _nn(igen.get("svar"), "")}
            if anm["type"] == "opret":
                return _opret_vaerk(lager, tx, a, anm["opret"])
            if anm["type"] == "aktiver_tidsserie":
                return _aktiver_tidsserie(tx, a, anm["aktiver"])

            v = tx.vaerk(a["vaerk_id"], laas=True)
            if not v:
                raise Afvisning("Værket findes ikke.")

            def afslut(svar: str, vaerk_id: str, revision: int) -> dict:
                tx.saet_anmodning(a["id"], "udfoert", J.skive(svar, 0, 2000))
                return {"ok": True, "status": "udfoert", "svar": svar, "vaerk_id": vaerk_id, "revision": revision}

            if anm["type"] == "kopi":
                k = anm["kopi"]
                if tx.kode_findes(k["ny_kode"], laas=False):
                    raise Afvisning(f'Koden "{k["ny_kode"]}" er allerede i brug.')
                ny_id = lager.ny_id()
                tx.indsaet_vaerk({"id": ny_id, "kode": k["ny_kode"], "navn": k["navn"], "beskrivelse": k.get("beskrivelse"),
                                  "kilde": "app", "kopieret_fra_id": v["id"], "revision": 1, "arkiveret": False,
                                  "oprettet_af": a["anmodet_af"], "aendret_af": a["anmodet_af"]})
                kilde = tx.parametre(v["id"])
                tx.indsaet_parametre(ny_id, [{x: p.get(x) for x in ("sti", "vaerdi_json", "sektion", "objekt", "kommentar",
                                                                     "bekraeft", "raekkefoelge")} for p in kilde],
                                     a["anmodet_af"])
                tx.indsaet_log(ny_id, [{"revision": 1, "sti": p["sti"], "handling": "opret", "gammel_json": None,
                                        "ny_json": p["vaerdi_json"], "aendret_af": a["anmodet_af"], "anmodning_id": a["id"]}
                                       for p in tx.parametre(ny_id)])
                n = int(tx.antal_parametre(ny_id))
                return afslut(f'Værket "{k["ny_kode"]}" er oprettet som kopi af "{v["kode"]}" (revision {_n(v["revision"])}) '
                              f"med {_n(n)} parametre.", ny_id, 1)

            if v.get("arkiveret"):
                raise Afvisning("Værket er arkiveret og kan ikke ændres.")
            if int(v["revision"]) != int(a["forventet_revision"]):
                raise Afvisning(f"Værket er ændret, siden du begyndte at redigere (revision {_n(a['forventet_revision'])} → "
                                f"{_n(v['revision'])}). Genindlæs værket og læg dine ændringer ind igen.")
            raekker = tx.parametre(v["id"])
            nuvaerende = {r["sti"]: r["vaerdi_json"] for r in raekker}
            if len(nuvaerende) != len(raekker):
                raise Afvisning("Værket har dobbelte parametre — det skal ryddes op, før det kan ændres.")
            plan = planlaeg_parametre(nuvaerende, anm["aendringer"])
            ny_rev = int(v["revision"]) + 1
            naeste = max((int(r["raekkefoelge"] or 0) for r in raekker), default=0) + 1
            log = []

            def logrk(sti, handling, gammel, ny):
                log.append({"revision": ny_rev, "sti": sti, "handling": handling, "gammel_json": gammel, "ny_json": ny,
                            "aendret_af": a["anmodet_af"], "anmodning_id": a["id"]})

            for r in plan["ret"]:
                n = tx.ret_parameter(v["id"], r["sti"], r["ny_json"], a["anmodet_af"])
                if n != 1:
                    raise RuntimeError(f"Uventet: {n} rækker ramt for {r['sti']}")
                logrk(r["sti"], "ret", r["gammel_json"], r["ny_json"])
            for r in plan["slet"]:
                tx.slet_parameter(v["id"], r["sti"])
                logrk(r["sti"], "slet", r["gammel_json"], None)
            for r in plan["opret"]:
                tx.indsaet_parametre(v["id"], [{"sti": r["sti"], "vaerdi_json": r["ny_json"], "sektion": r["sektion"],
                                                "objekt": r["objekt"], "kommentar": None, "bekraeft": False,
                                                "raekkefoelge": naeste}], a["anmodet_af"])
                naeste += 1
                logrk(r["sti"], "opret", None, r["ny_json"])
            tx.indsaet_log(v["id"], log)
            if not tx.saet_revision(v["id"], int(v["revision"]), ny_rev, a["anmodet_af"]):
                raise Afvisning("Værket blev ændret samtidig af en anden. Genindlæs og prøv igen.")
            antal = len(plan["ret"]) + len(plan["slet"]) + len(plan["opret"])
            return afslut(f'{antal} ændring(er) gemt i "{v["kode"]}" (revision {_n(v["revision"])} → {ny_rev}).', _lc(v["id"]), ny_rev)
    except Afvisning as e:
        tekst = str(e)
        with lager.transaktion() as tx:
            tx.saet_anmodning(a["id"], "afvist", J.skive(tekst, 0, 2000))
            # Afvises en oprettelse, afvises dens dele også, så de ikke ligger og venter.
            if udkast:
                for d in _find_dele(tx, a["anmodet_af"], udkast, False):
                    tx.saet_anmodning(d["id"], "afvist", J.skive(f"Oprettelsen blev afvist: {tekst}", 0, 2000))
        return {"ok": False, "status": "afvist", "svar": tekst}
    except Exception as e:                                     # noqa: BLE001
        return {"ok": False, "status": "ny", "svar": teknisk_fejl("udfoerAendring", e) + " Intet er ændret; prøv igen."}


# ================================================================== annullerKoersel


def annuller_koersel(lager, koersel_id: str) -> dict:
    """KONTRAKT §6c: samarbejdende annullering. ``{ok, status, besked}``."""
    if not _uuid(koersel_id):
        return {"ok": False, "status": "ukendt", "besked": "Ugyldigt kørsels-id."}

    def laes():
        with lager.transaktion() as tx:
            return tx.koersel(koersel_id)

    r = laes()
    if not r:
        return {"ok": False, "status": "ukendt", "besked": "Kørslen findes ikke."}
    if r["status"] in ("koe", "startet"):
        # `startet` er en forældet reservation fra før §6c; ingen arbejder tager den.
        with lager.transaktion() as tx:
            ok = tx.annuller_i_koe(koersel_id, r["status"])
        if ok:
            return {"ok": True, "status": "annulleret", "besked": "Kørslen er annulleret."}
        nu = laes()
        st = J.UNDEFINED if not nu else nu["status"]
        return {"ok": False, "status": _nn((nu or {}).get("status"), "ukendt"),
                "besked": f'Kørslen nåede at skifte til "{J.streng(st)}" imens — prøv igen.'}
    if r["status"] in ("koerer", "indlaeser"):
        if r.get("annuller_anmodet"):
            return {"ok": True, "status": r["status"], "besked": "Annullering er allerede anmodet; arbejderen stopper kørslen."}
        with lager.transaktion() as tx:
            ok = tx.anmod_annullering(koersel_id, r["status"])
        if ok:
            return {"ok": True, "status": r["status"],
                    "besked": "Annullering er anmodet. Arbejderen stopper solveren og markerer kørslen annulleret."}
        nu = laes()
        st = J.UNDEFINED if not nu else nu["status"]
        return {"ok": False, "status": _nn((nu or {}).get("status"), "ukendt"),
                "besked": f'Kørslen skiftede til "{J.streng(st)}" imens — intet er ændret.'}
    return {"ok": False, "status": r["status"], "besked": f'Kørslen er allerede {r["status"]} og kan ikke annulleres.'}


# ================================================================== tidsserier (KONTRAKT §6d)


def _laes_upload_anmodning(lager, anmodning_id: str, typ: str, indhold: str):
    """Anmodningen bag en upload: ``("fejl", svar)`` eller ``(a, upload)``. Kaster ``Afvisning``."""
    with lager.transaktion() as tx:
        a = tx.anmodning(anmodning_id, laas=False)
    if not a:
        return "fejl", {"ok": False, "status": "afvist", "svar": "Anmodningen findes ikke."}
    if a["status"] != "ny":
        return "fejl", {"ok": a["status"] == "udfoert", "status": a["status"], "svar": _nn(a.get("svar"), "")}
    x = laes_anmodning(a["aendringer_json"])
    if x["type"] != typ:
        raise Afvisning(f"Anmodningen er ikke en {'tidsserie-upload' if typ == 'upload_tidsserie' else 'værksark-upload'}.")
    if sha256_hex(indhold) != x["upload"]["sha256"]:
        raise Afvisning("Filens indhold passer ikke med anmodningens sha256 — upload filen igen.")
    return a, x["upload"]


def _afvis_anmodning(lager, id: str, tekst: str) -> None:
    with lager.transaktion() as tx:
        tx.saet_anmodning(id, "afvist", J.skive(tekst, 0, 2000))


def upload_tidsserie(lager, filer, anmodning_id: str, indhold_base64: str) -> dict:
    """CSV (base64 af de rå bytes) -> validering med fv-data's orakel -> normaliseret fil + Tidsserie
    (gyldig eller afvist, aldrig aktiv). ``{ok, status, svar, tidsserie_id?, validering_json?}``."""
    if not _uuid(anmodning_id):
        return {"ok": False, "status": "afvist", "svar": "Ugyldigt anmodnings-id."}
    if not isinstance(indhold_base64, str) or not indhold_base64:
        return {"ok": False, "status": "afvist", "svar": "Filen er tom."}
    anm_id = None
    try:
        a, upload = _laes_upload_anmodning(lager, anmodning_id, "upload_tidsserie", indhold_base64)
        if a == "fejl":
            return upload
        anm_id = a["id"]
        with lager.transaktion() as tx:
            v = tx.vaerk(a["vaerk_id"], laas=False)
            params = tx.parametre(v["id"]) if v else []
        if not v:
            raise Afvisning("Værket findes ikke.")
        if v.get("arkiveret"):
            raise Afvisning("Værket er arkiveret.")
        if not (isinstance(v["kode"], str) and _KODE.fullmatch(v["kode"])):
            raise Afvisning("Værkets kode er ugyldig.")
        if not _BASE64.fullmatch(indhold_base64):
            raise Afvisning("Filen er ikke base64-kodet.")
        raa = base64_bytes(indhold_base64)
        if len(raa) > MAKS_UPLOAD_BYTES:
            raise Afvisning(f"Filen er for stor ({len(raa)} bytes; højst {MAKS_UPLOAD_BYTES} gennem appen).")  # heltal: ens i JS
        params = [p for p in params if p["sti"].startswith("units.") or p["sti"].startswith("storage.")]

        r = valider_upload(raa, upload["rolle"], {"tidszone": upload["tidszone"], "tidsstempel": upload["tidsstempel"],
                                                  "enhed": upload["enhed"], "kolonne": upload["kolonne"]}, vaerk_trae(params))
        gyldig = r["status"] == "gyldig" and r["normaliseret"] is not None
        fil = r["normaliseret"].encode("utf-8") if gyldig else None
        sha = sha256_bytes(fil) if fil else None
        relativ = f"fjv/tidsserier/{v['kode']}/{sha}.csv" if sha else None
        sti = f"Files/{relativ}" if relativ else None
        if fil:
            filer.skriv_fil(relativ, fil)

        val = r["validering"]
        json_ = validering_json(val)
        ny_id = lager.ny_id()
        fejl = [f for f in val["fund"] if f["niveau"] == "fejl"]
        advarsler = [f for f in val["fund"] if f["niveau"] == "advarsel"]

        def tekst(k):
            return val[k] if isinstance(val.get(k), str) else None

        def tal(k):
            return val[k] if J.er_tal(val.get(k)) else None

        def dato(k):                                     # `${tekst(k)?.slice(0, 10)}`
            t = tekst(k)
            return J.streng(J.UNDEFINED if t is None else J.skive(t, 0, 10))

        n_raekker = tal("antal_raekker")
        if gyldig:
            svar = (f'"{upload["navn"]}" er gyldig: {J.streng(n_raekker)} timer, {dato("start")}–{dato("slut")}'
                    f'{f"; {len(advarsler)} advarsel(er)" if advarsler else ""}.')
        else:
            svar = f'"{upload["navn"]}" er afvist: {" ".join(f["besked"] for f in fejl)}'
        with lager.transaktion() as tx:
            igen = tx.anmodning(a["id"], laas=True)
            if igen["status"] != "ny":
                return {"ok": igen["status"] == "udfoert", "status": igen["status"], "svar": _nn(igen.get("svar"), "")}
            tx.indsaet_tidsserie({
                "id": ny_id, "vaerk_id": v["id"], "rolle": upload["rolle"], "navn": upload["navn"],
                "filnavn": upload["filnavn"], "sti": sti, "sha256": sha, "oploesning": "1h" if gyldig else None,
                "start": _dt(tekst("start")) if gyldig and tekst("start") else None,
                "slut": _dt(tekst("slut")) if gyldig and tekst("slut") else None,
                "antal_raekker": int(n_raekker) if gyldig and n_raekker is not None else None,
                "antal_huller": int(tal("antal_huller")) if gyldig and tal("antal_huller") is not None else None,
                "enhed": "MW" if gyldig else None, "tidsstempel": upload["tidsstempel"], "tidszone": upload["tidszone"],
                "kilde": "csv", "status": "gyldig" if gyldig else "afvist", "validering_json": json_, "aktiv": False,
                "uploadet_af": a["anmodet_af"],
            })
            tx.saet_anmodning(a["id"], "udfoert" if gyldig else "afvist", J.skive(svar, 0, 2000))
        return {"ok": gyldig, "status": "gyldig" if gyldig else "afvist", "svar": svar, "tidsserie_id": ny_id,
                "validering_json": json_}
    except Afvisning as e:
        if anm_id:
            _afvis_anmodning(lager, anm_id, str(e))
        return {"ok": False, "status": "afvist", "svar": str(e)}
    except Exception as e:                                     # noqa: BLE001
        return {"ok": False, "status": "ny", "svar": teknisk_fejl("uploadTidsserie", e) + " Intet er gemt; prøv igen."}


def hent_tidsserie(lager, filer, tidsserie_id: str, fra: str = "", til: str = "") -> dict:
    """Værdierne kompakt (start + opløsning + liste, None i huller); ``fra``/``til`` = ISO (UTC) eller tom."""
    if not _uuid(tidsserie_id):
        return {"ok": False, "fejl": "Ugyldigt tidsserie-id."}

    def tid(s):
        return J.dato_parse(s) if s else None

    vindue = {"fra": tid(fra), "til": tid(til)}
    if any(x is not None and math.isnan(x) for x in vindue.values()):
        return {"ok": False, "fejl": "fra/til skal være ISO-tidspunkter (UTC) eller tomme."}
    with lager.transaktion() as tx:
        t = tx.tidsserie(tidsserie_id, laas=False)
    if not t:
        return {"ok": False, "fejl": "Tidsserien findes ikke."}
    if t["status"] != "gyldig" or not t.get("sti") or not t.get("sha256"):
        return {"ok": False, "fejl": f'Tidsserien er {t["status"]} og har ingen data at vise.'}
    try:
        # Rækker skrevet før 15:45 (2026-10-16) havde stien uden `Files/` — begge former læses.
        tekst = filer.laes_tekst(re.sub(r"^Files/", "", t["sti"]))
        if tekst is None:
            return {"ok": False, "fejl": "Tidsseriens fil findes ikke i lakehouset."}
        if sha256_hex(tekst) != t["sha256"]:
            return {"ok": False, "fejl": "Tidsseriens fil passer ikke med sin sha256 — den er ændret efter upload."}
        return {"ok": True, "id": _lc(t["id"]), "navn": t["navn"], "rolle": t["rolle"], **taet_raekke(tekst, vindue)}
    except ForLangRaekke as e:
        return {"ok": False, "fejl": str(e), "positioner": e.positioner}
    except Exception as e:                                     # noqa: BLE001
        return {"ok": False, "fejl": teknisk_fejl("hentTidsserie", e)}


# ================================================================== uploadVaerksark


class _VaerksarkDeps:
    """``vaerksark.VaerksarkDeps`` oven på ``BetroetLager`` + ``Filer`` — SQL'en fra ``function_app.ts``' uploadVaerksark."""

    def __init__(self, lager, filer, start_import):
        self.lager, self.filer, self.start_job = lager, filer, start_import

    def laes_anmodning(self, id):
        with self.lager.transaktion() as tx:
            return tx.anmodning(id, laas=False)

    def laes_import(self, id):
        with self.lager.transaktion() as tx:
            return tx.vaerksarkimport(id, laas=False)

    def skriv_fil(self, sti, data):
        self.filer.skriv_fil(sti, data)

    def opret_import(self, a, upload, sti, log):
        with self.lager.transaktion() as tx:
            igen = tx.anmodning(a["id"], laas=True)
            if not igen or igen["status"] != "ny":
                return "allerede_behandlet"
            if not tx.vaerksarkimport(a["id"], laas=True):
                tx.indsaet_import({"id": a["id"], "filnavn": upload["filnavn"], "sti": sti, "status": "koe", "log": log,
                                   "timeslut": upload["timeslut"], "uploadet_af": a["anmodet_af"]})
            if not tx.saet_anmodning(a["id"], "udfoert", f'Værksarket "{upload["filnavn"]}" er modtaget (import {_lc(a["id"])}).'):
                raise RuntimeError("Uventet: anmodningen blev ændret samtidig.")
            return "oprettet"

    def reserver_jobstart(self, id):
        with self.lager.transaktion() as tx:
            return bool(tx.reserver_importstart(id))

    def bind_job(self, id, job_id, log):
        with self.lager.transaktion() as tx:
            tx.bind_importjob(id, job_id, log)

    def afvis_anmodning(self, id, tekst):
        _afvis_anmodning(self.lager, id, tekst)


def upload_vaerksark(lager, filer, start_import, anmodning_id: str, indhold_base64: str) -> dict:
    """xlsx -> ``Files/fjv/uploads/<id>.xlsx`` + Vaerksarkimport(``koe``) + importstart. ``{ok, status, svar, import_id?}``."""
    if not _uuid(anmodning_id):
        return {"ok": False, "status": "afvist", "svar": "Ugyldigt anmodnings-id."}
    if not isinstance(indhold_base64, str) or not indhold_base64:
        return {"ok": False, "status": "afvist", "svar": "Filen er tom."}
    try:
        return behandl_vaerksark(_VaerksarkDeps(lager, filer, start_import), anmodning_id, indhold_base64)
    except Exception as e:                                     # noqa: BLE001
        return {"ok": False, "status": "ny", "svar": teknisk_fejl("uploadVaerksark", e) + " Prøv igen."}


# ================================================================== læsefunktioner

_MAKS_KILDEFIL = 1_000_000
_DMI_KOLONNER = ("temp_mean_past1h", "temp_dry", "temp_mean")
_DMI_OMRAADE = re.compile(r"[a-z]{1,30}", re.ASCII)
_DATO = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", re.ASCII)
_SHA40 = re.compile(r"[0-9a-f]{40}", re.ASCII)


def hent_kilde_yaml(lager, filer, vaerk_id: str) -> dict:
    """Værkets oprindelige case-YAML (``fjv/vaerker/<kode>/kilde.yaml``); kun visning. ``{ok, kode?, tekst?, bytes?, fejl?}``."""
    if not _uuid(vaerk_id):
        return {"ok": False, "fejl": "Ugyldigt værks-id."}
    with lager.transaktion() as tx:
        v = tx.vaerk(vaerk_id, laas=False)
    kode = v.get("kode") if v else None
    if not kode:
        return {"ok": False, "fejl": "Værket findes ikke."}
    if not re.fullmatch(r"[a-z0-9_]+", kode, re.ASCII):
        return {"ok": False, "kode": kode, "fejl": "Værkets kode er ugyldig."}
    try:
        tekst = filer.laes_tekst(f"fjv/vaerker/{kode}/kilde.yaml")
        if tekst is None:
            return {"ok": False, "kode": kode, "fejl": "Der findes ingen kildefil for værket (fx et værk oprettet som kopi i appen)."}
        if J.laengde(tekst) > _MAKS_KILDEFIL:
            return {"ok": False, "kode": kode, "fejl": f"Kildefilen er for stor til visning ({J.laengde(tekst)} tegn)."}
        return {"ok": True, "kode": kode, "tekst": tekst, "bytes": J.laengde(tekst)}
    except Exception as e:                                     # noqa: BLE001
        return {"ok": False, "kode": kode, "fejl": teknisk_fejl("hentKildeYaml", e)}


def hent_dmi_temperatur(lager, filer, omraade: str, fra: str, til: str, kolonne: str = "") -> dict:
    """DMI-temperatur RÅ fra df-data (motorens ``data_commit``): ``{ok, data_commit, kolonne, tider, vaerdier}``.
    ``fra``/``til`` = datoer (UTC, begge med), højst 366 døgn."""
    if not isinstance(omraade, str) or not _DMI_OMRAADE.fullmatch(omraade):
        return {"ok": False, "fejl": "Ugyldigt DMI-område."}
    kol = kolonne or "temp_mean_past1h"
    if kol not in _DMI_KOLONNER:
        return {"ok": False, "fejl": f'Kolonnen "{kol}" kan ikke hentes (tilladt: {", ".join(_DMI_KOLONNER)}).'}
    if not (isinstance(fra, str) and _DATO.fullmatch(fra)) or not (isinstance(til, str) and _DATO.fullmatch(til)):
        return {"ok": False, "fejl": "fra og til skal være datoer (ÅÅÅÅ-MM-DD)."}
    a, b = J.dato_parse(f"{fra}T00:00:00Z"), J.dato_parse(f"{til}T23:00:00Z")
    if not b >= a:
        return {"ok": False, "fejl": "til ligger før fra."}
    if (b - a) / 86_400_000 > 366:
        return {"ok": False, "fejl": "Højst 366 døgn pr. kald."}
    with lager.transaktion() as tx:
        m = tx.motor()
    data_commit = (m or {}).get("data_commit")
    if not data_commit or not _SHA40.fullmatch(data_commit):
        return {"ok": False, "fejl": "Regnemotoren har ikke registreret sin dataversion endnu."}
    try:
        tider, vaerdier = [], []
        aar_fra, aar_til = int(J.iso(a)[:4]), int(J.iso(b)[:4])
        for aar in range(aar_fra, aar_til + 1):
            tekst = filer.laes_tekst(f"fjv/df-data/{data_commit}/dmi/{omraade}_{aar}.csv")
            if tekst is None:
                continue
            linjer = re.split(r"\r?\n", tekst)
            hoved = linjer[0].split(",")
            if "hour_utc" not in hoved or kol not in hoved:
                return {"ok": False, "fejl": f"DMI-filen for {omraade} {aar} mangler hour_utc eller {kol}."}
            ti, vi = hoved.index("hour_utc"), hoved.index(kol)
            for l in linjer[1:]:
                if not l:
                    continue
                f = l.split(",")
                if ti >= len(f):
                    raise TypeError("Cannot read properties of undefined (reading 'replace')")   # som TS
                ft = f[ti]
                t = J.dato_parse(f"{ft.replace(' ', 'T', 1)}Z")
                if not (t >= a and t <= b):
                    continue
                fv = f[vi] if vi < len(f) else None
                v = None if fv == "" else (J.tal(fv) if fv is not None else math.nan)
                tider.append(ft)
                vaerdier.append(v if v is not None and math.isfinite(v) else None)
        if not tider:
            return {"ok": False, "data_commit": data_commit, "fejl": f"Ingen DMI-data for {omraade} i {fra}–{til}."}
        return {"ok": True, "data_commit": data_commit, "kolonne": kol, "tider": tider, "vaerdier": vaerdier}
    except Exception as e:                                     # noqa: BLE001
        return {"ok": False, "fejl": teknisk_fejl("hentDmiTemperatur", e)}


# ================================================================== afstem

#: En kørsel erklæres først død, når solver-låsen er fri OG den ikke har meldt sig i så mange minutter (motor.ts).
DOED_EFTER_MIN = 5

#: ``fejlbesked`` for en død kørsel, efter den status den stod i (motor.ts markérDøde) — samme tekster i begge udgaver.
DOEDE_TEKSTER = {
    "indlaeser": "Arbejderen stoppede under indlæsningen af resultaterne, uden at afslutte. Kørslen kan bestilles igen.",
    "startet": "Forældet reservation fra før arbejderprotokol v2.2 — ingen arbejder tog kørslen. Den kan bestilles igen.",
    "koerer": "Arbejderen stoppede uden at afslutte kørslen (ingen arbejder holder solver-låsen). Den kan bestilles igen.",
}
DOED_ANNULLERET_TILLAEG = " (Annullering var anmodet.)"


def afstem(marker_doede, start_arbejder) -> dict:
    """``marker_doede() -> [{id, status}] | None`` (None = en arbejder holder låsen) er lagerets (låsen er
    platformens); her er svarets form. ``{tjekket, aendret, arbejder}``."""
    doede = marker_doede()
    aendret = [f"{_lc(d['id'])}: fejl ({d['status']} uden levende arbejder)" for d in (doede or [])]
    return {"tjekket": 0 if doede is None else len(doede), "aendret": aendret, "arbejder": start_arbejder()}
