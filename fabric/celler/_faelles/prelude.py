# --- fjv-prelude (indsat af byg.py i hver notebook; rediger celler/_faelles/prelude.py) ---
# Motorpakken ligger i lakehouset under Files/fjv/motor/fjv/. Den kopieres til
# lokal disk og importeres derfra: mountets (mtime, size) er for groft til
# Pythons bytekode-friskhedstjek, saa gammel .pyc kan ellers skygge for ny kode.
#
# Fejler prelude'en, findes notebookens egen rapport endnu ikke. Derfor skriver
# den selv Files/_run/prelude_fejl.json - ellers er en fejl her usynlig udefra
# (jobs-API'et siger kun "statement execution failures").
import os as _os, sys as _sys, shutil as _shutil, tempfile as _tempfile, json as _json
import traceback as _traceback
from pathlib import Path as _Path

_FILES = _os.environ.get("FJV_FILES") or "/lakehouse/default/Files"
try:
    if hasattr(_sys.stdout, "reconfigure"):      # ipykernels OutStream har den ikke
        _sys.stdout.reconfigure(errors="replace")
    _MOTOR = _Path(_os.environ.get("FJV_MOTOR") or (_Path(_FILES) / "fjv" / "motor")) / "fjv"
    _MOTOR_LOKAL = _Path(_tempfile.gettempdir()) / "fjv_motor"
    _shutil.rmtree(_MOTOR_LOKAL, ignore_errors=True)
    _shutil.copytree(_MOTOR, _MOTOR_LOKAL / "fjv",
                     ignore=_shutil.ignore_patterns("__pycache__", "*.pyc"))
    # Lokalt ligger maaleregister.json ved siden af pakken (fabric/), i lakehouset i den.
    if (_MOTOR.parent / "maaleregister.json").exists():
        _shutil.copyfile(_MOTOR.parent / "maaleregister.json",
                         _MOTOR_LOKAL / "fjv" / "maaleregister.json")
    _sys.dont_write_bytecode = True
    for _m in [m for m in list(_sys.modules) if m == "fjv" or m.startswith("fjv.")]:
        del _sys.modules[_m]
    if str(_MOTOR_LOKAL) not in _sys.path:
        _sys.path.insert(0, str(_MOTOR_LOKAL))
    import fjv as _fjv_test  # noqa: F401  (fejler her, ikke midt i cellen)
except Exception as _fejl:
    try:
        _p = _Path(_FILES) / "_run" / "prelude_fejl.json"
        _p.parent.mkdir(parents=True, exist_ok=True)
        _p.write_text(_json.dumps({
            "fejl": f"{type(_fejl).__name__}: {_fejl}",
            "traceback": _traceback.format_exc(),
            "files_findes": _Path(_FILES).exists(),
            "files_indhold": sorted(str(x) for x in _Path(_FILES).glob("*"))[:50]
                             if _Path(_FILES).exists() else None,
            "cwd": _os.getcwd(), "python": _sys.version,
        }, indent=2), encoding="utf-8")
    finally:
        raise
# --- slut prelude ---
