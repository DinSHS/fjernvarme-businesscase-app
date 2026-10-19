#!/usr/bin/env python3
"""scripts/tjek.py - repoets gate: intet organisationsspecifikt og intet manglende kredit maa kunne committes ved en fejl.

    python scripts/tjek.py                 # hele repoet: forbudslister + kreditkrav (det, CI og `npm run tjek` koerer)
    python scripts/tjek.py --staged        # kun det, der er staget (indeholdet i indekset) - det hurtige tjek i pre-commit-hooken
    python scripts/tjek.py --installer-hook   # saet `git config core.hooksPath scripts/hooks` (en gang pr. kopi)

Forbudslisten er foreningen af tre ting: den generiske liste i repoet (offentlig/forbud.generisk.json), den lokale liste
(config/forbud.lokal.json, git-ignoreret) og VAERDIERNE i den lokale installation (config/installation.json, git-ignoreret). Det er
det samme `tjek_offentlig.py`, bare med `--repo`; se SYNKRONISERING.md. Kun standardbibliotek, intet netvaerk.
"""
import subprocess
import sys
from pathlib import Path

HER = Path(__file__).resolve().parent
REPO = HER.parent
sys.path.insert(0, str(REPO))
import tjek_offentlig as T  # noqa: E402


def installer_hook(rod: Path) -> int:
    if not (rod / ".git").exists():
        print(f"FEJL: {rod} er ikke et git-repo - ingen hook at saette", file=sys.stderr)
        return 2
    if not (rod / "scripts" / "hooks" / "pre-commit").is_file():
        print("FEJL: scripts/hooks/pre-commit findes ikke", file=sys.stderr)
        return 2
    r = subprocess.run(["git", "-C", str(rod), "config", "core.hooksPath", "scripts/hooks"], capture_output=True, text=True)
    if r.returncode != 0:
        print("FEJL: git config fejlede: " + r.stderr.strip(), file=sys.stderr)
        return 2
    print("pre-commit-hooken er sat (core.hooksPath = scripts/hooks). Et commit koerer nu `scripts/tjek.py --staged`.")
    return 0


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    rod = REPO
    if "--rod" in argv:
        rod = Path(argv[argv.index("--rod") + 1]).resolve()
    if "--installer-hook" in argv:
        return installer_hook(rod)
    return T.main(["--repo", *argv])


if __name__ == "__main__":
    sys.exit(main())
