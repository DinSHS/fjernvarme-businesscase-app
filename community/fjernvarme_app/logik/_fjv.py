"""Adgang til den delte motorpakke ``fjv`` (``fabric/fjv/``) uden at kopiere den (brief 21 pkt. 3).

Er ``fjv`` installeret (pakket af fv-server), bruges den. Ellers i repoets layout: ``<rod>/fabric`` på
``sys.path`` — en RELATIV sti fra denne fil, aldrig en absolut sti til produktmappen.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from fjv import datakrav                                     # noqa: F401
except ImportError:                                               # repoets layout
    _fabric = Path(__file__).resolve().parents[3] / "fabric"
    if (_fabric / "fjv" / "__init__.py").is_file() and str(_fabric) not in sys.path:
        sys.path.insert(0, str(_fabric))
    from fjv import datakrav                                     # noqa: F401,E402

__all__ = ["datakrav"]
