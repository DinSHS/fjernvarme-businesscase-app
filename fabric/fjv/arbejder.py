"""Kø-arbejderen (KONTRAKT §6c) uafhængig af databasen - flyttet ud af ``db.koer_notebook``.

``arbejd(koe, RAP, mig=…)`` er hele jobbets forløb under den globale lås: tag låsen (optaget =
stop uden at røre nogen række), vent til ingen anden kørsel har et friskt hjerteslag, ryd døde,
tag en bestemt kørsel og derefter køen FIFO, frigiv. ``koe`` er en ``lager.KoeLager``: i
Fabric ``db.SqlKoe``, lokalt community-udgavens. Rækkefølgen og rapportens trin er de samme
som før flytningen (testet i ``tests/test_lager.py``).
"""

from __future__ import annotations

from . import konstanter as K

MAX_KOERSLER_PR_JOB = 25

#: Sluttilstande, der gør jobbet ``ok`` (en modelfejl er kørslens, ikke arbejderens).
_SLUT = ("faerdig", "annulleret", "afbrudt", "fejl")


def arbejd(koe, RAP, *, mig: str, tilstand: dict | None = None, koersel_id: str = "",
           oprettede: bool = False, test_doed_efter_s: float = 0,
           maks: int = MAX_KOERSLER_PR_JOB) -> dict:
    """Ét arbejderjob. ``tilstand`` (fra kalderen) udvides og returneres.

    ``oprettede``: kalderen har lige lagt kørsler i køen (manuel vej / batch) - kun til
    advarslen, hvis låsen er optaget."""
    from .koersel import Afbrudt, koer_en
    from .rapport import Rapport

    tilstand = tilstand if tilstand is not None else {"arbejder_id": mig, "koersler": [], "ok": True}
    tilstand.setdefault("koersler", [])
    laas = koe.laas()
    if not laas.tag():
        tilstand["laas"] = "optaget"
        RAP.trin("laas", "optaget - en anden arbejder kører; afslutter uden at røre rækker")
        if oprettede:
            RAP.advar("de oprettede kørsler ligger i køen; den aktive arbejder tager dem")
        return tilstand
    tilstand["laas"] = "taget"
    laas.start_vagt()
    RAP.trin("laas", "fjv_solver taget")
    try:
        if koe.skriv_motor_pins(K.MODEL_COMMIT, K.DF_DATA_SHA):
            RAP.trin("motor_pins", {"model_commit": K.MODEL_COMMIT, "data_commit": K.DF_DATA_SHA})
    except Exception as e:                    # visning; må ikke stoppe køen
        RAP.advar(f"kunne ikke skrive Motor-pins: {e}")

    def koer(kid: str):
        kid = kid.lower()
        raekker, k = koe.laes_input(kid)
        kr = Rapport("fjv_koer_scenarie",
                     sti=f"{K.FILES}/{K.REL_KOERSLER}/{kid}/rapport.json")
        kr["arbejder_id"] = mig
        lager = koe.koersel_lager(kid, mig, laas)
        lager.test_doed_efter_s = test_doed_efter_s      # kun live-test (0 = fra)
        try:
            res = koer_en(raekker, kid, lager, kr, forventet_hash=k["input_hash"])
        except Afbrudt as e:
            if lager.annulleret and not lager.tabt and lager.annuller_selv():
                res = {"koersel_id": kid, "status": "annulleret", "besked": str(e)}
            else:
                res = {"koersel_id": kid, "status": "afbrudt",
                       "besked": f"{e} (ejerskab tabt: {lager.tabt})"}
            kr.advar(str(e))
            kr.skriv()
        kort = {x: res.get(x) for x in ("koersel_id", "status", "objektiv_dkk", "opnaaet_gap",
                                        "fejlbesked", "besked", "koeretid_s")}
        tilstand["koersler"].append(kort)
        RAP.trin("koersel", kort)
        return lager

    try:
        if not koe.vent_overtagelse(mig, laas, RAP):
            tilstand["koe_stop"] = "anden kørsel har stadig friskt hjerteslag (eller låsen tabt)"
            RAP.advar(tilstand["koe_stop"] + " - starter intet")
            return tilstand
        doede = koe.ryd_doede(mig, laas)
        if doede:
            tilstand["ryddet_doede"] = doede
            RAP.trin("ryddet_doede", doede)
        koersel_id = (koersel_id or "").strip().lower()
        if koersel_id:
            if koe.overtag_bestemt(koersel_id, mig, laas):
                koer(koersel_id)
            else:
                RAP.advar(f"kørslen {koersel_id} var ikke i 'koe' (eller er annulleret) - "
                          "den er allerede kørt eller taget fra køen")
        for _ in range(maks):
            kid = koe.overtag_naeste(mig, laas)
            if not kid:
                tilstand["koe_stop"] = koe.grund() or "ukendt"
                RAP.trin("koe_stop", tilstand["koe_stop"])
                break
            lager = koer(kid)
            if lager.tabt and not laas.holdt():
                RAP.advar("fjv_solver-låsen er tabt - stopper arbejderen")
                tilstand["koe_stop"] = "låsen tabt"
                break
        else:
            RAP.advar(f"stoppede efter {maks} kørsler; resten venter i køen")
    finally:
        laas.frigiv()
    tilstand["ok"] = all(k["status"] in _SLUT for k in tilstand["koersler"])
    return tilstand
