#!/usr/bin/env python3
"""scripts/installation.py - bind repoet til din egen installation (workspace, lakehouse, database, app) uden at committe noget af det.

    python scripts/installation.py vis                 # vis installationen (id'er forkortet)
    python scripts/installation.py paafoer             # skriv vaerdierne ind i konfig.ts og rayfin.yml (lokalt, skip-worktree)
    python scripts/installation.py fjern               # rul konfig.ts og rayfin.yml tilbage til det committede
    python scripts/installation.py rayfin-up [--tor]   # paafoer + `npx rayfin up --workspace-id <id> --yes` i app/
    python scripts/installation.py rayfin-db-apply [--tor]   # `npx rayfin up db apply` i app/

Alt organisationsspecifikt staar i `config/installation.json` (git-ignoreret; skabelon `config/installation.eksempel.json`) - eller i den
fil, `FJV_INSTALLATION` / `--config` peger paa. De to sporede filer, Rayfin bygger fra, har tomme vaerdier/pladsholdere i repoet:
`paafoer` skriver installationens vaerdier ind LOKALT og saetter `git update-index --skip-worktree`, saa de ikke kan committes ved en
fejl; `scripts/tjek.py` (pre-commit) er bagstopperen. Se FABRIC.md. Kun standardbibliotek.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
KONFIG = "app/rayfin/functions/src/konfig.ts"
YML = "app/rayfin/rayfin.yml"
PLADSHOLDER_URI = "<din-app>"
#: (konstant i konfig.ts, sti i installationen, paakraevet)
KONSTANTER = [
    ("WORKSPACE_ID", ("workspace_id",), True),
    ("SQL_SERVER", ("sql_server",), True),
    ("SQL_DATABASE", ("sql_database",), True),
    ("LAKEHOUSE_ID", ("lakehouse_id",), True),
    ("ARBEJDER_NOTEBOOK_ID", ("notebooks", "koer_scenarie"), False),
    ("IMPORTER_NOTEBOOK_ID", ("notebooks", "importer_vaerksark"), False),
]
#: Filer, `rayfin up` kraever, og som derfor er committet (runde 7c: host.json var git-ignoreret, saa en frisk klon
#: udrullede den statiske app og stoppede ved functions - med exitkode 0, se RAYFIN_FEJL).
PAAKRAEVEDE_FILER = ("app/rayfin/functions/host.json",)
#: Fejlsignaturer i `rayfin up`'s output (ordlyden fra rayfin-cli dist/commands/up/up.js). CLI'en returnerer 0 efter flere af dem:
#: en fejlet DAB-apply er ikke-fatal (frontenden udrulles alligevel), og 2026-10-27 sluttede "Deployment failed" ogsaa med 0.
RAYFIN_FEJL = (
    "Deployment failed",
    "Database apply failed",
    "Database configuration failed",
    "Failed to generate DAB configuration",
    "Destructive schema changes detected",
    "Runtime settings failed",
    "Connector apply step failed",
)
GUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


class Stop(Exception):
    """En brugsfejl med en forklaring (exitkode 2)."""


def config_sti(arg=None) -> Path:
    return Path(arg or os.environ.get("FJV_INSTALLATION") or (REPO / "config" / "installation.json"))


def laes(sti: Path) -> dict:
    if not sti.is_file():
        raise Stop(f"findes ikke: {sti}\nKopier config/installation.eksempel.json til config/installation.json og udfyld den (se FABRIC.md, "
                   f"afsnittet 'Din installation'). Filen er git-ignoreret.")
    try:
        return json.loads(sti.read_text(encoding="utf-8"))
    except ValueError as e:
        raise Stop(f"{sti} er ikke gyldig JSON: {e}")


def hent(d: dict, sti: tuple):
    for k in sti:
        d = d.get(k) if isinstance(d, dict) else None
    return d.strip() if isinstance(d, str) else ""


def udfyldt(v: str) -> bool:
    return bool(v) and not v.startswith("<")


def kraev(d: dict, felter) -> None:
    mangler = [".".join(f) for f in felter if not udfyldt(hent(d, f))]
    if mangler:
        raise Stop(f"config/installation.json mangler eller har pladsholdere i: {', '.join(mangler)} (se FABRIC.md)")


def konfig_tekst(tekst: str, d: dict) -> str:
    for navn, sti, _p in KONSTANTER:
        v = hent(d, sti)
        if '"' in v or "\\" in v or "\n" in v:
            raise Stop(f"{'.'.join(sti)} indeholder tegn, der ikke kan skrives som en TypeScript-streng")
        mon = re.compile(r'^(export const ' + navn + r' = )"[^"\n]*";', re.M)
        if len(mon.findall(tekst)) != 1:
            raise Stop(f"{KONFIG}: forventede praecis een 'export const {navn} = \"...\";'")
        tekst = mon.sub(lambda m: f'{m.group(1)}"{v if udfyldt(v) else ""}";', tekst)
    return tekst


def yml_tekst(tekst: str, d: dict) -> str:
    uris = [u.strip() for u in (d.get("app") or {}).get("redirect_uris", []) if isinstance(u, str) and udfyldt(u.strip())]
    if not uris:
        return tekst
    linjer = tekst.split("\n")
    ud, indsat = [], False
    for l in linjer:
        if PLADSHOLDER_URI in l and l.strip().startswith("- "):
            continue  # pladsholderen erstattes af de rigtige adresser
        ud.append(l)
    try:
        start = next(i for i, l in enumerate(ud) if l.strip() == "allowedRedirectUris:")
    except StopIteration:
        raise Stop(f"{YML}: ingen 'allowedRedirectUris:'")
    slut = start
    while slut + 1 < len(ud) and ud[slut + 1].strip().startswith("- "):
        slut += 1
    indrykning = re.match(r"\s*", ud[slut] if slut > start else ud[start]).group(0) + ("" if slut > start else "  ")
    for u in uris:
        if not any(l.strip() == f"- {u}" for l in ud):
            ud.insert(slut + 1, f"{indrykning}- {u}")
            slut += 1
    return "\n".join(ud)


def git(*args, check=False):
    return subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)


def er_git() -> bool:
    return (REPO / ".git").exists()


def skriv_fil(rel: str, ny: str) -> None:
    p = REPO / rel
    gammel = p.read_bytes().decode("utf-8")
    kodning = "\r\n" if "\r\n" in gammel else "\n"
    p.write_bytes(ny.replace("\r\n", "\n").replace("\n", kodning).encode("utf-8"))


def paafoer(sti: Path) -> int:
    d = laes(sti)
    kraev(d, [s for _n, s, p in KONSTANTER if p])
    nyt = {}
    for rel, fn in ((KONFIG, konfig_tekst), (YML, yml_tekst)):
        nyt[rel] = fn((REPO / rel).read_bytes().decode("utf-8").replace("\r\n", "\n"), d)   # alt beregnes foer noget skrives
    for rel, tekst in nyt.items():
        skriv_fil(rel, tekst)
        if er_git():
            git("update-index", "--skip-worktree", rel)
    tomme = [".".join(s) for _n, s, p in KONSTANTER if not p and not udfyldt(hent(d, s))]
    print(f"paafoert: {KONFIG} og {YML} (lokalt{', skip-worktree' if er_git() else ''}). Fjern igen med: python scripts/installation.py fjern")
    if tomme:
        print(f"bemaerk: tomme felter ({', '.join(tomme)}) giver tomme konstanter - en tom arbejder-notebook betyder, at ingen arbejder startes automatisk")
    return 0


def fjern() -> int:
    if not er_git():
        raise Stop("ikke et git-repo: gendan konfig.ts og rayfin.yml fra en frisk kopi")
    for rel in (KONFIG, YML):
        git("update-index", "--no-skip-worktree", rel)
        r = git("checkout", "--", rel)
        if r.returncode != 0:
            raise Stop(f"git checkout {rel} fejlede: {r.stderr.strip()[-200:]}")
    print(f"fjernet: {KONFIG} og {YML} er tilbage til det committede")
    return 0


def maske(v: str) -> str:
    return (v[:8] + "...") if GUID.match(v) or len(v) > 24 else v


def vis(sti: Path) -> int:
    d = laes(sti)

    def ud(prefix, x):
        if isinstance(x, dict):
            for k, v in x.items():
                if not k.startswith("_"):
                    ud(f"{prefix}{k}.", v)
        elif isinstance(x, list):
            for i, v in enumerate(x):
                ud(f"{prefix}{i}.", v)
        elif isinstance(x, str):
            print(f"  {prefix[:-1]:34} {maske(x) if udfyldt(x) else x or '(tom)'}")
    print(f"installation: {sti}")
    ud("", d)
    return 0


def rayfin_fejl(output: str) -> list:
    """Linjerne i `rayfin up`'s output, der melder en fejl (RAYFIN_FEJL eller en linje, der begynder med X-maerket)."""
    return [l.strip() for l in output.splitlines()
            if l.strip() and (any(s in l for s in RAYFIN_FEJL) or l.lstrip().startswith("❌"))]


def tjek_filer() -> None:
    mangler = [rel for rel in PAAKRAEVEDE_FILER if not (REPO / rel).is_file()]
    if mangler:
        raise Stop(f"mangler {', '.join(mangler)} - filen er committet i repoet; hent den med `git checkout -- {mangler[0]}`. "
                   "Uden den udruller `rayfin up` den statiske app og stopper ved functions.")


def npx(args: list, tor: bool) -> int:
    txt = "npx " + " ".join(args)
    print(txt)
    if tor:
        print("[TOER] ikke koert (i app/). Kør uden --tor for at udrulle.")
        return 0
    exe = shutil.which("npx") or shutil.which("npx.cmd")
    if not exe:
        raise Stop("npx findes ikke paa PATH (installer Node.js)")
    # Outputtet vises loebende OG gemmes: CLI'ens exitkode alene siger ikke, om udrulningen lykkedes (RAYFIN_FEJL).
    p = subprocess.Popen([exe, *args], cwd=REPO / "app", stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    opsamlet = []
    for linje in iter(p.stdout.readline, b""):
        t = linje.decode("utf-8", errors="replace")
        opsamlet.append(t)
        sys.stdout.write(t)
        sys.stdout.flush()
    rc = p.wait()
    fejl = rayfin_fejl("".join(opsamlet))
    if fejl:
        print(f"FEJL: `{txt}` meldte en fejl (CLI'ens exitkode {rc}); udrulningen er ikke komplet:", file=sys.stderr)
        for f in fejl[:10]:
            print(f"  {f}", file=sys.stderr)
        return rc or 1
    return rc


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(errors="replace")
        sys.stderr.reconfigure(errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="Bind repoet til din installation uden at committe noget af det.")
    ap.add_argument("--config", help="installationsfil (standard config/installation.json eller $FJV_INSTALLATION)")
    ap.add_argument("kommando", choices=["vis", "paafoer", "fjern", "rayfin-up", "rayfin-db-apply"])
    ap.add_argument("--tor", action="store_true", help="vis kun, hvad der ville ske (rayfin-up, rayfin-db-apply)")
    a = ap.parse_args(argv)
    sti = config_sti(a.config)
    try:
        if a.kommando == "vis":
            return vis(sti)
        if a.kommando == "paafoer":
            return paafoer(sti)
        if a.kommando == "fjern":
            return fjern()
        d = laes(sti)
        if a.kommando == "rayfin-up":
            kraev(d, [s for _n, s, p in KONSTANTER if p])
            tjek_filer()
            if a.tor:
                print("[TOER] ville foerst paafoere konfig.ts og rayfin.yml (python scripts/installation.py paafoer)")
            else:
                paafoer(sti)
            return npx(["rayfin", "up", "--workspace-id", hent(d, ("workspace_id",)), "--yes"], a.tor)
        return npx(["rayfin", "up", "db", "apply"], a.tor)
    except Stop as e:
        print(f"FEJL: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
