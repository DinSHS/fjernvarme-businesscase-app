"""Fabric-installationens binding: workspace og lakehouse. LAESES fra den lokale, git-ignorerede `config/installation.json`.

Organisationsspecifikke vaerdier (workspace-, lakehouse-, database-, notebook-id'er, servernavn, redirect-adresser) staar ALDRIG i
repoet. De staar i `config/installation.json` (git-ignoreret; skabelon: `config/installation.eksempel.json`) - eller i den fil,
miljoevariablen `FJV_INSTALLATION` peger paa, hvis du driver flere installationer fra samme kopi. Udrulningsvaerktoejerne
(`deploy.py`, `byg.py`) og `scripts/installation.py` laeser herfra; motorpakken `fjv/` kender ingen af vaerdierne.

Mangler filen eller et paakraevet felt, stopper importen med en forklaring (se doc/FABRIC.md, afsnittet "Din installation").
"""
import json
import os
import re
import sys
from pathlib import Path

HER = Path(__file__).resolve().parent
REPO = HER.parent
STI = Path(os.environ.get("FJV_INSTALLATION") or (REPO / "config" / "installation.json"))
KRAEVET = ("workspace_navn", "workspace_id", "lakehouse_navn", "lakehouse_id")
ID_FELTER = ("workspace_id", "lakehouse_id")
_GUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def _stop(tekst: str):
    raise SystemExit(f"fabric_miljoe: {tekst}\n"
                     f"Se doc/FABRIC.md (afsnittet 'Din installation'). Kopier config/installation.eksempel.json til "
                     f"config/installation.json og udfyld den; filen er git-ignoreret.")


def laes(sti: Path = STI) -> dict:
    """Laes og valider installationen. Rejser SystemExit med en dansk forklaring, hvis noget mangler."""
    sti = Path(sti)
    if not sti.is_file():
        _stop(f"findes ikke: {sti}")
    try:
        d = json.loads(sti.read_text(encoding="utf-8"))
    except ValueError as e:
        _stop(f"{sti} er ikke gyldig JSON ({e})")
    mangler = [k for k in KRAEVET if not isinstance(d.get(k), str) or not d[k].strip() or d[k].lstrip().startswith("<")]
    if mangler:
        _stop(f"{sti} mangler eller har pladsholdere i: {', '.join(mangler)}")
    for k in ID_FELTER:
        if not _GUID.match(d[k].strip()):
            _stop(f"{k} i {sti} ligner ikke et id (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)")
    return d


INSTALLATION = laes()
WORKSPACE_NAVN = INSTALLATION["workspace_navn"].strip()
WORKSPACE_ID = INSTALLATION["workspace_id"].strip()
LAKEHOUSE_NAVN = INSTALLATION["lakehouse_navn"].strip()
LAKEHOUSE_ID = INSTALLATION["lakehouse_id"].strip()
