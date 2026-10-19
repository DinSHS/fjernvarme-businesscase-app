"""Lager-grænsefladen: hvad arbejderen og værksark-importen kræver af en database (brief 21).

Den samme arbejder skal kunne køre mod appens Fabric SQL-database (``db.py``) og mod en lokal
database (community-udgaven, SQLAlchemy). Alt databasespecifikt ligger bag fire protokoller;
tilstandsmaskinen (KONTRAKT §6/§6c), frysningen og publiceringens regler ligger ÉT sted
(``koersel.koer_en``, ``arbejder.arbejd``, ``vaerksark.importer_et``) og bruges af begge.

=========================  ====================================  ==============================
Protokol                   Fabric                                Hukommelse (kørbar spec)
=========================  ====================================  ==============================
``Laas``                   ``db.SolverLaas`` (SQL-applock)       ``lager_minne.MinneLaas``
``KoerselLager``           ``db.SqlLager``                       ``lager_minne.MinneKoerselLager``
``KoeLager``               ``db.SqlKoe``                         ``lager_minne.MinneKoe``
``ImportLager``            ``vaerksark.SqlImportLager``          ``lager_minne.MinneImportLager``
=========================  ====================================  ==============================

Semantik, som en ny implementering SKAL overholde (testet i ``tests/test_lager.py`` mod
hukommelsesudgaven og - via stubbe - mod Fabric-udgaven):

* **Status.** ``Koersel.status`` ∈ {koe, startet, koerer, indlaeser, faerdig, fejl, annulleret}.
  Alle skift er betingede: ``skift(fra, til)`` lykkes kun, hvis rækken står i ``fra`` OG
  ``arbejder_id`` er denne arbejders, og - for alt andet end ``fejl``/``annulleret`` - ikke
  har ``annuller_anmodet``. Returnerer True præcis når én række blev ændret.
* **Tidsfelter** (``startet``, ``afsluttet``, ``hjerteslag``) sættes til lagerets EGEN tid
  (UTC); værdien, kalderen giver, ignoreres. Andre felter: kun ``db.KOERSEL_FELTER``.
* **Låsen** er global (én solver ad gangen, §6c) og ejet af processen: dør processen, er
  låsen fri. ``tabt`` er et ``threading.Event``, der sættes én gang, når låsen ikke længere
  kan bekræftes; ``ved_tab(f)`` kalder ``f`` straks, hvis den allerede er sat.
* **Kø.** Overtagelse (``koe|startet -> koerer``) må kun ske, mens låsen holdes, FIFO efter
  serverens modtagetid, og sætter ``arbejder_id``, ``startet``, ``hjerteslag`` og ``forsoeg+1``.
  En død arbejder er en anden arbejders ``koerer``/``indlaeser``-kørsel uden hjerteslag i
  ``db.OVERTAGELSE_S`` sekunder; ``ryd_doede`` sætter dem ``fejl``.
* **Publicering** (``KoerselLager.publicer``): resultatrækker OG ``faerdig`` i én transaktion,
  kun hvis rækken står i ``indlaeser``, er vores og ikke annulleret - ellers ``Afbrudt``.
* **Import.** ``tag_import`` = betinget ``koe -> koerer`` (ældste efter ``uploadet``, eller et
  bestemt id); ``gem_vaerk`` = værk + parametre + log + tidsserier + ``faerdig`` i én
  transaktion; ``saet_fejl`` kun fra ``koerer``.

Filer (modelkode, df-data, tidsserier, kørslernes output) ligger under ``konstanter.FILES``,
der læses fra miljøvariablen ``FJV_FILES`` ved import: sæt den, før ``fjv`` importeres.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class Laas(Protocol):
    tabt: Any                                      # threading.Event

    def tag(self) -> bool: ...
    def holdt(self) -> bool: ...
    def frigiv(self) -> None: ...
    def start_vagt(self, interval_s: float | None = None) -> None: ...
    def ved_tab(self, funktion) -> None: ...
    def afmeld(self, funktion) -> None: ...


@runtime_checkable
class KoerselLager(Protocol):
    """Én overtaget kørsel - det ``koersel.koer_en`` kalder."""

    def skift(self, fra: str, til: str, **felter) -> bool: ...
    def saet(self, **felter) -> None: ...
    def hjerteslag(self) -> None: ...
    def er_annulleret(self) -> bool: ...
    @property
    def annulleret(self) -> bool: ...
    @property
    def tabt(self) -> bool: ...
    @property
    def stop(self) -> bool: ...
    def annuller_selv(self) -> bool: ...
    def publicer(self, noegletal: list, maaneder: list, timer: list,
                 slutfelter: dict | None = None) -> dict: ...
    def tidsserie_sti(self, tidsserie_id: str) -> str | None: ...


@runtime_checkable
class KoeLager(Protocol):
    """Jobbet - det ``arbejder.arbejd`` kalder."""

    def laas(self) -> Laas: ...
    def vent_overtagelse(self, mig: str, laas: Laas, rap=None) -> bool: ...
    def ryd_doede(self, mig: str, laas: Laas) -> list: ...
    def overtag_bestemt(self, koersel_id: str, mig: str, laas: Laas) -> bool: ...
    def overtag_naeste(self, mig: str, laas: Laas) -> str | None: ...
    def grund(self) -> str: ...
    def laes_input(self, koersel_id: str) -> tuple[list, dict]: ...
    def koersel_lager(self, koersel_id: str, mig: str, laas: Laas) -> KoerselLager: ...
    def skriv_motor_pins(self, model_commit: str, data_commit: str) -> bool: ...


@runtime_checkable
class ImportLager(Protocol):
    """Værksark-importen - det ``vaerksark.koer_importer``/``importer_et`` kalder."""

    def ryd_doede_importer(self) -> int: ...
    def tag_import(self, import_id: str | None) -> dict | None: ...
    def saet_fejl(self, import_id: str, besked: str) -> bool: ...
    def gem_vaerk(self, imp: dict, k, model_sha: str, scriptlog: str,
                  files: str | None = None) -> dict: ...
    def motor_pins(self) -> dict: ...


def mangler(obj, protokol) -> list[str]:
    """De medlemmer af ``protokol``, ``obj`` ikke har (tom liste = overholder formen)."""
    navne = [n for n in dir(protokol) if not n.startswith("_")]
    navne += list(getattr(protokol, "__annotations__", {}))
    return sorted({n for n in navne if not hasattr(obj, n)})
