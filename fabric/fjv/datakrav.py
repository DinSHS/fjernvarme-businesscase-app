"""fv-data's regler for tidsserier — ét orakel, ikke en kopi (``viden/data_krav.json``).

``viden/vaerktoej/valider_tidsserie.py`` (fv-data, kun stdlib) er referencen for appens
``uploadTidsserie`` OG for motoren: samme input skal give samme status, fundkoder og
normaliserede bytes. Motoren genimplementerer derfor ikke reglerne — den bruger oraklet:

* ``valider`` ved registrering af repoets filer og ved værksark-importen;
* ``tjek_koersel`` i arbejderen, med kørslens effektive periode og case (dækning,
  kapacitet), lige før modellen startes.

Hvor filerne ligger: i Fabric kopierer ``deploy.py kode`` begge ind i motorpakken
(``Files/fjv/motor/fjv/valider_tidsserie.py`` + ``data_krav.json``), så kørslens
kodeaftryk også dækker reglerne. Lokalt læses de direkte fra ``viden/``.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

HER = Path(__file__).resolve().parent
_KANDIDATER = [HER, HER.parent.parent / "viden" / "vaerktoej"]
_MODUL = None
_KRAV = None


def _find(navn: str, mapper) -> Path:
    for m in mapper:
        p = m / navn
        if p.is_file():
            return p
    raise FileNotFoundError(f"{navn} findes hverken i motorpakken eller i viden/ "
                            f"(søgt: {', '.join(str(m) for m in mapper)})")


def orakel():
    """``valider_tidsserie`` som modul (indlæst efter sti, ikke som pakke-import)."""
    global _MODUL
    if _MODUL is None:
        sti = _find("valider_tidsserie.py", _KANDIDATER)
        spec = importlib.util.spec_from_file_location("fjv_valider_tidsserie", sti)
        m = importlib.util.module_from_spec(spec)
        # dataclasses (med `from __future__ import annotations`) slår modulet op i
        # sys.modules under udførelsen - det skal være registreret først.
        import sys
        sys.modules[spec.name] = m
        spec.loader.exec_module(m)
        _MODUL = m
    return _MODUL


def krav() -> dict:
    global _KRAV
    if _KRAV is None:
        sti = _find("data_krav.json", [HER, HER.parent.parent / "viden"])
        _KRAV = json.loads(sti.read_text(encoding="utf-8"))
    return _KRAV


def kilder() -> dict:
    """Hvilke filer reglerne kom fra (til rapporten: "hvilke regler kørte?")."""
    import hashlib
    ud = {}
    for navn, mapper in (("valider_tidsserie.py", _KANDIDATER),
                         ("data_krav.json", [HER, HER.parent.parent / "viden"])):
        try:
            p = _find(navn, mapper)
            ud[navn] = hashlib.sha256(p.read_bytes()).hexdigest()[:16]
        except FileNotFoundError:
            ud[navn] = "MANGLER"
    ud["version"] = krav().get("version") if ud.get("data_krav.json") != "MANGLER" else None
    return ud


class Valideret:
    """Oraklets ``Resultat`` i den form, ``tidsserie_db.indsaet_tidsserie`` skriver."""

    def __init__(self, r):
        self.status = r.status
        self.data = r.data
        self.sha256 = r.sha256
        self.validering = r.validering
        v = r.validering
        self.start = v.get("start")
        self.slut = v.get("slut")
        self.antal_raekker = v.get("antal_raekker") or 0
        self.antal_huller = v.get("antal_huller") or 0


def valider(tekst: str, rolle: str, *, tidszone: str = "UTC", tidsstempel: str = "start",
            kolonne: str | None = None, vaerk: dict | None = None) -> Valideret:
    return Valideret(orakel().valider(tekst, rolle, tidszone=tidszone, tidsstempel=tidsstempel,
                                      kolonne=kolonne, vaerk=vaerk, k=krav()))


def tjek_koersel(validering_start: str, validering_slut: str, rolle: str, start: str, slut: str,
                 punkter: list, vaerk: dict | None) -> list[dict]:
    """Oraklets kørselsregler med de EKSAKTE punkter fra den frosne fil."""
    return orakel().tjek_koersel({"start": validering_start, "slut": validering_slut}, rolle,
                                 start, slut, vaerk=vaerk, punkter=punkter, k=krav())
