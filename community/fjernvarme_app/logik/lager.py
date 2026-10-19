"""Hvad de betroede forløb (``tjenester``) kræver af en database — Functions-siden af brief 21.

``app/rayfin/functions/src/function_app.ts`` taler SQL direkte; her er hvert af dens SQL-udsagn et verbum på
``Transaktion``. Fabric-udgaven er TS-koden selv; community-udgaven implementerer protokollen mod SQLAlchemy
(fv-server). ``lager_minne.MinneLager`` er den kørbare specifikation, og ``tests/test_tjenester.py`` kan køres mod
enhver implementering (``FJV_BETROET_LAGER=modul:fabrik``).

(Arbejderens og importens lager — ``fjv/lager.py``'s fire protokoller — er en anden flade og ejes af fv-fabric3.)

Semantik, en implementering SKAL overholde
=========================================

* **Én indgang.** ``lager.transaktion()`` er en context manager: commit ved normal afslutning, rollback ved en
  undtagelse (også ``Afvisning``). Et udsagn, TS kører uden transaktion (autocommit), kører forløbet i en kort
  transaktion for sig.
* **Låse.** ``laas=True`` betyder: rækken/rækkerne (og, for en søgning, intervallet) er låst for skrivning til
  transaktionens slutning — som ``WITH (UPDLOCK, HOLDLOCK)``. SQLite: ``BEGIN IMMEDIATE`` (én skriver ad gangen)
  opfylder det for alle verber. ``laas_kvote(email)`` serialiserer bestillinger fra samme bruger (på tværs af værker)
  til transaktionens slutning (``sp_getapplock … @LockOwner='Transaction'``).
* **Betingede skrivninger** returnerer antal ramte rækker / ``bool``; forløbet afgør, hvad 0 betyder.
  ``saet_anmodning`` skriver KUN, hvis anmodningen står i ``ny``.
* **Servertid.** ``modtaget``, ``oprettet``, ``aendret``, ``tidspunkt``, ``uploadet``, ``afsluttet`` og
  ``annuller_anmodet`` sætter lageret selv (UTC); værdier fra forløbet ignoreres. ``modtaget`` er køens
  sorteringsnøgle (KONTRAKT §6c) og skal være monoton nok til FIFO.
* **Unikke nøgler.** En dublet ``Koersel.bestilling_id`` eller ``Vaerk.kode`` giver ``UnikBrud`` (ikke en
  vilkårlig databasefejl) — forløbet bruger den som "en anden kom først".
* **Rækker** er dicts med databasens kolonnenavne (``row._mapping`` duer). uuid'er sammenlignes uden hensyn til
  store/små bogstaver; forløbet svarer altid med små. Datetime-felter: ``datetime`` (UTC) eller ISO-tekst.
  Decimaler (``mip_rel_gap`` …) må komme som ``Decimal``; forløbet laver dem til tal.
"""

from __future__ import annotations

from contextlib import AbstractContextManager
from typing import Protocol, runtime_checkable

__all__ = ["UnikBrud", "Transaktion", "BetroetLager", "Filer"]


class UnikBrud(Exception):
    """En unik nøgle blev brudt (SQL Server 2627/2601, SQLite UNIQUE constraint)."""


@runtime_checkable
class Transaktion(Protocol):
    # -------------------------------------------------- bestilling (startBestilling)
    def bestilling(self, id: str) -> dict | None: ...
    """Bestilling: id, scenarie_id, bestilt_af, bestilt."""
    def laas_kvote(self, email: str) -> None: ...
    def scenarie(self, id: str, laas: bool) -> dict | None: ...
    """Scenarie: id, vaerk_id, arkiveret, periode_start, periode_slut, med_balancering, balancing_method,
    mip_rel_gap, mip_abs_gap, tidsgraense_s, ekstra_flag, heat_csv."""
    def vaerk(self, id: str, laas: bool) -> dict | None: ...
    """Vaerk: id, kode, navn, revision, arkiveret."""
    def antal_i_koe(self, bestilt_af: str) -> int: ...
    """Antal Koersel med denne ``bestilt_af`` og status ``koe`` (alle værker)."""
    def parametre(self, vaerk_id: str) -> list[dict]: ...
    """Alle VaerkParameter for værket: sti, vaerdi_json, sektion, objekt, kommentar, bekraeft, raekkefoelge."""
    def scenarie_aendringer(self, scenarie_id: str, laas: bool) -> list[dict]: ...
    """ScenarieAendring: type, sti, vaerdi_json, raekkefoelge."""
    def motor(self) -> dict | None: ...
    """Motor-rækken (fast id): model_commit, data_commit."""
    def gyldige_tidsserier(self, vaerk_id: str, laas: bool) -> list[dict]: ...
    """Tidsserie med status ``gyldig``: id, rolle, navn, sha256, sti, oploesning, start, slut, aktiv, validering_json."""
    def indsaet_koersel(self, raekke: dict) -> None: ...
    """Lageret sætter ``modtaget``. ``UnikBrud`` ved en dublet ``bestilling_id``."""
    def indsaet_input(self, koersel_id: str, raekker: list[dict]) -> None: ...
    """KoerselInput: én række pr. ``{kilde, sti, vaerdi_json}`` med nyt id."""
    def koersel_for_bestilling(self, bestilling_id: str) -> dict | None: ...
    """Koersel: id, status."""

    # -------------------------------------------------- kørsler (annullerKoersel)
    def koersel(self, id: str) -> dict | None: ...
    """Koersel: id, status, annuller_anmodet."""
    def annuller_i_koe(self, id: str, status: str) -> bool: ...
    """``status='annulleret', afsluttet=nu, fase='Annulleret før start' WHERE id AND status=@status``."""
    def anmod_annullering(self, id: str, status: str) -> bool: ...
    """``annuller_anmodet=nu, fase='Annullering anmodet' WHERE id AND status=@status AND annuller_anmodet IS NULL``."""

    # -------------------------------------------------- anmodninger (udfoerAendring, uploads)
    def anmodning(self, id: str, laas: bool) -> dict | None: ...
    """Aendringsanmodning: id, vaerk_id, forventet_revision, aendringer_json, anmodet_af, status, svar."""
    def nye_anmodninger(self, anmodet_af: str, indeholder: str, laas: bool) -> list[dict]: ...
    """Anmodninger fra ``anmodet_af`` med status ``ny``, hvis ``aendringer_json`` indeholder teksten (uden hensyn til
    store/små bogstaver; et forfilter — forløbet læser hver række). Felter: id, aendringer_json."""
    def saet_anmodning(self, id: str, status: str, svar: str) -> bool: ...
    """``status, svar WHERE id AND status='ny'``."""

    # -------------------------------------------------- værker
    def kode_findes(self, kode: str, laas: bool) -> bool: ...
    def indsaet_vaerk(self, raekke: dict) -> None: ...
    """Vaerk: id, kode, navn, beskrivelse, kilde, kopieret_fra_id, revision, arkiveret, oprettet_af, aendret_af.
    Lageret sætter oprettet/aendret. ``UnikBrud`` ved en dublet kode."""
    def indsaet_parametre(self, vaerk_id: str, blade: list[dict], aendret_af: str) -> None: ...
    """VaerkParameter med nyt id: sti, vaerdi_json, sektion, objekt, kommentar, bekraeft, raekkefoelge."""
    def indsaet_log(self, vaerk_id: str, raekker: list[dict]) -> None: ...
    """Aendringslog med nyt id: revision, sti, handling, gammel_json, ny_json, aendret_af, anmodning_id."""
    def antal_parametre(self, vaerk_id: str) -> int: ...
    def ret_parameter(self, vaerk_id: str, sti: str, ny_json: str, aendret_af: str) -> int: ...
    def slet_parameter(self, vaerk_id: str, sti: str) -> int: ...
    def saet_revision(self, vaerk_id: str, gammel: int, ny: int, aendret_af: str) -> bool: ...
    """``revision=@ny, aendret_af, aendret=nu WHERE id AND revision=@gammel``."""

    # -------------------------------------------------- tidsserier
    def tidsserie(self, id: str, laas: bool) -> dict | None: ...
    """Tidsserie: id, vaerk_id, rolle, navn, sti, sha256, oploesning, status."""
    def laas_tidsserier(self, vaerk_id: str, rolle: str) -> None: ...
    def deaktiver_andre(self, vaerk_id: str, rolle: str, undtagen_id: str) -> None: ...
    def saet_aktiv(self, tidsserie_id: str, aktiv: bool) -> None: ...
    def indsaet_tidsserie(self, raekke: dict) -> None: ...
    """Tidsserie (alle kolonner undtagen ``uploadet``, som lageret sætter)."""

    # -------------------------------------------------- værksark-importer
    def vaerksarkimport(self, id: str, laas: bool) -> dict | None: ...
    """Vaerksarkimport: id, status, fabric_job_id, log."""
    def indsaet_import(self, raekke: dict) -> None: ...
    """Vaerksarkimport: id, filnavn, sti, status, log, timeslut, uploadet_af (lageret sætter uploadet)."""
    def reserver_importstart(self, id: str) -> bool: ...
    """Betinget: kun hvis importen står i ``koe`` og ``fabric_job_id`` er tom eller en reservation ældre end 5 min.
    Sætter ``fabric_job_id = 'reserveret:<servertid ISO>'``."""
    def bind_importjob(self, id: str, job_id: str | None, log: str | None) -> None: ...
    """``fabric_job_id=@job, log=COALESCE(@log, log) WHERE id AND fabric_job_id LIKE 'reserveret:%'``."""


class BetroetLager(Protocol):
    def transaktion(self) -> AbstractContextManager[Transaktion]: ...
    def ny_id(self) -> str: ...
    """Et nyt uuid (små bogstaver)."""


class Filer(Protocol):
    """Lakehousets ``Files/`` (Fabric) eller en lokal mappe (community). Stier er relative til ``Files/``."""

    def skriv_fil(self, files_relativ: str, data: bytes) -> None: ...
    def laes_tekst(self, files_relativ: str) -> str | None: ...
    """UTF-8-teksten, eller None hvis filen ikke findes."""
