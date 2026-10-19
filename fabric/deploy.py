#!/usr/bin/env python3
"""Udrul og kør regnemotoren i dit Fabric-workspace (config/installation.json) — og intet andet sted.

    python deploy.py --tor <kommando>           # TØR: vis hvert fab-kald, udfør intet

    python deploy.py kode                       # fjv/*.py -> Files/fjv/motor/fjv/
    python deploy.py notebook fjv_selvtest      # byg + importér item
    python deploy.py koer fjv_selvtest          # fab job run (headless)
    python deploy.py koer fjv_koer_scenarie "vaerk_kode:string=andeby,start:string=2026-01-05"
    python deploy.py db                         # skriv databasebindingen Files/fjv/konfig/db.json fra installationen
    python deploy.py rapport fjv_selvtest       # læs Files/_run/<navn>.json
    python deploy.py hent <Files/...> <lokal>   # hent én fil fra lakehouset
    python deploy.py ls <Files/...>             # list en mappe i lakehouset
    python deploy.py eksport fjv_selvtest       # eksportér itemet (tjek metadata)
    python deploy.py upload <lokal> <Files/...> # læg én fil i lakehouset

Mønstret er husets (et tilsvarende udrulningsvaerktoej): koden ligger som én delt
kopi i lakehouset, notebooks importeres som item-mapper med ``.platform`` +
``notebook-content.ipynb``, og hver notebook skriver sin egen rapport. Upload
sker med ``fab cp`` (v1.7.0 kan uploade fra lokal disk — husets note om det
modsatte gjaldt v1.6.1).

Workspace, lakehouse og database læses fra den lokale, git-ignorerede ``config/installation.json`` via ``fabric_miljoe.py``
(skabelon: ``config/installation.eksempel.json``; se FABRIC.md). Intet organisationsspecifikt står i koden.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(errors="replace")

HER = Path(__file__).resolve().parent
sys.path.insert(0, str(HER))
from fjv import konstanter as K  # noqa: E402
import fabric_miljoe as MILJOE  # noqa: E402  (laeser config/installation.json; stopper med en forklaring, hvis den mangler)
import byg  # noqa: E402

WORKSPACE = MILJOE.WORKSPACE_NAVN
WS = MILJOE.WORKSPACE_ID
TOR = False  # --tor: vis kommandoerne, udfør intet
FAB = Path(os.environ.get("FJV_FAB") or "fab")  # standard: `fab` paa PATH; FJV_FAB peger paa en fab, der ikke er paa PATH


def fab(*args: str) -> subprocess.CompletedProcess:
    if TOR:
        print("[tor] fab " + " ".join(args))
        return subprocess.CompletedProcess(["fab", *args], 0, stdout="", stderr="")
    return subprocess.run([str(FAB) if FAB.exists() else "fab", *args],
                          capture_output=True, text=True, encoding="utf-8",
                          errors="replace")


LH_STI = f"{WORKSPACE}.Workspace/{MILJOE.LAKEHOUSE_NAVN}.Lakehouse"


def _stage() -> Path:
    """Bracket- og mellemrumsfri temp-mappe til fab cp (husets glob-faelde)."""
    d = Path(tempfile.gettempdir()) / "fjvstage"
    d.mkdir(parents=True, exist_ok=True)
    return d


_MAPPER: set[str] = set()


def _sikr_mappe(rel: str) -> None:
    """``fab mkdir`` er ikke rekursiv, og ``fab cp`` opretter ingen mapper (målt):
    opret hvert niveau under ``Files`` for sig."""
    dele = rel.split("/")
    for i in range(2, len(dele) + 1):
        sti = "/".join(dele[:i])
        if sti in _MAPPER:
            continue
        r = fab("ls", f"{LH_STI}/{sti}")
        if "NotFound" in (r.stdout or "") + (r.stderr or ""):
            fab("mkdir", f"{LH_STI}/{sti}")
        _MAPPER.add(sti)


def upload(data: bytes, rel: str) -> None:
    """Upload via ``fab cp`` (v1.7.0 kan uploade fra lokal disk; v1.6.1 kunne ikke).

    Valgt frem for OneLakes ADLS-API med et ``az``-token, fordi az-tokenet her
    udloeber efter 10 t (conditional access), mens fab's cachede login holder.
    """
    if not data:
        raise SystemExit(f"naegter at uploade tom fil: {rel}")
    if TOR:
        import hashlib
        print(f"[tor] upload {len(data)} bytes (sha256 {hashlib.sha256(data).hexdigest()[:12]}) -> {LH_STI}/{rel}")
        return
    _sikr_mappe(str(Path(rel).parent).replace("\\", "/"))
    lokal = _stage() / Path(rel).name
    lokal.write_bytes(data)
    r = fab("cp", str(lokal), f"{LH_STI}/{rel}", "-f")
    ud = (r.stdout or "") + (r.stderr or "")
    if "Done" not in ud:
        raise SystemExit(f"upload fejlede {rel}: {ud[-500:]}")


def hent(rel: str) -> bytes | None:
    lokal = _stage() / ("hent_" + Path(rel).name)
    if lokal.exists():
        lokal.unlink()
    r = fab("cp", f"{LH_STI}/{rel}", str(lokal), "-f")
    if not lokal.exists():
        return None
    return lokal.read_bytes()


def liste(rel: str) -> list[str]:
    r = fab("ls", f"{LH_STI}/{rel}", "-l")
    return [l for l in (r.stdout or r.stderr or "").splitlines() if l.strip()]


# ------------------------------------------------------------------ kommandoer

def kmd_kode() -> int:
    """Upload præcis ``fjv/*.py`` — ingen tests, intet ``_lokal``."""
    n = 0
    for f in sorted((HER / "fjv").iterdir()):
        if f.suffix != ".py":
            continue
        upload(f.read_bytes(), f"Files/{K.REL_MOTOR}/fjv/{f.name}")
        n += 1
    # Måleregisteret eksekveres af fjv/resultater.py og skal ligge ved pakken.
    upload((HER / "maaleregister.json").read_bytes(),
           f"Files/{K.REL_MOTOR}/fjv/maaleregister.json")
    # fv-data's orakel og regler (KONTRAKT §6d) - ét sæt regler for app og motor. De
    # ligger i viden/ (fv-data ejer dem) og kopieres med som øjebliksbillede, så en
    # kørsels kodeaftryk også siger, hvilke regler den brugte (fjv/datakrav.py).
    import hashlib
    viden = HER.parent / "viden"
    for kilde, navn in ((viden / "vaerktoej" / "valider_tidsserie.py", "valider_tidsserie.py"),
                        (viden / "data_krav.json", "data_krav.json")):
        data = kilde.read_bytes()
        upload(data, f"Files/{K.REL_MOTOR}/fjv/{navn}")
        print(f"  {navn}: sha256 {hashlib.sha256(data).hexdigest()[:16]} ({len(data)} bytes)")
    print(f"kode: {n} moduler + maaleregister.json + orakel -> Files/{K.REL_MOTOR}/fjv/")
    return 0


def db_binding() -> dict:
    """Databasebindingen, notebooks og importer laeser fra lakehouset (Files/fjv/konfig/db.json), skrevet fra installationen."""
    inst = MILJOE.INSTALLATION
    mangler = [k for k in ("sql_server", "sql_database")
               if not isinstance(inst.get(k), str) or not inst[k].strip() or inst[k].strip().startswith("<")]
    if mangler:
        raise SystemExit(f"deploy.py db: config/installation.json mangler eller har pladsholdere i: {', '.join(mangler)} (se FABRIC.md)")
    server = inst["sql_server"].strip()
    return {"server": server if "," in server else server + ",1433", "database": inst["sql_database"].strip()}


def kmd_db() -> int:
    b = db_binding()
    data = json.dumps(b, separators=(",", ":")).encode("utf-8")
    print("db.json-indhold: " + data.decode("utf-8"))
    upload(data, f"Files/{K.REL_KONFIG}/db.json")
    print(f"db: bindingen er skrevet til Files/{K.REL_KONFIG}/db.json")
    return 0


def kmd_notebook(navn: str) -> int:
    item = byg.byg_en(navn)
    # Brackets/mellemrum i kildestien knækker fab import (husets fælde) — stage
    # derfor gennem en simpel temp-mappe.
    stage = Path(tempfile.mkdtemp(prefix="fjvbyg_")) / f"{navn}.Notebook"
    stage.mkdir(parents=True)
    for f in item.iterdir():
        (stage / f.name).write_bytes(f.read_bytes())
    r = fab("import", f"{WORKSPACE}.Workspace/{navn}.Notebook", "-i", str(stage), "-f")
    ud = (r.stdout or "") + (r.stderr or "")
    print(ud.strip()[-600:]) if ud.strip() else None
    return 0 if TOR or "imported" in ud.lower() else 1


def kmd_koer(navn: str, params: str | None, timeout: int = 3600) -> int:
    ekstra = ["-P", params] if params else []
    r = fab("job", "run", f"{WORKSPACE}.Workspace/{navn}.Notebook", *ekstra,
            "--timeout", str(timeout), "--polling_interval", "15")
    ud = (r.stdout or "") + (r.stderr or "")
    print(ud.strip()[-1500:]) if ud.strip() else None
    return 0 if TOR or ("completed" in ud.lower() and "failed" not in ud.lower()) else 1


def kmd_rapport(navn: str) -> int:
    b = hent(f"Files/{K.REL_RUN}/{navn}.json")
    if b is None:
        print("ingen rapport - er notebooken kørt?")
        return 1
    rap = json.loads(b)
    for t in rap.get("trin", []):
        v = json.dumps(t.get("vaerdi"), ensure_ascii=False, default=str)
        print(f"  [{t.get('t_s'):>7}] {t.get('navn'):22} {v[:400]}")
    for felt in ("advarsler", "undtagelse"):
        if rap.get(felt):
            print(f"  {felt}: {rap[felt]}")
    if rap.get("traceback") and not rap.get("ok"):
        print(rap["traceback"][-2500:])
    print(f"\n  OK: {rap.get('ok')}  ({rap.get('sekunder')} s)")
    return 0 if rap.get("ok") else 1


def kmd_eksport(navn: str) -> int:
    mappe = Path(tempfile.mkdtemp(prefix="fjveks_"))
    r = fab("export", f"{WORKSPACE}.Workspace/{navn}.Notebook", "-o", str(mappe), "-f")
    print((r.stdout + r.stderr).strip()[-300:])
    for f in mappe.rglob("notebook-content.*"):
        nb = json.loads(f.read_text(encoding="utf-8"))
        print(f.name, json.dumps(nb.get("metadata"), indent=1)[:1500])
        print("celler:", len(nb.get("cells", [])),
              [c.get("metadata") for c in nb.get("cells", [])][:3])
    return 0


def main(argv: list[str]) -> int:
    global TOR
    if "--tor" in argv:
        TOR = True
        argv = [a for a in argv if a != "--tor"]
    rc = _main(argv)
    if TOR:
        print("\nTOER-KOERSEL: intet er udfoert (ingen fab-kald, ingen upload, ingen import, intet job). Kør igen uden --tor for at udrulle.")
    return rc


def _main(argv: list[str]) -> int:
    if not argv:
        print(__doc__.split("Mønstret")[0])
        return 2
    k, rest = argv[0], argv[1:]
    if k == "kode":
        return kmd_kode()
    if k == "db":
        return kmd_db()
    if k == "notebook":
        return max(kmd_notebook(n) for n in (rest or byg.alle()))
    if k == "koer":
        return kmd_koer(rest[0], rest[1] if len(rest) > 1 else None)
    if k == "rapport":
        return kmd_rapport(rest[0])
    if k == "eksport":
        return kmd_eksport(rest[0])
    if k == "hent":
        b = hent(rest[0])
        if b is None:
            print("findes ikke"); return 1
        Path(rest[1]).parent.mkdir(parents=True, exist_ok=True)
        Path(rest[1]).write_bytes(b)
        print(f"{len(b)} bytes -> {rest[1]}")
        return 0
    if k == "upload":
        upload(Path(rest[0]).read_bytes(), rest[1])
        print("ok")
        return 0
    if k == "ls":
        for linje in liste(rest[0]):
            print(linje)
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
