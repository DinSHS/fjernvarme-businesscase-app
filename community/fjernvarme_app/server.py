"""HTTP-serveren: REST-API'et (``API.md``) + den færdigbyggede frontend. Kun standardbiblioteket.

Én proces, én bruger (``--bruger``/``FJV_BRUGER``). Bag en reverse proxy kan brugeren i stedet komme fra en
header (``--bruger-header X-Forwarded-Email``) — se README; multi-bruger er ikke bygget.

Lytter som standard kun på 127.0.0.1: appen har ingen login, så den skal ikke stå åben på et netværk.
"""

from __future__ import annotations

import json
import mimetypes
import sys
import traceback
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from . import __version__
from .data_api import DataApi, Fejl

MAKS_KROP = 8 * 1024 * 1024        # uploads er base64 af højst 2,9 MB (CSV) / 2,5 MB (xlsx) — se API.md

# Windows' register kan give .js som text/plain, hvilket browseren afviser for moduler.
for _endelse, _typ in ((".js", "text/javascript"), (".mjs", "text/javascript"), (".css", "text/css"),
                       (".svg", "image/svg+xml"), (".json", "application/json"), (".woff2", "font/woff2"),
                       (".md", "text/markdown")):
    mimetypes.add_type(_typ, _endelse)


#: Navne, der altid peger på denne maskine. Andre værtsnavne (en proxy, et LAN-navn) skal tillades eksplicit.
LOOPBACK_NAVNE = frozenset({"localhost", "127.0.0.1", "::1", "[::1]"})
CSRF_COOKIE = "fjv_csrf"
JSON_TYPER = ("application/json",)
PAKKE_TYPER = ("application/zip", "application/octet-stream", "application/x-zip-compressed")


class App:
    """Alt serveren har brug for. Bygges af ``cli.byg_app``."""

    def __init__(self, *, db, skema, datamappe: Path, files: Path, bruger: str, motor,
                 bruger_header: str | None = None, model_python: str | None = None,
                 tilladte_vaerter=(), tilladte_oprindelser=()):
        import secrets
        self.db, self.skema = db, skema
        self.datamappe, self.files = Path(datamappe), Path(files)
        self.bruger, self.bruger_header = bruger, bruger_header
        self.motor = motor
        self.model_python = model_python
        self.data = DataApi(db, skema)
        self.tilladte_vaerter = LOOPBACK_NAVNE | {v.strip().lower() for v in tilladte_vaerter if v.strip()}
        self.tilladte_oprindelser = {o.strip().rstrip("/").lower() for o in tilladte_oprindelser if o.strip()}
        #: Ny pr. serverstart. Sættes som SameSite=Strict-cookie på siden og /api/session; skrivninger kræver den (K6-F9).
        self.csrf = secrets.token_urlsafe(32)

    def session(self, bruger: str) -> dict:
        return {"bruger": bruger, "udgave": "community", "version": __version__,
                "skemaversion": self.skema.version}


def _json(handler, status: int, krop) -> None:
    data = json.dumps(krop, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(data)


def _q_json(q: dict, navn: str):
    v = q.get(navn)
    if not v:
        return None
    try:
        return json.loads(v[0])
    except json.JSONDecodeError:
        raise Fejl(400, "ugyldig", f"{navn} er ikke gyldig JSON") from None


class Handler(BaseHTTPRequestHandler):
    app: App = None                     # sættes af lav_server
    server_version = "fjernvarme_app/" + __version__
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # kort log på stderr, uden forespørgslens krop
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

    # -------------------------------------------------- hjælpere
    def _bruger(self) -> str:
        if self.app.bruger_header:
            v = (self.headers.get(self.app.bruger_header) or "").strip()
            if not v:
                raise Fejl(401, "policy", f"Ingen bruger i headeren {self.app.bruger_header}.")
            return v[:200]
        return self.app.bruger

    def _krop(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAKS_KROP:
            raise Fejl(413, "ugyldig", f"Forespørgslen er for stor ({n} bytes; højst {MAKS_KROP}).")
        raa = self.rfile.read(n) if n else b""
        return raa

    def _krop_json(self):
        raa = self._krop()
        if not raa:
            return {}
        try:
            return json.loads(raa.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise Fejl(400, "ugyldig", "kroppen er ikke gyldig JSON") from None

    def _svar_fejl(self, e: Exception) -> None:
        if isinstance(e, Fejl):
            _json(self, e.status, {"fejl": {"kode": e.kode, "besked": e.besked}})
            return
        traceback.print_exc()
        _json(self, 500, {"fejl": {"kode": "teknisk", "besked": f"Teknisk fejl: {type(e).__name__}: {e}"[:1900]}})

    # -------------------------------------------------- oprindelse (K6-F9)
    def end_headers(self):
        if getattr(self, "_cookie", False):
            self.send_header("Set-Cookie", f"{CSRF_COOKIE}={self.app.csrf}; Path=/; SameSite=Strict; HttpOnly")
        super().end_headers()

    def _vaert(self) -> str:
        """``Host`` uden port, små bogstaver (``[::1]:8000`` -> ``[::1]``)."""
        h = (self.headers.get("Host") or "").strip().lower()
        if h.startswith("["):
            return h[: h.find("]") + 1] if "]" in h else h
        return h.rsplit(":", 1)[0] if h.count(":") == 1 else h

    def _tjek_oprindelse(self, metode: str, api: bool, sti: str) -> None:
        """Mod DNS-rebinding: Host skal være et tilladt navn — på ALLE forespørgsler. Mod CSRF ved skrivning:
        en ``Origin`` skal være siden selv (= ``Host``) eller tilladt, ``Sec-Fetch-Site`` må ikke være
        ``cross-site``/``same-site``, medietypen skal være den forventede, og sessionscookien (SameSite=Strict) skal
        følge med. En fremmed side kan hverken sende cookien eller læse den."""
        if self._vaert() not in self.app.tilladte_vaerter:
            raise Fejl(403, "ikke_tilladt", f"Værten {self.headers.get('Host')!r} er ikke tilladt. Brug localhost, eller "
                                            "start serveren med --tilladt-vaert <navn> (fx bag en proxy).")
        if metode == "GET" or not api:
            return
        oprindelse = (self.headers.get("Origin") or "").strip().rstrip("/").lower()
        if oprindelse:
            egen = {f"http://{self.headers.get('Host', '').lower()}", f"https://{self.headers.get('Host', '').lower()}"}
            if oprindelse not in egen and oprindelse not in self.app.tilladte_oprindelser:
                raise Fejl(403, "ikke_tilladt", f"Skrivning fra oprindelsen {oprindelse!r} er ikke tilladt.")
        if (self.headers.get("Sec-Fetch-Site") or "").lower() in ("cross-site", "same-site"):
            raise Fejl(403, "ikke_tilladt", "Skrivning fra en anden side er ikke tilladt.")
        typ = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        forventet = PAKKE_TYPER if sti == "/api/import/vaerk" else JSON_TYPER
        # En DELETE uden krop (fv-app's adapter sender ingen) kan ikke være en "simpel" tværsidig forespørgsel —
        # browseren forhåndstjekker den, og serveren svarer ikke på OPTIONS. Cookien kræves stadig.
        uden_krop = metode == "DELETE" and int(self.headers.get("Content-Length") or 0) == 0
        if not uden_krop and typ not in forventet:
            raise Fejl(403, "ikke_tilladt", f"Skrivninger kræver Content-Type {forventet[0]} (fik {typ or 'ingen'}).")
        import hmac
        from http.cookies import CookieError, SimpleCookie
        try:
            c = SimpleCookie(self.headers.get("Cookie") or "")
        except CookieError:
            c = SimpleCookie()
        if CSRF_COOKIE not in c or not hmac.compare_digest(c[CSRF_COOKIE].value, self.app.csrf):
            raise Fejl(403, "ikke_tilladt", "Sessionen mangler eller er udløbet (serveren er genstartet). Genindlæs siden.")

    def _rute(self, metode: str) -> None:
        url = urlparse(self.path)
        dele = [unquote(d) for d in url.path.split("/") if d]
        self._cookie = False
        try:
            self._tjek_oprindelse(metode, dele[:1] == ["api"], url.path)
            if dele[:1] == ["api"]:
                self._api(metode, dele[1:], parse_qs(url.query))
            elif metode == "GET":
                self._statisk(url.path)
            else:
                raise Fejl(404, "findes_ikke", "ukendt sti")
        except Exception as e:  # noqa: BLE001 — alt skal ende som et læsbart svar
            try:
                self._svar_fejl(e)
            except Exception:
                pass

    def do_GET(self):
        self._rute("GET")

    def do_POST(self):
        self._rute("POST")

    def do_PATCH(self):
        self._rute("PATCH")

    def do_DELETE(self):
        self._rute("DELETE")

    # -------------------------------------------------- API
    def _api(self, metode: str, dele: list[str], q: dict) -> None:
        from . import funktioner, om, pakke_vaerk
        app = self.app
        if dele == ["session"] and metode == "GET":
            self._cookie = True                      # sessionscookien til skrivninger (K6-F9)
            return _json(self, 200, app.session(self._bruger()))
        if dele == ["om"] and metode == "GET":
            return _json(self, 200, om.om(app))
        if len(dele) >= 2 and dele[0] == "data":
            ent = dele[1]
            if metode == "GET" and len(dele) == 2:
                felter = q.get("fields", [None])[0]
                return _json(self, 200, app.data.laes(
                    ent, filter_=_q_json(q, "filter"), orden=_q_json(q, "orderBy"),
                    first=q.get("first", [None])[0], after=q.get("after", [None])[0],
                    felter=[f for f in felter.split(",") if f] if felter else None))
            if metode == "GET" and len(dele) == 3:
                return _json(self, 200, app.data.laes_en(ent, dele[2]))
            if metode == "POST" and len(dele) == 2:
                return _json(self, 201, app.data.opret(ent, self._krop_json(), self._bruger()))
            if metode == "PATCH" and len(dele) == 3:
                return _json(self, 200, app.data.opdater(ent, dele[2], self._krop_json(), self._bruger()))
            if metode == "DELETE" and len(dele) == 3:
                return _json(self, 200, app.data.slet(ent, dele[2], self._bruger()))
        if len(dele) == 2 and dele[0] == "fn" and metode == "POST":
            return _json(self, 200, funktioner.kald(app, dele[1], self._krop_json(), self._bruger()))
        if dele[:2] == ["eksport", "vaerk"] and len(dele) == 3 and metode == "GET":
            data, navn = pakke_vaerk.eksporter(app, dele[2])
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Disposition", f'attachment; filename="{navn}"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if dele == ["import", "vaerk"] and metode == "POST":
            return _json(self, 200, pakke_vaerk.importer(app, self._krop(), self._bruger(),
                                                        ny_kode=q.get("kode", [None])[0]))
        raise Fejl(404, "findes_ikke", f"ukendt API-sti /api/{'/'.join(dele)}")

    # -------------------------------------------------- frontend
    def _statisk(self, sti: str) -> None:
        from . import miljoe
        rod = miljoe.web_rod()
        self._cookie = True                          # siden selv får sessionscookien (K6-F9)
        if rod is None:
            krop = ("<!doctype html><meta charset=utf-8><title>Fjernvarme Businesscase</title>"
                    "<p>Frontenden er ikke bygget ind i denne installation. API'et kører på <code>/api</code> "
                    "(se API.md).</p><p>Bygger på <a href='https://github.com/skj-1964/fjernvarme-businesscase'>"
                    "fjernvarme-businesscase</a> af skj-1964 (MIT).</p>").encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(krop)))
            self.end_headers()
            self.wfile.write(krop)
            return
        rel = unquote(sti).lstrip("/") or "index.html"
        fil = (rod / rel).resolve()
        if rod.resolve() not in fil.parents and fil != rod.resolve():
            raise Fejl(404, "findes_ikke", "ukendt sti")
        if not fil.is_file():
            fil = rod / "index.html"                # hash-routing: alt andet er appen
        data = fil.read_bytes()
        typ = mimetypes.guess_type(fil.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", typ + ("; charset=utf-8" if typ.startswith("text/") or typ.endswith("javascript") else ""))
        self.send_header("Content-Length", str(len(data)))
        if fil.name != "index.html":
            self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
        self.wfile.write(data)


class _Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        # En browser, der lukker fanen midt i et svar, er ikke en serverfejl (målt: WinError 10054 under layout-tjek).
        if isinstance(sys.exc_info()[1], (ConnectionResetError, BrokenPipeError, ConnectionAbortedError)):
            return
        super().handle_error(request, client_address)


def lav_server(app: App, vaert: str = "127.0.0.1", port: int = 8000) -> ThreadingHTTPServer:
    h = type("FjvHandler", (Handler,), {"app": app})
    s = _Server((vaert, port), h)
    s.daemon_threads = True
    return s


def status_tekst(kode: int) -> str:
    return HTTPStatus(kode).phrase
