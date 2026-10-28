"""``POST /api/fn/<navn>`` — de betroede funktioner med præcis ``AppFunctionsSchema``'s navne, input og output.

* Alle forløb undtagen ``skemaInfo`` er fv-port's (``logik.tjenester``, bundet af TS-vektorerne), kørt mod
  ``betroet_lager.SqlBetroetLager`` + ``LokaleFiler``. ``afstem`` får låsen og de døde kørsler fra ``motor.py``.
* ``skemaInfo`` er en ren diagnose-læsning (``laesefunktioner.py``).

Ukendte input-felter afvises ikke (Rayfin ignorerer dem heller ikke — de har ingen betydning), men et
manglende påkrævet felt giver ``ugyldig``. Identiteten i bestillinger og anmodninger er den, data-API'et
verificerede ved create (``bestilt_af``/``anmodet_af`` = sessionens bruger) — funktionerne kender den ikke.
"""

from __future__ import annotations

from .data_api import Fejl
from .database import betroet_mutex

#: navn -> påkrævede inputfelter (AppFunctionsSchema)
INPUT = {
    "startBestilling": ("bestillingId",),
    "udfoerAendring": ("anmodningId",),
    "afstem": (),
    "annullerKoersel": ("koerselId",),
    "hentKildeYaml": ("vaerkId",),
    "uploadTidsserie": ("anmodningId", "indholdBase64"),
    "hentTidsserie": ("tidsserieId",),
    "uploadVaerksark": ("anmodningId", "indholdBase64"),
    "hentDmiTemperatur": ("omraade", "fra", "til"),
    "skemaInfo": (),
    "importerArkiv": ("anmodningId", "del"),          # runde 13: logik/arkiv.py
    "arkivTal": ("scenarieIder",),                    # runde 13b (K10-F4): rækketal, kun læsning
}


def _tjenester(app):
    from . import betroet_lager as BL
    return BL.tjenester(app)


def kald(app, navn: str, inp, bruger: str):
    from . import laesefunktioner as L
    if navn not in INPUT:
        raise Fejl(404, "findes_ikke", f"ukendt funktion {navn!r}")
    if not isinstance(inp, dict):
        raise Fejl(400, "ugyldig", "input skal være et objekt")
    for f in INPUT[navn]:
        if f not in inp:
            raise Fejl(400, "ugyldig", f"{navn} mangler {f}")
    if navn == "skemaInfo":
        return L.skema_info(app)
    t = _tjenester(app)
    if navn == "afstem":
        return t.afstem()
    if navn == "hentKildeYaml":
        return t.hent_kilde_yaml(inp["vaerkId"])
    if navn == "hentDmiTemperatur":
        return t.hent_dmi_temperatur(inp["omraade"], inp["fra"], inp["til"], inp.get("kolonne") or "")
    if navn == "arkivTal":
        return t.arkiv_tal(inp["scenarieIder"])
    if navn == "hentTidsserie":
        return t.hent_tidsserie(inp["tidsserieId"], inp.get("fra") or "", inp.get("til") or "")
    with betroet_mutex:
        if navn == "startBestilling":
            return t.start_bestilling(inp["bestillingId"])
        if navn == "udfoerAendring":
            return t.udfoer_aendring(inp["anmodningId"])
        if navn == "annullerKoersel":
            return t.annuller_koersel(inp["koerselId"])
        if navn == "uploadTidsserie":
            return t.upload_tidsserie(inp["anmodningId"], inp["indholdBase64"])
        if navn == "uploadVaerksark":
            return t.upload_vaerksark(inp["anmodningId"], inp["indholdBase64"], inp.get("basisBase64"))
        if navn == "importerArkiv":
            return t.importer_arkiv(inp["anmodningId"], inp["del"])
    raise Fejl(500, "teknisk", f"{navn} er ikke koblet på")
