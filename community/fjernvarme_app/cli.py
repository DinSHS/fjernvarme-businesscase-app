"""Kommandolinjen: ``python -m fjernvarme_app [globale tilvalg] [kommando]``.

Uden kommando startes serveren (``serve``). Se ``--help`` og README.md.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import threading
import webbrowser
from pathlib import Path

from . import __version__


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="fjernvarme_app",
        description="Fjernvarme Businesscase, community-udgaven — en lokal brugerflade til modellen "
                    "github.com/skj-1964/fjernvarme-businesscase (MIT).")
    p.add_argument("--version", action="version", version=f"fjernvarme_app {__version__}")
    p.add_argument("--data", default=os.environ.get("FJV_DATA", "fjernvarme_data"),
                   help="datamappe: database (sqlite), filer, kørsler, logs (standard ./fjernvarme_data)")
    p.add_argument("--db", default=os.environ.get("FJV_DB"),
                   help="SQLAlchemy-URL til egen database, fx postgresql+psycopg://… eller mssql+pyodbc://… "
                        "(standard: sqlite i datamappen)")
    sub = p.add_subparsers(dest="kommando")

    s = sub.add_parser("serve", help="start serveren (standard)")
    _serve_tilvalg(s)
    _serve_tilvalg(p)            # også uden kommando

    a = sub.add_parser("arbejder", help="kør ét arbejderjob (tager solver-låsen og tømmer køen)")
    a.add_argument("--import", dest="import_id", default=None,
                   help="kør værksark-importen i stedet (et import-id, eller '' for hele køen)")
    a.add_argument("--model-python", default=None)

    v = sub.add_parser("valider-db", help="tjek en database (fx skrevet udefra med SQL) mod skemaet")
    v.add_argument("--json", action="store_true", help="fund som JSON")

    e = sub.add_parser("eksport", help="eksportér et værk som pakke (zip)")
    e.add_argument("vaerk", help="værkets kode eller id")
    e.add_argument("fil", help="zip-fil, der skrives")

    i = sub.add_parser("import", help="importér en værkspakke (zip)")
    i.add_argument("fil")
    i.add_argument("--kode", default=None, help="ny kode til værket (standard: pakkens)")
    i.add_argument("--bruger", default=None)

    d = sub.add_parser("ddl", help="udskriv CREATE-scriptet for en dialekt (sqlite|postgresql|mssql)")
    d.add_argument("dialekt", choices=["sqlite", "postgresql", "mssql"])

    sub.add_parser("demo", help="indlæs modelrepoets cases som værker (som --demo) og stop")
    return p


def _liste(env: str) -> list[str]:
    return [x for x in (os.environ.get(env) or "").split(",") if x.strip()]


def er_loopback(vaert: str) -> bool:
    return vaert == "::1" or vaert == "localhost" or vaert.startswith("127.")


def opstartslinjer(vaert: str, port: int, data, bruger: str, bruger_header: str | None) -> list[str]:
    """Hvad serveren skriver ved start (K6-F11): den FAKTISKE bind-adresse, og en tydelig advarsel, når den ikke er
    loopback — appen har intet login, så alle, der kan nå porten, kan læse og skrive."""
    adr = f"[{vaert}]:{port}" if ":" in vaert else f"{vaert}:{port}"
    ud = [f"Fjernvarme Businesscase (community) lytter på {adr}  - data: {data}  - bruger: "
          + (f"fra headeren {bruger_header}" if bruger_header else bruger)]
    if er_loopback(vaert):
        ud.append(f"Åbn http://localhost:{port}")
    else:
        ud += [
            "ADVARSEL: serveren lytter på en adresse, der kan nås fra netværket, og appen har INTET login.",
            "ADVARSEL: alle, der kan nå porten, kan læse og ændre værker og bestille kørsler.",
            (f"ADVARSEL: brugeren tages fra headeren {bruger_header} - den er KUN betroet bag den dokumenterede proxy, "
             "der selv logger ind og overskriver headeren." if bruger_header else
             "ADVARSEL: sæt en reverse proxy med login foran (README: Arkitektur) eller brug --vaert 127.0.0.1."),
            "Andre Host-navne end localhost skal tillades med --tilladt-vaert <navn>.",
        ]
    ud.append("Bygger på github.com/skj-1964/fjernvarme-businesscase (MIT) og github.com/skj-1964/df-data. Stop med Ctrl+C.")
    return ud


def _serve_tilvalg(p):
    p.add_argument("--port", type=int, default=int(os.environ.get("FJV_PORT", "8000")))
    p.add_argument("--vaert", default=os.environ.get("FJV_VAERT", "127.0.0.1"),
                   help="lytteadresse (standard 127.0.0.1 — appen har intet login)")
    p.add_argument("--bruger", default=os.environ.get("FJV_BRUGER"),
                   help="brugerens identitet i revisionsspor og bestillinger (standard <login>@lokal)")
    p.add_argument("--bruger-header", default=os.environ.get("FJV_BRUGER_HEADER"),
                   help="tag brugeren fra denne header (bag en reverse proxy, fx X-Forwarded-Email)")
    p.add_argument("--demo", action="store_true", help="indlæs modelrepoets cases som værker ved start")
    p.add_argument("--modelrepo", default=None, help="lokal kopi af modelrepoet til --demo (i stedet for zip)")
    p.add_argument("--model-python", default=os.environ.get("FJV_PYTHON"),
                   help="Python med modellens pakker (standard: denne, hvis den har dem; ellers bygges et venv)")
    p.add_argument("--uden-arbejder", action="store_true", help="start ikke arbejder-processer automatisk")
    p.add_argument("--tilladt-vaert", action="append", default=_liste("FJV_TILLADTE_VAERTER"),
                   help="et ekstra tilladt Host-navn (fx proxyens offentlige navn); kan gentages. localhost er altid tilladt")
    p.add_argument("--tilladt-oprindelse", action="append", default=_liste("FJV_TILLADTE_OPRINDELSER"),
                   help="en ekstra tilladt Origin for skrivninger (fx http://localhost:5173 for en dev-proxy)")
    p.add_argument("--ikke-aaben", action="store_true", help="åbn ikke browseren")


def byg_app(data: str, db_url: str | None, *, bruger: str | None = None, bruger_header: str | None = None,
            tilladte_vaerter=(), tilladte_oprindelser=(),
            model_python: str | None = None, start_processer: bool = True, opret: bool = True):
    from . import miljoe
    datamappe = Path(data).resolve()
    files = miljoe.forbered(datamappe)
    from . import skema as S
    from .database import Database, sqlite_url
    from .motor import Motor
    from .server import App
    url = db_url or sqlite_url(datamappe / "fjernvarme.db")
    sk = S.laes()
    db = Database(url, sk)
    if opret:
        db.opret()
    db.kontroller()
    motor = Motor(db, datamappe, url, model_python=model_python, start_processer=start_processer)
    return App(db=db, skema=sk, datamappe=datamappe, files=files,
               bruger=(bruger or f"{getpass.getuser()}@lokal")[:200], motor=motor,
               bruger_header=bruger_header, model_python=model_python,
               tilladte_vaerter=tilladte_vaerter, tilladte_oprindelser=tilladte_oprindelser)


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        # line_buffering: en server, hvis stdout er omdirigeret til en log, skal skrive linjerne, når de sker.
        sys.stdout.reconfigure(errors="replace", line_buffering=True)
        sys.stderr.reconfigure(errors="replace", line_buffering=True)
    from .data_api import Fejl
    try:
        return _main(_parser().parse_args(argv))
    except Fejl as e:
        print(f"Afvist: {e.besked}", file=sys.stderr)
        return 2
    except RuntimeError as e:
        print(f"Fejl: {e}", file=sys.stderr)
        return 2


def _main(a) -> int:
    k = a.kommando or "serve"

    if k == "ddl":
        from . import skema as S
        sys.stdout.write(S.ddl(a.dialekt))
        return 0
    if k == "valider-db":
        from . import valider_db
        app = byg_app(a.data, a.db, opret=False, start_processer=False)
        fund = valider_db.valider(app)
        if a.json:
            print(json.dumps(fund, ensure_ascii=False, indent=1))
        else:
            print(valider_db.tekst(fund))
        return 1 if any(f["niveau"] == "fejl" for f in fund) else 0
    if k == "arbejder":
        from . import arbejder_proces
        app = byg_app(a.data, a.db, start_processer=False, model_python=a.model_python)
        d = arbejder_proces.koer(app, a.import_id)
        print(json.dumps({x: d.get(x) for x in ("ok", "tilstand", "undtagelse")}, ensure_ascii=False,
                         default=str)[:4000])
        return 0 if d.get("ok") else 1
    if k == "eksport":
        from . import pakke_vaerk
        app = byg_app(a.data, a.db, start_processer=False)
        data, navn = pakke_vaerk.eksporter(app, a.vaerk)
        Path(a.fil).write_bytes(data)
        print(f"{navn}: {len(data)} bytes -> {a.fil}")
        return 0
    if k == "import":
        from . import pakke_vaerk
        app = byg_app(a.data, a.db, start_processer=False)
        r = pakke_vaerk.importer(app, Path(a.fil).read_bytes(), a.bruger or app.bruger, ny_kode=a.kode)
        print(json.dumps(r, ensure_ascii=False, indent=1))
        return 0 if r.get("ok") else 1
    if k == "demo":
        from . import demo
        app = byg_app(a.data, a.db, start_processer=False)
        for r in demo.importer_cases(app.db):
            print(r.get("kode"), r.get("udfald"))
        return 0

    # serve
    vaerter = list(a.tilladt_vaert or [])
    if not er_loopback(a.vaert) and a.vaert not in ("0.0.0.0", "::"):
        vaerter.append(a.vaert)                  # en bundet IP-adresse er sit eget Host-navn
    app = byg_app(a.data, a.db, bruger=a.bruger, bruger_header=a.bruger_header, model_python=a.model_python,
                  start_processer=not a.uden_arbejder, tilladte_vaerter=vaerter,
                  tilladte_oprindelser=a.tilladt_oprindelse or [])
    if a.demo:
        from . import demo
        demo.importer_cases(app.db, Path(a.modelrepo) if a.modelrepo else None)
    from .server import lav_server
    s = lav_server(app, a.vaert, a.port)
    port = s.server_address[1]
    url = f"http://localhost:{port}" if er_loopback(a.vaert) or a.vaert in ("0.0.0.0", "::") else f"http://{a.vaert}:{port}"
    for linje in opstartslinjer(a.vaert, port, app.datamappe, app.bruger, a.bruger_header):
        print(linje, file=sys.stderr if linje.startswith("ADVARSEL") else sys.stdout)
    try:
        app.motor.afstem()           # ryd op efter en tidligere afbrudt server, start kø
    except Exception as e:
        print("afstem ved start fejlede:", e)
    if not a.ikke_aaben:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        s.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        s.server_close()
    return 0
