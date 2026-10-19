"""go-sqlcmd med Entra-login, uden go-sqlcmd's 10-sekunders grænse på ``az`` (kun dev-maskinen).

**Fejlen:** ``sqlcmd --authentication-method ActiveDirectoryAzCli`` kalder selv
``az account get-access-token`` og giver op efter ca. 10 s. På Windows dræbes ``az`` så med
exit-kode 1 og tom stderr, og det eneste, man ser, er *"AzureCLICredential: exit status 1"*.
På denne maskine tager ``az`` 4-19 s afhængigt af belastningen (målt 2026-10-16), så fejlen
kommer og går - uafhængigt af, om sqlcmd startes fra en shell eller fra Python. Reproduceret:
en ``az``, der er forsinket 3 s, virker; forsinket 15 s giver præcis den fejl.

**Rettelsen:** hent tokenet selv med den rigtige ``az`` (ingen kort tidsgrænse, og ``az``'s
egen fejltekst vises - fx at ``az login --scope …`` er nødvendig), og giv sqlcmd en
``az.cmd`` forrest i PATH, der straks svarer med det hentede svar. Tokenet ligger kun i
underprocessens miljø (``FJV_AZ_SVAR``), aldrig i en fil; skim-mappen slettes bagefter.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile

RESSOURCE = "https://database.windows.net/"
#: Tegn, cmd tolker efter at have udfoldet ``%FJV_AZ_SVAR%`` (et JWT og ISO-tider har ingen).
_FARLIGE = set("&|<>^\r\n")


class AzFejl(RuntimeError):
    """``az`` kunne ikke give et token - beskeden er ``az``'s egen."""


def hent_az_svar(az: str | None = None, timeout_s: float = 180) -> str:
    """``az account get-access-token`` som én linje JSON (præcis det sqlcmd selv ville have fået)."""
    az = az or shutil.which("az")
    if not az:
        raise AzFejl("az (Azure CLI) findes ikke på PATH")
    try:
        r = subprocess.run([az, "account", "get-access-token", "--output", "json", "--resource", RESSOURCE],
                           capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=timeout_s)
    except subprocess.TimeoutExpired as e:
        raise AzFejl(f"az svarede ikke inden for {timeout_s:.0f} s") from e
    if r.returncode != 0:
        tekst = (r.stderr or r.stdout or "").strip()
        raise AzFejl(f"az account get-access-token fejlede (exit {r.returncode}): {tekst[-1500:]}")
    try:
        d = json.loads(r.stdout)
    except ValueError as e:
        raise AzFejl(f"az gav ikke JSON: {r.stdout[:200]!r}") from e
    if not d.get("accessToken"):
        raise AzFejl("az gav intet accessToken")
    linje = json.dumps(d, separators=(",", ":"))
    if _FARLIGE & set(linje):
        raise AzFejl("az's svar indeholder tegn, cmd ikke kan videregive uændret")
    return linje


def skim_mappe() -> str:
    """En mappe med ``az.cmd``, der udskriver ``%FJV_AZ_SVAR%`` - uanset argumenter."""
    d = tempfile.mkdtemp(prefix="fjv_azskim_")
    with open(os.path.join(d, "az.cmd"), "w", encoding="ascii", newline="\r\n") as f:
        f.write("@echo %FJV_AZ_SVAR%\n")
    return d


def sqlcmd_miljoe(svar: str, mappe: str, miljoe: dict | None = None) -> dict:
    m = dict(os.environ if miljoe is None else miljoe)
    m["FJV_AZ_SVAR"] = svar
    m["PATH"] = mappe + os.pathsep + m.get("PATH", "")
    return m


def koer_sqlcmd(server: str, database: str, sql: str, *, az: str | None = None,
                sqlcmd: str = "sqlcmd", ekstra: tuple = ("-y", "0", "-b")) -> subprocess.CompletedProcess:
    """``sqlcmd -Q sql`` med ``ActiveDirectoryAzCli`` - tokenet hentet af os selv (se modulet)."""
    argv = [sqlcmd, "-S", server, "-d", database, "--authentication-method", "ActiveDirectoryAzCli",
            *ekstra, "-Q", sql]
    if os.name != "nt":                          # skimmet er en .cmd; uden for Windows: som før
        return subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", errors="replace")
    svar = hent_az_svar(az)
    mappe = skim_mappe()
    try:
        return subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", errors="replace",
                              env=sqlcmd_miljoe(svar, mappe))
    finally:
        shutil.rmtree(mappe, ignore_errors=True)
