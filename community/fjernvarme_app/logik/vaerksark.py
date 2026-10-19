"""uploadVaerksark's forløb (KONTRAKT §6d) — tro port af ``app/rayfin/functions/src/vaerksark.ts`` (K5-F3/F4).

Forløbet taler kun med ``deps`` (``VaerksarkDeps``): læs anmodning/import, skriv fil, opret import i én
transaktion, reservér/bind jobstart, afvis anmodning. Fabric giver SQL + OneLake + jobs-API; community giver
SQLAlchemy + lokal mappe + lokal importkø. Forløbet — og dermed rækkefølgen af kald — er det samme; vektorerne
(``behandl_vaerksark.json``) optager TS' kaldsspor, og Python skal give det samme spor.

K5-F4 (fra TS-filens hoved): importens id ER anmodningens id; anmodningen genlæses låst, før importen oprettes;
jobstarten reserveres betinget, og en fejlet start frigiver reservationen, så samme kald genoptager den.
"""

from __future__ import annotations

import re
from typing import Protocol

from . import jsjson as J
from .regler import Afvisning, laes_anmodning
from .tidsserie import MAKS_VAERKSARK_BYTES, base64_bytes, sha256_hex
from .zipkontrol import tjek_zip

__all__ = ["VaerksarkDeps", "behandl_vaerksark"]

_BASE64 = re.compile(r"[A-Za-z0-9+/]+={0,2}", re.ASCII)


class VaerksarkDeps(Protocol):
    def laes_anmodning(self, id: str) -> dict | None: ...
    """Aendringsanmodning: ``{id, status, svar, aendringer_json, anmodet_af}`` eller None."""

    def laes_import(self, id: str) -> dict | None: ...
    """Vaerksarkimport: ``{id, status, fabric_job_id, log}`` eller None."""

    def skriv_fil(self, files_relativ_sti: str, data: bytes) -> None: ...

    def opret_import(self, a: dict, upload: dict, sti: str, log: str | None) -> str: ...
    """I ÉN transaktion: lås og genlæs anmodningen; er den stadig ``ny``, opret importen (id = anmodningens)
    og sæt anmodningen ``udfoert``. Returnerer ``"oprettet"`` eller ``"allerede_behandlet"``."""

    def reserver_jobstart(self, import_id: str) -> bool: ...
    """Betinget: kun hvis importen er ``koe`` uden (eller med en forældet) reservation."""

    def bind_job(self, import_id: str, job_id: str | None, log: str | None) -> None: ...

    #: ``None`` = importnotebooken/-køen findes ikke; ellers ``f(import_id) -> {ok, jobId?, status, fejl?}``.
    start_job: object

    def afvis_anmodning(self, id: str, tekst: str) -> None: ...


_TEKST = {"koe": None, "koerer": "Værksarket importeres.", "faerdig": "Værksarket er importeret.",
          "fejl": "Importen fejlede — se loggen."}


def behandl_vaerksark(d, anmodning_id: str, indhold_base64: str) -> dict:
    """Returnerer ``{ok, status, svar[, import_id]}`` som TS' ``Vaerksarksvar``."""
    a = d.laes_anmodning(anmodning_id)
    if not a:
        return {"ok": False, "status": "afvist", "svar": "Anmodningen findes ikke."}
    if a["status"] == "afvist":
        return {"ok": False, "status": "afvist", "svar": "" if J.nullish(a.get("svar")) else a["svar"]}
    try:
        x = laes_anmodning(a["aendringer_json"])
        if x["type"] != "upload_vaerksark":
            raise Afvisning("Anmodningen er ikke en værksark-upload.")
        upload = x["upload"]
        if sha256_hex(indhold_base64) != upload["sha256"]:
            raise Afvisning("Filens indhold passer ikke med anmodningens sha256 — upload filen igen.")
    except Afvisning as e:
        return {"ok": False, "status": "afvist", "svar": str(e)}

    id_ = a["id"].lower()
    if a["status"] == "ny":
        try:
            if not _BASE64.fullmatch(indhold_base64):
                raise Afvisning("Filen er ikke base64-kodet.")
            data = base64_bytes(indhold_base64)
            if len(data) > MAKS_VAERKSARK_BYTES:
                raise Afvisning(f"Værksarket er for stort ({J.js_str(J.rund(len(data) / 1000))} kB; højst "
                                f"{J.js_str(MAKS_VAERKSARK_BYTES / 1000)} kB).")
            if data[:4] != b"PK\x03\x04":
                raise Afvisning("Filen er ikke et Excel-ark (.xlsx).")
            z = tjek_zip(data)
            if not z["ok"]:
                raise Afvisning(z["fejl"])
            sti = f"Files/fjv/uploads/{id_}.xlsx"
            # Samme anmodning = samme sti og samme indhold (sha256 er bundet), så et samtidigt kald skriver det samme.
            d.skriv_fil(sti[len("Files/"):], data)
            d.opret_import(a, upload, sti, None if d.start_job else
                           "Importnotebooken fjv_importer_vaerksark er ikke deployet endnu; importen venter i kø.")
        except Afvisning as e:
            d.afvis_anmodning(a["id"], str(e))
            return {"ok": False, "status": "afvist", "svar": str(e)}

    # Behandlet (nu eller tidligere): find importen og genoptag en manglende jobstart.
    imp = d.laes_import(id_)
    if not imp:
        return {"ok": a["status"] == "udfoert", "status": a["status"], "svar": "" if J.nullish(a.get("svar")) else a["svar"]}
    if imp["status"] == "koe" and d.start_job and d.reserver_jobstart(id_):
        job = d.start_job(id_)
        if job.get("ok"):
            jid = job.get("jobId")
            d.bind_job(id_, "ukendt" if J.nullish(jid) else jid, None)
            return {"ok": True, "status": "koe", "svar": "Værksarket importeres nu.", "import_id": id_}
        fejl = job.get("fejl")
        log = J.skive(f"Importen kunne ikke startes (HTTP {J.streng(job.get('status'))}); prøv at uploade igen for at "
                      f"genoptage. {'' if J.nullish(fejl) else fejl}", 0, 4000)
        d.bind_job(id_, None, log)
        return {"ok": False, "status": "koe",
                "svar": f"Værksarket er gemt, men importen kunne ikke startes (HTTP {J.streng(job.get('status'))}). "
                        f"Prøv igen — samme fil genoptager importen.", "import_id": id_}
    tekst = dict(_TEKST)
    tekst["koe"] = "Værksarket importeres." if imp.get("fabric_job_id") else "Værksarket venter i kø."
    svar = tekst.get(imp["status"]) or imp["status"]
    return {"ok": imp["status"] != "fejl", "status": imp["status"], "svar": svar, "import_id": id_}
